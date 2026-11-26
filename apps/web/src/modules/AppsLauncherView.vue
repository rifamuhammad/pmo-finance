<script setup lang="ts">
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore, type FinanceWorkspace } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const openAiAssistant = inject<() => void>('openAiAssistant', () => {});

const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
const lockedShakeId = ref<string | null>(null);
const activeDomain = ref<FinanceWorkspace>('GATEWAY');

function syncDomainFromQuery() {
  const q = String(route.query.domain || '').toLowerCase();
  if (q === 'penerimaan' && auth.canAccessPenerimaan) {
    activeDomain.value = 'PENERIMAAN';
    auth.setWorkspace('PENERIMAAN');
  } else if (q === 'pengeluaran' && auth.canAccessPengeluaran) {
    activeDomain.value = 'PENGELUARAN';
    auth.setWorkspace('PENGELUARAN');
  } else {
    activeDomain.value = 'GATEWAY';
  }
}

interface AppTile {
  id: string;
  title: string;
  route?: string;
  action?: 'ai';
  gradient: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  permission?: string;
  tags: string[];
}

const penerimaanTiles = computed<AppTile[]>(() => [
  {
    id: 'dashboard',
    title: 'Dashboard',
    route: '/dashboard',
    gradient: 'linear-gradient(135deg, #034693, #022b5c)',
    icon: 'dashboard',
    tags: ['dashboard', 'pnl', 'penerimaan'],
  },
  {
    id: 'revenue',
    title: 'Buku Harian',
    route: '/revenue',
    permission: 'revenue:view',
    gradient: 'linear-gradient(135deg, #059669, #065f46)',
    icon: 'revenue',
    badge: 'Dokumen',
    badgeColor: '#059669',
    tags: ['buku harian', 'invoice', 'kwitansi', 'tanda terima', 'layanan', 'pendapatan', 'tarif'],
  },
  {
    id: 'reconciliation',
    title: 'Rekonsiliasi',
    route: '/reconciliation',
    permission: 'reconciliation:view',
    gradient: 'linear-gradient(135deg, #0d9488, #115e59)',
    icon: 'reconciliation',
    badge: 'Bank Mandiri',
    badgeColor: '#0d9488',
    tags: ['rekonsiliasi', 'bank', 'mandiri', 'mutasi', 'rekening penerimaan'],
  },
  {
    id: 'penerimaan-pembukuan',
    title: 'Pembukuan',
    route: '/penerimaan/pembukuan',
    permission: 'revenue:view',
    gradient: 'linear-gradient(135deg, #4f46e5, #3730a3)',
    icon: 'accounting',
    badge: 'Umum & Pajak',
    badgeColor: '#4f46e5',
    tags: ['pembukuan', 'umum', 'bku', 'pajak', 'surat penarikan', 'jurnal', 'bukti potong'],
  },
  {
    id: 'penerimaan-laporan',
    title: 'Laporan Penerimaan',
    route: '/penerimaan/laporan',
    permission: 'revenue:view',
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    icon: 'reports',
    badge: 'Unit & Aging',
    badgeColor: '#2563eb',
    tags: ['laporan penerimaan', 'aging', 'piutang', 'coa', 'realisasi', 'mice', 'klinik', 'it solution', 'tci'],
  },
]);

