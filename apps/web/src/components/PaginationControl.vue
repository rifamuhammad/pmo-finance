<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    currentPage: number;
    pageSize: number;
    totalItems: number;
    pageSizeOptions?: number[];
    itemLabel?: string;
  }>(),
  {
    pageSizeOptions: () => [5, 10, 25],
    itemLabel: 'data',
  }
);

const emit = defineEmits<{
  (e: 'update:currentPage', page: number): void;
  (e: 'update:pageSize', size: number): void;
  (e: 'change', payload: { page: number; pageSize: number }): void;
}>();

const totalPages = computed(() => {
  if (props.totalItems <= 0) return 1;
  return Math.ceil(props.totalItems / props.pageSize);
});

const startItem = computed(() => {
  if (props.totalItems <= 0) return 0;
  return (props.currentPage - 1) * props.pageSize + 1;
});

const endItem = computed(() => {
  return Math.min(props.totalItems, props.currentPage * props.pageSize);
});

type PageItem = number | '...';

const visiblePages = computed<PageItem[]>(() => {
  const total = totalPages.value;
  const current = props.currentPage;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }

  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, '...', current - 1, current, current + 1, '...', total];
});

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === props.currentPage) return;
  emit('update:currentPage', page);
  emit('change', { page, pageSize: props.pageSize });
}

function changePageSize(e: Event) {
  const target = e.target as HTMLSelectElement;
  const newSize = Number(target.value);
  emit('update:pageSize', newSize);
  emit('update:currentPage', 1);
  emit('change', { page: 1, pageSize: newSize });
}
</script>

<template>
  <nav class="pagination-bar" aria-label="Navigasi Halaman Data">
    <div class="pagination-info">
      <span>
        Menampilkan <strong>{{ startItem }}</strong> – <strong>{{ endItem }}</strong> dari <strong>{{ totalItems }}</strong> {{ itemLabel }}
      </span>
      <div class="page-size-selector">
        <label :for="'page-size-' + $.uid" class="sr-only">Baris per halaman</label>
        <select
          :id="'page-size-' + $.uid"
          :value="pageSize"
          class="page-size-select"
          @change="changePageSize"
        >
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">
            {{ opt }} / hal
          </option>
        </select>
      </div>
    </div>

    <div v-if="totalPages > 1" class="pagination-pages">
      <!-- Previous Button -->
      <button
        type="button"
        class="page-nav-btn prev"
        :disabled="currentPage <= 1"
        aria-label="Halaman sebelumnya"
        @click="goToPage(currentPage - 1)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <!-- Page Numbers -->
      <template v-for="(p, idx) in visiblePages" :key="idx">
        <span v-if="p === '...'" class="page-ellipsis" aria-hidden="true">&hellip;</span>
        <button
          v-else
          type="button"
          class="page-number-btn"
          :class="{ active: p === currentPage }"
          :aria-current="p === currentPage ? 'page' : undefined"
          :aria-label="`Halaman ${p}`"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>
      </template>

      <!-- Next Button -->
      <button
        type="button"
        class="page-nav-btn next"
        :disabled="currentPage >= totalPages"
        aria-label="Halaman berikutnya"
        @click="goToPage(currentPage + 1)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 18px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}

.pagination-info strong {
  color: var(--text-primary);
  font-weight: 600;
}

.page-size-selector {
  display: inline-flex;
  align-items: center;
}

.page-size-select {
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}

.page-size-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(3, 70, 147, 0.12);
}

.pagination-pages {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-nav-btn,
.page-number-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.84rem;
  font-weight: 600;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: all 120ms ease;
}

.page-nav-btn {
  background: var(--bg-subtle);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}

.page-nav-btn:hover:not(:disabled),
.page-number-btn:hover:not(.active) {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.page-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-number-btn.active {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
  box-shadow: 0 2px 6px rgba(3, 70, 147, 0.25);
  font-weight: 700;
}

.page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;
  color: var(--text-secondary);
  user-select: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@media (max-width: 640px) {
  .pagination-bar {
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
}
</style>
