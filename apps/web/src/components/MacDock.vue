<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const emit = defineEmits<{
  (e: 'open-ai'): void;
  (e: 'open-launchpad'): void;
}>();

// Explicit Arrow Toggle State (Tutup / Buka via Arrow Button)
// Default is open (false), remembers user preference
const isClosed = ref<boolean>(localStorage.getItem('pmo_dock_closed') === 'true');

function toggleDock(closed?: boolean) {
  isClosed.value = typeof closed === 'boolean' ? closed : !isClosed.value;
  localStorage.setItem('pmo_dock_closed', String(isClosed.value));
}

function handleGlobalKeydown(e: KeyboardEvent) {
  // Option+D / Alt+D or Cmd+Option+D toggles dock open / close
  if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    toggleDock();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});

interface DockItem {
  id: string;
  name: string;
  route?: string;
  action?: 'ai' | 'home';
  gradient: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  permission?: string;
  isDividerAfter?: boolean;
}

const dockItems: DockItem[] = [
  {
    id: 'home',
    name: 'Menu Aplikasi (Launchpad)',
    route: '/',
    action: 'home',
    gradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
    icon: 'launchpad',
  },
  {
    id: 'dashboard',
    name: 'Executive Dashboard',
    route: '/dashboard',
    gradient: 'linear-gradient(135deg, #034693, #022b5c)',
    icon: 'dashboard',
  },
  {
    id: 'approvals',
    name: 'Approval Inbox',
    route: '/approvals',
    permission: 'approval:view',
    gradient: 'linear-gradient(135deg, #d97706, #92400e)',
    icon: 'approvals',
    badge: '2',
    badgeColor: '#f59e0b',
  },
  {
    id: 'budgets',
    name: 'Perencanaan Anggaran',
    route: '/budgets',
    permission: 'budget:view',
    gradient: 'linear-gradient(135deg, #059669, #065f46)',
    icon: 'budgets',
  },
  {
    id: 'procurement',
    name: 'Pengadaan & PO',
    route: '/procurement',
    permission: 'procurement:view',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    icon: 'procurement',
  },
  {
    id: 'expenses',
    name: 'Klaim Biaya (Expenses)',
    route: '/procurement?tab=expenses',
    permission: 'expense:view',
    gradient: 'linear-gradient(135deg, #e11d48, #9f1239)',
    icon: 'expenses',
  },
  {
    id: 'revenue',
    name: 'Pendapatan & Kasir',
    route: '/revenue',
    permission: 'revenue:view',
    gradient: 'linear-gradient(135deg, #ea580c, #9a3412)',
    icon: 'revenue',
  },
  {
    id: 'reconciliation',
    name: 'Kas & Rekonsiliasi Bank',
    route: '/reconciliation',
    permission: 'reconciliation:view',
    gradient: 'linear-gradient(135deg, #0d9488, #115e59)',
    icon: 'reconciliation',
  },
  {
    id: 'accounting',
    name: 'Akuntansi & Buku Besar',
    route: '/accounting',
    permission: 'accounting:view',
    gradient: 'linear-gradient(135deg, #4f46e5, #3730a3)',
    icon: 'accounting',
  },
  {
    id: 'reports',
    name: 'Laporan Keuangan',
    route: '/reports',
    permission: 'report:view',
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    icon: 'reports',
    isDividerAfter: true, // Pemisah aplikasi operasional vs sistem/AI
  },
  {
    id: 'admin',
    name: 'Pengaturan & Audit',
    route: '/admin',
    permission: 'admin:view',
    gradient: 'linear-gradient(135deg, #475569, #1e293b)',
    icon: 'admin',
  },
  {
    id: 'ai',
    name: 'AI Financial Assistant',
    action: 'ai',
    gradient: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
    icon: 'ai',
    badge: 'AI',
    badgeColor: '#a855f7',
  },
];

// Show all items on the Dock so users can visually recognize what features exist,
// while unauthorized modules are disabled, badged with 🔒, and prevented from opening.
const visibleItems = computed(() => dockItems);

function isItemLocked(item: DockItem): boolean {
  if (!item.permission) return false;
  return !auth.hasPermission(item.permission);
}

function isItemActive(item: DockItem): boolean {
  if (item.action === 'home') return false;
  if (!item.route) return false;
  if (item.id === 'expenses') return route.path === '/procurement' && route.query.tab === 'expenses';
  if (item.id === 'procurement') return route.path === '/procurement' && route.query.tab !== 'expenses';
  return route.path.startsWith(item.route);
}

const lockedShakeId = ref<string | null>(null);

function handleItemClick(item: DockItem) {
  if (isItemLocked(item)) {
    lockedShakeId.value = item.id;
    setTimeout(() => {
      lockedShakeId.value = null;
    }, 450);
    auth.triggerAccessDenied(item.name);
    return;
  }
  if (item.action === 'ai') {
    emit('open-ai');
  } else if (item.action === 'home') {
    emit('open-launchpad');
  } else if (item.route) {
    router.push(item.route);
  }
}
</script>

