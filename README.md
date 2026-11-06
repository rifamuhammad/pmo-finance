# ERP Keuangan & Operasional PMO UTama

Sistem Enterprise Resource Planning (ERP) Keuangan dan Operasional untuk **PMO UTama (Universitas Terbuka PTNBH)** yang mengintegrasikan seluruh rantai proses: perencanaan modal kerja dan anggaran unit, pengadaan barang/jasa berbasis kuotasi dan 3-way matching, pengeluaran kas operasional, penjualan layanan dan pesanan komersial, penerbitan faktur tagihan, modul kasir shift closeout, rekonsiliasi mutasi bank otomatis, akuntansi double-entry, kepatuhan pajak, aset tetap dan pinjaman PBI UT, payroll/SDM, pertanggungjawaban uang persediaan (GUP/TUP), pelaporan keuangan konsolidasi, hingga evaluasi plafon periode berikutnya.

> **Pernyataan Lingkungan Data Demo:** Seluruh akun dan rekaman transaksi awal yang disediakan melalui perintah seed diberi tanda eksplisit `[DATA DEMO]`. Data ini disiapkan khusus untuk keperluan verifikasi teknis, simulasi alur persetujuan bertingkat, dan audit alur data monorepo.

---

## 1. Arsitektur & Tumpukan Teknologi

- **Frontend (`apps/web`)**: Vue.js 3 (Composition API dengan `<script setup>`), TypeScript, Pinia, Vue Router 4, Vite 5, PrimeVue, dan Tailwind CSS.
- **Backend (`apps/api`)**: Node.js, Express.js, TypeScript, validasi skema runtime via Zod, dan Prisma ORM.
- **Database**: PostgreSQL 15+ dengan presisi `DECIMAL(18,2)` pada seluruh kolom moneter dan kalkulasi pembulatan berbasis sen senilai integer (`BigInt`) melalui utilitas `apps/api/src/shared/decimal.ts`.
- **Pengujian Integrasi**: Vitest dan Supertest (`apps/api/src/tests/erp.test.ts`).

### Struktur Direktori Monorepo

```text
/
├── CONTRIBUTING.md                 # Standar kontribusi tim, strategi Git branching, dan konvensi commit
├── docker-compose.yml              # Konfigurasi PostgreSQL 15 lokal
├── .env.example                    # Template variabel lingkungan sistem
├── docs/
│   ├── MASTER-BLUEPRINT-ERP-PMO-FINANCE.md       # Blueprint arsitektur teknis, dual-layer PMO vs PBI/Puslakeu, dan spesifikasi 14 modul
│   ├── JIRA-PRODUCT-BACKLOG-END-TO-END.md        # Backlog lengkap (11 Epic, 64 User Stories/Tasks PMO-001 s/d PMO-064)
│   ├── JIRA-SPRINT-SCHEDULE-AND-TIMELINE.md      # Jadwal 8 sprint rilis produksi (9 Nov 2026 - 26 Feb 2027)
│   ├── PANDUAN-DEPLOYMENT-SERVER.md              # Petunjuk rilis ke server Linux Ubuntu, Nginx reverse proxy, PM2 & SSL
│   ├── PANDUAN-SIMULASI-REAL-LIFE-LINTAS-ROLE.md # Skenario pengujian operasional riil lintas 9 peran pengguna
│   ├── api-conventions.md                        # Standar kontrak REST API, RBAC, format payload, dan mekanisme idempotensi
│   ├── Pertor 310 Tahun 2025 tentang Mekanisme Akuntansi.pdf # Rujukan hukum akuntansi Universitas Terbuka PTNBH
│   ├── Tabel Kerja Anggaran Semula-Menjadi PMO 2027 30102026.xlsx # 176 baris rincian anggaran 5 unit bisnis PMO tahun 2027
│   ├── Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx  # Rujukan belanja operasional riil 27 akun belanja PMO
│   ├── KODE COA UT.xlsx                          # Bagan akun pendapatan unit bisnis dan kode induk universitas
│   └── assets/                                   # Diagram arsitektur dan bagan alir proses
├── prisma/
│   ├── schema.prisma               # Skema database PostgreSQL (43 model entitas bisnis)
│   ├── migrations/                 # Catatan migrasi skema database relasional
│   ├── seed.ts                     # Inisialisasi master data sistem, 5 unit bisnis, cost center & akun pengguna
│   └── seed-demo.ts                # Dataset simulasi transaksi komprehensif untuk pengujian modul
└── apps/
    ├── api/                        # Backend REST API (Express.js + TypeScript + Prisma)
    └── web/                        # Frontend Web SPA (Vue 3 + TypeScript + Vite + PrimeVue)
```

