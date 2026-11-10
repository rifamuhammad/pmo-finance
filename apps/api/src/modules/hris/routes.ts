import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toNumber, toCents, fromCents } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth, requirePermission } from '../../middleware/auth.js';

export const hrisRouter = Router();

hrisRouter.use(requireAuth);

// Standar Biaya Masukan (SBM) 2026 Reference Constants
export const SBM_2026 = {
  MEAL_ALLOWANCE_PER_DAY: 37000, // Uang makan SBM per hari kerja
  OVERTIME_RATE_PER_HOUR: 20000, // Upah lembur SBM per jam
  OVERTIME_MEAL_RATE: 30000, // Uang makan lembur (min. 2 jam)
  BPJS_EMPLOYEE_RATE: 0.04, // 4% (Kesehatan 1% + Ketenagakerjaan JHT/JP 3%)
  COA_BEBAN_GAJI_PUT_PK: '520101030100', // Beban Gaji Tenaga Kependidikan PUT PK
  COA_BEBAN_LEMBUR_NON_PNS: '520101050200', // Beban Lembur Pendukung Kegiatan Operasional - Non PNS
  COA_BEBAN_UANG_MAKAN_NON_PNS: '520101060200', // Beban Uang Makan Tenaga Kependidikan - Non PNS
  COA_UTANG_PPH21: '210201010100', // Utang Pajak PPh Pasal 21
  COA_UTANG_TITIPAN_BPJS: '210301010100', // Beban Akrual / Yang Masih Harus Dibayar (Titipan BPJS)
  COA_BANK_BRI: '110101020200', // Bank BRI Penerimaan Komersial PMO
};

// PPh 21 Tarif Efektif Rata-rata (TER) PMK 168/2023 & PP 58/2023
export function calculatePph21Ter(grossMonthly: number, ptkpCategory: 'TER_A' | 'TER_B' | 'TER_C' = 'TER_A'): { ratePercent: number; pph21Amount: number } {
  let rate = 0;

  if (ptkpCategory === 'TER_A') {
    // PTKP: TK/0 (54jt), TK/1 (58.5jt), K/0 (58.5jt)
    if (grossMonthly <= 5400000) rate = 0;
    else if (grossMonthly <= 5650000) rate = 0.25;
    else if (grossMonthly <= 5950000) rate = 0.50;
    else if (grossMonthly <= 6300000) rate = 0.75;
    else if (grossMonthly <= 6750000) rate = 1.00;
    else if (grossMonthly <= 7500000) rate = 1.25;
    else if (grossMonthly <= 8550000) rate = 1.50;
    else if (grossMonthly <= 9650000) rate = 1.75;
    else if (grossMonthly <= 10050000) rate = 2.00;
    else if (grossMonthly <= 10350000) rate = 2.25;
    else if (grossMonthly <= 10700000) rate = 2.50;
    else if (grossMonthly <= 11050000) rate = 3.00;
    else if (grossMonthly <= 11600000) rate = 3.50;
    else if (grossMonthly <= 12500000) rate = 4.00;
    else if (grossMonthly <= 13750000) rate = 5.00;
    else if (grossMonthly <= 15100000) rate = 6.00;
    else if (grossMonthly <= 16950000) rate = 7.00;
    else if (grossMonthly <= 19750000) rate = 8.00;
    else if (grossMonthly <= 24100000) rate = 9.00;
    else rate = 10.00;
  } else if (ptkpCategory === 'TER_B') {
    // PTKP: TK/2, TK/3, K/1, K/2
    if (grossMonthly <= 6200000) rate = 0;
    else if (grossMonthly <= 6500000) rate = 0.25;
    else if (grossMonthly <= 6850000) rate = 0.50;
    else if (grossMonthly <= 7300000) rate = 0.75;
    else if (grossMonthly <= 9200000) rate = 1.50;
    else if (grossMonthly <= 10750000) rate = 2.50;
    else if (grossMonthly <= 12600000) rate = 4.00;
    else if (grossMonthly <= 15200000) rate = 6.00;
    else if (grossMonthly <= 18500000) rate = 8.00;
    else rate = 10.00;
  } else {
    // TER_C: K/3
    if (grossMonthly <= 6600000) rate = 0;
    else if (grossMonthly <= 6950000) rate = 0.25;
    else if (grossMonthly <= 7350000) rate = 0.50;
    else if (grossMonthly <= 9550000) rate = 1.50;
    else if (grossMonthly <= 13050000) rate = 4.00;
    else rate = 7.00;
  }

  const pph21Amount = Math.round(grossMonthly * (rate / 100));
  return { ratePercent: rate, pph21Amount };
}

