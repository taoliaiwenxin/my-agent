/**
 * @file ShellTool.ts
 * @description Shell 命令执行工具实现，提供安全的命令执行功能。
 *              支持超时控制、工作目录设置、环境变量注入等功能。
 *              是 Agent 与系统交互的基础工具之一。
 * @module tools/implementations
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 基本使用
 * const result = await ShellTool.execute({
 *   command: 'ls -la'
 * });
 *
 * // 指定工作目录
 * const result = await ShellTool.execute({
 *   command: 'npm test',
 *   cwd: './project'
 * });
 *
 * // 设置超时
 * const result = await ShellTool.execute({
 *   command: 'sleep 10',
 *   timeout: 5000
 * });
 *
 * @see {@link ../ToolRegistry.ts}
 * @see {@link ../../../types/index.ts}
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { Tool, ToolExecutionContext, ToolExecutionResult } from '../../types';

/**
 * Shell 命令执行工具定义
 *
 * 用于 LLM 理解和调用此工具的元数据定义。
 */
export const ShellToolDefinition: Tool = {
  name: 'shell',
  description: '执行 Shell 命令并返回输出。' +
    '支持超时控制、工作目录设置和环境变量。' +
    '只能在允许的路径下执行，危险命令会被阻止。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令'
      },
      cwd: {
        type: 'string',
        description: '工作目录，默认为当前目录',
        default: '.'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 60000（1分钟）',
        default: 60000
      },
      env: {
        type: 'object',
        description: '额外的环境变量（会合并到当前环境）',
        default: {}
      }
    },
    required: ['command']
  }
};

/**
 * Shell 执行参数
 */
interface ShellParams {
  /** 要执行的命令 */
  command: string;
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * 危险的命令模式列表
 *
 * 这些模式会被检测并阻止执行，以防止安全风险。
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // 删除系统文件或目录
  /rm\s+(-rf?|--recursive)\s+\//i,
  /rm\s+.*\/(bin|sbin|usr|etc|lib|sys|dev|proc)\b/i,
  // 格式化磁盘
  /mkfs\.\w+/i,
  /dd\s+if=.*\s+of=\/(dev|disk)/i,
  // 修改系统配置
  /chmod\s+(-R)?\s+.*\/(etc|bin|sbin|usr)/i,
  /chown\s+(-R)?\s+.*\/(etc|bin|sbin|usr)/i,
  // 网络攻击相关
  /:\(\)\s*\{\s*:\|\:&\s*\};/i, // Fork bomb
  // Windows 危险命令
  /del\s+\//i,
  /format\s+/i,
  /rd\s+\/s\s+/i
];

/**
 * 验证工作目录是否在允许列表中
 *
 * 安全检查：确保命令在允许的目录范围内执行。
 *
 * @param cwd - 工作目录
 * @param allowedPaths - 允许访问的路径列表
 * @returns 解析后的绝对路径
 * @throws {Error} 当路径不在允许列表中时抛出
 */
function validateWorkingDirectory(cwd: string, allowedPaths: string[]): string {
  // 解析为绝对路径
  const absoluteCwd = path.resolve(cwd);

  // 如果允许路径包含当前工作目录，则允许
  const isAllowed = allowedPaths.some(allowedPath => {
    const resolvedAllowed = path.resolve(allowedPath);
    // 检查 cwd 是否在 allowedPath 下，或两者相同
    return absoluteCwd === resolvedAllowed ||
           absoluteCwd.startsWith(resolvedAllowed + path.sep);
  });

  if (!isAllowed) {
    throw new Error(`工作目录不在允许列表中: ${cwd}`);
  }

  return absoluteCwd;
}

/**
 * 检查命令是否包含危险模式
 *
 * 安全检查：检测并阻止可能有害的命令。
 *
 * @param command - 要检查的命令
 * @returns 检查结果，包含是否安全和原因
 */
function checkCommandSafety(command: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: `命令包含危险模式: ${pattern.source}`
      };
    }
  }

  return { safe: true };
}

/**
 * 执行 shell 命令
 *
 * 使用 spawn 执行命令，支持超时和流式输出捕获。
 *
 * @param command - 要执行的命令
 * @param cwd - 工作目录
 * @param timeout - 超时时间（毫秒）
 * @param env - 环境变量
 * @returns 命令执行结果
 */
