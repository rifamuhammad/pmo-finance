# 🏢 Tiket KOI-84 (PMO-032): Setup Master Data 5 Unit Bisnis PMO & Cost Center

- **Jira Key:** `KOI-84` (Task), `KOI-85`, `KOI-86` (Subtasks)
- **Status Jira:** `Done`
- **Branch GitHub:** `feature/KOI-84-setup-master-unit-bisnis-cost-center` *(Merged to `main` - Commit `a0bf9e9`)*
- **Script Verifikasi:** `scripts/verify_units_db.ts`

---

## 1. Latar Belakang & Urgensi Bisnis
PMO UTama menaungi 4 unit bisnis komersial (Revenue Center) dan 1 divisi manajemen holding/operasional (Cost Center). Masing-masing unit memiliki layanan spesifik, rekening penampung, kas register kasir, dan cost center terpisah agar perhitungan laba rugi (*Profit & Loss*) tiap unit dapat diisolasi secara akurat.

---

## 2. Langkah & Keputusan Teknis
1. **5 Unit Bisnis Terdaftar:**
   - `BU-ITS`: Divisi IT Solution (Revenue Center) - Manager: Nadia Kusuma, S.Kom
   - `BU-KLINIK`: Divisi Klinik Pratama (Revenue Center) - Manager: dr. Farida Rahmawati
   - `BU-MICE`: Divisi MICE & Wisma UT (Revenue Center) - Manager: Bambang Hartono, SE
   - `BU-TCI`: Divisi Testing, Certification & Innovation (Revenue Center) - Manager: Rendra Pratama, M.Kom
   - `PMO-MGMT`: Divisi Manajemen, Keuangan & Operasional (Cost Center) - Manager: Darmawan Setiadi
2. **12 Cost Centers & Cash Registers:**
   - Dibuat 12 Cost Center (2 untuk ITS, 2 untuk KLINIK, 3 untuk MICE, 2 untuk TCI, 3 untuk MGMT).
   - Dibuat 5 Cash Register (`REG-ITS-01`, `REG-KLN-01`, `REG-MICE-01`, `REG-TCI-01`, `REG-HO-01`).
3. **Rekening Bank & Mapping Akun Pendapatan:**
   - `BNK-MDR-01`: Bank Mandiri Kantor Kas UT (GL: `110101020100` - Pengeluaran & Operasional)
   - `BNK-BRI-01`: Bank BRI Kantor Kas UT (GL: `110101020200` - Penerimaan Komersial Unit)
   - Mapping 8 produk/jasa ke 12-digit kode pendapatan Pertor 310 (`420301xxxxxx`).

---

## 3. Data Riil & Hasil Uji
- **Unit Bisnis:** 5 unit aktif di PostgreSQL.
- **Cost Center:** 12 terdaftar.
- **Cash Registers:** 5 unit register operasional.
- **Rekening Bank:** 3 rekening terpetakan.

---

## 4. Panduan Verifikasi
```bash
# Verifikasi data unit bisnis, cost center, kasir, dan rekening bank
npx tsx scripts/verify_units_db.ts
```
