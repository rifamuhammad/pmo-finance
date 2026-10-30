<template>
  <div class="reports-strategy-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Laporan Keuangan & Evaluasi Strategis</h1>
        <p class="page-desc">
          Konsolidasi Laba Rugi, Posisi Keuangan (Neraca), Arus Kas, dan evaluasi capaian periode untuk penentuan plafon berikutnya.
        </p>
      </div>
      <div class="btn-row">
        <button
          v-if="auth.hasPermission('report:export')"
          type="button"
          class="btn btn-sm"
          @click="exportCsv('budget-vs-actual')"
        >
          Ekspor CSV Anggaran vs Aktual
        </button>
        <button
          v-if="auth.hasPermission('report:export')"
          type="button"
          class="btn btn-sm"
          @click="exportCsv('journals')"
        >
          Ekspor CSV Jurnal
        </button>
        <button
          v-if="auth.hasPermission('strategy:manage')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="showCreateEvalModal = true"
        >
          + Buat Evaluasi Periode
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
      v-if="actionError"
      variant="danger"
      title="Peringatan Laporan"
      :message="actionError"
      @dismiss="actionError = ''"
    />

    <div class="tab-bar" role="tablist" style="margin-bottom: 20px;">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'financial' }"
        @click="activeTab = 'financial'"
      >
        1. Laporan Keuangan &amp; Realisasi Anggaran
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'strategy' }"
        @click="activeTab = 'strategy'"
      >
        2. Evaluasi Strategis &amp; Plafon Berikutnya ({{ evaluations.length }})
      </button>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Menyusun Laporan Keuangan & Evaluasi Strategis"
      message="Mengagregasi laba rugi, neraca, arus kas, realisasi anggaran, dan dokumen evaluasi strategis..."
    />
    <StateBanner
      v-else-if="error"
      state="error"
      title="Gagal Memuat Laporan"
      :message="error"
      actionLabel="Coba Lagi"
      @action="loadAll"
    />

    <template v-if="!loading && !error && financial">
      <!-- TAB 1: CONSOLIDATED FINANCIAL STATEMENTS -->
      <div v-if="activeTab === 'financial'" class="erp-stack">
        <div class="erp-card erp-card-pad erp-row-between">
          <div>
            <span class="erp-badge erp-badge-demo">LAPORAN KEUANGAN KONSOLIDASI [DATA DEMO]</span>
            <h2 class="erp-section-title" style="margin-top: 6px;">
              Ringkasan Laba Rugi, Posisi Keuangan (Neraca), dan Arus Kas
            </h2>
            <p class="erp-subtitle">
              Disusun otomatis dari jurnal terposting dan realisasi anggaran per unit kerja PMO Utama.
            </p>
          </div>
          <div class="erp-row">
            <select v-model="selectedUnitId" class="erp-select" style="min-width: 240px;" aria-label="Filter Unit Bisnis" @change="loadAll">
              <option value="">Konsolidasi Semua Unit Bisnis</option>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
        </div>

        <div class="erp-kpi-grid">
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Pendapatan Usaha (Laba Rugi)</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.incomeStatement.totalRevenue) }}</span>
            <span class="erp-kpi-sub">Akun kelompok 4xxx terposting</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Beban Operasional &amp; Pokok</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.incomeStatement.totalExpense) }}</span>
            <span class="erp-kpi-sub">Akun kelompok 5xxx terposting</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Laba / (Rugi) Bersih Periode Berjalan</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.incomeStatement.netIncome) }}</span>
            <span class="erp-kpi-sub">Surplus operasional sebelum pajak korporasi</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Arus Kas Bersih Operasional (Cashflow)</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.cashFlowStatement.netOperatingCashFlow) }}</span>
            <span class="erp-kpi-sub">
              Kas masuk {{ formatIdr(financial.cashFlowStatement.cashInFromCustomers) }} vs Kas keluar {{ formatIdr(financial.cashFlowStatement.cashOutForExpenses) }}
            </span>
          </div>
        </div>

        <div class="erp-grid-2">
          <!-- Income Statement -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <h3 class="erp-section-title">Laporan Laba Rugi (Income Statement)</h3>
                <p class="erp-subtitle">Pendapatan dan beban berdasarkan akun buku besar</p>
              </div>
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Akun</th>
                    <th>Kelompok</th>
                    <th class="num">Saldo (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="acc in financial.incomeStatement.revenueAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-success">PENDAPATAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr v-for="acc in financial.incomeStatement.expenseAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-warning">BEBAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="3">LABA / (RUGI) BERSIH PERIODE BERJALAN</td>
                    <td class="num">{{ formatIdr(financial.incomeStatement.netIncome) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Balance Sheet -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <h3 class="erp-section-title">Laporan Posisi Keuangan (Neraca)</h3>
                <p class="erp-subtitle">Aset = Liabilitas + Ekuitas (termasuk laba berjalan)</p>
              </div>
              <StatusBadge :status="financial.balanceSheet.isBalanced ? 'MATCHED' : 'DISCREPANCY'" />
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Akun</th>
                    <th>Posisi</th>
                    <th class="num">Nilai Tercatat (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="acc in financial.balanceSheet.assetAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-info">ASET</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr v-for="acc in financial.balanceSheet.liabilityAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-warning">LIABILITAS</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr v-for="acc in financial.balanceSheet.equityAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-neutral">EKUITAS</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr>
                    <td><code>3999</code></td>
                    <td style="font-weight: 600;">Laba / Surplus Periode Berjalan</td>
                    <td><span class="erp-badge erp-badge-neutral">EKUITAS</span></td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.currentPeriodEarnings) }}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="3">TOTAL ASET</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalAssets) }}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="3">TOTAL LIABILITAS &amp; EKUITAS</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalLiabilitiesAndEquity) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Budget vs Actual Table -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Laporan Realisasi Anggaran vs Komitmen vs Aktual</h3>
              <p class="erp-subtitle">Rincian daya serap anggaran per mata anggaran dan cost center</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Dokumen</th>
                  <th>Unit Bisnis</th>
                  <th>Cost Center</th>
                  <th>Kategori</th>
                  <th>Mata Anggaran</th>
                  <th class="num">Plafon Alokasi</th>
                  <th class="num">Komitmen PR/PO</th>
                  <th class="num">Aktual Beban</th>
                  <th class="num">Sisa Tersedia</th>
                  <th class="num">Serapan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in financial.budgetVsActualRows" :key="idx">
                  <td><code>{{ row.budgetDocNumber }}</code></td>
                  <td>{{ row.unitName }}</td>
                  <td><code>{{ row.costCenterCode }}</code></td>
                  <td><span class="erp-badge erp-badge-neutral">{{ row.category }}</span></td>
                  <td style="font-weight: 600;">{{ row.description }}</td>
                  <td class="num">{{ formatIdr(row.allocated) }}</td>
                  <td class="num">{{ formatIdr(row.committed) }}</td>
                  <td class="num">{{ formatIdr(row.actual) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(row.available) }}</td>
                  <td class="num">{{ row.absorptionRate }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 2: STRATEGIC EVALUATION & NEXT-PERIOD BUDGET CEILING -->
      <div v-if="activeTab === 'strategy'" class="erp-stack">
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <span class="erp-badge erp-badge-info">MODUL 11: EVALUASI STRATEGIS &amp; PERENCANAAN</span>
              <h3 class="erp-section-title" style="margin-top: 4px;">
                Evaluasi Kinerja Keuangan Unit &amp; Penetapan Plafon Periode Berikutnya
              </h3>
              <p class="erp-subtitle">
                Menghubungkan realisasi anggaran, pendapatan, dan arus kas dengan keputusan plafon periode selanjutnya oleh GM PMO.
              </p>
            </div>
          </div>

          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Evaluasi</th>
                  <th>Periode &amp; Unit</th>
                  <th class="num">Target vs Realisasi Pendapatan</th>
                  <th class="num">Plafon vs Aktual Pengeluaran</th>
                  <th class="num">Rekomendasi Plafon Berikutnya</th>
                  <th>Analisis Selisih &amp; Risiko</th>
                  <th>Keputusan GM PMO</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ev in evaluations" :key="ev.id">
                  <td><code>{{ ev.evalNumber }}</code></td>
                  <td>
                    <div style="font-weight: 600;">{{ ev.businessUnit?.name }}</div>
                    <code style="font-size: 0.75rem;">{{ ev.fiscalPeriod?.code }}</code>
                  </td>
                  <td class="num">
                    <div>Target: {{ formatIdr(ev.targetRevenue) }}</div>
                    <div style="font-weight: 700;">Aktual: {{ formatIdr(ev.actualRevenue) }}</div>
                  </td>
                  <td class="num">
                    <div>Plafon: {{ formatIdr(ev.budgetCeiling) }}</div>
                    <div style="font-weight: 700;">Aktual: {{ formatIdr(ev.actualExpense) }}</div>
                  </td>
                  <td class="num">
                    <div style="font-weight: 700; color: var(--brand-primary);">
                      Plafon: {{ formatIdr(ev.recommendedNextCeiling) }}
                    </div>
                    <div style="font-size: 0.76rem;">
                      Target Rev: {{ formatIdr(ev.recommendedRevenueTarget) }}
                    </div>
                  </td>
                  <td style="max-width: 280px;">
                    <div style="font-size: 0.82rem;"><strong>Selisih:</strong> {{ ev.varianceAnalysis }}</div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;">
                      <strong>Risiko:</strong> {{ ev.riskSummary }}
                    </div>
                    <div v-if="ev.gmDecisionNote" style="font-size: 0.78rem; color: var(--info-text); margin-top: 4px;">
                      <strong>Catatan GM ({{ ev.decidedByName }}):</strong> {{ ev.gmDecisionNote }}
                    </div>
                  </td>
                  <td><StatusBadge :status="ev.gmDecision" /></td>
                  <td>
                    <button
                      v-if="auth.user?.roleCode === 'GM_PMO'"
                      type="button"
                      class="erp-btn erp-btn-primary erp-btn-sm"
                      @click="openDecideModal(ev)"
                    >
                      Putuskan Plafon
                    </button>
                    <span v-else class="erp-subtitle">Wewenang GM PMO</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <!-- MODAL: CREATE STRATEGIC EVALUATION -->
    <ModalDialog :open="showCreateEvalModal" title="Susun Evaluasi Strategis Periode & Rekomendasi Plafon" @close="showCreateEvalModal = false">
      <form class="erp-stack" @submit.prevent="submitCreateEval">
        <div class="erp-grid-2">
          <div class="erp-field">
            <label class="erp-label" for="ev-period">Periode Fiskal</label>
            <select id="ev-period" v-model="evalForm.fiscalPeriodId" class="erp-select" required>
              <option v-for="fp in fiscalPeriods" :key="fp.id" :value="fp.id">{{ fp.code }} - {{ fp.name }}</option>
            </select>
          </div>
          <div class="erp-field">
            <label class="erp-label" for="ev-unit">Unit Bisnis</label>
            <select id="ev-unit" v-model="evalForm.businessUnitId" class="erp-select" required>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
        </div>
        <div class="erp-field">
          <label class="erp-label" for="ev-var">Analisis Selisih Anggaran &amp; Pendapatan (Variance Analysis)</label>
          <textarea
            id="ev-var"
            v-model="evalForm.varianceAnalysis"
            class="erp-textarea"
            placeholder="Jelaskan penyebab deviasi serapan anggaran dan pencapaian target pendapatan..."
            required
          ></textarea>
        </div>
        <div class="erp-field">
          <label class="erp-label" for="ev-risk">Ringkasan Risiko &amp; Kendala Operasional</label>
          <textarea
            id="ev-risk"
            v-model="evalForm.riskSummary"
            class="erp-textarea"
            placeholder="Uraikan risiko piutang macet, pembengkakan biaya, atau kebutuhan investasi baru..."
            required
          ></textarea>
        </div>
        <div class="erp-grid-2">
          <div class="erp-field">
            <label class="erp-label" for="ev-ceil">Rekomendasi Plafon Anggaran Berikutnya (IDR)</label>
            <input id="ev-ceil" v-model.number="evalForm.recommendedNextCeiling" type="number" min="1000000" class="erp-input" required />
          </div>
          <div class="erp-field">
            <label class="erp-label" for="ev-rev">Rekomendasi Target Pendapatan Berikutnya (IDR)</label>
            <input id="ev-rev" v-model.number="evalForm.recommendedRevenueTarget" type="number" min="1000000" class="erp-input" required />
          </div>
        </div>
        <div class="erp-row" style="justify-content: flex-end;">
          <button type="button" class="erp-btn erp-btn-secondary" @click="showCreateEvalModal = false">Batal</button>
          <button type="submit" class="erp-btn erp-btn-primary" :disabled="submitting">Simpan Evaluasi Strategis</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL: GM PMO DECISION ON EVALUATION -->
    <ModalDialog
      :open="Boolean(decideTarget)"
      :title="`Keputusan Strategis GM PMO: ${decideTarget?.evalNumber || ''}`"
      @close="decideTarget = null"
    >
      <form class="erp-stack" @submit.prevent="submitGmDecision">
        <div class="erp-field">
          <label class="erp-label" for="gm-dec">Status Keputusan GM PMO</label>
          <select id="gm-dec" v-model="decideForm.decision" class="erp-select" required>
            <option value="APPROVED">APPROVED (Setujui Plafon Periode Berikutnya)</option>
            <option value="REVISION_REQUIRED">REVISION_REQUIRED (Minta Revisi Analisis)</option>
            <option value="REJECTED">REJECTED (Tolak Usulan Plafon)</option>
          </select>
        </div>
        <div class="erp-grid-2">
          <div class="erp-field">
            <label class="erp-label" for="gm-ceil">Penyesuaian Plafon Anggaran Berikutnya (IDR)</label>
            <input id="gm-ceil" v-model.number="decideForm.adjustedNextCeiling" type="number" min="1000000" class="erp-input" required />
          </div>
          <div class="erp-field">
            <label class="erp-label" for="gm-rev">Penyesuaian Target Pendapatan Berikutnya (IDR)</label>
            <input id="gm-rev" v-model.number="decideForm.adjustedRevenueTarget" type="number" min="1000000" class="erp-input" required />
          </div>
        </div>
        <div class="erp-field">
          <label class="erp-label" for="gm-note">Arahan &amp; Catatan Eksekutif GM PMO</label>
          <textarea
            id="gm-note"
            v-model="decideForm.note"
            class="erp-textarea"
            placeholder="Contoh: Disetujui dengan syarat efisiensi pengadaan IT sebesar 10% pada kuartal depan."
            required
          ></textarea>
        </div>
        <div class="erp-row" style="justify-content: flex-end;">
          <button type="button" class="erp-btn erp-btn-secondary" @click="decideTarget = null">Batal</button>
          <button type="submit" class="erp-btn erp-btn-primary" :disabled="submitting">Simpan Keputusan GM</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, downloadCsvReport } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { formatIdr } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';

