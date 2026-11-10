| id | task | status | notes |
| --- | --- | --- | --- |
| s3-pos-1 | Tambahkan modal & aksi Buka Sesi Kasir Baru pada RevenueCashierView.vue | completed | openSessionModalOpen & openSessionForm memanggil POST /cashier/sessions/open |
| s3-pos-2 | Pasang Banner Sesi Kasir Aktif & Status Loket Real-Time | completed | Menampilkan nomor sesi, loket, petugas kasir, modal awal, tunai masuk & saldo fisik teoritis |
| s3-pos-3 | Tambahkan visualisasi Struk/Bukti Kasir POS Pertor 310 pada modal pembayaran | completed | Kuitansi POS resmi memuat rincian, PPN 11%, COA 4203 & 110101010100 + window.print() |
| s3-pos-4 | Uji verifikasi auto-jurnal setoran deposit kas ke Bank BRI (110101020200 vs 110101010100) | completed | Automated integration test di erp.test.ts (26/26 passed) |
| s3-pos-5 | Quality Gate: Monorepo typecheck & Vite build verification | completed | Typecheck 0 errors, Vite production build passed |
| s3-pos-6 | Dokumentasi KOI-111, push origin, PR GitHub & transisi Jira ke In Review | completed | docs/tasks/KOI-111, strictly In Review (anti-Done) |
