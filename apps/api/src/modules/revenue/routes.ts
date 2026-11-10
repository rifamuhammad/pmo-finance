import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney, mulMoney, calcPercentage } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import { computeWebhookSignature } from '../../shared/security.js';
import { AppError, requireAuth, requirePermission, enforceUnitScope } from '../../middleware/auth.js';

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
  // 1. AR Account (Piutang Usaha Pihak Ketiga)
  let arAccount = '110301010100';
  const checkAr = await tx.chartOfAccount.findUnique({ where: { code: arAccount } });
  if (!checkAr) arAccount = '1-1210';

  // 2. Output Tax Account (Utang Pajak PPN Keluaran)
  let ppnAccount = '210202010100';
  const checkPpn = await tx.chartOfAccount.findUnique({ where: { code: ppnAccount } });
  if (!checkPpn) ppnAccount = '2-1210';

  // 3. Bank Account (Bank BRI Penerimaan Komersial PMO)
  let bankAccount = '110101020200';
  const checkBank = await tx.chartOfAccount.findUnique({ where: { code: bankAccount } });
  if (!checkBank) bankAccount = '1-1120';

  // 4. Cash Account (Kas di Bendahara Penerimaan / Kas Tunai Kasir)
  let cashAccount = '110101010100';
  const checkCash = await tx.chartOfAccount.findUnique({ where: { code: cashAccount } });
  if (!checkCash) cashAccount = '1-1110';

  // 5. Merchant Fee Expense Account (Beban Administrasi Bank & Payment Gateway)
  let feeAccount = '590101010100';
  const checkFee = await tx.chartOfAccount.findUnique({ where: { code: feeAccount } });
  if (!checkFee) feeAccount = '5-1500';

  // 6. Revenue Account based on Business Unit (Pertor 310)
  let revenueAccount = '420301090100'; // Default: Pendapatan Jasa Manajemen / Konsultansi
  if (buCode === 'BU-TCI') revenueAccount = '420301010200'; // Pendapatan Pelatihan (Diklat) Profesional
  else if (buCode === 'BU-ITS') revenueAccount = '420301040200'; // Pendapatan Aplikasi Promise & Software Solution
  else if (buCode === 'BU-KLINIK') revenueAccount = '420301060100'; // Pendapatan Jasa Dokter Umum
  else if (buCode === 'BU-MICE') revenueAccount = '420301070202'; // Pendapatan Sewa Ballroom & Gedung UTCC
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
  organizationType: z.enum(['CORPORATE', 'GOVERNMENT', 'SOE_BUMN', 'INDIVIDUAL']).default('CORPORATE'),
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
    const count = await prisma.customer.count();
    const code = `CUST-${String(count + 1).padStart(4, '0')}`;

    const created = await prisma.customer.create({
      data: {
        code,
        name: parsed.name.trim(),
        organizationType: parsed.organizationType,
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
    const products = await prisma.productService.findMany({
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
  sku: z.string().min(3),
  name: z.string().min(3),
  category: z.string().min(2),
  businessUnitId: z.string().min(1),
  unitPrice: z.number().positive(),
  unit: z.string().default('Paket'),
  taxCode: z.string().default('PPN-11'),
  revenueAccountCode: z.string().default('4-1100'),
});

revenueRouter.post('/products', requirePermission('revenue:create'), async (req, res, next) => {
  try {
    const parsed = createProductSchema.parse(req.body);
    const created = await prisma.productService.create({
      data: {
        sku: parsed.sku.toUpperCase().trim(),
        name: parsed.name.trim(),
        category: parsed.category.trim(),
        businessUnitId: parsed.businessUnitId,
        unitPrice: fromCents(toCents(parsed.unitPrice)),
        unit: parsed.unit.trim(),
        taxCode: parsed.taxCode,
        revenueAccountCode: parsed.revenueAccountCode,
      },
      include: { businessUnit: true },
    });

    res.status(201).json({ success: true, data: created, meta: { requestId: req.requestId } });
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
      const soCount = await tx.salesOrder.count();
      const soDocNumber = `SO-2026-${String(soCount + 1).padStart(4, '0')}`;

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
        const invCount = await tx.customerInvoice.count();
        const invDocNumber = `INV-2026-${String(invCount + 1).padStart(4, '0')}`;
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

    res.json({
      success: true,
      data: invoices.map((inv) => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        discountAmount: Number(inv.discountAmount),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(inv.balanceDue),
        payments: inv.payments.map((p) => ({
          ...p,
          grossAmount: Number(p.grossAmount),
          feeAmount: Number(p.feeAmount),
          netAmount: Number(p.netAmount),
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
          },
          idempotentReplay: true,
        },
        meta: { requestId: req.requestId },
      });
      return;
    }

    const invoice = await prisma.customerInvoice.findUnique({
      where: { id: parsed.customerInvoiceId },
      include: { customer: true, businessUnit: true },
    });
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice pelanggan tidak ditemukan.');
    if (invoice.status === 'PAID') {
      throw new AppError(409, 'INVOICE_ALREADY_PAID', `Invoice ${invoice.docNumber} sudah lunas.`);
    }

    const gross = fromCents(toCents(parsed.grossAmount));
    const fee = fromCents(toCents(parsed.feeAmount));
    const net = subMoney(gross, fee);

    if (toCents(gross) > toCents(invoice.balanceDue)) {
      throw new AppError(
        409,
        'PAYMENT_EXCEEDS_BALANCE',
        `Nominal pembayaran (Rp ${Number(gross).toLocaleString('id-ID')}) melebihi sisa tagihan invoice (Rp ${Number(invoice.balanceDue).toLocaleString('id-ID')}).`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const newPaid = addMoney(invoice.paidAmount, gross);
      const newBalance = subMoney(invoice.totalAmount, newPaid);
      const newInvoiceStatus = toCents(newBalance) === 0n ? 'PAID' : 'PARTIALLY_PAID';

      await tx.customerInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          balanceDue: newBalance,
          status: newInvoiceStatus,
        },
      });

      if (invoice.salesOrderId) {
        await tx.salesOrder.update({
          where: { id: invoice.salesOrderId },
          data: { status: newInvoiceStatus },
        });
      }

      // If CASH, update active cashier session
      let targetSessionId = parsed.cashierSessionId || null;
      if (parsed.method === 'CASH') {
        const session = targetSessionId
          ? await tx.cashierSession.findUnique({ where: { id: targetSessionId } })
          : await tx.cashierSession.findFirst({
              where: { status: 'OPEN', businessUnitId: invoice.businessUnitId },
              orderBy: { openedAt: 'desc' },
            });
        if (session && session.status === 'OPEN') {
          targetSessionId = session.id;
          const nextCashIn = addMoney(session.totalCashIn, net);
          const nextTheoretical = subMoney(addMoney(session.openingFloat, nextCashIn), session.totalCashOut);
          await tx.cashierSession.update({
            where: { id: session.id },
            data: {
              totalCashIn: nextCashIn,
              theoreticalBalance: nextTheoretical,
            },
          });
        }
      }

      // Post balanced journal: Debit Kas/Bank (net) + Debit Beban Fee (if fee > 0) vs Credit Piutang Usaha (gross)
      const accs = await resolveRevenueAccounts(tx, invoice.businessUnit?.code);
      const cashOrBankAccount = parsed.method === 'CASH' ? accs.cashAccount : accs.bankAccount;
      const journalLines = [
        {
          accountCode: cashOrBankAccount, // 110101010100 Kasir Tunai / 110101020200 Bank BRI PMO
          description: `Penerimaan bersih pembayaran ${invoice.docNumber} (${parsed.method})`,
          debit: net,
          credit: '0.00',
        },
        {
          accountCode: accs.arAccount, // 110301010100 Piutang Usaha Pihak Ketiga
          description: `Pelunasan piutang ${invoice.docNumber} (${invoice.customer.name})`,
          debit: '0.00',
          credit: gross,
        },
      ];
      if (toCents(fee) > 0n) {
        journalLines.push({
          accountCode: accs.feeAccount, // 520501010100 Beban Administrasi Bank & Payment Gateway
          description: `Potongan merchant/provider fee atas pembayaran ${invoice.docNumber}`,
          debit: fee,
          credit: '0.00',
        });
      }

      const journal = await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: invoice.businessUnitId,
          sourceType: 'PAYMENT',
          sourceId: invoice.id,
          sourceDocNumber: invoice.docNumber,
          idempotencyKey: `PAYMENT_JRN_${parsed.idempotencyKey.trim()}`,
          description: `Penerimaan Pembayaran Invoice ${invoice.docNumber} dari ${invoice.customer.name}`,
          createdById: req.user!.userId,
          createdByName: req.user!.fullName,
          lines: journalLines,
        },
        tx
      );

      const pCount = await tx.payment.count();
      const receiptNumber = `KWT-2026-${String(pCount + 1).padStart(4, '0')}`;

      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          customerInvoiceId: invoice.id,
          cashierSessionId: targetSessionId,
          bankAccountId: parsed.bankAccountId || null,
          method: parsed.method,
          grossAmount: gross,
          feeAmount: fee,
          netAmount: net,
          referenceNo: parsed.referenceNo.trim(),
          idempotencyKey: parsed.idempotencyKey.trim(),
          status: 'CONFIRMED',
          journalEntryId: journal.id,
          receivedById: req.user!.userId,
          receivedByName: req.user!.fullName,
          notes: parsed.notes?.trim() ?? null,
        },
        include: { customerInvoice: { include: { customer: true } } },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'PAYMENT_CONFIRMED',
          module: 'REVENUE',
          entityType: 'Payment',
          entityId: payment.id,
          entityCode: payment.receiptNumber,
          summary: `Menerima pembayaran ${payment.receiptNumber} untuk invoice ${invoice.docNumber} (Bruto: Rp ${Number(gross).toLocaleString('id-ID')}, Bersih: Rp ${Number(net).toLocaleString('id-ID')})`,
          afterData: { receiptNumber: payment.receiptNumber, gross, fee, net, invoiceStatus: newInvoiceStatus },
          requestId: req.requestId,
        },
        tx as any
      );

      return payment;
    });

    res.status(201).json({
      success: true,
      data: {
        payment: {
          ...result,
          grossAmount: Number(result.grossAmount),
          feeAmount: Number(result.feeAmount),
          netAmount: Number(result.netAmount),
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
    if (payment.status !== 'CONFIRMED') {
      throw new AppError(409, 'INVALID_PAYMENT_STATE', `Pembayaran berstatus ${payment.status} tidak dapat di-refund.`);
    }

    const refundAmount = fromCents(toCents(parsed.amount));
    if (toCents(refundAmount) > toCents(payment.grossAmount)) {
      throw new AppError(409, 'REFUND_EXCEEDS_PAYMENT', 'Nominal refund tidak boleh melebihi nominal pembayaran asal.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const rCount = await tx.refund.count();
      const refundNumber = `RFD-2026-${String(rCount + 1).padStart(4, '0')}`;

      const refund = await tx.refund.create({
        data: {
          refundNumber,
          paymentId: payment.id,
          customerInvoiceId: payment.customerInvoiceId,
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

      const newPaid = subMoney(payment.customerInvoice.paidAmount, refundAmount);
      const newBalance = addMoney(payment.customerInvoice.balanceDue, refundAmount);

      await tx.customerInvoice.update({
        where: { id: payment.customerInvoiceId },
        data: {
          paidAmount: newPaid,
          balanceDue: newBalance,
          status: 'REFUNDED',
        },
      });

      const accs = await resolveRevenueAccounts(tx, payment.customerInvoice?.businessUnit?.code);

      await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: payment.customerInvoice.businessUnitId,
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
