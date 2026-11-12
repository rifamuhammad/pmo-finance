# KOI-125: [PMO-141] Generator Laporan Posisi Keuangan (Neraca) & Aktivitas ISAK 335

## 1. Latar Belakang & Urgensi Bisnis
Sebagai unit pengelola operasional komersial di bawah Universitas Terbuka (PTNBH), PMO UTama wajib menyajikan laporan keuangan yang patuh pada **Interpretasi Standar Akuntansi Keuangan (ISAK) 335** tentang Penyajian Laporan Keuangan Entitas Berorientasi Nonlaba, serta Peraturan Rektor No. 310 Tahun 2025.

Perbedaan fundamental standar ISAK 335 dibanding laporan komersial umum (PSAK):
1. **Laporan Posisi Keuangan (Neraca):** Istilah "Ekuitas" digantikan menjadi **Aset Neto (Net Assets)**. Aset Neto wajib dipisahkan secara tegas menjadi dua pos:
   - **Aset Neto Tanpa Pembatasan (*Unrestricted Net Assets*):** Modal kerja RKAP unit (`310101010100`), SiLPA/Saldo Laba (`310201010100`), dan akumulasi surplus/defisit operasional tahun berjalan.
   - **Aset Neto Dengan Pembatasan (*Restricted Net Assets*):** Dana terikat DIPA UT, hibah penelitian, atau bantuan yang penggunaannya dibatasi oleh pemberi dana (`320101010100`).
2. **Laporan Aktivitas (Statement of Activities):** Menggantikan Laporan Laba Rugi, menyajikan perubahan Aset Neto yang bersumber dari pendapatan komersial unit (akun 4) dikurangi seluruh beban belanja operasional PMO (akun 5), menghasilkan Surplus / (Defisit) Neto Periode Berjalan.
3. **Akun Kontra Aset (Akumulasi Penyusutan):** Akun akumulasi penyusutan aset tetap (`120301020100`) memiliki saldo normal Kredit namun bertipe Aset. Pada kalkulasi Neraca, akun ini wajib mengurangi nilai tercatat aset tetap (*contra-asset deduction*) agar persamaan $\text{Total Aset} = \text{Total Liabilitas} + \text{Total Aset Neto}$ terjaga seimbang 100%.

---

