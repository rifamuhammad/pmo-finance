<script setup lang="ts">
import { ref, computed, watch, provide, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatDateTime } from '../utils/format';
import logoPmoEmblem from '../assets/logo-pmo-emblem.png';
import AiAssistantWidget from '../components/AiAssistantWidget.vue';
import AppLauncherModal from '../components/AppLauncherModal.vue';
import MacDock from '../components/MacDock.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const isHomeLauncher = computed(() => route.path === '/' || route.path === '/apps');

// Dynamic context for the breadcrumb in the top navbar
const currentModuleContext = computed(() => {
  const path = route.path;
  if (path === '/' || path === '/apps') {
    return { section: 'Home Hub', title: 'Menu Aplikasi' };
  }
  if (path.startsWith('/dashboard')) {
    return { section: 'Ikhtisar', title: 'Executive Dashboard' };
  }
  if (path.startsWith('/approvals')) {
    return { section: 'Otorisasi', title: 'Approval Inbox' };
  }
  if (path.startsWith('/budgets')) {
    return { section: 'Perencanaan', title: 'Perencanaan Anggaran' };
  }
  if (path.startsWith('/procurement')) {
    if (route.query.tab === 'expenses') {
      return { section: 'Beban', title: 'Expenses & Klaim' };
    }
    return { section: 'Pengadaan', title: 'Pengadaan Lab & PO' };
  }
  if (path.startsWith('/revenue')) {
    return { section: 'Finansial', title: 'Pendapatan & Kasir POS' };
  }
  if (path.startsWith('/reconciliation')) {
    return { section: 'Finansial', title: 'Kas & Rekonsiliasi Bank' };
  }
  if (path.startsWith('/accounting')) {
    return { section: 'Finansial', title: 'Akuntansi & Jurnal Umum' };
  }
  if (path.startsWith('/reports')) {
    return { section: 'Laporan', title: 'Laporan & Strategis' };
  }
  if (path.startsWith('/admin')) {
    return { section: 'Tata Kelola', title: 'Administrasi & Audit' };
  }
  return { section: 'Workspace', title: 'PMO Finance' };
});

const sidebarCollapsed = ref(
  typeof window !== 'undefined' ? localStorage.getItem('pmo_sidebar_collapsed') === 'true' : false
);
const mobileNavOpen = ref(false);
const notifDrawerOpen = ref(false);
const profileMenuOpen = ref(false);
const aiAssistantOpen = ref(false);
const appLauncherOpen = ref(false);
const notifications = ref<any[]>([]);
const businessUnits = ref<any[]>([]);

// Provide open AI assistant action to child views like AppsLauncherView
provide('openAiAssistant', () => {
  aiAssistantOpen.value = true;
});

// Persist desktop sidebar collapse state
watch(sidebarCollapsed, (val) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('pmo_sidebar_collapsed', String(val));
  }
});

