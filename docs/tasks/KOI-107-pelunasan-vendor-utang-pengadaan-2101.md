# 💳 Tiket KOI-107 (PMO-053): Pelunasan Tagihan Vendor via Bank & Penutupan Utang Pengadaan 2101

- **Jira Key:** `KOI-107` (Task)
- **Parent Epic:** `Sprint 3: Core Transaction Engines (LS, UMK & Revenue POS)`
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-107-pelunasan-vendor-utang-pengadaan-2101`
- **File Terdampak:**
  - `apps/api/src/modules/procurement/routes.ts` (Implementasi jurnal penutupan Utang Pengadaan Rekanan 210101010100 saat pelunasan tagihan vendor)
  - `apps/web/src/modules/ProcurementView.vue` (Penyempurnaan feedback pelunasan utang dan visualisasi badge nomor faktur vendor pada tabel expense)
  - `apps/api/src/tests/erp.test.ts` (Asersi jurnal penutupan utang AP 210101010100 saat transaksi pencairan biaya pembayaran tagihan vendor)
  - `docs/plans/task.md` (Live plan tracker)
  - `docs/tasks/README.md` (Index dokumentasi task)
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Monorepo Typecheck 0 error, Vite Build 0 error.

---

## 1. Latar Belakang & Urgensi Bisnis
Sesuai Peraturan Rektor No. 310 Tahun 2025 Lampiran III tentang Mekanisme Pembayaran Langsung (LS):
1. Pengakuan beban dan timbulnya kewajiban utang rekanan dicatat saat serah terima barang/jasa BAST (`KOI-106`):
   - *(Dr)* Beban Pengadaan (`520901020100` / kode pos anggaran)
   - *(Cr)* Utang Pengadaan Barang dan Jasa Rekanan (`210101010100`)
2. Ketika tagihan rekanan diverifikasi melalui 3-Way Matching dan dicairkan oleh Finance/Kasir, sistem wajib mendebet akun Utang Pengadaan (`210101010100`) agar saldo utang rekanan menjadi **NOL** (tertutup/lunas), bukan mendebet beban operasional untuk kedua kalinya (*anti-double counting expense*).
3. Pengeluaran kas/bank dicatat di sisi Kredit pada rekening operasional resmi PMO UTama (`110101020200` Bank BRI Penerimaan Komersial PMO) atau kas kecil (`110501010100`).

---

## 2. Fitur & Implementasi Teknis

### A. Backend Engine (`apps/api/src/modules/procurement/routes.ts`)
1. **Deteksi Pembayaran Vendor Invoice**:
   - Memeriksa flag `expense.vendorInvoiceId`.
   - Jika pembayaran terikat pada Vendor Invoice:
     - **Debet**: `210101010100` Utang Pengadaan Barang dan Jasa Rekanan (AP Control).
     - **Kredit**: `110101020200` Bank BRI Penerimaan PMO (atau `110501010100` Kas Kecil).
     - Deskripsi jurnal: `Pelunasan Utang Pengadaan Rekanan: <Vendor> (<No Faktur>)`.
   - Jika pengeluaran langsung non-PO (Direct Expense):
     - **Debet**: Akun beban mata anggaran riil (`freshLine.accountCode` atau fallback Pertor 310 `520901020100`).
     - **Kredit**: Rekening Kas/Bank PMO.
2. **Kesesuaian Status Transaksi**:
   - Status `VendorInvoice` otomatis berubah menjadi `PAID` dan `Expense` berstatus `POSTED`.
   - Seluruh siklus reversal/void tetap membalikkan mutasi jurnal secara idempoten dan memulihkan saldo anggaran.

### B. Frontend UX (`apps/web/src/modules/ProcurementView.vue`)
1. **Feedback Pencairan Interaktif**:
   - Menampilkan konfirmasi jelas: *"Pelunasan utang rekanan EXP-... berhasil dibayarkan via BANK_TRANSFER, dan jurnal penutupan utang JRN-... diposting otomatis."*
2. **Badge Tagihan Vendor pada Tabel Pengeluaran**:
   - Baris expense yang terhubung dengan tagihan rekanan kini menampilkan badge nomor tagihan vendor (`Tagihan: INV-VND-...`) untuk auditabilitas.

### C. Pengujian Otomatis (`apps/api/src/tests/erp.test.ts`)
- Memvalidasi asersi bahwa saat pembayaran tagihan vendor:
  - `journal.status === 'POSTED'`
  - `totalDebit === 19980000` dan `totalCredit === 19980000`
  - Baris Debit secara eksplisit mengarah ke akun `210101010100` (Utang Rekanan).

---

## 3. Hasil Pengujian & Verifikasi

```bash
# 1. Typecheck Monorepo
npm run typecheck
# Output: @pmo-erp/api (0 error), @pmo-erp/web (0 error)

# 2. Build Frontend Produksi
npm --workspace=apps/web run build
# Output: built in 3.38s, 0 error

# 3. Integration Test Suite
npm test
# Output: 24 passed (100% test coverage passed)
```

---

## 4. Status Transisi Jira
- **Tiket:** `KOI-107` ([PMO-053])
- **Status Akhir:** `In Review` (Tampil pada Board 3 kolom In Review, siap ditinjau).
