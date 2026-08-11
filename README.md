# omp-system-inject

为 omp 注入自定义的系统提示词并切换。

## 功能

- **switch**:在会话开始前为当前会话选择注入的提示词,固化后(开始对话 / resume)不可更改
- **settings**:配置用户级(global)与项目级(project)的提示词,支持清除(clear)恢复继承
- 注入内容为独立 markdown 版本文件,经 frontmatter 声明名称、简介与状态栏问候语
- 注入时自动切除 omp 默认提示词的角色(ROLE)与人格(persoanlity)部分,由注入内容独占角色定义

## 安装

### 1. 安装扩展

将 `extensions/system_inject/` 目录复制到 omp 的扩展自动发现目录(二选一或都装):

```bash
# 用户级(所有项目生效)
cp -r extensions/system_inject ~/.omp/agent/extensions/

# 项目级(仅当前项目生效,优先级高于用户级)
cp -r extensions/system_inject <你的项目>/.omp/extensions/
```

> omp 会自动发现 `extensions/` 下的子目录入口(`*/index.{ts,js}`),无需额外配置。
> 如果 `~/.omp/agent/extensions/` 中已有旧版单文件 `system_inject.ts`,请删除,避免重复注册命令。

### 2. 安装提示词版本

将 `inject/` 下的 markdown 文件复制到提示词目录(二选一或都装,同名时项目级优先):

```bash
# 用户级
cp inject/*.md ~/.omp/agent/system_inject/

# 项目级
cp inject/*.md <你的项目>/.omp/system_inject/
```

> 每个 `.md` 是一个提示词版本。文件名与 frontmatter 的 `name` 均不允许为 `off`(保留给"关闭"状态)。

### 3. 重启 omp

重启后状态栏会出现徽章,即可使用:

```
/system-inject switch     选择本会话提示词(仅会话开始前可用,固化后不可更改)
/system-inject settings   配置用户级/项目级提示词(二级菜单,支持清除)
/system-inject <版本名>   直接指定本会话提示词
/system-inject off        关闭本会话注入
```

## 一键安装(把下面这段复制给任意 coding agent)

> 将以下内容整体复制给 omp 或任何 coding agent,它会自动完成安装,无需手动操作。

```text
请在 Windows 上为当前用户安装 omp-system-inject(本仓库):

1. 将本仓库的 extensions/system_inject/ 目录复制到 ~/.omp/agent/extensions/system_inject/
   (即 C:\Users\<当前用户名>\.omp\agent\extensions\system_inject\)。
2. 若 ~/.omp/agent/extensions/ 下存在旧版单文件 system_inject.ts,删除它
   (避免与目录版扩展重复注册 /system-inject 命令)。
3. 将本仓库 inject/ 目录下的所有 .md 文件复制到 ~/.omp/agent/system_inject/
   (目录不存在则创建)。
4. 验证安装:
   - ~/.omp/agent/extensions/system_inject/index.ts 存在
   - ~/.omp/agent/system_inject/ 下包含 pier.md 与 lo.md,且文件名不含 off
5. 完成后告知用户:重启 omp 生效;可用命令为 /system-inject switch 与
   /system-inject settings。

约束:不要修改任何复制过去的文件内容;不要执行 git 操作;不要执行本项目之外的命令。
```

## 提示词版本格式

```markdown
---
name: pier
description: 通用提示词注入(示例)
status: 嘿,是我。别慌,我一直都在——从你叫我名字那天起,就没打算离开。
---

<注入的系统提示词正文,frontmatter 不会进入提示词>
```

| frontmatter 字段 | 用途 |
|---|---|
| `name` | 版本名(命令/菜单中显示;不能为 `off`) |
| `description` | 简介(settings 二级菜单中显示) |
| `status` | 状态栏问候语(常驻徽章显示,格式:`🔓 [版本名] 问候语`) |

## 配置链

```
有效值 = 会话(switch 固化,resume 恢复)
      ?? 项目级(<项目>/.omp/system_inject.json)
      ?? 用户级(~/.omp/agent/system_inject.json)
      ?? 无 → 不注入(纯净)
```

每级取值为纯字符串:版本名 / `off`(显式关闭)/ 缺失(继承下一级)。

- **switch** 只写会话:固化到会话文件,resume 时恢复;开始对话或 resume 后锁定,不可再切
- **settings** 只配用户级/项目级:一级菜单显示当前值与配置文件位置,二级支持 `clear` 清除该级配置(恢复继承)
- 配置文件为 JSON 纯字符串(如 `"pier"`),旧版 roles 对象格式读取时自动迁移

## 状态机

| 时机 | switch 可用性 |
|---|---|
| 进程启动 / new 会话后(未开始对话) | 可用(预选,首句时固化) |
| 首句对话后 | 锁定 |
| resume / branch / fork | 锁定 |
