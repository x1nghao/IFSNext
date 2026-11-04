// 应用级界面状态：当前视图与全局覆盖层开关。
// 独立成模块的原因：导航状态被设置页（switchSheet 直达签到页）、抽奖页（关闭时退回）、
// 大屏（Escape 退出）等多个领域读写，收敛到一处避免相互引用造成环。
import { ref } from 'vue';

// 底部导航指向的视图：operations 签到 / lottery 抽奖 / settings 设置
const currentView = ref('operations');

// 签到二维码弹窗：入口在全局顶栏，任意视图下都可打开
const showQRCode = ref(false);

export function useAppView() {
  return { currentView, showQRCode };
}
