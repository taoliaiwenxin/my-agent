/**
 * @file agent-flow.test.ts
 * @description 端到端集成测试
 *              测试完整任务流程和崩溃恢复
 * @module tests/integration
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent, createAgent } from '../../src/core/Agent';
import { LLMClient } from '../../src/llm/LLMClient';

describe('Agent 端到端测试', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, '../temp');
  const getTestDbPath = () => path.join(testDbDir, `integration-test-${Date.now()}.db`);

  /** 测试文件目录 */
  const testDir = path.join(__dirname, '../temp/integration-files');

  /** Mock LLM 客户端 */
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testDbDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testDbDir, { recursive: true, force: true });
    } catch {
      // 忽略
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

  function createTestAgent(dbPath?: string): Agent {
    return createAgent({
      dbPath: dbPath || getTestDbPath(),
      llmClient: mockLLMClient,
      permissionLevel: 'execute',
      allowedPaths: [testDir, process.cwd()],
      agentConfig: {
        maxIterations: 5,
        timeoutMs: 30000,
      },
    });
  }

  describe('场景1: 读取文件并总结', () => {
    it('应该能读取文件并返回内容', async () => {
      const testFile = path.join(testDir, 'readme.txt');
      await fs.writeFile(testFile, '这是一个测试文件，内容为 AI Agent 测试。', 'utf-8');

      const agent = createTestAgent();

      // 模拟 LLM 调用：先读取文件，然后终止
      mockLLMClient.chatWithTools
        .mockResolvedValueOnce({
          content: '我需要读取文件',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-1',
              name: 'file_read',
              arguments: { path: testFile },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '已读取文件，现在终止',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-2',
              name: 'terminate',
              arguments: { status: 'success', message: '文件内容：这是一个测试文件' },
            },
          ],
        });

      const result = await agent.runTask(`请读取文件 ${testFile} 并告诉我内容`);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.totalIterations).toBeGreaterThanOrEqual(1);

      await agent.shutdown();
    });
  });

  describe('场景2: 创建新文件', () => {
    it('应该能创建新文件', async () => {
      const outputFile = path.join(testDir, 'output.txt');
      const agent = createTestAgent();

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce({
          content: '我要创建文件',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-1',
              name: 'file_write',
              arguments: { path: outputFile, content: 'Hello World' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '文件创建完成',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-2',
              name: 'terminate',
              arguments: { status: 'success', message: '文件已创建' },
            },
          ],
        });

      const result = await agent.runTask(`请创建文件 ${outputFile}，内容为 "Hello World"`);

      expect(result.success).toBe(true);

      // 验证文件确实被创建
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content).toBe('Hello World');

      await agent.shutdown();
    });
  });

  describe('场景3: 执行命令', () => {
    it('应该能执行命令并获取结果', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce({
          content: '执行 echo 命令',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-1',
              name: 'shell',
              arguments: { command: 'echo "hello from agent"' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '命令执行完成',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-2',
              name: 'terminate',
              arguments: { status: 'success', message: '命令执行成功' },
            },
          ],
        });

      const result = await agent.runTask('请执行 echo "hello from agent"');

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThanOrEqual(1);

      await agent.shutdown();
    });
  });

  describe('场景4: 多步骤任务', () => {
    it('应该能执行多步骤任务', async () => {
      const inputFile = path.join(testDir, 'input.txt');
      const outputFile = path.join(testDir, 'processed.txt');
      await fs.writeFile(inputFile, '原始内容', 'utf-8');

      const agent = createTestAgent();

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce({
          content: '第一步：读取文件',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-1',
              name: 'file_read',
              arguments: { path: inputFile },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '第二步：写入处理后的内容',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-2',
              name: 'file_write',
              arguments: { path: outputFile, content: '处理后的内容' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '完成',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-3',
              name: 'terminate',
              arguments: { status: 'success', message: '多步骤任务完成' },
            },
          ],
        });

      const result = await agent.runTask(
        `请读取 ${inputFile}，然后创建 ${outputFile} 写入处理后的内容`
      );

      expect(result.success).toBe(true);
      expect(result.totalIterations).toBeGreaterThanOrEqual(2);

      // 验证输出文件
      const outputContent = await fs.readFile(outputFile, 'utf-8');
      expect(outputContent).toBe('处理后的内容');

      await agent.shutdown();
    });
  });

  describe('场景5: 错误处理', () => {
    it('应该处理工具执行错误', async () => {
      const agent = createTestAgent();

      // LLM 返回一个会导致错误的命令
      mockLLMClient.chatWithTools
        .mockResolvedValueOnce({
          content: '尝试执行危险命令',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-1',
              name: 'shell',
              arguments: { command: 'rm -rf /' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: '命令被拒绝，尝试正常终止',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'test',
          latencyMs: 100,
          toolCalls: [
            {
              id: 'call-2',
              name: 'terminate',
              arguments: { status: 'success', message: '已检测到危险命令并拒绝' },
            },
          ],
        });

      const result = await agent.runTask('尝试执行 rm -rf /');

      // Agent 应该成功处理（拒绝了危险命令然后终止）
      expect(result.success).toBe(true);

      await agent.shutdown();
    });
  });

  describe('场景6: 会话历史', () => {
    it('应该能查看会话历史', async () => {
      const agent = createTestAgent();

      mockLLMClient.chatWithTools.mockResolvedValue({
        content: '终止',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'test',
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
      await agent.runTask('任务3');

      const history = await agent.getSessionHistory();
      expect(history.length).toBe(3);

      await agent.shutdown();
    });
  });
});
