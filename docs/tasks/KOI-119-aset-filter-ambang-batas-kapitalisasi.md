# Dokumentasi Teknis Task: KOI-119

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-111`
* **Jira Issue Key:** `KOI-119`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-111] Filter Ambang Batas Kapitalisasi Aset Tetap (>10% Nilai Buku & Nilai Batas ISAK 335)`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer Aset / Akuntan / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-29`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-119-aset-filter-ambang-batas-kapitalisasi`

---

## 2. Deskripsi & Kepatuhan Standar Akuntansi (ISAK 335 & Pertor 310)
Berdasarkan Interpretasi Standar Akuntansi Keuangan (ISAK) 335 dan Peraturan Rektor Universitas Terbuka No. 310 Tahun 2024 tentang Tata Kelola Aset Tetap & Logistik PTN-BH:
1. **Ambang Batas Perolehan Baru (Initial Acquisition Threshold):**
   - **Peralatan, Mesin, Komputer TI, Audio Visual, & Mebel:** Batas minimum kapitalisasi adalah **Rp 1.000.000,-**. Perolehan di bawah nominal ini dibebankan langsung ke akun Beban Perlengkapan operasional (`520901020100`).
   - **Gedung & Bangunan / Fasilitas Permanen:** Batas minimum kapitalisasi adalah **Rp 20.000.000,-**.
2. **Aturan Filter Pengeluaran Setelah Perolehan (Subsequent Expenditure Rule >10%):**
   - Rumus Rasio Kapitalisasi:
     $$\text{Rasio Pengeluaran} = \left(\frac{\text{Nominal Perbaikan}}{\text{Nilai Buku Bersih / Net Book Value}}\right) \times 100\%$$
   - **Jika Rasio > 10% (Kapitalisasi):** Memenuhi kriteria peningkatan masa manfaat atau kapasitas aset secara signifikan. Pengeluaran dikapitalisasi ke akun Aset Tetap (`120301010100`), menambah nilai perolehan (`acquisitionCost`) dan nilai buku bersih (`bookValue`), serta dapat menambah masa manfaat (`additionalMonths`). Kredit ke Rekening Kas/Bank BRI (`110101020200`).
   - **Jika Rasio $\le$ 10% (Beban Pemeliharaan):** Diklasifikasikan sebagai servis atau pemeliharaan berkala rutin (*routine maintenance*). Dibukukan langsung ke akun Beban Pemeliharaan Unit Usaha (`520901060100`), kredit ke Rekening Kas/Bank BRI (`110101020200`), tanpa mengubah nilai buku aset.

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Skema Basis Data Prisma (`prisma/schema.prisma`)
* **Model Baru `AssetExpenditure`:**
  - Relasi `Cascade` dengan entitas `FixedAsset` (`assetId`).
  - Atribut:
    - `expenditureNumber` (String @unique, format: `EXP-AST/YYYY/MM/xxxx`).
    - `transactionDate` (DateTime @db.Date).
    - `description` (String).
    - `amount` (Decimal @db.Decimal(18, 2)).
    - `currentBookValue` (Decimal @db.Decimal(18, 2)).
    - `ratioPercent` (Decimal @db.Decimal(8, 2)).
    - `isCapitalized` (Boolean).
    - `accountingTreatment` (`CAPITALIZED_TO_ASSET` vs `EXPENSED_TO_MAINTENANCE`).
    - `coaDebit` (String: `120301010100` atau `520901060100`).
    - `coaCredit` (String: `110101020200`).
    - `additionalMonths` (Int @default(0)).
    - `vendorName`, `invoiceDocNumber`, `approvedBy`, `notes`.
  - Sinkronisasi langsung ke database PostgreSQL melalui `npx prisma db push`.

### B. Backend Engine & REST Endpoints (`apps/api/src/modules/assets/routes.ts`)
1. **Konstanta & Helper Evaluasi Kapitalisasi:**
   - `CAPITALIZATION_RULES`: Mendefinisikan batas `MIN_THRESHOLD_EQUIPMENT` (Rp 1 Jt), `MIN_THRESHOLD_BUILDING` (Rp 20 Jt), `SUBSEQUENT_EXPENSE_RATIO_PERCENT` (10%), serta pemetaan COA Pertor 310.
   - `evaluateCapitalization()`: Mesin simulasi dan kalkulasi rasio otomatis untuk pengadaan baru maupun perbaikan lanjutan.
