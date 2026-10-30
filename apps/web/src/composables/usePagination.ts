import { ref, computed, watch, type Ref } from 'vue';

export function usePagination<T>(items: Ref<T[]>, initialPageSize = 10) {
  const currentPage = ref(1);
  const pageSize = ref(initialPageSize);

  const totalItems = computed(() => items.value?.length || 0);

  const totalPages = computed(() => {
    if (totalItems.value <= 0) return 1;
    return Math.ceil(totalItems.value / pageSize.value);
  });

  const paginatedItems = computed(() => {
    if (!items.value) return [];
    const start = (currentPage.value - 1) * pageSize.value;
    return items.value.slice(start, start + pageSize.value);
  });

  // Automatically reset or adjust page when list length or pageSize changes
  watch([items, pageSize], () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = Math.max(1, totalPages.value);
    }
  });

  function resetPage() {
    currentPage.value = 1;
  }

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    paginatedItems,
    resetPage,
  };
}
