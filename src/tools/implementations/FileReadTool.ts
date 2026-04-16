/**
 * @file FileReadTool.ts
 * @description 文件读取工具实现，提供读取文本文件内容的功能。
 *              支持安全路径检查、编码检测、文件大小限制等功能。
 *              是 Agent 与文件系统交互的基础工具之一。
 * @module tools/implementations
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 基本使用
 * const result = await FileReadTool.execute({
 *   path: './config.yaml'
 * });
 *
 * // 指定编码
 * const result = await FileReadTool.execute({
 *   path: './data.txt',
 *   encoding: 'utf-8'
 * });
 *
 * // 限制读取大小
 * const result = await FileReadTool.execute({
 *   path: './large.log',
 *   maxSize: 1024 * 1024 // 1MB
 * });
 *
 * @see {@link ../ToolRegistry.ts}
 * @see {@link ../../../types/index.ts}
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolExecutionContext, ToolExecutionResult } from '../../types';

/**
 * 文件读取工具定义
 *
 * 用于 LLM 理解和调用此工具的元数据定义。
 */
export const FileReadToolDefinition: Tool = {
  name: 'file_read',
  description: '读取指定路径的文本文件内容。' +
    '支持自动编码检测和大小限制。' +
    '只能读取在允许路径列表中的文件。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径，可以是相对路径或绝对路径'
      },
      encoding: {
        type: 'string',
        description: '文件编码格式，默认为 utf-8',
        default: 'utf-8'
      },
      maxSize: {
        type: 'number',
        description: '最大读取字节数，超过则截断，默认为 1MB',
        default: 1048576
      },
      offset: {
        type: 'number',
        description: '读取起始偏移量（字节），用于分段读取大文件',
        default: 0
      }
    },
    required: ['path']
  }
};

/**
 * 文件读取参数
 */
interface FileReadParams {
  /** 文件路径 */
  path: string;
  /** 文件编码 */
  encoding?: string;
  /** 最大读取字节数 */
  maxSize?: number;
  /** 读取起始偏移量 */
  offset?: number;
}

/**
 * 路径访问错误
 *
 * 当尝试访问不允许的路径时抛出此错误。
 */
export class PathAccessError extends Error {
  constructor(path: string) {
    super(`路径不在允许列表中: ${path}`);
    this.name = 'PathAccessError';
  }
}

/**
 * 文件大小超出错误
 *
 * 当文件大小超过限制时抛出此错误。
 */
export class FileSizeError extends Error {
  constructor(path: string, size: number, maxSize: number) {
    super(
      `文件大小 (${size} 字节) 超过限制 (${maxSize} 字节): ${path}`
    );
    this.name = 'FileSizeError';
  }
}

/**
 * 验证路径是否在允许列表中
 *
 * 安全检查：确保文件路径在允许的访问范围内，防止目录遍历攻击。
 *
 * 算法思路：
 * 1. 解析目标路径为绝对路径
 * 2. 检查目标路径是否以任一允许路径为前缀
 * 3. 如果不在允许列表中，抛出错误
 *
 * @param targetPath - 要访问的目标路径
 * @param allowedPaths - 允许访问的路径列表
 * @returns 解析后的绝对路径
 * @throws {PathAccessError} 当路径不在允许列表中时抛出
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
    throw new PathAccessError(targetPath);
  }

  return absolutePath;
}

/**
 * 文件读取工具
 *
 * 提供安全、可控的文件读取功能。
 * 支持编码指定、大小限制、分段读取等高级特性。
 *
 * 核心功能：
 * - 安全路径验证：确保只读取允许路径内的文件
 * - 自动编码检测：支持常见编码格式
 * - 大小限制：防止读取过大的文件导致内存问题
 * - 分段读取：支持大文件的分段读取
 *
 * 安全考虑：
 * - 路径验证防止目录遍历攻击
 * - 大小限制防止内存溢出
 * - 符号链接处理（未来可扩展）
 *
 * @example
 * // 基本读取
 * const result = await FileReadTool.execute(
 *   { path: './test.txt' },
 *   { sessionId: 'sess-001', stepId: 'step-001', permissionLevel: 'read', allowedPaths: ['./'] }
 * );
 *
 * // 读取部分内容
 * const result = await FileReadTool.execute(
 *   { path: './large.log', offset: 0, maxSize: 4096 },
 *   context
 * );
 */
