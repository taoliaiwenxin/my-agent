/**
 * @file planning.ts
 * @description 任务规划 Prompt 模板
 *              用于指导 LLM 生成任务执行计划
 * @module llm/prompts
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * import { buildPlanningPrompt, parseTaskPlan } from './prompts/planning';
 *
 * const prompt = buildPlanningPrompt({
 *   taskDescription: '分析代码库并生成报告',
 *   tools: availableTools,
 * });
 *
 * const plan = parseTaskPlan(llmResponse);
 *
 * @see {@link WORK_PLAN.md}
 */

import { Tool } from '../../types';
import { Message } from '../providers/LLMProvider';

/**
 * 规划 Prompt 变量
 */
export interface PlanningPromptVars {
  /** 任务描述 */
  taskDescription: string;

  /** 可用工具列表 */
  tools?: Tool[];

  /** 系统提示前缀 */
  systemPrefix?: string;

  /** 约束条件 */
  constraints?: string[];

  /** 类似任务的示例 */
  examples?: TaskPlanExample[];
}

/**
 * 任务计划示例
 */
export interface TaskPlanExample {
  /** 任务描述 */
  task: string;

  /** 计划步骤 */
  plan: string;
}

/**
 * 任务计划
 */
export interface TaskPlan {
  /** 计划步骤 */
  steps: PlanStep[];

  /** 计划摘要 */
  summary: string;

  /** 预估复杂度 */
  estimatedComplexity: 'simple' | 'medium' | 'complex';
}

/**
 * 计划步骤
 */
export interface PlanStep {
  /** 步骤 ID */
  id: string;

  /** 步骤描述 */
  description: string;

  /** 使用的工具 */
  tool?: string;

  /** 预期输出 */
  expectedOutput?: string;

  /** 依赖的步骤 ID */
  dependencies?: string[];
}

/**
 * 默认规划系统提示
 */
const DEFAULT_PLANNING_SYSTEM_PROMPT = `你是一个任务规划专家。你的职责是分析用户任务并制定详细的执行计划。

规划原则：
1. 将复杂任务分解为可管理的步骤
2. 每个步骤应该明确、具体、可执行
3. 识别步骤之间的依赖关系
4. 选择合适的工具来完成每个步骤
5. 考虑可能的错误情况和备选方案

输出格式（JSON）：
{
  "summary": "任务摘要",
  "estimatedComplexity": "simple|medium|complex",
  "steps": [
    {
      "id": "步骤ID",
      "description": "步骤描述",
      "tool": "使用的工具名称（可选）",
      "expectedOutput": "预期输出（可选）",
      "dependencies": ["依赖的步骤ID"]
    }
  ]
}

重要规则：
- 步骤ID应该是有意义的标识符（如 step1, analyze_code, write_report）
- 依赖关系使用步骤ID列表表示
- 如果没有依赖，dependencies 为空数组或省略
- 必须输出有效的 JSON 格式`;

/**
 * 构建规划系统提示
 *
 * @param vars - Prompt 变量
 * @returns 系统提示字符串
 */
export function buildPlanningSystemPrompt(vars: PlanningPromptVars): string {
  const prefix = vars.systemPrefix || DEFAULT_PLANNING_SYSTEM_PROMPT;

  let prompt = prefix;

  // 添加可用工具
  if (vars.tools && vars.tools.length > 0) {
    prompt += '\n\n=== 可用工具 ===\n';
    for (const tool of vars.tools) {
      prompt += formatToolForPlanning(tool);
    }
  }

  // 添加约束条件
  if (vars.constraints && vars.constraints.length > 0) {
    prompt += '\n\n=== 约束条件 ===\n';
    for (const constraint of vars.constraints) {
      prompt += `- ${constraint}\n`;
    }
  }

  // 添加示例
  if (vars.examples && vars.examples.length > 0) {
    prompt += '\n\n=== 示例 ===\n';
    for (const example of vars.examples) {
      prompt += `\n任务: ${example.task}\n`;
      prompt += `计划:\n${example.plan}\n`;
    }
  }

  return prompt;
}

/**
 * 格式化工具描述（用于规划）
 *
 * @param tool - 工具定义
 * @returns 格式化后的工具描述
 */
function formatToolForPlanning(tool: Tool): string {
  let description = `\n- ${tool.name}: ${tool.description}`;

  if (tool.parameters && tool.parameters.properties) {
    const params = Object.keys(tool.parameters.properties);
    if (params.length > 0) {
      description += `\n  参数: ${params.join(', ')}`;
    }
  }

  description += '\n';
  return description;
}

