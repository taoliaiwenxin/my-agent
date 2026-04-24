/**
 * @file ModelSelector.ts
 * @description 模型选择器，根据策略和条件自动选择最适合的 LLM Provider
 *              支持多种选择策略：default, cost, quality, speed, task_based
 * @module llm
 * @author AI Agent
 * @date 2026-04-22
 * @version 1.0.0
 *
 * @example
 * const selector = new ModelSelector(registry);
 *
 * // 使用默认策略
 * const provider = await selector.select({});
 *
 * // 基于任务类型选择
 * const provider = await selector.select(
 *   { taskType: 'coding', requiresTools: true },
 *   'task_based'
 * );
 *
 * // 成本优先
 * const provider = await selector.select({}, 'cost');
 */

import { ModelRegistry } from './ModelRegistry';
import {
  LLMProvider,
  ProviderMetadata,
} from './providers/LLMProvider';

// ==================== 类型定义 ====================

/**
 * 任务类型
 */
export type TaskType =
  | 'planning' // 任务规划
  | 'coding' // 代码生成
  | 'debugging' // 调试
  | 'summarization' // 总结
  | 'chat' // 普通对话
  | 'vision' // 视觉任务
  | 'analysis' // 分析任务
  | 'creative'; // 创意写作

/**
 * 选择策略
 */
export type SelectionStrategy =
  | 'default' // 使用默认 Provider
  | 'cost' // 成本优先
  | 'quality' // 质量优先
  | 'speed' // 速度优先
  | 'task_based'; // 基于任务类型

/**
 * 选择条件
 */
export interface SelectionCriteria {
  /** 任务类型 */
  taskType?: TaskType;

  /** 是否需要视觉能力 */
  requiresVision?: boolean;

  /** 是否需要工具调用能力 */
  requiresTools?: boolean;

  /** 是否需要流式输出 */
  requiresStreaming?: boolean;

  /** 是否需要 JSON 模式 */
  requiresJSONMode?: boolean;

  /** 最大可接受成本（每 1K tokens，美元） */
  maxCostPer1kTokens?: number;

  /** 最小上下文窗口需求 */
  minContextWindow?: number;

  /** 首选 Provider ID */
  preferredProvider?: string;

  /** 排除的 Provider ID 列表 */
  excludeProviders?: string[];
}

/**
 * Provider 使用统计（用于历史数据驱动的选择）
 */
export interface ProviderUsageStats {
  /** Provider ID */
  providerId: string;

  /** 平均延迟（毫秒） */
  averageLatencyMs: number;

  /** 平均成本（每 1K tokens，美元） */
  averageCostPer1kTokens: number;

  /** 成功率 (0-1) */
  successRate: number;

  /** 调用次数 */
  callCount: number;

  /** 最后使用时间 */
  lastUsedAt?: Date;
}

/**
 * 无可用 Provider 错误
 */
export class NoMatchingProviderError extends Error {
  constructor(criteria: string) {
    super(`No provider matches the criteria: ${criteria}`);
    this.name = 'NoMatchingProviderError';
  }
}

/**
 * 无效策略错误
 */
export class InvalidStrategyError extends Error {
  constructor(strategy: string) {
    super(`Invalid selection strategy: ${strategy}`);
    this.name = 'InvalidStrategyError';
  }
}

// ==================== 模型特性评分 ====================

/**
 * 任务类型到模型名称前缀的映射（优先级排序）
 */
const TASK_MODEL_MAPPING: Record<TaskType, string[]> = {
  planning: ['claude-3-opus', 'gpt-4o', 'claude-3-5-sonnet', 'gpt-4', 'claude-3-sonnet'],
  coding: ['claude-3-5-sonnet', 'gpt-4o', 'claude-3-sonnet', 'claude-3-opus', 'gpt-4'],
  debugging: ['claude-3-5-sonnet', 'gpt-4o', 'claude-3-sonnet', 'claude-3-opus'],
  summarization: ['claude-3-haiku', 'gpt-4o-mini', 'gpt-3.5-turbo', 'claude-3-sonnet'],
  chat: ['claude-3-haiku', 'gpt-4o-mini', 'gpt-3.5-turbo', 'claude-3-sonnet'],
  vision: ['gpt-4o', 'claude-3-opus', 'claude-3-5-sonnet', 'claude-3-sonnet', 'claude-3-haiku'],
  analysis: ['claude-3-opus', 'gpt-4o', 'claude-3-5-sonnet', 'claude-3-sonnet', 'gpt-4'],
  creative: ['claude-3-opus', 'gpt-4o', 'claude-3-5-sonnet', 'claude-3-sonnet'],
};

