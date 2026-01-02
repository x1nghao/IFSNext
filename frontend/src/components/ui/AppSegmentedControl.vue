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
  <div class="inline-flex items-center rounded-[10px] bg-[var(--color-control-bg)] p-[2px] dark:bg-[var(--color-control-bg-dark)]">
    <button
      v-for="option in options"
      :key="option.value"
      @click="emit('update:modelValue', option.value)"
      class="px-3 h-[28px] text-[13px] font-medium rounded-[8px] border-none transition-all duration-200 flex items-center justify-center whitespace-nowrap"
      :class="[
        modelValue === option.value 
          ? 'bg-[rgba(255,255,255,0.92)] text-[var(--color-text)] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[rgba(99,99,102,0.65)] dark:text-[var(--color-text)]' 
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
