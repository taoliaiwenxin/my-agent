/**
 * @file CommandRegistry.ts
 * @description 交互模式 / 命令注册和管理
 * @module cli
 */

import chalk from 'chalk';
import { Agent } from '../core/Agent';

/**
 * 命令处理函数类型
 */
export type CommandHandler = (args: string[], agent: Agent) => Promise<string | void>;

/**
 * 命令定义
 */
export interface CommandDefinition {
  /** 命令名称（不含 /） */
  name: string;
  /** 别名列表 */
  aliases: string[];
  /** 描述 */
  description: string;
  /** 用法示例 */
  usage?: string;
  /** 处理函数 */
  handler: CommandHandler;
}

/**
 * 命令注册表
 *
 * 管理所有交互模式的 / 命令。
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  constructor() {
    this.registerDefaultCommands();
  }

  /**
   * 注册命令
   */
  public register(command: CommandDefinition): void {
    this.commands.set(command.name, command);
    for (const alias of command.aliases) {
      this.commands.set(alias, command);
    }
  }

  /**
   * 执行命令
   *
   * @param input - 用户输入（含 /）
   * @param agent - Agent 实例
   * @returns 命令输出或 undefined
   */
  public async execute(input: string, agent: Agent): Promise<string | void> {
    const trimmed = input.trim();
    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    const command = this.commands.get(name);
    if (!command) {
      return chalk.red(`未知命令: /${name}。输入 /help 查看可用命令。`);
    }

    return command.handler(args, agent);
  }

  /**
   * 获取所有命令列表
   */
  public getCommands(): CommandDefinition[] {
    const seen = new Set<string>();
    const result: CommandDefinition[] = [];

    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 检查输入是否为命令
   */
  public static isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  /**
   * 注册默认命令
   */
  private registerDefaultCommands(): void {
    // /help
    this.register({
      name: 'help',
      aliases: ['h', '?'],
      description: '显示可用命令列表',
      handler: async () => {
        const cmds = this.getCommands();

        let output = chalk.cyan('\n=== 可用命令 ===\n\n');
        for (const cmd of cmds) {
          const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
          output += chalk.yellow(`/${cmd.name}${aliases}`);
          output += chalk.gray(` - ${cmd.description}\n`);
          if (cmd.usage) {
            output += chalk.gray(`  用法: ${cmd.usage}\n`);
          }
        }
        output += chalk.gray('\n直接输入文本即可与 Agent 对话。\n');
        return output;
      },
    });

    // /exit
    this.register({
      name: 'exit',
      aliases: ['quit', 'q'],
      description: '退出交互模式',
      handler: async () => {
        return 'EXIT_SIGNAL';
      },
    });

    // /clear
    this.register({
      name: 'clear',
      aliases: ['cls'],
      description: '清空当前对话上下文（保留系统提示词）',
      handler: async (_args, agent) => {
        agent.clearInteractiveContext();
        return chalk.green('✓ 对话上下文已清空');
      },
    });

    // /status
    this.register({
      name: 'status',
      aliases: ['st'],
      description: '显示当前会话状态',
      handler: async (_args, agent) => {
        const status = agent.getStatus();
        const stats = agent.getTokenUsageStats();

        let output = chalk.cyan('\n=== 会话状态 ===\n\n');
        output += `状态: ${status.state}\n`;
        if (status.sessionId) {
          output += `会话 ID: ${status.sessionId}\n`;
        }
        if (status.taskDescription) {
          output += `任务: ${status.taskDescription}\n`;
        }
        if (status.progress) {
          output += `进度: ${status.progress}\n`;
        }
        output += `\nToken 使用:\n`;
        output += `  总计: ${stats.totalTokens}\n`;
        output += `  调用次数: ${stats.totalCalls}\n`;
        return output;
      },
    });

    // /history
    this.register({
      name: 'history',
      aliases: ['hist'],
      description: '显示对话历史',
      handler: async (_args, agent) => {
        const ctx = agent['interactiveContext'] as
          | { workingMemory?: { getMessages: () => Array<{ role: string; content: string }> } }
          | undefined;

        if (!ctx?.workingMemory) {
          return chalk.yellow('暂无对话历史');
        }

        const messages = ctx.workingMemory.getMessages();
        if (messages.length <= 1) {
          return chalk.yellow('暂无对话历史');
        }

        let output = chalk.cyan('\n=== 对话历史 ===\n\n');
        for (const msg of messages) {
          if (msg.role === 'system') continue;
          const roleColor =
            msg.role === 'user'
              ? chalk.green
              : msg.role === 'assistant'
                ? chalk.blue
                : chalk.gray;
          const roleLabel =
            msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : msg.role;
          output += roleColor(`[${roleLabel}] `);
          output += msg.content.substring(0, 200);
          if (msg.content.length > 200) output += '...';
          output += '\n\n';
        }
        return output;
      },
    });

    // /tools
    this.register({
      name: 'tools',
      aliases: ['t'],
      description: '列出可用工具',
      handler: async (_args, agent) => {
        const tools = agent.getTools();
        let output = chalk.cyan('\n=== 可用工具 ===\n\n');
        for (const tool of tools) {
          output += `  • ${tool}\n`;
        }
        return output;
      },
    });

    // /model
    this.register({
      name: 'model',
      aliases: ['m'],
      description: '查看当前模型信息',
      usage: '/model',
      handler: async () => {
        return chalk.yellow('\n模型切换功能将在后续版本支持\n');
      },
    });

    // /compact
    this.register({
      name: 'compact',
      aliases: ['compact'],
      description: '压缩对话历史（简化版：清空非系统消息）',
      handler: async (_args, agent) => {
        agent.clearInteractiveContext();
        return chalk.green('✓ 对话历史已压缩（上下文已重置）');
      },
    });
  }
}
