/**
 * @file MemorySystem.ts
 * @description 记忆系统整合模块，负责整合 WorkingMemory 和 SQLite 持久化。
 *              提供会话的创建、加载、保存和崩溃恢复功能。
 *              是记忆层的统一入口，协调内存和数据库操作。
 * @module memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 *
 * @example
 * // 创建记忆系统
 * const memorySystem = new MemorySystem(db);
 *
 * // 创建新会话
 * const { session, workingMemory } = await memorySystem.createSession('分析代码库');
 *
 * // 添加对话到工作记忆
 * workingMemory.addUserMessage('请分析这个文件');
 * workingMemory.addAssistantMessage('我来分析一下');
 *
 * // 保存会话状态
 * await memorySystem.saveSession(session.sessionId, workingMemory);
 *
 * // 恢复会话
 * const recovered = await memorySystem.loadSession(session.sessionId);
 *
 * // 崩溃恢复
 * const { recoveredSession, recoveredMemory, lastStep } = await memorySystem.recoverSession(session.sessionId);
 *
 * @see {@link WorkingMemory}
 * @see {@link Sessions}
 * @see {@link Steps}
 */

import { SQLiteClient } from './SQLiteClient';
import { Sessions } from './Sessions';
import { Steps } from './Steps';
import { WorkingMemory, WorkingMemoryOptions } from './WorkingMemory';
import { Session, Step, Message } from '../types';

/**
 * 创建会话结果
 */
export interface CreateSessionResult {
  /** 会话信息 */
  session: Session;
  /** 工作记忆实例 */
  workingMemory: WorkingMemory;
}

/**
 * 加载会话结果
 */
export interface LoadSessionResult {
  /** 会话信息 */
  session: Session;
  /** 工作记忆实例（包含历史消息） */
  workingMemory: WorkingMemory;
  /** 所有步骤 */
  steps: Step[];
}

/**
 * 崩溃恢复结果
 */
export interface RecoveryResult {
  /** 会话信息 */
  session: Session;
  /** 恢复后的工作记忆 */
  workingMemory: WorkingMemory;
  /** 最后执行的步骤 */
  lastStep: Step | null;
  /** 是否需要恢复 */
  needsRecovery: boolean;
}

/**
 * 记忆系统配置
 */
export interface MemorySystemConfig {
  /** 工作记忆配置 */
  workingMemoryOptions?: WorkingMemoryOptions;
  /** 是否自动保存，默认为 true */
  autoSave?: boolean;
  /** 自动保存间隔（毫秒），默认为 30000 */
  autoSaveInterval?: number;
}

/**
 * 记忆系统类
 *
 * 整合 WorkingMemory 和 SQLite 持久化，提供统一的记忆管理接口：
 * - 会话生命周期管理（创建、加载、保存、关闭）
 * - 工作记忆与数据库的同步
 * - 崩溃恢复功能
 * - 可选的自动保存
 */
export class MemorySystem {
  /** SQLite 客户端 */
  private _db: SQLiteClient;

  /** 会话管理器 */
  private sessions: Sessions;

  /** 步骤管理器 */
  private steps: Steps;

  /** 工作记忆配置 */
  private workingMemoryOptions: WorkingMemoryOptions;

  /** 自动保存配置 */
  private autoSave: boolean;

  /** 自动保存间隔 */
  private autoSaveInterval: number;

  /** 自动保存定时器 */
  private autoSaveTimers: Map<string, NodeJS.Timeout>;

  /** 活跃的工作记忆实例 */
  private activeMemories: Map<string, WorkingMemory>;

  /**
   * 创建记忆系统实例
   *
   * @param db - 已连接的 SQLiteClient 实例
   * @param config - 配置选项
   *
   * @example
   * const db = new SQLiteClient('./storage/agent.db');
   * await db.connect();
   * const memorySystem = new MemorySystem(db, {
   *   workingMemoryOptions: { maxTokens: 8000 },
   *   autoSave: true,
   *   autoSaveInterval: 30000
   * });
   */
  constructor(db: SQLiteClient, config: MemorySystemConfig = {}) {
    this._db = db;
    this.sessions = new Sessions(db);
    this.steps = new Steps(db);
    this.workingMemoryOptions = config.workingMemoryOptions || {};
    this.autoSave = config.autoSave ?? true;
    this.autoSaveInterval = config.autoSaveInterval || 30000;
    this.autoSaveTimers = new Map();
    this.activeMemories = new Map();
  }

