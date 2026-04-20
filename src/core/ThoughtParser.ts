/**
 * @file ThoughtParser.ts
 * @description 思考解析器，负责解析 LLM 的响应，提取思考过程、动作和参数
 *              支持多种格式：ReAct 格式、JSON 格式、工具调用格式
 * @module core
 * @author AI Agent
 * @date 2026-04-20
 * @version 1.0.0
 *
 * @example
 * const parser = new ThoughtParser();
 * const parsed = parser.parse(`
 *   THOUGHT: 我需要读取配置文件
 *   ACTION: file_read
 *   PARAMETERS: {"path": "./config.yaml"}
 * `);
 * console.log(parsed.thought); // "我需要读取配置文件"
 * console.log(parsed.action);  // "file_read"
 */

import { AgentAction, ToolCall } from '../types';

/**
 * 解析结果
 */
export interface ParsedThought {
  /** 思考内容 */
  thought: string;

  /** 动作名称 */
  action: string;

  /** 动作参数 */
  parameters: Record<string, unknown>;

  /** 是否完成任务 */
  isComplete: boolean;

  /** 最终结果（如果完成任务） */
  result?: string;

  /** 预期结果描述 */
  expectedOutcome?: string;
}

/**
 * 解析选项
 */
export interface ParseOptions {
  /** 是否允许空思考 */
  allowEmptyThought?: boolean;

  /** 是否严格模式（要求必须包含所有字段） */
  strictMode?: boolean;
}

/**
 * 思考解析器
 *
 * 解析 LLM 响应，提取结构化的思考、动作和参数信息。
 * 支持多种格式：ReAct 格式、JSON 格式、工具调用格式。
 */
export class ThoughtParser {
  /**
   * 解析 LLM 响应
   *
   * @param response - LLM 原始响应
   * @param options - 解析选项
   * @returns 解析结果
   */
  public parse(response: string, options: ParseOptions = {}): ParsedThought {
    const { allowEmptyThought = false, strictMode = false } = options;

    // 尝试解析为 ReAct 格式
    const reactResult = this.parseReActFormat(response);
    if (reactResult && (reactResult.thought || allowEmptyThought)) {
      return reactResult;
    }

    // 尝试解析为 JSON 格式
    const jsonResult = this.parseJsonFormat(response);
    if (jsonResult && (jsonResult.thought || allowEmptyThought)) {
      return jsonResult;
    }

    // 尝试解析为工具调用格式
    const toolCallResult = this.parseToolCallFormat(response);
    if (toolCallResult) {
      return toolCallResult;
    }

    // 严格模式下，如果无法解析，抛出错误
    if (strictMode) {
      throw new ThoughtParseError(
        `无法解析响应: 响应不包含有效的思考或动作\n响应内容: ${response.slice(0, 200)}`
      );
    }

    // 宽松模式：返回原始内容作为思考
    return {
      thought: response.trim(),
      action: '',
      parameters: {},
      isComplete: false,
    };
  }

  /**
   * 解析 ReAct 格式
   *
   * 格式示例：
   * THOUGHT: 我需要读取文件
   * ACTION: file_read
   * PARAMETERS: {"path": "./test.txt"}
   * EXPECTED: 获取文件内容
   *
   * @param response - LLM 响应
   * @returns 解析结果或 null
   */
  private parseReActFormat(response: string): ParsedThought | null {
    const lines = response.trim().split('\n');

    let thought = '';
    let action = '';
    let parameters: Record<string, unknown> = {};
    let expectedOutcome = '';
    let result: string | undefined;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行
      if (!trimmedLine) continue;

      // 解析 THOUGHT
      if (trimmedLine.startsWith('THOUGHT:')) {
        thought = trimmedLine.substring('THOUGHT:'.length).trim();
        continue;
      }

      // 解析 ACTION
      if (trimmedLine.startsWith('ACTION:')) {
        action = trimmedLine.substring('ACTION:'.length).trim();
        continue;
      }

      // 解析 PARAMETERS
      if (trimmedLine.startsWith('PARAMETERS:')) {
        const paramStr = trimmedLine.substring('PARAMETERS:'.length).trim();
        try {
          parameters = JSON.parse(paramStr);
        } catch {
          // 如果 JSON 解析失败，尝试作为原始字符串处理
          parameters = { raw: paramStr };
        }
        continue;
      }

      // 解析 EXPECTED
      if (trimmedLine.startsWith('EXPECTED:')) {
        expectedOutcome = trimmedLine.substring('EXPECTED:'.length).trim();
        continue;
      }

      // 解析 RESULT
      if (trimmedLine.startsWith('RESULT:')) {
        result = trimmedLine.substring('RESULT:'.length).trim();
        continue;
      }

      // 处理多行 THOUGHT
      if (!trimmedLine.includes(':') && thought && !action) {
        thought += ' ' + trimmedLine;
      }
    }

