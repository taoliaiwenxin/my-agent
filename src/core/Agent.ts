/**
 * @file Agent.ts
 * @description Agent 核心控制器，整合所有模块提供统一的任务执行接口
 * @module core
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import { SQLiteClient } from '../memory/SQLiteClient';
import { MemorySystem } from '../memory/MemorySystem';
import { WorkingMemory } from '../memory/WorkingMemory';
import { LLMClient } from '../llm/LLMClient';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ReActLoop } from './ReActLoop';
import { StateManager } from './StateManager';
import { PermissionManager } from '../security/PermissionManager';
import { SecurityPolicy } from '../security/SecurityPolicy';
import { buildReActSystemPrompt } from '../llm/prompts/react';
import {
  AgentConfig,
  PermissionLevel,
  Session,
  Step,
} from '../types';
import { ReActLoopResult } from './ReActLoop';

/**
 * Agent 配置选项
 */
export interface AgentOptions {
  /** 数据库路径 */
  dbPath?: string;

  /** LLM 客户端 */
  llmClient: LLMClient;

  /** 权限级别 */
  permissionLevel?: PermissionLevel;

  /** 允许访问的路径 */
  allowedPaths?: string[];

  /** Agent 配置 */
  agentConfig?: Partial<AgentConfig>;

  /** 安全策略配置 */
  securityPolicy?: Partial<ConstructorParameters<typeof SecurityPolicy>[0]>;
}

/**
 * 任务执行结果
 */
export interface TaskResult {
  /** 是否成功 */
  success: boolean;

  /** 会话 ID */
  sessionId: string;

  /** 最终结果 */
  result?: string;

  /** 执行的步骤 */
  steps: Step[];

  /** 总迭代次数 */
  totalIterations: number;

  /** 总耗时（毫秒） */
  totalTimeMs: number;

  /** 错误信息 */
  error?: string;

  /** Token 使用量 */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Agent 事件
 */
export interface AgentEvent {
  /** 事件类型 */
  type:
    | 'session:start'
    | 'session:end'
    | 'step'
    | 'error'
    | 'state:change'
    | 'interactive:message'
    | 'interactive:response';

  /** 会话 ID */
  sessionId: string;

  /** 事件数据 */
  data?: unknown;

  /** 时间戳 */
  timestamp: Date;
}

/**
 * Agent 事件监听器
 */
export type AgentEventListener = (event: AgentEvent) => void;

/**
 * Agent 核心类
 *
 * 整合所有子系统，提供统一的任务执行接口：
 * - 自动初始化数据库和记忆系统
 * - 管理工具注册和权限控制
 * - 协调 LLM、规划器和 ReAct 循环
 * - 支持状态管理和崩溃恢复
 */
export class Agent {
  /** 数据库客户端 */
  private db: SQLiteClient;

  /** 记忆系统 */
  private memorySystem: MemorySystem;

  /** LLM 客户端 */
  private llmClient: LLMClient;

  /** 工具执行器 */
  private toolExecutor: ToolExecutor;

  /** ReAct 循环 */
  private reactLoop?: ReActLoop;

  /** 状态管理器 */
  private stateManager: StateManager;

  /** 权限管理器 */
  private permissionManager: PermissionManager;

  /** Agent 配置 */
  private config: Required<AgentConfig>;

  /** 事件监听器 */
  private eventListeners: AgentEventListener[] = [];

  /** 交互模式上下文 */
  private interactiveContext?: {
    sessionId: string;
    workingMemory: WorkingMemory;
    isActive: boolean;
  };

  /** 是否已初始化 */
  private initialized = false;

