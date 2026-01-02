<script setup lang="ts">
import { computed } from 'vue';

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
  const base = 'inline-flex items-center justify-center font-semibold rounded-[12px] transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
  
  const sizes = {
    small: 'h-[28px] text-xs px-3 py-1',
    medium: 'h-[44px] min-h-[44px] px-5',
  };

  const variants = {
    primary: 'text-white bg-gradient-to-br from-[var(--color-ios-blue-start)] to-[var(--color-ios-blue-end)] shadow-[0_4px_10px_rgba(50,172,182,0.3)] border border-white/10 hover:-translate-y-[1px] hover:shadow-[0_6px_15px_rgba(50,172,182,0.4)] hover:brightness-105 active:shadow-[0_2px_5px_rgba(50,172,182,0.2)]',
    secondary: 'bg-[rgba(118,118,128,0.12)] text-[var(--color-ios-blue-start)] hover:bg-[rgba(118,118,128,0.2)] backdrop-blur-md dark:bg-[rgba(118,118,128,0.24)] dark:text-white',
    danger: 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50',
    ghost: 'bg-transparent text-[var(--color-ios-blue-start)] hover:bg-[rgba(118,118,128,0.12)] dark:text-blue-400',
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
    <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
    <slot></slot>
  </button>
</template>
