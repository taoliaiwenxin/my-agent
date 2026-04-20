/**
 * @file ReActLoop.test.ts
 * @description ReActLoop 单元测试
 */

import { ReActLoop, createReActLoop } from '../../src/core/ReActLoop';
import { LLMClient } from '../../src/llm/LLMClient';
import { ToolExecutor } from '../../src/tools/ToolExecutor';
import { MemorySystem } from '../../src/memory/MemorySystem';
import { WorkingMemory } from '../../src/memory/WorkingMemory';
import { SQLiteClient } from '../../src/memory/SQLiteClient';
import { ChatResponse } from '../../src/types';

// Mock 依赖
jest.mock('../../src/llm/LLMClient');
jest.mock('../../src/tools/ToolExecutor');
jest.mock('../../src/memory/MemorySystem');
jest.mock('../../src/memory/WorkingMemory');

describe('ReActLoop', () => {
  let loop: ReActLoop;
  let mockLLMClient: jest.Mocked<LLMClient>;
  let mockToolExecutor: jest.Mocked<ToolExecutor>;
  let mockMemorySystem: jest.Mocked<MemorySystem>;
  let mockWorkingMemory: jest.Mocked<WorkingMemory>;
  let mockSQLiteClient: jest.Mocked<SQLiteClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSQLiteClient = {
      connect: jest.fn(),
      close: jest.fn(),
      exec: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn(),
    } as unknown as jest.Mocked<SQLiteClient>;

    mockLLMClient = {
      chat: jest.fn(),
      chatWithTools: jest.fn(),
      chatStream: jest.fn(),
      getDefaultProvider: jest.fn(),
      getRegistry: jest.fn(),
      getTokenUsageStats: jest.fn().mockReturnValue({
        totalCalls: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        successfulCalls: 0,
        failedCalls: 0,
      }),
    } as unknown as jest.Mocked<LLMClient>;

    mockToolExecutor = {
      execute: jest.fn(),
      getAllTools: jest.fn().mockReturnValue([]),
      getToolsForLLM: jest.fn().mockReturnValue([]),
      updateConfig: jest.fn(),
    } as unknown as jest.Mocked<ToolExecutor>;

    mockMemorySystem = {
      getDb: jest.fn().mockReturnValue(mockSQLiteClient),
      saveSession: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<MemorySystem>;

    mockWorkingMemory = {
      getMessages: jest.fn().mockReturnValue([]),
      addMessage: jest.fn(),
      addSystemMessage: jest.fn(),
      addUserMessage: jest.fn(),
      addAssistantMessage: jest.fn(),
      addToolMessage: jest.fn(),
      setCurrentTask: jest.fn(),
      getTokenUsage: jest.fn().mockReturnValue({ current: 0, max: 8000 }),
    } as unknown as jest.Mocked<WorkingMemory>;

    loop = new ReActLoop({
      llmClient: mockLLMClient,
      toolExecutor: mockToolExecutor,
      memorySystem: mockMemorySystem,
      maxIterations: 5,
    });
  });

  describe('基本功能', () => {
    it('应该创建实例', () => {
      expect(loop).toBeInstanceOf(ReActLoop);
    });

    it('应该通过便捷函数创建', () => {
      const l = createReActLoop({
        llmClient: mockLLMClient,
        toolExecutor: mockToolExecutor,
        memorySystem: mockMemorySystem,
      });
      expect(l).toBeInstanceOf(ReActLoop);
    });

    it('初始状态应该是未运行', () => {
      expect(loop.getIsRunning()).toBe(false);
    });
  });

  describe('run 方法', () => {
    it('应该成功完成简单任务', async () => {
      const mockResponse: ChatResponse = {
        content: 'THOUGHT: 任务完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(mockResponse);

      const result = await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('成功');
      expect(result.totalIterations).toBe(0);
    });

    it('应该执行工具调用', async () => {
      const thinkResponse: ChatResponse = {
        content: 'THOUGHT: 读取文件\nACTION: file_read\nPARAMETERS: {"path": "./test.txt"}',
        toolCalls: [
          { id: 'call-1', name: 'file_read', arguments: { path: './test.txt' } },
        ],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      const terminateResponse: ChatResponse = {
        content: 'THOUGHT: 完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce(thinkResponse)
        .mockResolvedValueOnce(terminateResponse);

      mockToolExecutor.execute.mockResolvedValue({
        success: true,
        data: '文件内容',
        executionTimeMs: 100,
      });

      const result = await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(mockToolExecutor.execute).toHaveBeenCalledWith('file_read', {
        path: './test.txt',
      });
      expect(result.success).toBe(true);
    });

    it('应该处理工具执行失败', async () => {
      const thinkResponse: ChatResponse = {
        content: 'THOUGHT: 读取文件\nACTION: file_read\nPARAMETERS: {"path": "./missing.txt"}',
        toolCalls: [
          { id: 'call-1', name: 'file_read', arguments: { path: './missing.txt' } },
        ],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      const terminateResponse: ChatResponse = {
        content: 'THOUGHT: 文件不存在，终止\nACTION: terminate\nRESULT: 失败',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce(thinkResponse)
        .mockResolvedValueOnce(terminateResponse);

      mockToolExecutor.execute.mockResolvedValue({
        success: false,
        error: '文件不存在',
        executionTimeMs: 50,
      });

      const result = await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0].observation.success).toBe(false);
    });

    it('应该在达到最大迭代次数后停止', async () => {
      const thinkResponse: ChatResponse = {
        content: 'THOUGHT: 继续\nACTION: file_read\nPARAMETERS: {"path": "./test.txt"}',
        toolCalls: [
          { id: 'call-1', name: 'file_read', arguments: { path: './test.txt' } },
        ],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(thinkResponse);
      mockToolExecutor.execute.mockResolvedValue({
        success: true,
        data: '内容',
        executionTimeMs: 100,
      });

      loop = new ReActLoop({
        llmClient: mockLLMClient,
        toolExecutor: mockToolExecutor,
        memorySystem: mockMemorySystem,
        maxIterations: 3,
      });

      const result = await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('最大迭代次数');
      expect(result.totalIterations).toBe(3);
    });

    it('不应该同时运行多个循环', async () => {
      const mockResponse: ChatResponse = {
        content: 'THOUGHT: 等待\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 1000,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(mockResponse);

      const runPromise = loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(loop.getIsRunning()).toBe(true);

      await expect(
        loop.run('session-2', mockWorkingMemory as unknown as WorkingMemory, '另一个任务')
      ).rejects.toThrow('already running');

      await runPromise;
    });
  });

  describe('事件系统', () => {
    it('应该触发事件', async () => {
      const events: string[] = [];
      const listener = (event: { type: string }) => {
        events.push(event.type);
      };

      loop.onEvent(listener);

      const mockResponse: ChatResponse = {
        content: 'THOUGHT: 完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(mockResponse);

      await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(events).toContain('iteration:start');
      expect(events).toContain('think');
      expect(events).toContain('complete');

      loop.offEvent(listener);
    });

    it('应该移除事件监听器', async () => {
      const events: string[] = [];
      const listener = (event: { type: string }) => {
        events.push(event.type);
      };

      loop.onEvent(listener);
      loop.offEvent(listener);

      const mockResponse: ChatResponse = {
        content: 'THOUGHT: 完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(mockResponse);

      await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      expect(events).toHaveLength(0);
    });
  });

  describe('Token 使用统计', () => {
    it('应该统计 Token 使用量', async () => {
      const mockResponse: ChatResponse = {
        content: 'THOUGHT: 完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools.mockResolvedValue(mockResponse);

      await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      const usage = loop.getTokenUsage();
      expect(usage.prompt).toBe(100);
      expect(usage.completion).toBe(50);
      expect(usage.total).toBe(150);
    });
  });

  describe('步骤记录', () => {
    it('应该返回已执行的步骤', async () => {
      const thinkResponse: ChatResponse = {
        content: 'THOUGHT: 读取文件\nACTION: file_read\nPARAMETERS: {"path": "./test.txt"}',
        toolCalls: [
          { id: 'call-1', name: 'file_read', arguments: { path: './test.txt' } },
        ],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      const terminateResponse: ChatResponse = {
        content: 'THOUGHT: 完成\nACTION: terminate\nRESULT: 成功',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chatWithTools
        .mockResolvedValueOnce(thinkResponse)
        .mockResolvedValueOnce(terminateResponse);

      mockToolExecutor.execute.mockResolvedValue({
        success: true,
        data: '内容',
        executionTimeMs: 100,
      });

      await loop.run(
        'session-1',
        mockWorkingMemory as unknown as WorkingMemory,
        '测试任务'
      );

      const steps = loop.getSteps();
      expect(steps.length).toBe(1);
    });
  });
});
