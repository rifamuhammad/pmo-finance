<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Select from 'primevue/select';
import { useAuthStore } from '../stores/auth';
import { apiFetch, downloadApiBlob, fetchApiBlob } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import CurrencyInput from '../components/CurrencyInput.vue';
import TablePagination from '../components/TablePagination.vue';
import PenerimaanPrintModal, { type PrintDocMode } from '../components/PenerimaanPrintModal.vue';

function getLocalTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalMonthIso(): string {
  return getLocalTodayIso().slice(0, 7);
}

const auth = useAuthStore();
const route = useRoute();

type MainTab = 'buku_harian' | 'invoices' | 'layanan';

const activeTab = ref<MainTab>('buku_harian');
const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

// Global filters
const selectedUnitId = ref('');
const selectedMonth = ref(getLocalMonthIso()); // YYYY-MM (local WIB)
const searchQuery = ref('');
const stageFilter = ref('');
const bhDocFilter = ref<'all' | 'KU' | 'TT' | 'DIRECT'>('all');
const bhApprovalFilter = ref<'' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'VOID'>('');
const bhReconFilter = ref<'' | 'RECONCILED' | 'UNRECONCILED'>('');
const bhProofFilter = ref<'' | 'HAS_PROOF' | 'NO_PROOF'>('');
const bhSortBy = ref<'newest' | 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('newest');
const invoiceStatusFilter = ref('');
const invSortBy = ref<'newest' | 'due_asc' | 'amount_desc' | 'balance_desc'>('newest');
const activeAgingBucket = ref<'' | 'current' | 'days31to60' | 'days61to90' | 'over90'>('');

// Approval / Reminder / Reject / Resubmit / Void Payment Modals
const approvalBusyId = ref('');
const rejectModalOpen = ref(false);
const rejectTargetType = ref<'PAYMENT' | 'INVOICE'>('PAYMENT');
const rejectTargetRow = ref<any>(null);
const rejectReason = ref('');

const resubmitModalOpen = ref(false);
const resubmitTargetType = ref<'PAYMENT' | 'INVOICE'>('PAYMENT');
const resubmitTargetRow = ref<any>(null);
const resubmitForm = ref({
  payerName: '',
  activityTitle: '',
  rincianLabel: '',
  revenueAccountCode: '',
  grossAmount: 0,
  notes: '',
});

const voidPayModalOpen = ref(false);
const selectedPaymentForVoid = ref<any>(null);
const voidPayReason = ref('');

// Review Detail Modal (lets Finance Manager inspect full tax/COA/lines/submitter before approving)
const reviewModalOpen = ref(false);
const reviewTargetType = ref<'PAYMENT' | 'INVOICE'>('PAYMENT');
const reviewTargetRow = ref<any>(null);

function openReviewModal(targetType: 'PAYMENT' | 'INVOICE', row: any) {
  reviewTargetType.value = targetType;
  reviewTargetRow.value = row;
  reviewModalOpen.value = true;
}

const pageTitle = computed(() => {
  if (activeTab.value === 'invoices') return 'Tagihan & Invoice Penerimaan';
  if (activeTab.value === 'layanan') return 'Katalog Layanan & Tarif';
  return 'Buku Harian Penerimaan';
});

const pageSubtitle = computed(() => {
  if (activeTab.value === 'invoices') {
    return 'Kelola tagihan klien, persetujuan Manajer Keuangan, cetak Invoice KU-003, dan pelunasan piutang';
  }
  if (activeTab.value === 'layanan') {
    return 'Daftar tarif layanan operasional 4 unit bisnis (MICE, Klinik, ITS, TCI) dan pemetaan akun COA resmi';
  }
  return 'Pencatatan uang masuk Kwitansi (KU-001) & Tanda Terima (KU-002), persetujuan Manajer Keuangan, serta status rekonsiliasi Bank Mandiri';
});

function applyRouteQueryFilters() {
  const qTab = typeof route.query.tab === 'string' ? route.query.tab : '';
  const qStatus = typeof route.query.status === 'string' ? route.query.status : '';
  if (qTab === 'invoices') {
    activeTab.value = 'invoices';
    if (qStatus) {
      invoiceStatusFilter.value = qStatus;
      invPage.value = 1;
    }
  } else if (qTab === 'layanan') {
    activeTab.value = 'layanan';
  } else if (qTab === 'buku_harian' || qTab === 'buku-harian') {
    activeTab.value = 'buku_harian';
    if (['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'VOID'].includes(qStatus)) {
      bhApprovalFilter.value = qStatus as any;
      bhPage.value = 1;
    }
  }
}

watch(
  () => [route.query.tab, route.query.status],
  () => {
    applyRouteQueryFilters();
  }
);

// Pagination state (shared page size, independent page index per table)
const pageSize = ref(15);
const bhPage = ref(1);
const invPage = ref(1);
const soPage = ref(1);
const prodPage = ref(1);

// Core Datasets
const businessUnits = ref<any[]>([]);
const revenueCoaList = ref<any[]>([]);
const customers = ref<any[]>([]);
const products = ref<any[]>([]);
const bankAccounts = ref<any[]>([]);
const salesOrders = ref<any[]>([]);
const customerInvoices = ref<any[]>([]);
const cashierData = ref<any>({ registers: [], sessions: [], deposits: [] });
const bukuHarianData = ref<any>(null);
const agingData = ref<any>(null);

// Print Modal
const printOpen = ref(false);
const printMode = ref<PrintDocMode>('INVOICE');
const printPayload = ref<any>(null);

// Modals
type BukuHarianEntryMode = 'KWITANSI' | 'TANDA_TERIMA' | 'INVOICE';
const entryModalOpen = ref(false);
const entryMode = ref<BukuHarianEntryMode>('KWITANSI');
const importCsvModalOpen = ref(false);
const paymentModalOpen = ref(false);
const voidModalOpen = ref(false);
const editProdModalOpen = ref(false);
const addProdModalOpen = ref(false);
const addCustModalOpen = ref(false);
const slipModalOpen = ref(false);
const openSessionModalOpen = ref(false);
const closeSessionModalOpen = ref(false);
const depositModalOpen = ref(false);

const TAX_SCHEMES = [
  { value: 'PB1_10', label: 'PB1 10% (Kamar Wisma)' },
  { value: 'PPN12_PPH4_2', label: 'PPN 12% + PPh 4(2) 10% (Gedung / UTCC)' },
  { value: 'PPN12_PMK131', label: 'PPN 12% Nilai Lain (Alat, F&B, Laundry)' },
  { value: 'PPN12_PPH23', label: 'PPN 12% + PPh 23 2% (Jasa TI / Pelatihan)' },
  { value: 'PPN12_PPH23_15', label: 'PPN 12% + PPh 23 15% (Khusus / Royalti)' },
  { value: 'PPH21_5', label: 'PPh Pasal 21 (5%)' },
  { value: 'BEBAS_PAJAK', label: 'Bebas Pajak (Klinik, BPJS, Inhealth)' },
];

const COLLECTOR_PROFILES = [
  { value: 'FP_040_UMUM', label: 'FP 040 - Umum / Pribadi (UT Setor Pajak)' },
  { value: 'FP_020_INSTANSI', label: 'FP 020 - Instansi Pemerintah / PTN (Klien Potong)' },
  { value: 'FP_030_BUMN', label: 'FP 030 - BUMN / Pemungut (Klien Potong)' },
  { value: 'BADAN_POTONG_PPH', label: 'FP 040 - Badan Hukum (Klien Potong PPh)' },
  { value: 'INTERNAL_UT', label: 'Internal Satker UT / PPK (Non-Faktur Pajak)' },
];

function formatOrgTypeLabel(orgType?: string): string {
  if (orgType === 'CORPORATE') return 'Korporasi / Swasta';
  if (orgType === 'GOVERNMENT') return 'Instansi Pemerintah / PTN';
  if (orgType === 'SOE_BUMN') return 'BUMN';
  if (orgType === 'INDIVIDUAL') return 'Perorangan / Umum';
  if (orgType === 'INTERNAL_UT') return 'Internal Satker UT';
  return orgType || 'Umum';
}

function defaultCollectorForOrgType(orgType?: string): string {
  if (orgType === 'GOVERNMENT') return 'FP_020_INSTANSI';
  if (orgType === 'SOE_BUMN') return 'FP_030_BUMN';
  if (orgType === 'CORPORATE') return 'BADAN_POTONG_PPH';
  if (orgType === 'INTERNAL_UT') return 'INTERNAL_UT';
  return 'FP_040_UMUM';
}

const INVOICE_TYPES = [
  { value: 'PELUNASAN', label: 'Pelunasan' },
  { value: 'UANG_MUKA', label: 'Uang Muka (DP / UM)' },
  { value: 'TERMIN', label: 'Termin Proyek / Kontrak' },
  { value: 'SEWA_TAMBAHAN', label: 'Sewa Tambahan' },
  { value: 'SERVICE_CHARGE', label: 'Service Charge' },
  { value: 'BERKALA', label: 'Tagihan Berkala (Sewa/Hosting/Kapitasi)' },
];

const UNIT_MEASURE_OPTIONS = [
  { value: 'Paket', label: 'Paket (borongan proyek / acara)' },
  { value: 'Hari', label: 'Hari (sewa ruang / gedung per hari)' },
  { value: 'Malam', label: 'Malam (kamar Wisma per malam)' },
  { value: 'Jam', label: 'Jam (overtime / sewa per jam)' },
  { value: 'Pax / Peserta', label: 'Pax / Peserta (pelatihan / katering / MCU)' },
  { value: 'Bulan', label: 'Bulan (kapitasi / tenant / hosting rutin)' },
  { value: 'Kunjungan', label: 'Kunjungan (layanan klinik rawat jalan)' },
  { value: 'Tindakan', label: 'Tindakan (medis / lab / gigi)' },
  { value: 'Unit / Alat', label: 'Unit / Alat (sewa perlengkapan)' },
  { value: 'Termin', label: 'Termin (pembayaran bertahap kontrak)' },
];

const UNIT_CATALOG_DEFAULTS: Record<string, { coa: string; taxScheme: string; categories: string[] }> = {
  'BU-MICE': {
    coa: '420301070200',
    taxScheme: 'PPN12_PPH4_2',
    categories: ['Sewa Gedung & Ruang', 'Kamar Wisma', 'F&B & Katering', 'Laundry', 'Sewa Alat & Fasilitas'],
  },
  'BU-KLINIK': {
    coa: '420301060100',
    taxScheme: 'BEBAS_PAJAK',
    categories: ['Rawat Jalan', 'Tindakan & Lab', 'Kapitasi & Asuransi', 'MCU & Vaksinasi'],
  },
  'BU-ITS': {
    coa: '420301040200',
    taxScheme: 'PPN12_PPH23',
    categories: ['Pengembangan & Lisensi', 'Hosting & Cloud', 'Maintenance & Support', 'Konsultansi TI'],
  },
  'BU-TCI': {
    coa: '420301010200',
    taxScheme: 'PPN12_PPH23',
    categories: ['Pelatihan & Workshop', 'Sertifikasi & Uji Kompetensi', 'Modul & Bahan Ajar'],
  },
};

// 10 COA Pendapatan Aktif RAB 2027 per Unit (sesuai COA PMO per Unit v7.xlsx)
const V7_UNIT_REVENUE_COAS: Record<string, string[]> = {
  'BU-MICE': ['420301070200', '420301070300', '420301090100'],
  'BU-KLINIK': ['420301060100', '420301060200', '420301069900'],
  'BU-ITS': ['420301040200'],
  'BU-TCI': ['420301010200', '420301030100', '420301030200'],
};

const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Transfer Bank' },
  { value: 'CASH', label: 'Tunai / Loket' },
  { value: 'QRIS_SIMULATED', label: 'QRIS' },
  { value: 'VIRTUAL_ACCOUNT_SIMULATED', label: 'Virtual Account' },
  { value: 'EDC_CARD', label: 'Kartu EDC' },
];

const modalErrorMsg = ref('');
const addCustTargetInvoice = ref(false);
const directQty = ref(1);
const directDuration = ref(1);
const directUnitPrice = ref(0);
const directDurationUnit = ref('');

const addProdNewCategory = ref('');
const addProdCustomUnit = ref('');
const editProdNewCategory = ref('');
const editProdCustomUnit = ref('');

// Payment Proof Upload & Preview State
const directProofDataUrl = ref('');
const directProofFileName = ref('');
const payProofDataUrl = ref('');
const payProofFileName = ref('');

const proofModalOpen = ref(false);
const proofModalTargetType = ref<'PAYMENT' | 'INVOICE'>('PAYMENT');
const proofModalRow = ref<any>(null);
const proofPreviewUrl = ref('');
const proofPreviewMime = ref('');
const proofPreviewFileName = ref('');
const proofLoading = ref(false);
const proofUploading = ref(false);
const standaloneProofDataUrl = ref('');
const standaloneProofFileName = ref('');

const UNIT_ORDER = ['BU-MICE', 'BU-KLINIK', 'BU-ITS', 'BU-TCI'];

const operationalUnits = computed(() =>
  businessUnits.value
    .filter((u) => UNIT_ORDER.includes(u.code))
    .sort((a, b) => UNIT_ORDER.indexOf(a.code) - UNIT_ORDER.indexOf(b.code))
);

function getCoaUnitCode(coaCode: string): string {
  if (coaCode.startsWith('42030101') || coaCode.startsWith('42030103')) return 'BU-TCI';
  if (coaCode.startsWith('42030102') || coaCode.startsWith('42030104') || coaCode.startsWith('42030105')) return 'BU-ITS';
  if (coaCode.startsWith('42030106')) return 'BU-KLINIK';
  if (coaCode.startsWith('42030107') || coaCode.startsWith('42030109')) return 'BU-MICE';
  return 'OTHER';
}

function getGroupedRevenueCoas(unitIdOrCode?: string, currentCode?: string) {
  const u = businessUnits.value.find((x) => x.id === unitIdOrCode || x.code === unitIdOrCode);
  const targetCode = u?.code || (unitIdOrCode && V7_UNIT_REVENUE_COAS[unitIdOrCode] ? unitIdOrCode : '');
  const shortName = targetCode ? targetCode.replace('BU-', '') : 'Semua Unit';
  const v7Codes = targetCode
    ? V7_UNIT_REVENUE_COAS[targetCode] || []
    : Object.values(V7_UNIT_REVENUE_COAS).flat();

  const primary = revenueCoaList.value
    .filter((c) => v7Codes.includes(String(c.code || '')))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  const primaryCodes = new Set(primary.map((c) => String(c.code || '')));
  const trimmedCurrent = String(currentCode || '').trim();
  const others: any[] = [];
  if (trimmedCurrent && !primaryCodes.has(trimmedCurrent)) {
    const legacyMatch = revenueCoaList.value.find((c) => String(c.code || '') === trimmedCurrent);
    others.push(legacyMatch || { code: trimmedCurrent, name: 'COA Eksisting Dokumen' });
  }

  return {
    unitGroupLabel: targetCode
      ? `COA Pendapatan ${shortName} (Aktif TA 2027 · v7)`
      : 'COA Pendapatan PMO (Aktif TA 2027 · v7)',
    othersGroupLabel: 'COA Eksisting Dokumen (Non-v7)',
    primary,
    others,
  };
}

const invoiceGroupedCoas = computed(() => getGroupedRevenueCoas(invoiceForm.value.businessUnitId));
const directGroupedCoas = computed(() => getGroupedRevenueCoas(directForm.value.businessUnitId));
const addProdGroupedCoas = computed(() => getGroupedRevenueCoas(addProdForm.value.businessUnitId));
const editProdGroupedCoas = computed(() =>
  getGroupedRevenueCoas(selectedProdForEdit.value?.businessUnitId, editProdForm.value.revenueAccountCode)
);
const csvGroupedCoas = computed(() => getGroupedRevenueCoas(csvForm.value.businessUnitId));
const resubmitGroupedCoas = computed(() =>
  getGroupedRevenueCoas(
    resubmitTargetRow.value?.businessUnitId || resubmitTargetRow.value?.unitCode || resubmitTargetRow.value?.businessUnit?.code,
    resubmitForm.value.revenueAccountCode
  )
);

function readFileAsProof(file: File, onLoaded: (dataUrl: string, fileName: string) => void) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    errorMsg.value = 'Format file tidak didukung. Gunakan gambar JPG, PNG, WebP, atau PDF.';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    errorMsg.value = 'Ukuran file bukti pembayaran maksimal 4 MB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      errorMsg.value = '';
      onLoaded(reader.result, file.name);
    }
  };
  reader.readAsDataURL(file);
}

function handleDirectProofChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  readFileAsProof(file, (dataUrl, name) => {
    directProofDataUrl.value = dataUrl;
    directProofFileName.value = name;
  });
}

function handlePayProofChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  readFileAsProof(file, (dataUrl, name) => {
    payProofDataUrl.value = dataUrl;
    payProofFileName.value = name;
  });
}

function handleStandaloneProofChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  readFileAsProof(file, (dataUrl, name) => {
    standaloneProofDataUrl.value = dataUrl;
    standaloneProofFileName.value = name;
  });
}

function clearProofPreviewUrl() {
  if (proofPreviewUrl.value) {
    URL.revokeObjectURL(proofPreviewUrl.value);
    proofPreviewUrl.value = '';
  }
}

async function openProofModal(row: any, targetType: 'PAYMENT' | 'INVOICE' = 'PAYMENT') {
  clearProofPreviewUrl();
  proofModalTargetType.value = targetType;
  proofModalRow.value = row;
  standaloneProofDataUrl.value = '';
  standaloneProofFileName.value = '';
  proofPreviewMime.value = '';
  proofPreviewFileName.value = '';
  proofModalOpen.value = true;

  const hasProofObj = targetType === 'INVOICE' ? row?.invoiceProof : row?.paymentProof;
  if (hasProofObj) {
    proofLoading.value = true;
    try {
      const endpoint =
        targetType === 'INVOICE'
          ? `/revenue/customer-invoices/${row.id}/proof`
          : `/revenue/payments/${row.id}/proof`;
      const { blob, contentType, fileName } = await fetchApiBlob(endpoint);
      proofPreviewUrl.value = URL.createObjectURL(blob);
      proofPreviewMime.value = contentType;
      proofPreviewFileName.value = fileName;
    } catch (err: any) {
      errorMsg.value = err.message || 'Gagal memuat file bukti dokumen.';
    } finally {
      proofLoading.value = false;
    }
  }
}

function closeProofModal() {
  proofModalOpen.value = false;
  clearProofPreviewUrl();
}

async function submitStandaloneProofUpload() {
  if (!proofModalRow.value || !standaloneProofDataUrl.value) return;
  proofUploading.value = true;
  errorMsg.value = '';
  try {
    const isInv = proofModalTargetType.value === 'INVOICE';
    const endpoint = isInv
      ? `/revenue/customer-invoices/${proofModalRow.value.id}/proof`
      : `/revenue/payments/${proofModalRow.value.id}/proof`;
    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        dataUrl: standaloneProofDataUrl.value,
        fileName: standaloneProofFileName.value,
      }),
    });
    const docCode = isInv ? proofModalRow.value.docNumber : proofModalRow.value.receiptNumber;
    feedbackMsg.value = `Bukti dokumen untuk ${docCode} berhasil disimpan.`;
    standaloneProofDataUrl.value = '';
    standaloneProofFileName.value = '';
    await loadAll();
    if (isInv) {
      const refreshed = customerInvoices.value.find((x: any) => x.id === proofModalRow.value.id);
      await openProofModal(refreshed || { ...proofModalRow.value, invoiceProof: { id: 'ok' } }, 'INVOICE');
    } else {
      const refreshed = (bukuHarianData.value?.rows || []).find((r: any) => r.id === proofModalRow.value.id);
      await openProofModal(refreshed || { ...proofModalRow.value, paymentProof: { id: 'ok' } }, 'PAYMENT');
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengunggah bukti dokumen.';
  } finally {
    proofUploading.value = false;
  }
}

function downloadActiveProof() {
  if (!proofPreviewUrl.value) return;
  const link = document.createElement('a');
  link.href = proofPreviewUrl.value;
  link.download = proofPreviewFileName.value || 'bukti-pembayaran';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const isDirectUnitKlinik = computed(() => {
  const u = businessUnits.value.find((x) => x.id === directForm.value.businessUnitId);
  return u?.code === 'BU-KLINIK';
});

const autoDocNumberHint = computed(() => {
  const now = new Date();
  const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][now.getMonth()] || 'XI';
  const yr = now.getFullYear();
  if (entryMode.value === 'INVOICE') {
    return { label: 'Nomor Invoice Resmi', sample: `Otomatis oleh sistem (cth: 001/INV/PMO-UT/${romawi}/${yr})` };
  }
  if (entryMode.value === 'TANDA_TERIMA') {
    return { label: 'Nomor Tanda Terima Resmi', sample: `Otomatis oleh sistem (cth: 001/TT/PMO-UT/${romawi}/${yr})` };
  }
  const kind = directForm.value.receiptType === 'KUITANSI_UM' ? 'KU-UM' : 'KU';
  return { label: 'Nomor Kwitansi Resmi', sample: `Otomatis oleh sistem (cth: 001/${kind}/PMO-UT/${romawi}/${yr})` };
});

const mandiriBankAccount = computed(
  () =>
    bankAccounts.value.find(
      (b) => b.domain === 'PENERIMAAN' || b.glAccountCode === '110102010100' || b.glAccountCode === '110101020100' || String(b.code || '').includes('MDR')
    ) || bankAccounts.value[0]
);

const penerimaanBankAccounts = computed(() => {
  const mandiris = bankAccounts.value.filter(
    (b) => b.domain === 'PENERIMAAN' || b.glAccountCode === '110102010100' || b.glAccountCode === '110101020100' || String(b.code || '').startsWith('BNK-MDR')
  );
  return mandiris.length ? mandiris : bankAccounts.value;
});

function pickAutoBankAccountId(_unitId: string, _hintText = ''): string {
  const found = bankAccounts.value.find((b) => b.code === 'BNK-MDR-01');
  return found?.id || mandiriBankAccount.value?.id || '';
}

const activePrintBankAccount = computed(() => {
  const payload = printPayload.value;
  if (payload?.bankAccountId) {
    const found = bankAccounts.value.find((b) => b.id === payload.bankAccountId);
    if (found) return found;
  }
  if (payload?.bankAccountCode) {
    const found = bankAccounts.value.find((b) => b.code === payload.bankAccountCode);
    if (found) return found;
  }
  return mandiriBankAccount.value;
});

// Collapsible progressive disclosure toggles (keeps main form clean & fast)
const showDirectExtraDetails = ref(false);
const showInvoiceExtraDetails = ref(false);

// Local real-time mirror of PTNBH tax engine for instant form preview
function previewTax(
  subtotal: number,
  discountPct: number,
  taxScheme: string,
  taxInclusive: boolean,
  collector: string,
  dpPercent = 0
) {
  const disc = Math.round((Math.max(0, subtotal) * Math.min(100, Math.max(0, discountPct))) / 100);
  const afterDisc = Math.max(0, Math.round(subtotal) - disc);
  const base = dpPercent > 0 && dpPercent < 100 ? Math.round((afterDisc * dpPercent) / 100) : afterDisc;
  let bruto = base;
  let nilaiJual = base;
  let dppPb1 = 0;
  let dppPpn = 0;
  let ppn = 0;
  let pph42 = 0;
  let pph23 = 0;
  let pph23Rate15 = 0;
  let pph21 = 0;
  let pb1 = 0;

  if (taxScheme === 'PPH21_5') {
    pph21 = Math.round(0.05 * base);
  } else if (taxScheme === 'PB1_10') {
    if (taxInclusive) {
      dppPb1 = Math.round((10 / 11) * base);
      pb1 = Math.round(0.1 * dppPb1);
    } else {
      dppPb1 = base;
      pb1 = Math.round(0.1 * dppPb1);
      bruto = dppPb1 + pb1;
    }
    nilaiJual = dppPb1;
  } else if (taxScheme !== 'BEBAS_PAJAK') {
    if (taxInclusive) {
      nilaiJual = Math.round((100 / 111) * base);
      dppPpn = Math.round((11 / 12) * nilaiJual);
      ppn = Math.round(0.12 * dppPpn);
    } else {
      nilaiJual = base;
      dppPpn = Math.round((11 / 12) * nilaiJual);
      ppn = Math.round(0.12 * dppPpn);
      bruto = nilaiJual + ppn;
    }
    if (taxScheme === 'PPN12_PPH4_2') pph42 = Math.round(0.1 * nilaiJual);
    if (taxScheme === 'PPN12_PPH23' && ['FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH'].includes(collector)) {
      pph23 = Math.round(0.02 * nilaiJual);
    }
    if (taxScheme === 'PPN12_PPH23_15') pph23Rate15 = Math.round(0.15 * nilaiJual);
  }

  const ppnWithheld =
    taxScheme !== 'BEBAS_PAJAK' && taxScheme !== 'PB1_10' && taxScheme !== 'PPH21_5' && ['FP_020_INSTANSI', 'FP_030_BUMN'].includes(collector);
  const pphWithheld =
    taxScheme !== 'BEBAS_PAJAK' &&
    taxScheme !== 'PB1_10' &&
    taxScheme !== 'PPH21_5' &&
    ['FP_020_INSTANSI', 'FP_030_BUMN', 'BADAN_POTONG_PPH'].includes(collector);
  const netReceivable = Math.max(0, bruto - (ppnWithheld ? ppn : 0) - (pphWithheld ? pph42 + pph23 + pph23Rate15 : 0));
  return { disc, bruto, nilaiJual, dppPb1, dppPpn, ppn, pph42, pph23, pph23Rate15, pph21, pb1, netReceivable, ppnWithheld, pphWithheld };
}

