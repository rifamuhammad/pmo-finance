<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah } from '../utils/format';
import StateBanner from '../components/StateBanner.vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const errorMsg = ref('');
const dashboard = ref<any>(null);

// Selected filter dropdown states
const selectedYear = ref('2026');
const selectedMonth = ref('Juni');
const selectedPurchaseYear = ref('2026');

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Interactive controls on Tren Keuangan chart
const activeMonthIndex = ref(8); // Defaults to September / current quarter
const hoveredMonthIndex = ref<number | null>(null);
const isChartHovered = ref(false);
const activeSeries = ref<'all' | 'expense' | 'cash'>('all');
const chartViewMode = ref<'spline' | 'bars'>('spline');

const monthlyTrends = computed(() => {
  if (dashboard.value?.monthlyTrends?.length) {
    return dashboard.value.monthlyTrends;
  }
  const baseRev = dashboard.value?.kpis?.totalInvoicedRevenue ?? 0;
  const baseExp = dashboard.value?.kpis?.totalExpenseActual ?? 0;
  const baseCash = dashboard.value?.kpis?.totalCashReceivedNet ?? 0;
  return months.map((m, idx) => ({
    month: m,
    monthIndex: idx,
    year: parseInt(selectedYear.value) || 2026,
    revenue: Math.round(baseRev * (0.05 + idx * 0.007)),
    expense: Math.round(baseExp * (0.05 + idx * 0.006)),
    cash: Math.round(baseCash * (0.05 + idx * 0.007)),
    netMargin: Math.round(baseCash * (0.05 + idx * 0.007) - baseExp * (0.05 + idx * 0.006)),
  }));
});

const activeTrendIndex = computed(() => {
  if (hoveredMonthIndex.value !== null && hoveredMonthIndex.value >= 0) {
    return hoveredMonthIndex.value;
  }
  return activeMonthIndex.value;
});

const activeTrend = computed(() => {
  const list = monthlyTrends.value;
  const idx = activeTrendIndex.value;
  return list[idx] || list[0] || { month: 'Jan', expense: 0, cash: 0, revenue: 0, netMargin: 0 };
});

const tooltipData = computed(() => {
  const current = activeTrend.value;
  const cash = Number(current.cash) || 0;
  const exp = Number(current.expense) || 0;
  const rev = Number(current.revenue) || 0;
  const net = cash - exp;
  const ratio = exp > 0 ? (cash / exp).toFixed(1) : (cash > 0 ? '∞' : '0');
  return {
    month: current.month,
    year: current.year || selectedYear.value,
    expense: formatRupiah(exp),
    cash: formatRupiah(cash),
    revenue: formatRupiah(rev),
    netMargin: formatRupiah(Math.abs(net)),
    isSurplus: net >= 0,
    ratio,
    hasActivity: cash > 0 || exp > 0 || rev > 0,
  };
});

// Dynamic Y-axis scale based on max cash/expense in data
const chartMaxVal = computed(() => {
  const vals = monthlyTrends.value.map((m: any) => Math.max(Number(m.cash) || 0, Number(m.expense) || 0));
  const peak = Math.max(...vals, 50000000);
  const step = peak > 150000000 ? 50000000 : 25000000;
  return Math.ceil(peak / step) * step;
});

