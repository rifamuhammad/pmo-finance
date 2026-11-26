export type PtnbhTaxScheme =
  | 'PB1_10'
  | 'PPN12_PMK131'
  | 'PPN12_PPH4_2'
  | 'PPN12_PPH23'
  | 'PPN12_PPH23_15'
  | 'PPH21_5'
  | 'BEBAS_PAJAK';

export type TaxCollectorProfile =
  | 'FP_040_UMUM'
  | 'FP_020_INSTANSI'
  | 'FP_030_BUMN'
  | 'BADAN_POTONG_PPH'
  | 'INTERNAL_UT';

export interface PtnbhTaxResult {
  taxScheme: PtnbhTaxScheme;
  taxCollectorProfile: TaxCollectorProfile;
  fakturPajakCode: string;
  taxInclusive: boolean;
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
  totalTaxAmount: number;
  ppnWithheldByCustomer: boolean;
  pphWithheldByCustomer: boolean;
  taxWithheldByCustomer: boolean;
  netReceivableAmount: number;
  // Component taxes that UT must withdraw & remit via Surat Penarikan Dana Pajak
  utRemitPpn: number;
  utRemitPph42: number;
  utRemitPph23: number;
  utRemitPph23Rate15: number;
  utRemitPph21: number;
  utRemitPb1: number;
  utRemitTotal: number;
  clauseNotes: string[];
}

export function normalizeTaxScheme(raw?: string | null): PtnbhTaxScheme {
  const val = String(raw || '').toUpperCase().trim();
  if (val === 'PB1_10' || val === 'PB1-10') return 'PB1_10';
  if (val === 'PPN12_PPH4_2' || val === 'PPN-12-PPH42') return 'PPN12_PPH4_2';
  if (val === 'PPN12_PPH23_15' || val === 'PPN-12-PPH23-15') return 'PPN12_PPH23_15';
  if (val === 'PPN12_PPH23' || val === 'PPN-12-PPH23') return 'PPN12_PPH23';
  if (val === 'PPH21_5' || val === 'PPH21') return 'PPH21_5';
  if (val === 'BEBAS_PAJAK' || val === 'BEBAS' || val === 'NON-PKP') return 'BEBAS_PAJAK';
  return 'PPN12_PMK131';
}

export function normalizeCollectorProfile(raw?: string | null): TaxCollectorProfile {
  const val = String(raw || '').toUpperCase().trim();
  if (val === 'FP_020_INSTANSI' || val === 'GOVERNMENT') return 'FP_020_INSTANSI';
  if (val === 'FP_030_BUMN' || val === 'SOE_BUMN') return 'FP_030_BUMN';
  if (val === 'BADAN_POTONG_PPH') return 'BADAN_POTONG_PPH';
  if (val === 'INTERNAL_UT') return 'INTERNAL_UT';
  return 'FP_040_UMUM';
}

/**
 * PTNBH UT Revenue Tax Engine (Verified 1-to-1 against PBI/PMO 2026 Excel formulas):
 * - PB1_10 (Kamar Wisma): DPP = 10/11 * Bruto, PB1 = round(10% * DPP)
 * - PPN12_PMK131: Nilai Jual = 100/111 * Bruto (inclusive), DPP PPN = 11/12 * Nilai Jual, PPN = round(12% * DPP PPN)
 * - PPN12_PPH4_2 (Sewa Gedung/UTCC/Ruang/Kios): PPN12_PMK131 + PPh 4(2) = round(10% * Nilai Jual)
 * - PPN12_PPH23 (Jasa TI Promise/Hosting, Pelatihan TCI, Service Charge): PPN12_PMK131 + PPh 23 = round(2% * Nilai Jual) for institutional/corporate withholders
 * - BEBAS_PAJAK (Klinik Pratama, BPJS, Mandiri Inhealth, MCU): 0 tax
 */
