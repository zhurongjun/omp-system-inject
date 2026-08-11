// 版本扫描:工程 <cwd>/.omp/system_inject/ 优先,用户 ~/.omp/agent/system_inject/ 兜底。
// 每个 .md = 一个提示词版本(frontmatter: name/description/status)。
// 文件名与 frontmatter name 均不允许为 "off"(保留给关闭状态)。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import type { InjectVersion } from "./types";

interface Frontmatter {
  name: string;
  description: string;
  status: string;
  body: string;
}

function parseFrontmatter(md: string, fallbackName: string): Frontmatter {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { name: fallbackName, description: "", status: "", body: md };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  return {
    name: meta.name || fallbackName,
    description: meta.description ?? "",
    status: meta.status ?? "",
    body: md.slice(m[0].length),
  };
}

/** 扫描两个 system_inject 目录,合并去重(工程优先),按 name 排序。 */
export function scanVersions(cwd: string): InjectVersion[] {
  const userAgent = process.env.PI_CODING_AGENT_DIR
    ? process.env.PI_CODING_AGENT_DIR
    : join(homedir(), ".omp", "agent");
  const dirs = [join(cwd, ".omp", "system_inject"), join(userAgent, "system_inject")];
  const seen = new Set<string>();
  const versions: InjectVersion[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      const file = join(dir, f);
      try {
        const { name, description, status, body } = parseFrontmatter(readFileSync(file, "utf8"), basename(f, ".md"));
        if (name === "off" || seen.has(name)) continue; // 保留名 off;工程优先,同 name 用户级跳过
        seen.add(name);
        versions.push({ name, description, status, body, file });
      } catch {
        // 单个版本文件读取失败不影响其他版本
      }
    }
  }
  return versions.sort((a, b) => a.name.localeCompare(b.name));
}

/** 按名解析版本;不存在返回 null。 */
export function resolveVersion(cwd: string, name: string): InjectVersion | null {
  return scanVersions(cwd).find((v) => v.name === name) ?? null;
}
