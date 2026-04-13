# 模型管理子系统设计文档

## 概述

模型管理子系统是 AI Agent 的核心基础设施，支持注册、配置、管理和切换多种 LLM 提供商（Claude、OpenAI、Ollama 等）。

### 设计目标

- **多提供商支持**: 支持主流 LLM 提供商，易于扩展
- **统一管理**: 统一的配置、调用、监控接口
- **智能选择**: 根据任务类型、成本、性能自动选择模型
- **灵活配置**: CLI 和配置文件两种方式管理模型
- **成本追踪**: 详细的 token 使用和成本统计

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              应用层                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Agent      │  │   Planner    │  │   ReActLoop  │  │   Other Modules  │ │
│  │   Core       │  │              │  │              │  │                  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                 │                   │          │
│         └─────────────────┴─────────────────┴───────────────────┘          │
│                                   │                                        │
│                                   ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                        LLMClient (统一接口)                         │   │
│  │  • 隐藏底层 Provider 差异                                           │   │
│  │  • 提供简化的 chat/chatStream/chatWithTools 方法                    │   │
│  └─────────────────────────────┬──────────────────────────────────────┘   │
│                                │                                           │
└────────────────────────────────┼───────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         模型管理层                                          │
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌───────────────┐   │
│  │   ModelRegistry     │◄───│   ModelSelector     │    │   Config      │   │
│  │   (模型注册表)       │    │   (模型选择器)       │    │   Manager     │   │
│  │                     │    │                     │    │   (配置管理)   │   │
│  │  • 注册/注销 Provider│    │  • 默认模型选择      │    │               │   │
│  │  • 查询 Provider    │    │  • 策略选择         │    │  • 加载配置    │   │
│  │  • 管理默认模型     │    │  • 故障切换         │    │  • 保存配置    │   │
│  └──────────┬──────────┘    └─────────────────────┘    │  • 加密密钥    │   │
│             │                                          └───────────────┘   │
│             │                                                               │
│             ▼                                                               │
│  ┌───────────────────────────────────────────────────────────────────┐     │
│  │                      Provider 实例池                               │     │
│  ├──────────────┬──────────────┬──────────────┬───────────────────────┤     │
│  │  Anthropic   │   OpenAI     │   Ollama     │   CustomProvider      │     │
│  │  Provider    │   Provider   │   Provider   │   (扩展点)             │     │
│  │              │              │              │                       │     │
│  │ • Claude 3   │ • GPT-4o     │ • Llama3     │ • 其他API兼容模型      │     │
│  │ • Claude 3.5 │ • GPT-4      │ • Mistral    │ • 私有部署模型         │     │
│  │ • Claude 3 Opus│ • GPT-3.5  │ • Qwen       │                       │     │
│  └──────────────┴──────────────┴──────────────┴───────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据持久层                                        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐      │
│  │ model_providers  │  │ model_usage_logs │  │  encryption_keys     │      │
│  │ (模型配置表)      │  │ (使用记录表)      │  │  (密钥加密存储)       │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件详解

### 1. LLMProvider 接口 (统一抽象)

