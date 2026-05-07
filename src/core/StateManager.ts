/**
 * @file StateManager.ts
 * @description 状态管理器，管理 Agent 执行状态，支持状态持久化和崩溃恢复
 * @module core
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import { MemorySystem } from '../memory/MemorySystem';
import { Session, StepStatus } from '../types';

/**
 * Agent 运行状态
 */
export type AgentState =
  | 'idle'
  | 'initializing'
  | 'planning'
  | 'running'
  | 'paused'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'shutting_down';

/**
 * 状态变更事件
 */
export interface StateChangeEvent {
  /** 上一个状态 */
  from: AgentState;
  /** 新状态 */
  to: AgentState;
  /** 变更时间 */
  timestamp: Date;
  /** 变更原因 */
  reason?: string;
  /** 关联的会话 ID */
  sessionId?: string;
}

/**
 * 状态变更监听器
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * 会话执行状态
 */
export interface SessionExecutionState {
  /** 会话信息 */
  session: Session;
  /** 当前步骤序号 */
  currentStepNumber: number;
  /** 当前步骤状态 */
  currentStepStatus: StepStatus;
  /** 已执行步骤数 */
  completedSteps: number;
  /** 失败步骤数 */
  failedSteps: number;
  /** 总步骤数（如果已知） */
  totalSteps?: number;
  /** 开始时间 */
  startedAt?: Date;
  /** 最后更新时间 */
  lastUpdateAt: Date;
  /** 是否是从崩溃恢复的 */
  isRecovered: boolean;
}

/**
 * 状态快照（用于持久化）
 */
export interface StateSnapshot {
  /** 状态版本 */
  version: number;
  /** Agent 状态 */
  agentState: AgentState;
  /** 当前会话 ID */
  currentSessionId?: string;
  /** 会话执行状态 */
  sessionState?: SessionExecutionState;
  /** 创建时间 */
  createdAt: Date;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 状态管理器配置
 */
export interface StateManagerConfig {
  /** 记忆系统 */
  memorySystem: MemorySystem;
  /** 是否启用状态持久化 */
  enablePersistence?: boolean;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
}

/**
 * 状态管理器
 *
 * 管理 Agent 的运行时状态，支持：
 * - 状态机管理（状态转换、验证）
 * - 状态持久化（自动保存、恢复）
 * - 崩溃恢复
 * - 状态变更事件
 */
export class StateManager {
  /** 记忆系统 */
  private memorySystem: MemorySystem;

  /** 当前 Agent 状态 */
  private currentState: AgentState = 'idle';

  /** 当前会话 ID */
  private currentSessionId?: string;

  /** 会话执行状态 */
  private sessionState?: SessionExecutionState;

  /** 状态历史 */
  private stateHistory: StateChangeEvent[] = [];

  /** 状态变更监听器 */
  private listeners: StateChangeListener[] = [];

  /** 是否启用持久化 */
  private enablePersistence: boolean;

  /** 自动保存定时器 */
  private autoSaveTimer?: NodeJS.Timeout;

  /** 自动保存间隔 */
  private autoSaveInterval: number;

  /** 状态版本 */
  private version = 1;

  /**
   * 有效状态转换映射
   */
  private validTransitions: Record<AgentState, AgentState[]> = {
    idle: ['initializing', 'shutting_down'],
    initializing: ['planning', 'running', 'failed', 'idle'],
    planning: ['running', 'failed', 'idle'],
    running: ['paused', 'completed', 'failed', 'recovering', 'shutting_down', 'idle'],
    paused: ['running', 'failed', 'shutting_down'],
    recovering: ['running', 'failed', 'idle'],
    completed: ['idle', 'shutting_down'],
    failed: ['idle', 'recovering', 'shutting_down'],
    shutting_down: ['idle'],
  };

  /**
   * 创建状态管理器实例
   *
   * @param config - 配置
   */
  constructor(config: StateManagerConfig) {
    this.memorySystem = config.memorySystem;
    this.enablePersistence = config.enablePersistence ?? true;
    this.autoSaveInterval = config.autoSaveInterval ?? 30000;
  }

  /**
   * 获取当前状态
   *
   * @returns 当前 Agent 状态
   */
  public getState(): AgentState {
    return this.currentState;
  }

  /**
   * 获取当前会话 ID
   *
   * @returns 当前会话 ID，如果没有则为 undefined
   */
  public getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /**
   * 获取会话执行状态
   *
   * @returns 会话执行状态
   */
  public getSessionState(): SessionExecutionState | undefined {
    return this.sessionState;
  }

