// 二维码渲染助手：签到页弹窗与大屏共用同一套 QRCode 配置，
// 差异只在画布尺寸与是否清除内联尺寸样式（大屏交由 CSS 伸缩）。
import QRCode from 'qrcode';
import type { QRCodeRenderersOptions } from 'qrcode';

export interface QrRenderOptions {
  width: number;
  // 不传时保持 qrcode 库默认边距（历史弹窗行为），只有大屏显式给 2
  margin?: number;
  // 置真时渲染后清除 toCanvas 写入的内联 style.width/height（固定像素），
  // 否则内联样式优先于 CSS 的 width:100%，会把大屏面板和左列撑破
  clearInlineSize?: boolean;
}

// 把 url 渲染到 canvas；生成失败时抛出原错误，由调用方决定如何提示用户
export const renderQrCode = async (canvas: HTMLCanvasElement, url: string, options: QrRenderOptions): Promise<void> => {
  const qrOptions: QRCodeRenderersOptions = {
    width: options.width,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  };
  if (options.margin !== undefined) {
    qrOptions.margin = options.margin;
  }
  await QRCode.toCanvas(canvas, url, qrOptions);
  if (options.clearInlineSize) {
    canvas.style.width = '';
    canvas.style.height = '';
  }
};
