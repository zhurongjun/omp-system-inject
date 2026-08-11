// 三级配置(global -> project -> session),每级一个纯字符串:
//   版本名 | "off"(显式关闭)| 缺失(undefined = 继承下一级)。
// 旧 roles 对象格式读取时自动迁移为字符串。
//
// 层级职责:
//   session  —— 仅由 switch 固化写入(未锁定窗口),resume 恢复;setting 不触碰
//   project/global —— 由 setting 写入;clear 删除文件恢复继承

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { SESSION_STATE_TYPE, type ConfigLevel, type UiCtx } from "./types";

function globalConfigFile(): string {
  return join(homedir(), ".omp", "agent", "system_inject.json");
}

function projectConfigFile(cwd: string): string {
  return join(cwd, ".omp", "system_inject.json");
}

function levelFile(level: ConfigLevel, cwd: string): string {
  return level === "global" ? globalConfigFile() : projectConfigFile(cwd);
}

/** 层级配置文件路径(面向用户展示)。 */
export function levelFilePath(level: ConfigLevel, cwd: string): string {
  return levelFile(level, cwd);
}

/** 读取文件级配置:版本名 / "off" / undefined。兼容旧 roles 对象格式。 */
function readLevel(file: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") {
      const active = (raw as { activeRole?: unknown }).activeRole;
      const roles = (raw as { roles?: Record<string, unknown> }).roles;
      if (typeof active === "string" && roles && typeof roles === "object") {
        const role = roles[active] as { version?: unknown; enabled?: unknown } | undefined;
        if (role && typeof role === "object") {
          return role.enabled === false ? "off" : typeof role.version === "string" ? role.version : undefined;
        }
      }
    }
  } catch {
    // 读取失败/文件缺失 → 无配置
  }
  return undefined;
}

/** 写入文件级配置(纯字符串)。 */
function writeLevel(file: string, value: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

/** 清除文件级配置(删除文件 = 缺失 = 恢复继承)。session 级不支持。 */
export function clearLevelValue(level: ConfigLevel, cwd: string): void {
  if (level === "session") return;
  try {
    rmSync(levelFile(level, cwd), { force: true });
  } catch {
    // 删除失败视为已清除
  }
}

function readSessionLevel(ctx: UiCtx): string | undefined {
  try {
    for (const entry of ctx.sessionManager.getBranch()) {
      const e = entry as { type?: string; customType?: string; data?: unknown };
      if (e.type === "custom" && e.customType === SESSION_STATE_TYPE) {
        return typeof e.data === "string" ? e.data : undefined;
      }
    }
  } catch {
    // 会话读取失败 → 无配置
  }
  return undefined;
}

/** 配置链解析(getter,无内存状态):session ?? project ?? global。 */
export function mergedValue(cwd: string, ctx: UiCtx): string | undefined {
  return readSessionLevel(ctx) ?? readLevel(projectConfigFile(cwd)) ?? readLevel(globalConfigFile());
}

/** 读取指定级别的配置。 */
export function readLevelValue(level: ConfigLevel, cwd: string, ctx: UiCtx): string | undefined {
  return level === "session" ? readSessionLevel(ctx) : readLevel(levelFile(level, cwd));
}

/** 写入指定级别的配置。session 经 appendEntry 固化到会话文件。 */
export function writeLevelValue(
  level: ConfigLevel,
  cwd: string,
  ctx: UiCtx,
  value: string,
  appendEntry: (customType: string, data?: unknown) => void,
): void {
  if (level === "session") {
    appendEntry(SESSION_STATE_TYPE, value);
  } else {
    writeLevel(levelFile(level, cwd), value);
  }
}
