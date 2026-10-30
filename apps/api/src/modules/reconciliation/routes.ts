import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
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

reconciliationRouter.get('/bank-accounts', requirePermission('reconciliation:view'), async (req, res, next) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      include: { businessUnit: true },
      orderBy: { code: 'asc' },
    });
    res.json({
      success: true,
      data: accounts.map((a) => ({ ...a, currentBalance: Number(a.currentBalance) })),
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
  const [payments, deposits, expenses, existingLines] = await Promise.all([
    prisma.payment.findMany({ where: { status: 'CONFIRMED' } }),
    prisma.cashDeposit.findMany({ where: { status: 'VERIFIED' } }),
    prisma.expense.findMany({ where: { status: { in: ['PAID', 'POSTED'] } } }),
    prisma.bankStatementLine.findMany({ where: { bankAccountId }, select: { fingerprint: true } }),
  ]);

  const existingFingerprints = new Set(existingLines.map((l) => l.fingerprint));
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
        const matchedPayment = payments.find(
          (p) =>
            p.referenceNo.toUpperCase() === row.referenceNo.trim().toUpperCase() ||
            toCents(p.netAmount) === toCents(amountStr) ||
            toCents(p.grossAmount) === toCents(amountStr)
        );
        if (matchedPayment) {
          suggestedEntityType = 'Payment';
          suggestedEntityId = matchedPayment.id;
          suggestedDocNumber = matchedPayment.receiptNumber;
          matchStatus = 'MATCHED';
        } else {
          const matchedDeposit = deposits.find(
            (d) =>
              d.referenceNo.toUpperCase() === row.referenceNo.trim().toUpperCase() ||
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
            toCents(e.totalAmount) === toCents(amountStr)
        );
        if (matchedExpense) {
          suggestedEntityType = 'Expense';
          suggestedEntityId = matchedExpense.id;
          suggestedDocNumber = matchedExpense.docNumber;
          matchStatus = 'MATCHED';
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

    const count = await prisma.bankStatementImport.count();
    const importNumber = `IMP-BNK-${String(count + 1).padStart(4, '0')}`;

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
  matchedDocNumber: z.string().optional(),
  exceptionNote: z.string().optional(),
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

    const updated = await prisma.$transaction(async (tx) => {
      const l = await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          matchStatus: parsed.matchStatus,
          matchedEntityType: parsed.matchedEntityType ?? line.matchedEntityType,
          matchedDocNumber: parsed.matchedDocNumber ?? line.matchedDocNumber,
          exceptionNote: parsed.exceptionNote?.trim() ?? null,
          reconciledById: req.user!.userId,
          reconciledByName: req.user!.fullName,
          reconciledAt: new Date(),
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
