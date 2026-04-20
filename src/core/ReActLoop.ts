/**
 * @file ReActLoop.ts
 * @description ReAct (Reasoning + Acting) 核心循环实现
 *              实现 THINK → ACT → EXECUTE → OBSERVE → VERIFY → REFLECT 循环
 * @module core
 * @author AI Agent
 * @date 2026-04-20
 * @version 1.0.0
 *
 * @example
 * const loop = new ReActLoop({
 *   llmClient,
 *   toolExecutor,
 *   memorySystem,
 *   maxIterations: 10
 * });
 *
 * const result = await loop.run(sessionId, workingMemory, '分析代码库');
 */

import { LLMClient } from '../llm/LLMClient';
import { ToolExecutor } from '../tools/ToolExecutor';
import { MemorySystem } from '../memory/MemorySystem';
import { WorkingMemory } from '../memory/WorkingMemory';
import { ObservationGenerator } from './ObservationGenerator';
import { ThoughtParser, ParsedThought } from './ThoughtParser';
import { buildReActSystemPrompt } from '../llm/prompts/react';
import {
  Step,
  Observation,
  Reflection,
  AgentAction,
  StepStatus,
  ToolExecutionResult,
} from '../types';

/**
 * ReAct 循环配置
 */
export interface ReActLoopConfig {
  /** LLM 客户端 */
  llmClient: LLMClient;

  /** 工具执行器 */
  toolExecutor: ToolExecutor;

  /** 记忆系统 */
  memorySystem: MemorySystem;

  /** 最大迭代次数 */
  maxIterations?: number;

  /** 单步超时时间（毫秒） */
  stepTimeoutMs?: number;

  /** 是否启用反思 */
  enableReflection?: boolean;

  /** 是否启用验证 */
  enableVerification?: boolean;

  /** 观察摘要最大长度 */
  observationMaxLength?: number;
}

/**
 * 循环执行结果
 */
export interface ReActLoopResult {
  /** 是否成功完成 */
  success: boolean;

  /** 最终结果 */
  result?: string;

  /** 执行的步骤列表 */
  steps: Step[];

  /** 总迭代次数 */
  totalIterations: number;

  /** 总耗时（毫秒） */
  totalTimeMs: number;

  /** 错误信息（如果失败） */
  error?: string;

  /** Token 使用量统计 */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * 循环执行事件
 */
export interface ReActLoopEvent {
  /** 事件类型 */
  type:
    | 'iteration:start'
    | 'iteration:end'
    | 'think'
    | 'act'
    | 'execute'
    | 'observe'
    | 'verify'
    | 'reflect'
    | 'error'
    | 'complete';

  /** 迭代序号 */
  iteration: number;

  /** 事件数据 */
  data?: unknown;

  /** 时间戳 */
  timestamp: Date;
}

/**
 * 事件监听器类型
 */
type ReActLoopEventListener = (event: ReActLoopEvent) => void;

/**
 * ReAct 循环
 *
 * 实现经典的 ReAct (Reasoning + Acting) 循环模式：
 * 1. THINK: LLM 分析当前状态，决定下一步行动
 * 2. ACT: 解析 LLM 响应，提取动作
 * 3. EXECUTE: 执行工具调用
 * 4. OBSERVE: 收集执行结果
 * 5. VERIFY: 验证结果是否符合预期
 * 6. REFLECT: 反思并决定继续或终止
 */
export class ReActLoop {
  /** LLM 客户端 */
  private llmClient: LLMClient;

  /** 工具执行器 */
  private toolExecutor: ToolExecutor;

  /** 记忆系统 */
  private memorySystem: MemorySystem;

  /** 观察生成器 */
  private observationGenerator: ObservationGenerator;

  /** 思考解析器 */
  private thoughtParser: ThoughtParser;

  /** 配置 */
  private config: Required<ReActLoopConfig>;

  /** 事件监听器列表 */
  private eventListeners: ReActLoopEventListener[] = [];

  /** 是否正在运行 */
  private isRunning = false;

  /** 当前步骤列表 */
  private steps: Step[] = [];

  /** Token 使用量统计 */
  private tokenUsage = { prompt: 0, completion: 0, total: 0 };