```typescript
// src/llm/providers/LLMProvider.ts

/**
 * 模型能力标识
 */
export interface ModelCapabilities {
  /** 支持视觉/图片输入 */
  supportsVision: boolean;
  /** 支持函数/工具调用 */
  supportsTools: boolean;
  /** 支持流式输出 */
  supportsStreaming: boolean;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 支持 JSON 模式输出 */
  supportsJSONMode: boolean;
}

/**
 * Provider 元数据
 */
export interface ProviderMetadata {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 提供商类型 */
  type: 'anthropic' | 'openai' | 'ollama' | 'custom';
  /** 实际模型名称 */
  modelName: string;
  /** 模型能力 */
  capabilities: ModelCapabilities;
  /** 是否启用 */
  isActive: boolean;
  /** 是否为默认 */
  isDefault: boolean;
}

/**
 * 消息类型
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  imageUrl?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  timeoutMs?: number;
  /** 是否使用工具 */
  tools?: ToolDefinition[];
  /** 强制使用特定工具 */
  toolChoice?: 'auto' | 'none' | { name: string };
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  latencyMs: number;
}

/**
 * 流式响应块
 */
export interface ChatResponseChunk {
  content?: string;
  toolCall?: Partial<ToolCall>;
  isComplete: boolean;
  usage?: ChatResponse['usage'];
}

/**
 * LLM Provider 统一接口
 */
export interface LLMProvider {
  /** 元数据 */
  readonly metadata: ProviderMetadata;
  
  /**
   * 普通聊天
   */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  
  /**
   * 流式聊天
   */
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatResponseChunk>;
  
  /**
   * 计算成本（美元）
   */
  calculateCost(promptTokens: number, completionTokens: number): number;
  
  /**
   * 健康检查
   */
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  
  /**
   * 测试连接
   */
  testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * Provider 工厂函数类型
 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;
```

---

### 2. ModelRegistry (模型注册表)

```typescript
// src/llm/ModelRegistry.ts

import { LLMProvider, ProviderMetadata } from './providers/LLMProvider';

export interface ProviderConfig {
  id: string;
  type: string;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  priority?: number;
}

export class ModelRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private factories: Map<string, ProviderFactory> = new Map();
  private defaultProviderId: string | null = null;
  
  /**
   * 注册 Provider 工厂
   */
  registerFactory(type: string, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }
  
  /**
   * 添加 Provider 实例
   */
  addProvider(config: ProviderConfig): LLMProvider {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown provider type: ${config.type}`);
    }
    
    const provider = factory(config);
    this.providers.set(config.id, provider);
    
    if (config.isDefault || this.providers.size === 1) {
      this.defaultProviderId = config.id;
    }
    
    return provider;
  }
  
  /**
   * 移除 Provider
   */
  removeProvider(id: string): void {
    if (this.defaultProviderId === id) {
      this.defaultProviderId = null;
    }
    this.providers.delete(id);
  }
  
  /**
   * 获取 Provider
   */
  get(id: string): LLMProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider not found: ${id}`);
    }
    return provider;
  }
  
  /**
   * 获取默认 Provider
   */
  getDefault(): LLMProvider {
    if (!this.defaultProviderId) {
      throw new Error('No default provider set');
    }
    return this.get(this.defaultProviderId);
  }
  
  /**
   * 设置默认 Provider
   */
  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider not found: ${id}`);
    }
    this.defaultProviderId = id;
  }
  
  /**
   * 列出所有 Provider
   */
  list(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map(p => p.metadata);
  }
  
  /**
   * 列出特定类型的 Provider
   */
  listByType(type: string): ProviderMetadata[] {
    return this.list().filter(p => p.type === type);
  }
  
  /**
   * 检查 Provider 是否存在
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }
  
  /**
   * 获取所有 Provider 类型
   */
  getAvailableTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}
```

---

### 3. ModelSelector (模型选择器)

```typescript
// src/llm/ModelSelector.ts

import { ModelRegistry } from './ModelRegistry';
import { LLMProvider } from './providers/LLMProvider';

export type TaskType = 
  | 'planning'      // 任务规划
  | 'coding'        // 代码生成
  | 'debugging'     // 调试
  | 'summarization' // 总结
  | 'chat'          // 普通对话
  | 'vision';       // 视觉任务

export type SelectionStrategy = 
  | 'default'       // 使用默认
  | 'cost'          // 成本优先
  | 'quality'       // 质量优先
  | 'speed'         // 速度优先
  | 'task_based';   // 基于任务类型

export interface SelectionCriteria {
  taskType?: TaskType;
  requiresVision?: boolean;
  requiresTools?: boolean;
  maxCost?: number;
  preferredProvider?: string;
}

export class ModelSelector {
  constructor(
    private registry: ModelRegistry,
    private usageTracker: UsageTracker
  ) {}
  
