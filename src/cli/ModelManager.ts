/**
 * @file ModelManager.ts
 * @description 模型管理器，提供数据库层面的模型 CRUD 操作
 *              管理 model_providers 表的增删改查
 * @module cli
 * @author AI Agent
 * @date 2026-04-22
 * @version 1.0.0
 */

import { SQLiteClient } from '../memory/SQLiteClient';

/**
 * 模型配置（数据库记录）
 */
export interface ModelConfig {
  id: string;
  name: string;
  provider_type: string;
  model_name: string;
  api_key_encrypted?: string;
  base_url?: string;
  config_json?: string;
  supports_vision: boolean;
  supports_tools: boolean;
  supports_streaming: boolean;
  max_tokens: number;
  rpm_limit?: number;
  daily_cost_limit?: number;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
}

/**
 * 模型配置输入（用于添加/更新）
 */
export interface ModelConfigInput {
  id: string;
  name: string;
  provider_type: string;
  model_name: string;
  api_key?: string;
  base_url?: string;
  supports_vision?: boolean;
  supports_tools?: boolean;
  supports_streaming?: boolean;
  max_tokens?: number;
  rpm_limit?: number;
  daily_cost_limit?: number;
  is_active?: boolean;
  is_default?: boolean;
  priority?: number;
}

/**
 * 模型管理器
 *
 * 提供对 model_providers 表的 CRUD 操作
 */
export class ModelManager {
  /** 数据库客户端 */
  private db: SQLiteClient;

  /**
   * 创建 ModelManager 实例
   *
   * @param db - SQLite 客户端
   */
  constructor(db: SQLiteClient) {
    this.db = db;
  }

  /**
   * 列出所有模型
   *
   * @returns 模型配置列表
   */
  async listModels(): Promise<ModelConfig[]> {
    const rows = await this.db.all<ModelConfig>(
      'SELECT * FROM model_providers ORDER BY created_at DESC'
    );
    return rows;
  }

  /**
   * 获取单个模型配置
   *
   * @param id - 模型 ID
   * @returns 模型配置或 null
   */
  async getModel(id: string): Promise<ModelConfig | null> {
    return this.db.get<ModelConfig>('SELECT * FROM model_providers WHERE id = ?', [id]);
  }

  /**
   * 添加模型
   *
   * @param input - 模型配置输入
   * @returns 添加的模型配置
   */
  async addModel(input: ModelConfigInput): Promise<ModelConfig> {
    const now = new Date().toISOString();

    // 检查 ID 是否已存在
    const existing = await this.getModel(input.id);
    if (existing) {
      throw new Error(`Model with id '${input.id}' already exists`);
    }

    // 如果设为默认，先清除其他默认模型
    if (input.is_default) {
      await this.db.run(
        'UPDATE model_providers SET is_default = 0 WHERE is_default = 1'
      );
    }

    await this.db.run(
      `INSERT INTO model_providers (
        id, name, provider_type, model_name, api_key_encrypted, base_url,
        supports_vision, supports_tools, supports_streaming, max_tokens,
        rpm_limit, daily_cost_limit, is_active, is_default, priority,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.name,
        input.provider_type,
        input.model_name,
        input.api_key || null,
        input.base_url || null,
        input.supports_vision ?? false,
        input.supports_tools ?? true,
        input.supports_streaming ?? true,
        input.max_tokens ?? 4096,
        input.rpm_limit || null,
        input.daily_cost_limit || null,
        input.is_active ?? true,
        input.is_default ?? false,
        input.priority ?? 0,
        now,
        now,
      ]
    );

    const model = await this.getModel(input.id);
    if (!model) {
      throw new Error('Failed to add model');
    }
    return model;
  }

  /**
   * 更新模型配置
   *
   * @param id - 模型 ID
   * @param updates - 要更新的字段
   * @returns 更新后的模型配置
   */
  async updateModel(id: string, updates: Partial<ModelConfigInput>): Promise<ModelConfig> {
    const existing = await this.getModel(id);
    if (!existing) {
      throw new Error(`Model '${id}' not found`);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.model_name !== undefined) {
      setClauses.push('model_name = ?');
      values.push(updates.model_name);
    }
    if (updates.api_key !== undefined) {
      setClauses.push('api_key_encrypted = ?');
      values.push(updates.api_key);
    }
    if (updates.base_url !== undefined) {
      setClauses.push('base_url = ?');
      values.push(updates.base_url || null);
    }
    if (updates.supports_vision !== undefined) {
      setClauses.push('supports_vision = ?');
      values.push(updates.supports_vision ? 1 : 0);
    }
    if (updates.supports_tools !== undefined) {
      setClauses.push('supports_tools = ?');
      values.push(updates.supports_tools ? 1 : 0);
    }
    if (updates.supports_streaming !== undefined) {
      setClauses.push('supports_streaming = ?');
      values.push(updates.supports_streaming ? 1 : 0);
    }
    if (updates.max_tokens !== undefined) {
      setClauses.push('max_tokens = ?');
      values.push(updates.max_tokens);
    }
    if (updates.rpm_limit !== undefined) {
      setClauses.push('rpm_limit = ?');
      values.push(updates.rpm_limit || null);
    }
    if (updates.daily_cost_limit !== undefined) {
      setClauses.push('daily_cost_limit = ?');
      values.push(updates.daily_cost_limit || null);
    }
    if (updates.is_active !== undefined) {
      setClauses.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.is_default !== undefined) {
      setClauses.push('is_default = ?');
      values.push(updates.is_default ? 1 : 0);
    }
    if (updates.priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(updates.priority);
    }

    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);

    await this.db.run(
      `UPDATE model_providers SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    // 如果设为默认，清除其他默认
    if (updates.is_default) {
      await this.db.run(
        'UPDATE model_providers SET is_default = 0 WHERE is_default = 1 AND id != ?',
        [id]
      );
    }

    const model = await this.getModel(id);
    if (!model) {
      throw new Error('Failed to update model');
    }
    return model;
  }

  /**
   * 删除模型
   *
   * @param id - 模型 ID
   * @returns 是否删除成功
   */
  async removeModel(id: string): Promise<boolean> {
    const existing = await this.getModel(id);
    if (!existing) {
      return false;
    }

    const result = await this.db.run('DELETE FROM model_providers WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 设置默认模型
   *
   * @param id - 模型 ID
   * @returns 更新后的模型配置
   */
  async setDefault(id: string): Promise<ModelConfig> {
    return this.updateModel(id, { is_default: true });
  }

  /**
   * 启用/禁用模型
   *
   * @param id - 模型 ID
   * @param active - 是否启用
   * @returns 更新后的模型配置
   */
  async setActive(id: string, active: boolean): Promise<ModelConfig> {
    return this.updateModel(id, { is_active: active });
  }

  /**
   * 获取默认模型
   *
   * @returns 默认模型配置或 null
   */
  async getDefaultModel(): Promise<ModelConfig | null> {
    return this.db.get<ModelConfig>(
      'SELECT * FROM model_providers WHERE is_default = 1 LIMIT 1'
    );
  }

  /**
   * 检查模型是否存在
   *
   * @param id - 模型 ID
   * @returns 是否存在
   */
  async hasModel(id: string): Promise<boolean> {
    const model = await this.getModel(id);
    return model !== null;
  }
}