  /**
   * 创建 ReAct 循环实例
   *
   * @param config - 循环配置
   */
  constructor(config: ReActLoopConfig) {
    this.llmClient = config.llmClient;
    this.toolExecutor = config.toolExecutor;
    this.memorySystem = config.memorySystem;
    this.config = {
      llmClient: config.llmClient,
      toolExecutor: config.toolExecutor,
      memorySystem: config.memorySystem,
      maxIterations: config.maxIterations ?? 10,
      stepTimeoutMs: config.stepTimeoutMs ?? 60000,
      enableReflection: config.enableReflection ?? true,
      enableVerification: config.enableVerification ?? true,
      observationMaxLength: config.observationMaxLength ?? 500,
    };

    this.observationGenerator = new ObservationGenerator(
      this.config.observationMaxLength
    );
    this.thoughtParser = new ThoughtParser();
  }

  /**
   * 运行 ReAct 循环
   *
   * @param sessionId - 会话 ID
   * @param workingMemory - 工作记忆实例
   * @param taskDescription - 任务描述
   * @returns 执行结果
   */
  public async run(
    sessionId: string,
    workingMemory: WorkingMemory,
    taskDescription: string
  ): Promise<ReActLoopResult> {
    if (this.isRunning) {
      throw new Error('ReActLoop is already running');
    }

    this.isRunning = true;
    this.steps = [];
    this.tokenUsage = { prompt: 0, completion: 0, total: 0 };

    const startTime = Date.now();
    let finalResult: string | undefined;
    let error: string | undefined;

    try {
      // 初始化系统提示
      const systemPrompt = buildReActSystemPrompt({
        taskDescription,
        tools: this.toolExecutor.getAllTools(),
        maxSteps: this.config.maxIterations,
      });

      // 设置工作记忆的系统提示
      if (!workingMemory.getMessages().some((m) => m.role === 'system')) {
        workingMemory.addSystemMessage(systemPrompt);
      }

      // 主循环
      for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
        this.emit('iteration:start', iteration, { iteration });

        try {
          // THINK: 调用 LLM 思考下一步行动
          const thought = await this.think(sessionId, workingMemory, iteration);

          // 检查是否终止
          if (this.thoughtParser.isTerminateAction(thought)) {
            finalResult = thought.result || '任务完成';
            this.emit('complete', iteration, { result: finalResult });
            break;
          }

          // ACT: 将思考转换为动作
          const action = this.thoughtParser.toAgentAction(thought);
          this.emit('act', iteration, { action });

          // EXECUTE: 执行工具
          const executionResult = await this.execute(action, sessionId);
          this.emit('execute', iteration, { result: executionResult });

          // OBSERVE: 生成观察结果
          const observation = this.observationGenerator.generate({
            toolName: action.toolName,
            result: executionResult,
            parameters: action.parameters,
            executionTimeMs: executionResult.executionTimeMs,
          });
          this.emit('observe', iteration, { observation });

          // 记录步骤
          const step = await this.recordStep(
            sessionId,
            iteration,
            thought,
            action,
            observation,
            executionResult.success ? 'completed' : 'failed'
          );
          this.steps.push(step);

          // 更新工作记忆
          this.updateWorkingMemory(workingMemory, thought, action, observation);

          // VERIFY: 验证结果
          if (this.config.enableVerification) {
            const verified = await this.verify(
              workingMemory,
              action,
              observation,
              iteration
            );
            this.emit('verify', iteration, { verified });
          }

          // REFLECT: 反思
          if (this.config.enableReflection) {
            const reflection = await this.reflect(
              workingMemory,
              action,
              observation,
              iteration
            );
            this.emit('reflect', iteration, { reflection });
          }

          this.emit('iteration:end', iteration, {
            step,
            observation,
          });

          // 检查是否完成
          if (action.toolName === 'terminate') {
            finalResult = executionResult.data as string;
            break;
          }
        } catch (iterError) {
          error = iterError instanceof Error ? iterError.message : String(iterError);
          this.emit('error', iteration, { error });

          // 记录失败步骤
          await this.recordStep(
            sessionId,
            iteration,
            { thought: '', action: '', parameters: {}, isComplete: false } as ParsedThought,
            { thought: '', toolName: '', parameters: {}, expectedOutcome: '' },
            this.observationGenerator.createErrorObservation('error', error),
            'failed'
          );

          // 如果是致命错误，终止循环
          if (this.isFatalError(error)) {
            break;
          }
        }
      }

      // 如果达到最大迭代次数仍未完成
      if (!finalResult && !error) {
        error = `达到最大迭代次数限制 (${this.config.maxIterations})`;
      }
    } catch (runError) {
      error = runError instanceof Error ? runError.message : String(runError);
    } finally {
      this.isRunning = false;
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      success: !error,
      result: finalResult,
      steps: this.steps,
      totalIterations: this.steps.length,
      totalTimeMs,
      error,
      tokenUsage: { ...this.tokenUsage },
    };
  }

