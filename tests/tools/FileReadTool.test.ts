/**
 * @file FileReadTool.test.ts
 * @description FileReadTool 模块的单元测试
 *              测试覆盖：文件读取、路径验证、编码处理、错误处理
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileReadTool, FileReadToolDefinition } from '../../src/tools/implementations/FileReadTool';
import { ToolExecutionContext } from '../../src/types';

describe('FileReadTool', () => {
  /** 测试目录路径 */
  const testDir = path.join(__dirname, '../../temp/file-read-test');

  /** 标准执行上下文 */
  const createContext = (allowedPaths: string[] = [testDir]): ToolExecutionContext => ({
    sessionId: 'test-session',
    stepId: 'test-step',
    permissionLevel: 'read',
    allowedPaths
  });

  /** 每个测试前准备测试环境 */
  beforeEach(async () => {
    // 创建测试目录
    await fs.mkdir(testDir, { recursive: true });
  });

  /** 每个测试后清理测试环境 */
  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('definition', () => {
    /**
     * 测试：工具定义正确性
     *
     * 验证点：
     * 1. 名称正确
     * 2. 描述不为空
     * 3. 参数定义完整
     */
    it('应该具有正确的工具定义', () => {
      expect(FileReadToolDefinition.name).toBe('file_read');
      expect(FileReadToolDefinition.description).toContain('读取');
      expect(FileReadToolDefinition.parameters.type).toBe('object');
      expect(FileReadToolDefinition.parameters.properties.path).toBeDefined();
      expect(FileReadToolDefinition.parameters.required).toContain('path');
    });
  });

  describe('execute', () => {
    /**
     * 测试：成功读取文件
     *
     * 验证点：
     * 1. 返回成功状态
     * 2. 内容正确
     * 3. 元数据完整
     */
    it('应该成功读取文本文件', async () => {
      const testContent = 'Hello, World! 你好，世界！';
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      const result = await FileReadTool.execute(
        { path: testFile },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as { content: string; size: number; encoding: string };
      expect(data.content).toBe(testContent);
      expect(data.size).toBe(Buffer.byteLength(testContent, 'utf-8'));
      expect(data.encoding).toBe('utf-8');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    /**
     * 测试：读取相对路径文件
     *
     * 验证点：
     * 1. 相对路径正确解析
     * 2. 返回绝对路径
     */
    it('应该支持相对路径', async () => {
      const testContent = '相对路径测试';
      const testFile = path.join(testDir, 'relative.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // 使用相对路径
      const relativePath = path.relative(process.cwd(), testFile);

      const result = await FileReadTool.execute(
        { path: relativePath },
        createContext([process.cwd()])
      );

      expect(result.success).toBe(true);
      const data = result.data as { content: string; absolutePath: string };
      expect(data.content).toBe(testContent);
      expect(data.absolutePath).toBe(path.resolve(testFile));
    });

    /**
     * 测试：指定编码读取
     *
     * 验证点：
     * 1. 支持不同编码
     * 2. 正确解码内容
     */
    it('应该支持指定编码', async () => {
      // 创建 UTF-8 编码文件
      const utf8Content = 'UTF-8 编码测试：你好世界';
      const utf8File = path.join(testDir, 'utf8.txt');
      await fs.writeFile(utf8File, utf8Content, 'utf-8');

      const result = await FileReadTool.execute(
        { path: utf8File, encoding: 'utf-8' },
        createContext()
      );

      expect(result.success).toBe(true);
      const data2 = result.data as { content: string; encoding: string };
      expect(data2.content).toBe(utf8Content);
      expect(data2.encoding).toBe('utf-8');
    });

    /**
     * 测试：分段读取大文件
     *
     * 验证点：
     * 1. 支持 offset 参数
     * 2. 正确读取指定范围
     * 3. isTruncated 和 hasMore 标志正确
     */
    it('应该支持分段读取', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const testContent = lines.join('\n');
      const testFile = path.join(testDir, 'large.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // 读取前 100 字节
      const result1 = await FileReadTool.execute(
        { path: testFile, offset: 0, maxSize: 100 },
        createContext()
      );

      expect(result1.success).toBe(true);
      const data1 = result1.data as { isTruncated: boolean; hasMore: boolean };
      expect(data1.isTruncated).toBe(true);
      expect(data1.hasMore).toBe(true);

      // 继续读取
      const result2 = await FileReadTool.execute(
        { path: testFile, offset: 100, maxSize: 100 },
        createContext()
      );

      expect(result2.success).toBe(true);
      const data2 = result2.data as { offset: number };
      expect(data2.offset).toBe(100);
    });

    /**
     * 测试：文件大小限制
     *
     * 验证点：
     * 1. 大文件被截断读取
     * 2. isTruncated 标志为 true
     */
    it('应该限制读取大小并截断大文件', async () => {
      const largeContent = 'x'.repeat(2000);
      const testFile = path.join(testDir, 'large.txt');
      await fs.writeFile(testFile, largeContent, 'utf-8');

      const result = await FileReadTool.execute(
        { path: testFile, maxSize: 1000 },
        createContext()
      );

      expect(result.success).toBe(true);
      const data3 = result.data as { isTruncated: boolean; hasMore: boolean; readSize: number };
      expect(data3.isTruncated).toBe(true);
      expect(data3.hasMore).toBe(true);
      expect(data3.readSize).toBeLessThanOrEqual(1000);
    });

    /**
     * 测试：读取不存在的文件
     *
     * 验证点：
     * 1. 返回失败状态
     * 2. 错误信息包含文件不存在
     */
    it('读取不存在的文件应该返回错误', async () => {
      const result = await FileReadTool.execute(
        { path: path.join(testDir, 'nonexistent.txt') },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });

    /**
     * 测试：路径访问控制
     *
     * 验证点：
     * 1. 不允许的路径返回错误
     * 2. 允许的路径正常读取
     */
    it('应该验证路径访问权限', async () => {
      // 在允许目录创建文件
      const allowedFile = path.join(testDir, 'allowed.txt');
      await fs.writeFile(allowedFile, 'allowed', 'utf-8');

      // 在不允许的目录创建文件
      const otherDir = path.join(__dirname, '../../temp/other');
      await fs.mkdir(otherDir, { recursive: true });
      const forbiddenFile = path.join(otherDir, 'forbidden.txt');
      await fs.writeFile(forbiddenFile, 'forbidden', 'utf-8');

      // 允许的路径应该成功
      const allowedResult = await FileReadTool.execute(
        { path: allowedFile },
        createContext([testDir])
      );
      expect(allowedResult.success).toBe(true);

      // 不允许的路径应该失败
      const forbiddenResult = await FileReadTool.execute(
        { path: forbiddenFile },
        createContext([testDir]) // 只允许 testDir
      );
      expect(forbiddenResult.success).toBe(false);
      expect(forbiddenResult.error).toContain('路径不在允许列表中');

      // 清理
      await fs.rm(otherDir, { recursive: true, force: true });
    });

    /**
     * 测试：目录遍历攻击防护
     *
     * 验证点：
     * 1. .. 路径被阻止
     */
    it('应该阻止目录遍历攻击', async () => {
      // 创建嵌套目录结构
      const nestedDir = path.join(testDir, 'nested');
      await fs.mkdir(nestedDir, { recursive: true });
      const nestedFile = path.join(nestedDir, 'file.txt');
      await fs.writeFile(nestedFile, 'nested', 'utf-8');

      // 尝试使用 ../ 跳出允许目录
      const result = await FileReadTool.execute(
        { path: path.join(nestedDir, '../forbidden.txt') },
        createContext([nestedDir]) // 只允许 nested 目录
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('路径不在允许列表中');
    });

    /**
     * 测试：读取目录而非文件
     *
     * 验证点：
     * 1. 读取目录返回错误
     * 2. 错误信息明确
     */
    it('读取目录应该返回错误', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir, { recursive: true });

      const result = await FileReadTool.execute(
        { path: subDir },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不是文件');
    });

    /**
     * 测试：权限检查
     *
     * 验证点：
     * 1. read 权限允许读取
     * 2. write 权限允许读取
     * 3. 无权限拒绝读取
     */
    it('应该检查执行权限', async () => {
      const testFile = path.join(testDir, 'perm.txt');
      await fs.writeFile(testFile, 'test', 'utf-8');

      // read 权限应该成功
      const readContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'read',
        allowedPaths: [testDir]
      };
      const readResult = await FileReadTool.execute(
        { path: testFile },
        readContext
      );
      expect(readResult.success).toBe(true);

      // write 权限应该成功
      const writeContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'write',
        allowedPaths: [testDir]
      };
      const writeResult = await FileReadTool.execute(
        { path: testFile },
        writeContext
      );
      expect(writeResult.success).toBe(true);

      // execute 权限应该成功（execute 包含 read）
      const execContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'execute',
        allowedPaths: [testDir]
      };
      const execResult = await FileReadTool.execute(
        { path: testFile },
        execContext
      );
      expect(execResult.success).toBe(true);
    });
  });

  describe('边界情况', () => {
    /**
     * 测试：读取空文件
     *
     * 验证点：
     * 1. 空文件返回成功
     * 2. 内容为空字符串
     */
    it('应该正确处理空文件', async () => {
      const emptyFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(emptyFile, '', 'utf-8');

      const result = await FileReadTool.execute(
        { path: emptyFile },
        createContext()
      );

      expect(result.success).toBe(true);
      const data4 = result.data as { content: string; size: number };
      expect(data4.content).toBe('');
      expect(data4.size).toBe(0);
    });

    /**
     * 测试：读取二进制文件（作为文本）
     *
     * 验证点：
     * 1. 可以读取
     * 2. 内容可能乱码但无错误
     */
    it('应该能读取二进制文件', async () => {
      const binaryFile = path.join(testDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0x01, 0xFF, 0xFE]);
      await fs.writeFile(binaryFile, binaryContent);

      const result = await FileReadTool.execute(
        { path: binaryFile, encoding: 'latin1' },
        createContext()
      );

      expect(result.success).toBe(true);
      const data5 = result.data as { size: number };
      expect(data5.size).toBe(4);
    });

    /**
     * 测试：offset 超出文件大小
     *
     * 验证点：
     * 1. 返回成功但内容为空
     */
    it('offset 超出文件大小应该返回空内容', async () => {
      const testFile = path.join(testDir, 'small.txt');
      await fs.writeFile(testFile, 'small', 'utf-8');

      const result = await FileReadTool.execute(
        { path: testFile, offset: 1000 },
        createContext()
      );

      expect(result.success).toBe(true);
      const data6 = result.data as { content: string; hasMore: boolean };
      expect(data6.content).toBe('');
      expect(data6.hasMore).toBe(false);
    });
  });
});
