# MASTER PROMPT — ERP KEUANGAN & OPERASIONAL PMO UTAMA

> **Tujuan dokumen:** Prompt spesifikasi produk dan implementasi untuk coding agent (Codex, Cursor, Claude Code, atau agent sejenis). Gunakan dokumen ini sebagai sumber utama requirement saat merancang dan membangun aplikasi.
>
> **Nama kerja aplikasi:** ERP Keuangan & Operasional PMO UTama  
> **Bahasa UI utama:** Bahasa Indonesia  
> **Zona waktu:** Asia/Jakarta  
> **Format mata uang utama:** Rupiah (IDR)  
> **Stack wajib:** Vue.js 3 + TypeScript untuk frontend, Node.js + Express.js + TypeScript untuk backend, PostgreSQL untuk database, Prisma ORM.

---

# 1. PERAN AGENT DAN ATURAN KERJA

Anda adalah **Senior Product Engineer, System Analyst, UI/UX Designer, Backend Engineer, Frontend Engineer, dan QA Engineer** yang bertanggung jawab membangun aplikasi ERP keuangan dan operasional berbasis web.

Jangan hanya membuat desain statis atau mockup. Buat aplikasi yang dapat dijalankan, memiliki navigasi berfungsi, form tervalidasi, data persisten, alur bisnis saling terhubung, autentikasi dan hak akses, serta laporan yang dihitung berdasarkan data aplikasi.

## 1.1 Cara mulai bekerja

1. Periksa isi repository terlebih dahulu. Jika proyek telah memiliki struktur, dependensi, komponen, atau konvensi, pahami dan gunakan kembali bagian yang masih layak. Jangan menghapus pekerjaan yang sudah ada tanpa alasan kuat.
2. Jika repository kosong, buat struktur monorepo yang jelas, misalnya `apps/web` untuk Vue dan `apps/api` untuk Express, serta folder dokumentasi dan konfigurasi bersama bila diperlukan.
3. Buat dokumen ringkas `docs/implementation-plan.md`, `docs/data-model.md`, dan `docs/api-conventions.md` berdasarkan spesifikasi ini sebelum atau sambil mengimplementasikan sistem.
4. Implementasikan secara bertahap, tetapi setiap tahap harus menghasilkan fungsi yang dapat dijalankan dan diuji. Jangan berhenti setelah scaffold, layout kosong, atau halaman dashboard palsu.
5. Gunakan data contoh/seed yang ditandai secara eksplisit sebagai **data demo**, bukan data keuangan sungguhan.
6. Jangan mengarang kebijakan akuntansi, tarif pajak, atau kewenangan organisasi yang belum ditentukan. Buat konfigurasi yang dapat diubah dan cantumkan asumsi yang perlu dikonfirmasi.
7. Bila ada detail yang belum ditentukan, pilih default yang aman dan masuk akal, dokumentasikan asumsi tersebut, lalu lanjutkan implementasi. Jangan menghentikan seluruh pekerjaan hanya karena detail sekunder belum tersedia.
8. Jangan menampilkan tombol yang tidak berfungsi seolah-olah fitur sudah tersedia. Jika integrasi eksternal belum dikonfigurasi, sediakan status yang jelas, mode simulasi untuk data demo, serta petunjuk konfigurasi.
9. Hindari hardcode data bisnis ke komponen UI. Data operasional harus berasal dari API, kecuali untuk konfigurasi UI statis yang memang sesuai.
10. Setelah implementasi, jalankan lint, type-check, test, migration, dan build sesuai tool yang tersedia. Perbaiki error kritis sebelum menyatakan selesai.

## 1.2 Definisi keberhasilan

Aplikasi dinilai berhasil apabila pengguna dapat menjalankan alur bisnis dari perencanaan anggaran sampai pengadaan, pencatatan biaya, transaksi pelanggan, penerimaan pembayaran, rekonsiliasi, pelaporan, dan evaluasi. Semua perubahan penting harus dapat dilacak, dibatasi berdasarkan hak akses, dan tersimpan secara konsisten di database.

---

# 2. KONTEKS BISNIS DAN TUJUAN PRODUK

Bangun sebuah **ERP keuangan dan operasional terpadu** berdasarkan siklus proses berikut:

1. Perencanaan modal dan anggaran.
2. Pengadaan serta pembelanjaan operasional.
3. Pencatatan transaksi belanja.
4. Analisis anggaran dibanding realisasi biaya.
5. Transaksi dan pembayaran pelanggan.
6. Pelayanan, penagihan, closing kasir, dan setoran.
7. Pelaporan pendapatan serta rekonsiliasi penerimaan.
8. Konsolidasi kinerja keuangan.
9. Evaluasi strategis dan penetapan target/plafon periode berikutnya.

Hasil evaluasi pada tahap 9 menjadi masukan bagi siklus perencanaan berikutnya. Sistem harus menyatukan data pada setiap tahap, bukan menjadikan tiap tahap sebagai modul terpisah yang tidak memiliki hubungan data.

## 2.1 Sasaran bisnis

- Memberikan visibilitas atas anggaran, realisasi, kewajiban, dan saldo yang masih tersedia.
- Mengendalikan pengeluaran melalui pengajuan, pemeriksaan dokumen, dan approval sesuai kewenangan.
- Menyimpan bukti transaksi dan membuat jejak audit yang dapat ditelusuri.
- Menghubungkan pesanan, tagihan, pembayaran, penyerahan layanan, kasir, setoran, dan rekening bank.
- Mengurangi pencatatan ganda dan mempermudah rekonsiliasi.
- Menyediakan laporan keuangan, arus kas, profitabilitas unit, serta analisis anggaran untuk pengambilan keputusan.
- Menjaga pemisahan kewenangan agar pengguna tidak dapat menyetujui transaksi yang dibuatnya sendiri tanpa mekanisme pengecualian yang jelas.
- Menjadi dasar keputusan mengenai alokasi modal, cadangan kas, reinvestasi, dan plafon anggaran berikutnya.

## 2.2 Prinsip produk

- **Satu sumber data:** data transaksi yang sama dipakai oleh modul operasional dan pelaporan.
- **Traceability:** laporan dapat ditelusuri kembali ke transaksi sumber dan dokumen pendukung.
- **Least privilege:** pengguna hanya mendapatkan akses sesuai tugasnya.
- **Approval before execution:** transaksi yang memerlukan persetujuan tidak boleh dieksekusi sebelum disetujui.
- **Financial integrity:** nominal, saldo, jurnal, dan status transaksi harus konsisten.
- **Configurable policy:** approval limit, periode, kategori akun, target, dan aturan operasional dapat dikonfigurasi oleh pihak berwenang.
- **Progressive delivery:** bangun modul inti terlebih dahulu, tetapi desain datanya tidak menghalangi ekspansi.
- **Honest status:** status pembayaran, penagihan, rekonsiliasi, dan penyerahan layanan harus dibedakan.

---

# 3. STACK DAN ARSITEKTUR TEKNIS

## 3.1 Stack wajib

### Frontend
- Vue 3 dengan Composition API dan `<script setup>`.
- TypeScript dengan strict mode.
- Vite sebagai build tool.
- Vue Router untuk navigasi dan route guards.
- Pinia untuk state global yang memang dibutuhkan.
- Pilih **satu** pendekatan UI utama: PrimeVue dengan tema yang dikustomisasi, atau Tailwind CSS dengan komponen reusable. Hindari mencampur banyak design system tanpa alasan.
- Reusable chart library yang kompatibel dengan Vue untuk visualisasi dashboard.
- Library form validation yang konsisten, atau validasi terstruktur menggunakan schema.
- Gunakan komponen tabel yang mendukung sorting, filtering, pagination, dan empty/loading/error state.

### Backend
- Node.js LTS yang didukung oleh dependensi proyek.
- Express.js dengan TypeScript.
- Prisma ORM.
- PostgreSQL.
- Zod atau library schema validation setara untuk validasi request di server.
- OpenAPI/Swagger untuk dokumentasi API.
- Testing backend menggunakan Vitest/Jest atau stack test yang kompatibel dengan repository.

### Infrastruktur
- File dokumen disimpan di object storage privat atau penyimpanan privat yang aman; database menyimpan metadata dan referensi file.
- Gunakan Docker Compose untuk lingkungan pengembangan bila sesuai.
- Sediakan `.env.example`, health check, logging, backup strategy, dan instruksi setup.
- Jangan commit secret, token, credential, private key, atau data pribadi sungguhan.

