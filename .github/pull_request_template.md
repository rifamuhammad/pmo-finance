## 📌 Ringkasan Perubahan (Summary)
<!-- Jelaskan secara singkat fitur atau bug yang dikerjakan -->

## 🏢 Area Workspace yang Terdampak
- [ ] `apps/web` (Frontend Vue 3)
- [ ] `apps/api` (Backend Express)
- [ ] `prisma/` (Database schema / migration / seed)
- [ ] `docs/` (Dokumentasi)
- [ ] Root configuration (`package.json`, `.github`, docker, dll.)

## 🗄️ Database Changes (Jika ada perubahan pada `prisma/`)
- [ ] Sudah menjalankan `npx prisma migrate dev --name <nama_migrasi>`
- [ ] Tidak mengedit file migrasi yang sudah pernah di-commit ke branch `main`
- [ ] File `prisma/seed.ts` sudah diperbarui jika ada entitas atau kolom baru

## ✅ Pre-flight Checklist (Wajib Lulus Sebelum Merge)
- [ ] Branch ditarik dari `main` terbaru (`git pull origin main --rebase`)
- [ ] Typecheck lulus: `npx tsc --noEmit -p apps/api/tsconfig.json` & `npx vue-tsc --noEmit -p apps/web/tsconfig.json`
- [ ] Build lokal sukses: `npm run build`
- [ ] Tidak ada file rahasia / `.env` yang terbawa
- [ ] PR sudah diberi label dan reviewer yang sesuai
