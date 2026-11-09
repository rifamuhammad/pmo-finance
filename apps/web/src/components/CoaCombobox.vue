<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

export interface CoaAccountItem {
  id?: string;
  code: string;
  name: string;
  type?: string; // 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  normalBalance?: 'DEBIT' | 'CREDIT' | string;
  category?: string;
  businessUnit?: string;
  isControlAccount?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    accounts?: CoaAccountItem[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    allowClear?: boolean;
    restrictType?: string; // Optional: filter only specific type like 'EXPENSE' or 'REVENUE'
    id?: string;
  }>(),
  {
    modelValue: '',
    accounts: () => [],
    placeholder: 'Pilih atau cari kode akun COA...',
    disabled: false,
    required: false,
    allowClear: true,
    restrictType: undefined,
    id: undefined,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', account: CoaAccountItem | null): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const highlightedIndex = ref(0);
const containerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

interface FilterCategory {
  id: string; // 'ALL' | '1' | '2' | '3' | '4' | '5'
  label: string;
  type?: string;
}

const CATEGORIES: FilterCategory[] = [
  { id: 'ALL', label: 'Semua' },
  { id: '1', label: 'Aset', type: 'ASSET' },
  { id: '2', label: 'Liabilitas', type: 'LIABILITY' },
  { id: '3', label: 'Ekuitas', type: 'EQUITY' },
  { id: '4', label: 'Pendapatan', type: 'REVENUE' },
  { id: '5', label: 'Beban', type: 'EXPENSE' },
];

const selectedCategory = ref<string>('ALL');

const selectedAccount = computed<CoaAccountItem | null>(() => {
  if (!props.modelValue) return null;
  return props.accounts.find((a) => a.code === props.modelValue) || null;
});

const filteredAccounts = computed<CoaAccountItem[]>(() => {
  let list = props.accounts || [];

  if (props.restrictType) {
    const target = props.restrictType.toUpperCase();
    list = list.filter((a) => {
      const t = (a.type || '').toUpperCase();
      if (target === 'EXPENSE') return t === 'EXPENSE' || t === 'BEBAN' || a.code.startsWith('5');
      if (target === 'REVENUE') return t === 'REVENUE' || t === 'PENDAPATAN' || a.code.startsWith('4');
      return t === target;
    });
  }

  // Filter by category pill if not 'ALL'
  if (selectedCategory.value !== 'ALL') {
    list = list.filter((a) => {
      const codeMatches = (a.code || '').startsWith(selectedCategory.value);
      const cat = CATEGORIES.find((c) => c.id === selectedCategory.value);
      const typeMatches = cat?.type && (a.type || '').toUpperCase() === cat.type;
      return codeMatches || typeMatches;
    });
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    const cleanQuery = query.replace(/[.\s-]/g, '');
    list = list.filter((a) => {
      const cleanCode = (a.code || '').replace(/[.\s-]/g, '').toLowerCase();
      const nameMatch = (a.name || '').toLowerCase().includes(query);
      const codeMatch = cleanCode.includes(cleanQuery) || (a.code || '').toLowerCase().includes(query);
      const catMatch = (a.category || '').toLowerCase().includes(query);
      return nameMatch || codeMatch || catMatch;
    });
  }

  return list;
});

interface AccountGroup {
  id: string;
  header: string;
  accounts: { account: CoaAccountItem; flatIndex: number }[];
}

const groupedAccounts = computed<AccountGroup[]>(() => {
  const groups: AccountGroup[] = [];
  const groupDefs = [
    { id: '1', header: 'ASET', type: 'ASSET' },
    { id: '2', header: 'LIABILITAS', type: 'LIABILITY' },
    { id: '3', header: 'EKUITAS', type: 'EQUITY' },
    { id: '4', header: 'PENDAPATAN', type: 'REVENUE' },
    { id: '5', header: 'BEBAN', type: 'EXPENSE' },
  ];

  const itemsWithIndex = filteredAccounts.value.map((acc, idx) => ({
    account: acc,
    flatIndex: idx,
  }));

  for (const def of groupDefs) {
    const matching = itemsWithIndex.filter((item) => {
      const code = item.account.code || '';
      const type = (item.account.type || '').toUpperCase();
      return code.startsWith(def.id) || type === def.type;
    });

    if (matching.length > 0) {
      groups.push({
        id: def.id,
        header: def.header,
        accounts: matching,
      });
    }
  }

  const knownCodes = new Set(['1', '2', '3', '4', '5']);
  const others = itemsWithIndex.filter(
    (item) => !knownCodes.has((item.account.code || '')[0])
  );
  if (others.length > 0) {
    groups.push({
      id: 'OTHER',
      header: 'LAIN-LAIN',
      accounts: others,
    });
  }

  return groups;
});

const openDropdown = () => {
  if (props.disabled) return;
  isOpen.value = true;
  searchQuery.value = '';
  highlightedIndex.value = 0;
  nextTick(() => {
    searchInputRef.value?.focus();
  });
};

const closeDropdown = () => {
  isOpen.value = false;
  searchQuery.value = '';
};

const selectAccount = (account: CoaAccountItem) => {
  emit('update:modelValue', account.code);
  emit('select', account);
  closeDropdown();
};

const clearSelection = (e?: Event) => {
  if (e) e.stopPropagation();
  emit('update:modelValue', '');
  emit('select', null);
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!isOpen.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openDropdown();
    }
    return;
  }

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeDropdown();
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (filteredAccounts.value.length > 0) {
        highlightedIndex.value = (highlightedIndex.value + 1) % filteredAccounts.value.length;
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (filteredAccounts.value.length > 0) {
        highlightedIndex.value =
          (highlightedIndex.value - 1 + filteredAccounts.value.length) % filteredAccounts.value.length;
      }
      break;
    case 'Enter':
      e.preventDefault();
      if (filteredAccounts.value[highlightedIndex.value]) {
        selectAccount(filteredAccounts.value[highlightedIndex.value]);
      }
      break;
    case 'Tab':
      closeDropdown();
      break;
  }
};

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    closeDropdown();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

