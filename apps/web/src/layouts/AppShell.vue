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
import OmnisearchModal from '../components/OmnisearchModal.vue';

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
    return { section: 'Penerimaan', title: 'Buku Harian Penerimaan' };
  }
  if (path.startsWith('/penerimaan/pembukuan')) {
    return { section: 'Penerimaan', title: 'Pembukuan (Umum & Pajak)' };
  }
  if (path.startsWith('/penerimaan/laporan')) {
    return { section: 'Penerimaan', title: 'Laporan Penerimaan & Aging' };
  }
  if (path.startsWith('/reconciliation')) {
    return { section: auth.activeWorkspace === 'PENERIMAAN' ? 'Penerimaan' : 'Finansial', title: 'Rekonsiliasi Rekening Bank' };
  }
  if (path.startsWith('/accounting')) {
    return { section: 'Finansial', title: 'Akuntansi & Jurnal Umum' };
  }
  if (path.startsWith('/petty-cash') || path.startsWith('/tax-submission') || path.startsWith('/gup')) {
    return { section: 'Perbendaharaan', title: 'Uang Persediaan & SPJ (GUP/TUP)' };
  }
  if (path.startsWith('/assets') || path.startsWith('/inventaris')) {
    return { section: 'Logistik', title: 'Inventaris & Aset PMO (Milik & PBI UT)' };
  }
  if (path.startsWith('/hris') || path.startsWith('/payroll') || path.startsWith('/sdm')) {
    return { section: 'Kepegawaian', title: 'Database SDM, Presensi & Payroll' };
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
const unitDropdownOpen = ref(false);
const notifications = ref<any[]>([]);
const businessUnits = ref<any[]>([]);
const fiscalPeriods = ref<any[]>([]);

const activeFiscalPeriod = computed(() => {
  if (auth.activePeriod?.code) return auth.activePeriod;
  if (!fiscalPeriods.value || fiscalPeriods.value.length === 0) return null;
  const nowMs = Date.now();
  const openList = fiscalPeriods.value.filter((p) => p.status === 'OPEN' && !p.isClosed);
  const covering = openList
    .filter((p) => new Date(p.startDate).getTime() <= nowMs && new Date(p.endDate).getTime() >= nowMs)
    .sort((a, b) => (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) - (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()));
  if (covering.length > 0) return covering[0];
  const monthly = openList.find((p) => String(p.code || '').startsWith('FP-'));
  return monthly || openList[0] || fiscalPeriods.value[0];
});

function getFiscalBadgeClass(status: string) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return 'fiscal-badge-open';
    case 'LOCKED':
      return 'fiscal-badge-locked';
    case 'CLOSED':
      return 'fiscal-badge-closed';
    default:
      return 'fiscal-badge-default';
  }
}

function getFiscalPeriodTooltip(period: any) {
  if (!period) return '';
  const code = period.code || period.periodCode || '';
  if (period.status === 'OPEN') {
    return `Periode Fiskal: ${period.name} (${code}) - Status OPEN: Seluruh transaksi diizinkan.`;
  }
  if (period.status === 'LOCKED') {
    return `Periode Fiskal: ${period.name} (${code}) - Status LOCKED: Terkunci sementara untuk rekonsiliasi & tutup buku.`;
  }
  return `Periode Fiskal: ${period.name} (${code}) - Status CLOSED: Ditutup permanen untuk audit.`;
}

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

// Close drawers and menus on route navigation + sync workspace context
watch(
  () => route.path,
  (newPath) => {
    mobileNavOpen.value = false;
    notifDrawerOpen.value = false;
    profileMenuOpen.value = false;
    unitDropdownOpen.value = false;
    if (auth.activeWorkspace === 'GATEWAY') {
      if ((newPath.startsWith('/revenue') || newPath.startsWith('/penerimaan')) && auth.canAccessPenerimaan) {
        auth.setWorkspace('PENERIMAAN');
      } else if (
        (newPath.startsWith('/budgets') ||
          newPath.startsWith('/procurement') ||
          newPath.startsWith('/petty-cash') ||
          newPath.startsWith('/hris') ||
          newPath.startsWith('/assets')) &&
        auth.canAccessPengeluaran
      ) {
        auth.setWorkspace('PENGELUARAN');
      }
    }
  }
);