// Close drawers and menus on route navigation
watch(() => route.path, () => {
  mobileNavOpen.value = false;
  notifDrawerOpen.value = false;
  profileMenuOpen.value = false;
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

interface NavItem {
  id: string;
  label: string;
  to?: string;
  iconName: string;
  permission?: string;
  badge?: string | number;
  badgeType?: 'default' | 'qwen' | 'odoo';
  action?: 'ai' | 'apps';
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

// 5 Kelompok Navigasi Terstruktur ERP PMO UTama Sesuai Master Requirement Dokumen
const navGroups: NavGroup[] = [
  {
    id: 'core',
    title: 'Ikhtisar & Otorisasi',
    items: [
      { id: 'apps', label: 'Menu Aplikasi', to: '/', iconName: 'apps' },
      { id: 'dashboard', label: 'Executive Dashboard', to: '/dashboard', iconName: 'dashboard' },
      { id: 'approvals', label: 'Approval Inbox', to: '/approvals', iconName: 'approvals' },
    ],
  },
  {
    id: 'planning',
    title: 'Perencanaan & Pengadaan',
    items: [
      { id: 'budgets', label: 'Perencanaan Anggaran', to: '/budgets', iconName: 'budgets', permission: 'budget:view' },
      { id: 'procurement', label: 'Pengadaan Lab & PO', to: '/procurement', iconName: 'procurement', permission: 'procurement:view' },
      { id: 'expenses', label: 'Klaim Biaya (Expenses)', to: '/procurement?tab=expenses', iconName: 'expenses', permission: 'procurement:view', badge: 'Expenses', badgeType: 'odoo' },
    ],
  },
  {
    id: 'operations',
    title: 'Finansial & Kas',
    items: [
      { id: 'revenue', label: 'Pendapatan & Kasir', to: '/revenue', iconName: 'revenue', permission: 'revenue:view' },
      { id: 'reconciliation', label: 'Kas & Rekonsiliasi', to: '/reconciliation', iconName: 'reconciliation', permission: 'reconciliation:view' },
      { id: 'accounting', label: 'Akuntansi & Jurnal', to: '/accounting', iconName: 'accounting', permission: 'accounting:view' },
    ],
  },
  {
    id: 'analytics',
    title: 'Laporan & Tata Kelola',
    items: [
      { id: 'reports', label: 'Laporan & Strategi', to: '/reports', iconName: 'reports', permission: 'report:view' },
      { id: 'admin', label: 'Administrasi & Audit', to: '/admin', iconName: 'admin', permission: 'audit:view' },
    ],
  },
  {
    id: 'tools',
    title: 'Peralatan Cerdas',
    items: [
      { id: 'ai', label: 'AI Assistant Copilot', to: '#ai', iconName: 'ai', action: 'ai', badge: 'Qwen AI', badgeType: 'qwen' },
      { id: 'apps-modal', label: 'Aplikasi ERP (Launcher)', to: '#apps', iconName: 'apps', action: 'apps' },
    ],
  },
];

const visibleNavGroups = computed(() => {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permission) return true;
        return auth.hasPermission(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
});

// Penentuan menu aktif yang akurat (termasuk query tab khusus seperti /procurement?tab=expenses)
function isItemActive(item: NavItem): boolean {
  if (item.action) return false;
  if (!item.to) return false;
  if (item.to.includes('?')) {
    return route.fullPath === item.to;
  }
  if (item.to === '/procurement') {
    return route.path === '/procurement' && (!route.query.tab || route.query.tab !== 'expenses');
  }
  if (item.to === '/') {
    return route.path === '/' || route.path === '';
  }
  return route.path === item.to;
}

const quickActions = [
  { title: 'Menu Aplikasi ERP (Home Launchpad)', category: 'Navigasi', route: '/', shortcut: 'G M' },
  { title: 'Dashboard Ringkasan Eksekutif', category: 'Navigasi', route: '/dashboard', shortcut: 'G D' },
  { title: 'AI Assistant Copilot (Analisis Cerdas ERP)', category: 'Asisten', route: '#ai', action: 'ai', shortcut: 'G Q' },
  { title: 'Expenses & Reimbursement (Klaim Staf)', category: 'Beban', route: '/procurement?tab=expenses', shortcut: 'G E' },
  { title: 'Aplikasi ERP (Launcher Modul Odoo)', category: 'Navigasi', route: '#apps', action: 'apps', shortcut: 'G L' },
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
  if (act.action === 'ai') {
    aiAssistantOpen.value = true;
  } else if (act.action === 'apps') {
    appLauncherOpen.value = true;
  } else if (act.route) {
    router.push(act.route);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdPaletteOpen.value = !cmdPaletteOpen.value;
    if (cmdPaletteOpen.value) {
      searchQuery.value = '';
    }
  } else if (e.key === 'Escape') {
    if (profileMenuOpen.value) {
      profileMenuOpen.value = false;
    }
    if (cmdPaletteOpen.value) {
      cmdPaletteOpen.value = false;
    }
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.nav-user-profile-wrap')) {
    profileMenuOpen.value = false;
  }
}

const currentBusinessUnitLabel = computed(() => {
  if (auth.user?.businessUnitId) {
    const found = businessUnits.value.find((u) => u.id === auth.user?.businessUnitId);
    return found ? found.name || found.code : 'Unit Khusus';
  }
  if (auth.selectedBusinessUnitId) {
    const found = businessUnits.value.find((u) => u.id === auth.selectedBusinessUnitId);
    return found ? found.name || found.code : 'Semua Unit (Pusat)';
  }
  return 'Semua Unit (Pusat)';
});

const userInitials = computed(() => {
  const name = auth.user?.fullName || 'PM';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
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
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="poital-shell" :class="{ 'is-odoo-launcher': isHomeLauncher }">
    <a href="#main-workspace" class="skip-link">Lewati ke Konten Utama</a>

    <!-- Top Executive Header: 100% Full-Width, Persistent, Deep Navy across ALL Pages -->
    <header class="top-header" :class="{ 'is-launcher-header': isHomeLauncher }">
      <div class="header-left-cluster">
        <!-- Brand Identifier saat di Home Launcher Screen (Clean, Zero Text Redundancy) -->
        <div v-if="isHomeLauncher" class="nav-brand-group">
          <img :src="logoPmoEmblem" alt="PMO UTama" class="nav-brand-logo" />
          <span class="nav-brand-text">PMO UTama</span>
        </div>

        <!-- Dynamic Breadcrumb Navigation saat di dalam Modul Kerja -->
        <nav v-else class="nav-breadcrumb-trail" aria-label="Breadcrumb Navigasi">
          <router-link to="/" class="bc-crumb-link" title="Kembali ke Menu Aplikasi">
            <img :src="logoPmoEmblem" alt="PMO UTama" class="bc-crumb-logo" />
            <span class="bc-crumb-text">PMO UTama</span>
          </router-link>
          <span class="bc-sep">/</span>
          <span class="bc-section">{{ currentModuleContext.section }}</span>
          <span v-if="currentModuleContext.title !== currentModuleContext.section" class="bc-sep">/</span>
          <span v-if="currentModuleContext.title !== currentModuleContext.section" class="bc-title">{{ currentModuleContext.title }}</span>
        </nav>
      </div>

      <!-- Center Global Search / Fast Command Palette (Hanya tampil di dalam modul kerja) -->
      <div v-if="!isHomeLauncher" class="header-center-cluster">
        <div
          class="nav-search-pill"
          role="button"
          tabindex="0"
          title="Cari modul, transaksi, atau dokumen (⌘K)"
          @click="cmdPaletteOpen = true"
          @keydown.enter="cmdPaletteOpen = true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="nav-search-svg">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span class="nav-search-text">Cari transaksi atau tekan ⌘K...</span>
          <kbd class="nav-search-kbd">⌘K</kbd>
        </div>
      </div>

      <!-- Right Corporate Utilities -->
      <div class="header-right-actions">
        <!-- Multi-Unit Selector (Hanya tampil di dalam modul kerja, disembunyikan di Menu Aplikasi) -->
        <div v-if="!isHomeLauncher && !auth.user?.businessUnitId && businessUnits.length > 0" class="clean-unit-wrap">
          <select v-model="auth.selectedBusinessUnitId" class="clean-unit-select" title="Pilih Unit Bisnis">
            <option value="">PMO UTama (Pusat)</option>
            <option v-for="u in businessUnits" :key="u.id" :value="u.id">
              {{ u.name || u.code }}
            </option>
          </select>
        </div>

        <!-- AI Assistant Quick Trigger (Hanya tampil di dalam modul kerja) -->
        <button
          v-if="!isHomeLauncher"
          type="button"
          class="nav-icon-circle-btn"
          title="AI Financial Assistant"
          aria-label="AI Assistant"
          @click="aiAssistantOpen = true"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
        </button>

        <!-- Notification Bell -->
        <button
          type="button"
          class="nav-icon-circle-btn"
          :class="{ active: notifDrawerOpen }"
          aria-label="Pusat Notifikasi"
          title="Pusat Notifikasi & Peringatan Keuangan"
          @click="openNotifications"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
          </svg>
          <span class="nav-notif-badge">2</span>
        </button>

        <!-- User Profile Avatar Capsule -->
        <div class="nav-user-profile-wrap">
          <button
            type="button"
            class="nav-user-capsule"
            :class="{ 'is-active': profileMenuOpen }"
            aria-label="Menu Profil & Pengaturan Akun"
            aria-haspopup="true"
            :aria-expanded="profileMenuOpen"
            @click.stop="profileMenuOpen = !profileMenuOpen"
          >
            <div class="user-capsule-avatar">
              <span>{{ userInitials }}</span>
              <span class="user-capsule-status"></span>
            </div>
            <div class="user-capsule-text">
              <span class="user-capsule-name">{{ auth.user?.fullName || 'Pengguna PMO' }}</span>
              <span class="user-capsule-role">{{ auth.user?.roleName || auth.user?.roleCode || 'Super Admin' }}</span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="user-capsule-chevron">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <!-- Dropdown Menu Box -->
          <transition name="dropdown-slide">
            <div
              v-if="profileMenuOpen"
              class="profile-dropdown-card"
              role="menu"
              aria-label="Menu Pengguna"
              @click.stop
            >
              <!-- Profile Header Information -->
              <div class="dropdown-header-block">
                <div class="dropdown-user-row">
                  <div class="dropdown-avatar">
                    {{ userInitials }}
                  </div>
                  <div class="dropdown-user-meta">
                    <div class="dropdown-full-name">{{ auth.user?.fullName || 'Pengguna PMO' }}</div>
                    <div class="dropdown-sub-info">{{ auth.user?.email || 'admin@pmoutama.id' }}</div>
                  </div>
                </div>

                <div class="dropdown-badges-row">
                  <span class="dropdown-role-badge">{{ auth.user?.roleName || auth.user?.roleCode || 'Super Admin' }}</span>
                  <span class="dropdown-unit-badge">🏢 {{ currentBusinessUnitLabel }}</span>
                </div>
              </div>

              <div class="dropdown-divider"></div>

              <!-- Navigation Action Links -->
              <div class="dropdown-menu-list">
                <router-link
                  to="/admin"
                  class="dropdown-menu-item"
                  role="menuitem"
                  @click="profileMenuOpen = false"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Pengaturan Sistem & Profil</span>
                </router-link>

                <button
                  type="button"
                  class="dropdown-menu-item"
                  role="menuitem"
                  @click="cmdPaletteOpen = true; profileMenuOpen = false"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>Pusat Navigasi & Shortcut</span>
                  <kbd class="dropdown-kbd">⌘K</kbd>
                </button>
              </div>

              <div class="dropdown-divider"></div>

              <!-- Logout Block -->
              <div class="dropdown-footer-block">
                <button
                  type="button"
                  class="dropdown-logout-btn"
                  role="menuitem"
                  @click="profileMenuOpen = false; handleLogout()"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Keluar dari Akun (Logout)</span>
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <!-- Main Content Workspace (Full-Width, Clean, Zero Redundant Sidebar) -->
    <div class="workspace-area">
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

      <!-- AI Assistant Copilot Drawer (Odoo AI match) -->
      <AiAssistantWidget :is-open="aiAssistantOpen" @close="aiAssistantOpen = false" />

      <!-- Apps Launcher Modal (Odoo 9-dots App Grid match) -->
      <AppLauncherModal
        :is-open="appLauncherOpen"
        @close="appLauncherOpen = false"
        @open-ai="aiAssistantOpen = true"
      />

      <!-- Floating macOS Dock Navigation (Replacing Clunky Static Sidebar) -->
      <MacDock
        v-if="!isHomeLauncher"
        @open-ai="aiAssistantOpen = true"
        @open-launchpad="appLauncherOpen = true"
      />
    </div>
  </div>
</template>

<style scoped>
/* PMO Corporate Executive Theme (Palette Resmi PMO UTama) */
.poital-shell.is-odoo-launcher {
  background: radial-gradient(ellipse at 50% 25%, #0e274c 0%, #061224 100%);
  min-height: 100vh;
  padding: 0;
  gap: 0;
  flex-direction: column;
}

.poital-shell.is-odoo-launcher .workspace-area {
  width: 100%;
  max-width: 100%;
  padding: 0;
  gap: 0;
}

.poital-shell.is-odoo-launcher .top-header {
  background: rgba(8, 20, 38, 0.90);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
  padding: 10px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

.poital-shell.is-odoo-launcher .mobile-toggle-btn {
  display: none !important;
}

.poital-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-canvas);
  color: var(--text-primary);
  padding: 0;
  gap: 0;
  max-width: 100vw;
  overflow-x: hidden;
}

/* Sidebar Column (Fixed / Sticky Poital Architecture) */
.sidebar-column {
  width: 256px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 16px;
  height: calc(100vh - 32px);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  padding: 16px 12px;
  transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1), padding 220ms ease;
  z-index: 40;
  box-sizing: border-box;
}

.sidebar-column.collapsed {
  width: 76px;
  padding: 16px 8px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 14px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 12px;
  flex-shrink: 0;
  min-height: 44px;
}

.sidebar-column.collapsed .sidebar-top {
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 0 0 14px;
}

.sidebar-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 140ms ease;
}

.sidebar-toggle-btn:hover {
  background: var(--border-subtle);
  color: var(--text-primary);
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
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 2px;
}

.sidebar-menu::-webkit-scrollbar {
  width: 4px;
}

.sidebar-menu::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}

.sidebar-menu:hover::-webkit-scrollbar-thumb {
  background: var(--border-strong);
}

.nav-group-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-group-header {
  padding: 2px 10px 4px;
}

.nav-group-title {
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  opacity: 0.75;
  text-transform: uppercase;
}

.nav-group-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 6px 8px;
}

.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 500;
  border: 0;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 140ms ease;
  white-space: nowrap;
  position: relative;
}

