<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatDateTime } from '../utils/format';
import logoPmoEmblem from '../assets/logo-pmo-emblem.png';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const sidebarCollapsed = ref(false);
const mobileNavOpen = ref(false);
const notifDrawerOpen = ref(false);
const notifications = ref<any[]>([]);
const businessUnits = ref<any[]>([]);

// Close drawers on route navigation
watch(() => route.path, () => {
  mobileNavOpen.value = false;
  notifDrawerOpen.value = false;
});

// Prevent body scroll when mobile drawer is open
watch(mobileNavOpen, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
});

// Fast Command Palette / Quick Search (100% Real Navigation - Zero AI Slop)
const cmdPaletteOpen = ref(false);
const searchQuery = ref('');

interface NavLinkItem {
  label: string;
  to: string;
  iconName: string;
  permission?: string;
  badge?: string | number;
}

// 8 Kelompok Siklus Navigasi Sesuai Master Requirement Dokumen ERP PMO UTama
const allNavItems: NavLinkItem[] = [
  { label: 'Dashboard', to: '/', iconName: 'dashboard' },
  { label: 'Approval Inbox', to: '/approvals', iconName: 'approvals' },
  { label: 'Perencanaan Anggaran', to: '/budgets', iconName: 'budgets', permission: 'budget:view' },
  { label: 'Pengadaan & Beban', to: '/procurement', iconName: 'procurement', permission: 'procurement:view' },
  { label: 'Pendapatan & Kasir', to: '/revenue', iconName: 'revenue', permission: 'revenue:view' },
  { label: 'Kas & Rekonsiliasi', to: '/reconciliation', iconName: 'reconciliation', permission: 'reconciliation:view' },
  { label: 'Akuntansi & Jurnal', to: '/accounting', iconName: 'accounting', permission: 'accounting:view' },
  { label: 'Laporan & Strategi', to: '/reports', iconName: 'reports', permission: 'report:view' },
  { label: 'Administrasi & Audit', to: '/admin', iconName: 'admin', permission: 'audit:view' },
];

const visibleNavItems = computed(() => {
  return allNavItems.filter((item) => {
    if (!item.permission) return true;
    return auth.hasPermission(item.permission);
  });
});

const bottomNavItems: NavLinkItem[] = [
  { label: 'Settings', to: '/admin', iconName: 'settings', permission: 'admin:view' },
];

const quickActions = [
  { title: 'Dashboard Ringkasan Eksekutif', category: 'Navigasi', route: '/', shortcut: 'G D' },
  { title: 'Kasir & Point of Sales (POS)', category: 'Kasir & Kas', route: '/revenue', shortcut: 'G P' },
  { title: 'Sales Order & Faktur Penjualan', category: 'Pendapatan', route: '/revenue', shortcut: 'G S' },
  { title: 'Pengadaan, Quotation 3 Vendor & PO', category: 'Pengadaan', route: '/procurement', shortcut: 'G B' },
  { title: 'Perencanaan Plafon & Revisi Anggaran', category: 'Anggaran', route: '/budgets', shortcut: 'G A' },
  { title: 'Bagan Akun (CoA) & Jurnal Umum', category: 'Akuntansi', route: '/accounting', shortcut: 'G J' },
  { title: 'Rekonsiliasi Mutasi Rekening Koran Bank', category: 'Perbankan', route: '/reconciliation', shortcut: 'G R' },
  { title: 'Laporan Keuangan & Evaluasi Strategis', category: 'Laporan', route: '/reports', shortcut: 'G L' },
  { title: 'Kotak Masuk Persetujuan Berjenjang', category: 'Otorisasi', route: '/approvals', shortcut: 'G O' },
  { title: 'Manajemen Pengguna & Audit Trail', category: 'Sistem', route: '/admin', shortcut: 'G U' },
];

const filteredActions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return quickActions;
  return quickActions.filter(
    (a) => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
  );
});

