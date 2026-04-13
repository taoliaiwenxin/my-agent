# AI Agent Core - 开发工作计划

## 说明

- 每完成一项开发任务后，**必须先测试，测试通过后标记完成**
- 使用 `[-]` 表示未开始，`[>]` 表示进行中，`[x]` 表示已完成（含测试）
- 测试不通过不得标记完成，需修复后重新测试

---

## Phase 1: MVP (核心功能)

### 任务组 1: 项目初始化与环境搭建

#### 1.1 初始化项目结构
**开发内容:**
- 创建 package.json
- 配置 TypeScript (tsconfig.json)
- 配置开发环境 (nodemon/ts-node)
- 安装核心依赖: sqlite3, @anthropic-ai/sdk, yaml, dotenv

**测试内容:**
- [ ] 运行 `npm install` 无错误
- [ ] 运行 `npx tsc --noEmit` 无类型错误
- [ ] 运行 `npm run dev` 能正常启动

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 1.2 配置管理
**开发内容:**
- 创建 config/default.yaml 配置文件
- 实现配置加载器 (src/config/ConfigLoader.ts)
- 支持环境变量覆盖

**测试内容:**
- [ ] 能正确加载默认配置
- [ ] 环境变量能覆盖默认配置
- [ ] 配置项类型正确，有默认值

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 1.3 类型定义
**开发内容:**
- 创建 src/types/index.ts
- 定义核心接口: AgentAction, Observation, Step, TaskPlan
- 定义工具接口: Tool, ToolRegistry
- 定义记忆接口: Memory, MemoryEntry

**测试内容:**
- [ ] 类型定义能通过 TypeScript 编译
- [ ] 编写类型测试文件，验证接口兼容性

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 2: 数据库层 (SQLite)

#### 2.1 SQLite 客户端封装
**开发内容:**
- 创建 src/memory/SQLiteClient.ts
- 封装数据库连接和基础 CRUD 操作
- 实现数据库初始化（自动建表）
- 实现连接池管理

**测试内容:**
- [ ] 能成功创建数据库文件
- [ ] 能成功创建所有表结构
- [ ] 能执行基础 CRUD 操作
- [ ] 并发访问不报错
- [ ] 测试文件: tests/memory/SQLiteClient.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 2.2 Sessions 表操作
**开发内容:**
- 实现会话创建
- 实现会话状态更新
- 实现会话查询

**测试内容:**
- [ ] 能创建新会话并返回 session_id
- [ ] 能正确更新会话状态
- [ ] 能查询会话历史
- [ ] 测试文件: tests/memory/Sessions.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 2.3 Steps 表操作
**开发内容:**
- 实现步骤记录插入
- 实现步骤状态更新
- 实现查询最后执行步骤（用于崩溃恢复）
- 实现查询完整执行历史

**测试内容:**
- [ ] 能插入步骤记录
- [ ] 能更新步骤状态
- [ ] 能正确查询最后一步
- [ ] 能查询完整历史
- [ ] 测试文件: tests/memory/Steps.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 3: 记忆系统基础

#### 3.1 Working Memory (工作记忆)
**开发内容:**
- 创建 src/memory/WorkingMemory.ts
- 实现对话历史管理
- 实现 Token 计数
- 实现自动裁剪策略（保留最近 N 轮）

**测试内容:**
- [ ] 能添加消息到工作记忆
- [ ] Token 计数准确
- [ ] 超过限制时正确裁剪
- [ ] 测试文件: tests/memory/WorkingMemory.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 3.2 Memory System 整合
**开发内容:**
- 创建 src/memory/MemorySystem.ts
- 整合 WorkingMemory 和 SQLite 存储
- 实现会话开始/结束的内存加载/保存

**测试内容:**
- [ ] 会话开始时能加载历史
- [ ] 会话结束时能保存到数据库
- [ ] 崩溃后能恢复到正确状态
- [ ] 测试文件: tests/memory/MemorySystem.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 4: 工具系统

#### 4.1 工具注册表
**开发内容:**
- 创建 src/tools/ToolRegistry.ts
- 实现工具注册机制
- 实现工具查询（按名称）
- 实现工具列表获取（用于 LLM Prompt）