const pengeluaranTiles = computed<AppTile[]>(() => [
  {
    id: 'dashboard',
    title: 'Dashboard',
    route: '/dashboard',
    gradient: 'linear-gradient(135deg, #034693, #022b5c)',
    icon: 'dashboard',
    tags: ['dashboard', 'pnl', 'neraca'],
  },
  {
    id: 'budgets',
    title: 'Perencanaan & Pagu',
    route: '/budgets',
    permission: 'budget:view',
    gradient: 'linear-gradient(135deg, #059669, #065f46)',
    icon: 'budgets',
    badge: 'e-Budgeting',
    badgeColor: '#059669',
    tags: ['anggaran', 'pagu', 'drauk', 'revisi'],
  },
  {
    id: 'petty-cash',
    title: 'Uang Persediaan',
    route: '/petty-cash',
    permission: 'procurement:view',
    gradient: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
    icon: 'petty-cash',
    badge: 'e-Tax / GUP',
    badgeColor: '#0ea5e9',
    tags: ['gup', 'tup', 'kas kecil', 'spj', 'pajak', 'etax'],
  },
  {
    id: 'procurement',
    title: 'Pengadaan & Bayar',
    route: '/procurement',
    permission: 'procurement:view',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    icon: 'procurement',
    badge: 'Expenditure',
    badgeColor: '#0284c7',
    tags: ['pengadaan', 'pr', 'po', 'bast', 'vendor', 'pembayaran', 'biaya', 'aging'],
  },
  {
    id: 'hris',
    title: 'Honorarium & Gaji',
    route: '/hris',
    permission: 'admin:view',
    gradient: 'linear-gradient(135deg, #059669, #047857)',
    icon: 'hris',
    badge: 'LS Gaji',
    badgeColor: '#10b981',
    tags: ['hris', 'gaji', 'payroll', 'lembur'],
  },
  {
    id: 'assets',
    title: 'Inventaris & Aset',
    route: '/assets',
    permission: 'accounting:view',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    icon: 'assets',
    badge: 'PBI UT',
    badgeColor: '#f59e0b',
    tags: ['aset', 'inventaris', 'penyusutan'],
  },
  {
    id: 'reconciliation',
    title: 'Rekonsiliasi Bank',
    route: '/reconciliation',
    permission: 'reconciliation:view',
    gradient: 'linear-gradient(135deg, #0d9488, #115e59)',
    icon: 'reconciliation',
    tags: ['rekonsiliasi', 'bank', 'mutasi'],
  },
  {
    id: 'accounting',
    title: 'Akuntansi & Jurnal',
    route: '/accounting',
    permission: 'accounting:view',
    gradient: 'linear-gradient(135deg, #4f46e5, #3730a3)',
    icon: 'accounting',
    tags: ['akuntansi', 'jurnal', 'buku besar', 'coa'],
  },
  {
    id: 'reports',
    title: 'Laporan Keuangan',
    route: '/reports',
    permission: 'report:view',
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    icon: 'reports',
    tags: ['laporan', 'neraca', 'isak 335'],
  },
]);

const filteredTiles = computed(() => {
  const source = activeDomain.value === 'PENERIMAAN' ? penerimaanTiles.value : pengeluaranTiles.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return source;
  return source.filter(
    (tile) => tile.title.toLowerCase().includes(q) || tile.tags.some((t) => t.toLowerCase().includes(q))
  );
});

const quickDockLinks = computed(() => {
  const list = [
    { id: 'q-dash', label: 'Dashboard', route: '/dashboard' },
    {
      id: 'q-apr',
      label: 'Approvals',
      route: '/approvals',
      permission: 'approval:view',
      badge: auth.pendingApprovalsCount > 0 ? auth.pendingApprovalsCount : 0,
    },
    { id: 'q-rep', label: 'Laporan', route: '/reports', permission: 'report:view' },
    { id: 'q-adm', label: 'Audit', route: '/admin', permission: 'admin:view' },
  ];
  return list.filter((x) => !x.permission || auth.hasPermission(x.permission));
});

function isTileLocked(tile: AppTile): boolean {
  if (!tile.permission) return false;
  return !auth.hasPermission(tile.permission);
}

function triggerShake(id: string) {
  lockedShakeId.value = id;
  setTimeout(() => {
    if (lockedShakeId.value === id) lockedShakeId.value = null;
  }, 420);
}

function enterDomain(domain: 'PENERIMAAN' | 'PENGELUARAN') {
  const allowed = domain === 'PENERIMAAN' ? auth.canAccessPenerimaan : auth.canAccessPengeluaran;
  if (!allowed) {
    triggerShake(domain);
    auth.triggerAccessDenied(domain === 'PENERIMAAN' ? 'Penerimaan' : 'Pengeluaran');
    return;
  }
  searchQuery.value = '';
  auth.setWorkspace(domain);
  activeDomain.value = domain;
  router.replace({ path: '/', query: { domain: domain.toLowerCase() } });
}

function backToGateway() {
  searchQuery.value = '';
  auth.resetWorkspace();
  activeDomain.value = 'GATEWAY';
  router.replace({ path: '/' });
}

function launchApp(tile: AppTile) {
  if (isTileLocked(tile)) {
    triggerShake(tile.id);
    auth.triggerAccessDenied(tile.title);
    return;
  }
  if (tile.action === 'ai') {
    openAiAssistant();
  } else if (tile.route) {
    router.push(tile.route);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && activeDomain.value !== 'GATEWAY') {
    backToGateway();
  }
}

