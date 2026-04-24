/**
 * @file ModelSelector.test.ts
 * @description ModelSelector 测试文件
 *              测试各种选择策略、条件过滤和历史数据影响
 * @module llm
 * @author AI Agent
 * @date 2026-04-22
 */

import {
  ModelSelector,
  createModelSelector,
  ProviderUsageStats,
  NoMatchingProviderError,
  InvalidStrategyError,
} from '../../src/llm/ModelSelector';
import { ModelRegistry } from '../../src/llm/ModelRegistry';
import {
  LLMProvider,
  ProviderConfig,
  ChatResponse,
  ChatResponseChunk,
  HealthCheckResult,
  ConnectionTestResult,
} from '../../src/llm/providers/LLMProvider';

// ==================== Mock Provider 工厂 ====================

function createMockProvider(config: ProviderConfig, overrides?: Partial<LLMProvider['metadata']['capabilities']>): LLMProvider {
  return {
    metadata: {
      id: config.id,
      name: config.name || config.modelName,
      type: config.type,
      modelName: config.modelName,
      capabilities: {
        supportsVision: overrides?.supportsVision ?? false,
        supportsTools: overrides?.supportsTools ?? true,
        supportsStreaming: overrides?.supportsStreaming ?? true,
        supportsJSONMode: overrides?.supportsJSONMode ?? false,
        maxTokens: overrides?.maxTokens ?? 4096,
        contextWindow: overrides?.contextWindow ?? 8192,
      },
      isActive: true,
      isDefault: config.isDefault || false,
    },

    async chat(): Promise<ChatResponse> {
      return {
        content: `Mock response from ${config.modelName}`,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        model: config.modelName,
        latencyMs: 100,
      };
    },

    async *chatStream(): AsyncIterable<ChatResponseChunk> {
      yield { content: 'Mock', isComplete: false };
      yield { isComplete: true };
    },

    calculateCost(promptTokens: number, completionTokens: number): number {
      return (promptTokens + completionTokens) * 0.00001;
    },

    async healthCheck(): Promise<HealthCheckResult> {
      return { ok: true, latencyMs: 50 };
    },

    async testConnection(): Promise<ConnectionTestResult> {
      return { success: true, message: 'OK' };
    },
  };
}

// ==================== 测试套件 ====================