  /**
   * 创建 Agent 实例
   *
   * @param options - 配置选项
   */
  constructor(options: AgentOptions) {
    this.llmClient = options.llmClient;
    this.config = {
      maxIterations: options.agentConfig?.maxIterations ?? 20,
      timeoutMs: options.agentConfig?.timeoutMs ?? 300000,
      enableHumanConfirm: options.agentConfig?.enableHumanConfirm ?? false,
    };

    // 初始化数据库
    this.db = new SQLiteClient(options.dbPath || './storage/agent.db');

    // 初始化记忆系统（延迟连接）
    this.memorySystem = new MemorySystem(this.db, {
      autoSave: true,
      autoSaveInterval: 30000,
    });

    // 初始化权限管理器
    const securityConfig = {
      permissionLevel: options.permissionLevel || 'execute',
      allowedPaths: options.allowedPaths || [process.cwd()],
      ...options.securityPolicy,
    };
    this.permissionManager = new PermissionManager(securityConfig);

    // 初始化工具执行器
    this.toolExecutor = new ToolExecutor({
      allowedPaths: securityConfig.allowedPaths,
      permissionLevel: securityConfig.permissionLevel,
    });

    // 初始化状态管理器
    this.stateManager = new StateManager({
      memorySystem: this.memorySystem,
      enablePersistence: true,
    });
  }

  /**
   * 初始化 Agent
   *
   * 连接数据库，注册默认工具。
   *
   * @throws Error 如果初始化失败
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 连接数据库
      await this.db.connect();

      // 注册默认工具
      this.toolExecutor.registerDefaultTools();

      // 初始化 ReAct 循环
      this.reactLoop = new ReActLoop({
        llmClient: this.llmClient,
        toolExecutor: this.toolExecutor,
        memorySystem: this.memorySystem,
        maxIterations: this.config.maxIterations,
        enableReflection: true,
        enableVerification: true,
      });

      // 监听 ReAct 循环事件
      this.reactLoop.onEvent((event) => {
        this.emit('step', this.stateManager.getCurrentSessionId() || '', {
          type: event.type,
          iteration: event.iteration,
          data: event.data,
        });
      });

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Agent 初始化失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行任务
   *
   * @param taskDescription - 任务描述
   * @returns 任务执行结果
   * @throws Error 如果 Agent 未初始化
   */
  public async runTask(taskDescription: string): Promise<TaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 检查是否可以开始新任务
    if (!this.stateManager.canStartTask()) {
      throw new Error(`Agent 当前状态为 ${this.stateManager.getState()}，无法开始新任务`);
    }

    let session: Session | undefined;
    let workingMemory: WorkingMemory | undefined;

    try {
      // 创建会话
      const sessionResult = await this.memorySystem.createSession(taskDescription);
      session = sessionResult.session;
      workingMemory = sessionResult.workingMemory;

      // 更新状态
      await this.stateManager.startSession(session.sessionId, taskDescription);
      this.stateManager.transitionTo('planning', '开始规划任务');

      this.emit('session:start', session.sessionId, { taskDescription });

      // 可选：使用规划器生成计划
      // const planResult = await this.planner.createPlan(taskDescription);
      // if (planResult.success && planResult.plan) {
      //   console.log('生成计划:', this.planner.generateSummary(planResult.plan));
      // }

      // 运行 ReAct 循环
      this.stateManager.transitionTo('running', '开始执行 ReAct 循环');
      this.stateManager.startAutoSave();

      if (!this.reactLoop) {
        throw new Error('ReAct 循环未初始化');
      }

      const loopResult = await this.reactLoop.run(
        session.sessionId,
        workingMemory,
        taskDescription
      );

      // 结束会话
      const success = loopResult.success;
      const result = loopResult.result;

      this.stateManager.endSession(success, result);
      await this.memorySystem.endSession(
        session.sessionId,
        success ? 'completed' : 'failed',
        result || (success ? '任务完成' : '任务失败')
      );

      this.emit('session:end', session.sessionId, {
        success,
        result,
        totalIterations: loopResult.totalIterations,
      });

      return {
        success,
        sessionId: session.sessionId,
        result,
        steps: loopResult.steps,
        totalIterations: loopResult.totalIterations,
        totalTimeMs: loopResult.totalTimeMs,
        error: loopResult.error,
        tokenUsage: loopResult.tokenUsage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 标记失败
      if (session) {
        this.stateManager.endSession(false, errorMessage);
        await this.memorySystem.endSession(
          session.sessionId,
          'failed',
          errorMessage
        );
      }

      this.emit('error', session?.sessionId || '', { error: errorMessage });

      return {
        success: false,
        sessionId: session?.sessionId || 'unknown',
        error: errorMessage,
        steps: this.reactLoop?.getSteps() || [],
        totalIterations: this.reactLoop?.getSteps().length || 0,
        totalTimeMs: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
      };
    } finally {
      this.stateManager.stopAutoSave();
    }
  }