const getTypeBadgeClass = (type?: string) => {
  if (!type) return 'badge-neutral';
  switch (type.toUpperCase()) {
    case 'ASSET':
      return 'badge-asset';
    case 'LIABILITY':
      return 'badge-liability';
    case 'EQUITY':
      return 'badge-equity';
    case 'REVENUE':
      return 'badge-revenue';
    case 'EXPENSE':
      return 'badge-expense';
    default:
      return 'badge-neutral';
  }
};

const getTypeRowClass = (type?: string) => {
  if (!type) return '';
  switch (type.toUpperCase()) {
    case 'ASSET':
      return 'type-asset';
    case 'LIABILITY':
      return 'type-liability';
    case 'EQUITY':
      return 'type-equity';
    case 'REVENUE':
      return 'type-revenue';
    case 'EXPENSE':
      return 'type-expense';
    default:
      return '';
  }
};

const getTypeLabel = (type?: string) => {
  if (!type) return 'Akun';
  switch (type.toUpperCase()) {
    case 'ASSET':
      return 'Aset';
    case 'LIABILITY':
      return 'Liabilitas';
    case 'EQUITY':
      return 'Ekuitas';
    case 'REVENUE':
      return 'Pendapatan';
    case 'EXPENSE':
      return 'Beban';
    default:
      return type;
  }
};
</script>