.sidebar-column.collapsed .nav-tab {
  justify-content: center;
  padding: 8px 0;
}

.nav-tab:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.nav-tab.active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.nav-tab.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
}

.sidebar-column.collapsed .nav-tab.active::before {
  left: 2px;
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
  flex-shrink: 0;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.88rem;
}

.nav-badge-pill {
  margin-left: auto;
  font-size: 0.63rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.qwen-pill {
  background: #ede9fe;
  color: #6d28d9;
  border-color: #ddd6fe;
}

.odoo-pill {
  background: #e0f2fe;
  color: #0369a1;
  border-color: #bae6fd;
}

.ai-sidebar-tab {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
  border-left: 3px solid #6366f1;
}

.ai-sidebar-tab:hover {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.16) 0%, rgba(99, 102, 241, 0.04) 100%);
  color: #4f46e5;
}

.ai-icon-box {
  color: #6366f1;
}

.sidebar-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 8px;
}

.sidebar-footer-utils {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.util-tab {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.84rem;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 140ms ease;
}

.sidebar-column.collapsed .util-tab {
  justify-content: center;
  padding: 6px 0;
}

.util-tab:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch-row .switch-control {
  margin-left: auto;
}

.footer-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 2px 0;
}

.sidebar-user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  transition: all 140ms ease;
}

