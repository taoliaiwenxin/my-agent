/**
 * @file file-operations.ts
 * @description 文件操作示例 - 演示读写文件
 *
 * 运行方式:
 *   npx ts-node examples/file-operations.ts
 *
 * 前提条件:
 *   - 设置 ANTHROPIC_API_KEY 环境变量
 */

import { createAgent } from '../src/core/Agent';
import { LLMClient } from '../src/llm/LLMClient';

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('请设置 ANTHROPIC_API_KEY 环境变量');
    process.exit(1);
  }

  const llmClient = new LLMClient();
  llmClient.registerAnthropicProvider({
    id: 'claude-default',
    modelName: 'claude-3-5-sonnet-20241022',
    apiKey,
  });

  const agent = createAgent({
    dbPath: './storage/examples.db',
    llmClient,
    permissionLevel: 'write',
    allowedPaths: [process.cwd(), './temp'],
    agentConfig: {
      maxIterations: 5,
      timeoutMs: 60000,
    },
  });

  try {
    const result = await agent.runTask(
      '请创建一个文件 ./temp/example-output.txt，内容为 "Hello from AI Agent!"'
    );

    console.log('执行结果:', result.success ? '成功' : '失败');
    if (result.result) {
      console.log('结果:', result.result);
    }
  } finally {
    await agent.shutdown();
  }
}

main().catch(console.error);