export function computePtnbhRevenueTax(params: {
  amountAfterDiscount: number;
  taxScheme?: string | null;
  taxInclusive?: boolean;
  taxCollectorProfile?: string | null;
  taxAlreadyProcessed?: boolean;
}): PtnbhTaxResult {
  const taxScheme = normalizeTaxScheme(params.taxScheme);
  const taxCollectorProfile = normalizeCollectorProfile(params.taxCollectorProfile);
  const taxInclusive = params.taxInclusive !== false;
  const baseInput = Math.max(0, Number(params.amountAfterDiscount) || 0);

  let brutoDocumentAmount = Math.round(baseInput);
  let nilaiJual = brutoDocumentAmount;
  let dppPb1 = 0;
  let dppPpn = 0;
  let dppPph = 0;
  let ppnAmount = 0;
  let pph42Amount = 0;
  let pph23Amount = 0;
  let pph23Rate15Amount = 0;
  let pph21Amount = 0;
  let pb1Amount = 0;

  if (taxScheme === 'BEBAS_PAJAK') {
    brutoDocumentAmount = Math.round(baseInput);
    nilaiJual = brutoDocumentAmount;
  } else if (taxScheme === 'PPH21_5') {
    brutoDocumentAmount = Math.round(baseInput);
    nilaiJual = brutoDocumentAmount;
    dppPph = brutoDocumentAmount;
    pph21Amount = Math.round(0.05 * dppPph);
  } else if (taxScheme === 'PB1_10') {
    if (taxInclusive) {
      brutoDocumentAmount = Math.round(baseInput);
      dppPb1 = Math.round((10 / 11) * brutoDocumentAmount);
      pb1Amount = Math.round(0.10 * dppPb1);
    } else {
      dppPb1 = Math.round(baseInput);
      pb1Amount = Math.round(0.10 * dppPb1);
      brutoDocumentAmount = dppPb1 + pb1Amount;
    }
    nilaiJual = dppPb1;
  } else {
    // PPN12_PMK131 | PPN12_PPH4_2 | PPN12_PPH23 | PPN12_PPH23_15
    if (taxInclusive) {
      brutoDocumentAmount = Math.round(baseInput);
      nilaiJual = Math.round((100 / 111) * brutoDocumentAmount);
      dppPpn = Math.round((11 / 12) * nilaiJual);
      ppnAmount = Math.round(0.12 * dppPpn);
    } else {
      nilaiJual = Math.round(baseInput);
      dppPpn = Math.round((11 / 12) * nilaiJual);
      ppnAmount = Math.round(0.12 * dppPpn);
      brutoDocumentAmount = nilaiJual + ppnAmount;
    }
    dppPph = nilaiJual;

    if (taxScheme === 'PPN12_PPH4_2') {
      pph42Amount = Math.round(0.10 * dppPph);
    } else if (taxScheme === 'PPN12_PPH23') {
      // Individuals (FP_040_UMUM / INTERNAL_UT) do not withhold PPh 23; institutional/corporate withholders do
      const isWithholder =
        taxCollectorProfile === 'FP_020_INSTANSI' ||
        taxCollectorProfile === 'FP_030_BUMN' ||
        taxCollectorProfile === 'BADAN_POTONG_PPH';
      pph23Amount = isWithholder ? Math.round(0.02 * dppPph) : 0;
    } else if (taxScheme === 'PPN12_PPH23_15') {
      pph23Rate15Amount = Math.round(0.15 * dppPph);
    }
  }

  let fakturPajakCode = '040';
  let ppnWithheldByCustomer = false;
  let pphWithheldByCustomer = false;

  if (taxScheme !== 'BEBAS_PAJAK' && taxScheme !== 'PB1_10' && taxScheme !== 'PPH21_5') {
    if (taxCollectorProfile === 'FP_020_INSTANSI') {
      fakturPajakCode = '020';
      ppnWithheldByCustomer = true;
      pphWithheldByCustomer = true;
    } else if (taxCollectorProfile === 'FP_030_BUMN') {
      fakturPajakCode = '030';
      ppnWithheldByCustomer = true;
      pphWithheldByCustomer = true;
    } else if (taxCollectorProfile === 'BADAN_POTONG_PPH') {
      fakturPajakCode = '040';
      ppnWithheldByCustomer = false;
      pphWithheldByCustomer = true;
    }
  }

  const netReceivableAmount = Math.max(
    0,
    brutoDocumentAmount -
      (ppnWithheldByCustomer ? ppnAmount : 0) -
      (pphWithheldByCustomer ? pph42Amount + pph23Amount + pph23Rate15Amount : 0)
  );

  const alreadyDone = Boolean(params.taxAlreadyProcessed);
  const utRemitPpn = alreadyDone || ppnWithheldByCustomer ? 0 : ppnAmount;
  const utRemitPph42 = alreadyDone || pphWithheldByCustomer ? 0 : pph42Amount;
  const utRemitPph23 = 0; // PPh 23 2% is always withheld by corporate/institutional customer when applicable
  const utRemitPph23Rate15 = alreadyDone || pphWithheldByCustomer ? 0 : pph23Rate15Amount;
  const utRemitPph21 = alreadyDone ? 0 : pph21Amount;
  const utRemitPb1 = alreadyDone ? 0 : pb1Amount;
  const utRemitTotal = utRemitPpn + utRemitPph42 + utRemitPph23 + utRemitPph23Rate15 + utRemitPph21 + utRemitPb1;

  const clauseNotes: string[] = [];
  if (taxScheme === 'BEBAS_PAJAK') {
    clauseNotes.push('Layanan kesehatan Klinik Pratama bebas pengenaan PPN sesuai ketentuan perpajakan.');
  } else if (taxScheme === 'PB1_10') {
    clauseNotes.push(
      `Harga sudah termasuk Pajak Daerah (PB1) 10% sebesar Rp ${pb1Amount.toLocaleString('id-ID')} yang disetorkan oleh UT.`
    );
  } else {
    clauseNotes.push(taxInclusive ? 'Harga sudah termasuk PPN.' : 'Harga belum termasuk PPN.');
    if (ppnWithheldByCustomer && ppnAmount > 0) {
      clauseNotes.push(
        `PPN 12% (DPP Nilai Lain 11/12) sebesar Rp ${ppnAmount.toLocaleString('id-ID')} dipungut dan disetorkan oleh PIHAK KEDUA (UT menerbitkan Faktur Pajak kode ${fakturPajakCode}).`
      );
    } else if (ppnAmount > 0) {
      clauseNotes.push(
        `PPN 12% (DPP Nilai Lain 11/12) sebesar Rp ${ppnAmount.toLocaleString('id-ID')} dibayarkan dan dilaporkan oleh PIHAK PERTAMA (UT menerbitkan Faktur Pajak kode ${fakturPajakCode}).`
      );
    }
    if (pph42Amount > 0) {
      clauseNotes.push(
        pphWithheldByCustomer
          ? `PPh Pasal 4 ayat (2) 10% sebesar Rp ${pph42Amount.toLocaleString('id-ID')} dipotong oleh PIHAK KEDUA dan wajib menyerahkan Bukti Potong kepada PIHAK PERTAMA.`
          : `PPh Pasal 4 ayat (2) 10% sebesar Rp ${pph42Amount.toLocaleString('id-ID')} disetorkan oleh PIHAK PERTAMA.`
      );
    }
    if (pph23Amount > 0) {
      clauseNotes.push(
        `PPh Pasal 23 (2%) sebesar Rp ${pph23Amount.toLocaleString('id-ID')} dipotong, dibayarkan, dan dilaporkan oleh PIHAK KEDUA dengan menyerahkan Bukti Potong kepada PIHAK PERTAMA.`
      );
    }
  }
  clauseNotes.push('Setelah melakukan pembayaran mohon menyertakan Bukti Transfer Pembayaran.');

  return {
    taxScheme,
    taxCollectorProfile,
    fakturPajakCode,
    taxInclusive,
    brutoDocumentAmount,
    nilaiJual,
    dppPb1,
    dppPpn,
    dppPph,
    ppnAmount,
    pph42Amount,
    pph23Amount,
    pph23Rate15Amount,
    pph21Amount,
    pb1Amount,
    totalTaxAmount: ppnAmount + pph42Amount + pph23Amount + pph23Rate15Amount + pph21Amount + pb1Amount,
    ppnWithheldByCustomer,
    pphWithheldByCustomer,
    taxWithheldByCustomer: ppnWithheldByCustomer || pphWithheldByCustomer,
    netReceivableAmount,
    utRemitPpn,
    utRemitPph42,
    utRemitPph23,
    utRemitPph23Rate15,
    utRemitPph21,
    utRemitPb1,
    utRemitTotal,
    clauseNotes,
  };
}

