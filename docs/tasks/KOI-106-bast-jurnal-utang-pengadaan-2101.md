# 📦 Tiket KOI-106 (PMO-052): Penerimaan Barang/Jasa (BAST) & Jurnal Akrual Utang Pengadaan 2101

- **Jira Key:** `KOI-106` (Task)
- **Parent Epic:** `Sprint 3: Core Transaction Engines (LS, UMK & Revenue POS)`
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-106-bast-jurnal-utang-pengadaan-2101`
- **File Terdampak:**
  - `apps/api/src/modules/procurement/routes.ts` (Auto-post balanced double-entry accrual journal saat Goods Receipt BAST diterbitkan)
  - `apps/web/src/modules/ProcurementView.vue` (Penyempurnaan feedback nomor jurnal akrual BAST, banner edukasi akrual Pertor 310, dan badge BAST pada PO list)
  - `apps/api/src/tests/erp.test.ts` (Verifikasi keberadaan jurnal akrual, status POSTED, dan keseimbangan Debit = Credit pada BAST Goods Receipt)
  - `docs/plans/task.md` (Live plan tracker)
  - `docs/tasks/README.md` (Index dokumentasi task)
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Typecheck Monorepo 0 error, Vite Build 0 error.

---

## 1. Latar Belakang & Urgensi Bisnis
Sesuai Peraturan Rektor No. 310 Tahun 2025 Lampiran III dan standar akuntansi entitas bisnis universitas:
1. Saat barang atau jasa telah diserahterimakan dan diperiksa fisiknya oleh tim penerima (BAST / Goods Receipt), kewajiban kepada pihak ketiga (rekanan vendor) diakui seketika berdasarkan asas akrual (*accrual basis*).
2. Entitas wajib mencatat pengakuan beban/aset di sisi Debet dan pengakuan Utang Pengadaan Rekanan di sisi Kredit:
   - **(Dr)** Beban/Aset Pengadaan (`520901020100` Beban Barang dan Perlengkapan / kode COA mata anggaran)
   - **(Cr)** `210101010100` Utang Pengadaan Barang dan Jasa Rekanan (AP Control)
3. Pencatatan ini krusial agar tidak terjadi *understated liability* (utang tak tercatat) menjelang cut-off tutup buku periode fiskal maupun pemeriksaan audit BPK.

---

## 2. Fitur & Implementasi Teknis

### A. Backend API (`apps/api/src/modules/procurement/routes.ts`)
1. **Kalkulasi Nilai Diterima**:
   - Menghitung akumulasi nilai barang/jasa yang diserahterimakan: $\sum (\text{item.quantityReceived} \times \text{line.unitPrice})$.
2. **Posting Jurnal Akrual Seimbang & Idempoten**:
   - Memanggil `createOrGetBalancedJournal` dalam transaksi Prisma dengan `sourceType: 'GOODS_RECEIPT'`, `sourceId: gr.id`, dan `idempotencyKey: GR_ACCRUAL_${gr.id}`.
   - Sisi Debet: Akun beban mata anggaran terkait (`po.purchaseRequest.budgetLine.accountCode` atau fallback resmi Pertor 310 `520901020100`).
   - Sisi Kredit: Akun utang pengadaan rekanan resmi Pertor 310 (`210101010100` Utang Pengadaan Barang dan Jasa Rekanan).
3. **Response Payload**:
   - Mengembalikan data Goods Receipt, status mutasi PO (`PARTIALLY_RECEIVED` atau `RECEIVED`), serta objek jurnal yang terbentuk ke client.

### B. Frontend UX (`apps/web/src/modules/ProcurementView.vue`)
1. **Modal Pencatatan Penerimaan Barang**:
   - Ditambahkan `AlertBanner` info kepatuhan akuntansi Pertor 310 yang menjelaskan bahwa pencatatan BAST otomatis memposting jurnal akrual utang rekanan.
2. **Feedback Sukses Interaktif**:
   - Menampilkan notifikasi sukses lengkap yang memuat nomor surat jalan BAST dan nomor bukti jurnal akrual yang diterbitkan.
3. **Badge Audit Trail BAST pada Tabel PO**:
   - Kolom kuantitas PO kini menampilkan pill badge BAST dengan daftar nomor dokumen penerimaan barang untuk transparansi pemeriksaan.

### C. Automated Testing (`apps/api/src/tests/erp.test.ts`)
1. Memverifikasi bahwa pemanggilan `POST /api/v1/procurement/purchase-orders/:id/goods-receipts` menghasilkan objek jurnal `POSTED` dengan `totalDebit === totalCredit`.
2. Memverifikasi bahwa seluruh Trial Balance dan General Ledger tetap seimbang (*strictly balanced*) setelah transaksi BAST.

---

## 3. Hasil Pengujian & Verifikasi

```bash
# 1. Typecheck TypeScript seluruh workspace
npm run typecheck
# Output: @pmo-erp/api (0 error), @pmo-erp/web (0 error)

# 2. Build Frontend Produksi
npm --workspace=apps/web run build
# Output: built in 3.17s, 0 error

# 3. Automated Integration Tests (Vitest)
npm test
# Output: 24 passed (100% test coverage passed)
```

---

## 4. Status Transisi Jira
- **Tiket:** `KOI-106` ([PMO-052])
- **Status Akhir:** `In Review` (Sesuai SOP tim, tiket tidak di-Done-kan langsung sebelum ditinjau dan disetujui).
