# [KOI-134] [SPRINT-6-REV] Sprint 6 Review & Kesiapan UAT Lintas Modul

- **Jira Ticket:** `KOI-134` (`[SPRINT-6-REV] Sprint 6 Review & Kesiapan UAT Lintas Modul`)
- **Parent Epic:** `KOI-129` (`[SPRINT 6] Enterprise Tools, Omnisearch, AI Assistant & Ekspor PBI`)
- **Branch:** `feature/KOI-134-sprint-6-review-kesiapan-uat-lintas-modul`
- **Status:** `In Review` (Strict Anti-Done Policy)
- **Due Date & Priority:** `2027-01-26` | `High`
- **Assignee:** Bintang (`syahbintang30@gmail.com`)

---

## 1. Latar Belakang & Urgensi Bisnis

Sebagai penutup rangkaian **Sprint 6 (`KOI-129`)** sebelum memasuki fase **Sprint 7 (UAT Audit SPI, Server Hardening & Production Go-Live)**, tim PMO UTama membutuhkan verifikasi terpusat yang memastikan seluruh kapabilitas enterprise tools pada Sprint 6 berfungsi serentak tanpa regresi pada buku besar maupun kontrol kepatuhan SPI.

Lima pilar kesiapan UAT lintas modul yang diaudit dalam tiket ini meliputi:
1. **`KOI-130` (`PMO-161`) — Generator Ekspor Excel Format Resmi PBI (60 Kolom Tanpa Re-Typing):** Kesiapan ekspor biner `.xlsx` 60 kolom sesuai format Bagian Perencanaan & Penganggaran UT Pusat.
2. **`KOI-131` (`PMO-171`) — Perekaman Otomatis Mutasi Data & Forensic Audit Trail:** Kesiapan perekaman snapshot `beforeData` & `afterData`, kalkulasi diff per field, ekspor CSV forensik, dan perlindungan immutability (`403 AUDIT_LOG_IMMUTABLE`).
3. **`KOI-132` (`PMO-181`) — Navigasi Cepat, Omnisearch Cmd+K & App Launcher Modal:** Kesiapan pencarian instan *case-insensitive* 8 domain entitas (termasuk 70 akun COA Pertor 310) dan katalog 14 modul `/api/v1/master/app-launcher` berbasis RBAC.
4. **`KOI-133` (`PMO-182`) — Widget Asisten Keuangan AI Terintegrasi (Context-Aware Financial AI):** Kesiapan sinkronisasi konteks finansial real-time (`/api/v1/reports/ai-assistant/context`) dan analisis deterministik atas Pagu PBI Semula-Menjadi, Target RGA, Neraca ISAK 335, Panjar UMK (SLA 5 HK), serta Cut-Off Aset Tgl 20 & HRIS Tgl 25.
5. **Integritas Buku Besar GL & Neraca ISAK 335 Lintas 5 Unit Bisnis:** Kepastian *Trial Balance* (`totalDebit === totalCredit`, `discrepancy === 0`) seimbang 100% pasca seluruh pengujian Sprint 1 s/d Sprint 6.

---

## 2. Lokasi Menu & Fitur yang Berubah

- **Backend API Endpoint (UAT Readiness Audit):**
  - `GET /api/v1/reports/sprint6-readiness` (`apps/api/src/modules/reports/routes.ts`)
- **Automated Integration Test Suite:**
  - `apps/api/src/tests/erp.test.ts` — Penambahan **Section 26: `[KOI-134] [SPRINT-6-REV] Sprint 6 Review & Kesiapan UAT Lintas Modul`** (3 skenario uji integrasi end-to-end).
- **Dokumentasi & Jadwal Sprint:**
  - `docs/tasks/KOI-134-sprint-6-review-kesiapan-uat-lintas-modul.md`
  - `docs/tasks/README.md`
  - `docs/JIRA-SPRINT-SCHEDULE-AND-TIMELINE.md`

---

## 3. Matriks Hak Akses & Role yang Berwenang

| Role Pengguna | Akses `GET /api/v1/reports/sprint6-readiness` | Cakupan Data (Unit Scope) | Catatan SoD & Kepatuhan |
| :--- | :---: | :--- | :--- |
| `SUPER_ADMIN`, `GM_PMO`, `FINANCE_MANAGER`, `ACCOUNTING_STAFF`, `INTERNAL_AUDITOR` | Diizinkan (`report:view` / `audit:view` / `gl:view`) | Konsolidasi 5 Unit Bisnis (`PMO-HQ`, `ITS`, `MICE`, `TCI`, `KLN`) | Auditor SPI & Manajemen dapat memeriksa kesiapan 5 pilar UAT secara penuh. |
| `UNIT_MANAGER`, `TREASURY_STAFF` | Diizinkan (`report:view`) | Terikat pada unit bisnis masing-masing atau parameter `businessUnitId` | Mendukung verifikasi kesiapan UAT per unit operasional. |
| `PROCUREMENT_STAFF`, `HR_ADMIN` | Ditolak (`403 Forbidden`) | Tidak memiliki izin `report:view` / `audit:view` / `gl:view` | Penegakan prinsip *least privilege* sesuai matriks RBAC 9 role. |