    // 如果没有解析出 action，返回 null
    if (!action && !thought) {
      return null;
    }

    return {
      thought,
      action,
      parameters,
      expectedOutcome,
      result,
      isComplete: action === 'terminate',
    };
  }

  /**
   * 解析 JSON 格式
   *
   * 格式示例：
   * {
   *   "thought": "我需要读取文件",
   *   "action": "file_read",
   *   "parameters": {"path": "./test.txt"}
   * }
   *
   * @param response - LLM 响应
   * @returns 解析结果或 null
   */
  private parseJsonFormat(response: string): ParsedThought | null {
    // 尝试提取 JSON 部分
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      const thought = parsed.thought || parsed.reasoning || '';
      const action = parsed.action || parsed.tool || '';
      const parameters = parsed.parameters || parsed.params || parsed.arguments || {};
      const expectedOutcome = parsed.expected || parsed.expectedOutcome || '';

      // 如果既没有 thought 也没有 action，返回 null
      if (!thought && !action) {
        return null;
      }

      return {
        thought,
        action,
        parameters,
        expectedOutcome,
        isComplete: action === 'terminate',
      };
    } catch {
      return null;
    }
  }

  /**
   * 解析工具调用格式
   *
   * 用于处理 LLM 返回的工具调用结构
   *
   * @param response - LLM 响应（可能是对象或字符串）
   * @returns 解析结果或 null
   */
  private parseToolCallFormat(response: string): ParsedThought | null {
    // 检查是否包含 tool_calls 标记
    if (!response.includes('tool_calls') && !response.includes('toolCalls')) {
      return null;
    }

    try {
      const parsed = JSON.parse(response);

      // 处理 Anthropic/OpenAI 格式的工具调用
      const toolCalls = parsed.tool_calls || parsed.toolCalls || [];

      if (toolCalls.length > 0) {
        const toolCall = toolCalls[0] as ToolCall;
        const thought = parsed.content || parsed.thought || '';

        return {
          thought,
          action: toolCall.name,
          parameters: toolCall.arguments,
          isComplete: toolCall.name === 'terminate',
        };
      }
    } catch {
      // 不是有效的 JSON，忽略
    }

    return null;
  }

  /**
   * 将解析结果转换为 AgentAction
   *
   * @param parsed - 解析结果
   * @returns AgentAction 对象
   */
  public toAgentAction(parsed: ParsedThought): AgentAction {
    return {
      thought: parsed.thought,
      toolName: parsed.action,
      parameters: parsed.parameters,
      expectedOutcome: parsed.expectedOutcome || '',
    };
  }

  /**
   * 检查是否为终止动作
   *
   * @param parsed - 解析结果
   * @returns 是否终止
   */
  public isTerminateAction(parsed: ParsedThought): boolean {
    return parsed.isComplete || parsed.action === 'terminate';
  }

  /**
   * 提取思考过程（用于反思）
   *
   * @param parsed - 解析结果
   * @returns 思考内容
   */
  public extractReasoning(parsed: ParsedThought): string {
    return parsed.thought;
  }
}

/**
 * 解析错误
 */
export class ThoughtParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThoughtParseError';
  }
}

/**
 * 创建思考解析器（便捷函数）
 *
 * @returns ThoughtParser 实例
 */
export function createThoughtParser(): ThoughtParser {
  return new ThoughtParser();
}

export default ThoughtParser;
