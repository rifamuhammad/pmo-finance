<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch, downloadApiBlob } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PenerimaanPrintModal, { type PrintDocMode } from '../components/PenerimaanPrintModal.vue';

const auth = useAuthStore();
const router = useRouter();

type PembukuanTab = 'umum' | 'pajak';
const activeTab = ref<PembukuanTab>('umum');
const umumSubTab = ref<'bku' | 'jurnal'>('bku');
const pajakSubTab = ref<'perincian' | 'surat'>('perincian');

const loading = ref(true);
const exporting = ref(false);
const errorMsg = ref('');
const feedbackMsg = ref('');

function getLocalMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Global filters
const selectedUnitId = ref('');
const selectedBankCode = ref<'' | 'BNK-MDR-01' | 'BNK-MDR-02'>('');
const selectedMonth = ref(getLocalMonthIso());
const reconciledOnly = ref(false);
const searchQuery = ref('');

const businessUnits = ref<any[]>([]);
const recapData = ref<any>(null);

// Print modal for Surat Penarikan Pajak
const printOpen = ref(false);
const printMode = ref<PrintDocMode>('SURAT_PAJAK');
const printPayload = ref<any>(null);

// Bukti Potong / Tampungan / Refund Bank edit modal
const slipModalOpen = ref(false);
const selectedRowForSlip = ref<any>(null);
const slipForm = ref({
  withholdingSlipNo: '',
  taxAlreadyProcessed: false,
  depositDate: '',
  refundBankName: '',
  refundAccountNumber: '',
  refundAccountHolder: '',
  notes: '',
});

const UNIT_ORDER = ['BU-MICE', 'BU-KLINIK', 'BU-ITS', 'BU-TCI'];
const operationalUnits = computed(() =>
  businessUnits.value
    .filter((u) => UNIT_ORDER.includes(u.code))
    .sort((a, b) => UNIT_ORDER.indexOf(a.code) - UNIT_ORDER.indexOf(b.code))
);

const filteredRows = computed(() => {
  const rows = recapData.value?.rows || [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r: any) =>
    `${r.receiptNumber} ${r.invoiceDocNumber} ${r.payerName} ${r.activityTitle} ${r.rincianLabel} ${r.revenueAccountCode}`
      .toLowerCase()
      .includes(q)
  );
});

const bkuRowsWithRunning = computed(() => {
  let running = 0;
  return filteredRows.value.map((r: any) => {
    const taxUt =
      (r.utRemitPpn || 0) +
      (r.utRemitPph42 || 0) +
      (r.utRemitPph23Rate15 || 0) +
      (r.utRemitPph21 || 0) +
      (r.utRemitPb1 || 0);
    const netClean = r.bankReceivedAmount - taxUt - r.overpaymentAmount;
    running += netClean;
    return { ...r, taxUt, netClean, runningBalance: running };
  });
});

async function loadData() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams({
      month: selectedMonth.value,
      includeJournals: 'true',
    });
    if (selectedUnitId.value) params.set('businessUnitId', selectedUnitId.value);
    if (selectedBankCode.value) params.set('bankAccountCode', selectedBankCode.value);
    if (reconciledOnly.value) params.set('reconciledOnly', 'true');

    const [masterRes, recapRes] = await Promise.all([
      businessUnits.value.length === 0 ? apiFetch('/master/overview') : Promise.resolve(null),
      apiFetch(`/revenue/tax-recap?${params.toString()}`),
    ]);

    if (masterRes) {
      businessUnits.value = masterRes.data.businessUnits || [];
    }
    recapData.value = recapRes.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data Pembukuan Penerimaan.';
  } finally {
    loading.value = false;
  }
}

watch([selectedUnitId, selectedBankCode, selectedMonth, reconciledOnly], () => {
  loadData();
});

async function toggleTampungan(row: any) {
  errorMsg.value = '';
  try {
    await apiFetch(`/revenue/payments/${row.id}/tax-meta`, {
      method: 'PATCH',
      body: JSON.stringify({ taxAlreadyProcessed: !row.taxAlreadyProcessed }),
    });
    feedbackMsg.value = `Status Tampungan untuk ${row.receiptNumber} diperbarui.`;
    await loadData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memperbarui penanda tampungan.';
  }
}

