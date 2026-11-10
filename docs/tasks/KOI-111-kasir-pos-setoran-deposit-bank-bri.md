# [KOI-111] Modul Kasir Tunai (POS) & Penyetoran Deposit Bank BRI
## Sesi Kasir Loket, Struk Kuitansi POS Pertor 310 & Auto-Journal Setoran Kas

> **Jira Issue:** `KOI-111` | **Parent Epic:** `KOI-108` (`[SPRINT 3] Core Transaction Engines (LS, UMK & Revenue POS)`)  
> **Status:** `In Review` (STRICT: Menunggu tinjauan Manager)  
> **Branch GitHub:** `feature/KOI-111-kasir-pos-setoran-deposit-bank-bri`  
> **Regulasi Acuan:** Peraturan Rektor No. 310 Tahun 2025 Lampiran I (Kebijakan 01 Kas & Bank) & ISAK 335  

---

### 1. Latar Belakang & Urgensi Bisnis
Pada operasional harian 5 Unit Bisnis PMO UTama (khususnya Poliklinik UT, Diklat TCI, dan Layanan Konsultansi), penerimaan kas tidak hanya berlangsung secara nontunai (Virtual Account/Bank Transfer), melainkan juga melalui kasir fisik (Point of Sale / POS).  
Sebelum implementasi tiket ini:
1. Pengguna kasir belum memiliki antarmuka untuk membuka sesi loket baru dengan pencatatan modal awal (*opening float*).
2. Kasir tidak memiliki tampilan struk kuitansi cetak resmi yang memuat akun pendapatan 12-digit dan PPN Keluaran 11% sesuai format Pertor 310.
3. Alur setoran tunai (*cash deposit*) dari laci kasir ke rekening bank operasional BRI belum terverifikasi secara terisolasi pada suite pengujian integrasi otomatis.

---

### 2. Lokasi Menu & Fitur yang Berubah
1. **Frontend (`apps/web/src/modules/RevenueCashierView.vue`):**
   * **Tab Sesi Kasir Loket (`#cashier`):**
     * Ditambahkan **Banner Sesi Kasir Aktif** menampilkan informasi shift real-time: No. Sesi (`CSH-2026-xxxx`), Nama Loket, Petugas Kasir, Modal Awal, Total Tunai Masuk, dan Saldo Fisik Teoritis saat ini.
     * Ditambahkan tombol dan modal **`+ Buka Sesi Kasir Baru`** (`openSessionModalOpen`) untuk memilih register loket dan memasukkan modal kerja awal.
     * Ditambahkan banner informatif saat tidak ada sesi kasir yang aktif dengan panduan kepatuhan Pertor 310.
   * **Tab Riwayat Pembayaran & Tagihan (`#invoices`):**
     * Ditambahkan aksi **`Kuitansi POS`** pada setiap baris pembayaran terkonfirmasi.
     * Ditambahkan modal pratinjau struk kuitansi kasir berstandar resmi kampus UT lengkap dengan tombol cetak (`window.print()`).
     * Penyempurnaan modal **Catat Setoran Bank** dengan banner edukasi jurnal 12-digit resmi.
2. **Backend & Test Suite (`apps/api/src/tests/erp.test.ts`):**
   * Penambahan skenario uji automated integration:
     * `records cash deposit to Bank BRI (110101020200 vs 110101010100) and closes cashier session with balanced journal (PMO-082)`.

---

### 3. Matriks Hak Akses & Role yang Berwenang
* **`CASHIER` (Petugas Kasir Loket):**
  * Membuka sesi kasir (`cashier:operate`).
  * Menerima pembayaran tunai invoice dan mencetak struk kuitansi POS.
  * Mengisi hasil hitung fisik uang di laci (*closeout*).
  * Mencatat slip setoran tunai ke Bank BRI.
* **`FINANCE_MANAGER` (Manajer Keuangan):**
  * Mengesahkan (*approve*) berita acara penutupan kasir jika terdapat selisih uang fisik di atas ambang batas toleransi Rp 50.000.
* **`SUPER_ADMIN` / `INTERNAL_AUDITOR`:**
  * Memonitor jejak audit mutasi kas loket secara read-only.

---

### 4. Langkah & Keputusan Teknis
1. **Pembukaan Sesi Kasir Loket:**
   * Endpoint `POST /api/v1/revenue/cashier/sessions/open` memvalidasi bahwa 1 register fisik hanya boleh memiliki 1 sesi aktif (`REGISTER_ALREADY_OPEN` guard).
   * Modal awal dicatat sebagai saldo teoritis awal tanpa menduplikasi jurnal piutang.
2. **Jurnal Otomatis Setoran Kas ke Bank BRI (Pertor 310):**
   * Saat setoran dicatat melalui `POST /api/v1/revenue/cashier/deposits`:
     * **(Debit)** `110101020200` Bank BRI Penerimaan Komersial PMO
     * **(Kredit)** `110101010100` Kas Operasional & Kasir Unit
   * Keseimbangan double-entry divalidasi langsung oleh `createOrGetBalancedJournal` dengan selisih 0 IDR.

---

### 5. Data Riil & Angka Faktual
* Akun Bank Setoran: `110101020200` (Bank BRI Penerimaan Komersial PMO UTama).
* Akun Kasir POS: `110101010100` (Kas Operasional Loket & Kasir Unit).
* Ambang Batas Selisih: Rp 50.000 (Selisih di atas nilai ini otomatis memicu status `CLOSING_SUBMITTED` dan membuat `ApprovalRequest` ke Finance Manager).
* Pajak Terintegrasi: PPN Keluaran 11% tercatat pada akun `210202010100`.

---

### 6. Panduan Verifikasi QA / Manajer
1. **Verifikasi Monorepo Typecheck & Build:**
   ```bash
   npm run typecheck
   npm --workspace=apps/web run build
   ```
2. **Verifikasi Test Suite:**
   ```bash
   npm --workspace=apps/api test
   ```
   *Pastikan seluruh 26 skenario integration test lolos 100%.*
3. **Verifikasi di Antarmuka Web:**
   * Login sebagai Kasir (`cashier@pmo.ut.ac.id` / password demo).
   * Buka menu **Pendapatan & Kasir (POS)** ➔ Tab **Sesi Kasir Loket**.
   * Klik tombol **`+ Buka Sesi Kasir Baru`**, pilih register loket, masukkan modal awal, dan simpan.
   * Amati munculnya **Banner Sesi Kasir Aktif** berwarna hijau dengan ringkasan modal awal dan saldo teoritis.
   * Pada tab Tagihan & Pembayaran, klik tombol **`Kuitansi POS`** pada riwayat pembayaran untuk melihat pratinjau struk kuitansi cetak resmi.

---

### 7. Tautan Branch, Commit & Dokumen Pendukung
* **Branch:** `feature/KOI-111-kasir-pos-setoran-deposit-bank-bri`
* **Jira Key:** `KOI-111`
* **Status Jira:** `In Review`
