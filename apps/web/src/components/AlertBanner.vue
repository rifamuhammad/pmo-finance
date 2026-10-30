<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'success' | 'danger' | 'warning' | 'info';
    title?: string;
    message?: string;
    dismissible?: boolean;
  }>(),
  {
    variant: 'info',
    title: '',
    message: '',
    dismissible: true,
  }
);

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();
</script>

<template>
  <div :class="['alert-banner', `alert-${variant}`]" role="alert">
    <div class="alert-icon-wrap">
      <!-- Success Icon -->
      <svg v-if="variant === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <!-- Danger Icon -->
      <svg v-else-if="variant === 'danger'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <!-- Warning Icon -->
      <svg v-else-if="variant === 'warning'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <!-- Info Icon -->
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </div>

    <div class="alert-content">
      <strong v-if="title" class="alert-title">{{ title }}</strong>
      <span class="alert-message"><slot>{{ message }}</slot></span>
    </div>

    <button
      v-if="dismissible"
      type="button"
      class="alert-dismiss-btn"
      aria-label="Tutup pemberitahuan"
      @click="emit('dismiss')"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.alert-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 0.88rem;
  line-height: 1.45;
  margin-bottom: 16px;
  border: 1px solid transparent;
  animation: alertFadeIn 150ms ease-out;
}

.alert-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.alert-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alert-title {
  font-weight: 700;
  font-size: 0.9rem;
}

.alert-message {
  color: inherit;
}

.alert-dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: opacity 120ms ease;
}

.alert-dismiss-btn:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.05);
}

.alert-success {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border-color: var(--status-success-border);
}

.alert-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border-color: var(--status-danger-border);
}

.alert-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning-text);
  border-color: var(--status-warning-border);
}

.alert-info {
  background: var(--status-info-bg);
  color: var(--status-info-text);
  border-color: var(--status-info-border);
}

@keyframes alertFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
