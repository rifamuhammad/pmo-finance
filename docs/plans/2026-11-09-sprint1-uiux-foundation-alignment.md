# Sprint 1 UI/UX & Data Alignment Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Menyelaraskan seluruh pengalaman antarmuka (UI/UX) dan komponen data fondasi Sprint 1—khususnya pencarian instan **70 Akun COA Operasional PMO dari Excel** (`docs/KODE COA UT.xlsx` & `Semula-Menjadi Revisi ke 7`), visualisasi status periode fiskal di header navigasi, serta pembersihan tab dan standardisasi tabel finansial sesuai aturan Anti-Slop & Style UI sebelum masuk ke Sprint 2.

**Architecture:** Membangun komponen reusable `CoaCombobox.vue` berbasis fuzzy search dan tab kelompok akun (Kepala 1 s/d Kepala 5 untuk 70 akun riil PMO), mengintegrasikannya ke `AccountingView.vue` (menggantikan `<select>` manual dan input teks biasa), menambahkan status pill periode fiskal di `AppShell.vue`, dan merapikan hierarki tipografi/angka dengan kelas `tabular-nums`.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Tailwind CSS / Custom Enterprise CSS variables, Style UI patterns, Vitest.

---

### Task 1: Reusable Component `CoaCombobox.vue`
Komponen pencarian instan untuk memilih dari **70 akun COA operasional spesifik PMO dari Excel** (`prisma/seeds/coa-pmo-official.json`).

**Files:**
- Create: `apps/web/src/components/CoaCombobox.vue`
- Test: `apps/web/src/components/__tests__/CoaCombobox.spec.ts`

**Step 1: Write test for CoaCombobox component**
Membuat tes vitest untuk memastikan `CoaCombobox` memfilter 70 akun berdasarkan kode 12-digit, nama akun, dan filter kelompok (Aset, Liabilitas, Ekuitas, Pendapatan Unit Bisnis, Belanja Operasional).

**Step 2: Run test to verify it fails**
Run: `npm test -w apps/web -- CoaCombobox`
Expected: FAIL (file belum ada).

**Step 3: Implement `CoaCombobox.vue`**
- Input text dengan tombol dropdown dan shortcut keyboard (Esc untuk tutup, Arrow Up/Down, Enter untuk pilih).
- Tab kategori cepat: `Semua (70)`, `1 - Kas & Aset`, `2 - Kewajiban/Pajak`, `3 - Modal PMO`, `4 - Pendapatan Bisnis`, `5 - Belanja Operasional`.
- Tampilan list hasil pencarian dengan badge kode akun (`X.XX.XX.XX.XX.XX`), nama akun riil, dan badge unit bisnis.
- Fast autocomplete dan keyboard navigation yang responsif.

**Step 4: Run test to verify it passes**
Run: `npm test -w apps/web -- CoaCombobox`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(ui): implement reusable CoaCombobox component for 70 official PMO Excel accounts"`

---

### Task 2: Integrasi ke `AccountingView.vue` & Pembersihan Tab Numbering
Menghubungkan 70 akun operasional spesifik PMO dari Excel ke tabel COA dan modal jurnal, serta membersihkan penomoran tab sesuai aturan Anti-Slop.

**Files:**
- Modify: `apps/web/src/modules/AccountingView.vue`

**Step 1: Pembersihan Tab Navigasi**
- Ubah tab `1. Buku Besar & Neraca Saldo` -> `Buku Besar & Neraca Saldo`.
- Ubah tab `2. Jurnal Umum` -> `Jurnal Umum`.
- Ubah tab `3. Umur Piutang (AR) & Utang (AP)` -> `Umur Piutang & Utang`.
- Ubah tab `4. COA, Pajak & Aset Tetap` -> `Bagan Akun (COA) & Pajak`.

**Step 2: Searchable & Filterable COA Table di Tab Bagan Akun**
- Tambahkan search input dan filter tab kelompok akun (Kepala 1 - 5) pada tabel COA 70 akun PMO di `AccountingView.vue`.
- Tampilkan badge kategori operasional (`Pendapatan Unit Bisnis`, `Belanja Operasional PMO`, `Kas & Bank BRI`).

**Step 3: Ganti Select Manual di Modal Jurnal Umum dengan `CoaCombobox`**
- Ganti `<select v-model="line.accountCode">` dengan `<CoaCombobox v-model="line.accountCode" :accounts="coaList" />`.

**Step 4: Run Typecheck & Test**
Run: `npm run typecheck`
Expected: 0 errors.

**Step 5: Commit**
`git commit -m "refactor(accounting): integrate CoaCombobox, add COA table filter, and clean tab labels"`

---

### Task 3: Indikator Status Periode Fiskal di Header `AppShell.vue`
Menampilkan periode fiskal aktif dan status tutup buku langsung di top navigation bar.

**Files:**
- Modify: `apps/web/src/layouts/AppShell.vue`
- Modify: `apps/web/src/services/api.ts` (jika helper fetch fiscal periods diperlukan)

**Step 1: Fetch Status Periode Fiskal Berjalan**
- Ambil data periode aktif (misal `2026-11` atau periode fiskal terkini) via `apiFetch('/master/overview')`.

**Step 2: Pasang Fiscal Period Status Pill di Header**
- Di sebelah selector Unit Bisnis, tambahkan pill status periode fiskal:
  - Format: `📅 Nov 2026` + Badge `OPEN` (warna emerald) / `LOCKED` (warna amber) / `CLOSED` (warna neutral/slate).
  - Tooltip informatif: Menjelaskan apakah transaksi diizinkan atau sedang dibatasi untuk tutup buku.

**Step 3: Run Typecheck**
Run: `npm run typecheck`
Expected: 0 errors.

**Step 4: Commit**
`git commit -m "feat(shell): add real-time fiscal period status indicator to top navbar"`

---

### Task 4: Standardisasi Angka Finansial (`tabular-nums`) & Style UI Audit
Memastikan seluruh tabel finansial dan kartu KPI mematuhi aturan zero-slop dan perataan angka moneter.

**Files:**
- Modify: `apps/web/src/modules/AccountingView.vue`

**Step 1: Terapkan Tabular Nums & Alignment**
- Pastikan semua nominal uang pada tabel Buku Besar, Neraca Saldo, Jurnal Umum, dan Aging AR/AP memiliki kelas CSS `tabular-nums` atau `.money` dan rata kanan (`text-align: right`).
- Pastikan badge status berada di posisi tengah (`text-align: center`).

**Step 2: Eliminasi Text Gelondongan & Redundant Badges**
- Hapus badge yang redundan atau bersifat self-validating jika ada.
- Rapikan subjudul agar ringkas dan fokus pada esensi operasional keuangan.

**Step 3: Commit**
`git commit -m "style(accounting): enforce tabular-nums on monetary tables and align with Style UI standards"`

---

### Task 5: Verifikasi Menyeluruh & Laporan Kesiapan Sprint 1
Memverifikasi build, typecheck, dan tes integrasi sebelum menyajikan hasil review.

**Step 1: Jalankan Automated Tests & Typecheck**
Run: `npm run typecheck && npm test`
Expected: PASS 100%.

**Step 2: Update Status di `docs/plans/task.md`**
Tandai seluruh task sebagai `completed`.

**Step 3: Dokumentasikan Bukti di `docs/tasks/`**
Perbarui dokumentasi keselarasan UI/UX Sprint 1 agar siap diserahkan ke Manager.
