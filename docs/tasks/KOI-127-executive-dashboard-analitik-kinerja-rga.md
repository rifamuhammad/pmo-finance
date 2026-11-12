# KOI-127: [PMO-151] Executive Dashboard & Analitik Kinerja RGA Real-Time Serapan Anggaran

## 1. Latar Belakang & Urgensi Bisnis
Sebagai unit kerja pengelola bisnis komersial di lingkungan Universitas Terbuka (PTNBH), pimpinan PMO UTama (General Manager, Finance Manager, dan para Manajer Unit Bisnis) memerlukan instrumen monitoring eksekutif terpadu untuk memantau **Rencana Kerja & Anggaran (RGA)** secara real-time.

Sesuai Peraturan Rektor No. 310 Tahun 2025 dan skema penganggaran *Semula - Menjadi* (Revisi RGA), pemantauan keuangan tidak cukup hanya melihat nominal kas yang masuk, melainkan wajib menghubungkan:
1. **Target Pendapatan RGA (*Revenue Target*):** Target pendapatan komersial tahunan yang diamanatkan universitas pusat dibandingkan realisasi faktur penjualan (*invoiced revenue*) dan kas masuk riil (*confirmed cash*).
2. **Pergeseran Pagu Anggaran (*Semula ➔ Menjadi*):** Pagu awal alokasi SK Rektor (*Semula*), besaran pergeseran anggaran antar-mata anggaran/unit (*Pergeseran*), dan pagu definitif belanja yang berlaku saat ini (*Menjadi*).
3. **Kinerja 5 Unit Bisnis PMO:** Daya serap pagu (*budget absorption rate*) dan kontribusi laba/rugi marjin operasional 5 unit resmi (Pusat Pelatihan & Sertifikasi `BU-DIKLAT`, Taman Cerita Indonesia `BU-TCI`, Pusat Konvensi & Acara `BU-MICE`, Wirausaha & Retail `BU-WIRA`, dan IT Solution `BU-ITS`).
4. **Laju Serapan Bulanan (*Monthly Burn Rate*) & Prognosis:** Mengestimasi kecepatan konsumsi anggaran per bulan serta memproyeksikan persentase daya serap di akhir tahun fiskal agar tidak terjadi deviasi serapan ekstrem (baik *underspending* maupun *overbudgeting*).

---

