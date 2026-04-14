/**
 * @file index.ts
 * @description 核心类型定义文件，包含 AI Agent 的所有核心接口和类型。
 *              定义了 Agent 运行所需的数据结构：动作、观察、步骤、记忆等。
 *              所有模块共享这些类型定义，确保类型安全。
 * @module types
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 *
 * @example
 * import { AgentAction, Observation, Step } from './types';
 *
 * const action: AgentAction = {
 *   thought: '我需要读取文件',
 *   toolName: 'file_read',
 *   parameters: { path: './test.txt' },
 *   expectedOutcome: '获取文件内容'
 * };
 *
 * @see {@link WORK_PLAN.md}
 * @see {@link ARCHITECTURE.md}
 */

// ==================== 基础类型 ====================

/**
 * 工具执行结果状态
 *
 * - success: 工具执行成功，结果符合预期
 * - failed: 工具执行失败，可能有错误信息
 * - error: 执行过程中发生异常
 */
export type ExecutionStatus = 'success' | 'failed' | 'error';

/**
 * 会话状态
 *
 * - pending: 会话已创建但未开始执行
 * - running: 会话正在执行中
 * - completed: 会话已成功完成
 * - failed: 会话执行失败
 */
export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 步骤状态
 *
 * - pending: 步骤等待执行
 * - running: 步骤正在执行
 * - completed: 步骤已完成
 * - failed: 步骤执行失败
 */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 权限级别
 *
 * - read: 只读权限，只能读取文件
 * - write: 读写权限，可以读取和写入文件
 * - execute: 执行权限，可以执行命令
 */
export type PermissionLevel = 'read' | 'write' | 'execute';

// ==================== Agent 核心类型 ====================

/**
 * Agent 动作定义
 *
 * 表示 Agent 决定执行的单个动作，包含思考过程、工具选择和参数。
 * 这是 ReAct 循环中 "Act" 阶段的核心数据结构。
 *
 * @example
 * const action: AgentAction = {
 *   thought: '用户要求读取配置文件，我需要先检查文件是否存在',
 *   toolName: 'file_read',
 *   parameters: { path: './config.yaml' },
 *   expectedOutcome: '获取配置文件内容用于后续处理'
 * };
 */
export interface AgentAction {
  /** 思考过程：Agent 为什么要执行这个动作 */
  thought: string;

  /** 工具名称：要调用的工具标识符 */
  toolName: string;

  /** 工具参数：传递给工具的参数对象 */
  parameters: Record<string, unknown>;

  /** 预期结果：执行后期望得到什么结果（用于验证） */
  expectedOutcome: string;
}

/**
 * 观察结果定义
 *
 * 表示工具执行后的观察结果，包含原始输出、摘要和元数据。
 * 这是 ReAct 循环中 "Observe" 阶段的核心数据结构。
 *
 * @example
 * const observation: Observation = {
 *   raw: '文件内容...',
 *   summary: '成功读取了配置文件，包含数据库连接信息',
 *   success: true,
 *   artifacts: ['./config.yaml'],
 *   executionTimeMs: 150
 * };
 */
export interface Observation {
  /** 原始输出：工具的原始返回结果 */
  raw: string;

  /** 摘要：LLM 生成的观察结果摘要 */
  summary: string;

  /** 是否成功：标识工具执行是否成功 */
  success: boolean;

  /** 生成的产物：如文件路径、数据 ID 等 */
  artifacts?: string[];

  /** 解析出的错误信息 */
  errors?: Error[];

  /** 执行耗时（毫秒） */
  executionTimeMs?: number;
}

/**
 * 反思记录定义
 *
 * 表示 Agent 对执行过程的反思，用于学习和调整策略。
 * 这是 ReAct 循环中 "Reflect" 阶段的核心数据结构。
 *
 * @example
 * const reflection: Reflection = {
 *   whatHappened: '尝试读取配置文件但路径不存在',
 *   whatWorked: '错误处理机制正常工作，返回了清晰的错误信息',
 *   whatFailed: '文件路径假设不正确，应该先列出目录内容',
 *   adjustmentNeeded: true,
 *   newApproach: '先使用 list_directory 工具确认文件存在'
 * };
 */
