<script setup lang="ts">
import { ref, watch, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    id?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    min?: number;
    max?: number;
    showHelper?: boolean;
  }>(),
  {
    modelValue: 0,
    id: undefined,
    placeholder: '0',
    required: false,
    disabled: false,
    min: 0,
    max: undefined,
    showHelper: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const formatNumberId = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '';
  return new Intl.NumberFormat('id-ID').format(val);
};

const displayValue = ref<string>(formatNumberId(props.modelValue));

watch(
  () => props.modelValue,
  (newVal) => {
    const rawCurrent = displayValue.value.replace(/\D/g, '');
    const currentNum = rawCurrent ? parseInt(rawCurrent, 10) : 0;
    if (newVal !== currentNum) {
      displayValue.value = formatNumberId(newVal);
    }
  },
  { immediate: true }
);

const onInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const rawDigits = target.value.replace(/\D/g, '');
  
  if (!rawDigits) {
    displayValue.value = '';
    emit('update:modelValue', 0);
    return;
  }

  let num = parseInt(rawDigits, 10);
  if (props.max !== undefined && num > props.max) {
    num = props.max;
  }

  displayValue.value = formatNumberId(num);
  target.value = displayValue.value;
  emit('update:modelValue', num);
};

const onBlur = () => {
  const current = props.modelValue ?? 0;
  if (props.min !== undefined && current < props.min && current > 0) {
    displayValue.value = formatNumberId(props.min);
    emit('update:modelValue', props.min);
  }
};

const rupiahFormatted = computed(() => {
  if (!props.modelValue) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(props.modelValue);
});
</script>

<template>
  <div class="currency-input-container">
    <div class="currency-input-wrap" :class="{ 'is-disabled': disabled }">
      <span class="currency-prefix">Rp</span>
      <input
        :id="id"
        type="text"
        inputmode="numeric"
        class="currency-field"
        :value="displayValue"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        @input="onInput"
        @blur="onBlur"
      />
    </div>
    <span v-if="showHelper && (modelValue ?? 0) > 0" class="currency-helper">
      {{ rupiahFormatted }}
    </span>
  </div>
</template>

<style scoped>
.currency-input-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.currency-input-wrap {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 44px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #cbd5e1);
  border-radius: var(--radius-md, 8px);
  transition: all 140ms ease;
  overflow: hidden;
}

.currency-input-wrap:focus-within {
  border-color: var(--focus-ring, #034693);
  box-shadow: 0 0 0 3px rgba(3, 70, 147, 0.14);
}

.currency-input-wrap.is-disabled {
  background: var(--bg-subtle, #f1f5f9);
  opacity: 0.7;
  cursor: not-allowed;
}

.currency-prefix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-secondary, #475569);
  background: var(--bg-canvas, #f8fafc);
  border-right: 1px solid var(--border-subtle, #cbd5e1);
  user-select: none;
}

.currency-field {
  flex: 1;
  min-height: 42px;
  padding: 8px 14px;
  font-size: 0.95rem;
  font-family: inherit;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  background: transparent;
  border: none;
  outline: none;
  text-align: left;
}

.currency-field::placeholder {
  color: var(--text-muted, #94a3b8);
  font-weight: 400;
}

.currency-helper {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
  padding-left: 2px;
}
</style>
