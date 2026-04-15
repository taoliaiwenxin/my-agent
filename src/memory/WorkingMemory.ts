/**
 * @file WorkingMemory.ts
 * @description 工作记忆模块，负责管理当前会话的短期记忆。
 *              包括对话历史、Token 计数、自动裁剪策略和中间结果缓存。
 *              支持多种裁剪策略：保留最近 N 轮、保留系统消息、滑动窗口等。
 * @module memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 *
 * @example
 * // 创建工作记忆
 * const memory = new WorkingMemory('session-001', {
 *   maxTokens: 4000,
 *   systemPrompt: '你是一个有用的助手'
 * });
 *
 * // 添加用户消息
 * memory.addMessage({ role: 'user', content: '你好' });
 *
 * // 添加助手消息
 * memory.addMessage({ role: 'assistant', content: '你好！有什么我可以帮助你的？' });
 *
 * // 获取所有消息（自动裁剪后）
 * const messages = memory.getMessages();
 *
 * // 检查 Token 使用情况
 * const usage = memory.getTokenUsage();
 *
 * @see {@link types/index.ts}
 */

import { Message, ToolCall } from '../types';

/**
 * Token 使用情况
 */
export interface TokenUsage {
  /** 当前使用的 Token 数量 */
  current: number;
  /** 最大允许的 Token 数量 */
  max: number;
  /** 剩余可用的 Token 数量 */
  remaining: number;
  /** 使用率（0-1） */
  usageRatio: number;
}

/**
 * 裁剪策略类型
 *
 * - sliding_window: 滑动窗口，保留最近的消息
 * - preserve_system: 保留系统消息，裁剪其他消息
 * - oldest_first: 优先移除最旧的消息
 * - ratio_based: 按比例保留各类消息
 */
export type TrimStrategy = 'sliding_window' | 'preserve_system' | 'oldest_first' | 'ratio_based';

/**
 * 工作记忆配置选项
 */
export interface WorkingMemoryOptions {
  /** 最大 Token 限制，默认为 4000 */
  maxTokens?: number;
  /** 系统提示词（可选） */
  systemPrompt?: string;
  /** 裁剪策略，默认为 'sliding_window' */
  trimStrategy?: TrimStrategy;
  /** 保留的消息轮数（当策略为 sliding_window 时使用），默认为 10 */
  keepRounds?: number;
  /** 裁剪时保留的缓冲 Token 数量，默认为 200 */
  bufferTokens?: number;
}

/**
 * 消息条目（内部使用，包含 Token 计数）
 */
interface MessageEntry {
  /** 消息 */
  message: Message;
  /** 消息 Token 数量 */
  tokenCount: number;
  /** 添加时间戳 */
  timestamp: number;
}

/**
 * 工作记忆类
 *
 * 管理当前会话的短期记忆，包括：
 * - 对话历史的添加、查询和清空
 * - Token 计数和估算
 * - 自动裁剪策略（多种策略可选）
 * - 中间结果缓存
 */
export class WorkingMemory {
  /** 会话 ID */
  private sessionId: string;

  /** 消息列表 */
  private messages: MessageEntry[];

  /** 系统提示词 */
  private systemPrompt: string | null;

  /** 最大 Token 限制 */
  private maxTokens: number;

  /** 裁剪策略 */
  private trimStrategy: TrimStrategy;

  /** 保留的消息轮数 */
  private keepRounds: number;

  /** 缓冲 Token 数量 */
  private bufferTokens: number;

  /** 当前任务描述 */
  private currentTask: string | undefined;

  /** 中间结果缓存 */
  private intermediateResults: Map<string, unknown>;

  /** 消息计数器（用于生成唯一 ID） */
  private messageCounter: number;