  /**
   * 创建新会话
   *
   * 创建新的会话记录并初始化工作记忆。
   *
   * @param taskDescription - 任务描述
   * @param options - 工作记忆配置选项（可选，覆盖默认配置）
   * @returns 创建结果，包含会话信息和工作记忆
   *
   * @example
   * const { session, workingMemory } = await memorySystem.createSession('分析代码库');
   * console.log(`创建会话: ${session.sessionId}`);
   *
   * // 使用自定义配置
   * const result = await memorySystem.createSession('复杂任务', {
   *   maxTokens: 16000,
   *   systemPrompt: '你是专家级开发者'
   * });
   */
  public async createSession(
    taskDescription: string,
    options?: WorkingMemoryOptions
  ): Promise<CreateSessionResult> {
    // 创建会话记录
    const session = await this.sessions.createSession({
      taskDescription,
      initialStatus: 'pending',
    });

    // 合并配置选项
    const mergedOptions = {
      ...this.workingMemoryOptions,
      ...options,
    };

    // 创建工作记忆
    const workingMemory = new WorkingMemory(session.sessionId, mergedOptions);

    // 保存到活跃内存
    this.activeMemories.set(session.sessionId, workingMemory);

    // 设置自动保存
    if (this.autoSave) {
      this.setupAutoSave(session.sessionId);
    }

    return { session, workingMemory };
  }

  /**
   * 加载会话
   *
   * 从数据库加载会话信息和完整的历史步骤，重建工作记忆。
   *
   * @param sessionId - 会话 ID
   * @param options - 工作记忆配置选项（可选）
   * @returns 加载结果，包含会话、工作记忆和所有步骤
   * @throws Error 如果会话不存在
   *
   * @example
   * const { session, workingMemory, steps } = await memorySystem.loadSession('session-001');
   * console.log(`加载了 ${steps.length} 个步骤`);
   *
   * // 继续对话
   * workingMemory.addUserMessage('继续分析');
   */
  public async loadSession(
    sessionId: string,
    options?: WorkingMemoryOptions
  ): Promise<LoadSessionResult> {
    // 获取会话信息
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 获取所有步骤
    const steps = await this.steps.getStepsBySession(sessionId, {
      order: 'asc',
    });

    // 合并配置选项
    const mergedOptions = {
      ...this.workingMemoryOptions,
      ...options,
    };

    // 创建工作记忆
    const workingMemory = new WorkingMemory(sessionId, mergedOptions);

    // 将步骤转换为消息并添加到工作记忆
    for (const step of steps) {
      // 添加思考作为系统提示（可选）
      if (step.thought) {
        // 注意：思考内容通常不直接作为消息，这里仅作示例
        // 实际使用时可能需要调整
      }

      // 添加动作（助手消息）
      if (step.action) {
        const message: Message = {
          role: 'assistant',
          content: step.action.thought || '',
          toolCalls: [
            {
              id: `call-${step.stepId}`,
              name: step.action.toolName,
              arguments: step.action.parameters,
            },
          ],
        };
        workingMemory.addMessage(message);
      }

      // 添加观察结果（工具消息）
      if (step.observation && step.observation.raw) {
        workingMemory.addToolMessage(
          step.observation.raw,
          `call-${step.stepId}`
        );
      }
    }

    // 设置当前任务
    workingMemory.setCurrentTask(session.taskDescription);

    // 保存到活跃内存
    this.activeMemories.set(sessionId, workingMemory);

    // 设置自动保存
    if (this.autoSave) {
      this.setupAutoSave(sessionId);
    }

    return { session, workingMemory, steps };
  }

