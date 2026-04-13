# 代码规范与注释标准

## 概述

本文档规定了 AI Agent Core 项目的代码编写规范，特别是注释标准。**所有代码必须严格遵守本文档要求**。

---

## 核心原则

1. **代码即文档**：代码应该自解释，注释解释"为什么"而非"做什么"
2. **详尽注释**：每个公共 API、复杂逻辑、非直观代码都必须有注释
3. **中文注释**：所有注释使用中文，方便理解和学习
4. **及时更新**：修改代码时同步更新相关注释

---

## 文件头部注释

每个文件必须以标准头部注释开始：

```typescript
/**
 * @file {文件名}
 * @description {文件的主要功能和职责}
 *               {补充说明，如设计思路、关键概念}
 * @module {所属模块，如 llm/tools/memory}
 * @author AI Agent
 * @date {创建日期，如 2026-04-13}
 * @version {版本号，如 1.0.0}
 * 
 * @example
 * // 基本使用示例
 * const instance = new ClassName();
 * const result = await instance.method();
 * 
 * @see {@link 相关文件或文档路径}
 */

// 实际示例：
/**
 * @file ModelRegistry.ts
 * @description 模型注册中心，负责管理所有 LLM Provider 的注册、查询和生命周期管理。
 *              采用工厂模式实现，支持动态添加不同类型的模型提供商。
 *              是模型管理子系统的核心组件，被 LLMClient 依赖使用。
 * @module llm
 * @author AI Agent
 * @date 2026-04-13
 * @version 1.0.0
 * 
 * @example
 * // 注册 Provider 工厂
 * const registry = new ModelRegistry();
 * registry.registerFactory('anthropic', createAnthropicProvider);
 * 
 * // 添加并获取 Provider
 * registry.addProvider({ id: 'claude', type: 'anthropic', ... });
 * const provider = registry.get('claude');
 * 
 * @see {@link LLMClient.ts}
 * @see {@link MODEL_MANAGEMENT.md}
 */
```

**必须包含的字段：**
- `@file` - 文件名
- `@description` - 功能描述（可换行补充）
- `@module` - 所属模块
- `@date` - 创建日期

**可选字段：**
- `@author` - 作者
- `@version` - 版本
- `@example` - 使用示例
- `@see` - 相关链接

---

## 类/接口注释

```typescript
/**
 * {类的简要说明，一句话描述职责}
 * 
 * {详细说明：类的职责、使用场景、设计模式、重要概念解释}
 * {如果有生命周期，说明创建、使用、销毁的流程}
 * 
 * @template T - 泛型参数说明，约束条件
 * @implements {实现的接口名}
 * @extends {继承的类名}
 * 
 * @example
 * // 示例1：基本用法
 * const instance = new MyClass<string>(options);
 * 
 * // 示例2：复杂场景
 * const instance = new MyClass({
 *   debug: true,
 *   timeout: 5000
 * });
 * await instance.initialize();
 */
```

**实际示例：**
```typescript
/**
 * LLM Provider 注册表
 * 
 * 负责管理所有语言模型提供商的注册、查询和生命周期。
 * 采用工厂模式 + 注册表模式，实现 Provider 的动态发现和创建。
 * 
 * 核心概念：
 * - ProviderFactory: 创建 Provider 实例的工厂函数
 * - ProviderConfig: 创建 Provider 所需的配置信息
 * - 默认 Provider: 当未指定时使用，全局只有一个
 * 
 * 使用流程：
 * 1. 注册工厂（registerFactory）
 * 2. 添加配置（addProvider）
 * 3. 获取使用（get/getDefault）
 * 
 * @example
 * // 注册 Anthropic 工厂
 * registry.registerFactory('anthropic', (config) => {
 *   return new AnthropicProvider(config);
 * });
 * 
 * // 添加 Claude 模型配置
 * registry.addProvider({
 *   id: 'claude-sonnet',
 *   type: 'anthropic',
 *   modelName: 'claude-3-sonnet-20240229',
 *   apiKey: process.env.ANTHROPIC_API_KEY
 * });
 */
export class ModelRegistry {
  // ...
}
```

