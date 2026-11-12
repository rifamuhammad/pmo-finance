# KOI-130: [PMO-161] Generator Ekspor Excel Format Resmi PBI (Tabel 60 Kolom Tanpa Re-Typing)

## 1. Latar Belakang & Urgensi Bisnis
Proses pengajuan pergeseran anggaran dan evaluasi Rencana Kerja & Anggaran Tahunan (RKAT) di lingkungan PMO UTama (Universitas Terbuka PTNBH) mewajibkan pelaporan berkala menggunakan lembar kerja resmi **PBI (Pagu Belanja Induk / Pagu Biaya Institusi)** dengan format tabel 60 kolom (*Semula - Menjadi Revisi Block Grant PMO*).

Sebelum adanya fitur ini, tim keuangan dan manajer unit bisnis terpaksa melakukan entri ulang secara manual (*re-typing*) data pos anggaran, rincian 4 tingkat volume belanja, harga satuan, dan pergeseran nominal ke spreadsheet Excel secara terpisah. Hal ini menimbulkan risiko tinggi:
1. Kesalahan manusia (*human error*) dalam penghitungan rumus selisih pergeseran dan daya serap.
2. Inefisiensi waktu operasional berhari-hari menjelang audit atau rapat pimpinan universitas.
3. Diskrepansi antara data riil di sistem ERP (General Ledger, PO, dan Kas Keluar) dengan dokumen Excel yang diajukan ke kantor pimpinan.

Tiket **KOI-130 (`PMO-161`)** di Sprint 6 mengotomatiskan seluruh alur ekspor lembar kerja Excel 60 kolom berstandar resmi PBI secara langsung dari database sistem ERP hanya dalam satu klik (*one-click export*), lengkap dengan rumus dinamis Excel (`SUM`, selisih pergeseran, daya serap, dan prognosis).

---

## 2. Arsitektur Teknis & Engine PBI ExcelJS
Implementasi generator berada pada:
* **Backend Engine:** `apps/api/src/modules/budget/routes.ts` (`buildPbiExcelWorkbook(budgets, titleDoc)`).
* **Library:** `exceljs` (^4.4.0) untuk manipulasi workbook spreadsheet Office Open XML (.xlsx) yang tangguh dan mendukung styling kaya, merge cells, number formatting, formula, freeze panes, dan print landscape.
* **Frontend Service:** `apps/web/src/services/api.ts` (`downloadPbiExcel(budgetId?, docNumber?)`).
* **Frontend UI:** `apps/web/src/modules/BudgetsView.vue` (Tombol *Ekspor Format Resmi PBI* di Header Page dan Action Bar Drawer Detail).

### Fitur Engine Excel:
1. **Freeze Panes:** Membekukan 5 baris teratas (`views: [{ state: 'frozen', ySplit: 5 }]`) sehingga saat pengguna menggulir ke bawah, header grup dan nama 60 kolom tetap terlihat jelas.
2. **Setup Cetak Resmi:** Orientasi *Landscape* dengan `fitToPage: true` dan lebar pas 1 halaman (*fitToWidth: 1*).
3. **Pewarnaan Grup Header Resmi:**
   - Baris 1: Judul Utama Biru Tua PBI (`#002B66`, Teks Putih Tebal 14pt).
   - Baris 2: Subtitle Metadata Dokumen, Unit Bisnis, Periode Fiskal, dan Timestamp Ekspor WIB.
   - Baris 4: 4 Kluster Grup Kolom PBI:
     - **Cols 1–13:** *Informasi Mata Anggaran & Bagan Akun (COA Pertor 310)* — Slate Dark (`#0F172A`).
     - **Cols 14–25:** *Pagu Anggaran Semula (Alokasi Awal RKAP)* — Sky Blue (`#0284C7`).
     - **Cols 26–47:** *Pagu Anggaran Menjadi (Setelah Pergeseran)* — Emerald Green (`#059669`).
     - **Cols 48–60:** *Evaluasi Realisasi, Komitmen, Daya Serap & Prognosis* — Amber Dark (`#D97706`).

