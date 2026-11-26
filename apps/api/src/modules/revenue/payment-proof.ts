import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../shared/prisma.js';
import { AppError } from '../../middleware/auth.js';

const MAX_PROOF_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function getProofStorageDir(): string {
  // Resolve consistently inside repo root/storage/private-uploads/payment-proofs
  const cwd = process.cwd();
  const rootDir = cwd.endsWith(`${path.sep}apps${path.sep}api`) ? path.resolve(cwd, '../..') : cwd;
  const dir = path.join(rootDir, 'storage', 'private-uploads', 'payment-proofs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveDocumentProofFromDataUrl(params: {
  module: 'REVENUE_PAYMENT' | 'REVENUE_INVOICE';
  documentType: 'PAYMENT_PROOF' | 'INVOICE_PROOF';
  entityId: string;
  docNumber: string;
  dataUrl: string;
  fileName?: string;
  uploadedById: string;
  uploadedByName: string;
}) {
  const match = params.dataUrl.trim().match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new AppError(400, 'INVALID_PROOF_FILE', 'Format file bukti tidak valid. Unggah JPG, PNG, WebP, atau PDF.');
  }

  const rawMime = match[1].toLowerCase();
  const ext = ALLOWED_MIME_EXT[rawMime];
  if (!ext) {
    throw new AppError(400, 'UNSUPPORTED_PROOF_TYPE', 'Jenis file tidak didukung. Gunakan gambar JPG, PNG, WebP, atau PDF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new AppError(400, 'EMPTY_PROOF_FILE', 'File bukti kosong.');
  }
  if (buffer.length > MAX_PROOF_BYTES) {
    throw new AppError(400, 'PROOF_TOO_LARGE', 'Ukuran file bukti maksimal 4 MB.');
  }

  const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const prefix = params.module === 'REVENUE_INVOICE' ? 'inv-proof' : 'proof';
  const storageKey = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const dir = getProofStorageDir();
  const fullPath = path.join(dir, storageKey);
  fs.writeFileSync(fullPath, buffer);

  const safeDisplayName =
    (params.fileName || `bukti-${params.docNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}.${ext}`).slice(0, 140);

  const previous = await prisma.fileAttachment.findMany({
    where: { module: params.module, entityId: params.entityId, documentType: params.documentType },
  });
  for (const prev of previous) {
    const prevPath = path.join(dir, path.basename(prev.storageKey));
    if (fs.existsSync(prevPath)) {
      try {
        fs.unlinkSync(prevPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  }
  if (previous.length > 0) {
    await prisma.fileAttachment.deleteMany({
      where: { id: { in: previous.map((x) => x.id) } },
    });
  }

  const saved = await prisma.fileAttachment.create({
    data: {
      displayName: safeDisplayName,
      storageKey,
      mimeType: normalizedMime,
      sizeBytes: buffer.length,
      module: params.module,
      entityId: params.entityId,
      documentType: params.documentType,
      verificationStatus: 'VERIFIED',
      uploadedById: params.uploadedById,
      uploadedByName: params.uploadedByName,
    },
  });

  return {
    id: saved.id,
    displayName: saved.displayName,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
    createdAt: saved.createdAt.toISOString(),
  };
}

export async function savePaymentProofFromDataUrl(params: {
  paymentId: string;
  receiptNumber: string;
  dataUrl: string;
  fileName?: string;
  uploadedById: string;
  uploadedByName: string;
}) {
  return saveDocumentProofFromDataUrl({
    module: 'REVENUE_PAYMENT',
    documentType: 'PAYMENT_PROOF',
    entityId: params.paymentId,
    docNumber: params.receiptNumber,
    dataUrl: params.dataUrl,
    fileName: params.fileName,
    uploadedById: params.uploadedById,
    uploadedByName: params.uploadedByName,
  });
}

export async function saveInvoiceProofFromDataUrl(params: {
  invoiceId: string;
  docNumber: string;
  dataUrl: string;
  fileName?: string;
  uploadedById: string;
  uploadedByName: string;
}) {
  return saveDocumentProofFromDataUrl({
    module: 'REVENUE_INVOICE',
    documentType: 'INVOICE_PROOF',
    entityId: params.invoiceId,
    docNumber: params.docNumber,
    dataUrl: params.dataUrl,
    fileName: params.fileName,
    uploadedById: params.uploadedById,
    uploadedByName: params.uploadedByName,
  });
}

async function loadDocumentProofBinary(module: 'REVENUE_PAYMENT' | 'REVENUE_INVOICE', documentType: 'PAYMENT_PROOF' | 'INVOICE_PROOF', entityId: string) {
  const att = await prisma.fileAttachment.findFirst({
    where: { module, entityId, documentType },
    orderBy: { createdAt: 'desc' },
  });
  if (!att) {
    throw new AppError(404, 'PROOF_NOT_FOUND', 'Bukti dokumen belum diunggah untuk transaksi ini.');
  }

  const dir = getProofStorageDir();
  const fullPath = path.join(dir, path.basename(att.storageKey));
  if (!fs.existsSync(fullPath)) {
    throw new AppError(404, 'PROOF_FILE_MISSING', 'File bukti tidak ditemukan di penyimpanan.');
  }

  const buffer = fs.readFileSync(fullPath);
  return {
    attachment: att,
    buffer,
  };
}

export async function loadPaymentProofBinary(paymentId: string) {
  return loadDocumentProofBinary('REVENUE_PAYMENT', 'PAYMENT_PROOF', paymentId);
}

export async function loadInvoiceProofBinary(invoiceId: string) {
  return loadDocumentProofBinary('REVENUE_INVOICE', 'INVOICE_PROOF', invoiceId);
}

async function getDocumentProofMap(module: 'REVENUE_PAYMENT' | 'REVENUE_INVOICE', documentType: 'PAYMENT_PROOF' | 'INVOICE_PROOF', entityIds: string[]) {
  if (entityIds.length === 0) return new Map<string, { id: string; displayName: string; mimeType: string; sizeBytes: number }>();
  const list = await prisma.fileAttachment.findMany({
    where: {
      module,
      documentType,
      entityId: { in: entityIds },
    },
    orderBy: { createdAt: 'desc' },
  });

  const map = new Map<string, { id: string; displayName: string; mimeType: string; sizeBytes: number }>();
  for (const att of list) {
    if (!map.has(att.entityId)) {
      map.set(att.entityId, {
        id: att.id,
        displayName: att.displayName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
      });
    }
  }
  return map;
}

export async function getPaymentProofMap(paymentIds: string[]) {
  return getDocumentProofMap('REVENUE_PAYMENT', 'PAYMENT_PROOF', paymentIds);
}

export async function getInvoiceProofMap(invoiceIds: string[]) {
  return getDocumentProofMap('REVENUE_INVOICE', 'INVOICE_PROOF', invoiceIds);
}
