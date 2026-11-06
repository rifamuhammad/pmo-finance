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

const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');
const statusFilter = ref('PENDING');
const moduleFilter = ref('');
const approvals = ref<any[]>([]);

const isUnitManager = computed(() => auth.user?.roleCode === 'UNIT_MANAGER');
const scopeFilter = ref<'assigned' | 'all'>(auth.user?.roleCode === 'UNIT_MANAGER' ? 'all' : 'assigned');

const {
  currentPage,
  pageSize,
  totalItems,
  paginatedItems: paginatedApprovals,
} = usePagination(approvals, 5);

const rejectModalOpen = ref(false);
const selectedApproval = ref<any>(null);
const rejectReason = ref('');
const actionBusy = ref(false);

function setScope(scope: 'assigned' | 'all') {
  scopeFilter.value = scope;
  currentPage.value = 1;
  loadApprovals();
}

async function loadApprovals() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams();
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (moduleFilter.value) params.set('module', moduleFilter.value);
    params.set('scope', scopeFilter.value === 'assigned' ? 'assigned' : (isUnitManager.value ? 'my_requests' : 'all'));
    const res = await apiFetch(`/reports/approvals?${params.toString()}`);
    approvals.value = res.data || [];
    auth.pendingApprovalsCount = approvals.value.filter(
      (a: any) => a.canApprove && a.status === 'PENDING'
    ).length;
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat antrean persetujuan.';
  } finally {
    loading.value = false;
  }
}

async function approveItem(item: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  actionBusy.value = true;
  try {
    let endpoint = '';
    if (item.module === 'BUDGET') endpoint = `/budgets/${item.entityId}/approve`;
    else if (item.module === 'PURCHASE_REQUEST') endpoint = `/procurement/purchase-requests/${item.entityId}/approve`;
    else if (item.module === 'EXPENSE') endpoint = `/procurement/expenses/${item.entityId}/approve`;
    else if (item.module === 'CASHIER_DISCREPANCY') endpoint = `/revenue/cashier/sessions/${item.entityId}/approve-close`;

    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ note: `Disetujui melalui Approval Inbox oleh ${auth.user?.fullName}` }),
    });
    feedbackMsg.value = `Dokumen ${item.entityCode} berhasil disetujui dan statusnya telah diperbarui.`;
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
    let endpoint = '';
    if (item.module === 'BUDGET') endpoint = `/budgets/${item.entityId}/reject`;
    else if (item.module === 'PURCHASE_REQUEST') endpoint = `/procurement/purchase-requests/${item.entityId}/reject`;
    else if (item.module === 'EXPENSE') endpoint = `/procurement/expenses/${item.entityId}/reject`;
    else throw new Error('Gunakan halaman modul terkait untuk penolakan item ini.');

    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ reason: rejectReason.value.trim() }),
    });
    rejectModalOpen.value = false;
    feedbackMsg.value = `Permintaan ${item.entityCode} telah ditolak beserta catatan alasan.`;
    await loadApprovals();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menolak permintaan.';
  } finally {
    actionBusy.value = false;
  }
}

onMounted(loadApprovals);
</script>