---

## 方法/函数注释

```typescript
/**
 * {方法的简要说明，使用动词开头}
 * 
 * {详细说明：业务逻辑、调用时机、注意事项}
 * 
 * @param {参数名} - {参数说明}
 *                   {补充说明：取值范围、格式要求、默认值}
 * @param {对象参数} - {对象说明}
 * @param {对象参数}.{属性} - {属性说明}
 * @returns {返回值说明，包括所有可能的返回类型}
 *          - 成功时返回...
 *          - 失败时返回...
 * @throws {异常类型} {抛出条件}
 * @async {如果是异步方法}
 * @deprecated {如果已废弃，说明替代方案}
 * 
 * @example
 * // 示例1：基本用法
 * const result = await methodName('input');
 * 
 * // 示例2：完整参数
 * const result = await methodName('input', {
 *   option1: true,
 *   option2: 5000
 * });
 * 
 * // 示例3：错误处理
 * try {
 *   await methodName('invalid');
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     // 处理验证错误
 *   }
 * }
 */
```

**实际示例：**
```typescript
/**
 * 添加新的模型提供商
 * 
 * 根据配置创建 Provider 实例并注册到系统中。
 * 如果配置中标记为默认模型，则会更新默认 Provider。
 * 重复添加相同 id 会抛出错误（需先 remove 再 add）。
 * 
 * @param config - Provider 配置对象
 * @param config.id - 唯一标识符，用于后续查询，如 'claude-sonnet'
 * @param config.type - Provider 类型，必须已注册对应工厂
 * @param config.modelName - 实际模型名称，如 'claude-3-sonnet-20240229'
 * @param config.apiKey - API 密钥（会被加密存储）
 * @param config.baseUrl - 可选，自定义 API 地址
 * @param config.isDefault - 是否设为默认模型，默认为 false
 * @returns 创建好的 Provider 实例
 * @throws {Error} 当 type 未注册工厂时抛出
 * @throws {DuplicateError} 当 id 已存在时抛出
 * 
 * @example
 * // 添加 Anthropic 模型
 * const provider = registry.addProvider({
 *   id: 'claude-prod',
 *   type: 'anthropic',
 *   modelName: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   isDefault: true
 * });
 * 
 * @example
 * // 添加本地 Ollama 模型
 * registry.addProvider({
 *   id: 'llama3-local',
 *   type: 'ollama',
 *   modelName: 'llama3:latest',
 *   baseUrl: 'http://localhost:11434'
 * });
 */
public addProvider(config: ProviderConfig): LLMProvider {
  // 实现代码...
}
```

---

## 属性/变量注释

### 类属性
```typescript
export class Example {
  /** 
   * 默认 Provider 的 ID
   * 当调用 getDefault() 时返回此 ID 对应的 Provider
   * 为 null 表示尚未设置默认 Provider
   */
  private defaultProviderId: string | null = null;
  
  /**
   * Provider 实例存储映射表
   * Key: Provider ID（用户自定义）
   * Value: Provider 实例
   */
  private providers: Map<string, LLMProvider> = new Map();
  
  /**
   * 工厂函数注册表
   * Key: Provider 类型（如 'anthropic', 'openai'）
   * Value: 工厂函数，用于创建对应类型的 Provider
   */
  private factories: Map<string, ProviderFactory> = new Map();
}
```

### 复杂变量
```typescript
/**
 * Provider 能力标识
 * 用于描述模型支持的功能特性，影响 Agent 的能力选择
 */
const capabilities: ModelCapabilities = {
  /** 是否支持视觉输入（图片理解） */
  supportsVision: true,
  
  /** 是否支持工具/函数调用 */
  supportsTools: true,
  
  /** 是否支持流式输出（实时返回） */
  supportsStreaming: true,
  
  /** 单次请求最大输出 token 数 */
  maxTokens: 4096,
  
  /** 上下文窗口总大小（输入+输出） */
  contextWindow: 200000
};
```