function jumpToAction(act: (typeof quickActions)[0]) {
  cmdPaletteOpen.value = false;
  searchQuery.value = '';
  router.push(act.route);
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdPaletteOpen.value = !cmdPaletteOpen.value;
    if (cmdPaletteOpen.value) {
      searchQuery.value = '';
    }
  } else if (e.key === 'Escape' && cmdPaletteOpen.value) {
    cmdPaletteOpen.value = false;
  }
}

const userInitials = computed(() => {
  const name = auth.user?.fullName || 'PM';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
});

const isDarkMode = computed({
  get: () => auth.theme === 'dark',
  set: (val: boolean) => {
    auth.theme = val ? 'dark' : 'light';
    auth.applyTheme(auth.theme);
  },
});

async function loadMasterContext() {
  try {
    const res = await apiFetch('/master/overview');
    businessUnits.value = res.data.businessUnits || [];
  } catch {
    // Non-blocking
  }
}

async function openNotifications() {
  notifDrawerOpen.value = !notifDrawerOpen.value;
  if (notifDrawerOpen.value) {
    const res = await apiFetch('/reports/notifications');
    notifications.value = res.data || [];
  }
}

async function markRead(notif: any) {
  if (!notif.isRead) {
    await apiFetch(`/reports/notifications/${notif.id}/read`, { method: 'PATCH' });
    notif.isRead = true;
    auth.unreadNotifications = Math.max(0, auth.unreadNotifications - 1);
  }
  notifDrawerOpen.value = false;
  if (notif.targetUrl) {
    router.push(notif.targetUrl);
  }
}

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}

