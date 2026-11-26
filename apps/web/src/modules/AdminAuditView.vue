<template>
  <div class="admin-audit-view">
    <div class="page-header">
      <div>
        <h1 class="page-title">Pengaturan & Jejak Audit</h1>
        <p class="page-desc">
          Manajemen peran, hak akses personel, dan rekaman audit sistem.
        </p>
      </div>
      <div class="btn-row">
        <button
          v-if="auth.hasPermission('admin:manage')"
          type="button"
          class="btn btn-sm"
          @click="openCreateRoleModal"
        >
          + Tambah Role Baru
        </button>
        <button
          v-if="auth.hasPermission('admin:manage')"
          type="button"
          class="btn btn-sm btn-primary"
          @click="showUserModal = true"
        >
          + Tambah Pengguna
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
      title="Peringatan Administrasi"
      :message="actionError"
      @dismiss="actionError = ''"
    />

    <div class="tab-bar" role="tablist" style="margin-bottom: 20px;">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'roles' }"
        @click="activeTab = 'roles'"
      >
        1. Master Data Role &amp; Otorisasi Menu ({{ roles.length }})
      </button>
      <button
        v-if="auth.hasPermission('admin:view')"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'users' }"
        @click="activeTab = 'users'"
      >
        2. Manajemen Pengguna &amp; Personel ({{ users.length }})
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'periods' }"
        @click="activeTab = 'periods'"
      >
        3. Periode Fiskal &amp; Kebijakan Sistem
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'audit' }"
        @click="activeTab = 'audit'"
      >
        4. Jejak Audit Trail ({{ auditLogs.length }})
      </button>
    </div>

    <StateBanner
      v-if="loading"
      state="loading"
      title="Memuat Master Data &amp; Administrasi Sistem"
      message="Mengambil master role, matriks otorisasi menu, pengguna, periode fiskal, dan log audit..."
    />
    <StateBanner
      v-else-if="error"
      state="error"
      title="Gagal Memuat Data Administrasi"
      :message="error"
      actionLabel="Coba Lagi"
      @action="loadAll"
    />

    <template v-if="!loading && !error">
      <!-- TAB 1: MASTER DATA ROLES & MENU AUTHORIZATION MATRIX -->
      <div v-if="activeTab === 'roles'" class="erp-stack">
        <!-- Superadmin Info Callout -->
        <section class="erp-card superadmin-callout">
          <div class="callout-content">
            <div class="callout-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div>
              <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 2px;">
                Hak Akses Super Administrator &amp; Master Otorisasi Dinamis
              </h3>
              <p style="font-size: 0.83rem; color: var(--text-secondary); line-height: 1.4;">
                Akun dengan peran <strong>SUPER_ADMIN</strong> memiliki akses penuh (<code>*</code>) ke seluruh modul tanpa perlu penyesuaian kode saat deployment. Anda dapat menambahkan role custom, mengatur batas plafon persetujuan, serta mencentang izin buka menu dan tindakan operasional per masing-masing peran di bawah ini.
              </p>
            </div>
          </div>
          <button
            v-if="auth.hasPermission('admin:manage')"
            type="button"
            class="btn btn-sm btn-primary"
            style="white-space: nowrap; align-self: flex-start;"
            @click="openCreateRoleModal"
          >
            + Tambah Role Baru
          </button>
        </section>

        <!-- Master Roles Table -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Daftar Master Peran (RBAC) &amp; Batas Approval</h3>
              <p class="erp-subtitle">Tabel master role dengan ringkasan jumlah personel terdaftar dan jumlah hak akses menu</p>
            </div>
          </div>

          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kode Peran</th>
                  <th>Nama Peran</th>
                  <th>Deskripsi Wewenang</th>
                  <th class="money-col">Limit Otorisasi (IDR)</th>
                  <th style="text-align: center;">Personel</th>
                  <th>Cakupan Menu &amp; Izin</th>
                  <th style="text-align: right;">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in roles" :key="r.id">
                  <td>
                    <span class="doc-code" style="font-weight: 700;">{{ r.code }}</span>
                  </td>
                  <td style="font-weight: 600;">{{ r.name }}</td>
                  <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 280px;">
                    {{ r.description }}
                  </td>
                  <td class="money-col">
                    <strong v-if="r.approvalLimit > 0">{{ formatRupiah(r.approvalLimit) }}</strong>
                    <span v-else class="text-secondary">-</span>
                  </td>
                  <td style="text-align: center;">
                    <span class="erp-badge" :class="r.userCount > 0 ? 'erp-badge-info' : ''">
                      {{ r.userCount || 0 }} akun
                    </span>
                  </td>
                  <td>
                    <div v-if="r.permissions.includes('*')">
                      <span class="erp-badge erp-badge-success" style="font-weight: 700;">★ SEMUA MENU &amp; FITUR (*)</span>
                    </div>
                    <div v-else class="permission-pills-wrap">
                      <span class="erp-badge erp-badge-info">{{ r.permissions.length }} izin aktif</span>
                      <small class="text-secondary" style="margin-left: 6px;">
                        ({{ getRoleMenuSummary(r.permissions) }})
                      </small>
                    </div>
                  </td>
                  <td style="text-align: right;">
                    <div class="btn-row" style="justify-content: flex-end; gap: 6px;">
                      <button
                        type="button"
                        class="btn btn-sm btn-primary"
                        title="Atur Matriks Otorisasi Menu & Fitur"
                        @click="openAuthMatrixModal(r)"
                      >
                        Atur Izin Menu
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        title="Ubah Detail Role"
                        @click="openEditRoleModal(r)"
                      >
                        Ubah
                      </button>
                      <button
                        v-if="!isCoreRole(r.code)"
                        type="button"
                        class="btn btn-sm btn-ghost"
                        style="color: var(--status-danger-text);"
                        :disabled="r.userCount > 0"
                        title="Hapus Role Custom"
                        @click="deleteRole(r)"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 2: USER MANAGEMENT -->
      <div v-if="activeTab === 'users'" class="erp-stack">
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Daftar Akun Personel &amp; Unit Bisnis</h3>
              <p class="erp-subtitle">Kelola penugasan peran (role), unit bisnis operasional, status aktif akun, dan reset kata sandi</p>
            </div>
            <button
              v-if="auth.hasPermission('admin:manage')"
              type="button"
              class="btn btn-sm btn-primary"
              @click="showUserModal = true"
            >
              + Tambah Pengguna Baru
            </button>
          </div>

          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Nama Lengkap</th>
                  <th>Email Login</th>
                  <th>Kode Role</th>
                  <th>Nama Peran</th>
                  <th>Cakupan Unit Bisnis</th>
                  <th>Status Akun</th>
                  <th style="text-align: right;">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.id">
                  <td style="font-weight: 600;">{{ u.fullName }}</td>
                  <td><code>{{ u.email }}</code></td>
                  <td><span class="doc-code">{{ u.roleCode }}</span></td>
                  <td>{{ u.roleName }}</td>
                  <td>{{ u.businessUnitName }}</td>
                  <td>
                    <StatusBadge :status="u.isActive ? 'APPROVED' : 'VOID'" />
                  </td>
                  <td style="text-align: right;">
                    <div class="btn-row" style="justify-content: flex-end; gap: 6px;">
                      <button
                        type="button"
                        class="btn btn-sm"
                        @click="openEditUserModal(u)"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        @click="openResetPassModal(u)"
                      >
                        Reset Password
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- TAB 3: FISCAL PERIODS & SYSTEM SETTINGS -->
      <div v-if="activeTab === 'periods'" class="erp-stack">
        <!-- Fiscal Periods -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Periode Fiskal Akuntansi &amp; Kunci Tutup Buku</h3>
              <p class="erp-subtitle">Periode fiskal terkunci mencegah mutasi jurnal mundur demi kepatuhan audit PSAK</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kode Periode</th>
                  <th>Nama Periode</th>
                  <th>Rentang Waktu</th>
                  <th>Status</th>
                  <th>Catatan / Tanggal Kunci</th>
                  <th>Tindakan Otorisasi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fp in fiscalPeriods" :key="fp.id">
                  <td><strong>{{ fp.code }}</strong></td>
                  <td>{{ fp.name }}</td>
                  <td>{{ formatDate(fp.startDate) }} s/d {{ formatDate(fp.endDate) }}</td>
                  <td>
                    <StatusBadge :status="fp.isClosed ? 'VOID' : 'APPROVED'" />
                  </td>
                  <td>
                    <span v-if="fp.isClosed && fp.closedAt" class="text-secondary">
                      Ditutup: {{ formatDateTime(fp.closedAt) }}
                    </span>
                    <span v-else-if="fp.reopenReason" class="text-secondary">
                      Reopen: {{ fp.reopenReason }}
                    </span>
                    <span v-else class="text-secondary">Aktif menerima jurnal</span>
                  </td>
                  <td>
                    <div class="btn-row">
                      <button
                        v-if="!fp.isClosed"
                        type="button"
                        class="btn btn-sm btn-warning"
                        :disabled="submitting"
                        @click="closePeriod(fp)"
                      >
                        Tutup Buku (Lock)
                      </button>
                      <button
                        v-else
                        type="button"
                        class="btn btn-sm"
                        :disabled="submitting"
                        @click="openReopenModal(fp)"
                      >
                        Buka Kembali (Reopen)
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- System Settings -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Kebijakan Global &amp; Parameter Batas Sistem</h3>
              <p class="erp-subtitle">Pengaturan toleransi selisih kasir, eskalasi approval, dan audit perbankan</p>
            </div>
          </div>
          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Kunci Parameter</th>
                  <th>Nilai Parameter</th>
                  <th>Kategori</th>
                  <th>Deskripsi Kebijakan</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cfg in systemSettings" :key="cfg.id">
                  <td><code>{{ cfg.key }}</code></td>
                  <td><strong>{{ cfg.value }}</strong></td>
                  <td><span class="doc-code">{{ cfg.category }}</span></td>
                  <td class="text-secondary">{{ cfg.description }}</td>
                  <td>
                    <button type="button" class="btn btn-sm" @click="openSettingModal(cfg)">
                      Ubah Parameter
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Attachment Validation Security -->
        <section class="erp-card">
          <div class="erp-card-header">
            <div>
              <h3 class="erp-section-title">Validasi Keamanan Lampiran Dokumen Pendukung</h3>
              <p class="erp-subtitle">
                Memvalidasi tipe MIME (PDF, PNG, JPEG, CSV), ukuran maksimum 10 MB, dan sanitasi nama file penyimpanan.
              </p>
            </div>
          </div>
          <form class="erp-grid-4" style="margin-top: 12px; align-items: end;" @submit.prevent="submitAttachment">
            <div class="erp-field">
              <label class="erp-label" for="att-name">Nama File Dokumen</label>
              <input id="att-name" v-model="attachmentForm.displayName" type="text" class="erp-input" placeholder="Contoh: Berita_Acara_Penerimaan.pdf" required />
            </div>
            <div class="erp-field">
              <label class="erp-label" for="att-mime">Tipe File (MIME)</label>
              <select id="att-mime" v-model="attachmentForm.mimeType" class="erp-select" required>
                <option value="application/pdf">application/pdf (PDF)</option>
                <option value="image/png">image/png (PNG)</option>
                <option value="image/jpeg">image/jpeg (JPEG)</option>
                <option value="text/csv">text/csv (CSV)</option>
              </select>
            </div>
            <div class="erp-field">
              <label class="erp-label" for="att-entity">Referensi Dokumen</label>
              <input id="att-entity" v-model="attachmentForm.entityId" type="text" class="erp-input" placeholder="Contoh: PO-2026-0001" required />
            </div>
            <button type="submit" class="btn btn-sm" :disabled="submitting">
              Registrasi Lampiran Aman
            </button>
          </form>
        </section>
      </div>

      <!-- TAB 4: AUDIT TRAIL LOGS -->
      <div v-if="activeTab === 'audit'" class="erp-stack">
        <!-- Forensic KPI Stat Grid -->
        <div v-if="auditStats" class="erp-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 4px;">
          <div class="erp-card" style="padding: 14px;">
            <div style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Total Peristiwa Forensik</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-top: 4px;">{{ auditStats.totalEvents || auditLogs.length }}</div>
            <div style="font-size: 0.72rem; color: #10b981; margin-top: 2px;">Terproteksi Permanen (Append-Only)</div>
          </div>
          <div class="erp-card" style="padding: 14px;">
            <div style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Aktivitas Hari Ini</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #0284c7; margin-top: 4px;">{{ auditStats.todayEvents || 0 }} Mutasi</div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">Waktu Server Indonesia (WIB)</div>
          </div>
          <div class="erp-card" style="padding: 14px;">
            <div style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Modul Teraktif</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: #4f46e5; margin-top: 6px;">{{ Object.keys(auditStats.byModule || {})[0] || 'BUDGET' }}</div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">{{ Object.values(auditStats.byModule || {})[0] || 0 }} mutasi tercatat</div>
          </div>
          <div class="erp-card" style="padding: 14px;">
            <div style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Integritas Forensik</div>
            <div style="font-size: 1.15rem; font-weight: 700; color: #059669; margin-top: 6px;">100% Kebal Mutasi</div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">Strict HTTP 403 Immutability</div>
          </div>
        </div>

        <section class="erp-card">
          <div class="erp-card-header" style="flex-wrap: wrap; gap: 14px;">
            <div>
              <span class="erp-badge erp-badge-info">SERVER-SIDE IMMUTABLE AUDIT LOG</span>
              <h3 class="erp-section-title" style="margin-top: 4px;">
                Rekam Jejak Forensik Mutasi Data Keuangan
              </h3>
              <p class="erp-subtitle">
                Mencatat kronologi pelaku, peran, waktu server, IP client, entitas, dan perubahan nilai before-after.
              </p>
            </div>
            <div class="erp-row" style="gap: 8px; flex-wrap: wrap; align-items: center;">
              <button
                type="button"
                class="btn btn-sm"
                :disabled="isExportingCsv"
                @click="handleExportAuditCsv"
                title="Ekspor seluruh jejak audit sesuai filter ke berkas CSV"
              >
                <span>{{ isExportingCsv ? 'Mengekspor...' : 'Ekspor CSV Forensik' }}</span>
              </button>
            </div>
          </div>

          <!-- Multi-parameter Forensic Filters -->
          <div class="erp-row" style="gap: 10px; margin-bottom: 16px; flex-wrap: wrap; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <select v-model="auditModuleFilter" class="select" style="max-width: 160px;" aria-label="Filter Modul Audit" @change="loadAuditLogs">
              <option value="">Semua Modul</option>
              <option value="AUTH">AUTH</option>
              <option value="BUDGET">BUDGET</option>
              <option value="PROCUREMENT">PROCUREMENT</option>
              <option value="EXPENSE">EXPENSE</option>
              <option value="REVENUE">REVENUE</option>
              <option value="CASHIER">CASHIER</option>
              <option value="RECONCILIATION">RECONCILIATION</option>
              <option value="ACCOUNTING">ACCOUNTING</option>
              <option value="APPROVAL">APPROVAL</option>
              <option value="ASSET">ASSET</option>
              <option value="PETTY_CASH">PETTY_CASH</option>
              <option value="HRIS">HRIS</option>
              <option value="ADMIN">ADMIN</option>
            </select>

            <select v-model="auditActionFilter" class="select" style="max-width: 160px;" aria-label="Filter Aksi Audit" @change="loadAuditLogs">
              <option value="">Semua Aksi</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="SUBMIT">SUBMIT</option>
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
              <option value="REVISE">REVISE</option>
              <option value="REVERSE">REVERSE</option>
              <option value="DELETE_BLOCKED">DELETE_BLOCKED</option>
            </select>

            <input
              v-model="auditStartDate"
              type="date"
              class="input"
              style="max-width: 150px;"
              title="Dari Tanggal"
              @change="loadAuditLogs"
            />

            <input
              v-model="auditEndDate"
              type="date"
              class="input"
              style="max-width: 150px;"
              title="Sampai Tanggal"
              @change="loadAuditLogs"
            />

            <input
              v-model="auditSearch"
              type="search"
              class="input"
              placeholder="Cari pelaku / ringkasan / entitas..."
              style="flex: 1; min-width: 220px;"
              @input="loadAuditLogs"
            />
          </div>

          <div class="erp-table-wrap">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Waktu Server (WIB)</th>
                  <th>Pelaku (Actor)</th>
                  <th>Role</th>
                  <th>Modul</th>
                  <th>Aksi</th>
                  <th>Entitas Dokumen</th>
                  <th>Ringkasan Jejak Audit</th>
                  <th style="text-align: center;">Tindakan Forensik</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in paginatedLogs" :key="log.id">
                  <td>{{ formatDateTime(log.createdAt) }}</td>
                  <td><strong>{{ log.actorName }}</strong></td>
                  <td><span class="doc-code">{{ log.actorRole }}</span></td>
                  <td><span class="doc-code">{{ log.module }}</span></td>
                  <td>
                    <span
                      class="erp-badge"
                      :class="{
                        'erp-badge-success': ['APPROVE', 'CREATE'].includes(log.action),
                        'erp-badge-danger': ['REJECT', 'REVERSE', 'DELETE_BLOCKED'].includes(log.action),
                        'erp-badge-info': ['SUBMIT', 'REVISE', 'UPDATE'].includes(log.action)
                      }"
                    >
                      {{ log.action }}
                    </span>
                  </td>
                  <td>
                    <span v-if="log.entityCode" class="doc-code">{{ log.entityCode }}</span>
                    <span v-else class="text-secondary">{{ log.entityType }}</span>
                  </td>
                  <td style="max-width: 300px;">
                    <div>{{ log.summary }}</div>
                    <small v-if="log.requestId" class="text-secondary" style="font-size: 0.7rem;">ID: {{ log.requestId }}</small>
                  </td>
                  <td style="text-align: center;">
                    <button
                      type="button"
                      class="btn btn-sm"
                      style="font-size: 0.75rem; padding: 4px 10px;"
                      @click="openAuditDetail(log)"
                      title="Buka perbandingan nilai mutasi sebelum vs sesudah"
                    >
                      Lihat Diff / Detail
                    </button>
                  </td>
                </tr>
                <tr v-if="paginatedLogs.length === 0">
                  <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-secondary);">
                    Tidak ditemukan jejak audit yang sesuai dengan parameter filter.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <PaginationControl
            v-model:currentPage="logPage"
            v-model:pageSize="logPageSize"
            :totalItems="totalLogs"
            itemLabel="log audit"
          />
        </section>
      </div>
    </template>

    <!-- MODAL 1: AUTHORIZATION MATRIX / MENU PERMISSION CONFIGURATION -->
    <ModalDialog
      :open="showAuthMatrixModal"
      :title="`Matriks Otorisasi Akses Menu: ${selectedRoleForMatrix?.name || ''} (${selectedRoleForMatrix?.code || ''})`"
      @close="showAuthMatrixModal = false"
    >
      <div class="auth-matrix-modal-content">
        <div class="matrix-header-bar">
          <p class="erp-subtitle" style="margin: 0;">
            Centang menu dan tindakan operasional yang diizinkan untuk peran ini.
          </p>
          <div class="btn-row" style="gap: 6px;">
            <button type="button" class="btn btn-sm" @click="setMatrixMode('ALL')">
              Pilih Semua Izin (*)
            </button>
            <button type="button" class="btn btn-sm" @click="setMatrixMode('READ_ONLY')">
              Hanya Baca (Read-Only)
            </button>
            <button type="button" class="btn btn-sm btn-ghost" @click="setMatrixMode('NONE')">
              Kosongkan Pilihan
            </button>
          </div>
        </div>

        <!-- Superadmin wildcard indicator -->
        <div v-if="matrixPermissions.includes('*')" class="wildcard-alert-box">
          <span class="erp-badge erp-badge-success">SUPER ADMIN WILDCARD (*)</span>
          <span>Peran ini memiliki akses penuh ke seluruh menu dan seluruh tindakan operasional secara otomatis.</span>
        </div>

        <div class="matrix-groups-list">
          <div v-for="menu in menusRegistry" :key="menu.id" class="menu-permission-card">
            <div class="menu-card-header">
              <div class="menu-title-row">
                <strong>{{ menu.name }}</strong>
                <span class="doc-code">{{ menu.route }}</span>
              </div>
              <p class="menu-desc">{{ menu.description }}</p>
            </div>

            <div class="permissions-checkbox-grid">
              <label
                v-for="perm in menu.permissions"
                :key="perm.code"
                class="permission-checkbox-label"
                :class="{ active: isPermissionChecked(perm.code) }"
              >
                <input
                  type="checkbox"
                  :value="perm.code"
                  :checked="isPermissionChecked(perm.code)"
                  :disabled="matrixPermissions.includes('*')"
                  @change="togglePermission(perm.code)"
                />
                <div class="perm-text-block">
                  <span class="perm-label">{{ perm.label }}</span>
                  <code class="perm-code">{{ perm.code }}</code>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="modal-footer-row">
          <div class="active-count-indicator">
            Total izin terpilih: <strong>{{ matrixPermissions.includes('*') ? 'Semua (*)' : matrixPermissions.length }}</strong>
          </div>
          <div class="btn-row" style="gap: 8px;">
            <button type="button" class="btn btn-sm" @click="showAuthMatrixModal = false">Batal</button>
            <button type="button" class="btn btn-sm btn-primary" :disabled="submitting" @click="saveRolePermissions">
              Simpan Otorisasi Menu
            </button>
          </div>
        </div>
      </div>
    </ModalDialog>

    <!-- MODAL 2: CREATE / EDIT ROLE -->
    <ModalDialog
      :open="showRoleModal"
      :title="roleForm.isEdit ? `Ubah Data Peran: ${roleForm.code}` : 'Tambah Master Role Baru (RBAC)'"
      @close="showRoleModal = false"
    >
      <form class="erp-stack" @submit.prevent="submitRoleForm">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="role-code">Kode Role (Huruf Besar &amp; Underscore)</label>
            <input
              id="role-code"
              v-model="roleForm.code"
              type="text"
              class="input"
              placeholder="Contoh: MGR_OPERASIONAL"
              :disabled="roleForm.isEdit"
              required
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="role-name">Nama Lengkap Peran</label>
            <input
              id="role-name"
              v-model="roleForm.name"
              type="text"
              class="input"
              placeholder="Contoh: Manager Operasional Wisma"
              required
            />
          </div>
        </div>

        <div class="form-field">
          <label class="form-label" for="role-desc">Deskripsi Tanggung Jawab &amp; Wewenang</label>
          <textarea
            id="role-desc"
            v-model="roleForm.description"
            class="textarea"
            placeholder="Jelaskan peran tugas dan kewenangan operasional..."
            required
          ></textarea>
        </div>

        <div class="form-field">
          <label class="form-label" for="role-limit">Batas Plafon Persetujuan / Approval Limit (IDR)</label>
          <input
            id="role-limit"
            v-model.number="roleForm.approvalLimit"
            type="number"
            min="0"
            step="1000000"
            class="input"
            placeholder="0 jika tidak memiliki wewenang approval pengeluaran"
          />
          <span class="form-hint">Isi 0 jika role ini tidak memiliki kewenangan approval finansial.</span>
        </div>

        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="showRoleModal = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">
            {{ roleForm.isEdit ? 'Simpan Perubahan Role' : 'Buat Master Role' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 3: EDIT USER ACCOUNT -->
    <ModalDialog
      :open="showEditUserModal"
      :title="`Ubah Akun Pengguna: ${editUserForm.email}`"
      @close="showEditUserModal = false"
    >
      <form class="erp-stack" @submit.prevent="submitEditUser">
        <div class="form-field">
          <label class="form-label" for="edit-usr-name">Nama Lengkap Personel</label>
          <input id="edit-usr-name" v-model="editUserForm.fullName" type="text" class="input" required />
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="edit-usr-role">Peran (Role)</label>
            <select id="edit-usr-role" v-model="editUserForm.roleCode" class="select" required>
              <option v-for="r in roles" :key="r.code" :value="r.code">{{ r.code }} - {{ r.name }}</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="edit-usr-unit">Cakupan Unit Bisnis</label>
            <select id="edit-usr-unit" v-model="editUserForm.businessUnitId" class="select">
              <option value="">Semua Unit (Pusat / Konsolidasi)</option>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-field" style="margin-top: 8px;">
          <label class="checkbox-label">
            <input type="checkbox" v-model="editUserForm.isActive" />
            <span>Akun Aktif (Dapat Login ke Sistem)</span>
          </label>
        </div>

        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="showEditUserModal = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">Simpan Perubahan Akun</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 4: RESET PASSWORD -->
    <ModalDialog
      :open="showResetPassModal"
      :title="`Reset Kata Sandi: ${resetPassForm.userEmail}`"
      @close="showResetPassModal = false"
    >
      <form class="erp-stack" @submit.prevent="submitResetPassword">
        <div class="form-field">
          <label class="form-label" for="new-pass">Kata Sandi Baru</label>
          <input
            id="new-pass"
            v-model="resetPassForm.newPassword"
            type="password"
            minlength="8"
            class="input"
            placeholder="Minimal 8 karakter"
            required
          />
        </div>
        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="showResetPassModal = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">Setel Ulang Password</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 5: REOPEN FISCAL PERIOD -->
    <ModalDialog
      :open="Boolean(reopenTarget)"
      :title="`Buka Kembali Periode Fiskal: ${reopenTarget?.code || ''}`"
      @close="reopenTarget = null"
    >
      <form class="erp-stack" @submit.prevent="submitReopenPeriod">
        <div class="form-field">
          <label class="form-label" for="reopen-reason">Alasan Pembukaan Kembali Periode (Wajib untuk Audit Trail)</label>
          <textarea
            id="reopen-reason"
            v-model="reopenReason"
            class="textarea"
            placeholder="Contoh: Penyesuaian jurnal akrual tagihan vendor akhir bulan yang baru diverifikasi."
            required
          ></textarea>
        </div>
        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="reopenTarget = null">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">Buka Kembali Periode</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 6: EDIT SYSTEM SETTING -->
    <ModalDialog
      :open="Boolean(settingTarget)"
      :title="`Ubah Parameter Kebijakan: ${settingTarget?.key || ''}`"
      @close="settingTarget = null"
    >
      <form class="erp-stack" @submit.prevent="submitSettingUpdate">
        <p class="erp-subtitle">{{ settingTarget?.description }}</p>
        <div class="form-field">
          <label class="form-label" for="cfg-val">Nilai Parameter Baru</label>
          <input id="cfg-val" v-model="settingNewValue" type="text" class="input" required />
        </div>
        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="settingTarget = null">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">Simpan Parameter</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 7: CREATE USER -->
    <ModalDialog :open="showUserModal" title="Tambah Pengguna Baru (RBAC)" @close="showUserModal = false">
      <form class="erp-stack" @submit.prevent="submitCreateUser">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="usr-name">Nama Lengkap Personel</label>
            <input id="usr-name" v-model="userForm.fullName" type="text" class="input" placeholder="Contoh: Rina Kartika" required />
          </div>
          <div class="form-field">
            <label class="form-label" for="usr-email">Email Login</label>
            <input id="usr-email" v-model="userForm.email" type="email" class="input" placeholder="Contoh: rina@pmoutama.id" required />
          </div>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="usr-role">Peran (Role)</label>
            <select id="usr-role" v-model="userForm.roleCode" class="select" required>
              <option v-for="r in roles" :key="r.code" :value="r.code">{{ r.code }} - {{ r.name }}</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="usr-unit">Cakupan Unit Bisnis</label>
            <select id="usr-unit" v-model="userForm.businessUnitId" class="select">
              <option value="">Semua Unit (Pusat / Konsolidasi)</option>
              <option v-for="u in masterUnits" :key="u.id" :value="u.id">{{ u.code }} - {{ u.name }}</option>
            </select>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label" for="usr-pass">Kata Sandi Awal</label>
          <input id="usr-pass" v-model="userForm.password" type="password" minlength="8" class="input" required />
        </div>
        <div class="btn-row" style="justify-content: flex-end; margin-top: 14px;">
          <button type="button" class="btn btn-sm" @click="showUserModal = false">Batal</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="submitting">Simpan Pengguna</button>
        </div>
      </form>
    </ModalDialog>

    <!-- MODAL 8: FORENSIC AUDIT TRAIL DIFF VIEWER -->
    <ModalDialog
      :open="showAuditDiffModal"
      title="Detail Jejak Audit Forensik & Rekam Mutasi Data"
      @close="showAuditDiffModal = false"
    >
      <div v-if="selectedAuditLog" class="erp-stack" style="gap: 16px;">
        <div class="erp-grid" style="grid-template-columns: repeat(2, 1fr); gap: 10px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div><small style="color: #64748b;">Waktu Server:</small> <div><strong>{{ formatDateTime(selectedAuditLog.createdAt) }}</strong></div></div>
          <div><small style="color: #64748b;">Pelaku &amp; Peran:</small> <div><strong>{{ selectedAuditLog.actorName }}</strong> ({{ selectedAuditLog.actorRole }})</div></div>
          <div><small style="color: #64748b;">Modul &amp; Aksi:</small> <div><span class="doc-code">{{ selectedAuditLog.module }}</span> <strong style="margin-left: 6px;">{{ selectedAuditLog.action }}</strong></div></div>
          <div><small style="color: #64748b;">Entitas Referensi:</small> <div>{{ selectedAuditLog.entityType }} <span class="doc-code" style="margin-left: 4px;">{{ selectedAuditLog.entityCode || selectedAuditLog.entityId }}</span></div></div>
          <div><small style="color: #64748b;">IP Address Client:</small> <div>{{ selectedAuditLog.ipAddress || '127.0.0.1 (Localhost)' }}</div></div>
          <div><small style="color: #64748b;">Request Tracing ID:</small> <div style="font-family: monospace; font-size: 0.75rem;">{{ selectedAuditLog.requestId || '-' }}</div></div>
        </div>

        <div>
          <h4 style="font-size: 0.88rem; font-weight: 700; margin-bottom: 6px;">Ringkasan Kejadian:</h4>
          <p style="margin: 0; padding: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem;">{{ selectedAuditLog.summary }}</p>
        </div>

        <!-- Calculated Field Diff -->
        <div v-if="selectedAuditLog.diffs && selectedAuditLog.diffs.length > 0">
          <h4 style="font-size: 0.88rem; font-weight: 700; margin-bottom: 8px; color: #0f172a;">
            Perbandingan Nilai Lapangan (Field Diffs - Before vs After):
          </h4>
          <div class="erp-table-wrap">
            <table class="erp-table" style="font-size: 0.8rem;">
              <thead>
                <tr>
                  <th>Field / Properti</th>
                  <th>Nilai Semula (Before)</th>
                  <th>Nilai Menjadi (After)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in selectedAuditLog.diffs" :key="d.field">
                  <td style="font-family: monospace; font-weight: bold;">{{ d.field }}</td>
                  <td style="color: #b91c1c; background: #fef2f2; text-decoration: line-through;">
                    {{ JSON.stringify(d.before) }}
                  </td>
                  <td style="color: #15803d; background: #f0fdf4; font-weight: bold;">
                    {{ JSON.stringify(d.after) }}
                  </td>
                  <td>
                    <span
                      class="erp-badge"
                      :class="{
                        'erp-badge-success': d.changeType === 'ADDED',
                        'erp-badge-info': d.changeType === 'MODIFIED',
                        'erp-badge-danger': d.changeType === 'REMOVED'
                      }"
                    >
                      {{ d.changeType }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Raw Snapshot Accordion / Fallback -->
        <div v-else-if="selectedAuditLog.beforeData || selectedAuditLog.afterData" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <h5 style="font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 4px;">Data Sebelum (beforeData)</h5>
            <pre style="background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 0.72rem; max-height: 200px; overflow: auto; border: 1px solid #e2e8f0;">{{ JSON.stringify(selectedAuditLog.beforeData, null, 2) || 'null' }}</pre>
          </div>
          <div>
            <h5 style="font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 4px;">Data Sesudah (afterData)</h5>
            <pre style="background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 0.72rem; max-height: 200px; overflow: auto; border: 1px solid #e2e8f0;">{{ JSON.stringify(selectedAuditLog.afterData, null, 2) || 'null' }}</pre>
          </div>
        </div>
        <div v-else style="padding: 16px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px; font-size: 0.85rem;">
          Tidak ada payload mutasi snapshot sebelum/sesudah yang tercatat untuk peristiwa ini.
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <button type="button" class="btn btn-sm" @click="showAuditDiffModal = false">Tutup</button>
        </div>
      </div>
    </ModalDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, downloadAuditCsv } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { formatDate, formatDateTime, formatRupiah } from '../utils/format';
import StatusBadge from '../components/StatusBadge.vue';
import StateBanner from '../components/StateBanner.vue';
import ModalDialog from '../components/ModalDialog.vue';
import AlertBanner from '../components/AlertBanner.vue';
import PaginationControl from '../components/PaginationControl.vue';
import { usePagination } from '../composables/usePagination';

const auth = useAuthStore();
const activeTab = ref<'roles' | 'users' | 'periods' | 'audit'>('roles');
const loading = ref(true);
const error = ref('');
const feedbackMsg = ref('');
const actionError = ref('');
const submitting = ref(false);

const auditLogs = ref<any[]>([]);
const auditModuleFilter = ref('');
const auditActionFilter = ref('');
const auditStartDate = ref('');
const auditEndDate = ref('');
const auditSearch = ref('');
const auditStats = ref<any>(null);
const selectedAuditLog = ref<any>(null);
const showAuditDiffModal = ref(false);
const isExportingCsv = ref(false);

const {
  currentPage: logPage,
  pageSize: logPageSize,
  totalItems: totalLogs,
  paginatedItems: paginatedLogs,
} = usePagination(auditLogs, 10);

const fiscalPeriods = ref<any[]>([]);
const systemSettings = ref<any[]>([]);
const roles = ref<any[]>([]);
const masterUnits = ref<any[]>([]);
const users = ref<any[]>([]);
const menusRegistry = ref<any[]>([]);

// Role Authorization Matrix Modal state
const showAuthMatrixModal = ref(false);
const selectedRoleForMatrix = ref<any | null>(null);
const matrixPermissions = ref<string[]>([]);

// Role Create / Edit Modal state
const showRoleModal = ref(false);
const roleForm = ref({
  id: '',
  code: '',
  name: '',
  description: '',
  approvalLimit: 0,
  isEdit: false,
});

// User Edit Modal state
const showEditUserModal = ref(false);
const editUserForm = ref({
  id: '',
  fullName: '',
  email: '',
  roleCode: '',
  businessUnitId: '',
  isActive: true,
});

// User Reset Password Modal state
const showResetPassModal = ref(false);
const resetPassForm = ref({
  userId: '',
  userEmail: '',
  newPassword: '',
});

const reopenTarget = ref<any | null>(null);
const reopenReason = ref('');

const settingTarget = ref<any | null>(null);
const settingNewValue = ref('');

const showUserModal = ref(false);
const userForm = ref({
  fullName: '',
  email: '',
  roleCode: 'UNIT_MANAGER',
  businessUnitId: '',
  password: 'DemoPassword2026!',
});

const attachmentForm = ref({
  displayName: 'Berita_Acara_Serah_Terima.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 245760,
  module: 'PROCUREMENT',
  entityId: 'PO-2026-0001',
});

function isCoreRole(code: string): boolean {
  const core = [
    'SUPER_ADMIN',
    'GM_PMO',
    'FINANCE_MANAGER',
    'UNIT_MANAGER',
    'ACCOUNTING',
    'PROCUREMENT',
    'REVENUE_OPERATOR',
    'CASHIER',
    'AUDITOR',
    'TAX_OFFICER',
  ];
  return core.includes(code);
}

function getRoleMenuSummary(perms: string[]): string {
  if (perms.includes('*')) return 'Semua Menu';
  const prefixSet = new Set<string>();
  for (const p of perms) {
    const prefix = p.split(':')[0];
    if (prefix) prefixSet.add(prefix.toUpperCase());
  }
  return Array.from(prefixSet).slice(0, 4).join(', ') + (prefixSet.size > 4 ? '...' : '');
}

async function loadAuditStats() {
  try {
    const res = await api.get('/audit/stats');
    auditStats.value = res.data;
  } catch {
    // Graceful fallback if stats not loaded
  }
}

async function loadAuditLogs() {
  const params = new URLSearchParams();
  if (auditModuleFilter.value) params.set('module', auditModuleFilter.value);
  if (auditActionFilter.value) params.set('action', auditActionFilter.value);
  if (auditStartDate.value) params.set('startDate', auditStartDate.value);
  if (auditEndDate.value) params.set('endDate', auditEndDate.value);
  if (auditSearch.value.trim()) params.set('search', auditSearch.value.trim());
  params.set('limit', '100');
  const qs = params.toString() ? `?${params.toString()}` : '';
  try {
    const res = await api.get<any>(`/audit/logs${qs}`);
    auditLogs.value = Array.isArray(res.data) ? res.data : (res.data?.logs || []);
  } catch {
    const fallbackRes = await api.get<any[]>(`/reports/audit-logs${qs}`);
    auditLogs.value = fallbackRes.data || [];
  }
}

async function openAuditDetail(log: any) {
  try {
    const res = await api.get<any>(`/audit/logs/${log.id}`);
    selectedAuditLog.value = res.data;
    showAuditDiffModal.value = true;
  } catch {
    selectedAuditLog.value = log;
    showAuditDiffModal.value = true;
  }
}

async function handleExportAuditCsv() {
  try {
    isExportingCsv.value = true;
    const params: Record<string, string> = {};
    if (auditModuleFilter.value) params.module = auditModuleFilter.value;
    if (auditActionFilter.value) params.action = auditActionFilter.value;
    if (auditStartDate.value) params.startDate = auditStartDate.value;
    if (auditEndDate.value) params.endDate = auditEndDate.value;
    if (auditSearch.value.trim()) params.search = auditSearch.value.trim();
    await downloadAuditCsv(params);
    feedbackMsg.value = 'Berhasil mengunduh salinan berkas Jejak Audit Forensik (CSV).';
  } catch (err: any) {
    actionError.value = err.message || 'Gagal mengekspor CSV jejak audit.';
  } finally {
    isExportingCsv.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const promises: Promise<any>[] = [
      loadAuditLogs(),
      loadAuditStats(),
      api.get<any>('/master/overview'),
      api.get<any[]>('/master/roles'),
      api.get<any[]>('/master/menus-permissions'),
    ];

    if (auth.hasPermission('admin:view')) {
      promises.push(api.get<any[]>('/master/users'));
    }

    const [, , masterRes, rolesRes, menusRes, usersRes] = await Promise.all(promises);
    fiscalPeriods.value = masterRes.data.fiscalPeriods;
    systemSettings.value = masterRes.data.systemSettings;
    masterUnits.value = masterRes.data.businessUnits;
    roles.value = rolesRes.data;
    menusRegistry.value = menusRes.data;

    if (usersRes) {
      users.value = usersRes.data;
    }
  } catch (err: any) {
    error.value = err.message || 'Gagal memuat data master administrasi.';
  } finally {
    loading.value = false;
  }
}

// ==========================================
// AUTHORIZATION MATRIX MODAL ACTIONS
// ==========================================

function openAuthMatrixModal(role: any) {
  selectedRoleForMatrix.value = role;
  matrixPermissions.value = [...(role.permissions || [])];
  showAuthMatrixModal.value = true;
}

function isPermissionChecked(permCode: string): boolean {
  return matrixPermissions.value.includes('*') || matrixPermissions.value.includes(permCode);
}

function togglePermission(permCode: string) {
  if (matrixPermissions.value.includes('*')) {
    // If wildcard was set, unwrap to explicit list minus this one
    const all = getAllPermissionCodes();
    matrixPermissions.value = all.filter((p) => p !== permCode);
    return;
  }
  const idx = matrixPermissions.value.indexOf(permCode);
  if (idx >= 0) {
    matrixPermissions.value.splice(idx, 1);
  } else {
    matrixPermissions.value.push(permCode);
  }
}

function getAllPermissionCodes(): string[] {
  const codes: string[] = [];
  for (const menu of menusRegistry.value) {
    for (const p of menu.permissions) {
      codes.push(p.code);
    }
  }
  return codes;
}

function setMatrixMode(mode: 'ALL' | 'READ_ONLY' | 'NONE') {
  if (mode === 'ALL') {
    if (selectedRoleForMatrix.value?.code === 'SUPER_ADMIN') {
      matrixPermissions.value = ['*'];
    } else {
      matrixPermissions.value = getAllPermissionCodes();
    }
  } else if (mode === 'READ_ONLY') {
    matrixPermissions.value = getAllPermissionCodes().filter((c) => c.endsWith(':view'));
  } else {
    matrixPermissions.value = [];
  }
}

async function saveRolePermissions() {
  if (!selectedRoleForMatrix.value) return;
  submitting.value = true;
  actionError.value = '';
  try {
    await api.put(`/master/roles/${selectedRoleForMatrix.value.id}`, {
      name: selectedRoleForMatrix.value.name,
      description: selectedRoleForMatrix.value.description,
      approvalLimit: selectedRoleForMatrix.value.approvalLimit,
      permissions: matrixPermissions.value,
    });
    feedbackMsg.value = `Otorisasi akses menu untuk role "${selectedRoleForMatrix.value.name}" berhasil diperbarui.`;
    showAuthMatrixModal.value = false;
    await loadAll();
    await auth.fetchMe();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menyimpan otorisasi menu.';
  } finally {
    submitting.value = false;
  }
}

// ==========================================
// ROLE CREATE / EDIT / DELETE ACTIONS
// ==========================================

function openCreateRoleModal() {
  roleForm.value = {
    id: '',
    code: '',
    name: '',
    description: '',
    approvalLimit: 0,
    isEdit: false,
  };
  showRoleModal.value = true;
}

function openEditRoleModal(role: any) {
  roleForm.value = {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    approvalLimit: role.approvalLimit,
    isEdit: true,
  };
  showRoleModal.value = true;
}

async function submitRoleForm() {
  submitting.value = true;
  actionError.value = '';
  try {
    if (roleForm.value.isEdit) {
      await api.put(`/master/roles/${roleForm.value.id}`, {
        name: roleForm.value.name,
        description: roleForm.value.description,
        approvalLimit: roleForm.value.approvalLimit,
        permissions: roles.value.find((r) => r.id === roleForm.value.id)?.permissions || [],
      });
      feedbackMsg.value = `Peran "${roleForm.value.name}" berhasil diperbarui.`;
    } else {
      await api.post('/master/roles', {
        code: roleForm.value.code,
        name: roleForm.value.name,
        description: roleForm.value.description,
        approvalLimit: roleForm.value.approvalLimit,
        permissions: ['budget:view', 'procurement:view', 'report:view'],
      });
      feedbackMsg.value = `Master role baru "${roleForm.value.name}" (${roleForm.value.code}) berhasil dibuat. Silakan atur matriks izin menu.`;
    }
    showRoleModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menyimpan data role.';
  } finally {
    submitting.value = false;
  }
}

async function deleteRole(role: any) {
  if (!confirm(`Hapus master role "${role.name}" (${role.code})? Tindakan ini tidak dapat dibatalkan.`)) return;
  submitting.value = true;
  actionError.value = '';
  try {
    await api.delete(`/master/roles/${role.id}`);
    feedbackMsg.value = `Role "${role.name}" berhasil dihapus.`;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menghapus role.';
  } finally {
    submitting.value = false;
  }
}

// ==========================================
// USER EDIT & RESET PASSWORD ACTIONS
// ==========================================

function openEditUserModal(user: any) {
  editUserForm.value = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roleCode: user.roleCode,
    businessUnitId: user.businessUnitId || '',
    isActive: Boolean(user.isActive),
  };
  showEditUserModal.value = true;
}

