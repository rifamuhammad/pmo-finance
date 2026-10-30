<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import logoPmoEmblem from '../assets/logo-pmo-emblem.png';

const auth = useAuthStore();
const router = useRouter();

const email = ref('finance@pmoutama.demo.id');
const password = ref('DemoErp!2026');
const loading = ref(false);
const errorMsg = ref('');
const activeCategory = ref<'ALL' | 'EXEC' | 'UNIT' | 'OPS'>('ALL');
const searchQuery = ref('');

interface DemoAccount {
  email: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  businessUnitName: string;
  demoPassword?: string;
  category: 'EXEC' | 'UNIT' | 'OPS';
  color: string;
}

const DEFAULT_ACCOUNTS: DemoAccount[] = [
  {
    email: 'admin@pmoutama.demo.id',
    fullName: 'Arif Budiman (Super Admin)',
    roleCode: 'SUPER_ADMIN',
    roleName: 'System Administrator',
    businessUnitName: 'Semua Unit (Pusat)',
    demoPassword: 'DemoErp!2026',
    category: 'EXEC',
    color: '#4F46E5',
  },
  {
    email: 'gm@pmoutama.demo.id',
    fullName: 'Ir. Hendra Wijaya, MBA (GM PMO)',
    roleCode: 'GM_PMO',
    roleName: 'General Manager PMO',
    businessUnitName: 'Semua Unit (Pusat)',
    demoPassword: 'DemoErp!2026',
    category: 'EXEC',
    color: '#D97706',
  },
  {
    email: 'finance@pmoutama.demo.id',
    fullName: 'Siti Rahmawati, SE, Ak (Finance Manager)',
    roleCode: 'FINANCE_MANAGER',
    roleName: 'Finance Manager / Kabag Keuangan',
    businessUnitName: 'Semua Unit (Pusat)',
    demoPassword: 'DemoErp!2026',
    category: 'EXEC',
    color: '#034693',
  },
  {
    email: 'unit.manager@pmoutama.demo.id',
    fullName: 'Rendra Pratama, M.Kom (Unit Manager)',
    roleCode: 'UNIT_MANAGER',
    roleName: 'Unit / Divisi Manager',
    businessUnitName: 'Divisi TCI (Diklat & Sertifikasi)',
    demoPassword: 'DemoErp!2026',
    category: 'UNIT',
    color: '#059669',
  },
  {
    email: 'procurement@pmoutama.demo.id',
    fullName: 'Bagus Santoso (Procurement Officer)',
    roleCode: 'PROCUREMENT',
    roleName: 'Procurement Officer',
    businessUnitName: 'Pengadaan & Vendor Pusat',
    demoPassword: 'DemoErp!2026',
    category: 'OPS',
    color: '#EA580C',
  },
  {
    email: 'accounting@pmoutama.demo.id',
    fullName: 'Larasati Putri, CPA (Accounting Officer)',
    roleCode: 'ACCOUNTING',
    roleName: 'Accounting Officer',
    businessUnitName: 'Buku Besar & Pajak Pusat',
    demoPassword: 'DemoErp!2026',
    category: 'OPS',
    color: '#9333EA',
  },
  {
    email: 'kasir@pmoutama.demo.id',
    fullName: 'Dimas Aditya (Petugas Kasir)',
    roleCode: 'CASHIER',
    roleName: 'Petugas Kasir / Loket POS',
    businessUnitName: 'Divisi TCI & Kasir Pusat',
    demoPassword: 'DemoErp!2026',
    category: 'OPS',
    color: '#10B981',
  },
  {
    email: 'tax@pmoutama.demo.id',
    fullName: 'Fajar Nugroho, BKP (Tax Officer)',
    roleCode: 'TAX_OFFICER',
    roleName: 'Tax Officer / Staf Pajak',
    businessUnitName: 'Pajak & Kepatuhan Fiskal',
    demoPassword: 'DemoErp!2026',
    category: 'OPS',
    color: '#D97706',
  },
  {
    email: 'auditor@pmoutama.demo.id',
    fullName: 'Dewi Anggraini, CIA (Internal Auditor)',
    roleCode: 'AUDITOR',
    roleName: 'Internal Auditor / SPI',
    businessUnitName: 'Satuan Pengawas Internal',
    demoPassword: 'DemoErp!2026',
    category: 'EXEC',
    color: '#0891B2',
  },
];