// ==================== FORMS ====================
const invoiceForm = ref({
  salesOrderId: '',
  businessUnitId: '',
  customerId: '',
  invoiceType: 'PELUNASAN',
  activityTitle: '',
  activityDate: '',
  rincianLabel: '',
  revenueAccountCode: '',
  taxScheme: 'PPN12_PPH4_2',
  taxInclusive: true,
  taxCollectorProfile: 'FP_040_UMUM',
  discountPercent: 0,
  dpPercent: 0,
  picName: '',
  subCategory: 'Umum',
  dueInDays: 14,
  bankAccountId: '',
  notes: '',
  lines: [{ productServiceId: '', description: '', quantity: 1, duration: 1, durationUnit: '', unitPrice: 0 }],
});

const invoiceTaxPreview = computed(() => {
  const sub = invoiceForm.value.lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.duration || 1) * Number(l.unitPrice || 0),
    0
  );
  const dpPct = invoiceForm.value.invoiceType === 'UANG_MUKA' ? Number(invoiceForm.value.dpPercent || 0) : 0;
  return previewTax(
    sub,
    Number(invoiceForm.value.discountPercent || 0),
    invoiceForm.value.taxScheme,
    invoiceForm.value.taxInclusive,
    invoiceForm.value.taxCollectorProfile,
    dpPct
  );
});

const directForm = ref({
  businessUnitId: '',
  productServiceId: '',
  bankAccountId: '',
  receiptType: 'LANGSUNG',
  paymentStage: 'PELUNASAN',
  paymentDate: getLocalTodayIso(),
  depositDate: getLocalTodayIso(),
  method: 'BANK_TRANSFER',
  payerName: '',
  payerTaxId: '',
  payerAddress: '',
  picName: '',
  subCategory: 'Umum',
  activityTitle: '',
  activityDate: '',
  rincianLabel: '',
  revenueAccountCode: '',
  externalInvoiceNo: '',
  taxScheme: 'PB1_10',
  taxInclusive: true,
  taxCollectorProfile: 'FP_040_UMUM',
  grossAmount: 0,
  feeAmount: 0,
  overpaymentAmount: 0,
  refundBankName: '',
  refundAccountNumber: '',
  refundAccountHolder: '',
  taxAlreadyProcessed: false,
  referenceNo: '',
  notes: '',
});

const directTaxPreview = computed(() => {
  const basis = Math.max(0, Number(directForm.value.grossAmount || 0) - Number(directForm.value.overpaymentAmount || 0));
  return previewTax(basis, 0, directForm.value.taxScheme, directForm.value.taxInclusive, directForm.value.taxCollectorProfile);
});

const csvForm = ref({
  businessUnitId: '',
  defaultTaxScheme: 'PB1_10',
  defaultRevenueAccountCode: '420301070200',
  rawContent: '',
});

const selectedInvoiceForPay = ref<any>(null);
const paymentForm = ref({
  method: 'BANK_TRANSFER',
  grossAmount: 0,
  feeAmount: 0,
  allowOverpayment: false,
  refundBankName: '',
  refundAccountNumber: '',
  refundAccountHolder: '',
  receiptType: 'KUITANSI',
  withholdingSlipNo: '',
  paymentDate: getLocalTodayIso(),
  referenceNo: '',
  idempotencyKey: '',
  bankAccountId: '',
  taxAlreadyProcessed: false,
  notes: '',
});

const selectedInvoiceForVoid = ref<any>(null);
const voidReason = ref('');

const selectedProdForEdit = ref<any>(null);
const editProdForm = ref({
  name: '',
  category: '',
  location: '',
  unit: '',
  unitPrice: 0,
  taxScheme: 'PPN12_PMK131',
  taxInclusive: true,
  revenueAccountCode: '420301070200',
  reason: '',
});

const addProdForm = ref({
  sku: '',
  name: '',
  category: '',
  location: '',
  businessUnitId: '',
  unitPrice: 0,
  unit: 'Paket',
  taxScheme: 'PPN12_PMK131',
  taxInclusive: true,
  revenueAccountCode: '420301070200',
});

const addCustForm = ref({
  name: '',
  organizationType: 'CORPORATE',
  taxCollectorProfile: 'BADAN_POTONG_PPH',
  taxIdNpwp: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
});

function handleAddCustOrgTypeChange() {
  addCustForm.value.taxCollectorProfile = defaultCollectorForOrgType(addCustForm.value.organizationType);
}

const selectedRowForSlip = ref<any>(null);
const slipForm = ref({
  withholdingSlipNo: '',
  taxAlreadyProcessed: false,
  depositDate: '',
});

const sessionOpenForm = ref({ cashRegisterId: '', openingFloat: 1000000 });
const selectedSessionForClose = ref<any>(null);
const sessionCloseForm = ref({ actualCountedCash: 0, discrepancyReason: '' });
const depositForm = ref({ cashierSessionId: '', bankAccountId: '', amount: 0, referenceNo: '', notes: '' });

// ==================== DATA LOADERS ====================
async function loadAll() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const unitQs = selectedUnitId.value ? `&businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    const bhQs = `?month=${encodeURIComponent(selectedMonth.value)}${unitQs}${stageFilter.value ? `&paymentStage=${encodeURIComponent(stageFilter.value)}` : ''}`;
    const agingQs = `?${selectedUnitId.value ? `businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : ''}`;

    const [masterRes, custRes, prodRes, bnkRes, invRes, soRes, cshRes, bhRes, agingRes] = await Promise.all([
      apiFetch('/master/overview'),
      apiFetch('/revenue/customers'),
      apiFetch('/revenue/products'),
      auth.hasPermission('reconciliation:view')
        ? apiFetch('/reconciliation/bank-accounts').catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      apiFetch(`/revenue/customer-invoices${selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : ''}`),
      apiFetch('/revenue/sales-orders'),
      auth.hasPermission('cashier:view')
        ? apiFetch('/revenue/cashier/sessions').catch(() => ({ data: { registers: [], sessions: [], deposits: [] } }))
        : Promise.resolve({ data: { registers: [], sessions: [], deposits: [] } }),
      apiFetch(`/revenue/buku-harian${bhQs}`),
      apiFetch(`/revenue/aging${agingQs}`),
    ]);

    businessUnits.value = masterRes.data.businessUnits || [];
    revenueCoaList.value = (masterRes.data.chartOfAccounts || []).filter((c: any) => String(c.code || '').startsWith('4'));
    customers.value = custRes.data || [];
    products.value = prodRes.data || [];
    bankAccounts.value = bnkRes.data?.length ? bnkRes.data : (masterRes.data.bankAccounts || []);
    customerInvoices.value = invRes.data || [];
    salesOrders.value = soRes.data || [];
    cashierData.value = cshRes.data || { registers: [], sessions: [], deposits: [] };
    bukuHarianData.value = bhRes.data;
    agingData.value = agingRes.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data modul Penerimaan.';
  } finally {
    loading.value = false;
  }
}

watch([selectedUnitId, selectedMonth, stageFilter], () => {
  loadAll();
});

// ==================== COMPUTED FILTERS ====================
const filteredBukuHarian = computed(() => {
  const rows = bukuHarianData.value?.rows || [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r: any) =>
    `${r.receiptNumber} ${r.invoiceDocNumber} ${r.payerName} ${r.activityTitle} ${r.rincianLabel} ${r.revenueAccountCode}`
      .toLowerCase()
      .includes(q)
  );
});

const kwitansiRows = computed(() =>
  filteredBukuHarian.value.filter((r: any) => r.receiptType === 'KUITANSI' || r.receiptType === 'KUITANSI_UM' || !r.receiptType)
);

const tandaTerimaRows = computed(() =>
  filteredBukuHarian.value.filter((r: any) => r.receiptType === 'TANDA_TERIMA')
);

const cashInRows = computed(() =>
  filteredBukuHarian.value.map((r: any) => ({
    uid: `REC-${r.id}`,
    sortDate: r.paymentDate || '',
    createdAtMs: new Date(r.createdAt || r.paymentDate || 0).getTime(),
    dateDisplay: r.paymentDate,
    primaryDocNo: r.receiptNumber,
    invoiceDocNo: r.invoiceDocNumber || '',
    stageLabel: r.paymentStage || 'PELUNASAN',
    payerName: r.payerName,
    unitCode: r.businessUnitCode,
    activityTitle: r.activityTitle,
    rincianLabel: r.rincianLabel,
    coaCode: r.revenueAccountCode,
    amount: Number(r.bankReceivedAmount || 0),
    overpaymentAmount: Number(r.overpaymentAmount || 0),
    isReconciled: Boolean(r.isReconciled),
    reconciledImportNumber: r.reconciledImportNumber,
    taxScheme: r.taxScheme,
    receiptType: r.receiptType || 'KUITANSI',
    customerInvoiceId: r.customerInvoiceId,
    method: r.method,
    status: r.status || 'CONFIRMED',
    approvalStatus: r.approvalStatus || 'APPROVED',
    approvedByName: r.approvedByName || null,
    approvedAt: r.approvedAt || null,
    rejectionReason: r.rejectionReason || null,
    lastRemindedAt: r.lastRemindedAt || null,
    reminderCount: Number(r.reminderCount || 0),
    voidReason: r.voidReason || null,
    hasProof: Boolean(r.paymentProof),
    raw: r,
  }))
);

const cashInCounts = computed(() => {
  const all = cashInRows.value.length;
  const kwitansi = cashInRows.value.filter((e: any) => e.receiptType === 'KUITANSI' || e.receiptType === 'KUITANSI_UM').length;
  const tandaTerima = cashInRows.value.filter((e: any) => e.receiptType === 'TANDA_TERIMA').length;
  const langsung = cashInRows.value.filter((e: any) => e.receiptType === 'LANGSUNG').length;
  const pendingApproval = cashInRows.value.filter((e: any) => e.status !== 'VOID' && e.approvalStatus === 'PENDING_APPROVAL').length;
  const rejected = cashInRows.value.filter((e: any) => e.status !== 'VOID' && e.approvalStatus === 'REJECTED').length;
  const approved = cashInRows.value.filter((e: any) => e.status === 'CONFIRMED' && e.approvalStatus === 'APPROVED').length;
  return { all, kwitansi, tandaTerima, langsung, pendingApproval, rejected, approved };
});

const invPendingApprovalCount = computed(
  () => customerInvoices.value.filter((inv) => inv.status !== 'VOID' && inv.approvalStatus === 'PENDING_APPROVAL').length
);
const invRejectedCount = computed(
  () => customerInvoices.value.filter((inv) => inv.status !== 'VOID' && inv.approvalStatus === 'REJECTED').length
);
const invOpenCount = computed(
  () => customerInvoices.value.filter((inv) => ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)).length
);
const invPaidCount = computed(
  () => customerInvoices.value.filter((inv) => inv.status === 'PAID').length
);
const invVoidCount = computed(
  () => customerInvoices.value.filter((inv) => inv.status === 'VOID').length
);
const invApprovedCount = computed(
  () => customerInvoices.value.filter((inv) => inv.status !== 'VOID' && inv.approvalStatus === 'APPROVED').length
);
const totalPendingApprovals = computed(() => cashInCounts.value.pendingApproval + invPendingApprovalCount.value);
const totalApprovedDocs = computed(() => cashInCounts.value.approved + invApprovedCount.value);

const visibleBukuHarian = computed(() => {
  let list = cashInRows.value;
  if (bhDocFilter.value === 'KU') {
    list = list.filter((e: any) => e.receiptType === 'KUITANSI' || e.receiptType === 'KUITANSI_UM');
  } else if (bhDocFilter.value === 'TT') {
    list = list.filter((e: any) => e.receiptType === 'TANDA_TERIMA');
  } else if (bhDocFilter.value === 'DIRECT') {
    list = list.filter((e: any) => e.receiptType === 'LANGSUNG');
  }

  if (bhApprovalFilter.value === 'VOID') {
    list = list.filter((e: any) => e.status === 'VOID');
  } else if (bhApprovalFilter.value) {
    list = list.filter((e: any) => e.status !== 'VOID' && e.approvalStatus === bhApprovalFilter.value);
  }

  if (bhReconFilter.value === 'RECONCILED') {
    list = list.filter((e: any) => e.isReconciled);
  } else if (bhReconFilter.value === 'UNRECONCILED') {
    list = list.filter((e: any) => !e.isReconciled);
  }

  if (bhProofFilter.value === 'HAS_PROOF') {
    list = list.filter((e: any) => e.hasProof);
  } else if (bhProofFilter.value === 'NO_PROOF') {
    list = list.filter((e: any) => !e.hasProof);
  }

  const sorted = [...list];
  if (bhSortBy.value === 'newest') {
    sorted.sort((a: any, b: any) => b.createdAtMs - a.createdAtMs || (b.sortDate || '').localeCompare(a.sortDate || ''));
  } else if (bhSortBy.value === 'date_desc') {
    sorted.sort((a: any, b: any) => (b.sortDate || '').localeCompare(a.sortDate || '') || b.createdAtMs - a.createdAtMs);
  } else if (bhSortBy.value === 'date_asc') {
    sorted.sort((a: any, b: any) => (a.sortDate || '').localeCompare(b.sortDate || '') || a.createdAtMs - b.createdAtMs);
  } else if (bhSortBy.value === 'amount_desc') {
    sorted.sort((a: any, b: any) => b.amount - a.amount || b.createdAtMs - a.createdAtMs);
  } else if (bhSortBy.value === 'amount_asc') {
    sorted.sort((a: any, b: any) => a.amount - b.amount || b.createdAtMs - a.createdAtMs);
  }
  return sorted;
});

const bhFilteredSummary = computed(() => {
  let cashIn = 0;
  for (const e of visibleBukuHarian.value) {
    if (e.status === 'CONFIRMED' && e.approvalStatus === 'APPROVED') {
      cashIn += Number(e.amount || 0);
    }
  }
  return { count: visibleBukuHarian.value.length, cashIn };
});

const hasActiveBhFilters = computed(
  () =>
    bhDocFilter.value !== 'all' ||
    bhApprovalFilter.value !== '' ||
    bhReconFilter.value !== '' ||
    bhProofFilter.value !== '' ||
    stageFilter.value !== '' ||
    searchQuery.value.trim() !== '' ||
    bhSortBy.value !== 'newest'
);

function resetBhFilters() {
  bhDocFilter.value = 'all';
  bhApprovalFilter.value = '';
  bhReconFilter.value = '';
  bhProofFilter.value = '';
  stageFilter.value = '';
  searchQuery.value = '';
  bhSortBy.value = 'newest';
  bhPage.value = 1;
}

