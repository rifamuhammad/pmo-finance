<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

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
const activeCategoryTab = ref<string>('ALL');
const highlightedIndex = ref(0);
const containerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const categoryTabs = [
  { id: 'ALL', label: 'Semua Akun' },
  { id: '1', label: '1 - Kas & Aset', type: 'ASSET' },
  { id: '2', label: '2 - Utang & Pajak', type: 'LIABILITY' },
  { id: '3', label: '3 - Ekuitas', type: 'EQUITY' },
  { id: '4', label: '4 - Pendapatan Bisnis', type: 'REVENUE' },
  { id: '5', label: '5 - Belanja Operasional', type: 'EXPENSE' },
];

const selectedAccount = computed<CoaAccountItem | null>(() => {
  if (!props.modelValue) return null;
  return props.accounts.find((a) => a.code === props.modelValue) || null;
});

const filteredAccounts = computed<CoaAccountItem[]>(() => {
  let list = props.accounts || [];

  if (props.restrictType) {
    list = list.filter((a) => a.type?.toUpperCase() === props.restrictType?.toUpperCase());
  }

  if (activeCategoryTab.value !== 'ALL') {
    list = list.filter((a) => a.code.startsWith(activeCategoryTab.value));
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    // Normalise query removing dots or spaces for code matching
    const cleanQuery = query.replace(/[.\s-]/g, '');
    list = list.filter((a) => {
      const cleanCode = a.code.replace(/[.\s-]/g, '').toLowerCase();
      const nameMatch = a.name.toLowerCase().includes(query);
      const codeMatch = cleanCode.includes(cleanQuery) || a.code.toLowerCase().includes(query);
      const catMatch = a.category?.toLowerCase().includes(query);
      return nameMatch || codeMatch || catMatch;
    });
  }

  return list;
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

const getTypeLabel = (type?: string) => {
  if (!type) return 'AKUN';
  switch (type.toUpperCase()) {
    case 'ASSET':
      return 'Aset';
    case 'LIABILITY':
      return 'Kewajiban';
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

    <!-- Dropdown Popover -->
    <div v-if="isOpen" class="coa-popover" @click.stop>
      <!-- Search Bar -->
      <div class="coa-search-bar">
        <svg class="coa-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="coa-search-input"
          placeholder="Ketik kode (misal 5201) atau nama akun (gaji, obat, kasir)..."
          @keydown="onKeyDown"
        />
        <span v-if="searchQuery" class="coa-count-indicator">
          {{ filteredAccounts.length }} hasil
        </span>
      </div>

      <!-- Quick Filter Tabs (Kepala 1 s/d Kepala 5) -->
      <div v-if="!restrictType" class="coa-tabs-bar">
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          class="coa-tab-chip"
          :class="{ 'is-active': activeCategoryTab === tab.id }"
          @click="activeCategoryTab = tab.id; highlightedIndex = 0"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Result List -->
      <div class="coa-list-viewport">
        <div v-if="filteredAccounts.length === 0" class="coa-empty-state">
          <span>Tidak ada akun COA yang cocok dengan "<strong>{{ searchQuery }}</strong>"</span>
          <p class="coa-empty-hint">Pastikan mencari dalam 70 Akun Operasional Spesifik PMO</p>
        </div>

        <button
          v-for="(acc, index) in filteredAccounts"
          :key="acc.code"
          type="button"
          class="coa-item-row"
          :class="{
            'is-selected': selectedAccount?.code === acc.code,
            'is-highlighted': highlightedIndex === index,
          }"
          @click="selectAccount(acc)"
          @mouseenter="highlightedIndex = index"
        >
          <div class="coa-item-left">
            <span class="coa-item-code">{{ acc.code }}</span>
            <div class="coa-item-info">
              <span class="coa-item-name">{{ acc.name }}</span>
              <span v-if="acc.category" class="coa-item-category">{{ acc.category }}</span>
            </div>
          </div>

          <div class="coa-item-right">
            <span class="coa-item-unit" v-if="acc.businessUnit && acc.businessUnit !== 'ALL'">
              {{ acc.businessUnit }}
            </span>
            <span class="coa-type-pill" :class="getTypeBadgeClass(acc.type)">
              {{ getTypeLabel(acc.type) }}
            </span>
            <span v-if="selectedAccount?.code === acc.code" class="coa-check-icon">✓</span>
          </div>
        </button>
      </div>

      <!-- Footer Info -->
      <div class="coa-popover-footer">
        <span>Menampilkan <strong>{{ filteredAccounts.length }}</strong> dari {{ accounts.length }} Akun Resmi PMO (Excel)</span>
        <span class="coa-keyboard-hint">Navigasi: ↑ ↓ | Enter: Pilih | Esc: Batal</span>
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

.coa-combobox-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 4px 10px;
  background: var(--bg-card, #ffffff);
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
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f0f4f9;
  color: #034693;
  border: 1px solid rgba(3, 70, 147, 0.15);
}

.coa-name-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
}

.coa-placeholder {
  font-size: 0.85rem;
  color: var(--text-muted, #94a3b8);
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
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 999;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* SEARCH BAR */
.coa-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.coa-search-icon {
  color: #64748b;
  flex-shrink: 0;
}

.coa-search-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 0.84rem;
  color: #0f172a;
  outline: none;
  padding: 0;
}

.coa-search-input::placeholder {
  color: #94a3b8;
}

.coa-count-indicator {
  font-size: 0.72rem;
  color: #64748b;
  background: #e2e8f0;
  padding: 2px 6px;
  border-radius: 9999px;
  white-space: nowrap;
}

/* TABS BAR */
.coa-tabs-bar {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  overflow-x: auto;
}

.coa-tab-chip {
  background: #f1f5f9;
  border: 1px solid transparent;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.coa-tab-chip:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.coa-tab-chip.is-active {
  background: #034693;
  color: #ffffff;
}

/* LIST VIEWPORT */
.coa-list-viewport {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}

.coa-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.coa-item-row:hover,
.coa-item-row.is-highlighted {
  background: #f1f5f9;
}

.coa-item-row.is-selected {
  background: #eff6ff;
}

.coa-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.coa-item-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.76rem;
  font-weight: 700;
  color: #034693;
  padding: 2px 5px;
  background: #f0f4f9;
  border-radius: 4px;
  white-space: nowrap;
}

.coa-item-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.coa-item-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.coa-item-category {
  font-size: 0.7rem;
  color: #64748b;
}

.coa-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}

.coa-item-unit {
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #0284c7;
  font-weight: 600;
}

.coa-check-icon {
  font-size: 0.8rem;
  font-weight: bold;
  color: #034693;
}

/* TYPE PILLS */
.coa-type-pill {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.badge-asset {
  background: #e0f2fe;
  color: #0369a1;
}

.badge-liability {
  background: #fee2e2;
  color: #b91c1c;
}

.badge-equity {
  background: #fef3c7;
  color: #b45309;
}

.badge-revenue {
  background: #dcfce7;
  color: #15803d;
}

.badge-expense {
  background: #ffedd5;
  color: #c2410c;
}

.badge-neutral {
  background: #f1f5f9;
  color: #475569;
}

.coa-empty-state {
  text-align: center;
  padding: 24px 12px;
  color: #64748b;
  font-size: 0.82rem;
}

.coa-empty-hint {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 4px;
}

.coa-popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
  font-size: 0.7rem;
  color: #64748b;
}

.coa-keyboard-hint {
  font-size: 0.68rem;
  color: #94a3b8;
}
</style>
