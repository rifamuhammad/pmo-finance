<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDate, formatDateTime } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import CurrencyInput from '../components/CurrencyInput.vue';
import { usePagination } from '../composables/usePagination';

const auth = useAuthStore();

const activeTab = ref<'invoices' | 'orders' | 'cashier' | 'catalog'>('invoices');
const loading = ref(true);
const errorMsg = ref('');
const feedbackMsg = ref('');

const customers = ref<any[]>([]);
const products = ref<any[]>([]);
const salesOrders = ref<any[]>([]);
const customerInvoices = ref<any[]>([]);

const {
  currentPage: invPage,
  pageSize: invPageSize,
  totalItems: totalInvoices,
  paginatedItems: paginatedInvoices,
} = usePagination(customerInvoices, 5);
const payments = ref<any[]>([]);
const cashierData = ref<any>({ registers: [], sessions: [], deposits: [] });
const bankAccounts = ref<any[]>([]);

// Modals
const orderModalOpen = ref(false);
const paymentModalOpen = ref(false);
const refundModalOpen = ref(false);
const closeSessionModalOpen = ref(false);
const depositModalOpen = ref(false);
const priceModalOpen = ref(false);

const orderForm = ref({
  customerId: '',
  businessUnitId: '',
  productServiceId: '',
  quantity: 1,
  discountAmount: 0,
  taxRatePercent: 11,
  terms: 'NET 14',
  notes: '',
});

const selectedInvoiceForPayment = ref<any>(null);
const paymentForm = ref({
  method: 'BANK_TRANSFER',
  grossAmount: 0,
  feeAmount: 0,
  referenceNo: '',
  idempotencyKey: '',
  bankAccountId: '',
  notes: '',
});

const selectedPaymentForRefund = ref<any>(null);
const refundForm = ref({
  amount: 0,
  reason: '',
});

const selectedSessionForClose = ref<any>(null);
const closeSessionForm = ref({
  actualCountedCash: 0,
  discrepancyReason: '',
});

const depositForm = ref({
  cashierSessionId: '',
  bankAccountId: '',
  amount: 0,
  referenceNo: '',
  notes: '',
});

const selectedProductForPrice = ref<any>(null);
const priceForm = ref({
  newPrice: 0,
  reason: '',
});

async function loadRevenueAndCashier() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [cRes, pRes, soRes, invRes, payRes, cshRes, bnkRes] = await Promise.all([
      apiFetch('/revenue/customers'),
      apiFetch('/revenue/products'),
      apiFetch('/revenue/sales-orders'),
      apiFetch('/revenue/customer-invoices'),
      apiFetch('/revenue/payments'),
      apiFetch('/revenue/cashier/sessions'),
      apiFetch('/reconciliation/bank-accounts').catch(() => ({ data: [] })),
    ]);

    customers.value = cRes.data || [];
    products.value = pRes.data || [];
    salesOrders.value = soRes.data || [];
    customerInvoices.value = invRes.data || [];
    payments.value = payRes.data || [];
    cashierData.value = cshRes.data || { registers: [], sessions: [], deposits: [] };
    bankAccounts.value = bnkRes.data || [];
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memuat data pendapatan dan kasir.';
  } finally {
    loading.value = false;
  }
}

function openCreateOrder() {
  const firstProd = products.value[0];
  orderForm.value = {
    customerId: customers.value[0]?.id || '',
    businessUnitId: firstProd?.businessUnitId || auth.user?.businessUnitId || '',
    productServiceId: firstProd?.id || '',
    quantity: 1,
    discountAmount: 0,
    taxRatePercent: 11,
    terms: 'NET 14',
    notes: '',
  };
  orderModalOpen.value = true;
}

