/**
 * @file Planner.test.ts
 * @description Planner 单元测试
 */

import { Planner, createPlanner } from '../../src/planner/Planner';
import { LLMClient } from '../../src/llm/LLMClient';
import { ChatResponse } from '../../src/types';

// Mock LLMClient
jest.mock('../../src/llm/LLMClient');

describe('Planner', () => {
  let planner: Planner;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMClient = {
      chat: jest.fn(),
      chatWithTools: jest.fn(),
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

    planner = new Planner({
      llmClient: mockLLMClient,
      maxSteps: 10,
    });
  });

  describe('基本功能', () => {
    it('应该创建实例', () => {
      expect(planner).toBeInstanceOf(Planner);
    });

    it('应该通过便捷函数创建', () => {
      const p = createPlanner({ llmClient: mockLLMClient });
      expect(p).toBeInstanceOf(Planner);
    });
  });

  describe('createPlan', () => {
    it('应该成功创建计划', async () => {
      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '分析代码库计划',
          steps: [
            { id: '1', description: '读取文件列表', dependencies: [] },
            { id: '2', description: '分析代码结构', dependencies: ['1'] },
            { id: '3', description: '生成报告', dependencies: ['2'] },
          ],
          reasoning: '按照依赖顺序执行',
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.createPlan('分析代码库');

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan?.steps).toHaveLength(3);
      expect(result.tokenUsage.total).toBe(150);
    });

    it('应该处理 LLM 响应解析失败', async () => {
      const mockResponse: ChatResponse = {
        content: '无效响应',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.createPlan('测试任务');

      expect(result.success).toBe(false);
      expect(result.error).toBe('无法解析规划响应');
    });

    it('应该检测步骤数量超限', async () => {
      planner = new Planner({
        llmClient: mockLLMClient,
        maxSteps: 3,
      });

      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '计划',
          steps: [
            { id: '1', description: '步骤1', dependencies: [] },
            { id: '2', description: '步骤2', dependencies: ['1'] },
            { id: '3', description: '步骤3', dependencies: ['2'] },
            { id: '4', description: '步骤4', dependencies: ['3'] },
          ],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.createPlan('复杂任务');

      expect(result.success).toBe(false);
      expect(result.error).toContain('步骤数量超过限制');
    });

    it('应该检测循环依赖', async () => {
      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '有问题的计划',
          steps: [
            { id: '1', description: '步骤1', dependencies: ['2'] },
            { id: '2', description: '步骤2', dependencies: ['1'] },
          ],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.createPlan('循环任务');

      expect(result.success).toBe(false);
      expect(result.error).toContain('循环依赖');
    });

    it('应该检测不存在的依赖', async () => {
      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '有问题的计划',
          steps: [
            { id: '1', description: '步骤1', dependencies: [] },
            { id: '2', description: '步骤2', dependencies: ['999'] },
          ],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.createPlan('错误任务');

      expect(result.success).toBe(false);
      expect(result.error).toContain('依赖不存在的步骤');
    });

    it('应该处理 LLM 调用错误', async () => {
      mockLLMClient.chat.mockRejectedValue(new Error('API 错误'));

      const result = await planner.createPlan('测试任务');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API 错误');
    });

    it('应该包含上下文信息', async () => {
      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '计划',
          steps: [{ id: '1', description: '步骤1', dependencies: [] }],
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      await planner.createPlan('任务', {
        context: '重要背景信息',
        availableTools: ['file_read', 'shell'],
        constraints: ['不要删除文件'],
        expectedOutput: 'JSON 格式报告',
      });

      const callArg = mockLLMClient.chat.mock.calls[0][0];
      const userMessage = callArg[1].content;

      expect(userMessage).toContain('重要背景信息');
      expect(userMessage).toContain('file_read');
      expect(userMessage).toContain('不要删除文件');
      expect(userMessage).toContain('JSON 格式报告');
    });
  });

  describe('adjustPlan', () => {
    const basePlan = {
      planId: 'plan-001',
      description: '原始计划',
      steps: [
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
      ],
      status: 'pending' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('应该成功调整计划', async () => {
      const mockResponse: ChatResponse = {
        content: JSON.stringify({
          description: '调整后的计划',
          steps: [
            { id: '1', description: '修改的步骤1', dependencies: [] },
            { id: '2', description: '步骤2', dependencies: ['1'] },
            { id: '3', description: '新增步骤3', dependencies: ['2'] },
          ],
          reasoning: '增加了验证步骤',
        }),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.adjustPlan(basePlan, '增加验证步骤');

      expect(result.success).toBe(true);
      expect(result.plan?.steps).toHaveLength(3);
      expect(result.adjustmentReason).toBe('增加了验证步骤');
    });

    it('应该处理调整失败', async () => {
      const mockResponse: ChatResponse = {
        content: '无效响应',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        model: 'test-model',
        latencyMs: 100,
      };

      mockLLMClient.chat.mockResolvedValue(mockResponse);

      const result = await planner.adjustPlan(basePlan, '调整请求');

      expect(result.success).toBe(false);
      expect(result.error).toBe('无法解析调整响应');
    });
  });

  describe('buildTaskGraph', () => {
    it('应该从 TaskPlan 构建 TaskGraph', () => {
      const plan = {
        planId: 'plan-001',
        description: '测试计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const graph = planner.buildTaskGraph(plan);

      expect(graph.getPlanId()).toBe('plan-001');
      expect(graph.getStepCount()).toBe(2);
    });
  });

  describe('estimateComplexity', () => {
    it('应该正确估算复杂度', () => {
      const simplePlan = {
        planId: 'plan-001',
        description: '简单计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const complexPlan = {
        planId: 'plan-002',
        description: '复杂计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
          { id: '3', description: '步骤3', dependencies: ['1'] },
          { id: '4', description: '步骤4', dependencies: ['2', '3'] },
          { id: '5', description: '步骤5', dependencies: ['4'] },
          { id: '6', description: '步骤6', dependencies: ['4'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const simpleComplexity = planner.estimateComplexity(simplePlan);
      const complexComplexity = planner.estimateComplexity(complexPlan);

      expect(simpleComplexity).toBeLessThan(complexComplexity);
      expect(complexComplexity).toBeGreaterThan(3);
    });
  });

  describe('analyzeParallelism', () => {
    it('应该分析计划的并行度', () => {
      const plan = {
        planId: 'plan-001',
        description: '测试计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
          { id: '3', description: '步骤3', dependencies: ['1'] },
          { id: '4', description: '步骤4', dependencies: ['2', '3'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const analysis = planner.analyzeParallelism(plan);

      expect(analysis.totalSteps).toBe(4);
      expect(analysis.parallelizableSteps).toBe(2); // 步骤 2 和 3 可并行
      expect(analysis.sequentialSteps).toBe(2); // 步骤 1 和 4 是串行的
      expect(analysis.maxParallelGroups).toBe(1); // 1 个并行组
      expect(analysis.parallelRatio).toBe(0.5);
    });
  });

  describe('generateSummary', () => {
    it('应该生成计划摘要', () => {
      const plan = {
        planId: 'plan-001',
        description: '分析代码库',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const summary = planner.generateSummary(plan);

      expect(summary).toContain('分析代码库');
      expect(summary).toContain('步骤数: 2');
      expect(summary).toContain('复杂度:');
    });
  });

  describe('validatePlan', () => {
    it('应该验证有效的计划', () => {
      const validPlan = {
        planId: 'plan-001',
        description: '有效计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = planner.validatePlan(validPlan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测空计划', () => {
      const emptyPlan = {
        planId: 'plan-001',
        description: '空计划',
        steps: [],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = planner.validatePlan(emptyPlan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('计划没有步骤');
    });

    it('应该检测重复 ID', () => {
      const duplicatePlan = {
        planId: 'plan-001',
        description: '重复ID计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '1', description: '步骤1副本', dependencies: [] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = planner.validatePlan(duplicatePlan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('步骤 ID 重复');
    });

    it('应该检测自依赖', () => {
      const selfDepPlan = {
        planId: 'plan-001',
        description: '自依赖计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: ['1'] },
        ],
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = planner.validatePlan(selfDepPlan);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('依赖自己'))).toBe(true);
    });
  });
});