  /**
   * 选择最适合的模型
   */
  async select(
    criteria: SelectionCriteria,
    strategy: SelectionStrategy = 'default'
  ): Promise<LLMProvider> {
    const providers = this.registry.list().filter(p => p.isActive);
    
    // 按能力筛选
    let candidates = providers.filter(p => {
      if (criteria.requiresVision && !p.capabilities.supportsVision) return false;
      if (criteria.requiresTools && !p.capabilities.supportsTools) return false;
      return true;
    });
    
    if (candidates.length === 0) {
      throw new Error('No provider matches the criteria');
    }
    
    switch (strategy) {
      case 'default':
        return this.registry.getDefault();
        
      case 'cost':
        return this.selectByCost(candidates);
        
      case 'quality':
        return this.selectByQuality(candidates, criteria.taskType);
        
      case 'speed':
        return this.selectBySpeed(candidates);
        
      case 'task_based':
        return this.selectByTask(candidates, criteria.taskType);
        
      default:
        return this.registry.getDefault();
    }
  }
  
  /**
   * 成本优先选择
   */
  private selectByCost(candidates: ProviderMetadata[]): LLMProvider {
    // 按成本排序，返回最便宜的
    const sorted = candidates.sort((a, b) => {
      // 获取历史平均成本
      const costA = this.usageTracker.getAverageCost(a.id);
      const costB = this.usageTracker.getAverageCost(b.id);
      return costA - costB;
    });
    return this.registry.get(sorted[0].id);
  }
  
  /**
   * 质量优先选择
   */
  private selectByQuality(
    candidates: ProviderMetadata[],
    taskType?: TaskType
  ): LLMProvider {
    // 基于历史成功率选择
    const scored = candidates.map(p => ({
      ...p,
      score: this.usageTracker.getSuccessRate(p.id, taskType)
    }));
    scored.sort((a, b) => b.score - a.score);
    return this.registry.get(scored[0].id);
  }
  
  /**
   * 速度优先选择
   */
  private selectBySpeed(candidates: ProviderMetadata[]): LLMProvider {
    const sorted = candidates.sort((a, b) => {
      const latencyA = this.usageTracker.getAverageLatency(a.id);
      const latencyB = this.usageTracker.getAverageLatency(b.id);
      return latencyA - latencyB;
    });
    return this.registry.get(sorted[0].id);
  }
  
  /**
   * 基于任务类型选择
   */
  private selectByTask(
    candidates: ProviderMetadata[],
    taskType?: TaskType
  ): LLMProvider {
    // 任务类型到模型的映射配置
    const taskMapping: Record<TaskType, string[]> = {
      planning: ['claude-3-opus', 'gpt-4o', 'claude-3-sonnet'],
      coding: ['claude-3-sonnet', 'gpt-4o', 'claude-3-haiku'],
      debugging: ['claude-3-sonnet', 'gpt-4o'],
      summarization: ['claude-3-haiku', 'gpt-3.5-turbo'],
      chat: ['claude-3-haiku', 'gpt-3.5-turbo'],
      vision: ['gpt-4o', 'claude-3-opus', 'claude-3-sonnet']
    };
    
    if (!taskType) {
      return this.registry.getDefault();
    }
    
    const preferred = taskMapping[taskType] || [];
    for (const modelId of preferred) {
      const match = candidates.find(c => c.modelName.includes(modelId));
      if (match) {
        return this.registry.get(match.id);
      }
    }
    
    return this.registry.getDefault();
  }
}
```

---

## 数据库设计

### 表结构

```sql
-- 模型提供商配置表
CREATE TABLE model_providers (
  id TEXT PRIMARY KEY,                    -- 用户自定义标识，如 "claude-prod"
  name TEXT NOT NULL,                     -- 显示名称
  provider_type TEXT NOT NULL,            -- anthropic/openai/ollama/custom
  model_name TEXT NOT NULL,               -- 实际模型名称
  
  -- API 配置（加密存储）
  api_key_encrypted TEXT,                 -- 加密的 API Key
  base_url TEXT,                          -- 自定义 API 地址
  config_json TEXT,                       -- 额外配置 JSON
  
  -- 模型能力
  supports_vision BOOLEAN DEFAULT 0,
  supports_tools BOOLEAN DEFAULT 0,
  supports_streaming BOOLEAN DEFAULT 1,
  supports_json_mode BOOLEAN DEFAULT 0,
  max_tokens INTEGER DEFAULT 4096,
  context_window INTEGER DEFAULT 8192,
  
  -- 使用限制
  rpm_limit INTEGER,                      -- 每分钟请求限制
  tpm_limit INTEGER,                      -- 每分钟 token 限制
  daily_cost_limit REAL,                  -- 每日成本限制（美元）
  
  -- 状态
  is_active BOOLEAN DEFAULT 1,
  is_default BOOLEAN DEFAULT 0,
  priority INTEGER DEFAULT 0,             -- 优先级
  
  -- 元数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  last_error TEXT,                        -- 最后一次错误信息
  consecutive_errors INTEGER DEFAULT 0    -- 连续错误次数
);

