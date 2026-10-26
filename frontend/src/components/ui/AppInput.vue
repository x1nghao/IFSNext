<script setup lang="ts">
interface Props {
  modelValue: string | number;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hasIcon?: boolean;
  mono?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  type: 'text',
  disabled: false,
  hasIcon: false,
  mono: false,
});

const emit = defineEmits(['update:modelValue']);

const updateValue = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};
</script>

<template>
  <input
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    class="text-body w-full px-4 h-[44px] rounded-[var(--radius-control)] outline-none transition-all duration-200 border border-transparent shadow-none bg-[var(--color-control-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] focus:bg-[var(--color-field-focus-bg)] focus:shadow-[0_0_0_2px_var(--color-focus-ring)] dark:bg-[var(--color-control-bg-dark)] py-0"
    :class="{ 'pl-10 pr-9': hasIcon, 'font-id': mono }"
    @input="updateValue"
  />
</template>
