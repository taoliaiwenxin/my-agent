/**
 * @file ToolExecutor.ts
 * @description 工具执行器，负责统一管理工具的执行、错误处理和权限检查。
 *              整合 ToolRegistry 和所有工具实现，提供统一的工具调用接口。
 *              是工具子系统的核心协调组件。
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 创建执行器
 * const executor = new ToolExecutor({
 *   allowedPaths: ['./workspace'],
 *   permissionLevel: 'execute'
 * });
 *
 * // 注册工具
 * executor.registerTool(FileReadTool);
 * executor.registerTool(FileWriteTool);
 * executor.registerTool(ShellTool);
 * executor.registerTool(TerminateTool);
 *
 * // 执行工具
 * const result = await executor.execute('file_read', { path: './test.txt' });
 *
 * // 获取所有工具定义（用于 LLM）
 * const tools = executor.getAllTools();
 *
 * @see {@link ToolRegistry.ts}
 * @see {@link implementations/FileReadTool.ts}
 * @see {@link implementations/FileWriteTool.ts}
 * @see {@link implementations/ShellTool.ts}
 * @see {@link implementations/TerminateTool.ts}
 */

import inquirer from 'inquirer';
import { ToolRegistry } from './ToolRegistry';
import { FileReadTool } from './implementations/FileReadTool';
import { FileWriteTool } from './implementations/FileWriteTool';
import { ShellTool } from './implementations/ShellTool';
import { TerminateTool } from './implementations/TerminateTool';
import {
  Tool,
  ToolExecutionContext,
  ToolExecutionResult,
  PermissionLevel
} from '../types';

/**
 * 工具执行器配置
 */
interface ToolExecutorConfig {
  /** 允许访问的路径列表 */
  allowedPaths: string[];
  /** 权限级别 */
  permissionLevel: PermissionLevel;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** 步骤 ID（可选） */
  stepId?: string;
  /** 是否启用人工确认（修改性操作前提示） */
  enableHumanConfirm?: boolean;
}

/**
 * 工具实现类型
 * 允许具有不同参数类型的工具
 */
