# KOI-132: [PMO-181] Navigasi Cepat, Omnisearch Cmd+K & App Launcher Modal

## 1. Latar Belakang & Urgensi Bisnis
Dalam operasional harian sistem ERP Keuangan PMO UTama (Universitas Terbuka PTNBH), pengguna dari berbagai divisi—mulai dari Manajer Keuangan, Akuntan, Staf Pengadaan, hingga Auditor SPI—membutuhkan akses instan terhadap ribuan dokumen transaksi dan master data tanpa harus berpindah-pindah menu secara manual.

Sebelumnya, pencarian Omnisearch hanya mencakup 4 tabel dasar dengan pencocokan peka huruf besar/kecil (*case-sensitive*), dan belum mencakup dokumen vital seperti **Anggaran RKAP Semula-Menjadi**, **70 Akun COA Pertor 310**, **Jurnal Buku Besar (GL)**, serta **Purchase Request (PR)**.

Tiket **KOI-132 (`PMO-181`)** pada Sprint 6 menyempurnakan mesin **Omnisearch `Cmd+K` / `Ctrl+K`** menjadi mesin pencarian paralel 8-domain yang *case-insensitive*, dilengkapi filter *scope* real-time beserta penghitung jumlah hasil (*live badge counters*) serta katalog dinamis **App Launcher Modal** yang menghormati otorisasi RBAC setiap peran.

---

## 2. Arsitektur Teknis & 8 Domain Pencarian Paralel
Implementasi mesin Omnisearch dan App Launcher tersebar pada:
* **Backend API:** `apps/api/src/modules/master/routes.ts`
  - `GET /api/v1/master/omnisearch?q=<query>&scope=<scope>`
  - `GET /api/v1/master/app-launcher`
* **Frontend Components:**
  - `apps/web/src/components/OmnisearchModal.vue`
  - `apps/web/src/components/AppLauncherModal.vue`
  - `apps/web/src/layouts/AppShell.vue` (Global keyboard listener `Cmd+K` / `Ctrl+K` dan `Escape`)

### Cakupan 8 Domain Pencarian (`Promise.all` Paralel, Case-Insensitive):
| No | Domain Data | Model Prisma | Atribut yang Dicari (`mode: 'insensitive'`) | Rute Navigasi |
| :---: | :--- | :--- | :--- | :--- |
| 1 | **Anggaran & RKAP** | `Budget` | `docNumber`, `title`, `notes` | `/budgets?q=<docNumber>` |
| 2 | **Bagan Akun Pertor 310** | `ChartOfAccount` | `code`, `name`, `type` (70 akun resmi aktif) | `/accounting?q=<codeCOA>` |
| 3 | **Jurnal Buku Besar (GL)** | `JournalEntry` | `journalNumber`, `description`, `sourceDocNumber` | `/accounting?q=<journalNumber>` |
| 4 | **Purchase Request (PR)** | `PurchaseRequest` | `docNumber`, `title`, `purpose`, `requestedByName` | `/procurement?q=<docNumber>` |
| 5 | **Purchase Order (PO)** | `PurchaseOrder` | `docNumber`, `selectionJustification`, `vendor.name` | `/procurement?q=<docNumber>` |
| 6 | **SPJ Kas Kecil (GUP/TUP)**| `PettyCashSubmission` | `submissionNo`, `activityDescription`, `applicantName`, `vendorName` | `/petty-cash?q=<submissionNo>` |
| 7 | **Aset & Inventaris** | `FixedAsset` | `name`, `assetCode`, `location`, `brandModel`, `picPerson`, `category` | `/assets?q=<name>` |
| 8 | **Pegawai SDM & Payroll** | `Employee` | `fullName`, `nik`, `position`, `department` | `/hris?q=<fullName>` |

### Isolasi Unit Bisnis Otomatis:
Apabila pengguna yang mencari memiliki peran `UNIT_MANAGER`, kueri pada model `Budget`, `JournalEntry`, `PurchaseRequest`, `PurchaseOrder`, dan `FixedAsset` secara otomatis difilter hanya pada `businessUnitId` milik unit kerja manajer tersebut.

---

## 3. Filter Scope & Live Counters di OmnisearchModal.vue
Antarmuka `OmnisearchModal.vue` menyediakan 6 tab filter instan:
1. **Semua (`ALL`):** Menggabungkan hasil dari seluruh 8 domain database dan pintasan modul.
2. **Keuangan & PO (`FINANCE`):** Menyaring dokumen Anggaran RKAP, Jurnal GL, PR, PO, dan SPJ Kas Kecil.
3. **COA Pertor 310 (`COA`):** Menyaring khusus 70 mata anggaran dan bagan akun resmi PMO UTama.
4. **Aset & Inventaris (`ASSET`):** Menyaring inventaris milik PMO maupun aset pinjaman PBI UT.
5. **SDM Pegawai (`HRIS`):** Menyaring database personel dan staf.
6. **Modul ERP (`MODULE`):** Menyaring pintasan navigasi menu aplikasi.

Setiap tab menampilkan jumlah kecocokan secara langsung dari metadata `countsByScope` yang dikembalikan server.

---

## 4. Katalog App Launcher Berbasis RBAC (`/api/v1/master/app-launcher`)
Endpoint `/api/v1/master/app-launcher` menyajikan daftar 14 modul utama ERP beserta:
* Status kunci otorisasi (`locked: true/false`) berdasarkan daftar permission JWT pengguna aktif.
* Lencana indikator real-time (*live badges*):
  - Jumlah dokumen menunggu persetujuan (`pendingApprovalsCount`) pada tile **Approval Inbox**.
  - Jumlah dokumen anggaran aktif pada tile **Perencanaan Anggaran**.
  - Jumlah akun COA aktif pada tile **Akuntansi & Buku Besar**.
  - Total item inventaris pada tile **Inventaris & Aset PMO**.

---

## 5. Verifikasi Pengujian Otomatis (Section 24)
File: `apps/api/src/tests/erp.test.ts`
* `Test 1: performs case-insensitive multi-domain Omnisearch across Budgets, 70 COA Pertor 310 accounts, Journals, and Assets`
  - Memastikan kueri `< 2` karakter mengembalikan array kosong tanpa membebani database.
  - Memvalidasi pencarian kode akun COA Pertor 310 (`1101`) dan pencarian dokumen anggaran (`bdg`) secara *case-insensitive*.
* `Test 2: filters Omnisearch results by scope (COA, FINANCE, ASSET, HRIS) and returns countsByScope metadata`
  - Memverifikasi parameter `scope=COA` hanya mengembalikan entitas bertipe `COA` beserta objek `countsByScope`.
* `Test 3: retrieves role-aware App Launcher catalog (/master/app-launcher) with RBAC lock states and live module badges`
  - Memastikan General Manager (`gmToken`) memiliki `lockedCount === 0` (seluruh 14 modul terbuka).
  - Memastikan Kasir (`cashierToken`) memiliki status terkunci (`locked: true`) pada modul sensitif seperti Administrasi & Audit.

---

## 6. Status Kepatuhan & Alur Kerja
* **Jira Ticket:** `KOI-132` (`PMO-181`)
* **Parent Epic:** `KOI-129` (`[SPRINT 6] Enterprise Tools, Omnisearch, AI Assistant & Ekspor PBI`)
* **Git Branch:** `feature/KOI-132-navigasi-cepat-omnisearch-cmd-k-app-launcher`
* **Transisi Status Jira:** `In Progress ➔ In Review` (Strictly Anti-Done).