/**
 * 构建规划消息列表
 *
 * @param vars - Prompt 变量
 * @returns 消息列表
 */
export function buildPlanningMessages(vars: PlanningPromptVars): Message[] {
  return [
    {
      role: 'system',
      content: buildPlanningSystemPrompt(vars),
    },
    {
      role: 'user',
      content: `请为以下任务制定执行计划:\n\n${vars.taskDescription}`,
    },
  ];
}

/**
 * 解析任务计划
 *
 * @param response - LLM 响应内容
 * @returns 解析后的任务计划
 */
export function parseTaskPlan(response: string): TaskPlan {
  // 尝试提取 JSON 部分
  const jsonMatch = response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    // 如果没有找到 JSON，返回基本计划
    return {
      summary: '未能解析计划',
      estimatedComplexity: 'medium',
      steps: [
        {
          id: 'step1',
          description: response.substring(0, 200),
        },
      ],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary || '未提供摘要',
      estimatedComplexity: parsed.estimatedComplexity || 'medium',
      steps: (parsed.steps || []).map((step: any, index: number) => ({
        id: step.id || `step${index + 1}`,
        description: step.description || '未描述',
        tool: step.tool,
        expectedOutput: step.expectedOutput,
        dependencies: step.dependencies || [],
      })),
    };
  } catch {
    // JSON 解析失败，返回基本计划
    return {
      summary: 'JSON 解析失败',
      estimatedComplexity: 'medium',
      steps: [
        {
          id: 'step1',
          description: '请检查输出格式',
        },
      ],
    };
  }
}

/**
 * 验证任务计划
 *
 * @param plan - 任务计划
 * @returns 验证结果
 */
export function validateTaskPlan(plan: TaskPlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查步骤
  if (!plan.steps || plan.steps.length === 0) {
    errors.push('计划必须包含至少一个步骤');
  }

  // 检查步骤 ID 唯一性
  const ids = new Set<string>();
  for (const step of plan.steps || []) {
    if (ids.has(step.id)) {
      errors.push(`重复的步骤 ID: ${step.id}`);
    }
    ids.add(step.id);
  }

  // 检查依赖是否存在
  for (const step of plan.steps || []) {
    for (const dep of step.dependencies || []) {
      if (!ids.has(dep)) {
        errors.push(`步骤 ${step.id} 依赖不存在的步骤: ${dep}`);
      }
    }
  }

  // 检查循环依赖（简单检查）
  for (const step of plan.steps || []) {
    if (step.dependencies?.includes(step.id)) {
      errors.push(`步骤 ${step.id} 不能依赖自己`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 将任务计划格式化为文本
 *
 * @param plan - 任务计划
 * @returns 格式化文本
 */
export function formatTaskPlan(plan: TaskPlan): string {
  let text = `任务计划: ${plan.summary}\n`;
  text += `预估复杂度: ${plan.estimatedComplexity}\n\n`;
  text += '执行步骤:\n';

  for (const step of plan.steps) {
    text += `\n[${step.id}] ${step.description}`;

    if (step.tool) {
      text += `\n  工具: ${step.tool}`;
    }

    if (step.expectedOutput) {
      text += `\n  预期输出: ${step.expectedOutput}`;
    }

    if (step.dependencies && step.dependencies.length > 0) {
      text += `\n  依赖: ${step.dependencies.join(', ')}`;
    }
  }

  return text;
}

/**
 * 获取计划的下一步骤
 *
 * @param plan - 任务计划
 * @param completedSteps - 已完成的步骤 ID 列表
 * @returns 下一个可执行的步骤，如果没有则返回 undefined
 */
export function getNextStep(
  plan: TaskPlan,
  completedSteps: string[]
): PlanStep | undefined {
  const completed = new Set(completedSteps);

  for (const step of plan.steps) {
    // 跳过已完成的步骤
    if (completed.has(step.id)) {
      continue;
    }

    // 检查依赖是否都已完成
    const depsSatisfied = (step.dependencies || []).every((dep) =>
      completed.has(dep)
    );

    if (depsSatisfied) {
      return step;
    }
  }

  return undefined;
}

/**
 * 默认导出
 */
export default {
  buildPlanningSystemPrompt,
  buildPlanningMessages,
  parseTaskPlan,
  validateTaskPlan,
  formatTaskPlan,
  getNextStep,
};