  /**
   * THINK 阶段: 调用 LLM 思考下一步
   *
   * @param sessionId - 会话 ID
   * @param workingMemory - 工作记忆
   * @param iteration - 当前迭代序号
   * @returns 解析后的思考结果
   */
  private async think(
    _sessionId: string,
    workingMemory: WorkingMemory,
    iteration: number
  ): Promise<ParsedThought> {
    this.emit('think', iteration, {});

    // 构建消息
    const messages = workingMemory.getMessages();

    // 如果是第一次迭代，添加用户任务
    if (iteration === 1 && messages.length <= 1) {
      // 系统消息已存在，无需添加
    }

    // 获取工具定义并转换为 LLM 需要的格式
    const rawTools = this.toolExecutor.getToolsForLLM();
    const tools = rawTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: t.input_schema.type,
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    }));

    // 调用 LLM
    const response = await this.llmClient.chatWithTools(messages, tools);

    // 更新 Token 使用量
    this.tokenUsage.prompt += response.usage.promptTokens;
    this.tokenUsage.completion += response.usage.completionTokens;
    this.tokenUsage.total += response.usage.totalTokens;

    // 解析响应
    let thought: ParsedThought;

    if (response.toolCalls && response.toolCalls.length > 0) {
      // 使用工具调用格式
      const toolCall = response.toolCalls[0];
      thought = {
        thought: response.content,
        action: toolCall.name,
        parameters: toolCall.arguments,
        isComplete: toolCall.name === 'terminate',
      };
    } else {
      // 使用文本解析
      thought = this.thoughtParser.parse(response.content);
    }

    return thought;
  }

  /**
   * EXECUTE 阶段: 执行工具
   *
   * @param action - 要执行的动作
   * @param sessionId - 会话 ID
   * @returns 执行结果
   */
  private async execute(
    action: AgentAction,
    sessionId: string
  ): Promise<ToolExecutionResult> {
    // 更新工具执行器的上下文
    this.toolExecutor.updateConfig({
      sessionId,
      stepId: `step-${sessionId}-${this.steps.length + 1}`,
    });

    // 执行工具
    return this.toolExecutor.execute(action.toolName, action.parameters);
  }

  /**
   * VERIFY 阶段: 验证执行结果
   *
   * @param workingMemory - 工作记忆
   * @param action - 执行的动作
   * @param observation - 观察结果
   * @param iteration - 当前迭代序号
   * @returns 是否验证通过
   */
  private async verify(
    _workingMemory: WorkingMemory,
    action: AgentAction,
    observation: Observation,
    _iteration: number
  ): Promise<boolean> {
    // 简单验证：检查是否成功
    if (!observation.success) {
      return false;
    }

    // 检查是否符合预期（如果提供了预期结果）
    if (action.expectedOutcome) {
      // 可以在这里添加更复杂的验证逻辑
      // 例如调用 LLM 判断结果是否符合预期
      return true;
    }

    return true;
  }

  /**
   * REFLECT 阶段: 反思执行过程
   *
   * @param workingMemory - 工作记忆
   * @param action - 执行的动作
   * @param observation - 观察结果
   * @param iteration - 当前迭代序号
   * @returns 反思记录
   */
  private async reflect(
    workingMemory: WorkingMemory,
    action: AgentAction,
    observation: Observation,
    _iteration: number
  ): Promise<Reflection> {
    const reflection: Reflection = {
      whatHappened: `执行了 ${action.toolName} 工具`,
      whatWorked: observation.success ? '工具执行成功' : '',
      whatFailed: observation.success ? '' : observation.raw,
      adjustmentNeeded: !observation.success,
    };

    if (!observation.success) {
      reflection.newApproach = '需要调整策略或参数后重试';
    }

    // 将反思添加到工作记忆
    workingMemory.addAssistantMessage(
      `反思: ${reflection.whatHappened}。${
        observation.success ? '执行成功' : '执行失败，需要调整'
      }`
    );

    return reflection;
  }

  /**
   * 记录步骤到数据库
   *
   * @param sessionId - 会话 ID
   * @param stepNumber - 步骤序号
   * @param thought - 思考结果
   * @param action - 执行的动作
   * @param observation - 观察结果
   * @param status - 步骤状态
   * @returns 保存的步骤
   */
  private async recordStep(
    sessionId: string,
    stepNumber: number,
    thought: ParsedThought,
    action: AgentAction,
    observation: Observation,
    status: StepStatus
  ): Promise<Step> {
    const db = this.memorySystem.getDb();
    const { Steps } = await import('../memory/Steps');
    const steps = new Steps(db);

    const reflection: Reflection = {
      whatHappened: `步骤 ${stepNumber}: ${action.toolName}`,
      whatWorked: observation.success ? '执行成功' : '',
      whatFailed: observation.success ? '' : observation.raw,
      adjustmentNeeded: !observation.success,
    };

    const step = await steps.createStep({
      sessionId,
      stepNumber,
      thought: thought.thought,
      action,
      observation,
      reflection,
      status,
    });

    return step;
  }

  /**
   * 更新工作记忆
   *
   * @param workingMemory - 工作记忆
   * @param thought - 思考结果
   * @param action - 执行的动作
   * @param observation - 观察结果
   */
  private updateWorkingMemory(
    workingMemory: WorkingMemory,
    thought: ParsedThought,
    action: AgentAction,
    observation: Observation
  ): void {
    // 添加助手消息（思考和动作）
    workingMemory.addAssistantMessage(thought.thought);

    // 添加工具结果消息
    const status = observation.success ? '成功' : '失败';
    workingMemory.addUserMessage(
      `工具 "${action.toolName}" 执行${status}:\n${observation.raw}`
    );
  }

  /**
   * 检查是否为致命错误
   *
   * @param error - 错误信息
   * @returns 是否致命
   */
  private isFatalError(error: string): boolean {
    const fatalPatterns = [
      'API key',
      'authentication',
      'unauthorized',
      'forbidden',
      'rate limit exceeded',
    ];

    const lowerError = error.toLowerCase();
    return fatalPatterns.some((pattern) => lowerError.includes(pattern));
  }

  /**
   * 添加事件监听器
   *
   * @param listener - 监听器函数
   */
  public onEvent(listener: ReActLoopEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * 移除事件监听器
   *
   * @param listener - 监听器函数
   */
  public offEvent(listener: ReActLoopEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 发送事件
   *
   * @param type - 事件类型
   * @param iteration - 迭代序号
   * @param data - 事件数据
   */
  private emit(
    type: ReActLoopEvent['type'],
    iteration: number,
    data: unknown
  ): void {
    const event: ReActLoopEvent = {
      type,
      iteration,
      data,
      timestamp: new Date(),
    };

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 检查是否正在运行
   *
   * @returns 是否正在运行
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取已执行的步骤
   *
   * @returns 步骤列表
   */
  public getSteps(): Step[] {
    return [...this.steps];
  }

  /**
   * 获取 Token 使用量
   *
   * @returns Token 使用量统计
   */
  public getTokenUsage(): { prompt: number; completion: number; total: number } {
    return { ...this.tokenUsage };
  }
}

/**
 * 创建 ReAct 循环（便捷函数）
 *
 * @param config - 循环配置
 * @returns ReActLoop 实例
 */
export function createReActLoop(config: ReActLoopConfig): ReActLoop {
  return new ReActLoop(config);
}

export default ReActLoop;
