import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import {
  AppError,
  requireAuth,
  requirePermission,
  enforceUnitScope,
  enforceSeparationOfDuties,
} from '../../middleware/auth.js';

export const budgetRouter = Router();

budgetRouter.use(requireAuth);

function enrichBudget(b: any) {
  const allocated = fromCents(toCents(b.totalAllocated));
  const committed = fromCents(toCents(b.totalCommitted));
  const actual = fromCents(toCents(b.totalActual));
  const available = subMoney(subMoney(allocated, committed), actual);
  return {
    ...b,
    totalAllocated: Number(allocated),
    totalCommitted: Number(committed),
    totalActual: Number(actual),
    availableAmount: Number(available),
    revenueTarget: Number(fromCents(toCents(b.revenueTarget))),
    lines: b.lines?.map((l: any) => {
      const lAlloc = fromCents(toCents(l.allocatedAmount));
      const lComm = fromCents(toCents(l.committedAmount));
      const lAct = fromCents(toCents(l.actualAmount));
      const lAvail = subMoney(subMoney(lAlloc, lComm), lAct);
      return {
        ...l,
        allocatedAmount: Number(lAlloc),
        committedAmount: Number(lComm),
        actualAmount: Number(lAct),
        availableAmount: Number(lAvail),
      };
    }),
  };
}