function goToGatewayHome() {
  auth.resetWorkspace();
  router.push('/');
}

function switchHeaderWorkspace(ws: 'PENERIMAAN' | 'PENGELUARAN') {
  if (auth.setWorkspace(ws)) {
    router.push({ path: '/', query: { domain: ws.toLowerCase() } });
  }
}

// Prevent body scroll when mobile drawer is open
watch(mobileNavOpen, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
});

// Fast Command Palette / Omnisearch Modal
const cmdPaletteOpen = ref(false);

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

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdPaletteOpen.value = !cmdPaletteOpen.value;
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
  if (!target.closest('.custom-unit-wrap')) {
    unitDropdownOpen.value = false;
  }
}

const selectedUnitDisplayName = computed(() => {
  if (auth.selectedBusinessUnitId) {
    const found = businessUnits.value.find((u) => u.id === auth.selectedBusinessUnitId);
    return found ? found.name || found.code : 'PMO UTama (Pusat)';
  }
  return 'PMO UTama (Pusat)';
});

function selectUnit(unitId: string) {
  auth.selectedBusinessUnitId = unitId;
  unitDropdownOpen.value = false;
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

const userFirstName = computed(() => {
  const fullName = auth.user?.fullName || 'Pengguna PMO';
  return fullName.split(' ')[0] || fullName;
});

async function loadMasterContext() {
  try {
    const res = await apiFetch('/master/overview');
    businessUnits.value = res.data.businessUnits || [];
    fiscalPeriods.value = res.data.fiscalPeriods || [];
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

async function markAllNotificationsRead() {
  try {
    await apiFetch('/reports/notifications/read-all', { method: 'PATCH' });
    notifications.value = notifications.value.map((n) => ({ ...n, isRead: true }));
    auth.unreadNotifications = 0;
  } catch {
    // Non-blocking
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

    <!-- Top Modern Adaptive Glass Navbar (Linear / Stripe Style) -->
    <header class="top-header" :class="{ 'is-launcher-header': isHomeLauncher }">
      <div class="header-left-cluster">
        <!-- Mobile Menu Toggle (< 840px) -->
        <button
          type="button"
          class="mobile-menu-toggle-btn"
          title="Buka Menu Modul"
          aria-label="Buka Menu Navigasi"
          @click="appLauncherOpen = true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <!-- Brand Identifier saat di Home Launcher Screen -->
        <div v-if="isHomeLauncher" class="nav-brand-group">
          <img :src="logoPmoEmblem" alt="PMO UTama" class="nav-brand-logo" />
          <span class="nav-brand-text">PMO UTama</span>
          <span class="nav-brand-pill desktop-only">FINANCE</span>
        </div>

        <!-- Dynamic Breadcrumb Navigation + Domain Workspace Switcher saat di dalam Modul Kerja -->
        <nav v-else class="nav-breadcrumb-trail" aria-label="Breadcrumb Navigasi">
          <button
            type="button"
            class="bc-crumb-link bc-gateway-btn"
            title="Kembali ke Gerbang Utama (Penerimaan / Pengeluaran)"
            @click="goToGatewayHome"
          >
            <img :src="logoPmoEmblem" alt="PMO UTama" class="bc-crumb-logo" />
            <span class="bc-crumb-text hide-on-mobile">Gerbang Utama</span>
          </button>

          <div
            v-if="auth.canAccessPenerimaan || auth.canAccessPengeluaran"
            class="header-ws-switcher hide-on-mobile"
            role="group"
            aria-label="Pindah Ruang Kerja"
          >
            <button
              v-if="auth.canAccessPenerimaan"
              type="button"
              class="hws-pill"
              :class="{ 'is-active-in': auth.activeWorkspace === 'PENERIMAAN' }"
              @click="switchHeaderWorkspace('PENERIMAAN')"
            >
              Penerimaan
            </button>
            <button
              v-if="auth.canAccessPengeluaran"
              type="button"
              class="hws-pill"
              :class="{ 'is-active-out': auth.activeWorkspace === 'PENGELUARAN' }"
              @click="switchHeaderWorkspace('PENGELUARAN')"
            >
              Pengeluaran
            </button>
          </div>

          <span class="bc-sep hide-on-tablet">/</span>
          <span class="bc-title">{{ currentModuleContext.title }}</span>
        </nav>
      </div>

      <!-- Center Global Search (Desktop >= 1024px) -->
      <div v-if="!isHomeLauncher" class="header-center-cluster desktop-search">
        <div
          class="nav-search-pill"
          role="button"
          tabindex="0"
          title="Cari transaksi, modul, atau tekan ⌘K"
          @click="cmdPaletteOpen = true"
          @keydown.enter="cmdPaletteOpen = true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="nav-search-svg">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span class="nav-search-text">
            {{ auth.activeWorkspace === 'PENERIMAAN' || !auth.canAccessPengeluaran ? 'Cari kwitansi, invoice, COA...' : 'Cari modul, PO, SPJ...' }}
          </span>
          <kbd class="nav-search-kbd">⌘K</kbd>
        </div>
      </div>

      <!-- Right Corporate Utilities -->
      <div class="header-right-actions">
        <!-- Compact Search Icon Trigger on Mobile/Tablet (< 1080px) -->
        <button
          v-if="!isHomeLauncher"
          type="button"
          class="nav-icon-circle-btn mobile-search-btn"
          title="Cari Modul &amp; Transaksi (⌘K)"
          aria-label="Cari"
          @click="cmdPaletteOpen = true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>

        <!-- Real-Time Fiscal Period Status Pill (Compact Code; Full Name in Tooltip) -->
        <div
          v-if="!isHomeLauncher && activeFiscalPeriod"
          class="custom-fiscal-pill hide-on-mobile"
          :title="getFiscalPeriodTooltip(activeFiscalPeriod)"
        >
          <span class="fiscal-icon">📅</span>
          <span class="fiscal-name hide-on-tablet">{{ activeFiscalPeriod.code || activeFiscalPeriod.periodCode || activeFiscalPeriod.name }}</span>
          <span class="fiscal-badge" :class="getFiscalBadgeClass(activeFiscalPeriod.status)">
            {{ activeFiscalPeriod.status }}
          </span>
        </div>

        <!-- Custom Business Unit Selector -->
        <div v-if="!isHomeLauncher && !auth.user?.businessUnitId && businessUnits.length > 0" class="custom-unit-wrap">
          <button
            type="button"
            class="custom-unit-btn"
            :class="{ 'is-active': unitDropdownOpen }"
            title="Ganti Lingkup Unit Bisnis"
            @click.stop="unitDropdownOpen = !unitDropdownOpen; profileMenuOpen = false"
          >
            <span class="unit-icon">🏢</span>
            <span class="unit-text hide-on-tablet">{{ selectedUnitDisplayName }}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="unit-chevron">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <!-- Custom Unit Dropdown Popover -->
          <transition name="dropdown-slide">
            <div v-if="unitDropdownOpen" class="custom-unit-dropdown" @click.stop>
              <div class="unit-dropdown-header">
                <strong>LINGKUP UNIT BISNIS</strong>
                <span>Filter transaksi data per unit kerja</span>
              </div>
              <div class="unit-dropdown-list">
                <button
                  type="button"
                  class="unit-option-btn"
                  :class="{ 'is-selected': !auth.selectedBusinessUnitId }"
                  @click="selectUnit('')"
                >
                  <span class="unit-opt-icon">🏛️</span>
                  <div class="unit-opt-text">
                    <strong>PMO UTama (Pusat)</strong>
                    <span>Konsolidasi seluruh unit</span>
                  </div>
                  <span v-if="!auth.selectedBusinessUnitId" class="unit-check">✓</span>
                </button>
                <button
                  v-for="u in businessUnits"
                  :key="u.id"
                  type="button"
                  class="unit-option-btn"
                  :class="{ 'is-selected': auth.selectedBusinessUnitId === u.id }"
                  @click="selectUnit(u.id)"
                >
                  <span class="unit-opt-icon">🏢</span>
                  <div class="unit-opt-text">
                    <strong>{{ u.name || u.code }}</strong>
                    <span>Kode: {{ u.code }}</span>
                  </div>
                  <span v-if="auth.selectedBusinessUnitId === u.id" class="unit-check">✓</span>
                </button>
              </div>
            </div>
          </transition>
        </div>

        <!-- AI Assistant Copilot Trigger with Sparkle Badge (Visible on screens >= 1200px) -->
        <button
          v-if="!isHomeLauncher"
          type="button"
          class="nav-ai-pill-btn hide-on-tablet"
          title="Buka AI Financial Copilot (Qwen)"
          aria-label="AI Copilot"
          @click="aiAssistantOpen = true"
        >
          <span class="ai-sparkle-icon">✨</span>
          <span class="ai-btn-text">Qwen AI</span>
        </button>

        <!-- Notification Bell -->
        <button
          type="button"
          class="nav-icon-circle-btn"
          :class="{ active: notifDrawerOpen }"
          aria-label="Pusat Notifikasi"
          title="Pusat Notifikasi &amp; Peringatan Keuangan"
          @click="openNotifications"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
          </svg>
          <span v-if="auth.unreadNotifications > 0" class="nav-notif-badge">{{ auth.unreadNotifications }}</span>
        </button>

        <!-- User Profile Avatar Capsule -->
        <div class="nav-user-profile-wrap">
          <button
            type="button"
            class="nav-user-capsule"
            :class="{ 'is-active': profileMenuOpen }"
            aria-label="Menu Profil &amp; Pengaturan Akun"
            aria-haspopup="true"
            :aria-expanded="profileMenuOpen"
            @click.stop="profileMenuOpen = !profileMenuOpen; unitDropdownOpen = false"
          >
            <div class="user-capsule-avatar">
              <span>{{ userInitials }}</span>
              <span class="user-capsule-status"></span>
            </div>
            <div class="user-capsule-text hide-on-tablet">
              <span class="user-capsule-name">{{ userFirstName }}</span>
            </div>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="user-capsule-chevron hide-on-tablet">
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
                  <span class="dropdown-role-badge">{{ auth.effectiveRoleName }}</span>
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
          <div class="drawer-title-wrap">
            <h3>Pusat Notifikasi</h3>
            <span v-if="auth.unreadNotifications > 0" class="drawer-unread-pill">{{ auth.unreadNotifications }} baru</span>
          </div>
          <div class="drawer-header-actions">
            <button
              v-if="auth.unreadNotifications > 0"
              type="button"
              class="notif-mark-all-btn"
              @click="markAllNotificationsRead"
            >
              Tandai dibaca
            </button>
            <button type="button" class="btn btn-sm btn-ghost" @click="notifDrawerOpen = false">✕</button>
          </div>
        </div>
        <div v-if="notifications.length === 0" class="empty-notif">Belum ada notifikasi baru untuk peran Anda.</div>
        <ul v-else class="notif-list-items">
          <li
            v-for="n in notifications"
            :key="n.id"
            class="notif-item-row"
            :class="{ unread: !n.isRead, 'sev-warning': n.severity === 'WARNING' }"
          >
            <div class="notif-item-body">
              <div class="notif-title-line">
                <span v-if="!n.isRead" class="notif-unread-dot" aria-label="Belum dibaca"></span>
                <span v-if="n.severity === 'WARNING'" class="notif-sev-tag">Pengingat</span>
                <strong>{{ n.title }}</strong>
              </div>
              <p>{{ n.message }}</p>
              <small>{{ formatDateTime(n.createdAt) }}</small>
            </div>
            <button type="button" class="notif-open-btn" @click="markRead(n)">
              Lihat &rarr;
            </button>
          </li>
        </ul>
      </div>

      <!-- Omnisearch Spotlight Modal (Real Assets, Documents, HRIS, and ERP Navigation) -->
      <OmnisearchModal
        :is-open="cmdPaletteOpen"
        @close="cmdPaletteOpen = false"
        @open-ai="aiAssistantOpen = true"
        @open-launcher="appLauncherOpen = true"
      />

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

      <!-- Floating Access Denied Toast Alert (Apple-Style Glass Capsule) -->
      <transition name="toast-pop">
        <div
          v-if="auth.accessDeniedAlert?.show"
          class="access-denied-glass-toast"
          role="alert"
          aria-live="assertive"
        >
          <div class="toast-lock-circle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
            </svg>
          </div>
          <div class="toast-text-body">
            <div class="toast-title-row">
              <strong class="toast-heading">Akses Dibatasi</strong>
              <span class="toast-role-tag">{{ auth.accessDeniedAlert.roleName }}</span>
            </div>
            <p class="toast-detail">
              Peran Anda saat ini tidak memiliki wewenang untuk membuka modul <b>{{ auth.accessDeniedAlert.moduleName }}</b>.
            </p>
          </div>
          <button
            type="button"
            class="toast-dismiss-btn"
            title="Tutup Notifikasi"
            @click="auth.dismissAccessDenied()"
          >
            ✕
          </button>
        </div>
      </transition>
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
  background: rgba(8, 20, 38, 0.55);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
  padding: 10px 24px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

[data-theme='dark'] .poital-shell.is-odoo-launcher .top-header {
  background: rgba(6, 16, 32, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.poital-shell.is-odoo-launcher .nav-brand-text {
  color: #ffffff !important;
}

.poital-shell.is-odoo-launcher .nav-brand-pill {
  background: rgba(3, 70, 147, 0.5) !important;
  color: #93c5fd !important;
  border: 1px solid rgba(147, 197, 253, 0.35) !important;
}

.poital-shell.is-odoo-launcher .nav-icon-circle-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: #e2e8f0 !important;
  box-shadow: none !important;
}

.poital-shell.is-odoo-launcher .nav-icon-circle-btn:hover {
  background: rgba(255, 255, 255, 0.16) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
  color: #ffffff !important;
}

.poital-shell.is-odoo-launcher .nav-user-capsule {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: #ffffff !important;
  box-shadow: none !important;
}

.poital-shell.is-odoo-launcher .nav-user-capsule:hover,
.poital-shell.is-odoo-launcher .nav-user-capsule.is-active {
  background: rgba(255, 255, 255, 0.15) !important;
  border-color: rgba(255, 255, 255, 0.28) !important;
}

.poital-shell.is-odoo-launcher .user-capsule-name {
  color: #ffffff !important;
}

.poital-shell.is-odoo-launcher .user-capsule-chevron {
  color: rgba(255, 255, 255, 0.65) !important;
}

.poital-shell.is-odoo-launcher .mobile-menu-toggle-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  color: #ffffff !important;
}

.poital-shell.is-odoo-launcher .mobile-toggle-btn {
  display: none !important;
}

.bc-gateway-btn {
  background: transparent;
  border: none;
  padding: 4px 8px 4px 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.header-ws-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 9999px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  margin-left: 4px;
}

.hws-pill {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 9999px;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.hws-pill:hover {
  color: var(--text-primary);
}

.hws-pill.is-active-in {
  background: #059669;
  color: #ffffff;
}

.hws-pill.is-active-out {
  background: #0b2144;
  color: #ffffff;
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

/* Top Modern Adaptive Glass Navbar (Linear / Stripe Style) */
.top-header {
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 24px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 16px -2px rgba(15, 23, 42, 0.02);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  transition: background-color 200ms ease, border-color 200ms ease;
}

[data-theme='dark'] .top-header {
  background: rgba(11, 17, 32, 0.86);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.header-left-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
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
  color: var(--text-primary);
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
  flex: 1 1 150px;
  max-width: 280px;
  min-width: 0;
  display: flex;
  justify-content: center;
}

.nav-search-pill {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 6px 12px;
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
  gap: 8px;
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
  background: #ef4444;
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 750;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
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
  position: fixed;
  top: 64px;
  right: 16px;
  width: 400px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 88px);
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.22);
  padding: 16px;
  z-index: 200;
  border: 1px solid var(--border-subtle);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.drawer-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-header h3 {
  font-size: 0.92rem;
  font-weight: 700;
  margin: 0;
}

.drawer-unread-pill {
  padding: 2px 8px;
  border-radius: 9999px;
  background: #dbeafe;
  color: #034693;
  font-size: 0.7rem;
  font-weight: 750;
}

.drawer-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.notif-mark-all-btn {
  border: none;
  background: transparent;
  color: #034693;
  font-size: 0.74rem;
  font-weight: 650;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
}
.notif-mark-all-btn:hover { background: #eff6ff; }

.empty-notif {
  color: var(--text-secondary);
  font-size: 0.82rem;
  padding: 16px 0;
  text-align: center;
}

.notif-list-items {
  list-style: none;
  padding: 0 2px 4px 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.notif-item-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid transparent;
  font-size: 0.8rem;
  opacity: 0.78;
  transition: background 140ms ease, opacity 140ms ease;
}
.notif-item-row:hover { opacity: 1; }
.notif-item-row.unread {
  background: #eff6ff;
  border-color: #bfdbfe;
  border-left-color: #034693;
  opacity: 1;
}
.notif-item-row.unread.sev-warning {
  background: #fffbeb;
  border-color: #fde68a;
  border-left-color: #d97706;
}
.notif-item-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.notif-item-body p {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
.notif-item-body small {
  font-size: 0.7rem;
  color: #64748b;
}
.notif-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.notif-title-line strong {
  font-size: 0.8rem;
  color: var(--text-primary);
}
.notif-unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: #034693;
  flex-shrink: 0;
}
.notif-item-row.sev-warning .notif-unread-dot {
  background: #d97706;
}
.notif-sev-tag {
  padding: 1px 6px;
  border-radius: 9999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.65rem;
  font-weight: 750;
}
.notif-open-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0b2144;
  border-radius: 9999px;
  padding: 5px 10px;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.notif-open-btn:hover {
  background: #0b2144;
  color: #ffffff;
  border-color: #0b2144;
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
    padding: 0;
    flex-direction: column;
    gap: 0;
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

}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Modern Adaptive Glass Header Elements (Linear / Stripe Style) */
.nav-brand-pill {
  font-size: 0.62rem;
  font-weight: 800;
  background: var(--primary-soft);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(3, 70, 147, 0.2);
  margin-left: 6px;
  letter-spacing: 0.04em;
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

.nav-icon-circle-btn:hover,
.nav-icon-circle-btn.active {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--primary);
  transform: translateY(-1px);
}

.nav-search-pill {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  padding: 6px 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: all 140ms ease;
}

.mobile-search-btn {
  display: none;
}

.mobile-menu-toggle-btn {
  display: none;
}

.nav-search-pill:hover {
  border-color: var(--primary);
  background: var(--bg-surface);
  box-shadow: 0 0 0 3px rgba(3, 70, 147, 0.08);
}

.nav-search-svg {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.nav-search-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.nav-search-kbd {
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Real-Time Fiscal Period Status Pill */
.custom-fiscal-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--radius-md, 8px);
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #cbd5e1);
  color: var(--text-primary, #0f172a);
  font-size: 0.78rem;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  user-select: none;
}

.fiscal-icon {
  font-size: 0.82rem;
}

.fiscal-name {
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fiscal-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1.5px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.fiscal-badge-open {
  background: #dcfce7;
  color: #15803d;
}

.fiscal-badge-locked {
  background: #fef3c7;
  color: #b45309;
}

.fiscal-badge-closed {
  background: #f1f5f9;
  color: #64748b;
}

/* Custom Business Unit Selector */
.custom-unit-wrap {
  position: relative;
}

.custom-unit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  max-width: 160px;
}

.custom-unit-btn:hover,
.custom-unit-btn.is-active {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.unit-icon {
  font-size: 0.88rem;
  flex-shrink: 0;
}

.unit-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.unit-chevron {
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: transform 140ms ease;
}

.custom-unit-btn.is-active .unit-chevron {
  transform: rotate(180deg);
}

.custom-unit-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 32px -4px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.04);
  padding: 8px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unit-dropdown-header {
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.unit-dropdown-header strong {
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.unit-dropdown-header span {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.unit-dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.unit-option-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 120ms ease;
  width: 100%;
}

.unit-option-btn:hover {
  background: var(--bg-subtle);
}

.unit-option-btn.is-selected {
  background: var(--primary-soft);
  color: var(--primary);
}

.unit-opt-icon {
  font-size: 1rem;
}

.unit-opt-text {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.unit-opt-text strong {
  font-size: 0.8rem;
  color: inherit;
}

.unit-opt-text span {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.unit-check {
  font-weight: 700;
  color: var(--primary);
}

/* AI Copilot Badge Button */
.nav-ai-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(3, 70, 147, 0.08));
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #b45309;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 140ms ease;
}

.nav-ai-pill-btn:hover {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.2);
  transform: translateY(-1px);
}

.ai-sparkle-icon {
  font-size: 0.85rem;
}

/* Breadcrumb Trail */
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
  color: var(--text-primary);
  font-weight: 750;
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
  color: var(--text-primary);
  font-weight: 750;
  font-size: 0.88rem;
}

.bc-sep {
  color: var(--text-secondary);
  opacity: 0.45;
  font-size: 0.8rem;
}

.bc-section {
  color: var(--text-secondary);
  font-weight: 550;
  font-size: 0.84rem;
}

.bc-title {
  color: var(--primary);
  font-weight: 700;
  font-size: 0.84rem;
  max-width: 185px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* User Capsule */
.nav-user-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 12px 3px 3px;
  border-radius: var(--radius-full);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
  outline: none;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.nav-user-capsule:hover,
.nav-user-capsule.is-active {
  border-color: var(--primary);
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
}

.user-capsule-role {
  font-size: 0.66rem;
  color: var(--primary);
  font-weight: 600;
}

.user-capsule-chevron {
  color: var(--text-secondary);
  margin-left: 2px;
}

/* Floating Glass Toast Alert for Access Denied */
.access-denied-glass-toast {
  position: fixed;
  bottom: 82px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px 10px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(239, 68, 68, 0.5);
  box-shadow:
    0 16px 36px -4px rgba(0, 0, 0, 0.55),
    0 0 16px rgba(239, 68, 68, 0.25);
  max-width: 480px;
  width: calc(100% - 32px);
  animation: toastPop 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-lock-circle {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.toast-text-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.toast-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast-heading {
  font-size: 0.82rem;
  color: #f87171;
  font-weight: 700;
}

.toast-role-tag {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-weight: 600;
}

.toast-detail {
  font-size: 0.74rem;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.3;
}

.toast-dismiss-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 140ms ease;
  flex-shrink: 0;
}

.toast-dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

@keyframes toastPop {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(16px) scale(0.96);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

.toast-pop-enter-active,
.toast-pop-leave-active {
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-pop-enter-from,
.toast-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px) scale(0.96);
}

/* Authoritative Responsive Navbar & Shell Reflow (Placed Last in Cascade) */
@media (max-width: 1360px) {
  .top-header {
    padding: 9px 18px;
    gap: 10px;
  }
  .header-center-cluster {
    max-width: 220px;
  }
  .bc-title {
    max-width: 145px;
  }
  .custom-unit-btn {
    max-width: 140px;
  }
}

@media (max-width: 1220px) {
  .desktop-xl-only,
  .bc-crumb-text,
  .nav-ai-pill-btn {
    display: none !important;
  }
  .bc-gateway-btn {
    padding: 4px 2px 4px 0;
  }
  .header-center-cluster {
    max-width: 190px;
  }
  .custom-unit-btn {
    max-width: 130px;
  }
}

@media (max-width: 1080px) {
  .desktop-search,
  .header-center-cluster,
  .hide-on-tablet {
    display: none !important;
  }
  .mobile-search-btn {
    display: flex !important;
  }
  .custom-unit-btn {
    padding: 6px 8px;
    max-width: none;
  }
  .nav-user-capsule {
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }
  .nav-user-capsule:hover,
  .nav-user-capsule.is-active {
    background: transparent;
    border: none;
  }
  .top-header {
    padding: 8px 16px;
    gap: 10px;
  }
  .poital-shell:not(.is-odoo-launcher) .workspace-area {
    padding: 18px 20px 96px;
  }
}

@media (max-width: 840px) {
  .mobile-menu-toggle-btn {
    display: flex !important;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
    cursor: pointer;
    flex-shrink: 0;
  }
  .hide-on-mobile {
    display: none !important;
  }
  .top-header {
    padding: 8px 12px;
    gap: 8px;
  }
  .header-left-cluster {
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .header-right-actions {
    gap: 6px;
    flex-shrink: 0;
  }
  .bc-title {
    max-width: 165px;
  }
}

@media (max-width: 600px) {
  .top-header {
    padding: 8px 10px;
    gap: 6px;
  }
  .poital-shell:not(.is-odoo-launcher) .workspace-area {
    padding: 14px 12px 92px;
  }
  .bc-title {
    max-width: 120px;
    font-size: 0.8rem;
  }
  .nav-icon-circle-btn {
    width: 34px;
    height: 34px;
  }
}
</style>
