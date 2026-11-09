# 📊 Tiket KOI-100 (PMO-044): Injeksi Data Anggaran Riil PMO dari Excel (Revisi 7 Block Grant & Usulan 2027)

- **Jira Key:** `KOI-100` (Task)
- **Parent Epic:** `KOI-93` ([SPRINT 2] Budgeting Semula-Menjadi & Multi-Level Volume)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-100-injeksi-data-anggaran-riil-excel`
- **File Sumber:**
  - `docs/Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx` (Revisi 7 Tahun 2026)
  - `docs/Tabel Kerja Anggaran Semula-Menjadi PMO 2027 30102026.xlsx` (Usulan Rencana Kerja 2027)
- **Skrip Seeder:** `scripts/seed_real_budgets_excel.ts`
- **Hasil Verifikasi:** 296 Pos Anggaran Riil terinjeksi ke PostgreSQL, 24 Integration Tests Passed (100%), Typecheck 0 error.

---

## 1. Latar Belakang & Urgensi Bisnis
Universitas Terbuka melalui Pusat Bisnis & Investasi (PBI / PMO UTama) mengelola dokumen rencana kerja anggaran yang memuat ratusan pos mata anggaran belanja operasional riil. Sebelumnya, sistem hanya menggunakan data dummy/mocking terbatas saat pengembangan modul.

Agar sistem ERP PMO Finance dapat langsung digunakan dalam simulasi operasional sesungguhnya dan audit kepatuhan, tiket ini mengekstraksi seluruh data anggaran riil dari kedua file kerja Excel resmi PMO ke dalam basis data PostgreSQL dengan struktur relasi yang lengkap.

---

## 2. Struktur Data yang Diinjeksi
1. **Dokumen Anggaran Tahun Buku 2026 (`FY-2026`):**
   - **Nomor Dokumen:** `BDG-2026-REV7-BLOCKGRANT`
   - **Judul:** RKAP Perubahan Ke-7 Block Grant PMO 2026 (Konsolidasi)
   - **Unit Bisnis:** `PMO-MGMT` (Operasional, Manajemen, Keuangan & Umum PMO)
   - **Status:** `APPROVED`
   - **Jumlah Baris Pos Anggaran:** **118 Pos**
   - **Total Pagu Alokasi:** **Rp 20.157.959.000**
   - **Kelengkapan Kolom:** Metadata IKPS, Standar Kegiatan, Sub Kegiatan, Kelompok Pagu, FTE, COA 12-digit resmi, Volume 4 Level ($V_1 \times V_2 \times V_3 \times V_4$), Tarif Satuan, Pagu Semula, Pergeseran, Pagu Menjadi, dan Realisasi.

2. **Dokumen Anggaran Usulan Tahun Anggaran 2027 (`FY-2027`):**
   - Terbagi ke dalam 5 unit bisnis operasional PMO:
     1. **`BDG-2027-ITS` (Divisi IT Solution):** 44 Pos Mata Anggaran | Pagu: **Rp 1.154.200.000**
     2. **`BDG-2027-MICE` (Divisi MICE & Wisma UT):** 31 Pos Mata Anggaran | Pagu: **Rp 1.826.475.000**
     3. **`BDG-2027-TCI` (Divisi TCI Training & Sertifikasi):** 40 Pos Mata Anggaran | Pagu: **Rp 4.004.050.000**
     4. **`BDG-2027-KLINIK` (Divisi Klinik Pratama):** 23 Pos Mata Anggaran | Pagu: **Rp 1.117.400.000**
     5. **`BDG-2027-PMO-MGMT` (Tata Usaha, Keuangan & Umum):** 40 Pos Mata Anggaran | Pagu: **Rp 17.073.500.000**
   - **Total Pos Anggaran 2027:** **178 Pos**
   - **Total Pagu Usulan 2027:** **Rp 25.175.625.000**

---

## 3. Keputusan Teknis & Integritas Relasi
- **Smart COA Inference:** Baris usulan 2027 yang belum mencantumkan kode COA eksplisit dipetakan secara cerdas ke 27 akun belanja resmi PMO (`52...`) berdasarkan deskripsi pos (narasumber, perjadin, sewa cloud, ATK, jamuan, obat farmasi, dll.).
- **Formula Volume Multi-Level:** Menjaga perkalian bertingkat volume 4 level ($V_1 \text{ [sat1]} \times V_2 \text{ [sat2]} \times V_3 \text{ [sat3]} \times V_4 \text{ [sat4]}$) dan tarif satuan agar dapat langsung divisualisasikan di Slide Drawer antarmuka frontend.
- **Relasi Foreign Key:** Seluruh baris terhubung valid ke `BusinessUnit`, `FiscalPeriod`, `CostCenter`, dan `FundSource`.

---

## 4. Panduan Verifikasi
```bash
# 1. Jalankan seeder data anggaran riil
npx tsx scripts/seed_real_budgets_excel.ts

# 2. Verifikasi typecheck
npm run typecheck

# 3. Jalankan automated test suite
npm test
```