---

## 复杂逻辑注释

### 算法解释
```typescript
/**
 * 根据使用历史选择最佳模型
 * 
 * 算法思路：
 * 1. 获取候选模型的历史使用数据
 * 2. 计算加权得分：成功率(60%) + 平均速度(25%) + 成本效率(15%)
 * 3. 选择得分最高的模型
 * 4. 如果得分相同，优先选择优先级(priority)更高的
 * 
 * 注意：新模型（无历史数据）会获得一个基础分，确保有机会被选中
 */
private selectByQuality(candidates: ProviderMetadata[]): LLMProvider {
  // 实现代码...
}
```

### 边界情况处理
```typescript
// 使用倒序遍历删除数组元素
// 原因：如果正序遍历，删除前面元素会导致后面元素索引变化，
//       可能跳过某些元素或访问越界。倒序遍历时，删除当前元素
//       不会影响未遍历元素的索引。
for (let i = steps.length - 1; i >= 0; i--) {
  if (shouldRemove(steps[i])) {
    steps.splice(i, 1);
  }
}
```

### 工作绕说明
```typescript
// WORKAROUND: Anthropic API 目前不支持 system 角色的消息，
// 需要将 system 消息转换为 user 消息并添加特殊标记
// 参考：https://github.com/anthropics/anthropic-sdk-python/issues/
private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map(m => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: this.addSystemPrefix(m.content)
  }));
}
```

---

## 接口和类型注释

```typescript
/**
 * LLM Provider 统一接口
 * 
 * 所有语言模型提供商必须实现此接口，以确保 Agent 可以无缝切换不同模型。
 * 设计原则：最小公共子集，只包含所有模型都支持的核心功能。
 * 
 * @example
 * class MyProvider implements LLMProvider {
 *   async chat(messages, options) { ... }
 *   async chatStream(messages, options) { ... }
 *   calculateCost(promptTokens, completionTokens) { ... }
 *   async healthCheck() { ... }
 * }
 */
export interface LLMProvider {
  /** 元数据信息，包含能力标识和配置 */
  readonly metadata: ProviderMetadata;
  
  /**
   * 发送聊天消息并获取完整响应
   * 
   * 适用于需要完整结果后再处理的场景。
   * 如果模型支持工具调用且提供了 tools 参数，响应中可能包含 toolCalls。
   * 
   * @param messages - 对话历史，按时间顺序排列
   * @param options - 可选参数，控制生成行为
   * @returns 完整的响应，包含内容和用量统计
   */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  
  /**
   * 发送聊天消息并获取流式响应
   * 
   * 适用于需要实时显示结果的场景（如打字机效果）。
   * 通过 for await...of 消费流式数据。
   * 
   * @param messages - 对话历史
   * @param options - 可选参数
   * @yields 响应片段，包含部分内容和完成状态
   */
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatResponseChunk>;
}

/**
 * Provider 工厂函数类型
 * 
 * 用于动态创建 Provider 实例的函数签名。
 * 工厂模式使得新增 Provider 类型时无需修改核心代码。
 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;
```

---

## 代码块注释

### 条件分支
```typescript
/**
 * 根据策略选择 Provider
 * 
 * 各策略说明：
 * - default: 直接使用设置的默认模型，最简单
 * - cost: 选择历史平均成本最低的模型，适合批量处理
 * - quality: 选择历史成功率最高的模型，适合关键任务
 * - speed: 选择平均响应最快的模型，适合交互场景
 * - task_based: 根据任务类型智能选择，最灵活
 */
switch (strategy) {
  case 'default':
    return this.registry.getDefault();
    
  case 'cost':
    // 按历史平均成本排序，选择最低的
    return this.selectByCost(candidates);
    
  case 'quality':
    // 综合考量成功率和用户反馈
    return this.selectByQuality(candidates);
    
  // ... 其他分支
}
```