onMounted(() => {
  auth.applyTheme(auth.theme);
  auth.fetchMe();
  loadMasterContext();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="poital-shell">
    <a href="#main-workspace" class="skip-link">Lewati ke Konten Utama</a>

    <!-- Mobile Nav Backdrop Overlay -->
    <div
      v-if="mobileNavOpen"
      class="mobile-nav-backdrop"
      aria-hidden="true"
      @click="mobileNavOpen = false"
    ></div>

    <!-- Sidebar Navigation (Poital.flow Style) -->
    <aside
      class="sidebar-column"
      :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileNavOpen }"
      aria-label="Navigasi Utama"
    >
      <div class="sidebar-top">
        <router-link to="/" class="brand-header" title="PMO UTama Enterprise Workspace" @click="mobileNavOpen = false">
          <img :src="logoPmoEmblem" alt="PMO UTama" class="brand-logo-img" />
          <div class="brand-text-block">
            <span class="brand-title">PMO UTama</span>
            <span class="brand-flow">WORKSPACE</span>
          </div>
        </router-link>

        <!-- Close button visible on mobile screens -->
        <button
          type="button"
          class="sidebar-close-btn"
          aria-label="Tutup Navigasi"
          @click="mobileNavOpen = false"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <nav class="sidebar-menu">
        <router-link
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="nav-tab"
          :class="{ active: route.path === item.to }"
          @click="mobileNavOpen = false"
        >
          <span class="nav-icon-box">
            <!-- 1. Dashboard -->
            <svg v-if="item.iconName === 'dashboard'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <!-- 2. Approvals -->
            <svg v-else-if="item.iconName === 'approvals'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <!-- 3. Budgets -->
            <svg v-else-if="item.iconName === 'budgets'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v12M16 10H9.5a2.5 2.5 0 0 0 0 5H14"></path>
            </svg>
            <!-- 4. Procurement -->
            <svg v-else-if="item.iconName === 'procurement'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="21" r="1"></circle>
              <circle cx="19" cy="21" r="1"></circle>
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
            </svg>
            <!-- 5. Revenue & Cashier -->
            <svg v-else-if="item.iconName === 'revenue'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
              <path d="M12 6v2"></path>
              <path d="M12 16v2"></path>
            </svg>
            <!-- 6. Reconciliation & Bank -->
            <svg v-else-if="item.iconName === 'reconciliation'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18"></path>
              <path d="M3 10h18"></path>
              <path d="M5 6l7-3 7 3"></path>
              <path d="M4 10v11"></path>
              <path d="M20 10v11"></path>
              <path d="M8 14v4"></path>
              <path d="M12 14v4"></path>
              <path d="M16 14v4"></path>
            </svg>
            <!-- 7. Accounting & Ledger -->
            <svg v-else-if="item.iconName === 'accounting'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
              <path d="M7 21h10"></path>
              <path d="M12 3v18"></path>
              <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>
            </svg>
            <!-- 8. Reports & Strategy -->
            <svg v-else-if="item.iconName === 'reports'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>
            <!-- 9. Administration & Audit -->
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>

        <div class="menu-divider"></div>

        <!-- Bottom Menu Group -->
        <router-link
          v-for="item in bottomNavItems"
          :key="item.to"
          :to="item.to"
          class="nav-tab"
          :class="{ active: route.path === item.to }"
          @click="mobileNavOpen = false"
        >
          <span class="nav-icon-box">
            <svg v-if="item.iconName === 'settings'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>

        <!-- Help Action -->
        <button type="button" class="nav-tab action-tab" @click="cmdPaletteOpen = true; mobileNavOpen = false">
          <span class="nav-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </span>
          <span class="nav-label">Help</span>
        </button>

        <!-- Dark Mode Toggle Switch (Matches Screenshot Exact Switch) -->
        <div class="nav-tab switch-row">
          <span class="nav-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
            </svg>
          </span>
          <span class="nav-label">Dark mode</span>
          <label class="switch-control" aria-label="Toggle dark mode">
            <input type="checkbox" v-model="isDarkMode" class="switch-input" />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </div>

        <!-- Logout Action -->
        <button type="button" class="nav-tab action-tab logout-tab" @click="handleLogout">
          <span class="nav-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </span>
          <span class="nav-label">Logout</span>
        </button>
      </nav>
    </aside>

    <!-- Main Content Workspace (Padded Canvas) -->
    <div class="workspace-area">
      <!-- Top Search & Profile Bar -->
      <header class="top-header">
        <div class="header-left-cluster">
          <!-- Mobile Menu Trigger -->
          <button
            type="button"
            class="mobile-toggle-btn"
            aria-label="Buka Menu Navigasi"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <!-- Mobile Compact Brand Emblem (Only shown on small screens) -->
          <router-link to="/" class="mobile-brand" title="PMO UTama">
            <img :src="logoPmoEmblem" alt="PMO UTama" class="mobile-brand-logo" />
            <span class="mobile-brand-name">PMO UTama</span>
          </router-link>

          <!-- Search Container / Command Palette Trigger -->
          <div class="search-container">
            <div class="search-pill" title="Cari modul atau dokumen (Ctrl+K)" @click="cmdPaletteOpen = true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span class="search-placeholder">Type Here to Search</span>
              <kbd class="search-kbd">⌘K</kbd>
            </div>
          </div>
        </div>

        <div class="header-right-actions">
          <!-- Business Unit Selector (if multi-unit) -->
          <div v-if="!auth.user?.businessUnitId && businessUnits.length > 0" class="unit-dropdown-wrap">
            <select v-model="auth.selectedBusinessUnitId" class="unit-select" title="Pilih Unit Bisnis">
              <option value="">Semua Unit</option>
              <option v-for="u in businessUnits" :key="u.id" :value="u.id">
                {{ u.code }}
              </option>
            </select>
          </div>

          <!-- Notification Bell with Red Badge -->
          <button type="button" class="icon-circle-btn" aria-label="Notifikasi" @click="openNotifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
            </svg>
            <span class="notif-badge">2</span>
          </button>

          <!-- User Profile Avatar with Online Dot -->
          <div class="user-profile-circle" :title="`${auth.user?.fullName} (${auth.user?.roleName})`">
            <span class="avatar-text">{{ userInitials }}</span>
            <span class="online-indicator"></span>
          </div>
        </div>
      </header>

      <!-- Notification Drawer -->
      <div v-if="notifDrawerOpen" class="notif-drawer-box panel panel-elevated" role="region" aria-label="Pusat Notifikasi">
        <div class="drawer-header">
          <h3>Pusat Notifikasi & Peringatan</h3>
          <button type="button" class="btn btn-sm btn-ghost" @click="notifDrawerOpen = false">✕</button>
        </div>
        <div v-if="notifications.length === 0" class="empty-notif">Belum ada notifikasi baru untuk peran Anda.</div>
        <ul v-else class="notif-list-items">
          <li v-for="n in notifications" :key="n.id" class="notif-item-row" :class="{ unread: !n.isRead }">
            <div>
              <strong>{{ n.title }}</strong>
              <p>{{ n.message }}</p>
              <small>{{ formatDateTime(n.createdAt) }}</small>
            </div>
            <button type="button" class="btn btn-sm btn-primary" @click="markRead(n)">
              Buka
            </button>
          </li>
        </ul>
      </div>

      <!-- Command Palette / Quick Document Finder Modal (0% AI Slop) -->
      <div v-if="cmdPaletteOpen" class="cmd-palette-overlay" @click.self="cmdPaletteOpen = false">
        <div class="cmd-palette-box" role="dialog" aria-modal="true" aria-label="Quick Navigation">
          <div class="cmd-palette-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cmd-search-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              class="cmd-palette-input"
              placeholder="Cari modul, transaksi, atau dokumen ERP..."
              autofocus
            />
            <button type="button" class="btn btn-sm btn-ghost" @click="cmdPaletteOpen = false">Esc</button>
          </div>

          <div class="cmd-palette-body">
            <div class="cmd-section-title">Pintasan Cepat</div>
            <button
              v-for="act in filteredActions"
              :key="act.title"
              type="button"
              class="cmd-item"
              @click="jumpToAction(act)"
            >
              <span>{{ act.title }}</span>
              <span class="cmd-item-shortcut">{{ act.category }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Workspace Views -->
      <main id="main-workspace" class="content-canvas">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.poital-shell {
  min-height: 100vh;
  display: flex;
  background-color: var(--bg-canvas);
  color: var(--text-primary);
  padding: 16px;
  gap: 20px;
  max-width: 100vw;
  overflow-x: hidden;
}

/* Sidebar Column (Fixed / Sticky Poital Architecture) */
.sidebar-column {
  width: 230px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 16px;
  height: calc(100vh - 32px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 6px;
  transition: width 180ms ease;
  z-index: 40;
}

.sidebar-column::-webkit-scrollbar {
  width: 4px;
}

.sidebar-column::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}

.sidebar-column:hover::-webkit-scrollbar-thumb {
  background: var(--border-strong);
}

.sidebar-top {
  padding: 12px 14px 28px;
}

.brand-header {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.brand-logo-img {
  width: 36px;
  height: 38px;
  object-fit: contain;
  flex-shrink: 0;
  background: transparent;
}

.brand-text-block {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1.15;
}

.brand-flow {
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.12em;
  color: var(--primary);
  text-transform: uppercase;
}

.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 8px 14px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  border: 0;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 140ms ease;
}

.nav-tab:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.nav-tab.active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
  box-shadow: none;
}

.nav-tab.active .nav-icon-box {
  color: var(--primary);
}

.nav-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: currentColor;
}

