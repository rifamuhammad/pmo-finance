<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AlertBanner from '../components/AlertBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import { api } from '../services/api';
import { formatRupiah as formatCurrency, formatDate } from '../utils/format';

type ActiveTab = 'EMPLOYEES' | 'ATTENDANCE' | 'PAYROLL' | 'CALCULATOR_SBM';

interface ContractRecord {
  id: string;
  contractNumber: string;
  contractType: string;
  startDate: string;
  endDate: string;
  salaryRate: number | null;
  status: string;
  alertStatus: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RENEWED' | 'TERMINATED';
  daysRemaining: number;
  notes: string | null;
  signedDate: string | null;
}

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
  contracts?: ContractRecord[];
  activeContract?: ContractRecord | null;
  contractStatus?: string;
  daysUntilContractEnd?: number | null;
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
  overtimeHours?: number;
  notes: string | null;
  verifiedBy: string | null;
}

interface UnitRecapEmployee {
  employeeId: string;
  nip: string;
  fullName: string;
  department: string;
  position: string;
  employmentStatus: string;
  totalLoggedDays: number;
  presentDays: number;
  lateDays: number;
  sickDays: number;
  leaveDays: number;
  alphaDays: number;
  overtimeHours: number;
  mealAllowanceAmount: number;
  overtimeAmount: number;
  totalSbmEntitlement: number;
  isVerified: boolean;
}

interface UnitRecapItem {
  unitId: string;
  unitCode: string;
  unitName: string;
  managerName: string;
  totalEmployees: number;
  presentDays: number;
  sickDays: number;
  leaveDays: number;
  alphaDays: number;
  overtimeHours: number;
  mealAllowanceAmount: number;
  overtimeCost: number;
  totalSbmCost: number;
  isVerified: boolean;
  status: 'VERIFIED' | 'PENDING_VERIFICATION';
  employees: UnitRecapEmployee[];
}

interface UnitRecapResponse {
  periodMonth: number;
  periodYear: number;
  units: UnitRecapItem[];
  summary: {
    totalUnits: number;
    totalEmployees: number;
    totalPresentDays: number;
    totalSickDays: number;
    totalLeaveDays: number;
    totalAlphaDays: number;
    totalOvertimeHours: number;
    totalMealAllowance: number;
    totalOvertimeCost: number;
    grandTotalSbm: number;
    standardMealPerDay: number;
    standardOvertimePerHour: number;
  };
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
const feedbackMessage = ref('');

const employees = ref<EmployeeRecord[]>([]);
const attendances = ref<AttendanceRecord[]>([]);
const salarySlips = ref<SalarySlipRecord[]>([]);

// SBM Calculator State
const calcEmployeeId = ref('');
const calcWorkDays = ref(22);
const calcOvertimeHours = ref(0);
const calcPtkpCategory = ref<'TER_A' | 'TER_B' | 'TER_C'>('TER_A');
const calcResult = ref<any>(null);
const calcLoading = ref(false);
const generateBatchLoading = ref(false);

async function calculateSbm() {
  if (!calcEmployeeId.value) return;
  calcLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post<any>('/hris/payroll/calculate', {
      employeeId: calcEmployeeId.value,
      workDays: Number(calcWorkDays.value),
      overtimeHours: Number(calcOvertimeHours.value),
      ptkpCategory: calcPtkpCategory.value,
    });
    calcResult.value = res.data;
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal menghitung simulasi SBM & PPh 21 TER.';
  } finally {
    calcLoading.value = false;
  }
}

async function generateBatchPayroll() {
  generateBatchLoading.value = true;
  errorMessage.value = '';
  feedbackMessage.value = '';
  try {
    const res = await api.post<any>('/hris/payroll/generate', {
      periodMonth: 12,
      periodYear: 2026,
      workDays: 22,
      ptkpCategory: 'TER_A',
    });
    feedbackMessage.value = `Berhasil menerbitkan ${res.data.totalGenerated} slip gaji periode 12/2026 berbasis SBM 2026 & PPh 21 TER.`;
    await loadData();
    currentTab.value = 'PAYROLL';
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal memproses batch slip gaji.';
  } finally {
    generateBatchLoading.value = false;
  }
}

// Filter
const searchQuery = ref('');
const filterDepartment = ref('ALL');

// Modal Detail Slip Gaji
const showSlipModal = ref(false);
const selectedSlip = ref<SalarySlipRecord | null>(null);

// Modal Contract History & Renewal State
const showContractModal = ref(false);
const selectedEmpForContract = ref<EmployeeRecord | null>(null);
const savingContract = ref(false);
const showAddContractForm = ref(false);
const newContractForm = reactive({
  contractNumber: '',
  contractType: 'PUT_PK',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
  salaryRate: 0,
  notes: '',
});

