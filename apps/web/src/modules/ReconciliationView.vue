<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';

const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

const bankAccounts = ref<any[]>([]);
const statementImports = ref<any[]>([]);
const selectedImport = ref<any>(null);
const selectedAccountId = ref<string>('');
const accountSummary = ref<any>(null);

// Preview & Import State
const importModalOpen = ref(false);
const previewResult = ref<any>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);

const importForm = ref({
  bankAccountId: '',
  periodLabel: 'Desember 2026',
  fileName: 'rekening-koran-bri-des-2026.csv',
  rows: [
    {
      transactionDate: '2026-12-01',
      description: 'SETORAN KASIR POS PENERIMAAN KOMERSIAL UNIT TCI',
      referenceNo: 'STR-BRI-20261201-01',
      direction: 'CREDIT' as 'CREDIT' | 'DEBIT',
      amount: 7500000,
    },
    {
      transactionDate: '2026-12-02',
      description: 'PEMBAYARAN VENDOR PENGADAAN CV SINERGI SARANA',
      referenceNo: 'LS-BRI-20261202-02',
      direction: 'DEBIT' as 'CREDIT' | 'DEBIT',
      amount: 18000000,
    },
  ],
});

// Reconcile Line Modal
const matchModalOpen = ref(false);
const selectedLine = ref<any>(null);
const matchForm = ref({
  matchStatus: 'MATCHED',
  matchedEntityType: 'CashDeposit',
  matchedDocNumber: '',
  exceptionNote: '',
});

const briAccount = computed(() => {
  return bankAccounts.value.find((b) => b.code.includes('BRI') || b.glAccountCode === '110101020200') || bankAccounts.value[0];
});

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

    if (!selectedAccountId.value && bankAccounts.value.length > 0) {
      selectedAccountId.value = briAccount.value ? briAccount.value.id : bankAccounts.value[0].id;
    }

    if (statementImports.value.length > 0) {
      selectedImport.value =
        statementImports.value.find((x) => x.id === selectedImport.value?.id) || statementImports.value[0];
    }

    if (selectedAccountId.value) {
      await fetchAccountSummary(selectedAccountId.value);
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data rekening dan rekonsiliasi bank.';
  } finally {
    loading.value = false;
  }
}

async function fetchAccountSummary(accId: string) {
  try {
    const res = await apiFetch(`/reconciliation/summary/${accId}`);
    accountSummary.value = res.data;
  } catch {
    // Non-blocking fallback
    accountSummary.value = null;
  }
}

function handleAccountChange() {
  if (selectedAccountId.value) {
    fetchAccountSummary(selectedAccountId.value);
  }
}

function openImportModal() {
  previewResult.value = null;
  importForm.value.bankAccountId = selectedAccountId.value || briAccount.value?.id || bankAccounts.value[0]?.id || '';
  importModalOpen.value = true;
}