.sidebar-user-card.card-collapsed {
  padding: 6px 0;
  justify-content: center;
  background: transparent;
  border-color: transparent;
  flex-direction: column;
  gap: 8px;
}

.sidebar-avatar-circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #034693, #022b5c);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.78rem;
  flex-shrink: 0;
}

.user-meta-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.user-name-text {
  font-size: 0.80rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.user-role-text {
  font-size: 0.68rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.user-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
}

.user-logout-btn:hover {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
}

.menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 16px 10px;
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
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.poital-shell.is-odoo-launcher .workspace-area {
  padding: 0;
  max-width: 100%;
}

.poital-shell:not(.is-odoo-launcher) .workspace-area {
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px 32px 96px;
}

/* Top Search & Profile Bar (Sticky with Canvas Background) */
.top-header {
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  background: rgba(8, 20, 38, 0.95);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.22);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-sizing: border-box;
}

.header-left-cluster {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 0;
}

.nav-icon-circle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: all 140ms ease;
  flex-shrink: 0;
}

.nav-icon-circle-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--primary);
}

.nav-launcher-btn.active {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.35);
}

.nav-brand-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 2px;
  text-decoration: none;
}

.nav-brand-logo {
  width: 26px;
  height: 28px;
  object-fit: contain;
}

.nav-brand-text {
  font-weight: 800;
  font-size: 1.05rem;
  color: #ffffff !important;
  letter-spacing: -0.02em;
}