---

## 2. Panduan Menjalankan Sistem di Lingkungan Lokal

### Prasyarat Perangkat Lunak
- **Node.js** versi 20.x ke atas dan **npm** versi 10.x ke atas.
- **PostgreSQL** versi 15.x ke atas (dapat dijalankan langsung pada sistem operasi lokal di port default `5432` atau memanfaatkan `docker compose up -d`).

### Tahapan Instalasi dan Setup Database

1. **Salin konfigurasi environment:**
   ```bash
   cp .env.example .env
   ```
   Pastikan parameter `DATABASE_URL` di dalam file `.env` telah mengarah ke instance PostgreSQL lokal Anda.

2. **Pasang dependensi monorepo:**
   ```bash
   npm install
   ```

3. **Generate Prisma Client & Sinkronisasi Skema Database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Jalankan Inisialisasi Data Master & Transaksi Demo:**
   ```bash
   npm run db:seed
   ```

5. **Jalankan Layanan Backend API dan Frontend Web:**
   - Menjalankan kedua layanan secara bersamaan:
     ```bash
     npm run dev
     ```
   - Menjalankan layanan secara terpisah:
     - Backend API (`http://localhost:4000`): `npm --workspace=apps/api run dev`
     - Frontend Web (`http://localhost:5173`): `npm --workspace=apps/web run dev`

---

## 3. Menjalankan Pengujian dan Kompilasi Produksi

- **Pengecekan Tipe Data (Typecheck API + Web):**
  ```bash
  npm run typecheck
  ```
- **Kompilasi Berkas Produksi (Build API + Web):**
  ```bash
  npm run build
  ```
- **Menjalankan Pengujian Integrasi Otomatis (Suite E2E):**
  ```bash
  npm test
  ```

---

## 4. Struktur Unit Bisnis & Akun Pengguna Uji Coba

Operasional PMO UTama terbagi ke dalam **5 Unit Bisnis Resmi**:
1. **`BU-ITS` (Divisi IT Solution)**: Layanan rekayasa perangkat lunak, sistem informasi, IT Promise, hosting, dan dukungan infrastruktur digital.
2. **`BU-KLINIK` (Divisi Klinik Pratama)**: Pelayanan kesehatan umum dan gigi, laboratorium medis dasar, serta instalasi obat/farmasi.
3. **`BU-MICE` (Divisi MICE & Wisma UT)**: Pengelolaan kamar tamu/wisma, penyewaan ballroom/gedung serbaguna, paket rapat, dan jamuan konsumsi.
4. **`BU-TCI` (Divisi Testing, Certification & Innovation)**: Penyelenggaraan pelatihan profesional, workshop, sertifikasi kompetensi kerja, dan ujian digital.
5. **`PMO-MGMT` (Operasional, Manajemen, Keuangan & Umum)**: Kantor pusat PMO, akuntansi terpusat, pengadaan barang/jasa lintas divisi, dan koordinasi dengan Holding PBI & Puslakeu UT Pusat.

Kata sandi standar seluruh akun uji coba demo: **`DemoErp!2026`**

