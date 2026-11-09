| id | task | status | notes |
| --- | --- | --- | --- |
| s2-inj-1 | Analisis isi sheet & header Excel Revisi 7 Block Grant dan Usulan 2027 | completed | Menelaah struktur baris, formula volume 4 level, dan unit bisnis terkait |
| s2-inj-2 | Buat skrip ekstraksi data anggaran riil dari Excel ke Prisma | completed | scripts/seed_real_budgets_excel.ts untuk parsing dan normalisasi |
| s2-inj-3 | Eksekusi injeksi data riil anggaran 2026 dan 2027 ke PostgreSQL | completed | Menyimpan 6 dokumen anggaran riil (296 pos baris rincian) |
| s2-inj-4 | Verifikasi integritas relasi FK dan kalkulasi pagu Semula-Menjadi | completed | 118 pos Revisi 7 (Rp 20.15 M) & 178 pos Usulan 2027 (Rp 25.17 M) terverifikasi |
| s2-inj-5 | Eksekusi automated test suite, typecheck, dan dokumentasi Jira KOI-100 | completed | 24 integration tests pass, typecheck 0 error, update Jira ke In Review |
| s2-rev-1 | Implementasi API endpoint histori revisi & compare snapshot | completed | GET /api/v1/budgets/:id/revisions & GET /api/v1/budgets/:id/revisions/compare |
| s2-rev-2 | Integrasi visual Diff Viewer modal dialog & filter baris anggaran | completed | BudgetsView.vue dengan perbandingan pagu asal vs target dan status pergeseran |
| s2-rev-3 | Penambahan chip preset alasan penyesuaian plafon anggaran standar audit | completed | Preset rekomendasi audit standar pada form revisi plafon semula-menjadi |
| s2-rev-4 | Verifikasi komprehensif typecheck, build, dan test suite vitest | completed | 24 integration tests pass, typecheck 0 error, build dist pass |
| s2-rev-5 | Dokumentasi teknis task KOI-99 dan update Jira status ke In Review | completed | docs/tasks/KOI-99-versioning-snapshot-revisi-anggaran.md dibuat, Jira updated |