function openContractModal(emp: EmployeeRecord) {
  selectedEmpForContract.value = emp;
  showAddContractForm.value = false;
  newContractForm.contractNumber = `SK/PMO/PUT-PK/${new Date().getFullYear()}/${emp.nip.slice(-3)}`;
  newContractForm.contractType = emp.employmentStatus === 'CONTRACT' ? 'PUT_PK' : 'PUT_PK';
  newContractForm.startDate = new Date().toISOString().slice(0, 10);
  newContractForm.endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
  newContractForm.salaryRate = emp.baseSalary;
  newContractForm.notes = `Perpanjangan SK Penugasan Kerja Pegawai PUT PK ${emp.fullName}`;
  showContractModal.value = true;
}

async function saveContractRenewal() {
  if (!selectedEmpForContract.value) return;
  savingContract.value = true;
  errorMessage.value = '';
  try {
    await api.post('/hris/contracts', {
      employeeId: selectedEmpForContract.value.id,
      contractNumber: newContractForm.contractNumber,
      contractType: newContractForm.contractType,
      startDate: newContractForm.startDate,
      endDate: newContractForm.endDate,
      salaryRate: Number(newContractForm.salaryRate),
      notes: newContractForm.notes,
    });
    feedbackMessage.value = `Berhasil menerbitkan SK Perpanjangan ${newContractForm.contractNumber} untuk ${selectedEmpForContract.value.fullName}.`;
    await loadData();
    const updated = employees.value.find((e) => e.id === selectedEmpForContract.value?.id);
    if (updated) selectedEmpForContract.value = updated;
    showAddContractForm.value = false;
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal menyimpan perpanjangan kontrak.';
  } finally {
    savingContract.value = false;
  }
}

// Unit Attendance Recap State
const recapMonth = ref(12);
const recapYear = ref(2026);
const recapUnitId = ref('ALL');
const unitRecapData = ref<UnitRecapResponse | null>(null);
const unitRecapLoading = ref(false);
const verifyingUnit = ref(false);
const showRawAttendance = ref(false);

async function loadUnitRecap() {
  unitRecapLoading.value = true;
  try {
    const query = new URLSearchParams({
      month: String(recapMonth.value),
      year: String(recapYear.value),
      businessUnitId: recapUnitId.value,
    }).toString();
    const res = await api.get<UnitRecapResponse>(`/hris/attendance/unit-recap?${query}`);
    unitRecapData.value = res.data;
    await loadLockStatus();
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal memuat rekapitulasi presensi unit.';
  } finally {
    unitRecapLoading.value = false;
  }
}

async function verifyUnit(unitId: string) {
  verifyingUnit.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post<any>('/hris/attendance/verify-unit', {
      businessUnitId: unitId,
      periodMonth: Number(recapMonth.value),
      periodYear: Number(recapYear.value),
    });
    feedbackMessage.value = `Rekapitulasi presensi unit berhasil diverifikasi (${res.data.updatedCount} baris).`;
    await loadUnitRecap();
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal memverifikasi presensi unit.';
  } finally {
    verifyingUnit.value = false;
  }
}

// Attendance Period Lock State (PMO-102)
const lockStatus = ref<{
  periodMonth: number;
  periodYear: number;
  cutoffTimestamp: string;
  cutoffRule: string;
  isLocked: boolean;
  reason: string;
  activeOverride?: any;
  canOverride?: boolean;
} | null>(null);

const showUnlockModal = ref(false);
const submittingUnlock = ref(false);
const unlockForm = reactive({
  reason: '',
  durationHours: 24,
});

async function loadLockStatus() {
  try {
    const res = await api.get<any>(`/hris/attendance/lock-status?periodMonth=${recapMonth.value}&periodYear=${recapYear.value}`);
    lockStatus.value = res.data;
  } catch (err: any) {
    console.error('Failed to load lock status:', err);
  }
}

async function submitUnlockOverride() {
  if (!unlockForm.reason || unlockForm.reason.length < 5) {
    errorMessage.value = 'Mohon isi alasan unfreeze darurat minimal 5 karakter.';
    return;
  }
  submittingUnlock.value = true;
  errorMessage.value = '';
  try {
    await api.post('/hris/attendance/unlock-override', {
      periodMonth: Number(recapMonth.value),
      periodYear: Number(recapYear.value),
      reason: unlockForm.reason,
      durationHours: Number(unlockForm.durationHours),
    });
    feedbackMessage.value = `Periode ${recapMonth.value}/${recapYear.value} berhasil dibuka kunci sementara selama ${unlockForm.durationHours} jam.`;
    showUnlockModal.value = false;
    unlockForm.reason = '';
    await loadLockStatus();
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal membuka kunci presensi.';
  } finally {
    submittingUnlock.value = false;
  }
}