async function submitEditUser() {
  submitting.value = true;
  actionError.value = '';
  try {
    await api.put(`/master/users/${editUserForm.value.id}`, {
      fullName: editUserForm.value.fullName,
      roleCode: editUserForm.value.roleCode,
      businessUnitId: editUserForm.value.businessUnitId || null,
      isActive: editUserForm.value.isActive,
    });
    feedbackMsg.value = `Akun pengguna ${editUserForm.value.fullName} berhasil diperbarui.`;
    showEditUserModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal memperbarui akun pengguna.';
  } finally {
    submitting.value = false;
  }
}

function openResetPassModal(user: any) {
  resetPassForm.value = {
    userId: user.id,
    userEmail: user.email,
    newPassword: '',
  };
  showResetPassModal.value = true;
}

async function submitResetPassword() {
  submitting.value = true;
  actionError.value = '';
  try {
    await api.put(`/master/users/${resetPassForm.value.userId}/reset-password`, {
      newPassword: resetPassForm.value.newPassword,
    });
    feedbackMsg.value = `Kata sandi untuk ${resetPassForm.value.userEmail} berhasil disetel ulang.`;
    showResetPassModal.value = false;
  } catch (err: any) {
    actionError.value = err.message || 'Gagal mereset kata sandi.';
  } finally {
    submitting.value = false;
  }
}