.nav-brand-tag {
  font-size: 0.62rem;
  font-weight: 800;
  background: #f59e0b;
  color: #061224;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  margin-left: 2px;
}

.nav-brand-sub {
  font-size: 0.76rem;
  font-weight: 500;
  color: #94a3b8;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  margin-left: 4px;
}

/* Dynamic Breadcrumb Navigation */
.nav-breadcrumb-trail {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.84rem;
  min-width: 0;
}

.bc-crumb-link {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 600;
  transition: color 140ms ease;
}

.bc-crumb-link:hover {
  color: var(--primary);
}

.bc-crumb-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.bc-crumb-text {
  font-weight: 700;
  color: var(--text-primary);
}

.bc-sep {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.bc-section {
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.bc-title {
  color: var(--primary);
  font-weight: 650;
  white-space: nowrap;
}

/* Center Global Search / Fast Command Palette */
.header-center-cluster {
  flex: 1;
  max-width: 360px;
  display: flex;
  justify-content: center;
}

.nav-search-pill {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 6px 14px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);
  transition: all 140ms ease;
}

.nav-search-pill:hover {
  border-color: var(--border-strong);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.nav-search-svg {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.nav-search-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.nav-search-kbd {
  font-size: 0.68rem;
  font-weight: 600;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Right Operational Financial Tools */
.header-right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* Clean Corporate Unit Dropdown */
.clean-unit-wrap .clean-unit-select {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 550;
  cursor: pointer;
  outline: none;
  transition: all 140ms ease;
  max-width: 175px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.clean-unit-wrap .clean-unit-select:hover,
.clean-unit-wrap .clean-unit-select:focus {
  border-color: #f59e0b;
  background: rgba(255, 255, 255, 0.12);
}

.clean-unit-wrap .clean-unit-select option {
  background: #0b1a30;
  color: #ffffff;
}

/* Notification Badge */
.nav-notif-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #f43f5e;
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 750;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* User Profile Wrapper & Dropdown Menu */
.nav-user-profile-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.nav-user-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 3px;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
  outline: none;
}

.nav-user-capsule:hover,
.nav-user-capsule.is-active {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.user-capsule-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #034693, #022b5c);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.76rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.user-capsule-status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  border: 1.5px solid var(--bg-surface);
}

.user-capsule-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  text-align: left;
}

.user-capsule-name {
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--text-primary);
  max-width: 105px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-capsule-role {
  font-size: 0.66rem;
  color: var(--text-secondary);
  max-width: 105px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.capsule-chevron {
  color: var(--text-secondary);
  transition: transform 160ms ease, color 160ms ease;
  margin-left: 2px;
}

.capsule-chevron.is-open {
  transform: rotate(180deg);
  color: var(--primary);
}

/* User Profile Dropdown Card */
.profile-dropdown-card {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 290px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(15, 23, 42, 0.06);
  z-index: 100;
  overflow: hidden;
  padding: 6px;
}

.dropdown-header-block {
  padding: 12px 14px;
  background: var(--bg-subtle);
  border-radius: 12px;
  margin-bottom: 4px;
}

.dropdown-user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dropdown-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #034693, #022b5c);
  color: #ffffff;
  font-weight: 750;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(3, 70, 147, 0.25);
}

.dropdown-user-meta {
  min-width: 0;
  flex: 1;
}

.dropdown-full-name {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-sub-info {
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.dropdown-badges-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dropdown-role-badge {
  font-size: 0.68rem;
  font-weight: 650;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(3, 70, 147, 0.12);
  color: #034693;
}

:root[data-theme="dark"] .dropdown-role-badge,
.dark .dropdown-role-badge {
  background: rgba(56, 189, 248, 0.18);
  color: #38bdf8;
}

.dropdown-unit-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--border-subtle);
  color: var(--text-secondary);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 6px 0;
}

.dropdown-menu-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 550;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: all 120ms ease;
}

.dropdown-menu-item:hover {
  background: var(--bg-subtle);
  color: var(--primary);
}

.dropdown-kbd {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--border-subtle);
  color: var(--text-secondary);
}

.dropdown-footer-block {
  padding: 2px 0 0 0;
}

.dropdown-logout-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  color: #e11d48;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 600;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: all 120ms ease;
}