async function submitOrder() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const prod = products.value.find((p) => p.id === orderForm.value.productServiceId);
    const res = await apiFetch('/revenue/sales-orders', {
      method: 'POST',
      body: JSON.stringify({
        customerId: orderForm.value.customerId,
        businessUnitId: prod?.businessUnitId || orderForm.value.businessUnitId,
        terms: orderForm.value.terms,
        notes: orderForm.value.notes,
        issueInvoiceImmediately: true,
        lines: [
          {
            productServiceId: orderForm.value.productServiceId,
            quantity: Number(orderForm.value.quantity),
            discountAmount: Number(orderForm.value.discountAmount),
            taxRatePercent: Number(orderForm.value.taxRatePercent),
          },
        ],
      }),
    });
    orderModalOpen.value = false;
    feedbackMsg.value = `Pesanan ${res.data.order.docNumber} dan Invoice ${res.data.invoice?.docNumber} berhasil diterbitkan beserta jurnal piutang.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal membuat pesanan.';
  }
}

async function markOrderDelivered(order: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/revenue/sales-orders/${order.id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({
        deliveryNotes: `Layanan diserahkan oleh ${auth.user?.fullName}. Status pembayaran invoice tetap independen.`,
      }),
    });
    feedbackMsg.value = `Penyerahan layanan untuk ${order.docNumber} tercatat (Status tagihan tidak berubah otomatis menjadi lunas).`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencatat penyerahan layanan.';
  }
}

function openPaymentModal(inv: any) {
  selectedInvoiceForPayment.value = inv;
  paymentForm.value = {
    method: 'BANK_TRANSFER',
    grossAmount: inv.balanceDue,
    feeAmount: 0,
    referenceNo: `REF-${Date.now().toString().slice(-6)}`,
    idempotencyKey: `IDEMP-${inv.docNumber}-${Date.now()}`,
    bankAccountId: bankAccounts.value[0]?.id || '',
    notes: '',
  };
  paymentModalOpen.value = true;
}

async function submitPayment() {
  if (!selectedInvoiceForPayment.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/revenue/payments', {
      method: 'POST',
      body: JSON.stringify({
        customerInvoiceId: selectedInvoiceForPayment.value.id,
        method: paymentForm.value.method,
        grossAmount: Number(paymentForm.value.grossAmount),
        feeAmount: Number(paymentForm.value.feeAmount),
        referenceNo: paymentForm.value.referenceNo,
        idempotencyKey: paymentForm.value.idempotencyKey,
        bankAccountId: paymentForm.value.bankAccountId || undefined,
        notes: paymentForm.value.notes,
      }),
    });
    paymentModalOpen.value = false;
    feedbackMsg.value = `Pembayaran ${res.data.payment.receiptNumber} sebesar ${formatRupiah(res.data.payment.grossAmount)} berhasil dikonfirmasi dan jurnal telah diposting.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memproses pembayaran.';
  }
}

function openRefundModal(pay: any) {
  selectedPaymentForRefund.value = pay;
  refundForm.value = {
    amount: pay.grossAmount,
    reason: '',
  };
  refundModalOpen.value = true;
}

async function submitRefund() {
  if (!selectedPaymentForRefund.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/revenue/payments/${selectedPaymentForRefund.value.id}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(refundForm.value.amount),
        reason: refundForm.value.reason,
      }),
    });
    refundModalOpen.value = false;
    feedbackMsg.value = `Refund ${res.data.refundNumber} berhasil diproses merujuk ke pembayaran asal ${selectedPaymentForRefund.value.receiptNumber}.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal memproses refund.';
  }
}

function openCloseCashierModal(session: any) {
  selectedSessionForClose.value = session;
  closeSessionForm.value = {
    actualCountedCash: session.theoreticalBalance,
    discrepancyReason: '',
  };
  closeSessionModalOpen.value = true;
}

async function submitCloseCashier() {
  if (!selectedSessionForClose.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/revenue/cashier/sessions/${selectedSessionForClose.value.id}/close`, {
      method: 'POST',
      body: JSON.stringify({
        actualCountedCash: Number(closeSessionForm.value.actualCountedCash),
        discrepancyReason: closeSessionForm.value.discrepancyReason || undefined,
      }),
    });
    closeSessionModalOpen.value = false;
    feedbackMsg.value = `Penutupan sesi kasir ${res.data.sessionNumber} tercatat dengan status ${res.data.status}.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal menutup sesi kasir.';
  }
}

async function approveCashierDiscrepancy(session: any) {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    await apiFetch(`/revenue/cashier/sessions/${session.id}/approve-close`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Selisih kas telah ditinjau dan berita acara disetujui.' }),
    });
    feedbackMsg.value = `Berita acara penutupan kasir ${session.sessionNumber} telah disahkan.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengesahkan penutupan kasir.';
  }
}

