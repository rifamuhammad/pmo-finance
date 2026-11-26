<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah } from '../utils/format';
import StateBanner from '../components/StateBanner.vue';

type TimeRangeKey = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type ChartView = 'pnl' | 'flow';

const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const dashboard = ref<any>(null);

const selectedYear = ref('2026');
const selectedRange = ref<TimeRangeKey>('monthly');
const chartView = ref<ChartView>('pnl');
const hoveredIndex = ref<number | null>(null);

const rangeTabs: Array<{ key: TimeRangeKey; label: string }> = [
  { key: 'weekly', label: '1W' },
  { key: 'monthly', label: '1M' },
  { key: 'quarterly', label: '1Q' },
  { key: 'yearly', label: '1Y' },
];

const profileType = computed<string>(() => dashboard.value?.roleProfile?.profileType || 'EXECUTIVE');

const headerTitle = computed(() => {
  switch (profileType.value) {
    case 'UNIT_MANAGER':
      return dashboard.value?.roleProfile?.scopeLabel || 'Ringkasan Unit Bisnis';
    case 'REVENUE_OPS':
      return 'Ringkasan Penerimaan';
    case 'PROCUREMENT_OPS':
      return 'Ringkasan Pengadaan & Belanja';
    case 'ACCOUNTING_TAX':
      return 'Ringkasan Akuntansi & Pajak';
    case 'AUDITOR':
      return 'Pengawasan SPI (Read-Only)';
    default:
      return 'Ringkasan Keuangan';
  }
});

const activeBundle = computed(() => {
  const byRange = dashboard.value?.portfolio?.pnlByRange;
  if (byRange && byRange[selectedRange.value]) return byRange[selectedRange.value];
  return {
    periodLabel: `FY-${selectedYear.value}`,
    series: [],
    summary: {
      revenue: 0,
      expense: 0,
      netPnl: 0,
      cashInflow: 0,
      cashOutflow: 0,
      deltaAmount: 0,
      deltaPercent: null as number | null,
      marginPercent: 0,
    },
  };
});

const activeSeries = computed<any[]>(() => activeBundle.value.series || []);
const activeSummary = computed(() => activeBundle.value.summary);
const balanceSheet = computed(() => dashboard.value?.portfolio?.balanceSheet || null);
const roleSummary = computed(() => dashboard.value?.roleSummary || null);
const kpis = computed(() => dashboard.value?.kpis || {});
const unitRows = computed<any[]>(() => dashboard.value?.unitPerformance || []);
const pendingApprovals = computed<any[]>(() => dashboard.value?.pendingApprovals || []);
const recentAuditLogs = computed<any[]>(() => dashboard.value?.recentAuditLogs || []);

const hoveredPoint = computed(() =>
  hoveredIndex.value !== null ? activeSeries.value[hoveredIndex.value] || null : null
);

// Primary Asset/Portfolio Hero Figure
const heroDisplay = computed(() => {
  const pt = hoveredPoint.value;
  const sum = activeSummary.value;
  if (profileType.value === 'REVENUE_OPS') {
    const val = pt ? pt.cashInflow : sum.cashInflow;
    return {
      title: pt ? pt.sublabel : `Penerimaan Kas (${activeBundle.value.periodLabel})`,
      amount: val,
      isNegative: false,
    };
  }
  if (profileType.value === 'PROCUREMENT_OPS') {
    const val = pt ? pt.cashOutflow : sum.cashOutflow;
    return {
      title: pt ? pt.sublabel : `Realisasi Belanja (${activeBundle.value.periodLabel})`,
      amount: val,
      isNegative: false,
    };
  }
  const val = pt ? pt.netPnl : sum.netPnl;
  return {
    title: pt ? pt.sublabel : `PnL Neto (${activeBundle.value.periodLabel})`,
    amount: val,
    isNegative: val < 0,
  };
});

