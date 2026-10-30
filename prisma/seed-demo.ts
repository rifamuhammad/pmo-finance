import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/shared/security.js';

const prisma = new PrismaClient();

function computeLineFingerprint(bankAccountId: string, dateStr: string, refNo: string, direction: string, amountStr: string): string {
  const raw = `${bankAccountId}|${dateStr.slice(0, 10)}|${refNo.trim().toUpperCase()}|${direction}|${amountStr}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

async function main() {
  console.log('Memulai proses seed DATA DEMO untuk ERP Keuangan & Operasional PMO UTama...');

  // Clean existing tables in dependency order
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.fileAttachment.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.approvalPolicy.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.strategicEvaluation.deleteMany();
  await prisma.fixedAsset.deleteMany();
  await prisma.taxConfiguration.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.accountMapping.deleteMany();
  await prisma.chartOfAccount.deleteMany();
  await prisma.bankStatementLine.deleteMany();
  await prisma.bankStatementImport.deleteMany();
  await prisma.cashDeposit.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.cashierSession.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.customerInvoiceLine.deleteMany();
  await prisma.customerInvoice.deleteMany();
  await prisma.salesOrderLine.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.productPriceHistory.deleteMany();
  await prisma.productService.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.vendorInvoice.deleteMany();
  await prisma.goodsReceiptLine.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.vendorQuotation.deleteMany();
  await prisma.purchaseRequestLine.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.budgetCommitment.deleteMany();
  await prisma.budgetRevision.deleteMany();
  await prisma.budgetLine.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.costCenter.deleteMany();
  await prisma.fundSource.deleteMany();
  await prisma.fiscalPeriod.deleteMany();
  await prisma.businessUnit.deleteMany();

  // 1. System Settings (Explicitly Configurable, Not Hardcoded)
  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'APP_BRAND_NAME',
        value: 'ERP Keuangan & Operasional PMO UTama',
        category: 'BRANDING',
        description: 'Nama aplikasi pada sidebar dan laporan (dapat dikonfigurasi)',
      },
      {
        key: 'APP_BRAND_MARKER',
        value: '[PMO UTAMA]',
        category: 'BRANDING',
        description: 'Penanda teks identitas brand (menggantikan logo grafis sampai aset resmi disahkan)',
      },
      {
        key: 'DEMO_MODE_BANNER',
        value: 'DATA DEMO - Lingkungan Simulasi & Evaluasi Internal (Bukan Data Keuangan Produksi)',
        category: 'ENVIRONMENT',
        description: 'Penanda eksplisit data demo sesuai aturan kejujuran data',
      },
      {
        key: 'MIN_VENDOR_QUOTATIONS',
        value: '3',
        category: 'PROCUREMENT_POLICY',
        description: 'Jumlah minimum penawaran vendor sebelum penerbitan PO tanpa alasan exception',
      },
      {
        key: 'CASHIER_DISCREPANCY_THRESHOLD_IDR',
        value: '50000',
        category: 'CASHIER_POLICY',
        description: 'Ambang batas selisih kas fisik kasir yang wajib mendapatkan persetujuan Finance Manager',
      },
      {
        key: 'PR_GM_APPROVAL_LIMIT_IDR',
        value: '25000000',
        category: 'APPROVAL_POLICY',
        description: 'Batas nilai PR yang membutuhkan eskalasi persetujuan ke GM PMO',
      },
    ],
  });

  // 2. Roles & Granular Permissions
  const rolesData = [
    {
      code: 'SUPER_ADMIN',
      name: 'Super Admin / System Administrator',
      description: 'Pengelola penuh master data, role RBAC, otorisasi menu, dan akun pengguna dengan hak akses penuh (*).',
      approvalLimit: '0.00',
      permissions: ['*'],
    },
    {
      code: 'GM_PMO',
      name: 'General Manager PMO',
      description: 'Melihat dashboard strategis, menyetujui anggaran/revisi, PR bernilai besar, dan keputusan evaluasi strategis.',
      approvalLimit: '5000000000.00',
      permissions: [
        'budget:view',
        'budget:approve',
        'procurement:view',
        'procurement:approve',
        'expense:view',
        'expense:approve',
        'revenue:view',
        'payment:view',
        'cashier:view',
        'reconciliation:view',
        'accounting:view',
        'report:view',
        'report:export',
        'strategy:view',
        'strategy:manage',
        'audit:view',
        'admin:view',
      ],
    },
    {
      code: 'UNIT_MANAGER',
      name: 'Manager Unit Bisnis',
      description: 'Menyusun anggaran unit, mengajukan PR dan biaya operasional unit, serta mengelola pesanan pelanggan unit.',
      approvalLimit: '10000000.00',
      permissions: [
        'budget:view',
        'budget:create',
        'budget:submit',
        'procurement:view',
        'procurement:create',
        'expense:view',
        'expense:create',
        'revenue:view',
        'revenue:create',
        'payment:view',
        'report:view',
      ],
    },
    {
      code: 'PROCUREMENT',
      name: 'Procurement Officer',
      description: 'Mengelola vendor, penawaran kuotasi, Purchase Request, Purchase Order, dan penerimaan barang/jasa.',
      approvalLimit: '15000000.00',
      permissions: [
        'budget:view',
        'procurement:view',
        'procurement:create',
        'expense:view',
        'report:view',
      ],
    },
    {
      code: 'FINANCE_MANAGER',
      name: 'Finance Manager',
      description: 'Memverifikasi biaya, menyetujui PR/pengeluaran sesuai limit, mencairkan pembayaran, dan mengawasi rekonsiliasi bank.',
      approvalLimit: '250000000.00',
      permissions: [
        'budget:view',
        'budget:create',
        'budget:submit',
        'budget:approve',
        'procurement:view',
        'procurement:approve',
        'expense:view',
        'expense:create',
        'expense:approve',
        'expense:pay',
        'revenue:view',
        'payment:view',
        'payment:create',
        'payment:approve',
        'cashier:view',
        'reconciliation:view',
        'reconciliation:manage',
        'accounting:view',
        'report:view',
        'report:export',
        'strategy:view',
        'strategy:manage',
        'audit:view',
      ],
    },
    {
      code: 'ACCOUNTING',
      name: 'Accounting Officer',
      description: 'Mengelola Chart of Accounts, jurnal umum, buku besar, penutupan periode, aset tetap, dan laporan akuntansi.',
      approvalLimit: '0.00',
      permissions: [
        'budget:view',
        'expense:view',
        'revenue:view',
        'payment:view',
        'reconciliation:view',
        'accounting:view',
        'accounting:manage',
        'accounting:post',
        'report:view',
        'report:export',
        'audit:view',
      ],
    },
    {
      code: 'TAX_OFFICER',
      name: 'Tax Officer',
      description: 'Mengelola konfigurasi tarif pajak, memeriksa kepatuhan dokumen PPN/PPh, dan melihat rekap perpajakan.',
      approvalLimit: '0.00',
      permissions: [
        'procurement:view',
        'expense:view',
        'revenue:view',
        'accounting:view',
        'accounting:manage',
        'report:view',
        'report:export',
      ],
    },
    {
      code: 'CASHIER',
      name: 'Cashier / Petugas Kasir',
      description: 'Membuka sesi kasir, menerima pembayaran pelanggan, menutup sesi kasir (closeout), dan mencatat setoran bank.',
      approvalLimit: '0.00',
      permissions: [
        'revenue:view',
        'payment:view',
        'payment:create',
        'cashier:view',
        'cashier:operate',
      ],
    },
    {
      code: 'AUDITOR',
      name: 'Internal Auditor (Read-Only)',
      description: 'Melihat seluruh transaksi, laporan keuangan, dan jejak audit trail tanpa hak mengubah data.',
      approvalLimit: '0.00',
      permissions: [
        'budget:view',
        'procurement:view',
        'expense:view',
        'revenue:view',
        'payment:view',
        'cashier:view',
        'reconciliation:view',
        'accounting:view',
        'report:view',
        'strategy:view',
        'audit:view',
        'admin:view',
      ],
    },
  ];

  for (const r of rolesData) {
    await prisma.role.create({ data: r });
  }

  // 3. Business Units (4 Divisi Utama PMO UTama + Kantor Pusat), Cost Centers, Fund Sources & Fiscal Periods
  const unitItSolution = await prisma.businessUnit.create({
    data: {
      code: 'BU-ITS',
      name: 'Divisi IT Solution',
      type: 'REVENUE_CENTER',
      managerName: 'Nadia Kusuma, S.Kom',
    },
  });

  const unitMice = await prisma.businessUnit.create({
    data: {
      code: 'BU-MICE',
      name: 'Divisi MICE (Wisma, Ballroom & F&B)',
      type: 'REVENUE_CENTER',
      managerName: 'Bambang Hartono, SE',
    },
  });

  const unitTci = await prisma.businessUnit.create({
    data: {
      code: 'BU-TCI',
      name: 'Divisi TCI (Training, Certification & Innovation)',
      type: 'REVENUE_CENTER',
      managerName: 'Rendra Pratama, M.Kom',
    },
  });

  const unitKlinik = await prisma.businessUnit.create({
    data: {
      code: 'BU-KLINIK',
      name: 'Divisi Klinik Pratama',
      type: 'REVENUE_CENTER',
      managerName: 'dr. Farida Rahmawati',
    },
  });

  const unitPusat = await prisma.businessUnit.create({
    data: {
      code: 'BU-PUSAT',
      name: 'Operasional & Kantor Pusat PMO',
      type: 'COST_CENTER',
      managerName: 'Darmawan Setiadi',
    },
  });

  // Backward compatibility alias for existing seed routines
  const unitDiklat = unitTci;
  const unitKonsultansi = unitItSolution;
  const unitOps = unitPusat;

  // Cost Centers per Division
  const ccItsEng = await prisma.costCenter.create({
    data: { code: 'CC-ITS-01', name: 'Software Engineering & Cloud Hosting', businessUnitId: unitItSolution.id },
  });
  const ccItsSec = await prisma.costCenter.create({
    data: { code: 'CC-ITS-02', name: 'IT Infrastructure & Cyber Security', businessUnitId: unitItSolution.id },
  });

  const ccMiceRoom = await prisma.costCenter.create({
    data: { code: 'CC-MICE-01', name: 'Wisma, Kamar & Front Office', businessUnitId: unitMice.id },
  });
  const ccMiceEvent = await prisma.costCenter.create({
    data: { code: 'CC-MICE-02', name: 'Ballroom, Banquet & Catering Event', businessUnitId: unitMice.id },
  });

  const ccDiklatProg = await prisma.costCenter.create({
    data: { code: 'CC-TCI-01', name: 'Penyelenggaraan Workshop & Sertifikasi', businessUnitId: unitTci.id },
  });
  const ccDiklatLab = await prisma.costCenter.create({
    data: { code: 'CC-TCI-02', name: 'Infrastruktur Kelas & Modul Digital', businessUnitId: unitTci.id },
  });
  const ccKonsulProj = ccItsEng;

  const ccKlnMedis = await prisma.costCenter.create({
    data: { code: 'CC-KLN-01', name: 'Poli Umum & Layanan Medis', businessUnitId: unitKlinik.id },
  });
  const ccKlnFarmasi = await prisma.costCenter.create({
    data: { code: 'CC-KLN-02', name: 'Instalasi Farmasi, Obat & Laboratorium', businessUnitId: unitKlinik.id },
  });

  const ccOpsUmum = await prisma.costCenter.create({
    data: { code: 'CC-OPS-01', name: 'Administrasi & Dukungan PMO Pusat', businessUnitId: unitPusat.id },
  });

  const fundInternal = await prisma.fundSource.create({
    data: {
      code: 'FS-RKAP',
      name: 'Alokasi Modal Kerja RKAP PMO [DATA DEMO]',
      type: 'INTERNAL_ALLOCATION',
      description: 'Plafon anggaran modal kerja tahunan internal PMO UTama',
    },
  });
  const fundRevenue = await prisma.fundSource.create({
    data: {
      code: 'FS-REV',
      name: 'Penerimaan Layanan Komersial Unit [DATA DEMO]',
      type: 'CUSTOMER_REVENUE',
      description: 'Sumber pendanaan kembali dari pendapatan kontrak pelatihan dan konsultansi',
    },
  });

  const period2025Closed = await prisma.fiscalPeriod.create({
    data: {
      code: 'FY-2025',
      name: 'Tahun Buku 2025 (Tertutup)',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2025-12-31T23:59:59.000Z'),
      status: 'CLOSED',
      isClosed: true,
      closedAt: new Date('2026-01-15T10:00:00.000Z'),
    },
  });

  const period2026Open = await prisma.fiscalPeriod.create({
    data: {
      code: 'FY-2026',
      name: 'Tahun Buku 2026 (Aktif)',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      status: 'OPEN',
      isClosed: false,
    },
  });

  // 4. Users for All 9 Roles (Demo Password: DemoErp!2026)
  const demoPassHash = hashPassword('DemoErp!2026');

  const userGm = await prisma.user.create({
    data: {
      email: 'gm@pmoutama.demo.id',
      fullName: 'Ir. Hendra Wijaya, MBA (GM PMO)',
      passwordHash: demoPassHash,
      roleCode: 'GM_PMO',
      businessUnitId: null,
    },
  });

  const userFin = await prisma.user.create({
    data: {
      email: 'finance@pmoutama.demo.id',
      fullName: 'Siti Rahmawati, SE, Ak (Finance Manager)',
      passwordHash: demoPassHash,
      roleCode: 'FINANCE_MANAGER',
      businessUnitId: null,
    },
  });

  const userUnitMgr = await prisma.user.create({
    data: {
      email: 'unit.diklat@pmoutama.demo.id',
      fullName: 'Rendra Pratama, M.Kom (Manager Divisi TCI)',
      passwordHash: demoPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitDiklat.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'unit.tci@pmoutama.demo.id',
      fullName: 'Rendra Pratama, M.Kom (Manager Divisi TCI)',
      passwordHash: demoPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitTci.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'unit.mice@pmoutama.demo.id',
      fullName: 'Bambang Hartono, SE (Manager Divisi MICE)',
      passwordHash: demoPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitMice.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'unit.its@pmoutama.demo.id',
      fullName: 'Nadia Kusuma, S.Kom (Manager Divisi IT Solution)',
      passwordHash: demoPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitItSolution.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'unit.klinik@pmoutama.demo.id',
      fullName: 'dr. Farida Rahmawati (Manager Divisi Klinik Pratama)',
      passwordHash: demoPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitKlinik.id,
    },
  });

  const userProc = await prisma.user.create({
    data: {
      email: 'procurement@pmoutama.demo.id',
      fullName: 'Bagus Santoso (Procurement Officer)',
      passwordHash: demoPassHash,
      roleCode: 'PROCUREMENT',
      businessUnitId: null,
    },
  });

  const userAcc = await prisma.user.create({
    data: {
      email: 'accounting@pmoutama.demo.id',
      fullName: 'Larasati Putri, CPA (Accounting Officer)',
      passwordHash: demoPassHash,
      roleCode: 'ACCOUNTING',
      businessUnitId: null,
    },
  });

  const userCashier = await prisma.user.create({
    data: {
      email: 'kasir@pmoutama.demo.id',
      fullName: 'Dimas Aditya (Petugas Kasir)',
      passwordHash: demoPassHash,
      roleCode: 'CASHIER',
      businessUnitId: unitDiklat.id,
    },
  });

  const userTax = await prisma.user.create({
    data: {
      email: 'tax@pmoutama.demo.id',
      fullName: 'Fajar Nugroho, BKP (Tax Officer)',
      passwordHash: demoPassHash,
      roleCode: 'TAX_OFFICER',
      businessUnitId: null,
    },
  });

  const userAuditor = await prisma.user.create({
    data: {
      email: 'auditor@pmoutama.demo.id',
      fullName: 'Dewi Anggraini, CIA (Internal Auditor)',
      passwordHash: demoPassHash,
      roleCode: 'AUDITOR',
      businessUnitId: null,
    },
  });

  const userAdmin = await prisma.user.create({
    data: {
      email: 'admin@pmoutama.demo.id',
      fullName: 'Arif Budiman (System Administrator)',
      passwordHash: demoPassHash,
      roleCode: 'SUPER_ADMIN',
      businessUnitId: null,
    },
  });

  await prisma.user.create({
    data: {
      email: 'superadmin@pmoutama.id',
      fullName: 'Super Administrator PMO UTama',
      passwordHash: demoPassHash,
      roleCode: 'SUPER_ADMIN',
      businessUnitId: null,
      isDemoData: false,
    },
  });

  // 5. Approval Policies
  await prisma.approvalPolicy.createMany({
    data: [
      {
        module: 'BUDGET',
        name: 'Persetujuan Plafon & Revisi Anggaran Tahunan',
        minAmount: '0.00',
        maxAmount: null,
        requiredRoleCode: 'GM_PMO',
        minQuotations: 0,
        requireSeparationOfDuties: true,
      },
      {
        module: 'PURCHASE_REQUEST',
        name: 'Persetujuan PR Operasional Standar (< Rp 25 Juta)',
        minAmount: '0.00',
        maxAmount: '25000000.00',
        requiredRoleCode: 'FINANCE_MANAGER',
        minQuotations: 3,
        requireSeparationOfDuties: true,
      },
      {
        module: 'PURCHASE_REQUEST',
        name: 'Persetujuan PR Nilai Strategis (>= Rp 25 Juta)',
        minAmount: '25000000.00',
        maxAmount: null,
        requiredRoleCode: 'GM_PMO',
        minQuotations: 3,
        requireSeparationOfDuties: true,
      },
      {
        module: 'EXPENSE',
        name: 'Verifikasi & Persetujuan Pencairan Biaya',
        minAmount: '0.00',
        maxAmount: null,
        requiredRoleCode: 'FINANCE_MANAGER',
        minQuotations: 0,
        requireSeparationOfDuties: true,
      },
    ],
  });

  // 6. Chart of Accounts (COA) & Account Mappings
  const coaList = [
    { code: '1-1110', name: 'Kas Operasional & Kasir (On-Hand)', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '1-1120', name: 'Bank Mandiri Operasional PMO', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '1-1130', name: 'Bank BNI Penerimaan Pelanggan', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '1-1210', name: 'Piutang Usaha Pelanggan (AR Control)', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: true },
    { code: '1-1310', name: 'PPN Masukan Dapat Dikreditkan', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '1-2110', name: 'Aset Tetap - Peralatan TI & Multimedia', type: 'ASSET', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '2-1110', name: 'Utang Usaha Vendor (AP Control)', type: 'LIABILITY', normalBalance: 'CREDIT', isControlAccount: true },
    { code: '2-1210', name: 'Utang PPN Keluaran', type: 'LIABILITY', normalBalance: 'CREDIT', isControlAccount: false },
    { code: '2-1220', name: 'Utang PPh Pasal 23 / 21', type: 'LIABILITY', normalBalance: 'CREDIT', isControlAccount: false },
    { code: '3-1100', name: 'Modal Kerja Awal & Dana Cadangan PMO', type: 'EQUITY', normalBalance: 'CREDIT', isControlAccount: false },
    { code: '4-1100', name: 'Pendapatan Pelatihan & Sertifikasi', type: 'REVENUE', normalBalance: 'CREDIT', isControlAccount: false },
    { code: '4-1200', name: 'Pendapatan Konsultansi & Riset Terapan', type: 'REVENUE', normalBalance: 'CREDIT', isControlAccount: false },
    { code: '5-1100', name: 'Beban Penyelenggaraan Program & Modul', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '5-1200', name: 'Beban Pengadaan Lisensi & Infrastruktur TI', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '5-1300', name: 'Beban Honorarium Instruktur & Tenaga Ahli', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '5-1400', name: 'Beban Operasional Kantor & Utilitas PMO', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: false },
    { code: '5-1500', name: 'Beban Administrasi Bank & Payment Gateway', type: 'EXPENSE', normalBalance: 'DEBIT', isControlAccount: false },
  ];

  for (const c of coaList) {
    await prisma.chartOfAccount.create({ data: c });
  }

  await prisma.accountMapping.createMany({
    data: [
      {
        transactionType: 'CUSTOMER_INVOICE_ISSUED',
        description: 'Pengakuan piutang dan pendapatan saat invoice pelanggan diterbitkan',
        debitAccountCode: '1-1210',
        creditAccountCode: '4-1100',
      },
      {
        transactionType: 'CUSTOMER_PAYMENT_RECEIVED',
        description: 'Penerimaan kas/bank atas pelunasan piutang pelanggan',
        debitAccountCode: '1-1120',
        creditAccountCode: '1-1210',
      },
      {
        transactionType: 'OPERATIONAL_EXPENSE_PAID',
        description: 'Pencairan biaya operasional dari rekening bank',
        debitAccountCode: '5-1100',
        creditAccountCode: '1-1120',
      },
      {
        transactionType: 'CASHIER_BANK_DEPOSIT',
        description: 'Setoran uang tunai kasir ke rekening bank operasional',
        debitAccountCode: '1-1120',
        creditAccountCode: '1-1110',
      },
    ],
  });

  // 7. Tax Configurations (Versioned & Configurable)
  await prisma.taxConfiguration.createMany({
    data: [
      {
        taxCode: 'PPN-11',
        name: 'PPN Standar 11% (Konfigurasi Internal)',
        taxType: 'PPN',
        ratePercent: '11.00',
        effectiveFrom: new Date('2022-04-01T00:00:00.000Z'),
        version: 1,
        isInclusive: false,
        notes: 'Tarif dapat diperbarui oleh Tax Officer sesuai regulasi yang berlaku.',
      },
      {
        taxCode: 'PPH23-JASA',
        name: 'PPh Pasal 23 Jasa Konsultansi/Teknik (2%)',
        taxType: 'PPH23',
        ratePercent: '2.00',
        effectiveFrom: new Date('2022-01-01T00:00:00.000Z'),
        version: 1,
        isInclusive: false,
        notes: 'Pemotongan pajak atas jasa vendor ber-NPWP.',
      },
      {
        taxCode: 'NON-PKP',
        name: 'Transaksi Bebas / Non-Objek PPN (0%)',
        taxType: 'PPN',
        ratePercent: '0.00',
        effectiveFrom: new Date('2022-01-01T00:00:00.000Z'),
        version: 1,
        isInclusive: false,
      },
    ],
  });

  // 8. Budgets (Approved Budget for Diklat, Approved Budget for Konsultansi, Pending Submitted Budget for Sekretariat)
  const budgetDiklat = await prisma.budget.create({
    data: {
      docNumber: 'BDG-FY-2026-001',
      title: 'Anggaran Operasional & Infrastruktur Unit Diklat 2026 [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      fiscalPeriodId: period2026Open.id,
      fundSourceId: fundInternal.id,
      version: 2,
      status: 'REVISED',
      totalAllocated: '350000000.00',
      totalCommitted: '24420000.00',
      totalActual: '49950000.00',
      revenueTarget: '650000000.00',
      notes: 'Anggaran telah direvisi pada Q2 untuk mengakomodasi upgrade perangkat kelas hybrid.',
      createdById: userUnitMgr.id,
      createdByName: userUnitMgr.fullName,
      submittedAt: new Date('2026-01-05T08:00:00.000Z'),
      approvedById: userGm.id,
      approvedByName: userGm.fullName,
      approvedAt: new Date('2026-01-08T14:30:00.000Z'),
    },
  });

  const bLineDiklatCapex = await prisma.budgetLine.create({
    data: {
      budgetId: budgetDiklat.id,
      costCenterId: ccDiklatLab.id,
      accountCode: '5-1200',
      category: 'CAPEX',
      description: 'Pengadaan Perangkat Kelas Hybrid & Server Lab Sertifikasi',
      allocatedAmount: '150000000.00',
      committedAmount: '24420000.00',
      actualAmount: '33300000.00',
    },
  });

  const bLineDiklatOpex = await prisma.budgetLine.create({
    data: {
      budgetId: budgetDiklat.id,
      costCenterId: ccDiklatProg.id,
      accountCode: '5-1100',
      category: 'OPEX',
      description: 'Penyelenggaraan Workshop, Konsumsi, dan Kit Peserta',
      allocatedAmount: '120000000.00',
      committedAmount: '0.00',
      actualAmount: '16650000.00',
    },
  });

  const bLineDiklatHonor = await prisma.budgetLine.create({
    data: {
      budgetId: budgetDiklat.id,
      costCenterId: ccDiklatProg.id,
      accountCode: '5-1300',
      category: 'PEGAWAI',
      description: 'Honorarium Instruktur & Asesor Sertifikasi',
      allocatedAmount: '80000000.00',
      committedAmount: '0.00',
      actualAmount: '0.00',
    },
  });

  await prisma.budgetRevision.create({
    data: {
      budgetId: budgetDiklat.id,
      version: 1,
      reason: 'Penambahan alokasi Rp 30.000.000 pada pos perangkat kelas hybrid karena peningkatan kuota peserta.',
      previousAllocated: '320000000.00',
      newAllocated: '350000000.00',
      snapshotData: [
        { category: 'CAPEX', description: 'Pengadaan Perangkat Kelas Hybrid', allocatedAmount: '120000000.00' },
        { category: 'OPEX', description: 'Penyelenggaraan Workshop', allocatedAmount: '120000000.00' },
        { category: 'PEGAWAI', description: 'Honorarium Instruktur', allocatedAmount: '80000000.00' },
      ],
      revisedById: userFin.id,
      revisedByName: userFin.fullName,
      approvedById: userGm.id,
      status: 'APPROVED',
    },
  });

  const budgetKonsul = await prisma.budget.create({
    data: {
      docNumber: 'BDG-FY-2026-002',
      title: 'Anggaran Proyek Konsultansi & Riset Terapan 2026 [DATA DEMO]',
      businessUnitId: unitKonsultansi.id,
      fiscalPeriodId: period2026Open.id,
      fundSourceId: fundRevenue.id,
      version: 1,
      status: 'APPROVED',
      totalAllocated: '220000000.00',
      totalCommitted: '0.00',
      totalActual: '18500000.00',
      revenueTarget: '480000000.00',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      submittedAt: new Date('2026-01-10T09:00:00.000Z'),
      approvedById: userGm.id,
      approvedByName: userGm.fullName,
      approvedAt: new Date('2026-01-12T11:00:00.000Z'),
    },
  });

  const bLineKonsulOpex = await prisma.budgetLine.create({
    data: {
      budgetId: budgetKonsul.id,
      costCenterId: ccKonsulProj.id,
      accountCode: '5-1300',
      category: 'OPEX',
      description: 'Survei Lapangan, Tenaga Ahli Riset & Publikasi Laporan',
      allocatedAmount: '220000000.00',
      committedAmount: '0.00',
      actualAmount: '18500000.00',
    },
  });

  const budgetSekreSubmitted = await prisma.budget.create({
    data: {
      docNumber: 'BDG-FY-2026-003',
      title: 'Usulan Anggaran Pemeliharaan Sistem & Keamanan Data PMO [DATA DEMO]',
      businessUnitId: unitOps.id,
      fiscalPeriodId: period2026Open.id,
      fundSourceId: fundInternal.id,
      version: 1,
      status: 'SUBMITTED',
      totalAllocated: '95000000.00',
      totalCommitted: '0.00',
      totalActual: '0.00',
      revenueTarget: '0.00',
      notes: 'Menunggu persetujuan GM PMO untuk pembaruan lisensi tahunan dan audit berkala.',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      submittedAt: new Date('2026-10-25T10:00:00.000Z'),
    },
  });

  await prisma.budgetLine.create({
    data: {
      budgetId: budgetSekreSubmitted.id,
      costCenterId: ccOpsUmum.id,
      accountCode: '5-1400',
      category: 'OPEX',
      description: 'Lisensi Cloud Backup & Pemeliharaan Server Internal',
      allocatedAmount: '95000000.00',
      committedAmount: '0.00',
      actualAmount: '0.00',
    },
  });

  // 9. Vendors (3 Active Vendors + 1 Under Review)
  const vendorMitra = await prisma.vendor.create({
    data: {
      code: 'VND-0001',
      name: 'PT Mitra Solusi Integrasi [DATA DEMO]',
      legalName: 'PT Mitra Solusi Integrasi Nusantara',
      taxIdNpwp: '01.234.567.8-012.000',
      category: 'Perangkat TI & Infrastruktur',
      contactName: 'Haryanto Wibowo',
      email: 'sales@mitrasolusi.demo.id',
      phone: '021-5550192',
      address: 'Jl. Gatot Subroto Kav. 32, Jakarta Selatan',
      bankName: 'Bank Mandiri',
      bankAccountNo: '1240098765432',
      bankAccountHolder: 'PT Mitra Solusi Integrasi Nusantara',
      completenessScore: 100,
      evaluationRating: '4.80',
      evaluationNote: 'Pengiriman tepat waktu, dokumen pajak dan BAST selalu lengkap.',
      status: 'ACTIVE',
    },
  });

  const vendorPrima = await prisma.vendor.create({
    data: {
      code: 'VND-0002',
      name: 'PT Prima Tekno Mandiri [DATA DEMO]',
      legalName: 'PT Prima Tekno Mandiri Sejahtera',
      taxIdNpwp: '02.345.678.9-044.000',
      category: 'Perangkat TI & Infrastruktur',
      contactName: 'Yuniarti Lestari',
      email: 'tender@primatekno.demo.id',
      phone: '021-7881209',
      address: 'Jl. TB Simatupang No. 88, Jakarta Selatan',
      bankName: 'Bank BNI',
      bankAccountNo: '0887766554',
      bankAccountHolder: 'PT Prima Tekno Mandiri Sejahtera',
      completenessScore: 100,
      evaluationRating: '4.50',
      evaluationNote: 'Harga kompetitif, garansi resmi distributor.',
      status: 'ACTIVE',
    },
  });

  const vendorSinergi = await prisma.vendor.create({
    data: {
      code: 'VND-0003',
      name: 'CV Sinergi Sarana Edukasi [DATA DEMO]',
      legalName: 'CV Sinergi Sarana Edukasi',
      taxIdNpwp: '03.456.789.0-091.000',
      category: 'Perlengkapan Pelatihan & Percetakan',
      contactName: 'Bambang Kurniawan',
      email: 'order@sinergisaranademo.id',
      phone: '022-4209911',
      address: 'Jl. Dipatiukur No. 45, Bandung',
      bankName: 'Bank BRI',
      bankAccountNo: '002101009988301',
      bankAccountHolder: 'CV Sinergi Sarana Edukasi',
      completenessScore: 95,
      evaluationRating: '4.60',
      evaluationNote: 'Responsif untuk pemesanan modul cetak dan seminar kit.',
      status: 'ACTIVE',
    },
  });

  // 10. Procurement End-to-End Flow 1 (Completed: PR -> 3 Quotations -> PO -> Goods Receipt -> Vendor Invoice -> Paid Expense)
  const prCompleted = await prisma.purchaseRequest.create({
    data: {
      docNumber: 'PR-2026-0001',
      title: 'Pengadaan 2 Set Kamera Konferensi 4K & Audio Array Kelas Hybrid [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatLab.id,
      budgetLineId: bLineDiklatCapex.id,
      purpose: 'Mendukung penyelenggaraan kelas sertifikasi manajemen proyek secara hybrid.',
      estimatedTotal: '33300000.00',
      status: 'ORDERED',
      minQuotationsRequired: 3,
      requestedById: userUnitMgr.id,
      requestedByName: userUnitMgr.fullName,
      approvedById: userGm.id,
      approvedByName: userGm.fullName,
      approvedAt: new Date('2026-09-10T10:00:00.000Z'),
      lines: {
        create: [
          {
            itemName: 'Sistem Kamera PTZ Konferensi 4K + Speakerphone',
            specification: 'Optical Zoom 12x, Dual Mic Array, Garansi 3 Tahun',
            quantity: '2.00',
            unit: 'Set',
            estimatedUnitPrice: '16650000.00',
            lineTotal: '33300000.00',
          },
        ],
      },
    },
  });

  const quote1 = await prisma.vendorQuotation.create({
    data: {
      purchaseRequestId: prCompleted.id,
      vendorId: vendorMitra.id,
      quotationNumber: 'QT-MSI-2026-089',
      quotedSubtotal: '30000000.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      deliveryDays: 5,
      warrantyInfo: 'Garansi Resmi 3 Tahun On-Site Replacement',
      documentComplete: true,
      isSelected: true,
      selectionReason: 'Harga terbaik, garansi on-site 3 tahun, dan waktu pengiriman tercepat (5 hari).',
    },
  });

  await prisma.vendorQuotation.create({
    data: {
      purchaseRequestId: prCompleted.id,
      vendorId: vendorPrima.id,
      quotationNumber: 'QT-PTM-2026-114',
      quotedSubtotal: '31500000.00',
      taxAmount: '3465000.00',
      totalAmount: '34965000.00',
      deliveryDays: 7,
      warrantyInfo: 'Garansi 2 Tahun Carry-In',
      documentComplete: true,
      isSelected: false,
    },
  });

  await prisma.vendorQuotation.create({
    data: {
      purchaseRequestId: prCompleted.id,
      vendorId: vendorSinergi.id,
      quotationNumber: 'QT-SSE-2026-041',
      quotedSubtotal: '32200000.00',
      taxAmount: '3542000.00',
      totalAmount: '35742000.00',
      deliveryDays: 10,
      warrantyInfo: 'Garansi 1 Tahun Distributor',
      documentComplete: true,
      isSelected: false,
    },
  });

  const poCompleted = await prisma.purchaseOrder.create({
    data: {
      docNumber: 'PO-2026-0001',
      purchaseRequestId: prCompleted.id,
      vendorId: vendorMitra.id,
      businessUnitId: unitDiklat.id,
      selectedQuotationId: quote1.id,
      orderDate: new Date('2026-09-12T09:00:00.000Z'),
      expectedDeliveryDate: new Date('2026-09-17T09:00:00.000Z'),
      paymentTerms: 'NET 14',
      subtotal: '30000000.00',
      discountAmount: '0.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      status: 'RECEIVED',
      selectionJustification: 'Memenuhi 3 penawaran; PT Mitra Solusi Integrasi menawarkan harga terendah dan garansi on-site.',
      createdById: userProc.id,
      createdByName: userProc.fullName,
      approvedById: userFin.id,
      approvedAt: new Date('2026-09-12T13:00:00.000Z'),
    },
  });

  const poLine1 = await prisma.purchaseOrderLine.create({
    data: {
      purchaseOrderId: poCompleted.id,
      itemName: 'Sistem Kamera PTZ Konferensi 4K + Speakerphone',
      quantity: '2.00',
      receivedQuantity: '2.00',
      invoicedQuantity: '2.00',
      unit: 'Set',
      unitPrice: '15000000.00',
      lineTotal: '30000000.00',
    },
  });

  await prisma.goodsReceipt.create({
    data: {
      docNumber: 'GR-2026-0001',
      purchaseOrderId: poCompleted.id,
      receivedDate: new Date('2026-09-16T14:00:00.000Z'),
      receivedById: userProc.id,
      receivedByName: userProc.fullName,
      deliveryNoteRef: 'SJ-MSI-2026-0916',
      conditionNote: 'Kedua unit diterima lengkap dalam kondisi baik dan lulus uji fungsi.',
      status: 'COMPLETE',
      lines: {
        create: [
          {
            purchaseOrderLineId: poLine1.id,
            itemName: poLine1.itemName,
            quantityReceived: '2.00',
            condition: 'GOOD',
          },
        ],
      },
    },
  });

  const vInv1 = await prisma.vendorInvoice.create({
    data: {
      internalNumber: 'VINV-2026-0001',
      vendorInvoiceNumber: 'INV/MSI/2026/09/108',
      vendorId: vendorMitra.id,
      purchaseOrderId: poCompleted.id,
      businessUnitId: unitDiklat.id,
      invoiceDate: new Date('2026-09-18T09:00:00.000Z'),
      dueDate: new Date('2026-10-02T09:00:00.000Z'),
      subtotal: '30000000.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      paidAmount: '33300000.00',
      matchingStatus: 'MATCHED_3WAY',
      matchingNote: 'Cocok 100% antara PO-2026-0001, GR-2026-0001 (2 Set), dan nilai tagihan.',
      status: 'PAID',
      createdById: userProc.id,
      verifiedById: userFin.id,
    },
  });

  // 11. Active PR with Reserved Commitment + Pending PR Awaiting Approval
  const prActiveCommitted = await prisma.purchaseRequest.create({
    data: {
      docNumber: 'PR-2026-0002',
      title: 'Pengadaan 4 Unit Proyektor Laser Ruang Kelas Eksekutif [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatLab.id,
      budgetLineId: bLineDiklatCapex.id,
      purpose: 'Penggantian proyektor lama di Ruang Kelas B1-B4.',
      estimatedTotal: '24420000.00',
      status: 'APPROVED',
      minQuotationsRequired: 3,
      requestedById: userUnitMgr.id,
      requestedByName: userUnitMgr.fullName,
      approvedById: userFin.id,
      approvedByName: userFin.fullName,
      approvedAt: new Date('2026-10-18T11:00:00.000Z'),
      lines: {
        create: [
          {
            itemName: 'Proyektor Laser WUXGA 4200 Lumens',
            specification: 'HDMI Dual Input, Lamp-free Laser Source',
            quantity: '4.00',
            unit: 'Unit',
            estimatedUnitPrice: '6105000.00',
            lineTotal: '24420000.00',
          },
        ],
      },
    },
  });

  await prisma.budgetCommitment.create({
    data: {
      budgetLineId: bLineDiklatCapex.id,
      sourceType: 'PURCHASE_REQUEST',
      sourceId: prActiveCommitted.id,
      sourceDocNumber: prActiveCommitted.docNumber,
      amount: '24420000.00',
      status: 'RESERVED',
    },
  });

  // Add 3 quotations on PR-2026-0002 so the user can test converting it to PO right away!
  await prisma.vendorQuotation.createMany({
    data: [
      {
        purchaseRequestId: prActiveCommitted.id,
        vendorId: vendorPrima.id,
        quotationNumber: 'QT-PTM-2026-205',
        quotedSubtotal: '21600000.00',
        taxAmount: '2376000.00',
        totalAmount: '23976000.00',
        deliveryDays: 4,
        warrantyInfo: 'Garansi Resmi 3 Tahun',
        documentComplete: true,
      },
      {
        purchaseRequestId: prActiveCommitted.id,
        vendorId: vendorMitra.id,
        quotationNumber: 'QT-MSI-2026-211',
        quotedSubtotal: '22000000.00',
        taxAmount: '2420000.00',
        totalAmount: '24420000.00',
        deliveryDays: 5,
        warrantyInfo: 'Garansi Resmi 3 Tahun',
        documentComplete: true,
      },
      {
        purchaseRequestId: prActiveCommitted.id,
        vendorId: vendorSinergi.id,
        quotationNumber: 'QT-SSE-2026-098',
        quotedSubtotal: '22400000.00',
        taxAmount: '2464000.00',
        totalAmount: '24864000.00',
        deliveryDays: 7,
        warrantyInfo: 'Garansi 2 Tahun',
        documentComplete: true,
      },
    ],
  });

  const prPending = await prisma.purchaseRequest.create({
    data: {
      docNumber: 'PR-2026-0003',
      title: 'Cetak Modul & Perlengkapan Seminar Kit Batch November [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatProg.id,
      budgetLineId: bLineDiklatOpex.id,
      purpose: 'Kebutuhan 120 peserta Pelatihan Manajemen Risiko Proyek.',
      estimatedTotal: '18000000.00',
      status: 'SUBMITTED',
      minQuotationsRequired: 3,
      requestedById: userUnitMgr.id,
      requestedByName: userUnitMgr.fullName,
      lines: {
        create: [
          {
            itemName: 'Paket Modul Cetak Berwarna & Seminar Kit Eksekutif',
            specification: 'Hardcover Binder, Sertifikat Security Paper, Flashdisk 32GB',
            quantity: '120.00',
            unit: 'Paket',
            estimatedUnitPrice: '150000.00',
            lineTotal: '18000000.00',
          },
        ],
      },
    },
  });

  // Also add an unpaid Vendor Invoice for AP Aging demonstration
  await prisma.vendorInvoice.create({
    data: {
      internalNumber: 'VINV-2026-0002',
      vendorInvoiceNumber: 'INV/SSE/2026/10/044',
      vendorId: vendorSinergi.id,
      businessUnitId: unitDiklat.id,
      invoiceDate: new Date('2026-10-05T09:00:00.000Z'),
      dueDate: new Date('2026-10-20T09:00:00.000Z'),
      subtotal: '15000000.00',
      taxAmount: '1650000.00',
      totalAmount: '16650000.00',
      paidAmount: '0.00',
      matchingStatus: 'MATCHED_3WAY',
      matchingNote: 'Tagihan katering dan perlengkapan workshop batch Oktober.',
      status: 'APPROVED',
      createdById: userProc.id,
      verifiedById: userFin.id,
    },
  });

  // 12. Expenses (Paid & Posted + Submitted Pending Approval)
  const exp1 = await prisma.expense.create({
    data: {
      docNumber: 'EXP-2026-0001',
      title: 'Pelunasan PO-2026-0001 Kamera Konferensi Kelas Hybrid [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatLab.id,
      budgetLineId: bLineDiklatCapex.id,
      fundSourceId: fundInternal.id,
      vendorId: vendorMitra.id,
      vendorInvoiceId: vInv1.id,
      category: 'CAPEX',
      paymentMethod: 'BANK_TRANSFER',
      recipientName: vendorMitra.name,
      transactionDate: new Date('2026-09-25T10:00:00.000Z'),
      subtotal: '30000000.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      description: 'Pembayaran lunas atas VINV-2026-0001 / PO-2026-0001 melalui Bank Mandiri.',
      receiptRef: 'TRX-BMRI-20260925-001',
      status: 'POSTED',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      approvedById: userGm.id,
      approvedByName: userGm.fullName,
      approvedAt: new Date('2026-09-24T16:00:00.000Z'),
      paidAt: new Date('2026-09-25T10:30:00.000Z'),
    },
  });

  const exp2 = await prisma.expense.create({
    data: {
      docNumber: 'EXP-2026-0002',
      title: 'Penyelenggaraan Workshop Sertifikasi Batch September [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatProg.id,
      budgetLineId: bLineDiklatOpex.id,
      fundSourceId: fundInternal.id,
      vendorId: vendorSinergi.id,
      category: 'OPEX',
      paymentMethod: 'BANK_TRANSFER',
      recipientName: vendorSinergi.name,
      transactionDate: new Date('2026-10-02T11:00:00.000Z'),
      subtotal: '15000000.00',
      taxAmount: '1650000.00',
      totalAmount: '16650000.00',
      description: 'Sewa ruang ujian tambahan, konsumsi peserta, dan dokumentasi.',
      receiptRef: 'TRX-BMRI-20261002-004',
      status: 'POSTED',
      createdById: userUnitMgr.id,
      createdByName: userUnitMgr.fullName,
      approvedById: userFin.id,
      approvedByName: userFin.fullName,
      approvedAt: new Date('2026-10-01T15:00:00.000Z'),
      paidAt: new Date('2026-10-02T11:15:00.000Z'),
    },
  });

  const exp3 = await prisma.expense.create({
    data: {
      docNumber: 'EXP-2026-0003',
      title: 'Biaya Survei Lapangan & Pengolahan Data Proyek Advisory [DATA DEMO]',
      businessUnitId: unitKonsultansi.id,
      costCenterId: ccKonsulProj.id,
      budgetLineId: bLineKonsulOpex.id,
      fundSourceId: fundRevenue.id,
      category: 'OPEX',
      paymentMethod: 'BANK_TRANSFER',
      recipientName: 'Tim Enumerator & Riset Konsultansi',
      transactionDate: new Date('2026-10-12T09:30:00.000Z'),
      subtotal: '18500000.00',
      taxAmount: '0.00',
      totalAmount: '18500000.00',
      description: 'Perjalanan dinas tim asesmen dan akomodasi pengumpulan data primer.',
      receiptRef: 'TRX-BMRI-20261012-009',
      status: 'POSTED',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      approvedById: userGm.id,
      approvedByName: userGm.fullName,
      approvedAt: new Date('2026-10-11T14:00:00.000Z'),
      paidAt: new Date('2026-10-12T10:00:00.000Z'),
    },
  });

  const expPending = await prisma.expense.create({
    data: {
      docNumber: 'EXP-2026-0004',
      title: 'Honorarium Asesor Uji Kompetensi Manajemen Proyek [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      costCenterId: ccDiklatProg.id,
      budgetLineId: bLineDiklatHonor.id,
      fundSourceId: fundInternal.id,
      category: 'PEGAWAI',
      paymentMethod: 'BANK_TRANSFER',
      recipientName: 'Panel Asesor Lisensi Nasional (4 Orang)',
      transactionDate: new Date('2026-10-27T09:00:00.000Z'),
      subtotal: '12000000.00',
      taxAmount: '0.00',
      totalAmount: '12000000.00',
      description: 'Honorarium pengujian 60 asesi batch Oktober 2026.',
      receiptRef: 'DRAFT-HNR-202610',
      status: 'SUBMITTED',
      createdById: userUnitMgr.id,
      createdByName: userUnitMgr.fullName,
    },
  });

  // 13. Customers, Products/Services, Sales Orders, Invoices, Payments & Cashier
  const custBumn = await prisma.customer.create({
    data: {
      code: 'CUST-0001',
      name: 'PT Karya Infrastruktur Persero [DATA DEMO]',
      organizationType: 'SOE_BUMN',
      taxIdNpwp: '01.001.889.2-051.000',
      contactPerson: 'dr. Ratna Sari, MM (VP Learning)',
      email: 'corpu@karyainfrastruktur.demo.id',
      phone: '021-29901100',
      address: 'Jl. Jend. Sudirman Kav. 52, Jakarta',
      creditLimit: '500000000.00',
    },
  });

  const custBank = await prisma.customer.create({
    data: {
      code: 'CUST-0002',
      name: 'PT Bank Nusantara Sejahtera Tbk [DATA DEMO]',
      organizationType: 'CORPORATE',
      taxIdNpwp: '01.309.442.1-093.000',
      contactPerson: 'Erwin Setiawan (Head of PMO Division)',
      email: 'pmo.office@banknusantara.demo.id',
      phone: '021-5158800',
      address: 'Kawasan Mega Kuningan Lot 8, Jakarta',
      creditLimit: '350000000.00',
    },
  });

  const custPemda = await prisma.customer.create({
    data: {
      code: 'CUST-0003',
      name: 'Badan Pengembangan SDM Provinsi [DATA DEMO]',
      organizationType: 'GOVERNMENT',
      taxIdNpwp: '00.112.334.5-401.000',
      contactPerson: 'Drs. Wahyu Hidayat, M.Si',
      email: 'bpsdm@provinsi.demo.id',
      phone: '022-7310022',
      address: 'Jl. Cimahi Raya No. 12, Jawa Barat',
      creditLimit: '250000000.00',
    },
  });

  const prodBootcamp = await prisma.productService.create({
    data: {
      sku: 'SRV-DKL-001',
      name: 'Program Sertifikasi Project Management Professional (In-House 25 Peserta)',
      category: 'Pelatihan Eksekutif',
      businessUnitId: unitDiklat.id,
      unitPrice: '85000000.00',
      unit: 'Batch',
      taxCode: 'PPN-11',
      revenueAccountCode: '4-1100',
    },
  });

  const prodWorkshop = await prisma.productService.create({
    data: {
      sku: 'SRV-DKL-002',
      name: 'Kursus Publik Tata Kelola & Anggaran Proyek (Reguler Per Peserta)',
      category: 'Pelatihan Reguler',
      businessUnitId: unitDiklat.id,
      unitPrice: '15000000.00',
      unit: 'Paket',
      taxCode: 'PPN-11',
      revenueAccountCode: '4-1100',
    },
  });

  const prodAdvisory = await prisma.productService.create({
    data: {
      sku: 'SRV-KNS-001',
      name: 'Jasa Konsultansi Penyusunan Maturity Model PMO & Evaluasi Portofolio',
      category: 'Konsultansi',
      businessUnitId: unitKonsultansi.id,
      unitPrice: '110000000.00',
      unit: 'Proyek',
      taxCode: 'PPN-11',
      revenueAccountCode: '4-1200',
    },
  });

  // Divisi MICE Services
  await prisma.productService.create({
    data: {
      sku: 'SRV-MICE-001',
      name: 'Paket Meeting Fullboard Ballroom MICE (100 Pax, Sound & Banquet)',
      category: 'MICE & Event',
      businessUnitId: unitMice.id,
      unitPrice: '45000000.00',
      unit: 'Event',
      taxCode: 'PB1-10',
      revenueAccountCode: '4-1100',
    },
  });

  await prisma.productService.create({
    data: {
      sku: 'SRV-MICE-002',
      name: 'Sewa Kamar Wisma Deluxe (Breakfast, Amenities & Wifi)',
      category: 'Kamar & Wisma',
      businessUnitId: unitMice.id,
      unitPrice: '650000.00',
      unit: 'Malam',
      taxCode: 'PB1-10',
      revenueAccountCode: '4-1100',
    },
  });

  // Divisi IT Solution Services
  await prisma.productService.create({
    data: {
      sku: 'SRV-ITS-001',
      name: 'Lisensi Enterprise ERP & Layanan Cloud Managed Service',
      category: 'IT Solution',
      businessUnitId: unitItSolution.id,
      unitPrice: '60000000.00',
      unit: 'Tahun',
      taxCode: 'PPN-11',
      revenueAccountCode: '4-1200',
    },
  });

  // Divisi Klinik Pratama Services
  await prisma.productService.create({
    data: {
      sku: 'SRV-KLN-001',
      name: 'Paket Medical Check Up (MCU) Eksekutif Karyawan',
      category: 'Layanan Medis',
      businessUnitId: unitKlinik.id,
      unitPrice: '1250000.00',
      unit: 'Orang',
      taxCode: 'BEBAS',
      revenueAccountCode: '4-1100',
    },
  });

  await prisma.productService.create({
    data: {
      sku: 'SRV-KLN-002',
      name: 'Konsultasi Dokter Umum & Resep Obat Farmasi',
      category: 'Poliklinik',
      businessUnitId: unitKlinik.id,
      unitPrice: '250000.00',
      unit: 'Pasien',
      taxCode: 'BEBAS',
      revenueAccountCode: '4-1100',
    },
  });

  await prisma.productPriceHistory.create({
    data: {
      productServiceId: prodBootcamp.id,
      oldPrice: '80000000.00',
      newPrice: '85000000.00',
      changedById: userFin.id,
      changedByName: userFin.fullName,
      reason: 'Penyesuaian biaya lisensi materi ujian internasional tahun 2026.',
      changedAt: new Date('2026-02-01T08:00:00.000Z'),
    },
  });

  // Bank Accounts & Cash Registers
  const bankMandiri = await prisma.bankAccount.create({
    data: {
      code: 'BNK-MDR-01',
      bankName: 'Bank Mandiri - Cabang Jakarta Sudirman',
      accountNumberMasked: '124-00-****-8891',
      accountHolder: 'PMO UTama - Operasional & Pengeluaran [DATA DEMO]',
      businessUnitId: unitOps.id,
      glAccountCode: '1-1120',
      currentBalance: '485900000.00',
    },
  });

  const bankBni = await prisma.bankAccount.create({
    data: {
      code: 'BNK-BNI-01',
      bankName: 'Bank BNI - Cabang Kampus Utama',
      accountNumberMasked: '088-41-****-2209',
      accountHolder: 'PMO UTama - Penerimaan Layanan [DATA DEMO]',
      businessUnitId: unitDiklat.id,
      glAccountCode: '1-1130',
      currentBalance: '216450000.00',
    },
  });

  const regDiklat = await prisma.cashRegister.create({
    data: {
      code: 'REG-TCI-01',
      name: 'Loket Kasir & Pembayaran Divisi TCI',
      businessUnitId: unitDiklat.id,
    },
  });

  await prisma.cashRegister.create({
    data: {
      code: 'REG-MICE-01',
      name: 'Kasir Front Office & Wisma MICE',
      businessUnitId: unitMice.id,
    },
  });

  await prisma.cashRegister.create({
    data: {
      code: 'REG-KLN-01',
      name: 'Loket Kasir & Farmasi Klinik Pratama',
      businessUnitId: unitKlinik.id,
    },
  });

  // Cashier Sessions: 1 Closed with small discrepancy pending supervisor review, 1 Currently Open
  const sessionReview = await prisma.cashierSession.create({
    data: {
      sessionNumber: 'CSH-2026-0001',
      cashRegisterId: regDiklat.id,
      businessUnitId: unitDiklat.id,
      cashierId: userCashier.id,
      cashierName: userCashier.fullName,
      openedAt: new Date('2026-10-24T08:00:00.000Z'),
      openingFloat: '2500000.00',
      totalCashIn: '16650000.00',
      totalCashOut: '0.00',
      theoreticalBalance: '19150000.00',
      actualCountedCash: '19075000.00',
      discrepancyAmount: '-75000.00',
      discrepancyReason: 'Selisih pengembalian uang tunai pecahan Rp 75.000 pada transaksi loket sore; siap ditindaklanjuti.',
      status: 'CLOSING_SUBMITTED',
      closedAt: new Date('2026-10-24T17:00:00.000Z'),
    },
  });

  const sessionOpen = await prisma.cashierSession.create({
    data: {
      sessionNumber: 'CSH-2026-0002',
      cashRegisterId: regDiklat.id,
      businessUnitId: unitDiklat.id,
      cashierId: userCashier.id,
      cashierName: userCashier.fullName,
      openedAt: new Date('2026-10-29T07:30:00.000Z'),
      openingFloat: '3000000.00',
      totalCashIn: '0.00',
      totalCashOut: '0.00',
      theoreticalBalance: '3000000.00',
      status: 'OPEN',
    },
  });

  // Sales Order 1: Fully Paid via Bank Transfer
  const so1 = await prisma.salesOrder.create({
    data: {
      docNumber: 'SO-2026-0001',
      customerId: custBumn.id,
      businessUnitId: unitDiklat.id,
      orderDate: new Date('2026-09-15T09:00:00.000Z'),
      dueDate: new Date('2026-09-29T09:00:00.000Z'),
      terms: 'NET 14',
      subtotal: '85000000.00',
      discountAmount: '0.00',
      taxAmount: '9350000.00',
      totalAmount: '94350000.00',
      status: 'PAID',
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date('2026-09-22T16:30:00.000Z'),
      deliveredBy: userUnitMgr.fullName,
      deliveryNotes: 'Pelatihan 25 peserta selesai dilaksanakan dan berita acara serah terima telah ditandatangani.',
      createdById: userUnitMgr.id,
      createdByName: userUnitMgr.fullName,
      lines: {
        create: [
          {
            productServiceId: prodBootcamp.id,
            description: prodBootcamp.name,
            quantity: '1.00',
            unitPrice: '85000000.00',
            discountAmount: '0.00',
            taxAmount: '9350000.00',
            lineTotal: '94350000.00',
          },
        ],
      },
    },
  });

  const inv1 = await prisma.customerInvoice.create({
    data: {
      docNumber: 'INV-2026-0001',
      salesOrderId: so1.id,
      customerId: custBumn.id,
      businessUnitId: unitDiklat.id,
      issueDate: new Date('2026-09-15T10:00:00.000Z'),
      dueDate: new Date('2026-09-29T10:00:00.000Z'),
      subtotal: '85000000.00',
      discountAmount: '0.00',
      taxAmount: '9350000.00',
      totalAmount: '94350000.00',
      paidAmount: '94350000.00',
      balanceDue: '0.00',
      status: 'PAID',
      serviceDelivered: true,
      createdById: userFin.id,
      createdByName: userFin.fullName,
      lines: {
        create: [
          {
            description: prodBootcamp.name,
            quantity: '1.00',
            unitPrice: '85000000.00',
            discountAmount: '0.00',
            taxAmount: '9350000.00',
            lineTotal: '94350000.00',
          },
        ],
      },
    },
  });

  const pay1 = await prisma.payment.create({
    data: {
      receiptNumber: 'KWT-2026-0001',
      customerInvoiceId: inv1.id,
      bankAccountId: bankBni.id,
      paymentDate: new Date('2026-09-26T14:00:00.000Z'),
      method: 'BANK_TRANSFER',
      grossAmount: '94350000.00',
      feeAmount: '0.00',
      netAmount: '94350000.00',
      referenceNo: 'BNI-VA-20260926-881',
      idempotencyKey: 'SEED_PAY_0001',
      status: 'CONFIRMED',
      receivedById: userFin.id,
      receivedByName: userFin.fullName,
    },
  });

  // Sales Order 2: Partially Paid (Service Delivered, Remaining Balance Outstanding!)
  const so2 = await prisma.salesOrder.create({
    data: {
      docNumber: 'SO-2026-0002',
      customerId: custBank.id,
      businessUnitId: unitKonsultansi.id,
      orderDate: new Date('2026-10-03T09:00:00.000Z'),
      dueDate: new Date('2026-10-17T09:00:00.000Z'),
      terms: 'Termin 50% DP / 50% Laporan Akhir',
      subtotal: '110000000.00',
      discountAmount: '0.00',
      taxAmount: '12100000.00',
      totalAmount: '122100000.00',
      status: 'PARTIALLY_PAID',
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date('2026-10-16T15:00:00.000Z'),
      deliveredBy: 'Nadia Kusuma',
      deliveryNotes: 'Dokumen asesmen maturitas PMO telah diserahkan. Menunggu pelunasan termin ke-2 (50%).',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      lines: {
        create: [
          {
            productServiceId: prodAdvisory.id,
            description: prodAdvisory.name,
            quantity: '1.00',
            unitPrice: '110000000.00',
            discountAmount: '0.00',
            taxAmount: '12100000.00',
            lineTotal: '122100000.00',
          },
        ],
      },
    },
  });

  const inv2 = await prisma.customerInvoice.create({
    data: {
      docNumber: 'INV-2026-0002',
      salesOrderId: so2.id,
      customerId: custBank.id,
      businessUnitId: unitKonsultansi.id,
      issueDate: new Date('2026-10-03T10:00:00.000Z'),
      dueDate: new Date('2026-10-17T10:00:00.000Z'),
      subtotal: '110000000.00',
      discountAmount: '0.00',
      taxAmount: '12100000.00',
      totalAmount: '122100000.00',
      paidAmount: '61050000.00',
      balanceDue: '61050000.00',
      status: 'PARTIALLY_PAID',
      serviceDelivered: true,
      notes: 'Termin 1 (50%) telah diterima; sisa tagihan Rp 61.050.000 telah melewati jatuh tempo.',
      createdById: userFin.id,
      createdByName: userFin.fullName,
      lines: {
        create: [
          {
            description: prodAdvisory.name,
            quantity: '1.00',
            unitPrice: '110000000.00',
            discountAmount: '0.00',
            taxAmount: '12100000.00',
            lineTotal: '122100000.00',
          },
        ],
      },
    },
  });

  const pay2 = await prisma.payment.create({
    data: {
      receiptNumber: 'KWT-2026-0002',
      customerInvoiceId: inv2.id,
      bankAccountId: bankBni.id,
      paymentDate: new Date('2026-10-06T11:00:00.000Z'),
      method: 'VIRTUAL_ACCOUNT_SIMULATED',
      grossAmount: '61050000.00',
      feeAmount: '5000.00',
      netAmount: '61045000.00',
      referenceNo: 'VA-BNI-20261006-552',
      idempotencyKey: 'SEED_PAY_0002',
      status: 'CONFIRMED',
      receivedById: userFin.id,
      receivedByName: userFin.fullName,
    },
  });

  // Sales Order 3: Paid via Cashier Cash + Unpaid Invoice 4 for Cashier Demo
  const so3 = await prisma.salesOrder.create({
    data: {
      docNumber: 'SO-2026-0003',
      customerId: custPemda.id,
      businessUnitId: unitDiklat.id,
      orderDate: new Date('2026-10-24T09:00:00.000Z'),
      dueDate: new Date('2026-11-07T09:00:00.000Z'),
      terms: 'TUNAI / NET 14',
      subtotal: '30000000.00',
      discountAmount: '0.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      status: 'PARTIALLY_PAID',
      deliveryStatus: 'IN_PROGRESS',
      createdById: userUnitMgr.id,
      createdByName: userUnitMgr.fullName,
      lines: {
        create: [
          {
            productServiceId: prodWorkshop.id,
            description: prodWorkshop.name,
            quantity: '2.00',
            unitPrice: '15000000.00',
            discountAmount: '0.00',
            taxAmount: '3300000.00',
            lineTotal: '33300000.00',
          },
        ],
      },
    },
  });

  const inv3 = await prisma.customerInvoice.create({
    data: {
      docNumber: 'INV-2026-0003',
      salesOrderId: so3.id,
      customerId: custPemda.id,
      businessUnitId: unitDiklat.id,
      issueDate: new Date('2026-10-24T09:30:00.000Z'),
      dueDate: new Date('2026-11-07T09:30:00.000Z'),
      subtotal: '30000000.00',
      discountAmount: '0.00',
      taxAmount: '3300000.00',
      totalAmount: '33300000.00',
      paidAmount: '16650000.00',
      balanceDue: '16650000.00',
      status: 'PARTIALLY_PAID',
      serviceDelivered: false,
      notes: 'Pembayaran tunai tahap 1 diterima di loket kasir; sisa 50% jatuh tempo 7 November 2026.',
      createdById: userCashier.id,
      createdByName: userCashier.fullName,
      lines: {
        create: [
          {
            description: prodWorkshop.name,
            quantity: '2.00',
            unitPrice: '15000000.00',
            discountAmount: '0.00',
            taxAmount: '3300000.00',
            lineTotal: '33300000.00',
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      receiptNumber: 'KWT-2026-0003',
      customerInvoiceId: inv3.id,
      cashierSessionId: sessionReview.id,
      paymentDate: new Date('2026-10-24T13:15:00.000Z'),
      method: 'CASH',
      grossAmount: '16650000.00',
      feeAmount: '0.00',
      netAmount: '16650000.00',
      referenceNo: 'CASH-REG01-20261024',
      idempotencyKey: 'SEED_PAY_0003',
      status: 'CONFIRMED',
      receivedById: userCashier.id,
      receivedByName: userCashier.fullName,
    },
  });

  const deposit1 = await prisma.cashDeposit.create({
    data: {
      depositNumber: 'DEP-2026-0001',
      cashierSessionId: sessionReview.id,
      bankAccountId: bankBni.id,
      depositDate: new Date('2026-10-25T09:00:00.000Z'),
      amount: '16575000.00',
      referenceNo: 'STR-BNI-20261025-01',
      depositedById: userCashier.id,
      depositedByName: userCashier.fullName,
      status: 'VERIFIED',
      notes: 'Setoran penerimaan tunai sesi CSH-2026-0001 ke rekening Bank BNI.',
    },
  });

  // 14. Bank Statement Import & Reconciliation (Matched + Unmatched + Needs Review)
  const bankImport = await prisma.bankStatementImport.create({
    data: {
      importNumber: 'IMP-BNK-0001',
      bankAccountId: bankBni.id,
      periodLabel: 'Oktober 2026',
      fileName: 'mutasi-bni-oktober-2026-demo.csv',
      totalLines: 4,
      matchedCount: 2,
      unmatchedCount: 2,
      duplicateCount: 0,
      status: 'RECONCILING',
      importedById: userFin.id,
      importedByName: userFin.fullName,
      lines: {
        create: [
          {
            bankAccountId: bankBni.id,
            transactionDate: new Date('2026-09-26T14:00:00.000Z'),
            description: 'TRSF CR DARI PT KARYA INFRASTRUKTUR PERSERO INV-2026-0001',
            referenceNo: 'BNI-VA-20260926-881',
            direction: 'CREDIT',
            amount: '94350000.00',
            runningBalance: '155350000.00',
            fingerprint: computeLineFingerprint(bankBni.id, '2026-09-26', 'BNI-VA-20260926-881', 'CREDIT', '94350000.00'),
            matchStatus: 'MATCHED',
            matchedEntityType: 'Payment',
            matchedEntityId: pay1.id,
            matchedDocNumber: pay1.receiptNumber,
            reconciledById: userFin.id,
            reconciledByName: userFin.fullName,
            reconciledAt: new Date('2026-10-26T10:00:00.000Z'),
          },
          {
            bankAccountId: bankBni.id,
            transactionDate: new Date('2026-10-06T11:00:00.000Z'),
            description: 'SETTLEMENT VA PT BANK NUSANTARA SEJAHTERA TERMIN 1 (NET)',
            referenceNo: 'VA-BNI-20261006-552',
            direction: 'CREDIT',
            amount: '61045000.00',
            runningBalance: '216395000.00',
            fingerprint: computeLineFingerprint(bankBni.id, '2026-10-06', 'VA-BNI-20261006-552', 'CREDIT', '61045000.00'),
            matchStatus: 'MATCHED',
            matchedEntityType: 'Payment',
            matchedEntityId: pay2.id,
            matchedDocNumber: pay2.receiptNumber,
            reconciledById: userFin.id,
            reconciledByName: userFin.fullName,
            reconciledAt: new Date('2026-10-26T10:05:00.000Z'),
          },
          {
            bankAccountId: bankBni.id,
            transactionDate: new Date('2026-10-25T09:15:00.000Z'),
            description: 'SETORAN TUNAI LOKET KASIR PMO UTAMA',
            referenceNo: 'STR-BNI-20261025-01',
            direction: 'CREDIT',
            amount: '16575000.00',
            runningBalance: '232970000.00',
            fingerprint: computeLineFingerprint(bankBni.id, '2026-10-25', 'STR-BNI-20261025-01', 'CREDIT', '16575000.00'),
            matchStatus: 'NEEDS_REVIEW',
            matchedEntityType: 'CashDeposit',
            matchedEntityId: deposit1.id,
            matchedDocNumber: deposit1.depositNumber,
            exceptionNote: 'Menunggu pengesahan berita acara selisih kas Rp 75.000 pada sesi CSH-2026-0001.',
          },
          {
            bankAccountId: bankBni.id,
            transactionDate: new Date('2026-10-27T15:40:00.000Z'),
            description: 'TRANSFER MASUK TANPA BERITA REFERENSI - PENGIRIM CV MITRA MANDIRI',
            referenceNo: 'BNI-UNKN-20261027-09',
            direction: 'CREDIT',
            amount: '7500000.00',
            runningBalance: '240470000.00',
            fingerprint: computeLineFingerprint(bankBni.id, '2026-10-27', 'BNI-UNKN-20261027-09', 'CREDIT', '7500000.00'),
            matchStatus: 'UNMATCHED',
            exceptionNote: 'Penerimaan belum teridentifikasi nomor invoicenya; sedang dikonfirmasi ke pelanggan.',
          },
        ],
      },
    },
  });

  // 15. Balanced General Journals (Capital Injection + Invoices + Payments + Expenses)
  const journalsData = [
    {
      journalNumber: 'JRN-FY-2026-0001',
      entryDate: new Date('2026-01-02T08:00:00.000Z'),
      businessUnitId: unitOps.id,
      sourceType: 'CAPITAL_ALLOCATION',
      sourceDocNumber: 'SK-MODAL-2026-01',
      idempotencyKey: 'SEED_JRN_0001',
      description: 'Penempatan Modal Kerja Awal & Kas Operasional PMO UTama Tahun 2026 [DATA DEMO]',
      totalDebit: '550000000.00',
      totalCredit: '550000000.00',
      lines: [
        { accountCode: '1-1120', description: 'Saldo awal Bank Mandiri Operasional PMO', debit: '544500000.00', credit: '0.00' },
        { accountCode: '1-1110', description: 'Modal kas kecil & float kasir', debit: '5500000.00', credit: '0.00' },
        { accountCode: '3-1100', description: 'Modal kerja awal tahun buku 2026', debit: '0.00', credit: '550000000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0002',
      entryDate: new Date('2026-09-15T10:00:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'CUSTOMER_INVOICE',
      sourceId: inv1.id,
      sourceDocNumber: inv1.docNumber,
      idempotencyKey: 'SEED_JRN_0002',
      description: 'Penerbitan Invoice INV-2026-0001 - PT Karya Infrastruktur Persero',
      totalDebit: '94350000.00',
      totalCredit: '94350000.00',
      lines: [
        { accountCode: '1-1210', costCenterId: ccDiklatProg.id, description: 'Piutang Usaha INV-2026-0001', debit: '94350000.00', credit: '0.00' },
        { accountCode: '4-1100', costCenterId: ccDiklatProg.id, description: 'Pendapatan Sertifikasi PMP In-House', debit: '0.00', credit: '85000000.00' },
        { accountCode: '2-1210', costCenterId: ccDiklatProg.id, description: 'PPN Keluaran 11% INV-2026-0001', debit: '0.00', credit: '9350000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0003',
      entryDate: new Date('2026-09-25T10:30:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'EXPENSE',
      sourceId: exp1.id,
      sourceDocNumber: exp1.docNumber,
      idempotencyKey: 'SEED_JRN_0003',
      description: 'Pelunasan Pengadaan Kamera Konferensi Hybrid (EXP-2026-0001 / PO-2026-0001)',
      totalDebit: '33300000.00',
      totalCredit: '33300000.00',
      lines: [
        { accountCode: '5-1200', costCenterId: ccDiklatLab.id, description: 'Realisasi pengadaan perangkat kelas hybrid', debit: '30000000.00', credit: '0.00' },
        { accountCode: '1-1310', costCenterId: ccDiklatLab.id, description: 'PPN Masukan atas VINV-2026-0001', debit: '3300000.00', credit: '0.00' },
        { accountCode: '1-1120', costCenterId: ccDiklatLab.id, description: 'Pembayaran transfer Bank Mandiri ke PT Mitra Solusi', debit: '0.00', credit: '33300000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0004',
      entryDate: new Date('2026-09-26T14:00:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'PAYMENT',
      sourceId: pay1.id,
      sourceDocNumber: pay1.receiptNumber,
      idempotencyKey: 'SEED_JRN_0004',
      description: 'Penerimaan Pelunasan INV-2026-0001 (KWT-2026-0001)',
      totalDebit: '94350000.00',
      totalCredit: '94350000.00',
      lines: [
        { accountCode: '1-1130', description: 'Penerimaan Bank BNI atas KWT-2026-0001', debit: '94350000.00', credit: '0.00' },
        { accountCode: '1-1210', description: 'Pelunasan piutang INV-2026-0001', debit: '0.00', credit: '94350000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0005',
      entryDate: new Date('2026-10-02T11:15:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'EXPENSE',
      sourceId: exp2.id,
      sourceDocNumber: exp2.docNumber,
      idempotencyKey: 'SEED_JRN_0005',
      description: 'Pencairan Biaya Penyelenggaraan Workshop (EXP-2026-0002)',
      totalDebit: '16650000.00',
      totalCredit: '16650000.00',
      lines: [
        { accountCode: '5-1100', costCenterId: ccDiklatProg.id, description: 'Beban penyelenggaraan workshop September', debit: '15000000.00', credit: '0.00' },
        { accountCode: '1-1310', costCenterId: ccDiklatProg.id, description: 'PPN Masukan atas EXP-2026-0002', debit: '1650000.00', credit: '0.00' },
        { accountCode: '1-1120', costCenterId: ccDiklatProg.id, description: 'Transfer Bank Mandiri ke CV Sinergi Sarana', debit: '0.00', credit: '16650000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0006',
      entryDate: new Date('2026-10-03T10:00:00.000Z'),
      businessUnitId: unitKonsultansi.id,
      sourceType: 'CUSTOMER_INVOICE',
      sourceId: inv2.id,
      sourceDocNumber: inv2.docNumber,
      idempotencyKey: 'SEED_JRN_0006',
      description: 'Penerbitan Invoice INV-2026-0002 - PT Bank Nusantara Sejahtera Tbk',
      totalDebit: '122100000.00',
      totalCredit: '122100000.00',
      lines: [
        { accountCode: '1-1210', costCenterId: ccKonsulProj.id, description: 'Piutang Usaha INV-2026-0002', debit: '122100000.00', credit: '0.00' },
        { accountCode: '4-1200', costCenterId: ccKonsulProj.id, description: 'Pendapatan Konsultansi Maturity Model PMO', debit: '0.00', credit: '110000000.00' },
        { accountCode: '2-1210', costCenterId: ccKonsulProj.id, description: 'PPN Keluaran 11% INV-2026-0002', debit: '0.00', credit: '12100000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0007',
      entryDate: new Date('2026-10-06T11:00:00.000Z'),
      businessUnitId: unitKonsultansi.id,
      sourceType: 'PAYMENT',
      sourceId: pay2.id,
      sourceDocNumber: pay2.receiptNumber,
      idempotencyKey: 'SEED_JRN_0007',
      description: 'Penerimaan Pembayaran Termin 1 INV-2026-0002 via VA (KWT-2026-0002)',
      totalDebit: '61050000.00',
      totalCredit: '61050000.00',
      lines: [
        { accountCode: '1-1130', description: 'Penerimaan bersih VA Bank BNI', debit: '61045000.00', credit: '0.00' },
        { accountCode: '5-1500', description: 'Potongan biaya transaksi Virtual Account', debit: '5000.00', credit: '0.00' },
        { accountCode: '1-1210', description: 'Pengurangan piutang INV-2026-0002 (Bruto)', debit: '0.00', credit: '61050000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0008',
      entryDate: new Date('2026-10-12T10:00:00.000Z'),
      businessUnitId: unitKonsultansi.id,
      sourceType: 'EXPENSE',
      sourceId: exp3.id,
      sourceDocNumber: exp3.docNumber,
      idempotencyKey: 'SEED_JRN_0008',
      description: 'Pencairan Biaya Survei Lapangan Proyek Advisory (EXP-2026-0003)',
      totalDebit: '18500000.00',
      totalCredit: '18500000.00',
      lines: [
        { accountCode: '5-1300', costCenterId: ccKonsulProj.id, description: 'Beban tim enumerator & survei lapangan', debit: '18500000.00', credit: '0.00' },
        { accountCode: '1-1120', costCenterId: ccKonsulProj.id, description: 'Pengeluaran Bank Mandiri untuk EXP-2026-0003', debit: '0.00', credit: '18500000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0009',
      entryDate: new Date('2026-10-24T09:30:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'CUSTOMER_INVOICE',
      sourceId: inv3.id,
      sourceDocNumber: inv3.docNumber,
      idempotencyKey: 'SEED_JRN_0009',
      description: 'Penerbitan Invoice INV-2026-0003 - Badan Pengembangan SDM Provinsi',
      totalDebit: '33300000.00',
      totalCredit: '33300000.00',
      lines: [
        { accountCode: '1-1210', costCenterId: ccDiklatProg.id, description: 'Piutang Usaha INV-2026-0003', debit: '33300000.00', credit: '0.00' },
        { accountCode: '4-1100', costCenterId: ccDiklatProg.id, description: 'Pendapatan Kursus Publik Tata Kelola Proyek', debit: '0.00', credit: '30000000.00' },
        { accountCode: '2-1210', costCenterId: ccDiklatProg.id, description: 'PPN Keluaran 11% INV-2026-0003', debit: '0.00', credit: '3300000.00' },
      ],
    },
    {
      journalNumber: 'JRN-FY-2026-0010',
      entryDate: new Date('2026-10-24T13:15:00.000Z'),
      businessUnitId: unitDiklat.id,
      sourceType: 'PAYMENT',
      sourceDocNumber: 'KWT-2026-0003',
      idempotencyKey: 'SEED_JRN_0010',
      description: 'Penerimaan Tunai Kasir atas INV-2026-0003 (KWT-2026-0003)',
      totalDebit: '16650000.00',
      totalCredit: '16650000.00',
      lines: [
        { accountCode: '1-1110', description: 'Penerimaan tunai loket kasir CSH-2026-0001', debit: '16650000.00', credit: '0.00' },
        { accountCode: '1-1210', description: 'Pelunasan parsial 50% INV-2026-0003', debit: '0.00', credit: '16650000.00' },
      ],
    },
  ];

  for (const j of journalsData) {
    await prisma.journalEntry.create({
      data: {
        journalNumber: j.journalNumber,
        entryDate: j.entryDate,
        fiscalPeriodId: period2026Open.id,
        businessUnitId: j.businessUnitId,
        sourceType: j.sourceType,
        sourceId: j.sourceId ?? null,
        sourceDocNumber: j.sourceDocNumber,
        idempotencyKey: j.idempotencyKey,
        description: j.description,
        totalDebit: j.totalDebit,
        totalCredit: j.totalCredit,
        status: 'POSTED',
        createdById: userAcc.id,
        createdByName: userAcc.fullName,
        postedById: userAcc.id,
        postedAt: j.entryDate,
        lines: { create: j.lines },
      },
    });
  }

  // 16. Fixed Assets & Strategic Evaluations
  await prisma.fixedAsset.createMany({
    data: [
      {
        assetCode: 'AST-2026-0001',
        name: 'Sistem Kamera Konferensi PTZ 4K & Audio Array (2 Set) [DATA DEMO]',
        category: 'Peralatan Multimedia & Kelas',
        businessUnitId: unitDiklat.id,
        acquisitionDate: new Date('2026-09-16T00:00:00.000Z'),
        acquisitionCost: '30000000.00',
        salvageValue: '3000000.00',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '562500.00',
        bookValue: '29437500.00',
        location: 'Gedung Diklat Ruang Hybrid A1 & A2',
        status: 'ACTIVE',
      },
      {
        assetCode: 'AST-2025-0014',
        name: 'Server Virtualisasi & NAS Backup PMO UTama [DATA DEMO]',
        category: 'Infrastruktur TI',
        businessUnitId: unitOps.id,
        acquisitionDate: new Date('2025-03-10T00:00:00.000Z'),
        acquisitionCost: '68000000.00',
        salvageValue: '5000000.00',
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '18900000.00',
        bookValue: '49100000.00',
        location: 'Ruang Server Pusat Lt. 3',
        status: 'ACTIVE',
      },
    ],
  });

  await prisma.strategicEvaluation.create({
    data: {
      evalNumber: 'EVAL-2026-001',
      fiscalPeriodId: period2026Open.id,
      businessUnitId: unitDiklat.id,
      targetRevenue: '650000000.00',
      actualRevenue: '127650000.00',
      budgetCeiling: '350000000.00',
      actualExpense: '49950000.00',
      netCashflow: '77700000.00',
      varianceAnalysis:
        'Efisiensi biaya operasional pelatihan terjaga pada rasio 39% terhadap pendapatan tertagih. Penambahan perangkat hybrid mampu menekan biaya sewa ruang eksternal.',
      riskSummary:
        '1. Piutang termin ke-2 pada proyek korporat perlu percepatan penagihan.\n2. Terdapat 1 sesi kasir dengan selisih fisik Rp 75.000 yang menunggu berita acara.',
      recommendedNextCeiling: '385000000.00',
      recommendedRevenueTarget: '750000000.00',
      gmDecision: 'PENDING',
    },
  });

  // 17. Pending Approval Inbox Requests & Notifications
  await prisma.approvalRequest.createMany({
    data: [
      {
        requestNumber: 'APR-BDG-0001',
        module: 'BUDGET',
        entityId: budgetSekreSubmitted.id,
        entityCode: budgetSekreSubmitted.docNumber,
        title: `Persetujuan Anggaran: ${budgetSekreSubmitted.title}`,
        businessUnitId: unitOps.id,
        amount: budgetSekreSubmitted.totalAllocated,
        status: 'PENDING',
        requestedById: userFin.id,
        requestedByName: userFin.fullName,
        requiredRoleCode: 'GM_PMO',
      },
      {
        requestNumber: 'APR-PR-0001',
        module: 'PURCHASE_REQUEST',
        entityId: prPending.id,
        entityCode: prPending.docNumber,
        title: `Persetujuan PR: ${prPending.title}`,
        businessUnitId: unitDiklat.id,
        amount: prPending.estimatedTotal,
        status: 'PENDING',
        requestedById: userUnitMgr.id,
        requestedByName: userUnitMgr.fullName,
        requiredRoleCode: 'FINANCE_MANAGER',
      },
      {
        requestNumber: 'APR-EXP-0001',
        module: 'EXPENSE',
        entityId: expPending.id,
        entityCode: expPending.docNumber,
        title: `Persetujuan Pengeluaran: ${expPending.title}`,
        businessUnitId: unitDiklat.id,
        amount: expPending.totalAmount,
        status: 'PENDING',
        requestedById: userUnitMgr.id,
        requestedByName: userUnitMgr.fullName,
        requiredRoleCode: 'FINANCE_MANAGER',
      },
      {
        requestNumber: 'APR-CSH-0001',
        module: 'CASHIER_DISCREPANCY',
        entityId: sessionReview.id,
        entityCode: sessionReview.sessionNumber,
        title: `Review Selisih Penutupan Kasir ${sessionReview.sessionNumber} (-Rp 75.000)`,
        businessUnitId: unitDiklat.id,
        amount: '75000.00',
        status: 'PENDING',
        requestedById: userCashier.id,
        requestedByName: userCashier.fullName,
        requiredRoleCode: 'FINANCE_MANAGER',
        exceptionReason: sessionReview.discrepancyReason,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        roleCode: 'GM_PMO',
        title: 'Menunggu Persetujuan: Anggaran BDG-FY-2026-003',
        message: 'Usulan anggaran Sekretariat PMO sebesar Rp 95.000.000 menunggu keputusan GM PMO.',
        category: 'APPROVAL_REQUIRED',
        severity: 'WARNING',
        targetUrl: '/approvals',
        entityType: 'Budget',
        entityId: budgetSekreSubmitted.id,
      },
      {
        roleCode: 'FINANCE_MANAGER',
        title: '3 Permintaan Persetujuan Menunggu Verifikasi Finance',
        message: 'PR-2026-0003, EXP-2026-0004, dan Berita Acara Kasir CSH-2026-0001 memerlukan tindakan.',
        category: 'APPROVAL_REQUIRED',
        severity: 'WARNING',
        targetUrl: '/approvals',
        entityType: 'PurchaseRequest',
        entityId: prPending.id,
      },
      {
        roleCode: 'FINANCE_MANAGER',
        title: 'Mutasi Bank BNI: 2 Baris Belum Terealisasi Rekonsiliasi',
        message: 'Terdapat 1 transfer tanpa referensi (Rp 7.500.000) dan 1 setoran kasir menunggu review.',
        category: 'RECONCILIATION_ALERT',
        severity: 'DANGER',
        targetUrl: '/reconciliation',
        entityType: 'BankStatementImport',
        entityId: bankImport.id,
      },
    ],
  });

  // 18. Initial Audit Trail Records
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: userGm.id,
        actorName: userGm.fullName,
        actorRole: 'GM_PMO',
        action: 'BUDGET_REVISED',
        module: 'BUDGET',
        entityType: 'Budget',
        entityId: budgetDiklat.id,
        entityCode: budgetDiklat.docNumber,
        summary: 'Mengesahkan revisi anggaran BDG-FY-2026-001 (Versi 2) menjadi Rp 350.000.000',
        requestId: 'seed-init-001',
      },
      {
        actorId: userProc.id,
        actorName: userProc.fullName,
        actorRole: 'PROCUREMENT',
        action: 'PO_CREATED',
        module: 'PROCUREMENT',
        entityType: 'PurchaseOrder',
        entityId: poCompleted.id,
        entityCode: poCompleted.docNumber,
        summary: 'Menerbitkan PO-2026-0001 ke PT Mitra Solusi Integrasi setelah evaluasi 3 penawaran vendor',
        requestId: 'seed-init-002',
      },
      {
        actorId: userFin.id,
        actorName: userFin.fullName,
        actorRole: 'FINANCE_MANAGER',
        action: 'EXPENSE_PAID_AND_POSTED',
        module: 'EXPENSE',
        entityType: 'Expense',
        entityId: exp1.id,
        entityCode: exp1.docNumber,
        summary: 'Mencairkan EXP-2026-0001 (Rp 33.300.000) dan memposting jurnal otomatis JRN-FY-2026-0003',
        requestId: 'seed-init-003',
      },
      {
        actorId: userCashier.id,
        actorName: userCashier.fullName,
        actorRole: 'CASHIER',
        action: 'CASHIER_CLOSEOUT_SUBMITTED',
        module: 'CASHIER',
        entityType: 'CashierSession',
        entityId: sessionReview.id,
        entityCode: sessionReview.sessionNumber,
        summary: 'Mengajukan penutupan kasir CSH-2026-0001 dengan selisih fisik -Rp 75.000 untuk ditinjau supervisor',
        requestId: 'seed-init-004',
      },
    ],
  });

  console.log('Seed DATA DEMO selesai dengan sukses.');
}

main()
  .catch((e) => {
    console.error('Gagal menjalankan seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