### 循环
```typescript
/**
 * ReAct 循环 - 核心执行逻辑
 * 
 * 循环执行直到满足以下任一条件：
 * 1. 任务完成（调用 terminate 工具）
 * 2. 达到最大迭代次数（防止死循环）
 * 3. 总执行时间超过限制
 * 4. 发生不可恢复的错误
 */
while (this.shouldContinue()) {
  // 1. 思考：分析当前状态
  const thought = await this.think();
  
  // 2. 决策：选择下一步行动
  const action = await this.decideAction(thought);
  
  // 3. 执行：调用工具
  const result = await this.execute(action);
  
  // 4. 观察：记录执行结果
  await this.observe(result);
  
  // 5. 验证：检查结果是否符合预期
  const verified = await this.verify(result);
  if (!verified) {
    // 需要调整策略
    await self.reflect();
  }
}
```

---

## 测试代码注释

```typescript
/**
 * ModelRegistry 单元测试
 * 
 * 测试覆盖：
 * - 工厂注册：registerFactory
 * - Provider 管理：addProvider, removeProvider, get, getDefault
 * - 列表查询：list, listByType
 * - 错误处理：重复注册、不存在的 Provider
 * 
 * @group llm
 * @group unit
 */
describe('ModelRegistry', () => {
  /** 每个测试用例前重置 Registry 状态 */
  beforeEach(() => {
    registry = new ModelRegistry();
  });
  
  /**
   * 测试：注册工厂函数
   * 
   * 验证点：
   * 1. 工厂函数正确存储
   * 2. 重复注册同一类型会覆盖
   * 3. 未注册的类型无法创建 Provider
   */
  describe('registerFactory', () => {
    it('应该正确注册工厂函数', () => {
      // 测试代码...
    });
    
    it('重复注册应该覆盖之前的工厂', () => {
      // 测试代码...
    });
  });
  
  /**
   * 测试：添加 Provider
   * 
   * 场景：正常添加、设为默认、重复 ID 错误
   */
  describe('addProvider', () => {
    it('添加第一个 Provider 时自动设为默认', async () => {
      // 测试代码...
    });
    
    it('重复 ID 应该抛出 DuplicateError', async () => {
      // 测试代码...
      // 预期：抛出异常，提示 id 已存在
    });
  });
});
```

---

## 错误处理和异常注释

```typescript
/**
 * 执行 LLM 调用并处理故障切换
 * 
 * 故障切换策略：
 * 1. 首先尝试使用指定的 Provider
 * 2. 如果遇到速率限制(429)，等待后重试（指数退避）
 * 3. 如果重试失败或遇到其他错误，切换到备用 Provider
 * 4. 如果所有 Provider 都失败，抛出最后一个错误
 * 
 * @throws {RateLimitError} 所有 Provider 都触发速率限制
 * @throws {LLMError} 其他 API 错误
 */
private async executeWithFallback<T>(
  fn: () => Promise<T>,
  options: FallbackOptions
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // 判断是否可重试错误
      if (this.isRetryableError(error)) {
        // 指数退避：1s, 2s, 4s...
        const delayMs = Math.pow(2, attempt) * 1000;
        await this.sleep(delayMs);
        continue;
      }
      
      // 不可重试错误，切换到备用模型
      if (options.fallbackProvider) {
        return this.tryFallback(options.fallbackProvider, fn);
      }
      
      // 没有备用方案，抛出错误
      throw error;
    }
  }
  
  throw lastError;
}
```

---

## 配置项注释