  /**
   * 恢复中断的会话
   *
   * @param sessionId - 要恢复的会话 ID
   * @returns 是否成功恢复
   */
  public async recoverSession(sessionId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    const recovered = await this.stateManager.recoverSession(sessionId);
    return recovered !== null;
  }

  /**
   * 获取可恢复的会话列表
   *
   * @returns 可恢复的会话列表
   */
  public async getRecoverableSessions(): Promise<
    { sessionId: string; taskDescription: string; status: string; createdAt: Date }[]
  > {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.stateManager.getRecoverableSessions();
  }

  /**
   * 获取当前状态
   *
   * @returns 当前状态信息
   */
  public getStatus(): {
    state: string;
    sessionId?: string;
    taskDescription?: string;
    progress?: string;
  } {
    return this.stateManager.getSessionSummary();
  }

  /**
   * 获取会话历史
   *
   * @param limit - 返回数量限制
   * @returns 会话列表
   */
  public async getSessionHistory(limit: number = 10): Promise<Session[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { Sessions } = await import('../memory/Sessions');
    const sessions = new Sessions(this.db);
    return sessions.listSessions({ limit, order: 'desc' });
  }

  /**
   * 获取会话详情
   *
   * @param sessionId - 会话 ID
   * @returns 会话详情和步骤
   */
  public async getSessionDetails(
    sessionId: string
  ): Promise<{ session: Session | null; steps: Step[] }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { Sessions } = await import('../memory/Sessions');
    const { Steps } = await import('../memory/Steps');

    const sessions = new Sessions(this.db);
    const steps = new Steps(this.db);

    const session = await sessions.getSession(sessionId);
    const stepList = await steps.getStepsBySession(sessionId);

    return { session, steps: stepList };
  }

  /**
   * 获取 Token 使用统计
   *
   * @returns Token 使用统计
   */
  public getTokenUsageStats(): ReturnType<LLMClient['getTokenUsageStats']> {
    return this.llmClient.getTokenUsageStats();
  }

  /**
   * 注册自定义工具
   *
   * @param tool - 工具实现
   */
  public registerTool(
    tool: Parameters<ToolExecutor['registerTool']>[0]
  ): void {
    this.toolExecutor.registerTool(tool);
  }

  /**
   * 获取已注册工具列表
   *
   * @returns 工具名称列表
   */
  public getTools(): string[] {
    return this.toolExecutor.getToolNames();
  }

  /**
   * 更新安全策略
   *
   * @param policy - 安全策略
   */
  public setSecurityPolicy(policy: SecurityPolicy): void {
    this.permissionManager.setPolicy(policy);

    // 同步更新工具执行器的权限
    this.toolExecutor.updateConfig({
      permissionLevel: policy.getPermissionLevel(),
      allowedPaths: policy.getAllowedPaths(),
    });
  }

