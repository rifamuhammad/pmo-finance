# KOI-131: [PMO-171] Perekaman Otomatis Mutasi Data & Jejak Audit (Forensic Audit Trail)

## 1. Latar Belakang & Urgensi Bisnis
Sebagai entitas Perguruan Tinggi Negeri Berbadan Hukum (PTNBH), PMO UTama mengelola dana operasional dan alokasi modal bernilai miliaran rupiah lintas 5 unit bisnis. Sesuai standar tata kelola keuangan negara, kepatuhan audit Satuan Pengawas Intern (SPI), dan ISAK 335, setiap peristiwa mutasi data (perubahan status dokumen, pergeseran plafon, persetujuan belanja, pencairan kas, hingga penolakan transaksi) wajib terekam secara otomatis dalam format **Jejak Audit Forensik (*Forensic Audit Trail*)**.

Sebelum adanya penyempurnaan ini:
1. Rekaman jejak audit belum memiliki antarmuka perbandingan nilai lapangan (*before vs after diff viewer*) untuk melihat rincian apa saja yang berubah saat revisi atau pembaruan.
2. Belum ada pencarian forensik multi-parameter (rentang tanggal, filter aksi spesifik, dan linimasa kronologis entitas dokumen).
3. Diperlukan penegakan hukum ketat pada level HTTP API (*strict immutability*) agar tidak ada peran apa pun (bahkan General Manager atau System Administrator) yang dapat mengubah atau menghapus rekaman jejak audit yang sudah terbentuk.

Tiket **KOI-131 (`PMO-171`)** di Sprint 6 menghadirkan modul audit forensik enterprise lengkap dengan endpoint kueri independen, komputasi *field diff*, ekspor CSV bertanda tangan digital server, dan penolakan HTTP 403 kebal mutasi.

---

## 2. Arsitektur Teknis & Modul Backend
Fitur jejak audit terdistribusi pada lapisan:
* **Router Audit Forensik:** `apps/api/src/modules/audit/routes.ts` (dipasang pada rute `/api/v1/audit`).
* **Audit Helper & Persistence:** `apps/api/src/shared/audit.ts` (`recordAuditLog(input, tx)`).
* **Database Model (Prisma):** Model `AuditLog` pada tabel basis data PostgreSQL dengan atribut:
  - `id`: UUID unik primer.
  - `actorId`, `actorName`, `actorRole`: Identitas otentik pelaku aksi.
  - `action`: Jenis aksi (`CREATE`, `UPDATE`, `SUBMIT`, `APPROVE`, `REJECT`, `REVISE`, `REVERSE`, `DELETE_BLOCKED`).
  - `module`: Kluster modul bisnis (`BUDGET`, `PROCUREMENT`, `EXPENSE`, `REVENUE`, `CASHIER`, `ACCOUNTING`, `APPROVAL`, `PETTY_CASH`, `HRIS`, `ADMIN`).
  - `entityType`, `entityId`, `entityCode`: Referensi dokumen terkait (misal `Budget`, `Journal`, `PurchaseRequest`).
  - `summary`: Ringkasan naratif peristiwa.
  - `beforeData`: Snapshot JSON nilai sebelum mutasi.
  - `afterData`: Snapshot JSON nilai setelah mutasi.
  - `ipAddress`: Alamat IP klien/jaringan pemohon.
  - `requestId`: UUID pelacakan request untuk korelasi log server.
  - `createdAt`: Stempel waktu presisi server.

---

## 3. Komputasi Deep Field Diff (Before vs After)
Fungsi `computeObjectDiff(before, after)` di `apps/api/src/modules/audit/routes.ts` melakukan rekursi mendalam terhadap dua payload JSON untuk menghasilkan array `FieldDiff[]`:
* `ADDED`: Properti baru yang sebelumnya tidak ada.
* `REMOVED`: Properti yang dihilangkan pada data baru.
* `MODIFIED`: Properti yang nilainya berubah (misal `allocatedAmount`, `status`, atau `approvalLimit`).

Hasil komputasi ini disajikan langsung pada endpoint `GET /api/v1/audit/logs/:id` sehingga klien antarmuka tidak perlu melakukan parsing manual.

---