function openSlipModal(row: any) {
  selectedRowForSlip.value = row;
  slipForm.value = {
    withholdingSlipNo: row.withholdingSlipNo || '',
    taxAlreadyProcessed: Boolean(row.taxAlreadyProcessed),
    depositDate: row.depositDate || '',
    refundBankName: row.refundBankName || '',
    refundAccountNumber: row.refundAccountNumber || '',
    refundAccountHolder: row.refundAccountHolder || '',
    notes: row.notes || '',
  };
  slipModalOpen.value = true;
}

async function submitSlipUpdate() {
  if (!selectedRowForSlip.value) return;
  errorMsg.value = '';
  try {
    await apiFetch(`/revenue/payments/${selectedRowForSlip.value.id}/tax-meta`, {
      method: 'PATCH',
      body: JSON.stringify(slipForm.value),
    });
    slipModalOpen.value = false;
    feedbackMsg.value = `Data bukti potong / pajak ${selectedRowForSlip.value.receiptNumber} diperbarui.`;
    await loadData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyimpan data bukti potong.';
  }
}

function openPrintSuratPajak() {
  if (!recapData.value?.withdrawal) return;
  printMode.value = 'SURAT_PAJAK';
  printPayload.value = recapData.value.withdrawal;
  printOpen.value = true;
}

