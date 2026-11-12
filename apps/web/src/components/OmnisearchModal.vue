<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../services/api';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-ai'): void;
  (e: 'open-launcher'): void;
}>();

const router = useRouter();

const searchQuery = ref('');
const activeScope = ref<'ALL' | 'ASSET' | 'FINANCE' | 'COA' | 'HRIS' | 'MODULE'>('ALL');
const activeIndex = ref(0);
const isSearching = ref(false);
const liveResults = ref<any[]>([]);
const scopeCounts = ref<{ ALL: number; ASSET: number; FINANCE: number; COA: number; HRIS: number }>({
  ALL: 0,
  ASSET: 0,
  FINANCE: 0,
  COA: 0,
  HRIS: 0,
});
const searchInputRef = ref<HTMLInputElement | null>(null);

// Static Master ERP Navigation Items (Zero Duplication - Deduped)
interface NavShortcut {
  id: string;
  category: string;
  type: 'MODULE';
  icon: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  route?: string;
  action?: 'ai' | 'apps';
}

const staticShortcuts: NavShortcut[] = [
  {
    id: 'm-launchpad',
    category: 'Navigasi',
    type: 'MODULE',
    icon: 'pi pi-th-large',
    title: 'Menu Aplikasi ERP (Home Launchpad)',
    subtitle: 'Tampilan utama grid modul bisnis PMO UTama',
    badge: 'Home',
    badgeColor: 'blue',
    route: '/',
  },
  {
    id: 'm-dashboard',
    category: 'Navigasi',
    type: 'MODULE',
    icon: 'pi pi-chart-bar',
    title: 'Executive Dashboard',
    subtitle: 'Ringkasan KPI keuangan, pendapatan, beban, dan kas',
    badge: 'Ikhtisar',
    badgeColor: 'blue',
    route: '/dashboard',
  },
  {
    id: 'm-approvals',
    category: 'Otorisasi',
    type: 'MODULE',
    icon: 'pi pi-inbox',
    title: 'Approval Inbox',
    subtitle: 'Kotak masuk persetujuan SPJ, PO, dan klaim biaya',
    badge: 'Otorisasi',
    badgeColor: 'amber',
    route: '/approvals',
  },
  {
    id: 'm-budgets',
    category: 'Anggaran',
    type: 'MODULE',
    icon: 'pi pi-chart-line',
    title: 'Perencanaan Plafon Anggaran',
    subtitle: 'Alokasi plafon belanja tahun anggaran 2026',
    badge: 'Budget',
    badgeColor: 'emerald',
    route: '/budgets',
  },
  {
    id: 'm-procurement',
    category: 'Pengadaan',
    type: 'MODULE',
    icon: 'pi pi-box',
    title: 'Pengadaan Lab, Barang & PO',
    subtitle: 'Quotation 3 vendor, purchase order rekanan resmi',
    badge: 'Vendor',
    badgeColor: 'blue',
    route: '/procurement',
  },
  {
    id: 'm-expenses',
    category: 'Beban',
    type: 'MODULE',
    icon: 'pi pi-credit-card',
    title: 'Expenses & Klaim Reimbursement',
    subtitle: 'Pengajuan reimbursement biaya operasional staf',
    badge: 'Klaim',
    badgeColor: 'purple',
    route: '/procurement?tab=expenses',
  },
  {
    id: 'm-revenue',
    category: 'Pendapatan',
    type: 'MODULE',
    icon: 'pi pi-receipt',
    title: 'Kasir POS & Order Bisnis MICE',
    subtitle: 'Faktur sewa UTCC, service charge MICE & tiket',
    badge: 'Sales',
    badgeColor: 'emerald',
    route: '/revenue',
  },
  {
    id: 'm-reconciliation',
    category: 'Perbankan',
    type: 'MODULE',
    icon: 'pi pi-wallet',
    title: 'Kas & Rekonsiliasi Bank',
    subtitle: 'Pencocokan mutasi rekening koran dan saldo kas',
    badge: 'Bank',
    badgeColor: 'cyan',
    route: '/reconciliation',
  },
  {
    id: 'm-accounting',
    category: 'Akuntansi',
    type: 'MODULE',
    icon: 'pi pi-book',
    title: 'Akuntansi & Buku Besar (GL)',
    subtitle: 'Bagan akun COA standar, jurnal umum double-entry',
    badge: 'Jurnal',
    badgeColor: 'amber',
    route: '/accounting',
  },
  {
    id: 'm-petty-cash',
    category: 'Perbendaharaan',
    type: 'MODULE',
    icon: 'pi pi-bolt',
    title: 'Uang Persediaan & SPJ (GUP/TUP)',
    subtitle: 'Pencairan kas kecil dan pertanggungjawaban nihil',
    badge: 'Kas Kecil',
    badgeColor: 'purple',
    route: '/petty-cash',
  },
  {
    id: 'm-assets',
    category: 'Logistik',
    type: 'MODULE',
    icon: 'pi pi-building',
    title: 'Inventaris & Aset PMO (4.282 Item PBI UT)',
    subtitle: 'Pendataan kepemilikan aset, pinjam pakai, & depresiasi',
    badge: 'Aset',
    badgeColor: 'amber',
    route: '/assets',
  },
  {
    id: 'm-hris',
    category: 'Kepegawaian',
    type: 'MODULE',
    icon: 'pi pi-users',
    title: 'Database SDM, Presensi & Payroll',
    subtitle: 'Data pegawai PMO, slip gaji, dan presensi kerja',
    badge: 'HRIS',
    badgeColor: 'cyan',
    route: '/hris',
  },
  {
    id: 'm-reports',
    category: 'Laporan',
    type: 'MODULE',
    icon: 'pi pi-chart-pie',
    title: 'Laporan Keuangan & Evaluasi Portofolio',
    subtitle: 'Neraca, laba rugi USALI, dan evaluasi unit bisnis',
    badge: 'Laporan',
    badgeColor: 'blue',
    route: '/reports',
  },
  {
    id: 'm-ai',
    category: 'Asisten',
    type: 'MODULE',
    icon: 'pi pi-sparkles',
    title: 'AI Financial Assistant Copilot',
    subtitle: 'Tanya jawab analitik fiskal dengan Qwen ERP Copilot',
    badge: 'Qwen AI',
    badgeColor: 'purple',
    action: 'ai',
  },
  {
    id: 'm-admin',
    category: 'Sistem',
    type: 'MODULE',
    icon: 'pi pi-cog',
    title: 'Administrasi Role RBAC & Audit Trail',
    subtitle: 'Manajemen hak akses, kebijakan otorisasi, dan log audit',
    badge: 'Audit',
    badgeColor: 'neutral',
    route: '/admin',
  },
];

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Real-time API Omnisearch query
async function performOmnisearch(query: string) {
  if (!query || query.trim().length < 2) {
    liveResults.value = [];
    scopeCounts.value = { ALL: 0, ASSET: 0, FINANCE: 0, COA: 0, HRIS: 0 };
    isSearching.value = false;
    return;
  }

  isSearching.value = true;
  try {
    const res = await apiFetch<any>(`/master/omnisearch?q=${encodeURIComponent(query.trim())}`);
    if (res?.data && Array.isArray(res.data)) {
      liveResults.value = res.data;
      if (res.meta?.countsByScope) {
        scopeCounts.value = {
          ALL: res.meta.countsByScope.ALL || res.data.length,
          ASSET: res.meta.countsByScope.ASSET || 0,
          FINANCE: res.meta.countsByScope.FINANCE || 0,
          COA: res.meta.countsByScope.COA || 0,
          HRIS: res.meta.countsByScope.HRIS || 0,
        };
      }
    } else {
      liveResults.value = [];
      scopeCounts.value = { ALL: 0, ASSET: 0, FINANCE: 0, COA: 0, HRIS: 0 };
    }
  } catch {
    liveResults.value = [];
    scopeCounts.value = { ALL: 0, ASSET: 0, FINANCE: 0, COA: 0, HRIS: 0 };
  } finally {
    isSearching.value = false;
  }
}

