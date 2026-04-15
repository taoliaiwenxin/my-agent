/**
 * @file Sessions.test.ts
 * @description Sessions 模块单元测试
 *              测试会话的创建、状态更新、查询和删除功能
 * @module tests/memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteClient } from '../../src/memory/SQLiteClient';
import { Sessions } from '../../src/memory/Sessions';
// SessionStatus type not needed in tests

describe('Sessions', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, 'temp');

  /** 生成唯一的测试数据库路径 */
  const getTestDbPath = () => path.join(testDbDir, `sessions-test-${Date.now()}.db`);

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
   * 创建测试用的 Sessions 实例
   */
  async function createTestSessions(): Promise<{ db: SQLiteClient; sessions: Sessions }> {
    const dbPath = getTestDbPath();
    testDbPaths.push(dbPath);

    const db = new SQLiteClient(dbPath);
    await db.connect();

    const sessions = new Sessions(db);
    return { db, sessions };
  }

  /**
   * 测试：创建会话
   * 验证能成功创建新会话并返回正确的会话对象
   */
  it('应该能创建新会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({
        taskDescription: '测试任务',
        initialStatus: 'pending',
      });

      expect(session.sessionId).toMatch(/^session-\d+-[a-z0-9]+$/);
      expect(session.taskDescription).toBe('测试任务');
      expect(session.finalStatus).toBe('pending');
      expect(session.stepCount).toBe(0);
      expect(session.createdAt).toBeInstanceOf(Date);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：创建会话使用默认状态
   * 验证不指定初始状态时会使用 'pending' 作为默认值
   */
  it('创建会话应该使用默认状态 pending', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({
        taskDescription: '默认状态测试',
      });

      expect(session.finalStatus).toBe('pending');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取会话
   * 验证能正确获取已创建的会话信息
   */
  it('应该能获取会话信息', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const created = await sessions.createSession({
        taskDescription: '获取测试',
        initialStatus: 'running',
      });

      const retrieved = await sessions.getSession(created.sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(created.sessionId);
      expect(retrieved?.taskDescription).toBe('获取测试');
      expect(retrieved?.finalStatus).toBe('running');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取不存在的会话
   * 验证获取不存在的会话时返回 null
   */
  it('获取不存在的会话应该返回 null', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const retrieved = await sessions.getSession('session-non-existent');
      expect(retrieved).toBeNull();
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新会话状态
   * 验证能正确更新会话状态
   */
  it('应该能更新会话状态', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({
        taskDescription: '状态更新测试',
      });

      await sessions.updateSessionStatus(session.sessionId, 'running');

      const updated = await sessions.getSession(session.sessionId);
      expect(updated?.finalStatus).toBe('running');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：完成会话
   * 验证 completeSession 方法能正确设置完成状态和结果
   */
  it('应该能完成会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({
        taskDescription: '完成测试',
      });

      await sessions.completeSession(session.sessionId, '任务完成结果');

      const completed = await sessions.getSession(session.sessionId);
      expect(completed?.finalStatus).toBe('completed');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：失败会话
   * 验证 failSession 方法能正确设置失败状态和错误信息
   */
  it('应该能标记会话失败', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({
        taskDescription: '失败测试',
      });

      await sessions.failSession(session.sessionId, '执行超时');

      const failed = await sessions.getSession(session.sessionId);
      expect(failed?.finalStatus).toBe('failed');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：更新不存在会话的状态
   * 验证更新不存在会话时抛出错误
   */
  it('更新不存在会话应该抛出错误', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      await expect(
        sessions.updateSessionStatus('session-non-existent', 'running')
      ).rejects.toThrow('会话不存在');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：列会话
   * 验证能正确获取会话列表
   */
  it('应该能列出会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      // 创建多个会话
      await sessions.createSession({ taskDescription: '任务1' });
      await sessions.createSession({ taskDescription: '任务2' });
      await sessions.createSession({ taskDescription: '任务3' });

      const list = await sessions.listSessions();

      expect(list.length).toBe(3);
      expect(list.map((s) => s.taskDescription)).toContain('任务1');
      expect(list.map((s) => s.taskDescription)).toContain('任务2');
      expect(list.map((s) => s.taskDescription)).toContain('任务3');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：按状态过滤会话
   * 验证能根据状态过滤会话列表
   */
  it('应该能按状态过滤会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      await sessions.createSession({ taskDescription: '待处理' });
      const session2 = await sessions.createSession({ taskDescription: '已完成' });
      const session3 = await sessions.createSession({ taskDescription: '已失败' });

      await sessions.updateSessionStatus(session2.sessionId, 'completed');
      await sessions.failSession(session3.sessionId, '错误');

      const completedSessions = await sessions.listSessions({ status: 'completed' });
      const pendingSessions = await sessions.listSessions({ status: 'pending' });
      const failedSessions = await sessions.listSessions({ status: 'failed' });

      expect(completedSessions.length).toBe(1);
      expect(completedSessions[0].taskDescription).toBe('已完成');

      expect(pendingSessions.length).toBe(1);
      expect(pendingSessions[0].taskDescription).toBe('待处理');

      expect(failedSessions.length).toBe(1);
      expect(failedSessions[0].taskDescription).toBe('已失败');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：会话分页
   * 验证分页功能正常工作
   */
  it('应该支持分页查询', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      // 创建5个会话
      for (let i = 1; i <= 5; i++) {
        await sessions.createSession({ taskDescription: `任务${i}` });
      }

      const page1 = await sessions.listSessions({ limit: 2, offset: 0 });
      const page2 = await sessions.listSessions({ limit: 2, offset: 2 });
      const page3 = await sessions.listSessions({ limit: 2, offset: 4 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page3.length).toBe(1);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：会话排序
   * 验证能按创建时间排序
   */
  it('应该支持按时间排序', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session1 = await sessions.createSession({ taskDescription: '第一个' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const session2 = await sessions.createSession({ taskDescription: '第二个' });

      const descList = await sessions.listSessions({ order: 'desc' });
      expect(descList[0].sessionId).toBe(session2.sessionId);

      const ascList = await sessions.listSessions({ order: 'asc' });
      expect(ascList[0].sessionId).toBe(session1.sessionId);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：删除会话
   * 验证能正确删除会话
   */
  it('应该能删除会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const session = await sessions.createSession({ taskDescription: '待删除' });

      const result = await sessions.deleteSession(session.sessionId);
      expect(result).toBe(true);

      const retrieved = await sessions.getSession(session.sessionId);
      expect(retrieved).toBeNull();
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：删除不存在的会话
   * 验证删除不存在会话时抛出错误
   */
  it('删除不存在会话应该抛出错误', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      await expect(sessions.deleteSession('session-non-existent')).rejects.toThrow(
        '会话不存在'
      );
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取会话数量
   * 验证能正确统计会话数量
   */
  it('应该能获取会话数量', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      expect(await sessions.getSessionCount()).toBe(0);

      await sessions.createSession({ taskDescription: '任务1' });
      expect(await sessions.getSessionCount()).toBe(1);

      await sessions.createSession({ taskDescription: '任务2' });
      expect(await sessions.getSessionCount()).toBe(2);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：按状态获取会话数量
   * 验证能按状态统计会话数量
   */
  it('应该能按状态获取会话数量', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      await sessions.createSession({ taskDescription: '待处理' });
      const session2 = await sessions.createSession({ taskDescription: '已完成' });
      const session3 = await sessions.createSession({ taskDescription: '已失败' });

      await sessions.updateSessionStatus(session2.sessionId, 'completed');
      await sessions.failSession(session3.sessionId, '错误');

      expect(await sessions.getSessionCount('pending')).toBe(1);
      expect(await sessions.getSessionCount('completed')).toBe(1);
      expect(await sessions.getSessionCount('failed')).toBe(1);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取活动会话
   * 验证能获取状态为 pending 或 running 的会话
   */
  it('应该能获取活动会话', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const pendingSession = await sessions.createSession({ taskDescription: '待处理' });
      const runningSession = await sessions.createSession({
        taskDescription: '运行中',
        initialStatus: 'running',
      });
      const completedSession = await sessions.createSession({
        taskDescription: '已完成',
        initialStatus: 'completed',
      });

      const activeSessions = await sessions.getActiveSessions();

      expect(activeSessions.length).toBe(2);
      expect(activeSessions.map((s) => s.sessionId)).toContain(pendingSession.sessionId);
      expect(activeSessions.map((s) => s.sessionId)).toContain(runningSession.sessionId);
      expect(activeSessions.map((s) => s.sessionId)).not.toContain(completedSession.sessionId);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：活动会话按时间排序
   * 验证活动会话按创建时间倒序排列
   */
  it('活动会话应该按时间倒序排列', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      await sessions.createSession({ taskDescription: '第一个' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await sessions.createSession({ taskDescription: '第二个' });

      const activeSessions = await sessions.getActiveSessions();

      expect(activeSessions[0].taskDescription).toBe('第二个');
      expect(activeSessions[1].taskDescription).toBe('第一个');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：会话ID唯一性
   * 验证每次创建会话都生成唯一的ID
   */
  it('每次创建应该生成唯一的会话ID', async () => {
    const { db, sessions } = await createTestSessions();

    try {
      const sessionIds = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const session = await sessions.createSession({ taskDescription: `任务${i}` });
        expect(sessionIds.has(session.sessionId)).toBe(false);
        sessionIds.add(session.sessionId);
      }

      expect(sessionIds.size).toBe(10);
    } finally {
      await db.close();
    }
  });
});
