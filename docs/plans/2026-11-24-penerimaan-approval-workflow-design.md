# Desain Alur Approval Manajer Keuangan & 3 Tombol Dokumen Penerimaan

Tanggal: 2026-11-24  
Modul: Penerimaan (Buku Harian, Tagihan & Invoice, Rekonsiliasi Bank Mandiri, Pembukuan, Laporan)  
Sumber Arahan: Manajer Pengawasan PBI (Maker-Checker & Kontrol Penerbitan Dokumen Resmi)

## 1. Tujuan & Prinsip Tata Kelola
- Setiap penerbitan dokumen resmi penerimaan (**Kwitansi `KU-001` / `KU-UM`**, **Tanda Terima `KU-002`**, dan **Invoice `KU-003`**) wajib melalui persetujuan (**Approval**) dari **Manajer Keuangan (`FINANCE_MANAGER` / `GM_PMO` / `SUPER_ADMIN` dengan izin `payment:approve`)**.
- Selama dokumen belum berstatus **`APPROVED`**, tombol **Cetak** terkunci (**`disabled`**), guard di dalam `PenerimaanPrintModal.vue` memblokir aksi print/PDF, dan **jurnal akuntansi / Pembukuan BKU / Pembukuan Pajak / Rekonsiliasi Bank / Aging / Laporan Realisasi** belum terpengaruh.
- Bukti pendukung (**`+ Bukti` / `Lihat Bukti`**) tetap dapat diunggah/dilihat sebelum maupun sesudah persetujuan agar Manajer Keuangan dapat memverifikasi bukti transfer atau kontrak sebelum menyetujui.

## 2. Alur Status & 3 Tombol per Baris
Setiap baris dokumen pada Tab **Buku Harian** (Kwitansi / Tanda Terima) dan Tab **Tagihan & Invoice** (Invoice) menampilkan 3 slot aksi terstruktur:

1. **Tombol 1 (`+ Bukti` / `Lihat Bukti`)**: Selalu aktif untuk unggah/pratinjau bukti pembayaran (Payment) maupun dokumen pendukung/kontrak (Invoice).
2. **Tombol 2 (Approval & Pengingat)**:
   - Status `PENDING_APPROVAL`:
     - Otomatis mengirim notifikasi ke peran `FINANCE_MANAGER` (terlihat di lonceng notifikasi `AppShell.vue`) tepat saat PIC menyimpan input.
     - Pada tampilan **PIC/Staf**: tampil tombol **`Ingatkan`** untuk mengirim notifikasi pengingat ulang prioritas (`WARNING`) dengan catatan `reminderCount` & `lastRemindedAt` (cooldown anti-spam 2 menit).
     - Pada tampilan **Manajer Keuangan (`payment:approve`)**: tampil tombol **`Setujui`** dan **`Revisi`** (serta tombol filter antrean `Menunggu Approval (N)` di atas tabel).
   - Status `APPROVED`: tampil badge hijau **`Disetujui`** dengan informasi approver & waktu persetujuan.
   - Status `REJECTED`: tampil badge merah **`Perlu Revisi`** dengan alasan revisi, serta tombol **`Ajukan Ulang`** dan **`Batalkan`**.
3. **Tombol 3 (`Cetak Kwitansi` / `Cetak TT` / `Cetak Invoice`)**:
   - `disabled` selama `approvalStatus !== 'APPROVED'`.
   - Aktif seketika setelah Manajer Keuangan menyetujui, disertai stempel persetujuan elektronik (*Disetujui secara elektronik oleh Nama Approver, tanggal & jam WIB*) di dokumen cetak.

## 3. Perubahan Schema & Backend
- **`prisma/schema.prisma`**: Tambah kolom audit approval & pengingat pada `CustomerInvoice` dan `Payment`:
  - `approvalStatus` (`PENDING_APPROVAL` | `APPROVED` | `REJECTED`, default `APPROVED` untuk kompatibilitas data historis, diset eksplisit `PENDING_APPROVAL` pada pembuatan baru).
  - `approvedById`, `approvedByName`, `approvedAt`.
  - `rejectedById`, `rejectedByName`, `rejectedAt`, `rejectionReason`.
  - `lastRemindedAt`, `reminderCount`.
  - `Payment.taxInclusive` (boolean, default `true`) agar posting jurnal tertunda saat approval identik 100% dengan kalkulasi saat input.
- **Endpoints baru di `apps/api/src/modules/revenue/penerimaan-routes.ts`**:
  - `POST /payments/:id/approve`, `POST /payments/:id/reject`, `POST /payments/:id/remind`, `POST /payments/:id/resubmit`, `POST /payments/:id/void`.
  - `POST /customer-invoices/:id/approve`, `POST /customer-invoices/:id/reject`, `POST /customer-invoices/:id/remind`, `POST /customer-invoices/:id/resubmit`.
  - `POST /customer-invoices/:id/proof` & `GET /customer-invoices/:id/proof` (lampiran bukti/pendukung Invoice).
  - `PATCH /payments/:id/tax-meta` dibuka untuk izin `payment:create` atau `accounting:manage` (mendukung `TAX_OFFICER`).
- **Isolasi Pelaporan & Rekonsiliasi**:
  - `GET /revenue/buku-harian` menampilkan semua transaksi (termasuk `PENDING_APPROVAL` / `REJECTED`) agar PIC & Manajer Keuangan memproses antrean, dengan pemisahan ringkasan `approved` vs `pendingApprovalCount`.
  - `GET /revenue/tax-recap`, `export.xlsx`, `GET /revenue/aging`, dan seluruh endpoint `/reconciliation/*` hanya menghitung transaksi `APPROVED` (`CONFIRMED` / `ISSUED` / `PARTIALLY_PAID`).

## 4. Perbaikan Kesiapan UAT Terintegrasi
1. **Resolusi Periode Fiskal (`accounting-engine.ts`)**: Memilih periode `OPEN` yang mencakup `entryDate` (prioritas periode bulanan `FP-*` terpendek) agar transaksi Nov 2026 masuk `FP-2026-11`, bukan `FY-2027`.
2. **Rekonsiliasi Dual Bank Mandiri (`reconciliation/routes.ts`)**: Memisahkan kalkulasi `bookBalance` & kandidat auto-match per `bankAccountId` (`BNK-MDR-01` vs `BNK-MDR-02`) serta memperbarui `currentBalance` dari mutasi yang diimpor.
3. **Filter Notifikasi (`reports/routes.ts` & `auth/routes.ts`)**: Mencegah notifikasi spesifik `userId` bocor ke user lain, dan memastikan peran dengan izin `payment:approve` menerima notifikasi antrean `FINANCE_MANAGER`.
4. **Sinkronisasi RBAC PIC (`prisma/seed.ts` & DB)**: Menambahkan `payment:create` pada `UNIT_MANAGER` dan `revenue:create` pada `CASHIER`, sambil tetap membatasi `payment:approve` hanya pada `FINANCE_MANAGER`, `GM_PMO`, dan `SUPER_ADMIN`.
