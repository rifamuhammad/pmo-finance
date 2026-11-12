<template>
  <div class="reports-strategy-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Laporan Keuangan</h1>
        <p class="page-desc">
          Laporan Laba Rugi, Posisi Keuangan (Neraca), Arus Kas, dan evaluasi realisasi periode.
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
            <span class="erp-badge erp-badge-info">STANDAR ISAK 335 (ENTITAS NIRLABA UT PTNBH)</span>
            <h2 class="erp-section-title" style="margin-top: 6px;">
              Laporan Posisi Keuangan (Neraca) &amp; Laporan Aktivitas
            </h2>
            <p class="erp-subtitle">
              Disusun otomatis dari seluruh jurnal umum terposting dengan pemisahan Aset Neto Tanpa Pembatasan (Unrestricted) dan Dengan Pembatasan (Restricted) sesuai ISAK 335 &amp; Pertor 310.
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
            <span class="erp-kpi-label">Total Pendapatan Komersial PMO</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.incomeStatement.totalRevenue) }}</span>
            <span class="erp-kpi-sub">Akun kelompok 4xxx Pertor 310</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Beban Operasional PMO</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.incomeStatement.totalExpense) }}</span>
            <span class="erp-kpi-sub">Belanja pegawai, pemeliharaan &amp; depresiasi</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Surplus / (Defisit) Neto Berjalan</span>
            <span class="erp-kpi-value" :style="{ color: Number(financial.incomeStatement.netIncome) >= 0 ? '#059669' : '#dc2626' }">
              {{ formatIdr(financial.incomeStatement.netIncome) }}
            </span>
            <span class="erp-kpi-sub">Kenaikan / (penurunan) Aset Neto Berjalan</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Aset Neto PMO (ISAK 335)</span>
            <span class="erp-kpi-value">{{ formatIdr(financial.balanceSheet.totalNetAssets || financial.balanceSheet.totalEquity) }}</span>
            <span class="erp-kpi-sub">Tanpa Pembatasan + Dengan Pembatasan</span>
          </div>
        </div>

        <div class="erp-grid-2">
          <!-- Statement of Activities (ISAK 335) -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <span class="erp-badge erp-badge-info">AKTIVITAS OPERASIONAL</span>
                <h3 class="erp-section-title" style="margin-top: 4px;">Laporan Aktivitas (Statement of Activities)</h3>
                <p class="erp-subtitle">Penyajian pendapatan usaha dan beban operasional menurut standar ISAK 335</p>
              </div>
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Akun</th>
                    <th>Klasifikasi</th>
                    <th class="num">Saldo (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="4">I. PENDAPATAN OPERASIONAL &amp; KOMERSIAL UNIT</td>
                  </tr>
                  <tr v-for="acc in financial.incomeStatement.revenueAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-success">PENDAPATAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr style="font-weight: 600; border-bottom: 2px solid var(--border-subtle);">
                    <td colspan="3" style="text-align: right;">Total Pendapatan:</td>
                    <td class="num">{{ formatIdr(financial.incomeStatement.totalRevenue) }}</td>
                  </tr>

                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="4">II. BEBAN OPERASIONAL PMO UTAMA</td>
                  </tr>
                  <tr v-for="acc in financial.incomeStatement.expenseAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-warning">BEBAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr style="font-weight: 600; border-bottom: 2px solid var(--border-subtle);">
                    <td colspan="3" style="text-align: right;">Total Beban Operasional:</td>
                    <td class="num">{{ formatIdr(financial.incomeStatement.totalExpense) }}</td>
                  </tr>

                  <tr style="background: #f0fdf4; font-weight: 700;">
                    <td colspan="3">SURPLUS / (DEFISIT) NETO PERIODE BERJALAN</td>
                    <td class="num" :style="{ color: Number(financial.incomeStatement.netIncome) >= 0 ? '#059669' : '#dc2626' }">
                      {{ formatIdr(financial.incomeStatement.netIncome) }}
                    </td>
                  </tr>

                  <!-- Alokasi Aset Neto ISAK 335 -->
                  <tr style="background: var(--bg-surface-muted); font-size: 0.8rem; font-weight: 600;">
                    <td colspan="3">↳ Kenaikan / (Penurunan) Aset Neto Tanpa Pembatasan</td>
                    <td class="num">{{ formatIdr(financial.statementOfActivities?.unrestrictedSurplus ?? financial.incomeStatement.netIncome) }}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-muted); font-size: 0.8rem; font-weight: 600;">
                    <td colspan="3">↳ Kenaikan / (Penurunan) Aset Neto Terikat (Restricted)</td>
                    <td class="num">{{ formatIdr(financial.statementOfActivities?.restrictedSurplus ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Statement of Financial Position (Neraca ISAK 335) -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <span class="erp-badge erp-badge-info">POSISI KEUANGAN</span>
                <h3 class="erp-section-title" style="margin-top: 4px;">Laporan Posisi Keuangan (Neraca ISAK 335)</h3>
                <p class="erp-subtitle">Aset = Liabilitas + Aset Neto (Unrestricted &amp; Restricted)</p>
              </div>
              <StatusBadge :status="financial.balanceSheet.isBalanced ? 'MATCHED' : 'DISCREPANCY'" />
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Pos &amp; Nama Akun</th>
                    <th>Klasifikasi</th>
                    <th class="num">Nilai (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- I. ASET -->
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="4">I. ASET (ASSETS)</td>
                  </tr>
                  <tr v-for="acc in financial.balanceSheet.assetAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td>
                      <span class="erp-badge" :class="acc.code.startsWith('11') ? 'erp-badge-info' : 'erp-badge-neutral'">
                        {{ acc.code.startsWith('11') ? 'ASET LANCAR' : 'ASET TETAP' }}
                      </span>
                    </td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="3">TOTAL ASET</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalAssets) }}</td>
                  </tr>

                  <!-- II. LIABILITAS -->
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="4">II. LIABILITAS (LIABILITIES)</td>
                  </tr>
                  <tr v-for="acc in financial.balanceSheet.liabilityAccounts" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-warning">LIABILITAS</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr style="font-weight: 600; border-bottom: 2px solid var(--border-subtle);">
                    <td colspan="3" style="text-align: right;">Total Liabilitas:</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalLiabilities) }}</td>
                  </tr>

                  <!-- III. ASET NETO (NET ASSETS - ISAK 335) -->
                  <tr style="background: var(--bg-surface-muted); font-weight: 700;">
                    <td colspan="4">III. ASET NETO (NET ASSETS - ISAK 335)</td>
                  </tr>
                  <!-- Aset Neto Tanpa Pembatasan -->
                  <tr v-for="acc in (financial.balanceSheet.netAssetsUnrestricted?.accounts || financial.balanceSheet.equityAccounts)" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-neutral">TANPA PEMBATASAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr>
                    <td><code>3999</code></td>
                    <td style="font-weight: 600;">Surplus / (Defisit) Periode Berjalan</td>
                    <td><span class="erp-badge erp-badge-neutral">TANPA PEMBATASAN</span></td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.currentPeriodEarnings) }}</td>
                  </tr>
                  <tr style="font-size: 0.82rem; font-weight: 600;">
                    <td colspan="3" style="text-align: right; color: var(--text-muted);">Subtotal Aset Neto Tanpa Pembatasan:</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.netAssetsUnrestricted?.endingBalance ?? (financial.balanceSheet.totalEquity)) }}</td>
                  </tr>

                  <!-- Aset Neto Dengan Pembatasan (Restricted) -->
                  <tr v-for="acc in (financial.balanceSheet.netAssetsRestricted?.accounts || [])" :key="acc.code">
                    <td><code>{{ acc.code }}</code></td>
                    <td style="font-weight: 600;">{{ acc.name }}</td>
                    <td><span class="erp-badge erp-badge-demo">DENGAN PEMBATASAN</span></td>
                    <td class="num">{{ formatIdr(acc.balance) }}</td>
                  </tr>
                  <tr v-if="(financial.balanceSheet.netAssetsRestricted?.accounts || []).length > 0" style="font-size: 0.82rem; font-weight: 600;">
                    <td colspan="3" style="text-align: right; color: var(--text-muted);">Subtotal Aset Neto Dengan Pembatasan:</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.netAssetsRestricted?.endingBalance ?? 0) }}</td>
                  </tr>

                  <tr style="background: #f8fafc; font-weight: 700;">
                    <td colspan="3">TOTAL ASET NETO (NET ASSETS)</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalNetAssets || financial.balanceSheet.totalEquity) }}</td>
                  </tr>

                  <tr style="background: var(--bg-surface-muted); font-weight: 700; border-top: 2px solid var(--border-color);">
                    <td colspan="3">TOTAL LIABILITAS &amp; ASET NETO</td>
                    <td class="num">{{ formatIdr(financial.balanceSheet.totalLiabilitiesAndEquity) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Cash Flow Statement: Laporan Arus Kas Metode Langsung (Direct Method - ISAK 335) -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <span class="erp-badge erp-badge-demo">ISAK 335: METODE LANGSUNG</span>
              <h3 class="erp-section-title" style="margin-top: 4px;">
                Laporan Arus Kas (Direct Cash Flow Statement)
              </h3>
              <p class="erp-subtitle">
                Mutasi kas dan bank riil yang diklasifikasikan ke dalam aktivitas operasi, investasi, dan pendanaan serta rekonsiliasi saldo kas buku besar.
              </p>
            </div>
            <div style="text-align: right;">
              <span class="erp-kpi-label">KENAIKAN / (PENURUNAN) BERSIH KAS</span>
              <strong
                class="erp-kpi-value"
                :style="{ color: Number(financial.directCashFlowStatement?.reconciliation?.netCashIncreaseDecrease ?? financial.cashFlowStatement.netOperatingCashFlow) >= 0 ? '#059669' : '#dc2626' }"
              >
                {{ formatIdr(financial.directCashFlowStatement?.reconciliation?.netCashIncreaseDecrease ?? financial.cashFlowStatement.netOperatingCashFlow) }}
              </strong>
            </div>
          </div>

          <!-- Kluster 1: Aktivitas Operasi -->
          <div style="padding: 16px 16px 8px 16px;">
            <div style="border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-surface); padding: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div>
                  <h4 style="margin: 0; font-size: 0.98rem; font-weight: 700; color: var(--text-primary);">
                    1. ARUS KAS DARI AKTIVITAS OPERASI
                  </h4>
                  <span style="font-size: 0.78rem; color: var(--text-secondary);">
                    Penerimaan dari pelanggan &amp; pengeluaran operasional (pemasok, beban pegawai, UMK kas kecil)
                  </span>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Arus Kas Bersih Operasi</span>
                  <strong
                    style="font-size: 1.05rem;"
                    :style="{ color: Number(financial.directCashFlowStatement?.operatingActivities?.netOperatingCashFlow ?? financial.cashFlowStatement.netOperatingCashFlow) >= 0 ? '#059669' : '#dc2626' }"
                  >
                    {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.netOperatingCashFlow ?? financial.cashFlowStatement.netOperatingCashFlow) }}
                  </strong>
                </div>
              </div>

              <div class="erp-grid-2" style="gap: 16px;">
                <!-- INFLOWS -->
                <div style="border: 1px solid #a7f3d0; border-radius: 8px; background: #f0fdf4; padding: 12px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: #047857; font-size: 0.88rem;">🟢 ARUS KAS MASUK (INFLOWS)</strong>
                    <span class="erp-badge erp-badge-success">OPERASIONAL</span>
                  </div>
                  <table class="erp-table" style="background: transparent;">
                    <tbody>
                      <tr>
                        <td>Penerimaan Kas dari Pelanggan &amp; Piutang Usaha</td>
                        <td class="num" style="font-weight: 700; color: #047857;">
                          + {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.inflows?.fromCustomers ?? financial.cashFlowStatement.cashInFromCustomers) }}
                        </td>
                      </tr>
                      <tr>
                        <td>Penerimaan Operasional Lainnya</td>
                        <td class="num" style="font-weight: 600; color: #047857;">
                          + {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.inflows?.otherOperating ?? 0) }}
                        </td>
                      </tr>
                      <tr style="border-top: 2px solid #6ee7b7; font-weight: 800; background: #ecfdf5;">
                        <td style="color: #065f46;">TOTAL ARUS KAS MASUK OPERASI</td>
                        <td class="num" style="color: #047857; font-size: 0.95rem;">
                          {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.inflows?.totalInflows ?? financial.cashFlowStatement.cashInFromCustomers) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- OUTFLOWS -->
                <div style="border: 1px solid #fecaca; border-radius: 8px; background: #fef2f2; padding: 12px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: #b91c1c; font-size: 0.88rem;">🔴 ARUS KAS KELUAR (OUTFLOWS)</strong>
                    <span class="erp-badge erp-badge-warning">OPERASIONAL</span>
                  </div>
                  <table class="erp-table" style="background: transparent;">
                    <tbody>
                      <tr>
                        <td>Pembayaran kepada Pemasok &amp; Pengadaan Vendor</td>
                        <td class="num" style="font-weight: 600; color: #b91c1c;">
                          - {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.outflows?.toSuppliers ?? financial.cashFlowStatement.cashOutForExpenses) }}
                        </td>
                      </tr>
                      <tr>
                        <td>Pembayaran Beban Pegawai &amp; Payroll SDM</td>
                        <td class="num" style="font-weight: 600; color: #b91c1c;">
                          - {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.outflows?.toEmployees ?? 0) }}
                        </td>
                      </tr>
                      <tr>
                        <td>Penyaluran Uang Muka Kerja (UMK) / Kas Kecil Unit</td>
                        <td class="num" style="font-weight: 600; color: #b91c1c;">
                          - {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.outflows?.pettyCashDisbursements ?? 0) }}
                        </td>
                      </tr>
                      <tr>
                        <td>Pembayaran Pajak &amp; Beban Operasional Lain</td>
                        <td class="num" style="font-weight: 600; color: #b91c1c;">
                          - {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.outflows?.taxesAndOther ?? 0) }}
                        </td>
                      </tr>
                      <tr style="border-top: 2px solid #fca5a5; font-weight: 800; background: #fff1f2;">
                        <td style="color: #991b1b;">TOTAL ARUS KAS KELUAR OPERASI</td>
                        <td class="num" style="color: #b91c1c; font-size: 0.95rem;">
                          - {{ formatIdr(financial.directCashFlowStatement?.operatingActivities?.outflows?.totalOutflows ?? financial.cashFlowStatement.cashOutForExpenses) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Kluster 2 & 3: Aktivitas Investasi & Pendanaan -->
          <div class="erp-grid-2" style="padding: 8px 16px 8px 16px; gap: 16px;">
            <!-- INVESTING -->
            <div style="border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-surface); padding: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <h4 style="margin: 0; font-size: 0.92rem; font-weight: 700; color: var(--text-primary);">
                  2. AKTIVITAS INVESTASI
                </h4>
                <strong
                  style="font-size: 0.95rem;"
                  :style="{ color: Number(financial.directCashFlowStatement?.investingActivities?.netInvestingCashFlow || 0) >= 0 ? '#059669' : '#dc2626' }"
                >
                  {{ formatIdr(financial.directCashFlowStatement?.investingActivities?.netInvestingCashFlow || 0) }}
                </strong>
              </div>
              <table class="erp-table">
                <tbody>
                  <tr>
                    <td>Penerimaan Penjualan / Pelepasan Aset Tetap</td>
                    <td class="num" style="color: #047857; font-weight: 600;">
                      + {{ formatIdr(financial.directCashFlowStatement?.investingActivities?.inflows?.assetDisposals || 0) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Pengeluaran Perolehan Aset Tetap (CapEx)</td>
                    <td class="num" style="color: #b91c1c; font-weight: 600;">
                      - {{ formatIdr(financial.directCashFlowStatement?.investingActivities?.outflows?.capitalExpenditures || 0) }}
                    </td>
                  </tr>
                  <tr style="border-top: 1px solid var(--border-color); font-weight: 700; background: var(--bg-surface-muted);">
                    <td>Arus Kas Bersih Aktivitas Investasi</td>
                    <td class="num">
                      {{ formatIdr(financial.directCashFlowStatement?.investingActivities?.netInvestingCashFlow || 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- FINANCING -->
            <div style="border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-surface); padding: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <h4 style="margin: 0; font-size: 0.92rem; font-weight: 700; color: var(--text-primary);">
                  3. AKTIVITAS PENDANAAN
                </h4>
                <strong
                  style="font-size: 0.95rem;"
                  :style="{ color: Number(financial.directCashFlowStatement?.financingActivities?.netFinancingCashFlow || 0) >= 0 ? '#059669' : '#dc2626' }"
                >
                  {{ formatIdr(financial.directCashFlowStatement?.financingActivities?.netFinancingCashFlow || 0) }}
                </strong>
              </div>
              <table class="erp-table">
                <tbody>
                  <tr>
                    <td>Penerimaan Setoran Modal / RKAP / DIPA</td>
                    <td class="num" style="color: #047857; font-weight: 600;">
                      + {{ formatIdr(financial.directCashFlowStatement?.financingActivities?.inflows?.capitalContributions || 0) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Penarikan Modal / Dividen / Prive</td>
                    <td class="num" style="color: #b91c1c; font-weight: 600;">
                      - {{ formatIdr(financial.directCashFlowStatement?.financingActivities?.outflows?.capitalWithdrawals || 0) }}
                    </td>
                  </tr>
                  <tr style="border-top: 1px solid var(--border-color); font-weight: 700; background: var(--bg-surface-muted);">
                    <td>Arus Kas Bersih Aktivitas Pendanaan</td>
                    <td class="num">
                      {{ formatIdr(financial.directCashFlowStatement?.financingActivities?.netFinancingCashFlow || 0) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Kluster 4: Rekonsiliasi Saldo Kas & Bank -->
          <div style="padding: 8px 16px 16px 16px;">
            <div style="border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; padding: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <div>
                  <h4 style="margin: 0; color: #1d4ed8; font-size: 0.95rem; font-weight: 700;">
                    4. REKONSILIASI SALDO KAS &amp; SETARA KAS
                  </h4>
                  <span style="font-size: 0.78rem; color: var(--text-secondary);">
                    Kesesuaian kenaikan/penurunan bersih terhadap saldo buku besar Kas &amp; Bank
                  </span>
                </div>
                <div>
                  <span
                    v-if="financial.directCashFlowStatement?.reconciliation?.isReconciled"
                    class="erp-badge erp-badge-success"
                  >
                    ✓ REKONSILIASI COCOK (0 SELISIH)
                  </span>
                  <span v-else class="erp-badge erp-badge-warning">
                    PERIKSA JURNAL KAS
                  </span>
                </div>
              </div>

              <div class="erp-grid-3" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px;">
                <div style="background: white; border-radius: 8px; padding: 10px; border: 1px solid #dbeafe;">
                  <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Saldo Awal Kas &amp; Bank</span>
                  <strong style="font-size: 1rem; color: var(--text-primary);">
                    {{ formatIdr(financial.directCashFlowStatement?.reconciliation?.beginningCashBalance || 0) }}
                  </strong>
                </div>
                <div style="background: white; border-radius: 8px; padding: 10px; border: 1px solid #dbeafe;">
                  <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Kenaikan / (Penurunan) Bersih</span>
                  <strong
                    style="font-size: 1rem;"
                    :style="{ color: Number(financial.directCashFlowStatement?.reconciliation?.netCashIncreaseDecrease || 0) >= 0 ? '#059669' : '#dc2626' }"
                  >
                    {{ formatIdr(financial.directCashFlowStatement?.reconciliation?.netCashIncreaseDecrease || 0) }}
                  </strong>
                </div>
                <div style="background: white; border-radius: 8px; padding: 10px; border: 1px solid #dbeafe;">
                  <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Saldo Akhir Kas &amp; Bank</span>
                  <strong style="font-size: 1rem; color: #1d4ed8;">
                    {{ formatIdr(financial.directCashFlowStatement?.reconciliation?.endingCashBalance || 0) }}
                  </strong>
                </div>
              </div>

              <!-- Breakdown Physical Cash & Bank Accounts -->
              <div v-if="financial.directCashFlowStatement?.reconciliation?.cashAndBankAccounts?.length">
                <span style="font-size: 0.78rem; font-weight: 700; color: #1e40af; margin-bottom: 6px; display: block;">
                  Rincian Rekening Kas &amp; Bank di Buku Besar:
                </span>
                <table class="erp-table" style="background: white; border-radius: 8px; overflow: hidden;">
                  <thead>
                    <tr>
                      <th style="width: 140px;">Kode Akun</th>
                      <th>Nama Akun Rekening</th>
                      <th class="num" style="width: 180px;">Saldo Akhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="acc in financial.directCashFlowStatement.reconciliation.cashAndBankAccounts"
                      :key="acc.code"
                    >
                      <td style="font-family: monospace; font-size: 0.8rem;">{{ acc.code }}</td>
                      <td>{{ acc.name }}</td>
                      <td class="num" style="font-weight: 600;">{{ formatIdr(acc.balance) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

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
