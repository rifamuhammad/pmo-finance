<script setup lang="ts">
import { ref, computed, watch, provide, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { apiFetch } from '../services/api';
import { formatDateTime } from '../utils/format';
import logoPmoEmblem from '../assets/logo-pmo-emblem.png';
import AiAssistantWidget from '../components/AiAssistantWidget.vue';
import AppLauncherModal from '../components/AppLauncherModal.vue';
import OmnisearchModal from '../components/OmnisearchModal.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

interface SidebarSubItem {
  id: string;
  label: string;
  to: string;
  permission?: string;
}

interface SidebarItem {
  id: string;
  label: string;
  to?: string;
  icon: string;
  permission?: string;
  badge?: number;
  children?: SidebarSubItem[];
}

interface SidebarSection {
  id: string;
  title: string;
  items: SidebarItem[];
}

const sidebarCollapsed = ref(
  typeof window !== 'undefined' ? localStorage.getItem('pmo_sidebar_collapsed') === 'true' : false
);
const mobileSidebarOpen = ref(false);
const notifDrawerOpen = ref(false);
const profileMenuOpen = ref(false);
const aiAssistantOpen = ref(false);
const appLauncherOpen = ref(false);
const cmdPaletteOpen = ref(false);

const notifications = ref<any[]>([]);
const fiscalPeriods = ref<any[]>([]);

// Expanded accordion groups (open by default for Penerimaan so senior managers see every submenu clearly)
const openGroups = ref<Record<string, boolean>>({
  'rev-transaksi': true,
  'rev-pembukuan': true,
  'rev-laporan': true,
  'out-pengadaan': true,
});

const isGatewayScreen = computed(() => route.path === '/');

function toggleGroup(groupId: string) {
  if (sidebarCollapsed.value) {
    sidebarCollapsed.value = false;
    openGroups.value[groupId] = true;
    return;
  }
  openGroups.value[groupId] = !openGroups.value[groupId];
}

function toggleDesktopSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

watch(sidebarCollapsed, (val) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('pmo_sidebar_collapsed', String(val));
  }
});

const effectiveWorkspace = computed<'PENERIMAAN' | 'PENGELUARAN'>(() => {
  if (auth.activeWorkspace === 'PENGELUARAN' && auth.canAccessPengeluaran) return 'PENGELUARAN';
  if (auth.activeWorkspace === 'PENERIMAAN' && auth.canAccessPenerimaan) return 'PENERIMAAN';
  if (auth.canAccessPenerimaan) return 'PENERIMAAN';
  return 'PENGELUARAN';
});

const hasDualWorkspace = computed(() => auth.canAccessPenerimaan && auth.canAccessPengeluaran);

function switchWorkspace(ws: 'PENERIMAAN' | 'PENGELUARAN') {
  if (!auth.setWorkspace(ws)) return;
  mobileSidebarOpen.value = false;
  if (ws === 'PENERIMAAN') {
    if (
      !route.path.startsWith('/dashboard') &&
      !route.path.startsWith('/revenue') &&
      !route.path.startsWith('/reconciliation') &&
      !route.path.startsWith('/penerimaan') &&
      !route.path.startsWith('/admin')
    ) {
      router.push('/revenue?tab=buku_harian');
    }
  } else {
    if (route.path.startsWith('/revenue') || route.path.startsWith('/penerimaan')) {
      router.push('/dashboard');
    }
  }
}

function backToModulePicker() {
  mobileSidebarOpen.value = false;
  auth.resetWorkspace();
  router.push('/');
}

