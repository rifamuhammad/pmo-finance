| id | task | status | notes |
| --- | --- | --- | --- |
| s3-pay-1 | Evaluasi endpoint pelunasan expense & vendor invoice di procurement routes | completed | Menutup Utang Pengadaan 210101010100 saat Vendor Invoice dilunasi |
| s3-pay-2 | Implementasi jurnal pelunasan utang rekanan vs kas bank & potongan pajak | completed | Dr 210101010100 vs Cr 110101020200 & Cr 2102xxxxxx |
| s3-pay-3 | Penyempurnaan UI bukti pelunasan utang pada ProcurementView.vue | completed | Menampilkan badge tagihan vendor dan feedback penutupan utang rekanan |
| s3-pay-4 | Uji coba otomatis pada erp.test.ts (alur 3-way match -> payment pelunasan utang) | completed | Validasi Debit ke 210101010100, 24/24 tests pass strictly balanced |
| s3-pay-5 | Verifikasi test suite, typecheck, dokumentasi task & transisi Jira ke In Review | completed | docs/tasks/KOI-107, push branch, Jira Board 3 verified |
