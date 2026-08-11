// system_inject 扩展入口:状态机 + 事件注册 + 注入。

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { SESSION_STATE_TYPE, type UiCtx } from "./types";
import { resolveVersion, scanVersions } from "./versions";
import { mergedValue } from "./config";
import { updateWidget } from "./ui";
import { openSettings, openSwitch, type CommandDeps } from "./commands";
import { stripPersonality, stripRoleSection } from "./prompt";

export default function (ext: ExtensionAPI) {
  // 配置链(唯一真相,getter 实时解析,无内存状态):
  //   effectiveValue(ctx) = session(switch 固化,resume 恢复)
  //                         ?? project(settings 写入)
  //                         ?? global(settings 写入)
  //   每级:版本名 | "off"(显式关闭)| 缺失(undefined = 继承下一级)
  //   最终 undefined/"off" → 不注入;版本名 → 注入对应版本
  //
  // 锁定状态机(唯一可变状态):
  //   lockSwitch —— true 后 switch 拒绝(固化后不可更改);new 后解锁(可预选)
  let lockSwitch = false;

  const effectiveValue = (ctx: UiCtx): string | undefined => mergedValue(ctx.cwd, ctx);

  const refreshWidget = (ctx: UiCtx): void => {
    const value = effectiveValue(ctx);
    updateWidget(ctx, value && value !== "off" ? resolveVersion(ctx.cwd, value) : null);
  };

  const deps: CommandDeps = {
    refreshWidget,
    appendEntry: (customType, data) => ext.appendEntry(customType, data),
    logInfo: (message, meta) => ext.logger.info(message, meta),
  };

  ext.on("session_start", async (_event, ctx) => {
    refreshWidget(ctx);
    ext.logger.info("system_inject: loaded", {
      cwd: ctx.cwd,
      value: effectiveValue(ctx),
      available: scanVersions(ctx.cwd).map((v) => v.name),
    });
  });

  // 会话切换:new 解锁(可预选);resume/branch/fork 锁定(读会话固化值)
  ext.on("session_switch", async (event, ctx) => {
    const reason = (event as { reason?: string }).reason;
    lockSwitch = reason !== "new";
    refreshWidget(ctx);
    ext.logger.info("system_inject: session switched", {
      reason,
      lockSwitch,
      value: effectiveValue(ctx),
    });
  });

  ext.registerCommand("system-inject", {
    description: "Inject prompt switcher and settings (switch|settings)",
    getArgumentCompletions: (prefix) => {
      const p = prefix.trim().toLowerCase();
      if (p.includes(" ")) return null;
      const items = [
        { value: "switch", description: "切换本会话提示词" },
        { value: "settings", description: "设置用户级/项目级提示词" },
      ];
      const matches = items.filter((i) => i.value.startsWith(p));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (arg === "settings") {
        await openSettings(ctx, deps);
        return;
      }
      const isSwitch = arg === "switch" || arg === "";
      const isDirect = arg === "off" || scanVersions(ctx.cwd).some((v) => v.name === arg);
      if (isSwitch || isDirect) {
        if (lockSwitch) {
          ctx.ui.notify(
            "当前会话已锁定,无法切换提示词。如需调整,请使用 /system-inject settings。",
            "warning",
          );
          return;
        }
        if (isSwitch) {
          await openSwitch(ctx, deps);
          return;
        }
        // 直接指定:固化到会话
        ext.appendEntry(SESSION_STATE_TYPE, arg);
        refreshWidget(ctx);
        ctx.ui.notify(arg === "off" ? "已关闭注入,本会话保持纯净。" : `已切换到 [${arg}],本会话将使用它。`, "info");
        return;
      }
      ctx.ui.notify(`未知提示词: ${arg}。可用: switch / settings / 版本名 / off。`, "warning");
    },
  });

  ext.on("before_agent_start", async (event, ctx) => {
    lockSwitch = true; // 开始对话后固化锁定
    const value = effectiveValue(ctx);
    if (!value || value === "off") return; // 无配置或 off:不注入也不 strip

    const version = resolveVersion(ctx.cwd, value);
    if (!version) return;
    const text = version.body.trim();
    if (!text) return;

    const blocks = event.systemPrompt.map((block, i) =>
      i === 0 ? stripPersonality(stripRoleSection(block)) : block,
    );
    if (blocks[0] === text) return; // 防御:避免重复注入

    ext.logger.info("system_inject: injected", {
      version: version.name,
      file: version.file,
      blocks: blocks.length,
    });
    return { systemPrompt: [text, ...blocks] };
  });
}
