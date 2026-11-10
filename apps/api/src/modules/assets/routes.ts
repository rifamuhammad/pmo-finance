import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toNumber } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth } from '../../middleware/auth.js';

export const assetRouter = Router();

assetRouter.use(requireAuth);

// ISAK 335 & Pertor 310 Fixed Asset Capitalization Rules Constants
export const CAPITALIZATION_RULES = {
  MIN_THRESHOLD_EQUIPMENT: 1_000_000, // Rp 1.000.000 (Peralatan, Mesin, Komputer, Furnitur)
  MIN_THRESHOLD_BUILDING: 20_000_000,  // Rp 20.000.000 (Gedung, Bangunan, Renovasi Struktural)
  SUBSEQUENT_EXPENSE_RATIO_PERCENT: 10.0, // Batas 10% dari Nilai Buku Bersih (Net Book Value)
  COA_MAPPING: {
    ASSET_EQUIPMENT: '120301010100', // Aset Tetap - Peralatan & Mesin Kantor
    ASSET_BUILDING: '120301010100',  // Aset Tetap
    MAINTENANCE_EXPENSE: '520901060100', // Beban Pemeliharaan Unit Usaha (Pengeluaran <= 10%)
    LOW_VALUE_EXPENSE: '520901020100',   // Beban Barang dan Perlengkapan Unit Usaha (< Ambang Batas)
    CREDIT_BANK_BRI: '110101020200',     // Bank BRI Operasional PMO
  },
  REGULATORY_REFERENCE: 'ISAK 335 & Peraturan Rektor UT No. 310 Tahun 2024 tentang Tata Kelola Aset Tetap PTN-BH',
};

// Helper: Evaluasi Kapitalisasi Sesuai ISAK 335 & Pertor 310
export function evaluateCapitalization(params: {
  type: 'NEW_ACQUISITION' | 'SUBSEQUENT_EXPENDITURE';
  category?: string;
  amount: number;
  currentBookValue?: number;
  additionalMonths?: number;
}) {
  const isBuilding =
    params.category?.toLowerCase().includes('gedung') ||
    params.category?.toLowerCase().includes('bangunan');
  const minThreshold = isBuilding
    ? CAPITALIZATION_RULES.MIN_THRESHOLD_BUILDING
    : CAPITALIZATION_RULES.MIN_THRESHOLD_EQUIPMENT;

  if (params.type === 'NEW_ACQUISITION') {
    const isCapitalized = params.amount >= minThreshold;
    return {
      type: 'NEW_ACQUISITION',
      amount: params.amount,
      minThreshold,
      isCapitalized,
      ratioPercent: 100,
      accountingTreatment: isCapitalized ? 'CAPITALIZED_TO_ASSET' : 'EXPENSED_DIRECTLY',
      recommendedDebitCoa: isCapitalized
        ? CAPITALIZATION_RULES.COA_MAPPING.ASSET_EQUIPMENT
        : CAPITALIZATION_RULES.COA_MAPPING.LOW_VALUE_EXPENSE,
      recommendedCreditCoa: CAPITALIZATION_RULES.COA_MAPPING.CREDIT_BANK_BRI,
      status: isCapitalized ? 'CAPITALIZED' : 'EXPENSED',
      explanation: isCapitalized
        ? `Nilai perolehan (Rp ${params.amount.toLocaleString('id-ID')}) memenuhi ambang batas kapitalisasi (Rp ${minThreshold.toLocaleString('id-ID')}) sesuai ISAK 335 & Pertor 310.`
        : `Nilai perolehan (Rp ${params.amount.toLocaleString('id-ID')}) di bawah ambang batas kapitalisasi (Rp ${minThreshold.toLocaleString('id-ID')}). Harus diakui sebagai Beban Perlengkapan operasional tahun berjalan.`,
    };
  }

  // SUBSEQUENT_EXPENDITURE (Perbaikan, Renovasi, Pemeliharaan Aset)
  const bookValue = Math.max(0, params.currentBookValue ?? 0);
  let ratioPercent = 0;
  let isCapitalized = false;

  if (bookValue === 0) {
    // Aset sudah susut penuh (book value 0 / salvage value) -> Renovasi material >= 1 juta dikapitalisasi
    ratioPercent = 100;
    isCapitalized = params.amount >= CAPITALIZATION_RULES.MIN_THRESHOLD_EQUIPMENT;
  } else {
    ratioPercent = Number(((params.amount / bookValue) * 100).toFixed(2));
    isCapitalized = ratioPercent > CAPITALIZATION_RULES.SUBSEQUENT_EXPENSE_RATIO_PERCENT;
  }

  const accountingTreatment = isCapitalized ? 'CAPITALIZED_TO_ASSET' : 'EXPENSED_TO_MAINTENANCE';
  const recommendedDebitCoa = isCapitalized
    ? CAPITALIZATION_RULES.COA_MAPPING.ASSET_EQUIPMENT
    : CAPITALIZATION_RULES.COA_MAPPING.MAINTENANCE_EXPENSE;

  return {
    type: 'SUBSEQUENT_EXPENDITURE',
    amount: params.amount,
    currentBookValue: bookValue,
    thresholdRatioPercent: CAPITALIZATION_RULES.SUBSEQUENT_EXPENSE_RATIO_PERCENT,
    ratioPercent,
    isCapitalized,
    accountingTreatment,
    recommendedDebitCoa,
    recommendedCreditCoa: CAPITALIZATION_RULES.COA_MAPPING.CREDIT_BANK_BRI,
    status: isCapitalized ? 'CAPITALIZED' : 'EXPENSED',
    explanation: isCapitalized
      ? `Pengeluaran perbaikan/renovasi (Rp ${params.amount.toLocaleString('id-ID')}) sebesar ${ratioPercent}% (>10% dari nilai buku Rp ${bookValue.toLocaleString('id-ID')}). Memenuhi kriteria kapitalisasi: menambah masa manfaat / nilai aset sesuai ISAK 335 & Pertor 310.`
      : `Pengeluaran pemeliharaan rutin (Rp ${params.amount.toLocaleString('id-ID')}) sebesar ${ratioPercent}% (<=10% dari nilai buku Rp ${bookValue.toLocaleString('id-ID')}). Diakui sebagai Beban Pemeliharaan tahun berjalan tanpa menambah nilai buku aset.`,
  };
}