| Peran Sistem (`roleCode`) | Alamat Email Login | Unit Kerja Terkait | Ruang Lingkup Wewenang |
| :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | `admin@pmoutama.demo.id` | Seluruh Unit | Pemeliharaan data master, manajemen akun pengguna, matriks hak akses, dan parameter konfigurasi sistem |
| `GM_PMO` | `gm@pmoutama.demo.id` | Seluruh Unit (Konsolidasi) | Persetujuan plafon anggaran RKAP, approval pengadaan/PR >= Rp 25.000.000, evaluasi strategis periode |
| `FINANCE_MANAGER` | `finance@pmoutama.demo.id` | Seluruh Unit (Konsolidasi) | Verifikasi & persetujuan PR < Rp 25.000.000, verifikasi pengeluaran kas operasional, otorisasi refund, rekonsiliasi bank |
| `UNIT_MANAGER` | `unit.manager@pmoutama.demo.id` | `BU-TCI` (Divisi TCI) | Penyusunan usulan anggaran unit, pembuatan purchase request (PR), pengajuan beban operasional, dan penerbitan pesanan layanan |
| `PROCUREMENT` | `procurement@pmoutama.demo.id` | Seluruh Unit | Manajemen vendor rekanan, input perbandingan penawaran kuotasi (minimal 3 vendor), penerbitan PO, dan pencatatan Goods Receipt (GR) |
| `ACCOUNTING` | `accounting@pmoutama.demo.id` | Seluruh Unit | Pengelolaan Bagan Akun (COA), pencatatan jurnal umum manual, pembukuan buku besar, penyesuaian neraca, dan penutupan periode fiskal |
| `CASHIER` | `kasir@pmoutama.demo.id` | `BU-TCI` (Divisi TCI) | Pembukaan sesi kasir, penerimaan kas/transfer/QRIS, validasi fisik kas akhir shift (closeout), dan pencatatan setoran ke bank |
| `TAX_OFFICER` | `tax@pmoutama.demo.id` | Seluruh Unit | Konfigurasi tarif pajak (PPN, PPh 21, PPh 23, PPh Final 4(2)), rekapitulasi bukti potong, dan verifikasi faktur pajak masukan/keluaran |
| `AUDITOR` | `auditor@pmoutama.demo.id` | Seluruh Unit | Hak akses baca seluruh transaksi keuangan, dokumen pengadaan, laporan laba rugi/neraca, dan pelacakan riwayat pada jejak audit (`AuditLog`) |

---

## 5. Cakupan 14 Modul Web Terintegrasi

Aplikasi antarmuka web (`apps/web`) mencakup 14 modul fungsional yang dapat diakses melalui portal navigasi utama:

