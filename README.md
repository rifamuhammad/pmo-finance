# ERP Keuangan & Operasional PMO UTama

Aplikasi Enterprise Resource Planning (ERP) Keuangan dan Operasional untuk **PMO UTama** yang mengintegrasikan seluruh siklus perencanaan modal, anggaran unit, pengadaan barang/jasa (PR, kuotasi, PO, penerimaan, 3-way matching), pengeluaran biaya, pesanan pelanggan, faktur, pembayaran idempoten, kasir shift closeout, rekonsiliasi mutasi bank, akuntansi double-entry otomatis, perpajakan, aset tetap, pelaporan konsolidasi, serta evaluasi strategis periode berikutnya.

> **Pernyataan Lingkungan Data Demo:** Seluruh data awal yang disertakan melalui skrip seed diberi penanda eksplisit `[DATA DEMO]` dan dirancang khusus untuk pengujian fungsional, simulasi alur persetujuan, serta audit internal.

---

## 1. Arsitektur & Tumpukan Teknologi

- **Frontend (`apps/web`)**: Vue.js 3 (Composition API + `<script setup>`), TypeScript, Pinia, Vue Router 4, Vite 5.
- **Backend (`apps/api`)**: Node.js, Express.js, TypeScript, Zod (validasi skema), Prisma ORM.
- **Database**: PostgreSQL 15+ dengan tipe presisi `DECIMAL(18,2)` untuk seluruh kolom moneter dan aritmatika sen berbasis `BigInt` (`apps/api/src/shared/decimal.ts`).
- **Pengujian Otomatis**: Vitest + Supertest (`apps/api/src/tests/erp.test.ts`).

### Struktur Monorepo

```text
/
├── CONTRIBUTING.md                 # Aturan kerja monorepo, strategi branching & anti-bentrok
├── DESIGN.md                       # Spesifikasi desain visual, kontras WCAG AA, dan tata letak responsif
├── docker-compose.yml              # Konfigurasi PostgreSQL lokal
├── .env.example                    # Contoh variabel lingkungan
├── docs/
│   ├── implementation-plan.md      # Rencana implementasi bertahap & keputusan arsitektur
│   ├── data-model.md               # Dokumentasi 35 entitas database, relasi, dan siklus status
│   └── api-conventions.md          # Standar kontrak REST API, RBAC, error envelope, dan idempotensi
├── prisma/
│   ├── schema.prisma               # Skema database PostgreSQL lengkap
│   ├── migrations/                 # File migrasi SQL standar
│   └── seed.ts                     # Data awal koheren untuk 9 peran dan 12 modul
└── apps/
    ├── api/                        # Backend Express + TypeScript + Vitest
    └── web/                        # Frontend Vue 3 + TypeScript + Vite
```

---

## 2. Prasyarat & Cara Menjalankan Secara Lokal

### Prasyarat
- **Node.js** >= 20.x dan **npm** >= 10.x
- **PostgreSQL** >= 15.x (berjalan secara lokal di port `5432` atau melalui `docker compose up -d`)

### Langkah Instalasi & Setup Database

1. **Salin konfigurasi environment:**
   ```bash
   cp .env.example .env
   ```
   Sesuaikan `DATABASE_URL` pada `.env` jika kredensial PostgreSQL lokal Anda berbeda.

2. **Instal seluruh dependensi monorepo:**
   ```bash
   npm install
   ```

3. **Generate Prisma Client & Terapkan Skema Database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Jalankan Seed Data Demo:**
   ```bash
   npm run db:seed
   ```

5. **Jalankan Server Backend & Frontend:**
   - Menjalankan keduanya secara paralel:
     ```bash
     npm run dev
     ```
   - Atau jalankan terpisah:
     - Backend API (`http://localhost:4000`): `npm --workspace=apps/api run dev`
     - Frontend Web (`http://localhost:5173`): `npm --workspace=apps/web run dev`

---

## 3. Cara Menjalankan Pengujian & Build Produksi

- **Typecheck Seluruh Workspace (API + Web):**
  ```bash
  npm run typecheck
  ```
- **Build Produksi (API + Web):**
  ```bash
  npm run build
  ```
- **Jalankan Suite Pengujian Integrasi (20 Skenario End-to-End):**
  ```bash
  npm test
  ```

