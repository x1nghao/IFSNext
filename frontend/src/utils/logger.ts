// 统一日志出口：所有 console 打点都从这里走，DevTools 按 [IFSNext:模块] 过滤即可定位现场。
// 只封装前缀与级别，不引入上报通道——本项目没有日志收集后端，console 就是最终出口。
export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

// 生成带模块前缀的日志函数；额外参数原样透传，对象参数可在 DevTools 中展开查看
export const createLogger = (scope: string): Logger => {
  const prefix = `[IFSNext:${scope}]`;
  return {
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
  };
};
