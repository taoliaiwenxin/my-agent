/**
 * @file ToolExecutor.confirm.test.ts
 * @description ToolExecutor 编辑确认机制单元测试
 */

import inquirer from 'inquirer';
import { ToolExecutor } from '../../src/tools/ToolExecutor';

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

describe('ToolExecutor 编辑确认', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor({
      allowedPaths: [process.cwd()],
      permissionLevel: 'execute',
      enableHumanConfirm: true,
    });
    executor.registerDefaultTools();
    jest.clearAllMocks();
  });

  describe('修改性操作检测', () => {
    it('file_write 应该被识别为修改性操作', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      const result = await executor.execute('file_write', {
        path: 'test.txt',
        content: 'hello',
      });

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('shell 中的 rm 命令应该被识别为修改性操作', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      await executor.execute('shell', {
        command: 'rm test.txt',
      });

      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('shell 中的 > 重定向应该被识别为修改性操作', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      await executor.execute('shell', {
        command: 'echo hello > test.txt',
      });

      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it('shell 中的 ls 命令不应该被识别为修改性操作', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      const result = await executor.execute('shell', {
        command: 'ls -la',
      });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('file_read 不应该被识别为修改性操作', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      await executor.execute('file_read', {
        path: 'package.json',
      });

      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });

  describe('用户确认行为', () => {
    it('用户拒绝时应该返回错误结果', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: false });

      const result = await executor.execute('file_write', {
        path: 'test.txt',
        content: 'hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户拒绝');
    });

    it('未启用 enableHumanConfirm 时不应该提示', async () => {
      executor.updateConfig({ enableHumanConfirm: false });
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

      const result = await executor.execute('file_write', {
        path: 'test.txt',
        content: 'hello',
      });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('inquirer 失败时应该返回拒绝结果', async () => {
      (inquirer.prompt as unknown as jest.Mock).mockRejectedValue(new Error('TTY 错误'));

      const result = await executor.execute('file_write', {
        path: 'test.txt',
        content: 'hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户拒绝');
    });
  });
});
