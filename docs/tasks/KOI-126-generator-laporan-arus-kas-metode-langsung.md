# KOI-126: [PMO-142] Generator Laporan Arus Kas Metode Langsung (Direct Method)

## 1. Latar Belakang & Urgensi Bisnis
Sebagai entitas pengelola unit bisnis komersial di lingkungan Universitas Terbuka (PTNBH), PMO UTama diwajibkan menyusun **Laporan Arus Kas Metode Langsung (*Direct Method Cash Flow Statement*)** sesuai standar **ISAK 335** dan Peraturan Rektor No. 310 Tahun 2025.

Berbeda dengan metode tidak langsung (*indirect method*) yang merekonsiliasi laba bersih akrual, metode langsung menyajikan secara transparan arus penerimaan kas bruto (*gross cash inflows*) dan pengeluaran kas bruto (*gross cash outflows*) riil dari buku besar dan rekening bank:
1. **Aktivitas Operasi (*Operating Activities*):**
   - **Arus Kas Masuk:** Penerimaan kas dari pembayaran faktur klien komersial (MICE, TCI, IT/EdTech), penerimaan kasir POS/retail, dan penerimaan operasional lainnya.
   - **Arus Kas Keluar:** Pembayaran pengadaan ke vendor/pemasok, pembayaran gaji & tunjangan pegawai SDM, penyaluran Uang Muka Kerja (UMK) / kas kecil operasional unit, serta pembayaran pajak (PPN/PPh) dan beban operasional lainnya.
2. **Aktivitas Investasi (*Investing Activities*):**
   - Penerimaan dari penjualan/pelepasan aset tetap vs pengeluaran kas untuk perolehan aset tetap baru (*Capital Expenditures / CapEx*).
3. **Aktivitas Pendanaan (*Financing Activities*):**
   - Penerimaan setoran modal kerja RKAP / dana DIPA UT vs pengeluaran penarikan modal / transfer imbal hasil unit.
4. **Rekonsiliasi Saldo Kas & Bank (*Cash Reconciliation*):**
   - Membuktikan bahwa $\text{Saldo Akhir Kas} = \text{Saldo Awal Kas} + \text{Kenaikan/(Penurunan) Bersih Kas}$, serta mencocokkan total saldo akhir dengan seluruh rekening kas fisik dan bank operasional yang ada di Buku Besar PMO (Kas Operasional `110101010100`, Bank Mandiri `110101020100`, Bank BRI `110101020200`, dan UMK Kas Kecil `110501010100`).

---

