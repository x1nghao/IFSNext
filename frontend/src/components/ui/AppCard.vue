<script setup lang="ts">
interface Props {
  hover?: boolean;
  noPadding?: boolean;
}

withDefaults(defineProps<Props>(), {
  hover: false,
  noPadding: false,
});
</script>

<template>
  <div 
    class="bg-[var(--color-card-bg)] backdrop-blur-[20px] border border-white/40 rounded-[14px] shadow-[var(--shadow-glass)] transition-all duration-200 ease-out dark:bg-[var(--color-card-bg-dark)] dark:border-white/10 dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
    :class="[
      hover ? 'hover:-translate-y-[2px] hover:shadow-[var(--shadow-hover)]' : '',
      noPadding ? '' : 'p-4 sm:p-6'
    ]"
  >
    <slot></slot>
  </div>
</template>
