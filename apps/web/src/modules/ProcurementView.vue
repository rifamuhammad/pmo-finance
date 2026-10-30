<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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

const availableBudgetLines = computed(() =>
  approvedBudgets.value.flatMap((b) =>
    (b.lines || []).map((l: any) => ({
      ...l,
      budgetDocNumber: b.docNumber,
      businessUnitId: b.businessUnitId,
      fundSourceId: b.fundSourceId,
    }))
  )
);

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
  const firstLine = availableBudgetLines.value[0];
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
  prModalOpen.value = true;
}

async function submitPr() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const selectedLine = availableBudgetLines.value.find((l) => l.id === prForm.value.budgetLineId);
    const res = await apiFetch('/procurement/purchase-requests', {
      method: 'POST',
      body: JSON.stringify({
        title: prForm.value.title,
        businessUnitId: selectedLine?.businessUnitId || prForm.value.businessUnitId,
        costCenterId: selectedLine?.costCenterId || prForm.value.costCenterId,
        budgetLineId: prForm.value.budgetLineId,
        purpose: prForm.value.purpose,
        minQuotationsRequired: prForm.value.minQuotationsRequired,
        submitImmediately: true,
        lines: [
          {
            itemName: prForm.value.itemName,
            specification: prForm.value.specification,
            quantity: Number(prForm.value.quantity),
            unit: prForm.value.unit,
            estimatedUnitPrice: Number(prForm.value.estimatedUnitPrice),
          },
        ],
      }),
    });
    prModalOpen.value = false;
    feedbackMsg.value = `Purchase Request ${res.data.docNumber} berhasil diajukan.`;
    await loadAllProcurementData();
    selectedPr.value = prs.value.find((p) => p.id === res.data.id) || prs.value[0];
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membuat PR.';
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
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/procurement/purchase-requests/${selectedPr.value.id}/quotations`, {
      method: 'POST',
      body: JSON.stringify(quoteForm.value),
    });
    quoteModalOpen.value = false;
    feedbackMsg.value = `Penawaran vendor berhasil ditambahkan ke ${selectedPr.value.docNumber}.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menambahkan penawaran.';
  }
}

function openCreatePo(pr: any) {
  selectedPr.value = pr;
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
  errorMsg.value = '';
  feedbackMsg.value = '';
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
    errorMsg.value = err.message || 'Gagal menerbitkan PO.';
  }
}

function openGoodsReceipt(po: any) {
  selectedPoForReceipt.value = po;
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
  errorMsg.value = '';
  feedbackMsg.value = '';
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
    feedbackMsg.value = `Bukti penerimaan barang ${res.data.goodsReceipt.docNumber} tercatat (Status PO: ${res.data.poStatus}).`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencatat penerimaan barang.';
  }
}

function openCreateExpense() {
  const firstLine = availableBudgetLines.value[0];
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
  expenseModalOpen.value = true;
}

async function submitExpense() {
  errorMsg.value = '';
  feedbackMsg.value = '';
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
    errorMsg.value = err.message || 'Gagal mencatat pengeluaran.';
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
    feedbackMsg.value = `Pengeluaran ${exp.docNumber} dicairkan, realisasi anggaran diperbarui, dan jurnal ${res.data.journal.journalNumber} diposting otomatis.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencairkan pengeluaran.';
  }
}

function openVoidModal(exp: any) {
  selectedExpenseForVoid.value = exp;
  voidReason.value = '';
  voidModalOpen.value = true;
}

async function confirmVoidExpense() {
  if (!selectedExpenseForVoid.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/procurement/expenses/${selectedExpenseForVoid.value.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason: voidReason.value }),
    });
    voidModalOpen.value = false;
    feedbackMsg.value = `Transaksi ${res.data.docNumber} telah di-VOID beserta jurnal pembalik otomatis.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal melakukan void pengeluaran.';
  }
}

async function submitVendor() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/procurement/vendors', {
      method: 'POST',
      body: JSON.stringify(vendorForm.value),
    });
    vendorModalOpen.value = false;
    feedbackMsg.value = `Vendor ${res.data.code} (${res.data.name}) berhasil didaftarkan.`;
    await loadAllProcurementData();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menyimpan vendor.';
  }
}

onMounted(loadAllProcurementData);
</script>

