| id | task | status | notes |
| --- | --- | --- | --- |
| s3-umk-1 | Analisis alur UMK (GUP/TUP/Panjar Kegiatan) & mapping COA Pertor 310 | completed | Akun 110501010100 Uang Muka Kegiatan vs 110101020200 Bank BRI |
| s3-umk-2 | Implementasi posting jurnal otomatis saat pencairan dana panjar UMK | completed | Dr 110501010100 vs Cr 110101020200 |
| s3-umk-3 | Implementasi posting jurnal realisasi beban saat SPJ disahkan | completed | Dr Akun Beban (520901020100) vs Cr 110501010100 |
| s3-umk-4 | Implementasi pengembalian sisa dana UMK (setor kas bank / nihilisasi) | completed | Dr 110101020200 vs Cr 110501010100 |
| s3-umk-5 | Penyempurnaan antarmuka PettyCashView.vue & integrasi API | completed | Indikator status SPJ, nomor dokumen jurnal panjar & nihilisasi |
| s3-umk-6 | Pengujian komprehensif alur UMK pada vitest suite & typecheck | completed | Validasi double-entry strictly balanced di ledger (25/25 tests pass) |
| s3-umk-7 | Dokumentasi task KOI-109 & transisi Jira ke In Review (Board 3) | in_progress | docs/tasks/KOI-109, push origin, strictly In Review |
