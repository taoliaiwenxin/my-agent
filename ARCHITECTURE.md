# AI Agent Core - 架构设计文档

## 项目概述

一个具备完整六大核心功能的 AI Agent 实现：自主性、感知能力、推理与规划、行动能力、记忆能力、反馈闭环。

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         安全层 (Security)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ 权限分级     │  │ 路径白名单   │  │ 危险操作确认             │ │
│  │ Read/Write/ │  │ 允许访问     │  │ rm -rf / 需要确认        │ │
│  │ Execute     │  │ 哪些目录     │  │                          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Core (ReAct)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    ReAct Loop                            │    │
│  │  THINK → ACT → EXECUTE → OBSERVE → VERIFY → REFLECT      │    │
│  │       ▲──────────────────────────────────────┘            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                    ┌─────────┴─────────┐                        │
│                    ▼                   ▼                        │
│           ┌─────────────┐     ┌─────────────┐                   │
│           │  Planner    │     │  RePlanner  │                   │
│           │  (DAG生成)   │     │  (动态调整)  │                   │
│           └─────────────┘     └─────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐   ┌──────────────────────────┐
│   Tool       │    │   Memory System  │   │    模型管理层             │
│  System      │    ├──────────────────┤   │   (Model Management)     │
│              │    │ • WorkingMemory  │   │                          │
│ ┌──────────┐ │    │ • EpisodicMemory │   │  ┌────────────────────┐  │
│ │ Registry │ │    │ • SemanticMemory │   │  │ LLMClient (统一接口)│  │
│ └──────────┘ │    └──────────────────┘   │  ├────────────────────┤  │
│              │            │                │  │ ModelRegistry      │  │
│ ┌──────────┐ │            ▼                │  │ ModelSelector      │  │
│ │Executor  │ │    ┌──────────────┐         │  │ Providers          │  │
│ └──────────┘ │    │   SQLite     │         │  │  - Anthropic       │  │
│              │    │  (嵌入式)     │         │  │  - OpenAI          │  │
└──────────────┘    └──────────────┘         │  │  - Ollama          │  │
                              │               │  └────────────────────┘  │
                              │               │  ┌────────────────────┐  │
                              │               │  │ Token Budget       │  │
                              │               │  │ Cost Tracker       │  │
                              │               │  └────────────────────┘  │
                              │               └──────────────────────────┘
                              │                              │
                              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    人机协作层 (Human-in-Loop)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ 关键决策确认 │  │ 信息补充请求 │  │ 任务完成交付             │ │
│  │ "确定删除?"  │  │ "请提供API Key"│  │ "这是生成的代码..."      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**模型管理子系统详细设计**: [docs/MODEL_MANAGEMENT.md](./docs/MODEL_MANAGEMENT.md)

---

## 六大核心功能

### 1. 自主性 (Autonomy)

**任务分解策略**：
- 将复杂目标拆解为 DAG（有向无环图）
- 支持步骤依赖关系管理
- 支持检查点（可回滚）

**自主决策点**：
- **何时停止**：根据任务完成度判断，非固定轮数
- **何时重试**：检测到工具执行失败或结果不符预期
- **何时求助**：遇到无法解决的障碍或超出能力范围

### 2. 感知能力 (Perception)

**环境感知**：
| 感知类型 | 实现方式 | 用途 |
|---------|---------|------|
| 文件系统 | FileSystemTool | 读取代码、配置、数据 |
| 网络 | HttpTool + BrowserTool | 获取外部信息 |
| 进程 | ProcessTool | 执行命令、运行代码 |
| 时间 | SystemTimeTool | 时间管理、超时控制 |

**结果解析**：
```typescript
interface Observation {
  raw: string;           // 原始输出
  summary: string;       // LLM 生成的摘要
  success: boolean;      // 是否成功
  artifacts?: string[];  // 生成的文件/数据
  errors?: Error[];      // 解析出的错误
}
```

### 3. 推理与规划 (Reasoning & Planning)

**双层次规划**：
1. **战略层** (Strategic Planning)：大目标拆解为里程碑，决定执行顺序
2. **战术层** (Tactical Planning)：每个步骤的具体执行方案

**反思机制 (Self-Reflection)**：
```typescript
interface Reflection {
  whatHappened: string;     // 刚才发生了什么
  whatWorked: string;       // 什么有效
  whatFailed: string;       // 什么失败了
  adjustmentNeeded: boolean; // 是否需要调整
  newApproach?: string;     // 新的方法
}
```

### 4. 行动能力 (Action)

**工具调用协议**（结构化输出）：
```typescript
interface AgentAction {
  thought: string;          // 思考过程
  toolName: string;         // 工具名称
  parameters: Record<string, unknown>; // 参数
  expectedOutcome: string;  // 预期结果（用于验证）
}
```