<template>
  <div class="procurement-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Pengadaan, PO & Pengeluaran Biaya</h1>
        <p class="page-desc">
          Alur pengadaan dari PR, perbandingan 3 penawaran vendor, PO, verifikasi 3-way match, hingga pencairan beban operasional.
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
        1. Purchase Request & Kuotasi ({{ prs.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'po' }" @click="activeTab = 'po'">
        2. Purchase Order & Penerimaan ({{ pos.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'expenses' }" @click="activeTab = 'expenses'">
        3. Pengeluaran Kas & Realisasi ({{ expenses.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'vendors' }" @click="activeTab = 'vendors'">
        4. Master Vendor ({{ vendors.length }})
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
                  Bukti GR: {{ po.goodsReceipts.map((g: any) => g.docNumber).join(', ') }}
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
          @click="vendorModalOpen = true"
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
    <ModalDialog :open="prModalOpen" title="Ajukan Purchase Request (PR) Baru" @close="prModalOpen = false">
      <form @submit.prevent="submitPr" style="display: flex; flex-direction: column; gap: 12px">
        <div class="form-field">
          <label for="pr-title" class="form-label">Judul Kebutuhan Pengadaan</label>
          <input id="pr-title" v-model="prForm.title" type="text" class="input" placeholder="Contoh: Pengadaan Perangkat Audio Ruang Kelas" required />
        </div>

        <div class="form-field">
          <label for="pr-bline" class="form-label">Pos Mata Anggaran Sumber (Hanya Anggaran Disetujui)</label>
          <select id="pr-bline" v-model="prForm.budgetLineId" class="select" required>
            <option v-if="availableBudgetLines.length === 0" value="" disabled selected>
              Belum ada anggaran berstatus APPROVED
            </option>
            <option v-else value="" disabled selected>-- Pilih Pos Mata Anggaran Sumber --</option>
            <option v-for="bl in availableBudgetLines" :key="bl.id" :value="bl.id">
              {{ bl.budgetDocNumber }} - {{ bl.description }} (Sisa Pagu: {{ formatRupiah(bl.availableAmount) }})
            </option>
          </select>
          <span v-if="availableBudgetLines.length === 0" class="input-hint" style="color: var(--danger-base, #dc2626); font-size: 0.78rem; margin-top: 4px">
            ⚠️ Belum ada anggaran berstatus APPROVED. Harap buat dan setujui anggaran di menu <strong>Modal & Anggaran</strong> terlebih dahulu.
          </span>
        </div>

        <div class="form-field">
          <label for="pr-purpose" class="form-label">Alasan Bisnis & Tujuan Penggunaan</label>
          <input id="pr-purpose" v-model="prForm.purpose" type="text" class="input" placeholder="Contoh: Menunjang pelatihan sertifikasi batch berikutnya" required />
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="pr-item" class="form-label">Nama Barang / Jasa</label>
            <input id="pr-item" v-model="prForm.itemName" type="text" class="input" placeholder="Contoh: Paket Wireless Microphone" required />
          </div>
          <div class="form-field">
            <label for="pr-qty" class="form-label">Kuantitas</label>
            <input id="pr-qty" v-model.number="prForm.quantity" type="number" min="1" class="input" required />
          </div>
          <div class="form-field">
            <label for="pr-price" class="form-label">Estimasi Harga Satuan (IDR)</label>
            <CurrencyInput
              id="pr-price"
              v-model="prForm.estimatedUnitPrice"
              :min="0"
              placeholder="0"
              required
            />
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="prModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Ajukan PR</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Add Quotation -->
    <ModalDialog :open="quoteModalOpen" title="Tambah Penawaran Harga Vendor (Quotation)" @close="quoteModalOpen = false">
      <form @submit.prevent="submitQuotation" style="display: flex; flex-direction: column; gap: 12px">
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
          <button type="button" class="btn btn-sm" @click="quoteModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Penawaran</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Convert PR to PO -->
    <ModalDialog :open="poModalOpen" title="Terbitkan Purchase Order (PO) dari PR" @close="poModalOpen = false">
      <form v-if="selectedPr" @submit.prevent="submitCreatePo" style="display: flex; flex-direction: column; gap: 12px">
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
          <button type="button" class="btn btn-sm" @click="poModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Terbitkan Purchase Order</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Goods Receipt -->
    <ModalDialog :open="receiptModalOpen" title="Catat Bukti Penerimaan Barang / Jasa (Goods Receipt)" @close="receiptModalOpen = false">
      <form v-if="selectedPoForReceipt" @submit.prevent="submitGoodsReceipt" style="display: flex; flex-direction: column; gap: 12px">
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
          <button type="button" class="btn btn-sm" @click="receiptModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Penerimaan Barang</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Create Expense -->
    <ModalDialog :open="expenseModalOpen" title="Catat Pengeluaran Operasional / Kas Keluar" @close="expenseModalOpen = false">
      <form @submit.prevent="submitExpense" style="display: flex; flex-direction: column; gap: 12px">
        <div class="form-field">
          <label for="exp-title" class="form-label">Judul Pengeluaran</label>
          <input id="exp-title" v-model="expenseForm.title" type="text" class="input" placeholder="Contoh: Biaya Konsumsi & Dokumentasi Workshop" required />
        </div>

        <div class="form-field">
          <label for="exp-bline" class="form-label">Pos Mata Anggaran Beban</label>
          <select id="exp-bline" v-model="expenseForm.budgetLineId" class="select" required>
            <option v-if="availableBudgetLines.length === 0" value="" disabled selected>
              Belum ada anggaran berstatus APPROVED
            </option>
            <option v-else value="" disabled selected>-- Pilih Pos Mata Anggaran --</option>
            <option v-for="bl in availableBudgetLines" :key="bl.id" :value="bl.id">
              {{ bl.budgetDocNumber }} - {{ bl.description }} (Sisa Pagu: {{ formatRupiah(bl.availableAmount) }})
            </option>
          </select>
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
          <button type="button" class="btn btn-sm" @click="expenseModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Ajukan Pengeluaran</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Void Expense -->
    <ModalDialog :open="voidModalOpen" title="Void / Reversal Pengeluaran" @close="voidModalOpen = false">
      <form v-if="selectedExpenseForVoid" @submit.prevent="confirmVoidExpense" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Anda akan membatalkan (VOID) pengeluaran <strong>{{ selectedExpenseForVoid.docNumber }}</strong> dan membuat jurnal pembalik otomatis.
        </p>
        <div class="form-field">
          <label for="void-reason" class="form-label">Alasan Pembatalan / Koreksi (Wajib)</label>
          <textarea id="void-reason" v-model="voidReason" class="textarea" placeholder="Contoh: Koreksi salah input nominal pajak pada bukti transfer." required></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="voidModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-danger">Konfirmasi Void & Buat Jurnal Pembalik</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Register Vendor -->
    <ModalDialog :open="vendorModalOpen" title="Daftarkan Vendor / Rekanan Baru" @close="vendorModalOpen = false">
      <form @submit.prevent="submitVendor" style="display: flex; flex-direction: column; gap: 12px">
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
          <button type="button" class="btn btn-sm" @click="vendorModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Vendor</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
