<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch, downloadApiBlob } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import CurrencyInput from '../components/CurrencyInput.vue';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');
const modalErrorMsg = ref('');

const bankAccounts = ref<any[]>([]);
const statementImports = ref<any[]>([]);
const selectedImport = ref<any>(null);
const selectedAccountId = ref<string>('');
const accountSummary = ref<any>(null);
const penerimaanCandidates = ref<any>(null);
const autoMatching = ref(false);
const finalizing = ref(false);

// Table filters
const lineStatusFilter = ref<'ALL' | 'UNMATCHED' | 'MATCHED' | 'EXCEPTION' | 'NEEDS_REVIEW'>('ALL');
const lineSearch = ref('');
const candidateSearch = ref('');

// Preview & Import Modal State
const importModalOpen = ref(false);
const importEntryTab = ref<'upload' | 'manual'>('upload');
const previewResult = ref<any>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const isPreviewing = ref(false);
const isCommitting = ref(false);
const uploadedFileName = ref('');
const uploadedFileBase64 = ref('');
const uploadedSheetNames = ref<string[]>([]);
const selectedSheetName = ref('');
const parsedTotals = ref<{ totalCredit: number; totalDebit: number }>({ totalCredit: 0, totalDebit: 0 });

// Finalize Confirm Modal
const finalizeModalOpen = ref(false);

function getCurrentPeriodMeta() {
  const now = new Date();
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return {
    periodLabel: `${months[now.getMonth()]} ${yyyy}`,
    fileSlug: `${yyyy}-${mm}`,
    todayIso: `${yyyy}-${mm}-${dd}`,
  };
}

const initialPeriodMeta = getCurrentPeriodMeta();
const importForm = ref({
  bankAccountId: '',
  periodLabel: initialPeriodMeta.periodLabel,
  fileName: `mutasi-mandiri-${initialPeriodMeta.fileSlug}.xlsx`,
  rows: [] as Array<{
    transactionDate: string;
    description: string;
    referenceNo: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
  }>,
});

// Reconcile Line Modal
const matchModalOpen = ref(false);
const selectedLine = ref<any>(null);
const isSavingMatch = ref(false);
const matchForm = ref({
  matchStatus: 'MATCHED' as 'MATCHED' | 'NEEDS_REVIEW' | 'EXCEPTION' | 'UNMATCHED',
  matchedEntityType: 'Payment',
  matchedEntityId: '' as string,
  matchedDocNumber: '',
  exceptionNote: '',
});

function getAccountDomain(acc: any): 'PENERIMAAN' | 'PENGELUARAN' {
  if (acc?.domain === 'PENERIMAAN' || acc?.domain === 'PENGELUARAN') return acc.domain;
  if (
    acc?.glAccountCode === '110102010100' ||
    acc?.glAccountCode === '110101020100' ||
    String(acc?.code || '').includes('MDR')
  ) {
    return 'PENERIMAAN';
  }
  return 'PENGELUARAN';
}

function getFriendlyAccountTitle(acc: any): string {
  if (!acc) return 'Rekening Bank PMO';
  if (acc.code === 'BNK-MDR-01') return 'Bank Mandiri Penerimaan (164-00-2022-999-5)';
  return acc.bankName;
}

function getFriendlyAccountHint(acc: any): string {
  if (!acc) return '';
  if (acc.code === 'BNK-MDR-01') return 'Rekening Resmi Penerimaan 4 Unit (MICE, Klinik, ITS, TCI)';
  return acc.accountHolder || 'Rekening Operasional Pengeluaran';
}

const visibleBankAccounts = computed(() => {
  return bankAccounts.value.filter((acc) => {
    const dom = getAccountDomain(acc);
    if (dom === 'PENERIMAAN' && !auth.canAccessPenerimaan) return false;
    if (dom === 'PENGELUARAN' && !auth.canAccessPengeluaran) return false;
    if (auth.activeWorkspace === 'PENERIMAAN') return dom === 'PENERIMAAN';
    if (auth.activeWorkspace === 'PENGELUARAN') return dom === 'PENGELUARAN';
    return true;
  });
});

const mandiriAccount = computed(
  () => visibleBankAccounts.value.find((b) => getAccountDomain(b) === 'PENERIMAAN') || visibleBankAccounts.value[0]
);

const btnAccount = computed(
  () => visibleBankAccounts.value.find((b) => getAccountDomain(b) === 'PENGELUARAN') || visibleBankAccounts.value[0]
);

const selectedAccount = computed(
  () => visibleBankAccounts.value.find((b) => b.id === selectedAccountId.value) || visibleBankAccounts.value[0] || null
);

const selectedAccountDomain = computed<'PENERIMAAN' | 'PENGELUARAN'>(() => getAccountDomain(selectedAccount.value));

const accountImports = computed(() => {
  if (!selectedAccountId.value) return statementImports.value;
  return statementImports.value.filter((imp) => imp.bankAccountId === selectedAccountId.value);
});

const selectedImportStats = computed(() => {
  const lines = selectedImport.value?.lines || [];
  let matched = 0;
  let unmatched = 0;
  let exception = 0;
  let review = 0;
  for (const l of lines) {
    if (l.matchStatus === 'MATCHED') matched++;
    else if (l.matchStatus === 'EXCEPTION') exception++;
    else if (l.matchStatus === 'NEEDS_REVIEW') review++;
    else unmatched++;
  }
  return { total: lines.length, matched, unmatched, exception, review };
});

const filteredStatementLines = computed(() => {
  const lines = selectedImport.value?.lines || [];
  const q = lineSearch.value.trim().toLowerCase();
  return lines.filter((l: any) => {
    if (lineStatusFilter.value !== 'ALL' && l.matchStatus !== lineStatusFilter.value) return false;
    if (!q) return true;
    return `${l.referenceNo} ${l.description} ${l.matchedDocNumber || ''} ${l.exceptionNote || ''}`
      .toLowerCase()
      .includes(q);
  });
});

const filteredCandidates = computed(() => {
  const list = penerimaanCandidates.value?.unreconciled || [];
  const q = candidateSearch.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((p: any) =>
    `${p.receiptNumber} ${p.payerName} ${p.activityTitle} ${p.referenceNo} ${p.invoiceDocNumber} ${p.businessUnitCode}`
      .toLowerCase()
      .includes(q)
  );
});

const entityTypeOptions = computed(() => {
  if (selectedAccountDomain.value === 'PENERIMAAN') {
    return [
      { value: 'Payment', label: 'Buku Harian Penerimaan (Kwitansi / TT / Bayar Invoice)' },
      { value: 'Refund', label: 'Pengembalian Dana Lebih Bayar (Refund)' },
    ];
  }
  return [
    { value: 'Expense', label: 'Pengeluaran Tagihan Vendor (LS)' },
    { value: 'PettyCashSubmission', label: 'Pencairan Uang Persediaan / Kas Kecil (GUP)' },
    { value: 'Refund', label: 'Pengembalian Dana (Refund)' },
  ];
});

const differenceExplanation = computed(() => {
  if (!accountSummary.value) return '';
  const diff = Number(accountSummary.value.difference || 0);
  if (diff === 0) return 'Catatan buku dan mutasi bank sudah cocok tanpa selisih.';
  const excCount = Number(accountSummary.value.exceptionLineCount || 0);
  const excNet = Number(accountSummary.value.exceptionNetAmount || 0);
  const unmatchedCount = Number(accountSummary.value.unmatchedLineCount || 0);
  if (excCount > 0 && Math.abs(diff + excNet) === 0) {
    return `Selisih tepat berasal dari ${excCount} mutasi Catatan Khusus / biaya bank (${formatRupiah(Math.abs(excNet))}).`;
  }
  if (unmatchedCount > 0) {
    return `Masih ada ${unmatchedCount} baris mutasi bank belum dicocokkan dengan catatan buku.`;
  }
  if (diff > 0) {
    return 'Catatan Buku Harian lebih besar dari mutasi bank yang sudah diimpor.';
  }
  return 'Mutasi rekening koran bank lebih besar dari catatan Buku Harian yang disetujui.';
});

function formatMatchStatusLabel(status: string): string {
  switch (status) {
    case 'MATCHED':
      return 'Cocok';
    case 'UNMATCHED':
      return 'Belum Cocok';
    case 'NEEDS_REVIEW':
      return 'Perlu Cek';
    case 'EXCEPTION':
      return 'Catatan Khusus';
    case 'DUPLICATE':
      return 'Duplikat';
    default:
      return status;
  }
}

