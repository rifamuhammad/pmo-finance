# 📖 Cerita Alur Fitur & Proses Bisnis PMO Finance ERP

> **Living Documentation:** Dokumen naratif perjalanan fitur sistem ERP Keuangan & Operasional Universitas Terbuka PTNBH — lugas, manusiawi, dan terhubung langsung dengan tiket Jira serta branch kerja GitHub.
> **Tautan Confluence Docs Hub:** [Kisah & Alur Fitur: Master Data Akuntansi & Unit Bisnis PMO](https://itsolutionpmoutama.atlassian.net/wiki/spaces/PMO/pages/2195565)

---

## 🏛️ 1. Latar Belakang: Mengapa PMO UTama Butuh Sistem Sendiri?

PMO UTama adalah unit bisnis komersial di bawah naungan **Universitas Terbuka yang berstatus PTN-BH (Perguruan Tinggi Negeri Badan Hukum)**. Sebagai PTNBH, UT memiliki otonomi bisnis untuk mengelola penerimaan mandiri non-akademik (*Revenue Generating Activities* / RGAs).

Kebutuhan nyata di lapangan:
- **Pemberantasan Selisih Rumus:** Pencatatan manual menggunakan spreadsheet rentan salah rumus, penomoran ganda, dan manipulasi tanggal transaksi.
- **Kepatuhan Regulasi Pertor 310:** Seluruh akun operasional wajib selaras dengan Bagan Akun Standar (BAS) universitas agar siap diaudit oleh Satuan Pengawas Internal (SPI) UT dan BPK RI.
- **Pemisahan Kewenangan (*Separation of Duties*):** Mencegah pemohon anggaran atau kasir menyetujui transaksi mereka sendiri.

---

## 🎯 2. Tiket KOI-80 (PMO-031): Strategi Master COA Operasional PMO (~70 Akun)

- **Status Jira:** `Done` (Approved oleh Boss Dell)
- **Branch GitHub:** `feature/KOI-80-injeksi-master-coa-pmo` *(Merged ke `main` - Commit `fdae0a0`)*
- **Dataset File:** `prisma/seeds/coa-pmo-official.json`

### Inti Keputusan Teknis
Sistem **tidak** memuat 1.063 akun umum universitas yang tidak relevan dengan aktivitas bisnis unit. Sebagai gantinya, diterapkan **70 Akun Operasional Terkurasi** yang bersumber dari:
1. `docs/KODE COA UT.xlsx`: 20 akun *Pendapatan Unit Bisnis* (`420301xxxxxx`) untuk TCI, IT Solution, Klinik Pratama, dan MICE.
2. `docs/Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx`: 27 akun *Belanja Operasional Riil* (Gaji PUT PK `520101030100`, lembur PNS/non-PNS, uang makan, obat klinik, konsumsi wisuda, tenaga ahli IT, pemeliharaan server, dan promosi unit).
3. Posisi Keuangan / Neraca: 23 akun esensial (Kas kasir, Bank Mandiri `110101020100`, Bank BRI `110101020200`, Piutang AR `110301010100`, UMK kas kecil `110501010100`, Utang AP LS `210101010100`, Utang Pajak PPN/PPh, serta Modal Kerja PMO `310101010100`).

---

## 🏢 3. Tiket KOI-84 (PMO-032): 5 Unit Bisnis, 12 Cost Center & Rekening Bank

- **Status Jira:** `In Review` (Subtask: `Testing`)
- **Branch GitHub:** `feature/KOI-84-setup-master-unit-bisnis-cost-center` *(Commit `95e3dfc`)*

### Struktur Organisasi & Cost Center
1. **`BU-ITS` (Divisi IT Solution - Revenue Center)**
   - Manager: Nadia Kusuma, S.Kom
   - `CC-ITS-01`: Software Engineering, Promise & Cloud Hosting
   - `CC-ITS-02`: IT Infrastructure, Security & Network Operations
   - Kasir: `REG-ITS-01`
   - Layanan: Lisensi Promise ERP (`420301040200`) & Cloud Managed Service (`420301040100`)
2. **`BU-KLINIK` (Divisi Klinik Pratama - Revenue Center)**
   - Manager: dr. Farida Rahmawati
   - `CC-KLN-01`: Poli Umum, Poli Gigi & Pelayanan Medis
   - `CC-KLN-02`: Instalasi Farmasi, Obat & Laboratorium
   - Kasir: `REG-KLN-01`
   - Layanan: MCU Eksekutif (`420301060400`) & Jasa Dokter/Obat (`420301060100`)
3. **`BU-MICE` (Divisi MICE & Wisma UT - Revenue Center)**
   - Manager: Bambang Hartono, SE
   - `CC-MICE-01`: Wisma UT, Penginapan & Front Desk
   - `CC-MICE-02`: Gedung Pertemuan, Ballroom UTCC & Audio Visual
   - `CC-MICE-03`: F&B, Jamuan Makan & Catering Acara
   - Kasir: `REG-MICE-01`
   - Layanan: Ballroom UTCC (`420301070202`) & Kamar Wisma Deluxe (`420301070201`)
4. **`BU-TCI` (Divisi Testing, Certification & Innovation - Revenue Center)**
   - Manager: Rendra Pratama, M.Kom
   - `CC-TCI-01`: Penyelenggaraan Workshop & Sertifikasi BNSP
   - `CC-TCI-02`: Infrastruktur Ujian Berbasis Komputer & Modul Digital
   - Kasir: `REG-TCI-01`
   - Layanan: Sertifikasi PMP (`420301010200`) & Kursus Tata Kelola (`420301010100`)
5. **`PMO-MGMT` (Operasional, Manajemen, Keuangan & Umum - Cost Center)**
   - Manager: Darmawan Setiadi
   - `CC-OPS-01`: Tata Usaha, Administrasi Kantor & SDM
   - `CC-OPS-02`: Akuntansi, Keuangan, Perpajakan & Kasir Terpusat
   - `CC-OPS-03`: Pengadaan Barang/Jasa & Manajemen Logistik
   - Kasir Pusat: `REG-HO-01`
   - Rekening Bank:
     - `BNK-MDR-01`: Bank Mandiri Kantor Kas UT (GL: `110101020100` - Operasional & Pengeluaran)
     - `BNK-BRI-01`: Bank BRI Kantor Kas UT (GL: `110101020200` - Penerimaan Komersial Unit)

---

## 🔒 4. Tiket KOI-87 (PMO-033): Skema Penguncian Periode Fiskal (Tutup Buku)

Untuk menjaga akuntabilitas angka dan mencegah mutasi tanggal mundur:
- **`OPEN`**: Seluruh transaksi berjalan normal di bulan aktif.
- **`LOCKED`**: Penguncian sementara saat tim accounting melakukan rekonsiliasi akhir bulan (transaksi operasional baru diblokir).
- **`CLOSED`**: Penguncian permanen setelah laporan dikirim ke Rektorat. Mutasi data otomatis ditolak (`409 FISCAL_PERIOD_CLOSED`).

---

## 📅 Tanggal Siklus Operasional Keuangan PMO:
- **Tanggal 20:** Cut-off registrasi aset tetap untuk perhitungan penyusutan.
- **Tanggal 25:** Penguncian presensi & lembur HRIS untuk pengajuan gaji PUT PK.
- **Tanggal 28:** Batas pengajuan SPJ Kas Kecil (GUP/TUP) ke Holding PBI & Puslakeu.
- **Tanggal Akhir Bulan:** Rekonsiliasi mutasi bank dan penutupan buku periode berjalan.