## 3.2 Arsitektur yang disarankan

Gunakan **modular monolith** terlebih dahulu. Tidak perlu memecah layanan menjadi microservices pada tahap awal. Setiap modul memiliki batas tanggung jawab yang tegas.

Contoh struktur repository:

```text
pmo-erp/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── assets/
│   │       ├── components/
│   │       ├── layouts/
│   │       ├── modules/
│   │       ├── router/
│   │       ├── stores/
│   │       ├── composables/
│   │       ├── services/
│   │       ├── types/
│   │       └── utils/
│   └── api/
│       └── src/
│           ├── config/
│           ├── middleware/
│           ├── modules/
│           ├── shared/
│           ├── integrations/
│           ├── jobs/
│           ├── app.ts
│           └── server.ts
├── packages/                 # opsional untuk shared schemas/types
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

Jangan memaksakan struktur ini bila repository memiliki pola yang lebih baik. Yang penting, business logic tidak menumpuk di UI component atau Express route handler.

## 3.3 Pola backend

Untuk setiap modul, gunakan pembagian tanggung jawab:
- `routes`: deklarasi endpoint dan middleware.
- `controller`: parsing request dan response HTTP.
- `service`: aturan bisnis dan orkestrasi proses.
- `repository` atau data-access layer jika membantu memisahkan query.
- `schemas`: validasi input/output.
- `types`: tipe khusus modul bila diperlukan.
- `tests`: unit test dan integration test.

Gunakan satu standar respons API, pagination, error handling, dan format tanggal. Hindari query database langsung di controller dan hindari mengandalkan validasi frontend sebagai satu-satunya validasi.

## 3.4 Konvensi API

- Prefix API: `/api/v1`.
- JSON untuk request dan response kecuali upload/download file.
- Pagination daftar: `page`, `pageSize`, dan parameter filter/sort yang di-whitelist.
- Format error konsisten, contoh: `code`, `message`, `details`, `requestId`.
- Validasi semua parameter path, query, body, serta file upload di server.
- Terapkan `requestId`/correlation ID untuk membantu investigasi error.
- Gunakan HTTP status code secara tepat.
- Untuk operasi yang berpotensi dikirim ulang seperti pembayaran, posting jurnal, callback payment provider, dan impor transaksi, gunakan idempotency atau unique reference yang sesuai.
- Gunakan transaksi database untuk perubahan yang harus berhasil atau gagal bersama-sama.
- Jangan mengembalikan stack trace atau detail internal database ke pengguna.

---

# 4. DESAIN UI/UX — WAJIB MENJADI PRIORITAS

Rancang antarmuka sebagai **aplikasi enterprise finance modern**, bukan admin template generik dan bukan landing page pemasaran. Antarmuka harus profesional, tenang, rapi, mudah dipindai, dan nyaman digunakan berjam-jam oleh staf operasional serta keuangan.

## 4.1 Arah visual

Gunakan arah desain **Modern Finance Workspace**:
- Dominan light theme dengan latar abu-abu sangat muda atau off-white.
- Sidebar dan area navigasi menggunakan warna navy/charcoal yang elegan, bukan blok warna gelap besar di seluruh halaman.
- Warna aksen utama biru profesional; gunakan teal/hijau untuk status positif secara konsisten.
- Amber untuk status menunggu/peringatan; merah hanya untuk error, penolakan, atau kondisi kritis.
- Gunakan surface putih untuk panel, border tipis, radius sedang, dan shadow yang sangat halus.
- Hindari gradien berlebihan, neon, glassmorphism berat, dekorasi berlebihan, serta kartu yang seluruhnya penuh warna.
- Hindari terlalu banyak KPI card dengan ukuran sama. Prioritaskan hirarki informasi.
- Gunakan ikon dari satu library secara konsisten; ikon harus memperjelas makna, bukan sekadar dekorasi.
- Logo/brand harus dapat diganti melalui konfigurasi; jangan mengarang logo resmi institusi.

Palet awal yang boleh disesuaikan:
- Primary: navy/biru profesional.
- Accent: teal.
- Background: `#F6F8FB` atau padanan yang accessible.
- Surface: putih.
- Text primary: `#172033` atau warna gelap dengan kontras baik.
- Text secondary: abu-abu netral.
- Success: hijau.
- Warning: amber.
- Danger: merah.

Jangan mengejar palet persis bila design system komponen yang dipilih memiliki padanan lebih accessible. Buat token desain terpusat agar konsisten.

## 4.2 Layout utama

Desktop-first karena aplikasi dipakai untuk pekerjaan administrasi dan analisis, tetapi tetap responsif untuk tablet dan mobile.

### Sidebar kiri
- Brand dan nama aplikasi di area atas.
- Navigasi dikelompokkan menurut pekerjaan, bukan sekadar daftar modul teknis.
- Sidebar dapat collapse.
- Menu aktif terlihat jelas.
- Submenu hanya dibuka ketika diperlukan.
- Tampilkan menu berdasarkan hak akses pengguna.
- Bagian profil pengguna dan tombol logout di bagian bawah.

Usulan grup navigasi:
1. **Ringkasan** — Dashboard.
2. **Perencanaan** — Anggaran, revisi anggaran, target.
3. **Pengadaan & Biaya** — Permintaan pembelian, vendor, penawaran, PO, penerimaan barang, tagihan vendor, pengeluaran.
4. **Pendapatan** — Pelanggan, produk/layanan, pesanan, invoice, pembayaran.
5. **Kas & Bank** — Kasir, closing kasir, setoran, rekening, rekonsiliasi bank.
6. **Akuntansi** — Chart of Accounts, jurnal, buku besar, piutang, utang, aset.
7. **Laporan** — Anggaran vs realisasi, pendapatan, biaya, arus kas, laba rugi, neraca, laporan unit bisnis.
8. **Strategi** — Evaluasi periode, profitabilitas, target periode berikutnya.
9. **Administrasi** — Pengguna, role, unit bisnis, master data, approval policy, audit trail, konfigurasi.

Jangan tampilkan semua menu untuk semua role. Pengguna kasir, misalnya, tidak perlu melihat konfigurasi Chart of Accounts jika tidak berwenang.

### Header/top bar
- Breadcrumb sesuai halaman.
- Judul halaman yang jelas.
- Periode/tanggal aktif jika relevan.
- Filter unit bisnis jika pengguna memiliki akses lebih dari satu unit.
- Notifikasi untuk approval atau pekerjaan tertunda.
- Profil dan akses ke pengaturan akun.
- Search global hanya bila benar-benar diimplementasikan; jangan tampilkan search dekoratif.

### Area konten
- Judul dan deskripsi singkat halaman.
- Satu primary action yang jelas, misalnya **Buat Anggaran** atau **Ajukan Pembelian**.
- Filter dan tab ditempatkan konsisten.
- Tabel bisnis memiliki hirarki yang jelas, tidak terlalu padat, dan tetap memuat informasi penting.
- Detail transaksi menampilkan ringkasan, status, timeline, dokumen, approval, dan relasi ke transaksi lain.

## 4.3 Dashboard utama

Dashboard menyesuaikan role dan periode yang dipilih. Jangan menampilkan angka keuangan palsu seolah data produksi.

### Komponen yang disarankan
1. Header: sapaan singkat, tanggal, periode pelaporan, serta filter unit bisnis.
2. KPI utama:
   - Total anggaran periode.
   - Realisasi biaya.
   - Pendapatan terealisasi.
   - Arus kas bersih.
   - Sisa anggaran.
3. Chart anggaran vs aktual per kategori atau unit.
4. Tren pemasukan dan pengeluaran per bulan.
5. Status rekonsiliasi: cocok, belum cocok, atau memerlukan review.
6. Ringkasan piutang dan utang jatuh tempo.
7. Approval inbox: jumlah permintaan yang perlu ditinjau pengguna.
8. Aktivitas terbaru yang dapat dibuka ke detail transaksi.
9. Peringatan relevan: plafon mendekati habis, tagihan jatuh tempo, kasir belum ditutup, atau rekonsiliasi tertunda.

Aturan dashboard:
- Angka wajib dihitung dari API dan mengikuti periode/filter aktif.
- Semua KPI harus memiliki definisi yang konsisten dan dapat ditelusuri.
- Tooltip atau penjelasan singkat menjelaskan cara baca indikator yang berpotensi ambigu.
- Jika belum ada data, tampilkan empty state informatif dengan CTA yang relevan, bukan chart kosong atau angka nol yang menyesatkan.
- Gunakan format Rupiah, pemisah ribuan Indonesia, serta label tanggal yang mudah dimengerti.