1. **Portal Menu / Apps Launcher (`/`)**: Direktori modul utama berbasis kartu navigasi responsif yang menyesuaikan visibilitas dengan izin peran pengguna (RBAC).
2. **Dashboard Eksekutif & Operasional (`/dashboard`)**: Visualisasi metrik KPI keuangan (pemisahan omzet tagihan vs kas riil masuk), utilisasi serapan anggaran per unit, antrean dokumen approval, dan ringkasan aktivitas kas.
3. **Kotak Masuk Persetujuan / Approvals Inbox (`/approvals`)**: Pusat kerja verifikasi dokumen terpadu untuk Purchase Request (PR), tagihan beban operasional, berita acara selisih kasir, dan pengajuan revisi anggaran.
4. **Perencanaan Modal & Anggaran (`/budgets`)**: Penyusunan pagu RKAP per divisi dan cost center, alokasi sumber dana modal kerja, pencatatan komitmen anggaran (`committedAmount`), serta riwayat revisi anggaran bertingkat.
5. **Pengadaan, PO, Penerimaan & Beban (`/procurement`)**: Alur pengadaan barang/jasa, pencatatan minimal 3 kuotasi harga vendor, penerbitan PO, pencatatan Goods Receipt bertahap, 3-way matching dokumen, dan pengajuan pembayaran faktur rekanan.
6. **Penagihan Layanan, Pesanan & Faktur (`/revenue`)**: Katalog tarif layanan komersial tiap divisi, pembuatan sales order, penerbitan faktur tagihan (Invoice), dan pelacakan status piutang usaha (AR Aging).
7. **Kasir Operasional & Shift Closeout (`/revenue`)**: Sesi kasir per kasir per hari, penerimaan pembayaran multi-kanal (tunai, transfer bank, virtual account, QRIS), penghitungan fisik uang kas di akhir shift, dan pelaporan selisih kas.
8. **Kas, Bank & Rekonsiliasi Rekening Koran (`/reconciliation`)**: Buku rekening kas/bank operasional, pratinjau impor file mutasi rekening koran (format CSV dengan pencegahan duplikasi data via hash SHA-256), dan rekonsiliasi mutasi dengan jurnal kas.
9. **Akuntansi, COA & Buku Besar GL (`/accounting`)**: Pengelolaan Bagan Akun (COA), pencatatan jurnal umum double-entry seimbang (Debit = Kredit), larangan penghapusan jurnal terposting (harus melalui mekanisme void/reversal), buku besar per akun, dan neraca saldo.
10. **Uang Persediaan & Pertanggungjawaban SPJ (`/petty-cash`)**: Pengelolaan plafon kas kecil (UMK) per divisi, pencatatan belanja langsung mendesak beserta bukti kuitansi, pengelompokan SPJ, dan permohonan pengisian kembali (Ganti Uang Persediaan / GUP atau Tambah Uang Persediaan / TUP) ke Holding PBI & Puslakeu.
11. **Inventaris & Aset Tetap PMO (`/assets`)**: Registrasi aset berwujud operasional, pembedaan kepemilikan aset (aset mandiri PMO vs aset pinjaman/hibah PBI UT), penomoran label inventaris per unit, dan perhitungan beban penyusutan periodik dengan metode garis lurus.
12. **Database SDM, Presensi & Payroll PMO (`/hris`)**: Basis data personil PMO (tenaga PUT PK dan Dosen Praktisi), rekapitulasi kehadiran/presensi kerja, perhitungan jam lembur resmi, dan simulasi slip honorarium serta gaji bulanan sebelum diajukan pengeluaran LS ke pusat.
13. **Pelaporan Keuangan & Evaluasi Strategis (`/reports`)**: Penyusunan laporan keuangan otomatis mencakup Laporan Laba Rugi, Laporan Posisi Keuangan (Neraca), Laporan Arus Kas Langsung, Laporan Realisasi Anggaran per Divisi, ekspor data tabel ke format CSV, dan evaluasi penetapan pagu RKAP tahun buku selanjutnya.
14. **Administrasi Sistem, Kebijakan & Audit Trail (`/admin`)**: Manajemen unit bisnis, cost center, master vendor, master pengguna sistem, pengaturan kebijakan approval, dan pencatatan riwayat audit lengkap pada server (`AuditLog`).

---

## 6. Strategi Master Bagan Akun (COA) Spesifik PMO

Berdasarkan regulasi Pertor 310 Tahun 2025 serta dokumen kerja anggaran riil PMO (`docs/Tabel Kerja Anggaran Semula-Menjadi PMO 2027 30102026.xlsx` dan `docs/Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx`):

