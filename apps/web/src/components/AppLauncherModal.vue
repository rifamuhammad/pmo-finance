<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-ai'): void;
}>();

const router = useRouter();
const auth = useAuthStore();
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

interface AppTile {
  id: string;
  title: string;
  route?: string;
  action?: 'ai';
  gradient: string;
  icon: string;
  permission?: string;
  badge?: string;
  badgeColor?: string;
}

const appTiles = computed<AppTile[]>(() => [
  {
    id: 'dashboard',
    title: 'Executive Dashboard',
    route: '/dashboard',
    gradient: 'linear-gradient(135deg, #034693, #022b5c)',
    icon: 'dashboard',
  },
  {
    id: 'approvals',
    title: 'Approval Inbox',
    route: '/approvals',
    permission: 'approval:view',
    gradient: 'linear-gradient(135deg, #d97706, #92400e)',
    icon: 'approvals',
    badge: auth.pendingApprovalsCount > 0 ? `${auth.pendingApprovalsCount} Menunggu` : undefined,
    badgeColor: '#ef4444',
  },
  {
    id: 'budgets',
    title: 'Perencanaan Anggaran',
    route: '/budgets',
    permission: 'budget:view',
    gradient: 'linear-gradient(135deg, #059669, #065f46)',
    icon: 'budgets',
  },
  {
    id: 'procurement',
    title: 'Pengadaan Lab & PO',
    route: '/procurement',
    permission: 'procurement:view',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    icon: 'procurement',
  },
  {
    id: 'expenses',
    title: 'Expenses & Klaim Biaya',
    route: '/procurement?tab=expenses',
    permission: 'expense:view',
    gradient: 'linear-gradient(135deg, #e11d48, #9f1239)',
    icon: 'expenses',
  },
  {
    id: 'revenue',
    title: 'Pendapatan & Kasir POS',
    route: '/revenue',
    permission: 'revenue:view',
    gradient: 'linear-gradient(135deg, #ea580c, #9a3412)',
    icon: 'revenue',
  },
  {
    id: 'reconciliation',
    title: 'Kas & Rekonsiliasi Bank',
    route: '/reconciliation',
    permission: 'reconciliation:view',
    gradient: 'linear-gradient(135deg, #0d9488, #115e59)',
    icon: 'reconciliation',
  },
  {
    id: 'accounting',
    title: 'Akuntansi & Buku Besar',
    route: '/accounting',
    permission: 'accounting:view',
    gradient: 'linear-gradient(135deg, #4f46e5, #3730a3)',
    icon: 'accounting',
  },
  {
    id: 'petty-cash',
    title: 'Uang Persediaan & SPJ',
    route: '/petty-cash',
    permission: 'procurement:view',
    gradient: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
    icon: 'petty-cash',
    badge: 'GUP / TUP',
    badgeColor: '#0ea5e9',
  },
  {
    id: 'assets',
    title: 'Inventaris & Aset PMO',
    route: '/assets',
    permission: 'accounting:view',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    icon: 'assets',
    badge: 'PBI UT',
    badgeColor: '#f59e0b',
  },
  {
    id: 'hris',
    title: 'SDM & Payroll PMO',
    route: '/hris',
    permission: 'admin:view',
    gradient: 'linear-gradient(135deg, #059669, #047857)',
    icon: 'hris',
    badge: 'HRIS',
    badgeColor: '#10b981',
  },
  {
    id: 'reports',
    title: 'Laporan Keuangan',
    route: '/reports',
    permission: 'report:view',
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    icon: 'reports',
  },
  {
    id: 'admin',
    title: 'Pengaturan & Audit',
    route: '/admin',
    permission: 'admin:view',
    gradient: 'linear-gradient(135deg, #475569, #1e293b)',
    icon: 'admin',
  },
  {
    id: 'ai-assistant',
    title: 'AI Financial Assistant',
    action: 'ai',
    gradient: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
    icon: 'ai',
    badge: 'Copilot',
    badgeColor: '#a855f7',
  },
]);

