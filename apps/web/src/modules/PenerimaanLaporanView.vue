<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, downloadApiBlob } from '../services/api';
import { formatRupiah } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import AlertBanner from '../components/AlertBanner.vue';

const route = useRoute();

type LaporanTab = 'realisasi' | 'aging';
const activeTab = ref<LaporanTab>('realisasi');

function applySectionFromQuery() {
  const qSec = typeof route.query.section === 'string' ? route.query.section : '';
  if (qSec === 'realisasi' || qSec === 'aging') {
    activeTab.value = qSec;
  }
}

watch(() => route.query.section, applySectionFromQuery);

const pageTitle = computed(() =>
  activeTab.value === 'aging'
    ? 'Aging Piutang Penerimaan'
    : 'Realisasi RAB Penerimaan'
);

const pageSubtitle = computed(() =>
  activeTab.value === 'aging'
    ? 'Monitoring umur piutang faktur klien yang belum lunas (0-30, 31-60, 61-90, dan > 90 hari)'
    : 'Capaian realisasi penerimaan 4 unit bisnis (MICE, Klinik, ITS, TCI) terhadap target RAB dan pivot akun COA resmi'
);

const loading = ref(true);
const exportingMonthly = ref(false);
const exportingAging = ref(false);
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
const selectedAgingBucket = ref<'' | 'current' | 'days31to60' | 'days61to90' | 'over90'>('');
const agingSearch = ref('');

const businessUnits = ref<any[]>([]);
const recapData = ref<any>(null);
const agingData = ref<any>(null);

const UNIT_ORDER = ['BU-MICE', 'BU-KLINIK', 'BU-ITS', 'BU-TCI'];
const operationalUnits = computed(() =>
  businessUnits.value
    .filter((u) => UNIT_ORDER.includes(u.code))
    .sort((a, b) => UNIT_ORDER.indexOf(a.code) - UNIT_ORDER.indexOf(b.code))
);

const filteredAgingInvoices = computed(() => {
  const list = agingData.value?.invoices || [];
  const q = agingSearch.value.trim().toLowerCase();
  return list.filter((inv: any) => {
    if (selectedAgingBucket.value && inv.bucketKey !== selectedAgingBucket.value) return false;
    if (!q) return true;
    return `${inv.docNumber} ${inv.customerName} ${inv.activityTitle} ${inv.businessUnitCode}`.toLowerCase().includes(q);
  });
});

function agingBucketLabel(bucket: string) {
  if (bucket === 'current') return '0 - 30 Hari';
  if (bucket === 'days31to60') return '31 - 60 Hari';
  if (bucket === 'days61to90') return '61 - 90 Hari';
  if (bucket === 'over90') return '> 90 Hari';
  return 'Semua';
}

function toggleAgingBucket(bucket: '' | 'current' | 'days31to60' | 'days61to90' | 'over90') {
  selectedAgingBucket.value = selectedAgingBucket.value === bucket ? '' : bucket;
}

async function loadData() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const monthlyParams = new URLSearchParams({ month: selectedMonth.value });
    if (selectedUnitId.value) monthlyParams.set('businessUnitId', selectedUnitId.value);
    if (selectedBankCode.value) monthlyParams.set('bankAccountCode', selectedBankCode.value);
    if (reconciledOnly.value) monthlyParams.set('reconciledOnly', 'true');

    const agingQs = selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';

    const [masterRes, recapRes, agingRes] = await Promise.all([
      businessUnits.value.length === 0 ? apiFetch('/master/overview') : Promise.resolve(null),
      apiFetch(`/revenue/tax-recap?${monthlyParams.toString()}`),
      apiFetch(`/revenue/aging${agingQs}`),
    ]);

    if (masterRes) {
      businessUnits.value = masterRes.data.businessUnits || [];
    }
    recapData.value = recapRes.data;
    agingData.value = agingRes.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat Laporan Penerimaan.';
  } finally {
    loading.value = false;
  }
}

