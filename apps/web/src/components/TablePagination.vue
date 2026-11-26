<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    totalItems: number;
    page: number;
    pageSize: number;
    pageSizes?: number[];
    itemLabel?: string;
  }>(),
  {
    pageSizes: () => [10, 15, 25, 50],
    itemLabel: 'data',
  }
);

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:pageSize', value: number): void;
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));

const startItem = computed(() => {
  if (props.totalItems === 0) return 0;
  return (props.page - 1) * props.pageSize + 1;
});

const endItem = computed(() => Math.min(props.totalItems, props.page * props.pageSize));

const visiblePages = computed<Array<number | '...'>>(() => {
  const total = totalPages.value;
  const cur = props.page;
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | '...'> = [1];
  if (cur > 3) pages.push('...');
  const lo = Math.max(2, cur - 1);
  const hi = Math.min(total - 1, cur + 1);
  for (let p = lo; p <= hi; p++) pages.push(p);
  if (cur < total - 2) pages.push('...');
  pages.push(total);
  return pages;
});

function goTo(p: number) {
  const clamped = Math.min(totalPages.value, Math.max(1, p));
  if (clamped !== props.page) emit('update:page', clamped);
}

function onSizeChange(e: Event) {
  const nextSize = Number((e.target as HTMLSelectElement).value) || 15;
  emit('update:pageSize', nextSize);
  emit('update:page', 1);
}
</script>

<template>
  <div v-if="totalItems > 0" class="poital-pagination">
    <div class="pg-left">
      <span class="pg-info">
        Menampilkan <strong>{{ startItem }}–{{ endItem }}</strong> dari <strong>{{ totalItems }}</strong> {{ itemLabel }}
      </span>
      <label class="pg-size-wrap">
        <span>Baris:</span>
        <select :value="pageSize" class="pg-select" aria-label="Jumlah baris per halaman" @change="onSizeChange">
          <option v-for="s in pageSizes" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>

    <div v-if="totalPages > 1" class="pg-nav" role="navigation" aria-label="Navigasi halaman tabel">
      <button type="button" class="pg-btn" :disabled="page <= 1" @click="goTo(page - 1)">
        &lsaquo; Sebelumnya
      </button>
      <template v-for="(p, idx) in visiblePages" :key="`${p}-${idx}`">
        <span v-if="p === '...'" class="pg-ellipsis">...</span>
        <button
          v-else
          type="button"
          class="pg-num"
          :class="{ active: p === page }"
          @click="goTo(p)"
        >
          {{ p }}
        </button>
      </template>
      <button type="button" class="pg-btn" :disabled="page >= totalPages" @click="goTo(page + 1)">
        Berikutnya &rsaquo;
      </button>
    </div>
  </div>
</template>

<style scoped>
.poital-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 14px;
  margin-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.pg-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.8rem;
  color: #64748b;
}

.pg-info strong {
  color: #0b2144;
  font-weight: 700;
}

.pg-size-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pg-select {
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0b2144;
  font-size: 0.78rem;
  font-weight: 600;
}

.pg-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.pg-btn,
.pg-num {
  height: 32px;
  min-width: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s ease;
}

.pg-btn:hover:not(:disabled),
.pg-num:hover:not(.active) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.pg-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pg-num.active {
  background: #0b2144;
  border-color: #0b2144;
  color: #ffffff;
}

.pg-ellipsis {
  padding: 0 4px;
  color: #94a3b8;
  font-size: 0.8rem;
}
</style>
