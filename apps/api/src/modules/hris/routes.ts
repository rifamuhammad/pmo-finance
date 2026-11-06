import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { toNumber } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import { AppError, requireAuth } from '../../middleware/auth.js';

export const hrisRouter = Router();

hrisRouter.use(requireAuth);

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
