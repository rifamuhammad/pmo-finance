import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../../shared/prisma.js';
import { toCents, fromCents, addMoney, subMoney } from '../../shared/decimal.js';
import { recordAuditLog } from '../../shared/audit.js';
import {
  AppError,
  requireAuth,
  requirePermission,
  enforceUnitScope,
  enforceSeparationOfDuties,
} from '../../middleware/auth.js';

export const budgetRouter = Router();

budgetRouter.use(requireAuth);

function enrichBudget(b: any) {
  const allocated = fromCents(toCents(b.totalAllocated));
  const committed = fromCents(toCents(b.totalCommitted));
  const actual = fromCents(toCents(b.totalActual));
  const available = subMoney(subMoney(allocated, committed), actual);
  return {
    ...b,
    totalAllocated: Number(allocated),
    totalCommitted: Number(committed),
    totalActual: Number(actual),
    availableAmount: Number(available),
    revenueTarget: Number(fromCents(toCents(b.revenueTarget))),
    lines: b.lines?.map((l: any) => {
      const lAlloc = fromCents(toCents(l.allocatedAmount));
      const lComm = fromCents(toCents(l.committedAmount));
      const lAct = fromCents(toCents(l.actualAmount));
      const lAvail = subMoney(subMoney(lAlloc, lComm), lAct);
      const v1 = Number(l.vol1 ?? 1);
      const v2 = Number(l.vol2 ?? 1);
      const v3 = Number(l.vol3 ?? 1);
      const v4 = Number(l.vol4 ?? 1);
      const totalVol = Number(l.totalVolume ?? (v1 * v2 * v3 * v4));
      const unitPrice = Number(l.unitPrice ?? 0);
      const semula = Number(l.semulaAmount ?? lAlloc);
      const pergeseran = Number(l.pergeseranAmount ?? 0);
      const menjadi = Number(l.menjadiAmount ?? (semula + pergeseran));
      const selisih = semula - menjadi;
      const serapanPct = Number(lAlloc) > 0 ? Number(((Number(lAct) / Number(lAlloc)) * 100).toFixed(2)) : 0;

      return {
        ...l,
        vol1: v1,
        satuan1: l.satuan1 ?? 'Unit',
        vol2: v2,
        satuan2: l.satuan2 ?? '',
        vol3: v3,
        satuan3: l.satuan3 ?? '',
        vol4: v4,
        satuan4: l.satuan4 ?? '',
        totalVolume: totalVol,
        unitPrice,
        semulaAmount: semula,
        pergeseranAmount: pergeseran,
        menjadiAmount: menjadi,
        selisihAmount: selisih,
        serapanPercent: serapanPct,
        allocatedAmount: Number(lAlloc),
        committedAmount: Number(lComm),
        actualAmount: Number(lAct),
        availableAmount: Number(lAvail),
      };
    }),
  };
}

