<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch, downloadApiBlob } from '../services/api';
import { formatRupiah } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import AlertBanner from '../components/AlertBanner.vue';

const router = useRouter();

type LaporanTab = 'realisasi' | 'aging';
const activeTab = ref<LaporanTab>('realisasi');

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

onMounted(loadData);
</script>

<template>
  <div class="poital-penerimaan">
    <!-- Header -->
    <div class="rev-top-bar">
      <div>
        <h1 class="rev-title">Laporan Penerimaan</h1>
      </div>
      <div class="rev-top-actions">
        <input
          v-model="selectedMonth"
          type="month"
          class="pill-month-input"
          aria-label="Pilih Bulan Laporan"
        />
        <button type="button" class="pill-btn-soft" :disabled="exportingAging" @click="exportAgingExcel">
          {{ exportingAging ? 'Menyiapkan...' : 'Export Aging .xlsx' }}
        </button>
        <button type="button" class="pill-btn-navy" :disabled="exportingMonthly" @click="exportMonthlyExcel">
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
        <button type="button" class="unit-pill" @click="router.push('/reconciliation')">
          &larr; Rekonsiliasi
        </button>
      </div>
    </div>

    <AlertBanner v-if="feedbackMsg" variant="success" title="Berhasil" :message="feedbackMsg" @dismiss="feedbackMsg = ''" />
    <AlertBanner v-if="errorMsg" variant="danger" title="Perhatian" :message="errorMsg" @dismiss="errorMsg = ''" />

    <!-- KPI Row -->
    <section class="kpi-metric-row">
      <article class="metric-card hero-card">
        <span class="metric-title">Realisasi Penerimaan ({{ recapData?.period?.label || selectedMonth }})</span>
        <strong class="metric-number-val money">{{ formatRupiah(recapData?.summary?.totalReceived || 0) }}</strong>
        <span class="trend-text">{{ recapData?.summary?.totalTransactions || 0 }} transaksi masuk Bank Mandiri</span>
      </article>
      <article class="metric-card blue-card">
        <span class="metric-title">Pendapatan Bersih PMO</span>
        <strong class="metric-number-val money dark-num">{{ formatRupiah(recapData?.summary?.totalNetClean || 0) }}</strong>
        <span class="trend-text">Neto setelah pajak UT &amp; lebih bayar</span>
      </article>
      <article class="metric-card amber-card" style="cursor: pointer;" @click="activeTab = 'aging'">
        <span class="metric-title">Total Piutang Terbuka (Aging)</span>
        <strong class="metric-number-val money dark-num">{{ formatRupiah(agingData?.buckets?.totalOutstanding || 0) }}</strong>
        <span class="trend-text">{{ agingData?.buckets?.openCount || 0 }} faktur belum lunas</span>
      </article>
      <article class="metric-card white-card">
        <span class="metric-title">Tingkat Rekonsiliasi Bank</span>
        <strong class="metric-number-val dark-num">
          {{ recapData?.summary?.reconciledCount || 0 }} / {{ recapData?.summary?.allScopeCount || 0 }}
        </strong>
        <span class="trend-text">
          Terverifikasi {{ formatRupiah(recapData?.summary?.reconciledAmount || 0) }}
        </span>
      </article>
    </section>

    <!-- 2 Tabs -->
    <div class="rev-tab-strip">
      <div class="tab-pills" role="tablist">
        <button type="button" class="tab-pill" :class="{ active: activeTab === 'realisasi' }" @click="activeTab = 'realisasi'">
          1. Realisasi per Unit &amp; COA
        </button>
        <button type="button" class="tab-pill" :class="{ active: activeTab === 'aging' }" @click="activeTab = 'aging'">
          2. Aging Penerimaan ({{ agingData?.buckets?.openCount || 0 }})
        </button>
      </div>
    </div>

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
              <tr v-if="recapData?.byUnit?.length > 1" style="background: #f8fafc; font-weight: 700;">
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
            <button type="button" class="pill-btn-soft" @click="router.push('/revenue')">
              Buka Buku Harian
            </button>
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
  min-width: 220px;
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
}

.pill-btn-navy {
  background: #0b2144;
  color: #ffffff;
}

.pill-btn-soft {
  background: #ffffff;
  color: #0b2144;
  border-color: #cbd5e1;
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

.rev-tab-strip {
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
  gap: 6px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.aging-kpi-card.is-selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.aging-kpi-navy {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.aging-kpi-navy .aging-kpi-label,
.aging-kpi-navy .aging-kpi-meta {
  color: #cbd5e1;
}

.aging-kpi-blue {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #0b2144;
}

.aging-kpi-amber {
  background: #fef9ed;
  border-color: #fde68a;
  color: #78350f;
}

.aging-kpi-orange {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}

.aging-kpi-red {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.aging-kpi-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: #475569;
}

.aging-kpi-value {
  font-size: clamp(0.95rem, 1.3vw, 1.2rem);
  font-weight: 800;
  line-height: 1.2;
}

.aging-kpi-meta {
  font-size: 0.73rem;
  color: #64748b;
}

.aging-day-pill {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
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