function getMatchStatusClass(status: string): string {
  switch (status) {
    case 'MATCHED':
      return 'ok';
    case 'UNMATCHED':
      return 'warn';
    case 'NEEDS_REVIEW':
      return 'info';
    case 'EXCEPTION':
      return 'muted';
    case 'DUPLICATE':
      return 'danger';
    default:
      return 'muted';
  }
}

function formatEntityTypeLabel(type?: string | null): string {
  switch (type) {
    case 'Payment':
      return 'Buku Harian';
    case 'CashDeposit':
      return 'Setoran Kas';
    case 'Expense':
      return 'Tagihan Vendor';
    case 'PettyCashSubmission':
      return 'Kas Kecil GUP';
    case 'Refund':
      return 'Pengembalian Dana';
    default:
      return type || 'Dokumen';
  }
}

function pickDefaultAccountForWorkspace() {
  if (visibleBankAccounts.value.length === 0) return;
  if (auth.activeWorkspace === 'PENGELUARAN' && btnAccount.value) {
    selectedAccountId.value = btnAccount.value.id;
  } else if (auth.activeWorkspace === 'PENERIMAAN' && mandiriAccount.value) {
    selectedAccountId.value = mandiriAccount.value.id;
  } else if (!selectedAccountId.value || !visibleBankAccounts.value.some((a) => a.id === selectedAccountId.value)) {
    selectedAccountId.value = (mandiriAccount.value || visibleBankAccounts.value[0]).id;
  }
}

function syncSelectedImportToAccount() {
  const list = accountImports.value;
  if (list.length > 0) {
    selectedImport.value = list.find((x) => x.id === selectedImport.value?.id) || list[0];
  } else {
    selectedImport.value = null;
  }
  lineStatusFilter.value = 'ALL';
  lineSearch.value = '';
}

async function fetchAccountSummary(accId: string) {
  try {
    const res = await apiFetch(`/reconciliation/summary/${accId}`);
    accountSummary.value = res.data;
  } catch {
    accountSummary.value = null;
  }
}

async function fetchPenerimaanCandidates(accId?: string) {
  if (!auth.canAccessPenerimaan) return;
  try {
    const qs = accId ? `?bankAccountId=${encodeURIComponent(accId)}` : '';
    const res = await apiFetch(`/reconciliation/penerimaan-candidates${qs}`);
    penerimaanCandidates.value = res.data || null;
  } catch {
    penerimaanCandidates.value = null;
  }
}

async function loadReconciliation() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [bRes, iRes] = await Promise.all([
      apiFetch('/reconciliation/bank-accounts'),
      apiFetch('/reconciliation/imports'),
    ]);
    bankAccounts.value = bRes.data || [];
    statementImports.value = iRes.data || [];

    pickDefaultAccountForWorkspace();
    syncSelectedImportToAccount();

    if (selectedAccountId.value) {
      await Promise.all([
        fetchAccountSummary(selectedAccountId.value),
        fetchPenerimaanCandidates(selectedAccountId.value),
      ]);
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data rekening dan rekonsiliasi bank.';
  } finally {
    loading.value = false;
  }
}

function selectAccount(accId: string) {
  selectedAccountId.value = accId;
  syncSelectedImportToAccount();
  fetchAccountSummary(accId);
  fetchPenerimaanCandidates(accId);
}

watch(
  () => auth.activeWorkspace,
  async () => {
    pickDefaultAccountForWorkspace();
    syncSelectedImportToAccount();
    if (selectedAccountId.value) {
      await Promise.all([
        fetchAccountSummary(selectedAccountId.value),
        fetchPenerimaanCandidates(selectedAccountId.value),
      ]);
    }
  }
);

async function downloadExcelTemplate() {
  errorMsg.value = '';
  const pm = getCurrentPeriodMeta();
  const domain = selectedAccountDomain.value;
  const accountCode = selectedAccount.value?.code || (domain === 'PENGELUARAN' ? 'BNK-BTN-01' : 'BNK-MDR-01');
  const fallback = `template-mutasi-${String(accountCode).toLowerCase()}-${pm.fileSlug}.xlsx`;
  try {
    await downloadApiBlob(
      `/reconciliation/template.xlsx?domain=${encodeURIComponent(domain)}&accountCode=${encodeURIComponent(accountCode)}`,
      fallback
    );
    feedbackMsg.value = `Template Excel (${fallback}) berhasil diunduh.`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengunduh template Excel mutasi bank.';
  }
}

function openImportModal(startTab: 'upload' | 'manual' = 'upload') {
  modalErrorMsg.value = '';
  previewResult.value = null;
  uploadedFileName.value = '';
  uploadedFileBase64.value = '';
  uploadedSheetNames.value = [];
  selectedSheetName.value = '';
  parsedTotals.value = { totalCredit: 0, totalDebit: 0 };
  importEntryTab.value = startTab;
  const pm = getCurrentPeriodMeta();
  const targetAcc = selectedAccount.value || visibleBankAccounts.value[0];
  const codeSlug = String(targetAcc?.code || 'mandiri').toLowerCase();
  importForm.value = {
    bankAccountId: targetAcc?.id || '',
    periodLabel: pm.periodLabel,
    fileName: `mutasi-${codeSlug}-${pm.fileSlug}.xlsx`,
    rows: [],
  };
  if (startTab === 'manual') {
    addSampleRow();
  }
  importModalOpen.value = true;
}

function switchImportTab(tab: 'upload' | 'manual') {
  modalErrorMsg.value = '';
  previewResult.value = null;
  importEntryTab.value = tab;
  if (tab === 'manual' && importForm.value.rows.length === 0) {
    addSampleRow();
  }
}

function loadSampleRows() {
  modalErrorMsg.value = '';
  previewResult.value = null;
  const pm = getCurrentPeriodMeta();
  const isOut = selectedAccountDomain.value === 'PENGELUARAN';
  const targetAcc =
    visibleBankAccounts.value.find((b) => b.id === importForm.value.bankAccountId) || selectedAccount.value;
  const codeSlug = String(targetAcc?.code || (isOut ? 'btn' : 'mandiri')).toLowerCase();
  importForm.value.fileName = `mutasi-${codeSlug}-${pm.fileSlug}.xlsx`;
  importForm.value.periodLabel = pm.periodLabel;
  if (isOut) {
    importForm.value.rows = [
      {
        transactionDate: pm.todayIso,
        description: 'Pelunasan Tagihan Vendor Pengadaan LS',
        referenceNo: `LS-BTN-${pm.todayIso.replace(/-/g, '')}-01`,
        direction: 'DEBIT',
        amount: 5000000,
      },
      {
        transactionDate: pm.todayIso,
        description: 'Biaya Administrasi Rekening Bank',
        referenceNo: `ADM-BTN-${pm.todayIso.replace(/-/g, '')}-99`,
        direction: 'DEBIT',
        amount: 25000,
      },
    ];
  } else {
    // If there are real unreconciled Buku Harian rows, prefill the first one so PIC sees matching immediately
    const firstCand = (penerimaanCandidates.value?.unreconciled || [])[0];
    if (firstCand) {
      importForm.value.rows = [
        {
          transactionDate: firstCand.paymentDate || pm.todayIso,
          description: `Transfer Masuk - ${firstCand.payerName} (${firstCand.rincianLabel})`,
          referenceNo: firstCand.referenceNo || firstCand.receiptNumber,
          direction: 'CREDIT',
          amount: Number(firstCand.grossAmount || 0),
        },
        {
          transactionDate: pm.todayIso,
          description: 'Biaya Administrasi Rekening Bank Mandiri',
          referenceNo: `ADM-MDR-${pm.todayIso.replace(/-/g, '')}-99`,
          direction: 'DEBIT',
          amount: 25000,
        },
      ];
    } else {
      importForm.value.rows = [
        {
          transactionDate: pm.todayIso,
          description: 'Transfer Masuk Penerimaan Layanan PMO UTama',
          referenceNo: `STR-MDR-${pm.todayIso.replace(/-/g, '')}-01`,
          direction: 'CREDIT',
          amount: 1500000,
        },
        {
          transactionDate: pm.todayIso,
          description: 'Biaya Administrasi Rekening Bank Mandiri',
          referenceNo: `ADM-MDR-${pm.todayIso.replace(/-/g, '')}-99`,
          direction: 'DEBIT',
          amount: 25000,
        },
      ];
    }
  }
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  await processUploadedFile(file);
}

async function handleFileDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  await processUploadedFile(file);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file Excel.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
    reader.readAsDataURL(file);
  });
}