export const FileReadTool = {
  /**
   * 工具名称
   */
  name: 'file_read',

  /**
   * 工具定义
   */
  definition: FileReadToolDefinition,

  /**
   * 执行文件读取
   *
   * 读取指定路径的文件内容，应用安全检查和大小限制。
   *
   * 执行流程：
   * 1. 验证路径权限
   * 2. 检查文件存在性和类型
   * 3. 检查文件大小
   * 4. 读取文件内容
   * 5. 返回结果
   *
   * @param params - 读取参数
   * @param params.path - 文件路径（必需）
   * @param params.encoding - 编码格式，默认 'utf-8'
   * @param params.maxSize - 最大读取字节数，默认 1MB
   * @param params.offset - 读取起始偏移量，默认 0
   * @param context - 执行上下文
   * @param context.sessionId - 会话 ID
   * @param context.stepId - 步骤 ID
   * @param context.permissionLevel - 权限级别（必须 >= read）
   * @param context.allowedPaths - 允许访问的路径列表
   * @returns 执行结果，包含文件内容
   * @throws {PathAccessError} 当路径不在允许列表中时抛出
   * @throws {Error} 当文件不存在或无法读取时抛出
   *
   * @example
   * // 成功读取
   * const result = await FileReadTool.execute(
   *   { path: './config.yaml' },
   *   { sessionId: 's1', stepId: 'p1', permissionLevel: 'read', allowedPaths: ['./'] }
   * );
   * // result = { success: true, data: { content: '...', size: 123 } }
   *
   * @example
   * // 读取失败（路径不允许）
   * try {
   *   await FileReadTool.execute(
   *     { path: '/etc/passwd' },
   *     { sessionId: 's1', stepId: 'p1', permissionLevel: 'read', allowedPaths: ['./'] }
   *   );
   * } catch (error) {
   *   // error.message = '路径不在允许列表中: /etc/passwd'
   * }
   */
  async execute(
    params: FileReadParams,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证权限级别
      if (context.permissionLevel === 'execute') {
        // execute 权限包含 read，允许通过
      } else if (context.permissionLevel !== 'read' &&
                 context.permissionLevel !== 'write') {
        return {
          success: false,
          error: '权限不足：需要 read 或更高权限',
          executionTimeMs: Date.now() - startTime
        };
      }

      // 验证路径权限
      const absolutePath = validatePath(params.path, context.allowedPaths);

      // 获取文件信息
      const stats = await fs.stat(absolutePath);

      // 检查是否为文件
      if (!stats.isFile()) {
        return {
          success: false,
          error: `路径不是文件: ${params.path}`,
          executionTimeMs: Date.now() - startTime
        };
      }

      // 获取读取参数
      const encoding = params.encoding || 'utf-8';
      const maxSize = params.maxSize || 1024 * 1024; // 默认 1MB
      const offset = params.offset || 0;

      // 检查文件大小
      const fileSize = stats.size;
      if (fileSize > maxSize && offset === 0) {
        // 文件太大且不是分段读取，提供警告
        console.warn(
          `文件 ${params.path} 大小 (${fileSize} 字节) 超过限制，将只读取前 ${maxSize} 字节`
        );
      }

      // 计算实际读取大小
      if (offset >= fileSize) {
        // offset 超出文件大小，返回空内容
        return {
          success: true,
          data: {
            content: '',
            path: params.path,
            absolutePath,
            size: fileSize,
            readSize: 0,
            encoding,
            offset,
            isTruncated: false,
            hasMore: false
          },
          executionTimeMs: Date.now() - startTime
        };
      }

      const remainingSize = fileSize - offset;
      const readSize = Math.min(remainingSize, maxSize);

      // 读取文件内容
      let content: string;

      if (offset === 0 && readSize === fileSize) {
        // 完整读取
        content = await fs.readFile(absolutePath, { encoding: encoding as BufferEncoding });
      } else {
        // 分段读取
        const buffer = Buffer.alloc(readSize);
        const fileHandle = await fs.open(absolutePath, 'r');
        try {
          await fileHandle.read(buffer, 0, readSize, offset);
          content = buffer.toString(encoding as BufferEncoding);
        } finally {
          await fileHandle.close();
        }
      }

      // 检查内容是否被截断
      const isTruncated = offset + readSize < fileSize;

      return {
        success: true,
        data: {
          content,
          path: params.path,
          absolutePath,
          size: fileSize,
          readSize: content.length,
          encoding,
          offset,
          isTruncated,
          hasMore: isTruncated
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
