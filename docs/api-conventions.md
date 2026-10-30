# Konvensi API, RBAC & Alur Persetujuan - ERP Keuangan & Operasional PMO UTama

## 1. Standar Protokol API
- **Base Path**: `/api/v1`
- **Dokumentasi OpenAPI**: Tersedia secara dinamis pada `GET /api/v1/docs.json` dan `GET /api/v1/health`.
- **Header Korelasi**: Setiap respons menyertakan `X-Request-Id` untuk pelacakan log dan audit.
- **Autentikasi**: Bearer Token JWT (`Authorization: Bearer <token>`) yang diverifikasi di server pada setiap endpoint terproteksi.
- **Format Respons Sukses**:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": {
      "page": 1,
      "pageSize": 20,
      "total": 45,
      "requestId": "req-..."
    }
  }
  ```
- **Format Respons Error**:
  ```json
  {
    "success": false,
    "error": {
      "code": "BUDGET_EXCEEDED",
      "message": "Nominal pengajuan melebihi sisa plafon anggaran yang tersedia.",
      "details": { ... },
      "requestId": "req-..."
    }
  }
  ```

---

## 2. Matriks Role-Based Access Control (RBAC) & Pemisahan Kewenangan

Seluruh hak akses ditegakkan di backend melalui middleware `requirePermission(...)` dan pemeriksaan unit bisnis (`scopeUnitAccess`).

| Role | Kode Role | Hak Akses Utama | Batasan Pemisahan Tugas (SoD) |
|---|---|---|---|
| **Super Admin** | `SUPER_ADMIN` | Mengelola pengguna, role, unit bisnis, master konfigurasi, melihat sistem | Tidak dapat menyetujui anggaran, PO, pengeluaran, atau memposting jurnal keuangan secara langsung |
| **GM PMO** | `GM_PMO` | Melihat seluruh dashboard & laporan konsolidasi, menyetujui anggaran, revisi, PR/PO/biaya bernilai besar, dan evaluasi strategis | Tidak dapat menyetujui transaksi yang diajukan oleh akunnya sendiri |
| **Manager Unit Bisnis** | `UNIT_MANAGER` | Menyusun & mengajukan anggaran unit, membuat PR, membuat pengeluaran unit, membuat pesanan pelanggan pada unitnya | Hanya dapat mengakses data unit bisnisnya sendiri; tidak dapat menyetujui anggaran unitnya sendiri |
| **Procurement** | `PROCUREMENT` | Mengelola vendor, mencatat perbandingan kuotasi, menerbitkan PO dari PR yang disetujui, mencatat penerimaan barang (`GoodsReceipt`) | Tidak dapat menyetujui anggaran atau mencairkan pembayaran |
| **Finance Manager** | `FINANCE_MANAGER` | Memverifikasi tagihan vendor, menyetujui PR/PO/pengeluaran sesuai limit, menjalankan rekonsiliasi bank, menyetujui selisih kasir | Tidak dapat menyetujui pengajuan biaya yang dibuatnya sendiri |
| **Accounting** | `ACCOUNTING` | Mengelola COA, membuat & memposting jurnal umum, membuat jurnal pembalik, menutup periode fiskal, melihat buku besar & laporan akuntansi | Tidak dapat mengubah sesi kasir atau menyetujui PO |
| **Tax Officer** | `TAX_OFFICER` | Mengelola konfigurasi tarif pajak, memeriksa kelengkapan pajak pada biaya/invoice, melihat rekap pajak | Akses baca pada transaksi; tidak dapat mengeksekusi pembayaran |
| **Cashier** | `CASHIER` | Membuka sesi kasir, mencatat pembayaran pelanggan, mengajukan penutupan kasir (`Closeout`), mencatat setoran kas ke bank | Tidak dapat mengakses COA, anggaran, atau mengubah pembayaran yang sudah terkonfirmasi |
| **Auditor** | `AUDITOR` | Akses baca penuh ke seluruh modul, laporan, dan jejak `AuditLog` untuk keperluan pemeriksaan | `Read-only` murni: seluruh aksi mutasi (`POST`/`PUT`/`PATCH`/`DELETE`) ditolak di server |

---

## 3. Aturan Transisi Status & Alur Persetujuan

1. **Anggaran (`Budget`)**:
   - `DRAFT -> SUBMITTED` (oleh `UNIT_MANAGER` / `FINANCE_MANAGER`)
   - `SUBMITTED -> APPROVED` atau `REJECTED` (oleh `GM_PMO` atau `FINANCE_MANAGER` yang bukan pembuat anggaran; penolakan wajib menyertakan alasan minimal 5 karakter).
   - `APPROVED -> REVISED` (menyimpan snapshot versi lama di `BudgetRevision` dan memperbarui plafon).
2. **Pengadaan (`PurchaseRequest` -> `PurchaseOrder` -> `GoodsReceipt` -> `VendorInvoice`)**:
   - Saat PR diajukan dan disetujui (`APPROVED`), server memeriksa sisa anggaran pada `BudgetLine` di dalam transaksi database dan membuat `BudgetCommitment`.
   - Penerbitan PO memeriksa jumlah penawaran vendor (`VendorQuotation`). Jika kurang dari batas minimum kebijakan (default: 3 penawaran), wajib menyertakan `quotationExceptionReason`.
   - Tagihan vendor (`VendorInvoice`) memvalidasi bahwa kuantitas/nilai tidak melebihi PO dan barang yang telah diterima (`GoodsReceipt`), serta menolak nomor invoice vendor yang duplikat.
3. **Pengeluaran (`Expense`)**:
   - `DRAFT -> SUBMITTED -> APPROVED / REJECTED -> PAID -> POSTED`.
   - Saat status menjadi `PAID`, komitmen anggaran terkait dilepaskan dan realisasi (`actualAmount`) diperbarui, serta jurnal akuntansi otomatis dibuat secara idempotent.
4. **Pendapatan, Pembayaran & Kasir**:
   - Status pengiriman layanan (`ServiceDelivery`) dicatat terpisah dari status pembayaran `CustomerInvoice`.
   - Pembayaran (`Payment`) menggunakan `idempotencyKey` unik untuk mencegah pencatatan ganda akibat pengiriman ulang request atau webhook.
   - Penutupan kasir (`CashierSession`) membandingkan `theoreticalBalance` dengan `actualCountedCash`. Jika terdapat selisih di atas ambang kebijakan, status menjadi `CLOSING_SUBMITTED` dan memerlukan persetujuan `FINANCE_MANAGER` sebelum menjadi `CLOSED`.
