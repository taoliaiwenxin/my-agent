/**
 * @file ToolExecutor.test.ts
 * @description ToolExecutor 模块的单元测试
 *              测试覆盖：工具注册、执行、权限控制、错误处理
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolExecutor, ToolNotFoundError } from '../../src/tools/ToolExecutor';
import { FileReadTool } from '../../src/tools/implementations/FileReadTool';

describe('ToolExecutor', () => {
  /** 测试目录路径 */
  const testDir = path.join(__dirname, '../../temp/tool-executor-test');

  /** 创建执行器实例 */
  const createExecutor = () => new ToolExecutor({
    allowedPaths: [testDir, process.cwd()],
    permissionLevel: 'execute',
    sessionId: 'test-session',
    stepId: 'test-step'
  });

  /** 每个测试前准备测试环境 */
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  /** 每个测试后清理测试环境 */
  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('constructor', () => {
    /**
     * 测试：正确创建实例
     */
    it('应该正确创建执行器实例', () => {
      const executor = createExecutor();

      expect(executor).toBeDefined();
      expect(executor.getToolCount()).toBe(0);
    });
  });

  describe('registerTool', () => {
    /**
     * 测试：注册工具
     */
    it('应该成功注册工具', () => {
      const executor = createExecutor();

      executor.registerTool(FileReadTool);

      expect(executor.hasTool('file_read')).toBe(true);
      expect(executor.getToolCount()).toBe(1);
    });

    /**
     * 测试：重复注册抛出错误
     */
    it('重复注册应该抛出错误', () => {
      const executor = createExecutor();
      executor.registerTool(FileReadTool);

      expect(() => {
        executor.registerTool(FileReadTool);
      }).toThrow();
    });
  });

  describe('registerDefaultTools', () => {
    /**
     * 测试：注册所有默认工具
     */
    it('应该注册所有默认工具', () => {
      const executor = createExecutor();

      executor.registerDefaultTools();

      expect(executor.getToolCount()).toBe(4);
      expect(executor.hasTool('file_read')).toBe(true);
      expect(executor.hasTool('file_write')).toBe(true);
      expect(executor.hasTool('shell')).toBe(true);
      expect(executor.hasTool('terminate')).toBe(true);
    });
  });

  describe('execute', () => {
    /**
     * 测试：执行已注册的工具
     */
    it('应该执行已注册的工具', async () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      // 创建测试文件
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello World', 'utf-8');

      const result = await executor.execute('file_read', { path: testFile });

      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toBe('Hello World');
    });

    /**
     * 测试：执行不存在的工具
     */
    it('执行不存在的工具应该抛出错误', async () => {
      const executor = createExecutor();

      await expect(
        executor.execute('nonexistent', {})
      ).rejects.toThrow(ToolNotFoundError);
    });

    /**
     * 测试：执行文件读取
     */
    it('应该执行 file_read 工具', async () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const testFile = path.join(testDir, 'read.txt');
      await fs.writeFile(testFile, 'test content', 'utf-8');

      const result = await executor.execute('file_read', { path: testFile });

      expect(result.success).toBe(true);
    });

    /**
     * 测试：执行文件写入
     */
    it('应该执行 file_write 工具', async () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const testFile = path.join(testDir, 'write.txt');

      const result = await executor.execute('file_write', {
        path: testFile,
        content: 'written content'
      });

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('written content');
    });

    /**
     * 测试：执行 shell 命令
     */
    it('应该执行 shell 工具', async () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const result = await executor.execute('shell', {
        command: process.platform === 'win32' ? 'echo test' : 'echo test'
      });

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout).toContain('test');
    });

    /**
     * 测试：执行终止
     */
    it('应该执行 terminate 工具', async () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const result = await executor.execute('terminate', {
        status: 'success',
        message: '任务完成'
      });

      expect(result.success).toBe(true);
      const data = result.data as { terminated: boolean };
      expect(data.terminated).toBe(true);
    });
  });

  describe('getAllTools', () => {
    /**
     * 测试：获取所有工具
     */
    it('应该返回所有已注册的工具', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const tools = executor.getAllTools();

      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name).sort()).toEqual([
        'file_read', 'file_write', 'shell', 'terminate'
      ]);
    });
  });

  describe('getToolDefinition', () => {
    /**
     * 测试：获取工具定义
     */
    it('应该返回指定工具的定义', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const definition = executor.getToolDefinition('file_read');

      expect(definition.name).toBe('file_read');
      expect(definition.description).toBeDefined();
    });

    /**
     * 测试：获取不存在的工具定义
     */
    it('获取不存在的工具应该抛出错误', () => {
      const executor = createExecutor();

      expect(() => {
        executor.getToolDefinition('nonexistent');
      }).toThrow();
    });
  });

  describe('getToolNames', () => {
    /**
     * 测试：获取工具名称列表
     */
    it('应该返回所有工具名称', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const names = executor.getToolNames();

      expect(names).toHaveLength(4);
      expect(names).toContain('file_read');
      expect(names).toContain('file_write');
      expect(names).toContain('shell');
      expect(names).toContain('terminate');
    });
  });

  describe('getToolsForLLM', () => {
    /**
     * 测试：获取 LLM 格式
     */
    it('应该返回 LLM 格式的工具定义', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const tools = executor.getToolsForLLM();

      expect(tools).toHaveLength(4);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('input_schema');
    });
  });

  describe('unregisterTool', () => {
    /**
     * 测试：移除工具
     */
    it('应该成功移除工具', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      const removed = executor.unregisterTool('file_read');

      expect(removed).toBe(true);
      expect(executor.hasTool('file_read')).toBe(false);
      expect(executor.getToolCount()).toBe(3);
    });

    /**
     * 测试：移除不存在的工具
     */
    it('移除不存在的工具应该返回 false', () => {
      const executor = createExecutor();

      const removed = executor.unregisterTool('nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('clearTools', () => {
    /**
     * 测试：清空所有工具
     */
    it('应该清空所有工具', () => {
      const executor = createExecutor();
      executor.registerDefaultTools();

      executor.clearTools();

      expect(executor.getToolCount()).toBe(0);
      expect(executor.hasTool('file_read')).toBe(false);
    });
  });

  describe('updateConfig', () => {
    /**
     * 测试：更新配置
     */
    it('应该更新配置', () => {
      const executor = createExecutor();

      executor.updateConfig({ permissionLevel: 'write' });

      const config = executor.getConfig();
      expect(config.permissionLevel).toBe('write');
    });

    /**
     * 测试：部分更新配置
     */
    it('应该支持部分配置更新', () => {
      const executor = createExecutor();

      executor.updateConfig({ sessionId: 'new-session' });

      const config = executor.getConfig();
      expect(config.sessionId).toBe('new-session');
      expect(config.permissionLevel).toBe('execute'); // 保持不变
    });
  });

  describe('getConfig', () => {
    /**
     * 测试：获取配置
     */
    it('应该返回当前配置的副本', () => {
      const executor = createExecutor();

      const config1 = executor.getConfig();
      config1.permissionLevel = 'read'; // 修改副本

      const config2 = executor.getConfig();
      expect(config2.permissionLevel).toBe('execute'); // 原始配置未改变
    });
  });
});
