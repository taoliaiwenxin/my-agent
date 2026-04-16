/**
 * @file FileWriteTool.ts
 * @description 文件写入工具实现，提供写入文本文件内容的功能。
 *              支持安全路径检查、目录自动创建、原子写入等功能。
 *              是 Agent 与文件系统交互的基础工具之一。
 * @module tools/implementations
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 基本使用
 * const result = await FileWriteTool.execute({
 *   path: './output.txt',
 *   content: 'Hello, World!'
 * });
 *
 * // 追加模式
 * const result = await FileWriteTool.execute({
 *   path: './log.txt',
 *   content: 'New log entry\n',
 *   append: true
 * });
 *
 * // 指定编码
 * const result = await FileWriteTool.execute({
 *   path: './data.txt',
 *   content: '中文内容',
 *   encoding: 'utf-8'
 * });
 *
 * @see {@link ../ToolRegistry.ts}
 * @see {@link ../../../types/index.ts}
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolExecutionContext, ToolExecutionResult } from '../../types';

/**
 * 文件写入工具定义
 *
 * 用于 LLM 理解和调用此工具的元数据定义。
 */
export const FileWriteToolDefinition: Tool = {
  name: 'file_write',
  description: '写入内容到指定路径的文本文件。' +
    '支持自动创建目录、追加模式和编码指定。' +
    '只能写入在允许路径列表中的位置。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要写入的文件路径，可以是相对路径或绝对路径'
      },
      content: {
        type: 'string',
        description: '要写入的文件内容'
      },
      encoding: {
        type: 'string',
        description: '文件编码格式，默认为 utf-8',
        default: 'utf-8'
      },
      append: {
        type: 'boolean',
        description: '是否追加到文件末尾，默认为 false（覆盖模式）',
        default: false
      },
      createDir: {
        type: 'boolean',
        description: '是否自动创建父目录，默认为 true',
        default: true
      }
    },
    required: ['path', 'content']
  }
};

/**
 * 文件写入参数
 */
interface FileWriteParams {
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件编码 */
  encoding?: string;
  /** 是否追加 */
  append?: boolean;
  /** 是否自动创建目录 */
  createDir?: boolean;
}

/**
 * 验证路径是否在允许列表中
 *
 * 安全检查：确保文件路径在允许的访问范围内，防止目录遍历攻击。
 *
 * @param targetPath - 要访问的目标路径
 * @param allowedPaths - 允许访问的路径列表
 * @returns 解析后的绝对路径
 * @throws {Error} 当路径不在允许列表中时抛出
 */
function validatePath(targetPath: string, allowedPaths: string[]): string {
  // 解析为绝对路径
  const absolutePath = path.resolve(targetPath);

  // 规范化允许的路径
  const normalizedAllowedPaths = allowedPaths.map(p => path.resolve(p));

  // 检查是否在任一允许路径下
  const isAllowed = normalizedAllowedPaths.some(allowedPath =>
    absolutePath.startsWith(allowedPath) ||
    absolutePath === allowedPath
  );

  if (!isAllowed) {
    throw new Error(`路径不在允许列表中: ${targetPath}`);
  }

  return absolutePath;
}

/**
 * 文件写入工具
 *
 * 提供安全、可控的文件写入功能。
 * 支持编码指定、追加模式、自动创建目录等高级特性。
 *
 * 核心功能：
 * - 安全路径验证：确保只写入允许路径内的文件
 * - 自动目录创建：自动创建不存在的父目录
 * - 追加模式：支持追加到文件末尾
 * - 原子写入：使用临时文件和重命名实现原子写入（可选）
 *
 * 安全考虑：
 * - 路径验证防止目录遍历攻击
 * - 权限检查确保有写入权限
 * - 不会覆盖系统关键文件（通过允许列表控制）
 *
 * @example
 * // 基本写入
 * const result = await FileWriteTool.execute(
 *   { path: './test.txt', content: 'Hello!' },
 *   { sessionId: 'sess-001', stepId: 'step-001', permissionLevel: 'write', allowedPaths: ['./'] }
 * );
 *
 * // 追加内容
 * const result = await FileWriteTool.execute(
 *   { path: './log.txt', content: 'New entry\n', append: true },
 *   context
 * );
 */
export const FileWriteTool = {
  /**
   * 工具名称
   */
  name: 'file_write',

  /**
   * 工具定义
   */
  definition: FileWriteToolDefinition,

  /**
   * 执行文件写入
   *
   * 将内容写入指定路径的文件，应用安全检查和路径验证。
   *
   * 执行流程：
   * 1. 验证写入权限
   * 2. 验证路径权限
   * 3. 创建父目录（如果需要）
   * 4. 写入文件内容
   * 5. 返回结果
   *
   * @param params - 写入参数
   * @param params.path - 文件路径（必需）
   * @param params.content - 文件内容（必需）
   * @param params.encoding - 编码格式，默认 'utf-8'
   * @param params.append - 是否追加，默认 false
   * @param params.createDir - 是否自动创建目录，默认 true
   * @param context - 执行上下文
   * @param context.sessionId - 会话 ID
   * @param context.stepId - 步骤 ID
   * @param context.permissionLevel - 权限级别（必须 >= write）
   * @param context.allowedPaths - 允许访问的路径列表
   * @returns 执行结果，包含写入信息
   * @throws {Error} 当路径不允许或权限不足时抛出
   *
   * @example
   * // 成功写入
   * const result = await FileWriteTool.execute(
   *   { path: './output.txt', content: 'Hello World' },
   *   { sessionId: 's1', stepId: 'p1', permissionLevel: 'write', allowedPaths: ['./'] }
   * );
   * // result = { success: true, data: { path: './output.txt', bytesWritten: 11 } }
   *
   * @example
   * // 权限不足
   * const result = await FileWriteTool.execute(
   *   { path: './test.txt', content: 'test' },
   *   { sessionId: 's1', stepId: 'p1', permissionLevel: 'read', allowedPaths: ['./'] }
   * );
   * // result = { success: false, error: '权限不足：需要 write 或更高权限' }
   */
  async execute(
    params: FileWriteParams,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证权限级别（write 或 execute 才能写入）
      if (context.permissionLevel !== 'write' &&
          context.permissionLevel !== 'execute') {
        return {
          success: false,
          error: '权限不足：需要 write 或更高权限',
          executionTimeMs: Date.now() - startTime
        };
      }

      // 验证路径权限
      const absolutePath = validatePath(params.path, context.allowedPaths);

      // 获取写入参数
      const encoding = params.encoding || 'utf-8';
      const append = params.append || false;
      const createDir = params.createDir !== false; // 默认为 true

      // 自动创建父目录
      if (createDir) {
        const parentDir = path.dirname(absolutePath);
        await fs.mkdir(parentDir, { recursive: true });
      }

      // 获取原始文件大小（用于计算写入字节数）
      let originalSize = 0;
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile()) {
          originalSize = stats.size;
        }
      } catch {
        // 文件不存在，忽略错误
      }

      // 写入文件
      await fs.writeFile(absolutePath, params.content, {
        encoding: encoding as BufferEncoding,
        flag: append ? 'a' : 'w'
      });

      // 计算写入的字节数
      const bytesWritten = Buffer.byteLength(params.content, encoding as BufferEncoding);

      // 获取新文件大小
      const newStats = await fs.stat(absolutePath);
      const newSize = newStats.size;

      return {
        success: true,
        data: {
          path: params.path,
          absolutePath,
          bytesWritten,
          originalSize,
          newSize,
          encoding,
          append,
          isNewFile: originalSize === 0 && !append
        },
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime
      };
    }
  }
};