## 2. Lokasi Menu & Fitur yang Berubah
* **Modul Frontend:**
  * **Menu:** Laporan Keuangan (`/reports`) ➔ Tab `1. Laporan Keuangan & Realisasi Anggaran` ([`ReportsStrategyView.vue`](file:///Users/syahbintang/PmoFinance/apps/web/src/modules/ReportsStrategyView.vue))
  * **Penyajian Baru:**
    * Badge Standar: `STANDAR ISAK 335 (ENTITAS NIRLABA UT PTNBH)`.
    * 4 KPI Cards: Total Pendapatan Komersial, Total Beban Belanja, Surplus/Defisit Neto, dan Total Aset Neto (Unrestricted + Restricted).
    * Kolom Kiri: **Laporan Aktivitas (Statement of Activities)** dengan rincian pendapatan, beban, surplus berjalan, dan alokasi ke Aset Neto Tanpa Pembatasan vs Terikat.
    * Kolom Kanan: **Laporan Posisi Keuangan (Neraca ISAK 335)** dengan struktur: I. Aset (Lancar & Tetap/Kontra-Penyusutan), II. Liabilitas, III. Aset Neto (Tanpa Pembatasan + Dengan Pembatasan), dan badge status keseimbangan `MATCHED`.
* **Modul Backend & Reporting Service:**
  * **File Router:** `apps/api/src/modules/reports/routes.ts` (`GET /api/v1/reports/financial`)
  * **Enhancement:** Penambahan struktur data resmi `statementOfActivities` dan `statementOfFinancialPosition` (dengan pemisahan Aset Neto Unrestricted `31` dan Restricted `32`), penanganan contra-asset akumulasi penyusutan, serta tetap memelihara `incomeStatement` dan `balanceSheet` untuk *backward compatibility*.
* **Automated Tests:**
  * `apps/api/src/tests/erp.test.ts` (Bagian 18: 3 uji integrasi ISAK 335).

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Role | Akses Baca Laporan ISAK 335 (`report:view`) | Ekspor Laporan CSV/Excel (`report:export`) | Filter Laporan per Unit Bisnis |
| :--- | :---: | :---: | :---: |
| **GENERAL_MANAGER** | ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **FINANCE_MANAGER** | ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **ACCOUNTING_STAFF**| ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **INTERNAL_AUDITOR** | ✅ Ya (Read-Only SPI) | ✅ Ya | ✅ Ya |
| **UNIT_MANAGER** | ✅ Ya (Terbatas Unit Bisnisnya) | ❌ Ditolak | 🔒 Otomatis Terkunci ke Unit |

---

## 4. Langkah & Keputusan Teknis
1. **Pemisahan Aset Neto ISAK 335:**
   - Menghitung saldo akun awalan `31` sebagai Aset Neto Tanpa Pembatasan (*Unrestricted*). Saldo surplus operasional tahun berjalan (`netIncome`) diakumulasikan ke pos ini.
   - Menghitung saldo akun awalan `32` sebagai Aset Neto Dengan Pembatasan (*Restricted*).
   - $\text{Total Aset Neto} = \text{Aset Neto Tanpa Pembatasan} + \text{Aset Neto Dengan Pembatasan}$.
2. **Koreksi Contra-Asset Akumulasi Penyusutan:**
   - Akun bertipe `ASSET` dengan `normalBalance: 'CREDIT'` (seperti `120301020100` Akumulasi Penyusutan Aset Tetap) diperlakukan sebagai pengurang aset: $\text{netCents} = \text{debitCents} - \text{creditCents}$.
   - Hal ini menjamin bahwa Total Aset merefleksikan nilai buku bersih aset tetap (*Net Book Value*), sehingga $\text{Total Aset} = \text{Total Liabilitas} + \text{Total Aset Neto}$ bernilai seimbang mutlak tanpa selisih (selisih = Rp 0).
3. **Penyaringan Laporan per Unit Bisnis:**
   - Parameter query `businessUnitId` pada `GET /api/v1/reports/financial` menyaring transaksi jurnal terposting khusus untuk unit bisnis bersangkutan.
   - Persamaan neraca $\text{Aset} = \text{Liabilitas} + \text{Aset Neto}$ terbukti tetap seimbang baik pada tampilan konsolidasi seluruh PMO maupun per unit kerja.

---

## 5. Data Riil & Angka Faktual
* **Akun Aset Neto di Database:**
  * `310101010100`: Modal Kerja RKAP PMO UTama (Tanpa Pembatasan)
  * `310201010100`: SiLPA / Saldo Laba (Tanpa Pembatasan)
  * `320101010100`: Aset Neto Dengan Pembatasan (Restricted - Dana Terikat DIPA)
* **Keseimbangan Neraca (Persamaan ISAK 335):**
  * $\text{Total Aset} = \text{Total Liabilitas} + \text{Total Aset Neto}$
  * Toleransi selisih: $< 1$ rupiah (Aktual: 0 rupiah / Lolos Uji).

---

## 6. Panduan Verifikasi QA / Boss
1. **Verifikasi Otomatis (Vitest Suite):**
   ```bash
   npm test
   ```
   *Ekspektasi:* Seluruh 60 dari 60 tes integrasi lolos 100%, termasuk 3 skenario Bagian 18 (`KOI-125`):
   - Kalkulasi Laporan Aktivitas konsolidasi dan surplus/defisit berjalan.
   - Kalkulasi Laporan Posisi Keuangan ISAK 335 dengan Aset Neto Unrestricted vs Restricted dan pembuktian keseimbangan neraca.
   - Filter Laporan Keuangan berdasarkan `businessUnitId`.

2. **Verifikasi Typecheck & Build:**
   ```bash
   npm --workspace=apps/api run typecheck
   npm --workspace=apps/web run typecheck
   npm --workspace=apps/web run build
   ```
   *Ekspektasi:* Exit code 0, 0 error, build produksi selesai bersih.

3. **Verifikasi Antarmuka Web:**
   - Login sebagai `finance@pmoutama.demo.id` atau `accounting@pmoutama.demo.id`.
   - Buka menu **Laporan Keuangan** (`http://localhost:5173/reports`).
   - Periksa tab `1. Laporan Keuangan & Realisasi Anggaran`:
     - Lihat 4 KPI card di atas (Total Pendapatan, Beban, Surplus Berjalan, Total Aset Neto).
     - Periksa tabel **Laporan Aktivitas**: terdapat rincian alokasi surplus ke Aset Neto Tanpa Pembatasan.
     - Periksa tabel **Laporan Posisi Keuangan (Neraca)**: terdapat bagian I. Aset, II. Liabilitas, III. Aset Neto (Unrestricted & Restricted), dengan badge status **SESUAI (MATCHED)** berwarna hijau.
     - Ubah dropdown filter unit ke salah satu unit bisnis (misal `BU-DIKLAT` / `ITS`) dan pastikan neraca unit tetap seimbang.

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Jira Key:** `KOI-125` (Subtask/Story dari Epic `KOI-122`)
* **Sprint:** Sprint 5 (`General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Git Feature Branch:** `feature/KOI-125-generator-laporan-neraca-aktivitas-isak-335`
* **Pull Request Target:** `main`
* **Status Jira:** `In Review` (Anti-Done sesuai kebijakan manajer)