budgetRouter.get('/', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const { businessUnitId, fiscalPeriodId, status, search } = req.query;
    const where: Record<string, unknown> = {};

    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      where.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      where.businessUnitId = businessUnitId;
    }

    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) {
      where.fiscalPeriodId = fiscalPeriodId;
    }
    if (typeof status === 'string' && status) {
      where.status = status;
    }
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { docNumber: { contains: search.trim(), mode: 'insensitive' } },
        { title: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
        revisions: { orderBy: { version: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: budgets.map(enrichBudget),
      meta: { total: budgets.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// HELPER: BUILD PBI EXCEL WORKBOOK (60 KOLOM RESMI)
// -------------------------------------------------------------
async function buildPbiExcelWorkbook(budgets: any[], titleDoc?: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PMO UTama ERP System';
  workbook.lastModifiedBy = 'Finance & Accounting PMO UTama';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('PBI Semula - Menjadi', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.columns = [
    { key: 'no', width: 6 },
    { key: 'kodeIkps', width: 14 },
    { key: 'ikps', width: 24 },
    { key: 'kegiatanUnit', width: 26 },
    { key: 'kodeStandar', width: 16 },
    { key: 'standarKegiatan', width: 24 },
    { key: 'subKegiatan', width: 28 },
    { key: 'fte', width: 10 },
    { key: 'detilKegiatan', width: 34 },
    { key: 'kelompokPagu', width: 18 },
    { key: 'basAkun', width: 14 },
    { key: 'coa', width: 18 },
    { key: 'namaCoa', width: 30 },

    // BLOK SEMULA (Cols 14 - 25)
    { key: 'v1Semula', width: 10 },
    { key: 'sat1Semula', width: 10 },
    { key: 'v2Semula', width: 10 },
    { key: 'sat2Semula', width: 10 },
    { key: 'v3Semula', width: 10 },
    { key: 'sat3Semula', width: 10 },
    { key: 'v4Semula', width: 10 },
    { key: 'sat4Semula', width: 10 },
    { key: 'totalVolSemula', width: 14 },
    { key: 'hargaSatuanSemula', width: 18 },
    { key: 'jumlahBiayaSemula', width: 20 },
    { key: 'paguSemula', width: 20 },

    // BLOK MENJADI (Cols 26 - 47)
    { key: 'kodeIkpsMenjadi', width: 14 },
    { key: 'ikpsMenjadi', width: 24 },
    { key: 'kegiatanUnitMenjadi', width: 26 },
    { key: 'kodeStandarMenjadi', width: 16 },
    { key: 'standarKegiatanMenjadi', width: 24 },
    { key: 'subKegiatanMenjadi', width: 28 },
    { key: 'fteMenjadi', width: 10 },
    { key: 'detilMenjadi', width: 34 },
    { key: 'kelompokPaguMenjadi', width: 18 },
    { key: 'basAkunMenjadi', width: 14 },
    { key: 'v1Menjadi', width: 10 },
    { key: 'sat1Menjadi', width: 10 },
    { key: 'v2Menjadi', width: 10 },
    { key: 'sat2Menjadi', width: 10 },
    { key: 'v3Menjadi', width: 10 },
    { key: 'sat3Menjadi', width: 10 },
    { key: 'v4Menjadi', width: 10 },
    { key: 'sat4Menjadi', width: 10 },
    { key: 'totalVolMenjadi', width: 14 },
    { key: 'hargaSatuanMenjadi', width: 18 },
    { key: 'jumlahBiayaMenjadi', width: 20 },
    { key: 'paguMenjadi', width: 20 },

    // BLOK EVALUASI, SERAPAN & PROGNOSIS (Cols 48 - 60)
    { key: 'selisihPergeseran', width: 20 },
    { key: 'realisasiAktual', width: 20 },
    { key: 'komitmenPo', width: 20 },
    { key: 'totalTerserap', width: 20 },
    { key: 'sisaPagu', width: 20 },
    { key: 'dayaSerapPct', width: 14 },
    { key: 'alasanRevisi', width: 32 },
    { key: 'tw1', width: 16 },
    { key: 'tw2', width: 16 },
    { key: 'tw3', width: 16 },
    { key: 'tw4', width: 16 },
    { key: 'prognosis', width: 20 },
    { key: 'statusEvaluasi', width: 18 },
  ];

  // ROW 1: Main Title Header
  worksheet.mergeCells(1, 1, 1, 60);
  const row1 = worksheet.getRow(1);
  row1.height = 34;
  const cellA1 = worksheet.getCell(1, 1);
  cellA1.value = 'TABEL SEMULA - MENJADI PERUBAHAN ANGGARAN (FORMAT RESMI PBI / PMO UTAMA)';
  cellA1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  cellA1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002B66' } };
  cellA1.alignment = { vertical: 'middle', horizontal: 'center' };

  // ROW 2: Subtitle Metadata
  worksheet.mergeCells(2, 1, 2, 60);
  const row2 = worksheet.getRow(2);
  row2.height = 22;
  const cellA2 = worksheet.getCell(2, 1);
  const docMeta = titleDoc || (budgets.length === 1 ? budgets[0].docNumber : 'KONSOLIDASI SELURUH UNIT BISNIS');
  const unitMeta = budgets.length === 1 ? `${budgets[0].businessUnit?.name || 'Unit'} (${budgets[0].businessUnit?.code || '-'})` : '5 Unit Bisnis PMO UTama';
  const periodMeta = budgets[0]?.fiscalPeriod?.name || 'Tahun Fiskal 2026';
  const exportTimestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  cellA2.value = `Dokumen: ${docMeta} | Unit: ${unitMeta} | Periode: ${periodMeta} | Diekspor: ${exportTimestamp} WIB | Format Kompatibilitas PBI 60 Kolom`;
  cellA2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  cellA2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cellA2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // ROW 3: Blank separator
  worksheet.getRow(3).height = 8;

  // ROW 4: Group Headers
  const row4 = worksheet.getRow(4);
  row4.height = 26;

  worksheet.mergeCells(4, 1, 4, 13);
  const group1 = worksheet.getCell(4, 1);
  group1.value = 'INFORMASI MATA ANGGARAN & BAGAN AKUN (COA PERTOR 310)';
  group1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  group1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  group1.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(4, 14, 4, 25);
  const group2 = worksheet.getCell(4, 14);
  group2.value = 'PAGU ANGGARAN SEMULA (ALOKASI AWAL RKAP)';
  group2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
  group2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  group2.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(4, 26, 4, 47);
  const group3 = worksheet.getCell(4, 26);
  group3.value = 'PAGU ANGGARAN MENJADI (SETELAH PERGESERAN ANGGARAN)';
  group3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  group3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  group3.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(4, 48, 4, 60);
  const group4 = worksheet.getCell(4, 48);
  group4.value = 'EVALUASI REALISASI, KOMITMEN, DAYA SERAP & PROGNOSIS PBI';
  group4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
  group4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  group4.alignment = { vertical: 'middle', horizontal: 'center' };

  // ROW 5: Detailed 60-Column Headers
  const row5 = worksheet.getRow(5);
  row5.height = 32;

  const COLUMN_HEADERS = [
    'No.', 'KODE IKPS', 'IKPS', 'Kegiatan Unit', 'KODE STANDAR', 'Standar Kegiatan', 'Sub Kegiatan Unit', 'FTE', 'Detil Kegiatan', 'KELOMPOK PAGU', 'BAS / AKUN', 'KODE COA', 'Nama Akun / Uraian Beban',
    'vol 1 (Semula)', 'sat 1', 'vol 2 (Semula)', 'sat 2', 'vol 3 (Semula)', 'sat 3', 'vol 4 (Semula)', 'sat 4', 'total vol (Semula)', 'HARGA SATUAN (Semula)', 'JUMLAH BIAYA (Semula)', 'JUMLAH PAGU SEMULA',
    'KODE IKPS (Menjadi)', 'IKPS (Menjadi)', 'Kegiatan Unit (Menjadi)', 'KODE STANDAR (Menjadi)', 'Standar Kegiatan (Menjadi)', 'Sub Kegiatan (Menjadi)', 'FTE (Menjadi)', 'Detil (Menjadi)', 'KELOMPOK PAGU (Menjadi)', 'BAS / AKUN (Menjadi)',
    'vol 1 (Menjadi)', 'sat 1', 'vol 2 (Menjadi)', 'sat 2', 'vol 3 (Menjadi)', 'sat 3', 'vol 4 (Menjadi)', 'sat 4', 'total vol (Menjadi)', 'HARGA SATUAN (Menjadi)', 'JUMLAH BIAYA (Menjadi)', 'JUMLAH PAGU MENJADI',
    'SELISIH PERGESERAN', 'REALISASI BEBAN AKTUAL', 'KOMITMEN PO / PR', 'TOTAL SERAPAN (RIIL+PO)', 'SISA PAGU TERSEDIA', 'DAYA SERAP (%)', 'ALASAN REVISI / PERGESERAN', 'Realisasi TW I', 'Realisasi TW II', 'Realisasi TW III', 'Realisasi TW IV', 'PROGNOSIS AKHIR TAHUN', 'STATUS EVALUASI'
  ];

  for (let c = 1; c <= 60; c++) {
    const cell = row5.getCell(c);
    cell.value = COLUMN_HEADERS[c - 1];
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }

  // Populate Data Rows starting from Row 6
  let rowIdx = 6;
  let counter = 1;

  for (const b of budgets) {
    for (const l of b.lines || []) {
      const v1Semula = Number(l.vol1 ?? 1);
      const sat1Semula = l.satuan1 || 'Unit';
      const v2Semula = Number(l.vol2 ?? 1);
      const sat2Semula = l.satuan2 || '';
      const v3Semula = Number(l.vol3 ?? 1);
      const sat3Semula = l.satuan3 || '';
      const v4Semula = Number(l.vol4 ?? 1);
      const sat4Semula = l.satuan4 || '';
      const totalVolSemula = Number(l.totalVolume ?? (v1Semula * v2Semula * v3Semula * v4Semula));
      const unitPriceSemula = Number(l.unitPrice ?? 0);
      const semulaAmount = Number(l.semulaAmount ?? l.allocatedAmount);

      const v1Menjadi = Number(l.vol1 ?? 1);
      const sat1Menjadi = l.satuan1 || 'Unit';
      const v2Menjadi = Number(l.vol2 ?? 1);
      const sat2Menjadi = l.satuan2 || '';
      const v3Menjadi = Number(l.vol3 ?? 1);
      const sat3Menjadi = l.satuan3 || '';
      const v4Menjadi = Number(l.vol4 ?? 1);
      const sat4Menjadi = l.satuan4 || '';
      const totalVolMenjadi = Number(l.totalVolume ?? (v1Menjadi * v2Menjadi * v3Menjadi * v4Menjadi));
      const unitPriceMenjadi = Number(l.unitPrice ?? 0);
      const menjadiAmount = Number(l.menjadiAmount ?? l.allocatedAmount);

      const pergeseran = Number(l.pergeseranAmount ?? (menjadiAmount - semulaAmount));
      const act = Number(l.actualAmount ?? 0);
      const comm = Number(l.committedAmount ?? 0);
      const absorbed = act + comm;
      const sisa = Math.max(0, menjadiAmount - absorbed);
      const serapanPct = menjadiAmount > 0 ? absorbed / menjadiAmount : 0;
      const prognosis = menjadiAmount;
      const statusEv = absorbed >= menjadiAmount ? 'TERSERAP PENUH' : (serapanPct >= 0.8 ? 'OPTIMAL' : 'BERJALAN');

      const r = worksheet.getRow(rowIdx);
      r.height = 22;

      const rowValues = [
        counter++,
        l.activityCode || 'IKPS-01',
        'Peningkatan Layanan Komersial PMO',
        l.activityName || b.title,
        'STD-01',
        l.category || 'OPEX',
        l.subActivity || l.description,
        l.fte || '-',
        l.description,
        l.kelompokPagu || 'Operasional',
        l.accountCode.slice(0, 6),
        l.accountCode,
        l.description,

        // Semula
        v1Semula,
        sat1Semula,
        v2Semula,
        sat2Semula,
        v3Semula,
        sat3Semula,
        v4Semula,
        sat4Semula,
        totalVolSemula,
        unitPriceSemula,
        semulaAmount,
        semulaAmount,

        // Menjadi
        l.activityCode || 'IKPS-01',
        'Peningkatan Layanan Komersial PMO',
        l.activityName || b.title,
        'STD-01',
        l.category || 'OPEX',
        l.subActivity || l.description,
        l.fte || '-',
        l.description,
        l.kelompokPagu || 'Operasional',
        l.accountCode.slice(0, 6),
        v1Menjadi,
        sat1Menjadi,
        v2Menjadi,
        sat2Menjadi,
        v3Menjadi,
        sat3Menjadi,
        v4Menjadi,
        sat4Menjadi,
        totalVolMenjadi,
        unitPriceMenjadi,
        menjadiAmount,
        menjadiAmount,

        // Evaluasi & Serapan
        pergeseran,
        act,
        comm,
        absorbed,
        sisa,
        serapanPct,
        l.alasanRevisi || (pergeseran !== 0 ? 'Pergeseran Anggaran Revisi' : 'Sesuai Plafon RGA'),
        Math.round(act * 0.25),
        Math.round(act * 0.25),
        Math.round(act * 0.25),
        Math.round(act * 0.25),
        prognosis,
        statusEv,
      ];

      for (let c = 1; c <= 60; c++) {
        const cell = r.getCell(c);
        cell.value = rowValues[c - 1];
        cell.font = { name: 'Calibri', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }

        if ([1, 14, 16, 18, 20, 22, 36, 38, 40, 42, 44].includes(c)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (c > 1) cell.numFmt = '#,##0.00';
        } else if ([15, 17, 19, 21, 37, 39, 41, 43, 60].includes(c)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if ([23, 24, 25, 45, 46, 47, 48, 49, 50, 51, 52, 55, 56, 57, 58, 59].includes(c)) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        } else if (c === 53) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '0.0%';
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      }

      rowIdx++;
    }
  }

  // Summary / Total Row
  const totalRow = worksheet.getRow(rowIdx);
  totalRow.height = 28;

  worksheet.mergeCells(rowIdx, 1, rowIdx, 13);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = 'TOTAL KONSOLIDASI (IDR)';
  totalLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  totalLabel.alignment = { vertical: 'middle', horizontal: 'center' };

  const lastDataRow = Math.max(6, rowIdx - 1);
  const colLetter = (colIndex: number) => {
    let temp = '';
    let letter = '';
    while (colIndex > 0) {
      temp = String.fromCharCode(((colIndex - 1) % 26) + 65);
      letter = temp + letter;
      colIndex = Math.floor((colIndex - temp.charCodeAt(0) + 64) / 26);
    }
    return letter;
  };

  for (let c = 1; c <= 60; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    if ([24, 25, 46, 47, 48, 49, 50, 51, 52, 55, 56, 57, 58, 59].includes(c)) {
      const letCode = colLetter(c);
      cell.value = { formula: `SUM(${letCode}6:${letCode}${lastDataRow})` };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '#,##0';
    } else if (c === 53) {
      const colAbsorbed = colLetter(51);
      const colMenjadi = colLetter(47);
      cell.value = { formula: `IF(${colMenjadi}${rowIdx}>0, ${colAbsorbed}${rowIdx}/${colMenjadi}${rowIdx}, 0)` };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.numFmt = '0.0%';
    } else if (c === 60) {
      cell.value = 'SELESAI';
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  return workbook;
}

// -------------------------------------------------------------
// ENDPOINTS: EKSPOR EXCEL FORMAT RESMI PBI (60 KOLOM)
// -------------------------------------------------------------
budgetRouter.get('/export/pbi-excel', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const { businessUnitId, fiscalPeriodId } = req.query;
    const where: Record<string, unknown> = {};
    if (req.user!.businessUnitId && ['UNIT_MANAGER', 'CASHIER'].includes(req.user!.roleCode)) {
      where.businessUnitId = req.user!.businessUnitId;
    } else if (typeof businessUnitId === 'string' && businessUnitId) {
      where.businessUnitId = businessUnitId;
    }
    if (typeof fiscalPeriodId === 'string' && fiscalPeriodId) {
      where.fiscalPeriodId = fiscalPeriodId;
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (budgets.length === 0) {
      throw new AppError(404, 'BUDGET_NOT_FOUND', 'Tidak ada data anggaran untuk diekspor.');
    }

    const workbook = await buildPbiExcelWorkbook(budgets, 'KONSOLIDASI_PBI_60_KOLOM');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PBI_Semula_Menjadi_Konsolidasi_60_Kolom.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

budgetRouter.get('/:id/export/pbi-excel', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
      },
    });

    if (!budget) {
      throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    }
    enforceUnitScope(req.user, budget.businessUnitId);

    const workbook = await buildPbiExcelWorkbook([budget], budget.docNumber);
    const sanitizedDoc = budget.docNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="PBI_Semula_Menjadi_${sanitizedDoc}_60_Kolom.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

budgetRouter.get('/:id', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: {
          include: {
            costCenter: true,
            commitments: { orderBy: { createdAt: 'desc' } },
          },
        },
        revisions: { orderBy: { version: 'desc' } },
      },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Dokumen anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'Budget', entityId: budget.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        ...enrichBudget(budget),
        auditLogs,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

const createBudgetSchema = z.object({
  title: z.string().min(4, 'Judul anggaran minimal 4 karakter.'),
  businessUnitId: z.string().min(1),
  fiscalPeriodId: z.string().min(1),
  fundSourceId: z.string().min(1),
  revenueTarget: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        costCenterId: z.string().min(1),
        accountCode: z.string().min(2),
        category: z.enum(['CAPEX', 'OPEX', 'MODAL_KERJA', 'PENGADAAN', 'PEGAWAI', 'PAJAK']),
        description: z.string().min(3),
        allocatedAmount: z.number().positive('Alokasi baris anggaran wajib lebih besar dari 0.'),
        activityCode: z.string().optional(),
        activityName: z.string().optional(),
        subActivity: z.string().optional(),
        detailDescription: z.string().optional(),
        kelompokPagu: z.string().optional(),
        fte: z.string().optional(),
        vol1: z.number().optional(),
        satuan1: z.string().optional(),
        vol2: z.number().optional(),
        satuan2: z.string().optional(),
        vol3: z.number().optional(),
        satuan3: z.string().optional(),
        vol4: z.number().optional(),
        satuan4: z.string().optional(),
        unitPrice: z.number().optional(),
        semulaAmount: z.number().optional(),
        pergeseranAmount: z.number().optional(),
        menjadiAmount: z.number().optional(),
        alasanRevisi: z.string().optional(),
      })
    )
    .min(1, 'Anggaran wajib memiliki minimal 1 baris mata anggaran.'),
});

budgetRouter.post('/', requirePermission('budget:create'), async (req, res, next) => {
  try {
    const parsed = createBudgetSchema.parse(req.body);
    enforceUnitScope(req.user, parsed.businessUnitId);

    const period = await prisma.fiscalPeriod.findUnique({ where: { id: parsed.fiscalPeriodId } });
    if (!period) throw new AppError(404, 'PERIOD_NOT_FOUND', 'Periode fiskal tidak ditemukan.');
    if (period.isClosed) {
      throw new AppError(409, 'PERIOD_CLOSED', 'Tidak dapat membuat anggaran pada periode fiskal yang telah ditutup.');
    }

    const totalAllocated = addMoney(...parsed.lines.map((l) => l.allocatedAmount));
    const count = await prisma.budget.count();
    const docNumber = `BDG-${period.code}-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.budget.create({
      data: {
        docNumber,
        title: parsed.title.trim(),
        businessUnitId: parsed.businessUnitId,
        fiscalPeriodId: parsed.fiscalPeriodId,
        fundSourceId: parsed.fundSourceId,
        version: 1,
        status: 'DRAFT',
        totalAllocated,
        totalCommitted: '0.00',
        totalActual: '0.00',
        revenueTarget: fromCents(toCents(parsed.revenueTarget)),
        notes: parsed.notes?.trim() ?? null,
        createdById: req.user!.userId,
        createdByName: req.user!.fullName,
        lines: {
          create: parsed.lines.map((l) => {
            const v1 = l.vol1 ?? 1;
            const v2 = l.vol2 ?? 1;
            const v3 = l.vol3 ?? 1;
            const v4 = l.vol4 ?? 1;
            const totalVol = v1 * v2 * v3 * v4;
            const unitPrice = l.unitPrice ?? 0;
            const semula = l.semulaAmount ?? l.allocatedAmount;
            const pergeseran = l.pergeseranAmount ?? 0;
            const menjadi = l.menjadiAmount ?? (semula + pergeseran);

            return {
              costCenterId: l.costCenterId,
              accountCode: l.accountCode,
              category: l.category,
              description: l.description.trim(),
              activityCode: l.activityCode?.trim() ?? null,
              activityName: l.activityName?.trim() ?? null,
              subActivity: l.subActivity?.trim() ?? null,
              detailDescription: l.detailDescription?.trim() ?? null,
              kelompokPagu: l.kelompokPagu?.trim() ?? 'Layanan Dasar',
              fte: l.fte?.trim() ?? null,
              vol1: v1,
              satuan1: l.satuan1?.trim() ?? 'Unit',
              vol2: v2,
              satuan2: l.satuan2?.trim() ?? null,
              vol3: v3,
              satuan3: l.satuan3?.trim() ?? null,
              vol4: v4,
              satuan4: l.satuan4?.trim() ?? null,
              totalVolume: totalVol,
              unitPrice: fromCents(toCents(unitPrice)),
              semulaAmount: fromCents(toCents(semula)),
              pergeseranAmount: fromCents(toCents(pergeseran)),
              menjadiAmount: fromCents(toCents(menjadi)),
              allocatedAmount: fromCents(toCents(l.allocatedAmount)),
              alasanRevisi: l.alasanRevisi?.trim() ?? null,
            };
          }),
        },
      },
      include: {
        businessUnit: true,
        fiscalPeriod: true,
        fundSource: true,
        lines: { include: { costCenter: true } },
      },
    });

    await recordAuditLog({
      actorId: req.user!.userId,
      actorName: req.user!.fullName,
      actorRole: req.user!.roleCode,
      action: 'BUDGET_CREATED',
      module: 'BUDGET',
      entityType: 'Budget',
      entityId: created.id,
      entityCode: created.docNumber,
      summary: `Membuat draft anggaran ${created.docNumber} (${created.title}) senilai Rp ${Number(totalAllocated).toLocaleString('id-ID')}`,
      afterData: { docNumber: created.docNumber, totalAllocated, status: created.status },
      requestId: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: enrichBudget(created),
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post('/:id/submit', requirePermission('budget:submit'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    if (!['DRAFT', 'REJECTED'].includes(budget.status)) {
      throw new AppError(409, 'INVALID_STATE', `Anggaran berstatus ${budget.status} tidak dapat diajukan ulang.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          rejectionReason: null,
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      const reqCount = await tx.approvalRequest.count();
      await tx.approvalRequest.create({
        data: {
          requestNumber: `APR-BDG-${String(reqCount + 1).padStart(4, '0')}`,
          module: 'BUDGET',
          entityId: b.id,
          entityCode: b.docNumber,
          title: `Persetujuan Anggaran: ${b.title}`,
          businessUnitId: b.businessUnitId,
          amount: b.totalAllocated,
          status: 'PENDING',
          requestedById: req.user!.userId,
          requestedByName: req.user!.fullName,
          requiredRoleCode: 'GM_PMO',
        },
      });

      await tx.notification.create({
        data: {
          roleCode: 'GM_PMO',
          title: `Pengajuan Anggaran ${b.docNumber}`,
          message: `${req.user!.fullName} mengajukan anggaran "${b.title}" untuk disetujui.`,
          category: 'APPROVAL_REQUIRED',
          severity: 'WARNING',
          targetUrl: `/budgets`,
          entityType: 'Budget',
          entityId: b.id,
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_SUBMITTED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Mengajukan anggaran ${b.docNumber} untuk persetujuan GM PMO`,
          beforeData: { status: budget.status },
          afterData: { status: b.status },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

budgetRouter.post('/:id/approve', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (budget.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', `Hanya anggaran berstatus SUBMITTED yang dapat disetujui (status saat ini: ${budget.status}).`);
    }

    enforceSeparationOfDuties(budget.createdById, req.user!.userId);

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'APPROVED',
          approvedById: req.user!.userId,
          approvedByName: req.user!.fullName,
          approvedAt: new Date(),
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'BUDGET', entityId: b.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: req.body?.note || 'Disetujui sesuai plafon periode.',
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_APPROVED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Menyetujui anggaran ${b.docNumber} (Versi ${b.version})`,
          beforeData: { status: budget.status },
          afterData: { status: b.status, approvedBy: req.user!.fullName },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const rejectSchema = z.object({
  reason: z.string().min(5, 'Alasan penolakan wajib diisi minimal 5 karakter.'),
});

budgetRouter.post('/:id/reject', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const { reason } = rejectSchema.parse(req.body);
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (budget.status !== 'SUBMITTED') {
      throw new AppError(409, 'INVALID_STATE', 'Hanya anggaran berstatus SUBMITTED yang dapat ditolak.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
        },
        include: { businessUnit: true, fiscalPeriod: true, fundSource: true, lines: { include: { costCenter: true } } },
      });

      await tx.approvalRequest.updateMany({
        where: { module: 'BUDGET', entityId: b.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          decidedById: req.user!.userId,
          decidedByName: req.user!.fullName,
          decidedAt: new Date(),
          decisionNote: reason.trim(),
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_REJECTED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Menolak anggaran ${b.docNumber}. Alasan: ${reason}`,
          beforeData: { status: budget.status },
          afterData: { status: b.status, rejectionReason: reason },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

const reviseSchema = z.object({
  reason: z.string().min(5, 'Alasan revisi anggaran wajib diisi minimal 5 karakter.'),
  revenueTarget: z.number().nonnegative().optional(),
  lineUpdates: z
    .array(
      z.object({
        lineId: z.string(),
        newAllocatedAmount: z.number().positive(),
        vol1: z.number().optional(),
        satuan1: z.string().optional(),
        vol2: z.number().optional(),
        satuan2: z.string().optional(),
        vol3: z.number().optional(),
        satuan3: z.string().optional(),
        vol4: z.number().optional(),
        satuan4: z.string().optional(),
        unitPrice: z.number().optional(),
        pergeseranAmount: z.number().optional(),
        alasanRevisi: z.string().optional(),
      })
    )
    .min(1),
});

budgetRouter.post('/:id/revise', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const parsed = reviseSchema.parse(req.body);
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    if (!['APPROVED', 'REVISED'].includes(budget.status)) {
      throw new AppError(409, 'INVALID_STATE', 'Hanya anggaran yang telah disetujui yang dapat direvisi.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Save immutable snapshot of previous version in BudgetRevision
      await tx.budgetRevision.create({
        data: {
          budgetId: budget.id,
          version: budget.version,
          reason: parsed.reason.trim(),
          previousAllocated: budget.totalAllocated,
          newAllocated: '0.00', // updated below
          snapshotData: JSON.parse(JSON.stringify(budget.lines)),
          revisedById: req.user!.userId,
          revisedByName: req.user!.fullName,
          approvedById: req.user!.userId,
          status: 'APPROVED',
        },
      });

      for (const upd of parsed.lineUpdates) {
        const line = budget.lines.find((l) => l.id === upd.lineId);
        if (!line) throw new AppError(404, 'BUDGET_LINE_NOT_FOUND', `Baris anggaran ${upd.lineId} tidak ditemukan.`);
        const usedCents = toCents(line.committedAmount) + toCents(line.actualAmount);
        const newAllocCents = toCents(upd.newAllocatedAmount);
        if (newAllocCents < usedCents) {
          throw new AppError(
            409,
            'REVISION_BELOW_USED',
            `Plafon revisi baris "${line.description}" tidak boleh lebih kecil dari total komitmen + aktual yang sudah terpakai (${fromCents(usedCents)}).`
          );
        }

        const semula = Number(line.semulaAmount && Number(line.semulaAmount) > 0 ? line.semulaAmount : line.allocatedAmount);
        const pergeseran = upd.pergeseranAmount !== undefined ? upd.pergeseranAmount : (upd.newAllocatedAmount - semula);
        const v1 = upd.vol1 ?? Number(line.vol1 ?? 1);
        const v2 = upd.vol2 ?? Number(line.vol2 ?? 1);
        const v3 = upd.vol3 ?? Number(line.vol3 ?? 1);
        const v4 = upd.vol4 ?? Number(line.vol4 ?? 1);
        const totalVol = v1 * v2 * v3 * v4;

        await tx.budgetLine.update({
          where: { id: line.id },
          data: {
            allocatedAmount: fromCents(newAllocCents),
            menjadiAmount: fromCents(newAllocCents),
            semulaAmount: fromCents(toCents(semula)),
            pergeseranAmount: fromCents(toCents(pergeseran)),
            totalVolume: totalVol,
            vol1: v1,
            vol2: v2,
            vol3: v3,
            vol4: v4,
            satuan1: upd.satuan1 ?? line.satuan1,
            satuan2: upd.satuan2 ?? line.satuan2,
            satuan3: upd.satuan3 ?? line.satuan3,
            satuan4: upd.satuan4 ?? line.satuan4,
            unitPrice: upd.unitPrice !== undefined ? fromCents(toCents(upd.unitPrice)) : line.unitPrice,
            alasanRevisi: upd.alasanRevisi?.trim() ?? line.alasanRevisi,
          },
        });
      }

      const freshLines = await tx.budgetLine.findMany({ where: { budgetId: budget.id } });
      const newTotal = addMoney(...freshLines.map((l) => l.allocatedAmount));

      await tx.budgetRevision.updateMany({
        where: { budgetId: budget.id, version: budget.version },
        data: { newAllocated: newTotal },
      });

      const b = await tx.budget.update({
        where: { id: budget.id },
        data: {
          version: budget.version + 1,
          status: 'REVISED',
          totalAllocated: newTotal,
          revenueTarget:
            parsed.revenueTarget !== undefined ? fromCents(toCents(parsed.revenueTarget)) : budget.revenueTarget,
        },
        include: {
          businessUnit: true,
          fiscalPeriod: true,
          fundSource: true,
          lines: { include: { costCenter: true } },
          revisions: { orderBy: { version: 'desc' } },
        },
      });

      await recordAuditLog(
        {
          actorId: req.user!.userId,
          actorName: req.user!.fullName,
          actorRole: req.user!.roleCode,
          action: 'BUDGET_REVISED',
          module: 'BUDGET',
          entityType: 'Budget',
          entityId: b.id,
          entityCode: b.docNumber,
          summary: `Merevisi anggaran ${b.docNumber} ke Versi ${b.version}. Alasan: ${parsed.reason}`,
          beforeData: { version: budget.version, totalAllocated: budget.totalAllocated },
          afterData: { version: b.version, totalAllocated: newTotal },
          requestId: req.requestId,
        },
        tx as any
      );

      return b;
    });

    res.json({ success: true, data: enrichBudget(updated), meta: { requestId: req.requestId } });
  } catch (err) {
    next(err);
  }
});

// Endpoint histori snapshot revisi anggaran
budgetRouter.get('/:id/revisions', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    const revisions = await prisma.budgetRevision.findMany({
      where: { budgetId: req.params.id },
      orderBy: { version: 'desc' },
    });

    res.json({
      success: true,
      data: revisions.map((r) => ({
        ...r,
        previousAllocated: Number(fromCents(toCents(r.previousAllocated))),
        newAllocated: Number(fromCents(toCents(r.newAllocated))),
      })),
      meta: { total: revisions.length, requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});

// Endpoint perbandingan (diff viewer) antar 2 versi revisi anggaran
budgetRouter.get('/:id/revisions/compare', requirePermission('budget:view'), async (req, res, next) => {
  try {
    const { fromVersion, toVersion } = req.query;
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { costCenter: true } } },
    });
    if (!budget) throw new AppError(404, 'BUDGET_NOT_FOUND', 'Anggaran tidak ditemukan.');
    enforceUnitScope(req.user, budget.businessUnitId);

    const vFrom = Number(fromVersion) || 1;
    const vTo = toVersion === 'current' ? budget.version : (Number(toVersion) || budget.version);

    let fromLines: any[] = [];
    let fromTotal = 0;
    if (vFrom === budget.version) {
      fromLines = budget.lines;
      fromTotal = Number(fromCents(toCents(budget.totalAllocated)));
    } else {
      const revFrom = await prisma.budgetRevision.findFirst({
        where: { budgetId: budget.id, version: vFrom },
      });
      if (revFrom) {
        fromLines = (revFrom.snapshotData as any[]) || [];
        fromTotal = Number(fromCents(toCents(revFrom.previousAllocated)));
      }
    }

    let toLines: any[] = [];
    let toTotal = 0;
    if (vTo === budget.version) {
      toLines = budget.lines;
      toTotal = Number(fromCents(toCents(budget.totalAllocated)));
    } else {
      const revTo = await prisma.budgetRevision.findFirst({
        where: { budgetId: budget.id, version: vTo },
      });
      if (revTo) {
        toLines = (revTo.snapshotData as any[]) || [];
        toTotal = Number(fromCents(toCents(revTo.previousAllocated)));
      }
    }

    const lineMap = new Map<string, { from?: any; to?: any }>();
    for (const fl of fromLines) {
      const key = fl.id || `${fl.accountCode}-${fl.description}`;
      if (!lineMap.has(key)) lineMap.set(key, {});
      lineMap.get(key)!.from = fl;
    }
    for (const tl of toLines) {
      const key = tl.id || `${tl.accountCode}-${tl.description}`;
      if (!lineMap.has(key)) lineMap.set(key, {});
      lineMap.get(key)!.to = tl;
    }

    const comparisonLines: any[] = [];
    for (const [key, pair] of lineMap.entries()) {
      const fAmt = pair.from ? Number(fromCents(toCents(pair.from.allocatedAmount ?? pair.from.menjadiAmount ?? 0))) : 0;
      const tAmt = pair.to ? Number(fromCents(toCents(pair.to.allocatedAmount ?? pair.to.menjadiAmount ?? 0))) : 0;
      const diff = tAmt - fAmt;
      const desc = pair.to?.description || pair.from?.description || 'Pos Anggaran';
      const coa = pair.to?.accountCode || pair.from?.accountCode || '-';
      const costCenter = pair.to?.costCenter?.code || pair.from?.costCenter?.code || '-';

      let status = 'UNCHANGED';
      if (!pair.from && pair.to) status = 'ADDED';
      else if (pair.from && !pair.to) status = 'REMOVED';
      else if (diff > 0) status = 'INCREASED';
      else if (diff < 0) status = 'DECREASED';

      comparisonLines.push({
        key,
        costCenter,
        accountCode: coa,
        description: desc,
        fromAmount: fAmt,
        toAmount: tAmt,
        differenceAmount: diff,
        status,
      });
    }

    res.json({
      success: true,
      data: {
        budgetId: budget.id,
        docNumber: budget.docNumber,
        fromVersion: vFrom,
        toVersion: vTo,
        fromTotalAllocated: fromTotal,
        toTotalAllocated: toTotal,
        totalDifference: toTotal - fromTotal,
        lines: comparisonLines,
      },
      meta: { requestId: req.requestId },
    });
  } catch (err) {
    next(err);
  }
});