  /**
   * 创建工作记忆实例
   *
   * @param sessionId - 会话 ID
   * @param options - 配置选项
   *
   * @example
   * const memory = new WorkingMemory('session-001', {
   *   maxTokens: 8000,
   *   systemPrompt: '你是一个代码助手',
   *   trimStrategy: 'sliding_window',
   *   keepRounds: 20
   * });
   */
  constructor(sessionId: string, options: WorkingMemoryOptions = {}) {
    this.sessionId = sessionId;
    this.messages = [];
    this.systemPrompt = options.systemPrompt || null;
    this.maxTokens = options.maxTokens || 4000;
    this.trimStrategy = options.trimStrategy || 'sliding_window';
    this.keepRounds = options.keepRounds || 10;
    this.bufferTokens = options.bufferTokens || 200;
    this.currentTask = undefined;
    this.intermediateResults = new Map();
    this.messageCounter = 0;

    // 如果提供了系统提示词，立即添加
    if (this.systemPrompt) {
      this.addSystemMessage(this.systemPrompt);
    }
  }

  /**
   * 获取会话 ID
   *
   * @returns 会话 ID
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 添加消息到工作记忆
   *
   * 添加消息后会自动检查 Token 限制，如果超出限制会触发裁剪。
   *
   * @param message - 消息对象
   * @returns 添加的消息（可能包含生成的 toolCallId）
   *
   * @example
   * // 添加用户消息
   * memory.addMessage({
   *   role: 'user',
   *   content: '帮我读取文件'
   * });
   *
   * // 添加助手消息（带工具调用）
   * memory.addMessage({
   *   role: 'assistant',
   *   content: '我来帮你读取文件',
   *   toolCalls: [{ id: 'call-1', name: 'file_read', arguments: { path: 'test.txt' } }]
   * });
   *
   * // 添加工具结果消息
   * memory.addMessage({
   *   role: 'tool',
   *   content: '文件内容...',
   *   toolCallId: 'call-1'
   * });
   */
  public addMessage(message: Message): Message {
    // 估算消息的 Token 数量
    const tokenCount = this.estimateMessageTokens(message);

    // 创建消息条目
    const entry: MessageEntry = {
      message: { ...message },
      tokenCount,
      timestamp: Date.now(),
    };

    this.messages.push(entry);
    this.messageCounter++;

    // 检查是否需要裁剪
    this.checkAndTrim();

    return entry.message;
  }

  /**
   * 添加系统消息
   *
   * 系统消息会始终保留在消息列表的开头。
   *
   * @param content - 系统消息内容
   * @returns 添加的系统消息
   *
   * @example
   * memory.addSystemMessage('你是一个专业的代码审查助手');
   */
  public addSystemMessage(content: string): Message {
    // 检查是否已存在系统消息
    const existingSystemIndex = this.messages.findIndex(
      (entry) => entry.message.role === 'system'
    );

    const message: Message = {
      role: 'system',
      content,
    };

    if (existingSystemIndex >= 0) {
      // 替换现有系统消息
      const tokenCount = this.estimateMessageTokens(message);
      this.messages[existingSystemIndex] = {
        message,
        tokenCount,
        timestamp: Date.now(),
      };
    } else {
      // 添加到开头
      const tokenCount = this.estimateMessageTokens(message);
      this.messages.unshift({
        message,
        tokenCount,
        timestamp: Date.now(),
      });
    }

    return message;
  }

  /**
   * 添加用户消息
   *
   * @param content - 消息内容
   * @returns 添加的用户消息
   *
   * @example
   * memory.addUserMessage('请帮我分析这段代码');
   */
  public addUserMessage(content: string): Message {
    return this.addMessage({
      role: 'user',
      content,
    });
  }

  /**
   * 添加助手消息
   *
   * @param content - 消息内容
   * @param toolCalls - 工具调用（可选）
   * @returns 添加的助手消息
   *
   * @example
   * memory.addAssistantMessage('我来帮你分析');
   *
   * // 带工具调用
   * memory.addAssistantMessage('', [
   *   { id: 'call-1', name: 'analyze_code', arguments: { code: '...' } }
   * ]);
   */
  public addAssistantMessage(content: string, toolCalls?: ToolCall[]): Message {
    return this.addMessage({
      role: 'assistant',
      content,
      toolCalls,
    });
  }

