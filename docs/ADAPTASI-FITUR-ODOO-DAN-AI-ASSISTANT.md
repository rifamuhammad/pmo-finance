# 🚀 Dokumentasi Adaptasi Fitur Odoo ERP ke PMO Finance

Dokumen ini mencatat seluruh eksekusi perubahan dan implementasi fitur yang diadopsi dari referensi **Odoo ERP** (khususnya **AI Assistant**, **Expenses / Reimbursement Staf**, dan **Odoo Apps Launcher Grid**). Seluruh perubahan di bawah ini diimplementasikan secara **lokal** (tidak di-push ke remote).

---

## 📸 Referensi Odoo vs Implementasi PMOFinance

| Fitur Odoo (Screenshot) | Implementasi di PMOFinance | File Perubahan |
| :--- | :--- | :--- |
| **AI Assistant** (Icon Ungu di Grid Odoo) | **Qwen AI Copilot & Financial Assistant**: Terintegrasi menggunakan SDK Qwen (Alibaba Cloud DashScope / OpenAI compatible). Menganalisis basis data anggaran, approval, kasir, invoice, dan kepatuhan secara cerdas dengan *fallback* aman. | [qwen.ts](file:///Users/syahbintang/PmoFinance/apps/api/src/shared/qwen.ts)<br>[AiAssistantWidget.vue](file:///Users/syahbintang/PmoFinance/apps/web/src/components/AiAssistantWidget.vue)<br>[routes.ts](file:///Users/syahbintang/PmoFinance/apps/api/src/modules/reports/routes.ts#L870) |
| **Launcher Grid `:::`** (Tampilan Menu Utama Odoo) | **App Launcher Modal (9-Dots Grid)**: Modal popup modular yang menampilkan seluruh aplikasi ERP dalam kartu visual (Dashboards, AI Assistant, Budgets, Procurement, Expenses, Kasir POS, Bank, Accounting, Approval, Audit). | [AppLauncherModal.vue](file:///Users/syahbintang/PmoFinance/apps/web/src/components/AppLauncherModal.vue)<br>[AppShell.vue](file:///Users/syahbintang/PmoFinance/apps/web/src/layouts/AppShell.vue) |
| **Expenses** (Modul Reimbursement) | **Dedicated Expenses Tab & Quick Route**: Akses cepat klaim beban operasional staf dengan upload nota/struk, otorisasi berjenjang, dan pemotongan otomatis pos anggaran OPEX. | [ProcurementView.vue](file:///Users/syahbintang/PmoFinance/apps/web/src/modules/ProcurementView.vue) |

---

## 🧠 Integrasi Qwen AI (Alibaba Cloud DashScope)

### Cara Kerja Qwen AI di PMOFinance:
1. **Paket Resmi**: Menggunakan client `openai` yang kompatibel dengan protokol API Alibaba Cloud DashScope (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`).
2. **Model yang Didukung**:
   * `qwen-plus` (Default - performa tinggi & analisis finansial presisi).
   * `qwen-turbo` (Respon instan ultra-cepat).
   * `qwen-max` (Model penalaran mendalam untuk audit dan investigasi risiko).
   * Model Lokal via Ollama: `qwen2.5:7b` / `qwen2.5:14b` (arahkan `QWEN_BASE_URL="http://localhost:11434/v1"`).
3. **Penyuntikan Konteks Real-Time (*RAG In-Memory*)**:
   Sebelum memanggil model Qwen, sistem mengumpulkan data *live* dari PostgreSQL:
   * Sisa plafon anggaran divisi, komitmen belanja, dan realisasi beban.
   * Antrean berkas pending persetujuan yang terikat aturan *Separation of Duties*.
   * Daftar transaksi pengeluaran (*Expenses*) terkini.
   * Piutang pelanggan yang belum dibayar.
   * Status loket kasir aktif (*Open Session*).
4. **Mekanisme Ketahanan Ganda (*Zero Downtime Fallback*)**:
   Jika pengguna belum memasukkan `QWEN_API_KEY` di file `.env` atau koneksi jaringan ke cloud terputus, sistem secara otomatis beralih (*fallback*) ke mesin NLP deterministik bawaan ERP. Sistem tidak akan pernah mengalami crash atau berhenti merespons!

### Konfigurasi `.env`:
```env
# Qwen AI Configuration (Alibaba Cloud DashScope / OpenAI-Compatible)
# Dapatkan API key di https://dashscope.console.aliyun.com/
QWEN_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
QWEN_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL="qwen-plus"
```

---

## 🛠️ Rincian Eksekusi Perubahan Teknis

### 1. Backend: AI Assistant Financial Endpoint (`apps/api/src/modules/reports/routes.ts`)
* **Endpoint Baru**: `POST /reports/ai-assistant`
* **Mekanisme Kerja**:
  1. Menerima query teks pengguna dan riwayat obrolan (*conversational history*).
  2. Melakukan *context-scoping* otomatis sesuai wewenang role dan unit bisnis pengguna aktif.
  3. Mengambil data langsung dari PostgreSQL (*live state*):
     * Realisasi & sisa bebas plafon anggaran (`Budget` & `BudgetLine`).
     * Antrean persetujuan yang tertunda (`ApprovalRequest`).
     * Transaksi klaim pengeluaran (`Expense`).
     * Faktur piutang pelanggan belum tertagih (`CustomerInvoice`).
     * Status register kasir yang aktif (`CashierSession`).
  4. Mesin NLP intent-matching memformat jawaban profesional dalam Bahasa Indonesia berformat Rupiah (`Rp xxx.xxx.xxx`), menyajikan analisis serapan, risiko kepatuhan (*Separation of Duties*), serta memberikan saran pertanyaan lanjutan (*quick suggestions*).

### 2. Frontend: Komponen AI Assistant Widget (`apps/web/src/components/AiAssistantWidget.vue`)
* Panel *sliding drawer* kanan dengan desain modern dan elegan (bebas AI slop).
* Tombol pertanyaan instan (*quick context chips*):
  * *"Berapa sisa anggaran unit saya saat ini?"*
  * *"Apakah ada antrean approval yang pending?"*
  * *"Tampilkan rekap klaim biaya (expenses) terbaru"*
  * *"Cek status piutang dan invoice pelanggan"*
  * *"Periksa deteksi risiko dan anomali anggaran"*
* Mendukung indikator loading cerdas (*analyzing ERP state*), riwayat chat, dan pembersihan percakapan.

### 3. Frontend: Komponen App Launcher Modal (`apps/web/src/components/AppLauncherModal.vue`)
* Mengadopsi pengalaman navigasi Odoo di mana pengguna dapat membuka grid aplikasi visual dari icon 9-titik (`:::`) di bar navigasi atas.
* Berisi 11 kartu aplikasi interaktif yang masing-masing memiliki ikon, deskripsi singkat, dan warna identitas sesuai modul.

### 4. Layout & Navigasi Terpadu (`apps/web/src/layouts/AppShell.vue`)
* Menambahkan tombol **Odoo Launcher (`:::`)** di sebelah kiri header pencarian.
* Menambahkan tombol **AI Assistant (Sparkle Icon)** di sebelah kanan header samping notifikasi lonceng.
* Mendaftarkan pintasan keyboard cepat pada Command Palette (`⌘K`):
  * `G Q`: Buka AI Assistant Copilot.
  * `G E`: Buka Modul Expenses (Klaim Biaya Staf).
  * `G M`: Buka Launcher Aplikasi Odoo.

### 5. Pengadaan & Expenses Tab Sync (`apps/web/src/modules/ProcurementView.vue`)
* Sinkronisasi query URL (`/procurement?tab=expenses`). Ketika pengguna membuka tautan Expenses dari launcher atau command palette, aplikasi langsung membuka tab *Pengeluaran Biaya & Reimbursement* secara otomatis.

---

## 🧪 Hasil Verifikasi & Pengujian Otomatis

1. **Pengecekan Tipe TypeScript API**:
   ```bash
   ./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json
   # Output: 0 error (Success)
   ```

2. **Pengecekan Tipe TypeScript Web**:
   ```bash
   ./node_modules/.bin/vue-tsc --noEmit -p apps/web/tsconfig.json
   # Output: 0 error (Success)
   ```

3. **Build Produksi Web (Vite)**:
   ```bash
   ./node_modules/.bin/vite build apps/web
   # Output: dist/ built in 1.53s (Success)
   ```

4. **Integration Test Suite**:
   ```bash
   ./node_modules/.bin/vitest run --dir apps/api
   # Output: 20 passed (100% passed)
   ```

---

## 🔒 Status Repositori Git
* Perubahan **tetap di lokal** dan **tidak ada yang di-push ke remote GitHub repository**.
