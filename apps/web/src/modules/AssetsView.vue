<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import AlertBanner from '../components/AlertBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import { api } from '../services/api';
import { formatRupiah as formatCurrency, formatDate } from '../utils/format';

interface AssetRecord {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  businessUnitId: string;
  businessUnitName?: string;
  businessUnitCode?: string;
  ownershipStatus: 'PMO_OWNED' | 'PBI_UT_LOAN' | 'RENTAL' | 'EXTERNAL_LOAN';
  lenderName?: string | null;
  loanDocNumber?: string | null;
  loanDate?: string | null;
  loanReturnDate?: string | null;
  picPerson: string;
  brandModel?: string | null;
  serialNumber?: string | null;
  condition: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  bookValue: number;
  monthlyDepreciation?: number;
  annualDepreciation?: number;
  location: string;
  status: string;
  notes?: string | null;
}

interface BusinessUnitOption {
  id: string;
  code: string;
  name: string;
}

interface AssetExpenditure {
  id: string;
  expenditureNumber: string;
  assetId: string;
  transactionDate: string;
  description: string;
  amount: number;
  currentBookValue: number;
  ratioPercent: number;
  isCapitalized: boolean;
  accountingTreatment: string;
  coaDebit: string;
  coaCredit: string;
  additionalMonths: number;
  vendorName?: string | null;
  invoiceDocNumber?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  createdAt: string;
}

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successBanner = ref('');

// Summary State
const summary = reactive({
  totalAssets: 0,
  totalAcquisitionCost: 0,
  totalPmoOwnedCost: 0,
  totalPbiLoanCost: 0,
  totalAccumulatedDepreciation: 0,
  totalCurrentBookValue: 0,
  countPmoOwned: 0,
  countPbiLoan: 0,
  countRental: 0,
  picCoordinator: 'Wildan Pramono (Staff Pengelola Aset & Logistik)'
});

const assets = ref<AssetRecord[]>([]);
const businessUnits = ref<BusinessUnitOption[]>([]);

// Filters
const filterOwnership = ref<string>('ALL');
const filterUnit = ref<string>('ALL');
const searchQuery = ref<string>('');

// Modal Create
const showCreateModal = ref(false);
const createForm = reactive({
  assetCode: '',
  name: '',
  category: 'Audio Visual & Event Equipment',
  businessUnitId: '',
  ownershipStatus: 'PBI_UT_LOAN' as 'PMO_OWNED' | 'PBI_UT_LOAN' | 'RENTAL' | 'EXTERNAL_LOAN',
  lenderName: 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka',
  loanDocNumber: '',
  loanDate: new Date().toISOString().slice(0, 10),
  loanReturnDate: '',
  picPerson: 'Wildan Pramono',
  brandModel: '',
  serialNumber: '',
  condition: 'GOOD',
  acquisitionDate: new Date().toISOString().slice(0, 10),
  acquisitionCost: 0,
  salvageValue: 0,
  usefulLifeYears: 4,
  location: 'Gedung PMO UTama',
  notes: 'Data koordinasi Mas Wildan'
});

// Modal Detail
const showDetailModal = ref(false);
const selectedAsset = ref<AssetRecord | null>(null);
const selectedAssetExpenditures = ref<AssetExpenditure[]>([]);
const loadingExpenditures = ref(false);

// Expenditure Summary State
const expenditureSummary = reactive({
  totalExpenditures: 0,
  totalAmount: 0,
  capitalizedCount: 0,
  capitalizedAmount: 0,
  expensedCount: 0,
  expensedAmount: 0,
  capitalizationRatioThreshold: 10,
});

// Modal Record Subsequent Expenditure (Perbaikan / Renovasi)
const showExpenditureModal = ref(false);
const targetAsset = ref<AssetRecord | null>(null);
const expenditureForm = reactive({
  transactionDate: new Date().toISOString().slice(0, 10),
  description: '',
  amount: 0,
  additionalMonths: 0,
  vendorName: '',
  invoiceDocNumber: '',
  notes: '',
});

// Live Capitalization Evaluator (>10% Net Book Value vs <=10%)
const liveExpenditureEval = computed(() => {
  if (!targetAsset.value) return null;
  const bookVal = targetAsset.value.bookValue || 0;
  const amount = Number(expenditureForm.amount) || 0;
  if (amount <= 0) return null;

  const ratio = bookVal > 0 ? Number(((amount / bookVal) * 100).toFixed(2)) : 100;
  const isCapitalized = bookVal === 0 ? amount >= 1000000 : ratio > 10.0;

  return {
    amount,
    bookValue: bookVal,
    ratio,
    isCapitalized,
    treatment: isCapitalized ? 'KAPITALISASI KE ASET TETAP' : 'BEBAN PEMELIHARAAN (EXPENSED)',
    badgeClass: isCapitalized ? 'erp-badge-success' : 'erp-badge-warn',
    debitCoa: isCapitalized ? '120301010100 (Aset Tetap - Peralatan & Mesin)' : '520901060100 (Beban Pemeliharaan Unit Usaha)',
    creditCoa: '110101020200 (Bank BRI Operasional PMO)',
    impactDescription: isCapitalized
      ? `Rasio pengeluaran ${ratio}% (>10% dari nilai buku). Memenuhi ISAK 335 & Pertor 310: Nilai buku bertambah dari ${formatCurrency(bookVal)} menjadi ${formatCurrency(bookVal + amount)}.`
      : `Rasio pengeluaran ${ratio}% (<=10% dari nilai buku). Tidak memenuhi batas kapitalisasi: Diakui sebagai beban pemeliharaan operasional berjalan, nilai buku tetap ${formatCurrency(bookVal)}.`,
  };
});