const filteredInvoices = computed(() => {
  const nowMs = Date.now();
  const q = searchQuery.value.trim().toLowerCase();
  const list = customerInvoices.value.filter((inv) => {
    if (invoiceStatusFilter.value === 'PENDING_APPROVAL' && (inv.status === 'VOID' || inv.approvalStatus !== 'PENDING_APPROVAL')) return false;
    if (invoiceStatusFilter.value === 'REJECTED' && (inv.status === 'VOID' || inv.approvalStatus !== 'REJECTED')) return false;
    if (invoiceStatusFilter.value === 'OPEN' && !['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) return false;
    if (invoiceStatusFilter.value === 'ISSUED' && inv.status !== 'ISSUED') return false;
    if (invoiceStatusFilter.value === 'PARTIALLY_PAID' && inv.status !== 'PARTIALLY_PAID') return false;
    if (invoiceStatusFilter.value === 'PAID' && inv.status !== 'PAID') return false;
    if (invoiceStatusFilter.value === 'VOID' && inv.status !== 'VOID') return false;

    if (activeAgingBucket.value) {
      if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status) || Number(inv.balanceDue) <= 0) return false;
      const days = Math.floor((nowMs - new Date(inv.dueDate).getTime()) / 86400000);
      if (activeAgingBucket.value === 'current' && days > 30) return false;
      if (activeAgingBucket.value === 'days31to60' && (days <= 30 || days > 60)) return false;
      if (activeAgingBucket.value === 'days61to90' && (days <= 60 || days > 90)) return false;
      if (activeAgingBucket.value === 'over90' && days <= 90) return false;
    }

    if (q) {
      const hay = `${inv.docNumber} ${inv.customer?.name || ''} ${inv.activityTitle || ''} ${inv.rincianLabel || ''} ${inv.businessUnit?.code || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...list];
  if (invSortBy.value === 'newest') {
    sorted.sort((a, b) => new Date(b.createdAt || b.issueDate || 0).getTime() - new Date(a.createdAt || a.issueDate || 0).getTime());
  } else if (invSortBy.value === 'due_asc') {
    sorted.sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime());
  } else if (invSortBy.value === 'amount_desc') {
    sorted.sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0));
  } else if (invSortBy.value === 'balance_desc') {
    sorted.sort((a, b) => Number(b.balanceDue || 0) - Number(a.balanceDue || 0));
  }
  return sorted;
});

const invFilteredSummary = computed(() => {
  let totalNet = 0;
  let totalOpen = 0;
  for (const inv of filteredInvoices.value) {
    if (inv.status !== 'VOID') {
      totalNet += Number(inv.totalAmount || 0);
      if (['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) {
        totalOpen += Number(inv.balanceDue || 0);
      }
    }
  }
  return { count: filteredInvoices.value.length, totalNet, totalOpen };
});

const hasActiveInvFilters = computed(
  () =>
    invoiceStatusFilter.value !== '' ||
    activeAgingBucket.value !== '' ||
    searchQuery.value.trim() !== '' ||
    invSortBy.value !== 'newest'
);

function resetInvFilters() {
  invoiceStatusFilter.value = '';
  activeAgingBucket.value = '';
  searchQuery.value = '';
  invSortBy.value = 'newest';
  invPage.value = 1;
}

const filteredSalesOrders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return salesOrders.value.filter((so) => {
    if (selectedUnitId.value && so.businessUnitId !== selectedUnitId.value) return false;
    if (!q) return true;
    return `${so.docNumber} ${so.customer?.name || ''} ${so.businessUnit?.code || ''}`.toLowerCase().includes(q);
  });
});

// Paginated Slices
const paginatedBukuHarian = computed(() => {
  const start = (bhPage.value - 1) * pageSize.value;
  return visibleBukuHarian.value.slice(start, start + pageSize.value);
});

const paginatedInvoices = computed(() => {
  const start = (invPage.value - 1) * pageSize.value;
  return filteredInvoices.value.slice(start, start + pageSize.value);
});

const paginatedSalesOrders = computed(() => {
  const start = (soPage.value - 1) * pageSize.value;
  return filteredSalesOrders.value.slice(start, start + pageSize.value);
});

const paginatedProducts = computed(() => {
  const start = (prodPage.value - 1) * pageSize.value;
  return filteredProducts.value.slice(start, start + pageSize.value);
});

watch(
  [selectedUnitId, selectedMonth, searchQuery, stageFilter, bhDocFilter, bhReconFilter, bhProofFilter, bhSortBy, pageSize],
  () => {
    bhPage.value = 1;
    prodPage.value = 1;
  }
);

watch([invoiceStatusFilter, invSortBy, activeAgingBucket, searchQuery, selectedUnitId, pageSize], () => {
  invPage.value = 1;
  soPage.value = 1;
});

const filteredProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return products.value.filter((p) => {
    if (selectedUnitId.value && p.businessUnitId !== selectedUnitId.value) return false;
    if (!q) return true;
    return `${p.sku} ${p.name} ${p.category} ${p.location || ''} ${p.revenueAccountCode}`.toLowerCase().includes(q);
  });
});

const invoiceCatalogOptions = computed(() =>
  products.value
    .filter((p) => !invoiceForm.value.businessUnitId || p.businessUnitId === invoiceForm.value.businessUnitId)
    .map((p) => ({
      ...p,
      optionLabel: `${p.name} · ${formatRupiah(p.unitPrice)} / ${p.unit}`,
    }))
);

const directCatalogOptions = computed(() =>
  products.value
    .filter((p) => !directForm.value.businessUnitId || p.businessUnitId === directForm.value.businessUnitId)
    .map((p) => ({
      ...p,
      optionLabel: `${p.name} · ${formatRupiah(p.unitPrice)} / ${p.unit}`,
    }))
);

function handleDirectUnitChange() {
  directForm.value.productServiceId = '';
  directQty.value = 1;
  directDuration.value = 1;
  directUnitPrice.value = 0;
  directDurationUnit.value = '';
  const u = businessUnits.value.find((x) => x.id === directForm.value.businessUnitId);
  const def = UNIT_CATALOG_DEFAULTS[u?.code || ''];
  if (def) {
    directForm.value.revenueAccountCode = def.coa;
    directForm.value.taxScheme =
      entryMode.value === 'TANDA_TERIMA' && u?.code === 'BU-MICE' ? 'PB1_10' : def.taxScheme;
  }
  directForm.value.bankAccountId = pickAutoBankAccountId(directForm.value.businessUnitId, directForm.value.rincianLabel);
  if (u?.code !== 'BU-KLINIK') {
    directForm.value.externalInvoiceNo = '';
  }
}

function handleInvoiceUnitChange() {
  const u = businessUnits.value.find((x) => x.id === invoiceForm.value.businessUnitId);
  const def = UNIT_CATALOG_DEFAULTS[u?.code || ''];
  if (def) {
    invoiceForm.value.revenueAccountCode = def.coa;
    invoiceForm.value.taxScheme = def.taxScheme;
  }
  // Clear catalog selections belonging to another unit
  for (const line of invoiceForm.value.lines) {
    if (line.productServiceId) {
      const p = products.value.find((x) => x.id === line.productServiceId);
      if (p && p.businessUnitId !== invoiceForm.value.businessUnitId) {
        line.productServiceId = '';
      }
    }
  }
  invoiceForm.value.bankAccountId = pickAutoBankAccountId(invoiceForm.value.businessUnitId, invoiceForm.value.rincianLabel);
}

function handleDirectReceiptTypeChange() {
  if (directForm.value.receiptType === 'KUITANSI_UM') {
    directForm.value.paymentStage = 'UANG_MUKA';
  } else if (directForm.value.receiptType === 'KUITANSI' && directForm.value.paymentStage === 'UANG_MUKA') {
    directForm.value.paymentStage = 'PELUNASAN';
  }
}

function applyDirectQtyCalc() {
  if (Number(directUnitPrice.value) > 0) {
    const qty = Math.max(0.5, Number(directQty.value) || 1);
    const dur = Math.max(0.5, Number(directDuration.value) || 1);
    directForm.value.grossAmount = Math.round(qty * dur * Number(directUnitPrice.value));
  }
}

function handleDirectPayerInput() {
  const q = directForm.value.payerName.trim().toLowerCase();
  if (!q) return;
  const matched = customers.value.find((c) => String(c.name || '').trim().toLowerCase() === q);
  if (matched) {
    if (!directForm.value.payerTaxId && matched.taxIdNpwp) directForm.value.payerTaxId = matched.taxIdNpwp;
    if (!directForm.value.payerAddress && matched.address) directForm.value.payerAddress = matched.address;
    if (matched.taxCollectorProfile && entryMode.value !== 'TANDA_TERIMA') {
      directForm.value.taxCollectorProfile = matched.taxCollectorProfile;
      directForm.value.subCategory = matched.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum';
    }
  }
}

function openQuickAddCustomerForInvoice() {
  addCustTargetInvoice.value = true;
  addCustModalOpen.value = true;
}

function getDaysOverdue(inv: any): number {
  if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status) || Number(inv.balanceDue) <= 0) return 0;
  return Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
}

// ==================== ACTION HANDLERS ====================
function resetInvoiceForm(fromOrder?: any) {
  const defaultUnitId = fromOrder?.businessUnitId || selectedUnitId.value || operationalUnits.value[0]?.id || '';
  const unitObj = businessUnits.value.find((u) => u.id === defaultUnitId);
  const unitDef = UNIT_CATALOG_DEFAULTS[unitObj?.code || ''] || UNIT_CATALOG_DEFAULTS['BU-MICE'];
  const defaultCustId = fromOrder?.customerId || customers.value[0]?.id || '';
  const cust = customers.value.find((c) => c.id === defaultCustId);
  showInvoiceExtraDetails.value = false;
  invoiceForm.value = {
    salesOrderId: fromOrder?.id || '',
    businessUnitId: defaultUnitId,
    customerId: defaultCustId,
    invoiceType: fromOrder ? 'TERMIN' : 'PELUNASAN',
    activityTitle: fromOrder?.activityTitle || fromOrder?.notes || '',
    activityDate: fromOrder?.activityDate || '',
    rincianLabel: '',
    revenueAccountCode: unitDef.coa,
    taxScheme: unitDef.taxScheme,
    taxInclusive: true,
    taxCollectorProfile: cust?.taxCollectorProfile || 'FP_040_UMUM',
    discountPercent: 0,
    dpPercent: 0,
    picName: '',
    subCategory: cust?.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum',
    dueInDays: 14,
    bankAccountId: pickAutoBankAccountId(defaultUnitId, fromOrder?.activityTitle || ''),
    notes: '',
    lines: [{ productServiceId: '', description: '', quantity: 1, duration: 1, durationUnit: '', unitPrice: 0 }],
  };
}

function resetDirectForm(
  presetType: 'LANGSUNG' | 'KUITANSI' | 'KUITANSI_UM' | 'TANDA_TERIMA' = 'KUITANSI',
  presetStage: 'PELUNASAN' | 'UANG_MUKA' | 'TERMIN' = 'PELUNASAN'
) {
  const defaultUnitId = selectedUnitId.value || operationalUnits.value[0]?.id || '';
  const unitObj = businessUnits.value.find((u) => u.id === defaultUnitId);
  const unitDef = UNIT_CATALOG_DEFAULTS[unitObj?.code || ''] || UNIT_CATALOG_DEFAULTS['BU-MICE'];
  showDirectExtraDetails.value = false;
  directQty.value = 1;
  directDuration.value = 1;
  directUnitPrice.value = 0;
  directDurationUnit.value = '';
  directForm.value = {
    businessUnitId: defaultUnitId,
    productServiceId: '',
    bankAccountId: pickAutoBankAccountId(defaultUnitId),
    receiptType: presetType,
    paymentStage: presetType === 'KUITANSI_UM' ? 'UANG_MUKA' : presetStage,
    paymentDate: getLocalTodayIso(),
    depositDate: getLocalTodayIso(),
    method: 'BANK_TRANSFER',
    payerName: '',
    payerTaxId: '',
    payerAddress: '',
    picName: '',
    subCategory: presetType === 'TANDA_TERIMA' ? 'Internal UT' : 'Umum',
    activityTitle: '',
    activityDate: '',
    rincianLabel: '',
    revenueAccountCode: unitDef.coa,
    externalInvoiceNo: '',
    taxScheme: presetType === 'TANDA_TERIMA' && unitObj?.code === 'BU-MICE' ? 'PB1_10' : unitDef.taxScheme,
    taxInclusive: true,
    taxCollectorProfile: presetType === 'TANDA_TERIMA' ? 'INTERNAL_UT' : 'FP_040_UMUM',
    grossAmount: 0,
    feeAmount: 0,
    overpaymentAmount: 0,
    refundBankName: '',
    refundAccountNumber: '',
    refundAccountHolder: '',
    taxAlreadyProcessed: false,
    referenceNo: `TRF-${Date.now().toString().slice(-6)}`,
    notes: '',
  };
}

function openBukuHarianModal(
  mode: BukuHarianEntryMode = 'KWITANSI',
  opts?: { fromOrder?: any; receiptType?: 'LANGSUNG' | 'KUITANSI' | 'KUITANSI_UM' | 'TANDA_TERIMA'; stage?: 'PELUNASAN' | 'UANG_MUKA' | 'TERMIN' }
) {
  modalErrorMsg.value = '';
  entryMode.value = mode;
  resetInvoiceForm(opts?.fromOrder);
  const recType = opts?.receiptType || (mode === 'TANDA_TERIMA' ? 'TANDA_TERIMA' : 'KUITANSI');
  resetDirectForm(recType, opts?.stage || (recType === 'KUITANSI_UM' ? 'UANG_MUKA' : 'PELUNASAN'));
  directProofDataUrl.value = '';
  directProofFileName.value = '';
  entryModalOpen.value = true;
}

function switchEntryMode(mode: BukuHarianEntryMode) {
  modalErrorMsg.value = '';
  entryMode.value = mode;
  const u = businessUnits.value.find((x) => x.id === directForm.value.businessUnitId);
  const def = UNIT_CATALOG_DEFAULTS[u?.code || ''] || UNIT_CATALOG_DEFAULTS['BU-MICE'];
  if (mode === 'TANDA_TERIMA') {
    directForm.value.receiptType = 'TANDA_TERIMA';
    directForm.value.taxScheme = u?.code === 'BU-MICE' ? 'PB1_10' : def.taxScheme;
    directForm.value.taxCollectorProfile = 'INTERNAL_UT';
    directForm.value.subCategory = 'Internal UT';
    if (!directForm.value.revenueAccountCode) directForm.value.revenueAccountCode = def.coa;
  } else if (mode === 'KWITANSI') {
    if (directForm.value.receiptType === 'TANDA_TERIMA') {
      directForm.value.receiptType = 'KUITANSI';
    }
    directForm.value.taxCollectorProfile = 'FP_040_UMUM';
    directForm.value.subCategory = 'Umum';
    if (!directForm.value.productServiceId) {
      directForm.value.taxScheme = def.taxScheme;
      directForm.value.revenueAccountCode = def.coa;
    }
  }
}

function openCreateInvoice(fromOrder?: any) {
  openBukuHarianModal('INVOICE', { fromOrder });
}

function handleInvoiceCustomerChange() {
  const c = customers.value.find((x) => x.id === invoiceForm.value.customerId);
  if (c?.taxCollectorProfile) {
    invoiceForm.value.taxCollectorProfile = c.taxCollectorProfile;
    invoiceForm.value.subCategory = c.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum';
  }
}

function handleDirectCollectorChange() {
  directForm.value.subCategory = directForm.value.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum';
}

function handleInvoiceCollectorChange() {
  invoiceForm.value.subCategory = invoiceForm.value.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum';
}

function handleInvoiceLineProductChange(idx: number, selectedId?: string | null) {
  const line = invoiceForm.value.lines[idx];
  const targetId = selectedId !== undefined ? selectedId : line.productServiceId;
  const p = products.value.find((x) => x.id === targetId);
  if (!p) return;
  line.description = p.name;
  line.unitPrice = Number(p.unitPrice);
  line.durationUnit = p.unit || '';
  if (idx === 0) {
    invoiceForm.value.rincianLabel = p.location || p.category;
    invoiceForm.value.revenueAccountCode = p.revenueAccountCode;
    invoiceForm.value.taxScheme = p.taxScheme || 'PPN12_PMK131';
    invoiceForm.value.taxInclusive = p.taxInclusive !== false;
    invoiceForm.value.bankAccountId = pickAutoBankAccountId(invoiceForm.value.businessUnitId, `${p.name} ${p.category} ${p.location || ''}`);
    if (!invoiceForm.value.activityTitle) {
      invoiceForm.value.activityTitle = p.name;
    }
  }
}

function addInvoiceLine() {
  invoiceForm.value.lines.push({ productServiceId: '', description: '', quantity: 1, duration: 1, durationUnit: '', unitPrice: 0 });
}

function removeInvoiceLine(idx: number) {
  if (invoiceForm.value.lines.length > 1) invoiceForm.value.lines.splice(idx, 1);
}

async function submitCreateInvoice() {
  modalErrorMsg.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/revenue/invoices', {
      method: 'POST',
      body: JSON.stringify({
        ...invoiceForm.value,
        dpPercent: invoiceForm.value.invoiceType === 'UANG_MUKA' ? Number(invoiceForm.value.dpPercent || 0) : 0,
        salesOrderId: invoiceForm.value.salesOrderId || null,
        bankAccountId: invoiceForm.value.bankAccountId || null,
        lines: invoiceForm.value.lines.map((l) => ({
          productServiceId: l.productServiceId || null,
          description: l.description,
          quantity: Number(l.quantity),
          duration: Number(l.duration || 1),
          durationUnit: l.durationUnit || null,
          unitPrice: Number(l.unitPrice),
        })),
      }),
    });
    entryModalOpen.value = false;
    activeTab.value = 'invoices';
    invoiceStatusFilter.value = '';
    activeAgingBucket.value = '';
    invSortBy.value = 'newest';
    invPage.value = 1;
    feedbackMsg.value = `Invoice ${res.data.docNumber} diajukan & notifikasi terkirim ke Manajer Keuangan. Tombol Cetak aktif setelah disetujui.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal menerbitkan invoice.';
  }
}

function openDirectReceiptModal(
  presetType: 'LANGSUNG' | 'KUITANSI' | 'KUITANSI_UM' | 'TANDA_TERIMA' = 'KUITANSI',
  presetStage: 'PELUNASAN' | 'UANG_MUKA' | 'TERMIN' = 'PELUNASAN'
) {
  openBukuHarianModal(presetType === 'TANDA_TERIMA' ? 'TANDA_TERIMA' : 'KWITANSI', {
    receiptType: presetType,
    stage: presetStage,
  });
}

function handleDirectProductChange(selectedId?: string | null) {
  const targetId = selectedId !== undefined ? selectedId : directForm.value.productServiceId;
  const p = products.value.find((x) => x.id === targetId);
  if (!p) {
    directUnitPrice.value = 0;
    directDurationUnit.value = '';
    return;
  }
  directForm.value.rincianLabel = p.location || p.category;
  directForm.value.revenueAccountCode = p.revenueAccountCode;
  directForm.value.taxScheme = p.taxScheme || 'PPN12_PMK131';
  directForm.value.taxInclusive = p.taxInclusive !== false;
  directForm.value.bankAccountId = pickAutoBankAccountId(directForm.value.businessUnitId, `${p.name} ${p.category} ${p.location || ''}`);
  directQty.value = 1;
  directDuration.value = 1;
  directUnitPrice.value = Number(p.unitPrice) || 0;
  directDurationUnit.value = p.unit || '';
  if (directUnitPrice.value > 0) {
    directForm.value.grossAmount = directUnitPrice.value;
  }
  directForm.value.activityTitle = p.name;
}

async function submitDirectReceipt() {
  modalErrorMsg.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const receiptTypeFinal = entryMode.value === 'TANDA_TERIMA' ? 'TANDA_TERIMA' : directForm.value.receiptType;
    const stageFinal = receiptTypeFinal === 'KUITANSI_UM' ? 'UANG_MUKA' : directForm.value.paymentStage;
    const res = await apiFetch('/revenue/direct-receipts', {
      method: 'POST',
      body: JSON.stringify({
        ...directForm.value,
        referenceNo: directForm.value.referenceNo?.trim() || `TRF-${Date.now().toString().slice(-6)}`,
        receiptType: receiptTypeFinal,
        paymentStage: stageFinal,
        bankAccountId: directForm.value.method === 'CASH' ? null : directForm.value.bankAccountId || null,
        productServiceId: directForm.value.productServiceId || null,
        grossAmount: Number(directForm.value.grossAmount),
        feeAmount: Number(directForm.value.feeAmount || 0),
        overpaymentAmount: Number(directForm.value.overpaymentAmount || 0),
        proofImageDataUrl: directProofDataUrl.value || null,
        proofFileName: directProofFileName.value || null,
      }),
    });
    const savedMonth = String(directForm.value.paymentDate || '').slice(0, 7);
    entryModalOpen.value = false;
    directProofDataUrl.value = '';
    directProofFileName.value = '';
    activeTab.value = 'buku_harian';
    bhDocFilter.value = 'all';
    bhReconFilter.value = '';
    bhProofFilter.value = '';
    bhSortBy.value = 'newest';
    bhPage.value = 1;
    if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth) && savedMonth !== selectedMonth.value) {
      selectedMonth.value = savedMonth;
    }
    feedbackMsg.value = `Dokumen ${res.data.receiptNumber} diajukan & notifikasi terkirim ke Manajer Keuangan. Tombol Cetak aktif setelah disetujui.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal mencatat penerimaan langsung.';
  }
}

function handleCsvUnitChange() {
  const u = businessUnits.value.find((x) => x.id === csvForm.value.businessUnitId);
  const defs = u ? UNIT_CATALOG_DEFAULTS[u.code] : null;
  if (defs) {
    csvForm.value.defaultRevenueAccountCode = defs.coa;
    csvForm.value.defaultTaxScheme = defs.taxScheme;
  }
}

function openImportCsvModal() {
  const defaultUnitId = selectedUnitId.value || operationalUnits.value[0]?.id || '';
  const u = businessUnits.value.find((x) => x.id === defaultUnitId);
  const defs = (u && UNIT_CATALOG_DEFAULTS[u.code]) || UNIT_CATALOG_DEFAULTS['BU-MICE'];
  csvForm.value = {
    businessUnitId: defaultUnitId,
    defaultTaxScheme: defs.taxScheme,
    defaultRevenueAccountCode: defs.coa,
    rawContent: '',
  };
  importCsvModalOpen.value = true;
}

function loadSampleDirectCsv() {
  const today = getLocalTodayIso();
  const u = businessUnits.value.find((x) => x.id === csvForm.value.businessUnitId);
  const unitCode = u?.code || 'BU-MICE';
  const header = 'Tanggal,Nama,Kegiatan,Rincian,Nominal,COA,SkemaPajak,NoInvEksternal';
  if (unitCode === 'BU-KLINIK') {
    csvForm.value.rawContent = `${header}
${today},Pasien Rawat Jalan (Budi Santoso),Pemeriksaan Poli Umum Harian,Poli Umum,150000,420301060100,BEBAS_PAJAK,INV-KL-001
${today},Mandiri Inhealth,Kapitasi Klinik Inhouse Mandiri Inhealth,Kapitasi Inhealth,22500000,420301069900,BEBAS_PAJAK,`;
  } else if (unitCode === 'BU-ITS') {
    csvForm.value.rawContent = `${header}
${today},PT Mitra Solusi Nusantara,Pemeliharaan Sistem Informasi Bulanan,Maintenance & Support,7500000,420301040200,PPN12_PPH23,`;
  } else if (unitCode === 'BU-TCI') {
    csvForm.value.rawContent = `${header}
${today},BPSDM Daerah,Workshop Pengembangan Kompetensi Batch 1,Pelatihan & Workshop,12000000,420301010200,PPN12_PPH23,
${today},Peserta Sertifikasi Umum,Uji Kompetensi Nasional,Sertifikasi,2500000,420301030100,PPN12_PPH23,`;
  } else {
    csvForm.value.rawContent = `${header}
${today},Tamu Wisma (Dodi Permadi),Kegiatan Tamu Umum Wisma,Kamar Wisma,550000,420301070200,PB1_10,
${today},Ibu Della - Rektorat,Kegiatan Green Laundry Umum,Green Laundry,45000,420301090100,PPN12_PMK131,`;
  }
}

async function handleCsvFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  csvForm.value.rawContent = await file.text();
}

async function submitImportCsv() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/revenue/direct-receipts/import-csv', {
      method: 'POST',
      body: JSON.stringify(csvForm.value),
    });
    importCsvModalOpen.value = false;
    feedbackMsg.value = `${res.data.importedCount} baris penerimaan berhasil diimpor ke Buku Harian.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengimpor CSV Buku Harian.';
  }
}

function openPayModal(inv: any) {
  selectedInvoiceForPay.value = inv;
  const inferredReceipt =
    inv.invoiceType === 'UANG_MUKA'
      ? 'KUITANSI_UM'
      : inv.taxCollectorProfile === 'INTERNAL_UT'
      ? 'TANDA_TERIMA'
      : 'KUITANSI';
  paymentForm.value = {
    method: 'BANK_TRANSFER',
    grossAmount: Number(inv.balanceDue),
    feeAmount: 0,
    allowOverpayment: false,
    refundBankName: '',
    refundAccountNumber: '',
    refundAccountHolder: '',
    receiptType: inferredReceipt,
    withholdingSlipNo: '',
    paymentDate: getLocalTodayIso(),
    referenceNo: `TRF-${Date.now().toString().slice(-6)}`,
    idempotencyKey: `PAY-${inv.docNumber}-${Date.now()}`,
    bankAccountId: inv.bankAccountId || pickAutoBankAccountId(inv.businessUnitId, inv.rincianLabel || inv.activityTitle || ''),
    taxAlreadyProcessed: false,
    notes: '',
  };
  payProofDataUrl.value = '';
  payProofFileName.value = '';
  paymentModalOpen.value = true;
}

async function submitPayment() {
  if (!selectedInvoiceForPay.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/revenue/payments', {
      method: 'POST',
      body: JSON.stringify({
        customerInvoiceId: selectedInvoiceForPay.value.id,
        ...paymentForm.value,
        grossAmount: Number(paymentForm.value.grossAmount),
        feeAmount: Number(paymentForm.value.feeAmount || 0),
        bankAccountId: paymentForm.value.bankAccountId || undefined,
        proofImageDataUrl: payProofDataUrl.value || null,
        proofFileName: payProofFileName.value || null,
      }),
    });
    const savedMonth = String(paymentForm.value.paymentDate || '').slice(0, 7);
    paymentModalOpen.value = false;
    payProofDataUrl.value = '';
    payProofFileName.value = '';
    bhPage.value = 1;
    bhSortBy.value = 'newest';
    if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth) && savedMonth !== selectedMonth.value) {
      selectedMonth.value = savedMonth;
    }
    feedbackMsg.value = `Kwitansi pembayaran ${res.data.payment.receiptNumber} diajukan & menunggu persetujuan Manajer Keuangan sebelum dicetak.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencatat pembayaran invoice.';
  }
}

function openVoidModal(inv: any) {
  selectedInvoiceForVoid.value = inv;
  voidReason.value = '';
  voidModalOpen.value = true;
}

async function submitVoidInvoice() {
  if (!selectedInvoiceForVoid.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/revenue/customer-invoices/${selectedInvoiceForVoid.value.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason: voidReason.value }),
    });
    voidModalOpen.value = false;
    feedbackMsg.value = `Invoice ${selectedInvoiceForVoid.value.docNumber} ditandai HANGUS beserta jurnal pembalik.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membatalkan invoice.';
  }
}

async function reissueInvoice(inv: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/revenue/customer-invoices/${inv.id}/reissue`, { method: 'POST' });
    feedbackMsg.value = `Invoice baru ${res.data.docNumber} diajukan ulang & menunggu persetujuan Manajer Keuangan.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menerbitkan ulang invoice.';
  }
}

// ============================================================================
// APPROVAL, REMINDER, REJECT, RESUBMIT & VOID HANDLERS (KWITANSI / TT / INVOICE)
// ============================================================================
function formatTimeShort(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function approveDocument(targetType: 'PAYMENT' | 'INVOICE', row: any) {
  approvalBusyId.value = row.id;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const endpoint =
      targetType === 'INVOICE'
        ? `/revenue/customer-invoices/${row.id}/approve`
        : `/revenue/payments/${row.id}/approve`;
    await apiFetch(endpoint, { method: 'POST' });
    const docCode = targetType === 'INVOICE' ? row.docNumber : row.receiptNumber;
    feedbackMsg.value = `${docCode} disetujui Manajer Keuangan. Jurnal telah diposting & tombol Cetak kini aktif.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyetujui dokumen.';
  } finally {
    approvalBusyId.value = '';
  }
}

async function remindManager(targetType: 'PAYMENT' | 'INVOICE', row: any) {
  approvalBusyId.value = row.id;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const endpoint =
      targetType === 'INVOICE'
        ? `/revenue/customer-invoices/${row.id}/remind`
        : `/revenue/payments/${row.id}/remind`;
    const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({}) });
    const docCode = targetType === 'INVOICE' ? row.docNumber : row.receiptNumber;
    const cnt = res.data?.reminderCount || 1;
    feedbackMsg.value = `Pengingat approval ke-${cnt} untuk ${docCode} berhasil dikirim ke notifikasi Manajer Keuangan.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengirim pengingat approval.';
  } finally {
    approvalBusyId.value = '';
  }
}

function openRejectModal(targetType: 'PAYMENT' | 'INVOICE', row: any) {
  rejectTargetType.value = targetType;
  rejectTargetRow.value = row;
  rejectReason.value = '';
  rejectModalOpen.value = true;
}

async function submitRejectDocument() {
  if (!rejectTargetRow.value) return;
  approvalBusyId.value = rejectTargetRow.value.id;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const endpoint =
      rejectTargetType.value === 'INVOICE'
        ? `/revenue/customer-invoices/${rejectTargetRow.value.id}/reject`
        : `/revenue/payments/${rejectTargetRow.value.id}/reject`;
    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ reason: rejectReason.value }),
    });
    const docCode = rejectTargetType.value === 'INVOICE' ? rejectTargetRow.value.docNumber : rejectTargetRow.value.receiptNumber;
    rejectModalOpen.value = false;
    feedbackMsg.value = `Permintaan revisi untuk ${docCode} telah dikirim ke PIC pembuat.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengirim permintaan revisi.';
  } finally {
    approvalBusyId.value = '';
  }
}

function openResubmitModal(targetType: 'PAYMENT' | 'INVOICE', row: any) {
  resubmitTargetType.value = targetType;
  resubmitTargetRow.value = row;
  resubmitForm.value = {
    payerName: row.payerName || row.customer?.name || '',
    activityTitle: row.activityTitle || '',
    rincianLabel: row.rincianLabel || '',
    revenueAccountCode: row.revenueAccountCode || '',
    grossAmount: Number(row.bankReceivedAmount || row.grossAmount || row.totalAmount || 0),
    notes: row.notes || '',
  };
  resubmitModalOpen.value = true;
}

async function submitResubmitDocument() {
  if (!resubmitTargetRow.value) return;
  approvalBusyId.value = resubmitTargetRow.value.id;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const isInv = resubmitTargetType.value === 'INVOICE';
    const endpoint = isInv
      ? `/revenue/customer-invoices/${resubmitTargetRow.value.id}/resubmit`
      : `/revenue/payments/${resubmitTargetRow.value.id}/resubmit`;
    const payload = isInv
      ? {
          activityTitle: resubmitForm.value.activityTitle,
          rincianLabel: resubmitForm.value.rincianLabel,
          revenueAccountCode: resubmitForm.value.revenueAccountCode,
          notes: resubmitForm.value.notes,
        }
      : {
          payerName: resubmitForm.value.payerName,
          activityTitle: resubmitForm.value.activityTitle,
          rincianLabel: resubmitForm.value.rincianLabel,
          revenueAccountCode: resubmitForm.value.revenueAccountCode,
          grossAmount: Number(resubmitForm.value.grossAmount),
          notes: resubmitForm.value.notes,
        };
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    const docCode = isInv ? resubmitTargetRow.value.docNumber : resubmitTargetRow.value.receiptNumber;
    resubmitModalOpen.value = false;
    feedbackMsg.value = `${docCode} berhasil direvisi & diajukan ulang ke Manajer Keuangan.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengajukan ulang dokumen.';
  } finally {
    approvalBusyId.value = '';
  }
}

function openVoidPaymentModal(row: any) {
  selectedPaymentForVoid.value = row;
  voidPayReason.value = '';
  voidPayModalOpen.value = true;
}

async function submitVoidPayment() {
  if (!selectedPaymentForVoid.value) return;
  approvalBusyId.value = selectedPaymentForVoid.value.id;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/revenue/payments/${selectedPaymentForVoid.value.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason: voidPayReason.value }),
    });
    const docCode = selectedPaymentForVoid.value.receiptNumber;
    voidPayModalOpen.value = false;
    feedbackMsg.value = `Dokumen ${docCode} berhasil dibatalkan.`;
    await Promise.all([loadAll(), auth.refreshCounters()]);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membatalkan dokumen.';
  } finally {
    approvalBusyId.value = '';
  }
}

function openSlipModal(row: any) {
  selectedRowForSlip.value = row;
  slipForm.value = {
    withholdingSlipNo: row.withholdingSlipNo || '',
    taxAlreadyProcessed: Boolean(row.taxAlreadyProcessed),
    depositDate: row.depositDate || '',
  };
  slipModalOpen.value = true;
}

