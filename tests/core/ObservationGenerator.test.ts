/**
 * @file ObservationGenerator.test.ts
 * @description ObservationGenerator 单元测试
 */

import { ObservationGenerator } from '../../src/core/ObservationGenerator';
import { ToolExecutionResult } from '../../src/types';

describe('ObservationGenerator', () => {
  let generator: ObservationGenerator;

  beforeEach(() => {
    generator = new ObservationGenerator();
  });

  describe('基本功能', () => {
    it('应该创建实例', () => {
      expect(generator).toBeInstanceOf(ObservationGenerator);
    });

    it('应该使用默认配置创建', () => {
      const defaultGen = new ObservationGenerator();
      expect(defaultGen).toBeInstanceOf(ObservationGenerator);
    });

    it('应该使用自定义最大长度创建', () => {
      const customGen = new ObservationGenerator(1000);
      expect(customGen).toBeInstanceOf(ObservationGenerator);
    });
  });

  describe('generate', () => {
    it('应该生成成功的观察结果', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: '文件内容',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'file_read',
        result,
        parameters: { path: './test.txt' },
        executionTimeMs: 100,
      });

      expect(observation.success).toBe(true);
      expect(observation.raw).toBe('文件内容');
      expect(observation.summary).toContain('读取文件');
      expect(observation.executionTimeMs).toBe(100);
    });

    it('应该生成失败的观察结果', () => {
      const result: ToolExecutionResult = {
        success: false,
        error: '文件不存在',
        executionTimeMs: 50,
      };

      const observation = generator.generate({
        toolName: 'file_read',
        result,
        parameters: { path: './missing.txt' },
      });

      expect(observation.success).toBe(false);
      expect(observation.raw).toBe('文件不存在');
      expect(observation.summary).toContain('失败');
      expect(observation.errors).toHaveLength(1);
    });

    it('应该处理对象数据', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: { key: 'value', number: 123 },
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'shell',
        result,
      });

      expect(observation.success).toBe(true);
      expect(observation.raw).toContain('key');
      expect(observation.raw).toContain('value');
    });

    it('应该处理 undefined 数据', () => {
      const result: ToolExecutionResult = {
        success: true,
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'file_write',
        result,
      });

      expect(observation.success).toBe(true);
      expect(observation.raw).toBe('执行成功（无返回值）');
    });
  });

  describe('不同工具的观察生成', () => {
    it('应该为 file_read 生成正确的摘要', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: 'line1\nline2\nline3',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'file_read',
        result,
        parameters: { path: './test.txt' },
      });

      expect(observation.summary).toContain('test.txt');
      expect(observation.summary).toContain('3 行');
    });

    it('应该为 file_write 生成正确的摘要', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: './output.txt',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'file_write',
        result,
        parameters: { path: './output.txt', content: 'data' },
      });

      expect(observation.summary).toContain('output.txt');
    });

    it('应该为 shell 生成正确的摘要', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: 'output1\noutput2',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'shell',
        result,
        parameters: { command: 'ls -la' },
      });

      expect(observation.summary).toContain('ls -la');
      expect(observation.summary).toContain('2 行');
    });

    it('应该截断长命令', () => {
      const longCommand = 'a'.repeat(100);
      const result: ToolExecutionResult = {
        success: true,
        data: 'output',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'shell',
        result,
        parameters: { command: longCommand },
      });

      expect(observation.summary).toContain('...');
      expect(observation.summary.length).toBeLessThan(longCommand.length + 50);
    });

    it('应该为 terminate 生成正确的摘要', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: '任务完成',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'terminate',
        result,
      });

      expect(observation.summary).toContain('任务已完成');
    });

    it('应该为未知工具生成通用摘要', () => {
      const result: ToolExecutionResult = {
        success: true,
        data: 'result',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'custom_tool',
        result,
      });

      expect(observation.summary).toContain('custom_tool');
    });
  });

  describe('generateBatch', () => {
    it('应该批量生成观察结果', () => {
      const optionsList = [
        {
          toolName: 'file_read',
          result: { success: true, data: 'content1', executionTimeMs: 100 },
        },
        {
          toolName: 'file_write',
          result: { success: true, data: 'content2', executionTimeMs: 100 },
        },
      ];

      const observations = generator.generateBatch(optionsList);

      expect(observations).toHaveLength(2);
      expect(observations[0].raw).toBe('content1');
      expect(observations[1].raw).toBe('content2');
    });
  });

  describe('createErrorObservation', () => {
    it('应该创建错误观察结果', () => {
      const observation = generator.createErrorObservation(
        'file_read',
        '权限被拒绝',
        { path: './secret.txt' }
      );

      expect(observation.success).toBe(false);
      expect(observation.raw).toBe('权限被拒绝');
      expect(observation.summary).toContain('权限被拒绝');
      expect(observation.errors).toHaveLength(1);
    });
  });

  describe('摘要截断', () => {
    it('应该截断长摘要', () => {
      const longCommand = 'a'.repeat(200);
      const result: ToolExecutionResult = {
        success: true,
        data: 'output',
        executionTimeMs: 100,
      };

      const observation = generator.generate({
        toolName: 'shell',
        result,
        parameters: { command: longCommand },
        maxSummaryLength: 50,
      });

      expect(observation.summary.length).toBeLessThanOrEqual(50);
      expect(observation.summary.endsWith('...')).toBe(true);
    });
  });
});
