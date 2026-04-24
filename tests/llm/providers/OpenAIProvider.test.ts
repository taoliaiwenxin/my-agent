/**
 * @file OpenAIProvider.test.ts
 * @description OpenAIProvider 测试文件
 *              使用 mock 测试 OpenAI Provider 的所有功能
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-22
 */

import { OpenAIProvider, createOpenAIProvider } from '../../../src/llm/providers/OpenAIProvider';
import { ProviderConfig } from '../../../src/llm/providers/LLMProvider';

// Mock OpenAI SDK
const mockCreate = jest.fn();
const mockChatCompletions = {
  create: mockCreate,
};

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: mockChatCompletions,
    },
  }));
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  const mockApiKey = 'sk-test-openai-key';

  beforeEach(() => {
    jest.clearAllMocks();

    provider = new OpenAIProvider({
      id: 'gpt-4o-test',
      type: 'openai',
      modelName: 'gpt-4o',
      apiKey: mockApiKey,
      name: 'Test GPT-4o',
    });
  });

  describe('Constructor', () => {
    it('should create provider with valid config', () => {
      expect(provider).toBeDefined();
      expect(provider.metadata.id).toBe('gpt-4o-test');
      expect(provider.metadata.name).toBe('Test GPT-4o');
      expect(provider.metadata.type).toBe('openai');
      expect(provider.metadata.modelName).toBe('gpt-4o');
      expect(provider.metadata.isActive).toBe(true);
      expect(provider.metadata.isDefault).toBe(false);
    });

    it('should throw error when api key is missing', () => {
      expect(() => {
        new OpenAIProvider({
          id: 'test',
          type: 'openai',
          modelName: 'gpt-4o',
        } as ProviderConfig);
      }).toThrow('OpenAI API key is required');
    });

    it('should generate display name from model name', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o-mini',
        apiKey: mockApiKey,
      });

      expect(p.metadata.name).toBe('GPT-4o Mini');
    });

    it('should use model name as display name fallback', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'custom-model',
        apiKey: mockApiKey,
      });

      expect(p.metadata.name).toBe('custom-model');
    });

    it('should respect isDefault flag', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o',
        apiKey: mockApiKey,
        isDefault: true,
      });

      expect(p.metadata.isDefault).toBe(true);
    });
  });

  describe('Model Capabilities', () => {
    it('should detect vision capability for gpt-4o', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.supportsVision).toBe(true);
      expect(p.metadata.capabilities.supportsTools).toBe(true);
      expect(p.metadata.capabilities.supportsStreaming).toBe(true);
      expect(p.metadata.capabilities.supportsJSONMode).toBe(true);
    });

    it('should detect vision capability for gpt-4o-mini', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o-mini',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.supportsVision).toBe(true);
    });

    it('should not detect vision capability for gpt-3.5-turbo', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-3.5-turbo',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.supportsVision).toBe(false);
    });

    it('should detect correct context window for gpt-4o', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.contextWindow).toBe(128000);
      expect(p.metadata.capabilities.maxTokens).toBe(16384);
    });

    it('should detect correct context window for gpt-4', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.contextWindow).toBe(8192);
      expect(p.metadata.capabilities.maxTokens).toBe(8192);
    });

    it('should detect correct context window for gpt-3.5-turbo', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-3.5-turbo',
        apiKey: mockApiKey,
      });

      expect(p.metadata.capabilities.contextWindow).toBe(16385);
      expect(p.metadata.capabilities.maxTokens).toBe(4096);
    });
  });

  describe('chat', () => {
    it('should call OpenAI API with correct parameters', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      });

      const response = await provider.chat([
        { role: 'user', content: 'Hello!' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hello!' }],
          max_tokens: 4096,
        })
      );

      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(8);
      expect(response.usage.totalTokens).toBe(18);
      expect(response.model).toBe('gpt-4o');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle chat with system message', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Understood.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22 },
      });

      await provider.chat([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
        })
      );
    });

    it('should handle chat options', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });

      await provider.chat(
        [{ role: 'user', content: 'Hello!' }],
        {
          temperature: 0.5,
          maxTokens: 100,
          topP: 0.9,
          stopSequences: ['STOP'],
        }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 100,
          top_p: 0.9,
          stop: ['STOP'],
        })
      );
    });

    it('should handle tool calls in response', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'file_read',
                    arguments: '{"path": "/test.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      });

      const response = await provider.chat(
        [{ role: 'user', content: 'Read file' }],
        {
          tools: [
            {
              name: 'file_read',
              description: 'Read a file',
              parameters: { type: 'object', properties: {} },
            },
          ],
        }
      );

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].id).toBe('call_123');
      expect(response.toolCalls![0].name).toBe('file_read');
      expect(response.toolCalls![0].arguments).toEqual({ path: '/test.txt' });
    });

    it('should handle empty content in response', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
      });

      const response = await provider.chat([{ role: 'user', content: 'Hello!' }]);

      expect(response.content).toBe('');
    });

    it('should throw error on API failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      await expect(
        provider.chat([{ role: 'user', content: 'Hello!' }])
      ).rejects.toThrow();
    });
  });

  describe('chatStream', () => {
    it('should stream responses', async () => {
      async function* mockStream() {
        yield {
          id: 'chatcmpl-test',
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
        };
        yield {
          id: 'chatcmpl-test',
          choices: [{ delta: { content: ' world' }, index: 0 }],
        };
        yield {
          id: 'chatcmpl-test',
          choices: [{ delta: {}, index: 0 }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        };
      }

      mockCreate.mockResolvedValueOnce(mockStream());

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'Hello!' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[0].isComplete).toBe(false);
      expect(chunks[1].content).toBe(' world');
      expect(chunks[1].isComplete).toBe(false);
      expect(chunks[2].isComplete).toBe(true);
      expect(chunks[2].usage).toEqual({
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
      });
    });

    it('should set stream parameter', async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: 'Test' }, index: 0 }] };
        yield { choices: [{ delta: {}, index: 0 }] };
      }

      mockCreate.mockResolvedValueOnce(mockStream());

      for await (const _ of provider.chatStream([{ role: 'user', content: 'Hi!' }])) {
        // consume stream
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        })
      );
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for gpt-4o', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o',
        apiKey: mockApiKey,
      });

      const cost = p.calculateCost(1000000, 1000000);
      // input: $2.5, output: $10.0
      expect(cost).toBe(12.5);
    });

    it('should calculate cost for gpt-4o-mini', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-4o-mini',
        apiKey: mockApiKey,
      });

      const cost = p.calculateCost(1000000, 1000000);
      // input: $0.15, output: $0.6
      expect(cost).toBe(0.75);
    });

    it('should calculate cost for gpt-3.5-turbo', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'gpt-3.5-turbo',
        apiKey: mockApiKey,
      });

      const cost = p.calculateCost(1000000, 1000000);
      // input: $0.5, output: $1.5
      expect(cost).toBe(2.0);
    });

    it('should use default pricing for unknown model', () => {
      const p = new OpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: 'unknown-model',
        apiKey: mockApiKey,
      });

      const cost = p.calculateCost(1000000, 1000000);
      // default (gpt-4o pricing): $2.5 + $10.0
      expect(cost).toBe(12.5);
    });

    it('should handle zero tokens', () => {
      const cost = provider.calculateCost(0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return ok on success', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await provider.healthCheck();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error on failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.healthCheck();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('testConnection', () => {
    it('should return success message', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connection successful');
    });

    it('should return failure message', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
    });
  });

  describe('Factory Function', () => {
    it('should create provider with factory function', () => {
      const p = createOpenAIProvider({
        id: 'factory-test',
        type: 'openai',
        modelName: 'gpt-4o',
        apiKey: mockApiKey,
      });

      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.metadata.id).toBe('factory-test');
    });
  });
});