```typescript
/**
 * Agent 配置接口
 * 
 * 所有配置项都有合理的默认值，可以在 config/default.yaml 中覆盖。
 */
interface AgentConfig {
  /**
   * 单任务最大迭代次数
   * 
   * 防止 ReAct 循环无限执行。如果达到此限制仍未完成，
   * Agent 会返回部分结果并提示用户。
   * 
   * @default 50
   * @minimum 1
   * @maximum 1000
   */
  maxIterations: number;
  
  /**
   * 单任务超时时间（毫秒）
   * 
   * 包括所有工具执行和 LLM 调用的时间总和。
   * 长时间任务应该拆分为多个子任务。
   * 
   * @default 300000 (5分钟)
   * @minimum 10000 (10秒)
   */
  timeoutMs: number;
  
  /**
   * 是否启用人工确认
   * 
   * 开启后，执行危险操作（如删除文件、执行命令）前会询问用户。
   * 生产环境建议开启，自动化场景可以关闭。
   * 
   * @default true
   */
  enableHumanConfirm: boolean;
}
```

---

## 注释检查清单

提交代码前，请确认以下检查项：

### 文件级别
- [ ] 文件头部有标准注释块
- [ ] 包含 @file 和 @description
- [ ] 包含使用示例（如果文件是入口或核心模块）

### 类/接口级别
- [ ] 每个公共类/接口都有 JSDoc 注释
- [ ] 说明类的职责和使用场景
- [ ] 复杂类包含使用示例

### 方法级别
- [ ] 每个公共方法都有完整 JSDoc
- [ ] 所有参数都有 @param 说明
- [ ] 返回值有 @returns 说明
- [ ] 可能抛出的异常有 @throws 说明

### 代码块级别
- [ ] 复杂算法有实现思路说明
- [ ] 边界情况有处理说明
- [ ] 临时解决方案有 WORKAROUND 标记
- [ ] 性能敏感的代码有优化说明

### 变量级别
- [ ] 类属性有说明用途的注释
- [ ] 配置项有默认值和取值范围说明
- [ ] 魔法数字有常量定义和说明

---

## 示例：完整注释的文件

