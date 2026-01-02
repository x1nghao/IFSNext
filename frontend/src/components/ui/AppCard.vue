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
    class="card transition-all duration-200 ease-out"
    :class="[
      hover ? 'hover:-translate-y-[2px] hover:shadow-[var(--shadow-hover)]' : '',
      noPadding ? '' : 'p-4 sm:p-6'
    ]"
  >
    <slot></slot>
  </div>
</template>
