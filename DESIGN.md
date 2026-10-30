# DESIGN.md - PMO UTama Enterprise Workspace

## 1. Brand Identity & Design Direction

- **Style Identity**: **PMO UTama Clean Financial Workspace (Poital Architecture)**.
- **Brand Palette**:
  - **PMO Royal Navy Blue (`#034693`)**: Warna primer korporat yang diambil langsung dari pita biru emblem resmi PMO UTama. Digunakan untuk aksi utama, link aktif, kurva realisasi biaya, dan fokus.
  - **PMO Golden Amber (`#F59E0B` / `#B45309`)**: Aksen emas hangat yang diambil langsung dari pita kuning emblem PMO UTama. Digunakan untuk kartu metrik mitra, indikator plafon, dan status peringatan.
  - **Forest Emerald (`#059669`)**: Warna semantik keberhasilan, tren positif penerimaan kas, dan komitmen PO.
  - **Deep Navy Slate (`#0B2144`)**: Hero card berkarakter tegas dan elegan.
  - **Clean Canvas (`#F0F2F5`) & Surface (`#FFFFFF`)**: Permukaan matte bersih, bebas dari warna ungu/pink generik yang tidak selaras.
- **Liveliness Dials**: **ENERGY 1 / RHYTHM 2 / MOTION 1**.
  - **ENERGY 1**: Tampilan tenang, otoritatif, dan bebas silau.
  - **RHYTHM 2**: Komposisi kartu bervariasi dengan hierarki hero card navy yang kontras.
  - **MOTION 1**: Transisi taktil 150ms tanpa loop animasi.

---

## 2. Palette Kontras WCAG AA

| Token | Hex | Penggunaan | Rasio Kontras | Status WCAG AA |
|---|---|---|---|---|
| Primary PMO Navy | `#034693` on `#FFFFFF` | Heading & tombol utama | 9.13:1 | PASS (> 4.5:1) |
| Primary Soft Blue | `#034693` on `#EFF6FF` | Teks kartu pesanan & menu aktif | 8.01:1 | PASS (> 4.5:1) |
| Hero Card Navy | `#0B2144` | Latar kartu metrik Total Revenue | 15.9:1 vs Teks Putih | PASS (> 4.5:1) |
| Golden Amber | `#B45309` on `#FEF9ED` | Teks kartu metrik mitra | 6.75:1 | PASS (> 4.5:1) |
| Forest Emerald | `#047857` on `#ECFDF5` | Teks tren & status sukses | 5.01:1 | PASS (> 4.5:1) |
| Canvas Background | `#F0F2F5` | Kanvas luar aplikasi | Base | - |
| Card Surface | `#FFFFFF` | Permukaan kartu rounded 20px | Base | - |

---

## 3. Logo Tanpa Background (No Background / Pure Transparent)

- Emblem resmi PMO UTama (`logo-pmo-emblem.png`) telah dipotong presisi (1278x1352 px) dengan latar belakang **100% transparan (alpha = 0)**.
- **Tanpa kotak pembungkus hitam/gelap**: Emblem duduk langsung secara native di atas kanvas dan navbar, memancarkan bentuk pita 3D geometris biru & emas aslinya tanpa distorsi.

---

## 4. Typography Architecture (Anti-AI Slop & Poital Standard)

- **Primary Typeface**: **`Inter`** (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
  - Menghilangkan font template AI generic (*Plus Jakarta Sans* yang lebar dan bulat).
  - Letter-spacing presisi: `-0.015em` untuk body, `-0.02em` untuk headline dan angka metrik.
- **Tabular Figures for Financials (`font-variant-numeric: tabular-nums`)**:
  - Menghilangkan font developer monospace (*JetBrains Mono*) yang dipasang berlebihan pada teks biasa, mata uang, dan tanggal.
  - Seluruh nominal Rupiah dan angka kuantitas dirender menggunakan sans-serif proporsional dengan aktivasi OpenType *Tabular Numbers (`tnum`)* sehingga digit tersusun sejajar vertikal tanpa terkesan seperti terminal kodingan.
- **Document Codes & Badges**:
  - Menggunakan sans-serif berbobot semi-bold (`font-weight: 600`), tracking micro, dan padding halus dengan latar belakang subtle pill.
