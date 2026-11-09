# 🎨 Tiket KOI-101 (PMO-035): Penyelarasan UI/UX Fondasi & Fast Search 70 Akun COA Excel

- **Jira Key:** `KOI-101` (Task), `KOI-102`, `KOI-103`, `KOI-104` (Subtasks)
- **Parent Epic:** `KOI-79` ([SPRINT 1] Foundation & Master Data COA Pertor 310)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-101-uiux-fondasi-search-coa-fiskal`
- **Komponen Utama:** `apps/web/src/components/CoaCombobox.vue`
- **Halaman Terdampak:** `apps/web/src/modules/AccountingView.vue`, `apps/web/src/layouts/AppShell.vue`
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Typecheck Clean (0 errors), Vite Build 100% OK.

---

## 1. Latar Belakang & Urgensi Bisnis
Universitas Terbuka memiliki 1.063 akun di Lampiran II Pertor 310, tetapi operasional bisnis komersial PMO UTama secara spesifik bertumpu pada **70 Akun COA Resmi dari file Excel** (`docs/KODE COA UT.xlsx` dan `docs/Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx`). 

Sebelumnya, pemilihan akun di modul akuntansi menggunakan dropdown native `<select>` yang tidak memiliki fitur pencarian cepat, serta form anggaran yang mengandalkan pengetikan kode manual tanpa validasi. Selain itu, status periode fiskal aktif belum terpampang di header aplikasi sehingga user tidak mengetahui apakah transaksi sedang diizinkan (`OPEN`) atau dibatasi untuk tutup buku (`LOCKED`).

Tiket ini menyelaraskan seluruh komponen fondasi tersebut agar interaksi kerja cepat, bebas salah input, dan mematuhi aturan Anti-Slop.

---

## 2. Lokasi Menu & Fitur yang Berubah
1. **Menu Akuntansi & Buku Besar (`/accounting`):**
   - **Tab Bagan Akun (COA) & Pajak (Accordion Solusi 2):**
     - Master COA diposisikan paling atas (primary focus) dengan tampilan **Accordion / Collapsible Group per Kategori Akun** (Kepala 1: Aset Lancar, Kepala 2: Kewajiban & Pajak, Kepala 3: Ekuitas, Kepala 4: Pendapatan Bisnis, Kepala 5: Belanja Operasional).
     - Menghilangkan scroll panjang 70 baris tabel menjadi kartu-kartu ringkas yang dapat dibuka/tutup secara mandiri, lengkap dengan tombol **Buka Semua** dan **Tutup Semua**.
     - **Pencarian Cerdas & Auto-Expand:** Mengetik kata kunci akun otomatis membuka kelompok yang memiliki kecocokan dan menampilkan badge counter akun riil.
     - **Tombol Salin Kode:** Staf akuntansi dapat langsung menyalin kode 12-digit akun ke clipboard dengan satu klik.
     - Posisi rekapitulasi pajak (PPN Masukan/Keluaran) dan register aset tetap ditata rapi di bagian bawah COA.
   - **Pembersihan Tab:** Menghilangkan penomoran tab baku (`1. Buku Besar` ➔ `Buku Besar & Neraca Saldo`, `4. COA...` ➔ `Bagan Akun (COA) & Pajak`).
2. **Modal Posting Jurnal Umum Berimbang:**
   - Dropdown pemilihan akun diganti dari native `<select>` ke komponen cerdas `CoaCombobox.vue` dengan autocomplete kode 12-digit, nama akun, dan kategori.
3. **Top Navigation Bar (`apps/web/src/layouts/AppShell.vue`):**
   - Penambahan pill status periode fiskal aktif (`📅 Nov 2026` + badge `OPEN` emerald / `LOCKED` amber) tepat di sebelah selector unit bisnis.
4. **Form Pengajuan Kas Kecil GUP / TUP (`/petty-cash` - Panel DRA-UK):**
   - Menghapus dropdown native `<select>` yang menampilkan 17 akun usang bertanda `[LEGACY]` (misal: `1-1110`, `5-1100`, `5-1200`).
   - Mengganti input dengan komponen cerdas `CoaCombobox.vue` yang menyajikan **100% dari 70 Akun Operasional Resmi PMO dari File Excel** (menghapus filter backend 38 akun dan frontend 28 akun).
   - Menambahkan mapping otomatis agar pemilihan pos DRA lama langsung terkonversi menjadi kode 12-digit belanja operasional riil (`520201010100`).

---

## 3. Matriks Hak Akses & Role yang Berwenang (RBAC & SoD)
- **`SUPER_ADMIN`:** Akses penuh posting jurnal, mengelola master akun COA, dan membuka/mengunci periode fiskal.
- **`FINANCE_MANAGER` & `GM_PMO`:** Wewenang approval jurnal, monitoring neraca saldo seimbang, dan otorisasi buka kembali periode fiskal terkunci.
- **`ACCOUNTING_STAFF`:** Hak membuat draf jurnal umum berimbang menggunakan `CoaCombobox`, patuh pada aturan pemisahan tugas (*Separation of Duties*: staf tidak bisa menyetujui jurnal buatannya sendiri).
- **Semua 9 Role Pengguna:** Melihat indikator status periode fiskal di header untuk mengetahui kesiapan sistem memproses transaksi.

---

## 4. Langkah & Keputusan Teknis
1. **Komponen Reusable `CoaCombobox.vue`:**
   - Menggunakan Composition API Vue 3 dengan TypeScript props `accounts: CoaAccountItem[]`.
   - Mendukung pencarian fuzzy berdasarkan kode angka 12 digit (menghapus tanda titik/spasi secara otomatis saat pencocokan) maupun nama akun.
   - Dilengkapi filter cepat berbasis tab: `Semua`, `1 - Kas & Aset`, `2 - Utang & Pajak`, `3 - Ekuitas`, `4 - Pendapatan Bisnis`, `5 - Belanja Operasional`.
   - Keyboard navigation lengkap (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).
2. **Refactor `AccountingView.vue`:**
   - Mengintegrasikan `CoaCombobox` ke dalam baris input debit/kredit modal jurnal umum.
   - Menata ulang tabel COA dengan indikator pencarian jumlah akun yang cocok.
3. **Integrasi Real-Time Header di `AppShell.vue`:**
   - Fungsi `loadMasterContext()` sekarang otomatis menarik `fiscalPeriods` dari endpoint `/api/v1/master/overview`.
   - Komputasi `activeFiscalPeriod` otomatis mencari periode berstatus `OPEN` terdekat.
4. **Audit Style UI & Tabular Numbers:**
   - Seluruh angka finansial dan mata uang dipastikan menggunakan `tabular-nums` untuk perataan vertikal yang rapi.
   - Menghapus badge demo menjadi badge enterprise netral.

---

## 5. Data Riil & Angka Faktual
- **Total Akun COA:** 70 akun operasional aktif tersimpan di `prisma/seeds/coa-pmo-official.json`.
  - 20 akun Pendapatan Unit Bisnis (`420301xxxxxx`) dari `docs/KODE COA UT.xlsx`.
  - 27 akun Belanja Operasional Riil (`520101xxxxxx`) dari `docs/Semula-Menjadi Revisi ke 7`.
  - 23 akun Neraca & Posisi Keuangan esensial (Kasir, Rekening BRI `110101020200`, UMK Kas Kecil `110501010100`, Utang AP, Pajak).
- **Periode Fiskal:** 15 periode fiskal terdaftar di PostgreSQL (Bulan berjalan: November 2026 - `OPEN`).

---

## 6. Panduan Verifikasi QA / Boss
1. **Typecheck & Automated Test:**
   ```bash
   npm run typecheck # Pastikan 0 error
   npm test          # 24 integration tests pass
   ```
2. **Pengujian Antarmuka Web:**
   - Buka `/accounting` -> Klik tab **Bagan Akun (COA) & Pajak**.
   - Coba ketik "gaji", "obat", atau "4203" di search bar; periksa filter tab Kepala 1 s/d 5.
   - Klik tombol **+ Buat Jurnal Umum**; uji pemilihan akun via `CoaCombobox` menggunakan keyboard maupun klik.
   - Periksa top navbar: pastikan badge status periode fiskal aktif (`Nov 2026 - OPEN`) terlihat jelas dengan tooltip informatif.

---

## 7. Tautan Branch & Commit
- **Branch GitHub:** `feature/KOI-101-uiux-fondasi-search-coa-fiskal`
- **Status:** `In Review` (Siap direview oleh Manager)