  /**
   * 保存会话
   *
   * 将工作记忆的当前状态保存到数据库。
   * 将消息历史转换为步骤记录保存。
   *
   * @param sessionId - 会话 ID
   * @param workingMemory - 工作记忆实例（可选，使用活跃内存中的实例）
   * @returns true 如果保存成功
   * @throws Error 如果会话不存在
   *
   * @example
   * await memorySystem.saveSession('session-001', workingMemory);
   *
   * // 或者使用活跃内存中的实例
   * await memorySystem.saveSession('session-001');
   */
  public async saveSession(
    sessionId: string,
    workingMemory?: WorkingMemory
  ): Promise<boolean> {
    // 获取会话信息
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 使用提供的工作记忆或活跃内存中的实例
    const memory = workingMemory || this.activeMemories.get(sessionId);
    if (!memory) {
      throw new Error(`没有找到会话 ${sessionId} 的工作记忆`);
    }

    // 更新活跃内存引用
    this.activeMemories.set(sessionId, memory);

    // 获取当前步骤数
    const currentStepCount = await this.steps.getStepCount(sessionId);
    const messages = memory.getMessages();

    // 将消息转换为步骤并保存
    // 注意：这里简化处理，实际实现可能需要更复杂的逻辑
    // 只保存用户和助手消息作为步骤
    let stepNumber = currentStepCount + 1;

    for (const message of messages) {
      if (message.role === 'assistant' && message.toolCalls) {
        // 这是一个工具调用消息，创建步骤
        for (const toolCall of message.toolCalls) {
          // 检查步骤是否已存在
          const stepId = `step-${sessionId}-${stepNumber}`;
          const existingStep = await this.steps.getStep(stepId);

          if (!existingStep) {
            await this.steps.createStep({
              sessionId,
              stepNumber,
              thought: message.content || '',
              action: {
                thought: message.content || '',
                toolName: toolCall.name,
                parameters: toolCall.arguments,
                expectedOutcome: '',
              },
              status: 'completed',
            });
            stepNumber++;
          }
        }
      }
    }

    return true;
  }

  /**
   * 崩溃恢复
   *
   * 恢复因崩溃而中断的会话，重建工作记忆到最后执行步骤。
   *
   * @param sessionId - 会话 ID
   * @returns 恢复结果，包含会话、工作记忆、最后步骤和恢复状态
   * @throws Error 如果会话不存在
   *
   * @example
   * const { session, workingMemory, lastStep, needsRecovery } = await memorySystem.recoverSession('session-001');
   *
   * if (needsRecovery && lastStep) {
   *   console.log(`恢复执行步骤 ${lastStep.stepNumber}`);
   *   // 根据 lastStep.status 决定如何处理
   * } else {
   *   console.log('会话已完成或没有可恢复的步骤');
   * }
   */
  public async recoverSession(sessionId: string): Promise<RecoveryResult> {
    // 加载会话
    const { session, workingMemory } = await this.loadSession(sessionId);

    // 获取最后执行的步骤
    const lastStep = await this.steps.getLastStep(sessionId);

    // 判断是否需要恢复
    const needsRecovery =
      session.finalStatus === 'pending' ||
      session.finalStatus === 'running' ||
      (lastStep !== null && lastStep.status === 'running');

    if (needsRecovery && lastStep) {
      // 如果最后一步是运行中，标记为失败（因为是崩溃导致的）
      if (lastStep.status === 'running') {
        await this.steps.failStep(
          lastStep.stepId,
          '会话因异常中断，步骤未正常完成'
        );
      }

      // 更新会话状态为运行中
      await this.sessions.updateSessionStatus(sessionId, 'running');
    }

    return {
      session,
      workingMemory,
      lastStep,
      needsRecovery,
    };
  }

  /**
   * 获取活跃的工作记忆
   *
   * @param sessionId - 会话 ID
   * @returns 工作记忆实例，如果不存在返回 undefined
   *
   * @example
   * const memory = memorySystem.getActiveMemory('session-001');
   * if (memory) {
   *   memory.addUserMessage('新消息');
   * }
   */
  public getActiveMemory(sessionId: string): WorkingMemory | undefined {
    return this.activeMemories.get(sessionId);
  }

  /**
   * 检查会话是否有活跃的工作记忆
   *
   * @param sessionId - 会话 ID
   * @returns true 如果有活跃的工作记忆
   */
  public hasActiveMemory(sessionId: string): boolean {
    return this.activeMemories.has(sessionId);
  }

