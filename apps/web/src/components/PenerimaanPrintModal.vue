<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { apiFetch } from '../services/api';
import { formatRupiah, formatDate } from '../utils/format';

export type PrintDocMode = 'INVOICE' | 'KUITANSI' | 'TANDA_TERIMA' | 'SURAT_PAJAK';

const props = defineProps<{
  open: boolean;
  mode: PrintDocMode;
  data: any;
  bankAccount?: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const signConfig = ref({
  managerTitle: 'Manajer Keuangan, Sumber Daya, dan Umum',
  managerName: 'Husain Husin Mamonto, S.M.',
  managerNip: 'NIP. 197506182003121002',
  headTitle: 'Plh. Kepala Pusat Bisnis dan Investasi',
  headName: 'Dr. Abdurrahman Rahim Thaha, M.A.B.',
  headNip: 'NIP. 198612162022031003',
  recipientTitle: 'Kepala Pusat Pengelolaan Keuangan, Universitas Terbuka',
  letterPrefix: 'UN31.PMO/KU',
  suratNomor: '',
});

async function syncMasterSignatory() {
  if (props.data?.signatory) {
    signConfig.value = {
      ...signConfig.value,
      ...props.data.signatory,
    };
  }
  try {
    const res = await apiFetch('/revenue/master/overview');
    const masterSign = res.data?.config?.signatory;
    if (masterSign) {
      signConfig.value = {
        ...signConfig.value,
        ...masterSign,
      };
    }
  } catch {
    // Keep existing signatory defaults if offline
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      syncMasterSignatory();
    }
  },
  { immediate: true }
);

function terbilang(angka: number): string {
  const n = Math.floor(Math.abs(Number(angka) || 0));
  if (n === 0) return 'Nol Rupiah';
  const s = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const sp = (num: number): string => {
    if (num < 12) return s[num];
    if (num < 20) return `${sp(num - 10)} Belas`;
    if (num < 100) return `${sp(Math.floor(num / 10))} Puluh ${sp(num % 10)}`.trim();
    if (num < 200) return `Seratus ${sp(num - 100)}`.trim();
    if (num < 1000) return `${sp(Math.floor(num / 100))} Ratus ${sp(num % 100)}`.trim();
    if (num < 2000) return `Seribu ${sp(num - 1000)}`.trim();
    if (num < 1000000) return `${sp(Math.floor(num / 1000))} Ribu ${sp(num % 1000)}`.trim();
    if (num < 1000000000) return `${sp(Math.floor(num / 1000000))} Juta ${sp(num % 1000000)}`.trim();
    if (num < 1000000000000) return `${sp(Math.floor(num / 1000000000))} Miliar ${sp(num % 1000000000)}`.trim();
    return `${sp(Math.floor(num / 1000000000000))} Triliun ${sp(num % 1000000000000)}`.trim();
  };
  return `${sp(n).replace(/\s+/g, ' ').trim()} Rupiah`;
}

function formatMethodText(method?: string): string {
  if (method === 'CASH') return 'Cash';
  if (method === 'VIRTUAL_ACCOUNT_SIMULATED') return 'Virtual Account';
  if (method === 'QRIS_SIMULATED') return 'QRIS';
  if (method === 'EDC_CARD') return 'Kartu EDC';
  return 'Transfer';
}

const modalTitle = computed(() => {
  if (props.mode === 'INVOICE') return `Pratinjau Invoice KU-003 (${props.data?.docNumber || ''})`;
  if (props.mode === 'TANDA_TERIMA') return `Pratinjau Tanda Terima KU-002 (${props.data?.receiptNumber || ''})`;
  if (props.mode === 'SURAT_PAJAK') return `Draft Surat Penarikan Dana Pajak (${props.data?.periodLabel || ''})`;
  return `Pratinjau Kuitansi KU-001 (${props.data?.receiptNumber || ''})`;
});

const invoiceBruto = computed(() => {
  if (!props.data) return 0;
  const nj = Number(props.data.nilaiJual || 0);
  const ppn = Number(props.data.ppnAmount || 0);
  const pb1 = Number(props.data.pb1Amount || 0);
  if (nj > 0 || ppn > 0 || pb1 > 0) return nj + ppn + pb1;
  return Number(props.data.totalAmount || 0);
});

const isKuitansiUm = computed(() => props.data?.receiptType === 'KUITANSI_UM' || props.data?.paymentStage === 'UANG_MUKA');

