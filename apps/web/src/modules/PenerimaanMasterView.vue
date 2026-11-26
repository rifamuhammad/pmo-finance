<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah } from '../utils/format';
import StateBanner from '../components/StateBanner.vue';
import AlertBanner from '../components/AlertBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import CurrencyInput from '../components/CurrencyInput.vue';
import TablePagination from '../components/TablePagination.vue';

const auth = useAuthStore();
const route = useRoute();

type MasterSection = 'layanan' | 'pelanggan' | 'coa-pajak' | 'bank-pejabat' | 'target-rab';

const activeSection = computed<MasterSection>(() => {
  const s = String(route.params.section || route.query.section || 'layanan');
  if (s === 'pelanggan' || s === 'coa-pajak' || s === 'bank-pejabat' || s === 'target-rab') return s;
  return 'layanan';
});

const canManageCatalog = computed(() => auth.hasPermission('revenue:create'));
const canManageConfig = computed(() => auth.hasPermission('payment:approve'));

const loading = ref(true);
const saving = ref(false);
const errorMsg = ref('');
const feedbackMsg = ref('');
const modalErrorMsg = ref('');

// Datasets
const products = ref<any[]>([]);
const customers = ref<any[]>([]);
const units = ref<any[]>([]);
const coaAccounts = ref<any[]>([]);
const bankAccounts = ref<any[]>([]);
const taxSchemes = ref<any[]>([]);
const collectorProfiles = ref<any[]>([]);
const rabUnits = ref<Array<{ id: string; code: string; name: string; annualTarget: number; monthlyTarget: number }>>([]);

// Filters & pagination
const searchQuery = ref('');
const selectedUnitId = ref('');
const showInactiveProducts = ref(false);
const customerTypeFilter = ref('');
const coaUnitFilter = ref('');
const prodPage = ref(1);
const custPage = ref(1);
const pageSize = ref(15);

// Config forms (Bank, Pejabat, Target RAB)
const primaryBankForm = ref({
  id: '',
  code: 'BNK-MDR-01',
  glAccountCode: '110102010100',
  bankName: '',
  accountNumberMasked: '',
  accountHolder: '',
});

const taxBankForm = ref({
  bankLabel: 'Bank BRI',
  accountNo: '1173.01.000574.30.4',
  accountHolder: 'PTNBH UT NON PPh 21',
});

const signatoryForm = ref({
  managerTitle: 'Manajer Keuangan, Sumber Daya, dan Umum',
  managerName: 'Husain Husin Mamonto, S.M.',
  managerNip: 'NIP. 197506182003121002',
  headTitle: 'Plh. Kepala Pusat Bisnis dan Investasi',
  headName: 'Dr. Abdurrahman Rahim Thaha, M.A.B.',
  headNip: 'NIP. 198612162022031003',
  recipientTitle: 'Kepala Pusat Pengelolaan Keuangan, Universitas Terbuka',
  letterPrefix: 'UN31.PMO/KU',
});

// Product Modal (Create & Edit)
const productModalOpen = ref(false);
const editingProductId = ref('');
const productForm = ref({
  businessUnitId: '',
  name: '',
  category: '',
  location: '',
  unit: 'Paket',
  unitPrice: 0,
  revenueAccountCode: '420301070200',
  taxScheme: 'PPN12_PPH4_2',
  taxInclusive: true,
  overtimeNote: '',
  freeFacilities: '',
  reason: '',
});

// Customer Modal (Create & Edit)
const customerModalOpen = ref(false);
const editingCustomerId = ref('');
const customerForm = ref({
  name: '',
  organizationType: 'CORPORATE',
  taxCollectorProfile: 'BADAN_POTONG_PPH',
  taxIdNpwp: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  creditLimit: 100000000,
});

const UNIT_COA_OPTIONS: Record<string, Array<{ code: string; label: string; defaultTax: string }>> = {
  'BU-MICE': [
    { code: '420301070200', label: '420301070200 - Pendapatan Sewa Gedung dan Bangunan', defaultTax: 'PPN12_PPH4_2' },
    { code: '420301070300', label: '420301070300 - Pendapatan Sewa Peralatan dan Mesin', defaultTax: 'PPN12_PMK131' },
    { code: '420301070400', label: '420301070400 - Pendapatan Wisma', defaultTax: 'PB1_10' },
    { code: '420301070100', label: '420301070100 - Pendapatan Sewa Tanah', defaultTax: 'PPN12_PPH4_2' },
    { code: '420301090100', label: '420301090100 - Pendapatan Lainnya dari Unit Bisnis', defaultTax: 'PPN12_PMK131' },
  ],
  'BU-KLINIK': [
    { code: '420301060100', label: '420301060100 - Pendapatan Jasa Dokter Umum', defaultTax: 'BEBAS_PAJAK' },
    { code: '420301060200', label: '420301060200 - Pendapatan Jasa Dokter Gigi', defaultTax: 'BEBAS_PAJAK' },
    { code: '420301069900', label: '420301069900 - Pendapatan Jasa Poliklinik Lainnya', defaultTax: 'BEBAS_PAJAK' },
  ],
  'BU-ITS': [
    { code: '420301040200', label: '420301040200 - Pendapatan Jasa TI Bidang Nonakademik', defaultTax: 'PPN12_PPH23' },
    { code: '420301040100', label: '420301040100 - Pendapatan Jasa TI Bidang Akademik', defaultTax: 'PPN12_PPH23' },
    { code: '420301050200', label: '420301050200 - Pendapatan Jasa Produksi Multimedia Nonakademik', defaultTax: 'PPN12_PPH23' },
  ],
  'BU-TCI': [
    { code: '420301010200', label: '420301010200 - Pendapatan Pelatihan', defaultTax: 'PPN12_PPH23' },
    { code: '420301030200', label: '420301030200 - Pendapatan Jasa Sertifikasi Nonakademik', defaultTax: 'PPN12_PPH23' },
    { code: '420301010300', label: '420301010300 - Pendapatan Seminar dan Lokakarya', defaultTax: 'PPN12_PPH23' },
    { code: '420301010100', label: '420301010100 - Pendapatan Kursus', defaultTax: 'PPN12_PPH23' },
    { code: '420301020100', label: '420301020100 - Pendapatan Jasa Konsultasi', defaultTax: 'PPN12_PPH23' },
  ],
};

