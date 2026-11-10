# KOI-124: [PMO-131] Core Double-Entry Ledger Engine & Validasi Keseimbangan Debet/Kredit

## 1. Latar Belakang & Urgensi Bisnis
Sesuai dengan ketentuan Peraturan Rektor No. 310 Tahun 2025 dan standar akuntansi entitas nirlaba ISAK 335, sistem ERP Keuangan PMO UTama wajib menjamin integritas pembukuan berpasangan (*double-entry bookkeeping*). Seluruh mutasi finansial operasional (pengadaan LS, panjar UMK, POS pendapatan unit, depresiasi aset, dan payroll) harus bermuara pada Buku Besar Umum (*General Ledger*) yang mutlak seimbang ($\sum \text{Debit} = \sum \text{Kredit}$).

Tanpa mesin pembukuan berpasangan yang ketat:
1. Terjadi risiko entri jurnal sepihak (*unbalanced journal*) yang merusak laporan neraca saldo (*Trial Balance*).
2. Terjadi manipulasi data historis jika jurnal yang telah diposting dapat dihapus langsung (*direct deletion*) tanpa jejak audit.
3. Transaksi dapat diselundupkan ke periode fiskal yang telah ditutup (*closed period*) atau dikunci (*locked period*).

Tiket ini mengimplementasikan dan memvalidasi keandalan mesin buku besar berpasangan, penyaringan buku besar per unit bisnis, immutabilitas jurnal dengan mekanisme pembatalan storno (*reversal*), serta pencatatan jejak audit forensik.

---

## 2. Lokasi Menu & Fitur yang Berubah
* **Modul Frontend:**
  * **Menu:** Akuntansi & Buku Besar (`/accounting`)
  * **Tab:** Buku Besar & Neraca Saldo (`AccountingView.vue`)
  * **Fitur Baru:** Dropdown filter per Unit Bisnis (`selectedLedgerBusinessUnit`), kontrol neraca saldo real-time (`trialBalanceSummary.isBalanced`), dan kartu mutasi buku besar (*running balance*).
* **Modul Backend & Core Services:**
  * **File Engine:** `apps/api/src/shared/accounting-engine.ts` (`createOrGetBalancedJournal`)
  * **File Router:** `apps/api/src/modules/accounting/routes.ts` (`GET /journals`, `POST /journals`, `DELETE /journals/:id`, `POST /journals/:id/reverse`, `GET /ledger`)
  * **Automated Tests:** `apps/api/src/tests/erp.test.ts` (Bagian 6 & Bagian 17).

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Role | Akses Baca Buku Besar (`accounting:view`) | Posting Jurnal Manual (`accounting:post`) | Eksekusi Reversal (`accounting:post`) | Hapus Jurnal Langsung |
| :--- | :---: | :---: | :---: | :---: |
| **ACCOUNTING_STAFF** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Ditolak (403 Immutable) |
| **FINANCE_MANAGER** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Ditolak (403 Immutable) |
| **GENERAL_MANAGER** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Ditolak (403 Immutable) |
| **INTERNAL_AUDITOR** | ✅ Ya (Read-Only) | ❌ Ditolak (403) | ❌ Ditolak (403) | ❌ Ditolak (403) |
| **UNIT_MANAGER** | ❌ Ditolak (403) | ❌ Ditolak (403) | ❌ Ditolak (403) | ❌ Ditolak (403) |

---

## 4. Langkah & Keputusan Teknis
1. **Aritmatika Sen Presisi Mutlak (`toCents` & `fromCents`):**
   - Menggunakan integer cent `BigInt` untuk seluruh validasi debit dan kredit guna mencegah *floating point precision drift*.
   - Menolak jurnal jika `totalDebitCents !== totalCreditCents` dengan kode error `UNBALANCED_JOURNAL` (HTTP 400).
2. **Proteksi Periode Fiskal:**
   - Memeriksa status periode fiskal dokumen: jika periode berstatus `CLOSED`, sistem menolak transaksi dengan `FISCAL_PERIOD_CLOSED` (HTTP 409).
   - Jika periode berstatus `LOCKED` (misal saat proses audit akhir tahun atau rekonsiliasi bank), mutasi ditolak dengan `FISCAL_PERIOD_LOCKED` (HTTP 409).