---

## 4. Akun Demo Berdasarkan Peran (Khusus Lingkungan Pengembangan)

> **Peringatan Keamanan:** Akun di bawah ini hanya untuk lingkungan pengembangan/simulasi lokal (`[DATA DEMO]`). Jangan gunakan kredensial ini pada lingkungan produksi.

Kata sandi bersama untuk seluruh akun demo: **`DemoErp!2026`**

| Peran (Role Code) | Email Login | Lingkup Unit Kerja | Wewenang Utama |
| :--- | :--- | :--- | :--- |
| `GM_PMO` | `gm@pmoutama.demo.id` | Seluruh Unit (Konsolidasi) | Persetujuan anggaran/revisi, PR >= Rp 25 Juta, keputusan evaluasi strategis |
| `FINANCE_MANAGER` | `finance@pmoutama.demo.id` | Seluruh Unit (Konsolidasi) | Persetujuan PR < Rp 25 Juta, persetujuan & pencairan pengeluaran, refund, rekonsiliasi bank |
| `UNIT_MANAGER` | `unit.diklat@pmoutama.demo.id` | `BU-DIKLAT` | Menyusun anggaran unit, membuat PR, pengeluaran, pesanan pelanggan, dan menerbitkan invoice |
| `PROCUREMENT` | `procurement@pmoutama.demo.id` | Seluruh Unit | Mengelola vendor, perbandingan kuotasi (min. 3 vendor), penerbitan PO, penerimaan barang (GR), dan 3-way match faktur vendor |
| `ACCOUNTING` | `accounting@pmoutama.demo.id` | Seluruh Unit | Mengelola COA, jurnal umum berimbang, jurnal pembalik (reversal), buku besar, aset tetap, dan penutupan periode |
| `CASHIER` | `kasir@pmoutama.demo.id` | `BU-DIKLAT` | Membuka sesi kasir, menerima pembayaran pelanggan, menutup sesi kasir (closeout), dan mencatat setoran bank |
| `TAX_OFFICER` | `tax@pmoutama.demo.id` | Seluruh Unit | Mengelola konfigurasi tarif pajak (PPN/PPh) dan meninjau rekapitulasi pajak internal |
| `AUDITOR` | `auditor@pmoutama.demo.id` | Seluruh Unit | Akses baca penuh (Read-Only) ke seluruh transaksi, laporan, dan jejak audit trail tanpa hak ubah data |
| `SUPER_ADMIN` | `admin@pmoutama.demo.id` | Seluruh Unit | Mengelola pengguna, matriks role, unit bisnis, dan parameter sistem tanpa wewenang menyetujui transaksi keuangan |

---

## 5. Status Modul & Cakupan Implementasi