const demoAccounts = ref<DemoAccount[]>(DEFAULT_ACCOUNTS);

async function loadDemoAccounts() {
  try {
    const res = await apiFetch('/auth/demo-accounts');
    if (res.data && res.data.length > 0) {
      demoAccounts.value = res.data.map((u: any) => {
        let cat: 'EXEC' | 'UNIT' | 'OPS' = 'OPS';
        let col = '#034693';
        if (['GM_PMO', 'SUPER_ADMIN', 'FINANCE_MANAGER', 'AUDITOR'].includes(u.roleCode)) {
          cat = 'EXEC';
          col = u.roleCode === 'GM_PMO' ? '#D97706' : u.roleCode === 'SUPER_ADMIN' ? '#4F46E5' : u.roleCode === 'AUDITOR' ? '#0891B2' : '#034693';
        } else if (u.roleCode === 'UNIT_MANAGER') {
          cat = 'UNIT';
          col = '#059669';
        } else {
          cat = 'OPS';
          col = u.roleCode === 'CASHIER' ? '#10B981' : u.roleCode === 'PROCUREMENT' ? '#EA580C' : u.roleCode === 'TAX_OFFICER' ? '#D97706' : '#9333EA';
        }

        return {
          ...u,
          category: cat,
          color: col,
          demoPassword: u.demoPassword || 'DemoErp!2026',
        };
      });
    }
  } catch {
    // Keep DEFAULT_ACCOUNTS fallback if API fails
  }
}

const filteredAccounts = computed(() => {
  return demoAccounts.value.filter((acc) => {
    const matchCat = activeCategory.value === 'ALL' || acc.category === activeCategory.value;
    if (!matchCat) return false;
    if (!searchQuery.value.trim()) return true;
    const q = searchQuery.value.toLowerCase();
    return (
      acc.email.toLowerCase().includes(q) ||
      acc.fullName.toLowerCase().includes(q) ||
      acc.roleName.toLowerCase().includes(q) ||
      acc.roleCode.toLowerCase().includes(q) ||
      acc.businessUnitName.toLowerCase().includes(q)
    );
  });
});

function selectDemoAccount(acc: DemoAccount) {
  email.value = acc.email;
  password.value = acc.demoPassword || 'DemoErp!2026';
  errorMsg.value = '';
}

async function quickLogin(acc: DemoAccount) {
  selectDemoAccount(acc);
  await submitLogin();
}

