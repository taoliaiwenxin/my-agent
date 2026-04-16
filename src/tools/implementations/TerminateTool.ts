/**
 * @file TerminateTool.ts
 * @description 任务终止工具实现，用于结束 Agent 的执行会话。
 *              支持成功和失败两种终止状态，可以附带结果消息。
 *              是 Agent 正常结束任务的唯一方式。
 * @module tools/implementations
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 *
 * @example
 * // 成功终止
 * const result = await TerminateTool.execute({
 *   status: 'success',
 *   message: '任务已完成，所有文件已生成。'
 * });
 *
 * // 失败终止
 * const result = await TerminateTool.execute({
 *   status: 'failed',
 *   message: '无法访问必要的资源，任务终止。'
 * });
 *
 * @see {@link ../ToolRegistry.ts}
 * @see {@link ../../../types/index.ts}
 */

import { Tool, ToolExecutionContext, ToolExecutionResult } from '../../types';

/**
 * 任务终止工具定义
 *
 * 用于 LLM 理解和调用此工具的元数据定义。
 */
export const TerminateToolDefinition: Tool = {
  name: 'terminate',
  description: '终止当前任务执行，并返回最终结果。' +
    '当任务完成、失败或需要用户介入时调用此工具。' +
    '调用后 Agent 将停止执行并返回结果给调用者。',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '终止状态：success（成功完成）或 failed（执行失败）',
        enum: ['success', 'failed']
      },
      message: {
        type: 'string',
        description: '终止消息，描述任务结果、完成情况或失败原因'
      },
      answer: {
        type: 'string',
        description: '任务最终答案或输出内容（当 status 为 success 时）'
      }
    },
    required: ['status', 'message']
  }
};

/**
 * 终止参数
 */
interface TerminateParams {
  /** 终止状态 */
  status: 'success' | 'failed';
  /** 终止消息 */
  message: string;
  /** 最终答案（可选） */
  answer?: string;
}

/**
 * 任务终止工具
 *
 * 用于结束 Agent 执行会话并返回结果。
 * 这是 Agent 正常退出 ReAct 循环的唯一方式。
 *
 * 核心概念：
 * - success: 任务成功完成，返回预期结果
 * - failed: 任务执行失败，返回失败原因
 *
 * 使用场景：
 * - 任务完成：所有目标已达成
 * - 任务失败：遇到无法恢复的错误
 * - 需要用户介入：需要用户提供额外信息
 *
 * 注意：此工具只是返回终止信号，实际的任务状态管理由调用者处理。
 *
 * @example
 * // 成功完成
 * const result = await TerminateTool.execute(
 *   { status: 'success', message: '代码审查完成', answer: '审查报告...' },
 *   context
 * );
 * // result.success = true
 * // result.data.terminated = true
 *
 * @example
 * // 任务失败
 * const result = await TerminateTool.execute(
 *   { status: 'failed', message: 'API 密钥无效' },
 *   context
 * );
 * // result.success = false
 * // result.data.terminated = true
 */
export const TerminateTool = {
  /**
   * 工具名称
   */
  name: 'terminate',

  /**
   * 工具定义
   */
  definition: TerminateToolDefinition,

  /**
   * 执行任务终止
   *
   * 验证参数并返回终止信号。
   * 此操作总是"成功"执行（工具层面），但会根据 status 设置整体成功状态。
   *
   * 执行流程：
   * 1. 验证参数有效性
   * 2. 构建终止结果
   * 3. 返回结果（包含终止信号）
   *
   * @param params - 终止参数
   * @param params.status - 终止状态（success 或 failed）
   * @param params.message - 终止消息
   * @param params.answer - 最终答案（可选）
   * @param context - 执行上下文
   * @returns 执行结果，包含终止信号和结果信息
   *
   * @example
   * // 成功终止
   * const result = await TerminateTool.execute({
   *   status: 'success',
   *   message: '代码分析完成',
   *   answer: '发现了 3 个潜在问题...'
   * }, context);
   * // result = {
   * //   success: true,
   * //   data: {
   * //     terminated: true,
   * //     status: 'success',
   * //     message: '代码分析完成',
   * //     answer: '发现了 3 个潜在问题...'
   * //   }
   * // }
   */
  async execute(
    params: TerminateParams,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证 status 参数
      if (params.status !== 'success' && params.status !== 'failed') {
        return {
          success: false,
          error: '无效的终止状态，必须是 "success" 或 "failed"',
          executionTimeMs: Date.now() - startTime
        };
      }

      // 验证 message 参数
      if (!params.message || typeof params.message !== 'string') {
        return {
          success: false,
          error: '终止消息不能为空',
          executionTimeMs: Date.now() - startTime
        };
      }

      // 构建终止结果
      // success 字段表示工具执行是否成功（工具层面总是成功）
      // 实际的任务状态由 status 字段表示
      return {
        success: params.status === 'success',
        data: {
          terminated: true,
          status: params.status,
          message: params.message,
          answer: params.answer,
          sessionId: context.sessionId,
          stepId: context.stepId
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
