import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { requireAuth, requirePermission, AppError, enforceSeparationOfDuties } from '../../middleware/auth.js';
import { recordAuditLog } from '../../shared/audit.js';
import { toCents, fromCents, addMoney } from '../../shared/decimal.js';

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth);

type UserPayload = NonNullable<Express.Request['user']>;

function checkCanApprove(approval: any, user: UserPayload): boolean {
  if (approval.status !== 'PENDING') return false;

  const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SELF_APPROVAL === 'true';
  const isRequester = approval.requestedById === user.userId;

  // Separation of Duties (SoD): Requester cannot approve their own document unless dev/test or SUPER_ADMIN
  if (isRequester && !isDevOrTest && user.roleCode !== 'SUPER_ADMIN') {
    return false;
  }

  if (user.roleCode === 'SUPER_ADMIN') return true;

  if (user.roleCode === 'GM_PMO') {
    return ['GM_PMO', 'FINANCE_MANAGER', 'UNIT_MANAGER'].includes(approval.requiredRoleCode) || !approval.requiredRoleCode;
  }

  if (user.roleCode === 'FINANCE_MANAGER') {
    return ['FINANCE_MANAGER', 'UNIT_MANAGER'].includes(approval.requiredRoleCode) || !approval.requiredRoleCode;
  }

  if (user.roleCode === 'UNIT_MANAGER') {
    return approval.requiredRoleCode === 'UNIT_MANAGER' &&
      (!user.businessUnitId || approval.businessUnitId === user.businessUnitId);
  }

  return false;
}

