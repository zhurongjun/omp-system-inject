// TUI:编辑器上方徽章(🔓 拟人状态 / 🔒 关闭)。

import { Text, type Theme } from "@oh-my-pi/pi-tui";
import { WIDGET_KEY, type InjectVersion, type UiCtx } from "./types";

/** 根据生效版本更新徽章。格式:图标 [配置名] 问候语。version 为 null 时显示关闭态。 */
export function updateWidget(ctx: UiCtx, version: InjectVersion | null): void {
  const label = version
    ? `🔓 [${version.name}] ${version.status || version.name}`
    : "🔒 [off] 我退到一旁,对话干净如初";
  ctx.ui.setWidget(
    WIDGET_KEY,
    (_tui: unknown, theme: Theme) => new Text(theme.fg(version ? "success" : "muted", label), 1, 0),
    { placement: "aboveEditor" },
  );
}