```typescript
/**
 * @file TokenBudgetManager.ts
 * @description Token 预算管理器，负责监控和控制 LLM API 的 Token 使用量。
 *              实现软限制和硬限制两级控制，防止意外超出预算。
 *              当接近限制时，自动触发上下文压缩策略。
 * @module llm
 * @author AI Agent
 * @date 2026-04-13
 * @version 1.0.0
 * 
 * @example
 * const budget = new TokenBudgetManager({
 *   softLimit: 80000,   // 80% 时警告
 *   hardLimit: 100000   // 100% 时停止
 * });
 * 
 * budget.recordUsage({ promptTokens: 1000, completionTokens: 500 });
 * 
 * if (budget.shouldCompress()) {
 *   await compressContext();
 * }
 * 
 * if (budget.isExceeded()) {
 *   throw new BudgetExceededError('Token 预算已用完');
 * }
 */

import { UsageRecord } from '../types';

/**
 * Token 预算配置
 */
interface BudgetConfig {
  /** 
   * 硬限制 - 绝对不能超过的 Token 数
   * 达到此限制后将拒绝新的请求
   */
  hardLimit: number;
  
  /**
   * 软限制 - 警告阈值
   * 达到此限制时触发压缩策略，尝试减少 Token 使用
   * 建议设置为 hardLimit 的 80%
   */
  softLimit: number;
  
  /**
   * 会话 ID，用于关联使用记录
   */
  sessionId?: string;
}

/**
 * Token 预算管理器
 * 
 * 使用滑动窗口统计近期 Token 使用量，支持动态调整限制。
 * 所有使用记录会持久化到 SQLite，便于成本分析。
 */
export class TokenBudgetManager {
  /** 当前总会话已用 Token 数 */
  private totalUsed: number = 0;
  
  /** 配置信息 */
  private config: BudgetConfig;
  
  /** 使用记录存储（用于持久化） */
  private storage: UsageStorage;
  
  /**
   * 创建预算管理器实例
   * 
   * @param config - 预算配置
   * @param storage - 可选，自定义存储实现（用于测试）
   */
  constructor(config: BudgetConfig, storage?: UsageStorage) {
    this.config = {
      softLimit: config.hardLimit * 0.8,
      ...config
    };
    this.storage = storage || new SQLiteUsageStorage();
  }
  
  /**
   * 记录一次 Token 使用
   * 
   * 同时更新内存中的统计和持久化存储。
   * 如果这次使用会超出硬限制，将抛出错误。
   * 
   * @param usage - 使用量信息
   * @param usage.promptTokens - 输入 Token 数
   * @param usage.completionTokens - 输出 Token 数
   * @throws {BudgetExceededError} 如果超出硬限制
   * 
   * @example
   * // 正常记录
   * budget.recordUsage({ promptTokens: 1000, completionTokens: 500 });
   * 
   * @example
   * // 检查剩余预算
   * const remaining = budget.getRemaining();
   * if (remaining < estimatedNeed) {
   *   // 处理预算不足
   * }
   */
  public async recordUsage(usage: UsageRecord): Promise<void> {
    const total = usage.promptTokens + usage.completionTokens;
    
    // 预检查：是否会超出硬限制
    if (this.totalUsed + total > this.config.hardLimit) {
      throw new BudgetExceededError(
        `Token 预算不足。剩余: ${this.config.hardLimit - this.totalUsed}, ` +
        `需要: ${total}`
      );
    }
    
    this.totalUsed += total;
    
    // 持久化到数据库
    await this.storage.save({
      sessionId: this.config.sessionId,
      ...usage,
      timestamp: new Date()
    });
  }
  
  /**
   * 检查是否达到软限制（需要压缩上下文）
   * 
   * @returns true 如果已用 Token 超过 softLimit
   */
  public shouldCompress(): boolean {
    return this.totalUsed >= this.config.softLimit;
  }
  
  /**
   * 检查是否超出硬限制
   * 
   * @returns true 如果已用 Token 超过 hardLimit
   */
  public isExceeded(): boolean {
    return this.totalUsed >= this.config.hardLimit;
  }
  
  /**
   * 获取剩余可用 Token 数
   */
  public getRemaining(): number {
    return Math.max(0, this.config.hardLimit - this.totalUsed);
  }
  
  /**
   * 获取使用统计信息
   * 
   * @returns 包含总量、百分比、剩余量的统计对象
   */
  public getStats(): BudgetStats {
    const percentage = (this.totalUsed / this.config.hardLimit) * 100;
    
    return {
      used: this.totalUsed,
      hardLimit: this.config.hardLimit,
      softLimit: this.config.softLimit,
      remaining: this.getRemaining(),
      percentage: Math.round(percentage * 100) / 100,
      status: this.getStatus()
    };
  }
  
  /**
   * 根据使用量确定当前状态
   * 
   * - safe: 低于软限制，正常使用
   * - warning: 超过软限制但未达硬限制，建议压缩
   * - critical: 接近硬限制，谨慎使用
   * - exceeded: 已超出硬限制，拒绝服务
   */
  private getStatus(): 'safe' | 'warning' | 'critical' | 'exceeded' {
    if (this.isExceeded()) return 'exceeded';
    if (this.totalUsed > this.config.hardLimit * 0.95) return 'critical';
    if (this.shouldCompress()) return 'warning';
    return 'safe';
  }
}

// 导出类型
export { BudgetConfig, BudgetStats, UsageRecord };
```

---

## 强制执行

**本规范是强制性要求**：

1. **Code Review**: 所有代码提交前必须自我审查注释质量
2. **CI 检查**: 后续可能会添加自动化注释覆盖率检查
3. **文档同步**: 修改代码时必须同步更新相关注释

**违反后果**：
- 不完整的注释需要在合并前补充
- 错误的注释比没有注释更严重，必须及时修正

---

*文档版本: 1.0*
*创建日期: 2026-04-13*
*适用范围: AI Agent Core 项目所有 TypeScript 代码*
