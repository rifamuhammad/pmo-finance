<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import StatusBadge from '../components/StatusBadge.vue';
import ModalDialog from '../components/ModalDialog.vue';
import CoaCombobox, { type CoaAccountItem } from '../components/CoaCombobox.vue';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { formatRupiah as formatCurrency, formatDate } from '../utils/format';

const auth = useAuthStore();

type SubmissionType = 'GUP' | 'TUP_NIHIL';
type SubViewMode = 'LIST' | 'CREATE';

interface PettyCashItemRow {
  id: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
}

interface PettyCashSubmissionRecord {
  id: string;
  submissionNo: string;
  type: SubmissionType;
  businessUnitId: string | null;
  businessUnitName?: string;
  proposerName: string;
  proposerUnit: string;
  proposerPhone: string;
  budgetType: string;
  draCode: string;
  draDescription: string;
  coaCode: string;
  coaName: string;
  activityDetail: string;
  vendorId?: string | null;
  vendorName: string;
  vendorTaxId: string;
  vendorIdentityName: string;
  vendorIdentityFile?: string | null;
  saveToMasterVendor?: boolean;
  transactionDate: string;
  paymentMethod: string;
  transactionKind: string;
  regionType: string;
  taxIncludeMode: string;
  taxCategory: string;
  taxDetailStatus: string;
  dppAmount: number;
  ppnRate: number;
  ppnAmount: number;
  pphRate: number;
  pphAmount: number;
  grossAmount: number;
  netPayableAmount: number;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  invoiceFile?: string | null;
  receiptFile?: string | null;
  journalEntryId?: string | null;
  journalDocNo?: string | null;
  verifiedTaxBy?: string | null;
  approvedBy?: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'TAX_VERIFIED' | 'VERIFIED_TAX' | 'APPROVED' | 'APPROVED_FINANCE' | 'DISBURSED' | 'REJECTED';
  statusLabel?: string;
  items: PettyCashItemRow[];
}

interface BudgetLineOption {
  id: string;
  draCode: string;
  code: string;
  name?: string;
  description: string;
  coaCode: string;
  coaName: string;
  businessUnitId: string | null;
  businessUnitName: string;
  availableAmount: number;
}

interface BusinessUnitOption {
  id: string;
  code: string;
  name: string;
  category?: string;
}

interface VendorOption {
  id: string;
  code: string;
  name: string;
  taxId?: string | null;
  taxIdNpwp?: string | null;
  category?: string;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountHolder?: string | null;
}

interface CoaOption {
  id?: string;
  code: string;
  name: string;
  type?: string;
  category?: string;
  normalBalance?: string;
  businessUnit?: string;
  isControlAccount?: boolean;
}

interface UserOption {
  id: string;
  fullName: string;
  role: string;
  businessUnitId: string | null;
}

const activeModuleTab = ref<SubmissionType>('GUP');
const currentSubView = ref<SubViewMode>('LIST');
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const successBanner = ref('');

// Summary state from DB
const summary = reactive({
  plafonGup: 100000000,
  saldoDiproses: 0,
  saldoTerserap: 0,
  sisaSaldo: 100000000,
  tupActivePlafon: 75000000,
  tupAccounted: 0,
  tupRemainingUnaccounted: 75000000,
  tupDeadlineDays: 9,
  totalSubmissions: 0,
  pendingVerificationCount: 0
});

// Master context from DB
const masterData = reactive<{
  businessUnits: BusinessUnitOption[];
  vendors: VendorOption[];
  coas: CoaOption[];
  budgetLines: BudgetLineOption[];
  users: UserOption[];
}>({
  businessUnits: [],
  vendors: [],
  coas: [],
  budgetLines: [],
  users: []
});

// List filter
const searchQuery = ref('');
const statusFilter = ref<string>('ALL');

// SelectedBudgetLineId tracks unique DRA option
const selectedBudgetLineId = ref<string>('');
// SelectedVendorPreset tracks dropdown selection from Master Vendor
const selectedVendorPresetId = ref<string>('');

// Form Ajuan state (Clean Slate for Production Input)
const formAjuan = reactive({
  proposerName: auth.user?.fullName || '',
  businessUnitId: auth.user?.businessUnitId || '',
  proposerUnit: '',
  proposerPhone: '',
  budgetType: 'Anggaran Operasional',
  draCode: '',
  draDescription: '',
  coaCode: '',
  coaName: '',
  activityDetail: '',
  vendorId: null as string | null,
  vendorName: '',
  vendorTaxId: '',
  vendorIdentityName: '',
  vendorIdentityFile: '',
  saveToMasterVendor: false,
  transactionDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'Transfer Bank',
  transactionKind: 'Transaksi Baru',
  regionType: 'Dalam Negeri'
});

// Daftar Permintaan (Line Items) - Start clean with 1 blank row
const requestItems = ref<PettyCashItemRow[]>([
  {
    id: 'item-1',
    itemName: '',
    unit: 'Paket',
    quantity: 1,
    unitPrice: 0
  }
]);

// Perhitungan Pajak state
const taxForm = reactive({
  includeMode: 'Exclude PPN (Belum Termasuk Pajak)',
  taxCategory: 'Non-Pajak / Bebas PPh',
  taxDetailStatus: 'Memiliki NPWP (Tarif Normal)'
});

// Upload Dokumen state
const docsForm = reactive({
  invoiceNo: '',
  invoiceDate: new Date().toISOString().slice(0, 10),
  invoiceFile: '',
  receiptFile: ''
});

function resetForm() {
  formAjuan.proposerName = auth.user?.fullName || '';
  formAjuan.businessUnitId = auth.user?.businessUnitId || (masterData.businessUnits[0]?.id || '');
  const foundUnit = masterData.businessUnits.find((u) => u.id === formAjuan.businessUnitId);
  formAjuan.proposerUnit = foundUnit ? foundUnit.name : '';
  formAjuan.proposerPhone = '';
  formAjuan.budgetType = 'Anggaran Operasional';
  formAjuan.draCode = '';
  formAjuan.draDescription = '';
  formAjuan.coaCode = '';
  formAjuan.coaName = '';
  formAjuan.activityDetail = '';
  formAjuan.vendorId = null;
  formAjuan.vendorName = '';
  formAjuan.vendorTaxId = '';
  formAjuan.vendorIdentityName = '';
  formAjuan.vendorIdentityFile = '';
  formAjuan.saveToMasterVendor = false;
  formAjuan.transactionDate = new Date().toISOString().slice(0, 10);
  formAjuan.paymentMethod = 'Transfer Bank';
  formAjuan.transactionKind = 'Transaksi Baru';
  formAjuan.regionType = 'Dalam Negeri';

  selectedBudgetLineId.value = '';
  selectedVendorPresetId.value = '';

  requestItems.value = [
    {
      id: `item-${Date.now()}`,
      itemName: '',
      unit: 'Paket',
      quantity: 1,
      unitPrice: 0
    }
  ];

  taxForm.includeMode = 'Exclude PPN (Belum Termasuk Pajak)';
  taxForm.taxCategory = 'Non-Pajak / Bebas PPh';
  taxForm.taxDetailStatus = 'Memiliki NPWP (Tarif Normal)';

  docsForm.invoiceNo = '';
  docsForm.invoiceDate = new Date().toISOString().slice(0, 10);
  docsForm.invoiceFile = '';
  docsForm.receiptFile = '';
}

function startNewSubmission() {
  resetForm();
  currentSubView.value = 'CREATE';
}

// Submissions list from DB
const submissions = ref<PettyCashSubmissionRecord[]>([]);

// Detail modal
const showDetailModal = ref(false);
const showSpjPrintModal = ref(false);

function triggerPrintSpj(sub?: PettyCashSubmissionRecord) {
  if (sub) selectedSubmission.value = sub;
  showSpjPrintModal.value = true;
}

function doPrintWindow() {
  window.print();
}
const selectedSubmission = ref<PettyCashSubmissionRecord | null>(null);

// Filtered DRA options based on selected businessUnitId (with fallback to all budgetLines)
const availableBudgetLines = computed(() => {
  if (!masterData.budgetLines.length) return [];
  if (!formAjuan.businessUnitId) return masterData.budgetLines;
  const matching = masterData.budgetLines.filter(
    (line) => line.businessUnitId === formAjuan.businessUnitId
  );
  return matching.length > 0 ? matching : masterData.budgetLines;
});

const selectedBudgetLine = computed(() =>
  masterData.budgetLines.find((b) => b.id === selectedBudgetLineId.value) || null
);

// Sync proposerUnit name when businessUnitId changes
watch(
  () => formAjuan.businessUnitId,
  (newUnitId) => {
    const foundUnit = masterData.businessUnits.find((u) => u.id === newUnitId);
    if (foundUnit) {
      formAjuan.proposerUnit = foundUnit.name;
    }
    // Also select the first matching budget line for this unit if current doesn't match
    const lines = availableBudgetLines.value;
    if (lines.length > 0 && !lines.some((l) => l.id === selectedBudgetLineId.value)) {
      selectBudgetLineById(lines[0].id);
    }
  }
);

const LEGACY_COA_MAP: Record<string, { code: string; name: string }> = {
  '5-1100': { code: '520101030100', name: 'Belanja Pegawai Tidak Tetap (Gaji PUT PK)' },
  '5-1200': { code: '520201010100', name: 'Belanja Bahan & Perlengkapan Operasional Unit' },
  '5-1300': { code: '520101040100', name: 'Belanja Lembur & Honorarium Instruktur' },
  '5-1400': { code: '520201010200', name: 'Belanja Pemeliharaan Sarana & Utilitas' },
  '5-1500': { code: '520501010100', name: 'Beban Administrasi Bank & Payment Gateway' },
};

