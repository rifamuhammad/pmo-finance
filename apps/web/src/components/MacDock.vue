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

// Auto-Hide Dock State (Strategi 1)
// Default is unpinned (false) for maximum workspace productivity, remembers user setting
const isPinned = ref<boolean>(localStorage.getItem('pmo_dock_pinned') === 'true');
const isHovered = ref<boolean>(false);

function togglePin() {
  isPinned.value = !isPinned.value;
  localStorage.setItem('pmo_dock_pinned', String(isPinned.value));
}

function handleGlobalKeydown(e: KeyboardEvent) {
  // Option+D / Alt+D or Cmd+Option+D toggles dock pin state (matches native macOS)
  if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    togglePin();
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
    permission: 'procurement:view',
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
    permission: 'audit:view',
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

const visibleItems = computed(() => {
  return dockItems.filter((item) => {
    if (!item.permission) return true;
    return auth.hasPermission(item.permission);
  });
});

function isItemActive(item: DockItem): boolean {
  if (item.action === 'home') return false;
  if (!item.route) return false;
  if (item.id === 'expenses') return route.path === '/procurement' && route.query.tab === 'expenses';
  if (item.id === 'procurement') return route.path === '/procurement' && route.query.tab !== 'expenses';
  return route.path.startsWith(item.route);
}

function handleItemClick(item: DockItem) {
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
  <!-- Invisible bottom trigger zone (auto-reveal dock on hover) -->
  <div
    v-if="!isPinned"
    class="dock-bottom-trigger"
    aria-hidden="true"
    @mouseenter="isHovered = true"
  ></div>

  <!-- Dock Wrapper with Auto-Hide Translation -->
  <div
    class="mac-dock-wrapper"
    :class="{
      'is-hidden': !isPinned && !isHovered,
      'is-pinned': isPinned,
      'is-revealed': isPinned || isHovered
    }"
    role="navigation"
    aria-label="macOS Floating Dock ERP"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Subtle Peek Indicator when Dock is hidden -->
    <div
      v-if="!isPinned"
      class="dock-peek-handle"
      :class="{ 'is-peek-active': !isHovered }"
      title="Arahkan kursor ke bawah untuk memunculkan Dock (Alt+D untuk Pin)"
      @click="isHovered = true"
    >
      <span class="peek-pill"></span>
    </div>

    <div class="mac-dock-glass">
      <template v-for="item in visibleItems" :key="item.id">
        <!-- Dock Icon Item with Spring Magnification -->
        <button
          type="button"
          class="dock-item"
          :class="{ 'is-active': isItemActive(item) }"
          :aria-label="item.name"
          @click="handleItemClick(item)"
        >
          <!-- macOS Native Dark Glass Popup Tooltip -->
          <div class="mac-tooltip">
            <span>{{ item.name }}</span>
          </div>

          <!-- Squircle App Icon with Subtle Bevel & Shadow -->
          <div class="dock-squircle" :style="{ background: item.gradient }">
            <!-- Counter Badge -->
            <span
              v-if="item.badge"
              class="dock-badge"
              :style="{ backgroundColor: item.badgeColor || '#ef4444' }"
            >
              {{ item.badge }}
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

      <!-- Pin / Auto-Hide Mode Toggle Item -->
      <button
        type="button"
        class="dock-item pin-toggle-item"
        :class="{ 'is-pinned-active': isPinned }"
        @click="togglePin"
        aria-label="Toggle Pin / Auto-Hide Dock"
      >
        <div class="mac-tooltip">
          <span>{{ isPinned ? '📌 Dock Terkunci (Klik / Alt+D untuk Auto-Hide)' : '👁️ Auto-Hide Aktif (Klik / Alt+D untuk Kunci)' }}</span>
        </div>

        <div class="dock-squircle pin-squircle">
          <!-- Pin Icon (Angled when unpinned, vertical when pinned) -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"></line>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"></path>
          </svg>
        </div>

        <!-- Dot glows amber when pinned, transparent when auto-hide -->
        <span
          class="dock-active-dot"
          :class="{ 'is-running': isPinned }"
        ></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Invisible trigger hitbox spanning full width at bottom of screen */
.dock-bottom-trigger {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 22px;
  z-index: 59;
  pointer-events: auto;
}

.mac-dock-wrapper {
  position: fixed;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  z-index: 60;
  pointer-events: none;
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms ease;
}

/* When Auto-Hide is active and user is not hovering: slide down out of way */
.mac-dock-wrapper.is-hidden {
  transform: translateX(-50%) translateY(calc(100% + 24px));
  opacity: 0;
  pointer-events: none;
}

.mac-dock-wrapper.is-revealed,
.mac-dock-wrapper.is-pinned {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
  pointer-events: auto;
}

/* Subtle Peek Handle bar at the very bottom center when dock is hidden */
.dock-peek-handle {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 18px 2px;
  cursor: pointer;
  pointer-events: auto;
  z-index: 61;
  display: flex;
  justify-content: center;
  transition: all 200ms ease;
}

.peek-pill {
  width: 44px;
  height: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.5);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.dock-peek-handle:hover .peek-pill {
  width: 64px;
  height: 5px;
  background: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
}

/* Glassmorphism macOS Dock Bar */
.mac-dock-glass {
  pointer-events: auto;
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

/* Pin Toggle Squircle Styling */
.pin-squircle {
  background: linear-gradient(135deg, #334155, #1e293b);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  transition: all 200ms ease;
}

.pin-toggle-item:hover .pin-squircle {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.3);
}

.pin-toggle-item.is-pinned-active .pin-squircle {
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow:
    0 4px 14px rgba(2, 132, 199, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
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
  transition: box-shadow 180ms ease;
  position: relative;
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
