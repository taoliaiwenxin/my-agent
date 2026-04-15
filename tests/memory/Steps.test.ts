/**
 * @file Steps.test.ts
 * @description Steps 模块单元测试
 *              测试步骤的创建、更新、查询和删除功能
 * @module tests/memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteClient } from '../../src/memory/SQLiteClient';
import { Sessions } from '../../src/memory/Sessions';
import { Steps } from '../../src/memory/Steps';
import { AgentAction, Observation, Reflection } from '../../src/types';

describe('Steps', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, 'temp');

  /** 生成唯一的测试数据库路径 */
  const getTestDbPath = () => path.join(testDbDir, `steps-test-${Date.now()}.db`);

  /** 所有测试数据库路径 */
  const testDbPaths: string[] = [];

  /** 确保测试目录存在 */
  beforeAll(() => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
  });

  /** 清理所有测试数据库 */
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const dbPath of testDbPaths) {
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      } catch {
        // 忽略删除错误
      }
    }

    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmdirSync(testDbDir);
      }
    } catch {
      // 忽略删除错误
    }
  });

  /**
   * 创建测试用的 Steps 实例
   */
  async function createTestContext(): Promise<{
    db: SQLiteClient;
    sessions: Sessions;
    steps: Steps;
    sessionId: string;
  }> {
    const dbPath = getTestDbPath();
    testDbPaths.push(dbPath);

    const db = new SQLiteClient(dbPath);
    await db.connect();

    const sessions = new Sessions(db);
    const steps = new Steps(db);

    // 创建一个测试会话
    const session = await sessions.createSession({
      taskDescription: '步骤测试会话',
    });

    return { db, sessions, steps, sessionId: session.sessionId };
  }

  /**
   * 创建示例 Action
   */
  function createMockAction(overrides?: Partial<AgentAction>): AgentAction {
    return {
      thought: '测试思考',
      toolName: 'file_read',
      parameters: { path: './test.txt' },
      expectedOutcome: '获取文件内容',
      ...overrides,
    };
  }

  /**
   * 创建示例 Observation
   */
  function createMockObservation(overrides?: Partial<Observation>): Observation {
    return {
      raw: '文件内容',
      summary: '成功读取文件',
      success: true,
      executionTimeMs: 100,
      ...overrides,
    };
  }

  /**
   * 创建示例 Reflection
   */
  function createMockReflection(overrides?: Partial<Reflection>): Reflection {
    return {
      whatHappened: '成功执行了文件读取',
      whatWorked: '路径正确，文件存在',
      whatFailed: '无',
      adjustmentNeeded: false,
      ...overrides,
    };
  }

  /**
   * 测试：创建步骤
   * 验证能成功创建步骤并返回正确的步骤对象
   */
  it('应该能创建新步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const action = createMockAction();
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '我需要读取文件',
        action,
        status: 'running',
      });

      expect(step.stepId).toBe(`step-${sessionId}-1`);
      expect(step.stepNumber).toBe(1);
      expect(step.thought).toBe('我需要读取文件');
      expect(step.action).toEqual(action);
      expect(step.status).toBe('running');
      expect(step.createdAt).toBeInstanceOf(Date);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：创建步骤使用默认状态
   * 验证不指定状态时会使用 'running' 作为默认值
   */
  it('创建步骤应该使用默认状态 running', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '默认状态测试',
        action: createMockAction(),
      });

      expect(step.status).toBe('running');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取步骤
   * 验证能正确获取已创建的步骤
   */
  it('应该能获取步骤信息', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const action = createMockAction();
      const created = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '获取测试',
        action,
        status: 'running',
      });

      const retrieved = await steps.getStep(created.stepId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.stepId).toBe(created.stepId);
      expect(retrieved?.thought).toBe('获取测试');
      expect(retrieved?.action.toolName).toBe('file_read');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取不存在的步骤
   * 验证获取不存在的步骤时返回 null
   */
  it('获取不存在的步骤应该返回 null', async () => {
    const { db, steps } = await createTestContext();

    try {
      const retrieved = await steps.getStep('step-non-existent');
      expect(retrieved).toBeNull();
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新步骤观察结果
   * 验证能正确更新步骤的观察结果
   */
  it('应该能更新步骤观察结果', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '更新测试',
        action: createMockAction(),
        status: 'running',
      });

      const observation = createMockObservation();
      await steps.updateStep(step.stepId, { observation, status: 'completed' });

      const updated = await steps.getStep(step.stepId);
      expect(updated?.observation.raw).toBe('文件内容');
      expect(updated?.observation.success).toBe(true);
      expect(updated?.status).toBe('completed');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新步骤反思记录
   * 验证能正确更新步骤的反思记录
   */
  it('应该能更新步骤反思记录', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '反思测试',
        action: createMockAction(),
      });

      const reflection = createMockReflection();
      await steps.updateStep(step.stepId, { reflection });

      const updated = await steps.getStep(step.stepId);
      expect(updated?.reflection.whatHappened).toBe('成功执行了文件读取');
      expect(updated?.reflection.adjustmentNeeded).toBe(false);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新步骤检查点数据
   * 验证能正确更新步骤的检查点数据
   */
  it('应该能更新步骤检查点数据', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '检查点测试',
        action: createMockAction(),
      });

      const checkpointData = JSON.stringify({ key: 'value', timestamp: Date.now() });
      await steps.updateStep(step.stepId, { checkpointData });

      const updated = await steps.getStep(step.stepId);
      expect(updated?.checkpointData).toBe(checkpointData);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新不存在步骤
   * 验证更新不存在步骤时抛出错误
   */
  it('更新不存在步骤应该抛出错误', async () => {
    const { db, steps } = await createTestContext();

    try {
      await expect(
        steps.updateStep('step-non-existent', { status: 'completed' })
      ).rejects.toThrow('步骤不存在');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：完成步骤
   * 验证 completeStep 方法能正确设置完成状态
   */
  it('应该能完成步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '完成测试',
        action: createMockAction(),
        status: 'running',
      });

      await steps.completeStep(step.stepId);

      const completed = await steps.getStep(step.stepId);
      expect(completed?.status).toBe('completed');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：失败步骤
   * 验证 failStep 方法能正确设置失败状态和错误信息
   */
  it('应该能标记步骤失败', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '失败测试',
        action: createMockAction(),
      });

      await steps.failStep(step.stepId, '文件不存在');

      const failed = await steps.getStep(step.stepId);
      expect(failed?.status).toBe('failed');
      expect(failed?.observation.raw).toBe('文件不存在');
      expect(failed?.observation.success).toBe(false);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取会话的所有步骤
   * 验证能正确获取会话的完整步骤历史
   */
  it('应该能获取会话的所有步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      // 创建多个步骤
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '步骤1',
        action: createMockAction(),
        status: 'completed',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '步骤2',
        action: createMockAction(),
        status: 'running',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 3,
        thought: '步骤3',
        action: createMockAction(),
        status: 'pending',
      });

      const history = await steps.getStepsBySession(sessionId);

      expect(history.length).toBe(3);
      expect(history[0].stepNumber).toBe(1);
      expect(history[1].stepNumber).toBe(2);
      expect(history[2].stepNumber).toBe(3);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：按状态过滤步骤
   * 验证能根据状态过滤步骤列表
   */
  it('应该能按状态过滤步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '已完成',
        action: createMockAction(),
        status: 'completed',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '运行中',
        action: createMockAction(),
        status: 'running',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 3,
        thought: '已失败',
        action: createMockAction(),
        status: 'failed',
      });

      const completedSteps = await steps.getStepsBySession(sessionId, {
        status: 'completed',
      });
      const runningSteps = await steps.getStepsBySession(sessionId, {
        status: 'running',
      });
      const failedSteps = await steps.getStepsBySession(sessionId, {
        status: 'failed',
      });

      expect(completedSteps.length).toBe(1);
      expect(completedSteps[0].thought).toBe('已完成');

      expect(runningSteps.length).toBe(1);
      expect(runningSteps[0].thought).toBe('运行中');

      expect(failedSteps.length).toBe(1);
      expect(failedSteps[0].thought).toBe('已失败');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：步骤排序
   * 验证能按步骤序号排序
   */
  it('应该支持按步骤号排序', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '第一个',
        action: createMockAction(),
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '第二个',
        action: createMockAction(),
      });

      const ascList = await steps.getStepsBySession(sessionId, { order: 'asc' });
      expect(ascList[0].thought).toBe('第一个');
      expect(ascList[1].thought).toBe('第二个');

      const descList = await steps.getStepsBySession(sessionId, { order: 'desc' });
      expect(descList[0].thought).toBe('第二个');
      expect(descList[1].thought).toBe('第一个');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取最后执行的步骤
   * 验证能正确获取最后执行的步骤（用于崩溃恢复）
   */
  it('应该能获取最后执行的步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '第一步',
        action: createMockAction(),
        status: 'completed',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '第二步',
        action: createMockAction(),
        status: 'running',
      });

      const lastStep = await steps.getLastStep(sessionId);

      expect(lastStep).not.toBeNull();
      expect(lastStep?.stepNumber).toBe(2);
      expect(lastStep?.thought).toBe('第二步');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：空会话获取最后步骤
   * 验证会话没有步骤时返回 null
   */
  it('空会话获取最后步骤应该返回 null', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const lastStep = await steps.getLastStep(sessionId);
      expect(lastStep).toBeNull();
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取下一步序号
   * 验证能正确获取下一个可用的步骤序号
   */
  it('应该能获取下一步序号', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      // 空会话时下一步序号为 1
      const next1 = await steps.getNextStepNumber(sessionId);
      expect(next1).toBe(1);

      // 创建一个步骤后下一步序号为 2
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '第一步',
        action: createMockAction(),
      });
      const next2 = await steps.getNextStepNumber(sessionId);
      expect(next2).toBe(2);

      // 再创建一个步骤后下一步序号为 3
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '第二步',
        action: createMockAction(),
      });
      const next3 = await steps.getNextStepNumber(sessionId);
      expect(next3).toBe(3);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：删除步骤
   * 验证能正确删除步骤
   */
  it('应该能删除步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '待删除',
        action: createMockAction(),
      });

      const result = await steps.deleteStep(step.stepId);
      expect(result).toBe(true);

      const retrieved = await steps.getStep(step.stepId);
      expect(retrieved).toBeNull();
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：删除不存在的步骤
   * 验证删除不存在步骤时抛出错误
   */
  it('删除不存在步骤应该抛出错误', async () => {
    const { db, steps } = await createTestContext();

    try {
      await expect(steps.deleteStep('step-non-existent')).rejects.toThrow(
        '步骤不存在'
      );
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：删除会话的所有步骤
   * 验证能批量删除会话的所有步骤
   */
  it('应该能删除会话的所有步骤', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '步骤1',
        action: createMockAction(),
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '步骤2',
        action: createMockAction(),
      });
      await steps.createStep({
        sessionId,
        stepNumber: 3,
        thought: '步骤3',
        action: createMockAction(),
      });

      const deletedCount = await steps.deleteStepsBySession(sessionId);
      expect(deletedCount).toBe(3);

      const remainingSteps = await steps.getStepsBySession(sessionId);
      expect(remainingSteps.length).toBe(0);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取步骤数量
   * 验证能正确统计步骤数量
   */
  it('应该能获取步骤数量', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      expect(await steps.getStepCount(sessionId)).toBe(0);

      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '步骤1',
        action: createMockAction(),
      });
      expect(await steps.getStepCount(sessionId)).toBe(1);

      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '步骤2',
        action: createMockAction(),
      });
      expect(await steps.getStepCount(sessionId)).toBe(2);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：按状态获取步骤数量
   * 验证能按状态统计步骤数量
   */
  it('应该能按状态获取步骤数量', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: '已完成',
        action: createMockAction(),
        status: 'completed',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 2,
        thought: '运行中',
        action: createMockAction(),
        status: 'running',
      });
      await steps.createStep({
        sessionId,
        stepNumber: 3,
        thought: '已失败',
        action: createMockAction(),
        status: 'failed',
      });

      expect(await steps.getStepCount(sessionId, 'completed')).toBe(1);
      expect(await steps.getStepCount(sessionId, 'running')).toBe(1);
      expect(await steps.getStepCount(sessionId, 'failed')).toBe(1);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：多个会话步骤隔离
   * 验证不同会话的步骤互不干扰
   */
  it('不同会话的步骤应该互相隔离', async () => {
    const dbPath = getTestDbPath();
    testDbPaths.push(dbPath);

    const db = new SQLiteClient(dbPath);
    await db.connect();

    try {
      const sessions = new Sessions(db);
      const steps = new Steps(db);

      const session1 = await sessions.createSession({
        taskDescription: '会话1',
      });
      const session2 = await sessions.createSession({
        taskDescription: '会话2',
      });

      await steps.createStep({
        sessionId: session1.sessionId,
        stepNumber: 1,
        thought: '会话1的步骤',
        action: createMockAction(),
      });
      await steps.createStep({
        sessionId: session2.sessionId,
        stepNumber: 1,
        thought: '会话2的步骤',
        action: createMockAction(),
      });

      const session1Steps = await steps.getStepsBySession(session1.sessionId);
      const session2Steps = await steps.getStepsBySession(session2.sessionId);

      expect(session1Steps.length).toBe(1);
      expect(session1Steps[0].thought).toBe('会话1的步骤');

      expect(session2Steps.length).toBe(1);
      expect(session2Steps[0].thought).toBe('会话2的步骤');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：JSON 字段序列化
   * 验证复杂对象能正确序列化和反序列化
   */
  it('应该正确序列化和反序列化 JSON 字段', async () => {
    const { db, steps, sessionId } = await createTestContext();

    try {
      const action: AgentAction = {
        thought: '复杂思考\n多行文本',
        toolName: 'file_read',
        parameters: {
          path: './test.txt',
          options: { encoding: 'utf8', recursive: true },
          nested: { deep: { value: 123 } },
        },
        expectedOutcome: '获取内容',
      };

      const observation: Observation = {
        raw: '原始输出\n包含\n换行',
        summary: '摘要',
        success: true,
        artifacts: ['./file1.txt', './file2.txt'],
        executionTimeMs: 1500,
      };

      const step = await steps.createStep({
        sessionId,
        stepNumber: 1,
        thought: 'JSON测试',
        action,
        observation,
      });

      const retrieved = await steps.getStep(step.stepId);

      expect(retrieved?.action).toEqual(action);
      expect(retrieved?.observation).toEqual(observation);
    } finally {
      await db.close();
    }
  });
});