budgetRouter.get('/', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const { businessUnitId, fiscalPeriodId, status, search } = req.query;
    const where: Record<string, unknown> = {};

    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      where.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      where.businessUnitId = businessUnitId;
    }

    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) {
      where.fiscalPeriodId = fiscalPeriodId;
    }
    if (typeof status === 'string' && status) {
      where.status = status;
    }
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { docNumber: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
        revisions: { orderBy: { version: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: budgets.map(enrichBudget),
      meta: { total: budgets.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

budgetRouter.get('/:id', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: {
          include: {
            costCenter: true,
            commitments: { orderBy: { createdAt: 'desc' } },
          },
        },
        revisions: { orderBy: { version: 'desc' } },
      },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Dokumen anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'Budget', entityId: budget.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        ...enrichBudget(budget),
        auditLogs,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createBudgetSchema = z.object({
  title: z.string().min(4, 'Judul anggaran minimal 4 karakter.'),
  businessUnitId: z.string().min(1),
  fiscalPeriodId: z.string().min(1),
  fundSourceId: z.string().min(1),
  revenueTarget: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        costCenterId: z.string().min(1),
        accountCode: z.string().min(2),
        category: z.enum(['CAPEX', 'OPEX', 'MODAL_KERJA', 'PENGADAAN', 'PEGAWAI', 'PAJAK']),
        description: z.string().min(3),
        allocatedAmount: z.number().positive('Alokasi baris anggaran wajib lebih besar dari 0.'),
      })
    )
    .min(1, 'Anggaran wajib memiliki minimal 1 baris mata anggaran.'),
});

budgetRouter.post('/', requirePermission('budget:create'), async (req, res, next) => {
  try {
    const parsed = createBudgetSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const period = await prisma.fiscalPeriod.findUnique({ where: { id: parsed.fiscalPeriodId } });
    if (!period) throw new AppError(404, 'PERIOD_NOT_FOUND', 'Periode fiskal tidak ditemukan.');
    if (period.isClosed) {
      throw new AppError(409, 'PERIOD_CLOSED', 'Tidak dapat membuat anggaran pada periode fiskal yang telah ditutup.');
    }

    const totalAllocated = addMoney(...parsed.lines.map((l) => l.allocatedAmount));
    const count = await prisma.budget.count();
    const docNumber = `BDG-${period.code}-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.budget.create({
      data: {
        docNumber,
        title: parsed.title.trim(),
        businessUnitId: parsed.businessUnitId,
        fiscalPeriodId: parsed.fiscalPeriodId,
        fundSourceId: parsed.fundSourceId,
        version: 1,
        status: 'DRAFT',
        totalAllocated,
        totalCommitted: '0.00',
        totalActual: '0.00',
        revenueTarget: fromCents(toCents(parsed.revenueTarget)),
        notes: parsed.notes?.trim() ?? null,
        createdById: req.user!.userId,
        createdByName: req.user!.fullName,
        lines: {
          create: parsed.lines.map((l) => ({
            costCenterId: l.costCenterId,
            accountCode: l.accountCode,
            category: l.category,
            description: l.description.trim(),
            allocatedAmount: fromCents(toCents(l.allocatedAmount)),
          })),
        },
      },
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'BUDGET_CREATED',
      module: 'BUDGET',
      entityType: 'Budget',
      entityId: created.id,
      entityCode: created.docNumber,
      summary: `Membuat draft anggaran ${created.docNumber} (${created.title}) senilai Rp ${Number(totalAllocated).toLocaleString('id-ID')}`,
      afterData: { docNumber: created.docNumber, totalAllocated, status: created.status },
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: enrichBudget(created),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post('/:id/submit', requirePermission('budget:submit'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    if (!['DRAFT', 'REJECTED'].includes(budget.status)) {
      throw new AppError(409, 'INVALID_STATE', `Anggaran berstatus ${budget.status} tidak dapat diajukan ulang.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          rejectionReason: null,
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      const reqCount = await tx.approvalRequest.count();
      await tx.approvalRequest.create({
        data: {
          requestNumber: `APR-BDG-${String(reqCount + 1).padStart(4, '0')}`,
          module: 'BUDGET',
          entityId: b.id,
          entityCode: b.docNumber,
          title: `Persetujuan Anggaran: ${b.title}`,
          businessUnitId: b.businessUnitId,
          amount: b.totalAllocated,
          status: 'PENDING',
          requestedById: req.user!.userId,
          requestedByName: req.user!.fullName,
          requiredRoleCode: 'GM_PMO',
        },
      });

      await tx.notification.create({
        data: {
          roleCode: 'GM_PMO',
          title: `Pengajuan Anggaran ${b.docNumber}`,
          message: `${req.user!.fullName} mengajukan anggaran "${b.title}" untuk disetujui.`,
          category: 'APPROVAL_REQUIRED',
          severity: 'WARNING',
          targetUrl: `/budgets`,
          entityType: 'Budget',
          entityId: b.id,
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_SUBMITTED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Mengajukan anggaran ${b.docNumber} untuk persetujuan GM PMO`,
          beforeData: { status: budget.status },
          afterData: { status: b.status },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post('/:id/approve', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (budget.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', `Hanya anggaran berstatus SUBMITTED yang dapat disetujui (status saat ini: ${budget.status}).`);
    }

    enforceSeparationOfDuties(budget.createdById, req.user!.userId);

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'BUDGET', entityId: b.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: req.body?.note || 'Disetujui sesuai plafon periode.',
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_APPROVED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Menyetujui anggaran ${b.docNumber} (Versi ${b.version})`,
          beforeData: { status: budget.status },
          afterData: { status: b.status, approvedBy: req.user!.fullName },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const rejectSchema = z.object({
  reason: z.string().min(5, 'Alasan penolakan wajib diisi minimal 5 karakter.'),
});

budgetRouter.post('/:id/reject', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const { reason } = rejectSchema.parse(req.body);
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (budget.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', 'Hanya anggaran berstatus SUBMITTED yang dapat ditolak.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'BUDGET', entityId: b.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: reason.trim(),
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_REJECTED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Menolak anggaran ${b.docNumber}. Alasan: ${reason}`,
          beforeData: { status: budget.status },
          afterData: { status: b.status, rejectionReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const reviseSchema = z.object({
  reason: z.string().min(5, 'Alasan revisi anggaran wajib diisi minimal 5 karakter.'),
  revenueTarget: z.number().nonnegative().optional(),
  lineUpdates: z
    .array(
      z.object({
        lineId: z.string(),
        newAllocatedAmount: z.number().positive(),
      })
    )
    .min(1),
});

budgetRouter.post('/:id/revise', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const parsed = reviseSchema.parse(req.body);
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (!['APPROVED', 'REVISED'].includes(budget.status)) {
      throw new AppError(409, 'INVALID_STATE', 'Hanya anggaran yang telah disetujui yang dapat direvisi.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Save immutable snapshot of previous version in BudgetRevision
      await tx.budgetRevision.create({
        data: {
          budgetId: budget.id,
          version: budget.version,
          reason: parsed.reason.trim(),
          previousAllocated: budget.totalAllocated,
          newAllocated: '0.00', // updated below
          snapshotData: JSON.parse(JSON.stringify(budget.lines)),
          revisedById: req.user!.userId,
          revisedByName: req.user!.fullName,
          approvedById: req.user!.userId,
          status: 'APPROVED',
        },
      });

      for (const upd of parsed.lineUpdates) {
        const line = budget.lines.find((l) => l.id === upd.lineId);
        if (!line) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', `Baris anggaran ${upd.lineId} tidak ditemukan.`);
        const usedCents = toCents(line.committedAmount) + toCents(line.actualAmount);
        const newAllocCents = toCents(upd.newAllocatedAmount);
        if (newAllocCents < usedCents) {
          throw new AppError(
            409,
            'REVISION_BELOW_USED',
            `Plafon revisi baris "${line.description}" tidak boleh lebih kecil dari total komitmen + aktual yang sudah terpakai (${fromCents(usedCents)}).`
          );
        }
        await tx.budgetLine.update({
          where: { id: line.id },
          data: { allocatedAmount: fromCents(newAllocCents) },
        });
      }

      const freshLines = await tx.budgetLine.findMany({ where: { budgetId: budget.id } });
      const newTotal = addMoney(...freshLines.map((l) => l.allocatedAmount));

      await tx.budgetRevision.updateMany({
        where: { budgetId: budget.id, version: budget.version },
        data: { newAllocated: newTotal },
      });

      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          version: budget.version + 1,
          status: 'REVISED',
          totalAllocated: newTotal,
          revenueTarget:
            parsed.revenueTarget !== undefined ? fromCents(toCents(parsed.revenueTarget)) : budget.revenueTarget,
        },
        include: {
          businessUnit: true,
          fiscalPeriod: true,
          fundSource: true,
          lines: { include: { costCenter: true } },
          revisions: { orderBy: { version: 'desc' } },
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_REVISED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Merevisi anggaran ${b.docNumber} ke Versi ${b.version}. Alasan: ${parsed.reason}`,
          beforeData: { version: budget.version, totalAllocated: budget.totalAllocated },
          afterData: { version: b.version, totalAllocated: newTotal },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});
