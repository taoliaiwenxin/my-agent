/**
 * @file LLMProvider.ts
 * @description LLM Provider 统一接口定义
 *              定义所有 LLM 提供商必须实现的接口和类型
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * // 实现自定义 Provider
 * class MyProvider implements LLMProvider {
 *   readonly metadata: ProviderMetadata;
 *
 *   async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
 *     // 实现聊天逻辑
 *   }
 *
 *   async *chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatResponseChunk> {
 *     // 实现流式聊天逻辑
 *   }
 *
 *   calculateCost(promptTokens: number, completionTokens: number): number {
 *     // 计算成本
 *     return 0;
 *   }
 *
 *   async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
 *     // 健康检查
 *     return { ok: true, latencyMs: 0 };
 *   }
 * }
 *
 * @see {@link MODEL_MANAGEMENT.md}
 */

// ==================== 模型能力类型 ====================

/**
 * 模型能力定义
 *
 * 描述模型支持的功能特性
 */
export interface ModelCapabilities {
  /** 是否支持视觉/图片输入 */
  supportsVision: boolean;

  /** 是否支持函数/工具调用 */
  supportsTools: boolean;

  /** 是否支持流式输出 */
  supportsStreaming: boolean;

  /** 是否支持 JSON 模式输出 */
  supportsJSONMode: boolean;

  /** 最大输出 token 数 */
  maxTokens: number;

  /** 上下文窗口大小 */
  contextWindow: number;
}

// ==================== Provider 元数据类型 ====================

/**
 * Provider 类型
 */
export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom';

/**
 * Provider 元数据
 *
 * 描述 Provider 的基本信息
 */
export interface ProviderMetadata {
  /** 唯一标识 */
  id: string;

  /** 显示名称 */
  name: string;

  /** 提供商类型 */
  type: string;

  /** 实际模型名称 */
  modelName: string;

  /** 模型能力 */
  capabilities: ModelCapabilities;

  /** 是否启用 */
  isActive: boolean;

  /** 是否为默认 */
  isDefault: boolean;
}

// ==================== 消息类型 ====================

/**
 * 内容片段类型
 */
export type ContentPartType = 'text' | 'image_url';

/**
 * 内容片段
 *
 * 支持多模态内容（文本、图片）
 */
export interface ContentPart {
  /** 内容类型 */
  type: ContentPartType;

  /** 文本内容（当 type 为 'text' 时） */
  text?: string;

  /** 图片 URL（当 type 为 'image_url' 时） */
  imageUrl?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 工具调用定义
 *
 * LLM 发起的工具调用请求
 */
export interface ToolCall {
  /** 调用 ID */
  id: string;

  /** 工具名称 */
  name: string;

  /** 调用参数 */
  arguments: Record<string, unknown>;
}

/**
 * 消息定义
 *
 * 用于 LLM 对话的消息
 */
export interface Message {
  /** 消息角色 */
  role: MessageRole;

  /** 消息内容（字符串或多模态内容） */
  content: string | ContentPart[];

  /** 工具调用（如果是 assistant 消息） */
  toolCalls?: ToolCall[];

  /** 工具调用 ID（如果是 tool 消息） */
  toolCallId?: string;
}

// ==================== 工具定义类型 ====================

/**
 * 工具参数定义
 */
export interface ToolParameters {
  /** 参数类型 */
  type: 'object';

  /** 参数属性定义 */
  properties: Record<string, unknown>;

  /** 必需参数列表 */
  required?: string[];
}

/**
 * 工具定义（用于 LLM）
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 参数定义 */
  parameters: ToolParameters;
}

// ==================== 聊天选项类型 ====================

/**
 * 工具选择策略
 */
export type ToolChoice = 'auto' | 'none' | { name: string };

/**
 * 聊天选项
 *
 * 控制 LLM 聊天行为的选项
 */
export interface ChatOptions {
  /** 温度参数，控制随机性 (0-2) */
  temperature?: number;

  /** 最大输出 token 数 */
  maxTokens?: number;

  /** Top P 采样 */
  topP?: number;

  /** 停止序列 */
  stopSequences?: string[];

  /** 超时时间（毫秒） */
  timeoutMs?: number;

  /** 可用工具列表 */
  tools?: ToolDefinition[];

  /** 工具选择策略 */
  toolChoice?: ToolChoice;
}

// ==================== 响应类型 ====================

/**
 * Token 使用量
 */
export interface TokenUsage {
  /** 输入 Token 数 */
  promptTokens: number;

  /** 输出 Token 数 */
  completionTokens: number;

  /** 总 Token 数 */
  totalTokens: number;
}

/**
 * 聊天响应
 *
 * LLM 的完整响应
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;

  /** 工具调用 */
  toolCalls?: ToolCall[];

  /** Token 使用量 */
  usage: TokenUsage;

  /** 使用的模型 */
  model: string;

  /** 响应延迟（毫秒） */
  latencyMs: number;
}

/**
 * 流式响应块
 *
 * 流式聊天时返回的响应片段
 */
export interface ChatResponseChunk {
  /** 内容片段 */
  content?: string;

  /** 工具调用片段 */
  toolCall?: Partial<ToolCall>;

  /** 是否完成 */
  isComplete: boolean;

  /** 使用量（仅在完成时） */
  usage?: TokenUsage;
}

// ==================== Provider 配置类型 ====================

/**
 * Provider 配置
 *
 * 用于创建 Provider 实例的配置
 */
export interface ProviderConfig {
  /** 唯一标识 */
  id: string;

  /** 提供商类型 */
  type: string;

  /** 显示名称（可选） */
  name?: string;

  /** 模型名称 */
  modelName: string;

  /** API 密钥 */
  apiKey?: string;

  /** 自定义 API 地址 */
  baseUrl?: string;

  /** 额外配置 */
  config?: Record<string, unknown>;

  /** 是否设为默认 */
  isDefault?: boolean;

  /** 优先级 */
  priority?: number;
}

/**
 * Provider 工厂函数类型
 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;

// ==================== LLM Provider 接口 ====================

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  /** 是否健康 */
  ok: boolean;

  /** 延迟（毫秒） */
  latencyMs: number;

  /** 错误信息（如果不健康） */
  error?: string;
}

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  /** 是否成功 */
  success: boolean;

  /** 结果消息 */
  message: string;
}

/**
 * LLM Provider 统一接口
 *
 * 所有 LLM 提供商必须实现此接口
 */
export interface LLMProvider {
  /** Provider 元数据 */
  readonly metadata: ProviderMetadata;

  /**
   * 普通聊天
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 聊天响应
   */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * 流式聊天
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 流式响应迭代器
   */
  chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponseChunk>;

  /**
   * 计算成本（美元）
   *
   * @param promptTokens - 输入 Token 数
   * @param completionTokens - 输出 Token 数
   * @returns 成本（美元）
   */
  calculateCost(promptTokens: number, completionTokens: number): number;

  /**
   * 健康检查
   *
   * 检查 Provider 是否可用
   *
   * @returns 健康检查结果
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * 测试连接
   *
   * 测试与 Provider 的连接是否正常
   *
   * @returns 连接测试结果
   */
  testConnection(): Promise<ConnectionTestResult>;
}
