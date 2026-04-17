/**
 * @file AnthropicProvider.ts
 * @description Anthropic Claude Provider 实现
 *              支持 Claude 3 系列模型（Opus, Sonnet, Haiku）
 *              实现聊天、流式输出、成本计算、健康检查等功能
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * // 创建 Provider
 * const provider = new AnthropicProvider({
 *   id: 'claude-prod',
 *   type: 'anthropic',
 *   modelName: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * // 普通聊天
 * const response = await provider.chat([
 *   { role: 'user', content: 'Hello!' },
 * ]);
 *
 * // 流式聊天
 * for await (const chunk of provider.chatStream(messages)) {
 *   process.stdout.write(chunk.content || '');
 * }
 *
 * @see {@link MODEL_MANAGEMENT.md}
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  ProviderMetadata,
  ProviderConfig,
  Message,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
  ToolDefinition,
  ModelCapabilities,
  HealthCheckResult,
  ConnectionTestResult,
  ContentPart,
} from './LLMProvider';

/**
 * Anthropic 模型定价（每 1M tokens，美元）
 */
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-opus-latest': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-haiku-latest': { input: 0.25, output: 1.25 },
};

/**
 * Anthropic 默认模型能力
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsVision: true,
  supportsTools: true,
  supportsStreaming: true,
  supportsJSONMode: false, // Anthropic 暂不支持原生 JSON 模式
  maxTokens: 4096,
  contextWindow: 200000,
};

/**
 * Anthropic Claude Provider 实现
 */
export class AnthropicProvider implements LLMProvider {
  /** Anthropic 客户端实例 */
  private client: Anthropic;

  /** Provider 元数据 */
  readonly metadata: ProviderMetadata;

  /** Provider 配置 */
  private config: ProviderConfig;

