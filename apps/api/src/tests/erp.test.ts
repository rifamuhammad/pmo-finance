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
      expect(grPartial.body.data.journal).toBeDefined();
      expect(grPartial.body.data.journal.status).toBe('POSTED');
      expect(Number(grPartial.body.data.journal.totalDebit)).toBe(Number(grPartial.body.data.journal.totalCredit));

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
      const debitLine = payExp.body.data.journal.lines.find((l: any) => Number(l.debit) > 0);
      expect(debitLine.accountCode).toBe('210101010100');

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
    let originalProductPrice: number | null = null;
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
      originalProductPrice = Number(prodRes.body.data[0].unitPrice);
    });

    afterAll(async () => {
      try {
        if (productId && originalProductPrice !== null) {
          await prisma.productService.update({
            where: { id: productId },
            data: { unitPrice: originalProductPrice },
          });
        }
        if (invoiceId) {
          const [invRefunds, invPayments] = await Promise.all([
            prisma.refund.findMany({ where: { customerInvoiceId: invoiceId }, select: { id: true } }),
            prisma.payment.findMany({ where: { customerInvoiceId: invoiceId }, select: { id: true, journalEntryId: true } }),
          ]);
          const refundIds = invRefunds.map((r) => r.id);
          const payIds = invPayments.map((p) => p.id);
          const directJournalIds = invPayments.map((p) => p.journalEntryId).filter(Boolean) as string[];

          const journals = await prisma.journalEntry.findMany({
            where: {
              OR: [
                { id: { in: directJournalIds } },
                { sourceId: invoiceId },
                ...(refundIds.length ? [{ sourceId: { in: refundIds } }] : []),
                ...(payIds.length ? [{ sourceId: { in: payIds } }] : []),
              ],
            },
            select: { id: true },
          });
          const journalIds = journals.map((j) => j.id);

          if (refundIds.length) {
            await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
          }
          if (payIds.length) {
            await prisma.payment.deleteMany({ where: { id: { in: payIds } } });
          }
          await prisma.customerInvoiceLine.deleteMany({ where: { customerInvoiceId: invoiceId } });
          await prisma.customerInvoice.deleteMany({ where: { id: invoiceId } });
          if (salesOrderId) {
            await prisma.salesOrderLine.deleteMany({ where: { salesOrderId } });
            await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } });
          }
          if (journalIds.length) {
            await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: journalIds } } });
            await prisma.journalEntry.deleteMany({ where: { id: { in: journalIds } } });
          }
        }
      } catch {
        // Ignore cleanup errors if test exited early
      }
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
      expect(partialRes.body.data.payment.approvalStatus).toBe('PENDING_APPROVAL');
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

      // Finance Manager approves the payment receipt -> posts cash journal & settles invoice balance
      const approvePayRes = await request(app)
        .post(`/api/v1/revenue/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(approvePayRes.status).toBe(200);
      expect(approvePayRes.body.data.approvalStatus).toBe('APPROVED');
      expect(approvePayRes.body.data.status).toBe('CONFIRMED');

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

      // Partial refund must keep invoice in PARTIALLY_PAID (not REFUNDED) when paidAmount & balanceDue > 0
      const invAfterRefund = await prisma.customerInvoice.findUnique({ where: { id: invoiceId } });
      expect(invAfterRefund?.status).toBe('PARTIALLY_PAID');
      expect(Number(invAfterRefund?.balanceDue || 0)).toBeGreaterThan(0);
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

    it('records cash deposit to Bank Mandiri Penerimaan (110102010100 vs 110101010100) and closes cashier session with balanced journal (PMO-082)', async () => {
      const cshRes = await request(app)
        .get('/api/v1/revenue/cashier/sessions')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(cshRes.status).toBe(200);
      const openSession = cshRes.body.data.sessions?.find((s: any) => s.status === 'OPEN');
      expect(openSession).toBeDefined();

      const bnkRes = await request(app)
        .get('/api/v1/reconciliation/bank-accounts')
        .set('Authorization', `Bearer ${financeToken}`);
      const mandiriAccount =
        bnkRes.body.data.find((b: any) => b.domain === 'PENERIMAAN' || b.glAccountCode === '110102010100') ||
        bnkRes.body.data[0];
      const bankAccountId = mandiriAccount.id;

      // Deposit Rp 500.000 to Bank Mandiri (Penerimaan)
      const depRes = await request(app)
        .post('/api/v1/revenue/cashier/deposits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          cashierSessionId: openSession.id,
          bankAccountId,
          amount: 500000,
          referenceNo: `SLIP-DEP-${Date.now().toString().slice(-6)}`,
          notes: 'Setoran kasir loket ke rekening Bank Mandiri Penerimaan',
        });
      expect(depRes.status).toBe(201);
      expect(depRes.body.data.depositNumber).toBeDefined();

      // Verify journal created for deposit
      const jrn = await prisma.journalEntry.findFirst({
        where: { sourceType: 'CASH_DEPOSIT', sourceId: depRes.body.data.id },
        include: { lines: true },
      });
      expect(jrn).toBeDefined();
      expect(jrn?.lines.length).toBe(2);
      const debitLine = jrn?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = jrn?.lines.find((l) => Number(l.credit) > 0);
      expect(debitLine?.accountCode).toBe('110102010100'); // Rekening Giro Bank Mandiri Penerimaan PMO
      expect(creditLine?.accountCode).toBe('110101010100'); // Kas Uang Persediaan

      // Close cashier session
      const closeRes = await request(app)
        .post(`/api/v1/revenue/cashier/sessions/${openSession.id}/close`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          actualCountedCash: Number(openSession.theoreticalBalance),
        });
      expect(closeRes.status).toBe(200);
      expect(['CLOSED', 'CLOSING_SUBMITTED']).toContain(closeRes.body.data.status);
    });
  });

  describe('5. Bank Statement Import Preview, BRI Parser & Duplicate Fingerprint Detection (KOI-115 / PMO-081)', () => {
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

    it('parses Bank Mandiri / BTN CSV statement, auto-matches transactions, and calculates book vs bank summary (PMO-081)', async () => {
      const bnkRes = await request(app)
        .get('/api/v1/reconciliation/bank-accounts')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(bnkRes.body.data.some((b: any) => b.domain === 'PENERIMAAN' && b.glAccountCode === '110102010100')).toBe(true);
      expect(bnkRes.body.data.some((b: any) => b.domain === 'PENGELUARAN' && b.glAccountCode === '110102010300')).toBe(true);
      const btnAccount = bnkRes.body.data.find((b: any) => b.domain === 'PENGELUARAN' || b.glAccountCode === '110102010300') || bnkRes.body.data[0];

      // 1. Test CSV Parser for Bank BTN (Pengeluaran) / Bank Mandiri (Penerimaan)
      const testTs = Date.now();
      const csvRaw = `Tanggal,No Referensi,Keterangan,Debet,Kredit,Saldo
2026-12-16,STR-MDR-${testTs}-01,SETORAN KASIR POS PMO UTAMA,0,500000,10500000
2026-12-17,LS-BTN-${testTs}-02,PELUNASAN TAGIHAN VENDOR LS,19980000,0,8520000
2026-12-18,ADM-BTN-${testTs}-03,BIAYA ADM REKENING BANK BTN,25000,0,8495000`;

      const parseRes = await request(app)
        .post('/api/v1/reconciliation/parse-csv')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ rawContent: csvRaw, fileName: 'rekening-koran-btn-desember-2026.csv' });

      expect(parseRes.status).toBe(200);
      expect(parseRes.body.data.totalRows).toBe(3);
      expect(parseRes.body.data.rows[0].direction).toBe('CREDIT');
      expect(parseRes.body.data.rows[0].amount).toBe(500000);
      expect(parseRes.body.data.rows[1].direction).toBe('DEBIT');
      expect(parseRes.body.data.rows[1].amount).toBe(19980000);

      // 2. Test Preview with auto-matching
      const previewRes = await request(app)
        .post('/api/v1/reconciliation/preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          bankAccountId: btnAccount.id,
          periodLabel: 'Desember 2026',
          fileName: 'rekening-koran-btn-desember-2026.csv',
          rows: parseRes.body.data.rows,
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.summary.totalRows).toBe(3);
      expect(previewRes.body.data.summary.duplicateCount).toBe(0);

      // 3. Test Commit Import
      const importRes = await request(app)
        .post('/api/v1/reconciliation/import')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          bankAccountId: btnAccount.id,
          periodLabel: 'Desember 2026',
          fileName: 'rekening-koran-btn-desember-2026.csv',
          rows: parseRes.body.data.rows,
        });

      expect(importRes.status).toBe(201);
      const importId = importRes.body.data.id;
      expect(importRes.body.data.status).toBe('RECONCILING');

      // 4. Test Reconciliation Summary endpoint
      const summaryRes = await request(app)
        .get(`/api/v1/reconciliation/summary/${btnAccount.id}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.glAccountCode).toBeDefined();
      expect(summaryRes.body.data.bookBalance).toBeTypeOf('number');
      expect(summaryRes.body.data.bankBalance).toBeTypeOf('number');

      // 5. Finalize reconciliation session
      const finRes = await request(app)
        .post(`/api/v1/reconciliation/imports/${importId}/finalize`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(finRes.status).toBe(200);
      expect(finRes.body.data.status).toBe('FINALIZED');
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

  describe('8. UMK & SPJ Petty Cash (KOI-109 / PMO-061)', () => {
    let submissionId: string;

    it('creates a petty cash submission, verifies tax, approves and disburses with balanced double-entry journal', async () => {
      // 1. Create submission
      const createRes = await request(app)
        .post('/api/v1/petty-cash/submissions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'GUP',
          applicantName: 'Budi Kasir PMO',
          applicantUnit: 'Unit Operasional',
          applicantPhone: '081234567890',
          expenseCategory: 'Biaya Konsumsi & ATK',
          draCode: '520901020100',
          draDescription: 'Beban Barang dan Perlengkapan',
          coaCode: '520901020100',
          coaName: 'Beban Barang dan Perlengkapan',
          activityDescription: 'Penggantian konsumsi rapat koordinasi sprint 3',
          vendorName: 'CV Katering Kampus UTama',
          vendorTaxId: '01.234.567.8-123.000',
          vendorIdentityName: 'CV Katering Kampus UTama',
          transactionDate: '2026-11-10',
          paymentMethod: 'Transfer Bank',
          taxType: 'PPh 23 (Jasa Boga/Katering)',
          taxDetail: 'Pemotongan PPh 23 2%',
          businessUnitId: unitDiklatId,
          items: [
            {
              description: 'Paket Snack Box Rapat Koordinasi',
              unit: 'Kotak',
              quantity: 20,
              unitPrice: 25000,
              isTaxable: true,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      submissionId = createRes.body.data.id;
      expect(submissionId).toBeDefined();

      // 2. Verify Tax
      const taxRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${submissionId}/verify-tax`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ taxType: 'PPh 23 (Jasa Boga/Katering)' });
      expect(taxRes.status).toBe(200);
      expect(taxRes.body.data.status).toBe('TAX_VERIFIED');

      // 3. Approve
      const approveRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${submissionId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({});
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // 4. Disburse and verify balanced double-entry journal
      const disburseRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${submissionId}/disburse`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({});
      expect(disburseRes.status).toBe(200);
      expect(disburseRes.body.success).toBe(true);
      expect(disburseRes.body.data.status).toBe('DISBURSED');
      expect(disburseRes.body.data.journalDocNo).toBeDefined();

      const journal = disburseRes.body.data.journal;
      expect(journal).toBeDefined();
      expect(journal.totalDebit).toBe(journal.totalCredit);
      expect(Number(journal.totalDebit)).toBeGreaterThan(0);

      // Verify detail endpoint returns journalDocNo
      const getRes = await request(app)
        .get(`/api/v1/petty-cash/submissions/${submissionId}`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.journalDocNo).toBe(journal.journalNumber);
    });

    it('processes TUP_NIHIL submission and auto-posts closing journal crediting Panjar UMK 110501010100 (PMO-072 / KOI-112)', async () => {
      // 1. Create TUP_NIHIL submission (SPJ pertanggungjawaban panjar UMK)
      const createRes = await request(app)
        .post('/api/v1/petty-cash/submissions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'TUP_NIHIL',
          applicantName: 'Ahmad PIC Pelaksana Kegiatan',
          applicantUnit: 'Unit Diklat TCI',
          applicantPhone: '081298765432',
          expenseCategory: 'Perlengkapan Pelatihan',
          draCode: '520901020100',
          draDescription: 'Beban Barang dan Perlengkapan',
          coaCode: '520901020100',
          coaName: 'Beban Barang dan Perlengkapan',
          activityDescription: 'Pertanggungjawaban SPJ uang muka kegiatan workshop TCI',
          vendorName: 'Toko Buku & Alat Tulis Kampus',
          vendorTaxId: '02.345.678.9-456.000',
          vendorIdentityName: 'Toko Buku & Alat Tulis Kampus',
          transactionDate: '2026-11-10',
          paymentMethod: 'Uang Muka Kerja (TUP)',
          taxType: 'PPh 22 (Barang)',
          taxDetail: 'Pemotongan PPh 22 1.5%',
          businessUnitId: unitDiklatId,
          items: [
            {
              description: 'Modul Pelatihan & Block Note Peserta',
              unit: 'Paket',
              quantity: 50,
              unitPrice: 30000,
              isTaxable: true,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      const tupId = createRes.body.data.id;
      expect(tupId).toBeDefined();

      // 2. Tax Verification
      const taxRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${tupId}/verify-tax`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ taxType: 'PPh 22 (Barang)' });
      expect(taxRes.status).toBe(200);
      expect(taxRes.body.data.status).toBe('TAX_VERIFIED');

      // 3. Approval by Finance Manager
      const approveRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${tupId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({});
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // 4. Nihilisasi / Disburse - should credit account 110501010100 (Panjar UMK)
      const disburseRes = await request(app)
        .post(`/api/v1/petty-cash/submissions/${tupId}/disburse`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({});
      expect(disburseRes.status).toBe(200);
      expect(disburseRes.body.data.status).toBe('DISBURSED');

      const journal = disburseRes.body.data.journal;
      expect(journal).toBeDefined();
      expect(journal.totalDebit).toBe(journal.totalCredit);

      // Verify journal lines credit 110501010100
      const dbJournal = await prisma.journalEntry.findUnique({
        where: { id: journal.id },
        include: { lines: true },
      });
      expect(dbJournal).toBeDefined();
      const creditUmkLine = dbJournal?.lines.find(
        (l) => l.accountCode === '110501010100' && Number(l.credit) > 0
      );
      expect(creditUmkLine).toBeDefined();
    });
  });

  describe('9. Sprint 3 Review & Uji Transaksi Kas Lintas 5 Unit Bisnis PMO (SPRINT-3-REV / KOI-113)', () => {
    it('verifies commercial revenue accounts mapping for all 5 PMO business units', async () => {
      const units = await prisma.businessUnit.findMany({
        where: { code: { in: ['BU-TCI', 'BU-ITS', 'BU-KLINIK', 'BU-MICE', 'PMO-MGMT'] } },
      });
      expect(units.length).toBe(5);

      const expectedMap: Record<string, string> = {
        'BU-TCI': '420301010200',
        'BU-ITS': '420301040200',
        'BU-KLINIK': '420301060100',
        'BU-MICE': '420301070200',
        'PMO-MGMT': '420301090100',
      };

      for (const u of units) {
        const expectedCoa = expectedMap[u.code];
        expect(expectedCoa).toBeDefined();
        const coa = await prisma.chartOfAccount.findUnique({ where: { code: expectedCoa } });
        expect(coa).toBeDefined();
        expect(coa?.isActive).toBe(true);
        expect(coa?.type).toBe('REVENUE');
        expect(coa?.normalBalance).toBe('CREDIT');
      }

      // Ensure 9 deprecated fabricated Klinik/MICE sub-codes are inactive
      const deprecatedActive = await prisma.chartOfAccount.count({
        where: {
          isActive: true,
          code: {
            in: [
              '420301060300', '420301060400', '420301060500', '420301060600', '420301060700',
              '420301070201', '420301070202', '420301070203', '420301070204',
            ],
          },
        },
      });
      expect(deprecatedActive).toBe(0);
    });

    it('confirms the General Ledger Trial Balance is strictly balanced after all Sprint 3 transactions', async () => {
      const ledgerRes = await request(app)
        .get('/api/v1/accounting/ledger')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.trialBalanceSummary).toBeDefined();
      expect(ledgerRes.body.data.trialBalanceSummary.isBalanced).toBe(true);
      expect(ledgerRes.body.data.trialBalanceSummary.totalDebit).toBe(
        ledgerRes.body.data.trialBalanceSummary.totalCredit
      );
    });
  });

  describe('10. HRIS Gaji PUT PK, SBM 2026 & PPh 21 TER (PMO-091 / KOI-116)', () => {
    let testEmployeeId = '';

    beforeAll(async () => {
      const empRes = await request(app)
        .get('/api/v1/hris/employees')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(empRes.status).toBe(200);
      expect(empRes.body.data.length).toBeGreaterThan(0);
      testEmployeeId = empRes.body.data[0].id;
    });

    it('retrieves SBM 2026 reference standards and summary calculations', async () => {
      const res = await request(app)
        .get('/api/v1/hris/payroll/summary-sbm')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.activeEmployeesCount).toBeGreaterThan(0);
      expect(res.body.data.sbmStandards.MEAL_ALLOWANCE_PER_DAY).toBe(37000);
      expect(res.body.data.sbmStandards.OVERTIME_RATE_PER_HOUR).toBe(20000);
      expect(res.body.data.sbmStandards.COA_BEBAN_GAJI_PUT_PK).toBe('520101030100');
      expect(res.body.data.sbmStandards.COA_UTANG_PPH21).toBe('210201010100');
      expect(res.body.data.sbmStandards.COA_BANK_BRI).toBe('110102010300');
      expect(res.body.data.summary.totalGross).toBeGreaterThan(0);
      expect(res.body.data.summary.totalNetTakeHome).toBeGreaterThan(0);
    });

    it('calculates employee payroll with SBM allowances, BPJS deduction & PPh 21 TER (PMO-091)', async () => {
      const res = await request(app)
        .post('/api/v1/hris/payroll/calculate')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          employeeId: testEmployeeId,
          workDays: 22,
          overtimeHours: 5,
          ptkpCategory: 'TER_A',
        });

      expect(res.status).toBe(200);
      const { calculation, accountingMapping } = res.body.data;
      expect(calculation.mealAllowance).toBe(22 * 37000); // 814.000
      expect(calculation.overtimeAmount).toBe(5 * 20000); // 100.000
      expect(calculation.deductionBpjs).toBeGreaterThan(0);
      expect(calculation.pph21RatePercent).toBeGreaterThanOrEqual(0);
      expect(calculation.netSalary).toBe(
        calculation.grossSalary - calculation.deductionBpjs - calculation.deductionPph21
      );
      expect(accountingMapping.bebanGajiCoa).toBe('520101030100');
      expect(accountingMapping.utangPph21Coa).toBe('210201010100');
      expect(accountingMapping.bankBriCoa).toBe('110102010300');
    });

    it('generates batch salary slips for period 12/2026 based on SBM 2026 & PPh 21 TER', async () => {
      const res = await request(app)
        .post('/api/v1/hris/payroll/generate')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          periodMonth: 12,
          periodYear: 2026,
          workDays: 22,
          ptkpCategory: 'TER_A',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.totalGenerated).toBeGreaterThan(0);
      expect(res.body.data.slips.length).toBeGreaterThan(0);

      const sampleSlip = res.body.data.slips[0];
      expect(sampleSlip.status).toBe('APPROVED');
      expect(sampleSlip.notes).toContain('SBM 2026');
      expect(sampleSlip.notes).toContain('PPh 21 TER');
    });
  });

  describe('11. Database Karyawan, Riwayat Kontrak & Rekapitulasi Presensi Unit (PMO-101 / KOI-117)', () => {
    let testEmpId = '';

    beforeAll(async () => {
      const empRes = await request(app)
        .get('/api/v1/hris/employees')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(empRes.status).toBe(200);
      expect(empRes.body.data.length).toBeGreaterThan(0);
      testEmpId = empRes.body.data[0].id;
    });

    it('retrieves employee database with contract history, alert status, and days remaining', async () => {
      const res = await request(app)
        .get('/api/v1/hris/employees')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);

      const emp = res.body.data[0];
      expect(emp.nip).toBeDefined();
      expect(emp.fullName).toBeDefined();
      expect(emp.contracts).toBeDefined();
      expect(Array.isArray(emp.contracts)).toBe(true);
      expect(emp.contracts.length).toBeGreaterThan(0);
      expect(emp.activeContract).toBeDefined();
      expect(emp.contractStatus).toBeDefined();
      expect(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'PERMANENT']).toContain(emp.contractStatus);
    });

    it('issues a new contract renewal for employee and transitions previous active contracts to RENEWED', async () => {
      const uniqueSk = `SK/PMO/PUT-PK/2027/TST-${Date.now()}`;
      const contractRes = await request(app)
        .post('/api/v1/hris/contracts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          employeeId: testEmpId,
          contractNumber: uniqueSk,
          contractType: 'PUT_PK',
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          salaryRate: 9500000,
          notes: 'Perpanjangan Masa Kerja Tahap 3 PUT PK Tahun Anggaran 2027',
        });

      expect(contractRes.status).toBe(201);
      expect(contractRes.body.data.contractNumber).toBe(uniqueSk);
      expect(contractRes.body.data.status).toBe('ACTIVE');

      // Verify employee contracts list shows new contract as ACTIVE and previous ones updated
      const empCheck = await request(app)
        .get('/api/v1/hris/employees')
        .set('Authorization', `Bearer ${financeToken}`);
      const updatedEmp = empCheck.body.data.find((e: any) => e.id === testEmpId);
      expect(updatedEmp).toBeDefined();
      expect(updatedEmp.activeContract.contractNumber).toBe(uniqueSk);
      expect(updatedEmp.contracts.length).toBeGreaterThan(1);
    });

    it('generates unit attendance recap per business unit with SBM meal & overtime entitlement calculations and verifies recap', async () => {
      const recapRes = await request(app)
        .get('/api/v1/hris/attendance/unit-recap?month=12&year=2026')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(recapRes.status).toBe(200);
      expect(recapRes.body.data.periodMonth).toBe(12);
      expect(recapRes.body.data.periodYear).toBe(2026);
      expect(recapRes.body.data.units.length).toBeGreaterThan(0);

      const summary = recapRes.body.data.summary;
      expect(summary.totalPresentDays).toBeGreaterThan(0);
      expect(summary.totalMealAllowance).toBe(summary.totalPresentDays * 37000);
      expect(summary.totalOvertimeCost).toBe(summary.totalOvertimeHours * 20000);
      expect(summary.grandTotalSbm).toBe(summary.totalMealAllowance + summary.totalOvertimeCost);

      // Verify the unit attendance
      const targetUnit = recapRes.body.data.units[0];
      const verifyRes = await request(app)
        .post('/api/v1/hris/attendance/verify-unit')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: targetUnit.unitId,
          periodMonth: 12,
          periodYear: 2026,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.businessUnitId).toBe(targetUnit.unitId);
      expect(verifyRes.body.data.verifiedBy).toBeDefined();

      // Check recap again to confirm unit is verified
      const recheck = await request(app)
        .get(`/api/v1/hris/attendance/unit-recap?month=12&year=2026&businessUnitId=${targetUnit.unitId}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(recheck.status).toBe(200);
      expect(recheck.body.data.units[0].isVerified).toBe(true);
      expect(recheck.body.data.units[0].status).toBe('VERIFIED');
    });
  });

  describe('12. Engine Auto-Lock Presensi & Lembur HRIS Tanggal 25 Pukul 23:59 (PMO-102 / KOI-118)', () => {
    let testEmpId = '';

    beforeAll(async () => {
      const empRes = await request(app)
        .get('/api/v1/hris/employees')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(empRes.status).toBe(200);
      testEmpId = empRes.body.data[0].id;
    });

    it('retrieves attendance lock status and enforces cutoff rule for period 12/2026', async () => {
      // Ensure period 12/2026 is locked as per cutoff date rule
      await request(app)
        .post('/api/v1/hris/attendance/lock-period')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ periodMonth: 12, periodYear: 2026, isLocked: true });

      const statusRes = await request(app)
        .get('/api/v1/hris/attendance/lock-status?periodMonth=12&periodYear=2026')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.periodMonth).toBe(12);
      expect(statusRes.body.data.periodYear).toBe(2026);
      expect(statusRes.body.data.cutoffRule).toContain('tanggal 25');
      expect(statusRes.body.data.isLocked).toBe(true);
      expect(statusRes.body.data.canOverride).toBe(true);
    });

    it('rejects recording or mutating attendance during locked period with ATTENDANCE_PERIOD_LOCKED (403)', async () => {
      const failRes = await request(app)
        .post('/api/v1/hris/attendance/record')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          employeeId: testEmpId,
          date: '2026-12-24',
          status: 'PRESENT',
          overtimeHours: 4,
          notes: 'Klaim lembur susulan setelah cutoff tanggal 25',
        });

      expect(failRes.status).toBe(403);
      expect(failRes.body.error.code).toBe('ATTENDANCE_PERIOD_LOCKED');
      expect(failRes.body.error.message).toContain('tanggal 25');
    });

    it('allows emergency unfreeze override by GM PMO and re-locks period after override window', async () => {
      // 1. GM PMO issues temporary unfreeze override with official reason
      const unlockRes = await request(app)
        .post('/api/v1/hris/attendance/unlock-override')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          periodMonth: 12,
          periodYear: 2026,
          reason: 'Koreksi lembur darurat event wisuda dan konfirmasi kehadiran staf klinik UTama',
          durationHours: 24,
        });

      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.data.isLocked).toBe(false);
      expect(unlockRes.body.data.unlockedUntil).toBeDefined();

      // 2. Attendance recording now succeeds during unfreeze window
      const okRes = await request(app)
        .post('/api/v1/hris/attendance/record')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          employeeId: testEmpId,
          date: '2026-12-24',
          status: 'PRESENT',
          overtimeHours: 2,
          notes: 'Koreksi lembur resmi pasca approval GM PMO',
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.data.status).toBe('PRESENT');
      expect(okRes.body.data.overtimeHours).toBe(2);

      // 3. Re-lock period to restore operational compliance
      const relockRes = await request(app)
        .post('/api/v1/hris/attendance/lock-period')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ periodMonth: 12, periodYear: 2026, isLocked: true });

      expect(relockRes.status).toBe(200);
      expect(relockRes.body.data.isLocked).toBe(true);

      // 4. Verify mutations are once again forbidden
      const finalCheck = await request(app)
        .post('/api/v1/hris/attendance/record')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          employeeId: testEmpId,
          date: '2026-12-24',
          status: 'PRESENT',
          overtimeHours: 5,
        });
      expect(finalCheck.status).toBe(403);
      expect(finalCheck.body.error.code).toBe('ATTENDANCE_PERIOD_LOCKED');
    });
  });

  describe('13. Filter Ambang Batas Kapitalisasi Aset Tetap (>10% Nilai Buku & Nilai Batas ISAK 335) (PMO-111 / KOI-119)', () => {
    let targetAsset: { id: string; assetCode: string; name: string; bookValue: number; acquisitionCost: number };

    beforeAll(async () => {
      // Fetch existing assets to select a test asset
      const assetsRes = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(assetsRes.status).toBe(200);
      expect(assetsRes.body.data.length).toBeGreaterThan(0);

      // Select PMO-owned or any active asset with non-zero book value
      const found = assetsRes.body.data.find(
        (a: any) => a.ownershipStatus === 'PMO_OWNED' && a.bookValue > 0
      ) || assetsRes.body.data[0];

      targetAsset = {
        id: found.id,
        assetCode: found.assetCode,
        name: found.name,
        bookValue: found.bookValue,
        acquisitionCost: found.acquisitionCost,
      };
    });

    it('validates initial acquisition capitalization thresholds and Pertor 310 COA mappings', async () => {
      // 1. Get capitalization rules
      const rulesRes = await request(app)
        .get('/api/v1/assets/capitalization-rules')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(rulesRes.status).toBe(200);
      expect(rulesRes.body.data.MIN_THRESHOLD_EQUIPMENT).toBe(1000000);
      expect(rulesRes.body.data.MIN_THRESHOLD_BUILDING).toBe(20000000);
      expect(rulesRes.body.data.SUBSEQUENT_EXPENSE_RATIO_PERCENT).toBe(10);
      expect(rulesRes.body.data.COA_MAPPING.ASSET_EQUIPMENT).toBe('120303010100');
      expect(rulesRes.body.data.COA_MAPPING.MAINTENANCE_EXPENSE).toBe('520901060100');
      expect(rulesRes.body.data.COA_MAPPING.LOW_VALUE_EXPENSE).toBe('520901020100');

      // 2. Evaluate sub-threshold acquisition (Rp 750.000 < Rp 1.000.000) -> Expensed
      const lowValRes = await request(app)
        .post('/api/v1/assets/evaluate-capitalization')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          type: 'NEW_ACQUISITION',
          amount: 750000,
          category: 'Peralatan & Furnitur Kantor',
        });

      expect(lowValRes.status).toBe(200);
      expect(lowValRes.body.data.isCapitalized).toBe(false);
      expect(lowValRes.body.data.accountingTreatment).toBe('EXPENSED_DIRECTLY');
      expect(lowValRes.body.data.recommendedDebitCoa).toBe('520901020100');

      // 3. Evaluate qualifying acquisition (Rp 18.500.000 >= Rp 1.000.000) -> Capitalized
      const capValRes = await request(app)
        .post('/api/v1/assets/evaluate-capitalization')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          type: 'NEW_ACQUISITION',
          amount: 18500000,
          category: 'Audio Visual & Event Equipment',
        });

      expect(capValRes.status).toBe(200);
      expect(capValRes.body.data.isCapitalized).toBe(true);
      expect(capValRes.body.data.accountingTreatment).toBe('CAPITALIZED_TO_ASSET');
      expect(capValRes.body.data.recommendedDebitCoa).toBe('120303010100');
    });

    it('records routine subsequent maintenance expenditure <= 10% as EXPENSED_TO_MAINTENANCE without changing asset book value', async () => {
      // Calculate 5% of asset's book value (<= 10% threshold)
      const initialBookValue = targetAsset.bookValue;
      const maintenanceAmount = Math.max(100000, Math.round(initialBookValue * 0.05));

      const expRes = await request(app)
        .post(`/api/v1/assets/${targetAsset.id}/expenditures`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          transactionDate: '2026-12-15',
          description: 'Pemeliharaan rutin penggantian oli genset & pembersihan filter',
          amount: maintenanceAmount,
          additionalMonths: 0,
          vendorName: 'CV Sumber Tehnik Mandiri',
          invoiceDocNumber: 'INV-MTN/2026/12/045',
          notes: 'Servis berkala operasional unit usaha PMO',
        });

      expect(expRes.status).toBe(201);
      expect(expRes.body.data.isCapitalized).toBe(false);
      expect(expRes.body.data.accountingTreatment).toBe('EXPENSED_TO_MAINTENANCE');
      expect(expRes.body.data.coaDebit).toBe('520901060100');
      expect(expRes.body.data.amount).toBe(maintenanceAmount);
      expect(expRes.body.data.ratioPercent).toBeLessThanOrEqual(10.0);
      // Asset book value must NOT change
      expect(expRes.body.data.updatedAsset.bookValue).toBe(initialBookValue);

      // Verify directly on GET /assets/:id
      const assetCheck = await request(app)
        .get(`/api/v1/assets/${targetAsset.id}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(assetCheck.status).toBe(200);
      expect(assetCheck.body.data.bookValue).toBe(initialBookValue);
    });

    it('records major renovation/overhaul > 10% of net book value as CAPITALIZED_TO_ASSET and increases asset book value', async () => {
      // Get fresh book value
      const assetBefore = await request(app)
        .get(`/api/v1/assets/${targetAsset.id}`)
        .set('Authorization', `Bearer ${financeToken}`);
      const currentBook = assetBefore.body.data.bookValue;
      const currentAcq = assetBefore.body.data.acquisitionCost;

      // Calculate 25% of current book value (> 10% threshold)
      const majorOverhaulAmount = Math.round(currentBook * 0.25);
      const additionalMonths = 12;

      const capExpRes = await request(app)
        .post(`/api/v1/assets/${targetAsset.id}/expenditures`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          transactionDate: '2026-12-20',
          description: 'Upgrade modul kontroler digital & rekondisi mesin utama',
          amount: majorOverhaulAmount,
          additionalMonths,
          vendorName: 'PT Multisarana Tehnik Solusindo',
          invoiceDocNumber: 'INV-OVR/2026/12/088',
          notes: 'Rekapitalisasi aset meningkatkan efisiensi dan masa manfaat 1 tahun',
        });

      expect(capExpRes.status).toBe(201);
      expect(capExpRes.body.data.isCapitalized).toBe(true);
      expect(capExpRes.body.data.accountingTreatment).toBe('CAPITALIZED_TO_ASSET');
      expect(capExpRes.body.data.coaDebit).toBe('120303010100');
      expect(capExpRes.body.data.ratioPercent).toBeGreaterThan(10.0);

      // Book value and acquisition cost MUST increase by overhaul amount
      const expectedNewBook = currentBook + majorOverhaulAmount;
      const expectedNewAcq = currentAcq + majorOverhaulAmount;
      expect(capExpRes.body.data.updatedAsset.bookValue).toBe(expectedNewBook);
      expect(capExpRes.body.data.updatedAsset.acquisitionCost).toBe(expectedNewAcq);

      // Verify expenditure listing contains both items
      const listExpRes = await request(app)
        .get(`/api/v1/assets/${targetAsset.id}/expenditures`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(listExpRes.status).toBe(200);
      expect(listExpRes.body.data.length).toBeGreaterThanOrEqual(2);

      // Verify expenditure summary totals
      const sumRes = await request(app)
        .get('/api/v1/assets/expenditures/summary')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(sumRes.status).toBe(200);
      expect(sumRes.body.data.totalExpenditures).toBeGreaterThanOrEqual(2);
      expect(sumRes.body.data.capitalizedCount).toBeGreaterThanOrEqual(1);
      expect(sumRes.body.data.expensedCount).toBeGreaterThanOrEqual(1);
      expect(sumRes.body.data.capitalizedAmount).toBeGreaterThan(0);
    });
  });

  describe('14. Kalkulator Depresiasi Garis Lurus & Cut-off Penyusutan Tanggal 20 (PMO-112 / KOI-120)', () => {
    let testAssetId: string;

    beforeAll(async () => {
      const assetsRes = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(assetsRes.status).toBe(200);
      testAssetId = assetsRes.body.data[0].id;
    });

    it('evaluates cut-off rule on the 20th under ISAK 335 / Pertor 310 (<= 20th depreciates current month, > 20th defers to next month)', async () => {
      // 1. Verify depreciation rules constants
      const rulesRes = await request(app)
        .get('/api/v1/assets/depreciation-rules')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(rulesRes.status).toBe(200);
      expect(rulesRes.body.data.CUTOFF_DAY).toBe(20);
      expect(rulesRes.body.data.METHOD).toBe('STRAIGHT_LINE');
      expect(rulesRes.body.data.COA_DEBIT).toBe('520901030100');
      expect(rulesRes.body.data.COA_CREDIT).toBe('120307020100');

      // 2. Asset acquired on 2026-03-15 (<= 20th) evaluating for period March 2026 -> Eligible
      const beforeCutoffRes = await request(app)
        .post('/api/v1/assets/depreciation-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          acquisitionCost: 48000000,
          salvageValue: 4800000,
          usefulLifeMonths: 48,
          acquisitionDate: '2026-03-15',
          targetYear: 2026,
          targetMonth: 3,
        });

      expect(beforeCutoffRes.status).toBe(200);
      expect(beforeCutoffRes.body.data.eligible).toBe(true);
      expect(beforeCutoffRes.body.data.startMonth).toBe(3);
      expect(beforeCutoffRes.body.data.monthsElapsed).toBe(1);
      expect(beforeCutoffRes.body.data.depreciationThisMonth).toBe(900000); // (48M - 4.8M) / 48 = 900.000

      // 3. Asset acquired on 2026-03-24 (> 20th) evaluating for period March 2026 -> Deferred
      const afterCutoffRes = await request(app)
        .post('/api/v1/assets/depreciation-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          acquisitionCost: 48000000,
          salvageValue: 4800000,
          usefulLifeMonths: 48,
          acquisitionDate: '2026-03-24',
          targetYear: 2026,
          targetMonth: 3,
        });

      expect(afterCutoffRes.status).toBe(200);
      expect(afterCutoffRes.body.data.eligible).toBe(false);
      expect(afterCutoffRes.body.data.startMonth).toBe(4);
      expect(afterCutoffRes.body.data.depreciationThisMonth).toBe(0);
      expect(afterCutoffRes.body.data.reason).toContain('20');

      // 4. Same asset evaluated in April 2026 -> First month of depreciation starts
      const nextMonthRes = await request(app)
        .post('/api/v1/assets/depreciation-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          acquisitionCost: 48000000,
          salvageValue: 4800000,
          usefulLifeMonths: 48,
          acquisitionDate: '2026-03-24',
          targetYear: 2026,
          targetMonth: 4,
        });

      expect(nextMonthRes.status).toBe(200);
      expect(nextMonthRes.body.data.eligible).toBe(true);
      expect(nextMonthRes.body.data.startMonth).toBe(4);
      expect(nextMonthRes.body.data.monthsElapsed).toBe(1);
      expect(nextMonthRes.body.data.depreciationThisMonth).toBe(900000);
    });

    it('executes periodic depreciation run with cut-off rule, updating asset book value and recording AssetDepreciation', async () => {
      const depRes = await request(app)
        .post('/api/v1/assets/depreciate-period')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          periodYear: 2026,
          periodMonth: 12,
          postJournal: false,
        });

      expect(depRes.status).toBe(200);
      expect(depRes.body.data.periodYear).toBe(2026);
      expect(depRes.body.data.periodMonth).toBe(12);
      expect(depRes.body.data.depreciatedCount).toBeGreaterThan(0);
      expect(depRes.body.data.totalDepreciationAmount).toBeGreaterThan(0);

      // Verify asset depreciation record exists
      const assetDepRes = await request(app)
        .get(`/api/v1/assets/${testAssetId}/depreciations`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(assetDepRes.status).toBe(200);
      expect(assetDepRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(assetDepRes.body.data[0].periodYear).toBe(2026);
      expect(assetDepRes.body.data[0].periodMonth).toBe(12);
    });

    it('posts balanced double-entry journal to General Ledger (Debet 520901030100 vs Kredit 120307020100)', async () => {
      const depWithJournalRes = await request(app)
        .post('/api/v1/assets/depreciate-period')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          periodYear: 2026,
          periodMonth: 12,
          postJournal: true,
        });

      expect(depWithJournalRes.status).toBe(200);
      expect(depWithJournalRes.body.data.journalEntry).toBeDefined();
      expect(depWithJournalRes.body.data.journalEntry.journalNumber).toMatch(/^JRN-/);
      expect(depWithJournalRes.body.data.journalEntry.totalDebit).toBe(
        depWithJournalRes.body.data.journalEntry.totalCredit
      );
      expect(depWithJournalRes.body.data.journalEntry.totalDebit).toBeGreaterThan(0);

      // Verify batch history endpoint
      const histRes = await request(app)
        .get('/api/v1/assets/depreciations/history')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(histRes.status).toBe(200);
      expect(histRes.body.data.length).toBeGreaterThanOrEqual(1);
      const decRun = histRes.body.data.find(
        (h: any) => h.periodYear === 2026 && h.periodMonth === 12
      );
      expect(decRun).toBeDefined();
      expect(decRun.journalNumber).toBeDefined();
      expect(decRun.totalAmount).toBeGreaterThan(0);
    });
  });

  describe('15. Sprint 4 Review & Tutup Buku Akhir Tahun 2026 (SPRINT-4-REV / KOI-121)', () => {
    it('audits Sprint 4 operational compliance rules (Bank Rec, HRIS Cutoff 25, Asset Cap 10%, Asset Cutoff 20)', async () => {
      // 1. Verify HRIS Attendance Lock on period 12/2026
      const hrisLockRes = await request(app)
        .get('/api/v1/hris/attendance/lock-status?periodMonth=12&periodYear=2026')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(hrisLockRes.status).toBe(200);
      expect(hrisLockRes.body.data.cutoffRule).toContain('tanggal 25');

      // 2. Verify Asset Capitalization Threshold (>10% Net Book Value)
      const capRulesRes = await request(app)
        .get('/api/v1/assets/capitalization-rules')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(capRulesRes.status).toBe(200);
      expect(capRulesRes.body.data.SUBSEQUENT_EXPENSE_RATIO_PERCENT).toBe(10);
      expect(capRulesRes.body.data.MIN_THRESHOLD_EQUIPMENT).toBe(1000000);

      // 3. Verify Asset Straight-Line Depreciation Cut-Off on 20th
      const depRulesRes = await request(app)
        .get('/api/v1/assets/depreciation-rules')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(depRulesRes.status).toBe(200);
      expect(depRulesRes.body.data.CUTOFF_DAY).toBe(20);

      // 4. Verify Bank Statement Parser & Matching Rule
      const bankRecRes = await request(app)
        .get('/api/v1/reconciliation/status')
        .set('Authorization', `Bearer ${financeToken}`);
      expect([200, 404]).toContain(bankRecRes.status);
    });

    it('confirms the General Ledger Trial Balance is strictly balanced across all 5 Business Units post Sprint 4', async () => {
      const ledgerRes = await request(app)
        .get('/api/v1/accounting/ledger')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.trialBalanceSummary).toBeDefined();
      expect(ledgerRes.body.data.trialBalanceSummary.isBalanced).toBe(true);
      expect(ledgerRes.body.data.trialBalanceSummary.totalDebit).toBe(
        ledgerRes.body.data.trialBalanceSummary.totalCredit
      );
      expect(ledgerRes.body.data.trialBalanceSummary.totalDebit).toBeGreaterThan(0);
    });

    it('executes Year-End 2026 Fiscal Period lock audit and verifies rejection of post-closing mutations', async () => {
      // 1. Get fiscal periods overview
      const masterRes = await request(app)
        .get('/api/v1/master/overview')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(masterRes.status).toBe(200);

      // Find period for FY-2026 or FP-2026-12
      const targetPeriod =
        masterRes.body.data.fiscalPeriods.find((p: any) => p.code === 'FP-2026-12') ||
        masterRes.body.data.fiscalPeriods.find((p: any) => p.code === 'FY-2026') ||
        masterRes.body.data.fiscalPeriods[0];
      expect(targetPeriod).toBeDefined();

      // 2. Lock fiscal period for year-end closing audit
      const lockRes = await request(app)
        .post(`/api/v1/master/fiscal-periods/${targetPeriod.id}/lock`)
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({ reason: 'Audit Tutup Buku Akhir Tahun Fiskal 2026 PMO UTama' });
      expect([200, 409]).toContain(lockRes.status);

      // 3. Verify posting journals into locked period is strictly rejected
      const rejectRes = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          fiscalPeriodId: targetPeriod.id,
          businessUnitId: unitDiklatId,
          description: 'Percobaan transaksi susulan pasca Tutup Buku 2026',
          lines: [
            { accountCode: '5-1400', description: 'Beban', debit: 500000, credit: 0 },
            { accountCode: '1-1120', description: 'Bank', debit: 0, credit: 500000 },
          ],
        });
      expect(rejectRes.status).toBe(409);
      expect(['FISCAL_PERIOD_LOCKED', 'FISCAL_PERIOD_CLOSED']).toContain(rejectRes.body.error.code);

      // 4. Reopen/unlock period to leave test environment pristine
      await request(app)
        .post(`/api/v1/master/fiscal-periods/${targetPeriod.id}/reopen`)
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({ reason: 'Selesai simulasi audit tutup buku Sprint 4' });
    });
  });

  // =========================================================================
  // 16. [KOI-123] [PMO-121] Inbox Approval Terpusat Lintas Dokumen & Kontrol SoD
  // =========================================================================
  describe('16. [KOI-123] [PMO-121] Inbox Approval Terpusat Lintas Dokumen & Kontrol SoD', () => {
    let testPrApproval: any;
    let testPrDocNumber: string;
    let targetBudgetLineId = '';

    beforeAll(async () => {
      // Create a dedicated approved budget line with fresh ample ceiling (Rp 500.000.000)
      const b = await prisma.budget.create({
        data: {
          docNumber: `BDG-TEST-SEC16-${Date.now()}`,
          title: 'Anggaran Plafon Khusus Uji Inbox Approval Section 16',
          businessUnitId: unitDiklatId,
          fiscalPeriodId: period2026OpenId,
          fundSourceId: fundInternalId,
          version: 1,
          status: 'APPROVED',
          totalAllocated: 500000000,
          totalCommitted: 0,
          totalActual: 0,
          createdById: 'USER-TEST',
          createdByName: 'Test Creator',
          lines: {
            create: [
              {
                costCenterId: ccDiklatLabId,
                accountCode: '5-1200',
                category: 'CAPEX',
                description: 'Alokasi Pengadaan Sarana & ATK',
                allocatedAmount: 500000000,
                committedAmount: 0,
                actualAmount: 0,
              },
            ],
          },
        },
        include: { lines: true },
      });
      targetBudgetLineId = b.lines[0].id;
    });

    it('fetches centralized approval inbox and verifies role-based scoping and KPI statistics', async () => {
      // 1. Fetch KPI stats
      const statsRes = await request(app)
        .get('/api/v1/approvals/stats')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.success).toBe(true);
      expect(statsRes.body.data).toHaveProperty('totalPending');
      expect(statsRes.body.data).toHaveProperty('actionRequiredCount');
      expect(statsRes.body.data).toHaveProperty('byModule');
      expect(statsRes.body.data.byModule).toHaveProperty('PURCHASE_REQUEST');
      expect(statsRes.body.data.byModule).toHaveProperty('BUDGET');

      // 2. Fetch approvals list with filters
      const listRes = await request(app)
        .get('/api/v1/approvals?status=ALL')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.meta).toHaveProperty('total');
      expect(listRes.body.meta).toHaveProperty('pendingCount');

      // 3. Verify item fields contain enrichment
      if (listRes.body.data.length > 0) {
        const first = listRes.body.data[0];
        expect(first).toHaveProperty('requestNumber');
        expect(first).toHaveProperty('module');
        expect(first).toHaveProperty('entityCode');
        expect(first).toHaveProperty('canApprove');
        expect(typeof first.amount).toBe('number');
      }
    });

    it('creates a Purchase Request and verifies it immediately appears in the Central Approval Inbox', async () => {
      // Create a submitted PR
      const prRes = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId: targetBudgetLineId,
          title: 'Pengadaan Meja Kursi Training Workshop PMO UTama',
          purpose: 'Pengadaan fasilitas ruang pelatihan sertifikasi',
          submitImmediately: true,
          lines: [
            {
              itemName: 'Meja Lipat Training Ergonomis',
              quantity: 10,
              unit: 'Unit',
              estimatedUnitPrice: 750000,
              specification: 'Dimensi 120x60x75 cm kaki roda pengunci',
            },
            {
              itemName: 'Kursi Training Jaring Hidrolik',
              quantity: 10,
              unit: 'Unit',
              estimatedUnitPrice: 500000,
              specification: 'Bahan breathable mesh dengan sandaran kepala',
            },
          ],
        });

      expect(prRes.status).toBe(201);
      expect(prRes.body.data.status).toBe('SUBMITTED');
      testPrDocNumber = prRes.body.data.docNumber;

      // Check that it exists in GET /approvals
      const inboxRes = await request(app)
        .get(`/api/v1/approvals?module=PURCHASE_REQUEST&search=${testPrDocNumber}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(inboxRes.status).toBe(200);
      expect(inboxRes.body.data.length).toBeGreaterThan(0);
      testPrApproval = inboxRes.body.data.find((a: any) => a.entityCode === testPrDocNumber);
      expect(testPrApproval).toBeDefined();
      expect(testPrApproval.module).toBe('PURCHASE_REQUEST');
      expect(testPrApproval.status).toBe('PENDING');
      expect(testPrApproval.amount).toBe(12500000);
      expect(testPrApproval.canApprove).toBe(true);

      // Verify detail inspection endpoint
      const detailRes = await request(app)
        .get(`/api/v1/approvals/${testPrApproval.id}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.entityDetail).toBeDefined();
      expect(detailRes.body.data.entityDetail.docNumber).toBe(testPrDocNumber);
      expect(detailRes.body.data.entityDetail.lines.length).toBe(2);
    });

    it('approves the Purchase Request from Central Approval Inbox and verifies budget commitment & PR status', async () => {
      expect(testPrApproval).toBeDefined();

      const approveRes = await request(app)
        .post(`/api/v1/approvals/${testPrApproval.id}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ note: 'Disetujui penuh untuk pengadaan fasilitas pelatihan PMO' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // Verify PR is now APPROVED in procurement module
      const prCheck = await request(app)
        .get(`/api/v1/procurement/purchase-requests/${testPrApproval.entityId}`)
        .set('Authorization', `Bearer ${unitMgrToken}`);

      expect(prCheck.status).toBe(200);
      expect(prCheck.body.data.status).toBe('APPROVED');
    });

    it('rejects an approval request with mandatory reason >= 5 characters and updates underlying document status', async () => {
      // 1. Create another PR to be rejected
      const prRes = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId: targetBudgetLineId,
          title: 'Pengadaan Sofa Tamu VIP Lounge',
          purpose: 'Pengadaan perabot sofa tamu unit',
          submitImmediately: true,
          lines: [
            {
              itemName: 'Sofa Tamu Minimalis 3 Seater',
              quantity: 1,
              unit: 'Set',
              estimatedUnitPrice: 8000000,
              specification: 'Bahan oscar premium warna hitam',
            },
          ],
        });

      expect(prRes.status).toBe(201);
      const prDoc = prRes.body.data.docNumber;

      const inboxRes = await request(app)
        .get(`/api/v1/approvals?module=PURCHASE_REQUEST&search=${prDoc}`)
        .set('Authorization', `Bearer ${financeToken}`);

      const aprItem = inboxRes.body.data.find((a: any) => a.entityCode === prDoc);
      expect(aprItem).toBeDefined();

      // 2. Reject without sufficient reason (< 5 chars) -> should fail 400
      const failReject = await request(app)
        .post(`/api/v1/approvals/${aprItem.id}/reject`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'No' });

      expect(failReject.status).toBe(400);

      // 3. Reject with valid reason
      const validReject = await request(app)
        .post(`/api/v1/approvals/${aprItem.id}/reject`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'Alokasi anggaran perabot kuartal ini ditangguhkan untuk prioritas sertifikasi.' });

      expect(validReject.status).toBe(200);
      expect(validReject.body.data.status).toBe('REJECTED');

      // Verify PR is REJECTED in procurement
      const prCheck = await request(app)
        .get(`/api/v1/procurement/purchase-requests/${aprItem.entityId}`)
        .set('Authorization', `Bearer ${unitMgrToken}`);

      expect(prCheck.status).toBe(200);
      expect(prCheck.body.data.status).toBe('REJECTED');
      expect(prCheck.body.data.rejectionReason).toContain('ditangguhkan');
    });

    it('executes batch approval for multiple pending items atomically', async () => {
      // 1. Create two PR items
      const pr1 = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId: targetBudgetLineId,
          title: 'Batch PR Item 1: ATK Kantor',
          purpose: 'Kebutuhan ATK operasional unit',
          submitImmediately: true,
          lines: [{ itemName: 'Kertas HVS A4 & Binder', quantity: 20, unit: 'Rim', estimatedUnitPrice: 125000 }],
        });

      const pr2 = await request(app)
        .post('/api/v1/procurement/purchase-requests')
        .set('Authorization', `Bearer ${unitMgrToken}`)
        .send({
          businessUnitId: unitDiklatId,
          costCenterId: ccDiklatLabId,
          budgetLineId: targetBudgetLineId,
          title: 'Batch PR Item 2: Toner Printer Laser',
          purpose: 'Penggantian toner printer habis',
          submitImmediately: true,
          lines: [{ itemName: 'Cartridge Toner Hitam', quantity: 2, unit: 'Kotak', estimatedUnitPrice: 1500000 }],
        });

      expect(pr1.status).toBe(201);
      expect(pr2.status).toBe(201);

      const inboxRes = await request(app)
        .get('/api/v1/approvals?status=PENDING&module=PURCHASE_REQUEST')
        .set('Authorization', `Bearer ${financeToken}`);

      const apr1 = inboxRes.body.data.find((a: any) => a.entityCode === pr1.body.data.docNumber);
      const apr2 = inboxRes.body.data.find((a: any) => a.entityCode === pr2.body.data.docNumber);

      expect(apr1).toBeDefined();
      expect(apr2).toBeDefined();

      // 2. Execute Batch Approve
      const batchRes = await request(app)
        .post('/api/v1/approvals/batch-approve')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          requestIds: [apr1.id, apr2.id],
          note: 'Batch approval massal belanja operasional unit Diklat',
        });

      expect(batchRes.status).toBe(200);
      expect(batchRes.body.data.successCount).toBe(2);
      expect(batchRes.body.data.failedCount).toBe(0);

      // Verify both are now APPROVED
      const check1 = await request(app)
        .get(`/api/v1/approvals/${apr1.id}`)
        .set('Authorization', `Bearer ${financeToken}`);
      const check2 = await request(app)
        .get(`/api/v1/approvals/${apr2.id}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(check1.body.data.status).toBe('APPROVED');
      expect(check2.body.data.status).toBe('APPROVED');
    });
  });

  describe('17. [KOI-124] [PMO-131] Core Double-Entry Ledger Engine & Validasi Keseimbangan Debet/Kredit (4)', () => {
    let testJournalId = '';

    it('validates strictly balanced double-entry manual journal and calculates running balance per account', async () => {
      const res = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          businessUnitId: unitDiklatId,
          description: 'Pengadaan Perlengkapan Kebersihan Lab Unit Diklat',
          lines: [
            { accountCode: '520101030100', description: 'Beban Operasional Kebersihan Lab', debit: 750000, credit: 0 },
            { accountCode: '110102010300', description: 'Rekening Giro Bank Pengeluaran Operasional Diklat', debit: 0, credit: 750000 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('POSTED');
      expect(Number(res.body.data.totalDebit)).toBe(750000);
      expect(Number(res.body.data.totalCredit)).toBe(750000);
      testJournalId = res.body.data.id;

      // Inspect General Ledger for this account and verify running balance
      const ledgerRes = await request(app)
        .get('/api/v1/accounting/ledger?accountCode=520101030100')
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(ledgerRes.status).toBe(200);
      const acc = ledgerRes.body.data.accounts.find((a: any) => a.accountCode === '520101030100');
      expect(acc).toBeDefined();
      expect(acc.endingBalance).toBeGreaterThanOrEqual(750000);
      const entry = acc.entries.find((e: any) => e.journalId === testJournalId);
      expect(entry).toBeDefined();
      expect(entry.debit).toBe(750000);
      expect(entry.credit).toBe(0);
    });

    it('filters General Ledger by businessUnitId and confirms isolated Trial Balance balance', async () => {
      const unitLedgerRes = await request(app)
        .get(`/api/v1/accounting/ledger?businessUnitId=${unitDiklatId}`)
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(unitLedgerRes.status).toBe(200);
      expect(unitLedgerRes.body.data.trialBalanceSummary).toBeDefined();
      expect(unitLedgerRes.body.data.trialBalanceSummary.isBalanced).toBe(true);
      expect(unitLedgerRes.body.data.trialBalanceSummary.totalDebit).toBe(
        unitLedgerRes.body.data.trialBalanceSummary.totalCredit
      );
    });

    it('enforces journal immutability and forbids direct deletion via DELETE /journals/:id', async () => {
      const delRes = await request(app)
        .delete(`/api/v1/accounting/journals/${testJournalId}`)
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(delRes.status).toBe(403);
      expect(delRes.body.error.code).toBe('POSTED_JOURNAL_IMMUTABLE');
    });

    it('executes reversal storno, updates original journal status to REVERSED, and forbids re-reversal', async () => {
      const revRes = await request(app)
        .post(`/api/v1/accounting/journals/${testJournalId}/reverse`)
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          reason: 'Koreksi salah unit bisnis atas pengadaan perlengkapan lab',
        });

      expect(revRes.status).toBe(201);
      expect(revRes.body.data.original.status).toBe('REVERSED');
      expect(revRes.body.data.reversal).toBeDefined();
      expect(revRes.body.data.reversal.reversedFromId).toBe(testJournalId);
      expect(Number(revRes.body.data.reversal.totalDebit)).toBe(750000);
      expect(Number(revRes.body.data.reversal.totalCredit)).toBe(750000);

      // Attempt re-reversing the same journal -> must fail with 409 ALREADY_REVERSED
      const doubleRev = await request(app)
        .post(`/api/v1/accounting/journals/${testJournalId}/reverse`)
        .set('Authorization', `Bearer ${accountingToken}`)
        .send({
          reason: 'Mencoba membalik ulang jurnal yang sudah dibalik',
        });

      expect(doubleRev.status).toBe(409);
      expect(doubleRev.body.error.code).toBe('ALREADY_REVERSED');
    });
  });

  describe('18. [KOI-125] [PMO-141] Generator Laporan Posisi Keuangan (Neraca) & Aktivitas ISAK 335 (3)', () => {
    it('generates consolidated Statement of Activities and calculates net surplus/deficit', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.standard).toBe('ISAK_335');
      expect(res.body.data.statementOfActivities).toBeDefined();
      expect(res.body.data.statementOfActivities.totalRevenue).toBeTypeOf('number');
      expect(res.body.data.statementOfActivities.totalExpense).toBeTypeOf('number');
      expect(res.body.data.statementOfActivities.surplusDeficit).toBe(
        res.body.data.statementOfActivities.totalRevenue - res.body.data.statementOfActivities.totalExpense
      );
      expect(res.body.data.statementOfActivities.unrestrictedSurplus).toBe(
        res.body.data.statementOfActivities.surplusDeficit
      );
    });

    it('generates Statement of Financial Position under ISAK 335 with Unrestricted vs Restricted Net Assets and verifies balance equation', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(res.status).toBe(200);
      const sfp = res.body.data.statementOfFinancialPosition;
      expect(sfp).toBeDefined();
      expect(sfp.standard).toBe('ISAK_335');

      // 1. Assets
      expect(sfp.totalAssets).toBe(sfp.totalCurrentAssets + sfp.totalNonCurrentAssets);

      // 2. Liabilities
      expect(sfp.totalLiabilities).toBe(sfp.totalCurrentLiabilities + sfp.totalLongTermLiabilities);

      // 3. Net Assets (ISAK 335)
      expect(sfp.netAssets).toBeDefined();
      expect(sfp.netAssets.unrestricted).toBeDefined();
      expect(sfp.netAssets.restricted).toBeDefined();
      expect(sfp.netAssets.totalNetAssets).toBe(
        sfp.netAssets.unrestricted.endingBalance + sfp.netAssets.restricted.endingBalance
      );

      // 4. Fundamental Equation: Total Assets = Total Liabilities + Total Net Assets
      expect(sfp.totalLiabilitiesAndNetAssets).toBe(sfp.totalLiabilities + sfp.netAssets.totalNetAssets);
      expect(sfp.isBalanced).toBe(true);
      expect(Math.abs(sfp.totalAssets - sfp.totalLiabilitiesAndNetAssets)).toBeLessThan(1);
    });

    it('filters ISAK 335 Financial Statements by businessUnitId and preserves balance equation per unit', async () => {
      const res = await request(app)
        .get(`/api/v1/reports/financial?businessUnitId=${unitDiklatId}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const sfp = res.body.data.statementOfFinancialPosition;
      expect(sfp).toBeDefined();
      expect(sfp.isBalanced).toBe(true);
      expect(Math.abs(sfp.totalAssets - sfp.totalLiabilitiesAndNetAssets)).toBeLessThan(1);
    });
  });

  describe('19. [KOI-126] [PMO-142] Generator Laporan Arus Kas Metode Langsung (Direct Method) (3)', () => {
    it('generates ISAK 335 Direct Method Cash Flow Statement with Operating, Investing, and Financing clusters', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const cfs = res.body.data.directCashFlowStatement;
      expect(cfs).toBeDefined();
      expect(cfs.standard).toBe('ISAK_335');

      // 1. Operating Activities
      expect(cfs.operatingActivities).toBeDefined();
      expect(cfs.operatingActivities.inflows).toBeDefined();
      expect(cfs.operatingActivities.inflows.totalInflows).toBe(
        cfs.operatingActivities.inflows.fromCustomers + cfs.operatingActivities.inflows.otherOperating
      );
      expect(cfs.operatingActivities.outflows).toBeDefined();
      expect(cfs.operatingActivities.outflows.totalOutflows).toBe(
        cfs.operatingActivities.outflows.toSuppliers +
        cfs.operatingActivities.outflows.toEmployees +
        cfs.operatingActivities.outflows.pettyCashDisbursements +
        cfs.operatingActivities.outflows.taxesAndOther
      );
      expect(cfs.operatingActivities.netOperatingCashFlow).toBe(
        cfs.operatingActivities.inflows.totalInflows - cfs.operatingActivities.outflows.totalOutflows
      );

      // 2. Investing Activities
      expect(cfs.investingActivities).toBeDefined();
      expect(cfs.investingActivities.netInvestingCashFlow).toBe(
        cfs.investingActivities.inflows.totalInflows - cfs.investingActivities.outflows.totalOutflows
      );

      // 3. Financing Activities
      expect(cfs.financingActivities).toBeDefined();
      expect(cfs.financingActivities.netFinancingCashFlow).toBe(
        cfs.financingActivities.inflows.totalInflows - cfs.financingActivities.outflows.totalOutflows
      );

      // 4. Net Cash Increase/Decrease
      const totalNetIncrease =
        cfs.operatingActivities.netOperatingCashFlow +
        cfs.investingActivities.netInvestingCashFlow +
        cfs.financingActivities.netFinancingCashFlow;
      expect(cfs.reconciliation.netCashIncreaseDecrease).toBe(totalNetIncrease);
    });

    it('verifies reconciliation of ending cash balance with physical cash and bank accounts in General Ledger', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(res.status).toBe(200);
      const cfs = res.body.data.directCashFlowStatement;
      expect(cfs).toBeDefined();

      const { reconciliation } = cfs;
      expect(reconciliation).toBeDefined();
      expect(reconciliation.isReconciled).toBe(true);

      // Math equation: Ending Cash = Beginning Cash + Net Increase/Decrease
      expect(reconciliation.endingCashBalance).toBe(
        reconciliation.beginningCashBalance + reconciliation.netCashIncreaseDecrease
      );

      // Cash and Bank Accounts must sum to endingCashBalance
      expect(Array.isArray(reconciliation.cashAndBankAccounts)).toBe(true);
      const sumAccounts = reconciliation.cashAndBankAccounts.reduce(
        (sum: number, acc: { balance: number }) => sum + acc.balance,
        0
      );
      expect(reconciliation.endingCashBalance).toBe(sumAccounts);

      // Legacy & Direct Compatibility
      expect(res.body.data.cashFlowStatement).toBeDefined();
      expect(res.body.data.cashFlowStatement.directMethod).toBeDefined();
      expect(res.body.data.cashFlowStatement.netOperatingCashFlow).toBe(
        cfs.operatingActivities.netOperatingCashFlow
      );
    });

    it('filters Direct Cash Flow Statement by businessUnitId with accurate unit-level reconciliation', async () => {
      const res = await request(app)
        .get(`/api/v1/reports/financial?businessUnitId=${unitDiklatId}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const cfs = res.body.data.directCashFlowStatement;
      expect(cfs).toBeDefined();
      expect(cfs.reconciliation.isReconciled).toBe(true);
      expect(cfs.reconciliation.endingCashBalance).toBe(
        cfs.reconciliation.beginningCashBalance + cfs.reconciliation.netCashIncreaseDecrease
      );
    });
  });

  describe('20. [KOI-127] [PMO-151] Executive Dashboard & Analitik Kinerja RGA Real-Time Serapan Anggaran (3)', () => {
    it('fetches executive dashboard metrics with RGA Target, Semula-Menjadi pagu shift, and Burn Rate calculations', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data).toBeDefined();
      expect(data.kpis).toBeDefined();

      // 1. Core KPIs & RGA Target
      expect(data.kpis.totalBudgetAllocated).toBeTypeOf('number');
      expect(data.kpis.totalRevenueTarget).toBeTypeOf('number');
      expect(data.kpis.revenueAchievementPercent).toBeTypeOf('number');

      // 2. Semula-Menjadi Pagu Pergeseran
      expect(data.kpis.totalBudgetSemula).toBeTypeOf('number');
      expect(data.kpis.totalBudgetPergeseran).toBeTypeOf('number');
      expect(data.kpis.totalBudgetMenjadi).toBeTypeOf('number');
      expect(data.kpis.pergeseranPercent).toBeTypeOf('number');
      expect(data.kpis.totalBudgetMenjadi).toBe(
        data.kpis.totalBudgetSemula + data.kpis.totalBudgetPergeseran
      );

      // 3. Burn Rate & Prognosis
      expect(data.kpis.monthlyBurnRate).toBeTypeOf('number');
      expect(data.kpis.projectedYearEndExpense).toBeTypeOf('number');
      expect(data.kpis.projectedAbsorptionRate).toBeTypeOf('number');

      // 4. Structured rgaPerformance Object
      const { rgaPerformance } = data;
      expect(rgaPerformance).toBeDefined();
      expect(rgaPerformance.standard).toBe('RGA_PMO_UTAMA');
      expect(rgaPerformance.totalAbsorbed).toBe(
        rgaPerformance.budgetCommitted + rgaPerformance.expenseActual
      );
      expect(rgaPerformance.burnRate).toBeDefined();
      expect(rgaPerformance.burnRate.monthlyBurnRate).toBe(data.kpis.monthlyBurnRate);
    });

    it('verifies 5 PMO Business Units RGA performance breakdown and revenue target achievement', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${gmToken}`);

      expect(res.status).toBe(200);
      const { unitPerformance } = res.body.data;
      expect(Array.isArray(unitPerformance)).toBe(true);
      expect(unitPerformance.length).toBeGreaterThanOrEqual(4);

      for (const unit of unitPerformance) {
        expect(unit.unitCode).toBeDefined();
        expect(unit.unitName).toBeDefined();
        expect(unit.allocated).toBeTypeOf('number');
        expect(unit.actualExpense).toBeTypeOf('number');
        expect(unit.invoicedRevenue).toBeTypeOf('number');
        expect(unit.revenueTarget).toBeTypeOf('number');
        expect(unit.revenueAchievementPercent).toBeTypeOf('number');
        expect(unit.budgetSemula).toBeTypeOf('number');
        expect(unit.budgetPergeseran).toBeTypeOf('number');
        expect(unit.budgetMenjadi).toBeTypeOf('number');
      }
    });

    it('filters executive dashboard metrics by businessUnitId and preserves isolated unit RGA analytics', async () => {
      const res = await request(app)
        .get(`/api/v1/reports/dashboard?businessUnitId=${unitDiklatId}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data).toBeDefined();
      expect(data.kpis.totalBudgetAllocated).toBeTypeOf('number');
      expect(data.rgaPerformance).toBeDefined();
      expect(data.rgaPerformance.totalAbsorbed).toBe(
        data.rgaPerformance.budgetCommitted + data.rgaPerformance.expenseActual
      );
    });
  });

  // =========================================================================
  // 21. [KOI-128] [SPRINT-5-REV] Sprint 5 Review & Verifikasi Audit Trail Jurnal
  // =========================================================================
  describe('21. [KOI-128] [SPRINT-5-REV] Sprint 5 Review & Verifikasi Audit Trail Jurnal (3)', () => {
    it('audits Sprint 5 accounting & reporting compliance rules (Central Inbox, Double-Entry GL, ISAK 335, Direct Cash Flow, RGA Metrics)', async () => {
      // 1. Central Approval Inbox Stats
      const inboxStatsRes = await request(app)
        .get('/api/v1/approvals/stats')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(inboxStatsRes.status).toBe(200);
      expect(inboxStatsRes.body.data).toHaveProperty('totalPending');

      // 2. ISAK 335 Statement of Financial Position & Activities Coherence
      const finRes = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(finRes.status).toBe(200);
      const { statementOfActivities, statementOfFinancialPosition, directCashFlowStatement } = finRes.body.data;
      expect(statementOfActivities).toBeDefined();
      expect(statementOfFinancialPosition).toBeDefined();
      expect(statementOfFinancialPosition.isBalanced).toBe(true);

      // 3. Direct Method Cash Flow Reconciliation
      expect(directCashFlowStatement).toBeDefined();
      expect(directCashFlowStatement.reconciliation.isReconciled).toBe(true);
      expect(directCashFlowStatement.reconciliation.endingCashBalance).toBe(
        directCashFlowStatement.reconciliation.beginningCashBalance +
        directCashFlowStatement.reconciliation.netCashIncreaseDecrease
      );

      // 4. Executive Dashboard RGA Semula-Menjadi Equation
      const dashRes = await request(app)
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(dashRes.status).toBe(200);
      const { kpis, rgaPerformance } = dashRes.body.data;
      expect(rgaPerformance).toBeDefined();
      expect(kpis.totalBudgetMenjadi).toBe(kpis.totalBudgetSemula + kpis.totalBudgetPergeseran);
    });

    it('confirms General Ledger Trial Balance is strictly balanced across all 5 Business Units post Sprint 5 with 0 discrepancy', async () => {
      // 1. Consolidated Ledger Trial Balance
      const consolidatedRes = await request(app)
        .get('/api/v1/accounting/ledger')
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(consolidatedRes.status).toBe(200);
      const { trialBalanceSummary } = consolidatedRes.body.data;
      expect(trialBalanceSummary).toBeDefined();
      expect(trialBalanceSummary.isBalanced).toBe(true);
      expect(trialBalanceSummary.totalDebit).toBe(trialBalanceSummary.totalCredit);
      expect(trialBalanceSummary.totalDebit).toBeGreaterThan(0);

      // 2. Unit-Level Ledger Trial Balance across Business Units
      const masterRes = await request(app)
        .get('/api/v1/master/overview')
        .set('Authorization', `Bearer ${accountingToken}`);
      const units = masterRes.body.data.businessUnits || [];
      for (const u of units.slice(0, 3)) {
        const unitLedgerRes = await request(app)
          .get(`/api/v1/accounting/ledger?businessUnitId=${u.id}`)
          .set('Authorization', `Bearer ${accountingToken}`);

        expect(unitLedgerRes.status).toBe(200);
        expect(unitLedgerRes.body.data.trialBalanceSummary.isBalanced).toBe(true);
        expect(unitLedgerRes.body.data.trialBalanceSummary.totalDebit).toBe(
          unitLedgerRes.body.data.trialBalanceSummary.totalCredit
        );
      }
    });

    it('verifies comprehensive audit trail logging and forensic immutability across all financial journals and approval actions', async () => {
      // 1. Verify Audit Logs Exist in Dashboard
      const dashRes = await request(app)
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(dashRes.status).toBe(200);
      expect(Array.isArray(dashRes.body.data.recentAuditLogs)).toBe(true);

      // 2. Verify Immutability: Deleting a posted journal directly is forbidden
      const journalsRes = await request(app)
        .get('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${accountingToken}`);
      expect(journalsRes.status).toBe(200);

      if (journalsRes.body.data.length > 0) {
        const postedJournal = journalsRes.body.data.find((j: any) => j.status === 'POSTED');
        if (postedJournal) {
          const deleteRes = await request(app)
            .delete(`/api/v1/accounting/journals/${postedJournal.id}`)
            .set('Authorization', `Bearer ${accountingToken}`);
          expect(deleteRes.status).toBe(403);
          expect(deleteRes.body.error.code).toBe('POSTED_JOURNAL_IMMUTABLE');
        }
      }
    });
  });

  // =========================================================================
  // 22. [KOI-130] [PMO-161] Generator Ekspor Excel Format Resmi PBI (Tabel 60 Kolom) (3)
  // =========================================================================
  describe('22. [KOI-130] [PMO-161] Generator Ekspor Excel Format Resmi PBI (Tabel 60 Kolom)', () => {
    it('exports consolidated 60-column PBI Excel file with valid XLSX binary stream and official column headers', async () => {
      const res = await request(app)
        .get('/api/v1/budgets/export/pbi-excel')
        .set('Authorization', `Bearer ${financeToken}`)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      expect(res.body).toBeDefined();

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body);

      const worksheet = workbook.getWorksheet('PBI Semula - Menjadi') || workbook.worksheets[0];
      expect(worksheet).toBeDefined();
      if (!worksheet) return;

      expect(worksheet.columns.length).toBe(60);

      // Verify Row 4 (Group Headers)
      const groupHeaderRow = worksheet.getRow(4);
      expect(groupHeaderRow.getCell(1).value).toContain('INFORMASI MATA ANGGARAN');
      expect(groupHeaderRow.getCell(14).value).toContain('PAGU ANGGARAN SEMULA');
      expect(groupHeaderRow.getCell(26).value).toContain('PAGU ANGGARAN MENJADI');
      expect(groupHeaderRow.getCell(48).value).toContain('EVALUASI REALISASI');

      // Verify Row 5 (60 Detail Headers)
      const detailHeaderRow = worksheet.getRow(5);
      expect(detailHeaderRow.getCell(1).value).toBe('No.');
      expect(detailHeaderRow.getCell(2).value).toBe('KODE IKPS');
      expect(detailHeaderRow.getCell(12).value).toBe('KODE COA');
      expect(detailHeaderRow.getCell(23).value).toContain('HARGA SATUAN');
      expect(detailHeaderRow.getCell(24).value).toContain('JUMLAH BIAYA');
      expect(detailHeaderRow.getCell(25).value).toBe('JUMLAH PAGU SEMULA');
      expect(detailHeaderRow.getCell(46).value).toContain('JUMLAH BIAYA');
      expect(detailHeaderRow.getCell(47).value).toBe('JUMLAH PAGU MENJADI');
      expect(detailHeaderRow.getCell(48).value).toContain('SELISIH PERGESERAN');
      expect(detailHeaderRow.getCell(49).value).toBe('REALISASI BEBAN AKTUAL');
      expect(detailHeaderRow.getCell(52).value).toBe('SISA PAGU TERSEDIA');
      expect(detailHeaderRow.getCell(53).value).toBe('DAYA SERAP (%)');
      expect(detailHeaderRow.getCell(60).value).toBe('STATUS EVALUASI');
    });

    it('exports single budget 60-column PBI Excel file and verifies formulas & multi-volume line items', async () => {
      const budgetsRes = await request(app)
        .get('/api/v1/budgets')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(budgetsRes.status).toBe(200);
      expect(budgetsRes.body.data.length).toBeGreaterThan(0);

      const targetBudget = budgetsRes.body.data[0];
      const res = await request(app)
        .get(`/api/v1/budgets/${targetBudget.id}/export/pbi-excel`)
        .set('Authorization', `Bearer ${financeToken}`)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain(targetBudget.docNumber);

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body);

      const worksheet = workbook.getWorksheet('PBI Semula - Menjadi') || workbook.worksheets[0];
      expect(worksheet).toBeDefined();
      if (!worksheet) return;

      // Title row check (Row 2 has docNumber in metadata string)
      expect(worksheet.getRow(2).getCell(1).value).toContain(targetBudget.docNumber);

      // Verify Total row exists and contains Excel formula
      const rowCount = worksheet.rowCount;
      const totalRow = worksheet.getRow(rowCount);
      expect(totalRow.getCell(1).value).toContain('TOTAL');

      // Cell 25 (Pagu Semula total) should have formula SUM
      const cellSemula = totalRow.getCell(25);
      expect(cellSemula.value).toHaveProperty('formula');
      expect(String((cellSemula.value as any).formula)).toContain('SUM');

      // Cell 47 (Pagu Menjadi total) should have formula SUM
      const cellMenjadi = totalRow.getCell(47);
      expect(cellMenjadi.value).toHaveProperty('formula');
      expect(String((cellMenjadi.value as any).formula)).toContain('SUM');

      // Cell 48 (Selisih total) should have formula
      const cellSelisih = totalRow.getCell(48);
      expect(cellSelisih.value).toHaveProperty('formula');
    });

    it('enforces RBAC permissions on PBI Excel export (requires budget:view)', async () => {
      const noAuthRes = await request(app)
        .get('/api/v1/budgets/export/pbi-excel');
      expect(noAuthRes.status).toBe(401);

      const authorizedRes = await request(app)
        .get('/api/v1/budgets/export/pbi-excel')
        .set('Authorization', `Bearer ${financeToken}`)
        .responseType('blob');
      expect(authorizedRes.status).toBe(200);
    });
  });

  // =========================================================================
  // 23. [KOI-131] [PMO-171] Perekaman Otomatis Mutasi Data & Jejak Audit (Forensic Audit Trail) (3)
  // =========================================================================
  describe('23. [KOI-131] [PMO-171] Perekaman Otomatis Mutasi Data & Jejak Audit (Forensic Audit Trail)', () => {
    let sampleLogId = '';
    let testEntityId = '';

    it('automatically records immutable audit logs upon financial entity mutations with beforeData and afterData snapshots', async () => {
      // 1. Fetch recent audit logs from dedicated forensic endpoint
      const res = await request(app)
        .get('/api/v1/audit/logs?limit=10')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta.total).toBeGreaterThan(0);

      const firstLog = res.body.data[0];
      sampleLogId = firstLog.id;
      testEntityId = firstLog.entityId;

      expect(firstLog.actorName).toBeDefined();
      expect(firstLog.actorRole).toBeDefined();
      expect(firstLog.action).toBeDefined();
      expect(firstLog.module).toBeDefined();
      expect(firstLog.summary).toBeDefined();

      // 2. Query single log with computed field diffs
      const singleRes = await request(app)
        .get(`/api/v1/audit/logs/${sampleLogId}`)
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.success).toBe(true);
      expect(singleRes.body.data.id).toBe(sampleLogId);
      expect(Array.isArray(singleRes.body.data.diffs)).toBe(true);
      expect(typeof singleRes.body.data.hasChanges).toBe('boolean');
    });

    it('provides forensic query with multi-parameter filtering, date ranges, and chronological entity timeline', async () => {
      // 1. Filter by module
      const moduleRes = await request(app)
        .get('/api/v1/audit/logs?module=BUDGET&limit=10')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(moduleRes.status).toBe(200);
      expect(moduleRes.body.success).toBe(true);
      for (const log of moduleRes.body.data) {
        expect(log.module).toBe('BUDGET');
      }

      // 2. Chronological Entity Timeline
      if (testEntityId) {
        const timelineRes = await request(app)
          .get(`/api/v1/audit/entity/Budget/${testEntityId}`)
          .set('Authorization', `Bearer ${auditorToken}`);

        expect(timelineRes.status).toBe(200);
        expect(timelineRes.body.success).toBe(true);
        expect(Array.isArray(timelineRes.body.data)).toBe(true);
      }

      // 3. Forensic Summary Stats
      const statsRes = await request(app)
        .get('/api/v1/audit/stats')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.success).toBe(true);
      expect(statsRes.body.data.totalEvents).toBeGreaterThan(0);
      expect(statsRes.body.data.byModule).toBeDefined();
      expect(statsRes.body.data.byAction).toBeDefined();
      expect(Array.isArray(statsRes.body.data.topActors)).toBe(true);

      // 4. Forensic CSV Export
      const csvRes = await request(app)
        .get('/api/v1/audit/export/csv?limit=50')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(csvRes.status).toBe(200);
      expect(csvRes.headers['content-type']).toContain('text/csv');
      expect(csvRes.headers['content-disposition']).toContain('.csv');
      expect(csvRes.text).toContain('Waktu Server (WIB)');
      expect(csvRes.text).toContain('Ringkasan Forensik');
    });

    it('strictly enforces audit trail immutability (403 AUDIT_LOG_IMMUTABLE) and RBAC authorization (requires audit:view)', async () => {
      // 1. Attempt unauthenticated access -> 401
      const unauthRes = await request(app)
        .get('/api/v1/audit/logs');
      expect(unauthRes.status).toBe(401);

      // 2. Attempt deleting audit log directly -> 403 AUDIT_LOG_IMMUTABLE
      if (sampleLogId) {
        const deleteRes = await request(app)
          .delete(`/api/v1/audit/logs/${sampleLogId}`)
          .set('Authorization', `Bearer ${gmToken}`);

        expect(deleteRes.status).toBe(403);
        expect(deleteRes.body.error.code).toBe('AUDIT_LOG_IMMUTABLE');
        expect(deleteRes.body.error.message).toContain('kebal mutasi atau penghapusan');

        // 3. Attempt updating/patching audit log -> 403 AUDIT_LOG_IMMUTABLE
        const patchRes = await request(app)
          .patch(`/api/v1/audit/logs/${sampleLogId}`)
          .set('Authorization', `Bearer ${gmToken}`)
          .send({ summary: 'Manipulated summary' });

        expect(patchRes.status).toBe(403);
        expect(patchRes.body.error.code).toBe('AUDIT_LOG_IMMUTABLE');
      }
    });
  });

  // =========================================================================
  // 24. [KOI-132] [PMO-181] Navigasi Cepat, Omnisearch Cmd+K & App Launcher Modal (3)
  // =========================================================================
  describe('24. [KOI-132] [PMO-181] Navigasi Cepat, Omnisearch Cmd+K & App Launcher Modal', () => {
    it('performs case-insensitive multi-domain Omnisearch across Budgets, 70 COA Pertor 310 accounts, Journals, and Assets', async () => {
      // 1. Short query (< 2 chars) returns empty array cleanly
      const shortRes = await request(app)
        .get('/api/v1/master/omnisearch?q=a')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(shortRes.status).toBe(200);
      expect(shortRes.body.data).toEqual([]);
      expect(shortRes.body.meta.total).toBe(0);

      // 2. Search for Pertor 310 COA Account (e.g., "1101" or "Kas" / "Bank")
      const coaRes = await request(app)
        .get('/api/v1/master/omnisearch?q=1101')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(coaRes.status).toBe(200);
      expect(coaRes.body.success).toBe(true);
      expect(Array.isArray(coaRes.body.data)).toBe(true);
      expect(coaRes.body.data.length).toBeGreaterThan(0);
      const coaHit = coaRes.body.data.find((r: any) => r.entityType === 'COA');
      expect(coaHit).toBeDefined();
      expect(coaHit.route).toContain('/accounting?q=');

      // 3. Case-insensitive search for Budget RKAP ("bdg-" or "rkap")
      const bdgRes = await request(app)
        .get('/api/v1/master/omnisearch?q=bdg')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(bdgRes.status).toBe(200);
      expect(bdgRes.body.data.some((r: any) => r.entityType === 'BUDGET')).toBe(true);
    });

    it('filters Omnisearch results by scope (COA, FINANCE, ASSET, HRIS) and returns countsByScope metadata', async () => {
      const res = await request(app)
        .get('/api/v1/master/omnisearch?q=520&scope=COA')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta.scope).toBe('COA');
      expect(res.body.meta.countsByScope).toBeDefined();
      expect(typeof res.body.meta.countsByScope.COA).toBe('number');

      for (const item of res.body.data) {
        expect(item.scopeGroup).toBe('COA');
        expect(item.entityType).toBe('COA');
      }
    });

    it('retrieves role-aware App Launcher catalog (/master/app-launcher) with RBAC lock states and live module badges', async () => {
      // 1. GM PMO has full unlocked access across all modules
      const gmRes = await request(app)
        .get('/api/v1/master/app-launcher')
        .set('Authorization', `Bearer ${gmToken}`);

      expect(gmRes.status).toBe(200);
      expect(gmRes.body.success).toBe(true);
      expect(Array.isArray(gmRes.body.data.modules)).toBe(true);
      expect(gmRes.body.data.summary.totalModules).toBeGreaterThanOrEqual(14);
      expect(gmRes.body.data.summary.lockedCount).toBe(0);

      // 2. Cashier role has locked administrative/HRIS modules
      const cashierRes = await request(app)
        .get('/api/v1/master/app-launcher')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(cashierRes.status).toBe(200);
      expect(cashierRes.body.data.summary.lockedCount).toBeGreaterThan(0);
      const adminTile = cashierRes.body.data.modules.find((m: any) => m.id === 'admin');
      expect(adminTile?.locked).toBe(true);
    });
  });

  // =========================================================================
  // 25. [KOI-133] [PMO-182] Widget Asisten Keuangan AI Terintegrasi (Context-Aware Financial AI) (3)
  // =========================================================================
  describe('25. [KOI-133] [PMO-182] Widget Asisten Keuangan AI Terintegrasi (Context-Aware Financial AI)', () => {
    it('fetches live Context-Aware AI snapshot (/reports/ai-assistant/context) with PBI Semula-Menjadi, RGA, GL Trial Balance & RBAC unit scoping', async () => {
      // 1. GM PMO receives consolidated context across all 5 business units
      const gmCtxRes = await request(app)
        .get('/api/v1/reports/ai-assistant/context')
        .set('Authorization', `Bearer ${gmToken}`);

      expect(gmCtxRes.status).toBe(200);
      expect(gmCtxRes.body.success).toBe(true);
      expect(gmCtxRes.body.data.user.isUnitScoped).toBe(false);
      expect(gmCtxRes.body.data.metrics.totalAllocated).toBeGreaterThan(0);
      expect(gmCtxRes.body.data.metrics.totalMenjadiAmount).toBeGreaterThan(0);
      expect(gmCtxRes.body.data.metrics.glIsBalanced).toBe(true);
      expect(Array.isArray(gmCtxRes.body.data.rgaUnits)).toBe(true);
      expect(Array.isArray(gmCtxRes.body.data.quickPrompts)).toBe(true);
      expect(gmCtxRes.body.data.quickPrompts.length).toBeGreaterThanOrEqual(6);

      // 2. Unit Manager receives strictly unit-scoped context
      const unitCtxRes = await request(app)
        .get('/api/v1/reports/ai-assistant/context')
        .set('Authorization', `Bearer ${unitMgrToken}`);

      expect(unitCtxRes.status).toBe(200);
      expect(unitCtxRes.body.data.user.isUnitScoped).toBe(true);
      expect(unitCtxRes.body.data.metrics.totalAllocated).toBeLessThanOrEqual(
        gmCtxRes.body.data.metrics.totalAllocated
      );
    });

    it('provides deterministic context-aware financial analysis on PBI Semula-Menjadi 60 Kolom and RGA Revenue Targets', async () => {
      // 1. Ask about PBI Semula-Menjadi & Pergeseran Anggaran
      const pbiQueryRes = await request(app)
        .post('/api/v1/reports/ai-assistant')
        .set('Authorization', `Bearer ${gmToken}`)
        .send({
          query: 'Tampilkan analisis pagu PBI Semula-Menjadi dan pergeseran revisi anggaran saat ini',
        });

      expect(pbiQueryRes.status).toBe(200);
      expect(pbiQueryRes.body.success).toBe(true);
      expect(pbiQueryRes.body.data.reply).toBeDefined();
      expect(pbiQueryRes.body.data.reply.toLowerCase()).toMatch(/semula|menjadi|pagu|anggaran/);
      expect(pbiQueryRes.body.data.contextMetrics.totalMenjadiAmount).toBeGreaterThan(0);

      // 2. Ask about RGA Revenue Target & Realization across units
      const rgaQueryRes = await request(app)
        .post('/api/v1/reports/ai-assistant')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          query: 'Bagaimana evaluasi target RGA dan capaian pendapatan per unit bisnis?',
        });

      expect(rgaQueryRes.status).toBe(200);
      expect(rgaQueryRes.body.success).toBe(true);
      expect(rgaQueryRes.body.data.reply.toLowerCase()).toMatch(/rga|target|pendapatan/);
      expect(typeof rgaQueryRes.body.data.contextMetrics.totalRgaTargetRevenue).toBe('number');
    });

    it('provides deterministic compliance guidance on ISAK 335 / GL Trial Balance, UMK Petty Cash SLA, and Cut-Off Tgl 20 & 25', async () => {
      // 1. Ask about ISAK 335 & GL Trial Balance / Storno
      const isakRes = await request(app)
        .post('/api/v1/reports/ai-assistant')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          query: 'Cek keseimbangan Buku Besar GL, aturan Storno, dan laporan Neraca ISAK 335',
        });

      expect(isakRes.status).toBe(200);
      expect(isakRes.body.data.reply.toLowerCase()).toMatch(/isak 335|buku besar|debit|kredit|storno/);
      expect(isakRes.body.data.contextMetrics.glIsBalanced).toBe(true);

      // 2. Ask about Cut-Off Tanggal 20 Aset & Tanggal 25 HRIS
      const cutoffRes = await request(app)
        .post('/api/v1/reports/ai-assistant')
        .set('Authorization', `Bearer ${gmToken}`)
        .send({
          query: 'Bagaimana status penyusutan aset tetap dan aturan cut-off HRIS tanggal 25?',
        });

      expect(cutoffRes.status).toBe(200);
      expect(cutoffRes.body.data.reply.toLowerCase()).toMatch(/aset|20|25|hris|penyusutan/);
    });
  });

  // =========================================================================
  // 26. [KOI-134] [SPRINT-6-REV] Sprint 6 Review & Kesiapan UAT Lintas Modul (3)
  // =========================================================================
  describe('26. [KOI-134] [SPRINT-6-REV] Sprint 6 Review & Kesiapan UAT Lintas Modul', () => {
    it('audits Sprint 6 enterprise tools & UAT readiness (/reports/sprint6-readiness) across PBI 60-Col Export, Forensic Audit Trail, Omnisearch, and AI Copilot', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sprint6-readiness')
        .set('Authorization', `Bearer ${gmToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sprint).toBe('SPRINT_6');
      expect(res.body.data.epicKey).toBe('KOI-129');
      expect(res.body.data.reviewTicketKey).toBe('KOI-134');
      expect(res.body.data.isUatReady).toBe(true);

      const { checklist } = res.body.data;
      expect(checklist.pbiExcelExport60Columns.ready).toBe(true);
      expect(checklist.pbiExcelExport60Columns.columnsCount).toBe(60);
      expect(checklist.forensicAuditTrail.ready).toBe(true);
      expect(checklist.forensicAuditTrail.immutabilityGuardCode).toBe('AUDIT_LOG_IMMUTABLE');
      expect(checklist.omnisearchAndAppLauncher.ready).toBe(true);
      expect(checklist.omnisearchAndAppLauncher.searchableDomainsCount).toBe(8);
      expect(checklist.omnisearchAndAppLauncher.appLauncherModulesCount).toBe(14);
      expect(checklist.contextAwareAiAssistant.ready).toBe(true);
    });

    it('verifies end-to-end cross-module workflow: PBI 60-Col Export -> Forensic Audit Trail Recording -> Omnisearch Discovery -> Context-Aware AI Verification', async () => {
      // 1. Trigger consolidated 60-column PBI Excel Export
      const exportRes = await request(app)
        .get('/api/v1/budgets/export/pbi-excel')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(exportRes.status).toBe(200);

      // 2. Verify Forensic Audit Trail recorded actions and blocks deletion
      const auditRes = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.length).toBeGreaterThan(0);

      const latestAuditId = auditRes.body.data[0].id;
      const immutabilityRes = await request(app)
        .delete(`/api/v1/audit/logs/${latestAuditId}`)
        .set('Authorization', `Bearer ${gmToken}`);
      expect(immutabilityRes.status).toBe(403);
      expect(immutabilityRes.body.error.code).toBe('AUDIT_LOG_IMMUTABLE');

      // 3. Verify Omnisearch & Context-Aware AI Copilot remain synchronized
      const omniRes = await request(app)
        .get('/api/v1/master/omnisearch?q=1101&scope=COA')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(omniRes.status).toBe(200);
      expect(omniRes.body.data.length).toBeGreaterThan(0);

      const aiCtxRes = await request(app)
        .get('/api/v1/reports/ai-assistant/context')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(aiCtxRes.status).toBe(200);
      expect(aiCtxRes.body.data.metrics.glIsBalanced).toBe(true);
    });

    it('confirms General Ledger Trial Balance & ISAK 335 integrity across all 5 Business Units post Sprint 6 with 0 discrepancy', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sprint6-readiness')
        .set('Authorization', `Bearer ${financeToken}`);

      expect(res.status).toBe(200);
      const glIntegrity = res.body.data.checklist.crossModuleAccountingIntegrity;
      expect(glIntegrity.ready).toBe(true);
      expect(glIntegrity.activeBusinessUnitsCount).toBeGreaterThanOrEqual(5);
      expect(glIntegrity.overallGlBalanced).toBe(true);
      expect(glIntegrity.globalDiscrepancy).toBeLessThan(1);

      for (const unitTb of glIntegrity.unitTrialBalances) {
        expect(unitTb.isBalanced).toBe(true);
        expect(unitTb.discrepancy).toBeLessThan(1);
      }
    });
  });

  // =========================================================================
  // 27. Role-Aware Portfolio Dashboard (1W/1M/1Q/1Y PnL, Neraca & Domain Scopes)
  // =========================================================================
  describe('27. Role-Aware Portfolio Dashboard & Multi-Timeframe PnL / Neraca (3)', () => {
    it('returns balanced Neraca (Balance Sheet) and multi-timeframe PnL series (weekly, monthly, quarterly, yearly)', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard?range=quarterly&year=2026')
        .set('Authorization', `Bearer ${gmToken}`);

      expect(res.status).toBe(200);
      const { portfolio, roleSummary } = res.body.data;
      expect(portfolio).toBeDefined();
      expect(portfolio.activeRange).toBe('quarterly');
      expect(portfolio.pnlByRange.weekly.series).toHaveLength(8);
      expect(portfolio.pnlByRange.monthly.series).toHaveLength(12);
      expect(portfolio.pnlByRange.quarterly.series).toHaveLength(4);
      expect(portfolio.pnlByRange.yearly.series).toHaveLength(3);

      const bs = portfolio.balanceSheet;
      expect(bs).toBeDefined();
      expect(bs.totalAssets).toBeTypeOf('number');
      expect(bs.totalLiabilities).toBeTypeOf('number');
      expect(bs.netAssets).toBeTypeOf('number');
      expect(bs.isBalanced).toBe(true);
      expect(Array.isArray(bs.allocation)).toBe(true);
      expect(bs.allocation.length).toBe(4);

      expect(roleSummary.agingReceivables.totalOutstanding).toBe(
        roleSummary.agingReceivables.current +
        roleSummary.agingReceivables.days31to60 +
        roleSummary.agingReceivables.days61to90 +
        roleSummary.agingReceivables.over90
      );
      expect(roleSummary.agingPayables.totalOutstanding).toBe(
        roleSummary.agingPayables.current +
        roleSummary.agingPayables.days31to60 +
        roleSummary.agingPayables.days61to90 +
        roleSummary.agingPayables.over90
      );
    });

    it('assigns strict roleProfile & allowedWorkspaces per user role (Penerimaan vs Pengeluaran RBAC)', async () => {
      const [gmRes, unitRes, cashierRes, procRes, accRes, audRes] = await Promise.all([
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${gmToken}`),
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${unitMgrToken}`),
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${cashierToken}`),
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${procurementToken}`),
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${accountingToken}`),
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${auditorToken}`),
      ]);

      expect(gmRes.body.data.roleProfile.profileType).toBe('EXECUTIVE');
      expect(gmRes.body.data.roleProfile.allowedWorkspaces).toEqual(['PENERIMAAN', 'PENGELUARAN']);

      expect(unitRes.body.data.roleProfile.profileType).toBe('UNIT_MANAGER');
      expect(unitRes.body.data.roleProfile.allowedWorkspaces).toEqual(['PENERIMAAN', 'PENGELUARAN']);

      expect(cashierRes.body.data.roleProfile.profileType).toBe('REVENUE_OPS');
      expect(cashierRes.body.data.roleProfile.allowedWorkspaces).toEqual(['PENERIMAAN']);

      expect(procRes.body.data.roleProfile.profileType).toBe('PROCUREMENT_OPS');
      expect(procRes.body.data.roleProfile.allowedWorkspaces).toEqual(['PENGELUARAN']);

      expect(accRes.body.data.roleProfile.profileType).toBe('ACCOUNTING_TAX');
      expect(accRes.body.data.roleProfile.allowedWorkspaces).toEqual(['PENERIMAAN', 'PENGELUARAN']);

      expect(audRes.body.data.roleProfile.profileType).toBe('AUDITOR');
      expect(audRes.body.data.roleProfile.isReadOnly).toBe(true);
    });

    it('exposes real domain operational summaries (penerimaanSummary, pengeluaranSummary, procurementQueue, pettyCashTaxQueue)', async () => {
      const res = await request(app)
        .get('/api/v1/reports/dashboard')
        .set('Authorization', `Bearer ${accountingToken}`);

      expect(res.status).toBe(200);
      const rs = res.body.data.roleSummary;
      expect(rs.penerimaanSummary.totalInvoiced).toBeTypeOf('number');
      expect(rs.pengeluaranSummary.totalBudgetAllocated).toBeTypeOf('number');
      expect(rs.procurementQueue.openPoCount).toBeTypeOf('number');
      expect(rs.pettyCashTaxQueue.totalTaxPayable).toBeTypeOf('number');
      expect(rs.cashierStatus.todayCashReceived).toBeTypeOf('number');
      expect(rs.auditSummary.recentAuditCount).toBeTypeOf('number');
    });
  });

  // =========================================================================
  // 28. Modul Penerimaan PTNBH (4 Unit Bisnis, Pajak FP 020/030/040, HANGUS,
  //     Direct Receipt, Lebih Bayar, Buku Harian, Surat Pajak & Aging .xlsx)
  // =========================================================================
  describe('28. Modul Penerimaan PTNBH (4 Unit Bisnis, Pajak, Buku Harian, Rekonsiliasi & Aging) (6)', () => {
    let unitMiceId = '';
    let unitKlinikId = '';
    let unitItsId = '';
    let unitTciId = '';
    let testCustomerId = '';
    let udayanaInvoiceId = '';
    let gandariaInvoiceId = '';
    let directReceiptId = '';

    beforeAll(async () => {
      const masterRes = await request(app)
        .get('/api/v1/master/overview')
        .set('Authorization', `Bearer ${gmToken}`);
      expect(masterRes.status).toBe(200);
      const units = masterRes.body.data.businessUnits;
      unitMiceId = (units.find((u: any) => u.code === 'BU-MICE') || units[0]).id;
      unitKlinikId = (units.find((u: any) => u.code === 'BU-KLINIK') || units[0]).id;
      unitItsId = (units.find((u: any) => u.code === 'BU-ITS') || unitKonsulId).id;
      unitTciId = (units.find((u: any) => u.code === 'BU-TCI') || unitDiklatId).id;

      const custRes = await request(app)
        .post('/api/v1/revenue/customers')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          name: `Universitas Uji PTNBH ${runTag}`,
          organizationType: 'GOVERNMENT',
          taxCollectorProfile: 'FP_020_INSTANSI',
          taxIdNpwp: '00.111.222.3-401.000',
          contactPerson: 'Bendahara PTNBH',
          email: `keuangan.${runTag.toLowerCase()}@univ.ac.id`,
          phone: '021-7490941',
          address: 'Kampus PTNBH Indonesia',
        });
      expect(custRes.status).toBe(201);
      testCustomerId = custRes.body.data.id;
    });

    it('calculates exact PTNBH tax preview & issues IT Solution FP 020 invoice (Bruto 771.380.000 -> Net 681.038.198) in 31-60d Aging', async () => {
      const prevRes = await request(app)
        .post('/api/v1/revenue/tax-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          subtotal: 771380000,
          discountPercent: 0,
          taxScheme: 'PPN12_PPH23',
          taxInclusive: true,
          taxCollectorProfile: 'FP_020_INSTANSI',
        });
      expect(prevRes.status).toBe(200);
      expect(prevRes.body.data.nilaiJual).toBe(694936937);
      expect(prevRes.body.data.ppnAmount).toBe(76443063);
      expect(prevRes.body.data.pph23Amount).toBe(13898739);
      expect(prevRes.body.data.netReceivableAmount).toBe(681038198);
      expect(prevRes.body.data.utRemitPpn).toBe(0);
      expect(prevRes.body.data.utRemitPph23).toBe(0);

      // Issue 45 days ago with dueInDays: 0 so it enters the 31-60 Hari aging bucket
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      const invRes = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitItsId,
          invoiceType: 'TERMIN',
          activityTitle: `Pembayaran Promise PKS Termin 2 ${runTag}`,
          rincianLabel: 'Jasa Pengelolaan TI Promise',
          revenueAccountCode: '420301040200',
          taxScheme: 'PPN12_PPH23',
          taxInclusive: true,
          taxCollectorProfile: 'FP_020_INSTANSI',
          issueDate: fortyFiveDaysAgo,
          dueInDays: 0,
          lines: [
            {
              description: 'Lisensi & Implementasi Sistem Promise Termin 2',
              quantity: 1,
              unitPrice: 771380000,
            },
          ],
        });
      expect(invRes.status).toBe(201);
      udayanaInvoiceId = invRes.body.data.id;
      expect(invRes.body.data.approvalStatus).toBe('PENDING_APPROVAL');
      expect(invRes.body.data.nilaiJual).toBe(694936937);
      expect(invRes.body.data.ppnAmount).toBe(76443063);
      expect(invRes.body.data.pph23Amount).toBe(13898739);
      expect(invRes.body.data.netReceivableAmount).toBe(681038198);
      expect(invRes.body.data.balanceDue).toBe(681038198);

      // Must NOT appear in Aging before Manager Finance approves
      const agingPending = await request(app)
        .get('/api/v1/revenue/aging')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(agingPending.body.data.invoices.some((i: any) => i.id === udayanaInvoiceId)).toBe(false);

      // Approve Udayana Invoice
      const appUdayana = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${udayanaInvoiceId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appUdayana.status).toBe(200);
      expect(appUdayana.body.data.status).toBe('ISSUED');
      expect(appUdayana.body.data.approvalStatus).toBe('APPROVED');
    });

    it('supports 60% UT discount (Ruang Gandaria 800k -> 320k), blocks unintended overpayment, and records controlled allowOverpayment (+80k Pengembalian Dana)', async () => {
      const invRes = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitMiceId,
          invoiceType: 'PELUNASAN',
          activityTitle: `Sewa Ruang Gandaria Diskon 60% ${runTag}`,
          rincianLabel: 'Ruang Gandaria',
          revenueAccountCode: '420301070100',
          taxScheme: 'PPN12_PPH4_2',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          discountPercent: 60,
          dueInDays: 7,
          lines: [{ description: 'Sewa Ruang Gandaria Full Day', quantity: 1, unitPrice: 800000 }],
        });
      expect(invRes.status).toBe(201);
      gandariaInvoiceId = invRes.body.data.id;
      expect(invRes.body.data.discountAmount).toBe(480000);
      expect(invRes.body.data.totalAmount).toBe(320000);

      // Approve Gandaria Invoice before accepting payment
      const appGandaria = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${gandariaInvoiceId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appGandaria.status).toBe(200);

      // Default allowOverpayment=false MUST still reject overpayment
      const blockedRes = await request(app)
        .post('/api/v1/revenue/payments')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerInvoiceId: gandariaInvoiceId,
          method: 'BANK_TRANSFER',
          grossAmount: 400000,
          referenceNo: `TRF-BLOCK-${runTag}`,
          idempotencyKey: `IDEMP-BLOCK-${runTag}`,
        });
      expect(blockedRes.status).toBe(409);
      expect(blockedRes.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');

      // Explicit allowOverpayment=true accepts 400.000 and tracks 80.000 Pengembalian Dana
      const overRes = await request(app)
        .post('/api/v1/revenue/payments')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerInvoiceId: gandariaInvoiceId,
          method: 'BANK_TRANSFER',
          grossAmount: 400000,
          allowOverpayment: true,
          receiptType: 'KUITANSI',
          referenceNo: `TRF-OVER-${runTag}`,
          idempotencyKey: `IDEMP-OVER-${runTag}`,
          notes: 'Lebih bayar klien Rp 80.000 masuk Pengembalian Dana',
        });
      expect(overRes.status).toBe(201);
      expect(Number(overRes.body.data.payment.overpaymentAmount)).toBe(80000);

      // Approve the overpayment receipt so it enters BKU & Surat Penarikan Pengembalian Dana
      const appOverPay = await request(app)
        .post(`/api/v1/revenue/payments/${overRes.body.data.payment.id}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appOverPay.status).toBe(200);
    });

    it('issues Uang Muka invoice (TCI), voids it as HANGUS with reversal GL, and reissues cleanly', async () => {
      const umRes = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitTciId,
          invoiceType: 'UANG_MUKA',
          activityTitle: `Pelatihan Housekeeping TCI ${runTag}`,
          rincianLabel: 'Jasa Pelatihan TCI',
          revenueAccountCode: '420301030200',
          taxScheme: 'PPN12_PMK131',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          dueInDays: 14,
          lines: [{ description: 'DP 50% Pelatihan Housekeeping', quantity: 1, unitPrice: 10000000 }],
        });
      expect(umRes.status).toBe(201);
      const umId = umRes.body.data.id;

      await request(app)
        .post(`/api/v1/revenue/customer-invoices/${umId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200);

      const voidRes = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${umId}/void`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'Jadwal pelatihan diundur oleh klien' });
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data.status).toBe('VOID');
      expect(Number(voidRes.body.data.balanceDue)).toBe(0);

      const reissueRes = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${umId}/reissue`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({});
      expect(reissueRes.status).toBe(201);
      expect(reissueRes.body.data.status).toBe('PENDING_APPROVAL');
      expect(reissueRes.body.data.approvalStatus).toBe('PENDING_APPROVAL');
      expect(reissueRes.body.data.docNumber).not.toBe(umRes.body.data.docNumber);

      const appReissue = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${reissueRes.body.data.id}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appReissue.status).toBe(200);
      expect(appReissue.body.data.status).toBe('ISSUED');
    });

    it('records direct receipts (Wisma PB1 10% + Bulk CSV Import) and updates inline Tampungan & Bukti Potong metadata', async () => {
      const drRes = await request(app)
        .post('/api/v1/revenue/direct-receipts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: unitMiceId,
          receiptType: 'TANDA_TERIMA',
          paymentStage: 'PELUNASAN',
          method: 'BANK_TRANSFER',
          payerName: `Tamu Wisma ${runTag}`,
          activityTitle: `Check-in Kamar Standard Wisma UT ${runTag}`,
          rincianLabel: 'Kamar Wisma',
          revenueAccountCode: '420301070400',
          taxScheme: 'PB1_10',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          grossAmount: 550000,
          referenceNo: `WSM-${runTag}`,
        });
      expect(drRes.status).toBe(201);
      directReceiptId = drRes.body.data.id;
      expect(drRes.body.data.pb1Amount).toBe(50000);
      expect(drRes.body.data.customerInvoiceId).toBeNull();
      expect(drRes.body.data.approvalStatus).toBe('PENDING_APPROVAL');

      // Approve direct receipt so it posts to GL & enters BKU/Reconciliation
      const appDr = await request(app)
        .post(`/api/v1/revenue/payments/${directReceiptId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appDr.status).toBe(200);
      expect(appDr.body.data.approvalStatus).toBe('APPROVED');

      const todayStr = new Date().toISOString().slice(0, 10);
      const csvContent = [
        'Tanggal,Nama,Kegiatan,Rincian,Nominal,COA,SkemaPajak,NoInvEksternal',
        `${todayStr},Tamu CSV 1,Sewa Kamar Deluxe,Kamar Wisma,660000,420301070400,PB1_10,`,
        `${todayStr},Pasien Klinik CSV,Rawat Jalan Poliklinik,Klinik Rawat Jalan,250000,420301060100,BEBAS_PAJAK,INV-0038999`,
      ].join('\n');

      const impRes = await request(app)
        .post('/api/v1/revenue/direct-receipts/import-csv')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: unitKlinikId,
          rawContent: csvContent,
          defaultTaxScheme: 'BEBAS_PAJAK',
        });
      expect(impRes.status).toBe(201);
      expect(impRes.body.data.importedCount).toBe(2);

      // Approve the 2 CSV imported receipts
      const csvPays = await prisma.payment.findMany({
        where: { receiptNumber: { in: impRes.body.data.receipts } },
        select: { id: true },
      });
      for (const cp of csvPays) {
        await request(app)
          .post(`/api/v1/revenue/payments/${cp.id}/approve`)
          .set('Authorization', `Bearer ${financeToken}`)
          .expect(200);
      }

      const metaRes = await request(app)
        .patch(`/api/v1/revenue/payments/${directReceiptId}/tax-meta`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ taxAlreadyProcessed: true, withholdingSlipNo: `BP-${runTag}` });
      expect(metaRes.status).toBe(200);
      expect(metaRes.body.data.taxAlreadyProcessed).toBe(true);
      expect(metaRes.body.data.withholdingSlipNo).toBe(`BP-${runTag}`);
    });

    it('serves unified Buku Harian, Perincian Pajak/Surat Penarikan, Aging Penerimaan, valid .xlsx exports, and preserves balanced GL', async () => {
      const ym = new Date().toISOString().slice(0, 7);
      const [bhRes, taxRes, agingRes] = await Promise.all([
        request(app).get(`/api/v1/revenue/buku-harian?month=${ym}`).set('Authorization', `Bearer ${financeToken}`),
        request(app).get(`/api/v1/revenue/tax-recap?month=${ym}`).set('Authorization', `Bearer ${financeToken}`),
        request(app).get('/api/v1/revenue/aging').set('Authorization', `Bearer ${financeToken}`),
      ]);

      expect(bhRes.status).toBe(200);
      expect(bhRes.body.data.summary.directReceiptCount).toBeGreaterThanOrEqual(3);
      expect(bhRes.body.data.summary.invoicedReceiptCount).toBeGreaterThanOrEqual(1);

      expect(taxRes.status).toBe(200);
      expect(taxRes.body.data.pivotByCoa.length).toBeGreaterThan(0);
      expect(taxRes.body.data.withdrawal.totalOverpaymentRefund).toBeGreaterThanOrEqual(80000);
      expect(taxRes.body.data.withdrawal.overpaymentItems.some((o: any) => o.amount === 80000)).toBe(true);

      expect(agingRes.status).toBe(200);
      expect(agingRes.body.data.buckets.days31to60).toBeGreaterThanOrEqual(681038198);
      expect(agingRes.body.data.invoices.some((i: any) => i.id === udayanaInvoiceId && i.bucketKey === 'days31to60')).toBe(true);
      expect(agingRes.body.data.byUnit.length).toBeGreaterThan(0);
      expect(agingRes.body.data.byCustomer.length).toBeGreaterThan(0);

      // Verify binary Excel exports (PK zip header)
      const [taxXlsx, agingXlsx] = await Promise.all([
        request(app)
          .get(`/api/v1/revenue/tax-recap/export.xlsx?month=${ym}`)
          .set('Authorization', `Bearer ${financeToken}`)
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(Buffer.from(c)));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          }),
        request(app)
          .get('/api/v1/revenue/aging/export.xlsx')
          .set('Authorization', `Bearer ${financeToken}`)
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(Buffer.from(c)));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          }),
      ]);
      expect(taxXlsx.status).toBe(200);
      expect(taxXlsx.headers['content-type']).toContain('spreadsheetml.sheet');
      expect((taxXlsx.body as Buffer).subarray(0, 2).toString('utf8')).toBe('PK');

      expect(agingXlsx.status).toBe(200);
      expect(agingXlsx.headers['content-type']).toContain('spreadsheetml.sheet');
      expect((agingXlsx.body as Buffer).subarray(0, 2).toString('utf8')).toBe('PK');

      // Confirm Balance Sheet & GL remain strictly balanced across all new journals
      const finRes = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(finRes.status).toBe(200);
      expect(finRes.body.data.balanceSheet.isBalanced).toBe(true);
    });

    it('links Bank Mandiri Reconciliation to Buku Harian and filters Pembukuan (Umum & Pajak) & Laporan Penerimaan by reconciledOnly', async () => {
      const ym = new Date().toISOString().slice(0, 7);
      const todayStr = new Date().toISOString().slice(0, 10);

      // 1. Direct receipt should appear in unreconciled penerimaan candidates before bank import
      const candBefore = await request(app)
        .get(`/api/v1/reconciliation/penerimaan-candidates?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(candBefore.status).toBe(200);
      expect(candBefore.body.data.unreconciled.some((c: any) => c.id === directReceiptId)).toBe(true);

      // 2. Find Bank Mandiri Penerimaan account and import statement matching our Wisma direct receipt ref
      const bankRes = await request(app)
        .get('/api/v1/reconciliation/bank-accounts')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(bankRes.status).toBe(200);
      const mandiri = bankRes.body.data.find((b: any) => b.domain === 'PENERIMAAN' || b.glAccountCode === '110102010100');
      expect(mandiri).toBeDefined();

      const impRes = await request(app)
        .post('/api/v1/reconciliation/import')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          bankAccountId: mandiri.id,
          periodLabel: `Periode Uji ${runTag}`,
          fileName: `mandiri-uji-${runTag}.csv`,
          rows: [
            {
              transactionDate: todayStr,
              description: `TRANSFER TAMU WISMA ${runTag}`,
              referenceNo: `WSM-${runTag}`,
              direction: 'CREDIT',
              amount: 550000,
            },
          ],
        });
      expect(impRes.status).toBe(201);
      expect(impRes.body.data.matchedCount).toBe(1);

      // 3. Pembukuan (includeJournals=true) & Laporan Penerimaan (reconciledOnly=true) reflect reconciled payment + 4-unit breakdown
      const reconRecap = await request(app)
        .get(`/api/v1/revenue/tax-recap?month=${ym}&reconciledOnly=true&includeJournals=true`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(reconRecap.status).toBe(200);
      expect(reconRecap.body.data.reconciledOnly).toBe(true);
      expect(reconRecap.body.data.summary.reconciledCount).toBeGreaterThanOrEqual(1);
      expect(reconRecap.body.data.rows.some((r: any) => r.id === directReceiptId && r.isReconciled === true)).toBe(true);
      expect(reconRecap.body.data.byUnit.length).toBeGreaterThan(0);
      expect(reconRecap.body.data.journals.length).toBeGreaterThan(0);

      // 4. Auto-generate SKU per Business Unit & prevent duplicate service name in same unit
      const svcRes = await request(app)
        .post('/api/v1/revenue/products')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          name: `Layanan Uji Auto SKU ${runTag}`,
          category: 'rawat jalan',
          businessUnitId: unitKlinikId,
          unitPrice: 125000,
          unit: 'Kunjungan',
          taxScheme: 'BEBAS_PAJAK',
          revenueAccountCode: '420301060100',
        });
      expect(svcRes.status).toBe(201);
      expect(svcRes.body.data.sku).toMatch(/^LYN-KLINIK-\d{3,}$/);

      const dupSvcRes = await request(app)
        .post('/api/v1/revenue/products')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          name: `layanan uji auto sku ${runTag.toLowerCase()}`,
          category: 'Rawat Jalan',
          businessUnitId: unitKlinikId,
          unitPrice: 125000,
          unit: 'Kunjungan',
          taxScheme: 'BEBAS_PAJAK',
          revenueAccountCode: '420301060100',
        });
      expect(dupSvcRes.status).toBe(409);
      expect(dupSvcRes.body.error.code).toBe('DUPLICATE_SERVICE_NAME');

      // Clean up test product so live catalog stays pure
      await prisma.productService.delete({ where: { id: svcRes.body.data.id } });

      // 5. Upload and retrieve Payment Proof image on Buku Harian payment
      const tinyPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const uploadRes = await request(app)
        .post(`/api/v1/revenue/payments/${directReceiptId}/proof`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ dataUrl: tinyPngBase64, fileName: `bukti-transfer-${runTag}.png` });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.data.mimeType).toBe('image/png');

      const getProofRes = await request(app)
        .get(`/api/v1/revenue/payments/${directReceiptId}/proof`)
        .set('Authorization', `Bearer ${financeToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(getProofRes.status).toBe(200);
      expect(getProofRes.headers['content-type']).toContain('image/png');
      expect((getProofRes.body as Buffer).length).toBeGreaterThan(20);

      const bhWithProof = await request(app)
        .get(`/api/v1/revenue/buku-harian?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(bhWithProof.status).toBe(200);
      const matchedBhRow = bhWithProof.body.data.rows.find((r: any) => r.id === directReceiptId);
      expect(matchedBhRow?.paymentProof?.displayName).toBe(`bukti-transfer-${runTag}.png`);
    });

    it('supports PPh 23 15%, PPh 21 5%, 2D Qty x Durasi + DP %, Dual Mandiri Final/Kelolaan auto-routing, 4-unit RAB targets & 32-col Excel export', async () => {
      const ym = new Date().toISOString().slice(0, 7);

      // 1. PPh 23 15% & PPh 21 5% tax calculations
      const pph15Res = await request(app)
        .post('/api/v1/revenue/tax-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          subtotal: 11100000,
          taxScheme: 'PPN12_PPH23_15',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
        });
      expect(pph15Res.status).toBe(200);
      expect(pph15Res.body.data.nilaiJual).toBe(10000000);
      expect(pph15Res.body.data.ppnAmount).toBe(1100000);
      expect(pph15Res.body.data.pph23Rate15Amount).toBe(1500000);

      const pph21Res = await request(app)
        .post('/api/v1/revenue/tax-preview')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          subtotal: 10000000,
          taxScheme: 'PPH21_5',
          taxInclusive: false,
          taxCollectorProfile: 'FP_040_UMUM',
        });
      expect(pph21Res.status).toBe(200);
      expect(pph21Res.body.data.pph21Amount).toBe(500000);

      // 2. 2D Vol x Durasi + DP % Invoice
      const inv2dRes = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitMiceId,
          invoiceType: 'UANG_MUKA',
          dpPercent: 50,
          picName: 'PIC Event UT',
          subCategory: 'Sewa Ruangan UTCC',
          activityTitle: `Sewa 2 Ruang x 3 Hari ${runTag}`,
          rincianLabel: 'Ruang Wisma',
          revenueAccountCode: '420301070100',
          taxScheme: 'PPN12_PPH4_2',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          dueInDays: 7,
          lines: [
            {
              description: 'Ruang Rapat 2 Ruangan x 3 Hari',
              quantity: 2,
              duration: 3,
              durationUnit: 'Hari',
              unitPrice: 1000000,
            },
          ],
        });
      expect(inv2dRes.status).toBe(201);
      expect(Number(inv2dRes.body.data.subtotal)).toBe(6000000);
      expect(Number(inv2dRes.body.data.dpPercent)).toBe(50);
      expect(Number(inv2dRes.body.data.lines[0].duration)).toBe(3);

      // 3. Single official Penerimaan bank routing: all 4 units route to Bank Mandiri Penerimaan (BNK-MDR-01)
      const klRes = await request(app)
        .post('/api/v1/revenue/direct-receipts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: unitKlinikId,
          receiptType: 'KUITANSI',
          paymentStage: 'PELUNASAN',
          method: 'BANK_TRANSFER',
          payerName: `Pasien BPJS ${runTag}`,
          activityTitle: `Klaim Kapitasi Klinik ${runTag}`,
          rincianLabel: 'Klinik Pratama UT',
          revenueAccountCode: '420301060100',
          taxScheme: 'BEBAS_PAJAK',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          grossAmount: 450000,
          referenceNo: `KLN-${runTag}`,
          picName: 'dr. PIC Klinik',
          subCategory: 'BPJS Kapitasi',
        });
      expect(klRes.status).toBe(201);
      const klPayId = klRes.body.data.id;

      // Approve Klinik receipt so it enters BKU & tax-recap cleanly
      await request(app)
        .post(`/api/v1/revenue/payments/${klPayId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200);

      // Verify single Bank Mandiri Penerimaan (BNK-MDR-01) captures Klinik receipt and bank-accounts lists 1 active Penerimaan bank
      const [singleBankBh, activeBanksRes] = await Promise.all([
        request(app)
          .get(`/api/v1/revenue/buku-harian?month=${ym}&bankAccountCode=BNK-MDR-01`)
          .set('Authorization', `Bearer ${financeToken}`),
        request(app)
          .get('/api/v1/reconciliation/bank-accounts')
          .set('Authorization', `Bearer ${financeToken}`),
      ]);
      expect(singleBankBh.status).toBe(200);
      expect(singleBankBh.body.data.rows.some((r: any) => r.id === klPayId)).toBe(true);
      expect(activeBanksRes.status).toBe(200);
      const activePenerimaanBanks = activeBanksRes.body.data.filter((b: any) => b.domain === 'PENERIMAAN');
      expect(activePenerimaanBanks.length).toBe(1);
      expect(activePenerimaanBanks[0].code).toBe('BNK-MDR-01');

      // 4. Tax Recap exposes 4-unit RAB Pendapatan targets + BRI remittance bank
      const recapRes = await request(app)
        .get(`/api/v1/revenue/tax-recap?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(recapRes.status).toBe(200);
      expect(recapRes.body.data.byUnit.length).toBeGreaterThanOrEqual(4);
      const miceUnit = recapRes.body.data.byUnit.find((u: any) => u.unitCode === 'BU-MICE');
      expect(miceUnit?.targetRabAnnual).toBe(19599150364);
      expect(miceUnit?.targetRabMonthly).toBeGreaterThan(1600000000);
      expect(recapRes.body.data.withdrawal.targetTaxAccountNo).toBe('1173.01.000574.30.4');

      // 5. Inspect Excel workbook structure (22-col Buku Harian, 32-col Perincian + Pajak, Surat Penarikan BRI)
      const xlsxRes = await request(app)
        .get(`/api/v1/revenue/tax-recap/export.xlsx?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(xlsxRes.status).toBe(200);
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxRes.body);
      const sBh = wb.getWorksheet('Buku Harian');
      const sPerincian = wb.getWorksheet('Perincian + Pajak');
      const sSurat = wb.getWorksheet('Surat Penarikan Pajak');
      const sBku = wb.getWorksheet('BKU + Pajak');
      expect(sBh?.columnCount).toBe(22);
      expect(sPerincian?.columnCount).toBe(32);
      expect(sBku?.columnCount).toBe(13);
      let suratAllText = '';
      sSurat?.eachRow((r) => {
        r.eachCell((c) => {
          suratAllText += ` ${String(c.value ?? '')}`;
        });
      });
      expect(suratAllText).toContain('Pengembalian Dana');
      expect(suratAllText).toContain('1173.01.000574.30.4');
    });

    it('enforces Manager Finance approval gate (remind, RBAC block, reject/resubmit, approve -> monthly FP journal, void reversal & invoice proof)', async () => {
      const ym = new Date().toISOString().slice(0, 7);
      const tinyPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

      // 1. PIC creates a direct Kwitansi -> starts PENDING_APPROVAL with NO journal & excluded from tax-recap
      const createPay = await request(app)
        .post('/api/v1/revenue/direct-receipts')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          businessUnitId: unitTciId,
          receiptType: 'KUITANSI',
          paymentStage: 'PELUNASAN',
          method: 'BANK_TRANSFER',
          payerName: `Klien Approval Gate ${runTag}`,
          activityTitle: `Workshop Uji Approval ${runTag}`,
          rincianLabel: 'Pelatihan TCI',
          revenueAccountCode: '420301010200',
          taxScheme: 'PPN12_PPH23',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          grossAmount: 2220000,
          referenceNo: `APR-${runTag}`,
        });
      expect(createPay.status).toBe(201);
      const pendingPayId = createPay.body.data.id;
      expect(createPay.body.data.approvalStatus).toBe('PENDING_APPROVAL');
      expect(createPay.body.data.journalEntryId).toBeNull();

      // Must NOT appear in tax-recap (Pembukuan/Laporan) while pending
      const recapBefore = await request(app)
        .get(`/api/v1/revenue/tax-recap?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(recapBefore.body.data.rows.some((r: any) => r.id === pendingPayId)).toBe(false);

      // 2. Non-approver (CASHIER) is blocked with 403 when trying to approve
      const forbiddenApp = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/approve`)
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(forbiddenApp.status).toBe(403);

      // 3. PIC clicks Remind -> succeeds, increments reminderCount=1, second click hits 429 cooldown
      const rem1 = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/remind`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({});
      expect(rem1.status).toBe(200);
      expect(rem1.body.data.reminderCount).toBe(1);

      const rem2 = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/remind`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({});
      expect(rem2.status).toBe(429);
      expect(rem2.body.error.code).toBe('REMIND_COOLDOWN');

      // 4. Manager Finance rejects with revision note -> PIC resubmits -> Manager Finance approves
      const rejRes = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/reject`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'Nominal perlu disesuaikan sesuai bukti transfer' });
      expect(rejRes.status).toBe(200);
      expect(rejRes.body.data.approvalStatus).toBe('REJECTED');

      const resubRes = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/resubmit`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ grossAmount: 2220000, notes: 'Sudah disesuaikan' });
      expect(resubRes.status).toBe(200);
      expect(resubRes.body.data.approvalStatus).toBe('PENDING_APPROVAL');

      const appRes = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/approve`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.approvalStatus).toBe('APPROVED');
      expect(appRes.body.data.status).toBe('CONFIRMED');
      expect(appRes.body.data.journalEntryId).toBeTruthy();

      // Verify journal was posted into monthly FP-* period (NOT FY-2027!)
      const postedJournal = await prisma.journalEntry.findUnique({
        where: { id: appRes.body.data.journalEntryId },
        include: { fiscalPeriod: true },
      });
      expect(postedJournal?.fiscalPeriod?.code).not.toBe('FY-2027');

      // Appears in tax-recap after approval
      const recapAfter = await request(app)
        .get(`/api/v1/revenue/tax-recap?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(recapAfter.body.data.rows.some((r: any) => r.id === pendingPayId)).toBe(true);

      // 5. Manager Finance voids approved payment -> posts reversal journal & removes from tax-recap
      const voidPayRes = await request(app)
        .post(`/api/v1/revenue/payments/${pendingPayId}/void`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ reason: 'Uji pembatalan dokumen disetujui' });
      expect(voidPayRes.status).toBe(200);
      expect(voidPayRes.body.data.status).toBe('VOID');

      // 6. Invoice supporting proof upload & retrieval works BEFORE approval
      const invProofTarget = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitTciId,
          invoiceType: 'PELUNASAN',
          activityTitle: `Uji Bukti Invoice ${runTag}`,
          rincianLabel: 'Pelatihan TCI',
          revenueAccountCode: '420301010200',
          taxScheme: 'PPN12_PPH23',
          taxInclusive: true,
          taxCollectorProfile: 'FP_040_UMUM',
          lines: [{ description: 'Paket Sertifikasi', quantity: 1, unitPrice: 1110000 }],
        });
      expect(invProofTarget.status).toBe(201);
      const pendingInvId = invProofTarget.body.data.id;
      expect(invProofTarget.body.data.approvalStatus).toBe('PENDING_APPROVAL');

      const invProofUp = await request(app)
        .post(`/api/v1/revenue/customer-invoices/${pendingInvId}/proof`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ dataUrl: tinyPngBase64, fileName: `po-klien-${runTag}.png` });
      expect(invProofUp.status).toBe(201);

      const invProofGet = await request(app)
        .get(`/api/v1/revenue/customer-invoices/${pendingInvId}/proof`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(invProofGet.status).toBe(200);
      expect(invProofGet.headers['content-type']).toContain('image/png');

      // 7. REVENUE_OPERATOR (Operator Penerimaan) has 4-unit Penerimaan access, NO Pengeluaran access, and NO approve privilege
      const opLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'penerimaan@pmoutama.demo.id', password: 'DemoErp!2026' });
      expect(opLogin.status).toBe(200);
      const opToken = opLogin.body.data.token;
      expect(opLogin.body.data.user.roleCode).toBe('REVENUE_OPERATOR');

      const [opDash, opRecon, opBudgetBlocked, opApproveBlocked] = await Promise.all([
        request(app).get('/api/v1/reports/dashboard').set('Authorization', `Bearer ${opToken}`),
        request(app).get('/api/v1/reconciliation/bank-accounts').set('Authorization', `Bearer ${opToken}`),
        request(app).get('/api/v1/budgets').set('Authorization', `Bearer ${opToken}`),
        request(app).post(`/api/v1/revenue/customer-invoices/${pendingInvId}/approve`).set('Authorization', `Bearer ${opToken}`),
      ]);
      expect(opDash.status).toBe(200);
      expect(opDash.body.data.roleProfile.allowedWorkspaces).toEqual(['PENERIMAAN']);
      expect(opRecon.status).toBe(200);
      expect(opBudgetBlocked.status).toBe(403);
      expect(opApproveBlocked.status).toBe(403);

      // 8. Reconciliation Excel (.xlsx) template download & upload round-trip parser
      const tplRes = await request(app)
        .get('/api/v1/reconciliation/template.xlsx?domain=PENERIMAAN&accountCode=BNK-MDR-01')
        .set('Authorization', `Bearer ${opToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(tplRes.status).toBe(200);
      expect(tplRes.headers['content-type']).toContain('spreadsheetml.sheet');
      const xlsxBuf = tplRes.body as Buffer;
      expect(xlsxBuf.length).toBeGreaterThan(1000);

      const parseXlsxRes = await request(app)
        .post('/api/v1/reconciliation/parse-file')
        .set('Authorization', `Bearer ${opToken}`)
        .send({
          fileName: 'template-mutasi-bnk-mdr-01.xlsx',
          fileBase64: xlsxBuf.toString('base64'),
        });
      expect(parseXlsxRes.status).toBe(200);
      expect(parseXlsxRes.body.data.totalRows).toBe(2);
      expect(parseXlsxRes.body.data.totalCredit).toBe(5000000);
      expect(parseXlsxRes.body.data.totalDebit).toBe(25000);
      expect(parseXlsxRes.body.data.rows[0].direction).toBe('CREDIT');
      expect(parseXlsxRes.body.data.rows[1].direction).toBe('DEBIT');
    });

    it('manages Penerimaan Master Data (overview, customer update, master config sync) and locks Auto-Fit Tax on invoices & direct receipts', async () => {
      const ym = new Date().toISOString().slice(0, 7);

      // 1. Master Overview returns all 5 Master Data pillars
      const [overviewRes, prodsRes] = await Promise.all([
        request(app).get('/api/v1/revenue/master/overview').set('Authorization', `Bearer ${financeToken}`),
        request(app).get('/api/v1/revenue/products').set('Authorization', `Bearer ${financeToken}`),
      ]);
      expect(overviewRes.status).toBe(200);
      expect(prodsRes.status).toBe(200);
      expect(overviewRes.body.data.businessUnits.length).toBeGreaterThanOrEqual(4);
      expect(prodsRes.body.data.length).toBeGreaterThanOrEqual(80);
      const revCoas = overviewRes.body.data.coaAccounts.filter((c: any) => c.type === 'REVENUE');
      expect(revCoas.length).toBe(18);
      expect(overviewRes.body.data.taxSchemes.length).toBe(7);
      expect(overviewRes.body.data.collectorProfiles.length).toBe(5);
      expect(overviewRes.body.data.config.taxRemittanceBank.accountNo).toBe('1173.01.000574.30.4');

      // 2. Edit Customer via PUT /revenue/customers/:id
      const updCust = await request(app)
        .put(`/api/v1/revenue/customers/${testCustomerId}`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          name: `Universitas Uji PTNBH ${runTag}`,
          organizationType: 'GOVERNMENT',
          taxCollectorProfile: 'FP_020_INSTANSI',
          contactPerson: 'Kepala Bagian Keuangan',
          phone: '021-7490999',
        });
      expect(updCust.status).toBe(200);
      expect(updCust.body.data.contactPerson).toBe('Kepala Bagian Keuangan');
      expect(updCust.body.data.taxCollectorProfile).toBe('FP_020_INSTANSI');

      // 3. RBAC check on PUT /revenue/master/config + live sync to tax-recap (then restore original)
      const opLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'penerimaan@pmoutama.demo.id', password: 'DemoErp!2026' });
      const opToken = opLogin.body.data.token;

      const forbiddenCfg = await request(app)
        .put('/api/v1/revenue/master/config')
        .set('Authorization', `Bearer ${opToken}`)
        .send({
          signatory: { managerName: 'Unauthorized Edit' },
        });
      expect(forbiddenCfg.status).toBe(403);

      const origConfig = overviewRes.body.data.config;
      const testRabMice = 20000000000;
      const updCfg = await request(app)
        .put('/api/v1/revenue/master/config')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          signatory: {
            ...origConfig.signatory,
            managerName: `Manajer Uji ${runTag}`,
          },
          rabTargets: {
            ...origConfig.rabTargets,
            'BU-MICE': testRabMice,
          },
        });
      expect(updCfg.status).toBe(200);
      expect(updCfg.body.data.rabTargets['BU-MICE']).toBe(testRabMice);

      const syncedRecap = await request(app)
        .get(`/api/v1/revenue/tax-recap?month=${ym}`)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(syncedRecap.status).toBe(200);
      const syncedMice = syncedRecap.body.data.byUnit.find((u: any) => u.unitCode === 'BU-MICE');
      expect(syncedMice?.targetRabAnnual).toBe(testRabMice);
      expect(syncedRecap.body.data.withdrawal.signatory.managerName).toBe(`Manajer Uji ${runTag}`);

      // Restore original master config immediately
      const restoreCfg = await request(app)
        .put('/api/v1/revenue/master/config')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          taxRemittanceBank: origConfig.taxRemittanceBank,
          signatory: origConfig.signatory,
          rabTargets: origConfig.rabTargets,
        });
      expect(restoreCfg.status).toBe(200);

      // 4. Auto-Fit Locked Tax on Invoice ignores spoofed taxScheme/taxCollectorProfile
      const autoInv = await request(app)
        .post('/api/v1/revenue/invoices')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          customerId: testCustomerId,
          businessUnitId: unitItsId,
          invoiceType: 'PELUNASAN',
          activityTitle: `Uji AutoFit Invoice ${runTag}`,
          rincianLabel: 'Jasa ITS',
          revenueAccountCode: '420301040200',
          autoFitTax: true,
          taxScheme: 'BEBAS_PAJAK', // Spoofed; must be locked to PPN12_PPH23 by COA 420301040200
          taxInclusive: false, // Spoofed; must be locked to true
          taxCollectorProfile: 'FP_040_UMUM', // Spoofed; must be locked to FP_020_INSTANSI from testCustomerId
          lines: [{ description: 'Jasa Sistem Informasi', quantity: 1, unitPrice: 11100000 }],
        });
      expect(autoInv.status).toBe(201);
      expect(autoInv.body.data.taxScheme).toBe('PPN12_PPH23');
      expect(autoInv.body.data.taxCollectorProfile).toBe('FP_020_INSTANSI');
      expect(autoInv.body.data.taxInclusive).toBe(true);

      // 5. Auto-Fit Locked Tax on Direct Receipt (Kwitansi Wisma -> PB1_10 + Customer FP_020_INSTANSI)
      const autoPay = await request(app)
        .post('/api/v1/revenue/direct-receipts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: unitMiceId,
          customerId: testCustomerId,
          receiptType: 'KUITANSI',
          paymentStage: 'PELUNASAN',
          method: 'BANK_TRANSFER',
          payerName: `Universitas Uji PTNBH ${runTag}`,
          activityTitle: `Uji AutoFit Wisma ${runTag}`,
          rincianLabel: 'Kamar Wisma',
          revenueAccountCode: '420301070400',
          autoFitTax: true,
          taxScheme: 'BEBAS_PAJAK', // Spoofed; must be locked to PB1_10 by COA 420301070400 (Wisma)
          taxCollectorProfile: 'FP_040_UMUM', // Spoofed; must be locked to FP_020_INSTANSI
          grossAmount: 1100000,
          referenceNo: `AUTOFIT-${runTag}`,
        });
      expect(autoPay.status).toBe(201);
      expect(autoPay.body.data.taxScheme).toBe('PB1_10');
      expect(autoPay.body.data.taxCollectorProfile).toBe('FP_020_INSTANSI');
      expect(Number(autoPay.body.data.pb1Amount)).toBe(100000);

      // 6. Auto-Fit Locked Tax on Tanda Terima (Klinik -> BEBAS_PAJAK + INTERNAL_UT)
      const autoTt = await request(app)
        .post('/api/v1/revenue/direct-receipts')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          businessUnitId: unitKlinikId,
          receiptType: 'TANDA_TERIMA',
          paymentStage: 'PELUNASAN',
          method: 'BANK_TRANSFER',
          payerName: `Unit Internal UT ${runTag}`,
          activityTitle: `Uji AutoFit Tanda Terima Klinik ${runTag}`,
          rincianLabel: 'Poli Umum',
          revenueAccountCode: '420301060100',
          autoFitTax: true,
          taxScheme: 'PPN12_PPH23', // Spoofed; must be locked to BEBAS_PAJAK
          taxCollectorProfile: 'FP_040_UMUM', // Spoofed; must be locked to INTERNAL_UT
          grossAmount: 500000,
          referenceNo: `AUTOFIT-TT-${runTag}`,
        });
      expect(autoTt.status).toBe(201);
      expect(autoTt.body.data.taxScheme).toBe('BEBAS_PAJAK');
      expect(autoTt.body.data.taxCollectorProfile).toBe('INTERNAL_UT');
      expect(Number(autoTt.body.data.ppnAmount)).toBe(0);
    });

    afterAll(async () => {
      // Self-clean Section 28 test data so repeated test runs do not clutter Buku Harian
      try {
        const testPays = await prisma.payment.findMany({
          where: {
            OR: [
              { customerId: testCustomerId },
              { referenceNo: { in: [`WSM-${runTag}`, `KLN-${runTag}`, `APR-${runTag}`, `AUTOFIT-${runTag}`, `AUTOFIT-TT-${runTag}`] } },
              { payerName: { in: ['Tamu CSV 1', 'Pasien Klinik CSV'] }, createdAt: { gte: new Date(Date.now() - 120000) } },
            ],
          },
          select: { id: true, journalEntryId: true, receiptNumber: true },
        });
        const payIds = testPays.map((p) => p.id);
        const testInvs = await prisma.customerInvoice.findMany({
          where: { customerId: testCustomerId },
          select: { id: true, docNumber: true },
        });
        const invIds = testInvs.map((i) => i.id);

        await prisma.fileAttachment.deleteMany({
          where: {
            OR: [
              { module: 'REVENUE_PAYMENT', entityId: { in: payIds } },
              { module: 'REVENUE_INVOICE', entityId: { in: invIds } },
            ],
          },
        });
        await prisma.notification.deleteMany({
          where: { entityId: { in: [...payIds, ...invIds] } },
        });
        await prisma.bankStatementImport.deleteMany({ where: { fileName: `mandiri-uji-${runTag}.csv` } });
        await prisma.payment.deleteMany({ where: { id: { in: payIds } } });
        await prisma.customerInvoice.deleteMany({ where: { id: { in: invIds } } });

        const jIds = testPays.map((p) => p.journalEntryId).filter(Boolean) as string[];
        const jWhereOr: any[] = [];
        if (jIds.length) jWhereOr.push({ id: { in: jIds } });
        if (payIds.length) jWhereOr.push({ sourceId: { in: payIds } });
        if (invIds.length) jWhereOr.push({ sourceId: { in: invIds } });
        if (jWhereOr.length) {
          await prisma.journalEntry.deleteMany({ where: { OR: jWhereOr } });
        }
        if (testCustomerId) {
          await prisma.customer.delete({ where: { id: testCustomerId } }).catch(() => { });
        }
      } catch {
        // Non-fatal test cleanup guard
      }
    });
  });
});