-- 模型使用记录表（用于成本追踪和自动选择）
CREATE TABLE model_usage_logs (
  log_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  session_id TEXT,
  
  -- 请求信息
  task_type TEXT,                         -- planning/coding/summary
  messages_count INTEGER,
  tools_count INTEGER,
  
  -- Token 使用
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  
  -- 成本
  cost_usd REAL,                          -- 计算的成本
  
  -- 性能
  latency_ms INTEGER,                     -- 响应延迟
  time_to_first_token_ms INTEGER,         -- 首 token 延迟
  
  -- 结果
  success BOOLEAN NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,          -- 重试次数
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (provider_id) REFERENCES model_providers(id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- 每日成本统计（用于限额检查）
CREATE TABLE daily_cost_summary (
  date TEXT PRIMARY KEY,                  -- YYYY-MM-DD
  provider_id TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  
  FOREIGN KEY (provider_id) REFERENCES model_providers(id)
);

-- 加密密钥表（用于加密存储 API Key）
CREATE TABLE encryption_keys (
  key_id TEXT PRIMARY KEY,
  key_type TEXT NOT NULL,                 -- master/provider
  encrypted_key TEXT NOT NULL,            -- 加密的密钥
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- 创建索引
CREATE INDEX idx_providers_type ON model_providers(provider_type);
CREATE INDEX idx_providers_active ON model_providers(is_active);
CREATE INDEX idx_usage_logs_provider ON model_usage_logs(provider_id);
CREATE INDEX idx_usage_logs_session ON model_usage_logs(session_id);
CREATE INDEX idx_usage_logs_created ON model_usage_logs(created_at);
CREATE INDEX idx_daily_cost ON daily_cost_summary(date, provider_id);
```

---

## CLI 命令设计

### 命令列表

```bash
# 列出所有模型
my-agent models list

# 查看模型详情
my-agent models show <id>

# 添加 Anthropic 模型
my-agent models add \
  --id claude-prod \
  --name "Claude 3.5 Sonnet" \
  --type anthropic \
  --model claude-3-5-sonnet-20241022 \
  --api-key $ANTHROPIC_API_KEY

# 添加 OpenAI 模型
my-agent models add \
  --id gpt-4o \
  --name "GPT-4o" \
  --type openai \
  --model gpt-4o \
  --api-key $OPENAI_API_KEY

# 添加 Ollama 本地模型
my-agent models add \
  --id llama3-local \
  --name "Llama 3 Local" \
  --type ollama \
  --model llama3:latest \
  --base-url http://localhost:11434

# 设置默认模型
my-agent models set-default claude-prod

# 测试模型连接
my-agent models test claude-prod

# 测试所有模型
my-agent models test-all

# 更新模型配置
my-agent models update claude-prod \
  --api-key $NEW_API_KEY \
  --rpm-limit 100

# 启用/禁用模型
my-agent models enable claude-prod
my-agent models disable claude-prod

# 删除模型
my-agent models remove claude-prod

# 查看使用统计
my-agent models stats claude-prod
my-agent models stats --all

# 成本报告
my-agent models costs --days 7
my-agent models costs --provider gpt-4o --days 30
```

### 交互式添加模型

```bash
$ my-agent models add --interactive

? 选择提供商类型: (Use arrow keys)
❯ Anthropic (Claude)
  OpenAI (GPT)
  Ollama (Local)
  Custom

? 输入模型 ID: claude-prod
? 输入显示名称: Claude 3.5 Sonnet
? 输入 API Key: [hidden]
? 是否需要自定义 API 地址? (y/N) n
? 设置每分钟请求限制: (100)
? 设置每日成本限制 (USD): (10)
? 设为默认模型? (Y/n) y

✓ 模型 "claude-prod" 添加成功
✓ 连接测试通过
✓ 已设为默认模型
```

---

## 配置示例

### 配置文件 (config/models.yaml)

```yaml
# 模型配置
models:
  # Anthropic Claude
  claude-sonnet:
    name: "Claude 3.5 Sonnet"
    type: anthropic
    model: claude-3-5-sonnet-20241022
    apiKey: ${ANTHROPIC_API_KEY}
    isDefault: true
    limits:
      rpm: 50
      dailyCost: 10.0
    capabilities:
      vision: true
      tools: true
      streaming: true

  claude-haiku:
    name: "Claude 3 Haiku"
    type: anthropic
    model: claude-3-haiku-20240307
    apiKey: ${ANTHROPIC_API_KEY}
    limits:
      rpm: 100
      dailyCost: 5.0

  # OpenAI
  gpt-4o:
    name: "GPT-4o"
    type: openai
    model: gpt-4o
    apiKey: ${OPENAI_API_KEY}
    limits:
      rpm: 30
      dailyCost: 15.0
    capabilities:
      vision: true
      tools: true

  gpt-4o-mini:
    name: "GPT-4o Mini"
    type: openai
    model: gpt-4o-mini
    apiKey: ${OPENAI_API_KEY}
    limits:
      rpm: 100
      dailyCost: 5.0

  # Ollama 本地模型
  llama3-local:
    name: "Llama 3 (Local)"
    type: ollama
    model: llama3:latest
    baseUrl: http://localhost:11434
    capabilities:
      streaming: true

# 自动选择策略
selection:
  defaultStrategy: task_based
  
  # 任务类型到模型的映射
  taskMapping:
    planning:
      - claude-sonnet
      - gpt-4o
    coding:
      - claude-sonnet
      - gpt-4o
    debugging:
      - claude-sonnet
    summarization:
      - claude-haiku
      - gpt-4o-mini
    chat:
      - claude-haiku
      - gpt-4o-mini
    vision:
      - gpt-4o
      - claude-sonnet

  # 故障切换配置
  fallback:
    enabled: true
    maxRetries: 2
    fallbackOrder:
      - claude-sonnet
      - gpt-4o
      - llama3-local
```

---

## 实现细节

### 1. Provider 实现示例 (Anthropic)

```typescript
// src/llm/providers/AnthropicProvider.ts

import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  ProviderMetadata,
  Message,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
  ModelCapabilities
} from './LLMProvider';
import { ProviderConfig } from '../ModelRegistry';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  readonly metadata: ProviderMetadata;
  
  // 定价表 (每 1M tokens)
  private static readonly PRICING: Record<string, { input: number; output: number }> = {
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  };
  
  constructor(private config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    
    this.metadata = {
      id: config.id,
      name: config.name || config.modelName,
      type: 'anthropic',
      modelName: config.modelName,
      capabilities: this.detectCapabilities(config.modelName),
      isActive: true,
      isDefault: config.isDefault || false,
    };
  }
  
  private detectCapabilities(modelName: string): ModelCapabilities {
    const visionModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
    const supportsVision = visionModels.some(m => modelName.includes(m));
    
    return {
      supportsVision,
      supportsTools: true,
      supportsStreaming: true,
      supportsJSONMode: false, // Anthropic 暂不支持
      maxTokens: 4096,
      contextWindow: 200000,
    };
  }
  
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const startTime = Date.now();
    
    const response = await this.client.messages.create({
      model: this.config.modelName,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stopSequences,
      tools: options?.tools?.map(this.convertTool),
      tool_choice: this.convertToolChoice(options?.toolChoice),
    });
    
    const latencyMs = Date.now() - startTime;
    
    return {
      content: response.content
        .filter(c => c.type === 'text')
        .map(c => (c as any).text)
        .join(''),
      toolCalls: response.content
        .filter(c => c.type === 'tool_use')
        .map(c => ({
          id: (c as any).id,
          name: (c as any).name,
          arguments: (c as any).input,
        })),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      latencyMs,
    };
  }
  
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponseChunk> {
    const stream = await this.client.messages.create({
      model: this.config.modelName,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      stream: true,
    });
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        yield {
          content: (chunk.delta as any).text,
          isComplete: false,
        };
      }
    }
    
    yield { isComplete: true };
  }
  
  calculateCost(promptTokens: number, completionTokens: number): number {
    const pricing = AnthropicProvider.PRICING[this.config.modelName];
    if (!pricing) return 0;
    
    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }
  
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.client.messages.create({
        model: this.config.modelName,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      return { ok: true, latencyMs: Date.now() - startTime };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const result = await this.healthCheck();
    if (result.ok) {
      return {
        success: true,
        message: `✓ 连接成功 (${result.latencyMs}ms)`,
      };
    }
    return {
      success: false,
      message: `✗ 连接失败: ${result.error}`,
    };
  }
  
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: typeof m.content === 'string' ? m.content : this.convertContentParts(m.content),
    }));
  }
  
  private convertContentParts(parts: any[]): any {
    return parts.map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'image_url') {
        return {
          type: 'image',
          source: {
            type: 'url',
            url: p.imageUrl.url,
          },
        };
      }
      return p;
    });
  }
  
  private convertTool(tool: any): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }
  
  private convertToolChoice(choice: any): any {
    if (!choice) return undefined;
    if (choice === 'auto') return { type: 'auto' };
    if (choice === 'none') return { type: 'none' };
    if (typeof choice === 'object') {
      return { type: 'tool', name: choice.name };
    }
    return undefined;
  }
}