watch(searchQuery, (newVal) => {
  activeIndex.value = 0;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performOmnisearch(newVal);
  }, 160);
});

// Filter items based on activeScope & searchQuery
const displayedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();

  // If live results exist from API, display live results first followed by matched static modules
  if (q.length >= 2) {
    let combined = [...liveResults.value];

    // Also match static shortcuts
    const matchedShortcuts = staticShortcuts.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.subtitle.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );

    combined = [...combined, ...matchedShortcuts];

    if (activeScope.value === 'ASSET') {
      return combined.filter((i) => i.scopeGroup === 'ASSET' || i.category === 'Aset & Inventaris' || i.id === 'm-assets');
    }
    if (activeScope.value === 'FINANCE') {
      return combined.filter(
        (i) =>
          i.scopeGroup === 'FINANCE' ||
          i.scopeGroup === 'COA' ||
          i.category?.includes('SPJ') ||
          i.category?.includes('Pengadaan') ||
          i.category?.includes('Anggaran') ||
          i.category?.includes('Jurnal') ||
          i.category?.includes('Bagan Akun') ||
          i.category?.includes('Akuntansi')
      );
    }
    if (activeScope.value === 'COA') {
      return combined.filter(
        (i) => i.scopeGroup === 'COA' || i.category?.includes('Bagan Akun') || i.id === 'm-accounting'
      );
    }
    if (activeScope.value === 'HRIS') {
      return combined.filter((i) => i.scopeGroup === 'HRIS' || i.category?.includes('SDM') || i.id === 'm-hris');
    }
    if (activeScope.value === 'MODULE') {
      return combined.filter((i) => i.type === 'MODULE');
    }

    return combined;
  }

  // When empty query: show categorized quick shortcuts
  if (activeScope.value === 'ASSET') {
    return staticShortcuts.filter((s) => s.id === 'm-assets');
  }
  if (activeScope.value === 'FINANCE') {
    return staticShortcuts.filter((s) =>
      ['m-petty-cash', 'm-procurement', 'm-expenses', 'm-revenue', 'm-reconciliation', 'm-accounting', 'm-budgets'].includes(s.id)
    );
  }
  if (activeScope.value === 'COA') {
    return staticShortcuts.filter((s) => ['m-accounting', 'm-budgets'].includes(s.id));
  }
  if (activeScope.value === 'HRIS') {
    return staticShortcuts.filter((s) => s.id === 'm-hris');
  }
  if (activeScope.value === 'MODULE') {
    return staticShortcuts;
  }

  return staticShortcuts;
});

