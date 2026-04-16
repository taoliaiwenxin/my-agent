/**
 * @file TerminateTool.test.ts
 * @description TerminateTool 模块的单元测试
 *              测试覆盖：成功终止、失败终止、参数验证、结果格式
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import { TerminateTool, TerminateToolDefinition } from '../../src/tools/implementations/TerminateTool';
import { ToolExecutionContext } from '../../src/types';

describe('TerminateTool', () => {
  /** 标准执行上下文 */
  const createContext = (): ToolExecutionContext => ({
    sessionId: 'test-session',
    stepId: 'test-step',
    permissionLevel: 'read',
    allowedPaths: ['./']
  });

  describe('definition', () => {
    /**
     * 测试：工具定义正确性
     */
    it('应该具有正确的工具定义', () => {
      expect(TerminateToolDefinition.name).toBe('terminate');
      expect(TerminateToolDefinition.description).toContain('终止');
      expect(TerminateToolDefinition.parameters.type).toBe('object');
      expect(TerminateToolDefinition.parameters.properties.status).toBeDefined();
      expect(TerminateToolDefinition.parameters.properties.message).toBeDefined();
      expect(TerminateToolDefinition.parameters.required).toContain('status');
      expect(TerminateToolDefinition.parameters.required).toContain('message');
    });
  });

  describe('execute', () => {
    /**
     * 测试：成功终止
     */
    it('应该成功执行成功终止', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: '任务已完成',
          answer: '最终答案内容'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        terminated: boolean;
        status: string;
        message: string;
        answer: string;
      };
      expect(data.terminated).toBe(true);
      expect(data.status).toBe('success');
      expect(data.message).toBe('任务已完成');
      expect(data.answer).toBe('最终答案内容');
    });

    /**
     * 测试：失败终止
     */
    it('应该成功执行失败终止', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'failed',
          message: '任务执行失败'
        },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      const data = result.data as {
        terminated: boolean;
        status: string;
        message: string;
      };
      expect(data.terminated).toBe(true);
      expect(data.status).toBe('failed');
      expect(data.message).toBe('任务执行失败');
    });

    /**
     * 测试：无 answer 的成功终止
     */
    it('应该支持不带 answer 的成功终止', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: '任务已完成，无需返回值'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { answer: string | undefined };
      expect(data.answer).toBeUndefined();
    });

    /**
     * 测试：无效的 status 参数
     */
    it('应该拒绝无效的 status 参数', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'invalid' as 'success',
          message: '测试'
        },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的终止状态');
    });

    /**
     * 测试：空 message 参数
     */
    it('应该拒绝空的 message 参数', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: ''
        },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('消息不能为空');
    });

    /**
     * 测试：包含上下文信息
     */
    it('应该在结果中包含上下文信息', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: '完成'
        },
        createContext()
      );

      const data = result.data as {
        sessionId: string;
        stepId: string;
      };
      expect(data.sessionId).toBe('test-session');
      expect(data.stepId).toBe('test-step');
    });

    /**
     * 测试：执行时间
     */
    it('应该返回执行时间', async () => {
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: '完成'
        },
        createContext()
      );

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('边界情况', () => {
    /**
     * 测试：长消息
     */
    it('应该支持长消息', async () => {
      const longMessage = 'A'.repeat(10000);
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: longMessage
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { message: string };
      expect(data.message).toBe(longMessage);
    });

    /**
     * 测试：长答案
     */
    it('应该支持长答案', async () => {
      const longAnswer = 'B'.repeat(10000);
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: '完成',
          answer: longAnswer
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { answer: string };
      expect(data.answer).toBe(longAnswer);
    });

    /**
     * 测试：特殊字符消息
     */
    it('应该支持包含特殊字符的消息', async () => {
      const specialMessage = '特殊字符：!@#$%^&*()_+-=[]{}|;\':",./<>?\n\t中文测试';
      const result = await TerminateTool.execute(
        {
          status: 'success',
          message: specialMessage
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { message: string };
      expect(data.message).toBe(specialMessage);
    });

    /**
     * 测试：多次调用（每次独立）
     */
    it('应该支持多次独立调用', async () => {
      const result1 = await TerminateTool.execute(
        { status: 'success', message: '第一次' },
        createContext()
      );
      expect(result1.success).toBe(true);

      const result2 = await TerminateTool.execute(
        { status: 'failed', message: '第二次' },
        createContext()
      );
      expect(result2.success).toBe(false);

      const result3 = await TerminateTool.execute(
        { status: 'success', message: '第三次' },
        createContext()
      );
      expect(result3.success).toBe(true);
    });
  });
});
