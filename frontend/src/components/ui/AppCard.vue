<script setup lang="ts">
interface Props {
  noPadding?: boolean;
}

withDefaults(defineProps<Props>(), {
  noPadding: false,
});
</script>

<template>
  <div
    class="card"
    :class="noPadding ? '' : 'p-4 sm:p-6'"
  >
    <slot></slot>
  </div>
</template>
