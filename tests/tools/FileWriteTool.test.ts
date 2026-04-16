/**
 * @file FileWriteTool.test.ts
 * @description FileWriteTool 模块的单元测试
 *              测试覆盖：文件写入、路径验证、追加模式、错误处理
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileWriteTool, FileWriteToolDefinition } from '../../src/tools/implementations/FileWriteTool';
import { ToolExecutionContext } from '../../src/types';

describe('FileWriteTool', () => {
  /** 测试目录路径 */
  const testDir = path.join(__dirname, '../../temp/file-write-test');

  /** 标准执行上下文 */
  const createContext = (allowedPaths: string[] = [testDir]): ToolExecutionContext => ({
    sessionId: 'test-session',
    stepId: 'test-step',
    permissionLevel: 'write',
    allowedPaths
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

  describe('definition', () => {
    /**
     * 测试：工具定义正确性
     */
    it('应该具有正确的工具定义', () => {
      expect(FileWriteToolDefinition.name).toBe('file_write');
      expect(FileWriteToolDefinition.description).toContain('写入');
      expect(FileWriteToolDefinition.parameters.type).toBe('object');
      expect(FileWriteToolDefinition.parameters.properties.path).toBeDefined();
      expect(FileWriteToolDefinition.parameters.properties.content).toBeDefined();
      expect(FileWriteToolDefinition.parameters.required).toContain('path');
      expect(FileWriteToolDefinition.parameters.required).toContain('content');
    });
  });

  describe('execute', () => {
    /**
     * 测试：成功写入文件
     */
    it('应该成功写入文本文件', async () => {
      const testContent = 'Hello, World! 你好，世界！';
      const testFile = path.join(testDir, 'test.txt');

      const result = await FileWriteTool.execute(
        { path: testFile, content: testContent },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as { bytesWritten: number; newSize: number; isNewFile: boolean };
      expect(data.bytesWritten).toBe(Buffer.byteLength(testContent, 'utf-8'));
      expect(data.isNewFile).toBe(true);

      // 验证文件内容
      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe(testContent);
    });

    /**
     * 测试：覆盖已存在的文件
     */
    it('应该覆盖已存在的文件', async () => {
      const testFile = path.join(testDir, 'existing.txt');
      await fs.writeFile(testFile, 'old content', 'utf-8');

      const newContent = 'new content';
      const result = await FileWriteTool.execute(
        { path: testFile, content: newContent },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { isNewFile: boolean };
      expect(data.isNewFile).toBe(false);

      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe(newContent);
    });

    /**
     * 测试：追加模式
     */
    it('应该支持追加模式', async () => {
      const testFile = path.join(testDir, 'append.txt');
      await fs.writeFile(testFile, 'first line\n', 'utf-8');

      const result = await FileWriteTool.execute(
        { path: testFile, content: 'second line\n', append: true },
        createContext()
      );

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe('first line\nsecond line\n');
    });

    /**
     * 测试：自动创建目录
     */
    it('应该自动创建父目录', async () => {
      const nestedFile = path.join(testDir, 'level1', 'level2', 'file.txt');
      const content = 'nested content';

      const result = await FileWriteTool.execute(
        { path: nestedFile, content },
        createContext()
      );

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(nestedFile, 'utf-8');
      expect(savedContent).toBe(content);
    });

    /**
     * 测试：指定编码
     */
    it('应该支持指定编码', async () => {
      const testFile = path.join(testDir, 'encoded.txt');
      const content = 'UTF-8 编码测试';

      const result = await FileWriteTool.execute(
        { path: testFile, content, encoding: 'utf-8' },
        createContext()
      );

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe(content);
    });

    /**
     * 测试：写入空内容
     */
    it('应该支持写入空内容', async () => {
      const testFile = path.join(testDir, 'empty.txt');

      const result = await FileWriteTool.execute(
        { path: testFile, content: '' },
        createContext()
      );

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe('');

      const stats = await fs.stat(testFile);
      expect(stats.size).toBe(0);
    });

    /**
     * 测试：路径访问控制
     */
    it('应该验证路径访问权限', async () => {
      const otherDir = path.join(__dirname, '../../temp/other-write');
      await fs.mkdir(otherDir, { recursive: true });
      const forbiddenFile = path.join(otherDir, 'forbidden.txt');

      const result = await FileWriteTool.execute(
        { path: forbiddenFile, content: 'test' },
        createContext([testDir])
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('路径不在允许列表中');

      // 清理
      await fs.rm(otherDir, { recursive: true, force: true });
    });

    /**
     * 测试：权限检查
     */
    it('应该检查写入权限', async () => {
      const testFile = path.join(testDir, 'perm.txt');

      // read 权限应该失败
      const readContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'read',
        allowedPaths: [testDir]
      };
      const readResult = await FileWriteTool.execute(
        { path: testFile, content: 'test' },
        readContext
      );
      expect(readResult.success).toBe(false);
      expect(readResult.error).toContain('权限不足');

      // write 权限应该成功
      const writeContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'write',
        allowedPaths: [testDir]
      };
      const writeResult = await FileWriteTool.execute(
        { path: testFile, content: 'test' },
        writeContext
      );
      expect(writeResult.success).toBe(true);

      // execute 权限应该成功
      const execContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'execute',
        allowedPaths: [testDir]
      };
      const execFile = path.join(testDir, 'exec.txt');
      const execResult = await FileWriteTool.execute(
        { path: execFile, content: 'test' },
        execContext
      );
      expect(execResult.success).toBe(true);
    });

    /**
     * 测试：写入大文件
     */
    it('应该能写入大文件', async () => {
      const testFile = path.join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(100000);

      const result = await FileWriteTool.execute(
        { path: testFile, content: largeContent },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { bytesWritten: number };
      expect(data.bytesWritten).toBe(100000);

      const stats = await fs.stat(testFile);
      expect(stats.size).toBe(100000);
    });

    /**
     * 测试：不创建目录
     */
    it('createDir=false 时不应创建目录', async () => {
      const nestedFile = path.join(testDir, 'nonexistent', 'file.txt');

      const result = await FileWriteTool.execute(
        { path: nestedFile, content: 'test', createDir: false },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('边界情况', () => {
    /**
     * 测试：多次追加
     */
    it('应该支持多次追加', async () => {
      const testFile = path.join(testDir, 'multi-append.txt');

      await FileWriteTool.execute(
        { path: testFile, content: 'line1\n' },
        createContext()
      );

      await FileWriteTool.execute(
        { path: testFile, content: 'line2\n', append: true },
        createContext()
      );

      await FileWriteTool.execute(
        { path: testFile, content: 'line3\n', append: true },
        createContext()
      );

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('line1\nline2\nline3\n');
    });

    /**
     * 测试：覆盖后追加
     */
    it('覆盖后应该正确追加', async () => {
      const testFile = path.join(testDir, 'overwrite-append.txt');

      // 先写入
      await FileWriteTool.execute(
        { path: testFile, content: 'original\n' },
        createContext()
      );

      // 覆盖
      await FileWriteTool.execute(
        { path: testFile, content: 'overwritten\n' },
        createContext()
      );

      // 追加
      await FileWriteTool.execute(
        { path: testFile, content: 'appended\n', append: true },
        createContext()
      );

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('overwritten\nappended\n');
    });

    /**
     * 测试：特殊字符文件名
     */
    it('应该支持包含特殊字符的文件名', async () => {
      const testFile = path.join(testDir, 'file with spaces.txt');

      const result = await FileWriteTool.execute(
        { path: testFile, content: 'content' },
        createContext()
      );

      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('content');
    });

    /**
     * 测试：中文内容
     */
    it('应该正确处理中文内容', async () => {
      const testFile = path.join(testDir, 'chinese.txt');
      const chineseContent = '这是一段中文测试内容，包含特殊字符：！@#￥%……&*（）';

      const result = await FileWriteTool.execute(
        { path: testFile, content: chineseContent },
        createContext()
      );

      expect(result.success).toBe(true);

      const savedContent = await fs.readFile(testFile, 'utf-8');
      expect(savedContent).toBe(chineseContent);
    });
  });
});