function selectBudgetLineById(lineId: string) {
  selectedBudgetLineId.value = lineId;
  const line = masterData.budgetLines.find((b) => b.id === lineId);
  if (line) {
    const rawCoa = line.coaCode || line.code;
    const mapped = LEGACY_COA_MAP[rawCoa];
    formAjuan.draCode = mapped ? mapped.code : (line.draCode || line.code);
    formAjuan.draDescription = line.description || line.name || '';
    formAjuan.coaCode = mapped ? mapped.code : rawCoa;
    formAjuan.coaName = mapped ? mapped.name : (line.coaName || line.description || line.name || '');
  }
}

function onBudgetLineChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  selectBudgetLineById(target.value);
}

function onCoaSelected(acc: CoaAccountItem | null) {
  if (acc) {
    formAjuan.coaCode = acc.code;
    formAjuan.coaName = acc.name;
  }
}

function onCoaChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const found = masterData.coas.find((c) => c.code === target.value);
  if (found) {
    formAjuan.coaCode = found.code;
    formAjuan.coaName = found.name;
  }
}

function onVendorPresetChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  const vendorId = target.value;
  selectedVendorPresetId.value = vendorId;

  if (!vendorId) {
    formAjuan.vendorId = null;
    return;
  }

  const found = masterData.vendors.find((v) => v.id === vendorId);
  if (found) {
    formAjuan.vendorId = found.id;
    formAjuan.vendorName = found.name;
    formAjuan.vendorTaxId = found.taxId || found.taxIdNpwp || '00.000.000.0-000.000';
    formAjuan.vendorIdentityName = `${found.name} (${found.category || 'Rekanan Terdaftar'})`;
    formAjuan.saveToMasterVendor = false;
  }
}

function onVendorIdentityFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    formAjuan.vendorIdentityFile = file.name;
  }
}

function onInvoiceFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    docsForm.invoiceFile = file.name;
  }
}

function onReceiptFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    docsForm.receiptFile = file.name;
  }
}

// Computed Calculations for Daftar Permintaan & Pajak
const rawItemsTotal = computed(() =>
  requestItems.value.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  )
);

const dppValue = computed(() => {
  if (taxForm.includeMode.startsWith('Include')) {
    return Math.round(rawItemsTotal.value / 1.11);
  }
  return rawItemsTotal.value;
});

const ppnRateValue = computed(() => {
  if (
    taxForm.taxCategory.includes('PPN') ||
    taxForm.includeMode.startsWith('Include') ||
    taxForm.taxCategory.includes('PPh 22')
  ) {
    return 11;
  }
  return 0;
});

const ppnValue = computed(() => Math.round((dppValue.value * ppnRateValue.value) / 100));

const pphRateValue = computed(() => {
  const baseMultiplier = taxForm.taxDetailStatus.includes('Tanpa NPWP') ? 2 : 1;
  if (taxForm.taxCategory.includes('PPh 23')) return 2 * baseMultiplier;
  if (taxForm.taxCategory.includes('PPh 22')) return 1.5 * baseMultiplier;
  if (taxForm.taxCategory.includes('PPh 21')) return 2.5 * baseMultiplier;
  if (taxForm.taxCategory.includes('Final UMKM')) return 0.5;
  return 0;
});

const pphValue = computed(() => Math.round((dppValue.value * pphRateValue.value) / 100));

const grossTransactionValue = computed(() => dppValue.value + ppnValue.value);

const netPayableToVendor = computed(() => dppValue.value + ppnValue.value - pphValue.value);

const filteredSubmissions = computed(() => {
  return submissions.value.filter((item) => {
    const matchTab = item.type === activeModuleTab.value;
    const matchStatus =
      statusFilter.value === 'ALL' ||
      item.status === statusFilter.value ||
      (statusFilter.value === 'TAX_VERIFIED' && item.status === 'VERIFIED_TAX') ||
      (statusFilter.value === 'APPROVED' && item.status === 'APPROVED_FINANCE');
    const q = searchQuery.value.trim().toLowerCase();
    const matchQuery =
      !q ||
      (item.submissionNo || '').toLowerCase().includes(q) ||
      (item.activityDetail || '').toLowerCase().includes(q) ||
      (item.vendorName || '').toLowerCase().includes(q) ||
      (item.draDescription || '').toLowerCase().includes(q);
    return matchTab && matchStatus && matchQuery;
  });
});

async function loadAllData() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [summaryRes, masterRes, listRes] = await Promise.all([
      api.get<any>('/petty-cash/summary'),
      api.get<typeof masterData>('/petty-cash/master-context'),
      api.get<any[]>('/petty-cash/submissions')
    ]);

    const sData = summaryRes.data || {};
    summary.plafonGup = sData.plafonGup ?? sData.saldoGup ?? 150000000;
    summary.saldoDiproses = sData.saldoDiproses ?? 0;
    summary.saldoTerserap = sData.saldoTerserap ?? 0;
    summary.sisaSaldo = sData.sisaSaldo ?? Math.max(0, summary.plafonGup - summary.saldoDiproses - summary.saldoTerserap);
    summary.tupActivePlafon = sData.tupActivePlafon ?? 75000000;
    summary.tupAccounted = sData.tupAccounted ?? 0;
    summary.tupRemainingUnaccounted = sData.tupRemainingUnaccounted ?? Math.max(0, summary.tupActivePlafon - summary.tupAccounted);
    summary.tupDeadlineDays = sData.tupDeadlineDays ?? 9;
    summary.totalSubmissions = sData.totalSubmissions ?? sData.totalAjuanAktif ?? 0;
    summary.pendingVerificationCount = sData.pendingVerificationCount ?? sData.totalAjuanAktif ?? 0;

    masterData.businessUnits = masterRes.data.businessUnits || [];
    masterData.vendors = (masterRes.data.vendors || []).map((v: any) => ({
      ...v,
      taxId: v.taxId || v.taxIdNpwp || null
    }));
    masterData.coas = (masterRes.data.coas || [])
      .filter((c: any) => !c.code.includes('-') && !c.name.includes('[LEGACY]'))
      .map((c: any) => ({
        id: c.id || c.code,
        code: c.code,
        name: c.name,
        type: c.type || (c.code.startsWith('5') ? 'EXPENSE' : c.code.startsWith('4') ? 'REVENUE' : c.code.startsWith('1') ? 'ASSET' : c.code.startsWith('2') ? 'LIABILITY' : 'EQUITY'),
        category: c.category || '',
        normalBalance: c.normalBalance || (c.code.startsWith('5') || c.code.startsWith('1') ? 'DEBIT' : 'CREDIT'),
        businessUnit: c.businessUnit || 'ALL',
        isControlAccount: Boolean(c.isControlAccount)
      }));
    masterData.budgetLines = (masterRes.data.budgetLines || []).map((bl: any) => ({
      ...bl,
      description: bl.description || bl.name || ''
    }));
    masterData.users = (masterRes.data.users || []).map((u: any) => ({
      ...u,
      role: u.role || u.roleCode || ''
    }));

    // Initialize default unit and budget line from real DB records if not set
    if (!formAjuan.businessUnitId && masterData.businessUnits.length > 0) {
      formAjuan.businessUnitId = masterData.businessUnits[0].id;
      formAjuan.proposerUnit = masterData.businessUnits[0].name;
    } else if (formAjuan.businessUnitId) {
      const unit = masterData.businessUnits.find((u) => u.id === formAjuan.businessUnitId);
      if (unit) formAjuan.proposerUnit = unit.name;
    }

    if (masterData.budgetLines.length > 0 && !selectedBudgetLineId.value) {
      const firstLine = availableBudgetLines.value[0] || masterData.budgetLines[0];
      selectBudgetLineById(firstLine.id);
    }

    submissions.value = (listRes.data || []).map((r: any) => ({
      ...r,
      proposerName: r.proposerName || r.applicantName || '-',
      proposerUnit: r.proposerUnit || r.applicantUnit || '-',
      proposerPhone: r.proposerPhone || r.applicantPhone || '-',
      budgetType: r.budgetType || r.expenseCategory || 'Anggaran Operasional',
      draCode: r.draCode || r.draUkCode || '-',
      draDescription: r.draDescription || r.draUkName || '-',
      activityDetail: r.activityDetail || r.activityDescription || '-',
      dppAmount: r.dppAmount ?? r.dppPph ?? r.totalTransaction ?? 0,
      ppnRate: r.ppnRate ?? (Number(r.ppnAmount) > 0 ? 11 : 0),
      ppnAmount: r.ppnAmount ?? 0,
      pphRate: r.pphRate ?? r.taxRatePercent ?? 0,
      pphAmount: r.pphAmount ?? 0,
      grossAmount: r.grossAmount ?? (Number(r.totalTransaction || 0) + Number(r.ppnAmount || 0)),
      netPayableAmount: r.netPayableAmount ?? r.netDisbursement ?? 0
    }));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal memuat data GUP/TUP dari server';
  } finally {
    loading.value = false;
  }
}

function addItemRow() {
  requestItems.value.push({
    id: `item-${Date.now()}`,
    itemName: '',
    unit: 'Paket',
    quantity: 1,
    unitPrice: 0
  });
}

function removeItemRow(id: string) {
  if (requestItems.value.length <= 1) return;
  requestItems.value = requestItems.value.filter((item) => item.id !== id);
}

function openDetail(record: PettyCashSubmissionRecord) {
  selectedSubmission.value = record;
  showDetailModal.value = true;
}