function loadBriPreset() {
  importForm.value.fileName = 'mutasi-bri-operasional-pertor310.csv';
  importForm.value.periodLabel = 'Desember 2026';
  importForm.value.rows = [
    {
      transactionDate: '2026-12-16',
      description: 'SETORAN KASIR POS UNIT PMO UTAMA',
      referenceNo: 'STR-BRI-20261216-01',
      direction: 'CREDIT',
      amount: 500000,
    },
    {
      transactionDate: '2026-12-17',
      description: 'PELUNASAN VENDOR PENERIMAAN BARANG JASA LS',
      referenceNo: 'LS-BRI-20261217-02',
      direction: 'DEBIT',
      amount: 19980000,
    },
    {
      transactionDate: '2026-12-18',
      description: 'PENCAIRAN DANA PANJAR UMK UNIT DIKLAT',
      referenceNo: 'UMK-BRI-20261218-03',
      direction: 'DEBIT',
      amount: 5000000,
    },
    {
      transactionDate: '2026-12-18',
      description: 'BIAYA ADMINISTRASI REKENING BANK BRI',
      referenceNo: 'ADM-BRI-20261218-99',
      direction: 'DEBIT',
      amount: 25000,
    },
  ];
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

async function processUploadedFile(file: File) {
  isUploading.value = true;
  errorMsg.value = '';
  try {
    const rawContent = await file.text();
    const res = await apiFetch('/reconciliation/parse-csv', {
      method: 'POST',
      body: JSON.stringify({
        rawContent,
        fileName: file.name,
      }),
    });
    importForm.value.fileName = file.name;
    importForm.value.rows = res.data.rows;
    feedbackMsg.value = `File rekening koran "${file.name}" berhasil dibaca (${res.data.totalRows} baris transaksi). Silakan klik "Jalankan Pratinjau".`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memproses file rekening koran.';
  } finally {
    isUploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = '';
  }
}

function addSampleRow() {
  importForm.value.rows.push({
    transactionDate: new Date().toISOString().slice(0, 10),
    description: 'MUTASI REKENING KORAN BANK BRI',
    referenceNo: `BRI-${Date.now().toString().slice(-6)}`,
    direction: 'CREDIT',
    amount: 1000000,
  });
}

function removeRow(idx: number) {
  importForm.value.rows.splice(idx, 1);
}

async function runPreview() {
  errorMsg.value = '';
  try {
    const res = await apiFetch('/reconciliation/preview', {
      method: 'POST',
      body: JSON.stringify(importForm.value),
    });
    previewResult.value = res.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal melakukan pratinjau mutasi bank.';
  }
}

async function commitImport() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/reconciliation/import', {
      method: 'POST',
      body: JSON.stringify(importForm.value),
    });
    importModalOpen.value = false;
    feedbackMsg.value = `Mutasi bank ${res.data.importNumber} berhasil diimpor (${res.data.totalLines} baris valid, ${res.data.duplicateCount} baris duplikat dilewati).`;
    await loadReconciliation();
    selectedImport.value = statementImports.value[0];
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengimpor mutasi bank.';
  }
}

function openMatchLine(line: any) {
  selectedLine.value = line;
  matchForm.value = {
    matchStatus: line.matchStatus === 'UNMATCHED' ? 'MATCHED' : line.matchStatus,
    matchedEntityType: line.matchedEntityType || (line.direction === 'CREDIT' ? 'CashDeposit' : 'Expense'),
    matchedDocNumber: line.matchedDocNumber || '',
    exceptionNote: line.exceptionNote || '',
  };
  matchModalOpen.value = true;
}

async function submitMatchLine() {
  if (!selectedLine.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/reconciliation/lines/${selectedLine.value.id}/match`, {
      method: 'POST',
      body: JSON.stringify(matchForm.value),
    });
    matchModalOpen.value = false;
    feedbackMsg.value = `Status baris mutasi ref ${selectedLine.value.referenceNo} berhasil diperbarui menjadi ${matchForm.value.matchStatus}.`;
    await loadReconciliation();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memperbarui rekonsiliasi baris.';
  }
}

async function finalizeReconciliation(imp: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/reconciliation/imports/${imp.id}/finalize`, { method: 'POST' });
    feedbackMsg.value = `Sesi rekonsiliasi ${imp.importNumber} telah difinalisasi dan dikunci resmi.`;
    await loadReconciliation();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memfinalisasi rekonsiliasi.';
  }
}

onMounted(loadReconciliation);
</script>

