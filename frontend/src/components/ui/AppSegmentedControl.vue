<script setup lang="ts">
interface Option {
  label: string;
  value: string;
}

interface Props {
  modelValue: string;
  options: Option[];
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inline-flex items-center rounded-[var(--radius-segment)] bg-[var(--color-control-bg)] p-[2px] dark:bg-[var(--color-control-bg-dark)]">
    <button
      v-for="option in options"
      :key="option.value"
      @click="emit('update:modelValue', option.value)"
      class="text-caption px-3 h-[28px] font-medium rounded-[calc(var(--radius-segment)-2px)] border-none transition-all duration-200 flex items-center justify-center whitespace-nowrap"
      :class="[
        modelValue === option.value
          ? 'segment-active text-[var(--color-text)]'
          : 'text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5'
      ]"
    >
      {{ option.label }}
      <span v-if="modelValue === option.value" class="ml-1">
        <slot name="label-suffix" :option="option" :active="modelValue === option.value"></slot>
      </span>
    </button>
  </div>
</template>