// 注册工厂
export function createAnthropicProvider(config: ProviderConfig): LLMProvider {
  return new AnthropicProvider(config);
}
```

### 2. 使用示例

```typescript
// src/llm/LLMClient.ts

import { ModelRegistry } from './ModelRegistry';
import { ModelSelector, SelectionCriteria } from './ModelSelector';
import { LLMProvider, Message, ChatOptions } from './providers/LLMProvider';
import { createAnthropicProvider } from './providers/AnthropicProvider';
import { createOpenAIProvider } from './providers/OpenAIProvider';
import { createOllamaProvider } from './providers/OllamaProvider';

export class LLMClient {
  private registry: ModelRegistry;
  private selector: ModelSelector;
  
  constructor() {
    this.registry = new ModelRegistry();
    this.setupFactories();
    this.selector = new ModelSelector(this.registry, new UsageTracker());
  }
  
  private setupFactories(): void {
    this.registry.registerFactory('anthropic', createAnthropicProvider);
    this.registry.registerFactory('openai', createOpenAIProvider);
    this.registry.registerFactory('ollama', createOllamaProvider);
  }
  
  /**
   * 普通聊天（使用默认模型）
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const provider = this.registry.getDefault();
    return this.executeWithFallback(() => provider.chat(messages, options));
  }
  
  /**
   * 使用特定模型聊天
   */
  async chatWithProvider(
    providerId: string,
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const provider = this.registry.get(providerId);
    return this.executeWithFallback(() => provider.chat(messages, options));
  }
  