  /**
   * 添加工具结果消息
   *
   * @param content - 工具结果内容
   * @param toolCallId - 工具调用 ID
   * @returns 添加的工具消息
   *
   * @example
   * memory.addToolMessage('分析结果：代码存在潜在问题', 'call-1');
   */
  public addToolMessage(content: string, toolCallId: string): Message {
    return this.addMessage({
      role: 'tool',
      content,
      toolCallId,
    });
  }

  /**
   * 获取所有消息
   *
   * 返回当前工作记忆中的所有消息，按添加顺序排列。
   *
   * @returns 消息数组
   *
   * @example
   * const messages = memory.getMessages();
   * messages.forEach(msg => {
   *   console.log(`${msg.role}: ${msg.content}`);
   * });
   */
  public getMessages(): Message[] {
    return this.messages.map((entry) => entry.message);
  }

  /**
   * 获取最近的消息
   *
   * @param count - 获取的消息数量，默认为 1
   * @returns 消息数组（最近的在前）
   *
   * @example
   * // 获取最近的 3 条消息
   * const recent = memory.getRecentMessages(3);
   */
  public getRecentMessages(count: number = 1): Message[] {
    return this.messages
      .slice(-count)
      .map((entry) => entry.message);
  }

  /**
   * 获取最后一条消息
   *
   * @returns 最后一条消息，如果没有消息返回 null
   */
  public getLastMessage(): Message | null {
    if (this.messages.length === 0) {
      return null;
    }
    return this.messages[this.messages.length - 1].message;
  }

  /**
   * 清空工作记忆
   *
   * 清空所有消息和中间结果，但保留系统提示词。
   *
   * @param preserveSystemPrompt - 是否保留系统提示词，默认为 true
   *
   * @example
   * // 清空但保留系统提示词
   * memory.clear();
   *
   * // 完全清空
   * memory.clear(false);
   */
  public clear(preserveSystemPrompt: boolean = true): void {
    if (preserveSystemPrompt && this.systemPrompt) {
      // 只保留系统消息
      const systemEntry = this.messages.find(
        (entry) => entry.message.role === 'system'
      );
      this.messages = systemEntry ? [systemEntry] : [];
    } else {
      this.messages = [];
      this.systemPrompt = null;
    }

    this.intermediateResults.clear();
    this.currentTask = undefined;
  }

  /**
   * 获取 Token 使用情况
   *
   * @returns Token 使用情况
   *
   * @example
   * const usage = memory.getTokenUsage();
   * console.log(`使用了 ${usage.current}/${usage.max} tokens (${(usage.usageRatio * 100).toFixed(1)}%)`);
   */
  public getTokenUsage(): TokenUsage {
    const current = this.getCurrentTokenCount();
    const remaining = this.maxTokens - current;
    const usageRatio = current / this.maxTokens;

    return {
      current,
      max: this.maxTokens,
      remaining: Math.max(0, remaining),
      usageRatio: Math.min(1, usageRatio),
    };
  }

  /**
   * 获取当前 Token 数量
   *
   * @returns 当前 Token 数量
   */
  public getCurrentTokenCount(): number {
    return this.messages.reduce((sum, entry) => sum + entry.tokenCount, 0);
  }

  /**
   * 检查是否超过 Token 限制
   *
   * @returns true 如果超过限制
   */
  public isOverLimit(): boolean {
    return this.getCurrentTokenCount() > this.maxTokens - this.bufferTokens;
  }

  /**
   * 估算消息的 Token 数量
   *
   * 使用简化的估算算法：
   * - 中文字符：1.5 tokens/字
   * - 英文单词：1 token/词
   * - 消息元数据：4 tokens
   *
   * @param message - 消息对象
   * @returns 估算的 Token 数量
   *
   * @example
   * const tokens = memory.estimateMessageTokens({
   *   role: 'user',
   *   content: 'Hello world'
   * });
   * console.log(`估算 ${tokens} tokens`);
   */
  public estimateMessageTokens(message: Message): number {
    let tokenCount = 4; // 消息元数据开销

    // 计算内容 Token
    tokenCount += this.estimateTextTokens(message.content);

    // 计算工具调用的 Token
    if (message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        tokenCount += 4; // 工具调用元数据
        tokenCount += this.estimateTextTokens(toolCall.name);
        tokenCount += this.estimateTextTokens(JSON.stringify(toolCall.arguments));
      }
    }