/**
 * 模型质量评分（基于模型能力，越高越好）
 */
const MODEL_QUALITY_SCORES: Record<string, number> = {
  'claude-3-opus': 95,
  'claude-3-opus-latest': 95,
  'claude-3-5-sonnet': 90,
  'claude-3-5-sonnet-latest': 90,
  'gpt-4o': 90,
  'gpt-4': 85,
  'claude-3-sonnet': 80,
  'claude-3-sonnet-latest': 80,
  'gpt-4o-mini': 75,
  'claude-3-haiku': 70,
  'claude-3-haiku-latest': 70,
  'gpt-3.5-turbo': 70,
};

/**
 * 模型成本评分（每 1K tokens 估算成本，越低越便宜，单位：美元）
 */
const MODEL_COST_ESTIMATES: Record<string, number> = {
  'claude-3-opus': 0.045,
  'claude-3-opus-latest': 0.045,
  'claude-3-5-sonnet': 0.009,
  'claude-3-5-sonnet-latest': 0.009,
  'gpt-4o': 0.0075,
  'gpt-4': 0.045,
  'claude-3-sonnet': 0.009,
  'claude-3-sonnet-latest': 0.009,
  'gpt-4o-mini': 0.0003,
  'claude-3-haiku': 0.00075,
  'claude-3-haiku-latest': 0.00075,
  'gpt-3.5-turbo': 0.0015,
};

// ==================== ModelSelector ====================

/**
 * 模型选择器
 *
 * 根据选择策略和条件，从 ModelRegistry 中选择最适合的 Provider
 */
export class ModelSelector {
  /** 模型注册表 */
  private registry: ModelRegistry;

  /** Provider 使用统计 */
  private usageStats: Map<string, ProviderUsageStats> = new Map();

  /**
   * 创建 ModelSelector 实例
   *
   * @param registry - 模型注册表
   */
  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  /**
   * 选择最适合的 Provider
   *
   * @param criteria - 选择条件
   * @param strategy - 选择策略，默认 'default'
   * @returns 选中的 Provider
   * @throws {NoMatchingProviderError} 如果没有匹配的 Provider
   * @throws {InvalidStrategyError} 如果策略无效
   */
  select(criteria: SelectionCriteria, strategy: SelectionStrategy = 'default'): LLMProvider {
    // 如果指定了首选 Provider，直接返回
    if (criteria.preferredProvider) {
      if (this.registry.has(criteria.preferredProvider)) {
        const provider = this.registry.get(criteria.preferredProvider);
        if (provider.metadata.isActive && this.matchesCriteria(provider.metadata, criteria)) {
          return provider;
        }
      }
    }

    // 获取所有活跃且符合条件的 Provider
    const candidates = this.getCandidates(criteria);

    if (candidates.length === 0) {
      throw new NoMatchingProviderError(this.formatCriteria(criteria));
    }

    // 根据策略选择
    switch (strategy) {
      case 'default':
        return this.selectByDefault(candidates);

      case 'cost':
        return this.selectByCost(candidates);

      case 'quality':
        return this.selectByQuality(candidates, criteria.taskType);

      case 'speed':
        return this.selectBySpeed(candidates);

      case 'task_based':
        return this.selectByTask(candidates, criteria.taskType);

      default:
        throw new InvalidStrategyError(strategy);
    }
  }

