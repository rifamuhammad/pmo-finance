import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toNumber } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { createOrGetBalancedJournal } from '../../shared/accounting-engine.js';
import {
  AppError,
  requireAuth,
} from '../../middleware/auth.js';

export const pettyCashRouter = Router();

pettyCashRouter.use(requireAuth);

const CEILING_SALDO_GUP = 150000000; // Plafon Uang Persediaan Rp 150.000.000
const CEILING_TUP_AKTIF = 75000000;  // Plafon TUP Aktif Rp 75.000.000

function getStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft (Belum Diajukan)';
    case 'SUBMITTED':
      return 'Menunggu Verifikasi Pajak';
    case 'TAX_VERIFIED':
      return 'Pajak Terverifikasi · Menunggu Approval';
    case 'APPROVED':
      return 'Disetujui · Siap Dicairkan';
    case 'DISBURSED':
      return 'Sudah Cair & Terjurnal di GL';
    case 'REJECTED':
      return 'Ditolak / Revisi';
    default:
      return status;
  }
}

function formatSubmissionRecord(r: any, journalNumber?: string | null) {
  const totalTx = toNumber(r.totalTransaction);
  const ppnAmt = toNumber(r.ppnAmount);
  const pphAmt = toNumber(r.pphAmount);
  const dppPph = toNumber(r.dppPph) || totalTx;
  const dppPpn = toNumber(r.dppPpn) || totalTx;
  const taxRate = toNumber(r.taxRatePercent);
  const netDisb = toNumber(r.netDisbursement);

  return {
    ...r,
    journalEntryId: r.journalEntryId || null,
    journalDocNo: journalNumber || r.journalDocNo || null,
    // Standardized Frontend & Backend aliases
    proposerName: r.applicantName,
    applicantName: r.applicantName,
    proposerUnit: r.applicantUnit,
    applicantUnit: r.applicantUnit,
    proposerPhone: r.applicantPhone,
    applicantPhone: r.applicantPhone,
    budgetType: r.expenseCategory,
    expenseCategory: r.expenseCategory,
    draCode: r.draUkCode,
    draUkCode: r.draUkCode,
    draDescription: r.draUkName,
    draUkName: r.draUkName,
    activityDetail: r.activityDescription,
    activityDescription: r.activityDescription,
    saveToMasterVendor: r.isSaveVendor,
    isSaveVendor: r.isSaveVendor,
    transactionKind: r.transactionType,
    transactionType: r.transactionType,
    regionType: r.territoryType,
    territoryType: r.territoryType,
    totalTransaction: totalTx,
    nonTaxableAmount: toNumber(r.nonTaxableAmount),
    taxableAmount: toNumber(r.taxableAmount),
    dppPpn,
    dppPph,
    dppAmount: dppPph,
    ppnRate: ppnAmt > 0 ? 11 : 0,
    ppnAmount: ppnAmt,
    pphRate: taxRate,
    taxRatePercent: taxRate,
    pphAmount: pphAmt,
    grossAmount: totalTx + ppnAmt,
    netPayableAmount: r.type === 'TUP_NIHIL' ? Math.max(0, totalTx + ppnAmt - pphAmt) : netDisb,
    netDisbursement: netDisb,
    taxIncludeMode: dppPpn < totalTx ? 'Include PPN (Sudah Termasuk PPN 11%)' : 'Exclude PPN (Belum Termasuk Pajak)',
    taxCategory: r.taxType,
    taxDetailStatus: r.taxDetail,
    invoiceNo: r.invoiceDocNo,
    invoiceDocNo: r.invoiceDocNo,
    invoiceDate: r.invoiceDocDate ? new Date(r.invoiceDocDate).toISOString().slice(0, 10) : null,
    invoiceDocDate: r.invoiceDocDate,
    invoiceFile: r.invoiceDocFile,
    invoiceDocFile: r.invoiceDocFile,
    receiptNo: r.receiptUtDocNo,
    receiptUtDocNo: r.receiptUtDocNo,
    receiptFile: r.receiptUtDocFile,
    receiptUtDocFile: r.receiptUtDocFile,
    statusLabel: getStatusLabel(r.status),
    taxCalculation: {
      taxType: r.taxType,
      taxDetail: r.taxDetail,
      dppPpn,
      dppPph,
      taxRatePercent: taxRate,
      pphAmount: pphAmt,
      ppnAmount: ppnAmt,
      netDisbursement: netDisb,
      formulas: (r.taxFormulas as any) || [],
    },
    items: (r.items || []).map((it: any) => ({
      ...it,
      itemName: it.description,
      description: it.description,
      unitPrice: toNumber(it.unitPrice),
      totalPrice: toNumber(it.totalPrice),
    })),
  };
}