// ==========================================
// FISCAL PERIOD & SETTINGS ACTIONS
// ==========================================

async function closePeriod(fp: any) {
  submitting.value = true;
  actionError.value = '';
  try {
    await api.post(`/master/fiscal-periods/${fp.id}/close`, {});
    feedbackMsg.value = `Periode fiskal ${fp.code} berhasil ditutup (CLOSED).`;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menutup periode fiskal.';
  } finally {
    submitting.value = false;
  }
}

function openReopenModal(fp: any) {
  reopenTarget.value = fp;
  reopenReason.value = '';
}

async function submitReopenPeriod() {
  if (!reopenTarget.value) return;
  submitting.value = true;
  actionError.value = '';
  try {
    await api.post(`/master/fiscal-periods/${reopenTarget.value.id}/reopen`, {
      reason: reopenReason.value,
    });
    feedbackMsg.value = `Periode fiskal ${reopenTarget.value.code} dibuka kembali (OPEN).`;
    reopenTarget.value = null;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal membuka kembali periode fiskal.';
  } finally {
    submitting.value = false;
  }
}

function openSettingModal(cfg: any) {
  settingTarget.value = cfg;
  settingNewValue.value = cfg.value;
}

async function submitSettingUpdate() {
  if (!settingTarget.value) return;
  submitting.value = true;
  actionError.value = '';
  try {
    await api.put('/master/settings', {
      key: settingTarget.value.key,
      value: settingNewValue.value,
    });
    feedbackMsg.value = `Parameter ${settingTarget.value.key} berhasil diperbarui.`;
    settingTarget.value = null;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal memperbarui pengaturan sistem.';
  } finally {
    submitting.value = false;
  }
}

