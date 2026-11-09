# 📊 Tiket KOI-98 (PMO-042): Transformasi Antarmuka BudgetsView.vue ke Format Semula - Menjadi

- **Jira Key:** `KOI-98` (Task)
- **Parent Epic:** `KOI-93` ([SPRINT 2] Budgeting Semula-Menjadi & Multi-Level Volume)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-98-ui-budgets-semula-menjadi`
- **Komponen Terdampak:** `apps/web/src/modules/BudgetsView.vue`, `apps/api/src/modules/master/routes.ts`
- **Hasil Verifikasi:** 24 Integration Tests Passed (100%), Typecheck Clean (0 errors), Vite Build 100% OK.

---

## 1. Latar Belakang & Urgensi Bisnis
Format anggaran resmi Rektorat Universitas Terbuka pada unit komersial PMO UTama mengadopsi struktur pergeseran pagu **Semula vs Menjadi** dan kalkulasi volume bertingkat hingga 4 variabel:
$$\text{Total Volume} = V_1 \times V_2 \times V_3 \times V_4$$
$$\text{Pagu Alokasi} = \text{Total Volume} \times \text{Tarif Satuan}$$
$$\text{Pagu Menjadi} = \text{Pagu Semula} + \text{Pergeseran}$$

Sebelum tiket ini dikerjakan, modul anggaran (`/budgets`) masih menampilkan tabel datar alokasi tunggal tanpa filter unit bisnis yang presisi, tanpa komponen pencarian COA PMO, serta form revisi yang belum menyediakan live calculation pergeseran (+/-).

Tiket ini mentransformasikan antarmuka modul `BudgetsView.vue` agar selaras dengan kebutuhan pelaporan RKAP dan format kerja Excel resmi PMO Revisi 7.

---

## 2. Lokasi Menu & Fitur yang Berubah
1. **Menu Anggaran & Plafon Belanja (`/budgets`):**
   - **Filter Toolbar Unit Bisnis & Status (Non-Slop Pill Buttons):**
     - Row 1: Filter cepat unit bisnis (`Semua Unit`, `BU-ITS`, `BU-KLINIK`, `BU-MICE`, `BU-TCI`, `BU-PMO`).
     - Row 2: Filter status dokumen (`Semua Status`, `Disetujui`, `Menunggu Approval`, `Draft`, `Direvisi`) dan input search query instan.
   - **Tabel Dokumen Anggaran Format Semula - Menjadi:**
     - Menampilkan kolom: *Nomor & Unit*, *Judul Anggaran*, *Pagu Semula*, *Pergeseran (+/-)*, *Pagu Menjadi*, *Realisasi*, *Sisa Bebas*, *Status*, dan *Aksi*.
     - Badge pergeseran berwarna kontras (hijau untuk penambahan, merah untuk pengurangan pagu).
   - **Slide Drawer Rincian Dokumen Anggaran (Detail View):**
     - Ringkasan KPI: Pagu Semula, Total Pergeseran (+/-), Pagu Menjadi, dan Sisa Plafon Bebas.
     - Tabel Rincian Pos Anggaran Semula - Menjadi:
       - Kolom: *No*, *Cost Center & Sub Kegiatan*, *COA & Uraian Pekerjaan*, *Volume & Tarif ($V_1 \times V_2 \times V_3 \times V_4 \times \text{Tarif}$)*, *Pagu Semula*, *Pergeseran*, *Pagu Menjadi*, *Realisasi*, *Sisa Bebas*, dan *Serapan %*.
   - **Modal Buat Draft Anggaran Baru (`createOpen`):**
     - Integrasi komponen `CoaCombobox.vue` yang menyajikan 70 akun operasional resmi PMO dari file Excel.
     - Toggle kalkulator multi-volume: mendukung input $V_1, V_2, V_3, V_4$ dengan satuan masing-masing (contoh: 2 Orang $\times$ 3 Hari $\times$ 4 Bulan $\times$ 1 Kegiatan) dan tarif satuan dengan live calculation subtotal otomatis.
   - **Modal Revisi Plafon Anggaran (`reviseOpen`):**
     - Live total banner menampilkan komparasi 3 pilar: Pagu Semula, Total Pergeseran, Pagu Menjadi Baru.
     - Input dua arah yang saling menyelaraskan: mengubah nilai pergeseran otomatis menghitung pagu menjadi, dan sebaliknya.
2. **Backend API Master Overview (`/api/v1/master/overview`):**
   - Menambahkan field `chartOfAccounts` (70 akun aktif PMO) ke payload overview sehingga seluruh modul frontend memiliki akses instan ke akun resmi COA tanpa fetch berulang.

---

## 3. Matriks Hak Akses & Role yang Berwenang (RBAC & SoD)
- **`SUPER_ADMIN` & `GM_PMO`:** Wewenang menyetujui draft anggaran (`budget:approve`) dan otorisasi revisi pergeseran pagu.
- **`FINANCE_MANAGER`:** Monitoring serapan pagu seluruh unit bisnis dan validasi pergeseran antar pos mata anggaran.
- **`UNIT_MANAGER`:** Membuat draft anggaran baru dan mengajukan usulan revisi untuk unit bisnis masing-masing, terikat aturan *Separation of Duties* (tidak bisa menyetujui anggaran buatannya sendiri).
- **`INTERNAL_AUDITOR`:** Akses read-only memeriksa histori snapshot revisi di drawer tanpa hak mutasi.

---

## 4. Panduan Verifikasi
```bash
# 1. Verifikasi Typecheck TypeScript
npm run typecheck

# 2. Verifikasi Build Frontend Vite
npm --workspace=apps/web run build

# 3. Jalankan Automated Integration Test Suite (24 test scenarios)
npm test
```
