import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney, mulMoney } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import { AppError, requirePermission, enforceUnitScope } from '../../middleware/auth.js';
import {
  computePtnbhRevenueTax,
  normalizeTaxScheme,
  normalizeCollectorProfile,
  terbilangRupiah,
} from './tax-engine.js';
import {
  buildPenerimaanMonthlyWorkbook,
  buildAgingReceivablesWorkbook,
  type BukuHarianRowExport,
} from './penerimaan-export.js';
import {
  savePaymentProofFromDataUrl,
  loadPaymentProofBinary,
  getPaymentProofMap,
  saveInvoiceProofFromDataUrl,
  loadInvoiceProofBinary,
} from './payment-proof.js';

export const penerimaanRouter = Router();

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatMonthPeriodLabel(monthParam?: string): { start: Date; end: Date; label: string; ym: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y >= 2020 && y <= 2035 && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const label = `${MONTH_NAMES_ID[month - 1]} ${year}`;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return { start, end, label, ym };
}

async function resolveSafeCoa(tx: any, preferred: string, fallback: string): Promise<string> {
  const found = await tx.chartOfAccount.findUnique({ where: { code: preferred } });
  if (found) return preferred;
  const fb = await tx.chartOfAccount.findUnique({ where: { code: fallback } });
  return fb ? fallback : preferred;
}

async function generateOfficialDocNo(tx: any, kind: 'INV' | 'KU' | 'KU-UM' | 'TT', refDate = new Date()): Promise<string> {
  const mm = String(refDate.getMonth() + 1).padStart(2, '0');
  const yyyy = refDate.getFullYear();
  if (kind === 'INV') {
    const rows = await tx.customerInvoice.findMany({ select: { docNumber: true } });
    let maxSeq = rows.length;
    for (const r of rows) {
      const s = String(r.docNumber || '');
      const m = s.match(/^No\.(\d+)\//i) || s.match(/^[A-Z]+-\d{4}-(\d+)$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    let seq = maxSeq + 1;
    let docNumber = `No.${String(seq).padStart(3, '0')}/KU-INV/PMO/${mm}-${yyyy}`;
    while (await tx.customerInvoice.findUnique({ where: { docNumber }, select: { id: true } })) {
      seq++;
      docNumber = `No.${String(seq).padStart(3, '0')}/KU-INV/PMO/${mm}-${yyyy}`;
    }
    return docNumber;
  }

  const rows = await tx.payment.findMany({ select: { receiptNumber: true } });
  let maxSeq = rows.length;
  for (const r of rows) {
    const s = String(r.receiptNumber || '');
    const m = s.match(/^No\.(\d+)\//i) || s.match(/^[A-Z]+-\d{4}-(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
    }
  }
  const prefix = kind === 'KU-UM' ? 'KU-UM' : kind === 'TT' ? 'TT' : 'KU';
  let seq = maxSeq + 1;
  let receiptNumber = `No.${String(seq).padStart(3, '0')}/${prefix}/PMO/${mm}-${yyyy}`;
  while (await tx.payment.findUnique({ where: { receiptNumber }, select: { id: true } })) {
    seq++;
    receiptNumber = `No.${String(seq).padStart(3, '0')}/${prefix}/PMO/${mm}-${yyyy}`;
  }
  return receiptNumber;
}

function getDefaultRevenueCoaForUnit(unitCode?: string | null): string {
  if (unitCode === 'BU-MICE') return '420301070200';
  if (unitCode === 'BU-KLINIK') return '420301069900';
  if (unitCode === 'BU-ITS') return '420301040200';
  if (unitCode === 'BU-TCI') return '420301010200';
  return '420301090100';
}

function getDeferredCoaForUnit(unitCode?: string | null): string {
  if (unitCode === 'BU-ITS') return '210401020500';
  return '210401020900';
}

// Target RAB Pendapatan Cash-Earning Resmi (Sumber: COA PMO per Unit 5 sheet v4.xlsx - Sheet RAB Pendapatan 2027)
const OFFICIAL_UNIT_RAB_TARGETS: Record<string, { unitName: string; annualTarget: number; internalValuation: number }> = {
  'BU-MICE': { unitName: 'Divisi MICE (Wisma, Ballroom & F&B)', annualTarget: 19599150364, internalValuation: 1567932029 },
  'BU-ITS': { unitName: 'Divisi IT Solution', annualTarget: 12776000000, internalValuation: 0 },
  'BU-TCI': { unitName: 'Divisi TCI (Training, Certification & Innovation)', annualTarget: 8050000000, internalValuation: 0 },
  'BU-KLINIK': { unitName: 'Divisi Klinik Pratama', annualTarget: 1387750008, internalValuation: 0 },
};

function inferPreferredMandiriCode(_unitCode?: string | null, _rincianOrTitle?: string | null): 'BNK-MDR-01' {
  return 'BNK-MDR-01'; // Rekening tunggal Bank Mandiri Penerimaan (164-00-2022-999-5)
}

async function resolveDefaultPenerimaanBankAccount(tx: any, unitCode?: string | null, rincianOrTitle?: string | null): Promise<string | null> {
  const preferredCode = inferPreferredMandiriCode(unitCode, rincianOrTitle);
  const preferred = await tx.bankAccount.findFirst({ where: { code: preferredCode, isActive: true } });
  if (preferred) return preferred.id;
  const fallback = await tx.bankAccount.findFirst({
    where: { OR: [{ code: 'BNK-MDR-01' }, { glAccountCode: '110102010100' }] },
  });
  return fallback?.id || null;
}

const REMIND_COOLDOWN_MS = 60 * 1000; // 60 seconds anti-spam cooldown

async function pushPenerimaanNotification(
  tx: any,
  params: {
    userId?: string | null;
    roleCode?: string | null;
    title: string;
    message: string;
    category?: string;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL';
    targetUrl?: string;
    entityType: 'Payment' | 'CustomerInvoice';
    entityId: string;
  }
) {
  await tx.notification.create({
    data: {
      userId: params.userId ?? null,
      roleCode: params.roleCode ?? null,
      title: params.title,
      message: params.message,
      category: params.category || 'APPROVAL_PENERIMAAN',
      severity: params.severity || 'INFO',
      targetUrl: params.targetUrl || '/revenue',
      entityType: params.entityType,
      entityId: params.entityId,
      isRead: false,
    },
  });
}

async function postOfficialInvoiceRecognitionJournal(
  tx: any,
  inv: any,
  actor: { userId: string; fullName: string }
) {
  const arCoa = await resolveSafeCoa(tx, '110302030100', '1-1210');
  const ppnCoa = await resolveSafeCoa(tx, '210202010100', '2-1210');
  const pb1Coa = await resolveSafeCoa(tx, '210203010100', '210202010100');
  const pph42Coa = await resolveSafeCoa(tx, '210201010500', '2-1220');
  const prepaidTaxCoa = await resolveSafeCoa(tx, '110502020100', '110302030100');
  const unitCode = inv.businessUnit?.code || 'PMO';
  const effectiveCoa = inv.revenueAccountCode || getDefaultRevenueCoaForUnit(unitCode);
  const creditTargetCoa =
    inv.invoiceType === 'UANG_MUKA'
      ? await resolveSafeCoa(tx, getDeferredCoaForUnit(unitCode), '210401020900')
      : await resolveSafeCoa(tx, effectiveCoa, '420301090100');

  const collector = normalizeCollectorProfile(inv.taxCollectorProfile);
  const taxScheme = normalizeTaxScheme(inv.taxScheme);
  const ppnWithheld =
    taxScheme !== 'BEBAS_PAJAK' &&
    taxScheme !== 'PB1_10' &&
    taxScheme !== 'PPH21_5' &&
    (collector === 'FP_020_INSTANSI' || collector === 'FP_030_BUMN');
  const pphWithheld =
    taxScheme !== 'BEBAS_PAJAK' &&
    taxScheme !== 'PB1_10' &&
    taxScheme !== 'PPH21_5' &&
    (collector === 'FP_020_INSTANSI' || collector === 'FP_030_BUMN' || collector === 'BADAN_POTONG_PPH');

  const debitReceivable = Number(inv.netReceivableAmount || inv.totalAmount || 0);
  const ppnNum = Number(inv.ppnAmount || 0);
  const pb1Num = Number(inv.pb1Amount || 0);
  const pph42Num = Number(inv.pph42Amount || 0);
  const pph23Num = Number(inv.pph23Amount || 0);
  const pph2315Num = Number(inv.pph23Rate15Amount || 0);
  const pph21Num = Number(inv.pph21Amount || 0);

  const withheldPph = pphWithheld ? pph42Num + pph23Num + pph2315Num : 0;
  const utPpn = ppnWithheld ? 0 : ppnNum;
  const utPb1 = pb1Num;
  const utPph = (!pphWithheld ? pph42Num + pph2315Num : 0) + pph21Num;

  const journalLines: Array<{ accountCode: string; description: string; debit: string; credit: string }> = [];
  if (debitReceivable > 0) {
    journalLines.push({
      accountCode: arCoa,
      description: `Piutang Tagihan ${inv.docNumber} (${inv.customer?.name || 'Pelanggan'})`,
      debit: fromCents(toCents(debitReceivable)),
      credit: '0.00',
    });
  }
  if (withheldPph > 0) {
    journalLines.push({
      accountCode: prepaidTaxCoa,
      description: `Pajak Dipotong Rekanan / Bukti Potong (${inv.docNumber})`,
      debit: fromCents(toCents(withheldPph)),
      credit: '0.00',
    });
  }

  const totalDebitCheck = debitReceivable + withheldPph;
  const creditTaxes = utPpn + utPb1 + utPph;
  const creditPrincipal = Math.max(0, totalDebitCheck - creditTaxes);

  if (creditPrincipal > 0) {
    journalLines.push({
      accountCode: creditTargetCoa,
      description:
        inv.invoiceType === 'UANG_MUKA'
          ? `Pendapatan Diterima di Muka (${inv.docNumber}) - ${inv.activityTitle || ''}`
          : `Pendapatan ${unitCode} (${inv.docNumber}) - ${inv.activityTitle || ''}`,
      debit: '0.00',
      credit: fromCents(toCents(creditPrincipal)),
    });
  }
  if (utPpn > 0) {
    journalLines.push({
      accountCode: ppnCoa,
      description: `PPN Keluaran 12% (DPP 11/12) atas ${inv.docNumber}`,
      debit: '0.00',
      credit: fromCents(toCents(utPpn)),
    });
  }
  if (utPb1 > 0) {
    journalLines.push({
      accountCode: pb1Coa,
      description: `Utang Pajak Daerah PB1 10% atas ${inv.docNumber}`,
      debit: '0.00',
      credit: fromCents(toCents(utPb1)),
    });
  }
  if (utPph > 0) {
    journalLines.push({
      accountCode: pph42Coa,
      description: `Utang PPh Penerimaan atas ${inv.docNumber}`,
      debit: '0.00',
      credit: fromCents(toCents(utPph)),
    });
  }

  if (journalLines.length >= 2 && totalDebitCheck > 0) {
    return createOrGetBalancedJournal(
      {
        entryDate: new Date(inv.issueDate),
        businessUnitId: inv.businessUnitId,
        sourceType: 'CUSTOMER_INVOICE',
        sourceId: inv.id,
        sourceDocNumber: inv.docNumber,
        idempotencyKey: `INVOICE_ISSUE_${inv.id}`,
        description: `Penerbitan Invoice ${inv.invoiceType} ${inv.docNumber} (${inv.customer?.name || 'Pelanggan'}) - ${inv.activityTitle || ''}`,
        createdById: actor.userId,
        createdByName: actor.fullName,
        lines: journalLines,
      },
      tx
    );
  }
  return null;
}

async function postDirectReceiptJournal(
  tx: any,
  payment: any,
  actor: { userId: string; fullName: string }
) {
  const unitCode = payment.businessUnit?.code || 'PMO';
  const coaCode = payment.revenueAccountCode || getDefaultRevenueCoaForUnit(unitCode);
  const grossNum = Number(payment.grossAmount);
  const feeStr = fromCents(toCents(payment.feeAmount || 0));
  const netStr = fromCents(toCents(payment.netAmount));
  const overpayNum = Math.min(grossNum, Math.round(Number(payment.overpaymentAmount || 0)));
  const docBrutoBasis = Math.max(0, Math.round(grossNum) - overpayNum);

  const tax = computePtnbhRevenueTax({
    amountAfterDiscount: docBrutoBasis,
    taxScheme: payment.taxScheme,
    taxInclusive: payment.taxInclusive !== false,
    taxCollectorProfile: payment.taxCollectorProfile,
    taxAlreadyProcessed: Boolean(payment.taxAlreadyProcessed),
  });

  const cashOrBankCoa =
    payment.method === 'CASH'
      ? await resolveSafeCoa(tx, '110101010100', '1-1110')
      : await resolveSafeCoa(tx, '110102010100', '1-1120');
  const feeCoa = await resolveSafeCoa(tx, '590101010300', '5-1500');
  const ppnCoa = await resolveSafeCoa(tx, '210202010100', '2-1210');
  const pb1Coa = await resolveSafeCoa(tx, '210203010100', '210202010100');
  const pph42Coa = await resolveSafeCoa(tx, '210201010500', '2-1220');
  const overpayCoa = await resolveSafeCoa(tx, '210101010200', '210301010200');
  const creditRevCoa =
    payment.paymentStage === 'UANG_MUKA'
      ? await resolveSafeCoa(tx, getDeferredCoaForUnit(unitCode), '210401020900')
      : await resolveSafeCoa(tx, coaCode, '420301090100');

  const jLines: Array<{ accountCode: string; description: string; debit: string; credit: string }> = [
    {
      accountCode: cashOrBankCoa,
      description: `Penerimaan langsung ${payment.receiptNumber} (${payment.payerName || 'Pelanggan'}) - ${payment.rincianLabel || 'Layanan'}`,
      debit: netStr,
      credit: '0.00',
    },
  ];
  if (toCents(feeStr) > 0n) {
    jLines.push({
      accountCode: feeCoa,
      description: `Biaya admin bank ${payment.receiptNumber}`,
      debit: feeStr,
      credit: '0.00',
    });
  }

  const taxSum = tax.utRemitPpn + tax.utRemitPph42 + tax.utRemitPph23Rate15 + tax.utRemitPph21 + tax.utRemitPb1;
  const principalCredit = Math.max(0, Math.round(grossNum) - overpayNum - taxSum);

  if (principalCredit > 0) {
    jLines.push({
      accountCode: creditRevCoa,
      description: `${payment.paymentStage === 'UANG_MUKA' ? 'Pendapatan Diterima di Muka' : 'Pendapatan'} ${unitCode}: ${payment.activityTitle || ''}`,
      debit: '0.00',
      credit: fromCents(toCents(principalCredit)),
    });
  }
  if (tax.utRemitPpn > 0) {
    jLines.push({
      accountCode: ppnCoa,
      description: `Utang PPN Keluaran 12% (${payment.receiptNumber})`,
      debit: '0.00',
      credit: fromCents(toCents(tax.utRemitPpn)),
    });
  }
  if (tax.utRemitPb1 > 0) {
    jLines.push({
      accountCode: pb1Coa,
      description: `Utang Pajak Daerah PB1 10% (${payment.receiptNumber})`,
      debit: '0.00',
      credit: fromCents(toCents(tax.utRemitPb1)),
    });
  }
  if (tax.utRemitPph42 + tax.utRemitPph23Rate15 + tax.utRemitPph21 > 0) {
    jLines.push({
      accountCode: pph42Coa,
      description: `Utang PPh Penerimaan (${payment.receiptNumber})`,
      debit: '0.00',
      credit: fromCents(toCents(tax.utRemitPph42 + tax.utRemitPph23Rate15 + tax.utRemitPph21)),
    });
  }
  if (overpayNum > 0) {
    jLines.push({
      accountCode: overpayCoa,
      description: `Utang Pengembalian Lebih Bayar (${payment.receiptNumber})`,
      debit: '0.00',
      credit: fromCents(toCents(overpayNum)),
    });
  }

  return createOrGetBalancedJournal(
    {
      entryDate: new Date(payment.paymentDate),
      businessUnitId: payment.businessUnitId,
      sourceType: 'DIRECT_RECEIPT',
      sourceId: payment.id,
      sourceDocNumber: payment.receiptNumber,
      idempotencyKey: `JRN_DIRECT_APPROVE_${payment.id}`,
      description: `Penerimaan Langsung ${payment.receiptNumber} (${unitCode}) - ${payment.activityTitle || ''}`,
      createdById: actor.userId,
      createdByName: actor.fullName,
      lines: jLines,
    },
    tx
  );
}

// ============================================================================
// 1. UPDATE CATALOG ITEM (PRICE, COA, TAX SCHEME, LOCATION, FACILITIES)
// ============================================================================
const updateProductSchema = z.object({
  name: z.string().min(3).optional(),
  category: z.string().min(2).optional(),
  location: z.string().nullable().optional(),
  unit: z.string().min(1).optional(),
  unitPrice: z.number().nonnegative().optional(),
  taxCode: z.string().optional(),
  taxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'PPN12_PPH23_15', 'PPH21_5', 'BEBAS_PAJAK']).optional(),
  taxInclusive: z.boolean().optional(),
  revenueAccountCode: z.string().min(4).optional(),
  overtimeNote: z.string().nullable().optional(),
  freeFacilities: z.string().nullable().optional(),
  reason: z.string().optional(),
});

