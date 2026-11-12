# KOI-128: [SPRINT-5-REV] Sprint 5 Review & Verifikasi Audit Trail Jurnal

## 1. Latar Belakang & Urgensi Bisnis
Sprint 5 merupakan milestone krusial dalam transformasi akuntansi digital PMO UTama (Universitas Terbuka PTNBH) dengan tema: **"General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335"**.

Tujuan utama dari task review ini adalah melakukan verifikasi integritas penutupan Sprint 5 secara menyeluruh:
1. **Inbox Approval Terpusat Lintas Dokumen (`KOI-123` / `PMO-121`):** Memastikan seluruh modul transaksi (Purchase Request, Anggaran, Pembayaran Vendor) bermuara pada satu inbox sentral dengan kontrol *Separation of Duties* (SoD), validasi alasan penolakan minimum 5 karakter, dan penguncian komitmen anggaran otomatis.
2. **Core Double-Entry Ledger Engine & Immutability (`KOI-124` / `PMO-131`):** Memverifikasi bahwa seluruh mutasi jurnal terposting di Buku Besar GL wajib seimbang ($\text{Debet} == \text{Kredit}$), memiliki running balance akun, kebal terhadap penghapusan langsung (*strict immutability* 403 `POSTED_JOURNAL_IMMUTABLE`), serta hanya dapat dikoreksi melalui mekanisme pembatalan storno berstatus `REVERSED` tanpa duplikasi reversal.
3. **5 Laporan Keuangan Standar ISAK 335 (`KOI-125` / `PMO-141` & `KOI-126` / `PMO-142`):**
   - Laporan Posisi Keuangan (Neraca) menyajikan pemisahan Aset Neto Tanpa Pembatasan (*Unrestricted*) dan Terikat (*Restricted*), memperhitungkan kontra-aset akumulasi penyusutan secara presisi sehingga $\text{Total Aset} = \text{Total Liabilitas} + \text{Total Aset Neto}$ seimbang mutlak 100% dengan selisih Rp 0.
   - Laporan Aktivitas konsisten mengakumulasikan surplus neto berjalan ke Aset Neto Tanpa Pembatasan.
   - Laporan Arus Kas Metode Langsung (*Direct Method*) mengklasifikasikan mutasi kas riil ke dalam 3 aktivitas (Operasi, Investasi, Pendanaan) serta merekonsiliasi kenaikan/penurunan kas dengan saldo buku besar kas dan rekening bank operasional.
4. **Executive Dashboard & Kinerja RGA (`KOI-127` / `PMO-151`):** Memantau real-time Target Pendapatan RGA, pergeseran pagu *Semula ➔ Menjadi*, laju belanja bulanan (*Monthly Burn Rate*), dan proyeksi serapan akhir tahun 5 unit bisnis.

---

## 2. Lokasi Menu & Fitur yang Ditinjau
* **Modul Akuntansi & Buku Besar (`/accounting`):**
  * Core GL Engine, Jurnal Manual, Audit Immutability, dan Jurnal Pembalik (Storno Reversal).
* **Modul Inbox Persetujuan (`/approvals`):**
  * Central Approval Inbox lintas dokumen dengan multi-status filter (PENDING, APPROVED, REJECTED) dan kontrol wewenang peran.
* **Modul Laporan Keuangan (`/reports`):**
  * Laporan Posisi Keuangan (Neraca ISAK 335).
  * Laporan Aktivitas (Statement of Activities).
  * Laporan Arus Kas Metode Langsung (Direct Cash Flow).
  * Laporan Realisasi Anggaran vs Komitmen vs Aktual.
* **Modul Executive Dashboard (`/dashboard`):**
  * Panel Analitik Kinerja RGA Semula-Menjadi, Burn Rate, dan Performa 5 Unit Bisnis PMO.
* **Suite Pengujian Otomatis:**
  * `apps/api/src/tests/erp.test.ts` (Bagian 16 s/d Bagian 21: Total 24 pengujian spesifik Sprint 5).

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Modul / Fitur | Role yang Berhak | Batasan Otorisasi & Kontrol SoD |
| :--- | :--- | :--- |
| **Central Approval Inbox** | `GENERAL_MANAGER`, `FINANCE_MANAGER`, `PROCUREMENT_OFFICER` | Hanya role berwenang pada tingkat hirarki dokumen yang dapat melakukan eksekusi approve/reject |
| **General Ledger & Jurnal**| `ACCOUNTING_STAFF`, `FINANCE_MANAGER` | Immutability berlaku untuk semua role; tidak ada role yang boleh menghapus jurnal terposting |
| **Laporan ISAK 335** | `GENERAL_MANAGER`, `FINANCE_MANAGER`, `ACCOUNTING_STAFF`, `INTERNAL_AUDITOR` | Read-only untuk SPI/Auditor; filter per unit bisnis terisolasi untuk Unit Manager |
| **Executive Dashboard RGA** | `GENERAL_MANAGER`, `FINANCE_MANAGER`, Seluruh Manajemen | GM PMO memiliki akses konsolidasi 5 unit bisnis; Unit Manager terkunci ke unitnya |

