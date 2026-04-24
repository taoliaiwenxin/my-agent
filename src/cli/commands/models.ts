/**
 * @file models.ts
 * @description 模型管理 CLI 命令
 *              实现 models list, add, remove, set-default, test 等命令
 * @module cli/commands
 * @author AI Agent
 * @date 2026-04-22
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { SQLiteClient } from '../../memory/SQLiteClient';
import { ModelManager, ModelConfigInput } from '../ModelManager';
import { createAnthropicProvider } from '../../llm/providers/AnthropicProvider';
import { createOpenAIProvider } from '../../llm/providers/OpenAIProvider';

/**
 * 创建模型管理命令
 *
 * @returns Commander 命令
 */
export function createModelsCommand(): Command {
  const command = new Command('models');

  command
    .description('管理 LLM 模型配置')
    .addCommand(createListCommand())
    .addCommand(createAddCommand())
    .addCommand(createRemoveCommand())
    .addCommand(createSetDefaultCommand())
    .addCommand(createTestCommand());

  return command;
}

/**
 * 创建数据库连接
 */
async function createDb(): Promise<SQLiteClient> {
  const db = new SQLiteClient('./storage/agent.db');
  await db.connect();
  return db;
}

/**
 * list 命令
 */
function createListCommand(): Command {
  return new Command('list')
    .description('列出所有已配置的模型')
    .option('-a, --all', '显示所有模型（包括禁用的）', false)
    .action(async (options) => {
      const spinner = ora('加载模型列表...').start();

      try {
        const db = await createDb();
        const manager = new ModelManager(db);
        const models = await manager.listModels();
        await db.close();

        spinner.stop();

        const displayModels = options.all
          ? models
          : models.filter((m) => m.is_active);

        if (displayModels.length === 0) {
          console.log(chalk.yellow('暂无配置的模型'));
          console.log(chalk.gray('使用 `ai-agent models add` 添加模型'));
          return;
        }

        console.log(chalk.bold('\n已配置的模型:\n'));

        for (const model of displayModels) {
          const isDefault = model.is_default ? chalk.green(' [默认]') : '';
          const isActive = model.is_active
            ? chalk.green('●')
            : chalk.gray('○');
          const typeLabel = chalk.cyan(`[${model.provider_type}]`);

          console.log(
            `${isActive} ${chalk.bold(model.id)}${isDefault} ${typeLabel}`
          );
          console.log(`   名称: ${model.name}`);
          console.log(`   模型: ${model.model_name}`);
          if (model.base_url) {
            console.log(`   地址: ${model.base_url}`);
          }
          console.log(
            `   能力: ${formatCapabilities(model)}`
          );
          if (!model.is_active) {
            console.log(chalk.gray('   状态: 已禁用'));
          }
          console.log();
        }

        console.log(chalk.gray(`共 ${displayModels.length} 个模型`));
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('错误:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * add 命令
 */
function createAddCommand(): Command {
  return new Command('add')
    .description('添加新模型')
    .option('-i, --id <id>', '模型唯一标识')
    .option('-n, --name <name>', '显示名称')
    .option('-t, --type <type>', '提供商类型 (anthropic/openai)')
    .option('-m, --model <model>', '模型名称')
    .option('-k, --api-key <key>', 'API Key')
    .option('-b, --base-url <url>', '自定义 API 地址')
    .option('--vision', '支持视觉', false)
    .option('--no-tools', '不支持工具调用')
    .option('--no-streaming', '不支持流式输出')
    .option('--max-tokens <n>', '最大 Token 数', '4096')
    .option('--rpm <n>', '每分钟请求限制')
    .option('--daily-cost <n>', '每日成本限制 (USD)')
    .option('--default', '设为默认模型', false)
    .option('--interactive', '交互式添加', false)
    .action(async (options) => {
      try {
        const db = await createDb();
        const manager = new ModelManager(db);

        let input: ModelConfigInput;

        if (options.interactive || !options.id) {
          input = await interactiveAdd(options);
        } else {
          input = {
            id: options.id,
            name: options.name || options.id,
            provider_type: options.type,
            model_name: options.model,
            api_key: options.apiKey,
            base_url: options.baseUrl,
            supports_vision: options.vision,
            supports_tools: options.tools,
            supports_streaming: options.streaming,
            max_tokens: parseInt(options.maxTokens, 10),
            rpm_limit: options.rpm ? parseInt(options.rpm, 10) : undefined,
            daily_cost_limit: options.dailyCost
              ? parseFloat(options.dailyCost)
              : undefined,
            is_default: options.default,
          };
        }

        // 验证必填字段
        if (!input.provider_type) {
          console.error(chalk.red('错误: 必须指定提供商类型'));
          process.exit(1);
        }
        if (!input.model_name) {
          console.error(chalk.red('错误: 必须指定模型名称'));
          process.exit(1);
        }

        const spinner = ora('添加模型...').start();
        const model = await manager.addModel(input);
        await db.close();

        spinner.stop();

        console.log(chalk.green(`✓ 模型 "${model.id}" 添加成功`));
        console.log(`  名称: ${model.name}`);
        console.log(`  类型: ${model.provider_type}`);
        console.log(`  模型: ${model.model_name}`);

        if (model.is_default) {
          console.log(chalk.green('  已设为默认模型'));
        }

        // 自动测试连接
        if (input.api_key) {
          console.log(chalk.gray('\n正在测试连接...'));
          await testModelConnection(model);
        }
      } catch (error) {
        console.error(
          chalk.red('错误:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}

/**
 * remove 命令
 */
function createRemoveCommand(): Command {
  return new Command('remove')
    .description('删除模型')
    .argument('<id>', '模型 ID')
    .option('-y, --yes', '跳过确认', false)
    .action(async (id: string, options) => {
      try {
        const db = await createDb();
        const manager = new ModelManager(db);

        const model = await manager.getModel(id);
        if (!model) {
          console.error(chalk.red(`错误: 模型 "${id}" 不存在`));
          process.exit(1);
        }

        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `确认删除模型 "${model.name}" (${id})?`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.yellow('已取消删除'));
            await db.close();
            return;
          }
        }

        const spinner = ora('删除模型...').start();
        const removed = await manager.removeModel(id);
        await db.close();

        spinner.stop();

        if (removed) {
          console.log(chalk.green(`✓ 模型 "${id}" 已删除`));
        } else {
          console.log(chalk.yellow(`模型 "${id}" 删除失败`));
        }
      } catch (error) {
        console.error(
          chalk.red('错误:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}

/**
 * set-default 命令
 */
function createSetDefaultCommand(): Command {
  return new Command('set-default')
    .description('设置默认模型')
    .argument('<id>', '模型 ID')
    .action(async (id: string) => {
      try {
        const spinner = ora('设置默认模型...').start();

        const db = await createDb();
        const manager = new ModelManager(db);
        const model = await manager.setDefault(id);
        await db.close();

        spinner.stop();

        console.log(
          chalk.green(`✓ "${model.name}" (${model.id}) 已设为默认模型`)
        );
      } catch (error) {
        console.error(
          chalk.red('错误:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}

/**
 * test 命令
 */
function createTestCommand(): Command {
  return new Command('test')
    .description('测试模型连接')
    .argument('<id>', '模型 ID')
    .action(async (id: string) => {
      try {
        const db = await createDb();
        const manager = new ModelManager(db);
        const model = await manager.getModel(id);
        await db.close();

        if (!model) {
          console.error(chalk.red(`错误: 模型 "${id}" 不存在`));
          process.exit(1);
        }

        await testModelConnection(model);
      } catch (error) {
        console.error(
          chalk.red('错误:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}

// ==================== 辅助函数 ====================

/**
 * 交互式添加模型
 */
async function interactiveAdd(
  defaults: Record<string, unknown>
): Promise<ModelConfigInput> {
  console.log(chalk.bold('\n添加新模型\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider_type',
      message: '选择提供商类型:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
      ],
      default: defaults.type || 'anthropic',
    },
    {
      type: 'input',
      name: 'id',
      message: '输入模型 ID (唯一标识):',
      default: defaults.id,
      validate: (input: string) =>
        input.trim().length > 0 || '模型 ID 不能为空',
    },
    {
      type: 'input',
      name: 'name',
      message: '输入显示名称:',
      default: (answers: Record<string, unknown>) =>
        defaults.name || answers.id,
    },
    {
      type: 'list',
      name: 'model_name',
      message: '选择模型:',
      choices: (answers: Record<string, unknown>) => {
        if (answers.provider_type === 'anthropic') {
          return [
            { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
            { name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
            { name: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
          ];
        }
        return [
          { name: 'GPT-4o', value: 'gpt-4o' },
          { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        ];
      },
      default: defaults.model,
    },
    {
      type: 'password',
      name: 'api_key',
      message: '输入 API Key:',
      mask: '*',
      default: defaults.apiKey,
    },
    {
      type: 'confirm',
      name: 'use_custom_url',
      message: '是否需要自定义 API 地址?',
      default: false,
      when: () => !defaults.baseUrl,
    },
    {
      type: 'input',
      name: 'base_url',
      message: '输入自定义 API 地址:',
      when: (answers: Record<string, unknown>) =>
        answers.use_custom_url || !!defaults.baseUrl,
      default: defaults.baseUrl,
    },
    {
      type: 'confirm',
      name: 'is_default',
      message: '设为默认模型?',
      default: defaults.default || false,
    },
  ]);

  return {
    id: answers.id as string,
    name: answers.name as string,
    provider_type: answers.provider_type as string,
    model_name: answers.model_name as string,
    api_key: (answers.api_key as string) || undefined,
    base_url: (answers.base_url as string) || undefined,
    is_default: answers.is_default as boolean,
  };
}

/**
 * 测试模型连接
 */
async function testModelConnection(model: {
  provider_type: string;
  model_name: string;
  api_key_encrypted?: string | null;
  base_url?: string | null;
}): Promise<void> {
  const spinner = ora(`测试 ${model.model_name} 连接...`).start();

  try {
    if (!model.api_key_encrypted) {
      spinner.stop();
      console.log(chalk.yellow('⚠ 未配置 API Key，跳过连接测试'));
      return;
    }

    let provider;
    if (model.provider_type === 'anthropic') {
      provider = createAnthropicProvider({
        id: 'test',
        type: 'anthropic',
        modelName: model.model_name,
        apiKey: model.api_key_encrypted,
        baseUrl: model.base_url || undefined,
      });
    } else if (model.provider_type === 'openai') {
      provider = createOpenAIProvider({
        id: 'test',
        type: 'openai',
        modelName: model.model_name,
        apiKey: model.api_key_encrypted,
        baseUrl: model.base_url || undefined,
      });
    } else {
      spinner.stop();
      console.log(chalk.yellow(`⚠ 不支持测试 ${model.provider_type} 类型的连接`));
      return;
    }

    const result = await provider.testConnection();
    spinner.stop();

    if (result.success) {
      console.log(chalk.green(`✓ ${result.message}`));
    } else {
      console.log(chalk.red(`✗ ${result.message}`));
    }
  } catch (error) {
    spinner.stop();
    console.log(
      chalk.red('✗ 连接测试失败:'),
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * 格式化能力标签
 */
function formatCapabilities(model: {
  supports_vision: boolean;
  supports_tools: boolean;
  supports_streaming: boolean;
  max_tokens: number;
}): string {
  const caps: string[] = [];

  if (model.supports_vision) caps.push('视觉');
  if (model.supports_tools) caps.push('工具');
  if (model.supports_streaming) caps.push('流式');
  caps.push(`max_tokens=${model.max_tokens}`);

  return caps.join(', ');
}