## 2. Lokasi Menu & Fitur yang Berubah
* **Modul Frontend:**
  * **Menu:** Laporan Keuangan (`/reports`) ➔ Tab `1. Laporan Keuangan & Realisasi Anggaran` ([`ReportsStrategyView.vue`](file:///Users/syahbintang/PmoFinance/apps/web/src/modules/ReportsStrategyView.vue))
  * **Penyajian Baru:**
    * Badge Standar: `ISAK 335: METODE LANGSUNG`.
    * Header KPI: Kenaikan / (Penurunan) Bersih Kas Periode Berjalan.
    * **Kluster 1 - Aktivitas Operasi:** Grid pemisahan Penerimaan Kas (Pelanggan & Piutang, Lain-lain) vs Pengeluaran Kas (Pemasok/Vendor, Pegawai/Payroll, UMK Kas Kecil, Pajak/Lainnya) dan subtotal Arus Kas Bersih Operasi.
    * **Kluster 2 & 3 - Aktivitas Investasi & Pendanaan:** Rincian pelepasan vs perolehan aset tetap, serta setoran RKAP vs penarikan modal.
    * **Kluster 4 - Kartu Rekonsiliasi Kas & Bank:** Panel ringkasan Saldo Awal, Kenaikan Bersih, Saldo Akhir, Badge status `✓ REKONSILIASI COCOK (0 SELISIH)`, serta tabel rincian saldo buku besar tiap rekening kas dan bank.
* **Modul Backend & Reporting Service:**
  * **File Router:** `apps/api/src/modules/reports/routes.ts` (`GET /api/v1/reports/financial`)
  * **Engine Arus Kas Langsung:**
    * Mengiterasi seluruh jurnal transaksi kas terposting (`JournalEntry` yang melibatkan akun kas `1101*` atau `110501010100`).
    * Mengabaikan transfer internal antar-kas (seperti setoran kasir loket ke rekening bank) agar tidak mendistorsi nilai arus kas bruto.
    * Mengklasifikasikan mutasi kas riil berdasarkan akun lawan (*counter-account*): Akun 4/Piutang (Pelanggan), Akun 5201 (Beban Pegawai), Akun 2101/520x (Pemasok), Akun 1105 (UMK Kas Kecil), Akun 12 (Aset Tetap/Investasi), dan Akun 3 (Modal/Pendanaan).
    * Menyajikan objek terstruktur `directCashFlowStatement` sekaligus mempertahankan `cashFlowStatement` untuk kompatibilitas ke belakang.
* **Automated Tests:**
  * `apps/api/src/tests/erp.test.ts` (Bagian 19: 3 skenario uji integrasi Direct Cash Flow).

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Role | Akses Baca Arus Kas Langsung (`report:view`) | Ekspor Laporan CSV (`report:export`) | Filter Laporan per Unit Bisnis |
| :--- | :---: | :---: | :---: |
| **GENERAL_MANAGER** | ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **FINANCE_MANAGER** | ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **ACCOUNTING_STAFF**| ✅ Ya (Seluruh PMO & Konsolidasi) | ✅ Ya | ✅ Ya |
| **INTERNAL_AUDITOR** | ✅ Ya (Read-Only SPI) | ✅ Ya | ✅ Ya |
| **UNIT_MANAGER** | ✅ Ya (Terbatas Unit Bisnisnya) | ❌ Ditolak | 🔒 Otomatis Terkunci ke Unit |

---

## 4. Langkah & Keputusan Teknis
1. **Penyaringan Akun Kas (*Cash Account Filter*):**
   - Akun kas dan setara kas didefinisikan secara ketat pada kode awalan `1101` (Kas & Bank Mandiri/BRI) dan `110501010100` (Uang Muka Kerja / Kas Kecil).
   - Akun seperti `110502010100` (PPN Masukan) tidak dimasukkan sebagai kas karena merupakan aset pajak.
2. **Pengecualian Mutasi Internal Kas (*Inter-cash Transfer Exclusion*):**
   - Transaksi jurnal di mana semua baris debet dan kreditnya adalah akun kas (contoh: pemindahan dana tunai kasir ke rekening bank giro) dikecualikan dari perhitungan penerimaan/pengeluaran bruto, sehingga tidak terjadi *double-counting*.
3. **Rekonsiliasi Saldo Kas Fisik vs Buku Besar:**
   - Saldo akhir kas dihitung dari penjumlahan saldo berjalan buku besar seluruh rekening kas dan bank.
   - Saldo awal kas dihitung secara mundur matematis: $\text{Saldo Awal} = \text{Saldo Akhir} - \text{Kenaikan Bersih Kas}$.
   - Formula rekonsiliasi diverifikasi dengan selisih mutlak $< 1$ rupiah.

---

## 5. Data Riil & Angka Faktual
* **Rekening Kas & Bank Terdaftar:**
  * `110101010100`: Kas Operasional & Kasir Unit
  * `110101020100`: Bank Mandiri Operasional PMO
  * `110101020200`: Bank BRI Penerimaan Komersial PMO
  * `110501010100`: Uang Muka Kerja (UMK) / Kas Kecil Unit
* **Status Rekonsiliasi:**
  * `isReconciled`: `true`
  * Selisih rekonsiliasi: Rp 0.

---

## 6. Panduan Verifikasi QA / Boss
1. **Verifikasi Otomatis (Vitest Suite):**
   ```bash
   npm test
   ```
   *Ekspektasi:* Seluruh 63 dari 63 tes integrasi lolos 100%, termasuk 3 skenario Bagian 19 (`KOI-126`):
   - Uji pembuatan Laporan Arus Kas Metode Langsung ISAK 335 dengan kluster Operasi, Investasi, dan Pendanaan.
   - Uji verifikasi rekonsiliasi saldo kas akhir terhadap saldo rekening kas dan bank di Buku Besar.
   - Uji filter Laporan Arus Kas berdasarkan `businessUnitId`.

2. **Verifikasi Typecheck & Build:**
   ```bash
   npm --workspace=apps/api run typecheck
   npm --workspace=apps/web run typecheck
   npm --workspace=apps/web run build
   ```
   *Ekspektasi:* Exit code 0, 0 error, build produksi Vite selesai dalam ~3.8 detik.

3. **Verifikasi Antarmuka Web:**
   - Buka aplikasi web di browser (`http://localhost:5173/reports`).
   - Pilih tab **Laporan Keuangan & Realisasi Anggaran**.
   - Scroll ke bagian **Laporan Arus Kas (Direct Cash Flow Statement)**:
     - Periksa KPI Kenaikan / (Penurunan) Kas Bersih di kanan atas.
     - Periksa Kluster 1 (Aktivitas Operasi): tabel hijau penerimaan dan tabel merah pengeluaran operasional.
     - Periksa Kluster 2 & 3: Aktivitas Investasi dan Pendanaan.
     - Periksa Kluster 4: Kartu biru Rekonsiliasi Kas & Bank dengan badge hijau `✓ REKONSILIASI COCOK (0 SELISIH)` dan tabel rincian rekening kas & bank.

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Jira Key:** `KOI-126` (Subtask/Story dari Epic `KOI-122`)
* **Sprint:** Sprint 5 (`General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Git Feature Branch:** `feature/KOI-126-generator-laporan-arus-kas-metode-langsung`
* **Pull Request Target:** `main`
