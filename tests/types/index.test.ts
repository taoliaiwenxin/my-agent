/**
 * @file index.test.ts
 * @description 核心类型定义测试
 *              验证类型接口的兼容性和正确性
 * @module tests/types
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 */

import {
  AgentAction,
  Observation,
  Reflection,
  Step,
  Tool,
  Message,
  Session,
  MemoryEntry,
  SecurityPolicy,
  ProviderMetadata,
  ChatResponse,
  TaskPlan,
  WorkingMemory,
  ExecutionStatus,
  SessionStatus,
  MemoryType,
  PermissionLevel,
} from '../../src/types';

describe('类型定义', () => {
  /**
   * 测试：AgentAction 接口兼容性
   * 验证 AgentAction 类型可以正确赋值
   */
  it('AgentAction 类型应该兼容', () => {
    const action: AgentAction = {
      thought: '我需要读取文件',
      toolName: 'file_read',
      parameters: { path: './test.txt' },
      expectedOutcome: '获取文件内容',
    };

    expect(action.thought).toBe('我需要读取文件');
    expect(action.toolName).toBe('file_read');
    expect(action.parameters.path).toBe('./test.txt');
  });

  /**
   * 测试：Observation 接口兼容性
   * 验证 Observation 类型可以正确赋值
   */
  it('Observation 类型应该兼容', () => {
    const observation: Observation = {
      raw: '文件内容',
      summary: '成功读取文件',
      success: true,
      executionTimeMs: 100,
    };

    expect(observation.success).toBe(true);
    expect(observation.executionTimeMs).toBe(100);
  });

  /**
   * 测试：Reflection 接口兼容性
   * 验证 Reflection 类型可以正确赋值
   */
  it('Reflection 类型应该兼容', () => {
    const reflection: Reflection = {
      whatHappened: '读取文件成功',
      whatWorked: '文件读取正常',
      whatFailed: '无',
      adjustmentNeeded: false,
    };

    expect(reflection.adjustmentNeeded).toBe(false);
    expect(reflection.whatHappened).toBe('读取文件成功');
  });

  /**
   * 测试：Step 接口兼容性
   * 验证 Step 类型可以正确赋值
   */
  it('Step 类型应该兼容', () => {
    const step: Step = {
      stepId: 'step-001',
      stepNumber: 1,
      thought: '思考内容',
      action: {
        thought: '动作思考',
        toolName: 'file_read',
        parameters: {},
        expectedOutcome: '结果',
      },
      observation: {
        raw: '原始输出',
        summary: '摘要',
        success: true,
      },
      reflection: {
        whatHappened: '发生了什么',
        whatWorked: '有效的',
        whatFailed: '失败的',
        adjustmentNeeded: false,
      },
      status: 'completed',
      createdAt: new Date(),
    };

    expect(step.stepId).toBe('step-001');
    expect(step.status).toBe('completed');
  });

  /**
   * 测试：Tool 接口兼容性
   * 验证 Tool 类型可以正确赋值
   */
  it('Tool 类型应该兼容', () => {
    const tool: Tool = {
      name: 'file_read',
      description: '读取文件',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径',
          },
        },
        required: ['path'],
      },
    };

    expect(tool.name).toBe('file_read');
    expect(tool.parameters.type).toBe('object');
  });

  /**
   * 测试：Message 接口兼容性
   * 验证 Message 类型可以正确赋值
   */
  it('Message 类型应该兼容', () => {
    const message: Message = {
      role: 'user',
      content: '你好',
    };

    expect(message.role).toBe('user');
    expect(message.content).toBe('你好');
  });

  /**
   * 测试：Session 接口兼容性
   * 验证 Session 类型可以正确赋值
   */
  it('Session 类型应该兼容', () => {
    const session: Session = {
      sessionId: 'session-001',
      createdAt: new Date(),
      taskDescription: '测试任务',
      finalStatus: 'completed',
      stepCount: 5,
    };

    expect(session.finalStatus).toBe('completed');
    expect(session.stepCount).toBe(5);
  });

  /**
   * 测试：MemoryEntry 接口兼容性
   * 验证 MemoryEntry 类型可以正确赋值
   */
  it('MemoryEntry 类型应该兼容', () => {
    const memory: MemoryEntry = {
      memoryId: 'mem-001',
      type: 'episodic',
      content: '用户偏好',
      relevanceScore: 0.9,
      createdAt: new Date(),
    };

    expect(memory.type).toBe('episodic');
    expect(memory.relevanceScore).toBe(0.9);
  });

  /**
   * 测试：SecurityPolicy 接口兼容性
   * 验证 SecurityPolicy 类型可以正确赋值
   */
  it('SecurityPolicy 类型应该兼容', () => {
    const policy: SecurityPolicy = {
      allowedPaths: ['./workspace'],
      permissionLevel: 'write',
      dangerousPatterns: [/rm -rf \//],
      allowNetwork: true,
    };

    expect(policy.permissionLevel).toBe('write');
    expect(policy.allowNetwork).toBe(true);
  });

  /**
   * 测试：ProviderMetadata 接口兼容性
   * 验证 ProviderMetadata 类型可以正确赋值
   */
  it('ProviderMetadata 类型应该兼容', () => {
    const metadata: ProviderMetadata = {
      id: 'claude-sonnet',
      name: 'Claude 3.5 Sonnet',
      type: 'anthropic',
      modelName: 'claude-3-5-sonnet-20241022',
      capabilities: {
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsJSONMode: false,
        maxTokens: 4096,
        contextWindow: 200000,
      },
      isActive: true,
      isDefault: true,
    };

    expect(metadata.type).toBe('anthropic');
    expect(metadata.capabilities.supportsVision).toBe(true);
  });

  /**
   * 测试：ChatResponse 接口兼容性
   * 验证 ChatResponse 类型可以正确赋值
   */
  it('ChatResponse 类型应该兼容', () => {
    const response: ChatResponse = {
      content: '响应内容',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      model: 'claude-3-5-sonnet',
      latencyMs: 500,
    };

    expect(response.usage.totalTokens).toBe(150);
    expect(response.latencyMs).toBe(500);
  });

  /**
   * 测试：TaskPlan 接口兼容性
   * 验证 TaskPlan 类型可以正确赋值
   */
  it('TaskPlan 类型应该兼容', () => {
    const plan: TaskPlan = {
      planId: 'plan-001',
      description: '任务计划',
      steps: [
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
      ],
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].dependencies).toContain('1');
  });

  /**
   * 测试：WorkingMemory 接口兼容性
   * 验证 WorkingMemory 类型可以正确赋值
   */
  it('WorkingMemory 类型应该兼容', () => {
    const memory: WorkingMemory = {
      sessionId: 'session-001',
      messages: [],
      tokenCount: 0,
      maxTokens: 100000,
      intermediateResults: new Map(),
    };

    expect(memory.tokenCount).toBe(0);
    expect(memory.maxTokens).toBe(100000);
  });

  /**
   * 测试：枚举类型值
   * 验证所有枚举类型有正确的值
   */
  it('枚举类型应该有正确的值', () => {
    const execStatus: ExecutionStatus = 'success';
    const sessionStatus: SessionStatus = 'completed';
    const memoryType: MemoryType = 'episodic';
    const permission: PermissionLevel = 'execute';

    expect(execStatus).toBe('success');
    expect(sessionStatus).toBe('completed');
    expect(memoryType).toBe('episodic');
    expect(permission).toBe('execute');
  });
});