// Helper to ensure initial seed data exists in PostgreSQL database
async function ensureSeedData() {
  try {
    const count = await prisma.pettyCashSubmission.count();
    if (count > 0) return;

    const bu =
      (await prisma.businessUnit.findFirst({
        where: { OR: [{ code: 'BU-TCI' }, { code: 'BU-ITS' }] },
      })) || (await prisma.businessUnit.findFirst());

    const buId = bu?.id;

    // Seed 1: GUP Belanja Konsumsi
    await prisma.pettyCashSubmission.create({
      data: {
        submissionNo: 'GUP/PMO/2026/10/001',
        type: 'GUP',
        year: 2026,
        businessUnitId: buId,
        applicantName: 'Meda Ary Thiofanny, S.Ak.',
        applicantUnit: bu?.name || 'Divisi TCI (Training, Certification & Innovation)',
        applicantPhone: '021-7490941',
        expenseCategory: 'Anggaran Operasional',
        draUkCode: '5-1100',
        draUkName: '[CC-TCI] Penyelenggaraan Workshop, Konsumsi, dan Kit Peserta',
        coaCode: '5-1100',
        coaName: 'Beban Penyelenggaraan Program & Modul',
        activityDescription: 'Pengadaan konsumsi dan snack rapat koordinasi pembukaan tenant inkubator bisnis UTama',
        vendorName: 'CV Berkah Rasa Nusantara',
        vendorTaxId: '01.345.678.9-012.000',
        vendorIdentityName: 'CV Berkah Rasa Nusantara',
        isSaveVendor: true,
        transactionDate: new Date('2026-10-28'),
        paymentMethod: 'Transfer Bank',
        transactionType: 'Transaksi Baru',
        territoryType: 'Dalam Negeri',
        totalTransaction: 4120000,
        nonTaxableAmount: 120000,
        taxableAmount: 4000000,
        taxType: 'PPh 23 - Jasa Katering / Jasa Manajemen / Jasa Teknis (2%)',
        taxDetail: 'Memiliki NPWP (Tarif Normal)',
        dppPpn: 4120000,
        dppPph: 4120000,
        taxRatePercent: 2,
        pphAmount: 82400,
        ppnAmount: 0,
        netDisbursement: 4037600,
        taxFormulas: [],
        invoiceDocNo: 'INV/BRN/2026/10/44',
        invoiceDocDate: new Date('2026-10-28'),
        invoiceDocFile: 'invoice-catering-berkah.pdf',
        receiptUtDocNo: 'KW/UT-PMO/X/2026/019',
        receiptUtDocDate: new Date('2026-10-29'),
        receiptUtDocFile: 'kwitansi-pmo-019.pdf',
        status: 'SUBMITTED',
        items: {
          create: [
            {
              description: 'Snack Box Rapat Koordinasi (40 Pax)',
              unit: 'Kotak',
              quantity: 40,
              unitPrice: 35000,
              totalPrice: 1400000,
              isTaxable: true,
            },
            {
              description: 'Makan Siang Prasmanan Tamu Undangan (40 Pax)',
              unit: 'Paket',
              quantity: 40,
              unitPrice: 65000,
              totalPrice: 2600000,
              isTaxable: true,
            },
            {
              description: 'Air Mineral Botol 330ml (2 Karton)',
              unit: 'Paket',
              quantity: 2,
              unitPrice: 60000,
              totalPrice: 120000,
              isTaxable: false,
            },
          ],
        },
      },
    });

    // Seed 2: TUP Nihil Workshop HKI
    await prisma.pettyCashSubmission.create({
      data: {
        submissionNo: 'TUP-NIHIL/PMO/2026/10/001',
        type: 'TUP_NIHIL',
        year: 2026,
        businessUnitId: buId,
        applicantName: 'Meda Ary Thiofanny, S.Ak.',
        applicantUnit: bu?.name || 'Divisi TCI (Training, Certification & Innovation)',
        applicantPhone: '021-7490941',
        expenseCategory: 'Anggaran Proyek & Layanan',
        draUkCode: '5-1300',
        draUkName: '[CC-TCI] Honorarium Instruktur & Asesor Sertifikasi',
        coaCode: '5-1300',
        coaName: 'Beban Honorarium Instruktur & Tenaga Ahli',
        activityDescription: 'Pertanggungjawaban Nihil TUP workshop pelatihan Hak Kekayaan Intelektual (HAKI) dan valuasi bisnis',
        vendorName: 'Dr. Hendra Kurniawan, S.E., M.M.',
        vendorTaxId: '09.223.441.2-031.000',
        vendorIdentityName: 'Dr. Hendra Kurniawan',
        isSaveVendor: true,
        transactionDate: new Date('2026-10-20'),
        paymentMethod: 'Transfer Bank',
        transactionType: 'Transaksi Baru',
        territoryType: 'Dalam Negeri',
        totalTransaction: 8000000,
        nonTaxableAmount: 0,
        taxableAmount: 8000000,
        taxType: 'PPh 21 - Honorarium Narasumber / Tenaga Ahli (2.5%)',
        taxDetail: 'Memiliki NPWP (Tarif Normal)',
        dppPpn: 8000000,
        dppPph: 8000000,
        taxRatePercent: 2.5,
        pphAmount: 200000,
        ppnAmount: 0,
        netDisbursement: 7800000,
        taxFormulas: [],
        invoiceDocNo: 'SPJ-HKI/UT-PMO/X/2026',
        invoiceDocDate: new Date('2026-10-20'),
        invoiceDocFile: 'surat-tugas-dan-daftar-hadir.pdf',
        receiptUtDocNo: 'KW-HONOR/PMO/2026/008',
        receiptUtDocDate: new Date('2026-10-21'),
        receiptUtDocFile: 'bukti-transfer-honor.pdf',
        status: 'TAX_VERIFIED',
        verifiedTaxBy: 'Verifikator Pajak PMO (Pusat)',
        verifiedTaxAt: new Date('2026-10-22T14:10:00Z'),
        items: {
          create: [
            {
              description: 'Honorarium Narasumber Ahli Valuasi HKI (8 Jam)',
              unit: 'Orang / Hari',
              quantity: 8,
              unitPrice: 1000000,
              totalPrice: 8000000,
              isTaxable: true,
            },
          ],
        },
      },
    });
  } catch (err) {
    console.error('Failed to ensure petty cash seed data:', err);
  }
}