function inferPeriodLabelFromRows(rows: Array<{ transactionDate?: string }>): string | null {
  const firstDate = rows.find((r) => r.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(r.transactionDate))?.transactionDate;
  if (!firstDate) return null;
  const [yr, mo] = firstDate.split('-').map(Number);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  if (!yr || !mo || mo < 1 || mo > 12) return null;
  return `${months[mo - 1]} ${yr}`;
}

async function parseExcelSheetSelection(sheetName?: string) {
  if (!uploadedFileBase64.value) return;
  isUploading.value = true;
  modalErrorMsg.value = '';
  previewResult.value = null;
  try {
    const res = await apiFetch('/reconciliation/parse-file', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64: uploadedFileBase64.value,
        fileName: uploadedFileName.value,
        sheetName: sheetName || undefined,
      }),
    });
    uploadedSheetNames.value = res.data.sheetNames || [];
    selectedSheetName.value = res.data.selectedSheetName || '';
    parsedTotals.value = {
      totalCredit: Number(res.data.totalCredit || 0),
      totalDebit: Number(res.data.totalDebit || 0),
    };
    importForm.value.rows = res.data.rows || [];
    const inferredPeriod = inferPeriodLabelFromRows(importForm.value.rows);
    if (inferredPeriod) importForm.value.periodLabel = inferredPeriod;
    if (importForm.value.rows.length > 0 && importForm.value.bankAccountId) {
      await runPreview();
    }
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal membaca sheet Excel yang dipilih.';
  } finally {
    isUploading.value = false;
  }
}

