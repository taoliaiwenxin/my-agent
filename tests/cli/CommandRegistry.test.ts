/**
 * @file CommandRegistry.test.ts
 * @description CommandRegistry 单元测试
 */

import { CommandRegistry } from '../../src/cli/CommandRegistry';
import { Agent } from '../../src/core/Agent';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let mockAgent: jest.Mocked<Agent>;

  beforeEach(() => {
    registry = new CommandRegistry();

    mockAgent = {
      clearInteractiveContext: jest.fn(),
      getStatus: jest.fn().mockReturnValue({ state: 'idle', sessionId: 'test-001' }),
      getTokenUsageStats: jest.fn().mockReturnValue({
        totalCalls: 5,
        totalTokens: 1000,
      }),
      getTools: jest.fn().mockReturnValue(['file_read', 'file_write', 'shell']),
    } as unknown as jest.Mocked<Agent>;
  });

  describe('命令解析', () => {
    it('应该能识别命令', () => {
      expect(CommandRegistry.isCommand('/help')).toBe(true);
      expect(CommandRegistry.isCommand('  /help  ')).toBe(true);
      expect(CommandRegistry.isCommand('hello')).toBe(false);
      expect(CommandRegistry.isCommand('/')).toBe(true);
    });

    it('应该能执行 /help 命令', async () => {
      const result = await registry.execute('/help', mockAgent);
      expect(result).toContain('可用命令');
      expect(result).toContain('/exit');
      expect(result).toContain('/clear');
    });

    it('应该能执行 /exit 命令', async () => {
      const result = await registry.execute('/exit', mockAgent);
      expect(result).toBe('EXIT_SIGNAL');
    });

    it('应该支持 /quit 和 /q 别名', async () => {
      const result1 = await registry.execute('/quit', mockAgent);
      expect(result1).toBe('EXIT_SIGNAL');

      const result2 = await registry.execute('/q', mockAgent);
      expect(result2).toBe('EXIT_SIGNAL');
    });

    it('应该能执行 /clear 命令', async () => {
      const result = await registry.execute('/clear', mockAgent);
      expect(mockAgent.clearInteractiveContext).toHaveBeenCalled();
      expect(result).toContain('已清空');
    });

    it('应该能执行 /status 命令', async () => {
      const result = await registry.execute('/status', mockAgent);
      expect(mockAgent.getStatus).toHaveBeenCalled();
      expect(mockAgent.getTokenUsageStats).toHaveBeenCalled();
      expect(result).toContain('idle');
      expect(result).toContain('test-001');
    });

    it('应该能执行 /tools 命令', async () => {
      const result = await registry.execute('/tools', mockAgent);
      expect(mockAgent.getTools).toHaveBeenCalled();
      expect(result).toContain('file_read');
      expect(result).toContain('file_write');
    });

    it('应该对未知命令返回错误', async () => {
      const result = await registry.execute('/unknown', mockAgent);
      expect(result).toContain('未知命令');
    });

    it('应该能处理带参数的输入', async () => {
      // /help 命令忽略参数，但应该能正常解析
      const result = await registry.execute('/help something', mockAgent);
      expect(result).toContain('可用命令');
    });
  });

  describe('命令列表', () => {
    it('应该返回所有命令', () => {
      const commands = registry.getCommands();
      const names = commands.map((c) => c.name);

      expect(names).toContain('help');
      expect(names).toContain('exit');
      expect(names).toContain('clear');
      expect(names).toContain('status');
      expect(names).toContain('history');
      expect(names).toContain('tools');
      expect(names).toContain('model');
      expect(names).toContain('compact');
    });

    it('每个命令应该有描述', () => {
      const commands = registry.getCommands();
      for (const cmd of commands) {
        expect(cmd.description).toBeTruthy();
      }
    });
  });
});
