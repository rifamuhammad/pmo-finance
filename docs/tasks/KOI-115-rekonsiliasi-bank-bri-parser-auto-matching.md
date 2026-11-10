# Dokumentasi Teknis Task: KOI-115

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-081`
* **Jira Issue Key:** `KOI-115`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-081] Rekonsiliasi Bank BRI: Parser Rekening Koran CSV/Excel & Auto-Matching`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer Keuangan / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-22`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-115-rekonsiliasi-bank-bri-parser-auto-matching`

---

## 2. Deskripsi & Latar Belakang Kepatuhan
Sesuai Peraturan Rektor Universitas Terbuka No. 310 Tahun 2025 (Pertor 310) dan Kebijakan Akuntansi Kas & Setara Kas:
1. Rekening operasional utama penerimaan dan pengeluaran PMO UTama terikat pada rekening **Bank BRI (Persero) Tbk - Kantor Kas UT** dengan akun buku besar resmi **`110101020200`** (*Bank BRI Penerimaan Komersial Unit*).
2. Manajer Keuangan dan Staf Rekonsiliasi membutuhkan modul otomatis untuk mengunggah file rekening koran (format CSV / TSV hasil ekspor Internet Banking atau CMS Bank BRI), memproses transaksi mutasi kas/bank, mendeteksi impor ganda menggunakan sidik jari kriptografis **SHA-256**, serta mencocokkan mutasi rekening secara otomatis (*auto-matching*) terhadap dokumen internal (Setoran Kasir POS `CashDeposit`, Pelunasan Vendor `Expense`, Pencairan Panjar `PettyCashSubmission`, dan Kuitansi `Payment`).
3. Menampilkan penghitungan rekonsiliasi dua kolom real-time antara **Saldo Buku Kas PMO (General Ledger)** vs **Saldo Rekening Koran Bank**, serta indikator selisih (*unreconciled difference*).

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Backend (`apps/api/src/modules/reconciliation/routes.ts`)
1. **Engine Parser Rekening Koran Bank BRI (`parseBriStatementContent`)**:
   - Mendeteksi pemisah kolom otomatis (koma `,`, titik koma `;`, atau tab `\t`).
   - Normalisasi header kolom Bahasa Indonesia maupun Inggris (`Tanggal`, `No Referensi`, `Keterangan`/`Uraian`, `Debet`, `Kredit`, `Saldo`).
   - Normalisasi angka format Indonesia (`1.000.000,00` maupun `1000000`) dan format tanggal (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`).
   - Pemetaan arah mutasi otomatis: `Kredit > 0` $\rightarrow$ `CREDIT` (Uang Masuk / Penerimaan); `Debet > 0` $\rightarrow$ `DEBIT` (Uang Keluar / Pengeluaran).
2. **Endpoint Parser CSV (`POST /reconciliation/parse-csv`)**:
   - Menerima raw text konten mutasi dan mengembalikan daftar baris terstruktur berserta total debet dan kredit.
3. **Peningkatan Engine Auto-Matching (`analyzeStatementRows`)**:
   - Mendukung pencocokan multi-dokumen kas:
     - Mutasi Kredit (`CREDIT`): Dicocokkan ke `CashDeposit` (Setoran Kasir POS `110101020200`) dan `Payment` (Kuitansi Invoice).
     - Mutasi Debet (`DEBIT`): Dicocokkan ke `Expense` (Pelunasan Vendor LS), `PettyCashSubmission` (Pencairan Panjar UMK), dan `Refund` (Retur).
   - Pengamanan akses properti opsional (`p.receiptNumber?.toUpperCase()`, `pc.submissionNo?.toUpperCase()`).
4. **Endpoint Rekonsiliasi Dua Kolom (`GET /reconciliation/summary/:bankAccountId`)**:
   - Menghitung saldo buku besar (*Book Balance*) dari akumulasi entri jurnal berstatus `POSTED` pada akun COA terkait (`110101020200`).
   - Menghitung saldo bank fisik (*Bank Balance*) dan selisih rekonsiliasi (*Difference*).

### B. Frontend (`apps/web/src/modules/ReconciliationView.vue`)
1. **Drag-and-Drop & File Upload Reader**:
   - Area drag & drop untuk file CSV, TXT, dan TSV rekening koran Bank BRI dengan parsing langsung di browser/API.
   - Tombol preset: *"Gunakan Sampel Mutasi Bank BRI (Pertor 310)"* untuk memudahkan simulasi operasional.
2. **Banner Kepatuhan Pertor 310 Bank BRI**:
   - Menampilkan tag akun COA `110101020200` Bank BRI Kantor Kas UT.
   - Status badge real-time: `SEIMBANG (0 SELISIH)` atau `PERLU REKONSILIASI`.
3. **Widget Kalkulasi Dua Kolom**:
   - Menampilkan Saldo Buku Kas PMO (GL), Saldo Rekening Koran Bank, dan Selisih Rekonsiliasi secara berdampingan.
4. **Pembersihan Dummy Slop**:
   - Seluruh teks dummy statis (misal 'mutasi-bank-mandiri', 'STR-BNI', 'KWT-2026-0003') telah dieliminasi dan digantikan alur dinamis akun Bank BRI.

---

## 4. Bukti Verifikasi Kualitas Mutlak (Quality Gates)

### A. Vitest Integration Suite (30/30 Tests Passed)
```bash
npm run test
# Output:
# ✓ 5. Bank Statement Import Preview, BRI Parser & Duplicate Fingerprint Detection (KOI-115 / PMO-081) (2)
#   ✓ detects duplicate statement lines via SHA-256 fingerprint during preview
#   ✓ parses Bank BRI CSV statement, auto-matches transactions, and calculates book vs bank summary (PMO-081)
# Test Files: 1 passed (1)
# Tests: 30 passed (30) (100% Pass)
```

### B. Monorepo Typecheck (0 Errors)
```bash
npm run typecheck
# Output:
# > @pmo-erp/api@1.0.0 typecheck
# > tsc --noEmit -p tsconfig.json
# > @pmo-erp/web@1.0.0 typecheck
# > vue-tsc --noEmit
# Selesai dengan kode 0 (0 error)
```

### C. Web Application Production Build
```bash
npm --workspace=apps/web run build
# Output:
# ✓ built in 3.31s
# dist/index.html 1.21 kB
# dist/assets/index-Dr5ZMjmJ.js 962.61 kB
```
