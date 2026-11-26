import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth, requirePermission } from '../../middleware/auth.js';

export const reconciliationRouter = Router();

reconciliationRouter.use(requireAuth);

function computeLineFingerprint(bankAccountId: string, dateStr: string, refNo: string, direction: string, amountStr: string): string {
  const raw = `${bankAccountId}|${dateStr.slice(0, 10)}|${refNo.trim().toUpperCase()}|${direction}|${amountStr}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function parseBriStatementContent(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'File mutasi rekening koran kosong.');
  }

  // Detect separator: comma, semicolon, or tab
  const sample = lines[0];
  let sep = ',';
  if ((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) {
    sep = ';';
  } else if ((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) {
    sep = '\t';
  }

  const splitRow = (rowStr: string) => {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rowStr.length; i++) {
      const c = rowStr[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === sep && !inQuotes) {
        parts.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += c;
      }
    }
    parts.push(current.trim().replace(/^"|"$/g, ''));
    return parts;
  };

  const headerParts = splitRow(lines[0]).map((h) => h.toLowerCase());
  const isHeader =
    headerParts.some((h) => h.includes('tanggal') || h === 'tgl' || h.includes('date')) ||
    headerParts.some((h) => h.includes('debet') || h.includes('debit') || h.includes('kredit') || h.includes('credit'));

  let dateIdx = 0;
  let refIdx = 1;
  let descIdx = 2;
  let debitIdx = 3;
  let creditIdx = 4;
  let startLine = 0;

  if (isHeader) {
    startLine = 1;
    dateIdx = -1;
    refIdx = -1;
    descIdx = -1;
    debitIdx = -1;
    creditIdx = -1;
    headerParts.forEach((h, idx) => {
      if (dateIdx === -1 && (h.includes('tanggal') || h === 'tgl' || h.includes('date'))) dateIdx = idx;
      else if (refIdx === -1 && (h.includes('referensi') || h.includes('ref') || h.includes('no. bukti') || h.includes('trace'))) refIdx = idx;
      else if (descIdx === -1 && (h.includes('keterangan') || h.includes('uraian') || h.includes('remark') || h.includes('desc') || h.includes('berita'))) descIdx = idx;
      else if (debitIdx === -1 && (h.includes('debet') || h.includes('debit') || h.includes('keluar'))) debitIdx = idx;
      else if (creditIdx === -1 && (h.includes('kredit') || h.includes('credit') || h.includes('masuk'))) creditIdx = idx;
    });
    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = refIdx === 1 ? 2 : 1;
  }

  const rows: ParsedBankStatementRow[] = [];
  for (let i = startLine; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 3) continue;

    const parsedDate = parseBankDateCellStrict(cols[dateIdx]);
    if (!parsedDate) continue;

    const rawDesc = cleanBankText(descIdx >= 0 ? cols[descIdx] : '') || 'Mutasi Rekening Bank PMO';
    const explicitRef = refIdx >= 0 ? cleanBankText(cols[refIdx]) : '';
    const rawRef =
      explicitRef ||
      extractBankReferenceFromDesc(rawDesc) ||
      `BNK-REF-${parsedDate.replace(/-/g, '')}-${String(rows.length + 1).padStart(4, '0')}`;
    const debit = debitIdx >= 0 ? Math.abs(cleanBankNumericValue(cols[debitIdx])) : 0;
    const credit = creditIdx >= 0 ? Math.abs(cleanBankNumericValue(cols[creditIdx])) : 0;

    if (debit <= 0 && credit <= 0) continue;

    const direction: 'DEBIT' | 'CREDIT' = credit > 0 ? 'CREDIT' : 'DEBIT';
    const amount = credit > 0 ? credit : debit;

    rows.push({
      transactionDate: parsedDate,
      description: rawDesc,
      referenceNo: rawRef,
      direction,
      amount,
    });
  }

  if (rows.length === 0) {
    throw new AppError(400, 'NO_VALID_TRANSACTIONS', 'Tidak ditemukan baris transaksi yang valid dalam file mutasi.');
  }

  return rows;
}

function inferBankAccountDomain(account: { code: string; bankName: string; accountHolder: string; glAccountCode: string }): 'PENERIMAAN' | 'PENGELUARAN' {
  const combined = `${account.code} ${account.bankName} ${account.accountHolder}`.toLowerCase();
  if (
    account.glAccountCode === '110102010100' ||
    account.glAccountCode === '110101020100' ||
    combined.includes('penerimaan') ||
    combined.includes('mandiri')
  ) {
    return 'PENERIMAAN';
  }
  return 'PENGELUARAN';
}

reconciliationRouter.get('/bank-accounts', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { isActive: true },
      include: { businessUnit: true },
      orderBy: { code: 'asc' },
    });
    res.json({
      success: true,
      data: accounts.map((a) => ({
        ...a,
        domain: inferBankAccountDomain(a),
        currentBalance: Number(a.currentBalance),
      })),
      meta: { total: accounts.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.get('/imports', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const imports = await prisma.bankStatementImport.findMany({
      include: {
        bankAccount: { include: { businessUnit: true } },
        lines: { orderBy: { transactionDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: imports.map((imp) => ({
        ...imp,
        lines: imp.lines.map((l) => ({
          ...l,
          amount: Number(l.amount),
          runningBalance: l.runningBalance !== null ? Number(l.runningBalance) : null,
        })),
      })),
      meta: { total: imports.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const statementRowSchema = z.object({
  transactionDate: z.string().min(8),
  description: z.string().min(2),
  referenceNo: z.string().min(2),
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().positive(),
});

const previewImportSchema = z.object({
  bankAccountId: z.string().min(1),
  periodLabel: z.string().min(3),
  fileName: z.string().min(3),
  rows: z.array(statementRowSchema).min(1, 'File mutasi bank wajib memiliki minimal 1 baris transaksi.'),
});

async function analyzeStatementRows(bankAccountId: string, rows: Array<z.infer<typeof statementRowSchema>>) {
  const [payments, deposits, expenses, pettyCash, refunds, existingLines, alreadyMatchedPaymentLines] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        approvalStatus: 'APPROVED',
        OR: [{ bankAccountId }, { bankAccountId: null }],
      },
      include: { customerInvoice: { select: { docNumber: true } } },
    }),
    prisma.cashDeposit.findMany({ where: { status: 'VERIFIED', bankAccountId } }),
    prisma.expense.findMany({ where: { status: { in: ['PAID', 'POSTED'] } } }),
    prisma.pettyCashSubmission.findMany({ where: { status: { in: ['APPROVED', 'DISBURSED', 'SETTLED', 'CLOSED'] } } }),
    prisma.refund.findMany({ where: { status: 'PROCESSED' } }),
    prisma.bankStatementLine.findMany({ where: { bankAccountId }, select: { fingerprint: true } }),
    prisma.bankStatementLine.findMany({
      where: { matchedEntityType: 'Payment', matchStatus: 'MATCHED', matchedEntityId: { not: null } },
      select: { matchedEntityId: true },
    }),
  ]);

  // Prioritize payments explicitly bound to this bankAccountId over legacy null-bankAccount records
  payments.sort((a, b) => {
    const aExact = a.bankAccountId === bankAccountId ? 0 : 1;
    const bExact = b.bankAccountId === bankAccountId ? 0 : 1;
    return aExact - bExact;
  });

  const existingFingerprints = new Set(existingLines.map((l) => l.fingerprint));
  const usedPaymentIds = new Set(alreadyMatchedPaymentLines.map((l) => l.matchedEntityId!).filter(Boolean));
  const seenInBatch = new Set<string>();

  return rows.map((row, idx) => {
    const amountStr = fromCents(toCents(row.amount));
    const fp = computeLineFingerprint(bankAccountId, row.transactionDate, row.referenceNo, row.direction, amountStr);
    const isDuplicate = existingFingerprints.has(fp) || seenInBatch.has(fp);
    seenInBatch.add(fp);

    let suggestedEntityType: string | null = null;
    let suggestedEntityId: string | null = null;
    let suggestedDocNumber: string | null = null;
    let matchStatus = 'UNMATCHED';

    if (!isDuplicate) {
      if (row.direction === 'CREDIT') {
        const refUp = row.referenceNo.trim().toUpperCase();
        const availablePayments = payments.filter((p) => !usedPaymentIds.has(p.id));
        const matchedPayment =
          availablePayments.find(
            (p) =>
              (p.referenceNo && p.referenceNo.toUpperCase() === refUp) ||
              (p.receiptNumber && p.receiptNumber.toUpperCase() === refUp) ||
              (p.customerInvoice?.docNumber && p.customerInvoice.docNumber.toUpperCase() === refUp)
          ) ||
          availablePayments.find(
            (p) => toCents(p.netAmount) === toCents(amountStr) || toCents(p.grossAmount) === toCents(amountStr)
          );
        if (matchedPayment) {
          usedPaymentIds.add(matchedPayment.id);
          suggestedEntityType = 'Payment';
          suggestedEntityId = matchedPayment.id;
          suggestedDocNumber = matchedPayment.receiptNumber;
          matchStatus = 'MATCHED';
        } else {
          const matchedDeposit = deposits.find(
            (d) =>
              (d.referenceNo && d.referenceNo.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
              (d.depositNumber && d.depositNumber.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
              toCents(d.amount) === toCents(amountStr)
          );
          if (matchedDeposit) {
            suggestedEntityType = 'CashDeposit';
            suggestedEntityId = matchedDeposit.id;
            suggestedDocNumber = matchedDeposit.depositNumber;
            matchStatus = 'MATCHED';
          }
        }
      } else {
        const matchedExpense = expenses.find(
          (e) =>
            (e.receiptRef && e.receiptRef.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
            (e.docNumber && e.docNumber.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
            toCents(e.totalAmount) === toCents(amountStr)
        );
        if (matchedExpense) {
          suggestedEntityType = 'Expense';
          suggestedEntityId = matchedExpense.id;
          suggestedDocNumber = matchedExpense.docNumber;
          matchStatus = 'MATCHED';
        } else {
          const matchedPettyCash = pettyCash.find(
            (pc) =>
              (pc.submissionNo && pc.submissionNo.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
              toCents(pc.netDisbursement) === toCents(amountStr) ||
              toCents(pc.totalTransaction) === toCents(amountStr)
          );
          if (matchedPettyCash) {
            suggestedEntityType = 'PettyCashSubmission';
            suggestedEntityId = matchedPettyCash.id;
            suggestedDocNumber = matchedPettyCash.submissionNo;
            matchStatus = 'MATCHED';
          } else {
            const matchedRefund = refunds.find(
              (r) =>
                (r.refundNumber && r.refundNumber.toUpperCase() === row.referenceNo.trim().toUpperCase()) ||
                toCents(r.amount) === toCents(amountStr)
            );
            if (matchedRefund) {
              suggestedEntityType = 'Refund';
              suggestedEntityId = matchedRefund.id;
              suggestedDocNumber = matchedRefund.refundNumber;
              matchStatus = 'MATCHED';
            }
          }
        }
      }
    }

    return {
      rowNumber: idx + 1,
      ...row,
      amount: Number(amountStr),
      amountStr,
      fingerprint: fp,
      isDuplicate,
      matchStatus: isDuplicate ? 'DUPLICATE' : matchStatus,
      matchedEntityType: suggestedEntityType,
      matchedEntityId: suggestedEntityId,
      matchedDocNumber: suggestedDocNumber,
    };
  });
}

export interface ParsedBankStatementRow {
  transactionDate: string;
  description: string;
  referenceNo: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
}

function cleanBankNumericValue(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9,.-]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }
  if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  }
  if (/^-?\d{1,3}(,\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: '01', january: '01', januari: '01',
  feb: '02', february: '02', februari: '02',
  mar: '03', march: '03', maret: '03',
  apr: '04', april: '04',
  may: '05', mei: '05',
  jun: '06', june: '06', juni: '06',
  jul: '07', july: '07', juli: '07',
  aug: '08', august: '08', agu: '08', agt: '08', agustus: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', okt: '10', oktober: '10',
  nov: '11', november: '11',
  dec: '12', december: '12', des: '12', desember: '12',
};

function cleanBankText(val: unknown): string {
  return String(val ?? '').replace(/\s+/g, ' ').trim();
}

function extractBankReferenceFromDesc(desc: string): string | null {
  const cleaned = cleanBankText(desc);
  if (!cleaned) return null;
  // Match Kopra Mandiri BI-FAST / transfer / QRIS / PY reference tokens at start (e.g. 20261001SSPIIDJA010O0232472553, PY261031082154479GQV, SHOPEE_200001012)
  const firstToken = cleaned.split(/\s+/)[0] || '';
  if (/^(?=.*\d)[A-Z0-9_-]{10,40}$/i.test(firstToken)) {
    return firstToken.slice(0, 40);
  }
  return null;
}

function parseBankDateCellStrict(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    if (y < 2000 || y > 2100) return null;
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 36526 && val < 73050) {
    // Valid Excel serial date between year 2000 and 2100
    const dt = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  }
  const trimmed = cleanBankText(val);
  if (!trimmed) return null;
  // YYYY-MM-DD or YYYY/MM/DD (with optional time)
  const ymd = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (ymd) {
    const mo = Number(ymd[2]);
    const da = Number(ymd[3]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${ymd[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY (with optional time)
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (dmy) {
    const da = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    }
  }
  // DD MonthName YYYY (Kopra Mandiri raw export: "01 October 2026 10:48:19" or "01 Oktober 2026")
  const dMonY = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (dMonY) {
    const da = Number(dMonY[1]);
    const moStr = MONTH_NAME_MAP[dMonY[2].toLowerCase()];
    if (moStr && da >= 1 && da <= 31) {
      return `${dMonY[3]}-${moStr}-${String(da).padStart(2, '0')}`;
    }
  }
  return null;
}

function extractExcelCellValue(rawVal: unknown): unknown {
  if (rawVal === null || rawVal === undefined) return '';
  if (rawVal instanceof Date) return rawVal;
  if (typeof rawVal === 'object') {
    const obj = rawVal as Record<string, any>;
    if ('result' in obj && obj.result !== undefined) return extractExcelCellValue(obj.result);
    if (Array.isArray(obj.richText)) return obj.richText.map((rt: any) => rt?.text || '').join('');
    if (typeof obj.text === 'string') return obj.text;
  }
  return rawVal;
}

export interface ParsedWorkbookResult {
  rows: ParsedBankStatementRow[];
  sheetNames: string[];
  selectedSheetName: string;
}

export async function parseBankStatementXlsx(buffer: Buffer, requestedSheetName?: string): Promise<ParsedWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  try {
    await workbook.xlsx.load(arrayBuf);
  } catch {
    throw new AppError(
      400,
      'INVALID_XLSX_FILE',
      'File Excel (.xlsx) tidak dapat dibaca. Pastikan format file adalah Excel modern (.xlsx), bukan .xls lama.'
    );
  }

  const nonEmptySheets = workbook.worksheets.filter((ws) => ws.rowCount > 0);
  if (nonEmptySheets.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'Workbook Excel mutasi rekening koran kosong.');
  }

  const sheetNames = nonEmptySheets.map((ws) => ws.name);
  const sheet =
    (requestedSheetName ? nonEmptySheets.find((ws) => ws.name === requestedSheetName) : null) || nonEmptySheets[0];

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const vals: unknown[] = [];
    const colCount = Math.max(row.cellCount, 8);
    for (let c = 1; c <= colCount; c++) {
      vals.push(extractExcelCellValue(row.getCell(c).value));
    }
    const nonEmptyCount = vals.filter((v) => String(v ?? '').trim() !== '').length;
    if (nonEmptyCount === 0) return;

    // Handle Kopra Bank Mandiri raw export sheets where each row is semicolon-delimited in Column A
    if (nonEmptyCount === 1 && typeof vals[0] === 'string' && (vals[0].match(/;/g) || []).length >= 4) {
      matrix.push(vals[0].split(';').map((p) => p.trim()));
      return;
    }
    matrix.push(vals);
  });

  if (matrix.length === 0) {
    throw new AppError(400, 'EMPTY_FILE', `Sheet "${sheet.name}" tidak memiliki baris data.`);
  }

  // Locate header row within the first 25 rows (handles Kopra Mandiri metadata rows at top)
  let headerRowIdx = -1;
  let dateIdx = 0;
  let refIdx = 1;
  let descIdx = 2;
  let extraDescIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let amountIdx = -1;
  let dirIdx = -1;

  const scanLimit = Math.min(matrix.length, 25);
  for (let i = 0; i < scanLimit; i++) {
    const lowered = matrix[i].map((c) => cleanBankText(c).toLowerCase());
    const hasDate = lowered.some((h) => h.includes('tanggal') || h === 'tgl' || h.includes('date'));
    const hasMoney = lowered.some(
      (h) =>
        h.includes('debet') ||
        h.includes('debit') ||
        h.includes('kredit') ||
        h.includes('credit') ||
        h.includes('nominal') ||
        h.includes('amount')
    );
    if (hasDate && hasMoney) {
      headerRowIdx = i;
      dateIdx = -1;
      refIdx = -1;
      descIdx = -1;
      extraDescIdx = -1;
      lowered.forEach((h, idx) => {
        if (!h) return;
        if (dateIdx === -1 && (h.includes('tanggal') || h === 'tgl' || h.includes('date'))) {
          dateIdx = idx;
        } else if (
          refIdx === -1 &&
          (h.includes('referensi') || h.includes('ref') || h.includes('no. bukti') || h.includes('trace') || h.includes('journal'))
        ) {
          refIdx = idx;
        } else if (
          descIdx === -1 &&
          (h.includes('keterangan') || h.includes('uraian') || h.includes('remark') || h.includes('desc') || h.includes('berita') || h.includes('transaksi'))
        ) {
          descIdx = idx;
        } else if (
          extraDescIdx === -1 &&
          (h.includes('additionaldesc') || h.includes('additional desc') || h.includes('keterangan tambahan'))
        ) {
          extraDescIdx = idx;
        } else if (debitIdx === -1 && (h.includes('debet') || h.includes('debit') || h.includes('keluar'))) {
          debitIdx = idx;
        } else if (creditIdx === -1 && (h.includes('kredit') || h.includes('credit') || h.includes('masuk'))) {
          creditIdx = idx;
        } else if (amountIdx === -1 && (h.includes('nominal') || h.includes('amount') || h.includes('jumlah') || h.includes('nilai'))) {
          amountIdx = idx;
        } else if (dirIdx === -1 && (h === 'd/c' || h === 'dk' || h === 'd/k' || h.includes('arah') || h.includes('tipe') || h.includes('jenis'))) {
          dirIdx = idx;
        }
      });
      if (dateIdx === -1) dateIdx = 0;
      if (descIdx === -1) descIdx = refIdx === 1 ? 2 : 1;
      break;
    }
  }

  // Fallback default layout (Tanggal, No. Ref, Uraian, Debet, Kredit)
  if (headerRowIdx === -1) {
    dateIdx = 0;
    refIdx = 1;
    descIdx = 2;
    debitIdx = 3;
    creditIdx = 4;
  }

  const startLine = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const rows: ParsedBankStatementRow[] = [];

  for (let i = startLine; i < matrix.length; i++) {
    const cols = matrix[i];
    // Strictly require a valid transaction date so footer SUM rows & COA recap tables at bottom are NEVER imported!
    const parsedDate = parseBankDateCellStrict(cols[dateIdx]);
    if (!parsedDate) continue;

    const rowJoined = cols.map((c) => cleanBankText(c).toLowerCase()).join(' ');
    if (/\b(total|jumlah|saldo awal|saldo akhir|opening balance|ending balance|closing balance)\b/.test(rowJoined)) {
      continue;
    }

    const primaryDesc = descIdx >= 0 ? cleanBankText(cols[descIdx]) : '';
    const secondaryDesc = extraDescIdx >= 0 ? cleanBankText(cols[extraDescIdx]) : '';
    const rawDesc = primaryDesc || secondaryDesc || 'Mutasi Rekening Bank Mandiri';

    const explicitRef = refIdx >= 0 ? cleanBankText(cols[refIdx]) : '';
    const rawRef =
      explicitRef ||
      extractBankReferenceFromDesc(rawDesc) ||
      `MDR-${parsedDate.replace(/-/g, '')}-${String(rows.length + 1).padStart(4, '0')}`;

    let direction: 'DEBIT' | 'CREDIT' = 'CREDIT';
    let amount = 0;

    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? Math.abs(cleanBankNumericValue(cols[debitIdx])) : 0;
      const credit = creditIdx >= 0 ? Math.abs(cleanBankNumericValue(cols[creditIdx])) : 0;
      if (debit <= 0 && credit <= 0) continue;
      if (credit > 0) {
        direction = 'CREDIT';
        amount = credit;
      } else {
        direction = 'DEBIT';
        amount = debit;
      }
    } else if (amountIdx >= 0) {
      const signed = cleanBankNumericValue(cols[amountIdx]);
      if (signed === 0) continue;
      const dirText = cleanBankText(dirIdx >= 0 ? cols[dirIdx] : '').toLowerCase();
      if (dirText.startsWith('d') || dirText.includes('keluar') || signed < 0) {
        direction = 'DEBIT';
      } else {
        direction = 'CREDIT';
      }
      amount = Math.abs(signed);
    } else {
      continue;
    }

    if (amount <= 0) continue;

    rows.push({
      transactionDate: parsedDate,
      description: rawDesc,
      referenceNo: rawRef,
      direction,
      amount,
    });
  }

  if (rows.length === 0) {
    throw new AppError(
      400,
      'NO_VALID_TRANSACTIONS',
      `Tidak ditemukan baris transaksi valid pada sheet "${sheet.name}". Pastikan kolom Tanggal dan Debet/Kredit terisi.`
    );
  }

  return { rows, sheetNames, selectedSheetName: sheet.name };
}

const parseCsvSchema = z.object({
  rawContent: z.string().min(1, 'Isi data rekening koran tidak boleh kosong.'),
  fileName: z.string().optional(),
});

const parseFileSchema = z.object({
  fileName: z.string().optional(),
  fileBase64: z.string().optional(),
  rawContent: z.string().optional(),
  sheetName: z.string().optional(),
});

reconciliationRouter.post('/parse-csv', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const parsed = parseCsvSchema.parse(req.body);
    const rows = parseBriStatementContent(parsed.rawContent);
    const totalDebit = rows.filter((r) => r.direction === 'DEBIT').reduce((acc, r) => acc + r.amount, 0);
    const totalCredit = rows.filter((r) => r.direction === 'CREDIT').reduce((acc, r) => acc + r.amount, 0);

    res.json({
      success: true,
      data: {
        fileName: parsed.fileName || 'mutasi-rekening-bank.csv',
        totalRows: rows.length,
        totalDebit,
        totalCredit,
        rows,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.post('/parse-file', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const parsed = parseFileSchema.parse(req.body);
    const fileName = parsed.fileName?.trim() || 'mutasi-rekening-bank.xlsx';
    let rows: ParsedBankStatementRow[] = [];
    let sheetNames: string[] = [];
    let selectedSheetName = '';

    if (parsed.fileBase64) {
      const cleanBase64 = parsed.fileBase64.includes(',')
        ? parsed.fileBase64.slice(parsed.fileBase64.indexOf(',') + 1)
        : parsed.fileBase64;
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length === 0) {
        throw new AppError(400, 'EMPTY_FILE', 'File mutasi rekening koran kosong.');
      }
      const parsedWb = await parseBankStatementXlsx(buf, parsed.sheetName);
      rows = parsedWb.rows;
      sheetNames = parsedWb.sheetNames;
      selectedSheetName = parsedWb.selectedSheetName;
    } else if (parsed.rawContent) {
      rows = parseBriStatementContent(parsed.rawContent);
    } else {
      throw new AppError(400, 'EMPTY_FILE', 'Unggah file Excel (.xlsx) atau CSV rekening koran terlebih dahulu.');
    }

    const totalDebit = rows.filter((r) => r.direction === 'DEBIT').reduce((acc, r) => acc + r.amount, 0);
    const totalCredit = rows.filter((r) => r.direction === 'CREDIT').reduce((acc, r) => acc + r.amount, 0);

    res.json({
      success: true,
      data: {
        fileName,
        sheetNames,
        selectedSheetName,
        totalRows: rows.length,
        totalDebit,
        totalCredit,
        rows,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.get('/template.xlsx', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const domain = String(req.query.domain || 'PENERIMAAN').toUpperCase();
    const accountCode = String(req.query.accountCode || (domain === 'PENGELUARAN' ? 'BNK-BTN-01' : 'BNK-MDR-01')).trim();
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ymdCompact = todayIso.replace(/-/g, '');
    const fileSlug = todayIso.slice(0, 7);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PMO UTama Finance ERP';
    wb.created = now;

    const ws = wb.addWorksheet('Mutasi Rekening Koran', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'No. Referensi', key: 'ref', width: 24 },
      { header: 'Uraian Transaksi', key: 'desc', width: 46 },
      { header: 'Debet (Keluar)', key: 'debit', width: 20 },
      { header: 'Kredit (Masuk)', key: 'credit', width: 20 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2144' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    if (domain === 'PENGELUARAN') {
      ws.addRow({
        date: todayIso,
        ref: `LS-BTN-${ymdCompact}-01`,
        desc: 'Pelunasan Tagihan Vendor Pengadaan LS',
        debit: 5000000,
        credit: 0,
      });
      ws.addRow({
        date: todayIso,
        ref: `ADM-BTN-${ymdCompact}-99`,
        desc: 'Biaya Administrasi Rekening Bank',
        debit: 25000,
        credit: 0,
      });
    } else {
      ws.addRow({
        date: todayIso,
        ref: `TRF-${ymdCompact}-01`,
        desc: 'Transfer Masuk Pembayaran Layanan Unit PMO UTama',
        debit: 0,
        credit: 5000000,
      });
      ws.addRow({
        date: todayIso,
        ref: `ADM-MDR-${ymdCompact}-99`,
        desc: 'Biaya Administrasi Bulanan Bank Mandiri Penerimaan',
        debit: 25000,
        credit: 0,
      });
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getRow(r).getCell(4).numFmt = '#,##0';
      ws.getRow(r).getCell(5).numFmt = '#,##0';
    }

    const guide = wb.addWorksheet('Panduan');
    guide.columns = [
      { header: 'Kolom', key: 'col', width: 22 },
      { header: 'Keterangan Pengisian', key: 'info', width: 64 },
    ];
    guide.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2144' } };
    });
    guide.addRow({ col: 'Tanggal', info: 'Format YYYY-MM-DD (misal 2026-11-25) atau DD/MM/YYYY.' });
    guide.addRow({ col: 'No. Referensi', info: 'Nomor referensi transfer bank atau nomor kwitansi/invoice agar cocok otomatis.' });
    guide.addRow({ col: 'Uraian Transaksi', info: 'Berita transfer / keterangan mutasi sesuai rekening koran bank.' });
    guide.addRow({ col: 'Debet (Keluar)', info: 'Isi angka untuk uang keluar / biaya admin bank (isi 0 jika uang masuk).' });
    guide.addRow({ col: 'Kredit (Masuk)', info: 'Isi angka untuk uang masuk penerimaan (isi 0 jika uang keluar).' });

    const outBuf = await wb.xlsx.writeBuffer();
    const safeSlug = accountCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const fileName = `template-mutasi-${safeSlug}-${fileSlug}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(outBuf));
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.get('/summary/:bankAccountId', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: req.params.bankAccountId },
      include: { businessUnit: true },
    });
    if (!bankAccount) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Rekening bank tidak ditemukan.');

    const sharedGlCount = await prisma.bankAccount.count({
      where: { glAccountCode: bankAccount.glAccountCode, isActive: true },
    });

    let bookBalanceCents = 0n;
    const isDualMandiriPerAccount = sharedGlCount > 1 && inferBankAccountDomain(bankAccount) === 'PENERIMAAN';
    if (isDualMandiriPerAccount) {
      // Separate per-account book balance when Dual Bank Mandiri (999-5 Final & 8989 Kelolaan) share Pertor 310 GL 110102010100
      const [accPayments, accDeposits, accRefunds] = await Promise.all([
        prisma.payment.findMany({
          where: {
            bankAccountId: bankAccount.id,
            status: 'CONFIRMED',
            approvalStatus: 'APPROVED',
            method: { not: 'CASH' },
          },
          select: { netAmount: true },
        }),
        prisma.cashDeposit.findMany({
          where: { bankAccountId: bankAccount.id, status: 'VERIFIED' },
          select: { amount: true },
        }),
        prisma.refund.findMany({
          where: { status: 'PROCESSED', payment: { bankAccountId: bankAccount.id } },
          select: { amount: true },
        }),
      ]);
      for (const p of accPayments) bookBalanceCents += toCents(p.netAmount);
      for (const d of accDeposits) bookBalanceCents += toCents(d.amount);
      for (const r of accRefunds) bookBalanceCents -= toCents(r.amount);
    } else {
      const journalLines = await prisma.journalLine.findMany({
        where: {
          accountCode: bankAccount.glAccountCode,
          journalEntry: { status: 'POSTED' },
        },
      });

      let totalDebitCents = 0n;
      let totalCreditCents = 0n;
      for (const line of journalLines) {
        totalDebitCents += toCents(line.debit);
        totalCreditCents += toCents(line.credit);
      }
      bookBalanceCents = totalDebitCents - totalCreditCents;
    }

    const bookBalance = Number(fromCents(bookBalanceCents));
    const bankBalance = Number(bankAccount.currentBalance);
    const diff = bookBalance - bankBalance;

    const [totalImports, latestImport, accountLines] = await Promise.all([
      prisma.bankStatementImport.count({
        where: { bankAccountId: bankAccount.id },
      }),
      prisma.bankStatementImport.findFirst({
        where: { bankAccountId: bankAccount.id },
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      }),
      prisma.bankStatementLine.findMany({
        where: { bankAccountId: bankAccount.id },
        select: { matchStatus: true, direction: true, amount: true },
      }),
    ]);

    let exceptionNetCents = 0n;
    let exceptionLineCount = 0;
    let unmatchedLineCount = 0;
    let matchedLineCount = 0;
    for (const al of accountLines) {
      if (al.matchStatus === 'MATCHED') {
        matchedLineCount++;
      } else if (al.matchStatus === 'EXCEPTION') {
        exceptionLineCount++;
        exceptionNetCents += al.direction === 'CREDIT' ? toCents(al.amount) : -toCents(al.amount);
      } else {
        unmatchedLineCount++;
      }
    }

    res.json({
      success: true,
      data: {
        bankAccountId: bankAccount.id,
        bankName: bankAccount.bankName,
        accountNumberMasked: bankAccount.accountNumberMasked,
        glAccountCode: bankAccount.glAccountCode,
        bookBalanceBasis: isDualMandiriPerAccount ? 'APPROVED_PAYMENTS_PER_ACCOUNT' : 'GL_JOURNAL',
        bookBalance,
        bankBalance,
        difference: diff,
        isBalanced: diff === 0,
        matchedLineCount,
        unmatchedLineCount,
        exceptionLineCount,
        exceptionNetAmount: Number(fromCents(exceptionNetCents)),
        totalImports,
        latestImport: latestImport
          ? {
              id: latestImport.id,
              importNumber: latestImport.importNumber,
              periodLabel: latestImport.periodLabel,
              status: latestImport.status,
              totalLines: latestImport.totalLines,
              matchedCount: latestImport.matchedCount,
              unmatchedCount: latestImport.unmatchedCount,
              duplicateCount: latestImport.duplicateCount,
            }
          : null,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Preview statement rows before committing to database
reconciliationRouter.post('/preview', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const parsed = previewImportSchema.parse(req.body);
    const analyzed = await analyzeStatementRows(parsed.bankAccountId, parsed.rows);

    res.json({
      success: true,
      data: {
        bankAccountId: parsed.bankAccountId,
        periodLabel: parsed.periodLabel,
        fileName: parsed.fileName,
        summary: {
          totalRows: analyzed.length,
          duplicateCount: analyzed.filter((r) => r.isDuplicate).length,
          autoMatchedCount: analyzed.filter((r) => !r.isDuplicate && r.matchStatus === 'MATCHED').length,
          unmatchedCount: analyzed.filter((r) => !r.isDuplicate && r.matchStatus === 'UNMATCHED').length,
        },
        rows: analyzed,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Commit statement import (skips duplicates safely)
reconciliationRouter.post('/import', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const parsed = previewImportSchema.parse(req.body);
    const analyzed = await analyzeStatementRows(parsed.bankAccountId, parsed.rows);
    const validRows = analyzed.filter((r) => !r.isDuplicate);
    const duplicateCount = analyzed.filter((r) => r.isDuplicate).length;

    if (validRows.length === 0) {
      throw new AppError(
        409,
        'ALL_ROWS_DUPLICATE',
        `Seluruh baris pada file "${parsed.fileName}" (${duplicateCount} baris) terdeteksi duplikat terhadap mutasi yang sudah diimpor sebelumnya.`
      );
    }

    const existingImps = await prisma.bankStatementImport.findMany({ select: { importNumber: true } });
    let maxImp = existingImps.length;
    for (const r of existingImps) {
      const m = String(r.importNumber || '').match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxImp) maxImp = n;
      }
    }
    let impSeq = maxImp + 1;
    let importNumber = `IMP-BNK-${String(impSeq).padStart(4, '0')}`;
    while (await prisma.bankStatementImport.findUnique({ where: { importNumber }, select: { id: true } })) {
      impSeq++;
      importNumber = `IMP-BNK-${String(impSeq).padStart(4, '0')}`;
    }

    const created = await prisma.$transaction(async (tx) => {
      const imp = await tx.bankStatementImport.create({
        data: {
          importNumber,
          bankAccountId: parsed.bankAccountId,
          periodLabel: parsed.periodLabel.trim(),
          fileName: parsed.fileName.trim(),
          totalLines: validRows.length,
          matchedCount: validRows.filter((r) => r.matchStatus === 'MATCHED').length,
          unmatchedCount: validRows.filter((r) => r.matchStatus !== 'MATCHED').length,
          duplicateCount,
          status: 'RECONCILING',
          importedById: req.user!.userId,
          importedByName: req.user!.fullName,
          lines: {
            create: validRows.map((r) => ({
              bankAccountId: parsed.bankAccountId,
              transactionDate: new Date(r.transactionDate),
              description: r.description.trim(),
              referenceNo: r.referenceNo.trim(),
              direction: r.direction,
              amount: r.amountStr,
              fingerprint: r.fingerprint,
              matchStatus: r.matchStatus,
              matchedEntityType: r.matchedEntityType,
              matchedEntityId: r.matchedEntityId,
              matchedDocNumber: r.matchedDocNumber,
              reconciledById: r.matchStatus === 'MATCHED' ? req.user!.userId : null,
              reconciledByName: r.matchStatus === 'MATCHED' ? req.user!.fullName : null,
              reconciledAt: r.matchStatus === 'MATCHED' ? new Date() : null,
            })),
          },
        },
        include: { bankAccount: true, lines: true },
      });

      // Recompute Bank Account currentBalance from all imported statement lines for this account
      const allAccLines = await tx.bankStatementLine.findMany({
        where: { bankAccountId: parsed.bankAccountId },
        select: { direction: true, amount: true },
      });
      let netBankCents = 0n;
      for (const al of allAccLines) {
        netBankCents += al.direction === 'CREDIT' ? toCents(al.amount) : -toCents(al.amount);
      }
      await tx.bankAccount.update({
        where: { id: parsed.bankAccountId },
        data: { currentBalance: fromCents(netBankCents) },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BANK_STATEMENT_IMPORTED',
          module: 'RECONCILIATION',
          entityType: 'BankStatementImport',
          entityId: imp.id,
          entityCode: imp.importNumber,
          summary: `Mengimpor mutasi bank ${imp.importNumber} (${imp.fileName}): ${imp.totalLines} baris valid, ${imp.matchedCount} cocok otomatis, ${duplicateCount} duplikat dilewati`,
          requestId: req.requestId,
        },
        tx as any
      );

      return imp;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Resolve / Match / Mark Exception on a Bank Statement Line
const updateMatchSchema = z.object({
  matchStatus: z.enum(['MATCHED', 'NEEDS_REVIEW', 'EXCEPTION', 'UNMATCHED']),
  matchedEntityType: z.string().optional(),
  matchedEntityId: z.string().nullable().optional(),
  matchedDocNumber: z.string().optional(),
  exceptionNote: z.string().optional(),
});

reconciliationRouter.get('/penerimaan-candidates', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : undefined;
    const bankAccountId = typeof req.query.bankAccountId === 'string' && req.query.bankAccountId ? req.query.bankAccountId : undefined;
    const where: any = { status: 'CONFIRMED', approvalStatus: 'APPROVED' };
    if (bankAccountId) {
      where.OR = [{ bankAccountId }, { bankAccountId: null }];
    }
    if (month) {
      const [y, m] = month.split('-').map(Number);
      where.paymentDate = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    }

    const [payments, matchedLines] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          businessUnit: true,
          customer: true,
          customerInvoice: { include: { customer: true, businessUnit: true } },
        },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.bankStatementLine.findMany({
        where: { matchedEntityType: 'Payment', matchStatus: 'MATCHED', matchedEntityId: { not: null } },
        select: { matchedEntityId: true, referenceNo: true, reconciledAt: true },
      }),
    ]);

    const matchedMap = new Map(matchedLines.map((l) => [l.matchedEntityId!, l]));
    const unreconciled: any[] = [];
    let reconciledCount = 0;
    let reconciledTotal = 0;
    let unreconciledTotal = 0;

    for (const p of payments) {
      const gross = Number(p.grossAmount);
      const isMatched = matchedMap.has(p.id);
      if (isMatched) {
        reconciledCount++;
        reconciledTotal += gross;
      } else {
        unreconciledTotal += gross;
        const bu = p.businessUnit || p.customerInvoice?.businessUnit;
        unreconciled.push({
          id: p.id,
          receiptNumber: p.receiptNumber,
          receiptType: p.receiptType || 'KUITANSI',
          paymentDate: p.paymentDate.toISOString().slice(0, 10),
          payerName: p.payerName || p.customer?.name || p.customerInvoice?.customer?.name || 'Pelanggan Umum',
          activityTitle: p.activityTitle || p.customerInvoice?.activityTitle || p.notes || 'Penerimaan Layanan',
          rincianLabel: p.rincianLabel || p.customerInvoice?.rincianLabel || 'Layanan',
          invoiceDocNumber: p.customerInvoice?.docNumber || p.externalInvoiceNo || '',
          businessUnitCode: bu?.code || 'PMO',
          businessUnitName: bu?.name || 'PMO UTama',
          method: p.method,
          referenceNo: p.referenceNo,
          grossAmount: gross,
          netAmount: Number(p.netAmount),
          revenueAccountCode: p.revenueAccountCode || p.customerInvoice?.revenueAccountCode || '',
        });
      }
    }

    res.json({
      success: true,
      data: {
        reconciledCount,
        unreconciledCount: unreconciled.length,
        reconciledTotal,
        unreconciledTotal,
        unreconciled,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.post('/imports/:id/auto-match-penerimaan', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const imp = await prisma.bankStatementImport.findUnique({
      where: { id: req.params.id },
      include: { lines: true, bankAccount: true },
    });
    if (!imp) throw new AppError(404, 'IMPORT_NOT_FOUND', 'Sesi impor rekonsiliasi tidak ditemukan.');
    if (imp.status === 'FINALIZED') {
      throw new AppError(409, 'RECONCILIATION_FINALIZED', `Sesi rekonsiliasi ${imp.importNumber} sudah difinalisasi.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const [payments, matchedLines] = await Promise.all([
        tx.payment.findMany({
          where: {
            status: 'CONFIRMED',
            approvalStatus: 'APPROVED',
            OR: [{ bankAccountId: imp.bankAccountId }, { bankAccountId: null }],
          },
          include: { customerInvoice: { select: { docNumber: true } } },
          orderBy: { paymentDate: 'desc' },
        }),
        tx.bankStatementLine.findMany({
          where: { matchedEntityType: 'Payment', matchStatus: 'MATCHED', matchedEntityId: { not: null } },
          select: { matchedEntityId: true },
        }),
      ]);

      const usedPaymentIds = new Set(matchedLines.map((l) => l.matchedEntityId!).filter(Boolean));
      const unmatchedCreditLines = imp.lines.filter((l) => l.direction === 'CREDIT' && l.matchStatus !== 'MATCHED');
      let newlyMatchedCount = 0;

      for (const line of unmatchedCreditLines) {
        const refUp = line.referenceNo.trim().toUpperCase();
        const lineCents = toCents(line.amount);
        const candidates = payments.filter((p) => !usedPaymentIds.has(p.id));
        const match =
          candidates.find(
            (p) =>
              (p.referenceNo && p.referenceNo.toUpperCase() === refUp) ||
              (p.receiptNumber && p.receiptNumber.toUpperCase() === refUp) ||
              (p.customerInvoice?.docNumber && p.customerInvoice.docNumber.toUpperCase() === refUp)
          ) ||
          candidates.find((p) => toCents(p.grossAmount) === lineCents || toCents(p.netAmount) === lineCents);

        if (match) {
          usedPaymentIds.add(match.id);
          await tx.bankStatementLine.update({
            where: { id: line.id },
            data: {
              matchStatus: 'MATCHED',
              matchedEntityType: 'Payment',
              matchedEntityId: match.id,
              matchedDocNumber: match.receiptNumber,
              reconciledById: req.user!.userId,
              reconciledByName: req.user!.fullName,
              reconciledAt: new Date(),
            },
          });
          newlyMatchedCount++;
        }
      }

      const allLines = await tx.bankStatementLine.findMany({ where: { importId: imp.id } });
      const matchedCount = allLines.filter((item) => item.matchStatus === 'MATCHED').length;
      const unmatchedCount = allLines.length - matchedCount;
      await tx.bankStatementImport.update({
        where: { id: imp.id },
        data: { matchedCount, unmatchedCount },
      });

      if (newlyMatchedCount > 0) {
        await recordAuditLog(
          {
            actorId: req.user!.userId,
            actorName: req.user!.fullName,
            actorRole: req.user!.roleCode,
            action: 'RECONCILIATION_AUTO_MATCH_PENERIMAAN',
            module: 'RECONCILIATION',
            entityType: 'BankStatementImport',
            entityId: imp.id,
            entityCode: imp.importNumber,
            summary: `Auto-matching ${newlyMatchedCount} mutasi kredit Bank Mandiri terhadap transaksi Buku Harian pada sesi ${imp.importNumber}`,
            requestId: req.requestId,
          },
          tx as any
        );
      }

      return { newlyMatchedCount, matchedCount, unmatchedCount };
    });

    res.json({ success: true, data: result, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.post('/lines/:id/match', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const parsed = updateMatchSchema.parse(req.body);
    const line = await prisma.bankStatementLine.findUnique({
      where: { id: req.params.id },
      include: { statementImport: true },
    });
    if (!line) throw new AppError(404, 'LINE_NOT_FOUND', 'Baris mutasi bank tidak ditemukan.');
    if (line.statementImport.status === 'FINALIZED') {
      throw new AppError(
        409,
        'RECONCILIATION_FINALIZED',
        `Sesi rekonsiliasi ${line.statementImport.importNumber} telah difinalisasi dan tidak dapat diubah tanpa pembukaan ulang resmi.`
      );
    }

    if (parsed.matchStatus === 'EXCEPTION' && (!parsed.exceptionNote || parsed.exceptionNote.trim().length < 4)) {
      throw new AppError(400, 'EXCEPTION_NOTE_REQUIRED', 'Catatan alasan selisih/exception wajib diisi.');
    }

    let resolvedEntityType = parsed.matchedEntityType ?? line.matchedEntityType;
    let resolvedEntityId = parsed.matchedEntityId !== undefined ? parsed.matchedEntityId : line.matchedEntityId;
    let resolvedDocNumber = parsed.matchedDocNumber ?? line.matchedDocNumber;

    if (parsed.matchStatus === 'UNMATCHED') {
      resolvedEntityType = null;
      resolvedEntityId = null;
      resolvedDocNumber = null;
    } else if (resolvedEntityType === 'Payment' && resolvedEntityId) {
      const pay = await prisma.payment.findUnique({ where: { id: resolvedEntityId } });
      if (!pay) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Transaksi Buku Harian yang dipilih tidak ditemukan.');
      if (pay.status !== 'CONFIRMED' || pay.approvalStatus !== 'APPROVED') {
        throw new AppError(409, 'PAYMENT_NOT_APPROVED', 'Transaksi Buku Harian belum disetujui Manajer Keuangan dan belum dapat direkonsiliasi.');
      }
      if (!resolvedDocNumber) resolvedDocNumber = pay.receiptNumber;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const l = await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          matchStatus: parsed.matchStatus,
          matchedEntityType: resolvedEntityType,
          matchedEntityId: resolvedEntityId,
          matchedDocNumber: resolvedDocNumber,
          exceptionNote: parsed.exceptionNote?.trim() ?? null,
          reconciledById: parsed.matchStatus === 'UNMATCHED' ? null : req.user!.userId,
          reconciledByName: parsed.matchStatus === 'UNMATCHED' ? null : req.user!.fullName,
          reconciledAt: parsed.matchStatus === 'UNMATCHED' ? null : new Date(),
        },
      });

      const allLines = await tx.bankStatementLine.findMany({ where: { importId: line.importId } });
      const matchedCount = allLines.filter((item) => item.matchStatus === 'MATCHED').length;
      const unmatchedCount = allLines.length - matchedCount;

      await tx.bankStatementImport.update({
        where: { id: line.importId },
        data: { matchedCount, unmatchedCount },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BANK_LINE_RECONCILED',
          module: 'RECONCILIATION',
          entityType: 'BankStatementLine',
          entityId: l.id,
          entityCode: l.referenceNo,
          summary: `Memperbarui status rekonsiliasi mutasi bank ref ${l.referenceNo} menjadi ${l.matchStatus}`,
          beforeData: { matchStatus: line.matchStatus },
          afterData: { matchStatus: l.matchStatus, matchedDocNumber: l.matchedDocNumber, exceptionNote: l.exceptionNote },
          requestId: req.requestId,
        },
        tx as any
      );

      return l;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

reconciliationRouter.post('/imports/:id/finalize', requirePermission('reconciliation:manage'), async (req, res, next) => {
  try {
    const imp = await prisma.bankStatementImport.findUnique({ where: { id: req.params.id } });
    if (!imp) throw new AppError(404, 'IMPORT_NOT_FOUND', 'Sesi impor rekonsiliasi tidak ditemukan.');
    if (imp.status === 'FINALIZED') {
      throw new AppError(409, 'ALREADY_FINALIZED', 'Sesi rekonsiliasi ini sudah difinalisasi.');
    }

    const updated = await prisma.bankStatementImport.update({
      where: { id: imp.id },
      data: {
        status: 'FINALIZED',
        finalizedById: req.user!.userId,
        finalizedAt: new Date(),
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'RECONCILIATION_FINALIZED',
      module: 'RECONCILIATION',
      entityType: 'BankStatementImport',
      entityId: updated.id,
      entityCode: updated.importNumber,
      summary: `Memfinalisasi sesi rekonsiliasi bank ${updated.importNumber} (${updated.periodLabel})`,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});
