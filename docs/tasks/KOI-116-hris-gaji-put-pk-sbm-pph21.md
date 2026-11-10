# Dokumentasi Teknis Task: KOI-116

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-091`
* **Jira Issue Key:** `KOI-116`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-091] HRIS Gaji PUT PK: Perhitungan Standar Biaya Masukan (SBM) & PPh 21`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer Keuangan / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-24`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-116-hris-gaji-put-pk-sbm-pph21`

---

## 2. Deskripsi & Landasan Regulasi Kepatuhan
Sesuai Peraturan Rektor Universitas Terbuka No. 310 Tahun 2025 (Pertor 310), Standar Biaya Masukan (SBM) Tahun Anggaran 2026, PP No. 58 Tahun 2023, dan PMK No. 168 Tahun 2023:
1. **Status Pegawai PUT PK:** Pegawai Unit Usaha PMO UTama berstatus Pegawai Usaha Tetap Perjanjian Kerja (PUT PK) Non-PNS berhak atas kompensasi bulanan terstruktur yang terdiri dari Gaji Pokok, Tunjangan Jabatan, Uang Makan Kehadiran Fisik (SBM Rp 37.000/hari kehadiran), dan Uang Lembur Operasional (SBM Rp 20.000/jam kerja lembur resmi).
2. **Potongan Iuran Jaminan Sosial (BPJS):** Potongan iuran BPJS Kesehatan dan Ketenagakerjaan porsi pegawai ditetapkan sebesar 4,00% dari penghasilan bruto.
3. **Pajak Penghasilan PPh Pasal 21 Tarif Efektif Rata-Rata (TER):** Penghitungan pemotongan PPh 21 masa bulanan wajib mengacu pada skema Tarif Efektif Rata-Rata (TER) Kategori A, B, dan C berdasarkan status PTKP (TK/0, K/0, dsb.) dan penghasilan bruto bulanan tanpa perhitungan manual yang rawan galat.
4. **Pemetaan Akun Buku Besar (COA Pertor 310):**
   - `520101030100` — Beban Gaji Tenaga Kependidikan PUT PK
   - `520101050200` — Beban Lembur Pendukung Kegiatan Operasional - Non PNS
   - `520101060200` — Beban Uang Makan Tenaga Kependidikan - Non PNS
   - `210201010100` — Utang Pajak PPh Pasal 21
   - `210301010100` — Beban Akrual / Yang Masih Harus Dibayar (Titipan BPJS)
   - `110101020200` — Bank BRI Penerimaan Komersial PMO (Kas Pembayaran Gaji)

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Backend (`apps/api/src/modules/hris/routes.ts`)
1. **Konstanta Standar SBM 2026 & Pemetaan COA Pertor 310 (`SBM_2026`)**:
   - `uangMakanHarian: 37_000` (Rp 37.000 / hari kehadiran)
   - `uangLemburPerJam: 20_000` (Rp 20.000 / jam lembur)
   - `bpjsKaryawanRate: 0.04` (4% potongan BPJS)
   - Akun debit & kredit Pertor 310 terdefinisi secara resmi dan tidak menggunakan akun tiruan (dummy slop).
2. **Kalkulator PPh 21 TER Terakreditasi (`calculatePph21Ter`)**:
   - Menerapkan tabel tarif progresif TER Kategori A, B, dan C sesuai Lampiran PP 58/2023.
   - Mengembalikan tarif efektif (persentase) dan nominal pemotongan pajak terhitung secara presisi.
3. **Engine Komputasi Payroll PUT PK (`computeEmployeePayrollSbm`)**:
   - Menghitung penghasilan bruto komprehensif: $\text{Gross} = \text{Gaji Pokok} + \text{Tunjangan Jabatan} + (\text{Hari Hadir} \times 37.000) + (\text{Jam Lembur} \times 20.000)$.
   - Menghitung potongan iuran BPJS (4%) dan potongan PPh 21 TER.
   - Menghitung Take-Home Pay (Net Salary).
   - Menghasilkan jurnal akuntansi debet-kredit berimbang (*balanced double-entry*) otomatis.
4. **Endpoint Baru HRIS**:
   - `GET /hris/payroll/summary-sbm`: Mengambil parameter referensi standar SBM 2026 dan status rekap.
   - `POST /hris/payroll/calculate`: Menghitung simulasi rincian kompensasi per pegawai secara interaktif.
   - `POST /hris/payroll/generate`: Menghasilkan slip gaji kolektif untuk periode berjalan dan mencatat rekonsiliasi beban.

### B. Frontend (`apps/web/src/modules/HrisView.vue`)
1. **Tab Baru: Kalkulator SBM 2026 & PPh 21 TER (`CALCULATOR_SBM`)**:
   - Formulir interaktif: Pilihan Karyawan, Gaji Pokok, Tunjangan Jabatan, Hari Kehadiran, Jam Lembur, dan Status PTKP (TK/0 s.d. K/3).
   - Kartu Kalkulasi Real-Time: Ringkasan Penghasilan Bruto, Potongan BPJS 4%, Potongan PPh 21 TER, dan Gaji Bersih (Take Home Pay).
   - Rincian Jurnal Akuntansi Pertor 310: Menampilkan akun debet (`520101030100`, `520101050200`, `520101060200`) dan kredit (`210201010100`, `210301010100`, `110101020200`).
2. **Tombol Terbitkan Slip Gaji SBM 2026**:
   - Tombol integrasi batch generator pada tab Penggajian untuk menerbitkan slip gaji bulan Desember 2026 dengan notifikasi konfirmasi sukses.

---

## 4. Hasil Pengujian & Verifikasi

### A. Automated Integration Tests (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 10:
* `retrieves SBM 2026 reference standards and summary calculations`: Memverifikasi ketersediaan standar uang makan (Rp 37.000), uang lembur (Rp 20.000), dan tarif BPJS 4%.
* `calculates employee payroll with SBM allowances, BPJS deduction & PPh 21 TER (PMO-091)`: Memverifikasi akurasi perhitungan Take Home Pay, pemotongan PPh 21 TER, BPJS, dan balance entri jurnal akuntansi Pertor 310.
* `generates batch salary slips for period 12/2026 based on SBM 2026 & PPh 21 TER`: Memverifikasi penerbitan slip gaji massal berhasil tanpa galat.

Hasil eksekusi test suite:
```
Test Files  1 passed (1)
     Tests  33 passed (33)
  Duration  6.68s
```

### B. Frontend Production Build & TypeScript Verification
* `npm --workspace=apps/web run build`: Lulus bersih tanpa galat typecheck (`vue-tsc -b`) dan Vite bundle sukses dibangun.

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-116` ditransisikan ke status `In Review` untuk divalidasi oleh Tim Reviewer Keuangan dan Manajer HR PMO.
* Branch `feature/KOI-116-hris-gaji-put-pk-sbm-pph21` dipusatkan ke remote repository dengan pull request terlampir.
