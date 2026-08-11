// switch / settings 命令。
//   switch   —— 未锁定时把选择固化写入会话(session entry),resume 恢复
//   settings —— 仅配置 global/project 两级;一级显示当前值与配置位置,二级支持 clear

import { clearLevelValue, levelFilePath, readLevelValue, writeLevelValue } from "./config";
import { resolveVersion, scanVersions } from "./versions";
import { SESSION_STATE_TYPE, type ConfigLevel, type InjectVersion, type UiCtx } from "./types";

/** 命令所需的扩展侧依赖(避免隐式状态)。 */
export interface CommandDeps {
  /** 配置变更后重新解析配置链并刷新徽章。 */
  refreshWidget: (ctx: UiCtx) => void;
  /** 固化写入会话 entry(switch 用)。 */
  appendEntry: (customType: string, data?: unknown) => void;
  logInfo: (message: string, meta?: Record<string, unknown>) => void;
}

/** 层级显示名(面向用户)。 */
const LEVEL_LABELS: Record<ConfigLevel, string> = {
  global: "用户级",
  project: "项目级",
  session: "会话",
};

/** 供 settings 一级菜单选择,label 面向用户,返回映射回配置层级 id。 */
const LEVEL_OPTIONS: { id: ConfigLevel; label: string }[] = [
  { id: "global", label: "用户级" },
  { id: "project", label: "项目级" },
];

/** 当前值的用户可读描述。 */
function describeCurrent(value: string | undefined): string {
  if (value === undefined) return "未设置";
  return value === "off" ? "关闭" : value;
}

/**
 * 版本选项:介绍在前、问候语在后,长内容按终端宽度自动换行分两行展示。
 * label 保持版本名作为选择标识。
 */
function versionOption(versions: InjectVersion[], name: string, current: string | undefined) {
  const v = versions.find((x) => x.name === name);
  const parts: string[] = [];
  if (v?.description) parts.push(v.description);
  if (v?.status) parts.push(`"${v.status}"`);
  if (name === current) parts.push("(当前)");
  return { label: name, description: parts.length > 0 ? parts.join(" ") : undefined };
}

/** switch:选择本会话提示词(版本 + off),固化写入会话,resume 恢复。 */
export async function openSwitch(ctx: UiCtx, deps: CommandDeps): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("提示词选择需要交互式终端", "warning");
    return;
  }
  const versions = scanVersions(ctx.cwd);
  if (versions.length === 0) {
    ctx.ui.notify("还没有可用的提示词。请在 system_inject 目录中添加 .md 版本文件。", "warning");
    return;
  }
  const current = readLevelValue("session", ctx.cwd, ctx);
  const choice = await ctx.ui.select("选择本会话使用的提示词", [
    ...versions.map((v) => versionOption(versions, v.name, current)),
    { label: "off", description: "关闭注入,保持纯净对话" },
  ]);
  if (!choice) return;
  deps.appendEntry(SESSION_STATE_TYPE, choice); // 固化:resume 时从会话恢复
  deps.refreshWidget(ctx);
  ctx.ui.notify(
    choice === "off"
      ? "已关闭注入,本会话保持纯净。"
      : `已切换到 [${choice}],本会话将使用它。`,
    "info",
  );
}

/** settings:二级菜单,仅 global/project;一级显示当前值与配置位置,二级支持 clear。 */
export async function openSettings(ctx: UiCtx, deps: CommandDeps): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("配置面板需要交互式终端", "warning");
    return;
  }
  // 第一级:配置层级(global/project),显示当前值与配置文件位置
  const picked = await ctx.ui.select(
    "设置提示词配置",
    LEVEL_OPTIONS.map((l) => ({
      label: l.label,
      description: `当前: ${describeCurrent(readLevelValue(l.id, ctx.cwd, ctx))} · 位置: ${levelFilePath(l.id, ctx.cwd)}`,
    })),
  );
  const level = LEVEL_OPTIONS.find((l) => l.label === picked)?.id;
  if (!level) return;

  // 第二级:提示词 / off / clear
  const versions = scanVersions(ctx.cwd);
  if (versions.length === 0) {
    ctx.ui.notify("还没有可用的提示词。请在 system_inject 目录中添加 .md 版本文件。", "warning");
    return;
  }
  const current = readLevelValue(level, ctx.cwd, ctx);
  const value = await ctx.ui.select(`选择 [${LEVEL_LABELS[level]}] 的提示词`, [
    ...versions.map((v) => versionOption(versions, v.name, current)),
    { label: "off", description: "关闭注入" },
    { label: "clear", description: "清除该层级设置(跟随上一级)" },
  ]);
  if (!value) return;

  if (value === "clear") {
    clearLevelValue(level, ctx.cwd);
    deps.logInfo("system_inject: setting cleared", { level });
    ctx.ui.notify(
      level === "project"
        ? "项目级设置已清除,将跟随用户级。"
        : "用户级设置已清除,将恢复默认。",
      "info",
    );
  } else {
    writeLevelValue(level, ctx.cwd, ctx, value, deps.appendEntry);
    deps.logInfo("system_inject: setting written", { level, value });
    ctx.ui.notify(
      value === "off"
        ? `${LEVEL_LABELS[level]}已关闭注入。`
        : `${LEVEL_LABELS[level]}已设为 [${value}]。`,
      "info",
    );
  }
  // 配置变更后重新解析并刷新
  deps.refreshWidget(ctx);
}