## 4.4 Pola UI untuk halaman operasional

Gunakan pola yang konsisten di seluruh modul:
- Halaman daftar: judul, deskripsi singkat, primary CTA, search, filter, tabel, pagination, dan bulk action bila relevan.
- Halaman detail: identitas/nomor dokumen, status, nilai transaksi, ringkasan pihak terkait, timeline aktivitas, dokumen pendukung, dan tindakan berdasarkan hak akses/status.
- Form create/edit: dikelompokkan ke section yang logis, label eksplisit, helper text, validasi inline, ringkasan kesalahan, dan konfirmasi sebelum tindakan berdampak.
- Approval: tampilkan pemohon, ringkasan nilai, ketersediaan anggaran, dokumen, histori persetujuan, serta tombol setujui/tolak yang terpisah jelas. Penolakan wajib meminta alasan.
- Delete/cancel: gunakan konfirmasi dan alasan untuk transaksi yang telah direferensikan. Jangan menghapus transaksi keuangan yang sudah diposting; gunakan reversal/void sesuai kebijakan.
- Status: gunakan teks dan ikon/badge; jangan mengandalkan warna saja.
- Loading: skeleton atau indikator yang tidak menggeser layout secara berlebihan.
- Empty state: beri konteks dan CTA yang sesuai hak akses.
- Error state: beri pesan yang dapat ditindaklanjuti, tombol coba lagi bila relevan, dan jangan menampilkan stack trace.

## 4.5 Prinsip tabel data

Tabel merupakan komponen utama ERP. Pastikan:
- Header dan kolom sejajar serta mudah dipindai.
- Nominal rata kanan dan menggunakan format rupiah.
- Nomor dokumen, status, tanggal, pihak terkait, unit, dan nominal menjadi kolom utama sesuai konteks.
- Search, filter, sorting, pagination, reset filter, dan empty state bekerja.
- Filter dapat dipertahankan saat pengguna kembali dari halaman detail bila feasible.
- Aksi sekunder ditempatkan dalam menu konteks, bukan menumpuk tombol di setiap baris.
- Export hanya ditampilkan bila backend benar-benar mendukungnya dan akses pengguna mengizinkan.
- Tabel responsif melalui horizontal scroll yang terkontrol atau versi ringkas di layar kecil.
- Jika ada banyak data, pagination dilakukan di server, bukan mengambil seluruh tabel.

## 4.6 Aksesibilitas dan responsivitas

- Kontras warna harus dapat dibaca.
- Semua input punya label yang benar.
- Fokus keyboard terlihat.
- Dialog dapat dioperasikan dengan keyboard dan fokus tidak hilang secara tidak terduga.
- Hindari status hanya dengan warna.
- Ukuran target interaksi memadai.
- Gunakan semantic HTML.
- Layout tidak rusak pada lebar desktop, tablet, dan mobile.
- Hormati preferensi reduced motion bila menggunakan animasi.

## 4.7 Detail visual yang harus dihindari

- Semua komponen dibuat sebagai kartu berwarna dengan shadow tebal.
- Terlalu banyak angka besar, grafik, dan warna yang bersaing dalam satu layar.
- Teks kecil dan kolom tabel terlalu rapat.
- Tombol yang tampak aktif tetapi tidak melakukan apa pun.
- Badge untuk hampir semua jenis teks.
- Modal untuk form panjang yang seharusnya menjadi halaman tersendiri.
- Placeholder generik seperti “Lorem ipsum”.
- Data dummy yang tampil seperti data nyata tanpa penanda demo.
- Menyalin desain admin template secara mentah tanpa menyesuaikan hirarki informasi dan proses finance.

---

# 5. ROLE, PERMISSION, DAN PEMISAHAN KEWENANGAN

Buat Role-Based Access Control (RBAC) yang ditegakkan di backend. Menyembunyikan tombol di frontend saja tidak cukup.

Role awal yang dapat dikonfigurasi:

1. **Super Admin / System Administrator**
   - Mengelola konfigurasi teknis, pengguna, role, dan master data yang diizinkan.
   - Tidak otomatis berhak menyetujui atau mengubah transaksi keuangan.
2. **GM PMO**
   - Melihat dashboard strategis dan laporan konsolidasi.
   - Menyetujui anggaran/revisi dan keputusan strategis sesuai limit.
3. **Manager Unit Bisnis**
   - Membuat kebutuhan, memantau anggaran unit, mengajukan transaksi dan memvalidasi operasional.
4. **Procurement**
   - Mengelola vendor, penawaran, permintaan pembelian, PO, dan penerimaan barang sesuai kewenangan.
5. **Finance Manager**
   - Memverifikasi biaya, pembayaran, rekonsiliasi, dan laporan keuangan sesuai limit.
6. **Accounting**
   - Mengelola Chart of Accounts, jurnal, buku besar, penutupan periode, serta laporan akuntansi sesuai kewenangan.
7. **Tax Officer**
   - Mengelola informasi perpajakan dan dokumen terkait sesuai kewenangan.
8. **Cashier**
   - Menjalankan transaksi kasir, menerima pembayaran sesuai integrasi yang disediakan, menutup sesi, dan mencatat setoran.
9. **Auditor / Read-only**
   - Melihat data yang diizinkan serta audit trail, tanpa mengubah transaksi.
10. **Customer (opsional untuk fase berikutnya)**
   - Mengakses pesanan/tagihan/bukti pembayaran miliknya saja melalui portal pelanggan.

## 5.1 Granularitas akses

Izin setidaknya perlu mencakup:
- `view`, `create`, `update`, `submit`, `approve`, `reject`, `cancel`, `post`, `reconcile`, `export`, dan `manage` sesuai kebutuhan modul.
- Scope data dapat dibatasi berdasarkan unit bisnis atau entitas yang menjadi tanggung jawab pengguna.
- Approval limit dapat dibedakan berdasarkan nilai transaksi, kategori, atau unit bila dibutuhkan.
- Catat perubahan role/permission di audit trail.
- Pengguna tidak boleh menyetujui transaksi yang dibuatnya sendiri pada alur yang membutuhkan pemisahan tugas, kecuali ada aturan pengecualian eksplisit yang disetujui dan diaudit.
- Jangan percaya pada `role`, `userId`, `unitId`, atau nominal yang berasal dari frontend tanpa memvalidasinya di server.

---

# 6. DETAIL MODUL DAN FITUR BISNIS

## Modul 1 — Dashboard & Executive Overview

### Fitur
- Ringkasan anggaran, realisasi biaya, pendapatan, arus kas, sisa plafon, piutang, dan utang.
- Filter periode, unit bisnis, dan sumber dana sesuai hak akses.
- Grafik tren pendapatan dan biaya.
- Perbandingan anggaran vs aktual.
- Top kategori biaya dan ringkasan kinerja unit.
- Status rekonsiliasi kas/bank.
- Daftar approval tertunda.
- Tagihan mendekati jatuh tempo.
- Aktivitas terbaru yang punya tautan ke dokumen sumber.
- Export ringkasan sesuai izin.

### Aturan
- Tetapkan definisi KPI di dokumentasi.
- Pendapatan, penerimaan kas, laba, dan arus kas harus dibedakan.
- Jangan menghitung nilai yang belum dibayar sebagai kas diterima.
- Jangan menghitung transaksi yang dibatalkan/void sebagai realisasi aktif.

## Modul 2 — Perencanaan Modal & Anggaran

### Data/fungsi
- Periode anggaran: tahun, bulan, atau rentang khusus.
- Sumber dana: misalnya alokasi internal, penerimaan pelanggan, dan sumber lain yang disepakati.
- Unit bisnis dan cost center.
- Kategori: CAPEX, OPEX, modal kerja, pengadaan, kewajiban pegawai, pajak, dan kategori lain yang dapat diatur.
- Anggaran awal dan revisi.
- Target pendapatan dan plafon biaya.
- Pengajuan dan approval berjenjang.
- Alasan revisi dan histori versi.
- Status draft, submitted, approved, rejected, revised, closed.
- Perbandingan budget, committed, actual, dan available.