function openDepositModal(session: any) {
  depositForm.value = {
    cashierSessionId: session.id,
    bankAccountId: bankAccounts.value[0]?.id || '',
    amount: session.actualCountedCash || session.theoreticalBalance,
    referenceNo: `STR-${Date.now().toString().slice(-6)}`,
    notes: `Setoran kas sesi ${session.sessionNumber}`,
  };
  depositModalOpen.value = true;
}

async function submitDeposit() {
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch('/revenue/cashier/deposits', {
      method: 'POST',
      body: JSON.stringify({
        ...depositForm.value,
        amount: Number(depositForm.value.amount),
      }),
    });
    depositModalOpen.value = false;
    feedbackMsg.value = `Setoran kas ${res.data.depositNumber} ke bank berhasil dicatat beserta jurnal.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mencatat setoran kas.';
  }
}

function openPriceChangeModal(prod: any) {
  selectedProductForPrice.value = prod;
  priceForm.value = {
    newPrice: prod.unitPrice,
    reason: '',
  };
  priceModalOpen.value = true;
}

async function submitPriceChange() {
  if (!selectedProductForPrice.value) return;
  errorMsg.value = '';
  feedbackMsg.value = '';
  try {
    const res = await apiFetch(`/revenue/products/${selectedProductForPrice.value.id}/price`, {
      method: 'PATCH',
      body: JSON.stringify({
        newPrice: Number(priceForm.value.newPrice),
        reason: priceForm.value.reason,
      }),
    });
    priceModalOpen.value = false;
    feedbackMsg.value = `Harga layanan ${res.data.sku} diperbarui. Histori harga tersimpan dan invoice lama tidak berubah.`;
    await loadRevenueAndCashier();
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal mengubah harga layanan.';
  }
}

onMounted(loadRevenueAndCashier);
</script>

<template>
  <div class="revenue-cashier-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Pendapatan, Faktur & Kasir</h1>
        <p class="page-desc">
          Penerbitan faktur tagihan pelanggan, pembayaran piutang, dan sesi kasir.
        </p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" @click="loadRevenueAndCashier">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Muat Ulang
        </button>
        <button
          v-if="auth.hasPermission('revenue:create')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openCreateOrder"
        >
          + Buat Pesanan & Invoice Pelanggan
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
      title="Peringatan Kontrol Transaksi"
      :message="errorMsg"
      @dismiss="errorMsg = ''"
    />

    <div class="tab-bar" role="tablist">
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'invoices' }" @click="activeTab = 'invoices'">
        Faktur Tagihan & Pembayaran ({{ customerInvoices.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">
        Pesanan Layanan ({{ salesOrders.length }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'cashier' }" @click="activeTab = 'cashier'">
        Sesi Kasir & Setoran ({{ cashierData.sessions?.length || 0 }})
      </button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'catalog' }" @click="activeTab = 'catalog'">
        Katalog Layanan & Tarif ({{ products.length }})
      </button>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Data Pendapatan & Kasir"
      message="Mengambil daftar invoice pelanggan, kuitansi pembayaran, sesi kasir, dan setoran bank..."
    />

    <!-- TAB 1: CUSTOMER INVOICES & PAYMENTS -->
    <div v-else-if="activeTab === 'invoices'" style="display: flex; flex-direction: column; gap: 18px">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Daftar Tagihan Pelanggan (Customer Invoices)</h2>
            <p class="text-muted">Mendukung pembayaran penuh maupun parsial dengan pelacakan sisa saldo tagihan secara presisi.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. Invoice</th>
                <th>Pelanggan & Unit</th>
                <th class="money-col">Total Tagihan</th>
                <th class="money-col">Telah Dibayar</th>
                <th class="money-col">Sisa Tagihan</th>
                <th>Layanan</th>
                <th>Status Tagihan</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in paginatedInvoices" :key="inv.id">
                <td>
                  <span class="doc-code">{{ inv.docNumber }}</span>
                  <div class="text-muted" style="font-size: 0.76rem">Jatuh Tempo: {{ formatDate(inv.dueDate) }}</div>
                </td>
                <td>
                  <strong>{{ inv.customer?.name }}</strong>
                  <div class="text-muted" style="font-size: 0.78rem">{{ inv.businessUnit?.code }}</div>
                </td>
                <td class="money-col">{{ formatRupiah(inv.totalAmount) }}</td>
                <td class="money-col">{{ formatRupiah(inv.paidAmount) }}</td>
                <td class="money-col"><strong>{{ formatRupiah(inv.balanceDue) }}</strong></td>
                <td>
                  <StatusBadge :status="inv.serviceDelivered ? 'DELIVERED' : 'PENDING'" />
                </td>
                <td><StatusBadge :status="inv.status" /></td>
                <td>
                  <button
                    v-if="inv.balanceDue > 0 && auth.hasPermission('payment:create')"
                    type="button"
                    class="btn btn-sm btn-primary"
                    @click="openPaymentModal(inv)"
                  >
                    Terima Pembayaran
                  </button>
                  <span v-else class="text-muted">Selesai</span>
                </td>
              </tr>
            </tbody>
          </table>

          <PaginationControl
            v-model:currentPage="invPage"
            v-model:pageSize="invPageSize"
            :totalItems="totalInvoices"
            itemLabel="tagihan invoice"
          />
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Riwayat Kuitansi Pembayaran & Refund Terkontrol</h2>
            <p class="text-muted">
              Mencatat nilai bruto, potongan biaya payment gateway (merchant fee), dan penerimaan bersih ke kas/bank.
            </p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. Kuitansi</th>
                <th>Invoice & Pelanggan</th>
                <th>Metode & Referensi</th>
                <th class="money-col">Bruto (Gross)</th>
                <th class="money-col">Biaya Fee</th>
                <th class="money-col">Bersih (Net)</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pay in payments" :key="pay.id">
                <td>
                  <span class="doc-code">{{ pay.receiptNumber }}</span>
                  <div class="text-muted" style="font-size: 0.76rem">{{ formatDateTime(pay.paymentDate) }}</div>
                </td>
                <td>
                  <strong>{{ pay.customerInvoice?.docNumber }}</strong>
                  <div class="text-muted" style="font-size: 0.78rem">{{ pay.customerInvoice?.customer?.name }}</div>
                </td>
                <td>
                  <span class="doc-code">{{ pay.method }}</span>
                  <div class="text-muted" style="font-size: 0.78rem">Ref: {{ pay.referenceNo }}</div>
                </td>
                <td class="money-col">{{ formatRupiah(pay.grossAmount) }}</td>
                <td class="money-col">{{ formatRupiah(pay.feeAmount) }}</td>
                <td class="money-col"><strong>{{ formatRupiah(pay.netAmount) }}</strong></td>
                <td><StatusBadge :status="pay.status" /></td>
                <td>
                  <button
                    v-if="pay.status === 'CONFIRMED' && auth.hasPermission('payment:approve')"
                    type="button"
                    class="btn btn-sm btn-danger"
                    @click="openRefundModal(pay)"
                  >
                    Proses Refund
                  </button>
                  <span v-else class="text-muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 2: SALES ORDERS & SERVICE DELIVERY -->
    <div v-else-if="activeTab === 'orders'" class="panel">
      <div class="panel-header">
        <div>
          <h2>Daftar Pesanan Pelanggan (Sales Orders) & Status Penyerahan Layanan</h2>
          <p class="text-muted">
            Status penyerahan layanan (Service Delivery) dicatat secara terpisah dan tidak otomatis melunasi tagihan.
          </p>
        </div>
      </div>

      <div class="table-wrap">
        <table class="erp-table">
          <thead>
            <tr>
              <th>No. Order</th>
              <th>Pelanggan & Rincian Layanan</th>
              <th class="money-col">Total Pesanan</th>
              <th>Status Pembayaran</th>
              <th>Status Layanan</th>
              <th>Tindakan Operasional</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="so in salesOrders" :key="so.id">
              <td>
                <span class="doc-code">{{ so.docNumber }}</span>
                <div class="text-muted" style="font-size: 0.76rem">{{ formatDate(so.orderDate) }}</div>
              </td>
              <td>
                <strong>{{ so.customer?.name }}</strong>
                <div v-for="line in so.lines" :key="line.id" class="text-muted" style="font-size: 0.8rem">
                  {{ line.description }} ({{ line.quantity }} x {{ formatRupiah(line.unitPrice) }})
                </div>
                <div v-if="so.deliveryNotes" class="text-muted" style="font-size: 0.78rem; margin-top: 4px">
                  BAST: {{ so.deliveryNotes }}
                </div>
              </td>
              <td class="money-col"><strong>{{ formatRupiah(so.totalAmount) }}</strong></td>
              <td><StatusBadge :status="so.status" /></td>
              <td><StatusBadge :status="so.deliveryStatus" /></td>
              <td>
                <button
                  v-if="so.deliveryStatus !== 'DELIVERED' && auth.hasPermission('revenue:create')"
                  type="button"
                  class="btn btn-sm btn-primary"
                  @click="markOrderDelivered(so)"
                >
                  Catat Layanan Selesai
                </button>
                <span v-else class="text-muted">Diserahkan ({{ so.deliveredBy }})</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: CASHIER SESSIONS, CLOSEOUT & DEPOSITS -->
    <div v-else-if="activeTab === 'cashier'" style="display: flex; flex-direction: column; gap: 18px">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Sesi Kasir, Perhitungan Fisik Closeout & Persetujuan Selisih</h2>
            <p class="text-muted">
              Sesi kasir membandingkan saldo teoritis terhadap hasil hitung fisik; selisih di atas Rp 50.000 wajib disetujui Finance Manager.
            </p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. Sesi & Register</th>
                <th>Petugas Kasir</th>
                <th class="money-col">Modal Awal</th>
                <th class="money-col">Tunai Masuk</th>
                <th class="money-col">Saldo Teoritis</th>
                <th class="money-col">Hitung Fisik</th>
                <th class="money-col">Selisih</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in cashierData.sessions" :key="s.id">
                <td>
                  <span class="doc-code">{{ s.sessionNumber }}</span>
                  <div class="text-muted" style="font-size: 0.78rem">{{ s.cashRegister?.name }}</div>
                </td>
                <td>
                  {{ s.cashierName }}
                  <div v-if="s.discrepancyReason" class="text-muted" style="font-size: 0.76rem">
                    Catatan: {{ s.discrepancyReason }}
                  </div>
                </td>
                <td class="money-col">{{ formatRupiah(s.openingFloat) }}</td>
                <td class="money-col">{{ formatRupiah(s.totalCashIn) }}</td>
                <td class="money-col"><strong>{{ formatRupiah(s.theoreticalBalance) }}</strong></td>
                <td class="money-col">
                  {{ s.actualCountedCash !== null ? formatRupiah(s.actualCountedCash) : '-' }}
                </td>
                <td class="money-col">
                  <strong :style="s.discrepancyAmount && s.discrepancyAmount < 0 ? 'color: var(--status-danger-text)' : ''">
                    {{ s.discrepancyAmount !== null ? formatRupiah(s.discrepancyAmount) : '-' }}
                  </strong>
                </td>
                <td><StatusBadge :status="s.status" /></td>
                <td>
                  <div class="btn-row">
                    <button
                      v-if="s.status === 'OPEN' && auth.hasPermission('cashier:operate')"
                      type="button"
                      class="btn btn-sm btn-primary"
                      @click="openCloseCashierModal(s)"
                    >
                      Tutup Kasir (Closeout)
                    </button>
                    <button
                      v-if="s.status === 'CLOSING_SUBMITTED' && auth.hasPermission('payment:approve')"
                      type="button"
                      class="btn btn-sm btn-success"
                      @click="approveCashierDiscrepancy(s)"
                    >
                      Sahkan Selisih
                    </button>
                    <button
                      v-if="['CLOSING_SUBMITTED', 'CLOSED'].includes(s.status) && auth.hasPermission('cashier:operate')"
                      type="button"
                      class="btn btn-sm"
                      @click="openDepositModal(s)"
                    >
                      Catat Setoran Bank
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Riwayat Setoran Kas Kasir ke Rekening Bank (Cash Deposits)</h2>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>No. Setoran</th>
                <th>Sesi Kasir Asal</th>
                <th>Rekening Bank Tujuan</th>
                <th>Referensi Slip Setoran</th>
                <th class="money-col">Nominal Setoran</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dep in cashierData.deposits" :key="dep.id">
                <td><span class="doc-code">{{ dep.depositNumber }}</span></td>
                <td><span class="doc-code">{{ dep.cashierSession?.sessionNumber }}</span></td>
                <td>{{ dep.bankAccount?.bankName }} ({{ dep.bankAccount?.accountNumberMasked }})</td>
                <td>{{ dep.referenceNo }}</td>
                <td class="money-col"><strong>{{ formatRupiah(dep.amount) }}</strong></td>
                <td><StatusBadge :status="dep.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TAB 4: CUSTOMERS & PRODUCT/SERVICE CATALOG WITH PRICE HISTORY -->
    <div v-else-if="activeTab === 'catalog'" class="split-workspace">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Katalog Produk/Layanan & Histori Perubahan Harga</h2>
            <p class="text-muted">Perubahan harga katalog tidak mengubah nominal pada pesanan atau invoice yang telah diterbitkan.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>SKU & Unit</th>
                <th>Nama Produk / Layanan</th>
                <th class="money-col">Harga Saat Ini</th>
                <th>Histori Harga</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="prod in products" :key="prod.id">
                <td>
                  <span class="doc-code">{{ prod.sku }}</span>
                  <div class="text-muted" style="font-size: 0.76rem">Akun: {{ prod.revenueAccountCode }}</div>
                </td>
                <td>
                  <strong>{{ prod.name }}</strong>
                  <div class="text-muted" style="font-size: 0.78rem">Pajak: {{ prod.taxCode }}</div>
                </td>
                <td class="money-col"><strong>{{ formatRupiah(prod.unitPrice) }}</strong></td>
                <td>
                  <div v-for="h in prod.priceHistories" :key="h.id" class="text-muted" style="font-size: 0.76rem">
                    {{ formatRupiah(h.oldPrice) }} -> {{ formatRupiah(h.newPrice) }} ({{ h.reason }})
                  </div>
                  <span v-if="!prod.priceHistories?.length" class="text-muted">Harga awal</span>
                </td>
                <td>
                  <button
                    v-if="auth.hasPermission('revenue:create')"
                    type="button"
                    class="btn btn-sm"
                    @click="openPriceChangeModal(prod)"
                  >
                    Ubah Harga
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Master Pelanggan ({{ customers.length }})</h2>
        </div>

        <div class="table-wrap">
          <table class="erp-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Organisasi / Pelanggan</th>
                <th>Kontak</th>
                <th class="money-col">Batas Kredit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in customers" :key="c.id">
                <td><span class="doc-code">{{ c.code }}</span></td>
                <td>
                  <strong>{{ c.name }}</strong>
                  <div class="text-muted" style="font-size: 0.76rem">NPWP: {{ c.taxIdNpwp || '-' }}</div>
                </td>
                <td>
                  {{ c.contactPerson }}
                  <div class="text-muted" style="font-size: 0.76rem">{{ c.email }}</div>
                </td>
                <td class="money-col">{{ formatRupiah(c.creditLimit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Modal: Create Sales Order -->
    <ModalDialog :open="orderModalOpen" title="Buat Pesanan Pelanggan & Terbitkan Invoice" @close="orderModalOpen = false">
      <form @submit.prevent="submitOrder" style="display: flex; flex-direction: column; gap: 12px">
        <div class="form-field">
          <label for="so-cust" class="form-label">Pilih Pelanggan</label>
          <select id="so-cust" v-model="orderForm.customerId" class="select" required>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.code }} - {{ c.name }}</option>
          </select>
        </div>

        <div class="form-field">
          <label for="so-prod" class="form-label">Pilih Produk / Layanan</label>
          <select id="so-prod" v-model="orderForm.productServiceId" class="select" required>
            <option v-for="p in products" :key="p.id" :value="p.id">
              {{ p.sku }} - {{ p.name }} ({{ formatRupiah(p.unitPrice) }})
            </option>
          </select>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="so-qty" class="form-label">Kuantitas</label>
            <input id="so-qty" v-model.number="orderForm.quantity" type="number" min="1" class="input" required />
          </div>
          <div class="form-field">
            <label for="so-disc" class="form-label">Diskon Nominal (IDR)</label>
            <CurrencyInput
              id="so-disc"
              v-model="orderForm.discountAmount"
              :min="0"
              placeholder="0"
              required
            />
          </div>
          <div class="form-field">
            <label for="so-tax" class="form-label">Tarif PPN (%)</label>
            <input id="so-tax" v-model.number="orderForm.taxRatePercent" type="number" min="0" max="100" class="input" required />
          </div>
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="orderModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Pesanan & Terbitkan Invoice</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Record Payment -->
    <ModalDialog :open="paymentModalOpen" title="Terima Pembayaran Tagihan Pelanggan" @close="paymentModalOpen = false">
      <form v-if="selectedInvoiceForPayment" @submit.prevent="submitPayment" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Invoice: <strong>{{ selectedInvoiceForPayment.docNumber }}</strong> |
          Sisa Tagihan: <strong class="money">{{ formatRupiah(selectedInvoiceForPayment.balanceDue) }}</strong>
        </p>

        <div class="form-grid">
          <div class="form-field">
            <label for="pay-method" class="form-label">Metode Pembayaran</label>
            <select id="pay-method" v-model="paymentForm.method" class="select">
              <option value="BANK_TRANSFER">BANK_TRANSFER</option>
              <option value="CASH">CASH (Masuk Sesi Kasir Aktif)</option>
              <option value="VIRTUAL_ACCOUNT_SIMULATED">VIRTUAL_ACCOUNT_SIMULATED (Mode Demo)</option>
              <option value="QRIS_SIMULATED">QRIS_SIMULATED (Mode Demo)</option>
            </select>
          </div>

          <div class="form-field">
            <label for="pay-gross" class="form-label">Nominal Pembayaran Bruto (IDR)</label>
            <CurrencyInput
              id="pay-gross"
              v-model="paymentForm.grossAmount"
              :min="1000"
              :max="selectedInvoiceForPayment.balanceDue"
              placeholder="0"
              required
            />
          </div>

          <div class="form-field">
            <label for="pay-fee" class="form-label">Potongan Biaya Provider / Merchant Fee (IDR)</label>
            <CurrencyInput
              id="pay-fee"
              v-model="paymentForm.feeAmount"
              :min="0"
              placeholder="0"
              required
            />
          </div>

          <div class="form-field">
            <label for="pay-ref" class="form-label">Nomor Referensi Transaksi</label>
            <input id="pay-ref" v-model="paymentForm.referenceNo" type="text" class="input" required />
          </div>
        </div>

        <div class="form-field">
          <label for="pay-idemp" class="form-label">Idempotency Key (Mencegah Pembayaran Ganda Saat Retry)</label>
          <input id="pay-idemp" v-model="paymentForm.idempotencyKey" type="text" class="input" required />
        </div>

        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="paymentModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Konfirmasi Pembayaran & Posting Jurnal</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Refund -->
    <ModalDialog :open="refundModalOpen" title="Proses Pengembalian Dana (Refund)" @close="refundModalOpen = false">
      <form v-if="selectedPaymentForRefund" @submit.prevent="submitRefund" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Merujuk ke Kuitansi Asal: <strong>{{ selectedPaymentForRefund.receiptNumber }}</strong>
          ({{ formatRupiah(selectedPaymentForRefund.grossAmount) }})
        </p>
        <div class="form-field">
          <label for="rfd-amt" class="form-label">Nominal Refund (IDR)</label>
          <CurrencyInput
            id="rfd-amt"
            v-model="refundForm.amount"
            :min="1000"
            :max="selectedPaymentForRefund.grossAmount"
            placeholder="0"
            required
          />
        </div>
        <div class="form-field">
          <label for="rfd-reason" class="form-label">Alasan Pengembalian Dana (Wajib)</label>
          <textarea id="rfd-reason" v-model="refundForm.reason" class="textarea" placeholder="Contoh: Pembatalan keikutsertaan 1 peserta sesuai surat resmi pelanggan." required></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="refundModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-danger">Proses Refund & Jurnal Koreksi</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Close Cashier Session -->
    <ModalDialog :open="closeSessionModalOpen" title="Penutupan Sesi Kasir (Closeout & Hitung Fisik)" @close="closeSessionModalOpen = false">
      <form v-if="selectedSessionForClose" @submit.prevent="submitCloseCashier" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Sesi: <strong>{{ selectedSessionForClose.sessionNumber }}</strong> |
          Saldo Teoritis Sistem: <strong class="money">{{ formatRupiah(selectedSessionForClose.theoreticalBalance) }}</strong>
        </p>
        <div class="form-field">
          <label for="csh-actual" class="form-label">Hasil Hitung Fisik Uang Tunai di Laci (IDR)</label>
          <CurrencyInput
            id="csh-actual"
            v-model="closeSessionForm.actualCountedCash"
            :min="0"
            placeholder="0"
            required
          />
        </div>
        <div class="form-field">
          <label for="csh-reason" class="form-label">Penjelasan Berita Acara / Alasan Selisih (Wajib bila ada selisih)</label>
          <textarea id="csh-reason" v-model="closeSessionForm.discrepancyReason" class="textarea" placeholder="Isi penjelasan apabila jumlah fisik berbeda dari saldo teoritis."></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="closeSessionModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Penutupan Kasir</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Cash Deposit -->
    <ModalDialog :open="depositModalOpen" title="Catat Setoran Tunai Kasir ke Bank" @close="depositModalOpen = false">
      <form @submit.prevent="submitDeposit" style="display: flex; flex-direction: column; gap: 12px">
        <div class="form-field">
          <label for="dep-bank" class="form-label">Rekening Bank Tujuan</label>
          <select id="dep-bank" v-model="depositForm.bankAccountId" class="select" required>
            <option v-for="b in bankAccounts" :key="b.id" :value="b.id">
              {{ b.bankName }} ({{ b.accountNumberMasked }})
            </option>
          </select>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="dep-amt" class="form-label">Nominal Setoran (IDR)</label>
            <CurrencyInput
              id="dep-amt"
              v-model="depositForm.amount"
              :min="1000"
              placeholder="0"
              required
            />
          </div>
          <div class="form-field">
            <label for="dep-ref" class="form-label">Nomor Slip Setoran Bank</label>
            <input id="dep-ref" v-model="depositForm.referenceNo" type="text" class="input" required />
          </div>
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="depositModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Setoran & Posting Jurnal</button>
        </div>
      </form>
    </ModalDialog>

    <!-- Modal: Update Product Price -->
    <ModalDialog :open="priceModalOpen" title="Perbarui Harga Katalog Layanan (Dengan Jejak Histori)" @close="priceModalOpen = false">
      <form v-if="selectedProductForPrice" @submit.prevent="submitPriceChange" style="display: flex; flex-direction: column; gap: 12px">
        <p>
          Layanan: <strong>{{ selectedProductForPrice.sku }} - {{ selectedProductForPrice.name }}</strong>
        </p>
        <div class="form-field">
          <label for="prc-new" class="form-label">Harga Satuan Baru (IDR)</label>
          <CurrencyInput
            id="prc-new"
            v-model="priceForm.newPrice"
            :min="1000"
            placeholder="0"
            required
          />
        </div>
        <div class="form-field">
          <label for="prc-reason" class="form-label">Alasan Penyesuaian Harga (Wajib)</label>
          <input id="prc-reason" v-model="priceForm.reason" type="text" class="input" placeholder="Contoh: Penyesuaian tarif kurikulum baru" required />
        </div>
        <div class="btn-row" style="justify-content: flex-end">
          <button type="button" class="btn btn-sm" @click="priceModalOpen = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary">Simpan Perubahan Harga</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>