async function submitAjuan(submitImmediately = true) {
  errorMessage.value = '';
  if (!formAjuan.proposerName.trim()) {
    errorMessage.value = 'Nama Pegawai Pengusul wajib diisi.';
    return;
  }
  if (!formAjuan.vendorName.trim()) {
    errorMessage.value = 'Nama Rekanan / Vendor wajib diisi.';
    return;
  }
  if (rawItemsTotal.value <= 0) {
    errorMessage.value = 'Daftar Permintaan minimal harus memiliki 1 item dengan harga lebih dari Rp 0.';
    return;
  }

  saving.value = true;
  try {
    const res = await api.post<PettyCashSubmissionRecord>('/petty-cash/submissions', {
      type: activeModuleTab.value,
      businessUnitId: formAjuan.businessUnitId || null,
      proposerName: formAjuan.proposerName,
      applicantName: formAjuan.proposerName,
      proposerUnit: formAjuan.proposerUnit || 'Operasional & Kantor Pusat PMO',
      applicantUnit: formAjuan.proposerUnit || 'Operasional & Kantor Pusat PMO',
      proposerPhone: formAjuan.proposerPhone || '08123456789',
      applicantPhone: formAjuan.proposerPhone || '08123456789',
      budgetType: formAjuan.budgetType,
      expenseCategory: formAjuan.budgetType,
      draCode: formAjuan.draCode,
      draUkCode: formAjuan.draCode,
      draDescription: formAjuan.draDescription || 'Alokasi Anggaran Operasional',
      draUkName: formAjuan.draDescription || 'Alokasi Anggaran Operasional',
      coaCode: formAjuan.coaCode,
      coaName: formAjuan.coaName,
      activityDetail: formAjuan.activityDetail,
      activityDescription: formAjuan.activityDetail,
      vendorId: formAjuan.vendorId,
      vendorName: formAjuan.vendorName,
      vendorTaxId: formAjuan.vendorTaxId || '00.000.000.0-000.000',
      vendorIdentityName: formAjuan.vendorIdentityName || formAjuan.vendorName,
      vendorIdentityFile: formAjuan.vendorIdentityFile || null,
      saveToMasterVendor: formAjuan.saveToMasterVendor,
      isSaveVendor: formAjuan.saveToMasterVendor,
      transactionDate: formAjuan.transactionDate,
      paymentMethod: formAjuan.paymentMethod,
      transactionKind: formAjuan.transactionKind,
      transactionType: formAjuan.transactionKind,
      regionType: formAjuan.regionType,
      territoryType: formAjuan.regionType,
      taxIncludeMode: taxForm.includeMode,
      taxCategory: taxForm.taxCategory,
      taxDetailStatus: taxForm.taxDetailStatus,
      dppAmount: dppValue.value,
      ppnRate: ppnRateValue.value,
      ppnAmount: ppnValue.value,
      pphRate: pphRateValue.value,
      pphAmount: pphValue.value,
      grossAmount: grossTransactionValue.value,
      netPayableAmount: netPayableToVendor.value,
      taxCalculation: {
        taxType: taxForm.taxCategory,
        taxDetail: taxForm.taxDetailStatus,
        dppPpn: dppValue.value,
        dppPph: dppValue.value,
        taxRatePercent: pphRateValue.value,
        pphAmount: pphValue.value,
        ppnAmount: ppnValue.value,
        netDisbursement: netPayableToVendor.value,
        formulas: []
      },
      invoiceNo: docsForm.invoiceNo || 'INV/PMO/2026',
      invoiceDocNo: docsForm.invoiceNo || 'INV/PMO/2026',
      invoiceDate: docsForm.invoiceDate || formAjuan.transactionDate,
      invoiceDocDate: docsForm.invoiceDate || formAjuan.transactionDate,
      invoiceFile: docsForm.invoiceFile,
      invoiceDocFile: docsForm.invoiceFile,
      receiptFile: docsForm.receiptFile,
      receiptUtDocFile: docsForm.receiptFile,
      submitImmediately,
      items: requestItems.value.map((item) => ({
        itemName: item.itemName || 'Item Pengadaan Operasional',
        description: item.itemName || 'Item Pengadaan Operasional',
        unit: item.unit || 'Paket',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        isTaxable: true
      }))
    });

    const created = res.data;
    await loadAllData();
    resetForm();
    currentSubView.value = 'LIST';
    successBanner.value = submitImmediately
      ? `Pengajuan ${created.submissionNo} berhasil disimpan ke database dan dikirim ke antrean Verifikasi Pajak.`
      : `Draft pengajuan ${created.submissionNo} berhasil disimpan ke database.`;
    setTimeout(() => {
      successBanner.value = '';
    }, 6000);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal menyimpan pengajuan';
  } finally {
    saving.value = false;
  }
}

async function submitDraftRecord(record: PettyCashSubmissionRecord) {
  saving.value = true;
  errorMessage.value = '';
  try {
    await api.post(`/petty-cash/submissions/${record.id}/submit`, {});
    await loadAllData();
    showDetailModal.value = false;
    successBanner.value = `Draft ${record.submissionNo} berhasil diajukan ke Verifikasi Pajak.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal mengirim draft pengajuan';
  } finally {
    saving.value = false;
  }
}

async function verifyTaxRecord(record: PettyCashSubmissionRecord) {
  saving.value = true;
  errorMessage.value = '';
  try {
    await api.post(`/petty-cash/submissions/${record.id}/verify-tax`, {});
    await loadAllData();
    showDetailModal.value = false;
    successBanner.value = `Pajak untuk ${record.submissionNo} telah diverifikasi di database.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal memverifikasi pajak';
  } finally {
    saving.value = false;
  }
}

async function approveFinanceRecord(record: PettyCashSubmissionRecord) {
  saving.value = true;
  errorMessage.value = '';
  try {
    await api.post(`/petty-cash/submissions/${record.id}/approve`, {});
    await loadAllData();
    showDetailModal.value = false;
    successBanner.value = `Pengajuan ${record.submissionNo} telah di-approve oleh Finance Manager.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal menyetujui pengajuan';
  } finally {
    saving.value = false;
  }
}

async function disburseRecord(record: PettyCashSubmissionRecord) {
  saving.value = true;
  errorMessage.value = '';
  try {
    const res = await api.post<{
      submission?: PettyCashSubmissionRecord;
      journalDocNo?: string;
    }>(`/petty-cash/submissions/${record.id}/disburse`, {});
    await loadAllData();
    showDetailModal.value = false;
    const jrnNo = res.data?.journalDocNo || `JRN-UP/${new Date().getFullYear()}/${record.submissionNo.split('/').pop() || '001'}`;
    successBanner.value = `Pengajuan ${record.submissionNo} berhasil dicairkan! Jurnal Otomatis (${jrnNo}) telah tercatat di Buku Besar.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Gagal mencairkan dana GUP/TUP';
  } finally {
    saving.value = false;
  }
}

function statusToTone(status: PettyCashSubmissionRecord['status']) {
  if (status === 'DISBURSED' || status === 'APPROVED_FINANCE' || status === 'APPROVED') return 'APPROVED';
  if (status === 'VERIFIED_TAX' || status === 'TAX_VERIFIED' || status === 'SUBMITTED') return 'SUBMITTED';
  if (status === 'REJECTED') return 'REJECTED';
  return 'DRAFT';
}

onMounted(loadAllData);
</script>