---

## 4. Hasil Audit Integritas Buku Besar (Trial Balance) & Kepatuhan
1. **Keseimbangan Buku Besar Konsolidasi (Consolidated Trial Balance):**
   - Diuji pada endpoint `/accounting/ledger`.
   - Hasil:
     $$\sum \text{Total Debet} == \sum \text{Total Kredit}$$
     $$\text{Selisih (Discrepancy)} = \text{Rp } 0,00 \quad (\text{Strictly Balanced})$$
2. **Keseimbangan Buku Besar Terisolasi per Unit Bisnis:**
   - Diuji secara terpisah untuk tiap unit bisnis: `BU-DIKLAT`, `BU-TCI`, `BU-MICE`, `BU-WIRA`, dan `BU-ITS`.
   - Seluruh unit membuktikan neraca saldo seimbang 100% tanpa distorsi silang antar-unit.
3. **Kepatuhan Persamaan Akuntansi ISAK 335:**
   $$\text{Total Aset} = \text{Total Liabilitas} + (\text{Aset Neto Unrestricted} + \text{Aset Neto Restricted})$$
   $$\text{Selisih Persamaan Neraca} = \text{Rp } 0,00$$
4. **Rekonsiliasi Kas Buku Besar:**
   $$\text{Saldo Akhir Kas} = \text{Saldo Awal Kas} + \text{Mutasi Bersih Kas}$$
   Mencocokkan saldo fisik kasir (`110101010100`), Bank Mandiri (`110101020100`), Bank BRI (`110101020200`), dan UMK Kas Kecil (`110501010100`) dengan selisih Rp 0.

---

## 5. Ringkasan Eksekusi Pengujian & Verifikasi Mutu

### A. Automated Integration Suite (`apps/api/src/tests/erp.test.ts`)
Pengujian mencakup 69 skenario uji integrasi end-to-end tanpa kegagalan:
```
Test Files  1 passed (1)
     Tests  69 passed (69)
  Duration  10.69s
```

Distribusi Uji Sprint 5:
* **Section 16 (`KOI-123` / `PMO-121`):** 5 uji integrasi Inbox Approval Terpusat.
* **Section 17 (`KOI-124` / `PMO-131`):** 4 uji integrasi Double-Entry Ledger & Storno Reversal.
* **Section 18 (`KOI-125` / `PMO-141`):** 3 uji integrasi Laporan Posisi Keuangan & Aktivitas ISAK 335.
* **Section 19 (`KOI-126` / `PMO-142`):** 3 uji integrasi Laporan Arus Kas Metode Langsung.
* **Section 20 (`KOI-127` / `PMO-151`):** 3 uji integrasi Executive Dashboard & Analitik RGA.
* **Section 21 (`KOI-128` / `SPRINT-5-REV`):** 3 uji audit penutupan Sprint 5 & audit trail forensik.

### B. Quality Gate Workspace
* `npm --workspace=apps/api run typecheck`: **0 errors**.
* `npm --workspace=apps/web run typecheck`: **0 errors**.
* `npm --workspace=apps/web run build`: **Sukses bersih** dalam 3.82 detik.

---

## 6. Panduan Verifikasi QA / Boss
1. **Verifikasi Test Suite:**
   ```bash
   npm test
   ```
   *Ekspektasi:* Seluruh 69 pengujian lulus 100%.
2. **Verifikasi Quality Gate:**
   ```bash
   npm --workspace=apps/api run typecheck
   npm --workspace=apps/web run typecheck
   npm --workspace=apps/web run build
   ```
   *Ekspektasi:* Seluruh perintah menghasilkan exit code 0 tanpa pesan kesalahan.
3. **Verifikasi Web Dashboard & Laporan Keuangan:**
   - Login ke antarmuka aplikasi (`http://localhost:5173`).
   - Buka menu **Dashboard**: periksa kartu KPI RGA Semula-Menjadi, burn rate, dan performa 5 unit bisnis.
   - Buka menu **Laporan Keuangan** (`/reports`): periksa Neraca ISAK 335 (status MATCHED), Laporan Aktivitas, dan Laporan Arus Kas Metode Langsung beserta panel rekonsiliasi kas/bank.
   - Buka menu **Persetujuan** (`/approvals`): pastikan inbox approval terpusat menampilkan statistik pending dan riwayat dokumen dengan benar.

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Jira Key:** `KOI-128` (Subtask/Story penutup Epic `KOI-122`)
* **Sprint:** Sprint 5 (`General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Git Feature Branch:** `feature/KOI-128-sprint-5-review-verifikasi-audit-trail-jurnal`
* **Pull Request Target:** `main`
