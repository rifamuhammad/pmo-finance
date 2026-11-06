<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AlertBanner from '../components/AlertBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import { api } from '../services/api';
import { formatRupiah as formatCurrency, formatDate } from '../utils/format';

type ActiveTab = 'EMPLOYEES' | 'ATTENDANCE' | 'PAYROLL';

interface EmployeeRecord {
  id: string;
  nip: string;
  nik: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  businessUnitId: string | null;
  businessUnitName?: string;
  department: string;
  position: string;
  employmentStatus: string;
  joinDate: string;
  baseSalary: number;
  positionAllowance: number;
  transportAllowance: number;
  totalAllowance: number;
  totalTakeHomePayEstimasi: number;
  bankName: string;
  bankAccountNo: string | null;
  bankAccountHolder: string | null;
  npwp: string | null;
  bpjsKesehatanNo: string | null;
  bpjsKetenagakerjaanNo: string | null;
  status: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee: {
    nip: string;
    fullName: string;
    department: string;
    position: string;
  };
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'PRESENT' | 'LATE' | 'SICK' | 'LEAVE' | 'ALPHA';
  notes: string | null;
  verifiedBy: string | null;
}

interface SalarySlipRecord {
  id: string;
  slipNumber: string;
  employeeId: string;
  employeeName: string;
  employeeNip: string;
  department: string;
  position: string;
  bankInfo: string;
  periodMonth: number;
  periodYear: number;
  baseSalary: number;
  allowanceTotal: number;
  overtimeAmount: number;
  deductionAbsence: number;
  deductionBpjs: number;
  deductionPph21: number;
  grossSalary: number;
  netSalary: number;
  status: string;
  paymentDate: string | null;
  journalNumber: string | null;
  notes: string | null;
}

const currentTab = ref<ActiveTab>('EMPLOYEES');
const loading = ref(false);
const errorMessage = ref('');

const employees = ref<EmployeeRecord[]>([]);
const attendances = ref<AttendanceRecord[]>([]);
const salarySlips = ref<SalarySlipRecord[]>([]);

// Filter
const searchQuery = ref('');
const filterDepartment = ref('ALL');

// Modal Detail Slip Gaji
const showSlipModal = ref(false);
const selectedSlip = ref<SalarySlipRecord | null>(null);

const filteredEmployees = computed(() => {
  return employees.value.filter((emp) => {
    const matchDept =
      filterDepartment.value === 'ALL' || emp.department.includes(filterDepartment.value);
    const q = searchQuery.value.trim().toLowerCase();
    const matchQuery =
      !q ||
      emp.nip.toLowerCase().includes(q) ||
      emp.fullName.toLowerCase().includes(q) ||
      emp.position.toLowerCase().includes(q) ||
      emp.department.toLowerCase().includes(q);

    return matchDept && matchQuery;
  });
});

const totalPayrollMonthly = computed(() => {
  return employees.value.reduce((acc, curr) => acc + curr.totalTakeHomePayEstimasi, 0);
});

async function loadData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [empRes, attRes, slipRes] = await Promise.all([
      api.get<EmployeeRecord[]>('/hris/employees'),
      api.get<AttendanceRecord[]>('/hris/attendance'),
      api.get<SalarySlipRecord[]>('/hris/payroll')
    ]);

    employees.value = empRes.data || [];
    attendances.value = attRes.data || [];
    salarySlips.value = slipRes.data || [];
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal memuat data HRIS & Payroll PMO';
  } finally {
    loading.value = false;
  }
}

