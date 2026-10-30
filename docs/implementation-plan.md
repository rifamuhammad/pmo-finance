# Rencana Implementasi - ERP Keuangan & Operasional PMO UTama

## 1. Hasil Audit Repository Awal
- Lokasi proyek: `/Users/syahbintang/PmoFinance`
- Kondisi awal: Repository hanya berisi dokumen spesifikasi utama `master-prompt-erp-pmo-utama.md`. Belum ada kode aplikasi, skema database, atau konfigurasi proyek.
- Lingkungan sistem: macOS, Node.js v22.20.0, npm 10.9.3, PostgreSQL 15 (`/opt/homebrew/bin/postgres`).

## 2. Arsitektur Monorepo
Kami membangun arsitektur **Modular Monolith** dalam struktur monorepo berikut:
- `apps/api`: Backend Express.js + TypeScript, Prisma ORM, PostgreSQL, validasi Zod, dokumentasi OpenAPI (`/api/v1/docs.json`), autentikasi JWT + RBAC middleware, dan pengujian otomatis dengan Vitest.
- `apps/web`: Frontend Vue 3 (`<script setup>` Composition API) + TypeScript + Vite + Vue Router + Pinia, menggunakan sistem desain CSS token terpusat sesuai `DESIGN.md`.
- `prisma/`: `schema.prisma`, migrasi SQL terversi, dan `seed.ts` (berisi data demo komprehensif yang ditandai secara eksplisit sebagai `DATA DEMO`).
- `docs/`: Dokumentasi perencanaan, model data, konvensi API, matriks RBAC, dan daftar asumsi bisnis terbuka.

## 3. Tahapan Implementasi (Vertical Slices)

### Fase 0: Fondasi, Skema Database, Autentikasi, RBAC, dan Audit Trail
- Setup monorepo (`package.json` workspaces, konfigurasi TypeScript ketat).
- Desain dan migrasi database PostgreSQL dengan Prisma (`Decimal(18,2)` untuk seluruh nominal uang).
- Implementasi autentikasi (`/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/auth/logout`), rate limiter login, Helmet, CORS, dan pencatatan `AuditLog` otomatis di sisi server.
- Seed data demo (`DATA DEMO`) untuk 9 role utama dan 3 unit bisnis.

### Fase 1: Vertical Slice Perencanaan Modal, Anggaran, Pengadaan, dan Pengeluaran
- Master Unit Bisnis, Cost Center, Sumber Dana, dan Periode Fiskal.
- Siklus Anggaran: Pembuatan draft anggaran dan baris anggaran -> Pengajuan -> Persetujuan/Penolakan (dengan kontrol pemisahan tugas: pembuat tidak dapat menyetujui pengajuannya sendiri) -> Revisi berhistori -> Perhitungan real-time `Allocated`, `Committed`, `Actual`, dan `Available`.
- Manajemen Vendor: Pendaftaran vendor, pemeriksaan kelengkapan dokumen/NPWP, pencegahan duplikasi, status vendor.
- Pengadaan (Procurement):
  - Purchase Request (PR) dengan pengecekan plafon anggaran dan reservasi komitmen (`BudgetCommitment`).
  - Perbandingan Penawaran Vendor (`VendorQuotation`) dengan aturan minimal 3 penawaran (atau alasan pengecualian wajib jika kurang dari 3).
  - Purchase Order (PO) otomatis dari PR yang disetujui.
  - Penerimaan Barang/Jasa (`GoodsReceipt`) penuh maupun parsial.
  - Verifikasi Tagihan Vendor (`VendorInvoice`) dengan pengecekan 3-way matching (PO vs Penerimaan vs Invoice) dan deteksi nomor invoice ganda.
- Pencatatan Pengeluaran (`Expense`): Pengeluaran PO maupun non-PO, alur persetujuan, penjadwalan pembayaran, pelunasan (`PAID`), posting jurnal otomatis, serta pembatalan (`VOID`) dengan jejak audit.

### Fase 2: Vertical Slice Pelanggan, Pesanan, Invoice, Pembayaran, dan Kasir
- Master Pelanggan (`Customer`) dan Produk/Layanan (`ProductService`) beserta histori perubahan harga (`ProductPriceHistory`).
- Pesanan Pelanggan (`SalesOrder`), Penerbitan Tagihan (`CustomerInvoice`), dan Pencatatan Penyerahan Layanan (`ServiceDelivery`) yang statusnya terpisah secara jujur dari status pelunasan tagihan.
- Pembayaran Pelanggan (`Payment`): Pembayaran penuh dan parsial, pencatatan biaya layanan/merchant fee terpisah (`grossAmount`, `feeAmount`, `netAmount`), proteksi idempotensi (`idempotencyKey`), simulasi callback webhook terverifikasi, dan alur `Refund` yang merujuk ke pembayaran asal.
- Operasional Kasir (`CashRegister`, `CashierSession`, `CashDeposit`): Pembukaan sesi kasir, penerimaan tunai, penutupan sesi kasir (`Closeout`) dengan perbandingan saldo teoritis vs fisik, persetujuan supervisor jika terdapat selisih di atas ambang batas, serta pencatatan setoran kas ke bank.

