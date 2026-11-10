# [KOI-113] [SPRINT-3-REV] Sprint 3 Review & Uji Transaksi Kas Lintas 5 Unit Bisnis PMO
## Berita Acara Review Akhir Sprint 3: Core Transaction Engines (LS, UMK & Revenue POS)

> **Jira Issue:** `KOI-113` | **Parent Epic:** `KOI-108` (`[SPRINT 3] Core Transaction Engines (LS, UMK & Revenue POS)`)  
> **Status:** `In Review` (STRICT: Menunggu tinjauan & persetujuan Manager)  
> **Branch GitHub:** `feature/KOI-113-sprint-3-review-uji-transaksi-kas`  
> **Periode Sprint 3:** Senin, 07 Desember 2026 – Jumat, 18 Desember 2026  
> **Regulasi Acuan:** Peraturan Rektor No. 310 Tahun 2025 (Lampiran I, II, dan III), ISAK 335, DIPA Pusat  

---

### 1. Latar Belakang & Urgensi Bisnis
Sprint 3 merupakan fase krusial pembangunan modul transaksi kas utama (*Core Transaction Engines*) pada PMO UTama Universitas Terbuka. Seluruh transaksi kas masuk dan kas keluar lintas 5 Unit Bisnis komersial (Diklat TCI, IT Solution, Poliklinik, MICE/Gedung UTCC, dan Manajemen PMO) harus terintegrasi penuh ke bagan akun 12-digit baku Peraturan Rektor No. 310 Tahun 2025.

Tujuan dari review akhir Sprint 3 (`KOI-113`) adalah:
1. Menguji keutuhan alur transaksi kas secara terintegrasi (*end-to-end*) dari hulu (Pengadaan LS, Panjar UMK, Kasir POS) ke hilir (Buku Besar / General Ledger).
2. Memverifikasi bahwa seluruh 5 Unit Bisnis PMO memiliki pemetaan akun pendapatan Pertor 310 yang tepat dan tidak ada jurnal fiktif/timpang.
3. Memastikan Trial Balance buku besar berada pada posisi seimbang sempurna (*Balanced = true*, selisih 0 IDR).
4. Menyajikan kompilasi 7 tiket fitur yang telah diselesaikan pada feature branch terpisah untuk ditinjau oleh Manager.

---

### 2. Lokasi Menu & Fitur yang Diuji
1. **Modul Pengadaan Langsung Rekanan (LS) — `/procurement` (`KOI-105`, `KOI-106`, `KOI-107`):**
   * Alur Purchase Request (PR) terhubung ke 296 Pos Anggaran riil Pertor 310.
   * Berita Acara Serah Terima (BAST) memposting jurnal akrual utang rekanan `210101010100` (Utang Pengadaan Barang dan Jasa).
   * Pelunasan tagihan vendor via Bank memotong utang rekanan dan mengkredit kas operasional/bank `110101020200`.
2. **Modul Kas Kecil & Uang Muka Kegiatan (UMK) — `/petty-cash` (`KOI-109`, `KOI-112`):**
   * Pencairan Panjar Kasir mendebit akun UMK Kegiatan `110501010100` dan mengkredit kas loket `110101010100`.
   * Pertanggungjawaban SPJ nota belanja mendebit beban operasional `5xxxxxxxxx`, memotong pajak PPh 21/22/23, dan menutup saldo panjar UMK (`110501010100`).
   * Lembar cetak SPJ resmi Pertor 310 terkonfigurasi tanda tangan dinamis tanpa data statis tiruan.
3. **Modul Pendapatan & Kasir POS — `/revenue` (`KOI-110`, `KOI-111`):**
   * Penerbitan faktur tagihan komersial mencatat piutang usaha `110301010100`, pendapatan `4203xxxxxx`, dan PPN Keluaran 11% `210202010100`.
   * Pembayaran tunai loket kasir POS terhubung ke register loket dan mencatat kas operasional `110101010100`.
   * Pembukaan shift loket kasir (*opening float*), pencatatan hitung fisik (*closeout*), dan pratinjau struk kuitansi kasir POS resmi kampus UT.
   * Penyetoran kas tunai (*cash deposit*) ke Bank BRI memposting auto-journal debit `110101020200` vs kredit `110101010100`.
4. **Buku Besar & Neraca Saldo — `/accounting`:**
   * Validasi integritas saldo debet dan kredit pada seluruh jurnal otomatis transaksi kas Sprint 3.

---

### 3. Matriks Hak Akses & 9 Role Pengguna
Seluruh alur transaksi kas Sprint 3 tunduk pada prinsip *Separation of Duties (SoD)*:
* `UNIT_MANAGER`: Mengajukan permohonan anggaran dan PR unit.
* `GM_PMO`: Mengesahkan permohonan revisi pagu dan otorisasi batas pengeluaran besar.
* `PROCUREMENT_OFFICER`: Mengelola perbandingan 3 penawaran vendor dan BAST penerimaan barang/jasa.
* `EMPLOYEE_PIC`: Mengajukan panjar kegiatan dan menyerahkan berkas SPJ kuitansi.
* `TAX_VERIFIER`: Memeriksa bukti potong pajak PPh/PPN sebelum SPJ disetujui.
* `FINANCE_MANAGER`: Menyetujui SPJ panjar UMK dan berita acara selisih kasir loket.
* `CASHIER`: Membuka sesi loket, menerima pembayaran fisik POS, mencairkan kas kecil, dan mencatat setoran bank BRI.
* `ACCOUNTING_STAFF`: Memonitor mutasi buku besar dan memverifikasi jurnal penyesuaian.
* `INTERNAL_AUDITOR`: Mengaudit seluruh transaksi lintas modul melalui audit log forensik (Read-Only).

