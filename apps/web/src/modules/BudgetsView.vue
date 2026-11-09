<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDateTime } from '../utils/format';
import { usePagination } from '../composables/usePagination';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import CurrencyInput from '../components/CurrencyInput.vue';
import CoaCombobox, { type CoaAccountItem } from '../components/CoaCombobox.vue';

// PrimeVue official components
import Drawer from 'primevue/drawer';
import MeterGroup from 'primevue/metergroup';

const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

const budgets = ref<any[]>([]);
const selectedBudget = ref<any>(null);
const isDrawerOpen = ref(false);
const master = ref<any>({ businessUnits: [], costCenters: [], fundSources: [], fiscalPeriods: [], chartOfAccounts: [] });

const statusFilter = ref('');
const unitFilter = ref('ALL');
const searchQuery = ref('');

// Computed filtered budgets based on unit filter
const filteredBudgets = computed(() => {
  let list = budgets.value || [];
  if (unitFilter.value !== 'ALL') {
    list = list.filter(
      (b) => b.businessUnitId === unitFilter.value || b.businessUnit?.code === unitFilter.value
    );
  }
  return list;
});

// Setup Pagination with default 6 rows per page based on filtered list
const {
  currentPage,
  pageSize,
  totalItems,
  paginatedItems: paginatedBudgets,
  resetPage,
} = usePagination(filteredBudgets, 6);

// Master 70 akun operasional PMO resmi untuk CoaCombobox
const officialCoaAccounts = computed<CoaAccountItem[]>(() => {
  return master.value.chartOfAccounts || [];
});

// Helper Semula - Menjadi untuk budget dokumen
function getBudgetSemulaMenjadi(b: any) {
  const lines = b?.lines || [];
  if (lines.length === 0) {
    const total = Number(b?.totalAllocated) || 0;
    return {
      semula: total,
      pergeseran: 0,
      menjadi: total,
      selisih: 0,
    };
  }
  const semula = lines.reduce(
    (sum: number, l: any) => sum + (Number(l.semulaAmount) || Number(l.allocatedAmount) || 0),
    0
  );
  const pergeseran = lines.reduce((sum: number, l: any) => sum + (Number(l.pergeseranAmount) || 0), 0);
  const menjadi = lines.reduce(
    (sum: number, l: any) =>
      sum +
      (Number(l.menjadiAmount) ||
        Number(l.semulaAmount || l.allocatedAmount) + Number(l.pergeseranAmount || 0)),
    0
  );
  return {
    semula: semula > 0 ? semula : (Number(b?.totalAllocated) || 0),
    pergeseran,
    menjadi: menjadi > 0 ? menjadi : (Number(b?.totalAllocated) || 0),
    selisih: semula - menjadi,
  };
}

