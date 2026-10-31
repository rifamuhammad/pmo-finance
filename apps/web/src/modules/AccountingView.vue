<template>
  <div class="accounting-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Akuntansi & Buku Besar</h1>
        <p class="page-desc">
          Bagan akun standar (CoA), jurnal transaksi umum, dan saldo buku besar.
        </p>
      </div>
      <div class="btn-row">
        <button
          v-if="auth.hasPermission('accounting:post')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="openManualJournalModal"
        >
          + Buat Jurnal Umum
        </button>
        <button type="button" class="btn btn-sm" @click="loadAll">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Muat Ulang
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
      title="Peringatan Validasi Akuntansi"
      :message="actionError"
      @dismiss="actionError = ''"
    />

    <div class="tab-bar" role="tablist" style="margin-bottom: 20px;">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'ledger' }"
        @click="activeTab = 'ledger'"
      >
        1. Buku Besar &amp; Neraca Saldo
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'journals' }"
        @click="activeTab = 'journals'"
      >
        2. Jurnal Umum ({{ journals.length }})
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'aging' }"
        @click="activeTab = 'aging'"
      >
        3. Umur Piutang (AR) &amp; Utang (AP)
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'coa' }"
        @click="activeTab = 'coa'"
      >
        4. COA, Pajak &amp; Aset Tetap
      </button>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Buku Besar & Jurnal Umum"
      message="Mengambil buku besar, neraca saldo, jurnal umum, umur piutang/utang, dan daftar akun..."
    />
    <StateBanner
      v-else-if="error"
      state="error"
      title="Gagal Memuat Data Akuntansi"
      :message="error"
      actionLabel="Coba Lagi"
      @action="loadAll"
    />

    <template v-if="!loading && !error">
      <!-- TAB 1: GENERAL LEDGER & TRIAL BALANCE -->
      <div v-if="activeTab === 'ledger'" class="erp-stack">
        <div class="erp-card erp-card-pad erp-row-between">
          <div>
            <span class="erp-badge erp-badge-demo">KONTROL NERACA SALDO (TRIAL BALANCE)</span>
            <h2 class="erp-section-title" style="margin-top: 6px;">
              Status Keseimbangan Buku Besar:
              <StatusBadge :status="trialBalance.isBalanced ? 'MATCHED' : 'DISCREPANCY'" />
            </h2>
            <p class="erp-subtitle">
              Seluruh saldo buku besar diturunkan langsung dari baris jurnal terposting (Double-Entry).
            </p>
          </div>
          <div class="erp-row">
            <div style="text-align: right; margin-right: 16px;">
              <div class="erp-kpi-label">Total Akumulasi Debit</div>
              <div class="erp-money" style="font-size: 1.15rem; font-weight: 700;">
                {{ formatIdr(trialBalance.totalDebit) }}
              </div>
            </div>
            <div style="text-align: right;">
              <div class="erp-kpi-label">Total Akumulasi Kredit</div>
              <div class="erp-money" style="font-size: 1.15rem; font-weight: 700;">
                {{ formatIdr(trialBalance.totalCredit) }}
              </div>
            </div>
          </div>
        </div>

        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Ringkasan Neraca Saldo &amp; Buku Besar per Akun</h3>
              <p class="erp-subtitle">Pilih akun untuk meninjau rincian mutasi transaksi (Running Balance)</p>
            </div>
            <div class="erp-row">
              <select v-model="selectedLedgerAccount" class="erp-select" style="max-width: 300px;" aria-label="Filter Akun Buku Besar">
                <option value="">Semua Akun Aktif</option>
                <option v-for="acc in ledgerAccounts" :key="acc.accountCode" :value="acc.accountCode">
                  {{ acc.accountCode }} - {{ acc.accountName }}
                </option>
              </select>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kode Akun</th>
                  <th>Nama Akun</th>
                  <th>Klasifikasi</th>
                  <th>Saldo Normal</th>
                  <th class="num">Total Debit</th>
                  <th class="num">Total Kredit</th>
                  <th class="num">Saldo Akhir</th>
                  <th>Rincian</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="acc in filteredLedgerAccounts" :key="acc.accountCode">
                  <td><code>{{ acc.accountCode }}</code></td>
                  <td style="font-weight: 600;">{{ acc.accountName }}</td>
                  <td><span class="erp-badge erp-badge-neutral">{{ acc.accountType }}</span></td>
                  <td>{{ acc.normalBalance }}</td>
                  <td class="num">{{ formatIdr(acc.totalDebit) }}</td>
                  <td class="num">{{ formatIdr(acc.totalCredit) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(acc.endingBalance) }}</td>
                  <td>
                    <button
                      type="button"
                      class="erp-btn erp-btn-secondary erp-btn-sm"
                      @click="activeDrilldownAccount = acc"
                    >
                      Mutasi ({{ acc.entries.length }})
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Drilldown Ledger Entries for Selected Account -->
        <section v-if="activeDrilldownAccount" class="erp-card">
          <div class="erp-card-header">
            <div>
              <span class="erp-badge erp-badge-info">RINCIAN BUKU BESAR (GENERAL LEDGER)</span>
              <h3 class="erp-section-title" style="margin-top: 4px;">
                {{ activeDrilldownAccount.accountCode }} - {{ activeDrilldownAccount.accountName }}
              </h3>
            </div>
            <button type="button" class="erp-btn erp-btn-ghost erp-btn-sm" @click="activeDrilldownAccount = null">
              Tutup Rincian
            </button>
          </div>
          <div v-if="activeDrilldownAccount.entries.length === 0" class="erp-card-pad erp-subtitle">
            Belum ada mutasi jurnal terposting pada akun ini.
          </div>
          <div v-else class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Jurnal</th>
                  <th>Tanggal</th>
                  <th>Unit</th>
                  <th>Sumber &amp; Ref</th>
                  <th>Uraian Mutasi</th>
                  <th class="num">Debit</th>
                  <th class="num">Kredit</th>
                  <th class="num">Saldo Berjalan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in activeDrilldownAccount.entries" :key="line.id">
                  <td><code>{{ line.journalNumber }}</code></td>
                  <td>{{ formatDate(line.entryDate) }}</td>
                  <td>{{ line.businessUnitCode }}</td>
                  <td>
                    <div style="font-size: 0.78rem; font-weight: 600;">{{ line.sourceType }}</div>
                    <code v-if="line.sourceDocNumber" style="font-size: 0.75rem;">{{ line.sourceDocNumber }}</code>
                  </td>
                  <td>{{ line.description }}</td>
                  <td class="num">{{ line.debit > 0 ? formatIdr(line.debit) : '-' }}</td>
                  <td class="num">{{ line.credit > 0 ? formatIdr(line.credit) : '-' }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(line.runningBalance) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 2: GENERAL JOURNAL & REVERSAL -->
      <div v-if="activeTab === 'journals'" class="erp-stack">
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Jurnal Umum (Posted &amp; Reversed Journals)</h3>
              <p class="erp-subtitle">
                Jurnal yang telah diposting bersifat permanen (immutable). Koreksi wajib menggunakan fitur Jurnal Pembalik (Reversal).
              </p>
            </div>
            <div class="erp-row">
              <input
                v-model="journalSearch"
                type="search"
                class="erp-input"
                placeholder="Cari nomor jurnal atau dokumen..."
                style="max-width: 260px;"
                aria-label="Cari jurnal umum"
              />
            </div>
          </div>

          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Jurnal</th>
                  <th>Tanggal</th>
                  <th>Periode</th>
                  <th>Unit</th>
                  <th>Sumber Transaksi</th>
                  <th>Uraian &amp; Rincian Baris</th>
                  <th class="num">Total Debit</th>
                  <th class="num">Total Kredit</th>
                  <th>Status</th>
                  <th>Tindakan Koreksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="jrn in paginatedJournals" :key="jrn.id">
                  <td><code>{{ jrn.journalNumber }}</code></td>
                  <td>{{ formatDate(jrn.entryDate) }}</td>
                  <td><code>{{ jrn.fiscalPeriod?.code }}</code></td>
                  <td>{{ jrn.businessUnit?.code }}</td>
                  <td>
                    <div style="font-weight: 600; font-size: 0.8rem;">{{ jrn.sourceType }}</div>
                    <code v-if="jrn.sourceDocNumber" style="font-size: 0.75rem;">{{ jrn.sourceDocNumber }}</code>
                  </td>
                  <td>
                    <div style="font-weight: 600;">{{ jrn.description }}</div>
                    <div
                      v-for="l in jrn.lines"
                      :key="l.id"
                      style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 2px;"
                    >
                      <code>{{ l.accountCode }}</code> {{ l.account?.name }}:
                      <span v-if="l.debit > 0">D {{ formatIdr(l.debit) }}</span>
                      <span v-if="l.credit > 0">K {{ formatIdr(l.credit) }}</span>
                    </div>
                    <div v-if="jrn.reversalReason" style="font-size: 0.75rem; color: var(--danger-text); margin-top: 4px;">
                      Alasan Reversal: {{ jrn.reversalReason }}
                    </div>
                  </td>
                  <td class="num">{{ formatIdr(jrn.totalDebit) }}</td>
                  <td class="num">{{ formatIdr(jrn.totalCredit) }}</td>
                  <td><StatusBadge :status="jrn.status" /></td>
                  <td>
                    <button
                      v-if="jrn.status === 'POSTED' && auth.hasPermission('accounting:post')"
                      type="button"
                      class="erp-btn erp-btn-danger erp-btn-sm"
                      @click="openReverseModal(jrn)"
                    >
                      Jurnal Pembalik
                    </button>
                    <span v-else class="erp-subtitle">Terkunci</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <PaginationControl
              v-model:currentPage="jrnPage"
              v-model:pageSize="jrnPageSize"
              :totalItems="totalJournals"
              itemLabel="entri jurnal"
            />
          </div>
        </section>
      </div>

      <!-- TAB 3: AR & AP AGING -->
      <div v-if="activeTab === 'aging'" class="erp-stack">
        <div class="erp-kpi-grid">
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Saldo Piutang Usaha (AR Outstanding)</span>
            <span class="erp-kpi-value">{{ formatIdr(agingData.arTotalBalance) }}</span>
            <span class="erp-kpi-sub">{{ agingData.arItems.length }} faktur pelanggan belum lunas</span>
          </div>
          <div class="erp-card erp-kpi-card">
            <span class="erp-kpi-label">Total Saldo Utang Usaha (AP Outstanding)</span>
            <span class="erp-kpi-value">{{ formatIdr(agingData.apTotalBalance) }}</span>
            <span class="erp-kpi-sub">{{ agingData.apItems.length }} faktur vendor belum dibayar lunas</span>
          </div>
        </div>

        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Analisis Umur Piutang Pelanggan (Accounts Receivable Aging)</h3>
              <p class="erp-subtitle">Klasifikasi jatuh tempo tagihan pelanggan korporat &amp; ritel</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Invoice</th>
                  <th>Pelanggan</th>
                  <th>Unit</th>
                  <th>Jatuh Tempo</th>
                  <th>Hari Lewat</th>
                  <th>Kelompok Umur</th>
                  <th class="num">Total Tagihan</th>
                  <th class="num">Terbayar</th>
                  <th class="num">Sisa Piutang</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ar in agingData.arItems" :key="ar.id">
                  <td><code>{{ ar.docNumber }}</code></td>
                  <td style="font-weight: 600;">{{ ar.partyName }}</td>
                  <td>{{ ar.businessUnitName }}</td>
                  <td>{{ formatDate(ar.dueDate) }}</td>
                  <td class="num">{{ ar.daysOverdue }} hari</td>
                  <td><span class="erp-badge erp-badge-warning">{{ ar.agingBucket }}</span></td>
                  <td class="num">{{ formatIdr(ar.totalAmount) }}</td>
                  <td class="num">{{ formatIdr(ar.paidAmount) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(ar.balanceDue) }}</td>
                  <td><StatusBadge :status="ar.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Analisis Umur Utang Vendor (Accounts Payable Aging)</h3>
              <p class="erp-subtitle">Tagihan pemasok barang/jasa beserta status pencocokan 3-Way Match</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>No. Internal</th>
                  <th>No. Faktur Vendor</th>
                  <th>Pemasok (Vendor)</th>
                  <th>Ref PO</th>
                  <th>Jatuh Tempo</th>
                  <th>Kelompok Umur</th>
                  <th>3-Way Match</th>
                  <th class="num">Total Tagihan</th>
                  <th class="num">Sisa Utang</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ap in agingData.apItems" :key="ap.id">
                  <td><code>{{ ap.docNumber }}</code></td>
                  <td><code>{{ ap.vendorInvoiceNumber }}</code></td>
                  <td style="font-weight: 600;">{{ ap.partyName }}</td>
                  <td><code>{{ ap.poDocNumber || '-' }}</code></td>
                  <td>{{ formatDate(ap.dueDate) }}</td>
                  <td><span class="erp-badge erp-badge-info">{{ ap.agingBucket }}</span></td>
                  <td><StatusBadge :status="ap.matchingStatus" /></td>
                  <td class="num">{{ formatIdr(ap.totalAmount) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(ap.balanceDue) }}</td>
                  <td><StatusBadge :status="ap.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 4: COA, TAX SUMMARY & FIXED ASSETS -->
      <div v-if="activeTab === 'coa'" class="erp-stack">
        <div class="erp-grid-2">
          <section class="erp-card erp-card-pad">
            <span class="erp-badge erp-badge-info">REKAPITULASI PAJAK INTERNAL</span>
            <h3 class="erp-section-title" style="margin-top: 6px;">Posisi PPN Keluaran vs PPN Masukan</h3>
            <div class="erp-stack" style="margin-top: 12px;">
              <div class="erp-row-between">
                <span>Total PPN Keluaran (Faktur Pelanggan):</span>
                <strong class="erp-money">{{ formatIdr(assetsTaxData.taxSummary.ppnOutputTotal) }}</strong>
              </div>
              <div class="erp-row-between">
                <span>Total PPN Masukan (Faktur Vendor &amp; Beban):</span>
                <strong class="erp-money">{{ formatIdr(assetsTaxData.taxSummary.ppnInputTotal) }}</strong>
              </div>
              <div class="erp-row-between" style="border-top: 1px solid var(--border-subtle); padding-top: 8px;">
                <span>Estimasi Kurang/(Lebih) Bayar PPN:</span>
                <strong class="erp-money" style="font-size: 1.05rem;">
                  {{ formatIdr(assetsTaxData.taxSummary.netVatPosition) }}
                </strong>
              </div>
              <p class="erp-subtitle" style="margin-top: 8px;">
                {{ assetsTaxData.taxSummary.disclaimer }}
              </p>
            </div>
          </section>

          <section class="erp-card erp-card-pad">
            <div class="erp-row-between">
              <div>
                <h3 class="erp-section-title">Konfigurasi Tarif Pajak (Configurable Tax)</h3>
                <p class="erp-subtitle">Tarif pajak dikelola secara dinamis sesuai regulasi</p>
              </div>
            </div>
            <div class="erp-table-wrap" style="margin-top: 12px;">
              <table class="erp-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Pajak</th>
                    <th class="num">Tarif (%)</th>
                    <th>Akun COA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="tax in assetsTaxData.taxConfigurations" :key="tax.id">
                    <td><code>{{ tax.taxCode }}</code></td>
                    <td style="font-weight: 600;">{{ tax.name }}</td>
                    <td class="num">{{ tax.ratePercent }}%</td>
                    <td><code>{{ tax.accountCode }}</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Daftar Aset Tetap &amp; Inventaris (Fixed Assets Register)</h3>
              <p class="erp-subtitle">Pencatatan nilai perolehan, umur ekonomis, lokasi, dan nilai buku</p>
            </div>
            <button
              v-if="auth.hasPermission('accounting:manage')"
              type="button"
              class="erp-btn erp-btn-secondary erp-btn-sm"
              @click="showAssetModal = true"
            >
              + Registrasi Aset Tetap
            </button>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kode Aset</th>
                  <th>Nama Aset Tetap</th>
                  <th>Kategori</th>
                  <th>Unit &amp; Lokasi</th>
                  <th>Tgl Perolehan</th>
                  <th class="num">Harga Perolehan</th>
                  <th class="num">Akum. Penyusutan</th>
                  <th class="num">Nilai Buku Bersih</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ast in assetsTaxData.fixedAssets" :key="ast.id">
                  <td><code>{{ ast.assetCode }}</code></td>
                  <td style="font-weight: 600;">{{ ast.name }}</td>
                  <td>{{ ast.category }}</td>
                  <td>{{ ast.businessUnit?.code }} - {{ ast.location }}</td>
                  <td>{{ formatDate(ast.acquisitionDate) }}</td>
                  <td class="num">{{ formatIdr(ast.acquisitionCost) }}</td>
                  <td class="num">{{ formatIdr(ast.accumulatedDepreciation) }}</td>
                  <td class="num" style="font-weight: 700;">{{ formatIdr(ast.bookValue) }}</td>
                  <td><StatusBadge :status="ast.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Bagan Akun Standar (Chart of Accounts)</h3>
              <p class="erp-subtitle">Struktur akun buku besar untuk seluruh unit PMO Utama</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kode Akun</th>
                  <th>Nama Akun</th>
                  <th>Tipe</th>
                  <th>Saldo Normal</th>
                  <th>Akun Kontrol</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in coaList" :key="c.id">
                  <td><code>{{ c.code }}</code></td>
                  <td style="font-weight: 600;">{{ c.name }}</td>
                  <td><span class="erp-badge erp-badge-neutral">{{ c.type }}</span></td>
                  <td>{{ c.normalBalance }}</td>
                  <td>{{ c.isControlAccount ? 'Ya (Control Account)' : 'Tidak' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <!-- MODAL: MANUAL BALANCED JOURNAL -->
    <ModalDialog :open="showJournalModal" title="Posting Jurnal Umum Berimbang (Double-Entry)" @close="showJournalModal = false">
      <form class="erp-stack" @submit.prevent="submitManualJournal">
        <div class="erp-grid-2">
          <div class="erp-field">
            <label class="erp-label" for="jrn-unit">Unit Bisnis</label>
            <select id="jrn-unit" v-model="journalForm.businessUnitId" class="erp-select" required>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="erp-field">
            <label class="erp-label" for="jrn-desc">Deskripsi / Uraian Jurnal</label>
            <input
              id="jrn-desc"
              v-model="journalForm.description"
              type="text"
              class="erp-input"
              placeholder="Contoh: Penyesuaian beban penyusutan bulanan"
              required
            />
          </div>
        </div>

        <div class="erp-card erp-card-pad" style="background: var(--bg-canvas);">
          <div class="erp-row-between" style="margin-bottom: 10px;">
            <span class="erp-label">Baris Jurnal (Wajib Total Debit = Total Kredit)</span>
            <button type="button" class="erp-btn erp-btn-secondary erp-btn-sm" @click="addJournalLine">
              + Tambah Baris
            </button>
          </div>

          <div v-for="(line, idx) in journalForm.lines" :key="idx" class="erp-grid-4" style="margin-bottom: 8px;">
            <select v-model="line.accountCode" class="erp-select" required aria-label="Pilih akun COA">
              <option v-for="c in coaList" :key="c.code" :value="c.code">{{ c.code }} - {{ c.name }}</option>
            </select>
            <input v-model="line.description" type="text" class="erp-input" placeholder="Keterangan baris" required />
            <input v-model.number="line.debit" type="number" min="0" class="erp-input" placeholder="Debit (IDR)" required />
            <input v-model.number="line.credit" type="number" min="0" class="erp-input" placeholder="Kredit (IDR)" required />
          </div>

          <div class="erp-row-between" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
            <span class="erp-money">Total Debit: <strong>{{ formatIdr(manualJournalDebitTotal) }}</strong></span>
            <span class="erp-money">Total Kredit: <strong>{{ formatIdr(manualJournalCreditTotal) }}</strong></span>
          </div>
        </div>

        <div class="erp-row" style="justify-content: flex-end;">
          <button type="button" class="erp-btn erp-btn-secondary" @click="showJournalModal = false">Batal</button>
          <button type="submit" class="erp-btn erp-btn-primary" :disabled="submitting">
            {{ submitting ? 'Memposting...' : 'Posting Jurnal' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL: REVERSE JOURNAL -->
    <ModalDialog
      :open="Boolean(reverseTarget)"
      :title="`Jurnal Pembalik (Reversal): ${reverseTarget?.journalNumber || ''}`"
      @close="reverseTarget = null"
    >
      <form class="erp-stack" @submit.prevent="submitReverseJournal">
        <p class="erp-subtitle">
          Sistem akan membuat entri jurnal pembalik baru dengan menukar posisi Debit dan Kredit secara utuh tanpa menghapus jejak jurnal asli.
        </p>
        <div class="erp-field">
          <label class="erp-label" for="rev-reason">Alasan Pembalikan Jurnal (Wajib untuk Audit Trail)</label>
          <textarea
            id="rev-reason"
            v-model="reverseReason"
            class="erp-textarea"
            placeholder="Contoh: Koreksi klasifikasi akun beban pada pencatatan manual"
            required
          ></textarea>
        </div>
        <div class="erp-row" style="justify-content: flex-end;">
          <button type="button" class="erp-btn erp-btn-secondary" @click="reverseTarget = null">Batal</button>
          <button type="submit" class="erp-btn erp-btn-danger" :disabled="submitting">
            {{ submitting ? 'Memproses...' : 'Eksekusi Jurnal Pembalik' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL: REGISTER FIXED ASSET -->
    <ModalDialog :open="showAssetModal" title="Registrasi Aset Tetap Baru" @close="showAssetModal = false">
      <form class="erp-stack" @submit.prevent="submitAsset">
        <div class="erp-grid-2">
          <div class="erp-field">
            <label class="erp-label" for="ast-name">Nama Aset Tetap</label>
            <input id="ast-name" v-model="assetForm.name" type="text" class="erp-input" placeholder="Contoh: Generator Cadangan 20 kVA" required />
          </div>
          <div class="erp-field">
            <label class="erp-label" for="ast-cat">Kategori</label>
            <input id="ast-cat" v-model="assetForm.category" type="text" class="erp-input" placeholder="Contoh: PERALATAN_TEKNIS" required />
          </div>
        </div>
        <div class="erp-grid-3">
          <div class="erp-field">
            <label class="erp-label" for="ast-unit">Unit Bisnis</label>
            <select id="ast-unit" v-model="assetForm.businessUnitId" class="erp-select" required>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
          <div class="erp-field">
            <label class="erp-label" for="ast-cost">Harga Perolehan (IDR)</label>
            <input id="ast-cost" v-model.number="assetForm.acquisitionCost" type="number" min="100000" class="erp-input" required />
          </div>
          <div class="erp-field">
            <label class="erp-label" for="ast-life">Umur Ekonomis (Bulan)</label>
            <input id="ast-life" v-model.number="assetForm.usefulLifeMonths" type="number" min="12" class="erp-input" required />
          </div>
        </div>
        <div class="erp-field">
          <label class="erp-label" for="ast-loc">Lokasi Penempatan Fisik</label>
          <input id="ast-loc" v-model="assetForm.location" type="text" class="erp-input" placeholder="Contoh: Ruang Server Lt. 2 PMO Pusat" required />
        </div>
        <div class="erp-row" style="justify-content: flex-end;">
          <button type="button" class="erp-btn erp-btn-secondary" @click="showAssetModal = false">Batal</button>
          <button type="submit" class="erp-btn erp-btn-primary" :disabled="submitting">Simpan Aset Tetap</button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { formatIdr, formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import { usePagination } from '../composables/usePagination';

const auth = useAuthStore();
const activeTab = ref<'ledger' | 'journals' | 'aging' | 'coa'>('ledger');
const loading = ref(true);
const error = ref('');
const feedbackMsg = ref('');
const actionError = ref('');
const submitting = ref(false);

const ledgerAccounts = ref<any[]>([]);
const trialBalance = ref({ totalDebit: 0, totalCredit: 0, isBalanced: true });
const selectedLedgerAccount = ref('');
const activeDrilldownAccount = ref<any | null>(null);

const journals = ref<any[]>([]);
const journalSearch = ref('');

const agingData = ref<{ arItems: any[]; apItems: any[]; arTotalBalance: number; apTotalBalance: number }>({
  arItems: [],
  apItems: [],
  arTotalBalance: 0,
  apTotalBalance: 0,
});

const assetsTaxData = ref<{ fixedAssets: any[]; taxConfigurations: any[]; taxSummary: any }>({
  fixedAssets: [],
  taxConfigurations: [],
  taxSummary: { ppnOutputTotal: 0, ppnInputTotal: 0, netVatPosition: 0, disclaimer: '' },
});

const coaList = ref<any[]>([]);
const masterUnits = ref<any[]>([]);

const showJournalModal = ref(false);
const journalForm = ref({
  businessUnitId: '',
  description: '',
  lines: [
    { accountCode: '5-1400', description: 'Beban Operasional Kantor', debit: 1500000, credit: 0 },
    { accountCode: '1-1120', description: 'Pengeluaran Bank Mandiri Operasional', debit: 0, credit: 1500000 },
  ],
});

const reverseTarget = ref<any | null>(null);
const reverseReason = ref('');

const showAssetModal = ref(false);
const assetForm = ref({
  name: '',
  category: 'PERALATAN_TI',
  businessUnitId: '',
  acquisitionDate: new Date().toISOString().slice(0, 10),
  acquisitionCost: 18500000,
  usefulLifeMonths: 48,
  location: 'Gedung Operasional PMO Utama',
});

const filteredLedgerAccounts = computed(() => {
  if (!selectedLedgerAccount.value) return ledgerAccounts.value;
  return ledgerAccounts.value.filter((a) => a.accountCode === selectedLedgerAccount.value);
});

const filteredJournals = computed(() => {
  if (!journalSearch.value.trim()) return journals.value;
  const q = journalSearch.value.toLowerCase();
  return journals.value.filter(
    (j) =>
      j.journalNumber.toLowerCase().includes(q) ||
      j.description.toLowerCase().includes(q) ||
      (j.sourceDocNumber && j.sourceDocNumber.toLowerCase().includes(q))
  );
});

const {
  currentPage: jrnPage,
  pageSize: jrnPageSize,
  totalItems: totalJournals,
  paginatedItems: paginatedJournals,
} = usePagination(filteredJournals, 5);

const manualJournalDebitTotal = computed(() =>
  journalForm.value.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0)
);
const manualJournalCreditTotal = computed(() =>
  journalForm.value.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0)
);

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const [ledgerRes, jrnRes, agingRes, assetTaxRes, coaRes, masterRes] = await Promise.all([
      api.get<any>('/accounting/ledger'),
      api.get<any[]>('/accounting/journals'),
      api.get<any>('/accounting/ar-ap-aging'),
      api.get<any>('/accounting/assets-and-tax'),
      api.get<any>('/accounting/coa'),
      api.get<any>('/master/overview'),
    ]);

    ledgerAccounts.value = ledgerRes.data.accounts;
    trialBalance.value = ledgerRes.data.trialBalanceSummary;
    journals.value = jrnRes.data;
    agingData.value = agingRes.data;
    assetsTaxData.value = assetTaxRes.data;
    coaList.value = coaRes.data.accounts;
    masterUnits.value = masterRes.data.businessUnits;

    if (masterUnits.value.length > 0 && !journalForm.value.businessUnitId) {
      journalForm.value.businessUnitId = masterUnits.value[0].id;
      assetForm.value.businessUnitId = masterUnits.value[0].id;
    }
  } catch (err: any) {
    error.value = err.message || 'Gagal memuat data akuntansi.';
  } finally {
    loading.value = false;
  }
}

function openManualJournalModal() {
  actionError.value = '';
  showJournalModal.value = true;
}

function addJournalLine() {
  journalForm.value.lines.push({
    accountCode: coaList.value[0]?.code || '1120',
    description: 'Baris jurnal tambahan',
    debit: 0,
    credit: 0,
  });
}

async function submitManualJournal() {
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>('/accounting/journals', journalForm.value);
    feedbackMsg.value = `Jurnal umum ${res.data.journalNumber} berhasil diposting ke Buku Besar.`;
    showJournalModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal memposting jurnal umum.';
  } finally {
    submitting.value = false;
  }
}

function openReverseModal(jrn: any) {
  reverseTarget.value = jrn;
  reverseReason.value = '';
}

async function submitReverseJournal() {
  if (!reverseTarget.value) return;
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>(`/accounting/journals/${reverseTarget.value.id}/reverse`, {
      reason: reverseReason.value,
    });
    feedbackMsg.value = `Jurnal pembalik ${res.data.reversal.journalNumber} berhasil diterbitkan.`;
    reverseTarget.value = null;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal memproses jurnal pembalik.';
  } finally {
    submitting.value = false;
  }
}

async function submitAsset() {
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>('/accounting/assets', assetForm.value);
    feedbackMsg.value = `Aset tetap ${res.data.assetCode} berhasil diregistrasi.`;
    showAssetModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menyimpan aset tetap.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadAll);
</script>