### Aturan bisnis
- Anggaran yang masih draft tidak boleh dipakai sebagai dasar persetujuan transaksi kecuali organisasi menetapkan pengecualian.
- Setelah disetujui, perubahan tidak menimpa histori sebelumnya; simpan versi/revisi.
- Perhitungan sisa anggaran harus mendefinisikan apakah reservation/commitment dikurangi sebelum pembayaran.
- Hindari double counting antara komitmen dan aktual.
- Cegah transaksi melebihi plafon atau arahkan ke approval khusus sesuai konfigurasi.
- Simpan sumber dana dan unit bisnis untuk transaksi yang memerlukan pelacakan tersebut.

## Modul 3 — Vendor Management

### Fitur
- Data vendor: nama/legal name, identitas, alamat, kontak, informasi pembayaran yang diizinkan, dokumen legalitas, status, kategori vendor.
- Pemeriksaan kelengkapan data vendor.
- Riwayat penawaran, PO, invoice, pembayaran, dan performa.
- Status draft, under review, active, inactive, blocked.
- Pencegahan duplikasi vendor berdasarkan kunci yang sesuai dan dapat dikonfigurasi.
- Catatan hasil evaluasi vendor.
- Pencatatan konflik kepentingan bila kebijakan organisasi mengharuskannya.

Jangan tampilkan data sensitif vendor kepada role yang tidak membutuhkannya.

## Modul 4 — Pengadaan & Purchase Order

### Flow
`Purchase Request → Approval kebutuhan/anggaran → Perbandingan penawaran → Vendor terpilih → Purchase Order → Penerimaan barang/jasa → Invoice vendor → Verifikasi → Pembayaran → Pencatatan biaya/jurnal`

### Fitur
- Purchase Request (PR) dengan item, jumlah, perkiraan harga, alasan bisnis, unit, cost center, kategori anggaran, lampiran.
- Approval PR berdasarkan anggaran dan limit.
- Minimal tiga penawaran dapat diwajibkan melalui konfigurasi, bukan hardcode universal. Jika penawaran kurang dari syarat, minta alasan pengecualian dan approval.
- Perbandingan vendor dengan harga, pajak, spesifikasi, delivery time, garansi, dan kelengkapan dokumen.
- Penentuan vendor dan alasan pemilihan.
- Nomor Purchase Order otomatis dan unik.
- PO menyimpan item, kuantitas, harga, diskon, pajak, total, jadwal, termin, vendor, dan dokumen.
- Partial delivery dan partial receipt bila dibutuhkan.
- Penerimaan barang/jasa mencatat kuantitas diterima, kondisi, tanggal, penerima, serta bukti.
- Pembandingan PO, penerimaan, dan invoice sebelum pembayaran.
- Status PR/PO/receipt/invoice terhubung dan memiliki timeline.

### Kontrol
- Vendor terpilih harus aktif kecuali ada persetujuan pengecualian.
- PO yang telah disetujui tidak diedit diam-diam. Gunakan revisi/versi atau pembatalan dengan alasan.
- Kuantitas invoice tidak boleh melebihi kuantitas yang dapat ditagihkan tanpa exception approval.
- Nomor PO dan nomor invoice vendor perlu perlindungan dari duplikasi sesuai lingkup vendor/periode.

## Modul 5 — Expense Management / Kas Keluar

### Fitur
- Form pengeluaran dengan tanggal transaksi, unit, kategori, sumber dana, metode pembayaran, penerima, vendor bila relevan, nominal, pajak, dan uraian.
- Upload nota, kuitansi, invoice, bukti pembayaran, dan dokumen pajak.
- Hubungan dengan PR/PO dan invoice vendor bila pengeluaran bersumber dari pengadaan.
- Pencatatan pengeluaran non-PO hanya sesuai kebijakan dan alur approval.
- Status draft, submitted, approved, payment scheduled, paid, rejected, cancelled/void.
- Pencatatan realisasi anggaran dan jurnal dengan aturan konsisten.
- Search/filter berdasarkan tanggal, unit, kategori, pembuat, status, dan nominal.
- Riwayat perubahan serta approval.

### Kontrol
- Transaksi paid/posted tidak dihapus secara langsung.
- Koreksi menggunakan reversal/void dengan otorisasi dan alasan.
- Bukti wajib ditentukan berdasarkan kategori dan nominal melalui konfigurasi.
- Cegah double submission dan double posting.

## Modul 6 — Customer, Produk/Layanan, Pesanan & Invoice

### Master pelanggan
- Nama/organisasi, identitas yang diperlukan, kontak, alamat, status, dan riwayat transaksi.
- Batasi data pribadi pada yang benar-benar dibutuhkan.

### Produk/layanan
- SKU/kode layanan, nama, kategori, deskripsi, harga, unit bisnis pemilik, status aktif, perlakuan pajak yang dapat dikonfigurasi, serta akun pendapatan terkait.
- Riwayat perubahan harga untuk menjaga jejak transaksi lama.

### Pesanan dan invoice
- Nomor order dan invoice unik.
- Item pesanan, kuantitas, harga, diskon, pajak sesuai konfigurasi, total, pelanggan, unit bisnis, tanggal, serta terms/jatuh tempo.
- Dukungan pembayaran penuh dan pembayaran parsial.
- Status: draft, confirmed, invoiced, partially paid, paid, overdue, cancelled, refunded sesuai kondisi.
- Catatan penyerahan produk/layanan dengan tanggal dan petugas.
- Dokumen invoice dapat dicetak/diunduh.
- Riwayat pengiriman invoice dan pengingat hanya jika mekanismenya benar-benar tersedia.

### Kontrol
- Invoice yang diterbitkan tidak diedit tanpa jejak. Lakukan credit note/revisi sesuai kebijakan.
- Refund harus merujuk pada pembayaran/pesanan asal.
- Status paid harus berdasarkan pembayaran yang terkonfirmasi, bukan tombol manual tanpa otorisasi.

## Modul 7 — Payment & Cashier

### Fitur pembayaran
- Catatan pembayaran dengan metode, tanggal, nominal, referensi unik, status, dan hubungan ke invoice/order.
- Tunai, transfer bank, QRIS, EDC, kartu, atau payment gateway hanya sesuai integrasi yang benar-benar dikonfigurasi.
- Pembayaran penuh dan parsial.
- Biaya provider/merchant fee dapat dicatat terpisah agar pendapatan bruto tidak tertukar dengan penerimaan bersih.
- Bukti pembayaran atau kuitansi dengan nomor unik.
- Status pending, confirmed, failed, reversed, refunded.
- Callback/webhook payment gateway harus diverifikasi dan diproses idempotent.

### Sesi kasir
- Open session: petugas, tanggal, kas/register, saldo awal, dan unit.
- Pencatatan pembayaran tunai dan transaksi lain yang diizinkan.
- Pengeluaran petty cash hanya bila kebijakan memperbolehkannya dan memiliki approval.
- Close session: saldo teoritis, hitung fisik, selisih, alasan, petugas, pemeriksa, dan waktu closing.
- Berita acara/rekap penutupan kasir.
- Setoran uang ke bank dengan rekening tujuan, tanggal, nominal, dan bukti.
- Dukungan penutupan yang memerlukan persetujuan supervisor apabila ada selisih melebihi ambang.

### Aturan
- Kasir tidak boleh mengubah transaksi yang sudah dikonfirmasi tanpa flow reversal/refund.
- Pembayaran tidak boleh diproses dua kali karena retry request atau webhook berulang.
- Status transaksi pelanggan berbeda dengan status layanan selesai.

## Modul 8 — Bank & Reconciliation

### Fitur
- Master rekening bank/kas, dengan akses terbatas pada informasi sensitif.
- Impor mutasi rekening dari CSV/XLSX menggunakan parser yang aman, mapping kolom, preview, dan validasi sebelum commit.
- Pencocokan berdasarkan nominal, tanggal, reference number, serta kriteria yang dapat dikonfigurasi.
- Saran pencocokan otomatis; pengguna berwenang mengonfirmasi hasil.
- Matching one-to-one dan penanganan transaksi yang memerlukan kombinasi/partial match jika diperlukan.
- Status matched, unmatched, needs review, ignored/exception.
- Catatan selisih dan alasan exception.
- Deteksi transaksi impor ganda dengan fingerprint/reference yang relevan.
- Laporan rekonsiliasi per rekening dan periode.
- Histori siapa yang mengimpor dan menyelesaikan rekonsiliasi.

### Aturan
- Impor file harus melalui preview dan validasi sebelum masuk menjadi data final.
- Jangan otomatis menganggap transaksi bank sebagai pendapatan atau beban tanpa pemetaan dan review yang benar.
- Item yang sudah direkonsiliasi tidak boleh berubah tanpa proses pembukaan ulang yang tercatat.

