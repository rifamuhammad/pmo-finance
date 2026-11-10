<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import CurrencyInput from '../components/CurrencyInput.vue';
import { usePagination } from '../composables/usePagination';

const auth = useAuthStore();

const activeTab = ref<'pr' | 'po' | 'expenses' | 'vendors'>('pr');
const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

const vendors = ref<any[]>([]);
const prs = ref<any[]>([]);

const {
  currentPage: prPage,
  pageSize: prPageSize,
  totalItems: totalPrs,
  paginatedItems: paginatedPrs,
} = usePagination(prs, 5);

const pos = ref<any[]>([]);
const {
  currentPage: poPage,
  pageSize: poPageSize,
  totalItems: totalPos,
  paginatedItems: paginatedPos,
} = usePagination(pos, 5);

const vendorInvoices = ref<any[]>([]);
const expenses = ref<any[]>([]);
const {
  currentPage: expPage,
  pageSize: expPageSize,
  totalItems: totalExpenses,
  paginatedItems: paginatedExpenses,
} = usePagination(expenses, 5);

const {
  currentPage: vendorPage,
  pageSize: vendorPageSize,
  totalItems: totalVendors,
  paginatedItems: paginatedVendors,
} = usePagination(vendors, 5);
const approvedBudgets = ref<any[]>([]);
const master = ref<any>({ businessUnits: [], costCenters: [], fundSources: [] });

// Selected PR for quotation comparison & PO conversion
const selectedPr = ref<any>(null);

// Modals
const prModalOpen = ref(false);
const quoteModalOpen = ref(false);
const poModalOpen = ref(false);
const receiptModalOpen = ref(false);
const vInvModalOpen = ref(false);
const expenseModalOpen = ref(false);
const vendorModalOpen = ref(false);
const voidModalOpen = ref(false);

// Modal error & submission states (so errors appear inside modals instead of being hidden behind backdrops)
const prModalError = ref('');
const prSubmitting = ref(false);
const quoteModalError = ref('');
const quoteSubmitting = ref(false);
const poModalError = ref('');
const poSubmitting = ref(false);
const receiptModalError = ref('');
const receiptSubmitting = ref(false);
const expenseModalError = ref('');
const expenseSubmitting = ref(false);
const vendorModalError = ref('');
const vendorSubmitting = ref(false);
const voidModalError = ref('');
const voidSubmitting = ref(false);

const prForm = ref({
  title: '',
  businessUnitId: '',
  costCenterId: '',
  budgetLineId: '',
  purpose: '',
  minQuotationsRequired: 3,
  itemName: '',
  specification: '',
  quantity: 1,
  unit: 'Unit',
  estimatedUnitPrice: 0,
});

const quoteForm = ref({
  vendorId: '',
  quotationNumber: '',
  quotedSubtotal: 0,
  taxRatePercent: 11,
  deliveryDays: 5,
  warrantyInfo: '',
});

const poForm = ref({
  selectedQuotationId: '',
  paymentTerms: 'NET 30',
  selectionJustification: '',
  quotationExceptionReason: '',
});

const selectedPoForReceipt = ref<any>(null);
const receiptForm = ref({
  deliveryNoteRef: '',
  conditionNote: 'Diterima lengkap dan sesuai spesifikasi PO',
  quantityReceived: 1,
});

const vInvForm = ref({
  vendorId: '',
  vendorInvoiceNumber: '',
  purchaseOrderId: '',
  businessUnitId: '',
  invoiceDate: '2026-10-29',
  dueDate: '2026-11-12',
  subtotal: 20000000,
  taxAmount: 2200000,
  allowExceptionReview: false,
  matchingNote: '',
});

const expenseForm = ref({
  title: '',
  businessUnitId: '',
  costCenterId: '',
  budgetLineId: '',
  fundSourceId: '',
  vendorId: '',
  vendorInvoiceId: '',
  category: 'OPEX',
  paymentMethod: 'BANK_TRANSFER',
  recipientName: '',
  subtotal: 5000000,
  taxAmount: 0,
  description: '',
  receiptRef: '',
});

const vendorForm = ref({
  name: '',
  legalName: '',
  taxIdNpwp: '',
  category: 'Jasa & Peralatan Operasional',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  bankName: 'Bank Mandiri',
  bankAccountNo: '',
  bankAccountHolder: '',
});

const selectedExpenseForVoid = ref<any>(null);
const voidReason = ref('');

const prBlineSearch = ref('');
const prBlineUnitFilter = ref('');
const prPickerOpen = ref(false);

const availableBudgetLines = computed(() =>
  approvedBudgets.value.flatMap((b) =>
    (b.lines || []).map((l: any) => ({
      ...l,
      budgetDocNumber: b.docNumber,
      budgetTitle: b.title,
      businessUnitId: b.businessUnitId,
      businessUnitCode: b.businessUnit?.code || '',
      businessUnitName: b.businessUnit?.name || '',
      fundSourceId: b.fundSourceId,
    }))
  )
);

const filteredBudgetLinesForPr = computed(() => {
  let list = availableBudgetLines.value;
  if (prBlineUnitFilter.value) {
    list = list.filter((l) => l.businessUnitId === prBlineUnitFilter.value);
  }
  if (prBlineSearch.value.trim()) {
    const q = prBlineSearch.value.trim().toLowerCase();
    list = list.filter((l) =>
      (l.description || '').toLowerCase().includes(q) ||
      (l.accountCode || '').toLowerCase().includes(q) ||
      (l.budgetDocNumber || '').toLowerCase().includes(q) ||
      (l.costCenter?.code || '').toLowerCase().includes(q) ||
      (l.costCenter?.name || '').toLowerCase().includes(q)
    );
  }
  return list;
});

function selectBudgetLineForPr(line: any) {
  prForm.value.budgetLineId = line.id;
  prForm.value.businessUnitId = line.businessUnitId;
  if (line.costCenterId) {
    prForm.value.costCenterId = line.costCenterId;
  }
  prPickerOpen.value = false;
  prModalError.value = '';
}

const selectedBudgetLine = computed(() =>
  availableBudgetLines.value.find((l) => l.id === prForm.value.budgetLineId)
);

const prTotalEstimated = computed(() => {
  const qty = Number(prForm.value.quantity) || 0;
  const price = Number(prForm.value.estimatedUnitPrice) || 0;
  return qty * price;
});

const isPrOverBudget = computed(() => {
  if (!selectedBudgetLine.value) return false;
  return prTotalEstimated.value > (Number(selectedBudgetLine.value.availableAmount) || 0);
});

const expBlineSearch = ref('');
const expBlineUnitFilter = ref('');
const expPickerOpen = ref(false);

const filteredBudgetLinesForExpense = computed(() => {
  let list = availableBudgetLines.value;
  if (expBlineUnitFilter.value) {
    list = list.filter((l) => l.businessUnitId === expBlineUnitFilter.value);
  }
  if (expBlineSearch.value.trim()) {
    const q = expBlineSearch.value.trim().toLowerCase();
    list = list.filter((l) =>
      (l.description || '').toLowerCase().includes(q) ||
      (l.accountCode || '').toLowerCase().includes(q) ||
      (l.budgetDocNumber || '').toLowerCase().includes(q) ||
      (l.costCenter?.code || '').toLowerCase().includes(q) ||
      (l.costCenter?.name || '').toLowerCase().includes(q)
    );
  }
  return list;
});

const selectedExpenseBudgetLine = computed(() =>
  availableBudgetLines.value.find((l) => l.id === expenseForm.value.budgetLineId)
);

function selectBudgetLineForExpense(line: any) {
  expenseForm.value.budgetLineId = line.id;
  expenseForm.value.businessUnitId = line.businessUnitId;
  if (line.costCenterId) {
    expenseForm.value.costCenterId = line.costCenterId;
  }
  if (line.fundSourceId) {
    expenseForm.value.fundSourceId = line.fundSourceId;
  }
  expPickerOpen.value = false;
  expenseModalError.value = '';
}