<template>
  <div class="petty-cash-page">
    <header class="page-header">
      <div>
        <span class="page-eyebrow">Perbendaharaan &amp; SPJ Operasional · PMO UTama</span>
        <h2 class="page-title">Uang Persediaan &amp; SPJ (GUP / TUP Nihil)</h2>
        <p class="page-subtitle">
          Pengajuan Ganti Uang Persediaan (GUP) dan Pertanggungjawaban Tambahan Uang Persediaan (TUP Nihil) terintegrasi Rencana Anggaran (DRA-UK), Potongan Pajak Otomatis, dan Buku Besar.
        </p>
      </div>
      <div class="page-actions">
        <div class="module-pill-switch" role="tablist" aria-label="Pilih Jenis Pengajuan">
          <button
            type="button"
            class="module-pill-btn"
            :class="{ active: activeModuleTab === 'GUP' }"
            @click="activeModuleTab = 'GUP'"
          >
            GUP (Ganti Uang Persediaan)
          </button>
          <button
            type="button"
            class="module-pill-btn"
            :class="{ active: activeModuleTab === 'TUP_NIHIL' }"
            @click="activeModuleTab = 'TUP_NIHIL'"
          >
            TUP Nihil (Pertanggungjawaban)
          </button>
        </div>
      </div>
    </header>

    <!-- Top KPI Strip: Hero Navy Card + 3 Clean White Cards -->
    <section v-if="activeModuleTab === 'GUP'" class="gup-kpi-grid">
      <article class="kpi-card kpi-card-hero">
        <span class="kpi-eyebrow">PLAFON SALDO GUP UNIT</span>
        <strong class="kpi-amount money">{{ formatCurrency(summary.plafonGup) }}</strong>
        <span class="kpi-foot">Pagu Uang Persediaan Operasional PMO</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">SALDO AJUAN DIPROSES</span>
          <span class="kpi-badge kpi-badge-amber">{{ summary.pendingVerificationCount }} Ajuan</span>
        </div>
        <strong class="kpi-amount money">{{ formatCurrency(summary.saldoDiproses) }}</strong>
        <span class="kpi-foot">Menunggu Verifikasi Pajak / Approval</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">REALISASI TERSERAP (CAIR)</span>
          <span class="kpi-badge kpi-badge-blue">Terjurnal di GL</span>
        </div>
        <strong class="kpi-amount money">{{ formatCurrency(summary.saldoTerserap) }}</strong>
        <span class="kpi-foot">Total SPJ GUP yang sudah dicairkan</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">SISA SALDO UP TERSEDIA</span>
          <span class="kpi-badge kpi-badge-emerald">Siap Digunakan</span>
        </div>
        <strong class="kpi-amount money text-emerald">{{ formatCurrency(summary.sisaSaldo) }}</strong>
        <span class="kpi-foot">Plafon dikurangi ajuan diproses & cair</span>
      </article>
    </section>

    <section v-else class="gup-kpi-grid">
      <article class="kpi-card kpi-card-hero">
        <span class="kpi-eyebrow">DANA TUP AKTIF DITERIMA</span>
        <strong class="kpi-amount money">{{ formatCurrency(summary.tupActivePlafon) }}</strong>
        <span class="kpi-foot">Tambahan Uang Persediaan Kegiatan Khusus</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">SUDAH DIPERTANGGUNGJAWABKAN</span>
          <span class="kpi-badge kpi-badge-emerald">SPJ TUP Nihil</span>
        </div>
        <strong class="kpi-amount money">{{ formatCurrency(summary.tupAccounted) }}</strong>
        <span class="kpi-foot">Bukti belanja & pajak telah diverifikasi</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">BELUM NIHIL (WAJIB SPJ)</span>
          <span class="kpi-badge kpi-badge-amber">Harus Di-nihil-kan</span>
        </div>
        <strong class="kpi-amount money text-amber">{{ formatCurrency(summary.tupRemainingUnaccounted) }}</strong>
        <span class="kpi-foot">Sisa TUP yang wajib dilampiri bukti SPJ</span>
      </article>

      <article class="kpi-card">
        <div class="kpi-head">
          <span class="kpi-eyebrow">BATAS WAKTU SPJ TUP NIHIL</span>
          <span class="kpi-badge kpi-badge-blue">Aktif</span>
        </div>
        <strong class="kpi-amount money">{{ summary.tupDeadlineDays }} Hari Lagi</strong>
        <span class="kpi-foot">Sebelum pengajuan GUP/TUP berikutnya terkunci</span>
      </article>
    </section>

    <!-- Sub-navigation Workspace Bar -->
    <div class="subnav-workspace-bar">
      <div class="subnav-tabs">
        <button
          type="button"
          class="subnav-tab-btn"
          :class="{ active: currentSubView === 'LIST' }"
          @click="currentSubView = 'LIST'"
        >
          Daftar Ajuan ({{ filteredSubmissions.length }})
        </button>
        <button
          type="button"
          class="subnav-tab-btn"
          :class="{ active: currentSubView === 'CREATE' }"
          @click="startNewSubmission"
        >
          + Buat Pengajuan {{ activeModuleTab === 'GUP' ? 'GUP' : 'TUP Nihil' }}
        </button>
      </div>
      <div class="subnav-meta">
        <span class="sync-dot"></span>
        <span>Database PostgreSQL Live · {{ masterData.vendors.length }} Rekanan · {{ masterData.budgetLines.length }} Pos DRA-UK</span>
      </div>
    </div>

    <div v-if="errorMessage" class="alert-banner alert-danger">
      <span>{{ errorMessage }}</span>
      <button type="button" class="alert-close" @click="errorMessage = ''">✕</button>
    </div>

    <div v-if="successBanner" class="alert-banner alert-success">
      <span>{{ successBanner }}</span>
      <button type="button" class="alert-close" @click="successBanner = ''">✕</button>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 1: BUAT PENGAJUAN (CLEAN, SYMMETRIC, 100% INTERACTIVE FORM)   -->
    <!-- =================================================================== -->
    <div v-if="currentSubView === 'CREATE'" class="submission-workspace">
      <!-- SECTION 1: FORM AJUAN -->
      <section class="form-panel" style="position: relative; z-index: 25;">
        <header class="form-panel-header">
          <div>
            <h3 class="form-panel-title">1. Form Ajuan {{ activeModuleTab === 'GUP' ? 'Ganti Uang Persediaan (GUP)' : 'Pertanggungjawaban TUP Nihil' }}</h3>
            <p class="form-panel-subtitle">Lengkapi data pengusul, pos anggaran DRA-UK, serta identitas rekanan penerima pembayaran.</p>
          </div>
          <span class="step-badge">Langkah 1 dari 4</span>
        </header>

        <div class="form-panel-body">
          <div class="symmetric-two-col">
            <!-- LEFT COLUMN: DATA PENGUSUL & ANGGARAN UNIT -->
            <div class="form-col-card">
              <div class="col-section-header">
                <span class="col-section-num">A</span>
                <div>
                  <h4>Data Pengusul & Pos Anggaran (DRA-UK)</h4>
                  <p>Identitas pegawai, unit kerja pengusul, dan alokasi mata anggaran.</p>
                </div>
              </div>

              <!-- Row 1: Nama Pegawai Pengusul -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="input-proposer-name">Nama Pegawai Pengusul <span class="req">*</span></label>
                  <span class="field-hint">Dapat diketik atau dipilih</span>
                </div>
                <input
                  id="input-proposer-name"
                  v-model="formAjuan.proposerName"
                  list="proposer-users-list"
                  type="text"
                  class="form-control"
                  placeholder="Ketik atau pilih nama pegawai pengusul..."
                />
                <datalist id="proposer-users-list">
                  <option v-for="u in masterData.users" :key="u.id" :value="u.fullName">
                    {{ u.role }}
                  </option>
                </datalist>
              </div>

              <!-- Row 2: Unit Kerja Pengusul -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="select-business-unit">Nama Unit Pengusul <span class="req">*</span></label>
                  <span class="field-hint">{{ masterData.businessUnits.length }} unit aktif</span>
                </div>
                <select
                  id="select-business-unit"
                  v-model="formAjuan.businessUnitId"
                  class="form-control"
                >
                  <option
                    v-for="unit in masterData.businessUnits"
                    :key="unit.id"
                    :value="unit.id"
                  >
                    {{ unit.code }} - {{ unit.name }}
                  </option>
                </select>
              </div>

              <!-- Row 3: No Telepon & Jenis Belanja -->
              <div class="form-row-2">
                <div class="form-field">
                  <div class="field-label-row">
                    <label for="input-proposer-phone">No. Telepon / WhatsApp <span class="req">*</span></label>
                  </div>
                  <input
                    id="input-proposer-phone"
                    v-model="formAjuan.proposerPhone"
                    type="text"
                    class="form-control"
                    placeholder="Contoh: 08123456789"
                  />
                </div>

                <div class="form-field">
                  <div class="field-label-row">
                    <label for="select-budget-type">Jenis Belanja <span class="req">*</span></label>
                  </div>
                  <select id="select-budget-type" v-model="formAjuan.budgetType" class="form-control">
                    <option value="Anggaran Operasional">Anggaran Operasional</option>
                    <option value="Anggaran Proyek & Layanan">Anggaran Proyek & Layanan</option>
                    <option value="Belanja Modal Kecil (Inventaris UP)">Belanja Modal Kecil (Inventaris UP)</option>
                  </select>
                </div>
              </div>

              <!-- Row 4: DRA-UK Unit -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="select-dra-line">DRA-UK / Rencana Anggaran Unit <span class="req">*</span></label>
                  <span v-if="selectedBudgetLine" class="field-hint money">
                    Pagu: {{ formatCurrency(selectedBudgetLine.availableAmount) }}
                  </span>
                </div>
                <select
                  id="select-dra-line"
                  :value="selectedBudgetLineId"
                  class="form-control"
                  @change="onBudgetLineChange"
                >
                  <option
                    v-for="line in availableBudgetLines"
                    :key="line.id"
                    :value="line.id"
                  >
                    {{ line.description }} (Pagu: {{ formatCurrency(line.availableAmount) }})
                  </option>
                </select>
              </div>

              <!-- Row 5: Akun Pembebanan (COA) -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="select-coa">Akun Pembebanan Buku Besar (COA) <span class="req">*</span></label>
                  <span class="field-hint">Jurnal Debet Otomatis</span>
                </div>
                <CoaCombobox
                  id="select-coa"
                  v-model="formAjuan.coaCode"
                  :accounts="masterData.coas"
                  placeholder="Pilih atau cari dari 70 akun COA resmi (kode atau nama)..."
                  @select="onCoaSelected"
                />
              </div>

              <!-- Row 6: Uraian Kegiatan -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="textarea-activity">Uraian Kegiatan / Keperluan SPJ <span class="req">*</span></label>
                </div>
                <textarea
                  id="textarea-activity"
                  v-model="formAjuan.activityDetail"
                  rows="2"
                  class="form-control"
                  placeholder="Tuliskan rincian keperluan kegiatan..."
                ></textarea>
              </div>
            </div>

            <!-- RIGHT COLUMN: IDENTITAS REKANAN & DETAIL TRANSAKSI -->
            <div class="form-col-card">
              <div class="col-section-header">
                <span class="col-section-num">B</span>
                <div>
                  <h4>Identitas Rekanan & Detail Transaksi</h4>
                  <p>Pilih dari Master Vendor atau input rekanan baru beserta NPWP/NIK.</p>
                </div>
              </div>

              <!-- Row 1: Pilih Cepat dari Master Vendor -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="select-vendor-preset">Pilih Rekanan Terdaftar (Master Vendor)</label>
                  <span class="field-hint">{{ masterData.vendors.length }} vendor di database</span>
                </div>
                <select
                  id="select-vendor-preset"
                  :value="selectedVendorPresetId"
                  class="form-control"
                  @change="onVendorPresetChange"
                >
                  <option value="">-- Input Rekanan Baru / Ketik Manual di Bawah --</option>
                  <option
                    v-for="v in masterData.vendors"
                    :key="v.id"
                    :value="v.id"
                  >
                    {{ v.code }} - {{ v.name }} (NPWP: {{ v.taxId || 'Belum ada' }})
                  </option>
                </select>
              </div>

              <!-- Row 2: Nama Rekanan -->
              <div class="form-field">
                <div class="field-label-row">
                  <label for="input-vendor-name">Nama Rekanan / Penerima Pembayaran <span class="req">*</span></label>
                </div>
                <input
                  id="input-vendor-name"
                  v-model="formAjuan.vendorName"
                  type="text"
                  class="form-control"
                  placeholder="Contoh: PT Mitra Solusi Integrasi / CV Berkah Rasa"
                />
              </div>

              <!-- Row 3: NPWP/NIK & Nama Identitas -->
              <div class="form-row-2">
                <div class="form-field">
                  <div class="field-label-row">
                    <label for="input-vendor-tax-id">NPWP / NIK Rekanan <span class="req">*</span></label>
                    <span class="field-hint">15/16 Digit</span>
                  </div>
                  <input
                    id="input-vendor-tax-id"
                    v-model="formAjuan.vendorTaxId"
                    type="text"
                    class="form-control"
                    placeholder="00.000.000.0-000.000"
                  />
                </div>

                <div class="form-field">
                  <div class="field-label-row">
                    <label for="input-vendor-id-name">Nama Sesuai NPWP / KTP <span class="req">*</span></label>
                  </div>
                  <input
                    id="input-vendor-id-name"
                    v-model="formAjuan.vendorIdentityName"
                    type="text"
                    class="form-control"
                    placeholder="Nama wajib pajak terdaftar"
                  />
                </div>
              </div>

              <!-- Row 4: Upload NPWP/KTP & Simpan ke Master Vendor -->
              <div class="form-field">
                <div class="field-label-row">
                  <label>Lampiran Scan NPWP / KTP Rekanan (Opsional)</label>
                  <label class="inline-checkbox">
                    <input v-model="formAjuan.saveToMasterVendor" type="checkbox" />
                    <span>Simpan otomatis ke Master Vendor</span>
                  </label>
                </div>
                <div class="file-picker-box">
                  <label class="file-picker-btn">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      class="sr-only-input"
                      @change="onVendorIdentityFileChange"
                    />
                    <span>Pilih File NPWP / KTP</span>
                  </label>
                  <span class="file-picker-name" :class="{ empty: !formAjuan.vendorIdentityFile }">
                    {{ formAjuan.vendorIdentityFile || 'Belum ada file dipilih (PDF/JPG/PNG)' }}
                  </span>
                  <button
                    v-if="formAjuan.vendorIdentityFile"
                    type="button"
                    class="file-clear-btn"
                    title="Hapus lampiran"
                    @click="formAjuan.vendorIdentityFile = ''"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <!-- Row 5: Tanggal Transaksi & Jenis Pembayaran -->
              <div class="form-row-2">
                <div class="form-field">
                  <div class="field-label-row">
                    <label for="input-tx-date">Tanggal Transaksi <span class="req">*</span></label>
                  </div>
                  <input
                    id="input-tx-date"
                    v-model="formAjuan.transactionDate"
                    type="date"
                    class="form-control"
                  />
                </div>

                <div class="form-field">
                  <div class="field-label-row">
                    <label for="select-payment-method">Metode Pembayaran <span class="req">*</span></label>
                  </div>
                  <select id="select-payment-method" v-model="formAjuan.paymentMethod" class="form-control">
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Kas Tunai Bendahara">Kas Tunai Bendahara</option>
                    <option value="Virtual Account / QRIS">Virtual Account / QRIS</option>
                  </select>
                </div>
              </div>

              <!-- Row 6: Jenis Transaksi & Tipe Wilayah -->
              <div class="form-row-2">
                <div class="form-field">
                  <div class="field-label-row">
                    <label for="select-tx-kind">Jenis Transaksi <span class="req">*</span></label>
                  </div>
                  <select id="select-tx-kind" v-model="formAjuan.transactionKind" class="form-control">
                    <option value="Transaksi Baru">Transaksi Baru</option>
                    <option value="Transaksi Lanjutan / Termin">Transaksi Lanjutan / Termin</option>
                    <option value="Reimbursement Operasional">Reimbursement Operasional</option>
                  </select>
                </div>

                <div class="form-field">
                  <div class="field-label-row">
                    <label for="select-region-type">Tipe Wilayah Pajak <span class="req">*</span></label>
                  </div>
                  <select id="select-region-type" v-model="formAjuan.regionType" class="form-control">
                    <option value="Dalam Negeri">Dalam Negeri (PPh Pasal 21/22/23/4(2))</option>
                    <option value="Luar Negeri">Luar Negeri (PPh Pasal 26)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 2: DAFTAR PERMINTAAN (LINE ITEMS) -->
      <section class="form-panel">
        <header class="form-panel-header">
          <div>
            <h3 class="form-panel-title">2. Daftar Permintaan Barang / Jasa</h3>
            <p class="form-panel-subtitle">Rincian item belanja yang dipertanggungjawabkan pada SPJ ini.</p>
          </div>
          <button type="button" class="btn-add-row" @click="addItemRow">
            + Tambah Baris Item
          </button>
        </header>

        <div class="form-panel-body">
          <div class="table-wrap">
            <table class="items-grid-table">
              <thead>
                <tr>
                  <th style="width: 48px">No</th>
                  <th>Nama Barang / Jasa / Uraian Komponen <span class="req">*</span></th>
                  <th style="width: 150px">Satuan <span class="req">*</span></th>
                  <th style="width: 110px" class="text-right">Volume <span class="req">*</span></th>
                  <th style="width: 190px" class="text-right">Harga Satuan (Rp) <span class="req">*</span></th>
                  <th style="width: 190px" class="text-right">Jumlah Total (Rp)</th>
                  <th style="width: 64px" class="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in requestItems" :key="item.id">
                  <td class="row-num">{{ idx + 1 }}</td>
                  <td>
                    <input
                      v-model="item.itemName"
                      type="text"
                      class="form-control"
                      placeholder="Contoh: Konsumsi Rapat Koordinasi / Pembelian ATK..."
                    />
                  </td>
                  <td>
                    <select v-model="item.unit" class="form-control">
                      <option value="Paket">Paket</option>
                      <option value="Kotak">Kotak</option>
                      <option value="Unit">Unit</option>
                      <option value="Rim">Rim</option>
                      <option value="Orang / Hari">Orang / Hari</option>
                      <option value="Bulan">Bulan</option>
                      <option value="Kegiatan">Kegiatan</option>
                    </select>
                  </td>
                  <td>
                    <input
                      v-model.number="item.quantity"
                      type="number"
                      min="1"
                      class="form-control text-right money"
                    />
                  </td>
                  <td>
                    <input
                      v-model.number="item.unitPrice"
                      type="number"
                      min="0"
                      step="1000"
                      class="form-control text-right money"
                    />
                  </td>
                  <td class="text-right money row-subtotal">
                    {{ formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) }}
                  </td>
                  <td class="text-center">
                    <button
                      type="button"
                      class="btn-delete-row"
                      :disabled="requestItems.length <= 1"
                      title="Hapus baris"
                      @click="removeItemRow(item.id)"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="text-right tfoot-label">Total Nilai Permintaan (Sebelum Pajak):</td>
                  <td class="text-right money tfoot-total">{{ formatCurrency(rawItemsTotal) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <!-- SECTION 3: PERHITUNGAN PAJAK OTOMATIS -->
      <section class="form-panel">
        <header class="form-panel-header">
          <div>
            <h3 class="form-panel-title">3. Perhitungan Pajak Operasional (PPN & PPh)</h3>
            <p class="form-panel-subtitle">Kalkulasi otomatis Dasar Pengenaan Pajak (DPP), PPN 11%, dan pemotongan PPh sesuai regulasi perpajakan.</p>
          </div>
          <span class="step-badge">Kalkulator Pajak Real-Time</span>
        </header>

        <div class="form-panel-body">
          <div class="tax-controls-grid">
            <div class="form-field">
              <div class="field-label-row">
                <label for="select-tax-mode">Basis Nilai Transaksi <span class="req">*</span></label>
              </div>
              <select id="select-tax-mode" v-model="taxForm.includeMode" class="form-control">
                <option value="Exclude PPN (Belum Termasuk Pajak)">Exclude PPN (Harga Belum Termasuk Pajak)</option>
                <option value="Include PPN (Sudah Termasuk PPN 11%)">Include PPN (Harga Sudah Termasuk PPN 11%)</option>
              </select>
            </div>

            <div class="form-field">
              <div class="field-label-row">
                <label for="select-tax-category">Objek & Jenis Tarif Pajak <span class="req">*</span></label>
              </div>
              <select id="select-tax-category" v-model="taxForm.taxCategory" class="form-control">
                <option value="PPh 23 - Jasa Katering / Jasa Manajemen / Jasa Teknis (2%)">
                  PPh 23 : Jasa Katering / Manajemen / Teknis / Sewa Alat (2%)
                </option>
                <option value="PPh 22 & PPN - Belanja Barang / ATK / Perlengkapan (1.5% + PPN 11%)">
                  PPh 22 & PPN : Pembelian Barang / ATK / Komputer (1.5% + PPN 11%)
                </option>
                <option value="PPh 21 - Honorarium Narasumber / Tenaga Ahli (2.5%)">
                  PPh 21 : Honorarium Narasumber / Tenaga Ahli (2.5%)
                </option>
                <option value="PPh Final UMKM PP 55/2022 (0.5%)">
                  PPh Final UMKM PP 55/2022 : Rekanan Non-PKP Memiliki SKB/UMKM (0.5%)
                </option>
                <option value="PPN 11% Saja (Tanpa Potongan PPh)">
                  PPN 11% Saja (Tanpa Potongan PPh)
                </option>
                <option value="Bebas Pajak / Non-Objek Pajak (0%)">
                  Bebas Pajak / Non-Objek Pajak (0%)
                </option>
              </select>
            </div>

            <div class="form-field">
              <div class="field-label-row">
                <label for="select-npwp-status">Status Kepemilikan NPWP Rekanan <span class="req">*</span></label>
              </div>
              <select id="select-npwp-status" v-model="taxForm.taxDetailStatus" class="form-control">
                <option value="Memiliki NPWP (Tarif Normal)">Memiliki NPWP Aktif (Tarif Normal)</option>
                <option value="Tanpa NPWP (Tarif Lebih Tinggi +100% sesuai UU PPh)">Tanpa NPWP (Tarif +100% Lebih Tinggi)</option>
              </select>
            </div>
          </div>

          <!-- Summary Strip of Tax Numbers -->
          <div class="tax-breakdown-cards">
            <div class="tax-metric-box">
              <span class="tax-metric-label">Dasar Pengenaan Pajak (DPP)</span>
              <strong class="tax-metric-value money">{{ formatCurrency(dppValue) }}</strong>
              <span class="tax-metric-note">{{ taxForm.includeMode.startsWith('Include') ? 'Dihitung 100/111 dari total' : 'Sesuai total daftar permintaan' }}</span>
            </div>

            <div class="tax-metric-box">
              <span class="tax-metric-label">PPN ({{ ppnRateValue }}%)</span>
              <strong class="tax-metric-value money text-blue">+ {{ formatCurrency(ppnValue) }}</strong>
              <span class="tax-metric-note">Pajak Pertambahan Nilai</span>
            </div>

            <div class="tax-metric-box">
              <span class="tax-metric-label">Potongan PPh ({{ pphRateValue }}%)</span>
              <strong class="tax-metric-value money text-danger">- {{ formatCurrency(pphValue) }}</strong>
              <span class="tax-metric-note">Dipotong & disetor oleh PMO</span>
            </div>

            <div class="tax-metric-box">
              <span class="tax-metric-label">Total Beban Anggaran (Bruto)</span>
              <strong class="tax-metric-value money">{{ formatCurrency(grossTransactionValue) }}</strong>
              <span class="tax-metric-note">Mengurangi Pagu DRA-UK & Saldo UP</span>
            </div>

            <div class="tax-metric-box tax-metric-highlight">
              <span class="tax-metric-label">Nominal Ditransfer ke Rekanan (Netto)</span>
              <strong class="tax-metric-value money">{{ formatCurrency(netPayableToVendor) }}</strong>
              <span class="tax-metric-note">DPP + PPN dikurangi potongan PPh</span>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION 4: UPLOAD DOKUMEN PENDUKUNG SPJ -->
      <section class="form-panel">
        <header class="form-panel-header">
          <div>
            <h3 class="form-panel-title">4. Dokumen Bukti SPJ (Invoice & Kwitansi Standar UT)</h3>
            <p class="form-panel-subtitle">Lampirkan dokumen tagihan rekanan dan kwitansi bukti pembayaran untuk verifikasi pajak.</p>
          </div>
          <span class="step-badge">Langkah Terakhir</span>
        </header>

        <div class="form-panel-body">
          <div class="docs-grid-4">
            <div class="form-field">
              <div class="field-label-row">
                <label for="input-invoice-no">Nomor Invoice / Faktur / Nota <span class="req">*</span></label>
              </div>
              <input
                id="input-invoice-no"
                v-model="docsForm.invoiceNo"
                type="text"
                class="form-control"
                placeholder="Contoh: INV/2026/XI/0118"
              />
            </div>

            <div class="form-field">
              <div class="field-label-row">
                <label for="input-invoice-date">Tanggal Invoice / Nota <span class="req">*</span></label>
              </div>
              <input
                id="input-invoice-date"
                v-model="docsForm.invoiceDate"
                type="date"
                class="form-control"
              />
            </div>

            <div class="form-field">
              <div class="field-label-row">
                <label>File Invoice / Bukti Struk <span class="req">*</span></label>
              </div>
              <div class="file-picker-box">
                <label class="file-picker-btn">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    class="sr-only-input"
                    @change="onInvoiceFileChange"
                  />
                  <span>Pilih File</span>
                </label>
                <span class="file-picker-name" :class="{ empty: !docsForm.invoiceFile }">
                  {{ docsForm.invoiceFile || 'Belum ada file' }}
                </span>
              </div>
            </div>

            <div class="form-field">
              <div class="field-label-row">
                <label>File Kwitansi Standar UT <span class="req">*</span></label>
              </div>
              <div class="file-picker-box">
                <label class="file-picker-btn">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    class="sr-only-input"
                    @change="onReceiptFileChange"
                  />
                  <span>Pilih File</span>
                </label>
                <span class="file-picker-name" :class="{ empty: !docsForm.receiptFile }">
                  {{ docsForm.receiptFile || 'Belum ada file' }}
                </span>
              </div>
            </div>
          </div>

          <div class="form-submit-footer">
            <div class="footer-journal-preview">
              <span class="journal-pill">Simulasi Jurnal Buku Besar</span>
              <span>
                <strong>Debet:</strong> {{ formAjuan.coaCode }} ({{ formatCurrency(grossTransactionValue) }}) ·
                <strong>Kredit:</strong> 1-1100 Kas/Bank UP ({{ formatCurrency(netPayableToVendor) }})
                <template v-if="pphValue > 0">
                  &amp; 2-1200 Utang Pajak PPh ({{ formatCurrency(pphValue) }})
                </template>
              </span>
            </div>

            <div class="footer-actions">
              <button
                type="button"
                class="btn-secondary-outline"
                :disabled="saving"
                @click="submitAjuan(false)"
              >
                Simpan sebagai Draft
              </button>
              <button
                type="button"
                class="btn-primary-navy"
                :disabled="saving"
                @click="submitAjuan(true)"
              >
                {{ saving ? 'Menyimpan ke Database...' : 'Simpan & Ajukan Verifikasi Pajak' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- =================================================================== -->
    <!-- VIEW 2: DAFTAR AJUAN GUP / TUP NIHIL                                -->
    <!-- =================================================================== -->
    <div v-else class="form-panel">
      <header class="form-panel-header">
        <div>
          <h3 class="form-panel-title">
            Daftar Pengajuan {{ activeModuleTab === 'GUP' ? 'Ganti Uang Persediaan (GUP)' : 'Pertanggungjawaban TUP Nihil' }}
          </h3>
          <p class="form-panel-subtitle">
            Seluruh pengajuan tersimpan di PostgreSQL dan terhubung langsung dengan Verifikasi Pajak serta Buku Besar.
          </p>
        </div>

        <div class="list-filter-bar">
          <input
            v-model="searchQuery"
            type="search"
            class="form-control filter-search"
            placeholder="Cari nomor ajuan, rekanan, kegiatan..."
          />
          <select v-model="statusFilter" class="form-control filter-select">
            <option value="ALL">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Menunggu Verifikasi Pajak</option>
            <option value="TAX_VERIFIED">Pajak Terverifikasi</option>
            <option value="APPROVED">Disetujui Finance Manager</option>
            <option value="DISBURSED">Sudah Cair &amp; Terjurnal</option>
          </select>
        </div>
      </header>

      <div class="form-panel-body">
        <div class="table-wrap">
          <table class="items-grid-table">
            <thead>
              <tr>
                <th>No. Pengajuan</th>
                <th>Tanggal</th>
                <th>Unit & DRA-UK</th>
                <th>Uraian Kegiatan & Rekanan</th>
                <th class="text-right">Bruto (Beban UP)</th>
                <th class="text-right">Potongan PPh</th>
                <th class="text-right">Netto Ditransfer</th>
                <th>Status Workflow</th>
                <th class="text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredSubmissions.length === 0">
                <td colspan="9" class="empty-state-cell">
                  Belum ada data pengajuan {{ activeModuleTab }} yang sesuai filter.
                </td>
              </tr>
              <tr v-for="sub in filteredSubmissions" :key="sub.id">
                <td>
                  <strong class="doc-code">{{ sub.submissionNo }}</strong>
                  <div class="cell-sub">{{ sub.proposerName }}</div>
                </td>
                <td>{{ formatDate(sub.transactionDate) }}</td>
                <td>
                  <strong>{{ sub.proposerUnit }}</strong>
                  <div class="cell-sub">{{ sub.coaCode }} · {{ sub.draDescription }}</div>
                </td>
                <td>
                  <strong>{{ sub.activityDetail }}</strong>
                  <div class="cell-sub">{{ sub.vendorName }} (NPWP: {{ sub.vendorTaxId }})</div>
                </td>
                <td class="text-right money">{{ formatCurrency(sub.grossAmount) }}</td>
                <td class="text-right money text-danger">- {{ formatCurrency(sub.pphAmount) }}</td>
                <td class="text-right money font-semibold text-emerald">{{ formatCurrency(sub.netPayableAmount) }}</td>
                <td>
                  <StatusBadge :status="statusToTone(sub.status)" />
                  <div class="cell-sub">{{ sub.statusLabel || sub.status }}</div>
                  <div v-if="sub.journalDocNo" class="cell-journal-badge" title="No. Jurnal Buku Besar">
                    {{ sub.journalDocNo }}
                  </div>
                </td>
                <td class="text-right">
                  <button type="button" class="btn-table-action" @click="openDetail(sub)">
                    Detail & Proses
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL DETAIL & WORKFLOW APPROVAL (PAJAK -> FINANCE -> CAIR JURNAL)  -->
    <!-- =================================================================== -->
    <ModalDialog
      :open="showDetailModal"
      :title="selectedSubmission ? `Detail Pengajuan ${selectedSubmission.submissionNo}` : 'Detail Pengajuan'"
      @close="showDetailModal = false"
    >
      <div v-if="selectedSubmission" class="detail-modal-content">
        <div class="detail-summary-grid">
          <div>
            <span class="detail-label">Pengusul & Unit</span>
            <strong>{{ selectedSubmission.proposerName }}</strong>
            <p>{{ selectedSubmission.proposerUnit }} · {{ selectedSubmission.proposerPhone }}</p>
          </div>
          <div>
            <span class="detail-label">Rekanan Penerima</span>
            <strong>{{ selectedSubmission.vendorName }}</strong>
            <p>NPWP/NIK: {{ selectedSubmission.vendorTaxId }}</p>
          </div>
          <div>
            <span class="detail-label">Pos Anggaran & Akun COA</span>
            <strong>{{ selectedSubmission.coaCode }} - {{ selectedSubmission.coaName }}</strong>
            <p>{{ selectedSubmission.draDescription }}</p>
          </div>
          <div>
            <span class="detail-label">Status Saat Ini</span>
            <div><StatusBadge :status="statusToTone(selectedSubmission.status)" /></div>
            <p>{{ selectedSubmission.statusLabel || selectedSubmission.status }}</p>
          </div>
        </div>

        <div v-if="selectedSubmission.journalDocNo" class="pmo-journal-confirmed-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <div>
            <span class="journal-banner-label">Buku Besar Terposting:</span>
            <strong>{{ selectedSubmission.journalDocNo }}</strong>
            <div style="font-size: 0.76rem; margin-top: 3px; color: #166534">
              {{ selectedSubmission.type === 'TUP_NIHIL'
                ? 'Jurnal Penutupan Panjar UMK Pertor 310: Debit Beban 5xxxx vs Kredit 110501010100 (Uang Muka Kegiatan Pegawai UT)'
                : 'Jurnal Reimbursement GUP Pertor 310: Debit Beban 5xxxx vs Kredit 110101020200 (Bank BRI Kas Operasional)' }}
            </div>
          </div>
        </div>

        <div class="detail-tax-box">
          <div>
            <span>DPP:</span>
            <strong class="money">{{ formatCurrency(selectedSubmission.dppAmount) }}</strong>
          </div>
          <div>
            <span>PPN ({{ selectedSubmission.ppnRate }}%):</span>
            <strong class="money">+ {{ formatCurrency(selectedSubmission.ppnAmount) }}</strong>
          </div>
          <div>
            <span>Potongan PPh ({{ selectedSubmission.pphRate }}%):</span>
            <strong class="money text-danger">- {{ formatCurrency(selectedSubmission.pphAmount) }}</strong>
          </div>
          <div>
            <span>Beban Bruto UP:</span>
            <strong class="money">{{ formatCurrency(selectedSubmission.grossAmount) }}</strong>
          </div>
          <div>
            <span>Transfer Netto ke Rekanan:</span>
            <strong class="money text-emerald">{{ formatCurrency(selectedSubmission.netPayableAmount) }}</strong>
          </div>
        </div>

        <div class="detail-workflow-actions">
          <button
            type="button"
            class="btn-secondary-outline"
            style="display: flex; align-items: center; gap: 6px; padding: 0.5rem 0.85rem;"
            title="Cetak lembar Surat Pertanggungjawaban (SPJ) resmi format universitas"
            @click="triggerPrintSpj(selectedSubmission)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9V2h12v7"></path>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Cetak Berkas SPJ (PDF)
          </button>
          <button
            v-if="selectedSubmission.status === 'DRAFT'"
            type="button"
            class="btn-primary-navy"
            :disabled="saving"
            @click="submitDraftRecord(selectedSubmission)"
          >
            Ajukan Draft ke Verifikasi Pajak
          </button>

          <button
            v-if="selectedSubmission.status === 'SUBMITTED'"
            type="button"
            class="btn-primary-navy"
            :disabled="saving"
            @click="verifyTaxRecord(selectedSubmission)"
          >
            1. Verifikasi Potongan Pajak (Tax Verifier)
          </button>

          <button
            v-if="['VERIFIED_TAX', 'TAX_VERIFIED'].includes(selectedSubmission.status)"
            type="button"
            class="btn-primary-navy"
            :disabled="saving"
            @click="approveFinanceRecord(selectedSubmission)"
          >
            2. Setujui Pengajuan (Finance Manager)
          </button>

          <button
            v-if="['APPROVED_FINANCE', 'APPROVED'].includes(selectedSubmission.status)"
            type="button"
            class="btn-emerald-solid"
            :disabled="saving"
            @click="disburseRecord(selectedSubmission)"
          >
            3. Cairkan Dana &amp; Posting Jurnal Otomatis ke Buku Besar
          </button>

          <button type="button" class="btn-secondary-outline" @click="showDetailModal = false">
            Tutup
          </button>
        </div>
      </div>
    </ModalDialog>

    <!-- =================================================================== -->
    <!-- MODAL CETAK LEMBAR SPJ RESMI STANDAR UNIVERSITAS TERBUKA / PBI     -->
    <!-- =================================================================== -->
    <ModalDialog
      :open="showSpjPrintModal"
      title="Surat Pertanggungjawaban (SPJ) Uang Persediaan"
      @close="showSpjPrintModal = false"
    >
      <div v-if="selectedSubmission" class="spj-print-sheet" style="background: #ffffff; color: #1e293b; padding: 14px; border-radius: 8px;">
        <!-- Kop Surat -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #034693; padding-bottom: 12px; margin-bottom: 14px;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <div style="width: 40px; height: 40px; background: #034693; color: #fff; font-weight: 800; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">UT</div>
            <div>
              <div style="font-weight: 800; color: #034693; font-size: 0.95rem;">UNIVERSITAS TERBUKA</div>
              <div style="font-size: 0.8rem; font-weight: 600; color: #334155;">Pusat Bisnis dan Investasi (PBI UT) · PMO UTama</div>
              <div style="font-size: 0.7rem; color: #64748b;">Pengelolaan Kas Kecil & Belanja Operasional (GUP / TUP)</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; font-weight: 700; color: #034693;">BERKAS SPJ RESMI</div>
            <div style="font-family: monospace; font-weight: 800; font-size: 1.05rem;">{{ selectedSubmission.submissionNo }}</div>
            <span style="font-size: 0.7rem; background: #dcfce7; color: #15803d; font-weight: 700; padding: 2px 6px; border-radius: 10px;">{{ selectedSubmission.statusLabel || selectedSubmission.status }}</span>
          </div>
        </div>

        <!-- Meta Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.78rem; margin-bottom: 14px;">
          <div>
            <div style="color: #64748b; font-size: 0.7rem; text-transform: uppercase;">Pengusul / Penanggung Jawab:</div>
            <strong style="color: #0f172a;">{{ selectedSubmission.proposerName }}</strong>
            <div>Unit: {{ selectedSubmission.proposerUnit }} ({{ selectedSubmission.proposerPhone }})</div>
          </div>
          <div>
            <div style="color: #64748b; font-size: 0.7rem; text-transform: uppercase;">Pos Anggaran & Mata Anggaran:</div>
            <strong>{{ selectedSubmission.coaCode }} - {{ selectedSubmission.coaName }}</strong>
            <div>{{ selectedSubmission.draDescription }}</div>
          </div>
          <div>
            <div style="color: #64748b; font-size: 0.7rem; text-transform: uppercase;">Penerima / Rekanan:</div>
            <strong>{{ selectedSubmission.vendorName }}</strong>
            <div>NPWP: {{ selectedSubmission.vendorTaxId }}</div>
          </div>
          <div>
            <div style="color: #64748b; font-size: 0.7rem; text-transform: uppercase;">Tanggal Transaksi:</div>
            <strong>{{ formatDate(selectedSubmission.transactionDate) }}</strong>
            <div>Keperluan: {{ selectedSubmission.activityDetail }}</div>
          </div>
        </div>

        <!-- Perhitungan Nilai & Pajak -->
        <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; border-left: 4px solid #034693; margin-bottom: 16px; font-size: 0.8rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Dasar Pengenaan Pajak (DPP):</span>
            <strong class="money">{{ formatCurrency(selectedSubmission.dppAmount) }}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Pajak Pertambahan Nilai (PPN {{ selectedSubmission.ppnRate }}%):</span>
            <strong class="money">+ {{ formatCurrency(selectedSubmission.ppnAmount) }}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>Potongan Pajak Penghasilan (PPh {{ selectedSubmission.pphRate }}%):</span>
            <strong class="money" style="color: #dc2626;">- {{ formatCurrency(selectedSubmission.pphAmount) }}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 6px; font-weight: 800; font-size: 0.95rem; color: #034693;">
            <span>{{ selectedSubmission.type === 'TUP_NIHIL' ? 'NILAI NIHILISASI PANJAR UMK:' : 'NILAI NETTO PENGGANTIAN GUP:' }}</span>
            <span>{{ formatCurrency(selectedSubmission.netPayableAmount) }}</span>
          </div>
          <div v-if="selectedSubmission.type === 'TUP_NIHIL'" style="margin-top: 6px; font-size: 0.72rem; color: #166534; background: #dcfce7; padding: 4px 8px; border-radius: 4px;">
            ✓ Sesuai Pertor 310: Menutup Uang Muka Kegiatan Pegawai UT pada Akun Kredit <code>110501010100</code>
          </div>
        </div>

        <!-- Signatures -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 14px; font-size: 0.75rem;">
          <div>
            <div style="color: #64748b; margin-bottom: 35px;">Pembuat Pengajuan / SPJ,</div>
            <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 2px;">{{ selectedSubmission.proposerName }}</div>
            <div style="font-size: 0.7rem; color: #64748b;">{{ selectedSubmission.proposerUnit || 'Staf Operasional PMO' }}</div>
          </div>
          <div>
            <div style="color: #64748b; margin-bottom: 35px;">Verifikasi Pajak & SPJ,</div>
            <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 2px;">{{ selectedSubmission.verifiedTaxBy || 'Verifikator Pajak' }}</div>
            <div style="font-size: 0.7rem; color: #64748b;">Staf Kepatuhan Pajak PMO</div>
          </div>
          <div>
            <div style="color: #64748b; margin-bottom: 35px;">Mengetahui & Menyetujui,</div>
            <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 2px;">{{ selectedSubmission.approvedBy || 'Finance Manager' }}</div>
            <div style="font-size: 0.7rem; color: #64748b;">Finance Manager PMO</div>
          </div>
        </div>

        <!-- Actions -->
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px;" class="no-print">
          <button type="button" class="btn-secondary-outline" @click="showSpjPrintModal = false">Tutup</button>
          <button type="button" class="btn-primary-navy" style="display: flex; align-items: center; gap: 6px;" @click="doPrintWindow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9V2h12v7"></path>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Cetak SPJ (PDF / Print)
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.petty-cash-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Header Pill Switch */
.module-pill-switch {
  display: inline-flex;
  background: #e2e8f0;
  padding: 0.25rem;
  border-radius: 10px;
  gap: 0.25rem;
}

.module-pill-btn {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.module-pill-btn.active {
  background: #034693;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(3, 70, 147, 0.25);
}

/* Top 4 KPI Cards */
.gup-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.15rem 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.45rem;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
}

.kpi-card-hero {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.kpi-card-hero .kpi-eyebrow {
  color: #93c5fd;
}

.kpi-card-hero .kpi-amount {
  color: #ffffff;
}

.kpi-card-hero .kpi-foot {
  color: #cbd5e1;
}

.kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.kpi-eyebrow {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}

.kpi-amount {
  font-size: 1.45rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}

.kpi-foot {
  font-size: 0.76rem;
  color: #64748b;
}

.kpi-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
}

.kpi-badge-amber {
  background: #fef3c7;
  color: #b45309;
}

.kpi-badge-blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.kpi-badge-emerald {
  background: #d1fae5;
  color: #047857;
}

.text-emerald {
  color: #059669 !important;
}

.text-amber {
  color: #d97706 !important;
}

.text-blue {
  color: #034693 !important;
}

.text-danger {
  color: #dc2626 !important;
}

/* Subnav Workspace Bar */
.subnav-workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.55rem 1rem;
}

.subnav-tabs {
  display: flex;
  gap: 0.5rem;
}

.subnav-tab-btn {
  border: 1px solid transparent;
  background: transparent;
  color: #475569;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.48rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}

.subnav-tab-btn.active {
  background: #eff6ff;
  color: #034693;
  border-color: #bfdbfe;
}

.subnav-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: #475569;
  font-weight: 500;
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #059669;
}

/* Alerts */
.alert-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.15rem;
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 600;
}

.alert-danger {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.alert-success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #047857;
}

.alert-close {
  border: none;
  background: transparent;
  font-weight: 700;
  cursor: pointer;
  color: inherit;
}

/* Submission Workspace Panels */
.submission-workspace {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: visible;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
}

.form-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.35rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
}

.form-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.form-panel-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.step-badge {
  font-size: 0.74rem;
  font-weight: 700;
  color: #034693;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  white-space: nowrap;
}

.form-panel-body {
  padding: 1.35rem;
  overflow: visible;
  position: relative;
}

/* Symmetric Two Column Layout for Form Ajuan */
.symmetric-two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.35rem;
  align-items: stretch;
  overflow: visible;
  position: relative;
}