function formatPergeseran(amount: number) {
  if (!amount || amount === 0) return 'Rp 0';
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${formatRupiah(amount)}`;
}

function formatLineVolume(l: any) {
  const parts: string[] = [];
  if (l.vol1 && Number(l.vol1) > 0) parts.push(`${l.vol1} ${l.satuan1 || ''}`.trim());
  if (l.vol2 && Number(l.vol2) > 0) parts.push(`${l.vol2} ${l.satuan2 || ''}`.trim());
  if (l.vol3 && Number(l.vol3) > 0) parts.push(`${l.vol3} ${l.satuan3 || ''}`.trim());
  if (l.vol4 && Number(l.vol4) > 0) parts.push(`${l.vol4} ${l.satuan4 || ''}`.trim());
  if (parts.length === 0) return '-';
  return parts.join(' × ');
}

function getAccountName(code: string) {
  if (!code) return '';
  const acc = (master.value.chartOfAccounts || []).find((a: any) => a.code === code);
  return acc ? acc.name : '';
}

// Computed status breakdown for interactive filter pills
const statusCounts = computed(() => {
  const list = budgets.value || [];
  return {
    ALL: list.length,
    DRAFT: list.filter((b) => b.status === 'DRAFT').length,
    SUBMITTED: list.filter((b) => b.status === 'SUBMITTED').length,
    APPROVED: list.filter((b) => b.status === 'APPROVED').length,
    REVISED: list.filter((b) => b.status === 'REVISED').length,
    REJECTED: list.filter((b) => b.status === 'REJECTED').length,
  };
});

// Computed KPI Metrics across all loaded budgets
const summaryKpis = computed(() => {
  const list = budgets.value || [];
  const totalAllocated = list.reduce((sum, b) => sum + (Number(b.totalAllocated) || 0), 0);
  const totalAvailable = list.reduce((sum, b) => sum + (Number(b.availableAmount) || 0), 0);
  const totalCommitted = list.reduce((sum, b) => sum + (Number(b.totalCommitted) || 0), 0);
  const totalActual = list.reduce((sum, b) => sum + (Number(b.totalActual) || 0), 0);
  const freePct = totalAllocated > 0 ? Math.round((totalAvailable / totalAllocated) * 100) : 0;
  const committedPct = totalAllocated > 0 ? Math.round((totalCommitted / totalAllocated) * 100) : 0;
  const actualPct = totalAllocated > 0 ? Math.round((totalActual / totalAllocated) * 100) : 0;
  
  return {
    totalAllocated,
    totalAvailable,
    totalCommitted,
    totalActual,
    freePct,
    committedPct,
    actualPct,
  };
});

// Selected Budget Utilization split percentages
const selectedUtilization = computed(() => {
  if (!selectedBudget.value || !selectedBudget.value.totalAllocated) {
    return { actual: 0, committed: 0, free: 100 };
  }
  const total = Number(selectedBudget.value.totalAllocated);
  const actualRaw = (Number(selectedBudget.value.totalActual || 0) / total) * 100;
  const committedRaw = (Number(selectedBudget.value.totalCommitted || 0) / total) * 100;
  const actual = Math.min(100, Math.max(0, actualRaw));
  const committed = Math.min(100 - actual, Math.max(0, committedRaw));
  const free = Math.max(0, 100 - actual - committed);
  return {
    actual: Math.round(actual * 10) / 10,
    committed: Math.round(committed * 10) / 10,
    free: Math.round(free * 10) / 10,
  };
});

// Helper for budget row absorption breakdown
function getBudgetAbsorption(b: any) {
  const total = Number(b.totalAllocated) || 0;
  if (total <= 0) return { actualPct: 0, committedPct: 0, freePct: 100 };
  const actual = Number(b.totalActual) || 0;
  const committed = Number(b.totalCommitted) || 0;
  const actualPct = Math.min(100, Math.round((actual / total) * 100));
  const committedPct = Math.min(100 - actualPct, Math.round((committed / total) * 100));
  const freePct = Math.max(0, 100 - actualPct - committedPct);
  return { actualPct, committedPct, freePct };
}

// PrimeVue MeterGroup formatted items
const meterItems = computed(() => [
  {
    label: `Realisasi Beban (${formatRupiah(selectedBudget.value?.totalActual || 0)})`,
    value: selectedUtilization.value.actual,
    color: '#6366f1',
    icon: 'pi pi-chart-line',
  },
  {
    label: `Komitmen PO (${formatRupiah(selectedBudget.value?.totalCommitted || 0)})`,
    value: selectedUtilization.value.committed,
    color: '#f59e0b',
    icon: 'pi pi-lock',
  },
  {
    label: `Sisa Plafon Bebas (${formatRupiah(selectedBudget.value?.availableAmount || 0)})`,
    value: selectedUtilization.value.free,
    color: '#10b981',
    icon: 'pi pi-check-circle',
  },
]);

// Helper for Unit Chip CSS Class
function getUnitBadgeClass(code?: string) {
  switch (code?.toUpperCase()) {
    case 'BU-ITS': return 'unit-its';
    case 'BU-MICE': return 'unit-mice';
    case 'BU-TCI': return 'unit-tci';
    case 'BU-KLINIK': return 'unit-klinik';
    default: return 'unit-default';
  }
}

// Helper for Financial Category Chip CSS Class
function getCatBadgeClass(category?: string) {
  switch (category?.toUpperCase()) {
    case 'CAPEX': return 'cat-capex';
    case 'OPEX': return 'cat-opex';
    case 'MODAL_KERJA': return 'cat-modal';
    case 'PENGADAAN': return 'cat-pengadaan';
    case 'PEGAWAI': return 'cat-pegawai';
    case 'PAJAK': return 'cat-pajak';
    default: return 'cat-default';
  }
}

// Helper for mini line bar utilization
function getLineUtilizationPct(line: any) {
  const alloc = Number(line.allocatedAmount) || 0;
  if (alloc <= 0) return 0;
  const used = (Number(line.actualAmount) || 0) + (Number(line.committedAmount) || 0);
  return Math.min(100, Math.round((used / alloc) * 100));
}

function openBudgetDetail(b: any) {
  selectedBudget.value = b;
  isDrawerOpen.value = true;
}

function setStatusFilter(status: string) {
  statusFilter.value = status;
  loadMasterAndBudgets();
}

function clearSearch() {
  searchQuery.value = '';
  loadMasterAndBudgets();
}

// Create Budget Modal Form
const createOpen = ref(false);
const createForm = ref({
  title: '',
  businessUnitId: '',
  fiscalPeriodId: '',
  fundSourceId: '',
  revenueTarget: 0,
  notes: '',
  lines: [
    {
      costCenterId: '',
      accountCode: '',
      category: 'OPEX',
      subActivity: '',
      description: '',
      detailDescription: '',
      useMultiVolume: false,
      vol1: 1,
      satuan1: 'Bulan',
      vol2: 1,
      satuan2: 'Kegiatan',
      vol3: 1,
      satuan3: '',
      vol4: 1,
      satuan4: '',
      unitPrice: 0,
      allocatedAmount: 0,
    },
  ],
});

// Live calculated total for create modal
const createTotalAllocated = computed(() => {
  return createForm.value.lines.reduce((sum, l) => sum + (Number(l.allocatedAmount) || 0), 0);
});

// Helper auto-calculate row allocatedAmount from 4-level volume
function updateLineAmountFromVolume(line: any) {
  if (!line.useMultiVolume) return;
  const v1 = Number(line.vol1) || 1;
  const v2 = Number(line.vol2) || 1;
  const v3 = Number(line.vol3) || 1;
  const v4 = Number(line.vol4) || 1;
  const price = Number(line.unitPrice) || 0;
  line.allocatedAmount = v1 * v2 * v3 * v4 * price;
}

// Revise Budget Modal
const reviseOpen = ref(false);
const reviseReason = ref('');
interface ReviseLineItem {
  lineId: string;
  description: string;
  accountCode: string;
  semula: number;
  pergeseran: number;
  newAllocatedAmount: number;
}
const reviseLines = ref<ReviseLineItem[]>([]);

function onReviseShiftChange(rl: ReviseLineItem) {
  rl.newAllocatedAmount = Number(rl.semula || 0) + Number(rl.pergeseran || 0);
}

function onReviseMenjadiChange(rl: ReviseLineItem) {
  rl.pergeseran = Number(rl.newAllocatedAmount || 0) - Number(rl.semula || 0);
}

// Live summary calculation for revise modal
const reviseSummary = computed(() => {
  const totalSemula = reviseLines.value.reduce((sum, l) => sum + (Number(l.semula) || 0), 0);
  const totalPergeseran = reviseLines.value.reduce((sum, l) => sum + (Number(l.pergeseran) || 0), 0);
  const totalMenjadi = reviseLines.value.reduce((sum, l) => sum + (Number(l.newAllocatedAmount) || 0), 0);
  return {
    totalSemula,
    totalPergeseran,
    totalMenjadi,
  };
});

const reviseTotalAllocated = computed(() => reviseSummary.value.totalMenjadi);

async function loadMasterAndBudgets() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams();
    if (auth.selectedBusinessUnitId) params.set('businessUnitId', auth.selectedBusinessUnitId);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());

    const [mRes, bRes] = await Promise.all([
      apiFetch('/master/overview'),
      apiFetch(`/budgets?${params.toString()}`),
    ]);
    master.value = mRes.data;
    budgets.value = bRes.data || [];
    resetPage();

    if (budgets.value.length > 0 && !selectedBudget.value) {
      selectedBudget.value = budgets.value[0];
    } else if (selectedBudget.value) {
      selectedBudget.value = budgets.value.find((b) => b.id === selectedBudget.value.id) || budgets.value[0] || null;
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data anggaran.';
  } finally {
    loading.value = false;
  }
}

const isSubmitting = ref(false);
const modalError = ref('');
const successNotification = ref<{
  show: boolean;
  title: string;
  docNumber: string;
  amount: number;
  unitName: string;
} | null>(null);

const availableCostCenters = computed(() => {
  if (!createForm.value.businessUnitId) return master.value.costCenters || [];
  const filtered = (master.value.costCenters || []).filter(
    (c: any) => c.businessUnitId === createForm.value.businessUnitId
  );
  return filtered.length > 0 ? filtered : (master.value.costCenters || []);
});

watch(
  () => createForm.value.businessUnitId,
  (newUnitId) => {
    if (!newUnitId) return;
    const filtered = (master.value.costCenters || []).filter((c: any) => c.businessUnitId === newUnitId);
    const defaultCc = filtered[0]?.id || master.value.costCenters[0]?.id || '';
    createForm.value.lines.forEach((line: any) => {
      const isValid = filtered.some((c: any) => c.id === line.costCenterId);
      if (!isValid && defaultCc) {
        line.costCenterId = defaultCc;
      }
    });
  }
);

function openCreateBudget() {
  modalError.value = '';
  isSubmitting.value = false;
  const defaultUnit = (auth.user?.roleCode === 'UNIT_MANAGER' && auth.user?.businessUnitId)
    ? auth.user.businessUnitId
    : (auth.selectedBusinessUnitId || master.value.businessUnits[0]?.id || '');
  const defaultPeriod = master.value.fiscalPeriods.find((p: any) => !p.isClosed)?.id || '';
  const defaultFund = master.value.fundSources[0]?.id || '';
  const unitCcs = (master.value.costCenters || []).filter((c: any) => c.businessUnitId === defaultUnit);
  const defaultCc = unitCcs[0]?.id || master.value.costCenters[0]?.id || '';

  createForm.value = {
    title: '',
    businessUnitId: defaultUnit,
    fiscalPeriodId: defaultPeriod,
    fundSourceId: defaultFund,
    revenueTarget: 0,
    notes: '',
    lines: [
      {
        costCenterId: defaultCc,
        accountCode: '',
        category: 'OPEX',
        subActivity: '',
        description: '',
        detailDescription: '',
        useMultiVolume: false,
        vol1: 1,
        satuan1: 'Bulan',
        vol2: 1,
        satuan2: 'Kegiatan',
        vol3: 1,
        satuan3: '',
        vol4: 1,
        satuan4: '',
        unitPrice: 0,
        allocatedAmount: 0,
      },
    ],
  };
  createOpen.value = true;
}

function addBudgetLineRow() {
  const filtered = (master.value.costCenters || []).filter(
    (c: any) => c.businessUnitId === createForm.value.businessUnitId
  );
  const defaultCc = filtered[0]?.id || master.value.costCenters[0]?.id || '';
  createForm.value.lines.push({
    costCenterId: defaultCc,
    accountCode: '',
    category: 'OPEX',
    subActivity: '',
    description: '',
    detailDescription: '',
    useMultiVolume: false,
    vol1: 1,
    satuan1: 'Bulan',
    vol2: 1,
    satuan2: 'Kegiatan',
    vol3: 1,
    satuan3: '',
    vol4: 1,
    satuan4: '',
    unitPrice: 0,
    allocatedAmount: 0,
  });
}

function removeBudgetLineRow(idx: number) {
  if (createForm.value.lines.length > 1) {
    createForm.value.lines.splice(idx, 1);
  }
}

async function submitCreateBudget() {
  modalError.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';
  isSubmitting.value = true;
  try {
    const payload = {
      ...createForm.value,
      lines: createForm.value.lines.map((l) => ({
        costCenterId: l.costCenterId,
        accountCode: l.accountCode,
        category: l.category,
        description: l.description,
        subActivity: l.subActivity?.trim() || undefined,
        detailDescription: l.detailDescription?.trim() || undefined,
        vol1: Number(l.vol1 || 1),
        satuan1: l.satuan1?.trim() || undefined,
        vol2: Number(l.vol2 || 1),
        satuan2: l.satuan2?.trim() || undefined,
        vol3: Number(l.vol3 || 1),
        satuan3: l.satuan3?.trim() || undefined,
        vol4: Number(l.vol4 || 1),
        satuan4: l.satuan4?.trim() || undefined,
        unitPrice: Number(l.unitPrice || 0),
        semulaAmount: Number(l.allocatedAmount),
        pergeseranAmount: 0,
        menjadiAmount: Number(l.allocatedAmount),
        allocatedAmount: Number(l.allocatedAmount),
      })),
    };

    const res = await apiFetch('/budgets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    createOpen.value = false;

    successNotification.value = {
      show: true,
      title: 'Draft Anggaran Berhasil Dibuat!',
      docNumber: res.data.docNumber,
      amount: Number(res.data.totalAllocated) || 0,
      unitName: res.data.businessUnit?.name || 'Unit Bisnis PMO',
    };

    feedbackMsg.value = `Draft anggaran ${res.data.docNumber} berhasil dibuat.`;
    await loadMasterAndBudgets();
    selectedBudget.value = res.data;
  } catch (err: any) {
    modalError.value = err.message || 'Gagal menyimpan anggaran.';
  } finally {
    isSubmitting.value = false;
  }
}

async function submitForApproval(budget: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/budgets/${budget.id}/submit`, { method: 'POST' });
    feedbackMsg.value = `Anggaran ${res.data.docNumber} berhasil diajukan untuk persetujuan.`;
    await loadMasterAndBudgets();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengajukan anggaran.';
  }
}