.dropdown-logout-btn:hover {
  background: rgba(225, 29, 72, 0.08);
  color: #be123c;
}

.dropdown-slide-enter-active,
.dropdown-slide-leave-active {
  transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-slide-enter-from,
.dropdown-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
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
  .desktop-only {
    display: none !important;
  }

  .sidebar-column.collapsed {
    width: 270px !important;
    padding: 16px 14px !important;
  }

  .sidebar-column.collapsed .sidebar-top {
    flex-direction: row !important;
    padding: 4px 4px 18px !important;
  }

  .sidebar-column.collapsed .brand-text-block,
  .sidebar-column.collapsed .nav-label,
  .sidebar-column.collapsed .nav-badge-pill,
  .sidebar-column.collapsed .nav-group-header,
  .sidebar-column.collapsed .user-meta-block {
    display: flex !important;
  }

  .sidebar-column.collapsed .nav-tab,
  .sidebar-column.collapsed .util-tab {
    justify-content: flex-start !important;
    padding: 8px 12px !important;
  }

  .sidebar-column.collapsed .sidebar-user-card {
    padding: 8px 10px !important;
    justify-content: flex-start !important;
    background: var(--bg-subtle) !important;
    flex-direction: row !important;
  }

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

/* Unified Executive Deep Navy Header Elements */
.nav-icon-circle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #ffffff;
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
}

