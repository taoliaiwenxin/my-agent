/**
 * @file Steps.ts
 * @description 步骤管理模块，负责执行步骤的记录、状态更新和查询。
 *              提供对 steps 表的高级封装，支持崩溃恢复和历史回溯。
 * @module memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 *
 * @example
 * // 创建步骤管理器
 * const steps = new Steps(db);
 *
 * // 创建新步骤
 * const step = await steps.createStep({
 *   sessionId: 'session-001',
 *   stepNumber: 1,
 *   thought: '我需要读取文件',
 *   action: { toolName: 'file_read', ... }
 * });
 *
 * // 更新步骤观察结果
 * await steps.updateStep(step.stepId, {
 *   observation: { raw: '文件内容...', success: true },
 *   status: 'completed'
 * });
 *
 * // 获取最后一步（崩溃恢复）
 * const lastStep = await steps.getLastStep('session-001');
 *
 * @see {@link SQLiteClient}
 * @see {@link types/index.ts}
 */

import { SQLiteClient } from './SQLiteClient';
import { Step, StepStatus, AgentAction, Observation, Reflection } from '../types';

/**
 * 创建步骤参数
 */
export interface CreateStepParams {
  /** 会话 ID */
  sessionId: string;
  /** 步骤序号 */
  stepNumber: number;
  /** 思考内容 */
  thought: string;
  /** 执行的动作 */
  action: AgentAction;
  /** 观察结果（可选，初始创建时可能为空） */
  observation?: Observation;
  /** 反思记录（可选） */
  reflection?: Reflection;
  /** 步骤状态，默认为 'running' */
  status?: StepStatus;
  /** 检查点数据（可选） */
  checkpointData?: string;
}

/**
 * 更新步骤参数
 */
export interface UpdateStepParams {
  /** 观察结果（可选） */
  observation?: Observation;
  /** 反思记录（可选） */
  reflection?: Reflection;
  /** 步骤状态（可选） */
  status?: StepStatus;
  /** 检查点数据（可选） */
  checkpointData?: string;
}

/**
 * 步骤查询选项
 */
export interface ListStepsOptions {
  /** 状态过滤 */
  status?: StepStatus;
  /** 限制返回数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
  /** 按步骤序号排序：'asc' 或 'desc'，默认为 'asc' */
  order?: 'asc' | 'desc';
}

/**
 * 步骤管理器类
 *
 * 封装对 steps 表的所有操作，包括：
 * - 创建新步骤记录
 * - 更新步骤状态和结果
 * - 查询单个步骤信息
 * - 查询会话的完整步骤历史
 * - 获取最后执行的步骤（用于崩溃恢复）
 */
export class Steps {
  /** SQLite 客户端实例 */
  private db: SQLiteClient;

  /**
   * 创建 Steps 管理器实例
   *
   * @param db - 已连接的 SQLiteClient 实例
   *
   * @example
   * const db = new SQLiteClient('./storage/agent.db');
   * await db.connect();
   * const steps = new Steps(db);
   */
  constructor(db: SQLiteClient) {
    this.db = db;
  }

