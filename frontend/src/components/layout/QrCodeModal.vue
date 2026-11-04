<script setup lang="ts">
// 签到二维码弹窗：入口在全局顶栏，挂载即渲染二维码。
// 链接不安全（非 http/https）时给出可行动解释，而不是留一块空白画布。
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppCard from '@/components/ui/AppCard.vue';
import { renderQrCode } from '@/utils/qrcode';
import { useAppView } from '@/composables/useAppView';
import { useSettings } from '@/composables/useSettings';
import { useToast } from '@/composables/useToast';

const { t } = useI18n();
const { showQRCode } = useAppView();
const { safeCheckinFormUrl } = useSettings();
const { addError } = useToast();

const qrcodeCanvas = ref<HTMLCanvasElement | null>(null);

const generateQRCode = async () => {
  if (qrcodeCanvas.value && safeCheckinFormUrl.value) {
    try {
      await renderQrCode(qrcodeCanvas.value, safeCheckinFormUrl.value, { width: 200 });
    } catch (err: any) {
      addError(t('error.qrFailed', { message: err.message }));
    }
  }
};

// 挂载即等弹窗把 canvas 渲染出来再绘制（原 watch(showQRCode) 的 nextTick 时机）
onMounted(generateQRCode);
</script>

<template>
  <div class="modal-overlay" @click="showQRCode = false">
    <AppCard class="w-full max-w-md" role="dialog" aria-modal="true" @click.stop>
      <!-- 头部 -->
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-[var(--radius-tile)] flex items-center justify-center bg-white/60 dark:bg-white/10">
            <svg class="w-5 h-5 text-[var(--color-primary)] dark:text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-[var(--color-text)]">{{ t('qr.title') }}</h3>
        </div>
        <button @click="showQRCode = false" class="ifs-iconbtn" :aria-label="t('common.close')" :title="t('common.close')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- 二维码容器：链接不安全（非 http/https）时给出可行动解释，而不是留一块空白画布 -->
      <div class="flex justify-center mb-6">
        <div v-if="safeCheckinFormUrl" class="qr-panel">
          <canvas ref="qrcodeCanvas"></canvas>
        </div>
        <p v-else class="text-sm text-[var(--color-danger-badge-text)]">{{ t('qr.invalidLink') }}</p>
      </div>

      <!-- 底部说明 -->
      <div class="text-center space-y-3">
        <p class="text-sm text-[var(--color-text-secondary)]">{{ t('qr.hint') }}</p>
        <div v-if="safeCheckinFormUrl" class="text-sm text-[var(--color-text-secondary)] break-all mt-4 text-center">
          <p class="mb-2">{{ t('qr.linkLabel') }}</p>
          <a :href="safeCheckinFormUrl" target="_blank" rel="noopener noreferrer" class="text-[var(--color-primary)] dark:text-[var(--color-primary)] hover:underline">{{ safeCheckinFormUrl }}</a>
        </div>

        <div class="flex items-center justify-center space-x-2 text-xs text-[var(--color-text-secondary)]">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>{{ t('qr.closeHint') }}</span>
        </div>
      </div>
    </AppCard>
  </div>
</template>
