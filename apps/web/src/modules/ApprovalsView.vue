<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDateTime } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import { usePagination } from '../composables/usePagination';

const auth = useAuthStore();

interface ApprovalStats {
  totalPending: number;
  actionRequiredCount: number;
  totalPendingAmount: number;
  byModule: Record<string, number>;
  approvedThisMonth: number;
  rejectedThisMonth: number;
}

const loading = ref(true);
const statsLoading = ref(false);
const errorMsg = ref('');
const feedbackMsg = ref('');

const statusFilter = ref('PENDING');
const moduleFilter = ref('');
const searchQuery = ref('');
const approvals = ref<any[]>([]);
const stats = ref<ApprovalStats>({
  totalPending: 0,
  actionRequiredCount: 0,
  totalPendingAmount: 0,
  byModule: { BUDGET: 0, PURCHASE_REQUEST: 0, EXPENSE: 0, PETTY_CASH: 0, CASHIER_DISCREPANCY: 0 },
  approvedThisMonth: 0,
  rejectedThisMonth: 0,
});

const isUnitManager = computed(() => auth.user?.roleCode === 'UNIT_MANAGER');
const scopeFilter = ref<'assigned' | 'all' | 'my_requests'>(
  auth.user?.roleCode === 'UNIT_MANAGER' ? 'all' : 'assigned'
);

// Selection for batch actions
const selectedIds = ref<string[]>([]);

const {
  currentPage,
  pageSize,
  totalItems,
  paginatedItems: paginatedApprovals,
} = usePagination(approvals, 8);

const rejectModalOpen = ref(false);
const detailModalOpen = ref(false);
const selectedApproval = ref<any>(null);
const detailData = ref<any>(null);
const detailLoading = ref(false);
const rejectReason = ref('');
const actionBusy = ref(false);

const eligibleForBatchCount = computed(() => {
  return approvals.value.filter((a) => a.canApprove && a.status === 'PENDING').length;
});

const isAllSelected = computed({
  get() {
    const eligibleIds = approvals.value
      .filter((a) => a.canApprove && a.status === 'PENDING')
      .map((a) => a.id);
    return eligibleIds.length > 0 && eligibleIds.every((id) => selectedIds.value.includes(id));
  },
  set(val: boolean) {
    if (val) {
      selectedIds.value = approvals.value
        .filter((a) => a.canApprove && a.status === 'PENDING')
        .map((a) => a.id);
    } else {
      selectedIds.value = [];
    }
  },
});

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function setScope(scope: 'assigned' | 'all' | 'my_requests') {
  scopeFilter.value = scope;
  currentPage.value = 1;
  selectedIds.value = [];
  loadApprovals();
}

function setModule(mod: string) {
  moduleFilter.value = mod;
  currentPage.value = 1;
  selectedIds.value = [];
  loadApprovals();
}

async function loadStats() {
  statsLoading.value = true;
  try {
    const res = await apiFetch('/approvals/stats');
    if (res.data) {
      stats.value = res.data;
    }
  } catch (err) {
    // Graceful fallback to default values
  } finally {
    statsLoading.value = false;
  }
}

async function loadApprovals() {
  loading.value = true;
  errorMsg.value = '';
  selectedIds.value = [];
  try {
    const params = new URLSearchParams();
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (moduleFilter.value) params.set('module', moduleFilter.value);
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());

    if (scopeFilter.value === 'assigned') {
      params.set('scope', 'assigned');
    } else if (scopeFilter.value === 'my_requests') {
      params.set('scope', 'my_requests');
    } else {
      params.set('scope', isUnitManager.value ? 'my_requests' : 'all');
    }

    const res = await apiFetch(`/approvals?${params.toString()}`);
    approvals.value = res.data || [];
    auth.pendingApprovalsCount = approvals.value.filter(
      (a: any) => a.canApprove && a.status === 'PENDING'
    ).length;

    loadStats();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat antrean persetujuan.';
  } finally {
    loading.value = false;
  }
}