async function submitAttachment() {
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>('/reports/attachments', attachmentForm.value);
    feedbackMsg.value = `Lampiran "${res.data.displayName}" tervalidasi dan tersimpan dengan storageKey aman (${res.data.storageKey}).`;
    await loadAuditLogs();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal mengunggah metadata lampiran.';
  } finally {
    submitting.value = false;
  }
}

async function submitCreateUser() {
  submitting.value = true;
  actionError.value = '';
  try {
    const res = await api.post<any>('/master/users', {
      ...userForm.value,
      businessUnitId: userForm.value.businessUnitId || null,
    });
    feedbackMsg.value = `Pengguna ${res.data.fullName} (${res.data.roleCode}) berhasil ditambahkan.`;
    showUserModal.value = false;
    await loadAll();
  } catch (err: any) {
    actionError.value = err.message || 'Gagal menambahkan pengguna baru.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadAll);
</script>

<style scoped>
.superadmin-callout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: linear-gradient(135deg, rgba(3, 70, 147, 0.08) 0%, rgba(5, 150, 105, 0.05) 100%);
  border: 1px solid rgba(3, 70, 147, 0.2);
  padding: 18px 22px;
  border-radius: 16px;
}

.callout-content {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.callout-icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--primary);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.permission-pills-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

/* Authorization Matrix Modal Layout */
.auth-matrix-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 72vh;
  overflow-y: auto;
  padding-right: 4px;
}

