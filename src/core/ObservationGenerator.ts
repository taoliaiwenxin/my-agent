/**
 * @file ObservationGenerator.ts
 * @description 观察生成器，负责将工具执行结果转换为结构化的观察结果
 *              支持多种观察类型：成功结果、错误信息、文件内容、命令输出等
 * @module core
 * @author AI Agent
 * @date 2026-04-20
 * @version 1.0.0
 *
 * @example
 * const generator = new ObservationGenerator();
 * const observation = generator.generate({
 *   toolName: 'file_read',
 *   result: { success: true, data: '文件内容...' },
 *   executionTimeMs: 150
 * });
 */

import { Observation, ToolExecutionResult } from '../types';

/**
 * 观察生成选项
 */
export interface ObservationOptions {
  /** 工具名称 */
  toolName: string;

  /** 工具执行结果 */
  result: ToolExecutionResult;

  /** 执行耗时（毫秒） */
  executionTimeMs?: number;

  /** 最大摘要长度 */
  maxSummaryLength?: number;

  /** 原始参数 */
  parameters?: Record<string, unknown>;
}

/**
 * 观察生成器
 *
 * 将工具执行结果转换为结构化的观察结果，用于 ReAct 循环的 Observe 阶段。
 */
export class ObservationGenerator {
  /** 默认最大摘要长度 */
  private readonly defaultMaxSummaryLength: number;

  /**
   * 创建观察生成器实例
   *
   * @param defaultMaxSummaryLength - 默认最大摘要长度
   */
  constructor(defaultMaxSummaryLength: number = 500) {
    this.defaultMaxSummaryLength = defaultMaxSummaryLength;
  }

  /**
   * 生成观察结果
   *
   * @param options - 观察生成选项
   * @returns 结构化的观察结果
   */
  public generate(options: ObservationOptions): Observation {
    const { toolName, result, executionTimeMs, parameters } = options;
    const maxLength = options.maxSummaryLength ?? this.defaultMaxSummaryLength;

    const raw = this.formatRawOutput(result);
    const summary = this.generateSummary(toolName, result, parameters, maxLength);

    return {
      raw,
      summary,
      success: result.success,
      executionTimeMs,
      artifacts: this.extractArtifacts(toolName, result),
      errors: result.success ? undefined : this.extractErrors(result),
    };
  }

  /**
   * 格式化原始输出
   *
   * @param result - 工具执行结果
   * @returns 格式化的原始输出字符串
   */
  private formatRawOutput(result: ToolExecutionResult): string {
    if (result.success) {
      if (result.data === undefined || result.data === null) {
        return '执行成功（无返回值）';
      }
      if (typeof result.data === 'string') {
        return result.data;
      }
      return JSON.stringify(result.data, null, 2);
    } else {
      return result.error || '执行失败（无错误信息）';
    }
  }

  /**
   * 生成摘要
   *
   * @param toolName - 工具名称
   * @param result - 工具执行结果
   * @param parameters - 原始参数
   * @param maxLength - 最大长度
   * @returns 摘要字符串
   */
  private generateSummary(
    toolName: string,
    result: ToolExecutionResult,
    parameters?: Record<string, unknown>,
    maxLength: number = 500
  ): string {
    const toolDescription = this.getToolDescription(toolName, parameters);

    if (result.success) {
      const outcome = this.describeOutcome(toolName, result);
      const summary = `${toolDescription} ${outcome}`;
      return this.truncate(summary, maxLength);
    } else {
      const error = result.error || '未知错误';
      const summary = `${toolDescription} 失败: ${error}`;
      return this.truncate(summary, maxLength);
    }
  }

