// 三级配置(global -> project -> session),每级一个纯字符串:
//   版本名 | "off"(显式关闭)| 缺失(undefined = 继承下一级)。
// 旧 roles 对象格式读取时自动迁移为字符串。
//
// 层级职责:
//   session  —— 仅由 switch 固化写入(未锁定窗口),resume 恢复;setting 不触碰
//   project/global —— 由 setting 写入;clear 删除文件恢复继承

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** 扫描一组 entry,取最后一条会话级配置(旧→新顺序)。 */
function scanSessionEntries(entries: readonly unknown[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as { type?: string; customType?: string; data?: unknown };
    if (e.type === "custom" && e.customType === SESSION_STATE_TYPE) {
      return typeof e.data === "string" ? e.data : undefined;
    }
  }
  return undefined;
}

/** 扫描会话 JSONL 文件,取最后一条会话级配置(行序 = 时间序,最后匹配 = 最新)。 */
function scanSessionFile(file: string): string | undefined {
  try {
    let found: string | undefined;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const e = JSON.parse(line) as { type?: string; customType?: string; data?: unknown };
      if (e.type === "custom" && e.customType === SESSION_STATE_TYPE && typeof e.data === "string") {
        found = e.data;
      }
    }
    return found;
  } catch {
    // 读取失败 → 无配置
  }
  return undefined;
}

/**
 * 会话级配置:主会话读自身 branch(switch 固化,resume 恢复);
 * subagent 无独立会话配置,沿会话文件层级向上继承父会话
 * (子会话文件位于 `<父会话>.jsonl` 去后缀的目录内,见 omp 的
 * resolveBreadcrumbToInteractiveRoot),首个有配置的祖先生效。
 */
function readSessionLevel(ctx: UiCtx): string | undefined {
  const own = scanSessionEntries(ctx.sessionManager.getBranch());
  if (own !== undefined) return own;

  const file = ctx.sessionManager.getSessionFile?.();
  if (file) {
    let current = file;
    for (let depth = 0; depth < 8; depth++) {
      const parentFile = `${dirname(current)}.jsonl`;
      if (!existsSync(parentFile)) break;
      const value = scanSessionFile(parentFile);
      if (value !== undefined) return value;
      current = parentFile;
    }
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
