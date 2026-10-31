# 🌐 Panduan Lengkap Deployment Server Production
## ERP Keuangan & Operasional PMO UTama

Dokumen ini adalah panduan teknis langkah-demi-langkah (*step-by-step production deployment guide*) untuk menggelar aplikasi **PMO Finance ERP** ke server (VPS, Cloud VM, atau Server On-Premise Kampus/Kantor).

---

## 🏗️ 1. Arsitektur Komponen Aplikasi

```mermaid
flowchart TD
    Client["Browser Pengguna (Desktop / Mobile)"]
    Nginx["Nginx Reverse Proxy & SSL (Port 80/443)"]
    WebBuild["Frontend Vue 3 SPA (Static dist/)"]
    NodeApi["Backend API Node.js / Express (PM2 - Port 4000)"]
    Postgres[("Database PostgreSQL 15+ (Port 5432)")]
    AIModel{"Pilihan Mesin AI (Qwen)"}
    OllamaLocal["Ollama Server (Local Port 11434)"]
    CloudQwen["Alibaba Cloud DashScope API"]

    Client -->|HTTPS| Nginx
    Nginx -->|Sajikan File Statis /| WebBuild
    Nginx -->|Proxy /api/v1/| NodeApi
    NodeApi -->|Prisma ORM| Postgres
    NodeApi -->|Kueri Analitik Keuangan| AIModel
    AIModel -.->|Opsi 1: Server Spek Besar| OllamaLocal
    AIModel -.->|Opsi 2: Server Ringan/VPS Kecil| CloudQwen
```

---

## 💻 2. Rekomendasi Spesifikasi Server (Hardware Sizing)

Pilih salah satu sesuai opsi AI yang Anda gunakan:

### Opsi A: Server Standard (Menggunakan Qwen Cloud API)
Cocok untuk VPS hemat biaya (DigitalOcean, AWS EC2 t3.medium, Biznet, IDCloudHost):
* **OS**: Ubuntu 22.04 LTS / 24.04 LTS (64-bit)
* **CPU**: 2 vCPU
* **RAM**: 4 GB (Minimal 2 GB + 2 GB Swap)
* **Storage**: 25 GB NVMe SSD
* **Estimasi Biaya**: Sangat terjangkau (~$10 - $20 / bulan).

### Opsi B: Server Mandiri (Self-Hosted Ollama + Qwen 2.5 7B)
Cocok untuk Server On-Premise Kampus / Dedicated Server yang ingin 100% data tersimpan di server lokal:
* **OS**: Ubuntu 22.04 LTS / Debian 12
* **CPU**: 8 Core CPU atau Server dengan GPU NVIDIA (VRAM >= 8 GB)
* **RAM**: 16 GB - 32 GB RAM
* **Storage**: 60 GB - 100 GB NVMe SSD

---

## 🛠️ 3. Tahap 1: Setup Lingkungan Dasar Server

Masuk ke server via SSH:
```bash
ssh username@ip-server-anda
```

### 1.1 Update Paket Sistem:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw software-properties-common build-essential nginx
```

### 1.2 Install Node.js 22 LTS:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v # Pastikan v22.x
npm -v
```

### 1.3 Install & Konfigurasi PostgreSQL 15+:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Buat database dan user khusus untuk ERP:
```bash
sudo -u postgres psql
```
Di dalam prompt PostgreSQL (`psql`):
```sql
CREATE DATABASE pmo_erp;
CREATE USER pmo_admin WITH ENCRYPTED PASSWORD 'BuatPasswordKuatDiSini2026!';
GRANT ALL PRIVILEGES ON DATABASE pmo_erp TO pmo_admin;
ALTER DATABASE pmo_erp OWNER TO pmo_admin;
\c pmo_erp
GRANT ALL ON SCHEMA public TO pmo_admin;
\q
```

---

## 🚀 4. Tahap 2: Clone & Setup Repositori Project

### 4.1 Letakkan Project di Direktori Standar Server:
```bash
sudo mkdir -p /var/www/pmo-finance
sudo chown -R $USER:$USER /var/www/pmo-finance
cd /var/www/pmo-finance

# Clone repositori Anda
git clone https://github.com/Syahbintang30/PMOFinance.git .
```

### 4.2 Install Seluruh Dependensi Monorepo:
```bash
npm install
```

### 4.3 Konfigurasi Environment File (`.env`):
Salin atau buat file `.env` di root folder:
```bash
nano .env
```
Isi konfigurasi produksi berikut:
```env
NODE_ENV=production
PORT=4000
TZ=Asia/Jakarta

# Koneksi Database PostgreSQL
DATABASE_URL="postgresql://pmo_admin:BuatPasswordKuatDiSini2026!@localhost:5432/pmo_erp?schema=public"

# Kunci Keamanan Token (Wajib Ganti String Unik)
JWT_SECRET="ganti-dengan-string-acak-panjang-rahasia-minimal-64-karakter"
JWT_EXPIRES_IN="12h"
WEBHOOK_SHARED_SECRET="ganti-dengan-secret-acak-hmac-2026"

# Domain & URL Publik
CORS_ORIGIN="https://erp.pmoutama.ac.id"
VITE_API_BASE_URL="https://erp.pmoutama.ac.id/api/v1"

# Upload Dokumen
STORAGE_DIR="./storage/private-uploads"
MAX_UPLOAD_SIZE_MB=15

# ========================================================
# PILIHAN MESIN AI QWEN (Pilih salah satu di bawah):
# ========================================================

# OPSI 1: Jika Menggunakan Ollama di Server Lokal:
QWEN_BASE_URL="http://localhost:11434/v1"
QWEN_MODEL="qwen2.5:7b"
QWEN_API_KEY="ollama"

# OPSI 2: Jika Menggunakan Cloud API Resmi Alibaba DashScope (Server Ringan):
# QWEN_API_KEY="sk-api-key-dari-dashscope-console"
# QWEN_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
# QWEN_MODEL="qwen-plus"
```