async function relockPeriod() {
  errorMessage.value = '';
  try {
    await api.post('/hris/attendance/lock-period', {
      periodMonth: Number(recapMonth.value),
      periodYear: Number(recapYear.value),
      isLocked: true,
    });
    feedbackMessage.value = `Periode ${recapMonth.value}/${recapYear.value} berhasil dikunci kembali.`;
    await loadLockStatus();
  } catch (err: any) {
    errorMessage.value = err.message || 'Gagal mengunci periode.';
  }
}

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
    await loadUnitRecap();
    if (!calcEmployeeId.value && employees.value.length > 0) {
      calcEmployeeId.value = employees.value[0].id;
      calculateSbm();
    }
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
          <button
            type="button"
            class="tab-btn"
            :class="{ active: currentTab === 'CALCULATOR_SBM' }"
            @click="currentTab = 'CALCULATOR_SBM'"
          >
            Kalkulator SBM 2026 &amp; PPh 21 TER
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
        <div class="metric-sub">Payroll via Bank Pengeluaran PMO 110102010300</div>
      </div>
    </section>

    <AlertBanner
      v-if="errorMessage"
      variant="danger"
      title="Pemberitahuan Sistem HRIS"
      :message="errorMessage"
      @dismiss="errorMessage = ''"
    />

    <AlertBanner
      v-if="feedbackMessage"
      variant="success"
      title="Operasi Payroll Berhasil"
      :message="feedbackMessage"
      @dismiss="feedbackMessage = ''"
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
                <th>Status Kerja &amp; Kontrak</th>
                <th class="money-col">Gaji Pokok</th>
                <th class="money-col">Tunjangan</th>
                <th class="money-col">Estimasi THP</th>
                <th>Rekening Payroll</th>
                <th style="text-align: center;">Masa Berlaku SK</th>
                <th style="text-align: center;">Aksi</th>
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
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span class="erp-badge" :class="emp.employmentStatus === 'PERMANENT' ? 'erp-badge-success' : 'erp-badge-warn'">
                      {{ emp.employmentStatus === 'PERMANENT' ? 'Pegawai Tetap' : 'PUT PK' }}
                    </span>
                    <span
                      v-if="emp.activeContract"
                      class="erp-badge"
                      :class="{
                        'erp-badge-warn': emp.contractStatus === 'EXPIRING_SOON',
                        'erp-badge-danger': emp.contractStatus === 'EXPIRED',
                        'erp-badge-success': emp.contractStatus === 'ACTIVE',
                        'erp-badge-info': emp.contractStatus === 'PERMANENT',
                      }"
                    >
                      {{ emp.contractStatus === 'EXPIRING_SOON' ? `⚠️ Sisa ${emp.daysUntilContractEnd} hari` : (emp.contractStatus === 'EXPIRED' ? '❌ Habis' : 'Aktif') }}
                    </span>
                  </div>
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
                  <div v-if="emp.activeContract">
                    <strong class="doc-code" style="font-size: 0.75rem;">{{ emp.activeContract.contractNumber }}</strong>
                    <div class="table-sub">s.d {{ formatDate(emp.activeContract.endDate) }}</div>
                  </div>
                  <span v-else class="text-muted">SK Tetap</span>
                </td>
                <td style="text-align: center;">
                  <button
                    type="button"
                    class="btn btn-xs btn-outline-primary"
                    @click="openContractModal(emp)"
                  >
                    📄 SK &amp; Kontrak
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 2: ATTENDANCE RECAP -->
    <div v-if="currentTab === 'ATTENDANCE'" class="tab-pane">
      <!-- Cut-off & Auto-Lock Status Banner (PMO-102) -->
      <div v-if="lockStatus" class="lock-status-banner" :class="lockStatus.isLocked ? 'locked-box' : 'unlocked-box'">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="lock-icon" style="font-size: 1.6rem;">
            {{ lockStatus.isLocked ? '🔒' : '🔓' }}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 0.95rem;">
                {{ lockStatus.isLocked ? `Periode Presensi & Lembur ${recapMonth}/${recapYear} Terkunci (Cutoff Tanggal 25)` : `Periode Presensi ${recapMonth}/${recapYear} Terbuka / Unfrozen` }}
              </strong>
              <span class="erp-badge" :class="lockStatus.isLocked ? 'erp-badge-danger' : 'erp-badge-success'">
                {{ lockStatus.isLocked ? 'AUTO-LOCKED TGL 25 23:59' : 'OVERRIDE UNLOCKED' }}
              </span>
            </div>
            <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--text-secondary);">
              <span v-if="lockStatus.isLocked">
                Pengubahan data kehadiran dan klaim lembur dibekukan otomatis demi kepatuhan cut-off payroll bulanan PMO UTama.
              </span>
              <span v-else>
                Dibuka sementara oleh {{ lockStatus.activeOverride?.unlockedBy || 'GM PMO' }} (Alasan: "{{ lockStatus.activeOverride?.unlockReason || 'Koreksi resmi' }}"). Berlaku hingga {{ lockStatus.activeOverride?.unlockedUntil ? formatDate(lockStatus.activeOverride.unlockedUntil) : 'Selesai' }}.
              </span>
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button
            v-if="lockStatus.isLocked"
            type="button"
            class="btn btn-sm btn-outline-primary"
            @click="showUnlockModal = true"
          >
            🔓 Override Buka Kunci (GM PMO)
          </button>
          <button
            v-else
            type="button"
            class="btn btn-sm btn-warn"
            @click="relockPeriod"
          >
            🔒 Kunci Kembali Periode
          </button>
        </div>
      </div>

      <!-- Unit Recap Controls & Filters -->
      <div class="filter-bar">
        <div class="filter-item">
          <label class="form-label">Bulan Periode</label>
          <select v-model="recapMonth" class="select" @change="loadUnitRecap">
            <option :value="10">Oktober</option>
            <option :value="11">November</option>
            <option :value="12">Desember</option>
          </select>
        </div>
        <div class="filter-item">
          <label class="form-label">Tahun</label>
          <select v-model="recapYear" class="select" @change="loadUnitRecap">
            <option :value="2025">2025</option>
            <option :value="2026">2026</option>
            <option :value="2027">2027</option>
          </select>
        </div>
        <div class="filter-item">
          <label class="form-label">Filter Unit Bisnis</label>
          <select v-model="recapUnitId" class="select" @change="loadUnitRecap">
            <option value="ALL">Semua Unit Bisnis PMO</option>
            <option v-for="u in unitRecapData?.units || []" :key="u.unitId" :value="u.unitId">
              {{ u.unitCode }} - {{ u.unitName }}
            </option>
          </select>
        </div>
        <div class="filter-item" style="display: flex; align-items: flex-end; gap: 8px;">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="unitRecapLoading"
            @click="loadUnitRecap"
          >
            {{ unitRecapLoading ? 'Memuat...' : '🔄 Muat Ulang Rekap' }}
          </button>
          <button
            type="button"
            class="btn btn-sm"
            @click="showRawAttendance = !showRawAttendance"
          >
            {{ showRawAttendance ? 'Sembunyikan Log Harian' : '📋 Tampilkan Log Harian' }}
          </button>
        </div>
      </div>

      <!-- SBM Attendance KPI Summary Strip -->
      <section v-if="unitRecapData" class="metric-strip">
        <div class="metric-box focal">
          <div class="metric-label">Total Kehadiran Fisik (SBM)</div>
          <div class="metric-value">{{ unitRecapData.summary.totalPresentDays }} Hari</div>
          <div class="metric-sub">Standar Uang Makan Rp 37.000 / hari</div>
        </div>
        <div class="metric-box">
          <div class="metric-head-row">
            <div class="metric-label">Total Jam Lembur Unit</div>
            <span class="erp-badge erp-badge-warn">SBM 2026</span>
          </div>
          <div class="metric-value">{{ unitRecapData.summary.totalOvertimeHours }} Jam</div>
          <div class="metric-sub">Standar Lembur Rp 20.000 / jam</div>
        </div>
        <div class="metric-box">
          <div class="metric-head-row">
            <div class="metric-label">Hak Uang Makan SBM</div>
            <span class="erp-badge erp-badge-info">Akun 520101060200</span>
          </div>
          <div class="metric-value money">{{ formatCurrency(unitRecapData.summary.totalMealAllowance) }}</div>
          <div class="metric-sub">Beban Uang Makan Tenaga Non PNS</div>
        </div>
        <div class="metric-box">
          <div class="metric-head-row">
            <div class="metric-label">Total Beban Lembur SBM</div>
            <span class="erp-badge erp-badge-info">Akun 520101050200</span>
          </div>
          <div class="metric-value money text-emerald">{{ formatCurrency(unitRecapData.summary.grandTotalSbm) }}</div>
          <div class="metric-sub">Total Uang Makan + Uang Lembur</div>
        </div>
      </section>

      <!-- Unit By Unit Breakdown Cards -->
      <div v-if="unitRecapData && unitRecapData.units.length > 0" class="unit-recaps-container" style="display: flex; flex-direction: column; gap: 16px;">
        <section v-for="unit in unitRecapData.units" :key="unit.unitId" class="panel panel-elevated">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="doc-code">{{ unit.unitCode }}</span>
                <h3 class="section-title" style="margin: 0;">{{ unit.unitName }}</h3>
                <span
                  class="erp-badge"
                  :class="unit.isVerified ? 'erp-badge-success' : 'erp-badge-warn'"
                >
                  {{ unit.isVerified ? '✓ TERVERIFIKASI RESMI' : '⏳ MENUNGGU VERIFIKASI' }}
                </span>
              </div>
              <p class="text-muted" style="margin: 4px 0 0 0;">
                Manajer Unit: <strong>{{ unit.managerName }}</strong> · {{ unit.totalEmployees }} Pegawai Aktif · Total SBM: <strong>{{ formatCurrency(unit.totalSbmCost) }}</strong> (Makan: {{ formatCurrency(unit.mealAllowanceAmount) }} + Lembur: {{ formatCurrency(unit.overtimeCost) }})
              </p>
            </div>
            <div v-if="!unit.isVerified">
              <button
                type="button"
                class="btn btn-sm btn-success"
                :disabled="verifyingUnit"
                @click="verifyUnit(unit.unitId)"
              >
                {{ verifyingUnit ? 'Memverifikasi...' : '✓ Verifikasi Rekap Presensi Unit' }}
              </button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="erp-table compact-table">
              <thead>
                <tr>
                  <th>NIP &amp; Nama Pegawai</th>
                  <th>Posisi / Jabatan</th>
                  <th style="text-align: center;">Hadir (Hari)</th>
                  <th style="text-align: center;">Terlambat</th>
                  <th style="text-align: center;">Sakit / Cuti</th>
                  <th style="text-align: center;">Lembur (Jam)</th>
                  <th class="money-col">Uang Makan SBM</th>
                  <th class="money-col">Uang Lembur SBM</th>
                  <th class="money-col">Total SBM</th>
                  <th style="text-align: center;">Status Verifikasi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="emp in unit.employees" :key="emp.employeeId">
                  <td>
                    <strong class="doc-code">{{ emp.nip }}</strong>
                    <div class="table-title">{{ emp.fullName }}</div>
                  </td>
                  <td>
                    <span class="role-chip">{{ emp.position }}</span>
                  </td>
                  <td style="text-align: center; font-weight: 700; color: var(--status-success-text);">
                    {{ emp.presentDays }}
                  </td>
                  <td style="text-align: center; color: var(--status-warning-text);">
                    {{ emp.lateDays }}
                  </td>
                  <td style="text-align: center;">
                    {{ emp.sickDays }}S / {{ emp.leaveDays }}C / {{ emp.alphaDays }}A
                  </td>
                  <td style="text-align: center; font-weight: 700;">
                    {{ emp.overtimeHours }} Jam
                  </td>
                  <td class="money-col">{{ formatCurrency(emp.mealAllowanceAmount) }}</td>
                  <td class="money-col">{{ formatCurrency(emp.overtimeAmount) }}</td>
                  <td class="money-col font-bold text-emerald">{{ formatCurrency(emp.totalSbmEntitlement) }}</td>
                  <td style="text-align: center;">
                    <span class="erp-badge" :class="emp.isVerified ? 'erp-badge-success' : 'erp-badge-warn'">
                      {{ emp.isVerified ? 'Terverifikasi' : 'Draft' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Raw Daily Attendance Log Table (Toggleable) -->
      <section v-if="showRawAttendance" class="panel panel-elevated" style="margin-top: 16px;">
        <div class="panel-header">
          <div>
            <h2 class="section-title">Log Presensi Harian Mentah (Check-In &amp; Check-Out)</h2>
            <p class="text-muted">Catatan waktu kehadiran kerja individual, jam masuk, jam pulang, dan verifikasi verifikator unit.</p>
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
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button
              type="button"
              class="btn btn-sm btn-success"
              :disabled="generateBatchLoading"
              @click="generateBatchPayroll"
            >
              {{ generateBatchLoading ? 'Memproses Batch...' : '+ Terbitkan Slip Gaji SBM 2026' }}
            </button>
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

    <!-- TAB 4: SBM 2026 & PPH 21 CALCULATOR -->
    <div v-if="currentTab === 'CALCULATOR_SBM'" class="tab-pane">
      <!-- Pertor 310 SBM Compliance Alert Banner -->
      <div class="panel" style="background: linear-gradient(135deg, rgba(30, 64, 175, 0.08) 0%, rgba(14, 165, 233, 0.05) 100%); border-left: 4px solid var(--primary); padding: 14px 18px; margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="doc-code" style="background: var(--primary); color: #fff; font-weight: 700;">SBM 2026 · PMK 168/2023</span>
              <strong>Standar Biaya Masukan &amp; PPh 21 TER Pegawai PUT PK PMO</strong>
            </div>
            <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted);">
              Perhitungan gaji pokok, uang makan SBM (Rp 37.000/hari), uang lembur (Rp 20.000/jam), potongan BPJS 4%, dan pemotongan PPh 21 Tarif Efektif Rata-rata (TER). Pembebanan otomatis ke akun Pertor 310: Beban Gaji <code>520101030100</code>, Utang PPh 21 <code>210201010100</code>, dan Bank Pengeluaran <code>110102010300</code>.
            </p>
          </div>
        </div>
      </div>

      <div class="form-grid" style="grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.4fr); gap: 18px;">
        <!-- Input Form Parameters -->
        <div class="panel">
          <div class="panel-header">
            <h3>Parameter Perhitungan Pegawai</h3>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div class="form-field">
              <label for="calc-emp" class="form-label">Pilih Pegawai PUT PK</label>
              <select id="calc-emp" v-model="calcEmployeeId" class="select" @change="calculateSbm">
                <option v-for="e in employees" :key="e.id" :value="e.id">
                  {{ e.nip }} - {{ e.fullName }} ({{ e.department }})
                </option>
              </select>
            </div>

            <div class="form-grid">
              <div class="form-field">
                <label for="calc-days" class="form-label">Hari Kerja Efektif</label>
                <input
                  id="calc-days"
                  v-model.number="calcWorkDays"
                  type="number"
                  min="0"
                  max="31"
                  class="input"
                  @input="calculateSbm"
                />
                <span style="font-size: 0.75rem; color: var(--text-muted);">Uang Makan Rp 37.000/hari</span>
              </div>

              <div class="form-field">
                <label for="calc-ot" class="form-label">Jam Lembur (Bulan Ini)</label>
                <input
                  id="calc-ot"
                  v-model.number="calcOvertimeHours"
                  type="number"
                  min="0"
                  max="100"
                  class="input"
                  @input="calculateSbm"
                />
                <span style="font-size: 0.75rem; color: var(--text-muted);">Tarif Lembur Rp 20.000/jam</span>
              </div>
            </div>

            <div class="form-field">
              <label for="calc-ptkp" class="form-label">Kategori Status PTKP (PPh 21 TER)</label>
              <select id="calc-ptkp" v-model="calcPtkpCategory" class="select" @change="calculateSbm">
                <option value="TER_A">Kategori A (TK/0, TK/1, K/0)</option>
                <option value="TER_B">Kategori B (TK/2, TK/3, K/1, K/2)</option>
                <option value="TER_C">Kategori C (K/3)</option>
              </select>
            </div>

            <div class="btn-row" style="margin-top: 8px;">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="calcLoading"
                @click="calculateSbm"
              >
                {{ calcLoading ? 'Menghitung...' : 'Hitung Ulang Payroll SBM' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Result Card Breakdown -->
        <div v-if="calcResult" class="panel">
          <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3>Rincian Slip Gaji SBM: {{ calcResult.employee.fullName }}</h3>
              <span class="text-muted" style="font-size: 0.8rem;">{{ calcResult.employee.nip }} · {{ calcResult.employee.position }}</span>
            </div>
            <span class="erp-badge erp-badge-info">{{ calcResult.employee.employmentStatus }}</span>
          </div>

          <div class="slip-grid" style="margin-top: 10px;">
            <!-- Earnings -->
            <div class="slip-col">
              <h4 class="slip-col-title">Penghasilan SBM 2026</h4>
              <div class="slip-row">
                <span>Gaji Pokok:</span>
                <strong class="money">{{ formatCurrency(calcResult.calculation.baseSalary) }}</strong>
              </div>
              <div class="slip-row">
                <span>Tunjangan Jabatan:</span>
                <strong class="money">{{ formatCurrency(calcResult.calculation.positionAllowance) }}</strong>
              </div>
              <div class="slip-row">
                <span>Tunjangan Transport:</span>
                <strong class="money">{{ formatCurrency(calcResult.calculation.transportAllowance) }}</strong>
              </div>
              <div class="slip-row">
                <span>Uang Makan SBM ({{ calcResult.calculation.workDays }} hr):</span>
                <strong class="money">{{ formatCurrency(calcResult.calculation.mealAllowance) }}</strong>
              </div>
              <div class="slip-row" v-if="calcResult.calculation.overtimeAmount > 0">
                <span>Uang Lembur ({{ calcResult.calculation.overtimeHours }} jam):</span>
                <strong class="money">{{ formatCurrency(calcResult.calculation.overtimeAmount) }}</strong>
              </div>
              <div class="slip-row subtotal-row">
                <span>Penghasilan Bruto:</span>
                <strong class="money" style="color: var(--primary);">{{ formatCurrency(calcResult.calculation.grossSalary) }}</strong>
              </div>
            </div>

            <!-- Deductions -->
            <div class="slip-col">
              <h4 class="slip-col-title">Potongan Pajak &amp; Iuran</h4>
              <div class="slip-row">
                <span>Iuran BPJS Pegawai (4%):</span>
                <strong class="money text-danger">- {{ formatCurrency(calcResult.calculation.deductionBpjs) }}</strong>
              </div>
              <div class="slip-row">
                <span>PPh 21 TER ({{ calcResult.calculation.pph21RatePercent }}%):</span>
                <strong class="money text-danger">- {{ formatCurrency(calcResult.calculation.deductionPph21) }}</strong>
              </div>
              <div class="slip-row subtotal-row">
                <span>Total Potongan:</span>
                <strong class="money text-danger">
                  - {{ formatCurrency(calcResult.calculation.deductionBpjs + calcResult.calculation.deductionPph21) }}
                </strong>
              </div>

              <div class="panel" style="margin-top: 14px; padding: 10px; background: var(--bg-canvas); text-align: right;">
                <span class="slip-meta-label">Take Home Pay (THP Bersih)</span>
                <div class="money text-emerald" style="font-size: 1.4rem; font-weight: 700;">
                  {{ formatCurrency(calcResult.calculation.netSalary) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Pertor 310 COA Mapping Card -->
          <div class="panel" style="margin-top: 14px; background: var(--bg-canvas); padding: 12px;">
            <strong style="font-size: 0.82rem;">Pembebanan Jurnal Akuntansi Pertor 310:</strong>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 0.78rem;">
              <span class="doc-code">Debit Gaji: {{ calcResult.accountingMapping.bebanGajiCoa }}</span>
              <span class="doc-code">Debit Uang Makan: {{ calcResult.accountingMapping.bebanUangMakanCoa }}</span>
              <span class="doc-code">Kredit Utang PPh 21: {{ calcResult.accountingMapping.utangPph21Coa }}</span>
              <span class="doc-code">Kredit Kas Bank: {{ calcResult.accountingMapping.bankBtnCoa || calcResult.accountingMapping.bankBriCoa }} (Bank BTN)</span>
            </div>
          </div>
        </div>
      </div>
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

    <!-- Modal Riwayat Kontrak & Perpanjangan SK -->
    <ModalDialog
      :open="showContractModal"
      title="Riwayat SK Kontrak &amp; Penugasan Pegawai PUT PK"
      @close="showContractModal = false"
    >
      <div v-if="selectedEmpForContract" class="contract-modal-content">
        <div class="contract-emp-summary">
          <div>
            <div class="table-sub">{{ selectedEmpForContract.nip }} · {{ selectedEmpForContract.department }}</div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700;">{{ selectedEmpForContract.fullName }}</h3>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 2px;">Posisi: {{ selectedEmpForContract.position }}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">Status Kepegawaian:</div>
            <span class="erp-badge" :class="selectedEmpForContract.employmentStatus === 'PERMANENT' ? 'erp-badge-success' : 'erp-badge-warn'">
              {{ selectedEmpForContract.employmentStatus === 'PERMANENT' ? 'Pegawai Tetap' : 'PUT PK / Kontrak' }}
            </span>
          </div>
        </div>

        <!-- Contract List -->
        <div class="contract-history-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700;">Daftar Surat Keputusan (SK) &amp; Perpanjangan Kontrak</h4>
            <button
              v-if="!showAddContractForm"
              type="button"
              class="btn btn-xs btn-outline-primary"
              @click="showAddContractForm = true"
            >
              + Terbitkan Perpanjangan SK
            </button>
          </div>

          <div v-if="!selectedEmpForContract.contracts || selectedEmpForContract.contracts.length === 0" class="empty-state-sm">
            Belum ada riwayat SK kontrak tercatat.
          </div>

          <table v-else class="erp-table compact-table">
            <thead>
              <tr>
                <th>No. SK Kontrak</th>
                <th>Tipe</th>
                <th>Masa Berlaku</th>
                <th>Tarif Gaji</th>
                <th>Status</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in selectedEmpForContract.contracts" :key="c.id">
                <td><strong class="doc-code">{{ c.contractNumber }}</strong></td>
                <td><span class="role-chip">{{ c.contractType }}</span></td>
                <td>{{ formatDate(c.startDate) }} s.d {{ formatDate(c.endDate) }}</td>
                <td class="money-col">{{ c.salaryRate ? formatCurrency(c.salaryRate) : '-' }}</td>
                <td>
                  <span
                    class="erp-badge"
                    :class="{
                      'erp-badge-success': c.alertStatus === 'ACTIVE',
                      'erp-badge-warn': c.alertStatus === 'EXPIRING_SOON',
                      'erp-badge-danger': c.alertStatus === 'EXPIRED',
                      'erp-badge-info': c.alertStatus === 'RENEWED',
                    }"
                  >
                    {{ c.alertStatus === 'EXPIRING_SOON' ? `⚠️ Segera Habis (${c.daysRemaining} hari)` : c.alertStatus }}
                  </span>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">{{ c.notes || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Add Contract Form -->
        <div v-if="showAddContractForm" class="contract-form-box">
          <h4 style="margin: 0 0 12px 0; font-size: 0.95rem; font-weight: 700;">Formulir Penerbitan Perpanjangan SK Baru</h4>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Nomor SK Kontrak *</label>
              <input v-model="newContractForm.contractNumber" type="text" class="input" placeholder="SK/PMO/PUT-PK/2027/..." />
            </div>
            <div class="form-group">
              <label class="form-label">Tipe Hubungan Kerja *</label>
              <select v-model="newContractForm.contractType" class="select">
                <option value="PUT_PK">PUT PK (Pegawai Usaha Tetap Perjanjian Kerja)</option>
                <option value="PKWT">PKWT (Perjanjian Kerja Waktu Tertentu)</option>
                <option value="KONSULTAN_AHLI">Konsultan / Tenaga Ahli</option>
                <option value="MAGANG">Magang Terstruktur</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Tanggal Mulai Berlaku *</label>
              <input v-model="newContractForm.startDate" type="date" class="input" />
            </div>
            <div class="form-group">
              <label class="form-label">Tanggal Berakhir Kontrak *</label>
              <input v-model="newContractForm.endDate" type="date" class="input" />
            </div>
            <div class="form-group">
              <label class="form-label">Penyesuaian Gaji Pokok (Rp)</label>
              <input v-model="newContractForm.salaryRate" type="number" class="input" />
            </div>
            <div class="form-group">
              <label class="form-label">Catatan SK / Klausul Kerja</label>
              <input v-model="newContractForm.notes" type="text" class="input" placeholder="Misal: Perpanjangan masa kerja tahap 2" />
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
            <button type="button" class="btn btn-sm" @click="showAddContractForm = false">Batal</button>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="savingContract || !newContractForm.contractNumber"
              @click="saveContractRenewal"
            >
              {{ savingContract ? 'Menyimpan...' : 'Simpan &amp; Terbitkan SK' }}
            </button>
          </div>
        </div>

        <div class="modal-action-row" style="margin-top: 16px;">
          <button type="button" class="btn" @click="showContractModal = false">Tutup</button>
        </div>
      </div>
    </ModalDialog>

    <!-- Modal Override Buka Kunci Presensi (PMO-102) -->
    <ModalDialog
      :open="showUnlockModal"
      title="Otorisasi Override Buka Kunci Presensi &amp; Lembur (GM PMO)"
      @close="showUnlockModal = false"
    >
      <div class="contract-modal-content">
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">
          Sesuai SOP Keuangan &amp; HR PMO UTama, pembukaan kunci periode pasca cut-off tanggal 25 hanya diperkenankan untuk koreksi data mendesak dan wajib menyertakan alasan yang sah serta tercatat pada Audit Trail SPI.
        </p>

        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label">Alasan Pembukaan Kunci Sementara *</label>
          <textarea
            v-model="unlockForm.reason"
            rows="3"
            class="input"
            placeholder="Contoh: Koreksi jam lembur operasional event wisuda dan konfirmasi kehadiran staf klinik..."
          ></textarea>
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label">Durasi Masa Berlaku Unfreeze *</label>
          <select v-model="unlockForm.durationHours" class="select">
            <option :value="12">12 Jam</option>
            <option :value="24">24 Jam (1 Hari)</option>
            <option :value="48">48 Jam (2 Hari)</option>
          </select>
        </div>

        <div class="modal-action-row" style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-sm" @click="showUnlockModal = false">Batal</button>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="submittingUnlock || unlockForm.reason.length < 5"
            @click="submitUnlockOverride"
          >
            {{ submittingUnlock ? 'Membuka Kunci...' : 'Setujui &amp; Buka Kunci Sementara' }}
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

.lock-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-radius: var(--radius-md);
  flex-wrap: wrap;
  gap: 12px;
}

.locked-box {
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-border);
  color: var(--status-warning-text);
}

.unlocked-box {
  background: var(--status-info-bg);
  border: 1px solid var(--status-info-border);
  color: var(--status-info-text);
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

.erp-badge-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border: 1px solid var(--status-danger-border);
}

.contract-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contract-emp-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.contract-form-box {
  padding: 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.form-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.compact-table th,
.compact-table td {
  padding: 8px 12px;
  font-size: 0.82rem;
}

.empty-state-sm {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .slip-grid,
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