**测试内容:**
- [ ] 能注册工具
- [ ] 能通过名称查询工具
- [ ] 重复注册时正确处理
- [ ] 测试文件: tests/tools/ToolRegistry.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 4.2 FileReadTool (读取文件)
**开发内容:**
- 创建 src/tools/implementations/FileReadTool.ts
- 实现文件读取功能
- 添加文件大小限制（防止读取过大文件）
- 添加路径安全检查（必须在允许目录内）

**测试内容:**
- [ ] 能读取存在的文件
- [ ] 读取不存在的文件返回正确错误
- [ ] 超过大小限制时拒绝
- [ ] 越权路径访问被拒绝
- [ ] 测试文件: tests/tools/FileReadTool.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 4.3 FileWriteTool (写入文件)
**开发内容:**
- 创建 src/tools/implementations/FileWriteTool.ts
- 实现文件写入功能（支持创建目录）
- 添加备份机制（写入前备份原文件）
- 添加路径安全检查

**测试内容:**
- [ ] 能写入新文件
- [ ] 能覆盖已有文件并备份
- [ ] 自动创建不存在的目录
- [ ] 越权路径访问被拒绝
- [ ] 测试文件: tests/tools/FileWriteTool.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 4.4 ShellTool (执行命令)
**开发内容:**
- 创建 src/tools/implementations/ShellTool.ts
- 实现命令执行功能
- 添加超时控制（默认30秒）
- 添加危险命令检查（黑名单）
- 添加执行结果大小限制

**测试内容:**
- [ ] 能执行简单命令（如 `echo hello`）
- [ ] 能获取 exit code
- [ ] 超时时正确中断
- [ ] 危险命令被拒绝执行
- [ ] 测试文件: tests/tools/ShellTool.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 4.5 TerminateTool (终止任务)
**开发内容:**
- 创建 src/tools/implementations/TerminateTool.ts
- 实现任务结束信号
- 支持成功/失败两种终止状态
- 支持返回最终结果

**测试内容:**
- [ ] 能正确发出终止信号
- [ ] 能携带成功状态
- [ ] 能携带失败状态和原因
- [ ] 测试文件: tests/tools/TerminateTool.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 4.6 工具执行器
**开发内容:**
- 创建 src/tools/ToolExecutor.ts
- 实现工具调用分发
- 实现执行日志记录（保存到 SQLite）
- 实现执行时间统计

**测试内容:**
- [ ] 能正确调用对应工具
- [ ] 工具不存在时返回正确错误
- [ ] 执行记录能保存到数据库
- [ ] 测试文件: tests/tools/ToolExecutor.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 5: LLM 集成与模型管理

> **设计参考**: [docs/MODEL_MANAGEMENT.md](./docs/MODEL_MANAGEMENT.md)

#### 5.1a Provider 接口设计
**开发内容:**
- 创建 `src/llm/providers/LLMProvider.ts`
- 定义统一接口: `chat()`, `chatStream()`, `calculateCost()`, `healthCheck()`
- 定义类型: `Message`, `ChatOptions`, `ChatResponse`, `ModelCapabilities`
- 定义 Provider 工厂函数类型

**测试内容:**
- [ ] 类型定义能通过 TypeScript 编译
- [ ] 接口设计满足多模型需求
- [ ] 测试文件: `tests/llm/providers/LLMProvider.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.1b ModelRegistry 实现
**开发内容:**
- 创建 `src/llm/ModelRegistry.ts`
- 实现 Provider 工厂注册机制
- 实现 Provider 实例的添加、移除、查询
- 实现默认 Provider 管理

**测试内容:**
- [ ] 能注册 Provider 工厂
- [ ] 能通过工厂创建 Provider 实例
- [ ] 能添加/移除 Provider
- [ ] 能获取默认 Provider
- [ ] 测试文件: `tests/llm/ModelRegistry.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.1c 数据库表设计 (模型配置)
**开发内容:**
- 创建 `model_providers` 表 (见 MODEL_MANAGEMENT.md)
- 创建 `model_usage_logs` 表
- 更新 `SQLiteClient.ts` 初始化逻辑

