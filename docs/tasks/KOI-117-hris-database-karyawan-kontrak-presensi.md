# Dokumentasi Teknis Task: KOI-117

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-101`
* **Jira Issue Key:** `KOI-117`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-101] Database Karyawan, Riwayat Kontrak & Rekapitulasi Presensi Unit`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer HR / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-24`
* **Priority:** `Medium`
* **Git Branch:** `feature/KOI-117-hris-database-karyawan-kontrak-presensi`

---

## 2. Deskripsi & Latar Belakang Regulasi
Sesuai Peraturan Rektor Universitas Terbuka No. 310 Tahun 2025 (Pertor 310) dan Standar Biaya Masukan (SBM) Tahun Anggaran 2026:
1. **Pengelolaan Hubungan Kerja PUT PK:** Pegawai Usaha Tetap Perjanjian Kerja (PUT PK) dan tenaga pendukung operasional unit bisnis PMO UTama memiliki masa berlaku Surat Keputusan (SK) penugasan berkala. Sistem membutuhkan modul pelacakan riwayat SK penugasan, status masa berlaku (AKTIF, SEGERA BERAKHIR $\le 30$ hari, HABIS, dan DIPERPANJANG / RENEWED) untuk mencegah kekosongan SK atau kepatuhan legal ketenagakerjaan.
2. **Rekapitulasi Presensi Unit Kerja:** Presensi kehadiran fisik dan lembur operasional merupakan basis utama penghitungan hak Uang Makan SBM (Rp 37.000 / hari kehadiran fisik) dan Uang Lembur SBM (Rp 20.000 / jam lembur resmi). Sistem memerlukan rekapitulasi kehadiran per Unit Bisnis (MICE, TCI, IT Solution, Klinik Pratama, dan Manajemen Pusat) dengan alur verifikasi resmi oleh Manajer Unit / HRD sebelum data masuk ke modul penggajian (Payroll).

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Skema Basis Data Prisma (`prisma/schema.prisma`)
1. **Model Baru `EmployeeContract`:**
   - Menyimpan atribut riwayat SK penugasan: `contractNumber`, `contractType` (`PUT_PK`, `PKWT`, `KONSULTAN_AHLI`, `MAGANG`), `startDate`, `endDate`, `salaryRate`, `status` (`ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, `RENEWED`, `TERMINATED`), `notes`, `signedDate`.
   - Relasi `Cascade` terhubung ke `Employee`.
2. **Peningkatan Model `Employee` & `Attendance`:**
   - `Employee` memiliki relasi `contracts EmployeeContract[]`.
   - `Attendance` memiliki kolom `overtimeHours Decimal @default(0) @db.Decimal(5, 2)` untuk mencatat durasi jam lembur harian terakreditasi.

### B. Backend Engine (`apps/api/src/modules/hris/routes.ts`)
1. **Logika Peringatan Masa Berlaku SK (`computeContractAlert`)**:
   - Menghitung sisa hari masa berlaku kontrak: $\le 30$ hari ditandai `EXPIRING_SOON`, $< 0$ hari ditandai `EXPIRED`, lainnya `ACTIVE`.
2. **Endpoints Master SDM & Kontrak**:
   - `GET /hris/employees`: Menyertakan relasi `contracts`, `activeContract`, `contractStatus`, dan `daysUntilContractEnd`.
   - `POST /hris/employees`: Mendaftarkan pegawai baru beserta inisialisasi SK kontrak awal.
   - `PUT /hris/employees/:id`: Pembaruan data pegawai.
   - `GET /hris/contracts`: Filter kontrak per status, pegawai, dan unit bisnis.
   - `POST /hris/contracts`: Menerbitkan SK perpanjangan kontrak baru dengan otomatisasi transisi status kontrak lama ke `RENEWED`.
   - `PUT /hris/contracts/:id`: Pembaruan status atau adendum kontrak.