3. **Pencegahan Mutasi Jurnal Langsung (Immutability):**
   - Endpoint `DELETE /api/v1/accounting/journals/:id` secara eksplisit mengembalikan HTTP 403 `POSTED_JOURNAL_IMMUTABLE`.
   - Koreksi transaksi wajib melalui endpoint `POST /api/v1/accounting/journals/:id/reverse` yang membuat entri jurnal pembalik baru (*storno*), menukar posisi Debit dan Kredit, menandai status jurnal asal menjadi `REVERSED`, mengunci dari pembalikan ganda (`ALREADY_REVERSED`), dan merekam jejak di tabel `AuditLog`.
4. **Penyaringan Ledger Per Unit Bisnis:**
   - Parameter `businessUnitId` pada `GET /api/v1/accounting/ledger` menyaring mutasi jurnal terposting untuk unit bisnis yang dipilih, menghitung saldo berjalan (*running balance*) berdasarkan saldo normal akun (`DEBIT` vs `CREDIT`), dan menyajikan ringkasan Neraca Saldo khusus unit tersebut.

---

## 5. Data Riil & Angka Faktual
* **70 Akun COA Pertor 310:** Terhubung penuh dengan hirarki 5 kelas akun (`1-Kas & Bank`, `2-Kewajiban`, `3-Ekuitas`, `4-Pendapatan`, `5-Beban`).
* **5 Unit Bisnis PMO:**
  1. `ITS` (PTNBH Information Technology Services)
  2. `KLINIK` (Pusat Layanan Kesehatan Terpadu)
  3. `MICE` (Pusat Konvensi, Wisma & Gedung Diklat)
  4. `TCI` (Testing, Certification & Assessment Institute)
  5. `PMO-MGMT` (Manajemen Kantor Pusat Operasional PMO)
* **Keseimbangan Trial Balance:**
  - $\sum \text{Debit} - \sum \text{Kredit} = 0$ (Selisih Rp 0).

---

## 6. Panduan Verifikasi QA / Boss
1. **Verifikasi Otomatis (Vitest Suite):**
   ```bash
   npm test
   ```
   *Ekspektasi:* Seluruh 57 tes integrasi lulus 100%, termasuk 4 uji skenario baru pada Bagian 17 (`KOI-124`):
   - Validasi penolakan jurnal tidak seimbang (`UNBALANCED_JOURNAL`).
   - Verifikasi isolasi buku besar dan Trial Balance per unit bisnis.
   - Penolakan penghapusan jurnal terposting (`POSTED_JOURNAL_IMMUTABLE`).
   - Eksekusi jurnal pembalik storno dan penolakan pembalikan ulang (`ALREADY_REVERSED`).

2. **Verifikasi Typecheck & Build:**
   ```bash
   npm --workspace=apps/api run typecheck
   npm --workspace=apps/web run typecheck
   npm --workspace=apps/web run build
   ```
   *Ekspektasi:* Exit code 0, 0 error.

3. **Verifikasi Antarmuka Web:**
   - Buka menu **Akuntansi & Buku Besar** (`http://localhost:5173/accounting`).
   - Di tab **Buku Besar & Neraca Saldo**, gunakan filter dropdown **Unit Bisnis** (pilih unit seperti `MICE` atau `ITS`).
   - Periksa status keseimbangan buku besar: badge **SESUAI (MATCHED)** berwarna hijau dengan total debit dan kredit seimbang.
   - Klik tombol **Mutasi** pada salah satu akun untuk melihat kartu buku besar dengan saldo berjalan (*running balance*).

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Jira Key:** `KOI-124` (Subtask/Story dari Epic `KOI-122`)
* **Sprint:** Sprint 5 (`General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Git Feature Branch:** `feature/KOI-124-core-double-entry-ledger-engine`
* **Pull Request Target:** `main`
* **Status Jira:** `In Review` (Anti-Done sesuai kebijakan manajer)