function handleSelect(item: any) {
  emit('close');
  searchQuery.value = '';
  if (item.action === 'ai') {
    emit('open-ai');
  } else if (item.action === 'apps') {
    emit('open-launcher');
  } else if (item.route) {
    router.push(item.route);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.isOpen) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (displayedItems.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % displayedItems.value.length;
      scrollToActive();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (displayedItems.value.length > 0) {
      activeIndex.value =
        (activeIndex.value - 1 + displayedItems.value.length) % displayedItems.value.length;
      scrollToActive();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = displayedItems.value[activeIndex.value];
    if (target) {
      handleSelect(target);
    }
  } else if (e.key === 'Escape') {
    emit('close');
  }
}

function scrollToActive() {
  nextTick(() => {
    const el = document.querySelector('.omni-item.is-selected');
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = '';
      activeScope.value = 'ALL';
      activeIndex.value = 0;
      liveResults.value = [];
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
});
</script>

<template>
  <div v-if="isOpen" class="omni-backdrop" @click.self="emit('close')">
    <div class="omni-dialog" role="dialog" aria-modal="true" aria-label="Omnisearch PMO Finance">
      <!-- Search Input Header -->
      <div class="omni-input-header">
        <div class="omni-search-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="omni-input-field"
          placeholder="Cari anggaran RKAP, 70 akun COA Pertor 310, jurnal GL, PR/PO, SPJ, aset, atau pegawai..."
        />
        <div v-if="isSearching" class="omni-spinner"></div>
        <button type="button" class="omni-esc-badge" title="Tutup (Esc)" @click="emit('close')">
          ESC
        </button>
      </div>

      <!-- Scope Filter Tabs (Vector Icons - Zero Emojis) -->
      <div class="omni-scope-bar">
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'ALL' }"
          @click="activeScope = 'ALL'"
        >
          <i class="pi pi-search"></i>
          <span>Semua{{ searchQuery.trim().length >= 2 && scopeCounts.ALL > 0 ? ` (${scopeCounts.ALL})` : '' }}</span>
        </button>
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'FINANCE' }"
          @click="activeScope = 'FINANCE'"
        >
          <i class="pi pi-receipt"></i>
          <span>Keuangan &amp; PO{{ searchQuery.trim().length >= 2 && scopeCounts.FINANCE > 0 ? ` (${scopeCounts.FINANCE})` : '' }}</span>
        </button>
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'COA' }"
          @click="activeScope = 'COA'"
        >
          <i class="pi pi-book"></i>
          <span>COA Pertor 310{{ searchQuery.trim().length >= 2 && scopeCounts.COA > 0 ? ` (${scopeCounts.COA})` : '' }}</span>
        </button>
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'ASSET' }"
          @click="activeScope = 'ASSET'"
        >
          <i class="pi pi-building"></i>
          <span>Aset &amp; Inventaris{{ searchQuery.trim().length >= 2 && scopeCounts.ASSET > 0 ? ` (${scopeCounts.ASSET})` : '' }}</span>
        </button>
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'HRIS' }"
          @click="activeScope = 'HRIS'"
        >
          <i class="pi pi-users"></i>
          <span>SDM Pegawai{{ searchQuery.trim().length >= 2 && scopeCounts.HRIS > 0 ? ` (${scopeCounts.HRIS})` : '' }}</span>
        </button>
        <button
          type="button"
          class="omni-scope-btn"
          :class="{ active: activeScope === 'MODULE' }"
          @click="activeScope = 'MODULE'"
        >
          <i class="pi pi-compass"></i>
          <span>Modul ERP</span>
        </button>
      </div>

      <!-- Results Body -->
      <div class="omni-results-scroll">
        <div v-if="displayedItems.length === 0" class="omni-empty-state">
          <i class="pi pi-search-plus empty-vector-icon"></i>
          <p class="empty-text">Tidak ada data yang cocok dengan <b>"{{ searchQuery }}"</b>.</p>
          <span class="empty-hint">Coba cari nama aset (contoh: "Freezer", "Meja", "UTCC"), nomor SPJ/PO, atau nama staf.</span>
        </div>

        <div v-else class="omni-list">
          <div
            v-for="(item, idx) in displayedItems"
            :key="item.id || idx"
            class="omni-item"
            :class="{ 'is-selected': idx === activeIndex }"
            role="button"
            tabindex="0"
            @mouseenter="activeIndex = idx"
            @click="handleSelect(item)"
          >
            <!-- Category Squircle Icon -->
            <div class="omni-icon-squircle" :class="`icon-${item.badgeColor || 'blue'}`">
              <i :class="item.icon || 'pi pi-compass'" class="omni-vector-icon"></i>
            </div>

            <!-- Content Meta -->
            <div class="omni-item-content">
              <div class="omni-item-header">
                <span class="omni-item-title">{{ item.title }}</span>
                <span v-if="item.badge" class="omni-badge" :class="`badge-${item.badgeColor || 'blue'}`">
                  {{ item.badge }}
                </span>
              </div>
              <p class="omni-item-sub">{{ item.subtitle }}</p>
            </div>

            <!-- Jump Action Hint -->
            <div class="omni-enter-hint">
              <span>↵</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Help Toolbar -->
      <div class="omni-footer">
        <div class="omni-footer-hints">
          <span class="omni-key">↑↓</span> Navigasi
          <span class="omni-sep">•</span>
          <span class="omni-key">↵</span> Buka
          <span class="omni-sep">•</span>
          <span class="omni-key">Esc</span> Tutup
        </div>
        <div class="omni-footer-brand">
          <span class="footer-dot"></span>
          <span>PMO Finance Omnisearch</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.omni-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 15, 29, 0.65);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(16px, 8vh, 64px) 16px 24px;
  animation: omniFade 140ms ease-out;
}