const filteredAssets = computed(() => {
  return assets.value.filter((item) => {
    const matchOwnership =
      filterOwnership.value === 'ALL' || item.ownershipStatus === filterOwnership.value;
    const matchUnit =
      filterUnit.value === 'ALL' || item.businessUnitId === filterUnit.value;
    const q = searchQuery.value.trim().toLowerCase();
    const matchQuery =
      !q ||
      item.assetCode.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.picPerson || '').toLowerCase().includes(q) ||
      (item.location || '').toLowerCase().includes(q) ||
      (item.loanDocNumber || '').toLowerCase().includes(q);

    return matchOwnership && matchUnit && matchQuery;
  });
});

async function loadData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [summaryRes, listRes, buRes, expSummaryRes] = await Promise.all([
      api.get<typeof summary>('/assets/summary'),
      api.get<AssetRecord[]>('/assets'),
      api.get<{ businessUnits: BusinessUnitOption[] }>('/petty-cash/master-context'),
      api.get<typeof expenditureSummary>('/assets/expenditures/summary').catch(() => ({ data: null })),
    ]);

    Object.assign(summary, summaryRes.data);
    assets.value = listRes.data || [];
    businessUnits.value = buRes.data?.businessUnits || [];
    if (expSummaryRes && expSummaryRes.data) {
      Object.assign(expenditureSummary, expSummaryRes.data);
    }

    if (!createForm.businessUnitId && businessUnits.value.length > 0) {
      createForm.businessUnitId = businessUnits.value[0].id;
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal memuat data aset PMO';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  showCreateModal.value = true;
}

async function openDetail(item: AssetRecord) {
  selectedAsset.value = item;
  showDetailModal.value = true;
  selectedAssetExpenditures.value = [];
  loadingExpenditures.value = true;
  try {
    const res = await api.get<AssetExpenditure[]>(`/assets/${item.id}/expenditures`);
    selectedAssetExpenditures.value = res.data || [];
  } catch {
    selectedAssetExpenditures.value = [];
  } finally {
    loadingExpenditures.value = false;
  }
}

function openExpenditure(item: AssetRecord) {
  targetAsset.value = item;
  expenditureForm.transactionDate = new Date().toISOString().slice(0, 10);
  expenditureForm.description = '';
  expenditureForm.amount = 0;
  expenditureForm.additionalMonths = 0;
  expenditureForm.vendorName = '';
  expenditureForm.invoiceDocNumber = '';
  expenditureForm.notes = '';
  showExpenditureModal.value = true;
}

async function handleSaveExpenditure() {
  if (!targetAsset.value) return;
  if (!expenditureForm.description.trim()) {
    errorMessage.value = 'Deskripsi perbaikan/renovasi wajib diisi.';
    return;
  }
  if (expenditureForm.amount <= 0) {
    errorMessage.value = 'Nominal pengeluaran harus lebih besar dari Rp 0.';
    return;
  }

  saving.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post(`/assets/${targetAsset.value.id}/expenditures`, {
      transactionDate: expenditureForm.transactionDate,
      description: expenditureForm.description,
      amount: Number(expenditureForm.amount),
      additionalMonths: Number(expenditureForm.additionalMonths || 0),
      vendorName: expenditureForm.vendorName || null,
      invoiceDocNumber: expenditureForm.invoiceDocNumber || null,
      notes: expenditureForm.notes || null,
    });

    await loadData();
    showExpenditureModal.value = false;
    successBanner.value = res.data?.message || 'Pengeluaran aset berhasil dicatat.';
    setTimeout(() => {
      successBanner.value = '';
    }, 6000);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal mencatat pengeluaran perbaikan';
  } finally {
    saving.value = false;
  }
}

async function handleCreateAsset() {
  if (!createForm.name.trim()) {
    errorMessage.value = 'Nama aset wajib diisi.';
    return;
  }
  if (createForm.acquisitionCost <= 0) {
    errorMessage.value = 'Nilai perolehan/aset harus lebih dari Rp 0.';
    return;
  }

  saving.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post('/assets', {
      assetCode: createForm.assetCode || undefined,
      name: createForm.name,
      category: createForm.category,
      businessUnitId: createForm.businessUnitId,
      ownershipStatus: createForm.ownershipStatus,
      lenderName:
        createForm.ownershipStatus === 'PBI_UT_LOAN'
          ? createForm.lenderName || 'Pusat Bisnis dan Investasi (PBI) Universitas Terbuka'
          : null,
      loanDocNumber: createForm.loanDocNumber || null,
      loanDate: createForm.loanDate || null,
      loanReturnDate: createForm.loanReturnDate || null,
      picPerson: createForm.picPerson || 'Wildan Pramono',
      brandModel: createForm.brandModel || null,
      serialNumber: createForm.serialNumber || null,
      condition: createForm.condition,
      acquisitionDate: createForm.acquisitionDate,
      acquisitionCost: Number(createForm.acquisitionCost),
      salvageValue: Number(createForm.salvageValue || 0),
      usefulLifeYears: Number(createForm.usefulLifeYears || 4),
      location: createForm.location,
      notes: createForm.notes
    });

    await loadData();
    showCreateModal.value = false;
    successBanner.value = res.data?.message || 'Aset berhasil didaftarkan ke sistem PMO.';
    setTimeout(() => {
      successBanner.value = '';
    }, 6000);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal menyimpan aset';
  } finally {
    saving.value = false;
  }
}