async function viewDetail(item: any) {
  selectedApproval.value = item;
  detailModalOpen.value = true;
  detailLoading.value = true;
  detailData.value = null;
  try {
    const res = await apiFetch(`/approvals/${item.id}`);
    detailData.value = res.data;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat rincian dokumen persetujuan.';
  } finally {
    detailLoading.value = false;
  }
}

async function approveItem(item: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  actionBusy.value = true;
  try {
    await apiFetch(`/approvals/${item.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        note: `Disetujui melalui Central Approval Inbox oleh ${auth.user?.fullName}`,
      }),
    });
    feedbackMsg.value = `Dokumen ${item.entityCode} (${item.title}) berhasil disetujui.`;
    if (detailModalOpen.value) {
      detailModalOpen.value = false;
    }
    await loadApprovals();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyetujui permintaan.';
  } finally {
    actionBusy.value = false;
  }
}

function openRejectModal(item: any) {
  selectedApproval.value = item;
  rejectReason.value = '';
  rejectModalOpen.value = true;
}

async function confirmReject() {
  if (!selectedApproval.value) return;
  if (rejectReason.value.trim().length < 5) {
    errorMsg.value = 'Alasan penolakan wajib diisi minimal 5 karakter.';
    return;
  }
  actionBusy.value = true;
  errorMsg.value = '';
  try {
    const item = selectedApproval.value;
    await apiFetch(`/approvals/${item.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: rejectReason.value.trim() }),
    });
    rejectModalOpen.value = false;
    if (detailModalOpen.value) {
      detailModalOpen.value = false;
    }
    feedbackMsg.value = `Permintaan ${item.entityCode} telah ditolak beserta catatan alasan.`;
    await loadApprovals();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menolak permintaan.';
  } finally {
    actionBusy.value = false;
  }
}

async function executeBatchApprove() {
  if (selectedIds.value.length === 0) return;
  actionBusy.value = true;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/approvals/batch-approve', {
      method: 'POST',
      body: JSON.stringify({
        requestIds: selectedIds.value,
        note: `Batch approval oleh ${auth.user?.fullName}`,
      }),
    });
    const { successCount, failedCount } = res.data || {};
    feedbackMsg.value = `Batch approval berhasil memproses ${successCount} dokumen${
      failedCount > 0 ? ` (${failedCount} dokumen gagal)` : ''
    }.`;
    selectedIds.value = [];
    await loadApprovals();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengeksekusi batch approval.';
  } finally {
    actionBusy.value = false;
  }
}

function getModuleBadgeClass(module: string) {
  switch (module) {
    case 'BUDGET':
      return 'badge-budget';
    case 'PURCHASE_REQUEST':
      return 'badge-pr';
    case 'EXPENSE':
      return 'badge-expense';
    case 'PETTY_CASH':
      return 'badge-pettycash';
    case 'CASHIER_DISCREPANCY':
      return 'badge-cashier';
    default:
      return 'badge-default';
  }
}

function getModuleLabel(module: string) {
  switch (module) {
    case 'BUDGET':
      return 'Anggaran';
    case 'PURCHASE_REQUEST':
      return 'PR Pengadaan';
    case 'EXPENSE':
      return 'Pengeluaran';
    case 'PETTY_CASH':
      return 'SPJ Panjar';
    case 'CASHIER_DISCREPANCY':
      return 'Selisih Kasir';
    default:
      return module;
  }
}

onMounted(() => {
  loadApprovals();
  loadStats();
});
</script>

