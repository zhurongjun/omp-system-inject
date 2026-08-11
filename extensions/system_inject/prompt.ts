// 系统提示词处理:切除默认 prompt 的角色成分,让注入内容独占角色定义。

/** 删除默认 prompt 的 ROLE 章节(ROLE → RUNTIME 之间的整段)。 */
export function stripRoleSection(prompt: string): string {
  const lines = prompt.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && /^ROLE\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^RUNTIME\s*$/.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

/** 删除默认 prompt 的 <personality>…</personality> 块。 */
export function stripPersonality(prompt: string): string {
  const start = prompt.search(/<personality>/);
  if (start === -1) return prompt;
  const end = prompt.indexOf("</personality>", start);
  if (end === -1) return prompt;
  return prompt.slice(0, start) + prompt.slice(end + "</personality>".length);
}