async function approveBudget(budget: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/budgets/${budget.id}/approve`, { method: 'POST' });
    feedbackMsg.value = `Anggaran ${res.data.docNumber} telah disetujui dan siap digunakan untuk pengadaan/pengeluaran.`;
    await loadMasterAndBudgets();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyetujui anggaran.';
  }
}

function openReviseModal(budget: any) {
  reviseReason.value = '';
  reviseLines.value = (budget.lines || []).map((l: any) => {
    const semula = Number(l.semulaAmount) || Number(l.allocatedAmount) || 0;
    const pergeseran = Number(l.pergeseranAmount) || 0;
    const menjadi = Number(l.menjadiAmount) || semula + pergeseran;
    return {
      lineId: l.id,
      description: l.description,
      accountCode: l.accountCode,
      semula,
      pergeseran,
      newAllocatedAmount: menjadi,
    };
  });
  reviseOpen.value = true;
}

async function submitRevision() {
  if (!selectedBudget.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/budgets/${selectedBudget.value.id}/revise`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reviseReason.value,
        lineUpdates: reviseLines.value.map((l) => ({
          lineId: l.lineId,
          newAllocatedAmount: Number(l.newAllocatedAmount),
          pergeseranAmount: Number(l.pergeseran),
          alasanRevisi: reviseReason.value,
        })),
      }),
    });
    reviseOpen.value = false;
    feedbackMsg.value = `Revisi anggaran ${res.data.docNumber} (Versi ${res.data.version}) berhasil disimpan beserta snapshot versi sebelumnya.`;
    await loadMasterAndBudgets();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyimpan revisi anggaran.';
  }
}

watch(() => auth.selectedBusinessUnitId, loadMasterAndBudgets);
onMounted(loadMasterAndBudgets);
</script>

