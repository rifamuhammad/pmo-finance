| id | task | status | notes |
| --- | --- | --- | --- |
| s1-ui-1 | Buat komponen reusable CoaCombobox.vue untuk pencarian instan 70 Akun COA PMO dari Excel | completed | CoaCombobox.vue dibuat dengan fuzzy search, tab filter kepala 1-5, keyboard nav |
| s1-ui-2 | Integrasikan CoaCombobox & bersihkan tab numbering di AccountingView.vue | completed | Tab diperbarui tanpa angka, COA table ditambah filter/search 70 akun, modal jurnal memakai CoaCombobox |
| s1-ui-3 | Tambahkan Indikator Periode Fiskal Aktif (OPEN/LOCKED/CLOSED) di Navbar AppShell.vue | completed | Pill status periode fiskal aktif (Nov 2026) dengan badge OPEN/LOCKED/CLOSED terpasang di navbar |
| s1-ui-4 | Terapkan audit Style UI (tabular-nums & palette restraint) pada tabel finansial AccountingView | completed | Menghapus badge demo, audit alignment kolom num & tabular-nums untuk seluruh angka moneter |
| s1-ui-5 | Eksekusi verifikasi penuh (typecheck, tests, build) dan dokumentasikan hasil | completed | Typecheck 0 errors, 24 integration tests pass, build 2.02s OK, docs KOI-101 tuntas |
| s1-ui-6 | Refactor tampilan COA di AccountingView.vue menjadi Accordion / Collapsible Group (Solusi 2) | completed | Dikelompokkan 5 kategori hierarki akun, auto-expand saat search, tombol Buka/Tutup Semua, copy kode akun |
| s1-ui-7 | Bersihkan akun legacy [LEGACY] & integrasikan CoaCombobox pada form Kas Kecil (DRA-UK) | completed | PettyCashView memakai CoaCombobox 70 akun Excel, sembunyikan 17 akun [LEGACY] dari dropdown UI |
| s1-ui-8 | Hapus filter parsial backend & frontend agar 100% dari 70 akun COA Excel tampil utuh | completed | Endpoint /master-context & CoaCombobox kini menyajikan 70 dari 70 akun resmi tanpa batasan 38/28 |
| s1-ui-9 | Redesain CoaCombobox sesuai mockup: pill kategori (Semua, Aset, Liabilitas, Ekuitas, Pendapatan, Beban) & grouped list header | completed | Sesuai Screenshot 13.04.44: filter pill non-slop, section header per kategori, counter 70 akun, elevation z-index 99999 |
