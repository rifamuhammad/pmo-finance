import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney, mulMoney, calcPercentage } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import { computeWebhookSignature } from '../../shared/security.js';
import { AppError, requireAuth, requirePermission, enforceUnitScope } from '../../middleware/auth.js';
import { penerimaanRouter } from './penerimaan-routes.js';
import { computePtnbhRevenueTax } from './tax-engine.js';
import { savePaymentProofFromDataUrl, getInvoiceProofMap } from './payment-proof.js';

export const revenueRouter = Router();

// Publicly accessible webhook endpoint with HMAC signature verification (before requireAuth)
const webhookSchema = z.object({
  eventId: z.string().min(4),
  customerInvoiceId: z.string().min(1),
  grossAmount: z.number().positive(),
  feeAmount: z.number().nonnegative().default(0),
  method: z.string().default('VIRTUAL_ACCOUNT_SIMULATED'),
  referenceNo: z.string().min(3),
});

revenueRouter.post('/payments/webhook', async (req, res, next) => {
  try {
    const signatureHeader = req.headers['x-webhook-signature'];
    const rawPayload = JSON.stringify(req.body);
    const expectedSignature = computeWebhookSignature(rawPayload);

    if (typeof signatureHeader !== 'string' || signatureHeader !== expectedSignature) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Tanda tangan webhook (HMAC-SHA256) tidak valid atau tidak terverifikasi.');
    }

    const parsed = webhookSchema.parse(req.body);

    // Idempotent check
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: `WEBHOOK_${parsed.eventId}` },
    });
    if (existing) {
      res.json({
        success: true,
        data: { payment: existing, idempotentReplay: true },
        meta: { requestId: req.requestId },
      });
      return;
    }

    const invoice = await prisma.customerInvoice.findUnique({ where: { id: parsed.customerInvoiceId } });
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice pelanggan tidak ditemukan.');

    const gross = fromCents(toCents(parsed.grossAmount));
    const fee = fromCents(toCents(parsed.feeAmount));
    const net = subMoney(gross, fee);

    if (toCents(gross) > toCents(invoice.balanceDue)) {
      throw new AppError(409, 'PAYMENT_EXCEEDS_BALANCE', 'Nominal pembayaran melebihi sisa tagihan invoice.');
    }

    const count = await prisma.payment.count();
    const receiptNumber = `KWT-2026-${String(count + 1).padStart(4, '0')}`;

    const payment = await prisma.$transaction(async (tx) => {
      const newPaid = addMoney(invoice.paidAmount, gross);
      const newBalance = subMoney(invoice.totalAmount, newPaid);
      const newStatus = toCents(newBalance) === 0n ? 'PAID' : 'PARTIALLY_PAID';

      await tx.customerInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: newPaid, balanceDue: newBalance, status: newStatus },
      });

      const createdPayment = await tx.payment.create({
        data: {
          receiptNumber,
          customerInvoiceId: invoice.id,
          method: parsed.method,
          grossAmount: gross,
          feeAmount: fee,
          netAmount: net,
          referenceNo: parsed.referenceNo,
          idempotencyKey: `WEBHOOK_${parsed.eventId}`,
          status: 'CONFIRMED',
          receivedById: 'SYSTEM_WEBHOOK',
          receivedByName: 'Webhook Payment Gateway (Terverifikasi)',
        },
      });

      await recordAuditLog(
        {
          actorId: null,
          actorName: 'Payment Webhook Engine',
          actorRole: 'SYSTEM',
          action: 'PAYMENT_WEBHOOK_CONFIRMED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: createdPayment.id,
          entityCode: createdPayment.receiptNumber,
          summary: `Webhook pembayaran ${createdPayment.receiptNumber} untuk invoice ${invoice.docNumber} sebesar Rp ${Number(gross).toLocaleString('id-ID')}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return createdPayment;
    });

    res.status(201).json({
      success: true,
      data: { payment, idempotentReplay: false },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Helper to resolve official 12-digit Chart of Accounts (Pertor 310) for Revenue & POS Engines
async function resolveRevenueAccounts(tx: any, buCode?: string) {
  // 1. AR Account (Piutang dari Kegiatan Nonakademik Lainnya - Pertor 310)
  let arAccount = '110302030100';
  const checkAr = await tx.chartOfAccount.findUnique({ where: { code: arAccount } });
  if (!checkAr) arAccount = '1-1210';

  // 2. Output Tax Account (PPN Keluaran)
  let ppnAccount = '210202010100';
  const checkPpn = await tx.chartOfAccount.findUnique({ where: { code: ppnAccount } });
  if (!checkPpn) ppnAccount = '2-1210';

  // 3. Bank Account (Rekening Giro Bank Mandiri - Penerimaan PMO)
  let bankAccount = '110102010100';
  const checkBank = await tx.chartOfAccount.findUnique({ where: { code: bankAccount } });
  if (!checkBank) bankAccount = '1-1120';

  // 4. Cash Account (Kas Uang Persediaan)
  let cashAccount = '110101010100';
  const checkCash = await tx.chartOfAccount.findUnique({ where: { code: cashAccount } });
  if (!checkCash) cashAccount = '1-1110';

  // 5. Merchant Fee / Bank Admin Account (Beban Administrasi Rekening - Pertor 310)
  let feeAccount = '590101010300';
  const checkFee = await tx.chartOfAccount.findUnique({ where: { code: feeAccount } });
  if (!checkFee) feeAccount = '5-1500';

  // 6. Revenue Account based on Business Unit (Pertor 310)
  let revenueAccount = '420301090100'; // Default: Pendapatan Lainnya dari Unit Bisnis
  if (buCode === 'BU-TCI') revenueAccount = '420301010200'; // Pendapatan Pelatihan
  else if (buCode === 'BU-ITS') revenueAccount = '420301040200'; // Pendapatan Jasa TI Bidang Nonakademik
  else if (buCode === 'BU-KLINIK') revenueAccount = '420301060100'; // Pendapatan Jasa Dokter Umum
  else if (buCode === 'BU-MICE') revenueAccount = '420301070200'; // Pendapatan Sewa Gedung dan Bangunan
  else if (buCode === 'BU-PMO-MGMT') revenueAccount = '420301090100';

  const checkRev = await tx.chartOfAccount.findUnique({ where: { code: revenueAccount } });
  if (!checkRev) revenueAccount = '4-1100';

  // 7. Service Charge Account (MICE / Hospitality)
  let serviceChargeAccount = '420301070300'; // Pendapatan Fasilitas & Layanan Tambahan
  const checkSc = await tx.chartOfAccount.findUnique({ where: { code: serviceChargeAccount } });
  if (!checkSc) serviceChargeAccount = checkRev ? revenueAccount : '4-1200';

  return {
    arAccount,
    ppnAccount,
    bankAccount,
    cashAccount,
    feeAccount,
    revenueAccount,
    serviceChargeAccount,
  };
}

// Protect all subsequent routes
revenueRouter.use(requireAuth);
revenueRouter.use('/', penerimaanRouter);

// 1. CUSTOMERS & PRODUCTS/SERVICES
revenueRouter.get('/customers', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        _count: { select: { salesOrders: true, customerInvoices: true } },
      },
      orderBy: { code: 'asc' },
    });
    res.json({
      success: true,
      data: customers.map((c) => ({ ...c, creditLimit: Number(c.creditLimit) })),
      meta: { total: customers.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createCustomerSchema = z.object({
  name: z.string().min(3),
  organizationType: z.enum(['CORPORATE', 'GOVERNMENT', 'SOE_BUMN', 'INDIVIDUAL', 'INTERNAL_UT']).default('CORPORATE'),
  taxCollectorProfile: z
    .enum(['FP_040_UMUM', 'FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH', 'INTERNAL_UT'])
    .optional(),
  taxIdNpwp: z.string().optional(),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  address: z.string().min(5),
  creditLimit: z.number().nonnegative().default(100000000),
});

revenueRouter.post('/customers', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = createCustomerSchema.parse(req.body);
    const existingCusts = await prisma.customer.findMany({ select: { code: true } });
    let maxCustSeq = existingCusts.length;
    for (const c of existingCusts) {
      const m = String(c.code || '').match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxCustSeq) maxCustSeq = n;
      }
    }
    let custSeq = maxCustSeq + 1;
    let code = `CUST-${String(custSeq).padStart(4, '0')}`;
    while (await prisma.customer.findUnique({ where: { code }, select: { id: true } })) {
      custSeq++;
      code = `CUST-${String(custSeq).padStart(4, '0')}`;
    }
    const inferredProfile =
      parsed.taxCollectorProfile ||
      (parsed.organizationType === 'GOVERNMENT'
        ? 'FP_020_INSTANSI'
        : parsed.organizationType === 'SOE_BUMN'
          ? 'FP_030_BUMN'
          : parsed.organizationType === 'INTERNAL_UT'
            ? 'INTERNAL_UT'
            : 'FP_040_UMUM');

    const created = await prisma.customer.create({
      data: {
        code,
        name: parsed.name.trim(),
        organizationType: parsed.organizationType,
        taxCollectorProfile: inferredProfile,
        taxIdNpwp: parsed.taxIdNpwp?.trim() ?? null,
        contactPerson: parsed.contactPerson.trim(),
        email: parsed.email.toLowerCase().trim(),
        phone: parsed.phone.trim(),
        address: parsed.address.trim(),
        creditLimit: fromCents(toCents(parsed.creditLimit)),
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'CUSTOMER_CREATED',
      module: 'REVENUE',
      entityType: 'Customer',
      entityId: created.id,
      entityCode: created.code,
      summary: `Menambahkan pelanggan baru ${created.code} (${created.name})`,
      afterData: created,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

revenueRouter.get('/products', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const products = await prisma.productService.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        businessUnit: true,
        priceHistories: { orderBy: { changedAt: 'desc' }, take: 5 },
      },
      orderBy: { sku: 'asc' },
    });

    res.json({
      success: true,
      data: products.map((p) => ({
        ...p,
        unitPrice: Number(p.unitPrice),
        priceHistories: p.priceHistories.map((h) => ({
          ...h,
          oldPrice: Number(h.oldPrice),
          newPrice: Number(h.newPrice),
        })),
      })),
      meta: { total: products.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createProductSchema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(3, 'Nama layanan wajib minimal 3 karakter.'),
  category: z.string().min(2, 'Kategori layanan wajib diisi.'),
  location: z.string().optional().nullable(),
  businessUnitId: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  unit: z.string().default('Paket'),
  taxCode: z.string().default('PPN-12'),
  taxScheme: z.enum(['PB1_10', 'PPN12_PMK131', 'PPN12_PPH4_2', 'PPN12_PPH23', 'BEBAS_PAJAK']).default('PPN12_PMK131'),
  taxInclusive: z.boolean().default(true),
  revenueAccountCode: z.string().default('420301090100'),
  overtimeNote: z.string().optional().nullable(),
  freeFacilities: z.string().optional().nullable(),
});

async function generateUniqueServiceSku(businessUnitId: string): Promise<string> {
  const unit = await prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { code: true } });
  const shortCode = (unit?.code || 'PMO').replace(/^BU-/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefix = `LYN-${shortCode}-`;
  const existing = await prisma.productService.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
  });
  let maxSeq = 0;
  for (const row of existing) {
    const suffix = row.sku.slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  let candidate = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  // Safety loop against concurrent race
  let tries = 0;
  while ((await prisma.productService.findUnique({ where: { sku: candidate }, select: { id: true } })) && tries < 20) {
    maxSeq++;
    candidate = `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
    tries++;
  }
  return candidate;
}