.nav-tab.active .nav-icon-box {
  color: var(--text-primary);
}

.menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 16px 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch-row .switch-control {
  margin-left: auto;
}

.logout-tab:hover {
  color: var(--status-danger-text);
  background: var(--status-danger-bg);
}

/* Mobile Nav Backdrop Overlay */
.mobile-nav-backdrop {
  display: none;
}

/* Main Workspace Wrapper */
.workspace-area {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* Top Search & Profile Bar (Sticky with Canvas Background) */
.top-header {
  position: sticky;
  top: 0;
  z-index: 35;
  background: var(--bg-canvas);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0 12px 0;
  transition: background 150ms ease;
}

.header-left-cluster {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.mobile-brand-logo {
  width: 28px;
  height: 30px;
  object-fit: contain;
}

.mobile-brand-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.search-container {
  width: 100%;
  max-width: 300px;
}

.search-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 8px 16px;
  cursor: pointer;
  box-shadow: 0 2px 10px -2px rgba(15, 23, 42, 0.04);
  transition: all 140ms ease;
}

.search-pill:hover {
  border-color: var(--border-strong);
  box-shadow: 0 4px 14px -2px rgba(15, 23, 42, 0.08);
}

.search-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.search-placeholder {
  color: var(--text-secondary);
  font-size: 0.84rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-kbd {
  margin-left: auto;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.unit-dropdown-wrap .unit-select {
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  max-width: 170px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.unit-dropdown-wrap .unit-select:focus {
  outline: none;
  border-color: var(--primary);
}

.icon-circle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 2px 10px -2px rgba(15, 23, 42, 0.04);
  transition: all 140ms ease;
  flex-shrink: 0;
}

.icon-circle-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.notif-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  background: #f43f5e;
  color: #ffffff;
  font-size: 0.62rem;
  font-weight: 700;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-profile-circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #034693, #022b5c);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  box-shadow: 0 2px 10px -2px rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
}

.online-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid var(--bg-surface);
}

.mobile-toggle-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  flex-shrink: 0;
  transition: all 140ms ease;
}