<template>
  <!-- Floating Upward Arrow Pill to Open / Buka Dock when closed -->
  <button
    v-if="isClosed"
    type="button"
    class="dock-expand-tab"
    title="Buka Navigasi Dock (Alt+D)"
    aria-label="Buka Navigasi Dock"
    @click="toggleDock(false)"
  >
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
    <span class="expand-tab-label">Buka Dock</span>
  </button>

  <!-- Dock Wrapper with Smooth Slide Translation -->
  <div
    class="mac-dock-wrapper"
    :class="{
      'is-closed': isClosed,
      'is-open': !isClosed
    }"
    role="navigation"
    aria-label="macOS Floating Dock ERP"
  >
    <!-- Top-Center Chevron Handle to Collapse / Tutup Dock -->
    <button
      type="button"
      class="dock-collapse-tab"
      title="Tutup Navigasi Dock (Alt+D)"
      aria-label="Tutup Dock"
      @click="toggleDock(true)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <div class="mac-dock-glass">
      <template v-for="item in visibleItems" :key="item.id">
        <!-- Dock Icon Item with Spring Magnification -->
        <button
          type="button"
          class="dock-item"
          :class="{
            'is-active': isItemActive(item),
            'is-locked': isItemLocked(item),
            'shake-locked': lockedShakeId === item.id
          }"
          :aria-label="item.name"
          @click="handleItemClick(item)"
        >
          <!-- macOS Native Dark Glass Popup Tooltip -->
          <div class="mac-tooltip">
            <span>{{ item.name }}</span>
            <span v-if="isItemLocked(item)" class="mac-tooltip-lock">🔒 Terkunci (Role: {{ auth.effectiveRoleName }})</span>
          </div>

          <!-- Squircle App Icon with Subtle Bevel & Shadow -->
          <div class="dock-squircle" :style="{ background: item.gradient }">
            <!-- Counter Badge (hanya jika modul terbuka) -->
            <span
              v-if="item.badge && !isItemLocked(item)"
              class="dock-badge"
              :style="{ backgroundColor: item.badgeColor || '#ef4444' }"
            >
              {{ item.badge }}
            </span>

            <!-- Lock Badge on Top-Right Corner of Squircle when Unauthorized -->
            <span v-if="isItemLocked(item)" class="dock-lock-badge" title="Akses Dibatasi">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
              </svg>
            </span>

            <!-- SVGs for each App -->
            <!-- 0. Launchpad / Home -->
            <svg v-if="item.icon === 'launchpad'" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="5" r="2.4"></circle>
              <circle cx="12" cy="5" r="2.4"></circle>
              <circle cx="19" cy="5" r="2.4"></circle>
              <circle cx="5" cy="12" r="2.4"></circle>
              <circle cx="12" cy="12" r="2.4"></circle>
              <circle cx="19" cy="12" r="2.4"></circle>
              <circle cx="5" cy="19" r="2.4"></circle>
              <circle cx="12" cy="19" r="2.4"></circle>
              <circle cx="19" cy="19" r="2.4"></circle>
            </svg>

            <!-- 1. Dashboard -->
            <svg v-else-if="item.icon === 'dashboard'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1.5"></rect>
              <rect x="14" y="3" width="7" height="5" rx="1.5"></rect>
              <rect x="14" y="12" width="7" height="9" rx="1.5"></rect>
              <rect x="3" y="16" width="7" height="5" rx="1.5"></rect>
            </svg>

            <!-- 2. Approvals -->
            <svg v-else-if="item.icon === 'approvals'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>

            <!-- 3. Budgets -->
            <svg v-else-if="item.icon === 'budgets'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <line x1="12" y1="7" x2="12" y2="17"></line>
              <path d="M15 9.5H10.5a2 2 0 0 0 0 4H13.5a2 2 0 0 1 0 4H9"></path>
            </svg>

            <!-- 4. Procurement -->
            <svg v-else-if="item.icon === 'procurement'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
              <path d="M3 6h18"></path>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>

            <!-- 5. Expenses -->
            <svg v-else-if="item.icon === 'expenses'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
              <circle cx="7" cy="15" r="1"></circle>
            </svg>

            <!-- 6. Revenue -->
            <svg v-else-if="item.icon === 'revenue'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>

            <!-- 7. Reconciliation -->
            <svg v-else-if="item.icon === 'reconciliation'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18"></path>
              <path d="M3 10h18"></path>
              <path d="M5 6l7-3 7 3"></path>
              <path d="M4 10v11"></path>
              <path d="M20 10v11"></path>
            </svg>

            <!-- 8. Accounting -->
            <svg v-else-if="item.icon === 'accounting'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
              <path d="M7 21h10"></path>
              <path d="M12 3v18"></path>
            </svg>

            <!-- 9. Reports -->
            <svg v-else-if="item.icon === 'reports'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>

            <!-- 10. Admin -->
            <svg v-else-if="item.icon === 'admin'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>

            <!-- 11. AI Assistant -->
            <svg v-else-if="item.icon === 'ai'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
          </div>

          <!-- macOS Running App Active Dot Indicator -->
          <span
            class="dock-active-dot"
            :class="{ 'is-running': isItemActive(item) }"
          ></span>
        </button>

        <!-- macOS Dock Section Divider Line -->
        <div v-if="item.isDividerAfter" class="dock-divider" aria-hidden="true"></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Floating Expand Tab at Bottom Center when Dock is Closed */
