# KOI-123: [PMO-121] Inbox Approval Terpusat Lintas Dokumen & Kontrol Separation of Duties (SoD)

## 1. Latar Belakang & Urgensi Bisnis
Dalam tata kelola keuangan universitas dan unit usaha PMO UTama berbasis Pertor 310, otorisasi transaksi tidak boleh dilakukan secara sepihak dan harus mematuhi prinsip *Separation of Duties* (SoD). Pejabat pembuat pengajuan dilarang menyetujui transaksinya sendiri, dan persetujuan pengadaan strategis, revisi anggaran, SPJ panjar UMK, serta selisih kasir membutuhkan satu pintu kendali verifikasi yang terpusat.

Sebelumnya, pengajuan tersebar di modul masing-masing (Anggaran di Modul Budget, PR di Modul Procurement, SPJ di Modul Kas Kecil). Melalui tiket `KOI-123` (`PMO-121`), dibangun **Central Approval Inbox** terintegrasi (`/approvals` dan `ApprovalsView.vue`) yang memungkinkan Finance Manager dan General Manager PMO meninjau, menyetujui secara berjenjang, menolak dengan alasan tertulis, atau mengeksekusi *batch approval* massal terhadap dokumen dari berbagai modul operasional.

---

## 2. Lokasi Menu & Fitur yang Berubah
* **Menu Utama:** `Pusat Persetujuan` / `Inbox Approval` (`/approvals`)
* **Komponen Frontend:**
  * `apps/web/src/modules/ApprovalsView.vue`: Transformasi total dengan kartu ringkasan KPI eksekutif, tab filter per modul (PR, SPJ Panjar, Anggaran, Biaya, Kasir), switch cakupan peran (`Perlu Persetujuan Saya` vs `Semua Riwayat Pengajuan`), indikator visual badge SoD (*Pengusul SoD Aktif*), toolbar tindakan massal (*Batch Approve*), modal rincian sub-tabel transaksi, dan modal penolakan dengan validasi alasan resmi.
* **Backend Endpoint:**
  * Router baru `apps/api/src/modules/approvals/routes.ts` dimount pada `/api/v1/approvals` di `apps/api/src/app.ts`.
  * `GET /api/v1/approvals`: Inbox daftar persetujuan lintas modul dengan kalkulasi status kelayakan `canApprove` dan audit flag `isSelfRequested`.
  * `GET /api/v1/approvals/stats`: Ringkasan metrik antrean pending global, antrean aksi user, total nilai eksposur IDR, dan breakdown per modul.
  * `GET /api/v1/approvals/:id`: Rincian lengkap dokumen termasuk baris pengadaan/SPJ dan jejak audit forensik.
  * `POST /api/v1/approvals/:id/approve`: Dispatcher otorisasi berjenjang yang memperbarui status dokumen asal dan mencadangkan komitmen anggaran secara atomik.
  * `POST /api/v1/approvals/:id/reject`: Dispatcher penolakan dokumen dengan validasi alasan minimal 5 karakter.
  * `POST /api/v1/approvals/batch-approve`: Eksekusi persetujuan massal multi-dokumen sekaligus.
  * Ekstensi `apps/api/src/modules/pettycash/routes.ts` untuk registrasi otomatis `ApprovalRequest` saat SPJ diajukan serta endpoint penolakan `POST /petty-cash/submissions/:id/reject`.
  * Ekstensi `apps/api/src/modules/procurement/routes.ts` dengan penambahan `GET /procurement/purchase-requests/:id`.

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Role Pengguna | Kode Role | Hak Akses di Inbox Approval | Batas Nilai / Wewenang Otorisasi |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `SUPER_ADMIN` | Akses penuh, view semua, bypass SoD darurat | Tanpa batas |
| **General Manager PMO** | `GM_PMO` | Menyetujui usulan strategis, revisi anggaran, PR $\ge$ Rp 25 Juta | Plafon tak terbatas |
| **Finance Manager** | `FINANCE_MANAGER` | Menyetujui PR operasional (< Rp 25 Juta), SPJ Panjar UMK, pengeluaran kas, selisih kasir | Sesuai limit wewenang finance |
| **Unit Manager** | `UNIT_MANAGER` | Memantau status pengajuan unit bisnisnya & persetujuan internal unit | Terbatas pada unit bisnis yang ditugaskan |
| **Auditor Internal (SPI)**| `AUDITOR_INTERNAL` | Read-only inspection seluruh antrean & jejak audit keputusan | Tidak berhak approve/reject |

* **Aturan Separation of Duties (SoD):** Pembuat pengajuan (`requestedById == req.user.userId`) diblokir keras menyetujui dokumen miliknya sendiri (HTTP 403 `SEPARATION_OF_DUTIES_VIOLATION`), kecuali dalam mode demo non-produksi jika `ALLOW_SELF_APPROVAL=true` atau override `SUPER_ADMIN`.

