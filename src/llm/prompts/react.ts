/**
 * @file react.ts
 * @description ReAct (Reasoning + Acting) Prompt 模板
 *              用于指导 LLM 进行推理和行动循环
 * @module llm/prompts
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * import { buildReActPrompt, ReActPromptVars } from './prompts/react';
 *
 * const prompt = buildReActPrompt({
 *   taskDescription: '读取配置文件并分析',
 *   tools: [fileReadTool, shellTool],
 *   workingMemory: [...],
 * });
 *
 * @see {@link https://arxiv.org/abs/2210.03629} - ReAct Paper
 */

import { Tool } from '../../types';
import { Message } from '../providers/LLMProvider';

/**
 * ReAct Prompt 变量
 */
export interface ReActPromptVars {
  /** 任务描述 */
  taskDescription: string;

  /** 可用工具列表 */
  tools: Tool[];

  /** 工作记忆（对话历史） */
  workingMemory?: Message[];

  /** 系统提示前缀 */
  systemPrefix?: string;

  /** 最大步骤数 */
  maxSteps?: number;

  /** 额外上下文 */
  context?: string;
}

/**
 * 默认 ReAct 系统提示
 */
const DEFAULT_REACT_SYSTEM_PROMPT = `你是一个智能助手，可以使用工具来完成任务。

你的思考过程应该遵循以下模式：
1. THOUGHT: 分析问题，思考解决方案
2. ACTION: 选择并使用合适的工具
3. OBSERVATION: 观察工具返回的结果
4. REFLECTION: 反思结果，决定下一步行动

重要规则：
- 每次只执行一个动作
- 使用工具时，必须提供所有必需参数
- 如果任务完成，使用 terminate 工具结束
- 如果遇到困难，请明确说明问题

输出格式：
THOUGHT: [你的思考过程]
ACTION: [工具名称]
PARAMETERS: [JSON格式的参数]

或者当任务完成时：
THOUGHT: [总结]
ACTION: terminate
RESULT: [最终结果]`;

/**
 * 构建 ReAct 系统提示
 *
 * @param vars - Prompt 变量
 * @returns 系统提示字符串
 */
export function buildReActSystemPrompt(vars: ReActPromptVars): string {
  const prefix = vars.systemPrefix || DEFAULT_REACT_SYSTEM_PROMPT;
  const maxSteps = vars.maxSteps || 20;

  let prompt = prefix;

  // 添加任务描述
  prompt += `\n\n=== 当前任务 ===\n${vars.taskDescription}`;

  // 添加最大步骤限制
  prompt += `\n\n=== 限制 ===\n- 最大步骤数: ${maxSteps}`;

  // 添加工具描述
  if (vars.tools.length > 0) {
    prompt += '\n\n=== 可用工具 ===\n';
    for (const tool of vars.tools) {
      prompt += formatToolDescription(tool);
    }
  }

  // 添加上下文
  if (vars.context) {
    prompt += `\n\n=== 额外上下文 ===\n${vars.context}`;
  }

  return prompt;
}

/**
 * 格式化工具描述
 *
 * @param tool - 工具定义
 * @returns 格式化后的工具描述
 */
function formatToolDescription(tool: Tool): string {
  let description = `\n工具: ${tool.name}\n`;
  description += `描述: ${tool.description}\n`;

  if (tool.parameters && tool.parameters.properties) {
    description += '参数:\n';
    for (const [key, value] of Object.entries(tool.parameters.properties)) {
      const param = value as { type: string; description: string };
      const required = tool.parameters.required?.includes(key) ? ' (必需)' : '';
      description += `  - ${key}: ${param.type}${required} - ${param.description}\n`;
    }
  }

  return description;
}

/**
 * 构建 ReAct 消息列表
 *
 * @param vars - Prompt 变量
 * @returns 消息列表
 */
export function buildReActMessages(vars: ReActPromptVars): Message[] {
  const messages: Message[] = [];

  // 添加系统提示
  messages.push({
    role: 'system',
    content: buildReActSystemPrompt(vars),
  });

  // 添加工作记忆
  if (vars.workingMemory && vars.workingMemory.length > 0) {
    messages.push(...vars.workingMemory);
  }

  return messages;
}

/**
 * ReAct 响应解析结果
 */
export interface ParsedReActResponse {
  /** 思考内容 */
  thought: string;

  /** 动作类型 */
  action: string;

  /** 动作参数 */
  parameters?: Record<string, unknown>;

  /** 结果（如果是 terminate） */
  result?: string;

  /** 是否完成任务 */
  isComplete: boolean;
}

/**
 * 解析 ReAct 响应
 *
 * @param response - LLM 响应内容
 * @returns 解析结果
 */
export function parseReActResponse(response: string): ParsedReActResponse {
  const lines = response.trim().split('\n');

  let thought = '';
  let action = '';
  let parameters: Record<string, unknown> | undefined;
  let result: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('THOUGHT:')) {
      thought = trimmedLine.substring('THOUGHT:'.length).trim();
    } else if (trimmedLine.startsWith('ACTION:')) {
      action = trimmedLine.substring('ACTION:'.length).trim();
    } else if (trimmedLine.startsWith('PARAMETERS:')) {
      const paramStr = trimmedLine.substring('PARAMETERS:'.length).trim();
      try {
        parameters = JSON.parse(paramStr);
      } catch {
        // 如果解析失败，作为字符串处理
        parameters = { raw: paramStr };
      }
    } else if (trimmedLine.startsWith('RESULT:')) {
      result = trimmedLine.substring('RESULT:'.length).trim();
    }
  }

  return {
    thought,
    action,
    parameters,
    result,
    isComplete: action === 'terminate',
  };
}

/**
 * 创建观察消息
 *
 * @param observation - 观察结果
 * @returns 观察消息
 */
export function createObservationMessage(observation: string): Message {
  return {
    role: 'user',
    content: `OBSERVATION: ${observation}`,
  };
}

/**
 * 创建工具结果消息
 *
 * @param toolName - 工具名称
 * @param result - 工具执行结果
 * @param success - 是否成功
 * @returns 工具结果消息
 */
export function createToolResultMessage(
  toolName: string,
  result: string,
  success: boolean
): Message {
  const status = success ? '成功' : '失败';
  return {
    role: 'user',
    content: `工具 "${toolName}" 执行${status}:\n${result}`,
  };
}

/**
 * 创建反思消息
 *
 * @param reflection - 反思内容
 * @returns 反思消息
 */
export function createReflectionMessage(reflection: string): Message {
  return {
    role: 'assistant',
    content: `REFLECTION: ${reflection}`,
  };
}

/**
 * 默认导出
 */
export default {
  buildReActSystemPrompt,
  buildReActMessages,
  parseReActResponse,
  createObservationMessage,
  createToolResultMessage,
  createReflectionMessage,
};