const UNIT_ORDER = ['BU-MICE', 'BU-KLINIK', 'BU-ITS', 'BU-TCI'];

const operationalUnits = computed(() =>
  units.value
    .filter((u) => UNIT_ORDER.includes(u.code))
    .sort((a, b) => UNIT_ORDER.indexOf(a.code) - UNIT_ORDER.indexOf(b.code))
);

const pageMeta = computed(() => {
  switch (activeSection.value) {
    case 'pelanggan':
      return {
        title: 'Pelanggan & Instansi',
        subtitle: 'Daftar klien, instansi, BUMN, dan profil pemungut Faktur Pajak (Auto-Fit) untuk seluruh transaksi.',
      };
    case 'coa-pajak':
      return {
        title: 'Akun COA & Aturan Pajak PTNBH',
        subtitle: 'Referensi resmi 18 COA Pendapatan Pertor 310 v7, akun pendukung, serta aturan pajak otomatis (Auto-Fit).',
      };
    case 'bank-pejabat':
      return {
        title: 'Rekening Bank & Pejabat Penandatangan',
        subtitle: 'Konfigurasi rekening Bank Mandiri Penerimaan, rekening tujuan setor pajak BRI, dan pejabat cetak surat resmi.',
      };
    case 'target-rab':
      return {
        title: 'Target RAB Pendapatan',
        subtitle: 'Target pendapatan tahunan dan bulanan 4 unit bisnis yang tersambung langsung ke Laporan Realisasi.',
      };
    default:
      return {
        title: 'Layanan & Tarif',
        subtitle: 'Master tarif layanan 4 unit bisnis (MICE, Klinik, ITS, TCI), pemetaan COA resmi, dan skema pajak otomatis.',
      };
  }
});

const productCoaOptions = computed(() => {
  const u = units.value.find((x) => x.id === productForm.value.businessUnitId);
  return UNIT_COA_OPTIONS[u?.code || 'BU-MICE'] || UNIT_COA_OPTIONS['BU-MICE'];
});

const filteredProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return products.value.filter((p) => {
    if (!showInactiveProducts.value && p.isActive === false) return false;
    if (selectedUnitId.value && p.businessUnitId !== selectedUnitId.value) return false;
    if (!q) return true;
    return [p.sku, p.name, p.category, p.location, p.revenueAccountCode, p.taxScheme, p.businessUnit?.code]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
});

const paginatedProducts = computed(() => {
  const start = (prodPage.value - 1) * pageSize.value;
  return filteredProducts.value.slice(start, start + pageSize.value);
});

const filteredCustomers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return customers.value.filter((c) => {
    if (customerTypeFilter.value && c.organizationType !== customerTypeFilter.value) return false;
    if (!q) return true;
    return [c.code, c.name, c.address, c.taxIdNpwp, c.contactPerson, c.email, c.phone, c.taxCollectorProfile]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
});

const paginatedCustomers = computed(() => {
  const start = (custPage.value - 1) * pageSize.value;
  return filteredCustomers.value.slice(start, start + pageSize.value);
});

const filteredCoas = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return coaAccounts.value.filter((c) => {
    if (coaUnitFilter.value && c.unitScope !== coaUnitFilter.value) return false;
    if (!q) return true;
    return [c.code, c.name, c.unitScope, c.type, c.defaultTaxScheme]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
});

const totalRabAnnual = computed(() => rabUnits.value.reduce((s, u) => s + (Number(u.annualTarget) || 0), 0));
const totalRabMonthly = computed(() => Math.round(totalRabAnnual.value / 12));

function getTaxSchemeShort(scheme?: string | null): string {
  switch (scheme) {
    case 'PB1_10': return 'PB1 10%';
    case 'PPN12_PPH4_2': return 'PPN 12% + PPh 4(2) 10%';
    case 'PPN12_PPH23': return 'PPN 12% + PPh 23 (2%)';
    case 'PPN12_PPH23_15': return 'PPN 12% + PPh 23 (15%)';
    case 'PPH21_5': return 'PPh 21 (5%)';
    case 'BEBAS_PAJAK': return 'Bebas Pajak';
    case 'PPN12_PMK131': return 'PPN 12%';
    default: return '-';
  }
}

function formatOrgTypeLabel(t?: string): string {
  if (t === 'GOVERNMENT') return 'Instansi Pemerintah / PTN';
  if (t === 'SOE_BUMN') return 'BUMN';
  if (t === 'INTERNAL_UT') return 'Internal Satker UT';
  if (t === 'INDIVIDUAL') return 'Perorangan / Umum';
  return 'Korporasi / Swasta';
}

function formatCollectorLabel(p?: string): string {
  if (p === 'FP_020_INSTANSI') return 'FP 020 · Instansi Pemungut';
  if (p === 'FP_030_BUMN') return 'FP 030 · BUMN / WAPU';
  if (p === 'BADAN_POTONG_PPH') return 'FP 040 · Badan Potong PPh';
  if (p === 'INTERNAL_UT') return 'Internal UT';
  return 'FP 040 · Umum / Perorangan';
}

function defaultCollectorForOrg(org: string): string {
  if (org === 'GOVERNMENT') return 'FP_020_INSTANSI';
  if (org === 'SOE_BUMN') return 'FP_030_BUMN';
  if (org === 'INTERNAL_UT') return 'INTERNAL_UT';
  if (org === 'CORPORATE') return 'BADAN_POTONG_PPH';
  return 'FP_040_UMUM';
}

function onProductUnitChange() {
  const opts = productCoaOptions.value;
  if (opts.length > 0 && !opts.some((o) => o.code === productForm.value.revenueAccountCode)) {
    productForm.value.revenueAccountCode = opts[0].code;
    productForm.value.taxScheme = opts[0].defaultTax;
  }
}

function onProductCoaChange() {
  const hit = productCoaOptions.value.find((o) => o.code === productForm.value.revenueAccountCode);
  if (hit && !editingProductId.value) {
    productForm.value.taxScheme = hit.defaultTax;
  }
}

