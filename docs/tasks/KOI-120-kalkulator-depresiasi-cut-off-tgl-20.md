# Dokumentasi Teknis Task: KOI-120

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-112`
* **Jira Issue Key:** `KOI-120`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-112] Kalkulator Depresiasi Garis Lurus & Cut-off Penyusutan Tanggal 20`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer Aset / Akuntan / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-31`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-120-kalkulator-depresiasi-cut-off-tgl-20`

---

## 2. Deskripsi & Kepatuhan Standar Akuntansi (ISAK 335 & Pertor 310)
Sesuai Interpretasi Standar Akuntansi Keuangan (ISAK) 335 dan Peraturan Rektor Universitas Terbuka No. 310 Tahun 2024 tentang Tata Kelola Aset Tetap:
1. **Metode Penyusutan Garis Lurus (Straight-Line Depreciation):**
   - Formula Depresiasi Bulanan:
     $$\text{Nilai Yang Disusutkan} = \text{Nilai Perolehan} - \text{Nilai Residu}$$
     $$\text{Beban Penyusutan Bulanan} = \frac{\text{Nilai Yang Disusutkan}}{\text{Masa Manfaat (Bulan)}}$$
     $$\text{Akumulasi Penyusutan} = \min(\text{Nilai Yang Disusutkan}, \text{Beban Bulanan} \times \text{Bulan Efektif Berjalan})$$
     $$\text{Nilai Buku Bersih (Net Book Value)} = \text{Nilai Perolehan} - \text{Akumulasi Penyusutan}$$
2. **Aturan Batas Waktu Cut-Off Tanggal 20:**
   - **Perolehan $\le$ Tanggal 20 Bulan Berjalan:** Beban penyusutan diakui penuh pada bulan perolehan itu sendiri (*depreciation starts in acquisition month*).
   - **Perolehan > Tanggal 20 Bulan Berjalan:** Beban penyusutan ditunda dan baru mulai diakui pada bulan berikutnya (*depreciation starts in subsequent month*).
3. **Pencatatan Jurnal Berimbang ke Buku Besar (General Ledger):**
   - **Debet:** Akun `520901030100` (*Beban Penyusutan Aset Tetap - Peralatan & Mesin*)
   - **Kredit:** Akun `120301020100` (*Akumulasi Penyusutan Peralatan & Mesin*)
   - Seluruh baris debit dan kredit dijamin berimbang secara otomatis (*strictly balanced double-entry*).

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Skema Basis Data Prisma (`prisma/schema.prisma`)
* **Model Baru `AssetDepreciation`:**
  - Menyimpan rekam jejak penyusutan per aset per bulan/tahun fiskal.
  - Atribut:
    - `id` (String @id @default(uuid()))
    - `assetId` (String, relasi cascade ke `FixedAsset`)
    - `periodYear` (Int), `periodMonth` (Int), `depreciationDate` (DateTime @db.Date)
    - `cutoffApplied` (Boolean @default(true))
    - `depreciableCost`, `monthlyDepreciation`, `priorAccumulated`, `depreciationAmount`, `endingAccumulated`, `endingBookValue` (Decimal)
    - `journalEntryId` (String?, relasi ke `JournalEntry`)
    - `coaDebit` ("520901030100"), `coaCredit` ("120301020100")
    - `status` ("POSTED"), `notes` (penjelasan aturan cut-off)
  - Constraint compound unique: `@@unique([assetId, periodYear, periodMonth])`.
  - Relasi ganda pada `FixedAsset` (`depreciations AssetDepreciation[]`) dan `JournalEntry` (`assetDepreciations AssetDepreciation[]`).

### B. Backend Engine & REST Endpoints (`apps/api/src/modules/assets/routes.ts`)
1. **Konstanta & Mesin Kalkulasi Depresiasi:**
   - `DEPRECIATION_RULES`: Mendefinisikan `CUTOFF_DAY = 20`, akun debet `520901030100`, akun kredit `120301020100`, dan referensi regulasi.
   - `computeStraightLineDepreciation()`: Menghitung umur ekonomis berjalan, menguji tanggal perolehan terhadap cut-off tanggal 20, dan menghitung beban depresiasi bulanan secara presisi.