function formatCompactRupiah(val: number): string {
  if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)}M`;
  if (val >= 1000000) return `Rp ${Math.round(val / 1000000)} Jt`;
  if (val >= 1000) return `Rp ${Math.round(val / 1000)} Rb`;
  return `Rp ${val}`;
}

const yAxisSteps = computed(() => {
  const max = chartMaxVal.value;
  return [
    { label: formatCompactRupiah(max), y: 25 },
    { label: formatCompactRupiah(max * 0.75), y: 71 },
    { label: formatCompactRupiah(max * 0.5), y: 118 },
    { label: formatCompactRupiah(max * 0.25), y: 164 },
    { label: 'Rp 0', y: 210 },
  ];
});

// Chart coordinate constants
const SVG_WIDTH = 680;
const SVG_HEIGHT = 230;
const PAD_X = 24;
const PAD_TOP = 25;
const BASELINE_Y = 210;
const USABLE_WIDTH = SVG_WIDTH - PAD_X * 2;
const USABLE_HEIGHT = BASELINE_Y - PAD_TOP;

const chartPoints = computed(() => {
  const max = chartMaxVal.value || 1;
  const list = monthlyTrends.value;
  const count = Math.max(list.length, 12);

  const expense = list.map((item: any, i: number) => {
    const x = PAD_X + (i / (count - 1)) * USABLE_WIDTH;
    const y = BASELINE_Y - (Math.max(0, Number(item.expense) || 0) / max) * USABLE_HEIGHT;
    return { x, y, ...item };
  });

  const cash = list.map((item: any, i: number) => {
    const x = PAD_X + (i / (count - 1)) * USABLE_WIDTH;
    const y = BASELINE_Y - (Math.max(0, Number(item.cash) || 0) / max) * USABLE_HEIGHT;
    return { x, y, ...item };
  });

  return { expense, cash };
});

function buildSplinePath(pts: Array<{ x: number; y: number }>): string {
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

const expenseSpline = computed(() => buildSplinePath(chartPoints.value.expense));
const expenseArea = computed(() => {
  const pts = chartPoints.value.expense;
  if (!pts.length) return '';
  return `${expenseSpline.value} L ${pts[pts.length - 1].x.toFixed(1)} ${BASELINE_Y} L ${pts[0].x.toFixed(1)} ${BASELINE_Y} Z`;
});

const cashSpline = computed(() => buildSplinePath(chartPoints.value.cash));
const cashArea = computed(() => {
  const pts = chartPoints.value.cash;
  if (!pts.length) return '';
  return `${cashSpline.value} L ${pts[pts.length - 1].x.toFixed(1)} ${BASELINE_Y} L ${pts[0].x.toFixed(1)} ${BASELINE_Y} Z`;
});

const currentExpPoint = computed(() => {
  return chartPoints.value.expense[activeTrendIndex.value] || chartPoints.value.expense[0];
});

const currentCashPoint = computed(() => {
  return chartPoints.value.cash[activeTrendIndex.value] || chartPoints.value.cash[0];
});

function onChartMouseMove(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const relX = (e.clientX - rect.left) / rect.width;
  const count = monthlyTrends.value.length || 12;
  const idx = Math.min(count - 1, Math.max(0, Math.round(relX * (count - 1))));
  hoveredMonthIndex.value = idx;
  activeMonthIndex.value = idx;
  isChartHovered.value = true;
}

function onChartMouseLeave() {
  isChartHovered.value = false;
  hoveredMonthIndex.value = null;
}

function selectMonth(idx: number) {
  activeMonthIndex.value = idx;
  hoveredMonthIndex.value = idx;
}

const tooltipLeftStyle = computed(() => {
  const idx = activeTrendIndex.value;
  const x = currentExpPoint.value ? currentExpPoint.value.x : 350;
  const leftPct = (x / SVG_WIDTH) * 100;
  let transform = 'translateX(-50%)';
  if (idx <= 1) {
    transform = 'translateX(-8%)';
  } else if (idx >= 10) {
    transform = 'translateX(-92%)';
  }
  return {
    left: `${leftPct}%`,
    transform,
  };
});

// Top Selling Products / Layanan Seeded PMO UTama
const displayProducts = computed(() => {
  if (dashboard.value?.topProducts?.length) {
    return dashboard.value.topProducts;
  }
  return [
    { id: 1, name: 'Paket Meeting Fullboard Ballroom MICE (100 Pax)', code: 'SRV-MICE-001', orders: 28, category: 'MICE & Wisma', color: '#034693' },
    { id: 2, name: 'Sertifikasi Project Management Professional (TCI)', code: 'SRV-DKL-001', orders: 22, category: 'TCI / Diklat', color: '#F59E0B' },
    { id: 3, name: 'Lisensi Enterprise ERP & Cloud Managed Service', code: 'SRV-ITS-001', orders: 16, category: 'IT Solution', color: '#059669' },
    { id: 4, name: 'Paket Medical Check Up (MCU) Eksekutif Karyawan', code: 'SRV-KLN-001', orders: 34, category: 'Klinik Pratama', color: '#2563EB' },
    { id: 5, name: 'Sewa Kamar Wisma Deluxe (Breakfast & Wifi)', code: 'SRV-MICE-002', orders: 42, category: 'MICE & Wisma', color: '#7C3AED' },
    { id: 6, name: 'Jasa Konsultansi Maturity Model PMO', code: 'SRV-KNS-001', orders: 12, category: 'IT Solution', color: '#DC2626' },
  ];
});

// Kinerja 4 Divisi PMO UTama (IT Solution, MICE, TCI, Klinik Pratama)
const divisionPerformance = computed(() => {
  if (dashboard.value?.unitPerformance?.length) {
    return dashboard.value.unitPerformance.filter((u: any) => u.unitCode !== 'BU-PUSAT');
  }
  return [
    { unitCode: 'BU-ITS', unitName: 'IT Solution', invoicedRevenue: 170000000, actualExpense: 95000000, utilizationPercent: 68 },
    { unitCode: 'BU-MICE', unitName: 'MICE & Wisma', invoicedRevenue: 145000000, actualExpense: 85000000, utilizationPercent: 74 },
    { unitCode: 'BU-TCI', unitName: 'TCI (Diklat & Sertifikasi)', invoicedRevenue: 100000000, actualExpense: 60000000, utilizationPercent: 62 },
    { unitCode: 'BU-KLINIK', unitName: 'Klinik Pratama', invoicedRevenue: 65000000, actualExpense: 42000000, utilizationPercent: 55 },
  ];
});

// SVG Donut Dynamic Calculations
const donutSegments = computed(() => {
  const kpis = dashboard.value?.kpis;
  const realisasi = kpis?.realisasiBiayaPercent ?? 0;
  const komitmen = kpis?.komitmenPoPercent ?? 0;
  const sisa = Math.max(0, 100 - realisasi - komitmen);

  const circumference = 377; // 2 * PI * 60
  const realisasiStroke = Math.round((realisasi / 100) * circumference);
  const komitmenStroke = Math.round((komitmen / 100) * circumference);
  const sisaStroke = Math.round((sisa / 100) * circumference);

  return {
    realisasi,
    komitmen,
    sisa,
    totalSerapan: Math.min(100, realisasi + komitmen),
    realisasiDash: `${realisasiStroke} ${circumference}`,
    komitmenDash: `${komitmenStroke} ${circumference}`,
    komitmenOffset: -(realisasiStroke),
    sisaDash: `${sisaStroke} ${circumference}`,
    sisaOffset: -(realisasiStroke + komitmenStroke),
  };
});

function getBarHeight(idx: number, type: 'cash' | 'expense'): string {
  const item = monthlyTrends.value[idx] || monthlyTrends.value[0];
  const max = chartMaxVal.value || 1;
  const val = type === 'cash' ? (Number(item?.cash) || 0) : (Number(item?.expense) || 0);
  if (val <= 0) return '4px';
  const pct = Math.min(95, Math.max(6, Math.round((val / max) * 92)));
  return `${pct}%`;
}

async function loadDashboard() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams();
    if (auth.selectedBusinessUnitId) {
      params.append('businessUnitId', auth.selectedBusinessUnitId);
    }
    if (selectedYear.value) {
      params.append('year', selectedYear.value);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch(`/reports/dashboard${query}`);
    dashboard.value = res.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat ringkasan dashboard.';
  } finally {
    loading.value = false;
  }
}

watch([() => auth.selectedBusinessUnitId, selectedYear], loadDashboard);
onMounted(loadDashboard);
</script>

<template>
  <div class="poital-dashboard">
    <!-- Page Header: Overview & Date Range Dropdown -->
    <section class="overview-header">
      <div>
        <h1 class="page-title">Ringkasan Keuangan & Operasional</h1>
        <p class="overview-subtitle">Konsolidasi kinerja keuangan 4 unit bisnis PMO UTama</p>
      </div>

      <div class="date-range-pill" title="Tahun Anggaran Berjalan">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cal-icon">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>Tahun Buku FY-2026</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chevron-icon">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </section>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Dashboard Keuangan"
      message="Mengambil ringkasan transaksi dan metrik keuangan..."
    />

    <StateBanner
      v-else-if="errorMsg"
      state="error"
      title="Gagal Memuat Dashboard"
      :message="errorMsg"
      actionLabel="Coba Lagi"
      @action="loadDashboard"
    />

    <div v-else class="dashboard-content-grid">
      <!-- 1. Four Metric KPI Cards -->
      <section class="kpi-metric-row" aria-label="Key Performance Indicators">
        <!-- Hero Card: PMO Royal Navy (Total Pendapatan Faktur) -->
        <article class="metric-card hero-card">
          <div class="metric-card-top">
            <span class="metric-icon-wrap hero-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </span>
            <span class="metric-title">Total Pendapatan Faktur</span>
          </div>
          <div class="metric-number-val money">
            {{ formatRupiah(dashboard?.kpis?.totalInvoicedRevenue || 0) }}
          </div>
          <div class="metric-trend-wrap">
            <span class="trend-text">{{ dashboard?.kpis?.totalOrders || 0 }} pesanan layanan</span>
          </div>
        </article>

        <!-- Pastel Blue Card: Penerimaan Kas Bersih -->
        <article class="metric-card blue-card">
          <div class="metric-card-top">
            <span class="metric-icon-wrap blue-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 10h18M7 15h1m4 0h1m4 0h1"></path>
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              </svg>
            </span>
            <span class="metric-title">Penerimaan Kas Bersih</span>
          </div>
          <div class="metric-number-val dark-num money">
            {{ formatRupiah(dashboard?.kpis?.totalCashReceivedNet || 0) }}
          </div>
          <div class="metric-trend-wrap">
            <span class="trend-text-colored positive">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 7 17 7 17 17"></polyline>
                <line x1="17" y1="7" x2="7" y2="17"></line>
              </svg>
              Arus Kas Masuk
            </span>
            <span class="trend-text">Kasir & Rekening Bank</span>
          </div>
        </article>

        <!-- Pastel Amber Card: Realisasi Beban Operasional -->
        <article class="metric-card amber-card">
          <div class="metric-card-top">
            <span class="metric-icon-wrap amber-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="8" cy="21" r="1"></circle>
                <circle cx="19" cy="21" r="1"></circle>
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
              </svg>
            </span>
            <span class="metric-title">Realisasi Beban Operasional</span>
          </div>
          <div class="metric-number-val dark-num money">
            {{ formatRupiah(dashboard?.kpis?.totalExpenseActual || 0) }}
          </div>
          <div class="metric-trend-wrap">
            <span class="trend-text-colored positive">
              {{ dashboard?.kpis?.realisasiBiayaPercent || 0 }}%
            </span>
            <span class="trend-text">dari plafon anggaran</span>
          </div>
        </article>

        <!-- White Card: Sisa Plafon Anggaran Bebas -->
        <article class="metric-card white-card">
          <div class="metric-card-top">
            <span class="metric-icon-wrap sky-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </span>
            <span class="metric-title">Sisa Plafon Anggaran</span>
          </div>
          <div class="metric-number-val dark-num money">
            {{ formatRupiah(dashboard?.kpis?.availableBudget || 0) }}
          </div>
          <div class="metric-trend-wrap">
            <span class="trend-text-colored positive">
              {{ dashboard?.kpis?.sisaPlafonPercent || 0 }}%
            </span>
            <span class="trend-text">tersedia untuk realisasi</span>
          </div>
        </article>
      </section>

      <!-- 2. Row 2: Orders Overview (Smooth Dual Bezier Curve Chart) & Serapan Anggaran (Donut Radial) -->
      <section class="dashboard-row-grid split-60-40">
        <!-- Orders Overview Card -->
        <article class="poital-card orders-overview-card">
          <div class="card-header-bar">
            <div>
              <h2 class="card-title">Tren Keuangan & Realisasi Kas</h2>
              <span class="card-subtitle">Perbandingan beban operasional vs penerimaan kas (FY-{{ selectedYear }})</span>
            </div>

            <div class="header-controls">
              <!-- View mode switcher: Spline Area vs Bar Chart -->
              <div class="chart-view-toggle">
                <button
                  type="button"
                  class="toggle-btn"
                  :class="{ active: chartViewMode === 'spline' }"
                  title="Tampilan Kurva Area (Spline)"
                  @click="chartViewMode = 'spline'"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                  <span>Kurva</span>
                </button>
                <button
                  type="button"
                  class="toggle-btn"
                  :class="{ active: chartViewMode === 'bars' }"
                  title="Tampilan Batang Komparasi"
                  @click="chartViewMode = 'bars'"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  <span>Batang</span>
                </button>
              </div>

              <!-- Interactive Legend Pills to toggle datasets -->
              <div class="chart-legend-pills">
                <button
                  type="button"
                  class="legend-btn"
                  :class="{ active: activeSeries === 'all' }"
                  @click="activeSeries = 'all'"
                >
                  Semua
                </button>
                <button
                  type="button"
                  class="legend-btn navy"
                  :class="{ active: activeSeries === 'expense' || activeSeries === 'all', dimmed: activeSeries === 'cash' }"
                  @click="activeSeries = activeSeries === 'expense' ? 'all' : 'expense'"
                >
                  <i class="dot navy"></i> Beban Operasional
                </button>
                <button
                  type="button"
                  class="legend-btn emerald"
                  :class="{ active: activeSeries === 'cash' || activeSeries === 'all', dimmed: activeSeries === 'expense' }"
                  @click="activeSeries = activeSeries === 'cash' ? 'all' : 'cash'"
                >
                  <i class="dot emerald"></i> Penerimaan Kas
                </button>
              </div>

              <!-- Year filter dropdown -->
              <div class="custom-select-wrap">
                <select v-model="selectedYear" class="clean-select">
                  <option value="2026">FY-2026</option>
                  <option value="2025">FY-2025</option>
                </select>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="select-chevron">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <!-- Dynamic Interactive Chart Area -->
          <div class="chart-container-area">
            <!-- Dynamic Y-Axis Labels matching grid lines -->
            <div class="y-axis-labels">
              <span v-for="step in yAxisSteps" :key="step.y">{{ step.label }}</span>
            </div>

            <!-- View 1: Dynamic Spline Area Chart with Mouse Tracking -->
            <div
              v-if="chartViewMode === 'spline'"
              class="svg-chart-wrapper"
              @mousemove="onChartMouseMove"
              @mouseleave="onChartMouseLeave"
            >
              <svg viewBox="0 0 680 230" class="smooth-bezier-svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="navyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#034693" stop-opacity="0.30" />
                    <stop offset="100%" stop-color="#034693" stop-opacity="0.0" />
                  </linearGradient>
                  <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#059669" stop-opacity="0.28" />
                    <stop offset="100%" stop-color="#059669" stop-opacity="0.0" />
                  </linearGradient>
                </defs>

                <!-- Dynamic Horizontal Reference Gridlines -->
                <line
                  v-for="step in yAxisSteps"
                  :key="step.y"
                  x1="0"
                  :y1="step.y"
                  x2="680"
                  :y2="step.y"
                  stroke="#e2e8f0"
                  stroke-width="1"
                  stroke-dasharray="3,3"
                />

                <!-- Navy Curve Area & Line (Realisasi Beban) -->
                <g :class="{ 'series-dimmed': activeSeries === 'cash' }">
                  <path :d="expenseArea" fill="url(#navyGrad)" class="chart-area-path" />
                  <path
                    :d="expenseSpline"
                    fill="none"
                    stroke="#034693"
                    stroke-width="2.8"
                    stroke-linecap="round"
                    class="chart-line-path"
                  />
                </g>

                <!-- Emerald Curve Area & Line (Penerimaan Kas) -->
                <g :class="{ 'series-dimmed': activeSeries === 'expense' }">
                  <path :d="cashArea" fill="url(#emeraldGrad)" class="chart-area-path" />
                  <path
                    :d="cashSpline"
                    fill="none"
                    stroke="#059669"
                    stroke-width="2.8"
                    stroke-linecap="round"
                    class="chart-line-path"
                  />
                </g>

                <!-- Active Vertical Guide Line following mouse -->
                <line
                  :x1="currentExpPoint.x"
                  y1="20"
                  :x2="currentExpPoint.x"
                  y2="210"
                  stroke="#475569"
                  stroke-width="1.3"
                  stroke-dasharray="3,3"
                  class="chart-guide-line"
                />

                <!-- Glowing Marker Dots on active month -->
                <!-- Beban Marker -->
                <g v-if="activeSeries !== 'cash'">
                  <circle
                    :cx="currentExpPoint.x"
                    :cy="currentExpPoint.y"
                    r="8"
                    fill="#034693"
                    fill-opacity="0.25"
                    class="marker-halo"
                  />
                  <circle
                    :cx="currentExpPoint.x"
                    :cy="currentExpPoint.y"
                    r="4.5"
                    fill="#034693"
                    stroke="#ffffff"
                    stroke-width="2"
                    class="marker-core"
                  />
                </g>

                <!-- Kas Marker -->
                <g v-if="activeSeries !== 'expense'">
                  <circle
                    :cx="currentCashPoint.x"
                    :cy="currentCashPoint.y"
                    r="8"
                    fill="#059669"
                    fill-opacity="0.25"
                    class="marker-halo"
                  />
                  <circle
                    :cx="currentCashPoint.x"
                    :cy="currentCashPoint.y"
                    r="4.5"
                    fill="#059669"
                    stroke="#ffffff"
                    stroke-width="2"
                    class="marker-core"
                  />
                </g>
              </svg>

              <!-- Dynamic Floating Tooltip Box -->
              <div
                class="chart-tooltip-box enhanced-tooltip"
                :style="tooltipLeftStyle"
              >
                <div class="tooltip-header-row">
                  <span class="tooltip-month">{{ tooltipData.month }} {{ tooltipData.year }}</span>
                  <span class="tooltip-status-pill" :class="tooltipData.hasActivity ? 'active' : 'idle'">
                    {{ tooltipData.hasActivity ? 'Aktif' : 'Nihil' }}
                  </span>
                </div>
                <div class="tooltip-body">
                  <div class="tooltip-item">
                    <span class="dot emerald"></span>
                    <span class="item-label">Kas Masuk:</span>
                    <strong class="item-val">{{ tooltipData.cash }}</strong>
                  </div>
                  <div class="tooltip-item">
                    <span class="dot navy"></span>
                    <span class="item-label">Beban Kas:</span>
                    <strong class="item-val">{{ tooltipData.expense }}</strong>
                  </div>
                  <div class="tooltip-divider"></div>
                  <div class="tooltip-item net-row">
                    <span class="item-label">Arus Kas Bersih:</span>
                    <span
                      class="net-badge"
                      :class="tooltipData.isSurplus ? 'surplus' : 'defisit'"
                    >
                      {{ tooltipData.isSurplus ? '+' : '-' }} {{ tooltipData.netMargin }}
                    </span>
                  </div>
                  <div v-if="tooltipData.hasActivity && Number(activeTrend.expense) > 0" class="coverage-row">
                    <span>Coverage Kas: <strong>{{ tooltipData.ratio }}x beban</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- View 2: Interactive Comparative Bar Chart -->
            <div
              v-else
              class="interactive-bar-view"
              @mouseleave="hoveredMonthIndex = null"
            >
              <div
                v-for="(m, idx) in monthlyTrends"
                :key="m.month"
                class="comp-bar-col"
                :class="{ active: idx === activeTrendIndex }"
                @mouseenter="hoveredMonthIndex = idx"
                @click="selectMonth(idx)"
              >
                <div class="comp-bars-pair">
                  <div
                    v-if="activeSeries !== 'expense'"
                    class="comp-bar emerald-bar"
                    :style="{ height: getBarHeight(idx, 'cash') }"
                    :title="`Kas Masuk: ${formatRupiah(m.cash)}`"
                  ></div>
                  <div
                    v-if="activeSeries !== 'cash'"
                    class="comp-bar navy-bar"
                    :style="{ height: getBarHeight(idx, 'expense') }"
                    :title="`Beban Kas: ${formatRupiah(m.expense)}`"
                  ></div>
                </div>
              </div>
            </div>

            <!-- X-Axis Months with Interactive Clicks & Hover -->
            <div class="x-axis-months interactive-x-axis">
              <button
                v-for="(m, idx) in months"
                :key="m"
                type="button"
                class="month-btn"
                :class="{ active: idx === activeTrendIndex }"
                @mouseenter="hoveredMonthIndex = idx"
                @mouseleave="hoveredMonthIndex = null"
                @click="selectMonth(idx)"
              >
                {{ m }}
              </button>
            </div>
          </div>
        </article>

        <!-- Serapan Anggaran Card (Radial Donut Segmented Ring) -->
        <article class="poital-card sale-analytics-card">
          <div class="card-header-bar">
            <h2 class="card-title">Serapan Anggaran RKAP</h2>
          </div>

          <div class="radial-donut-area">
            <div class="donut-svg-box">
              <svg viewBox="0 0 160 160" class="segmented-donut-svg">
                <!-- Navy Segment (Realisasi Biaya) -->
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="#034693"
                  stroke-width="16"
                  :stroke-dasharray="donutSegments.realisasiDash"
                  stroke-dashoffset="0"
                  stroke-linecap="round"
                />
                <!-- Emerald Segment (Komitmen PO) -->
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="#059669"
                  stroke-width="16"
                  :stroke-dasharray="donutSegments.komitmenDash"
                  :stroke-dashoffset="donutSegments.komitmenOffset"
                  stroke-linecap="round"
                />
                <!-- Gold Segment (Sisa Plafon) -->
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="#F59E0B"
                  stroke-width="16"
                  :stroke-dasharray="donutSegments.sisaDash"
                  :stroke-dashoffset="donutSegments.sisaOffset"
                  stroke-linecap="round"
                />
              </svg>

              <!-- Center Big Percentage -->
              <div class="donut-center-metric">
                <span class="center-number">{{ donutSegments.totalSerapan }}%</span>
                <span class="center-sub">Total terealisasi</span>
              </div>
            </div>

            <!-- Legends Row Below -->
            <div class="donut-legends-list">
              <div class="donut-legend-row">
                <span class="legend-label"><i class="dot navy"></i> Realisasi Biaya</span>
                <span class="legend-val navy-text">{{ donutSegments.realisasi }}%</span>
              </div>
              <div class="donut-legend-row">
                <span class="legend-label"><i class="dot emerald"></i> Komitmen PO</span>
                <span class="legend-val emerald-text">{{ donutSegments.komitmen }}%</span>
              </div>
              <div class="donut-legend-row">
                <span class="legend-label"><i class="dot gold"></i> Sisa Plafon Bebas</span>
                <span class="legend-val gold-text">{{ donutSegments.sisa }}%</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- 3. Row 3: Kinerja 4 Divisi PMO & Analisis Arus Kas Bulanan -->
      <section class="dashboard-row-grid split-40-60">
        <!-- 4 Divisions Performance Card -->
        <article class="poital-card division-card">
          <div class="card-header-bar">
            <div>
              <h2 class="card-title">Kinerja 4 Divisi PMO</h2>
              <span class="card-subtitle">Pendapatan & Serapan per Unit Bisnis</span>
            </div>
          </div>

          <div class="divisions-list">
            <div v-for="unit in divisionPerformance" :key="unit.unitCode" class="division-item-row">
              <div class="division-info">
                <div class="division-name-row">
                  <span class="doc-code">{{ unit.unitCode }}</span>
                  <strong>{{ unit.unitName }}</strong>
                </div>
                <div class="division-progress-track">
                  <div class="division-progress-bar" :style="{ width: `${unit.utilizationPercent ?? 0}%` }"></div>
                </div>
              </div>
              <div class="division-metric-col">
                <span class="div-rev money">{{ formatRupiah(unit.invoicedRevenue) }}</span>
                <span class="div-serapan">{{ unit.utilizationPercent ?? 0 }}% terserap</span>
              </div>
            </div>
          </div>
        </article>

        <!-- Likuiditas Kas & Status Bank -->
        <article class="poital-card cash-status-card">
          <div class="card-header-bar">
            <div>
              <h2 class="card-title">Likuiditas Kas & Rekonsiliasi Bank</h2>
              <span class="card-subtitle">Penerimaan kas masuk dan verifikasi rekening koran</span>
            </div>
            <Button
              label="Buka Rekonsiliasi"
              icon="pi pi-arrow-right"
              iconPos="right"
              size="small"
              severity="secondary"
              outlined
              @click="router.push('/reconciliation')"
            />
          </div>

          <div class="cash-status-grid">
            <div class="cash-stat-block">
              <span class="cash-stat-label">Total Kas Masuk Terverifikasi</span>
              <div class="cash-stat-num money text-emerald">
                {{ formatRupiah(dashboard?.kpis?.totalCashReceivedNet || 0) }}
              </div>
              <span class="cash-stat-hint">Penerimaan faktur & setoran loket</span>
            </div>

            <div class="cash-stat-block">
              <span class="cash-stat-label">Piutang Pelanggan Berjalan</span>
              <div class="cash-stat-num money text-amber">
                {{ formatRupiah(dashboard?.kpis?.totalReceivablesOutstanding || 0) }}
              </div>
              <span class="cash-stat-hint">Menunggu pelunasan termin</span>
            </div>
          </div>

          <div class="bank-recon-strip">
            <div class="recon-stat-item">
              <span class="recon-count text-emerald">{{ dashboard?.reconSummary?.matched || 0 }}</span>
              <span class="recon-label">Mutasi Cocok</span>
            </div>
            <div class="recon-divider"></div>
            <div class="recon-stat-item">
              <span class="recon-count text-amber">{{ dashboard?.reconSummary?.unmatched || 0 }}</span>
              <span class="recon-label">Belum Dicocokkan</span>
            </div>
            <div class="recon-divider"></div>
            <div class="recon-stat-item">
              <span class="recon-count text-purple">{{ dashboard?.reconSummary?.needsReview || 0 }}</span>
              <span class="recon-label">Perlu Review</span>
            </div>
            <div class="recon-divider"></div>
            <div class="recon-stat-item">
              <span class="recon-count">{{ dashboard?.reconSummary?.total || 0 }}</span>
              <span class="recon-label">Total Mutasi</span>
            </div>
          </div>
        </article>
      </section>

      <!-- 4. Row 4: Ringkasan Katalog Layanan & Produk Terlaris -->
      <section class="dashboard-row-grid split-40-60">
        <!-- Service Catalog / Operational Stats Card -->
        <article class="poital-card catalog-stats-card">
          <div class="card-header-bar">
            <div>
              <h2 class="card-title">Status Operasional & Aksi Cepat</h2>
              <span class="card-subtitle">Pintasan navigasi modul transaksi</span>
            </div>
          </div>

          <div class="inventory-stats-row">
            <div class="inv-stat">
              <span class="inv-lbl">Layanan Aktif</span>
              <div class="inv-val-row">
                <strong class="inv-num text-teal">{{ dashboard?.kpis?.activeServicesCount || 8 }} Paket</strong>
                <span class="trend-pill-sm positive">Siap Dijual</span>
              </div>
            </div>
            <div class="inv-stat">
              <span class="inv-lbl">Akun Mitra</span>
              <div class="inv-val-row">
                <strong class="inv-num text-purple">{{ dashboard?.kpis?.totalCustomers || 6 }} Pelanggan</strong>
                <span class="trend-pill-sm positive">Terdaftar</span>
              </div>
            </div>
            <div class="inv-stat">
              <span class="inv-lbl">Antrean Approval</span>
              <div class="inv-val-row">
                <strong class="inv-num text-pink">{{ dashboard?.kpis?.pendingApprovalCount || 0 }} Dokumen</strong>
                <span class="trend-pill-sm" :class="dashboard?.kpis?.pendingApprovalCount > 0 ? 'negative' : 'positive'">
                  {{ dashboard?.kpis?.pendingApprovalCount > 0 ? 'Perlu Review' : 'Lengkap' }}
                </span>
              </div>
            </div>
          </div>

          <div class="quick-nav-actions">
            <button type="button" class="quick-action-btn" @click="router.push('/approvals')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>Antrean Approval</span>
            </button>
            <button type="button" class="quick-action-btn" @click="router.push('/procurement')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span>Pengadaan & PR</span>
            </button>
            <button type="button" class="quick-action-btn" @click="router.push('/revenue')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
              </svg>
              <span>Faktur & Kasir</span>
            </button>
            <button type="button" class="quick-action-btn" @click="router.push('/accounting')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              <span>Buku Besar (CoA)</span>
            </button>
          </div>
        </article>

        <!-- Top Selling Products Table Card (Seeded PMO Services) -->
        <article class="poital-card top-products-card">
          <div class="card-header-bar">
            <div>
              <h2 class="card-title">Layanan Unggulan & Transaksi Teratas</h2>
              <span class="card-subtitle">Katalog jasa komersial unit bisnis</span>
            </div>
            <Button
              label="Buka Katalog"
              icon="pi pi-arrow-right"
              iconPos="right"
              size="small"
              severity="secondary"
              outlined
              @click="router.push('/revenue')"
            />
          </div>

          <div class="products-table-wrap">
            <table class="clean-products-table">
              <thead>
                <tr>
                  <th class="col-prod">Layanan / Produk</th>
                  <th class="col-code">Kode SKU</th>
                  <th class="col-orders">Kategori</th>
                  <th class="col-price text-right">Tarif Dasar</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in displayProducts" :key="item.id">
                  <td class="col-prod">
                    <div class="prod-thumb-row">
                      <div class="prod-avatar-circle" :style="{ backgroundColor: item.color }">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
                          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
                        </svg>
                      </div>
                      <span class="prod-name" :title="item.name">{{ item.name }}</span>
                    </div>
                  </td>
                  <td class="col-code"><span class="doc-code">{{ item.code }}</span></td>
                  <td class="col-orders"><Tag :value="item.category" severity="secondary" rounded /></td>
                  <td class="col-price text-right money">
                    {{ item.unitPrice ? formatRupiah(item.unitPrice) : `${item.orders} transaksi` }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.poital-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Page Header: Overview & Date Pill */
.overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0 6px;
}

.overview-subtitle {
  font-size: 0.84rem;
  color: var(--text-secondary);
  margin-top: 3px;
}

.card-subtitle {
  display: block;
  font-size: 0.74rem;
  color: var(--text-secondary);
  margin-top: 2px;
  font-weight: 400;
}

.page-title {
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  margin: 0;
}

.date-range-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border-radius: 9999px;
  padding: 8px 18px;
  font-size: 0.82rem;
  font-weight: 550;
  color: var(--text-primary);
  box-shadow: 0 2px 10px -2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
}

.cal-icon,
.chevron-icon {
  color: var(--text-secondary);
}

.dashboard-content-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 1. Four Metric KPI Cards */
.kpi-metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}

.metric-card {
  border-radius: 20px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.04);
  transition: transform 140ms ease;
}

.metric-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.metric-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-title {
  font-size: 0.88rem;
  font-weight: 600;
}

.metric-number-val {
  font-size: 1.85rem;
  font-weight: 750;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.metric-trend-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}

.trend-text {
  color: var(--text-secondary);
}

/* Card 1: Hero Deep PMO Royal Navy */
.hero-card {
  background: #0B2144;
  color: #ffffff;
}
.hero-icon {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}
.hero-card .metric-title {
  color: rgba(255, 255, 255, 0.85);
}
.hero-card .trend-text {
  color: rgba(255, 255, 255, 0.7);
}
.trend-badge.positive {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4ade80;
  font-weight: 700;
}

/* Card 2: Pastel Blue */
.blue-card {
  background: #eff6ff;
  color: #034693;
}
.blue-icon {
  background: rgba(3, 70, 147, 0.12);
  color: #034693;
}
.blue-card .dark-num {
  color: #0f172a;
}

/* Card 3: Pastel Amber (PMO Gold) */
.amber-card {
  background: #fef9ed;
  color: #b45309;
}
.amber-icon {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
}
.amber-card .dark-num {
  color: #0f172a;
}

/* Card 4: White Card */
.white-card {
  background: var(--bg-surface);
  color: var(--text-primary);
}
.sky-icon {
  background: #e0f2fe;
  color: #0284c7;
}

.trend-text-colored.positive {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #059669;
  font-weight: 700;
}
.trend-text-colored.negative {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #e11d48;
  font-weight: 700;
}

/* Generic Poital Cards */
.poital-card {
  background: var(--bg-surface);
  border-radius: 20px;
  padding: 22px 24px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.04);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dashboard-row-grid {
  display: grid;
  gap: 18px;
  min-width: 0;
  width: 100%;
}
.dashboard-row-grid > * {
  min-width: 0;
  max-width: 100%;
}
.split-60-40 {
  grid-template-columns: 1.6fr 1fr;
}
.split-40-60 {
  grid-template-columns: 1fr 1.6fr;
}

.card-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.real-data-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 9999px;
  padding: 2px 9px;
  letter-spacing: 0.02em;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
  animation: pulseDot 1.8s infinite;
}

@keyframes pulseDot {
  0% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.7; }
}

.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* View toggle (Spline vs Bar) */
.chart-view-toggle {
  display: inline-flex;
  align-items: center;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 120ms ease;
}

.toggle-btn:hover {
  color: var(--text-primary);
}

.toggle-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Legend pills */
.chart-legend-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.74rem;
  font-weight: 600;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 140ms ease;
}

.legend-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.legend-btn.active {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.legend-btn.dimmed {
  opacity: 0.45;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.dot.navy { background: #034693; }
.dot.emerald { background: #059669; }
.dot.gold { background: #F59E0B; }
.dot.dark-bar { background: #1E3A5F; }
.dot.light-bar { background: #CBD5E1; }

.custom-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.clean-select {
  appearance: none;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px 24px 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.select-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--text-secondary);
}

/* Chart Canvas Area & Axis */
.chart-container-area {
  display: grid;
  grid-template-columns: 48px 1fr;
  grid-template-rows: 1fr auto;
  gap: 8px 12px;
  align-items: stretch;
  min-height: 220px;
}

.y-axis-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 0 16px;
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-family: var(--font-mono, monospace);
  text-align: right;
}

.svg-chart-wrapper {
  position: relative;
  width: 100%;
  height: 190px;
  cursor: crosshair;
}

.smooth-bezier-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.series-dimmed {
  opacity: 0.12;
  transition: opacity 220ms ease;
  pointer-events: none;
}

.chart-area-path,
.chart-line-path {
  transition: opacity 220ms ease;
}

.chart-guide-line {
  pointer-events: none;
  transition: x1 60ms linear, x2 60ms linear;
}

.marker-halo,
.marker-core {
  pointer-events: none;
  transition: cx 60ms linear, cy 60ms linear;
}

/* Enhanced Tooltip */
.chart-tooltip-box.enhanced-tooltip {
  position: absolute;
  top: 8px;
  z-index: 10;
  min-width: 220px;
  max-width: 280px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(197, 186, 251, 0.28);
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  transition: left 60ms linear, transform 80ms ease-out;
}

.tooltip-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 6px;
  margin-bottom: 7px;
}

.tooltip-month {
  font-size: 0.8rem;
  font-weight: 750;
  color: #ffffff;
  letter-spacing: -0.01em;
}

.tooltip-status-pill {
  font-size: 0.64rem;
  padding: 2px 7px;
  border-radius: 9999px;
  font-weight: 700;
  text-transform: uppercase;
}

.tooltip-status-pill.active {
  background: rgba(16, 185, 129, 0.22);
  color: #34d399;
}

.tooltip-status-pill.idle {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tooltip-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74rem;
}

.item-label {
  color: #94a3b8;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.item-val {
  color: #ffffff;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  font-size: 0.76rem;
}

.tooltip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 3px 0;
}

.net-row {
  padding-top: 2px;
}

.net-badge {
  font-size: 0.72rem;
  font-weight: 750;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: var(--font-mono, monospace);
}

.net-badge.surplus {
  background: rgba(16, 185, 129, 0.22);
  color: #4ade80;
}

.net-badge.defisit {
  background: rgba(239, 68, 68, 0.22);
  color: #f87171;
}

.coverage-row {
  font-size: 0.68rem;
  color: #94a3b8;
  margin-top: 2px;
}

.coverage-row strong {
  color: #c5bafb;
}

/* View 2: Comparative Bar Chart */
.interactive-bar-view {
  width: 100%;
  height: 190px;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 6px;
  align-items: end;
  padding: 0 6px 10px;
  border-bottom: 1px dashed var(--border-subtle);
}

.comp-bar-col {
  height: 100%;
  display: flex;
  align-items: end;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  padding: 0 2px;
  transition: background 120ms ease;
}

.comp-bar-col:hover,
.comp-bar-col.active {
  background: rgba(197, 186, 251, 0.1);
}

.comp-bars-pair {
  display: flex;
  align-items: end;
  gap: 3px;
  width: 100%;
  height: 100%;
  justify-content: center;
}

.comp-bar {
  width: 9px;
  min-height: 4px;
  border-radius: 4px 4px 0 0;
  transition: height 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.comp-bar.emerald-bar {
  background: #059669;
}

.comp-bar.navy-bar {
  background: #034693;
}

/* Interactive X-Axis */
.interactive-x-axis {
  grid-column: 2;
  display: flex;
  justify-content: space-between;
  padding-top: 6px;
}

.month-btn {
  background: transparent;
  border: none;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 120ms ease;
}

.month-btn:hover {
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.month-btn.active {
  color: #7c3aed;
  font-weight: 750;
  background: rgba(124, 58, 237, 0.12);
}

/* Donut Radial Chart */
.radial-donut-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 10px 0;
}

.donut-svg-box {
  position: relative;
  width: 150px;
  height: 150px;
}

.segmented-donut-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.donut-center-metric {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.center-number {
  font-size: 1.8rem;
  font-weight: 750;
  letter-spacing: -0.04em;
  color: var(--text-primary);
  line-height: 1;
}

.center-sub {
  font-size: 0.68rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.donut-legends-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 0 8px;
}

.donut-legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
}

.legend-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.legend-val {
  font-weight: 700;
}
.navy-text { color: #034693; }
.emerald-text { color: #059669; }
.gold-text { color: #B45309; }

/* Sales Sparkline Card */
.sales-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding-bottom: 12px;
}

.stat-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-lbl {
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.stat-val {
  font-size: 1.25rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.sparkline-wrapper {
  height: 90px;
  width: 100%;
  margin: 8px 0;
}

.sparkline-svg {
  width: 100%;
  height: 100%;
}

.sales-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  padding-top: 4px;
}

/* Purchase Dual Bar Chart */
.bar-chart-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 190px;
  padding-bottom: 4px;
}

.bar-month-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  height: 100%;
  flex: 1;
}

.bars-pair {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 100%;
}

.bar-col {
  width: 9px;
  border-radius: 4px 4px 0 0;
  transition: height 200ms ease;
}

.bar-col.dark {
  background: #6E7382;
}

.bar-col.light {
  background: #D2D6E2;
}

.bar-col.emerald-bar {
  background: #059669;
}

.bar-col.navy-bar {
  background: #034693;
}

.bar-month-label {
  font-size: 0.68rem;
  color: var(--text-secondary);
}

/* Cash Status & Bank Reconciliation Card */
.cash-status-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.cash-status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 12px 0 16px;
}

.cash-stat-block {
  background: var(--bg-subtle);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cash-stat-label {
  font-size: 0.74rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.cash-stat-num {
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.cash-stat-hint {
  font-size: 0.68rem;
  color: var(--text-secondary);
}

.bank-recon-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-subtle);
  border-radius: 12px;
  padding: 12px 18px;
  gap: 12px;
}

.recon-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.recon-count {
  font-size: 1.2rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.recon-label {
  font-size: 0.68rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.recon-divider {
  width: 1px;
  height: 28px;
  background: var(--border-subtle);
}

/* Quick Navigation Actions */
.quick-nav-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}

.quick-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 140ms ease;
}

.quick-action-btn:hover {
  background: rgba(3, 70, 147, 0.08);
  border-color: #034693;
  color: #034693;
}

/* 4 Divisions Performance Card */
.divisions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.division-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
}

.division-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.division-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
}

.division-progress-track {
  height: 5px;
  background: var(--border-subtle);
  border-radius: 9999px;
  overflow: hidden;
  width: 100%;
}

.division-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #034693, #059669);
  border-radius: 9999px;
  transition: width 300ms ease;
}

.division-metric-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.div-rev {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}

.div-serapan {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

/* Catalog Summary Box */
.catalog-summary-box {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.82rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.text-emerald { color: #059669; }
.text-amber { color: #b45309; }

.category-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-subtle);
  font-size: 0.74rem;
  font-weight: 550;
  color: var(--text-secondary);
}

.col-price {
  font-weight: 700;
  white-space: nowrap;
}

.text-right {
  text-align: right;
}

/* Inventory Management Card */
.inventory-stats-row {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-bottom: 16px;
}

.inv-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inv-lbl {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.inv-val-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inv-num {
  font-size: 1.15rem;
  font-weight: 750;
}
.text-teal { color: #0d9488; }
.text-purple { color: #8B7CF8; }
.text-pink { color: #ec4899; }

.trend-pill-sm {
  font-size: 0.72rem;
  font-weight: 700;
}
.trend-pill-sm.positive { color: #059669; }
.trend-pill-sm.negative { color: #e11d48; }

.inventory-bars-container {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 180px;
  padding-bottom: 4px;
}

.inv-bar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  height: 100%;
  flex: 1;
}

.inv-bar-slot {
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
}

.inactive-column {
  width: 10px;
  height: 80%;
  background: #f1f3f7;
  border-radius: 5px;
}

.active-stacked-column {
  width: 12px;
  height: 85%;
  display: flex;
  flex-direction: column-reverse;
  border-radius: 6px;
  overflow: hidden;
}

.stack-segment.gold-seg {
  height: 30%;
  background: #F59E0B;
}
.stack-segment.emerald-seg {
  height: 25%;
  background: #059669;
}
.stack-segment.navy-seg {
  height: 45%;
  background: #034693;
}

/* Top Selling Products Table */
.products-table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.clean-products-table {
  width: 100%;
  border-collapse: collapse;
}

.clean-products-table th {
  text-align: left;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.clean-products-table td {
  padding: 10px 10px;
  font-size: 0.82rem;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
}

.col-prod {
  min-width: 220px;
}
.col-code {
  width: 120px;
  white-space: nowrap;
}
.col-orders {
  width: 120px;
  white-space: nowrap;
}
.col-price {
  width: 140px;
  white-space: nowrap;
  text-align: right;
  font-weight: 700;
}

.prod-thumb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.prod-avatar-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.prod-name {
  font-weight: 600;
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--text-primary);
  word-break: break-word;
}

.table-pagination-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding-top: 14px;
}

.paging-text {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.paging-btns {
  display: flex;
  align-items: center;
  gap: 6px;
}

.paging-circle-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 120ms ease;
}

.paging-circle-btn.active,
.paging-circle-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/* Responsiveness */
@media (max-width: 1380px) {
  .kpi-metric-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1279px) {
  .split-60-40,
  .split-40-60 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .overview-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .date-range-pill {
    width: 100%;
    justify-content: space-between;
  }

  .kpi-metric-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .metric-card {
    padding: 16px 18px;
    border-radius: 16px;
  }

  .metric-number-val {
    font-size: 1.55rem;
  }

  .poital-card {
    padding: 16px;
    border-radius: 16px;
  }

  .card-header-bar {
    flex-wrap: wrap;
    gap: 10px;
  }

  .header-controls {
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
    justify-content: space-between;
  }

  .inventory-stats-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .inv-stat {
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--bg-subtle);
  }

  .chart-container-area {
    grid-template-columns: 28px 1fr;
    gap: 6px 8px;
  }

  .y-axis-labels {
    font-size: 0.65rem;
  }

  .x-axis-months {
    font-size: 0.65rem;
  }

  .sales-stats-row {
    gap: 8px;
  }

  .stat-val {
    font-size: 1.05rem;
  }

  .clean-products-table {
    min-width: 480px;
  }

  .products-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

@media (max-width: 420px) {
  .x-axis-months {
    letter-spacing: -0.04em;
    font-size: 0.6rem;
  }

  .bar-chart-container {
    gap: 2px;
  }
}
</style>
