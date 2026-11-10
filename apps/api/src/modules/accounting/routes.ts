import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import { AppError, requireAuth, requirePermission } from '../../middleware/auth.js';

export const accountingRouter = Router();

accountingRouter.use(requireAuth);

// 1. CHART OF ACCOUNTS (COA) & ACCOUNT MAPPINGS
accountingRouter.get('/coa', requirePermission('accounting:view'), async (req, res, next) => {
  try {
    const [accounts, mappings] = await Promise.all([
      prisma.chartOfAccount.findMany({
        where: {
          isActive: true,
          code: { not: { contains: '-' } },
          name: { not: { startsWith: '[LEGACY]' } },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.accountMapping.findMany({ orderBy: { transactionType: 'asc' } }),
    ]);

    res.json({
      success: true,
      data: { accounts, mappings },
      meta: { total: accounts.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createCoaSchema = z.object({
  code: z.string().min(3),
  name: z.string().min(3),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  parentCode: z.string().optional(),
  isControlAccount: z.boolean().default(false),
});

accountingRouter.post('/coa', requirePermission('accounting:manage'), async (req, res, next) => {
  try {
    const parsed = createCoaSchema.parse(req.body);
    const created = await prisma.chartOfAccount.create({
      data: {
        code: parsed.code.trim(),
        name: parsed.name.trim(),
        type: parsed.type,
        normalBalance: parsed.normalBalance,
        parentCode: parsed.parentCode?.trim() ?? null,
        isControlAccount: parsed.isControlAccount,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'COA_CREATED',
      module: 'ACCOUNTING',
      entityType: 'ChartOfAccount',
      entityId: created.id,
      entityCode: created.code,
      summary: `Menambahkan akun COA baru ${created.code} (${created.name})`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 2. GENERAL JOURNAL (Manual & Automated Journals, Reversals)
accountingRouter.get('/journals', requirePermission('accounting:view'), async (req, res, next) => {
  try {
    const { fiscalPeriodId, businessUnitId, status, search } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
    if (typeof businessUnitId === 'string' && businessUnitId) where.businessUnitId = businessUnitId;
    if (typeof status === 'string' && status) where.status = status;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { journalNumber: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
        { sourceDocNumber: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const journals = await prisma.journalEntry.findMany({
      where,
      include: {
        fiscalPeriod: true,
        businessUnit: true,
        lines: { include: { account: true, costCenter: true } },
      },
      orderBy: { entryDate: 'desc' },
    });

    res.json({
      success: true,
      data: journals.map((j) => ({
        ...j,
        totalDebit: Number(j.totalDebit),
        totalCredit: Number(j.totalCredit),
        lines: j.lines.map((l) => ({
          ...l,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
      })),
      meta: { total: journals.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createJournalSchema = z.object({
  entryDate: z.string().optional(),
  fiscalPeriodId: z.string().optional(),
  businessUnitId: z.string().min(1),
  description: z.string().min(5),
  idempotencyKey: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(2),
        costCenterId: z.string().nullable().optional(),
        description: z.string().min(2),
        debit: z.number().nonnegative(),
        credit: z.number().nonnegative(),
      })
    )
    .min(2),
});

accountingRouter.post('/journals', requirePermission('accounting:post'), async (req, res, next) => {
  try {
    const parsed = createJournalSchema.parse(req.body);
    const idempotencyKey = parsed.idempotencyKey?.trim() || `MANUAL_JRN_${crypto.randomUUID()}`;

    const created = await prisma.$transaction(async (tx) => {
      const journal = await createOrGetBalancedJournal(
        {
          entryDate: parsed.entryDate ? new Date(parsed.entryDate) : new Date(),
          fiscalPeriodId: parsed.fiscalPeriodId,
          businessUnitId: parsed.businessUnitId,
          sourceType: 'MANUAL_JOURNAL',
          idempotencyKey,
          description: parsed.description.trim(),
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: parsed.lines,
        },
        tx
      );

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'JOURNAL_POSTED',
          module: 'ACCOUNTING',
          entityType: 'JournalEntry',
          entityId: journal.id,
          entityCode: journal.journalNumber,
          summary: `Memposting jurnal umum ${journal.journalNumber} senilai Rp ${Number(journal.totalDebit).toLocaleString('id-ID')}`,
          afterData: { journalNumber: journal.journalNumber, totalDebit: journal.totalDebit },
          requestId: req.requestId,
        },
        tx as any
      );

      return journal;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Forbid direct deletion of posted journals
accountingRouter.delete('/journals/:id', requirePermission('accounting:post'), async (_req, _res, next) => {
  next(
    new AppError(
      403,
      'POSTED_JOURNAL_IMMUTABLE',
      'Jurnal yang telah diposting tidak boleh dihapus atau diedit secara langsung. Gunakan fitur Jurnal Pembalik (Reversal) untuk koreksi.'
    )
  );
});

const reverseJournalSchema = z.object({
  reason: z.string().min(5, 'Alasan pembalikan jurnal (Reversal) wajib diisi minimal 5 karakter.'),
});

accountingRouter.post('/journals/:id/reverse', requirePermission('accounting:post'), async (req, res, next) => {
  try {
    const { reason } = reverseJournalSchema.parse(req.body);
    const orig = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { lines: true, fiscalPeriod: true },
    });
    if (!orig) throw new AppError(404, 'JOURNAL_NOT_FOUND', 'Jurnal tidak ditemukan.');
    if (orig.status === 'REVERSED') {
      throw new AppError(409, 'ALREADY_REVERSED', `Jurnal ${orig.journalNumber} sudah dibalik (REVERSED).`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOriginal = await tx.journalEntry.update({
        where: { id: orig.id },
        data: { status: 'REVERSED', reversalReason: reason.trim() },
      });

      const reversal = await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          fiscalPeriodId: orig.fiscalPeriodId,
          businessUnitId: orig.businessUnitId,
          sourceType: 'JOURNAL_REVERSAL',
          sourceId: orig.id,
          sourceDocNumber: orig.journalNumber,
          idempotencyKey: `REV_${orig.id}`,
          description: `Jurnal Pembalik atas ${orig.journalNumber}: ${reason.trim()}`,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: orig.lines.map((l) => ({
            accountCode: l.accountCode,
            costCenterId: l.costCenterId,
            description: `Reversal: ${l.description}`,
            debit: l.credit.toString(),
            credit: l.debit.toString(),
          })),
        },
        tx
      );

      const updatedReversal = await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { reversedFromId: orig.id },
        include: { lines: true },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'JOURNAL_REVERSED',
          module: 'ACCOUNTING',
          entityType: 'JournalEntry',
          entityId: orig.id,
          entityCode: orig.journalNumber,
          summary: `Membuat jurnal pembalik ${reversal.journalNumber} untuk membatalkan jurnal ${orig.journalNumber}. Alasan: ${reason}`,
          afterData: { originalJournal: orig.journalNumber, reversalJournal: reversal.journalNumber },
          requestId: req.requestId,
        },
        tx as any
      );

      return { original: updatedOriginal, reversal: updatedReversal };
    });

    res.status(201).json({ success: true, data: result, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 3. GENERAL LEDGER & TRIAL BALANCE (Derived directly from Posted JournalLines)
accountingRouter.get('/ledger', requirePermission('accounting:view'), async (req, res, next) => {
  try {
    const { accountCode, fiscalPeriodId, businessUnitId } = req.query;
    const entryWhere: Record<string, unknown> = {
      status: { in: ['POSTED', 'REVERSED'] },
    };
    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) entryWhere.fiscalPeriodId = fiscalPeriodId;
    if (typeof businessUnitId === 'string' && businessUnitId) entryWhere.businessUnitId = businessUnitId;

    const lineWhere: Record<string, unknown> = {
      journalEntry: entryWhere,
    };
    if (typeof accountCode === 'string' && accountCode) lineWhere.accountCode = accountCode;

    const [accounts, lines] = await Promise.all([
      prisma.chartOfAccount.findMany({
        where: {
          isActive: true,
          code: { not: { contains: '-' } },
          name: { not: { startsWith: '[LEGACY]' } },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.journalLine.findMany({
        where: lineWhere,
        include: {
          account: true,
          journalEntry: { include: { businessUnit: true, fiscalPeriod: true } },
        },
        orderBy: [{ accountCode: 'asc' }, { journalEntry: { entryDate: 'asc' } }],
      }),
    ]);

    // Group by account and calculate running balance
    const ledgerByAccount = accounts.map((acc) => {
      const accLines = lines.filter((l) => l.accountCode === acc.code);
      let runningCents = 0n;
      let totalDebitCents = 0n;
      let totalCreditCents = 0n;

      const entries = accLines.map((l) => {
        const d = toCents(l.debit);
        const c = toCents(l.credit);
        totalDebitCents += d;
        totalCreditCents += c;
        if (acc.normalBalance === 'DEBIT') {
          runningCents += d - c;
        } else {
          runningCents += c - d;
        }
        return {
          id: l.id,
          journalId: l.journalEntryId,
          journalNumber: l.journalEntry.journalNumber,
          entryDate: l.journalEntry.entryDate,
          sourceType: l.journalEntry.sourceType,
          sourceDocNumber: l.journalEntry.sourceDocNumber,
          businessUnitCode: l.journalEntry.businessUnit.code,
          description: l.description,
          debit: Number(fromCents(d)),
          credit: Number(fromCents(c)),
          runningBalance: Number(fromCents(runningCents)),
        };
      });

      return {
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        normalBalance: acc.normalBalance,
        totalDebit: Number(fromCents(totalDebitCents)),
        totalCredit: Number(fromCents(totalCreditCents)),
        endingBalance: Number(fromCents(runningCents)),
        entries,
      };
    });

    let trialDebitCents = 0n;
    let trialCreditCents = 0n;
    for (const row of ledgerByAccount) {
      trialDebitCents += toCents(row.totalDebit);
      trialCreditCents += toCents(row.totalCredit);
    }

    res.json({
      success: true,
      data: {
        accounts: ledgerByAccount,
        trialBalanceSummary: {
          totalDebit: Number(fromCents(trialDebitCents)),
          totalCredit: Number(fromCents(trialCreditCents)),
          isBalanced: trialDebitCents === trialCreditCents,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 4. AR / AP AGING, FIXED ASSETS & TAX COMPLIANCE
accountingRouter.get('/ar-ap-aging', requirePermission('accounting:view'), async (req, res, next) => {
  try {
    const now = Date.now();
    const [arInvoices, apInvoices] = await Promise.all([
      prisma.customerInvoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        include: { customer: true, businessUnit: true },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.vendorInvoice.findMany({
        where: { status: { in: ['DRAFT', 'VERIFIED', 'APPROVED', 'PARTIALLY_PAID'] } },
        include: { vendor: true, businessUnit: true, purchaseOrder: true },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    function classifyBucket(dueDate: Date): string {
      const diffDays = Math.floor((now - dueDate.getTime()) / 86400000);
      if (diffDays <= 0) return 'CURRENT';
      if (diffDays <= 30) return 'DAYS_1_30';
      if (diffDays <= 60) return 'DAYS_31_60';
      if (diffDays <= 90) return 'DAYS_61_90';
      return 'OVER_90';
    }

    const arItems = arInvoices.map((inv) => {
      const daysOverdue = Math.max(0, Math.floor((now - inv.dueDate.getTime()) / 86400000));
      return {
        id: inv.id,
        docNumber: inv.docNumber,
        partyName: inv.customer.name,
        businessUnitName: inv.businessUnit.name,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(inv.balanceDue),
        daysOverdue,
        agingBucket: classifyBucket(inv.dueDate),
        status: inv.status,
        serviceDelivered: inv.serviceDelivered,
      };
    });

    const apItems = apInvoices.map((inv) => {
      const balanceCents = toCents(inv.totalAmount) - toCents(inv.paidAmount);
      const daysOverdue = Math.max(0, Math.floor((now - inv.dueDate.getTime()) / 86400000));
      return {
        id: inv.id,
        docNumber: inv.internalNumber,
        vendorInvoiceNumber: inv.vendorInvoiceNumber,
        partyName: inv.vendor.name,
        businessUnitName: inv.businessUnit.name,
        poDocNumber: inv.purchaseOrder?.docNumber ?? null,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(fromCents(balanceCents)),
        daysOverdue,
        agingBucket: classifyBucket(inv.dueDate),
        matchingStatus: inv.matchingStatus,
        status: inv.status,
      };
    });

    res.json({
      success: true,
      data: {
        arItems,
        apItems,
        arTotalBalance: arItems.reduce((acc, i) => acc + i.balanceDue, 0),
        apTotalBalance: apItems.reduce((acc, i) => acc + i.balanceDue, 0),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

accountingRouter.get('/assets-and-tax', requirePermission('accounting:view'), async (req, res, next) => {
  try {
    const [fixedAssets, taxConfigs, customerInvoices, vendorInvoices, expenses] = await Promise.all([
      prisma.fixedAsset.findMany({ include: { businessUnit: true }, orderBy: { assetCode: 'asc' } }),
      prisma.taxConfiguration.findMany({ orderBy: { taxCode: 'asc' } }),
      prisma.customerInvoice.findMany({
        where: { status: { not: 'VOID' } },
        include: { customer: true, businessUnit: true },
      }),
      prisma.vendorInvoice.findMany({
        where: { status: { not: 'VOID' } },
        include: { vendor: true, businessUnit: true },
      }),
      prisma.expense.findMany({
        where: { status: { in: ['PAID', 'POSTED'] } },
        include: { businessUnit: true },
      }),
    ]);

    const ppnOutputTotal = customerInvoices.reduce((acc, i) => acc + Number(i.taxAmount), 0);
    const ppnInputTotal =
      vendorInvoices.reduce((acc, i) => acc + Number(i.taxAmount), 0) +
      expenses.reduce((acc, e) => acc + Number(e.taxAmount), 0);

    res.json({
      success: true,
      data: {
        fixedAssets: fixedAssets.map((a) => ({
          ...a,
          acquisitionCost: Number(a.acquisitionCost),
          salvageValue: Number(a.salvageValue),
          accumulatedDepreciation: Number(a.accumulatedDepreciation),
          bookValue: Number(a.bookValue),
        })),
        taxConfigurations: taxConfigs.map((t) => ({
          ...t,
          ratePercent: Number(t.ratePercent),
        })),
        taxSummary: {
          ppnOutputTotal,
          ppnInputTotal,
          netVatPosition: ppnOutputTotal - ppnInputTotal,
          disclaimer:
            'Rekap pajak di atas adalah alat bantu pencatatan internal berdasarkan konfigurasi tarif aplikasi. Pelaporan SPT resmi tetap memerlukan verifikasi konsultan/petugas pajak berwenang sesuai ketentuan DJP.',
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createAssetSchema = z.object({
  name: z.string().min(3),
  category: z.string().min(2),
  businessUnitId: z.string().min(1),
  acquisitionDate: z.string(),
  acquisitionCost: z.number().positive(),
  salvageValue: z.number().nonnegative().default(0),
  usefulLifeMonths: z.number().int().positive().default(48),
  location: z.string().min(2),
});

accountingRouter.post('/assets', requirePermission('accounting:manage'), async (req, res, next) => {
  try {
    const parsed = createAssetSchema.parse(req.body);
    const count = await prisma.fixedAsset.count();
    const assetCode = `AST-2026-${String(count + 1).padStart(4, '0')}`;
    const costStr = fromCents(toCents(parsed.acquisitionCost));

    const created = await prisma.fixedAsset.create({
      data: {
        assetCode,
        name: parsed.name.trim(),
        category: parsed.category.trim(),
        businessUnitId: parsed.businessUnitId,
        acquisitionDate: new Date(parsed.acquisitionDate),
        acquisitionCost: costStr,
        salvageValue: fromCents(toCents(parsed.salvageValue)),
        usefulLifeMonths: parsed.usefulLifeMonths,
        accumulatedDepreciation: '0.00',
        bookValue: costStr,
        location: parsed.location.trim(),
      },
      include: { businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'FIXED_ASSET_REGISTERED',
      module: 'ACCOUNTING',
      entityType: 'FixedAsset',
      entityId: created.id,
      entityCode: created.assetCode,
      summary: `Meregistrasi aset tetap ${created.assetCode} (${created.name}) senilai Rp ${Number(costStr).toLocaleString('id-ID')}`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});