  /**
   * 创建 AnthropicProvider 实例
   *
   * @param config - Provider 配置
   * @throws {Error} 如果未提供 API Key
   */
  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.config = config;

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    this.metadata = {
      id: config.id,
      name: config.name || this.getDisplayName(config.modelName),
      type: 'anthropic',
      modelName: config.modelName,
      capabilities: this.detectCapabilities(config.modelName),
      isActive: true,
      isDefault: config.isDefault || false,
    };
  }

  /**
   * 普通聊天
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 聊天响应
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      // 转换消息格式
      const anthropicMessages = this.convertMessages(messages);

      // 转换工具定义
      const tools = options?.tools?.map((t) => this.convertTool(t));

      // 构建请求参数
      const requestParams: Anthropic.MessageCreateParams = {
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        stop_sequences: options?.stopSequences,
        ...(tools && tools.length > 0 && { tools }),
        ...(options?.toolChoice && {
          tool_choice: this.convertToolChoice(options.toolChoice),
        }),
      };

      // 发送请求
      const response = await this.client.messages.create(requestParams);

      const latencyMs = Date.now() - startTime;

      // 提取文本内容
      const textContent = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('');

      // 提取工具调用
      const toolCalls: ToolCall[] = response.content
        .filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
        .map((c) => ({
          id: c.id,
          name: c.name,
          arguments: c.input as Record<string, unknown>,
        }));

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        latencyMs,
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 流式聊天
   *
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 流式响应迭代器
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponseChunk> {
    try {
      // 转换消息格式
      const anthropicMessages = this.convertMessages(messages);

      // 转换工具定义
      const tools = options?.tools?.map((t) => this.convertTool(t));

      // 构建请求参数
      const requestParams: Anthropic.MessageCreateParams = {
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        stop_sequences: options?.stopSequences,
        stream: true,
        ...(tools && tools.length > 0 && { tools }),
        ...(options?.toolChoice && {
          tool_choice: this.convertToolChoice(options.toolChoice),
        }),
      };

      // 发送流式请求
      const stream = await this.client.messages.create(requestParams);

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        // 处理内容块增量
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta;

          // 文本增量
          if (delta.type === 'text_delta') {
            yield {
              content: delta.text,
              isComplete: false,
            };
          }
          // 输入 JSON 增量（工具调用参数）
          else if (delta.type === 'input_json_delta') {
            yield {
              toolCall: {
                arguments: JSON.parse(delta.partial_json || '{}'),
              },
              isComplete: false,
            };
          }
        }
        // 处理消息增量（使用统计）
        else if (chunk.type === 'message_delta') {
          if (chunk.usage) {
            completionTokens = chunk.usage.output_tokens;
          }
        }
        // 处理消息开始（输入 token 数）
        else if (chunk.type === 'message_start') {
          promptTokens = chunk.message.usage?.input_tokens || 0;
          completionTokens = chunk.message.usage?.output_tokens || 0;
        }
      }

      // 发送完成标记
      yield {
        isComplete: true,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 计算成本（美元）
   *
   * @param promptTokens - 输入 Token 数
   * @param completionTokens - 输出 Token 数
   * @returns 成本（美元）
   */
  calculateCost(promptTokens: number, completionTokens: number): number {
    const pricing = ANTHROPIC_PRICING[this.config.modelName];
    if (!pricing) {
      // 对于未知模型，使用 Sonnet 的定价作为默认值
      const defaultPricing = ANTHROPIC_PRICING['claude-3-5-sonnet-20241022'];
      const inputCost = (promptTokens / 1_000_000) * defaultPricing.input;
      const outputCost = (completionTokens / 1_000_000) * defaultPricing.output;
      return inputCost + outputCost;
    }

    const inputCost = (promptTokens / 1_000_000) * pricing.input;
    const outputCost = (completionTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * 健康检查
   *
   * 发送一个简单的请求来检查服务是否可用
   *
   * @returns 健康检查结果
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      await this.client.messages.create({
        model: this.config.modelName,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });

      return {
        ok: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 测试连接
   *
   * @returns 连接测试结果
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.healthCheck();

    if (result.ok) {
      return {
        success: true,
        message: `Connection successful (${result.latencyMs}ms)`,
      };
    }

    return {
      success: false,
      message: `Connection failed: ${result.error}`,
    };
  }

  /**
   * 获取显示名称
   *
   * @param modelName - 模型名称
   * @returns 显示名称
   */
  private getDisplayName(modelName: string): string {
    const nameMap: Record<string, string> = {
      'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
      'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Latest)',
      'claude-3-opus-20240229': 'Claude 3 Opus',
      'claude-3-opus-latest': 'Claude 3 Opus (Latest)',
      'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
      'claude-3-haiku-20240307': 'Claude 3 Haiku',
      'claude-3-haiku-latest': 'Claude 3 Haiku (Latest)',
    };

    return nameMap[modelName] || modelName;
  }

  /**
   * 检测模型能力
   *
   * @param modelName - 模型名称
   * @returns 模型能力
   */
  private detectCapabilities(modelName: string): ModelCapabilities {
    const visionModels = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet'];
    const supportsVision = visionModels.some((m) => modelName.includes(m));

    // Haiku 有较小的上下文窗口
    const isHaiku = modelName.includes('haiku');
    const contextWindow = isHaiku ? 200000 : 200000;
    const maxTokens = isHaiku ? 4096 : 8192;

    return {
      ...DEFAULT_CAPABILITIES,
      supportsVision,
      maxTokens,
      contextWindow,
    };
  }

  /**
   * 转换消息格式
   *
   * 将内部 Message 格式转换为 Anthropic 格式
   *
   * @param messages - 内部消息列表
   * @returns Anthropic 消息列表
   */
  private convertMessages(messages: Message[]): any[] {
    return messages.map((message) => {
      // 处理多模态内容
      if (Array.isArray(message.content)) {
        return {
          role: this.convertRole(message.role),
          content: message.content.map((part) => this.convertContentPart(part)),
        };
      }

      // 处理工具调用（assistant 消息）
      if (message.role === 'assistant' && message.toolCalls) {
        const content: any[] = [];

        // 添加文本内容（如果有）
        if (message.content) {
          content.push({ type: 'text', text: message.content as string });
        }

        // 添加工具调用
        for (const toolCall of message.toolCalls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }

        return {
          role: 'assistant',
          content,
        };
      }

      // 处理工具响应（tool 消息）
      if (message.role === 'tool' && message.toolCallId) {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: message.content as string,
            },
          ],
        };
      }

      // 普通文本消息
      return {
        role: this.convertRole(message.role),
        content: message.content as string,
      };
    });
  }

  /**
   * 转换内容片段
   *
   * @param part - 内容片段
   * @returns Anthropic 内容块
   */
  private convertContentPart(part: ContentPart): { type: string; text?: string; source?: { type: string; url: string } } {
    if (part.type === 'text') {
      return { type: 'text', text: part.text || '' };
    }

    if (part.type === 'image_url' && part.imageUrl) {
      return {
        type: 'image',
        source: {
          type: 'url',
          url: part.imageUrl.url,
        },
      };
    }

    // 默认返回空文本
    return { type: 'text', text: '' };
  }

  /**
   * 转换角色
   *
   * Anthropic 不支持 'system' 角色，需要特殊处理
   *
   * @param role - 内部角色
   * @returns Anthropic 角色
   */
  private convertRole(role: Message['role']): 'user' | 'assistant' {
    // Anthropic API 只接受 'user' 和 'assistant' 角色
    // 'system' 消息应该通过 system 参数传递（在新版 API 中）
    if (role === 'system') {
      return 'user';
    }
    if (role === 'tool') {
      return 'user';
    }
    return role;
  }

  /**
   * 转换工具定义
   *
   * @param tool - 工具定义
   * @returns Anthropic 工具定义
   */
  private convertTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    };
  }

  /**
   * 转换工具选择策略
   *
   * @param choice - 工具选择策略
   * @returns Anthropic 工具选择策略
   */
  private convertToolChoice(
    choice: 'auto' | 'none' | { name: string }
  ): Anthropic.ToolChoice {
    if (choice === 'auto') {
      return { type: 'auto' };
    }
    // 'none' is not supported in Anthropic SDK, use 'auto' as fallback
    if (choice === 'none') {
      return { type: 'auto' };
    }
    return {
      type: 'tool',
      name: choice.name,
    };
  }

  /**
   * 包装错误
   *
   * @param error - 原始错误
   * @returns 包装后的错误
   */
  private wrapError(error: unknown): Error {
    // Check if it's an API error by checking for status property
    if (error instanceof Error && 'status' in error) {
      return new Error(`Anthropic API Error (${(error as any).status}): ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 创建 Anthropic Provider（工厂函数）
 *
 * @param config - Provider 配置
 * @returns AnthropicProvider 实例
 *
 * @example
 * const provider = createAnthropicProvider({
 *   id: 'claude-prod',
 *   type: 'anthropic',
 *   modelName: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 */
export function createAnthropicProvider(config: ProviderConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}