revenueRouter.post('/products', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = createProductSchema.parse(req.body);
    const cleanName = parsed.name.trim().replace(/\s+/g, ' ');
    const cleanCatInput = parsed.category.trim().replace(/\s+/g, ' ');

    // Prevent duplicate service name in the same Business Unit (case-insensitive)
    const duplicateName = await prisma.productService.findFirst({
      where: {
        businessUnitId: parsed.businessUnitId,
        name: { equals: cleanName, mode: 'insensitive' },
      },
      select: { id: true, sku: true, name: true },
    });
    if (duplicateName) {
      throw new AppError(
        409,
        'DUPLICATE_SERVICE_NAME',
        `Layanan "${duplicateName.name}" (${duplicateName.sku}) sudah terdaftar pada unit bisnis ini.`
      );
    }

    // Reuse existing canonical category casing in the same unit to avoid near-duplicate categories
    const existingUnitCats = await prisma.productService.findMany({
      where: { businessUnitId: parsed.businessUnitId },
      select: { category: true },
      distinct: ['category'],
    });
    const matchedCat = existingUnitCats.find(
      (c) => c.category.trim().toLowerCase() === cleanCatInput.toLowerCase()
    );
    const finalCategory = matchedCat ? matchedCat.category : cleanCatInput;

    const finalSku =
      parsed.sku && parsed.sku.trim().length >= 3
        ? parsed.sku.toUpperCase().trim()
        : await generateUniqueServiceSku(parsed.businessUnitId);

    const created = await prisma.productService.create({
      data: {
        sku: finalSku,
        name: cleanName,
        category: finalCategory,
        location: parsed.location?.trim() || null,
        businessUnitId: parsed.businessUnitId,
        unitPrice: fromCents(toCents(parsed.unitPrice)),
        unit: parsed.unit.trim() || 'Paket',
        taxCode: parsed.taxScheme === 'BEBAS_PAJAK' ? 'NON-PPN' : parsed.taxScheme === 'PB1_10' ? 'PB1-10' : parsed.taxCode,
        taxScheme: parsed.taxScheme,
        taxInclusive: parsed.taxInclusive,
        revenueAccountCode: parsed.revenueAccountCode,
        overtimeNote: parsed.overtimeNote?.trim() || null,
        freeFacilities: parsed.freeFacilities?.trim() || null,
      },
      include: { businessUnit: true },
    });

    res.status(201).json({
      success: true,
      data: { ...created, unitPrice: Number(created.unitPrice) },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Update product price while preserving historical transactions and price history
const updatePriceSchema = z.object({
  newPrice: z.number().positive('Harga baru harus lebih besar dari 0.'),
  reason: z.string().min(4, 'Alasan perubahan harga wajib diisi.'),
});

revenueRouter.patch('/products/:id/price', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = updatePriceSchema.parse(req.body);
    const product = await prisma.productService.findUnique({ where: { id: req.params.id } });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produk/layanan tidak ditemukan.');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.productPriceHistory.create({
        data: {
          productServiceId: product.id,
          oldPrice: product.unitPrice,
          newPrice: fromCents(toCents(parsed.newPrice)),
          changedById: req.user!.userId,
          changedByName: req.user!.fullName,
          reason: parsed.reason.trim(),
        },
      });

      const p = await tx.productService.update({
        where: { id: product.id },
        data: { unitPrice: fromCents(toCents(parsed.newPrice)) },
        include: { businessUnit: true, priceHistories: { orderBy: { changedAt: 'desc' } } },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PRODUCT_PRICE_CHANGED',
          module: 'REVENUE',
          entityType: 'ProductService',
          entityId: p.id,
          entityCode: p.sku,
          summary: `Mengubah harga ${p.sku} dari Rp ${Number(product.unitPrice).toLocaleString('id-ID')} menjadi Rp ${Number(p.unitPrice).toLocaleString('id-ID')}. Transaksi lama tetap menggunakan harga historis.`,
          beforeData: { unitPrice: product.unitPrice },
          afterData: { unitPrice: p.unitPrice, reason: parsed.reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return p;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 2. SALES ORDERS, SERVICE DELIVERY & CUSTOMER INVOICES
revenueRouter.get('/sales-orders', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const orders = await prisma.salesOrder.findMany({
      include: {
        customer: true,
        businessUnit: true,
        lines: { include: { productService: true } },
        customerInvoices: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: orders.map((o) => ({
        ...o,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount),
        taxAmount: Number(o.taxAmount),
        totalAmount: Number(o.totalAmount),
        lines: o.lines.map((l) => ({
          ...l,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          discountAmount: Number(l.discountAmount),
          taxAmount: Number(l.taxAmount),
          lineTotal: Number(l.lineTotal),
        })),
      })),
      meta: { total: orders.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createSalesOrderSchema = z.object({
  customerId: z.string().min(1),
  businessUnitId: z.string().min(1),
  terms: z.string().default('NET 14'),
  dueInDays: z.number().int().positive().default(14),
  serviceChargePercent: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
  issueInvoiceImmediately: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        productServiceId: z.string().min(1),
        quantity: z.number().positive(),
        discountAmount: z.number().nonnegative().default(0),
        taxRatePercent: z.number().min(0).max(100).default(11),
      })
    )
    .min(1),
});

revenueRouter.post('/sales-orders', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = createSalesOrderSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const productIds = parsed.lines.map((l) => l.productServiceId);
    const products = await prisma.productService.findMany({
      where: { id: { in: productIds } },
    });

    const computedLines = parsed.lines.map((l) => {
      const prod = products.find((p) => p.id === l.productServiceId);
      if (!prod) throw new AppError(404, 'PRODUCT_NOT_FOUND', `Produk ${l.productServiceId} tidak ditemukan.`);
      const grossLine = mulMoney(prod.unitPrice, l.quantity);
      const discount = fromCents(toCents(l.discountAmount));
      const taxable = subMoney(grossLine, discount);
      const tax = calcPercentage(taxable, l.taxRatePercent);
      const lineTotal = addMoney(taxable, tax);

      return {
        productServiceId: prod.id,
        description: prod.name,
        quantity: fromCents(toCents(l.quantity)),
        unitPrice: fromCents(toCents(prod.unitPrice)), // Locked snapshot price!
        discountAmount: discount,
        taxAmount: tax,
        lineTotal,
        taxable,
      };
    });

    const subtotal = addMoney(...computedLines.map((l) => mulMoney(l.unitPrice, l.quantity)));
    const discountAmount = addMoney(...computedLines.map((l) => l.discountAmount));
    const serviceChargePercent = parsed.serviceChargePercent || 0;
    const baseForServiceCharge = subMoney(subtotal, discountAmount);
    const serviceChargeAmount =
      serviceChargePercent > 0 ? calcPercentage(baseForServiceCharge, serviceChargePercent) : '0.00';
    const taxAmount = addMoney(...computedLines.map((l) => l.taxAmount));
    const totalAmount = addMoney(
      addMoney(...computedLines.map((l) => l.lineTotal)),
      serviceChargeAmount
    );
    const dueDate = new Date(Date.now() + parsed.dueInDays * 86400000);

    const result = await prisma.$transaction(async (tx) => {
      const soRows = await tx.salesOrder.findMany({ select: { docNumber: true } });
      let maxSo = soRows.length;
      for (const r of soRows) {
        const m = String(r.docNumber || '').match(/(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxSo) maxSo = n;
        }
      }
      let soSeq = maxSo + 1;
      let soDocNumber = `SO-2026-${String(soSeq).padStart(4, '0')}`;
      while (await tx.salesOrder.findUnique({ where: { docNumber: soDocNumber }, select: { id: true } })) {
        soSeq++;
        soDocNumber = `SO-2026-${String(soSeq).padStart(4, '0')}`;
      }

      const order = await tx.salesOrder.create({
        data: {
          docNumber: soDocNumber,
          customerId: parsed.customerId,
          businessUnitId: parsed.businessUnitId,
          dueDate,
          terms: parsed.terms,
          subtotal,
          discountAmount,
          serviceChargePercent,
          serviceChargeAmount,
          taxAmount,
          totalAmount,
          status: parsed.issueInvoiceImmediately ? 'INVOICED' : 'CONFIRMED',
          deliveryStatus: 'PENDING',
          notes: parsed.notes?.trim() ?? null,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: {
            create: computedLines.map((l) => ({
              productServiceId: l.productServiceId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { customer: true, businessUnit: true, lines: true },
      });

      let invoice = null;
      if (parsed.issueInvoiceImmediately) {
        const invRows = await tx.customerInvoice.findMany({ select: { docNumber: true } });
        let maxInv = invRows.length;
        for (const r of invRows) {
          const m = String(r.docNumber || '').match(/(?:INV-2026-|No\.)(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!Number.isNaN(n) && n > maxInv) maxInv = n;
          }
        }
        let invSeq = maxInv + 1;
        let invDocNumber = `INV-2026-${String(invSeq).padStart(4, '0')}`;
        while (await tx.customerInvoice.findUnique({ where: { docNumber: invDocNumber }, select: { id: true } })) {
          invSeq++;
          invDocNumber = `INV-2026-${String(invSeq).padStart(4, '0')}`;
        }
        invoice = await tx.customerInvoice.create({
          data: {
            docNumber: invDocNumber,
            salesOrderId: order.id,
            customerId: order.customerId,
            businessUnitId: order.businessUnitId,
            dueDate,
            subtotal,
            discountAmount,
            serviceChargePercent,
            serviceChargeAmount,
            taxAmount,
            totalAmount,
            paidAmount: '0.00',
            balanceDue: totalAmount,
            status: 'ISSUED',
            serviceDelivered: false,
            notes: parsed.notes?.trim() ?? null,
            createdById: req.user!.userId,
            createdByName: req.user!.fullName,
            lines: {
              create: computedLines.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountAmount: l.discountAmount,
                taxAmount: l.taxAmount,
                lineTotal: l.lineTotal,
              })),
            },
          },
          include: { customer: true, businessUnit: true, lines: true },
        });

        // Auto-post AR & Revenue Recognition Journal (Pertor 310)
        const accs = await resolveRevenueAccounts(tx, order.businessUnit?.code);
        const netRevenue = subMoney(subtotal, discountAmount);
        const journalLines = [
          {
            accountCode: accs.arAccount, // 110301010100 Piutang Usaha Pihak Ketiga
            description: `Tagihan pelanggan ${invoice.docNumber} (${order.customer.name})`,
            debit: totalAmount,
            credit: '0.00',
          },
          {
            accountCode: accs.revenueAccount, // 4203xxxxxx Pendapatan Usaha Unit Bisnis
            description: `Pendapatan pesanan ${order.docNumber} (${order.businessUnit?.name || 'PMO UTama'})`,
            debit: '0.00',
            credit: netRevenue,
          },
        ];
        if (toCents(serviceChargeAmount) > 0n) {
          journalLines.push({
            accountCode: accs.serviceChargeAccount, // 420301070300 Pendapatan Fasilitas & Layanan Tambahan
            description: `Service Charge MICE atas ${invoice.docNumber}`,
            debit: '0.00',
            credit: serviceChargeAmount,
          });
        }
        if (toCents(taxAmount) > 0n) {
          journalLines.push({
            accountCode: accs.ppnAccount, // 210202010100 Utang Pajak Pertambahan Nilai (PPN Keluaran)
            description: `PPN Keluaran atas ${invoice.docNumber}`,
            debit: '0.00',
            credit: taxAmount,
          });
        }

        await createOrGetBalancedJournal(
          {
            entryDate: new Date(),
            businessUnitId: order.businessUnitId,
            sourceType: 'CUSTOMER_INVOICE',
            sourceId: invoice.id,
            sourceDocNumber: invoice.docNumber,
            idempotencyKey: `INVOICE_ISSUE_${invoice.id}`,
            description: `Penerbitan Invoice Pelanggan ${invoice.docNumber} (${order.customer.name})`,
            createdById: req.user!.userId,
            createdByName: req.user!.fullName,
            lines: journalLines,
          },
          tx
        );
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'SALES_ORDER_CREATED',
          module: 'REVENUE',
          entityType: 'SalesOrder',
          entityId: order.id,
          entityCode: order.docNumber,
          summary: `Membuat pesanan pelanggan ${order.docNumber}${invoice ? ` dan menerbitkan invoice ${invoice.docNumber}` : ''} senilai Rp ${Number(totalAmount).toLocaleString('id-ID')}`,
          afterData: { orderDocNumber: order.docNumber, invoiceDocNumber: invoice?.docNumber, totalAmount },
          requestId: req.requestId,
        },
        tx as any
      );

      return { order, invoice };
    });

    res.status(201).json({ success: true, data: result, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Mark service delivery as completed WITHOUT automatically marking the invoice as paid!
revenueRouter.post('/sales-orders/:id/deliver', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const order = await prisma.salesOrder.findUnique({ where: { id: req.params.id } });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan pelanggan tidak ditemukan.');

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          deliveryStatus: 'DELIVERED',
          deliveredAt: new Date(),
          deliveredBy: req.user!.fullName,
          deliveryNotes: req.body?.deliveryNotes || 'Layanan/produk telah diserahkan dan diterima pelanggan.',
        },
      });

      await tx.customerInvoice.updateMany({
        where: { salesOrderId: order.id },
        data: { serviceDelivered: true },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'SERVICE_DELIVERED',
          module: 'REVENUE',
          entityType: 'SalesOrder',
          entityId: o.id,
          entityCode: o.docNumber,
          summary: `Mencatat penyerahan layanan selesai untuk ${o.docNumber} (Status pembayaran tagihan tetap independen)`,
          requestId: req.requestId,
        },
        tx as any
      );

      return o;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

revenueRouter.get('/customer-invoices', requirePermission('revenue:view'), async (req, res, next) => {
  try {
    const { status, businessUnitId, search } = req.query;
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
        { customer: { name: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const invoices = await prisma.customerInvoice.findMany({
      where,
      include: {
        customer: true,
        businessUnit: true,
        salesOrder: true,
        lines: true,
        payments: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const invoiceProofMap = await getInvoiceProofMap(invoices.map((i) => i.id));

    res.json({
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        invoiceProof: invoiceProofMap.get(inv.id) || null,
        subtotal: Number(inv.subtotal),
        discountPercent: Number(inv.discountPercent),
        discountAmount: Number(inv.discountAmount),
        serviceChargePercent: Number(inv.serviceChargePercent),
        serviceChargeAmount: Number(inv.serviceChargeAmount),
        nilaiJual: Number(inv.nilaiJual),
        dppPb1: Number(inv.dppPb1),
        dppPpn: Number(inv.dppPpn),
        dppPph: Number(inv.dppPph),
        ppnAmount: Number(inv.ppnAmount),
        pph42Amount: Number(inv.pph42Amount),
        pph23Amount: Number(inv.pph23Amount),
        pph23Rate15Amount: Number(inv.pph23Rate15Amount || 0),
        pph21Amount: Number(inv.pph21Amount || 0),
        pb1Amount: Number(inv.pb1Amount),
        dpPercent: Number(inv.dpPercent || 0),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        netReceivableAmount: Number(inv.netReceivableAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(inv.balanceDue),
        lines: inv.lines.map((l) => ({
          ...l,
          quantity: Number(l.quantity),
          duration: Number(l.duration || 1),
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        })),
        payments: inv.payments.map((p) => ({
          ...p,
          grossAmount: Number(p.grossAmount),
          feeAmount: Number(p.feeAmount),
          netAmount: Number(p.netAmount),
          overpaymentAmount: Number(p.overpaymentAmount),
        })),
      })),
      meta: { total: invoices.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 3. PAYMENTS & REFUNDS (With Idempotency & Merchant Fee Accounting)
revenueRouter.get('/payments', requirePermission('payment:view'), async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        customerInvoice: { include: { customer: true, businessUnit: true } },
        cashierSession: true,
        bankAccount: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: payments.map((p) => ({
        ...p,
        grossAmount: Number(p.grossAmount),
        feeAmount: Number(p.feeAmount),
        netAmount: Number(p.netAmount),
      })),
      meta: { total: payments.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createPaymentSchema = z.object({
  customerInvoiceId: z.string().min(1),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'QRIS_SIMULATED', 'VIRTUAL_ACCOUNT_SIMULATED', 'EDC_CARD']),
  grossAmount: z.number().positive('Nominal pembayaran harus lebih dari 0.'),
  feeAmount: z.number().nonnegative().default(0),
  referenceNo: z.string().min(3),
  idempotencyKey: z.string().min(4),
  cashierSessionId: z.string().optional(),
  bankAccountId: z.string().optional(),
  allowOverpayment: z.boolean().default(false),
  receiptType: z.enum(['KUITANSI', 'KUITANSI_UM', 'TANDA_TERIMA']).optional(),
  withholdingSlipNo: z.string().optional(),
  paymentDate: z.string().optional(),
  depositDate: z.string().optional(),
  taxAlreadyProcessed: z.boolean().default(false),
  refundBankName: z.string().optional(),
  refundAccountNumber: z.string().optional(),
  refundAccountHolder: z.string().optional(),
  proofImageDataUrl: z.string().optional().nullable(),
  proofFileName: z.string().optional().nullable(),
  notes: z.string().optional(),
});

revenueRouter.post('/payments', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const parsed = createPaymentSchema.parse(req.body);

    // Idempotency protection: if client retries with same idempotencyKey, return existing payment
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey: parsed.idempotencyKey.trim() },
      include: { customerInvoice: { include: { customer: true } } },
    });
    if (existing) {
      res.status(200).json({
        success: true,
        data: {
          payment: {
            ...existing,
            grossAmount: Number(existing.grossAmount),
            feeAmount: Number(existing.feeAmount),
            netAmount: Number(existing.netAmount),
            overpaymentAmount: Number(existing.overpaymentAmount),
          },
          idempotentReplay: true,
        },
        meta: { requestId: req.requestId },
      });
      return;
    }

    const invoice = await prisma.customerInvoice.findUnique({
      where: { id: parsed.customerInvoiceId },
      include: { customer: true, businessUnit: true, lines: true },
    });
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice pelanggan tidak ditemukan.');
    if (invoice.approvalStatus !== 'APPROVED') {
      throw new AppError(409, 'INVOICE_NOT_APPROVED', `Invoice ${invoice.docNumber} belum disetujui Manajer Keuangan. Setujui Invoice terlebih dahulu sebelum mencatat pembayaran.`);
    }
    if (invoice.status === 'PAID') {
      throw new AppError(409, 'INVOICE_ALREADY_PAID', `Invoice ${invoice.docNumber} sudah lunas.`);
    }
    if (invoice.status === 'VOID') {
      throw new AppError(409, 'INVOICE_VOIDED', `Invoice ${invoice.docNumber} berstatus HANGUS dan tidak dapat dibayar.`);
    }

    const gross = fromCents(toCents(parsed.grossAmount));
    const fee = fromCents(toCents(parsed.feeAmount));
    const net = subMoney(gross, fee);

    let appliedToInvoice = gross;
    let overpayment = '0.00';

    if (toCents(gross) > toCents(invoice.balanceDue)) {
      if (!parsed.allowOverpayment) {
        throw new AppError(
          409,
          'PAYMENT_EXCEEDS_BALANCE',
          `Nominal pembayaran (Rp ${Number(gross).toLocaleString('id-ID')}) melebihi sisa tagihan invoice (Rp ${Number(invoice.balanceDue).toLocaleString('id-ID')}).`
        );
      }
      appliedToInvoice = fromCents(toCents(invoice.balanceDue));
      overpayment = subMoney(gross, appliedToInvoice);
    }

    const payDate = parsed.paymentDate ? new Date(parsed.paymentDate) : new Date();
    const depDate = parsed.depositDate ? new Date(parsed.depositDate) : payDate;

    const result = await prisma.$transaction(async (tx) => {
      let targetSessionId = parsed.cashierSessionId || null;
      if (parsed.method === 'CASH' && !targetSessionId) {
        const session = await tx.cashierSession.findFirst({
          where: { status: 'OPEN', businessUnitId: invoice.businessUnitId },
          orderBy: { openedAt: 'desc' },
        });
        if (session) targetSessionId = session.id;
      }

      const accs = await resolveRevenueAccounts(tx, invoice.businessUnit?.code);
      const payRows = await tx.payment.findMany({ select: { receiptNumber: true } });
      let maxPaySeq = payRows.length;
      for (const r of payRows) {
        const s = String(r.receiptNumber || '');
        const m = s.match(/^No\.(\d+)\//i) || s.match(/^[A-Z]+-\d{4}-(\d+)$/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxPaySeq) maxPaySeq = n;
        }
      }
      const mm = String(payDate.getMonth() + 1).padStart(2, '0');
      const yyyy = payDate.getFullYear();
      const resolvedReceiptType =
        parsed.receiptType ||
        (invoice.invoiceType === 'UANG_MUKA'
          ? 'KUITANSI_UM'
          : invoice.taxCollectorProfile === 'INTERNAL_UT'
            ? 'TANDA_TERIMA'
            : 'KUITANSI');
      const prefix =
        resolvedReceiptType === 'KUITANSI_UM'
          ? 'KU-UM'
          : resolvedReceiptType === 'TANDA_TERIMA'
            ? 'TT'
            : 'KU';
      let pSeq = maxPaySeq + 1;
      let receiptNumber = `No.${String(pSeq).padStart(3, '0')}/${prefix}/PMO/${mm}-${yyyy}`;
      while (await tx.payment.findUnique({ where: { receiptNumber }, select: { id: true } })) {
        pSeq++;
        receiptNumber = `No.${String(pSeq).padStart(3, '0')}/${prefix}/PMO/${mm}-${yyyy}`;
      }

      // Proportional tax breakdown snapshot for Buku Harian & Perincian Pajak
      const invTotalNum = Number(invoice.totalAmount) || 1;
      const ratio = Math.min(1, Number(appliedToInvoice) / invTotalNum);
      const hasInvTaxSnap = Number(invoice.nilaiJual) > 0 || Number(invoice.dppPb1) > 0 || Number(invoice.ppnAmount) > 0;
      const fallbackTax = computePtnbhRevenueTax({
        amountAfterDiscount: Number(appliedToInvoice),
        taxScheme: invoice.taxScheme,
        taxInclusive: invoice.taxInclusive,
        taxCollectorProfile: invoice.taxCollectorProfile,
        taxAlreadyProcessed: parsed.taxAlreadyProcessed,
      });

      // Held in PENDING_APPROVAL until Manager Finance clicks Setujui -> GL journal & invoice settlement happen atomically on approval
      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          receiptType: resolvedReceiptType,
          paymentStage: invoice.invoiceType === 'UANG_MUKA' ? 'UANG_MUKA' : invoice.invoiceType === 'TERMIN' ? 'TERMIN' : 'PELUNASAN',
          customerInvoiceId: invoice.id,
          businessUnitId: invoice.businessUnitId,
          customerId: invoice.customerId,
          cashierSessionId: targetSessionId,
          bankAccountId: parsed.bankAccountId || invoice.bankAccountId || null,
          paymentDate: payDate,
          depositDate: depDate,
          method: parsed.method,
          payerName: invoice.customer.name,
          payerTaxId: invoice.customer.taxIdNpwp || null,
          payerAddress: invoice.customer.address || null,
          picName: invoice.picName || null,
          subCategory: invoice.subCategory || (invoice.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum'),
          activityTitle: invoice.activityTitle || invoice.lines?.[0]?.description || invoice.notes || `Pelunasan ${invoice.docNumber}`,
          activityDate: invoice.activityDate || null,
          rincianLabel: invoice.rincianLabel || invoice.lines?.[0]?.description || 'Tagihan Layanan',
          revenueAccountCode: invoice.revenueAccountCode || accs.revenueAccount,
          taxScheme: invoice.taxScheme,
          taxInclusive: invoice.taxInclusive,
          taxCollectorProfile: invoice.taxCollectorProfile,
          brutoDocumentAmount: fromCents(toCents(hasInvTaxSnap ? Math.round((Number(invoice.nilaiJual) + Number(invoice.ppnAmount) + Number(invoice.pb1Amount)) * ratio) : fallbackTax.brutoDocumentAmount)),
          nilaiJual: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.nilaiJual) * ratio) : fallbackTax.nilaiJual)),
          dppPb1: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.dppPb1) * ratio) : fallbackTax.dppPb1)),
          dppPpn: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.dppPpn) * ratio) : fallbackTax.dppPpn)),
          dppPph: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.dppPph) * ratio) : fallbackTax.dppPph)),
          ppnAmount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.ppnAmount) * ratio) : fallbackTax.ppnAmount)),
          pph42Amount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.pph42Amount) * ratio) : fallbackTax.pph42Amount)),
          pph23Amount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.pph23Amount) * ratio) : fallbackTax.pph23Amount)),
          pph23Rate15Amount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.pph23Rate15Amount || 0) * ratio) : fallbackTax.pph23Rate15Amount)),
          pph21Amount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.pph21Amount || 0) * ratio) : fallbackTax.pph21Amount)),
          pb1Amount: fromCents(toCents(hasInvTaxSnap ? Math.round(Number(invoice.pb1Amount) * ratio) : fallbackTax.pb1Amount)),
          grossAmount: gross,
          feeAmount: fee,
          netAmount: net,
          overpaymentAmount: overpayment,
          refundBankName: parsed.refundBankName?.trim() || null,
          refundAccountNumber: parsed.refundAccountNumber?.trim() || null,
          refundAccountHolder: parsed.refundAccountHolder?.trim() || null,
          withholdingSlipNo: parsed.withholdingSlipNo?.trim() || null,
          taxAlreadyProcessed: parsed.taxAlreadyProcessed,
          referenceNo: parsed.referenceNo.trim(),
          idempotencyKey: parsed.idempotencyKey.trim(),
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING_APPROVAL',
          journalEntryId: null,
          receivedById: req.user!.userId,
          receivedByName: req.user!.fullName,
          notes: parsed.notes?.trim() ?? null,
        },
        include: { customerInvoice: { include: { customer: true } } },
      });

      const docLabel = resolvedReceiptType === 'TANDA_TERIMA' ? 'Tanda Terima' : resolvedReceiptType === 'KUITANSI_UM' ? 'Kwitansi Uang Muka' : 'Kwitansi';
      await tx.notification.create({
        data: {
          userId: null,
          roleCode: 'FINANCE_MANAGER',
          title: `Approval ${docLabel} Pembayaran: ${payment.receiptNumber}`,
          message: `${req.user!.fullName} mengajukan ${docLabel} ${payment.receiptNumber} untuk pelunasan Invoice ${invoice.docNumber} (${invoice.customer.name}) sebesar Rp ${Number(gross).toLocaleString('id-ID')}. Menunggu persetujuan sebelum dicetak & diposting.`,
          category: 'APPROVAL_PENERIMAAN',
          severity: 'INFO',
          targetUrl: '/revenue?tab=buku_harian&status=PENDING_APPROVAL',
          entityType: 'Payment',
          entityId: payment.id,
          isRead: false,
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_SUBMITTED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Mengajukan ${docLabel} ${payment.receiptNumber} untuk invoice ${invoice.docNumber} (Masuk: Rp ${Number(gross).toLocaleString('id-ID')}) menunggu persetujuan Manajer Keuangan`,
          afterData: { receiptNumber: payment.receiptNumber, gross, fee, net, overpayment, approvalStatus: 'PENDING_APPROVAL' },
          requestId: req.requestId,
        },
        tx as any
      );

      return payment;
    });

    let paymentProof: any = null;
    if (parsed.proofImageDataUrl && parsed.proofImageDataUrl.trim()) {
      paymentProof = await savePaymentProofFromDataUrl({
        paymentId: result.id,
        receiptNumber: result.receiptNumber,
        dataUrl: parsed.proofImageDataUrl,
        fileName: parsed.proofFileName || undefined,
        uploadedById: req.user!.userId,
        uploadedByName: req.user!.fullName,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        payment: {
          ...result,
          grossAmount: Number(result.grossAmount),
          feeAmount: Number(result.feeAmount),
          netAmount: Number(result.netAmount),
          overpaymentAmount: Number(result.overpaymentAmount),
          paymentProof,
        },
        idempotentReplay: false,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Controlled Refund referencing original Payment
const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(5, 'Alasan refund wajib diisi minimal 5 karakter.'),
});

revenueRouter.post('/payments/:id/refund', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const parsed = refundSchema.parse(req.body);
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { customerInvoice: { include: { businessUnit: true } } },
    });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pembayaran asal tidak ditemukan.');
    if (payment.status !== 'CONFIRMED' || payment.approvalStatus !== 'APPROVED') {
      throw new AppError(409, 'INVALID_PAYMENT_STATE', `Pembayaran berstatus ${payment.status} (${payment.approvalStatus}) tidak dapat di-refund.`);
    }

    const refundAmount = fromCents(toCents(parsed.amount));
    if (toCents(refundAmount) > toCents(payment.grossAmount)) {
      throw new AppError(409, 'REFUND_EXCEEDS_PAYMENT', 'Nominal refund tidak boleh melebihi nominal pembayaran asal.');
    }

    if (!payment.customerInvoice || !payment.customerInvoiceId) {
      throw new AppError(400, 'DIRECT_RECEIPT_NO_INVOICE', 'Penerimaan langsung tanpa invoice tidak mendukung refund faktur; gunakan jurnal pembalik.');
    }

    const invoiceRef = payment.customerInvoice;
    const invoiceIdRef = payment.customerInvoiceId;

    const result = await prisma.$transaction(async (tx) => {
      const rRows = await tx.refund.findMany({ select: { refundNumber: true } });
      let maxRfd = rRows.length;
      for (const r of rRows) {
        const m = String(r.refundNumber || '').match(/(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxRfd) maxRfd = n;
        }
      }
      let rfdSeq = maxRfd + 1;
      let refundNumber = `RFD-2026-${String(rfdSeq).padStart(4, '0')}`;
      while (await tx.refund.findUnique({ where: { refundNumber }, select: { id: true } })) {
        rfdSeq++;
        refundNumber = `RFD-2026-${String(rfdSeq).padStart(4, '0')}`;
      }

      const refund = await tx.refund.create({
        data: {
          refundNumber,
          paymentId: payment.id,
          customerInvoiceId: invoiceIdRef,
          amount: refundAmount,
          reason: parsed.reason.trim(),
          status: 'PROCESSED',
          requestedById: req.user!.userId,
          requestedByName: req.user!.fullName,
          approvedById: req.user!.userId,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });

      const newPaidCents = toCents(invoiceRef.paidAmount) - toCents(refundAmount);
      const safePaidCents = newPaidCents > 0n ? newPaidCents : 0n;
      const newPaid = fromCents(safePaidCents);
      const newBalance = subMoney(invoiceRef.totalAmount, newPaid);
      const newBalanceCents = toCents(newBalance);
      const nextInvoiceStatus =
        safePaidCents > 0n && newBalanceCents > 0n
          ? 'PARTIALLY_PAID'
          : safePaidCents === 0n && newBalanceCents > 0n
            ? invoiceRef.status === 'PAID'
              ? 'REFUNDED'
              : 'ISSUED'
            : 'REFUNDED';

      await tx.customerInvoice.update({
        where: { id: invoiceIdRef },
        data: {
          paidAmount: newPaid,
          balanceDue: newBalance,
          status: nextInvoiceStatus,
        },
      });

      if (invoiceRef.salesOrderId) {
        await tx.salesOrder.update({
          where: { id: invoiceRef.salesOrderId },
          data: { status: nextInvoiceStatus },
        });
      }

      const accs = await resolveRevenueAccounts(tx, invoiceRef.businessUnit?.code);

      await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: invoiceRef.businessUnitId,
          sourceType: 'REFUND',
          sourceId: refund.id,
          sourceDocNumber: refund.refundNumber,
          idempotencyKey: `REFUND_JRN_${refund.id}`,
          description: `Pengembalian Dana (Refund) ${refund.refundNumber} atas Kuitansi ${payment.receiptNumber}`,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: [
            {
              accountCode: accs.revenueAccount, // 4203xxxxxx
              description: `Koreksi pendapatan atas refund ${refund.refundNumber}`,
              debit: refundAmount,
              credit: '0.00',
            },
            {
              accountCode: accs.bankAccount, // 110101020200
              description: `Pengeluaran kas/bank untuk refund ${refund.refundNumber}`,
              debit: '0.00',
              credit: refundAmount,
            },
          ],
        },
        tx
      );

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_REFUNDED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Memproses refund ${refund.refundNumber} sebesar Rp ${Number(refundAmount).toLocaleString('id-ID')} atas pembayaran ${payment.receiptNumber}. Alasan: ${parsed.reason}`,
          afterData: refund,
          requestId: req.requestId,
        },
        tx as any
      );

      return refund;
    });

    res.status(201).json({ success: true, data: result, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// 4. CASHIER SESSIONS, CLOSEOUT & BANK DEPOSITS
revenueRouter.get('/cashier/sessions', requirePermission('cashier:view'), async (req, res, next) => {
  try {
    const [registers, sessions, deposits] = await Promise.all([
      prisma.cashRegister.findMany({ include: { businessUnit: true }, orderBy: { code: 'asc' } }),
      prisma.cashierSession.findMany({
        include: {
          cashRegister: true,
          businessUnit: true,
          payments: { include: { customerInvoice: { include: { customer: true } } } },
          deposits: { include: { bankAccount: true } },
        },
        orderBy: { openedAt: 'desc' },
      }),
      prisma.cashDeposit.findMany({
        include: { cashierSession: true, bankAccount: true },
        orderBy: { depositDate: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        registers,
        sessions: sessions.map((s) => ({
          ...s,
          openingFloat: Number(s.openingFloat),
          totalCashIn: Number(s.totalCashIn),
          totalCashOut: Number(s.totalCashOut),
          theoreticalBalance: Number(s.theoreticalBalance),
          actualCountedCash: s.actualCountedCash !== null ? Number(s.actualCountedCash) : null,
          discrepancyAmount: s.discrepancyAmount !== null ? Number(s.discrepancyAmount) : null,
        })),
        deposits: deposits.map((d) => ({ ...d, amount: Number(d.amount) })),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const openSessionSchema = z.object({
  cashRegisterId: z.string().min(1),
  openingFloat: z.number().nonnegative(),
});

revenueRouter.post('/cashier/sessions/open', requirePermission('cashier:operate'), async (req, res, next) => {
  try {
    const parsed = openSessionSchema.parse(req.body);
    const register = await prisma.cashRegister.findUnique({ where: { id: parsed.cashRegisterId } });
    if (!register) throw new AppError(404, 'REGISTER_NOT_FOUND', 'Kasir register tidak ditemukan.');

    const existingOpen = await prisma.cashierSession.findFirst({
      where: { cashRegisterId: register.id, status: 'OPEN' },
    });
    if (existingOpen) {
      throw new AppError(
        409,
        'REGISTER_ALREADY_OPEN',
        `Register ${register.code} masih memiliki sesi aktif (${existingOpen.sessionNumber}). Tutup sesi sebelumnya terlebih dahulu.`
      );
    }

    const count = await prisma.cashierSession.count();
    const sessionNumber = `CSH-2026-${String(count + 1).padStart(4, '0')}`;
    const floatStr = fromCents(toCents(parsed.openingFloat));

    const created = await prisma.cashierSession.create({
      data: {
        sessionNumber,
        cashRegisterId: register.id,
        businessUnitId: register.businessUnitId,
        cashierId: req.user!.userId,
        cashierName: req.user!.fullName,
        openingFloat: floatStr,
        totalCashIn: '0.00',
        totalCashOut: '0.00',
        theoreticalBalance: floatStr,
        status: 'OPEN',
      },
      include: { cashRegister: true, businessUnit: true },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'CASHIER_SESSION_OPENED',
      module: 'CASHIER',
      entityType: 'CashierSession',
      entityId: created.id,
      entityCode: created.sessionNumber,
      summary: `Membuka sesi kasir ${created.sessionNumber} pada ${register.name} dengan modal awal Rp ${Number(floatStr).toLocaleString('id-ID')}`,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const closeSessionSchema = z.object({
  actualCountedCash: z.number().nonnegative('Hasil hitung fisik kas tidak boleh negatif.'),
  discrepancyReason: z.string().optional(),
});

revenueRouter.post('/cashier/sessions/:id/close', requirePermission('cashier:operate'), async (req, res, next) => {
  try {
    const parsed = closeSessionSchema.parse(req.body);
    const session = await prisma.cashierSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesi kasir tidak ditemukan.');

    if (session.status !== 'OPEN') {
      throw new AppError(
        409,
        'SESSION_ALREADY_CLOSED',
        `Sesi kasir ${session.sessionNumber} sudah berstatus ${session.status} dan tidak dapat ditutup dua kali.`
      );
    }

    const actualStr = fromCents(toCents(parsed.actualCountedCash));
    const discrepancyStr = subMoney(actualStr, session.theoreticalBalance);
    const absDiscrepancyCents =
      toCents(discrepancyStr) < 0n ? -toCents(discrepancyStr) : toCents(discrepancyStr);

    // Threshold: Rp 50.000 discrepancy requires reason and supervisor review
    if (absDiscrepancyCents > 0n && (!parsed.discrepancyReason || parsed.discrepancyReason.trim().length < 4)) {
      throw new AppError(
        400,
        'DISCREPANCY_REASON_REQUIRED',
        `Terdapat selisih kas sebesar Rp ${Number(discrepancyStr).toLocaleString('id-ID')}. Alasan selisih wajib diisi.`
      );
    }

    const needsSupervisorReview = absDiscrepancyCents > toCents(50000);
    const nextStatus = needsSupervisorReview ? 'CLOSING_SUBMITTED' : 'CLOSED';

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.cashierSession.update({
        where: { id: session.id },
        data: {
          actualCountedCash: actualStr,
          discrepancyAmount: discrepancyStr,
          discrepancyReason: parsed.discrepancyReason?.trim() ?? null,
          status: nextStatus,
          closedAt: new Date(),
        },
        include: { cashRegister: true, businessUnit: true },
      });

      if (needsSupervisorReview) {
        const aprCount = await tx.approvalRequest.count();
        await tx.approvalRequest.create({
          data: {
            requestNumber: `APR-CSH-${String(aprCount + 1).padStart(4, '0')}`,
            module: 'CASHIER_DISCREPANCY',
            entityId: s.id,
            entityCode: s.sessionNumber,
            title: `Review Selisih Penutupan Kasir ${s.sessionNumber}`,
            businessUnitId: s.businessUnitId,
            amount: fromCents(absDiscrepancyCents),
            status: 'PENDING',
            requestedById: req.user!.userId,
            requestedByName: req.user!.fullName,
            requiredRoleCode: 'FINANCE_MANAGER',
            exceptionReason: parsed.discrepancyReason?.trim() ?? null,
          },
        });
      }

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: needsSupervisorReview ? 'CASHIER_CLOSEOUT_SUBMITTED' : 'CASHIER_SESSION_CLOSED',
          module: 'CASHIER',
          entityType: 'CashierSession',
          entityId: s.id,
          entityCode: s.sessionNumber,
          summary: `Penutupan sesi kasir ${s.sessionNumber}: Saldo teoritis Rp ${Number(s.theoreticalBalance).toLocaleString('id-ID')}, fisik Rp ${Number(actualStr).toLocaleString('id-ID')}, selisih Rp ${Number(discrepancyStr).toLocaleString('id-ID')} (${s.status})`,
          afterData: {
            theoreticalBalance: s.theoreticalBalance,
            actualCountedCash: actualStr,
            discrepancyAmount: discrepancyStr,
            status: s.status,
          },
          requestId: req.requestId,
        },
        tx as any
      );

      return s;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

revenueRouter.post('/cashier/sessions/:id/approve-close', requirePermission('payment:approve'), async (req, res, next) => {
  try {
    const session = await prisma.cashierSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesi kasir tidak ditemukan.');
    if (session.status !== 'CLOSING_SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', 'Sesi kasir ini tidak sedang menunggu persetujuan penutupan.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.cashierSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          reviewedById: req.user!.userId,
          reviewedByName: req.user!.fullName,
          reviewedAt: new Date(),
          reviewNote: req.body?.note || 'Selisih kas telah ditinjau dan berita acara penutupan disahkan.',
        },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'CASHIER_DISCREPANCY', entityId: s.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: req.body?.note || 'Disetujui oleh Finance Manager.',
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'CASHIER_CLOSEOUT_APPROVED',
          module: 'CASHIER',
          entityType: 'CashierSession',
          entityId: s.id,
          entityCode: s.sessionNumber,
          summary: `Mengesahkan berita acara penutupan kasir ${s.sessionNumber} dengan selisih Rp ${Number(s.discrepancyAmount).toLocaleString('id-ID')}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return s;
    });

    res.json({ success: true, data: updated, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const createDepositSchema = z.object({
  cashierSessionId: z.string().min(1),
  bankAccountId: z.string().min(1),
  amount: z.number().positive(),
  referenceNo: z.string().min(3),
  notes: z.string().optional(),
});

revenueRouter.post('/cashier/deposits', requirePermission('cashier:operate'), async (req, res, next) => {
  try {
    const parsed = createDepositSchema.parse(req.body);
    const session = await prisma.cashierSession.findUnique({
      where: { id: parsed.cashierSessionId },
      include: { businessUnit: true },
    });
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Sesi kasir tidak ditemukan.');

    const amountStr = fromCents(toCents(parsed.amount));
    const count = await prisma.cashDeposit.count();
    const depositNumber = `DEP-2026-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.$transaction(async (tx) => {
      const dep = await tx.cashDeposit.create({
        data: {
          depositNumber,
          cashierSessionId: session.id,
          bankAccountId: parsed.bankAccountId,
          amount: amountStr,
          referenceNo: parsed.referenceNo.trim(),
          depositedById: req.user!.userId,
          depositedByName: req.user!.fullName,
          status: 'VERIFIED',
          notes: parsed.notes?.trim() ?? null,
        },
        include: { cashierSession: true, bankAccount: true },
      });

      const accs = await resolveRevenueAccounts(tx, session.businessUnit?.code);
      let targetBankAcc = dep.bankAccount.glAccountCode;
      if (!targetBankAcc || targetBankAcc.includes('-')) {
        targetBankAcc = accs.bankAccount;
      }

      await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: session.businessUnitId,
          sourceType: 'CASH_DEPOSIT',
          sourceId: dep.id,
          sourceDocNumber: dep.depositNumber,
          idempotencyKey: `DEPOSIT_JRN_${dep.id}`,
          description: `Setoran Kas Kasir ${dep.depositNumber} dari Sesi ${session.sessionNumber} ke ${dep.bankAccount.bankName}`,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: [
            {
              accountCode: targetBankAcc,
              description: `Setoran tunai kasir ${dep.depositNumber} ke ${dep.bankAccount.bankName}`,
              debit: amountStr,
              credit: '0.00',
            },
            {
              accountCode: accs.cashAccount,
              description: `Pengurangan kas kasir untuk setoran ${dep.depositNumber}`,
              debit: '0.00',
              credit: amountStr,
            },
          ],
        },
        tx
      );

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'CASH_DEPOSIT_RECORDED',
          module: 'CASHIER',
          entityType: 'CashDeposit',
          entityId: dep.id,
          entityCode: dep.depositNumber,
          summary: `Mencatat setoran kas ${dep.depositNumber} sebesar Rp ${Number(amountStr).toLocaleString('id-ID')} ke ${dep.bankAccount.bankName}`,
          requestId: req.requestId,
        },
        tx as any
      );

      return dep;
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});
