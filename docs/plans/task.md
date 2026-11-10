| id | task | status | notes |
| --- | --- | --- | --- |
| koi120-1 | Prisma Schema Model AssetDepreciation & DB Push Sync | completed | Model AssetDepreciation dengan relasi FixedAsset, compound unique, journalEntryId, dsb. |
| koi120-2 | Backend Straight-Line Depreciation Engine & Cut-Off Tanggal 20 | completed | Aturan perolehan <=20 (bulan berjalan) vs >20 (bulan berikutnya), posting jurnal otomatis |
| koi120-3 | UI AssetsView.vue: Kalkulator Depresiasi, Simulasi Cut-Off & Jadwal Penyusutan Bulanan | completed | Widget cut-off tgl 20, tombol 'Hitung Penyusutan Berjalan' membuka modal, riwayat depresiasi di modal detail |
| koi120-4 | Integration Testing Section 14 erp.test.ts (3 tes) | completed | Uji cut-off tgl 20 (<=20 vs >20), uji eksekusi depresiasi bulanan, uji posting jurnal berimbang (45/45 passing) |
| koi120-5 | Quality Gate, Docs KOI-120, Git Commit, Push & Jira In Review | in_progress | Strictly In Review (anti-Done), PR link, evidence of clean test & build |