async function submitLogin() {
  errorMsg.value = '';
  if (!email.value.trim() || !password.value) {
    errorMsg.value = 'Email dan password wajib diisi.';
    return;
  }
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    router.push('/');
  } catch (err: any) {
    errorMsg.value = err.message || 'Gagal melakukan autentikasi kredensial.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  auth.applyTheme(auth.theme);
  loadDemoAccounts();
});
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- 1. LEFT PANEL: LOGIN FORM -->
      <section class="login-card panel panel-elevated" aria-labelledby="login-heading">
        <div class="brand-hero">
          <img :src="logoPmoEmblem" alt="PMO UTama Logo" class="login-logo-img" />
          <div class="brand-hero-text">
            <span class="brand-title">PMO UTama</span>
            <span class="brand-tagline">INTEGRATED FINANCE & OPERATIONAL ERP</span>
          </div>
        </div>

        <div class="brand-badges">
          <span class="status-pill status-active">
            <i class="pulse-dot"></i> Multi-Role RBAC Aktif
          </span>
          <span class="doc-code">FY-2026</span>
        </div>

        <h1 id="login-heading" class="page-title" style="margin-top: 14px">Masuk ke Ruang Kerja</h1>
        <p class="text-muted" style="margin-top: 6px; margin-bottom: 18px">
          Pilih akun peran di sebelah kanan untuk masuk instan (1-klik) atau isi kredensial manual di bawah.
        </p>

        <!-- Quick Dropdown Preset Selector -->
        <div class="quick-select-box">
          <label class="form-label" for="quick-role-select">Pilih Cepat Akun Pengguna:</label>
          <select
            id="quick-role-select"
            class="select quick-select"
            @change="(e: any) => {
              const selected = demoAccounts.find(a => a.email === e.target.value);
              if (selected) selectDemoAccount(selected);
            }"
            :value="email"
          >
            <option v-for="acc in demoAccounts" :key="acc.email" :value="acc.email">
              {{ acc.fullName }} — [{{ acc.roleCode }}]
            </option>
          </select>
        </div>

        <div v-if="errorMsg" class="error-alert" role="alert">
          <strong>[GALAT AUTENTIKASI]</strong> {{ errorMsg }}
        </div>

        <form @submit.prevent="submitLogin" class="login-form">
          <div class="form-field">
            <label for="login-email" class="form-label">Alamat Email Pengguna</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              class="input"
              placeholder="nama.peran@pmoutama.demo.id"
              required
              autocomplete="username"
            />
          </div>

          <div class="form-field">
            <label for="login-password" class="form-label">Kata Sandi</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="input"
              placeholder="Masukkan kata sandi"
              required
              autocomplete="current-password"
            />
            <span class="input-hint">Kata sandi standar seluruh akun: <code>DemoErp!2026</code></span>
          </div>

          <button type="submit" class="btn btn-primary btn-login-submit" :disabled="loading">
            <span v-if="loading" class="spinner-sm"></span>
            <span>{{ loading ? 'Memverifikasi Kredensial...' : 'Masuk ke Ruang Kerja ERP' }}</span>
          </button>
        </form>

        <div class="login-footer-info">
          <span>Keamanan Sesi: JWT 12 Jam</span>
          <span>•</span>
          <span>Integritas Audit Trail Otomatis</span>
        </div>
      </section>

      <!-- 2. RIGHT PANEL: 1-CLICK INSTANT DEMO ACCOUNTS SELECTOR -->
      <section class="demo-accounts-panel panel" aria-labelledby="demo-acc-heading">
        <div class="panel-header-custom">
          <div>
            <div class="panel-title-row">
              <h2 id="demo-acc-heading" class="demo-panel-title">Pilih Akun Pengguna (RBAC)</h2>
              <span class="accounts-count-pill">{{ filteredAccounts.length }} Akun Tersedia</span>
            </div>
            <p class="text-muted demo-panel-desc">
              Klik kartu untuk mengisi formulir, atau klik tombol <strong>"⚡ Masuk"</strong> untuk langsung login tanpa mengetik sandi.
            </p>
          </div>

          <!-- Category Filter Tabs & Search -->
          <div class="filter-controls-row">
            <div class="category-tabs">
              <button
                type="button"
                class="cat-tab-btn"
                :class="{ active: activeCategory === 'ALL' }"
                @click="activeCategory = 'ALL'"
              >
                Semua
              </button>
              <button
                type="button"
                class="cat-tab-btn"
                :class="{ active: activeCategory === 'EXEC' }"
                @click="activeCategory = 'EXEC'"
              >
                Manajemen & Keuangan
              </button>
              <button
                type="button"
                class="cat-tab-btn"
                :class="{ active: activeCategory === 'UNIT' }"
                @click="activeCategory = 'UNIT'"
              >
                Divisi Bisnis
              </button>
              <button
                type="button"
                class="cat-tab-btn"
                :class="{ active: activeCategory === 'OPS' }"
                @click="activeCategory = 'OPS'"
              >
                Kasir & Staf
              </button>
            </div>

            <div class="search-box">
              <input
                v-model="searchQuery"
                type="text"
                class="input input-search"
                placeholder="Cari nama, role, email..."
              />
            </div>
          </div>
        </div>

        <div class="demo-grid">
          <div
            v-for="acc in filteredAccounts"
            :key="acc.email"
            class="demo-role-card"
            :class="{ selected: email === acc.email }"
            @click="selectDemoAccount(acc)"
          >
            <div class="demo-card-top">
              <span class="role-pill" :style="{ backgroundColor: `${acc.color}18`, color: acc.color, borderColor: `${acc.color}35` }">
                {{ acc.roleCode }}
              </span>
              <span class="demo-unit">{{ acc.businessUnitName }}</span>
            </div>

            <div class="demo-user-meta">
              <strong class="demo-name">{{ acc.fullName }}</strong>
              <span class="demo-role-title">{{ acc.roleName }}</span>
              <span class="demo-email">{{ acc.email }}</span>
            </div>

            <div class="demo-card-actions">
              <button
                type="button"
                class="btn-instant-login"
                :disabled="loading"
                @click.stop="quickLogin(acc)"
              >
                <span>⚡ Masuk Langsung</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: clamp(20px, 4vw, 48px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-canvas);
  position: relative;
  overflow-x: hidden;
}

