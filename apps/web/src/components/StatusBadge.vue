<script setup lang="ts">
import { computed } from 'vue';
import { getStatusVisual } from '../utils/format';

const props = defineProps<{
  status: string | null | undefined;
}>();

const visual = computed(() => getStatusVisual(props.status));
</script>

<template>
  <span class="status-badge" :class="`tone-${visual.tone}`">
    <span class="status-dot" aria-hidden="true"></span>
    <span class="status-text">{{ visual.label }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 650;
  border-radius: 9999px;
  white-space: nowrap;
  line-height: 1;
  transition: transform 100ms ease;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.tone-success {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border-color: var(--status-success-border);
}

.tone-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning-text);
  border-color: var(--status-warning-border);
}

.tone-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border-color: var(--status-danger-border);
}

.tone-info {
  background: var(--status-info-bg);
  color: var(--status-info-text);
  border-color: var(--status-info-border);
}

.tone-neutral {
  background: var(--status-neutral-bg);
  color: var(--status-neutral-text);
  border-color: var(--status-neutral-border);
}
</style>
