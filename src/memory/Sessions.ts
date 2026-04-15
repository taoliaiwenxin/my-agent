/**
 * @file Sessions.ts
 * @description 会话管理模块，负责会话的创建、状态更新和查询。
 *              提供对 sessions 表的高级封装，支持会话历史管理和崩溃恢复。
 * @module memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 *
 * @example
 * // 创建会话管理器
 * const sessions = new Sessions(db);
 *
 * // 创建新会话
 * const session = await sessions.createSession('分析代码库');
 *
 * // 更新会话状态
 * await sessions.updateSessionStatus(session.sessionId, 'running');
 *
 * // 查询会话
 * const sessionInfo = await sessions.getSession(session.sessionId);
 *
 * @see {@link SQLiteClient}
 * @see {@link types/index.ts}
 */

import { SQLiteClient } from './SQLiteClient';
import { Session, SessionStatus } from '../types';

/**
 * 创建会话参数
 */
export interface CreateSessionParams {
  /** 任务描述 */
  taskDescription: string;
  /** 初始状态，默认为 'pending' */
  initialStatus?: SessionStatus;
}

/**
 * 会话查询选项
 */
export interface ListSessionsOptions {
  /** 状态过滤 */
  status?: SessionStatus;
  /** 限制返回数量 */
  limit?: number;
  /** 偏移量（用于分页） */
  offset?: number;
  /** 按创建时间排序：'asc' 或 'desc'，默认为 'desc' */
  order?: 'asc' | 'desc';
}

/**
 * 会话管理器类
 *
 * 封装对 sessions 表的所有操作，包括：
 * - 创建新会话
 * - 更新会话状态和结果
 * - 查询单个会话信息
 * - 列会话历史
 */
export class Sessions {
  /** SQLite 客户端实例 */
  private db: SQLiteClient;

  /**
   * 创建 Sessions 管理器实例
   *
   * @param db - 已连接的 SQLiteClient 实例
   *
   * @example
   * const db = new SQLiteClient('./storage/agent.db');
   * await db.connect();
   * const sessions = new Sessions(db);
   */
  constructor(db: SQLiteClient) {
    this.db = db;
  }

  /**
   * 创建新会话
   *
   * 生成唯一的 session_id，并在数据库中创建会话记录。
   * session_id 格式为：session-{timestamp}-{random}
   *
   * @param params - 创建会话参数
   * @returns 创建的会话对象
   *
   * @example
   * const session = await sessions.createSession({
   *   taskDescription: '分析代码库并生成报告',
   *   initialStatus: 'pending'
   * });
   * console.log(session.sessionId); // 'session-1713181200000-a1b2c3'
   */
  public async createSession(params: CreateSessionParams): Promise<Session> {
    const { taskDescription, initialStatus = 'pending' } = params;

    // 生成唯一的 session_id
    const sessionId = this.generateSessionId();
    const createdAt = new Date();

    // 插入数据库
    await this.db.run(
      'INSERT INTO sessions (session_id, created_at, task_description, final_status) VALUES (?, ?, ?, ?)',
      [sessionId, createdAt.toISOString(), taskDescription, initialStatus]
    );

    return {
      sessionId,
      createdAt,
      taskDescription,
      finalStatus: initialStatus,
      stepCount: 0,
    };
  }

