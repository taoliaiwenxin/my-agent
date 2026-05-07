# 交互模式改造 — 任务跟踪

## 计划
基于 `tasks/plan-interactive-mode.md`，将 CLI 改造为类似 Claude Code 的持续对话体验。

## 进度

### Phase 1: ReActLoop 核心重构
- [x] 读取现有 ReActLoop.ts 代码
- [x] 新增 `continue()` 方法（共享核心循环，不添加用户消息）
- [x] 重构 `run()` 方法（内部添加用户消息后调用 `continue()`）
- [x] 运行现有测试确保不破坏 (13/13 通过)

### Phase 2: Agent 交互模式 API
- [x] 读取现有 Agent.ts 代码
- [x] 新增私有字段 `interactiveContext`
- [x] 新增 `startInteractiveSession()`
- [x] 新增 `sendInteractiveMessage(message)`
- [x] 新增 `endInteractiveSession()`
- [x] 新增 `clearInteractiveContext()`
- [x] 新增事件类型 `interactive:message` / `interactive:response`

### Phase 3: 交互式 CLI 模块
- [x] 新建 `src/cli/InteractiveSession.ts`
- [x] 新建 `src/cli/CommandRegistry.ts`
- [x] 实现 readline 输入循环和事件渲染
- [x] 修改 CLI 入口支持 `-i/--interactive`
- [x] 无参数默认进入交互模式

### Phase 4: 编辑确认机制
- [x] 读取现有 ToolExecutor.ts 和 PermissionManager.ts
- [x] 新增 `PermissionManager.confirmAction()`
- [x] 在 ToolExecutor 中集成修改性操作检测和确认
- [x] 交互模式下自动启用 `enableHumanConfirm`

### Phase 5: CLI 入口改造
- [x] 修改 `src/cli/index.ts`
- [x] 添加 `-i, --interactive` 选项
- [x] 无参数默认进入交互模式
- [x] 有 `[task]` 参数保持单次模式

### Phase 6: 测试与验证
- [x] ReActLoop.continue() 单元测试（已有）
- [x] Agent 交互模式 API 测试（7 项）
- [x] CommandRegistry 命令解析测试（11 项）
- [x] PermissionManager.confirmAction() 测试（4 项）
- [x] ToolExecutor 编辑确认测试（8 项）
- [x] 手动验证所有入口和命令
- [x] 单次模式回归测试
- [x] npm run build 通过
- [x] 全部测试通过

## 审查