// DropX Admin Exact Sidebar Hierarchy (RBAC-filtered)
const sidebarSections = computed<SidebarSection[]>(() => {
  if (effectiveWorkspace.value === 'PENERIMAAN') {
    const sections: SidebarSection[] = [
      {
        id: 'dashboard-sec',
        title: 'DASHBOARD',
        items: [
          {
            id: 'dashboard',
            label: 'Ringkasan Penerimaan',
            to: '/dashboard',
            icon: 'dashboard',
          },
        ],
      },
      {
        id: 'operasional',
        title: 'OPERASIONAL',
        items: [
          {
            id: 'rev-transaksi',
            label: 'Transaksi & Tagihan',
            icon: 'receipt',
            permission: 'revenue:view',
            children: [
              {
                id: 'rev-buku-harian',
                label: 'Buku Harian (Kwitansi & TT)',
                to: '/revenue?tab=buku_harian',
                permission: 'revenue:view',
              },
              {
                id: 'rev-invoices',
                label: 'Tagihan & Invoice',
                to: '/revenue?tab=invoices',
                permission: 'revenue:view',
              },
              {
                id: 'rev-layanan',
                label: 'Katalog Layanan & Tarif',
                to: '/revenue?tab=layanan',
                permission: 'revenue:view',
              },
            ],
          },
          {
            id: 'reconciliation',
            label: 'Rekonsiliasi Bank Mandiri',
            to: '/reconciliation',
            icon: 'bank',
            permission: 'reconciliation:view',
          },
        ],
      },
      {
        id: 'pembukuan-laporan',
        title: 'PEMBUKUAN & LAPORAN',
        items: [
          {
            id: 'rev-pembukuan',
            label: 'Pembukuan & Pajak',
            icon: 'book',
            permission: 'revenue:view',
            children: [
              {
                id: 'pembukuan-bku',
                label: 'Buku Kas Umum (BKU)',
                to: '/penerimaan/pembukuan?section=bku',
                permission: 'revenue:view',
              },
              {
                id: 'pembukuan-jurnal',
                label: 'Jurnal Umum Penerimaan',
                to: '/penerimaan/pembukuan?section=jurnal',
                permission: 'revenue:view',
              },
              {
                id: 'pembukuan-pajak',
                label: 'Perincian Pajak PTNBH',
                to: '/penerimaan/pembukuan?section=perincian',
                permission: 'revenue:view',
              },
              {
                id: 'pembukuan-surat',
                label: 'Surat Penarikan Pajak',
                to: '/penerimaan/pembukuan?section=surat',
                permission: 'revenue:view',
              },
            ],
          },
          {
            id: 'rev-laporan',
            label: 'Laporan Penerimaan',
            icon: 'chart',
            permission: 'revenue:view',
            children: [
              {
                id: 'laporan-realisasi',
                label: 'Realisasi & Target RAB',
                to: '/penerimaan/laporan?section=realisasi',
                permission: 'revenue:view',
              },
              {
                id: 'laporan-aging',
                label: 'Aging Piutang Penerimaan',
                to: '/penerimaan/laporan?section=aging',
                permission: 'revenue:view',
              },
            ],
          },
        ],
      },
      {
        id: 'sistem',
        title: 'ADMINISTRASI',
        items: [
          {
            id: 'admin',
            label: 'Pengguna, Role & Audit',
            to: '/admin',
            icon: 'shield',
            permission: 'admin:view',
          },
        ],
      },
    ];
    return filterSectionsByPermission(sections);
  }

  // PENGELUARAN workspace
  const outSections: SidebarSection[] = [
    {
      id: 'dashboard-sec',
      title: 'DASHBOARD',
      items: [
        {
          id: 'dashboard',
          label: 'Ringkasan Keuangan',
          to: '/dashboard',
          icon: 'dashboard',
        },
        {
          id: 'approvals',
          label: 'Antrean Persetujuan',
          to: '/approvals',
          icon: 'check',
          permission: 'approval:view',
          badge: auth.pendingApprovalsCount > 0 ? auth.pendingApprovalsCount : undefined,
        },
      ],
    },
    {
      id: 'operasional-out',
      title: 'BELANJA & ANGGARAN',
      items: [
        {
          id: 'budgets',
          label: 'Perencanaan & Pagu',
          to: '/budgets',
          icon: 'pie',
          permission: 'budget:view',
        },
        {
          id: 'out-pengadaan',
          label: 'Pengadaan & Kas Kecil',
          icon: 'bag',
          permission: 'procurement:view',
          children: [
            {
              id: 'procurement',
              label: 'Pengadaan & Tagihan LS',
              to: '/procurement',
              permission: 'procurement:view',
            },
            {
              id: 'petty-cash',
              label: 'Uang Persediaan (GUP/TUP)',
              to: '/petty-cash',
              permission: 'procurement:view',
            },
          ],
        },
        {
          id: 'reconciliation',
          label: 'Rekonsiliasi Bank BTN',
          to: '/reconciliation',
          icon: 'bank',
          permission: 'reconciliation:view',
        },
      ],
    },
    {
      id: 'akuntansi-out',
      title: 'AKUNTANSI & SDM',
      items: [
        {
          id: 'accounting',
          label: 'Akuntansi & Buku Besar',
          to: '/accounting',
          icon: 'book',
          permission: 'accounting:view',
        },
        {
          id: 'assets',
          label: 'Inventaris & Aset PMO',
          to: '/assets',
          icon: 'box',
          permission: 'accounting:view',
        },
        {
          id: 'hris',
          label: 'Honorarium & Payroll',
          to: '/hris',
          icon: 'users',
          permission: 'admin:view',
        },
        {
          id: 'reports',
          label: 'Laporan Keuangan',
          to: '/reports',
          icon: 'chart',
          permission: 'report:view',
        },
        {
          id: 'admin',
          label: 'Pengguna, Role & Audit',
          to: '/admin',
          icon: 'shield',
          permission: 'admin:view',
        },
      ],
    },
  ];
  return filterSectionsByPermission(outSections);
});