function executeCommand(
  command: string,
  cwd: string,
  timeout: number,
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // 检测操作系统并选择适当的 shell
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    // 启动子进程
    const child = spawn(shell, [shellFlag, command], {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true // Windows 下隐藏窗口
    });

    // 捕获 stdout
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });

    // 捕获 stderr
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    // 设置超时
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      // 如果 SIGTERM 不起作用，使用 SIGKILL
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // 进程结束
    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        timedOut
      });
    });

    // 进程错误
    child.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr: error.message,
        exitCode: -1,
        timedOut: false
      });
    });
  });
}

/**
 * Shell 命令执行工具
 *
 * 提供安全、可控的命令执行功能。
 * 支持超时控制、工作目录设置、环境变量注入等高级特性。
 *
 * 核心功能：
 * - 安全路径验证：确保在允许路径下执行
 * - 危险命令检测：阻止潜在有害命令
 * - 超时控制：防止命令无限执行
 * - 环境变量注入：支持自定义环境
 *
 * 安全考虑：
 * - 路径验证防止目录遍历
 * - 危险命令模式检测
 * - 超时防止资源耗尽
 * - 权限检查确保有执行权限
 *
 * @example
 * // 基本执行
 * const result = await ShellTool.execute(
 *   { command: 'ls -la' },
 *   { sessionId: 's1', stepId: 'p1', permissionLevel: 'execute', allowedPaths: ['./'] }
 * );
 *
 * // 带超时
 * const result = await ShellTool.execute(
 *   { command: 'sleep 10', timeout: 5000 },
 *   context
 * );
 */
export const ShellTool = {
  /**
   * 工具名称
   */
  name: 'shell',

  /**
   * 工具定义
   */
  definition: ShellToolDefinition,

  /**
   * 执行 Shell 命令
   *
   * 执行指定的 shell 命令，应用安全检查和超时控制。
   *
   * 执行流程：
   * 1. 验证执行权限
   * 2. 检查命令安全性
   * 3. 验证工作目录
   * 4. 执行命令
   * 5. 返回结果
   *
   * @param params - 执行参数
   * @param params.command - 要执行的命令（必需）
   * @param params.cwd - 工作目录，默认当前目录
   * @param params.timeout - 超时时间（毫秒），默认 60000
   * @param params.env - 环境变量
   * @param context - 执行上下文
   * @param context.sessionId - 会话 ID
   * @param context.stepId - 步骤 ID
   * @param context.permissionLevel - 权限级别（必须是 execute）
   * @param context.allowedPaths - 允许访问的路径列表
   * @returns 执行结果，包含输出和退出码
   * @throws {Error} 当权限不足或命令不安全时抛出
   *
   * @example
   * // 成功执行
   * const result = await ShellTool.execute(
   *   { command: 'echo "Hello"' },
   *   { sessionId: 's1', stepId: 'p1', permissionLevel: 'execute', allowedPaths: ['./'] }
   * );
   * // result = { success: true, data: { stdout: 'Hello\n', exitCode: 0 } }
   *
   * @example
   * // 命令失败
   * const result = await ShellTool.execute(
   *   { command: 'exit 1' },
   *   context
   * );
   * // result = { success: false, error: '命令退出码: 1', data: { exitCode: 1 } }
   */
  async execute(
    params: ShellParams,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证权限级别（必须是 execute）
      if (context.permissionLevel !== 'execute') {
        return {
          success: false,
          error: '权限不足：需要 execute 权限',
          executionTimeMs: Date.now() - startTime
        };
      }

      // 检查命令安全性
      const safetyCheck = checkCommandSafety(params.command);
      if (!safetyCheck.safe) {
        return {
          success: false,
          error: `命令被拒绝: ${safetyCheck.reason}`,
          executionTimeMs: Date.now() - startTime
        };
      }

      // 验证工作目录
      const cwd = params.cwd || '.';
      const absoluteCwd = validateWorkingDirectory(cwd, context.allowedPaths);

      // 获取超时设置
      const timeout = params.timeout || 60000;

      // 执行命令
      const { stdout, stderr, exitCode, timedOut } = await executeCommand(
        params.command,
        absoluteCwd,
        timeout,
        params.env || {}
      );

      // 构建结果
      const result: ToolExecutionResult = {
        success: exitCode === 0 && !timedOut,
        data: {
          command: params.command,
          cwd: absoluteCwd,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          timedOut
        },
        executionTimeMs: Date.now() - startTime
      };

      // 如果超时或失败，添加错误信息
      if (timedOut) {
        result.success = false;
        result.error = `命令执行超时（超过 ${timeout}ms）`;
      } else if (exitCode !== 0) {
        result.success = false;
        result.error = `命令退出码: ${exitCode}`;
      }

      return result;

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