- Sistem **tidak** memuat 1.063 daftar akun universitas umum yang tidak bersinggungan dengan aktivitas unit bisnis.
- Sistem menerapkan master akun operasional terkurasi (~65 akun kerja) yang mencakup:
  1. **Pendapatan Unit Bisnis (`420301xxxxxx`)**: Akun penerimaan komersial dari TCI (sertifikasi/pelatihan), IT Solution (IT Promise, hosting, lisensi software), Poliklinik (jasa dokter, tindakan gigi, laboratorium, penjualan obat), dan MICE (sewa wisma, sewa gedung, konsumsi).
  2. **Belanja Operasional Riil (27 Akun Belanja Tabel Kerja)**: Akun belanja yang secara aktif digunakan oleh PMO, meliputi Gaji Pokok PUT PK (`520101030100`), Uang Lembur PNS & Non-PNS (`520101050100` / `520101050200`), Uang Makan (`520101060200`), Pengadaan Obat-obatan (`520301030100`), Konsumsi & Habis Pakai Wisuda/Event (`510201010300` / `510201020300`), Jasa Tenaga Ahli IT (`520401020100`), Pemeliharaan Server/Aplikasi (`520901060100`), Biaya Promosi & Pemasaran (`520901080100`), serta belanja perjalanan dinas.
  3. **Posisi Keuangan & Aset Lancar/Kewajiban**: Kas kasir unit, kas kecil operasional / UMK (`110501010100`), rekening giro operasional Bank Mandiri & Bank BRI, piutang usaha (`110401010100`), utang usaha rekanan LS (`210101010100`), utang pajak PPN & PPh (`2102xxxxxx`), serta ekuitas modal kerja PMO (`310101010100`).

Penyederhanaan terarah ini menjaga performa dropdown transaksi pada modul pengadaan, faktur layanan, dan kasir tetap responsif, akurat, dan sesuai dengan format laporan pertanggungjawaban anggaran.

---

## 7. Batas Kendali Sistem & Kebijakan Operasional

1. **Batas Nilai Persetujuan PR ke GM PMO (`PR_GM_APPROVAL_LIMIT_IDR`)**: Ditetapkan pada angka **Rp 25.000.000**. Pengajuan PR di bawah batas ini cukup disetujui oleh `FINANCE_MANAGER`, sedangkan PR bernilai Rp 25.000.000 atau lebih wajib mendapatkan persetujuan lanjutan dari `GM_PMO`.
2. **Kewajiban Perbandingan Kuotasi Vendor (`MIN_VENDOR_QUOTATIONS`)**: Pengadaan barang/jasa kompetitif mewajibkan minimal **3 penawaran harga rekanan**. Jika jumlah penawaran kurang dari 3 (seperti kasus penunjukan langsung, agen tunggal, atau kebutuhan darurat), pemohon wajib mengisi alasan pengecualian resmi (`quotationExceptionReason`) yang dicatat permanen dalam jejak audit.
3. **Ambang Batas Toleransi Selisih Kasir (`CASHIER_DISCREPANCY_THRESHOLD_IDR`)**: Ditetapkan sebesar **Rp 50.000**. Apabila perhitungan fisik kas saat penutupan shift kasir memiliki selisih di atas nilai ambang ini, status sesi berubah menjadi `CLOSING_SUBMITTED` dan sistem otomatis mengirimkan permintaan persetujuan berita acara selisih ke `FINANCE_MANAGER`.
4. **Metode Penyusutan Aset**: Seluruh aset tetap disusutkan menggunakan metode garis lurus (*straight-line method*) dengan penetapan masa manfaat ekonomis dan nilai residu saat pendaftaran awal aset.

---

## 8. Integrasi Manajemen Proyek & Dokumentasi Kerja

Aktivitas perancangan teknis dan implementasi fitur terpantau secara transparan pada ekosistem kerja berikut:

- **Jira Cloud**: `https://itsolutionpmoutama.atlassian.net` (Project Key: **`KOI`** - *PMO Finance ERP*)
  - Seluruh alur pengerjaan diturunkan ke dalam 11 Epic dan 64 User Stories/Tasks pada Board Aktif dan Timeline Sprint terstruktur.
- **Confluence Docs Hub**: `https://itsolutionpmoutama.atlassian.net/wiki/spaces/PMO` (Space Key: **`PMO`** - *PMO Finance ERP Documentation*)
  - Berisi dokumentasi alur bisnis berformat naratif, spesifikasi arsitektur dual-layer PMO vs PBI UT, kamus data entitas, dan panduan operasional pengguna.