export interface Reflection {
  /** 刚才发生了什么：执行过程的客观描述 */
  whatHappened: string;

  /** 什么有效：执行过程中成功的部分 */
  whatWorked: string;

  /** 什么失败了：执行过程中失败的部分 */
  whatFailed: string;

  /** 是否需要调整：标识是否需要改变策略 */
  adjustmentNeeded: boolean;

  /** 新的方法：如果需要调整，描述新的执行方案 */
  newApproach?: string;
}

/**
 * 执行步骤定义
 *
 * 表示 ReAct 循环中的单个步骤，包含思考、行动、观察和反思。
 * 步骤会被持久化到数据库，支持崩溃恢复和历史回溯。
 *
 * @example
 * const step: Step = {
 *   stepId: 'step-001',
 *   stepNumber: 1,
 *   thought: '需要读取配置文件',
 *   action: { toolName: 'file_read', ... },
 *   observation: { raw: '...', success: true },
 *   reflection: { whatHappened: '...', adjustmentNeeded: false },
 *   status: 'completed'
 * };
 */
export interface Step {
  /** 步骤唯一标识符 */
  stepId: string;

  /** 步骤序号，在同一会话中递增 */
  stepNumber: number;

  /** 思考内容 */
  thought: string;

  /** 执行的动作 */
  action: AgentAction;

  /** 观察结果 */
  observation: Observation;

  /** 反思记录 */
  reflection: Reflection;

  /** 步骤状态 */
  status: StepStatus;

  /** 检查点数据：用于崩溃恢复 */
  checkpointData?: string;

  /** 创建时间 */
  createdAt: Date;
}

/**
 * 任务计划定义
 *
 * 表示 Agent 的任务执行计划，包含多个步骤及其依赖关系。
 * 支持 DAG（有向无环图）结构，允许并行执行独立步骤。
 *
 * @example
 * const plan: TaskPlan = {
 *   planId: 'plan-001',
 *   description: '分析代码库并生成报告',
 *   steps: [
 *     { id: '1', description: '读取文件列表', dependencies: [] },
 *     { id: '2', description: '分析代码', dependencies: ['1'] },
 *     { id: '3', description: '生成报告', dependencies: ['2'] }
 *   ],
 *   status: 'running'
 * };
 */
export interface TaskPlan {
  /** 计划唯一标识符 */
  planId: string;

  /** 计划描述 */
  description: string;

  /** 计划步骤列表 */
  steps: PlanStep[];

  /** 计划状态 */
  status: SessionStatus;

  /** 创建时间 */
  createdAt: Date;

  /** 计划更新时间 */
  updatedAt: Date;
}

/**
 * 计划步骤定义
 *
 * 表示任务计划中的单个步骤，包含描述和依赖关系。
 */
export interface PlanStep {
  /** 步骤 ID */
  id: string;

  /** 步骤描述 */
  description: string;

  /** 依赖的步骤 ID 列表 */
  dependencies: string[];
}

// ==================== 工具系统类型 ====================

/**
 * 工具定义接口
 *
 * 定义了工具的结构和元数据，用于工具注册表管理。
 *
 * @example
 * const fileReadTool: Tool = {
 *   name: 'file_read',
 *   description: '读取文件内容',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: '文件路径' }
 *     },
 *     required: ['path']
 *   }
 * };
 */
export interface Tool {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 参数定义（JSON Schema 格式） */
  parameters: ToolParameterSchema;
}

/**
 * 工具参数 Schema 定义
 *
 * 使用类似 JSON Schema 的格式定义工具参数。
 */
export interface ToolParameterSchema {
  /** 参数类型 */
  type: 'object';

  /** 参数属性定义 */
  properties: Record<string, ToolParameterProperty>;

  /** 必需参数列表 */
  required?: string[];
}

/**
 * 单个工具参数属性定义
 */
export interface ToolParameterProperty {
  /** 参数类型 */
  type: string;

  /** 参数描述 */
  description: string;

  /** 枚举值（如果有） */
  enum?: string[];

