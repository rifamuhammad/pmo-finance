import ExcelJS from 'exceljs';
import { terbilangRupiah } from './tax-engine.js';

export interface BukuHarianRowExport {
  no: number;
  paymentDate: string;
  receiptNumber: string;
  receiptType: string;
  picName: string;
  subCategory: string;
  businessUnitCode: string;
  businessUnitName: string;
  payerName: string;
  payerTaxId: string;
  payerAddress: string;
  invoiceDocNumber: string;
  invoiceDate: string;
  paymentStage: string;
  activityTitle: string;
  activityDate: string;
  rincianLabel: string;
  revenueAccountCode: string;
  revenueAccountName: string;
  taxScheme: string;
  taxCollectorProfile: string;
  fakturPajakCode: string;
  bankReceivedAmount: number;
  brutoDocumentAmount: number;
  nilaiJual: number;
  dppPb1: number;
  dppPpn: number;
  dppPph: number;
  ppnAmount: number;
  pph42Amount: number;
  pph23Amount: number;
  pph23Rate15Amount: number;
  pph21Amount: number;
  pb1Amount: number;
  utRemitPpn: number;
  utRemitPph42: number;
  utRemitPph23Rate15: number;
  utRemitPph21: number;
  utRemitPb1: number;
  feeAmount: number;
  overpaymentAmount: number;
  invoiceBalanceDue: number;
  bankAccountCode: string;
  bankName: string;
  withholdingSlipNo: string;
  taxAlreadyProcessed: boolean;
  depositDate: string;
  method: string;
  referenceNo: string;
  notes: string;
}

export interface TaxWithdrawalSummaryExport {
  periodLabel: string;
  bankFilterLabel?: string;
  sourceBankLabel?: string;
  sourceBankAccountNo?: string;
  sourceBankAccountHolder?: string;
  targetTaxBankLabel?: string;
  targetTaxAccountNo?: string;
  targetTaxAccountHolder?: string;
  coaColumns: string[];
  rows: Array<{
    label: string;
    refundAmount?: number;
    byCoa: Record<string, number>;
    total: number;
  }>;
  totalTaxWithdrawal: number;
  totalOverpaymentRefund: number;
  overpaymentItems: Array<{
    receiptNumber: string;
    payerName: string;
    activityTitle: string;
    amount: number;
    refundBankName?: string;
    refundAccountNumber?: string;
    refundAccountHolder?: string;
  }>;
  excludedCount: number;
}

const NAVY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2144' } };
const SUB_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
const IDR_FMT = '#,##0;(#,##0);"-"';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = NAVY_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  row.height = 28;
}