function exportExpenditureFormat() {
  const headers = ['No', 'NIK', 'Nama_Penerima', 'Unit_Kerja', 'Jabatan', 'Nama_Bank', 'Nomor_Rekening', 'Gaji_Pokok_IDR', 'Tunjangan_IDR', 'Potongan_Pajak_BPJS_IDR', 'Netto_Take_Home_Pay_IDR', 'Status_Pengajuan'];
  const rows = salarySlips.value.map((s, idx) => {
    const emp = employees.value.find(e => e.id === s.employeeId);
    return [
      idx + 1,
      emp?.nik ? `="${emp.nik}"` : '-',
      `"${s.employeeName.replace(/"/g, '""')}"`,
      `"${s.department.replace(/"/g, '""')}"`,
      `"${s.position.replace(/"/g, '""')}"`,
      `"${s.bankInfo.replace(/"/g, '""')}"`,
      emp?.bankAccountNo ? `="${emp.bankAccountNo}"` : '-',
      s.baseSalary,
      s.allowanceTotal,
      s.deductionBpjs + s.deductionPph21,
      s.netSalary,
      'SIAP_SETOR_EXPENDITURE'
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Rekap_Nominatif_LS_Expenditure_PBI_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openSlip(slip: SalarySlipRecord) {
  selectedSlip.value = slip;
  showSlipModal.value = true;
}

function attBadge(status: AttendanceRecord['status']) {
  switch (status) {
    case 'PRESENT':
      return { label: 'Hadir Tepat Waktu', tone: 'success' };
    case 'LATE':
      return { label: 'Terlambat', tone: 'warning' };
    case 'SICK':
      return { label: 'Sakit', tone: 'info' };
    case 'LEAVE':
      return { label: 'Cuti Resmi', tone: 'neutral' };
    case 'ALPHA':
      return { label: 'Alpha / Tanpa Ket.', tone: 'danger' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

onMounted(loadData);
</script>

<template>
  <div class="hris-view">
    <!-- Header -->
    <header class="page-header">
      <div>
        <h1 class="page-title">Sumber Daya Manusia &amp; Penggajian (HRIS)</h1>
        <p class="page-desc">
          Sistem informasi kepegawaian internal PMO: database karyawan divisi MICE, TCI, IT, Klinik, rekap presensi kehadiran harian, serta payroll slip gaji bulanan.
        </p>
      </div>

      <div class="tab-bar-wrap">
        <div class="tab-bar" role="tablist">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: currentTab === 'EMPLOYEES' }"
            @click="currentTab = 'EMPLOYEES'"
          >
            Database SDM ({{ employees.length }})
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: currentTab === 'ATTENDANCE' }"
            @click="currentTab = 'ATTENDANCE'"
          >
            Presensi &amp; Absensi
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: currentTab === 'PAYROLL' }"
            @click="currentTab = 'PAYROLL'"
          >
            Slip Gaji &amp; Payroll
          </button>
        </div>
      </div>
    </header>

    <!-- Top KPI Strip -->
    <section class="metric-strip">
      <div class="metric-box focal">
        <div class="metric-label">Total Pegawai Aktif PMO</div>
        <div class="metric-value">{{ employees.length }} Orang</div>
        <div class="metric-sub">Tersebar di 5 Unit Bisnis PMO UTama</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Total Beban Gaji Bulanan</div>
          <span class="erp-badge erp-badge-info">Anggaran PMO</span>
        </div>
        <div class="metric-value money">{{ formatCurrency(totalPayrollMonthly) }}</div>
        <div class="metric-sub">Gaji Pokok + Tunjangan Tetap</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Tingkat Kehadiran</div>
          <span class="erp-badge erp-badge-success">Bulan Berjalan</span>
        </div>
        <div class="metric-value text-emerald">98.4%</div>
        <div class="metric-sub">Presensi terverifikasi HRD</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Status Payroll Terakhir</div>
          <span class="erp-badge erp-badge-success">Disbursed</span>
        </div>
        <div class="metric-value text-emerald">Terbayar Lunas</div>
        <div class="metric-sub">Payroll via Bank Mandiri Payroll System</div>
      </div>
    </section>

    <AlertBanner
      v-if="errorMessage"
      variant="danger"
      title="Pemberitahuan Sistem HRIS"
      :message="errorMessage"
      @dismiss="errorMessage = ''"
    />

    <!-- TAB 1: EMPLOYEES DATABASE -->
    <div v-if="currentTab === 'EMPLOYEES'" class="tab-pane">
      <div class="filter-bar">
        <div class="filter-item filter-search">
          <label class="form-label">Pencarian Pegawai</label>
          <input
            v-model="searchQuery"
            type="search"
            class="input"
            placeholder="Cari NIP, nama pegawai, jabatan, unit..."
          />
        </div>

        <div class="filter-item">
          <label class="form-label">Filter Unit Bisnis / Divisi</label>
          <select v-model="filterDepartment" class="select">
            <option value="ALL">Semua Divisi / Unit</option>
            <option value="MICE">Divisi MICE</option>
            <option value="TCI">Divisi TCI</option>
            <option value="IT">Divisi IT Solution</option>
            <option value="Klinik">Divisi Klinik Pratama</option>
            <option value="Pusat">Operasional &amp; Pusat</option>
          </select>
        </div>
      </div>

      <section class="panel panel-elevated">
        <div class="panel-header">
          <div>
            <h2 class="section-title">Data Pokok SDM &amp; Pegawai PMO UTama</h2>
            <p class="text-muted">
              Menampilkan {{ filteredEmployees.length }} dari {{ employees.length }} pegawai terdaftar
            </p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>NIP &amp; Nama Pegawai</th>
                <th>Divisi &amp; Unit</th>
                <th>Jabatan / Posisi</th>
                <th>Status Kerja</th>
                <th class="money-col">Gaji Pokok</th>
                <th class="money-col">Tunjangan</th>
                <th class="money-col">Estimasi THP</th>
                <th>Rekening Payroll</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="emp in filteredEmployees" :key="emp.id">
                <td>
                  <strong class="doc-code">{{ emp.nip }}</strong>
                  <div class="table-title">{{ emp.fullName }}</div>
                  <div class="table-sub">NIK: {{ emp.nik }}</div>
                </td>
                <td>
                  <div style="font-weight: 600;">{{ emp.department }}</div>
                  <div class="table-sub" v-if="emp.email">{{ emp.email }}</div>
                </td>
                <td>
                  <span class="role-chip">{{ emp.position }}</span>
                </td>
                <td>
                  <span class="erp-badge" :class="emp.employmentStatus === 'PERMANENT' ? 'erp-badge-success' : 'erp-badge-warn'">
                    {{ emp.employmentStatus === 'PERMANENT' ? 'Pegawai Tetap' : 'Kontrak' }}
                  </span>
                </td>
                <td class="money-col">{{ formatCurrency(emp.baseSalary) }}</td>
                <td class="money-col">{{ formatCurrency(emp.totalAllowance) }}</td>
                <td class="money-col font-bold text-emerald">
                  {{ formatCurrency(emp.totalTakeHomePayEstimasi) }}
                </td>
                <td>
                  <div class="bank-pill">
                    <strong>{{ emp.bankName }}</strong>
                    <span>{{ emp.bankAccountNo }}</span>
                  </div>
                </td>
                <td style="text-align: center;">
                  <span class="condition-chip cond-good">
                    <span class="cond-dot"></span>
                    Aktif
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 2: ATTENDANCE RECAP -->
    <div v-if="currentTab === 'ATTENDANCE'" class="tab-pane">
      <section class="panel panel-elevated">
        <div class="panel-header">
          <div>
            <h2 class="section-title">Rekap Presensi &amp; Absensi Pegawai PMO</h2>
            <p class="text-muted">Catatan waktu kehadiran kerja, jam masuk, jam pulang, dan verifikasi kehadiran tim HRD.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>NIP &amp; Nama Pegawai</th>
                <th>Divisi &amp; Jabatan</th>
                <th style="text-align: center;">Jam Masuk</th>
                <th style="text-align: center;">Jam Pulang</th>
                <th>Status Kehadiran</th>
                <th>Keterangan / Verifikasi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="att in attendances" :key="att.id">
                <td style="font-weight: 600;">{{ formatDate(att.date) }}</td>
                <td>
                  <strong class="doc-code">{{ att.employee.nip }}</strong>
                  <div class="table-title">{{ att.employee.fullName }}</div>
                </td>
                <td>
                  <div style="font-weight: 600;">{{ att.employee.department }}</div>
                  <div class="table-sub">{{ att.employee.position }}</div>
                </td>
                <td style="text-align: center;">
                  <span class="time-chip" v-if="att.checkIn">
                    {{ new Date(att.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }}
                  </span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td style="text-align: center;">
                  <span class="time-chip" v-if="att.checkOut">
                    {{ new Date(att.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }}
                  </span>
                  <span v-else class="text-muted">-</span>
                </td>
                <td>
                  <span class="condition-chip" :class="att.status === 'PRESENT' ? 'cond-good' : 'cond-warn'">
                    <span class="cond-dot"></span>
                    {{ attBadge(att.status).label }}
                  </span>
                </td>
                <td>
                  <div>{{ att.notes || '-' }}</div>
                  <div class="table-sub" v-if="att.verifiedBy">Verifikator: {{ att.verifiedBy }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 3: PAYROLL & SALARY SLIPS -->
    <div v-if="currentTab === 'PAYROLL'" class="tab-pane">
      <section class="panel panel-elevated">
        <div class="panel-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 class="section-title">Daftar Penggajian &amp; Slip Gaji Pegawai PMO</h2>
            <p class="text-muted">
              Rincian gaji bruto, tunjangan operasional, potongan BPJS/PPh 21, dan take home pay netto yang ditransfer ke rekening bank pegawai.
            </p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              style="display: flex; align-items: center; gap: 6px;"
              title="Unduh data nominatif honor berformat CSV/Excel yang kompatibel dengan template impor Aplikasi Expenditure PBI"
              @click="exportExpenditureFormat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Ekspor Format Expenditure PBI
            </button>
          </div>
        </div>

        <!-- Cut-Off 25 Safety Buffer Alert -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <span style="font-size: 1.1rem;">⏱️</span>
            <div>
              <strong style="color: #166534; font-size: 0.85rem;">Siklus Pengeluaran LS: Cut-Off Kunci Data Tanggal 25</strong>
              <div style="color: #15803d; font-size: 0.78rem;">Data presensi dan honorarium bulan berjalan wajib selesai tgl 25 agar berkas fisik siap diserahkan ke BPU PBI sebelum batas tgl 30.</div>
            </div>
          </div>
          <span style="background: #16a34a; color: #ffffff; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 12px;">Buffer 5 Hari Aman</span>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. Slip Gaji</th>
                <th>Nama Pegawai &amp; NIP</th>
                <th>Periode</th>
                <th class="money-col">Gaji Pokok</th>
                <th class="money-col">Tunjangan</th>
                <th class="money-col">Potongan</th>
                <th class="money-col">Gaji Bersih (Netto)</th>
                <th>Status Transfer</th>
                <th style="text-align: right;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="slip in salarySlips" :key="slip.id">
                <td>
                  <strong class="doc-code">{{ slip.slipNumber }}</strong>
                  <div class="table-sub">{{ slip.bankInfo }}</div>
                </td>
                <td>
                  <div class="table-title">{{ slip.employeeName }}</div>
                  <div class="table-sub">{{ slip.department }} · {{ slip.position }}</div>
                </td>
                <td style="font-weight: 600;">Bulan {{ slip.periodMonth }}/{{ slip.periodYear }}</td>
                <td class="money-col">{{ formatCurrency(slip.baseSalary) }}</td>
                <td class="money-col">{{ formatCurrency(slip.allowanceTotal) }}</td>
                <td class="money-col text-danger">
                  - {{ formatCurrency(slip.deductionBpjs + slip.deductionPph21) }}
                </td>
                <td class="money-col font-bold text-emerald">
                  {{ formatCurrency(slip.netSalary) }}
                </td>
                <td>
                  <span class="erp-badge erp-badge-success">Sudah Ditransfer</span>
                  <div class="table-sub" v-if="slip.paymentDate">{{ formatDate(slip.paymentDate) }}</div>
                </td>
                <td style="text-align: right;">
                  <button type="button" class="btn btn-sm" @click="openSlip(slip)">
                    Lihat Slip Gaji
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Modal Slip Gaji Pegawai -->
    <ModalDialog
      :open="showSlipModal"
      :title="selectedSlip ? `Slip Gaji: ${selectedSlip.slipNumber}` : 'Slip Gaji Pegawai'"
      @close="showSlipModal = false"
    >
      <div v-if="selectedSlip" class="slip-wrap">
        <div class="slip-header-box">
          <div>
            <span class="erp-badge erp-badge-info">SLIP GAJI RESMI PMO UTAMA</span>
            <h3 class="slip-emp-name">{{ selectedSlip.employeeName }}</h3>
            <p class="text-muted">{{ selectedSlip.employeeNip }} · {{ selectedSlip.department }} · {{ selectedSlip.position }}</p>
          </div>
          <div style="text-align: right;">
            <span class="slip-meta-label">Take Home Pay (THP Netto)</span>
            <strong class="slip-total money text-emerald">{{ formatCurrency(selectedSlip.netSalary) }}</strong>
          </div>
        </div>

        <div class="slip-grid">
          <!-- Penghasilan Bruto -->
          <div class="slip-col">
            <h4 class="slip-col-title">Penghasilan (Earnings)</h4>
            <div class="slip-row">
              <span>Gaji Pokok:</span>
              <strong class="money">{{ formatCurrency(selectedSlip.baseSalary) }}</strong>
            </div>
            <div class="slip-row">
              <span>Tunjangan Operasional:</span>
              <strong class="money">{{ formatCurrency(selectedSlip.allowanceTotal) }}</strong>
            </div>
            <div class="slip-row" v-if="selectedSlip.overtimeAmount > 0">
              <span>Lembur:</span>
              <strong class="money">{{ formatCurrency(selectedSlip.overtimeAmount) }}</strong>
            </div>
            <div class="slip-row subtotal-row">
              <span>Total Penghasilan Bruto:</span>
              <strong class="money">{{ formatCurrency(selectedSlip.grossSalary) }}</strong>
            </div>
          </div>

          <!-- Potongan -->
          <div class="slip-col">
            <h4 class="slip-col-title">Potongan (Deductions)</h4>
            <div class="slip-row">
              <span>Iuran BPJS Ketenagakerjaan:</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedSlip.deductionBpjs) }}</strong>
            </div>
            <div class="slip-row">
              <span>Pajak Penghasilan (PPh 21):</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedSlip.deductionPph21) }}</strong>
            </div>
            <div class="slip-row" v-if="selectedSlip.deductionAbsence > 0">
              <span>Potongan Kehadiran:</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedSlip.deductionAbsence) }}</strong>
            </div>
            <div class="slip-row subtotal-row">
              <span>Total Potongan:</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedSlip.deductionBpjs + selectedSlip.deductionPph21 + selectedSlip.deductionAbsence) }}</strong>
            </div>
          </div>
        </div>

        <div class="slip-bank-box">
          <div>
            <span class="slip-meta-label">Rekening Pembayaran Payroll</span>
            <strong>{{ selectedSlip.bankInfo }}</strong>
          </div>
          <div style="text-align: right;">
            <span class="slip-meta-label">Status Pembayaran</span>
            <span class="erp-badge erp-badge-success">LUNAS · Bank Mandiri Corporate</span>
          </div>
        </div>

        <div class="modal-action-row">
          <button type="button" class="btn" @click="showSlipModal = false">
            Tutup
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.hris-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  /* Bottom clearance to prevent MacDock overlap */
  padding-bottom: 96px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.metric-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.erp-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: var(--radius-full);
  line-height: 1.2;
}

