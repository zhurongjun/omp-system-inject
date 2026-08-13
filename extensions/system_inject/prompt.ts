// 系统提示词处理:切除默认 prompt 的角色成分,让注入内容独占角色定义。

/** 角色章节起点标记:兼容旧格式 ROLE 与新格式 § Role / # Role。 */
const ROLE_START = /^(?:ROLE|§\s*Role|#\s*Role)\s*$/;

/** 角色章节结束标记:兼容旧格式 RUNTIME 与新格式 § Runtime / # Runtime。 */
const RUNTIME_END = /^(?:RUNTIME|§\s*Runtime|#\s*Runtime)\s*$/;

/**
 * 删除默认 prompt 的角色章节(ROLE → RUNTIME / § Role → § Runtime 之间的整段)。
 * 只切角色定义区;终点缺失时安全失败,不做任何切除,避免误伤其余段落。
 */
export function stripRoleSection(prompt: string): string {
  const lines = prompt.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ROLE_START.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return prompt;
  for (let i = start + 1; i < lines.length; i++) {
    if (RUNTIME_END.test(lines[i])) {
      return [...lines.slice(0, start), ...lines.slice(i)].join("\n");
    }
  }
  return prompt; // 找不到终点:安全失败,不切除
}

/** 删除默认 prompt 的 <personality>…</personality> 块。 */
export function stripPersonality(prompt: string): string {
  const start = prompt.search(/<personality>/);
  if (start === -1) return prompt;
  const end = prompt.indexOf("</personality>", start);
  if (end === -1) return prompt;
  return prompt.slice(0, start) + prompt.slice(end + "</personality>".length);
}