async function processUploadedFile(file: File) {
  isUploading.value = true;
  modalErrorMsg.value = '';
  previewResult.value = null;
  uploadedSheetNames.value = [];
  selectedSheetName.value = '';
  uploadedFileBase64.value = '';
  parsedTotals.value = { totalCredit: 0, totalDebit: 0 };
  try {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.xls') && !lowerName.endsWith('.xlsx')) {
      modalErrorMsg.value =
        'Format Excel lama (.xls) belum didukung langsung. Buka di Excel lalu pilih "Save As -> Excel Workbook (.xlsx)" dan unggah kembali.';
      return;
    }

    const isExcel =
      lowerName.endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const fileB64 = isExcel ? await readFileAsBase64(file) : '';
    const payload = isExcel
      ? { fileBase64: fileB64, fileName: file.name }
      : { rawContent: await file.text(), fileName: file.name };

    const res = await apiFetch('/reconciliation/parse-file', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    uploadedFileName.value = file.name;
    uploadedFileBase64.value = fileB64;
    uploadedSheetNames.value = res.data.sheetNames || [];
    selectedSheetName.value = res.data.selectedSheetName || '';
    parsedTotals.value = {
      totalCredit: Number(res.data.totalCredit || 0),
      totalDebit: Number(res.data.totalDebit || 0),
    };
    importForm.value.fileName = file.name;
    importForm.value.rows = res.data.rows || [];
    const inferredPeriod = inferPeriodLabelFromRows(importForm.value.rows);
    if (inferredPeriod) importForm.value.periodLabel = inferredPeriod;
    if (importForm.value.rows.length > 0 && importForm.value.bankAccountId) {
      await runPreview();
    }
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal membaca file rekening koran. Pastikan format file (.xlsx / .csv) sesuai template.';
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function addSampleRow() {
  const pm = getCurrentPeriodMeta();
  const isOut = selectedAccountDomain.value === 'PENGELUARAN';
  importForm.value.rows.push({
    transactionDate: pm.todayIso,
    description: isOut ? 'Mutasi Keluar Rekening Bank' : 'Transfer Masuk Rekening Bank Mandiri',
    referenceNo: `${isOut ? 'BTN' : 'MDR'}-${Date.now().toString().slice(-6)}`,
    direction: isOut ? 'DEBIT' : 'CREDIT',
    amount: 0,
  });
  previewResult.value = null;
}

function removeRow(idx: number) {
  importForm.value.rows.splice(idx, 1);
  previewResult.value = null;
}

async function runPreview() {
  modalErrorMsg.value = '';
  if (!importForm.value.bankAccountId) {
    modalErrorMsg.value = 'Pilih rekening bank tujuan terlebih dahulu.';
    return;
  }
  if (importForm.value.rows.length === 0) {
    modalErrorMsg.value = 'Belum ada baris mutasi. Unggah file CSV atau tambahkan baris manual terlebih dahulu.';
    return;
  }
  const invalidRow = importForm.value.rows.find((r) => !r.amount || Number(r.amount) <= 0 || !r.referenceNo?.trim());
  if (invalidRow) {
    modalErrorMsg.value = 'Setiap baris mutasi wajib memiliki No. Referensi Bank dan Nominal lebih dari Rp 0.';
    return;
  }
  isPreviewing.value = true;
  try {
    const res = await apiFetch('/reconciliation/preview', {
      method: 'POST',
      body: JSON.stringify(importForm.value),
    });
    previewResult.value = res.data;
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal memeriksa pratinjau mutasi bank.';
  } finally {
    isPreviewing.value = false;
  }
}

async function commitImport() {
  modalErrorMsg.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';
  isCommitting.value = true;
  try {
    const targetAccId = importForm.value.bankAccountId;
    const res = await apiFetch('/reconciliation/import', {
      method: 'POST',
      body: JSON.stringify(importForm.value),
    });
    importModalOpen.value = false;
    selectedAccountId.value = targetAccId;
    const dupText = res.data.duplicateCount > 0 ? `, ${res.data.duplicateCount} baris duplikat dilewati` : '';
    feedbackMsg.value = `Mutasi ${res.data.importNumber} berhasil disimpan (${res.data.totalLines} baris valid, ${res.data.matchedCount} langsung cocok otomatis${dupText}).`;
    await loadReconciliation();
    selectedImport.value = accountImports.value[0] || statementImports.value[0] || null;
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal menyimpan mutasi bank.';
  } finally {
    isCommitting.value = false;
  }
}

async function runAutoMatchPenerimaan(imp: any) {
  autoMatching.value = true;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/reconciliation/imports/${imp.id}/auto-match-penerimaan`, { method: 'POST' });
    const count = res.data?.newlyMatchedCount || 0;
    feedbackMsg.value =
      count > 0
        ? `${count} mutasi masuk Bank Mandiri berhasil dicocokkan otomatis dengan transaksi Buku Harian.`
        : 'Tidak ada kecocokan otomatis baru. Klik tombol "Cocokkan" di baris mutasi untuk memilih transaksi secara manual.';
    await loadReconciliation();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menjalankan pencocokan otomatis Buku Harian.';
  } finally {
    autoMatching.value = false;
  }
}

function openMatchLine(line: any) {
  modalErrorMsg.value = '';
  selectedLine.value = line;
  const defaultType =
    selectedAccountDomain.value === 'PENERIMAAN'
      ? line.direction === 'DEBIT'
        ? 'Refund'
        : 'Payment'
      : 'Expense';
  const defaultStatus =
    line.matchStatus === 'UNMATCHED'
      ? selectedAccountDomain.value === 'PENERIMAAN' && line.direction === 'DEBIT'
        ? 'EXCEPTION'
        : 'MATCHED'
      : line.matchStatus;
  matchForm.value = {
    matchStatus: defaultStatus,
    matchedEntityType: line.matchedEntityType || defaultType,
    matchedEntityId: line.matchedEntityId || '',
    matchedDocNumber: line.matchedDocNumber || '',
    exceptionNote: line.exceptionNote || '',
  };
  matchModalOpen.value = true;
}

function handleCandidatePaymentSelect() {
  const found = (penerimaanCandidates.value?.unreconciled || []).find(
    (p: any) => p.id === matchForm.value.matchedEntityId
  );
  if (found) {
    matchForm.value.matchedDocNumber = found.receiptNumber;
  }
}

async function submitMatchLine() {
  if (!selectedLine.value) return;
  modalErrorMsg.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';

  if (matchForm.value.matchStatus === 'EXCEPTION' && matchForm.value.exceptionNote.trim().length < 4) {
    modalErrorMsg.value = 'Isi keterangan selisih / biaya bank minimal 4 karakter (misal: Biaya admin bulanan Mandiri).';
    return;
  }

  isSavingMatch.value = true;
  try {
    await apiFetch(`/reconciliation/lines/${selectedLine.value.id}/match`, {
      method: 'POST',
      body: JSON.stringify({
        ...matchForm.value,
        matchedEntityId: matchForm.value.matchedEntityId || null,
      }),
    });
    matchModalOpen.value = false;
    feedbackMsg.value = `Status mutasi ref ${selectedLine.value.referenceNo} diperbarui menjadi "${formatMatchStatusLabel(matchForm.value.matchStatus)}".`;
    await loadReconciliation();
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal menyimpan hasil pencocokan mutasi.';
  } finally {
    isSavingMatch.value = false;
  }
}

function requestFinalizeReconciliation() {
  if (!selectedImport.value) return;
  finalizeModalOpen.value = true;
}

async function confirmFinalizeReconciliation() {
  if (!selectedImport.value) return;
  finalizing.value = true;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const imp = selectedImport.value;
    await apiFetch(`/reconciliation/imports/${imp.id}/finalize`, { method: 'POST' });
    finalizeModalOpen.value = false;
    feedbackMsg.value = `Sesi rekonsiliasi ${imp.importNumber} (${imp.periodLabel}) telah dikunci resmi.`;
    await loadReconciliation();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengunci sesi rekonsiliasi.';
  } finally {
    finalizing.value = false;
  }
}

onMounted(loadReconciliation);
</script>

<template>
  <div class="poital-recon">
    <!-- Top Header -->
    <div class="recon-top-bar">
      <div>
        <h1 class="recon-title">
          {{
            auth.activeWorkspace === 'PENERIMAAN'
              ? 'Rekonsiliasi Bank Mandiri'
              : auth.activeWorkspace === 'PENGELUARAN'
                ? 'Rekonsiliasi Bank Pengeluaran'
                : 'Rekonsiliasi Rekening Bank'
          }}
        </h1>
        <p class="recon-subtitle">
          {{
            auth.activeWorkspace === 'PENERIMAAN'
              ? 'Cocokkan mutasi rekening koran Bank Mandiri Penerimaan (164-00-2022-999-5) dengan transaksi Buku Harian yang sudah disetujui.'
              : auth.activeWorkspace === 'PENGELUARAN'
                ? 'Cocokkan mutasi rekening koran Bank Pengeluaran dengan pelunasan pengadaan, kas kecil (GUP/TUP), dan gaji.'
                : 'Cocokkan mutasi rekening koran bank resmi PMO terhadap catatan Buku Harian dan Buku Besar.'
          }}
        </p>
      </div>
      <div class="recon-top-actions">
        <button type="button" class="pill-btn-soft" @click="downloadExcelTemplate">
          Unduh Template Excel (.xlsx)
        </button>
        <button type="button" class="pill-btn-soft" :disabled="loading" @click="loadReconciliation">
          {{ loading ? 'Memuat...' : 'Muat Ulang' }}
        </button>
        <button
          v-if="auth.hasPermission('reconciliation:manage')"
          type="button"
          class="pill-btn-navy"
          @click="openImportModal('upload')"
        >
          + Upload Mutasi Bank
        </button>
      </div>
    </div>

    <!-- Compact Workflow Stepper (Penerimaan Only) -->
    <div v-if="selectedAccountDomain === 'PENERIMAAN'" class="workflow-bar">
      <div class="workflow-steps">
        <button type="button" class="wf-step-link" @click="router.push('/revenue')">
          1. Buku Harian
        </button>
        <span class="wf-sep" aria-hidden="true">/</span>
        <span class="wf-step-active">2. Rekonsiliasi Bank Mandiri</span>
        <span class="wf-sep" aria-hidden="true">/</span>
        <button type="button" class="wf-step-link" @click="router.push('/penerimaan/pembukuan')">
          3A. Pembukuan
        </button>
        <button type="button" class="wf-step-link" @click="router.push('/penerimaan/laporan')">
          3B. Laporan Penerimaan
        </button>
      </div>
      <div v-if="penerimaanCandidates" class="workflow-counter">
        Sudah cocok: <strong class="text-pos">{{ penerimaanCandidates.reconciledCount }}</strong>
        <span class="wf-dot">&middot;</span>
        Menunggu cocok: <strong class="text-warn">{{ penerimaanCandidates.unreconciledCount }}</strong>
      </div>
    </div>

    <AlertBanner
      v-if="feedbackMsg"
      variant="success"
      title="Berhasil"
      :message="feedbackMsg"
      @dismiss="feedbackMsg = ''"
    />

    <AlertBanner
      v-if="errorMsg"
      variant="danger"
      title="Perhatian Rekonsiliasi"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <!-- Bank Account Selector Cards -->
    <section v-if="visibleBankAccounts.length > 0" class="bank-selector-grid" aria-label="Pilih Rekening Bank">
      <button
        v-for="acc in visibleBankAccounts"
        :key="acc.id"
        type="button"
        class="bank-card"
        :class="{ active: acc.id === selectedAccountId }"
        @click="selectAccount(acc.id)"
      >
        <div class="bank-card-top">
          <div class="bank-card-badges">
            <span class="mono-pill">{{ acc.code }}</span>
            <span class="tag-pill" :class="getAccountDomain(acc) === 'PENERIMAAN' ? 'ok' : 'muted'">
              {{ getAccountDomain(acc) === 'PENERIMAAN' ? 'Penerimaan' : 'Pengeluaran' }}
            </span>
          </div>
          <span class="coa-pill">COA {{ acc.glAccountCode }}</span>
        </div>
        <div class="bank-card-name">{{ getFriendlyAccountTitle(acc) }}</div>
        <div class="bank-card-balance money">{{ formatRupiah(acc.currentBalance) }}</div>
        <div class="bank-card-meta">
          <span>No. Rek: {{ acc.accountNumberMasked }}</span>
          <span>&middot;</span>
          <span>{{ getFriendlyAccountHint(acc) }}</span>
        </div>
      </button>
    </section>

    <!-- 3-Card Balance Comparison Summary -->
    <section v-if="accountSummary" class="kpi-metric-row">
      <div class="metric-card hero-card">
        <span class="metric-title">
          {{ accountSummary.bookBalanceBasis === 'APPROVED_PAYMENTS_PER_ACCOUNT' ? 'Saldo Buku Harian (Disetujui)' : 'Saldo Catatan Buku Kas (GL)' }}
        </span>
        <div class="metric-number-val money">{{ formatRupiah(accountSummary.bookBalance) }}</div>
        <span class="trend-text">
          {{
            accountSummary.bookBalanceBasis === 'APPROVED_PAYMENTS_PER_ACCOUNT'
              ? 'Total transaksi rekening ini yang sudah disetujui Manajer Keuangan'
              : `Akumulasi jurnal posted pada COA ${accountSummary.glAccountCode}`
          }}
        </span>
      </div>

      <div class="metric-card blue-card">
        <span class="metric-title">Saldo Rekening Koran Bank</span>
        <div class="metric-number-val money">{{ formatRupiah(accountSummary.bankBalance) }}</div>
        <span class="trend-text">
          {{
            accountSummary.totalImports > 0
              ? `Dari ${accountSummary.totalImports} batch mutasi bank yang diimpor`
              : 'Belum ada mutasi bank yang diimpor'
          }}
        </span>
      </div>

      <div class="metric-card" :class="accountSummary.isBalanced ? 'emerald-card' : 'amber-card'">
        <div class="metric-head-inline">
          <span class="metric-title">Selisih Buku vs Bank</span>
          <span class="tag-pill" :class="accountSummary.isBalanced ? 'ok' : 'warn'">
            {{ accountSummary.isBalanced ? 'Seimbang' : 'Ada Selisih' }}
          </span>
        </div>
        <div class="metric-number-val money">{{ formatRupiah(Math.abs(accountSummary.difference)) }}</div>
        <span class="trend-text">{{ differenceExplanation }}</span>
      </div>
    </section>

    <!-- Loading State -->
    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Data Rekonsiliasi Bank"
      message="Mengambil data rekening, riwayat impor mutasi, dan antrean transaksi..."
    />

    <!-- Main Content: Imported Bank Statement Lines -->
    <section v-else-if="selectedImport" class="poital-card">
      <div class="card-head-row">
        <div>
          <div class="batch-title-row">
            <span class="mono-pill">{{ selectedImport.importNumber }}</span>
            <span class="tag-pill" :class="selectedImport.status === 'FINALIZED' ? 'ok' : 'info'">
              {{ selectedImport.status === 'FINALIZED' ? 'Terkunci Resmi' : 'Sedang Dicocokkan' }}
            </span>
            <span class="batch-period">{{ selectedImport.periodLabel }}</span>
          </div>
          <h2 class="card-title">Mutasi Rekening Koran: {{ selectedImport.fileName }}</h2>
          <span class="card-sub">
            Total {{ selectedImportStats.total }} baris &middot;
            Cocok: <strong>{{ selectedImportStats.matched }}</strong> &middot;
            Belum Cocok: <strong>{{ selectedImportStats.unmatched }}</strong> &middot;
            Catatan Khusus: <strong>{{ selectedImportStats.exception }}</strong>
            <template v-if="selectedImport.duplicateCount > 0">
              &middot; Duplikat dilewati: <strong>{{ selectedImport.duplicateCount }}</strong>
            </template>
          </span>
        </div>

        <div class="batch-actions">
          <select
            v-if="accountImports.length > 1"
            v-model="selectedImport"
            class="pill-select"
            aria-label="Pilih batch impor mutasi"
          >
            <option v-for="imp in accountImports" :key="imp.id" :value="imp">
              {{ imp.importNumber }} - {{ imp.periodLabel }} ({{ imp.fileName }})
            </option>
          </select>

          <button
            v-if="selectedAccountDomain === 'PENERIMAAN' && selectedImport.status !== 'FINALIZED' && auth.hasPermission('reconciliation:manage')"
            type="button"
            class="pill-btn-outline"
            :disabled="autoMatching"
            @click="runAutoMatchPenerimaan(selectedImport)"
          >
            {{ autoMatching ? 'Mencocokkan...' : 'Cocokkan Otomatis' }}
          </button>

          <button
            v-if="selectedImport.status !== 'FINALIZED' && auth.hasPermission('reconciliation:manage')"
            type="button"
            class="pill-btn-emerald"
            :disabled="finalizing"
            @click="requestFinalizeReconciliation"
          >
            Finalisasi &amp; Kunci
          </button>
        </div>
      </div>

      <!-- Filter Bar for Statement Lines -->
      <div class="table-filter-bar">
        <div class="filter-pills" role="tablist" aria-label="Filter Status Mutasi">
          <button type="button" class="filter-pill" :class="{ active: lineStatusFilter === 'ALL' }" @click="lineStatusFilter = 'ALL'">
            Semua ({{ selectedImportStats.total }})
          </button>
          <button type="button" class="filter-pill" :class="{ active: lineStatusFilter === 'UNMATCHED' }" @click="lineStatusFilter = 'UNMATCHED'">
            Belum Cocok ({{ selectedImportStats.unmatched }})
          </button>
          <button type="button" class="filter-pill" :class="{ active: lineStatusFilter === 'MATCHED' }" @click="lineStatusFilter = 'MATCHED'">
            Cocok ({{ selectedImportStats.matched }})
          </button>
          <button type="button" class="filter-pill" :class="{ active: lineStatusFilter === 'EXCEPTION' }" @click="lineStatusFilter = 'EXCEPTION'">
            Catatan Khusus ({{ selectedImportStats.exception }})
          </button>
          <button
            v-if="selectedImportStats.review > 0"
            type="button"
            class="filter-pill"
            :class="{ active: lineStatusFilter === 'NEEDS_REVIEW' }"
            @click="lineStatusFilter = 'NEEDS_REVIEW'"
          >
            Perlu Cek ({{ selectedImportStats.review }})
          </button>
        </div>
        <input
          v-model="lineSearch"
          type="search"
          class="pill-search-input"
          placeholder="Cari no. referensi, uraian, atau kwitansi..."
        />
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>Tanggal &amp; Ref Bank</th>
              <th>Uraian Mutasi Rekening</th>
              <th>Jenis</th>
              <th class="col-num">Nominal Mutasi</th>
              <th>Pasangan Dokumen</th>
              <th>Status</th>
              <th class="col-num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredStatementLines.length === 0">
              <td colspan="7" class="empty-cell">
                Tidak ada baris mutasi yang cocok dengan filter saat ini.
              </td>
            </tr>
            <tr v-for="line in filteredStatementLines" :key="line.id">
              <td>
                <div class="mono-code">{{ line.referenceNo }}</div>
                <div class="cell-sub">{{ formatDate(line.transactionDate) }}</div>
              </td>
              <td>
                <div class="row-main-text">{{ line.description }}</div>
                <div v-if="line.exceptionNote" class="note-sub">
                  Catatan: {{ line.exceptionNote }}
                </div>
              </td>
              <td>
                <span class="tag-pill" :class="line.direction === 'CREDIT' ? 'ok' : 'muted'">
                  {{ line.direction === 'CREDIT' ? 'Uang Masuk' : 'Uang Keluar' }}
                </span>
              </td>
              <td class="col-num">
                <strong class="money" :class="line.direction === 'CREDIT' ? 'text-pos' : 'text-dark'">
                  {{ line.direction === 'CREDIT' ? '+' : '-' }}{{ formatRupiah(line.amount) }}
                </strong>
              </td>
              <td>
                <template v-if="line.matchedDocNumber">
                  <div class="mono-code">{{ line.matchedDocNumber }}</div>
                  <div class="cell-sub">{{ formatEntityTypeLabel(line.matchedEntityType) }}</div>
                </template>
                <span v-else class="cell-sub">Belum dipasangkan</span>
              </td>
              <td>
                <span class="tag-pill" :class="getMatchStatusClass(line.matchStatus)">
                  {{ formatMatchStatusLabel(line.matchStatus) }}
                </span>
              </td>
              <td class="col-num">
                <button
                  v-if="selectedImport.status !== 'FINALIZED' && auth.hasPermission('reconciliation:manage')"
                  type="button"
                  class="mini-action-btn"
                  :class="line.matchStatus === 'UNMATCHED' ? 'navy' : 'soft'"
                  @click="openMatchLine(line)"
                >
                  {{ line.matchStatus === 'UNMATCHED' ? 'Cocokkan' : 'Ubah' }}
                </button>
                <span v-else class="cell-sub">Terkunci</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Honest Empty State when no import batch exists yet -->
    <section v-else class="poital-card empty-recon-card">
      <div class="empty-recon-inner">
        <h2>Belum Ada Mutasi Bank di {{ getFriendlyAccountTitle(selectedAccount) }}</h2>
        <p>
          {{
            auth.activeWorkspace === 'PENERIMAAN'
              ? 'Unggah file rekening koran Excel (.xlsx) atau CSV dari Kopra / Internet Banking Bank Mandiri, lalu sistem akan mencocokkannya otomatis dengan Buku Harian.'
              : 'Unggah file rekening koran Excel (.xlsx) atau CSV dari Internet Banking bank operasional untuk mulai pencocokan.'
          }}
        </p>
        <div class="empty-recon-actions">
          <button
            v-if="auth.hasPermission('reconciliation:manage')"
            type="button"
            class="pill-btn-navy"
            @click="openImportModal('upload')"
          >
            + Upload Excel (.xlsx) Mutasi Bank
          </button>
          <button
            v-if="auth.hasPermission('reconciliation:manage')"
            type="button"
            class="pill-btn-soft"
            @click="openImportModal('manual')"
          >
            Input Baris Manual
          </button>
          <button type="button" class="pill-btn-soft" @click="downloadExcelTemplate">
            Unduh Template Excel (.xlsx)
          </button>
        </div>
      </div>
    </section>

    <!-- Unreconciled Buku Harian Queue (Penerimaan Only) -->
    <section v-if="selectedAccountDomain === 'PENERIMAAN' && penerimaanCandidates" class="poital-card">
      <div class="card-head-row">
        <div>
          <h2 class="card-title">Antrean Buku Harian Menunggu Rekonsiliasi</h2>
          <span class="card-sub">
            Menampilkan Kwitansi, Tanda Terima, dan pembayaran Invoice yang sudah <strong>Disetujui Manajer Keuangan</strong> pada {{ getFriendlyAccountTitle(selectedAccount) }}.
            ({{ penerimaanCandidates.unreconciledCount }} transaksi &middot; Total <strong class="money">{{ formatRupiah(penerimaanCandidates.unreconciledTotal) }}</strong>)
          </span>
        </div>
        <div class="batch-actions">
          <input
            v-model="candidateSearch"
            type="search"
            class="pill-search-input"
            placeholder="Cari no. kwitansi, pembayar, atau ref..."
          />
          <button type="button" class="pill-btn-soft" @click="router.push('/revenue')">
            Buka Buku Harian
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>Tanggal &amp; No. Dokumen</th>
              <th>Unit &amp; Pembayar / Kegiatan</th>
              <th>No. Referensi</th>
              <th>Sumber</th>
              <th class="col-num">Nominal Masuk</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredCandidates.length === 0">
              <td colspan="5" class="empty-cell">
                {{
                  (penerimaanCandidates.unreconciled?.length || 0) === 0
                    ? 'Tidak ada transaksi Buku Harian yang menunggu rekonsiliasi pada rekening ini.'
                    : 'Tidak ada transaksi yang cocok dengan pencarian Anda.'
                }}
              </td>
            </tr>
            <tr v-for="cand in filteredCandidates.slice(0, 20)" :key="cand.id">
              <td>
                <div class="mono-code">{{ cand.receiptNumber }}</div>
                <div class="cell-sub">{{ formatDate(cand.paymentDate) }}</div>
              </td>
              <td>
                <div class="row-main-text">
                  {{ cand.payerName }}
                  <span class="unit-mini-tag">{{ cand.businessUnitCode.replace('BU-', '') }}</span>
                </div>
                <div class="cell-sub">{{ cand.activityTitle }}</div>
              </td>
              <td><span class="mono-code">{{ cand.referenceNo }}</span></td>
              <td>
                <span class="tag-pill" :class="cand.invoiceDocNumber ? 'info' : 'muted'">
                  {{ cand.invoiceDocNumber || 'Penerimaan Langsung' }}
                </span>
              </td>
              <td class="col-num">
                <strong class="money text-pos">{{ formatRupiah(cand.grossAmount) }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ==================== MODAL 1: UPLOAD / INPUT MUTASI BANK ==================== -->
    <ModalDialog
      :open="importModalOpen"
      title="Upload & Pratinjau Mutasi Rekening Koran"
      maxWidth="920px"
      @close="importModalOpen = false"
    >
      <div class="modal-stack">
        <AlertBanner
          v-if="modalErrorMsg"
          variant="danger"
          title="Periksa Data Mutasi"
          :message="modalErrorMsg"
          @dismiss="modalErrorMsg = ''"
        />

        <!-- 2-Mode Entry Switcher -->
        <div class="entry-mode-tabs" role="tablist" aria-label="Cara Memasukkan Mutasi Bank">
          <button
            type="button"
            class="entry-tab-btn"
            :class="{ active: importEntryTab === 'upload' }"
            @click="switchImportTab('upload')"
          >
            <strong>Upload File Excel (.xlsx) / CSV</strong>
            <span>Ekspor langsung dari Kopra Bank Mandiri atau Template Excel</span>
          </button>
          <button
            type="button"
            class="entry-tab-btn"
            :class="{ active: importEntryTab === 'manual' }"
            @click="switchImportTab('manual')"
          >
            <strong>Input Baris Manual</strong>
            <span>Ketik beberapa baris mutasi tanpa file Excel</span>
          </button>
        </div>

        <!-- Account & Period Metadata -->
        <div class="form-3col">
          <div class="field">
            <label for="imp-bank">Rekening Bank Tujuan</label>
            <select id="imp-bank" v-model="importForm.bankAccountId" class="input" @change="previewResult = null">
              <option v-for="b in visibleBankAccounts" :key="b.id" :value="b.id">
                {{ getFriendlyAccountTitle(b) }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="imp-period">Periode Mutasi</label>
            <input id="imp-period" v-model="importForm.periodLabel" type="text" class="input" placeholder="Contoh: November 2026" />
          </div>
          <div class="field">
            <label for="imp-file">Nama Sumber / File</label>
            <input id="imp-file" v-model="importForm.fileName" type="text" class="input" placeholder="mutasi-mandiri.xlsx" />
          </div>
        </div>

        <!-- MODE 1: Excel (.xlsx) / CSV File Upload -->
        <div v-if="importEntryTab === 'upload'" class="upload-section">
          <div
            class="drop-zone"
            role="button"
            tabindex="0"
            @click="triggerFileInput"
            @keydown.enter.prevent="triggerFileInput"
            @keydown.space.prevent="triggerFileInput"
            @dragover.prevent
            @drop.prevent="handleFileDrop"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style="display: none"
              @change="handleFileSelect"
            />
            <div class="drop-zone-content">
              <strong>
                {{
                  isUploading
                    ? 'Membaca file rekening koran...'
                    : uploadedFileName
                      ? `File terpilih: ${uploadedFileName} (${importForm.rows.length} baris)`
                      : 'Klik di sini atau tarik file Excel (.xlsx) / CSV Rekening Koran'
                }}
              </strong>
              <span>Mendukung format .xlsx (Excel Kopra Bank Mandiri / Template PMO) serta .csv dan .tsv</span>
            </div>
          </div>

          <div v-if="uploadedSheetNames.length > 1" class="sheet-picker-row">
            <label for="imp-sheet">Sheet Excel yang Dibaca ({{ uploadedSheetNames.length }} sheet tersedia)</label>
            <select
              id="imp-sheet"
              v-model="selectedSheetName"
              class="input"
              @change="parseExcelSheetSelection(selectedSheetName)"
            >
              <option v-for="sn in uploadedSheetNames" :key="sn" :value="sn">{{ sn }}</option>
            </select>
          </div>

          <div class="upload-helper-row">
            <span class="cell-sub">Belum punya file contoh?</span>
            <div class="inline-actions">
              <button type="button" class="mini-action-btn soft" @click="downloadExcelTemplate">
                Unduh Template Excel (.xlsx)
              </button>
              <button type="button" class="mini-action-btn soft" @click="loadSampleRows(); runPreview()">
                Isi Contoh Cepat &amp; Pratinjau
              </button>
            </div>
          </div>
        </div>

        <!-- MODE 2: Manual Row Editor -->
        <div v-else class="manual-section">
          <div class="manual-head">
            <strong>Daftar Baris Mutasi ({{ importForm.rows.length }} baris)</strong>
            <div class="inline-actions">
              <button type="button" class="mini-action-btn soft" @click="loadSampleRows">
                Muat Contoh Baris
              </button>
              <button type="button" class="mini-action-btn navy" @click="addSampleRow">
                + Tambah Baris
              </button>
            </div>
          </div>

          <div class="manual-rows-scroll">
            <div v-for="(r, idx) in importForm.rows" :key="idx" class="manual-row-card">
              <div class="manual-row-head">
                <span class="mono-pill">Baris #{{ idx + 1 }}</span>
                <button
                  v-if="importForm.rows.length > 1"
                  type="button"
                  class="mini-action-btn danger"
                  @click="removeRow(idx)"
                >
                  Hapus
                </button>
              </div>
              <div class="form-2col">
                <div class="field">
                  <label :for="`r-date-${idx}`">Tanggal Mutasi</label>
                  <input :id="`r-date-${idx}`" v-model="r.transactionDate" type="date" class="input" @input="previewResult = null" />
                </div>
                <div class="field">
                  <label :for="`r-ref-${idx}`">No. Referensi Bank</label>
                  <input :id="`r-ref-${idx}`" v-model="r.referenceNo" type="text" class="input" placeholder="Contoh: TRF-123456" @input="previewResult = null" />
                </div>
                <div class="field">
                  <label :for="`r-dir-${idx}`">Jenis Mutasi</label>
                  <select :id="`r-dir-${idx}`" v-model="r.direction" class="input" @change="previewResult = null">
                    <option value="CREDIT">Uang Masuk (Kredit Bank)</option>
                    <option value="DEBIT">Uang Keluar (Debet Bank / Biaya Admin)</option>
                  </select>
                </div>
                <div class="field">
                  <label :for="`r-amt-${idx}`">Nominal (IDR)</label>
                  <CurrencyInput v-model="r.amount" :min="1" @update:model-value="previewResult = null" />
                </div>
              </div>
              <div class="field">
                <label :for="`r-desc-${idx}`">Uraian Transaksi di Rekening Koran</label>
                <input :id="`r-desc-${idx}`" v-model="r.description" type="text" class="input" placeholder="Keterangan mutasi bank" @input="previewResult = null" />
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Result Box -->
        <div v-if="previewResult" class="preview-result-box">
          <div class="preview-summary-strip">
            <div><span>Total Baris</span><strong>{{ previewResult.summary.totalRows }}</strong></div>
            <div><span>Cocok Otomatis</span><strong class="text-pos">{{ previewResult.summary.autoMatchedCount }}</strong></div>
            <div><span>Belum Cocok</span><strong class="text-warn">{{ previewResult.summary.unmatchedCount }}</strong></div>
            <div><span>Duplikat Dilewati</span><strong class="text-danger">{{ previewResult.summary.duplicateCount }}</strong></div>
          </div>

          <div v-if="parsedTotals.totalCredit > 0 || parsedTotals.totalDebit > 0" class="preview-totals-bar">
            <span>
              Total Uang Masuk (Kredit): <strong class="money text-pos">{{ formatRupiah(parsedTotals.totalCredit) }}</strong>
            </span>
            <span>
              Total Uang Keluar (Debet): <strong class="money">{{ formatRupiah(parsedTotals.totalDebit) }}</strong>
            </span>
          </div>

          <div class="preview-table-wrap">
            <table class="clean-table compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tanggal &amp; Ref</th>
                  <th>Uraian</th>
                  <th>Jenis</th>
                  <th class="col-num">Nominal</th>
                  <th>Hasil Cek</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in previewResult.rows.slice(0, 100)" :key="row.rowNumber">
                  <td>{{ row.rowNumber }}</td>
                  <td>
                    <div class="mono-code">{{ row.referenceNo }}</div>
                    <div class="cell-sub">{{ formatDate(row.transactionDate) }}</div>
                  </td>
                  <td>{{ row.description }}</td>
                  <td>
                    <span class="tag-pill" :class="row.direction === 'CREDIT' ? 'ok' : 'muted'">
                      {{ row.direction === 'CREDIT' ? 'Masuk' : 'Keluar' }}
                    </span>
                  </td>
                  <td class="col-num money">{{ formatRupiah(row.amount) }}</td>
                  <td>
                    <span class="tag-pill" :class="getMatchStatusClass(row.isDuplicate ? 'DUPLICATE' : row.matchStatus)">
                      {{ row.isDuplicate ? 'Duplikat (Dilewati)' : formatMatchStatusLabel(row.matchStatus) }}
                    </span>
                    <div v-if="row.matchedDocNumber" class="cell-sub">{{ row.matchedDocNumber }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="previewResult.rows.length > 100" class="cell-sub">
            Menampilkan 100 baris pertama dari total {{ previewResult.rows.length }} baris. Seluruh baris valid akan disimpan saat klik "2. Simpan Mutasi ke Rekonsiliasi".
          </div>
        </div>

        <!-- Sticky Modal Footer -->
        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="importModalOpen = false">Batal</button>
          <button
            type="button"
            class="pill-btn-outline"
            :disabled="isPreviewing || importForm.rows.length === 0"
            @click="runPreview"
          >
            {{ isPreviewing ? 'Memeriksa...' : '1. Periksa & Cek Otomatis' }}
          </button>
          <button
            type="button"
            class="pill-btn-navy"
            :disabled="!previewResult || isCommitting"
            @click="commitImport"
          >
            {{ isCommitting ? 'Menyimpan...' : '2. Simpan Mutasi ke Rekonsiliasi' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <!-- ==================== MODAL 2: COCOKKAN / VERIFIKASI BARIS MUTASI ==================== -->
    <ModalDialog
      :open="matchModalOpen"
      title="Cocokkan Baris Mutasi Bank"
      maxWidth="680px"
      @close="matchModalOpen = false"
    >
      <form v-if="selectedLine" class="clean-form" @submit.prevent="submitMatchLine">
        <AlertBanner
          v-if="modalErrorMsg"
          variant="danger"
          title="Gagal Menyimpan"
          :message="modalErrorMsg"
          @dismiss="modalErrorMsg = ''"
        />

        <!-- Bank Line Summary Banner -->
        <div class="line-summary-banner">
          <div>
            <div class="mono-code">{{ selectedLine.referenceNo }} &middot; {{ formatDate(selectedLine.transactionDate) }}</div>
            <strong>{{ selectedLine.description }}</strong>
          </div>
          <div class="line-summary-amt">
            <span class="tag-pill" :class="selectedLine.direction === 'CREDIT' ? 'ok' : 'muted'">
              {{ selectedLine.direction === 'CREDIT' ? 'Uang Masuk' : 'Uang Keluar' }}
            </span>
            <strong class="money" :class="selectedLine.direction === 'CREDIT' ? 'text-pos' : 'text-dark'">
              {{ selectedLine.direction === 'CREDIT' ? '+' : '-' }}{{ formatRupiah(selectedLine.amount) }}
            </strong>
          </div>
        </div>

        <div class="field">
          <label for="m-status">Keputusan Pencocokan</label>
          <select id="m-status" v-model="matchForm.matchStatus" class="input">
            <option value="MATCHED">Cocok dengan Transaksi Internal</option>
            <option value="EXCEPTION">Catatan Khusus / Selisih Bank (Biaya Admin, Jasa Giro, dll.)</option>
            <option value="NEEDS_REVIEW">Tandai Perlu Pengecekan Lebih Lanjut</option>
            <option v-if="selectedLine.matchStatus !== 'UNMATCHED'" value="UNMATCHED">
              Batalkan Pencocokan (Kembalikan ke Belum Cocok)
            </option>
          </select>
        </div>

        <template v-if="matchForm.matchStatus === 'MATCHED'">
          <div class="field">
            <label for="m-type">Jenis Dokumen Internal</label>
            <select id="m-type" v-model="matchForm.matchedEntityType" class="input">
              <option v-for="opt in entityTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div
            v-if="matchForm.matchedEntityType === 'Payment' && (penerimaanCandidates?.unreconciled?.length || 0) > 0"
            class="field"
          >
            <label for="m-payment-cand">Pilih Transaksi Buku Harian (Belum Terekonsiliasi)</label>
            <select
              id="m-payment-cand"
              v-model="matchForm.matchedEntityId"
              class="input"
              @change="handleCandidatePaymentSelect"
            >
              <option value="">-- Pilih transaksi Buku Harian yang sesuai --</option>
              <option v-for="p in penerimaanCandidates.unreconciled" :key="p.id" :value="p.id">
                {{ p.receiptNumber }} | {{ formatDate(p.paymentDate) }} | {{ p.payerName }} | {{ formatRupiah(p.grossAmount) }}
              </option>
            </select>
          </div>

          <div class="field">
            <label for="m-doc">Nomor Dokumen Internal</label>
            <input
              id="m-doc"
              v-model="matchForm.matchedDocNumber"
              type="text"
              class="input"
              placeholder="Contoh: 001/KU/PMO-UT/XI/2026"
              required
            />
          </div>
        </template>

        <div class="field">
          <label for="m-note">
            {{ matchForm.matchStatus === 'EXCEPTION' ? 'Keterangan Selisih / Biaya Bank *' : 'Catatan Tambahan (Opsional)' }}
          </label>
          <textarea
            id="m-note"
            v-model="matchForm.exceptionNote"
            rows="3"
            class="input"
            :required="matchForm.matchStatus === 'EXCEPTION'"
            :placeholder="
              matchForm.matchStatus === 'EXCEPTION'
                ? 'Contoh: Biaya administrasi bulanan rekening Bank Mandiri'
                : 'Catatan hasil pemeriksaan mutasi bank (opsional)'
            "
          ></textarea>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="matchModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy" :disabled="isSavingMatch">
            {{ isSavingMatch ? 'Menyimpan...' : 'Simpan Pencocokan' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL 3: KONFIRMASI FINALISASI ==================== -->
    <ModalDialog
      :open="finalizeModalOpen"
      title="Finalisasi & Kunci Rekonsiliasi"
      maxWidth="520px"
      @close="finalizeModalOpen = false"
    >
      <div v-if="selectedImport" class="clean-form">
        <p class="confirm-text">
          Sesi rekonsiliasi <strong>{{ selectedImport.importNumber }}</strong> ({{ selectedImport.periodLabel }}) akan dikunci permanen dan tidak bisa diubah lagi.
        </p>

        <div v-if="selectedImportStats.unmatched > 0 || selectedImportStats.review > 0" class="warn-callout">
          <strong>Perhatian:</strong> Masih ada
          <strong>{{ selectedImportStats.unmatched }} baris Belum Cocok</strong>
          <template v-if="selectedImportStats.review > 0">
            dan <strong>{{ selectedImportStats.review }} baris Perlu Cek</strong>
          </template>
          pada sesi ini. Sebaiknya cocokkan seluruh baris terlebih dahulu sebelum mengunci.
        </div>
        <div v-else class="ok-callout">
          Seluruh {{ selectedImportStats.total }} baris mutasi sudah ditangani ({{ selectedImportStats.matched }} cocok, {{ selectedImportStats.exception }} catatan khusus). Siap dikunci resmi.
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="finalizeModalOpen = false">Batal</button>
          <button type="button" class="pill-btn-emerald" :disabled="finalizing" @click="confirmFinalizeReconciliation">
            {{ finalizing ? 'Mengunci...' : 'Ya, Kunci Rekonsiliasi' }}
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.poital-recon {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 48px;
}

.recon-top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.recon-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 800;
  color: #0b2144;
  letter-spacing: -0.02em;
}

.recon-subtitle {
  margin: 4px 0 0;
  font-size: 0.88rem;
  color: #475569;
  max-width: 720px;
}

.recon-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-btn-navy {
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: #0b2144;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 44px;
  transition: background 150ms ease;
}
.pill-btn-navy:hover:not(:disabled) { background: #143366; }
.pill-btn-navy:disabled { opacity: 0.55; cursor: not-allowed; }

.pill-btn-emerald {
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: #059669;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 44px;
  transition: background 150ms ease;
}
.pill-btn-emerald:hover:not(:disabled) { background: #047857; }
.pill-btn-emerald:disabled { opacity: 0.55; cursor: not-allowed; }

.pill-btn-soft {
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0b2144;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  transition: background 150ms ease, border-color 150ms ease;
}
.pill-btn-soft:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
.pill-btn-soft:disabled { opacity: 0.55; cursor: not-allowed; }

.pill-btn-outline {
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid #034693;
  background: #eff6ff;
  color: #034693;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 44px;
  transition: background 150ms ease;
}
.pill-btn-outline:hover:not(:disabled) { background: #dbeafe; }
.pill-btn-outline:disabled { opacity: 0.55; cursor: not-allowed; }

/* Workflow Stepper */
.workflow-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}

.workflow-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wf-step-link {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.wf-step-link:hover { background: #eff6ff; border-color: #bfdbfe; color: #034693; }

.wf-step-active {
  background: #0b2144;
  color: #ffffff;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.wf-sep { color: #cbd5e1; font-weight: 700; }
.wf-dot { margin: 0 6px; color: #cbd5e1; }
.workflow-counter { font-size: 0.82rem; color: #475569; }

/* Bank Account Selector Cards */
.bank-selector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 14px;
}

.bank-card {
  text-align: left;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}
.bank-card:hover { border-color: #94a3b8; }
.bank-card.active {
  border-color: #0b2144;
  background: #f8fafc;
  box-shadow: 0 0 0 1px #0b2144;
}

.bank-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.bank-card-badges { display: flex; align-items: center; gap: 6px; }
.bank-card-name { font-size: 0.98rem; font-weight: 750; color: #0b2144; margin-top: 2px; }
.bank-card-balance { font-size: 1.32rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
.bank-card-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.78rem; color: #475569; }

.mono-pill {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #0f172a;
}

.coa-pill {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.73rem;
  font-weight: 600;
  color: #034693;
}

/* 3-Card Summary Row */
.kpi-metric-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  border-radius: 16px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e2e8f0;
}
.metric-head-inline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.metric-title { font-size: 0.82rem; font-weight: 650; }
.metric-number-val { font-size: clamp(1.2rem, 1.6vw, 1.52rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.trend-text { font-size: 0.78rem; line-height: 1.4; }

.hero-card { background: #0b2144; border-color: #0b2144; color: #ffffff; }
.hero-card .metric-title { color: rgba(255, 255, 255, 0.85); }
.hero-card .trend-text { color: rgba(255, 255, 255, 0.76); }

.blue-card { background: #eff6ff; border-color: #bfdbfe; color: #034693; }
.blue-card .trend-text { color: #1e40af; }

.emerald-card { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
.emerald-card .trend-text { color: #047857; }

.amber-card { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.amber-card .trend-text { color: #92400e; }

/* Main Cards & Tables */
.poital-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 20px;
}

.card-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.batch-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.batch-period { font-size: 0.78rem; font-weight: 600; color: #475569; }
.card-title { margin: 0; font-size: 1.05rem; font-weight: 750; color: #0b2144; }
.card-sub { display: block; margin-top: 3px; font-size: 0.82rem; color: #475569; }

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-select {
  height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 600;
}

.table-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.filter-pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-pill {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.filter-pill.active {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.pill-search-input {
  height: 40px;
  min-width: 260px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.84rem;
}

.table-wrap { width: 100%; overflow-x: auto; }
.clean-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.clean-table.compact { font-size: 0.8rem; }
.clean-table th {
  text-align: left;
  padding: 10px 10px;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 650;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}
.clean-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
  color: #0f172a;
}
.col-num { text-align: right !important; white-space: nowrap; }
.empty-cell { text-align: center; padding: 28px !important; color: #475569; }
.mono-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; font-weight: 650; color: #034693; }
.row-main-text { font-weight: 600; color: #0f172a; }
.cell-sub { font-size: 0.76rem; color: #475569; margin-top: 2px; }
.note-sub { font-size: 0.77rem; color: #92400e; background: #fffbeb; padding: 3px 8px; border-radius: 6px; display: inline-block; margin-top: 4px; }
.unit-mini-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.7rem;
  font-weight: 700;
}

.tag-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 700;
  white-space: nowrap;
}
.tag-pill.ok { background: #dcfce7; color: #166534; }
.tag-pill.warn { background: #fef3c7; color: #92400e; }
.tag-pill.info { background: #eff6ff; color: #1d4ed8; }
.tag-pill.muted { background: #f1f5f9; color: #475569; }
.tag-pill.danger { background: #fee2e2; color: #b91c1c; }

.text-pos { color: #047857; }
.text-warn { color: #b45309; }
.text-danger { color: #b91c1c; }
.text-dark { color: #0f172a; }

.inline-actions { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.mini-action-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0b2144;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 34px;
}
.mini-action-btn.navy { background: #0b2144; border-color: #0b2144; color: #ffffff; }
.mini-action-btn.soft { background: #f8fafc; }
.mini-action-btn.danger { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }

/* Empty Recon Card */
.empty-recon-card { text-align: center; padding: 38px 24px; }
.empty-recon-inner { max-width: 580px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-recon-inner h2 { margin: 0; font-size: 1.15rem; font-weight: 750; color: #0b2144; }
.empty-recon-inner p { margin: 0; font-size: 0.88rem; color: #475569; line-height: 1.5; }
.empty-recon-actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

/* Modal Forms */
.modal-stack,
.clean-form { display: flex; flex-direction: column; gap: 14px; }
.clean-form .input,
.modal-stack .input { height: 46px; min-height: 46px; font-size: 0.9rem; box-sizing: border-box; }
.clean-form textarea.input { height: auto; min-height: 84px; padding: 10px 12px; }

.entry-mode-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.entry-tab-btn {
  text-align: left;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.entry-tab-btn strong { font-size: 0.88rem; color: #0b2144; }
.entry-tab-btn span { font-size: 0.76rem; color: #475569; }
.entry-tab-btn.active {
  border-color: #0b2144;
  background: #eff6ff;
}

.form-2col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: end; }
.form-3col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.field label { font-size: 0.8rem; font-weight: 650; color: #334155; }

.upload-section { display: flex; flex-direction: column; gap: 10px; }
.drop-zone {
  border: 2px dashed #94a3b8;
  border-radius: 14px;
  padding: 26px 20px;
  text-align: center;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}
.drop-zone:hover { border-color: #034693; background: #eff6ff; }
.drop-zone-content { display: flex; flex-direction: column; gap: 4px; }
.drop-zone-content strong { font-size: 0.92rem; color: #0b2144; }
.drop-zone-content span { font-size: 0.78rem; color: #475569; }
.upload-helper-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.sheet-picker-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
.sheet-picker-row label { font-size: 0.78rem; font-weight: 700; color: #034693; }
.preview-totals-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  font-size: 0.82rem;
  color: #334155;
}

.manual-section { display: flex; flex-direction: column; gap: 10px; }
.manual-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.manual-rows-scroll { display: flex; flex-direction: column; gap: 10px; max-height: 290px; overflow-y: auto; padding-right: 4px; }
.manual-row-card {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.manual-row-head { display: flex; align-items: center; justify-content: space-between; }

.preview-result-box {
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 14px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.preview-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.preview-summary-strip > div {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preview-summary-strip span { font-size: 0.74rem; color: #475569; }
.preview-summary-strip strong { font-size: 1.05rem; color: #0b2144; }
.preview-table-wrap { max-height: 200px; overflow-y: auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; }

.line-summary-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.line-summary-amt { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

.confirm-text { margin: 0; font-size: 0.9rem; color: #1e293b; line-height: 1.5; }
.warn-callout {
  padding: 12px 14px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
  font-size: 0.84rem;
  line-height: 1.45;
}
.ok-callout {
  padding: 12px 14px;
  border-radius: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: 0.84rem;
  line-height: 1.45;
}

.modal-foot {
  position: sticky;
  bottom: -24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0 18px;
  margin-top: 4px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  z-index: 5;
}

@media (max-width: 1024px) {
  .kpi-metric-row { grid-template-columns: 1fr; }
  .form-3col { grid-template-columns: 1fr; }
  .preview-summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .form-2col,
  .entry-mode-tabs { grid-template-columns: 1fr; }
  .pill-search-input { width: 100%; min-width: 0; }
  .line-summary-amt { align-items: flex-start; }
}
</style>
