| id | task | status | notes |
| --- | --- | --- | --- |
| koi119-1 | Prisma Schema Model AssetExpenditure & DB Push Sync | completed | Relation ke FixedAsset, field ratioPercent, isCapitalized, accountingTreatment, coaDebit, dsb. |
| koi119-2 | Backend Asset Capitalization Engine & Endpoints | completed | /assets/capitalization-rules, /assets/evaluate-capitalization, /assets/:id/expenditures POST/GET |
| koi119-3 | UI AssetsView.vue: Form/Modal Catat Pengeluaran Perbaikan & Indikator >10% Nilai Buku | completed | Live calculation badge, accounting treatment preview, expenditure list |
| koi119-4 | Integration Testing Section 13 erp.test.ts (3 tes) | completed | Ambang batas perolehan baru (1 jt/20 jt), perbaikan <=10% beban, renovasi >10% kapitalisasi (42/42 passing) |
| koi119-5 | Quality Gate, Docs KOI-119, Git Commit, Push & Jira In Review | in_progress | Anti-Done strictly, PR link, evidence of clean test & build |
