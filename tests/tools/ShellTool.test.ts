/**
 * @file ShellTool.test.ts
 * @description ShellTool 模块的单元测试
 *              测试覆盖：命令执行、超时控制、权限检查、安全检测
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ShellTool, ShellToolDefinition } from '../../src/tools/implementations/ShellTool';
import { ToolExecutionContext } from '../../src/types';

describe('ShellTool', () => {
  /** 测试目录路径 */
  const testDir = path.join(__dirname, '../../temp/shell-test');

  /** 标准执行上下文 */
  const createContext = (allowedPaths?: string[]): ToolExecutionContext => ({
    sessionId: 'test-session',
    stepId: 'test-step',
    permissionLevel: 'execute',
    allowedPaths: allowedPaths || [testDir, process.cwd()]
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
      expect(ShellToolDefinition.name).toBe('shell');
      expect(ShellToolDefinition.description).toContain('执行');
      expect(ShellToolDefinition.parameters.type).toBe('object');
      expect(ShellToolDefinition.parameters.properties.command).toBeDefined();
      expect(ShellToolDefinition.parameters.required).toContain('command');
    });
  });

  describe('execute', () => {
    /**
     * 测试：成功执行简单命令
     */
    it('应该成功执行简单命令', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo Hello World'
            : 'echo "Hello World"'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as { stdout: string; exitCode: number };
      expect(data.stdout).toContain('Hello');
      expect(data.stdout).toContain('World');
      expect(data.exitCode).toBe(0);
    });

    /**
     * 测试：命令返回非零退出码
     */
    it('应该处理命令失败（非零退出码）', async () => {
      const result = await ShellTool.execute(
        { command: process.platform === 'win32' ? 'exit 1' : 'exit 1' },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('退出码: 1');
      const data = result.data as { exitCode: number };
      expect(data.exitCode).toBe(1);
    });

    /**
     * 测试：工作目录设置
     */
    it('应该在指定工作目录执行', async () => {
      // 在测试目录创建一个文件
      await fs.writeFile(path.join(testDir, 'testfile.txt'), 'test', 'utf-8');

      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32' ? 'dir' : 'ls',
          cwd: testDir
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string; cwd: string };
      expect(data.cwd).toBe(testDir);
      expect(data.stdout).toContain('testfile.txt');
    });

    /**
     * 测试：权限检查
     */
    it('应该检查执行权限', async () => {
      // read 权限应该失败
      const readContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'read',
        allowedPaths: [testDir]
      };
      const readResult = await ShellTool.execute(
        { command: 'echo test' },
        readContext
      );
      expect(readResult.success).toBe(false);
      expect(readResult.error).toContain('权限不足');

      // write 权限应该失败
      const writeContext: ToolExecutionContext = {
        sessionId: 'test',
        stepId: 'test',
        permissionLevel: 'write',
        allowedPaths: [testDir]
      };
      const writeResult = await ShellTool.execute(
        { command: 'echo test' },
        writeContext
      );
      expect(writeResult.success).toBe(false);
      expect(writeResult.error).toContain('权限不足');

      // execute 权限应该成功
      const execResult = await ShellTool.execute(
        { command: 'echo test' },
        createContext()
      );
      expect(execResult.success).toBe(true);
    });

    /**
     * 测试：危险命令检测
     */
    it('应该阻止危险命令', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'rm -rf /etc',
        'mkfs.ext4 /dev/sda',
        'format C:',
        ':(){ :|:& };:' // Fork bomb
      ];

      for (const cmd of dangerousCommands) {
        const result = await ShellTool.execute(
          { command: cmd },
          createContext()
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('命令被拒绝');
      }
    });

    /**
     * 测试：超时控制
     */
    it('应该支持超时控制', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'timeout /t 2 /nobreak >nul'
            : 'sleep 2',
          timeout: 100 // 100ms 超时
        },
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('超时');
      const data = result.data as { timedOut: boolean };
      expect(data.timedOut).toBe(true);
    }, 10000); // 增加测试超时到 10 秒

    /**
     * 测试：工作目录访问控制
     */
    it('应该验证工作目录权限', async () => {
      const result = await ShellTool.execute(
        { command: 'pwd', cwd: 'C:\\Windows' },
        createContext([testDir])
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('工作目录不在允许列表中');
    });

    /**
     * 测试：stderr 捕获
     */
    it('应该捕获 stderr 输出', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo error message >&2'
            : 'echo "error message" >&2'
        },
        createContext()
      );

      // stderr 输出不会导致命令失败
      expect(result.success).toBe(true);
      const data = result.data as { stderr: string };
      expect(data.stderr).toContain('error message');
    });

    /**
     * 测试：环境变量
     */
    it('应该支持环境变量', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo %TEST_VAR%'
            : 'echo $TEST_VAR',
          env: { TEST_VAR: 'test_value' }
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout).toContain('test_value');
    });

    /**
     * 测试：复杂命令
     */
    it('应该支持复杂命令', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo line1 && echo line2'
            : 'echo line1 && echo line2'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout).toContain('line1');
      expect(data.stdout).toContain('line2');
    });
  });

  describe('边界情况', () => {
    /**
     * 测试：空命令
     */
    it('空命令应该返回空输出', async () => {
      const result = await ShellTool.execute(
        { command: '' },
        createContext()
      );

      // 空命令在大多数 shell 中会返回 0
      expect(result.data).toBeDefined();
    });

    /**
     * 测试：多行输出
     */
    it('应该处理多行输出', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo line1 && echo line2 && echo line3'
            : 'echo "line1\nline2\nline3"'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      const lines = data.stdout.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    /**
     * 测试：长输出
     */
    it('应该处理长输出', async () => {
      // Windows echo 有长度限制，使用 powerShell
      const longString = 'x'.repeat(5000);
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? `powershell -Command "Write-Output '${longString}'"`
            : `printf '%s' '${longString}'`
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout.length).toBeGreaterThanOrEqual(5000);
    });

    /**
     * 测试：管道命令
     */
    it('应该支持管道命令', async () => {
      const result = await ShellTool.execute(
        {
          command: process.platform === 'win32'
            ? 'echo hello | findstr hello'
            : 'echo "hello" | grep hello'
        },
        createContext()
      );

      expect(result.success).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout).toContain('hello');
    });
  });
});