  /**
   * 获取所有候选 Provider 的元数据
   *
   * @param criteria - 选择条件
   * @returns 符合条件的 Provider 元数据列表
   */
  getCandidates(criteria: SelectionCriteria): ProviderMetadata[] {
    const allProviders = this.registry.list();

    return allProviders.filter((provider) => {
      // 只选择活跃的 Provider
      if (!provider.isActive) return false;

      // 排除指定的 Provider
      if (criteria.excludeProviders?.includes(provider.id)) return false;

      // 检查能力匹配
      if (!this.matchesCriteria(provider, criteria)) return false;

      return true;
    });
  }

  /**
   * 检查 Provider 是否符合条件
   *
   * @param metadata - Provider 元数据
   * @param criteria - 选择条件
   * @returns 是否符合
   */
  private matchesCriteria(metadata: ProviderMetadata, criteria: SelectionCriteria): boolean {
    const caps = metadata.capabilities;

    if (criteria.requiresVision && !caps.supportsVision) return false;
    if (criteria.requiresTools && !caps.supportsTools) return false;
    if (criteria.requiresStreaming && !caps.supportsStreaming) return false;
    if (criteria.requiresJSONMode && !caps.supportsJSONMode) return false;
    if (criteria.minContextWindow && caps.contextWindow < criteria.minContextWindow) return false;

    return true;
  }

  /**
   * 使用默认策略选择
   *
   * 优先返回默认 Provider，如果不符合条件则返回第一个候选
   */
  private selectByDefault(candidates: ProviderMetadata[]): LLMProvider {
    try {
      const defaultProvider = this.registry.getDefault();
      if (candidates.some((c) => c.id === defaultProvider.metadata.id)) {
        return defaultProvider;
      }
    } catch {
      // 没有默认 Provider，继续选择第一个候选
    }

    return this.registry.get(candidates[0].id);
  }

  /**
   * 成本优先选择
   *
   * 优先选择历史平均成本最低的 Provider，如果没有历史数据则使用预估成本
   */
  private selectByCost(candidates: ProviderMetadata[]): LLMProvider {
    const scored = candidates.map((candidate) => ({
      candidate,
      score: this.getEstimatedCost(candidate.modelName),
    }));

    // 按成本升序排列（成本越低越好）
    scored.sort((a, b) => a.score - b.score);

    return this.registry.get(scored[0].candidate.id);
  }