.mobile-toggle-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.sidebar-close-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}

.sidebar-close-btn:hover {
  color: var(--text-primary);
  background: var(--border-subtle);
}

/* Notification Drawer */
.notif-drawer-box {
  position: absolute;
  top: 60px;
  right: 16px;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16);
  padding: 18px;
  z-index: 100;
  border: 1px solid var(--border-subtle);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.drawer-header h3 {
  font-size: 0.92rem;
  font-weight: 700;
}

.empty-notif {
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 12px 0;
}

.notif-list-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notif-item-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-subtle);
  font-size: 0.82rem;
}

/* Content Canvas */
.content-canvas {
  flex: 1;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}

/* Responsive Breakpoints */
@media (max-width: 900px) {
  .poital-shell {
    padding: 10px 12px;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    z-index: 998;
    animation: fadeIn 180ms ease-out;
  }

  .sidebar-column {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 270px;
    height: 100vh;
    background: var(--bg-surface);
    z-index: 999;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.28);
    padding: 16px 14px;
    transform: translateX(-100%);
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
    visibility: hidden;
  }

  .sidebar-column.mobile-open {
    transform: translateX(0);
    visibility: visible;
  }

  .sidebar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 18px;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 12px;
  }

  .sidebar-close-btn {
    display: flex;
  }

  .mobile-toggle-btn {
    display: flex;
  }

  .mobile-brand {
    display: flex;
  }

  .search-container {
    max-width: 170px;
  }

  .search-placeholder {
    display: none;
  }

  .search-kbd {
    display: none;
  }

  .search-pill {
    padding: 8px 10px;
  }
}

@media (max-width: 600px) {
  .top-header {
    gap: 8px;
  }

  .header-left-cluster {
    gap: 8px;
  }

  .mobile-brand-name {
    display: none;
  }

  .search-container {
    display: none;
  }

  .unit-dropdown-wrap .unit-select {
    max-width: 110px;
    font-size: 0.74rem;
    padding: 5px 8px;
  }

  .icon-circle-btn,
  .user-profile-circle,
  .mobile-toggle-btn {
    width: 36px;
    height: 36px;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
