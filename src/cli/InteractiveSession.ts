/**
 * @file InteractiveSession.ts
 * @description 交互会话管理器，提供类似 Claude Code 的持续对话体验
 * @module cli
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { Agent } from '../core/Agent';
import { CommandRegistry } from './CommandRegistry';

/**
 * 交互会话配置
 */
export interface InteractiveSessionOptions {
  /** 是否显示思考过程 */
  showThinking?: boolean;
  /** 提示符 */
  prompt?: string;
}

/**
 * 交互会话
 *
 * 管理整个交互体验：
 * - readline 输入循环
 * - / 命令解析
 * - 事件驱动的输出渲染
 * - 优雅退出
 */
export class InteractiveSession {
  private agent: Agent;
  private registry: CommandRegistry;
  private rl: readline.Interface;
  private options: Required<InteractiveSessionOptions>;
  private isRunning = false;
  private currentSpinner: string | null = null;

  constructor(agent: Agent, options?: InteractiveSessionOptions) {
    this.agent = agent;
    this.registry = new CommandRegistry();
    this.options = {
      showThinking: options?.showThinking ?? false,
      prompt: options?.prompt ?? '> ',
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan(this.options.prompt),
    });
  }

  /**
   * 启动交互会话
   */
  public async start(taskDescription?: string): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 启动交互会话
    await this.agent.startInteractiveSession(taskDescription);

    // 设置事件监听
    this.setupEventListeners();

    // 设置 SIGINT 处理
    this.setupSignalHandlers();

    // 显示欢迎信息
    this.printWelcome();

    // 启动输入循环
    this.rl.prompt();

    this.rl.on('line', async (input) => {
      await this.handleInput(input);
      if (this.isRunning) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.shutdown();
    });

    // 等待会话结束
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!this.isRunning) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * 处理用户输入
   */
  private async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();

    // 空输入忽略
    if (!trimmed) return;

    // 命令处理
    if (CommandRegistry.isCommand(trimmed)) {
      const result = await this.registry.execute(trimmed, this.agent);

      if (result === 'EXIT_SIGNAL') {
        console.log(chalk.yellow('再见!'));
        await this.shutdown();
        return;
      }

      if (result) {
        console.log(result);
      }
      return;
    }

    // 用户消息处理
    await this.handleUserMessage(trimmed);
  }

  /**
   * 处理用户消息
   */
  private async handleUserMessage(message: string): Promise<void> {
    try {
      const result = await this.agent.sendInteractiveMessage(message);

      if (result.success && result.result) {
        console.log(chalk.cyan('\n' + result.result + '\n'));
      } else if (result.error) {
        console.log(chalk.red('\n错误: ' + result.error + '\n'));
      }
    } catch (error) {
      console.error(
        chalk.red('\n处理消息时出错:'),
        error instanceof Error ? error.message : String(error),
        '\n'
      );
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.agent.onEvent((event) => {
      switch (event.type) {
        case 'step': {
          const data = event.data as
            | { type: string; iteration: number; data?: Record<string, unknown> }
            | undefined;
          if (!data) return;

          switch (data.type) {
            case 'iteration:start':
              this.currentSpinner = '思考';
              process.stdout.write(chalk.gray('\n▶ 正在思考...'));
              break;

            case 'think':
              if (this.options.showThinking && data.data?.thought) {
                process.stdout.write('\n' + chalk.gray(String(data.data.thought).substring(0, 100)));
              }
              break;

            case 'act': {
              const action = data.data?.action as
                | { toolName?: string; parameters?: Record<string, unknown> }
                | undefined;
              if (action?.toolName) {
                const params = action.parameters
                  ? JSON.stringify(action.parameters).substring(0, 80)
                  : '';
                process.stdout.write(
                  chalk.yellow(`\n▶ 执行: ${action.toolName}(${params})`)
                );
              }
              break;
            }

            case 'execute': {
              const execResult = data.data?.result as
                | { success?: boolean }
                | undefined;
              const icon = execResult?.success !== false ? chalk.green(' ✓') : chalk.red(' ✗');
              process.stdout.write(icon);
              break;
            }

            case 'observe':
              // 观察结果通常很详细，简要显示即可
              break;

            case 'complete': {
              const result = data.data?.result as string | undefined;
              if (result) {
                process.stdout.write(chalk.green('\n✓ 完成'));
              }
              this.currentSpinner = null;
              break;
            }

            case 'error': {
              const errorMsg = data.data?.error as string | undefined;
              if (errorMsg) {
                process.stdout.write(chalk.red(`\n✗ 错误: ${errorMsg.substring(0, 100)}`));
              }
              this.currentSpinner = null;
              break;
            }

            case 'iteration:end':
              // 迭代结束，换行
              if (this.currentSpinner) {
                process.stdout.write('\n');
                this.currentSpinner = null;
              }
              break;
          }
          break;
        }

        case 'interactive:message':
          // 交互消息事件，用于调试
          break;

        case 'interactive:response':
          // 响应已在 handleUserMessage 中处理
          break;

        case 'error':
          console.error(chalk.red('\n⚠ Agent 错误:'), event.data);
          break;
      }
    });
  }

  /**
   * 设置信号处理器
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n收到中断信号，正在保存会话...'));
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * 显示欢迎信息
   */
  private printWelcome(): void {
    console.log(chalk.cyan('\n=== AI Agent 交互模式 ===\n'));
    console.log(chalk.gray('输入消息与 Agent 对话，或输入 /help 查看可用命令。'));
    console.log(chalk.gray('按 Ctrl+C 退出。\n'));
  }

  /**
   * 关闭交互会话
   */
  private async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    this.rl.close();

    try {
      await this.agent.endInteractiveSession();
      await this.agent.shutdown();
    } catch {
      // 忽略关闭错误
    }
  }
}