async function loadAllProcurementData() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [mRes, bRes, vRes, prRes, poRes, viRes, exRes] = await Promise.all([
      apiFetch('/master/overview'),
      apiFetch('/budgets'),
      apiFetch('/procurement/vendors'),
      apiFetch('/procurement/purchase-requests'),
      apiFetch('/procurement/purchase-orders'),
      apiFetch('/procurement/vendor-invoices'),
      apiFetch('/procurement/expenses'),
    ]);

    master.value = mRes.data;
    approvedBudgets.value = (bRes.data || []).filter((b: any) => ['APPROVED', 'REVISED'].includes(b.status));
    vendors.value = vRes.data || [];
    prs.value = prRes.data || [];
    pos.value = poRes.data || [];
    vendorInvoices.value = viRes.data || [];
    expenses.value = exRes.data || [];

    if (prs.value.length > 0) {
      selectedPr.value = prs.value.find((p) => p.id === selectedPr.value?.id) || prs.value[0];
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data pengadaan & pengeluaran.';
  } finally {
    loading.value = false;
  }
}

function openCreatePr() {
  prModalError.value = '';
  prSubmitting.value = false;
  prBlineSearch.value = '';

  const defaultUnit = (auth.user?.roleCode === 'UNIT_MANAGER' && auth.user?.businessUnitId)
    ? auth.user.businessUnitId
    : (auth.selectedBusinessUnitId || '');
  prBlineUnitFilter.value = defaultUnit;

  const validLines = defaultUnit
    ? availableBudgetLines.value.filter((l) => l.businessUnitId === defaultUnit)
    : availableBudgetLines.value;
  const firstLine = validLines[0] || availableBudgetLines.value[0];

  prForm.value = {
    title: '',
    businessUnitId: firstLine?.businessUnitId || master.value.businessUnits[0]?.id || '',
    costCenterId: firstLine?.costCenterId || master.value.costCenters[0]?.id || '',
    budgetLineId: firstLine?.id || '',
    purpose: '',
    minQuotationsRequired: 3,
    itemName: '',
    specification: '',
    quantity: 1,
    unit: 'Unit',
    estimatedUnitPrice: 0,
  };
  prPickerOpen.value = !firstLine;
  prModalOpen.value = true;
}

async function submitPr() {
  prModalError.value = '';
  errorMsg.value = '';
  feedbackMsg.value = '';

  if (!prForm.value.title || prForm.value.title.trim().length < 4) {
    prModalError.value = 'Judul kebutuhan pengadaan wajib diisi minimal 4 karakter.';
    return;
  }
  if (!prForm.value.budgetLineId) {
    prModalError.value = 'Silakan pilih pos mata anggaran sumber yang telah disetujui (APPROVED).';
    return;
  }
  if (!prForm.value.purpose || prForm.value.purpose.trim().length < 5) {
    prModalError.value = 'Tujuan dan alasan pengadaan wajib diisi minimal 5 karakter.';
    return;
  }
  if (!prForm.value.itemName || prForm.value.itemName.trim().length < 2) {
    prModalError.value = 'Nama barang / jasa wajib diisi minimal 2 karakter.';
    return;
  }
  if (!prForm.value.quantity || Number(prForm.value.quantity) <= 0) {
    prModalError.value = 'Kuantitas pengadaan harus lebih dari 0.';
    return;
  }
  if (!prForm.value.estimatedUnitPrice || Number(prForm.value.estimatedUnitPrice) <= 0) {
    prModalError.value = 'Estimasi harga satuan wajib diisi lebih dari Rp 0.';
    return;
  }
  if (isPrOverBudget.value) {
    const deficit = prTotalEstimated.value - Number(selectedBudgetLine.value?.availableAmount || 0);
    prModalError.value = `Total pengadaan (${formatRupiah(prTotalEstimated.value)}) melebihi sisa pagu anggaran (${formatRupiah(selectedBudgetLine.value?.availableAmount || 0)}) sebesar ${formatRupiah(deficit)}. Harap kurangi kuantitas/harga atau ajukan revisi anggaran.`;
    return;
  }

  prSubmitting.value = true;
  try {
    const selectedLine = availableBudgetLines.value.find((l) => l.id === prForm.value.budgetLineId);
    const res = await apiFetch('/procurement/purchase-requests', {
      method: 'POST',
      body: JSON.stringify({
        title: prForm.value.title.trim(),
        businessUnitId: selectedLine?.businessUnitId || prForm.value.businessUnitId,
        costCenterId: selectedLine?.costCenterId || prForm.value.costCenterId,
        budgetLineId: prForm.value.budgetLineId,
        purpose: prForm.value.purpose.trim(),
        minQuotationsRequired: Number(prForm.value.minQuotationsRequired) || 3,
        submitImmediately: true,
        lines: [
          {
            itemName: prForm.value.itemName.trim(),
            specification: prForm.value.specification?.trim() || undefined,
            quantity: Number(prForm.value.quantity),
            unit: (prForm.value.unit || 'Unit').trim(),
            estimatedUnitPrice: Number(prForm.value.estimatedUnitPrice),
          },
        ],
      }),
    });
    prModalOpen.value = false;
    feedbackMsg.value = `Purchase Request ${res.data.docNumber} berhasil diajukan dan menunggu persetujuan / proses komparasi vendor.`;
    await loadAllProcurementData();
    selectedPr.value = prs.value.find((p) => p.id === res.data.id) || prs.value[0];
  } catch (err: any) {
    prModalError.value = err.message || 'Gagal mengajukan Purchase Request.';
  } finally {
    prSubmitting.value = false;
  }
}

async function approvePr(pr: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/procurement/purchase-requests/${pr.id}/approve`, { method: 'POST' });
    feedbackMsg.value = `PR ${res.data.docNumber} disetujui dan komitmen anggaran telah dicadangkan.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyetujui PR.';
  }
}

function openAddQuotation(pr: any) {
  selectedPr.value = pr;
  quoteModalError.value = '';
  quoteSubmitting.value = false;
  quoteForm.value = {
    vendorId: vendors.value[0]?.id || '',
    quotationNumber: `QT-${Date.now().toString().slice(-5)}`,
    quotedSubtotal: Math.round(pr.estimatedTotal / 1.11),
    taxRatePercent: 11,
    deliveryDays: 5,
    warrantyInfo: 'Garansi Resmi 2 Tahun',
  };
  quoteModalOpen.value = true;
}

async function submitQuotation() {
  if (!selectedPr.value) return;
  quoteModalError.value = '';
  quoteSubmitting.value = true;
  try {
    await apiFetch(`/procurement/purchase-requests/${selectedPr.value.id}/quotations`, {
      method: 'POST',
      body: JSON.stringify(quoteForm.value),
    });
    quoteModalOpen.value = false;
    feedbackMsg.value = `Penawaran vendor berhasil ditambahkan ke ${selectedPr.value.docNumber}.`;
    await loadAllProcurementData();
  } catch (err: any) {
    quoteModalError.value = err.message || 'Gagal menambahkan penawaran vendor.';
  } finally {
    quoteSubmitting.value = false;
  }
}

function openCreatePo(pr: any) {
  selectedPr.value = pr;
  poModalError.value = '';
  poSubmitting.value = false;
  poForm.value = {
    selectedQuotationId: pr.quotations?.[0]?.id || '',
    paymentTerms: 'NET 30',
    selectionJustification: 'Harga paling kompetitif, spesifikasi sesuai kebutuhan, dan garansi terjamin.',
    quotationExceptionReason: '',
  };
  poModalOpen.value = true;
}

async function submitCreatePo() {
  if (!selectedPr.value) return;
  poModalError.value = '';
  poSubmitting.value = true;
  try {
    const res = await apiFetch('/procurement/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        purchaseRequestId: selectedPr.value.id,
        selectedQuotationId: poForm.value.selectedQuotationId,
        paymentTerms: poForm.value.paymentTerms,
        selectionJustification: poForm.value.selectionJustification,
        quotationExceptionReason: poForm.value.quotationExceptionReason || undefined,
      }),
    });
    poModalOpen.value = false;
    feedbackMsg.value = `Purchase Order ${res.data.docNumber} berhasil diterbitkan.`;
    await loadAllProcurementData();
    activeTab.value = 'po';
  } catch (err: any) {
    poModalError.value = err.message || 'Gagal menerbitkan PO.';
  } finally {
    poSubmitting.value = false;
  }
}