const auth = useAuthStore();
const activeTab = ref<'financial' | 'strategy'>('financial');
const loading = ref(true);
const error = ref('');
const feedbackMsg = ref('');
const actionError = ref('');
const submitting = ref(false);

const selectedUnitId = ref('');
const financial = ref<any | null>(null);
const evaluations = ref<any[]>([]);
const masterUnits = ref<any[]>([]);
const fiscalPeriods = ref<any[]>([]);

const showCreateEvalModal = ref(false);
const evalForm = ref({
  fiscalPeriodId: '',
  businessUnitId: '',
  varianceAnalysis: '',
  riskSummary: '',
  recommendedNextCeiling: 450000000,
  recommendedRevenueTarget: 650000000,
});

const decideTarget = ref<any | null>(null);
const decideForm = ref({
  decision: 'APPROVED',
  adjustedNextCeiling: 0,
  adjustedRevenueTarget: 0,
  note: '',
});

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const query = selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    const [finRes, evalRes, masterRes] = await Promise.all([
      api.get<any>(`/reports/financial${query}`),
      api.get<any[]>('/reports/strategy/evaluations'),
      api.get<any>('/master/overview'),
    ]);

    financial.value = finRes.data;
    evaluations.value = evalRes.data;
    masterUnits.value = masterRes.data.businessUnits;
    fiscalPeriods.value = masterRes.data.fiscalPeriods;

    if (masterUnits.value.length > 0 && !evalForm.value.businessUnitId) {
      evalForm.value.businessUnitId = masterUnits.value[0].id;
    }
    if (fiscalPeriods.value.length > 0 && !evalForm.value.fiscalPeriodId) {
      evalForm.value.fiscalPeriodId = fiscalPeriods.value[0].id;
    }
  } catch (err: any) {
    error.value = err.message || 'Gagal memuat laporan keuangan dan evaluasi strategis.';
  } finally {
    loading.value = false;
  }
}