watch([selectedUnitId, selectedBankCode, selectedMonth, reconciledOnly], () => {
  loadData();
});

async function exportMonthlyExcel() {
  exportingMonthly.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams({ month: selectedMonth.value });
    if (selectedUnitId.value) params.set('businessUnitId', selectedUnitId.value);
    if (selectedBankCode.value) params.set('bankAccountCode', selectedBankCode.value);
    if (reconciledOnly.value) params.set('reconciledOnly', 'true');
    const bankSuffix = selectedBankCode.value ? `-${selectedBankCode.value}` : '';
    await downloadApiBlob(
      `/revenue/tax-recap/export.xlsx?${params.toString()}`,
      `Laporan-Penerimaan-${selectedMonth.value}${bankSuffix}.xlsx`
    );
    feedbackMsg.value = `Laporan Penerimaan (${selectedMonth.value}) berhasil diunduh.`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengekspor Excel Laporan Penerimaan.';
  } finally {
    exportingMonthly.value = false;
  }
}

async function exportAgingExcel() {
  exportingAging.value = true;
  errorMsg.value = '';
  try {
    const qs = selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    const asOf = agingData.value?.asOfDate || new Date().toISOString().slice(0, 10);
    await downloadApiBlob(`/revenue/aging/export.xlsx${qs}`, `Aging-Penerimaan-${asOf}.xlsx`);
    feedbackMsg.value = `Laporan Aging Penerimaan (${asOf}) berhasil diunduh.`;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengekspor Excel Aging Penerimaan.';
  } finally {
    exportingAging.value = false;
  }
}

onMounted(() => {
  applySectionFromQuery();
  loadData();
});
</script>