// Helper to seed realistic PMO assets including PBI UT loans and Mas Wildan as PIC
async function ensureAssetSeedData() {
  try {
    const count = await prisma.fixedAsset.count();
    if (count > 0) return;

    const units = await prisma.businessUnit.findMany({
      select: { id: true, code: true, name: true },
    });
    const buMice = units.find((u) => u.code === 'BU-MICE') || units[0];
    const buTci = units.find((u) => u.code === 'BU-TCI') || units[0];
    const buIts = units.find((u) => u.code === 'BU-ITS') || units[0];
    const buKlinik = units.find((u) => u.code === 'BU-KLINIK') || units[0];
    const buPmo = units.find((u) => u.code === 'PMO-MGMT') || units.find((u) => u.code === 'BU-PUSAT') || units.find((u) => u.code === 'BU-CORP') || units[0];

    const defaultPic = 'Wildan Pramono (Staff Aset & Logistik PMO)';

    const seedAssets = [
      {
        assetCode: 'AST/MICE/UT-001',
        name: 'Line Array Sound System & Mixer Digital 32-Ch Ballroom MICE',
        category: 'Audio Visual & Event Equipment',
        businessUnitId: buMice.id,
        ownershipStatus: 'PBI_UT_LOAN',
        lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
        loanDocNumber: 'BAST-PBI/PMO/MICE/2024/011',
        loanDate: new Date('2024-02-15'),
        picPerson: defaultPic,
        brandModel: 'Yamaha TF5 + QSC KLA12 Line Array',
        serialNumber: 'SN-YMH-882910-MICE',
        condition: 'GOOD',
        acquisitionDate: new Date('2024-02-15'),
        acquisitionCost: 185000000,
        salvageValue: 18500000,
        usefulLifeYears: 5,
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 61050000,
        bookValue: 123950000,
        location: 'Ballroom Lantai 3 Gedung Serbaguna UT',
        status: 'ACTIVE',
        notes: 'Peminjaman inventaris PBI UT untuk operasional divisi MICE. Data dikelola Mas Wildan.',
      },
      {
        assetCode: 'AST/MICE/UT-002',
        name: 'Projector Laser 10,000 Lumens & Motorized Screen 300 Inch',
        category: 'Audio Visual & Event Equipment',
        businessUnitId: buMice.id,
        ownershipStatus: 'PBI_UT_LOAN',
        lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
        loanDocNumber: 'BAST-PBI/PMO/MICE/2024/012',
        loanDate: new Date('2024-03-01'),
        picPerson: defaultPic,
        brandModel: 'Panasonic PT-MZ10K Laser Projector',
        serialNumber: 'SN-PNS-102931-LSR',
        condition: 'GOOD',
        acquisitionDate: new Date('2024-03-01'),
        acquisitionCost: 95000000,
        salvageValue: 9500000,
        usefulLifeYears: 4,
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 35625000,
        bookValue: 59375000,
        location: 'Main Hall MICE Convention UT',
        status: 'ACTIVE',
        notes: 'Aset pinjaman PBI UT untuk acara skala besar / wisuda / conference MICE.',
      },
      {
        assetCode: 'AST/MICE/PMO-001',
        name: 'Set Meja Banquet Bulat & 200 Kursi Futura Cover Hitam Gold',
        category: 'Perlengkapan & Furnitur Acara',
        businessUnitId: buMice.id,
        ownershipStatus: 'PMO_OWNED',
        lenderName: null,
        loanDocNumber: null,
        loanDate: null,
        picPerson: defaultPic,
        brandModel: 'Futura FTR-405 + Round Banquet Table 180cm',
        serialNumber: 'SET-BQT-2025-01',
        condition: 'GOOD',
        acquisitionDate: new Date('2025-01-10'),
        acquisitionCost: 48000000,
        salvageValue: 4800000,
        usefulLifeYears: 4,
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 18000000,
        bookValue: 30000000,
        location: 'Storage Hall Gedung Pertemuan UT',
        status: 'ACTIVE',
        notes: 'Pengadaan mandiri PMO UTama untuk persewaan banquet MICE.',
      },
      {
        assetCode: 'AST/ITS/PMO-001',
        name: 'Rack Server 42U Dell PowerEdge R750 + Storage Array 64TB',
        category: 'Infrastruktur TI & Jaringan',
        businessUnitId: buIts.id,
        ownershipStatus: 'PMO_OWNED',
        lenderName: null,
        loanDocNumber: null,
        loanDate: null,
        picPerson: defaultPic,
        brandModel: 'Dell PowerEdge R750 2x Intel Xeon Gold',
        serialNumber: 'SN-DLL-PE750-PMOIT',
        condition: 'GOOD',
        acquisitionDate: new Date('2025-05-20'),
        acquisitionCost: 145000000,
        salvageValue: 14500000,
        usefulLifeYears: 4,
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 38041666,
        bookValue: 106958334,
        location: 'Ruang Server NOC PMO Lantai 2',
        status: 'ACTIVE',
        notes: 'Milik PMO untuk hosting aplikasi ERP, portal klien, dan cloud data.',
      },
      {
        assetCode: 'AST/TCI/PMO-001',
        name: 'Interactive Smart Board 86 Inch 4K UHD Kelas Training',
        category: 'Peralatan Pelatihan & Workshop',
        businessUnitId: buTci.id,
        ownershipStatus: 'PMO_OWNED',
        lenderName: null,
        loanDocNumber: null,
        loanDate: null,
        picPerson: defaultPic,
        brandModel: 'Maxhub V6 Classic 86 Inch Touchscreen',
        serialNumber: 'SN-MXH-V686-TCI',
        condition: 'GOOD',
        acquisitionDate: new Date('2025-06-15'),
        acquisitionCost: 65000000,
        salvageValue: 6500000,
        usefulLifeYears: 4,
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 15843750,
        bookValue: 49156250,
        location: 'Training Room A Gedung TCI UT',
        status: 'ACTIVE',
        notes: 'Aset penunjang sertifikasi dan inkubator bisnis TCI.',
      },
      {
        assetCode: 'AST/KLN/UT-001',
        name: 'Mesin USG 4D & Alat Elektrokardiogram (EKG) Digital',
        category: 'Peralatan Medis & Kesehatan',
        businessUnitId: buKlinik.id,
        ownershipStatus: 'PBI_UT_LOAN',
        lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
        loanDocNumber: 'BAST-PBI/PMO/KLN/2023/008',
        loanDate: new Date('2023-11-01'),
        picPerson: defaultPic,
        brandModel: 'Mindray DC-40 Ultrasound System + Bionet EKG',
        serialNumber: 'SN-MND-DC40-KLINIK',
        condition: 'GOOD',
        acquisitionDate: new Date('2023-11-01'),
        acquisitionCost: 210000000,
        salvageValue: 21000000,
        usefulLifeYears: 5,
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 107100000,
        bookValue: 102900000,
        location: 'Ruang Poli Spesialis Klinik Pratama UT',
        status: 'ACTIVE',
        notes: 'Aset modal medis pinjaman PBI UT untuk layanan klinik.',
      },
      {
        assetCode: 'AST/OPS/UT-001',
        name: 'Genset Silent Perkins 50 kVA Backup Emergency Power',
        category: 'Mesin & Utilitas Operasional',
        businessUnitId: buPmo.id,
        ownershipStatus: 'PBI_UT_LOAN',
        lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
        loanDocNumber: 'BAST-PBI/PMO/GEN/2023/002',
        loanDate: new Date('2023-08-10'),
        picPerson: defaultPic,
        brandModel: 'Perkins 1103A-33TG1 + Stamford Generator',
        serialNumber: 'SN-PRK-50KVA-PMO',
        condition: 'GOOD',
        acquisitionDate: new Date('2023-08-10'),
        acquisitionCost: 160000000,
        salvageValue: 16000000,
        usefulLifeYears: 8,
        usefulLifeMonths: 96,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 57000000,
        bookValue: 103000000,
        location: 'Rumah Genset Belakang Gedung Utama UT',
        status: 'ACTIVE',
        notes: 'Genset darurat untuk menjamin suplai listrik MICE, Klinik, dan Server IT.',
      },
      {
        assetCode: 'AST/OPS/UT-002',
        name: 'Kendaraan Operasional Toyota All New Avanza 1.5 G CVT',
        category: 'Kendaraan Operasional',
        businessUnitId: buPmo.id,
        ownershipStatus: 'PBI_UT_LOAN',
        lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
        loanDocNumber: 'BAST-PBI/PMO/VH/2024/003',
        loanDate: new Date('2024-01-20'),
        picPerson: defaultPic,
        brandModel: 'Toyota Avanza 1.5 G CVT Hitam Metalik (B 1234 UT)',
        serialNumber: 'MHK-M5FA3-2024-0991',
        condition: 'GOOD',
        acquisitionDate: new Date('2024-01-20'),
        acquisitionCost: 265000000,
        salvageValue: 53000000,
        usefulLifeYears: 5,
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: 109540000,
        bookValue: 155460000,
        location: 'Pool Kendaraan Kantor PMO UTama',
        status: 'ACTIVE',
        notes: 'Mobil dinas operasional pinjaman PBI UT untuk mobilitas tim PMO & tamu MICE.',
      },
    ];

    for (const a of seedAssets) {
      await prisma.fixedAsset.create({ data: a });
    }
  } catch (err) {
    console.error('Failed to seed fixed assets:', err);
  }
}