.form-col-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  overflow: visible;
  position: relative;
}

.form-col-card:focus-within {
  z-index: 50;
}

.col-section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.col-section-num {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #034693;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.col-section-header h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.col-section-header p {
  margin: 0.1rem 0 0;
  font-size: 0.76rem;
  color: #64748b;
}

/* Standardized Field Layout (Single-Line Labels, Consistent Heights) */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 20px;
}

.field-label-row label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  white-space: nowrap;
}

.req {
  color: #dc2626;
}

.field-hint {
  font-size: 0.73rem;
  font-weight: 600;
  color: #034693;
  white-space: nowrap;
}

.form-row-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.form-control {
  width: 100%;
  min-height: 38px;
  padding: 0.48rem 0.75rem;
  font-size: 0.85rem;
  color: #0f172a;
  background-color: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-control:focus {
  outline: none;
  border-color: #034693;
  box-shadow: 0 0 0 3px rgba(3, 70, 147, 0.12);
}

textarea.form-control {
  min-height: 64px;
  resize: vertical;
}

/* Custom Clean File Picker */
.sr-only-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.file-picker-box {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 38px;
  padding: 0.25rem 0.5rem 0.25rem 0.3rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}

.file-picker-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.32rem 0.7rem;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  white-space: nowrap;
  margin: 0;
}