## Modul 9 — Accounting: COA, Jurnal, Buku Besar

Modul ini menjadi fondasi laporan keuangan formal. Jangan mengklaim laporan sudah memenuhi standar akuntansi tertentu tanpa konfigurasi, proses, dan review yang sesuai.

### Fitur minimum
- Chart of Accounts (COA): kode akun, nama, tipe akun, parent account, status aktif, dan konfigurasi akun kontrol.
- Tipe akun: aset, liabilitas, ekuitas, pendapatan, beban, serta subkategori sesuai kebijakan akuntansi.
- General journal dengan tanggal, periode, deskripsi, referensi sumber, baris debit/kredit, unit/cost center bila diperlukan, dan lampiran.
- Jurnal harus seimbang: total debit sama dengan total kredit.
- Jurnal draft, submitted, approved/posted, reversed.
- Posting journal dari transaksi sumber melalui service backend agar tidak membuat jurnal ganda.
- General ledger per akun dan periode.
- Trial balance.
- Period closing dan kontrol pembukuan periode tertutup.
- Reversal journal untuk koreksi setelah posting.
- Link dari baris jurnal ke dokumen sumber (invoice, payment, expense, asset, dan lainnya).

### Kontrol akuntansi
- Nominal uang tidak diproses menggunakan floating-point biasa untuk perhitungan finansial. Gunakan decimal yang tepat di database dan library aritmetika yang sesuai.
- Tentukan presisi desimal dan aturan pembulatan secara konsisten.
- Tidak boleh mengedit atau menghapus jurnal yang telah diposting secara diam-diam.
- Pembukaan kembali periode memerlukan role dan alasan yang berwenang.
- Hindari membuat jurnal otomatis tanpa mapping akun yang telah disetujui.
- Posting harus idempotent berdasarkan sumber dan jenis event.

## Modul 10 — Piutang, Utang & Aset

### Accounts Receivable (AR)
- Daftar invoice belum lunas, pembayaran parsial, due date, saldo, umur piutang, dan reminder/status tindak lanjut.
- Aging bucket dapat dikonfigurasi, misalnya belum jatuh tempo, 1–30 hari, 31–60, 61–90, dan lebih dari 90 hari.
- Laporan saldo piutang per pelanggan dan unit bisnis.

### Accounts Payable (AP)
- Invoice vendor, due date, sisa tagihan, jadwal pembayaran, aging, dan laporan utang.
- Pencegahan invoice vendor ganda.
- Approval jadwal pembayaran sesuai kebijakan.

### Fixed assets (fase sesuai prioritas)
- Registrasi aset, kode aset, kategori, tanggal perolehan, nilai perolehan, umur manfaat, lokasi/unit, status, dan dokumen.
- Metode penyusutan harus dapat dikonfigurasi dan disetujui bagian akuntansi.
- Perhitungan penyusutan dan jurnal terkait hanya diaktifkan setelah kebijakan disahkan.
- Pelepasan aset memiliki workflow dan histori.

## Modul 11 — Tax & Compliance

### Fitur
- Master konfigurasi jenis pajak dan tarif dengan tanggal berlaku serta versi.
- Simpan kategori pajak dari produk/transaksi bila diperlukan.
- Data pendukung PPh/PPN dan dokumen terkait sesuai alur yang disetujui bagian keuangan/pajak.
- Rekap transaksi pajak per periode, vendor/pelanggan, dan unit.
- Status kelengkapan dokumen, tenggat internal, serta checklist review.
- Upload dokumen dan referensi dokumen eksternal.
- Export data untuk proses pelaporan lanjutan jika dibutuhkan.

### Batasan wajib
- Jangan hardcode tarif atau batas waktu pajak sebagai aturan permanen.
- Jangan mengklaim aplikasi otomatis memenuhi kewajiban pajak/hukum Indonesia tanpa verifikasi aturan berlaku oleh pihak yang berwenang.
- Sistem adalah sarana pencatatan dan kontrol; validitas pelaporan akhir tetap mengikuti review petugas yang berwenang dan aturan yang berlaku.

## Modul 12 — Laporan & Evaluasi Strategis

### Laporan operasional
- Budget vs Actual per kategori, unit, periode, dan sumber dana.
- Purchase request/PO dan statusnya.
- Pengeluaran per kategori/vendor/unit.
- Pendapatan per layanan/produk/unit/metode pembayaran.
- Rekap kasir dan setoran.
- Rekonsiliasi bank.
- Aging AR/AP.

### Laporan keuangan
- General ledger.
- Trial balance.
- Laporan laba rugi.
- Neraca.
- Arus kas.
- Ringkasan posisi kas dan bank.
- Margin/profitabilitas per unit jika alokasi biaya yang dibutuhkan tersedia.

### Evaluasi strategis
- Tren pendapatan, biaya, kas, dan margin.
- Perbandingan target terhadap realisasi.
- Analisis selisih anggaran dan penjelasan yang dapat ditambahkan pengguna.
- Daftar risiko: biaya melebihi plafon, piutang terlambat, vendor belum dibayar, rekonsiliasi menggantung, kasir berselisih, serta dokumen kurang.
- Draft usulan anggaran periode berikutnya berdasarkan data historis. Rekomendasi bersifat alat bantu dan harus ditinjau manusia, bukan keputusan otomatis.
- Keputusan GM: disetujui, ditolak, atau revisi dengan alasan, target, dan plafon periode selanjutnya.

### Export
- Sediakan export CSV/XLSX/PDF secara bertahap sesuai library dan kebutuhan.
- File export harus menghormati filter dan permission yang sama dengan halaman sumber.
- Beri timestamp, periode, filter, dan status data pada laporan.
- Jangan menyediakan export berisi data sensitif tanpa izin.

---

# 7. ALUR KERJA END-TO-END DAN STATUS TRANSAKSI

Buat state transition yang eksplisit pada backend. Jangan menerima perubahan status bebas dari frontend. Setiap perpindahan status memiliki aturan, role yang berwenang, dan log audit.

## 7.1 Anggaran
`Draft → Submitted → Approved / Rejected → Revised (bila diperlukan) → Closed`

- Pengaju hanya dapat mengubah draft miliknya atau sesuai kewenangan.
- Approval menyimpan aktor, waktu, keputusan, komentar, dan versi anggaran.
- Anggaran tertutup tidak dipakai untuk transaksi baru kecuali ada kebijakan yang eksplisit.

## 7.2 Procurement
`Draft PR → Submitted → Approved / Rejected → Quotation Review → PO Draft → PO Approved → Partially Received / Received → Invoice Verification → Payment Approved → Paid / Closed`

- Tahap quotation dapat disesuaikan bila kebijakan pengadaan berbeda.
- Penerimaan parsial harus didukung jika operasional membutuhkannya.
- Pembatalan memerlukan alasan dan mempertimbangkan apakah sudah ada receipt, invoice, atau pembayaran.

## 7.3 Pengeluaran
`Draft → Submitted → Approved / Rejected → Scheduled → Paid → Posted`

Jika transaksi tidak perlu pembayaran setelah dicatat, sesuaikan flow dengan kebijakan, tetapi tetap bedakan approval, pembayaran, dan posting akuntansi.

## 7.4 Pendapatan dan invoice pelanggan
`Order Draft → Confirmed → Invoiced → Partially Paid / Paid → Service Delivered → Closed`

Pembatalan dan refund harus memiliki flow khusus yang menautkan transaksi asal dan tidak menghilangkan histori.

## 7.5 Pembayaran
`Pending → Confirmed` atau `Pending → Failed`; transaksi yang dikembalikan mengikuti `Reversed / Refunded` melalui proses yang tervalidasi.

Jangan mengubah payment yang telah confirmed menjadi failed hanya dengan update field. Gunakan event pembalikan/refund dan koreksi jurnal yang sesuai.

## 7.6 Kasir
`Not Opened → Open → Closing Submitted → Reviewed/Approved → Closed`

- Closing berisi saldo teoritis, saldo aktual, selisih, catatan, dan persetujuan jika dibutuhkan.
- Sesi kasir yang telah closed tidak dapat diubah tanpa alur reopening yang tercatat.

## 7.7 Rekonsiliasi bank
`Draft/Imported → Matching → Needs Review / Matched → Approved/Finalized`

Baris yang sudah difinalisasi hanya dapat diperbaiki melalui proses yang diaudit.

## 7.8 Jurnal dan periode
`Draft → Submitted → Approved/Posted → Reversed`