  /**
   * 结束会话
   *
   * 保存会话状态，关闭自动保存，清理资源。
   *
   * @param sessionId - 会话 ID
   * @param finalStatus - 最终状态，默认为 'completed'
   * @param finalResult - 最终结果（可选）
   * @returns true 如果结束成功
   *
   * @example
   * await memorySystem.endSession('session-001', 'completed', '任务完成');
   *
   * // 会话失败
   * await memorySystem.endSession('session-001', 'failed', '执行超时');
   */
  public async endSession(
    sessionId: string,
    finalStatus: 'completed' | 'failed' = 'completed',
    finalResult?: string
  ): Promise<boolean> {
    // 保存会话
    await this.saveSession(sessionId);

    // 停止自动保存
    this.stopAutoSave(sessionId);

    // 从活跃内存中移除
    this.activeMemories.delete(sessionId);

    // 更新会话状态
    if (finalStatus === 'completed') {
      await this.sessions.completeSession(sessionId, finalResult || '任务完成');
    } else {
      await this.sessions.failSession(sessionId, finalResult || '任务失败');
    }

    return true;
  }

  /**
   * 获取所有活跃的会话 ID
   *
   * @returns 会话 ID 数组
   */
  public getActiveSessionIds(): string[] {
    return Array.from(this.activeMemories.keys());
  }

  /**
   * 设置自动保存
   *
   * @private
   * @param sessionId - 会话 ID
   */
  private setupAutoSave(sessionId: string): void {
    // 清除现有的定时器
    this.stopAutoSave(sessionId);

    // 设置新的定时器
    const timer = setInterval(async () => {
      try {
        if (this.activeMemories.has(sessionId)) {
          await this.saveSession(sessionId);
        }
      } catch (error) {
        console.error(`自动保存会话 ${sessionId} 失败:`, error);
      }
    }, this.autoSaveInterval);

    this.autoSaveTimers.set(sessionId, timer);
  }

  /**
   * 停止自动保存
   *
   * @private
   * @param sessionId - 会话 ID
   */
  private stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
    }
  }

  /**
   * 获取数据库客户端
   *
   * @returns SQLite 客户端实例
   */
  public getDb(): SQLiteClient {
    return this._db;
  }

  /**
   * 销毁记忆系统
   *
   * 停止所有自动保存定时器，清理资源。
   * 应在应用关闭时调用。
   *
   * @example
   * await memorySystem.destroy();
   */
  public async destroy(): Promise<void> {
    // 停止所有自动保存定时器
    for (const [sessionId, timer] of this.autoSaveTimers) {
      clearInterval(timer);
      try {
        // 最后保存一次
        await this.saveSession(sessionId);
      } catch (error) {
        console.error(`最后保存会话 ${sessionId} 失败:`, error);
      }
    }

    this.autoSaveTimers.clear();
    this.activeMemories.clear();
  }

  /**
   * 将会话历史导出为对话格式
   *
   * 用于导出会话历史为 LLM 可用的对话格式。
   *
   * @param sessionId - 会话 ID
   * @returns 消息数组
   * @throws Error 如果会话不存在
   *
   * @example
   * const messages = await memorySystem.exportConversation('session-001');
   * // 用于 LLM 调用
   * llmClient.chat(messages);
   */
  public async exportConversation(sessionId: string): Promise<Message[]> {
    // 如果有活跃内存，使用活跃内存的消息
    const activeMemory = this.activeMemories.get(sessionId);
    if (activeMemory) {
      return activeMemory.getMessages();
    }

    // 否则从数据库加载
    const { workingMemory } = await this.loadSession(sessionId);
    return workingMemory.getMessages();
  }

  /**
   * 获取会话统计信息
   *
   * @param sessionId - 会话 ID
   * @returns 统计信息
   * @throws Error 如果会话不存在
   *
   * @example
   * const stats = await memorySystem.getSessionStats('session-001');
   * console.log(`会话有 ${stats.stepCount} 个步骤，使用了 ${stats.tokenUsage.current} tokens`);
   */
  public async getSessionStats(sessionId: string): Promise<{
    session: Session;
    stepCount: number;
    messageCount: number;
    tokenUsage: {
      current: number;
      max: number;
      remaining: number;
      usageRatio: number;
    };
  }> {
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const stepCount = await this.steps.getStepCount(sessionId);

    // 获取工作记忆
    let workingMemory = this.activeMemories.get(sessionId);
    if (!workingMemory) {
      const result = await this.loadSession(sessionId);
      workingMemory = result.workingMemory;
    }

    const tokenUsage = workingMemory.getTokenUsage();

    return {
      session,
      stepCount,
      messageCount: workingMemory.getMessageCount(),
      tokenUsage,
    };
  }
}