**测试内容:**
- [ ] 表结构创建正确
- [ ] 能插入/查询模型配置
- [ ] API Key 加密存储
- [ ] 测试文件: `tests/memory/ModelTables.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.1d Anthropic Provider 实现
**开发内容:**
- 创建 `src/llm/providers/AnthropicProvider.ts`
- 实现 `chat()` 和 `chatStream()` 方法
- 实现成本计算 (按官方定价)
- 实现健康检查

**测试内容:**
- [ ] 能成功调用 Claude API (需有效 API Key)
- [ ] 流式输出正常
- [ ] 成本计算准确
- [ ] 健康检查返回正确结果
- [ ] 测试文件: `tests/llm/providers/AnthropicProvider.test.ts` (使用 mock)

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.1e LLMClient 统一接口
**开发内容:**
- 创建 `src/llm/LLMClient.ts`
- 整合 ModelRegistry
- 实现故障切换逻辑 (fallback)
- 实现 Token 使用记录

**测试内容:**
- [ ] 能通过统一接口调用模型
- [ ] 故障时正确切换到备用模型
- [ ] Token 使用量记录到数据库
- [ ] 测试文件: `tests/llm/LLMClient.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.2 Prompt 模板
**开发内容:**
- 创建 `src/llm/prompts/react.ts` (ReAct Prompt)
- 创建 `src/llm/prompts/planning.ts` (规划 Prompt)
- 实现 Prompt 变量替换
- 支持不同模型的 Prompt 微调

**测试内容:**
- [ ] Prompt 模板渲染正确
- [ ] 变量替换无错误
- [ ] 渲染后的 Prompt 格式正确
- [ ] 测试文件: `tests/llm/prompts.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.3a (Phase 2) ModelSelector 模型选择器
**开发内容:**
- 创建 `src/llm/ModelSelector.ts`
- 实现选择策略: `default`, `cost`, `quality`, `speed`, `task_based`
- 实现基于任务类型的智能选择

**测试内容:**
- [ ] 各策略能正确选择模型
- [ ] 历史使用数据影响选择结果
- [ ] 测试文件: `tests/llm/ModelSelector.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.3b (Phase 2) OpenAI Provider
**开发内容:**
- 创建 `src/llm/providers/OpenAIProvider.ts`
- 实现 OpenAI API 调用
- 注册到 Provider 工厂