---

### 4. Langkah & Keputusan Teknis
1. **Pemetaan Akun Pendapatan 12-Digit 5 Unit Bisnis PMO:**
   * `BU-TCI` (Diklat & Sertifikasi): `420301010200` (Pendapatan Pelatihan Profesional)
   * `BU-ITS` (IT Solution & Software): `420301040200` (Pendapatan Jasa Pemrograman & Lisensi)
   * `BU-KLINIK` (Poliklinik Pratama UT): `420301060100` (Pendapatan Pelayanan Rawat Jalan)
   * `BU-MICE` (UTCC Ballroom & Event): `420301070202` (Pendapatan Sewa Fasilitas Gedung UTCC)
   * `PMO-MGMT` (Manajemen PMO): `420301090100` (Pendapatan Manajemen Operasional)
2. **Kepatuhan Pajak:**
   * Utang Pajak PPN Keluaran 11%: `210202010100`.
   * Utang Pajak PPh 21/22/23: `210201010100`.
   * Beban Biaya Provider Payment Gateway: `590101010100` (Beban Administrasi Bank & Payment Gateway).
3. **Pembersihan Data Statis:**
   * Menghilangkan seluruh nilai bawaan tiruan pada form petty cash dan procurement; seluruh input kini berstatus formulir bersih (*clean slate*) berbasis input riil pengguna.

---

### 5. Data Riil & Hasil Uji Verifikasi
* **Automated Integration Tests:** **29 dari 29 test cases lolos 100% (Pass)** pada `apps/api/src/tests/erp.test.ts`.
* **General Ledger Integrity:**
  * Trial Balance Status: `isBalanced = true`
  * Selisih Debet vs Kredit: `0 IDR` (`diff = 0n`)
* **Monorepo Typecheck:** `0 errors` (TypeScript & Vue-TSC).
* **Vite Production Web Bundle:** Sukses ter-bundle dalam 3.38 detik.

---

### 6. Rekapitulasi Pull Request (PR) Sprint 3 untuk Peninjauan Manager
Seluruh pekerjaan Sprint 3 telah terisolasi rapi pada masing-masing branch kerja dan siap ditinjau untuk digabungkan (*merge*) ke branch `main`:

| No | Tiket Jira | Kode WBS | Judul Fitur / Modul | Branch GitHub | Status |
| :---: | :---: | :---: | :--- | :--- | :---: |
| 1 | `KOI-105` | `PMO-051` | Alur Pengadaan Langsung (LS): PR & Integrasi Pos Anggaran Riil | `feature/KOI-105-pengadaan-ls-pr-pos-anggaran-riil` | `In Review` |
| 2 | `KOI-106` | `PMO-052` | BAST & Jurnal Akrual Utang Pengadaan 2101 | `feature/KOI-106-bast-jurnal-utang-pengadaan-2101` | `In Review` |
| 3 | `KOI-107` | `PMO-053` | Pelunasan Vendor via Bank & Penutupan Utang 2101 | `feature/KOI-107-pelunasan-vendor-utang-pengadaan-2101` | `In Review` |
| 4 | `KOI-109` | `PMO-061` | Pencairan Panjar Kasir ke Akun UMK 110501010100 | `feature/KOI-109-modul-umk-panjar-spj-110501010100` | `In Review` |
| 5 | `KOI-110` | `PMO-071` | Modul Kasir E-Revenue: Sinkronisasi Akun Pendapatan 4203 & PPN | `feature/KOI-110-kasir-e-revenue-pendapatan-4203-ppn` | `In Review` |
| 6 | `KOI-111` | `PMO-082` | Modul Kasir Tunai POS & Setoran Deposit Bank BRI | `feature/KOI-111-kasir-pos-setoran-deposit-bank-bri` | `In Review` |
| 7 | `KOI-112` | `PMO-072` | Pertanggungjawaban SPJ UMK Panjar & Tutup Panjar 110501010100 | `feature/KOI-112-spj-umk-panjar-verifikasi-nota-tutup-panjar` | `In Review` |
| 8 | `KOI-113` | `SPRINT-3-REV`| Sprint 3 Review & Uji Transaksi Kas Lintas 5 Unit Bisnis PMO | `feature/KOI-113-sprint-3-review-uji-transaksi-kas` | `In Review` |

---

### 7. Tautan Branch & Dokumen Pendukung
* **Branch:** `feature/KOI-113-sprint-3-review-uji-transaksi-kas`
* **Jira Key:** `KOI-113` (Parent: `KOI-108`)
* **Status Jira:** `In Review`
* **Langkah Selanjutnya:** Peninjauan & merge PR oleh Manager, dilanjutkan persiapan kick-off **Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)**.