  /**
   * 根据任务类型自动选择模型
   */
  async chatWithSelection(
    criteria: SelectionCriteria,
    messages: Message[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const provider = await this.selector.select(criteria, 'task_based');
    return this.executeWithFallback(() => provider.chat(messages, options));
  }
  
  /**
   * 流式聊天
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponseChunk> {
    const provider = this.registry.getDefault();
    yield* provider.chatStream(messages, options);
  }
  
  /**
   * 带工具调用的聊天
   */
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    // 选择支持工具的模型
    const criteria: SelectionCriteria = {
      requiresTools: true,
    };
    const provider = await this.selector.select(criteria, 'default');
    
    return this.executeWithFallback(() =>
      provider.chat(messages, { ...options, tools })
    );
  }
  
  /**
   * 执行并处理故障切换
   */
  private async executeWithFallback<T>(
    fn: () => Promise<T>,
    maxRetries = 2
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是速率限制，等待后重试
        if (this.isRateLimitError(lastError)) {
          await this.delay(1000 * (i + 1));
          continue;
        }
        
        // 其他错误，尝试切换到备用模型
        // ...
      }
    }
    
    throw lastError!;
  }
  
  private isRateLimitError(error: Error): boolean {
    return error.message.toLowerCase().includes('rate limit');
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 公开 registry 供外部配置
  getRegistry(): ModelRegistry {
    return this.registry;
  }
}
```

---

## 与 WORK_PLAN 的整合

在 WORK_PLAN.md 中，模型管理相关的任务应插入到 **Phase 1** 中：

```
### 任务组 5: LLM 集成 (更新)

