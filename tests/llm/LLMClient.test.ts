/**
 * @file LLMClient.test.ts
 * @description LLMClient 测试文件
 * @module llm
 * @author AI Agent
 * @date 2026-04-17
 */

import { LLMClient, createLLMClient, FallbackConfig } from '../../src/llm/LLMClient';
import {
  LLMProvider,
  ProviderConfig,
  ChatResponse,
  ChatResponseChunk,
  HealthCheckResult,
  ConnectionTestResult,
} from '../../src/llm/providers/LLMProvider';

// Mock providers
function createMockProvider(id: string, name: string, supportsTools = true): LLMProvider {
  return {
    metadata: {
      id,
      name,
      type: 'mock',
      modelName: `model-${id}`,
      capabilities: {
        supportsVision: false,
        supportsTools,
        supportsStreaming: true,
        supportsJSONMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      isActive: true,
      isDefault: false,
    },

    async chat(): Promise<ChatResponse> {
      return {
        content: `Response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        model: `model-${id}`,
        latencyMs: 100,
      };
    },

    async *chatStream(): AsyncIterable<ChatResponseChunk> {
      yield { content: 'Streaming', isComplete: false };
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

describe('LLMClient', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient();
  });

  describe('Constructor', () => {
    it('should create client with default config', () => {
      expect(client).toBeDefined();
      expect(client.getFallbackConfig().enabled).toBe(true);
    });

    it('should create client with custom fallback config', () => {
      const customClient = new LLMClient({
        fallbackConfig: { enabled: false, maxRetries: 5, retryDelayMs: 2000, fallbackProviderIds: [] },
      });

      expect(customClient.getFallbackConfig().enabled).toBe(false);
      expect(customClient.getFallbackConfig().maxRetries).toBe(5);
    });

    it('should create client with factory function', () => {
      const newClient = createLLMClient();
      expect(newClient).toBeInstanceOf(LLMClient);
    });
  });

  describe('Provider Registration', () => {
    it('should register custom factory', () => {
      const factory = jest.fn((config: ProviderConfig) => createMockProvider(config.id, config.name || config.id));

      client.registerFactory('custom', factory);
      client.getRegistry().addProvider({
        id: 'custom-1',
        type: 'custom',
        modelName: 'custom-model',
      });

      expect(factory).toHaveBeenCalled();
    });

    it('should get default provider', () => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id));
      client.getRegistry().addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'mock-model',
      });

      const provider = client.getDefaultProvider();
      expect(provider.metadata.id).toBe('mock-1');
    });

    it('should get provider by id', () => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id));
      client.getRegistry().addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'mock-model',
      });

      const provider = client.getProvider('mock-1');
      expect(provider.metadata.id).toBe('mock-1');
    });

    it('should list providers', () => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id));
      client.getRegistry().addProvider({ id: 'mock-1', type: 'mock', modelName: 'model-1' });
      client.getRegistry().addProvider({ id: 'mock-2', type: 'mock', modelName: 'model-2' });

      const providers = client.listProviders();
      expect(providers).toHaveLength(2);
    });
  });

  describe('chat', () => {
    beforeEach(() => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id));
      client.getRegistry().addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'mock-model',
      });
    });

    it('should chat with default provider', async () => {
      const response = await client.chat([{ role: 'user', content: 'Hello' }]);

      expect(response.content).toBe('Response from mock-1');
      expect(response.usage.totalTokens).toBe(20);
    });

    it('should chat with specific provider', async () => {
      client.getRegistry().addProvider({
        id: 'mock-2',
        type: 'mock',
        modelName: 'mock-model-2',
      });

      const response = await client.chatWithProvider('mock-2', [
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.content).toBe('Response from mock-2');
    });
  });

  describe('chatStream', () => {
    beforeEach(() => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id));
      client.getRegistry().addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'mock-model',
      });
    });

    it('should stream responses', async () => {
      const chunks: ChatResponseChunk[] = [];

      for await (const chunk of client.chatStream([{ role: 'user', content: 'Hello' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Streaming');
      expect(chunks[1].isComplete).toBe(true);
    });
  });

  describe('chatWithTools', () => {
    beforeEach(() => {
      client.registerFactory('mock', (config) => createMockProvider(config.id, config.name || config.id, true));
      client.getRegistry().addProvider({
        id: 'mock-1',
        type: 'mock',
        modelName: 'mock-model',
      });
    });

    it('should chat with tools', async () => {
      const tools = [
        {
          name: 'file_read',
          description: 'Read a file',
          parameters: { type: 'object' as const, properties: {} },
        },
      ];

      const response = await client.chatWithTools(
        [{ role: 'user', content: 'Read file' }],
        tools
      );

      expect(response.content).toBe('Response from mock-1');
    });
  });

  describe('chatWithRetry', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const mockProvider: LLMProvider = {
        ...createMockProvider('retry-test', 'Retry Test'),
        async chat(): Promise<ChatResponse> {
          attempts++;
          if (attempts < 2) {
            throw new Error('Temporary error');
          }
          return {
            content: 'Success after retry',
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            model: 'test',
            latencyMs: 100,
          };
        },
      };

      client.registerFactory('retry', () => mockProvider);
      client.getRegistry().addProvider({ id: 'retry-test', type: 'retry', modelName: 'test' });

      const response = await client.chatWithRetry(
        [{ role: 'user', content: 'Hello' }],
        {},
        3
      );

      expect(attempts).toBe(2);
      expect(response.content).toBe('Success after retry');
    });

    it('should throw after max retries', async () => {
      const mockProvider: LLMProvider = {
        ...createMockProvider('fail-test', 'Fail Test'),
        async chat(): Promise<ChatResponse> {
          throw new Error('Persistent error');
        },
      };

      client.registerFactory('fail', () => mockProvider);
      client.getRegistry().addProvider({ id: 'fail-test', type: 'fail', modelName: 'test' });

      await expect(
        client.chatWithRetry([{ role: 'user', content: 'Hello' }], {}, 2)
      ).rejects.toThrow('Persistent error');
    });
  });

  describe('Fallback Config', () => {
    it('should set fallback config', () => {
      const newConfig: Partial<FallbackConfig> = {
        enabled: false,
        maxRetries: 5,
      };

      client.setFallbackConfig(newConfig);

      expect(client.getFallbackConfig().enabled).toBe(false);
      expect(client.getFallbackConfig().maxRetries).toBe(5);
    });

    it('should get fallback config', () => {
      const config = client.getFallbackConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('maxRetries');
      expect(config).toHaveProperty('retryDelayMs');
      expect(config).toHaveProperty('fallbackProviderIds');
    });
  });

  describe('Call Logs', () => {
    it('should start with empty logs', () => {
      expect(client.getCallLogs()).toEqual([]);
    });

    it('should get token usage stats', () => {
      const stats = client.getTokenUsageStats();

      expect(stats.totalCalls).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCostUsd).toBe(0);
    });

    it('should clear call logs', () => {
      // 添加一些日志（通过模拟内部状态）
      client.clearCallLogs();

      expect(client.getCallLogs()).toEqual([]);
    });
  });

  describe('Registry Access', () => {
    it('should provide access to registry', () => {
      const registry = client.getRegistry();

      expect(registry).toBeDefined();
      expect(typeof registry.addProvider).toBe('function');
    });
  });
});