function onCustomerOrgChange() {
  customerForm.value.taxCollectorProfile = defaultCollectorForOrg(customerForm.value.organizationType);
}

async function loadAll() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [prodRes, custRes, ovRes, masterRes] = await Promise.all([
      apiFetch('/revenue/products?includeInactive=true'),
      apiFetch('/revenue/customers'),
      apiFetch('/revenue/master/overview'),
      apiFetch('/master/overview').catch(() => ({ data: { businessUnits: [] } })),
    ]);

    products.value = prodRes.data || [];
    customers.value = custRes.data || [];
    units.value = masterRes.data?.businessUnits?.length
      ? masterRes.data.businessUnits
      : ovRes.data?.businessUnits || [];

    const ov = ovRes.data || {};
    coaAccounts.value = ov.coaAccounts || [];
    bankAccounts.value = ov.bankAccounts || [];
    taxSchemes.value = ov.taxSchemes || [];
    collectorProfiles.value = ov.collectorProfiles || [];
    rabUnits.value = (ov.businessUnits || []).map((u: any) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      annualTarget: Number(u.annualTarget || 0),
      monthlyTarget: Math.round(Number(u.annualTarget || 0) / 12),
    }));

    const primaryBank = bankAccounts.value[0];
    if (primaryBank) {
      primaryBankForm.value = {
        id: primaryBank.id,
        code: primaryBank.code,
        glAccountCode: primaryBank.glAccountCode,
        bankName: primaryBank.bankName,
        accountNumberMasked: primaryBank.accountNumberMasked,
        accountHolder: primaryBank.accountHolder,
      };
    }

    if (ov.config?.taxRemittanceBank) {
      taxBankForm.value = { ...taxBankForm.value, ...ov.config.taxRemittanceBank };
    }
    if (ov.config?.signatory) {
      signatoryForm.value = { ...signatoryForm.value, ...ov.config.signatory };
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat Master Data Penerimaan.';
  } finally {
    loading.value = false;
  }
}

// Product CRUD
function openAddProduct() {
  editingProductId.value = '';
  modalErrorMsg.value = '';
  const defaultUnit = operationalUnits.value[0];
  productForm.value = {
    businessUnitId: selectedUnitId.value || defaultUnit?.id || '',
    name: '',
    category: '',
    location: '',
    unit: 'Paket',
    unitPrice: 0,
    revenueAccountCode: '420301070200',
    taxScheme: 'PPN12_PPH4_2',
    taxInclusive: true,
    overtimeNote: '',
    freeFacilities: '',
    reason: '',
  };
  onProductUnitChange();
  productModalOpen.value = true;
}

function openEditProduct(p: any) {
  editingProductId.value = p.id;
  modalErrorMsg.value = '';
  productForm.value = {
    businessUnitId: p.businessUnitId,
    name: p.name || '',
    category: p.category || '',
    location: p.location || '',
    unit: p.unit || 'Paket',
    unitPrice: Number(p.unitPrice || 0),
    revenueAccountCode: p.revenueAccountCode || '420301070200',
    taxScheme: p.taxScheme || 'PPN12_PMK131',
    taxInclusive: p.taxInclusive !== false,
    overtimeNote: p.overtimeNote || '',
    freeFacilities: p.freeFacilities || '',
    reason: '',
  };
  productModalOpen.value = true;
}

async function saveProduct() {
  saving.value = true;
  modalErrorMsg.value = '';
  feedbackMsg.value = '';
  try {
    if (editingProductId.value) {
      await apiFetch(`/revenue/products/${editingProductId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: productForm.value.name,
          category: productForm.value.category,
          location: productForm.value.location || null,
          unit: productForm.value.unit,
          unitPrice: Number(productForm.value.unitPrice || 0),
          revenueAccountCode: productForm.value.revenueAccountCode,
          taxScheme: productForm.value.taxScheme,
          taxInclusive: productForm.value.taxInclusive,
          overtimeNote: productForm.value.overtimeNote || null,
          freeFacilities: productForm.value.freeFacilities || null,
          reason: productForm.value.reason || 'Pembaruan master layanan & tarif',
        }),
      });
      feedbackMsg.value = `Layanan "${productForm.value.name}" berhasil diperbarui. Skema pajak otomatis untuk transaksi baru langsung tersinkron.`;
    } else {
      await apiFetch('/revenue/products', {
        method: 'POST',
        body: JSON.stringify({
          businessUnitId: productForm.value.businessUnitId,
          name: productForm.value.name,
          category: productForm.value.category,
          location: productForm.value.location || null,
          unit: productForm.value.unit,
          unitPrice: Number(productForm.value.unitPrice || 0),
          revenueAccountCode: productForm.value.revenueAccountCode,
          taxScheme: productForm.value.taxScheme,
          taxInclusive: productForm.value.taxInclusive,
          overtimeNote: productForm.value.overtimeNote || null,
          freeFacilities: productForm.value.freeFacilities || null,
        }),
      });
      feedbackMsg.value = `Layanan baru "${productForm.value.name}" berhasil ditambahkan ke Master Data.`;
    }
    productModalOpen.value = false;
    await loadAll();
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal menyimpan layanan.';
  } finally {
    saving.value = false;
  }
}

async function toggleProductActive(p: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const nextState = p.isActive === false;
    await apiFetch(`/revenue/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        isActive: nextState,
        reason: nextState ? 'Mengaktifkan kembali layanan' : 'Menonaktifkan layanan dari katalog aktif',
      }),
    });
    feedbackMsg.value = `Status layanan "${p.name}" diubah menjadi ${nextState ? 'Aktif' : 'Nonaktif'}.`;
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengubah status layanan.';
  }
}

// Customer CRUD
function openAddCustomer() {
  editingCustomerId.value = '';
  modalErrorMsg.value = '';
  customerForm.value = {
    name: '',
    organizationType: 'CORPORATE',
    taxCollectorProfile: 'BADAN_POTONG_PPH',
    taxIdNpwp: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    creditLimit: 100000000,
  };
  customerModalOpen.value = true;
}