// 1. GET ASSET SUMMARY (KPIs)
assetRouter.get('/summary', async (req, res, next) => {
  try {
    await ensureAssetSeedData();

    const assets = await prisma.fixedAsset.findMany({
      include: { businessUnit: { select: { id: true, code: true, name: true } } },
    });

    let totalAcquisitionCost = 0;
    let totalPmoOwnedCost = 0;
    let totalPbiLoanCost = 0;
    let totalAccumulatedDepreciation = 0;
    let totalCurrentBookValue = 0;
    let countPmoOwned = 0;
    let countPbiLoan = 0;
    let countRental = 0;

    for (const a of assets) {
      const cost = toNumber(a.acquisitionCost);
      const accum = toNumber(a.accumulatedDepreciation);
      const book = toNumber(a.bookValue);

      totalAcquisitionCost += cost;
      totalAccumulatedDepreciation += accum;
      totalCurrentBookValue += book;

      if (a.ownershipStatus === 'PBI_UT_LOAN') {
        totalPbiLoanCost += cost;
        countPbiLoan += 1;
      } else if (a.ownershipStatus === 'PMO_OWNED') {
        totalPmoOwnedCost += cost;
        countPmoOwned += 1;
      } else {
        countRental += 1;
      }
    }

    res.json({
      success: true,
      data: {
        totalAssets: assets.length,
        totalAcquisitionCost,
        totalPmoOwnedCost,
        totalPbiLoanCost,
        totalAccumulatedDepreciation,
        totalCurrentBookValue,
        countPmoOwned,
        countPbiLoan,
        countRental,
        picCoordinator: 'Wildan Pramono (Staff Pengelola Aset & Logistik)',
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET ASSETS LIST WITH FILTERS
assetRouter.get('/', async (req, res, next) => {
  try {
    await ensureAssetSeedData();

    const { ownershipStatus, businessUnitId, category, search } = req.query;
    const where: Record<string, unknown> = {};

    if (ownershipStatus && typeof ownershipStatus === 'string' && ownershipStatus !== 'ALL') {
      where.ownershipStatus = ownershipStatus;
    }
    if (businessUnitId && typeof businessUnitId === 'string' && businessUnitId !== 'ALL') {
      where.businessUnitId = businessUnitId;
    }
    if (category && typeof category === 'string' && category !== 'ALL') {
      where.category = category;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { assetCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { brandModel: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { picPerson: { contains: q, mode: 'insensitive' } },
        { loanDocNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const records = await prisma.fixedAsset.findMany({
      where,
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { assetCode: 'asc' },
    });

    const formatted = records.map((r) => {
      const cost = toNumber(r.acquisitionCost);
      const salvage = toNumber(r.salvageValue);
      const accum = toNumber(r.accumulatedDepreciation);
      const book = toNumber(r.bookValue);
      const months = r.usefulLifeMonths || r.usefulLifeYears * 12 || 48;
      const monthlyDeprec = months > 0 ? Math.round((cost - salvage) / months) : 0;
      const yearlyDeprec = monthlyDeprec * 12;

      return {
        ...r,
        acquisitionCost: cost,
        salvageValue: salvage,
        accumulatedDepreciation: accum,
        bookValue: book,
        monthlyDepreciation: monthlyDeprec,
        annualDepreciation: yearlyDeprec,
        businessUnitName: r.businessUnit?.name || '-',
        businessUnitCode: r.businessUnit?.code || '-',
      };
    });

    res.json({
      success: true,
      data: formatted,
      meta: { total: formatted.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Schema for creating an asset
const createAssetSchema = z.object({
  assetCode: z.string().optional(),
  name: z.string().min(3, 'Nama aset wajib diisi.'),
  category: z.string().min(2, 'Kategori aset wajib dipilih.'),
  businessUnitId: z.string().min(1, 'Unit bisnis penanggung jawab wajib dipilih.'),
  ownershipStatus: z.enum(['PMO_OWNED', 'PBI_UT_LOAN', 'RENTAL', 'EXTERNAL_LOAN']).default('PMO_OWNED'),
  lenderName: z.string().optional().nullable(),
  loanDocNumber: z.string().optional().nullable(),
  loanDate: z.string().optional().nullable(),
  loanReturnDate: z.string().optional().nullable(),
  picPerson: z.string().default('Wildan Pramono'),
  brandModel: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  condition: z.string().default('GOOD'),
  acquisitionDate: z.string().min(8, 'Tanggal perolehan / peminjaman wajib diisi.'),
  acquisitionCost: z.number().positive('Nilai perolehan harus lebih dari Rp 0.'),
  salvageValue: z.number().default(0),
  usefulLifeYears: z.number().min(1, 'Masa manfaat minimal 1 tahun.').default(4),
  depreciationMethod: z.string().default('STRAIGHT_LINE'),
  location: z.string().min(2, 'Lokasi aset wajib diisi.'),
  notes: z.string().optional().nullable(),
});

// 3. POST CREATE ASSET (Supports data input from Mas Wildan)
assetRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createAssetSchema.parse(req.body);

    const bu = await prisma.businessUnit.findUnique({
      where: { id: parsed.businessUnitId },
      select: { code: true, name: true },
    });

    const prefix = parsed.ownershipStatus === 'PBI_UT_LOAN' ? 'UT' : 'PMO';
    const buCode = bu?.code ? bu.code.replace('BU-', '') : 'OPS';
    const totalCount = await prisma.fixedAsset.count();
    const assetCode =
      parsed.assetCode && parsed.assetCode.trim()
        ? parsed.assetCode.trim()
        : `AST/${buCode}/${prefix}-${String(totalCount + 1).padStart(3, '0')}`;

    const cost = parsed.acquisitionCost;
    const salvage = parsed.salvageValue || 0;
    const usefulLifeMonths = parsed.usefulLifeYears * 12;

    const created = await prisma.fixedAsset.create({
      data: {
        assetCode,
        name: parsed.name,
        category: parsed.category,
        businessUnitId: parsed.businessUnitId,
        ownershipStatus: parsed.ownershipStatus,
        lenderName:
          parsed.ownershipStatus === 'PBI_UT_LOAN'
            ? parsed.lenderName || 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka'
            : parsed.lenderName || null,
        loanDocNumber: parsed.loanDocNumber || null,
        loanDate: parsed.loanDate ? new Date(parsed.loanDate) : null,
        loanReturnDate: parsed.loanReturnDate ? new Date(parsed.loanReturnDate) : null,
        picPerson: parsed.picPerson || 'Wildan Pramono',
        brandModel: parsed.brandModel || null,
        serialNumber: parsed.serialNumber || null,
        condition: parsed.condition || 'GOOD',
        acquisitionDate: new Date(parsed.acquisitionDate),
        acquisitionCost: cost,
        salvageValue: salvage,
        usefulLifeYears: parsed.usefulLifeYears,
        usefulLifeMonths,
        depreciationMethod: parsed.depreciationMethod,
        accumulatedDepreciation: 0,
        bookValue: cost,
        location: parsed.location,
        status: 'ACTIVE',
        notes: parsed.notes || `Data dicatat atas koordinasi Mas Wildan.`,
      },
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
      },
    });

    await recordAuditLog({
      action: 'CREATE',
      module: 'FIXED_ASSETS',
      entityType: 'FixedAsset',
      entityId: created.id,
      entityCode: created.assetCode,
      actorId: req.user?.userId,
      actorName: req.user?.fullName || 'User',
      actorRole: req.user?.roleCode || 'USER',
      summary: `Aset ${created.assetCode} (${created.name} - ${created.ownershipStatus}) berhasil didaftarkan oleh ${req.user?.fullName || 'PIC Aset'}`,
    });

    res.status(201).json({
      success: true,
      data: {
        ...created,
        acquisitionCost: toNumber(created.acquisitionCost),
        bookValue: toNumber(created.bookValue),
      },
      message: `Aset ${created.assetCode} (${created.name}) berhasil disimpan ke database.`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST CALCULATE DEPRECIATION (Simulasi & Update Penyusutan Aset)
assetRouter.post('/depreciate', async (req, res, next) => {
  try {
    const assets = await prisma.fixedAsset.findMany({
      where: { status: 'ACTIVE' },
    });

    let updatedCount = 0;
    const now = new Date();

    for (const a of assets) {
      const cost = toNumber(a.acquisitionCost);
      const salvage = toNumber(a.salvageValue);
      const monthsTotal = a.usefulLifeMonths || a.usefulLifeYears * 12 || 48;
      const acqDate = new Date(a.acquisitionDate);

      // Hitung bulan berjalan sejak perolehan
      const monthsElapsed = Math.max(
        1,
        (now.getFullYear() - acqDate.getFullYear()) * 12 + (now.getMonth() - acqDate.getMonth())
      );

      const effectiveMonths = Math.min(monthsTotal, monthsElapsed);
      const monthlyDeprec = monthsTotal > 0 ? (cost - salvage) / monthsTotal : 0;
      const newAccum = Math.round(monthlyDeprec * effectiveMonths);
      const newBook = Math.max(salvage, cost - newAccum);

      await prisma.fixedAsset.update({
        where: { id: a.id },
        data: {
          accumulatedDepreciation: newAccum,
          bookValue: newBook,
        },
      });

      updatedCount += 1;
    }

    res.json({
      success: true,
      message: `Perhitungan penyusutan berhasil diperbarui untuk ${updatedCount} aset PMO (Milik & Pinjaman PBI UT).`,
      meta: { updatedCount, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Schema for capitalization evaluation
const evaluateSchema = z.object({
  type: z.enum(['NEW_ACQUISITION', 'SUBSEQUENT_EXPENDITURE']),
  category: z.string().optional(),
  amount: z.number().positive('Nominal pengeluaran harus lebih besar dari 0'),
  assetId: z.string().optional(),
  currentBookValue: z.number().optional(),
  additionalMonths: z.number().min(0).optional(),
});

// Schema for asset subsequent expenditure (perbaikan / renovasi)
const createExpenditureSchema = z.object({
  transactionDate: z.string().min(8, 'Tanggal transaksi wajib diisi'),
  description: z.string().min(3, 'Deskripsi pengeluaran wajib diisi'),
  amount: z.number().positive('Nominal pengeluaran harus lebih besar dari 0'),
  additionalMonths: z.number().min(0).default(0),
  vendorName: z.string().optional().nullable(),
  invoiceDocNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// 5. GET CAPITALIZATION RULES & COA MAPPING
assetRouter.get('/capitalization-rules', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: CAPITALIZATION_RULES,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST EVALUATE CAPITALIZATION (Simulasi & Pengujian ISAK 335)
assetRouter.post('/evaluate-capitalization', async (req, res, next) => {
  try {
    const parsed = evaluateSchema.parse(req.body);
    let bookValue = parsed.currentBookValue;
    let category = parsed.category;

    if (parsed.type === 'SUBSEQUENT_EXPENDITURE' && parsed.assetId) {
      const asset = await prisma.fixedAsset.findUnique({
        where: { id: parsed.assetId },
        select: { bookValue: true, category: true, name: true, assetCode: true },
      });
      if (asset) {
        bookValue = toNumber(asset.bookValue);
        category = category || asset.category;
      }
    }

    const evaluation = evaluateCapitalization({
      type: parsed.type,
      category,
      amount: parsed.amount,
      currentBookValue: bookValue,
      additionalMonths: parsed.additionalMonths,
    });

    res.json({
      success: true,
      data: evaluation,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET EXPENDITURES SUMMARY (Rekapitulasi Pengeluaran Aset Tetap)
assetRouter.get('/expenditures/summary', async (req, res, next) => {
  try {
    const expenditures = await prisma.assetExpenditure.findMany({
      include: {
        asset: {
          select: { assetCode: true, name: true, businessUnitId: true },
        },
      },
    });

    const totalExpenditures = expenditures.length;
    let totalAmount = 0;
    let capitalizedCount = 0;
    let capitalizedAmount = 0;
    let expensedCount = 0;
    let expensedAmount = 0;

    for (const exp of expenditures) {
      const amt = toNumber(exp.amount);
      totalAmount += amt;
      if (exp.isCapitalized) {
        capitalizedCount += 1;
        capitalizedAmount += amt;
      } else {
        expensedCount += 1;
        expensedAmount += amt;
      }
    }

    res.json({
      success: true,
      data: {
        totalExpenditures,
        totalAmount,
        capitalizedCount,
        capitalizedAmount,
        expensedCount,
        expensedAmount,
        capitalizationRatioThreshold: CAPITALIZATION_RULES.SUBSEQUENT_EXPENSE_RATIO_PERCENT,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 8. GET ASSET BY ID
assetRouter.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.fixedAsset.findUnique({
      where: { id: req.params.id },
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
        expenditures: {
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Aset tidak ditemukan.');
    }

    const cost = toNumber(asset.acquisitionCost);
    const salvage = toNumber(asset.salvageValue);
    const accum = toNumber(asset.accumulatedDepreciation);
    const book = toNumber(asset.bookValue);
    const months = asset.usefulLifeMonths || asset.usefulLifeYears * 12 || 48;
    const monthlyDeprec = months > 0 ? Math.round((cost - salvage) / months) : 0;

    res.json({
      success: true,
      data: {
        ...asset,
        acquisitionCost: cost,
        salvageValue: salvage,
        accumulatedDepreciation: accum,
        bookValue: book,
        monthlyDepreciation: monthlyDeprec,
        expenditures: asset.expenditures.map((e) => ({
          ...e,
          amount: toNumber(e.amount),
          currentBookValue: toNumber(e.currentBookValue),
          ratioPercent: toNumber(e.ratioPercent),
        })),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 9. POST ASSET EXPENDITURE (Catat Perbaikan / Renovasi dengan Filter Ambang Batas 10%)
assetRouter.post('/:id/expenditures', async (req, res, next) => {
  try {
    const parsed = createExpenditureSchema.parse(req.body);
    const asset = await prisma.fixedAsset.findUnique({
      where: { id: req.params.id },
      include: { businessUnit: { select: { id: true, code: true, name: true } } },
    });

    if (!asset) {
      throw new AppError(404, 'ASSET_NOT_FOUND', 'Aset tidak ditemukan.');
    }

    const currentBookValue = toNumber(asset.bookValue);
    const evaluation = evaluateCapitalization({
      type: 'SUBSEQUENT_EXPENDITURE',
      category: asset.category,
      amount: parsed.amount,
      currentBookValue,
      additionalMonths: parsed.additionalMonths,
    });

    const count = await prisma.assetExpenditure.count();
    const d = new Date(parsed.transactionDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const expenditureNumber = `EXP-AST/${year}/${month}/${String(count + 1).padStart(4, '0')}`;

    const result = await prisma.$transaction(async (tx) => {
      const expenditure = await tx.assetExpenditure.create({
        data: {
          expenditureNumber,
          assetId: asset.id,
          transactionDate: d,
          description: parsed.description,
          amount: parsed.amount,
          currentBookValue,
          ratioPercent: evaluation.ratioPercent,
          isCapitalized: evaluation.isCapitalized,
          accountingTreatment: evaluation.accountingTreatment,
          coaDebit: evaluation.recommendedDebitCoa,
          coaCredit: evaluation.recommendedCreditCoa,
          additionalMonths: parsed.additionalMonths || 0,
          vendorName: parsed.vendorName || null,
          invoiceDocNumber: parsed.invoiceDocNumber || null,
          approvedBy: req.user?.fullName || 'Manager Aset PMO',
          notes: parsed.notes || null,
        },
      });

      let updatedAsset = asset;
      if (evaluation.isCapitalized) {
        const newCost = toNumber(asset.acquisitionCost) + parsed.amount;
        const newBook = currentBookValue + parsed.amount;
        const newMonths = asset.usefulLifeMonths + (parsed.additionalMonths || 0);
        const newYears = Math.round(newMonths / 12) || asset.usefulLifeYears;

        updatedAsset = await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            acquisitionCost: newCost,
            bookValue: newBook,
            usefulLifeMonths: newMonths,
            usefulLifeYears: newYears,
          },
          include: { businessUnit: { select: { id: true, code: true, name: true } } },
        });
      }

      return { expenditure, updatedAsset };
    });

    await recordAuditLog({
      action: evaluation.isCapitalized ? 'CAPITALIZE_ASSET' : 'EXPENSE_MAINTENANCE',
      module: 'FIXED_ASSETS',
      entityType: 'AssetExpenditure',
      entityId: result.expenditure.id,
      entityCode: result.expenditure.expenditureNumber,
      actorId: req.user?.userId,
      actorName: req.user?.fullName || 'User',
      actorRole: req.user?.roleCode || 'USER',
      summary: `Pencatatan pengeluaran ${result.expenditure.expenditureNumber} (${evaluation.accountingTreatment}) Rp ${parsed.amount.toLocaleString('id-ID')} untuk aset ${asset.assetCode}: ${parsed.description}`,
    });

    res.status(201).json({
      success: true,
      data: {
        ...result.expenditure,
        amount: toNumber(result.expenditure.amount),
        currentBookValue: toNumber(result.expenditure.currentBookValue),
        ratioPercent: toNumber(result.expenditure.ratioPercent),
        evaluation,
        updatedAsset: {
          id: result.updatedAsset.id,
          assetCode: result.updatedAsset.assetCode,
          name: result.updatedAsset.name,
          acquisitionCost: toNumber(result.updatedAsset.acquisitionCost),
          bookValue: toNumber(result.updatedAsset.bookValue),
          usefulLifeMonths: result.updatedAsset.usefulLifeMonths,
        },
      },
      message: evaluation.isCapitalized
        ? `Pengeluaran berhasil dikapitalisasi ke Aset Tetap ${asset.assetCode} (Nilai Buku bertambah Rp ${parsed.amount.toLocaleString('id-ID')}).`
        : `Pengeluaran berhasil dicatat sebagai Beban Pemeliharaan (Nilai Buku aset tidak berubah).`,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 10. GET EXPENDITURES FOR ASSET
assetRouter.get('/:id/expenditures', async (req, res, next) => {
  try {
    const expenditures = await prisma.assetExpenditure.findMany({
      where: { assetId: req.params.id },
      orderBy: { transactionDate: 'desc' },
    });

    const formatted = expenditures.map((e) => ({
      ...e,
      amount: toNumber(e.amount),
      currentBookValue: toNumber(e.currentBookValue),
      ratioPercent: toNumber(e.ratioPercent),
    }));

    res.json({
      success: true,
      data: formatted,
      meta: { total: formatted.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
