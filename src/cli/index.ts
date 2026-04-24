#!/usr/bin/env node
/**
 * @file index.ts
 * @description CLI 入口，提供命令行交互界面
 * @module cli
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Agent, createAgent } from '../core/Agent';
import { LLMClient } from '../llm/LLMClient';
import { ConfigLoader } from '../config/ConfigLoader';
import { createModelsCommand } from './commands/models';

const program = new Command();

program
  .name('ai-agent')
  .description('AI Agent Core - 智能任务执行代理')
  .version('1.0.0');

// 注册子命令
program.addCommand(createModelsCommand());

program
  .argument('[task]', '要执行的任务描述')
  .option('-p, --permission <level>', '权限级别 (read/write/execute)', 'execute')
  .option('-d, --db <path>', '数据库路径')
  .option('-m, --max-iterations <n>', '最大迭代次数', '20')
  .option('--no-stream', '禁用流式输出')
  .action(async (task: string | undefined, options) => {
    try {
      const config = ConfigLoader.getInstance();

      // 加载配置
      const dbPath = options.db || config.get<string>('database.path', './storage/agent.db');
      const maxIterations = parseInt(options.maxIterations, 10);
      const permissionLevel = options.permission;

      // 检查 API Key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(chalk.red('错误: 未设置 ANTHROPIC_API_KEY 环境变量'));
        console.error(chalk.yellow('请设置环境变量后再运行:\n  export ANTHROPIC_API_KEY=your-api-key'));
        process.exit(1);
      }

      // 创建 LLM 客户端
      const llmClient = new LLMClient();
      llmClient.registerAnthropicProvider({
        id: 'claude-default',
        modelName: config.get<string>('models.default', 'claude-3-5-sonnet-20241022'),
        apiKey,
      });

      // 如果没有提供任务，进入交互模式
      let taskDescription = task;
      if (!taskDescription) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'task',
            message: '请输入要执行的任务:',
            validate: (input: string) => input.trim().length > 0 || '任务描述不能为空',
          },
        ]);
        taskDescription = answers.task;
      }

      // 创建 Agent
      const agent = createAgent({
        dbPath,
        llmClient,
        permissionLevel: permissionLevel as 'read' | 'write' | 'execute',
        allowedPaths: [process.cwd()],
        agentConfig: {
          maxIterations,
          timeoutMs: 300000,
        },
      });

      // 设置事件监听
      setupEventListeners(agent);

      // 执行
      const spinner = ora('正在初始化 Agent...').start();

      try {
        await agent.initialize();
        spinner.text = '正在执行任务...';

        const result = await agent.runTask(taskDescription!);

        spinner.stop();

        if (result.success) {
          console.log(chalk.green('\n✓ 任务完成'));
          if (result.result) {
            console.log(chalk.cyan('\n结果:'));
            console.log(result.result);
          }
        } else {
          console.log(chalk.red('\n✗ 任务失败'));
          if (result.error) {
            console.log(chalk.red('\n错误:'));
            console.log(result.error);
          }
        }

        console.log(chalk.gray(`\n执行了 ${result.totalIterations} 步，耗时 ${result.totalTimeMs}ms`));
        console.log(chalk.gray(`Token 使用: ${result.tokenUsage.total} (输入: ${result.tokenUsage.prompt}, 输出: ${result.tokenUsage.completion})`));

        // 关闭
        await agent.shutdown();
      } catch (error) {
        spinner.stop();
        throw error;
      }
    } catch (error) {
      console.error(chalk.red('\n执行出错:'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * 设置 Agent 事件监听
 */
function setupEventListeners(agent: Agent): void {
  agent.onEvent((event) => {
    switch (event.type) {
      case 'session:start':
        console.log(chalk.blue('\n▶ 开始新会话'));
        break;
      case 'session:end':
        // 结果已在主流程中输出
        break;
      case 'step':
        // 可以在这里显示步骤详情
        break;
      case 'error':
        console.error(chalk.red('\n⚠ 发生错误:'));
        console.error(event.data);
        break;
    }
  });
}

// 解析命令行参数
program.parse();
