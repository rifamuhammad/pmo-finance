# [KOI-112] Pertanggungjawaban SPJ UMK Panjar, Verifikasi Nota & Tutup Panjar
## Alur Pertanggungjawaban SPJ Kas Kecil, Validasi Pajak & Auto-Journal Tutup Panjar Akun 110501010100

> **Jira Issue:** `KOI-112` | **Parent Epic:** `KOI-108` (`[SPRINT 3] Core Transaction Engines (LS, UMK & Revenue POS)`)  
> **Status:** `In Review` (STRICT: Menunggu tinjauan Manager)  
> **Branch GitHub:** `feature/KOI-112-spj-umk-panjar-verifikasi-nota-tutup-panjar`  
> **Regulasi Acuan:** Peraturan Rektor No. 310 Tahun 2025 Lampiran III (Mekanisme UMK & TUP Nihil) & Master Blueprint Bagian 5.6.2  

---

### 1. Latar Belakang & Urgensi Bisnis
Sesuai Peraturan Rektor UT No. 310 Tahun 2025 dan Master Blueprint Sistem Keuangan PMO Bagian 5.6.2, seluruh operasional kas kecil dan panjar kerja kegiatan (UMK / Tambahan Uang Persediaan) wajib dipertanggungjawabkan melalui Surat Pertanggungjawaban (SPJ) dengan nota/kuitansi sah.  
Sebelum tiket ini diselesaikan:
1. Pratinjau jurnal dan lembar cetak SPJ belum menampilkan akun penutupan panjar resmi 12-digit `110501010100` (Uang Muka Kegiatan Pegawai UT).
2. Tanda tangan pada lembar SPJ cetak masih menggunakan nama statis tiruan alih-alih data faktual aktor verifikator dan manajer yang menyetujui.
3. Alur nihilisasi TUP / tutup panjar belum terverifikasi secara terisolasi pada automated integration suite `erp.test.ts`.

---

### 2. Lokasi Menu & Fitur yang Berubah
1. **Frontend (`apps/web/src/modules/PettyCashView.vue`):**
   * **Modal Detail Pengajuan (`openDetail`):**
     * Menambahkan banner edukasi jurnal Pertor 310 saat ajuan telah terposting:
       * Untuk TUP Nihil: Debit Beban `5xxxxxxxxx` vs Kredit `110501010100` (Uang Muka Kegiatan Pegawai UT).
       * Untuk GUP: Debit Beban `5xxxxxxxxx` vs Kredit `110101020200` (Bank BRI Kas Operasional).
   * **Lembar Cetak Berkas SPJ Resmi (`spj-print-sheet`):**
     * Label nilai netto menyesuaikan secara dinamis: *"NILAI NIHILISASI PANJAR UMK"* untuk TUP Nihil dan *"NILAI NETTO PENGGANTIAN GUP"* untuk GUP.
     * Ditambahkan badge kepatuhan Pertor 310 pada lembar SPJ: `✓ Menutup Uang Muka Kegiatan Pegawai UT pada Akun Kredit 110501010100`.
     * Tanda tangan verifikator pajak dan finance manager diubah menjadi dinamis membaca field `verifiedTaxBy` dan `approvedBy` dari database.
2. **Backend & Test Suite (`apps/api/src/tests/erp.test.ts`):**
   * Penambahan skenario automated test:
     * `processes TUP_NIHIL submission and auto-posts closing journal crediting Panjar UMK 110501010100 (PMO-072 / KOI-112)`.
     * Memvalidasi pembuatan ajuan TUP Nihil, verifikasi pajak PPh 22, persetujuan finance manager, pencairan/nihilisasi, dan verifikasi baris jurnal kredit pada akun `110501010100`.

---

### 3. Matriks Hak Akses & Role yang Berwenang
* **`EMPLOYEE_PIC` / `CASHIER`:**
  * Mengajukan draf SPJ dan melampirkan rincian transaksi nota kuitansi belanja.
* **`TAX_VERIFIER` (Staf Pajak PMO):**
  * Memeriksa bukti fisik kuitansi, NPWP rekanan, dan melakukan verifikasi kepatuhan pajak PPh/PPN (`verify-tax`).
* **`FINANCE_MANAGER` (Manajer Keuangan):**
  * Mengesahkan berkas SPJ (`approve`) dan memvalidasi alokasi pos anggaran.
* **`CASHIER` / Bendahara:**
  * Mengeksekusi nihilisasi / pencairan (`disburse`), memicu posting otomatis buku besar (*auto-posting balanced double-entry journal*).

---

### 4. Langkah & Keputusan Teknis
1. **Aturan Jurnal Tutup Panjar (TUP Nihil):**
   * **(Debit)** `520901020100` Beban Barang dan Perlengkapan (atau akun beban sesuai jenis pengeluaran).
   * **(Kredit)** `210201010100` / `210202010100` Utang Pajak PPh/PPN (jika transaksi kena pajak).
   * **(Kredit)** `110501010100` Uang Muka Kegiatan Pegawai UT (mengurangi saldo uang muka panjar).
2. **Keseimbangan Double-Entry:**
   * Total Debit = Total Kredit; divalidasi langsung oleh mesin akuntansi monorepo tanpa toleransi selisih.

---

### 5. Data Riil & Angka Faktual
* Akun Panjar UMK Kegiatan: `110501010100` (Uang Muka Kegiatan Pegawai UT).
* Akun Kas Bank Operasional GUP: `110101020200` (Bank BRI Penerimaan/Operasional PMO).
* Akun Utang Pajak: `210201010100` (PPh 21/22/23) dan `210202010100` (PPN Keluaran 11%).
* Akun Beban Operasional Contoh: `520901020100` (Beban Barang dan Perlengkapan Kegiatan).

---

### 6. Panduan Verifikasi QA / Manajer
1. **Verifikasi Test Suite Otomatis:**
   ```bash
   npm --workspace=apps/api test
   ```
   *Seluruh 27 skenario integrasi lolos 100% (termasuk skenario baru TUP Nihil).*
2. **Verifikasi Monorepo Typecheck & Build:**
   ```bash
   npm run typecheck
   npm --workspace=apps/web run build
   ```
3. **Verifikasi di Antarmuka Web:**
   * Buka modul **Kas Kecil & Panjar UMK** (`/petty-cash`).
   * Beralih ke tab **TUP Nihil (Pertanggungjawaban)**.
   * Buka salah satu ajuan yang sudah berstatus `DISBURSED`, amati banner buku besar terposting memuat rincian akun kredit `110501010100`.
   * Klik tombol **Cetak SPJ**, amati kop resmi dan badge kepatuhan Pertor 310 serta tanda tangan pejabat yang terisi dinamis.

---

### 7. Tautan Branch, Commit & Dokumen Pendukung
* **Branch:** `feature/KOI-112-spj-umk-panjar-verifikasi-nota-tutup-panjar`
* **Jira Key:** `KOI-112`
* **Status Jira:** `In Review`