**工具分类**：
| 类型 | 例子 | 特点 |
|-----|------|------|
| 信息收集 | FileRead, WebFetch | 只读，无副作用 |
| 修改操作 | FileWrite, Execute | 有副作用，需谨慎 |
| 验证工具 | TestRunner, Linter | 检查正确性 |
| 交互工具 | UserPrompt | 需要人类输入 |

### 5. 记忆能力 (Memory)

**三层记忆系统**：

```
┌────────────────────────────────────────────────────┐
│  Working Memory (工作记忆)                          │
│  • 当前对话历史                                     │
│  • 活跃的任务上下文                                 │
│  • 临时变量和中间结果                               │
│  容量：有限，自动裁剪                                │
└────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│  Episodic Memory (情景记忆)                         │
│  • 过去的任务记录                                   │
│  • 成功/失败的经验                                  │
│  • 用户的偏好和习惯                                 │
│  存储：SQLite，按时间索引                            │
└────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────┐
│  Semantic Memory (语义记忆)                         │
│  • 代码库的知识图谱                                 │
│  • 常见问题的解决方案                                │
│  • 领域知识                                         │
│  存储：向量数据库 (简单版用 SQLite + 文本搜索)        │
└────────────────────────────────────────────────────┘
```

### 6. 反馈闭环 (Feedback Loop)

**ReAct 循环详解**：

```
Step 0: 初始化
   ├── 任务理解 (Task Understanding)
   ├── 创建计划 (Create Plan)
   └── 加载记忆 (Load Memory)

Step N: 迭代执行
   ┌─────────────────┐
   │  1. THINK 思考  │  分析当前状态，评估进度，识别障碍
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │  2. ACT 行动    │  选择工具，生成参数，准备执行
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │  3. EXECUTE 执行│  调用工具，获取原始结果
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │ 4. OBSERVE 观察 │  解析结果，提取关键信息
   └────────┬────────┘
            ▼
   ┌─────────────────┐
   │ 5. VERIFY 验证  │  检查是否达成预期，检测错误
   └────────┬────────┘
            ▼
   ┌─────────────────┐     ┌─────────────────┐
   │ 6. REFLECT 反思 │────▶│ 需要重试/重规划? │──Y──▶ 调整计划
   └─────────────────┘     └─────────────────┘
                                     N
                                     ▼
                           任务完成? Y ──▶ 结束
                                     N
                                     ▼
                           继续下一轮循环
```

**三层验证**：
1. **工具层验证**：命令是否执行成功（exit code）
2. **语义层验证**：结果是否符合预期（LLM 判断）
3. **任务层验证**：整体目标是否达成

**错误恢复策略**：
| 错误类型 | 恢复策略 |
|---------|---------|
| 工具执行失败 | 重试 → 更换工具 → 重新规划 |
| 结果不符合预期 | 调整参数 → 改变方法 |
| 循环/死胡同 | 回退到检查点 → 更换策略 |
| 超出能力 | 向用户求助 |

---

## SQLite 数据库设计

### 为什么选择 SQLite？

| 特性 | 优势 |
|------|------|
| 零配置 | 内置，无需安装数据库服务 |
| 单文件 | 整个数据库一个文件，易备份迁移 |
| 足够用 | Agent 个人使用，数据量不会太大 |
| 全文搜索 | 内置 FTS5，支持语义记忆搜索 |

### 数据库表结构

```sql
-- 会话历史
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_description TEXT,
  final_status TEXT -- pending/running/completed/failed
);

-- 执行步骤（最重要，支持崩溃恢复）
CREATE TABLE steps (
  step_id TEXT PRIMARY KEY,
  session_id TEXT,
  step_number INTEGER,
  thought TEXT,           -- 思考内容
  action TEXT,            -- 行动（JSON）
  observation TEXT,       -- 观察结果
  reflection TEXT,        -- 反思
  status TEXT,            -- pending/running/completed/failed
  checkpoint_data TEXT,   -- 检查点数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- 长期记忆
CREATE TABLE memories (
  memory_id TEXT PRIMARY KEY,
  type TEXT,              -- episodic/semantic/preference
  content TEXT,
  embedding TEXT,         -- 向量（简单版用文本）
  relevance_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 工具调用日志
CREATE TABLE tool_calls (
  call_id TEXT PRIMARY KEY,
  step_id TEXT,
  tool_name TEXT,
  parameters TEXT,        -- JSON
  result_summary TEXT,
  execution_time_ms INTEGER,
  success BOOLEAN,
  FOREIGN KEY (step_id) REFERENCES steps(step_id)
);

-- LLM 调用记录（Token 预算、成本追踪）
CREATE TABLE llm_calls (
  call_id TEXT PRIMARY KEY,
  session_id TEXT,
  provider_id TEXT,           -- 关联 model_providers
  model_name TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  success BOOLEAN,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  FOREIGN KEY (provider_id) REFERENCES model_providers(id)
);

-- 模型提供商配置表（多模型支持）
CREATE TABLE model_providers (
  id TEXT PRIMARY KEY,        -- 用户自定义标识，如 "claude-prod"
  name TEXT NOT NULL,         -- 显示名称
  provider_type TEXT NOT NULL,-- anthropic/openai/ollama
  model_name TEXT NOT NULL,   -- 实际模型名称
  api_key_encrypted TEXT,     -- 加密的 API Key
  base_url TEXT,              -- 自定义 API 地址
  config_json TEXT,           -- 额外配置 JSON
  supports_vision BOOLEAN DEFAULT 0,
  supports_tools BOOLEAN DEFAULT 0,
  supports_streaming BOOLEAN DEFAULT 1,
  max_tokens INTEGER DEFAULT 4096,
  rpm_limit INTEGER,
  daily_cost_limit REAL,
  is_active BOOLEAN DEFAULT 1,
  is_default BOOLEAN DEFAULT 0,
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME
);
```