async function submitSlipUpdate() {
  if (!selectedRowForSlip.value) return;
  try {
    await apiFetch(`/revenue/payments/${selectedRowForSlip.value.id}/tax-meta`, {
      method: 'PATCH',
      body: JSON.stringify(slipForm.value),
    });
    slipModalOpen.value = false;
    feedbackMsg.value = `Status pajak / bukti potong ${selectedRowForSlip.value.receiptNumber} diperbarui.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memperbarui status pajak.';
  }
}

async function toggleTampungan(row: any) {
  try {
    await apiFetch(`/revenue/payments/${row.id}/tax-meta`, {
      method: 'PATCH',
      body: JSON.stringify({ taxAlreadyProcessed: !row.taxAlreadyProcessed }),
    });
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengubah penanda tampungan.';
  }
}

function getCategoryOptionsForUnit(unitId: string): string[] {
  const u = businessUnits.value.find((x) => x.id === unitId);
  const presets = UNIT_CATALOG_DEFAULTS[u?.code || '']?.categories || ['Layanan Umum'];
  const existing = products.value
    .filter((p) => !unitId || p.businessUnitId === unitId)
    .map((p) => String(p.category || '').trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const cat of [...existing, ...presets]) {
    const key = cat.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(cat);
    }
  }
  return merged;
}

const addProdCategoryOptions = computed(() => getCategoryOptionsForUnit(addProdForm.value.businessUnitId));
const editProdCategoryOptions = computed(() => getCategoryOptionsForUnit(selectedProdForEdit.value?.businessUnitId || ''));

const addProdSkuPreview = computed(() => {
  const u = businessUnits.value.find((x) => x.id === addProdForm.value.businessUnitId);
  const short = (u?.code || 'PMO').replace(/^BU-/i, '').toUpperCase();
  return `LYN-${short}-XXX (Otomatis)`;
});

function openEditProductModal(prod: any) {
  selectedProdForEdit.value = prod;
  const knownUnits = UNIT_MEASURE_OPTIONS.map((u) => u.value);
  const isKnownUnit = knownUnits.includes(prod.unit);
  editProdNewCategory.value = '';
  editProdCustomUnit.value = isKnownUnit ? '' : prod.unit;
  editProdForm.value = {
    name: prod.name,
    category: prod.category,
    location: prod.location || '',
    unit: isKnownUnit ? prod.unit : '__CUSTOM__',
    unitPrice: Number(prod.unitPrice),
    taxScheme: prod.taxScheme || 'PPN12_PMK131',
    taxInclusive: prod.taxInclusive !== false,
    revenueAccountCode: prod.revenueAccountCode,
    reason: '',
  };
  editProdModalOpen.value = true;
}

async function submitEditProduct() {
  if (!selectedProdForEdit.value) return;
  const finalCategory =
    editProdForm.value.category === '__NEW__'
      ? editProdNewCategory.value.trim()
      : editProdForm.value.category.trim();
  const finalUnit =
    editProdForm.value.unit === '__CUSTOM__'
      ? editProdCustomUnit.value.trim() || 'Paket'
      : editProdForm.value.unit;
  if (finalCategory.length < 2) {
    errorMsg.value = 'Nama kategori layanan wajib diisi minimal 2 karakter.';
    return;
  }
  try {
    await apiFetch(`/revenue/products/${selectedProdForEdit.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...editProdForm.value,
        category: finalCategory,
        unit: finalUnit,
        unitPrice: Number(editProdForm.value.unitPrice),
      }),
    });
    editProdModalOpen.value = false;
    feedbackMsg.value = `Layanan ${selectedProdForEdit.value.sku} (COA ${editProdForm.value.revenueAccountCode}) diperbarui.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memperbarui layanan.';
  }
}

function applyUnitDefaultsToAddForm(unitId: string) {
  const u = businessUnits.value.find((x) => x.id === unitId);
  const def = UNIT_CATALOG_DEFAULTS[u?.code || ''] || UNIT_CATALOG_DEFAULTS['BU-MICE'];
  const cats = getCategoryOptionsForUnit(unitId);
  addProdForm.value.revenueAccountCode = def.coa;
  addProdForm.value.taxScheme = def.taxScheme;
  addProdForm.value.category = cats[0] || def.categories[0] || 'Layanan Umum';
  addProdNewCategory.value = '';
}

function openAddProductModal() {
  const defaultUnitId = selectedUnitId.value || operationalUnits.value[0]?.id || '';
  addProdNewCategory.value = '';
  addProdCustomUnit.value = '';
  addProdForm.value = {
    sku: '',
    name: '',
    category: '',
    location: '',
    businessUnitId: defaultUnitId,
    unitPrice: 0,
    unit: 'Paket',
    taxScheme: 'PPN12_PMK131',
    taxInclusive: true,
    revenueAccountCode: '420301070200',
  };
  applyUnitDefaultsToAddForm(defaultUnitId);
  addProdModalOpen.value = true;
}

async function submitAddProduct() {
  const finalCategory =
    addProdForm.value.category === '__NEW__'
      ? addProdNewCategory.value.trim()
      : addProdForm.value.category.trim();
  const finalUnit =
    addProdForm.value.unit === '__CUSTOM__'
      ? addProdCustomUnit.value.trim() || 'Paket'
      : addProdForm.value.unit;

  if (finalCategory.length < 2) {
    errorMsg.value = 'Kategori layanan wajib dipilih atau diisi minimal 2 karakter.';
    return;
  }

  try {
    const res = await apiFetch('/revenue/products', {
      method: 'POST',
      body: JSON.stringify({
        name: addProdForm.value.name,
        category: finalCategory,
        location: addProdForm.value.location || null,
        businessUnitId: addProdForm.value.businessUnitId,
        unitPrice: Number(addProdForm.value.unitPrice),
        unit: finalUnit,
        taxScheme: addProdForm.value.taxScheme,
        taxInclusive: addProdForm.value.taxInclusive,
        revenueAccountCode: addProdForm.value.revenueAccountCode,
      }),
    });
    addProdModalOpen.value = false;
    feedbackMsg.value = `Layanan ${res.data.name} (${res.data.sku}) berhasil ditambahkan ke katalog.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menambahkan layanan.';
  }
}

