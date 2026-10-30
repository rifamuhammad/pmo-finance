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

// PrimeVue official components
import Drawer from 'primevue/drawer';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import MeterGroup from 'primevue/metergroup';

const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

const budgets = ref<any[]>([]);
const selectedBudget = ref<any>(null);
const isDrawerOpen = ref(false);
const master = ref<any>({ businessUnits: [], costCenters: [], fundSources: [], fiscalPeriods: [] });

const statusFilter = ref('');
const searchQuery = ref('');

// Setup Pagination with default 5 rows per page
const {
  currentPage,
  pageSize,
  totalItems,
  paginatedItems: paginatedBudgets,
  resetPage,
} = usePagination(budgets, 5);

// Computed KPI Metrics across all loaded budgets
const summaryKpis = computed(() => {
  const list = budgets.value || [];
  const totalAllocated = list.reduce((sum, b) => sum + (Number(b.totalAllocated) || 0), 0);
  const totalAvailable = list.reduce((sum, b) => sum + (Number(b.availableAmount) || 0), 0);
  const totalCommitted = list.reduce((sum, b) => sum + (Number(b.totalCommitted) || 0), 0);
  const totalActual = list.reduce((sum, b) => sum + (Number(b.totalActual) || 0), 0);
  const freePct = totalAllocated > 0 ? Math.round((totalAvailable / totalAllocated) * 100) : 0;
  return {
    totalAllocated,
    totalAvailable,
    totalCommitted,
    totalActual,
    freePct,
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

// PrimeVue MeterGroup formatted items
const meterItems = computed(() => [
  {
    label: `Realisasi Beban (${formatRupiah(selectedBudget.value?.totalActual || 0)})`,
    value: selectedUtilization.value.actual,
    color: '#7c3aed',
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
      description: '',
      allocatedAmount: 0,
    },
  ],
});

// Revise Budget Modal
const reviseOpen = ref(false);
const reviseReason = ref('');
const reviseLines = ref<Array<{ lineId: string; description: string; current: number; newAllocatedAmount: number }>>([]);

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
        description: '',
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
    description: '',
    allocatedAmount: 0,
  });
}

