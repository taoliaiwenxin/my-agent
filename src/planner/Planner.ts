/**
 * @file Planner.ts
 * @description 任务规划器，使用 LLM 将复杂任务分解为可执行的步骤
 *              支持动态规划和计划调整
 * @module planner
 * @author AI Agent
 * @date 2026-04-20
 * @version 1.0.0
 *
 * @example
 * const planner = new Planner({
 *   llmClient,
 *   maxSteps: 10,
 * });
 *
 * const plan = await planner.createPlan('分析代码库并生成报告');
 * const graph = planner.buildTaskGraph(plan);
 */

import { LLMClient } from '../llm/LLMClient';
import { TaskGraph } from './TaskGraph';
import { TaskPlan, PlanStep } from '../types';

/**
 * 规划器配置
 */
export interface PlannerConfig {
  /** LLM 客户端 */
  llmClient: LLMClient;

  /** 最大步骤数 */
  maxSteps?: number;

  /** 是否允许并行步骤 */
  allowParallel?: boolean;

  /** 规划提示模板 */
  planningPrompt?: string;
}

/**
 * 规划选项
 */
export interface PlanOptions {
  /** 上下文信息 */
  context?: string;

  /** 可用工具列表 */
  availableTools?: string[];

  /** 约束条件 */
  constraints?: string[];

  /** 期望输出格式 */
  expectedOutput?: string;

  /** 是否启用动态规划 */
  dynamic?: boolean;
}

/**
 * 规划结果
 */
export interface PlanningResult {
  /** 是否成功 */
  success: boolean;

  /** 任务计划 */
  plan?: TaskPlan;

  /** 错误信息 */
  error?: string;

  /** Token 使用量 */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * 计划调整结果
 */
export interface PlanAdjustmentResult {
  /** 是否成功调整 */
  success: boolean;

  /** 调整后的计划 */
  plan?: TaskPlan;

  /** 调整说明 */
  adjustmentReason?: string;

  /** 错误信息 */
  error?: string;
}

/**
 * 默认规划提示模板
 */
const DEFAULT_PLANNING_PROMPT = `你是一个任务规划专家。请将用户的任务分解为清晰的执行步骤。

规则：
1. 每个步骤应该是原子的、可执行的
2. 明确步骤之间的依赖关系
3. 尽可能利用并行执行的机会
4. 步骤数量应该合理，不要过度分解
5. 考虑潜在的错误情况和备选方案

输出格式（JSON）：
{
  "description": "计划的简要描述",
  "steps": [
    {
      "id": "1",
      "description": "步骤描述",
      "dependencies": []
    },
    {
      "id": "2",
      "description": "步骤描述",
      "dependencies": ["1"]
    }
  ],
  "reasoning": "规划思路说明"
}`;

/**
 * 任务规划器
 *
 * 使用 LLM 将复杂任务分解为结构化的执行计划。
 * 支持创建计划、调整计划和构建任务图。
 */
export class Planner {
  /** LLM 客户端 */
  private llmClient: LLMClient;

  /** 配置 */
  private config: Required<PlannerConfig>;

  /**
   * 创建规划器实例
   *
   * @param config - 规划器配置
   */
  constructor(config: PlannerConfig) {
    this.llmClient = config.llmClient;
    this.config = {
      llmClient: config.llmClient,
      maxSteps: config.maxSteps ?? 10,
      allowParallel: config.allowParallel ?? true,
      planningPrompt: config.planningPrompt ?? DEFAULT_PLANNING_PROMPT,
    };
  }

  /**
   * 创建任务计划
   *
   * @param taskDescription - 任务描述
   * @param options - 规划选项
   * @returns 规划结果
   */
  public async createPlan(
    taskDescription: string,
    options: PlanOptions = {}
  ): Promise<PlanningResult> {
    const prompt = this.buildPlanningPrompt(taskDescription, options);

    try {
      const response = await this.llmClient.chat([
        { role: 'system', content: this.config.planningPrompt },
        { role: 'user', content: prompt },
      ]);

      // 解析 LLM 响应
      const parsed = this.parsePlanningResponse(response.content);

      if (!parsed) {
        return {
          success: false,
          error: '无法解析规划响应',
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
            total: response.usage.totalTokens,
          },
        };
      }

      // 验证步骤数量
      if (parsed.steps.length > this.config.maxSteps) {
        return {
          success: false,
          error: `步骤数量超过限制 (${parsed.steps.length} > ${this.config.maxSteps})`,
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
            total: response.usage.totalTokens,
          },
        };
      }