2. **Endpoints API Terpasang:**
   - `GET /api/v1/assets/depreciation-rules`: Mengembalikan aturan cut-off tanggal 20 dan COA mapping.
   - `POST /api/v1/assets/depreciation-preview`: Endpoint simulasi perhitungan depresiasi dan validasi cut-off tanpa persistensi basis data.
   - `POST /api/v1/assets/depreciate-period`: Eksekusi batch penyusutan seluruh aset aktif untuk periode tertentu (bulan & tahun), memperbarui nilai buku aset, menyimpan riwayat `AssetDepreciation`, dan memposting jurnal berimbang GL via `createOrGetBalancedJournal()`.
   - `POST /api/v1/assets/depreciate`: Endpoint kompatibilitas yang mendelegasikan eksekusi ke `depreciate-period`.
   - `GET /api/v1/assets/:id/depreciations`: Riwayat eksekusi depresiasi berkala untuk suatu aset.
   - `GET /api/v1/assets/depreciations/history`: Rekapitulasi batch penyusutan per periode bulan/tahun dengan nomor jurnal GL terkait.

### C. Frontend Antarmuka Pengguna (`apps/web/src/modules/AssetsView.vue`)
1. **Widget Aturan Cut-Off Tanggal 20:**
   - Ditambahkan pada Compliance Card untuk memberikan kejelasan operasional bagi tim logistik dan akuntansi PMO.
2. **Tombol "Hitung Penyusutan Berjalan":**
   - Membuka modal dialog interaktif `showDepreciateModal` untuk memilih bulan & tahun target serta opsi posting otomatis ke GL.
   - Menampilkan ringkasan hasil kalkulasi, jumlah aset disusutkan, total nilai depresiasi, aset yang ditunda akibat cut-off tanggal 20, dan nomor jurnal terposting.
3. **Riwayat Depresiasi pada Modal Detail Aset:**
   - Menampilkan tabel historis penyusutan per periode dengan rincian beban depresiasi, akumulasi, sisa nilai buku, nomor jurnal GL, dan catatan kepatuhan cut-off.

---

## 4. Hasil Pengujian & Verifikasi Kualitas

### A. Automated Integration Tests (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 14:
1. `evaluates cut-off rule on the 20th under ISAK 335 / Pertor 310 (<= 20th depreciates current month, > 20th defers to next month)`:
   - Verifikasi konstanta aturan cut-off tanggal 20 dan COA mapping.
   - Pengujian perolehan tanggal 15 Maret 2026 ($\le 20$) $\rightarrow$ `eligible: true`, disusutkan mulai Maret 2026.
   - Pengujian perolehan tanggal 24 Maret 2026 ($> 20$) pada Maret 2026 $\rightarrow$ `eligible: false`, `depreciationThisMonth = 0`.
   - Pengujian perolehan tanggal 24 Maret 2026 pada April 2026 $\rightarrow$ `eligible: true`, penyusutan mulai diakui.
2. `executes periodic depreciation run with cut-off rule, updating asset book value and recording AssetDepreciation`:
   - Eksekusi periode 12/2026 menghasilkan data penyusutan aktual dan mencatat entri `AssetDepreciation`.
3. `posts balanced double-entry journal to General Ledger (Debet 520901030100 vs Kredit 120301020100)`:
   - Memverifikasi jurnal otomatis terbentuk dengan format `JRN-FY-...`, `totalDebit === totalCredit`, dan rekap history periode terhubung.

Hasil eksekusi test suite:
```
Test Files  1 passed (1)
     Tests  45 passed (45)
  Duration  10.02s
```

### B. Workspace Typecheck & Production Build
1. `npm run typecheck`:
   - `@pmo-erp/api@1.0.0`: 0 errors.
   - `@pmo-erp/web@1.0.0`: 0 errors.
2. `npm --workspace=apps/web run build`:
   - Vite bundle berhasil dibangun tanpa galat (`dist/assets/index-CmERvmjd.js`).

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-120` ditransisikan ke status `In Review` untuk divalidasi oleh Tim Akuntansi & Pengelola Aset PMO.
* Branch `feature/KOI-120-kalkulator-depresiasi-cut-off-tgl-20` dipusatkan ke remote repository dengan pull request terlampir.