function openGoodsReceipt(po: any) {
  selectedPoForReceipt.value = po;
  receiptModalError.value = '';
  receiptSubmitting.value = false;
  const firstLine = po.lines?.[0];
  const remaining = firstLine ? Math.max(1, firstLine.quantity - firstLine.receivedQuantity) : 1;
  receiptForm.value = {
    deliveryNoteRef: `SJ-${Date.now().toString().slice(-5)}`,
    conditionNote: 'Barang diterima dalam kondisi baik dan sesuai pesanan.',
    quantityReceived: remaining,
  };
  receiptModalOpen.value = true;
}

async function submitGoodsReceipt() {
  if (!selectedPoForReceipt.value) return;
  receiptModalError.value = '';
  receiptSubmitting.value = true;
  try {
    const firstLine = selectedPoForReceipt.value.lines[0];
    const res = await apiFetch(`/procurement/purchase-orders/${selectedPoForReceipt.value.id}/goods-receipts`, {
      method: 'POST',
      body: JSON.stringify({
        deliveryNoteRef: receiptForm.value.deliveryNoteRef,
        conditionNote: receiptForm.value.conditionNote,
        items: [
          {
            purchaseOrderLineId: firstLine.id,
            quantityReceived: Number(receiptForm.value.quantityReceived),
            condition: 'GOOD',
          },
        ],
      }),
    });
    receiptModalOpen.value = false;
    const jrnMsg = res.data.journal ? ` & Jurnal akrual ${res.data.journal.journalNumber} diposting (Utang 210101010100)` : '';
    feedbackMsg.value = `Bukti penerimaan barang (BAST) ${res.data.goodsReceipt.docNumber} tercatat (Status PO: ${res.data.poStatus})${jrnMsg}.`;
    await loadAllProcurementData();
  } catch (err: any) {
    receiptModalError.value = err.message || 'Gagal mencatat penerimaan barang.';
  } finally {
    receiptSubmitting.value = false;
  }
}

function openCreateExpense() {
  const defaultUnit = (auth.user?.roleCode === 'UNIT_MANAGER' && auth.user?.businessUnitId)
    ? auth.user.businessUnitId
    : (auth.selectedBusinessUnitId || '');
  expBlineUnitFilter.value = defaultUnit;
  expBlineSearch.value = '';

  const validLines = defaultUnit
    ? availableBudgetLines.value.filter((l) => l.businessUnitId === defaultUnit)
    : availableBudgetLines.value;
  const firstLine = validLines[0] || availableBudgetLines.value[0];

  expenseModalError.value = '';
  expenseSubmitting.value = false;
  expenseForm.value = {
    title: '',
    businessUnitId: firstLine?.businessUnitId || master.value.businessUnits[0]?.id || '',
    costCenterId: firstLine?.costCenterId || master.value.costCenters[0]?.id || '',
    budgetLineId: firstLine?.id || '',
    fundSourceId: firstLine?.fundSourceId || master.value.fundSources[0]?.id || '',
    vendorId: vendors.value[0]?.id || '',
    vendorInvoiceId: '',
    category: firstLine?.category || 'OPEX',
    paymentMethod: 'BANK_TRANSFER',
    recipientName: '',
    subtotal: 0,
    taxAmount: 0,
    description: '',
    receiptRef: `TRX-${Date.now().toString().slice(-6)}`,
  };
  expPickerOpen.value = !firstLine;
  expenseModalOpen.value = true;
}

async function submitExpense() {
  expenseModalError.value = '';
  expenseSubmitting.value = true;
  try {
    const selectedLine = availableBudgetLines.value.find((l) => l.id === expenseForm.value.budgetLineId);
    const res = await apiFetch('/procurement/expenses', {
      method: 'POST',
      body: JSON.stringify({
        ...expenseForm.value,
        businessUnitId: selectedLine?.businessUnitId || expenseForm.value.businessUnitId,
        costCenterId: selectedLine?.costCenterId || expenseForm.value.costCenterId,
        fundSourceId: selectedLine?.fundSourceId || expenseForm.value.fundSourceId,
        subtotal: Number(expenseForm.value.subtotal),
        taxAmount: Number(expenseForm.value.taxAmount),
        submitImmediately: true,
      }),
    });
    expenseModalOpen.value = false;
    feedbackMsg.value = `Pengeluaran ${res.data.docNumber} berhasil diajukan.`;
    await loadAllProcurementData();
  } catch (err: any) {
    expenseModalError.value = err.message || 'Gagal mencatat pengeluaran.';
  } finally {
    expenseSubmitting.value = false;
  }
}

async function approveExpense(exp: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/procurement/expenses/${exp.id}/approve`, { method: 'POST' });
    feedbackMsg.value = `Pengeluaran ${exp.docNumber} telah disetujui dan siap dicairkan.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyetujui pengeluaran.';
  }
}

async function payAndPostExpense(exp: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/procurement/expenses/${exp.id}/pay`, { method: 'POST' });
    const isVendorPay = Boolean(exp.vendorInvoiceId);
    const detailMsg = isVendorPay
      ? `Pelunasan utang rekanan ${exp.docNumber} berhasil dibayarkan via ${exp.paymentMethod}, dan jurnal penutupan utang ${res.data.journal.journalNumber} diposting otomatis.`
      : `Pengeluaran ${exp.docNumber} dicairkan via ${exp.paymentMethod}, realisasi anggaran diperbarui, dan jurnal ${res.data.journal.journalNumber} diposting otomatis.`;
    feedbackMsg.value = detailMsg;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencairkan pengeluaran.';
  }
}

function openVoidModal(exp: any) {
  selectedExpenseForVoid.value = exp;
  voidReason.value = '';
  voidModalError.value = '';
  voidSubmitting.value = false;
  voidModalOpen.value = true;
}

async function confirmVoidExpense() {
  if (!selectedExpenseForVoid.value) return;
  voidModalError.value = '';
  voidSubmitting.value = true;
  try {
    const res = await apiFetch(`/procurement/expenses/${selectedExpenseForVoid.value.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason: voidReason.value }),
    });
    voidModalOpen.value = false;
    feedbackMsg.value = `Transaksi ${res.data.docNumber} telah di-VOID beserta jurnal pembalik otomatis.`;
    await loadAllProcurementData();
  } catch (err: any) {
    voidModalError.value = err.message || 'Gagal melakukan void pengeluaran.';
  } finally {
    voidSubmitting.value = false;
  }
}

function openCreateVendor() {
  vendorModalError.value = '';
  vendorSubmitting.value = false;
  vendorForm.value = {
    name: '',
    legalName: '',
    taxIdNpwp: '',
    category: 'Jasa & Peralatan Operasional',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    bankName: 'Bank Mandiri',
    bankAccountNo: '',
    bankAccountHolder: '',
  };
  vendorModalOpen.value = true;
}

async function submitVendor() {
  vendorModalError.value = '';
  vendorSubmitting.value = true;
  try {
    const res = await apiFetch('/procurement/vendors', {
      method: 'POST',
      body: JSON.stringify(vendorForm.value),
    });
    vendorModalOpen.value = false;
    feedbackMsg.value = `Vendor ${res.data.code} (${res.data.name}) berhasil didaftarkan.`;
    await loadAllProcurementData();
  } catch (err: any) {
    vendorModalError.value = err.message || 'Gagal menyimpan vendor.';
  } finally {
    vendorSubmitting.value = false;
  }
}

const route = useRoute();

function applyTabFromRoute() {
  const t = route.query.tab;
  if (t === 'expenses' || t === 'po' || t === 'vendors' || t === 'pr') {
    activeTab.value = t;
  }
}

watch(() => route.query.tab, () => {
  applyTabFromRoute();
});

onMounted(() => {
  applyTabFromRoute();
  loadAllProcurementData();
});
</script>

