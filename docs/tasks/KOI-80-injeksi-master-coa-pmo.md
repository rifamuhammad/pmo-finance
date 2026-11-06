# 🎯 Tiket KOI-80 (PMO-031): Injeksi Master COA Spesifik PMO UTama

- **Jira Key:** `KOI-80` (Task), `KOI-81`, `KOI-82`, `KOI-83` (Subtasks)
- **Status Jira:** `Done`
- **Branch GitHub:** `feature/KOI-80-injeksi-master-coa-pmo` *(Merged to `main` - Commit `fdae0a0`)*
- **Dataset File:** `prisma/seeds/coa-pmo-official.json`
- **Script Verifikasi:** `scripts/verify_coa_db.ts`

---

## 1. Latar Belakang & Urgensi Bisnis
Universitas Terbuka sebagai PTN-BH memiliki Bagan Akun Standar (BAS) umum sebanyak 1.063 akun (Lampiran II Pertor 310). Namun, unit bisnis PMO UTama hanya menjalankan aktivitas komersial tertentu. Memasukkan seluruh 1.063 akun tanpa filter akan membingungkan staf kasir dan operasional di 4 unit bisnis komersial.

Oleh karena itu, diputuskan untuk memfilter dan menginjeksi **70 Akun Operasional Spesifik PMO** yang benar-benar aktif digunakan dalam:
- Rencana Kerja dan Anggaran (Tabel Kerja Anggaran PMO 2027)
- Revisi ke-7 Rencana Belanja PMO
- Rekening Bank & Kas Kasir resmi PMO

---

## 2. Langkah & Keputusan Teknis
1. **Ekstraksi Data:** 
   - 20 akun Pendapatan Unit Bisnis (`420301xxxxxx`) dari `docs/KODE COA UT.xlsx`.
   - 27 akun Belanja Operasional Riil (Gaji PUT PK `520101030100`, lembur, makan, obat klinik, wisuda, tenaga ahli IT, server) dari `docs/Semula-Menjadi Revisi ke 7 Block Grant PMO_rev wandi.xlsx`.
   - 23 akun Neraca & Posisi Keuangan esensial (Kasir, Bank Mandiri `110101020100`, Bank BRI `110101020200`, Piutang AR `110301010100`, UMK Kas Kecil `110501010100`, Utang AP LS `210101010100`, Utang Pajak PPN/PPh, Modal Kerja PMO `310101010100`).
2. **Schema & Model:**
   - Menghubungkan 12-digit kode akun resmi Pertor 310 ke model `ChartOfAccount` dan relasi `AccountMapping` di Prisma.
3. **Seeding Idempoten:**
   - Script `prisma/seed.ts` menggunakan pola upsert berbasis `code` untuk mencegah duplikasi akun saat seed ulang.
4. **Bugfix Separation of Duties:**
   - Memperbaiki celah bypass `allowSelf` di `apps/api/src/middleware/auth.ts` agar pembuat anggaran tidak bisa menyetujui anggarannya sendiri.

---

## 3. Data Riil & Hasil Uji
- **Total Akun Terinjeksi:** 70 akun operasional aktif di PostgreSQL.
- **Hasil Test:** Seluruh 21 integration test suite awal lulus 100%.

---

## 4. Panduan Verifikasi
```bash
# Verifikasi data akun COA operasional di database
npx tsx scripts/verify_coa_db.ts
```