const requiresApproval = computed(
  () => props.mode === 'INVOICE' || props.mode === 'KUITANSI' || props.mode === 'TANDA_TERIMA'
);
const isApprovedToPrint = computed(
  () => !requiresApproval.value || !props.data?.approvalStatus || props.data.approvalStatus === 'APPROVED'
);
const approvalTimestampLabel = computed(() => {
  if (!props.data?.approvedAt) return '';
  try {
    return new Date(props.data.approvedAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
});

function printDocument() {
  if (!isApprovedToPrint.value) return;
  window.print();
}
</script>

<template>
  <ModalDialog :open="open" :title="modalTitle" maxWidth="860px" @close="emit('close')">
    <div v-if="data" class="print-sheet-shell">
      <div class="print-toolbar no-print">
        <span class="print-hint">Pejabat penandatangan &amp; rekening tujuan otomatis ditarik dari Master Data</span>
        <div class="print-actions">
          <input
            v-if="mode === 'SURAT_PAJAK'"
            v-model="signConfig.suratNomor"
            type="text"
            class="se-input"
            :placeholder="`No. Surat (cth: 732/${signConfig.letterPrefix || 'UN31.PMO/KU'}/2026)`"
          />
          <button type="button" class="btn-soft" @click="emit('close')">Tutup</button>
          <button
            type="button"
            class="btn-navy"
            :disabled="!isApprovedToPrint"
            :title="isApprovedToPrint ? 'Cetak atau Simpan PDF' : 'Dokumen belum disetujui Manajer Keuangan'"
            @click="printDocument"
          >
            {{ isApprovedToPrint ? 'Cetak / Simpan PDF' : 'Terkunci (Belum Disetujui)' }}
          </button>
        </div>
      </div>

      <div v-if="!isApprovedToPrint" class="approval-lock-banner no-print">
        <strong>Cetak Terkunci:</strong> Dokumen ini belum mendapat persetujuan (Approval) dari Manajer Keuangan sehingga tidak dapat dicetak atau diterbitkan resmi.
      </div>

      <!-- ==================== 1. INVOICE KU-003 ==================== -->
      <article v-if="mode === 'INVOICE'" class="paper-doc">
        <div class="paper-kop">
          <div>
            <div class="kop-org">PMO UTAMA · UNIVERSITAS TERBUKA</div>
            <div class="kop-sub">Jl. Cabe Raya, Pondok Cabe, Pamulang, Tangerang Selatan 15437</div>
          </div>
          <span class="kop-code">KU-003</span>
        </div>

        <div class="doc-head-center">
          <h2>INVOICE</h2>
          <div class="doc-num">{{ data.docNumber }}</div>
          <div v-if="data.status === 'VOID'" class="stamp-void">HANGUS / DIBATALKAN</div>
        </div>

        <div class="meta-grid">
          <div>
            <div class="meta-row"><span>Kepada Yth.</span><strong>{{ data.customer?.name }}</strong></div>
            <div v-if="data.customer?.taxIdNpwp" class="meta-row"><span>NPWP / KTP</span><span>{{ data.customer.taxIdNpwp }}</span></div>
            <div v-if="data.customer?.address" class="meta-row"><span>Alamat</span><span>{{ data.customer.address }}</span></div>
          </div>
          <div>
            <div class="meta-row"><span>Tanggal Terbit</span><span>{{ formatDate(data.issueDate) }}</span></div>
            <div class="meta-row"><span>Jatuh Tempo</span><span>{{ formatDate(data.dueDate) }}</span></div>
            <div class="meta-row"><span>Jenis / Unit</span><span>{{ data.invoiceType || 'PELUNASAN' }} · {{ data.businessUnit?.code }}</span></div>
            <div class="meta-row"><span>Faktur Pajak</span><span>Kode {{ data.fakturPajakCode || '040' }}</span></div>
          </div>
        </div>

        <div v-if="data.activityTitle" class="activity-box">
          <strong>Kegiatan:</strong> {{ data.activityTitle }}
          <span v-if="data.activityDate"> · Tanggal {{ data.activityDate }}</span>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th>Uraian</th>
              <th class="num">Volume</th>
              <th class="num">Harga Satuan</th>
              <th class="num">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in data.lines" :key="line.id">
              <td>{{ line.description }}</td>
              <td class="num money">
                {{ Number(line.quantity) }}
                <template v-if="Number(line.duration || 1) !== 1">
                  &times; {{ Number(line.duration) }}{{ line.durationUnit ? ` ${line.durationUnit}` : '' }}
                </template>
              </td>
              <td class="num money">{{ formatRupiah(line.unitPrice) }}</td>
              <td class="num money">{{ formatRupiah(line.lineTotal) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="tax-calc-box">
          <div class="calc-row"><span>Sub Total</span><strong class="money">{{ formatRupiah(data.subtotal) }}</strong></div>
          <div v-if="Number(data.discountAmount) > 0" class="calc-row">
            <span>Diskon {{ Number(data.discountPercent) > 0 ? `(${data.discountPercent}%)` : '' }}</span>
            <strong class="money">-{{ formatRupiah(data.discountAmount) }}</strong>
          </div>
          <div v-if="Number(data.dpPercent) > 0" class="calc-row">
            <span>Downpayment / Uang Muka ({{ Number(data.dpPercent) }}%)</span>
            <strong class="money">{{ formatRupiah(invoiceBruto) }}</strong>
          </div>
          <div v-if="Number(data.nilaiJual) > 0" class="calc-row">
            <span>Nilai Jual (DPP)</span><span class="money">{{ formatRupiah(data.nilaiJual) }}</span>
          </div>
          <div v-if="Number(data.dppPb1) > 0" class="calc-row">
            <span>DPP Pajak Daerah (10/11)</span><span class="money">{{ formatRupiah(data.dppPb1) }}</span>
          </div>
          <div v-if="Number(data.dppPpn) > 0" class="calc-row">
            <span>DPP PPN Nilai Lain (11/12)</span><span class="money">{{ formatRupiah(data.dppPpn) }}</span>
          </div>
          <div v-if="Number(data.ppnAmount) > 0" class="calc-row">
            <span>PPN (12% &times; DPP PPN)</span><span class="money">{{ formatRupiah(data.ppnAmount) }}</span>
          </div>
          <div v-if="Number(data.pb1Amount) > 0" class="calc-row">
            <span>Pajak Daerah / PB1 (10%)</span><span class="money">{{ formatRupiah(data.pb1Amount) }}</span>
          </div>
          <div v-if="Number(data.pph42Amount) > 0" class="calc-row">
            <span>PPh Pasal 4 ayat (2) (10%)</span><span class="money">{{ formatRupiah(data.pph42Amount) }}</span>
          </div>
          <div v-if="Number(data.pph23Amount) > 0" class="calc-row">
            <span>PPh Pasal 23 (2%)</span><span class="money">{{ formatRupiah(data.pph23Amount) }}</span>
          </div>
          <div v-if="Number(data.pph23Rate15Amount) > 0" class="calc-row">
            <span>PPh Pasal 23 (15%)</span><span class="money">{{ formatRupiah(data.pph23Rate15Amount) }}</span>
          </div>
          <div v-if="Number(data.pph21Amount) > 0" class="calc-row">
            <span>PPh Pasal 21 (5%)</span><span class="money">{{ formatRupiah(data.pph21Amount) }}</span>
          </div>
          <div class="calc-row grand">
            <span>{{ data.taxWithheldByCustomer ? 'Total Transfer Neto (Setelah Potong Pajak Klien)' : 'Grand Total' }}</span>
            <strong class="money">{{ formatRupiah(data.totalAmount) }}</strong>
          </div>
          <div v-if="data.taxWithheldByCustomer && invoiceBruto > Number(data.totalAmount)" class="calc-row muted">
            <span>Nilai Bruto Dokumen</span>
            <span class="money">{{ formatRupiah(invoiceBruto) }}</span>
          </div>
        </div>

        <div class="terbilang-box">
          Terbilang: <em>{{ terbilang(Number(data.totalAmount)) }}</em>
        </div>

        <div v-if="data.notes" class="notes-box">
          <strong>Catatan:</strong>
          <p>{{ data.notes }}</p>
        </div>

        <div class="bank-sign-grid">
          <div class="bank-box">
            <div class="box-title">Pembayaran Ditransfer Ke:</div>
            <div><strong>{{ bankAccount?.bankName || 'BANK MANDIRI' }}</strong></div>
            <div>Atas Nama: <strong>{{ bankAccount?.accountHolder || 'PTNBH UT .USAHA NON AKADEMIK' }}</strong></div>
            <div>No. Rekening: <strong>{{ bankAccount?.accountNumberMasked || '164-00-2022-999-5' }}</strong></div>
          </div>
          <div class="sign-box">
            <div>Tangerang Selatan, {{ formatDate(data.issueDate) }}</div>
            <div>Menyetujui,</div>
            <div>{{ signConfig.managerTitle }}</div>
            <div>PMO UTama Universitas Terbuka</div>
            <div v-if="data.approvedByName" class="e-approval-stamp">
              <span>Disetujui Elektronik</span>
              <small>{{ data.approvedByName }}<template v-if="approvalTimestampLabel"> · {{ approvalTimestampLabel }}</template></small>
            </div>
            <div v-else class="sign-space"></div>
            <strong>{{ signConfig.managerName }}</strong>
            <div class="sign-nip">{{ signConfig.managerNip }}</div>
          </div>
        </div>
      </article>

      <!-- ==================== 2. KUITANSI KU-001 (PELUNASAN & UANG MUKA) ==================== -->
      <article v-else-if="mode === 'KUITANSI'" class="paper-doc">
        <div class="paper-kop">
          <div>
            <div class="kop-org">PMO UTAMA · UNIVERSITAS TERBUKA</div>
            <div class="kop-sub">Jl. Cabe Raya, Pondok Cabe, Pamulang, Tangerang Selatan 15437</div>
          </div>
          <span class="kop-code">KU-001</span>
        </div>

        <div class="doc-head-center">
          <h2>{{ isKuitansiUm ? 'K U I T A N S I   U A N G   M U K A' : 'K U I T A N S I' }}</h2>
          <div class="doc-num">{{ data.receiptNumber }}</div>
        </div>

        <div class="kuitansi-rows">
          <div class="k-row"><span>Sudah Terima Dari</span><strong>: {{ data.payerName }}</strong></div>
          <div v-if="data.payerAddress" class="k-row"><span>Alamat</span><span>: {{ data.payerAddress }}</span></div>
          <div class="k-row"><span>Jumlah</span><strong class="money">: {{ formatRupiah(data.bankReceivedAmount || data.grossAmount) }}</strong></div>
          <div class="k-row"><span>Banyaknya Uang</span><em>: {{ terbilang(Number(data.bankReceivedAmount || data.grossAmount)) }}</em></div>
          <div class="k-row">
            <span>Untuk Pembayaran</span>
            <div>
              : <strong>{{ data.activityTitle }}</strong>
              <div v-if="data.activityDate" class="k-sub">Tanggal {{ data.activityDate }} di Universitas Terbuka</div>
              <div class="k-sub">{{ data.rincianLabel }} · COA {{ data.revenueAccountCode }}</div>
              <div v-if="data.invoiceDocNumber" class="k-sub">Referensi Invoice: {{ data.invoiceDocNumber }}</div>
            </div>
          </div>
        </div>

        <!-- Official Keterangan Block: DP / Pelunasan / Sisa -->
        <div class="kuitansi-summary">
          <div class="ks-title">Keterangan:</div>
          <template v-if="isKuitansiUm">
            <div class="ks-row">
              <span>Rincian Awal</span>
              <span class="money">{{ formatRupiah(data.invoiceTotalAmount || data.brutoDocumentAmount || data.bankReceivedAmount) }}</span>
            </div>
            <div class="ks-row">
              <span>Uang Muka / DP ({{ formatMethodText(data.method) }} {{ formatDate(data.paymentDate) }})</span>
              <strong class="money">{{ formatRupiah(data.bankReceivedAmount || data.grossAmount) }}</strong>
            </div>
            <div class="ks-row">
              <span>Sisa Pembayaran</span>
              <strong class="money">{{ formatRupiah(data.invoiceBalanceDue || 0) }}</strong>
            </div>
          </template>
          <template v-else>
            <div class="ks-row">
              <span>Rincian Akhir</span>
              <span class="money">{{ formatRupiah(data.invoiceTotalAmount || data.brutoDocumentAmount || data.bankReceivedAmount) }}</span>
            </div>
            <div class="ks-row">
              <span>Uang Muka / DP Sebelumnya</span>
              <span class="money">{{ formatRupiah(data.invoicePreviousPaidAmount || 0) }}</span>
            </div>
            <div class="ks-row">
              <span>Pelunasan ({{ formatMethodText(data.method) }} {{ formatDate(data.paymentDate) }})</span>
              <strong class="money">{{ formatRupiah(data.bankReceivedAmount || data.grossAmount) }}</strong>
            </div>
            <div v-if="Number(data.invoiceBalanceDue) > 0" class="ks-row">
              <span>Sisa Tagihan Invoice</span>
              <strong class="money">{{ formatRupiah(data.invoiceBalanceDue) }}</strong>
            </div>
          </template>
          <div v-if="Number(data.overpaymentAmount) > 0" class="ks-row warn">
            <span>Kelebihan Bayar (Pengembalian Dana)</span>
            <strong class="money">{{ formatRupiah(data.overpaymentAmount) }}</strong>
          </div>
        </div>

        <div class="bank-sign-grid">
          <div class="bank-box">
            <div>*Harga Sudah Termasuk Pajak sesuai ketentuan PTNBH UT</div>
            <div>Ref Bank: <strong>{{ data.referenceNo }}</strong></div>
            <div>Rekening: {{ data.bankName || bankAccount?.bankName || 'Bank Mandiri Final (164-00-2022-999-5)' }}</div>
            <div v-if="data.withholdingSlipNo">Bukti Potong: <strong>{{ data.withholdingSlipNo }}</strong></div>
          </div>
          <div class="sign-box">
            <div>Tangerang Selatan, {{ formatDate(data.paymentDate) }}</div>
            <div>{{ signConfig.managerTitle }}</div>
            <div>PMO UTama Universitas Terbuka</div>
            <div v-if="data.approvedByName" class="e-approval-stamp">
              <span>Disetujui Elektronik</span>
              <small>{{ data.approvedByName }}<template v-if="approvalTimestampLabel"> · {{ approvalTimestampLabel }}</template></small>
            </div>
            <div v-else class="sign-space"></div>
            <strong>{{ signConfig.managerName }}</strong>
            <div class="sign-nip">{{ signConfig.managerNip }}</div>
          </div>
        </div>
      </article>

      <!-- ==================== 3. TANDA TERIMA KU-002 (2 BLOK TANDA TANGAN) ==================== -->
      <article v-else-if="mode === 'TANDA_TERIMA'" class="paper-doc">
        <div class="paper-kop">
          <div>
            <div class="kop-org">PMO UTAMA · UNIVERSITAS TERBUKA</div>
            <div class="kop-sub">Tanda Terima Penerimaan Kamar Wisma &amp; Layanan Internal Satker UT</div>
          </div>
          <span class="kop-code">KU-002</span>
        </div>

        <div class="doc-head-center">
          <h2>TANDA TERIMA</h2>
          <div class="doc-num">{{ data.receiptNumber }}</div>
        </div>

        <div class="kuitansi-rows">
          <div class="k-row">
            <span>Sudah Terima Dari</span>
            <div>
              <strong>: {{ data.payerName }}</strong>
              <div v-if="data.taxCollectorProfile === 'INTERNAL_UT' || data.subCategory === 'Internal UT'" class="k-sub">
                Satker Universitas Terbuka
              </div>
            </div>
          </div>
          <div class="k-row"><span>Banyaknya Uang</span><em>: {{ terbilang(Number(data.bankReceivedAmount || data.grossAmount)) }}</em></div>
          <div class="k-row">
            <span>Untuk Pembayaran</span>
            <div>
              : <strong>{{ data.activityTitle }}</strong>
              <div v-if="data.activityDate" class="k-sub">Tanggal {{ data.activityDate }}</div>
              <div v-if="data.invoiceDocNumber" class="k-sub">No. Invoice: {{ data.invoiceDocNumber }}</div>
              <div class="k-sub">{{ data.rincianLabel }} · Diterimakan</div>
            </div>
          </div>
          <div class="k-row"><span>Jumlah</span><strong class="money">: {{ formatRupiah(data.bankReceivedAmount || data.grossAmount) }}</strong></div>
        </div>

        <div class="tt-sign-grid">
          <div class="sign-box">
            <div>&nbsp;</div>
            <div>Yang Menerima,</div>
            <div v-if="data.approvedByName" class="e-approval-stamp">
              <span>Disetujui Elektronik</span>
              <small>{{ data.approvedByName }}<template v-if="approvalTimestampLabel"> · {{ approvalTimestampLabel }}</template></small>
            </div>
            <div v-else class="sign-space"></div>
            <strong>{{ signConfig.managerName }}</strong>
            <div class="sign-nip">{{ signConfig.managerNip }}</div>
          </div>
          <div class="sign-box">
            <div>Tangsel, {{ formatDate(data.paymentDate) }}</div>
            <div>Yang Menyerahkan,</div>
            <div class="sign-space"></div>
            <strong>{{ data.payerName }}</strong>
          </div>
        </div>

        <div class="tt-foot-note">
          *{{ formatMethodText(data.method) }} ({{ formatDate(data.paymentDate) }}) · Ref: {{ data.referenceNo }}
        </div>
      </article>

      <!-- ==================== 4. SURAT PENARIKAN DANA PAJAK BULANAN ==================== -->
      <article v-else-if="mode === 'SURAT_PAJAK'" class="paper-doc">
        <div class="paper-kop">
          <div>
            <div class="kop-org">PMO UTAMA · UNIVERSITAS TERBUKA</div>
            <div class="kop-sub">Permohonan Penarikan Dana Pajak {{ data.bankFilterLabel || 'Penerimaan Bulanan' }}</div>
          </div>
          <span class="kop-code">PAJAK PTNBH</span>
        </div>

        <div class="meta-grid" style="margin-top: 14px;">
          <div>
            <div class="meta-row"><span>Nomor</span><strong>{{ signConfig.suratNomor || `......./${signConfig.letterPrefix || 'UN31.PMO/KU'}/2026` }}</strong></div>
            <div class="meta-row"><span>Lamp.</span><span>1 Lampiran (Perincian + Pajak)</span></div>
            <div class="meta-row"><span>Hal</span><strong>Permohonan Penarikan Dana Pajak {{ data.bankFilterLabel || 'Bank Mandiri' }} Bulan {{ data.periodLabel }}</strong></div>
          </div>
          <div>
            <div class="meta-row"><span>Kepada Yth.</span><strong>{{ signConfig.recipientTitle || 'Kepala Pusat Pengelolaan Keuangan, Universitas Terbuka' }}</strong></div>
            <div class="meta-row"><span>Rekening Sumber</span><span>{{ data.sourceBankAccountNo || '164-00-2022-999-5' }}</span></div>
          </div>
        </div>

        <p class="letter-body">
          Bersama ini kami menyampaikan permohonan penarikan dana pajak penerimaan periode
          <strong>{{ data.periodLabel }}</strong> yang terdapat pada rekening
          <strong>{{ data.sourceBankLabel || 'Bank Mandiri (Final)' }} No. {{ data.sourceBankAccountNo || '164-00-2022-999-5' }}</strong>
          atas nama <strong>{{ data.sourceBankAccountHolder || 'PTNBH UT .USAHA NON AKADEMIK' }}</strong>,
          dengan rincian per kode COA sebagai berikut:
        </p>

        <table class="doc-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Keterangan</th>
              <th class="num">Pengembalian Dana</th>
              <th v-for="coa in data.coaColumns" :key="coa" class="num">COA {{ coa }}</th>
              <th class="num">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in data.rows" :key="row.label">
              <td>{{ idx + 1 }}</td>
              <td>{{ row.label }}</td>
              <td class="num money">{{ row.refundAmount > 0 ? formatRupiah(row.refundAmount) : '-' }}</td>
              <td v-for="coa in data.coaColumns" :key="coa" class="num money">{{ formatRupiah(row.byCoa[coa] || 0) }}</td>
              <td class="num money"><strong>{{ formatRupiah(row.total) }}</strong></td>
            </tr>
            <tr class="total-line">
              <td colspan="2"><strong>TOTAL PENARIKAN DANA PAJAK</strong></td>
              <td class="num money"><strong>{{ formatRupiah(data.totalOverpaymentRefund || 0) }}</strong></td>
              <td v-for="coa in data.coaColumns" :key="coa" class="num money">
                <strong>{{ formatRupiah(data.rows.reduce((s: number, r: any) => s + (r.byCoa[coa] || 0), 0)) }}</strong>
              </td>
              <td class="num money"><strong>{{ formatRupiah(data.totalTaxWithdrawal) }}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="terbilang-box">
          Terbilang Pajak: <em>{{ data.terbilangTaxWithdrawal || terbilang(Number(data.totalTaxWithdrawal)) }}</em>
        </div>

        <div class="letter-points">
          <p>Penarikan dana tersebut dilakukan karena terdapat:</p>
          <ol>
            <li>
              Penarikan uang pajak sebesar <strong>{{ formatRupiah(data.totalTaxWithdrawal) }}</strong>
              (<em>{{ data.terbilangTaxWithdrawal || terbilang(Number(data.totalTaxWithdrawal)) }}</em>)
              sesuai tabel di atas yang kami mohon untuk ditransfer ke rekening
              <strong>{{ data.targetTaxBankLabel || 'Bank BRI' }} No. {{ data.targetTaxAccountNo || '1173.01.000574.30.4' }}</strong>
              atas nama <strong>{{ data.targetTaxAccountHolder || 'PTNBH UT NON PPh 21' }}</strong> untuk pembayaran pajak.
              Sedangkan pendapatan bersih tetap berada di rekening
              <strong>{{ data.sourceBankAccountNo || '164-00-2022-999-5' }} a.n. {{ data.sourceBankAccountHolder || 'PTNBH UT .USAHA NON AKADEMIK' }}</strong>.
            </li>
            <li v-if="data.overpaymentItems?.length > 0">
              Pengembalian dana / lebih bayar sebesar <strong>{{ formatRupiah(data.totalOverpaymentRefund) }}</strong> dengan rincian:
              <ul class="refund-list">
                <li v-for="ov in data.overpaymentItems" :key="ov.receiptNumber">
                  <strong>{{ ov.payerName }}</strong> ({{ ov.receiptNumber }} · {{ ov.activityTitle }}):
                  <strong>{{ formatRupiah(ov.amount) }}</strong>
                  <template v-if="ov.refundAccountNumber">
                    &rarr; Rekening {{ ov.refundBankName || 'Bank' }} No. <strong>{{ ov.refundAccountNumber }}</strong> a.n. {{ ov.refundAccountHolder || ov.payerName }}
                  </template>
                </li>
              </ul>
            </li>
          </ol>
        </div>

        <div v-if="data.excludedCount > 0" class="notes-box">
          <strong>Catatan:</strong> {{ data.excludedCount }} transaksi dikecualikan dari penarikan pajak karena dipotong langsung oleh klien (FP 020/030) atau sudah diolah di rekening tampungan bulan sebelumnya.
        </div>

        <div class="bank-sign-grid">
          <div></div>
          <div class="sign-box">
            <div>Tangerang Selatan, {{ formatDate(new Date().toISOString()) }}</div>
            <div>{{ signConfig.headTitle }}</div>
            <div>Universitas Terbuka,</div>
            <div class="sign-space"></div>
            <strong>{{ signConfig.headName }}</strong>
            <div class="sign-nip">{{ signConfig.headNip }}</div>
          </div>
        </div>
      </article>
    </div>
  </ModalDialog>
</template>

<style scoped>
.print-sheet-shell { display: flex; flex-direction: column; gap: 14px; }
.print-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 10px 14px; border-radius: 12px; background: #f8fafc;
}
.print-hint { font-size: 0.78rem; color: #64748b; }
.print-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-soft {
  border: none; border-radius: 9999px; padding: 7px 14px; background: #e2e8f0; color: #0f172a;
  font-size: 0.78rem; font-weight: 600; cursor: pointer;
}
.btn-navy {
  border: none; border-radius: 9999px; padding: 7px 16px; background: #0b2144; color: #ffffff;
  font-size: 0.78rem; font-weight: 600; cursor: pointer;
}

.sign-editor-bar {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px;
  padding: 12px 14px; border-radius: 12px; background: #eff6ff; border: 1px solid #bfdbfe;
}
.se-field { display: flex; flex-direction: column; gap: 3px; }
.se-field label { font-size: 0.7rem; font-weight: 700; color: #034693; }
.se-input {
  padding: 6px 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff;
  color: #0f172a; font-size: 0.78rem;
}

.paper-doc {
  background: #ffffff; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 14px;
  padding: 26px 28px; font-size: 0.84rem; line-height: 1.5;
}
.paper-kop {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding-bottom: 12px; border-bottom: 2px solid #0b2144;
}
.kop-org { font-size: 1.02rem; font-weight: 800; color: #0b2144; letter-spacing: 0.02em; }
.kop-sub { font-size: 0.74rem; color: #64748b; margin-top: 2px; }
.kop-code {
  font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 9999px;
  background: #eff6ff; color: #034693;
}
.doc-head-center { text-align: center; margin: 16px 0 14px; }
.doc-head-center h2 { margin: 0; font-size: 1.18rem; font-weight: 800; letter-spacing: 0.08em; color: #0b2144; }
.doc-num { font-family: ui-monospace, monospace; font-size: 0.84rem; color: #334155; margin-top: 2px; }
.stamp-void {
  display: inline-block; margin-top: 6px; padding: 3px 12px; border: 2px solid #dc2626;
  color: #dc2626; font-weight: 800; border-radius: 6px; font-size: 0.78rem;
}

.meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 12px; }
.meta-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; font-size: 0.8rem; }
.meta-row span:first-child { color: #64748b; flex-shrink: 0; }

.activity-box {
  padding: 8px 12px; border-radius: 10px; background: #f8fafc; margin-bottom: 12px; font-size: 0.82rem;
}

.doc-table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
.doc-table th {
  text-align: left; font-size: 0.73rem; font-weight: 700; color: #ffffff; background: #0b2144; padding: 8px 10px;
}
.doc-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.79rem; }
.doc-table .num { text-align: right; white-space: nowrap; }
.doc-table .total-line td { background: #eff6ff; border-top: 2px solid #0b2144; }

.tax-calc-box {
  margin-left: auto; max-width: 400px; display: flex; flex-direction: column; gap: 4px;
  padding: 12px 14px; border-radius: 12px; background: #f8fafc;
}
.calc-row { display: flex; justify-content: space-between; gap: 12px; font-size: 0.8rem; }
.calc-row.grand {
  margin-top: 6px; padding-top: 8px; border-top: 1.5px solid #0b2144; font-size: 0.92rem; color: #0b2144;
}
.calc-row.muted { color: #64748b; font-size: 0.76rem; }

.terbilang-box {
  margin-top: 12px; padding: 8px 12px; border-radius: 10px; background: #eff6ff; color: #034693; font-size: 0.82rem;
}
.notes-box {
  margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #f8fafc; font-size: 0.78rem; color: #334155;
}
.notes-box p { margin: 4px 0 0; }
.letter-points { margin-top: 12px; font-size: 0.81rem; color: #1e293b; }
.letter-points p { margin: 0 0 6px; font-weight: 600; }
.letter-points ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.refund-list { margin: 4px 0 0; padding-left: 18px; }

.kuitansi-rows { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.k-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px; font-size: 0.84rem; }
.k-sub { font-size: 0.76rem; color: #64748b; margin-top: 2px; padding-left: 10px; }

.kuitansi-summary {
  margin: 14px 0; padding: 12px 14px; border-radius: 12px; background: #f8fafc;
  display: flex; flex-direction: column; gap: 5px;
}
.ks-title { font-size: 0.76rem; font-weight: 700; color: #475569; margin-bottom: 2px; }
.ks-row { display: flex; justify-content: space-between; font-size: 0.82rem; }
.ks-row.warn { color: #b45309; }

.letter-body { margin: 12px 0; font-size: 0.83rem; }

.bank-sign-grid {
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px;
  margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0;
}
.tt-sign-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px;
  margin-top: 22px; padding-top: 14px; border-top: 1px solid #e2e8f0;
}
.tt-foot-note { margin-top: 14px; font-size: 0.76rem; color: #475569; font-style: italic; }
.bank-box { font-size: 0.78rem; display: flex; flex-direction: column; gap: 3px; }
.box-title { font-weight: 700; color: #0b2144; margin-bottom: 2px; }
.sign-box { text-align: center; font-size: 0.8rem; }
.sign-space { height: 54px; }
.sign-nip { font-size: 0.74rem; color: #475569; margin-top: 2px; }
.btn-navy:disabled { opacity: 0.45; cursor: not-allowed; background: #94a3b8; }
.approval-lock-banner {
  padding: 10px 14px; border-radius: 12px; background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; font-size: 0.8rem;
}
.e-approval-stamp {
  margin: 10px auto; padding: 6px 10px; max-width: 240px; border-radius: 8px;
  border: 1px dashed #15803d; background: #f0fdf4; color: #166534;
  display: flex; flex-direction: column; gap: 2px;
}
.e-approval-stamp span { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.e-approval-stamp small { font-size: 0.68rem; color: #15803d; }

@media (max-width: 680px) {
  .meta-grid, .bank-sign-grid, .tt-sign-grid { grid-template-columns: 1fr; }
  .k-row { grid-template-columns: 1fr; gap: 2px; }
}
@media print {
  .no-print { display: none !important; }
  .paper-doc { border: none; padding: 0; }
}
</style>