### 关键使用场景

**场景 1：崩溃恢复**
```typescript
const lastStep = db.get(
  "SELECT * FROM steps WHERE session_id = ? ORDER BY step_number DESC LIMIT 1",
  [sessionId]
);
// 从最后完成的步骤继续，而非重新开始
```

**场景 2：Token 预算管理**
```typescript
const usage = db.get(
  "SELECT SUM(prompt_tokens + completion_tokens) as total FROM llm_calls WHERE session_id = ?",
  [sessionId]
);
if (usage.total > TOKEN_BUDGET) {
  // 触发压缩或提示用户
}
```

**场景 3：经验学习**
```typescript
const similarTasks = db.all(
  `SELECT * FROM memories 
   WHERE type = 'episodic' 
   AND content LIKE ? 
   AND relevance_score > 0.8`,
  [`%${taskKeywords}%`]
);
```

---

## 安全设计

### 安全沙箱

```typescript
interface SecurityPolicy {
  // 路径白名单：Agent 只能访问这些目录
  allowedPaths: string[];
  
  // 权限分级：read / write / execute
  permissionLevel: 'read' | 'write' | 'execute';
  
  // 危险命令需要确认
  dangerousPatterns: RegExp[];
  
  // 网络访问限制
  allowNetwork: boolean;
  allowedDomains?: string[];
}
```

### 危险操作列表

| 操作类型 | 示例 | 处理方式 |
|---------|------|---------|
| 递归删除 | `rm -rf /` | 必须用户确认 |
| 系统修改 | 修改 hosts | 必须用户确认 |
| 网络请求 | 调用外部 API | 记录日志 |
| 大文件修改 | > 50 行变更 | 展示 diff，用户确认 |

---

## 人机协作设计

### 触发点

| 触发条件 | 行为 |
|---------|------|
| 执行危险命令 | 必须用户确认 |
| 文件大量修改 | 展示 diff，用户确认 |
| 任务执行超时 | 询问是否继续 |
| 遇到未知错误 | 向用户描述问题，请求指导 |
| 需要敏感信息 | 安全提示输入 |

---

## 开发阶段规划

### Phase 1: MVP (核心功能)
- [ ] ReAct 循环实现
- [ ] 3 个基础工具（FileRead, FileWrite, Shell）
- [ ] Working Memory（内存存储）
- [ ] SQLite 基础（steps 表，崩溃恢复）
- [ ] 简单安全控制（命令黑名单）
- [ ] Claude API 集成

### Phase 2: 完善
- [ ] Episodic Memory 完整实现
- [ ] Token 预算管理
- [ ] 安全沙箱完整版
- [ ] 人机协作接口
- [ ] 成本追踪

### Phase 3: 高级（可选）
- [ ] Semantic Memory + 向量搜索
- [ ] DAG 并行执行
- [ ] 可视化界面
- [ ] 多 Agent 协作

---

## 目录结构

