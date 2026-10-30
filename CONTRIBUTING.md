# 🛡️ Panduan Kerja & Aturan Kolaborasi Monorepo PMO Finance

Panduan ini dirancang untuk menjaga stabilitas arsitektur monorepo **PMO UTama ERP** agar kolaborasi tim (Frontend, Backend, Database) berjalan cepat, terstruktur, dan **bebas dari bentrok kode (merge conflict) maupun desinkronisasi skema database**.

---

## 1. Struktur Domain Monorepo

Repository ini menggunakan **npm workspaces**. Kode dibagi menjadi domain terisolasi:

```text
PMOFinance/
├── apps/
│   ├── api/             # Backend (Express.js, TypeScript, Vitest, Zod)
│   └── web/             # Frontend (Vue 3, TypeScript, Pinia, PrimeVue, Vite)
├── prisma/              # Single Source of Truth Database (Schema, Migrations, Seed)
├── docs/                # Spesifikasi arsitektur, data model, dan kontrak API
├── .github/             # GitHub Actions CI & template PR
└── package.json         # Root workspace & script orkestrasi
```

### 🛑 Boundary Rules (Batas Wilayah Kerja)
1. **Frontend Devs** bekerja di dalam direktori `apps/web/`.
2. **Backend Devs** bekerja di dalam direktori `apps/api/`.
3. **Database & Core Devs** mengelola `prisma/` dan `docs/`.
4. **Dilarang keras mengedit `package.json` di root atau workspace lain** tanpa koordinasi tim.

---

## 2. Strategi Branching (Anti-Bentrok)

Branch utama:
- `main`: Branch produksi yang stabil. **Protected branch (dilarang direct push).**
- Semua pekerjaan fitur/bugfix WAJIB melalui branch terpisah dan diajukan lewat **Pull Request (PR)**.

### Format Penamaan Branch
Gunakan awalan domain kerja untuk mempermudah identifikasi:

| Tipe Pekerjaan | Pola Branch | Contoh |
| :--- | :--- | :--- |
| **Frontend UI/UX** | `feat/web-<nama-fitur>` | `feat/web-cashier-pos` |
| **Backend API** | `feat/api-<nama-fitur>` | `feat/api-cashier-session` |
| **Database/Prisma** | `feat/db-<perubahan>` | `feat/db-add-reconciliation-index` |
| **Fullstack/Keduanya** | `feat/core-<nama-fitur>` | `feat/core-auth-rbac` |
| **Perbaikan Bug** | `fix/<nama-bug>` | `fix/budget-currency-rounding` |
| **Dokumentasi/Config** | `docs/<judul>` atau `chore/<judul>` | `docs/update-user-journey` |

> 💡 **Prinsip Short-Lived Branch:** Buat branch dengan cakupan kecil dan segera merge setelah dites. Semakin lama branch bertahan tanpa di-merge, semakin besar risiko bentrok!

---

## 3. Aturan Manajemen Dependensi (Lockfile Hygiene)

Salah satu penyebab utama bentrok di monorepo adalah desinkronisasi `package-lock.json`.

### ⚠️ Aturan Emas
> **JANGAN PERNAH** masuk ke subfolder (`cd apps/api`) lalu menjalankan `npm install`.  
> Selalu jalankan instalasi dari **ROOT** repository!

### Perintah Instalasi yang Benar:

- **Menambah dependensi ke Backend (`apps/api`):**
  ```bash
  npm install <nama-paket> --workspace=apps/api
  # Contoh:
  npm install dayjs --workspace=apps/api
  ```

- **Menambah dependensi ke Frontend (`apps/web`):**
  ```bash
  npm install <nama-paket> --workspace=apps/web
  # Contoh:
  npm install @vueuse/core --workspace=apps/web
  ```

- **Menambah tooling/dev-dependency ke Root:**
  ```bash
  npm install -D <nama-paket>
  ```

### 🔧 Cara Menangani Konflik `package-lock.json`
Jika terjadi konflik pada `package-lock.json` saat merge/rebase:
```bash
# 1. Ambil versi lockfile dari branch target
git checkout --ours package-lock.json

# 2. Regenerate lockfile dari root secara bersih
npm install

# 3. Tandai resolve dan lanjutkan
git add package-lock.json
git commit -m "chore: resolve package-lock.json conflict"
```

---

## 4. Protokol Perubahan Database & Prisma Migrations

Perubahan skema database adalah area yang paling sensitif jika dikerjakan bersamaan.

### Aturan Ketat:
1. **Komunikasi Terlebih Dahulu:** Jika ada penambahan tabel, relasi, atau kolom pada `prisma/schema.prisma`, beri tahu tim di grup/issue sebelum membuat branch.
2. **Gunakan Migration Resmi:** Gunakan `prisma migrate dev`, **JANGAN** gunakan `prisma db push` di lingkungan bersama karena akan merusak riwayat migrasi.
   ```bash
   npx prisma migrate dev --name <nama_migrasi_deskriptif>
   ```
3. **DILARANG MENGEDIT FILE MIGRASI YANG SUDAH ADA:** File di dalam `prisma/migrations/*` bersifat **immutable** (tidak boleh diubah setelah di-commit ke branch `main`).
4. **Update Data Demo (`prisma/seed.ts`):** Jika menambah kolom mandatory (`required`), perbarui juga generator dummy di `prisma/seed.ts` agar `npm run db:seed` tidak rusak.

---

## 5. Kontrak API & Sinkronisasi Frontend-Backend (Contract-First)

Agar developer Frontend dan Backend bisa bekerja paralel tanpa saling menunggu:

1. **Rujuk Dokumen Kontrak:** Selalu sepakati payload dan respon endpoint berdasarkan [docs/api-conventions.md](docs/api-conventions.md).
2. **Gunakan Standard Envelope:**
   - Sukses: `{ "success": true, "data": { ... }, "meta": { ... } }`
   - Gagal: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`
3. **Mocking di Frontend:** Tim frontend disarankan membuat dummy state / mock API di Pinia Store selama backend masih dalam pengerjaan branch terpisah.

---

## 6. Pre-flight Quality Gate (Cek Mandiri Sebelum Push)

Sebelum melakukan `git push` atau membuka Pull Request, jalankan pengecekan lokal:

```bash
# 1. Sinkronkan dengan branch main terbaru
git pull --rebase origin main

# 2. Cek integritas tipe TypeScript di Backend & Frontend
npx tsc --noEmit -p apps/api/tsconfig.json
npx vue-tsc --noEmit -p apps/web/tsconfig.json

# 3. Pastikan build lulus tanpa error
npm run build
```

Jika ketiga langkah di atas lulus:
```bash
git push origin <nama-branch-anda>
```

---

## 7. Standar Pesan Commit (Conventional Commits)

Format: `<type>(<scope>): <deskripsi singkat>`

- `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- `scope`: `web`, `api`, `db`, `shared`, `config`

**Contoh:**
- `feat(web): add voucher reimbursement form modal`
- `feat(api): implement idempotent customer payment handler`
- `fix(api): correct double-entry ledger calculation on tax deduction`
- `docs(readme): update deployment instructions`