  /**
   * 更新会话状态
   *
   * @param sessionId - 会话 ID
   * @param status - 新状态
   * @param finalResult - 最终结果（可选，通常在会话完成时设置）
   * @returns true 如果更新成功
   * @throws Error 如果会话不存在
   *
   * @example
   * // 更新状态为运行中
   * await sessions.updateSessionStatus('session-001', 'running');
   *
   * // 完成会话并设置结果
   * await sessions.updateSessionStatus('session-001', 'completed', '任务完成');
   */
  public async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    finalResult?: string
  ): Promise<boolean> {
    // 先检查会话是否存在
    const existing = await this.getSession(sessionId);
    if (!existing) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    if (finalResult !== undefined) {
      await this.db.run(
        'UPDATE sessions SET final_status = ?, final_result = ? WHERE session_id = ?',
        [status, finalResult, sessionId]
      );
    } else {
      await this.db.run(
        'UPDATE sessions SET final_status = ? WHERE session_id = ?',
        [status, sessionId]
      );
    }

    return true;
  }

  /**
   * 完成会话
   *
   * 将会话状态设置为 'completed'，并记录最终结果。
   * 这是一个便捷方法，等同于调用 updateSessionStatus(sessionId, 'completed', result)。
   *
   * @param sessionId - 会话 ID
   * @param result - 最终结果
   * @returns true 如果更新成功
   *
   * @example
   * await sessions.completeSession('session-001', '代码分析完成，发现3个问题');
   */
  public async completeSession(sessionId: string, result: string): Promise<boolean> {
    return this.updateSessionStatus(sessionId, 'completed', result);
  }

  /**
   * 失败会话
   *
   * 将会话状态设置为 'failed'，并记录错误信息。
   *
   * @param sessionId - 会话 ID
   * @param error - 错误信息
   * @returns true 如果更新成功
   *
   * @example
   * await sessions.failSession('session-001', '执行超时');
   */
  public async failSession(sessionId: string, error: string): Promise<boolean> {
    return this.updateSessionStatus(sessionId, 'failed', error);
  }

  /**
   * 获取单个会话信息
   *
   * @param sessionId - 会话 ID
   * @returns 会话对象，如果不存在返回 null
   *
   * @example
   * const session = await sessions.getSession('session-001');
   * if (session) {
   *   console.log(`任务: ${session.taskDescription}`);
   *   console.log(`状态: ${session.finalStatus}`);
   * }
   */
  public async getSession(sessionId: string): Promise<Session | null> {
    const row = await this.db.get<{
      session_id: string;
      created_at: string;
      task_description: string;
      final_status: SessionStatus;
      final_result?: string;
    }>('SELECT * FROM sessions WHERE session_id = ?', [sessionId]);

    if (!row) {
      return null;
    }

    // 获取步骤数量
    const stepCount = await this.getStepCount(sessionId);

    return {
      sessionId: row.session_id,
      createdAt: new Date(row.created_at),
      taskDescription: row.task_description,
      finalStatus: row.final_status,
      stepCount,
      finalResult: row.final_result,
    };
  }

  /**
   * 查询会话列表
   *
   * @param options - 查询选项
   * @returns 会话对象数组
   *
   * @example
   * // 获取最近10个完成的会话
   * const completedSessions = await sessions.listSessions({
   *   status: 'completed',
   *   limit: 10,
   *   order: 'desc'
   * });
   *
   * // 分页获取所有会话
   * const page1 = await sessions.listSessions({ limit: 20, offset: 0 });
   * const page2 = await sessions.listSessions({ limit: 20, offset: 20 });
   */
  public async listSessions(options: ListSessionsOptions = {}): Promise<Session[]> {
    const {
      status,
      limit = 100,
      offset = 0,
      order = 'desc',
    } = options;

    let sql = 'SELECT * FROM sessions';
    const params: (string | number)[] = [];

    // 添加状态过滤
    if (status) {
      sql += ' WHERE final_status = ?';
      params.push(status);
    }

    // 添加排序
    sql += ` ORDER BY created_at ${order === 'asc' ? 'ASC' : 'DESC'}`;

    // 添加分页
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this.db.all<{
      session_id: string;
      created_at: string;
      task_description: string;
      final_status: SessionStatus;
      final_result?: string;
    }>(sql, params);

    // 获取每个会话的步骤数量
    const sessions: Session[] = [];
    for (const row of rows) {
      const stepCount = await this.getStepCount(row.session_id);
      sessions.push({
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        taskDescription: row.task_description,
        finalStatus: row.final_status,
        stepCount,
        finalResult: row.final_result,
      });
    }

    return sessions;
  }

  /**
   * 删除会话
   *
   * 删除会话及其关联的步骤记录（通过外键级联删除）。
   *
   * @param sessionId - 会话 ID
   * @returns true 如果删除成功
   * @throws Error 如果会话不存在
   *
   * @example
   * await sessions.deleteSession('session-001');
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    // 先检查会话是否存在
    const existing = await this.getSession(sessionId);
    if (!existing) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await this.db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
    return true;
  }

  /**
   * 获取会话数量
   *
   * @param status - 可选的状态过滤
   * @returns 会话数量
   *
   * @example
   * const totalCount = await sessions.getSessionCount();
   * const completedCount = await sessions.getSessionCount('completed');
   */
  public async getSessionCount(status?: SessionStatus): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM sessions';
    const params: string[] = [];

    if (status) {
      sql += ' WHERE final_status = ?';
      params.push(status);
    }

    const row = await this.db.get<{ count: number }>(sql, params);
    return row?.count ?? 0;
  }

  /**
   * 获取最近的活动会话
   *
   * 返回最近创建的、状态为 'pending' 或 'running' 的会话。
   * 用于崩溃恢复场景，找到需要恢复的会话。
   *
   * @param limit - 返回数量限制，默认为 10
   * @returns 会话对象数组
   *
   * @example
   * const activeSessions = await sessions.getActiveSessions();
   * for (const session of activeSessions) {
   *   console.log(`需要恢复: ${session.sessionId}`);
   * }
   */
  public async getActiveSessions(limit: number = 10): Promise<Session[]> {
    const sql = `
      SELECT * FROM sessions
      WHERE final_status IN ('pending', 'running')
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = await this.db.all<{
      session_id: string;
      created_at: string;
      task_description: string;
      final_status: SessionStatus;
      final_result?: string;
    }>(sql, [limit]);

    const sessions: Session[] = [];
    for (const row of rows) {
      const stepCount = await this.getStepCount(row.session_id);
      sessions.push({
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        taskDescription: row.task_description,
        finalStatus: row.final_status,
        stepCount,
        finalResult: row.final_result,
      });
    }

    return sessions;
  }

  /**
   * 生成唯一的会话 ID
   *
   * 格式: session-{timestamp}-{random}
   * 示例: session-1713181200000-a1b2c3
   *
   * @private
   * @returns 唯一的会话 ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session-${timestamp}-${random}`;
  }

  /**
   * 获取会话的步骤数量
   *
   * @private
   * @param sessionId - 会话 ID
   * @returns 步骤数量
   */
  private async getStepCount(sessionId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM steps WHERE session_id = ?',
      [sessionId]
    );
    return row?.count ?? 0;
  }
}
