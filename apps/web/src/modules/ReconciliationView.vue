<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

// Preview & Import State
const importModalOpen = ref(false);
const previewResult = ref<any>(null);
const importForm = ref({
  bankAccountId: '',
  periodLabel: 'November 2026',
  fileName: 'mutasi-bank-mandiri-nov-2026.csv',
  rows: [
    {
      transactionDate: '2026-10-25',
      description: 'SETORAN TUNAI LOKET KASIR PMO UTAMA',
      referenceNo: 'STR-BNI-20261025-01',
      direction: 'CREDIT' as 'CREDIT' | 'DEBIT',
      amount: 16575000,
    },
    {
      transactionDate: '2026-10-28',
      description: 'PELUNASAN TERMIN 2 PT BANK NUSANTARA SEJAHTERA',
      referenceNo: 'VA-BNI-20261028-902',
      direction: 'CREDIT' as 'CREDIT' | 'DEBIT',
      amount: 61050000,
    },
  ],
});

// Reconcile Line Modal
const matchModalOpen = ref(false);
const selectedLine = ref<any>(null);
const matchForm = ref({
  matchStatus: 'MATCHED',
  matchedEntityType: 'Payment',
  matchedDocNumber: '',
  exceptionNote: '',
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
    if (statementImports.value.length > 0) {
      selectedImport.value =
        statementImports.value.find((x) => x.id === selectedImport.value?.id) || statementImports.value[0];
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data rekening dan rekonsiliasi bank.';
  } finally {
    loading.value = false;
  }
}

function openImportModal() {
  previewResult.value = null;
  importForm.value.bankAccountId = bankAccounts.value[0]?.id || '';
  importModalOpen.value = true;
}

function addSampleRow() {
  importForm.value.rows.push({
    transactionDate: '2026-10-29',
    description: 'BIAYA ADMIN BANK BULANAN',
    referenceNo: `ADM-${Date.now().toString().slice(-4)}`,
    direction: 'DEBIT',
    amount: 25000,
  });
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
    matchedEntityType: line.matchedEntityType || 'Payment',
    matchedDocNumber: line.matchedDocNumber || 'KWT-2026-0003',
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
    feedbackMsg.value = `Sesi rekonsiliasi ${imp.importNumber} telah difinalisasi dan dikunci.`;
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
        <h1 class="page-title">Rekening Bank & Rekonsiliasi Mutasi</h1>
        <p class="page-desc">
          Impor mutasi bank dengan pratinjau wajib, deteksi transaksi ganda berbasis fingerprint SHA-256, saran pencocokan otomatis, dan penguncian finalisasi.
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
          + Pratinjau & Impor Mutasi Bank
        </button>
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

    <!-- Bank Accounts Summary -->
    <section class="metric-strip" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))">
      <div v-for="acc in bankAccounts" :key="acc.id" class="metric-box">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span class="doc-code">{{ acc.code }}</span>
          <span class="doc-code">COA {{ acc.glAccountCode }}</span>
        </div>
        <div style="margin-top: 6px"><strong>{{ acc.bankName }}</strong></div>
        <div class="metric-value money">{{ formatRupiah(acc.currentBalance) }}</div>
        <div class="metric-sub">No. Rek (Masked): {{ acc.accountNumberMasked }} | {{ acc.accountHolder }}</div>
      </div>
    </section>

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
            Cocok: <strong>{{ selectedImport.matchedCount }}</strong> |
            Belum Cocok / Review: <strong>{{ selectedImport.unmatchedCount }}</strong>
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
              <th>Uraian Mutasi Rekening</th>
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
              <td><span class="doc-code">{{ line.direction }}</span></td>
              <td class="money-col"><strong>{{ formatRupiah(line.amount) }}</strong></td>
              <td>
                <span v-if="line.matchedDocNumber" class="doc-code">
                  {{ line.matchedEntityType }}: {{ line.matchedDocNumber }}
                </span>
                <span v-else class="text-muted">Belum Dipetakan</span>
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
                <span v-else class="text-muted">Terkunci</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Preview & Import Statement -->
    <ModalDialog :open="importModalOpen" title="Pratinjau & Impor Mutasi Rekening Bank" @close="importModalOpen = false">
      <div style="display: flex; flex-direction: column; gap: 12px">
        <div class="form-grid">
          <div class="form-field">
            <label for="imp-bank" class="form-label">Rekening Bank</label>
            <select id="imp-bank" v-model="importForm.bankAccountId" class="select">
              <option v-for="b in bankAccounts" :key="b.id" :value="b.id">{{ b.code }} - {{ b.bankName }}</option>
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
            <strong>Baris Mutasi yang Akan Diuji ({{ importForm.rows.length }})</strong>
            <button type="button" class="btn btn-sm" @click="addSampleRow">+ Tambah Baris Mutasi</button>
          </div>

          <div v-for="(r, idx) in importForm.rows" :key="idx" class="panel" style="padding: 10px; margin-bottom: 8px; background: var(--bg-canvas)">
            <div class="form-grid">
              <div class="form-field">
                <label :for="`r-ref-${idx}`" class="form-label">No. Referensi</label>
                <input :id="`r-ref-${idx}`" v-model="r.referenceNo" type="text" class="input" />
              </div>
              <div class="form-field">
                <label :for="`r-dir-${idx}`" class="form-label">Kredit / Debit</label>
                <select :id="`r-dir-${idx}`" v-model="r.direction" class="select">
                  <option value="CREDIT">CREDIT (Uang Masuk)</option>
                  <option value="DEBIT">DEBIT (Uang Keluar)</option>
                </select>
              </div>
              <div class="form-field">
                <label :for="`r-amt-${idx}`" class="form-label">Nominal (IDR)</label>
                <input :id="`r-amt-${idx}`" v-model.number="r.amount" type="number" class="input" />
              </div>
            </div>
            <div class="form-field" style="margin-top: 6px">
              <label :for="`r-desc-${idx}`" class="form-label">Deskripsi Mutasi Bank</label>
              <input :id="`r-desc-${idx}`" v-model="r.description" type="text" class="input" />
            </div>
          </div>
        </div>

        <div class="btn-row">
          <button type="button" class="btn btn-sm" @click="runPreview">
            1. Jalankan Pratinjau & Deteksi Duplikat
          </button>
          <button
            v-if="previewResult"
            type="button"
            class="btn btn-sm btn-primary"
            @click="commitImport"
          >
            2. Commit Impor Mutasi Valid
          </button>
        </div>

        <div v-if="previewResult" class="panel" style="background: var(--bg-subtle)">
          <strong>Hasil Pratinjau Sebelum Commit:</strong>
          <p class="text-muted">
            Total Baris: {{ previewResult.summary.totalRows }} |
            Duplikat Terdeteksi: {{ previewResult.summary.duplicateCount }} |
            Saran Cocok Otomatis: {{ previewResult.summary.autoMatchedCount }}
          </p>
          <ul style="margin: 8px 0 0; padding-left: 18px; font-size: 0.84rem">
            <li v-for="row in previewResult.rows" :key="row.rowNumber">
              Baris #{{ row.rowNumber }} ({{ row.referenceNo }} - {{ formatRupiah(row.amount) }}):
              <strong>{{ row.isDuplicate ? 'DUPLIKAT (Akan Dilewati)' : row.matchStatus }}</strong>
              <span v-if="row.matchedDocNumber"> -> Cocok dengan {{ row.matchedDocNumber }}</span>
            </li>
          </ul>
        </div>
      </div>
    </ModalDialog>

    <!-- Modal: Match / Exception Line -->
    <ModalDialog :open="matchModalOpen" title="Konfirmasi Pencocokan / Tindak Lanjut Selisih Bank" @close="matchModalOpen = false">
      <form v-if="selectedLine" @submit.prevent="submitMatchLine" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Referensi Mutasi: <strong>{{ selectedLine.referenceNo }}</strong> ({{ formatRupiah(selectedLine.amount) }})
        </p>

        <div class="form-field">
          <label for="m-status" class="form-label">Keputusan Rekonsiliasi</label>
          <select id="m-status" v-model="matchForm.matchStatus" class="select">
            <option value="MATCHED">MATCHED (Cocok dengan Transaksi Internal)</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW (Perlu Pemeriksaan Lanjutan)</option>
            <option value="EXCEPTION">EXCEPTION (Selisih / Transaksi Khusus Ber-Catatan)</option>
          </select>
        </div>

        <div v-if="matchForm.matchStatus === 'MATCHED'" class="form-grid">
          <div class="form-field">
            <label for="m-type" class="form-label">Tipe Dokumen Internal</label>
            <select id="m-type" v-model="matchForm.matchedEntityType" class="select">
              <option value="Payment">Payment (Kuitansi Pelanggan)</option>
              <option value="CashDeposit">CashDeposit (Setoran Kasir)</option>
              <option value="Expense">Expense (Pengeluaran Biaya)</option>
            </select>
          </div>
          <div class="form-field">
            <label for="m-doc" class="form-label">Nomor Dokumen Internal</label>
            <input id="m-doc" v-model="matchForm.matchedDocNumber" type="text" class="input" required />
          </div>
        </div>

        <div class="form-field">
          <label for="m-note" class="form-label">Catatan Rekonsiliasi / Alasan Exception</label>
          <textarea
            id="m-note"
            v-model="matchForm.exceptionNote"
            class="textarea"
            placeholder="Wajib diisi bila memilih status EXCEPTION."
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