Jurnal posted tidak diedit/hapus langsung. Periode tertutup memerlukan prosedur resmi untuk reopen.

---

# 8. MODEL DATA / ENTITAS UTAMA

Rancang ERD yang benar, normalisasi relasi, index yang masuk akal, constraint database, dan field audit. Nama di bawah ini adalah konsep; sesuaikan naming ke konvensi proyek.

## 8.1 Identitas & organisasi
- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `BusinessUnit`
- `CostCenter`
- `FiscalPeriod`
- `ApprovalPolicy`
- `ApprovalRequest` / `ApprovalStep`
- `AuditLog`
- `Notification`

## 8.2 Anggaran
- `FundSource`
- `Budget`
- `BudgetLine`
- `BudgetRevision`
- `BudgetCommitment`
- `BudgetActual` atau mekanisme agregasi yang sumber datanya jelas
- `BudgetApproval`

Hindari menyimpan agregat yang mudah berbeda dengan transaksi sumber tanpa strategi sinkronisasi yang jelas. Jelaskan mana data sumber dan mana materialized/derived data.

## 8.3 Pengadaan dan biaya
- `Vendor`
- `VendorDocument`
- `PurchaseRequest`
- `PurchaseRequestLine`
- `VendorQuotation`
- `VendorQuotationLine`
- `PurchaseOrder`
- `PurchaseOrderLine`
- `GoodsReceipt`
- `GoodsReceiptLine`
- `VendorInvoice`
- `Expense`
- `ExpenseAttachment`
- `PaymentDisbursement`

## 8.4 Pendapatan dan penerimaan
- `Customer`
- `ProductService`
- `SalesOrder`
- `SalesOrderLine`
- `CustomerInvoice`
- `CustomerInvoiceLine`
- `Payment`
- `PaymentAllocation`
- `Refund`
- `ServiceDelivery`
- `ReceiptDocument`

## 8.5 Kasir dan bank
- `CashRegister`
- `CashierSession`
- `CashierTransaction`
- `CashierCloseout`
- `CashDeposit`
- `BankAccount`
- `BankStatementImport`
- `BankStatementLine`
- `ReconciliationSession`
- `ReconciliationMatch`

## 8.6 Akuntansi
- `ChartOfAccount`
- `JournalEntry`
- `JournalLine`
- `AccountingPeriod`
- `AccountMapping`
- `FixedAsset` dan tabel depresiasi bila modul aset diaktifkan

## 8.7 Pajak, dokumen, dan integrasi
- `TaxConfiguration` / `TaxRateVersion`
- `TaxDocument`
- `FileAttachment`
- `IntegrationConfiguration` (tanpa menyimpan secret dalam bentuk plaintext)
- `WebhookEvent` atau tabel pemrosesan event yang idempotent
- `SystemSetting`

## 8.8 Field audit minimal
Untuk entity bisnis yang relevan, sediakan:
- ID yang stabil, idealnya UUID.
- `createdAt`, `createdBy`.
- `updatedAt`, `updatedBy` bila dapat berubah.
- Status yang dibatasi.
- Reference number unik sesuai kebutuhan.
- `submittedAt`, `approvedAt`, `postedAt`, atau timestamp proses terkait bila relevan.
- Alasan rejection/cancellation/reversal bila relevan.
- Soft delete hanya untuk master data yang aman diarsipkan. Jangan memakai soft delete sebagai cara menghilangkan transaksi keuangan yang sudah diposting.

Gunakan foreign key dan unique constraint yang tepat. Terapkan Decimal untuk nominal, bukan float/double. Buat index pada kolom yang sering digunakan untuk filter, lookup, dan join.

---

# 9. VALIDASI, KONSISTENSI KEUANGAN, DAN KONTROL DATA

Berikut kontrol yang wajib diimplementasikan:

1. Nominal tidak boleh negatif kecuali jenis transaksi dan aturan bisnis memang mengizinkan secara eksplisit.
2. Semua kalkulasi nominal dilakukan dengan decimal/presisi yang konsisten.
3. Total baris invoice/PO harus konsisten dengan subtotal, diskon, pajak, dan total akhir sesuai urutan kalkulasi yang terdokumentasi.
4. Jurnal akuntansi wajib balance sebelum posting.
5. Nomor dokumen kritis harus unik.
6. Transaksi yang memerlukan approval tidak dapat diproses oleh role yang tidak berwenang.
7. Anggaran dicek kembali di backend saat approval/commitment dilakukan untuk mencegah race condition dan overspending.
8. Payment gateway callback harus diverifikasi; jangan mengandalkan payload yang tidak terverifikasi dari client.
9. Callback, retry, dan proses posting harus idempotent.
10. Import mutasi bank mempunyai preview, validasi, deteksi duplikasi, dan ringkasan error per baris.
11. Dokumen wajib diverifikasi jenis file, ukuran, MIME, ekstensi, dan isi bila memungkinkan. Jangan menyimpan file upload dengan nama path dari pengguna.
12. Semua download file harus mengecek otorisasi pada server; gunakan URL bertanda tangan dengan masa berlaku bila diperlukan.
13. Semua aksi approval, reject, cancel, refund, posting, unposting/reversal, export, dan perubahan master konfigurasi penting masuk audit trail.
14. Jangan mengizinkan perubahan periode yang sudah ditutup tanpa wewenang dan jejak audit.
15. Perhitungan pada dashboard dan laporan harus memiliki sumber data serta formula yang konsisten.
16. Perubahan harga produk/layanan tidak boleh merusak histori transaksi yang sudah dibuat.
17. Transaksi tidak dihapus permanen hanya untuk memperbaiki angka; gunakan reversal, credit note, void, atau koreksi yang sesuai.
18. Cegah akses lintas unit tanpa izin.
19. File export dan pesan error tidak boleh membocorkan informasi sensitif.
20. Semua waktu disimpan dengan strategi timezone yang konsisten; tampilkan waktu bisnis dengan `Asia/Jakarta`.

---

# 10. KEAMANAN APLIKASI

Terapkan praktik keamanan yang sesuai untuk aplikasi keuangan internal.

- Password di-hash dengan algoritme yang sesuai, seperti Argon2id atau bcrypt dengan konfigurasi aman.
- Gunakan session yang aman atau access/refresh-token flow dengan rotasi refresh token. Pilih strategi yang sederhana, aman, dan konsisten. Bila menggunakan cookie, atur `HttpOnly`, `Secure` di production, `SameSite`, serta perlindungan CSRF sesuai arsitektur.
- Terapkan rate limiting pada login dan endpoint sensitif.
- Gunakan Helmet atau header keamanan yang setara.
- Batasi CORS ke origin yang diizinkan.
- Validasi dan normalisasi semua input server-side.
- Cegah SQL injection melalui parameterized queries/ORM yang digunakan dengan benar.
- Hindari XSS dengan escaping output dan sanitasi input rich text bila fitur tersebut ada.
- Lindungi endpoint file upload/download.
- Redaksi password, token, secret, data kartu, dan informasi sensitif dari log.
- Simpan secret hanya di environment/secret manager.
- Terapkan principle of least privilege pada database dan aplikasi.
- Sediakan pencatatan login penting, kegagalan otentikasi, perubahan permission, dan kejadian keamanan.
- Buat prosedur backup dan uji pemulihan secara terjadwal.
- Jangan menyimpan data kartu pembayaran sensitif yang tidak dibutuhkan. Gunakan payment provider yang sesuai jika pembayaran eksternal diintegrasikan.
- Jangan mengklaim sertifikasi atau kepatuhan formal yang belum diaudit.

---

# 11. FILE, DOKUMEN, DAN EXPORT

Sistem harus menyediakan pengelolaan lampiran untuk nota, invoice, quotation, PO, tanda terima, bukti transfer, faktur pajak, dan dokumen pendukung lain.

Ketentuan:
- Metadata file minimal: nama tampilan, tipe, ukuran, uploader, waktu upload, entity terkait, dan status pemeriksaan.
- Penyimpanan dibuat privat dengan otorisasi per file.
- Batasi tipe dan ukuran file melalui konfigurasi.
- Gunakan nama storage internal yang aman; nama file dari pengguna hanya menjadi metadata display.
- Tampilkan preview/download hanya jika tipe file didukung dan pengguna berwenang.
- Catat aktivitas upload, penggantian, dan download untuk dokumen sensitif jika diperlukan.
- Sediakan format dokumen yang konsisten untuk PO, invoice, kuitansi, bukti pembayaran, dan laporan.
- PDF/Excel export harus memiliki header, periode, filter, waktu pembuatan, dan nomor dokumen bila relevan.
- Hindari menaruh data rahasia pada URL publik permanen.

