# 交互模式改造计划 —— 类似 Claude Code 的持续对话体验

## Context

当前项目的 CLI 是**"单次任务执行完即退出"**模式：用户输入任务描述 → Agent 执行 → 输出结果 → 进程退出。这与 Claude Code 的持续交互体验有显著差距。

用户希望获得类似 Claude Code 的体验：**持续对话循环、`/` 命令系统、步骤级实时输出、编辑前人工确认**。

---

## Requirements

1. **持续对话**：启动后保持运行，用户可连续输入多轮对话，上下文自动保持
2. **`/` 命令系统**：`/clear`, `/compact`, `/exit`, `/help`, `/status`, `/history`, `/model`
3. **步骤级实时输出**：通过事件系统，在 ReAct 循环的每个阶段实时显示进度
4. **编辑确认**：在执行 `file_write` 或涉及写入的 `shell` 命令前，暂停并提示用户确认
5. **兼容现有模式**：`ai-agent "任务描述"` 保持单次执行模式不变；`ai-agent` 或 `ai-agent -i` 进入交互模式

---

## Architecture

### 核心改造点

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 入口 (src/cli/index.ts)            │
│  ┌──────────────────┐          ┌──────────────────────┐      │
│  │ 单次任务模式     │          │ 交互模式 (-i/无参数) │      │
│  │ (保持现有行为)   │          │                      │      │
│  └────────┬─────────┘          │  InteractiveSession  │      │
│           │                    │  ┌────────────────┐  │      │
│           ▼                    │  │ readline 循环  │  │      │
│     Agent.runTask()            │  │ /命令解析器    │  │      │
│           │                    │  │ 事件渲染器     │  │      │
│           ▼                    │  └───────┬────────┘  │      │
│      ReActLoop.run()           │          │           │      │
│  (内部添加 user 消息)          │          ▼           │      │
│                                │  Agent.sendInteractiveMessage() │
└────────────────────────────────┘          │           └──────┘
                                            ▼
                              ┌─────────────────────────┐
                              │   ReActLoop.continue()   │
                              │  (不添加 user 消息，     │
                              │   复用现有 WorkingMemory) │
                              └─────────────────────────┘
```

---

## Implementation Plan

### Phase 1: ReActLoop 核心重构

**文件**: `src/core/ReActLoop.ts`

- **新增 `continue()` 方法**：与 `run()` 共享核心循环逻辑，但不添加新的用户消息（由调用者提前添加）。这是支持持续对话的关键。
- **重构 `run()` 方法**：在内部添加用户消息后，调用 `continue()` 执行实际循环。保持现有行为不变。
- **事件系统保持不变**：`iteration:start`, `think`, `act`, `execute`, `observe`, `complete`, `error` 等事件继续通过 `onEvent` 发出。

**关键代码模式**:
```typescript
// 新增方法
public async continue(
  sessionId: string,
  workingMemory: WorkingMemory
): Promise<ReActLoopResult> {
  // 与现有 run() 的核心循环相同，但跳过 "添加用户消息" 步骤
}