<template>
  <div class="poital-penerimaan">
    <!-- Header -->
    <div class="rev-top-bar">
      <div>
        <h1 class="rev-title">{{ pageTitle }}</h1>
        <p class="rev-subtitle">{{ pageSubtitle }}</p>
      </div>
      <div class="rev-top-actions">
        <input
          v-model="selectedMonth"
          type="month"
          class="pill-month-input"
          aria-label="Pilih Bulan Laporan"
        />
        <button
          v-if="activeTab === 'aging'"
          type="button"
          class="pill-btn-navy"
          :disabled="exportingAging"
          @click="exportAgingExcel"
        >
          {{ exportingAging ? 'Menyiapkan...' : 'Export Aging .xlsx' }}
        </button>
        <button
          v-else
          type="button"
          class="pill-btn-navy"
          :disabled="exportingMonthly"
          @click="exportMonthlyExcel"
        >
          {{ exportingMonthly ? 'Menyiapkan...' : 'Export Penerimaan .xlsx' }}
        </button>
      </div>
    </div>

    <!-- Filter Row -->
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

      <div class="recon-toggle-group">
        <button type="button" class="recon-pill" :class="{ active: !reconciledOnly }" @click="reconciledOnly = false">
          Semua ({{ recapData?.summary?.allScopeCount || 0 }})
        </button>
        <button type="button" class="recon-pill" :class="{ active: reconciledOnly }" @click="reconciledOnly = true">
          Rekon Bank ({{ recapData?.summary?.reconciledCount || 0 }})
        </button>
      </div>
    </div>

    <AlertBanner v-if="feedbackMsg" variant="success" title="Berhasil" :message="feedbackMsg" @dismiss="feedbackMsg = ''" />
    <AlertBanner v-if="errorMsg" variant="danger" title="Perhatian" :message="errorMsg" @dismiss="errorMsg = ''" />

    <!-- DropX Luminous 4-Card Gradient KPI Row -->
    <section class="kpi-metric-row">
      <article class="dropx-kpi-card kpi-grad-navy">
        <div class="kpi-top-row">
          <span class="kpi-label">Realisasi Penerimaan ({{ recapData?.period?.label || selectedMonth }})</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </span>
        </div>
        <strong class="kpi-value money">{{ formatRupiah(recapData?.summary?.totalReceived || 0) }}</strong>
        <span class="kpi-foot">{{ recapData?.summary?.totalTransactions || 0 }} transaksi masuk Bank Mandiri</span>
      </article>

      <article class="dropx-kpi-card kpi-grad-emerald">
        <div class="kpi-top-row">
          <span class="kpi-label">Pendapatan Bersih PMO</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </span>
        </div>
        <strong class="kpi-value money">{{ formatRupiah(recapData?.summary?.totalNetClean || 0) }}</strong>
        <span class="kpi-foot">Neto setelah pajak UT &amp; lebih bayar</span>
      </article>

      <article class="dropx-kpi-card kpi-grad-amber">
        <div class="kpi-top-row">
          <span class="kpi-label">Total Piutang Terbuka (Aging)</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
        </div>
        <strong class="kpi-value money">{{ formatRupiah(agingData?.buckets?.totalOutstanding || 0) }}</strong>
        <span class="kpi-foot">{{ agingData?.buckets?.openCount || 0 }} faktur belum lunas</span>
      </article>

      <article class="dropx-kpi-card kpi-grad-ocean">
        <div class="kpi-top-row">
          <span class="kpi-label">Tingkat Rekonsiliasi Bank</span>
          <span class="kpi-icon-box" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M6 10v11"/><path d="M18 10v11"/></svg>
          </span>
        </div>
        <strong class="kpi-value">
          {{ recapData?.summary?.reconciledCount || 0 }} / {{ recapData?.summary?.allScopeCount || 0 }}
        </strong>
        <span class="kpi-foot">
          Terverifikasi {{ formatRupiah(recapData?.summary?.reconciledAmount || 0) }}
        </span>
      </article>
    </section>

    <StateBanner v-if="loading" state="loading" title="Menyusun Laporan Penerimaan" message="Mengagregasi realisasi 4 unit bisnis, Pivot COA, dan Aging Piutang..." />

    <!-- ==================== TAB 1: REALISASI 4 UNIT & PIVOT COA ==================== -->
    <div v-else-if="activeTab === 'realisasi'" class="rev-stack">
      <section class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Realisasi vs Target RAB Pendapatan per Unit · {{ recapData?.period?.label }}</h2>
            <span class="card-sub">Perbandingan penerimaan 4 unit bisnis terhadap Target RAB Pendapatan Resmi (non-valuasi internal)</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Unit Bisnis</th>
                <th class="col-num">Trx / Rekon</th>
                <th class="col-num">Target RAB / Bulan</th>
                <th class="col-num">Realisasi Masuk</th>
                <th class="col-num">Pajak UT</th>
                <th class="col-num">Bersih PMO</th>
                <th class="col-num">Capaian Bln</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!(recapData?.byUnit?.length)">
                <td colspan="7" class="empty-cell">Belum ada realisasi penerimaan pada filter ini.</td>
              </tr>
              <tr v-for="u in recapData?.byUnit || []" :key="u.unitCode">
                <td>
                  <strong>{{ u.unitName }}</strong>
                  <span class="unit-mini-tag">{{ u.unitCode.replace('BU-', '') }}</span>
                  <div class="cell-sub" v-if="u.targetRabAnnual > 0">Target Tahunan: {{ formatRupiah(u.targetRabAnnual) }}</div>
                </td>
                <td class="col-num">{{ u.count }} <span class="cell-sub">({{ u.reconciledCount }} rekon)</span></td>
                <td class="col-num money">{{ formatRupiah(u.targetRabMonthly || 0) }}</td>
                <td class="col-num"><strong class="money">{{ formatRupiah(u.totalReceived) }}</strong></td>
                <td class="col-num money">{{ formatRupiah(u.totalTaxUt) }}</td>
                <td class="col-num"><strong class="money text-pos">{{ formatRupiah(u.netClean) }}</strong></td>
                <td class="col-num">
                  <span class="tag-pill" :class="(u.realizationPercentMonthly || 0) >= 80 ? 'ok' : (u.realizationPercentMonthly || 0) > 0 ? 'info' : 'muted'">
                    {{ (u.realizationPercentMonthly || 0).toFixed(1) }}%
                  </span>
                </td>
              </tr>
              <tr v-if="recapData?.byUnit?.length > 1" style="background: #fafafa; font-weight: 600;">
                <td>TOTAL 4 UNIT OPERASIONAL</td>
                <td class="col-num">{{ recapData?.summary?.totalTransactions || 0 }}</td>
                <td class="col-num money">{{ formatRupiah(recapData?.summary?.totalRabMonthlyTarget || 0) }}</td>
                <td class="col-num money">{{ formatRupiah(recapData?.summary?.totalReceived || 0) }}</td>
                <td class="col-num money">{{ formatRupiah(recapData?.summary?.totalTaxWithdrawal || 0) }}</td>
                <td class="col-num money text-pos">{{ formatRupiah(recapData?.summary?.totalNetClean || 0) }}</td>
                <td class="col-num">
                  <span class="tag-pill info">
                    {{
                      (recapData?.summary?.totalRabMonthlyTarget || 0) > 0
                        ? (((recapData?.summary?.totalReceived || 0) / recapData.summary.totalRabMonthlyTarget) * 100).toFixed(1)
                        : '0.0'
                    }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">Pivot Penerimaan per Akun COA (Pertor 310)</h2>
            <span class="card-sub">Akumulasi penerimaan dan pajak per kode akun pendapatan</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Kode COA</th>
                <th>Nama Akun Pendapatan</th>
                <th class="col-num">Transaksi</th>
                <th class="col-num">Bruto Dokumen</th>
                <th class="col-num">Masuk Rekening</th>
                <th class="col-num">Pajak Disetor UT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!(recapData?.pivotByCoa?.length)">
                <td colspan="6" class="empty-cell">Belum ada data COA pada periode ini.</td>
              </tr>
              <tr v-for="p in recapData?.pivotByCoa || []" :key="p.coa">
                <td class="mono-code">{{ p.coa }}</td>
                <td><strong>{{ p.coaName }}</strong></td>
                <td class="col-num">{{ p.count }}</td>
                <td class="col-num money">{{ formatRupiah(p.totalBruto) }}</td>
                <td class="col-num"><strong class="money">{{ formatRupiah(p.totalReceived) }}</strong></td>
                <td class="col-num money">{{ formatRupiah(p.totalTaxUt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ==================== TAB 2: AGING PENERIMAAN (UMUR PIUTANG) ==================== -->
    <div v-else class="rev-stack">
      <section class="aging-kpi-grid">
        <button
          type="button"
          class="aging-kpi-card aging-kpi-navy"
          :class="{ 'is-selected': selectedAgingBucket === '' }"
          @click="toggleAgingBucket('')"
        >
          <span class="aging-kpi-label">Total Piutang Terbuka</span>
          <strong class="aging-kpi-value money">{{ formatRupiah(agingData?.buckets?.totalOutstanding || 0) }}</strong>
          <span class="aging-kpi-meta">{{ agingData?.buckets?.openCount || 0 }} faktur per {{ agingData?.asOfDate || '-' }}</span>
        </button>

        <button
          type="button"
          class="aging-kpi-card aging-kpi-blue"
          :class="{ 'is-selected': selectedAgingBucket === 'current' }"
          @click="toggleAgingBucket('current')"
        >
          <span class="aging-kpi-label">0 - 30 Hari</span>
          <strong class="aging-kpi-value money">{{ formatRupiah(agingData?.buckets?.current || 0) }}</strong>
          <span class="aging-kpi-meta">Lancar / baru jatuh tempo</span>
        </button>

        <button
          type="button"
          class="aging-kpi-card aging-kpi-amber"
          :class="{ 'is-selected': selectedAgingBucket === 'days31to60' }"
          @click="toggleAgingBucket('days31to60')"
        >
          <span class="aging-kpi-label">31 - 60 Hari</span>
          <strong class="aging-kpi-value money">{{ formatRupiah(agingData?.buckets?.days31to60 || 0) }}</strong>
          <span class="aging-kpi-meta">Perlu penagihan ulang</span>
        </button>

        <button
          type="button"
          class="aging-kpi-card aging-kpi-orange"
          :class="{ 'is-selected': selectedAgingBucket === 'days61to90' }"
          @click="toggleAgingBucket('days61to90')"
        >
          <span class="aging-kpi-label">61 - 90 Hari</span>
          <strong class="aging-kpi-value money">{{ formatRupiah(agingData?.buckets?.days61to90 || 0) }}</strong>
          <span class="aging-kpi-meta">Tunggakan menengah</span>
        </button>

        <button
          type="button"
          class="aging-kpi-card aging-kpi-red"
          :class="{ 'is-selected': selectedAgingBucket === 'over90' }"
          @click="toggleAgingBucket('over90')"
        >
          <span class="aging-kpi-label">&gt; 90 Hari</span>
          <strong class="aging-kpi-value money">{{ formatRupiah(agingData?.buckets?.over90 || 0) }}</strong>
          <span class="aging-kpi-meta">Prioritas eskalasi</span>
        </button>
      </section>

      <div class="split-2-grid">
        <section class="poital-card">
          <h2 class="card-title" style="margin-bottom: 12px;">Aging per Unit Bisnis</h2>
          <div class="table-wrap">
            <table class="clean-table compact">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th class="col-num">Faktur</th>
                  <th class="col-num">0-30h</th>
                  <th class="col-num">31-60h</th>
                  <th class="col-num">61-90h</th>
                  <th class="col-num">&gt;90h</th>
                  <th class="col-num">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!(agingData?.byUnit?.length)">
                  <td colspan="7" class="empty-cell">Tidak ada piutang terbuka.</td>
                </tr>
                <tr v-for="u in agingData?.byUnit || []" :key="u.unitId">
                  <td><strong>{{ u.unitCode.replace('BU-', '') }}</strong></td>
                  <td class="col-num">{{ u.count }}</td>
                  <td class="col-num money">{{ formatRupiah(u.current) }}</td>
                  <td class="col-num money">{{ formatRupiah(u.days31to60) }}</td>
                  <td class="col-num money">{{ formatRupiah(u.days61to90) }}</td>
                  <td class="col-num money">{{ formatRupiah(u.over90) }}</td>
                  <td class="col-num"><strong class="money">{{ formatRupiah(u.total) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="poital-card">
          <h2 class="card-title" style="margin-bottom: 12px;">Aging per Pelanggan / Instansi</h2>
          <div class="table-wrap">
            <table class="clean-table compact">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th class="col-num">Faktur</th>
                  <th class="col-num">0-30h</th>
                  <th class="col-num">31-60h</th>
                  <th class="col-num">&gt;60h</th>
                  <th class="col-num">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!(agingData?.byCustomer?.length)">
                  <td colspan="6" class="empty-cell">Seluruh tagihan pelanggan lunas.</td>
                </tr>
                <tr v-for="c in agingData?.byCustomer || []" :key="c.customerId">
                  <td>
                    <strong>{{ c.customerName }}</strong>
                    <div class="cell-sub">{{ c.organizationType }}</div>
                  </td>
                  <td class="col-num">{{ c.count }}</td>
                  <td class="col-num money">{{ formatRupiah(c.current) }}</td>
                  <td class="col-num money">{{ formatRupiah(c.days31to60) }}</td>
                  <td class="col-num money">{{ formatRupiah(c.days61to90 + c.over90) }}</td>
                  <td class="col-num"><strong class="money">{{ formatRupiah(c.total) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="poital-card">
        <div class="card-head-row">
          <div>
            <h2 class="card-title">
              Rincian Faktur Piutang Terbuka
              <span v-if="selectedAgingBucket" class="unit-mini-tag">{{ agingBucketLabel(selectedAgingBucket) }}</span>
            </h2>
            <span class="card-sub">Daftar faktur terbuka yang menunggu pelunasan masuk ke Bank Mandiri Penerimaan</span>
          </div>
          <div class="rev-top-actions">
            <input
              v-model="agingSearch"
              type="search"
              class="pill-search-input"
              placeholder="Cari invoice, instansi, kegiatan..."
            />
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>No. Invoice</th>
                <th>Unit</th>
                <th>Pelanggan &amp; Kegiatan</th>
                <th>Jatuh Tempo</th>
                <th class="col-num">Umur</th>
                <th>Status</th>
                <th class="col-num">Sisa Piutang</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredAgingInvoices.length === 0">
                <td colspan="7" class="empty-cell">Tidak ada faktur terbuka pada filter ini.</td>
              </tr>
              <tr v-for="inv in filteredAgingInvoices" :key="inv.id">
                <td>
                  <div class="mono-code">{{ inv.docNumber }}</div>
                  <div class="cell-sub">{{ inv.invoiceType }}</div>
                </td>
                <td><span class="unit-mini-tag">{{ inv.businessUnitCode.replace('BU-', '') }}</span></td>
                <td>
                  <strong>{{ inv.customerName }}</strong>
                  <div class="cell-sub">{{ inv.activityTitle }}</div>
                </td>
                <td>
                  <div>{{ inv.dueDate }}</div>
                  <div class="cell-sub">Terbit: {{ inv.issueDate }}</div>
                </td>
                <td class="col-num">
                  <span class="aging-day-pill" :class="`bucket-${inv.bucketKey}`">
                    {{ inv.daysOverdue > 0 ? `+${inv.daysOverdue} hr` : `${inv.daysOverdue} hr` }}
                  </span>
                </td>
                <td><StatusBadge :status="inv.status" /></td>
                <td class="col-num"><strong class="money">{{ formatRupiah(inv.balanceDue) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
  flex-wrap: wrap;
  gap: 16px;
}

.rev-top-bar > div:first-child {
  flex: 1;
  min-width: 240px;
}

.rev-title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  color: #111827;
  letter-spacing: -0.025em;
}

.rev-subtitle {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.45;
  max-width: 560px;
}

.rev-top-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.pill-month-input,
.pill-search-input {
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  font-weight: 400;
  outline: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.pill-month-input:focus,
.pill-search-input:focus {
  border-color: #034693;
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.2);
}

.pill-search-input {
  min-width: 240px;
}

.pill-btn-navy,
.pill-btn-soft {
  height: 36px;
  padding: 0 15px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease;
}

.pill-btn-navy {
  background: #034693;
  border-color: #034693;
  color: #ffffff;
}
.pill-btn-navy:hover:not(:disabled) {
  background: #023470;
}

.pill-btn-soft {
  background: #ffffff;
  color: #111827;
  border-color: #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.pill-btn-soft:hover:not(:disabled) {
  background: #f3f4f6;
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
  gap: 4px;
}

.unit-pill,
.recon-pill {
  height: 30px;
  padding: 0 11px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.unit-pill:hover:not(.active),
.recon-pill:hover:not(.active) {
  background: #f3f4f6;
  color: #111827;
}

.unit-pill.active,
.recon-pill.active {
  background: #034693;
  color: #ffffff;
}

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
.dropx-kpi-card::after { content: ''; position: absolute; border-radius: 9999px; pointer-events: none; }
.dropx-kpi-card::before { width: 124px; height: 124px; right: -28px; top: -28px; background: rgba(255, 255, 255, 0.12); }
.dropx-kpi-card::after { width: 92px; height: 92px; right: 24px; bottom: -38px; background: rgba(255, 255, 255, 0.07); }

.kpi-grad-navy { background: linear-gradient(135deg, #0b2144 0%, #034693 100%); }
.kpi-grad-emerald { background: linear-gradient(135deg, #22c55e 0%, #10b981 55%, #059669 100%); }
.kpi-grad-ocean { background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0284c7 100%); }
.kpi-grad-amber { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }

.kpi-top-row { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.kpi-label { font-size: 13px; font-weight: 400; color: rgba(255, 255, 255, 0.9); }
.kpi-icon-box { width: 38px; height: 38px; border-radius: 8px; background: rgba(255, 255, 255, 0.18); color: #ffffff; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-value { position: relative; z-index: 1; margin-top: 6px; font-size: clamp(1.25rem, 1.55vw, 1.5rem); line-height: 1.2; font-weight: 700; color: #ffffff; letter-spacing: -0.025em; }
.kpi-foot { position: relative; z-index: 1; margin-top: 4px; font-size: 12px; font-weight: 400; color: rgba(255, 255, 255, 0.84); }

.rev-tab-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
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
  padding: 8px 12px 10px;
  border-radius: 6px 6px 0 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 13.5px;
  font-weight: 500;
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

.rev-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.split-2-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.poital-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
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
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #111827;
}

.card-sub {
  font-size: 13px;
  font-weight: 400;
  color: #6b7280;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.clean-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.clean-table.compact {
  font-size: 13px;
}

.clean-table th {
  text-align: left;
  padding: 11px 12px;
  color: #6b7280;
  background: #fafafa;
  font-size: 12px;
  font-weight: 500;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}

.clean-table td {
  padding: 12px 12px;
  color: #111827;
  font-weight: 400;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.clean-table tbody tr:hover td {
  background: rgba(249, 250, 251, 0.85);
}

.col-num {
  text-align: right !important;
  white-space: nowrap;
}

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: #6b7280;
}

.mono-code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.015em;
  color: #034693;
}

.cell-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.unit-mini-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 9999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
  font-weight: 500;
}

.text-pos {
  color: #059669;
}

.aging-kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.aging-kpi-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 5px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.aging-kpi-card:hover {
  transform: translateY(-1px);
  border-color: #d1d5db;
}

.aging-kpi-card.is-selected {
  border-color: #034693;
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.2);
}

.aging-kpi-navy {
  background: linear-gradient(135deg, #0b2144 0%, #034693 100%);
  border-color: transparent;
  color: #ffffff;
}

.aging-kpi-navy .aging-kpi-label,
.aging-kpi-navy .aging-kpi-meta {
  color: rgba(255, 255, 255, 0.85);
}

.aging-kpi-blue { color: #034693; }
.aging-kpi-amber { color: #d97706; }
.aging-kpi-orange { color: #ea580c; }
.aging-kpi-red { color: #dc2626; }

.aging-kpi-label {
  font-size: 12.5px;
  font-weight: 400;
  color: #6b7280;
}

.aging-kpi-value {
  font-size: clamp(1rem, 1.3vw, 1.2rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.aging-kpi-meta {
  font-size: 12px;
  color: #6b7280;
}

.aging-day-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.aging-day-pill.bucket-current {
  background: #eff6ff;
  color: #1d4ed8;
}

.aging-day-pill.bucket-days31to60 {
  background: #fef3c7;
  color: #92400e;
}

.aging-day-pill.bucket-days61to90 {
  background: #ffedd5;
  color: #9a3412;
}

.aging-day-pill.bucket-over90 {
  background: #fee2e2;
  color: #b91c1c;
}

@media (max-width: 1120px) {
  .kpi-metric-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .aging-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .split-2-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .kpi-metric-row,
  .aging-kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