// 4 Top KPI Cards in Original Poital Design Language (Adapted per Role)
const roleKpiCards = computed(() => {
  const k = kpis.value;
  const rs = roleSummary.value;
  const bs = balanceSheet.value;

  if (profileType.value === 'REVENUE_OPS') {
    return [
      { tone: 'hero-card', title: 'Kas Masuk Hari Ini', val: formatRupiah(rs?.cashierStatus?.todayCashReceived || 0), foot: `${rs?.cashierStatus?.openSessionsCount || 0} shift aktif` },
      { tone: 'blue-card', title: 'Total Faktur', val: formatRupiah(k.totalInvoicedRevenue || 0), foot: `${rs?.penerimaanSummary?.openInvoices || 0} faktur terbuka` },
      { tone: 'amber-card', title: 'Piutang Klien', val: formatRupiah(k.totalReceivablesOutstanding || 0), foot: 'Aging penerimaan' },
      { tone: 'white-card', title: 'Mutasi Belum Cocok', val: `${rs?.penerimaanSummary?.unmatchedBankLines || 0} baris`, foot: 'Bank Mandiri' },
    ];
  }

  if (profileType.value === 'PROCUREMENT_OPS') {
    return [
      { tone: 'hero-card', title: 'Sisa Plafon Bebas', val: formatRupiah(k.availableBudget || 0), foot: `${k.sisaPlafonPercent || 0}% tersedia` },
      { tone: 'blue-card', title: 'Komitmen PO', val: formatRupiah(k.totalBudgetCommitted || 0), foot: `${rs?.procurementQueue?.openPoCount || 0} PO aktif` },
      { tone: 'amber-card', title: 'Utang Vendor', val: formatRupiah(k.totalPayablesOutstanding || 0), foot: `${rs?.procurementQueue?.pendingVendorBillsCount || 0} tagihan` },
      { tone: 'white-card', title: 'PR & Biaya Proses', val: `${(rs?.procurementQueue?.pendingPrCount || 0) + (rs?.procurementQueue?.pendingExpenseCount || 0)} dok`, foot: 'Menunggu tindak lanjut' },
    ];
  }

  if (profileType.value === 'ACCOUNTING_TAX') {
    return [
      { tone: 'hero-card', title: 'Kas & Bank', val: formatRupiah(bs?.cashAndBank || 0), foot: bs?.isBalanced ? 'Mandiri · BTN · Seimbang' : 'Cek GL' },
      { tone: 'blue-card', title: 'Utang Pajak (GL)', val: formatRupiah(rs?.pettyCashTaxQueue?.totalTaxPayable || 0), foot: `${rs?.pettyCashTaxQueue?.pendingTaxVerifyCount || 0} SPJ cek pajak` },
      { tone: 'amber-card', title: 'Belum Rekonsiliasi', val: `${(dashboard.value?.reconSummary?.unmatched || 0) + (dashboard.value?.reconSummary?.needsReview || 0)} baris`, foot: 'Mutasi bank' },
      { tone: 'white-card', title: 'Aset Neto', val: formatRupiah(bs?.netAssets || 0), foot: 'ISAK 335' },
    ];
  }

  return [
    { tone: 'hero-card', title: 'Kas & Bank', val: formatRupiah(bs?.cashAndBank || k.totalCashReceivedNet || 0), foot: 'Mandiri · BTN' },
    { tone: 'blue-card', title: 'Pendapatan Faktur', val: formatRupiah(k.totalInvoicedRevenue || 0), foot: `Target ${k.revenueAchievementPercent || 0}%` },
    { tone: 'amber-card', title: 'Realisasi Beban', val: formatRupiah(k.totalExpenseActual || 0), foot: `Serapan ${k.totalSerapanPercent || 0}%` },
    { tone: 'white-card', title: 'Sisa Plafon', val: formatRupiah(k.availableBudget || 0), foot: `${k.sisaPlafonPercent || 0}% bebas` },
  ];
});

// Clean Portfolio Chart Geometry
const SVG_W = 680;
const SVG_H = 220;
const PAD_X = 14;
const PAD_T = 18;
const PAD_B = 22;
const PLOT_W = SVG_W - PAD_X * 2;
const PLOT_H = SVG_H - PAD_T - PAD_B;

function getPrimaryVal(pt: any): number {
  if (profileType.value === 'REVENUE_OPS') return Number(pt.cashInflow) || 0;
  if (profileType.value === 'PROCUREMENT_OPS') return Number(pt.cashOutflow) || 0;
  return Number(pt.netPnl) || 0;
}

