/**
 * @file LLMProvider.test.ts
 * @description LLMProvider 接口类型测试
 *              验证接口定义的正确性和类型兼容性
 * @module llm/providers
 * @author AI Agent
 * @date 2026-04-17
 */

import {
  ModelCapabilities,
  ProviderMetadata,
  ProviderType,
  ContentPart,
  Message,
  MessageRole,
  ToolCall,
  ToolDefinition,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  TokenUsage,
  ProviderConfig,
  LLMProvider,
  HealthCheckResult,
  ConnectionTestResult,
} from '../../../src/llm/providers/LLMProvider';

describe('LLMProvider Types', () => {
  describe('ModelCapabilities', () => {
    it('should accept valid model capabilities', () => {
      const capabilities: ModelCapabilities = {
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsJSONMode: false,
        maxTokens: 4096,
        contextWindow: 200000,
      };

      expect(capabilities.supportsVision).toBe(true);
      expect(capabilities.supportsTools).toBe(true);
      expect(capabilities.maxTokens).toBe(4096);
    });

    it('should accept minimal model capabilities', () => {
      const capabilities: ModelCapabilities = {
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        supportsJSONMode: false,
        maxTokens: 2048,
        contextWindow: 8192,
      };

      expect(capabilities.supportsVision).toBe(false);
      expect(capabilities.maxTokens).toBe(2048);
    });
  });

  describe('ProviderMetadata', () => {
    it('should accept valid provider metadata', () => {
      const metadata: ProviderMetadata = {
        id: 'claude-prod',
        name: 'Claude 3.5 Sonnet',
        type: 'anthropic',
        modelName: 'claude-3-5-sonnet-20241022',
        capabilities: {
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          supportsJSONMode: false,
          maxTokens: 4096,
          contextWindow: 200000,
        },
        isActive: true,
        isDefault: false,
      };

      expect(metadata.id).toBe('claude-prod');
      expect(metadata.type).toBe('anthropic');
      expect(metadata.isActive).toBe(true);
    });

    it('should accept all provider types', () => {
      const types: ProviderType[] = ['anthropic', 'openai', 'ollama', 'custom'];

      types.forEach((type) => {
        const metadata: ProviderMetadata = {
          id: `test-${type}`,
          name: `Test ${type}`,
          type,
          modelName: 'test-model',
          capabilities: {
            supportsVision: false,
            supportsTools: false,
            supportsStreaming: false,
            supportsJSONMode: false,
            maxTokens: 1000,
            contextWindow: 4000,
          },
          isActive: true,
          isDefault: false,
        };

        expect(metadata.type).toBe(type);
      });
    });
  });

  describe('ContentPart', () => {
    it('should accept text content part', () => {
      const part: ContentPart = {
        type: 'text',
        text: 'Hello, world!',
      };

      expect(part.type).toBe('text');
      expect(part.text).toBe('Hello, world!');
    });

    it('should accept image content part', () => {
      const part: ContentPart = {
        type: 'image_url',
        imageUrl: {
          url: 'https://example.com/image.png',
          detail: 'high',
        },
      };

      expect(part.type).toBe('image_url');
      expect(part.imageUrl?.detail).toBe('high');
    });

    it('should accept image content with auto detail', () => {
      const part: ContentPart = {
        type: 'image_url',
        imageUrl: {
          url: 'data:image/png;base64,abc123',
        },
      };

      expect(part.imageUrl?.url).toContain('base64');
    });
  });

  describe('Message', () => {
    it('should accept simple text message', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello!',
      };

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello!');
    });

    it('should accept multimodal message', () => {
      const message: Message = {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', imageUrl: { url: 'https://example.com/image.png' } },
        ],
      };

      expect(Array.isArray(message.content)).toBe(true);
      expect((message.content as ContentPart[])[0].type).toBe('text');
    });

    it('should accept message with tool calls', () => {
      const message: Message = {
        role: 'assistant',
        content: 'I will help you with that.',
        toolCalls: [
          {
            id: 'call_123',
            name: 'file_read',
            arguments: { path: './test.txt' },
          },
        ],
      };

      expect(message.toolCalls).toHaveLength(1);
      expect(message.toolCalls?.[0].name).toBe('file_read');
    });

    it('should accept tool response message', () => {
      const message: Message = {
        role: 'tool',
        content: 'File content here...',
        toolCallId: 'call_123',
      };

      expect(message.role).toBe('tool');
      expect(message.toolCallId).toBe('call_123');
    });

    it('should accept all message roles', () => {
      const roles: MessageRole[] = ['system', 'user', 'assistant', 'tool'];

      roles.forEach((role) => {
        const message: Message = {
          role,
          content: 'Test',
        };

        expect(message.role).toBe(role);
      });
    });
  });

  describe('ToolCall', () => {
    it('should accept valid tool call', () => {
      const toolCall: ToolCall = {
        id: 'call_abc123',
        name: 'file_read',
        arguments: {
          path: './test.txt',
          encoding: 'utf-8',
        },
      };

      expect(toolCall.id).toBe('call_abc123');
      expect(toolCall.name).toBe('file_read');
      expect(toolCall.arguments.path).toBe('./test.txt');
    });
  });

  describe('ToolDefinition', () => {
    it('should accept valid tool definition', () => {
      const tool: ToolDefinition = {
        name: 'file_read',
        description: 'Read a file from the filesystem',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file',
            },
            encoding: {
              type: 'string',
              description: 'File encoding',
            },
          },
          required: ['path'],
        },
      };

      expect(tool.name).toBe('file_read');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.required).toContain('path');
    });
  });

  describe('ChatOptions', () => {
    it('should accept empty options', () => {
      const options: ChatOptions = {};
      expect(Object.keys(options)).toHaveLength(0);
    });

    it('should accept full options', () => {
      const options: ChatOptions = {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
        stopSequences: ['END', 'STOP'],
        timeoutMs: 30000,
        tools: [
          {
            name: 'file_read',
            description: 'Read a file',
            parameters: { type: 'object', properties: {} },
          },
        ],
        toolChoice: 'auto',
      };

      expect(options.temperature).toBe(0.7);
      expect(options.stopSequences).toHaveLength(2);
      expect(options.toolChoice).toBe('auto');
    });

    it('should accept specific tool choice', () => {
      const options: ChatOptions = {
        toolChoice: { name: 'file_read' },
      };

      expect(options.toolChoice).toEqual({ name: 'file_read' });
    });
  });

  describe('ChatResponse', () => {
    it('should accept valid chat response', () => {
      const response: ChatResponse = {
        content: 'Hello! How can I help you today?',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        model: 'claude-3-5-sonnet-20241022',
        latencyMs: 500,
      };

      expect(response.content).toContain('Hello');
      expect(response.usage.totalTokens).toBe(30);
      expect(response.latencyMs).toBe(500);
    });

    it('should accept response with tool calls', () => {
      const response: ChatResponse = {
        content: '',
        toolCalls: [
          {
            id: 'call_123',
            name: 'file_read',
            arguments: { path: './test.txt' },
          },
        ],
        usage: {
          promptTokens: 50,
          completionTokens: 30,
          totalTokens: 80,
        },
        model: 'claude-3-opus',
        latencyMs: 1000,
      };

      expect(response.toolCalls).toHaveLength(1);
      expect(response.content).toBe('');
    });
  });

  describe('ChatResponseChunk', () => {
    it('should accept content chunk', () => {
      const chunk: ChatResponseChunk = {
        content: 'Hello',
        isComplete: false,
      };

      expect(chunk.content).toBe('Hello');
      expect(chunk.isComplete).toBe(false);
    });

    it('should accept completion chunk', () => {
      const chunk: ChatResponseChunk = {
        isComplete: true,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };

      expect(chunk.isComplete).toBe(true);
      expect(chunk.usage?.totalTokens).toBe(30);
    });

    it('should accept tool call chunk', () => {
      const chunk: ChatResponseChunk = {
        toolCall: {
          id: 'call_123',
          name: 'file_read',
        },
        isComplete: false,
      };

      expect(chunk.toolCall?.name).toBe('file_read');
    });
  });

  describe('TokenUsage', () => {
    it('should accept valid token usage', () => {
      const usage: TokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
    });
  });

  describe('ProviderConfig', () => {
    it('should accept minimal provider config', () => {
      const config: ProviderConfig = {
        id: 'claude-test',
        type: 'anthropic',
        modelName: 'claude-3-haiku-20240307',
      };

      expect(config.id).toBe('claude-test');
      expect(config.apiKey).toBeUndefined();
    });

    it('should accept full provider config', () => {
      const config: ProviderConfig = {
        id: 'claude-prod',
        type: 'anthropic',
        name: 'Claude 3.5 Sonnet',
        modelName: 'claude-3-5-sonnet-20241022',
        apiKey: 'sk-ant-api...',
        baseUrl: 'https://api.anthropic.com',
        config: {
          maxRetries: 3,
          timeout: 60000,
        },
        isDefault: true,
        priority: 1,
      };

      expect(config.isDefault).toBe(true);
      expect(config.priority).toBe(1);
      expect(config.config?.maxRetries).toBe(3);
    });
  });

  describe('HealthCheckResult', () => {
    it('should accept healthy result', () => {
      const result: HealthCheckResult = {
        ok: true,
        latencyMs: 150,
      };

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBe(150);
    });

    it('should accept unhealthy result', () => {
      const result: HealthCheckResult = {
        ok: false,
        latencyMs: 0,
        error: 'Connection refused',
      };

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('ConnectionTestResult', () => {
    it('should accept successful test', () => {
      const result: ConnectionTestResult = {
        success: true,
        message: 'Connection successful (150ms)',
      };

      expect(result.success).toBe(true);
    });

    it('should accept failed test', () => {
      const result: ConnectionTestResult = {
        success: false,
        message: 'Authentication failed',
      };

      expect(result.success).toBe(false);
    });
  });
});

describe('LLMProvider Interface Compliance', () => {
  it('should allow implementing LLMProvider interface', async () => {
    // 创建一个模拟的 Provider 实现，验证接口兼容性
    const mockProvider: LLMProvider = {
      metadata: {
        id: 'mock-provider',
        name: 'Mock Provider',
        type: 'custom',
        modelName: 'mock-model',
        capabilities: {
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: false,
          supportsJSONMode: false,
          maxTokens: 1000,
          contextWindow: 4000,
        },
        isActive: true,
        isDefault: false,
      },

      async chat(messages: Message[]): Promise<ChatResponse> {
        return {
          content: 'Mock response',
          usage: {
            promptTokens: messages.length * 10,
            completionTokens: 10,
            totalTokens: messages.length * 10 + 10,
          },
          model: 'mock-model',
          latencyMs: 100,
        };
      },

      async *chatStream(): AsyncIterable<ChatResponseChunk> {
        yield { content: 'Mock', isComplete: false };
        yield { content: ' stream', isComplete: false };
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

    // 验证 chat 方法
    const response = await mockProvider.chat([
      { role: 'user', content: 'Hello' },
    ]);
    expect(response.content).toBe('Mock response');

    // 验证流式方法
    const chunks: ChatResponseChunk[] = [];
    for await (const chunk of mockProvider.chatStream([])) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);

    // 验证成本计算
    const cost = mockProvider.calculateCost(100, 50);
    expect(cost).toBe(0.0015);

    // 验证健康检查
    const health = await mockProvider.healthCheck();
    expect(health.ok).toBe(true);

    // 验证连接测试
    const connection = await mockProvider.testConnection();
    expect(connection.success).toBe(true);
  });
});