### 4.4 Migrasi Database & Seeding Data Awal:
```bash
# Generate Prisma Client
npm run db:generate

# Terapkan skema ke database PostgreSQL produksi
npx prisma migrate deploy

# Seed data master (Chart of Accounts, 9 Roles, Unit Bisnis)
npm run db:seed
```

### 4.5 Build Aplikasi Produksi:
```bash
npm run build
```
* Perintah ini menghasilkan bundle frontend statis optimal di `apps/web/dist/` dan backend terkompilasi di `apps/api/dist/`.

---

## 🤖 5. Tahap 3: Konfigurasi AI Qwen di Server

### Jika Memilih Opsi 1 (Ollama Lokal di Server):
1. Install Ollama di server:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
2. Aktifkan service Ollama agar berjalan otomatis saat server booting:
   ```bash
   sudo systemctl enable ollama
   sudo systemctl start ollama
   ```
3. Unduh model Qwen 2.5:
   ```bash
   ollama pull qwen2.5:7b
   ```
4. Cek apakah Ollama sudah merespons:
   ```bash
   curl http://localhost:11434/api/tags
   ```

### Jika Memilih Opsi 2 (Alibaba Cloud DashScope):
* Anda **tidak perlu menginstal Ollama di server**. Cukup masukkan API key di `.env` (lihat bagian 4.3 Opsi 2).

---

## ⚙️ 6. Tahap 4: Konfigurasi PM2 (Process Manager Backend)

Buat file konfigurasi PM2 `ecosystem.config.cjs` di root project:
```bash
nano ecosystem.config.cjs
```
Isi konfigurasi berikut:
```javascript
module.exports = {
  apps: [
    {
      name: 'pmo-erp-api',
      script: './apps/api/dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
```

Jalankan backend dengan PM2:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Ikuti satu baris instruksi sudo env PATH=... yang dimunculkan PM2
```

Periksa status backend:
```bash
pm2 status
pm2 logs pmo-erp-api --lines 50
```

---

## 🌐 7. Tahap 5: Konfigurasi Nginx & Domain SSL (HTTPS)

### 7.1 Buat Server Block Nginx:
```bash
sudo nano /etc/nginx/sites-available/pmo-erp.conf
```

Salin konfigurasi reverse proxy berikut (ganti `erp.pmoutama.ac.id` dengan domain/subdomain Anda):
```nginx
server {
    listen 80;
    server_name erp.pmoutama.ac.id;

    # Root frontend build
    root /var/www/pmo-finance/apps/web/dist;
    index index.html;

    # Gzip Compression untuk Performa Cepat
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 1. Routing Frontend Vue 3 (Single Page Application)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. Reverse Proxy ke Backend Express API
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout untuk proses kueri AI yang kompleks
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # Upload size limit
    client_max_body_size 20M;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

Aktifkan konfigurasi Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/pmo-erp.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7.2 Pasang Sertifikat SSL Gratis (Certbot / Let's Encrypt):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.pmoutama.ac.id
```
* Pilih opsi *Redirect HTTP to HTTPS* (otomatis).

---

## 🔒 8. Tahap 6: Pengerasan Keamanan (Security Hardening)

### 8.1 Konfigurasi Firewall (UFW):
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```
*(Port 4000 dan 5432 sengaja TIDAK dibuka ke publik karena dilindungi internal proxy Nginx).*

### 8.2 Skrip Backup Otomatis Database Harian:
Buat skrip backup berkala:
```bash
sudo mkdir -p /var/backups/pmo-erp
sudo nano /usr/local/bin/backup-pmo-erp.sh
```
Isi:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/pmo-erp"
DATE=$(date +"%Y%m%d_%H%M%S")
PGPASSWORD="BuatPasswordKuatDiSini2026!" pg_dump -U pmo_admin -h localhost pmo_erp | gzip > "$BACKUP_DIR/pmo_erp_$DATE.sql.gz"
# Hapus backup lebih dari 14 hari
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete
```
Beri izin eksekusi dan pasang cron job:
```bash
sudo chmod +x /usr/local/bin/backup-pmo-erp.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-pmo-erp.sh") | crontab -
```

---

## 🔄 9. Alur Update Aplikasi Saat Ada Kode Baru (*CI/CD Deployment Routine*)

Setiap kali Anda merilis fitur baru dari Git:
```bash
cd /var/www/pmo-finance
git pull origin main
npm install
npm run db:generate
npx prisma migrate deploy
npm run build
pm2 reload pmo-erp-api
sudo systemctl reload nginx
```

Aplikasi langsung ter-update tanpa *downtime* (*Zero-Downtime Reload*)!