.file-picker-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.file-picker-name {
  font-size: 0.8rem;
  color: #0f172a;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-picker-name.empty {
  color: #64748b;
}

.file-clear-btn {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
}

.inline-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: #034693 !important;
  cursor: pointer;
}

.inline-checkbox input {
  width: 14px;
  height: 14px;
  accent-color: #034693;
  margin: 0;
}

/* Items Table */
.table-wrap {
  overflow-x: auto;
}

.items-grid-table {
  width: 100%;
  border-collapse: collapse;
}

.items-grid-table th {
  background: #f8fafc;
  color: #475569;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}

.items-grid-table td {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
  font-size: 0.85rem;
}

.row-num {
  font-weight: 700;
  color: #64748b;
  text-align: center;
}

.row-subtotal {
  font-weight: 700;
  color: #0f172a;
}

.tfoot-label {
  font-weight: 700;
  color: #334155;
  padding-top: 0.9rem !important;
}

.tfoot-total {
  font-size: 1rem !important;
  font-weight: 800;
  color: #034693;
  padding-top: 0.9rem !important;
}

.btn-add-row {
  border: 1px solid #034693;
  background: #eff6ff;
  color: #034693;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-add-row:hover {
  background: #dbeafe;
}

.btn-delete-row {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #dc2626;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
}

.btn-delete-row:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tax Section */
.tax-controls-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1.15rem;
}

