# 📊 Tiket KOI-94 (PMO-041): Penyesuaian Skema Prisma BudgetLine Multi-Volume & Pagu Pergeseran

- **Jira Key:** `KOI-94` (Task), `KOI-95`, `KOI-96`, `KOI-97` (Subtasks)
- **Status Jira:** `In Review` (Subtasks: `testing`)
- **Branch GitHub:** `feature/KOI-94-budget-line-multi-volume-semula-menjadi`
- **Model Basis Data:** `BudgetLine` di `prisma/schema.prisma`
- **API Controller:** `apps/api/src/modules/budget/routes.ts`
- **Uji Integrasi:** `apps/api/src/tests/erp.test.ts` (24 passed)

---

## 1. Latar Belakang & Urgensi Bisnis
Format penganggaran resmi Rektorat Universitas Terbuka (sebagaimana tercantum dalam `Tabel Kerja Anggaran Semula-Menjadi PMO 2027 30102026.xlsx` dan `Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx`) menggunakan model perhitungan volume bertingkat hingga 4 variabel:
$$\text{Total Volume} = V_1 \times V_2 \times V_3 \times V_4$$
$$\text{Pagu Alokasi} = \text{Total Volume} \times \text{Tarif Satuan}$$
$$\text{Selisih Pagu} = \text{Pagu Semula} - \text{Pagu Menjadi}$$

Model `BudgetLine` sebelumnya hanya menampung alokasi nominal tunggal (`allocatedAmount`). Tiket ini menyesuaikan skema basis data PostgreSQL dan REST API agar mampu menampung seluruh variabel volume, rincian aktivitas, dan pergeseran pagu Semula vs Menjadi.

---

## 2. Langkah & Keputusan Teknis
1. **Refactor Model `BudgetLine` (`prisma/schema.prisma`):**
   - Kolom Metadata RKAP: `activityCode`, `activityName`, `subActivity`, `detailDescription`, `kelompokPagu`, `fte`.
   - Kolom Multi-Volume: `vol1`, `satuan1`, `vol2`, `satuan2`, `vol3`, `satuan3`, `vol4`, `satuan4`, `totalVolume`, `unitPrice`.
   - Kolom Pergeseran Semula-Menjadi: `semulaAmount`, `pergeseranAmount`, `menjadiAmount`, `alasanRevisi`.
2. **Migrasi Database (`npx prisma db push`):**
   - Kolom baru berhasil disinkronkan ke PostgreSQL tanpa menghilangkan data transaksi yang sudah ada.
3. **Pengayaan Controller API (`apps/api/src/modules/budget/routes.ts`):**
   - Memperbarui skema validasi Zod `createBudgetSchema` dan `reviseSchema` untuk menerima input 4 volume dan nilai pergeseran.
   - Fungsi `enrichBudget` otomatis menghitung `totalVolume`, `semulaAmount`, `pergeseranAmount`, `menjadiAmount`, `selisihAmount`, dan `serapanPercent`.
4. **Automated Integration Testing:**
   - Ditambahkan pengujian kalkulasi multi-volume dan pergeseran revisi di `apps/api/src/tests/erp.test.ts`, memastikan hasil perkalian $2 \times 3 \times 2 \times 1 \times 1.500.000 = 18.000.000$ dan pergeseran $+6.000.000$ terhitung presisi.

---

## 3. Data Riil & Hasil Uji
- **Total Test Suite:** 24 passing (100% pass, 0 error).
- **Typecheck:** 0 type errors pada API maupun Web frontend.

---

## 4. Panduan Verifikasi
```bash
# 1. Jalankan typecheck penuh
npm run typecheck

# 2. Jalankan automated test suite
npm test
```
