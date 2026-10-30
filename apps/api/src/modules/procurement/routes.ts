import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney, mulMoney, calcPercentage } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import {
  AppError,
  requireAuth,
  requirePermission,
  enforceUnitScope,
  enforceSeparationOfDuties,
} from '../../middleware/auth.js';

export const procurementRouter = Router();

procurementRouter.use(requireAuth);

// 1. VENDORS
procurementRouter.get('/vendors', requirePermission('procurement:view'), async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const where: Record<string, unknown> = {};
    if (typeof status === 'string' && status) where.status = status;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
        { taxIdNpwp: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      include: {
        _count: {
          select: { quotations: true, purchaseOrders: true, vendorInvoices: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    res.json({
      success: true,
      data: vendors.map((v) => ({
        ...v,
        evaluationRating: Number(v.evaluationRating),
      })),
      meta: { total: vendors.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createVendorSchema = z.object({
  name: z.string().min(3),
  legalName: z.string().min(3),
  taxIdNpwp: z.string().min(10, 'NPWP vendor wajib diisi minimal 10 karakter.'),
  category: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  address: z.string().min(5),
  bankName: z.string().min(2),
  bankAccountNo: z.string().min(5),
  bankAccountHolder: z.string().min(3),
  hasConflictOfInterest: z.boolean().default(false),
  conflictNote: z.string().optional(),
  status: z.enum(['DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'INACTIVE', 'BLOCKED']).default('ACTIVE'),
});

procurementRouter.post('/vendors', requirePermission('procurement:create'), async (req, res, next) => {
  try {
    const parsed = createVendorSchema.parse(req.body);
    const dup = await prisma.vendor.findUnique({ where: { taxIdNpwp: parsed.taxIdNpwp.trim() } });
    if (dup) {
      throw new AppError(409, 'DUPLICATE_VENDOR_NPWP', `Vendor dengan NPWP ${parsed.taxIdNpwp} sudah terdaftar (${dup.code} - ${dup.name}).`);
    }

    const count = await prisma.vendor.count();
    const code = `VND-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.vendor.create({
      data: {
        code,
        name: parsed.name.trim(),
        legalName: parsed.legalName.trim(),
        taxIdNpwp: parsed.taxIdNpwp.trim(),
        category: parsed.category.trim(),
        contactName: parsed.contactName.trim(),
        email: parsed.email.toLowerCase().trim(),
        phone: parsed.phone.trim(),
        address: parsed.address.trim(),
        bankName: parsed.bankName.trim(),
        bankAccountNo: parsed.bankAccountNo.trim(),
        bankAccountHolder: parsed.bankAccountHolder.trim(),
        hasConflictOfInterest: parsed.hasConflictOfInterest,
        conflictNote: parsed.conflictNote?.trim() ?? null,
        status: parsed.status,
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'VENDOR_CREATED',
      module: 'PROCUREMENT',
      entityType: 'Vendor',
      entityId: created.id,
      entityCode: created.code,
      summary: `Mendaftarkan vendor baru ${created.code} (${created.name})`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 2. PURCHASE REQUESTS (PR)
procurementRouter.get('/purchase-requests', requirePermission('procurement:view'), async (req, res, next) => {
  try {
    const { businessUnitId, status, search } = req.query;
    const where: Record<string, unknown> = {};
    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      where.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      where.businessUnitId = businessUnitId;
    }
    if (typeof status === 'string' && status) where.status = status;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { docNumber: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const prs = await prisma.purchaseRequest.findMany({
      where,
      include: {
        businessUnit: true,
        costCenter: true,
        budgetLine: { include: { budget: true } },
        lines: true,
        quotations: { include: { vendor: true } },
        purchaseOrders: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: prs.map((pr) => ({
        ...pr,
        estimatedTotal: Number(pr.estimatedTotal),
        lines: pr.lines.map((l) => ({
          ...l,
          quantity: Number(l.quantity),
          estimatedUnitPrice: Number(l.estimatedUnitPrice),
          lineTotal: Number(l.lineTotal),
        })),
        quotations: pr.quotations.map((q) => ({
          ...q,
          quotedSubtotal: Number(q.quotedSubtotal),
          taxAmount: Number(q.taxAmount),
          totalAmount: Number(q.totalAmount),
        })),
      })),
      meta: { total: prs.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createPrSchema = z.object({
  title: z.string().min(4),
  businessUnitId: z.string().min(1),
  costCenterId: z.string().min(1),
  budgetLineId: z.string().min(1),
  purpose: z.string().min(5),
  minQuotationsRequired: z.number().int().min(1).default(3),
  submitImmediately: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        itemName: z.string().min(2),
        specification: z.string().optional(),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        estimatedUnitPrice: z.number().positive(),
      })
    )
    .min(1),
});

procurementRouter.post('/purchase-requests', requirePermission('procurement:create'), async (req, res, next) => {
  try {
    const parsed = createPrSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: parsed.budgetLineId },
      include: { budget: true },
    });
    if (!budgetLine) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', 'Mata anggaran tidak ditemukan.');
    if (!['APPROVED', 'REVISED'].includes(budgetLine.budget.status)) {
      throw new AppError(
        409,
        'BUDGET_NOT_APPROVED',
        `Anggaran induk (${budgetLine.budget.docNumber}) berstatus ${budgetLine.budget.status}. Hanya anggaran yang telah disetujui yang dapat digunakan untuk pengadaan.`
      );
    }

    const computedLines = parsed.lines.map((l) => {
      const lineTotal = mulMoney(l.estimatedUnitPrice, l.quantity);
      return {
        itemName: l.itemName.trim(),
        specification: l.specification?.trim() ?? null,
        quantity: fromCents(toCents(l.quantity)),
        unit: l.unit.trim(),
        estimatedUnitPrice: fromCents(toCents(l.estimatedUnitPrice)),
        lineTotal,
      };
    });

    const estimatedTotal = addMoney(...computedLines.map((l) => l.lineTotal));
    const availableCents =
      toCents(budgetLine.allocatedAmount) - toCents(budgetLine.committedAmount) - toCents(budgetLine.actualAmount);

    if (toCents(estimatedTotal) > availableCents) {
      throw new AppError(
        409,
        'BUDGET_CEILING_EXCEEDED',
        `Estimasi nilai PR (Rp ${Number(estimatedTotal).toLocaleString('id-ID')}) melebihi sisa plafon mata anggaran "${budgetLine.description}" (Tersedia: Rp ${Number(fromCents(availableCents)).toLocaleString('id-ID')}).`
      );
    }

    const count = await prisma.purchaseRequest.count();
    const docNumber = `PR-2026-${String(count + 1).padStart(4, '0')}`;
    const initialStatus = parsed.submitImmediately ? 'SUBMITTED' : 'DRAFT';

    const created = await prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseRequest.create({
        data: {
          docNumber,
          title: parsed.title.trim(),
          businessUnitId: parsed.businessUnitId,
          costCenterId: parsed.costCenterId,
          budgetLineId: parsed.budgetLineId,
          purpose: parsed.purpose.trim(),
          estimatedTotal,
          status: initialStatus,
          minQuotationsRequired: parsed.minQuotationsRequired,
          requestedById: req.user!.userId,
          requestedByName: req.user!.fullName,
          lines: { create: computedLines },
        },
        include: {
          businessUnit: true,
          costCenter: true,
          budgetLine: { include: { budget: true } },
          lines: true,
          quotations: true,
        },
      });

      if (initialStatus === 'SUBMITTED') {
        const aprCount = await tx.approvalRequest.count();
        const requiredRole = toCents(estimatedTotal) >= toCents(25000000) ? 'GM_PMO' : 'FINANCE_MANAGER';
        await tx.approvalRequest.create({
          data: {
            requestNumber: `APR-PR-${String(aprCount + 1).padStart(4, '0')}`,
            module: 'PURCHASE_REQUEST',
            entityId: pr.id,
            entityCode: pr.docNumber,
            title: `Persetujuan PR: ${pr.title}`,
            businessUnitId: pr.businessUnitId,
            amount: pr.estimatedTotal,
            status: 'PENDING',
            requestedById: req.user!.userId,
            requestedByName: req.user!.fullName,
            requiredRoleCode: requiredRole,
          },
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PR_CREATED',
          module: 'PROCUREMENT',
          entityType: 'PurchaseRequest',
          entityId: pr.id,
          entityCode: pr.docNumber,
          summary: `Membuat Purchase Request ${pr.docNumber} (${pr.title}) senilai Rp ${Number(estimatedTotal).toLocaleString('id-ID')}`,
          afterData: { docNumber: pr.docNumber, estimatedTotal, status: pr.status },
          requestId: req.requestId,
        },
        tx as any
      );

      return pr;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

procurementRouter.post('/purchase-requests/:id/approve', requirePermission('procurement:approve'), async (req, res, next) => {
  try {
    const pr = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { budgetLine: { include: { budget: true } } },
    });
    if (!pr) throw new AppError(404, 'PR_NOT_FOUND', 'Purchase Request tidak ditemukan.');
    if (pr.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', `Purchase Request berstatus ${pr.status} tidak dapat disetujui.`);
    }

    enforceSeparationOfDuties(pr.requestedById, req.user!.userId);

    const updated = await prisma.$transaction(async (tx) => {
      // Re-verify budget availability inside transaction to prevent concurrent overspending
      const freshLine = await tx.budgetLine.findUnique({
        where: { id: pr.budgetLineId },
        include: { budget: true },
      });
      if (!freshLine) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', 'Mata anggaran tidak ditemukan.');

      const availableCents =
        toCents(freshLine.allocatedAmount) - toCents(freshLine.committedAmount) - toCents(freshLine.actualAmount);
      if (toCents(pr.estimatedTotal) > availableCents) {
        throw new AppError(
          409,
          'CONCURRENT_BUDGET_EXCEEDED',
          `Sisa plafon anggaran tidak mencukupi saat persetujuan diproses (Sisa tersedia: Rp ${Number(fromCents(availableCents)).toLocaleString('id-ID')}).`
        );
      }

      // Reserve budget commitment
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

      const newLineCommitted = addMoney(freshLine.committedAmount, pr.estimatedTotal);
      const newBudgetCommitted = addMoney(freshLine.budget.totalCommitted, pr.estimatedTotal);

      await tx.budgetLine.update({
        where: { id: freshLine.id },
        data: { committedAmount: newLineCommitted },
      });
      await tx.budget.update({
        where: { id: freshLine.budgetId },
        data: { totalCommitted: newBudgetCommitted },
      });

      const approvedPr = await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
        },
        include: { businessUnit: true, costCenter: true, budgetLine: true, lines: true, quotations: true },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'PURCHASE_REQUEST', entityId: pr.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: req.body?.note || 'Disetujui dan komitmen anggaran telah dicadangkan.',
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PR_APPROVED',
          module: 'PROCUREMENT',
          entityType: 'PurchaseRequest',
          entityId: pr.id,
          entityCode: pr.docNumber,
          summary: `Menyetujui PR ${pr.docNumber} dan mencadangkan komitmen anggaran Rp ${Number(pr.estimatedTotal).toLocaleString('id-ID')}`,
          beforeData: { status: pr.status },
          afterData: { status: approvedPr.status, reservedCommitment: pr.estimatedTotal },
          requestId: req.requestId,
        },
        tx as any
      );

      return approvedPr;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

procurementRouter.post('/purchase-requests/:id/reject', requirePermission('procurement:approve'), async (req, res, next) => {
  try {
    const reason = z.string().min(5, 'Alasan penolakan wajib diisi minimal 5 karakter.').parse(req.body?.reason);
    const pr = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) throw new AppError(404, 'PR_NOT_FOUND', 'Purchase Request tidak ditemukan.');

    const updated = await prisma.$transaction(async (tx) => {
      const rejected = await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: 'REJECTED', rejectionReason: reason.trim() },
      });
      await tx.approvalRequest.updateMany({
        where: { module: 'PURCHASE_REQUEST', entityId: pr.id, status: 'PENDING' },
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
          action: 'PR_REJECTED',
          module: 'PROCUREMENT',
          entityType: 'PurchaseRequest',
          entityId: pr.id,
          entityCode: pr.docNumber,
          summary: `Menolak PR ${pr.docNumber}. Alasan: ${reason}`,
          requestId: req.requestId,
        },
        tx as any
      );
      return rejected;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 3. VENDOR QUOTATIONS ON PR
const addQuotationSchema = z.object({
  vendorId: z.string().min(1),
  quotationNumber: z.string().min(2),
  quotedSubtotal: z.number().positive(),
  taxRatePercent: z.number().min(0).max(100).default(11),
  deliveryDays: z.number().int().positive(),
  warrantyInfo: z.string().optional(),
  documentComplete: z.boolean().default(true),
  notes: z.string().optional(),
});

procurementRouter.post(
  '/purchase-requests/:id/quotations',
  requirePermission('procurement:create'),
  async (req, res, next) => {
    try {
      const parsed = addQuotationSchema.parse(req.body);
      const pr = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id } });
      if (!pr) throw new AppError(404, 'PR_NOT_FOUND', 'Purchase Request tidak ditemukan.');

      const vendor = await prisma.vendor.findUnique({ where: { id: parsed.vendorId } });
      if (!vendor) throw new AppError(404, 'VENDOR_NOT_FOUND', 'Vendor tidak ditemukan.');
      if (vendor.status !== 'ACTIVE') {
        throw new AppError(409, 'VENDOR_NOT_ACTIVE', `Vendor ${vendor.name} berstatus ${vendor.status} dan tidak dapat mengikuti penawaran.`);
      }

      const subtotal = fromCents(toCents(parsed.quotedSubtotal));
      const taxAmount = calcPercentage(subtotal, parsed.taxRatePercent);
      const totalAmount = addMoney(subtotal, taxAmount);

      const quotation = await prisma.vendorQuotation.create({
        data: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          quotationNumber: parsed.quotationNumber.trim(),
          quotedSubtotal: subtotal,
          taxAmount,
          totalAmount,
          deliveryDays: parsed.deliveryDays,
          warrantyInfo: parsed.warrantyInfo?.trim() ?? null,
          documentComplete: parsed.documentComplete,
          notes: parsed.notes?.trim() ?? null,
        },
        include: { vendor: true },
      });

      await recordAuditLog({
        actorId: req.user!.userId,
        actorName: req.user!.fullName,
        actorRole: req.user!.roleCode,
        action: 'QUOTATION_ADDED',
        module: 'PROCUREMENT',
        entityType: 'PurchaseRequest',
        entityId: pr.id,
        entityCode: pr.docNumber,
        summary: `Menambahkan penawaran vendor ${vendor.name} (${quotation.quotationNumber}) senilai Rp ${Number(totalAmount).toLocaleString('id-ID')}`,
        requestId: req.requestId,
      });

      res.status(201).json({ success: true, data: quotation, meta: { requestId: req.requestId } });
    } catch (err) {
      next(err);
    }
  }
);

// 4. PURCHASE ORDERS (PO) & GOODS RECEIPT & VENDOR INVOICE
procurementRouter.get('/purchase-orders', requirePermission('procurement:view'), async (req, res, next) => {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        purchaseRequest: true,
        vendor: true,
        businessUnit: true,
        lines: true,
        goodsReceipts: { include: { lines: true } },
        vendorInvoices: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: pos.map((po) => ({
        ...po,
        subtotal: Number(po.subtotal),
        discountAmount: Number(po.discountAmount),
        taxAmount: Number(po.taxAmount),
        totalAmount: Number(po.totalAmount),
        lines: po.lines.map((l) => ({
          ...l,
          quantity: Number(l.quantity),
          receivedQuantity: Number(l.receivedQuantity),
          invoicedQuantity: Number(l.invoicedQuantity),
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        })),
      })),
      meta: { total: pos.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createPoSchema = z.object({
  purchaseRequestId: z.string().min(1),
  selectedQuotationId: z.string().min(1),
  paymentTerms: z.string().default('NET 30'),
  expectedDeliveryDate: z.string().optional(),
  selectionJustification: z.string().min(5, 'Alasan pemilihan vendor wajib diisi.'),
  quotationExceptionReason: z.string().optional(),
});

procurementRouter.post('/purchase-orders', requirePermission('procurement:create'), async (req, res, next) => {
  try {
    const parsed = createPoSchema.parse(req.body);
    const pr = await prisma.purchaseRequest.findUnique({
      where: { id: parsed.purchaseRequestId },
      include: { lines: true, quotations: { include: { vendor: true } } },
    });
    if (!pr) throw new AppError(404, 'PR_NOT_FOUND', 'Purchase Request tidak ditemukan.');
    if (!['APPROVED', 'QUOTATION_REVIEW'].includes(pr.status)) {
      throw new AppError(
        409,
        'PR_NOT_APPROVED',
        `Purchase Order tidak dapat dibuat karena PR ${pr.docNumber} belum disetujui (status: ${pr.status}).`
      );
    }

    const quotationCount = pr.quotations.length;
    if (quotationCount < pr.minQuotationsRequired && (!parsed.quotationExceptionReason || parsed.quotationExceptionReason.trim().length < 5)) {
      throw new AppError(
        409,
        'MIN_QUOTATIONS_NOT_MET',
        `Kebijakan pengadaan mewajibkan minimal ${pr.minQuotationsRequired} penawaran vendor (saat ini baru ${quotationCount}). Tambahkan penawaran lain atau isi alasan pengecualian kuotasi.`
      );
    }

    const selectedQuote = pr.quotations.find((q) => q.id === parsed.selectedQuotationId);
    if (!selectedQuote) {
      throw new AppError(404, 'QUOTATION_NOT_FOUND', 'Penawaran vendor yang dipilih tidak ditemukan pada PR ini.');
    }
    if (selectedQuote.vendor.status !== 'ACTIVE') {
      throw new AppError(409, 'VENDOR_INACTIVE', `Vendor terpilih (${selectedQuote.vendor.name}) tidak berstatus ACTIVE.`);
    }

    const count = await prisma.purchaseOrder.count();
    const docNumber = `PO-2026-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.$transaction(async (tx) => {
      await tx.vendorQuotation.updateMany({
        where: { purchaseRequestId: pr.id },
        data: { isSelected: false },
      });
      await tx.vendorQuotation.update({
        where: { id: selectedQuote.id },
        data: { isSelected: true, selectionReason: parsed.selectionJustification.trim() },
      });

      if (parsed.quotationExceptionReason) {
        await tx.purchaseRequest.update({
          where: { id: pr.id },
          data: { status: 'ORDERED', quotationExceptionReason: parsed.quotationExceptionReason.trim() },
        });
      } else {
        await tx.purchaseRequest.update({
          where: { id: pr.id },
          data: { status: 'ORDERED' },
        });
      }

      // Distribute quoted subtotal proportionally across PR lines
      const ratio =
        Number(pr.estimatedTotal) > 0 ? Number(selectedQuote.quotedSubtotal) / Number(pr.estimatedTotal) : 1;

      const poLines = pr.lines.map((l) => {
        const unitPrice = fromCents(toCents(Number(l.estimatedUnitPrice) * ratio));
        const lineTotal = mulMoney(unitPrice, l.quantity);
        return {
          itemName: l.itemName,
          quantity: l.quantity,
          receivedQuantity: '0.00',
          invoicedQuantity: '0.00',
          unit: l.unit,
          unitPrice,
          lineTotal,
        };
      });

      const po = await tx.purchaseOrder.create({
        data: {
          docNumber,
          purchaseRequestId: pr.id,
          vendorId: selectedQuote.vendorId,
          businessUnitId: pr.businessUnitId,
          selectedQuotationId: selectedQuote.id,
          expectedDeliveryDate: parsed.expectedDeliveryDate
            ? new Date(parsed.expectedDeliveryDate)
            : new Date(Date.now() + selectedQuote.deliveryDays * 86400000),
          paymentTerms: parsed.paymentTerms,
          subtotal: selectedQuote.quotedSubtotal,
          discountAmount: '0.00',
          taxAmount: selectedQuote.taxAmount,
          totalAmount: selectedQuote.totalAmount,
          status: 'APPROVED',
          selectionJustification: parsed.selectionJustification.trim(),
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          approvedById: req.user!.userId,
          approvedAt: new Date(),
          lines: { create: poLines },
        },
        include: { vendor: true, businessUnit: true, lines: true, purchaseRequest: true },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PO_CREATED',
          module: 'PROCUREMENT',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          entityCode: po.docNumber,
          summary: `Menerbitkan Purchase Order ${po.docNumber} ke ${po.vendor.name} senilai Rp ${Number(po.totalAmount).toLocaleString('id-ID')}`,
          afterData: { docNumber: po.docNumber, vendor: po.vendor.name, totalAmount: po.totalAmount },
          requestId: req.requestId,
        },
        tx as any
      );

      return po;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const goodsReceiptSchema = z.object({
  deliveryNoteRef: z.string().min(2, 'Nomor surat jalan wajib diisi.'),
  conditionNote: z.string().optional(),
  items: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().min(1),
        quantityReceived: z.number().positive(),
        condition: z.enum(['GOOD', 'DAMAGED', 'PARTIAL_DEFECT']).default('GOOD'),
      })
    )
    .min(1),
});

procurementRouter.post('/purchase-orders/:id/goods-receipts', requirePermission('procurement:create'), async (req, res, next) => {
  try {
    const parsed = goodsReceiptSchema.parse(req.body);
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!po) throw new AppError(404, 'PO_NOT_FOUND', 'Purchase Order tidak ditemukan.');
    if (po.status === 'CANCELLED') {
      throw new AppError(409, 'PO_CANCELLED', 'PO yang telah dibatalkan tidak dapat menerima barang.');
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const item of parsed.items) {
        const line = po.lines.find((l) => l.id === item.purchaseOrderLineId);
        if (!line) throw new AppError(404, 'PO_LINE_NOT_FOUND', 'Baris PO tidak ditemukan.');
        const remainingCents = toCents(line.quantity) - toCents(line.receivedQuantity);
        if (toCents(item.quantityReceived) > remainingCents) {
          throw new AppError(
            409,
            'RECEIPT_EXCEEDS_ORDERED',
            `Kuantitas diterima untuk "${line.itemName}" (${item.quantityReceived}) melebihi sisa kuantitas PO yang belum diterima (${fromCents(remainingCents)}).`
          );
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            receivedQuantity: addMoney(line.receivedQuantity, item.quantityReceived),
          },
        });
      }

      const freshLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
      const allReceived = freshLines.every((l) => toCents(l.receivedQuantity) >= toCents(l.quantity));
      const newPoStatus = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      const grCount = await tx.goodsReceipt.count();
      const gr = await tx.goodsReceipt.create({
        data: {
          docNumber: `GR-2026-${String(grCount + 1).padStart(4, '0')}`,
          purchaseOrderId: po.id,
          receivedById: req.user!.userId,
          receivedByName: req.user!.fullName,
          deliveryNoteRef: parsed.deliveryNoteRef.trim(),
          conditionNote: parsed.conditionNote?.trim() ?? null,
          status: allReceived ? 'COMPLETE' : 'PARTIAL',
          lines: {
            create: parsed.items.map((i) => {
              const l = po.lines.find((line) => line.id === i.purchaseOrderLineId)!;
              return {
                purchaseOrderLineId: l.id,
                itemName: l.itemName,
                quantityReceived: fromCents(toCents(i.quantityReceived)),
                condition: i.condition,
              };
            }),
          },
        },
        include: { lines: true },
      });

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newPoStatus },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'GOODS_RECEIPT_RECORDED',
          module: 'PROCUREMENT',
          entityType: 'PurchaseOrder',
          entityId: po.id,
          entityCode: po.docNumber,
          summary: `Mencatat penerimaan barang ${gr.docNumber} untuk PO ${po.docNumber} (Status PO: ${newPoStatus})`,
          afterData: { grDocNumber: gr.docNumber, poStatus: newPoStatus },
          requestId: req.requestId,
        },
        tx as any
      );

      return { goodsReceipt: gr, poStatus: newPoStatus };
    });

    res.status(201).json({ success: true, data: result, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 5. VENDOR INVOICES (3-Way Matching)
procurementRouter.get('/vendor-invoices', requirePermission('procurement:view'), async (req, res, next) => {
  try {
    const invoices = await prisma.vendorInvoice.findMany({
      include: {
        vendor: true,
        purchaseOrder: { include: { lines: true, goodsReceipts: true } },
        businessUnit: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
      })),
      meta: { total: invoices.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createVendorInvoiceSchema = z.object({
  vendorId: z.string().min(1),
  vendorInvoiceNumber: z.string().min(2),
  purchaseOrderId: z.string().optional(),
  businessUnitId: z.string().min(1),
  invoiceDate: z.string(),
  dueDate: z.string(),
  subtotal: z.number().positive(),
  taxAmount: z.number().nonnegative(),
  allowExceptionReview: z.boolean().default(false),
  matchingNote: z.string().optional(),
});

procurementRouter.post('/vendor-invoices', requirePermission('procurement:create'), async (req, res, next) => {
  try {
    const parsed = createVendorInvoiceSchema.parse(req.body);
    const dup = await prisma.vendorInvoice.findUnique({
      where: {
        vendorId_vendorInvoiceNumber: {
          vendorId: parsed.vendorId,
          vendorInvoiceNumber: parsed.vendorInvoiceNumber.trim(),
        },
      },
    });
    if (dup) {
      throw new AppError(
        409,
        'DUPLICATE_VENDOR_INVOICE',
        `Nomor tagihan vendor "${parsed.vendorInvoiceNumber}" sudah pernah dicatat untuk vendor ini (${dup.internalNumber}).`
      );
    }

    const totalAmount = addMoney(parsed.subtotal, parsed.taxAmount);
    let matchingStatus = 'MATCHED_3WAY';
    let status = 'VERIFIED';

    if (parsed.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: parsed.purchaseOrderId },
        include: { lines: true },
      });
      if (!po) throw new AppError(404, 'PO_NOT_FOUND', 'PO referensi tidak ditemukan.');

      // Calculate maximum billable amount based on received ratio
      const totalOrderedQty = po.lines.reduce((acc, l) => acc + Number(l.quantity), 0);
      const totalReceivedQty = po.lines.reduce((acc, l) => acc + Number(l.receivedQuantity), 0);
      const receivedRatio = totalOrderedQty > 0 ? totalReceivedQty / totalOrderedQty : 0;
      const maxBillableCents = toCents(Number(po.totalAmount) * receivedRatio);

      if (toCents(totalAmount) > maxBillableCents) {
        if (!parsed.allowExceptionReview) {
          throw new AppError(
            409,
            'THREE_WAY_MATCH_FAILED',
            `Tagihan vendor (Rp ${Number(totalAmount).toLocaleString('id-ID')}) melebihi nilai barang yang sudah diterima pada PO ${po.docNumber} (Maksimal dapat ditagihkan: Rp ${Number(fromCents(maxBillableCents)).toLocaleString('id-ID')}). Aktifkan pengajuan exception review jika diperlukan.`
          );
        }
        matchingStatus = 'EXCEPTION_REVIEW';
        status = 'DRAFT';
      }
    }

    const count = await prisma.vendorInvoice.count();
    const internalNumber = `VINV-2026-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.vendorInvoice.create({
      data: {
        internalNumber,
        vendorInvoiceNumber: parsed.vendorInvoiceNumber.trim(),
        vendorId: parsed.vendorId,
        purchaseOrderId: parsed.purchaseOrderId ?? null,
        businessUnitId: parsed.businessUnitId,
        invoiceDate: new Date(parsed.invoiceDate),
        dueDate: new Date(parsed.dueDate),
        subtotal: fromCents(toCents(parsed.subtotal)),
        taxAmount: fromCents(toCents(parsed.taxAmount)),
        totalAmount,
        matchingStatus,
        matchingNote: parsed.matchingNote?.trim() ?? null,
        status,
        createdById: req.user!.userId,
        verifiedById: status === 'VERIFIED' ? req.user!.userId : null,
      },
      include: { vendor: true, purchaseOrder: true, businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'VENDOR_INVOICE_RECORDED',
      module: 'PROCUREMENT',
      entityType: 'VendorInvoice',
      entityId: created.id,
      entityCode: created.internalNumber,
      summary: `Mencatat tagihan vendor ${created.vendorInvoiceNumber} (${created.internalNumber}) dengan status pencocokan ${created.matchingStatus}`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 6. EXPENSES (Pengeluaran Kas/Biaya Operasional)
procurementRouter.get('/expenses', requirePermission('expense:view'), async (req, res, next) => {
  try {
    const { businessUnitId, status, category, search } = req.query;
    const where: Record<string, unknown> = {};
    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      where.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      where.businessUnitId = businessUnitId;
    }
    if (typeof status === 'string' && status) where.status = status;
    if (typeof category === 'string' && category) where.category = category;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { docNumber: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { recipientName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        businessUnit: true,
        costCenter: true,
        budgetLine: { include: { budget: true } },
        fundSource: true,
        vendor: true,
        vendorInvoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: expenses.map((e) => ({
        ...e,
        subtotal: Number(e.subtotal),
        taxAmount: Number(e.taxAmount),
        totalAmount: Number(e.totalAmount),
      })),
      meta: { total: expenses.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createExpenseSchema = z.object({
  title: z.string().min(4),
  businessUnitId: z.string().min(1),
  costCenterId: z.string().min(1),
  budgetLineId: z.string().min(1),
  fundSourceId: z.string().min(1),
  vendorId: z.string().optional(),
  vendorInvoiceId: z.string().optional(),
  category: z.string().min(2),
  paymentMethod: z.enum(['BANK_TRANSFER', 'PETTY_CASH', 'VIRTUAL_ACCOUNT']).default('BANK_TRANSFER'),
  recipientName: z.string().min(2),
  transactionDate: z.string().optional(),
  subtotal: z.number().positive(),
  taxAmount: z.number().nonnegative().default(0),
  description: z.string().min(4),
  receiptRef: z.string().optional(),
  submitImmediately: z.boolean().default(true),
});

procurementRouter.post('/expenses', requirePermission('expense:create'), async (req, res, next) => {
  try {
    const parsed = createExpenseSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const budgetLine = await prisma.budgetLine.findUnique({
      where: { id: parsed.budgetLineId },
      include: { budget: true },
    });
    if (!budgetLine) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', 'Mata anggaran tidak ditemukan.');
    if (!['APPROVED', 'REVISED'].includes(budgetLine.budget.status)) {
      throw new AppError(409, 'BUDGET_NOT_APPROVED', 'Mata anggaran belum berstatus disetujui.');
    }

    const totalAmount = addMoney(parsed.subtotal, parsed.taxAmount);
    const availableCents =
      toCents(budgetLine.allocatedAmount) - toCents(budgetLine.committedAmount) - toCents(budgetLine.actualAmount);

    // If not consuming an existing PO/PR commitment, ensure available ceiling covers the expense
    if (!parsed.vendorInvoiceId && toCents(totalAmount) > availableCents) {
      throw new AppError(
        409,
        'BUDGET_CEILING_EXCEEDED',
        `Nominal pengeluaran (Rp ${Number(totalAmount).toLocaleString('id-ID')}) melebihi sisa plafon anggaran "${budgetLine.description}" (Tersedia: Rp ${Number(fromCents(availableCents)).toLocaleString('id-ID')}).`
      );
    }

    const count = await prisma.expense.count();
    const docNumber = `EXP-2026-${String(count + 1).padStart(4, '0')}`;
    const status = parsed.submitImmediately ? 'SUBMITTED' : 'DRAFT';

    const created = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          docNumber,
          title: parsed.title.trim(),
          businessUnitId: parsed.businessUnitId,
          costCenterId: parsed.costCenterId,
          budgetLineId: parsed.budgetLineId,
          fundSourceId: parsed.fundSourceId,
          vendorId: parsed.vendorId || null,
          vendorInvoiceId: parsed.vendorInvoiceId || null,
          category: parsed.category,
          paymentMethod: parsed.paymentMethod,
          recipientName: parsed.recipientName.trim(),
          transactionDate: parsed.transactionDate ? new Date(parsed.transactionDate) : new Date(),
          subtotal: fromCents(toCents(parsed.subtotal)),
          taxAmount: fromCents(toCents(parsed.taxAmount)),
          totalAmount,
          description: parsed.description.trim(),
          receiptRef: parsed.receiptRef?.trim() ?? null,
          status,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
        },
        include: { businessUnit: true, costCenter: true, budgetLine: true, fundSource: true },
      });

      if (status === 'SUBMITTED') {
        const aprCount = await tx.approvalRequest.count();
        await tx.approvalRequest.create({
          data: {
            requestNumber: `APR-EXP-${String(aprCount + 1).padStart(4, '0')}`,
            module: 'EXPENSE',
            entityId: exp.id,
            entityCode: exp.docNumber,
            title: `Persetujuan Pengeluaran: ${exp.title}`,
            businessUnitId: exp.businessUnitId,
            amount: exp.totalAmount,
            status: 'PENDING',
            requestedById: req.user!.userId,
            requestedByName: req.user!.fullName,
            requiredRoleCode: 'FINANCE_MANAGER',
          },
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'EXPENSE_CREATED',
          module: 'EXPENSE',
          entityType: 'Expense',
          entityId: exp.id,
          entityCode: exp.docNumber,
          summary: `Membuat transaksi pengeluaran ${exp.docNumber} (${exp.title}) sebesar Rp ${Number(totalAmount).toLocaleString('id-ID')}`,
          afterData: { docNumber: exp.docNumber, totalAmount, status: exp.status },
          requestId: req.requestId,
        },
        tx as any
      );

      return exp;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

procurementRouter.post('/expenses/:id/approve', requirePermission('expense:approve'), async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Data pengeluaran tidak ditemukan.');
    if (expense.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', `Pengeluaran berstatus ${expense.status} tidak dapat disetujui.`);
    }

    enforceSeparationOfDuties(expense.createdById, req.user!.userId);

    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
        },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'EXPENSE', entityId: exp.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: req.body?.note || 'Pengeluaran terverifikasi dan disetujui untuk dicairkan.',
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'EXPENSE_APPROVED',
          module: 'EXPENSE',
          entityType: 'Expense',
          entityId: exp.id,
          entityCode: exp.docNumber,
          summary: `Menyetujui pengeluaran ${exp.docNumber}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return exp;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Pay & Auto-Post Expense to Budget Actual + General Journal
procurementRouter.post('/expenses/:id/pay', requirePermission('expense:pay'), async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        budgetLine: { include: { budget: true } },
        vendorInvoice: { include: { purchaseOrder: true } },
      },
    });
    if (!expense) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Pengeluaran tidak ditemukan.');
    if (!['APPROVED', 'SCHEDULED'].includes(expense.status)) {
      throw new AppError(
        409,
        'EXPENSE_NOT_APPROVED',
        `Pengeluaran ${expense.docNumber} berstatus ${expense.status}. Wajib disetujui sebelum dicairkan.`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const freshLine = await tx.budgetLine.findUnique({
        where: { id: expense.budgetLineId },
        include: { budget: true },
      });
      if (!freshLine) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', 'Mata anggaran tidak ditemukan.');

      // Check if there is an active commitment from linked PR to release
      let releasedCommitmentCents = 0n;
      if (expense.vendorInvoice?.purchaseOrder?.purchaseRequestId) {
        const commitment = await tx.budgetCommitment.findFirst({
          where: {
            sourceType: 'PURCHASE_REQUEST',
            sourceId: expense.vendorInvoice.purchaseOrder.purchaseRequestId,
            status: 'RESERVED',
          },
        });
        if (commitment) {
          releasedCommitmentCents = toCents(commitment.amount);
          await tx.budgetCommitment.update({
            where: { id: commitment.id },
            data: { status: 'CONSUMED' },
          });
        }
      }

      const newCommittedCents =
        toCents(freshLine.committedAmount) - releasedCommitmentCents >= 0n
          ? toCents(freshLine.committedAmount) - releasedCommitmentCents
          : 0n;
      const newBudgetCommittedCents =
        toCents(freshLine.budget.totalCommitted) - releasedCommitmentCents >= 0n
          ? toCents(freshLine.budget.totalCommitted) - releasedCommitmentCents
          : 0n;

      const availableAfterRelease =
        toCents(freshLine.allocatedAmount) - newCommittedCents - toCents(freshLine.actualAmount);

      if (toCents(expense.totalAmount) > availableAfterRelease) {
        throw new AppError(
          409,
          'BUDGET_EXCEEDED_ON_PAYMENT',
          `Pencairan gagal: sisa anggaran tidak mencukupi (Tersedia: Rp ${Number(fromCents(availableAfterRelease)).toLocaleString('id-ID')}).`
        );
      }

      await tx.budgetLine.update({
        where: { id: freshLine.id },
        data: {
          committedAmount: fromCents(newCommittedCents),
          actualAmount: addMoney(freshLine.actualAmount, expense.totalAmount),
        },
      });

      await tx.budget.update({
        where: { id: freshLine.budgetId },
        data: {
          totalCommitted: fromCents(newBudgetCommittedCents),
          totalActual: addMoney(freshLine.budget.totalActual, expense.totalAmount),
        },
      });

      if (expense.vendorInvoiceId) {
        await tx.vendorInvoice.update({
          where: { id: expense.vendorInvoiceId },
          data: {
            paidAmount: expense.totalAmount,
            status: 'PAID',
          },
        });
      }

      // Auto-post balanced double-entry journal idempotently
      const debitAccount = freshLine.accountCode || '5-1100';
      const creditAccount = expense.paymentMethod === 'PETTY_CASH' ? '1-1110' : '1-1120';

      const journal = await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: expense.businessUnitId,
          sourceType: 'EXPENSE',
          sourceId: expense.id,
          sourceDocNumber: expense.docNumber,
          idempotencyKey: `EXPENSE_PAY_${expense.id}`,
          description: `Pencairan & Posting Biaya ${expense.docNumber}: ${expense.title}`,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: [
            {
              accountCode: debitAccount,
              costCenterId: expense.costCenterId,
              description: `Realisasi beban: ${expense.title}`,
              debit: expense.totalAmount.toString(),
              credit: '0.00',
            },
            {
              accountCode: creditAccount,
              costCenterId: expense.costCenterId,
              description: `Pengeluaran kas/bank untuk ${expense.recipientName}`,
              debit: '0.00',
              credit: expense.totalAmount.toString(),
            },
          ],
        },
        tx
      );

      const paidExp = await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: 'POSTED',
          paidAt: new Date(),
          journalEntryId: journal.id,
        },
        include: { businessUnit: true, costCenter: true, budgetLine: true },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'EXPENSE_PAID_AND_POSTED',
          module: 'EXPENSE',
          entityType: 'Expense',
          entityId: paidExp.id,
          entityCode: paidExp.docNumber,
          summary: `Mencairkan pengeluaran ${paidExp.docNumber} dan memposting jurnal ${journal.journalNumber}`,
          afterData: { status: paidExp.status, journalNumber: journal.journalNumber },
          requestId: req.requestId,
        },
        tx as any
      );

      return { expense: paidExp, journal };
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Void / Reversal of posted expense (never hard delete)
procurementRouter.post('/expenses/:id/void', requirePermission('expense:approve'), async (req, res, next) => {
  try {
    const reason = z.string().min(5, 'Alasan void/reversal wajib diisi minimal 5 karakter.').parse(req.body?.reason);
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: { budgetLine: { include: { budget: true } } },
    });
    if (!expense) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Pengeluaran tidak ditemukan.');
    if (expense.status === 'VOID') throw new AppError(409, 'ALREADY_VOID', 'Transaksi sudah berstatus VOID.');

    const updated = await prisma.$transaction(async (tx) => {
      if (['PAID', 'POSTED'].includes(expense.status)) {
        // Restore budget actual
        await tx.budgetLine.update({
          where: { id: expense.budgetLineId },
          data: {
            actualAmount: subMoney(expense.budgetLine.actualAmount, expense.totalAmount),
          },
        });
        await tx.budget.update({
          where: { id: expense.budgetLine.budgetId },
          data: {
            totalActual: subMoney(expense.budgetLine.budget.totalActual, expense.totalAmount),
          },
        });

        // Create reversal journal if journal existed
        if (expense.journalEntryId) {
          const origJournal = await tx.journalEntry.findUnique({
            where: { id: expense.journalEntryId },
            include: { lines: true },
          });
          if (origJournal && origJournal.status !== 'REVERSED') {
            await tx.journalEntry.update({
              where: { id: origJournal.id },
              data: { status: 'REVERSED', reversalReason: reason.trim() },
            });
            await createOrGetBalancedJournal(
              {
                entryDate: new Date(),
                businessUnitId: expense.businessUnitId,
                sourceType: 'EXPENSE_REVERSAL',
                sourceId: expense.id,
                sourceDocNumber: expense.docNumber,
                idempotencyKey: `EXPENSE_VOID_${expense.id}`,
                description: `Jurnal Pembalik (Reversal) atas ${origJournal.journalNumber}: ${reason}`,
                createdById: req.user!.userId,
                createdByName: req.user!.fullName,
                lines: origJournal.lines.map((l) => ({
                  accountCode: l.accountCode,
                  costCenterId: l.costCenterId,
                  description: `Reversal: ${l.description}`,
                  debit: l.credit.toString(),
                  credit: l.debit.toString(),
                })),
              },
              tx
            );
          }
        }
      }

      const voided = await tx.expense.update({
        where: { id: expense.id },
        data: { status: 'VOID', voidReason: reason.trim() },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'EXPENSE_VOIDED',
          module: 'EXPENSE',
          entityType: 'Expense',
          entityId: voided.id,
          entityCode: voided.docNumber,
          summary: `Membatalkan (VOID/Reversal) pengeluaran ${voided.docNumber}. Alasan: ${reason}`,
          beforeData: { status: expense.status },
          afterData: { status: voided.status, voidReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return voided;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});