<template>
  <div ref="containerRef" class="coa-combobox-wrap" :class="{ 'is-disabled': disabled, 'is-open': isOpen }">
    <!-- Trigger Button / Display Box -->
    <div
      :id="id"
      class="coa-combobox-trigger"
      role="combobox"
      :aria-expanded="isOpen"
      :aria-required="required"
      tabindex="0"
      @click="isOpen ? closeDropdown() : openDropdown()"
      @keydown="onKeyDown"
    >
      <div v-if="selectedAccount" class="coa-selected-value">
        <span class="coa-badge-code">{{ selectedAccount.code }}</span>
        <span class="coa-name-text">{{ selectedAccount.name }}</span>
        <span class="coa-type-pill" :class="getTypeBadgeClass(selectedAccount.type)">
          {{ getTypeLabel(selectedAccount.type) }}
        </span>
      </div>
      <div v-else class="coa-placeholder">
        {{ placeholder }}
      </div>

      <div class="coa-trigger-actions">
        <button
          v-if="allowClear && selectedAccount && !disabled"
          type="button"
          class="coa-clear-btn"
          title="Hapus pilihan"
          @click="clearSelection"
        >
          ✕
        </button>
        <span class="coa-chevron" :class="{ 'is-flipped': isOpen }">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
    </div>

    <!-- Dropdown Popover (Exact Match to Design Mockup) -->
    <div v-if="isOpen" class="coa-popover" @click.stop>
      <!-- Search Bar -->
      <div class="coa-search-wrap">
        <div class="coa-search-box">
          <svg class="coa-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="coa-search-input"
            placeholder="Cari kode atau nama akun, misalnya 5201 atau gaji..."
            @keydown="onKeyDown"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="coa-search-clear"
            title="Hapus kata kunci"
            @click="searchQuery = ''"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- FILTER KATEGORI (Clean Pills) -->
      <div class="coa-filter-section">
        <div class="coa-filter-heading">FILTER KATEGORI</div>
        <div class="coa-filter-pills">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            type="button"
            class="coa-pill-btn"
            :class="{ 'is-active': selectedCategory === cat.id }"
            @click="selectedCategory = cat.id; highlightedIndex = 0"
          >
            {{ cat.label }}
          </button>
        </div>
      </div>

      <!-- Subheader Counter -->
      <div class="coa-count-bar">
        <span>{{ filteredAccounts.length }} akun tersedia</span>
      </div>

      <!-- Grouped Result List -->
      <div class="coa-list-viewport">
        <div v-if="filteredAccounts.length === 0" class="coa-empty-state">
          <span>Tidak ada akun COA yang cocok dengan "<strong>{{ searchQuery }}</strong>"</span>
          <p class="coa-empty-hint">Pastikan mencari dalam 70 Akun Operasional Spesifik PMO</p>
        </div>

        <div v-for="group in groupedAccounts" :key="group.id" class="coa-group-block">
          <div class="coa-group-header">{{ group.header }}</div>
          <button
            v-for="item in group.accounts"
            :key="item.account.code"
            type="button"
            class="coa-item-row"
            :class="[
              getTypeRowClass(item.account.type),
              {
                'is-selected': selectedAccount?.code === item.account.code,
                'is-highlighted': highlightedIndex === item.flatIndex,
              }
            ]"
            @click="selectAccount(item.account)"
            @mouseenter="highlightedIndex = item.flatIndex"
          >
            <div class="coa-item-left">
              <span class="coa-item-code">{{ item.account.code }}</span>
              <div class="coa-item-info">
                <span class="coa-item-name">{{ item.account.name }}</span>
                <span v-if="item.account.category" class="coa-item-category">{{ item.account.category }}</span>
              </div>
            </div>

            <div class="coa-item-right">
              <span class="coa-type-pill" :class="getTypeBadgeClass(item.account.type)">
                {{ getTypeLabel(item.account.type) }}
              </span>
              <span v-if="selectedAccount?.code === item.account.code" class="coa-check-icon">✓</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Popover Footer -->
      <div class="coa-popover-footer">
        <div class="coa-footer-left">
          <svg class="coa-info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Menampilkan akun sesuai filter</span>
        </div>
        <div class="coa-footer-shortcuts">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span>Navigasi</span>
          <span class="coa-footer-sep">|</span>
          <kbd>Enter</kbd>
          <span>Pilih</span>
          <span class="coa-footer-sep">|</span>
          <kbd>Esc</kbd>
          <span>Tutup</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coa-combobox-wrap {
  position: relative;
  width: 100%;
  font-family: inherit;
}

.coa-combobox-wrap.is-open {
  z-index: 1000;
}

.coa-combobox-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 42px;
  padding: 6px 12px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #cbd5e1);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.coa-combobox-trigger:hover:not(.is-disabled) {
  border-color: #034693;
}

.coa-combobox-wrap.is-open .coa-combobox-trigger {
  border-color: #034693;
  box-shadow: 0 0 0 3px rgba(3, 70, 147, 0.12);
}

.is-disabled .coa-combobox-trigger {
  background: var(--bg-canvas, #f1f5f9);
  cursor: not-allowed;
  opacity: 0.65;
}

.coa-selected-value {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coa-badge-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  padding: 2px 7px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0369a1;
}

.coa-name-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coa-placeholder {
  font-size: 0.85rem;
  color: #94a3b8;
}

.coa-trigger-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.coa-clear-btn {
  background: none;
  border: none;
  font-size: 0.75rem;
  color: #94a3b8;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}

.coa-clear-btn:hover {
  color: #ef4444;
  background: #fee2e2;
}

.coa-chevron {
  color: #64748b;
  display: inline-flex;
  transition: transform 0.2s ease;
}

.coa-chevron.is-flipped {
  transform: rotate(180deg);
}

/* POPOVER */
.coa-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 99999;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.16), 0 6px 12px -4px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* SEARCH WRAP */
.coa-search-wrap {
  padding: 12px 14px 8px;
}

.coa-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.coa-search-box:focus-within {
  border-color: #1d4ed8;
  box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.12);
}