<template>
  <div class="feature-page-container animate-fade-in">
    <!-- Top Action Bar (Clean Header + Floating Pill Buttons) -->
    <header class="feature-header-card">
      <div class="header-left-col">
        <div class="breadcrumb-chip">
          <span class="chip-dot"></span>
          <span>Perencanaan & Alokasi Modal</span>
        </div>
        <h1 class="feature-main-heading">Perencanaan Anggaran & Plafon Belanja</h1>
        <p class="feature-sub-heading">
          Kelola alokasi dana RKAP per unit bisnis, kontrol sisa plafon likuiditas, dan lacak komitmen pengadaan.
        </p>
      </div>

      <div class="header-right-actions">
        <button
          type="button"
          class="pill-btn pill-btn-ghost"
          :disabled="loading"
          @click="loadMasterAndBudgets"
          title="Muat ulang data anggaran"
        >
          <i class="pi pi-refresh" :class="{ 'pi-spin': loading }"></i>
          <span>Muat Ulang</span>
        </button>

        <button
          v-if="auth.hasPermission('budget:create')"
          type="button"
          class="pill-btn pill-btn-primary"
          @click="openCreateBudget"
        >
          <i class="pi pi-plus"></i>
          <span>Buat Draft Anggaran Baru</span>
        </button>
      </div>
    </header>

    <!-- Feedback Banners -->
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
      title="Peringatan Kontrol Anggaran"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <!-- 4 Pastel Stat Cards (Pure Screenshot Aesthetic: Soft Pastel Icon Boxes + Bold Typography) -->
    <section class="pastel-kpi-grid" aria-label="Ringkasan Plafon Anggaran">
      <!-- 1. Total Plafon RKAP (Warm Amber Box $) -->
      <div class="pastel-stat-card">
        <div class="pastel-icon-box box-amber">
          <span class="icon-dollar">$</span>
        </div>
        <div class="stat-meta">
          <div class="stat-number">{{ formatRupiah(summaryKpis.totalAllocated) }}</div>
          <div class="stat-title">Total Plafon RKAP</div>
          <div class="stat-badge-info badge-amber-sub">
            <span>{{ budgets.length }} Dokumen Terdaftar</span>
          </div>
        </div>
      </div>

      <!-- 2. Sisa Plafon Bebas (Cyan Box Credit Card) -->
      <div class="pastel-stat-card focal-card">
        <div class="pastel-icon-box box-cyan">
          <i class="pi pi-credit-card"></i>
        </div>
        <div class="stat-meta">
          <div class="stat-number text-emerald">{{ formatRupiah(summaryKpis.totalAvailable) }}</div>
          <div class="stat-title">Sisa Plafon Bebas (Available)</div>
          <div class="stat-badge-info badge-cyan-sub">
            <i class="pi pi-check text-xs"></i>
            <span>{{ summaryKpis.freePct }}% Kapasitas Siap Belanja</span>
          </div>
        </div>
      </div>

      <!-- 3. Komitmen PO Terikat (Rose Box Lock / Payable) -->
      <div class="pastel-stat-card">
        <div class="pastel-icon-box box-rose">
          <i class="pi pi-lock"></i>
        </div>
        <div class="stat-meta">
          <div class="stat-number">{{ formatRupiah(summaryKpis.totalCommitted) }}</div>
          <div class="stat-title">Komitmen PO Terikat</div>
          <div class="stat-badge-info badge-rose-sub">
            <span>{{ summaryKpis.committedPct }}% Terkunci Vendor</span>
          </div>
        </div>
      </div>

      <!-- 4. Realisasi Beban Aktual (Lilac Box Arrow / Expense) -->
      <div class="pastel-stat-card">
        <div class="pastel-icon-box box-lilac">
          <i class="pi pi-arrow-up-right"></i>
        </div>
        <div class="stat-meta">
          <div class="stat-number">{{ formatRupiah(summaryKpis.totalActual) }}</div>
          <div class="stat-title">Realisasi Beban Aktual</div>
          <div class="stat-badge-info badge-lilac-sub">
            <span>{{ summaryKpis.actualPct }}% Beban Terverifikasi</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Filter & Search Toolbar (Floating White Card with Pill Tabs) -->
    <section class="toolbar-pill-card">
      <!-- Row 1: Unit Bisnis Filter Pills -->
      <div class="toolbar-unit-filter-row">
        <span class="toolbar-unit-label">
          <i class="pi pi-building text-xs"></i>
          <span>Unit Bisnis:</span>
        </span>
        <div class="toolbar-pill-group">
          <button
            type="button"
            class="filter-pill-btn filter-pill-unit"
            :class="{ active: unitFilter === 'ALL' }"
            @click="unitFilter = 'ALL'"
          >
            <span>Semua Unit</span>
          </button>

          <button
            v-for="u in master.businessUnits"
            :key="u.id"
            type="button"
            class="filter-pill-btn filter-pill-unit"
            :class="{ active: unitFilter === u.id || unitFilter === u.code }"
            @click="unitFilter = u.id"
          >
            <span>{{ u.code }}</span>
          </button>
        </div>
      </div>

      <!-- Row 2: Status Pills + Search Field -->
      <div class="toolbar-status-search-row">
        <div class="toolbar-pill-group">
          <button
            type="button"
            class="filter-pill-btn"
            :class="{ active: statusFilter === '' }"
            @click="setStatusFilter('')"
          >
            <span>Semua Status</span>
            <span class="pill-badge">{{ statusCounts.ALL }}</span>
          </button>

          <button
            type="button"
            class="filter-pill-btn"
            :class="{ active: statusFilter === 'APPROVED' }"
            @click="setStatusFilter('APPROVED')"
          >
            <span class="status-dot dot-approved"></span>
            <span>Disetujui</span>
            <span class="pill-badge">{{ statusCounts.APPROVED }}</span>
          </button>

          <button
            type="button"
            class="filter-pill-btn"
            :class="{ active: statusFilter === 'SUBMITTED' }"
            @click="setStatusFilter('SUBMITTED')"
          >
            <span class="status-dot dot-submitted"></span>
            <span>Menunggu Approval</span>
            <span class="pill-badge">{{ statusCounts.SUBMITTED }}</span>
          </button>

          <button
            type="button"
            class="filter-pill-btn"
            :class="{ active: statusFilter === 'DRAFT' }"
            @click="setStatusFilter('DRAFT')"
          >
            <span class="status-dot dot-draft"></span>
            <span>Draft</span>
            <span class="pill-badge">{{ statusCounts.DRAFT }}</span>
          </button>

          <button
            type="button"
            class="filter-pill-btn"
            :class="{ active: statusFilter === 'REVISED' }"
            @click="setStatusFilter('REVISED')"
          >
            <span class="status-dot dot-revised"></span>
            <span>Direvisi</span>
            <span class="pill-badge">{{ statusCounts.REVISED }}</span>
          </button>
        </div>

        <!-- Search Field with Pill Input -->
        <div class="toolbar-search-wrap">
          <i class="pi pi-search search-lens-ico"></i>
          <input
            id="bdg-search"
            v-model="searchQuery"
            type="text"
            class="search-pill-input"
            placeholder="Cari nomor dokumen / judul..."
            @keyup.enter="loadMasterAndBudgets"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="search-clear-btn"
            title="Hapus filter pencarian"
            @click="clearSearch"
          >
            <i class="pi pi-times"></i>
          </button>
        </div>
      </div>
    </section>

    <!-- Main Data Table: Aesthetic Pure White Card Container -->
    <section class="main-table-card">
      <div class="table-card-top">
        <div class="table-top-left">
          <h2 class="table-card-title">Daftar Dokumen Anggaran RKAP (Semula - Menjadi)</h2>
          <span class="table-card-count">{{ filteredBudgets.length }} dari {{ budgets.length }} Dokumen Terdaftar</span>
        </div>
        <div class="table-card-legend">
          <span class="legend-unit"><span class="legend-color-dot dot-lilac"></span> Realisasi</span>
          <span class="legend-unit"><span class="legend-color-dot dot-amber"></span> Komitmen PO</span>
          <span class="legend-unit"><span class="legend-color-dot dot-emerald"></span> Sisa Bebas</span>
        </div>
      </div>

      <!-- State Banners -->
      <StateBanner
        v-if="loading"
        state="loading"
        title="Memuat Dokumen Anggaran"
        message="Mengambil rincian mata anggaran, alokasi plafon Semula-Menjadi, komitmen aktif, dan histori versi..."
      />

      <StateBanner
        v-else-if="filteredBudgets.length === 0"
        state="empty"
        title="Belum Ada Dokumen Anggaran"
        message="Tidak ada dokumen anggaran yang cocok dengan filter aktif. Coba ubah kata kunci atau buat draft anggaran baru."
        actionLabel="Buat Draft Anggaran"
        @action="openCreateBudget"
      />

      <!-- Full-Width Data Table (Format Semula - Menjadi) -->
      <div v-else class="table-scroll-container">
        <table class="aesthetic-data-table">
          <thead>
            <tr>
              <th style="min-width: 150px;">Nomor & Unit</th>
              <th style="min-width: 220px;">Judul Anggaran</th>
              <th class="money-col" style="min-width: 140px;">Pagu Semula</th>
              <th class="money-col" style="min-width: 130px; text-align: center;">Pergeseran (+/-)</th>
              <th class="money-col" style="min-width: 150px;">Pagu Menjadi</th>
              <th class="money-col" style="min-width: 130px;">Realisasi</th>
              <th class="money-col" style="min-width: 130px;">Sisa Bebas</th>
              <th style="min-width: 110px; text-align: center;">Status</th>
              <th style="min-width: 70px; text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in paginatedBudgets"
              :key="b.id"
              class="table-row-item"
              :class="{ 'row-active-item': selectedBudget?.id === b.id }"
              @click="openBudgetDetail(b)"
            >
              <!-- 1. Nomor Dokumen & Unit -->
              <td>
                <div class="cell-doc-col">
                  <span class="doc-code-pill font-mono">{{ b.docNumber }}</span>
                  <div class="doc-tags-row">
                    <span class="unit-badge-pill" :class="getUnitBadgeClass(b.businessUnit?.code)">
                      {{ b.businessUnit?.code || 'BU' }}
                    </span>
                    <span class="version-badge-pill">v{{ b.version }}</span>
                  </div>
                </div>
              </td>

              <!-- 2. Judul & Parameter -->
              <td>
                <div class="cell-title-col">
                  <span class="budget-title-link">{{ b.title }}</span>
                  <div class="budget-sub-params">
                    <span class="param-tag">{{ b.fiscalPeriod?.name || 'FY2026' }}</span>
                    <span class="param-divider">&bull;</span>
                    <span class="param-tag">{{ b.fundSource?.name || 'Kas Operasional' }}</span>
                  </div>
                </div>
              </td>

              <!-- 3. Pagu Semula -->
              <td class="money-col">
                <div class="amount-number-bold font-mono tabular-nums">
                  {{ formatRupiah(getBudgetSemulaMenjadi(b).semula) }}
                </div>
              </td>

              <!-- 4. Pergeseran (+/-) -->
              <td class="money-col" style="text-align: center;">
                <span
                  class="shift-pill font-mono tabular-nums"
                  :class="{
                    'shift-plus': getBudgetSemulaMenjadi(b).pergeseran > 0,
                    'shift-minus': getBudgetSemulaMenjadi(b).pergeseran < 0,
                    'shift-zero': getBudgetSemulaMenjadi(b).pergeseran === 0
                  }"
                >
                  {{ formatPergeseran(getBudgetSemulaMenjadi(b).pergeseran) }}
                </span>
              </td>

              <!-- 5. Pagu Menjadi -->
              <td class="money-col">
                <div class="amount-number-bold font-mono tabular-nums text-blue-700">
                  {{ formatRupiah(getBudgetSemulaMenjadi(b).menjadi) }}
                </div>
                <div class="amount-target-sub font-mono tabular-nums">Rev: {{ formatRupiah(b.revenueTarget || 0) }}</div>
              </td>

              <!-- 6. Realisasi Beban -->
              <td class="money-col">
                <div class="amount-number-bold font-mono tabular-nums text-violet">
                  {{ formatRupiah(b.totalActual || 0) }}
                </div>
                <div class="amount-target-sub font-mono tabular-nums">PO: {{ formatRupiah(b.totalCommitted || 0) }}</div>
              </td>

              <!-- 7. Sisa Bebas -->
              <td class="money-col">
                <div class="amount-number-emerald font-mono tabular-nums">{{ formatRupiah(b.availableAmount) }}</div>
                <div class="amount-percent-emerald">
                  <i class="pi pi-check text-xs"></i>
                  {{ b.totalAllocated > 0 ? Math.round(((b.availableAmount || 0) / b.totalAllocated) * 100) : 0 }}% sisa
                </div>
              </td>

              <!-- 8. Status -->
              <td style="text-align: center;">
                <StatusBadge :status="b.status" />
              </td>

              <!-- 9. Action Button -->
              <td style="text-align: center;">
                <button
                  type="button"
                  class="action-detail-pill"
                  title="Buka rincian lengkap pos anggaran"
                  @click.stop="openBudgetDetail(b)"
                >
                  <i class="pi pi-arrow-right"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="table-pagination-footer">
        <PaginationControl
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalItems="totalItems"
          :pageSizeOptions="[6, 12, 24]"
          itemLabel="dokumen anggaran"
        />
      </div>
    </section>

    <!-- PRIMEVUE DRAWER: SLIDE-OVER DETAIL SHEET -->
    <Drawer
      v-model:visible="isDrawerOpen"
      position="right"
      :style="{ width: '840px', maxWidth: '96vw' }"
      class="budget-detail-drawer"
    >
      <template #header>
        <div v-if="selectedBudget" class="drawer-header-content">
          <div class="drawer-header-meta">
            <span class="doc-code-pill font-mono">{{ selectedBudget.docNumber }}</span>
            <span class="version-badge-pill">Versi {{ selectedBudget.version }}</span>
            <span class="unit-badge-pill" :class="getUnitBadgeClass(selectedBudget.businessUnit?.code)">
              {{ selectedBudget.businessUnit?.code }} - {{ selectedBudget.businessUnit?.name }}
            </span>
            <StatusBadge :status="selectedBudget.status" />
          </div>
        </div>
      </template>

      <div v-if="selectedBudget" class="drawer-inner-content">
        <!-- Title & Executive Action Bar -->
        <div class="drawer-hero-card">
          <div class="drawer-hero-info">
            <h2 class="drawer-title">{{ selectedBudget.title }}</h2>
            <div class="drawer-meta-list">
              <span class="meta-item">
                <i class="pi pi-user text-xs"></i>
                Dibuat oleh: <strong>{{ selectedBudget.createdByName }}</strong>
              </span>
              <span class="meta-item">
                <i class="pi pi-database text-xs"></i>
                Sumber: <strong>{{ selectedBudget.fundSource?.name }}</strong>
              </span>
              <span class="meta-item">
                <i class="pi pi-calendar text-xs"></i>
                Periode: <strong>{{ selectedBudget.fiscalPeriod?.name }}</strong>
              </span>
            </div>
          </div>

          <!-- Action Buttons Bar -->
          <div class="drawer-actions-bar">
            <button
              v-if="['DRAFT', 'REJECTED'].includes(selectedBudget.status) && auth.hasPermission('budget:submit')"
              type="button"
              class="btn-drawer-action btn-drawer-primary"
              @click="submitForApproval(selectedBudget)"
            >
              <i class="pi pi-send"></i>
              <span>Ajukan Persetujuan</span>
            </button>

            <button
              v-if="selectedBudget.status === 'SUBMITTED' && auth.hasPermission('budget:approve')"
              type="button"
              class="btn-drawer-action btn-drawer-success"
              @click="approveBudget(selectedBudget)"
            >
              <i class="pi pi-check"></i>
              <span>Setujui Anggaran</span>
            </button>

            <button
              v-if="['APPROVED', 'REVISED'].includes(selectedBudget.status) && auth.hasPermission('budget:approve')"
              type="button"
              class="btn-drawer-action btn-drawer-warn"
              @click="openReviseModal(selectedBudget)"
            >
              <i class="pi pi-pencil"></i>
              <span>Buat Revisi Plafon</span>
            </button>
          </div>
        </div>

        <!-- MeterGroup: Multi-Segment Visual Utilization -->
        <div class="drawer-meter-card">
          <div class="meter-card-header">
            <div class="meter-title-wrap">
              <i class="pi pi-sliders-h text-primary"></i>
              <strong>Dekomposisi Serapan Plafon Anggaran</strong>
            </div>
            <span class="meter-total-stat">
              {{ Math.round((selectedUtilization.actual + selectedUtilization.committed) * 10) / 10 }}% Total Terikat
            </span>
          </div>
          <MeterGroup :value="meterItems" />
        </div>

        <!-- 4 Metric Cards in 2x2 Grid (Semula, Pergeseran, Menjadi, Sisa) -->
        <div class="drawer-kpi-grid">
          <div class="card-kpi-box box-amber-subtle">
            <span class="box-label">Pagu Semula</span>
            <div class="box-value text-blue tabular-nums font-mono">
              {{ formatRupiah(getBudgetSemulaMenjadi(selectedBudget).semula) }}
            </div>
            <span class="box-sub">Target Rev: {{ formatRupiah(selectedBudget.revenueTarget) }}</span>
          </div>

          <div class="card-kpi-box box-rose-subtle">
            <span class="box-label">Total Pergeseran (+/-)</span>
            <div
              class="box-value tabular-nums font-mono font-bold"
              :class="getBudgetSemulaMenjadi(selectedBudget).pergeseran >= 0 ? 'text-emerald' : 'text-rose'"
            >
              {{ formatPergeseran(getBudgetSemulaMenjadi(selectedBudget).pergeseran) }}
            </div>
            <span class="box-sub">Komitmen PO: {{ formatRupiah(selectedBudget.totalCommitted) }}</span>
          </div>

          <div class="card-kpi-box box-lilac-subtle">
            <span class="box-label">Pagu Menjadi (Plafon Aktif)</span>
            <div class="box-value text-blue-700 tabular-nums font-mono font-bold">
              {{ formatRupiah(getBudgetSemulaMenjadi(selectedBudget).menjadi) }}
            </div>
            <span class="box-sub">Realisasi Beban: {{ formatRupiah(selectedBudget.totalActual) }}</span>
          </div>

          <div class="card-kpi-box box-cyan-subtle focal">
            <span class="box-label">Sisa Plafon Bebas (Available)</span>
            <div class="box-value text-emerald tabular-nums font-mono font-bold">
              {{ formatRupiah(selectedBudget.availableAmount) }}
            </div>
            <span class="box-sub text-emerald font-semibold">{{ selectedUtilization.free }}% Siap Digunakan</span>
          </div>
        </div>

        <!-- Budget Lines Section (Format Semula - Menjadi & 4 Volume) -->
        <div class="drawer-section">
          <div class="section-header-custom">
            <div class="section-title-wrap">
              <i class="pi pi-list text-primary"></i>
              <h3>Rincian Pos Anggaran Semula - Menjadi ({{ selectedBudget.lines?.length || 0 }} Pos Terdaftar)</h3>
            </div>
          </div>

          <div class="table-wrap">
            <table class="erp-table line-items-table">
              <thead>
                <tr>
                  <th style="min-width: 40px; text-align: center;">No</th>
                  <th style="min-width: 140px;">Cost Center & Sub Kegiatan</th>
                  <th style="min-width: 220px;">COA & Uraian Pekerjaan</th>
                  <th style="min-width: 160px;">Volume & Tarif</th>
                  <th class="money-col" style="min-width: 120px;">Pagu Semula</th>
                  <th class="money-col" style="min-width: 110px; text-align: center;">Pergeseran</th>
                  <th class="money-col" style="min-width: 120px;">Pagu Menjadi</th>
                  <th class="money-col" style="min-width: 110px;">Realisasi</th>
                  <th class="money-col" style="min-width: 110px;">Sisa Bebas</th>
                  <th style="min-width: 80px; text-align: center;">Serapan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, idx) in selectedBudget.lines" :key="line.id">
                  <td style="text-align: center;" class="text-slate-400 font-mono text-xs">{{ idx + 1 }}</td>
                  <td>
                    <span class="doc-code-pill font-mono">{{ line.costCenter?.code }}</span>
                    <div v-if="line.subActivity" class="text-xs font-semibold text-slate-700 mt-1">
                      {{ line.subActivity }}
                    </div>
                  </td>
                  <td>
                    <div class="line-coa-badge">
                      <span class="doc-code-pill font-mono">{{ line.accountCode }}</span>
                      <span v-if="getAccountName(line.accountCode)" class="text-xs text-slate-700 font-medium ml-1">
                        {{ getAccountName(line.accountCode) }}
                      </span>
                    </div>
                    <div class="line-desc-text mt-1 font-medium">{{ line.description }}</div>
                    <div v-if="line.detailDescription" class="text-xs text-slate-400 italic">
                      {{ line.detailDescription }}
                    </div>
                  </td>
                  <td>
                    <div class="volume-calc-pill font-mono text-xs">
                      {{ formatLineVolume(line) }}
                    </div>
                    <div v-if="line.unitPrice" class="text-xs text-slate-500 tabular-nums font-mono mt-0.5">
                      @ {{ formatRupiah(line.unitPrice) }}
                    </div>
                  </td>
                  <td class="money-col tabular-nums font-mono">
                    {{ formatRupiah(line.semulaAmount || line.allocatedAmount) }}
                  </td>
                  <td class="money-col" style="text-align: center;">
                    <span
                      class="shift-pill font-mono tabular-nums text-xs font-semibold"
                      :class="{
                        'shift-plus': Number(line.pergeseranAmount) > 0,
                        'shift-minus': Number(line.pergeseranAmount) < 0,
                        'shift-zero': !line.pergeseranAmount || Number(line.pergeseranAmount) === 0
                      }"
                    >
                      {{ formatPergeseran(Number(line.pergeseranAmount) || 0) }}
                    </span>
                  </td>
                  <td class="money-col font-bold text-blue-700 tabular-nums font-mono">
                    {{ formatRupiah(line.menjadiAmount || line.allocatedAmount) }}
                  </td>
                  <td class="money-col text-violet tabular-nums font-mono">{{ formatRupiah(line.actualAmount) }}</td>
                  <td class="money-col font-bold text-emerald tabular-nums font-mono">{{ formatRupiah(line.availableAmount) }}</td>
                  <td style="text-align: center;">
                    <div class="mini-bar-wrap" :title="getLineUtilizationPct(line) + '% terserap'">
                      <div
                        class="mini-bar-fill"
                        :style="{
                          width: getLineUtilizationPct(line) + '%',
                          background: getLineUtilizationPct(line) > 85 ? '#ef4444' : getLineUtilizationPct(line) > 50 ? '#f59e0b' : '#10b981'
                        }"
                      ></div>
                    </div>
                    <small class="mini-bar-label tabular-nums font-mono">{{ getLineUtilizationPct(line) }}%</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Riwayat Versi & Revisi Plafon -->
        <div v-if="selectedBudget.revisions?.length > 0" class="drawer-section">
          <div class="section-header-custom">
            <div class="section-title-wrap">
              <i class="pi pi-history text-primary"></i>
              <h3>Histori Revisi & Audit Trail ({{ selectedBudget.revisions.length }} Versi)</h3>
            </div>
          </div>

          <div class="timeline-container">
            <div
              v-for="rev in selectedBudget.revisions"
              :key="rev.id"
              class="timeline-card"
            >
              <div class="timeline-header">
                <div class="rev-left">
                  <span class="rev-badge">Versi {{ rev.version }} &rarr; Versi {{ rev.version + 1 }}</span>
                  <span class="timeline-date">{{ formatDateTime(rev.createdAt) }}</span>
                </div>
                <span class="rev-author">
                  <i class="pi pi-user-edit text-xs"></i>
                  Oleh: <strong>{{ rev.revisedByName }}</strong>
                </span>
              </div>
              <p class="rev-reason">"{{ rev.reason }}"</p>
              <div class="rev-diff-strip">
                <span class="text-muted">Plafon Semula: <s>{{ formatRupiah(rev.previousAllocated) }}</s></span>
                <span class="diff-arrow">&rarr;</span>
                <span class="font-bold text-emerald">Plafon Baru: {{ formatRupiah(rev.newAllocated) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>

    <!-- Modal: Create Budget -->
    <ModalDialog :open="createOpen" title="Buat Draft Anggaran Baru" @close="createOpen = false">
      <form @submit.prevent="submitCreateBudget" class="modal-form-wrap">
        <div v-if="modalError" class="modal-error-alert" role="alert">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ modalError }}</span>
        </div>

        <!-- Live Total Counter Banner -->
        <div class="live-total-banner">
          <div class="live-total-left">
            <span class="live-label">Total Plafon Direncanakan ({{ createForm.lines.length }} Pos)</span>
            <span class="live-value text-emerald font-bold">{{ formatRupiah(createTotalAllocated) }}</span>
          </div>
          <div class="live-total-right">
            <span class="live-sub">Target Rev: {{ formatRupiah(createForm.revenueTarget || 0) }}</span>
          </div>
        </div>

        <div class="form-field">
          <label for="new-bdg-title" class="form-label">Judul Dokumen Anggaran</label>
          <input
            id="new-bdg-title"
            v-model="createForm.title"
            type="text"
            class="input-pill"
            placeholder="Contoh: RKAP Operasional Unit IT & Sistem Q4"
            required
          />
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="new-bdg-unit" class="form-label">Unit Bisnis</label>
            <select
              id="new-bdg-unit"
              v-model="createForm.businessUnitId"
              class="select-pill"
              required
              :disabled="auth.user?.roleCode === 'UNIT_MANAGER' && !!auth.user?.businessUnitId"
            >
              <option v-for="u in master.businessUnits" :key="u.id" :value="u.id">
                {{ u.code }} - {{ u.name }}
              </option>
            </select>
            <span v-if="auth.user?.roleCode === 'UNIT_MANAGER'" class="input-hint" style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 4px">
              Terkunci ke unit wewenang Anda
            </span>
          </div>

          <div class="form-field">
            <label for="new-bdg-period" class="form-label">Periode Fiskal</label>
            <select id="new-bdg-period" v-model="createForm.fiscalPeriodId" class="select-pill" required>
              <option v-for="p in master.fiscalPeriods.filter((x: any) => !x.isClosed)" :key="p.id" :value="p.id">
                {{ p.code }} - {{ p.name }}
              </option>
            </select>
          </div>

          <div class="form-field">
            <label for="new-bdg-fund" class="form-label">Sumber Dana</label>
            <select id="new-bdg-fund" v-model="createForm.fundSourceId" class="select-pill" required>
              <option v-for="f in master.fundSources" :key="f.id" :value="f.id">
                {{ f.code }} - {{ f.name }}
              </option>
            </select>
          </div>

          <div class="form-field">
            <label for="new-bdg-rev" class="form-label">Target Pendapatan Unit (IDR)</label>
            <CurrencyInput
              id="new-bdg-rev"
              v-model="createForm.revenueTarget"
              :min="0"
              placeholder="0"
              required
            />
          </div>
        </div>

        <div class="form-section-divider">
          <div class="section-title-between">
            <div>
              <strong class="font-bold text-sm">Pos Rincian Mata Anggaran</strong>
              <p class="text-xs text-slate-500 mt-0.5">Pilih 70 akun COA resmi PMO dan gunakan kalkulator volume bertingkat.</p>
            </div>
            <button type="button" class="btn-add-line-pill" @click="addBudgetLineRow">
              <i class="pi pi-plus text-xs"></i>
              <span>Tambah Pos</span>
            </button>
          </div>

          <div class="lines-container">
            <div v-for="(line, idx) in createForm.lines" :key="idx" class="line-row-card">
              <div class="line-row-header">
                <span class="line-row-index font-mono">Pos #{{ idx + 1 }}</span>
                <button
                  v-if="createForm.lines.length > 1"
                  type="button"
                  class="btn-remove-line"
                  title="Hapus baris ini"
                  @click="removeBudgetLineRow(idx)"
                >
                  <i class="pi pi-trash"></i>
                </button>
              </div>

              <!-- Row 1: Cost Center, Kategori & COA Combobox -->
              <div class="form-grid" style="grid-template-columns: 1fr 1fr 2fr;">
                <div class="form-field">
                  <label :for="`line-cc-${idx}`" class="form-label">Cost Center</label>
                  <select :id="`line-cc-${idx}`" v-model="line.costCenterId" class="select-pill" required>
                    <option v-for="cc in availableCostCenters" :key="cc.id" :value="cc.id">
                      {{ cc.code }} - {{ cc.name }}
                    </option>
                  </select>
                </div>

                <div class="form-field">
                  <label :for="`line-cat-${idx}`" class="form-label">Kategori</label>
                  <select :id="`line-cat-${idx}`" v-model="line.category" class="select-pill" required>
                    <option value="OPEX">OPEX (Operasional)</option>
                    <option value="CAPEX">CAPEX (Investasi Modal)</option>
                    <option value="PENGADAAN">PENGADAAN (Barang & Jasa)</option>
                    <option value="PEGAWAI">PEGAWAI (Remunerasi / Diklat)</option>
                    <option value="MODAL_KERJA">MODAL_KERJA</option>
                    <option value="PAJAK">PAJAK (Fiskal / Retribusi)</option>
                  </select>
                </div>

                <div class="form-field">
                  <label class="form-label">Akun COA Operasional PMO (70 Akun Excel)</label>
                  <CoaCombobox
                    v-model="line.accountCode"
                    :accounts="officialCoaAccounts"
                    placeholder="Pilih kode atau nama akun..."
                  />
                </div>
              </div>

              <!-- Row 2: Sub Kegiatan & Uraian Pekerjaan -->
              <div class="form-grid" style="margin-top: 8px; grid-template-columns: 1fr 2fr;">
                <div class="form-field">
                  <label :for="`line-sub-${idx}`" class="form-label">Sub Kegiatan</label>
                  <input
                    :id="`line-sub-${idx}`"
                    v-model="line.subActivity"
                    type="text"
                    class="input-pill"
                    placeholder="Contoh: Operasional Layanan Cloud"
                  />
                </div>

                <div class="form-field">
                  <label :for="`line-desc-${idx}`" class="form-label">Uraian Komponen / Mata Anggaran</label>
                  <input
                    :id="`line-desc-${idx}`"
                    v-model="line.description"
                    type="text"
                    class="input-pill"
                    placeholder="Contoh: Pemeliharaan infrastruktur cloud & server backup"
                    required
                  />
                </div>
              </div>

              <!-- Row 3: Multi-Volume Calculator Toggle & Fields -->
              <div class="volume-calc-box mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div class="flex items-center justify-between mb-2">
                  <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      v-model="line.useMultiVolume"
                      class="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Gunakan Formula 4 Level Volume (V1 × V2 × V3 × V4 × Tarif)</span>
                  </label>
                  <span v-if="line.useMultiVolume" class="text-xs font-mono text-blue-700 font-semibold">
                    Subtotal: {{ formatRupiah(line.allocatedAmount) }}
                  </span>
                </div>

                <!-- 4 Level Volume Grid if Active -->
                <div v-if="line.useMultiVolume" class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                  <div>
                    <label class="text-xs font-medium text-slate-500 block mb-1">Vol 1 & Satuan</label>
                    <div class="flex gap-1">
                      <input
                        type="number"
                        min="1"
                        v-model.number="line.vol1"
                        class="input-pill tabular-nums font-mono w-16"
                        placeholder="1"
                        @input="updateLineAmountFromVolume(line)"
                      />
                      <input
                        type="text"
                        v-model="line.satuan1"
                        class="input-pill text-xs flex-1"
                        placeholder="Satuan 1 (ex: Orang)"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-medium text-slate-500 block mb-1">Vol 2 & Satuan</label>
                    <div class="flex gap-1">
                      <input
                        type="number"
                        min="1"
                        v-model.number="line.vol2"
                        class="input-pill tabular-nums font-mono w-16"
                        placeholder="1"
                        @input="updateLineAmountFromVolume(line)"
                      />
                      <input
                        type="text"
                        v-model="line.satuan2"
                        class="input-pill text-xs flex-1"
                        placeholder="Satuan 2 (ex: Bulan)"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-medium text-slate-500 block mb-1">Vol 3 & Satuan</label>
                    <div class="flex gap-1">
                      <input
                        type="number"
                        min="1"
                        v-model.number="line.vol3"
                        class="input-pill tabular-nums font-mono w-16"
                        placeholder="1"
                        @input="updateLineAmountFromVolume(line)"
                      />
                      <input
                        type="text"
                        v-model="line.satuan3"
                        class="input-pill text-xs flex-1"
                        placeholder="Satuan 3 (ex: Hari)"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-medium text-slate-500 block mb-1">Vol 4 & Satuan</label>
                    <div class="flex gap-1">
                      <input
                        type="number"
                        min="1"
                        v-model.number="line.vol4"
                        class="input-pill tabular-nums font-mono w-16"
                        placeholder="1"
                        @input="updateLineAmountFromVolume(line)"
                      />
                      <input
                        type="text"
                        v-model="line.satuan4"
                        class="input-pill text-xs flex-1"
                        placeholder="Satuan 4 (opsional)"
                      />
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-medium text-slate-500 block mb-1">Tarif Satuan (IDR)</label>
                    <CurrencyInput
                      :id="`line-tariff-${idx}`"
                      v-model="line.unitPrice"
                      :min="0"
                      placeholder="0"
                      @update:modelValue="updateLineAmountFromVolume(line)"
                    />
                  </div>
                </div>

                <!-- Direct Plafon Input if Multi-Volume Inactive -->
                <div v-else class="form-field mt-1">
                  <label :for="`line-amt-${idx}`" class="form-label">Plafon Alokasi (IDR)</label>
                  <CurrencyInput
                    :id="`line-amt-${idx}`"
                    v-model="line.allocatedAmount"
                    :min="1000"
                    placeholder="0"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end; margin-top: 10px;">
          <button type="button" class="pill-btn pill-btn-ghost" :disabled="isSubmitting" @click="createOpen = false">Batal</button>
          <button type="submit" class="pill-btn pill-btn-primary" :disabled="isSubmitting">
            <span v-if="isSubmitting" class="spinner-sm"></span>
            <span>{{ isSubmitting ? 'Menyimpan Draft...' : 'Simpan Draft Anggaran' }}</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Revise Budget (Format Semula - Menjadi) -->
    <ModalDialog :open="reviseOpen" title="Revisi Plafon Anggaran Semula - Menjadi" @close="reviseOpen = false">
      <form @submit.prevent="submitRevision" class="modal-form-wrap">
        <div class="panel audit-warning-panel">
          <i class="pi pi-shield text-primary" style="font-size: 1.25rem;"></i>
          <p style="font-size: 0.86rem; color: var(--text-primary); margin: 0;">
            Penyesuaian pergeseran pagu akan menyimpan snapshot versi sebelumnya ke tabel <code>BudgetRevision</code> untuk kepatuhan audit BPKP/Internal tanpa menghapus rekam jejak historis.
          </p>
        </div>

        <!-- Live Total Comparison Semula - Menjadi Banner -->
        <div class="live-total-banner" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
          <div class="live-col">
            <span class="live-label text-slate-500">Pagu Semula</span>
            <div class="live-value text-slate-700 font-mono font-bold">{{ formatRupiah(reviseSummary.totalSemula) }}</div>
          </div>
          <div class="live-col">
            <span class="live-label text-slate-500">Total Pergeseran (+/-)</span>
            <div
              class="live-value font-mono font-bold"
              :class="reviseSummary.totalPergeseran >= 0 ? 'text-emerald' : 'text-rose'"
            >
              {{ formatPergeseran(reviseSummary.totalPergeseran) }}
            </div>
          </div>
          <div class="live-col">
            <span class="live-label text-slate-500">Pagu Menjadi Baru</span>
            <div class="live-value text-blue-700 font-mono font-bold">{{ formatRupiah(reviseSummary.totalMenjadi) }}</div>
          </div>
        </div>

        <div class="form-field">
          <label for="rev-reason" class="form-label">Alasan Penyesuaian / Pergeseran Plafon (Wajib Diisi)</label>
          <textarea
            id="rev-reason"
            v-model="reviseReason"
            class="textarea-pill"
            placeholder="Contoh: Penyesuaian kebutuhan sertifikasi keahlian semester kedua sesuai addendum kontrak klien."
            rows="3"
            required
          ></textarea>
        </div>

        <div class="revise-lines-list">
          <div v-for="rl in reviseLines" :key="rl.lineId" class="revise-line-card p-3 rounded-xl border border-slate-200 mb-3 bg-white">
            <div class="revise-line-header flex justify-between items-center mb-2">
              <div>
                <span class="font-bold text-sm text-slate-800">{{ rl.description }}</span>
                <span v-if="rl.accountCode" class="doc-code-pill font-mono text-xs ml-2">{{ rl.accountCode }}</span>
              </div>
              <span class="text-slate-500 text-xs font-mono">Pagu Semula: <strong>{{ formatRupiah(rl.semula) }}</strong></span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="form-field">
                <label class="form-label text-xs">Pergeseran (+/- IDR)</label>
                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    v-model.number="rl.pergeseran"
                    class="input-pill tabular-nums font-mono text-sm"
                    placeholder="0"
                    @input="onReviseShiftChange(rl)"
                  />
                </div>
              </div>

              <div class="form-field">
                <label class="form-label text-xs">Pagu Menjadi (IDR)</label>
                <CurrencyInput
                  :id="`rev-line-${rl.lineId}`"
                  v-model="rl.newAllocatedAmount"
                  :min="0"
                  placeholder="0"
                  required
                  @update:modelValue="onReviseMenjadiChange(rl)"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end; margin-top: 10px;">
          <button type="button" class="pill-btn pill-btn-ghost" @click="reviseOpen = false">Batal</button>
          <button type="submit" class="pill-btn pill-btn-primary">Simpan Versi Revisi</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Animated Checkmark Success Notification Modal -->
    <Teleport to="body">
      <div v-if="successNotification?.show" class="success-overlay" @click.self="successNotification.show = false">
        <div class="success-card">
          <button type="button" class="success-close-btn" @click="successNotification.show = false">&times;</button>
          
          <div class="checkmark-animation-wrap">
            <svg class="checkmark-svg" viewBox="0 0 52 52">
              <circle class="checkmark-circle" cx="26" cy="26" r="24" fill="none" />
              <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
          </div>

          <h3 class="success-title">{{ successNotification.title }}</h3>
          <div class="success-doc-badge">
            <span class="badge-code">{{ successNotification.docNumber }}</span>
            <span class="badge-status">DRAFT AKTIF</span>
          </div>

          <div class="success-details-box">
            <div class="detail-row">
              <span>Unit Bisnis:</span>
              <strong>{{ successNotification.unitName }}</strong>
            </div>
            <div class="detail-row">
              <span>Total Alokasi Plafon:</span>
              <strong class="text-emerald font-semibold">{{ formatRupiah(successNotification.amount) }}</strong>
            </div>
            <div class="detail-row">
              <span>Status Dokumen:</span>
              <span class="status-pill status-draft">DRAFT &bull; Siap Diajukan</span>
            </div>
          </div>

          <div class="success-action-row">
            <button type="button" class="btn btn-primary btn-success-ack" @click="successNotification.show = false">
              Lanjutkan ke Daftar Anggaran &rarr;
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Atmospheric Pastel Gradient Background Canvas (Matches Screenshot Vibe) */
.feature-page-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background:
    radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.16) 0%, transparent 40%),
    radial-gradient(circle at 0% 100%, rgba(244, 114, 182, 0.14) 0%, transparent 40%),
    radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 35%),
    #edf2f7;
  padding: 16px 20px 36px;
  border-radius: 28px;
  min-height: 100vh;
}