---

## 4. Langkah & Keputusan Teknis
1. **Dispatcher Polimorfik Transaksional:**
   Persetujuan di tingkat inbox mengeksekusi logika domain spesifik sesuai modulnya dalam Prisma Transaction:
   - Modul `PURCHASE_REQUEST`: Mengecek sisa plafon pagu anggaran pada `BudgetLine`, mencadangkan komitmen pada tabel `BudgetCommitment`, menaikkan `committedAmount`, dan mengubah status PR ke `APPROVED`.
   - Modul `BUDGET`: Mengesahkan versi revisi/plafon anggaran menjadi `APPROVED`.
   - Modul `PETTY_CASH`: Mengesahkan pertanggungjawaban SPJ panjar bendahara unit menjadi `APPROVED` siap pencairan/nihilisasi.
   - Modul `CASHIER_DISCREPANCY`: Mengesahkan supervisor closeout sesi kasir berstatus `CLOSED`.
2. **Pencatatan Audit Trail Forensik:**
   Setiap tindakan *Approve*, *Reject*, maupun *Batch Approve* secara otomatis menulis ke tabel `AuditLog` dengan detail user pelaksana, peran, IP, dan alasan.
3. **Optimasi Batch Approval:**
   Mekanisme batch memvalidasi izin tiap dokumen satu per satu secara independen sehingga dokumen yang valid tetap diproses dan dokumen bermasalah dilaporkan dalam respon array kegagalan tanpa memblokir seluruh antrean.

---

## 5. Data Riil & Angka Faktual Uji
* **Total Suite Integration Testing:** 53 test lolos (100% passing) di `apps/api/src/tests/erp.test.ts`.
* **Section 16 (KOI-123):** 5 skenario uji spesifik mencakup:
  1. `GET /api/v1/approvals/stats`: Verifikasi struktur metrik dan pengelompokan `byModule`.
  2. `POST /api/v1/procurement/purchase-requests`: Pembuatan PR Rp 12.500.000 (10 meja lipat Rp 750.000 + 10 kursi jaring Rp 500.000) yang langsung terdaftar pada Inbox Approval dengan status `PENDING`.
  3. `POST /api/v1/approvals/:id/approve`: Eksekusi approval dokumen PR dan verifikasi status `APPROVED` serta pencadangan komitmen anggaran.
  4. `POST /api/v1/approvals/:id/reject`: Penolakan pengajuan sofa Rp 8.000.000 dengan alasan wajib $\ge 5$ karakter dan verifikasi status `REJECTED`.
  5. `POST /api/v1/approvals/batch-approve`: Persetujuan serentak 2 dokumen PR (ATK Rp 2.500.000 & Toner Rp 3.000.000) dengan hasil `successCount: 2, failedCount: 0`.

---

## 6. Panduan Verifikasi QA / Boss
1. **Pengujian Otomatis Terminal:**
   ```bash
   # 1. Typecheck frontend & backend
   npm run typecheck

   # 2. Eksekusi test suite API
   npm --workspace=apps/api test

   # 3. Build bundle Vite Frontend
   npm --workspace=apps/web run build
   ```
2. **Verifikasi Antarmuka Web (`ApprovalsView.vue`):**
   - Login sebagai `finance.manager@pmo.utama.ac.id`.
   - Buka menu `Pusat Persetujuan` (`/approvals`).
   - Perhatikan 4 kartu KPI di bagian atas: *Perlu Persetujuan Saya*, *Total Menunggu Keputusan*, *Total Nilai Pending*, dan *Disetujui Bulan Ini*.
   - Klik pill filter modul (PR Pengadaan LS, SPJ Panjar & UMK, Anggaran, Biaya).
   - Centang 2 dokumen pada tabel antrean, perhatikan toolbar melayang *Batch Action* muncul di bagian bawah.
   - Klik tombol *Rincian* pada salah satu baris untuk melihat modal breakdown barang dan histori log audit.
   - Uji tombol *Tolak*, isi alasan < 5 karakter (tombol konfirmasi nonaktif), lalu isi alasan lengkap dan konfirmasi penolakan.

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Git Branch:** `feature/KOI-123-inbox-approval-terpusat-lintas-dokumen`
* **Jira Ticket:** `KOI-123` (`[PMO-121] Inbox Approval Terpusat Lintas Dokumen (ApprovalsView.vue)`)
* **Parent Epic:** `KOI-122` (`[SPRINT 5] General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Status Kerja:** `In Review` (Siap ditinjau oleh Manajer Teknis)
* **Pull Request GitHub:** `https://github.com/rifamuhammad/Finance-PMOUTama/pull/new/feature/KOI-123-inbox-approval-terpusat-lintas-dokumen`