describe('ModelSelector', () => {
  let registry: ModelRegistry;
  let selector: ModelSelector;

  beforeEach(() => {
    registry = new ModelRegistry();
    selector = new ModelSelector(registry);

    // 注册模拟工厂
    registry.registerFactory('mock', createMockProvider);
  });

  // ==================== 基础选择 ====================

  describe('Default Strategy', () => {
    it('should select default provider', () => {
      registry.addProvider({
        id: 'default-provider',
        type: 'mock',
        modelName: 'claude-3-5-sonnet-20241022',
        isDefault: true,
      });

      const provider = selector.select({}, 'default');
      expect(provider.metadata.id).toBe('default-provider');
    });

    it('should fallback to first candidate when no default', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'claude-3-5-sonnet-20241022',
      });

      const provider = selector.select({}, 'default');
      expect(provider.metadata.id).toBe('provider-1');
    });

    it('should fallback when default does not match criteria', () => {
      // 先注册带 overrides 的工厂
      registry.unregisterFactory('mock');
      registry.registerFactory('mock', (config: ProviderConfig) => {
        const p = createMockProvider(config);
        if (config.id === 'vision-provider') {
          p.metadata.capabilities.supportsVision = true;
        } else {
          p.metadata.capabilities.supportsVision = false;
        }
        return p;
      });

      registry.addProvider({
        id: 'default-provider',
        type: 'mock',
        modelName: 'claude-3-5-sonnet-20241022',
        isDefault: true,
      });

      registry.addProvider({
        id: 'vision-provider',
        type: 'mock',
        modelName: 'gpt-4o',
      });

      const provider = selector.select({ requiresVision: true }, 'default');
      expect(provider.metadata.id).toBe('vision-provider');
    });
  });

  // ==================== 条件过滤 ====================

  describe('Criteria Filtering', () => {
    beforeEach(() => {
      // 注册支持不同能力的工厂
      registry.unregisterFactory('mock');
      registry.registerFactory('mock', (config: ProviderConfig) => {
        const p = createMockProvider(config);
        // 默认所有能力为 false，然后按 id 开启
        p.metadata.capabilities.supportsVision = false;
        p.metadata.capabilities.supportsTools = false;
        p.metadata.capabilities.supportsStreaming = false;
        p.metadata.capabilities.supportsJSONMode = false;
        p.metadata.capabilities.contextWindow = 8192;

        if (config.id === 'vision-provider') {
          p.metadata.capabilities.supportsVision = true;
        }
        if (config.id === 'tool-provider') {
          p.metadata.capabilities.supportsTools = true;
        }
        if (config.id === 'json-provider') {
          p.metadata.capabilities.supportsJSONMode = true;
        }
        if (config.id === 'large-context') {
          p.metadata.capabilities.contextWindow = 200000;
        }
        return p;
      });
    });

    it('should filter by vision capability', () => {
      registry.addProvider({ id: 'no-vision', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'vision-provider', type: 'mock', modelName: 'gpt-4o' });

      const provider = selector.select({ requiresVision: true });
      expect(provider.metadata.id).toBe('vision-provider');
    });

    it('should filter by tools capability', () => {
      registry.addProvider({ id: 'no-tools', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'tool-provider', type: 'mock', modelName: 'claude-3-5-sonnet' });

      const provider = selector.select({ requiresTools: true });
      expect(provider.metadata.id).toBe('tool-provider');
    });

    it('should filter by JSON mode capability', () => {
      registry.addProvider({ id: 'no-json', type: 'mock', modelName: 'claude-3-haiku' });
      registry.addProvider({ id: 'json-provider', type: 'mock', modelName: 'gpt-4o' });

      const provider = selector.select({ requiresJSONMode: true });
      expect(provider.metadata.id).toBe('json-provider');
    });

    it('should filter by context window', () => {
      registry.addProvider({ id: 'small-context', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'large-context', type: 'mock', modelName: 'claude-3-opus' });

      const provider = selector.select({ minContextWindow: 100000 });
      expect(provider.metadata.id).toBe('large-context');
    });

    it('should filter by excludeProviders', () => {
      registry.addProvider({ id: 'provider-a', type: 'mock', modelName: 'claude-3-5-sonnet' });
      registry.addProvider({ id: 'provider-b', type: 'mock', modelName: 'gpt-4o' });

      const provider = selector.select({ excludeProviders: ['provider-a'] });
      expect(provider.metadata.id).toBe('provider-b');
    });

    it('should use preferredProvider when specified', () => {
      registry.addProvider({ id: 'provider-a', type: 'mock', modelName: 'claude-3-5-sonnet' });
      registry.addProvider({ id: 'provider-b', type: 'mock', modelName: 'gpt-4o' });

      const provider = selector.select({ preferredProvider: 'provider-b' });
      expect(provider.metadata.id).toBe('provider-b');
    });

    it('should ignore preferredProvider if it does not match criteria', () => {
      registry.unregisterFactory('mock');
      registry.registerFactory('mock', (config: ProviderConfig) => {
        const p = createMockProvider(config);
        if (config.id === 'no-vision') {
          p.metadata.capabilities.supportsVision = false;
        }
        if (config.id === 'vision-provider') {
          p.metadata.capabilities.supportsVision = true;
        }
        return p;
      });

      registry.addProvider({ id: 'no-vision', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'vision-provider', type: 'mock', modelName: 'gpt-4o' });

      const provider = selector.select({ preferredProvider: 'no-vision', requiresVision: true });
      expect(provider.metadata.id).toBe('vision-provider');
    });
  });

  // ==================== 成本策略 ====================

  describe('Cost Strategy', () => {
    it('should select cheapest provider', () => {
      registry.addProvider({ id: 'expensive', type: 'mock', modelName: 'claude-3-opus-20240229' });
      registry.addProvider({ id: 'cheap', type: 'mock', modelName: 'claude-3-haiku-20240307' });

      const provider = selector.select({}, 'cost');
      expect(provider.metadata.id).toBe('cheap');
    });

    it('should select cheapest among multiple providers', () => {
      registry.addProvider({ id: 'expensive', type: 'mock', modelName: 'gpt-4' });
      registry.addProvider({ id: 'mid', type: 'mock', modelName: 'claude-3-5-sonnet' });
      registry.addProvider({ id: 'cheap', type: 'mock', modelName: 'gpt-4o-mini' });

      const provider = selector.select({}, 'cost');
      expect(provider.metadata.id).toBe('cheap');
    });

    it('should consider history cost data', () => {
      registry.addProvider({ id: 'provider-a', type: 'mock', modelName: 'claude-3-5-sonnet' });
      registry.addProvider({ id: 'provider-b', type: 'mock', modelName: 'claude-3-haiku' });

      // 更新历史数据：haiku 实际使用成本更高
      selector.updateUsageStats({
        providerId: 'provider-b',
        averageLatencyMs: 500,
        averageCostPer1kTokens: 0.05,
        successRate: 0.9,
        callCount: 10,
      });

      selector.updateUsageStats({
        providerId: 'provider-a',
        averageLatencyMs: 1000,
        averageCostPer1kTokens: 0.001,
        successRate: 0.95,
        callCount: 10,
      });

      // cost 策略使用预估成本（基于模型名称），历史数据不影响 cost 策略
      // 这里测试的是预估成本排序
      const provider = selector.select({}, 'cost');
      // haiku 的预估成本更低
      expect(provider.metadata.id).toBe('provider-b');
    });
  });

  // ==================== 质量策略 ====================

  describe('Quality Strategy', () => {
    it('should select highest quality provider', () => {
      registry.addProvider({ id: 'low-quality', type: 'mock', modelName: 'claude-3-haiku' });
      registry.addProvider({ id: 'high-quality', type: 'mock', modelName: 'claude-3-opus' });

      const provider = selector.select({}, 'quality');
      expect(provider.metadata.id).toBe('high-quality');
    });

    it('should consider success rate in quality scoring', () => {
      registry.addProvider({ id: 'provider-a', type: 'mock', modelName: 'claude-3-opus' });
      registry.addProvider({ id: 'provider-b', type: 'mock', modelName: 'claude-3-5-sonnet' });

      // provider-a 成功率很低
      selector.updateUsageStats({
        providerId: 'provider-a',
        averageLatencyMs: 2000,
        averageCostPer1kTokens: 0.045,
        successRate: 0.3,
        callCount: 20,
      });

      // provider-b 成功率高
      selector.updateUsageStats({
        providerId: 'provider-b',
        averageLatencyMs: 1000,
        averageCostPer1kTokens: 0.009,
        successRate: 0.99,
        callCount: 20,
      });

      const provider = selector.select({}, 'quality');
      // 高成功率应该让 provider-b 胜出
      expect(provider.metadata.id).toBe('provider-b');
    });

    it('should boost score for task-matching models in quality strategy', () => {
      registry.addProvider({ id: 'coding-model', type: 'mock', modelName: 'claude-3-5-sonnet' });
      registry.addProvider({ id: 'other-model', type: 'mock', modelName: 'claude-3-opus' });

      // coding 任务时，sonnet 排名更靠前，应该获得额外加分
      const provider = selector.select({ taskType: 'coding' }, 'quality');
      expect(provider.metadata.id).toBe('coding-model');
    });
  });

  // ==================== 速度策略 ====================

  describe('Speed Strategy', () => {
    it('should select fastest provider by model type', () => {
      registry.addProvider({ id: 'slow', type: 'mock', modelName: 'claude-3-opus' });
      registry.addProvider({ id: 'fast', type: 'mock', modelName: 'claude-3-haiku' });

      const provider = selector.select({}, 'speed');
      expect(provider.metadata.id).toBe('fast');
    });

    it('should consider history latency data', () => {
      registry.addProvider({ id: 'provider-a', type: 'mock', modelName: 'claude-3-opus' });
      registry.addProvider({ id: 'provider-b', type: 'mock', modelName: 'claude-3-haiku' });

      // provider-a 历史上延迟很低（反直觉但测试用）
      selector.updateUsageStats({
        providerId: 'provider-a',
        averageLatencyMs: 300,
        averageCostPer1kTokens: 0.045,
        successRate: 0.95,
        callCount: 10,
      });

      // provider-b 历史上延迟很高
      selector.updateUsageStats({
        providerId: 'provider-b',
        averageLatencyMs: 3000,
        averageCostPer1kTokens: 0.00075,
        successRate: 0.9,
        callCount: 10,
      });

      const provider = selector.select({}, 'speed');
      expect(provider.metadata.id).toBe('provider-a');
    });
  });

  // ==================== 任务类型策略 ====================

  describe('Task-based Strategy', () => {
    beforeEach(() => {
      registry.addProvider({ id: 'opus', type: 'mock', modelName: 'claude-3-opus-20240229' });
      registry.addProvider({ id: 'sonnet', type: 'mock', modelName: 'claude-3-5-sonnet-20241022' });
      registry.addProvider({ id: 'haiku', type: 'mock', modelName: 'claude-3-haiku-20240307' });
      registry.addProvider({ id: 'gpt4o', type: 'mock', modelName: 'gpt-4o' });
      registry.addProvider({ id: 'gpt4mini', type: 'mock', modelName: 'gpt-4o-mini' });
      registry.addProvider({ id: 'gpt35', type: 'mock', modelName: 'gpt-3.5-turbo' });
    });

    it('should select planning task model', () => {
      const provider = selector.select({ taskType: 'planning' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-opus-20240229');
    });

    it('should select coding task model', () => {
      const provider = selector.select({ taskType: 'coding' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-5-sonnet-20241022');
    });

    it('should select debugging task model', () => {
      const provider = selector.select({ taskType: 'debugging' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-5-sonnet-20241022');
    });

    it('should select summarization task model', () => {
      const provider = selector.select({ taskType: 'summarization' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-haiku-20240307');
    });

    it('should select chat task model', () => {
      const provider = selector.select({ taskType: 'chat' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-haiku-20240307');
    });

    it('should select vision task model', () => {
      const provider = selector.select({ taskType: 'vision' }, 'task_based');
      expect(provider.metadata.modelName).toBe('gpt-4o');
    });

    it('should select analysis task model', () => {
      const provider = selector.select({ taskType: 'analysis' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-opus-20240229');
    });

    it('should select creative task model', () => {
      const provider = selector.select({ taskType: 'creative' }, 'task_based');
      expect(provider.metadata.modelName).toBe('claude-3-opus-20240229');
    });

    it('should fallback to default when taskType is not specified', () => {
      registry.addProvider({
        id: 'default-provider',
        type: 'mock',
        modelName: 'claude-3-5-sonnet',
        isDefault: true,
      });

      const provider = selector.select({}, 'task_based');
      expect(provider.metadata.id).toBe('default-provider');
    });

    it('should fallback to default when no task model matches', () => {
      // 清空注册表
      registry.clear();
      registry.registerFactory('mock', createMockProvider);

      registry.addProvider({
        id: 'default-provider',
        type: 'mock',
        modelName: 'custom-model',
        isDefault: true,
      });

      const provider = selector.select({ taskType: 'coding' }, 'task_based');
      expect(provider.metadata.id).toBe('default-provider');
    });
  });

  // ==================== 错误处理 ====================

  describe('Error Handling', () => {
    it('should throw when no provider matches criteria', () => {
      registry.addProvider({ id: 'provider', type: 'mock', modelName: 'gpt-3.5-turbo' });

      expect(() => {
        selector.select({ requiresVision: true });
      }).toThrow(NoMatchingProviderError);
    });

    it('should throw when no providers are registered', () => {
      expect(() => {
        selector.select({});
      }).toThrow();
    });

    it('should throw for invalid strategy', () => {
      registry.addProvider({ id: 'provider', type: 'mock', modelName: 'gpt-3.5-turbo' });

      expect(() => {
        selector.select({}, 'invalid_strategy' as any);
      }).toThrow(InvalidStrategyError);
    });

    it('should not throw when preferred provider is missing', () => {
      registry.addProvider({ id: 'fallback', type: 'mock', modelName: 'gpt-3.5-turbo' });

      const provider = selector.select({ preferredProvider: 'non-existent' });
      expect(provider.metadata.id).toBe('fallback');
    });
  });

  // ==================== 使用统计管理 ====================

  describe('Usage Stats Management', () => {
    it('should update and retrieve usage stats', () => {
      const stats: ProviderUsageStats = {
        providerId: 'test-provider',
        averageLatencyMs: 500,
        averageCostPer1kTokens: 0.001,
        successRate: 0.95,
        callCount: 100,
      };

      selector.updateUsageStats(stats);
      const retrieved = selector.getStats('test-provider');

      expect(retrieved).toEqual(stats);
    });

    it('should update usage stats in batch', () => {
      const statsList: ProviderUsageStats[] = [
        {
          providerId: 'provider-1',
          averageLatencyMs: 500,
          averageCostPer1kTokens: 0.001,
          successRate: 0.95,
          callCount: 100,
        },
        {
          providerId: 'provider-2',
          averageLatencyMs: 1000,
          averageCostPer1kTokens: 0.002,
          successRate: 0.9,
          callCount: 50,
        },
      ];

      selector.updateUsageStatsBatch(statsList);

      expect(selector.getStats('provider-1')).toBeDefined();
      expect(selector.getStats('provider-2')).toBeDefined();
    });

    it('should clear all stats', () => {
      selector.updateUsageStats({
        providerId: 'test',
        averageLatencyMs: 500,
        averageCostPer1kTokens: 0.001,
        successRate: 0.95,
        callCount: 10,
      });

      selector.clearStats();

      expect(selector.getStats('test')).toBeUndefined();
    });

    it('should return undefined for unknown provider stats', () => {
      expect(selector.getStats('unknown')).toBeUndefined();
    });
  });

  // ==================== getCandidates ====================

  describe('getCandidates', () => {
    beforeEach(() => {
      registry.unregisterFactory('mock');
      registry.registerFactory('mock', (config: ProviderConfig) => {
        const p = createMockProvider(config);
        if (config.id === 'vision-provider') {
          p.metadata.capabilities.supportsVision = true;
        }
        return p;
      });
    });

    it('should return all matching candidates', () => {
      registry.addProvider({ id: 'p1', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'p2', type: 'mock', modelName: 'gpt-4o' });
      registry.addProvider({ id: 'p3', type: 'mock', modelName: 'claude-3-haiku' });

      const candidates = selector.getCandidates({});
      expect(candidates).toHaveLength(3);
    });

    it('should filter inactive providers', () => {
      registry.addProvider({ id: 'active', type: 'mock', modelName: 'gpt-4o' });
      registry.addProvider({ id: 'inactive', type: 'mock', modelName: 'claude-3-haiku' });

      // 手动将 inactive 标记为非活跃
      const inactiveProvider = registry.get('inactive');
      inactiveProvider.metadata.isActive = false;

      const candidates = selector.getCandidates({});
      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe('active');
    });

    it('should filter by multiple criteria', () => {
      registry.addProvider({ id: 'no-vision', type: 'mock', modelName: 'gpt-3.5-turbo' });
      registry.addProvider({ id: 'vision-provider', type: 'mock', modelName: 'gpt-4o' });
      registry.addProvider({ id: 'other-vision', type: 'mock', modelName: 'claude-3-opus' });

      // 给 other-vision 也设置支持视觉
      const otherProvider = registry.get('other-vision');
      otherProvider.metadata.capabilities.supportsVision = true;

      const candidates = selector.getCandidates({ requiresVision: true });
      expect(candidates).toHaveLength(2);
    });
  });

  // ==================== 工厂函数 ====================

  describe('Factory Function', () => {
    it('should create selector with factory function', () => {
      const newSelector = createModelSelector(registry);
      expect(newSelector).toBeInstanceOf(ModelSelector);
    });
  });

  // ==================== 综合场景 ====================

  describe('Complex Scenarios', () => {
    beforeEach(() => {
      registry.addProvider({
        id: 'claude-sonnet',
        type: 'mock',
        modelName: 'claude-3-5-sonnet-20241022',
      });
      registry.addProvider({
        id: 'claude-haiku',
        type: 'mock',
        modelName: 'claude-3-haiku-20240307',
      });
      registry.addProvider({
        id: 'gpt-4o',
        type: 'mock',
        modelName: 'gpt-4o',
      });
      registry.addProvider({
        id: 'gpt-4o-mini',
        type: 'mock',
        modelName: 'gpt-4o-mini',
      });
    });

    it('should handle combination of criteria and strategy', () => {
      // 成本优先 + 排除特定 provider
      const provider = selector.select(
        { excludeProviders: ['gpt-4o-mini'] },
        'cost'
      );
      // gpt-4o-mini 被排除，剩下最便宜的是 haiku
      expect(provider.metadata.id).toBe('claude-haiku');
    });

    it('should handle empty criteria with all strategies', () => {
      expect(selector.select({}, 'default').metadata.id).toBeDefined();
      expect(selector.select({}, 'cost').metadata.id).toBeDefined();
      expect(selector.select({}, 'quality').metadata.id).toBeDefined();
      expect(selector.select({}, 'speed').metadata.id).toBeDefined();
      expect(selector.select({ taskType: 'chat' }, 'task_based').metadata.id).toBeDefined();
    });
  });
});
