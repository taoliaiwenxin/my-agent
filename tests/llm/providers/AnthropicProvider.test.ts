/**
 * @file AnthropicProvider.test.ts
 * @description AnthropicProvider 测试文件
 *              使用 mock 测试 Anthropic API 交互
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-17
 */

import { AnthropicProvider, createAnthropicProvider } from '../../../src/llm/providers/AnthropicProvider';
import { ProviderConfig } from '../../../src/llm/providers/LLMProvider';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('AnthropicProvider', () => {
  let mockCreate: jest.Mock;

  const mockConfig: ProviderConfig = {
    id: 'claude-test',
    type: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    apiKey: 'sk-test-api-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreate = jest.fn();

    MockedAnthropic.mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    }) as unknown as Anthropic);
  });

  describe('Constructor', () => {
    it('should create provider with valid config', () => {
      const provider = new AnthropicProvider(mockConfig);

      expect(provider).toBeDefined();
      expect(provider.metadata.id).toBe('claude-test');
      expect(provider.metadata.type).toBe('anthropic');
      expect(provider.metadata.modelName).toBe('claude-3-5-sonnet-20241022');
    });

    it('should throw error without API key', () => {
      expect(() => {
        new AnthropicProvider({
          ...mockConfig,
          apiKey: undefined,
        });
      }).toThrow('Anthropic API key is required');
    });

    it('should set correct display name for known models', () => {
      const provider = new AnthropicProvider(mockConfig);
      expect(provider.metadata.name).toBe('Claude 3.5 Sonnet');
    });

    it('should use model name as display name for unknown models', () => {
      const provider = new AnthropicProvider({
        ...mockConfig,
        modelName: 'claude-unknown-model',
      });
      expect(provider.metadata.name).toBe('claude-unknown-model');
    });

    it('should use provided name if available', () => {
      const provider = new AnthropicProvider({
        ...mockConfig,
        name: 'My Custom Name',
      });
      expect(provider.metadata.name).toBe('My Custom Name');
    });

    it('should detect capabilities correctly for vision models', () => {
      const provider = new AnthropicProvider(mockConfig);
      expect(provider.metadata.capabilities.supportsVision).toBe(true);
      expect(provider.metadata.capabilities.supportsTools).toBe(true);
      expect(provider.metadata.capabilities.supportsStreaming).toBe(true);
    });

    it('should set isDefault from config', () => {
      const provider = new AnthropicProvider({
        ...mockConfig,
        isDefault: true,
      });
      expect(provider.metadata.isDefault).toBe(true);
    });
  });

  describe('chat', () => {
    it('should send chat request and return response', async () => {
      const provider = new AnthropicProvider(mockConfig);

      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          { type: 'text', text: 'Hello! How can I help you?' },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const response = await provider.chat([
        { role: 'user', content: 'Hello!' },
      ]);

      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(response.model).toBe('claude-3-5-sonnet-20241022');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool calls in response', async () => {
      const provider = new AnthropicProvider(mockConfig);

      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'file_read',
            input: { path: './test.txt' },
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const response = await provider.chat([
        { role: 'user', content: 'Read the file' },
      ]);

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0].name).toBe('file_read');
      expect(response.toolCalls?.[0].arguments).toEqual({ path: './test.txt' });
    });

    it('should handle mixed text and tool content', async () => {
      const provider = new AnthropicProvider(mockConfig);

      const mockResponse = {
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          { type: 'text', text: 'I will help you read the file.' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'file_read',
            input: { path: './test.txt' },
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse as any);

      const response = await provider.chat([
        { role: 'user', content: 'Read the file' },
      ]);

      expect(response.content).toBe('I will help you read the file.');
      expect(response.toolCalls).toHaveLength(1);
    });

    it('should pass options to API', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockResolvedValue({
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      } as any);

      await provider.chat(
        [{ role: 'user', content: 'Hello' }],
        {
          temperature: 0.5,
          maxTokens: 1000,
          topP: 0.9,
          stopSequences: ['END'],
        }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1000,
          top_p: 0.9,
          stop_sequences: ['END'],
        })
      );
    });

    it('should pass tools to API', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockResolvedValue({
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      } as any);

      await provider.chat(
        [{ role: 'user', content: 'Hello' }],
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

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'file_read',
              description: 'Read a file',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        })
      );
    });

    it('should handle API errors', async () => {
      const provider = new AnthropicProvider(mockConfig);

      // Create an APIError-like object
      const apiError = Object.assign(new Error('API Error'), {
        status: 401,
        name: 'APIError',
      });
      mockCreate.mockRejectedValue(apiError);

      await expect(
        provider.chat([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Anthropic API Error');
    });

    it('should handle multimodal messages', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockResolvedValue({
        id: 'msg_123',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'I see the image.' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      } as any);

      await provider.chat([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', imageUrl: { url: 'https://example.com/image.png' } },
          ],
        },
      ]);

      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('chatStream', () => {
    it('should stream response chunks', async () => {
      const provider = new AnthropicProvider(mockConfig);

      const mockStream = [
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' World' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockStream) {
            yield chunk;
          }
        },
      } as any);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3); // 2 text chunks + 1 complete
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[1].content).toBe(' World');
      expect(chunks[2].isComplete).toBe(true);
    });

    it('should enable streaming in request', async () => {
      const provider = new AnthropicProvider(mockConfig);

      const mockStream: any[] = [];
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockStream) {
            yield chunk;
          }
        },
      } as any);

      for await (const _ of provider.chatStream([{ role: 'user', content: 'Hi' }])) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true })
      );
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for known models', () => {
      const provider = new AnthropicProvider(mockConfig);

      // Sonnet pricing: input $3.0/M, output $15.0/M
      const cost = provider.calculateCost(1000000, 1000000);

      expect(cost).toBe(18.0); // 3.0 + 15.0
    });

    it('should calculate cost for Haiku', () => {
      const provider = new AnthropicProvider({
        ...mockConfig,
        modelName: 'claude-3-haiku-20240307',
      });

      // Haiku pricing: input $0.25/M, output $1.25/M
      const cost = provider.calculateCost(1000000, 1000000);

      expect(cost).toBe(1.5); // 0.25 + 1.25
    });

    it('should use default pricing for unknown models', () => {
      const provider = new AnthropicProvider({
        ...mockConfig,
        modelName: 'unknown-model',
      });

      // Should use Sonnet pricing as default
      const cost = provider.calculateCost(1000000, 1000000);

      expect(cost).toBe(18.0); // Sonnet pricing
    });

    it('should calculate small token costs correctly', () => {
      const provider = new AnthropicProvider(mockConfig);

      // 1000 input, 500 output tokens
      const cost = provider.calculateCost(1000, 500);

      // (1000/1M * 3.0) + (500/1M * 15.0) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });
  });

  describe('healthCheck', () => {
    it('should return ok when API is healthy', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockResolvedValue({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hi' }],
      } as any);

      const result = await provider.healthCheck();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should return error when API fails', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockRejectedValue(new Error('Connection timeout'));

      const result = await provider.healthCheck();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });

  describe('testConnection', () => {
    it('should return success for healthy connection', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockResolvedValue({
        id: 'msg_123',
        content: [{ type: 'text', text: 'Hi' }],
      } as any);

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Connection successful');
    });

    it('should return failure for unhealthy connection', async () => {
      const provider = new AnthropicProvider(mockConfig);

      mockCreate.mockRejectedValue(new Error('Auth failed'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
      expect(result.message).toContain('Auth failed');
    });
  });

  describe('Factory Function', () => {
    it('should create provider with factory function', () => {
      const provider = createAnthropicProvider(mockConfig);

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.metadata.id).toBe('claude-test');
    });
  });
});