// 1. GET MASTER CONTEXT (Dynamic Dropdowns from PostgreSQL)
pettyCashRouter.get('/master-context', async (req, res, next) => {
  try {
    const [businessUnits, budgetLines, vendors, taxConfigs, coas, users] = await Promise.all([
      prisma.businessUnit.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, managerName: true },
        orderBy: { code: 'asc' },
      }),
      prisma.budgetLine.findMany({
        where: { budget: { status: { in: ['APPROVED', 'REVISED'] } } },
        include: {
          budget: {
            select: {
              id: true,
              title: true,
              docNumber: true,
              status: true,
              businessUnitId: true,
              businessUnit: { select: { id: true, code: true, name: true } },
            },
          },
          costCenter: { select: { id: true, code: true, name: true } },
        },
        orderBy: { accountCode: 'asc' },
      }),
      prisma.vendor.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          code: true,
          name: true,
          legalName: true,
          category: true,
          taxIdNpwp: true,
          phone: true,
          bankName: true,
          bankAccountNo: true,
          bankAccountHolder: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.taxConfiguration.findMany({
        where: { isActive: true },
        orderBy: { taxCode: 'asc' },
      }),
      prisma.chartOfAccount.findMany({
        where: {
          isActive: true,
          code: { not: { contains: '-' } },
          name: { not: { startsWith: '[LEGACY]' } },
        },
        select: { id: true, code: true, name: true, type: true, normalBalance: true },
        orderBy: { code: 'asc' },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true, email: true, roleCode: true, businessUnitId: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const coaMap = new Map(coas.map((c) => [c.code, c.name]));

    // Deduplicate budgetLines by (businessUnitId + costCenterCode + accountCode + description)
    const seenKeys = new Set<string>();
    const uniqueBudgetLines = [];
    for (const bl of budgetLines) {
      const key = `${bl.budget.businessUnitId}|${bl.costCenter?.code}|${bl.accountCode}|${bl.description}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const alloc = toNumber(bl.allocatedAmount);
      const comm = toNumber(bl.committedAmount);
      const act = toNumber(bl.actualAmount);
      const avail = Math.max(0, alloc - comm - act);
      const ccPrefix = bl.costCenter?.code ? `[${bl.costCenter.code}] ` : '';

      uniqueBudgetLines.push({
        id: bl.id,
        draCode: `${bl.costCenter?.code || 'DRA'}-${bl.accountCode}`,
        code: bl.accountCode,
        coaCode: bl.accountCode,
        coaName: coaMap.get(bl.accountCode) || bl.description,
        name: `${ccPrefix}${bl.description}`,
        description: `${ccPrefix}${bl.description}`,
        category: bl.category,
        businessUnitId: bl.budget.businessUnitId,
        businessUnitName: bl.budget.businessUnit?.name || '',
        costCenterCode: bl.costCenter?.code || '',
        costCenterName: bl.costCenter?.name || '',
        allocatedAmount: alloc,
        availableAmount: avail > 0 ? avail : alloc,
      });
    }

    res.json({
      success: true,
      data: {
        businessUnits: businessUnits.map((u) => ({
          ...u,
          category: 'OPERATIONAL_UNIT',
        })),
        budgetLines: uniqueBudgetLines,
        vendors: vendors.map((v) => ({
          ...v,
          taxId: v.taxIdNpwp,
        })),
        taxConfigs: taxConfigs.map((tc) => ({
          ...tc,
          ratePercent: toNumber(tc.ratePercent),
        })),
        coas: coas.map((c) => ({
          ...c,
          category: c.type,
        })),
        users: users.map((u) => ({
          ...u,
          role: u.roleCode,
        })),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET SUMMARY KARTU SALDO UP TAHUN BERJALAN (100% Real Aggregation from PostgreSQL)
pettyCashRouter.get('/summary', async (req, res, next) => {
  try {
    const allSubmissions = await prisma.pettyCashSubmission.findMany({
      select: {
        type: true,
        status: true,
        totalTransaction: true,
        ppnAmount: true,
        netDisbursement: true,
      },
    });

    const gupInProcessList = allSubmissions.filter(
      (s) => s.type === 'GUP' && ['DRAFT', 'SUBMITTED', 'TAX_VERIFIED', 'APPROVED'].includes(s.status)
    );

    const saldoDiproses = gupInProcessList.reduce(
      (acc, s) => acc + toNumber(s.totalTransaction) + toNumber(s.ppnAmount),
      0
    );

    const saldoTerserap = allSubmissions
      .filter((s) => s.type === 'GUP' && s.status === 'DISBURSED')
      .reduce((acc, s) => acc + toNumber(s.totalTransaction) + toNumber(s.ppnAmount), 0);

    const sisaSaldo = Math.max(0, CEILING_SALDO_GUP - saldoDiproses - saldoTerserap);

    const tupAccounted = allSubmissions
      .filter((s) => s.type === 'TUP_NIHIL' && ['SUBMITTED', 'TAX_VERIFIED', 'APPROVED', 'DISBURSED'].includes(s.status))
      .reduce((acc, s) => acc + toNumber(s.totalTransaction) + toNumber(s.ppnAmount), 0);

    const tupRemainingUnaccounted = Math.max(0, CEILING_TUP_AKTIF - tupAccounted);

    res.json({
      success: true,
      data: {
        year: 2026,
        plafonGup: CEILING_SALDO_GUP,
        saldoGup: CEILING_SALDO_GUP,
        saldoDiproses,
        saldoTerserap,
        sisaSaldo,
        tupActivePlafon: CEILING_TUP_AKTIF,
        tupAccounted,
        tupRemainingUnaccounted,
        tupDeadlineDays: 9,
        totalSubmissions: allSubmissions.length,
        totalAjuanAktif: allSubmissions.length,
        pendingVerificationCount: gupInProcessList.length,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET SUBMISSIONS LIST (From PostgreSQL with filters)
pettyCashRouter.get('/submissions', async (req, res, next) => {
  try {
    const { type, status, search } = req.query;
    const where: Record<string, unknown> = {};

    if (type && typeof type === 'string' && type !== 'ALL') {
      where.type = type;
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { submissionNo: { contains: q, mode: 'insensitive' } },
        { vendorName: { contains: q, mode: 'insensitive' } },
        { activityDescription: { contains: q, mode: 'insensitive' } },
        { applicantName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await prisma.pettyCashSubmission.findMany({
      where,
      include: {
        items: true,
        businessUnit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const journalIds = records.map((r) => r.journalEntryId).filter((id): id is string => Boolean(id));
    const journals =
      journalIds.length > 0
        ? await prisma.journalEntry.findMany({
            where: { id: { in: journalIds } },
            select: { id: true, journalNumber: true },
          })
        : [];
    const journalMap = new Map(journals.map((j) => [j.id, j.journalNumber]));

    const formatted = records.map((r) =>
      formatSubmissionRecord(r, r.journalEntryId ? journalMap.get(r.journalEntryId) : null)
    );

    res.json({
      success: true,
      data: formatted,
      meta: { total: formatted.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 4. GET SINGLE SUBMISSION DETAIL
pettyCashRouter.get('/submissions/:id', async (req, res, next) => {
  try {
    const r = await prisma.pettyCashSubmission.findUnique({
      where: { id: req.params.id },
      include: { items: true, businessUnit: true },
    });

    if (!r) {
      throw new AppError(404, 'SUBMISSION_NOT_FOUND', 'Data pengajuan Uang Persediaan tidak ditemukan.');
    }

    let journalDocNo: string | null = null;
    if (r.journalEntryId) {
      const jrn = await prisma.journalEntry.findUnique({
        where: { id: r.journalEntryId },
        select: { journalNumber: true },
      });
      journalDocNo = jrn?.journalNumber || null;
    }

    res.json({
      success: true,
      data: formatSubmissionRecord(r, journalDocNo),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 5. CREATE SUBMISSION (Persist to PostgreSQL - accepts both frontend & legacy schema shapes)
pettyCashRouter.post('/submissions', async (req, res, next) => {
  try {
    const body = req.body || {};

    const type: 'GUP' | 'TUP_NIHIL' = body.type === 'TUP_NIHIL' ? 'TUP_NIHIL' : 'GUP';
    const applicantName = String(body.proposerName || body.applicantName || '').trim();
    const applicantUnit = String(body.proposerUnit || body.applicantUnit || 'Operasional & Kantor Pusat PMO').trim();
    const applicantPhone = String(body.proposerPhone || body.applicantPhone || '-').trim();
    const expenseCategory = String(body.budgetType || body.expenseCategory || 'Anggaran Operasional').trim();
    const draUkCode = String(body.draCode || body.draUkCode || '5-1200').trim();
    const draUkName = String(body.draDescription || body.draUkName || 'Alokasi Anggaran Operasional').trim();
    const coaCode = String(body.coaCode || '5-1200').trim();
    const coaName = String(body.coaName || 'Beban Operasional Layanan & Proyek').trim();
    const activityDescription = String(body.activityDetail || body.activityDescription || '').trim();
    const vendorName = String(body.vendorName || '').trim();
    const vendorTaxId = String(body.vendorTaxId || '00.000.000.0-000.000').trim();
    const vendorIdentityName = String(body.vendorIdentityName || vendorName).trim();
    const isSaveVendor = Boolean(body.saveToMasterVendor ?? body.isSaveVendor ?? false);
    const transactionDateStr = String(body.transactionDate || new Date().toISOString().slice(0, 10));
    const paymentMethod = String(body.paymentMethod || 'Transfer Bank');
    const transactionType = String(body.transactionKind || body.transactionType || 'Transaksi Baru');
    const territoryType = String(body.regionType || body.territoryType || 'Dalam Negeri');
    const invoiceDocNo = String(body.invoiceNo || body.invoiceDocNo || `INV/${Date.now().toString().slice(-5)}`).trim();
    const invoiceDocDateStr = String(body.invoiceDate || body.invoiceDocDate || transactionDateStr);
    const invoiceDocFile = String(body.invoiceFile || body.invoiceDocFile || 'invoice-terlampir.pdf');
    const receiptUtDocNo = body.receiptNo || body.receiptUtDocNo || `KW/UT-PMO/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
    const receiptUtDocFile = body.receiptFile || body.receiptUtDocFile || 'kwitansi-standar-ut.pdf';
    const submitImmediately = body.submitImmediately !== undefined ? Boolean(body.submitImmediately) : true;

    if (!applicantName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Nama pegawai pengusul wajib diisi.');
    }
    if (!vendorName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Nama rekanan / penerima pembayaran wajib diisi.');
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Minimal harus ada 1 rincian item permintaan.');
    }

    let totalTransaction = 0;
    let nonTaxableAmount = 0;
    let taxableAmount = 0;

    const mappedItems = rawItems.map((it: any) => {
      const desc = String(it.itemName || it.description || 'Item Belanja Operasional').trim();
      const unit = String(it.unit || 'Paket').trim();
      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.unitPrice) || 0);
      const isTaxable = it.isTaxable !== undefined ? Boolean(it.isTaxable) : true;
      const lineTotal = qty * price;
      totalTransaction += lineTotal;
      if (isTaxable) {
        taxableAmount += lineTotal;
      } else {
        nonTaxableAmount += lineTotal;
      }
      return {
        description: desc,
        unit,
        quantity: qty,
        unitPrice: price,
        totalPrice: lineTotal,
        isTaxable,
      };
    });

    if (totalTransaction <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Total nilai permintaan harus lebih dari Rp 0.');
    }

    // Calculate or read tax values
    const taxIncludeMode = String(body.taxIncludeMode || 'Exclude PPN');
    const taxCategory = String(body.taxCategory || body.taxCalculation?.taxType || 'PPh 23 (2%)');
    const taxDetailStatus = String(body.taxDetailStatus || body.taxCalculation?.taxDetail || 'Memiliki NPWP (Tarif Normal)');

    const dppVal =
      body.dppAmount !== undefined
        ? Number(body.dppAmount)
        : body.taxCalculation?.dppPph !== undefined
          ? Number(body.taxCalculation.dppPph)
          : taxIncludeMode.startsWith('Include')
            ? Math.round(totalTransaction / 1.11)
            : totalTransaction;

    const ppnAmt =
      body.ppnAmount !== undefined
        ? Number(body.ppnAmount)
        : body.taxCalculation?.ppnAmount !== undefined
          ? Number(body.taxCalculation.ppnAmount)
          : 0;

    const pphRate =
      body.pphRate !== undefined
        ? Number(body.pphRate)
        : body.taxCalculation?.taxRatePercent !== undefined
          ? Number(body.taxCalculation.taxRatePercent)
          : 2;

    const pphAmt =
      body.pphAmount !== undefined
        ? Number(body.pphAmount)
        : body.taxCalculation?.pphAmount !== undefined
          ? Number(body.taxCalculation.pphAmount)
          : Math.round((dppVal * pphRate) / 100);

    const netDisb =
      body.netPayableAmount !== undefined
        ? Number(body.netPayableAmount)
        : body.taxCalculation?.netDisbursement !== undefined
          ? Number(body.taxCalculation.netDisbursement)
          : Math.max(0, dppVal + ppnAmt - pphAmt);

    const now = new Date();
    const prefix = type === 'GUP' ? 'GUP' : 'TUP-NIHIL';
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

    const existing = await prisma.pettyCashSubmission.findMany({
      where: { submissionNo: { startsWith: `${prefix}/PMO/` } },
      select: { submissionNo: true },
    });
    let maxSeq = existing.length;
    for (const row of existing) {
      const parts = row.submissionNo.split('/');
      const lastNum = parseInt(parts[parts.length - 1] || '0', 10);
      if (!Number.isNaN(lastNum) && lastNum > maxSeq) {
        maxSeq = lastNum;
      }
    }
    const submissionNo = `${prefix}/PMO/${yearMonth}/${String(maxSeq + 1).padStart(3, '0')}`;

    // Resolve BusinessUnit
    let resolvedBuId = body.businessUnitId || req.user?.businessUnitId || null;
    if (!resolvedBuId && applicantUnit) {
      const matchedBu = await prisma.businessUnit.findFirst({
        where: { name: { contains: applicantUnit, mode: 'insensitive' } },
      });
      if (matchedBu) resolvedBuId = matchedBu.id;
    }

    // Find or create Vendor
    let linkedVendorId = body.vendorId || null;
    if (!linkedVendorId && isSaveVendor) {
      const existingVendor = await prisma.vendor.findFirst({
        where: {
          OR: [
            { taxIdNpwp: vendorTaxId },
            { name: { equals: vendorName, mode: 'insensitive' } },
          ],
        },
      });
      if (existingVendor) {
        linkedVendorId = existingVendor.id;
      } else {
        try {
          const vCount = await prisma.vendor.count();
          const newV = await prisma.vendor.create({
            data: {
              code: `VND-UP-${String(vCount + 1).padStart(3, '0')}-${Date.now().toString().slice(-3)}`,
              name: vendorName,
              legalName: vendorIdentityName || vendorName,
              taxIdNpwp: vendorTaxId,
              category: 'OPERATIONAL_SUPPLIER',
              contactName: vendorIdentityName,
              email: 'rekanan@pmoutama.id',
              phone: applicantPhone,
              address: 'Dalam Negeri - Indonesia',
              bankName: 'Bank Mandiri',
              bankAccountNo: '123000999888',
              bankAccountHolder: vendorIdentityName,
              status: 'ACTIVE',
            },
          });
          linkedVendorId = newV.id;
        } catch {
          // Ignore duplicate NPWP constraint if already registered
        }
      }
    }

    const created = await prisma.pettyCashSubmission.create({
      data: {
        submissionNo,
        type,
        year: now.getFullYear(),
        businessUnitId: resolvedBuId || undefined,
        applicantName,
        applicantUnit,
        applicantPhone,
        expenseCategory,
        draUkCode,
        draUkName,
        coaCode,
        coaName,
        activityDescription: activityDescription || `SPJ ${type} - ${draUkName}`,
        vendorId: linkedVendorId || undefined,
        vendorName,
        vendorTaxId,
        vendorIdentityName,
        isSaveVendor,
        transactionDate: new Date(transactionDateStr),
        paymentMethod,
        transactionType,
        territoryType,
        totalTransaction: dppVal,
        nonTaxableAmount,
        taxableAmount: dppVal,
        taxType: taxCategory,
        taxDetail: taxDetailStatus,
        dppPpn: dppVal,
        dppPph: dppVal,
        taxRatePercent: pphRate,
        pphAmount: pphAmt,
        ppnAmount: ppnAmt,
        netDisbursement: netDisb,
        taxFormulas: body.taxCalculation?.formulas || [],
        invoiceDocNo,
        invoiceDocDate: new Date(invoiceDocDateStr),
        invoiceDocFile,
        receiptUtDocNo,
        receiptUtDocDate: new Date(invoiceDocDateStr),
        receiptUtDocFile,
        status: submitImmediately ? 'SUBMITTED' : 'DRAFT',
        items: {
          create: mappedItems,
        },
      },
      include: { items: true, businessUnit: true },
    });

    await recordAuditLog({
      action: 'CREATE',
      module: 'PETTY_CASH',
      entityType: 'PettyCashSubmission',
      entityId: created.id,
      entityCode: created.submissionNo,
      actorId: req.user?.userId,
      actorName: req.user?.fullName || 'User',
      actorRole: req.user?.roleCode || 'USER',
      summary: `Pengajuan ${created.type} ${created.submissionNo} (${created.status}) dibuat oleh ${created.applicantName}`,
      afterData: {
        submissionNo: created.submissionNo,
        type: created.type,
        status: created.status,
        totalTransaction: toNumber(created.totalTransaction),
        taxType: created.taxType,
        pphAmount: toNumber(created.pphAmount),
        ppnAmount: toNumber(created.ppnAmount),
      },
    });

    if (submitImmediately) {
      const aprCount = await prisma.approvalRequest.count();
      await prisma.approvalRequest.create({
        data: {
          requestNumber: `APR-PC-${String(aprCount + 1).padStart(4, '0')}`,
          module: 'PETTY_CASH',
          entityId: created.id,
          entityCode: created.submissionNo,
          title: `Persetujuan SPJ ${created.type}: ${created.activityDescription}`,
          businessUnitId: created.businessUnitId,
          amount: created.totalTransaction,
          status: 'PENDING',
          requestedById: req.user?.userId || 'USER',
          requestedByName: req.user?.fullName || created.applicantName,
          requiredRoleCode: 'FINANCE_MANAGER',
        },
      });
    }

    res.status(201).json({
      success: true,
      data: formatSubmissionRecord(created),
      message: submitImmediately
        ? `Pengajuan ${type} (${submissionNo}) berhasil dikirim ke antrean verifikasi pajak.`
        : `Draft pengajuan ${type} (${submissionNo}) berhasil disimpan.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 6. SUBMIT DRAFT
pettyCashRouter.post('/submissions/:id/submit', async (req, res, next) => {
  try {
    const sub = await prisma.pettyCashSubmission.findUnique({ where: { id: req.params.id } });
    if (!sub) throw new AppError(404, 'NOT_FOUND', 'Pengajuan tidak ditemukan.');
    if (sub.status !== 'DRAFT') {
      throw new AppError(409, 'INVALID_STATE', `Hanya pengajuan berstatus DRAFT yang dapat dikirim.`);
    }

    const updated = await prisma.pettyCashSubmission.update({
      where: { id: sub.id },
      data: { status: 'SUBMITTED' },
      include: { items: true, businessUnit: true },
    });

    const aprCount = await prisma.approvalRequest.count();
    await prisma.approvalRequest.create({
      data: {
        requestNumber: `APR-PC-${String(aprCount + 1).padStart(4, '0')}`,
        module: 'PETTY_CASH',
        entityId: updated.id,
        entityCode: updated.submissionNo,
        title: `Persetujuan SPJ ${updated.type}: ${updated.activityDescription}`,
        businessUnitId: updated.businessUnitId,
        amount: updated.totalTransaction,
        status: 'PENDING',
        requestedById: req.user?.userId || 'USER',
        requestedByName: req.user?.fullName || updated.applicantName,
        requiredRoleCode: 'FINANCE_MANAGER',
      },
    });

    res.json({
      success: true,
      data: formatSubmissionRecord(updated),
      message: `Pengajuan ${sub.submissionNo} berhasil dikirim ke Verifikator Pajak.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 7. TAX & SPJ VERIFICATION
pettyCashRouter.post('/submissions/:id/verify-tax', async (req, res, next) => {
  try {
    const sub = await prisma.pettyCashSubmission.findUnique({ where: { id: req.params.id } });
    if (!sub) throw new AppError(404, 'NOT_FOUND', 'Pengajuan tidak ditemukan.');
    if (sub.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', `Status ${sub.status} tidak dapat diverifikasi pajak.`);
    }

    const updated = await prisma.pettyCashSubmission.update({
      where: { id: sub.id },
      data: {
        status: 'TAX_VERIFIED',
        verifiedTaxBy: req.user?.fullName || 'Verifikator Pajak PMO',
        verifiedTaxAt: new Date(),
      },
      include: { items: true, businessUnit: true },
    });

    await recordAuditLog({
      action: 'APPROVE',
      module: 'PETTY_CASH',
      entityType: 'PettyCashSubmission',
      entityId: sub.id,
      entityCode: sub.submissionNo,
      actorId: req.user?.userId,
      actorName: req.user?.fullName || 'User',
      actorRole: req.user?.roleCode || 'USER',
      summary: `Verifikasi kepatuhan pajak disetujui untuk ajuan ${sub.submissionNo}`,
      afterData: { action: 'VERIFY_TAX', submissionNo: sub.submissionNo },
    });

    res.json({
      success: true,
      data: formatSubmissionRecord(updated),
      message: `Kepatuhan pajak pengajuan ${sub.submissionNo} terverifikasi. Siap disetujui Bendahara.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 8. BENDAHARA / FINANCE MANAGER APPROVAL
pettyCashRouter.post('/submissions/:id/approve', async (req, res, next) => {
  try {
    const sub = await prisma.pettyCashSubmission.findUnique({ where: { id: req.params.id } });
    if (!sub) throw new AppError(404, 'NOT_FOUND', 'Pengajuan tidak ditemukan.');
    if (!['SUBMITTED', 'TAX_VERIFIED'].includes(sub.status)) {
      throw new AppError(409, 'INVALID_STATE', `Status ${sub.status} belum dapat disetujui bendahara.`);
    }

    const updated = await prisma.pettyCashSubmission.update({
      where: { id: sub.id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user?.fullName || 'Finance Manager PMO',
        approvedAt: new Date(),
      },
      include: { items: true, businessUnit: true },
    });

    await prisma.approvalRequest.updateMany({
      where: { module: 'PETTY_CASH', entityId: sub.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        decidedById: req.user?.userId || 'SYSTEM',
        decidedByName: req.user?.fullName || 'Finance Manager',
        decidedAt: new Date(),
        decisionNote: req.body?.note || 'Disetujui oleh Finance Manager / Bendahara.',
      },
    });

    res.json({
      success: true,
      data: formatSubmissionRecord(updated),
      message: `Pengajuan ${sub.submissionNo} telah disetujui oleh Finance Manager / Bendahara.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 8.1 REJECT SUBMISSION
pettyCashRouter.post('/submissions/:id/reject', async (req, res, next) => {
  try {
    const reason = z.string().min(5, 'Alasan penolakan wajib diisi minimal 5 karakter.').parse(req.body?.reason);
    const sub = await prisma.pettyCashSubmission.findUnique({ where: { id: req.params.id } });
    if (!sub) throw new AppError(404, 'NOT_FOUND', 'Pengajuan tidak ditemukan.');
    if (!['SUBMITTED', 'TAX_VERIFIED'].includes(sub.status)) {
      throw new AppError(409, 'INVALID_STATE', `Status ${sub.status} tidak dapat ditolak.`);
    }

    const updated = await prisma.pettyCashSubmission.update({
      where: { id: sub.id },
      data: {
        status: 'REJECTED',
      },
      include: { items: true, businessUnit: true },
    });

    await prisma.approvalRequest.updateMany({
      where: { module: 'PETTY_CASH', entityId: sub.id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        decidedById: req.user?.userId || 'SYSTEM',
        decidedByName: req.user?.fullName || 'Finance Manager',
        decidedAt: new Date(),
        decisionNote: reason.trim(),
      },
    });

    await recordAuditLog({
      action: 'REJECT',
      module: 'PETTY_CASH',
      entityType: 'PettyCashSubmission',
      entityId: sub.id,
      entityCode: sub.submissionNo,
      actorId: req.user?.userId,
      actorName: req.user?.fullName || 'User',
      actorRole: req.user?.roleCode || 'USER',
      summary: `Menolak pengajuan ${sub.type} ${sub.submissionNo} dengan alasan: ${reason.trim()}`,
      afterData: { status: 'REJECTED', rejectionReason: reason.trim() },
    });

    res.json({
      success: true,
      data: formatSubmissionRecord(updated),
      message: `Pengajuan ${sub.submissionNo} telah ditolak.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 9. CAIRKAN DANA (REIMBURSEMENT GUP) / NIHILISASI (TUP NIHIL)
pettyCashRouter.post('/submissions/:id/disburse', async (req, res, next) => {
  try {
    const sub = await prisma.pettyCashSubmission.findUnique({ where: { id: req.params.id } });
    if (!sub) throw new AppError(404, 'NOT_FOUND', 'Pengajuan tidak ditemukan.');
    if (sub.status !== 'APPROVED') {
      throw new AppError(409, 'INVALID_STATE', `Pengajuan harus berstatus APPROVED sebelum dicairkan.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Tentukan akun Beban Operasional (Debit)
      let expenseAccount = sub.coaCode;
      if (!expenseAccount || expenseAccount.includes('-')) {
        const officialExpense = await tx.chartOfAccount.findUnique({ where: { code: '520901020100' } });
        expenseAccount = officialExpense ? '520901020100' : (expenseAccount || '5-1200');
      }

      // 2. Tentukan akun Kredit Kas/Bank atau UMK
      const isGup = sub.type === 'GUP';
      let creditAccount = isGup ? '110101020200' : '110501010100';
      const checkCredit = await tx.chartOfAccount.findUnique({ where: { code: creditAccount } });
      if (!checkCredit) {
        creditAccount = isGup ? '1-1120' : '1-1110';
      }

      // 3. Susun baris jurnal (Debit & Kredit Seimbang)
      const lines = [];

      // Sisi Debet: Total Belanja Operasional
      lines.push({
        accountCode: expenseAccount,
        description: `Beban SPJ ${sub.type} ${sub.submissionNo}: ${sub.activityDescription}`,
        debit: sub.totalTransaction.toString(),
        credit: '0.00',
      });

      // Potongan Pajak PPh & PPN
      const pphCents = BigInt(Math.round(Number(sub.pphAmount) * 100));
      const ppnCents = BigInt(Math.round(Number(sub.ppnAmount) * 100));
      let taxLinesTotalCents = 0n;

      if (pphCents > 0n) {
        let pphAccount = '210201010100';
        const checkPph = await tx.chartOfAccount.findUnique({ where: { code: pphAccount } });
        if (!checkPph) pphAccount = '2-1200';
        lines.push({
          accountCode: pphAccount,
          description: `Potongan Pajak PPh SPJ ${sub.submissionNo} (${sub.taxType || 'PPh'})`,
          debit: '0.00',
          credit: sub.pphAmount.toString(),
        });
        taxLinesTotalCents += pphCents;
      }

      if (ppnCents > 0n) {
        let ppnAccount = '210202010100';
        const checkPpn = await tx.chartOfAccount.findUnique({ where: { code: ppnAccount } });
        if (!checkPpn) ppnAccount = '2-1200';
        lines.push({
          accountCode: ppnAccount,
          description: `Potongan Pajak PPN SPJ ${sub.submissionNo}`,
          debit: '0.00',
          credit: sub.ppnAmount.toString(),
        });
        taxLinesTotalCents += ppnCents;
      }

      // Sisi Kredit: Kas Bank atau Panjar UMK (Netto)
      const totCents = BigInt(Math.round(Number(sub.totalTransaction) * 100));
      const netPaymentCents = totCents - taxLinesTotalCents;
      const netPaymentStr = (Number(netPaymentCents) / 100).toFixed(2);

      lines.push({
        accountCode: creditAccount,
        description: isGup
          ? `Pencairan Kas Operasional GUP ${sub.submissionNo} untuk ${sub.applicantName} (${sub.applicantUnit})`
          : `Pertanggungjawaban Panjar UMK ${sub.submissionNo} untuk ${sub.applicantName}`,
        debit: '0.00',
        credit: netPaymentStr,
      });

      // 4. Resolve Business Unit ID for General Ledger
      let targetBuId = sub.businessUnitId;
      if (!targetBuId) {
        const defaultBu = await tx.businessUnit.findFirst({ select: { id: true } });
        targetBuId = defaultBu ? defaultBu.id : 'BU-DEFAULT';
      }

      // 5. Auto-post Balanced Double-Entry Journal
      const journal = await createOrGetBalancedJournal(
        {
          entryDate: new Date(),
          businessUnitId: targetBuId,
          sourceType: 'PETTY_CASH',
          sourceId: sub.id,
          sourceDocNumber: sub.submissionNo,
          idempotencyKey: `PETTYCASH_DISBURSE_${sub.id}`,
          description: isGup
            ? `Pencairan Penggantian Uang Persediaan (GUP) ${sub.submissionNo}: ${sub.activityDescription}`
            : `Pertanggungjawaban & Nihilisasi TUP Panjar ${sub.submissionNo}: ${sub.activityDescription}`,
          createdById: req.user?.userId || 'SYSTEM',
          createdByName: req.user?.fullName || 'Petty Cash Automation',
          lines,
        },
        tx
      );

      // 6. Update submission record
      const updated = await tx.pettyCashSubmission.update({
        where: { id: sub.id },
        data: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
          journalEntryId: journal.id,
        },
        include: { items: true, businessUnit: true },
      });

      await recordAuditLog(
        {
          actorId: req.user?.userId || 'SYSTEM',
          actorName: req.user?.fullName || 'Petty Cash Automation',
          actorRole: req.user?.roleCode || 'CASHIER',
          action: 'PETTY_CASH_DISBURSED',
          module: 'PETTY_CASH',
          entityType: 'PettyCashSubmission',
          entityId: sub.id,
          entityCode: sub.submissionNo,
          summary: `Mencairkan dana ${sub.type} ${sub.submissionNo} sebesar Rp ${toNumber(sub.netDisbursement).toLocaleString('id-ID')} dengan Jurnal ${journal.journalNumber}`,
          afterData: { submissionNo: sub.submissionNo, journalNumber: journal.journalNumber },
          requestId: req.requestId,
        },
        tx as any
      );

      return { updated, journal };
    });

    res.json({
      success: true,
      data: {
        ...formatSubmissionRecord(result.updated, result.journal.journalNumber),
        submission: formatSubmissionRecord(result.updated, result.journal.journalNumber),
        journalDocNo: result.journal.journalNumber,
        journal: result.journal,
      },
      message:
        sub.type === 'GUP'
          ? `Penggantian Uang Persediaan (GUP) ${sub.submissionNo} sebesar Rp ${toNumber(sub.netDisbursement).toLocaleString('id-ID')} telah dicairkan ke kas unit (Jurnal: ${result.journal.journalNumber}).`
          : `Pertanggungjawaban TUP Nihil ${sub.submissionNo} telah diselesaikan (Jurnal Nihilisasi: ${result.journal.journalNumber}).`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
