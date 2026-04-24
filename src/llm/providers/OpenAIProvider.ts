/**
 * @file OpenAIProvider.ts
 * @description OpenAI Provider 实现
 *              支持 GPT-4o、GPT-4、GPT-3.5 系列模型
 *              实现聊天、流式输出、成本计算、健康检查等功能
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-22
 * @version 1.0.0
 *
 * @example
 * // 创建 Provider
 * const provider = new OpenAIProvider({
 *   id: 'gpt-4o',
 *   type: 'openai',
 *   modelName: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
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
 */

import OpenAI from 'openai';
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
 * OpenAI 模型定价（每 1M tokens，美元）
 */
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-4o 系列
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },

  // GPT-4 系列
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4-turbo-2024-04-09': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-0125-preview': { input: 10.0, output: 30.0 },
  'gpt-4-1106-preview': { input: 10.0, output: 30.0 },

  // GPT-3.5 系列
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-1106': { input: 1.0, output: 2.0 },
};

/**
 * OpenAI 默认模型能力
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsVision: false,
  supportsTools: true,
  supportsStreaming: true,
  supportsJSONMode: true,
  maxTokens: 4096,
  contextWindow: 8192,
};

/**
 * OpenAI Provider 实现
 */
export class OpenAIProvider implements LLMProvider {
  /** OpenAI 客户端实例 */
  private client: OpenAI;

  /** Provider 元数据 */
  readonly metadata: ProviderMetadata;

  /** Provider 配置 */
  private config: ProviderConfig;

  /**
   * 创建 OpenAIProvider 实例
   *
   * @param config - Provider 配置
   * @throws {Error} 如果未提供 API Key
   */
  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.config = config;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    this.metadata = {
      id: config.id,
      name: config.name || this.getDisplayName(config.modelName),
      type: 'openai',
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
      const openaiMessages = this.convertMessages(messages);

      // 转换工具定义
      const tools = options?.tools?.map((t) => this.convertTool(t));

      // 构建请求参数
      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.config.modelName,
        messages: openaiMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        stop: options?.stopSequences,
        ...(tools && tools.length > 0 && { tools }),
        ...(options?.toolChoice && {
          tool_choice: this.convertToolChoice(options.toolChoice),
        }),
      };

      // 发送请求
      const response = await this.client.chat.completions.create(requestParams);

      const latencyMs = Date.now() - startTime;
      const choice = response.choices[0];

      // 提取文本内容
      const textContent = choice.message.content || '';

