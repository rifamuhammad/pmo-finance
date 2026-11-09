# 📊 Tiket KOI-105 (PMO-051): Alur Pengadaan Langsung (LS) Purchase Request & Integrasi Pos Anggaran Riil Pertor 310

- **Jira Key:** `KOI-105` (Task)
- **Parent Epic:** `Sprint 3: Core Transaction Engines (LS, UMK & Revenue POS)`
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-105-pengadaan-ls-pr-pos-anggaran-riil`
- **File Terdampak:**
  - `apps/api/src/modules/procurement/routes.ts` (Integrasi relasi budgetLine, costCenter, dan akun COA resmi Pertor 310 pada jurnal pengadaan)
  - `apps/web/src/modules/ProcurementView.vue` (Smart Budget Line Picker dengan live search 296 pos, filter unit bisnis, live calculation ceiling, dan anti-overbudget guard)
  - `docs/plans/task.md` (Live plan tracker)
  - `docs/tasks/README.md` (Index dokumentasi task)
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Typecheck Monorepo 0 error, Vite Build 0 error.

---

## 1. Latar Belakang & Urgensi Bisnis
Sesuai Peraturan Rektor No. 310 Tahun 2025 Lampiran III tentang Mekanisme Pembayaran Langsung (LS):
1. Setiap unit bisnis yang mengajukan pengadaan barang/jasa pihak ketiga wajib menerbitkan Purchase Request (PR) yang terikat langsung pada mata anggaran yang sah (`BudgetLine`).
2. Dengan telah diinjeksikannya **296 pos anggaran riil PMO** (Revisi 7 Block Grant dan Usulan RKA 2027), antarmuka form pengadaan memerlukan mekanisme pencarian dan filter cerdas agar pengguna tidak kesulitan memilih pos anggaran dari ratusan pilihan.
3. Seluruh pencairan dan posting jurnal pengadaan wajib mengacu pada akun resmi Pertor 310:
   - Debit: Akun beban operasional riil (`freshLine.accountCode` atau `520901020100` / `530103030100`)
   - Kredit: Akun kas bank resmi PMO (`110101020200` Bank BRI PMO) atau kas kecil/UMK (`110501010100`).

---

## 2. Fitur & Implementasi Teknis

### A. Backend API (`apps/api/src/modules/procurement/routes.ts`)
1. **Query Relasi BudgetLine & CostCenter**:
   - Memperkaya endpoint `GET /api/v1/procurement/purchase-requests` dan `POST /purchase-requests` agar meng-include `budgetLine: { include: { budget: true, costCenter: true } }`.
2. **Auto-Post Jurnal Pertor 310**:
   - Memperbarui fungsi pembayaran pengeluaran (`/expenses/:id/pay`) agar mendeteksi keberadaan akun resmi Pertor 310 (`110101020200` / `110501010100`) dengan fallback adaptif sehingga tetap kompatibel terhadap database pengujian dan produksi.

### B. Frontend UX Smart BudgetLine Picker (`apps/web/src/modules/ProcurementView.vue`)
1. **Card Preview Pos Terpilih**:
   - Menampilkan nomor dokumen anggaran (`BDG-2026-REV7-BLOCKGRANT`, dll.), kode COA 12-digit, nama unit bisnis, uraian pos kegiatan, cost center, dan nominal sisa pagu tersedia.
2. **Pencarian Cepat & Filter Unit Bisnis**:
   - Live search input untuk menyaring 296 pos anggaran berdasarkan kata kunci uraian, nomor dokumen, maupun kode COA.
   - Filter dropdown per unit bisnis (Divisi IT Solution, MICE, TCI, Klinik Pratama, PMO Management).
3. **Pencegahan Defisit Anggaran (Over-Budget Guard)**:
   - Live calculation card menghitung kuantitas $\times$ estimasi harga satuan vs sisa pagu tersedia.
   - Tombol pengajuan otomatis nonaktif dan menampilkan peringatan jika nominal PR melebihi sisa pagu.

---

## 3. Hasil Pengujian & Verifikasi

```bash
# 1. Typecheck TypeScript seluruh workspace
npm run typecheck
# Output: @pmo-erp/api (0 error), @pmo-erp/web (0 error)

# 2. Build Frontend Produksi
npm --workspace=apps/web run build
# Output: built in 2.81s, 0 error

# 3. Automated Integration Tests (Vitest)
npm test
# Output: 24 passed (100% test coverage passed)
```

---

## 4. Status Transisi Jira
- **Tiket:** `KOI-105` ([PMO-051])
- **Status Akhir:** `In Review` (Sesuai SOP tim, tiket tidak di-Done-kan langsung sebelum ditinjau dan disetujui).