export interface PayrollSbmCalculation {
  baseSalary: number;
  positionAllowance: number;
  transportAllowance: number;
  workDays: number;
  mealAllowance: number;
  overtimeHours: number;
  overtimeAmount: number;
  allowanceTotal: number;
  grossSalary: number;
  deductionBpjs: number;
  pph21RatePercent: number;
  deductionPph21: number;
  netSalary: number;
}

export function computeEmployeePayrollSbm(
  baseSalary: number,
  positionAllowance: number,
  transportAllowance: number,
  workDays = 22,
  overtimeHours = 0,
  ptkpCategory: 'TER_A' | 'TER_B' | 'TER_C' = 'TER_A'
): PayrollSbmCalculation {
  const mealAllowance = workDays * SBM_2026.MEAL_ALLOWANCE_PER_DAY;
  const overtimeAmount = overtimeHours * SBM_2026.OVERTIME_RATE_PER_HOUR;
  const allowanceTotal = positionAllowance + transportAllowance + mealAllowance + overtimeAmount;
  const grossSalary = baseSalary + allowanceTotal;

  // BPJS 4% dari Gaji Pokok + Tunjangan Tetap
  const deductionBpjs = Math.round((baseSalary + positionAllowance) * SBM_2026.BPJS_EMPLOYEE_RATE);

  // PPh 21 TER
  const { ratePercent, pph21Amount } = calculatePph21Ter(grossSalary, ptkpCategory);

  const netSalary = grossSalary - deductionBpjs - pph21Amount;

  return {
    baseSalary,
    positionAllowance,
    transportAllowance,
    workDays,
    mealAllowance,
    overtimeHours,
    overtimeAmount,
    allowanceTotal,
    grossSalary,
    deductionBpjs,
    pph21RatePercent: ratePercent,
    deductionPph21: pph21Amount,
    netSalary,
  };
}