penerimaanRouter.patch('/products/:id', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = updateProductSchema.parse(req.body);
    const existing = await prisma.productService.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Item katalog layanan tidak ditemukan.');

    const updated = await prisma.$transaction(async (tx) => {
      const priceChanged =
        parsed.unitPrice !== undefined && toCents(parsed.unitPrice) !== toCents(existing.unitPrice);

      if (priceChanged) {
        await tx.productPriceHistory.create({
          data: {
            productServiceId: existing.id,
            oldPrice: existing.unitPrice,
            newPrice: fromCents(toCents(parsed.unitPrice!)),
            changedById: req.user!.userId,
            changedByName: req.user!.fullName,
            reason: parsed.reason?.trim() || 'Pembaruan master katalog tarif & COA Penerimaan',
          },
        });
      }

      const nextProd = await tx.productService.update({
        where: { id: existing.id },
        data: {
          ...(parsed.name !== undefined ? { name: parsed.name.trim() } : {}),
          ...(parsed.category !== undefined ? { category: parsed.category.trim() } : {}),
          ...(parsed.location !== undefined ? { location: parsed.location?.trim() || null } : {}),
          ...(parsed.unit !== undefined ? { unit: parsed.unit.trim() } : {}),
          ...(parsed.unitPrice !== undefined ? { unitPrice: fromCents(toCents(parsed.unitPrice)) } : {}),
          ...(parsed.taxCode !== undefined ? { taxCode: parsed.taxCode.trim() } : {}),
          ...(parsed.taxScheme !== undefined ? { taxScheme: parsed.taxScheme } : {}),
          ...(parsed.taxInclusive !== undefined ? { taxInclusive: parsed.taxInclusive } : {}),
          ...(parsed.revenueAccountCode !== undefined ? { revenueAccountCode: parsed.revenueAccountCode.trim() } : {}),
          ...(parsed.overtimeNote !== undefined ? { overtimeNote: parsed.overtimeNote?.trim() || null } : {}),
          ...(parsed.freeFacilities !== undefined ? { freeFacilities: parsed.freeFacilities?.trim() || null } : {}),
        },
        include: { businessUnit: true, priceHistories: { orderBy: { changedAt: 'desc' }, take: 5 } },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PRODUCT_CATALOG_UPDATED',
          module: 'REVENUE',
          entityType: 'ProductService',
          entityId: nextProd.id,
          entityCode: nextProd.sku,
          summary: `Memperbarui katalog ${nextProd.sku} (${nextProd.name}) - COA ${nextProd.revenueAccountCode}, Skema Pajak ${nextProd.taxScheme}`,
          beforeData: {
            unitPrice: existing.unitPrice,
            revenueAccountCode: existing.revenueAccountCode,
            taxScheme: existing.taxScheme,
          },
          afterData: {
            unitPrice: nextProd.unitPrice,
            revenueAccountCode: nextProd.revenueAccountCode,
            taxScheme: nextProd.taxScheme,
          },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextProd;
    });

    res.json({
      success: true,
      data: { ...updated, unitPrice: Number(updated.unitPrice) },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. PTNBH TAX PREVIEW CALCULATOR (FOR REAL-TIME UI FORM PREVIEW)
// ============================================================================
const taxPreviewSchema = z.object({
  subtotal: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  taxScheme: z.string().default('PPN12_PMK131'),
  taxInclusive: z.boolean().default(true),
  taxCollectorProfile: z.string().default('FP_040_UMUM'),
});

penerimaanRouter.post('/tax-preview', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const p = taxPreviewSchema.parse(req.body);
    const discFromPct = p.discountPercent > 0 ? Math.round((p.subtotal * p.discountPercent) / 100) : 0;
    const totalDisc = Math.min(p.subtotal, p.discountAmount > 0 ? p.discountAmount : discFromPct);
    const afterDisc = Math.max(0, p.subtotal - totalDisc);
    const tax = computePtnbhRevenueTax({
      amountAfterDiscount: afterDisc,
      taxScheme: p.taxScheme,
      taxInclusive: p.taxInclusive,
      taxCollectorProfile: p.taxCollectorProfile,
    });
    res.json({
      success: true,
      data: {
        subtotal: Math.round(p.subtotal),
        discountAmount: Math.round(totalDisc),
        amountAfterDiscount: Math.round(afterDisc),
        ...tax,
        terbilangGrandTotal: terbilangRupiah(tax.brutoDocumentAmount),
        terbilangNetReceivable: terbilangRupiah(tax.netReceivableAmount),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. CREATE QUICK INVOICE OR MULTI-INVOICE UNDER CONTRACT/ACTIVITY (PTNBH)
// ============================================================================
const createOfficialInvoiceSchema = z.object({
  salesOrderId: z.string().optional().nullable(),
  customerId: z.string().min(1),
  businessUnitId: z.string().min(1),
  invoiceType: z
    .enum(['UANG_MUKA', 'TERMIN', 'PELUNASAN', 'SEWA_TAMBAHAN', 'SERVICE_CHARGE', 'BERKALA'])
    .default('PELUNASAN'),
  activityTitle: z.string().min(3, 'Nama kegiatan / uraian tagihan wajib diisi.'),
  activityDate: z.string().optional(),
  rincianLabel: z.string().optional(),
  revenueAccountCode: z.string().optional(),
  taxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'PPN12_PPH23_15', 'PPH21_5', 'BEBAS_PAJAK']).optional(),
  taxInclusive: z.boolean().default(true),
  taxCollectorProfile: z
    .enum(['FP_040_UMUM', 'FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH', 'INTERNAL_UT'])
    .optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  dpPercent: z.number().min(0).max(100).default(0),
  picName: z.string().optional(),
  subCategory: z.string().optional(),
  dueInDays: z.number().int().min(0).max(365).default(14),
  issueDate: z.string().optional(),
  bankAccountId: z.string().optional().nullable(),
  proofImageDataUrl: z.string().optional().nullable(),
  proofFileName: z.string().optional().nullable(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        productServiceId: z.string().optional().nullable(),
        description: z.string().min(2),
        quantity: z.number().positive(),
        duration: z.number().positive().default(1),
        durationUnit: z.string().optional().nullable(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

penerimaanRouter.post('/invoices', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = createOfficialInvoiceSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const [customer, unit] = await Promise.all([
      prisma.customer.findUnique({ where: { id: parsed.customerId } }),
      prisma.businessUnit.findUnique({ where: { id: parsed.businessUnitId } }),
    ]);
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
    if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit bisnis tidak ditemukan.');

    // Resolve default taxScheme & COA from first catalog item if omitted
    let firstProd: any = null;
    const firstProdId = parsed.lines.find((l) => l.productServiceId)?.productServiceId;
    if (firstProdId) {
      firstProd = await prisma.productService.findUnique({ where: { id: firstProdId } });
    }

    const effectiveTaxScheme = normalizeTaxScheme(parsed.taxScheme || firstProd?.taxScheme || 'PPN12_PMK131');
    const effectiveCollector = normalizeCollectorProfile(
      parsed.taxCollectorProfile || customer.taxCollectorProfile || customer.organizationType
    );
    const effectiveCoa =
      parsed.revenueAccountCode?.trim() || firstProd?.revenueAccountCode || getDefaultRevenueCoaForUnit(unit.code);
    const effectiveRincian =
      parsed.rincianLabel?.trim() || firstProd?.location || firstProd?.category || parsed.lines[0].description;

    let subtotalNum = 0;
    const normalizedLines = parsed.lines.map((l) => {
      const dur = Number(l.duration || 1);
      const lineSub = Math.round(l.quantity * dur * l.unitPrice);
      subtotalNum += lineSub;
      return {
        description: l.description.trim(),
        quantity: fromCents(toCents(l.quantity)),
        duration: fromCents(toCents(dur)),
        durationUnit: l.durationUnit?.trim() || null,
        unitPrice: fromCents(toCents(l.unitPrice)),
        lineSub,
      };
    });

    const discNum =
      parsed.discountAmount > 0
        ? Math.min(subtotalNum, Math.round(parsed.discountAmount))
        : parsed.discountPercent > 0
          ? Math.round((subtotalNum * parsed.discountPercent) / 100)
          : 0;
    const afterDisc = Math.max(0, subtotalNum - discNum);
    const effectiveDpPct = parsed.invoiceType === 'UANG_MUKA' && parsed.dpPercent > 0 && parsed.dpPercent < 100 ? parsed.dpPercent : 0;
    const taxableBasis = effectiveDpPct > 0 ? Math.round((afterDisc * effectiveDpPct) / 100) : afterDisc;

    const tax = computePtnbhRevenueTax({
      amountAfterDiscount: taxableBasis,
      taxScheme: effectiveTaxScheme,
      taxInclusive: parsed.taxInclusive,
      taxCollectorProfile: effectiveCollector,
    });

    const issueDate = parsed.issueDate ? new Date(parsed.issueDate) : new Date();
    const dueDate = new Date(issueDate.getTime() + parsed.dueInDays * 86400000);

    const created = await prisma.$transaction(async (tx) => {
      const docNumber = await generateOfficialDocNo(tx, 'INV', issueDate);
      const totalStr = fromCents(toCents(tax.netReceivableAmount));
      const brutoStr = fromCents(toCents(tax.brutoDocumentAmount));
      const resolvedBankId =
        parsed.bankAccountId ||
        (await resolveDefaultPenerimaanBankAccount(tx, unit.code, `${effectiveRincian} ${parsed.activityTitle}`));

      const inv = await tx.customerInvoice.create({
        data: {
          docNumber,
          salesOrderId: parsed.salesOrderId || null,
          customerId: customer.id,
          businessUnitId: unit.id,
          invoiceType: parsed.invoiceType,
          activityTitle: parsed.activityTitle.trim(),
          activityDate: parsed.activityDate?.trim() || null,
          rincianLabel: effectiveRincian,
          revenueAccountCode: effectiveCoa,
          taxScheme: tax.taxScheme,
          taxInclusive: tax.taxInclusive,
          taxCollectorProfile: tax.taxCollectorProfile,
          fakturPajakCode: tax.fakturPajakCode,
          issueDate,
          dueDate,
          subtotal: fromCents(toCents(subtotalNum)),
          discountPercent: parsed.discountPercent,
          discountAmount: fromCents(toCents(discNum)),
          dpPercent: effectiveDpPct,
          picName: parsed.picName?.trim() || null,
          subCategory: parsed.subCategory?.trim() || (effectiveCollector === 'INTERNAL_UT' ? 'Internal UT' : 'Umum'),
          serviceChargePercent: 0,
          serviceChargeAmount: '0.00',
          nilaiJual: fromCents(toCents(tax.nilaiJual)),
          dppPb1: fromCents(toCents(tax.dppPb1)),
          dppPpn: fromCents(toCents(tax.dppPpn)),
          dppPph: fromCents(toCents(tax.dppPph)),
          ppnAmount: fromCents(toCents(tax.ppnAmount)),
          pph42Amount: fromCents(toCents(tax.pph42Amount)),
          pph23Amount: fromCents(toCents(tax.pph23Amount)),
          pph23Rate15Amount: fromCents(toCents(tax.pph23Rate15Amount)),
          pph21Amount: fromCents(toCents(tax.pph21Amount)),
          pb1Amount: fromCents(toCents(tax.pb1Amount)),
          taxAmount: fromCents(toCents(tax.totalTaxAmount)),
          totalAmount: totalStr,
          netReceivableAmount: totalStr,
          taxWithheldByCustomer: tax.taxWithheldByCustomer,
          paidAmount: '0.00',
          balanceDue: totalStr,
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING_APPROVAL',
          serviceDelivered: false,
          bankAccountId: resolvedBankId,
          notes: parsed.notes?.trim() || tax.clauseNotes.join(' '),
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: {
            create: normalizedLines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              duration: l.duration,
              durationUnit: l.durationUnit,
              unitPrice: l.unitPrice,
              discountAmount: '0.00',
              taxAmount: '0.00',
              lineTotal: fromCents(toCents(l.lineSub)),
            })),
          },
        },
        include: { customer: true, businessUnit: true, salesOrder: true, lines: true, payments: true },
      });

      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Approval Invoice Baru: ${inv.docNumber}`,
        message: `${req.user!.fullName} mengajukan penerbitan Invoice ${inv.docNumber} (${unit.code} - ${customer.name}) sebesar Rp ${Number(totalStr).toLocaleString('id-ID')}. Menunggu persetujuan sebelum dicetak & diposting.`,
        severity: 'INFO',
        targetUrl: '/revenue?tab=invoices&status=PENDING_APPROVAL',
        entityType: 'CustomerInvoice',
        entityId: inv.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'OFFICIAL_INVOICE_SUBMITTED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Mengajukan Invoice ${inv.invoiceType} ${inv.docNumber} (${unit.code}, ${customer.name}) Bruto Rp ${Number(brutoStr).toLocaleString('id-ID')} / Tagihan Neto Rp ${Number(totalStr).toLocaleString('id-ID')} untuk persetujuan Manajer Keuangan`,
          afterData: { docNumber: inv.docNumber, invoiceType: inv.invoiceType, taxScheme: inv.taxScheme, bruto: brutoStr, netReceivable: totalStr, approvalStatus: 'PENDING_APPROVAL' },
          requestId: req.requestId,
        },
        tx as any
      );

      return inv;
    });

    let invoiceProof: any = null;
    if (parsed.proofImageDataUrl && parsed.proofImageDataUrl.trim()) {
      invoiceProof = await saveInvoiceProofFromDataUrl({
        invoiceId: created.id,
        docNumber: created.docNumber,
        dataUrl: parsed.proofImageDataUrl,
        fileName: parsed.proofFileName || undefined,
        uploadedById: req.user!.userId,
        uploadedByName: req.user!.fullName,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...created,
        subtotal: Number(created.subtotal),
        discountPercent: Number(created.discountPercent),
        discountAmount: Number(created.discountAmount),
        nilaiJual: Number(created.nilaiJual),
        dppPb1: Number(created.dppPb1),
        dppPpn: Number(created.dppPpn),
        dppPph: Number(created.dppPph),
        ppnAmount: Number(created.ppnAmount),
        pph42Amount: Number(created.pph42Amount),
        pph23Amount: Number(created.pph23Amount),
        pb1Amount: Number(created.pb1Amount),
        taxAmount: Number(created.taxAmount),
        totalAmount: Number(created.totalAmount),
        netReceivableAmount: Number(created.netReceivableAmount),
        paidAmount: Number(created.paidAmount),
        balanceDue: Number(created.balanceDue),
        invoiceProof,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. VOID / HANGUS INVOICE + REISSUE INVOICE
// ============================================================================
penerimaanRouter.post('/customer-invoices/:id/void', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 4) {
      throw new AppError(400, 'VOID_REASON_REQUIRED', 'Alasan pembatalan (HANGUS) invoice wajib diisi minimal 4 karakter.');
    }

    const inv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, businessUnit: true },
    });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.status === 'VOID') throw new AppError(409, 'ALREADY_VOID', `Invoice ${inv.docNumber} sudah berstatus HANGUS.`);
    if (toCents(inv.paidAmount) > 0n) {
      throw new AppError(409, 'INVOICE_HAS_PAYMENTS', 'Invoice yang sudah memiliki pembayaran tidak dapat di-HANGUS-kan. Gunakan mekanisme Refund.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const resInv = await tx.customerInvoice.update({
        where: { id: inv.id },
        data: {
          status: 'VOID',
          balanceDue: '0.00',
          voidReason: reason,
          voidedAt: new Date(),
        },
      });

      // Reverse original invoice recognition journal if posted
      const origJournal = await tx.journalEntry.findFirst({
        where: { sourceType: 'CUSTOMER_INVOICE', sourceId: inv.id, status: 'POSTED' },
        include: { lines: true },
      });
      if (origJournal && origJournal.lines.length > 0) {
        await createOrGetBalancedJournal(
          {
            entryDate: new Date(),
            businessUnitId: inv.businessUnitId,
            sourceType: 'CUSTOMER_INVOICE_VOID',
            sourceId: inv.id,
            sourceDocNumber: inv.docNumber,
            idempotencyKey: `INVOICE_VOID_${inv.id}`,
            description: `Jurnal Pembalik Pembatalan (HANGUS) Invoice ${inv.docNumber}: ${reason}`,
            createdById: req.user!.userId,
            createdByName: req.user!.fullName,
            lines: origJournal.lines.map((l) => ({
              accountCode: l.accountCode,
              costCenterId: l.costCenterId,
              description: `Pembalik HANGUS ${inv.docNumber}: ${l.description}`,
              debit: l.credit.toString(),
              credit: l.debit.toString(),
            })),
          },
          tx
        );
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'INVOICE_VOIDED_HANGUS',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Membatalkan (HANGUS) Invoice ${inv.docNumber} (${inv.customer.name}). Alasan: ${reason}`,
          afterData: { status: 'VOID', voidReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return resInv;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.post('/customer-invoices/:id/reissue', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const oldInv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { lines: true, customer: true, businessUnit: true },
    });
    if (!oldInv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice asal tidak ditemukan.');

    const reissued = await prisma.$transaction(async (tx) => {
      const docNumber = await generateOfficialDocNo(tx, 'INV', new Date());
      const dueDate = new Date(Date.now() + 14 * 86400000);
      const clone = await tx.customerInvoice.create({
        data: {
          docNumber,
          salesOrderId: oldInv.salesOrderId,
          customerId: oldInv.customerId,
          businessUnitId: oldInv.businessUnitId,
          invoiceType: oldInv.invoiceType,
          activityTitle: oldInv.activityTitle,
          activityDate: oldInv.activityDate,
          rincianLabel: oldInv.rincianLabel,
          revenueAccountCode: oldInv.revenueAccountCode,
          taxScheme: oldInv.taxScheme,
          taxInclusive: oldInv.taxInclusive,
          taxCollectorProfile: oldInv.taxCollectorProfile,
          fakturPajakCode: oldInv.fakturPajakCode,
          issueDate: new Date(),
          dueDate,
          subtotal: oldInv.subtotal,
          discountPercent: oldInv.discountPercent,
          discountAmount: oldInv.discountAmount,
          serviceChargePercent: oldInv.serviceChargePercent,
          serviceChargeAmount: oldInv.serviceChargeAmount,
          nilaiJual: oldInv.nilaiJual,
          dppPb1: oldInv.dppPb1,
          dppPpn: oldInv.dppPpn,
          dppPph: oldInv.dppPph,
          ppnAmount: oldInv.ppnAmount,
          pph42Amount: oldInv.pph42Amount,
          pph23Amount: oldInv.pph23Amount,
          pb1Amount: oldInv.pb1Amount,
          taxAmount: oldInv.taxAmount,
          totalAmount: oldInv.totalAmount,
          netReceivableAmount: oldInv.netReceivableAmount,
          taxWithheldByCustomer: oldInv.taxWithheldByCustomer,
          paidAmount: '0.00',
          balanceDue: oldInv.totalAmount,
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING_APPROVAL',
          serviceDelivered: false,
          bankAccountId: oldInv.bankAccountId,
          notes: `Terbit ulang dari ${oldInv.docNumber}. ${oldInv.notes || ''}`.trim(),
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: {
            create: oldInv.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              duration: l.duration,
              durationUnit: l.durationUnit,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { customer: true, businessUnit: true, lines: true },
      });

      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Approval Invoice Terbit Ulang: ${clone.docNumber}`,
        message: `${req.user!.fullName} mengajukan Invoice terbit ulang ${clone.docNumber} (pengganti ${oldInv.docNumber}, ${oldInv.customer.name}) sebesar Rp ${Number(clone.totalAmount).toLocaleString('id-ID')}.`,
        severity: 'INFO',
        targetUrl: '/revenue?tab=invoices&status=PENDING_APPROVAL',
        entityType: 'CustomerInvoice',
        entityId: clone.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'INVOICE_REISSUED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: clone.id,
          entityCode: clone.docNumber,
          summary: `Mengajukan terbit ulang Invoice ${clone.docNumber} menggantikan ${oldInv.docNumber} (Menunggu Approval Manajer Keuangan)`,
          requestId: req.requestId,
        },
        tx as any
      );

      return clone;
    });

    res.status(201).json({ success: true, data: reissued, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Approve Invoice (Manager Finance) -> posts balanced AR/Revenue/Tax GL journal & unlocks print/payment
penerimaanRouter.post('/customer-invoices/:id/approve', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const inv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, businessUnit: true, lines: true },
    });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.status === 'VOID') {
      throw new AppError(409, 'INVOICE_VOIDED', `Invoice ${inv.docNumber} sudah dibatalkan (HANGUS).`);
    }
    if (inv.approvalStatus === 'APPROVED') {
      throw new AppError(409, 'ALREADY_APPROVED', `Invoice ${inv.docNumber} sudah disetujui sebelumnya.`);
    }
    if (inv.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'INVALID_APPROVAL_STATE', `Invoice ${inv.docNumber} berstatus ${inv.approvalStatus}. Ajukan ulang terlebih dahulu sebelum disetujui.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await postOfficialInvoiceRecognitionJournal(tx, inv, {
        userId: req.user!.userId,
        fullName: req.user!.fullName,
      });

      const nextInv = await tx.customerInvoice.update({
        where: { id: inv.id },
        data: {
          status: 'ISSUED',
          approvalStatus: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
          rejectedById: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
        },
        include: { customer: true, businessUnit: true, lines: true },
      });

      // Auto-clear stale pending/reminder notifications for this invoice
      await tx.notification.updateMany({
        where: { entityType: 'CustomerInvoice', entityId: inv.id, isRead: false },
        data: { isRead: true },
      });

      if (inv.createdById && inv.createdById !== req.user!.userId) {
        await pushPenerimaanNotification(tx, {
          userId: inv.createdById,
          title: `Invoice Disetujui: ${inv.docNumber}`,
          message: `${req.user!.fullName} telah menyetujui Invoice ${inv.docNumber} (${inv.customer.name}). Jurnal telah diposting dan tombol Cetak Invoice kini aktif.`,
          severity: 'INFO',
          targetUrl: '/revenue?tab=invoices',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'OFFICIAL_INVOICE_APPROVED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Menyetujui penerbitan Invoice ${inv.docNumber} (${inv.businessUnit.code}, ${inv.customer.name}) sebesar Rp ${Number(inv.totalAmount).toLocaleString('id-ID')}`,
          afterData: { status: 'ISSUED', approvalStatus: 'APPROVED', approvedByName: req.user!.fullName },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextInv;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Reject / Request Revision on Invoice (Manager Finance)
penerimaanRouter.post('/customer-invoices/:id/reject', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 4) {
      throw new AppError(400, 'REJECT_REASON_REQUIRED', 'Catatan alasan revisi / penolakan wajib diisi minimal 4 karakter.');
    }
    const inv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, businessUnit: true },
    });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'INVALID_APPROVAL_STATE', `Invoice ${inv.docNumber} tidak sedang menunggu approval.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextInv = await tx.customerInvoice.update({
        where: { id: inv.id },
        data: {
          status: 'REJECTED',
          approvalStatus: 'REJECTED',
          rejectedById: req.user!.userId,
          rejectedByName: req.user!.fullName,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });

      await tx.notification.updateMany({
        where: { entityType: 'CustomerInvoice', entityId: inv.id, isRead: false },
        data: { isRead: true },
      });

      if (inv.createdById && inv.createdById !== req.user!.userId) {
        await pushPenerimaanNotification(tx, {
          userId: inv.createdById,
          title: `Revisi Invoice Diperlukan: ${inv.docNumber}`,
          message: `${req.user!.fullName} meminta revisi atas Invoice ${inv.docNumber}: "${reason}".`,
          severity: 'WARNING',
          targetUrl: '/revenue?tab=invoices&status=REJECTED',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'OFFICIAL_INVOICE_REJECTED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Meminta revisi Invoice ${inv.docNumber} (${inv.customer.name}): ${reason}`,
          afterData: { status: 'REJECTED', approvalStatus: 'REJECTED', rejectionReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextInv;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Remind Manager Finance to Approve Pending Invoice (PIC Nudge Button)
penerimaanRouter.post('/customer-invoices/:id/remind', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const perms = req.user?.permissions || [];
    if (perms.includes('payment:approve') && !perms.includes('*')) {
      throw new AppError(
        400,
        'APPROVER_CANNOT_REMIND_SELF',
        'Sebagai Manajer Keuangan/Approver, Anda dapat langsung menyetujui atau meminta revisi tanpa perlu mengirim pengingat ke diri sendiri.'
      );
    }
    const inv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, businessUnit: true },
    });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'NOT_PENDING_APPROVAL', `Invoice ${inv.docNumber} tidak sedang menunggu persetujuan.`);
    }
    if (inv.lastRemindedAt) {
      const elapsed = Date.now() - inv.lastRemindedAt.getTime();
      if (elapsed < REMIND_COOLDOWN_MS) {
        const waitSec = Math.ceil((REMIND_COOLDOWN_MS - elapsed) / 1000);
        throw new AppError(429, 'REMIND_COOLDOWN', `Pengingat baru saja dikirim. Tunggu ${waitSec} detik sebelum mengingatkan kembali.`);
      }
    }

    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? ` Catatan: ${req.body.note.trim()}` : '';
    const updated = await prisma.$transaction(async (tx) => {
      const nextInv = await tx.customerInvoice.update({
        where: { id: inv.id },
        data: {
          lastRemindedAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });

      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Pengingat Approval Invoice (${nextInv.reminderCount}x): ${inv.docNumber}`,
        message: `${req.user!.fullName} mengingatkan persetujuan Invoice ${inv.docNumber} (${inv.businessUnit.code} - ${inv.customer.name}, Rp ${Number(inv.totalAmount).toLocaleString('id-ID')}) agar dapat segera dicetak.${note}`,
        severity: 'WARNING',
        targetUrl: '/revenue?tab=invoices&status=PENDING_APPROVAL',
        entityType: 'CustomerInvoice',
        entityId: inv.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'OFFICIAL_INVOICE_REMINDED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Mengirim pengingat ke-${nextInv.reminderCount} kepada Manajer Keuangan untuk approval Invoice ${inv.docNumber}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return nextInv;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Resubmit Rejected Invoice back to PENDING_APPROVAL
penerimaanRouter.post('/customer-invoices/:id/resubmit', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const schema = z.object({
      activityTitle: z.string().min(3).optional(),
      activityDate: z.string().nullable().optional(),
      rincianLabel: z.string().min(2).optional(),
      revenueAccountCode: z.string().min(4).optional(),
      notes: z.string().nullable().optional(),
    });
    const parsed = schema.parse(req.body || {});
    const inv = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, businessUnit: true },
    });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');
    if (inv.approvalStatus !== 'REJECTED') {
      throw new AppError(409, 'NOT_REJECTED', `Hanya Invoice berstatus Perlu Revisi yang dapat diajukan ulang.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextInv = await tx.customerInvoice.update({
        where: { id: inv.id },
        data: {
          ...(parsed.activityTitle ? { activityTitle: parsed.activityTitle.trim() } : {}),
          ...(parsed.activityDate !== undefined ? { activityDate: parsed.activityDate?.trim() || null } : {}),
          ...(parsed.rincianLabel ? { rincianLabel: parsed.rincianLabel.trim() } : {}),
          ...(parsed.revenueAccountCode ? { revenueAccountCode: parsed.revenueAccountCode.trim() } : {}),
          ...(parsed.notes !== undefined ? { notes: parsed.notes?.trim() || null } : {}),
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING_APPROVAL',
          rejectedById: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Pengajuan Ulang Invoice: ${inv.docNumber}`,
        message: `${req.user!.fullName} telah merevisi dan mengajukan ulang Invoice ${inv.docNumber} (${inv.customer.name}) untuk disetujui.`,
        severity: 'INFO',
        targetUrl: '/revenue?tab=invoices&status=PENDING_APPROVAL',
        entityType: 'CustomerInvoice',
        entityId: inv.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'OFFICIAL_INVOICE_RESUBMITTED',
          module: 'REVENUE',
          entityType: 'CustomerInvoice',
          entityId: inv.id,
          entityCode: inv.docNumber,
          summary: `Mengajukan ulang Invoice ${inv.docNumber} setelah revisi`,
          requestId: req.requestId,
        },
        tx as any
      );

      return nextInv;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Upload & Retrieve Supporting Proof Document for Invoice
penerimaanRouter.post('/customer-invoices/:id/proof', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const schema = z.object({
      dataUrl: z.string().min(20, 'File bukti pendukung wajib diunggah.'),
      fileName: z.string().optional(),
    });
    const parsed = schema.parse(req.body);
    const inv = await prisma.customerInvoice.findUnique({ where: { id: req.params.id } });
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice tidak ditemukan.');

    const saved = await saveInvoiceProofFromDataUrl({
      invoiceId: inv.id,
      docNumber: inv.docNumber,
      dataUrl: parsed.dataUrl,
      fileName: parsed.fileName,
      uploadedById: req.user!.userId,
      uploadedByName: req.user!.fullName,
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'INVOICE_PROOF_UPLOADED',
      module: 'REVENUE',
      entityType: 'CustomerInvoice',
      entityId: inv.id,
      entityCode: inv.docNumber,
      summary: `Mengunggah bukti pendukung (${saved.displayName}) untuk Invoice ${inv.docNumber}`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: saved, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.get('/customer-invoices/:id/proof', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const { attachment, buffer } = await loadInvoiceProofBinary(req.params.id);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.displayName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. DIRECT RECEIPT WITHOUT INVOICE (WISMA, LAUNDRY, KLINIK, BPJS, INHEALTH)
// ============================================================================
const directReceiptSchema = z.object({
  businessUnitId: z.string().min(1),
  productServiceId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  receiptType: z.enum(['LANGSUNG', 'KUITANSI', 'KUITANSI_UM', 'TANDA_TERIMA']).default('LANGSUNG'),
  paymentStage: z.enum(['UANG_MUKA', 'TERMIN', 'PELUNASAN']).default('PELUNASAN'),
  paymentDate: z.string().optional(),
  depositDate: z.string().optional(),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'QRIS_SIMULATED', 'VIRTUAL_ACCOUNT_SIMULATED', 'EDC_CARD']).default('BANK_TRANSFER'),
  bankAccountId: z.string().optional().nullable(),
  payerName: z.string().min(2, 'Nama pembayar / unit / pasien wajib diisi.'),
  payerTaxId: z.string().optional(),
  payerAddress: z.string().optional(),
  picName: z.string().optional(),
  subCategory: z.string().optional(),
  activityTitle: z.string().min(3, 'Uraian kegiatan / transaksi wajib diisi.'),
  activityDate: z.string().optional(),
  rincianLabel: z.string().min(2),
  revenueAccountCode: z.string().optional(),
  externalInvoiceNo: z.string().optional(),
  taxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'PPN12_PPH23_15', 'PPH21_5', 'BEBAS_PAJAK']).optional(),
  taxInclusive: z.boolean().default(true),
  taxCollectorProfile: z
    .enum(['FP_040_UMUM', 'FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH', 'INTERNAL_UT'])
    .default('FP_040_UMUM'),
  grossAmount: z.number().positive('Nominal masuk wajib lebih dari 0.'),
  feeAmount: z.number().nonnegative().default(0),
  overpaymentAmount: z.number().nonnegative().default(0),
  refundBankName: z.string().optional(),
  refundAccountNumber: z.string().optional(),
  refundAccountHolder: z.string().optional(),
  withholdingSlipNo: z.string().optional(),
  taxAlreadyProcessed: z.boolean().default(false),
  referenceNo: z.string().min(2),
  proofImageDataUrl: z.string().optional().nullable(),
  proofFileName: z.string().optional().nullable(),
  notes: z.string().optional(),
});

async function recordSingleDirectReceipt(tx: any, parsed: z.infer<typeof directReceiptSchema>, req: any) {
  const unit = await tx.businessUnit.findUnique({ where: { id: parsed.businessUnitId } });
  if (!unit) throw new AppError(404, 'UNIT_NOT_FOUND', 'Unit bisnis tidak ditemukan.');

  const prod = parsed.productServiceId
    ? await tx.productService.findUnique({ where: { id: parsed.productServiceId } })
    : null;

  const taxScheme = normalizeTaxScheme(parsed.taxScheme || prod?.taxScheme || 'PPN12_PMK131');
  const collector = normalizeCollectorProfile(parsed.taxCollectorProfile);
  const coaCode =
    parsed.revenueAccountCode?.trim() || prod?.revenueAccountCode || getDefaultRevenueCoaForUnit(unit.code);

  const overpayNum = Math.min(parsed.grossAmount, Math.round(parsed.overpaymentAmount || 0));
  const docBrutoBasis = Math.max(0, Math.round(parsed.grossAmount) - overpayNum);

  const tax = computePtnbhRevenueTax({
    amountAfterDiscount: docBrutoBasis,
    taxScheme,
    taxInclusive: parsed.taxInclusive,
    taxCollectorProfile: collector,
    taxAlreadyProcessed: parsed.taxAlreadyProcessed,
  });

  const payDate = parsed.paymentDate ? new Date(parsed.paymentDate) : new Date();
  const depDate = parsed.depositDate ? new Date(parsed.depositDate) : payDate;
  const grossStr = fromCents(toCents(parsed.grossAmount));
  const feeStr = fromCents(toCents(parsed.feeAmount || 0));
  const netStr = subMoney(grossStr, feeStr);

  // Auto-route Bank Mandiri Final (164-00-2022-999-5) vs Mandiri Kelolaan (164-00-2022-8989 for Klinik/Laundry)
  let bankAccId = parsed.bankAccountId || null;
  if (!bankAccId && parsed.method !== 'CASH') {
    bankAccId = await resolveDefaultPenerimaanBankAccount(tx, unit.code, `${parsed.rincianLabel} ${parsed.activityTitle}`);
  }

  const receiptKind =
    parsed.receiptType === 'KUITANSI_UM' || parsed.paymentStage === 'UANG_MUKA'
      ? 'KU-UM'
      : parsed.receiptType === 'TANDA_TERIMA'
        ? 'TT'
        : 'KU';
  const receiptNumber = await generateOfficialDocNo(tx, receiptKind, payDate);
  const idempKey = `DIRECT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Held in PENDING_APPROVAL until Manager Finance approves -> GL journal & BKU posting happen strictly on approval
  const payment = await tx.payment.create({
    data: {
      receiptNumber,
      receiptType: parsed.receiptType,
      paymentStage: parsed.paymentStage,
      customerInvoiceId: null,
      businessUnitId: unit.id,
      customerId: parsed.customerId || null,
      bankAccountId: bankAccId,
      paymentDate: payDate,
      depositDate: depDate,
      method: parsed.method,
      payerName: parsed.payerName.trim(),
      payerTaxId: parsed.payerTaxId?.trim() || null,
      payerAddress: parsed.payerAddress?.trim() || null,
      picName: parsed.picName?.trim() || null,
      subCategory: parsed.subCategory?.trim() || (parsed.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum'),
      activityTitle: parsed.activityTitle.trim(),
      activityDate: parsed.activityDate?.trim() || null,
      rincianLabel: parsed.rincianLabel.trim(),
      revenueAccountCode: coaCode,
      externalInvoiceNo: parsed.externalInvoiceNo?.trim() || null,
      taxScheme: tax.taxScheme,
      taxInclusive: tax.taxInclusive,
      taxCollectorProfile: tax.taxCollectorProfile,
      brutoDocumentAmount: fromCents(toCents(tax.brutoDocumentAmount)),
      nilaiJual: fromCents(toCents(tax.nilaiJual)),
      dppPb1: fromCents(toCents(tax.dppPb1)),
      dppPpn: fromCents(toCents(tax.dppPpn)),
      dppPph: fromCents(toCents(tax.dppPph)),
      ppnAmount: fromCents(toCents(tax.ppnAmount)),
      pph42Amount: fromCents(toCents(tax.pph42Amount)),
      pph23Amount: fromCents(toCents(tax.pph23Amount)),
      pph23Rate15Amount: fromCents(toCents(tax.pph23Rate15Amount)),
      pph21Amount: fromCents(toCents(tax.pph21Amount)),
      pb1Amount: fromCents(toCents(tax.pb1Amount)),
      grossAmount: grossStr,
      feeAmount: feeStr,
      netAmount: netStr,
      overpaymentAmount: fromCents(toCents(overpayNum)),
      refundBankName: parsed.refundBankName?.trim() || null,
      refundAccountNumber: parsed.refundAccountNumber?.trim() || null,
      refundAccountHolder: parsed.refundAccountHolder?.trim() || null,
      withholdingSlipNo: parsed.withholdingSlipNo?.trim() || null,
      taxAlreadyProcessed: parsed.taxAlreadyProcessed,
      referenceNo: parsed.referenceNo.trim(),
      idempotencyKey: idempKey,
      status: 'PENDING_APPROVAL',
      approvalStatus: 'PENDING_APPROVAL',
      journalEntryId: null,
      receivedById: req.user!.userId,
      receivedByName: req.user!.fullName,
      notes: parsed.notes?.trim() || null,
    },
    include: { businessUnit: true, bankAccount: true },
  });

  const docKindLabel = parsed.receiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : parsed.receiptType === 'KUITANSI_UM' ? 'Kwitansi Uang Muka' : 'Kwitansi';
  await pushPenerimaanNotification(tx, {
    roleCode: 'FINANCE_MANAGER',
    title: `Approval ${docKindLabel} Baru: ${payment.receiptNumber}`,
    message: `${req.user!.fullName} mengajukan penerbitan ${docKindLabel} ${payment.receiptNumber} (${unit.code} - ${parsed.payerName.trim()}) sebesar Rp ${Number(grossStr).toLocaleString('id-ID')}. Menunggu persetujuan sebelum dicetak & diposting.`,
    severity: 'INFO',
    targetUrl: '/revenue?tab=buku_harian&status=PENDING_APPROVAL',
    entityType: 'Payment',
    entityId: payment.id,
  });

  await recordAuditLog(
    {
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'DIRECT_RECEIPT_SUBMITTED',
      module: 'REVENUE',
      entityType: 'Payment',
      entityId: payment.id,
      entityCode: payment.receiptNumber,
      summary: `Mengajukan ${docKindLabel} ${payment.receiptNumber} (${unit.code} - ${parsed.rincianLabel}) sebesar Rp ${Number(grossStr).toLocaleString('id-ID')} untuk persetujuan Manajer Keuangan`,
      afterData: { receiptNumber: payment.receiptNumber, gross: grossStr, coaCode, taxScheme: tax.taxScheme, approvalStatus: 'PENDING_APPROVAL' },
      requestId: req.requestId,
    },
    tx as any
  );

  return payment;
}

penerimaanRouter.post('/direct-receipts', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const parsed = directReceiptSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const payment = await prisma.$transaction((tx) => recordSingleDirectReceipt(tx, parsed, req));

    let paymentProof: any = null;
    if (parsed.proofImageDataUrl && parsed.proofImageDataUrl.trim()) {
      paymentProof = await savePaymentProofFromDataUrl({
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        dataUrl: parsed.proofImageDataUrl,
        fileName: parsed.proofFileName || undefined,
        uploadedById: req.user!.userId,
        uploadedByName: req.user!.fullName,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...payment,
        grossAmount: Number(payment.grossAmount),
        feeAmount: Number(payment.feeAmount),
        netAmount: Number(payment.netAmount),
        brutoDocumentAmount: Number(payment.brutoDocumentAmount),
        ppnAmount: Number(payment.ppnAmount),
        pph42Amount: Number(payment.pph42Amount),
        pph23Amount: Number(payment.pph23Amount),
        pb1Amount: Number(payment.pb1Amount),
        overpaymentAmount: Number(payment.overpaymentAmount),
        paymentProof,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Bulk CSV/TSV Import for high-frequency daily receipts (Wisma, Laundry, Klinik)
const importDirectCsvSchema = z.object({
  businessUnitId: z.string().min(1),
  rawContent: z.string().min(5, 'Isi file CSV tidak boleh kosong.'),
  defaultTaxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'PPN12_PPH23_15', 'PPH21_5', 'BEBAS_PAJAK']).default('PB1_10'),
  defaultRevenueAccountCode: z.string().optional(),
});

penerimaanRouter.post('/direct-receipts/import-csv', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const parsed = importDirectCsvSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const lines = parsed.rawContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0) throw new AppError(400, 'EMPTY_CSV', 'Data CSV kosong.');

    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const firstCols = lines[0].toLowerCase();
    const startIdx = firstCols.includes('tanggal') || firstCols.includes('nama') || firstCols.includes('nominal') ? 1 : 0;

    const createdList: any[] = [];
    await prisma.$transaction(async (tx) => {
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 4) continue;
        // Expected columns: Tanggal, Nama, Kegiatan, Rincian, Nominal, [COA], [TaxScheme], [NoInvoiceEksternal], [Ref]
        const [rawDate, payerName, activityTitle, rincianLabel, rawAmt, optCoa, optScheme, optExtInv, optRef] = cols;
        const cleanAmt = parseFloat((rawAmt || '0').replace(/[^0-9.-]/g, ''));
        if (!cleanAmt || cleanAmt <= 0) continue;

        const rowPayload = directReceiptSchema.parse({
          businessUnitId: parsed.businessUnitId,
          paymentDate: rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          payerName: payerName || 'Tamu Umum',
          activityTitle: activityTitle || `Penerimaan Harian ${rincianLabel || 'Unit'}`,
          rincianLabel: rincianLabel || 'Kamar',
          revenueAccountCode: optCoa || parsed.defaultRevenueAccountCode,
          taxScheme: optScheme ? normalizeTaxScheme(optScheme) : parsed.defaultTaxScheme,
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          grossAmount: cleanAmt,
          externalInvoiceNo: optExtInv || undefined,
          referenceNo: optRef || `IMP-BH-${Date.now().toString().slice(-5)}-${i}`,
          method: 'BANK_TRANSFER',
          receiptType: 'LANGSUNG',
          paymentStage: 'PELUNASAN',
        });
        const rec = await recordSingleDirectReceipt(tx, rowPayload, req);
        createdList.push(rec);
      }
    });

    if (createdList.length === 0) {
      throw new AppError(400, 'NO_VALID_ROWS', 'Tidak ada baris valid. Format kolom: Tanggal(YYYY-MM-DD),Nama,Kegiatan,Rincian,Nominal,[COA],[SkemaPajak],[NoInvEksternal]');
    }

    res.status(201).json({
      success: true,
      data: { importedCount: createdList.length, receipts: createdList.map((r) => r.receiptNumber) },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Toggle taxAlreadyProcessed (Tampungan/Kelolaan), withholdingSlipNo (Bukti Potong), refund bank details, or depositDate
penerimaanRouter.patch('/payments/:id/tax-meta', async (req, res, next) => {
  try {
    const perms = req.user?.permissions || [];
    if (!perms.includes('*') && !perms.includes('payment:create') && !perms.includes('accounting:manage')) {
      throw new AppError(403, 'FORBIDDEN_PERMISSION', 'Akses ditolak. Memerlukan izin payment:create atau accounting:manage.');
    }
    const schema = z.object({
      taxAlreadyProcessed: z.boolean().optional(),
      withholdingSlipNo: z.string().nullable().optional(),
      depositDate: z.string().nullable().optional(),
      overpaymentAmount: z.number().nonnegative().optional(),
      refundBankName: z.string().nullable().optional(),
      refundAccountNumber: z.string().nullable().optional(),
      refundAccountHolder: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const parsed = schema.parse(req.body);
    const existing = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');

    const updated = await prisma.payment.update({
      where: { id: existing.id },
      data: {
        ...(parsed.taxAlreadyProcessed !== undefined ? { taxAlreadyProcessed: parsed.taxAlreadyProcessed } : {}),
        ...(parsed.withholdingSlipNo !== undefined ? { withholdingSlipNo: parsed.withholdingSlipNo?.trim() || null } : {}),
        ...(parsed.depositDate !== undefined ? { depositDate: parsed.depositDate ? new Date(parsed.depositDate) : null } : {}),
        ...(parsed.overpaymentAmount !== undefined ? { overpaymentAmount: fromCents(toCents(parsed.overpaymentAmount)) } : {}),
        ...(parsed.refundBankName !== undefined ? { refundBankName: parsed.refundBankName?.trim() || null } : {}),
        ...(parsed.refundAccountNumber !== undefined ? { refundAccountNumber: parsed.refundAccountNumber?.trim() || null } : {}),
        ...(parsed.refundAccountHolder !== undefined ? { refundAccountHolder: parsed.refundAccountHolder?.trim() || null } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes?.trim() || null } : {}),
      },
    });
    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5B. APPROVAL, REMINDER, REJECT, RESUBMIT & VOID FOR PAYMENTS (KWITANSI / TT)
// ============================================================================
penerimaanRouter.post('/payments/:id/approve', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        businessUnit: true,
        bankAccount: true,
        customerInvoice: { include: { customer: true, businessUnit: true } },
      },
    });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');
    if (payment.status === 'VOID') {
      throw new AppError(409, 'PAYMENT_VOIDED', `Dokumen ${payment.receiptNumber} sudah dibatalkan.`);
    }
    if (payment.approvalStatus === 'APPROVED' && payment.status === 'CONFIRMED') {
      throw new AppError(409, 'ALREADY_APPROVED', `Dokumen ${payment.receiptNumber} sudah disetujui sebelumnya.`);
    }
    if (payment.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'INVALID_APPROVAL_STATE', `Dokumen ${payment.receiptNumber} berstatus ${payment.approvalStatus}. Ajukan ulang terlebih dahulu sebelum disetujui.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      let journalId = payment.journalEntryId;

      if (!payment.customerInvoiceId) {
        // Direct receipt (Kwitansi / Tanda Terima tanpa Invoice)
        const journal = await postDirectReceiptJournal(tx, payment, {
          userId: req.user!.userId,
          fullName: req.user!.fullName,
        });
        journalId = journal.id;
      } else {
        // Payment settling an approved CustomerInvoice
        const inv = await tx.customerInvoice.findUnique({
          where: { id: payment.customerInvoiceId },
          include: { customer: true, businessUnit: true },
        });
        if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice terkait pembayaran ini tidak ditemukan.');
        if (inv.status === 'VOID') {
          throw new AppError(409, 'INVOICE_VOIDED', `Invoice ${inv.docNumber} sudah HANGUS sehingga pembayaran tidak dapat disetujui.`);
        }
        if (inv.approvalStatus !== 'APPROVED') {
          throw new AppError(409, 'INVOICE_NOT_APPROVED', `Invoice ${inv.docNumber} belum disetujui Manajer Keuangan.`);
        }

        const gross = fromCents(toCents(payment.grossAmount));
        const fee = fromCents(toCents(payment.feeAmount));
        const net = fromCents(toCents(payment.netAmount));
        const storedOverpay = fromCents(toCents(payment.overpaymentAmount || 0));
        let appliedToInvoice = subMoney(gross, storedOverpay);
        let overpayment = storedOverpay;

        if (toCents(appliedToInvoice) > toCents(inv.balanceDue)) {
          appliedToInvoice = fromCents(toCents(inv.balanceDue));
          overpayment = subMoney(gross, appliedToInvoice);
        }

        const newPaid = addMoney(inv.paidAmount, appliedToInvoice);
        const newBalance = subMoney(inv.totalAmount, newPaid);
        const newInvoiceStatus = toCents(newBalance) === 0n ? 'PAID' : 'PARTIALLY_PAID';

        await tx.customerInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: newPaid,
            balanceDue: newBalance,
            status: newInvoiceStatus,
          },
        });

        if (inv.salesOrderId) {
          await tx.salesOrder.update({
            where: { id: inv.salesOrderId },
            data: { status: newInvoiceStatus },
          });
        }

        if (payment.method === 'CASH' && payment.cashierSessionId) {
          const session = await tx.cashierSession.findUnique({ where: { id: payment.cashierSessionId } });
          if (session && session.status === 'OPEN') {
            const nextCashIn = addMoney(session.totalCashIn, net);
            const nextTheoretical = subMoney(addMoney(session.openingFloat, nextCashIn), session.totalCashOut);
            await tx.cashierSession.update({
              where: { id: session.id },
              data: { totalCashIn: nextCashIn, theoreticalBalance: nextTheoretical },
            });
          }
        }

        const cashOrBankCoa =
          payment.method === 'CASH'
            ? await resolveSafeCoa(tx, '110101010100', '1-1110')
            : await resolveSafeCoa(tx, '110102010100', '1-1120');
        const arCoa = await resolveSafeCoa(tx, '110302030100', '1-1210');
        const feeCoa = await resolveSafeCoa(tx, '590101010300', '5-1500');
        const overpayCoa = await resolveSafeCoa(tx, '210101010200', '210301010200');

        const journalLines: Array<{ accountCode: string; description: string; debit: string; credit: string }> = [
          {
            accountCode: cashOrBankCoa,
            description: `Penerimaan bersih pembayaran ${inv.docNumber} (${payment.method})`,
            debit: net,
            credit: '0.00',
          },
        ];
        if (toCents(appliedToInvoice) > 0n) {
          journalLines.push({
            accountCode: arCoa,
            description: `Pelunasan piutang ${inv.docNumber} (${inv.customer.name})`,
            debit: '0.00',
            credit: appliedToInvoice,
          });
        }
        if (toCents(fee) > 0n) {
          journalLines.push({
            accountCode: feeCoa,
            description: `Potongan merchant/provider fee atas pembayaran ${inv.docNumber}`,
            debit: fee,
            credit: '0.00',
          });
        }
        if (toCents(overpayment) > 0n) {
          journalLines.push({
            accountCode: overpayCoa,
            description: `Kelebihan bayar / pengembalian dana atas ${inv.docNumber} (${inv.customer.name})`,
            debit: '0.00',
            credit: overpayment,
          });
        }

        const journal = await createOrGetBalancedJournal(
          {
            entryDate: new Date(payment.paymentDate),
            businessUnitId: inv.businessUnitId,
            sourceType: 'PAYMENT',
            sourceId: inv.id,
            sourceDocNumber: inv.docNumber,
            idempotencyKey: `PAYMENT_APPROVE_JRN_${payment.id}`,
            description: `Penerimaan Pembayaran Invoice ${inv.docNumber} dari ${inv.customer.name} (${payment.receiptNumber})`,
            createdById: req.user!.userId,
            createdByName: req.user!.fullName,
            lines: journalLines,
          },
          tx
        );
        journalId = journal.id;

        if (overpayment !== storedOverpay) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { overpaymentAmount: overpayment },
          });
        }
      }

      const nextPay = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CONFIRMED',
          approvalStatus: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
          rejectedById: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
          journalEntryId: journalId,
        },
        include: { businessUnit: true, bankAccount: true, customerInvoice: true },
      });

      await tx.notification.updateMany({
        where: { entityType: 'Payment', entityId: payment.id, isRead: false },
        data: { isRead: true },
      });

      const docLabel = payment.receiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : 'Kwitansi';
      if (payment.receivedById && payment.receivedById !== req.user!.userId) {
        await pushPenerimaanNotification(tx, {
          userId: payment.receivedById,
          title: `${docLabel} Disetujui: ${payment.receiptNumber}`,
          message: `${req.user!.fullName} telah menyetujui ${docLabel} ${payment.receiptNumber}. Jurnal telah diposting ke BKU & tombol Cetak kini aktif.`,
          severity: 'INFO',
          targetUrl: '/revenue?tab=buku_harian',
          entityType: 'Payment',
          entityId: payment.id,
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_APPROVED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Menyetujui penerbitan ${docLabel} ${payment.receiptNumber} (${payment.payerName || 'Pelanggan'}) sebesar Rp ${Number(payment.grossAmount).toLocaleString('id-ID')}`,
          afterData: { status: 'CONFIRMED', approvalStatus: 'APPROVED', journalEntryId: journalId },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextPay;
    });

    res.json({
      success: true,
      data: {
        ...updated,
        grossAmount: Number(updated.grossAmount),
        feeAmount: Number(updated.feeAmount),
        netAmount: Number(updated.netAmount),
        overpaymentAmount: Number(updated.overpaymentAmount),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.post('/payments/:id/reject', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 4) {
      throw new AppError(400, 'REJECT_REASON_REQUIRED', 'Catatan alasan revisi / penolakan wajib diisi minimal 4 karakter.');
    }
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');
    if (payment.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'INVALID_APPROVAL_STATE', `Dokumen ${payment.receiptNumber} tidak sedang menunggu approval.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextPay = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REJECTED',
          approvalStatus: 'REJECTED',
          rejectedById: req.user!.userId,
          rejectedByName: req.user!.fullName,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });

      await tx.notification.updateMany({
        where: { entityType: 'Payment', entityId: payment.id, isRead: false },
        data: { isRead: true },
      });

      const docLabel = payment.receiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : 'Kwitansi';
      if (payment.receivedById && payment.receivedById !== req.user!.userId) {
        await pushPenerimaanNotification(tx, {
          userId: payment.receivedById,
          title: `Revisi ${docLabel} Diperlukan: ${payment.receiptNumber}`,
          message: `${req.user!.fullName} meminta revisi atas ${docLabel} ${payment.receiptNumber}: "${reason}".`,
          severity: 'WARNING',
          targetUrl: '/revenue?tab=buku_harian&status=REJECTED',
          entityType: 'Payment',
          entityId: payment.id,
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_REJECTED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Meminta revisi ${docLabel} ${payment.receiptNumber}: ${reason}`,
          afterData: { status: 'REJECTED', approvalStatus: 'REJECTED', rejectionReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextPay;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.post('/payments/:id/remind', async (req, res, next) => {
  try {
    const perms = req.user?.permissions || [];
    if (perms.includes('payment:approve') && !perms.includes('*')) {
      throw new AppError(
        400,
        'APPROVER_CANNOT_REMIND_SELF',
        'Sebagai Manajer Keuangan/Approver, Anda dapat langsung menyetujui atau meminta revisi tanpa perlu mengirim pengingat ke diri sendiri.'
      );
    }
    if (!perms.includes('*') && !perms.includes('payment:create') && !perms.includes('revenue:create')) {
      throw new AppError(403, 'FORBIDDEN_PERMISSION', 'Akses ditolak. Memerlukan izin input penerimaan untuk mengirim pengingat.');
    }
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { businessUnit: true },
    });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');
    if (payment.approvalStatus !== 'PENDING_APPROVAL') {
      throw new AppError(409, 'NOT_PENDING_APPROVAL', `Dokumen ${payment.receiptNumber} tidak sedang menunggu persetujuan.`);
    }
    if (payment.lastRemindedAt) {
      const elapsed = Date.now() - payment.lastRemindedAt.getTime();
      if (elapsed < REMIND_COOLDOWN_MS) {
        const waitSec = Math.ceil((REMIND_COOLDOWN_MS - elapsed) / 1000);
        throw new AppError(429, 'REMIND_COOLDOWN', `Pengingat baru saja dikirim. Tunggu ${waitSec} detik sebelum mengingatkan kembali.`);
      }
    }

    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? ` Catatan: ${req.body.note.trim()}` : '';
    const docLabel = payment.receiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : payment.receiptType === 'KUITANSI_UM' ? 'Kwitansi Uang Muka' : 'Kwitansi';

    const updated = await prisma.$transaction(async (tx) => {
      const nextPay = await tx.payment.update({
        where: { id: payment.id },
        data: {
          lastRemindedAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });

      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Pengingat Approval ${docLabel} (${nextPay.reminderCount}x): ${payment.receiptNumber}`,
        message: `${req.user!.fullName} mengingatkan persetujuan ${docLabel} ${payment.receiptNumber} (${payment.businessUnit?.code || 'PMO'} - ${payment.payerName || 'Pelanggan'}, Rp ${Number(payment.grossAmount).toLocaleString('id-ID')}) agar dapat segera dicetak.${note}`,
        severity: 'WARNING',
        targetUrl: '/revenue?tab=buku_harian&status=PENDING_APPROVAL',
        entityType: 'Payment',
        entityId: payment.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_REMINDED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Mengirim pengingat ke-${nextPay.reminderCount} kepada Manajer Keuangan untuk approval ${docLabel} ${payment.receiptNumber}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return nextPay;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.post('/payments/:id/resubmit', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const schema = z.object({
      payerName: z.string().min(2).optional(),
      activityTitle: z.string().min(3).optional(),
      activityDate: z.string().nullable().optional(),
      rincianLabel: z.string().min(2).optional(),
      revenueAccountCode: z.string().min(4).optional(),
      grossAmount: z.number().positive().optional(),
      taxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'PPN12_PPH23_15', 'PPH21_5', 'BEBAS_PAJAK']).optional(),
      taxCollectorProfile: z.enum(['FP_040_UMUM', 'FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH', 'INTERNAL_UT']).optional(),
      taxInclusive: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    });
    const parsed = schema.parse(req.body || {});
    const existing = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');
    if (existing.approvalStatus !== 'REJECTED') {
      throw new AppError(409, 'NOT_REJECTED', 'Hanya transaksi berstatus Perlu Revisi yang dapat diajukan ulang.');
    }

    const nextGross = parsed.grossAmount !== undefined ? parsed.grossAmount : Number(existing.grossAmount);
    const feeNum = Number(existing.feeAmount || 0);
    const overpayNum = Math.min(nextGross, Math.round(Number(existing.overpaymentAmount || 0)));
    const nextScheme = normalizeTaxScheme(parsed.taxScheme || existing.taxScheme);
    const nextCollector = normalizeCollectorProfile(parsed.taxCollectorProfile || existing.taxCollectorProfile);
    const nextInclusive = parsed.taxInclusive !== undefined ? parsed.taxInclusive : existing.taxInclusive !== false;
    const tax = computePtnbhRevenueTax({
      amountAfterDiscount: Math.max(0, Math.round(nextGross) - overpayNum),
      taxScheme: nextScheme,
      taxInclusive: nextInclusive,
      taxCollectorProfile: nextCollector,
      taxAlreadyProcessed: existing.taxAlreadyProcessed,
    });

    const updated = await prisma.$transaction(async (tx) => {
      const nextPay = await tx.payment.update({
        where: { id: existing.id },
        data: {
          ...(parsed.payerName ? { payerName: parsed.payerName.trim() } : {}),
          ...(parsed.activityTitle ? { activityTitle: parsed.activityTitle.trim() } : {}),
          ...(parsed.activityDate !== undefined ? { activityDate: parsed.activityDate?.trim() || null } : {}),
          ...(parsed.rincianLabel ? { rincianLabel: parsed.rincianLabel.trim() } : {}),
          ...(parsed.revenueAccountCode ? { revenueAccountCode: parsed.revenueAccountCode.trim() } : {}),
          ...(parsed.notes !== undefined ? { notes: parsed.notes?.trim() || null } : {}),
          grossAmount: fromCents(toCents(nextGross)),
          netAmount: subMoney(fromCents(toCents(nextGross)), fromCents(toCents(feeNum))),
          taxScheme: tax.taxScheme,
          taxInclusive: tax.taxInclusive,
          taxCollectorProfile: tax.taxCollectorProfile,
          brutoDocumentAmount: fromCents(toCents(tax.brutoDocumentAmount)),
          nilaiJual: fromCents(toCents(tax.nilaiJual)),
          dppPb1: fromCents(toCents(tax.dppPb1)),
          dppPpn: fromCents(toCents(tax.dppPpn)),
          dppPph: fromCents(toCents(tax.dppPph)),
          ppnAmount: fromCents(toCents(tax.ppnAmount)),
          pph42Amount: fromCents(toCents(tax.pph42Amount)),
          pph23Amount: fromCents(toCents(tax.pph23Amount)),
          pph23Rate15Amount: fromCents(toCents(tax.pph23Rate15Amount)),
          pph21Amount: fromCents(toCents(tax.pph21Amount)),
          pb1Amount: fromCents(toCents(tax.pb1Amount)),
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING_APPROVAL',
          rejectedById: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      const docLabel = existing.receiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : 'Kwitansi';
      await pushPenerimaanNotification(tx, {
        roleCode: 'FINANCE_MANAGER',
        title: `Pengajuan Ulang ${docLabel}: ${existing.receiptNumber}`,
        message: `${req.user!.fullName} telah merevisi dan mengajukan ulang ${docLabel} ${existing.receiptNumber} (${nextPay.payerName || 'Pelanggan'}, Rp ${Number(nextPay.grossAmount).toLocaleString('id-ID')}) untuk disetujui.`,
        severity: 'INFO',
        targetUrl: '/revenue?tab=buku_harian&status=PENDING_APPROVAL',
        entityType: 'Payment',
        entityId: existing.id,
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_RESUBMITTED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: existing.id,
          entityCode: existing.receiptNumber,
          summary: `Mengajukan ulang ${docLabel} ${existing.receiptNumber} setelah revisi`,
          requestId: req.requestId,
        },
        tx as any
      );

      return nextPay;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.post('/payments/:id/void', async (req, res, next) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 4) {
      throw new AppError(400, 'VOID_REASON_REQUIRED', 'Alasan pembatalan dokumen wajib diisi minimal 4 karakter.');
    }
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { customerInvoice: true },
    });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');
    if (payment.status === 'VOID') {
      throw new AppError(409, 'ALREADY_VOID', `Dokumen ${payment.receiptNumber} sudah dibatalkan.`);
    }

    const perms = req.user?.permissions || [];
    const isApprover = perms.includes('*') || perms.includes('payment:approve');
    const isCreatorPerm = perms.includes('*') || perms.includes('payment:create');

    if (payment.status === 'CONFIRMED' && !isApprover) {
      throw new AppError(403, 'FORBIDDEN_PERMISSION', 'Pembatalan dokumen yang sudah disetujui hanya dapat dilakukan oleh Manajer Keuangan.');
    }
    if (!isCreatorPerm && !isApprover) {
      throw new AppError(403, 'FORBIDDEN_PERMISSION', 'Anda tidak memiliki izin untuk membatalkan transaksi ini.');
    }

    const matchedLine = await prisma.bankStatementLine.findFirst({
      where: { matchedEntityType: 'Payment', matchedEntityId: payment.id, matchStatus: 'MATCHED' },
      include: { statementImport: true },
    });
    if (matchedLine?.statementImport?.status === 'FINALIZED') {
      throw new AppError(409, 'RECONCILIATION_FINALIZED', `Dokumen ${payment.receiptNumber} sudah difinalisasi pada rekonsiliasi bank ${matchedLine.statementImport.importNumber} dan tidak dapat dibatalkan.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Unmatch non-finalized bank line if any
      if (matchedLine) {
        await tx.bankStatementLine.update({
          where: { id: matchedLine.id },
          data: { matchStatus: 'UNMATCHED', matchedEntityType: null, matchedEntityId: null, matchedDocNumber: null, reconciledAt: null },
        });
      }

      // Reverse GL journal if already posted
      if (payment.journalEntryId) {
        const origJournal = await tx.journalEntry.findUnique({
          where: { id: payment.journalEntryId },
          include: { lines: true },
        });
        if (origJournal && origJournal.status === 'POSTED' && origJournal.lines.length > 0) {
          await createOrGetBalancedJournal(
            {
              entryDate: new Date(),
              businessUnitId: origJournal.businessUnitId,
              sourceType: 'PAYMENT_VOID',
              sourceId: payment.id,
              sourceDocNumber: payment.receiptNumber,
              idempotencyKey: `PAYMENT_VOID_${payment.id}`,
              description: `Jurnal Pembalik Pembatalan ${payment.receiptNumber}: ${reason}`,
              createdById: req.user!.userId,
              createdByName: req.user!.fullName,
              lines: origJournal.lines.map((l) => ({
                accountCode: l.accountCode,
                costCenterId: l.costCenterId,
                description: `Pembalik Batal ${payment.receiptNumber}: ${l.description}`,
                debit: l.credit.toString(),
                credit: l.debit.toString(),
              })),
            },
            tx
          );
        }
      }

      // Restore invoice balance if this confirmed payment had settled an invoice
      if (payment.status === 'CONFIRMED' && payment.customerInvoiceId && payment.customerInvoice) {
        const applied = subMoney(fromCents(toCents(payment.grossAmount)), fromCents(toCents(payment.overpaymentAmount || 0)));
        const restoredPaidCents = toCents(payment.customerInvoice.paidAmount) - toCents(applied);
        const safePaid = fromCents(restoredPaidCents > 0n ? restoredPaidCents : 0n);
        const safeBalance = subMoney(payment.customerInvoice.totalAmount, safePaid);
        await tx.customerInvoice.update({
          where: { id: payment.customerInvoiceId },
          data: {
            paidAmount: safePaid,
            balanceDue: safeBalance,
            status: toCents(safePaid) === 0n ? 'ISSUED' : 'PARTIALLY_PAID',
          },
        });
      }

      const nextPay = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'VOID',
          voidReason: reason,
          voidedAt: new Date(),
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_VOIDED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Membatalkan dokumen ${payment.receiptNumber} (${payment.payerName || 'Pelanggan'}). Alasan: ${reason}`,
          afterData: { status: 'VOID', voidReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return nextPay;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Upload or replace Payment Proof (image/PDF) for any Buku Harian payment
penerimaanRouter.post('/payments/:id/proof', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const schema = z.object({
      dataUrl: z.string().min(20, 'File bukti pembayaran wajib diunggah.'),
      fileName: z.string().optional(),
    });
    const parsed = schema.parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Data penerimaan tidak ditemukan.');

    const saved = await savePaymentProofFromDataUrl({
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      dataUrl: parsed.dataUrl,
      fileName: parsed.fileName,
      uploadedById: req.user!.userId,
      uploadedByName: req.user!.fullName,
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'PAYMENT_PROOF_UPLOADED',
      module: 'REVENUE',
      entityType: 'Payment',
      entityId: payment.id,
      entityCode: payment.receiptNumber,
      summary: `Mengunggah bukti pembayaran (${saved.displayName}) untuk ${payment.receiptNumber}`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: saved, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Retrieve Payment Proof binary (JWT protected)
penerimaanRouter.get('/payments/:id/proof', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const { attachment, buffer } = await loadPaymentProofBinary(req.params.id);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.displayName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. SHARED HELPER FOR BUKU HARIAN & PERINCIAN PAJAK + BKU + SURAT PENARIKAN
// ============================================================================
async function loadMonthlyBukuHarianData(params: {
  month?: string;
  businessUnitId?: string;
  bankAccountCode?: string;
  paymentStage?: string;
  receiptType?: string;
  approvalStatus?: string;
  coa?: string;
  search?: string;
  reconciledOnly?: boolean;
  includeJournals?: boolean;
  includeUnapproved?: boolean;
  user: any;
}) {
  const { start, end, label, ym } = formatMonthPeriodLabel(params.month);
  const where: any = params.includeUnapproved
    ? {
        status: { in: ['PENDING_APPROVAL', 'CONFIRMED', 'REJECTED', 'VOID'] },
        paymentDate: { gte: start, lt: end },
      }
    : {
        status: 'CONFIRMED',
        approvalStatus: 'APPROVED',
        paymentDate: { gte: start, lt: end },
      };

  let scopedUnitId: string | undefined;
  if (params.user?.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(params.user.roleCode)) {
    scopedUnitId = params.user.businessUnitId;
  } else if (params.businessUnitId) {
    scopedUnitId = params.businessUnitId;
  }

  const [payments, coaList, matchedBankLines, allBanks] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        businessUnit: true,
        customer: true,
        bankAccount: true,
        customerInvoice: {
          include: {
            customer: true,
            businessUnit: true,
            lines: true,
            payments: {
              where: { status: 'CONFIRMED' },
              select: { id: true, grossAmount: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.chartOfAccount.findMany({ select: { code: true, name: true } }),
    prisma.bankStatementLine.findMany({
      where: {
        matchedEntityType: 'Payment',
        matchStatus: 'MATCHED',
        matchedEntityId: { not: null },
      },
      include: {
        statementImport: { select: { importNumber: true, periodLabel: true, status: true } },
      },
    }),
    prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
  ]);

  const bankByCode = new Map(allBanks.map((b) => [b.code, b]));
  const coaNameMap = new Map(coaList.map((c) => [c.code, c.name]));
  const reconByPaymentId = new Map<string, (typeof matchedBankLines)[number]>();
  for (const ml of matchedBankLines) {
    if (ml.matchedEntityId) reconByPaymentId.set(ml.matchedEntityId, ml);
  }
  const proofMap = await getPaymentProofMap(payments.map((p) => p.id));

  const rows: BukuHarianRowExport[] = [];
  const rawRecords: any[] = [];
  let rowNo = 0;
  let allScopeCount = 0;
  let allScopeReconciledCount = 0;
  let allScopeUnreconciledCount = 0;
  let allScopeReconciledAmount = 0;
  let allScopeUnreconciledAmount = 0;
  let pendingApprovalCount = 0;
  let rejectedCount = 0;
  let approvedCount = 0;
  let voidCount = 0;

  for (const p of payments) {
    const inv = p.customerInvoice;
    const bu = p.businessUnit || inv?.businessUnit;
    if (scopedUnitId && bu?.id !== scopedUnitId) continue;

    const effectiveBankCode =
      p.bankAccount?.code || inferPreferredMandiriCode(bu?.code, `${p.rincianLabel || ''} ${p.activityTitle || ''}`);
    if (params.bankAccountCode && effectiveBankCode !== params.bankAccountCode) continue;

    const stage = p.paymentStage || (inv?.invoiceType === 'UANG_MUKA' ? 'UANG_MUKA' : 'PELUNASAN');
    if (params.paymentStage && stage !== params.paymentStage) continue;

    const recType = p.receiptType || 'KUITANSI';
    if (params.receiptType && recType !== params.receiptType) continue;

    const coaCode = p.revenueAccountCode || inv?.revenueAccountCode || getDefaultRevenueCoaForUnit(bu?.code);
    if (params.coa && coaCode !== params.coa) continue;

    const isApprovedConfirmed = p.status === 'CONFIRMED' && p.approvalStatus === 'APPROVED';
    if (p.status === 'VOID') voidCount++;
    else if (p.approvalStatus === 'PENDING_APPROVAL') pendingApprovalCount++;
    else if (p.approvalStatus === 'REJECTED') rejectedCount++;
    else if (isApprovedConfirmed) approvedCount++;

    if (params.approvalStatus) {
      if (params.approvalStatus === 'VOID' && p.status !== 'VOID') continue;
      if (params.approvalStatus !== 'VOID' && (p.status === 'VOID' || p.approvalStatus !== params.approvalStatus)) continue;
    }

    const payerName = p.payerName || p.customer?.name || inv?.customer?.name || 'Pelanggan Umum';
    const activityTitle = p.activityTitle || inv?.activityTitle || inv?.lines?.[0]?.description || p.notes || 'Penerimaan Layanan PMO';
    const rincianLabel = p.rincianLabel || inv?.rincianLabel || inv?.lines?.[0]?.description || 'Layanan Unit';
    const invoiceDocNumber = inv?.docNumber || p.externalInvoiceNo || '';

    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      const hay = `${p.receiptNumber} ${invoiceDocNumber} ${payerName} ${activityTitle} ${rincianLabel} ${coaCode} ${p.picName || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const bankReceivedAmount = Number(p.grossAmount);
    const reconLine = reconByPaymentId.get(p.id) || null;
    const isReconciled = Boolean(reconLine);

    if (isApprovedConfirmed) {
      allScopeCount++;
      if (isReconciled) {
        allScopeReconciledCount++;
        allScopeReconciledAmount += bankReceivedAmount;
      } else {
        allScopeUnreconciledCount++;
        allScopeUnreconciledAmount += bankReceivedAmount;
      }
    }

    if (params.reconciledOnly && !isReconciled) continue;

    const feeAmount = Number(p.feeAmount);
    const overpaymentAmount = Number(p.overpaymentAmount || 0);
    const taxScheme = normalizeTaxScheme(p.taxScheme || inv?.taxScheme || 'PPN12_PMK131');
    const taxCollectorProfile = normalizeCollectorProfile(p.taxCollectorProfile || inv?.taxCollectorProfile || 'FP_040_UMUM');

    // Recompute or read stored PTNBH tax breakdown (handles legacy payments that had 0 in new columns)
    const hasStoredBreakdown =
      Number(p.nilaiJual) > 0 || Number(p.dppPb1) > 0 || Number(p.ppnAmount) > 0 || Number(p.pb1Amount) > 0;
    const computed = hasStoredBreakdown
      ? computePtnbhRevenueTax({
        amountAfterDiscount: Math.max(0, Number(p.brutoDocumentAmount) || bankReceivedAmount - overpaymentAmount),
        taxScheme,
        taxInclusive: true,
        taxCollectorProfile,
        taxAlreadyProcessed: p.taxAlreadyProcessed,
      })
      : computePtnbhRevenueTax({
        amountAfterDiscount: Math.max(0, bankReceivedAmount - overpaymentAmount),
        taxScheme: inv ? taxScheme : 'PPN12_PMK131',
        taxInclusive: true,
        taxCollectorProfile,
        taxAlreadyProcessed: p.taxAlreadyProcessed,
      });

    const brutoDocumentAmount = Number(p.brutoDocumentAmount) > 0 ? Number(p.brutoDocumentAmount) : computed.brutoDocumentAmount;
    const nilaiJual = Number(p.nilaiJual) > 0 ? Number(p.nilaiJual) : computed.nilaiJual;
    const dppPb1 = Number(p.dppPb1) > 0 ? Number(p.dppPb1) : computed.dppPb1;
    const dppPpn = Number(p.dppPpn) > 0 ? Number(p.dppPpn) : computed.dppPpn;
    const dppPph = Number(p.dppPph) > 0 ? Number(p.dppPph) : computed.dppPph;
    const ppnAmount = Number(p.ppnAmount) > 0 ? Number(p.ppnAmount) : computed.ppnAmount;
    const pph42Amount = Number(p.pph42Amount) > 0 ? Number(p.pph42Amount) : computed.pph42Amount;
    const pph23Amount = Number(p.pph23Amount) > 0 ? Number(p.pph23Amount) : computed.pph23Amount;
    const pph23Rate15Amount = Number(p.pph23Rate15Amount || 0) > 0 ? Number(p.pph23Rate15Amount) : computed.pph23Rate15Amount;
    const pph21Amount = Number(p.pph21Amount || 0) > 0 ? Number(p.pph21Amount) : computed.pph21Amount;
    const pb1Amount = Number(p.pb1Amount) > 0 ? Number(p.pb1Amount) : computed.pb1Amount;

    // Prior payments on the same invoice before this receipt (for KU-001 DP/Pelunasan print block)
    let invoicePreviousPaidAmount = 0;
    if (inv?.payments?.length) {
      for (const prev of inv.payments) {
        if (prev.id === p.id) break;
        invoicePreviousPaidAmount += Number(prev.grossAmount || 0);
      }
    }
    const resolvedBankObj = p.bankAccount || bankByCode.get(effectiveBankCode);

    rowNo++;
    const item: BukuHarianRowExport & {
      id: string;
      createdAt: string;
      customerInvoiceId: string | null;
      businessUnitId: string | null;
      bankAccountId: string | null;
      bankAccountNumber: string;
      bankAccountHolder: string;
      invoiceTotalAmount: number;
      invoicePaidAmount: number;
      invoicePreviousPaidAmount: number;
      refundBankName: string;
      refundAccountNumber: string;
      refundAccountHolder: string;
      isReconciled: boolean;
      reconciliationStatus: 'RECONCILED' | 'UNRECONCILED';
      reconciledAt: string | null;
      reconciledBankRef: string | null;
      reconciledImportNumber: string | null;
      reconciledImportFinalized: boolean;
      status: string;
      approvalStatus: string;
      approvedByName: string | null;
      approvedAt: string | null;
      rejectedByName: string | null;
      rejectedAt: string | null;
      rejectionReason: string | null;
      lastRemindedAt: string | null;
      reminderCount: number;
      voidReason: string | null;
      receivedByName: string;
      taxInclusive: boolean;
      paymentProof: { id: string; displayName: string; mimeType: string; sizeBytes: number } | null;
    } = {
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      customerInvoiceId: p.customerInvoiceId,
      businessUnitId: bu?.id || null,
      bankAccountId: p.bankAccountId || resolvedBankObj?.id || null,
      bankAccountCode: effectiveBankCode,
      bankAccountNumber: resolvedBankObj?.accountNumberMasked || '164-00-2022-999-5',
      bankAccountHolder: resolvedBankObj?.accountHolder || 'PTNBH UT .USAHA NON AKADEMIK',
      no: rowNo,
      paymentDate: p.paymentDate.toISOString().slice(0, 10),
      receiptNumber: p.receiptNumber,
      receiptType: recType,
      picName: p.picName || inv?.picName || '',
      subCategory: p.subCategory || inv?.subCategory || (taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum'),
      businessUnitCode: bu?.code || 'PMO',
      businessUnitName: bu?.name || 'PMO UTama',
      payerName,
      payerTaxId: p.payerTaxId || p.customer?.taxIdNpwp || inv?.customer?.taxIdNpwp || '',
      payerAddress: p.payerAddress || p.customer?.address || inv?.customer?.address || '',
      invoiceDocNumber,
      invoiceDate: inv?.issueDate ? inv.issueDate.toISOString().slice(0, 10) : '',
      paymentStage: stage,
      activityTitle,
      activityDate: p.activityDate || inv?.activityDate || '',
      rincianLabel,
      revenueAccountCode: coaCode,
      revenueAccountName: coaNameMap.get(coaCode) || 'Pendapatan Unit Bisnis',
      taxScheme,
      taxCollectorProfile,
      fakturPajakCode: inv?.fakturPajakCode || computed.fakturPajakCode,
      bankReceivedAmount,
      brutoDocumentAmount,
      nilaiJual,
      dppPb1,
      dppPpn,
      dppPph,
      ppnAmount,
      pph42Amount,
      pph23Amount,
      pph23Rate15Amount,
      pph21Amount,
      pb1Amount,
      utRemitPpn: computed.utRemitPpn,
      utRemitPph42: computed.utRemitPph42,
      utRemitPph23Rate15: computed.utRemitPph23Rate15,
      utRemitPph21: computed.utRemitPph21,
      utRemitPb1: computed.utRemitPb1,
      feeAmount,
      overpaymentAmount,
      refundBankName: p.refundBankName || '',
      refundAccountNumber: p.refundAccountNumber || '',
      refundAccountHolder: p.refundAccountHolder || '',
      withholdingSlipNo: p.withholdingSlipNo || '',
      taxAlreadyProcessed: Boolean(p.taxAlreadyProcessed),
      depositDate: (p.depositDate || p.paymentDate).toISOString().slice(0, 10),
      method: p.method,
      referenceNo: p.referenceNo,
      notes: p.notes || '',
      bankName: resolvedBankObj?.bankName || 'Bank Mandiri (Final) - Penerimaan Usaha Non Akademik',
      invoiceTotalAmount: inv ? Number(inv.totalAmount) : bankReceivedAmount,
      invoicePaidAmount: inv ? Number(inv.paidAmount) : bankReceivedAmount,
      invoicePreviousPaidAmount,
      invoiceBalanceDue: inv ? Number(inv.balanceDue) : 0,
      isReconciled,
      reconciliationStatus: isReconciled ? 'RECONCILED' : 'UNRECONCILED',
      reconciledAt: reconLine?.reconciledAt ? reconLine.reconciledAt.toISOString().slice(0, 10) : null,
      reconciledBankRef: reconLine?.referenceNo || null,
      reconciledImportNumber: reconLine?.statementImport?.importNumber || null,
      reconciledImportFinalized: reconLine?.statementImport?.status === 'FINALIZED',
      status: p.status,
      approvalStatus: p.approvalStatus || 'APPROVED',
      approvedByName: p.approvedByName || null,
      approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
      rejectedByName: p.rejectedByName || null,
      rejectedAt: p.rejectedAt ? p.rejectedAt.toISOString() : null,
      rejectionReason: p.rejectionReason || null,
      lastRemindedAt: p.lastRemindedAt ? p.lastRemindedAt.toISOString() : null,
      reminderCount: p.reminderCount || 0,
      voidReason: p.voidReason || null,
      receivedByName: p.receivedByName || '',
      taxInclusive: p.taxInclusive !== false,
      paymentProof: proofMap.get(p.id) || null,
    };
    if (isApprovedConfirmed) {
      rows.push(item);
    }
    rawRecords.push(item);
  }

  // Pivot by COA & Breakdown by 4 Business Units (with official RAB Pendapatan 2027 targets)
  const pivotMap = new Map<string, { coa: string; coaName: string; count: number; totalReceived: number; totalBruto: number; totalTaxUt: number }>();
  const unitMap = new Map<
    string,
    {
      unitCode: string;
      unitName: string;
      count: number;
      reconciledCount: number;
      totalReceived: number;
      totalBruto: number;
      totalTaxUt: number;
      totalOverpayment: number;
      netClean: number;
      targetRabAnnual: number;
      targetRabMonthly: number;
      realizationPercentAnnual: number;
      realizationPercentMonthly: number;
    }
  >();
  // Pre-seed all 4 official operational units so Target RAB vs Realisasi is always visible when unfiltered
  if (!scopedUnitId) {
    for (const [uCode, meta] of Object.entries(OFFICIAL_UNIT_RAB_TARGETS)) {
      unitMap.set(uCode, {
        unitCode: uCode,
        unitName: meta.unitName,
        count: 0,
        reconciledCount: 0,
        totalReceived: 0,
        totalBruto: 0,
        totalTaxUt: 0,
        totalOverpayment: 0,
        netClean: 0,
        targetRabAnnual: meta.annualTarget,
        targetRabMonthly: Math.round(meta.annualTarget / 12),
        realizationPercentAnnual: 0,
        realizationPercentMonthly: 0,
      });
    }
  }
  const coaTaxMatrix: Record<string, { ppn: number; pph42: number; pph23: number; pph23Rate15: number; pph21: number; pb1: number }> = {};
  let excludedCount = 0;
  const overpaymentItems: Array<{
    receiptNumber: string;
    payerName: string;
    activityTitle: string;
    amount: number;
    refundBankName: string;
    refundAccountNumber: string;
    refundAccountHolder: string;
  }> = [];

  for (const r of rawRecords) {
    if (r.status !== 'CONFIRMED' || r.approvalStatus !== 'APPROVED') continue;
    const taxUt = r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1;
    if (!pivotMap.has(r.revenueAccountCode)) {
      pivotMap.set(r.revenueAccountCode, {
        coa: r.revenueAccountCode,
        coaName: r.revenueAccountName,
        count: 0,
        totalReceived: 0,
        totalBruto: 0,
        totalTaxUt: 0,
      });
    }
    const pv = pivotMap.get(r.revenueAccountCode)!;
    pv.count += 1;
    pv.totalReceived += r.bankReceivedAmount;
    pv.totalBruto += r.brutoDocumentAmount;
    pv.totalTaxUt += taxUt;

    if (!unitMap.has(r.businessUnitCode)) {
      const rabMeta = OFFICIAL_UNIT_RAB_TARGETS[r.businessUnitCode];
      unitMap.set(r.businessUnitCode, {
        unitCode: r.businessUnitCode,
        unitName: r.businessUnitName,
        count: 0,
        reconciledCount: 0,
        totalReceived: 0,
        totalBruto: 0,
        totalTaxUt: 0,
        totalOverpayment: 0,
        netClean: 0,
        targetRabAnnual: rabMeta?.annualTarget || 0,
        targetRabMonthly: rabMeta ? Math.round(rabMeta.annualTarget / 12) : 0,
        realizationPercentAnnual: 0,
        realizationPercentMonthly: 0,
      });
    }
    const uv = unitMap.get(r.businessUnitCode)!;
    uv.count += 1;
    if (r.isReconciled) uv.reconciledCount += 1;
    uv.totalReceived += r.bankReceivedAmount;
    uv.totalBruto += r.brutoDocumentAmount;
    uv.totalTaxUt += taxUt;
    uv.totalOverpayment += r.overpaymentAmount;
    uv.netClean += r.bankReceivedAmount - taxUt - r.overpaymentAmount;

    if (r.taxAlreadyProcessed || ['FP_020_INSTANSI', 'FP_030_BUMN'].includes(r.taxCollectorProfile)) {
      excludedCount++;
    }

    if (taxUt > 0) {
      if (!coaTaxMatrix[r.revenueAccountCode]) {
        coaTaxMatrix[r.revenueAccountCode] = { ppn: 0, pph42: 0, pph23: 0, pph23Rate15: 0, pph21: 0, pb1: 0 };
      }
      coaTaxMatrix[r.revenueAccountCode].ppn += r.utRemitPpn;
      coaTaxMatrix[r.revenueAccountCode].pph42 += r.utRemitPph42;
      coaTaxMatrix[r.revenueAccountCode].pph23Rate15 += r.utRemitPph23Rate15;
      coaTaxMatrix[r.revenueAccountCode].pph21 += r.utRemitPph21;
      coaTaxMatrix[r.revenueAccountCode].pb1 += r.utRemitPb1;
    }

    if (r.overpaymentAmount > 0) {
      overpaymentItems.push({
        receiptNumber: r.receiptNumber,
        payerName: r.payerName,
        activityTitle: r.activityTitle,
        amount: r.overpaymentAmount,
        refundBankName: r.refundBankName || '',
        refundAccountNumber: r.refundAccountNumber || '',
        refundAccountHolder: r.refundAccountHolder || r.payerName,
      });
    }
  }

  for (const uv of unitMap.values()) {
    uv.realizationPercentAnnual = uv.targetRabAnnual > 0 ? Math.round((uv.totalReceived / uv.targetRabAnnual) * 10000) / 100 : 0;
    uv.realizationPercentMonthly = uv.targetRabMonthly > 0 ? Math.round((uv.totalReceived / uv.targetRabMonthly) * 10000) / 100 : 0;
  }

  const unitOrder = ['BU-MICE', 'BU-KLINIK', 'BU-ITS', 'BU-TCI'];
  const pivotByCoa = Array.from(pivotMap.values()).sort((a, b) => b.totalReceived - a.totalReceived);
  const byUnit = Array.from(unitMap.values()).sort((a, b) => {
    const ia = unitOrder.indexOf(a.unitCode);
    const ib = unitOrder.indexOf(b.unitCode);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return b.totalReceived - a.totalReceived;
  });
  const coaColumns = Object.keys(coaTaxMatrix).sort();
  const makeRow = (rowLabel: string, key: 'ppn' | 'pph42' | 'pph23' | 'pph23Rate15' | 'pph21' | 'pb1', refundAmount = 0) => {
    const byCoa: Record<string, number> = {};
    let total = 0;
    for (const c of coaColumns) {
      const v = coaTaxMatrix[c]?.[key] || 0;
      byCoa[c] = v;
      total += v;
    }
    return { label: rowLabel, refundAmount, byCoa, total };
  };

  const totalOverpaymentRefund = overpaymentItems.reduce((s, x) => s + x.amount, 0);
  const withdrawalRows = [
    makeRow('Total Pajak PPN 12% (DPP Nilai Lain 11/12)', 'ppn', 0),
    makeRow('Total Pajak PPh Pasal 4 Ayat (2) (10%)', 'pph42', totalOverpaymentRefund),
    makeRow('Total Pajak PPh Pasal 23 (2%)', 'pph23', 0),
    makeRow('Total Pajak Daerah 10% (PB1 Wisma)', 'pb1', 0),
  ];
  const pph2315Row = makeRow('Total Pajak PPh Pasal 23 (15%)', 'pph23Rate15', 0);
  if (pph2315Row.total > 0) withdrawalRows.push(pph2315Row);
  const pph21Row = makeRow('Total Pajak PPh Pasal 21 (2.5% / 5%)', 'pph21', 0);
  if (pph21Row.total > 0) withdrawalRows.push(pph21Row);

  const totalTaxWithdrawal = withdrawalRows.reduce((s, x) => s + x.total, 0);
  const totalReceived = rows.reduce((s, r) => s + r.bankReceivedAmount, 0);
  const totalNetClean = totalReceived - totalTaxWithdrawal - totalOverpaymentRefund;

  const activeBankObj = params.bankAccountCode ? bankByCode.get(params.bankAccountCode) : bankByCode.get('BNK-MDR-01');
  const bankFilterLabel =
    params.bankAccountCode === 'BNK-MDR-02'
      ? 'Rekening Kelolaan Bank Mandiri'
      : params.bankAccountCode === 'BNK-MDR-01'
        ? 'Rekening Final Bank Mandiri'
        : 'Seluruh Rekening Bank Mandiri';

  let journals: any[] = [];
  if (params.includeJournals) {
    const jWhere: any = {
      status: 'POSTED',
      entryDate: { gte: start, lt: end },
      sourceType: { in: ['CUSTOMER_INVOICE', 'CUSTOMER_INVOICE_VOID', 'PAYMENT', 'DIRECT_RECEIPT', 'CASH_DEPOSIT'] },
    };
    if (scopedUnitId) jWhere.businessUnitId = scopedUnitId;
    const jList = await prisma.journalEntry.findMany({
      where: jWhere,
      include: { businessUnit: true, lines: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: 150,
    });
    journals = jList.map((j) => ({
      id: j.id,
      journalNumber: j.journalNumber,
      entryDate: j.entryDate.toISOString().slice(0, 10),
      sourceType: j.sourceType,
      sourceDocNumber: j.sourceDocNumber,
      description: j.description,
      businessUnitCode: j.businessUnit?.code || 'PMO',
      totalDebit: Number(j.totalDebit),
      totalCredit: Number(j.totalCredit),
      lines: j.lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: coaNameMap.get(l.accountCode) || l.accountCode,
        description: l.description,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    }));
  }

  return {
    period: { ym, label },
    bankAccountCode: params.bankAccountCode || '',
    reconciledOnly: Boolean(params.reconciledOnly),
    summary: {
      totalTransactions: rows.length,
      totalReceived,
      totalBrutoDocument: rows.reduce((s, r) => s + r.brutoDocumentAmount, 0),
      totalTaxWithdrawal,
      totalOverpaymentRefund,
      totalNetClean,
      totalRabAnnualTarget: byUnit.reduce((s, u) => s + u.targetRabAnnual, 0),
      totalRabMonthlyTarget: byUnit.reduce((s, u) => s + u.targetRabMonthly, 0),
      totalUangMuka: rows.filter((r) => r.paymentStage === 'UANG_MUKA').reduce((s, r) => s + r.bankReceivedAmount, 0),
      totalPelunasan: rows.filter((r) => r.paymentStage !== 'UANG_MUKA').reduce((s, r) => s + r.bankReceivedAmount, 0),
      directReceiptCount: rawRecords.filter((r) => !r.customerInvoiceId && r.status === 'CONFIRMED' && r.approvalStatus === 'APPROVED').length,
      invoicedReceiptCount: rawRecords.filter((r) => Boolean(r.customerInvoiceId) && r.status === 'CONFIRMED' && r.approvalStatus === 'APPROVED').length,
      pendingApprovalCount,
      rejectedCount,
      approvedCount,
      voidCount,
      allScopeCount,
      reconciledCount: allScopeReconciledCount,
      unreconciledCount: allScopeUnreconciledCount,
      reconciledAmount: allScopeReconciledAmount,
      unreconciledAmount: allScopeUnreconciledAmount,
    },
    rows: rawRecords,
    byUnit,
    pivotByCoa,
    journals,
    withdrawal: {
      periodLabel: label,
      bankFilterLabel,
      sourceBankLabel: activeBankObj?.bankName || 'Bank Mandiri (Final) - Penerimaan Usaha Non Akademik',
      sourceBankAccountNo: activeBankObj?.accountNumberMasked || '164-00-2022-999-5',
      sourceBankAccountHolder: activeBankObj?.accountHolder || 'PTNBH UT .USAHA NON AKADEMIK',
      targetTaxBankLabel: 'Bank BRI',
      targetTaxAccountNo: '1173.01.000574.30.4',
      targetTaxAccountHolder: 'PTNBH UT NON PPh 21',
      coaColumns,
      rows: withdrawalRows,
      totalTaxWithdrawal,
      terbilangTaxWithdrawal: terbilangRupiah(totalTaxWithdrawal),
      totalOverpaymentRefund,
      overpaymentItems,
      excludedCount,
    },
  };
}

penerimaanRouter.get('/buku-harian', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const data = await loadMonthlyBukuHarianData({
      month: typeof req.query.month === 'string' ? req.query.month : undefined,
      businessUnitId: typeof req.query.businessUnitId === 'string' ? req.query.businessUnitId : undefined,
      bankAccountCode: typeof req.query.bankAccountCode === 'string' ? req.query.bankAccountCode : undefined,
      paymentStage: typeof req.query.paymentStage === 'string' ? req.query.paymentStage : undefined,
      receiptType: typeof req.query.receiptType === 'string' ? req.query.receiptType : undefined,
      approvalStatus: typeof req.query.approvalStatus === 'string' ? req.query.approvalStatus : undefined,
      coa: typeof req.query.coa === 'string' ? req.query.coa : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      reconciledOnly: req.query.reconciledOnly === 'true',
      includeJournals: req.query.includeJournals === 'true',
      includeUnapproved: true,
      user: req.user,
    });
    res.json({ success: true, data, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.get('/tax-recap', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const data = await loadMonthlyBukuHarianData({
      month: typeof req.query.month === 'string' ? req.query.month : undefined,
      businessUnitId: typeof req.query.businessUnitId === 'string' ? req.query.businessUnitId : undefined,
      bankAccountCode: typeof req.query.bankAccountCode === 'string' ? req.query.bankAccountCode : undefined,
      reconciledOnly: req.query.reconciledOnly === 'true',
      includeJournals: req.query.includeJournals === 'true',
      user: req.user,
    });
    res.json({ success: true, data, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.get('/tax-recap/export.xlsx', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const data = await loadMonthlyBukuHarianData({
      month: typeof req.query.month === 'string' ? req.query.month : undefined,
      businessUnitId: typeof req.query.businessUnitId === 'string' ? req.query.businessUnitId : undefined,
      bankAccountCode: typeof req.query.bankAccountCode === 'string' ? req.query.bankAccountCode : undefined,
      reconciledOnly: req.query.reconciledOnly === 'true',
      user: req.user,
    });
    const buffer = await buildPenerimaanMonthlyWorkbook({
      periodLabel: data.period.label,
      rows: data.rows,
      pivotByCoa: data.pivotByCoa,
      withdrawal: data.withdrawal,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const suffix = data.bankAccountCode ? `-${data.bankAccountCode}` : '';
    res.setHeader('Content-Disposition', `attachment; filename="Penerimaan-BKU-Pajak-${data.period.ym}${suffix}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. AGING PENERIMAAN (UMUR PIUTANG) + EXCEL EXPORT
// ============================================================================
async function computeAgingReceivables(params: { businessUnitId?: string; bucket?: string; search?: string; user: any }) {
  const where: any = {
    status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
    approvalStatus: 'APPROVED',
  };
  if (params.user?.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(params.user.roleCode)) {
    where.businessUnitId = params.user.businessUnitId;
  } else if (params.businessUnitId) {
    where.businessUnitId = params.businessUnitId;
  }

  const openInvoices = await prisma.customerInvoice.findMany({
    where,
    include: { customer: true, businessUnit: true, lines: true },
    orderBy: { dueDate: 'asc' },
  });

  const nowMs = Date.now();
  const buckets = { current: 0, days31to60: 0, days61to90: 0, over90: 0, totalOutstanding: 0, openCount: 0 };
  const unitMap = new Map<string, { unitId: string; unitCode: string; unitName: string; count: number; current: number; days31to60: number; days61to90: number; over90: number; total: number }>();
  const custMap = new Map<string, { customerId: string; customerCode: string; customerName: string; organizationType: string; count: number; current: number; days31to60: number; days61to90: number; over90: number; total: number }>();
  const detailedInvoices: any[] = [];

  for (const inv of openInvoices) {
    const balance = Number(inv.balanceDue);
    if (balance <= 0) continue;

    const activityTitle = inv.activityTitle || inv.lines?.[0]?.description || inv.notes || 'Tagihan Layanan';
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      if (!`${inv.docNumber} ${inv.customer.name} ${activityTitle} ${inv.businessUnit.code}`.toLowerCase().includes(q)) {
        continue;
      }
    }

    const daysOverdue = Math.floor((nowMs - new Date(inv.dueDate).getTime()) / 86400000);
    let bucketKey: 'current' | 'days31to60' | 'days61to90' | 'over90' = 'current';
    let bucketLabel = '0-30 Hari';
    if (daysOverdue > 90) {
      bucketKey = 'over90';
      bucketLabel = '> 90 Hari';
    } else if (daysOverdue > 60) {
      bucketKey = 'days61to90';
      bucketLabel = '61-90 Hari';
    } else if (daysOverdue > 30) {
      bucketKey = 'days31to60';
      bucketLabel = '31-60 Hari';
    }

    buckets[bucketKey] += balance;
    buckets.totalOutstanding += balance;
    buckets.openCount += 1;

    if (!unitMap.has(inv.businessUnitId)) {
      unitMap.set(inv.businessUnitId, {
        unitId: inv.businessUnitId,
        unitCode: inv.businessUnit.code,
        unitName: inv.businessUnit.name,
        count: 0,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0,
      });
    }
    const uEntry = unitMap.get(inv.businessUnitId)!;
    uEntry.count += 1;
    uEntry[bucketKey] += balance;
    uEntry.total += balance;

    if (!custMap.has(inv.customerId)) {
      custMap.set(inv.customerId, {
        customerId: inv.customerId,
        customerCode: inv.customer.code,
        customerName: inv.customer.name,
        organizationType: inv.customer.organizationType,
        count: 0,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0,
      });
    }
    const cEntry = custMap.get(inv.customerId)!;
    cEntry.count += 1;
    cEntry[bucketKey] += balance;
    cEntry.total += balance;

    if (!params.bucket || params.bucket === bucketKey) {
      detailedInvoices.push({
        id: inv.id,
        docNumber: inv.docNumber,
        invoiceType: inv.invoiceType,
        businessUnitId: inv.businessUnitId,
        businessUnitCode: inv.businessUnit.code,
        businessUnitName: inv.businessUnit.name,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        activityTitle,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        daysOverdue,
        bucketKey,
        bucketLabel,
        status: inv.status,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: balance,
      });
    }
  }

  return {
    asOfDate: new Date().toISOString().slice(0, 10),
    buckets,
    byUnit: Array.from(unitMap.values()).sort((a, b) => b.total - a.total),
    byCustomer: Array.from(custMap.values()).sort((a, b) => b.total - a.total),
    invoices: detailedInvoices,
  };
}

penerimaanRouter.get('/aging', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const data = await computeAgingReceivables({
      businessUnitId: typeof req.query.businessUnitId === 'string' ? req.query.businessUnitId : undefined,
      bucket: typeof req.query.bucket === 'string' ? req.query.bucket : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      user: req.user,
    });
    res.json({ success: true, data, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

penerimaanRouter.get('/aging/export.xlsx', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const data = await computeAgingReceivables({
      businessUnitId: typeof req.query.businessUnitId === 'string' ? req.query.businessUnitId : undefined,
      user: req.user,
    });
    const buffer = await buildAgingReceivablesWorkbook(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Aging-Penerimaan-${data.asOfDate}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
