# 📊 Tiket KOI-99 (PMO-043): Versioning Snapshot Revisi Anggaran (Revisi 1 s/d Revisi 7)

- **Jira Key:** `KOI-99` (Task)
- **Parent Epic:** `KOI-93` ([SPRINT 2] Budgeting Semula-Menjadi & Multi-Level Volume)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-99-versioning-snapshot-revisi-anggaran`
- **File Terdampak:**
  - `apps/api/src/modules/budget/routes.ts` (API endpoints: `GET /:id/revisions` & `GET /:id/revisions/compare`)
  - `apps/api/src/tests/erp.test.ts` (Integration tests for revision snapshot & diff comparison)
  - `apps/web/src/components/ModalDialog.vue` (Flexible modal sizing with optional `maxWidth`)
  - `apps/web/src/modules/BudgetsView.vue` (UI: Standard revision reasons preset, Compare Version action buttons, and visual Diff Viewer modal dialog)
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Typecheck 0 error, Vite Build 0 error.

---

## 1. Latar Belakang & Urgensi Bisnis
Universitas Terbuka melalui PMO UTama mengelola revisi anggaran yang dapat berlangsung berkali-kali dalam satu tahun anggaran (seperti pada dokumen riil yang mencapai Revisi ke-7 Block Grant). Dalam tata kelola keuangan perguruan tinggi (PTN-BH) dan kepatuhan audit BPKP/Inspektorat:
1. Setiap revisi yang disahkan oleh GM PMO harus membekukan rekam jejak keadaan anggaran sebelumnya ke tabel audit `BudgetRevision` (`snapshotData`).
2. Tim manajemen dan auditor membutuhkan transparansi untuk membandingkan (diff comparison) pergeseran antar versi tertentu tanpa kehilangan riwayat baris detail.
3. Alasan penyesuaian/revisi wajib didokumentasikan dengan standar audit yang jelas (preset rekomendasi audit).

---

## 2. Fitur & Implementasi Teknis

### A. Backend API (`apps/api/src/modules/budget/routes.ts`)
1. **`GET /api/v1/budgets/:id/revisions`**:
   - Menampilkan seluruh riwayat snapshot revisi dokumen anggaran terurut dari versi terbaru.
   - Mengembalikan data audit trail: versi asal, versi baru, total pagu sebelum vs sesudah revisi, nama pengubah, waktu perubahan, dan alasan revisi.
2. **`GET /api/v1/budgets/:id/revisions/compare?fromVersion=X&toVersion=Y`**:
   - Membandingkan baris anggaran antar 2 versi revisi spesifik atau antara versi snapshot historis dengan versi aktif saat ini (`current`).
   - Mengkalkulasi pergeseran per pos mata anggaran dengan status perubahan terklasifikasi:
     - `UNCHANGED`: Pagu sama / tidak bergeser
     - `INCREASED`: Pagu bertambah ($+$)
     - `DECREASED`: Pagu berkurang ($-$)
     - `ADDED`: Pos baru yang baru dimasukkan pada versi revisi target
     - `REMOVED`: Pos yang dihapus / tidak dianggarkan lagi pada versi target

### B. Frontend UI & UX (`apps/web/src/modules/BudgetsView.vue`)
1. **Preset Rekomendasi Alasan Revisi (Audit-Compliant Reasons)**:
   - Tombol chip cepat untuk memilih alasan standar:
     - *Dialihkan ke Block Grant PMO (Efisiensi & Konsolidasi Program)*
     - *Penyesuaian Prognosis Kegiatan Triwulan (Realokasi Pos Belanja)*
     - *Optimalisasi & Efisiensi Belanja Operasional Unit*
     - *Addendum Kontrak Klien / Perubahan Ruang Lingkup Proyek*
     - *Penyesuaian Tarif Standar Biaya Masukan (SBM) Rektorat*
2. **Diff Viewer Modal Dialog**:
   - Selector interaktif untuk memilih **Versi Asal (From)** dan **Versi Target (To)**.
   - Ringkasan KPI: Pagu Asal, Pagu Target, Total Selisih Plafon, dan Jumlah Pos yang Berubah.
   - Quick Filter Pills: `Semua`, `Hanya Perubahan`, `+ Bertambah`, `- Berkurang`, `Pos Baru`, `Dihapus`.
   - Tabel komparasi presisi dengan highlight warna pastel lembut, angka berformat rupiah monospaced, dan badge status audit.
3. **Trigger Aksi pada Drawer Detail**:
   - Tombol *"Bandingkan Versi (Diff Viewer)"* pada header riwayat revisi drawer.
   - Tombol individual *"Bandingkan"* pada tiap kartu versi revisi untuk membandingkan versi tersebut secara cepat.

---

## 3. Hasil Pengujian & Verifikasi

```bash
# 1. Typecheck TypeScript seluruh modul (API + Web)
npm run typecheck
# Output: @pmo-erp/api (0 error), @pmo-erp/web (0 error)

# 2. Build Web Frontend Vite
npm --workspace=apps/web run build
# Output: built in 2.98s, 0 error

# 3. Automated Vitest Integration Tests
npm test
# Output: 24 passed (100% test coverage passed)
```

---

## 4. Status Transisi Jira
- **Tiket:** `KOI-99` ([PMO-043])
- **Status Akhir:** `In Review` (Sesuai SOP tim, tiket tidak di-Donekan langsung sebelum ditinjau dan disetujui).