<template>
  <div class="approvals-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Kotak Masuk Persetujuan</h1>
        <p class="page-desc">
          Otorisasi berjenjang pengajuan anggaran, pengadaan barang/jasa, dan pengeluaran biaya.
        </p>
      </div>
      <button type="button" class="btn btn-sm" @click="loadApprovals">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Muat Ulang
      </button>
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
          {{ isUnitManager ? 'Status Pengajuan Unit Saya' : 'Semua Riwayat Pengajuan' }}
        </span>
      </button>
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
      title="Kontrol Kewenangan / Validasi"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <div class="filter-bar">
      <div class="filter-item">
        <label for="apr-status-filter" class="form-label">Status Persetujuan</label>
        <select id="apr-status-filter" v-model="statusFilter" class="select" @change="loadApprovals">
          <option value="">Semua Status</option>
          <option value="PENDING">PENDING (Menunggu Keputusan)</option>
          <option value="APPROVED">APPROVED (Disetujui)</option>
          <option value="REJECTED">REJECTED (Ditolak)</option>
        </select>
      </div>

      <div class="filter-item">
        <label for="apr-module-filter" class="form-label">Jenis Modul</label>
        <select id="apr-module-filter" v-model="moduleFilter" class="select" @change="loadApprovals">
          <option value="">Semua Modul</option>
          <option value="BUDGET">Anggaran (BUDGET)</option>
          <option value="PURCHASE_REQUEST">Purchase Request (PR)</option>
          <option value="EXPENSE">Pengeluaran Biaya (EXPENSE)</option>
          <option value="CASHIER_DISCREPANCY">Selisih Kasir (CASHIER_DISCREPANCY)</option>
        </select>
      </div>

      <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
        <span class="text-muted" style="font-size: 0.82rem;">Total antrean:</span>
        <span class="doc-code" style="background: var(--bg-surface); font-weight: 700;">{{ approvals.length }} dokumen</span>
      </div>
    </div>

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
      message="Role Anda adalah Unit Manager (Pengusul Kebutuhan Unit). Wewenang persetujuan (approval) secara tata kelola berada pada Finance Manager dan General Manager PMO. Silakan klik tab 'Status Pengajuan Unit Saya' di atas untuk melacak status dokumen yang diajukan unit Anda."
      actionLabel="Lihat Status Pengajuan Unit Saya"
      @action="setScope('all')"
    />

    <StateBanner
      v-else-if="approvals.length === 0"
      state="empty"
      title="Tidak Ada Permintaan Persetujuan Sesuai Filter"
      message="Ubah filter status ke Semua Status untuk melihat riwayat keputusan persetujuan sebelumnya."
      actionLabel="Tampilkan Semua Riwayat"
      @action="statusFilter = ''; loadApprovals()"
    />

    <div v-else class="table-wrap">
      <table class="erp-table">
        <thead>
          <tr>
            <th>No. Request</th>
            <th>Modul & Dokumen</th>
            <th>Uraian Permintaan</th>
            <th>Pemohon</th>
            <th>Role Penyetuju</th>
            <th class="money-col">Nilai / Dampak (IDR)</th>
            <th>Status</th>
            <th>Tindakan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in paginatedApprovals" :key="item.id">
            <td>
              <span class="doc-code">{{ item.requestNumber }}</span>
              <div class="text-muted" style="font-size: 0.76rem; margin-top: 4px">{{ formatDateTime(item.createdAt) }}</div>
            </td>
            <td>
              <span class="doc-code">{{ item.module }}</span>
              <div style="margin-top: 4px"><strong>{{ item.entityCode }}</strong></div>
            </td>
            <td>
              <strong>{{ item.title }}</strong>
              <p v-if="item.exceptionReason" class="text-muted" style="margin-top: 4px">
                Catatan/Alasan: {{ item.exceptionReason }}
              </p>
              <p v-if="item.decisionNote" class="text-muted" style="margin-top: 4px">
                Keputusan ({{ item.decidedByName }}): {{ item.decisionNote }}
              </p>
            </td>
            <td>{{ item.requestedByName }}</td>
            <td><span class="doc-code">{{ item.requiredRoleCode }}</span></td>
            <td class="money-col"><strong>{{ formatRupiah(item.amount) }}</strong></td>
            <td><StatusBadge :status="item.status" /></td>
            <td>
              <div v-if="item.canApprove" class="btn-row">
                <button
                  type="button"
                  class="btn btn-sm btn-success"
                  :disabled="actionBusy"
                  @click="approveItem(item)"
                >
                  Setujui
                </button>
                <button
                  v-if="['BUDGET', 'PURCHASE_REQUEST', 'EXPENSE'].includes(item.module)"
                  type="button"
                  class="btn btn-sm btn-danger"
                  :disabled="actionBusy"
                  @click="openRejectModal(item)"
                >
                  Tolak
                </button>
              </div>
              <div v-else style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                <span v-if="item.requestedById === auth.user?.id" class="doc-code text-blue" style="font-size: 0.74rem;">
                  Diajukan oleh Anda (Separation of Duties)
                </span>
                <span v-else-if="item.status === 'PENDING'" class="doc-code text-amber" style="font-size: 0.74rem;">
                  Wewenang {{ item.requiredRoleCode }}
                </span>
                <span v-else-if="item.status === 'APPROVED'" class="doc-code text-emerald" style="font-size: 0.74rem;">
                  Disetujui
                </span>
                <span v-else-if="item.status === 'REJECTED'" class="doc-code text-rose" style="font-size: 0.74rem;">
                  Ditolak
                </span>
                <span v-else class="text-muted" style="font-size: 0.74rem;">
                  {{ item.status }}
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

    <ModalDialog :open="rejectModalOpen" title="Tolak Pengajuan Dokumen" @close="rejectModalOpen = false">
      <div v-if="selectedApproval" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Anda akan menolak dokumen <strong>{{ selectedApproval.entityCode }}</strong> ({{ selectedApproval.title }}).
        </p>
        <div class="form-field">
          <label for="reject-reason-input" class="form-label">Alasan Penolakan (Wajib Diisi)</label>
          <textarea
            id="reject-reason-input"
            v-model="rejectReason"
            class="textarea"
            placeholder="Contoh: Lampiran rincian spesifikasi teknis belum lengkap atau melebihi prioritas kuartal ini."
            required
          ></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="rejectModalOpen = false">Batal</button>
          <button type="button" class="btn btn-sm btn-danger" :disabled="actionBusy" @click="confirmReject">
            Konfirmasi Penolakan
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>