export function terbilangRupiah(angka: number): string {
  const n = Math.floor(Math.abs(Number(angka) || 0));
  if (n === 0) return 'Nol rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function spell(num: number): string {
    if (num < 12) return satuan[num];
    if (num < 20) return `${spell(num - 10)} Belas`;
    if (num < 100) return `${spell(Math.floor(num / 10))} Puluh ${spell(num % 10)}`.trim();
    if (num < 200) return `Seratus ${spell(num - 100)}`.trim();
    if (num < 1000) return `${spell(Math.floor(num / 100))} Ratus ${spell(num % 100)}`.trim();
    if (num < 2000) return `Seribu ${spell(num - 1000)}`.trim();
    if (num < 1000000) return `${spell(Math.floor(num / 1000))} Ribu ${spell(num % 1000)}`.trim();
    if (num < 1000000000) return `${spell(Math.floor(num / 1000000))} Juta ${spell(num % 1000000)}`.trim();
    if (num < 1000000000000) return `${spell(Math.floor(num / 1000000000))} Miliar ${spell(num % 1000000000)}`.trim();
    return `${spell(Math.floor(num / 1000000000000))} Triliun ${spell(num % 1000000000000)}`.trim();
  }

  return `${spell(n).replace(/\s+/g, ' ').trim()} Rupiah`;
}
