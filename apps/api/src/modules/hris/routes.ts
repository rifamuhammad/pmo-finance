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

// Helper to calculate contract expiry status
export function computeContractAlert(endDate: Date): { daysRemaining: number; alertStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' } {
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  let alertStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' = 'ACTIVE';
  if (daysRemaining < 0) {
    alertStatus = 'EXPIRED';
  } else if (daysRemaining <= 30) {
    alertStatus = 'EXPIRING_SOON';
  }
  return { daysRemaining, alertStatus };
}

// Helper to seed realistic PMO HRIS & Payroll data
async function ensureHrisSeedData() {
  try {
    const count = await prisma.employee.count();
    if (count === 0) {
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
        await prisma.employee.create({ data: emp });
      }
    }

    // Ensure all employees are properly linked to their respective businessUnitId
    const units = await prisma.businessUnit.findMany({
      select: { id: true, code: true, name: true },
    });
    const buMice = units.find((u) => u.code === 'BU-MICE') || units[0];
    const buTci = units.find((u) => u.code === 'BU-TCI') || units[0];
    const buIts = units.find((u) => u.code === 'BU-ITS') || units[0];
    const buKlinik = units.find((u) => u.code === 'BU-KLINIK') || units[0];
    const buPmo = units.find((u) => u.code === 'PMO-MGMT') || units.find((u) => u.code === 'BU-PUSAT') || units[0];

    const allEmpsForBu = await prisma.employee.findMany();
    for (const emp of allEmpsForBu) {
      if (!emp.businessUnitId && units.length > 0) {
        let buId = buPmo.id;
        if (emp.nip === 'PMO-2024-003' || emp.department.includes('TCI')) buId = buTci.id;
        else if (emp.nip === 'PMO-2024-004' || emp.department.includes('IT')) buId = buIts.id;
        else if (emp.nip === 'PMO-2024-005' || emp.department.includes('MICE')) buId = buMice.id;
        else if (emp.nip === 'PMO-2024-006' || emp.department.includes('Klinik')) buId = buKlinik.id;

        await prisma.employee.update({
          where: { id: emp.id },
          data: { businessUnitId: buId },
        });
      }
    }

    // Ensure realistic contracts exist for each employee
    const contractCount = await prisma.employeeContract.count();
    if (contractCount === 0) {
      const allEmps = await prisma.employee.findMany();
      for (const emp of allEmps) {
        let contractNum = `SK/PMO/PUT-PK/2026/${emp.nip.slice(-3)}`;
        let startDate = new Date('2026-01-01');
        let endDate = new Date('2026-12-31');
        let cStatus = 'ACTIVE';

        // Add previous contracts for seniority on PMO-2024-001
        if (emp.nip === 'PMO-2024-001') {
          await prisma.employeeContract.create({
            data: {
              employeeId: emp.id,
              contractNumber: 'SK/PMO/PUT-PK/2024/001',
              contractType: 'PUT_PK',
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-12-31'),
              salaryRate: 8500000,
              status: 'RENEWED',
              notes: 'Kontrak Awal Pengangkatan Pegawai PUT PK - Pertor 310',
              signedDate: new Date('2024-01-02'),
            },
          });
          await prisma.employeeContract.create({
            data: {
              employeeId: emp.id,
              contractNumber: 'SK/PMO/PUT-PK/2025/001',
              contractType: 'PUT_PK',
              startDate: new Date('2025-01-01'),
              endDate: new Date('2025-12-31'),
              salaryRate: 8500000,
              status: 'RENEWED',
              notes: 'Perpanjangan Masa Kerja Tahap 1 PUT PK',
              signedDate: new Date('2024-12-28'),
            },
          });
        }

        // Active contract configuration for 2026
        if (emp.nip === 'PMO-2024-002') {
          endDate = new Date('2027-12-31');
        } else if (emp.nip === 'PMO-2024-006') {
          contractNum = `SK/PMO/KONSULTAN/2026/${emp.nip.slice(-3)}`;
        }

        await prisma.employeeContract.create({
          data: {
            employeeId: emp.id,
            contractNumber: contractNum,
            contractType: emp.nip === 'PMO-2024-006' ? 'KONSULTAN_AHLI' : 'PUT_PK',
            startDate,
            endDate,
            salaryRate: emp.baseSalary,
            status: cStatus,
            notes: `Surat Keputusan Direktur PMO UTama tentang Penugasan Pegawai ${emp.fullName}`,
            signedDate: startDate,
          },
        });
      }
    }

    // Ensure December 2026 attendance exists for unit recap testing
    const dec2026Attendance = await prisma.attendance.count({
      where: {
        date: {
          gte: new Date('2026-12-01'),
          lte: new Date('2026-12-31'),
        },
      },
    });

    if (dec2026Attendance === 0) {
      const allEmps = await prisma.employee.findMany();
      for (const emp of allEmps) {
        // Create 20 days of attendance for Dec 2026 (Dec 1 - Dec 20, 2026)
        for (let day = 1; day <= 20; day++) {
          const attDate = new Date(Date.UTC(2026, 11, day));
          let status = 'PRESENT';
          let otHours = 0;
          let notes = 'Hadir operasional unit kerja PMO UTama';

          if (day === 8 && emp.nip === 'PMO-2024-003') {
            status = 'SICK';
            notes = 'Surat Keterangan Dokter Klinik Pratama UTama';
          } else if (day === 15 && emp.nip === 'PMO-2024-005') {
            status = 'LEAVE';
            notes = 'Cuti Tahunan Disetujui Manager';
          } else if (day % 4 === 0) {
            otHours = emp.nip === 'PMO-2024-004' ? 3 : 2;
            notes = `Lembur operasional event / sprint (${otHours} jam)`;
          }

          const checkIn = status === 'PRESENT' ? new Date(Date.UTC(2026, 11, day, 1, 0, 0)) : null; // 08:00 WIB
          const checkOut = status === 'PRESENT' ? new Date(Date.UTC(2026, 11, day, 10 + otHours, 0, 0)) : null;

          await prisma.attendance.create({
            data: {
              employeeId: emp.id,
              date: attDate,
              checkIn,
              checkOut,
              status,
              overtimeHours: otHours,
              notes,
              verifiedBy: 'Koordinator Presensi Unit',
            },
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to seed HRIS data:', err);
  }
}

// 1. GET EMPLOYEES LIST
hrisRouter.get('/employees', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const { department, status, search, businessUnitId } = req.query;
    const where: Record<string, unknown> = {};

    if (department && typeof department === 'string' && department !== 'ALL') {
      where.department = { contains: department, mode: 'insensitive' };
    }
    if (businessUnitId && typeof businessUnitId === 'string' && businessUnitId !== 'ALL') {
      where.businessUnitId = businessUnitId;
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
        contracts: { orderBy: { startDate: 'desc' } },
      },
      orderBy: { nip: 'asc' },
    });

    const formatted = employees.map((e) => {
      const formattedContracts = e.contracts.map((c) => {
        const { daysRemaining, alertStatus } = computeContractAlert(c.endDate);
        return {
          ...c,
          salaryRate: toNumber(c.salaryRate),
          daysRemaining,
          alertStatus: c.status === 'RENEWED' || c.status === 'TERMINATED' ? c.status : alertStatus,
        };
      });

      const activeContract = formattedContracts.find((c) => c.status !== 'RENEWED' && c.status !== 'TERMINATED') || formattedContracts[0] || null;

      return {
        ...e,
        baseSalary: toNumber(e.baseSalary),
        positionAllowance: toNumber(e.positionAllowance),
        transportAllowance: toNumber(e.transportAllowance),
        totalAllowance: toNumber(e.positionAllowance) + toNumber(e.transportAllowance),
        totalTakeHomePayEstimasi:
          toNumber(e.baseSalary) + toNumber(e.positionAllowance) + toNumber(e.transportAllowance),
        businessUnitName: e.businessUnit?.name || e.department,
        contracts: formattedContracts,
        activeContract,
        contractStatus: activeContract ? activeContract.alertStatus : (e.employmentStatus === 'PERMANENT' ? 'PERMANENT' : 'NO_CONTRACT'),
        daysUntilContractEnd: activeContract ? activeContract.daysRemaining : null,
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

// 1.1 POST CREATE EMPLOYEE
hrisRouter.post('/employees', async (req, res, next) => {
  try {
    const CreateEmployeeSchema = z.object({
      nip: z.string().min(3),
      nik: z.string().min(16),
      fullName: z.string().min(2),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      businessUnitId: z.string().optional(),
      department: z.string().min(2),
      position: z.string().min(2),
      employmentStatus: z.enum(['PERMANENT', 'CONTRACT', 'INTERN', 'PART_TIME']).default('CONTRACT'),
      joinDate: z.string(),
      baseSalary: z.number().nonnegative(),
      positionAllowance: z.number().nonnegative().default(0),
      transportAllowance: z.number().nonnegative().default(0),
      bankName: z.string().default('Bank Mandiri'),
      bankAccountNo: z.string().optional(),
      bankAccountHolder: z.string().optional(),
      npwp: z.string().optional(),
      bpjsKesehatanNo: z.string().optional(),
      bpjsKetenagakerjaanNo: z.string().optional(),
      status: z.enum(['ACTIVE', 'ON_LEAVE', 'RESIGNED']).default('ACTIVE'),
      initialContract: z.object({
        contractNumber: z.string().min(3),
        contractType: z.string().default('PUT_PK'),
        startDate: z.string(),
        endDate: z.string(),
        salaryRate: z.number().optional(),
        notes: z.string().optional(),
      }).optional(),
    });

    const parsed = CreateEmployeeSchema.parse(req.body);

    const existingNip = await prisma.employee.findUnique({ where: { nip: parsed.nip } });
    if (existingNip) {
      throw new AppError(400, 'DUPLICATE_NIP', `Pegawai dengan NIP ${parsed.nip} sudah terdaftar.`);
    }

    const employee = await prisma.employee.create({
      data: {
        nip: parsed.nip,
        nik: parsed.nik,
        fullName: parsed.fullName,
        email: parsed.email || null,
        phone: parsed.phone || null,
        businessUnitId: parsed.businessUnitId || null,
        department: parsed.department,
        position: parsed.position,
        employmentStatus: parsed.employmentStatus,
        joinDate: new Date(parsed.joinDate),
        baseSalary: parsed.baseSalary,
        positionAllowance: parsed.positionAllowance,
        transportAllowance: parsed.transportAllowance,
        bankName: parsed.bankName,
        bankAccountNo: parsed.bankAccountNo || null,
        bankAccountHolder: parsed.bankAccountHolder || null,
        npwp: parsed.npwp || null,
        bpjsKesehatanNo: parsed.bpjsKesehatanNo || null,
        bpjsKetenagakerjaanNo: parsed.bpjsKetenagakerjaanNo || null,
        status: parsed.status,
      },
    });

    let createdContract = null;
    if (parsed.initialContract) {
      createdContract = await prisma.employeeContract.create({
        data: {
          employeeId: employee.id,
          contractNumber: parsed.initialContract.contractNumber,
          contractType: parsed.initialContract.contractType,
          startDate: new Date(parsed.initialContract.startDate),
          endDate: new Date(parsed.initialContract.endDate),
          salaryRate: parsed.initialContract.salaryRate || parsed.baseSalary,
          status: 'ACTIVE',
          notes: parsed.initialContract.notes || 'Kontrak Awal Pengangkatan Pegawai',
          signedDate: new Date(parsed.initialContract.startDate),
        },
      });
    }

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'EMPLOYEE_CREATED',
      module: 'HRIS',
      entityType: 'Employee',
      entityId: employee.id,
      entityCode: employee.nip,
      summary: `Mendaftarkan pegawai baru ${employee.fullName} (${employee.nip}) di ${employee.department}`,
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: { ...employee, contract: createdContract },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 1.2 PUT UPDATE EMPLOYEE
hrisRouter.put('/employees/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Data pegawai tidak ditemukan.');

    const UpdateEmployeeSchema = z.object({
      fullName: z.string().min(2).optional(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      businessUnitId: z.string().optional().nullable(),
      department: z.string().min(2).optional(),
      position: z.string().min(2).optional(),
      employmentStatus: z.enum(['PERMANENT', 'CONTRACT', 'INTERN', 'PART_TIME']).optional(),
      baseSalary: z.number().nonnegative().optional(),
      positionAllowance: z.number().nonnegative().optional(),
      transportAllowance: z.number().nonnegative().optional(),
      bankName: z.string().optional(),
      bankAccountNo: z.string().optional().nullable(),
      bankAccountHolder: z.string().optional().nullable(),
      npwp: z.string().optional().nullable(),
      bpjsKesehatanNo: z.string().optional().nullable(),
      bpjsKetenagakerjaanNo: z.string().optional().nullable(),
      status: z.enum(['ACTIVE', 'ON_LEAVE', 'RESIGNED']).optional(),
    });

    const parsed = UpdateEmployeeSchema.parse(req.body);

    const updated = await prisma.employee.update({
      where: { id },
      data: parsed,
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'EMPLOYEE_UPDATED',
      module: 'HRIS',
      entityType: 'Employee',
      entityId: updated.id,
      entityCode: updated.nip,
      summary: `Memperbarui data profil pegawai ${updated.fullName} (${updated.nip})`,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      data: updated,
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 1.3 GET CONTRACTS LIST
hrisRouter.get('/contracts', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const { status, employeeId, businessUnitId } = req.query;
    const where: Record<string, unknown> = {};

    if (employeeId && typeof employeeId === 'string') {
      where.employeeId = employeeId;
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (businessUnitId && typeof businessUnitId === 'string' && businessUnitId !== 'ALL') {
      where.employee = { businessUnitId };
    }

    const contracts = await prisma.employeeContract.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            nip: true,
            fullName: true,
            department: true,
            position: true,
            businessUnitId: true,
            businessUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    const formatted = contracts.map((c) => {
      const { daysRemaining, alertStatus } = computeContractAlert(c.endDate);
      return {
        ...c,
        salaryRate: toNumber(c.salaryRate),
        daysRemaining,
        effectiveStatus: c.status === 'RENEWED' || c.status === 'TERMINATED' ? c.status : alertStatus,
        businessUnitName: c.employee.businessUnit?.name || c.employee.department,
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

// 1.4 POST CREATE / RENEW CONTRACT
hrisRouter.post('/contracts', async (req, res, next) => {
  try {
    const CreateContractSchema = z.object({
      employeeId: z.string().uuid(),
      contractNumber: z.string().min(3),
      contractType: z.enum(['PUT_PK', 'PKWT', 'KONSULTAN_AHLI', 'MAGANG']).default('PUT_PK'),
      startDate: z.string(),
      endDate: z.string(),
      salaryRate: z.number().optional(),
      notes: z.string().optional(),
      signedDate: z.string().optional(),
    });

    const parsed = CreateContractSchema.parse(req.body);

    const emp = await prisma.employee.findUnique({ where: { id: parsed.employeeId } });
    if (!emp) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Pegawai tidak ditemukan.');

    // Auto-renew any existing ACTIVE contracts for this employee
    await prisma.employeeContract.updateMany({
      where: {
        employeeId: parsed.employeeId,
        status: 'ACTIVE',
      },
      data: {
        status: 'RENEWED',
      },
    });

    const contract = await prisma.employeeContract.create({
      data: {
        employeeId: parsed.employeeId,
        contractNumber: parsed.contractNumber,
        contractType: parsed.contractType,
        startDate: new Date(parsed.startDate),
        endDate: new Date(parsed.endDate),
        salaryRate: parsed.salaryRate || emp.baseSalary,
        status: 'ACTIVE',
        notes: parsed.notes || `SK Perpanjangan Kontrak Kerja PUT PK ${emp.fullName}`,
        signedDate: parsed.signedDate ? new Date(parsed.signedDate) : new Date(parsed.startDate),
      },
      include: {
        employee: {
          select: { id: true, nip: true, fullName: true, department: true, position: true },
        },
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'CONTRACT_CREATED',
      module: 'HRIS',
      entityType: 'EmployeeContract',
      entityId: contract.id,
      entityCode: contract.contractNumber,
      summary: `Menerbitkan kontrak ${contract.contractType} No. ${contract.contractNumber} untuk pegawai ${emp.fullName}`,
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: {
        ...contract,
        salaryRate: toNumber(contract.salaryRate),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 1.5 PUT UPDATE CONTRACT
hrisRouter.put('/contracts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employeeContract.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'CONTRACT_NOT_FOUND', 'Data kontrak tidak ditemukan.');

    const UpdateContractSchema = z.object({
      status: z.enum(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED', 'TERMINATED']).optional(),
      notes: z.string().optional(),
      endDate: z.string().optional(),
      salaryRate: z.number().optional(),
    });

    const parsed = UpdateContractSchema.parse(req.body);
    const dataToUpdate: Record<string, unknown> = {};
    if (parsed.status) dataToUpdate.status = parsed.status;
    if (parsed.notes !== undefined) dataToUpdate.notes = parsed.notes;
    if (parsed.endDate) dataToUpdate.endDate = new Date(parsed.endDate);
    if (parsed.salaryRate !== undefined) dataToUpdate.salaryRate = parsed.salaryRate;

    const updated = await prisma.employeeContract.update({
      where: { id },
      data: dataToUpdate,
    });

    res.json({
      success: true,
      data: {
        ...updated,
        salaryRate: toNumber(updated.salaryRate),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET ATTENDANCE LIST & RECAP
hrisRouter.get('/attendance', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const { employeeId, status, date } = req.query;
    const where: Record<string, unknown> = {};

    if (employeeId && typeof employeeId === 'string') {
      where.employeeId = employeeId;
    }
    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }
    if (date && typeof date === 'string') {
      where.date = new Date(date);
    }

    const records = await prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: { id: true, nip: true, fullName: true, department: true, position: true },
        },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });

    const formatted = records.map((r) => ({
      ...r,
      overtimeHours: toNumber(r.overtimeHours),
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

// 2.1 GET UNIT ATTENDANCE RECAP
hrisRouter.get('/attendance/unit-recap', async (req, res, next) => {
  try {
    await ensureHrisSeedData();

    const month = req.query.month ? parseInt(String(req.query.month), 10) : 12;
    const year = req.query.year ? parseInt(String(req.query.year), 10) : 2026;
    const { businessUnitId } = req.query;

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const buWhere: Record<string, unknown> = { isActive: true };
    if (businessUnitId && typeof businessUnitId === 'string' && businessUnitId !== 'ALL') {
      buWhere.id = businessUnitId;
    }

    const businessUnits = await prisma.businessUnit.findMany({
      where: buWhere,
      select: {
        id: true,
        code: true,
        name: true,
        managerName: true,
      },
      orderBy: { code: 'asc' },
    });

    const unitRecaps = [];
    let grandPresent = 0;
    let grandSick = 0;
    let grandLeave = 0;
    let grandAlpha = 0;
    let grandOvertimeHours = 0;
    let grandMealAllowance = 0;
    let grandOvertimeCost = 0;
    let grandTotalEmployees = 0;

    for (const bu of businessUnits) {
      const emps = await prisma.employee.findMany({
        where: {
          businessUnitId: bu.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          nip: true,
          fullName: true,
          department: true,
          position: true,
          employmentStatus: true,
        },
        orderBy: { nip: 'asc' },
      });

      const empStats = [];
      let buPresent = 0;
      let buSick = 0;
      let buLeave = 0;
      let buAlpha = 0;
      let buOvertime = 0;
      let buVerifiedCount = 0;
      let buTotalAttRecords = 0;

      for (const emp of emps) {
        const atts = await prisma.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { date: 'asc' },
        });

        let present = 0;
        let late = 0;
        let sick = 0;
        let leave = 0;
        let alpha = 0;
        let ot = 0;
        let verifiedCount = 0;

        for (const a of atts) {
          if (a.status === 'PRESENT') present++;
          else if (a.status === 'LATE') { present++; late++; }
          else if (a.status === 'SICK') sick++;
          else if (a.status === 'LEAVE') leave++;
          else if (a.status === 'ALPHA') alpha++;

          ot += toNumber(a.overtimeHours);
          if (a.verifiedBy) verifiedCount++;
        }

        const mealAllowance = present * SBM_2026.MEAL_ALLOWANCE_PER_DAY;
        const overtimeAmount = ot * SBM_2026.OVERTIME_RATE_PER_HOUR;
        const totalSbm = mealAllowance + overtimeAmount;

        buPresent += present;
        buSick += sick;
        buLeave += leave;
        buAlpha += alpha;
        buOvertime += ot;
        buVerifiedCount += verifiedCount;
        buTotalAttRecords += atts.length;

        empStats.push({
          employeeId: emp.id,
          nip: emp.nip,
          fullName: emp.fullName,
          department: emp.department,
          position: emp.position,
          employmentStatus: emp.employmentStatus,
          totalLoggedDays: atts.length,
          presentDays: present,
          lateDays: late,
          sickDays: sick,
          leaveDays: leave,
          alphaDays: alpha,
          overtimeHours: ot,
          mealAllowanceAmount: mealAllowance,
          overtimeAmount: overtimeAmount,
          totalSbmEntitlement: totalSbm,
          isVerified: atts.length > 0 && verifiedCount === atts.length,
        });
      }

      const buMeal = buPresent * SBM_2026.MEAL_ALLOWANCE_PER_DAY;
      const buOtAmount = buOvertime * SBM_2026.OVERTIME_RATE_PER_HOUR;
      const buTotalSbm = buMeal + buOtAmount;
      const isBuVerified = buTotalAttRecords > 0 && buVerifiedCount === buTotalAttRecords;

      grandPresent += buPresent;
      grandSick += buSick;
      grandLeave += buLeave;
      grandAlpha += buAlpha;
      grandOvertimeHours += buOvertime;
      grandMealAllowance += buMeal;
      grandOvertimeCost += buOtAmount;
      grandTotalEmployees += emps.length;

      unitRecaps.push({
        unitId: bu.id,
        unitCode: bu.code,
        unitName: bu.name,
        managerName: bu.managerName,
        totalEmployees: emps.length,
        presentDays: buPresent,
        sickDays: buSick,
        leaveDays: buLeave,
        alphaDays: buAlpha,
        overtimeHours: buOvertime,
        mealAllowanceAmount: buMeal,
        overtimeCost: buOtAmount,
        totalSbmCost: buTotalSbm,
        isVerified: isBuVerified,
        status: isBuVerified ? 'VERIFIED' : 'PENDING_VERIFICATION',
        employees: empStats,
      });
    }

    res.json({
      success: true,
      data: {
        periodMonth: month,
        periodYear: year,
        units: unitRecaps,
        summary: {
          totalUnits: unitRecaps.length,
          totalEmployees: grandTotalEmployees,
          totalPresentDays: grandPresent,
          totalSickDays: grandSick,
          totalLeaveDays: grandLeave,
          totalAlphaDays: grandAlpha,
          totalOvertimeHours: grandOvertimeHours,
          totalMealAllowance: grandMealAllowance,
          totalOvertimeCost: grandOvertimeCost,
          grandTotalSbm: grandMealAllowance + grandOvertimeCost,
          standardMealPerDay: SBM_2026.MEAL_ALLOWANCE_PER_DAY,
          standardOvertimePerHour: SBM_2026.OVERTIME_RATE_PER_HOUR,
        },
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2.2 POST RECORD ATTENDANCE
hrisRouter.post('/attendance/record', async (req, res, next) => {
  try {
    const RecordAttendanceSchema = z.object({
      employeeId: z.string().uuid(),
      date: z.string(),
      checkIn: z.string().optional().nullable(),
      checkOut: z.string().optional().nullable(),
      status: z.enum(['PRESENT', 'LATE', 'SICK', 'LEAVE', 'ALPHA']).default('PRESENT'),
      overtimeHours: z.number().min(0).max(24).default(0),
      notes: z.string().optional().nullable(),
      verifiedBy: z.string().optional().nullable(),
    });

    const parsed = RecordAttendanceSchema.parse(req.body);
    const attDate = new Date(parsed.date);

    const record = await prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: parsed.employeeId,
          date: attDate,
        },
      },
      update: {
        checkIn: parsed.checkIn ? new Date(parsed.checkIn) : null,
        checkOut: parsed.checkOut ? new Date(parsed.checkOut) : null,
        status: parsed.status,
        overtimeHours: parsed.overtimeHours,
        notes: parsed.notes || null,
        verifiedBy: parsed.verifiedBy || req.user?.fullName || null,
      },
      create: {
        employeeId: parsed.employeeId,
        date: attDate,
        checkIn: parsed.checkIn ? new Date(parsed.checkIn) : null,
        checkOut: parsed.checkOut ? new Date(parsed.checkOut) : null,
        status: parsed.status,
        overtimeHours: parsed.overtimeHours,
        notes: parsed.notes || null,
        verifiedBy: parsed.verifiedBy || req.user?.fullName || null,
      },
      include: {
        employee: { select: { id: true, nip: true, fullName: true, department: true } },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...record,
        overtimeHours: toNumber(record.overtimeHours),
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// 2.3 POST VERIFY UNIT ATTENDANCE
hrisRouter.post('/attendance/verify-unit', async (req, res, next) => {
  try {
    const VerifyUnitSchema = z.object({
      businessUnitId: z.string().uuid(),
      periodMonth: z.number().int().min(1).max(12),
      periodYear: z.number().int().min(2020),
    });

    const parsed = VerifyUnitSchema.parse(req.body);

    const startDate = new Date(Date.UTC(parsed.periodYear, parsed.periodMonth - 1, 1));
    const endDate = new Date(Date.UTC(parsed.periodYear, parsed.periodMonth, 0, 23, 59, 59, 999));

    const emps = await prisma.employee.findMany({
      where: { businessUnitId: parsed.businessUnitId },
      select: { id: true },
    });

    const empIds = emps.map((e) => e.id);

    const updated = await prisma.attendance.updateMany({
      where: {
        employeeId: { in: empIds },
        date: { gte: startDate, lte: endDate },
      },
      data: {
        verifiedBy: req.user?.fullName || 'Koordinator Presensi Unit',
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'ATTENDANCE_UNIT_VERIFIED',
      module: 'HRIS',
      entityType: 'BusinessUnitAttendance',
      entityId: parsed.businessUnitId,
      entityCode: `ATT/${parsed.periodYear}/${parsed.periodMonth}`,
      summary: `Verifikasi rekapitulasi presensi unit periode ${parsed.periodMonth}/${parsed.periodYear} sebanyak ${updated.count} baris absensi`,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      data: {
        businessUnitId: parsed.businessUnitId,
        periodMonth: parsed.periodMonth,
        periodYear: parsed.periodYear,
        updatedCount: updated.count,
        verifiedBy: req.user?.fullName || 'Koordinator Presensi Unit',
      },
      meta: { requestId: req.requestId },
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