async function handleDepreciate() {
  saving.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post<{ message: string }>('/assets/depreciate', {});
    await loadData();
    successBanner.value = res.data?.message || 'Penyusutan aset berhasil diperbarui.';
    setTimeout(() => {
      successBanner.value = '';
    }, 6000);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal menghitung penyusutan';
  } finally {
    saving.value = false;
  }
}

function ownershipBadge(status: AssetRecord['ownershipStatus']) {
  if (status === 'PBI_UT_LOAN') {
    return { label: 'Pinjaman PBI UT', tone: 'warning' as const };
  }
  if (status === 'PMO_OWNED') {
    return { label: 'Milik Penuh PMO', tone: 'success' as const };
  }
  if (status === 'RENTAL') {
    return { label: 'Sewa Eksternal', tone: 'info' as const };
  }
  return { label: 'Pinjaman Luar', tone: 'neutral' as const };
}

function ownershipBadgeClass(status: AssetRecord['ownershipStatus']) {
  if (status === 'PBI_UT_LOAN') return 'erp-badge-warn';
  if (status === 'PMO_OWNED') return 'erp-badge-success';
  if (status === 'RENTAL') return 'erp-badge-info';
  return 'erp-badge-neutral';
}

onMounted(loadData);
</script>

<template>
  <div class="assets-view">
    <!-- Page Header -->
    <header class="page-header">
      <div>
        <h1 class="page-title">Inventaris &amp; Aset Tetap PMO</h1>
        <p class="page-desc">
          Pendataan aset unit (MICE, TCI, IT, Klinik), klasifikasi kepemilikan (Milik PMO vs Peminjaman PBI UT), dan jadwal depresiasi.
        </p>
      </div>

      <div class="btn-row">
        <button
          type="button"
          class="btn btn-sm"
          :disabled="saving"
          @click="handleDepreciate"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>Hitung Penyusutan Berjalan</span>
        </button>

        <button
          type="button"
          class="btn btn-sm btn-primary"
          @click="openCreate"
        >
          + Registrasi Aset Baru
        </button>
      </div>
    </header>

    <!-- Coordinator Strip (Mas Wildan) -->
    <div class="coordinator-card">
      <div class="coordinator-left">
        <div class="coordinator-avatar" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div>
          <div class="coordinator-title-row">
            <strong class="coordinator-name">{{ summary.picCoordinator }}</strong>
            <span class="coordinator-chip">PIC Logistik &amp; Aset Terpusat</span>
          </div>
          <p class="coordinator-desc">
            Seluruh mutasi fisik dan dokumen BAST peminjaman aset operasional dari Pusat Bisnis dan Investasi Universitas Terbuka (PBI UT) dikoordinasikan terpusat.
          </p>
        </div>
      </div>
      <div class="coordinator-stats">
        <div class="coordinator-stat-item">
          <span class="coordinator-stat-label">Pinjaman PBI UT</span>
          <strong class="coordinator-stat-val text-amber">{{ summary.countPbiLoan }} Item</strong>
        </div>
        <div class="coordinator-stat-item">
          <span class="coordinator-stat-label">Milik PMO</span>
          <strong class="coordinator-stat-val text-emerald">{{ summary.countPmoOwned }} Item</strong>
        </div>
      </div>
    </div>

    <!-- Alert Notifications -->
    <AlertBanner
      v-if="errorMessage"
      variant="danger"
      title="Pemberitahuan Sistem Aset"
      :message="errorMessage"
      @dismiss="errorMessage = ''"
    />

    <AlertBanner
      v-if="successBanner"
      variant="success"
      title="Operasi Berhasil"
      :message="successBanner"
      @dismiss="successBanner = ''"
    />

    <!-- ISAK 335 & Pertor 310 Fixed Asset Capitalization Filter Widget -->
    <div class="compliance-card">
      <div class="compliance-header">
        <div class="compliance-badge">ISAK 335 &amp; Pertor 310</div>
        <div class="compliance-title">Filter Ambang Batas Kapitalisasi &amp; Perlakuan Akuntansi Aset Tetap</div>
      </div>
      <div class="compliance-grid">
        <div class="compliance-item">
          <span class="compliance-tag tag-blue">Perolehan Baru</span>
          <div class="compliance-val">Min. Rp 1.000.000</div>
          <p class="compliance-sub">Peralatan, Mesin &amp; TI &ge; Rp 1 Jt dikapitalisasi ke Aset Tetap (120301010100). Di bawah batas dibebankan langsung ke Beban Perlengkapan.</p>
        </div>
        <div class="compliance-item">
          <span class="compliance-tag tag-emerald">Renovasi &gt; 10% Nilai Buku</span>
          <div class="compliance-val">Kapitalisasi (Aset +)</div>
          <p class="compliance-sub">Pengeluaran perbaikan &gt; 10% nilai buku bersih menambah nilai aset dan masa manfaat. Debet Aset Tetap, Kredit Kas/Bank BRI.</p>
        </div>
        <div class="compliance-item">
          <span class="compliance-tag tag-amber">Perbaikan &le; 10% Nilai Buku</span>
          <div class="compliance-val">Beban Pemeliharaan</div>
          <p class="compliance-sub">Pengeluaran rutin &le; 10% nilai buku diakui sebagai Beban Pemeliharaan (520901060100) tanpa menambah nilai buku aset.</p>
        </div>
        <div class="compliance-item">
          <span class="compliance-tag tag-purple">Rekap Pengeluaran</span>
          <div class="compliance-val">{{ expenditureSummary.totalExpenditures }} Transaksi</div>
          <p class="compliance-sub">Kapitalisasi: {{ expenditureSummary.capitalizedCount }} trx ({{ formatCurrency(expenditureSummary.capitalizedAmount) }}) | Beban: {{ expenditureSummary.expensedCount }} trx ({{ formatCurrency(expenditureSummary.expensedAmount) }})</p>
        </div>
      </div>
    </div>

    <!-- Metrics Strip: 4 Cohesive Cards -->
    <section class="metric-strip">
      <div class="metric-box focal">
        <div class="metric-label">Total Nilai Perolehan Aset</div>
        <div class="metric-value money">{{ formatCurrency(summary.totalAcquisitionCost) }}</div>
        <div class="metric-sub">{{ summary.totalAssets }} Unit Aset Terdaftar</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Pinjaman PBI UT</div>
          <span class="erp-badge erp-badge-warn">{{ summary.countPbiLoan }} Item</span>
        </div>
        <div class="metric-value money text-amber">{{ formatCurrency(summary.totalPbiLoanCost) }}</div>
        <div class="metric-sub">Aset PBI UT yang dioperasikan PMO</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Milik Sendiri PMO</div>
          <span class="erp-badge erp-badge-success">{{ summary.countPmoOwned }} Item</span>
        </div>
        <div class="metric-value money text-emerald">{{ formatCurrency(summary.totalPmoOwnedCost) }}</div>
        <div class="metric-sub">Pengadaan mandiri anggaran PMO</div>
      </div>

      <div class="metric-box">
        <div class="metric-head-row">
          <div class="metric-label">Nilai Buku Bersih (Net)</div>
          <span class="erp-badge erp-badge-info">Tercatat di GL</span>
        </div>
        <div class="metric-value money">{{ formatCurrency(summary.totalCurrentBookValue) }}</div>
        <div class="metric-sub">Akum. Depresiasi: {{ formatCurrency(summary.totalAccumulatedDepreciation) }}</div>
      </div>
    </section>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-item filter-search">
        <label class="form-label">Pencarian Cepat</label>
        <input
          v-model="searchQuery"
          type="search"
          class="input"
          placeholder="Cari kode aset, nama barang, PIC, BAST, lokasi..."
        />
      </div>

      <div class="filter-item">
        <label class="form-label">Status Kepemilikan</label>
        <select v-model="filterOwnership" class="select">
          <option value="ALL">Semua Kepemilikan ({{ assets.length }})</option>
          <option value="PBI_UT_LOAN">Pinjaman PBI UT</option>
          <option value="PMO_OWNED">Milik Penuh PMO</option>
          <option value="RENTAL">Sewa / Mitra Luar</option>
        </select>
      </div>

      <div class="filter-item">
        <label class="form-label">Unit Bisnis Penanggung Jawab</label>
        <select v-model="filterUnit" class="select">
          <option value="ALL">Semua Unit Bisnis</option>
          <option v-for="u in businessUnits" :key="u.id" :value="u.id">
            {{ u.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Main Table Panel -->
    <section class="panel panel-elevated">
      <div class="panel-header">
        <div>
          <h2 class="section-title">Daftar Inventaris &amp; Aset Tetap PMO</h2>
          <p class="text-muted">
            Menampilkan {{ filteredAssets.length }} dari {{ assets.length }} aset terdaftar
          </p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Kode &amp; Nama Aset</th>
              <th>Status Kepemilikan</th>
              <th>Unit &amp; Lokasi</th>
              <th>PIC</th>
              <th class="money-col">Nilai Perolehan</th>
              <th style="text-align: center;">Masa Manfaat</th>
              <th class="money-col">Akum. Penyusutan</th>
              <th class="money-col">Nilai Buku Net</th>
              <th style="text-align: center;">Kondisi</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredAssets.length === 0">
              <td colspan="10" class="empty-state-cell">
                Tidak ada data aset yang sesuai dengan kriteria filter.
              </td>
            </tr>
            <tr v-for="asset in filteredAssets" :key="asset.id">
              <td>
                <strong class="doc-code">{{ asset.assetCode }}</strong>
                <div class="table-title">{{ asset.name }}</div>
                <div class="table-sub" v-if="asset.brandModel">{{ asset.brandModel }}</div>
              </td>
              <td>
                <span class="erp-badge" :class="ownershipBadgeClass(asset.ownershipStatus)">
                  {{ ownershipBadge(asset.ownershipStatus).label }}
                </span>
                <div class="table-sub" v-if="asset.loanDocNumber">
                  BAST: {{ asset.loanDocNumber }}
                </div>
              </td>
              <td>
                <div style="font-weight: 600;">{{ asset.businessUnitName || 'Operasional' }}</div>
                <div class="table-sub">{{ asset.location }}</div>
              </td>
              <td>
                <span class="pic-chip">{{ asset.picPerson }}</span>
              </td>
              <td class="money-col">{{ formatCurrency(asset.acquisitionCost) }}</td>
              <td style="text-align: center;">
                <div style="font-weight: 600;">{{ asset.usefulLifeYears }} Thn</div>
                <div class="table-sub">{{ asset.usefulLifeMonths }} bln</div>
              </td>
              <td class="money-col text-danger">
                - {{ formatCurrency(asset.accumulatedDepreciation) }}
              </td>
              <td class="money-col font-bold text-emerald">
                {{ formatCurrency(asset.bookValue) }}
              </td>
              <td style="text-align: center;">
                <span class="condition-chip" :class="asset.condition === 'GOOD' ? 'cond-good' : 'cond-warn'">
                  <span class="cond-dot"></span>
                  {{ asset.condition === 'GOOD' ? 'Kondisi Baik' : 'Perlu Perbaikan' }}
                </span>
              </td>
              <td style="text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                  <button type="button" class="btn btn-sm" title="Catat Pengeluaran Pemeliharaan / Perbaikan" @click="openExpenditure(asset)">
                    🔧 Perbaikan
                  </button>
                  <button type="button" class="btn btn-sm" @click="openDetail(asset)">
                    Detail &amp; BAST
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Modal Registrasi Aset Baru (Data Mas Wildan) -->
    <ModalDialog
      :open="showCreateModal"
      title="Registrasi Aset Baru (PMO & Pinjaman PBI UT)"
      @close="showCreateModal = false"
    >
      <form class="asset-modal-form" @submit.prevent="handleCreateAsset">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Nama Aset / Barang <span class="req">*</span></label>
            <input
              v-model="createForm.name"
              type="text"
              class="input"
              placeholder="Contoh: Sound System Line Array / Proyektor Laser..."
              required
            />
          </div>

          <div class="form-field">
            <label class="form-label">Kategori Aset <span class="req">*</span></label>
            <select v-model="createForm.category" class="select">
              <option value="Audio Visual & Event Equipment">Audio Visual &amp; Event Equipment (MICE)</option>
              <option value="Perlengkapan & Furnitur Acara">Perlengkapan &amp; Furnitur Acara (Banquet)</option>
              <option value="Infrastruktur TI & Jaringan">Infrastruktur TI &amp; Jaringan (Server/Cloud)</option>
              <option value="Peralatan Pelatihan & Workshop">Peralatan Pelatihan &amp; Workshop (TCI)</option>
              <option value="Peralatan Medis & Kesehatan">Peralatan Medis &amp; Kesehatan (Klinik)</option>
              <option value="Kendaraan Operasional">Kendaraan Operasional</option>
              <option value="Mesin & Utilitas Operasional">Mesin &amp; Utilitas Operasional (Genset/AC)</option>
            </select>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Status Kepemilikan Aset <span class="req">*</span></label>
            <select v-model="createForm.ownershipStatus" class="select">
              <option value="PBI_UT_LOAN">Pinjaman / Titipan PBI Universitas Terbuka</option>
              <option value="PMO_OWNED">Milik Sendiri PMO (Pengadaan Mandiri)</option>
              <option value="RENTAL">Sewa / Kerjasama Mitra Pihak Luar</option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Unit Penanggung Jawab <span class="req">*</span></label>
            <select v-model="createForm.businessUnitId" class="select">
              <option v-for="u in businessUnits" :key="u.id" :value="u.id">
                {{ u.name }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="createForm.ownershipStatus === 'PBI_UT_LOAN'" class="loan-context-box">
          <div class="form-grid">
            <div class="form-field">
              <label class="form-label">Pemberi Pinjaman / Asal Aset</label>
              <input
                v-model="createForm.lenderName"
                type="text"
                class="input"
                placeholder="Pusat Bisnis dan Investasi (PBI) Universitas Terbuka"
              />
            </div>
            <div class="form-field">
              <label class="form-label">Nomor Surat BAST Peminjaman</label>
              <input
                v-model="createForm.loanDocNumber"
                type="text"
                class="input"
                placeholder="Contoh: BAST-PBI/PMO/MICE/2026/001"
              />
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Merek / Tipe Model</label>
            <input
              v-model="createForm.brandModel"
              type="text"
              class="input"
              placeholder="Contoh: Yamaha TF5 / Dell R750"
            />
          </div>

          <div class="form-field">
            <label class="form-label">Nomor Seri (Serial Number)</label>
            <input
              v-model="createForm.serialNumber"
              type="text"
              class="input"
              placeholder="SN-12345678"
            />
          </div>

          <div class="form-field">
            <label class="form-label">PIC Pengelola (Mas Wildan)</label>
            <input
              v-model="createForm.picPerson"
              type="text"
              class="input"
              placeholder="Wildan Pramono"
            />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Nilai Perolehan / Taksiran (Rp) <span class="req">*</span></label>
            <input
              v-model.number="createForm.acquisitionCost"
              type="number"
              min="0"
              step="100000"
              class="input money"
              required
            />
          </div>

          <div class="form-field">
            <label class="form-label">Masa Manfaat (Tahun) <span class="req">*</span></label>
            <select v-model.number="createForm.usefulLifeYears" class="select">
              <option :value="3">3 Tahun (Komputer / IT Ringan)</option>
              <option :value="4">4 Tahun (Standar Elektronik / Audio)</option>
              <option :value="5">5 Tahun (Peralatan MICE / Sound / Medis)</option>
              <option :value="8">8 Tahun (Genset / Mesin / Kendaraan)</option>
              <option :value="20">20 Tahun (Bangunan / Prasarana)</option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Lokasi Penempatan <span class="req">*</span></label>
            <input
              v-model="createForm.location"
              type="text"
              class="input"
              placeholder="Contoh: Ballroom Lt. 3 / Gudang MICE"
              required
            />
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Catatan / Keterangan Tambahan</label>
          <textarea
            v-model="createForm.notes"
            rows="2"
            class="textarea"
            placeholder="Catatan kondisi, kelengkapan kabel, atau instruksi Mas Wildan..."
          ></textarea>
        </div>

        <div class="modal-action-row">
          <button
            type="button"
            class="btn"
            @click="showCreateModal = false"
          >
            Batal
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saving"
          >
            {{ saving ? 'Menyimpan...' : 'Simpan Aset ke Database' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal Detail Aset -->
    <ModalDialog
      :open="showDetailModal"
      :title="selectedAsset ? `Detail Aset: ${selectedAsset.assetCode}` : 'Detail Aset'"
      @close="showDetailModal = false"
    >
      <div v-if="selectedAsset" class="detail-wrap">
        <div class="detail-header-card">
          <div>
            <span class="erp-badge" :class="ownershipBadgeClass(selectedAsset.ownershipStatus)">
              {{ ownershipBadge(selectedAsset.ownershipStatus).label }}
            </span>
            <h3 class="detail-title">{{ selectedAsset.name }}</h3>
            <p class="text-muted">{{ selectedAsset.category }} · {{ selectedAsset.location }}</p>
          </div>
          <div style="text-align: right;">
            <span class="detail-meta-label">Nilai Buku Bersih (Net)</span>
            <div class="money detail-meta-val text-emerald">{{ formatCurrency(selectedAsset.bookValue) }}</div>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-grid-item">
            <span class="detail-meta-label">Pemberi Pinjaman / Status</span>
            <strong>{{ selectedAsset.lenderName || 'Milik PMO UTama' }}</strong>
            <p class="text-muted" v-if="selectedAsset.loanDocNumber">BAST: {{ selectedAsset.loanDocNumber }}</p>
          </div>
          <div class="detail-grid-item">
            <span class="detail-meta-label">PIC Pengelola Logistik</span>
            <strong>{{ selectedAsset.picPerson }}</strong>
            <p class="text-muted">Unit: {{ selectedAsset.businessUnitName || 'PMO UTama' }}</p>
          </div>
          <div class="detail-grid-item">
            <span class="detail-meta-label">Merek &amp; Nomor Seri</span>
            <strong>{{ selectedAsset.brandModel || '-' }}</strong>
            <p class="text-muted">SN: {{ selectedAsset.serialNumber || '-' }}</p>
          </div>
          <div class="detail-grid-item">
            <span class="detail-meta-label">Kondisi Fisik</span>
            <span class="condition-chip" :class="selectedAsset.condition === 'GOOD' ? 'cond-good' : 'cond-warn'">
              <span class="cond-dot"></span>
              {{ selectedAsset.condition === 'GOOD' ? 'Kondisi Baik' : 'Perlu Perbaikan' }}
            </span>
          </div>
        </div>

        <div class="deprec-schedule-box">
          <h4 class="deprec-schedule-title">Simulasi Penyusutan (Metode Garis Lurus)</h4>
          <div class="deprec-grid">
            <div>
              <span class="text-muted">Nilai Perolehan</span>
              <strong class="money">{{ formatCurrency(selectedAsset.acquisitionCost) }}</strong>
            </div>
            <div>
              <span class="text-muted">Masa Manfaat</span>
              <strong>{{ selectedAsset.usefulLifeYears }} Tahun ({{ selectedAsset.usefulLifeMonths }} bln)</strong>
            </div>
            <div>
              <span class="text-muted">Penyusutan Bulanan</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedAsset.monthlyDepreciation || 0) }}</strong>
            </div>
            <div>
              <span class="text-muted">Akumulasi Depresiasi</span>
              <strong class="money text-danger">- {{ formatCurrency(selectedAsset.accumulatedDepreciation) }}</strong>
            </div>
          </div>
        </div>

        <div v-if="selectedAsset.notes" class="notes-callout">
          <span class="detail-meta-label">Catatan Koordinasi Mas Wildan:</span>
          <p>{{ selectedAsset.notes }}</p>
        </div>

        <!-- Historical Expenditures / Maintenance Log -->
        <div class="expenditures-history-box">
          <div class="expenditures-history-header">
            <h4 class="deprec-schedule-title">Riwayat Perbaikan &amp; Evaluasi Kapitalisasi</h4>
            <span class="erp-badge erp-badge-info">{{ selectedAssetExpenditures.length }} Catatan</span>
          </div>
          <div v-if="loadingExpenditures" class="text-muted" style="padding: 12px 0;">Memuat riwayat pengeluaran...</div>
          <div v-else-if="selectedAssetExpenditures.length === 0" class="text-muted" style="padding: 12px 0; font-size: 13px;">
            Belum ada catatan perbaikan atau renovasi untuk aset ini.
          </div>
          <div v-else class="table-wrap" style="margin-top: 8px;">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No / Tanggal</th>
                  <th>Uraian Perbaikan</th>
                  <th class="money-col">Biaya</th>
                  <th style="text-align: center;">Rasio</th>
                  <th style="text-align: center;">Perlakuan Akuntansi</th>
                  <th>Akun Debet</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="exp in selectedAssetExpenditures" :key="exp.id">
                  <td>
                    <div style="font-weight: 600;">{{ exp.expenditureNumber }}</div>
                    <div class="table-sub">{{ formatDate(exp.transactionDate) }}</div>
                  </td>
                  <td>
                    <div>{{ exp.description }}</div>
                    <div class="table-sub" v-if="exp.vendorName">Vendor: {{ exp.vendorName }}</div>
                  </td>
                  <td class="money-col font-bold">{{ formatCurrency(exp.amount) }}</td>
                  <td style="text-align: center;">
                    <span :class="exp.isCapitalized ? 'text-emerald font-bold' : 'text-amber'">
                      {{ exp.ratioPercent }}%
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="erp-badge" :class="exp.isCapitalized ? 'erp-badge-success' : 'erp-badge-warn'">
                      {{ exp.isCapitalized ? 'Kapitalisasi (>10%)' : 'Beban Rutin (<=10%)' }}
                    </span>
                  </td>
                  <td>
                    <code style="font-size: 11px;">{{ exp.coaDebit }}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-action-row">
          <button type="button" class="btn btn-outline-primary" @click="openExpenditure(selectedAsset); showDetailModal = false;">
            🔧 Catat Pengeluaran Baru
          </button>
          <button type="button" class="btn" @click="showDetailModal = false">
            Tutup
          </button>
        </div>
      </div>
    </ModalDialog>

    <!-- Modal Catat Perbaikan / Renovasi (Ambang Batas 10%) -->
    <ModalDialog
      :open="showExpenditureModal"
      :title="targetAsset ? `Catat Pengeluaran Perbaikan: ${targetAsset.assetCode}` : 'Catat Pengeluaran Aset'"
      @close="showExpenditureModal = false"
    >
      <form v-if="targetAsset" class="asset-modal-form" @submit.prevent="handleSaveExpenditure">
        <div class="detail-header-card" style="margin-bottom: 16px;">
          <div>
            <strong style="font-size: 15px;">{{ targetAsset.name }}</strong>
            <p class="text-muted">{{ targetAsset.category }} · {{ targetAsset.location }}</p>
          </div>
          <div style="text-align: right;">
            <span class="detail-meta-label">Nilai Buku Saat Ini</span>
            <div class="money detail-meta-val text-emerald">{{ formatCurrency(targetAsset.bookValue) }}</div>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Tanggal Transaksi / Pengerjaan <span class="req">*</span></label>
            <input
              v-model="expenditureForm.transactionDate"
              type="date"
              class="input"
              required
            />
          </div>

          <div class="form-field">
            <label class="form-label">Biaya Perbaikan / Pengeluaran (Rp) <span class="req">*</span></label>
            <input
              v-model.number="expenditureForm.amount"
              type="number"
              min="1000"
              step="50000"
              class="input money"
              placeholder="Contoh: 5000000"
              required
            />
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Deskripsi Pekerjaan / Komponen yang Diganti <span class="req">*</span></label>
          <input
            v-model="expenditureForm.description"
            type="text"
            class="input"
            placeholder="Contoh: Penggantian motherboard modul power amplifier & overhaul speaker"
            required
          />
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Penambahan Masa Manfaat (Bulan)</label>
            <input
              v-model.number="expenditureForm.additionalMonths"
              type="number"
              min="0"
              class="input"
              placeholder="0 (Jika renovasi memperpanjang usia aset)"
            />
          </div>

          <div class="form-field">
            <label class="form-label">Vendor / Bengkel Pelaksana</label>
            <input
              v-model="expenditureForm.vendorName"
              type="text"
              class="input"
              placeholder="Contoh: PT Audio Visual Solusindo"
            />
          </div>

          <div class="form-field">
            <label class="form-label">No. Invoice / Kuitansi</label>
            <input
              v-model="expenditureForm.invoiceDocNumber"
              type="text"
              class="input"
              placeholder="INV/2026/12/099"
            />
          </div>
        </div>

        <!-- Live ISAK 335 Decision Callout -->
        <div v-if="liveExpenditureEval" class="eval-preview-box" :class="liveExpenditureEval.isCapitalized ? 'eval-cap' : 'eval-exp'">
          <div class="eval-preview-header">
            <div class="eval-preview-title">
              Evaluasi Otomatis ISAK 335 &amp; Pertor 310
            </div>
            <span class="erp-badge" :class="liveExpenditureEval.badgeClass">
              {{ liveExpenditureEval.treatment }}
            </span>
          </div>
          <p class="eval-preview-desc">{{ liveExpenditureEval.impactDescription }}</p>
          <div class="eval-coa-row">
            <div><span class="text-muted">Debit:</span> <strong>{{ liveExpenditureEval.debitCoa }}</strong></div>
            <div><span class="text-muted">Kredit:</span> <strong>{{ liveExpenditureEval.creditCoa }}</strong></div>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Catatan Tambahan</label>
          <textarea
            v-model="expenditureForm.notes"
            rows="2"
            class="textarea"
            placeholder="Catatan garansi pekerjaan atau rekomendasi teknisi..."
          ></textarea>
        </div>

        <div class="modal-action-row">
          <button
            type="button"
            class="btn"
            @click="showExpenditureModal = false"
          >
            Batal
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saving"
          >
            {{ saving ? 'Menyimpan...' : 'Simpan Pengeluaran' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.assets-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  /* Bottom clearance to prevent MacDock overlap */
  padding-bottom: 96px;
}

/* Mas Wildan Coordinator Card */
.coordinator-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px 20px;
  flex-wrap: wrap;
}

.coordinator-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.coordinator-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}

.coordinator-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.coordinator-name {
  font-size: 0.95rem;
  color: var(--text-primary);
}

.coordinator-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  letter-spacing: 0.02em;
}