  /**
   * 获取工具描述
   *
   * @param toolName - 工具名称
   * @param parameters - 工具参数
   * @returns 工具描述字符串
   */
  private getToolDescription(
    toolName: string,
    parameters?: Record<string, unknown>
  ): string {
    switch (toolName) {
      case 'file_read': {
        const path = parameters?.path as string | undefined;
        return path ? `读取文件 "${path}"` : '读取文件';
      }
      case 'file_write': {
        const path = parameters?.path as string | undefined;
        return path ? `写入文件 "${path}"` : '写入文件';
      }
      case 'shell': {
        const command = parameters?.command as string | undefined;
        if (command) {
          const truncated = command.length > 50 ? command.slice(0, 50) + '...' : command;
          return `执行命令 "${truncated}"`;
        }
        return '执行 Shell 命令';
      }
      case 'terminate':
        return '终止任务';
      default:
        return `执行工具 "${toolName}"`;
    }
  }

  /**
   * 描述执行结果
   *
   * @param toolName - 工具名称
   * @param result - 工具执行结果
   * @returns 结果描述字符串
   */
  private describeOutcome(
    toolName: string,
    result: ToolExecutionResult
  ): string {
    if (!result.success) {
      return '失败';
    }

    const data = result.data;

    switch (toolName) {
      case 'file_read': {
        if (typeof data === 'string') {
          const lines = data.split('\n').length;
          return `成功，读取了 ${lines} 行内容`;
        }
        return '成功';
      }
      case 'file_write': {
        const path = typeof data === 'string' ? data : undefined;
        return path ? `成功写入到 "${path}"` : '成功';
      }
      case 'shell': {
        if (typeof data === 'string') {
          const lines = data.split('\n').length;
          return `成功，输出了 ${lines} 行结果`;
        }
        return '成功';
      }
      case 'terminate':
        return '任务已完成';
      default:
        return '执行成功';
    }
  }

  /**
   * 提取产物信息
   *
   * @param toolName - 工具名称
   * @param result - 工具执行结果
   * @returns 产物列表
   */
  private extractArtifacts(
    toolName: string,
    result: ToolExecutionResult
  ): string[] | undefined {
    if (!result.success) {
      return undefined;
    }

    const artifacts: string[] = [];
    const data = result.data;

    switch (toolName) {
      case 'file_read':
      case 'file_write': {
        if (typeof data === 'string') {
          artifacts.push(data);
        } else if (data && typeof data === 'object' && 'path' in data) {
          artifacts.push(String(data.path));
        }
        break;
      }
      case 'shell': {
        // Shell 命令可能生成文件，但我们需要更复杂的解析
        // 这里简化处理
        break;
      }
    }

    return artifacts.length > 0 ? artifacts : undefined;
  }

  /**
   * 提取错误信息
   *
   * @param result - 工具执行结果
   * @returns 错误列表
   */
  private extractErrors(result: ToolExecutionResult): Error[] | undefined {
    if (!result.error) {
      return undefined;
    }

    const error = new Error(result.error);
    return [error];
  }

  /**
   * 截断字符串
   *
   * @param str - 原始字符串
   * @param maxLength - 最大长度
   * @returns 截断后的字符串
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - 3) + '...';
  }

  /**
   * 批量生成观察结果
   *
   * @param optionsList - 观察生成选项列表
   * @returns 观察结果列表
   */
  public generateBatch(optionsList: ObservationOptions[]): Observation[] {
    return optionsList.map((options) => this.generate(options));
  }

  /**
   * 创建错误观察结果
   *
   * @param toolName - 工具名称
   * @param error - 错误信息
   * @param parameters - 原始参数
   * @returns 错误观察结果
   */
  public createErrorObservation(
    toolName: string,
    error: string,
    parameters?: Record<string, unknown>
  ): Observation {
    const toolDescription = this.getToolDescription(toolName, parameters);

    return {
      raw: error,
      summary: `${toolDescription} 失败: ${error}`,
      success: false,
      errors: [new Error(error)],
    };
  }
}

/**
 * 创建观察生成器（便捷函数）
 *
 * @param defaultMaxSummaryLength - 默认最大摘要长度
 * @returns ObservationGenerator 实例
 */
export function createObservationGenerator(
  defaultMaxSummaryLength?: number
): ObservationGenerator {
  return new ObservationGenerator(defaultMaxSummaryLength);
}

export default ObservationGenerator;
