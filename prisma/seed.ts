import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../apps/api/src/shared/security.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Memulai seed MASTER DATA (Bersih / Tanpa Data Transaksi) untuk ERP Keuangan & Operasional PMO UTama...');

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

  // Remember existing users' business unit codes before wiping businessUnit table
  const userUnitCodes = new Map<string, string>();
  try {
    const usersWithUnits = await prisma.user.findMany({
      where: { businessUnitId: { not: null } },
      include: { businessUnit: true },
    });
    for (const u of usersWithUnits) {
      if (u.businessUnit?.code) {
        userUnitCodes.set(u.id, u.businessUnit.code);
      }
    }
  } catch (err) {
    console.warn('Could not read existing user business unit mappings:', err);
  }

  // NOTE: User and Role tables are preserved per requirement!
  // await prisma.user.deleteMany();
  // await prisma.role.deleteMany();
  await prisma.costCenter.deleteMany();
  await prisma.fundSource.deleteMany();
  await prisma.fiscalPeriod.deleteMany();
  await prisma.businessUnit.deleteMany();

  // 1. System Settings
  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'APP_BRAND_NAME',
        value: 'ERP Keuangan & Operasional PMO UTama',
        category: 'BRANDING',
        description: 'Nama aplikasi pada sidebar dan laporan',
      },
      {
        key: 'APP_BRAND_MARKER',
        value: '[PMO UTAMA]',
        category: 'BRANDING',
        description: 'Penanda teks identitas brand',
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
      name: 'General Manager PMO UTama',
      description: 'Pimpinan tertinggi operasional bisnis PMO UTama PTNBH Universitas Terbuka. Menyetujui anggaran tahunan, revisi belanja unit, PR skala besar (> Rp 25 Juta), otorisasi pengeluaran strategis, dan evaluasi strategi ekspansi bisnis.',
      approvalLimit: '5000000000.00',
      permissions: [
        'dashboard:view',
        'approval:view',
        'approval:action',
        'budget:view',
        'budget:create',
        'budget:submit',
        'budget:approve',
        'procurement:view',
        'procurement:create',
        'procurement:approve',
        'expense:view',
        'expense:create',
        'expense:approve',
        'expense:pay',
        'revenue:view',
        'revenue:create',
        'payment:view',
        'payment:create',
        'payment:approve',
        'cashier:view',
        'cashier:operate',
        'reconciliation:view',
        'reconciliation:manage',
        'accounting:view',
        'accounting:manage',
        'accounting:post',
        'report:view',
        'report:export',
        'strategy:view',
        'strategy:manage',
        'audit:view',
        'admin:view',
      ],
    },
    {
      code: 'FINANCE_MANAGER',
      name: 'Finance Manager / Kepala Keuangan PMO',
      description: 'Pengelola perbendaharaan, likuiditas rekening kas/bank, otorisasi pencairan belanja (< Rp 25 Juta), validasi 3-way matching faktur vendor (AP), kepatuhan perpajakan, dan pelaporan akuntansi PSAK.',
      approvalLimit: '250000000.00',
      permissions: [
        'dashboard:view',
        'approval:view',
        'approval:action',
        'budget:view',
        'budget:create',
        'budget:submit',
        'budget:approve',
        'procurement:view',
        'procurement:create',
        'procurement:approve',
        'expense:view',
        'expense:create',
        'expense:approve',
        'expense:pay',
        'revenue:view',
        'revenue:create',
        'payment:view',
        'payment:create',
        'payment:approve',
        'cashier:view',
        'cashier:operate',
        'reconciliation:view',
        'reconciliation:manage',
        'accounting:view',
        'accounting:manage',
        'accounting:post',
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
      name: 'Manager Unit Bisnis (IT, MICE, TCI, Klinik)',
      description: 'Kepala Unit Pelaksana Bisnis PMO (Divisi IT Solution, Divisi MICE, Divisi TCI, Divisi Klinik Pratama). Bertanggung jawab atas pencapaian pendapatan unit, usulan Rencana Anggaran (RAB), dan belanja kegiatan proyek unit.',
      approvalLimit: '10000000.00',
      permissions: [
        'dashboard:view',
        'approval:view',
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
      name: 'Procurement / Staf Pengadaan',
      description: 'Pengelola komparasi 3 vendor penawaran, evaluasi kelayakan vendor, penerbitan PO, penerimaan barang/jasa (BAST), dan pencatatan tagihan vendor (AP).',
      approvalLimit: '15000000.00',
      permissions: [
        'dashboard:view',
        'budget:view',
        'procurement:view',
        'procurement:create',
        'expense:view',
        'report:view',
      ],
    },
    {
      code: 'ACCOUNTING',
      name: 'Accounting / Staf Akuntansi',
      description: 'Pencatatan faktur vendor (AP), buku besar (GL), jurnal penyesuaian double-entry, analisis umur piutang & utang (AR/AP Aging), penyusutan aset tetap, dan penutupan buku.',
      approvalLimit: '0.00',
      permissions: [
        'dashboard:view',
        'budget:view',
        'procurement:view',
        'expense:view',
        'revenue:view',
        'payment:view',
        'reconciliation:view',
        'reconciliation:manage',
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
      name: 'Staf Pajak / Tax Compliance',
      description: 'Pengecekan faktur PPN masukan (AP) & keluaran (AR), bukti potong PPh 21/23/Final, pembukuan akun kewajiban pajak, dan SPT masa.',
      approvalLimit: '0.00',
      permissions: [
        'dashboard:view',
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
      name: 'Petugas Kasir / Loket Layanan',
      description: 'Operasional buka/tutup loket per shift, penerimaan tunai/EDC/QRIS, cetak kuitansi, dan setoran kas ke bank.',
      approvalLimit: '0.00',
      permissions: [
        'dashboard:view',
        'revenue:view',
        'payment:view',
        'payment:create',
        'cashier:view',
        'cashier:operate',
      ],
    },
    {
      code: 'AUDITOR',
      name: 'Internal Auditor / SPI (Satuan Pengawas Internal PTNBH UT)',
      description: 'Pengawas independen perwakilan Satuan Pengawas Internal (SPI) PTNBH Universitas Terbuka. Bertugas memantau perkembangan bisnis, kepatuhan tata kelola, transparansi keuangan, dan audit kepatuhan anggaran PMO UTama.',
      approvalLimit: '0.00',
      permissions: [
        'dashboard:view',
        'approval:view',
        'budget:view',
        'procurement:view',
        'expense:view',
        'revenue:view',
        'payment:view',
        'cashier:view',
        'reconciliation:view',
        'accounting:view',
        'report:view',
        'report:export',
        'strategy:view',
        'audit:view',
        'admin:view',
      ],
    },
  ];

  for (const r of rolesData) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        approvalLimit: r.approvalLimit,
      },
      create: r,
    });
  }

  // 3. Business Units (4 Divisi PMO UTama + Kantor Pusat), Cost Centers, Fund Sources & Fiscal Periods
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

  // Re-link existing users to newly created business units
  const allCreatedUnits = await prisma.businessUnit.findMany();
  const unitIdByCode = new Map(allCreatedUnits.map((bu) => [bu.code, bu.id]));
  for (const [userId, buCode] of userUnitCodes.entries()) {
    const targetBuId = unitIdByCode.get(buCode);
    if (targetBuId) {
      await prisma.user.update({
        where: { id: userId },
        data: { businessUnitId: targetBuId },
      }).catch(() => {});
    }
  }

  // Cost Centers per Division
  await prisma.costCenter.createMany({
    data: [
      { code: 'CC-ITS-01', name: 'Software Engineering & Cloud Hosting', businessUnitId: unitItSolution.id },
      { code: 'CC-ITS-02', name: 'IT Infrastructure & Cyber Security', businessUnitId: unitItSolution.id },
      { code: 'CC-MICE-01', name: 'Wisma, Kamar & Front Office', businessUnitId: unitMice.id },
      { code: 'CC-MICE-02', name: 'Ballroom, Banquet & Catering Event', businessUnitId: unitMice.id },
      { code: 'CC-TCI-01', name: 'Penyelenggaraan Workshop & Sertifikasi', businessUnitId: unitTci.id },
      { code: 'CC-TCI-02', name: 'Infrastruktur Kelas & Modul Digital', businessUnitId: unitTci.id },
      { code: 'CC-KLN-01', name: 'Poli Umum & Layanan Medis', businessUnitId: unitKlinik.id },
      { code: 'CC-KLN-02', name: 'Instalasi Farmasi, Obat & Laboratorium', businessUnitId: unitKlinik.id },
      { code: 'CC-OPS-01', name: 'Administrasi & Dukungan PMO Pusat', businessUnitId: unitPusat.id },
    ],
  });

  // Fund Sources
  await prisma.fundSource.createMany({
    data: [
      {
        code: 'FS-RKAP',
        name: 'Alokasi Modal Kerja RKAP PMO',
        type: 'INTERNAL_ALLOCATION',
        description: 'Plafon anggaran modal kerja tahunan internal PMO UTama',
      },
      {
        code: 'FS-REV',
        name: 'Penerimaan Layanan Komersial Unit',
        type: 'CUSTOMER_REVENUE',
        description: 'Sumber pendanaan kembali dari pendapatan kontrak operasional unit',
      },
    ],
  });

  // Fiscal Periods
  await prisma.fiscalPeriod.create({
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

  await prisma.fiscalPeriod.create({
    data: {
      code: 'FY-2026',
      name: 'Tahun Buku 2026 (Aktif)',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      status: 'OPEN',
      isClosed: false,
    },
  });

  // 4. Users for All 9 Roles (1 Akun per Role, Password: DemoErp!2026)
  const defaultPassHash = hashPassword('DemoErp!2026');

  const usersData = [
    {
      email: 'admin@pmoutama.demo.id',
      fullName: 'Arif Budiman (Super Admin)',
      passwordHash: defaultPassHash,
      roleCode: 'SUPER_ADMIN',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'gm@pmoutama.demo.id',
      fullName: 'Ir. Hendra Wijaya, MBA (GM PMO)',
      passwordHash: defaultPassHash,
      roleCode: 'GM_PMO',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'finance@pmoutama.demo.id',
      fullName: 'Siti Rahmawati, SE, Ak (Finance Manager)',
      passwordHash: defaultPassHash,
      roleCode: 'FINANCE_MANAGER',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'unit.manager@pmoutama.demo.id',
      fullName: 'Rendra Pratama, M.Kom (Unit Manager)',
      passwordHash: defaultPassHash,
      roleCode: 'UNIT_MANAGER',
      businessUnitId: unitTci.id,
      isDemoData: true,
    },
    {
      email: 'procurement@pmoutama.demo.id',
      fullName: 'Bagus Santoso (Procurement Officer)',
      passwordHash: defaultPassHash,
      roleCode: 'PROCUREMENT',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'accounting@pmoutama.demo.id',
      fullName: 'Larasati Putri, CPA (Accounting Officer)',
      passwordHash: defaultPassHash,
      roleCode: 'ACCOUNTING',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'kasir@pmoutama.demo.id',
      fullName: 'Dimas Aditya (Petugas Kasir)',
      passwordHash: defaultPassHash,
      roleCode: 'CASHIER',
      businessUnitId: unitTci.id,
      isDemoData: true,
    },
    {
      email: 'tax@pmoutama.demo.id',
      fullName: 'Fajar Nugroho, BKP (Tax Officer)',
      passwordHash: defaultPassHash,
      roleCode: 'TAX_OFFICER',
      businessUnitId: null,
      isDemoData: true,
    },
    {
      email: 'auditor@pmoutama.demo.id',
      fullName: 'Dewi Anggraini, CIA (Internal Auditor)',
      passwordHash: defaultPassHash,
      roleCode: 'AUDITOR',
      businessUnitId: null,
      isDemoData: true,
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        roleCode: u.roleCode,
        businessUnitId: u.businessUnitId,
      },
      create: u,
    });
  }

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

  // 7. Tax Configurations
  await prisma.taxConfiguration.createMany({
    data: [
      {
        taxCode: 'PPN-11',
        name: 'PPN Standar 11%',
        taxType: 'PPN',
        ratePercent: '11.00',
        effectiveFrom: new Date('2022-04-01T00:00:00.000Z'),
        version: 1,
        isInclusive: false,
        notes: 'Tarif PPN standar sesuai regulasi.',
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

  // 8. Vendors
  await prisma.vendor.createMany({
    data: [
      {
        code: 'VND-0001',
        name: 'PT Mitra Solusi Integrasi',
        legalName: 'PT Mitra Solusi Integrasi Nusantara',
        taxIdNpwp: '01.234.567.8-012.000',
        category: 'Perangkat TI & Infrastruktur',
        contactName: 'Haryanto Wibowo',
        email: 'sales@mitrasolusi.id',
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
      {
        code: 'VND-0002',
        name: 'PT Prima Tekno Mandiri',
        legalName: 'PT Prima Tekno Mandiri Sejahtera',
        taxIdNpwp: '02.345.678.9-044.000',
        category: 'Perangkat TI & Infrastruktur',
        contactName: 'Yuniarti Lestari',
        email: 'tender@primatekno.id',
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
      {
        code: 'VND-0003',
        name: 'CV Sinergi Sarana Edukasi',
        legalName: 'CV Sinergi Sarana Edukasi',
        taxIdNpwp: '03.456.789.0-091.000',
        category: 'Perlengkapan Pelatihan & Percetakan',
        contactName: 'Bambang Kurniawan',
        email: 'order@sinergisarana.id',
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
    ],
  });

  // 9. Customers
  await prisma.customer.createMany({
    data: [
      {
        code: 'CUST-0001',
        name: 'PT Karya Infrastruktur Persero',
        organizationType: 'SOE_BUMN',
        taxIdNpwp: '01.001.889.2-051.000',
        contactPerson: 'dr. Ratna Sari, MM (VP Learning)',
        email: 'corpu@karyainfrastruktur.id',
        phone: '021-29901100',
        address: 'Jl. Jend. Sudirman Kav. 52, Jakarta',
        creditLimit: '500000000.00',
      },
      {
        code: 'CUST-0002',
        name: 'PT Bank Nusantara Sejahtera Tbk',
        organizationType: 'CORPORATE',
        taxIdNpwp: '01.309.442.1-093.000',
        contactPerson: 'Erwin Setiawan (Head of PMO Division)',
        email: 'pmo.office@banknusantara.id',
        phone: '021-5158800',
        address: 'Kawasan Mega Kuningan Lot 8, Jakarta',
        creditLimit: '350000000.00',
      },
      {
        code: 'CUST-0003',
        name: 'Badan Pengembangan SDM Provinsi',
        organizationType: 'GOVERNMENT',
        taxIdNpwp: '00.112.334.5-401.000',
        contactPerson: 'Drs. Wahyu Hidayat, M.Si',
        email: 'bpsdm@provinsi.go.id',
        phone: '022-7310022',
        address: 'Jl. Cimahi Raya No. 12, Jawa Barat',
        creditLimit: '250000000.00',
      },
    ],
  });

  // 10. Product & Service Catalog
  await prisma.productService.createMany({
    data: [
      {
        sku: 'SRV-DKL-001',
        name: 'Program Sertifikasi Project Management Professional (In-House 25 Peserta)',
        category: 'Pelatihan Eksekutif',
        businessUnitId: unitTci.id,
        unitPrice: '85000000.00',
        unit: 'Batch',
        taxCode: 'PPN-11',
        revenueAccountCode: '4-1100',
      },
      {
        sku: 'SRV-DKL-002',
        name: 'Kursus Publik Tata Kelola & Anggaran Proyek (Reguler Per Peserta)',
        category: 'Pelatihan Reguler',
        businessUnitId: unitTci.id,
        unitPrice: '15000000.00',
        unit: 'Paket',
        taxCode: 'PPN-11',
        revenueAccountCode: '4-1100',
      },
      {
        sku: 'SRV-KNS-001',
        name: 'Jasa Konsultansi Penyusunan Maturity Model PMO & Evaluasi Portofolio',
        category: 'Konsultansi',
        businessUnitId: unitItSolution.id,
        unitPrice: '110000000.00',
        unit: 'Proyek',
        taxCode: 'PPN-11',
        revenueAccountCode: '4-1200',
      },
      {
        sku: 'SRV-MICE-001',
        name: 'Paket Meeting Fullboard Ballroom MICE (100 Pax, Sound & Banquet)',
        category: 'MICE & Event',
        businessUnitId: unitMice.id,
        unitPrice: '45000000.00',
        unit: 'Event',
        taxCode: 'PB1-10',
        revenueAccountCode: '4-1100',
      },
      {
        sku: 'SRV-MICE-002',
        name: 'Sewa Kamar Wisma Deluxe (Breakfast, Amenities & Wifi)',
        category: 'Kamar & Wisma',
        businessUnitId: unitMice.id,
        unitPrice: '650000.00',
        unit: 'Malam',
        taxCode: 'PB1-10',
        revenueAccountCode: '4-1100',
      },
      {
        sku: 'SRV-ITS-001',
        name: 'Lisensi Enterprise ERP & Layanan Cloud Managed Service',
        category: 'IT Solution',
        businessUnitId: unitItSolution.id,
        unitPrice: '60000000.00',
        unit: 'Tahun',
        taxCode: 'PPN-11',
        revenueAccountCode: '4-1200',
      },
      {
        sku: 'SRV-KLN-001',
        name: 'Paket Medical Check Up (MCU) Eksekutif Karyawan',
        category: 'Layanan Medis',
        businessUnitId: unitKlinik.id,
        unitPrice: '1250000.00',
        unit: 'Orang',
        taxCode: 'BEBAS',
        revenueAccountCode: '4-1100',
      },
      {
        sku: 'SRV-KLN-002',
        name: 'Konsultasi Dokter Umum & Resep Obat Farmasi',
        category: 'Poliklinik',
        businessUnitId: unitKlinik.id,
        unitPrice: '250000.00',
        unit: 'Pasien',
        taxCode: 'BEBAS',
        revenueAccountCode: '4-1100',
      },
    ],
  });

  // 11. Bank Accounts & Cash Registers
  await prisma.bankAccount.createMany({
    data: [
      {
        code: 'BNK-MDR-01',
        bankName: 'Bank Mandiri - Cabang Jakarta Sudirman',
        accountNumberMasked: '124-00-****-8891',
        accountHolder: 'PMO UTama - Operasional & Pengeluaran',
        businessUnitId: unitPusat.id,
        glAccountCode: '1-1120',
        currentBalance: '0.00',
      },
      {
        code: 'BNK-BNI-01',
        bankName: 'Bank BNI - Cabang Kampus Utama',
        accountNumberMasked: '088-41-****-2209',
        accountHolder: 'PMO UTama - Penerimaan Layanan',
        businessUnitId: unitTci.id,
        glAccountCode: '1-1130',
        currentBalance: '0.00',
      },
    ],
  });

  await prisma.cashRegister.createMany({
    data: [
      {
        code: 'REG-TCI-01',
        name: 'Loket Kasir & Pembayaran Divisi TCI',
        businessUnitId: unitTci.id,
      },
      {
        code: 'REG-MICE-01',
        name: 'Kasir Front Office & Wisma MICE',
        businessUnitId: unitMice.id,
      },
      {
        code: 'REG-KLN-01',
        name: 'Loket Kasir & Farmasi Klinik Pratama',
        businessUnitId: unitKlinik.id,
      },
    ],
  });

  console.log('✅ SEED MASTER DATA BERHASIL. Seluruh data transaksi bersih / 0.');
}

main()
  .catch((e) => {
    console.error('Gagal menjalankan seed master data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