## 2. Lokasi Menu & Fitur yang Berubah
* **Modul Frontend:**
  * **Menu:** Dashboard Utama (`/dashboard` / `/`) ([`DashboardView.vue`](file:///Users/syahbintang/PmoFinance/apps/web/src/modules/DashboardView.vue))
  * **Penyajian Baru:**
    * **Panel Analitik Kinerja RGA & Pagu Semula-Menjadi:**
      - Header: Badge `RGA & PERGESERAN ANGGARAN (PERTORS 310)`, indikator Laju Serapan Bulanan (*Burn Rate*), dan Proyeksi Serapan Akhir Tahun.
      - 4 Kartu Metrik RGA: Target Pendapatan RGA (% Capaian Realisasi Faktur), Pagu Anggaran Semula (SK Rektor Awal), Pergeseran Anggaran (+/- Deviasi %), dan Pagu Anggaran Menjadi (Daya Serap Riil + PO).
    * **Kartu Kinerja 5 Unit Bisnis PMO:**
      - Menggantikan tampilan 4 divisi lama menjadi 5 unit bisnis resmi PMO UTama (`BU-DIKLAT`, `BU-TCI`, `BU-MICE`, `BU-WIRA`, `BU-ITS`).
      - Menampilkan progress bar serapan, pendapatan faktur, target pendapatan RGA unit, dan persentase ketercapaian target.
* **Modul Backend & Reporting Service:**
  * **File Router:** `apps/api/src/modules/reports/routes.ts` (`GET /api/v1/reports/dashboard`)
  * **Enhancement:**
    - Agregasi `totalRevenueTarget` dari seluruh data RGA unit bisnis.
    - Agregasi pergeseran `totalBudgetSemula`, `totalBudgetPergeseran`, dan `totalBudgetMenjadi` dari data baris anggaran (`BudgetLine`).
    - Penghitungan `monthlyBurnRate`, `projectedYearEndExpense`, dan `projectedAbsorptionRate`.
    - Objek terstruktur `rgaPerformance` dengan detail `unitBreakdown` untuk 5 unit bisnis PMO.
* **Automated Tests:**
  * `apps/api/src/tests/erp.test.ts` (Bagian 20: 3 uji integrasi analitik eksekutif RGA).

---

## 3. Matriks Hak Akses & Role yang Berwenang
| Role | Akses Buka Dashboard (`dashboard:view`) | Cakupan Data yang Ditampilkan | Wewenang Aksi Lanjutan |
| :--- | :---: | :---: | :---: |
| **GENERAL_MANAGER** | ✅ Ya | Konsolidasi Seluruh PMO & 5 Unit Bisnis | Evaluasi Strategis & Putusan Plafon |
| **FINANCE_MANAGER** | ✅ Ya | Konsolidasi Seluruh PMO & 5 Unit Bisnis | Verifikasi Anggaran, Kasir & Bank |
| **ACCOUNTING_STAFF**| ✅ Ya | Konsolidasi Seluruh PMO | Buku Besar & Jurnal Otomatis |
| **INTERNAL_AUDITOR** | ✅ Ya | Konsolidasi Seluruh PMO (Read-Only SPI) | Audit Kepatuhan & Jejak Mutasi |
| **UNIT_MANAGER** | ✅ Ya | Terisolasi otomatis ke Unit Bisnisnya | Monitoring Realisasi Unit Sendiri |

---

## 4. Langkah & Keputusan Teknis
1. **Agregasi Semula-Menjadi Anggaran:**
   - Menghitung $\text{Pagu Menjadi} = \text{Pagu Semula} + \text{Pergeseran}$ secara konsisten pada level baris anggaran (`BudgetLine`) maupun total konsolidasi.
   - Mengakomodasi dokumen anggaran dengan nilai awal `semulaAmount`, `pergeseranAmount`, dan `menjadiAmount`.
2. **Kalkulasi Laju Serapan (*Burn Rate*) & Prognosis:**
   - Menghitung rata-rata belanja aktual bulanan ($\text{Monthly Burn Rate} = \frac{\text{Total Beban Aktual}}{\text{Bulan Aktif}}$).
   - Memproyeksikan total serapan akhir tahun: $\text{Prognosis} = \text{Monthly Burn Rate} \times 12$.
   - Menghitung persentase prognosis terhadap total pagu alokasi menjadi.
3. **Penyelarasan 5 Unit Bisnis PMO:**
   - Menyertakan seluruh 5 unit bisnis komersial sesuai Master Data tanpa *hardcoded filter* atau pengecualian unit.

---

## 5. Data Riil & Angka Faktual
* **Unit Bisnis PMO Terpantau:**
  * `BU-DIKLAT`: Pusat Pelatihan & Sertifikasi PMO
  * `BU-TCI`: Taman Cerita Indonesia
  * `BU-MICE`: Pusat Konvensi & Penyelenggaraan Acara
  * `BU-WIRA`: Wirausaha & Retail Komersial
  * `BU-ITS`: IT Solution & Layanan Digital
* **Keseimbangan Formula Semula - Menjadi:**
  * $\text{Total Menjadi} = \text{Total Semula} + \text{Total Pergeseran}$ (Terbukti seimbang 100% pada suite pengujian).
* **Total Serapan Anggaran:**
  * $\text{Total Serapan} = \text{Komitmen PO} + \text{Aktual Beban}$.

---

## 6. Panduan Verifikasi QA / Boss
1. **Verifikasi Otomatis (Vitest Suite):**
   ```bash
   npm test
   ```
   *Ekspektasi:* Seluruh 66 dari 66 tes integrasi lolos 100%, termasuk 3 skenario Bagian 20 (`KOI-127`):
   - Uji metrik eksekutif RGA Target, Semula-Menjadi, dan Burn Rate.
   - Uji rincian kinerja 5 unit bisnis PMO.
   - Uji isolasi data dashboard per `businessUnitId`.

2. **Verifikasi Typecheck & Build:**
   ```bash
   npm --workspace=apps/api run typecheck
   npm --workspace=apps/web run typecheck
   npm --workspace=apps/web run build
   ```
   *Ekspektasi:* Exit code 0, 0 error, build produksi Vite selesai dalam ~3.6 detik.

3. **Verifikasi Antarmuka Web:**
   - Buka browser pada alamat `http://localhost:5173/dashboard`.
   - Lihat panel baru **Analitik Kinerja RGA & Pagu Semula - Menjadi**:
     - Cek Target Pendapatan RGA dan % realisasi faktur tercapai.
     - Cek Pagu Semula, Pergeseran (+/- deviasi), dan Pagu Menjadi.
     - Cek indikator Laju Serapan Bulanan (*Burn Rate*) dan Proyeksi Serapan Akhir Tahun.
   - Scroll ke kartu **Kinerja 5 Unit Bisnis PMO**:
     - Pastikan kelima unit bisnis (`BU-DIKLAT`, `BU-TCI`, `BU-MICE`, `BU-WIRA`, `BU-ITS`) terdaftar lengkap dengan target RGA unit dan persentase serapan masing-masing.

---

## 7. Tautan Branch, Commit & Dokumen Pendukung
* **Jira Key:** `KOI-127` (Subtask/Story dari Epic `KOI-122`)
* **Sprint:** Sprint 5 (`General Ledger, Jurnal Otomatis & 5 Lapkeu ISAK 335`)
* **Git Feature Branch:** `feature/KOI-127-executive-dashboard-analitik-kinerja-rga`
* **Pull Request Target:** `main`