      // 提取工具调用
      const toolCalls: ToolCall[] = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: this.safeParseJSON(tc.function.arguments),
      })) || [];

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
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
      const openaiMessages = this.convertMessages(messages);

      // 转换工具定义
      const tools = options?.tools?.map((t) => this.convertTool(t));

      // 构建请求参数
      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.config.modelName,
        messages: openaiMessages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        top_p: options?.topP,
        stop: options?.stopSequences,
        stream: true,
        ...(tools && tools.length > 0 && { tools }),
        ...(options?.toolChoice && {
          tool_choice: this.convertToolChoice(options.toolChoice),
        }),
      };

      // 发送流式请求
      const stream = await this.client.chat.completions.create(requestParams);

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // 文本内容
        if (delta.content) {
          yield {
            content: delta.content,
            isComplete: false,
          };
        }

        // 工具调用
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              yield {
                toolCall: {
                  id: tc.id,
                  name: tc.function.name,
                  arguments: tc.function.arguments
                    ? this.safeParseJSON(tc.function.arguments)
                    : {},
                },
                isComplete: false,
              };
            }
          }
        }

        // 使用统计（在最后一个 chunk 中）
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
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
    const pricing = OPENAI_PRICING[this.config.modelName];
    if (!pricing) {
      // 对于未知模型，使用 GPT-4o 的定价作为默认值
      const defaultPricing = OPENAI_PRICING['gpt-4o'];
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
      await this.client.chat.completions.create({
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
      'gpt-4o': 'GPT-4o',
      'gpt-4o-2024-08-06': 'GPT-4o (2024-08-06)',
      'gpt-4o-2024-11-20': 'GPT-4o (2024-11-20)',
      'gpt-4o-mini': 'GPT-4o Mini',
      'gpt-4o-mini-2024-07-18': 'GPT-4o Mini (2024-07-18)',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4-turbo-2024-04-09': 'GPT-4 Turbo (2024-04-09)',
      'gpt-4': 'GPT-4',
      'gpt-4-0125-preview': 'GPT-4 Preview (0125)',
      'gpt-4-1106-preview': 'GPT-4 Preview (1106)',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-3.5-turbo-0125': 'GPT-3.5 Turbo (0125)',
      'gpt-3.5-turbo-1106': 'GPT-3.5 Turbo (1106)',
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
    // 视觉模型
    const visionModels = ['gpt-4o'];
    const supportsVision = visionModels.some((m) => modelName.startsWith(m));

    // 上下文窗口和最大 tokens
    let contextWindow = 8192;
    let maxTokens = 4096;

    if (modelName.includes('gpt-4o')) {
      contextWindow = 128000;
      maxTokens = 16384;
    } else if (modelName.includes('gpt-4-turbo')) {
      contextWindow = 128000;
      maxTokens = 4096;
    } else if (modelName.includes('gpt-4')) {
      contextWindow = 8192;
      maxTokens = 8192;
    } else if (modelName.includes('gpt-3.5-turbo')) {
      contextWindow = 16385;
      maxTokens = 4096;
    }

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
   * 将内部 Message 格式转换为 OpenAI 格式
   *
   * @param messages - 内部消息列表
   * @returns OpenAI 消息列表
   */
  private convertMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((message) => {
      // 处理多模态内容
      if (Array.isArray(message.content)) {
        return {
          role: message.role === 'tool' ? 'user' : message.role,
          content: message.content.map((part) => this.convertContentPart(part)),
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }

      // 处理工具调用（assistant 消息）
      if (message.role === 'assistant' && message.toolCalls) {
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      // 处理工具响应（tool 消息）
      if (message.role === 'tool' && message.toolCallId) {
        return {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content as string,
        };
      }

      // 普通文本消息
      return {
        role: message.role,
        content: message.content as string,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  /**
   * 转换内容片段
   *
   * @param part - 内容片段
   * @returns OpenAI 内容块
   */
  private convertContentPart(part: ContentPart): OpenAI.Chat.ChatCompletionContentPart {
    if (part.type === 'text') {
      return { type: 'text', text: part.text || '' };
    }

    if (part.type === 'image_url' && part.imageUrl) {
      return {
        type: 'image_url',
        image_url: {
          url: part.imageUrl.url,
          detail: part.imageUrl.detail || 'auto',
        },
      };
    }

    // 默认返回空文本
    return { type: 'text', text: '' };
  }

  /**
   * 转换工具定义
   *
   * @param tool - 工具定义
   * @returns OpenAI 工具定义
   */
  private convertTool(tool: ToolDefinition): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  /**
   * 转换工具选择策略
   *
   * @param choice - 工具选择策略
   * @returns OpenAI 工具选择策略
   */
  private convertToolChoice(
    choice: 'auto' | 'none' | { name: string }
  ): OpenAI.Chat.ChatCompletionToolChoiceOption {
    if (choice === 'auto') {
      return 'auto';
    }
    if (choice === 'none') {
      return 'none';
    }
    return {
      type: 'function',
      function: { name: choice.name },
    };
  }

  /**
   * 安全解析 JSON
   *
   * @param json - JSON 字符串
   * @returns 解析后的对象
   */
  private safeParseJSON(json: string): Record<string, unknown> {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  /**
   * 包装错误
   *
   * @param error - 原始错误
   * @returns 包装后的错误
   */
  private wrapError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      return new Error(`OpenAI API Error (${error.status}): ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 创建 OpenAI Provider（工厂函数）
 *
 * @param config - Provider 配置
 * @returns OpenAIProvider 实例
 *
 * @example
 * const provider = createOpenAIProvider({
 *   id: 'gpt-4o',
 *   type: 'openai',
 *   modelName: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 */
export function createOpenAIProvider(config: ProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