watch(() => route.query.domain, syncDomainFromQuery);

onMounted(() => {
  syncDomainFromQuery();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="launchpad-main-view">
    <div class="launchpad-container">
      <Transition name="launchpad-morph" mode="out-in">
        <!-- STAGE 1: 2 CLEAN ANIMATED DOMAIN CARDS (MACOS LAUNCHPAD STYLE) -->
        <section
          v-if="activeDomain === 'GATEWAY'"
          key="gateway-two-cards"
          class="gateway-center-wrap"
          aria-label="Pilih Ruang Kerja Keuangan"
        >
          <div class="gateway-two-grid">
            <!-- CARD 1: PENERIMAAN -->
            <div
              class="domain-glass-card"
              :class="{
                'is-locked': !auth.canAccessPenerimaan,
                'shake-locked': lockedShakeId === 'PENERIMAAN',
              }"
              tabindex="0"
              role="button"
              aria-label="Masuk Modul Penerimaan"
              @click="enterDomain('PENERIMAAN')"
              @keydown.enter="enterDomain('PENERIMAAN')"
              @keydown.space.prevent="enterDomain('PENERIMAAN')"
            >
              <div
                class="domain-squircle"
                style="background: linear-gradient(135deg, #059669, #065f46)"
              >
                <span v-if="!auth.canAccessPenerimaan" class="app-lock-badge" title="Akses Dibatasi">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
                  </svg>
                </span>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v12"></path>
                  <path d="m8 11 4 4 4-4"></path>
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
                </svg>
              </div>

              <h2 class="domain-card-title">Penerimaan</h2>
              <span class="domain-card-hint">
                {{ auth.canAccessPenerimaan ? 'Invoice · Kwitansi · Rekonsiliasi' : 'Akses Dibatasi' }}
              </span>
            </div>

            <!-- CARD 2: PENGELUARAN -->
            <div
              class="domain-glass-card"
              :class="{
                'is-locked': !auth.canAccessPengeluaran,
                'shake-locked': lockedShakeId === 'PENGELUARAN',
              }"
              tabindex="0"
              role="button"
              aria-label="Masuk Modul Pengeluaran"
              @click="enterDomain('PENGELUARAN')"
              @keydown.enter="enterDomain('PENGELUARAN')"
              @keydown.space.prevent="enterDomain('PENGELUARAN')"
            >
              <div
                class="domain-squircle"
                style="background: linear-gradient(135deg, #034693, #022b5c)"
              >
                <span v-if="!auth.canAccessPengeluaran" class="app-lock-badge" title="Akses Dibatasi">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
                  </svg>
                </span>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 21V9"></path>
                  <path d="m16 13-4-4-4 4"></path>
                  <path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"></path>
                </svg>
              </div>

              <h2 class="domain-card-title">Pengeluaran</h2>
              <span class="domain-card-hint">
                {{ auth.canAccessPengeluaran ? 'Anggaran · Kas Kecil · Belanja · Gaji' : 'Akses Dibatasi' }}
              </span>
            </div>
          </div>

          <!-- Minimal Quick Links Bar -->
          <nav class="gateway-quick-pills" aria-label="Akses Cepat">
            <button
              v-for="item in quickDockLinks"
              :key="item.id"
              type="button"
              class="quick-pill-btn"
              @click="router.push(item.route)"
            >
              <span>{{ item.label }}</span>
              <span v-if="item.badge" class="quick-pill-count">{{ item.badge }}</span>
            </button>
            <button type="button" class="quick-pill-btn" @click="openAiAssistant()">
              <span>AI Assistant</span>
            </button>
          </nav>
        </section>

        <!-- STAGE 2: ORIGINAL MACOS LAUNCHPAD GRID FILTERED BY DOMAIN -->
        <section
          v-else
          :key="`domain-${activeDomain}`"
          class="domain-launchpad-stage"
          :aria-label="`Menu ${activeDomain}`"
        >
          <!-- Minimal Top Pill Bar: Back + Switcher + Search -->
          <div class="launchpad-controls-row">
            <button type="button" class="pill-back-btn" @click="backToGateway">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Menu Utama</span>
            </button>

            <div class="pill-domain-switch" role="tablist">
              <button
                type="button"
                role="tab"
                class="pill-sw-item"
                :class="{ active: activeDomain === 'PENERIMAAN', locked: !auth.canAccessPenerimaan }"
                :aria-selected="activeDomain === 'PENERIMAAN'"
                @click="enterDomain('PENERIMAAN')"
              >
                Penerimaan
              </button>
              <button
                type="button"
                role="tab"
                class="pill-sw-item"
                :class="{ active: activeDomain === 'PENGELUARAN', locked: !auth.canAccessPengeluaran }"
                :aria-selected="activeDomain === 'PENGELUARAN'"
                @click="enterDomain('PENGELUARAN')"
              >
                Pengeluaran
              </button>
            </div>

            <div class="launchpad-search-bar">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="launchpad-search-icon"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                class="launchpad-search-input"
                placeholder="Cari modul..."
                autocomplete="off"
                spellcheck="false"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="search-clear-btn"
                title="Bersihkan"
                @click="searchQuery = ''; searchInputRef?.focus()"
              >
                &times;
              </button>
            </div>
          </div>

          <!-- Clean macOS Launchpad App Grid (Icon + Nama Singkat Aja) -->
          <main class="launchpad-grid" role="region" :aria-label="`Modul ${activeDomain}`">
            <div v-if="filteredTiles.length === 0" class="launchpad-empty">
              <p>Tidak ada modul untuk "{{ searchQuery }}"</p>
              <button type="button" class="pill-back-btn" @click="searchQuery = ''">
                Reset Pencarian
              </button>
            </div>

            <div
              v-for="tile in filteredTiles"
              v-else
              :key="tile.id"
              class="launchpad-app-card"
              :class="{
                'is-locked': isTileLocked(tile),
                'shake-locked': lockedShakeId === tile.id,
              }"
              tabindex="0"
              role="button"
              :aria-label="`Buka ${tile.title}`"
              @click="launchApp(tile)"
              @keydown.enter="launchApp(tile)"
              @keydown.space.prevent="launchApp(tile)"
            >
              <div class="app-icon-squircle" :style="{ background: tile.gradient }">
                <span
                  v-if="tile.badge && !isTileLocked(tile)"
                  class="app-badge"
                  :style="{ background: tile.badgeColor || '#034693' }"
                >
                  {{ tile.badge }}
                </span>

                <span v-if="isTileLocked(tile)" class="app-lock-badge" title="Akses Dibatasi">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
                  </svg>
                </span>

                <svg v-if="tile.icon === 'dashboard'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="9" rx="1.5"></rect>
                  <rect x="14" y="3" width="7" height="5" rx="1.5"></rect>
                  <rect x="14" y="12" width="7" height="9" rx="1.5"></rect>
                  <rect x="3" y="16" width="7" height="5" rx="1.5"></rect>
                </svg>

                <svg v-else-if="tile.icon === 'approvals'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>

                <svg v-else-if="tile.icon === 'budgets'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>

                <svg v-else-if="tile.icon === 'procurement'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-2z"></path>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>

                <svg v-else-if="tile.icon === 'expenses'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                  <line x1="2" y1="10" x2="22" y2="10"></line>
                </svg>

                <svg v-else-if="tile.icon === 'revenue'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>

                <svg v-else-if="tile.icon === 'reconciliation'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>

                <svg v-else-if="tile.icon === 'accounting'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>

                <svg v-else-if="tile.icon === 'petty-cash'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                  <line x1="12" y1="12" x2="12" y2="18"></line>
                </svg>

                <svg v-else-if="tile.icon === 'assets'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>

                <svg v-else-if="tile.icon === 'hris'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>

                <svg v-else-if="tile.icon === 'reports'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>

                <svg v-else-if="tile.icon === 'admin'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>

                <svg v-else width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                </svg>
              </div>

              <div class="app-text-block">
                <span class="app-title">{{ tile.title }}</span>
                <span v-if="isTileLocked(tile)" class="app-lock-sub">Akses Dibatasi</span>
              </div>
            </div>
          </main>
        </section>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.launchpad-main-view {
  width: 100%;
  min-height: calc(100vh - 65px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 24px 72px;
}

.launchpad-container {
  width: 100%;
  max-width: 1020px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Smooth Apple-like morph transition between 2-Card Gateway and App Grid */
.launchpad-morph-enter-active,
.launchpad-morph-leave-active {
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.launchpad-morph-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

.launchpad-morph-leave-to {
  opacity: 0;
  transform: scale(1.02) translateY(-6px);
}

/* STAGE 1: 2 CLEAN GLASS CARDS (ORIGINAL LAUNCHPAD LANGUAGE) */
.gateway-center-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.gateway-two-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 320px));
  gap: 28px;
  justify-content: center;
  width: 100%;
}

