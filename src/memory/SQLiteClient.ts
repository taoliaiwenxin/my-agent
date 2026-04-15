/**
 * @file SQLiteClient.ts
 * @description SQLite 数据库客户端封装，负责数据库连接、初始化和基础 CRUD 操作。
 *              使用 @libsql/client 实现，支持异步操作和事务。
 *              自动创建所需的表结构，包括会话、步骤、记忆、工具调用和 LLM 调用记录。
 * @module memory
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 *
 * @example
 * // 基本使用
 * const db = new SQLiteClient('./storage/agent.db');
 * await db.connect();
 *
 * // 执行查询
 * const result = await db.get('SELECT * FROM sessions WHERE session_id = ?', ['session-001']);
 *
 * // 执行更新
 * await db.run('INSERT INTO sessions (session_id, task_description) VALUES (?, ?)',
 *   ['session-002', '新任务']);
 *
 * @see {@link ARCHITECTURE.md}
 */

import { createClient, Client } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SQLite 客户端类
 *
 * 封装 @libsql/client 的数据库操作，提供：
 * - 连接管理（连接、关闭）
 * - 自动表结构初始化
 * - 基础 CRUD 操作（get, run, all）
 * - 事务支持
 */
export class SQLiteClient {
  /** 数据库文件路径 */
  private dbPath: string;

  /** 数据库客户端实例 */
  private client: Client | null = null;

  /** 是否已连接 */
  private connected: boolean = false;

  /**
   * 创建 SQLiteClient 实例
   *
   * @param dbPath - 数据库文件路径，默认为 ./storage/agent.db
   */
  constructor(dbPath: string = './storage/agent.db') {
    this.dbPath = path.resolve(dbPath);
  }

  /**
   * 连接到数据库
   *
   * 如果数据库文件所在目录不存在，会自动创建目录。
   * 连接后会自动初始化表结构。
   *
   * @throws {Error} 如果连接失败
   *
   * @example
   * const db = new SQLiteClient('./storage/agent.db');
   * await db.connect();
   * console.log('数据库已连接');
   */
  public async connect(): Promise<void> {
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      // 创建客户端（使用 file: 协议）
      this.client = createClient({
        url: `file:${this.dbPath}`,
      });

      this.connected = true;

      // 初始化表结构
      await this.initializeTables();
    } catch (error) {
      throw new Error(
        `数据库连接失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 关闭数据库连接
   *
   * @example
   * await db.close();
   * console.log('数据库已关闭');
   */
  public async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * 检查是否已连接
   *
   * @returns true 如果已连接到数据库
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取数据库路径
   *
   * @returns 数据库文件的绝对路径
   */
  public getDbPath(): string {
    return this.dbPath;
  }

  /**
   * 初始化数据库表结构
   *
   * 创建所有必需的表：
   * - sessions: 会话历史
   * - steps: 执行步骤（支持崩溃恢复）
   * - memories: 长期记忆
   * - tool_calls: 工具调用日志
   * - llm_calls: LLM 调用记录（Token 预算、成本追踪）
   * - model_providers: 模型提供商配置表
   *
   * @private
   */
  private async initializeTables(): Promise<void> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    // 会话表
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        task_description TEXT,
        final_status TEXT,
        final_result TEXT
      )
    `);

    // 步骤表（最重要，支持崩溃恢复）
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS steps (
        step_id TEXT PRIMARY KEY,
        session_id TEXT,
        step_number INTEGER,
        thought TEXT,
        action TEXT,
        observation TEXT,
        reflection TEXT,
        status TEXT,
        checkpoint_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // 长期记忆表
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        memory_id TEXT PRIMARY KEY,
        type TEXT,
        content TEXT,
        embedding TEXT,
        relevance_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 工具调用日志表
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        call_id TEXT PRIMARY KEY,
        step_id TEXT,
        tool_name TEXT,
        parameters TEXT,
        result_summary TEXT,
        execution_time_ms INTEGER,
        success BOOLEAN,
        FOREIGN KEY (step_id) REFERENCES steps(step_id)
      )
    `);

    // LLM 调用记录表
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS llm_calls (
        call_id TEXT PRIMARY KEY,
        session_id TEXT,
        provider_id TEXT,
        model_name TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        cost_usd REAL,
        latency_ms INTEGER,
        success BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // 模型提供商配置表
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS model_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key_encrypted TEXT,
        base_url TEXT,
        config_json TEXT,
        supports_vision BOOLEAN DEFAULT 0,
        supports_tools BOOLEAN DEFAULT 0,
        supports_streaming BOOLEAN DEFAULT 1,
        max_tokens INTEGER DEFAULT 4096,
        rpm_limit INTEGER,
        daily_cost_limit REAL,
        is_active BOOLEAN DEFAULT 1,
        is_default BOOLEAN DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME
      )
    `);