<template>
  <div class="approvals-view">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Inbox Approval Terpusat</h1>
        <p class="page-desc">
          Otorisasi lintas dokumen PMO UTama: Pengadaan (PR), SPJ Panjar (UMK), Usulan Anggaran, dan Pengeluaran Biaya berjenjang dengan kontrol Separation of Duties (SoD).
        </p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="btn btn-sm" :disabled="loading" @click="loadApprovals">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Segarkan Data
        </button>
      </div>
    </div>

    <!-- KPI Summary Grid -->
    <div class="stats-grid">
      <div class="stat-card hero-stat">
        <div class="stat-meta">Perlu Persetujuan Saya</div>
        <div class="stat-value text-primary">{{ stats.actionRequiredCount }}</div>
        <div class="stat-hint">Dokumen siap Anda verifikasi & putuskan</div>
      </div>
      <div class="stat-card">
        <div class="stat-meta">Total Menunggu Keputusan</div>
        <div class="stat-value">{{ stats.totalPending }}</div>
        <div class="stat-hint">Seluruh unit operasional PMO</div>
      </div>
      <div class="stat-card">
        <div class="stat-meta">Total Nilai Pending</div>
        <div class="stat-value money-stat">{{ formatRupiah(stats.totalPendingAmount) }}</div>
        <div class="stat-hint">Eksposur komitmen dana berjalan</div>
      </div>
      <div class="stat-card">
        <div class="stat-meta">Disetujui Bulan Ini</div>
        <div class="stat-value text-emerald">{{ stats.approvedThisMonth }}</div>
        <div class="stat-hint">{{ stats.rejectedThisMonth }} pengajuan ditolak</div>
      </div>
    </div>

    <!-- Tab Bar Lingkup Approval Berdasarkan Peran -->
    <div class="tab-bar">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: scopeFilter === 'assigned' }"
        @click="setScope('assigned')"
      >
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
          Perlu Persetujuan Saya
          <span v-if="stats.actionRequiredCount > 0" class="tab-count-badge">{{ stats.actionRequiredCount }}</span>
        </span>
      </button>

      <button
        type="button"
        class="tab-btn"
        :class="{ active: scopeFilter === 'all' }"
        @click="setScope('all')"
      >
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          {{ isUnitManager ? 'Semua Pengajuan Unit Saya' : 'Semua Riwayat Pengajuan' }}
        </span>
      </button>

      <button
        type="button"
        class="tab-btn"
        :class="{ active: scopeFilter === 'my_requests' }"
        @click="setScope('my_requests')"
      >
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Pengajuan Saya
        </span>
      </button>
    </div>

    <!-- Alert Banners -->
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
      title="Kontrol Kewenangan / Validasi SoD"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <!-- Module Sub-Tabs Pill Filter -->
    <div class="module-pills-bar">
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === '' }"
        @click="setModule('')"
      >
        Semua Modul
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === 'PURCHASE_REQUEST' }"
        @click="setModule('PURCHASE_REQUEST')"
      >
        PR Pengadaan LS
        <span v-if="stats.byModule.PURCHASE_REQUEST" class="pill-badge">{{ stats.byModule.PURCHASE_REQUEST }}</span>
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === 'PETTY_CASH' }"
        @click="setModule('PETTY_CASH')"
      >
        SPJ Panjar & UMK
        <span v-if="stats.byModule.PETTY_CASH" class="pill-badge">{{ stats.byModule.PETTY_CASH }}</span>
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === 'BUDGET' }"
        @click="setModule('BUDGET')"
      >
        Anggaran
        <span v-if="stats.byModule.BUDGET" class="pill-badge">{{ stats.byModule.BUDGET }}</span>
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === 'EXPENSE' }"
        @click="setModule('EXPENSE')"
      >
        Pengeluaran Biaya
        <span v-if="stats.byModule.EXPENSE" class="pill-badge">{{ stats.byModule.EXPENSE }}</span>
      </button>
      <button
        type="button"
        class="pill-btn"
        :class="{ active: moduleFilter === 'CASHIER_DISCREPANCY' }"
        @click="setModule('CASHIER_DISCREPANCY')"
      >
        Selisih Kasir
        <span v-if="stats.byModule.CASHIER_DISCREPANCY" class="pill-badge">{{ stats.byModule.CASHIER_DISCREPANCY }}</span>
      </button>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-item search-field">
        <label for="apr-search-input" class="form-label">Pencarian Cepat</label>
        <input
          id="apr-search-input"
          v-model="searchQuery"
          type="text"
          class="input"
          placeholder="Cari No. Request, Dokumen, Pemohon..."
          @keyup.enter="loadApprovals"
        />
      </div>

      <div class="filter-item">
        <label for="apr-status-filter" class="form-label">Status Persetujuan</label>
        <select id="apr-status-filter" v-model="statusFilter" class="select" @change="loadApprovals">
          <option value="ALL">Semua Status</option>
          <option value="PENDING">PENDING (Menunggu Keputusan)</option>
          <option value="APPROVED">APPROVED (Disetujui)</option>
          <option value="REJECTED">REJECTED (Ditolak)</option>
        </select>
      </div>

      <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
        <span class="text-muted" style="font-size: 0.82rem;">Total antrean:</span>
        <span class="doc-code" style="background: var(--bg-surface); font-weight: 700;">{{ approvals.length }} dokumen</span>
      </div>
    </div>

    <!-- Batch Action Toolbar (When Items Selected) -->
    <div v-if="selectedIds.length > 0" class="batch-action-bar">
      <div class="batch-info">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span><strong>{{ selectedIds.length }}</strong> dokumen dipilih untuk tindakan massal</span>
      </div>
      <div class="batch-btns">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="actionBusy"
          @click="executeBatchApprove"
        >
          Setujui Terpilih (Batch Approve)
        </button>
        <button
          type="button"
          class="btn btn-sm"
          @click="selectedIds = []"
        >
          Batalkan Pilihan
        </button>
      </div>
    </div>

    <!-- States -->
    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Antrean Persetujuan"
      message="Mengambil daftar dokumen yang membutuhkan verifikasi..."
    />

    <StateBanner
      v-else-if="approvals.length === 0 && scopeFilter === 'assigned' && isUnitManager"
      state="empty"
      title="Tidak Ada Dokumen yang Memerlukan Otorisasi Anda"
      message="Role Anda adalah Unit Manager (Pengusul Kebutuhan Unit). Wewenang persetujuan (approval) secara tata kelola berada pada Finance Manager dan General Manager PMO. Silakan klik tab 'Semua Pengajuan Unit Saya' di atas untuk melacak status dokumen yang diajukan unit Anda."
      actionLabel="Lihat Status Pengajuan Unit Saya"
      @action="setScope('all')"
    />

    <StateBanner
      v-else-if="approvals.length === 0"
      state="empty"
      title="Tidak Ada Permintaan Persetujuan Sesuai Filter"
      message="Ubah filter status ke Semua Status untuk melihat riwayat keputusan persetujuan sebelumnya."
      actionLabel="Tampilkan Semua Riwayat"
      @action="statusFilter = 'ALL'; loadApprovals()"
    />

    <!-- Main Approvals Table -->
    <div v-else class="table-wrap">
      <table class="erp-table">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">
              <input
                v-if="eligibleForBatchCount > 0"
                v-model="isAllSelected"
                type="checkbox"
                title="Pilih semua yang dapat Anda setujui"
              />
            </th>
            <th>No. Request</th>
            <th>Modul & Dokumen</th>
            <th>Uraian Permintaan</th>
            <th>Pemohon & Tanggal</th>
            <th>Role Penyetuju</th>
            <th class="money-col">Nilai / Dampak (IDR)</th>
            <th>Status</th>
            <th>Tindakan Otorisasi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in paginatedApprovals" :key="item.id" :class="{ 'row-selected': selectedIds.includes(item.id) }">
            <td style="text-align: center;">
              <input
                v-if="item.canApprove && item.status === 'PENDING'"
                type="checkbox"
                :checked="selectedIds.includes(item.id)"
                @change="toggleSelect(item.id)"
              />
            </td>
            <td>
              <span class="doc-code">{{ item.requestNumber }}</span>
              <div class="text-muted" style="font-size: 0.74rem; margin-top: 4px">{{ formatDateTime(item.createdAt) }}</div>
            </td>
            <td>
              <span class="badge" :class="getModuleBadgeClass(item.module)">{{ getModuleLabel(item.module) }}</span>
              <div style="margin-top: 4px">
                <button type="button" class="link-btn" @click="viewDetail(item)">
                  <strong>{{ item.entityCode }}</strong>
                </button>
              </div>
            </td>
            <td>
              <div style="font-weight: 600;">{{ item.title }}</div>
              <p v-if="item.exceptionReason" class="text-muted" style="margin-top: 4px; font-size: 0.8rem;">
                Catatan: {{ item.exceptionReason }}
              </p>
              <p v-if="item.decisionNote" class="text-muted" style="margin-top: 4px; font-size: 0.8rem;">
                Catatan Otorisasi ({{ item.decidedByName }}): {{ item.decisionNote }}
              </p>
            </td>
            <td>
              <div>{{ item.requestedByName }}</div>
              <div v-if="item.isSelfRequested" class="sod-badge">
                Pengusul (SoD Aktif)
              </div>
            </td>
            <td>
              <span class="doc-code">{{ item.requiredRoleCode }}</span>
            </td>
            <td class="money-col">
              <strong>{{ formatRupiah(item.amount) }}</strong>
            </td>
            <td>
              <StatusBadge :status="item.status" />
            </td>
            <td>
              <!-- Action Buttons -->
              <div v-if="item.canApprove && item.status === 'PENDING'" class="btn-row">
                <button
                  type="button"
                  class="btn btn-sm btn-success"
                  :disabled="actionBusy"
                  @click="approveItem(item)"
                >
                  Setujui
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="actionBusy"
                  @click="openRejectModal(item)"
                >
                  Tolak
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  @click="viewDetail(item)"
                >
                  Rincian
                </button>
              </div>
              <div v-else style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                <button
                  type="button"
                  class="btn btn-xs btn-outline"
                  @click="viewDetail(item)"
                >
                  Lihat Rincian
                </button>
                <span v-if="item.isSelfRequested" class="doc-code text-amber" style="font-size: 0.72rem;">
                  SoD: Diajukan Anda
                </span>
                <span v-else-if="item.status === 'PENDING'" class="doc-code text-muted" style="font-size: 0.72rem;">
                  Wewenang {{ item.requiredRoleCode }}
                </span>
                <span v-else-if="item.status === 'APPROVED'" class="doc-code text-emerald" style="font-size: 0.72rem;">
                  Disetujui
                </span>
                <span v-else-if="item.status === 'REJECTED'" class="doc-code text-rose" style="font-size: 0.72rem;">
                  Ditolak
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <PaginationControl
        v-model:currentPage="currentPage"
        v-model:pageSize="pageSize"
        :totalItems="totalItems"
        itemLabel="dokumen persetujuan"
      />
    </div>

    <!-- Detail Inspection Modal -->
    <ModalDialog :open="detailModalOpen" title="Rincian Dokumen & Jejak Audit" @close="detailModalOpen = false">
      <div v-if="detailLoading" style="text-align: center; padding: 20px;">
        <p class="text-muted">Memuat rincian dokumen...</p>
      </div>
      <div v-else-if="detailData" class="modal-detail-content">
        <div class="detail-summary-card">
          <div class="summary-line">
            <span class="text-muted">No. Request:</span>
            <span class="doc-code">{{ detailData.requestNumber }}</span>
          </div>
          <div class="summary-line">
            <span class="text-muted">Kode Dokumen:</span>
            <strong>{{ detailData.entityCode }}</strong> ({{ getModuleLabel(detailData.module) }})
          </div>
          <div class="summary-line">
            <span class="text-muted">Uraian / Judul:</span>
            <span>{{ detailData.title }}</span>
          </div>
          <div class="summary-line">
            <span class="text-muted">Diajukan Oleh:</span>
            <span>{{ detailData.requestedByName }} ({{ formatDateTime(detailData.createdAt) }})</span>
          </div>
          <div class="summary-line">
            <span class="text-muted">Nilai Dokumen:</span>
            <strong class="text-primary money-val">{{ formatRupiah(detailData.amount) }}</strong>
          </div>
          <div class="summary-line">
            <span class="text-muted">Status Dokumen:</span>
            <StatusBadge :status="detailData.status" />
          </div>
          <div v-if="detailData.decisionNote" class="summary-line">
            <span class="text-muted">Catatan Keputusan:</span>
            <em>{{ detailData.decisionNote }} (Oleh: {{ detailData.decidedByName }})</em>
          </div>
        </div>

        <!-- Entity Specific Details -->
        <div v-if="detailData.entityDetail" class="entity-breakdown">
          <h4 style="margin: 12px 0 6px 0; font-size: 0.92rem; color: var(--primary);">
            Rincian Komponen Transaksi
          </h4>

          <!-- PR Lines -->
          <div v-if="detailData.entityDetail.lines && detailData.entityDetail.lines.length > 0" class="sub-table-wrap">
            <table class="erp-table mini-table">
              <thead>
                <tr>
                  <th>Nama Barang / Jasa</th>
                  <th style="text-align: right;">Vol</th>
                  <th style="text-align: right;">Estimasi Harga Satuan</th>
                  <th style="text-align: right;">Total Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in detailData.entityDetail.lines" :key="l.id">
                  <td>{{ l.itemName }}</td>
                  <td style="text-align: right;">{{ Number(l.quantity) }}</td>
                  <td style="text-align: right;">{{ formatRupiah(l.estimatedUnitPrice) }}</td>
                  <td style="text-align: right;"><strong>{{ formatRupiah(Number(l.quantity) * Number(l.estimatedUnitPrice)) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Petty Cash Items -->
          <div v-if="detailData.entityDetail.items && detailData.entityDetail.items.length > 0" class="sub-table-wrap">
            <table class="erp-table mini-table">
              <thead>
                <tr>
                  <th>Uraian Pengeluaran</th>
                  <th style="text-align: right;">Volume</th>
                  <th style="text-align: right;">Harga Satuan</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in detailData.entityDetail.items" :key="it.id">
                  <td>{{ it.description }}</td>
                  <td style="text-align: right;">{{ Number(it.quantity) }} {{ it.unit }}</td>
                  <td style="text-align: right;">{{ formatRupiah(it.unitPrice) }}</td>
                  <td style="text-align: right;"><strong>{{ formatRupiah(it.totalPrice) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Audit Trail Timeline -->
        <div v-if="detailData.auditLogs && detailData.auditLogs.length > 0" class="audit-trail-section">
          <h4 style="margin: 14px 0 6px 0; font-size: 0.92rem; color: var(--primary);">
            Jejak Audit Forensik
          </h4>
          <ul class="audit-list">
            <li v-for="log in detailData.auditLogs" :key="log.id" class="audit-item">
              <div class="audit-time">{{ formatDateTime(log.createdAt) }}</div>
              <div class="audit-action">
                <strong>{{ log.actorName }}</strong> ({{ log.actorRole }}): {{ log.summary }}
              </div>
            </li>
          </ul>
        </div>

        <!-- Modal Action Footer -->
        <div class="btn-row" style="justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="btn btn-sm" @click="detailModalOpen = false">Tutup</button>
          <button
            v-if="detailData.canApprove && detailData.status === 'PENDING'"
            type="button"
            class="btn btn-sm btn-danger"
            :disabled="actionBusy"
            @click="openRejectModal(detailData)"
          >
            Tolak Pengajuan
          </button>
          <button
            v-if="detailData.canApprove && detailData.status === 'PENDING'"
            type="button"
            class="btn btn-sm btn-success"
            :disabled="actionBusy"
            @click="approveItem(detailData)"
          >
            Setujui Dokumen Ini
          </button>
        </div>
      </div>
    </ModalDialog>

    <!-- Reject Reason Modal Dialog -->
    <ModalDialog :open="rejectModalOpen" title="Tolak Pengajuan Dokumen" @close="rejectModalOpen = false">
      <div v-if="selectedApproval" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Anda akan menolak permohonan <strong>{{ selectedApproval.entityCode }}</strong> ({{ selectedApproval.title }}).
        </p>
        <div class="form-field">
          <label for="reject-reason-input" class="form-label">Alasan Penolakan Resmi (Wajib Minimal 5 Karakter)</label>
          <textarea
            id="reject-reason-input"
            v-model="rejectReason"
            class="textarea"
            rows="3"
            placeholder="Contoh: Rincian SPJ nota belum memenuhi standar perpajakan atau anggaran melampaui alokasi kuartal."
            required
          ></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="rejectModalOpen = false">Batal</button>
          <button
            type="button"
            class="btn btn-sm btn-danger"
            :disabled="actionBusy || rejectReason.trim().length < 5"
            @click="confirmReject"
          >
            Konfirmasi Penolakan
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.approvals-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stat {
  border-left: 4px solid var(--primary);
  background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);
}

.stat-meta {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.money-stat {
  font-size: 1.35rem;
}

.stat-hint {
  font-size: 0.76rem;
  color: var(--text-muted);
}

.text-emerald {
  color: #059669;
}

.text-rose {
  color: #e11d48;
}

.text-amber {
  color: #d97706;
}

.text-primary {
  color: var(--primary);
}

.tab-bar {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid var(--border-subtle);
  padding-bottom: 2px;
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 8px 14px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.tab-btn:hover {
  color: var(--primary);
  background: var(--bg-subtle);
}

.tab-btn.active {
  color: var(--primary);
  border-bottom: 3px solid var(--primary);
  background: var(--bg-surface);
}

.tab-count-badge {
  background: #ef4444;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.module-pills-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pill-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  padding: 5px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.pill-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.pill-btn.active {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
}

.pill-badge {
  background: rgba(0, 0, 0, 0.12);
  color: inherit;
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.pill-btn.active .pill-badge {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: var(--bg-subtle);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}

.search-field {
  flex: 1;
  min-width: 240px;
}

.batch-action-bar {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  animation: slideDown 0.2s ease-out;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1e40af;
  font-size: 0.88rem;
}

.batch-btns {
  display: flex;
  gap: 8px;
}

.row-selected {
  background-color: #f0f7ff !important;
}

.link-btn {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.86rem;
}

.badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  display: inline-block;
  text-transform: uppercase;
}

.badge-pr {
  background: #e0e7ff;
  color: #3730a3;
}

.badge-pettycash {
  background: #fef3c7;
  color: #92400e;
}

.badge-budget {
  background: #dbeafe;
  color: #1e40af;
}

.badge-expense {
  background: #fce7f3;
  color: #9d174d;
}

.badge-cashier {
  background: #e0f2fe;
  color: #0369a1;
}

.badge-default {
  background: var(--status-neutral-bg);
  color: var(--status-neutral-text);
}

.sod-badge {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  border-radius: var(--radius-sm);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 5px;
  margin-top: 3px;
}

.modal-detail-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-summary-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.86rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.mini-table {
  font-size: 0.8rem;
  margin-top: 6px;
}

.mini-table th,
.mini-table td {
  padding: 6px 8px;
}

.audit-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.audit-item {
  font-size: 0.78rem;
  background: var(--bg-surface);
  border-left: 3px solid var(--primary);
  padding: 6px 10px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.audit-time {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.btn-xs {
  padding: 2px 6px;
  font-size: 0.72rem;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