.matrix-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.wildcard-alert-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(5, 150, 105, 0.1);
  border: 1px solid rgba(5, 150, 105, 0.25);
  font-size: 0.83rem;
  color: var(--text-primary);
}

.matrix-groups-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.menu-permission-card {
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px 16px;
  background: var(--bg-surface);
}

.menu-card-header {
  margin-bottom: 10px;
}

.menu-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-desc {
  font-size: 0.76rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.permissions-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
}

.permission-checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  cursor: pointer;
  transition: all 120ms ease;
  font-size: 0.8rem;
}

.permission-checkbox-label:hover {
  border-color: var(--border-strong);
  background: var(--bg-surface);
}

.permission-checkbox-label.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.permission-checkbox-label input[type="checkbox"] {
  margin-top: 2px;
  cursor: pointer;
}

.perm-text-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.perm-label {
  font-weight: 600;
  color: var(--text-primary);
}

.perm-code {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: transparent;
  padding: 0;
  border: 0;
}

.modal-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 8px;
}

.active-count-indicator {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 550;
}

@media (max-width: 640px) {
  .superadmin-callout {
    flex-direction: column;
    align-items: flex-start;
  }

  .matrix-header-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .permissions-checkbox-grid {
    grid-template-columns: 1fr;
  }

  .modal-footer-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>
