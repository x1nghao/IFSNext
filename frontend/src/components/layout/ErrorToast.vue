<script setup lang="ts">
// 错误 Toast：addError 是异常的唯一界面出口，4 秒自动消失；状态与定时器由 useToast 单例管理。
import { useI18n } from 'vue-i18n';
import { useToast } from '@/composables/useToast';

const { t } = useI18n();
const { toast, dismissToast } = useToast();
</script>

<template>
  <!-- 错误 Toast：异常的唯一界面出口，4 秒自动消失 -->
  <Transition name="fade">
    <div v-if="toast" class="error-toast" role="alert">
      <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"></path>
      </svg>
      <span class="error-toast-message">{{ toast.message }}</span>
      <button class="error-toast-close" :aria-label="t('common.close')" @click="dismissToast">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  </Transition>
</template>
