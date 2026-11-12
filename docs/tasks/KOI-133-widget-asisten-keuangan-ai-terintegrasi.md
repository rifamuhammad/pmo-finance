# [KOI-133] [PMO-182] Widget Asisten Keuangan AI Terintegrasi (Context-Aware Financial AI)

- **Jira Ticket:** `KOI-133` (`[PMO-182] Widget Asisten Keuangan AI Terintegrasi (Context-Aware Financial AI)`)
- **Epic:** `KOI-129` (`[SPRINT 6] Enterprise Tools, Omnisearch, AI Assistant & Ekspor PBI`)
- **Branch:** `feature/KOI-133-widget-asisten-keuangan-ai-terintegrasi`
- **Status:** `In Review` (Strict Anti-Done Policy)
- **Assignee:** Bintang (`syahbintang30@gmail.com`)

---

## 1. Ringkasan Fitur & Solusi Arsitektur

Membangun dan menyempurnakan **PMO Financial Copilot (Context-Aware Financial AI)** yang terhubung secara real-time ke basis data lintas modul ERP PMO UTama dengan isolasi hak akses (RBAC & Unit Scoping):

1. **Endpoint Konteks Real-Time (`GET /api/v1/reports/ai-assistant/context`):**
   - Menghitung dan menyajikan ringkasan metrik keuangan real-time sesuai ruang lingkup pengguna (`isUnitScoped` otomatis aktif untuk `UNIT_MANAGER` dan `CASHIER`, sedangkan `GM_PMO`, `FINANCE_MANAGER`, `AUDITOR`, dan `SUPER_ADMIN` memperoleh visibilitas konsolidasi 5 unit bisnis).
   - Mengagregasi data lintas modul:
     - **Pagu PBI Semula-Menjadi**: `totalSemulaAmount`, `totalPergeseranAmount`, `totalMenjadiAmount`, `totalAllocated`, `totalCommitted`, `totalActualExpense`, `totalAvailable`, `serapanPercent`.
     - **Target & Capaian RGA**: `totalRgaTargetRevenue`, `totalRealizedRevenue`, `rgaAchievementPercent`, serta rincian per unit bisnis (`rgaUnits`).
     - **Buku Besar GL & Neraca ISAK 335**: `glTotalDebit`, `glTotalCredit`, `glIsBalanced` dari seluruh jurnal berstatus `POSTED`.
     - **Operasional, Kas Kecil & SDM**: `pendingApprovalsCount`, `activePettyCashCount` (`GUP`/`TUP_NIHIL`), `openCashierSessionsCount`, `fixedAssetsCount`, dan `employeesCount`.
     - **Quick Prompts Kontekstual**: 6 kategori prompt cepat lintas domain (PBI Semula-Menjadi, Target & Realisasi RGA, Neraca ISAK 335 & GL, Kas Kecil & Panjar UMK, Antrean Approval, Cut-Off Aset & HRIS).

2. **Mesin Analisis Finansial Deterministik & Integrasi Qwen/Ollama (`apps/api/src/shared/qwen.ts`):**
   - Memperkaya `QwenFinancialContext` dan `systemPrompt` dengan struktur 5 Unit Bisnis PMO UTama (`PMO-HQ`, `ITS`, `MICE`, `TCI`, `KLN`) dan regulasi PTNBH Universitas Terbuka (Pertor 310, ISAK 335, Storno GL, SLA 5 HK UMK, Cut-Off Aset Tgl 20, Cut-Off HRIS Tgl 25).
   - Menyediakan *Deterministic Financial Fallback Engine* yang mampu menjawab secara instan dan akurat meskipun dijalankan 100% *offline* tanpa koneksi cloud.

3. **Antarmuka Copilot Studio (`apps/web/src/components/AiAssistantWidget.vue`):**
   - Memuat snapshot konteks (`GET /reports/ai-assistant/context`) secara otomatis saat drawer dibuka.
   - Menampilkan 4 kartu indikator *Live Financial Context* (`Sisa Pagu Menjadi (PBI)`, `Capaian Pendapatan RGA`, `Buku Besar GL (ISAK 335)`, `Approval & Kas Kecil`).
   - Menyinkronkan pembaruan metrik konteks setiap kali percakapan `POST /reports/ai-assistant` selesai dieksekusi.

---

## 2. File yang Diubah / Ditambahkan

- `apps/api/src/shared/qwen.ts` — Perluasan kontrak `QwenFinancialContext`, injeksi fakta keuangan 5 unit bisnis pada `systemPrompt`, dan mesin analisis deterministik untuk PBI Semula-Menjadi, RGA, ISAK 335/GL, Kas Kecil UMK, serta Cut-Off Tgl 20 & 25.
- `apps/api/src/modules/reports/routes.ts` — Implementasi `buildAiAssistantContext`, endpoint `GET /api/v1/reports/ai-assistant/context`, dan pengayaan `POST /api/v1/reports/ai-assistant`.
- `apps/web/src/components/AiAssistantWidget.vue` — Integrasi `fetchContextSnapshot()`, kartu metrik keuangan real-time pada drawer Copilot, dan 6 pintasan prompt strategis.
- `apps/api/src/tests/erp.test.ts` — Penambahan **Section 25** (3 pengujian integrasi otomatis).

---

## 3. Bukti Verifikasi & Quality Gate

- **Integration Tests (`npm test`):** `81/81 passing` (termasuk 3 test baru pada Section 25).
- **Typecheck (`npm run typecheck`):** `0 errors` pada workspace `apps/api` dan `apps/web`.
- **Production Build (`npm run build`):** Sukses tanpa peringatan tipe atau bundle error.
