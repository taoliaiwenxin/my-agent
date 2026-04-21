/**
 * @file Agent.test.ts
 * @description Agent 核心控制器单元测试
 *              测试覆盖：初始化、状态管理、事件、会话管理、工具注册
 * @module tests/core
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { Agent, createAgent } from '../../src/core/Agent';
import { LLMClient } from '../../src/llm/LLMClient';

describe('Agent', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, '../temp');

  /** 生成唯一的测试数据库路径 */
  const getTestDbPath = () => path.join(testDbDir, `agent-test-${Date.now()}.db`);

  /** 所有测试数据库路径 */
  const testDbPaths: string[] = [];

  /** Mock LLM 客户端 */
  let mockLLMClient: jest.Mocked<LLMClient>;

  /** 确保测试目录存在 */
  beforeAll(() => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
  });

  /** 清理所有测试数据库 */
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const dbPath of testDbPaths) {
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      } catch {
        // 忽略删除错误
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMClient = {
      chat: jest.fn(),
      chatWithTools: jest.fn(),
      chatStream: jest.fn(),
      chatWithProvider: jest.fn(),
      chatWithRetry: jest.fn(),
      getDefaultProvider: jest.fn(),
      getProvider: jest.fn(),
      listProviders: jest.fn(),
      getRegistry: jest.fn(),
      setFallbackConfig: jest.fn(),
      getFallbackConfig: jest.fn(),
      getCallLogs: jest.fn().mockReturnValue([]),
      getTokenUsageStats: jest.fn().mockReturnValue({
        totalCalls: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        successfulCalls: 0,
        failedCalls: 0,
      }),
      clearCallLogs: jest.fn(),
      registerAnthropicProvider: jest.fn(),
      registerFactory: jest.fn(),
    } as unknown as jest.Mocked<LLMClient>;
  });

  /**
   * 创建测试用的 Agent 实例
   */
  function createTestAgent(dbPath?: string): Agent {
    const agent = new Agent({
      dbPath: dbPath || getTestDbPath(),
      llmClient: mockLLMClient,
      permissionLevel: 'execute',
      allowedPaths: [process.cwd()],
      agentConfig: {
        maxIterations: 2,
        timeoutMs: 10000,
      },
    });
    testDbPaths.push(dbPath || agent['db']['dbPath']);
    return agent;
  }

  describe('初始化', () => {
    /**
     * 测试：自动初始化
     */
    it('首次调用应该自动初始化', async () => {
      const agent = createTestAgent();

      // mock LLM 响应以终止循环
      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '任务完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      const result = await agent.runTask('简单测试任务');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
    });

    /**
     * 测试：手动初始化
     */
    it('应该支持手动初始化', async () => {
      const agent = createTestAgent();

      await agent.initialize();

      // 初始化后应该能获取工具列表
      const tools = agent.getTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools).toContain('file_read');
      expect(tools).toContain('file_write');
      expect(tools).toContain('shell');
      expect(tools).toContain('terminate');

      await agent.shutdown();
    });

    /**
     * 测试：重复初始化
     */
    it('重复初始化应该无害', async () => {
      const agent = createTestAgent();

      await agent.initialize();
      await agent.initialize(); // 第二次应该直接返回

      expect(agent.getTools().length).toBeGreaterThan(0);

      await agent.shutdown();
    });
  });

  describe('任务执行', () => {
    /**
     * 测试：成功执行任务
     */
    it('应该能执行任务并返回结果', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '我来终止任务',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '任务已完成' },
          },
        ],
      });

      const result = await agent.runTask('测试任务');

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.totalIterations).toBeGreaterThanOrEqual(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.tokenUsage).toBeDefined();
    });

    /**
     * 测试：任务失败处理
     */
    it('应该处理任务执行错误', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockRejectedValue(
        new Error('API 调用失败')
      );

      const result = await agent.runTask('会失败的任务');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API 调用失败');
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('状态管理', () => {
    /**
     * 测试：初始状态
     */
    it('初始状态应该是 idle', async () => {
      const agent = createTestAgent();

      const status = agent.getStatus();
      expect(status.state).toBe('idle');
    });

    /**
     * 测试：任务执行后状态
     */
    it('任务执行后应该返回完成状态', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      await agent.runTask('测试任务');

      const status = agent.getStatus();
      expect(status.state).toBe('completed');
    });
  });

  describe('会话管理', () => {
    /**
     * 测试：获取会话历史
     */
    it('应该能获取会话历史', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      await agent.runTask('任务1');
      await agent.runTask('任务2');

      const history = await agent.getSessionHistory();
      expect(history.length).toBe(2);
    });

    /**
     * 测试：获取会话详情
     */
    it('应该能获取会话详情', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      const result = await agent.runTask('测试任务');
      const details = await agent.getSessionDetails(result.sessionId);

      expect(details.session).toBeDefined();
      expect(details.session?.taskDescription).toBe('测试任务');
    });
  });

  describe('事件系统', () => {
    /**
     * 测试：事件监听
     */
    it('应该发送事件', async () => {
      const agent = createTestAgent();

      const events: Array<{ type: string; sessionId: string }> = [];
      agent.onEvent((event) => {
        events.push({ type: event.type, sessionId: event.sessionId });
      });

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      await agent.runTask('测试任务');

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'session:start')).toBe(true);
      expect(events.some((e) => e.type === 'session:end')).toBe(true);
    });

    /**
     * 测试：移除事件监听
     */
    it('应该能移除事件监听', async () => {
      const agent = createTestAgent();

      const events: string[] = [];
      const listener = (event: { type: string }) => {
        events.push(event.type);
      };

      agent.onEvent(listener);
      agent.offEvent(listener);

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '完成',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 100,
        toolCalls: [
          {
            id: 'call-1',
            name: 'terminate',
            arguments: { status: 'success', message: '完成' },
          },
        ],
      });

      await agent.runTask('测试任务');

      // 移除监听器后不应该收到事件
      expect(events.length).toBe(0);
    });
  });

  describe('工具管理', () => {
    /**
     * 测试：默认工具
     */
    it('应该注册默认工具', async () => {
      const agent = createTestAgent();
      await agent.initialize();

      const tools = agent.getTools();
      expect(tools).toContain('file_read');
      expect(tools).toContain('file_write');
      expect(tools).toContain('shell');
      expect(tools).toContain('terminate');

      await agent.shutdown();
    });
  });

  describe('Token 统计', () => {
    /**
     * 测试：获取 Token 统计
     */
    it('应该能获取 Token 使用统计', async () => {
      const agent = createTestAgent();

      const stats = agent.getTokenUsageStats();
      expect(stats).toBeDefined();
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe('关闭', () => {
    /**
     * 测试：正常关闭
     */
    it('应该能正常关闭', async () => {
      const agent = createTestAgent();
      await agent.initialize();

      await agent.shutdown();

      // 关闭后状态应该重置
      const status = agent.getStatus();
      expect(status.state).toBe('idle');
    });
  });

  describe('便捷函数', () => {
    /**
     * 测试：createAgent
     */
    it('createAgent 应该创建正确实例', async () => {
      const agent = createAgent({
        dbPath: getTestDbPath(),
        llmClient: mockLLMClient,
      });

      expect(agent).toBeInstanceOf(Agent);

      await agent.initialize();
      await agent.shutdown();
    });
  });
});
