/**
 * @file LLMClient.ts
 * @description LLM 统一客户端
 *              整合 ModelRegistry，提供简化的聊天接口
 *              支持故障切换、Token 使用记录、流式输出
 * @module llm
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * // 创建客户端并注册 Provider
 * const client = new LLMClient();
 * client.registerAnthropicProvider({
 *   id: 'claude-prod',
 *   modelName: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * // 简单聊天
 * const response = await client.chat([
 *   { role: 'user', content: 'Hello!' },
 * ]);
 *
 * // 带工具调用的聊天
 * const response = await client.chatWithTools(
 *   messages,
 *   [fileReadTool, fileWriteTool]
 * );
 *
 * // 流式聊天
 * for await (const chunk of client.chatStream(messages)) {
 *   process.stdout.write(chunk.content || '');
 * }
 *
 * @see {@link MODEL_MANAGEMENT.md}
 */

import { ModelRegistry } from './ModelRegistry';
import { createAnthropicProvider } from './providers/AnthropicProvider';
import {
  LLMProvider,
  Message,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolDefinition,
  ProviderConfig,
  TokenUsage,
} from './providers/LLMProvider';

/**
 * LLM 调用记录
 */
export interface LLMCallLog {
  /** 调用 ID */
  callId: string;

  /** Provider ID */
  providerId: string;

  /** 模型名称 */
  modelName: string;

  /** Token 使用量 */
  usage: TokenUsage;

  /** 成本（美元） */
  costUsd: number;

  /** 延迟（毫秒） */
  latencyMs: number;

  /** 是否成功 */
  success: boolean;

  /** 错误信息（如果失败） */
  error?: string;

  /** 调用时间 */
  timestamp: Date;
}

/**
 * 故障切换配置
 */
export interface FallbackConfig {
  /** 是否启用故障切换 */
  enabled: boolean;

  /** 最大重试次数 */
  maxRetries: number;

  /** 重试延迟（毫秒） */
  retryDelayMs: number;

  /** 备用 Provider ID 列表 */
  fallbackProviderIds: string[];
}

/**
 * 默认故障切换配置
 */
const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: true,
  maxRetries: 2,
  retryDelayMs: 1000,
  fallbackProviderIds: [],
};

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * LLM 统一客户端
 *
 * 提供统一的 LLM 调用接口，整合多个 Provider
 */
export class LLMClient {
  /** 模型注册表 */
  private registry: ModelRegistry;

  /** 调用历史记录（内存缓存） */
  private callLogs: LLMCallLog[] = [];

  /** 故障切换配置 */
  private fallbackConfig: FallbackConfig;

  /**
   * 创建 LLMClient 实例
   *
   * @param options - 配置选项
   */
  constructor(options?: {
    fallbackConfig?: Partial<FallbackConfig>;
  }) {
    this.registry = new ModelRegistry();
    this.fallbackConfig = {
      ...DEFAULT_FALLBACK_CONFIG,
      ...options?.fallbackConfig,
    };

    // 注册内置 Provider 工厂
    this.setupFactories();
  }

  /**
   * 设置 Provider 工厂
   */
  private setupFactories(): void {
    this.registry.registerFactory('anthropic', createAnthropicProvider);
  }

  /**
   * 注册 Anthropic Provider
   *
   * @param config - Provider 配置
   * @returns 注册的 Provider 实例
   */
  registerAnthropicProvider(config: Omit<ProviderConfig, 'type'>): LLMProvider {
    return this.registry.addProvider({
      ...config,
      type: 'anthropic',
    });
  }

  /**
   * 注册自定义 Provider 工厂
   *
   * @param type - Provider 类型标识
   * @param factory - 工厂函数
   */
  registerFactory(type: string, factory: (config: ProviderConfig) => LLMProvider): void {
    this.registry.registerFactory(type, factory);
  }

  /**
   * 普通聊天（使用默认 Provider）
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 聊天响应
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const provider = this.registry.getDefault();
    return this.executeWithFallback(() => provider.chat(messages, options));
  }

  /**
   * 使用指定 Provider 聊天
   *
   * @param providerId - Provider ID
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 聊天响应
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
   * 流式聊天（使用默认 Provider）
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 流式响应迭代器
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponseChunk> {
    const provider = this.registry.getDefault();

    try {
      for await (const chunk of provider.chatStream(messages, options)) {
        yield chunk;
      }
    } catch (error) {
      // 流式错误处理：尝试故障切换
      if (this.fallbackConfig.enabled && this.fallbackConfig.fallbackProviderIds.length > 0) {
        const fallbackProvider = this.getFallbackProvider();
        if (fallbackProvider) {
          for await (const chunk of fallbackProvider.chatStream(messages, options)) {
            yield chunk;
          }
          return;
        }
      }
      throw error;
    }
  }

  /**
   * 带工具调用的聊天
   *
   * @param messages - 消息列表
   * @param tools - 工具定义列表
   * @param options - 聊天选项
   * @returns 聊天响应
   */
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    // 选择支持工具的 Provider
    const provider = this.getToolCapableProvider();

