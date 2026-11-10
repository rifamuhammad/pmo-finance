# Dokumentasi Teknis Task: KOI-118

## 1. Metadata Pekerjaan
* **Kode Task:** `PMO-102`
* **Jira Issue Key:** `KOI-118`
* **Parent Epic:** `KOI-114` — `[SPRINT 4] Operational Rules, HRIS Lock & Aset Tetap ISAK 335`
* **Judul:** `[PMO-102] Engine Auto-Lock Presensi & Lembur HRIS Setiap Tanggal 25 Pukul 23:59`
* **Sprint:** Sprint 4 (Operational Rules, HRIS Lock & Aset Tetap ISAK 335)
* **Status:** `In Review` (Menunggu Validasi Manajer HR / STRICT ANTI-DONE)
* **Assignee:** `Syah Bintang`
* **Due Date:** `2026-12-25`
* **Priority:** `High`
* **Git Branch:** `feature/KOI-118-hris-auto-lock-presensi-cutoff-tgl-25`

---

## 2. Deskripsi & Latar Belakang Kepatuhan Cut-Off
Sesuai SOP Penggajian dan Remunerasi PMO UTama serta Peraturan Rektor Universitas Terbuka No. 310 Tahun 2025:
1. **Aturan Batas Akhir (Cut-Off) Penggajian:** Periode presensi kehadiran dan klaim lembur operasional untuk siklus penggajian bulanan ditutup dan dikunci otomatis (*auto-locked*) pada **tanggal 25 pukul 23:59:59 (WIB / server time)** pada bulan berjalan.
2. **Integritas Beban Gaji & SBM:** Pembekuan data presensi pasca cut-off wajib diberlakukan untuk mencegah manipulasi kehadiran atau pengajuan lembur susulan setelah penghitungan Uang Makan SBM (Rp 37.000 / hari) dan Uang Lembur SBM (Rp 20.000 / jam) diproses ke slip gaji.
3. **Mekanisme Override / Unfreeze Darurat:** Segala pembukaan kunci periode pasca cut-off hanya diperkenankan atas diskresi dan otorisasi resmi General Manager PMO (`GM_PMO`) atau Manajer HR dengan pencatatan alasan wajib dan masa tenggang pembukaan sementara (*temporary override window*), serta terekam permanen dalam log audit sistem SPI.

---

## 3. Implementasi Teknis & Perubahan Kode

### A. Skema Basis Data Prisma (`prisma/schema.prisma`)
* **Model Baru `HrisPeriodLock`:**
  - Menyimpan status penguncian periode per bulan, tahun, dan unit bisnis (`businessUnitId: String @default("GLOBAL")`).
  - Atribut: `cutoffDate` (DateTime @db.Date), `cutoffTime` ("23:59:59"), `isLocked` (Boolean), `lockedAt`, `unlockedAt`, `unlockedBy`, `unlockReason`, `unlockedUntil`.
  - Constraint compound unique: `@@unique([periodYear, periodMonth, businessUnitId])`.

### B. Backend Engine (`apps/api/src/modules/hris/routes.ts`)
1. **Engine Verifikasi Kunci Presensi (`isAttendancePeriodLocked`)**:
   - Mengevaluasi apakah tanggal transaksi presensi berada pada periode yang terkunci:
     - Memeriksa status entri eksplisit di `HrisPeriodLock`.
     - Memeriksa apakah terdapat jendela override aktif (`now < unlockedUntil`).
     - Menguji aturan batas waktu cut-off default (apabila waktu berjalan $> \text{tanggal 25 pukul 23:59:59}$).
2. **Pencegahan Mutasi Absensi (`POST /hris/attendance/record`)**:
   - Melakukan validasi kunci sebelum mengizinkan pencatatan kehadiran atau jam lembur.
   - Menolak mutasi dengan `403 ATTENDANCE_PERIOD_LOCKED` apabila periode sedang terkunci.
3. **Endpoints Kontrol Locking & Override**:
   - `GET /hris/attendance/lock-status`: Mengembalikan status penguncian periode, batas waktu cutoff, detail override aktif, dan hak izin override pemohon (`canOverride`).
   - `POST /hris/attendance/unlock-override`: Otorisasi darurat oleh GM PMO / HR Manager untuk membuka kunci sementara dengan alasan resmi dan durasi masa aktif (12, 24, atau 48 jam).
   - `POST /hris/attendance/lock-period`: Mengunci kembali periode secara manual atau otomatis setelah proses koreksi selesai.

### C. Frontend Antarmuka Pengguna (`apps/web/src/modules/HrisView.vue`)
1. **Banner Status Penguncian Presensi (Tab ATTENDANCE)**:
   - Banner Indikator Otomatis:
     - Jika Terkunci: Menampilkan status `🔒 Periode Presensi & Lembur Terkunci (Cutoff Tanggal 25)` dengan tombol `🔓 Override Buka Kunci (GM PMO)`.
     - Jika Unfrozen: Menampilkan status `🔓 Mode Buka Kunci Darurat Aktif` dengan informasi verifikator pemohon, alasan resmi, sisa masa aktif, dan tombol `🔒 Kunci Kembali Periode`.
2. **Modal Dialog Override Buka Kunci Darurat**:
   - Formulir input alasan unfreeze (minimal 5 karakter) dan pemilihan durasi unfreeze (12, 24, 48 jam) terintegrasi ke endpoint backend.

---

## 4. Hasil Pengujian & Verifikasi

### A. Automated Integration Tests (`apps/api/src/tests/erp.test.ts`)
Tiga pengujian integrasi baru ditambahkan pada Section 12:
* `retrieves attendance lock status and enforces cutoff rule for period 12/2026`: Memverifikasi ketersediaan status penguncian periode 12/2026 dan aturan cutoff tanggal 25.
* `rejects recording or mutating attendance during locked period with ATTENDANCE_PERIOD_LOCKED (403)`: Memverifikasi penolakan mutasi presensi pasca-cutoff secara ketat.
* `allows emergency unfreeze override by GM PMO and re-locks period after override window`: Memverifikasi alur unfreeze darurat oleh GM PMO, keberhasilan pencatatan data selama masa unfreeze, serta keberhasilan penguncian kembali (*relock*).

Hasil eksekusi test suite:
```
Test Files  1 passed (1)
     Tests  39 passed (39)
  Duration  6.88s
```

### B. Frontend Production Build & TypeScript Verification
* `npm --workspace=apps/web run build`: Lulus bersih tanpa galat typecheck (`vue-tsc -b`) dan Vite bundle sukses dibangun (6.39s).

---

## 5. Review Gate & Status Jira
* Sesuai aturan **STRICT ANTI-DONE**, tiket `KOI-118` ditransisikan ke status `In Review` untuk divalidasi oleh GM PMO dan Manajer HR.
* Branch `feature/KOI-118-hris-auto-lock-presensi-cutoff-tgl-25` dipusatkan ke remote repository dengan pull request terlampir.