function isTileLocked(tile: AppTile): boolean {
  if (!tile.permission) return false;
  return !auth.hasPermission(tile.permission);
}

const filteredTiles = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return appTiles.value;
  return appTiles.value.filter((tile) => tile.title.toLowerCase().includes(query));
});

const lockedShakeId = ref<string | null>(null);

function handleTileClick(tile: AppTile) {
  if (isTileLocked(tile)) {
    lockedShakeId.value = tile.id;
    setTimeout(() => {
      lockedShakeId.value = null;
    }, 450);
    auth.triggerAccessDenied(tile.title);
    return;
  }
  emit('close');
  if (tile.action === 'ai') {
    emit('open-ai');
  } else if (tile.route) {
    router.push(tile.route);
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    e.preventDefault();
    e.stopPropagation();
    emit('close');
  }
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = '';
      window.addEventListener('keydown', onGlobalKeydown, true);
      nextTick(() => {
        searchInput.value?.focus();
      });
    } else {
      window.removeEventListener('keydown', onGlobalKeydown, true);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true);
});
</script>

<template>
  <Transition name="launchpad-fade">
    <div
      v-if="isOpen"
      class="launchpad-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="macOS Launchpad PMO Finance"
      @click="emit('close')"
    >
      <div class="launchpad-container" @click.stop>
        <!-- Launchpad Top Bar with Search -->
        <div class="launchpad-search-wrap">
          <div class="launchpad-search-bar">
            <svg
              width="18"
              height="18"
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
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="launchpad-search-input"
              placeholder="Cari modul atau fitur ERP..."
              autocomplete="off"
              spellcheck="false"
              @keydown.esc.stop="emit('close')"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="search-clear-btn"
              title="Bersihkan Pencarian"
              @click.stop="searchQuery = ''; searchInput?.focus()"
            >
              ✕
            </button>
            <kbd class="launchpad-esc-hint" role="button" title="Tutup (Esc)" @click.stop="emit('close')">Esc</kbd>
          </div>
        </div>

        <!-- Launchpad Apps Grid (macOS Squircle Design) -->
        <div class="launchpad-grid" role="list">
          <div
            v-for="tile in filteredTiles"
            :key="tile.id"
            class="launchpad-app-card"
            :class="{
              'is-locked': isTileLocked(tile),
              'shake-locked': lockedShakeId === tile.id
            }"
            role="listitem"
            tabindex="0"
            @click.stop="handleTileClick(tile)"
            @keydown.enter.stop="handleTileClick(tile)"
          >
            <!-- Squircle Icon Container with Apple Dynamic Depth -->
            <div class="app-icon-squircle" :style="{ background: tile.gradient }">
              <span v-if="tile.badge && !isTileLocked(tile)" class="app-badge" :style="{ background: tile.badgeColor || '#034693' }">
                {{ tile.badge }}
              </span>

              <!-- Lock Badge when Unauthorized -->
              <span v-if="isTileLocked(tile)" class="app-lock-badge" title="Akses Dibatasi">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2.5"></path>
                </svg>
              </span>

              <!-- Dashboard Icon -->
              <svg v-if="tile.icon === 'dashboard'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1.5"></rect>
                <rect x="14" y="3" width="7" height="5" rx="1.5"></rect>
                <rect x="14" y="12" width="7" height="9" rx="1.5"></rect>
                <rect x="3" y="16" width="7" height="5" rx="1.5"></rect>
              </svg>

              <!-- Approvals Icon -->
              <svg v-else-if="tile.icon === 'approvals'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>

              <!-- Budgets Icon -->
              <svg v-else-if="tile.icon === 'budgets'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>

              <!-- Procurement Icon -->
              <svg v-else-if="tile.icon === 'procurement'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-2z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>

              <!-- Expenses Icon -->
              <svg v-else-if="tile.icon === 'expenses'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
              </svg>

              <!-- Revenue Icon -->
              <svg v-else-if="tile.icon === 'revenue'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>

              <!-- Reconciliation Icon -->
              <svg v-else-if="tile.icon === 'reconciliation'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>

              <!-- Accounting Icon -->
              <svg v-else-if="tile.icon === 'accounting'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>

              <!-- Petty Cash Icon -->
              <svg v-else-if="tile.icon === 'petty-cash'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
                <line x1="12" y1="12" x2="12" y2="18"></line>
              </svg>

              <!-- Assets Icon -->
              <svg v-else-if="tile.icon === 'assets'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>

              <!-- HRIS Icon -->
              <svg v-else-if="tile.icon === 'hris'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>

              <!-- Reports Icon -->
              <svg v-else-if="tile.icon === 'reports'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>

              <!-- Admin Icon -->
              <svg v-else-if="tile.icon === 'admin'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>

              <!-- AI Icon -->
              <svg v-else-if="tile.icon === 'ai'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
              </svg>
            </div>

            <!-- App Title Only (Nama Fitur Aja - Bersih & Zero Text Slop) -->
            <div class="app-text-block">
              <span class="app-title">{{ tile.title }}</span>
              <span v-if="isTileLocked(tile)" class="app-lock-sub">🔒 Akses Dibatasi</span>
            </div>
          </div>
        </div>

        <div v-if="filteredTiles.length === 0" class="launchpad-empty">
          <p>Tidak ada modul atau fitur yang cocok dengan "{{ searchQuery }}"</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Fullscreen Frosted Blur Launchpad Backdrop */