// Helper to seed realistic PMO HRIS & Payroll data
async function ensureHrisSeedData() {
  try {
    const count = await prisma.employee.count();
    if (count > 0) return;

    const units = await prisma.businessUnit.findMany({
      select: { id: true, code: true, name: true },
    });
    const buMice = units.find((u) => u.code === 'BU-MICE') || units[0];
    const buTci = units.find((u) => u.code === 'BU-TCI') || units[0];
    const buIts = units.find((u) => u.code === 'BU-ITS') || units[0];
    const buKlinik = units.find((u) => u.code === 'BU-KLINIK') || units[0];
    const buPmo = units.find((u) => u.code === 'PMO-MGMT') || units.find((u) => u.code === 'BU-PUSAT') || units.find((u) => u.code === 'BU-CORP') || units[0];

    const employees = [
      {
        nip: 'PMO-2024-001',
        nik: '3174091204890001',
        fullName: 'Wildan Pramono, S.T.',
        email: 'wildan.pramono@pmoutama.id',
        phone: '0812-9876-5432',
        businessUnitId: buPmo.id,
        department: 'Operasional & Kantor Pusat PMO',
        position: 'Koordinator Aset, Logistik & Inventaris',
        employmentStatus: 'PERMANENT',
        joinDate: new Date('2024-01-02'),
        baseSalary: 8500000,
        positionAllowance: 2000000,
        transportAllowance: 1000000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-1122334-5',
        bankAccountHolder: 'Wildan Pramono',
        npwp: '81.234.567.8-011.000',
        bpjsKesehatanNo: '0001234567891',
        bpjsKetenagakerjaanNo: '240199887766',
        status: 'ACTIVE',
      },
      {
        nip: 'PMO-2024-002',
        nik: '3275082103920002',
        fullName: 'Siti Rahmawati, SE, Ak',
        email: 'siti.rahmawati@pmoutama.id',
        phone: '0813-1122-3344',
        businessUnitId: buPmo.id,
        department: 'Keuangan & Akuntansi Pusat',
        position: 'Finance & Accounting Manager',
        employmentStatus: 'PERMANENT',
        joinDate: new Date('2024-01-15'),
        baseSalary: 12000000,
        positionAllowance: 3500000,
        transportAllowance: 1500000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-5566778-9',
        bankAccountHolder: 'Siti Rahmawati',
        npwp: '72.345.678.9-022.000',
        bpjsKesehatanNo: '0001234567892',
        bpjsKetenagakerjaanNo: '240199887767',
        status: 'ACTIVE',
      },
      {
        nip: 'PMO-2024-003',
        nik: '3173051408930003',
        fullName: 'Meda Ary Thiofanny, S.Ak.',
        email: 'meda.ary@pmoutama.id',
        phone: '0821-2233-4455',
        businessUnitId: buTci.id,
        department: 'Divisi TCI (Training & Certification)',
        position: 'Staff Keuangan & Administrasi Program',
        employmentStatus: 'PERMANENT',
        joinDate: new Date('2024-03-01'),
        baseSalary: 6500000,
        positionAllowance: 1000000,
        transportAllowance: 800000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-9988776-1',
        bankAccountHolder: 'Meda Ary Thiofanny',
        npwp: '91.456.789.0-033.000',
        bpjsKesehatanNo: '0001234567893',
        bpjsKetenagakerjaanNo: '240199887768',
        status: 'ACTIVE',
      },
      {
        nip: 'PMO-2024-004',
        nik: '3201021706910004',
        fullName: 'Arya Dimas Prasetya, S.Kom.',
        email: 'arya.dimas@pmoutama.id',
        phone: '0857-3344-5566',
        businessUnitId: buIts.id,
        department: 'Divisi IT Solution & Konsultan',
        position: 'Lead Solution Architect & DevOps',
        employmentStatus: 'PERMANENT',
        joinDate: new Date('2024-02-01'),
        baseSalary: 11000000,
        positionAllowance: 2500000,
        transportAllowance: 1200000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-4455667-2',
        bankAccountHolder: 'Arya Dimas Prasetya',
        npwp: '65.123.456.7-044.000',
        bpjsKesehatanNo: '0001234567894',
        bpjsKetenagakerjaanNo: '240199887769',
        status: 'ACTIVE',
      },
      {
        nip: 'PMO-2024-005',
        nik: '3171092509940005',
        fullName: 'Nadia Putri Amanda, S.Par.',
        email: 'nadia.putri@pmoutama.id',
        phone: '0878-9900-1122',
        businessUnitId: buMice.id,
        department: 'Divisi MICE (Meeting, Incentive, Convention, Exhibition)',
        position: 'Event & Banquet Operations Supervisor',
        employmentStatus: 'PERMANENT',
        joinDate: new Date('2024-04-10'),
        baseSalary: 7500000,
        positionAllowance: 1500000,
        transportAllowance: 1000000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-8877665-3',
        bankAccountHolder: 'Nadia Putri Amanda',
        npwp: '84.567.890.1-055.000',
        bpjsKesehatanNo: '0001234567895',
        bpjsKetenagakerjaanNo: '240199887770',
        status: 'ACTIVE',
      },
      {
        nip: 'PMO-2024-006',
        nik: '3276031201900006',
        fullName: 'dr. Farhan Hidayat, Sp.OK',
        email: 'dr.farhan@pmoutama.id',
        phone: '0811-2233-7788',
        businessUnitId: buKlinik.id,
        department: 'Divisi Klinik Pratama & MCU',
        position: 'Dokter Penanggung Jawab Medis',
        employmentStatus: 'CONTRACT',
        joinDate: new Date('2024-05-01'),
        baseSalary: 14000000,
        positionAllowance: 3000000,
        transportAllowance: 1500000,
        bankName: 'Bank Mandiri',
        bankAccountNo: '123-00-2233445-8',
        bankAccountHolder: 'Farhan Hidayat',
        npwp: '93.678.901.2-066.000',
        bpjsKesehatanNo: '0001234567896',
        bpjsKetenagakerjaanNo: '240199887771',
        status: 'ACTIVE',
      },
    ];

    for (const emp of employees) {
      const createdEmp = await prisma.employee.create({ data: emp });

      // Create attendance sample for current month
      const today = new Date();
      for (let day = 1; day <= 5; day++) {
        const attDate = new Date(today.getFullYear(), today.getMonth(), day);
        await prisma.attendance.create({
          data: {
            employeeId: createdEmp.id,
            date: attDate,
            checkIn: new Date(attDate.setHours(7, 55, 0)),
            checkOut: new Date(attDate.setHours(17, 5, 0)),
            status: 'PRESENT',
            notes: 'Hadir tepat waktu di kantor PMO UTama',
            verifiedBy: 'HRD PMO UTama',
          },
        });
      }

      // Create previous month salary slip sample
      const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth();
      const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
      const base = toNumber(createdEmp.baseSalary);
      const allow = toNumber(createdEmp.positionAllowance) + toNumber(createdEmp.transportAllowance);
      const bpjs = Math.round((base + allow) * 0.04);
      const pph = Math.round((base + allow) * 0.05);
      const gross = base + allow;
      const net = gross - bpjs - pph;

      await prisma.salarySlip.create({
        data: {
          slipNumber: `PAY/PMO/${prevYear}/${String(prevMonth).padStart(2, '0')}/${createdEmp.nip.slice(-3)}`,
          employeeId: createdEmp.id,
          periodMonth: prevMonth,
          periodYear: prevYear,
          baseSalary: base,
          allowanceTotal: allow,
          overtimeAmount: 0,
          deductionAbsence: 0,
          deductionBpjs: bpjs,
          deductionPph21: pph,
          grossSalary: gross,
          netSalary: net,
          status: 'PAID',
          paymentDate: new Date(`${prevYear}-${String(prevMonth).padStart(2, '0')}-25`),
          paymentMethod: 'TRANSFER_BANK',
          journalNumber: `JRN-PAY/${prevYear}/${String(prevMonth).padStart(2, '0')}/${createdEmp.nip.slice(-3)}`,
          notes: `Gaji bulan ${prevMonth}/${prevYear} ditransfer ke ${createdEmp.bankName} a.n ${createdEmp.bankAccountHolder}`,
        },
      });
    }
  } catch (err) {
    console.error('Failed to seed HRIS data:', err);
  }
}