---

## 3. Struktur & Pemetaan 60 Kolom Resmi PBI
| No Kolom | Label Kolom PBI | Sumber Data ERP / Logika Formula | Format Sel |
| :---: | :--- | :--- | :---: |
| **1-13** | **Informasi Mata Anggaran** | | |
| 1 | No. | Nomor Urut Baris | Center |
| 2 | KODE IKPS | Kode Indikator Kinerja Program Strategis | Text Center |
| 3 | IKPS | Nama Program Strategis / Output PMO | Text Left |
| 4 | Kegiatan Unit | Nama Sub Kegiatan / Judul Proyek | Text Left |
| 5 | KODE STANDAR | Kode Standar Mutu Akademik / Operasional | Text Center |
| 6 | Standar Kegiatan | Uraian Standar Mutu PTNBH | Text Left |
| 7 | Sub Kegiatan Unit | Sub Kegiatan Turunan Unit Bisnis | Text Left |
| 8 | FTE | Beban Kerja / Satuan FTE | Center |
| 9 | Detil Kegiatan | Uraian Rincian Belanja / Pos Pengeluaran | Text Left |
| 10 | KELOMPOK PAGU | Kelompok Belanja (OPEX / CAPEX) | Center |
| 11 | BAS / AKUN | Klasifikasi Akun Makro | Center |
| 12 | KODE COA | 6 Digit Kode Akun Resmi PMO Pertor 310 | Text Center |
| 13 | Nama Akun / Uraian Beban | Nama Akun Buku Besar COA | Text Left |
| **14-25** | **Blok Pagu Semula** | | |
| 14-15 | vol 1 & sat 1 | Volume 1 & Satuan 1 Semula | Number / Text |
| 16-17 | vol 2 & sat 2 | Volume 2 & Satuan 2 Semula | Number / Text |
| 18-19 | vol 3 & sat 3 | Volume 3 & Satuan 3 Semula | Number / Text |
| 20-21 | vol 4 & sat 4 | Volume 4 & Satuan 4 Semula | Number / Text |
| 22 | total vol (Semula) | Formula: `=PRODUCT(N{row}, P{row}, R{row}, T{row})` | Number 0.00 |
| 23 | HARGA SATUAN (Semula) | Nilai Satuan Pagu Awal | IDR `#,##0` |
| 24 | JUMLAH BIAYA (Semula) | Formula: `=V{row} * W{row}` | IDR `#,##0` |
| 25 | JUMLAH PAGU SEMULA | Total Alokasi Semula per Line | IDR `#,##0` |
| **26-47** | **Blok Pagu Menjadi** | | |
| 26-35 | Metadata Menjadi | Refleksi Kode & Standar Pasca Pergeseran | Text |
| 36-43 | vol 1..4 & sat 1..4 Menjadi| Multi-volume Pasca Revisi | Number / Text |
| 44 | total vol (Menjadi) | Formula: `=PRODUCT(AJ{row}, AL{row}, AN{row}, AP{row})` | Number 0.00 |
| 45 | HARGA SATUAN (Menjadi) | Nilai Satuan Pasca Revisi | IDR `#,##0` |
| 46 | JUMLAH BIAYA (Menjadi) | Formula: `=AR{row} * AS{row}` | IDR `#,##0` |
| 47 | JUMLAH PAGU MENJADI | Total Alokasi Menjadi per Line | IDR `#,##0` |
| **48-60** | **Evaluasi & Prognosis** | | |
| 48 | SELISIH PERGESERAN (+/-) | Formula: `=AU{row} - Y{row}` (Menjadi - Semula) | IDR `#,##0` |
| 49 | REALISASI BEBAN AKTUAL | Beban Riil Buku Besar GL / Expense Terbayar | IDR `#,##0` |
| 50 | KOMITMEN PO / PR | Nilai Pesanan Pembelian / PR Berjalan | IDR `#,##0` |
| 51 | TOTAL TERIKAT (SERAPAN) | Formula: `=AW{row} + AX{row}` | IDR `#,##0` |
| 52 | SISA PAGU TERSEDIA | Formula: `=AU{row} - AY{row}` (Menjadi - Terikat) | IDR `#,##0` |
| 53 | DAYA SERAP (%) | Formula: `=IF(AU{row}>0, AY{row}/AU{row}, 0)` | Persen `0.0%` |
| 54 | ALASAN REVISI / PERGESERAN| Catatan Justifikasi Perubahan Anggaran | Text Left |
| 55-58 | Realisasi TW I s/d TW IV | Pembagian Realisasi Triwulan 1–4 | IDR `#,##0` |
| 59 | PROGNOSIS AKHIR TAHUN | Formula: `=AW{row} + (AZ{row} * 0.8)` | IDR `#,##0` |
| 60 | STATUS EVALUASI | Sesuai / Overbudget / Perlu Revisi | Center |