async function submitAddCustomer() {
  try {
    const res = await apiFetch('/revenue/customers', {
      method: 'POST',
      body: JSON.stringify(addCustForm.value),
    });
    const createdCust = res.data;
    const savedName = addCustForm.value.name;
    const shouldBindInvoice = addCustTargetInvoice.value;
    addCustTargetInvoice.value = false;
    addCustModalOpen.value = false;
    feedbackMsg.value = `Pelanggan ${savedName} berhasil didaftarkan.`;
    addCustForm.value = {
      name: '',
      organizationType: 'CORPORATE',
      taxCollectorProfile: 'BADAN_POTONG_PPH',
      taxIdNpwp: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
    };
    await loadAll();
    if (shouldBindInvoice && createdCust?.id) {
      invoiceForm.value.customerId = createdCust.id;
      if (createdCust.taxCollectorProfile) {
        invoiceForm.value.taxCollectorProfile = createdCust.taxCollectorProfile;
        invoiceForm.value.subCategory = createdCust.taxCollectorProfile === 'INTERNAL_UT' ? 'Internal UT' : 'Umum';
      }
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mendaftarkan pelanggan.';
  }
}

// Cashier shift actions
function openShiftModal() {
  sessionOpenForm.value = {
    cashRegisterId: cashierData.value.registers?.[0]?.id || '',
    openingFloat: 1000000,
  };
  openSessionModalOpen.value = true;
}

async function submitOpenSession() {
  try {
    await apiFetch('/revenue/cashier/sessions/open', {
      method: 'POST',
      body: JSON.stringify({
        cashRegisterId: sessionOpenForm.value.cashRegisterId,
        openingFloat: Number(sessionOpenForm.value.openingFloat),
      }),
    });
    openSessionModalOpen.value = false;
    feedbackMsg.value = 'Sesi kasir loket berhasil dibuka.';
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membuka sesi kasir.';
  }
}

function openCloseShift(s: any) {
  selectedSessionForClose.value = s;
  sessionCloseForm.value = { actualCountedCash: Number(s.theoreticalBalance), discrepancyReason: '' };
  closeSessionModalOpen.value = true;
}

async function submitCloseSession() {
  if (!selectedSessionForClose.value) return;
  try {
    await apiFetch(`/revenue/cashier/sessions/${selectedSessionForClose.value.id}/close`, {
      method: 'POST',
      body: JSON.stringify({
        actualCountedCash: Number(sessionCloseForm.value.actualCountedCash),
        discrepancyReason: sessionCloseForm.value.discrepancyReason,
      }),
    });
    closeSessionModalOpen.value = false;
    feedbackMsg.value = `Sesi kasir ${selectedSessionForClose.value.sessionNumber} berhasil ditutup.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menutup sesi kasir.';
  }
}

function openDepositModal(s: any) {
  depositForm.value = {
    cashierSessionId: s.id,
    bankAccountId: mandiriBankAccount.value?.id || '',
    amount: Number(s.actualCountedCash || s.theoreticalBalance || 0),
    referenceNo: `STR-${Date.now().toString().slice(-6)}`,
    notes: `Setoran kas sesi ${s.sessionNumber}`,
  };
  depositModalOpen.value = true;
}

async function submitDeposit() {
  try {
    await apiFetch('/revenue/cashier/deposits', {
      method: 'POST',
      body: JSON.stringify({
        ...depositForm.value,
        amount: Number(depositForm.value.amount),
      }),
    });
    depositModalOpen.value = false;
    feedbackMsg.value = 'Setoran kasir ke Bank Mandiri Penerimaan berhasil dicatat.';
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencatat setoran bank.';
  }
}

// Print & Export helpers (strictly locked until Manager Finance approves)
function openPrintInvoice(inv: any) {
  if (inv?.approvalStatus && inv.approvalStatus !== 'APPROVED') {
    errorMsg.value = `Invoice ${inv.docNumber} belum disetujui Manajer Keuangan dan belum dapat dicetak.`;
    return;
  }
  if (inv?.status === 'VOID') {
    errorMsg.value = `Invoice ${inv.docNumber} berstatus HANGUS dan tidak dapat dicetak.`;
    return;
  }
  printMode.value = 'INVOICE';
  printPayload.value = inv;
  printOpen.value = true;
}

function openPrintReceipt(row: any) {
  if (row?.approvalStatus && row.approvalStatus !== 'APPROVED') {
    errorMsg.value = `Dokumen ${row.receiptNumber} belum disetujui Manajer Keuangan dan belum dapat dicetak.`;
    return;
  }
  if (row?.status === 'VOID') {
    errorMsg.value = `Dokumen ${row.receiptNumber} telah dibatalkan dan tidak dapat dicetak.`;
    return;
  }
  printMode.value = row.receiptType === 'TANDA_TERIMA' ? 'TANDA_TERIMA' : 'KUITANSI';
  printPayload.value = row;
  printOpen.value = true;
}

function openPrintInvoiceFromBukuHarian(row: any) {
  const found = customerInvoices.value.find((x) => x.id === row.customerInvoiceId);
  if (found) openPrintInvoice(found);
}

function openPrintSuratPajak() {
  if (!bukuHarianData.value?.withdrawal) return;
  printMode.value = 'SURAT_PAJAK';
  printPayload.value = bukuHarianData.value.withdrawal;
  printOpen.value = true;
}

async function exportMonthlyExcel() {
  try {
    const unitQs = selectedUnitId.value ? `&businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    await downloadApiBlob(
      `/revenue/tax-recap/export.xlsx?month=${encodeURIComponent(selectedMonth.value)}${unitQs}`,
      `Penerimaan-BKU-Pajak-${selectedMonth.value}.xlsx`
    );
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengekspor Excel Penerimaan.';
  }
}

async function exportAgingExcel() {
  try {
    const unitQs = selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    await downloadApiBlob(`/revenue/aging/export.xlsx${unitQs}`, `Aging-Penerimaan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengekspor Aging Penerimaan.';
  }
}

function toggleAgingFilter(key: 'current' | 'days31to60' | 'days61to90' | 'over90') {
  activeAgingBucket.value = activeAgingBucket.value === key ? '' : key;
}

function getTaxSchemeShort(scheme?: string) {
  if (scheme === 'PB1_10') return 'PB1 10%';
  if (scheme === 'PPN12_PPH4_2') return 'PPN 12% + PPh 4(2)';
  if (scheme === 'PPN12_PPH23') return 'PPN 12% + PPh 23 (2%)';
  if (scheme === 'PPN12_PPH23_15') return 'PPN 12% + PPh 23 (15%)';
  if (scheme === 'PPH21_5') return 'PPh 21 (5%)';
  if (scheme === 'BEBAS_PAJAK') return 'Bebas Pajak';
  return 'PPN 12%';
}

function formatMethodLabel(method?: string): string {
  if (method === 'BANK_TRANSFER') return 'Transfer Bank';
  if (method === 'VIRTUAL_ACCOUNT_SIMULATED') return 'Virtual Account';
  if (method === 'QRIS_SIMULATED') return 'QRIS';
  if (method === 'EDC_CARD') return 'Kartu EDC';
  if (method === 'CASH') return 'Tunai';
  return method || 'Transfer Bank';
}

function formatStageLabel(stage?: string): string {
  if (stage === 'UANG_MUKA') return 'Uang Muka';
  if (stage === 'TERMIN') return 'Termin';
  return 'Pelunasan';
}

function formatReceiptDocLabel(receiptType?: string): string {
  if (receiptType === 'TANDA_TERIMA') return 'Tanda Terima';
  if (receiptType === 'KUITANSI_UM') return 'Kwitansi UM';
  if (receiptType === 'LANGSUNG') return 'Langsung';
  return 'Kwitansi';
}

function formatActivitySub(title?: string, rincian?: string): string {
  const t = String(title || '').trim();
  const r = String(rincian || '').trim();
  if (!t) return r || '-';
  if (!r || t.toLowerCase() === r.toLowerCase()) return t;
  return `${t} · ${r}`;
}

function formatInvoiceStatusLabel(status?: string): string {
  if (status === 'PENDING_APPROVAL') return 'Menunggu Approval';
  if (status === 'REJECTED') return 'Perlu Revisi';
  if (status === 'ISSUED') return 'Disetujui · Belum Bayar';
  if (status === 'PARTIALLY_PAID') return 'Sebagian Bayar';
  if (status === 'PAID') return 'Lunas';
  if (status === 'VOID') return 'HANGUS';
  if (status === 'REFUNDED') return 'Dikembalikan';
  return status || '-';
}

onMounted(() => {
  applyRouteQueryFilters();
  loadAll();
});
</script>

<template>
  <div class="poital-penerimaan">
    <!-- DropX Page Header: Title + Subtitle left, Controls neatly aligned right -->
    <div class="rev-top-bar">
      <div class="rev-title-group">
        <h1 class="rev-title">{{ pageTitle }}</h1>
        <p class="rev-subtitle">{{ pageSubtitle }}</p>
      </div>

      <div class="rev-top-actions">
        <input
          v-if="activeTab !== 'layanan'"
          v-model="selectedMonth"
          type="month"
          class="pill-month-input"
          aria-label="Pilih Bulan Periode"
        />
        <button
          v-if="activeTab === 'buku_harian' && auth.hasPermission('payment:create')"
          type="button"
          class="pill-btn-soft"
          @click="openImportCsvModal"
        >
          Import CSV
        </button>
        <button
          v-if="activeTab === 'buku_harian' && (auth.hasPermission('payment:create') || auth.hasPermission('revenue:create'))"
          type="button"
          class="pill-btn-navy"
          @click="openBukuHarianModal('KWITANSI')"
        >
          + Input Buku Harian
        </button>
        <button
          v-if="activeTab === 'invoices' && auth.hasPermission('revenue:create')"
          type="button"
          class="pill-btn-navy"
          @click="openCreateInvoice()"
        >
          + Buat Invoice
        </button>
        <button
          v-if="activeTab === 'layanan' && auth.hasPermission('revenue:create')"
          type="button"
          class="pill-btn-soft"
          @click="addCustModalOpen = true"
        >
          + Pelanggan Baru
        </button>
        <button
          v-if="activeTab === 'layanan' && auth.hasPermission('revenue:create')"
          type="button"
          class="pill-btn-navy"
          @click="openAddProductModal"
        >
          + Tambah Layanan
        </button>
      </div>
    </div>

    <AlertBanner v-if="feedbackMsg" variant="success" title="Berhasil" :message="feedbackMsg" @dismiss="feedbackMsg = ''" />
    <AlertBanner v-if="errorMsg" variant="danger" title="Perhatian" :message="errorMsg" @dismiss="errorMsg = ''" />

    <!-- DropX 4 Luminous Gradient KPI Cards (Strictly Read-Only Metrics, No Cross-Feature Routing) -->
    <section class="kpi-metric-row">
      <article class="dropx-kpi-card kpi-grad-navy">
        <div class="kpi-top-row">
          <span class="kpi-label">Masuk Rekening ({{ bukuHarianData?.period?.label || selectedMonth }})</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </span>
        </div>
        <strong class="kpi-value money">{{ formatRupiah(bukuHarianData?.summary?.totalReceived || 0) }}</strong>
        <span class="kpi-foot">{{ bukuHarianData?.summary?.totalTransactions || 0 }} transaksi · Bank Mandiri</span>
      </article>

      <article class="dropx-kpi-card kpi-grad-ocean">
        <div class="kpi-top-row">
          <span class="kpi-label">Piutang Terbuka (Invoice)</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
          </span>
        </div>
        <strong class="kpi-value money">{{ formatRupiah(agingData?.buckets?.totalOutstanding || 0) }}</strong>
        <span class="kpi-foot">{{ agingData?.buckets?.openCount || 0 }} invoice menunggu pelunasan</span>
      </article>

      <article class="dropx-kpi-card kpi-grad-amber">
        <div class="kpi-top-row">
          <span class="kpi-label">Rekonsiliasi Bank Mandiri</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M6 10v11"/><path d="M12 10v11"/><path d="M18 10v11"/></svg>
          </span>
        </div>
        <strong class="kpi-value">
          {{ bukuHarianData?.summary?.reconciledCount || 0 }} / {{ bukuHarianData?.summary?.allScopeCount || 0 }}
        </strong>
        <span class="kpi-foot">
          {{ (bukuHarianData?.summary?.unreconciledCount || 0) > 0
            ? `${bukuHarianData.summary.unreconciledCount} transaksi belum cocok rekening koran`
            : 'Semua cocok dengan rekening koran' }}
        </span>
      </article>

      <article
        class="dropx-kpi-card"
        :class="totalPendingApprovals > 0 ? 'kpi-grad-amber' : 'kpi-grad-emerald'"
      >
        <div class="kpi-top-row">
          <span class="kpi-label">Approval Manajer Keuangan</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
        </div>
        <strong class="kpi-value">
          {{ totalPendingApprovals > 0 ? `${totalPendingApprovals} Menunggu` : `${totalApprovedDocs} Disetujui` }}
        </strong>
        <span class="kpi-foot">
          {{ totalPendingApprovals > 0
            ? `${cashInCounts.pendingApproval} Kwitansi/TT · ${invPendingApprovalCount} Invoice`
            : `${kwitansiRows.length} KU · ${tandaTerimaRows.length} TT · ${customerInvoices.length} Inv` }}
        </span>
      </article>
    </section>

    <!-- Focused Unit Filter Bar Only (Switch between Buku Harian / Invoice / Layanan strictly via Sidebar) -->
    <div class="unit-filter-bar-clean">
      <div class="unit-filter-row" role="tablist" aria-label="Filter Unit Bisnis">
        <button
          type="button"
          class="unit-pill"
          :class="{ active: selectedUnitId === '' }"
          @click="selectedUnitId = ''"
        >
          Semua Unit
        </button>
        <button
          v-for="u in operationalUnits"
          :key="u.id"
          type="button"
          class="unit-pill"
          :class="{ active: selectedUnitId === u.id }"
          @click="selectedUnitId = u.id"
        >
          {{ u.code.replace('BU-', '') }}
        </button>
      </div>
    </div>

    <StateBanner v-if="loading" state="loading" title="Memuat Penerimaan" message="Mengambil data Buku Harian Uang Masuk, Tagihan Invoice, dan status Rekonsiliasi Bank..." />

    <!-- ==================== TAB 1: BUKU HARIAN (DROPX SINGLE-CARD FULL-BLEED TABLE) ==================== -->
    <section v-else-if="activeTab === 'buku_harian'" class="poital-card table-card-flush">
      <div class="dropx-card-head">
        <div class="dropx-head-top">
          <div>
            <h2 class="card-title">Buku Harian Penerimaan (Uang Masuk)</h2>
            <span class="card-sub">
              {{ bukuHarianData?.period?.label }} · {{ bhFilteredSummary.count }} transaksi masuk ·
              Total Masuk (Disetujui) <strong class="text-pos">{{ formatRupiah(bhFilteredSummary.cashIn) }}</strong>
            </span>
          </div>
          <div class="btn-row">
            <button v-if="hasActiveBhFilters" type="button" class="pill-btn-soft" @click="resetBhFilters">
              Reset Filter
            </button>
            <button type="button" class="pill-btn-soft" @click="exportMonthlyExcel">
              Export Excel
            </button>
          </div>
        </div>

        <!-- DropX Integrated Search + Dropdowns Row -->
        <div class="dropx-filter-row">
          <div class="dropx-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              v-model="searchQuery"
              type="search"
              class="dropx-search-input"
              placeholder="Cari nomor bukti, klien, COA..."
            />
          </div>

          <div class="bh-toolbar-selects">
            <select v-model="bhApprovalFilter" class="pill-select compact" aria-label="Filter Status Approval">
              <option value="">Approval: Semua</option>
              <option value="PENDING_APPROVAL">Menunggu Approval</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Perlu Revisi</option>
              <option value="VOID">Dibatalkan</option>
            </select>

            <select v-model="bhReconFilter" class="pill-select compact" aria-label="Filter Status Rekonsiliasi Bank">
              <option value="">Rekon Bank: Semua</option>
              <option value="RECONCILED">Terekonsiliasi</option>
              <option value="UNRECONCILED">Belum Rekon</option>
            </select>

            <select v-model="stageFilter" class="pill-select compact" aria-label="Filter Tahap Bayar">
              <option value="">Tahap: Semua</option>
              <option value="UANG_MUKA">Uang Muka (DP)</option>
              <option value="TERMIN">Termin</option>
              <option value="PELUNASAN">Pelunasan</option>
            </select>

            <select v-model="bhProofFilter" class="pill-select compact" aria-label="Filter Bukti Pembayaran">
              <option value="">Bukti: Semua</option>
              <option value="HAS_PROOF">Ada Bukti</option>
              <option value="NO_PROOF">Belum Ada Bukti</option>
            </select>

            <select v-model="bhSortBy" class="pill-select compact sort-select" aria-label="Urutkan Data Buku Harian">
              <option value="newest">Terbaru Diinput</option>
              <option value="date_desc">Tanggal Terbaru</option>
              <option value="date_asc">Tanggal Terlama</option>
              <option value="amount_desc">Nominal Terbesar</option>
              <option value="amount_asc">Nominal Terkecil</option>
            </select>
          </div>
        </div>

        <!-- DropX Compact Status Filter Pills with Colored Dots & Count Chips -->
        <div class="dropx-pill-row" role="group" aria-label="Filter Jenis Bukti Uang Masuk">
          <button type="button" class="dx-filter-tab" :class="{ active: bhDocFilter === 'all' && !bhApprovalFilter }" @click="bhDocFilter = 'all'; bhApprovalFilter = ''">
            Semua <span class="dx-count">{{ cashInCounts.all }}</span>
          </button>
          <button type="button" class="dx-filter-tab" :class="{ active: bhDocFilter === 'KU' }" @click="bhDocFilter = 'KU'">
            <span class="dx-dot dot-emerald"></span> Kwitansi <span class="dx-count">{{ cashInCounts.kwitansi }}</span>
          </button>
          <button type="button" class="dx-filter-tab" :class="{ active: bhDocFilter === 'TT' }" @click="bhDocFilter = 'TT'">
            <span class="dx-dot dot-blue"></span> Tanda Terima <span class="dx-count">{{ cashInCounts.tandaTerima }}</span>
          </button>
          <button
            v-if="cashInCounts.langsung > 0"
            type="button"
            class="dx-filter-tab"
            :class="{ active: bhDocFilter === 'DIRECT' }"
            @click="bhDocFilter = 'DIRECT'"
          >
            <span class="dx-dot dot-sky"></span> Langsung <span class="dx-count">{{ cashInCounts.langsung }}</span>
          </button>
          <button
            type="button"
            class="dx-filter-tab"
            :class="{ active: bhApprovalFilter === 'PENDING_APPROVAL' }"
            @click="bhApprovalFilter = bhApprovalFilter === 'PENDING_APPROVAL' ? '' : 'PENDING_APPROVAL'"
          >
            <span class="dx-dot dot-amber"></span> Menunggu Approval <span class="dx-count">{{ cashInCounts.pendingApproval }}</span>
          </button>
          <button
            v-if="cashInCounts.rejected > 0"
            type="button"
            class="dx-filter-tab"
            :class="{ active: bhApprovalFilter === 'REJECTED' }"
            @click="bhApprovalFilter = bhApprovalFilter === 'REJECTED' ? '' : 'REJECTED'"
          >
            <span class="dx-dot dot-red"></span> Perlu Revisi <span class="dx-count">{{ cashInCounts.rejected }}</span>
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>No. Bukti &amp; Tgl</th>
              <th>Jenis &amp; COA</th>
              <th>Pembayar &amp; Uraian</th>
              <th class="col-num">Nominal</th>
              <th>Status &amp; Bank</th>
              <th class="col-num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="paginatedBukuHarian.length === 0">
              <td colspan="6" class="empty-cell">
                {{ hasActiveBhFilters ? 'Tidak ada penerimaan yang cocok dengan filter saat ini.' : 'Belum ada uang masuk di Buku Harian pada periode ini. Klik "+ Input Buku Harian" untuk mulai mencatat.' }}
              </td>
            </tr>
            <tr v-for="item in paginatedBukuHarian" :key="item.uid" :class="{ 'row-void': item.status === 'VOID' }">
              <td class="nowrap-cell">
                <button type="button" class="doc-link-btn mono-code" title="Klik untuk melihat detail lengkap" @click="openReviewModal('PAYMENT', item.raw)">
                  {{ item.primaryDocNo }}
                </button>
                <div class="cell-sub">{{ formatDate(item.dateDisplay) }}</div>
              </td>
              <td>
                <span class="tag-pill" :class="item.receiptType === 'TANDA_TERIMA' ? 'info' : 'ok'">
                  {{ formatReceiptDocLabel(item.receiptType) }}
                </span>
                <div class="cell-sub">{{ formatStageLabel(item.stageLabel) }} · {{ formatMethodLabel(item.method) }}</div>
                <div class="cell-sub mono-sub">{{ item.coaCode }}<template v-if="item.invoiceDocNo"> · {{ item.invoiceDocNo }}</template></div>
              </td>
              <td>
                <div class="payer-line">
                  <strong>{{ item.payerName }}</strong>
                  <span class="unit-mini-tag">{{ item.unitCode.replace('BU-', '') }}</span>
                </div>
                <div class="cell-sub desc-clamp">{{ formatActivitySub(item.activityTitle, item.rincianLabel) }}</div>
              </td>
              <td class="col-num nowrap-cell">
                <strong class="money" :class="item.approvalStatus === 'APPROVED' && item.status === 'CONFIRMED' ? 'text-pos' : ''">+ {{ formatRupiah(item.amount) }}</strong>
                <div v-if="item.overpaymentAmount > 0" class="cell-warn">
                  Lebih bayar {{ formatRupiah(item.overpaymentAmount) }}
                </div>
                <div v-else class="cell-sub">{{ getTaxSchemeShort(item.taxScheme) }}</div>
              </td>
              <td>
                <template v-if="item.status === 'VOID'">
                  <span class="tag-pill danger">Dibatalkan</span>
                  <div class="cell-sub">{{ item.voidReason || 'Transaksi dibatalkan' }}</div>
                </template>
                <template v-else-if="item.approvalStatus === 'PENDING_APPROVAL'">
                  <span class="tag-pill warn-soft">Menunggu Approval</span>
                  <div class="cell-sub">
                    <template v-if="auth.hasPermission('payment:approve')">
                      Perlu persetujuan Anda{{ item.reminderCount > 0 ? ` · Diingatkan ${item.reminderCount}x` : '' }}
                    </template>
                    <template v-else>
                      {{ item.reminderCount > 0 ? `Diingatkan ${item.reminderCount}x` : 'Menunggu Manajer Keuangan' }}
                    </template>
                  </div>
                </template>
                <template v-else-if="item.approvalStatus === 'REJECTED'">
                  <span class="tag-pill danger">Perlu Revisi</span>
                  <div class="cell-sub">{{ item.rejectionReason || 'Lihat catatan revisi' }}</div>
                </template>
                <template v-else>
                  <span class="tag-pill ok">Disetujui</span>
                  <div class="cell-sub">
                    {{ item.isReconciled ? `Rekon ${item.reconciledImportNumber || 'Mandiri'}` : 'Sah · Belum Rekon' }}
                  </div>
                </template>
              </td>
              <td class="col-num">
                <div class="inline-actions">
                  <button
                    type="button"
                    class="mini-action-btn"
                    :class="item.raw.paymentProof ? 'proof-ok' : 'soft'"
                    @click="openProofModal(item.raw, 'PAYMENT')"
                  >
                    {{ item.raw.paymentProof ? 'Bukti' : '+ Bukti' }}
                  </button>

                  <template v-if="item.status !== 'VOID' && item.approvalStatus === 'PENDING_APPROVAL'">
                    <button
                      v-if="!auth.hasPermission('payment:approve') && (auth.hasPermission('payment:create') || auth.hasPermission('revenue:create'))"
                      type="button"
                      class="mini-action-btn warn"
                      :disabled="approvalBusyId === item.raw.id"
                      title="Kirim pengingat approval ke Manajer Keuangan"
                      @click="remindManager('PAYMENT', item.raw)"
                    >
                      {{ item.reminderCount > 0 ? `Ingatkan (${item.reminderCount})` : 'Ingatkan' }}
                    </button>
                    <template v-if="auth.hasPermission('payment:approve')">
                      <button
                        type="button"
                        class="mini-action-btn soft"
                        title="Tinjau rincian pajak, COA & pengaju sebelum menyetujui"
                        @click="openReviewModal('PAYMENT', item.raw)"
                      >
                        Tinjau
                      </button>
                      <button
                        type="button"
                        class="mini-action-btn approve-ok"
                        :disabled="approvalBusyId === item.raw.id"
                        title="Setujui dokumen & aktifkan cetak"
                        @click="approveDocument('PAYMENT', item.raw)"
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        class="mini-action-btn revise-warn"
                        :disabled="approvalBusyId === item.raw.id"
                        @click="openRejectModal('PAYMENT', item.raw)"
                      >
                        Revisi
                      </button>
                    </template>
                  </template>
                  <template v-else-if="item.status !== 'VOID' && item.approvalStatus === 'REJECTED'">
                    <button
                      v-if="auth.hasPermission('payment:create')"
                      type="button"
                      class="mini-action-btn warn"
                      @click="openResubmitModal('PAYMENT', item.raw)"
                    >
                      Ajukan Ulang
                    </button>
                    <button
                      v-if="auth.hasPermission('payment:create')"
                      type="button"
                      class="mini-action-btn danger"
                      @click="openVoidPaymentModal(item.raw)"
                    >
                      Batal
                    </button>
                  </template>
                  <template v-else-if="item.status === 'CONFIRMED' && item.approvalStatus === 'APPROVED'">
                    <button
                      v-if="auth.hasPermission('payment:approve') && !item.isReconciled"
                      type="button"
                      class="mini-action-btn danger"
                      title="Batalkan dokumen beserta jurnal pembalik"
                      @click="openVoidPaymentModal(item.raw)"
                    >
                      Batal
                    </button>
                  </template>

                  <button
                    type="button"
                    class="mini-action-btn"
                    :class="item.approvalStatus === 'APPROVED' && item.status !== 'VOID' ? 'navy' : 'locked-print'"
                    :disabled="item.approvalStatus !== 'APPROVED' || item.status === 'VOID'"
                    :title="
                      item.status === 'VOID'
                        ? 'Dokumen dibatalkan'
                        : item.approvalStatus === 'APPROVED'
                          ? 'Cetak dokumen resmi'
                          : 'Terkunci: Menunggu approval Manajer Keuangan sebelum dapat dicetak'
                    "
                    @click="openPrintReceipt(item.raw)"
                  >
                    {{ item.receiptType === 'TANDA_TERIMA' ? 'Cetak TT' : 'Cetak' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <TablePagination
        v-model:page="bhPage"
        v-model:pageSize="pageSize"
        :total-items="visibleBukuHarian.length"
        item-label="penerimaan"
      />
    </section>

    <!-- ==================== TAB 2: TAGIHAN & INVOICE (100% PIUTANG, AGING & KONTRAK) ==================== -->
    <div v-else-if="activeTab === 'invoices'" class="rev-stack">
      <!-- Clickable 4-Bucket Aging Piutang Strip -->
      <section class="aging-strip-grid" aria-label="Aging Piutang Penerimaan">
        <button
          type="button"
          class="aging-bucket-card"
          :class="{ active: activeAgingBucket === 'current' }"
          @click="toggleAgingFilter('current')"
        >
          <span>0 - 30 Hari</span>
          <strong class="money">{{ formatRupiah(agingData?.buckets?.current || 0) }}</strong>
        </button>
        <button
          type="button"
          class="aging-bucket-card"
          :class="{ active: activeAgingBucket === 'days31to60' }"
          @click="toggleAgingFilter('days31to60')"
        >
          <span>31 - 60 Hari</span>
          <strong class="money">{{ formatRupiah(agingData?.buckets?.days31to60 || 0) }}</strong>
        </button>
        <button
          type="button"
          class="aging-bucket-card warn"
          :class="{ active: activeAgingBucket === 'days61to90' }"
          @click="toggleAgingFilter('days61to90')"
        >
          <span>61 - 90 Hari</span>
          <strong class="money">{{ formatRupiah(agingData?.buckets?.days61to90 || 0) }}</strong>
        </button>
        <button
          type="button"
          class="aging-bucket-card danger"
          :class="{ active: activeAgingBucket === 'over90' }"
          @click="toggleAgingFilter('over90')"
        >
          <span>&gt; 90 Hari</span>
          <strong class="money">{{ formatRupiah(agingData?.buckets?.over90 || 0) }}</strong>
        </button>
      </section>

      <section class="poital-card table-card-flush">
        <div class="dropx-card-head">
          <div class="dropx-head-top">
            <div>
              <h2 class="card-title">Tagihan &amp; Invoice Pelanggan</h2>
              <span class="card-sub">
                {{ invFilteredSummary.count }} invoice tampil ·
                Total Tagihan <strong>{{ formatRupiah(invFilteredSummary.totalNet) }}</strong>
                <template v-if="invFilteredSummary.totalOpen > 0">
                  · Sisa Piutang <strong>{{ formatRupiah(invFilteredSummary.totalOpen) }}</strong>
                </template>
              </span>
            </div>
            <div class="btn-row">
              <button v-if="hasActiveInvFilters" type="button" class="pill-btn-soft" @click="resetInvFilters">
                Reset Filter
              </button>
              <button type="button" class="pill-btn-soft" @click="exportAgingExcel">
                Export Aging .xlsx
              </button>
            </div>
          </div>

          <div class="dropx-filter-row">
            <div class="dropx-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                v-model="searchQuery"
                type="search"
                class="dropx-search-input"
                placeholder="Cari no. invoice, pelanggan, kegiatan..."
              />
            </div>

            <div class="bh-toolbar-selects">
              <select v-model="invoiceStatusFilter" class="pill-select compact" aria-label="Filter Status Invoice">
                <option value="">Status: Semua</option>
                <option value="PENDING_APPROVAL">Menunggu Approval</option>
                <option value="REJECTED">Perlu Revisi</option>
                <option value="OPEN">Belum Lunas (Semua)</option>
                <option value="ISSUED">Disetujui · Belum Bayar</option>
                <option value="PARTIALLY_PAID">Sebagian Bayar</option>
                <option value="PAID">Lunas</option>
                <option value="VOID">HANGUS / Batal</option>
              </select>

              <select v-model="invSortBy" class="pill-select compact sort-select" aria-label="Urutkan Daftar Invoice">
                <option value="newest">Terbaru Dibuat</option>
                <option value="due_asc">Jatuh Tempo Terdekat</option>
                <option value="balance_desc">Sisa Piutang Terbesar</option>
                <option value="amount_desc">Nilai Tagihan Terbesar</option>
              </select>
            </div>
          </div>

          <div class="dropx-pill-row" role="group" aria-label="Filter Cepat Status Invoice">
            <button type="button" class="dx-filter-tab" :class="{ active: invoiceStatusFilter === '' }" @click="invoiceStatusFilter = ''">
              Semua <span class="dx-count">{{ customerInvoices.length }}</span>
            </button>
            <button
              type="button"
              class="dx-filter-tab"
              :class="{ active: invoiceStatusFilter === 'PENDING_APPROVAL' }"
              @click="invoiceStatusFilter = invoiceStatusFilter === 'PENDING_APPROVAL' ? '' : 'PENDING_APPROVAL'"
            >
              <span class="dx-dot dot-amber"></span> Menunggu Approval <span class="dx-count">{{ invPendingApprovalCount }}</span>
            </button>
            <button
              v-if="invRejectedCount > 0"
              type="button"
              class="dx-filter-tab"
              :class="{ active: invoiceStatusFilter === 'REJECTED' }"
              @click="invoiceStatusFilter = invoiceStatusFilter === 'REJECTED' ? '' : 'REJECTED'"
            >
              <span class="dx-dot dot-red"></span> Perlu Revisi <span class="dx-count">{{ invRejectedCount }}</span>
            </button>
            <button type="button" class="dx-filter-tab" :class="{ active: invoiceStatusFilter === 'OPEN' }" @click="invoiceStatusFilter = 'OPEN'">
              <span class="dx-dot dot-blue"></span> Belum Lunas <span class="dx-count">{{ invOpenCount }}</span>
            </button>
            <button type="button" class="dx-filter-tab" :class="{ active: invoiceStatusFilter === 'PAID' }" @click="invoiceStatusFilter = 'PAID'">
              <span class="dx-dot dot-emerald"></span> Lunas <span class="dx-count">{{ invPaidCount }}</span>
            </button>
            <button type="button" class="dx-filter-tab" :class="{ active: invoiceStatusFilter === 'VOID' }" @click="invoiceStatusFilter = 'VOID'">
              <span class="dx-dot dot-red"></span> HANGUS <span class="dx-count">{{ invVoidCount }}</span>
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>No. Invoice</th>
                <th>Pelanggan &amp; Kegiatan</th>
                <th>Jatuh Tempo</th>
                <th class="col-num">Tagihan / Sisa</th>
                <th>Status</th>
                <th class="col-num">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="paginatedInvoices.length === 0">
                <td colspan="6" class="empty-cell">Tidak ada invoice yang cocok dengan filter saat ini.</td>
              </tr>
              <tr v-for="inv in paginatedInvoices" :key="inv.id" :class="{ 'row-void': inv.status === 'VOID' }">
                <td class="nowrap-cell">
                  <button type="button" class="doc-link-btn mono-code" title="Klik untuk meninjau rincian item & pajak Invoice" @click="openReviewModal('INVOICE', inv)">
                    {{ inv.docNumber }}
                  </button>
                  <div class="cell-sub">{{ formatStageLabel(inv.invoiceType) }} · FP {{ inv.fakturPajakCode || '040' }}</div>
                </td>
                <td>
                  <div class="payer-line">
                    <strong>{{ inv.customer?.name }}</strong>
                    <span class="unit-mini-tag">{{ inv.businessUnit?.code?.replace('BU-', '') }}</span>
                  </div>
                  <div class="cell-sub desc-clamp">{{ inv.activityTitle || inv.lines?.[0]?.description }}</div>
                </td>
                <td class="nowrap-cell">
                  <div>{{ formatDate(inv.dueDate) }}</div>
                  <span v-if="getDaysOverdue(inv) > 0 && inv.approvalStatus === 'APPROVED'" class="overdue-chip">Lewat {{ getDaysOverdue(inv) }} hari</span>
                </td>
                <td class="col-num nowrap-cell">
                  <strong class="money" :class="inv.approvalStatus !== 'APPROVED' ? 'muted-money' : ''">{{ formatRupiah(inv.balanceDue) }}</strong>
                  <div class="cell-sub">Total {{ formatRupiah(inv.totalAmount) }}<template v-if="inv.approvalStatus !== 'APPROVED' && inv.status !== 'VOID'"> · Belum posting</template></div>
                </td>
                <td>
                  <span
                    class="tag-pill"
                    :class="
                      inv.status === 'PAID'
                        ? 'ok'
                        : inv.status === 'PARTIALLY_PAID'
                          ? 'info'
                          : inv.status === 'ISSUED'
                            ? 'ok'
                            : inv.status === 'PENDING_APPROVAL'
                              ? 'warn-soft'
                              : 'danger'
                    "
                  >
                    {{ formatInvoiceStatusLabel(inv.status) }}
                  </span>
                  <div v-if="inv.status === 'PENDING_APPROVAL'" class="cell-sub">
                    <template v-if="auth.hasPermission('payment:approve')">
                      Perlu persetujuan Anda{{ (inv.reminderCount || 0) > 0 ? ` · Diingatkan ${inv.reminderCount}x (${formatTimeShort(inv.lastRemindedAt)})` : '' }}
                    </template>
                    <template v-else>
                      {{ (inv.reminderCount || 0) > 0 ? `Diingatkan ${inv.reminderCount}x (${formatTimeShort(inv.lastRemindedAt)})` : 'Menunggu Manajer Keuangan' }}
                    </template>
                  </div>
                  <div v-else-if="inv.status === 'REJECTED'" class="cell-sub">{{ inv.rejectionReason || 'Lihat catatan revisi' }}</div>
                  <div v-else-if="inv.approvedByName" class="cell-sub">Disetujui {{ inv.approvedByName }}</div>
                </td>
                <td class="col-num">
                  <div class="inline-actions">
                    <!-- Button 1: Upload / Lihat Bukti Pendukung Invoice -->
                    <button
                      type="button"
                      class="mini-action-btn"
                      :class="inv.invoiceProof ? 'proof-ok' : 'soft'"
                      @click="openProofModal(inv, 'INVOICE')"
                    >
                      {{ inv.invoiceProof ? 'Bukti' : '+ Bukti' }}
                    </button>

                    <!-- Button 2: Ingatkan (Operator/PIC) ATAU Tinjau, Setujui & Revisi (Manajer Keuangan) -->
                    <template v-if="inv.status !== 'VOID' && inv.approvalStatus === 'PENDING_APPROVAL'">
                      <button
                        v-if="!auth.hasPermission('payment:approve') && auth.hasPermission('revenue:create')"
                        type="button"
                        class="mini-action-btn warn"
                        :disabled="approvalBusyId === inv.id"
                        title="Kirim pengingat approval ke Manajer Keuangan"
                        @click="remindManager('INVOICE', inv)"
                      >
                        {{ (inv.reminderCount || 0) > 0 ? `Ingatkan (${inv.reminderCount})` : 'Ingatkan' }}
                      </button>
                      <template v-if="auth.hasPermission('payment:approve')">
                        <button
                          type="button"
                          class="mini-action-btn soft"
                          title="Tinjau rincian item, pajak & pengaju Invoice sebelum menyetujui"
                          @click="openReviewModal('INVOICE', inv)"
                        >
                          Tinjau
                        </button>
                        <button
                          type="button"
                          class="mini-action-btn approve-ok"
                          :disabled="approvalBusyId === inv.id"
                          title="Setujui Invoice & aktifkan cetak"
                          @click="approveDocument('INVOICE', inv)"
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          class="mini-action-btn revise-warn"
                          :disabled="approvalBusyId === inv.id"
                          @click="openRejectModal('INVOICE', inv)"
                        >
                          Revisi
                        </button>
                      </template>
                    </template>
                    <template v-else-if="inv.status !== 'VOID' && inv.approvalStatus === 'REJECTED'">
                      <button
                        v-if="auth.hasPermission('revenue:create')"
                        type="button"
                        class="mini-action-btn warn"
                        @click="openResubmitModal('INVOICE', inv)"
                      >
                        Ajukan Ulang
                      </button>
                    </template>
                    <template v-else-if="['ISSUED', 'PARTIALLY_PAID'].includes(inv.status) && inv.approvalStatus === 'APPROVED'">
                      <button
                        v-if="auth.hasPermission('payment:create')"
                        type="button"
                        class="mini-action-btn soft"
                        @click="openPayModal(inv)"
                      >
                        Catat Bayar
                      </button>
                    </template>

                    <!-- Button 3: Cetak Invoice (TERKUNCI / DISABLED sebelum disetujui Manajer Keuangan) -->
                    <button
                      type="button"
                      class="mini-action-btn"
                      :class="inv.approvalStatus === 'APPROVED' && inv.status !== 'VOID' ? 'navy' : 'locked-print'"
                      :disabled="inv.approvalStatus !== 'APPROVED' || inv.status === 'VOID'"
                      :title="
                        inv.status === 'VOID'
                          ? 'Invoice HANGUS'
                          : inv.approvalStatus === 'APPROVED'
                            ? 'Cetak Invoice resmi'
                            : 'Terkunci: Menunggu approval Manajer Keuangan sebelum dapat dicetak'
                      "
                      @click="openPrintInvoice(inv)"
                    >
                      Cetak
                    </button>

                    <button
                      v-if="['ISSUED', 'REJECTED'].includes(inv.status) && Number(inv.paidAmount) === 0 && auth.hasPermission('revenue:create')"
                      type="button"
                      class="mini-action-btn danger"
                      @click="openVoidModal(inv)"
                    >
                      Hangus
                    </button>
                    <button
                      v-if="inv.status === 'VOID' && auth.hasPermission('revenue:create')"
                      type="button"
                      class="mini-action-btn"
                      @click="reissueInvoice(inv)"
                    >
                      Terbit Ulang
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <TablePagination
          v-model:page="invPage"
          v-model:pageSize="pageSize"
          :total-items="filteredInvoices.length"
          item-label="invoice"
        />
      </section>

      <!-- Multi-Invoice Contracts / Sales Orders -->
      <section v-if="filteredSalesOrders.length > 0" class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Kontrak &amp; Kegiatan Multi-Invoice</h2>
            <span class="card-sub">Terbitkan invoice DP / Termin / Pelunasan / Sewa Tambahan dari induk kegiatan yang sama</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th style="width: 42px;">#</th>
                <th>No. Kontrak</th>
                <th>Pelanggan &amp; Unit</th>
                <th class="col-num">Nilai Kontrak</th>
                <th class="col-num">Invoice Terbit</th>
                <th class="col-num">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(so, idx) in paginatedSalesOrders" :key="so.id">
                <td class="row-num-cell">{{ (soPage - 1) * pageSize + idx + 1 }}</td>
                <td class="mono-code">{{ so.docNumber }}</td>
                <td>
                  <strong>{{ so.customer?.name }}</strong>
                  <span class="unit-mini-tag">{{ so.businessUnit?.code?.replace('BU-', '') }}</span>
                </td>
                <td class="col-num money">{{ formatRupiah(so.totalAmount) }}</td>
                <td class="col-num">{{ so.customerInvoices?.length || 0 }} faktur</td>
                <td class="col-num">
                  <button
                    v-if="auth.hasPermission('revenue:create')"
                    type="button"
                    class="mini-action-btn"
                    @click="openCreateInvoice(so)"
                  >
                    + Invoice Termin / Tambahan
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <TablePagination
          v-model:page="soPage"
          v-model:pageSize="pageSize"
          :total-items="filteredSalesOrders.length"
          item-label="kontrak"
        />
      </section>
    </div>

    <!-- ==================== TAB 5: KATALOG LAYANAN 4 UNIT & PELANGGAN ==================== -->
    <div v-else class="rev-stack">
      <section class="poital-card table-card-flush">
        <div class="dropx-card-head">
          <div class="dropx-head-top">
            <div>
              <h2 class="card-title">Katalog Layanan &amp; Mapping COA (4 Unit)</h2>
              <span class="card-sub">Kode layanan dibuat otomatis oleh sistem; tarif, kategori, COA Pertor 310, dan pajak dapat diperbarui kapan saja</span>
            </div>
          </div>
          <div class="dropx-filter-row">
            <div class="dropx-search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                v-model="searchQuery"
                type="search"
                class="dropx-search-input"
                placeholder="Cari kode layanan, nama, COA..."
              />
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Kode &amp; Unit</th>
                <th>Nama Layanan &amp; Kategori</th>
                <th>Kode COA</th>
                <th>Skema Pajak</th>
                <th class="col-num">Tarif Satuan</th>
                <th class="col-num">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in paginatedProducts" :key="p.id">
                <td>
                  <div class="mono-code">{{ p.sku }}</div>
                  <span class="unit-mini-tag">{{ p.businessUnit?.code?.replace('BU-', '') }}</span>
                </td>
                <td>
                  <strong>{{ p.name }}</strong>
                  <div class="cell-sub">{{ p.category }}{{ p.location ? ` · ${p.location}` : '' }} · per {{ p.unit }}</div>
                </td>
                <td class="mono-code">{{ p.revenueAccountCode }}</td>
                <td>
                  <span class="tag-pill ok">{{ getTaxSchemeShort(p.taxScheme) }}</span>
                  <div class="cell-sub">{{ p.taxInclusive !== false ? 'Include Pajak' : 'Exclude Pajak' }}</div>
                </td>
                <td class="col-num"><strong class="money">{{ formatRupiah(p.unitPrice) }}</strong></td>
                <td class="col-num">
                  <button v-if="auth.hasPermission('revenue:create')" type="button" class="mini-action-btn soft" @click="openEditProductModal(p)">
                    Edit Layanan
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <TablePagination
          v-model:page="prodPage"
          v-model:pageSize="pageSize"
          :total-items="filteredProducts.length"
          item-label="layanan"
        />
      </section>

      <!-- Master Pelanggan & Instansi -->
      <section class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Daftar Pelanggan &amp; Instansi ({{ customers.length }})</h2>
            <span class="card-sub">Profil pemungut pajak (FP 040 / FP 020 / FP 030 / Internal UT) otomatis diterapkan saat menerbitkan tagihan</span>
          </div>
          <button v-if="auth.hasPermission('revenue:create')" type="button" class="pill-btn-soft" @click="addCustModalOpen = true">
            + Pelanggan Baru
          </button>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Pelanggan / Instansi</th>
                <th>Tipe &amp; Profil Pajak</th>
                <th>PIC &amp; Kontak</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="customers.length === 0">
                <td colspan="4" class="empty-cell">Belum ada data pelanggan terdaftar.</td>
              </tr>
              <tr v-for="c in customers" :key="c.id">
                <td class="mono-code">{{ c.code }}</td>
                <td>
                  <strong>{{ c.name }}</strong>
                  <div class="cell-sub">{{ c.address }}</div>
                </td>
                <td>
                  <span class="tag-pill info">{{ formatOrgTypeLabel(c.organizationType) }}</span>
                  <div class="cell-sub">{{ c.taxCollectorProfile || 'FP_040_UMUM' }}</div>
                </td>
                <td>
                  <div>{{ c.contactPerson }}</div>
                  <div class="cell-sub">{{ c.phone }} · {{ c.email }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ==================== MODAL 1: UNIFIED INPUT BUKU HARIAN (KWITANSI / TANDA TERIMA / INVOICE) ==================== -->
    <ModalDialog :open="entryModalOpen" title="Input Buku Harian Penerimaan" maxWidth="1120px" @close="!addCustModalOpen && (entryModalOpen = false)">
      <AlertBanner
        v-if="modalErrorMsg"
        variant="danger"
        title="Gagal Menyimpan"
        :message="modalErrorMsg"
        style="margin-bottom: 12px;"
        @dismiss="modalErrorMsg = ''"
      />

      <div class="entry-mode-grid" role="tablist" aria-label="Pilih Jenis Pencatatan Buku Harian">
        <button
          v-if="auth.hasPermission('payment:create')"
          type="button"
          class="entry-mode-card"
          :class="{ active: entryMode === 'KWITANSI' }"
          @click="switchEntryMode('KWITANSI')"
        >
          <strong>Uang Masuk &rarr; Kwitansi</strong>
          <span>Dana sudah masuk tanpa invoice (KU / KU-UM)</span>
        </button>
        <button
          v-if="auth.hasPermission('payment:create')"
          type="button"
          class="entry-mode-card"
          :class="{ active: entryMode === 'TANDA_TERIMA' }"
          @click="switchEntryMode('TANDA_TERIMA')"
        >
          <strong>Serah Terima &rarr; Tanda Terima</strong>
          <span>Kamar Wisma / unit internal UT (TT)</span>
        </button>
        <button
          v-if="auth.hasPermission('revenue:create')"
          type="button"
          class="entry-mode-card"
          :class="{ active: entryMode === 'INVOICE' }"
          @click="switchEntryMode('INVOICE')"
        >
          <strong>Tagihan Baru &rarr; Invoice</strong>
          <span>Klien belum bayar, masuk Aging Piutang</span>
        </button>
      </div>

      <div class="auto-sku-strip" style="margin-bottom: 14px;">
        <span>{{ autoDocNumberHint.label }}:</span>
        <strong class="mono-code">{{ autoDocNumberHint.sample }}</strong>
      </div>

      <!-- MODE A: TAGIHAN BARU -> TERBITKAN INVOICE -->
      <form v-if="entryMode === 'INVOICE'" class="clean-form" @submit.prevent="submitCreateInvoice">
        <div class="form-2col">
          <div class="field">
            <label>Unit Bisnis</label>
            <select v-model="invoiceForm.businessUnitId" class="input" required @change="handleInvoiceUnitChange">
              <option v-for="u in operationalUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="field">
            <div class="field-head-row">
              <label>Pelanggan / Instansi</label>
              <button type="button" class="inline-link-btn" @click="openQuickAddCustomerForInvoice">+ Pelanggan Baru</button>
            </div>
            <select v-model="invoiceForm.customerId" class="input" required @change="handleInvoiceCustomerChange">
              <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }} ({{ formatOrgTypeLabel(c.organizationType) }})</option>
            </select>
          </div>
          <div class="field">
            <label>Jenis Tagihan</label>
            <select v-model="invoiceForm.invoiceType" class="input">
              <option v-for="t in INVOICE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>Profil Pemungut Pajak / FP</label>
            <select v-model="invoiceForm.taxCollectorProfile" class="input" @change="handleInvoiceCollectorChange">
              <option v-for="p in COLLECTOR_PROFILES" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Nama Kegiatan / Kontrak</label>
            <input v-model="invoiceForm.activityTitle" type="text" class="input" placeholder="Contoh: Pernikahan UTCC / Promise Termin 2 / Batch Tutor UT" required />
          </div>
          <div class="field">
            <label>Tanggal Kegiatan (Opsional)</label>
            <input v-model="invoiceForm.activityDate" type="text" class="input" placeholder="Contoh: 10 Oktober 2026" />
          </div>
        </div>

        <!-- Line Items (Clean 2-row card per item: zero clipping for Vol x Durasi x Harga) -->
        <div class="lines-box">
          <div class="lines-head">
            <strong>Rincian Item Tagihan (Vol &times; Durasi &times; Harga)</strong>
            <button type="button" class="pill-btn-outline" @click="addInvoiceLine">+ Tambah Baris</button>
          </div>
          <div v-for="(line, idx) in invoiceForm.lines" :key="idx" class="line-item-card">
            <div class="line-card-top" :class="{ 'has-del': invoiceForm.lines.length > 1 }">
              <div class="field">
                <label>Layanan Katalog</label>
                <Select
                  v-model="line.productServiceId"
                  :options="invoiceCatalogOptions"
                  optionLabel="optionLabel"
                  optionValue="id"
                  filter
                  :showClear="Boolean(line.productServiceId)"
                  filterPlaceholder="Ketik nama layanan..."
                  emptyFilterMessage="Layanan tidak ditemukan"
                  emptyMessage="Belum ada layanan untuk unit ini"
                  placeholder="Cari dari Katalog..."
                  class="poital-pv-select"
                  @update:model-value="(val) => handleInvoiceLineProductChange(idx, val)"
                />
              </div>
              <div class="field">
                <label>Uraian Item</label>
                <input v-model="line.description" type="text" class="input" placeholder="Uraian tagihan pada dokumen" required />
              </div>
              <button
                v-if="invoiceForm.lines.length > 1"
                type="button"
                class="mini-action-btn danger line-del-btn"
                title="Hapus baris"
                @click="removeInvoiceLine(idx)"
              >
                &times;
              </button>
            </div>
            <div class="line-card-bottom">
              <div class="field">
                <label>Volume</label>
                <input v-model.number="line.quantity" type="number" step="0.5" min="0.5" class="input" placeholder="1" required />
              </div>
              <div class="field">
                <label>Durasi</label>
                <input v-model.number="line.duration" type="number" step="0.5" min="0.5" class="input" placeholder="1" required />
              </div>
              <div class="field">
                <label>Harga Satuan (IDR)</label>
                <CurrencyInput v-model="line.unitPrice" :min="0" placeholder="0" required />
              </div>
              <div class="field line-sub-col">
                <label>Subtotal Baris</label>
                <div class="line-sub-val money">
                  {{ formatRupiah(Math.round(Number(line.quantity || 0) * Number(line.duration || 1) * Number(line.unitPrice || 0))) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Kode COA Pendapatan (Per Unit · v7)</label>
            <select v-model="invoiceForm.revenueAccountCode" class="input" required>
              <optgroup :label="invoiceGroupedCoas.unitGroupLabel">
                <option v-for="c in invoiceGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
              </optgroup>
              <optgroup v-if="invoiceGroupedCoas.others.length" :label="invoiceGroupedCoas.othersGroupLabel">
                <option v-for="c in invoiceGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
              </optgroup>
            </select>
          </div>
          <div class="field">
            <label>Skema Pajak PTNBH</label>
            <select v-model="invoiceForm.taxScheme" class="input">
              <option v-for="ts in TAX_SCHEMES" :key="ts.value" :value="ts.value">{{ ts.label }}</option>
            </select>
          </div>
        </div>

        <div :class="invoiceForm.invoiceType === 'UANG_MUKA' ? 'form-3col' : 'form-2col'">
          <div v-if="invoiceForm.invoiceType === 'UANG_MUKA'" class="field">
            <label>DP (%)</label>
            <input
              v-model.number="invoiceForm.dpPercent"
              type="number"
              min="0"
              max="100"
              class="input"
              placeholder="20"
              title="Persentase Uang Muka (mis. 20 untuk 20%, 0 untuk nominal penuh)"
            />
          </div>
          <div class="field">
            <label>Diskon (%)</label>
            <input v-model.number="invoiceForm.discountPercent" type="number" min="0" max="100" class="input" placeholder="0" />
          </div>
          <div class="field">
            <label>Jatuh Tempo (Hari)</label>
            <input v-model.number="invoiceForm.dueInDays" type="number" min="0" max="365" class="input" placeholder="14" />
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Rekening Tujuan Transfer</label>
            <select v-model="invoiceForm.bankAccountId" class="input">
              <option v-for="b in penerimaanBankAccounts" :key="b.id" :value="b.id">
                {{ b.code === 'BNK-MDR-01' ? 'Bank Mandiri Penerimaan (164-00-2022-999-5)' : `${b.bankName} (${b.accountNumberMasked})` }}
              </option>
            </select>
          </div>
          <div class="field check-align">
            <label class="check-label">
              <input v-model="invoiceForm.taxInclusive" type="checkbox" />
              <span>Harga sudah termasuk pajak (Inclusive)</span>
            </label>
          </div>
        </div>

        <!-- Collapsible Extra Metadata (PIC / SUB / Catatan) -->
        <button type="button" class="extra-accordion-btn" @click="showInvoiceExtraDetails = !showInvoiceExtraDetails">
          <span>{{ showInvoiceExtraDetails ? 'Sembunyikan' : '+ Detail Tambahan (PIC Kegiatan, SUB & Catatan Khusus)' }}</span>
          <span>{{ showInvoiceExtraDetails ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showInvoiceExtraDetails" class="extra-accordion-panel">
          <div class="form-2col">
            <div class="field">
              <label>Nama PIC Kegiatan (Opsional)</label>
              <input v-model="invoiceForm.picName" type="text" class="input" placeholder="Contoh: Rina / Tim MICE" />
            </div>
            <div class="field">
              <label>Klasifikasi SUB</label>
              <select v-model="invoiceForm.subCategory" class="input">
                <option value="Umum">Umum / Eksternal</option>
                <option value="Internal UT">Internal UT</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Catatan Klausul Khusus (Kosongkan untuk klausul pajak PTNBH otomatis)</label>
            <input v-model="invoiceForm.notes" type="text" class="input" placeholder="Otomatis terisi klausul pajak sesuai profil klien..." />
          </div>
        </div>

        <!-- Live PTNBH Preview -->
        <div class="live-tax-preview">
          <div><span>Bruto Dokumen</span><strong class="money">{{ formatRupiah(invoiceTaxPreview.bruto) }}</strong></div>
          <div><span>Nilai Jual / DPP</span><strong class="money">{{ formatRupiah(invoiceTaxPreview.dppPb1 > 0 ? invoiceTaxPreview.dppPb1 : invoiceTaxPreview.nilaiJual) }}</strong></div>
          <div><span>PPN 12%</span><strong class="money">{{ formatRupiah(invoiceTaxPreview.ppn) }}</strong></div>
          <div><span>PPh / PB1</span><strong class="money">{{ formatRupiah(invoiceTaxPreview.pph42 + invoiceTaxPreview.pph23 + invoiceTaxPreview.pph23Rate15 + invoiceTaxPreview.pph21 + invoiceTaxPreview.pb1) }}</strong></div>
          <div class="highlight"><span>Tagihan Neto Klien</span><strong class="money">{{ formatRupiah(invoiceTaxPreview.netReceivable) }}</strong></div>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="entryModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Terbitkan Invoice ke Daftar Tagihan</button>
        </div>
      </form>

      <!-- MODE B & C: UANG MASUK -> KWITANSI / TANDA TERIMA -->
      <form v-else class="clean-form" @submit.prevent="submitDirectReceipt">
        <div class="form-2col">
          <div class="field">
            <label>Unit Bisnis</label>
            <select v-model="directForm.businessUnitId" class="input" required @change="handleDirectUnitChange">
              <option v-for="u in operationalUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Pilih Layanan dari Katalog (Opsional)</label>
            <Select
              v-model="directForm.productServiceId"
              :options="directCatalogOptions"
              optionLabel="optionLabel"
              optionValue="id"
              filter
              :showClear="Boolean(directForm.productServiceId)"
              filterPlaceholder="Ketik nama layanan..."
              emptyFilterMessage="Layanan tidak ditemukan"
              emptyMessage="Belum ada layanan untuk unit ini"
              placeholder="Isi manual atau cari layanan..."
              class="poital-pv-select"
              @update:model-value="handleDirectProductChange"
            />
          </div>
          <div class="field">
            <label>{{ entryMode === 'TANDA_TERIMA' ? 'Sudah Terima Dari (Unit / PPK UT)' : 'Sudah Terima Dari (Nama Pembayar / Instansi)' }}</label>
            <input
              v-model="directForm.payerName"
              type="text"
              list="payer-customer-list"
              class="input"
              :placeholder="entryMode === 'TANDA_TERIMA' ? 'Contoh: PPK FST / DSDM / LPPM - Satker UT' : 'Ketik bebas atau pilih pelanggan terdaftar...'"
              required
              @change="handleDirectPayerInput"
            />
            <datalist id="payer-customer-list">
              <option v-for="c in customers" :key="c.id" :value="c.name" />
            </datalist>
          </div>
          <div class="field">
            <label>Rincian Layanan / Objek</label>
            <input
              v-model="directForm.rincianLabel"
              type="text"
              class="input"
              :placeholder="entryMode === 'TANDA_TERIMA' ? 'Contoh: Kamar Wisma / Ruang Sidang / Konsumsi UT' : 'Contoh: Kamar / Green Laundry / Kapitasi BPJS'"
              required
            />
          </div>
        </div>

        <div :class="isDirectUnitKlinik ? 'form-2col' : ''">
          <div class="field">
            <label>Untuk Pembayaran / Uraian Kegiatan</label>
            <input
              v-model="directForm.activityTitle"
              type="text"
              class="input"
              :placeholder="entryMode === 'TANDA_TERIMA' ? 'Contoh: Kegiatan Workshop / Pra Purnabakti Unit UT' : 'Contoh: Kegiatan Tamu Umum Wisma / Rawat Jalan / Pelatihan'"
              required
            />
          </div>
          <div v-if="isDirectUnitKlinik" class="field">
            <label>No. Nota Aplikasi Poliklinik (Opsional)</label>
            <input v-model="directForm.externalInvoiceNo" type="text" class="input" placeholder="Contoh: INV-0038868 (dari sistem klinik)" />
          </div>
        </div>

        <!-- Quick Vol x Durasi calculator when a catalog item is selected (matches BKU: 1 kmr x 2 mlm x Rp 550.000) -->
        <div v-if="directUnitPrice > 0" class="direct-calc-strip">
          <div class="direct-calc-field">
            <label>Vol</label>
            <input v-model.number="directQty" type="number" step="0.5" min="0.5" class="input" @input="applyDirectQtyCalc" />
          </div>
          <span class="direct-calc-op">&times;</span>
          <div class="direct-calc-field">
            <label>Durasi{{ directDurationUnit ? ` (${directDurationUnit})` : '' }}</label>
            <input v-model.number="directDuration" type="number" step="0.5" min="0.5" class="input" @input="applyDirectQtyCalc" />
          </div>
          <span class="direct-calc-op">&times;</span>
          <div class="direct-calc-rate">
            <span>Tarif Katalog</span>
            <strong class="money">{{ formatRupiah(directUnitPrice) }}</strong>
          </div>
          <span class="direct-calc-op">=</span>
          <div class="direct-calc-rate">
            <span>Otomatis Terisi</span>
            <strong class="money text-pos">{{ formatRupiah(Math.round(Number(directQty || 1) * Number(directDuration || 1) * Number(directUnitPrice || 0))) }}</strong>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Nominal Masuk Rekening (IDR)</label>
            <CurrencyInput v-model="directForm.grossAmount" :min="1" required />
          </div>
          <div class="field">
            <label>Tanggal Masuk / Terima</label>
            <input v-model="directForm.paymentDate" type="date" class="input" required />
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Kode COA Pendapatan (Per Unit · v7)</label>
            <select v-model="directForm.revenueAccountCode" class="input" required>
              <optgroup :label="directGroupedCoas.unitGroupLabel">
                <option v-for="c in directGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
              </optgroup>
              <optgroup v-if="directGroupedCoas.others.length" :label="directGroupedCoas.othersGroupLabel">
                <option v-for="c in directGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
              </optgroup>
            </select>
          </div>
          <div class="field">
            <label>Skema Pajak PTNBH</label>
            <select v-model="directForm.taxScheme" class="input">
              <option v-for="ts in TAX_SCHEMES" :key="ts.value" :value="ts.value">{{ ts.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Profil Pemungut Pajak / FP</label>
            <select v-model="directForm.taxCollectorProfile" class="input" @change="handleDirectCollectorChange">
              <option v-for="p in COLLECTOR_PROFILES" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>{{ directForm.method === 'CASH' ? 'Kas Penerima' : 'Rekening Bank Penerima' }}</label>
            <input v-if="directForm.method === 'CASH'" type="text" class="input" value="Kas Tunai Loket (110101010100)" disabled />
            <select v-else v-model="directForm.bankAccountId" class="input">
              <option v-for="b in penerimaanBankAccounts" :key="b.id" :value="b.id">
                {{ b.code === 'BNK-MDR-01' ? 'Bank Mandiri Penerimaan (164-00-2022-999-5)' : b.bankName }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-3col">
          <div class="field">
            <label>Metode Pembayaran</label>
            <select v-model="directForm.method" class="input">
              <option v-for="m in PAYMENT_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div v-if="entryMode === 'KWITANSI'" class="field">
            <label>Jenis Kwitansi</label>
            <select v-model="directForm.receiptType" class="input" @change="handleDirectReceiptTypeChange">
              <option value="KUITANSI">Kwitansi Pelunasan (KU-001)</option>
              <option value="KUITANSI_UM">Kwitansi Uang Muka (KU-UM)</option>
              <option value="LANGSUNG">Catat Buku Harian Saja</option>
            </select>
          </div>
          <div v-else class="field">
            <label>Tahap Pembayaran (Tanda Terima)</label>
            <select v-model="directForm.paymentStage" class="input">
              <option value="PELUNASAN">Pelunasan</option>
              <option value="UANG_MUKA">Uang Muka (DP)</option>
              <option value="TERMIN">Termin</option>
            </select>
          </div>
          <div class="field check-align">
            <label class="check-label">
              <input v-model="directForm.taxInclusive" type="checkbox" />
              <span>Nominal sudah termasuk pajak (Inclusive)</span>
            </label>
          </div>
        </div>

        <!-- Collapsible Detail Tambahan (NPWP/KTP, Alamat, Tgl Kegiatan, Tgl Setor, PIC/SUB, Refund) -->
        <button type="button" class="extra-accordion-btn" @click="showDirectExtraDetails = !showDirectExtraDetails">
          <span>
            {{
              showDirectExtraDetails
                ? 'Sembunyikan Detail Tambahan'
                : entryMode === 'TANDA_TERIMA'
                  ? '+ Detail Kegiatan, Tanggal Setor Bank, PIC & Lebih Bayar / Refund'
                  : '+ Detail Faktur Pajak (NPWP/KTP, Alamat), Tgl Kegiatan, Tgl Setor, PIC & Refund'
            }}
          </span>
          <span>{{ showDirectExtraDetails ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showDirectExtraDetails" class="extra-accordion-panel">
          <div class="form-3col">
            <div class="field">
              <label>No. KTP / NPWP Pembayar</label>
              <input v-model="directForm.payerTaxId" type="text" class="input" placeholder="Opsional untuk Faktur Pajak" />
            </div>
            <div class="field">
              <label>Tanggal Kegiatan</label>
              <input v-model="directForm.activityDate" type="text" class="input" placeholder="Contoh: 01-03 Nov 2026" />
            </div>
            <div class="field">
              <label>Tanggal Setor Bank</label>
              <input v-model="directForm.depositDate" type="date" class="input" />
            </div>
          </div>
          <div class="form-3col">
            <div class="field">
              <label>Alamat Pembayar</label>
              <input v-model="directForm.payerAddress" type="text" class="input" placeholder="Untuk cetak Kwitansi & Perincian Pajak" />
            </div>
            <div class="field">
              <label>PIC Kegiatan</label>
              <input v-model="directForm.picName" type="text" class="input" placeholder="Nama PIC penanggung jawab" />
            </div>
            <div class="field">
              <label>No. Referensi Bank</label>
              <input v-model="directForm.referenceNo" type="text" class="input" placeholder="Otomatis TRF-xxxxxx" />
            </div>
          </div>
          <div :class="Number(directForm.overpaymentAmount) > 0 ? 'form-3col' : 'form-2col'">
            <div class="field">
              <label>Lebih Bayar / Refund (IDR)</label>
              <CurrencyInput v-model="directForm.overpaymentAmount" :min="0" />
            </div>
            <div v-if="Number(directForm.overpaymentAmount) <= 0" class="field">
              <label>Klasifikasi SUB (Sinkron Profil Pajak)</label>
              <select v-model="directForm.subCategory" class="input">
                <option value="Umum">Umum / Eksternal</option>
                <option value="Internal UT">Internal UT</option>
              </select>
            </div>
            <div v-if="Number(directForm.overpaymentAmount) > 0" class="field">
              <label>Bank &amp; No. Rek Penerima Refund</label>
              <div class="inline-2">
                <input v-model="directForm.refundBankName" type="text" class="input" placeholder="Bank BRI/BCA" />
                <input v-model="directForm.refundAccountNumber" type="text" class="input" placeholder="No. Rekening" />
              </div>
            </div>
            <div v-if="Number(directForm.overpaymentAmount) > 0" class="field">
              <label>Atas Nama Rekening Refund</label>
              <input v-model="directForm.refundAccountHolder" type="text" class="input" placeholder="a.n. Penerima pengembalian" />
            </div>
          </div>
        </div>

        <div class="proof-upload-box">
          <div class="proof-upload-head">
            <div>
              <strong>Bukti Pembayaran / Transfer (Opsional)</strong>
              <div class="cell-sub">Unggah foto struk / tangkapan layar m-banking (JPG, PNG, WebP, atau PDF · maks 4 MB)</div>
            </div>
            <label class="pill-btn-outline" style="cursor: pointer;">
              {{ directProofDataUrl ? 'Ganti File' : 'Pilih Gambar / PDF' }}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display: none;" @change="handleDirectProofChange" />
            </label>
          </div>
          <div v-if="directProofDataUrl" class="proof-thumb-row">
            <img v-if="directProofDataUrl.startsWith('data:image/')" :src="directProofDataUrl" alt="Pratinjau bukti bayar" class="proof-thumb" />
            <span v-else class="tag-pill info">PDF</span>
            <span class="proof-file-name">{{ directProofFileName }}</span>
            <button type="button" class="mini-action-btn danger" @click="directProofDataUrl = ''; directProofFileName = ''">Hapus</button>
          </div>
        </div>

        <div class="live-tax-preview">
          <div><span>Bruto</span><strong class="money">{{ formatRupiah(directTaxPreview.bruto) }}</strong></div>
          <div><span>DPP / Nilai Jual</span><strong class="money">{{ formatRupiah(directTaxPreview.dppPb1 > 0 ? directTaxPreview.dppPb1 : directTaxPreview.nilaiJual) }}</strong></div>
          <div><span>PPN 12%</span><strong class="money">{{ formatRupiah(directTaxPreview.ppn) }}</strong></div>
          <div><span>PB1 / PPh</span><strong class="money">{{ formatRupiah(directTaxPreview.pb1 + directTaxPreview.pph42 + directTaxPreview.pph23 + directTaxPreview.pph23Rate15 + directTaxPreview.pph21) }}</strong></div>
          <div class="highlight">
            <span>Bersih PMO</span>
            <strong class="money">
              {{
                formatRupiah(
                  Math.max(
                    0,
                    directTaxPreview.netReceivable -
                      (directTaxPreview.ppnWithheld ? 0 : directTaxPreview.ppn) -
                      directTaxPreview.pb1 -
                      (directTaxPreview.pphWithheld ? 0 : directTaxPreview.pph42 + directTaxPreview.pph23Rate15) -
                      directTaxPreview.pph21
                  )
                )
              }}
            </strong>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="entryModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">
            {{ entryMode === 'TANDA_TERIMA' ? 'Simpan & Terbitkan Tanda Terima' : 'Simpan & Terbitkan Kwitansi' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 3: IMPORT CSV BUKU HARIAN ==================== -->
    <ModalDialog :open="importCsvModalOpen" title="Import Rekap Harian (CSV)" maxWidth="780px" @close="importCsvModalOpen = false">
      <form class="clean-form" @submit.prevent="submitImportCsv">
        <div class="form-2col">
          <div class="field">
            <label>Unit Bisnis</label>
            <select v-model="csvForm.businessUnitId" class="input" required @change="handleCsvUnitChange">
              <option v-for="u in operationalUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Skema Pajak Default</label>
            <select v-model="csvForm.defaultTaxScheme" class="input">
              <option v-for="ts in TAX_SCHEMES" :key="ts.value" :value="ts.value">{{ ts.label }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Kode COA Default (Per Unit · v7)</label>
          <select v-model="csvForm.defaultRevenueAccountCode" class="input" required>
            <optgroup :label="csvGroupedCoas.unitGroupLabel">
              <option v-for="c in csvGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
            <optgroup v-if="csvGroupedCoas.others.length" :label="csvGroupedCoas.othersGroupLabel">
              <option v-for="c in csvGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
          </select>
        </div>

        <div class="btn-row">
          <input type="file" accept=".csv,.txt" @change="handleCsvFileUpload" />
          <button type="button" class="mini-action-btn soft" @click="loadSampleDirectCsv">Muat Contoh CSV (Sesuai Unit)</button>
        </div>

        <div class="field">
          <label>Isi CSV (Kolom: Tanggal,Nama,Kegiatan,Rincian,Nominal,COA,SkemaPajak,NoInvEksternal)</label>
          <textarea v-model="csvForm.rawContent" rows="7" class="input" required></textarea>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="importCsvModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Impor ke Buku Harian</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 4: CATAT PEMBAYARAN INVOICE ==================== -->
    <ModalDialog :open="paymentModalOpen" title="Catat Pembayaran & Terbitkan Kuitansi" maxWidth="720px" @close="paymentModalOpen = false">
      <form v-if="selectedInvoiceForPay" class="clean-form" @submit.prevent="submitPayment">
        <div class="pay-banner">
          <div>
            <strong>{{ selectedInvoiceForPay.docNumber }}</strong>
            <div class="cell-sub">{{ selectedInvoiceForPay.customer?.name }} · {{ selectedInvoiceForPay.activityTitle }}</div>
          </div>
          <div class="col-num">
            <span class="cell-sub">Sisa Tagihan</span>
            <strong class="money">{{ formatRupiah(selectedInvoiceForPay.balanceDue) }}</strong>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Nominal Masuk Rekening (IDR)</label>
            <CurrencyInput v-model="paymentForm.grossAmount" :min="1" required />
          </div>
          <div class="field">
            <label>Tanggal Masuk Bank</label>
            <input v-model="paymentForm.paymentDate" type="date" class="input" required />
          </div>
          <div class="field">
            <label>Metode Pembayaran</label>
            <select v-model="paymentForm.method" class="input">
              <option value="BANK_TRANSFER">Transfer Bank Mandiri</option>
              <option value="VIRTUAL_ACCOUNT_SIMULATED">Virtual Account</option>
              <option value="QRIS_SIMULATED">QRIS</option>
              <option value="CASH">Tunai</option>
            </select>
          </div>
          <div class="field">
            <label>Jenis Bukti Bayar</label>
            <select v-model="paymentForm.receiptType" class="input">
              <option value="KUITANSI">Kuitansi Pelunasan (KU)</option>
              <option value="KUITANSI_UM">Kuitansi Uang Muka (KU-UM)</option>
              <option value="TANDA_TERIMA">Tanda Terima Internal UT</option>
            </select>
          </div>
          <div class="field">
            <label>No. Referensi Transfer</label>
            <input v-model="paymentForm.referenceNo" type="text" class="input" required />
          </div>
          <div class="field">
            <label>No. Bukti Potong PPh / PPN (Jika Ada)</label>
            <input v-model="paymentForm.withholdingSlipNo" type="text" class="input" placeholder="Opsional (FP 020/030/PPh)" />
          </div>
        </div>

        <div class="proof-upload-box">
          <div class="proof-upload-head">
            <div>
              <strong>Bukti Transfer / Pembayaran (Opsional)</strong>
              <div class="cell-sub">JPG, PNG, WebP, atau PDF (maks 4 MB)</div>
            </div>
            <label class="mini-action-btn soft" style="cursor: pointer;">
              {{ payProofDataUrl ? 'Ganti File' : 'Pilih Gambar / PDF' }}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display: none;" @change="handlePayProofChange" />
            </label>
          </div>
          <div v-if="payProofDataUrl" class="proof-thumb-row">
            <img v-if="payProofDataUrl.startsWith('data:image/')" :src="payProofDataUrl" alt="Pratinjau bukti transfer" class="proof-thumb" />
            <span v-else class="tag-pill info">PDF</span>
            <span class="proof-file-name">{{ payProofFileName }}</span>
            <button type="button" class="mini-action-btn danger" @click="payProofDataUrl = ''; payProofFileName = ''">Hapus</button>
          </div>
        </div>

        <label class="check-label">
          <input v-model="paymentForm.allowOverpayment" type="checkbox" />
          <span>Izinkan Lebih Bayar (selisih otomatis dicatat sebagai Pengembalian Dana di Surat Pajak)</span>
        </label>

        <div v-if="paymentForm.allowOverpayment" class="extra-accordion-panel">
          <div class="form-3col">
            <div class="field">
              <label>Bank Penerima Pengembalian</label>
              <input v-model="paymentForm.refundBankName" type="text" class="input" placeholder="Contoh: Bank BRI" />
            </div>
            <div class="field">
              <label>No. Rekening Pengembalian</label>
              <input v-model="paymentForm.refundAccountNumber" type="text" class="input" placeholder="Contoh: 1173-01-..." />
            </div>
            <div class="field">
              <label>Atas Nama Rekening</label>
              <input v-model="paymentForm.refundAccountHolder" type="text" class="input" placeholder="a.n. Klien / Yayasan" />
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="paymentModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan &amp; Terbitkan Bukti</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 5: HANGUS (VOID) INVOICE ==================== -->
    <ModalDialog :open="voidModalOpen" title="Batalkan (HANGUS) Invoice" maxWidth="480px" @close="voidModalOpen = false">
      <form v-if="selectedInvoiceForVoid" class="clean-form" @submit.prevent="submitVoidInvoice">
        <p class="cell-sub">
          Invoice <strong>{{ selectedInvoiceForVoid.docNumber }}</strong> akan ditandai <strong>HANGUS</strong> dan jurnal piutangnya otomatis dibalik.
        </p>
        <div class="field">
          <label>Alasan Pembatalan</label>
          <input v-model="voidReason" type="text" class="input" placeholder="Contoh: Revisi nominal/jadwal kegiatan klien" required />
        </div>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="voidModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-danger">Tandai HANGUS</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 6: EDIT LAYANAN & COA ==================== -->
    <ModalDialog :open="editProdModalOpen" title="Edit Layanan, Tarif & Mapping COA" maxWidth="780px" @close="editProdModalOpen = false">
      <form v-if="selectedProdForEdit" class="clean-form" @submit.prevent="submitEditProduct">
        <div class="auto-sku-strip">
          <span>Kode Layanan (Sistem):</span>
          <strong class="mono-code">{{ selectedProdForEdit.sku }}</strong>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Nama Layanan</label>
            <input v-model="editProdForm.name" type="text" class="input" required />
          </div>
          <div class="field">
            <label>Kategori Layanan</label>
            <select v-model="editProdForm.category" class="input" required>
              <option v-for="cat in editProdCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
              <option value="__NEW__">+ Tambah Kategori Baru...</option>
            </select>
            <input
              v-if="editProdForm.category === '__NEW__'"
              v-model="editProdNewCategory"
              type="text"
              class="input"
              style="margin-top: 6px;"
              placeholder="Ketik nama kategori baru..."
              required
            />
          </div>
          <div class="field">
            <label>Lokasi / Rincian (Opsional)</label>
            <input v-model="editProdForm.location" type="text" class="input" placeholder="Contoh: Gedung UTCC / Poli Umum" />
          </div>
          <div class="field">
            <label>Satuan Hitung (per ...)</label>
            <select v-model="editProdForm.unit" class="input" required>
              <option v-for="u in UNIT_MEASURE_OPTIONS" :key="u.value" :value="u.value">{{ u.label }}</option>
              <option value="__CUSTOM__">+ Satuan Lain...</option>
            </select>
            <input
              v-if="editProdForm.unit === '__CUSTOM__'"
              v-model="editProdCustomUnit"
              type="text"
              class="input"
              style="margin-top: 6px;"
              placeholder="Contoh: Sesi / Lembar / Kg"
              required
            />
          </div>
        </div>

        <div class="field">
          <label>Tarif Satuan (IDR)</label>
          <CurrencyInput v-model="editProdForm.unitPrice" :min="0" required />
        </div>

        <div class="field">
          <label>Kode COA Pendapatan (Per Unit · v7)</label>
          <select v-model="editProdForm.revenueAccountCode" class="input" required>
            <optgroup :label="editProdGroupedCoas.unitGroupLabel">
              <option v-for="c in editProdGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
            <optgroup v-if="editProdGroupedCoas.others.length" :label="editProdGroupedCoas.othersGroupLabel">
              <option v-for="c in editProdGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
          </select>
        </div>
        <div class="field">
          <label>Skema Pajak Default</label>
          <select v-model="editProdForm.taxScheme" class="input">
            <option v-for="ts in TAX_SCHEMES" :key="ts.value" :value="ts.value">{{ ts.label }}</option>
          </select>
        </div>
        <label class="check-label">
          <input v-model="editProdForm.taxInclusive" type="checkbox" />
          <span>Tarif sudah termasuk pajak (Inclusive)</span>
        </label>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="editProdModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan Perubahan</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 7: TAMBAH LAYANAN BARU ==================== -->
    <ModalDialog :open="addProdModalOpen" title="Tambah Layanan Baru" maxWidth="780px" @close="addProdModalOpen = false">
      <form class="clean-form" @submit.prevent="submitAddProduct">
        <div class="auto-sku-strip">
          <span>Kode Layanan:</span>
          <strong class="mono-code">{{ addProdSkuPreview }}</strong>
        </div>

        <div class="form-2col">
          <div class="field">
            <label>Unit Bisnis</label>
            <select
              v-model="addProdForm.businessUnitId"
              class="input"
              required
              @change="applyUnitDefaultsToAddForm(addProdForm.businessUnitId)"
            >
              <option v-for="u in operationalUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Kategori Layanan</label>
            <select v-model="addProdForm.category" class="input" required>
              <option v-for="cat in addProdCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
              <option value="__NEW__">+ Tambah Kategori Baru...</option>
            </select>
            <input
              v-if="addProdForm.category === '__NEW__'"
              v-model="addProdNewCategory"
              type="text"
              class="input"
              style="margin-top: 6px;"
              placeholder="Ketik kategori baru (sistem cek duplikat otomatis)"
              required
            />
          </div>
          <div class="field">
            <label>Nama Layanan</label>
            <input v-model="addProdForm.name" type="text" class="input" placeholder="Contoh: Pemeriksaan Poli Gigi / Sewa Aula" required />
          </div>
          <div class="field">
            <label>Lokasi / Keterangan Singkat (Opsional)</label>
            <input v-model="addProdForm.location" type="text" class="input" placeholder="Contoh: Klinik Pratama / UTCC" />
          </div>
          <div class="field">
            <label>Tarif Satuan (IDR)</label>
            <CurrencyInput v-model="addProdForm.unitPrice" :min="0" required />
          </div>
          <div class="field">
            <label>Satuan Hitung (per ...)</label>
            <select v-model="addProdForm.unit" class="input" required>
              <option v-for="u in UNIT_MEASURE_OPTIONS" :key="u.value" :value="u.value">{{ u.label }}</option>
              <option value="__CUSTOM__">+ Satuan Lain...</option>
            </select>
            <input
              v-if="addProdForm.unit === '__CUSTOM__'"
              v-model="addProdCustomUnit"
              type="text"
              class="input"
              style="margin-top: 6px;"
              placeholder="Contoh: Sesi / Lembar / Kg"
              required
            />
          </div>
        </div>
        <div class="field">
          <label>Kode COA Pendapatan (Per Unit · v7)</label>
          <select v-model="addProdForm.revenueAccountCode" class="input" required>
            <optgroup :label="addProdGroupedCoas.unitGroupLabel">
              <option v-for="c in addProdGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
            <optgroup v-if="addProdGroupedCoas.others.length" :label="addProdGroupedCoas.othersGroupLabel">
              <option v-for="c in addProdGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
          </select>
        </div>
        <div class="field">
          <label>Skema Pajak Default (Otomatis sesuai Unit)</label>
          <select v-model="addProdForm.taxScheme" class="input">
            <option v-for="ts in TAX_SCHEMES" :key="ts.value" :value="ts.value">{{ ts.label }}</option>
          </select>
        </div>
        <label class="check-label">
          <input v-model="addProdForm.taxInclusive" type="checkbox" />
          <span>Tarif sudah termasuk pajak (Inclusive)</span>
        </label>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="addProdModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan Layanan</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 8: PELANGGAN BARU ==================== -->
    <ModalDialog :open="addCustModalOpen" title="Daftarkan Pelanggan / Instansi" maxWidth="600px" @close="addCustModalOpen = false">
      <form class="clean-form" @submit.prevent="submitAddCustomer">
        <div class="form-2col">
          <div class="field">
            <label>Nama Pelanggan / Instansi</label>
            <input v-model="addCustForm.name" type="text" class="input" required />
          </div>
          <div class="field">
            <label>Tipe Organisasi</label>
            <select v-model="addCustForm.organizationType" class="input" @change="handleAddCustOrgTypeChange">
              <option value="CORPORATE">Korporasi / Swasta</option>
              <option value="GOVERNMENT">Instansi Pemerintah / PTN</option>
              <option value="SOE_BUMN">BUMN</option>
              <option value="INDIVIDUAL">Perorangan / Umum</option>
              <option value="INTERNAL_UT">Internal Satker UT (PPK)</option>
            </select>
          </div>
          <div class="field">
            <label>Profil Pemungut Pajak</label>
            <select v-model="addCustForm.taxCollectorProfile" class="input">
              <option v-for="p in COLLECTOR_PROFILES" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>NPWP / NIK</label>
            <input v-model="addCustForm.taxIdNpwp" type="text" class="input" />
          </div>
          <div class="field">
            <label>PIC / Kontak</label>
            <input v-model="addCustForm.contactPerson" type="text" class="input" required />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="addCustForm.email" type="email" class="input" required />
          </div>
          <div class="field">
            <label>Telepon</label>
            <input v-model="addCustForm.phone" type="text" class="input" required />
          </div>
          <div class="field">
            <label>Alamat</label>
            <input v-model="addCustForm.address" type="text" class="input" required />
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="addCustModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan Pelanggan</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 9: BUKTI POTONG & TAMPUNGAN ==================== -->
    <ModalDialog :open="slipModalOpen" title="Update Bukti Potong & Status Tampungan" maxWidth="480px" @close="slipModalOpen = false">
      <form v-if="selectedRowForSlip" class="clean-form" @submit.prevent="submitSlipUpdate">
        <div class="field">
          <label>Nomor Bukti Potong PPh / PPN dari Klien</label>
          <input v-model="slipForm.withholdingSlipNo" type="text" class="input" placeholder="Contoh: BP-23-2026-0091" />
        </div>
        <div class="field">
          <label>Tanggal Setor Bank</label>
          <input v-model="slipForm.depositDate" type="date" class="input" />
        </div>
        <label class="check-label">
          <input v-model="slipForm.taxAlreadyProcessed" type="checkbox" />
          <span>Sudah diolah di Rekening Tampungan / Kelolaan sebelumnya (kecualikan dari Surat Pajak)</span>
        </label>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="slipModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 10: LIHAT / UNGGAH BUKTI DOKUMEN ==================== -->
    <ModalDialog
      :open="proofModalOpen"
      :title="proofModalTargetType === 'INVOICE' ? 'Bukti Pendukung Invoice' : 'Bukti Pembayaran Buku Harian'"
      maxWidth="660px"
      @close="closeProofModal"
    >
      <div v-if="proofModalRow" class="clean-form">
        <div class="pay-banner">
          <div>
            <strong>{{ proofModalTargetType === 'INVOICE' ? proofModalRow.docNumber : proofModalRow.receiptNumber }}</strong>
            <div class="cell-sub">
              {{ proofModalTargetType === 'INVOICE' ? proofModalRow.customer?.name : proofModalRow.payerName }} · {{ proofModalRow.activityTitle }}
            </div>
          </div>
          <div class="col-num">
            <span class="cell-sub">{{ formatDate(proofModalTargetType === 'INVOICE' ? proofModalRow.issueDate : proofModalRow.paymentDate) }}</span>
            <strong class="money">{{ formatRupiah(proofModalTargetType === 'INVOICE' ? proofModalRow.totalAmount : proofModalRow.bankReceivedAmount) }}</strong>
          </div>
        </div>

        <div v-if="proofLoading" class="empty-cell">Memuat file bukti dokumen...</div>

        <div v-else-if="proofPreviewUrl" class="proof-viewer-box">
          <img
            v-if="proofPreviewMime.startsWith('image/')"
            :src="proofPreviewUrl"
            :alt="proofPreviewFileName"
            class="proof-full-img"
          />
          <iframe
            v-else
            :src="proofPreviewUrl"
            title="Pratinjau Bukti Dokumen PDF"
            class="proof-pdf-frame"
          ></iframe>
          <div class="proof-viewer-foot">
            <span class="cell-sub">{{ proofPreviewFileName }}</span>
            <button type="button" class="mini-action-btn soft" @click="downloadActiveProof">Unduh Bukti</button>
          </div>
        </div>

        <div v-else class="proof-empty-box">
          Belum ada gambar atau dokumen bukti terlampir untuk transaksi ini.
        </div>

        <div v-if="auth.hasPermission('payment:create') || auth.hasPermission('revenue:create')" class="proof-upload-box">
          <div class="proof-upload-head">
            <div>
              <strong>{{ proofPreviewUrl ? 'Ganti Bukti Dokumen' : 'Unggah Bukti Dokumen' }}</strong>
              <div class="cell-sub">JPG, PNG, WebP, atau PDF (maks 4 MB)</div>
            </div>
            <label class="mini-action-btn soft" style="cursor: pointer;">
              Pilih File
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display: none;" @change="handleStandaloneProofChange" />
            </label>
          </div>
          <div v-if="standaloneProofDataUrl" class="proof-thumb-row">
            <img v-if="standaloneProofDataUrl.startsWith('data:image/')" :src="standaloneProofDataUrl" alt="Pratinjau unggahan baru" class="proof-thumb" />
            <span v-else class="tag-pill info">PDF</span>
            <span class="proof-file-name">{{ standaloneProofFileName }}</span>
            <button type="button" class="pill-btn-navy" :disabled="proofUploading" @click="submitStandaloneProofUpload">
              {{ proofUploading ? 'Menyimpan...' : 'Simpan Bukti' }}
            </button>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="closeProofModal">Tutup</button>
        </div>
      </div>
    </ModalDialog>

    <!-- ==================== MODAL 11: MINTA REVISI / TOLAK DOKUMEN ==================== -->
    <ModalDialog
      :open="rejectModalOpen"
      :title="rejectTargetType === 'INVOICE' ? 'Minta Revisi Invoice' : 'Minta Revisi Kwitansi / Tanda Terima'"
      maxWidth="480px"
      @close="rejectModalOpen = false"
    >
      <form v-if="rejectTargetRow" class="clean-form" @submit.prevent="submitRejectDocument">
        <p class="cell-sub">
          Dokumen <strong>{{ rejectTargetType === 'INVOICE' ? rejectTargetRow.docNumber : rejectTargetRow.receiptNumber }}</strong>
          akan dikembalikan ke PIC pembuat dengan status <strong>Perlu Revisi</strong> (tombol Cetak tetap terkunci &amp; belum masuk jurnal).
        </p>
        <div class="field">
          <label>Catatan Revisi / Alasan Penolakan *</label>
          <input v-model="rejectReason" type="text" class="input" required minlength="4" placeholder="Cth: Nominal/COA belum sesuai bukti transfer" />
        </div>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="rejectModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-danger" :disabled="approvalBusyId === rejectTargetRow.id">Kirim Permintaan Revisi</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 12: REVISI & AJUKAN ULANG DOKUMEN ==================== -->
    <ModalDialog
      :open="resubmitModalOpen"
      :title="resubmitTargetType === 'INVOICE' ? 'Revisi & Ajukan Ulang Invoice' : 'Revisi & Ajukan Ulang Dokumen'"
      maxWidth="680px"
      @close="resubmitModalOpen = false"
    >
      <form v-if="resubmitTargetRow" class="clean-form" @submit.prevent="submitResubmitDocument">
        <div v-if="resubmitTargetRow.rejectionReason" class="overpay-note" style="margin-top: 0;">
          <strong>Catatan Manajer Keuangan:</strong> {{ resubmitTargetRow.rejectionReason }}
        </div>
        <div v-if="resubmitTargetType === 'PAYMENT'" class="form-2col">
          <div class="field">
            <label>Nama Pembayar *</label>
            <input v-model="resubmitForm.payerName" type="text" class="input" required />
          </div>
          <div class="field">
            <label>Nominal Masuk (Rp) *</label>
            <CurrencyInput v-model="resubmitForm.grossAmount" required />
          </div>
        </div>
        <div class="field">
          <label>Uraian Kegiatan *</label>
          <input v-model="resubmitForm.activityTitle" type="text" class="input" required />
        </div>
        <div class="field">
          <label>Rincian Layanan / Objek *</label>
          <input v-model="resubmitForm.rincianLabel" type="text" class="input" required />
        </div>
        <div class="field">
          <label>Kode COA Pendapatan (Per Unit · v7) *</label>
          <select v-model="resubmitForm.revenueAccountCode" class="input" required>
            <optgroup :label="resubmitGroupedCoas.unitGroupLabel">
              <option v-for="c in resubmitGroupedCoas.primary" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
            <optgroup v-if="resubmitGroupedCoas.others.length" :label="resubmitGroupedCoas.othersGroupLabel">
              <option v-for="c in resubmitGroupedCoas.others" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </optgroup>
          </select>
        </div>
        <div class="field">
          <label>Catatan Tambahan</label>
          <input v-model="resubmitForm.notes" type="text" class="input" placeholder="Opsional" />
        </div>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="resubmitModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy" :disabled="approvalBusyId === resubmitTargetRow.id">Ajukan Ulang ke Manajer</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 13: BATALKAN (VOID) DOKUMEN BUKU HARIAN ==================== -->
    <ModalDialog :open="voidPayModalOpen" title="Batalkan Dokumen Buku Harian" maxWidth="480px" @close="voidPayModalOpen = false">
      <form v-if="selectedPaymentForVoid" class="clean-form" @submit.prevent="submitVoidPayment">
        <p class="cell-sub">
          Dokumen <strong>{{ selectedPaymentForVoid.receiptNumber }}</strong> akan dibatalkan.
          <template v-if="selectedPaymentForVoid.status === 'CONFIRMED'">
            Jurnal pembalik otomatis akan diposting agar buku besar tetap seimbang.
          </template>
        </p>
        <div class="field">
          <label>Alasan Pembatalan *</label>
          <input v-model="voidPayReason" type="text" class="input" required minlength="4" placeholder="Cth: Salah input nominal / transaksi dobel" />
        </div>
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="voidPayModalOpen = false">Tutup</button>
          <button type="submit" class="pill-btn-danger" :disabled="approvalBusyId === selectedPaymentForVoid.id">Batalkan Dokumen</button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 14: TINJAU DETAIL DOKUMEN SEBELUM APPROVAL ==================== -->
    <ModalDialog
      :open="reviewModalOpen"
      :title="reviewTargetType === 'INVOICE' ? 'Tinjau Detail Invoice' : 'Tinjau Detail Kwitansi / Tanda Terima'"
      maxWidth="640px"
      @close="reviewModalOpen = false"
    >
      <div v-if="reviewTargetRow" class="clean-form">
        <div class="pay-banner">
          <div>
            <strong>{{ reviewTargetType === 'INVOICE' ? reviewTargetRow.docNumber : reviewTargetRow.receiptNumber }}</strong>
            <div class="cell-sub">
              {{ reviewTargetType === 'INVOICE' ? reviewTargetRow.customer?.name : reviewTargetRow.payerName }} ·
              {{ reviewTargetType === 'INVOICE' ? reviewTargetRow.businessUnit?.name : reviewTargetRow.businessUnitName }}
            </div>
          </div>
          <div class="col-num">
            <span class="tag-pill" :class="reviewTargetRow.approvalStatus === 'APPROVED' ? 'ok' : reviewTargetRow.approvalStatus === 'REJECTED' ? 'danger' : 'warn-soft'">
              {{ reviewTargetRow.approvalStatus === 'APPROVED' ? 'Disetujui' : reviewTargetRow.approvalStatus === 'REJECTED' ? 'Perlu Revisi' : 'Menunggu Approval' }}
            </span>
            <strong class="money" style="display: block; margin-top: 4px;">
              {{ formatRupiah(reviewTargetType === 'INVOICE' ? reviewTargetRow.totalAmount : reviewTargetRow.bankReceivedAmount) }}
            </strong>
          </div>
        </div>

        <div class="review-meta-grid">
          <div>
            <span>Pengaju / Operator</span>
            <strong>{{ reviewTargetType === 'INVOICE' ? (reviewTargetRow.createdByName || '-') : (reviewTargetRow.receivedByName || '-') }}</strong>
          </div>
          <div>
            <span>Tanggal Dokumen</span>
            <strong>{{ formatDate(reviewTargetType === 'INVOICE' ? reviewTargetRow.issueDate : reviewTargetRow.paymentDate) }}</strong>
          </div>
          <div>
            <span>Kode COA Pendapatan</span>
            <strong class="mono-code">{{ reviewTargetRow.revenueAccountCode || '-' }}</strong>
          </div>
          <div>
            <span>Skema Pajak &amp; FP</span>
            <strong>{{ getTaxSchemeShort(reviewTargetRow.taxScheme) }} · FP {{ reviewTargetRow.fakturPajakCode || '040' }}</strong>
          </div>
          <div style="grid-column: 1 / -1;">
            <span>Uraian Kegiatan &amp; Rincian</span>
            <strong>{{ reviewTargetRow.activityTitle || '-' }}</strong>
            <div class="cell-sub">{{ reviewTargetRow.rincianLabel || '' }}</div>
          </div>
        </div>

        <div v-if="reviewTargetType === 'INVOICE' && reviewTargetRow.lines?.length" class="lines-box">
          <div class="lines-head"><strong>Rincian Item Tagihan ({{ reviewTargetRow.lines.length }})</strong></div>
          <table class="clean-table compact">
            <thead>
              <tr>
                <th>Deskripsi</th>
                <th class="col-num">Vol</th>
                <th class="col-num">Tarif</th>
                <th class="col-num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in reviewTargetRow.lines" :key="l.id || l.description">
                <td>{{ l.description }}</td>
                <td class="col-num">{{ l.quantity }}<template v-if="Number(l.duration || 1) > 1"> &times; {{ l.duration }} {{ l.durationUnit || '' }}</template></td>
                <td class="col-num money">{{ formatRupiah(l.unitPrice) }}</td>
                <td class="col-num money"><strong>{{ formatRupiah(l.lineTotal) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="live-tax-preview">
          <div>
            <span>Nilai Jual / DPP</span>
            <strong class="money">{{ formatRupiah(reviewTargetRow.nilaiJual || reviewTargetRow.dppPb1 || 0) }}</strong>
          </div>
          <div>
            <span>PPN 12%</span>
            <strong class="money">{{ formatRupiah(reviewTargetRow.ppnAmount || 0) }}</strong>
          </div>
          <div>
            <span>PPh 4(2) / 23 / 21</span>
            <strong class="money">{{ formatRupiah((Number(reviewTargetRow.pph42Amount) || 0) + (Number(reviewTargetRow.pph23Amount) || 0) + (Number(reviewTargetRow.pph23Rate15Amount) || 0) + (Number(reviewTargetRow.pph21Amount) || 0)) }}</strong>
          </div>
          <div>
            <span>PB1 10%</span>
            <strong class="money">{{ formatRupiah(reviewTargetRow.pb1Amount || 0) }}</strong>
          </div>
          <div class="highlight">
            <span>{{ reviewTargetType === 'INVOICE' ? 'Tagihan Neto' : 'Nominal Masuk' }}</span>
            <strong class="money">{{ formatRupiah(reviewTargetType === 'INVOICE' ? reviewTargetRow.totalAmount : reviewTargetRow.bankReceivedAmount) }}</strong>
          </div>
        </div>

        <div v-if="reviewTargetRow.notes" class="cell-sub" style="padding: 8px 12px; background: #f8fafc; border-radius: 10px;">
          <strong>Catatan:</strong> {{ reviewTargetRow.notes }}
        </div>

        <div class="modal-foot">
          <button
            type="button"
            class="pill-btn-soft"
            @click="reviewModalOpen = false; openProofModal(reviewTargetRow, reviewTargetType)"
          >
            {{ (reviewTargetType === 'INVOICE' ? reviewTargetRow.invoiceProof : reviewTargetRow.paymentProof) ? 'Lihat Bukti Lampiran' : 'Unggah / Cek Bukti' }}
          </button>
          <template v-if="auth.hasPermission('payment:approve') && reviewTargetRow.status !== 'VOID' && reviewTargetRow.approvalStatus === 'PENDING_APPROVAL'">
            <button
              type="button"
              class="mini-action-btn revise-warn"
              style="padding: 8px 16px; font-size: 0.8rem;"
              @click="reviewModalOpen = false; openRejectModal(reviewTargetType, reviewTargetRow)"
            >
              Minta Revisi
            </button>
            <button
              type="button"
              class="mini-action-btn approve-ok"
              style="padding: 8px 18px; font-size: 0.8rem;"
              :disabled="approvalBusyId === reviewTargetRow.id"
              @click="reviewModalOpen = false; approveDocument(reviewTargetType, reviewTargetRow)"
            >
              Setujui Dokumen
            </button>
          </template>
          <button type="button" class="pill-btn-soft" @click="reviewModalOpen = false">Tutup</button>
        </div>
      </div>
    </ModalDialog>

    <!-- Formal Print Modal (Invoice KU-003 / Kuitansi KU-001 / Tanda Terima KU-002 / Surat Pajak) -->
    <PenerimaanPrintModal
      :open="printOpen"
      :mode="printMode"
      :data="printPayload"
      :bank-account="activePrintBankAccount"
      @close="printOpen = false"
    />
  </div>
</template>

<style scoped>
.poital-penerimaan {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 28px;
}

.rev-top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.rev-title-group {
  flex: 1;
  min-width: 260px;
}

.rev-title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: #111827;
}

.rev-subtitle {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.45;
  max-width: 680px;
}

.rev-top-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

/* DropX Integrated Table Card Header */
.table-card-flush {
  padding: 0 !important;
  overflow: hidden;
}

.dropx-card-head {
  padding: 18px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dropx-head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dropx-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.dropx-search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 290px;
  max-width: 100%;
}

.dropx-search-box svg {
  position: absolute;
  left: 11px;
  color: #6b7280;
  pointer-events: none;
}

.dropx-search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 34px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.dropx-search-input:focus {
  border-color: #034693;
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.2);
}

.dropx-pill-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dx-filter-tab {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.dx-filter-tab:hover:not(.active) {
  background: #f3f4f6;
  color: #111827;
}

.dx-filter-tab.active {
  background: #034693;
  color: #ffffff;
}

.dx-count {
  font-size: 11.5px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 9999px;
  background: #f3f4f6;
  color: #6b7280;
}

.dx-filter-tab.active .dx-count {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}

.dx-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.dx-filter-tab.active .dx-dot {
  background: #ffffff;
}

.dot-emerald { background: #10b981; }
.dot-blue { background: #3b82f6; }
.dot-sky { background: #0ea5e9; }
.dot-amber { background: #f59e0b; }
.dot-red { background: #ef4444; }

.bh-filter-pills {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.bh-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.bh-toolbar-selects {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pill-select.compact {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
}

.pill-select.sort-select {
  color: #111827;
}

.row-num-cell {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
  white-space: nowrap;
}

.bh-filter-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.bh-filter-pill:hover:not(.active) {
  background: #f3f4f6;
  color: #111827;
}

.bh-filter-pill.active {
  background: #034693;
  color: #ffffff;
}

.tag-pill.warn-soft {
  background: #fef3c7;
  color: #92400e;
}

.entry-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.entry-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}

.entry-mode-card strong {
  font-size: 0.85rem;
  color: #0b2144;
}

.entry-mode-card span {
  font-size: 0.74rem;
  color: #64748b;
  line-height: 1.3;
}

.entry-mode-card.active {
  background: #eff6ff;
  border-color: #0b2144;
  box-shadow: 0 0 0 2px rgba(11, 33, 68, 0.12);
}

.auto-sku-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 9px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  font-size: 0.8rem;
  color: #475569;
}

.poital-pv-select {
  width: 100%;
  min-width: 0;
  height: 44px;
  min-height: 44px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  border-radius: var(--radius-md, 10px) !important;
  border: 1px solid var(--border-subtle, #cbd5e1) !important;
  background: #ffffff !important;
  color: var(--text-primary, #0f172a) !important;
  font-size: 0.88rem;
  cursor: pointer;
}

:deep(.poital-pv-select .p-select-label) {
  padding: 8px 10px;
  font-size: 0.84rem;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.poital-pv-select .p-select-label.p-placeholder) {
  color: #64748b;
}

:deep(.poital-pv-select .p-select-dropdown) {
  color: #475569;
}

.mini-action-btn.proof-ok {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}

.proof-upload-box {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.proof-upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.84rem;
  color: #0b2144;
}

.proof-thumb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.proof-thumb {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
}

.proof-file-name {
  font-size: 0.8rem;
  color: #334155;
  flex: 1;
  min-width: 140px;
  word-break: break-all;
}

.proof-viewer-box {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  background: #f8fafc;
}

.proof-full-img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  background: #0f172a0a;
}

.proof-pdf-frame {
  width: 100%;
  height: 420px;
  border: none;
}

.proof-viewer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.proof-empty-box {
  padding: 20px;
  text-align: center;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.84rem;
}

@media (max-width: 680px) {
  .entry-mode-grid {
    grid-template-columns: 1fr;
  }
}

.pill-month-input,
.pill-select,
.pill-search-input {
  height: 36px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13.5px;
  font-weight: 400;
  color: #111827;
  outline: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.pill-month-input:focus,
.pill-select:focus,
.pill-search-input:focus {
  border-color: #034693;
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.2);
}

.pill-search-input {
  min-width: 240px;
}

.pill-btn-navy {
  height: 36px;
  border: 1px solid #034693;
  border-radius: 8px;
  padding: 0 16px;
  background: #034693;
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}
.pill-btn-navy:hover {
  background: #023470;
  border-color: #023470;
}

.pill-btn-soft {
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 14px;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}
.pill-btn-soft:hover { background: #f3f4f6; }

.pill-btn-danger {
  height: 36px;
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 0 16px;
  background: #ef4444;
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
}
.pill-btn-danger:hover { background: #dc2626; }

/* Unit Filter Compact Buttons */
.unit-filter-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.unit-pill {
  height: 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 10px;
  background: transparent;
  color: #6b7280;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.unit-pill:hover:not(.active) {
  background: #f3f4f6;
  color: #111827;
}
.unit-pill.active {
  background: #034693;
  color: #ffffff;
}

/* DropX Luminous 4-Card Gradient KPI Row */
.kpi-metric-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.dropx-kpi-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 20px;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: none;
  box-shadow: 0 4px 14px -4px rgba(17, 24, 39, 0.16);
}

.dropx-kpi-card::before,
.dropx-kpi-card::after {
  content: '';
  position: absolute;
  border-radius: 9999px;
  pointer-events: none;
}

.dropx-kpi-card::before {
  width: 124px;
  height: 124px;
  right: -28px;
  top: -28px;
  background: rgba(255, 255, 255, 0.12);
}

.dropx-kpi-card::after {
  width: 92px;
  height: 92px;
  right: 24px;
  bottom: -38px;
  background: rgba(255, 255, 255, 0.07);
}

.kpi-grad-navy { background: linear-gradient(135deg, #0b2144 0%, #034693 100%); }
.kpi-grad-emerald { background: linear-gradient(135deg, #22c55e 0%, #10b981 55%, #059669 100%); }
.kpi-grad-ocean { background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0284c7 100%); }
.kpi-grad-amber { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }

.unit-filter-bar-clean {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.kpi-top-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.kpi-label {
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.9);
}

.kpi-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-value {
  position: relative;
  z-index: 1;
  margin-top: 6px;
  font-size: clamp(1.25rem, 1.55vw, 1.5rem);
  line-height: 1.2;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}

.kpi-foot {
  position: relative;
  z-index: 1;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.84);
}

/* Sub-Nav Underline Strip & DropX Pure White Cards */
.rev-tab-strip,
.subtab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 6px;
}

.tab-pills {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: -7px;
}

.tab-pill {
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 13.5px;
  font-weight: 500;
  padding: 8px 12px 10px;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.tab-pill:hover {
  color: #111827;
}
.tab-pill.active {
  color: #034693;
  border-bottom-color: #034693;
  font-weight: 600;
}

.poital-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  min-width: 0;
}

.rev-stack { display: flex; flex-direction: column; gap: 16px; }
.split-2-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.card-title { margin: 0; font-size: 14.5px; font-weight: 600; letter-spacing: -0.015em; color: #111827; }
.card-sub { display: block; font-size: 13px; font-weight: 400; color: #6b7280; margin-top: 2px; }
.btn-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Aging Piutang Strip */
.aging-strip-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.aging-bucket-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  background: #ffffff;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  cursor: pointer;
  text-align: left;
  transition: transform 140ms ease, border-color 140ms ease;
}
.aging-bucket-card:hover { transform: translateY(-1px); border-color: #d1d5db; }
.aging-bucket-card span { font-size: 12.5px; font-weight: 400; color: #6b7280; }
.aging-bucket-card strong { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; color: #111827; }
.aging-bucket-card.warn strong { color: #d97706; }
.aging-bucket-card.danger strong { color: #ef4444; }
.aging-bucket-card.active { border-color: #034693; background: rgba(3, 70, 147, 0.04); }

/* Exact DropX Data Table */
.table-wrap { width: 100%; overflow-x: auto; }
.clean-table { width: 100%; border-collapse: collapse; }
.clean-table th {
  text-align: left;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: #6b7280;
  background: #fafafa;
  padding: 11px 12px;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.clean-table td {
  padding: 12px 12px;
  font-size: 13.5px;
  font-weight: 400;
  line-height: 20px;
  color: #111827;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
.clean-table tbody tr:hover td {
  background: rgba(249, 250, 251, 0.85);
}
.clean-table.compact td, .clean-table.compact th { padding: 10px 12px; font-size: 13px; }
.col-num,
.clean-table th.col-num { text-align: right; white-space: nowrap; }
.nowrap-cell { white-space: nowrap; }
.muted-money { color: #6b7280; }
.doc-link-btn {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.doc-link-btn:hover { text-decoration: underline; }
.payer-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.payer-line strong {
  font-weight: 500;
  color: #111827;
}
.desc-clamp {
  max-width: 260px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mono-sub {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: #6b7280;
}
.review-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}
.review-meta-grid > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.review-meta-grid span { font-size: 12px; color: #6b7280; }
.review-meta-grid strong { font-size: 13.5px; color: #111827; }
.empty-cell { text-align: center; padding: 32px !important; color: #6b7280; }
.row-void { opacity: 0.6; }
.summary-row td { background: #f9fafb; border-top: 1px solid #d1d5db; font-weight: 600; }

.mono-code { font-family: var(--font-mono); font-size: 12.5px; font-weight: 500; letter-spacing: -0.015em; color: #034693; }
.cell-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
.cell-warn { font-size: 12px; color: #d97706; font-weight: 500; margin-top: 2px; }
.unit-mini-tag {
  display: inline-block; padding: 1px 7px; border-radius: 9999px;
  background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 500;
}

/* DropX True Borderless Soft Rounded-Full Status Pills */
.tag-pill {
  display: inline-flex; align-items: center; padding: 2px 10px; height: 22px;
  border-radius: 9999px; font-size: 12px; font-weight: 500; white-space: nowrap; border: none;
}
.tag-pill.ok { background: rgba(16, 185, 129, 0.12); color: #059669; }
.tag-pill.info { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.tag-pill.muted { background: #f3f4f6; color: #4b5563; }
.tag-pill.danger { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
.tag-pill.warn-soft { background: rgba(245, 158, 11, 0.14); color: #d97706; }

.overdue-chip {
  display: inline-block; margin-top: 2px; padding: 2px 8px; border-radius: 9999px;
  background: rgba(239, 68, 68, 0.1); color: #dc2626; font-size: 11px; font-weight: 500;
}

.inline-actions { display: inline-flex; gap: 5px; justify-content: flex-end; flex-wrap: wrap; max-width: 190px; }
.mini-action-btn {
  border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 9px; height: 28px; font-size: 12px; font-weight: 500;
  background: #ffffff; color: #374151; cursor: pointer; white-space: nowrap;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}
.mini-action-btn:hover:not(:disabled) { background: #f3f4f6; color: #111827; }
.mini-action-btn.navy { background: #034693; border-color: #034693; color: #ffffff; }
.mini-action-btn.navy:hover:not(:disabled) { background: #023470; }
.mini-action-btn.soft { background: #ffffff; border-color: #e5e7eb; color: #374151; }
.mini-action-btn.warn { background: rgba(245, 158, 11, 0.12); border-color: transparent; color: #b45309; }
.mini-action-btn.danger { background: rgba(239, 68, 68, 0.1); border-color: transparent; color: #dc2626; }
.mini-action-btn.approve-ok { background: #10b981; border-color: #10b981; color: #ffffff; }
.mini-action-btn.approve-ok:hover:not(:disabled) { background: #059669; }
.mini-action-btn.revise-warn { background: rgba(245, 158, 11, 0.12); color: #b45309; border-color: transparent; }
.mini-action-btn.locked-print,
.mini-action-btn:disabled {
  background: #f3f4f6;
  border-color: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}
.bh-filter-pill.warn-pill { background: rgba(245, 158, 11, 0.12); color: #b45309; }
.bh-filter-pill.danger-pill { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
.tab-pending-dot {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; margin-left: 5px;
  border-radius: 9999px; background: #f59e0b; color: #ffffff;
  font-size: 11px; font-weight: 600; line-height: 1;
}

.overpay-note {
  margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: #fef9ed; color: #92400e; font-size: 0.8rem;
}
.text-pos { color: #059669; }

/* Clean Modal Forms */
.clean-form { display: flex; flex-direction: column; gap: 14px; }
.clean-form .input { height: 46px; min-height: 46px; font-size: 0.9rem; box-sizing: border-box; }
.clean-form textarea.input {
  height: auto;
  min-height: 144px;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.84rem;
  line-height: 1.5;
}
.clean-form :deep(.poital-pv-select) { height: 46px; min-height: 46px; font-size: 0.9rem; }
.form-2col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: end; }
.form-3col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }
.inline-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: end; }
.inline-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: end; }
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.field label { font-size: 0.8rem; font-weight: 650; color: var(--text-secondary); }
.field-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.inline-link-btn {
  border: none; background: transparent; padding: 0; color: #034693; font-size: 0.76rem; font-weight: 700; cursor: pointer;
}
.inline-link-btn:hover { text-decoration: underline; }
.pill-btn-outline {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 13px;
  background: #ffffff; color: #0b2144; font-size: 0.8rem; font-weight: 650; cursor: pointer;
  white-space: nowrap; transition: background 140ms ease, border-color 140ms ease;
}
.pill-btn-outline:hover { background: #eff6ff; border-color: #93c5fd; color: #034693; }
.check-align { justify-content: center; height: 46px; padding-bottom: 0; }
.check-label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.84rem; color: var(--text-primary); cursor: pointer; }

.lines-box {
  padding: 14px; border-radius: 14px; background: var(--bg-subtle); display: flex; flex-direction: column; gap: 12px;
}
.lines-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; }
.line-item-card {
  display: flex; flex-direction: column; gap: 10px; padding: 12px 14px;
  border-radius: 12px; background: #ffffff; border: 1px solid var(--border-subtle, #e2e8f0);
}
.line-card-top {
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; align-items: end;
}
.line-card-top.has-del {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 36px;
}
.line-del-btn { height: 46px; width: 36px; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem; padding: 0; }
.line-card-bottom {
  display: grid; grid-template-columns: 100px 100px minmax(180px, 1.2fr) minmax(150px, 0.9fr); gap: 12px; align-items: end;
}
.line-sub-col { text-align: right; }
.line-sub-val {
  min-height: 46px; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 12px; border-radius: var(--radius-md, 10px); background: #f8fafc; border: 1px solid #e2e8f0;
  font-size: 0.88rem; font-weight: 700; color: #0b2144; white-space: nowrap;
}
.direct-calc-strip {
  display: grid; grid-template-columns: 88px auto 116px auto minmax(110px, 1fr) auto minmax(120px, 1fr);
  gap: 8px; align-items: end; padding: 10px 12px; border-radius: 12px;
  background: #f8fafc; border: 1px solid #e2e8f0;
}
.direct-calc-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.direct-calc-field label { font-size: 0.7rem; font-weight: 650; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.direct-calc-op { padding-bottom: 11px; font-weight: 700; color: #64748b; text-align: center; }
.direct-calc-rate { display: flex; flex-direction: column; gap: 2px; padding-bottom: 6px; }
.direct-calc-rate span { font-size: 0.69rem; color: var(--text-secondary); }
.direct-calc-rate strong { font-size: 0.85rem; color: #0b2144; }

.extra-accordion-btn {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
  padding: 9px 14px; border-radius: 12px; border: 1px dashed #cbd5e1; background: #f8fafc;
  color: #034693; font-size: 0.78rem; font-weight: 650; cursor: pointer; text-align: left;
  transition: background 140ms ease, border-color 140ms ease;
}
.extra-accordion-btn:hover { background: #eff6ff; border-color: #93c5fd; }
.extra-accordion-panel {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px 14px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0;
}

.live-tax-preview {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;
  padding: 12px 14px; border-radius: 14px; background: #f8fafc;
}
.live-tax-preview > div { display: flex; flex-direction: column; gap: 2px; }
.live-tax-preview span { font-size: 0.69rem; color: var(--text-secondary); }
.live-tax-preview strong { font-size: 0.84rem; color: var(--text-primary); }
.live-tax-preview .highlight strong { color: #034693; }

.pay-banner {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 14px; background: #eff6ff;
}

.modal-foot {
  position: sticky;
  bottom: -24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 18px;
  margin-top: 4px;
  background: var(--bg-surface, #ffffff);
  border-top: 1px solid var(--border-subtle, #e2e8f0);
  z-index: 5;
}

@media (max-width: 1120px) {
  .kpi-metric-row, .aging-strip-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .split-2-grid { grid-template-columns: 1fr; }
  .live-tax-preview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .pill-month-input,
  .pill-select,
  .pill-search-input,
  .pill-btn-navy,
  .pill-btn-soft,
  .pill-btn-danger,
  .dropx-search-input {
    min-height: 44px;
    height: auto;
  }
  .unit-pill,
  .dx-filter-tab,
  .tab-pill,
  .mini-action-btn {
    min-height: 40px;
  }
  .dropx-search-box {
    width: 100%;
  }
  .rev-top-actions {
    width: 100%;
  }
}

@media (max-width: 680px) {
  .kpi-metric-row, .aging-strip-grid, .form-2col, .form-3col, .line-card-top, .line-card-bottom, .direct-calc-strip { grid-template-columns: 1fr; }
  .dropx-kpi-card { padding: 16px; }
  .dropx-card-head { padding: 14px 14px 12px; }
  .direct-calc-op { display: none; }
  .line-sub-col { text-align: left; }
  .line-sub-val { justify-content: flex-start; }
  .pill-search-input { width: 100%; min-width: 0; }
  .bh-toolbar-selects { width: 100%; }
  .bh-toolbar-selects .pill-select { flex: 1 1 calc(50% - 4px); min-width: 140px; }
  .poital-card { padding: 14px; }
}
</style>
