// 文案汇总：三语言各自独立成文件，本文件只负责组装与再导出。
// key 结构基线是 zh-CN（AppMessages 类型），messages.test.ts 守卫三语言一致。
import { zhCN } from './zh-CN.ts';
import { zhTW } from './zh-TW.ts';
import { enUS } from './en-US.ts';

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'zh-TW': zhTW,
}
