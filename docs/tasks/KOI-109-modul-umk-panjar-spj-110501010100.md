# 🧾 Tiket KOI-109 (PMO-061): Modul UMK Pencairan Panjar Kasir ke Akun 110501010100 & Pertanggungjawaban SPJ

- **Jira Key:** `KOI-109` (Task)
- **Parent Epic:** `KOI-108` (`[SPRINT 3] Core Transaction Engines (LS, UMK & Revenue POS)`)
- **Status Jira:** `In Review`
- **Branch GitHub:** `feature/KOI-109-modul-umk-panjar-spj-110501010100`
- **Prioritas & Due Date:** High · 2026-12-16
- **File Terdampak:**
  - `apps/api/src/modules/pettycash/routes.ts` (Auto-posting balanced double-entry journal ke Buku Besar saat pencairan dana GUP / TUP Nihilisasi)
  - `apps/api/src/tests/erp.test.ts` (Integration test suite 8 mencakup pembuatan pengajuan, verifikasi pajak, persetujuan keuangan, dan pencairan dengan asersi jurnal seimbang)
  - `apps/web/src/modules/PettyCashView.vue` (Visualisasi nomor dokumen jurnal pada tabel pengajuan, modal detail, dan konfirmasi pencairan)
  - `docs/plans/task.md` (Live plan tracker)
  - `docs/tasks/README.md` (Index task documentation)
- **Hasil Verifikasi:** 25/25 Integration Tests Passed (100%), Monorepo Typecheck 0 error, Vite Web Build 0 error.

---

## 1. Latar Belakang & Urgensi Akuntansi PTN-BH (Pertor No. 310/2025)

Sesuai Peraturan Rektor No. 310 Tahun 2025 tentang Mekanisme Uang Muka Kerja (UMK) / Ganti Uang Persediaan (GUP) dan Tambahan Uang Persediaan (TUP):
1. **Panjar Kasir / UMK Unit**:
   - Saldo uang persediaan kasir operasional dicatat pada akun aset lancar `110501010100` (Uang Muka Kerja Kasir / Panjar Operasional Unit).
   - Penggantian Uang Persediaan (GUP) diakui saat kasir mengajukan SPJ atas kuitansi operasional yang telah dikeluarkan untuk memulihkan saldo kas kecil unit via transfer rekening bank operasional `110101020200` (Bank BRI PMO).
2. **Pertanggungjawaban Belanja & Potongan Pajak**:
   - Belanja operasional didebetkan ke akun beban operasional riil (misal `520901020100` Beban Barang dan Perlengkapan / kode pos DRA-UK).
   - Potongan pajak negara dipisahkan secara akurat:
     - *(Cr)* `210201010100` Utang Pajak PPh (PPh 21, PPh 22, PPh 23, PPh Final).
     - *(Cr)* `210202010100` Utang Pajak PPN (PPN 11%).
   - Pembayaran netto dikreditkan ke Bank Kas Operasional (`110101020200` untuk GUP) atau Panjar UMK (`110501010100` untuk TUP Nihil).
3. **Auditabilitas & Buku Besar**:
   - Setiap transaksi pencairan menghasilkan jurnal otomatis bernomor unik (`JRN-PC-...`) dengan status `POSTED` yang terhubung langsung ke Buku Besar dan Laporan Aktivitas ISAK 335.

---

## 2. Struktur Jurnal GUP & TUP Nihil

### A. Penggantian Uang Persediaan (GUP)
| Sisi | Akun | Nama Akun | Keterangan |
|---|---|---|---|
| **Debet** | `520901020100` | Beban Barang & Perlengkapan / COA Riil | Total nilai transaksi belanja bruto |
| **Kredit** | `210201010100` | Utang Pajak PPh | Potongan PPh (bila ada) |
| **Kredit** | `210202010100` | Utang Pajak PPN | Potongan PPN (bila ada) |
| **Kredit** | `110101020200` | Bank BRI Penerimaan Komersial PMO | Nilai pencairan bersih (Netto) ke rekening unit |