.domain-glass-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 44px 28px 38px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.32);
  cursor: pointer;
  user-select: none;
  outline: none;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background 200ms ease,
    border-color 200ms ease,
    box-shadow 200ms ease;
}

.domain-glass-card:hover:not(.is-locked) {
  transform: translateY(-8px) scale(1.03);
  background: rgba(255, 255, 255, 0.11);
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 26px 56px rgba(0, 0, 0, 0.45);
}

.domain-glass-card:active:not(.is-locked) {
  transform: scale(0.98);
}

.domain-glass-card:focus-visible {
  outline: 2px solid #f59e0b;
  outline-offset: 4px;
}

.domain-glass-card.is-locked {
  cursor: not-allowed;
  opacity: 0.45;
  border-style: dashed;
}

.domain-squircle {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.38), inset 0 1px 1px rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.22);
  margin-bottom: 20px;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.domain-glass-card:hover:not(.is-locked) .domain-squircle {
  transform: scale(1.06);
}

.domain-card-title {
  margin: 0;
  color: #ffffff;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.domain-card-hint {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.82rem;
  font-weight: 500;
}

.gateway-quick-pills {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.quick-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 7px 16px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.quick-pill-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: translateY(-2px);
}

.quick-pill-count {
  background: #ef4444;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 9999px;
}