  /** 默认值 */
  default?: unknown;
}

/**
 * 工具执行上下文
 *
 * 传递给工具执行的上下文信息，包含安全策略等。
 */
export interface ToolExecutionContext {
  /** 会话 ID */
  sessionId: string;

  /** 步骤 ID */
  stepId: string;

  /** 权限级别 */
  permissionLevel: PermissionLevel;

  /** 允许访问的路径列表 */
  allowedPaths: string[];
}

/**
 * 工具执行结果
 *
 * 工具执行后返回的结果。
 */
export interface ToolExecutionResult {
  /** 是否成功 */
  success: boolean;

  /** 执行结果数据 */
  data?: unknown;

  /** 错误信息 */
  error?: string;

  /** 执行耗时（毫秒） */
  executionTimeMs: number;
}

// ==================== 记忆系统类型 ====================

/**
 * 记忆类型
 *
 * - episodic: 情景记忆，存储过去的任务经历和结果
 * - semantic: 语义记忆，存储知识和代码库信息
 * - preference: 偏好记忆，存储用户的偏好设置
 */
export type MemoryType = 'episodic' | 'semantic' | 'preference';

/**
 * 记忆条目定义
 *
 * 存储在记忆中的单条记录。
 *
 * @example
 * const memory: MemoryEntry = {
 *   memoryId: 'mem-001',
 *   type: 'episodic',
 *   content: '用户喜欢用 TypeScript 编写代码',
 *   relevanceScore: 0.9
 * };
 */
export interface MemoryEntry {
  /** 记忆唯一标识符 */
  memoryId: string;

  /** 记忆类型 */
  type: MemoryType;

  /** 记忆内容 */
  content: string;

  /** 关联的向量嵌入（可选） */
  embedding?: number[];

  /** 相关度评分 */
  relevanceScore?: number;

  /** 创建时间 */
  createdAt: Date;

  /** 最后访问时间 */
  lastAccessedAt?: Date;
}

/**
 * 工作记忆定义
 *
 * 存储当前会话的短期信息，包括对话历史和上下文。
 */
export interface WorkingMemory {
  /** 会话 ID */
  sessionId: string;

  /** 对话历史 */
  messages: Message[];

  /** 当前 Token 数量 */
  tokenCount: number;

  /** 最大 Token 限制 */
  maxTokens: number;

  /** 当前任务上下文 */
  currentTask?: string;

  /** 中间结果缓存 */
  intermediateResults: Map<string, unknown>;
}

/**
 * 对话消息定义
 *
 * 存储单条对话消息。
 */
export interface Message {
  /** 消息角色 */
  role: 'system' | 'user' | 'assistant' | 'tool';

  /** 消息内容 */
  content: string;

  /** 工具调用（如果是 assistant 消息） */
  toolCalls?: ToolCall[];

  /** 工具调用 ID（如果是 tool 消息） */
  toolCallId?: string;
}

/**
 * 工具调用定义
 *
 * LLM 发起的工具调用请求。
 */
export interface ToolCall {
  /** 调用 ID */
  id: string;

  /** 工具名称 */
  name: string;

  /** 调用参数 */
  arguments: Record<string, unknown>;
}

// ==================== LLM 相关类型 ====================

/**
 * 模型提供商类型
 */
export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'custom';

/**
 * 模型能力定义
 *
 * 描述模型支持的功能特性。
 */
export interface ModelCapabilities {
  /** 是否支持视觉/图片输入 */
  supportsVision: boolean;

  /** 是否支持函数/工具调用 */
  supportsTools: boolean;

  /** 是否支持流式输出 */
  supportsStreaming: boolean;

  /** 是否支持 JSON 模式输出 */
  supportsJSONMode: boolean;

  /** 最大输出 token 数 */
  maxTokens: number;

  /** 上下文窗口大小 */
  contextWindow: number;
}

/**
 * Provider 元数据
 */
export interface ProviderMetadata {
  /** 唯一标识 */
  id: string;

  /** 显示名称 */
  name: string;

  /** 提供商类型 */
  type: ProviderType;