/* Feature Header Card */
.feature-header-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  background: #ffffff;
  border-radius: 22px;
  padding: 22px 26px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.9);
}

.header-left-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: 680px;
}

.breadcrumb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #4f8eff;
  background: #eff6ff;
  padding: 3px 10px;
  border-radius: 999px;
  width: fit-content;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4f8eff;
}

.feature-main-heading {
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.25;
}

.feature-sub-heading {
  font-size: 0.86rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Floating Pill Buttons */
.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 16px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
  border: none;
}

.pill-btn-primary {
  background: #4f8eff;
  color: #ffffff;
  box-shadow: 0 8px 22px rgba(79, 142, 255, 0.42);
}

.pill-btn-primary:hover {
  background: #3b82f6;
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(79, 142, 255, 0.52);
}

.pill-btn-ghost {
  background: #f8fafc;
  color: #1e293b;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
}

.pill-btn-ghost:hover:not(:disabled) {
  background: #ffffff;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

/* 4 Pastel Stat Cards (Exact Screenshot Vibe) */
.pastel-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.pastel-stat-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 18px 20px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.pastel-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.focal-card {
  border-color: rgba(56, 189, 248, 0.35);
}

/* Pastel Icon Boxes (Exact Colors From Screenshot) */
.pastel-icon-box {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.icon-dollar {
  font-weight: 800;
  font-size: 1.35rem;
}

.box-amber { background: #fef3c7; color: #d97706; }
.box-cyan { background: #e0f2fe; color: #0284c7; }
.box-rose { background: #ffe4e6; color: #e11d48; }
.box-lilac { background: #e0e7ff; color: #4f46e5; }

.stat-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-number {
  font-size: 1.32rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-title {
  font-size: 0.76rem;
  color: #64748b;
  font-weight: 500;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-badge-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  margin-top: 6px;
  width: fit-content;
}

.badge-amber-sub { background: #fffbeb; color: #b45309; }
.badge-cyan-sub { background: #ecfdf5; color: #047857; }
.badge-rose-sub { background: #fff1f2; color: #be123c; }
.badge-lilac-sub { background: #f5f3ff; color: #6d28d9; }

/* Filter & Search Toolbar (Floating White Card) */
.toolbar-pill-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 14px 18px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar-unit-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e2e8f0;
}

.toolbar-unit-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.toolbar-status-search-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-pill-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-pill-unit {
  font-size: 0.78rem;
  padding: 6px 12px;
  border-radius: 999px;
}

/* SHIFT PILLS (Semula - Menjadi) */
.shift-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.shift-plus {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.shift-minus {
  background: #fff1f2;
  color: #be123c;
  border: 1px solid #fecdd3;
}

.shift-zero {
  background: #f8fafc;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
}

.volume-calc-pill {
  background: #f1f5f9;
  color: #334155;
  padding: 3px 6px;
  border-radius: 6px;
  display: inline-block;
}

.filter-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #f8fafc;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
}

.filter-pill-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.filter-pill-btn.active {
  background: #4f8eff;
  color: #ffffff;
  border-color: #4f8eff;
  box-shadow: 0 6px 16px rgba(79, 142, 255, 0.35);
}

.pill-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}

.filter-pill-btn.active .pill-badge {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-approved { background: #10b981; }
.dot-submitted { background: #3b82f6; }
.dot-draft { background: #94a3b8; }
.dot-revised { background: #f59e0b; }

.toolbar-search-wrap {
  display: flex;
  align-items: center;
  position: relative;
  min-width: 260px;
  flex: 1 1 260px;
  max-width: 360px;
}

.search-lens-ico {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  pointer-events: none;
}

.search-pill-input {
  width: 100%;
  padding: 8px 34px 8px 34px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 0.82rem;
  color: #0f172a;
  outline: none;
  transition: all 140ms ease;
}

.search-pill-input:focus {
  background: #ffffff;
  border-color: #4f8eff;
  box-shadow: 0 0 0 3px rgba(79, 142, 255, 0.15);
}

.search-clear-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
}

/* Main Data Table Card */
.main-table-card {
  background: #ffffff;
  border-radius: 22px;
  padding: 22px 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.table-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.table-top-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-card-title {
  font-size: 1.08rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.table-card-count {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
}

.table-card-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 0.76rem;
  color: #64748b;
}

.legend-unit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-lilac { background: #6366f1; }
.dot-amber { background: #f59e0b; }
.dot-emerald { background: #10b981; }

.table-scroll-container {
  width: 100%;
  overflow-x: auto;
}

.aesthetic-data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.aesthetic-data-table th {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafafa;
  text-align: left;
}

.aesthetic-data-table td {
  padding: 14px 14px;
  vertical-align: middle;
  border-bottom: 1px solid #f8fafc;
}

.table-row-item {
  cursor: pointer;
  transition: background 120ms ease;
}

.table-row-item:hover {
  background: #f8fafc;
}

.table-row-item.row-active-item {
  background: #eff6ff;
}

.cell-doc-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.doc-code-pill {
  font-family: monospace;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #1e293b;
  border: 1px solid #e2e8f0;
}

.doc-tags-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.unit-badge-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 5px;
  text-transform: uppercase;
}

.unit-its { background: #eff6ff; color: #1d4ed8; }
.unit-mice { background: #fdf4ff; color: #a21caf; }
.unit-tci { background: #f0fdf4; color: #15803d; }
.unit-klinik { background: #fff1f2; color: #be123c; }
.unit-default { background: #f1f5f9; color: #64748b; }

.version-badge-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 5px;
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.cell-title-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.budget-title-link {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.35;
}

.budget-sub-params {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.74rem;
  color: #64748b;
}

.param-divider {
  color: #cbd5e1;
}

.amount-number-bold {
  font-size: 0.94rem;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.amount-target-sub {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}

.amount-number-emerald {
  font-size: 0.94rem;
  font-weight: 800;
  color: #10b981;
  font-variant-numeric: tabular-nums;
}

.amount-percent-emerald {
  font-size: 0.72rem;
  color: #059669;
  font-weight: 600;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* Stacked Absorption Progress Bar */
.cell-absorption-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  max-width: 200px;
}

.stacked-bar-rail {
  width: 100%;
  height: 7px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
  display: flex;
}

.rail-fill {
  height: 100%;
  transition: width 300ms ease;
}

.fill-lilac { background: #6366f1; }
.fill-amber { background: #f59e0b; }
.fill-emerald { background: #10b981; }

.absorption-text-split {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
}

.action-detail-pill {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #4f8eff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 140ms ease;
}

.action-detail-pill:hover {
  background: #4f8eff;
  color: #ffffff;
  border-color: #4f8eff;
  transform: translateX(2px);
}

.table-pagination-footer {
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}

/* Slide-over Drawer Detail Sheet */
.drawer-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 12px;
}

.drawer-header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.drawer-inner-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 4px 30px;
}

.drawer-hero-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.drawer-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.3;
}

.drawer-meta-list {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 0.82rem;
  color: #64748b;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.drawer-actions-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}

.btn-drawer-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 140ms ease;
}

.btn-drawer-primary { background: #4f8eff; color: #ffffff; }
.btn-drawer-primary:hover { background: #3b82f6; }
.btn-drawer-success { background: #10b981; color: #ffffff; }
.btn-drawer-success:hover { background: #059669; }
.btn-drawer-warn { background: #f59e0b; color: #ffffff; }
.btn-drawer-warn:hover { background: #d97706; }

.drawer-meter-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 16px 20px;
}

.meter-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.meter-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #0f172a;
}

.meter-total-stat {
  font-size: 0.82rem;
  font-weight: 700;
  color: #4f8eff;
}

.drawer-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.card-kpi-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
}

.box-amber-subtle { background: #fffbeb; border-color: #fef3c7; }
.box-rose-subtle { background: #fff1f2; border-color: #ffe4e6; }
.box-lilac-subtle { background: #f5f3ff; border-color: #ede9fe; }
.box-cyan-subtle { background: #ecfdf5; border-color: #d1fae5; }

.box-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: #64748b;
}

.box-value {
  font-size: 1.22rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.box-sub {
  font-size: 0.74rem;
  color: #64748b;
  margin-top: 4px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header-custom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title-wrap h3 {
  font-size: 0.98rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.line-coa-text {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}

.cat-chip {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  display: inline-block;
}

.cat-capex { background: #eff6ff; color: #1e40af; }
.cat-opex { background: #f0fdf4; color: #166534; }
.cat-modal { background: #fefce8; color: #854d0e; }
.cat-pengadaan { background: #faf5ff; color: #6b21a8; }
.cat-pegawai { background: #fff7ed; color: #9a3412; }
.cat-pajak { background: #fff1f2; color: #9f1239; }
.cat-default { background: #f1f5f9; color: #64748b; }

.line-desc-text {
  font-size: 0.84rem;
  font-weight: 600;
  color: #0f172a;
  margin-top: 3px;
}

.mini-bar-wrap {
  width: 50px;
  height: 5px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 0 auto 2px;
  overflow: hidden;
}

.mini-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 300ms ease;
}

.mini-bar-label {
  font-size: 0.7rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

/* Timeline Cards */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-card {
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.rev-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rev-badge {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f3e8ff;
  color: #7c3aed;
}

.timeline-date {
  font-size: 0.76rem;
  color: #64748b;
}

.rev-author {
  font-size: 0.76rem;
  color: #64748b;
}

.rev-reason {
  font-size: 0.84rem;
  margin: 8px 0;
  color: #0f172a;
  font-style: italic;
  line-height: 1.4;
}

.rev-diff-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: #64748b;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

/* Modal Form Styling */
.modal-form-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.live-total-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ecfdf5;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 14px;
  padding: 12px 16px;
}

.live-total-left {
  display: flex;
  flex-direction: column;
}

.live-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #047857;
}

.live-value {
  font-size: 1.15rem;
  letter-spacing: -0.01em;
}

.live-sub {
  font-size: 0.78rem;
  color: #64748b;
}

.input-pill, .select-pill, .textarea-pill {
  width: 100%;
  padding: 9px 14px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 0.84rem;
  color: #0f172a;
  outline: none;
  transition: all 140ms ease;
}

.input-pill:focus, .select-pill:focus, .textarea-pill:focus {
  background: #ffffff;
  border-color: #4f8eff;
  box-shadow: 0 0 0 3px rgba(79, 142, 255, 0.15);
}

.form-section-divider {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.section-title-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-add-line-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid #4f8eff;
  background: #eff6ff;
  color: #2563eb;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 120ms ease;
}

.btn-add-line-pill:hover {
  background: #4f8eff;
  color: #ffffff;
}

.lines-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}

.line-row-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 14px;
}

.line-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.line-row-index {
  font-size: 0.75rem;
  font-weight: 700;
  color: #4f8eff;
  text-transform: uppercase;
}

.btn-remove-line {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
}

.btn-remove-line:hover {
  background: #fef2f2;
}

.audit-warning-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 12px 14px;
}

.revise-lines-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.revise-line-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}

.revise-line-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-error-alert {
  padding: 10px 14px;
  border-radius: 12px;
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  font-size: 0.86rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Success Modal */
.success-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  padding: 20px;
}

.success-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 36px 32px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.success-close-btn {
  position: absolute;
  top: 16px;
  right: 18px;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #94a3b8;
  cursor: pointer;
}

.checkmark-animation-wrap {
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
}

.checkmark-svg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  stroke-width: 3.5;
  stroke: #10b981;
}

.checkmark-circle {
  stroke: #10b981;
  fill: #ecfdf5;
}

.checkmark-check {
  stroke: #10b981;
}

.success-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 8px;
}

.success-doc-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.badge-code {
  font-family: monospace;
  font-size: 0.92rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #4f8eff;
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  background: #ecfdf5;
  color: #10b981;
}

.success-details-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
  text-align: left;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.86rem;
  color: #64748b;
}

.detail-row strong {
  color: #0f172a;
}

.success-action-row {
  display: flex;
}

.btn-success-ack {
  width: 100%;
  padding: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  border-radius: 14px;
  background: #4f8eff;
  color: #ffffff;
  border: none;
  cursor: pointer;
}

/* Responsive */
@media (max-width: 1200px) {
  .pastel-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .pastel-kpi-grid {
    grid-template-columns: 1fr;
  }
  .drawer-kpi-grid {
    grid-template-columns: 1fr;
  }
  .feature-header-card {
    flex-direction: column;
    align-items: stretch;
  }
  .header-right-actions {
    align-self: flex-start;
  }
}
</style>