<template>
  <div class="reconciliation-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Rekonsiliasi Bank BRI & Buku Besar</h1>
        <p class="page-desc">
          Pencocokan mutasi rekening koran Bank BRI dengan pencatatan buku besar operasional PMO (Pertor 310).
        </p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" @click="loadReconciliation">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Muat Ulang
        </button>
        <button
          v-if="auth.hasPermission('reconciliation:manage')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openImportModal"
        >
          + Pratinjau & Impor Mutasi Bank BRI
        </button>
      </div>
    </div>

    <!-- Pertor 310 Compliance Banner -->
    <div class="panel" style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.08) 0%, rgba(14, 165, 233, 0.05) 100%); border-left: 4px solid var(--primary); margin-bottom: 16px; padding: 14px 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="doc-code" style="background: var(--primary); color: #fff; font-weight: 700;">PERTUM-310 BANK BRI</span>
            <strong>Kepatuhan Rekonsiliasi Bank BRI (Akun COA 110101020200)</strong>
          </div>
          <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted);">
            Sistem menjalankan pencocokan otomatis (*auto-matching*) antara mutasi rekening koran BRI dengan setoran kasir POS, pelunasan pengadaan LS, dan panjar UMK. Deteksi sidik jari SHA-256 mencegah impor ganda.
          </p>
        </div>
        <div v-if="accountSummary" style="display: flex; gap: 12px; align-items: center;">
          <div style="text-align: right;">
            <div style="font-size: 0.76rem; color: var(--text-muted);">Selisih Buku Kas vs Bank</div>
            <div class="money" :style="{ color: accountSummary.isBalanced ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">
              {{ formatRupiah(Math.abs(accountSummary.difference)) }}
            </div>
          </div>
          <span :class="['status-pill', accountSummary.isBalanced ? 'status-pill-success' : 'status-pill-warning']">
            {{ accountSummary.isBalanced ? 'SEIMBANG (0 SELISIH)' : 'PERLU REKONSILIASI' }}
          </span>
        </div>
      </div>
    </div>

    <AlertBanner
      v-if="feedbackMsg"
      variant="success"
      title="Operasi Berhasil"
      :message="feedbackMsg"
      @dismiss="feedbackMsg = ''"
    />

    <AlertBanner
      v-if="errorMsg"
      variant="danger"
      title="Peringatan Kontrol Rekonsiliasi"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <!-- Bank Accounts Summary Strip -->
    <section class="metric-strip" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))">
      <div
        v-for="acc in bankAccounts"
        :key="acc.id"
        class="metric-box"
        :style="{ border: acc.id === selectedAccountId ? '2px solid var(--primary)' : undefined, cursor: 'pointer' }"
        @click="selectedAccountId = acc.id; handleAccountChange();"
      >
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span class="doc-code">{{ acc.code }}</span>
          <span class="doc-code" style="font-weight: 700;">COA {{ acc.glAccountCode }}</span>
        </div>
        <div style="margin-top: 6px"><strong>{{ acc.bankName }}</strong></div>
        <div class="metric-value money">{{ formatRupiah(acc.currentBalance) }}</div>
        <div class="metric-sub">No. Rek (Masked): {{ acc.accountNumberMasked }} | {{ acc.accountHolder }}</div>
      </div>
    </section>

    <!-- Real-time Two-Column Summary Widget -->
    <div v-if="accountSummary" class="panel" style="margin-bottom: 16px;">
      <div class="panel-header" style="margin-bottom: 10px;">
        <h3>Kalkulasi Rekonsiliasi Dua Kolom: {{ accountSummary.bankName }}</h3>
        <span class="doc-code">Akun Buku Besar: {{ accountSummary.glAccountCode }}</span>
      </div>
      <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="panel" style="padding: 12px; background: var(--bg-canvas);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Saldo Menurut Buku Kas PMO (GL)</div>
          <div class="metric-value money" style="font-size: 1.35rem; color: var(--primary);">
            {{ formatRupiah(accountSummary.bookBalance) }}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Akumulasi Debet - Kredit Jurnal Posted</div>
        </div>
        <div class="panel" style="padding: 12px; background: var(--bg-canvas);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Saldo Menurut Rekening Koran Bank</div>
          <div class="metric-value money" style="font-size: 1.35rem; color: #0284c7;">
            {{ formatRupiah(accountSummary.bankBalance) }}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Saldo fisik mutasi rekening bank</div>
        </div>
        <div class="panel" style="padding: 12px; background: var(--bg-canvas);">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Selisih Rekonsiliasi (Unreconciled)</div>
          <div class="metric-value money" style="font-size: 1.35rem;" :style="{ color: accountSummary.difference === 0 ? 'var(--success)' : 'var(--danger)' }">
            {{ formatRupiah(Math.abs(accountSummary.difference)) }}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
            {{ accountSummary.difference === 0 ? 'Sesuai sempurna (Tanpa selisih)' : 'Memerlukan jurnal penyesuaian/revisi' }}
          </div>
        </div>
      </div>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Sesi Rekonsiliasi Bank"
      message="Mengambil histori impor mutasi dan status pencocokan..."
    />

    <div v-else-if="selectedImport" class="panel">
      <div class="panel-header">
        <div>
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px">
            <span class="doc-code">{{ selectedImport.importNumber }}</span>
            <StatusBadge :status="selectedImport.status" />
          </div>
          <h2>File: {{ selectedImport.fileName }} (Periode {{ selectedImport.periodLabel }})</h2>
          <p class="text-muted">
            Rekening: {{ selectedImport.bankAccount?.bankName }} |
            Cocok Otomatis: <strong>{{ selectedImport.matchedCount }}</strong> |
            Belum Cocok / Review: <strong>{{ selectedImport.unmatchedCount }}</strong> |
            Duplikat Dilewati: <strong>{{ selectedImport.duplicateCount }}</strong>
          </p>
        </div>

        <div class="btn-row">
          <select
            v-if="statementImports.length > 1"
            v-model="selectedImport"
            class="select"
            aria-label="Pilih batch impor mutasi"
          >
            <option v-for="imp in statementImports" :key="imp.id" :value="imp">
              {{ imp.importNumber }} - {{ imp.fileName }}
            </option>
          </select>

          <button
            v-if="selectedImport.status !== 'FINALIZED' && auth.hasPermission('reconciliation:manage')"
            type="button"
            class="btn btn-sm btn-success"
            @click="finalizeReconciliation(selectedImport)"
          >
            Finalisasi & Kunci Rekonsiliasi
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Tanggal & Referensi Bank</th>
              <th>Uraian Mutasi Rekening Bank BRI</th>
              <th>Arah</th>
              <th class="money-col">Nominal Mutasi</th>
              <th>Dokumen Internal Terkait</th>
              <th>Status Rekonsiliasi</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in selectedImport.lines" :key="line.id">
              <td>
                <span class="doc-code">{{ line.referenceNo }}</span>
                <div class="text-muted" style="font-size: 0.76rem">{{ formatDate(line.transactionDate) }}</div>
              </td>
              <td>
                <strong>{{ line.description }}</strong>
                <div v-if="line.exceptionNote" class="text-muted" style="font-size: 0.78rem; margin-top: 4px">
                  Catatan Review: {{ line.exceptionNote }}
                </div>
              </td>
              <td>
                <span :class="['status-pill', line.direction === 'CREDIT' ? 'status-pill-success' : 'status-pill-neutral']">
                  {{ line.direction === 'CREDIT' ? 'MASUK (CR)' : 'KELUAR (DB)' }}
                </span>
              </td>
              <td class="money-col">
                <strong :style="{ color: line.direction === 'CREDIT' ? 'var(--success)' : 'inherit' }">
                  {{ line.direction === 'CREDIT' ? '+' : '-' }}{{ formatRupiah(line.amount) }}
                </strong>
              </td>
              <td>
                <span v-if="line.matchedDocNumber" class="doc-code" style="color: var(--primary); font-weight: 600;">
                  {{ line.matchedEntityType }}: {{ line.matchedDocNumber }}
                </span>
                <span v-else class="text-muted" style="font-size: 0.82rem;">Belum Dipetakan</span>
              </td>
              <td><StatusBadge :status="line.matchStatus" /></td>
              <td>
                <button
                  v-if="selectedImport.status !== 'FINALIZED' && auth.hasPermission('reconciliation:manage')"
                  type="button"
                  class="btn btn-sm"
                  @click="openMatchLine(line)"
                >
                  Verifikasi / Cocokkan
                </button>
                <span v-else class="text-muted" style="font-size: 0.82rem;">Terkunci</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State if no imports exist yet -->
    <div v-else class="panel" style="text-align: center; padding: 36px 20px;">
      <h3>Belum Ada Sesi Impor Mutasi Bank</h3>
      <p class="text-muted" style="max-width: 500px; margin: 8px auto 16px;">
        Klik tombol di bawah untuk mengunggah file rekening koran Bank BRI (.CSV) atau menggunakan format template resmi.
      </p>
      <button
        v-if="auth.hasPermission('reconciliation:manage')"
        type="button"
        class="btn btn-primary"
        @click="openImportModal"
      >
        Mulai Pratinjau & Impor Rekening Koran
      </button>
    </div>

    <!-- Modal: Preview & Import Statement -->
    <ModalDialog :open="importModalOpen" title="Pratinjau & Impor Rekening Koran Bank BRI" @close="importModalOpen = false">
      <div style="display: flex; flex-direction: column; gap: 14px">
        <!-- Drag & Drop File Upload Area -->
        <div
          class="drop-zone"
          style="border: 2px dashed var(--border); border-radius: 8px; padding: 20px; text-align: center; background: var(--bg-canvas); cursor: pointer;"
          @click="triggerFileInput"
          @dragover.prevent
          @drop.prevent="handleFileDrop"
        >
          <input
            ref="fileInputRef"
            type="file"
            accept=".csv,.txt,.tsv"
            style="display: none"
            @change="handleFileSelect"
          />
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <strong>Tarik file Rekening Koran Bank BRI ke sini atau Klik untuk Pilih File</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">
              Mendukung format CSV, TXT, dan TSV hasil ekspor Internet Banking / CMS BRI
            </span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.82rem; color: var(--text-muted);">Atau gunakan konfigurasi langsung:</span>
          <button type="button" class="btn btn-sm" @click="loadBriPreset">
            Gunakan Sampel Mutasi Bank BRI (Pertor 310)
          </button>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="imp-bank" class="form-label">Rekening Bank Tujuan</label>
            <select id="imp-bank" v-model="importForm.bankAccountId" class="select">
              <option v-for="b in bankAccounts" :key="b.id" :value="b.id">
                {{ b.code }} - {{ b.bankName }} (COA {{ b.glAccountCode }})
              </option>
            </select>
          </div>
          <div class="form-field">
            <label for="imp-period" class="form-label">Label Periode</label>
            <input id="imp-period" v-model="importForm.periodLabel" type="text" class="input" />
          </div>
          <div class="form-field">
            <label for="imp-file" class="form-label">Nama File Sumber</label>
            <input id="imp-file" v-model="importForm.fileName" type="text" class="input" />
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
            <strong>Daftar Baris Mutasi Bank ({{ importForm.rows.length }} Baris)</strong>
            <button type="button" class="btn btn-sm" @click="addSampleRow">+ Tambah Baris</button>
          </div>

          <div style="max-height: 240px; overflow-y: auto; padding-right: 4px;">
            <div
              v-for="(r, idx) in importForm.rows"
              :key="idx"
              class="panel"
              style="padding: 10px; margin-bottom: 8px; background: var(--bg-canvas);"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span class="doc-code" style="font-size: 0.76rem;">Baris #{{ idx + 1 }}</span>
                <button
                  type="button"
                  class="btn btn-sm"
                  style="color: var(--danger); padding: 2px 6px; font-size: 0.75rem;"
                  @click="removeRow(idx)"
                >
                  Hapus
                </button>
              </div>
              <div class="form-grid">
                <div class="form-field">
                  <label :for="`r-date-${idx}`" class="form-label">Tanggal</label>
                  <input :id="`r-date-${idx}`" v-model="r.transactionDate" type="date" class="input" />
                </div>
                <div class="form-field">
                  <label :for="`r-ref-${idx}`" class="form-label">No. Referensi Bank</label>
                  <input :id="`r-ref-${idx}`" v-model="r.referenceNo" type="text" class="input" />
                </div>
                <div class="form-field">
                  <label :for="`r-dir-${idx}`" class="form-label">Arah Mutasi</label>
                  <select :id="`r-dir-${idx}`" v-model="r.direction" class="select">
                    <option value="CREDIT">CREDIT (Uang Masuk / Penerimaan)</option>
                    <option value="DEBIT">DEBIT (Uang Keluar / Pengeluaran)</option>
                  </select>
                </div>
                <div class="form-field">
                  <label :for="`r-amt-${idx}`" class="form-label">Nominal (IDR)</label>
                  <input :id="`r-amt-${idx}`" v-model.number="r.amount" type="number" class="input" />
                </div>
              </div>
              <div class="form-field" style="margin-top: 6px">
                <label :for="`r-desc-${idx}`" class="form-label">Uraian Transaksi Bank</label>
                <input :id="`r-desc-${idx}`" v-model="r.description" type="text" class="input" />
              </div>
            </div>
          </div>
        </div>

        <div class="btn-row" style="margin-top: 8px;">
          <button type="button" class="btn btn-sm" @click="runPreview">
            1. Jalankan Pratinjau & Deteksi Duplikat SHA-256
          </button>
          <button
            v-if="previewResult"
            type="button"
            class="btn btn-sm btn-primary"
            @click="commitImport"
          >
            2. Simpan & Eksekusi Impor Mutasi Valid
          </button>
        </div>

        <div v-if="previewResult" class="panel" style="background: var(--bg-subtle)">
          <strong>Hasil Analisis Pratinjau Rekening Koran:</strong>
          <p class="text-muted" style="margin: 4px 0 8px;">
            Total Baris: <strong>{{ previewResult.summary.totalRows }}</strong> |
            Duplikat Terdeteksi: <strong style="color: var(--danger);">{{ previewResult.summary.duplicateCount }}</strong> |
            Cocok Otomatis: <strong style="color: var(--success);">{{ previewResult.summary.autoMatchedCount }}</strong> |
            Belum Cocok: <strong>{{ previewResult.summary.unmatchedCount }}</strong>
          </p>
          <ul style="margin: 0; padding-left: 18px; font-size: 0.84rem; max-height: 140px; overflow-y: auto;">
            <li v-for="row in previewResult.rows" :key="row.rowNumber" style="margin-bottom: 4px;">
              Baris #{{ row.rowNumber }} ({{ row.referenceNo }} - {{ formatRupiah(row.amount) }}):
              <strong :style="{ color: row.isDuplicate ? 'var(--danger)' : (row.matchStatus === 'MATCHED' ? 'var(--success)' : 'inherit') }">
                {{ row.isDuplicate ? 'DUPLIKAT (Akan Dilewati)' : row.matchStatus }}
              </strong>
              <span v-if="row.matchedDocNumber" class="doc-code" style="margin-left: 6px;">
                -> {{ row.matchedEntityType }}: {{ row.matchedDocNumber }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </ModalDialog>

    <!-- Modal: Match / Exception Line -->
    <ModalDialog :open="matchModalOpen" title="Konfirmasi Pencocokan & Rekonsiliasi Bank" @close="matchModalOpen = false">
      <form v-if="selectedLine" @submit.prevent="submitMatchLine" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Referensi Bank: <strong>{{ selectedLine.referenceNo }}</strong> ({{ formatRupiah(selectedLine.amount) }})
          <br />
          <span class="text-muted">{{ selectedLine.description }}</span>
        </p>

        <div class="form-field">
          <label for="m-status" class="form-label">Keputusan Rekonsiliasi</label>
          <select id="m-status" v-model="matchForm.matchStatus" class="select">
            <option value="MATCHED">MATCHED (Cocok dengan Dokumen Internal)</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW (Perlu Verifikasi Bukti Transaksi)</option>
            <option value="EXCEPTION">EXCEPTION (Selisih Bank Ber-Catatan Khusus)</option>
          </select>
        </div>

        <div v-if="matchForm.matchStatus === 'MATCHED'" class="form-grid">
          <div class="form-field">
            <label for="m-type" class="form-label">Tipe Dokumen Internal</label>
            <select id="m-type" v-model="matchForm.matchedEntityType" class="select">
              <option value="CashDeposit">CashDeposit (Setoran Kasir POS)</option>
              <option value="Payment">Payment (Kuitansi Invoice Pelanggan)</option>
              <option value="Expense">Expense (Pengeluaran Tagihan Vendor LS)</option>
              <option value="PettyCashSubmission">PettyCashSubmission (Panjar Kas Kecil UMK)</option>
              <option value="Refund">Refund (Pengembalian Dana)</option>
            </select>
          </div>
          <div class="form-field">
            <label for="m-doc" class="form-label">Nomor Dokumen Internal Terkait</label>
            <input
              id="m-doc"
              v-model="matchForm.matchedDocNumber"
              type="text"
              class="input"
              placeholder="Contoh: DEP-2026-0001 / PO-2026-0001"
              required
            />
          </div>
        </div>

        <div class="form-field">
          <label for="m-note" class="form-label">Catatan Rekonsiliasi / Keterangan Selisih</label>
          <textarea
            id="m-note"
            v-model="matchForm.exceptionNote"
            class="textarea"
            placeholder="Catatan hasil verifikasi rekening koran atau alasan selisih mutasi."
          ></textarea>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="matchModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Hasil Rekonsiliasi</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