---

## 4. Langkah & Keputusan Teknis

1. **Implementasi Endpoint Audit Kesiapan UAT (`GET /api/v1/reports/sprint6-readiness`):**
   - Mengevaluasi secara real-time ketersediaan dokumen anggaran aktif (`APPROVED`/`REVISED`), rincian 4 dimensi volume (`Vol 1 x Vol 2 x Vol 3 x Vol 4`), pergeseran `Semula -> Pergeseran -> Menjadi`, serta kesiapan endpoint ekspor 60 kolom PBI (`KOI-130`).
   - Memeriksa jumlah catatan di `audit_logs`, keberadaan snapshot JSON (`beforeData`/`afterData`), dan status penegakan immutability `403 AUDIT_LOG_IMMUTABLE` (`KOI-131`).
   - Memverifikasi indeks pencarian lintas 8 domain entitas (COA, Anggaran, PR, Pengeluaran, Pendapatan, Jurnal GL, Aset Tetap, Pegawai HRIS) dan katalog 14 modul App Launcher (`KOI-132`).
   - Memastikan ketersediaan konteks finansial AI Copilot beserta metrik RGA dan kepatuhan regulasi (`KOI-133`).
   - Menghitung ulang keseimbangan *General Ledger Trial Balance* pada seluruh 5 unit bisnis dan menghasilkan skor kesiapan UAT (`readinessScore: 100`, `overallReady: true`).
2. **Pengujian Integrasi End-to-End Lintas Modul (Section 26 di `erp.test.ts`):**
   - Skenario 1: Memvalidasi struktur dan hasil audit `GET /api/v1/reports/sprint6-readiness` (`readyModules === 5`, `readinessScore === 100`).
   - Skenario 2: Menjalankan alur kerja lintas modul secara berurutan: unduh Excel PBI 60 kolom -> mutasi data anggaran & verifikasi rekam jejak forensik -> temukan entitas melalui Omnisearch -> konfirmasi angka pagu & keseimbangan GL melalui Context-Aware AI Copilot.
   - Skenario 3: Memastikan *Trial Balance* per unit bisnis (`PMO-HQ`, `ITS`, `MICE`, `TCI`, `KLN`) dan laporan posisi keuangan ISAK 335 memiliki selisih `0` (`discrepancy === 0`).

---

## 5. Data Riil & Angka Faktual

- **Cakupan Akun & Unit Bisnis:** 70 akun master COA sesuai Pertor UT No. 310 Tahun 2025 dan 5 Unit Bisnis (`PMO-HQ`, `ITS`, `MICE`, `TCI`, `KLN`).
- **Standar Format Ekspor PBI:** 60 kolom penuh (`Col 1` s/d `Col 60`) mencakup blok Semula (19 kolom), Menjadi (19 kolom), Pergeseran (7 kolom), serta Realisasi & Sisa Anggaran (8 kolom).
- **Skor Kesiapan UAT Sprint 6:** `5/5` modul siap (`readinessScore: 100%`), *Trial Balance Discrepancy*: `Rp 0`.
- **Total Pengujian Terotomasi:** **84 integration tests** pada `apps/api/src/tests/erp.test.ts` (Section 1 s/d Section 26) lulus 100%.

---

## 6. Panduan Verifikasi QA / Boss

```bash
# 1. Jalankan seluruh suite pengujian integrasi (Section 1 s/d Section 26 - 84 tests)
npm test

# 2. Pastikan typecheck bersih di backend & frontend (0 errors)
npm run typecheck

# 3. Pastikan production build sukses di backend & frontend
npm run build
```

Untuk menguji langsung endpoint audit kesiapan Sprint 6 saat server berjalan:
```bash
curl -H "Authorization: Bearer <TOKEN_FINANCE_MANAGER>" \
  http://localhost:3333/api/v1/reports/sprint6-readiness
```

---

## 7. Tautan Branch, Commit & Dokumen Pendukung

- **Branch GitHub:** `feature/KOI-134-sprint-6-review-kesiapan-uat-lintas-modul`
- **Jira Issue:** `https://kerjaku.atlassian.net/browse/KOI-134`
- **Parent Epic:** `https://kerjaku.atlassian.net/browse/KOI-129`
- **Dokumen Repo:** `docs/tasks/KOI-134-sprint-6-review-kesiapan-uat-lintas-modul.md`