## 4. API Endpoints & Perlindungan Strict Immutability
| Method | Endpoint | Hak Akses | Deskripsi & Respons |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/v1/audit/logs` | `audit:view` | Kueri forensik dengan multi-filter (`module`, `action`, `actorId`, `startDate`, `endDate`, `search`, pagination) |
| `GET` | `/api/v1/audit/logs/:id` | `audit:view` | Mengambil detail 1 log audit lengkap dengan array komputasi `diffs` |
| `GET` | `/api/v1/audit/entity/:type/:id` | `audit:view` | Menampilkan seluruh riwayat kronologis daur hidup suatu dokumen keuangan |
| `GET` | `/api/v1/audit/stats` | `audit:view` | Metrik statistik agregat (total peristiwa, aktivitas hari ini, breakdown per modul & aksi, top 5 aktor) |
| `GET` | `/api/v1/audit/export/csv` | `audit:view` | Ekspor CSV lengkap dengan UTF-8 BOM dan header standar investigasi SPI |
| `DELETE` | `/api/v1/audit/logs/:id` | `audit:view` | **Ditolak 403 Forbidden** (`AUDIT_LOG_IMMUTABLE`: Log audit permanen dan kebal penghapusan) |
| `PATCH` | `/api/v1/audit/logs/:id` | `audit:view` | **Ditolak 403 Forbidden** (`AUDIT_LOG_IMMUTABLE`: Log audit kebal manipulasi nilai) |
| `PUT` | `/api/v1/audit/logs/:id` | `audit:view` | **Ditolak 403 Forbidden** (`AUDIT_LOG_IMMUTABLE`: Log audit kebal penggantian payload) |

---

## 5. Integrasi Frontend UI (AdminAuditView.vue)
Penyempurnaan pada antarmuka Tab 4 (*Jejak Audit Trail*) mencakup:
1. **4 Kartu Metrik Forensik:**
   - Total Peristiwa Forensik (dengan label *Terproteksi Permanen Append-Only*).
   - Aktivitas Hari Ini (menghitung mutasi per tanggal hari ini dalam WIB).
   - Modul Teraktif (menyorot modul dengan volume mutasi tertinggi).
   - Integritas Forensik (Status *100% Kebal Mutasi*).
2. **Bilah Filter Multi-Parameter:**
   - Dropdown Modul Bisnis (13 pilihan modul).
   - Dropdown Aksi (CREATE, SUBMIT, APPROVE, REVISE, REVERSE, dsb).
   - Pemilih Rentang Tanggal Mulai dan Tanggal Selesai.
   - Input pencarian cepat teks (Aktor, Ringkasan, Request ID, Kode Dokumen).
   - Tombol **Ekspor CSV Forensik** satu-klik.
3. **Kolom Tindakan Forensik:**
   - Tombol *Lihat Diff / Detail* pada setiap baris tabel audit.
4. **Dialog Modal Diff Viewer:**
   - Menampilkan kartu identitas forensik lengkap (Waktu, Aktor, Role, IP Address, Request ID).
   - Menampilkan tabel perbandingan nilai *Before vs After* dengan pewarnaan intuitif (merah coret untuk nilai lama, hijau tebal untuk nilai baru).
   - Penampil payload JSON snapshot terformat rapi jika tidak terdapat perubahan lapangan.

---

## 6. Verifikasi Pengujian Otomatis (Section 23)
File: `apps/api/src/tests/erp.test.ts`
* `Test 1: automatically records immutable audit logs upon financial entity mutations with beforeData and afterData snapshots`
  - Memverifikasi endpoint `/api/v1/audit/logs` mengembalikan struktur log valid dengan metadata aktor, peran, modul, dan ringkasan.
  - Memvalidasi endpoint `/api/v1/audit/logs/:id` menyertakan array `diffs` terkomputasi dan flag boolean `hasChanges`.
* `Test 2: provides forensic query with multi-parameter filtering, date ranges, and chronological entity timeline`
  - Memvalidasi filter modul (`?module=BUDGET`).
  - Memvalidasi linimasa entitas kronologis (`/api/v1/audit/entity/Budget/:id`).
  - Memvalidasi agregasi metrik statistik pada `/api/v1/audit/stats`.
  - Memvalidasi streaming ekspor berkas `/api/v1/audit/export/csv`.
* `Test 3: strictly enforces audit trail immutability (403 AUDIT_LOG_IMMUTABLE) and RBAC authorization (requires audit:view)`
  - Memastikan request tanpa otentikasi ditolak (401 Unauthorized).
  - Memastikan upaya penghapusan via `DELETE /api/v1/audit/logs/:id` ditolak dengan kode status `403` dan kode error `AUDIT_LOG_IMMUTABLE`.
  - Memastikan upaya manipulasi via `PATCH /api/v1/audit/logs/:id` ditolak dengan kode status `403` dan kode error `AUDIT_LOG_IMMUTABLE`.

---

## 7. Status Kepatuhan & Eksekusi Alur Kerja
* **Jira Ticket:** `KOI-131` (`PMO-171`)
* **Parent Epic:** `KOI-129` (`[SPRINT 6] Enterprise Tools, Omnisearch, AI Assistant & Ekspor PBI`)
* **Git Branch:** `feature/KOI-131-perekaman-otomatis-mutasi-data-jejak-audit-forensik`
* **Transisi Status Jira:** `In Progress ➔ In Review` (Strictly Anti-Done).