const yBounds = computed(() => {
  const list = activeSeries.value;
  if (!list.length) return { min: 0, max: 10000000 };
  if (chartView.value === 'pnl') {
    const vals = list.map(getPrimaryVal);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    if (lo === 0 && hi === 0) return { min: 0, max: 10000000 };
    const pad = Math.max((hi - lo) * 0.14, 1000000);
    return { min: lo < 0 ? lo - pad : 0, max: hi + pad };
  }
  const hi = Math.max(0, ...list.flatMap((p) => [Number(p.revenue) || 0, Number(p.expense) || 0]));
  return { min: 0, max: hi > 0 ? hi * 1.15 : 10000000 };
});

function toY(v: number): number {
  const { min, max } = yBounds.value;
  return PAD_T + PLOT_H - ((v - min) / (max - min || 1)) * PLOT_H;
}

const zeroY = computed(() => toY(0));

function formatCompact(v: number): string {
  const s = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(1)}M`;
  if (a >= 1_000_000) return `${s}${Math.round(a / 1_000_000)}Jt`;
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}Rb`;
  return `${s}${Math.round(a)}`;
}

const yTicks = computed(() => {
  const { min, max } = yBounds.value;
  return [0, 0.33, 0.66, 1].map((r) => {
    const v = max - (max - min) * r;
    return { y: toY(v), label: formatCompact(v) };
  });
});

const points = computed(() => {
  const list = activeSeries.value;
  const n = list.length;
  return list.map((item, i) => ({
    i,
    x: n <= 1 ? PAD_X + PLOT_W / 2 : PAD_X + (i / (n - 1)) * PLOT_W,
    yMain: toY(getPrimaryVal(item)),
    yRev: toY(Number(item.revenue) || 0),
    yExp: toY(Number(item.expense) || 0),
    item,
  }));
});

function buildCurve(pts: Array<{ x: number; y: number }>): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const maxY = Math.max(...pts.map((p) => p.y));
  const minY = Math.min(...pts.map((p) => p.y));
  const clampY = (val: number) => Math.max(minY, Math.min(maxY, val));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const segMinY = Math.min(p1.y, p2.y);
    const segMaxY = Math.max(p1.y, p2.y);
    const c1y = Math.max(segMinY, Math.min(segMaxY, clampY(p1.y + (p2.y - p0.y) / 6)));
    const c2y = Math.max(segMinY, Math.min(segMaxY, clampY(p2.y - (p3.y - p1.y) / 6)));
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${c1y.toFixed(1)}, ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const mainCurve = computed(() => buildCurve(points.value.map((p) => ({ x: p.x, y: p.yMain }))));
const mainArea = computed(() => {
  const pts = points.value;
  if (!pts.length) return '';
  return `${mainCurve.value} L ${pts[pts.length - 1].x.toFixed(1)} ${zeroY.value.toFixed(1)} L ${pts[0].x.toFixed(1)} ${zeroY.value.toFixed(1)} Z`;
});
const revCurve = computed(() => buildCurve(points.value.map((p) => ({ x: p.x, y: p.yRev }))));
const expCurve = computed(() => buildCurve(points.value.map((p) => ({ x: p.x, y: p.yExp }))));

const mainColor = computed(() => {
  if (activeSummary.value.netPnl < 0 && profileType.value !== 'REVENUE_OPS') return '#ef4444';
  return '#034693';
});

const dashboardSubtitle = computed(() => {
  if (auth.activeWorkspace === 'PENERIMAAN' || profileType.value === 'REVENUE_OPS') {
    return 'Ringkasan arus kas masuk, tagihan invoice, rekonsiliasi Bank Mandiri, dan kinerja 4 unit bisnis.';
  }
  return 'Ringkasan kinerja keuangan, neraca, dan realisasi operasional PMO UTama secara menyeluruh.';
});

const activeDot = computed(() =>
  hoveredIndex.value !== null ? points.value[hoveredIndex.value] || null : null
);

function onScrub(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (!points.value.length || rect.width <= 0) return;
  const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  hoveredIndex.value = Math.round(rel * (points.value.length - 1));
}

function toggleUnit(unitId: string) {
  if (auth.user?.businessUnitId) return;
  auth.selectedBusinessUnitId = auth.selectedBusinessUnitId === unitId ? '' : unitId;
}

const showNeraca = computed(() =>
  ['EXECUTIVE', 'UNIT_MANAGER', 'ACCOUNTING_TAX', 'AUDITOR'].includes(profileType.value)
);