.launchpad-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(6, 15, 30, 0.82);
  backdrop-filter: blur(36px) saturate(190%);
  -webkit-backdrop-filter: blur(36px) saturate(190%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 60px 32px 40px;
  overflow-y: auto;
  cursor: default;
}

.launchpad-container {
  width: 100%;
  max-width: 1050px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36px;
  margin: auto;
}

/* macOS Pill Search Bar */
.launchpad-search-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}

.launchpad-search-bar {
  position: relative;
  width: 100%;
  max-width: 380px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 9999px;
  padding: 8px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.launchpad-search-bar:focus-within {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(245, 158, 11, 0.65);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25), 0 12px 36px rgba(0, 0, 0, 0.45);
}

.launchpad-search-icon {
  color: rgba(255, 255, 255, 0.65);
  margin-right: 10px;
  flex-shrink: 0;
}

.launchpad-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  font-size: 0.92rem;
  color: #ffffff;
  padding: 0;
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
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-right: 8px;
  transition: background 0.15s ease;
}

.search-clear-btn:hover {
  background: rgba(255, 255, 255, 0.35);
}

.launchpad-esc-hint {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.launchpad-esc-hint:hover {
  background: rgba(255, 255, 255, 0.3);
  color: #ffffff;
}

/* macOS Launchpad Grid */
.launchpad-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 28px 16px;
  width: 100%;
  justify-items: center;
}

/* macOS App Card */
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
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
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

/* Squircle Icon */
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
  transition: box-shadow 0.2s ease;
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
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* Typography (Nama Fitur Aja) */
.app-text-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.app-title {
  color: #ffffff;
  font-size: 0.86rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  line-height: 1.25;
  text-align: center;
}

.app-lock-sub {
  font-size: 0.68rem;
  color: #f87171;
  font-weight: 600;
  margin-top: 3px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

/* Unauthorized / Locked Launchpad Tile */
.launchpad-app-card.is-locked {
  cursor: not-allowed !important;
}

.launchpad-app-card.is-locked .app-icon-squircle {
  filter: grayscale(0.85);
  opacity: 0.38;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  box-shadow: none !important;
}

.launchpad-app-card.is-locked:hover {
  transform: translateY(-2px) scale(1.02) !important;
  background: rgba(255, 255, 255, 0.03) !important;
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

.launchpad-app-card.shake-locked {
  animation: lockShake 380ms ease !important;
}

.launchpad-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.95rem;
  margin-top: 40px;
}

/* Animations */
.launchpad-fade-enter-active,
.launchpad-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.launchpad-fade-enter-from,
.launchpad-fade-leave-to {
  opacity: 0;
  transform: scale(1.04);
}
</style>