async function exportMonthlyExcel() {
  exporting.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams({ month: selectedMonth.value });
    if (selectedUnitId.value) params.set('businessUnitId', selectedUnitId.value);
    if (selectedBankCode.value) params.set('bankAccountCode', selectedBankCode.value);
    if (reconciledOnly.value) params.set('reconciledOnly', 'true');
    const bankSuffix = selectedBankCode.value ? `-${selectedBankCode.value}` : '';
    await downloadApiBlob(
      `/revenue/tax-recap/export.xlsx?${params.toString()}`,
      `Pembukuan-BKU-Pajak-${selectedMonth.value}${bankSuffix}${reconciledOnly.value ? '-Reconciled' : ''}.xlsx`
    );
    feedbackMsg.value = `Workbook Pembukuan BKU & Pajak (${selectedMonth.value}) berhasil diunduh.`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengekspor Excel Pembukuan.';
  } finally {
    exporting.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="poital-penerimaan">
    <!-- Top Bar -->
    <div class="rev-top-bar">
      <div>
        <h1 class="rev-title">Pembukuan Penerimaan</h1>
      </div>

      <div class="rev-top-actions">
        <input
          v-model="selectedMonth"
          type="month"
          class="pill-month-input"
          aria-label="Pilih Bulan Pembukuan"
        />
        <button type="button" class="pill-btn-soft" @click="openPrintSuratPajak">
          Cetak Surat Pajak
        </button>
        <button type="button" class="pill-btn-navy" :disabled="exporting" @click="exportMonthlyExcel">
          {{ exporting ? 'Menyiapkan...' : 'Export Excel 5-Sheet (.xlsx)' }}
        </button>
      </div>
    </div>

    <!-- Filter Row: 4 Units + Reconciliation Gate Toggle -->
    <div class="unit-filter-bar">
      <div class="unit-filter-row" role="tablist" aria-label="Filter Unit Bisnis">
        <button type="button" class="unit-pill" :class="{ active: selectedUnitId === '' }" @click="selectedUnitId = ''">
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

      <div class="recon-toggle-group" role="group" aria-label="Filter Rekonsiliasi Bank">
        <button
          type="button"
          class="recon-pill"
          :class="{ active: !reconciledOnly }"
          @click="reconciledOnly = false"
        >
          Semua ({{ recapData?.summary?.allScopeCount || 0 }})
        </button>
        <button
          type="button"
          class="recon-pill"
          :class="{ active: reconciledOnly }"
          @click="reconciledOnly = true"
        >
          Rekon Bank ({{ recapData?.summary?.reconciledCount || 0 }})
        </button>
        <button type="button" class="unit-pill" @click="router.push('/reconciliation')">
          &larr; Rekonsiliasi
        </button>
      </div>
    </div>

    <AlertBanner v-if="feedbackMsg" variant="success" title="Berhasil" :message="feedbackMsg" @dismiss="feedbackMsg = ''" />
    <AlertBanner v-if="errorMsg" variant="danger" title="Perhatian" :message="errorMsg" @dismiss="errorMsg = ''" />

    <!-- Poital 4-Card KPI Row -->
    <section class="kpi-metric-row">
      <article class="metric-card hero-card">
        <span class="metric-title">Masuk Rekening ({{ recapData?.period?.label || selectedMonth }})</span>
        <strong class="metric-number-val money">{{ formatRupiah(recapData?.summary?.totalReceived || 0) }}</strong>
        <span class="trend-text">
          {{ reconciledOnly ? 'Khusus terekonsiliasi Bank Mandiri' : `${recapData?.summary?.totalTransactions || 0} transaksi tercatat` }}
        </span>
      </article>
      <article class="metric-card blue-card">
        <span class="metric-title">Saldo Bersih PMO (BKU Umum)</span>
        <strong class="metric-number-val money dark-num">{{ formatRupiah(recapData?.summary?.totalNetClean || 0) }}</strong>
        <span class="trend-text">Setelah pajak UT &amp; pengembalian</span>
      </article>
      <article class="metric-card amber-card">
        <span class="metric-title">Total Penarikan Pajak ke UT</span>
        <strong class="metric-number-val money dark-num">{{ formatRupiah(recapData?.summary?.totalTaxWithdrawal || 0) }}</strong>
        <span class="trend-text">PPN 12% · PPh 4(2) · PB1 10%</span>
      </article>
      <article class="metric-card white-card">
        <span class="metric-title">Lebih Bayar / Pengembalian</span>
        <strong class="metric-number-val money dark-num">{{ formatRupiah(recapData?.summary?.totalOverpaymentRefund || 0) }}</strong>
        <span class="trend-text">
          {{ recapData?.withdrawal?.excludedCount || 0 }} transaksi potong sendiri / tampungan
        </span>
      </article>
    </section>

    <!-- 2 Primary PIC Tabs: UMUM & PAJAK -->
    <div class="rev-tab-strip">
      <div class="tab-pills" role="tablist">
        <button type="button" class="tab-pill" :class="{ active: activeTab === 'umum' }" @click="activeTab = 'umum'">
          1. Pembukuan Umum (BKU &amp; Jurnal)
        </button>
        <button type="button" class="tab-pill" :class="{ active: activeTab === 'pajak' }" @click="activeTab = 'pajak'">
          2. Pembukuan Pajak (Perincian &amp; Surat Penarikan)
        </button>
      </div>

      <input
        v-model="searchQuery"
        type="search"
        class="pill-search-input"
        placeholder="Cari kwitansi, klien, COA..."
      />
    </div>

    <StateBanner v-if="loading" state="loading" title="Menyusun Pembukuan" message="Mengambil Buku Kas Umum, Jurnal Penerimaan, dan Perincian Pajak..." />

    <!-- ==================== TAB 1: PEMBUKUAN UMUM (BKU & JURNAL) ==================== -->
    <div v-else-if="activeTab === 'umum'" class="rev-stack">
      <div class="subtab-bar">
        <div class="tab-pills">
          <button type="button" class="tab-pill sm" :class="{ active: umumSubTab === 'bku' }" @click="umumSubTab = 'bku'">
            Buku Kas Umum (BKU) ({{ bkuRowsWithRunning.length }})
          </button>
          <button type="button" class="tab-pill sm" :class="{ active: umumSubTab === 'jurnal' }" @click="umumSubTab = 'jurnal'">
            Jurnal Buku Besar Penerimaan ({{ recapData?.journals?.length || 0 }})
          </button>
        </div>
      </div>

      <!-- 1A: Buku Kas Umum (BKU) -->
      <section v-if="umumSubTab === 'bku'" class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Buku Kas Umum (BKU) Penerimaan · {{ recapData?.period?.label }}</h2>
            <span class="card-sub">Mutasi penerimaan Bank Mandiri beserta potongan pajak UT dan saldo bersih berjalan PMO</span>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table compact">
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal &amp; Dokumen</th>
                <th>Uraian &amp; Unit</th>
                <th>Bank</th>
                <th class="col-num">Bruto Masuk</th>
                <th class="col-num">PPN 12%</th>
                <th class="col-num">PPh 4(2)</th>
                <th class="col-num">PB1 10%</th>
                <th class="col-num">PPh 23/21</th>
                <th class="col-num">Bersih PMO</th>
                <th class="col-num">Saldo Berjalan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="bkuRowsWithRunning.length === 0">
                <td colspan="11" class="empty-cell">
                  {{ reconciledOnly ? 'Belum ada transaksi yang terekonsiliasi Bank Mandiri pada periode ini.' : 'Belum ada data BKU pada periode ini.' }}
                </td>
              </tr>
              <tr v-for="r in bkuRowsWithRunning" :key="r.id">
                <td>{{ r.no }}</td>
                <td>
                  <div class="mono-code">{{ r.paymentDate }}</div>
                  <div class="cell-sub">{{ r.receiptNumber }}</div>
                </td>
                <td>
                  <strong>{{ r.activityTitle }}</strong>
                  <span class="unit-mini-tag">{{ r.businessUnitCode.replace('BU-', '') }}</span>
                  <div class="cell-sub">{{ r.payerName }} · COA {{ r.revenueAccountCode }}</div>
                </td>
                <td>
                  <span v-if="r.isReconciled" class="tag-pill ok">Cocok</span>
                  <span v-else class="tag-pill muted">Draft</span>
                </td>
                <td class="col-num money">{{ formatRupiah(r.bankReceivedAmount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.ppnAmount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.pph42Amount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.pb1Amount) }}</td>
                <td class="col-num money">{{ formatRupiah((r.pph23Amount || 0) + (r.pph23Rate15Amount || 0) + (r.pph21Amount || 0)) }}</td>
                <td class="col-num"><strong class="money text-pos">{{ formatRupiah(r.netClean) }}</strong></td>
                <td class="col-num"><strong class="money">{{ formatRupiah(r.runningBalance) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 1B: Jurnal Buku Besar Penerimaan -->
      <section v-else class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Jurnal Buku Besar Penerimaan · {{ recapData?.period?.label }}</h2>
            <span class="card-sub">Jurnal otomatis berimbang (Debet = Kredit) untuk seluruh penerbitan invoice, pembayaran, dan penerimaan langsung</span>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>No. Jurnal &amp; Tanggal</th>
                <th>Sumber &amp; Unit</th>
                <th>Rincian Akun (Pertor 310)</th>
                <th class="col-num">Total Debet</th>
                <th class="col-num">Total Kredit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!(recapData?.journals?.length)">
                <td colspan="5" class="empty-cell">Belum ada jurnal penerimaan pada periode ini.</td>
              </tr>
              <tr v-for="j in recapData?.journals || []" :key="j.id">
                <td>
                  <div class="mono-code">{{ j.journalNumber }}</div>
                  <div class="cell-sub">{{ formatDate(j.entryDate) }}</div>
                </td>
                <td>
                  <span class="tag-pill info">{{ j.sourceType }}</span>
                  <span class="unit-mini-tag">{{ j.businessUnitCode.replace('BU-', '') }}</span>
                  <div class="cell-sub">{{ j.sourceDocNumber || '-' }}</div>
                </td>
                <td>
                  <div style="font-weight: 600; margin-bottom: 4px;">{{ j.description }}</div>
                  <div v-for="(ln, idx) in j.lines" :key="idx" class="journal-line-mini">
                    <span class="mono-code">{{ ln.accountCode }}</span> {{ ln.accountName }}:
                    <span v-if="ln.debit > 0" class="text-pos">D {{ formatRupiah(ln.debit) }}</span>
                    <span v-if="ln.credit > 0" style="color: #1d4ed8;">K {{ formatRupiah(ln.credit) }}</span>
                  </div>
                </td>
                <td class="col-num money">{{ formatRupiah(j.totalDebit) }}</td>
                <td class="col-num money">{{ formatRupiah(j.totalCredit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ==================== TAB 2: PEMBUKUAN PAJAK (PERINCIAN & SURAT PENARIKAN) ==================== -->
    <div v-else class="rev-stack">
      <div class="subtab-bar">
        <div class="tab-pills">
          <button type="button" class="tab-pill sm" :class="{ active: pajakSubTab === 'perincian' }" @click="pajakSubTab = 'perincian'">
            Perincian Pajak ({{ filteredRows.length }})
          </button>
          <button type="button" class="tab-pill sm" :class="{ active: pajakSubTab === 'surat' }" @click="pajakSubTab = 'surat'">
            Surat Penarikan Pajak &amp; Pivot COA
          </button>
        </div>
      </div>

      <!-- 2A: Perincian Pajak -->
      <section v-if="pajakSubTab === 'perincian'" class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Perincian Pajak Penerimaan · {{ recapData?.period?.label }}</h2>
            <span class="card-sub">PB1 10% · PPN 12% (DPP 11/12) · PPh 4(2) 10% · PPh 23 2% · Kontrol Tampungan &amp; Bukti Potong</span>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table compact">
            <thead>
              <tr>
                <th>Tgl &amp; Dokumen</th>
                <th>Klien &amp; Rincian</th>
                <th>COA</th>
                <th>Bank</th>
                <th class="col-num">Masuk Bank</th>
                <th class="col-num">Nilai Jual / DPP</th>
                <th class="col-num">PPN 12%</th>
                <th class="col-num">PPh 4(2)</th>
                <th class="col-num">PPh 23</th>
                <th class="col-num">PB1 10%</th>
                <th class="col-num">Ditarik UT</th>
                <th>Kontrol</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredRows.length === 0">
                <td colspan="12" class="empty-cell">Belum ada data pajak pada filter ini.</td>
              </tr>
              <tr v-for="r in filteredRows" :key="r.id">
                <td>
                  <div class="mono-code">{{ r.paymentDate }}</div>
                  <div class="cell-sub">{{ r.invoiceDocNumber || r.receiptNumber }}</div>
                </td>
                <td>
                  <strong>{{ r.payerName }}</strong>
                  <div class="cell-sub">{{ r.rincianLabel }} · FP {{ r.fakturPajakCode }}</div>
                  <div v-if="r.withholdingSlipNo" class="cell-sub">Bupot: {{ r.withholdingSlipNo }}</div>
                </td>
                <td class="mono-code">{{ r.revenueAccountCode }}</td>
                <td>
                  <span v-if="r.isReconciled" class="tag-pill ok">Cocok</span>
                  <span v-else class="tag-pill muted">Draft</span>
                </td>
                <td class="col-num money">{{ formatRupiah(r.bankReceivedAmount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.dppPb1 > 0 ? r.dppPb1 : r.nilaiJual) }}</td>
                <td class="col-num money">{{ formatRupiah(r.ppnAmount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.pph42Amount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.pph23Amount) }}</td>
                <td class="col-num money">{{ formatRupiah(r.pb1Amount) }}</td>
                <td class="col-num"><strong class="money">{{ formatRupiah(r.utRemitPpn + r.utRemitPph42 + r.utRemitPb1) }}</strong></td>
                <td>
                  <div class="inline-actions">
                    <button
                      v-if="auth.hasPermission('payment:create')"
                      type="button"
                      class="mini-action-btn"
                      :class="{ soft: !r.taxAlreadyProcessed, warn: r.taxAlreadyProcessed }"
                      @click="toggleTampungan(r)"
                    >
                      {{ r.taxAlreadyProcessed ? 'Tampungan ✓' : 'Tampungan' }}
                    </button>
                    <button
                      v-if="auth.hasPermission('payment:create')"
                      type="button"
                      class="mini-action-btn soft"
                      @click="openSlipModal(r)"
                    >
                      Bupot
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 2B: Surat Penarikan Pajak & Pivot COA -->
      <div v-else class="split-2-grid">
        <section class="poital-card">
          <div class="card-head-row">
            <div>
              <h2 class="card-title">Surat Penarikan Pajak ({{ recapData?.withdrawal?.bankFilterLabel || 'Bank Mandiri' }})</h2>
              <span class="card-sub">
                {{ recapData?.withdrawal?.periodLabel }} · Sumber {{ recapData?.withdrawal?.sourceBankAccountNo || '164-00-2022-999-5' }} &rarr; Tujuan {{ recapData?.withdrawal?.targetTaxBankLabel || 'Bank BRI' }} {{ recapData?.withdrawal?.targetTaxAccountNo || '1173.01.000574.30.4' }}
              </span>
            </div>
            <button type="button" class="mini-action-btn navy" @click="openPrintSuratPajak">Pratinjau / Cetak Surat</button>
          </div>

          <div class="table-wrap">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Komponen Pajak</th>
                  <th class="col-num">Pengembalian</th>
                  <th v-for="coa in recapData?.withdrawal?.coaColumns || []" :key="coa" class="col-num">{{ coa }}</th>
                  <th class="col-num">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="wr in recapData?.withdrawal?.rows || []" :key="wr.label">
                  <td>{{ wr.label }}</td>
                  <td class="col-num money">{{ wr.refundAmount > 0 ? formatRupiah(wr.refundAmount) : '-' }}</td>
                  <td v-for="coa in recapData?.withdrawal?.coaColumns || []" :key="coa" class="col-num money">
                    {{ formatRupiah(wr.byCoa[coa] || 0) }}
                  </td>
                  <td class="col-num"><strong class="money">{{ formatRupiah(wr.total) }}</strong></td>
                </tr>
                <tr class="summary-row">
                  <td><strong>Total Penarikan Pajak</strong></td>
                  <td class="col-num"><strong class="money">{{ formatRupiah(recapData?.withdrawal?.totalOverpaymentRefund || 0) }}</strong></td>
                  <td v-for="coa in recapData?.withdrawal?.coaColumns || []" :key="coa"></td>
                  <td class="col-num"><strong class="money">{{ formatRupiah(recapData?.withdrawal?.totalTaxWithdrawal || 0) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="(recapData?.withdrawal?.overpaymentItems?.length || 0) > 0" class="overpay-note">
            <strong>Pengembalian Dana (Lebih Bayar): {{ formatRupiah(recapData.withdrawal.totalOverpaymentRefund) }}</strong>
            <div v-for="ov in recapData.withdrawal.overpaymentItems" :key="ov.receiptNumber" class="cell-sub">
              {{ ov.receiptNumber }} · {{ ov.payerName }} ({{ ov.activityTitle }}) · {{ formatRupiah(ov.amount) }}
              <template v-if="ov.refundAccountNumber">
                · Rek: {{ ov.refundBankName || 'Bank' }} {{ ov.refundAccountNumber }} a.n. {{ ov.refundAccountHolder || ov.payerName }}
              </template>
            </div>
          </div>
        </section>

        <section class="poital-card">
          <h2 class="card-title" style="margin-bottom: 12px;">Pivot Pajak per Akun COA</h2>
          <div class="table-wrap">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>COA</th>
                  <th>Uraian Akun</th>
                  <th class="col-num">Trx</th>
                  <th class="col-num">Masuk Bank</th>
                  <th class="col-num">Pajak UT</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!(recapData?.pivotByCoa?.length)">
                  <td colspan="5" class="empty-cell">Belum ada data pivot COA.</td>
                </tr>
                <tr v-for="p in recapData?.pivotByCoa || []" :key="p.coa">
                  <td class="mono-code">{{ p.coa }}</td>
                  <td>{{ p.coaName }}</td>
                  <td class="col-num">{{ p.count }}</td>
                  <td class="col-num money">{{ formatRupiah(p.totalReceived) }}</td>
                  <td class="col-num money">{{ formatRupiah(p.totalTaxUt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- Modal: Update Bukti Potong, Tampungan, Rekening Refund & Catatan Pajak -->
    <ModalDialog :open="slipModalOpen" title="Perbarui Bukti Potong, Tampungan & Catatan Pajak" @close="slipModalOpen = false">
      <form class="modal-form" @submit.prevent="submitSlipUpdate">
        <div class="form-field">
          <label class="form-label" for="slip-no">Nomor Bukti Potong (PPh / SSP)</label>
          <input id="slip-no" v-model="slipForm.withholdingSlipNo" type="text" class="input" placeholder="Contoh: BP-2026-00912" />
        </div>
        <div class="form-field">
          <label class="form-label" for="slip-dep">Tanggal Setor / Efektif Bank</label>
          <input id="slip-dep" v-model="slipForm.depositDate" type="date" class="input" />
        </div>
        <div class="form-field">
          <label class="form-label" for="slip-ref-bank">Rekening Pengembalian Dana Klien (Jika Lebih Bayar / Refund Pajak)</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <input id="slip-ref-bank" v-model="slipForm.refundBankName" type="text" class="input" placeholder="Nama Bank (cth: Bank BRI)" />
            <input v-model="slipForm.refundAccountNumber" type="text" class="input" placeholder="No. Rekening Tujuan" />
          </div>
          <input v-model="slipForm.refundAccountHolder" type="text" class="input" style="margin-top: 6px;" placeholder="Atas Nama Rekening Penerima" />
        </div>
        <div class="form-field">
          <label class="form-label" for="slip-notes">Catatan Pajak</label>
          <input id="slip-notes" v-model="slipForm.notes" type="text" class="input" placeholder="Catatan audit / keterangan pajak tambahan..." />
        </div>
        <label class="check-row">
          <input v-model="slipForm.taxAlreadyProcessed" type="checkbox" />
          <span>Sudah diolah di Rekening Tampungan / dikecualikan dari penarikan pajak bulan ini</span>
        </label>
        <div class="modal-footer">
          <button type="button" class="pill-btn-soft" @click="slipModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy">Simpan Perubahan</button>
        </div>
      </form>
    </ModalDialog>

    <PenerimaanPrintModal :open="printOpen" :mode="printMode" :data="printPayload" @close="printOpen = false" />
  </div>
</template>

<style scoped>
.poital-penerimaan {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rev-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.rev-title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #0b2144;
  letter-spacing: -0.02em;
}

.rev-top-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pill-month-input,
.pill-search-input {
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.85rem;
  font-weight: 500;
}

.pill-search-input {
  min-width: 240px;
}

.pill-btn-navy,
.pill-btn-soft {
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.pill-btn-navy {
  background: #0b2144;
  color: #ffffff;
}

.pill-btn-navy:hover {
  background: #133163;
}

.pill-btn-soft {
  background: #ffffff;
  color: #0b2144;
  border-color: #cbd5e1;
}

.pill-btn-soft:hover {
  background: #f8fafc;
}

.unit-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.unit-filter-row,
.recon-toggle-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.unit-pill,
.recon-pill {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.unit-pill.active {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.recon-pill.active {
  background: #eff6ff;
  border-color: #2563eb;
  color: #1d4ed8;
}

.kpi-metric-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
}

.hero-card {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.blue-card {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.amber-card {
  background: #fef9ed;
  border-color: #fde68a;
}

.white-card {
  background: #ffffff;
}

.metric-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}

.hero-card .metric-title,
.hero-card .trend-text {
  color: #cbd5e1;
}

.metric-number-val {
  font-size: clamp(1rem, 1.55vw, 1.4rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.dark-num {
  color: #0b2144;
}

.trend-text {
  font-size: 0.76rem;
  color: #64748b;
}

.rev-tab-strip,
.subtab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.tab-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 999px;
}

.tab-pill {
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #475569;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.tab-pill.sm {
  padding: 6px 14px;
  font-size: 0.8rem;
}

.tab-pill.active {
  background: #ffffff;
  color: #0b2144;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

.rev-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.split-2-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.poital-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 20px;
}

.card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.card-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: #0b2144;
}

.card-sub {
  font-size: 0.8rem;
  color: #64748b;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.clean-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.clean-table.compact {
  font-size: 0.79rem;
}

.clean-table th {
  text-align: left;
  padding: 10px 10px;
  color: #64748b;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.clean-table td {
  padding: 11px 10px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}

.col-num {
  text-align: right !important;
  white-space: nowrap;
}

.empty-cell {
  text-align: center;
  padding: 28px !important;
  color: #64748b;
}

.mono-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  font-weight: 600;
  color: #1e293b;
}

.cell-sub {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}

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
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}

.tag-pill.ok {
  background: #dcfce7;
  color: #166534;
}

.tag-pill.info {
  background: #eff6ff;
  color: #1d4ed8;
}

.tag-pill.muted {
  background: #f1f5f9;
  color: #64748b;
}

.text-pos {
  color: #059669;
}

.inline-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.mini-action-btn {
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0b2144;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.mini-action-btn.navy {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.mini-action-btn.soft {
  background: #f8fafc;
}

.mini-action-btn.warn {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}

.summary-row td {
  background: #f8fafc;
  border-top: 2px solid #cbd5e1;
}

.overpay-note {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fef9ed;
  border: 1px solid #fde68a;
  font-size: 0.82rem;
  color: #78350f;
}

.journal-line-mini {
  font-size: 0.75rem;
  color: #475569;
  margin-top: 2px;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: #334155;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

@media (max-width: 1120px) {
  .kpi-metric-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .split-2-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .kpi-metric-row {
    grid-template-columns: 1fr;
  }
  .pill-search-input {
    width: 100%;
    min-width: 0;
  }
}
</style>