#### 5.1a Provider 接口设计
**开发内容:**
- 定义 LLMProvider 统一接口
- 定义消息、工具、响应类型

**测试内容:**
- [ ] 接口类型检查通过
- [ ] 测试文件: tests/llm/providers/LLMProvider.test.ts

**状态:** [-]

#### 5.1b ModelRegistry 实现
**开发内容:**
- 实现 ModelRegistry 类
- 实现 Provider 工厂注册机制

**测试内容:**
- [ ] 能注册 Provider 工厂
- [ ] 能添加/移除 Provider
- [ ] 能获取默认 Provider
- [ ] 测试文件: tests/llm/ModelRegistry.test.ts

**状态:** [-]

#### 5.1c Anthropic Provider
**开发内容:**
- 实现 AnthropicProvider 类
- 实现 API 调用、流式输出、成本计算

**测试内容:**
- [ ] 能调用 Claude API
- [ ] 流式输出正常
- [ ] 成本计算正确
- [ ] 测试文件: tests/llm/providers/AnthropicProvider.test.ts

**状态:** [-]

#### 5.1d LLMClient 统一接口
**开发内容:**
- 实现 LLMClient 类
- 整合 Registry 和 Selector
- 实现故障切换逻辑

**测试内容:**
- [ ] 能通过统一接口调用模型
- [ ] 故障切换正常工作
- [ ] 测试文件: tests/llm/LLMClient.test.ts

**状态:** [-]

#### 5.2 Prompt 模板
... (原有内容)
```

---

## 扩展性设计

### 添加新的 Provider

1. **实现 LLMProvider 接口**
```typescript
// src/llm/providers/CustomProvider.ts
export class CustomProvider implements LLMProvider {
  // 实现所有必需方法
}
```

2. **注册工厂函数**
```typescript
registry.registerFactory('custom', (config) => new CustomProvider(config));
```

3. **配置使用**
```yaml
models:
  my-custom-model:
    type: custom
    # ...
```

---

*文档版本: 1.0*
*创建日期: 2026-04-13*