      // 验证依赖关系
      const validation = this.validateDependencies(parsed.steps);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
            total: response.usage.totalTokens,
          },
        };
      }

      // 创建 TaskPlan
      const plan: TaskPlan = {
        planId: this.generatePlanId(),
        description: parsed.description || taskDescription,
        steps: parsed.steps,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return {
        success: true,
        plan,
        tokenUsage: {
          prompt: response.usage.promptTokens,
          completion: response.usage.completionTokens,
          total: response.usage.totalTokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
      };
    }
  }

  /**
   * 调整现有计划
   *
   * @param currentPlan - 当前计划
   * @param adjustmentRequest - 调整请求描述
   * @returns 调整结果
   */
  public async adjustPlan(
    currentPlan: TaskPlan,
    adjustmentRequest: string
  ): Promise<PlanAdjustmentResult> {
    const prompt = this.buildAdjustmentPrompt(currentPlan, adjustmentRequest);

    try {
      const response = await this.llmClient.chat([
        { role: 'system', content: this.config.planningPrompt },
        { role: 'user', content: prompt },
      ]);

      const parsed = this.parsePlanningResponse(response.content);

      if (!parsed) {
        return {
          success: false,
          error: '无法解析调整响应',
        };
      }

      // 验证步骤数量
      if (parsed.steps.length > this.config.maxSteps) {
        return {
          success: false,
          error: `步骤数量超过限制 (${parsed.steps.length} > ${this.config.maxSteps})`,
        };
      }

      const adjustedPlan: TaskPlan = {
        ...currentPlan,
        description: parsed.description || currentPlan.description,
        steps: parsed.steps,
        updatedAt: new Date(),
      };

      return {
        success: true,
        plan: adjustedPlan,
        adjustmentReason: parsed.reasoning,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 从 TaskPlan 构建 TaskGraph
   *
   * @param plan - 任务计划
   * @returns TaskGraph 实例
   */
  public buildTaskGraph(plan: TaskPlan): TaskGraph {
    return TaskGraph.fromTaskPlan(plan);
  }

  /**
   * 估算计划复杂度
   *
   * @param plan - 任务计划
   * @returns 复杂度评分 (1-10)
   */
  public estimateComplexity(plan: TaskPlan): number {
    const steps = plan.steps.length;
    const dependencies = plan.steps.reduce(
      (sum, step) => sum + step.dependencies.length,
      0
    );
    const avgDepsPerStep = steps > 0 ? dependencies / steps : 0;

    // 基于步骤数和平均依赖数计算复杂度
    let complexity = Math.min(steps / 2, 7);
    complexity += avgDepsPerStep * 1.5;

    return Math.min(Math.round(complexity), 10);
  }

  /**
   * 分析计划并行度
   *
   * @param plan - 任务计划
   * @returns 并行度分析结果
   */
  public analyzeParallelism(plan: TaskPlan): {
    totalSteps: number;
    parallelizableSteps: number;
    sequentialSteps: number;
    maxParallelGroups: number;
    parallelRatio: number;
  } {
    const graph = this.buildTaskGraph(plan);
    const groups = graph.getParallelGroups();

    const totalSteps = plan.steps.length;
    const parallelizable = groups.reduce(
      (sum, group) => sum + (group.length > 1 ? group.length : 0),
      0
    );

    return {
      totalSteps,
      parallelizableSteps: parallelizable,
      sequentialSteps: totalSteps - parallelizable,
      maxParallelGroups: groups.filter((g) => g.length > 1).length,
      parallelRatio: totalSteps > 0 ? parallelizable / totalSteps : 0,
    };
  }

  /**
   * 生成计划摘要
   *
   * @param plan - 任务计划
   * @returns 计划摘要
   */
  public generateSummary(plan: TaskPlan): string {
    const complexity = this.estimateComplexity(plan);
    const parallelism = this.analyzeParallelism(plan);

    return `
计划: ${plan.description}
步骤数: ${plan.steps.length}
复杂度: ${complexity}/10
可并行步骤: ${parallelism.parallelizableSteps}
预计并行组: ${parallelism.maxParallelGroups}
状态: ${plan.status}
    `.trim();
  }

  /**
   * 验证计划完整性
   *
   * @param plan - 任务计划
   * @returns 验证结果
   */
  public validatePlan(plan: TaskPlan): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查空计划
    if (plan.steps.length === 0) {
      errors.push('计划没有步骤');
    }

    // 检查步骤 ID 唯一性
    const ids = plan.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push('步骤 ID 重复');
    }

    // 检查依赖
    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        if (!ids.includes(depId)) {
          errors.push(`步骤 ${step.id} 依赖不存在的步骤 ${depId}`);
        }
        if (depId === step.id) {
          errors.push(`步骤 ${step.id} 依赖自己`);
        }
      }
    }

    // 检查循环依赖
    const depValidation = this.validateDependencies(plan.steps);
    if (!depValidation.valid) {
      errors.push(depValidation.error || '依赖验证失败');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 构建规划提示
   *
   * @param taskDescription - 任务描述
   * @param options - 规划选项
   * @returns 完整的提示字符串
   */
  private buildPlanningPrompt(
    taskDescription: string,
    options: PlanOptions
  ): string {
    let prompt = `任务：${taskDescription}\n\n`;

    if (options.context) {
      prompt += `上下文：${options.context}\n\n`;
    }

    if (options.availableTools && options.availableTools.length > 0) {
      prompt += `可用工具：${options.availableTools.join(', ')}\n\n`;
    }

    if (options.constraints && options.constraints.length > 0) {
      prompt += `约束条件：\n`;
      for (const constraint of options.constraints) {
        prompt += `- ${constraint}\n`;
      }
      prompt += '\n';
    }

    if (options.expectedOutput) {
      prompt += `期望输出：${options.expectedOutput}\n\n`;
    }

    prompt += `请将此任务分解为最多 ${this.config.maxSteps} 个步骤。`;

    if (this.config.allowParallel) {
      prompt += '尽可能识别可以并行执行的步骤。';
    }

    return prompt;
  }

  /**
   * 构建调整提示
   *
   * @param currentPlan - 当前计划
   * @param adjustmentRequest - 调整请求
   * @returns 完整的提示字符串
   */
  private buildAdjustmentPrompt(
    currentPlan: TaskPlan,
    adjustmentRequest: string
  ): string {
    const planJson = JSON.stringify(
      {
        description: currentPlan.description,
        steps: currentPlan.steps,
      },
      null,
      2
    );

    return `
当前计划：
${planJson}

调整请求：${adjustmentRequest}

请根据调整请求修改计划，输出新的计划 JSON。说明调整的原因。
    `.trim();
  }

  /**
   * 解析规划响应
   *
   * @param response - LLM 响应内容
   * @returns 解析结果
   */
  private parsePlanningResponse(response: string): {
    description: string;
    steps: PlanStep[];
    reasoning: string;
  } | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        return null;
      }

      // 标准化步骤格式
      const steps: PlanStep[] = parsed.steps.map((step: Record<string, unknown>) => ({
        id: String(step.id),
        description: String(step.description),
        dependencies: Array.isArray(step.dependencies)
          ? step.dependencies.map(String)
          : [],
      }));

      return {
        description: String(parsed.description || ''),
        steps,
        reasoning: String(parsed.reasoning || ''),
      };
    } catch {
      return null;
    }
  }

  /**
   * 验证依赖关系
   *
   * @param steps - 步骤列表
   * @returns 验证结果
   */
  private validateDependencies(
    steps: PlanStep[]
  ): { valid: boolean; error?: string } {
    const stepIds = new Set(steps.map((s) => s.id));

    // 检查依赖是否存在
    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          return {
            valid: false,
            error: `步骤 ${step.id} 依赖不存在的步骤 ${depId}`,
          };
        }
      }
    }

    // 检查循环依赖
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (stepId: string, stepMap: Map<string, PlanStep>): boolean => {
      visited.add(stepId);
      recStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (!visited.has(depId)) {
            if (hasCycle(depId, stepMap)) {
              return true;
            }
          } else if (recStack.has(depId)) {
            return true;
          }
        }
      }

      recStack.delete(stepId);
      return false;
    };

    const stepMap = new Map(steps.map((s) => [s.id, s]));

    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id, stepMap)) {
          return {
            valid: false,
            error: '检测到循环依赖',
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * 生成计划 ID
   *
   * @returns 唯一的计划 ID
   */
  private generatePlanId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `plan-${timestamp}-${random}`;
  }
}

/**
 * 创建规划器（便捷函数）
 *
 * @param config - 规划器配置
 * @returns Planner 实例
 */
export function createPlanner(config: PlannerConfig): Planner {
  return new Planner(config);
}

export default Planner;
