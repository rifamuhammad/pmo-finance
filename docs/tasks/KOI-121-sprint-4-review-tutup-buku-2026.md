# Dokumentasi Teknis Task: KOI-121

## 1. Metadata Pekerjaan
* **Kode Task:** `SPRINT-4-REV`
* **Jira Issue Key:** `KOI-121`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[SPRINT-4-REV] Sprint 4 Review & Tutup Buku Akhir Tahun 2026`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer Akuntansi & GM PMO / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-31`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-121-sprint-4-review-tutup-buku-2026`

---

## 2. Deskripsi & Ruang Lingkup Review Sprint 4
Sprint 4 berfokus pada otomasi kepatuhan operasional, penguncian data (data locking), serta kalkulasi aset tetap berstandar ISAK 335 dan Peraturan Rektor UT No. 310 Tahun 2024:
1. **Rekonsiliasi Bank BRI (`KOI-115` / `PMO-081`):** Parser rekening koran CSV/Excel, deteksi fingerprint duplikasi transaksi (SHA-256), serta pencocokan otomatis (*auto-matching*) mutasi kas bank BRI (`110101020200`).
2. **HRIS Penggajian PUT PK & SBM 2026 (`KOI-116` / `PMO-091`):** Standar Biaya Masukan 2026 (Uang Makan Rp 37.000/hari, Lembur Rp 20.000/jam), Iuran BPJS Ketenagakerjaan/Kesehatan, perhitungan tarif efektif rata-rata (PPh 21 TER A/B/C), dan generator batch slip gaji periode 12/2026.
3. **Database Karyawan & Rekapitulasi Presensi Unit (`KOI-117` / `PMO-101`):** Riwayat kontrak kerja multi-periode (`EmployeeContract`), peringatan otomatis sisa masa kontrak (<30 hari / expired), alur perpanjangan kontrak berstatus `RENEWED`, serta rekap presensi per unit bisnis.
4. **Engine Auto-Lock Presensi Tanggal 25 Pukul 23:59 (`KOI-118` / `PMO-102`):** Pembekuan mutasi presensi & lembur pasca cut-off tanggal 25 (403 `ATTENDANCE_PERIOD_LOCKED`), serta otorisasi pembukaan darurat (*unfreeze override*) oleh GM PMO dengan log audit SPI.
5. **Filter Ambang Batas Kapitalisasi Aset Tetap (`KOI-119` / `PMO-111`):** Filter perolehan baru ($\ge$ Rp 1 Jt untuk peralatan/mesin/TI vs $<$ Rp 1 Jt beban perlengkapan `520901020100`), serta aturan perbaikan lanjutan $>10\%$ nilai buku bersih dikapitalisasi ke Aset Tetap (`120301010100`) vs $\le 10\%$ beban pemeliharaan rutin (`520901060100`).
6. **Kalkulator Depresiasi Garis Lurus & Cut-off Tanggal 20 (`KOI-120` / `PMO-112`):** Perhitungan penyusutan metode garis lurus dengan aturan cut-off tanggal 20 ($\le 20$ disusutkan bulan berjalan, $> 20$ ditunda ke bulan berikutnya), model `AssetDepreciation`, dan auto-post jurnal berimbang ke Buku Besar GL (Debet `520901030100` vs Kredit `120301020100`).
7. **Simulasi Tutup Buku Akhir Tahun Fiskal 2026:** Penguncian periode `FP-2026-12` / `FY-2026` dan pengujian neraca saldo (*Trial Balance*) penutup.

---

## 3. Hasil Audit Integritas Buku Besar (Trial Balance) & Rekonsiliasi
* **Pengecekan Keseimbangan Buku Besar (General Ledger Balance Check):**
  - Seluruh jurnal transaksi dari Sprint 1 sampai dengan Sprint 4 (Pengadaan LS, Panjar UMK, POS Kasir, E-Revenue, HRIS Payroll, Kapitalisasi Aset, dan Penyusutan Bulanan) diuji pada endpoint `/accounting/ledger`.
  - **Hasil:**
    $$\sum \text{Total Debet} == \sum \text{Total Kredit}$$
    $$\text{Selisih (Variance)} = \text{Rp } 0,00 \quad (\text{Strictly Balanced})$$
* **Kepatuhan Penutupan Periode Fiskal (Fiscal Period Lock Enforcement):**
  - Penguncian periode fiskal akhir tahun terbukti menolak transaksi mutasi susulan tanpa otorisasi dengan kode respons `409 FISCAL_PERIOD_LOCKED`.

---

## 4. Hasil Pengujian Otomasi & Verifikasi Mutu

### A. Automated Integration Suite (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 15 (Sprint 4 Review):
1. `audits Sprint 4 operational compliance rules (Bank Rec, HRIS Cutoff 25, Asset Cap 10%, Asset Cutoff 20)`: Memverifikasi berfungsinya seluruh mesin aturan operasional Sprint 4.
2. `confirms the General Ledger Trial Balance is strictly balanced across all 5 Business Units post Sprint 4`: Memverifikasi neraca saldo GL 100% seimbang tanpa selisih debet/kredit.
3. `executes Year-End 2026 Fiscal Period lock audit and verifies rejection of post-closing mutations`: Menguji alur tutup buku akhir tahun dan penolakan transaksi susulan pada periode yang terkunci.

Ringkasan Hasil Eksekusi Test Suite Keseluruhan:
```
Test Files  1 passed (1)
     Tests  48 passed (48)
  Duration  10.32s
```

### B. Workspace Typecheck & Production Build
* `npm run typecheck`:
  - `apps/api`: 0 errors.
  - `apps/web`: 0 errors.
* `npm --workspace=apps/web run build`:
  - Vite production bundle terbangun secara optimal tanpa galat.

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-121` ditransisikan ke status `In Review` untuk ditinjau oleh Manajer Akuntansi dan GM PMO sebelum rilis Sprint 5.
* Branch `feature/KOI-121-sprint-4-review-tutup-buku-2026` dipusatkan ke remote repository dengan pull request terlampir.
