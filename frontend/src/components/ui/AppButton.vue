<script setup lang="ts">
import { computed } from 'vue';
import AppSpinner from '@/components/ui/AppSpinner.vue';

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'medium',
  disabled: false,
  loading: false,
  type: 'button',
  block: false,
});

const emit = defineEmits(['click']);

const classes = computed(() => {
  const base = 'inline-flex items-center justify-center font-semibold rounded-full transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const sizes = {
    small: 'h-[28px] text-xs px-3 py-1',
    medium: 'h-[44px] min-h-[44px] px-5',
  };

  const variants = {
    primary: 'relative overflow-hidden text-white bg-[var(--color-accent-fill)] shadow-[var(--shadow-accent)] hover:bg-[var(--color-accent-fill-hover)]',
    secondary: 'bg-[var(--color-control-bg)] text-[var(--color-primary)] hover:bg-[var(--color-control-bg-strong)] dark:text-[var(--color-text)]',
    danger: 'bg-[var(--color-danger-badge-bg)] text-[var(--color-danger-badge-text)]',
    ghost: 'bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-control-bg)]',
  };

  return [
    base,
    sizes[props.size],
    variants[props.variant],
    props.block ? 'w-full' : '',
    props.loading ? 'cursor-wait' : '',
  ].join(' ');
});
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <AppSpinner v-if="loading" class="-ml-1 mr-2 h-4 w-4" />
    <slot></slot>
  </button>
</template>