    return this.executeWithFallback(() =>
      provider.chat(messages, {
        ...options,
        tools,
        toolChoice: options?.toolChoice || 'auto',
      })
    );
  }

  /**
   * 带重试的聊天
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @param maxRetries - 最大重试次数
   * @returns 聊天响应
   */
  async chatWithRetry(
    messages: Message[],
    options?: ChatOptions,
    maxRetries: number = 3
  ): Promise<ChatResponse> {
    const provider = this.registry.getDefault();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await provider.chat(messages, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果是速率限制，等待后重试
        if (this.isRateLimitError(lastError) && attempt < maxRetries - 1) {
          const waitMs = this.fallbackConfig.retryDelayMs * Math.pow(2, attempt);
          await delay(waitMs);
          continue;
        }

        // 其他错误，尝试故障切换
        if (this.fallbackConfig.enabled && attempt < maxRetries - 1) {
          const fallbackProvider = this.getFallbackProvider();
          if (fallbackProvider) {
            return await fallbackProvider.chat(messages, options);
          }
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * 获取默认 Provider
   *
   * @returns 默认 Provider
   */
  getDefaultProvider(): LLMProvider {
    return this.registry.getDefault();
  }

  /**
   * 获取 Provider
   *
   * @param id - Provider ID
   * @returns Provider 实例
   */
  getProvider(id: string): LLMProvider {
    return this.registry.get(id);
  }

  /**
   * 列出所有 Provider
   *
   * @returns Provider 元数据列表
   */
  listProviders() {
    return this.registry.list();
  }

  /**
   * 获取模型注册表
   *
   * @returns ModelRegistry 实例
   */
  getRegistry(): ModelRegistry {
    return this.registry;
  }

  /**
   * 设置故障切换配置
   *
   * @param config - 故障切换配置
   */
  setFallbackConfig(config: Partial<FallbackConfig>): void {
    this.fallbackConfig = {
      ...this.fallbackConfig,
      ...config,
    };
  }

  /**
   * 获取故障切换配置
   *
   * @returns 当前故障切换配置
   */
  getFallbackConfig(): FallbackConfig {
    return { ...this.fallbackConfig };
  }

  /**
   * 获取调用历史
   *
   * @param limit - 返回记录数量限制
   * @returns 调用记录列表
   */
  getCallLogs(limit: number = 100): LLMCallLog[] {
    return this.callLogs.slice(-limit);
  }

  /**
   * 获取 Token 使用统计
   *
   * @returns Token 使用统计
   */
  getTokenUsageStats(): {
    totalCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    successfulCalls: number;
    failedCalls: number;
  } {
    const stats = {
      totalCalls: this.callLogs.length,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      successfulCalls: 0,
      failedCalls: 0,
    };

    for (const log of this.callLogs) {
      stats.totalPromptTokens += log.usage.promptTokens;
      stats.totalCompletionTokens += log.usage.completionTokens;
      stats.totalTokens += log.usage.totalTokens;
      stats.totalCostUsd += log.costUsd;

      if (log.success) {
        stats.successfulCalls++;
      } else {
        stats.failedCalls++;
      }
    }

    return stats;
  }

  /**
   * 清除调用历史
   */
  clearCallLogs(): void {
    this.callLogs = [];
  }

  /**
   * 执行并处理故障切换
   *
   * @param fn - 执行函数
   * @returns 执行结果
   */
  private async executeWithFallback<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    // 首先尝试默认 Provider
    for (let i = 0; i < this.fallbackConfig.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果是速率限制，等待后重试
        if (this.isRateLimitError(lastError)) {
          await delay(this.fallbackConfig.retryDelayMs * (i + 1));
          continue;
        }

        // 其他错误，跳出重试循环，尝试故障切换
        break;
      }
    }

    // 尝试故障切换到备用 Provider
    if (this.fallbackConfig.enabled) {
      const fallbackProvider = this.getFallbackProvider();
      if (fallbackProvider) {
        try {
          return await fn.call({ provider: fallbackProvider });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  }

  /**
   * 获取支持工具的 Provider
   *
   * @returns 支持工具的 Provider
   */
  private getToolCapableProvider(): LLMProvider {
    // 首先尝试默认 Provider
    const defaultProvider = this.registry.getDefault();
    if (defaultProvider.metadata.capabilities.supportsTools) {
      return defaultProvider;
    }

    // 查找支持工具的 Provider
    const providers = this.registry.list();
    const toolProvider = providers.find((p) => p.capabilities.supportsTools);

    if (toolProvider) {
      return this.registry.get(toolProvider.id);
    }

    // 如果没有支持工具的 Provider，返回默认 Provider（调用会失败，但会给出清晰的错误）
    return defaultProvider;
  }

  /**
   * 获取备用 Provider
   *
   * @returns 备用 Provider 或 undefined
   */
  private getFallbackProvider(): LLMProvider | undefined {
    for (const id of this.fallbackConfig.fallbackProviderIds) {
      if (this.registry.has(id)) {
        return this.registry.get(id);
      }
    }

    // 如果没有配置备用 Provider，尝试使用非默认的活跃 Provider
    const providers = this.registry.list().filter((p) => p.isActive && !p.isDefault);
    if (providers.length > 0) {
      return this.registry.get(providers[0].id);
    }

    return undefined;
  }

  /**
   * 检查是否是速率限制错误
   *
   * @param error - 错误对象
   * @returns 是否是速率限制错误
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429')
    );
  }

}

/**
 * 创建 LLM 客户端（便捷函数）
 *
 * @param options - 配置选项
 * @returns LLMClient 实例
 */
export function createLLMClient(options?: {
  fallbackConfig?: Partial<FallbackConfig>;
}): LLMClient {
  return new LLMClient(options);
}