  /**
   * 质量优先选择
   *
   * 基于历史成功率和模型固有能力评分
   */
  private selectByQuality(candidates: ProviderMetadata[], taskType?: TaskType): LLMProvider {
    const scored = candidates.map((candidate) => {
      const stats = this.usageStats.get(candidate.id);
      const baseScore = this.getQualityScore(candidate.modelName);

      // 如果有历史数据，结合成功率调整评分
      let score = baseScore;
      if (stats && stats.callCount > 0) {
        const successWeight = Math.min(stats.callCount / 10, 1); // 最多 100% 权重
        score = baseScore * (0.7 + 0.3 * stats.successRate * successWeight);
      }

      // 如果有任务类型，考虑任务匹配度
      if (taskType) {
        const taskModels = TASK_MODEL_MAPPING[taskType] || [];
        const taskMatchIndex = taskModels.findIndex((m) => candidate.modelName.includes(m));
        if (taskMatchIndex >= 0) {
          score += (10 - taskMatchIndex) * 2; // 排名越靠前加分越多
        }
      }

      return { candidate, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return this.registry.get(scored[0].candidate.id);
  }

  /**
   * 速度优先选择
   *
   * 优先选择历史平均延迟最低的 Provider，如果没有历史数据则选择轻量级模型
   */
  private selectBySpeed(candidates: ProviderMetadata[]): LLMProvider {
    const scored = candidates.map((candidate) => {
      const stats = this.usageStats.get(candidate.id);

      if (stats && stats.callCount > 0) {
        return { candidate, score: stats.averageLatencyMs };
      }

      // 没有历史数据时，使用模型固有延迟估算
      return { candidate, score: this.getEstimatedLatency(candidate.modelName) };
    });

    // 按延迟升序排列（延迟越低越好）
    scored.sort((a, b) => a.score - b.score);

    return this.registry.get(scored[0].candidate.id);
  }

  /**
   * 基于任务类型选择
   *
   * 根据任务类型到模型的映射选择最适合的 Provider
   */
  private selectByTask(candidates: ProviderMetadata[], taskType?: TaskType): LLMProvider {
    if (!taskType) {
      return this.selectByDefault(candidates);
    }

    const preferredModels = TASK_MODEL_MAPPING[taskType] || [];

    // 按映射顺序查找匹配
    for (const modelPrefix of preferredModels) {
      const match = candidates.find((c) => c.modelName.includes(modelPrefix));
      if (match) {
        return this.registry.get(match.id);
      }
    }

    // 如果没有匹配，回退到默认策略
    return this.selectByDefault(candidates);
  }

  /**
   * 更新 Provider 使用统计
   *
   * @param stats - 使用统计
   */
  updateUsageStats(stats: ProviderUsageStats): void {
    this.usageStats.set(stats.providerId, stats);
  }

  /**
   * 批量更新 Provider 使用统计
   *
   * @param statsList - 使用统计列表
   */
  updateUsageStatsBatch(statsList: ProviderUsageStats[]): void {
    for (const stats of statsList) {
      this.updateUsageStats(stats);
    }
  }

  /**
   * 获取 Provider 的使用统计
   *
   * @param providerId - Provider ID
   * @returns 使用统计或 undefined
   */
  getStats(providerId: string): ProviderUsageStats | undefined {
    return this.usageStats.get(providerId);
  }

  /**
   * 清除所有使用统计
   */
  clearStats(): void {
    this.usageStats.clear();
  }

  /**
   * 获取模型的预估成本
   *
   * @param modelName - 模型名称
   * @returns 每 1K tokens 的预估成本
   */
  private getEstimatedCost(modelName: string): number {
    for (const [prefix, cost] of Object.entries(MODEL_COST_ESTIMATES)) {
      if (modelName.includes(prefix)) {
        return cost;
      }
    }
    return 0.01; // 默认成本
  }

  /**
   * 获取模型的质量评分
   *
   * @param modelName - 模型名称
   * @returns 质量评分 (0-100)
   */
  private getQualityScore(modelName: string): number {
    for (const [prefix, score] of Object.entries(MODEL_QUALITY_SCORES)) {
      if (modelName.includes(prefix)) {
        return score;
      }
    }
    return 50; // 默认评分
  }

  /**
   * 获取模型的预估延迟
   *
   * @param modelName - 模型名称
   * @returns 预估延迟（毫秒）
   */
  private getEstimatedLatency(modelName: string): number {
    // 大模型通常延迟更高
    if (modelName.includes('opus') || modelName.includes('gpt-4') || modelName.includes('o1')) {
      return 2000;
    }
    if (modelName.includes('sonnet') || modelName.includes('4o')) {
      return 1000;
    }
    // 小模型延迟最低
    return 500;
  }

  /**
   * 格式化选择条件为字符串
   *
   * @param criteria - 选择条件
   * @returns 格式化字符串
   */
  private formatCriteria(criteria: SelectionCriteria): string {
    const parts: string[] = [];
    if (criteria.taskType) parts.push(`taskType=${criteria.taskType}`);
    if (criteria.requiresVision) parts.push('requiresVision');
    if (criteria.requiresTools) parts.push('requiresTools');
    if (criteria.requiresStreaming) parts.push('requiresStreaming');
    if (criteria.requiresJSONMode) parts.push('requiresJSONMode');
    if (criteria.minContextWindow) parts.push(`minContextWindow=${criteria.minContextWindow}`);
    if (criteria.preferredProvider) parts.push(`preferredProvider=${criteria.preferredProvider}`);
    if (criteria.excludeProviders?.length) parts.push(`exclude=[${criteria.excludeProviders.join(',')}]`);

    return parts.length > 0 ? parts.join(', ') : 'none';
  }
}

/**
 * 创建模型选择器（便捷函数）
 *
 * @param registry - 模型注册表
 * @returns ModelSelector 实例
 */
export function createModelSelector(registry: ModelRegistry): ModelSelector {
  return new ModelSelector(registry);
}