2. **Endpoints API Terpasang:**
   - `GET /api/v1/assets/capitalization-rules`: Mengembalikan konstanta ambang batas dan pemetaan akun COA resmi.
   - `POST /api/v1/assets/evaluate-capitalization`: Endpoint simulasi/evaluasi cepat kepatuhan ISAK 335 sebelum transaksi dicatat.
   - `GET /api/v1/assets/expenditures/summary`: Rekapitulasi agregat pengeluaran aset (total transaksi, jumlah perbaikan kapitalisasi vs beban rutin, dan total nominal).
   - `GET /api/v1/assets/:id`: Mengambil detail aset lengkap beserta daftar pengeluaran historisnya.
   - `POST /api/v1/assets/:id/expenditures`: Pencatatan transaksi pengeluaran/perbaikan dengan validasi otomatis ambang batas 10% dalam Prisma Transaction (meng-update `FixedAsset.bookValue` jika kapitalisasi dan mencatat log audit SPI).
   - `GET /api/v1/assets/:id/expenditures`: Daftar riwayat pengeluaran untuk aset tertentu.

### C. Frontend Antarmuka Pengguna (`apps/web/src/modules/AssetsView.vue`)
1. **ISAK 335 & Pertor 310 Compliance Card:**
   - Panel informatif di atas tabel aset yang menampilkan ringkasan aturan filter kapitalisasi (Perolehan Baru $\ge$ Rp 1 Jt, Renovasi $> 10\%$ Nilai Buku, dan Perbaikan $\le 10\%$).
   - Statistik live agregat: jumlah transaksi perbaikan, total kapitalisasi, dan total pemeliharaan.
2. **Tombol Aksi Cepat "🔧 Perbaikan":**
   - Tersedia di setiap baris tabel aset untuk membuka modal pencatatan pengeluaran.
3. **Modal Catat Perbaikan / Renovasi dengan Live Evaluator:**
   - Input: Tanggal transaksi, nominal biaya perbaikan, deskripsi, penambahan masa manfaat (bulan), nama vendor, dan nomor invoice.
   - **Live Calculator Badge:** Menghitung rasio pengeluaran terhadap nilai buku secara real-time. Jika $>10\%$, memunculkan badge hijau `KAPITALISASI KE ASET TETAP` dan simulasi kenaikan nilai buku. Jika $\le 10\%$, memunculkan badge kuning `BEBAN PEMELIHARAAN (EXPENSED)` beserta pemetaan COA debit/kredit.
4. **Riwayat Perbaikan pada Modal Detail Aset:**
   - Menampilkan tabel historis seluruh pengerjaan perbaikan/servis aset dengan rincian rasio %, status perlakuan akuntansi, dan akun debet.

---

## 4. Hasil Pengujian & Verifikasi Kualitas

### A. Automated Integration Tests (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 13:
1. `validates initial acquisition capitalization thresholds and Pertor 310 COA mappings`: Memverifikasi aturan perolehan sub-ambang batas (Rp 750.000 $\rightarrow$ `EXPENSED_DIRECTLY` ke COA `520901020100`) dan perolehan di atas ambang batas (Rp 18.500.000 $\rightarrow$ `CAPITALIZED_TO_ASSET` ke COA `120301010100`).
2. `records routine subsequent maintenance expenditure <= 10% as EXPENSED_TO_MAINTENANCE without changing asset book value`: Memverifikasi pengeluaran pemeliharaan $5\%$ nilai buku dicatat sebagai beban rutin ke COA `520901060100`, dan nilai buku aset terbukti tidak berubah.
3. `records major renovation/overhaul > 10% of net book value as CAPITALIZED_TO_ASSET and increases asset book value`: Memverifikasi pengeluaran renovasi $25\%$ nilai buku dicatat sebagai kapitalisasi ke COA `120301010100`, nilai buku dan nilai perolehan aset terbukti bertambah sesuai nominal renovasi, riwayat pengeluaran terekam, dan ringkasan agregat terbarui.

Hasil eksekusi test suite:
```
Test Files  1 passed (1)
     Tests  42 passed (42)
  Duration  6.79s
```

### B. Workspace Typecheck & Production Build
1. `npm run typecheck`:
   - `@pmo-erp/api@1.0.0`: 0 errors.
   - `@pmo-erp/web@1.0.0`: 0 errors.
2. `npm --workspace=apps/web run build`:
   - Vite bundle sukses terbangun tanpa galat.

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-119` ditransisikan ke status `In Review` untuk divalidasi oleh Tim Akuntansi & Pengelola Aset PMO.
* Branch `feature/KOI-119-aset-filter-ambang-batas-kapitalisasi` dipusatkan ke remote repository dengan pull request terlampir.