function openEditCustomer(c: any) {
  editingCustomerId.value = c.id;
  modalErrorMsg.value = '';
  customerForm.value = {
    name: c.name || '',
    organizationType: c.organizationType || 'CORPORATE',
    taxCollectorProfile: c.taxCollectorProfile || defaultCollectorForOrg(c.organizationType || 'CORPORATE'),
    taxIdNpwp: c.taxIdNpwp || '',
    contactPerson: c.contactPerson || '',
    email: c.email || '',
    phone: c.phone || '',
    address: c.address || '',
    creditLimit: Number(c.creditLimit || 0),
  };
  customerModalOpen.value = true;
}

async function saveCustomer() {
  saving.value = true;
  modalErrorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const payload = {
      name: customerForm.value.name,
      organizationType: customerForm.value.organizationType,
      taxCollectorProfile: customerForm.value.taxCollectorProfile,
      taxIdNpwp: customerForm.value.taxIdNpwp || undefined,
      contactPerson: customerForm.value.contactPerson,
      email: customerForm.value.email,
      phone: customerForm.value.phone,
      address: customerForm.value.address,
      creditLimit: Number(customerForm.value.creditLimit || 0),
    };
    if (editingCustomerId.value) {
      await apiFetch(`/revenue/customers/${editingCustomerId.value}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      feedbackMsg.value = `Data pelanggan "${customerForm.value.name}" berhasil diperbarui. Profil pajak otomatis langsung aktif untuk transaksi baru.`;
    } else {
      await apiFetch('/revenue/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      feedbackMsg.value = `Pelanggan baru "${customerForm.value.name}" berhasil ditambahkan ke Master Data.`;
    }
    customerModalOpen.value = false;
    await loadAll();
  } catch (err: any) {
    modalErrorMsg.value = err.message || 'Gagal menyimpan data pelanggan.';
  } finally {
    saving.value = false;
  }
}

// Bank & Signatory Config Save
async function saveBankAndSignatory() {
  saving.value = true;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch('/revenue/master/config', {
      method: 'PUT',
      body: JSON.stringify({
        ...(primaryBankForm.value.id
          ? {
              primaryBankAccount: {
                id: primaryBankForm.value.id,
                bankName: primaryBankForm.value.bankName,
                accountNumberMasked: primaryBankForm.value.accountNumberMasked,
                accountHolder: primaryBankForm.value.accountHolder,
              },
            }
          : {}),
        taxRemittanceBank: { ...taxBankForm.value },
        signatory: { ...signatoryForm.value },
      }),
    });
    feedbackMsg.value = 'Konfigurasi rekening bank dan pejabat penandatangan tersimpan permanen. Kwitansi, Invoice, dan Surat Penarikan Pajak otomatis menggunakan data terbaru.';
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyimpan konfigurasi rekening dan penandatangan.';
  } finally {
    saving.value = false;
  }
}

// RAB Targets Save
async function saveRabTargets() {
  saving.value = true;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const rabTargets: Record<string, number> = {};
    for (const u of rabUnits.value) {
      rabTargets[u.code] = Math.round(Number(u.annualTarget || 0));
    }
    await apiFetch('/revenue/master/config', {
      method: 'PUT',
      body: JSON.stringify({ rabTargets }),
    });
    feedbackMsg.value = 'Target RAB Pendapatan 4 unit bisnis tersimpan permanen dan langsung tersinkron ke Laporan Realisasi & Export Excel.';
    await loadAll();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyimpan Target RAB Pendapatan.';
  } finally {
    saving.value = false;
  }
}

watch(activeSection, () => {
  searchQuery.value = '';
  selectedUnitId.value = '';
  customerTypeFilter.value = '';
  coaUnitFilter.value = '';
  prodPage.value = 1;
  custPage.value = 1;
  feedbackMsg.value = '';
  errorMsg.value = '';
});

watch([searchQuery, selectedUnitId, showInactiveProducts], () => {
  prodPage.value = 1;
});

watch([searchQuery, customerTypeFilter], () => {
  custPage.value = 1;
});

onMounted(loadAll);
</script>

<template>
  <div class="master-page">
    <!-- Top Header -->
    <div class="master-top-bar">
      <div>
        <h1 class="master-title">{{ pageMeta.title }}</h1>
        <p class="master-subtitle">{{ pageMeta.subtitle }}</p>
      </div>
      <div class="master-top-actions">
        <button
          v-if="activeSection === 'layanan' && canManageCatalog"
          type="button"
          class="pill-btn-navy"
          @click="openAddProduct"
        >
          + Tambah Layanan
        </button>
        <button
          v-else-if="activeSection === 'pelanggan' && canManageCatalog"
          type="button"
          class="pill-btn-navy"
          @click="openAddCustomer"
        >
          + Pelanggan Baru
        </button>
        <button
          v-else-if="activeSection === 'bank-pejabat' && canManageConfig"
          type="button"
          class="pill-btn-navy"
          :disabled="saving"
          @click="saveBankAndSignatory"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan Konfigurasi' }}
        </button>
        <button
          v-else-if="activeSection === 'target-rab' && canManageConfig"
          type="button"
          class="pill-btn-navy"
          :disabled="saving"
          @click="saveRabTargets"
        >
          {{ saving ? 'Menyimpan...' : 'Simpan Target RAB' }}
        </button>
      </div>
    </div>

    <AlertBanner v-if="feedbackMsg" variant="success" title="Berhasil" :message="feedbackMsg" @dismiss="feedbackMsg = ''" />
    <AlertBanner v-if="errorMsg" variant="danger" title="Perhatian" :message="errorMsg" @dismiss="errorMsg = ''" />

    <StateBanner v-if="loading" state="loading" title="Memuat Master Data" message="Mengambil referensi resmi Modul Penerimaan..." />

    <!-- ==================== 1. LAYANAN & TARIF ==================== -->
    <section v-else-if="activeSection === 'layanan'" class="master-card table-card-flush">
      <div class="card-toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="Cari kode layanan, nama, kategori, COA..."
            />
          </div>
          <select v-model="selectedUnitId" class="pill-select" aria-label="Filter Unit Bisnis">
            <option value="">Semua Unit</option>
            <option v-for="u in operationalUnits" :key="u.id" :value="u.id">
              Unit {{ u.code.replace('BU-', '') }}
            </option>
          </select>
        </div>
        <div class="toolbar-right">
          <label class="toggle-check">
            <input v-model="showInactiveProducts" type="checkbox" />
            <span>Tampilkan Nonaktif</span>
          </label>
        </div>
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>Kode &amp; Unit</th>
              <th>Nama Layanan &amp; Kategori</th>
              <th>Kode COA</th>
              <th>Pajak Auto-Fit</th>
              <th class="col-num">Tarif Satuan</th>
              <th>Status</th>
              <th class="col-num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="paginatedProducts.length === 0">
              <td colspan="7" class="empty-cell">Tidak ada layanan yang cocok dengan filter saat ini.</td>
            </tr>
            <tr v-for="p in paginatedProducts" :key="p.id" :class="{ 'row-muted': p.isActive === false }">
              <td>
                <div class="mono-code">{{ p.sku }}</div>
                <span class="unit-mini-tag">{{ p.businessUnit?.code?.replace('BU-', '') }}</span>
              </td>
              <td>
                <strong>{{ p.name }}</strong>
                <div class="cell-sub">{{ p.category }}{{ p.location ? ` · ${p.location}` : '' }} · per {{ p.unit }}</div>
              </td>
              <td class="mono-code">{{ p.revenueAccountCode }}</td>
              <td>
                <span class="tag-pill ok">{{ getTaxSchemeShort(p.taxScheme) }}</span>
                <div class="cell-sub">{{ p.taxInclusive !== false ? 'Include Pajak' : 'Exclude Pajak' }}</div>
              </td>
              <td class="col-num"><strong class="money">{{ formatRupiah(p.unitPrice) }}</strong></td>
              <td>
                <span class="tag-pill" :class="p.isActive === false ? 'muted' : 'ok'">
                  {{ p.isActive === false ? 'Nonaktif' : 'Aktif' }}
                </span>
              </td>
              <td class="col-num">
                <div v-if="canManageCatalog" class="inline-actions">
                  <button type="button" class="mini-btn" @click="openEditProduct(p)">Edit</button>
                  <button
                    type="button"
                    class="mini-btn"
                    :class="p.isActive === false ? 'ok-btn' : 'danger-btn'"
                    @click="toggleProductActive(p)"
                  >
                    {{ p.isActive === false ? 'Aktifkan' : 'Nonaktif' }}
                  </button>
                </div>
                <span v-else class="cell-sub">Read-only</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <TablePagination
        v-model:page="prodPage"
        v-model:pageSize="pageSize"
        :total-items="filteredProducts.length"
        item-label="layanan"
      />
    </section>

    <!-- ==================== 2. PELANGGAN & INSTANSI ==================== -->
    <section v-else-if="activeSection === 'pelanggan'" class="master-card table-card-flush">
      <div class="card-toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="Cari nama pelanggan, instansi, NPWP, PIC..."
            />
          </div>
          <select v-model="customerTypeFilter" class="pill-select" aria-label="Filter Tipe Pelanggan">
            <option value="">Semua Tipe</option>
            <option value="CORPORATE">Korporasi / Swasta</option>
            <option value="GOVERNMENT">Instansi Pemerintah / PTN</option>
            <option value="SOE_BUMN">BUMN</option>
            <option value="INDIVIDUAL">Perorangan / Umum</option>
            <option value="INTERNAL_UT">Internal Satker UT</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Pelanggan &amp; Alamat</th>
              <th>Tipe &amp; Profil Pajak Auto-Fit</th>
              <th>NPWP</th>
              <th>PIC &amp; Kontak</th>
              <th class="col-num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="paginatedCustomers.length === 0">
              <td colspan="6" class="empty-cell">Belum ada data pelanggan yang cocok.</td>
            </tr>
            <tr v-for="c in paginatedCustomers" :key="c.id">
              <td class="mono-code nowrap">{{ c.code }}</td>
              <td>
                <strong>{{ c.name }}</strong>
                <div class="cell-sub">{{ c.address }}</div>
              </td>
              <td>
                <span class="tag-pill info">{{ formatOrgTypeLabel(c.organizationType) }}</span>
                <div class="cell-sub">{{ formatCollectorLabel(c.taxCollectorProfile) }}</div>
              </td>
              <td class="mono-code nowrap">{{ c.taxIdNpwp || '-' }}</td>
              <td>
                <div>{{ c.contactPerson }}</div>
                <div class="cell-sub">{{ c.phone }} · {{ c.email }}</div>
              </td>
              <td class="col-num">
                <button v-if="canManageCatalog" type="button" class="mini-btn" @click="openEditCustomer(c)">
                  Edit
                </button>
                <span v-else class="cell-sub">Read-only</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <TablePagination
        v-model:page="custPage"
        v-model:pageSize="pageSize"
        :total-items="filteredCustomers.length"
        item-label="pelanggan"
      />
    </section>

    <!-- ==================== 3. AKUN COA & ATURAN PAJAK ==================== -->
    <div v-else-if="activeSection === 'coa-pajak'" class="master-stack">
      <section class="master-card table-card-flush">
        <div class="card-toolbar">
          <div class="toolbar-left">
            <div class="search-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input v-model="searchQuery" type="search" class="search-input" placeholder="Cari kode atau nama akun COA..." />
            </div>
            <select v-model="coaUnitFilter" class="pill-select" aria-label="Filter Lingkup COA">
              <option value="">Semua Akun ({{ coaAccounts.length }})</option>
              <option value="MICE">Pendapatan MICE</option>
              <option value="KLINIK">Pendapatan Klinik</option>
              <option value="ITS">Pendapatan IT Solution</option>
              <option value="TCI">Pendapatan TCI</option>
              <option value="PENDUKUNG">Akun Pendukung (Bank, Piutang, Pajak)</option>
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Kode COA</th>
                <th>Nama Akun Resmi (Pertor 310 v7)</th>
                <th>Lingkup</th>
                <th>Kategori</th>
                <th>Pajak Default Auto-Fit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="coa in filteredCoas" :key="coa.id">
                <td class="mono-code nowrap">{{ coa.code }}</td>
                <td><strong>{{ coa.name }}</strong></td>
                <td><span class="unit-mini-tag">{{ coa.unitScope }}</span></td>
                <td class="cell-sub">{{ coa.type }}</td>
                <td>
                  <span v-if="coa.defaultTaxScheme" class="tag-pill ok">{{ getTaxSchemeShort(coa.defaultTaxScheme) }}</span>
                  <span v-else class="cell-sub">Akun Neraca / Lawan</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="master-card table-card-flush">
        <div class="card-head-simple">
          <h2 class="card-title">Aturan Skema Pajak PTNBH (Obyek Transaksi)</h2>
          <p class="card-sub">Diterapkan otomatis saat operator memilih Layanan atau Kode COA pada transaksi.</p>
        </div>
        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Skema</th>
                <th>Rumus Perhitungan</th>
                <th>Berlaku Untuk</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in taxSchemes" :key="t.code">
                <td class="nowrap"><span class="tag-pill ok">{{ t.label }}</span></td>
                <td>{{ t.formula }}</td>
                <td class="cell-sub">{{ t.appliesTo }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="master-card table-card-flush">
        <div class="card-head-simple">
          <h2 class="card-title">Profil Pemungut &amp; Faktur Pajak (Subyek Pelanggan)</h2>
          <p class="card-sub">Diterapkan otomatis berdasarkan profil pelanggan pada Master Pelanggan &amp; Instansi.</p>
        </div>
        <div class="table-wrap">
          <table class="clean-table">
            <thead>
              <tr>
                <th>Kode FP</th>
                <th>Profil Pelanggan</th>
                <th>Aturan Pemungutan / Pemotongan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cp in collectorProfiles" :key="cp.code">
                <td class="mono-code nowrap">{{ cp.fakturCode }}</td>
                <td><strong>{{ cp.label }}</strong></td>
                <td class="cell-sub">{{ cp.withholdingRule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ==================== 4. REKENING BANK & PENANDATANGAN ==================== -->
    <div v-else-if="activeSection === 'bank-pejabat'" class="master-stack">
      <div class="config-2col">
        <section class="master-card">
          <div class="card-head-pad">
            <h2 class="card-title">Rekening Bank Penerimaan (Sumber)</h2>
            <p class="card-sub">Kode {{ primaryBankForm.code }} · COA {{ primaryBankForm.glAccountCode }} · Dipakai pada Kwitansi, Invoice, dan Rekonsiliasi.</p>
          </div>
          <div class="form-stack">
            <div class="field">
              <label for="mb-name">Nama Bank &amp; Keterangan Rekening</label>
              <input id="mb-name" v-model="primaryBankForm.bankName" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="form-2col">
              <div class="field">
                <label for="mb-no">Nomor Rekening</label>
                <input id="mb-no" v-model="primaryBankForm.accountNumberMasked" type="text" class="input mono-input" :disabled="!canManageConfig" />
              </div>
              <div class="field">
                <label for="mb-holder">Atas Nama Rekening</label>
                <input id="mb-holder" v-model="primaryBankForm.accountHolder" type="text" class="input" :disabled="!canManageConfig" />
              </div>
            </div>
          </div>
        </section>

        <section class="master-card">
          <div class="card-head-pad">
            <h2 class="card-title">Rekening Tujuan Setor Pajak (UT)</h2>
            <p class="card-sub">Tampil otomatis pada Surat Penarikan Dana Pajak dan Export Excel 5-Sheet.</p>
          </div>
          <div class="form-stack">
            <div class="field">
              <label for="tb-name">Nama Bank Tujuan</label>
              <input id="tb-name" v-model="taxBankForm.bankLabel" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="form-2col">
              <div class="field">
                <label for="tb-no">Nomor Rekening Tujuan</label>
                <input id="tb-no" v-model="taxBankForm.accountNo" type="text" class="input mono-input" :disabled="!canManageConfig" />
              </div>
              <div class="field">
                <label for="tb-holder">Atas Nama</label>
                <input id="tb-holder" v-model="taxBankForm.accountHolder" type="text" class="input" :disabled="!canManageConfig" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="master-card">
        <div class="card-head-pad">
          <h2 class="card-title">Pejabat Penandatangan &amp; Format Surat Resmi</h2>
          <p class="card-sub">Digunakan otomatis saat mencetak Kwitansi (KU-001), Tanda Terima (KU-002), Invoice (KU-003), dan Surat Penarikan Pajak.</p>
        </div>

        <div class="form-stack">
          <div class="form-3col">
            <div class="field">
              <label for="sg-mtitle">Jabatan Penandatangan 1 (Manajer)</label>
              <input id="sg-mtitle" v-model="signatoryForm.managerTitle" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="field">
              <label for="sg-mname">Nama Pejabat 1</label>
              <input id="sg-mname" v-model="signatoryForm.managerName" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="field">
              <label for="sg-mnip">NIP Pejabat 1</label>
              <input id="sg-mnip" v-model="signatoryForm.managerNip" type="text" class="input" :disabled="!canManageConfig" />
            </div>
          </div>

          <div class="form-3col">
            <div class="field">
              <label for="sg-htitle">Jabatan Penandatangan 2 (Kepala PBI)</label>
              <input id="sg-htitle" v-model="signatoryForm.headTitle" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="field">
              <label for="sg-hname">Nama Pejabat 2</label>
              <input id="sg-hname" v-model="signatoryForm.headName" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="field">
              <label for="sg-hnip">NIP Pejabat 2</label>
              <input id="sg-hnip" v-model="signatoryForm.headNip" type="text" class="input" :disabled="!canManageConfig" />
            </div>
          </div>

          <div class="form-2col">
            <div class="field">
              <label for="sg-recip">Tujuan Surat Penarikan Pajak</label>
              <input id="sg-recip" v-model="signatoryForm.recipientTitle" type="text" class="input" :disabled="!canManageConfig" />
            </div>
            <div class="field">
              <label for="sg-prefix">Kode Prefix Nomor Surat</label>
              <input id="sg-prefix" v-model="signatoryForm.letterPrefix" type="text" class="input mono-input" :disabled="!canManageConfig" />
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ==================== 5. TARGET RAB PENDAPATAN ==================== -->
    <section v-else class="master-card table-card-flush">
      <div class="rab-summary-bar">
        <div>
          <span class="rab-label">Total Target Tahunan (4 Unit)</span>
          <strong class="rab-val money">{{ formatRupiah(totalRabAnnual) }}</strong>
        </div>
        <div>
          <span class="rab-label">Rata-rata Target Bulanan</span>
          <strong class="rab-val money">{{ formatRupiah(totalRabMonthly) }}</strong>
        </div>
      </div>

      <div class="table-wrap">
        <table class="clean-table">
          <thead>
            <tr>
              <th>Kode Unit</th>
              <th>Nama Unit Bisnis</th>
              <th style="width: 260px;">Target RAB Tahunan (Rp)</th>
              <th class="col-num">Target Bulanan (÷ 12)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in rabUnits" :key="u.code">
              <td class="mono-code nowrap">{{ u.code }}</td>
              <td><strong>{{ u.name }}</strong></td>
              <td>
                <CurrencyInput
                  v-if="canManageConfig"
                  v-model="u.annualTarget"
                  :min="0"
                />
                <strong v-else class="money">{{ formatRupiah(u.annualTarget) }}</strong>
              </td>
              <td class="col-num"><strong class="money">{{ formatRupiah(Math.round((Number(u.annualTarget) || 0) / 12)) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ==================== MODAL: TAMBAH / EDIT LAYANAN ==================== -->
    <ModalDialog
      :open="productModalOpen"
      :title="editingProductId ? 'Edit Master Layanan & Tarif' : 'Tambah Master Layanan Baru'"
      maxWidth="760px"
      @close="productModalOpen = false"
    >
      <AlertBanner v-if="modalErrorMsg" variant="danger" title="Gagal Menyimpan" :message="modalErrorMsg" style="margin-bottom: 12px;" @dismiss="modalErrorMsg = ''" />
      <form class="form-stack" @submit.prevent="saveProduct">
        <div class="form-2col">
          <div class="field">
            <label for="pr-unit">Unit Bisnis *</label>
            <select id="pr-unit" v-model="productForm.businessUnitId" class="input" :disabled="Boolean(editingProductId)" required @change="onProductUnitChange">
              <option v-for="u in operationalUnits" :key="u.id" :value="u.id">{{ u.code.replace('BU-', '') }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="pr-cat">Kategori Layanan *</label>
            <input id="pr-cat" v-model="productForm.category" type="text" class="input" placeholder="Contoh: Sewa Ruang & Gedung / Kamar Wisma" required />
          </div>
        </div>

        <div class="field">
          <label for="pr-name">Nama Layanan *</label>
          <input id="pr-name" v-model="productForm.name" type="text" class="input" placeholder="Nama resmi layanan sesuai katalog PMO" required />
        </div>

        <div class="form-3col">
          <div class="field">
            <label for="pr-price">Tarif Satuan (Rp) *</label>
            <CurrencyInput id="pr-price" v-model="productForm.unitPrice" :min="0" />
          </div>
          <div class="field">
            <label for="pr-unitm">Satuan Hitung *</label>
            <input id="pr-unitm" v-model="productForm.unit" type="text" class="input" placeholder="Paket / Malam / Hari / Peserta" required />
          </div>
          <div class="field">
            <label for="pr-loc">Lokasi / Gedung (Opsional)</label>
            <input id="pr-loc" v-model="productForm.location" type="text" class="input" placeholder="Contoh: UTCC / Wisma UT" />
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label for="pr-coa">Kode COA Pendapatan (Pertor 310 v7) *</label>
            <select id="pr-coa" v-model="productForm.revenueAccountCode" class="input" required @change="onProductCoaChange">
              <option v-for="c in productCoaOptions" :key="c.code" :value="c.code">{{ c.label }}</option>
            </select>
          </div>
          <div class="field">
            <label for="pr-tax">Skema Pajak Auto-Fit *</label>
            <select id="pr-tax" v-model="productForm.taxScheme" class="input" required>
              <option value="PB1_10">PB1 10% (Kamar Wisma)</option>
              <option value="PPN12_PPH4_2">PPN 12% + PPh 4(2) 10% (Sewa Gedung)</option>
              <option value="PPN12_PMK131">PPN 12% (DPP Nilai Lain PMK 131)</option>
              <option value="PPN12_PPH23">PPN 12% + PPh 23 (2%) (Jasa TI / Pelatihan)</option>
              <option value="PPN12_PPH23_15">PPN 12% + PPh 23 (15%)</option>
              <option value="PPH21_5">PPh 21 (5%)</option>
              <option value="BEBAS_PAJAK">Bebas Pajak (0% - Klinik)</option>
            </select>
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label class="toggle-check">
              <input v-model="productForm.taxInclusive" type="checkbox" />
              <span>Tarif sudah termasuk pajak (Include Pajak)</span>
            </label>
          </div>
          <div v-if="editingProductId" class="field">
            <label for="pr-reason">Catatan Perubahan (Audit Trail)</label>
            <input id="pr-reason" v-model="productForm.reason" type="text" class="input" placeholder="Contoh: Penyesuaian tarif SK 2026" />
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="productModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy" :disabled="saving">
            {{ saving ? 'Menyimpan...' : editingProductId ? 'Simpan Perubahan' : 'Simpan Layanan' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- ==================== MODAL: TAMBAH / EDIT PELANGGAN ==================== -->
    <ModalDialog
      :open="customerModalOpen"
      :title="editingCustomerId ? 'Edit Master Pelanggan & Profil Pajak' : 'Tambah Pelanggan & Instansi Baru'"
      maxWidth="720px"
      @close="customerModalOpen = false"
    >
      <AlertBanner v-if="modalErrorMsg" variant="danger" title="Gagal Menyimpan" :message="modalErrorMsg" style="margin-bottom: 12px;" @dismiss="modalErrorMsg = ''" />
      <form class="form-stack" @submit.prevent="saveCustomer">
        <div class="form-2col">
          <div class="field">
            <label for="cu-name">Nama Pelanggan / Instansi *</label>
            <input id="cu-name" v-model="customerForm.name" type="text" class="input" placeholder="PT / Instansi / Nama Lengkap" required />
          </div>
          <div class="field">
            <label for="cu-npwp">NPWP (Opsional)</label>
            <input id="cu-npwp" v-model="customerForm.taxIdNpwp" type="text" class="input mono-input" placeholder="00.000.000.0-000.000" />
          </div>
        </div>

        <div class="form-2col">
          <div class="field">
            <label for="cu-org">Tipe Organisasi *</label>
            <select id="cu-org" v-model="customerForm.organizationType" class="input" required @change="onCustomerOrgChange">
              <option value="CORPORATE">Korporasi / Swasta</option>
              <option value="GOVERNMENT">Instansi Pemerintah / PTN</option>
              <option value="SOE_BUMN">BUMN</option>
              <option value="INDIVIDUAL">Perorangan / Umum</option>
              <option value="INTERNAL_UT">Internal Satker UT</option>
            </select>
          </div>
          <div class="field">
            <label for="cu-prof">Profil Pemungut &amp; Faktur Pajak Auto-Fit *</label>
            <select id="cu-prof" v-model="customerForm.taxCollectorProfile" class="input" required>
              <option value="BADAN_POTONG_PPH">FP 040 - Korporasi Pemotong PPh</option>
              <option value="FP_040_UMUM">FP 040 - Umum / Perorangan</option>
              <option value="FP_020_INSTANSI">FP 020 - Instansi Pemerintah / PTN</option>
              <option value="FP_030_BUMN">FP 030 - BUMN / WAPU</option>
              <option value="INTERNAL_UT">Internal Satker UT</option>
            </select>
          </div>
        </div>

        <div class="form-3col">
          <div class="field">
            <label for="cu-pic">Nama PIC *</label>
            <input id="cu-pic" v-model="customerForm.contactPerson" type="text" class="input" placeholder="Nama penanggung jawab" required />
          </div>
          <div class="field">
            <label for="cu-phone">Telepon / WhatsApp *</label>
            <input id="cu-phone" v-model="customerForm.phone" type="text" class="input" placeholder="021-xxx / 08xx" required />
          </div>
          <div class="field">
            <label for="cu-email">Email *</label>
            <input id="cu-email" v-model="customerForm.email" type="email" class="input" placeholder="finance@instansi.go.id" required />
          </div>
        </div>

        <div class="field">
          <label for="cu-addr">Alamat Lengkap *</label>
          <input id="cu-addr" v-model="customerForm.address" type="text" class="input" placeholder="Alamat lengkap penagihan" required />
        </div>

        <div class="modal-foot">
          <button type="button" class="pill-btn-soft" @click="customerModalOpen = false">Batal</button>
          <button type="submit" class="pill-btn-navy" :disabled="saving">
            {{ saving ? 'Menyimpan...' : editingCustomerId ? 'Simpan Perubahan' : 'Simpan Pelanggan' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.master-page {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 28px;
}

.master-top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.master-title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  color: #111827;
  letter-spacing: -0.025em;
}

.master-subtitle {
  margin: 2px 0 0;
  font-size: 14px;
  color: #6b7280;
}

.master-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.master-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.master-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
}

.table-card-flush {
  padding: 0;
  overflow: hidden;
}

.card-toolbar {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-head-simple {
  padding: 16px 20px 12px;
}

.card-head-pad {
  margin-bottom: 14px;
}

.card-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #111827;
}

.card-sub {
  margin: 3px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 300px;
  max-width: 100%;
}

.search-box svg {
  position: absolute;
  left: 11px;
  color: #6b7280;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 34px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  outline: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.search-input:focus {
  border-color: #034693;
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.2);
}

.pill-select {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.pill-btn-navy {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #034693;
  background: #034693;
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
}
.pill-btn-navy:hover:not(:disabled) { background: #023470; }
.pill-btn-navy:disabled { opacity: 0.6; cursor: not-allowed; }

.pill-btn-soft {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
}
.pill-btn-soft:hover { background: #f3f4f6; }

.toggle-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
}

.table-wrap { width: 100%; overflow-x: auto; }
.clean-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.clean-table th {
  text-align: left;
  padding: 11px 14px;
  color: #6b7280;
  background: #fafafa;
  font-size: 12px;
  font-weight: 500;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}
.clean-table td {
  padding: 12px 14px;
  color: #111827;
  font-weight: 400;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
.clean-table tbody tr:hover td { background: rgba(249, 250, 251, 0.85); }
.col-num { text-align: right !important; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.empty-cell { text-align: center; padding: 32px !important; color: #6b7280; }
.row-muted { opacity: 0.6; }

.mono-code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: -0.015em;
  color: #034693;
}

.mono-input {
  font-family: var(--font-mono);
}

.cell-sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.unit-mini-tag {
  display: inline-block;
  margin-top: 2px;
  padding: 1px 7px;
  border-radius: 9999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
  font-weight: 500;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.tag-pill.ok { background: rgba(16, 185, 129, 0.12); color: #059669; }
.tag-pill.info { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.tag-pill.muted { background: #f3f4f6; color: #6b7280; }

.inline-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.mini-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.mini-btn:hover { background: #f3f4f6; color: #111827; }
.mini-btn.danger-btn { background: rgba(239, 68, 68, 0.08); border-color: transparent; color: #dc2626; }
.mini-btn.ok-btn { background: rgba(16, 185, 129, 0.12); border-color: transparent; color: #059669; }

.config-2col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.rab-summary-bar {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
  background: #ffffff;
}

.rab-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
}

.rab-val {
  display: block;
  margin-top: 2px;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  letter-spacing: -0.02em;
}

.form-stack { display: flex; flex-direction: column; gap: 14px; }
.form-2col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: end; }
.form-3col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; }
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.field label { font-size: 12.5px; font-weight: 500; color: #374151; }
.input {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  font-size: 13.5px;
  width: 100%;
  box-sizing: border-box;
}
.input:disabled { background: #f9fafb; color: #6b7280; cursor: not-allowed; }
.input:focus { outline: none; border-color: #034693; box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.16); }

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 960px) {
  .config-2col,
  .form-2col,
  .form-3col {
    grid-template-columns: 1fr;
  }
}
</style>