---

# 12. NOTIFIKASI DAN APPROVAL INBOX

Buat pusat notifikasi di dalam aplikasi, minimal untuk:
- Permintaan menunggu persetujuan.
- Permintaan disetujui/ditolak.
- Anggaran mendekati batas atau tidak mencukupi.
- Invoice pelanggan mendekati jatuh tempo.
- Invoice vendor jatuh tempo.
- Rekonsiliasi yang memerlukan review.
- Closing kasir dengan selisih.
- Dokumen wajib yang belum lengkap.

Notifikasi harus mengarah ke objek terkait. Sediakan status read/unread dan filter. Integrasi email/chat adalah fase tambahan; jangan tampilkan status “email terkirim” jika belum ada provider yang terkonfigurasi.

Approval inbox perlu menjadi tempat kerja utama bagi approver, dengan filter jenis permintaan, unit bisnis, nominal, tanggal, status, dan pembuat.

---

# 13. SEED DATA DAN DEMO ENVIRONMENT

Sediakan seed data realistis untuk demonstrasi dengan penanda **DATA DEMO** yang jelas.

Contoh data demo:
- Beberapa unit bisnis.
- Pengguna untuk GM, Manager Unit, Procurement, Finance, Accounting, Kasir, dan Auditor.
- Vendor dan pelanggan fiktif.
- Anggaran dua atau tiga periode.
- PR, quotation, PO, goods receipt, expense, sales order, invoice, payment, cash session, bank statement, dan jurnal contoh.
- Beberapa keadaan status: menunggu approval, disetujui, dibayar, belum dibayar, rekonsiliasi belum cocok, dan kasir berselisih.

Buat kredensial demo yang hanya berlaku untuk development dan dokumentasikan dengan jelas. Jangan menggunakan password produksi yang lemah atau membuat akun demo terbuka di production.

Data dashboard demo harus koheren. Sebagai contoh, total pembayaran tidak boleh lebih besar dari invoice yang terkait kecuali skenario kredit/refund yang secara eksplisit ditangani.

---

# 14. STRATEGI IMPLEMENTASI BERTAHAP

Jangan membuat semua modul sekaligus dalam bentuk stub. Bangun sebuah vertical slice yang utuh terlebih dahulu.

## Fase 0 — Discovery dan fondasi
- Audit repository dan dependency.
- Tetapkan arsitektur, design tokens, struktur modul, lint, typecheck, konfigurasi environment, dan dokumentasi.
- Buat skema database awal, migrasi, seed demo, login, RBAC, layout dasar, error handling, dan API convention.
- Implementasikan audit trail dasar.

**Output:** aplikasi dapat dijalankan frontend/backend, login bekerja, menu dan role bekerja, database terhubung.

## Fase 1 — Anggaran dan pengadaan
- Business units, cost centers, fund sources.
- Anggaran, budget lines, approval, revisi.
- Vendor management.
- PR, quotation comparison, PO, receipt, vendor invoice.
- Expense dan kontrol budget commitment.
- Daftar, filter, detail, form, approval inbox, dan audit timeline.

**Output:** satu alur pengadaan sampai pencatatan pengeluaran berfungsi end-to-end.

## Fase 2 — Pendapatan, pembayaran, dan kasir
- Customer dan product/service master.
- Order, invoice, partial/full payment.
- Receipt/kwitansi.
- Cashier session, closeout, discrepancy, deposit.
- Simulasi payment untuk demo jika integrasi provider belum tersedia.

**Output:** satu alur order sampai pembayaran dan closing kasir berjalan.

## Fase 3 — Rekonsiliasi
- Import bank statement.
- Preview/mapping, duplicate detection.
- Matching suggestion dan manual review.
- Rekonsiliasi final serta laporan selisih.

**Output:** transaksi penerimaan dapat dibandingkan dengan laporan bank dan item tak cocok bisa ditindaklanjuti.

## Fase 4 — Akuntansi
- COA.
- Account mapping.
- General journal, journal lines, posting dan reversal.
- General ledger, trial balance.
- AR/AP dan periode akuntansi.
- Integrasi posting untuk tipe transaksi yang sudah dipetakan.

**Output:** laporan akuntansi berasal dari jurnal ter-posting, bukan dari penjumlahan kartu dashboard saja.

## Fase 5 — Laporan dan evaluasi strategis
- Budget vs actual.
- Pendapatan, biaya, piutang, utang, arus kas, laba rugi, neraca, rekonsiliasi.
- Analisis kinerja unit.
- Evaluasi periode dan usulan anggaran selanjutnya.
- Export yang berizin.

**Output:** GM dan Finance bisa menganalisis hasil periode dengan drill-down ke transaksi sumber.

## Fase 6 — Penguatan dan deployment
- Security review, performance review, accessibility, dan responsive QA.
- Integration tests, e2e tests untuk alur prioritas.
- Backup/recovery, observability, migration plan, deployment guide, dan user guide.
- Review bersama stakeholder untuk menyelesaikan asumsi yang perlu keputusan bisnis.

---

# 15. HALAMAN UI MINIMUM YANG HARUS DIBANGUN

Implementasikan halaman nyata berikut sesuai prioritas dan role:

1. Login.
2. Dashboard sesuai role.
3. Approval inbox.
4. Daftar, buat, detail, dan revisi anggaran.
5. Daftar vendor dan detail vendor.
6. Daftar PR, form PR, detail PR, quotation comparison.
7. Daftar PO dan detail PO.
8. Penerimaan barang/jasa.
9. Invoice vendor dan daftar biaya.
10. Daftar pelanggan dan produk/layanan.
11. Pesanan pelanggan, invoice, dan detail pembayaran.
12. Halaman kasir dan halaman closeout.
13. Setoran kas dan daftar rekening bank yang sesuai izin.
14. Impor mutasi bank dan rekonsiliasi.
15. Chart of Accounts.
16. Daftar jurnal, detail jurnal, dan buku besar.
17. Piutang dan utang.
18. Halaman laporan dan export.
19. Audit trail.
20. Pengaturan pengguna/role dan master data.
21. Halaman profil, preferensi periode, dan notifikasi.

Jika harus memilih karena keterbatasan waktu, dahulukan login/RBAC, dashboard yang mengambil data nyata, approval inbox, anggaran, pengadaan/pengeluaran, penjualan/pembayaran, dan laporan dasar. Namun, dokumentasikan fitur yang belum selesai dan jangan menyajikannya sebagai fitur penuh.

---

# 16. STANDAR KUALITAS IMPLEMENTASI

## 16.1 Frontend
- Gunakan komponen reusable untuk status badge, nominal rupiah, tanggal, data table, filter bar, confirmation dialog, form field, file uploader, detail panel, dan empty/loading/error states.
- Pisahkan API service dari component.
- Gunakan tipe TypeScript yang konsisten untuk request dan response.
- Tangani 401, 403, 404, 409, dan 500 secara jelas.
- Jangan menyimpan otorisasi penting hanya dalam client state.
- Hindari komponen besar yang mencampur tabel, form, request, validasi, dan business logic sekaligus.
- Gunakan skeleton/loading serta feedback setelah mutasi.
- Hindari optimistic update untuk transaksi finansial berisiko kecuali rollback dibuat dengan benar.
- Pertahankan state filter dan periode secara konsisten jika sesuai konteks.

## 16.2 Backend
- Pisahkan validasi, business logic, akses data, dan HTTP layer.
- Setiap mutasi sensitif memvalidasi permission, status saat ini, ownership/scope, dan rule bisnis.
- Gunakan Prisma transaction untuk perubahan multi-tabel yang harus atomik.
- Tangani concurrent update untuk anggaran dan pembayaran.
- Jangan mengandalkan perhitungan total dari frontend. Hitung atau verifikasi ulang di backend.
- Terapkan response shape dan error format konsisten.
- Dokumentasikan endpoint penting di OpenAPI.
- Audit trail dihasilkan server-side, bukan diterima sebagai pernyataan dari frontend.

## 16.3 Database
- Buat migration versioned.
- Hindari menyimpan JSON tanpa struktur untuk data inti yang perlu query/reporting; gunakan JSON hanya untuk konfigurasi/fleksibilitas yang memang tepat.
- Gunakan FK, unique constraint, dan check constraint yang relevan.
- Nominal: gunakan Decimal dengan presisi yang dirancang dan dikonversi secara aman pada batas API.
- Pikirkan retensi dan arsip dokumen/transaksi.
- Gunakan transaksi database dan idempotency pada proses kritis.