.coordinator-desc {
  margin: 3px 0 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.coordinator-stats {
  display: flex;
  align-items: center;
  gap: 20px;
}

.coordinator-stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.coordinator-stat-label {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.coordinator-stat-val {
  font-size: 1.05rem;
  font-weight: 700;
}

/* Metric Strip Enhancements */
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

.erp-badge-neutral {
  background: var(--status-neutral-bg);
  color: var(--status-neutral-text);
  border: 1px solid var(--status-neutral-border);
}

.text-emerald {
  color: var(--status-success-text) !important;
}

.text-amber {
  color: var(--status-warning-text) !important;
}

.text-danger {
  color: var(--status-danger-text) !important;
}

.font-bold {
  font-weight: 700;
}

/* Table Typography & Details */
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

.pic-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
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

.empty-state-cell {
  text-align: center;
  padding: 3rem 1rem !important;
  color: var(--text-secondary);
}

/* Modal Form Styles */
.asset-modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loan-context-box {
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.modal-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.req {
  color: var(--status-danger-text);
}

/* Detail Modal Styles */
.detail-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}

.detail-title {
  margin: 6px 0 2px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-meta-label {
  display: block;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.detail-meta-val {
  font-size: 1.35rem;
  font-weight: 700;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.detail-grid-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 16px;
}

.deprec-schedule-box {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 18px;
}

.deprec-schedule-title {
  margin: 0 0 10px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
}

.deprec-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.deprec-grid > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.85rem;
}

.notes-callout {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 0.85rem;
}

.notes-callout p {
  margin: 4px 0 0;
  color: var(--text-primary);
}

@media (max-width: 900px) {
  .coordinator-card {
    flex-direction: column;
    align-items: flex-start;
  }
  .coordinator-stats {
    width: 100%;
    justify-content: flex-start;
    gap: 24px;
    padding-top: 10px;
    border-top: 1px solid var(--border-subtle);
  }
  .coordinator-stat-item {
    align-items: flex-start;
  }
  .detail-grid,
  .deprec-grid {
    grid-template-columns: 1fr;
  }
}

/* ISAK 335 Compliance Card */
.compliance-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compliance-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.compliance-badge {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
  border: 1px solid var(--border-subtle);
}

.compliance-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.compliance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.compliance-item {
  background: var(--bg-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compliance-tag {
  font-size: 0.72rem;
  font-weight: 700;
  display: inline-block;
  align-self: flex-start;
  padding: 2px 6px;
  border-radius: 4px;
}

.tag-blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.tag-emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.tag-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.tag-purple { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }

.compliance-val {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.compliance-sub {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* Expenditures History Box */
.expenditures-history-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.expenditures-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* Live Evaluation Preview Box */
.eval-preview-box {
  border-radius: var(--radius-md);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border-subtle);
}

.eval-cap {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.3);
}

.eval-exp {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.3);
}

.eval-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.eval-preview-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}

.eval-preview-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-primary);
  line-height: 1.4;
}

.eval-coa-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  padding-top: 6px;
  border-top: 1px dashed var(--border-subtle);
}
</style>
