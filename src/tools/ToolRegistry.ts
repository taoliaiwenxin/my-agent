/**
 * @file ToolRegistry.ts
 * @description 工具注册表，负责管理所有工具的注册、查询和生命周期管理。
 *              提供统一的工具管理接口，支持工具的动态注册和获取。
 *              是工具子系统的核心组件，被 ToolExecutor 依赖使用。
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 创建注册表实例
 * const registry = new ToolRegistry();
 *
 * // 注册工具
 * registry.register({
 *   name: 'file_read',
 *   description: '读取文件内容',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: '文件路径' }
 *     },
 *     required: ['path']
 *   }
 * });
 *
 * // 获取工具
 * const tool = registry.get('file_read');
 *
 * // 列出所有工具
 * const tools = registry.list();
 *
 * @see {@link ToolExecutor.ts}
 * @see {@link ../types/index.ts}
 */

import { Tool } from '../types';

/**
 * 工具未找到错误
 *
 * 当尝试获取不存在的工具时抛出此错误。
 */
export class ToolNotFoundError extends Error {
  /**
   * 创建工具未找到错误
   *
   * @param toolName - 未找到的工具名称
   */
  constructor(toolName: string) {
    super(`工具未找到: ${toolName}`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * 工具重复注册错误
 *
 * 当尝试注册已存在的工具时抛出此错误。
 */
export class DuplicateToolError extends Error {
  /**
   * 创建工具重复注册错误
   *
   * @param toolName - 重复的工具名称
   */
  constructor(toolName: string) {
    super(`工具已存在: ${toolName}`);
    this.name = 'DuplicateToolError';
  }
}

/**
 * 工具注册表
 *
 * 负责管理所有工具的注册、查询和生命周期。
 * 采用注册表模式，支持工具的动态发现和获取。
 *
 * 核心概念：
 * - Tool: 工具定义，包含名称、描述和参数 Schema
 * - 工具名称: 唯一标识符，用于后续查询
 * - 注册: 将工具添加到注册表
 *
 * 使用流程：
 * 1. 创建注册表实例
 * 2. 注册工具（register）
 * 3. 获取使用（get/list）
 * 4. 取消注册（unregister，可选）
 *
 * @example
 * // 创建注册表
 * const registry = new ToolRegistry();
 *
 * // 注册多个工具
 * registry.register(fileReadTool);
 * registry.register(fileWriteTool);
 *
 * // 获取特定工具
 * const tool = registry.get('file_read');
 *
 * // 列出所有工具
 * const allTools = registry.list();
 */
export class ToolRegistry {
  /**
   * 工具存储映射表
   * Key: 工具名称（唯一标识符）
   * Value: 工具定义对象
   */
  private tools: Map<string, Tool> = new Map();

  /**
   * 注册工具
   *
   * 将工具添加到注册表中。工具名称必须唯一，重复注册会抛出错误。
   * 需要先取消注册同名工具才能重新注册。
   *
   * @param tool - 工具定义对象
   * @param tool.name - 工具名称，必须唯一
   * @param tool.description - 工具描述，用于 LLM 理解工具用途
   * @param tool.parameters - 参数定义（JSON Schema 格式）
   * @throws {DuplicateToolError} 当工具名称已存在时抛出
   *
   * @example
   * // 注册文件读取工具
   * registry.register({
   *   name: 'file_read',
   *   description: '读取指定路径的文件内容',
   *   parameters: {
   *     type: 'object',
   *     properties: {
   *       path: {
   *         type: 'string',
   *         description: '要读取的文件路径'
   *       }
   *     },
   *     required: ['path']
   *   }
   * });
   *
   * @example
   * // 错误处理
   * try {
   *   registry.register(tool);
   * } catch (error) {
   *   if (error instanceof DuplicateToolError) {
   *     console.log('工具已存在，请先取消注册');
   *   }
   * }
   */
  public register(tool: Tool): void {
    // 检查工具名称是否已存在
    if (this.tools.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }

    // 验证工具定义的有效性
    this.validateTool(tool);

    // 注册工具
    this.tools.set(tool.name, tool);
  }

  /**
   * 取消注册工具
   *
   * 从注册表中移除指定工具。如果工具不存在，静默返回。
   *
   * @param toolName - 要移除的工具名称
   * @returns 是否成功移除（工具存在且被移除返回 true，不存在返回 false）
   *
   * @example
   * // 取消注册工具
   * const removed = registry.unregister('file_read');
   * if (removed) {
   *   console.log('工具已移除');
   * }
   */
  public unregister(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * 获取工具
   *
   * 根据工具名称获取工具定义。如果工具不存在，抛出错误。
   *
   * @param toolName - 工具名称
   * @returns 工具定义对象
   * @throws {ToolNotFoundError} 当工具不存在时抛出
   *
   * @example
   * // 获取工具
   * try {
   *   const tool = registry.get('file_read');
   *   console.log(tool.description);
   * } catch (error) {
   *   if (error instanceof ToolNotFoundError) {
   *     console.log('工具未注册');
   *   }
   * }
   */
  public get(toolName: string): Tool {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new ToolNotFoundError(toolName);
    }

    return tool;
  }

  /**
   * 检查工具是否存在
   *
   * 检查指定名称的工具是否已注册。
   *
   * @param toolName - 工具名称
   * @returns 是否存在
   *
   * @example
   * // 检查工具是否存在
   * if (registry.has('file_read')) {
   *   const tool = registry.get('file_read');
   * }
   */
  public has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * 列出所有工具
   *
   * 获取注册表中所有工具的列表。
   *
   * @returns 工具定义数组
   *
   * @example
   * // 列出所有工具
   * const tools = registry.list();
   * console.log(`已注册 ${tools.length} 个工具`);
   * tools.forEach(tool => {
   *   console.log(`- ${tool.name}: ${tool.description}`);
   * });
   */
  public list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具名称列表
   *
   * 获取所有已注册工具的名称列表。
   *
   * @returns 工具名称数组
   *
   * @example
   * // 获取工具名称列表
   * const names = registry.listNames();
   * console.log('可用工具:', names.join(', '));
   */
  public listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具数量
   *
   * @returns 已注册工具的数量
   */
  public count(): number {
    return this.tools.size;
  }

  /**
   * 清空注册表
   *
   * 移除所有已注册的工具。此操作不可恢复。
   *
   * @example
   * // 清空所有工具
   * registry.clear();
   * console.log('已清空所有工具');
   */
  public clear(): void {
    this.tools.clear();
  }

  /**
   * 批量注册工具
   *
   * 一次性注册多个工具。如果某个工具已存在，会抛出错误并停止后续注册。
   *
   * @param tools - 工具定义数组
   * @throws {DuplicateToolError} 当任一工具已存在时抛出
   *
   * @example
   * // 批量注册工具
   * registry.registerBatch([
   *   fileReadTool,
   *   fileWriteTool,
   *   shellTool
   * ]);
   */
  public registerBatch(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 转换为 LLM 工具定义格式
   *
   * 将注册表中的工具转换为 LLM 调用所需的格式。
   * 主要用于 Anthropic 和 OpenAI 等 LLM API 的工具定义。
   *
   * @returns LLM 工具定义数组
   *
   * @example
   * // 获取 LLM 格式的工具定义
   * const llmTools = registry.toLLMFormat();
   * const response = await anthropic.messages.create({
   *   model: 'claude-3-sonnet',
   *   messages,
   *   tools: llmTools
   * });
   */
  public toLLMFormat(): Array<{
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  }> {
    return this.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: tool.parameters.type,
        properties: tool.parameters.properties as Record<string, unknown>,
        required: tool.parameters.required
      }
    }));
  }