  /**
   * 添加事件监听器
   *
   * @param listener - 监听器函数
   */
  public onEvent(listener: AgentEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * 移除事件监听器
   *
   * @param listener - 监听器函数
   */
  public offEvent(listener: AgentEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 启动交互会话
   *
   * 创建新会话并初始化交互上下文，保持运行状态等待用户输入。
   *
   * @param taskDescription - 会话描述（可选，默认为'交互式会话'）
   * @returns 会话 ID
   */
  public async startInteractiveSession(taskDescription?: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const desc = taskDescription || '交互式会话';

    // 创建会话
    const { session, workingMemory } = await this.memorySystem.createSession(desc);

    // 设置系统提示词
    const systemPrompt = buildReActSystemPrompt({
      taskDescription: desc,
      tools: this.toolExecutor.getAllTools(),
      maxSteps: this.config.maxIterations,
    });
    workingMemory.addSystemMessage(systemPrompt);

    // 初始化状态
    await this.stateManager.startSession(session.sessionId, desc);
    this.stateManager.transitionTo('idle', '交互会话已初始化');

    // 交互模式下启用人工确认
    this.toolExecutor.updateConfig({ enableHumanConfirm: true });

    // 保存交互上下文
    this.interactiveContext = {
      sessionId: session.sessionId,
      workingMemory,
      isActive: true,
    };

    this.emit('interactive:message', session.sessionId, {
      type: 'session_started',
      taskDescription: desc,
    });

    return session.sessionId;
  }

  /**
   * 发送交互消息
   *
   * 将用户消息添加到工作记忆并继续 ReAct 循环。
   *
   * @param message - 用户消息
   * @returns ReAct 循环结果
   * @throws Error 如果交互会话未激活
   */
  public async sendInteractiveMessage(message: string): Promise<ReActLoopResult> {
    if (!this.interactiveContext?.isActive) {
      throw new Error('交互会话未激活，请先调用 startInteractiveSession()');
    }

    const { sessionId, workingMemory } = this.interactiveContext;

    // 添加用户消息
    workingMemory.addUserMessage(message);
    this.emit('interactive:message', sessionId, { message });

    // 进入运行状态
    this.stateManager.transitionTo('running', '处理交互消息');

    try {
      if (!this.reactLoop) {
        throw new Error('ReAct 循环未初始化');
      }

      const result = await this.reactLoop.continue(sessionId, workingMemory);

      // 回到 idle 等待下一轮输入
      this.stateManager.transitionTo('idle', '交互消息处理完成');

      this.emit('interactive:response', sessionId, { result });

      return result;
    } catch (error) {
      // 出错也回到 idle
      this.stateManager.transitionTo('idle', '交互消息处理出错');
      throw error;
    }
  }

  /**
   * 结束交互会话
   *
   * 持久化会话历史并清理交互上下文。
   */
  public async endInteractiveSession(): Promise<void> {
    if (!this.interactiveContext) {
      return;
    }

    const { sessionId } = this.interactiveContext;

    // 结束会话持久化
    await this.memorySystem.endSession(sessionId, 'completed', '交互会话结束');

    this.emit('interactive:message', sessionId, { type: 'session_ended' });

    // 恢复人工确认设置
    this.toolExecutor.updateConfig({ enableHumanConfirm: false });

    this.interactiveContext = undefined;
  }

  /**
   * 清空交互上下文
   *
   * 清空工作记忆中的对话历史，保留系统提示词。
   */
  public clearInteractiveContext(): void {
    if (!this.interactiveContext) {
      return;
    }

    this.interactiveContext.workingMemory.clear(true);

    this.emit('interactive:message', this.interactiveContext.sessionId, {
      type: 'context_cleared',
    });
  }

  /**
   * 检查是否处于交互模式
   *
   * @returns 是否处于活跃的交互会话中
   */
  public isInteractive(): boolean {
    return this.interactiveContext?.isActive ?? false;
  }

  /**
   * 关闭 Agent
   *
   * 保存所有状态，关闭数据库连接。
   */
  public async shutdown(): Promise<void> {
    this.stateManager.stopAutoSave();

    if (this.stateManager.isActive()) {
      const sessionId = this.stateManager.getCurrentSessionId();
      if (sessionId) {
        await this.memorySystem.endSession(sessionId, 'failed', 'Agent 被关闭');
      }
    }

    this.stateManager.destroy();
    await this.memorySystem.destroy();
    await this.db.close();

    this.initialized = false;
  }

  /**
   * 发送事件
   *
   * @param type - 事件类型
   * @param sessionId - 会话 ID
   * @param data - 事件数据
   */
  private emit(
    type: AgentEvent['type'],
    sessionId: string,
    data?: unknown
  ): void {
    const event: AgentEvent = {
      type,
      sessionId,
      data,
      timestamp: new Date(),
    };

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // 忽略监听器错误
      }
    }
  }
}

/**
 * 创建 Agent（便捷函数）
 *
 * @param options - 配置选项
 * @returns Agent 实例
 */
export function createAgent(options: AgentOptions): Agent {
  return new Agent(options);
}
