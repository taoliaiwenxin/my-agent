/**
 * @file PermissionManager.confirmAction.test.ts
 * @description PermissionManager.confirmAction 单元测试
 */

import inquirer from 'inquirer';
import { PermissionManager } from '../../src/security/PermissionManager';

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

describe('PermissionManager.confirmAction', () => {
  let permissionManager: PermissionManager;

  beforeEach(() => {
    permissionManager = new PermissionManager({
      permissionLevel: 'execute',
      allowedPaths: [process.cwd()],
    });
    jest.clearAllMocks();
  });

  it('用户确认时应该返回 true', async () => {
    (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

    const result = await permissionManager.confirmAction('file_write', {
      path: 'test.txt',
    });

    expect(result).toBe(true);
    expect(inquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'confirm',
        name: 'confirmed',
        default: false,
      }),
    ]);
  });

  it('用户拒绝时应该返回 false', async () => {
    (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: false });

    const result = await permissionManager.confirmAction('shell', {
      command: 'rm -rf /',
    });

    expect(result).toBe(false);
  });

  it('inquirer 失败时应该返回 false', async () => {
    (inquirer.prompt as unknown as jest.Mock).mockRejectedValue(new Error('TTY 错误'));

    const result = await permissionManager.confirmAction('file_write', {
      path: 'test.txt',
    });

    expect(result).toBe(false);
  });

  it('提示消息应该包含工具名称和参数', async () => {
    (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({ confirmed: true });

    await permissionManager.confirmAction('file_write', { path: 'src/index.ts' });

    const promptCall = (inquirer.prompt as unknown as jest.Mock).mock.calls[0][0];
    expect(promptCall[0].message).toContain('file_write');
    expect(promptCall[0].message).toContain('path');
  });
});