.nav-icon-circle-btn:hover,
.nav-icon-circle-btn.active {
  background: rgba(255, 255, 255, 0.15);
  border-color: #f59e0b;
  color: #f59e0b;
}

.nav-launcher-btn.active {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
}

.nav-search-pill {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 9999px;
  padding: 6px 14px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  transition: all 140ms ease;
}

.nav-search-pill:hover {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(255, 255, 255, 0.13);
}

.nav-search-svg {
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.nav-search-text {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.nav-search-kbd {
  font-size: 0.68rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.22);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.clean-unit-wrap .clean-unit-select {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff !important;
  font-size: 0.8rem;
  font-weight: 550;
  cursor: pointer;
  outline: none;
  transition: all 140ms ease;
  max-width: 185px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.clean-unit-wrap .clean-unit-select:hover,
.clean-unit-wrap .clean-unit-select:focus {
  border-color: #f59e0b;
  background: rgba(255, 255, 255, 0.14);
}

.clean-unit-wrap .clean-unit-select option {
  background: #0b1a30;
  color: #ffffff;
}

.nav-breadcrumb-trail {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  min-width: 0;
}

.bc-crumb-link {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: #ffffff;
  font-weight: 700;
  letter-spacing: -0.01em;
  transition: opacity 140ms ease;
}

.bc-crumb-link:hover {
  opacity: 0.85;
}

.bc-crumb-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.bc-crumb-text {
  color: #ffffff;
  font-weight: 750;
  font-size: 0.88rem;
}

.bc-sep {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.8rem;
}

.bc-section {
  color: rgba(255, 255, 255, 0.65);
  font-weight: 500;
}

.bc-title {
  color: #f59e0b;
  font-weight: 650;
}

.nav-user-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 12px 3px 3px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
  outline: none;
}

.nav-user-capsule:hover,
.nav-user-capsule.is-active {
  border-color: #f59e0b;
  background: rgba(255, 255, 255, 0.14);
}

.user-capsule-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #034693, #022b5c);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.76rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.user-capsule-status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  border: 1.5px solid #081426;
}

.user-capsule-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  text-align: left;
}

.user-capsule-name {
  font-size: 0.78rem;
  font-weight: 650;
  color: #ffffff;
}

.user-capsule-role {
  font-size: 0.66rem;
  color: #f59e0b;
  font-weight: 600;
}

.user-capsule-chevron {
  color: rgba(255, 255, 255, 0.5);
  margin-left: 2px;
}

</style>