async function submitCreateBudget() {
  modalError.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';
  isSubmitting.value = true;
  try {
    const res = await apiFetch('/budgets', {
      method: 'POST',
      body: JSON.stringify(createForm.value),
    });
    // Immediately close modal!
    createOpen.value = false;

    // Trigger animated checkmark success notification!
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
  reviseLines.value = (budget.lines || []).map((l: any) => ({
    lineId: l.id,
    description: l.description,
    current: l.allocatedAmount,
    newAllocatedAmount: l.allocatedAmount,
  }));
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
  <div class="budgets-view animate-fade-in">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Perencanaan Anggaran & Plafon</h1>
        <p class="page-desc">
          Kelola siklus plafon modal, pengajuan persetujuan berjenjang, revisi plafon ber-histori, dan kontrol realisasi per unit bisnis.
        </p>
      </div>
      <div class="btn-row">
        <Button
          label="Muat Ulang"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          outlined
          @click="loadMasterAndBudgets"
        />
        <Button
          v-if="auth.hasPermission('budget:create')"
          label="Buat Draft Anggaran Baru"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreateBudget"
        />
      </div>
    </div>

    <!-- Alert / Feedback Notification -->
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

    <!-- Colorful KPI Summary Strip -->
    <div class="budget-kpi-grid">
      <!-- 1. Total Plafon RKAP -->
      <div class="kpi-card kpi-blue">
        <div class="kpi-icon-wrap icon-blue">
          <i class="pi pi-wallet" style="font-size: 1.25rem;"></i>
        </div>
        <div class="kpi-content">
          <span class="kpi-label">Total Plafon RKAP Terdata</span>
          <div class="kpi-value">{{ formatRupiah(summaryKpis.totalAllocated) }}</div>
          <span class="kpi-sub">{{ budgets.length }} Dokumen RKAP Terdaftar</span>
        </div>
      </div>

      <!-- 2. Sisa Plafon Bebas (Likuiditas) -->
      <div class="kpi-card kpi-emerald">
        <div class="kpi-icon-wrap icon-emerald">
          <i class="pi pi-shield" style="font-size: 1.25rem;"></i>
        </div>
        <div class="kpi-content">
          <span class="kpi-label">Sisa Plafon Bebas (Tersedia)</span>
          <div class="kpi-value text-emerald">{{ formatRupiah(summaryKpis.totalAvailable) }}</div>
          <span class="kpi-sub text-emerald">
            <strong>{{ summaryKpis.freePct }}%</strong> Kapasitas Belanja Tersisa
          </span>
        </div>
      </div>

      <!-- 3. Komitmen PO Terbit -->
      <div class="kpi-card kpi-amber">
        <div class="kpi-icon-wrap icon-amber">
          <i class="pi pi-lock" style="font-size: 1.25rem;"></i>
        </div>
        <div class="kpi-content">
          <span class="kpi-label">Komitmen PO Terikat</span>
          <div class="kpi-value text-amber">{{ formatRupiah(summaryKpis.totalCommitted) }}</div>
          <span class="kpi-sub text-amber">PO Berjalan Belum Ditagihkan</span>
        </div>
      </div>

      <!-- 4. Realisasi Beban Aktual -->
      <div class="kpi-card kpi-violet">
        <div class="kpi-icon-wrap icon-violet">
          <i class="pi pi-chart-line" style="font-size: 1.25rem;"></i>
        </div>
        <div class="kpi-content">
          <span class="kpi-label">Realisasi Beban Aktual</span>
          <div class="kpi-value text-violet">{{ formatRupiah(summaryKpis.totalActual) }}</div>
          <span class="kpi-sub text-violet">Kuitansi / Tagihan Terverifikasi</span>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-item" style="flex: 2 1 260px;">
        <label for="bdg-search" class="form-label">Cari Nomor / Judul Dokumen Anggaran</label>
        <div class="search-input-wrap">
          <i class="pi pi-search search-icon"></i>
          <input
            id="bdg-search"
            v-model="searchQuery"
            type="text"
            class="input search-input"
            placeholder="Ketik kata kunci atau nomor dokumen..."
            @keyup.enter="loadMasterAndBudgets"
          />
        </div>
      </div>

      <div class="filter-item">
        <label for="bdg-status" class="form-label">Status Anggaran</label>
        <select id="bdg-status" v-model="statusFilter" class="select" @change="loadMasterAndBudgets">
          <option value="">Semua Status</option>
          <option value="DRAFT">DRAFT</option>
          <option value="SUBMITTED">SUBMITTED (Menunggu Approval)</option>
          <option value="APPROVED">APPROVED (Aktif Disetujui)</option>
          <option value="REVISED">REVISED (Telah Direvisi)</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      <Button
        label="Terapkan Filter"
        icon="pi pi-filter"
        size="small"
        severity="primary"
        @click="loadMasterAndBudgets"
      />
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Dokumen Anggaran"
      message="Mengambil rincian mata anggaran, alokasi plafon, komitmen aktif, dan histori versi..."
    />

    <StateBanner
      v-else-if="budgets.length === 0"
      state="empty"
      title="Belum Ada Dokumen Anggaran"
      message="Buat draft anggaran baru untuk mulai mengalokasikan plafon biaya per unit bisnis."
      actionLabel="Buat Draft Anggaran"
      @action="openCreateBudget"
    />

    <!-- FULL-WIDTH ELEGANT TABLE (No horizontal cut-off!) -->
    <div v-else class="table-container-full">
      <section class="panel table-panel" aria-label="Daftar Dokumen Anggaran">
        <div class="panel-header">
          <div style="display: flex; align-items: center; gap: 10px">
            <h2>Daftar Dokumen Anggaran</h2>
            <Tag :value="`${budgets.length} Dokumen`" severity="secondary" rounded />
          </div>
          <small class="text-muted">
            <i class="pi pi-info-circle" style="font-size: 0.8rem; margin-right: 4px;"></i>
            Klik baris tabel untuk membuka rincian lengkap pos anggaran
          </small>
        </div>

        <div class="table-wrap">
          <table class="erp-table budget-table">
            <thead>
              <tr>
                <th style="min-width: 160px;">No. Dokumen & Unit</th>
                <th style="min-width: 240px;">Judul Dokumen Anggaran</th>
                <th class="money-col" style="min-width: 140px;">Plafon (Allocated)</th>
                <th class="money-col" style="min-width: 140px;">Sisa Tersedia</th>
                <th style="min-width: 120px;">Status</th>
                <th style="min-width: 100px; text-align: center;">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="b in paginatedBudgets"
                :key="b.id"
                class="clickable-row"
                :class="{ 'row-active': selectedBudget?.id === b.id }"
                @click="openBudgetDetail(b)"
              >
                <td>
                  <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start">
                    <span class="doc-code">{{ b.docNumber }}</span>
                    <div style="display: flex; gap: 4px; align-items: center">
                      <span class="unit-chip" :class="getUnitBadgeClass(b.businessUnit?.code)">
                        {{ b.businessUnit?.code || 'BU' }}
                      </span>
                      <span class="version-chip">v{{ b.version }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <strong class="budget-title-cell">{{ b.title }}</strong>
                  <div class="text-muted" style="font-size: 0.8rem; margin-top: 3px">
                    {{ b.fiscalPeriod?.name || 'FY2026' }} &bull; {{ b.fundSource?.name || 'Kas Operasional' }}
                  </div>
                </td>
                <td class="money-col">
                  <div class="cell-money">{{ formatRupiah(b.totalAllocated) }}</div>
                </td>
                <td class="money-col">
                  <div class="cell-money text-emerald font-semibold">{{ formatRupiah(b.availableAmount) }}</div>
                  <div class="cell-sub text-muted">
                    {{ b.totalAllocated > 0 ? Math.round(((b.availableAmount || 0) / b.totalAllocated) * 100) : 0 }}% tersisa
                  </div>
                </td>
                <td>
                  <StatusBadge :status="b.status" />
                </td>
                <td style="text-align: center;">
                  <Button
                    label="Detail"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    size="small"
                    severity="primary"
                    outlined
                    @click.stop="openBudgetDetail(b)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar (Default 5 Rows / Page) -->
        <PaginationControl
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalItems="totalItems"
          :pageSizeOptions="[5, 10, 25]"
          itemLabel="dokumen anggaran"
        />
      </section>
    </div>

    <!-- PRIMEVUE DRAWER: SLIDE-OVER DETAIL SHEET (NEVER CLIPPED OR CUT OFF!) -->
    <Drawer
      v-model:visible="isDrawerOpen"
      position="right"
      :style="{ width: '820px', maxWidth: '96vw' }"
      class="budget-detail-drawer"
    >
      <template #header>
        <div v-if="selectedBudget" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="doc-code" style="font-size: 0.9rem;">{{ selectedBudget.docNumber }}</span>
          <span class="version-chip">v{{ selectedBudget.version }}</span>
          <span class="unit-chip" :class="getUnitBadgeClass(selectedBudget.businessUnit?.code)">
            {{ selectedBudget.businessUnit?.code }} - {{ selectedBudget.businessUnit?.name }}
          </span>
          <StatusBadge :status="selectedBudget.status" />
        </div>
      </template>

      <div v-if="selectedBudget" class="drawer-inner-content">
        <!-- Title & Subtitle -->
        <div class="drawer-title-block">
          <h2 class="drawer-title">{{ selectedBudget.title }}</h2>
          <p class="text-muted" style="margin-top: 4px; font-size: 0.88rem">
            Dibuat oleh: <strong>{{ selectedBudget.createdByName }}</strong> &bull;
            Sumber Dana: <strong>{{ selectedBudget.fundSource?.name }}</strong> &bull;
            Periode: <strong>{{ selectedBudget.fiscalPeriod?.name }}</strong>
          </p>

          <!-- Action Buttons Bar -->
          <div class="drawer-actions-bar">
            <Button
              v-if="['DRAFT', 'REJECTED'].includes(selectedBudget.status) && auth.hasPermission('budget:submit')"
              label="Ajukan Persetujuan"
              icon="pi pi-send"
              severity="primary"
              size="small"
              @click="submitForApproval(selectedBudget)"
            />

            <Button
              v-if="selectedBudget.status === 'SUBMITTED' && auth.hasPermission('budget:approve')"
              label="Setujui Anggaran"
              icon="pi pi-check"
              severity="success"
              size="small"
              @click="approveBudget(selectedBudget)"
            />

            <Button
              v-if="['APPROVED', 'REVISED'].includes(selectedBudget.status) && auth.hasPermission('budget:approve')"
              label="Buat Revisi Plafon"
              icon="pi pi-pencil"
              severity="warn"
              size="small"
              @click="openReviseModal(selectedBudget)"
            />
          </div>
        </div>

        <!-- PrimeVue MeterGroup: Multi-Segment Visual Utilization -->
        <div class="drawer-meter-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 0.92rem; color: var(--text-primary);">Visualisasi Serapan Plafon Anggaran</strong>
            <span style="font-weight: 700; color: #034693; font-size: 0.85rem">
              {{ Math.round((selectedUtilization.actual + selectedUtilization.committed) * 10) / 10 }}% Terpakai & Terikat
            </span>
          </div>
          <MeterGroup :value="meterItems" />
        </div>

        <!-- 4 Metric Cards in 2x2 Grid (Generous Space, Never Squeezed!) -->
        <div class="drawer-kpi-grid">
          <div class="card-kpi-box box-blue">
            <span class="box-label">Plafon Disetujui (Allocated)</span>
            <div class="box-value text-blue">{{ formatRupiah(selectedBudget.totalAllocated) }}</div>
            <span class="box-sub">Target Rev: {{ formatRupiah(selectedBudget.revenueTarget) }}</span>
          </div>

          <div class="card-kpi-box box-amber">
            <span class="box-label">Komitmen Terikat (Encumbered PO)</span>
            <div class="box-value text-amber">{{ formatRupiah(selectedBudget.totalCommitted) }}</div>
            <span class="box-sub">{{ selectedUtilization.committed }}% dari Plafon</span>
          </div>

          <div class="card-kpi-box box-violet">
            <span class="box-label">Realisasi Beban Aktual</span>
            <div class="box-value text-violet">{{ formatRupiah(selectedBudget.totalActual) }}</div>
            <span class="box-sub">{{ selectedUtilization.actual }}% Terbayar</span>
          </div>

          <div class="card-kpi-box box-emerald focal">
            <span class="box-label">Sisa Plafon Bebas (Available)</span>
            <div class="box-value text-emerald">{{ formatRupiah(selectedBudget.availableAmount) }}</div>
            <span class="box-sub text-emerald font-semibold">{{ selectedUtilization.free }}% Siap Digunakan</span>
          </div>
        </div>

        <!-- Budget Lines Section -->
        <div class="drawer-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="font-size: 1.02rem; font-weight: 700;">Rincian Pos Mata Anggaran ({{ selectedBudget.lines?.length || 0 }} Pos)</h3>
          </div>

          <div class="table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th style="min-width: 120px;">Cost Center & COA</th>
                  <th style="min-width: 160px;">Kategori & Uraian</th>
                  <th class="money-col" style="min-width: 105px;">Plafon</th>
                  <th class="money-col" style="min-width: 105px;">Komitmen</th>
                  <th class="money-col" style="min-width: 105px;">Aktual</th>
                  <th class="money-col" style="min-width: 105px;">Tersedia</th>
                  <th style="min-width: 80px; text-align: center;">Serapan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in selectedBudget.lines" :key="line.id">
                  <td>
                    <span class="doc-code">{{ line.costCenter?.code }}</span>
                    <div class="text-muted" style="font-size: 0.76rem; margin-top: 3px">
                      Akun: <strong>{{ line.accountCode }}</strong>
                    </div>
                  </td>
                  <td>
                    <span class="cat-chip" :class="getCatBadgeClass(line.category)">
                      {{ line.category }}
                    </span>
                    <div class="line-desc-text">{{ line.description }}</div>
                  </td>
                  <td class="money-col">{{ formatRupiah(line.allocatedAmount) }}</td>
                  <td class="money-col text-amber">{{ formatRupiah(line.committedAmount) }}</td>
                  <td class="money-col text-violet">{{ formatRupiah(line.actualAmount) }}</td>
                  <td class="money-col font-semibold text-emerald">{{ formatRupiah(line.availableAmount) }}</td>
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
                    <small style="font-size: 0.72rem; color: var(--text-secondary);">{{ getLineUtilizationPct(line) }}%</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Riwayat Versi & Revisi Plafon -->
        <div v-if="selectedBudget.revisions?.length > 0" class="drawer-section">
          <div style="margin-bottom: 10px;">
            <h3 style="font-size: 1.02rem; font-weight: 700;">Histori Versi & Revisi Plafon ({{ selectedBudget.revisions.length }})</h3>
          </div>

          <div class="timeline-container">
            <div
              v-for="rev in selectedBudget.revisions"
              :key="rev.id"
              class="timeline-card"
            >
              <div class="timeline-header">
                <div style="display: flex; gap: 8px; align-items: center">
                  <span class="rev-badge">Versi {{ rev.version }} &rarr; Versi {{ rev.version + 1 }}</span>
                  <span class="text-muted" style="font-size: 0.8rem">&bull; {{ formatDateTime(rev.createdAt) }}</span>
                </div>
                <span class="rev-author">Oleh: <strong>{{ rev.revisedByName }}</strong></span>
              </div>
              <p class="rev-reason">"{{ rev.reason }}"</p>
              <div class="rev-diff-strip">
                <span>Plafon Sebelumnya: <s>{{ formatRupiah(rev.previousAllocated) }}</s></span>
                <span class="diff-arrow">&rarr;</span>
                <span class="font-semibold text-emerald">Plafon Baru: {{ formatRupiah(rev.newAllocated) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>

    <!-- Modal: Create Budget -->
    <ModalDialog :open="createOpen" title="Buat Draft Anggaran Baru" @close="createOpen = false">
      <form @submit.prevent="submitCreateBudget" style="display: flex; flex-direction: column; gap: 14px">
        <div v-if="modalError" class="modal-error-alert" role="alert">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ modalError }}</span>
        </div>

        <div class="form-field">
          <label for="new-bdg-title" class="form-label">Judul Dokumen Anggaran</label>
          <input
            id="new-bdg-title"
            v-model="createForm.title"
            type="text"
            class="input"
            placeholder="Contoh: Anggaran Operasional Q4"
            required
          />
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="new-bdg-unit" class="form-label">Unit Bisnis</label>
            <select
              id="new-bdg-unit"
              v-model="createForm.businessUnitId"
              class="select"
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
            <select id="new-bdg-period" v-model="createForm.fiscalPeriodId" class="select" required>
              <option v-for="p in master.fiscalPeriods.filter((x: any) => !x.isClosed)" :key="p.id" :value="p.id">
                {{ p.code }} - {{ p.name }}
              </option>
            </select>
          </div>

          <div class="form-field">
            <label for="new-bdg-fund" class="form-label">Sumber Dana</label>
            <select id="new-bdg-fund" v-model="createForm.fundSourceId" class="select" required>
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

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
            <strong>Baris Pos Mata Anggaran</strong>
            <button type="button" class="btn btn-sm" @click="addBudgetLineRow">+ Tambah Pos</button>
          </div>

          <div v-for="(line, idx) in createForm.lines" :key="idx" class="panel" style="margin-bottom: 10px; background: var(--bg-canvas)">
            <div class="form-grid">
              <div class="form-field">
                <label :for="`line-cc-${idx}`" class="form-label">Cost Center</label>
                <select :id="`line-cc-${idx}`" v-model="line.costCenterId" class="select" required>
                  <option v-for="cc in availableCostCenters" :key="cc.id" :value="cc.id">
                    {{ cc.code }} - {{ cc.name }}
                  </option>
                </select>
              </div>

              <div class="form-field">
                <label :for="`line-cat-${idx}`" class="form-label">Kategori</label>
                <select :id="`line-cat-${idx}`" v-model="line.category" class="select" required>
                  <option value="CAPEX">CAPEX (Investasi Modal)</option>
                  <option value="OPEX">OPEX (Operasional)</option>
                  <option value="PENGADAAN">PENGADAAN (Barang & Jasa)</option>
                  <option value="PEGAWAI">PEGAWAI (Remunerasi / Diklat)</option>
                  <option value="MODAL_KERJA">MODAL_KERJA</option>
                  <option value="PAJAK">PAJAK (Fiskal / Retribusi)</option>
                </select>
              </div>

              <div class="form-field">
                <label :for="`line-coa-${idx}`" class="form-label">Kode Akun Beban (COA)</label>
                <input
                  :id="`line-coa-${idx}`"
                  v-model="line.accountCode"
                  type="text"
                  class="input"
                  placeholder="Contoh: 5-1100"
                  required
                />
              </div>

              <div class="form-field">
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

            <div class="form-field" style="margin-top: 8px">
              <label :for="`line-desc-${idx}`" class="form-label">Uraian Pos Mata Anggaran</label>
              <input
                :id="`line-desc-${idx}`"
                v-model="line.description"
                type="text"
                class="input"
                placeholder="Contoh: Operasional program unit"
                required
              />
            </div>
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="isSubmitting" @click="createOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="isSubmitting">
            <span v-if="isSubmitting" class="spinner-sm"></span>
            <span>{{ isSubmitting ? 'Menyimpan Draft...' : 'Simpan Draft Anggaran' }}</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Revise Budget -->
    <ModalDialog :open="reviseOpen" title="Revisi Plafon Anggaran Ber-Histori" @close="reviseOpen = false">
      <form @submit.prevent="submitRevision" style="display: flex; flex-direction: column; gap: 12px">
        <div class="panel" style="background: rgba(3, 70, 147, 0.04); border-color: rgba(3, 70, 147, 0.15); padding: 12px 14px;">
          <p style="font-size: 0.88rem; color: var(--text-primary);">
            Perubahan plafon akan membuat snapshot versi saat ini ke tabel <code>BudgetRevision</code> untuk kepatuhan audit BPKP/Internal, tanpa menghapus riwayat historis.
          </p>
        </div>

        <div class="form-field">
          <label for="rev-reason" class="form-label">Alasan Penyesuaian Plafon (Wajib Diisi)</label>
          <textarea
            id="rev-reason"
            v-model="reviseReason"
            class="textarea"
            placeholder="Contoh: Penyesuaian kebutuhan sertifikasi keahlian semester kedua sesuai addendum kontrak klien."
            rows="3"
            required
          ></textarea>
        </div>

        <div v-for="rl in reviseLines" :key="rl.lineId" class="form-field">
          <label :for="`rev-line-${rl.lineId}`" class="form-label">
            {{ rl.description }} (Plafon Berjalan: {{ formatRupiah(rl.current) }})
          </label>
          <CurrencyInput
            :id="`rev-line-${rl.lineId}`"
            v-model="rl.newAllocatedAmount"
            :min="1000"
            placeholder="0"
            required
          />
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="reviseOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Versi Revisi</button>
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
/* Top KPI Grid */
.budget-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
  transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.kpi-card.kpi-blue {
  background: linear-gradient(135deg, rgba(3, 70, 147, 0.05) 0%, var(--bg-surface) 100%);
  border-color: rgba(3, 70, 147, 0.18);
}
.kpi-card.kpi-blue::before { background: #034693; }

.kpi-card.kpi-emerald {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.07) 0%, var(--bg-surface) 100%);
  border-color: rgba(16, 185, 129, 0.22);
}
.kpi-card.kpi-emerald::before { background: #10b981; }

.kpi-card.kpi-amber {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, var(--bg-surface) 100%);
  border-color: rgba(245, 158, 11, 0.22);
}
.kpi-card.kpi-amber::before { background: #f59e0b; }

.kpi-card.kpi-violet {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.07) 0%, var(--bg-surface) 100%);
  border-color: rgba(139, 92, 246, 0.22);
}
.kpi-card.kpi-violet::before { background: #8b5cf6; }

.kpi-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-blue { background: #eff6ff; color: #034693; }
.icon-emerald { background: #ecfdf5; color: #059669; }
.icon-amber { background: #fffbeb; color: #d97706; }
.icon-violet { background: #faf5ff; color: #7c3aed; }

.kpi-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.kpi-label {
  font-size: 0.77rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kpi-value {
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-top: 2px;
  white-space: nowrap;
}

.kpi-sub {
  font-size: 0.76rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Search input with icon */
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  padding-left: 36px;
}

/* Full Width Table Layout */
.table-container-full {
  width: 100%;
}

.table-panel {
  display: flex;
  flex-direction: column;
}

.budget-table th {
  white-space: nowrap;
}

.budget-title-cell {
  color: var(--text-primary);
  line-height: 1.35;
  display: block;
}

.version-chip {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.cell-money {
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.cell-sub {
  font-size: 0.74rem;
  margin-top: 2px;
}

/* Drawer Detail Sheet */
.drawer-inner-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 20px;
}

.drawer-title-block {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.drawer-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.drawer-actions-bar {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.drawer-meter-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
}

.drawer-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.card-kpi-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
}

.card-kpi-box.focal {
  border-color: rgba(16, 185, 129, 0.4);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, var(--bg-surface) 100%);
}

.box-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.box-value {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-top: 4px;
  white-space: nowrap;
}

.box-sub {
  font-size: 0.76rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
}

.line-desc-text {
  font-weight: 600;
  font-size: 0.86rem;
  margin-top: 4px;
  color: var(--text-primary);
}

/* Mini progress bar inside budget lines */
.mini-bar-wrap {
  width: 55px;
  height: 6px;
  background: var(--border-subtle);
  border-radius: 999px;
  margin: 0 auto 3px;
  overflow: hidden;
}

.mini-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 300ms ease;
}

/* Timeline Revisions */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-card {
  padding: 14px 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  position: relative;
  transition: border-color 140ms ease;
}

.timeline-card:hover {
  border-color: var(--border-strong);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.rev-badge {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f3e8ff;
  color: #6b21a8;
  border: 1px solid #d8b4fe;
}

.rev-author {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.rev-reason {
  font-size: 0.88rem;
  margin-top: 8px;
  color: var(--text-primary);
  font-style: italic;
}

.rev-diff-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.diff-arrow {
  color: var(--text-secondary);
}

/* Responsive adjustments */
@media (max-width: 1200px) {
  .budget-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .budget-kpi-grid {
    grid-template-columns: 1fr;
  }
  .drawer-kpi-grid {
    grid-template-columns: 1fr;
  }
}

/* Modal Error Alert */
.modal-error-alert {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border: 1px solid var(--status-danger-border);
  font-size: 0.86rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Animated Success Checkmark Modal */
.success-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  padding: 20px;
  animation: fadeIn 0.2s ease-out;
}

.success-card {
  background: var(--bg-surface);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 24px;
  padding: 36px 32px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 40px rgba(16, 185, 129, 0.15);
  animation: modalPopIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes modalPopIn {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(16px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.success-close-btn {
  position: absolute;
  top: 16px;
  right: 18px;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 8px;
  transition: all 140ms ease;
}

.success-close-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.checkmark-animation-wrap {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  position: relative;
}

.checkmark-svg {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: block;
  stroke-width: 3.5;
  stroke: #10b981;
  stroke-miterlimit: 10;
  animation: scaleBounce 0.4s ease-in-out 0.85s both;
}

.checkmark-circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  stroke-width: 3.5;
  stroke-miterlimit: 10;
  stroke: #10b981;
  fill: rgba(16, 185, 129, 0.12);
  animation: strokeCircle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.checkmark-check {
  transform-origin: 50% 50%;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke: #10b981;
  animation: strokeCheck 0.35s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
}

@keyframes strokeCircle {
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes strokeCheck {
  100% {
    stroke-dashoffset: 0;
  }
}

@keyframes scaleBounce {
  0%, 100% {
    transform: none;
  }
  50% {
    transform: scale3d(1.12, 1.12, 1);
  }
}

.success-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
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
  font-size: 0.95rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--primary);
  border: 1px solid var(--border-subtle);
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.success-details-box {
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
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
  color: var(--text-secondary);
}

.detail-row strong {
  color: var(--text-primary);
}

.success-action-row {
  display: flex;
  gap: 10px;
}

.btn-success-ack {
  width: 100%;
  padding: 12px;
  font-weight: 700;
  font-size: 0.92rem;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