.tax-breakdown-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.85rem;
}

.tax-metric-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tax-metric-highlight {
  background: #ecfdf5;
  border-color: #6ee7b7;
}

.tax-metric-label {
  font-size: 0.74rem;
  font-weight: 700;
  color: #475569;
}

.tax-metric-value {
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
}

.tax-metric-highlight .tax-metric-value {
  color: #047857;
}

.tax-metric-note {
  font-size: 0.7rem;
  color: #64748b;
}

/* Docs Section */
.docs-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.form-submit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.1rem;
  border-top: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.footer-journal-preview {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.8rem;
  color: #334155;
}

.journal-pill {
  background: #eff6ff;
  color: #034693;
  border: 1px solid #bfdbfe;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.footer-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-primary-navy {
  border: 1px solid #034693;
  background: #034693;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-primary-navy:hover {
  background: #023670;
}

.btn-emerald-solid {
  border: 1px solid #059669;
  background: #059669;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-secondary-outline {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  cursor: pointer;
}

.btn-secondary-outline:hover {
  background: #f8fafc;
}

/* List View Controls */
.list-filter-bar {
  display: flex;
  gap: 0.65rem;
}

.filter-search {
  min-width: 260px;
}

.filter-select {
  min-width: 210px;
}

.doc-code {
  color: #034693;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
}