// 1. GET EMPLOYEES LIST
hrisRouter.get('/employees', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const { department, status, search } = req.query;
    const where: Record<string, unknown> = {};

    if (department && typeof department === 'string' && department !== 'ALL') {
      where.department = { contains: department, mode: 'insensitive' };
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { nip: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { position: { contains: q, mode: 'insensitive' } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        businessUnit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { nip: 'asc' },
    });

    const formatted = employees.map((e) => ({
      ...e,
      baseSalary: toNumber(e.baseSalary),
      positionAllowance: toNumber(e.positionAllowance),
      transportAllowance: toNumber(e.transportAllowance),
      totalAllowance: toNumber(e.positionAllowance) + toNumber(e.transportAllowance),
      totalTakeHomePayEstimasi:
        toNumber(e.baseSalary) + toNumber(e.positionAllowance) + toNumber(e.transportAllowance),
      businessUnitName: e.businessUnit?.name || e.department,
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

// 2. GET ATTENDANCE RECAP
hrisRouter.get('/attendance', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const records = await prisma.attendance.findMany({
      include: {
        employee: {
          select: { id: true, nip: true, fullName: true, department: true, position: true },
        },
      },
      orderBy: { date: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: records,
      meta: { total: records.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET PAYROLL SLIPS
hrisRouter.get('/payroll', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const slips = await prisma.salarySlip.findMany({
      include: {
        employee: {
          select: {
            id: true,
            nip: true,
            fullName: true,
            department: true,
            position: true,
            bankName: true,
            bankAccountNo: true,
            bankAccountHolder: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = slips.map((s) => ({
      ...s,
      baseSalary: toNumber(s.baseSalary),
      allowanceTotal: toNumber(s.allowanceTotal),
      overtimeAmount: toNumber(s.overtimeAmount),
      deductionAbsence: toNumber(s.deductionAbsence),
      deductionBpjs: toNumber(s.deductionBpjs),
      deductionPph21: toNumber(s.deductionPph21),
      grossSalary: toNumber(s.grossSalary),
      netSalary: toNumber(s.netSalary),
      employeeName: s.employee.fullName,
      employeeNip: s.employee.nip,
      department: s.employee.department,
      position: s.employee.position,
      bankInfo: `${s.employee.bankName} - ${s.employee.bankAccountNo} (a.n ${s.employee.bankAccountHolder})`,
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

// 4. GET SBM 2026 SUMMARY & RECAP
hrisRouter.get('/payroll/summary-sbm', async (req, res, next) => {
  try {
    await ensureHrisSeedData();
    const activeEmployees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });

    let totalBaseSalary = 0;
    let totalPositionAllowance = 0;
    let totalTransportAllowance = 0;
    let totalMealAllowance = 0;
    let totalGross = 0;
    let totalPph21 = 0;
    let totalBpjs = 0;
    let totalNetTakeHome = 0;

    for (const emp of activeEmployees) {
      const calc = computeEmployeePayrollSbm(
        toNumber(emp.baseSalary),
        toNumber(emp.positionAllowance),
        toNumber(emp.transportAllowance),
        22,
        0,
        'TER_A'
      );
      totalBaseSalary += calc.baseSalary;
      totalPositionAllowance += calc.positionAllowance;
      totalTransportAllowance += calc.transportAllowance;
      totalMealAllowance += calc.mealAllowance;
      totalGross += calc.grossSalary;
      totalPph21 += calc.deductionPph21;
      totalBpjs += calc.deductionBpjs;
      totalNetTakeHome += calc.netSalary;
    }

    res.json({
      success: true,
      data: {
        activeEmployeesCount: activeEmployees.length,
        sbmStandards: SBM_2026,
        summary: {
          totalBaseSalary,
          totalPositionAllowance,
          totalTransportAllowance,
          totalMealAllowance,
          totalGross,
          totalPph21,
          totalBpjs,
          totalNetTakeHome,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 5. CALCULATE SIMULATION PAYROLL SBM & PPH 21 TER
const calculatePayrollSchema = z.object({
  employeeId: z.string().min(1),
  workDays: z.number().int().min(0).max(31).default(22),
  overtimeHours: z.number().min(0).max(100).default(0),
  ptkpCategory: z.enum(['TER_A', 'TER_B', 'TER_C']).default('TER_A'),
});

hrisRouter.post('/payroll/calculate', async (req, res, next) => {
  try {
    const parsed = calculatePayrollSchema.parse(req.body);
    const emp = await prisma.employee.findUnique({
      where: { id: parsed.employeeId },
      include: { businessUnit: true },
    });
    if (!emp) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Pegawai tidak ditemukan.');

    const calc = computeEmployeePayrollSbm(
      toNumber(emp.baseSalary),
      toNumber(emp.positionAllowance),
      toNumber(emp.transportAllowance),
      parsed.workDays,
      parsed.overtimeHours,
      parsed.ptkpCategory
    );

    res.json({
      success: true,
      data: {
        employee: {
          id: emp.id,
          nip: emp.nip,
          fullName: emp.fullName,
          position: emp.position,
          department: emp.department,
          employmentStatus: emp.employmentStatus,
          bankName: emp.bankName,
          bankAccountNo: emp.bankAccountNo,
          bankAccountHolder: emp.bankAccountHolder,
        },
        calculation: calc,
        accountingMapping: {
          bebanGajiCoa: SBM_2026.COA_BEBAN_GAJI_PUT_PK,
          bebanLemburCoa: SBM_2026.COA_BEBAN_LEMBUR_NON_PNS,
          bebanUangMakanCoa: SBM_2026.COA_BEBAN_UANG_MAKAN_NON_PNS,
          utangPph21Coa: SBM_2026.COA_UTANG_PPH21,
          utangBpjsCoa: SBM_2026.COA_UTANG_TITIPAN_BPJS,
          bankBriCoa: SBM_2026.COA_BANK_BRI,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 6. GENERATE BATCH SLIP GAJI SBM 2026
const generatePayrollSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2025).max(2030),
  employeeIds: z.array(z.string()).optional(),
  workDays: z.number().int().min(1).max(31).default(22),
  ptkpCategory: z.enum(['TER_A', 'TER_B', 'TER_C']).default('TER_A'),
});

hrisRouter.post('/payroll/generate', async (req, res, next) => {
  try {
    const parsed = generatePayrollSchema.parse(req.body);
    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (parsed.employeeIds && parsed.employeeIds.length > 0) {
      where.id = { in: parsed.employeeIds };
    }

    const activeEmployees = await prisma.employee.findMany({ where });
    if (activeEmployees.length === 0) {
      throw new AppError(400, 'NO_ACTIVE_EMPLOYEES', 'Tidak ditemukan pegawai aktif untuk diproses slip gajinya.');
    }

    const createdSlips = [];
    for (const emp of activeEmployees) {
      const calc = computeEmployeePayrollSbm(
        toNumber(emp.baseSalary),
        toNumber(emp.positionAllowance),
        toNumber(emp.transportAllowance),
        parsed.workDays,
        0,
        parsed.ptkpCategory
      );

      const slipNumber = `PAY/PMO/${parsed.periodYear}/${String(parsed.periodMonth).padStart(2, '0')}/${emp.nip.slice(-3)}`;

      const slip = await prisma.salarySlip.upsert({
        where: { slipNumber },
        update: {
          baseSalary: calc.baseSalary,
          allowanceTotal: calc.allowanceTotal,
          overtimeAmount: calc.overtimeAmount,
          deductionBpjs: calc.deductionBpjs,
          deductionPph21: calc.deductionPph21,
          grossSalary: calc.grossSalary,
          netSalary: calc.netSalary,
          status: 'APPROVED',
          paymentDate: new Date(`${parsed.periodYear}-${String(parsed.periodMonth).padStart(2, '0')}-25`),
          notes: `Payroll SBM 2026 & PPh 21 TER (${calc.pph21RatePercent}%) ditransfer ke ${emp.bankName} a.n ${emp.bankAccountHolder || emp.fullName}`,
        },
        create: {
          slipNumber,
          employeeId: emp.id,
          periodMonth: parsed.periodMonth,
          periodYear: parsed.periodYear,
          baseSalary: calc.baseSalary,
          allowanceTotal: calc.allowanceTotal,
          overtimeAmount: calc.overtimeAmount,
          deductionAbsence: 0,
          deductionBpjs: calc.deductionBpjs,
          deductionPph21: calc.deductionPph21,
          grossSalary: calc.grossSalary,
          netSalary: calc.netSalary,
          status: 'APPROVED',
          paymentDate: new Date(`${parsed.periodYear}-${String(parsed.periodMonth).padStart(2, '0')}-25`),
          paymentMethod: 'TRANSFER_BANK',
          notes: `Payroll SBM 2026 & PPh 21 TER (${calc.pph21RatePercent}%) ditransfer ke ${emp.bankName} a.n ${emp.bankAccountHolder || emp.fullName}`,
        },
      });

      createdSlips.push(slip);
    }

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'PAYROLL_GENERATED',
      module: 'HRIS',
      entityType: 'SalarySlipBatch',
      entityId: `BATCH-${parsed.periodYear}-${parsed.periodMonth}`,
      entityCode: `PAY/PMO/${parsed.periodYear}/${String(parsed.periodMonth).padStart(2, '0')}`,
      summary: `Menerbitkan ${createdSlips.length} slip gaji PUT PK periode ${parsed.periodMonth}/${parsed.periodYear} berbasis SBM 2026 & PPh 21 TER`,
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: {
        periodMonth: parsed.periodMonth,
        periodYear: parsed.periodYear,
        totalGenerated: createdSlips.length,
        slips: createdSlips,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