.coa-search-icon {
  color: #64748b;
  flex-shrink: 0;
}

.coa-search-input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 0.85rem;
  color: #0f172a;
  background: transparent;
}

.coa-search-input::placeholder {
  color: #94a3b8;
}

.coa-search-clear {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 4px;
}

.coa-search-clear:hover {
  color: #ef4444;
}

/* FILTER KATEGORI */
.coa-filter-section {
  padding: 4px 14px 10px;
  border-bottom: 1px solid #f1f5f9;
}

.coa-filter-heading {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 8px;
}

.coa-filter-pills {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.coa-pill-btn {
  padding: 5px 16px;
  border-radius: 9999px;
  border: none;
  font-size: 0.8rem;
  font-weight: 500;
  color: #334155;
  background: #f1f5f9;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.coa-pill-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.coa-pill-btn.is-active {
  background: #1d4ed8;
  color: #ffffff;
  font-weight: 600;
}

/* COUNT BAR */
.coa-count-bar {
  display: flex;
  justify-content: flex-end;
  padding: 6px 14px 4px;
  font-size: 0.75rem;
  color: #64748b;
}

/* LIST VIEWPORT */
.coa-list-viewport {
  max-height: 250px;
  overflow-y: auto;
  padding: 2px 0;
}

.coa-group-block {
  margin-bottom: 2px;
}

.coa-group-header {
  padding: 6px 14px;
  background: #f1f5f9;
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.coa-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
  border-left: 3px solid transparent;
}

.coa-item-row:hover,
.coa-item-row.is-highlighted {
  background: #f8fafc;
}

.coa-item-row.is-selected {
  background: #f8fafc;
}

.coa-item-row.is-selected.type-expense {
  background: #fef2f2;
  border-left-color: #b91c1c;
}

.coa-item-row.is-selected.type-asset {
  background: #eff6ff;
  border-left-color: #0284c7;
}

.coa-item-row.is-selected.type-liability {
  background: #fffbeb;
  border-left-color: #b45309;
}

.coa-item-row.is-selected.type-equity {
  background: #faf5ff;
  border-left-color: #7c3aed;
}

.coa-item-row.is-selected.type-revenue {
  background: #f0fdf4;
  border-left-color: #059669;
}

.coa-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.coa-item-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  padding: 3px 8px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0369a1;
  flex-shrink: 0;
}

.coa-item-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.coa-item-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coa-item-category {
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}

.coa-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.coa-check-icon {
  font-size: 0.85rem;
  font-weight: 700;
}

.type-expense .coa-check-icon {
  color: #b91c1c;
}

.type-asset .coa-check-icon {
  color: #0284c7;
}

.type-liability .coa-check-icon {
  color: #b45309;
}

.type-equity .coa-check-icon {
  color: #7c3aed;
}

.type-revenue .coa-check-icon {
  color: #059669;
}

/* TYPE PILLS */
.coa-type-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.badge-asset {
  background: #e0f2fe;
  color: #0284c7;
}

.badge-liability {
  background: #fef3c7;
  color: #b45309;
}

.badge-equity {
  background: #ede9fe;
  color: #7c3aed;
}

.badge-revenue {
  background: #d1fae5;
  color: #059669;
}

.badge-expense {
  background: #fee2e2;
  color: #b91c1c;
}

.badge-neutral {
  background: #f1f5f9;
  color: #475569;
}

/* EMPTY STATE */
.coa-empty-state {
  padding: 20px 14px;
  text-align: center;
  color: #64748b;
  font-size: 0.82rem;
}

.coa-empty-hint {
  font-size: 0.74rem;
  color: #94a3b8;
  margin-top: 4px;
}

/* FOOTER */
.coa-popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 0.74rem;
  color: #64748b;
}

.coa-footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.coa-info-icon {
  color: #94a3b8;
}

.coa-footer-shortcuts {
  display: flex;
  align-items: center;
  gap: 5px;
}

.coa-footer-shortcuts kbd {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.68rem;
  font-weight: 600;
  color: #475569;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
}

.coa-footer-sep {
  color: #cbd5e1;
  margin: 0 2px;
}
</style>
