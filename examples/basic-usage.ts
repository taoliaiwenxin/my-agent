/**
 * @file basic-usage.ts
 * @description 基础使用示例 - 演示如何创建 Agent 并执行任务
 *
 * 运行方式:
 *   npx ts-node examples/basic-usage.ts
 *
 * 前提条件:
 *   - 设置 ANTHROPIC_API_KEY 环境变量
 */

import { createAgent } from '../src/core/Agent';
import { LLMClient } from '../src/llm/LLMClient';

async function main() {
  // 检查 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('请设置 ANTHROPIC_API_KEY 环境变量');
    process.exit(1);
  }

  // 创建 LLM 客户端
  const llmClient = new LLMClient();
  llmClient.registerAnthropicProvider({
    id: 'claude-default',
    modelName: 'claude-3-5-sonnet-20241022',
    apiKey,
  });

  // 创建 Agent
  const agent = createAgent({
    dbPath: './storage/examples.db',
    llmClient,
    permissionLevel: 'execute',
    allowedPaths: [process.cwd()],
    agentConfig: {
      maxIterations: 10,
      timeoutMs: 120000,
    },
  });

  // 监听事件
  agent.onEvent((event) => {
    if (event.type === 'session:start') {
      console.log(`开始会话: ${event.sessionId}`);
    }
  });

  try {
    // 执行任务
    const result = await agent.runTask(
      '请读取当前目录下的 package.json 文件，并告诉我项目的名称和版本'
    );

    console.log('\n--- 执行结果 ---');
    console.log(`成功: ${result.success}`);
    console.log(`结果: ${result.result}`);
    console.log(`步骤数: ${result.totalIterations}`);
    console.log(`耗时: ${result.totalTimeMs}ms`);
    console.log(`Token: ${result.tokenUsage.total}`);
  } finally {
    await agent.shutdown();
  }
}

main().catch(console.error);