---

## 4. API Endpoints & Kontrol RBAC
* `GET /api/v1/budgets/export/pbi-excel`
  * Mengekspor seluruh dokumen anggaran aktif (konsolidasi lintas unit bisnis) dalam format 60 kolom PBI.
  * Otorisasi: Wajib memiliki hak akses `budget:view`.
* `GET /api/v1/budgets/:id/export/pbi-excel`
  * Mengekspor dokumen anggaran spesifik berdasarkan `id` dengan metadata nomor dokumen resmi.
  * Otorisasi: Wajib memiliki hak akses `budget:view` dan unit scope sesuai unit kerja pengguna.

---

## 5. Integrasi Frontend UI
1. **Header Action Bar (`apps/web/src/modules/BudgetsView.vue`):**
   - Tombol `.pill-btn-emerald` berlabel **Ekspor Format Resmi PBI** dengan icon Excel.
   - Status interaktif (`Mengekspor PBI...` dengan `pi-spin` saat proses streaming binary).
2. **Drawer Detail Budget:**
   - Tombol `.btn-drawer-emerald` berlabel **Ekspor PBI 60 Kolom** pada action bar sheet detail.
3. **Banner Feedback:**
   - Menampilkan notifikasi sukses unduhan atau peringatan jika jaringan terputus.

---

## 6. Verifikasi Suite Pengujian Otomatis (Section 22)
File: `apps/api/src/tests/erp.test.ts`
* `Test 1: exports consolidated 60-column PBI Excel file with valid XLSX binary stream and official column headers`
  - Memverifikasi response headers `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - Mem-parsing buffer biner menggunakan ExcelJS dan memverifikasi worksheet `'PBI Semula - Menjadi'` memiliki persis 60 kolom.
  - Memvalidasi isi grup header (Baris 4) dan 60 rincian header (Baris 5).
* `Test 2: exports single budget 60-column PBI Excel file and verifies formulas & multi-volume line items`
  - Memverifikasi ekspor per dokumen anggaran.
  - Memvalidasi baris TOTAL di bagian bawah worksheet yang menggunakan formula `=SUM(Y6:Y...)` dan `=SUM(AU6:AU...)`.
* `Test 3: enforces RBAC permissions on PBI Excel export (requires budget:view)`
  - Menolak request tanpa token otentikasi (401 Unauthorized).
  - Mengizinkan pengguna dengan wewenang `budget:view`.

---

## 7. Status Eksekusi & Kepatuhan Alur Kerja
* **Jira Ticket:** `KOI-130` (`PMO-161`)
* **Epic:** `KOI-129` (`[SPRINT 6] Enterprise Tools, Omnisearch, AI Assistant & Ekspor PBI`)
* **Git Branch:** `feature/KOI-130-generator-ekspor-excel-format-resmi-pbi`
* **Transisi Status Jira:** `In Progress ➔ In Review` (Strictly Anti-Done).