| Modul | Status | Ringkasan Fitur Terimplementasi |
| :--- | :--- | :--- |
| **1. Dashboard Eksekutif & Operasional** | **Selesai & Diuji** | KPI hierarkis (memisahkan pendapatan tertagih vs kas masuk terkonfirmasi), peringatan serapan anggaran, antrean approval, dan log audit terbaru |
| **2. Perencanaan Modal & Anggaran** | **Selesai & Diuji** | Penyusunan plafon per unit/cost center, pengajuan, persetujuan GM PMO (Separation of Duties), cadangan komitmen (`committedAmount`), dan riwayat revisi (`BudgetRevision`) |
| **3. Pengadaan & Vendor Management** | **Selesai & Diuji** | Master vendor (deteksi duplikasi NPWP & konflik kepentingan), PR terikat plafon anggaran, perbandingan minimal 3 kuotasi (atau alasan pengecualian wajib), PO, Goods Receipt parsial/penuh, dan 3-way matching faktur vendor |
| **4. Pengeluaran Kas & Operasional** | **Selesai & Diuji** | Pengajuan beban operasional/pelunasan vendor, verifikasi Finance Manager, pencairan yang memindahkan komitmen menjadi aktual, auto-posting jurnal, serta void/reversal terkendali |
| **5. Pelanggan, Layanan & Pesanan** | **Selesai & Diuji** | Master pelanggan & katalog produk/jasa dengan riwayat perubahan harga (`ProductPriceHistory`) yang menjaga harga historis pesanan lama, serta pelacakan penyelesaian layanan independen dari status lunas |
| **6. Penagihan, Pembayaran & Kasir** | **Selesai & Diuji** | Invoice pelanggan, pembayaran penuh/parsial idempoten (`idempotencyKey`), pencatatan potongan biaya payment gateway (`feeAmount`), webhook terverifikasi HMAC-SHA256, refund terkendali, sesi kasir buka/tutup dengan kontrol selisih fisik, dan setoran kas ke bank |
| **7. Manajemen Kas, Bank & Rekonsiliasi** | **Selesai & Diuji** | Daftar rekening bank/kas, pratinjau impor mutasi bank dengan deteksi duplikasi sidik jari `SHA-256`, pencocokan otomatis/manual, penanganan selisih (`EXCEPTION`), dan penguncian sesi final (`FINALIZED`) |
| **8. Akuntansi & Buku Besar** | **Selesai & Diuji** | Bagan Akun (COA), pemetaan akun otomatis, mesin jurnal berimbang (Debit = Kredit), larangan hapus jurnal terposting, jurnal pembalik (`Reversal`), Buku Besar, Neraca Saldo, dan Umur Piutang/Utang (AR/AP Aging) |
| **9. Pajak, Kepatuhan & Aset Tetap** | **Selesai & Diuji** | Konfigurasi tarif pajak dinamis (PPN 11%, PPh 23 2%), rekap PPN Keluaran vs Masukan, registrasi aset tetap beserta nilai buku, dan kunci periode fiskal (`CLOSED` / `REOPEN`) |
| **10. Pelaporan & Ekspor** | **Selesai & Diuji** | Laporan Laba Rugi, Neraca (seimbang), Arus Kas, Realisasi Anggaran vs Aktual per Cost Center, serta ekspor CSV dengan header metadata waktu & pengguna |
| **11. Evaluasi Strategis & Plafon Berikutnya** | **Selesai & Diuji** | Penyusunan dokumen evaluasi periode (target vs aktual, analisis selisih, risiko) dan alur keputusan GM PMO (`APPROVED` / `REVISION_REQUIRED` / `REJECTED`) untuk penetapan plafon periode berikutnya |
| **12. Administrasi, RBAC & Audit Trail** | **Selesai & Diuji** | Matriks 9 peran RBAC, Separation of Duties, jejak audit server-side (`AuditLog`), pusat notifikasi, parameter kebijakan sistem, dan validasi lampiran dokumen aman |

---

## 6. Keputusan Terdokumentasi untuk Konfirmasi Stakeholder

Sesuai Bagian 16 pada spesifikasi utama, keputusan konfigurasi berikut telah diterapkan secara fleksibel melalui tabel konfigurasi database dan dapat disesuaikan oleh manajemen PMO UTama tanpa mengubah kode sumber:

1. **Batas Eskalasi Persetujuan PR ke GM PMO (`PR_GM_APPROVAL_LIMIT_IDR`)**: Ditetapkan secara default sebesar **Rp 25.000.000**. PR di bawah nilai tersebut disetujui oleh `FINANCE_MANAGER`, sedangkan PR senilai Rp 25.000.000 ke atas memerlukan persetujuan `GM_PMO`.
2. **Jumlah Minimum Kuotasi Vendor (`MIN_VENDOR_QUOTATIONS`)**: Ditetapkan **3 penawaran vendor** untuk pengadaan kompetitif. Jika kurang dari 3 penawaran (misalnya distributor tunggal atau pengadaan darurat), sistem mewajibkan pengisian alasan pengecualian (`quotationExceptionReason`) yang tercatat pada Audit Trail.
3. **Ambang Batas Selisih Kasir (`CASHIER_DISCREPANCY_THRESHOLD_IDR`)**: Ditetapkan **Rp 50.000**. Penutupan kasir dengan selisih fisik melebihi ambang ini otomatis masuk ke status `CLOSING_SUBMITTED` dan membuat permintaan persetujuan berita acara ke `FINANCE_MANAGER`.
4. **Metode Penyusutan Aset Tetap**: Menggunakan metode garis lurus (*straight-line*) dengan umur ekonomis yang dapat ditentukan per aset saat registrasi.