.login-container {
  width: 100%;
  max-width: 1240px;
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 28px;
  align-items: start;
  position: relative;
  z-index: 10;
}

/* 1. LEFT CARD */
.login-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.12);
}

.brand-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.login-logo-img {
  width: 52px;
  height: 54px;
  object-fit: contain;
  background: transparent;
  flex-shrink: 0;
}

.brand-hero-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.1;
}

.brand-tagline {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--primary);
  text-transform: uppercase;
}

.brand-badges {
  display: flex;
  gap: 8px;
  align-items: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.76rem;
  font-weight: 600;
}

.status-active {
  background: rgba(16, 185, 129, 0.12);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10B981;
  box-shadow: 0 0 8px #10B981;
}

.quick-select-box {
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  padding: 12px 14px;
  border-radius: 12px;
  margin-bottom: 18px;
}

.quick-select {
  width: 100%;
  margin-top: 6px;
  font-size: 0.88rem;
  font-weight: 600;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-hint {
  font-size: 0.76rem;
  color: var(--text-secondary);
  margin-top: 4px;
  display: block;
}

.input-hint code {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  color: var(--primary);
}

.btn-login-submit {
  width: 100%;
  margin-top: 6px;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.error-alert {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border: 1px solid var(--status-danger-border);
  margin-bottom: 14px;
  font-size: 0.88rem;
}

.login-footer-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  font-size: 0.74rem;
  color: var(--text-secondary);
}

/* 2. RIGHT CARD: DEMO ACCOUNTS */
.demo-accounts-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  padding: 28px 32px;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.08);
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.demo-panel-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.accounts-count-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--primary-soft);
  color: var(--primary);
  border: 1px solid rgba(3, 70, 147, 0.2);
}

.demo-panel-desc {
  margin-top: 6px;
  margin-bottom: 18px;
  font-size: 0.88rem;
}

.filter-controls-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cat-tab-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
}

.cat-tab-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.cat-tab-btn.active {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
  font-weight: 700;
}

.search-box {
  width: 100%;
}

.input-search {
  width: 100%;
  padding: 8px 14px;
  font-size: 0.84rem;
  border-radius: 10px;
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.demo-grid::-webkit-scrollbar {
  width: 6px;
}
.demo-grid::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 4px;
}

.demo-role-card {
  text-align: left;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.demo-role-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px -4px rgba(3, 70, 147, 0.15);
  background: var(--bg-hover);
}

.demo-role-card.selected {
  border: 2px solid var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 0 20px rgba(3, 70, 147, 0.16);
}

.demo-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.role-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.demo-unit {
  font-size: 0.72rem;
  color: var(--text-secondary);
  text-align: right;
  line-height: 1.2;
}

.demo-user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.demo-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.demo-role-title {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.demo-email {
  font-size: 0.74rem;
  color: var(--primary);
  font-weight: 600;
  margin-top: 2px;
}

.demo-card-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.btn-instant-login {
  background: var(--primary);
  color: #ffffff;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 140ms ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-instant-login:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
}

@media (max-width: 1024px) {
  .login-container {
    grid-template-columns: 1fr;
  }
  .demo-grid {
    max-height: 380px;
  }
}
</style>
