// 共享类型与常量

export interface InjectVersion {
  name: string;
  description: string;
  status: string;
  body: string;
  file: string;
}

export type ConfigLevel = "global" | "project" | "session";

/** 会话级配置写入的 custom entry 类型(switch 固化 / resume 读取)。 */
export const SESSION_STATE_TYPE = "system_inject.value";
/** 编辑器上方徽章的 widget key。 */
export const WIDGET_KEY = "sys-inject";

/** 扩展命令/事件 handler 可用的最小 ctx 形状。 */
export interface UiCtx {
  cwd: string;
  hasUI: boolean;
  ui: {
    setWidget: (k: string, c: unknown, o?: { placement?: string }) => void;
    select: (
      title: string,
      options: { label: string; description?: string }[],
      o?: unknown,
    ) => Promise<string | undefined>;
    notify: (msg: string, type?: "info" | "warning" | "error") => void;
  };
  sessionManager: { getBranch(): readonly unknown[] };
}
