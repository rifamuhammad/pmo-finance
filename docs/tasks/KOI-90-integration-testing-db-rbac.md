# 🧪 Tiket KOI-90 (PMO-034): Integration Testing DB & Smoke Test Sesi RBAC

- **Jira Key:** `KOI-90` (Task), `KOI-91`, `KOI-92` (Subtasks)
- **Status Jira:** `In Review` (Subtasks: `testing`)
- **Branch GitHub:** `feature/KOI-90-integration-testing-db-rbac`
- **Script Benchmark:** `scripts/benchmark_query_coa.ts`
- **Script Smoke Test:** `scripts/smoke_test_rbac_roles.ts`
- **Test Suite:** `apps/api/src/tests/erp.test.ts` (23 passed)

---

## 1. Latar Belakang & Urgensi Bisnis
Sebagai penutup rangkaian **Sprint 1 (Foundation & Master Data)**, seluruh fondasi basis data dan otentikasi peran harus diuji secara komprehensif sebelum memasuki **Sprint 2 (Modul Anggaran Semula-Menjadi)**. 

Pengujian ini memastikan dua hal krusial:
1. **Performa Basis Data:** Query master COA, unit bisnis, cost center, dan periode fiskal harus memiliki latensi sangat rendah (< 50ms) dengan relasi *foreign key* yang kokoh (0 orphan records).
2. **Kepatuhan RBAC 9 Role:** Seluruh 9 peran pengguna resmi PMO UTama dapat melakukan login, memperoleh token sesi JWT, mengakses profil otorisasi, serta terbukti dibatasi oleh batas akses (*access boundaries*) masing-masing.

---

## 2. Langkah & Keputusan Teknis
1. **Benchmark Query PostgreSQL (`scripts/benchmark_query_coa.ts`):**
   - Mengukur 50 iterasi query per skenario untuk mendapatkan nilai *Average*, *Min*, *Max*, dan *P95 Latency*.
   - Skenario yang diuji:
     * Query Exact COA Code (`420301040100`): **1.69 ms**
     * Search COA Name (`contains "Pendapatan"`): **2.05 ms**
     * Query COA by Type (`REVENUE`): **2.41 ms**
     * Query 5 Business Units + Cost Centers & Cash Registers: **0.54 ms**
     * Query 15 Fiscal Periods (Urut tanggal): **0.29 ms**
     * Foreign Key Integrity (`JournalLine` + `ChartOfAccount`): **1.31 ms**
     * User FK (`User` + `BusinessUnit`): **0.54 ms**
   - Seluruh query berada jauh di bawah ambang batas toleransi 50ms.
2. **Audit Integritas Relasi & Deteksi Orphan Data:**
   - 87 akun ChartOfAccount, 8 AccountMapping, 5 BusinessUnit, 12 CostCenter, 5 CashRegister, 3 BankAccount, 15 FiscalPeriod, dan 17 User terdaftar.
   - Pengecekan relasi *Foreign Key*: Ditemukan **0 orphan Cost Centers** dan **0 orphan Cash Registers**.
3. **Smoke Test Login & Sesi 9 Peran Pengguna (`scripts/smoke_test_rbac_roles.ts`):**
   - Menguji otentikasi `POST /api/v1/auth/login` dan pengambilan sesi `GET /api/v1/auth/me` untuk seluruh 9 role:
     * `SUPER_ADMIN`: `admin@pmoutama.demo.id`
     * `GM_PMO`: `gm@pmoutama.demo.id`
     * `FINANCE_MANAGER`: `finance@pmoutama.demo.id`
     * `UNIT_MANAGER`: `unit.manager@pmoutama.demo.id` (Terspesialisasi ke Divisi TCI)
     * `PROCUREMENT`: `procurement@pmoutama.demo.id`
     * `ACCOUNTING`: `accounting@pmoutama.demo.id`
     * `CASHIER`: `kasir@pmoutama.demo.id` (Terspesialisasi ke Divisi TCI)
     * `TAX_OFFICER`: `tax@pmoutama.demo.id`
     * `AUDITOR`: `auditor@pmoutama.demo.id`
4. **Verifikasi Batas Akses (*Access Boundaries*):**
   - **Internal Auditor:** Berhasil diblokir (HTTP 403 `AUDITOR_READ_ONLY`) saat mencoba melakukan mutasi atau pembuatan anggaran.
   - **Kasir:** Berhasil diblokir (HTTP 403) saat mencoba menyetujui anggaran.
   - **Unit Manager:** Berhasil diblokir (HTTP 403 `CROSS_UNIT_FORBIDDEN`) saat mencoba membuat anggaran untuk unit bisnis lain.
5. **Pembaruan Automated Integration Test (`apps/api/src/tests/erp.test.ts`):**
   - Menambahkan skenario uji coba RBAC 9 peran otomatis, meningkatkan cakupan pengujian dari 22 menjadi **23 test cases** yang lulus 100%.

---

## 3. Data Riil & Hasil Uji
- **Latensi Query Rata-rata:** 0.29 ms - 2.41 ms (Target SLA: < 50 ms)
- **Status Foreign Key:** 0 orphan record
- **Hasil Smoke Test RBAC:** 9 role sukses login & retrieve sesi (100% Pass)
- **Integration Test Suite:** 23 passing (0 failed, 0 flaky)

---

## 4. Panduan Verifikasi QA & Boss
```bash
# 1. Jalankan benchmark query dan verifikasi relasi database
npx tsx scripts/benchmark_query_coa.ts

# 2. Jalankan smoke test login 9 peran dan batas akses RBAC
npx tsx scripts/smoke_test_rbac_roles.ts

# 3. Jalankan seluruh unit & integration test suite
npm test
```