type AnyToolImplementation = {
  name: string;
  definition: Tool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (params: any, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
};

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`工具未找到: ${toolName}`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * 工具执行器
 *
 * 负责管理工具注册、执行和错误处理。
 * 是 Agent 与工具系统交互的统一入口。
 *
 * 核心职责：
 * - 工具注册：管理所有可用工具
 * - 权限控制：验证执行上下文权限
 * - 执行调度：调用相应工具并处理结果
 * - 错误处理：统一处理工具执行错误
 *
 * 使用流程：
 * 1. 创建执行器实例
 * 2. 注册工具（registerTool）或注册所有默认工具（registerDefaultTools）
 * 3. 执行工具（execute）
 * 4. 获取工具定义（getAllTools，用于 LLM）
 *
 * @example
 * const executor = new ToolExecutor({
 *   allowedPaths: ['./workspace'],
 *   permissionLevel: 'execute'
 * });
 *
 * // 注册默认工具
 * executor.registerDefaultTools();
 *
 * // 执行工具
 * const result = await executor.execute('file_read', { path: './test.txt' });
 */
export class ToolExecutor {
  /** 工具注册表 */
  private registry: ToolRegistry;

  /** 工具实现映射表 */
  private implementations: Map<string, AnyToolImplementation> = new Map();

  /** 配置信息 */
  private config: ToolExecutorConfig;

  /**
   * 创建工具执行器实例
   *
   * @param config - 执行器配置
   * @param config.allowedPaths - 允许访问的路径列表
   * @param config.permissionLevel - 权限级别
   * @param config.sessionId - 可选，会话 ID
   * @param config.stepId - 可选，步骤 ID
   *
   * @example
   * const executor = new ToolExecutor({
   *   allowedPaths: [process.cwd()],
   *   permissionLevel: 'execute',
   *   sessionId: 'sess-001'
   * });
   */
  constructor(config: ToolExecutorConfig) {
    this.registry = new ToolRegistry();
    this.config = config;
  }

  /**
   * 注册工具
   *
   * 将工具添加到执行器中。
   *
   * @param tool - 工具实现
   * @throws {Error} 当工具名称已存在时抛出
   *
   * @example
   * executor.registerTool(FileReadTool);
   * executor.registerTool(FileWriteTool);
   */
  public registerTool(tool: AnyToolImplementation): void {
    // 注册到注册表
    this.registry.register(tool.definition);
    // 保存实现
    this.implementations.set(tool.name, tool);
  }

  /**
   * 注册所有默认工具
   *
   * 一次性注册所有内置工具：file_read, file_write, shell, terminate。
   *
   * @example
   * const executor = new ToolExecutor(config);
   * executor.registerDefaultTools();
   * // 现在可以使用所有默认工具
   */
  public registerDefaultTools(): void {
    this.registerTool(FileReadTool);
    this.registerTool(FileWriteTool);
    this.registerTool(ShellTool);
    this.registerTool(TerminateTool);
  }

  /**
   * 执行工具
   *
   * 根据工具名称调用相应工具的执行函数。
   *
   * 执行流程：
   * 1. 查找工具实现
   * 2. 构建执行上下文
   * 3. 调用工具执行
   * 4. 返回结果
   *
   * @param toolName - 工具名称
   * @param params - 工具参数
   * @returns 工具执行结果
   * @throws {ToolNotFoundError} 当工具不存在时抛出
   *
   * @example
   * // 读取文件
   * const result = await executor.execute('file_read', { path: './test.txt' });
   *
   * @example
   * // 写入文件
   * const result = await executor.execute('file_write', {
   *   path: './output.txt',
   *   content: 'Hello'
   * });
   *
   * @example
   * // 执行命令
   * const result = await executor.execute('shell', { command: 'ls -la' });
   *
   * @example
   * // 终止任务
   * const result = await executor.execute('terminate', {
   *   status: 'success',
   *   message: '任务完成'
   * });
   */
  public async execute(
    toolName: string,
    params: unknown
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // 防御空工具名
    if (!toolName || typeof toolName !== 'string') {
      throw new ToolNotFoundError(toolName || '(空)');
    }

    // 查找工具实现
    const implementation = this.implementations.get(toolName);

    if (!implementation) {
      throw new ToolNotFoundError(toolName);
    }

    // 检查是否需要人工确认（修改性操作）
    if (this.config.enableHumanConfirm && this.isDestructiveOperation(toolName, params)) {
      const confirmed = await this.confirmAction(toolName, params);
      if (!confirmed) {
        return {
          success: false,
          error: '用户拒绝了该操作',
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 构建执行上下文
    const context: ToolExecutionContext = {
      sessionId: this.config.sessionId || 'default-session',
      stepId: this.config.stepId || 'default-step',
      permissionLevel: this.config.permissionLevel,
      allowedPaths: this.config.allowedPaths
    };

    try {
      // 执行工具
      const result = await implementation.execute(params, context);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: `工具执行异常: ${errorMessage}`,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * 检查工具是否存在
   *
   * @param toolName - 工具名称
   * @returns 是否存在
   */
  public hasTool(toolName: string): boolean {
    return this.implementations.has(toolName);
  }

  /**
   * 获取工具定义
   *
   * @param toolName - 工具名称
   * @returns 工具定义
   * @throws {ToolNotFoundError} 当工具不存在时抛出
   */
  public getToolDefinition(toolName: string): Tool {
    return this.registry.get(toolName);
  }

  /**
   * 获取所有工具定义
   *
   * @returns 所有已注册工具的列表
   */
  public getAllTools(): Tool[] {
    return this.registry.list();
  }

  /**
   * 获取所有工具名称
   *
   * @returns 工具名称列表
   */
  public getToolNames(): string[] {
    return Array.from(this.implementations.keys());
  }

  /**
   * 获取工具数量
   *
   * @returns 已注册工具的数量
   */
  public getToolCount(): number {
    return this.implementations.size;
  }

  /**
   * 获取 LLM 格式的工具定义
   *
   * 转换为 Anthropic/OpenAI 等 LLM API 所需的格式。
   *
   * @returns LLM 格式的工具定义数组
   *
   * @example
   * const tools = executor.getToolsForLLM();
   * // [
   * //   {
   * //     name: 'file_read',
   * //     description: '...',
   * //     input_schema: { type: 'object', properties: {...}, required: [...] }
   * //   },
   * //   ...
   * // ]
   */
  public getToolsForLLM(): ReturnType<ToolRegistry['toLLMFormat']> {
    return this.registry.toLLMFormat();
  }

  /**
   * 移除工具
   *
   * 从执行器中移除指定工具。
   *
   * @param toolName - 工具名称
   * @returns 是否成功移除
   */
  public unregisterTool(toolName: string): boolean {
    this.registry.unregister(toolName);
    return this.implementations.delete(toolName);
  }

  /**
   * 清空所有工具
   *
   * 移除所有已注册的工具。
   */
  public clearTools(): void {
    this.registry.clear();
    this.implementations.clear();
  }

  /**
   * 更新配置
   *
   * 动态更新执行器配置。
   *
   * @param config - 部分配置更新
   */
  public updateConfig(config: Partial<ToolExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   *
   * @returns 当前配置（副本）
   */
  public getConfig(): ToolExecutorConfig {
    return { ...this.config };
  }

  /**
   * 检测是否为修改性操作
   *
   * @param toolName - 工具名称
   * @param params - 工具参数
   * @returns 是否需要人工确认
   */
  private isDestructiveOperation(toolName: string, params: unknown): boolean {
    if (toolName === 'file_write') {
      return true;
    }

    if (toolName === 'shell') {
      const shellParams = params as { command?: string } | undefined;
      const command = shellParams?.command || '';
      const destructivePatterns = [
        />\s/,           // 输出重定向 >
        />>\s/,          // 追加重定向 >>
        /\brm\b/,        // 删除
        /\bmv\b/,        // 移动
        /\bcp\b/,        // 复制（覆盖）
        /\bchmod\b/,     // 修改权限
        /\bchown\b/,     // 修改所有者
        /\bdd\b/,        // 磁盘写入
        /\bmkfs\b/,      // 格式化
      ];
      return destructivePatterns.some((pattern) => pattern.test(command));
    }

    return false;
  }

  /**
   * 提示用户确认操作
   *
   * @param toolName - 工具名称
   * @param params - 工具参数
   * @returns 用户是否确认
   */
  private async confirmAction(toolName: string, params: unknown): Promise<boolean> {
    const paramStr = params ? JSON.stringify(params).substring(0, 200) : '{}';
    const message = `执行 ${toolName}(${paramStr})?`;

    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message,
          default: false,
        },
      ]);
      return confirmed;
    } catch {
      // 如果 inquirer 失败（如非 TTY 环境），默认拒绝
      return false;
    }
  }
}