@keyframes omniFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.omni-dialog {
  width: 100%;
  max-width: 660px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  box-shadow: 
    0 24px 60px -12px rgba(15, 23, 42, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: min(540px, 82vh);
  animation: omniSlide 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes omniSlide {
  from { transform: translateY(-10px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

/* Header */
.omni-input-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.omni-search-icon {
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.omni-input-field {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  font-family: inherit;
  padding: 0;
}

.omni-input-field::placeholder {
  color: var(--text-secondary);
  font-size: 0.92rem;
  font-weight: 450;
}

.omni-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: omniSpin 0.6s linear infinite;
}

@keyframes omniSpin {
  to { transform: rotate(360deg); }
}

.omni-esc-badge {
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 120ms ease;
}

.omni-esc-badge:hover {
  background: var(--border-subtle);
  color: var(--text-primary);
}

/* Scope Pills */
.omni-scope-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.omni-scope-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 120ms ease;
}

.omni-scope-btn i {
  font-size: 0.78rem;
}

.omni-scope-btn:hover {
  background: rgba(15, 23, 42, 0.04);
  color: var(--text-primary);
}

.omni-scope-btn.active {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
  box-shadow: 0 1px 4px rgba(3, 70, 147, 0.25);
}

.omni-scope-btn.active i {
  color: #ffffff;
}

/* Results List */
.omni-results-scroll {
  flex: 1;
  max-height: min(340px, 48vh);
  overflow-y: auto;
  padding: 8px 12px;
}

.omni-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-vector-icon {
  font-size: 2.2rem;
  color: var(--text-secondary);
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 0.88rem;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  max-width: 360px;
  line-height: 1.4;
}

.omni-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.omni-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 100ms ease, transform 100ms ease;
}

.omni-item:hover,
.omni-item.is-selected {
  background: var(--bg-subtle);
}

.omni-icon-squircle {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.omni-vector-icon {
  font-size: 1.05rem;
}

.icon-blue { background: rgba(3, 70, 147, 0.12); color: #034693; }
.icon-amber { background: rgba(245, 158, 11, 0.14); color: #d97706; }
.icon-purple { background: rgba(147, 51, 234, 0.14); color: #9333ea; }
.icon-emerald { background: rgba(16, 185, 129, 0.14); color: #059669; }
.icon-cyan { background: rgba(6, 182, 212, 0.14); color: #0891b2; }
.icon-neutral { background: rgba(100, 116, 139, 0.14); color: #475569; }

.omni-item-content {
  flex: 1;
  min-width: 0;
}

.omni-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.omni-item-title {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omni-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-blue { background: rgba(3, 70, 147, 0.1); color: #034693; border: 1px solid rgba(3, 70, 147, 0.2); }
.badge-amber { background: rgba(245, 158, 11, 0.12); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.25); }
.badge-purple { background: rgba(147, 51, 234, 0.12); color: #7e22ce; border: 1px solid rgba(147, 51, 234, 0.25); }
.badge-emerald { background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.25); }
.badge-cyan { background: rgba(6, 182, 212, 0.12); color: #0e7490; border: 1px solid rgba(6, 182, 212, 0.25); }
.badge-neutral { background: rgba(100, 116, 139, 0.1); color: #475569; border: 1px solid rgba(100, 116, 139, 0.2); }

.omni-item-sub {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omni-enter-hint {
  opacity: 0;
  transform: translateX(-4px);
  transition: all 120ms ease;
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.omni-item:hover .omni-enter-hint,
.omni-item.is-selected .omni-enter-hint {
  opacity: 1;
  transform: translateX(0);
}

/* Footer */
.omni-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: var(--bg-subtle);
  border-top: 1px solid var(--border-subtle);
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.omni-footer-hints {
  display: flex;
  align-items: center;
  gap: 6px;
}

.omni-key {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
  color: var(--text-primary);
}

.omni-sep {
  opacity: 0.4;
}

.omni-footer-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
}
</style>