function filterSectionsByPermission(sections: SidebarSection[]): SidebarSection[] {
  return sections
    .map((sec) => {
      const visibleItems = sec.items
        .map((item) => {
          if (item.children) {
            const visibleChildren = item.children.filter((c) => !c.permission || auth.hasPermission(c.permission));
            if (visibleChildren.length === 0) return null;
            return { ...item, children: visibleChildren };
          }
          if (item.permission && !auth.hasPermission(item.permission)) return null;
          return item;
        })
        .filter(Boolean) as SidebarItem[];
      return { ...sec, items: visibleItems };
    })
    .filter((sec) => sec.items.length > 0);
}

function isLinkActive(to: string): boolean {
  const [targetPath, queryStr] = to.split('?');
  if (route.path !== targetPath) return false;
  if (!queryStr) return true;
  const params = new URLSearchParams(queryStr);
  for (const [k, v] of params.entries()) {
    const curVal = typeof route.query[k] === 'string' ? route.query[k] : '';
    if (!curVal) {
      if (targetPath === '/revenue' && k === 'tab' && v === 'buku_harian') return true;
      if (targetPath === '/penerimaan/pembukuan' && k === 'section' && v === 'bku') return true;
      if (targetPath === '/penerimaan/laporan' && k === 'section' && v === 'realisasi') return true;
      return false;
    }
    if (curVal !== v) return false;
  }
  return true;
}

function isGroupActive(item: SidebarItem): boolean {
  if (!item.children) return Boolean(item.to && isLinkActive(item.to));
  return item.children.some((c) => isLinkActive(c.to));
}

function navigateTo(to: string) {
  mobileSidebarOpen.value = false;
  router.push(to);
}

// Dynamic Breadcrumb rendered inside <main> above H1 (DropX 1:1 pattern!)
const breadcrumbItems = computed<Array<{ label: string; to?: string }>>(() => {
  const domainLabel = effectiveWorkspace.value === 'PENERIMAAN' ? 'Penerimaan' : 'Pengeluaran';
  const base: Array<{ label: string; to?: string }> = [{ label: domainLabel, to: '/dashboard' }];

  if (route.path === '/dashboard') {
    return [{ label: 'Dashboard' }];
  }
  if (route.path === '/revenue') {
    const tab = String(route.query.tab || 'buku_harian');
    base.push({ label: 'Transaksi & Tagihan' });
    if (tab === 'invoices') base.push({ label: 'Tagihan & Invoice' });
    else if (tab === 'layanan') base.push({ label: 'Katalog Layanan' });
    else base.push({ label: 'Buku Harian' });
    return base;
  }
  if (route.path === '/reconciliation') {
    base.push({ label: effectiveWorkspace.value === 'PENERIMAAN' ? 'Rekonsiliasi Bank Mandiri' : 'Rekonsiliasi Bank BTN' });
    return base;
  }
  if (route.path === '/penerimaan/pembukuan') {
    const sec = String(route.query.section || 'bku');
    base.push({ label: 'Pembukuan & Pajak' });
    if (sec === 'jurnal') base.push({ label: 'Jurnal Umum' });
    else if (sec === 'perincian') base.push({ label: 'Perincian Pajak' });
    else if (sec === 'surat') base.push({ label: 'Surat Penarikan Pajak' });
    else base.push({ label: 'Buku Kas Umum (BKU)' });
    return base;
  }
  if (route.path === '/penerimaan/laporan') {
    const sec = String(route.query.section || 'realisasi');
    base.push({ label: 'Laporan Penerimaan' });
    base.push({ label: sec === 'aging' ? 'Aging Piutang' : 'Realisasi & Target RAB' });
    return base;
  }
  base.push({ label: String(route.meta.title || 'Modul') });
  return base;
});

const activePeriodLabel = computed(() => {
  const code = auth.activePeriod?.code || fiscalPeriods.value[0]?.code || 'FP-2026-11';
  return code;
});

const userInitials = computed(() => {
  const name = auth.user?.fullName || 'PM';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
});

const shortDisplayName = computed(() => {
  const full = auth.user?.fullName || 'Pengguna';
  return full.split(',')[0].trim();
});

const shortRoleName = computed(() => {
  const r = auth.effectiveRoleName || 'User';
  return r.split('/')[0].trim();
});

const searchPlaceholder = computed(() =>
  effectiveWorkspace.value === 'PENERIMAAN'
    ? 'Cari kwitansi, invoice, COA, klien...'
    : 'Cari modul, dokumen, transaksi...'
);

const unreadCount = computed(() => {
  const localUnread = notifications.value.filter((n) => !n.isRead).length;
  return Math.max(localUnread, auth.unreadNotifications || 0);
});

async function loadMasterContext() {
  if (!auth.token) return;
  try {
    const nRes = await apiFetch('/reports/notifications').catch(() => ({ data: [] }));
    notifications.value = nRes.data || [];
  } catch {
    // Non-blocking header hydration
  }
}

async function openNotificationDrawer() {
  profileMenuOpen.value = false;
  notifDrawerOpen.value = !notifDrawerOpen.value;
  if (notifDrawerOpen.value && auth.token) {
    try {
      const res = await apiFetch('/reports/notifications');
      notifications.value = res.data || [];
    } catch {
      // Keep last loaded list
    }
  }
}

