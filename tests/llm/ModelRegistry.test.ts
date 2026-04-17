/**
 * @file ModelRegistry.test.ts
 * @description ModelRegistry 测试文件
 *              测试 Provider 工厂的注册、Provider 实例的添加、移除、查询等功能
 * @module llm
 * @author AI Agent
 * @date 2026-04-17
 */

import {
  ModelRegistry,
  ProviderNotFoundError,
  ProviderTypeNotFoundError,
  NoDefaultProviderError,
  createModelRegistry,
} from '../../src/llm/ModelRegistry';
import {
  LLMProvider,
  ProviderConfig,
  ChatResponse,
  ChatResponseChunk,
  HealthCheckResult,
  ConnectionTestResult,
} from '../../src/llm/providers/LLMProvider';

// 创建模拟 Provider 工厂
function createMockProvider(config: ProviderConfig): LLMProvider {
  return {
    metadata: {
      id: config.id,
      name: config.name || config.modelName,
      type: config.type,
      modelName: config.modelName,
      capabilities: {
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        supportsJSONMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      isActive: true,
      isDefault: config.isDefault || false,
    },

    async chat(): Promise<ChatResponse> {
      return {
        content: `Mock response from ${config.modelName}`,
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
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

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  describe('Factory Registration', () => {
    it('should register a factory', () => {
      registry.registerFactory('mock', createMockProvider);

      expect(registry.hasFactory('mock')).toBe(true);
      expect(registry.getAvailableTypes()).toContain('mock');
    });

    it('should register multiple factories', () => {
      registry.registerFactory('mock1', createMockProvider);
      registry.registerFactory('mock2', createMockProvider);

      expect(registry.getAvailableTypes()).toHaveLength(2);
      expect(registry.getAvailableTypes()).toContain('mock1');
      expect(registry.getAvailableTypes()).toContain('mock2');
    });

    it('should overwrite existing factory', () => {
      const factory1 = jest.fn(createMockProvider);
      const factory2 = jest.fn(createMockProvider);

      registry.registerFactory('mock', factory1);
      registry.registerFactory('mock', factory2);

      // 添加 Provider 应该使用最新的工厂
      registry.addProvider({
        id: 'test',
        type: 'mock',
        modelName: 'test-model',
      });

      expect(factory2).toHaveBeenCalled();
      expect(factory1).not.toHaveBeenCalled();
    });

    it('should unregister a factory', () => {
      registry.registerFactory('mock', createMockProvider);
      expect(registry.hasFactory('mock')).toBe(true);

      const result = registry.unregisterFactory('mock');
      expect(result).toBe(true);
      expect(registry.hasFactory('mock')).toBe(false);
    });

    it('should return false when unregistering non-existent factory', () => {
      const result = registry.unregisterFactory('non-existent');
      expect(result).toBe(false);
    });

    it('should return empty array when no factories registered', () => {
      expect(registry.getAvailableTypes()).toEqual([]);
    });
  });

  describe('Provider Management', () => {
    beforeEach(() => {
      registry.registerFactory('mock', createMockProvider);
    });

    it('should add a provider', () => {
      const provider = registry.addProvider({
        id: 'test-provider',
        type: 'mock',
        modelName: 'test-model',
      });

      expect(provider).toBeDefined();
      expect(provider.metadata.id).toBe('test-provider');
      expect(registry.has('test-provider')).toBe(true);
    });

    it('should throw error when adding provider with unregistered type', () => {
      expect(() => {
        registry.addProvider({
          id: 'test',
          type: 'unregistered',
          modelName: 'test-model',
        });
      }).toThrow(ProviderTypeNotFoundError);
    });

    it('should remove a provider', () => {
      registry.addProvider({
        id: 'test-provider',
        type: 'mock',
        modelName: 'test-model',
      });

      const result = registry.removeProvider('test-provider');
      expect(result).toBe(true);
      expect(registry.has('test-provider')).toBe(false);
    });

    it('should return false when removing non-existent provider', () => {
      const result = registry.removeProvider('non-existent');
      expect(result).toBe(false);
    });

    it('should get a provider by id', () => {
      registry.addProvider({
        id: 'test-provider',
        type: 'mock',
        modelName: 'test-model',
      });

      const provider = registry.get('test-provider');
      expect(provider.metadata.id).toBe('test-provider');
    });

    it('should throw error when getting non-existent provider', () => {
      expect(() => {
        registry.get('non-existent');
      }).toThrow(ProviderNotFoundError);
    });

    it('should get provider optionally', () => {
      registry.addProvider({
        id: 'test-provider',
        type: 'mock',
        modelName: 'test-model',
      });

      const existing = registry.getOptional('test-provider');
      expect(existing).toBeDefined();

      const nonExisting = registry.getOptional('non-existent');
      expect(nonExisting).toBeUndefined();
    });

    it('should clear all providers', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
      });
      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
      });

      expect(registry.size()).toBe(2);

      registry.clear();

      expect(registry.size()).toBe(0);
      expect(registry.getDefaultId()).toBeNull();
    });
  });

  describe('Default Provider', () => {
    beforeEach(() => {
      registry.registerFactory('mock', createMockProvider);
    });

    it('should set first provider as default automatically', () => {
      registry.addProvider({
        id: 'first-provider',
        type: 'mock',
        modelName: 'model-1',
      });

      expect(registry.getDefaultId()).toBe('first-provider');
    });

    it('should respect isDefault flag', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
      });

      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
        isDefault: true,
      });

      expect(registry.getDefaultId()).toBe('provider-2');
    });

    it('should set default provider explicitly', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
      });

      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
      });

      registry.setDefault('provider-2');
      expect(registry.getDefaultId()).toBe('provider-2');
    });

    it('should throw error when setting non-existent provider as default', () => {
      expect(() => {
        registry.setDefault('non-existent');
      }).toThrow(ProviderNotFoundError);
    });

    it('should throw error when getting default without providers', () => {
      expect(() => {
        registry.getDefault();
      }).toThrow(NoDefaultProviderError);
    });

    it('should get default provider', () => {
      registry.addProvider({
        id: 'default-provider',
        type: 'mock',
        modelName: 'model-1',
        isDefault: true,
      });

      const defaultProvider = registry.getDefault();
      expect(defaultProvider.metadata.id).toBe('default-provider');
    });

    it('should update default when removing default provider', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
        isDefault: true,
      });

      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
      });

      registry.removeProvider('provider-1');

      expect(registry.getDefaultId()).toBe('provider-2');
    });

    it('should set default to null when removing last provider', () => {
      registry.addProvider({
        id: 'only-provider',
        type: 'mock',
        modelName: 'model-1',
      });

      registry.removeProvider('only-provider');

      expect(registry.getDefaultId()).toBeNull();
    });
  });

  describe('Provider Listing', () => {
    beforeEach(() => {
      registry.registerFactory('mock', createMockProvider);
    });

    it('should list all providers', () => {
      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
        name: 'Provider One',
      });

      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
        name: 'Provider Two',
      });

      const list = registry.list();

      expect(list).toHaveLength(2);
      expect(list.map((p) => p.id)).toContain('provider-1');
      expect(list.map((p) => p.id)).toContain('provider-2');
    });

    it('should return empty array when no providers', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should list providers by type', () => {
      // Register another factory
      registry.registerFactory('another', createMockProvider);

      registry.addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'model-1',
      });

      registry.addProvider({
        id: 'mock-2',
        type: 'mock',
        modelName: 'model-2',
      });

      registry.addProvider({
        id: 'another-1',
        type: 'another',
        modelName: 'model-3',
      });

      const mockProviders = registry.listByType('mock');
      const anotherProviders = registry.listByType('another');

      expect(mockProviders).toHaveLength(2);
      expect(anotherProviders).toHaveLength(1);
    });

    it('should return empty array for non-existent type', () => {
      expect(registry.listByType('non-existent' as any)).toEqual([]);
    });

    it('should return correct size', () => {
      expect(registry.size()).toBe(0);

      registry.addProvider({
        id: 'provider-1',
        type: 'mock',
        modelName: 'model-1',
      });

      expect(registry.size()).toBe(1);

      registry.addProvider({
        id: 'provider-2',
        type: 'mock',
        modelName: 'model-2',
      });

      expect(registry.size()).toBe(2);
    });
  });

  describe('Provider Usage', () => {
    beforeEach(() => {
      registry.registerFactory('mock', createMockProvider);
    });

    it('should use provider for chat', async () => {
      registry.addProvider({
        id: 'chat-provider',
        type: 'mock',
        modelName: 'chat-model',
      });

      const provider = registry.get('chat-provider');
      const response = await provider.chat([
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.content).toContain('chat-model');
    });

    it('should use provider for streaming', async () => {
      registry.addProvider({
        id: 'stream-provider',
        type: 'mock',
        modelName: 'stream-model',
      });

      const provider = registry.get('stream-provider');
      const chunks: ChatResponseChunk[] = [];

      for await (const chunk of provider.chatStream([])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should use default provider', async () => {
      registry.addProvider({
        id: 'default-chat',
        type: 'mock',
        modelName: 'default-model',
        isDefault: true,
      });

      const defaultProvider = registry.getDefault();
      const response = await defaultProvider.chat([
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.model).toBe('default-model');
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error message for unknown provider type', () => {
      expect(() => {
        registry.addProvider({
          id: 'test',
          type: 'unknown',
          modelName: 'test-model',
        });
      }).toThrow('Unknown provider type: unknown. Please register the factory first.');
    });

    it('should provide helpful error message for non-existent provider', () => {
      expect(() => {
        registry.get('non-existent');
      }).toThrow('Provider not found: non-existent');
    });

    it('should provide helpful error message when no default provider', () => {
      expect(() => {
        registry.getDefault();
      }).toThrow('No default provider set');
    });
  });

  describe('Factory Function', () => {
    it('should create registry with factory function', () => {
      const newRegistry = createModelRegistry();
      expect(newRegistry).toBeInstanceOf(ModelRegistry);
      expect(newRegistry.size()).toBe(0);
    });
  });
});