3. **Endpoints Rekapitulasi Presensi Unit**:
   - `GET /hris/attendance/unit-recap`:
     - Mengelompokkan kehadiran pegawai berdasarkan Unit Bisnis untuk periode bulan dan tahun yang dipilih.
     - Menghitung agregat hari hadir (`PRESENT` & `LATE`), hari sakit (`SICK`), hari cuti (`LEAVE`), hari alpha (`ALPHA`), dan akumulasi jam lembur.
     - Mengkalkulasi hak finansial SBM: Uang Makan ($37.000 \times \text{Hadir}$) dan Uang Lembur ($20.000 \times \text{Jam Lembur}$).
     - Menghitung grand total biaya SBM unit dan ringkasan global lintas unit.
   - `POST /hris/attendance/record`: Pencatatan / upsert absensi harian pegawai.
   - `POST /hris/attendance/verify-unit`: Verifikasi resmi rekapitulasi presensi seluruh pegawai dalam unit kerja oleh Manajer Unit / Koordinator HR.

### C. Frontend Antarmuka Pengguna (`apps/web/src/modules/HrisView.vue`)
1. **Peningkatan Tab Database SDM (`EMPLOYEES`)**:
   - Kolom status kontrak dengan visual badge interaktif (`Pegawai Tetap`, `Aktif s.d. DD/MM/YY`, `⚠️ Sisa X hari`, `❌ Habis`).
   - Tombol `📄 SK & Kontrak` per baris pegawai.
2. **Modal Dialog Riwayat Kontrak & Form Perpanjangan SK**:
   - Menampilkan daftar SK penugasan historis pegawai.
   - Formulir penerbitan perpanjangan SK baru (Nomor SK, Tipe Hubungan Kerja, Tanggal Mulai/Berakhir, Penyesuaian Gaji SBM, Catatan SK) dengan integrasi langsung ke API.
3. **Peningkatan Tab Presensi & Absensi (`ATTENDANCE`)**:
   - Filter bar: Pemilihan Bulan (Oktober - Desember), Tahun (2025 - 2027), dan Unit Bisnis.
   - KPI Strip SBM Kehadiran: Total Kehadiran Fisik, Total Jam Lembur, Hak Uang Makan SBM (`520101060200`), dan Total Beban SBM Kehadiran (`520101050200`).
   - Kartu Rekapitulasi Unit Bisnis: Status verifikasi (`✓ TERVERIFIKASI RESMI` / `⏳ MENUNGGU VERIFIKASI`), rincian kehadiran per pegawai, tombol verifikasi unit kerja.
   - Toggle tampilan: Dapat menampilkan/menyembunyikan log presensi harian mentah (jam check-in/out).

---

## 4. Hasil Pengujian & Verifikasi

### A. Automated Integration Tests (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 11:
* `retrieves employee database with contract history, alert status, and days remaining`: Memverifikasi database pegawai memuat relasi kontrak, status alert masa berlaku, dan sisa hari.
* `issues a new contract renewal for employee and transitions previous active contracts to RENEWED`: Memverifikasi penerbitan SK perpanjangan berhasil dan kontrak lama berubah status ke `RENEWED`.
* `generates unit attendance recap per business unit with SBM meal & overtime entitlement calculations and verifies recap`: Memverifikasi rekapitulasi presensi unit teragregasi presisi sesuai tarif SBM 2026 dan alur verifikasi unit sukses.

Hasil eksekusi test suite komprehensif:
```
Test Files  1 passed (1)
     Tests  36 passed (36)
  Duration  7.16s
```

### B. Frontend Production Build & TypeScript Verification
* `npm --workspace=apps/web run build`: Lulus bersih tanpa galat typecheck (`vue-tsc -b`) dan Vite bundle sukses dibangun (5.12s).

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-117` ditransisikan ke status `In Review` untuk divalidasi oleh Manajer HR dan Unit Manager PMO.
* Branch `feature/KOI-117-hris-database-karyawan-kontrak-presensi` dipusatkan ke remote repository dengan pull request terlampir.