export async function buildPenerimaanMonthlyWorkbook(params: {
  periodLabel: string;
  rows: BukuHarianRowExport[];
  pivotByCoa: Array<{ coa: string; coaName: string; count: number; totalReceived: number; totalBruto: number; totalTaxUt: number }>;
  withdrawal: TaxWithdrawalSummaryExport;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PMO UTama Finance ERP';
  wb.created = new Date();

  // ==================== SHEET 1: BUKU HARIAN (22 KOLOM RESMI PIC) ====================
  const wsBh = wb.addWorksheet('Buku Harian');
  wsBh.addRow([`BUKU HARIAN PENERIMAAN PMO UTAMA - ${params.periodLabel.toUpperCase()}`]).font = { bold: true, size: 13 };
  wsBh.addRow([
    `Rekening Penerimaan: ${params.withdrawal.sourceBankLabel || 'Bank Mandiri (Final) No. 164-00-2022-999-5 a.n. PTNBH UT .USAHA NON AKADEMIK'}`,
  ]);
  wsBh.addRow([]);
  const bhHeaders = [
    'No', 'Tanggal Pencatatan', 'No. Kuitansi', 'PIC', 'SUB', 'Unit', 'Nama Klien / Pembayar',
    'No. KTP / NPWP', 'Alamat', 'No. Invoice', 'Tgl Invoice', 'Status Pembayaran',
    'Kegiatan', 'Tanggal Kegiatan', 'Rincian (COA) Pembayaran', 'Uraian COA',
    'Penerimaan (Debit)', 'Setoran Bank (Kredit)', 'Saldo', 'COA',
    'Tanggal Setor', 'Rekening & Keterangan',
  ];
  styleHeaderRow(wsBh.addRow(bhHeaders));

  let sumReceived = 0;
  params.rows.forEach((r) => {
    sumReceived += r.bankReceivedAmount;
    const row = wsBh.addRow([
      r.no, r.paymentDate, r.receiptNumber, r.picName || '-', r.subCategory || 'Umum', r.businessUnitCode, r.payerName,
      r.payerTaxId, r.payerAddress, r.invoiceDocNumber, r.invoiceDate, r.paymentStage,
      r.activityTitle, r.activityDate, r.rincianLabel, r.revenueAccountName,
      r.bankReceivedAmount, r.bankReceivedAmount, 0, r.revenueAccountCode,
      r.depositDate, `${r.bankAccountCode || 'BNK-MDR-01'} · ${r.method} / ${r.referenceNo}${r.notes ? ` · ${r.notes}` : ''}`,
    ]);
    [17, 18, 19].forEach((c) => (row.getCell(c).numFmt = IDR_FMT));
  });

  const bhTotal = wsBh.addRow([
    '', '', '', '', '', '', 'TOTAL PENERIMAAN', '', '', '', '', '', '', '', '', '',
    sumReceived, sumReceived, 0, '', '', '',
  ]);
  bhTotal.font = { bold: true };
  [17, 18, 19].forEach((c) => (bhTotal.getCell(c).numFmt = IDR_FMT));
  wsBh.columns = [6, 13, 22, 14, 12, 11, 26, 18, 24, 22, 12, 14, 34, 18, 24, 28, 18, 18, 14, 15, 13, 30].map((w) => ({ width: w }));

  // ==================== SHEET 2: PIVOT COA ====================
  const wsPiv = wb.addWorksheet('Pivot COA');
  wsPiv.addRow([`REKAP PENERIMAAN PER KODE COA - ${params.periodLabel.toUpperCase()}`]).font = { bold: true, size: 13 };
  wsPiv.addRow([]);
  styleHeaderRow(wsPiv.addRow(['Kode COA', 'Uraian COA', 'Jumlah Transaksi', 'Total Masuk Rekening (Rp)', 'Total Bruto Dokumen (Rp)', 'Total Pajak Disetor UT (Rp)']));
  for (const p of params.pivotByCoa) {
    const row = wsPiv.addRow([p.coa, p.coaName, p.count, p.totalReceived, p.totalBruto, p.totalTaxUt]);
    [4, 5, 6].forEach((c) => (row.getCell(c).numFmt = IDR_FMT));
  }
  const pTot = wsPiv.addRow([
    'TOTAL',
    '',
    params.pivotByCoa.reduce((s, x) => s + x.count, 0),
    params.pivotByCoa.reduce((s, x) => s + x.totalReceived, 0),
    params.pivotByCoa.reduce((s, x) => s + x.totalBruto, 0),
    params.pivotByCoa.reduce((s, x) => s + x.totalTaxUt, 0),
  ]);
  pTot.font = { bold: true };
  [4, 5, 6].forEach((c) => (pTot.getCell(c).numFmt = IDR_FMT));
  wsPiv.columns = [16, 44, 18, 24, 24, 24].map((w) => ({ width: w }));

  // ==================== SHEET 3: PERINCIAN + PAJAK (32 KOLOM RESMI PTNBH) ====================
  const wsTax = wb.addWorksheet('Perincian + Pajak');
  wsTax.addRow([`PERHITUNGAN PAJAK PENERIMAAN PMO UTAMA - ${params.periodLabel.toUpperCase()}`]).font = { bold: true, size: 13 };
  wsTax.addRow([
    `${params.withdrawal.sourceBankLabel || 'Bank Mandiri (Final) No. 164-00-2022-999-5 A/N PTNBH UT .USAHA NON AKADEMIK'}`,
  ]);
  wsTax.addRow([]);
  const taxHeaders = [
    'No', 'Tanggal', 'Kegiatan', 'Rincian (COA) Pembayaran', 'Uraian COA', 'COA',
    'Nama', 'No. KTP / NPWP', 'Alamat', 'No. Invoice', 'Tgl Invoice',
    'Jumlah (Rp) sesuai Rekening', 'Jumlah Bruto sesuai Dokumen', 'Nilai Jual (100/111)',
    'DPP Pajak Daerah (10/11)', 'DPP PPN (11/12)', 'DPP PPh (= Nilai Jual)',
    'PPN (12% x DPP PPN)', 'PPh 4(2) (10%)', 'PPh 23 (2%)', 'PPh 23 (15%)', 'Pajak Daerah 10%', 'PPh 21 (2.5%/5%)',
    'Biaya Admin Bank', 'UT Terima Cash dari Rekanan', 'Pajak Ditarik UT', 'UT Terima Bersih',
    'Kelebihan / Pengembalian', 'Kekurangan (Piutang)', 'Rekening', 'Profil / Tampungan / Bupot', 'Catatan Pajak',
  ];
  styleHeaderRow(wsTax.addRow(taxHeaders));

  for (const r of params.rows) {
    const utTax = r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1;
    const utNetClean = Math.max(0, r.bankReceivedAmount - utTax - r.overpaymentAmount);
    const statusNote = r.taxAlreadyProcessed
      ? 'Sudah diolah di Rekening Tampungan'
      : r.withholdingSlipNo
      ? `Bukti Potong: ${r.withholdingSlipNo}`
      : `${r.taxCollectorProfile} (FP ${r.fakturPajakCode})`;
    const row = wsTax.addRow([
      r.no, r.paymentDate, r.activityTitle, r.rincianLabel, r.revenueAccountName, r.revenueAccountCode,
      r.payerName, r.payerTaxId, r.payerAddress, r.invoiceDocNumber, r.invoiceDate,
      r.bankReceivedAmount, r.brutoDocumentAmount, r.nilaiJual,
      r.dppPb1, r.dppPpn, r.dppPph,
      r.ppnAmount, r.pph42Amount, r.pph23Amount, r.pph23Rate15Amount || 0, r.pb1Amount, r.pph21Amount || 0,
      r.feeAmount, r.bankReceivedAmount, utTax, utNetClean,
      r.overpaymentAmount, r.invoiceBalanceDue || 0, r.bankName || 'Bank Mandiri Final', statusNote, r.notes || '',
    ]);
    for (let c = 12; c <= 29; c++) row.getCell(c).numFmt = IDR_FMT;
  }

  const taxTotalRow = wsTax.addRow([
    '', '', 'TOTAL', '', '', '', '', '', '', '', '',
    params.rows.reduce((s, r) => s + r.bankReceivedAmount, 0),
    params.rows.reduce((s, r) => s + r.brutoDocumentAmount, 0),
    params.rows.reduce((s, r) => s + r.nilaiJual, 0),
    params.rows.reduce((s, r) => s + r.dppPb1, 0),
    params.rows.reduce((s, r) => s + r.dppPpn, 0),
    params.rows.reduce((s, r) => s + r.dppPph, 0),
    params.rows.reduce((s, r) => s + r.ppnAmount, 0),
    params.rows.reduce((s, r) => s + r.pph42Amount, 0),
    params.rows.reduce((s, r) => s + r.pph23Amount, 0),
    params.rows.reduce((s, r) => s + (r.pph23Rate15Amount || 0), 0),
    params.rows.reduce((s, r) => s + r.pb1Amount, 0),
    params.rows.reduce((s, r) => s + (r.pph21Amount || 0), 0),
    params.rows.reduce((s, r) => s + r.feeAmount, 0),
    params.rows.reduce((s, r) => s + r.bankReceivedAmount, 0),
    params.rows.reduce((s, r) => s + (r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1), 0),
    params.rows.reduce(
      (s, r) =>
        s +
        Math.max(
          0,
          r.bankReceivedAmount - (r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1) - r.overpaymentAmount
        ),
      0
    ),
    params.rows.reduce((s, r) => s + r.overpaymentAmount, 0),
    params.rows.reduce((s, r) => s + (r.invoiceBalanceDue || 0), 0),
    '', '', '',
  ]);
  taxTotalRow.font = { bold: true };
  for (let c = 12; c <= 29; c++) taxTotalRow.getCell(c).numFmt = IDR_FMT;
  wsTax.columns = [
    6, 12, 32, 22, 30, 15, 24, 18, 22, 22, 12,
    18, 18, 18, 16, 16, 16, 16, 16, 14, 14, 16, 14,
    15, 18, 18, 18, 18, 18, 26, 28, 26,
  ].map((w) => ({ width: w }));

  // ==================== SHEET 4: SURAT PENARIKAN PAJAK (RESMI + KOLOM PENGEMBALIAN + BRI) ====================
  const wsSrt = wb.addWorksheet('Surat Penarikan Pajak');
  wsSrt.addRow([`PERMOHONAN PENARIKAN DANA PAJAK ${params.withdrawal.bankFilterLabel ? params.withdrawal.bankFilterLabel.toUpperCase() : 'PENERIMAAN PMO UTAMA'}`]).font = {
    bold: true,
    size: 13,
  };
  wsSrt.addRow([`Periode: ${params.periodLabel}`]).font = { bold: true };
  wsSrt.addRow(['Kepada Yth. Kepala Pusat Pengelolaan Keuangan Universitas Terbuka']);
  wsSrt.addRow([
    `Rekening Sumber: ${params.withdrawal.sourceBankLabel || 'Bank Mandiri'} No. ${params.withdrawal.sourceBankAccountNo || '164-00-2022-999-5'} a.n. ${params.withdrawal.sourceBankAccountHolder || 'PTNBH UT .USAHA NON AKADEMIK'}`,
  ]);
  wsSrt.addRow([]);

  const coaCols = params.withdrawal.coaColumns;
  styleHeaderRow(wsSrt.addRow(['No', 'Keterangan / Jenis Pajak', 'Pengembalian Dana (Rp)', ...coaCols.map((c) => `COA ${c}`), 'Jumlah (Rp)']));
  params.withdrawal.rows.forEach((wr, idx) => {
    const row = wsSrt.addRow([
      idx + 1,
      wr.label,
      wr.refundAmount || 0,
      ...coaCols.map((c) => wr.byCoa[c] || 0),
      wr.total,
    ]);
    for (let c = 3; c <= coaCols.length + 4; c++) row.getCell(c).numFmt = IDR_FMT;
  });
  const grandRow = wsSrt.addRow([
    '',
    'TOTAL PENARIKAN DANA PAJAK',
    params.withdrawal.totalOverpaymentRefund,
    ...coaCols.map((c) => params.withdrawal.rows.reduce((s, wr) => s + (wr.byCoa[c] || 0), 0)),
    params.withdrawal.totalTaxWithdrawal,
  ]);
  grandRow.font = { bold: true };
  grandRow.eachCell((cell) => (cell.fill = SUB_FILL));
  for (let c = 3; c <= coaCols.length + 4; c++) grandRow.getCell(c).numFmt = IDR_FMT;

  wsSrt.addRow([]);
  wsSrt.addRow([`Terbilang Pajak: ${terbilangRupiah(params.withdrawal.totalTaxWithdrawal)}`]).font = { italic: true };
  wsSrt.addRow([
    `1. Penarikan uang pajak sebesar Rp ${params.withdrawal.totalTaxWithdrawal.toLocaleString('id-ID')} dimohon ditransfer ke ${params.withdrawal.targetTaxBankLabel || 'Bank BRI'} No. ${params.withdrawal.targetTaxAccountNo || '1173.01.000574.30.4'} a.n. ${params.withdrawal.targetTaxAccountHolder || 'PTNBH UT NON PPh 21'}.`,
  ]);
  if (params.withdrawal.totalOverpaymentRefund > 0) {
    wsSrt.addRow([`2. Total Pengembalian Dana (Lebih Bayar): Rp ${params.withdrawal.totalOverpaymentRefund.toLocaleString('id-ID')}`]).font = {
      bold: true,
    };
    for (const ov of params.withdrawal.overpaymentItems) {
      const bankNote = ov.refundAccountNumber
        ? ` -> Transfer ke ${ov.refundBankName || 'Bank'} No. ${ov.refundAccountNumber} a.n. ${ov.refundAccountHolder || ov.payerName}`
        : '';
      wsSrt.addRow([`   - ${ov.receiptNumber} (${ov.payerName} · ${ov.activityTitle}): Rp ${ov.amount.toLocaleString('id-ID')}${bankNote}`]);
    }
  }
  if (params.withdrawal.excludedCount > 0) {
    wsSrt.addRow([
      `Catatan: ${params.withdrawal.excludedCount} transaksi dikecualikan dari penarikan pajak karena dipotong langsung oleh klien (FP 020/030) atau sudah diolah di rekening tampungan bulan sebelumnya.`,
    ]);
  }
  wsSrt.columns = [6, 36, 22, ...coaCols.map(() => 18), 22].map((w) => ({ width: w }));

  // ==================== SHEET 5: BKU + PAJAK (5 KOLOM PAJAK TERPISAH) ====================
  const wsBku = wb.addWorksheet('BKU + Pajak');
  wsBku.addRow([`BUKU KAS UMUM (BKU) PENERIMAAN & PAJAK - ${params.periodLabel.toUpperCase()}`]).font = { bold: true, size: 13 };
  wsBku.addRow([]);
  styleHeaderRow(
    wsBku.addRow([
      'No', 'Tanggal', 'Uraian Kegiatan & Rincian', 'No. Dokumen', 'Bruto Masuk (Debet)',
      'PPN 12%', 'PPh 4(2) 10%', 'Pajak Daerah 10%', 'PPh 23 (15%)', 'PPh 23 (2%)',
      'Pajak Disetor UT', 'Setoran Bersih PMO', 'Saldo Berjalan',
    ])
  );
  let bkuRunning = 0;
  for (const r of params.rows) {
    const taxUt = r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1;
    const netClean = r.bankReceivedAmount - taxUt - r.overpaymentAmount;
    bkuRunning += netClean;
    const row = wsBku.addRow([
      r.no, r.paymentDate, `${r.activityTitle} (${r.rincianLabel})`, r.receiptNumber,
      r.bankReceivedAmount, r.ppnAmount, r.pph42Amount, r.pb1Amount, r.pph23Rate15Amount || 0, r.pph23Amount,
      taxUt, netClean, bkuRunning,
    ]);
    for (let c = 5; c <= 13; c++) row.getCell(c).numFmt = IDR_FMT;
  }
  const bkuTot = wsBku.addRow([
    '', '', 'TOTAL BKU PERIODE', '',
    params.rows.reduce((s, r) => s + r.bankReceivedAmount, 0),
    params.rows.reduce((s, r) => s + r.ppnAmount, 0),
    params.rows.reduce((s, r) => s + r.pph42Amount, 0),
    params.rows.reduce((s, r) => s + r.pb1Amount, 0),
    params.rows.reduce((s, r) => s + (r.pph23Rate15Amount || 0), 0),
    params.rows.reduce((s, r) => s + r.pph23Amount, 0),
    params.rows.reduce((s, r) => s + (r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1), 0),
    params.rows.reduce(
      (s, r) => s + (r.bankReceivedAmount - (r.utRemitPpn + r.utRemitPph42 + r.utRemitPph23Rate15 + r.utRemitPph21 + r.utRemitPb1) - r.overpaymentAmount),
      0
    ),
    bkuRunning,
  ]);
  bkuTot.font = { bold: true };
  bkuTot.eachCell((cell) => (cell.fill = TOTAL_FILL));
  for (let c = 5; c <= 13; c++) bkuTot.getCell(c).numFmt = IDR_FMT;
  wsBku.columns = [6, 12, 42, 22, 18, 15, 15, 16, 14, 14, 18, 18, 18].map((w) => ({ width: w }));

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function buildAgingReceivablesWorkbook(params: {
  asOfDate: string;
  byUnit: Array<{ unitCode: string; unitName: string; count: number; current: number; days31to60: number; days61to90: number; over90: number; total: number }>;
  byCustomer: Array<{ customerCode: string; customerName: string; count: number; current: number; days31to60: number; days61to90: number; over90: number; total: number }>;
  invoices: Array<{
    docNumber: string;
    invoiceType: string;
    businessUnitCode: string;
    customerName: string;
    activityTitle: string;
    issueDate: string;
    dueDate: string;
    daysOverdue: number;
    bucketLabel: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
  }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PMO UTama Finance ERP';
  wb.created = new Date();

  const wsSum = wb.addWorksheet('Aging per Unit & Klien');
  wsSum.addRow(['LAPORAN AGING PENERIMAAN (UMUR PIUTANG) PMO UTAMA']).font = { bold: true, size: 13 };
  wsSum.addRow([`Per Tanggal: ${params.asOfDate}`]).font = { italic: true };
  wsSum.addRow([]);

  wsSum.addRow(['A. RINGKASAN PER UNIT BISNIS']).font = { bold: true };
  styleHeaderRow(wsSum.addRow(['Kode Unit', 'Unit Bisnis', 'Jml Faktur', '0-30 Hari', '31-60 Hari', '61-90 Hari', '> 90 Hari', 'Total Piutang']));
  for (const u of params.byUnit) {
    const row = wsSum.addRow([u.unitCode, u.unitName, u.count, u.current, u.days31to60, u.days61to90, u.over90, u.total]);
    for (let c = 4; c <= 8; c++) row.getCell(c).numFmt = IDR_FMT;
  }

  wsSum.addRow([]);
  wsSum.addRow(['B. RINGKASAN PER PELANGGAN / INSTANSI']).font = { bold: true };
  styleHeaderRow(wsSum.addRow(['Kode', 'Pelanggan / Instansi', 'Jml Faktur', '0-30 Hari', '31-60 Hari', '61-90 Hari', '> 90 Hari', 'Total Piutang']));
  for (const cItem of params.byCustomer) {
    const row = wsSum.addRow([cItem.customerCode, cItem.customerName, cItem.count, cItem.current, cItem.days31to60, cItem.days61to90, cItem.over90, cItem.total]);
    for (let c = 4; c <= 8; c++) row.getCell(c).numFmt = IDR_FMT;
  }
  wsSum.columns = [16, 36, 12, 18, 18, 18, 18, 20].map((w) => ({ width: w }));

  const wsDet = wb.addWorksheet('Rincian Faktur Terbuka');
  wsDet.addRow(['RINCIAN FAKTUR PIUTANG TERBUKA (AGING PENERIMAAN)']).font = { bold: true, size: 13 };
  wsDet.addRow([]);
  styleHeaderRow(wsDet.addRow(['No. Invoice', 'Jenis', 'Unit', 'Pelanggan', 'Kegiatan', 'Tgl Terbit', 'Jatuh Tempo', 'Lewat (Hari)', 'Kelompok Umur', 'Total Tagihan', 'Terbayar', 'Sisa Piutang']));
  for (const inv of params.invoices) {
    const row = wsDet.addRow([
      inv.docNumber, inv.invoiceType, inv.businessUnitCode, inv.customerName, inv.activityTitle,
      inv.issueDate, inv.dueDate, inv.daysOverdue, inv.bucketLabel, inv.totalAmount, inv.paidAmount, inv.balanceDue,
    ]);
    [10, 11, 12].forEach((c) => (row.getCell(c).numFmt = IDR_FMT));
  }
  wsDet.columns = [24, 14, 12, 30, 34, 12, 12, 12, 16, 18, 18, 18].map((w) => ({ width: w }));

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
