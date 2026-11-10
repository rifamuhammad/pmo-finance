# 💳 Tiket KOI-110 (PMO-071): Modul Kasir E-Revenue: Sinkronisasi Akun Pendapatan 4203xxxxxx & PPN Keluaran Pertor 310

- **Jira Key:** `KOI-110` (Task)
- **Parent Epic:** `KOI-108` (`[SPRINT 3] Core Transaction Engines (LS, UMK & Revenue POS)`)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-110-kasir-e-revenue-pendapatan-4203-ppn`
- **Prioritas & Due Date:** High · 2026-12-16
- **File Terdampak:**
  - `apps/api/src/modules/revenue/routes.ts` (Implementasi resolver akun COA 12-digit Pertor 310 untuk penerbitan faktur tagihan, penerimaan pembayaran kasir tunai & bank, potongan fee merchant payment gateway, refund, dan setoran kas kasir)
  - `apps/web/src/modules/RevenueCashierView.vue` (Banner kepatuhan akuntansi Pertor 310 dan penampil tag kode akun pendapatan COA pada modal pemesanan)
  - `docs/plans/task.md` (Live plan tracker)
  - `docs/tasks/README.md` (Index dokumentasi task)
- **Hasil Verifikasi:** 25/25 Integration Tests Passed (100%), Monorepo Typecheck 0 error, Vite Web Build 0 error.

---

## 1. Latar Belakang & Urgensi Akuntansi PTN-BH (Pertor No. 310/2025)

Sesuai Peraturan Rektor No. 310 Tahun 2025 Lampiran IV tentang Tata Kelola Pendapatan Komersial Unit Bisnis PMO UTama:
1. **Pengakuan Pendapatan Usaha (Revenue Recognition)**:
   - Pendapatan jasa komersial tidak lagi dicatat pada akun dummy 2-digit/hyphen (`4-1100`), melainkan dialokasikan spesifik ke akun 12-digit Pertor 310 kelompok `4203xxxxxx` sesuai unit bisnis penghasil:
     - **Divisi Diklat / Pelatihan (BU-TCI)**: `420301010200` (Pendapatan Pelatihan (Diklat) Profesional) / `420301010100` (Pendapatan Kursus & Workshop).
     - **Divisi IT Services (BU-ITS)**: `420301040200` (Pendapatan Aplikasi Promise & Software Solution).
     - **Poliklinik Pratama (BU-KLINIK)**: `420301060100` (Pendapatan Jasa Dokter Umum).
     - **Wisma & MICE UTCC (BU-MICE)**: `420301070202` (Pendapatan Sewa Ballroom & Gedung UTCC) / `420301070300` (Pendapatan Fasilitas & Layanan Tambahan).
     - **Manajemen PMO / Konsultansi (BU-PMO-MGMT)**: `420301090100` (Pendapatan Usaha Pendukung).
2. **Kewajiban Perpajakan (PPN Keluaran 11%)**:
   - Setiap transaksi komersial yang memungut PPN Keluaran wajib mengkreditkan akun kewajiban lancar `210202010100` (Utang Pajak Pertambahan Nilai / PPN Keluaran).
3. **Pencatatan Kas & Piutang Usaha**:
   - Piutang pelanggan dicatat pada akun aset lancar `110301010100` (Piutang Usaha Layanan Pelanggan).
   - Penerimaan kasir tunai (POS) didebetkan ke `110101010100` (Kas Operasional & Kasir Unit).
   - Penerimaan non-tunai (Transfer Bank / Virtual Account / QRIS) didebetkan ke `110101020200` (Bank BRI Penerimaan Komersial PMO).
   - Potongan merchant/provider fee didebetkan ke `590101010100` (Beban Administrasi Bank & Payment Gateway).

---

## 2. Struktur Jurnal Akuntansi Pendapatan & Kasir POS

### A. Penerbitan Faktur Tagihan (Customer Invoice)
| Sisi | Akun | Nama Akun | Keterangan |
|---|---|---|---|
| **Debet** | `110301010100` | Piutang Usaha Layanan Pelanggan | Total nilai tagihan bruto |
| **Kredit** | `4203xxxxxx` | Pendapatan Usaha Unit Bisnis | Nilai pendapatan bersih (subtotal - diskon) |
| **Kredit** | `420301070300` | Pendapatan Fasilitas & Layanan Tambahan | Service charge MICE (bila ada) |
| **Kredit** | `210202010100` | Utang Pajak PPN Keluaran | PPN 11% (bila ada) |

### B. Pelunasan Pembayaran Kasir (Cash / Bank / QRIS)
| Sisi | Akun | Nama Akun | Keterangan |
|---|---|---|---|
| **Debet** | `110101010100` / `110101020200` | Kasir Kas Tunai / Bank BRI Penerimaan | Nilai pembayaran netto diterima |
| **Debet** | `590101010100` | Beban Administrasi Bank & Payment Gateway | Biaya transaksi / MDR QRIS (bila ada) |
| **Kredit** | `110301010100` | Piutang Usaha Layanan Pelanggan | Penutupan piutang pelanggan (gross) |

### C. Setoran Kas Kasir ke Rekening Bank (Cash Deposit)
| Sisi | Akun | Nama Akun | Keterangan |
|---|---|---|---|
| **Debet** | `110101020200` | Bank BRI Penerimaan Komersial PMO | Rekening bank tujuan setoran |
| **Kredit** | `110101010100` | Kas Operasional & Kasir Unit | Pengurangan fisik kas kasir |

---

## 3. Implementasi Teknis & Validasi

1. **Resolver Akun Otomatis (`resolveRevenueAccounts`)**:
   - Ditempatkan di [apps/api/src/modules/revenue/routes.ts](file:///Users/syahbintang/PmoFinance/apps/api/src/modules/revenue/routes.ts).
   - Menghubungkan secara dinamis transaksi penjualan ke kode akun 12-digit resmi di tabel `chartOfAccount` Prisma.
2. **Kesesuaian Trial Balance Buku Besar**:
   - Seluruh mutasi debet dan kredit menghasilkan saldo seimbang mutlak pada Laporan Neraca Saldo (`/api/v1/accounting/ledger`), tanpa deviasi sen dan tanpa akun orphan.
3. **Hasil Pengujian Otomatis**:
   - Monorepo Typecheck: **0 error**.
   - Vite Production Build: **Sukses**.
   - Vitest Suite: **25/25 integration tests passed (100%)**.