  /**
   * 状态转换
   *
   * @param newState - 目标状态
   * @param reason - 转换原因
   * @returns 是否转换成功
   */
  public transitionTo(newState: AgentState, reason?: string): boolean {
    // 验证状态转换
    if (!this.isValidTransition(this.currentState, newState)) {
      return false;
    }

    const event: StateChangeEvent = {
      from: this.currentState,
      to: newState,
      timestamp: new Date(),
      reason,
      sessionId: this.currentSessionId,
    };

    this.currentState = newState;
    this.stateHistory.push(event);

    // 通知监听器
    this.notifyListeners(event);

    // 持久化状态
    if (this.enablePersistence) {
      this.saveState().catch((err) => {
        console.error('状态持久化失败:', err);
      });
    }

    return true;
  }

  /**
   * 开始新会话
   *
   * @param sessionId - 会话 ID
   * @param taskDescription - 任务描述
   */
  public async startSession(
    sessionId: string,
    taskDescription: string
  ): Promise<void> {
    this.currentSessionId = sessionId;
    this.sessionState = {
      session: {
        sessionId,
        createdAt: new Date(),
        taskDescription,
        finalStatus: 'pending',
        stepCount: 0,
      },
      currentStepNumber: 0,
      currentStepStatus: 'pending',
      completedSteps: 0,
      failedSteps: 0,
      lastUpdateAt: new Date(),
      isRecovered: false,
    };

    this.transitionTo('initializing', `开始会话: ${taskDescription}`);
  }

  /**
   * 更新步骤状态
   *
   * @param stepNumber - 步骤序号
   * @param status - 步骤状态
   */
  public updateStepState(stepNumber: number, status: StepStatus): void {
    if (!this.sessionState) return;

    this.sessionState.currentStepNumber = stepNumber;
    this.sessionState.currentStepStatus = status;
    this.sessionState.lastUpdateAt = new Date();

    if (status === 'completed') {
      this.sessionState.completedSteps++;
    } else if (status === 'failed') {
      this.sessionState.failedSteps++;
    }

    // 持久化
    if (this.enablePersistence) {
      this.saveState().catch(() => {
        // 忽略持久化错误
      });
    }
  }

  /**
   * 完成会话
   *
   * @param success - 是否成功
   * @param result - 结果描述
   */
  public endSession(success: boolean, result?: string): void {
    if (!this.sessionState) return;

    this.sessionState.session.finalStatus = success ? 'completed' : 'failed';
    this.sessionState.session.finalResult = result;
    this.sessionState.lastUpdateAt = new Date();

    this.transitionTo(
      success ? 'completed' : 'failed',
      result || (success ? '会话完成' : '会话失败')
    );

    // 停止自动保存
    this.stopAutoSave();
  }