// 重构 run()
public async run(
  sessionId: string,
  workingMemory: WorkingMemory,
  taskDescription: string
): Promise<ReActLoopResult> {
  workingMemory.addUserMessage(taskDescription);
  return this.continue(sessionId, workingMemory);
}
```

---

### Phase 2: Agent 交互模式 API

**文件**: `src/core/Agent.ts`

- **新增私有字段** `interactiveContext`：持有当前交互会话的 `sessionId`、`WorkingMemory` 和 `isActive` 状态。
- **新增 `startInteractiveSession()`**：创建新会话（复用 `memorySystem.createSession`），初始化 `interactiveContext`。
- **新增 `sendInteractiveMessage(message)`**：
  1. 将消息添加到 `WorkingMemory`
  2. 调用 `reactLoop.continue()` 继续对话
  3. 返回 `ReActLoopResult`
- **新增 `endInteractiveSession()`**：结束交互会话，持久化历史，清理 `interactiveContext`。
- **新增 `clearInteractiveContext()`**：清空 `WorkingMemory` 中的消息（保留系统提示词），重置对话上下文。
- **新增事件类型** `interactive:message` 和 `interactive:response`：用于 CLI 层的事件驱动输出。

**状态管理**: 使用 `StateManager` 的现有状态机。交互模式下状态流转：`idle → initializing → running → ... → idle`（每轮消息后回到 `idle`，而非 `completed`）。

---

### Phase 3: 交互式 CLI 模块

**新增文件 1**: `src/cli/InteractiveSession.ts`

**职责**: 管理整个交互体验，是用户与 Agent 之间的桥梁。

**核心功能**:
- **readline 输入循环**：使用 Node.js `readline` 模块创建 `>` 提示符的输入循环
- **输入分类**：
  - 以 `/` 开头 → 解析为命令
  - 空输入 → 忽略
  - 其他 → 作为用户消息发送给 Agent
- **事件驱动的输出渲染**：
  - 订阅 Agent 的 `step` 事件
  - `iteration:start` → 显示 `▶ 正在思考...`
  - `think` → 显示思考内容（可配置是否隐藏思考过程）
  - `act` → 显示 `▶ 执行: <toolName>(<args>)`
  - `execute` → 显示执行结果摘要
  - `complete` → 显示最终结果
  - `error` → 显示错误信息
- **优雅退出**：处理 `SIGINT` (Ctrl+C)，保存会话后退出

**新增文件 2**: `src/cli/CommandRegistry.ts`

**职责**: 注册和管理所有 `/` 命令。

**命令列表**:

| 命令 | 功能 | 实现 |
|------|------|------|
| `/exit`, `/quit`, `/q` | 退出交互模式，保存会话 | 调用 `agent.endInteractiveSession()`，关闭 readline |
| `/clear` | 清空当前对话上下文 | 调用 `agent.clearInteractiveContext()` |
| `/compact` | 压缩对话历史 | 调用 LLM 生成摘要，替换历史消息（简化版） |
| `/help` | 显示可用命令列表 | 静态输出 |
| `/status` | 显示当前会话状态 | Token 使用、步骤数、会话ID |
| `/history` | 显示对话历史 | 从 WorkingMemory 读取 |
| `/model [id]` | 切换/查看当前模型 | 调用 `llmClient` 的模型选择 |
| `/tools` | 列出可用工具 | 调用 `agent.getTools()` |

---

### Phase 4: 编辑确认机制

**文件**: `src/security/PermissionManager.ts` 和 `src/tools/ToolExecutor.ts`

**设计**: 在 `ToolExecutor.execute()` 中，在执行前检查操作类型。如果是**修改性操作**，且 `enableHumanConfirm` 为 `true`，则暂停并提示用户确认。

**修改性操作定义**:
- `file_write` 工具（任何写入操作）
- `shell` 工具中涉及写入的命令（`>`, `>>`, `rm`, `mv`, `cp` 等）

**确认流程**:
1. `ToolExecutor` 检测操作类型
2. 调用 `PermissionManager.confirmAction(toolName, params)`
3. 使用 `inquirer` 显示确认提示：`"执行 file_write(path='src/index.ts')? [y/N]"`
4. 用户输入 `y` → 继续执行
5. 用户输入 `n` 或直接回车 → 返回拒绝结果（`success: false, error: '用户拒绝'`）

**配置**: 通过 `AgentConfig.enableHumanConfirm` 控制（默认为 `false`，CLI 交互模式自动设为 `true`）。

---

### Phase 5: CLI 入口改造

**文件**: `src/cli/index.ts`

**修改点**:
1. 添加 `-i, --interactive` 选项
2. 修改参数解析逻辑：
   - 无 `[task]` 参数且无 `-i` → **默认进入交互模式**（Claude Code 风格）
   - 有 `-i` 标志 → 进入交互模式
   - 有 `[task]` 参数 → 单次任务模式（保持现有行为）
3. 交互模式初始化流程：
   ```
   创建 Agent → 初始化 → 创建 InteractiveSession → start()
   ```
4. 单次任务模式保持不变（现有逻辑不动）

---

## Files to Modify / Create

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/core/ReActLoop.ts` | 新增 `continue()` 方法；重构 `run()` 调用 `continue()` |
| `src/core/Agent.ts` | 新增交互模式 API：`startInteractiveSession`, `sendInteractiveMessage`, `endInteractiveSession`, `clearInteractiveContext` |
| `src/cli/index.ts` | 修改入口逻辑，支持 `-i/--interactive`，无参数默认进入交互模式 |
| `src/tools/ToolExecutor.ts` | 集成编辑确认机制（修改性操作前暂停确认） |
| `src/security/PermissionManager.ts` | 新增 `confirmAction()` 方法，使用 inquirer 提示确认 |
| `src/types/index.ts` | 新增交互模式相关类型和事件类型 |

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/cli/InteractiveSession.ts` | 交互会话管理器：readline 循环、输入分类、事件渲染、优雅退出 |
| `src/cli/CommandRegistry.ts` | `/` 命令注册和处理器 |

---

## Verification Plan

### 自动化测试
1. 运行 `npm test` —— 确保 ReActLoop 重构不破坏现有测试
2. 运行 `npm run build` —— TypeScript 编译通过
3. 新增测试：
   - `ReActLoop.continue()` 的单元测试
   - `Agent` 交互模式 API 的测试
   - `CommandRegistry` 命令解析测试
   - `InteractiveSession` 输入处理测试
   - `PermissionManager.confirmAction()` 测试

### 手动测试
1. **入口测试**：
   - `ai-agent` → 进入交互模式
   - `ai-agent -i` → 进入交互模式
   - `ai-agent "帮我读取 package.json"` → 单次任务模式

2. **对话测试**：
   - 输入 `"你好"` → 获得响应
   - 继续输入 `"刚才我说了什么"` → 验证上下文保持

3. **命令测试**：
   - `/help` → 显示命令列表
   - `/status` → 显示 Token 使用状态
   - `/clear` → 清空后上下文丢失（验证）
   - `/exit` → 优雅退出

4. **编辑确认测试**：
   - 输入 `"写入一个文件"` → AI 调用 `file_write` → 暂停并提示确认 → 输入 `y` → 文件写入
   - 输入 `"删除文件"` → 暂停并提示 → 输入 `n` → 操作被拒绝

5. **单次模式回归测试**：
   - `ai-agent "帮我读取 README.md"` → 保持原有输出格式

---

## Risks & Mitigation

| 风险 | 缓解措施 |
|------|---------|
| ReActLoop 重构破坏现有单次任务模式 | `run()` 方法保持相同签名和行为，仅内部调用 `continue()` |
| 交互模式事件系统与现有事件冲突 | 新增事件类型，不影响现有 `session:start/end/step/error` |
| 编辑确认阻塞 ReAct 循环 | 确认是异步的，拒绝时返回错误结果让循环继续处理 |
| readline 在 Windows 下的兼容性问题 | 使用 Node.js 内置 `readline`，已跨平台兼容 |
| Token 使用过多导致上下文丢失 | 利用现有 `WorkingMemory` 的裁剪策略，交互模式下可配置更大的 `maxTokens` |

---

## Estimated Effort

| Phase | 文件数 | 复杂度 | 预估时间 |
|-------|--------|--------|----------|
| Phase 1: ReActLoop 重构 | 1 | 中 | 30 min |
| Phase 2: Agent 交互 API | 1 | 中 | 30 min |
| Phase 3: 交互 CLI 模块 | 2 | 高 | 60 min |
| Phase 4: 编辑确认 | 2 | 中 | 30 min |
| Phase 5: CLI 入口改造 | 1 | 低 | 15 min |
| Phase 6: 测试 | 1+ | 中 | 45 min |
| **总计** | **8+** | | **~3.5h** |