### B. Pertanggungjawaban TUP Panjar Kasir (Nihilisasi TUP)
| Sisi | Akun | Nama Akun | Keterangan |
|---|---|---|---|
| **Debet** | `520901020100` | Beban Barang & Perlengkapan / COA Riil | Total nilai transaksi SPJ belanja bruto |
| **Kredit** | `210201010100` | Utang Pajak PPh | Potongan PPh (bila ada) |
| **Kredit** | `210202010100` | Utang Pajak PPN | Potongan PPN (bila ada) |
| **Kredit** | `110501010100` | Uang Muka Kerja Kasir / Panjar Operasional | Pengurangan saldo panjar UMK kasir unit |

---

## 3. Implementasi Teknis

### A. Backend Route Engine (`apps/api/src/modules/pettycash/routes.ts`)
- Menggunakan `createOrGetBalancedJournal` dalam transaksi database Prisma (`tx.$transaction`).
- Penentuan akun debet beban operasional secara dinamis dari pengajuan, dengan fallback standar Pertor 310 (`520901020100`).
- Penentuan akun kredit kas/bank (`110101020200`) atau akun panjar UMK kasir (`110501010100`).
- Perhitungan potongan PPh (`210201010100`) dan PPN (`210202010100`) dengan pembulatan presisi desimal tanpa deviasi sen.
- Pencatatan log audit immutable (`PETTY_CASH_DISBURSED`) yang merujuk pada nomor jurnal dan nomor dokumen pengajuan.
- Endpoint `GET /submissions` dan `GET /submissions/:id` kini memetakan relasi `journalEntryId` dan menyajikan `journalDocNo` riil kepada pengguna.

### B. Frontend View (`apps/web/src/modules/PettyCashView.vue`)
- Penambahan tipe data `journalDocNo` dan `journalEntryId` pada interface `PettyCashSubmissionRecord`.
- Visualisasi badge monospace nomor jurnal (`.cell-journal-badge`) pada kolom status tabel pengajuan.
- Penambahan banner hijau konfirmasi Buku Besar terposting (`.pmo-journal-confirmed-banner`) pada modal detail pengajuan.
- Pembaruan notifikasi sukses pasca pencairan dengan menyertakan nomor jurnal aktual.

### C. Pengujian Otomatis (`apps/api/src/tests/erp.test.ts`)
- Penambahan suite pengujian `8. UMK & SPJ Petty Cash (KOI-109 / PMO-061)`:
  1. Membuat pengajuan GUP dengan rincian item belanja konsumsi rapat.
  2. Memverifikasi pemotongan PPh 23 (2%) oleh akun role Verifikator Pajak.
  3. Menyetujui pengajuan oleh akun role Finance Manager.
  4. Mencairkan pengajuan oleh Kasir PMO.
  5. Memvalidasi bahwa jurnal double-entry otomatis tercipta, seimbang antara total debet dan kredit (`totalDebit === totalCredit`), dan nomor jurnal dapat diakses melalui endpoint detail.

---

## 4. Hasil Uji & Verifikasi Sistem

```bash
# 1. Typecheck Monorepo
$ npm run typecheck
> @pmo-erp/api@1.0.0 typecheck: tsc --noEmit -p tsconfig.json (0 error)
> @pmo-erp/web@1.0.0 typecheck: vue-tsc --noEmit (0 error)

# 2. Frontend Build
$ npm --workspace=apps/web run build
dist/index.html                             1.21 kB │ gzip:   0.58 kB
dist/assets/index-JJ4_D7aR.css            206.68 kB │ gzip:  35.65 kB
dist/assets/index-Dj88QqNK.js             940.39 kB │ gzip: 250.82 kB
✓ built in 3.05s

# 3. Integration Tests
$ npm test
Test Files  1 passed (1)
     Tests  25 passed (25)
  Duration  7.58s
```
Semua 25 pengujian lulus 100%. Status tiket diposisikan pada **`In Review`** untuk pemeriksaan oleh Manajer Keuangan.