.dock-expand-tab {
  position: fixed;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 14px 5px 11px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  color: #f8fafc;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
  animation: popIn 220ms ease;
}

.dock-expand-tab:hover {
  background: #0f172a;
  transform: translateX(-50%) translateY(-2px);
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: #38bdf8;
}

.expand-tab-label {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* Collapse Arrow Tab on top of Dock Glass */
.dock-collapse-tab {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 16px;
  border-radius: 999px;
  background: rgba(14, 26, 46, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 180ms ease;
  z-index: 5;
}

.dock-collapse-tab:hover {
  background: #0f172a;
  color: #ffffff;
  width: 44px;
  transform: translateX(-50%) translateY(-2px);
  border-color: rgba(255, 255, 255, 0.3);
}

/* Dock Wrapper Transition */
.mac-dock-wrapper {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  z-index: 60;
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease;
}

.mac-dock-wrapper.is-closed {
  transform: translateX(-50%) translateY(calc(100% + 30px));
  opacity: 0;
  pointer-events: none;
}

.mac-dock-wrapper.is-open {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
  pointer-events: auto;
}

/* Glassmorphism macOS Dock Bar */
.mac-dock-glass {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 14px 6px;
  background: rgba(14, 26, 46, 0.75);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 20px;
  box-shadow:
    0 16px 40px -8px rgba(0, 0, 0, 0.45),
    0 2px 6px rgba(0, 0, 0, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.25);
  transition: all 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Close Squircle Styling */
.close-squircle {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #94a3b8;
  transition: all 180ms ease;
}

.close-toggle-item:hover .close-squircle {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* Hover over Dock container expands slightly */
.mac-dock-glass:hover {
  background: rgba(10, 20, 38, 0.82);
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow:
    0 20px 48px -6px rgba(0, 0, 0, 0.55),
    0 4px 10px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
}

/* Dock Item Button */
.dock-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  outline: none;
  background: none;
  border: none;
  padding: 0;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom center;
}

/* macOS Spring Magnification Animation */
.dock-item:hover {
  transform: translateY(-8px) scale(1.30);
  z-index: 10;
}

.dock-item:active {
  transform: translateY(-3px) scale(1.18);
}

/* Squircle Icon */
.dock-squircle {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
  transition: all 180ms ease;
  position: relative;
}

/* Unauthorized / Locked State on Dock Item */
.dock-item.is-locked {
  cursor: not-allowed !important;
}

.dock-item.is-locked .dock-squircle {
  filter: grayscale(0.85);
  opacity: 0.38;
  border: 1px dashed rgba(255, 255, 255, 0.28);
  box-shadow: none !important;
}

.dock-item.is-locked:hover {
  transform: translateY(-2px) scale(1.04) !important;
}

.dock-lock-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #dc2626;
  color: #ffffff;
  padding: 3px;
  border-radius: 9999px;
  border: 1.5px solid rgba(14, 26, 46, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  z-index: 5;
}

.mac-tooltip-lock {
  display: block;
  font-size: 0.68rem;
  color: #f87171;
  font-weight: 600;
  margin-top: 2px;
}

@keyframes lockShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

.dock-item.shake-locked {
  animation: lockShake 380ms ease !important;
}

.dock-item:hover .dock-squircle {
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.45),
    inset 0 1px 2px rgba(255, 255, 255, 0.4);
}

/* Counter Badge (Pending approval / AI tag) */
.dock-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  color: #ffffff;
  font-size: 0.62rem;
  font-weight: 750;
  padding: 1px 5px;
  border-radius: 9999px;
  border: 1.5px solid rgba(14, 26, 46, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  line-height: 1.2;
}

/* macOS Running Dot Indicator */
.dock-active-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
  margin-top: 4px;
  transition: all 160ms ease;
}

.dock-active-dot.is-running {
  background: #f59e0b; /* PMO Amber Glow */
  box-shadow: 0 0 6px #f59e0b, 0 0 12px rgba(245, 158, 11, 0.5);
}

/* macOS Native Dark Glass Popup Tooltip (Exact Match to Screenshot) */
.mac-tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #ffffff;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 550;
  letter-spacing: -0.01em;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all 160ms cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.mac-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: rgba(15, 23, 42, 0.94) transparent transparent transparent;
}

.dock-item:hover .mac-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* macOS Dock Divider */
.dock-divider {
  width: 1px;
  height: 36px;
  background: rgba(255, 255, 255, 0.16);
  margin: 0 4px 6px;
  border-radius: 9999px;
}

@media (max-width: 768px) {
  .mac-dock-glass {
    gap: 5px;
    padding: 6px 10px 4px;
    border-radius: 16px;
  }

  .dock-squircle {
    width: 36px;
    height: 36px;
    border-radius: 9px;
  }

  .dock-item:hover {
    transform: translateY(-4px) scale(1.15);
  }
}
</style>