    // 创建索引以提高查询性能
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id)
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_steps_number ON steps(session_id, step_number)
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_llm_calls_session ON llm_calls(session_id)
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_providers_active ON model_providers(is_active)
    `);
  }

  /**
   * 执行 SQL 查询，返回单行结果
   *
   * @param sql - SQL 查询语句（可使用 ? 占位符）
   * @param params - 查询参数
   * @returns 单行结果对象，如果没有结果返回 null
   *
   * @example
   * const row = await db.get('SELECT * FROM sessions WHERE session_id = ?', ['session-001']);
   * if (row) {
   *   console.log(row.task_description);
   * }
   */
  public async get<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    try {
      const result = await this.client.execute({
        sql,
        args: params as (string | number | boolean | null)[],
      });

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToObject(result.rows[0]) as T;
    } catch (error) {
      throw new Error(
        `查询失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行 SQL 查询，返回所有结果
   *
   * @param sql - SQL 查询语句
   * @param params - 查询参数
   * @returns 结果对象数组
   *
   * @example
   * const rows = await db.all('SELECT * FROM sessions WHERE final_status = ?', ['completed']);
   * rows.forEach(row => console.log(row.session_id));
   */
  public async all<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    try {
      const result = await this.client.execute({
        sql,
        args: params as (string | number | boolean | null)[],
      });

      return result.rows.map((row) => this.rowToObject(row)) as T[];
    } catch (error) {
      throw new Error(
        `查询失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行 SQL 更新语句（INSERT, UPDATE, DELETE）
   *
   * @param sql - SQL 语句
   * @param params - 语句参数
   * @returns 包含 lastID 和 changes 的对象
   *
   * @example
   * const result = await db.run(
   *   'INSERT INTO sessions (session_id, task_description) VALUES (?, ?)',
   *   ['session-002', '新任务']
   * );
   * console.log(`插入成功，ID: ${result.lastID}`);
   */
  public async run(
    sql: string,
    params: unknown[] = []
  ): Promise<{ lastID: number; changes: number }> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    try {
      const result = await this.client.execute({
        sql,
        args: params as (string | number | boolean | null)[],
      });

      // @libsql/client 返回的 meta 信息可能不包含 last_insert_rowid
      // 这里返回默认值
      return {
        lastID: 0,
        changes: result.rowsAffected || 0,
      };
    } catch (error) {
      throw new Error(
        `执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行事务
   *
   * 在事务中执行多个操作，如果任何操作失败则回滚所有更改。
   *
   * @param callback - 事务回调函数，接收事务客户端
   * @returns 回调函数的返回值
   *
   * @example
   * await db.transaction(async (tx) => {
   *   await tx.run('INSERT INTO sessions ...', [...]);
   *   await tx.run('INSERT INTO steps ...', [...]);
   * });
   */
  public async transaction<T>(
    callback: (client: Client) => Promise<T>
  ): Promise<T> {
    if (!this.client) {
      throw new Error('数据库未连接');
    }

    try {
      await this.client.execute('BEGIN TRANSACTION');
      const result = await callback(this.client);
      await this.client.execute('COMMIT');
      return result;
    } catch (error) {
      await this.client.execute('ROLLBACK');
      throw error;
    }
  }

  /**
   * 将行数据转换为普通对象
   *
   * @private
   * @param row - 数据库行数据
   * @returns 转换后的对象
   */
  private rowToObject(row: Record<string, unknown>): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * 删除数据库文件（仅用于测试）
   *
   * Windows 上可能需要多次重试，因为文件句柄释放可能有延迟。
   *
   * @example
   * await db.deleteDatabase();
   */
  public async deleteDatabase(): Promise<void> {
    await this.close();

    // Windows 上需要等待连接完全关闭，使用重试机制
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (fs.existsSync(this.dbPath)) {
          fs.unlinkSync(this.dbPath);
        }
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }
        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
      }
    }
  }
}

/**
 * 便捷函数：创建并连接数据库客户端
 *
 * @param dbPath - 数据库文件路径
 * @returns 已连接的 SQLiteClient 实例
 *
 * @example
 * const db = await createSQLiteClient('./storage/agent.db');
 * // 可以直接使用 db 进行操作
 */
export async function createSQLiteClient(
  dbPath?: string
): Promise<SQLiteClient> {
  const client = new SQLiteClient(dbPath);
  await client.connect();
  return client;
}