  /** 实际模型名称 */
  modelName: string;

  /** 模型能力 */
  capabilities: ModelCapabilities;

  /** 是否启用 */
  isActive: boolean;

  /** 是否为默认 */
  isDefault: boolean;
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  /** 唯一标识 */
  id: string;

  /** 提供商类型 */
  type: string;

  /** 模型名称 */
  modelName: string;

  /** API 密钥 */
  apiKey?: string;

  /** 自定义 API 地址 */
  baseUrl?: string;

  /** 额外配置 */
  config?: Record<string, unknown>;

  /** 是否设为默认 */
  isDefault?: boolean;

  /** 优先级 */
  priority?: number;
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 温度参数，控制随机性 */
  temperature?: number;

  /** 最大输出 token 数 */
  maxTokens?: number;

  /** Top P 采样 */
  topP?: number;

  /** 停止序列 */
  stopSequences?: string[];

  /** 超时时间（毫秒） */
  timeoutMs?: number;

  /** 可用工具列表 */
  tools?: ToolDefinition[];

  /** 工具选择策略 */
  toolChoice?: 'auto' | 'none' | { name: string };
}

/**
 * 工具定义（用于 LLM）
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 参数定义 */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;

  /** 工具调用 */
  toolCalls?: ToolCall[];

  /** Token 使用量 */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** 使用的模型 */
  model: string;

  /** 响应延迟（毫秒） */
  latencyMs: number;
}

/**
 * 流式响应块
 */
export interface ChatResponseChunk {
  /** 内容片段 */
  content?: string;

  /** 工具调用片段 */
  toolCall?: Partial<ToolCall>;

  /** 是否完成 */
  isComplete: boolean;

  /** 使用量（仅在完成时） */
  usage?: ChatResponse['usage'];
}

// ==================== 安全相关类型 ====================

/**
 * 安全策略定义
 *
 * 定义 Agent 的安全限制和访问控制。
 */
export interface SecurityPolicy {
  /** 允许访问的路径白名单 */
  allowedPaths: string[];

  /** 权限级别 */
  permissionLevel: PermissionLevel;

  /** 危险命令模式列表（正则表达式） */
  dangerousPatterns: RegExp[];

  /** 是否允许网络访问 */
  allowNetwork: boolean;

  /** 允许的域名列表（如果 allowNetwork 为 true） */
  allowedDomains?: string[];
}

/**
 * 权限验证结果
 */
export interface PermissionCheckResult {
  /** 是否允许 */
  allowed: boolean;

  /** 拒绝原因（如果不允许） */
  reason?: string;
}

// ==================== 会话相关类型 ====================

/**
 * 会话定义
 *
 * 表示一个完整的 Agent 会话。
 */
export interface Session {
  /** 会话唯一标识符 */
  sessionId: string;

  /** 会话创建时间 */
  createdAt: Date;

  /** 任务描述 */
  taskDescription: string;

  /** 最终状态 */
  finalStatus: SessionStatus;

  /** 执行步骤数量 */
  stepCount: number;

  /** 最终结果 */
  finalResult?: string;
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 单任务最大迭代次数 */
  maxIterations: number;

  /** 单任务超时时间（毫秒） */
  timeoutMs: number;

  /** 是否启用人工确认 */
  enableHumanConfirm: boolean;
}

/**
 * Token 使用量记录
 */
export interface TokenUsage {
  /** 输入 Token 数 */
  promptTokens: number;

  /** 输出 Token 数 */
  completionTokens: number;

  /** 总 Token 数 */
  totalTokens: number;
}

/**
 * LLM 调用记录
 */
export interface LLMCallRecord {
  /** 调用唯一标识符 */
  callId: string;

  /** 会话 ID */
  sessionId: string;

  /** Provider ID */
  providerId: string;

  /** 模型名称 */
  modelName: string;

  /** Token 使用量 */
  tokenUsage: TokenUsage;

  /** 成本（美元） */
  costUsd: number;

  /** 延迟（毫秒） */
  latencyMs: number;

  /** 是否成功 */
  success: boolean;

  /** 创建时间 */
  createdAt: Date;
}