  /**
   * 创建新步骤记录
   *
   * 生成唯一的 step_id，并在数据库中创建步骤记录。
   * step_id 格式为：step-{sessionId}-{stepNumber}
   *
   * @param params - 创建步骤参数
   * @returns 创建的步骤对象
   *
   * @example
   * const step = await steps.createStep({
   *   sessionId: 'session-001',
   *   stepNumber: 1,
   *   thought: '我需要读取配置文件',
   *   action: {
   *     thought: '用户要求读取配置文件',
   *     toolName: 'file_read',
   *     parameters: { path: './config.yaml' },
   *     expectedOutcome: '获取配置文件内容'
   *   },
   *   status: 'running'
   * });
   */
  public async createStep(params: CreateStepParams): Promise<Step> {
    const {
      sessionId,
      stepNumber,
      thought,
      action,
      observation,
      reflection,
      status = 'running',
      checkpointData,
    } = params;

    // 生成唯一的 step_id
    const stepId = this.generateStepId(sessionId, stepNumber);
    const createdAt = new Date();

    // 序列化 JSON 字段
    const actionJson = JSON.stringify(action);
    const observationJson = observation ? JSON.stringify(observation) : null;
    const reflectionJson = reflection ? JSON.stringify(reflection) : null;

    // 插入数据库
    await this.db.run(
      `INSERT INTO steps (
        step_id, session_id, step_number, thought, action,
        observation, reflection, status, checkpoint_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stepId,
        sessionId,
        stepNumber,
        thought,
        actionJson,
        observationJson,
        reflectionJson,
        status,
        checkpointData || null,
        createdAt.toISOString(),
      ]
    );

    return {
      stepId,
      stepNumber,
      thought,
      action,
      observation: observation || { raw: '', summary: '', success: false },
      reflection: reflection || { whatHappened: '', whatWorked: '', whatFailed: '', adjustmentNeeded: false },
      status,
      checkpointData,
      createdAt,
    };
  }

  /**
   * 更新步骤
   *
   * 更新步骤的观察结果、反思记录、状态或检查点数据。
   * 只更新提供的字段，其他字段保持不变。
   *
   * @param stepId - 步骤 ID
   * @param params - 更新参数
   * @returns true 如果更新成功
   * @throws Error 如果步骤不存在
   *
   * @example
   * // 更新观察结果和状态
   * await steps.updateStep('step-session-001-1', {
   *   observation: { raw: '文件内容...', summary: '成功读取', success: true },
   *   status: 'completed'
   * });
   */
  public async updateStep(stepId: string, params: UpdateStepParams): Promise<boolean> {
    // 先检查步骤是否存在
    const existing = await this.getStep(stepId);
    if (!existing) {
      throw new Error(`步骤不存在: ${stepId}`);
    }

    const updates: string[] = [];
    const values: (string | null)[] = [];

    // 构建动态更新语句
    if (params.observation !== undefined) {
      updates.push('observation = ?');
      values.push(JSON.stringify(params.observation));
    }

    if (params.reflection !== undefined) {
      updates.push('reflection = ?');
      values.push(JSON.stringify(params.reflection));
    }

    if (params.status !== undefined) {
      updates.push('status = ?');
      values.push(params.status);
    }

    if (params.checkpointData !== undefined) {
      updates.push('checkpoint_data = ?');
      values.push(params.checkpointData);
    }

    // 如果没有要更新的字段，直接返回成功
    if (updates.length === 0) {
      return true;
    }

    // 执行更新
    const sql = `UPDATE steps SET ${updates.join(', ')} WHERE step_id = ?`;
    values.push(stepId);

    await this.db.run(sql, values);
    return true;
  }

  /**
   * 完成步骤
   *
   * 设置步骤状态为 'completed'。
   * 便捷方法，等同于调用 updateStep(stepId, { status: 'completed' })。
   *
   * @param stepId - 步骤 ID
   * @returns true 如果更新成功
   *
   * @example
   * await steps.completeStep('step-session-001-1');
   */
  public async completeStep(stepId: string): Promise<boolean> {
    return this.updateStep(stepId, { status: 'completed' });
  }

  /**
   * 失败步骤
   *
   * 设置步骤状态为 'failed'，并记录观察结果。
   *
   * @param stepId - 步骤 ID
   * @param errorMessage - 错误信息
   * @returns true 如果更新成功
   *
   * @example
   * await steps.failStep('step-session-001-1', '文件不存在');
   */
  public async failStep(stepId: string, errorMessage: string): Promise<boolean> {
    const observation: Observation = {
      raw: errorMessage,
      summary: `执行失败: ${errorMessage}`,
      success: false,
    };
    return this.updateStep(stepId, { status: 'failed', observation });
  }

  /**
   * 获取单个步骤
   *
   * @param stepId - 步骤 ID
   * @returns 步骤对象，如果不存在返回 null
   *
   * @example
   * const step = await steps.getStep('step-session-001-1');
   * if (step) {
   *   console.log(`步骤 ${step.stepNumber}: ${step.thought}`);
   * }
   */
  public async getStep(stepId: string): Promise<Step | null> {
    const row = await this.db.get<{
      step_id: string;
      session_id: string;
      step_number: number;
      thought: string;
      action: string;
      observation: string | null;
      reflection: string | null;
      status: StepStatus;
      checkpoint_data: string | null;
      created_at: string;
    }>('SELECT * FROM steps WHERE step_id = ?', [stepId]);

    if (!row) {
      return null;
    }

    return this.rowToStep(row);
  }

  /**
   * 获取会话的所有步骤
   *
   * @param sessionId - 会话 ID
   * @param options - 查询选项
   * @returns 步骤对象数组，按步骤序号排序
   *
   * @example
   * // 获取会话的完整执行历史
   * const history = await steps.getStepsBySession('session-001');
   * history.forEach(step => {
   *   console.log(`${step.stepNumber}. ${step.thought}`);
   * });
   *
   * // 只获取失败的步骤
   * const failedSteps = await steps.getStepsBySession('session-001', {
   *   status: 'failed'
   * });
   */
  public async getStepsBySession(
    sessionId: string,
    options: ListStepsOptions = {}
  ): Promise<Step[]> {
    const { status, limit = 1000, offset = 0, order = 'asc' } = options;

    let sql = 'SELECT * FROM steps WHERE session_id = ?';
    const params: (string | number)[] = [sessionId];

    // 添加状态过滤
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    // 添加排序
    sql += ` ORDER BY step_number ${order === 'asc' ? 'ASC' : 'DESC'}`;

    // 添加分页
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this.db.all<{
      step_id: string;
      session_id: string;
      step_number: number;
      thought: string;
      action: string;
      observation: string | null;
      reflection: string | null;
      status: StepStatus;
      checkpoint_data: string | null;
      created_at: string;
    }>(sql, params);

    return rows.map((row) => this.rowToStep(row));
  }

  /**
   * 获取最后执行的步骤
   *
   * 用于崩溃恢复，获取会话中最后执行的步骤。
   * 返回步骤序号最大的步骤。
   *
   * @param sessionId - 会话 ID
   * @returns 最后执行的步骤，如果会话没有步骤返回 null
   *
   * @example
   * // 崩溃恢复场景
   * const lastStep = await steps.getLastStep('session-001');
   * if (lastStep) {
   *   if (lastStep.status === 'running') {
   *     console.log('恢复执行步骤:', lastStep.stepNumber);
   *   } else {
   *     console.log('从步骤', lastStep.stepNumber + 1, '开始执行');
   *   }
   * }
   */
  public async getLastStep(sessionId: string): Promise<Step | null> {
    const row = await this.db.get<{
      step_id: string;
      session_id: string;
      step_number: number;
      thought: string;
      action: string;
      observation: string | null;
      reflection: string | null;
      status: StepStatus;
      checkpoint_data: string | null;
      created_at: string;
    }>(
      'SELECT * FROM steps WHERE session_id = ? ORDER BY step_number DESC LIMIT 1',
      [sessionId]
    );

    if (!row) {
      return null;
    }

    return this.rowToStep(row);
  }

  /**
   * 获取下一步序号
   *
   * 获取会话中下一个可用的步骤序号。
   * 用于创建新步骤时自动分配序号。
   *
   * @param sessionId - 会话 ID
   * @returns 下一步序号（从 1 开始）
   *
   * @example
   * const nextNumber = await steps.getNextStepNumber('session-001');
   * const step = await steps.createStep({
   *   sessionId: 'session-001',
   *   stepNumber: nextNumber,
   *   ...
   * });
   */
  public async getNextStepNumber(sessionId: string): Promise<number> {
    const row = await this.db.get<{ max_number: number | null }>(
      'SELECT MAX(step_number) as max_number FROM steps WHERE session_id = ?',
      [sessionId]
    );

    return (row?.max_number ?? 0) + 1;
  }

  /**
   * 删除步骤
   *
   * @param stepId - 步骤 ID
   * @returns true 如果删除成功
   * @throws Error 如果步骤不存在
   *
   * @example
   * await steps.deleteStep('step-session-001-1');
   */
  public async deleteStep(stepId: string): Promise<boolean> {
    // 先检查步骤是否存在
    const existing = await this.getStep(stepId);
    if (!existing) {
      throw new Error(`步骤不存在: ${stepId}`);
    }

    await this.db.run('DELETE FROM steps WHERE step_id = ?', [stepId]);
    return true;
  }

  /**
   * 删除会话的所有步骤
   *
   * @param sessionId - 会话 ID
   * @returns 删除的步骤数量
   *
   * @example
   * const deletedCount = await steps.deleteStepsBySession('session-001');
   * console.log(`删除了 ${deletedCount} 个步骤`);
   */
  public async deleteStepsBySession(sessionId: string): Promise<number> {
    const result = await this.db.run('DELETE FROM steps WHERE session_id = ?', [
      sessionId,
    ]);
    return result.changes;
  }

  /**
   * 获取步骤数量
   *
   * @param sessionId - 会话 ID
   * @param status - 可选的状态过滤
   * @returns 步骤数量
   *
   * @example
   * const totalCount = await steps.getStepCount('session-001');
   * const failedCount = await steps.getStepCount('session-001', 'failed');
   */
  public async getStepCount(
    sessionId: string,
    status?: StepStatus
  ): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM steps WHERE session_id = ?';
    const params: (string | number)[] = [sessionId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    const row = await this.db.get<{ count: number }>(sql, params);
    return row?.count ?? 0;
  }

  /**
   * 生成唯一的步骤 ID
   *
   * 格式: step-{sessionId}-{stepNumber}
   * 示例: step-session-1713181200000-a1b2c3-1
   *
   * @private
   * @param sessionId - 会话 ID
   * @param stepNumber - 步骤序号
   * @returns 唯一的步骤 ID
   */
  private generateStepId(sessionId: string, stepNumber: number): string {
    return `step-${sessionId}-${stepNumber}`;
  }

  /**
   * 将数据库行转换为 Step 对象
   *
   * @private
   * @param row - 数据库行数据
   * @returns Step 对象
   */
  private rowToStep(row: {
    step_id: string;
    session_id: string;
    step_number: number;
    thought: string;
    action: string;
    observation: string | null;
    reflection: string | null;
    status: StepStatus;
    checkpoint_data: string | null;
    created_at: string;
  }): Step {
    // 解析 JSON 字段
    const action: AgentAction = JSON.parse(row.action);
    const observation: Observation = row.observation
      ? JSON.parse(row.observation)
      : { raw: '', summary: '', success: false };
    const reflection: Reflection = row.reflection
      ? JSON.parse(row.reflection)
      : { whatHappened: '', whatWorked: '', whatFailed: '', adjustmentNeeded: false };

    return {
      stepId: row.step_id,
      stepNumber: row.step_number,
      thought: row.thought,
      action,
      observation,
      reflection,
      status: row.status,
      checkpointData: row.checkpoint_data || undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