/* STAGE 2: ORIGINAL MACOS LAUNCHPAD GRID */
.domain-launchpad-stage {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 34px;
}

.launchpad-controls-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pill-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 8px 16px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease;
}

.pill-back-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.pill-domain-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.pill-sw-item {
  min-height: 32px;
  padding: 5px 14px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}

.pill-sw-item.active {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.pill-sw-item.locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.launchpad-search-bar {
  position: relative;
  width: 100%;
  max-width: 280px;
  min-height: 40px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  padding: 6px 14px;
  transition: background 180ms ease, border-color 180ms ease;
}

.launchpad-search-bar:focus-within {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(245, 158, 11, 0.7);
}

.launchpad-search-icon {
  color: rgba(255, 255, 255, 0.65);
  margin-right: 8px;
  flex-shrink: 0;
}

.launchpad-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 0.86rem;
  color: #ffffff;
}

.launchpad-search-input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.search-clear-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #ffffff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.launchpad-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 28px 16px;
  width: 100%;
  justify-items: center;
}

.launchpad-app-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  width: 100%;
  max-width: 160px;
  padding: 14px 10px;
  border-radius: 18px;
  background: transparent;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), background 180ms ease;
  user-select: none;
  outline: none;
}

.launchpad-app-card:hover {
  transform: translateY(-6px) scale(1.06);
  background: rgba(255, 255, 255, 0.08);
}

.launchpad-app-card:focus-visible {
  outline: 2px solid #f59e0b;
  outline-offset: 4px;
}

.launchpad-app-card:active {
  transform: scale(0.96);
}

.app-icon-squircle {
  position: relative;
  width: 76px;
  height: 76px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-bottom: 12px;
  transition: box-shadow 200ms ease;
}

.launchpad-app-card:hover .app-icon-squircle {
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.6);
}

.app-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 9999px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}

.app-text-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.app-title {
  color: #ffffff;
  font-size: 0.86rem;
  font-weight: 600;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  line-height: 1.25;
}

.app-lock-sub {
  font-size: 0.68rem;
  color: #f87171;
  font-weight: 600;
  margin-top: 3px;
}

.launchpad-app-card.is-locked {
  cursor: not-allowed !important;
}

.launchpad-app-card.is-locked .app-icon-squircle {
  filter: grayscale(0.85);
  opacity: 0.38;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  box-shadow: none !important;
}

.app-lock-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #dc2626;
  color: #ffffff;
  padding: 4px;
  border-radius: 9999px;
  border: 2px solid #061224;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

@keyframes lockShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

.shake-locked {
  animation: lockShake 360ms ease !important;
}

.launchpad-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.92rem;
  margin-top: 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

@media (max-width: 700px) {
  .gateway-two-grid {
    grid-template-columns: 1fr;
    max-width: 340px;
  }

  .domain-glass-card {
    padding: 32px 24px;
  }
}
</style>
