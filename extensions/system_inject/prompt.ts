// 系统提示词处理:切除默认 prompt 的角色成分,让注入内容独占角色定义。

/**
 * 标题行匹配。
 * - 带前导(§ / # 系列):标题文本放宽字符集,容纳 & : ( ) / 等常见标题符号
 * - 无前导:严格字母数字,仅兼容旧格式 ROLE 类纯标题行
 */
const HEADING_WITH_PREFIX = /^(§\s*|#{1,6}\s*)(.+)$/;
const HEADING_BARE = /^([A-Za-z][A-Za-z0-9 _\-]*)$/;

/** 提取行的前导模式(§ / # 系列 / 空)。 */
function headingPrefix(line: string): string {
  return line.match(/^(§\s*|#{1,6}\s*)/)?.[1] ?? "";
}

/**
 * 角色段起点判定:标题行且标题含 role 关键词(不区分大小写)。
 * 排除 model 相关标题(如 "# Model roles"),避免误判。
 */
function isRoleHeading(line: string): boolean {
  const withPrefix = HEADING_WITH_PREFIX.exec(line);
  let title: string | undefined;
  if (withPrefix) title = withPrefix[2];
  else {
    const bare = HEADING_BARE.exec(line);
    if (bare) title = bare[1];
  }
  if (title === undefined) return false;
  return /\brole\b/i.test(title) && !/\bmodel\b/i.test(title);
}

/**
 * 找下一个同级别段落边界:与起点同前导模式的标题行。
 * - 起点前导为 §  → 找下一个 § 标题(章节边界)
 * - 起点前导为 #  → 找下一个 § 或 # 标题(章节/子节边界)
 * - 起点无前导    → 旧格式兜底:找 RUNTIME 标题行
 * 找不到返回 -1(调用方安全失败)。
 */
function findNextHeading(lines: string[], from: number, prefix: string): number {
  if (prefix.startsWith("§")) {
    for (let i = from; i < lines.length; i++) if (/^§\s*/.test(lines[i])) return i;
    return -1;
  }
  if (prefix.startsWith("#")) {
    for (let i = from; i < lines.length; i++) {
      if (/^§\s*/.test(lines[i]) || /^#{1,6}\s*/.test(lines[i])) return i;
    }
    return -1;
  }
  // 无前导:旧格式 ROLE → RUNTIME
  for (let i = from; i < lines.length; i++) if (/^RUNTIME\s*$/.test(lines[i])) return i;
  return -1;
}

/**
 * 定位角色段落区间:返回 [起点行号, 终点行号),终点行(下一段落标题)保留。
 * 起点或段落边界缺失时返回 null(调用方安全失败)。
 */
function findRoleSection(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  let prefix = "";
  for (let i = 0; i < lines.length; i++) {
    if (isRoleHeading(lines[i])) {
      start = i;
      prefix = headingPrefix(lines[i]);
      break;
    }
  }
  if (start === -1) return null;
  const end = findNextHeading(lines, start + 1, prefix);
  if (end === -1) return null;
  return { start, end };
}

/**
 * 删除默认 prompt 的角色段落(段落识别法)。
 * 用 role 关键词定位段落起点,记住该段落的前导模式,删除至下一个同级别前导标题。
 * 起点或段落边界缺失时安全失败,不做任何切除。
 */
export function stripRoleSection(prompt: string): string {
  const lines = prompt.split("\n");
  const section = findRoleSection(lines);
  if (!section) return prompt;
  return [...lines.slice(0, section.start), ...lines.slice(section.end)].join("\n");
}

/**
 * 提取将被切除的角色段落文本(与 stripRoleSection 同一识别逻辑)。
 * 未命中返回 null,供调用方输出调试日志。
 */
export function extractRoleSection(prompt: string): string | null {
  const lines = prompt.split("\n");
  const section = findRoleSection(lines);
  if (!section) return null;
  return lines.slice(section.start, section.end).join("\n");
}

/** 删除默认 prompt 的 <personality>…</personality> 块。 */
export function stripPersonality(prompt: string): string {
  const start = prompt.search(/<personality>/);
  if (start === -1) return prompt;
  const end = prompt.indexOf("</personality>", start);
  if (end === -1) return prompt;
  return prompt.slice(0, start) + prompt.slice(end + "</personality>".length);
}