  /**
   * 崩溃恢复
   *
   * @param sessionId - 要恢复的会话 ID
   * @returns 恢复后的会话状态
   */
  public async recoverSession(sessionId: string): Promise<SessionExecutionState | null> {
    this.transitionTo('recovering', `恢复会话: ${sessionId}`);

    try {
      const recovery = await this.memorySystem.recoverSession(sessionId);

      if (!recovery.needsRecovery) {
        this.transitionTo('idle', '会话不需要恢复');
        return null;
      }

      // 获取步骤统计
      const stats = await this.memorySystem.getSessionStats(sessionId);

      this.currentSessionId = sessionId;
      this.sessionState = {
        session: recovery.session,
        currentStepNumber: recovery.lastStep?.stepNumber ?? 0,
        currentStepStatus: recovery.lastStep?.status ?? 'pending',
        completedSteps: stats.stepCount,
        failedSteps: 0,
        lastUpdateAt: new Date(),
        isRecovered: true,
      };

      this.transitionTo('running', '会话恢复成功');
      return this.sessionState;
    } catch (error) {
      this.transitionTo(
        'failed',
        `恢复失败: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * 检查是否可以恢复会话
   *
   * @returns 是否有可恢复的会话
   */
  public async canRecover(): Promise<boolean> {
    try {
      const sessions = await this.memorySystem
        .getDb()
        .all<{ session_id: string; final_status: string }>(
          "SELECT session_id, final_status FROM sessions WHERE final_status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1"
        );
      return sessions.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取可恢复的会话列表
   *
   * @returns 可恢复的会话列表
   */
  public async getRecoverableSessions(): Promise<
    { sessionId: string; taskDescription: string; status: string; createdAt: Date }[]
  > {
    try {
      const sessions = await this.memorySystem
        .getDb()
        .all<{
          session_id: string;
          task_description: string;
          final_status: string;
          created_at: string;
        }>(
          "SELECT session_id, task_description, final_status, created_at FROM sessions WHERE final_status IN ('pending', 'running') ORDER BY created_at DESC"
        );

      return sessions.map((s) => ({
        sessionId: s.session_id,
        taskDescription: s.task_description,
        status: s.final_status,
        createdAt: new Date(s.created_at),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取状态历史
   *
   * @param limit - 返回数量限制
   * @returns 状态变更事件列表
   */
  public getStateHistory(limit?: number): StateChangeEvent[] {
    const history = [...this.stateHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * 添加状态变更监听器
   *
   * @param listener - 监听器函数
   */
  public onStateChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * 移除状态变更监听器
   *
   * @param listener - 监听器函数
   */
  public offStateChange(listener: StateChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 创建状态快照
   *
   * @returns 状态快照
   */
  public createSnapshot(): StateSnapshot {
    return {
      version: this.version,
      agentState: this.currentState,
      currentSessionId: this.currentSessionId,
      sessionState: this.sessionState,
      createdAt: new Date(),
    };
  }

  /**
   * 从快照恢复状态
   *
   * @param snapshot - 状态快照
   */
  public restoreSnapshot(snapshot: StateSnapshot): void {
    this.currentState = snapshot.agentState;
    this.currentSessionId = snapshot.currentSessionId;
    this.sessionState = snapshot.sessionState;
    this.version = snapshot.version;
  }

  /**
   * 启动自动保存
   */
  public startAutoSave(): void {
    this.stopAutoSave();

    if (this.enablePersistence) {
      this.autoSaveTimer = setInterval(() => {
        this.saveState().catch(() => {
          // 忽略保存错误
        });
      }, this.autoSaveInterval);
    }
  }

  /**
   * 停止自动保存
   */
  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * 保存状态到持久化存储
   *
   * @private
   */
  private async saveState(): Promise<void> {
    if (!this.enablePersistence || !this.currentSessionId) return;

    try {
      // 确保表存在
      await this.memorySystem
        .getDb()
        .run(`
          CREATE TABLE IF NOT EXISTS state_snapshots (
            session_id TEXT PRIMARY KEY,
            snapshot TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

      const snapshot = this.createSnapshot();
      const snapshotJson = JSON.stringify(snapshot);

      await this.memorySystem
        .getDb()
        .run(
          'INSERT OR REPLACE INTO state_snapshots (session_id, snapshot, created_at) VALUES (?, ?, ?)',
          [this.currentSessionId, snapshotJson, new Date().toISOString()]
        );
    } catch {
      // 持久化失败不影响运行
    }
  }

  /**
   * 从持久化存储加载状态
   *
   * @param sessionId - 会话 ID
   * @returns 是否成功加载
   */
  public async loadState(sessionId: string): Promise<boolean> {
    if (!this.enablePersistence) return false;

    try {
      const row = await this.memorySystem
        .getDb()
        .get<{ snapshot: string }>(
          'SELECT snapshot FROM state_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
          [sessionId]
        );

      if (row?.snapshot) {
        const snapshot = JSON.parse(row.snapshot) as StateSnapshot;
        this.restoreSnapshot(snapshot);
        return true;
      }
    } catch {
      // 加载失败
    }

    return false;
  }

  /**
   * 验证状态转换是否有效
   *
   * @param from - 源状态
   * @param to - 目标状态
   * @returns 是否有效
   */
  private isValidTransition(from: AgentState, to: AgentState): boolean {
    // 相同状态总是允许
    if (from === to) return true;

    const allowed = this.validTransitions[from];
    return allowed?.includes(to) ?? false;
  }

  /**
   * 通知所有监听器
   *
   * @param event - 状态变更事件
   */
  private notifyListeners(event: StateChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 销毁状态管理器
   */
  public destroy(): void {
    this.stopAutoSave();
    this.listeners = [];
    this.stateHistory = [];
  }

  /**
   * 检查是否处于活跃状态
   *
   * @returns 是否处于活跃状态（running, planning, recovering）
   */
  public isActive(): boolean {
    return ['running', 'planning', 'recovering', 'initializing'].includes(
      this.currentState
    );
  }

  /**
   * 检查是否可以开始新任务
   *
   * @returns 是否可以开始新任务
   */
  public canStartTask(): boolean {
    return ['idle', 'completed', 'failed'].includes(this.currentState);
  }

  /**
   * 获取会话摘要
   *
   * @returns 会话摘要信息
   */
  public getSessionSummary(): {
    state: AgentState;
    sessionId?: string;
    taskDescription?: string;
    progress?: string;
  } {
    if (!this.sessionState) {
      return { state: this.currentState };
    }

    const progress = this.sessionState.totalSteps
      ? `${this.sessionState.completedSteps}/${this.sessionState.totalSteps}`
      : `${this.sessionState.completedSteps} 步完成`;

    return {
      state: this.currentState,
      sessionId: this.currentSessionId,
      taskDescription: this.sessionState.session.taskDescription,
      progress,
    };
  }
}

/**
 * 创建状态管理器（便捷函数）
 *
 * @param config - 配置
 * @returns StateManager 实例
 */
export function createStateManager(config: StateManagerConfig): StateManager {
  return new StateManager(config);
}