    // 工具调用 ID
    if (message.toolCallId) {
      tokenCount += this.estimateTextTokens(message.toolCallId);
    }

    return tokenCount;
  }

  /**
   * 估算文本的 Token 数量
   *
   * @private
   * @param text - 文本内容
   * @returns 估算的 Token 数量
   */
  private estimateTextTokens(text: string): number {
    if (!text) return 0;

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文单词（简化估算）
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    // 统计其他字符（标点、数字等）
    const otherChars = text.length - chineseChars - text.replace(/[\u4e00-\u9fa5]/g, '').split(/\s+/).join('').length;

    // 中文字符 1.5 tokens/字，英文 1 token/词，其他 0.5 token/字符
    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
  }

  /**
   * 检查并裁剪消息
   *
   * 如果当前 Token 数量超过限制，根据裁剪策略移除消息。
   *
   * @private
   */
  private checkAndTrim(): void {
    const currentTokens = this.getCurrentTokenCount();
    const targetTokens = this.maxTokens - this.bufferTokens;

    if (currentTokens <= targetTokens) {
      return;
    }

    // 根据策略裁剪
    switch (this.trimStrategy) {
      case 'sliding_window':
        this.trimSlidingWindow(targetTokens);
        break;
      case 'preserve_system':
        this.trimPreserveSystem(targetTokens);
        break;
      case 'oldest_first':
        this.trimOldestFirst(targetTokens);
        break;
      case 'ratio_based':
        this.trimRatioBased(targetTokens);
        break;
      default:
        this.trimSlidingWindow(targetTokens);
    }
  }

  /**
   * 滑动窗口裁剪策略
   *
   * 保留最近 keepRounds 轮对话（用户+助手算一轮）。
   *
   * @private
   * @param targetTokens - 目标 Token 数量
   */
  private trimSlidingWindow(targetTokens: number): void {
    // 找到系统消息
    const systemIndex = this.messages.findIndex(
      (entry) => entry.message.role === 'system'
    );
    const systemEntry = systemIndex >= 0 ? this.messages[systemIndex] : null;

    // 过滤出非系统消息
    let nonSystemMessages = this.messages.filter(
      (entry) => entry.message.role !== 'system'
    );

    // 计算轮数（用户+助手=一轮）
    let rounds = 0;
    let messageIndex = nonSystemMessages.length - 1;

    while (messageIndex >= 0 && rounds < this.keepRounds) {
      const entry = nonSystemMessages[messageIndex];
      if (entry.message.role === 'user' || entry.message.role === 'assistant') {
        rounds++;
      }
      messageIndex--;
    }

    // 保留的消息
    const keepMessages = nonSystemMessages.slice(messageIndex + 1);

    // 重新组装消息列表
    this.messages = systemEntry ? [systemEntry, ...keepMessages] : keepMessages;

    // 如果仍然超过限制，继续移除最旧的消息（保留系统消息）
    while (this.getCurrentTokenCount() > targetTokens && this.messages.length > 1) {
      if (this.messages[0].message.role === 'system') {
        // 如果第一条是系统消息，移除第二条
        if (this.messages.length > 1) {
          this.messages.splice(1, 1);
        } else {
          break;
        }
      } else {
        this.messages.shift();
      }
    }
  }

  /**
   * 保留系统消息的裁剪策略
   *
   * 始终保留系统消息，优先移除最旧的用户/助手消息。
   *
   * @private
   * @param targetTokens - 目标 Token 数量
   */
  private trimPreserveSystem(targetTokens: number): void {
    // 找到系统消息
    const systemIndex = this.messages.findIndex(
      (entry) => entry.message.role === 'system'
    );

    // 从后向前遍历，保留最新消息直到达到目标
    let currentTokens = this.getCurrentTokenCount();
    let removeIndex = 0;

    while (currentTokens > targetTokens && removeIndex < this.messages.length) {
      if (removeIndex === systemIndex) {
        // 跳过系统消息
        removeIndex++;
        continue;
      }

      currentTokens -= this.messages[removeIndex].tokenCount;
      this.messages.splice(removeIndex, 1);

      // 调整系统消息索引
      if (systemIndex > removeIndex) {
        // 系统消息索引前移
      }
    }
  }

  /**
   * 优先移除最旧消息的裁剪策略
   *
   * 不区分消息类型，优先移除最旧的消息。
   *
   * @private
   * @param targetTokens - 目标 Token 数量
   */
  private trimOldestFirst(targetTokens: number): void {
    while (this.getCurrentTokenCount() > targetTokens && this.messages.length > 1) {
      this.messages.shift();
    }
  }

  /**
   * 按比例保留的裁剪策略
   *
   * 按比例保留系统、用户、助手消息。
   *
   * @private
   * @param targetTokens - 目标 Token 数量
   */
  private trimRatioBased(targetTokens: number): void {
    // 分类消息
    const systemMessages = this.messages.filter(
      (entry) => entry.message.role === 'system'
    );
    const userMessages = this.messages.filter(
      (entry) => entry.message.role === 'user'
    );
    const assistantMessages = this.messages.filter(
      (entry) => entry.message.role === 'assistant'
    );
    const toolMessages = this.messages.filter(
      (entry) => entry.message.role === 'tool'
    );

    // 始终保留所有系统消息
    // 按比例保留用户和助手消息
    const targetUserTokens = targetTokens * 0.3;
    const targetAssistantTokens = targetTokens * 0.5;
    const targetToolTokens = targetTokens * 0.2;

    const keptUser = this.trimMessagesToTarget(userMessages, targetUserTokens);
    const keptAssistant = this.trimMessagesToTarget(
      assistantMessages,
      targetAssistantTokens
    );
    const keptTool = this.trimMessagesToTarget(toolMessages, targetToolTokens);

    // 按原始顺序重新组装
    const keptMessageIds = new Set([
      ...systemMessages.map((e) => e.timestamp),
      ...keptUser.map((e) => e.timestamp),
      ...keptAssistant.map((e) => e.timestamp),
      ...keptTool.map((e) => e.timestamp),
    ]);

    this.messages = this.messages.filter((entry) =>
      keptMessageIds.has(entry.timestamp)
    );
  }

  /**
   * 将消息列表裁剪到目标 Token 数量
   *
   * @private
   * @param entries - 消息条目列表
   * @param target - 目标 Token 数量
   * @returns 保留的消息列表
   */
  private trimMessagesToTarget(
    entries: MessageEntry[],
    target: number
  ): MessageEntry[] {
    let totalTokens = entries.reduce((sum, e) => sum + e.tokenCount, 0);

    if (totalTokens <= target) {
      return entries;
    }

    // 保留最新的消息
    const kept: MessageEntry[] = [];
    let currentTokens = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      if (currentTokens + entries[i].tokenCount <= target) {
        kept.unshift(entries[i]);
        currentTokens += entries[i].tokenCount;
      } else {
        break;
      }
    }

    return kept;
  }

  /**
   * 手动裁剪消息
   *
   * 强制执行裁剪，将消息数量减少到目标范围内。
   *
   * @param targetTokens - 目标 Token 数量（不包含缓冲），默认为 maxTokens - bufferTokens
   * @returns 裁剪后的消息数量
   *
   * @example
   * const remainingCount = memory.trim(3000);
   * console.log(`裁剪后剩余 ${remainingCount} 条消息`);
   */
  public trim(targetTokens?: number): number {
    const target = targetTokens || this.maxTokens - this.bufferTokens;

    switch (this.trimStrategy) {
      case 'sliding_window':
        this.trimSlidingWindow(target);
        break;
      case 'preserve_system':
        this.trimPreserveSystem(target);
        break;
      case 'oldest_first':
        this.trimOldestFirst(target);
        break;
      case 'ratio_based':
        this.trimRatioBased(target);
        break;
    }

    return this.messages.length;
  }

  /**
   * 设置当前任务
   *
   * @param task - 任务描述
   */
  public setCurrentTask(task: string): void {
    this.currentTask = task;
  }

  /**
   * 获取当前任务
   *
   * @returns 任务描述，如果没有设置返回 undefined
   */
  public getCurrentTask(): string | undefined {
    return this.currentTask;
  }

  /**
   * 清除当前任务
   */
  public clearCurrentTask(): void {
    this.currentTask = undefined;
  }

  /**
   * 设置中间结果
   *
   * @param key - 键名
   * @param value - 值
   *
   * @example
   * memory.setIntermediateResult('fileContent', '文件内容...');
   */
  public setIntermediateResult(key: string, value: unknown): void {
    this.intermediateResults.set(key, value);
  }

  /**
   * 获取中间结果
   *
   * @param key - 键名
   * @returns 值，如果不存在返回 undefined
   *
   * @example
   * const content = memory.getIntermediateResult('fileContent');
   */
  public getIntermediateResult(key: string): unknown {
    return this.intermediateResults.get(key);
  }

  /**
   * 检查中间结果是否存在
   *
   * @param key - 键名
   * @returns true 如果存在
   */
  public hasIntermediateResult(key: string): boolean {
    return this.intermediateResults.has(key);
  }

  /**
   * 删除中间结果
   *
   * @param key - 键名
   * @returns true 如果删除成功
   */
  public deleteIntermediateResult(key: string): boolean {
    return this.intermediateResults.delete(key);
  }

  /**
   * 获取所有中间结果
   *
   * @returns 中间结果 Map
   */
  public getAllIntermediateResults(): Map<string, unknown> {
    return new Map(this.intermediateResults);
  }

  /**
   * 清空中间结果
   */
  public clearIntermediateResults(): void {
    this.intermediateResults.clear();
  }

  /**
   * 获取消息数量
   *
   * @returns 消息数量
   */
  public getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * 转换为 JSON 对象
   *
   * 用于序列化和持久化。
   *
   * @returns 工作记忆的 JSON 表示
   *
   * @example
   * const json = memory.toJSON();
   * fs.writeFileSync('memory.json', JSON.stringify(json));
   */
  public toJSON(): {
    sessionId: string;
    messages: Message[];
    tokenCount: number;
    maxTokens: number;
    currentTask?: string;
    intermediateResults: Record<string, unknown>;
  } {
    return {
      sessionId: this.sessionId,
      messages: this.getMessages(),
      tokenCount: this.getCurrentTokenCount(),
      maxTokens: this.maxTokens,
      currentTask: this.currentTask,
      intermediateResults: Object.fromEntries(this.intermediateResults),
    };
  }

  /**
   * 从 JSON 对象恢复工作记忆
   *
   * @param json - JSON 对象
   * @param options - 配置选项
   * @returns 恢复的 WorkingMemory 实例
   *
   * @example
   * const json = JSON.parse(fs.readFileSync('memory.json', 'utf8'));
   * const memory = WorkingMemory.fromJSON(json);
   */
  public static fromJSON(
    json: {
      sessionId: string;
      messages: Message[];
      tokenCount?: number;
      maxTokens?: number;
      currentTask?: string;
      intermediateResults?: Record<string, unknown>;
    },
    options: WorkingMemoryOptions = {}
  ): WorkingMemory {
    const memory = new WorkingMemory(json.sessionId, {
      ...options,
      maxTokens: json.maxTokens || options.maxTokens,
    });

    // 恢复消息
    for (const message of json.messages) {
      memory.addMessage(message);
    }

    // 恢复当前任务
    if (json.currentTask) {
      memory.setCurrentTask(json.currentTask);
    }

    // 恢复中间结果
    if (json.intermediateResults) {
      for (const [key, value] of Object.entries(json.intermediateResults)) {
        memory.setIntermediateResult(key, value);
      }
    }

    return memory;
  }
}
