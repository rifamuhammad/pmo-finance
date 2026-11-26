# Desain Modul Penerimaan PMO UTama (4 Unit Bisnis + PTNBH Tax Engine + Aging)

Tanggal: 2026-11-23
Referensi Lapangan: `/Users/syahbintang/Downloads/Penerimaan` (Data 2026 Jan-Nov, BKU, Perhitungan & Surat Penarikan Pajak Final, Tanda Terima, COA PMO per Unit 5 sheet v4)

## 1. Tujuan & Prinsip Desain
1. Menggantikan alur ratusan file Excel manual di PBI/PMO menjadi 1 modul Penerimaan terpadu yang langsung dieksekusi oleh **Tim Finance Penerimaan** (tanpa birokrasi request-approval berbelit).
2. Mendukung penuh **4 Unit Bisnis Operasional**:
   - **MICE** (Wisma 91 Kamar, UTCC, Ruang Sidang, Peralatan Event, Pujasera, Green Cafe, Green Laundry, Service Charge)
   - **Klinik** (Dokter Umum, Dokter Gigi, Lab, Tindakan Medis, Farmasi, Kapitasi BPJS & Mandiri Inhealth, MCU Korporasi)
   - **IT Solution** (Penjualan Aplikasi Promise, Server Management, Admin & Maintenance, Hosting Komersial)
   - **TCI** (Pelatihan PJJ & Digital, Pelatihan & Sertifikasi Tutor UT, Pekerti, Uji Kompetensi LSP P1, Kursus)
3. **Database terpisah & berelasi (`CustomerInvoice` 1 -> N `Payment`), UI Buku Harian menyatu:**
   - Menjaga akurasi Aging Piutang lintas bulan (misal Promise Udayana terbit Juni cair Agustus), status `HANGUS`, cicilan parsial, dan penerimaan langsung tanpa invoice (Kamar Wisma, Laundry, BPJS/Inhealth).
   - Di tampilan `Buku Harian`, `No. Kuitansi` dan `No. Invoice` tampil berdampingan dalam 1 baris dengan aksi cetak langsung.
4. **COA & Skema Pajak Fleksibel di Master Katalog:** 7 pos COA yang masih menunggu konfirmasi di file v4 dapat diubah kapan saja oleh Tim Finance lewat dropdown Master Katalog tanpa ubah kode program.
5. **Bahasa Desain:** Poital corporate light (`#f0f2f5` canvas, `20px` soft `.poital-card`, `#0b2144` / `#eff6ff` / `#fef9ed` / `#ffffff` KPI cards, rounded pills, angka tabular `.money`, minim teks, responsif penuh tanpa overflow).

## 2. Struktur 4 Tab di `/revenue` + Laporan Aging di `/reports`
1. **Tab 1: `Buku Harian`** (filter 4 Unit & Bulan, tombol `+ Catat Penerimaan Langsung`, `+ Import CSV`, 1 baris menyatukan No. Kuitansi + No. Invoice + Cetak Kuitansi / Kuitansi UM / Tanda Terima).
2. **Tab 2: `Invoice & Kontrak`** (Strip 4 kartu **Aging Piutang** interaktif `0-30h / 31-60h / 61-90h / >90h`, Invoice Cepat & Multi-Invoice per Kontrak/Kegiatan, Kalkulator 5 Skema Pajak PTNBH + Profil Pemungut `FP 040/020/030`, Diskon Sivitas UT, Status `HANGUS` / Terbit Ulang, Cetak Invoice `KU-003`, Catat Bayar dengan deteksi **Lebih Bayar / Pengembalian Dana** & **Bukti Potong**).
3. **Tab 3: `Perincian Pajak & BKU`** (Tabel 26-kolom Perincian + Pajak Bulanan, pengecualian otomatis transaksi FP 020/030 & Rekening Tampungan/Kelolaan, Pivot per COA, BKU + Pajak, Generator **Surat Penarikan Dana Pajak** cetak PDF + Export Excel `.xlsx` multi-sheet).
4. **Tab 4: `Katalog Tarif & Kasir`** (Master Tarif 4 Unit termasuk impor 92 item `Harga COA`, edit harga/COA/skema pajak langsung dari UI, Master Pelanggan dengan Profil Pemungut Pajak, Sesi Kasir Loket & Setoran ke Bank Mandiri Penerimaan).
5. **Modul `/reports` (`Laporan & Aging`):** Tab khusus **Aging Penerimaan (Umur Piutang)** per Pelanggan & per Unit Bisnis + Export Excel `.xlsx`.

## 3. Mesin Pajak PTNBH (5 Skema x 5 Profil Klien)
- `PB1_10` (Kamar Wisma): `DPP PB1 = 10/11 * Bruto`, `PB1 = round(10% * DPP PB1)`
- `PPN12_PMK131` (Sewa Alat, Service Charge, F&B/Laundry): `Nilai Jual = 100/111 * Bruto` (jika inclusive), `DPP PPN = 11/12 * Nilai Jual`, `PPN = round(12% * DPP PPN)`
- `PPN12_PPH4_2` (Sewa Gedung, UTCC, Ruang, Kios): `PPN12_PMK131` + `PPh 4(2) = round(10% * Nilai Jual)`
- `PPN12_PPH23` (Jasa TI Promise/Hosting, Pelatihan TCI, Jasa Katering): `PPN12_PMK131` + `PPh 23 = round(2% * Nilai Jual)`
- `BEBAS_PAJAK` (Klinik Rawat Jalan, Lab, Kapitasi BPJS/Inhealth): `Pajak = 0`

Profil Pemungut:
- `FP_040_UMUM`: Klien bayar Bruto; seluruh pajak disetor UT (masuk Surat Penarikan Pajak).
- `FP_020_INSTANSI`: Instansi/PTN potong & setor PPN + PPh sendiri; UT terima Neto + Bukti Potong (tidak masuk Surat Penarikan Pajak).
- `FP_030_BUMN`: BUMN potong PPN; PPh tergantung kesepakatan; UT terima Neto + Bukti Potong.
- `BADAN_POTONG_PPH`: Klien bayar PPN ke UT, tapi potong PPh 4(2) / PPh 23 sendiri + Bukti Potong.
- `INTERNAL_UT`: Satker PPK UT (mendukung Diskon Sivitas UT & cetak Tanda Terima).
