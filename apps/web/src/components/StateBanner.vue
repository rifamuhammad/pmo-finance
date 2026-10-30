<script setup lang="ts">
defineProps<{
  state: 'loading' | 'error' | 'empty';
  title: string;
  message: string;
  actionLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'action'): void;
}>();
</script>

<template>
  <div class="state-box" :class="`state-${state}`" role="status" aria-live="polite">
    <div class="state-icon-wrap">
      <svg v-if="state === 'loading'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <svg v-else-if="state === 'error'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
      </svg>
    </div>
    <div class="state-content">
      <h3 class="state-title">{{ title }}</h3>
      <p class="state-message">{{ message }}</p>
      <div v-if="actionLabel" class="state-actions">
        <button type="button" class="btn btn-primary btn-sm" @click="emit('action')">
          {{ actionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.state-box {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  margin: 16px 0;
  box-shadow: 0 4px 18px -2px rgba(15, 23, 42, 0.04);
}

.state-error {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}

.state-loading {
  background: #eff6ff;
  color: #034693;
  border-color: #bfdbfe;
}

.state-empty {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.state-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.state-content {
  flex: 1;
}

.state-title {
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.state-message {
  font-size: 0.85rem;
  line-height: 1.45;
  color: inherit;
  opacity: 0.88;
  margin: 0;
}

.state-actions {
  margin-top: 14px;
}
</style>
