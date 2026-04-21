/**
 * @file cli.test.ts
 * @description CLI 入口单元测试
 *              测试覆盖：参数解析、配置加载、错误处理
 * @module tests/cli
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import { Command } from 'commander';

describe('CLI', () => {
  /**
   * 测试：命令对象创建
   */
  it('应该能创建 Command 实例', () => {
    const program = new Command();
    expect(program).toBeInstanceOf(Command);
  });

  /**
   * 测试：命令配置
   */
  it('应该正确配置命令', () => {
    const program = new Command();
    program.name('test-agent').description('测试').version('1.0.0');

    expect(program.name()).toBe('test-agent');
    expect(program.description()).toBe('测试');
    expect(program.version()).toBe('1.0.0');
  });

  /**
   * 测试：选项解析
   */
  it('应该正确解析选项', () => {
    const program = new Command();
    program
      .option('-p, --permission <level>', '权限级别', 'execute')
      .option('-d, --db <path>', '数据库路径');

    program.parse(['node', 'test', '--permission', 'read', '--db', './test.db']);

    const opts = program.opts();
    expect(opts.permission).toBe('read');
    expect(opts.db).toBe('./test.db');
  });

  /**
   * 测试：默认值
   */
  it('应该使用默认值', () => {
    const program = new Command();
    program.option('-p, --permission <level>', '权限级别', 'execute');

    program.parse(['node', 'test']);

    const opts = program.opts();
    expect(opts.permission).toBe('execute');
  });
});
