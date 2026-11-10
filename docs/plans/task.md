| id | task | status | notes |
| --- | --- | --- | --- |
| s3-rev-1 | Pemetaan akun pendapatan 4203xxxxxx per unit bisnis & PPN 210202010100 Pertor 310 | completed | TCI (420301010200), ITS (420301040200), KLINIK (420301060100), MICE (420301070202), MGMT (420301090100) |
| s3-rev-2 | Update auto-posting jurnal piutang & pendapatan saat issue customer invoice di revenue routes | completed | Dr 110301010100 vs Cr 4203xxxxxx, Cr 210202010100 |
| s3-rev-3 | Update auto-posting jurnal penerimaan pembayaran kasir (cash vs bank) di revenue routes | completed | Dr 110101010100 / 110101020200 vs Cr 110301010100, Dr 590101010100 |
| s3-rev-4 | Update auto-posting jurnal setoran kas kasir (cash deposit) ke rekening bank operasional | completed | Dr 110101020200 vs Cr 110101010100 |
| s3-rev-5 | Penyempurnaan RevenueCashierView.vue (informasi akun pendapatan COA Pertor 310 & visualisasi jurnal) | completed | Menampilkan kode akun 4203 & PPN pada rincian tagihan/kuitansi |
| s3-rev-6 | Pengujian komprehensif alur revenue & POS cashier pada test suite erp.test.ts | completed | Memvalidasi balanced double-entry dan kode akun 12-digit resmi (25/25 tests pass) |
| s3-rev-7 | Dokumentasi KOI-110, push origin, PR GitHub, & transisi Jira ke In Review | in_progress | docs/tasks/KOI-110, strictly In Review (anti-Done) |