async function loadDashboard() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams();
    if (auth.selectedBusinessUnitId) params.append('businessUnitId', auth.selectedBusinessUnitId);
    params.append('year', selectedYear.value);
    params.append('range', selectedRange.value);
    const res = await apiFetch(`/reports/dashboard?${params.toString()}`);
    dashboard.value = res.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat dashboard.';
  } finally {
    loading.value = false;
  }
}

watch([() => auth.selectedBusinessUnitId, selectedYear], loadDashboard);
onMounted(loadDashboard);
</script>

<template>
  <div class="poital-dashboard">
    <!-- DropX Page Header -->
    <section class="overview-header">
      <div>
        <h1 class="page-title">{{ headerTitle }}</h1>
        <p class="page-subtitle">{{ dashboardSubtitle }}</p>
      </div>
      <div class="header-pills">
        <select v-model="selectedYear" class="date-range-pill" aria-label="Tahun Buku">
          <option value="2026">Tahun Buku FY-2026</option>
          <option value="2025">Tahun Buku FY-2025</option>
        </select>
      </div>
    </section>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Ringkasan"
      message="Mengambil data keuangan terbaru..."
    />
    <StateBanner
      v-else-if="errorMsg"
      state="error"
      title="Gagal Memuat"
      :message="errorMsg"
      actionLabel="Coba Lagi"
      @action="loadDashboard"
    />

    <div v-else class="dashboard-content-grid">
      <!-- 1. FOUR DROPX LUMINOUS GRADIENT KPI CARDS -->
      <section class="kpi-metric-row">
        <article
          v-for="(card, cIdx) in roleKpiCards"
          :key="card.title"
          class="dropx-kpi-card"
          :class="['kpi-grad-navy', 'kpi-grad-emerald', 'kpi-grad-ocean', 'kpi-grad-amber'][cIdx % 4]"
        >
          <div class="kpi-top-row">
            <span class="kpi-label">{{ card.title }}</span>
            <span class="kpi-icon-box" aria-hidden="true">
              <svg v-if="cIdx === 0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <svg v-else-if="cIdx === 1" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
              <svg v-else-if="cIdx === 2" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M6 10v11"/><path d="M12 10v11"/><path d="M18 10v11"/></svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </span>
          </div>
          <div class="kpi-value money">{{ card.val }}</div>
          <span class="kpi-foot">{{ card.foot }}</span>
        </article>
      </section>

      <!-- 2. PORTFOLIO PNL CHART (1W / 1M / 1Q / 1Y) + NERACA / OPS CARD -->
      <section class="dashboard-row-grid split-60-40">
        <!-- Left: Clean Crypto/Asset-Style Portfolio PnL Card -->
        <article class="poital-card">
          <div class="portfolio-top">
            <div>
              <span class="pnl-kicker">{{ heroDisplay.title }}</span>
              <div class="pnl-amount-line">
                <strong class="pnl-hero-num money" :class="{ 'is-neg': heroDisplay.isNegative }">
                  {{ formatRupiah(heroDisplay.amount) }}
                </strong>
                <span
                  v-if="activeSummary.deltaPercent !== null && !hoveredPoint"
                  class="pnl-delta"
                  :class="activeSummary.deltaAmount >= 0 ? 'up' : 'down'"
                >
                  {{ activeSummary.deltaAmount >= 0 ? '+' : '' }}{{ activeSummary.deltaPercent }}%
                </span>
              </div>
            </div>

            <div class="portfolio-controls">
              <div class="range-pills" role="tablist" aria-label="Rentang Waktu">
                <button
                  v-for="t in rangeTabs"
                  :key="t.key"
                  type="button"
                  role="tab"
                  class="range-btn"
                  :class="{ active: selectedRange === t.key }"
                  :aria-selected="selectedRange === t.key"
                  @click="selectedRange = t.key; hoveredIndex = null"
                >
                  {{ t.label }}
                </button>
              </div>
              <div class="range-pills">
                <button
                  type="button"
                  class="range-btn"
                  :class="{ active: chartView === 'pnl' }"
                  @click="chartView = 'pnl'"
                >
                  PnL
                </button>
                <button
                  type="button"
                  class="range-btn"
                  :class="{ active: chartView === 'flow' }"
                  @click="chartView = 'flow'"
                >
                  Masuk/Keluar
                </button>
              </div>
            </div>
          </div>

          <!-- Chart Canvas -->
          <div
            class="chart-wrap"
            @mousemove="onScrub"
            @mouseleave="hoveredIndex = null"
          >
            <div class="y-col">
              <span v-for="t in yTicks" :key="t.y">{{ t.label }}</span>
            </div>
            <div class="svg-col">
              <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" preserveAspectRatio="none" class="pnl-svg">
                <defs>
                  <linearGradient id="pmoPnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" :stop-color="mainColor" stop-opacity="0.22" />
                    <stop offset="100%" :stop-color="mainColor" stop-opacity="0" />
                  </linearGradient>
                </defs>

                <line
                  v-for="t in yTicks"
                  :key="`l-${t.y}`"
                  :x1="PAD_X"
                  :x2="SVG_W - PAD_X"
                  :y1="t.y"
                  :y2="t.y"
                  stroke="#e2e8f0"
                  stroke-dasharray="3 4"
                  stroke-width="1"
                />
                <line :x1="PAD_X" :x2="SVG_W - PAD_X" :y1="zeroY" :y2="zeroY" stroke="#cbd5e1" stroke-width="1" />

                <template v-if="chartView === 'pnl'">
                  <path :d="mainArea" fill="url(#pmoPnlGrad)" />
                  <path :d="mainCurve" fill="none" :stroke="mainColor" stroke-width="2.5" stroke-linecap="round" />
                </template>
                <template v-else>
                  <path :d="revCurve" fill="none" stroke="#059669" stroke-width="2.3" stroke-linecap="round" />
                  <path :d="expCurve" fill="none" stroke="#034693" stroke-width="2.3" stroke-linecap="round" />
                </template>

                <template v-if="activeDot">
                  <line
                    :x1="activeDot.x"
                    :x2="activeDot.x"
                    :y1="PAD_T"
                    :y2="SVG_H - PAD_B"
                    stroke="#94a3b8"
                    stroke-dasharray="3 3"
                    stroke-width="1"
                  />
                  <circle
                    v-if="chartView === 'pnl'"
                    :cx="activeDot.x"
                    :cy="activeDot.yMain"
                    r="5"
                    :fill="mainColor"
                    stroke="#ffffff"
                    stroke-width="2.5"
                  />
                  <template v-else>
                    <circle :cx="activeDot.x" :cy="activeDot.yRev" r="4.5" fill="#059669" stroke="#ffffff" stroke-width="2" />
                    <circle :cx="activeDot.x" :cy="activeDot.yExp" r="4.5" fill="#034693" stroke="#ffffff" stroke-width="2" />
                  </template>
                </template>
              </svg>
            </div>
          </div>

          <div class="x-row">
            <button
              v-for="p in points"
              :key="p.item.key"
              type="button"
              class="x-tick"
              :class="{ active: hoveredIndex === p.i }"
              @mouseenter="hoveredIndex = p.i"
            >
              {{ p.item.label }}
            </button>
          </div>

          <div class="pnl-mini-foot">
            <div>
              <span>Masuk</span>
              <strong class="money text-pos">{{ formatRupiah(hoveredPoint ? hoveredPoint.revenue : activeSummary.revenue) }}</strong>
            </div>
            <div>
              <span>Keluar</span>
              <strong class="money">{{ formatRupiah(hoveredPoint ? hoveredPoint.expense : activeSummary.expense) }}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong class="money">{{ activeSummary.marginPercent }}%</strong>
            </div>
          </div>
        </article>

        <!-- Right: Clean Neraca Card (Asset Allocation Style) -->
        <article v-if="showNeraca && balanceSheet" class="poital-card neraca-clean">
          <div class="card-header-bar">
            <h2 class="card-title">Neraca</h2>
            <span class="mini-pill" :class="balanceSheet.isBalanced ? 'ok' : 'warn'">
              {{ balanceSheet.isBalanced ? 'Seimbang' : 'Cek GL' }}
            </span>
          </div>

          <div class="neraca-hero-val money">{{ formatRupiah(balanceSheet.netAssets) }}</div>
          <span class="neraca-hero-sub">Total Aset Neto</span>

          <!-- Asset Allocation Bar -->
          <div class="alloc-bar">
            <div
              v-for="seg in balanceSheet.allocation"
              :key="seg.key"
              class="alloc-seg"
              :style="{ width: `${seg.percent}%`, backgroundColor: seg.color }"
              :title="`${seg.label}: ${formatRupiah(seg.amount)}`"
            ></div>
          </div>

          <div class="neraca-list">
            <div class="n-row">
              <span>Total Aset</span>
              <strong class="money">{{ formatRupiah(balanceSheet.totalAssets) }}</strong>
            </div>
            <div class="n-row">
              <span>Kas &amp; Bank</span>
              <strong class="money">{{ formatRupiah(balanceSheet.cashAndBank) }}</strong>
            </div>
            <div class="n-row">
              <span>Piutang Usaha</span>
              <strong class="money">{{ formatRupiah(balanceSheet.receivables) }}</strong>
            </div>
            <div class="n-row">
              <span>Total Liabilitas</span>
              <strong class="money">{{ formatRupiah(balanceSheet.totalLiabilities) }}</strong>
            </div>
          </div>
        </article>

        <!-- Right: Cashier Ops Card -->
        <article v-else-if="profileType === 'REVENUE_OPS' && roleSummary" class="poital-card neraca-clean">
          <div class="card-header-bar">
            <h2 class="card-title">Aging Penerimaan</h2>
            <span class="mini-pill ok">{{ roleSummary.agingReceivables.openCount }} Faktur</span>
          </div>
          <div class="neraca-hero-val money">{{ formatRupiah(roleSummary.agingReceivables.totalOutstanding) }}</div>
          <span class="neraca-hero-sub">Total Piutang Terbuka</span>
          <div class="neraca-list">
            <div class="n-row"><span>0 - 30 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.current) }}</strong></div>
            <div class="n-row"><span>31 - 60 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.days31to60) }}</strong></div>
            <div class="n-row"><span>61 - 90 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.days61to90) }}</strong></div>
            <div class="n-row"><span>&gt; 90 Hari</span><strong class="money text-neg">{{ formatRupiah(roleSummary.agingReceivables.over90) }}</strong></div>
          </div>
        </article>

        <!-- Right: Procurement Ops Card -->
        <article v-else-if="profileType === 'PROCUREMENT_OPS' && roleSummary" class="poital-card neraca-clean">
          <div class="card-header-bar">
            <h2 class="card-title">Aging Pembayaran</h2>
            <span class="mini-pill ok">{{ roleSummary.agingPayables.openCount }} Tagihan</span>
          </div>
          <div class="neraca-hero-val money">{{ formatRupiah(roleSummary.agingPayables.totalOutstanding) }}</div>
          <span class="neraca-hero-sub">Total Utang Vendor</span>
          <div class="neraca-list">
            <div class="n-row"><span>0 - 30 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.current) }}</strong></div>
            <div class="n-row"><span>31 - 60 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.days31to60) }}</strong></div>
            <div class="n-row"><span>61 - 90 Hari</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.days61to90) }}</strong></div>
            <div class="n-row"><span>&gt; 90 Hari</span><strong class="money text-neg">{{ formatRupiah(roleSummary.agingPayables.over90) }}</strong></div>
          </div>
        </article>
      </section>

      <!-- 3. CLEAN ROLE-SPECIFIC BOTTOM ROW -->
      <section v-if="profileType === 'EXECUTIVE' || profileType === 'AUDITOR'" class="dashboard-row-grid split-60-40">
        <!-- Unit Performance Table -->
        <article class="poital-card">
          <div class="card-header-bar">
            <h2 class="card-title">Unit Bisnis</h2>
            <button
              v-if="auth.selectedBusinessUnitId && !auth.user?.businessUnitId"
              type="button"
              class="mini-reset-btn"
              @click="auth.selectedBusinessUnitId = ''"
            >
              Semua Unit
            </button>
          </div>
          <div class="table-wrap">
            <table class="clean-products-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th class="col-price">Pendapatan</th>
                  <th class="col-price">Beban</th>
                  <th class="col-price">Serapan</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in unitRows"
                  :key="u.unitId"
                  class="unit-row"
                  :class="{ active: auth.selectedBusinessUnitId === u.unitId }"
                  @click="toggleUnit(u.unitId)"
                >
                  <td><strong>{{ u.unitName }}</strong></td>
                  <td class="col-price money">{{ formatRupiah(u.invoicedRevenue) }}</td>
                  <td class="col-price money">{{ formatRupiah(u.actualExpense) }}</td>
                  <td class="col-price money">{{ u.utilizationPercent }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- Approvals (Exec) OR Audit Feed (Auditor) -->
        <article class="poital-card">
          <div class="card-header-bar">
            <h2 class="card-title">{{ profileType === 'AUDITOR' ? 'Log Audit Terbaru' : 'Menunggu Persetujuan' }}</h2>
          </div>

          <template v-if="profileType === 'AUDITOR'">
            <div v-if="recentAuditLogs.length === 0" class="empty-note">Belum ada log audit.</div>
            <div v-else class="slim-list">
              <div v-for="log in recentAuditLogs.slice(0, 5)" :key="log.id" class="slim-item">
                <div class="slim-left">
                  <strong>{{ log.action }}</strong>
                  <span>{{ log.module }} · {{ log.actorName }}</span>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-if="pendingApprovals.length === 0" class="empty-note">Tidak ada antrean persetujuan.</div>
            <div v-else class="slim-list">
              <div
                v-for="apr in pendingApprovals.slice(0, 5)"
                :key="apr.id"
                class="slim-item"
              >
                <div class="slim-left">
                  <strong>{{ apr.entityCode }}</strong>
                  <span>{{ apr.title }}</span>
                </div>
                <strong class="money">{{ formatRupiah(apr.amount) }}</strong>
              </div>
            </div>
          </template>
        </article>
      </section>

      <!-- Aging Pair for Unit Manager & Accounting/Tax -->
      <section v-else-if="(profileType === 'UNIT_MANAGER' || profileType === 'ACCOUNTING_TAX') && roleSummary" class="dashboard-row-grid split-50-50">
        <article class="poital-card">
          <div class="card-header-bar">
            <h2 class="card-title">Aging Penerimaan</h2>
          </div>
          <div class="aging-4">
            <div><span>0-30h</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.current) }}</strong></div>
            <div><span>31-60h</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.days31to60) }}</strong></div>
            <div><span>61-90h</span><strong class="money">{{ formatRupiah(roleSummary.agingReceivables.days61to90) }}</strong></div>
            <div><span>&gt;90h</span><strong class="money text-neg">{{ formatRupiah(roleSummary.agingReceivables.over90) }}</strong></div>
          </div>
        </article>

        <article class="poital-card">
          <div class="card-header-bar">
            <h2 class="card-title">Aging Pembayaran</h2>
          </div>
          <div class="aging-4">
            <div><span>0-30h</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.current) }}</strong></div>
            <div><span>31-60h</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.days31to60) }}</strong></div>
            <div><span>61-90h</span><strong class="money">{{ formatRupiah(roleSummary.agingPayables.days61to90) }}</strong></div>
            <div><span>&gt;90h</span><strong class="money text-neg">{{ formatRupiah(roleSummary.agingPayables.over90) }}</strong></div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.poital-dashboard {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.overview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.page-title {
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: #111827;
  margin: 0;
}

.page-subtitle {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6b7280;
}

.date-range-pill {
  height: 36px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13.5px;
  font-weight: 500;
  color: #111827;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  cursor: pointer;
}

.dashboard-content-grid {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* DropX Luminous 4-Card Gradient KPI Row (PMO UTama Palette) */
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
  width: 126px;
  height: 126px;
  right: -28px;
  top: -28px;
  background: rgba(255, 255, 255, 0.12);
}

.dropx-kpi-card::after {
  width: 96px;
  height: 96px;
  right: 26px;
  bottom: -40px;
  background: rgba(255, 255, 255, 0.07);
}

.kpi-grad-navy {
  background: linear-gradient(135deg, #0b2144 0%, #034693 100%);
}
.kpi-grad-emerald {
  background: linear-gradient(135deg, #22c55e 0%, #10b981 55%, #059669 100%);
}
.kpi-grad-ocean {
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0284c7 100%);
}
.kpi-grad-amber {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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

/* DropX Pure White Cards */
.poital-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dashboard-row-grid {
  display: grid;
  gap: 16px;
}

.split-60-40 { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); }
.split-50-50 { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.card-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #111827;
}

/* Portfolio PnL Chart */
.portfolio-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.pnl-kicker {
  display: block;
  font-size: 12.5px;
  color: var(--text-secondary);
  font-weight: 500;
}

.pnl-amount-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 3px;
}

.pnl-hero-num {
  font-size: 1.625rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.pnl-hero-num.is-neg { color: #e11d48; }

.pnl-delta {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
}
.pnl-delta.up { background: #ecfdf5; color: #059669; }
.pnl-delta.down { background: #fef2f2; color: #e11d48; }

.portfolio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range-pills {
  display: inline-flex;
  padding: 3px;
  border-radius: 8px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
}

.range-btn {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.range-btn.active {
  background: #0b2144;
  color: #ffffff;
}

.chart-wrap {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 8px;
  height: 220px;
}

.y-col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 0 18px;
  font-size: 0.68rem;
  color: var(--text-secondary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.svg-col {
  width: 100%;
  height: 100%;
}

.pnl-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.x-row {
  margin-left: 54px;
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
}

.x-tick {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 400;
  padding: 4px 2px;
  border-radius: 6px;
  cursor: pointer;
}

.x-tick.active,
.x-tick:hover {
  color: #034693;
  background: #eff6ff;
}

.pnl-mini-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.pnl-mini-foot > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pnl-mini-foot span {
  font-size: 12px;
  color: var(--text-secondary);
}

.pnl-mini-foot strong {
  font-size: 14px;
  font-weight: 600;
}

/* Clean Neraca / Asset Allocation Card */
.mini-pill {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 9999px;
}
.mini-pill.ok { background: rgba(16, 185, 129, 0.12); color: #059669; }
.mini-pill.warn { background: rgba(239, 68, 68, 0.12); color: #dc2626; }

.neraca-hero-val {
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.neraca-hero-sub {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.alloc-bar {
  margin: 14px 0 16px;
  height: 8px;
  border-radius: 9999px;
  background: var(--bg-subtle);
  overflow: hidden;
  display: flex;
}

.alloc-seg {
  height: 100%;
  transition: width 180ms ease;
}

.neraca-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.n-row {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
  color: var(--text-secondary);
}

.n-row strong {
  color: var(--text-primary);
  font-weight: 600;
}

.clean-link-btn {
  margin-top: 16px;
  width: 100%;
  min-height: 40px;
  border: none;
  border-radius: 12px;
  background: var(--bg-subtle);
  color: #034693;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 140ms ease;
}

.clean-link-btn:hover {
  background: #eff6ff;
}

/* Tables & Lists (Original Poital Style) */
.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.clean-products-table {
  width: 100%;
  border-collapse: collapse;
}

.clean-products-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e7eb;
}

.clean-products-table td {
  padding: 12px 14px;
  font-size: 13.5px;
  font-weight: 400;
  color: #111827;
  border-bottom: 1px solid #f3f4f6;
}

.clean-products-table td strong {
  font-weight: 500;
}

.clean-products-table tbody tr:last-child td {
  border-bottom: none;
}

.col-price {
  text-align: right;
  white-space: nowrap;
}

.unit-row {
  cursor: pointer;
  transition: background 120ms ease;
}
.unit-row:hover { background: var(--bg-subtle); }
.unit-row.active { background: #eff6ff; }

.slim-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slim-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
  font-size: 0.82rem;
}

.slim-item.clickable { cursor: pointer; }
.slim-item.clickable:hover { background: #eff6ff; }

.slim-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.slim-left span {
  font-size: 0.74rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-reset-btn {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #034693;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 11px;
  border-radius: 6px;
  cursor: pointer;
}
.mini-reset-btn:hover {
  background: #eff6ff;
  border-color: #93c5fd;
}

.aging-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.aging-4 > div {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aging-4 span { font-size: 12px; color: var(--text-secondary); }
.aging-4 strong { font-size: 13.5px; font-weight: 600; }

.empty-note {
  padding: 20px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.text-pos { color: #059669; }
.text-neg { color: #e11d48; }

@media (max-width: 1120px) {
  .kpi-metric-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .split-60-40, .split-50-50 { grid-template-columns: 1fr; }
}

@media (max-width: 680px) {
  .kpi-metric-row { grid-template-columns: 1fr; gap: 12px; }
  .dropx-kpi-card { padding: 16px; }
  .date-range-pill { min-height: 44px; width: 100%; }
  .range-btn { min-height: 40px; padding: 6px 12px; }
  .poital-card { padding: 16px; }
  .aging-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pnl-hero-num { font-size: clamp(1.3rem, 5vw, 1.6rem); }
  .chart-wrap { grid-template-columns: 38px minmax(0, 1fr); gap: 6px; height: 190px; }
  .x-row { margin-left: 44px; overflow-x: auto; }
  .pnl-mini-foot { grid-template-columns: 1fr; gap: 8px; }
}
</style>
