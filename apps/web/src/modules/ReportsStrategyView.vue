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
        v-if="auth.hasPermission('revenue:view')"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'aging' }"
        @click="activeTab = 'aging'"
      >
        2. Aging Penerimaan ({{ agingData?.buckets?.openCount ?? 0 }})
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'strategy' }"
        @click="activeTab = 'strategy'"
      >
        3. Evaluasi Strategis &amp; Plafon Berikutnya ({{ evaluations.length }})
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

      <!-- TAB 2: AGING PENERIMAAN (UMUR PIUTANG) -->
      <div v-if="activeTab === 'aging'" class="erp-stack">
        <div class="aging-toolbar-card">
          <div>
            <h2 class="aging-title">Aging Penerimaan (Umur Piutang)</h2>
            <p class="aging-sub">
              Posisi per {{ agingData?.asOfDate || '-' }} · Klik kartu umur piutang untuk menyaring rincian faktur terbuka.
            </p>
          </div>
          <div class="aging-controls">
            <select v-model="selectedUnitId" class="erp-select aging-select" aria-label="Filter Unit Bisnis Aging" @change="loadAll">
              <option value="">Semua Unit Bisnis (4 Unit)</option>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
            <input
              v-model="agingSearch"
              type="search"
              class="erp-input aging-search"
              placeholder="Cari invoice, instansi, kegiatan..."
              @input="onAgingSearchInput"
            />
            <button
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="exportingAging"
              @click="exportAgingExcel"
            >
              {{ exportingAging ? 'Menyiapkan...' : 'Export Aging .xlsx' }}
            </button>
          </div>
        </div>

        <div class="aging-kpi-grid">
          <button
            type="button"
            class="aging-kpi-card aging-kpi-navy"
            :class="{ 'is-selected': selectedAgingBucket === '' }"
            @click="selectAgingBucket('')"
          >
            <span class="aging-kpi-label">Total Piutang Terbuka</span>
            <strong class="aging-kpi-value">{{ formatIdr(agingData?.buckets?.totalOutstanding ?? 0) }}</strong>
            <span class="aging-kpi-meta">{{ agingData?.buckets?.openCount ?? 0 }} faktur belum lunas</span>
          </button>

          <button
            type="button"
            class="aging-kpi-card aging-kpi-blue"
            :class="{ 'is-selected': selectedAgingBucket === 'current' }"
            @click="selectAgingBucket('current')"
          >
            <span class="aging-kpi-label">0 - 30 Hari (Lancar)</span>
            <strong class="aging-kpi-value">{{ formatIdr(agingData?.buckets?.current ?? 0) }}</strong>
            <span class="aging-kpi-meta">Belum / baru jatuh tempo</span>
          </button>

          <button
            type="button"
            class="aging-kpi-card aging-kpi-amber"
            :class="{ 'is-selected': selectedAgingBucket === 'days31to60' }"
            @click="selectAgingBucket('days31to60')"
          >
            <span class="aging-kpi-label">31 - 60 Hari</span>
            <strong class="aging-kpi-value">{{ formatIdr(agingData?.buckets?.days31to60 ?? 0) }}</strong>
            <span class="aging-kpi-meta">Perlu penagihan ulang</span>
          </button>

          <button
            type="button"
            class="aging-kpi-card aging-kpi-orange"
            :class="{ 'is-selected': selectedAgingBucket === 'days61to90' }"
            @click="selectAgingBucket('days61to90')"
          >
            <span class="aging-kpi-label">61 - 90 Hari</span>
            <strong class="aging-kpi-value">{{ formatIdr(agingData?.buckets?.days61to90 ?? 0) }}</strong>
            <span class="aging-kpi-meta">Tunggakan menengah</span>
          </button>

          <button
            type="button"
            class="aging-kpi-card aging-kpi-red"
            :class="{ 'is-selected': selectedAgingBucket === 'over90' }"
            @click="selectAgingBucket('over90')"
          >
            <span class="aging-kpi-label">&gt; 90 Hari</span>
            <strong class="aging-kpi-value">{{ formatIdr(agingData?.buckets?.over90 ?? 0) }}</strong>
            <span class="aging-kpi-meta">Prioritas eskalasi</span>
          </button>
        </div>

        <div class="erp-grid-2">
          <!-- Aging per Business Unit -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <h3 class="erp-section-title">Rekap Aging per Unit Bisnis</h3>
                <p class="erp-subtitle">Distribusi piutang terbuka MICE, Klinik, IT Solution, dan TCI</p>
              </div>
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Unit Bisnis</th>
                    <th class="num">Faktur</th>
                    <th class="num">0-30h</th>
                    <th class="num">31-60h</th>
                    <th class="num">61-90h</th>
                    <th class="num">&gt;90h</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!agingData?.byUnit?.length">
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">
                      Tidak ada piutang terbuka pada filter unit ini.
                    </td>
                  </tr>
                  <tr v-for="u in agingData?.byUnit || []" :key="u.unitId">
                    <td>
                      <div style="font-weight: 600;">{{ u.unitName }}</div>
                      <code style="font-size: 0.74rem;">{{ u.unitCode }}</code>
                    </td>
                    <td class="num">{{ u.count }}</td>
                    <td class="num">{{ formatIdr(u.current) }}</td>
                    <td class="num">{{ formatIdr(u.days31to60) }}</td>
                    <td class="num">{{ formatIdr(u.days61to90) }}</td>
                    <td class="num" :style="{ color: u.over90 > 0 ? '#b91c1c' : 'inherit', fontWeight: u.over90 > 0 ? 700 : 400 }">
                      {{ formatIdr(u.over90) }}
                    </td>
                    <td class="num" style="font-weight: 700;">{{ formatIdr(u.total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Aging per Customer / Instansi -->
          <section class="erp-card">
            <div class="erp-card-header">
              <div>
                <h3 class="erp-section-title">Rekap Aging per Pelanggan / Instansi</h3>
                <p class="erp-subtitle">Diurutkan dari nilai piutang terbuka terbesar</p>
              </div>
            </div>
            <div class="erp-table-wrap">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Pelanggan / Instansi</th>
                    <th class="num">Faktur</th>
                    <th class="num">0-30h</th>
                    <th class="num">31-60h</th>
                    <th class="num">61-90h</th>
                    <th class="num">&gt;90h</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!agingData?.byCustomer?.length">
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">
                      Seluruh tagihan pelanggan sudah lunas.
                    </td>
                  </tr>
                  <tr v-for="c in agingData?.byCustomer || []" :key="c.customerId">
                    <td>
                      <div style="font-weight: 600;">{{ c.customerName }}</div>
                      <span style="font-size: 0.74rem; color: var(--text-muted);">{{ c.organizationType }}</span>
                    </td>
                    <td class="num">{{ c.count }}</td>
                    <td class="num">{{ formatIdr(c.current) }}</td>
                    <td class="num">{{ formatIdr(c.days31to60) }}</td>
                    <td class="num">{{ formatIdr(c.days61to90) }}</td>
                    <td class="num" :style="{ color: c.over90 > 0 ? '#b91c1c' : 'inherit', fontWeight: c.over90 > 0 ? 700 : 400 }">
                      {{ formatIdr(c.over90) }}
                    </td>
                    <td class="num" style="font-weight: 700;">{{ formatIdr(c.total) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <!-- Detailed Open Invoices Table -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">
                Rincian Faktur Piutang Terbuka
                <span v-if="selectedAgingBucket" class="aging-filter-pill">
                  Filter: {{ agingBucketLabel(selectedAgingBucket) }}
                </span>
              </h3>
              <p class="erp-subtitle">
                Daftar tagihan berstatus ISSUED / PARTIALLY_PAID yang masih menunggu pelunasan di Bank Mandiri Penerimaan.
              </p>
            </div>
            <div class="btn-row">
              <button
                v-if="selectedAgingBucket"
                type="button"
                class="btn btn-sm"
                @click="selectAgingBucket('')"
              >
                Reset Filter Umur
              </button>
              <button
                type="button"
                class="btn btn-sm"
                @click="router.push('/revenue')"
              >
                Buka Modul Penerimaan
              </button>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Invoice</th>
                  <th>Unit</th>
                  <th>Pelanggan &amp; Kegiatan</th>
                  <th>Terbit / Jatuh Tempo</th>
                  <th class="num">Umur</th>
                  <th>Status</th>
                  <th class="num">Tagihan Neto</th>
                  <th class="num">Terbayar</th>
                  <th class="num">Sisa Piutang</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!agingData?.invoices?.length">
                  <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    Tidak ada faktur piutang terbuka pada kategori umur ini.
                  </td>
                </tr>
                <tr v-for="inv in agingData?.invoices || []" :key="inv.id">
                  <td>
                    <code style="font-weight: 600;">{{ inv.docNumber }}</code>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">{{ inv.invoiceType }}</div>
                  </td>
                  <td><span class="erp-badge erp-badge-neutral">{{ inv.businessUnitCode }}</span></td>
                  <td>
                    <div style="font-weight: 600;">{{ inv.customerName }}</div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary);">{{ inv.activityTitle }}</div>
                  </td>
                  <td>
                    <div style="font-size: 0.8rem;">{{ inv.issueDate }}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">JT: {{ inv.dueDate }}</div>
                  </td>
                  <td class="num">
                    <span class="aging-day-pill" :class="`bucket-${inv.bucketKey}`">
                      {{ inv.daysOverdue > 0 ? `+${inv.daysOverdue} hr` : `${inv.daysOverdue} hr` }}
                    </span>
                  </td>
                  <td><StatusBadge :status="inv.status" /></td>
                  <td class="num">{{ formatIdr(inv.totalAmount) }}</td>
                  <td class="num">{{ formatIdr(inv.paidAmount) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(inv.balanceDue) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 3: STRATEGIC EVALUATION & NEXT-PERIOD BUDGET CEILING -->
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
import { useRoute, useRouter } from 'vue-router';
import { api, downloadCsvReport, downloadApiBlob } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { formatIdr } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const defaultTab = (): 'financial' | 'aging' | 'strategy' => {
  if (route.query.tab === 'aging' && auth.hasPermission('revenue:view')) return 'aging';
  if (route.query.tab === 'strategy') return 'strategy';
  if (auth.activeWorkspace === 'PENERIMAAN' && auth.hasPermission('revenue:view')) return 'aging';
  return 'financial';
};

const activeTab = ref<'financial' | 'aging' | 'strategy'>(defaultTab());
const loading = ref(true);
const error = ref('');
const feedbackMsg = ref('');
const actionError = ref('');
const submitting = ref(false);
const exportingAging = ref(false);

const selectedUnitId = ref('');
const selectedAgingBucket = ref<'' | 'current' | 'days31to60' | 'days61to90' | 'over90'>('');
const agingSearch = ref('');
let agingSearchTimer: ReturnType<typeof setTimeout> | null = null;

const financial = ref<any | null>(null);
const agingData = ref<any | null>(null);
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

function agingBucketLabel(bucket: string) {
  if (bucket === 'current') return '0 - 30 Hari';
  if (bucket === 'days31to60') return '31 - 60 Hari';
  if (bucket === 'days61to90') return '61 - 90 Hari';
  if (bucket === 'over90') return '> 90 Hari';
  return 'Semua';
}

async function loadAging() {
  if (!auth.hasPermission('revenue:view')) return;
  try {
    const params = new URLSearchParams();
    if (selectedUnitId.value) params.set('businessUnitId', selectedUnitId.value);
    if (selectedAgingBucket.value) params.set('bucket', selectedAgingBucket.value);
    if (agingSearch.value.trim()) params.set('search', agingSearch.value.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get<any>(`/revenue/aging${qs}`);
    agingData.value = res.data;
  } catch (err: any) {
    actionError.value = err.message || 'Gagal memuat data Aging Penerimaan.';
  }
}

function selectAgingBucket(bucket: '' | 'current' | 'days31to60' | 'days61to90' | 'over90') {
  selectedAgingBucket.value = selectedAgingBucket.value === bucket ? '' : bucket;
  loadAging();
}

function onAgingSearchInput() {
  if (agingSearchTimer) clearTimeout(agingSearchTimer);
  agingSearchTimer = setTimeout(() => {
    loadAging();
  }, 250);
}

async function exportAgingExcel() {
  exportingAging.value = true;
  actionError.value = '';
  try {
    const qs = selectedUnitId.value ? `?businessUnitId=${encodeURIComponent(selectedUnitId.value)}` : '';
    const asOf = agingData.value?.asOfDate || new Date().toISOString().slice(0, 10);
    await downloadApiBlob(`/revenue/aging/export.xlsx${qs}`, `Aging-Penerimaan-${asOf}.xlsx`);
    feedbackMsg.value = `File Excel Aging Penerimaan (${asOf}) berhasil diunduh.`;
  } catch (err: any) {
    actionError.value = err.message || 'Gagal mengekspor Excel Aging Penerimaan.';
  } finally {
    exportingAging.value = false;
  }
}

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

    await loadAging();
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

<style scoped>
.aging-toolbar-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 18px 20px;
}

.aging-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0b2144;
}

.aging-sub {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.aging-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.aging-select {
  min-width: 200px;
}

.aging-search {
  min-width: 210px;
}

.aging-kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.aging-kpi-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 6px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.aging-kpi-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(11, 33, 68, 0.08);
}

.aging-kpi-card.is-selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.aging-kpi-navy {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.aging-kpi-navy .aging-kpi-label,
.aging-kpi-navy .aging-kpi-meta {
  color: #cbd5e1;
}

.aging-kpi-blue {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #0b2144;
}

.aging-kpi-amber {
  background: #fef9ed;
  border-color: #fde68a;
  color: #78350f;
}

.aging-kpi-orange {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #9a3412;
}

.aging-kpi-red {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.aging-kpi-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: #475569;
}

.aging-kpi-value {
  font-size: clamp(0.95rem, 1.35vw, 1.25rem);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
  word-break: break-word;
}

.aging-kpi-meta {
  font-size: 0.74rem;
  color: #64748b;
}

.aging-filter-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #eff6ff;
  color: #1d4ed8;
  vertical-align: middle;
}

.aging-day-pill {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.aging-day-pill.bucket-current {
  background: #eff6ff;
  color: #1d4ed8;
}

.aging-day-pill.bucket-days31to60 {
  background: #fef3c7;
  color: #92400e;
}

.aging-day-pill.bucket-days61to90 {
  background: #ffedd5;
  color: #9a3412;
}

.aging-day-pill.bucket-over90 {
  background: #fee2e2;
  color: #b91c1c;
}

@media (max-width: 1120px) {
  .aging-kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .aging-kpi-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
  .aging-select,
  .aging-search {
    min-width: 100%;
  }
}
</style>