// 1. LIST APPROVAL INBOX
approvalsRouter.get('/', requirePermission('approval:view'), async (req, res, next) => {
  try {
    const { status = 'PENDING', module, scope, search, businessUnitId } = req.query;
    const user = req.user!;
    const where: Record<string, unknown> = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (module && module !== 'ALL') {
      where.module = module;
    }

    if (businessUnitId && typeof businessUnitId === 'string') {
      where.businessUnitId = businessUnitId;
    }

    // Role-based scoping
    if (user.roleCode === 'UNIT_MANAGER') {
      const unitConditions: Record<string, unknown>[] = [{ requestedById: user.userId }];
      if (user.businessUnitId) {
        unitConditions.push({ businessUnitId: user.businessUnitId });
      }

      if (scope === 'assigned') {
        where.AND = [
          { requiredRoleCode: 'UNIT_MANAGER' },
          { OR: unitConditions },
        ];
      } else if (scope === 'my_requests') {
        where.requestedById = user.userId;
      } else {
        where.OR = unitConditions;
      }
    } else if (user.roleCode === 'FINANCE_MANAGER') {
      if (scope === 'assigned') {
        where.requiredRoleCode = 'FINANCE_MANAGER';
      } else if (scope === 'my_requests') {
        where.requestedById = user.userId;
      }
    } else if (user.roleCode === 'GM_PMO') {
      if (scope === 'assigned') {
        where.requiredRoleCode = { in: ['GM_PMO', 'FINANCE_MANAGER'] };
      } else if (scope === 'my_requests') {
        where.requestedById = user.userId;
      }
    } else if (user.roleCode !== 'SUPER_ADMIN') {
      if (scope === 'assigned') {
        where.requiredRoleCode = user.roleCode;
      } else if (scope === 'my_requests') {
        where.requestedById = user.userId;
      }
    }

    if (search && typeof search === 'string') {
      const q = search.trim();
      where.OR = [
        { requestNumber: { contains: q, mode: 'insensitive' } },
        { entityCode: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { requestedByName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.approvalRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const enriched = items.map((item) => ({
      ...item,
      amount: Number(item.amount),
      canApprove: checkCanApprove(item, user),
      isSelfRequested: item.requestedById === user.userId,
    }));

    res.json({
      success: true,
      data: enriched,
      meta: {
        total: enriched.length,
        pendingCount: enriched.filter((a) => a.status === 'PENDING').length,
        actionRequiredCount: enriched.filter((a) => a.canApprove && a.status === 'PENDING').length,
        requestId: req.requestId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. APPROVAL STATS & KPI SUMMARY
approvalsRouter.get('/stats', requirePermission('approval:view'), async (req, res, next) => {
  try {
    const user = req.user!;
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

    const allRequests = await prisma.approvalRequest.findMany();

    const pendingRequests = allRequests.filter((r) => r.status === 'PENDING');
    const myActionRequired = pendingRequests.filter((r) => checkCanApprove(r, user));

    const totalPendingAmount = pendingRequests.reduce((acc, r) => acc + Number(r.amount), 0);

    const byModule: Record<string, number> = {
      BUDGET: 0,
      PURCHASE_REQUEST: 0,
      EXPENSE: 0,
      PETTY_CASH: 0,
      CASHIER_DISCREPANCY: 0,
    };

    pendingRequests.forEach((r) => {
      if (byModule[r.module] !== undefined) {
        byModule[r.module]++;
      } else {
        byModule[r.module] = 1;
      }
    });

    const approvedThisMonth = allRequests.filter(
      (r) => r.status === 'APPROVED' && r.decidedAt && new Date(r.decidedAt) >= startOfMonth
    ).length;

    const rejectedThisMonth = allRequests.filter(
      (r) => r.status === 'REJECTED' && r.decidedAt && new Date(r.decidedAt) >= startOfMonth
    ).length;

    res.json({
      success: true,
      data: {
        totalPending: pendingRequests.length,
        actionRequiredCount: myActionRequired.length,
        totalPendingAmount,
        byModule,
        approvedThisMonth,
        rejectedThisMonth,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 3. APPROVAL DETAIL WITH ENTITY ENRICHMENT
approvalsRouter.get('/:id', requirePermission('approval:view'), async (req, res, next) => {
  try {
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!approval) {
      throw new AppError(404, 'NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.');
    }

    let entityDetail: any = null;

    if (approval.module === 'PURCHASE_REQUEST') {
      entityDetail = await prisma.purchaseRequest.findUnique({
        where: { id: approval.entityId },
        include: { lines: true, quotations: { include: { vendor: true } }, budgetLine: true, businessUnit: true },
      });
    } else if (approval.module === 'BUDGET') {
      entityDetail = await prisma.budget.findUnique({
        where: { id: approval.entityId },
        include: { lines: true, businessUnit: true, fiscalPeriod: true },
      });
    } else if (approval.module === 'EXPENSE') {
      entityDetail = await prisma.expense.findUnique({
        where: { id: approval.entityId },
        include: { businessUnit: true, costCenter: true, budgetLine: true },
      });
    } else if (approval.module === 'PETTY_CASH') {
      entityDetail = await prisma.pettyCashSubmission.findUnique({
        where: { id: approval.entityId },
        include: { items: true, businessUnit: true },
      });
    } else if (approval.module === 'CASHIER_DISCREPANCY') {
      entityDetail = await prisma.cashierSession.findUnique({
        where: { id: approval.entityId },
        include: { cashRegister: true, businessUnit: true, payments: true },
      });
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: approval.entityId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      success: true,
      data: {
        ...approval,
        amount: Number(approval.amount),
        canApprove: checkCanApprove(approval, req.user!),
        entityDetail,
        auditLogs,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 4. CENTRAL APPROVE DISPATCHER
approvalsRouter.post('/:id/approve', requirePermission('approval:action'), async (req, res, next) => {
  try {
    const user = req.user!;
    const approval = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!approval) {
      throw new AppError(404, 'NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.');
    }

    if (approval.status !== 'PENDING') {
      throw new AppError(409, 'INVALID_STATE', `Permintaan sudah berstatus ${approval.status}.`);
    }

    // Enforce Separation of Duties
    enforceSeparationOfDuties(approval.requestedById, user.userId);

    // Enforce Role Authority
    if (!checkCanApprove(approval, user)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `Peran Anda (${user.roleCode}) tidak berwenang menyetujui dokumen ini (Dibutuhkan: ${approval.requiredRoleCode}).`
      );
    }

    const note = req.body?.note || `Disetujui melalui Central Approval Inbox oleh ${user.fullName}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Dispatch domain-specific logic
      if (approval.module === 'PURCHASE_REQUEST') {
        const pr = await tx.purchaseRequest.findUnique({
          where: { id: approval.entityId },
          include: { budgetLine: { include: { budget: true } } },
        });

        if (pr && pr.budgetLine) {
          const freshLine = pr.budgetLine;
          const availableCents =
            toCents(freshLine.allocatedAmount) - toCents(freshLine.committedAmount) - toCents(freshLine.actualAmount);
          if (toCents(pr.estimatedTotal) > availableCents) {
            throw new AppError(
              409,
              'CONCURRENT_BUDGET_EXCEEDED',
              `Sisa plafon anggaran tidak mencukupi (Tersedia: Rp ${Number(fromCents(availableCents)).toLocaleString('id-ID')}).`
            );
          }

          await tx.budgetCommitment.create({
            data: {
              budgetLineId: freshLine.id,
              sourceType: 'PURCHASE_REQUEST',
              sourceId: pr.id,
              sourceDocNumber: pr.docNumber,
              amount: pr.estimatedTotal,
              status: 'RESERVED',
            },
          });

          await tx.budgetLine.update({
            where: { id: freshLine.id },
            data: { committedAmount: addMoney(freshLine.committedAmount, pr.estimatedTotal) },
          });

          await tx.budget.update({
            where: { id: freshLine.budgetId },
            data: { totalCommitted: addMoney(freshLine.budget.totalCommitted, pr.estimatedTotal) },
          });

          await tx.purchaseRequest.update({
            where: { id: pr.id },
            data: {
              status: 'APPROVED',
              approvedById: user.userId,
              approvedByName: user.fullName,
              approvedAt: new Date(),
            },
          });
        }
      } else if (approval.module === 'BUDGET') {
        await tx.budget.update({
          where: { id: approval.entityId },
          data: {
            status: 'APPROVED',
            approvedById: user.userId,
            approvedByName: user.fullName,
            approvedAt: new Date(),
          },
        });
      } else if (approval.module === 'EXPENSE') {
        await tx.expense.update({
          where: { id: approval.entityId },
          data: {
            status: 'APPROVED',
            approvedById: user.userId,
            approvedByName: user.fullName,
            approvedAt: new Date(),
          },
        });
      } else if (approval.module === 'PETTY_CASH') {
        await tx.pettyCashSubmission.update({
          where: { id: approval.entityId },
          data: {
            status: 'APPROVED',
            approvedBy: user.fullName,
            approvedAt: new Date(),
          },
        });
      } else if (approval.module === 'CASHIER_DISCREPANCY') {
        await tx.cashierSession.update({
          where: { id: approval.entityId },
          data: {
            status: 'CLOSED',
            reviewNote: note,
            reviewedById: user.userId,
            reviewedByName: user.fullName,
            reviewedAt: new Date(),
            closedAt: new Date(),
          },
        });
      }

      // 2. Update ApprovalRequest status
      const updated = await tx.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: 'APPROVED',
          decidedById: user.userId,
          decidedByName: user.fullName,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });

      // 3. Record Audit Log
      await recordAuditLog(
        {
          actorId: user.userId,
          actorName: user.fullName,
          actorRole: user.roleCode,
          action: 'APPROVAL_GRANTED',
          module: approval.module,
          entityType: 'ApprovalRequest',
          entityId: approval.id,
          entityCode: approval.entityCode,
          summary: `Menyetujui permohonan ${approval.requestNumber} (${approval.entityCode}) sebesar Rp ${Number(approval.amount).toLocaleString('id-ID')}`,
          beforeData: { status: 'PENDING' },
          afterData: { status: 'APPROVED', decidedBy: user.fullName, note },
          requestId: req.requestId,
        },
        tx as any
      );

      return updated;
    });

    res.json({
      success: true,
      data: {
        ...result,
        amount: Number(result.amount),
      },
      message: `Dokumen ${approval.entityCode} berhasil disetujui.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 5. CENTRAL REJECT DISPATCHER
const rejectSchema = z.object({
  reason: z.string().min(5, 'Alasan penolakan wajib diisi minimal 5 karakter.'),
});

approvalsRouter.post('/:id/reject', requirePermission('approval:action'), async (req, res, next) => {
  try {
    const user = req.user!;
    const { reason } = rejectSchema.parse(req.body);

    const approval = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!approval) {
      throw new AppError(404, 'NOT_FOUND', 'Permintaan persetujuan tidak ditemukan.');
    }

    if (approval.status !== 'PENDING') {
      throw new AppError(409, 'INVALID_STATE', `Permintaan sudah berstatus ${approval.status}.`);
    }

    if (!checkCanApprove(approval, user)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `Peran Anda (${user.roleCode}) tidak berwenang menolak dokumen ini (Dibutuhkan: ${approval.requiredRoleCode}).`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Dispatch domain-specific rejection
      if (approval.module === 'PURCHASE_REQUEST') {
        await tx.purchaseRequest.update({
          where: { id: approval.entityId },
          data: { status: 'REJECTED', rejectionReason: reason.trim() },
        });
      } else if (approval.module === 'BUDGET') {
        await tx.budget.update({
          where: { id: approval.entityId },
          data: { status: 'REJECTED', rejectionReason: reason.trim() },
        });
      } else if (approval.module === 'EXPENSE') {
        await tx.expense.update({
          where: { id: approval.entityId },
          data: { status: 'REJECTED', rejectionReason: reason.trim() },
        });
      } else if (approval.module === 'PETTY_CASH') {
        await tx.pettyCashSubmission.update({
          where: { id: approval.entityId },
          data: { status: 'REJECTED' },
        });
      } else if (approval.module === 'CASHIER_DISCREPANCY') {
        await tx.cashierSession.update({
          where: { id: approval.entityId },
          data: {
            reviewNote: `Penolakan selisih kasir: ${reason.trim()}`,
            reviewedById: user.userId,
            reviewedByName: user.fullName,
            reviewedAt: new Date(),
          },
        });
      }

      // 2. Update ApprovalRequest
      const updated = await tx.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: 'REJECTED',
          decidedById: user.userId,
          decidedByName: user.fullName,
          decidedAt: new Date(),
          decisionNote: reason.trim(),
        },
      });

      // 3. Record Audit Log
      await recordAuditLog(
        {
          actorId: user.userId,
          actorName: user.fullName,
          actorRole: user.roleCode,
          action: 'APPROVAL_REJECTED',
          module: approval.module,
          entityType: 'ApprovalRequest',
          entityId: approval.id,
          entityCode: approval.entityCode,
          summary: `Menolak permohonan ${approval.requestNumber} (${approval.entityCode}) dengan alasan: ${reason.trim()}`,
          beforeData: { status: 'PENDING' },
          afterData: { status: 'REJECTED', decidedBy: user.fullName, reason: reason.trim() },
          requestId: req.requestId,
        },
        tx as any
      );

      return updated;
    });

    res.json({
      success: true,
      data: {
        ...result,
        amount: Number(result.amount),
      },
      message: `Dokumen ${approval.entityCode} telah ditolak dengan alasan: ${reason.trim()}`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 6. BATCH APPROVE DISPATCHER
const batchApproveSchema = z.object({
  requestIds: z.array(z.string().uuid()).min(1, 'Minimal satu ID persetujuan harus dipilih.'),
  note: z.string().optional(),
});

approvalsRouter.post('/batch-approve', requirePermission('approval:action'), async (req, res, next) => {
  try {
    const user = req.user!;
    const { requestIds, note } = batchApproveSchema.parse(req.body);

    const results: Array<{ id: string; success: boolean; entityCode?: string; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const id of requestIds) {
      try {
        const approval = await prisma.approvalRequest.findUnique({ where: { id } });
        if (!approval) {
          results.push({ id, success: false, error: 'Permintaan tidak ditemukan.' });
          failedCount++;
          continue;
        }

        if (approval.status !== 'PENDING') {
          results.push({ id, success: false, entityCode: approval.entityCode, error: `Sudah berstatus ${approval.status}` });
          failedCount++;
          continue;
        }

        // SoD check
        const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.ALLOW_SELF_APPROVAL === 'true';
        if (approval.requestedById === user.userId && !isDevOrTest && user.roleCode !== 'SUPER_ADMIN') {
          results.push({ id, success: false, entityCode: approval.entityCode, error: 'Pelanggaran Separation of Duties (SoD)' });
          failedCount++;
          continue;
        }

        if (!checkCanApprove(approval, user)) {
          results.push({ id, success: false, entityCode: approval.entityCode, error: 'Wewenang peran tidak mencukupi' });
          failedCount++;
          continue;
        }

        const approvalNote = note || `Disetujui melalui Batch Approval oleh ${user.fullName}`;

        await prisma.$transaction(async (tx) => {
          if (approval.module === 'PURCHASE_REQUEST') {
            const pr = await tx.purchaseRequest.findUnique({
              where: { id: approval.entityId },
              include: { budgetLine: { include: { budget: true } } },
            });
            if (pr && pr.budgetLine) {
              const freshLine = pr.budgetLine;
              await tx.budgetCommitment.create({
                data: {
                  budgetLineId: freshLine.id,
                  sourceType: 'PURCHASE_REQUEST',
                  sourceId: pr.id,
                  sourceDocNumber: pr.docNumber,
                  amount: pr.estimatedTotal,
                  status: 'RESERVED',
                },
              });
              await tx.budgetLine.update({
                where: { id: freshLine.id },
                data: { committedAmount: addMoney(freshLine.committedAmount, pr.estimatedTotal) },
              });
              await tx.budget.update({
                where: { id: freshLine.budgetId },
                data: { totalCommitted: addMoney(freshLine.budget.totalCommitted, pr.estimatedTotal) },
              });
              await tx.purchaseRequest.update({
                where: { id: pr.id },
                data: {
                  status: 'APPROVED',
                  approvedById: user.userId,
                  approvedByName: user.fullName,
                  approvedAt: new Date(),
                },
              });
            }
          } else if (approval.module === 'BUDGET') {
            await tx.budget.update({
              where: { id: approval.entityId },
              data: { status: 'APPROVED', approvedById: user.userId, approvedByName: user.fullName, approvedAt: new Date() },
            });
          } else if (approval.module === 'EXPENSE') {
            await tx.expense.update({
              where: { id: approval.entityId },
              data: { status: 'APPROVED', approvedById: user.userId, approvedByName: user.fullName, approvedAt: new Date() },
            });
          } else if (approval.module === 'PETTY_CASH') {
            await tx.pettyCashSubmission.update({
              where: { id: approval.entityId },
              data: { status: 'APPROVED', approvedBy: user.fullName, approvedAt: new Date() },
            });
          } else if (approval.module === 'CASHIER_DISCREPANCY') {
            await tx.cashierSession.update({
              where: { id: approval.entityId },
              data: {
                status: 'CLOSED',
                reviewNote: approvalNote,
                reviewedById: user.userId,
                reviewedByName: user.fullName,
                reviewedAt: new Date(),
                closedAt: new Date(),
              },
            });
          }

          await tx.approvalRequest.update({
            where: { id: approval.id },
            data: {
              status: 'APPROVED',
              decidedById: user.userId,
              decidedByName: user.fullName,
              decidedAt: new Date(),
              decisionNote: approvalNote,
            },
          });

          await recordAuditLog(
            {
              actorId: user.userId,
              actorName: user.fullName,
              actorRole: user.roleCode,
              action: 'BATCH_APPROVAL_GRANTED',
              module: approval.module,
              entityType: 'ApprovalRequest',
              entityId: approval.id,
              entityCode: approval.entityCode,
              summary: `Batch approval untuk ${approval.requestNumber} (${approval.entityCode})`,
              requestId: req.requestId,
            },
            tx as any
          );
        });

        results.push({ id, success: true, entityCode: approval.entityCode });
        successCount++;
      } catch (itemErr: any) {
        results.push({ id, success: false, error: itemErr.message || 'Gagal memproses approval' });
        failedCount++;
      }
    }

    res.json({
      success: true,
      data: {
        total: requestIds.length,
        successCount,
        failedCount,
        results,
      },
      message: `Batch approval selesai: ${successCount} berhasil, ${failedCount} gagal.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