**测试内容:**
- [ ] 能成功调用 OpenAI API
- [ ] 成本计算准确
- [ ] 测试文件: `tests/llm/providers/OpenAIProvider.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 5.3c (Phase 2) 模型管理 CLI
**开发内容:**
- 创建 `src/cli/commands/models.ts`
- 实现 `models list`, `add`, `remove`, `set-default`, `test` 命令
- 实现交互式添加模型

**测试内容:**
- [ ] 各命令能正确执行
- [ ] 交互式添加流程正常
- [ ] 配置正确保存到数据库
- [ ] 测试文件: `tests/cli/models.test.ts`

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 6: ReAct 核心循环

#### 6.1 ReAct Loop 实现
**开发内容:**
- 创建 src/core/ReActLoop.ts
- 实现 THINK → ACT → EXECUTE → OBSERVE → VERIFY → REFLECT 循环
- 实现最大迭代次数限制
- 实现超时检测

**测试内容:**
- [ ] 单步循环能正确执行
- [ ] 多步循环能正确执行
- [ ] 达到最大迭代次数时停止
- [ ] 超时时正确中断
- [ ] 测试文件: tests/core/ReActLoop.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 6.2 Thought Parser (思考解析)
**开发内容:**
- 实现 LLM 输出解析
- 提取 Thought 内容
- 提取 Action (工具调用) 内容
- 处理解析错误

**测试内容:**
- [ ] 能正确解析标准格式输出
- [ ] 能处理格式不完整的输出
- [ ] 解析失败时返回友好错误
- [ ] 测试文件: tests/core/ThoughtParser.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 6.3 Observation Generator (观察生成)
**开发内容:**
- 实现工具结果处理
- 生成 Observation 对象
- 处理成功/失败/异常三种情况

**测试内容:**
- [ ] 成功结果正确生成 Observation
- [ ] 失败结果正确生成 Observation
- [ ] 异常正确捕获并记录
- [ ] 测试文件: tests/core/ObservationGenerator.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 7: 规划器

#### 7.1 Task Graph (任务图)
**开发内容:**
- 创建 src/planner/TaskGraph.ts
- 实现 DAG 结构
- 实现步骤依赖管理
- 实现当前可执行步骤查询

**测试内容:**
- [ ] 能创建任务图
- [ ] 能添加步骤和依赖
- [ ] 能正确获取当前可执行步骤
- [ ] 检测循环依赖
- [ ] 测试文件: tests/planner/TaskGraph.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 7.2 Planner (初始规划)
**开发内容:**
- 创建 src/planner/Planner.ts
- 实现任务理解
- 生成初始执行计划
- 支持简单线性计划（Phase 1）

**测试内容:**
- [ ] 输入任务能生成计划
- [ ] 计划包含合理步骤
- [ ] 计划能被 TaskGraph 正确加载
- [ ] 测试文件: tests/planner/Planner.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 8: Agent 主控制器

#### 8.1 Agent Core
**开发内容:**
- 创建 src/core/Agent.ts
- 整合所有模块（LLM、工具、记忆、规划器）
- 实现任务执行入口
- 实现执行状态管理

**测试内容:**
- [ ] 能执行简单任务（如读取文件）
- [ ] 能执行多步骤任务
- [ ] 错误时正确停止并报告
- [ ] 测试文件: tests/core/Agent.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 8.2 State Manager (状态管理)
**开发内容:**
- 创建 src/core/StateManager.ts
- 管理 Agent 执行状态
- 支持状态持久化（用于崩溃恢复）
- 支持状态查询

**测试内容:**
- [ ] 状态转换正确
- [ ] 状态能保存到数据库
- [ ] 状态能从数据库恢复
- [ ] 测试文件: tests/core/StateManager.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 9: 安全层

#### 9.1 安全策略
**开发内容:**
- 创建 src/security/SecurityPolicy.ts
- 实现路径检查（是否在白名单内）
- 实现权限检查（读/写/执行）
- 实现危险命令检测

**测试内容:**
- [ ] 白名单路径检查正确
- [ ] 权限分级检查正确
- [ ] 危险命令能正确识别
- [ ] 测试文件: tests/security/SecurityPolicy.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 9.2 权限管理器
**开发内容:**
- 创建 src/security/PermissionManager.ts
- 整合路径检查和权限检查
- 提供统一的权限验证接口

**测试内容:**
- [ ] 统一接口能正确授权/拒绝
- [ ] 拒绝时返回正确错误信息
- [ ] 测试文件: tests/security/PermissionManager.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 10: 命令行入口

#### 10.1 CLI 入口
**开发内容:**
- 创建 src/cli.ts
- 实现命令行参数解析
- 实现交互式输入
- 实现结果输出格式化

**测试内容:**
- [ ] 能正确解析参数
- [ ] 能启动交互模式
- [ ] 任务结果正确显示
- [ ] 测试文件: tests/cli.test.ts

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

#### 10.2 示例脚本
**开发内容:**
- 创建 examples/ 目录
- 提供简单示例（读取文件、写入文件、执行命令）

**测试内容:**
- [ ] 示例能正常运行
- [ ] 示例输出符合预期

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

### 任务组 11: 集成测试

#### 11.1 端到端测试
**开发内容:**
- 创建 tests/integration/ 目录
- 测试完整任务流程
- 测试崩溃恢复

**测试场景:**
- [ ] 场景1: 读取一个文件并总结内容
- [ ] 场景2: 创建一个新文件
- [ ] 场景3: 执行命令并获取结果
- [ ] 场景4: 多步骤任务（读取→处理→写入）
- [ ] 场景5: 崩溃后恢复继续执行

**状态:** `[-]` 未开始 | `[>]` 进行中 | `[x]` 已完成

---

## 开发顺序建议

按照依赖关系，建议按以下顺序开发：

```
1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 5.1a → 5.1b → 5.1c → 5.1d → 5.1e → 5.2 → 9.1 → 9.2 → 6.2 → 6.3 → 6.1 → 7.1 → 7.2 → 8.2 → 8.1 → 10.1 → 10.2 → 11.1
```

**Phase 2 任务**: 5.3a, 5.3b, 5.3c (模型选择器、OpenAI Provider、CLI 命令)

---

## 进度追踪

### 总体进度

| 任务组 | 总任务数 | 已完成 | 进度 |
|--------|---------|--------|------|
| 1. 项目初始化 | 3 | 0 | 0% |
| 2. 数据库层 | 3 | 0 | 0% |
| 3. 记忆系统 | 2 | 0 | 0% |
| 4. 工具系统 | 6 | 0 | 0% |
| 5. LLM 集成与模型管理 | 8 (5+3) | 0 | 0% |
| 6. ReAct 循环 | 3 | 0 | 0% |
| 7. 规划器 | 2 | 0 | 0% |
| 8. Agent 主控 | 2 | 0 | 0% |
| 9. 安全层 | 2 | 0 | 0% |
| 10. CLI 入口 | 2 | 0 | 0% |
| 11. 集成测试 | 1 | 0 | 0% |
| **总计** | **32** | **0** | **0%** |

### Phase 1 (MVP) 任务清单

| # | 任务 | 状态 | 完成日期 |
|---|------|------|----------|
| 1.1 | 初始化项目结构 | `[-]` | - |
| 1.2 | 配置管理 | `[-]` | - |
| 1.3 | 类型定义 | `[-]` | - |
| 2.1 | SQLite 客户端封装 | `[-]` | - |
| 2.2 | Sessions 表操作 | `[-]` | - |
| 2.3 | Steps 表操作 | `[-]` | - |
| 3.1 | Working Memory | `[-]` | - |
| 3.2 | Memory System 整合 | `[-]` | - |
| 4.1 | 工具注册表 | `[-]` | - |
| 4.2 | FileReadTool | `[-]` | - |
| 4.3 | FileWriteTool | `[-]` | - |
| 4.4 | ShellTool | `[-]` | - |
| 4.5 | TerminateTool | `[-]` | - |
| 4.6 | 工具执行器 | `[-]` | - |
| 5.1a | Provider 接口设计 | `[-]` | - |
| 5.1b | ModelRegistry 实现 | `[-]` | - |
| 5.1c | 数据库表设计 (模型配置) | `[-]` | - |
| 5.1d | Anthropic Provider 实现 | `[-]` | - |
| 5.1e | LLMClient 统一接口 | `[-]` | - |
| 5.2 | Prompt 模板 | `[-]` | - |
| 9.1 | 安全策略 | `[-]` | - |
| 9.2 | 权限管理器 | `[-]` | - |
| 6.1 | ReAct Loop 实现 | `[-]` | - |
| 6.2 | Thought Parser | `[-]` | - |
| 6.3 | Observation Generator | `[-]` | - |
| 7.1 | Task Graph | `[-]` | - |
| 7.2 | Planner | `[-]` | - |
| 8.1 | Agent Core | `[-]` | - |
| 8.2 | State Manager | `[-]` | - |
| 10.1 | CLI 入口 | `[-]` | - |
| 10.2 | 示例脚本 | `[-]` | - |
| 11.1 | 端到端测试 | `[-]` | - |

---

## 测试规范

### 单元测试要求

1. **每个模块必须有对应的测试文件**
   - 路径: `tests/{模块路径}/{模块名}.test.ts`
   - 示例: `src/memory/SQLiteClient.ts` → `tests/memory/SQLiteClient.test.ts`

2. **测试覆盖率要求**
   - 核心逻辑: > 80%
   - 工具实现: > 90%
   - 安全相关: 100%

3. **测试运行命令**
   ```bash
   npm test              # 运行所有测试
   npm test -- --watch  # 监视模式
   npm test -- --coverage # 生成覆盖率报告
   ```

### 测试通过标准

- [ ] 所有测试用例通过
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 错误
- [ ] 代码审查通过（自我审查）

### 标记完成规范

完成任务后，在对应任务的状态处标记 `[x]`，并填写完成日期：

```markdown
**状态:** `[x]` 已完成 (2026-04-13)
```

---

*文档版本: 1.1*
*创建日期: 2026-04-13*
*最后更新: 2026-04-13*