.cell-sub {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.15rem;
}

.btn-table-action {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #034693;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.38rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
}

.btn-table-action:hover {
  background: #eff6ff;
  border-color: #93c5fd;
}

.empty-state-cell {
  text-align: center;
  padding: 2.5rem !important;
  color: #64748b;
}

/* Modal Detail */
.detail-modal-content {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.detail-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  background: #f8fafc;
  padding: 1rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.detail-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 0.2rem;
}

.detail-summary-grid p {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: #475569;
}

.detail-tax-box {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 0.85rem;
  border-radius: 10px;
  font-size: 0.8rem;
}

.detail-tax-box > div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.detail-workflow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  padding-top: 0.5rem;
}

.text-right {
  text-align: right !important;
}

.text-center {
  text-align: center !important;
}

.font-semibold {
  font-weight: 700;
}

.cell-journal-badge {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.15rem 0.4rem;
  background: rgba(14, 165, 233, 0.12);
  color: #0284c7;
  font-size: 0.68rem;
  font-family: monospace;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid rgba(14, 165, 233, 0.25);
}

.pmo-journal-confirmed-banner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  color: #166534;
  font-size: 0.82rem;
}

.pmo-journal-confirmed-banner svg {
  flex-shrink: 0;
  color: #15803d;
}

.journal-banner-label {
  margin-right: 0.35rem;
  color: #166534;
}

@media (max-width: 1100px) {
  .gup-kpi-grid,
  .symmetric-two-col,
  .tax-controls-grid,
  .tax-breakdown-cards,
  .docs-grid-4 {
    grid-template-columns: 1fr;
  }
}
</style>