async function exportCsv(type: string) {
  actionError.value = '';
  try {
    await downloadCsvReport(type);
    feedbackMsg.value = `Laporan CSV (${type}) berhasil diunduh beserta metadata waktu ekspor.`;
  } catch (err: any) {
    actionError.value = err.message || 'Gagal mengunduh file CSV.';
  }
}

async function submitCreateEval() {
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>('/reports/strategy/evaluations', evalForm.value);
    feedbackMsg.value = `Evaluasi strategis ${res.data.evalNumber} berhasil disusun.`;
    showCreateEvalModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menyimpan evaluasi strategis.';
  } finally {
    submitting.value = false;
  }
}

function openDecideModal(ev: any) {
  decideTarget.value = ev;
  decideForm.value = {
    decision: 'APPROVED',
    adjustedNextCeiling: ev.recommendedNextCeiling,
    adjustedRevenueTarget: ev.recommendedRevenueTarget,
    note: ev.gmDecisionNote || 'Disetujui sesuai proyeksi pertumbuhan dan pengendalian anggaran.',
  };
}

async function submitGmDecision() {
  if (!decideTarget.value) return;
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>(`/reports/strategy/evaluations/${decideTarget.value.id}/decide`, decideForm.value);
    feedbackMsg.value = `Keputusan strategis GM PMO untuk ${res.data.evalNumber} berhasil disimpan.`;
    decideTarget.value = null;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menyimpan keputusan strategis.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadAll);
</script>
