# 🔒 Tiket KOI-87 (PMO-033): Master Periode Fiskal & Skema Locking Tutup Buku

- **Jira Key:** `KOI-87` (Task), `KOI-88`, `KOI-89` (Subtasks)
- **Status Jira:** `In Review` (Subtasks: `testing`)
- **Branch GitHub:** `feature/KOI-87-master-periode-fiskal-locking` *(Commit `342bf4e`)*
- **Script Verifikasi:** `scripts/verify_fiscal_periods_db.ts`

---

## 1. Latar Belakang & Urgensi Bisnis
Dalam siklus akuntansi PMO UTama, diperlukan mekanisme penguncian bertahap agar laporan keuangan bulanan yang sedang direkonsiliasi tidak mengalami pergeseran angka akibat transaksi susulan yang diinput oleh staf unit. 

Terdapat 3 kondisi status periode fiskal:
1. `OPEN`: Periode aktif, transaksi jurnal bebas dicatat.
2. `LOCKED`: Periode terkunci sementara untuk rekonsiliasi akhir bulan dan penyusunan laporan keuangan. Jurnal baru otomatis ditolak.
3. `CLOSED`: Periode ditutup permanen setelah disahkan audit. Tidak boleh ada transaksi apapun.

---

## 2. Langkah & Keputusan Teknis
1. **Seeding 15 Periode Fiskal (`prisma/seed.ts`):**
   - **Tahunan:** `FY-2025` (`CLOSED`), `FY-2026` (`OPEN`), `FY-2027` (`OPEN` untuk RKAP 2027).
   - **Bulanan 2026:**
     - `FP-2026-01` s/d `FP-2026-09`: `CLOSED`
     - `FP-2026-10`: `LOCKED` (Oktober 2026 sedang dalam rekonsiliasi)
     - `FP-2026-11`: `OPEN` (November 2026 berjalan aktif)
     - `FP-2026-12`: `OPEN` (Desember 2026 mendatang)
2. **Proteksi Jurnal (`apps/api/src/shared/accounting-engine.ts`):**
   - Validasi status periode sebelum posting jurnal.
   - Melempar `409 FISCAL_PERIOD_CLOSED` jika `isClosed || status === 'CLOSED'`.
   - Melempar `409 FISCAL_PERIOD_LOCKED` jika `status === 'LOCKED'`.
3. **Endpoint Kontrol Otorisasi (`apps/api/src/modules/master/routes.ts`):**
   - `POST /api/v1/master/fiscal-periods/:id/lock`: Mengunci sementara periode dengan proteksi RBAC (`ACCOUNTING`, `FINANCE_MANAGER`, `GM_PMO`) dan jejak rekam `AuditLog`.
4. **Integration Test Suite (`apps/api/src/tests/erp.test.ts`):**
   - Menambahkan pengujian otomatis yang memastikan penolakan posting jurnal ke `FP-2026-10` dengan status HTTP 409.

---

## 3. Data Riil & Hasil Uji
- **Total Periode Terdaftar:** 15 periode di database PostgreSQL.
- **Hasil Test:** Seluruh 22 test suite di repositori lulus 100%.

---

## 4. Panduan Verifikasi
```bash
# Verifikasi data 15 periode fiskal di PostgreSQL
npx tsx scripts/verify_fiscal_periods_db.ts

# Jalankan seluruh test suite
npm test
```