```
my-agent/
├── src/
│   ├── core/
│   │   ├── Agent.ts              # 主入口
│   │   ├── ReActLoop.ts          # ReAct 循环
│   │   └── StateManager.ts       # 状态机
│   ├── planner/
│   │   ├── Planner.ts            # 初始规划
│   │   ├── RePlanner.ts          # 重规划
│   │   └── TaskGraph.ts          # DAG 管理
│   ├── executor/
│   │   ├── Executor.ts           # 执行器
│   │   ├── Validator.ts          # 结果验证
│   │   └── ErrorHandler.ts       # 错误处理
│   ├── tools/
│   │   ├── ToolRegistry.ts
│   │   ├── ToolExecutor.ts
│   │   ├── schemas.ts
│   │   └── implementations/
│   │       ├── FileReadTool.ts
│   │       ├── FileWriteTool.ts
│   │       ├── ShellTool.ts
│   │       └── TerminateTool.ts
│   ├── memory/
│   │   ├── MemorySystem.ts
│   │   ├── WorkingMemory.ts
│   │   ├── EpisodicMemory.ts
│   │   ├── SemanticMemory.ts
│   │   └── SQLiteClient.ts
│   ├── llm/                      # 模型管理层
│   │   ├── LLMClient.ts          # 统一接口
│   │   ├── ModelRegistry.ts      # 模型注册中心
│   │   ├── ModelSelector.ts      # 智能选择器
│   │   ├── providers/            # Provider 实现
│   │   │   ├── LLMProvider.ts    # 统一接口定义
│   │   │   ├── AnthropicProvider.ts
│   │   │   ├── OpenAIProvider.ts
│   │   │   └── OllamaProvider.ts
│   │   └── prompts/              # Prompt 模板
│   │       ├── react.ts
│   │       ├── planning.ts
│   │       └── reflection.ts
│   ├── cli/                      # 命令行接口
│   │   ├── index.ts
│   │   └── commands/
│   │       ├── models.ts         # 模型管理命令
│   │       └── agent.ts          # Agent 执行命令
│   ├── security/
│   │   ├── SecurityPolicy.ts
│   │   └── PermissionManager.ts
│   └── types/
│       └── index.ts
├── storage/
│   └── .gitkeep                  # SQLite 数据库存放
├── config/
│   └── default.yaml
├── docs/
│   └── MODEL_MANAGEMENT.md       # 模型管理设计文档
├── tests/
└── README.md
```

---

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js 18+
- **数据库**: SQLite3
- **AI 模型**: 多模型支持 (Claude API, OpenAI API, Ollama Local)
- **配置**: YAML
- **AI SDK**: @anthropic-ai/sdk, openai

## 多模型支持

Agent 支持多种 LLM 提供商，可通过配置文件或 CLI 命令管理：

- **Anthropic**: Claude 3/3.5 系列
- **OpenAI**: GPT-4/GPT-4o/GPT-3.5 系列
- **Ollama**: 本地模型 (Llama3/Mistral 等)
- **Custom**: 其他 API 兼容模型（可扩展）

### 模型管理 CLI

```bash
my-agent models list                    # 列出所有模型
my-agent models add --type anthropic    # 添加 Anthropic 模型
my-agent models set-default <id>        # 设置默认模型
my-agent models test <id>               # 测试模型连接
my-agent models stats                   # 查看使用统计
```

### 智能模型选择

支持多种选择策略：
- `default`: 使用默认模型
- `cost`: 成本优先
- `quality`: 质量优先
- `speed`: 速度优先
- `task_based`: 基于任务类型自动选择

---

## 关键配置项

```yaml
# config/default.yaml

# 模型配置
models:
  claude-sonnet:
    name: "Claude 3.5 Sonnet"
    type: anthropic
    model: claude-3-5-sonnet-20241022
    api_key: ${ANTHROPIC_API_KEY}
    is_default: true
    limits:
      rpm: 50
      daily_cost: 10.0
    capabilities:
      vision: true
      tools: true
      streaming: true

  gpt-4o:
    name: "GPT-4o"
    type: openai
    model: gpt-4o
    api_key: ${OPENAI_API_KEY}
    limits:
      rpm: 30
      daily_cost: 15.0

  llama3-local:
    name: "Llama 3 (Local)"
    type: ollama
    model: llama3:latest
    base_url: http://localhost:11434

# 模型选择策略
selection:
  default_strategy: task_based
  task_mapping:
    planning:
      - claude-sonnet
      - gpt-4o
    coding:
      - claude-sonnet
    summarization:
      - gpt-4o-mini
      - claude-haiku

# 故障切换
fallback:
  enabled: true
  max_retries: 2

# 记忆配置
memory:
  working_memory_max: 10        # 保留最近多少轮对话
  token_budget: 100000          # 每会话 token 上限
  compression_threshold: 0.8    # 触发压缩的阈值

# 安全配置
security:
  allowed_paths:
    - ./workspace
  permission_level: write       # read/write/execute
  allow_network: true
  dangerous_patterns:
    - "rm -rf /"
    - "rm -rf /*"
    - "> /dev/sda"

# Agent 配置
agent:
  max_iterations: 50            # 单任务最大迭代次数
  timeout_ms: 300000            # 单任务超时时间（5分钟）
  enable_human_confirm: true    # 是否启用人工确认
```

---

**相关文档:**
- [模型管理子系统设计](./docs/MODEL_MANAGEMENT.md) - 多模型支持详细设计
- [开发工作计划](./WORK_PLAN.md) - 开发任务和进度追踪

*文档版本: 1.1*
*最后更新: 2026-04-13*