---

# 17. TEST PLAN DAN ACCEPTANCE CRITERIA

Sistem tidak boleh dinilai selesai hanya karena halaman berhasil dibuka. Uji perilaku dan konsistensi data.

## 17.1 Acceptance criteria umum
- Pengguna dapat login/logout dan hanya melihat data/fitur sesuai permission.
- Route yang tidak diizinkan ditolak di backend meskipun diakses langsung.
- Daftar data mendukung filter, search, sort, pagination, serta loading/empty/error state.
- Form mempunyai validasi frontend dan server-side.
- Data bertahan setelah reload karena disimpan di database.
- Audit trail tersedia untuk aksi kritis.
- Tampilan konsisten dan responsif.
- Angka dashboard sesuai query sumber dan filter periode.
- Tidak ada tombol utama yang menjadi dekorasi tanpa aksi.

## 17.2 Test anggaran
- Anggaran draft tidak dapat digunakan untuk komitmen jika belum disetujui.
- Pengeluaran di bawah plafon diproses sesuai rule.
- Pengeluaran yang melebihi plafon ditolak atau diarahkan ke approval exception.
- Dua permintaan bersamaan tidak dapat menghabiskan plafon yang sama tanpa kontrol concurrency.
- Revisi tidak menghapus versi anggaran lama.

## 17.3 Test pengadaan
- PR dapat dibuat, diajukan, disetujui/ditolak, dan ditelusuri.
- Syarat penawaran vendor dipatuhi atau exception meminta alasan dan approval.
- PO tidak dapat disetujui tanpa PR/approval yang disyaratkan.
- Penerimaan parsial menghitung sisa yang belum diterima dengan benar.
- Invoice yang melebihi kuantitas/nilai yang diizinkan memerlukan review atau ditolak.
- Vendor invoice duplikat terdeteksi.

## 17.4 Test pendapatan dan pembayaran
- Invoice belum dibayar tidak dihitung sebagai kas masuk.
- Partial payment memperbarui saldo invoice dengan benar.
- Retry request tidak membuat pembayaran ganda.
- Webhook palsu/tidak valid ditolak.
- Refund mengacu pada pembayaran asal serta tercatat di audit trail.
- Layanan selesai tidak otomatis berarti tagihan sudah lunas.

## 17.5 Test kasir dan bank
- Kasir tidak bisa ditutup dua kali.
- Selisih kas harus disimpan dan mengikuti aturan review.
- Import bank mendeteksi file/row duplikat sesuai kriteria yang dirancang.
- Baris bank yang sudah direkonsiliasi tidak dipasangkan lagi ke transaksi lain tanpa prosedur.
- Transaksi unmatched terlihat dalam laporan tindak lanjut.

## 17.6 Test akuntansi
- Jurnal tidak dapat diposting bila debit dan kredit tidak seimbang.
- Jurnal posted tidak dapat dihapus atau diedit langsung.
- Reversal membuat koreksi yang dapat dilacak.
- Laporan ledger dan trial balance merefleksikan jurnal posted sesuai filter.
- Periode tertutup memblokir posting yang tidak diizinkan.
- Posting otomatis untuk sumber transaksi tidak menghasilkan jurnal ganda.

## 17.7 Test security dan UX
- Percobaan akses lintas unit ditolak.
- Upload file dengan tipe/ukuran tidak diizinkan ditolak.
- Login dibatasi dari percobaan berulang sesuai konfigurasi rate limit.
- Tidak ada secret di source control.
- Layout diuji pada ukuran desktop, tablet, dan mobile.
- Keyboard focus, label input, dan kontras dasar diperiksa.

---

# 18. OUTPUT WAJIB DARI CODING AGENT

Pada akhir pengerjaan, sediakan:

1. Source code frontend dan backend yang dapat dijalankan.
2. Database schema dan migration.
3. Seed data demo yang koheren.
4. `.env.example` tanpa secret.
5. `README.md` dengan prasyarat, instalasi, setup database, migrasi, seed, run development, test, build, dan deployment.
6. `docs/implementation-plan.md` berisi progres implementasi dan fitur yang belum selesai.
7. `docs/data-model.md` atau ERD yang menjelaskan entitas dan relasi.
8. `docs/api-conventions.md` dan dokumentasi OpenAPI untuk endpoint yang tersedia.
9. Dokumentasi role-permission dan alur approval.
10. Daftar asumsi yang masih perlu dikonfirmasi oleh GM PMO/Finance/Accounting/Tax.
11. Hasil lint, type-check, test, dan build, serta error yang masih belum terselesaikan bila ada.
12. Panduan singkat untuk mengakses akun demo di development saja.

Jangan menyatakan integrasi bank, payment gateway, email, QRIS, EDC, atau perpajakan sudah aktif jika credential/provider/approval teknis belum disediakan. Gunakan adapter interface dan dokumentasikan konfigurasi yang diperlukan.

---

# 19. ASUMSI DAN KEPUTUSAN BISNIS YANG HARUS DICATAT

Buat daftar keputusan terbuka yang harus dikonfirmasi, termasuk:

- Nama resmi aplikasi, logo, dan istilah organisasi.
- Apakah sistem digunakan oleh satu badan usaha, beberapa unit internal, atau beberapa entitas hukum.
- Apakah anggaran berbasis kas, akrual, atau keduanya untuk kebutuhan yang berbeda.
- Struktur COA dan kebijakan akuntansi yang digunakan.
- Aturan pengakuan pendapatan dan penyerahan layanan.
- Approval limit per role/kategori/nominal.
- Apakah minimal tiga vendor wajib untuk semua pembelian atau hanya kategori/nominal tertentu.
- Sumber dana, cost center, dan tata cara commitment budget.
- Metode pembayaran dan provider yang akan diintegrasikan.
- Format mutasi bank dan tingkat otomatisasi rekonsiliasi yang diinginkan.
- Kebutuhan integrasi dengan sistem internal yang sudah ada.
- Kebijakan pengelolaan pajak dan dokumen pendukung.
- Kebutuhan inventori, aset tetap, payroll, dan HR (jika termasuk scope).
- Retensi dokumen, backup, RPO/RTO, dan akses auditor.
- Siapa pemilik data, approver, administrator, dan penanggung jawab tiap proses.

Jangan mengisi keputusan ini dengan asumsi permanen yang tidak terlihat oleh pengguna. Buat setting atau dokumentasi default dan minta validasi stakeholder.

---

# 20. PERINTAH EKSEKUSI UNTUK AGENT

Mulai dengan audit repository dan ringkas kondisi proyek. Setelah itu, langsung kerjakan implementasi dengan urutan berikut:

1. Tetapkan rencana kerja teknis dan UI/UX berdasarkan dokumen ini.
2. Bangun layout aplikasi serta design system reusable yang polished, responsif, dan accessible.
3. Bangun autentikasi, RBAC, database schema, migration, seed demo, logging, dan audit trail dasar.
4. Implementasikan **vertical slice end-to-end** pertama: buat anggaran → ajukan → approve → buat purchase request → proses pengadaan → catat invoice/biaya → tampilkan realisasi anggaran.
5. Implementasikan vertical slice kedua: buat order pelanggan → terbitkan invoice → catat pembayaran → closing kasir → tampilkan laporan pendapatan.
6. Implementasikan rekonsiliasi, akuntansi, dan laporan secara bertahap dengan menjaga konsistensi data.
7. Tambahkan loading, empty, error, permission-denied, confirmation, toast, serta responsive state untuk setiap halaman utama.
8. Tambahkan test untuk aturan bisnis dan alur kritis.
9. Jalankan lint, type-check, test, migration, seed, dan build. Perbaiki hasil gagal.
10. Perbarui README, dokumentasi, status modul, dan daftar asumsi terbuka.

Prioritaskan **kebenaran alur bisnis, integritas angka, keamanan, dan kemudahan pemakaian** di atas jumlah halaman. Gunakan desain visual yang rapi dan konsisten, tetapi jangan membuat UI cantik yang berisi data palsu atau tombol tanpa fungsi.

Hasil akhir harus terasa seperti produk ERP internal yang matang: navigasi mudah, informasi keuangan bisa dipindai dengan cepat, transaksi dapat ditelusuri, serta approver memahami apa yang sedang diminta, berapa dampak nominalnya, dan tindakan apa yang harus dilakukan.