<template>
  <div class="procurement-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Pengadaan & Beban Operasional</h1>
        <p class="page-desc">
          Pengajuan Purchase Request, komparasi penawaran vendor, dan penerbitan PO.
        </p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" @click="loadAllProcurementData">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Muat Ulang
        </button>
        <button
          v-if="auth.hasPermission('procurement:create')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openCreatePr"
        >
          + Ajukan Purchase Request (PR)
        </button>
        <button
          v-if="auth.hasPermission('expense:create')"
          type="button"
          class="btn btn-sm"
          @click="openCreateExpense"
        >
          + Catat Pengeluaran Biaya
        </button>
      </div>
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
      title="Validasi & Kontrol Pengadaan"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <div class="tab-bar" role="tablist">
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'pr' }" @click="activeTab = 'pr'">
        Purchase Request & Kuotasi ({{ prs.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'po' }" @click="activeTab = 'po'">
        Purchase Order & Penerimaan ({{ pos.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'expenses' }" @click="activeTab = 'expenses'">
        Pengeluaran Kas & Beban ({{ expenses.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'vendors' }" @click="activeTab = 'vendors'">
        Daftar Vendor ({{ vendors.length }})
      </button>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Siklus Pengadaan & Pengeluaran"
      message="Mengambil data PR, perbandingan kuotasi vendor, PO, penerimaan barang, dan realisasi biaya..."
    />

    <!-- TAB 1: PR & QUOTATION COMPARISON -->
    <div v-else-if="activeTab === 'pr'" class="split-workspace">
      <section class="panel" aria-label="Daftar Purchase Request">
        <div class="panel-header">
          <h2>Daftar Purchase Request (PR)</h2>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. PR</th>
                <th>Kebutuhan & Mata Anggaran</th>
                <th class="money-col">Estimasi Nilai</th>
                <th>Kuotasi</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pr in paginatedPrs"
                :key="pr.id"
                :style="selectedPr?.id === pr.id ? 'background: rgba(3, 70, 147, 0.05); font-weight: 500;' : ''"
              >
                <td>
                  <span class="doc-code">{{ pr.docNumber }}</span>
                  <div class="text-muted" style="font-size: 0.76rem">{{ formatDate(pr.createdAt) }}</div>
                </td>
                <td>
                  <strong>{{ pr.title }}</strong>
                  <div class="text-muted" style="font-size: 0.8rem">
                    Pos: {{ pr.budgetLine?.description }} ({{ pr.businessUnit?.code }})
                  </div>
                </td>
                <td class="money-col">{{ formatRupiah(pr.estimatedTotal) }}</td>
                <td>
                  <span class="doc-code">{{ pr.quotations?.length || 0 }} / {{ pr.minQuotationsRequired }}</span>
                </td>
                <td><StatusBadge :status="pr.status" /></td>
                <td>
                  <button type="button" class="btn btn-sm" @click="selectedPr = pr">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>

          <PaginationControl
            v-model:currentPage="prPage"
            v-model:pageSize="prPageSize"
            :totalItems="totalPrs"
            :pageSizeOptions="[5, 10, 25]"
            itemLabel="purchase request"
          />
        </div>
      </section>

      <section v-if="selectedPr" class="panel" aria-label="Evaluasi Kuotasi & Konversi PO">
        <div class="panel-header">
          <div>
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px">
              <span class="doc-code">{{ selectedPr.docNumber }}</span>
              <StatusBadge :status="selectedPr.status" />
            </div>
            <h2>{{ selectedPr.title }}</h2>
            <p class="text-muted">Pemohon: {{ selectedPr.requestedByName }} | Tujuan: {{ selectedPr.purpose }}</p>
          </div>

          <div class="btn-row">
            <button
              v-if="selectedPr.status === 'SUBMITTED' && auth.hasPermission('procurement:approve')"
              type="button"
              class="btn btn-sm btn-success"
              @click="approvePr(selectedPr)"
            >
              Setujui PR & Cadangkan Plafon
            </button>

            <button
              v-if="auth.hasPermission('procurement:create')"
              type="button"
              class="btn btn-sm"
              @click="openAddQuotation(selectedPr)"
            >
              + Tambah Penawaran Vendor
            </button>

            <button
              v-if="selectedPr.status === 'APPROVED' && selectedPr.quotations?.length > 0 && auth.hasPermission('procurement:create')"
              type="button"
              class="btn btn-sm btn-primary"
              @click="openCreatePo(selectedPr)"
            >
              Terbitkan PO
            </button>
          </div>
        </div>

        <h3 style="margin-bottom: 8px">
          Perbandingan Penawaran Vendor ({{ selectedPr.quotations?.length || 0 }} dari Minimal {{ selectedPr.minQuotationsRequired }})
        </h3>

        <StateBanner
          v-if="!selectedPr.quotations || selectedPr.quotations.length === 0"
          state="empty"
          title="Belum Ada Penawaran Vendor"
          message="Tambahkan minimal 3 penawaran vendor untuk dibandingkan sebelum menerbitkan Purchase Order."
          actionLabel="+ Tambah Penawaran Vendor"
          @action="openAddQuotation(selectedPr)"
        />

        <div v-else class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Vendor & No. Kuotasi</th>
                <th class="money-col">Subtotal</th>
                <th class="money-col">PPN</th>
                <th class="money-col">Total Penawaran</th>
                <th>Lead Time & Garansi</th>
                <th>Status Pilihan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in selectedPr.quotations" :key="q.id">
                <td>
                  <strong>{{ q.vendor?.name }}</strong>
                  <div><span class="doc-code">{{ q.quotationNumber }}</span></div>
                </td>
                <td class="money-col">{{ formatRupiah(q.quotedSubtotal) }}</td>
                <td class="money-col">{{ formatRupiah(q.taxAmount) }}</td>
                <td class="money-col"><strong>{{ formatRupiah(q.totalAmount) }}</strong></td>
                <td>{{ q.deliveryDays }} Hari | {{ q.warrantyInfo || '-' }}</td>
                <td>
                  <StatusBadge :status="q.isSelected ? 'APPROVED' : 'PENDING'" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 2: PURCHASE ORDERS & GOODS RECEIPT -->
    <div v-else-if="activeTab === 'po'" class="panel">
      <div class="panel-header">
        <div>
          <h2>Daftar Purchase Order (PO) & Penerimaan Barang/Jasa</h2>
          <p class="text-muted">Mendukung penerimaan parsial maupun penuh dan pemeriksaan kuantitas terhadap tagihan vendor.</p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>No. PO & Ref PR</th>
              <th>Vendor Terpilih</th>
              <th>Item & Progress Penerimaan</th>
              <th class="money-col">Total PO (IDR)</th>
              <th>Status</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="po in paginatedPos" :key="po.id">
              <td>
                <span class="doc-code">{{ po.docNumber }}</span>
                <div class="text-muted" style="font-size: 0.78rem">Ref: {{ po.purchaseRequest?.docNumber }}</div>
              </td>
              <td>
                <strong>{{ po.vendor?.name }}</strong>
                <div class="text-muted" style="font-size: 0.78rem">Termin: {{ po.paymentTerms }}</div>
              </td>
              <td>
                <div v-for="line in po.lines" :key="line.id">
                  {{ line.itemName }}:
                  <strong>Diterima {{ line.receivedQuantity }} / {{ line.quantity }} {{ line.unit }}</strong>
                </div>
                <div v-if="po.goodsReceipts?.length > 0" class="text-muted" style="font-size: 0.76rem; margin-top: 4px">
                  <span class="badge" style="background: rgba(30, 41, 59, 0.08); font-weight: 500">
                    BAST: {{ po.goodsReceipts.map((g: any) => g.docNumber).join(', ') }}
                  </span>
                </div>
              </td>
              <td class="money-col"><strong>{{ formatRupiah(po.totalAmount) }}</strong></td>
              <td><StatusBadge :status="po.status" /></td>
              <td>
                <button
                  v-if="po.status !== 'RECEIVED' && auth.hasPermission('procurement:create')"
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="openGoodsReceipt(po)"
                >
                  Catat Penerimaan (GR)
                </button>
                <span v-else class="text-muted">Lengkap</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationControl
        v-model:currentPage="poPage"
        v-model:pageSize="poPageSize"
        :totalItems="totalPos"
        :pageSizeOptions="[5, 10, 25]"
        itemLabel="pesanan pembelian (PO)"
      />
    </div>

    <!-- TAB 3: EXPENSES & BUDGET REALIZATION -->
    <div v-else-if="activeTab === 'expenses'" class="panel">
      <div class="panel-header">
        <div>
          <h2>Daftar Pengeluaran Biaya (Kas Keluar) & Posting Jurnal</h2>
          <p class="text-muted">
            Transaksi yang telah dicairkan/diposting tidak dapat dihapus; koreksi wajib menggunakan mekanisme Reversal/Void ber-otorisasi.
          </p>
        </div>
        <button
          v-if="auth.hasPermission('expense:create')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openCreateExpense"
        >
          + Catat Pengeluaran Baru
        </button>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>No. Dokumen</th>
              <th>Uraian & Pos Anggaran</th>
              <th>Penerima & Metode</th>
              <th class="money-col">Total Pengeluaran</th>
              <th>Status</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="exp in paginatedExpenses" :key="exp.id">
              <td>
                <span class="doc-code">{{ exp.docNumber }}</span>
                <div class="text-muted" style="font-size: 0.76rem">{{ formatDate(exp.transactionDate) }}</div>
              </td>
              <td>
                <strong>{{ exp.title }}</strong>
                <div class="text-muted" style="font-size: 0.8rem">
                  Pos: {{ exp.budgetLine?.description }} | Kategori: {{ exp.category }}
                </div>
                <div v-if="exp.vendorInvoice" style="margin-top: 2px">
                  <span class="badge" style="background: rgba(14, 116, 144, 0.12); color: #0e7490; font-size: 0.72rem">
                    Tagihan: {{ exp.vendorInvoice.vendorInvoiceNumber }}
                  </span>
                </div>
              </td>
              <td>
                {{ exp.recipientName }}
                <div class="text-muted" style="font-size: 0.78rem">{{ exp.paymentMethod }} (Ref: {{ exp.receiptRef || '-' }})</div>
              </td>
              <td class="money-col"><strong>{{ formatRupiah(exp.totalAmount) }}</strong></td>
              <td><StatusBadge :status="exp.status" /></td>
              <td>
                <div class="btn-row">
                  <button
                    v-if="exp.status === 'SUBMITTED' && auth.hasPermission('expense:approve')"
                    type="button"
                    class="btn btn-sm btn-success"
                    @click="approveExpense(exp)"
                  >
                    Setujui
                  </button>
                  <button
                    v-if="exp.status === 'APPROVED' && auth.hasPermission('expense:pay')"
                    type="button"
                    class="btn btn-sm btn-primary"
                    @click="payAndPostExpense(exp)"
                  >
                    Cairkan & Posting Jurnal
                  </button>
                  <button
                    v-if="['APPROVED', 'PAID', 'POSTED'].includes(exp.status) && auth.hasPermission('expense:approve')"
                    type="button"
                    class="btn btn-sm btn-danger"
                    @click="openVoidModal(exp)"
                  >
                    Void / Reversal
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationControl
        v-model:currentPage="expPage"
        v-model:pageSize="expPageSize"
        :totalItems="totalExpenses"
        :pageSizeOptions="[5, 10, 25]"
        itemLabel="dokumen pengeluaran kas"
      />
    </div>

    <!-- TAB 4: VENDORS -->
    <div v-else-if="activeTab === 'vendors'" class="panel">
      <div class="panel-header">
        <div>
          <h2>Master Rekanan / Vendor Terdaftar</h2>
          <p class="text-muted">Dilengkapi pemeriksaan NPWP unik, kelengkapan dokumen legalitas, dan evaluasi kinerja.</p>
        </div>
        <button
          v-if="auth.hasPermission('procurement:create')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openCreateVendor"
        >
          + Daftarkan Vendor Baru
        </button>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>Kode & NPWP</th>
              <th>Nama Vendor</th>
              <th>Kategori & Kontak</th>
              <th>Rekening Pembayaran</th>
              <th>Skor & Evaluasi</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in paginatedVendors" :key="v.id">
              <td>
                <span class="doc-code">{{ v.code }}</span>
                <div class="text-muted" style="font-size: 0.78rem">NPWP: {{ v.taxIdNpwp }}</div>
              </td>
              <td>
                <strong>{{ v.name }}</strong>
                <div class="text-muted" style="font-size: 0.78rem">{{ v.legalName }}</div>
              </td>
              <td>
                {{ v.category }}
                <div class="text-muted" style="font-size: 0.78rem">{{ v.contactName }} ({{ v.phone }})</div>
              </td>
              <td>
                {{ v.bankName }}
                <div class="num text-muted" style="font-size: 0.78rem">{{ v.bankAccountNo }}</div>
              </td>
              <td>
                <strong>{{ v.evaluationRating }} / 5.0</strong> (Kelengkapan {{ v.completenessScore }}%)
              </td>
              <td><StatusBadge :status="v.status" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationControl
        v-model:currentPage="vendorPage"
        v-model:pageSize="vendorPageSize"
        :totalItems="totalVendors"
        :pageSizeOptions="[5, 10, 25]"
        itemLabel="rekanan vendor"
      />
    </div>

    <!-- Modal: Create PR -->
    <ModalDialog :open="prModalOpen" title="Ajukan Purchase Request (PR) Baru" maxWidth="780px" @close="prModalOpen = false">
      <form @submit.prevent="submitPr" style="display: flex; flex-direction: column; gap: 14px">
        <AlertBanner
          v-if="prModalError"
          variant="danger"
          title="Kendala Validasi Pengajuan PR"
          :message="prModalError"
          @dismiss="prModalError = ''"
        />

        <div class="form-field">
          <label for="pr-title" class="form-label">
            Judul Kebutuhan Pengadaan <span style="color: var(--danger-base, #dc2626)">*</span>
          </label>
          <input
            id="pr-title"
            v-model="prForm.title"
            type="text"
            class="input"
            placeholder="Contoh: Pengadaan 5 Unit Laptop Developer untuk Tim PMO"
            required
            minlength="4"
          />
          <span class="input-hint" style="font-size: 0.78rem; color: var(--text-muted, #64748b)">
            Minimal 4 karakter deskripsi umum kebutuhan.
          </span>
        </div>

        <!-- Smart Budget Line Picker -->
        <div class="form-field">
          <div class="flex justify-between items-center mb-1">
            <label class="form-label mb-0">
              Pos Mata Anggaran Sumber <span style="color: var(--danger-base, #dc2626)">*</span>
            </label>
            <span v-if="availableBudgetLines.length > 0" class="text-xs text-slate-500 font-mono">
              {{ availableBudgetLines.length }} Pos Anggaran Siap Digunakan
            </span>
          </div>

          <!-- Card Pos Terpilih -->
          <div
            v-if="selectedBudgetLine && !prPickerOpen"
            class="p-3 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col gap-2"
          >
            <div class="flex justify-between items-start gap-2">
              <div>
                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                  <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                    {{ selectedBudgetLine.budgetDocNumber }}
                  </span>
                  <span v-if="selectedBudgetLine.accountCode" class="font-mono text-xs text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold">
                    {{ selectedBudgetLine.accountCode }}
                  </span>
                  <span v-if="selectedBudgetLine.businessUnitCode" class="text-xs text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                    {{ selectedBudgetLine.businessUnitCode }}
                  </span>
                </div>
                <div class="font-bold text-slate-900 text-sm leading-snug">
                  {{ selectedBudgetLine.description }}
                </div>
                <div v-if="selectedBudgetLine.costCenter" class="text-xs text-slate-500 mt-1 font-mono">
                  Cost Center: <strong>{{ selectedBudgetLine.costCenter.code }}</strong> - {{ selectedBudgetLine.costCenter.name }}
                </div>
              </div>
              <button
                type="button"
                class="btn btn-sm shrink-0"
                style="padding: 4px 10px; font-size: 0.76rem;"
                @click="prPickerOpen = true"
              >
                Ganti Pos
              </button>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-blue-200/60 text-xs">
              <span class="text-slate-600 font-medium">Sisa Pagu Tersedia (Ceiling):</span>
              <span class="font-mono font-bold text-emerald text-sm">
                {{ formatRupiah(selectedBudgetLine.availableAmount) }}
              </span>
            </div>
          </div>

          <!-- Mode Pencarian & Seleksi Pos Anggaran -->
          <div
            v-else
            class="p-3 rounded-xl border border-slate-300 bg-white shadow-sm flex flex-col gap-2"
          >
            <div class="flex gap-2 flex-wrap">
              <input
                v-model="prBlineSearch"
                type="text"
                class="input text-xs flex-1"
                placeholder="Cari uraian pos, kode COA, atau nomor dokumen anggaran..."
              />
              <select v-model="prBlineUnitFilter" class="select text-xs" style="max-width: 170px;">
                <option value="">Semua Unit Bisnis</option>
                <option v-for="u in master.businessUnits" :key="u.id" :value="u.id">
                  {{ u.code }} - {{ u.name }}
                </option>
              </select>
            </div>

            <div class="max-h-48 overflow-y-auto flex flex-col gap-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
              <div
                v-for="bl in filteredBudgetLinesForPr"
                :key="bl.id"
                class="p-2 rounded-lg cursor-pointer transition-all hover:bg-white hover:shadow-xs border border-transparent hover:border-slate-200 flex justify-between items-center"
                :class="{ 'bg-blue-50 border-blue-300': prForm.budgetLineId === bl.id }"
                @click="selectBudgetLineForPr(bl)"
              >
                <div class="flex flex-col pr-2">
                  <div class="flex items-center gap-1 mb-0.5">
                    <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                      {{ bl.budgetDocNumber }}
                    </span>
                    <span v-if="bl.accountCode" class="font-mono text-xs text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {{ bl.accountCode }}
                    </span>
                    <span class="text-xs text-slate-500 font-bold ml-1">{{ bl.businessUnitCode }}</span>
                  </div>
                  <span class="text-xs font-semibold text-slate-800 line-clamp-1">{{ bl.description }}</span>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs font-mono font-bold text-emerald">
                    {{ formatRupiah(bl.availableAmount) }}
                  </div>
                  <span class="text-xs text-slate-400">sisa pagu</span>
                </div>
              </div>
              <div v-if="filteredBudgetLinesForPr.length === 0" class="text-center py-4 text-xs text-slate-400">
                Tidak ada pos anggaran yang sesuai dengan filter pencarian.
              </div>
            </div>

            <div v-if="selectedBudgetLine" class="flex justify-end pt-1">
              <button
                type="button"
                class="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                @click="prPickerOpen = false"
              >
                Batal Ganti
              </button>
            </div>
          </div>
          <span v-if="availableBudgetLines.length === 0" class="input-hint" style="color: var(--danger-base, #dc2626); font-size: 0.78rem; margin-top: 4px">
            ⚠️ Belum ada anggaran berstatus APPROVED. Harap buat dan setujui anggaran di menu <strong>Modal & Anggaran</strong> terlebih dahulu.
          </span>
        </div>

        <div class="form-field">
          <label for="pr-purpose" class="form-label">
            Alasan Bisnis & Tujuan Penggunaan <span style="color: var(--danger-base, #dc2626)">*</span>
          </label>
          <input
            id="pr-purpose"
            v-model="prForm.purpose"
            type="text"
            class="input"
            placeholder="Contoh: Menunjang operasional sertifikasi batch berikutnya dan penggantian unit rusak"
            required
            minlength="5"
          />
          <span class="input-hint" style="font-size: 0.78rem; color: var(--text-muted, #64748b)">
            Minimal 5 karakter justifikasi kebutuhan bisnis.
          </span>
        </div>

        <div style="border-top: 1px solid var(--border-color, #e2e8f0); padding-top: 12px; margin-top: 4px">
          <h4 style="font-size: 0.88rem; font-weight: 600; margin-bottom: 8px; color: var(--text-heading, #1e293b)">
            Rincian Item & Estimasi Biaya
          </h4>

          <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 10px">
            <div class="form-field">
              <label for="pr-item" class="form-label">
                Nama Barang / Jasa <span style="color: var(--danger-base, #dc2626)">*</span>
              </label>
              <input
                id="pr-item"
                v-model="prForm.itemName"
                type="text"
                class="input"
                placeholder="Contoh: Laptop ThinkPad E14"
                required
                minlength="2"
              />
            </div>
            <div class="form-field">
              <label for="pr-qty" class="form-label">
                Kuantitas <span style="color: var(--danger-base, #dc2626)">*</span>
              </label>
              <input
                id="pr-qty"
                v-model.number="prForm.quantity"
                type="number"
                min="1"
                class="input"
                required
              />
            </div>
            <div class="form-field">
              <label for="pr-unit" class="form-label">
                Satuan <span style="color: var(--danger-base, #dc2626)">*</span>
              </label>
              <input
                id="pr-unit"
                v-model="prForm.unit"
                type="text"
                class="input"
                placeholder="Unit / Pcs / Paket"
                required
              />
            </div>
          </div>

          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px">
            <div class="form-field">
              <label for="pr-spec" class="form-label">Spesifikasi Tambahan (Opsional)</label>
              <input
                id="pr-spec"
                v-model="prForm.specification"
                type="text"
                class="input"
                placeholder="Contoh: Core i7, RAM 16GB, SSD 512GB"
              />
            </div>
            <div class="form-field">
              <label for="pr-price" class="form-label">
                Estimasi Harga Satuan (IDR) <span style="color: var(--danger-base, #dc2626)">*</span>
              </label>
              <CurrencyInput
                id="pr-price"
                v-model="prForm.estimatedUnitPrice"
                :min="1"
                placeholder="Rp 0"
                required
              />
              <span class="input-hint" style="font-size: 0.78rem; color: var(--text-muted, #64748b)">
                Wajib lebih dari Rp 0 sesuai format rupiah.
              </span>
            </div>
          </div>
        </div>

        <!-- Live Budget Card & Real-Time Calculation -->
        <div v-if="selectedBudgetLine" style="background: var(--bg-surface-soft, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; padding: 12px; font-size: 0.84rem">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px">
            <span style="color: var(--text-muted, #64748b)">Sisa Pagu Anggaran Tersedia:</span>
            <strong style="color: var(--text-heading, #1e293b)">{{ formatRupiah(selectedBudgetLine.availableAmount) }}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px">
            <span style="color: var(--text-muted, #64748b)">
              Total Estimasi Pengadaan ({{ prForm.quantity || 0 }} {{ prForm.unit || 'Unit' }} x {{ formatRupiah(prForm.estimatedUnitPrice || 0) }}):
            </span>
            <strong :style="{ color: isPrOverBudget ? 'var(--danger-base, #dc2626)' : 'var(--primary-base, #2563eb)' }">
              {{ formatRupiah(prTotalEstimated) }}
            </strong>
          </div>
          <div style="border-top: 1px dashed var(--border-color, #cbd5e1); margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between">
            <span style="color: var(--text-muted, #64748b)">Estimasi Sisa Pagu Setelah PR:</span>
            <strong :style="{ color: isPrOverBudget ? 'var(--danger-base, #dc2626)' : 'var(--success-base, #16a34a)' }">
              {{ isPrOverBudget ? 'Defisit ' + formatRupiah(prTotalEstimated - selectedBudgetLine.availableAmount) : formatRupiah(selectedBudgetLine.availableAmount - prTotalEstimated) }}
            </strong>
          </div>
          <div v-if="isPrOverBudget" style="margin-top: 8px; color: var(--danger-base, #dc2626); font-weight: 500; font-size: 0.8rem">
            ⚠️ Total estimasi pengadaan melebihi sisa pagu anggaran terpilih! Harap kurangi kuantitas/harga atau ajukan revisi anggaran.
          </div>
        </div>

        <div class="form-field" style="margin-top: 4px">
          <label for="pr-minquote" class="form-label">Syarat Minimal Penawaran Vendor (Kuotasi)</label>
          <div style="display: flex; align-items: center; gap: 8px">
            <input
              id="pr-minquote"
              v-model.number="prForm.minQuotationsRequired"
              type="number"
              min="1"
              max="10"
              class="input"
              style="max-width: 90px"
              required
            />
            <span style="font-size: 0.8rem; color: var(--text-muted, #64748b)">
              rekanan vendor (Standar SOP: minimal 3 penawaran harga untuk komparasi sebelum PO)
            </span>
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end; margin-top: 8px">
          <button type="button" class="btn btn-sm" :disabled="prSubmitting" @click="prModalOpen = false">Batal</button>
          <button
            type="submit"
            class="btn btn-sm btn-primary"
            :disabled="prSubmitting || isPrOverBudget || (prForm.estimatedUnitPrice || 0) <= 0 || !prForm.budgetLineId || !prForm.title || prForm.title.trim().length < 4"
          >
            <span v-if="prSubmitting">Mengajukan PR...</span>
            <span v-else>Ajukan Purchase Request</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Add Quotation -->
    <ModalDialog :open="quoteModalOpen" title="Tambah Penawaran Harga Vendor (Quotation)" @close="quoteModalOpen = false">
      <form @submit.prevent="submitQuotation" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="quoteModalError"
          variant="danger"
          title="Kendala Simpan Penawaran"
          :message="quoteModalError"
          @dismiss="quoteModalError = ''"
        />

        <div class="form-field">
          <label for="qt-vendor" class="form-label">Pilih Vendor Aktif</label>
          <select id="qt-vendor" v-model="quoteForm.vendorId" class="select" required>
            <option v-for="v in vendors.filter((x) => x.status === 'ACTIVE')" :key="v.id" :value="v.id">
              {{ v.code }} - {{ v.name }}
            </option>
          </select>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="qt-num" class="form-label">Nomor Surat Penawaran Vendor</label>
            <input id="qt-num" v-model="quoteForm.quotationNumber" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="qt-sub" class="form-label">Harga Penawaran Sebelum Pajak (IDR)</label>
            <CurrencyInput
              id="qt-sub"
              v-model="quoteForm.quotedSubtotal"
              :min="0"
              placeholder="0"
              required
            />
          </div>
          <div class="form-field">
            <label for="qt-days" class="form-label">Waktu Pengiriman (Hari)</label>
            <input id="qt-days" v-model.number="quoteForm.deliveryDays" type="number" min="1" class="input" required />
          </div>
          <div class="form-field">
            <label for="qt-war" class="form-label">Keterangan Garansi</label>
            <input id="qt-war" v-model="quoteForm.warrantyInfo" type="text" class="input" required />
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="quoteSubmitting" @click="quoteModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="quoteSubmitting">
            <span v-if="quoteSubmitting">Menyimpan...</span>
            <span v-else>Simpan Penawaran</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Convert PR to PO -->
    <ModalDialog :open="poModalOpen" title="Terbitkan Purchase Order (PO) dari PR" @close="poModalOpen = false">
      <form v-if="selectedPr" @submit.prevent="submitCreatePo" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="poModalError"
          variant="danger"
          title="Kendala Penerbitan PO"
          :message="poModalError"
          @dismiss="poModalError = ''"
        />

        <div class="form-field">
          <label for="po-quote" class="form-label">Pilih Penawaran Vendor Pemenang</label>
          <select id="po-quote" v-model="poForm.selectedQuotationId" class="select" required>
            <option v-for="q in selectedPr.quotations" :key="q.id" :value="q.id">
              {{ q.vendor?.name }} ({{ q.quotationNumber }}) - Total {{ formatRupiah(q.totalAmount) }}
            </option>
          </select>
        </div>

        <div class="form-field">
          <label for="po-just" class="form-label">Alasan Pemilihan Vendor Pemenang</label>
          <textarea id="po-just" v-model="poForm.selectionJustification" class="textarea" required></textarea>
        </div>

        <div v-if="(selectedPr.quotations?.length || 0) < selectedPr.minQuotationsRequired" class="form-field">
          <label for="po-exc" class="form-label">
            Alasan Pengecualian Kuotasi (Wajib karena penawaran kurang dari {{ selectedPr.minQuotationsRequired }})
          </label>
          <textarea
            id="po-exc"
            v-model="poForm.quotationExceptionReason"
            class="textarea"
            placeholder="Contoh: Agen tunggal pemegang lisensi resmi atau kebutuhan mendesak operasional."
            required
          ></textarea>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="poSubmitting" @click="poModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="poSubmitting">
            <span v-if="poSubmitting">Menerbitkan...</span>
            <span v-else>Terbitkan Purchase Order</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Goods Receipt -->
    <ModalDialog :open="receiptModalOpen" title="Catat Bukti Penerimaan Barang / Jasa (Goods Receipt)" @close="receiptModalOpen = false">
      <form v-if="selectedPoForReceipt" @submit.prevent="submitGoodsReceipt" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="receiptModalError"
          variant="danger"
          title="Kendala Pencatatan Penerimaan"
          :message="receiptModalError"
          @dismiss="receiptModalError = ''"
        />

        <AlertBanner
          variant="info"
          title="Ketentuan Akrual BAST (Pertor 310)"
          message="Penerimaan barang/jasa otomatis memposting jurnal akrual (Dr. Beban vs Cr. 210101010100 Utang Pengadaan Barang dan Jasa Rekanan) dengan nomor BAST sebagai referensi audit BPK."
        />

        <p>PO Referensi: <strong>{{ selectedPoForReceipt.docNumber }}</strong> ({{ selectedPoForReceipt.vendor?.name }})</p>
        <div class="form-grid">
          <div class="form-field">
            <label for="gr-ref" class="form-label">Nomor Surat Jalan / BAST Vendor</label>
            <input id="gr-ref" v-model="receiptForm.deliveryNoteRef" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="gr-qty" class="form-label">Kuantitas Diterima Saat Ini</label>
            <input id="gr-qty" v-model.number="receiptForm.quantityReceived" type="number" step="0.01" min="0.01" class="input" required />
          </div>
        </div>
        <div class="form-field">
          <label for="gr-note" class="form-label">Catatan Pemeriksaan Fisik</label>
          <input id="gr-note" v-model="receiptForm.conditionNote" type="text" class="input" required />
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="receiptSubmitting" @click="receiptModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="receiptSubmitting">
            <span v-if="receiptSubmitting">Menyimpan...</span>
            <span v-else>Simpan Penerimaan Barang</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Create Expense -->
    <ModalDialog :open="expenseModalOpen" title="Catat Pengeluaran Operasional / Kas Keluar" maxWidth="780px" @close="expenseModalOpen = false">
      <form @submit.prevent="submitExpense" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="expenseModalError"
          variant="danger"
          title="Kendala Pengajuan Pengeluaran"
          :message="expenseModalError"
          @dismiss="expenseModalError = ''"
        />

        <div class="form-field">
          <label for="exp-title" class="form-label">Judul Pengeluaran</label>
          <input id="exp-title" v-model="expenseForm.title" type="text" class="input" placeholder="Contoh: Biaya Konsumsi & Dokumentasi Workshop" required />
        </div>

        <!-- Smart Budget Line Picker for Expense -->
        <div class="form-field">
          <div class="flex justify-between items-center mb-1">
            <label class="form-label mb-0">Pos Mata Anggaran Beban</label>
            <span v-if="availableBudgetLines.length > 0" class="text-xs text-slate-500 font-mono">
              {{ availableBudgetLines.length }} Pos Anggaran Tersedia
            </span>
          </div>

          <!-- Card Pos Terpilih -->
          <div
            v-if="selectedExpenseBudgetLine && !expPickerOpen"
            class="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col gap-2"
          >
            <div class="flex justify-between items-start gap-2">
              <div>
                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                  <span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                    {{ selectedExpenseBudgetLine.budgetDocNumber }}
                  </span>
                  <span v-if="selectedExpenseBudgetLine.accountCode" class="font-mono text-xs text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold">
                    {{ selectedExpenseBudgetLine.accountCode }}
                  </span>
                  <span v-if="selectedExpenseBudgetLine.businessUnitCode" class="text-xs text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                    {{ selectedExpenseBudgetLine.businessUnitCode }}
                  </span>
                </div>
                <div class="font-bold text-slate-900 text-sm leading-snug">
                  {{ selectedExpenseBudgetLine.description }}
                </div>
                <div v-if="selectedExpenseBudgetLine.costCenter" class="text-xs text-slate-500 mt-1 font-mono">
                  Cost Center: <strong>{{ selectedExpenseBudgetLine.costCenter.code }}</strong> - {{ selectedExpenseBudgetLine.costCenter.name }}
                </div>
              </div>
              <button
                type="button"
                class="btn btn-sm shrink-0"
                style="padding: 4px 10px; font-size: 0.76rem;"
                @click="expPickerOpen = true"
              >
                Ganti Pos
              </button>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
              <span class="text-slate-600 font-medium">Sisa Pagu Tersedia (Ceiling):</span>
              <span class="font-mono font-bold text-emerald text-sm">
                {{ formatRupiah(selectedExpenseBudgetLine.availableAmount) }}
              </span>
            </div>
          </div>

          <!-- Mode Seleksi Pos Beban -->
          <div
            v-else
            class="p-3 rounded-xl border border-slate-300 bg-white shadow-sm flex flex-col gap-2"
          >
            <div class="flex gap-2 flex-wrap">
              <input
                v-model="expBlineSearch"
                type="text"
                class="input text-xs flex-1"
                placeholder="Cari uraian pos, kode COA, atau nomor dokumen anggaran..."
              />
              <select v-model="expBlineUnitFilter" class="select text-xs" style="max-width: 170px;">
                <option value="">Semua Unit Bisnis</option>
                <option v-for="u in master.businessUnits" :key="u.id" :value="u.id">
                  {{ u.code }} - {{ u.name }}
                </option>
              </select>
            </div>

            <div class="max-h-48 overflow-y-auto flex flex-col gap-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
              <div
                v-for="bl in filteredBudgetLinesForExpense"
                :key="bl.id"
                class="p-2 rounded-lg cursor-pointer transition-all hover:bg-white hover:shadow-xs border border-transparent hover:border-slate-200 flex justify-between items-center"
                :class="{ 'bg-blue-50 border-blue-300': expenseForm.budgetLineId === bl.id }"
                @click="selectBudgetLineForExpense(bl)"
              >
                <div class="flex flex-col pr-2">
                  <div class="flex items-center gap-1 mb-0.5">
                    <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold">
                      {{ bl.budgetDocNumber }}
                    </span>
                    <span v-if="bl.accountCode" class="font-mono text-xs text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {{ bl.accountCode }}
                    </span>
                    <span class="text-xs text-slate-500 font-bold ml-1">{{ bl.businessUnitCode }}</span>
                  </div>
                  <span class="text-xs font-semibold text-slate-800 line-clamp-1">{{ bl.description }}</span>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs font-mono font-bold text-emerald">
                    {{ formatRupiah(bl.availableAmount) }}
                  </div>
                  <span class="text-xs text-slate-400">sisa pagu</span>
                </div>
              </div>
              <div v-if="filteredBudgetLinesForExpense.length === 0" class="text-center py-4 text-xs text-slate-400">
                Tidak ada pos anggaran yang cocok dengan filter pencarian.
              </div>
            </div>

            <div v-if="selectedExpenseBudgetLine" class="flex justify-end pt-1">
              <button
                type="button"
                class="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                @click="expPickerOpen = false"
              >
                Batal Ganti
              </button>
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="exp-rec" class="form-label">Nama Penerima Pembayaran</label>
            <input id="exp-rec" v-model="expenseForm.recipientName" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="exp-method" class="form-label">Metode Pembayaran</label>
            <select id="exp-method" v-model="expenseForm.paymentMethod" class="select">
              <option value="BANK_TRANSFER">BANK_TRANSFER</option>
              <option value="PETTY_CASH">PETTY_CASH</option>
              <option value="VIRTUAL_ACCOUNT">VIRTUAL_ACCOUNT</option>
            </select>
          </div>
          <div class="form-field">
            <label for="exp-sub" class="form-label">Nominal Pokok (IDR)</label>
            <CurrencyInput
              id="exp-sub"
              v-model="expenseForm.subtotal"
              :min="0"
              placeholder="0"
              required
            />
          </div>
          <div class="form-field">
            <label for="exp-tax" class="form-label">Nominal Pajak PPN (IDR)</label>
            <CurrencyInput
              id="exp-tax"
              v-model="expenseForm.taxAmount"
              :min="0"
              placeholder="0"
              required
            />
          </div>
        </div>

        <div class="form-field">
          <label for="exp-desc" class="form-label">Uraian & Referensi Bukti Nota</label>
          <input id="exp-desc" v-model="expenseForm.description" type="text" class="input" placeholder="Contoh: Sesuai kuitansi terlampir" required />
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="expenseSubmitting" @click="expenseModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="expenseSubmitting">
            <span v-if="expenseSubmitting">Mengajukan...</span>
            <span v-else>Ajukan Pengeluaran</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Void Expense -->
    <ModalDialog :open="voidModalOpen" title="Void / Reversal Pengeluaran" @close="voidModalOpen = false">
      <form v-if="selectedExpenseForVoid" @submit.prevent="confirmVoidExpense" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="voidModalError"
          variant="danger"
          title="Kendala Void Pengeluaran"
          :message="voidModalError"
          @dismiss="voidModalError = ''"
        />

        <p>
          Anda akan membatalkan (VOID) pengeluaran <strong>{{ selectedExpenseForVoid.docNumber }}</strong> dan membuat jurnal pembalik otomatis.
        </p>
        <div class="form-field">
          <label for="void-reason" class="form-label">Alasan Pembatalan / Koreksi (Wajib)</label>
          <textarea id="void-reason" v-model="voidReason" class="textarea" placeholder="Contoh: Koreksi salah input nominal pajak pada bukti transfer." required></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="voidSubmitting" @click="voidModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-danger" :disabled="voidSubmitting">
            <span v-if="voidSubmitting">Memproses Void...</span>
            <span v-else>Konfirmasi Void & Buat Jurnal Pembalik</span>
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Register Vendor -->
    <ModalDialog :open="vendorModalOpen" title="Daftarkan Vendor / Rekanan Baru" @close="vendorModalOpen = false">
      <form @submit.prevent="submitVendor" style="display: flex; flex-direction: column; gap: 12px">
        <AlertBanner
          v-if="vendorModalError"
          variant="danger"
          title="Kendala Pendaftaran Vendor"
          :message="vendorModalError"
          @dismiss="vendorModalError = ''"
        />

        <div class="form-grid">
          <div class="form-field">
            <label for="vnd-name" class="form-label">Nama Komersial Vendor</label>
            <input id="vnd-name" v-model="vendorForm.name" type="text" class="input" placeholder="Contoh: PT Solusi Edukasi Prima" required />
          </div>
          <div class="form-field">
            <label for="vnd-legal" class="form-label">Nama Badan Hukum Resmi</label>
            <input id="vnd-legal" v-model="vendorForm.legalName" type="text" class="input" placeholder="Contoh: PT Solusi Edukasi Prima Nusantara" required />
          </div>
          <div class="form-field">
            <label for="vnd-npwp" class="form-label">Nomor NPWP (Unik)</label>
            <input id="vnd-npwp" v-model="vendorForm.taxIdNpwp" type="text" class="input" placeholder="01.555.666.7-012.000" required />
          </div>
          <div class="form-field">
            <label for="vnd-contact" class="form-label">Nama Narahubung (PIC)</label>
            <input id="vnd-contact" v-model="vendorForm.contactName" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="vnd-email" class="form-label">Email Vendor</label>
            <input id="vnd-email" v-model="vendorForm.email" type="email" class="input" placeholder="info@vendor.co.id" required />
          </div>
          <div class="form-field">
            <label for="vnd-phone" class="form-label">Nomor Telepon</label>
            <input id="vnd-phone" v-model="vendorForm.phone" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="vnd-bank" class="form-label">Nama Bank</label>
            <input id="vnd-bank" v-model="vendorForm.bankName" type="text" class="input" required />
          </div>
          <div class="form-field">
            <label for="vnd-acc" class="form-label">Nomor Rekening Bank</label>
            <input id="vnd-acc" v-model="vendorForm.bankAccountNo" type="text" class="input" required />
          </div>
        </div>
        <div class="form-field">
          <label for="vnd-holder" class="form-label">Nama Pemilik Rekening</label>
          <input id="vnd-holder" v-model="vendorForm.bankAccountHolder" type="text" class="input" required />
        </div>
        <div class="form-field">
          <label for="vnd-addr" class="form-label">Alamat Lengkap</label>
          <input id="vnd-addr" v-model="vendorForm.address" type="text" class="input" required />
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" :disabled="vendorSubmitting" @click="vendorModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="vendorSubmitting">
            <span v-if="vendorSubmitting">Menyimpan...</span>
            <span v-else>Simpan Vendor</span>
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