### Fase 3: Rekonsiliasi Bank
- Master Rekening Bank (`BankAccount`).
- Impor Mutasi Bank (`BankStatementImport` & `BankStatementLine`) dengan fitur pratinjau (preview), deteksi baris duplikat (fingerprint), saran pencocokan otomatis terhadap pembayaran/setoran/pengeluaran, konfirmasi pencocokan manual, penandaan exception, dan penguncian hasil rekonsiliasi.

### Fase 4: Akuntansi, Buku Besar, Piutang/Utang, Aset Tetap, dan Pajak
- Chart of Accounts (`ChartOfAccount`) dan pemetaan akun otomatis (`AccountMapping`).
- Jurnal Umum (`JournalEntry` & `JournalLine`) dengan validasi keseimbangan wajib (`totalDebit == totalCredit`), penguncian periode tutup buku (`FiscalPeriod`), posting idempotent dari transaksi sumber, dan jurnal pembalik (`Reversal`).
- Buku Besar (`General Ledger`) dan Neraca Saldo (`Trial Balance`) yang dihitung langsung dari baris jurnal yang telah diposting.
- Pemantauan Umur Piutang (AR Aging) dan Utang (AP Aging), konfigurasi tarif pajak ber-versi (`TaxConfiguration`), serta daftar Aset Tetap (`FixedAsset`).

### Fase 5: Laporan, Dashboard Eksekutif, dan Evaluasi Strategis
- Dashboard berbasis peran yang menampilkan KPI nyata dari database sesuai filter periode dan unit bisnis.
- Laporan Anggaran vs Realisasi, Laba Rugi, Neraca, Arus Kas, Profitabilitas Unit, dan Ekspor CSV ber-metadata.
- Modul Evaluasi Strategis (`StrategicEvaluation`): Analisis pencapaian target periode, daftar risiko operasional/keuangan otomatis, rekomendasi plafon anggaran periode berikutnya, dan keputusan GM PMO.

## 4. Daftar Asumsi dan Keputusan Bisnis Terbuka (Untuk Konfirmasi Stakeholder)
Sesuai bagian 19 spesifikasi utama, sistem menyediakan konfigurasi yang dapat diubah di menu Administrasi dan mencatat keputusan terbuka berikut untuk divalidasi oleh GM PMO, Finance, Accounting, dan Tax:
1. **Nama Resmi & Identitas Visual**: Saat ini diatur melalui konfigurasi sistem sebagai `ERP Keuangan & Operasional PMO UTama` dengan penanda teks `[PMO UTAMA]`. Logo resmi hanya akan dipasang setelah aset resmi diberikan.
2. **Struktur Entitas Hukum**: Sistem mendukung multi-unit bisnis (`BusinessUnit`) dalam satu entitas konsolidasi PMO UTama. Perlu konfirmasi apakah di masa depan diperlukan pemisahan NPWP per anak perusahaan.
3. **Basis Pengendalian Anggaran**: Default sistem mengurangi sisa anggaran (`Available`) saat PR/PO disetujui (`Committed`) dan memindahkannya ke `Actual` saat invoice/pengeluaran disetujui/dibayar, guna mencegah overspending.
4. **Ambang Batas Persetujuan (Approval Limit)**: Default konfigurasi kebijakan menetapkan PR/Pengeluaran di atas Rp 25.000.000 memerlukan persetujuan Finance Manager & GM PMO, serta minimal 3 penawaran vendor untuk pengadaan di atas Rp 10.000.000 kecuali disertai alasan pengecualian tertulis.
5. **Ambang Selisih Kasir**: Selisih hitung fisik kasir di atas Rp 50.000 wajib mendapatkan persetujuan Finance Manager sebelum sesi ditutup penuh.
6. **Integrasi Eksternal (Payment Gateway, Bank API, Email, Perpajakan)**: Karena kredensial produksi belum disediakan, sistem menggunakan adapter internal dengan penanda jelas **Mode Simulasi Demo** dan tidak mengklaim integrasi pihak ketiga atau kepatuhan pajak formal telah aktif secara hukum.