async function markAllNotificationsRead() {
  try {
    await apiFetch('/reports/notifications/read-all', { method: 'POST' });
    notifications.value = notifications.value.map((n) => ({ ...n, isRead: true }));
    auth.unreadNotifications = 0;
  } catch {
    // Ignore
  }
}

async function handleNotificationClick(n: any) {
  if (!n.isRead) {
    n.isRead = true;
    auth.unreadNotifications = Math.max(0, (auth.unreadNotifications || 1) - 1);
    apiFetch(`/reports/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
  }
  notifDrawerOpen.value = false;
  if (n.link) {
    if (String(n.link).startsWith('/revenue') || String(n.link).startsWith('/penerimaan')) {
      auth.setWorkspace('PENERIMAAN');
    }
    router.push(n.link);
  }
}

async function handleLogout() {
  profileMenuOpen.value = false;
  await auth.logout();
  router.push('/login');
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdPaletteOpen.value = !cmdPaletteOpen.value;
  }
  if (e.key === 'Escape') {
    notifDrawerOpen.value = false;
    profileMenuOpen.value = false;
    mobileSidebarOpen.value = false;
  }
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (!target.closest('.topbar-user-wrap')) {
    profileMenuOpen.value = false;
  }
  if (!target.closest('.topbar-notif-wrap')) {
    notifDrawerOpen.value = false;
  }
}

provide('openAiAssistant', () => {
  aiAssistantOpen.value = true;
});

provide('openOmnisearch', () => {
  cmdPaletteOpen.value = true;
});

// Ensure active workspace is valid whenever user visits a direct inner page
watch(
  () => route.path,
  (p) => {
    mobileSidebarOpen.value = false;
    if (p !== '/' && auth.activeWorkspace === 'GATEWAY') {
      auth.ensureValidWorkspace();
    }
    if (p === '/revenue' || p.startsWith('/penerimaan')) {
      if (auth.canAccessPenerimaan) auth.setWorkspace('PENERIMAAN');
    }
  },
  { immediate: true }
);

onMounted(() => {
  loadMasterContext();
  window.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <div
    class="dropx-shell"
    :class="{
      'is-collapsed': sidebarCollapsed,
      'is-gateway': isGatewayScreen,
    }"
  >
    <a href="#main-content" class="skip-link">Lewati ke konten utama</a>

    <!-- Mobile Backdrop -->
    <div
      v-if="!isGatewayScreen && mobileSidebarOpen"
      class="sb-mobile-backdrop"
      @click="mobileSidebarOpen = false"
    ></div>

    <!-- ==================== LEFT VERTICAL SIDEBAR (DROPX 252px / 60px PURE WHITE) ==================== -->
    <aside
      v-if="!isGatewayScreen"
      class="dropx-sidebar"
      :class="{ 'is-mobile-open': mobileSidebarOpen }"
      aria-label="Navigasi Utama Modul"
    >
      <!-- Flush 69px Pure White Brand Header (aligns seamlessly with 69px Topbar) -->
      <div class="sb-brand">
        <button
          type="button"
          class="sb-brand-btn"
          title="Kembali ke Pilih Modul Utama"
          @click="backToModulePicker"
        >
          <img :src="logoPmoEmblem" alt="Logo PMO UTama" class="sb-logo-img" />
          <div v-if="!sidebarCollapsed" class="sb-brand-text">
            <strong>PMO UTama</strong>
            <span>FINANCE ERP</span>
          </div>
        </button>

        <button
          type="button"
          class="sb-mobile-close"
          aria-label="Tutup menu navigasi"
          @click="mobileSidebarOpen = false"
        >
          &times;
        </button>
      </div>

      <!-- Compact Workspace Switcher (DropX muted pill, RBAC-aware) -->
      <div v-if="!sidebarCollapsed" class="sb-ws-zone">
        <div
          v-if="hasDualWorkspace"
          class="sb-ws-switcher"
          role="tablist"
          aria-label="Pilih Ruang Kerja Keuangan"
        >
          <button
            type="button"
            role="tab"
            class="sb-ws-btn"
            :class="{ active: effectiveWorkspace === 'PENERIMAAN' }"
            :aria-selected="effectiveWorkspace === 'PENERIMAAN'"
            @click="switchWorkspace('PENERIMAAN')"
          >
            Penerimaan
          </button>
          <button
            type="button"
            role="tab"
            class="sb-ws-btn"
            :class="{ active: effectiveWorkspace === 'PENGELUARAN' }"
            :aria-selected="effectiveWorkspace === 'PENGELUARAN'"
            @click="switchWorkspace('PENGELUARAN')"
          >
            Pengeluaran
          </button>
        </div>

        <div v-else class="sb-ws-single">
          <span class="sb-ws-dot"></span>
          <span>Ruang Kerja {{ effectiveWorkspace === 'PENERIMAAN' ? 'Penerimaan' : 'Pengeluaran' }}</span>
        </div>
      </div>

      <!-- Scrollable Navigation Menu -->
      <nav class="sb-nav" aria-label="Menu Modul">
        <div
          v-for="(sec, sIdx) in sidebarSections"
          :key="sec.id"
          class="sb-section"
          :class="{ 'is-first': sIdx === 0 }"
        >
          <p v-if="!sidebarCollapsed" class="sb-section-title">{{ sec.title }}</p>

          <ul class="sb-list">
            <li v-for="item in sec.items" :key="item.id" class="sb-li">
              <!-- Parent Accordion Group -->
              <template v-if="item.children">
                <button
                  type="button"
                  class="sb-item"
                  :class="{ active: isGroupActive(item) }"
                  :title="sidebarCollapsed ? item.label : ''"
                  :aria-expanded="Boolean(openGroups[item.id])"
                  @click="toggleGroup(item.id)"
                >
                  <span class="sb-ico" aria-hidden="true">
                    <svg v-if="item.icon === 'receipt'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 1V2H4z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>
                    <svg v-else-if="item.icon === 'book'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <svg v-else-if="item.icon === 'chart'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                    <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  </span>
                  <span v-if="!sidebarCollapsed" class="sb-label">{{ item.label }}</span>
                  <svg
                    v-if="!sidebarCollapsed"
                    class="sb-chevron"
                    :class="{ rotated: openGroups[item.id] }"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                <!-- DropX Clean 1px Hairline Submenu (ZERO bullet dots!) -->
                <ul v-if="!sidebarCollapsed && openGroups[item.id]" class="sb-sublist">
                  <li v-for="child in item.children" :key="child.id">
                    <button
                      type="button"
                      class="sb-subitem"
                      :class="{ active: isLinkActive(child.to) }"
                      @click="navigateTo(child.to)"
                    >
                      {{ child.label }}
                    </button>
                  </li>
                </ul>
              </template>

              <!-- Direct Link -->
              <template v-else>
                <button
                  type="button"
                  class="sb-item"
                  :class="{ active: item.to ? isLinkActive(item.to) : false }"
                  :title="sidebarCollapsed ? item.label : ''"
                  @click="item.to && navigateTo(item.to)"
                >
                  <span class="sb-ico" aria-hidden="true">
                    <svg v-if="item.icon === 'dashboard'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                    <svg v-else-if="item.icon === 'bank'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M6 10v11"/><path d="M12 10v11"/><path d="M18 10v11"/></svg>
                    <svg v-else-if="item.icon === 'shield'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <svg v-else-if="item.icon === 'check'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <svg v-else-if="item.icon === 'pie'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                    <svg v-else-if="item.icon === 'book'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <svg v-else-if="item.icon === 'box'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    <svg v-else-if="item.icon === 'users'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                  </span>
                  <span v-if="!sidebarCollapsed" class="sb-label">{{ item.label }}</span>
                  <span v-if="!sidebarCollapsed && item.badge" class="sb-badge">{{ item.badge }}</span>
                </button>
              </template>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

    <!-- ==================== RIGHT COLUMN: FROSTED 69px TOPBAR + MAIN ==================== -->
    <div class="dropx-main-col">
      <header class="dropx-topbar">
        <div class="topbar-left">
          <!-- Gateway Mode Brand OR Sidebar Collapse Trigger -->
          <template v-if="isGatewayScreen">
            <div class="gw-brand">
              <img :src="logoPmoEmblem" alt="Logo PMO UTama" class="sb-logo-img" />
              <div class="sb-brand-text">
                <strong>PMO UTama</strong>
                <span>FINANCE ERP</span>
              </div>
            </div>
          </template>
          <template v-else>
            <button
              type="button"
              class="tb-icon-btn desktop-only"
              :title="sidebarCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'"
              aria-label="Ubah ukuran sidebar"
              @click="toggleDesktopSidebar"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <path v-if="!sidebarCollapsed" d="m15 15-3-3 3-3" />
                <path v-else d="m13 9 3 3-3 3" />
              </svg>
            </button>

            <button
              type="button"
              class="tb-menu-btn mobile-only"
              aria-label="Buka menu navigasi"
              @click="mobileSidebarOpen = true"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              <span>Menu</span>
            </button>

            <!-- Wide DropX Search Bar (h-10 rounded-xl) -->
            <button
              type="button"
              class="tb-search-bar"
              @click="cmdPaletteOpen = true"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <span class="tb-search-text">{{ searchPlaceholder }}</span>
              <kbd class="tb-kbd">Ctrl K</kbd>
            </button>
          </template>
        </div>

        <div class="topbar-right">
          <!-- Subtle Fiscal Period Badge -->
          <div class="tb-period-chip" title="Periode Pembukuan Aktif">
            <span>{{ activePeriodLabel }}</span>
          </div>

          <!-- Switch Module Shortcut (Home Grid Icon) -->
          <button
            v-if="!isGatewayScreen"
            type="button"
            class="tb-icon-btn"
            title="Pilih Modul Awal (Penerimaan / Pengeluaran)"
            aria-label="Pilih Modul Awal"
            @click="backToModulePicker"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>

          <!-- AI Assistant Icon Button -->
          <button
            type="button"
            class="tb-icon-btn"
            title="Asisten Keuangan AI"
            aria-label="Buka Asisten Keuangan AI"
            @click="aiAssistantOpen = true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <!-- Notification Bell -->
          <div class="topbar-notif-wrap">
            <button
              type="button"
              class="tb-icon-btn"
              title="Pusat Notifikasi"
              aria-label="Pusat Notifikasi"
              @click.stop="openNotificationDrawer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span v-if="unreadCount > 0" class="tb-notif-dot">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
            </button>

            <div v-if="notifDrawerOpen" class="tb-popover notif-popover" role="dialog" aria-label="Daftar Notifikasi">
              <div class="pop-head">
                <strong>Notifikasi ({{ unreadCount }})</strong>
                <button
                  v-if="notifications.length > 0 && unreadCount > 0"
                  type="button"
                  class="pop-link-btn"
                  @click="markAllNotificationsRead"
                >
                  Tandai semua dibaca
                </button>
              </div>
              <div v-if="notifications.length === 0" class="pop-empty">
                Belum ada notifikasi baru.
              </div>
              <div v-else class="pop-list">
                <button
                  v-for="n in notifications.slice(0, 12)"
                  :key="n.id"
                  type="button"
                  class="notif-row"
                  :class="{ unread: !n.isRead, warn: n.severity === 'WARNING' }"
                  @click="handleNotificationClick(n)"
                >
                  <div class="notif-title-line">
                    <span v-if="!n.isRead" class="notif-unread-dot"></span>
                    <strong>{{ n.title }}</strong>
                  </div>
                  <p class="notif-msg">{{ n.message }}</p>
                  <span class="notif-time">{{ formatDateTime(n.createdAt) }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- DropX User Profile Pill (Circular Avatar + Name + Emerald Shield Role) -->
          <div class="topbar-user-wrap">
            <button
              type="button"
              class="tb-user-pill"
              aria-label="Menu Pengguna"
              @click.stop="profileMenuOpen = !profileMenuOpen"
            >
              <span class="tb-avatar">{{ userInitials }}</span>
              <div class="tb-user-meta">
                <strong>{{ shortDisplayName }}</strong>
                <span class="tb-role-line">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  {{ shortRoleName }}
                </span>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div v-if="profileMenuOpen" class="tb-popover user-popover" role="menu">
              <div class="user-pop-head">
                <strong>{{ auth.user?.fullName }}</strong>
                <span>{{ auth.user?.email }}</span>
                <span class="user-pop-role">{{ auth.effectiveRoleName }}</span>
              </div>
              <div class="user-pop-actions">
                <button type="button" class="pop-menu-item" @click="backToModulePicker(); profileMenuOpen = false">
                  Pilih Modul Awal
                </button>
                <button
                  v-if="auth.hasPermission('admin:view')"
                  type="button"
                  class="pop-menu-item"
                  @click="router.push('/admin'); profileMenuOpen = false"
                >
                  Pengaturan &amp; Audit
                </button>
                <button type="button" class="pop-menu-item danger" @click="handleLogout">
                  Keluar dari Sistem
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Access Denied Floating Toast -->
      <div v-if="auth.accessDeniedAlert?.show" class="access-toast" role="alert">
        <div>
          <strong>Akses Dibatasi</strong>
          <span>Peran {{ auth.accessDeniedAlert.roleName }} tidak memiliki izin ke {{ auth.accessDeniedAlert.moduleName }}.</span>
        </div>
        <button type="button" class="toast-x" aria-label="Tutup pesan" @click="auth.dismissAccessDenied()">&times;</button>
      </div>

      <!-- Main Workspace Canvas -->
      <main id="main-content" class="dropx-content" :class="{ 'no-pad': isGatewayScreen }">
        <!-- DropX Breadcrumb INSIDE <main> right above Page H1 -->
        <nav v-if="!isGatewayScreen" class="dropx-breadcrumb" aria-label="Breadcrumb">
          <button
            type="button"
            class="bc-home"
            title="Pilih Modul Awal"
            aria-label="Beranda Modul"
            @click="backToModulePicker"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
          <template v-for="(crumb, idx) in breadcrumbItems" :key="crumb.label + idx">
            <span class="bc-sep" aria-hidden="true">&rsaquo;</span>
            <button
              v-if="crumb.to && idx < breadcrumbItems.length - 1"
              type="button"
              class="bc-link"
              @click="router.push(crumb.to)"
            >
              {{ crumb.label }}
            </button>
            <span v-else :class="idx === breadcrumbItems.length - 1 ? 'bc-current' : 'bc-group'">{{ crumb.label }}</span>
          </template>
        </nav>

        <router-view />
      </main>
    </div>

    <AiAssistantWidget :is-open="aiAssistantOpen" @close="aiAssistantOpen = false" />
    <AppLauncherModal :is-open="appLauncherOpen" @close="appLauncherOpen = false" @open-ai="aiAssistantOpen = true" />
    <OmnisearchModal :is-open="cmdPaletteOpen" @close="cmdPaletteOpen = false" @open-ai="aiAssistantOpen = true" @open-launcher="appLauncherOpen = true" />
  </div>
</template>

<style scoped>
.dropx-shell {
  display: flex;
  min-height: 100vh;
  background: #f9fafb;
  color: #111827;
}

/* ==================== LEFT SIDEBAR (EXACT DROPX 252px / 60px) ==================== */
.dropx-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 252px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  z-index: 40;
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dropx-shell.is-collapsed .dropx-sidebar {
  width: 60px;
}

/* Pure White 69px Brand Header aligned flush with 69px Topbar */
.sb-brand {
  height: 69px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.dropx-shell.is-collapsed .sb-brand {
  padding: 0 12px;
  justify-content: center;
}

.sb-brand-btn,
.gw-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.gw-brand {
  cursor: default;
}

.sb-logo-img {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

.sb-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sb-brand-text strong {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.sb-brand-text span {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: #6b7280;
  text-transform: uppercase;
  margin-top: 2px;
}

.sb-mobile-close {
  display: none;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 18px;
  cursor: pointer;
}

/* Compact Muted Workspace Switcher */
.sb-ws-zone {
  padding: 12px 12px 0;
  flex-shrink: 0;
}

.sb-ws-switcher {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  background: #f3f4f6;
  border-radius: 8px;
}

.sb-ws-btn {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.sb-ws-btn:hover:not(.active) {
  color: #111827;
}

.sb-ws-btn.active {
  background: #ffffff;
  color: #034693;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.sb-ws-single {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(3, 70, 147, 0.06);
  color: #034693;
  font-size: 12px;
  font-weight: 500;
}

.sb-ws-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: #10b981;
}

/* Scrollable Navigation Tree */
.sb-nav {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px 24px;
}

.dropx-shell.is-collapsed .sb-nav {
  padding: 14px 8px;
}

.sb-section {
  margin-top: 20px;
}

.sb-section.is-first {
  margin-top: 0;
}

.sb-section-title {
  margin: 0 0 6px;
  padding: 0 12px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6b7280;
}

.sb-list,
.sb-sublist {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sb-li {
  margin-bottom: 2px;
}

.sb-item {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 150ms ease, color 150ms ease;
}

.dropx-shell.is-collapsed .sb-item {
  padding: 0;
  justify-content: center;
  width: 42px;
  margin: 0 auto;
}

.sb-item:hover {
  background: #f3f4f6;
  color: #111827;
}

.sb-item.active {
  background: rgba(3, 70, 147, 0.08);
  color: #034693;
}

.sb-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sb-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-chevron {
  color: #9ca3af;
  flex-shrink: 0;
  transition: transform 160ms ease;
}

.sb-chevron.rotated {
  transform: rotate(180deg);
}

.sb-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  background: #f59e0b;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* DropX Exact Submenu Tree: 1px vertical hairline, ZERO bullet dots! */
.sb-sublist {
  margin: 2px 0 6px 21px;
  padding-left: 12px;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-subitem {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 12.5px;
  line-height: 18px;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 140ms ease;
}

.sb-subitem:hover {
  color: #111827;
}

.sb-subitem.active {
  color: #034693;
  font-weight: 500;
  background: transparent;
}

/* ==================== MAIN COLUMN + FROSTED 69px TOPBAR ==================== */
.dropx-main-col {
  flex: 1;
  min-width: 0;
  margin-left: 252px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  transition: margin-left 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dropx-shell.is-collapsed .dropx-main-col {
  margin-left: 60px;
}

.dropx-shell.is-gateway .dropx-main-col {
  margin-left: 0;
}

.dropx-topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 69px;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(229, 231, 235, 0.85);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tb-icon-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.tb-icon-btn:hover {
  border-color: rgba(3, 70, 147, 0.3);
  background: rgba(3, 70, 147, 0.05);
  color: #034693;
}

.mobile-only {
  display: none;
}

.tb-menu-btn {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.tb-menu-btn:active {
  background: #f3f4f6;
}

.tb-search-bar {
  width: 100%;
  max-width: 480px;
  height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 150ms ease, background 150ms ease;
}

.tb-search-bar:hover {
  border-color: #d1d5db;
  background: #ffffff;
}

.tb-search-text {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 5px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #6b7280;
}

.tb-period-chip {
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #374151;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.tb-notif-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9999px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #ffffff;
}

/* DropX User Pill */
.topbar-notif-wrap,
.topbar-user-wrap {
  position: relative;
}

.tb-user-pill {
  height: 36px;
  padding: 0 10px 0 6px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #111827;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 150ms ease, background 150ms ease;
}

.tb-user-pill:hover {
  border-color: #d1d5db;
  background: #ffffff;
}

.tb-avatar {
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: #034693;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tb-user-meta {
  display: flex;
  flex-direction: column;
  text-align: left;
  line-height: 1.15;
}

.tb-user-meta strong {
  font-size: 12.5px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}

.tb-role-line {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  font-weight: 500;
  color: #059669;
  white-space: nowrap;
}

/* Popovers */
.tb-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 30px -6px rgba(0, 0, 0, 0.14), 0 2px 6px -2px rgba(0, 0, 0, 0.06);
  z-index: 60;
  overflow: hidden;
}

.notif-popover {
  width: min(360px, 90vw);
}

.user-popover {
  width: 230px;
}

.pop-head {
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.pop-link-btn {
  border: none;
  background: transparent;
  color: #034693;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.pop-link-btn:hover {
  text-decoration: underline;
}

.pop-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

.pop-list {
  max-height: 360px;
  overflow-y: auto;
}

.notif-row {
  width: 100%;
  border: none;
  border-bottom: 1px solid #f3f4f6;
  background: #ffffff;
  padding: 11px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.notif-row:hover {
  background: #f9fafb;
}

.notif-row.unread {
  background: rgba(3, 70, 147, 0.04);
}

.notif-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #111827;
}

.notif-unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: #034693;
  flex-shrink: 0;
}

.notif-msg {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.notif-time {
  font-size: 11px;
  color: #9ca3af;
}

.user-pop-head {
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-pop-head strong {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.user-pop-head span {
  font-size: 12px;
  color: #6b7280;
}

.user-pop-role {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px !important;
  font-weight: 500;
  color: #034693 !important;
}

.user-pop-actions {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pop-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: #374151;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.pop-menu-item:hover {
  background: #f3f4f6;
  color: #111827;
}

.pop-menu-item.danger {
  color: #dc2626;
}

.pop-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* ==================== MAIN CONTENT + IN-MAIN BREADCRUMB ==================== */
.dropx-content {
  flex: 1;
  padding: 20px 24px 36px;
  min-width: 0;
}

.dropx-content.no-pad {
  padding: 0;
}

.dropx-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #6b7280;
}

.bc-home {
  border: none;
  background: transparent;
  color: #6b7280;
  padding: 0;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.bc-home:hover {
  color: #111827;
}

.bc-sep {
  color: #9ca3af;
}

.bc-link {
  border: none;
  background: transparent;
  padding: 0;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
}

.bc-link:hover {
  color: #034693;
}

.bc-current {
  color: #111827;
  font-weight: 500;
}

/* Access Denied Toast */
.access-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  background: #111827;
  color: #ffffff;
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
  max-width: 420px;
}

.access-toast div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}

.access-toast strong {
  font-size: 13px;
}

.toast-x {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 18px;
  cursor: pointer;
}

.sb-mobile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  z-index: 38;
}

@media (max-width: 1024px) {
  .dropx-sidebar {
    transform: translateX(-100%);
    width: min(296px, 86vw) !important;
  }
  .dropx-sidebar.is-mobile-open {
    transform: translateX(0);
    box-shadow: 0 18px 40px rgba(17, 24, 39, 0.22);
  }
  .dropx-main-col,
  .dropx-shell.is-collapsed .dropx-main-col {
    margin-left: 0;
  }
  .desktop-only {
    display: none;
  }
  .mobile-only {
    display: inline-flex;
  }
  .sb-mobile-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }
  .sb-nav {
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
  .sb-ws-btn {
    min-height: 40px;
    font-size: 13px;
  }
  .sb-item {
    min-height: 44px;
    font-size: 14px;
  }
  .sb-subitem {
    min-height: 42px;
    font-size: 13px;
  }
  .dropx-topbar {
    height: 60px;
    padding: 0 12px;
    gap: 8px;
  }
  .tb-icon-btn {
    min-width: 44px;
    min-height: 44px;
  }
  .tb-user-pill {
    min-height: 44px;
    padding: 0 8px;
  }
  .tb-search-bar {
    min-height: 44px;
    min-width: 0;
    padding: 0 10px;
  }
  .tb-kbd {
    display: none;
  }
  .dropx-content {
    padding: 14px 14px max(28px, env(safe-area-inset-bottom));
  }
  .tb-period-chip,
  .tb-user-meta {
    display: none;
  }
}

@media (max-width: 640px) {
  .dropx-topbar {
    height: 56px;
  }
  .topbar-right {
    gap: 6px;
  }
  .tb-search-text {
    font-size: 13px;
  }
  .dropx-breadcrumb {
    flex-wrap: wrap;
    row-gap: 4px;
    font-size: 12.5px;
  }
}
</style>