  /**
   * 验证工具定义的有效性
   *
   * 检查工具定义是否符合规范，包括：
   * - 工具名称不能为空
   * - 工具描述不能为空
   * - 参数定义必须有效
   *
   * @param tool - 工具定义对象
   * @throws {Error} 当工具定义无效时抛出
   */
  private validateTool(tool: Tool): void {
    // 验证工具名称
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('工具名称不能为空且必须是字符串');
    }

    // 验证工具名称格式（只允许字母、数字、下划线）
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      throw new Error(
        `工具名称格式无效: ${tool.name}。` +
        '名称必须以字母开头，只能包含字母、数字和下划线'
      );
    }

    // 验证工具描述
    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('工具描述不能为空且必须是字符串');
    }

    // 验证参数定义
    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new Error('工具参数定义必须是对象');
    }

    // 验证参数类型
    if (tool.parameters.type !== 'object') {
      throw new Error('工具参数类型必须是 "object"');
    }

    // 验证参数属性
    if (!tool.parameters.properties || typeof tool.parameters.properties !== 'object') {
      throw new Error('工具参数属性 (properties) 必须定义');
    }

    // 验证 required 数组（如果存在）
    if (tool.parameters.required !== undefined) {
      if (!Array.isArray(tool.parameters.required)) {
        throw new Error('工具参数 required 必须是数组');
      }

      // 确保所有 required 字段都在 properties 中定义
      const propertyKeys = Object.keys(tool.parameters.properties);
      for (const requiredField of tool.parameters.required) {
        if (!propertyKeys.includes(requiredField)) {
          throw new Error(
            `required 字段 "${requiredField}" 未在 properties 中定义`
          );
        }
      }
    }
  }
}