.erp-badge-warn {
  background: var(--status-warning-bg);
  color: var(--status-warning-text);
  border: 1px solid var(--status-warning-border);
}

.erp-badge-success {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border: 1px solid var(--status-success-border);
}

.erp-badge-info {
  background: var(--status-info-bg);
  color: var(--status-info-text);
  border: 1px solid var(--status-info-border);
}

.text-emerald {
  color: var(--status-success-text) !important;
}

.text-danger {
  color: var(--status-danger-text) !important;
}

.font-bold {
  font-weight: 700;
}

.table-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 3px;
}

.table-sub {
  font-size: 0.76rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: var(--primary-soft);
  color: var(--primary);
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
}

.bank-pill {
  display: flex;
  flex-direction: column;
  font-size: 0.76rem;
}

.bank-pill span {
  color: var(--text-secondary);
}

.time-chip {
  display: inline-block;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
}

.condition-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.74rem;
  font-weight: 600;
}

.cond-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.cond-good {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border: 1px solid var(--status-success-border);
}

.cond-warn {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border: 1px solid var(--status-danger-border);
}

/* Modal Slip Gaji */
.slip-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slip-header-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}

.slip-emp-name {
  margin: 6px 0 2px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.slip-meta-label {
  display: block;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.slip-total {
  font-size: 1.45rem;
  font-weight: 700;
}

.slip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.slip-col {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slip-col-title {
  margin: 0 0 4px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 8px;
}

.slip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.subtotal-row {
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
  margin-top: 4px;
  font-weight: 700;
}

.slip-bank-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 18px;
  font-size: 0.85rem;
}

.modal-action-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

@media (max-width: 900px) {
  .slip-grid {
    grid-template-columns: 1fr;
  }
}
</style>
