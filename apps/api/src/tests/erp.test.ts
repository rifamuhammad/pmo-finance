import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../shared/prisma.js';
import { computeWebhookSignature } from '../shared/security.js';

describe('ERP Keuangan & Operasional PMO UTama - Comprehensive Integration Suite', () => {
  const runTag = Date.now().toString(36).toUpperCase();
  let gmToken = '';
  let financeToken = '';
  let unitMgrToken = '';
  let procurementToken = '';
  let accountingToken = '';
  let cashierToken = '';
  let auditorToken = '';

  let unitDiklatId = '';
  let unitKonsulId = '';
  let ccDiklatLabId = '';
  let fundInternalId = '';
  let period2026OpenId = '';
  let period2025ClosedId = '';

  async function loginAs(email: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'DemoErp!2026' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    return res.body.data.token;
  }

  beforeAll(async () => {
    gmToken = await loginAs('gm@pmoutama.demo.id');
    financeToken = await loginAs('finance@pmoutama.demo.id');
    unitMgrToken = await loginAs('unit.manager@pmoutama.demo.id');
    procurementToken = await loginAs('procurement@pmoutama.demo.id');
    accountingToken = await loginAs('accounting@pmoutama.demo.id');
    cashierToken = await loginAs('kasir@pmoutama.demo.id');
    auditorToken = await loginAs('auditor@pmoutama.demo.id');

    const masterRes = await request(app)
      .get('/api/v1/master/overview')
      .set('Authorization', `Bearer ${gmToken}`);
    expect(masterRes.status).toBe(200);

    const units = masterRes.body.data.businessUnits;
    unitDiklatId = (units.find((u: any) => u.code === 'BU-TCI') || units.find((u: any) => u.code === 'BU-DIKLAT')).id;
    unitKonsulId = (units.find((u: any) => u.code === 'BU-ITS') || units.find((u: any) => u.code === 'BU-KONSUL')).id;

    const ccs = masterRes.body.data.costCenters;
    ccDiklatLabId = (ccs.find((c: any) => c.code === 'CC-TCI-02') || ccs.find((c: any) => c.code === 'CC-DKL-02')).id;

    const funds = masterRes.body.data.fundSources;
    fundInternalId = funds.find((f: any) => f.code === 'FS-RKAP').id;

    const periods = masterRes.body.data.fiscalPeriods;
    period2026OpenId = periods.find((p: any) => p.code === 'FY-2026').id;
    period2025ClosedId = periods.find((p: any) => p.code === 'FY-2025').id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Authentication, RBAC & Unit Scope Enforcement', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/budgets');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid credentials with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'gm@pmoutama.demo.id', password: 'WrongPassword123' });
      expect(res.status).toBe(401);
    });

    it('forbids Internal Auditor (Read-Only) from creating or mutating budgets', async () => {
      const res = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          title: 'Anggaran Ilegal oleh Auditor',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1200',
              category: 'CAPEX',
              description: 'Baris Uji',
              allocatedAmount: 10000000,
            },
          ],
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUDITOR_READ_ONLY');
    });

    it('prevents Unit Manager of Diklat from creating a budget for Unit Konsultansi', async () => {
      const res = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Anggaran Lintas Unit Tanpa Hak',
          businessUnitId: unitKonsulId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1200',
              category: 'OPEX',
              description: 'Uji Lintas Unit',
              allocatedAmount: 5000000,
            },
          ],
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CROSS_UNIT_FORBIDDEN');
    });

    it('authenticates and retrieves active profile for all 9 demo roles (Smoke Test RBAC)', async () => {
      const demoAccounts = [
        'admin@pmoutama.demo.id',
        'gm@pmoutama.demo.id',
        'finance@pmoutama.demo.id',
        'unit.manager@pmoutama.demo.id',
        'procurement@pmoutama.demo.id',
        'accounting@pmoutama.demo.id',
        'kasir@pmoutama.demo.id',
        'tax@pmoutama.demo.id',
        'auditor@pmoutama.demo.id',
      ];

      for (const email of demoAccounts) {
        const loginRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'DemoErp!2026' });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.data.token).toBeDefined();

        const meRes = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${loginRes.body.data.token}`);
        expect(meRes.status).toBe(200);
        expect(meRes.body.data.user.email).toBe(email);
        expect(meRes.body.data.user.roleCode).toBeDefined();
      }
    });
  });

  describe('2. Budget Planning, Separation of Duties & Revision History', () => {
    let createdBudgetId = '';
    let createdBudgetLineId = '';

    it('creates a DRAFT budget and blocks PR creation against an unapproved budget', async () => {
      const createRes = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Anggaran Uji Otomatis Diklat Q4 [DATA DEMO]',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          revenueTarget: 80000000,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1200',
              category: 'CAPEX',
              description: 'Peralatan Lab Sertifikasi Uji Otomatis',
              allocatedAmount: 50000000,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('DRAFT');
      createdBudgetId = createRes.body.data.id;
      createdBudgetLineId = createRes.body.data.lines[0].id;

      // Attempt PR against DRAFT budget -> must fail
      const prAttempt = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'PR pada Anggaran Draft',
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId: createdBudgetLineId,
          purpose: 'Uji gagal pada anggaran draft',
          lines: [
            {
              itemName: 'Router Lab',
              quantity: 2,
              unit: 'Unit',
              estimatedUnitPrice: 3000000,
            },
          ],
        });
      expect(prAttempt.status).toBe(409);
      expect(prAttempt.body.error.code).toBe('BUDGET_NOT_APPROVED');
    });

    it('enforces Separation of Duties so creator cannot approve their own submitted budget', async () => {
      // GM PMO creates and submits a budget, then tries to approve it themselves
      const gmCreate = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${gmToken}`)
        .send({
          title: 'Anggaran Uji SoD GM [DATA DEMO]',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1100',
              category: 'OPEX',
              description: 'Pos Uji SoD',
              allocatedAmount: 20000000,
            },
          ],
        });
      expect(gmCreate.status).toBe(201);
      const sodBudgetId = gmCreate.body.data.id;

      const subRes = await request(app)
        .post(`/api/v1/budgets/${sodBudgetId}/submit`)
        .set('Authorization', `Bearer ${gmToken}`);
      expect(subRes.status).toBe(200);

      const selfApprove = await request(app)
        .post(`/api/v1/budgets/${sodBudgetId}/approve`)
        .set('Authorization', `Bearer ${gmToken}`)
        .send({ note: 'Coba setujui sendiri' });
      expect(selfApprove.status).toBe(403);
      expect(selfApprove.body.error.code).toBe('SEPARATION_OF_DUTIES_VIOLATION');
    });

    it('submits, approves by GM PMO, and revises budget while preserving version history', async () => {
      const subRes = await request(app)
        .post(`/api/v1/budgets/${createdBudgetId}/submit`)
        .set('Authorization', `Bearer ${unitMgrToken}`);
      expect(subRes.status).toBe(200);
      expect(subRes.body.data.status).toBe('SUBMITTED');

      const appRes = await request(app)
        .post(`/api/v1/budgets/${createdBudgetId}/approve`)
        .set('Authorization', `Bearer ${gmToken}`)
        .send({ note: 'Disetujui oleh GM PMO untuk uji integrasi.' });
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.status).toBe('APPROVED');

      // Revise budget ceiling from 50,000,000 to 60,000,000
      const revRes = await request(app)
        .post(`/api/v1/budgets/${createdBudgetId}/revise`)
        .set('Authorization', `Bearer ${gmToken}`)
        .send({
          reason: 'Penambahan alokasi perangkat lab sebesar Rp 10 juta',
          lineUpdates: [
            {
              lineId: createdBudgetLineId,
              newAllocatedAmount: 60000000,
            },
          ],
        });
      expect(revRes.status).toBe(200);
      expect(revRes.body.data.status).toBe('REVISED');
      expect(revRes.body.data.version).toBe(2);
      expect(revRes.body.data.totalAllocated).toBe(60000000);
      expect(revRes.body.data.revisions.length).toBeGreaterThanOrEqual(1);

      // Verify revision list endpoint
      const listRev = await request(app)
        .get(`/api/v1/budgets/${createdBudgetId}/revisions`)
        .set('Authorization', `Bearer ${unitMgrToken}`);
      expect(listRev.status).toBe(200);
      expect(listRev.body.data.length).toBeGreaterThanOrEqual(1);
      expect(listRev.body.data[0].version).toBe(1);

      // Verify revision diff comparison endpoint
      const diffRes = await request(app)
        .get(`/api/v1/budgets/${createdBudgetId}/revisions/compare?fromVersion=1&toVersion=current`)
        .set('Authorization', `Bearer ${unitMgrToken}`);
      expect(diffRes.status).toBe(200);
      expect(diffRes.body.data.fromVersion).toBe(1);
      expect(diffRes.body.data.toVersion).toBe(2);
      expect(diffRes.body.data.totalDifference).toBe(10000000);
      expect(diffRes.body.data.lines.length).toBeGreaterThanOrEqual(1);
      expect(diffRes.body.data.lines[0].status).toBe('INCREASED');
    });

    it('supports 4-level volume (V1 x V2 x V3 x V4) and Semula-Menjadi pergeseran calculations', async () => {
      const bRes = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Anggaran Multi-Volume & Semula Menjadi [DATA DEMO]',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1100',
              category: 'PEGAWAI',
              description: 'Honorarium Narasumber Ahli Promise',
              activityCode: '26.1.1.1.1',
              activityName: 'Pengembangan usaha',
              subActivity: 'Proyek Implementasi Promise',
              detailDescription: 'Honorarium Narasumber Luar',
              kelompokPagu: 'Layanan Dasar',
              vol1: 2,
              satuan1: 'Orang',
              vol2: 3,
              satuan2: 'Hari',
              vol3: 2,
              satuan3: 'Sesi',
              vol4: 1,
              satuan4: 'Paket',
              unitPrice: 1500000,
              semulaAmount: 18000000,
              pergeseranAmount: 0,
              allocatedAmount: 18000000,
            },
          ],
        });

      expect(bRes.status).toBe(201);
      const line = bRes.body.data.lines[0];
      expect(line.totalVolume).toBe(12);
      expect(line.unitPrice).toBe(1500000);
      expect(line.semulaAmount).toBe(18000000);
      expect(line.pergeseranAmount).toBe(0);
      expect(line.menjadiAmount).toBe(18000000);
      expect(line.selisihAmount).toBe(0);

      const bdgId = bRes.body.data.id;
      await request(app).post(`/api/v1/budgets/${bdgId}/submit`).set('Authorization', `Bearer ${unitMgrToken}`);
      await request(app).post(`/api/v1/budgets/${bdgId}/approve`).set('Authorization', `Bearer ${gmToken}`).send({ note: 'Setuju' });

      // Revise with Pergeseran (+ Rp 6.000.000)
      const rev = await request(app)
        .post(`/api/v1/budgets/${bdgId}/revise`)
        .set('Authorization', `Bearer ${gmToken}`)
        .send({
          reason: 'Pergeseran volume narasumber dari 3 hari menjadi 4 hari',
          lineUpdates: [
            {
              lineId: line.id,
              vol2: 4,
              newAllocatedAmount: 24000000,
              pergeseranAmount: 6000000,
            },
          ],
        });

      expect(rev.status).toBe(200);
      const revLine = rev.body.data.lines[0];
      expect(revLine.totalVolume).toBe(16); // 2 * 4 * 2 * 1
      expect(revLine.semulaAmount).toBe(18000000);
      expect(revLine.pergeseranAmount).toBe(6000000);
      expect(revLine.menjadiAmount).toBe(24000000);
      expect(revLine.selisihAmount).toBe(-6000000);
    });
  });

  describe('3. Procurement (PR -> Quotations -> PO -> Goods Receipt -> 3-Way Match -> Expense -> Void)', () => {
    let budgetLineId = '';
    let prId = '';
    let vendorId = '';
    let quoteId = '';
    let poId = '';
    let poLineId = '';
    let vendorInvoiceId = '';
    let expenseId = '';

    beforeAll(async () => {
      // Create and approve a dedicated budget for procurement flow
      const bRes = await request(app)
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Anggaran Pengadaan Terpadu [DATA DEMO]',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          lines: [
            {
              costCenterId: ccDiklatLabId,
              accountCode: '5-1200',
              category: 'CAPEX',
              description: 'Pengadaan Switch & Server Uji',
              allocatedAmount: 40000000,
            },
          ],
        });
      const bId = bRes.body.data.id;
      budgetLineId = bRes.body.data.lines[0].id;

      await request(app)
        .post(`/api/v1/budgets/${bId}/submit`)
        .set('Authorization', `Bearer ${unitMgrToken}`);
      await request(app)
        .post(`/api/v1/budgets/${bId}/approve`)
        .set('Authorization', `Bearer ${gmToken}`)
        .send({ note: 'Approved for procurement test' });

      const vRes = await request(app)
        .get('/api/v1/procurement/vendors')
        .set('Authorization', `Bearer ${procurementToken}`);
      vendorId = vRes.body.data.find((v: any) => v.status === 'ACTIVE').id;
    });

    it('rejects PR exceeding available budget ceiling', async () => {
      const overRes = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'PR Melebihi Plafon 40 Juta',
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId,
          purpose: 'Uji penolakan over-budget',
          lines: [
            {
              itemName: 'Server Mahal',
              quantity: 1,
              unit: 'Unit',
              estimatedUnitPrice: 45000000,
            },
          ],
        });
      expect(overRes.status).toBe(409);
      expect(overRes.body.error.code).toBe('BUDGET_CEILING_EXCEEDED');
    });

    it('creates PR within ceiling and reserves budget commitment on approval', async () => {
      const prRes = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Pengadaan 2 Unit Switch Core Lab',
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId,
          purpose: 'Konektivitas lab sertifikasi',
          minQuotationsRequired: 3,
          lines: [
            {
              itemName: 'Managed Switch 24-Port PoE',
              quantity: 2,
              unit: 'Unit',
              estimatedUnitPrice: 10000000,
            },
          ],
        });
      expect(prRes.status).toBe(201);
      prId = prRes.body.data.id;

      const appPr = await request(app)
        .post(`/api/v1/procurement/purchase-requests/${prId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ note: 'Disetujui, cadangkan komitmen Rp 20 juta' });
      expect(appPr.status).toBe(200);
      expect(appPr.body.data.status).toBe('APPROVED');
      expect(Number(appPr.body.data.budgetLine.committedAmount)).toBe(20000000);
    });

    it('enforces minimum 3 quotations unless quotationExceptionReason is provided when creating PO', async () => {
      const qRes = await request(app)
        .post(`/api/v1/procurement/purchase-requests/${prId}/quotations`)
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          vendorId,
          quotationNumber: 'QT-TEST-2026-01',
          quotedSubtotal: 18000000,
          taxRatePercent: 11,
          deliveryDays: 7,
        });
      expect(qRes.status).toBe(201);
      quoteId = qRes.body.data.id;

      // Attempt PO with only 1 quotation and no exception reason -> must fail
      const failPo = await request(app)
        .post('/api/v1/procurement/purchase-orders')
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          purchaseRequestId: prId,
          selectedQuotationId: quoteId,
          selectionJustification: 'Harga sesuai pagu',
        });
      expect(failPo.status).toBe(409);
      expect(failPo.body.error.code).toBe('MIN_QUOTATIONS_NOT_MET');

      // Now create PO with valid quotationExceptionReason
      const okPo = await request(app)
        .post('/api/v1/procurement/purchase-orders')
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          purchaseRequestId: prId,
          selectedQuotationId: quoteId,
          selectionJustification: 'Distributor resmi perangkat jaringan',
          quotationExceptionReason: 'Penunjukan langsung karena kompatibilitas perangkat eksisting',
        });
      expect(okPo.status).toBe(201);
      poId = okPo.body.data.id;
      poLineId = okPo.body.data.lines[0].id;
    });

    it('enforces 3-way matching on Vendor Invoice and prevents duplicate vendor invoice numbers', async () => {
      // Receive only 1 of 2 ordered units first (50% received)
      const grPartial = await request(app)
        .post(`/api/v1/procurement/purchase-orders/${poId}/goods-receipts`)
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          deliveryNoteRef: 'SJ-PARTIAL-01',
          items: [{ purchaseOrderLineId: poLineId, quantityReceived: 1, condition: 'GOOD' }],
        });
      expect(grPartial.status).toBe(201);
      expect(grPartial.body.data.poStatus).toBe('PARTIALLY_RECEIVED');

      // Attempt full Vendor Invoice (100% value) while only 50% received without exception -> must fail 3-way match
      const vendorInvNo = `INV-VND-${runTag}`;
      const failInv = await request(app)
        .post('/api/v1/procurement/vendor-invoices')
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          vendorId,
          vendorInvoiceNumber: vendorInvNo,
          purchaseOrderId: poId,
          businessUnitId: unitDiklatId,
          invoiceDate: '2026-10-29',
          dueDate: '2026-11-28',
          subtotal: 18000000,
          taxAmount: 1980000,
          allowExceptionReview: false,
        });
      expect(failInv.status).toBe(409);
      expect(failInv.body.error.code).toBe('THREE_WAY_MATCH_FAILED');

      // Receive the remaining 1 unit (now 100% received)
      const grFull = await request(app)
        .post(`/api/v1/procurement/purchase-orders/${poId}/goods-receipts`)
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          deliveryNoteRef: 'SJ-FULL-02',
          items: [{ purchaseOrderLineId: poLineId, quantityReceived: 1, condition: 'GOOD' }],
        });
      expect(grFull.status).toBe(201);
      expect(grFull.body.data.poStatus).toBe('RECEIVED');

      // Now 3-way match succeeds
      const okInv = await request(app)
        .post('/api/v1/procurement/vendor-invoices')
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          vendorId,
          vendorInvoiceNumber: vendorInvNo,
          purchaseOrderId: poId,
          businessUnitId: unitDiklatId,
          invoiceDate: '2026-10-29',
          dueDate: '2026-11-28',
          subtotal: 18000000,
          taxAmount: 1980000,
        });
      expect(okInv.status).toBe(201);
      expect(okInv.body.data.matchingStatus).toBe('MATCHED_3WAY');
      vendorInvoiceId = okInv.body.data.id;

      // Duplicate vendor invoice from same vendor -> must fail with 409
      const dupInv = await request(app)
        .post('/api/v1/procurement/vendor-invoices')
        .set('Authorization', `Bearer ${procurementToken}`)
        .send({
          vendorId,
          vendorInvoiceNumber: vendorInvNo,
          purchaseOrderId: poId,
          businessUnitId: unitDiklatId,
          invoiceDate: '2026-10-29',
          dueDate: '2026-11-28',
          subtotal: 18000000,
          taxAmount: 1980000,
        });
      expect(dupInv.status).toBe(409);
      expect(dupInv.body.error.code).toBe('DUPLICATE_VENDOR_INVOICE');
    });

    it('approves, pays, auto-posts balanced journal for expense, and supports controlled void/reversal', async () => {
      const expRes = await request(app)
        .post('/api/v1/procurement/expenses')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          title: 'Pelunasan Tagihan Switch Core Lab',
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId,
          fundSourceId: fundInternalId,
          vendorId,
          vendorInvoiceId,
          category: 'CAPEX',
          paymentMethod: 'BANK_TRANSFER',
          recipientName: 'Vendor Jaringan Resmi',
          subtotal: 18000000,
          taxAmount: 1980000,
          description: 'Pembayaran faktur INV-VND-9901 sesuai 3-way match',
        });
      expect(expRes.status).toBe(201);
      expenseId = expRes.body.data.id;

      const appExp = await request(app)
        .post(`/api/v1/procurement/expenses/${expenseId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ note: '3-Way Match lengkap, setujui pembayaran' });
      expect(appExp.status).toBe(200);
      expect(appExp.body.data.status).toBe('APPROVED');

      const payExp = await request(app)
        .post(`/api/v1/procurement/expenses/${expenseId}/pay`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(payExp.status).toBe(200);
      expect(payExp.body.data.expense.status).toBe('POSTED');
      expect(payExp.body.data.journal.status).toBe('POSTED');
      expect(Number(payExp.body.data.journal.totalDebit)).toBe(19980000);
      expect(Number(payExp.body.data.journal.totalCredit)).toBe(19980000);

      // Void the posted expense with reason -> restores budget actual and posts reversal journal
      const voidExp = await request(app)
        .post(`/api/v1/procurement/expenses/${expenseId}/void`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'Simulasi koreksi rekening penerima pada uji otomatis' });
      expect(voidExp.status).toBe(200);
      expect(voidExp.body.data.status).toBe('VOID');
    });
  });

  describe('4. Customer Order, Invoice, Idempotent Payment, Webhook, Refund & Cashier Closeout', () => {
    let customerId = '';
    let productId = '';
    let salesOrderId = '';
    let invoiceId = '';
    let paymentId = '';

    beforeAll(async () => {
      const [custRes, prodRes] = await Promise.all([
        request(app).get('/api/v1/revenue/customers').set('Authorization', `Bearer ${unitMgrToken}`),
        request(app).get('/api/v1/revenue/products').set('Authorization', `Bearer ${unitMgrToken}`),
      ]);
      customerId = custRes.body.data[0].id;
      productId = prodRes.body.data[0].id;
    });

    it('creates Sales Order + Customer Invoice and keeps service delivery independent from payment status', async () => {
      const soRes = await request(app)
        .post('/api/v1/revenue/sales-orders')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          customerId,
          businessUnitId: unitDiklatId,
          terms: 'NET 14',
          dueInDays: 14,
          issueInvoiceImmediately: true,
          lines: [
            {
              productServiceId: productId,
              quantity: 2,
              discountAmount: 0,
              taxRatePercent: 11,
            },
          ],
        });
      expect(soRes.status).toBe(201);
      salesOrderId = soRes.body.data.order.id;
      invoiceId = soRes.body.data.invoice.id;
      const lockedOrderLinePrice = Number(soRes.body.data.order.lines[0].unitPrice);

      // Deliver service -> must NOT mark invoice as PAID
      const delivRes = await request(app)
        .post(`/api/v1/revenue/sales-orders/${salesOrderId}/deliver`)
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({ deliveryNotes: 'Pelatihan batch uji selesai dilaksanakan' });
      expect(delivRes.status).toBe(200);
      expect(delivRes.body.data.deliveryStatus).toBe('DELIVERED');

      const invCheck = await request(app)
        .get('/api/v1/revenue/customer-invoices')
        .set('Authorization', `Bearer ${unitMgrToken}`);
      const targetInv = invCheck.body.data.find((i: any) => i.id === invoiceId);
      expect(targetInv.serviceDelivered).toBe(true);
      expect(targetInv.status).toBe('ISSUED');
      expect(targetInv.paidAmount).toBe(0);

      // Update master product price -> historical invoice line price must remain unchanged
      const newMasterPrice = lockedOrderLinePrice + 500000;
      const priceUpdate = await request(app)
        .patch(`/api/v1/revenue/products/${productId}/price`)
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({ newPrice: newMasterPrice, reason: 'Penyesuaian tarif katalog baru' });
      expect(priceUpdate.status).toBe(200);

      const invAfterPriceChange = await request(app)
        .get('/api/v1/revenue/customer-invoices')
        .set('Authorization', `Bearer ${unitMgrToken}`);
      const unchangedInv = invAfterPriceChange.body.data.find((i: any) => i.id === invoiceId);
      expect(Number(unchangedInv.lines[0].unitPrice)).toBe(lockedOrderLinePrice);
    });

    it('processes partial payment, enforces idempotency on retry, and verifies HMAC webhook signatures', async () => {
      const idempKey = `IDEMP_KEY_${runTag}`;
      const partialRes = await request(app)
        .post('/api/v1/revenue/payments')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerInvoiceId: invoiceId,
          method: 'QRIS_SIMULATED',
          grossAmount: 5000000,
          feeAmount: 35000,
          referenceNo: `QRIS-${runTag}`,
          idempotencyKey: idempKey,
        });
      expect(partialRes.status).toBe(201);
      expect(partialRes.body.data.idempotentReplay).toBe(false);
      expect(partialRes.body.data.payment.netAmount).toBe(4965000);
      paymentId = partialRes.body.data.payment.id;

      // Retry with the exact same idempotencyKey -> must return 200 idempotentReplay: true without double counting
      const retryRes = await request(app)
        .post('/api/v1/revenue/payments')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerInvoiceId: invoiceId,
          method: 'QRIS_SIMULATED',
          grossAmount: 5000000,
          feeAmount: 35000,
          referenceNo: `QRIS-${runTag}`,
          idempotencyKey: idempKey,
        });
      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.idempotentReplay).toBe(true);
      expect(retryRes.body.data.payment.id).toBe(paymentId);

      // Webhook with invalid signature -> must reject with 401
      const webhookPayload = {
        eventId: `EVT_WEBHOOK_${runTag}`,
        customerInvoiceId: invoiceId,
        grossAmount: 1000000,
        feeAmount: 2500,
        method: 'VIRTUAL_ACCOUNT_SIMULATED',
        referenceNo: `VA-WEBHOOK-${runTag}`,
      };
      const badWebhook = await request(app)
        .post('/api/v1/revenue/payments/webhook')
        .set('x-webhook-signature', 'invalid_signature_value')
        .send(webhookPayload);
      expect(badWebhook.status).toBe(401);
      expect(badWebhook.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');

      // Webhook with valid HMAC-SHA256 signature -> must succeed
      const validSig = computeWebhookSignature(JSON.stringify(webhookPayload));
      const goodWebhook = await request(app)
        .post('/api/v1/revenue/payments/webhook')
        .set('x-webhook-signature', validSig)
        .send(webhookPayload);
      expect(goodWebhook.status).toBe(201);
      expect(goodWebhook.body.data.idempotentReplay).toBe(false);
    });

    it('rejects excessive refund and processes valid controlled refund with reversal journal', async () => {
      const badRefund = await request(app)
        .post(`/api/v1/revenue/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ amount: 99999999, reason: 'Melebihi pembayaran asal' });
      expect(badRefund.status).toBe(409);
      expect(badRefund.body.error.code).toBe('REFUND_EXCEEDS_PAYMENT');

      const okRefund = await request(app)
        .post(`/api/v1/revenue/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ amount: 1000000, reason: 'Koreksi kelebihan bayar peserta pelatihan' });
      expect(okRefund.status).toBe(201);
      expect(okRefund.body.data.status).toBe('PROCESSED');
    });

    it('prevents duplicate OPEN cashier sessions on same register and flags discrepancy on closeout', async () => {
      const cshRes = await request(app)
        .get('/api/v1/revenue/cashier/sessions')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(cshRes.status).toBe(200);
      const register = cshRes.body.data.registers[0];
      expect(register).toBeDefined();

      let openSession = cshRes.body.data.sessions?.find((s: any) => s.status === 'OPEN');

      if (!openSession) {
        const createSession = await request(app)
          .post('/api/v1/revenue/cashier/sessions/open')
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({
            cashRegisterId: register.id,
            openingFloat: 1000000,
          });
        expect(createSession.status).toBe(201);
        openSession = createSession.body.data;
      }
      expect(openSession).toBeDefined();

      // Trying to open another session on the same register while OPEN -> 409
      const dupOpen = await request(app)
        .post('/api/v1/revenue/cashier/sessions/open')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          cashRegisterId: openSession.cashRegisterId,
          openingFloat: 2000000,
        });
      expect(dupOpen.status).toBe(409);
      expect(dupOpen.body.error.code).toBe('REGISTER_ALREADY_OPEN');
    });
  });

  describe('5. Bank Statement Import Preview & Duplicate Fingerprint Detection', () => {
    it('detects duplicate statement lines via SHA-256 fingerprint during preview', async () => {
      const bnkRes = await request(app)
        .get('/api/v1/reconciliation/bank-accounts')
        .set('Authorization', `Bearer ${financeToken}`);
      const bankAccountId = bnkRes.body.data[0].id;

      // Preview with 2 identical rows in the same batch -> second row must be flagged as duplicate
      const previewRes = await request(app)
        .post('/api/v1/reconciliation/preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          bankAccountId,
          periodLabel: 'Uji Oktober 2026',
          fileName: 'mutasi-uji.csv',
          rows: [
            {
              transactionDate: '2026-10-28',
              description: 'Setoran Pelanggan Uji',
              referenceNo: 'REF-UJI-DUP-01',
              direction: 'CREDIT',
              amount: 7500000,
            },
            {
              transactionDate: '2026-10-28',
              description: 'Setoran Pelanggan Uji Duplikat',
              referenceNo: 'REF-UJI-DUP-01',
              direction: 'CREDIT',
              amount: 7500000,
            },
          ],
        });
      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.summary.totalRows).toBe(2);
      expect(previewRes.body.data.summary.duplicateCount).toBe(1);
    });
  });

  describe('6. Accounting Controls: Balanced Double-Entry, Immutable Posted Journals & Closed Period Lock', () => {
    let manualJournalId = '';

    it('rejects unbalanced journal entries where Total Debit != Total Credit', async () => {
      const res = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          businessUnitId: unitDiklatId,
          description: 'Jurnal Tidak Seimbang Uji',
          lines: [
            { accountCode: '5-1400', description: 'Beban', debit: 1500000, credit: 0 },
            { accountCode: '1-1120', description: 'Bank', debit: 0, credit: 1200000 },
          ],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNBALANCED_JOURNAL');
    });

    it('blocks posting journals into a CLOSED fiscal period (FY-2025)', async () => {
      const res = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          fiscalPeriodId: period2025ClosedId,
          businessUnitId: unitDiklatId,
          description: 'Posting ke Periode Tutup Buku 2025',
          lines: [
            { accountCode: '5-1400', description: 'Beban', debit: 1000000, credit: 0 },
            { accountCode: '1-1120', description: 'Bank', debit: 0, credit: 1000000 },
          ],
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FISCAL_PERIOD_CLOSED');
    });

    it('blocks posting journals into a LOCKED fiscal period (FP-2026-10)', async () => {
      const periodsRes = await request(app)
        .get('/api/v1/master/overview')
        .set('Authorization', `Bearer ${accountingToken}`);
      const fpOct = periodsRes.body.data.fiscalPeriods.find((p: any) => p.code === 'FP-2026-10');
      expect(fpOct).toBeDefined();

      const res = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          fiscalPeriodId: fpOct.id,
          businessUnitId: unitDiklatId,
          description: 'Posting ke Periode Locked Rekonsiliasi',
          lines: [
            { accountCode: '5-1400', description: 'Beban', debit: 1000000, credit: 0 },
            { accountCode: '1-1120', description: 'Bank', debit: 0, credit: 1000000 },
          ],
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('FISCAL_PERIOD_LOCKED');
    });

    it('posts balanced manual journal, forbids direct deletion, and creates linked reversal journal', async () => {
      const postRes = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          businessUnitId: unitDiklatId,
          description: 'Penyesuaian Utilitas Bulanan Uji',
          lines: [
            { accountCode: '5-1400', description: 'Beban Utilitas', debit: 2500000, credit: 0 },
            { accountCode: '1-1120', description: 'Bank Mandiri', debit: 0, credit: 2500000 },
          ],
        });
      expect(postRes.status).toBe(201);
      manualJournalId = postRes.body.data.id;

      // Direct deletion of posted journal -> 403 POSTED_JOURNAL_IMMUTABLE
      const delRes = await request(app)
        .delete(`/api/v1/accounting/journals/${manualJournalId}`)
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(delRes.status).toBe(403);
      expect(delRes.body.error.code).toBe('POSTED_JOURNAL_IMMUTABLE');

      // Reversal creates linked entry and keeps Trial Balance balanced
      const revRes = await request(app)
        .post(`/api/v1/accounting/journals/${manualJournalId}/reverse`)
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({ reason: 'Koreksi salah nominal pada jurnal manual' });
      expect(revRes.status).toBe(201);
      expect(revRes.body.data.reversal.reversedFromId).toBe(manualJournalId);

      // Verify Trial Balance is strictly balanced
      const ledgerRes = await request(app)
        .get('/api/v1/accounting/ledger')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.trialBalanceSummary.isBalanced).toBe(true);
      expect(ledgerRes.body.data.trialBalanceSummary.totalDebit).toBe(
        ledgerRes.body.data.trialBalanceSummary.totalCredit
      );
    });
  });

  describe('7. Qwen AI Financial Copilot (/reports/ai-assistant)', () => {
    it('answers financial inquiries with real-time database context', async () => {
      const res = await request(app)
        .post('/api/v1/reports/ai-assistant')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          query: 'Berapa sisa anggaran divisi saya saat ini?',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toContain('Analisis Anggaran Terkini');
      expect(res.body.data.reply).toContain('Rp');
      expect(res.body.data.suggestions).toBeInstanceOf(Array);
      expect(res.body.data.contextMetrics).toBeDefined();
    }, 15000);
  });
});
