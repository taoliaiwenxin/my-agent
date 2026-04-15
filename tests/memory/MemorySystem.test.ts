/**
 * @file MemorySystem.test.ts
 * @description MemorySystem 模块单元测试
 *              测试记忆系统的会话管理、加载保存、崩溃恢复功能
 * @module tests/memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteClient } from '../../src/memory/SQLiteClient';
import { MemorySystem, MemorySystemConfig } from '../../src/memory/MemorySystem';

describe('MemorySystem', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, 'temp');

  /** 生成唯一的测试数据库路径 */
  const getTestDbPath = () => path.join(testDbDir, `memory-system-test-${Date.now()}.db`);

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
   * 创建测试用的 MemorySystem 实例
   */
  async function createTestMemorySystem(
    options?: MemorySystemConfig
  ): Promise<{ db: SQLiteClient; memorySystem: MemorySystem }> {
    const dbPath = getTestDbPath();
    testDbPaths.push(dbPath);

    const db = new SQLiteClient(dbPath);
    await db.connect();

    const memorySystem = new MemorySystem(db, {
      autoSave: false,
      ...options,
    });

    return { db, memorySystem };
  }

  /**
   * 测试：创建会话
   * 验证能成功创建新会话和工作记忆
   */
  it('应该能创建新会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session, workingMemory } = await memorySystem.createSession('测试任务');

      expect(session.sessionId).toMatch(/^session-/);
      expect(session.taskDescription).toBe('测试任务');
      expect(session.finalStatus).toBe('pending');
      expect(workingMemory).toBeDefined();
      expect(workingMemory.getSessionId()).toBe(session.sessionId);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：创建会话带自定义配置
   * 验证能使用自定义工作记忆配置创建会话
   */
  it('应该能使用自定义配置创建会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem({
      workingMemoryOptions: {
        maxTokens: 8000,
        systemPrompt: '自定义系统提示',
      },
    });

    try {
      const { workingMemory } = await memorySystem.createSession('自定义任务');

      const messages = workingMemory.getMessages();
      expect(messages.some((m) => m.role === 'system' && m.content === '自定义系统提示')).toBe(true);

      const usage = workingMemory.getTokenUsage();
      expect(usage.max).toBe(8000);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：活跃内存管理
   * 验证创建会话后工作记忆被正确保存到活跃内存
   */
  it('应该将工作记忆保存到活跃内存', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session, workingMemory } = await memorySystem.createSession('测试任务');

      expect(memorySystem.hasActiveMemory(session.sessionId)).toBe(true);
      expect(memorySystem.getActiveMemory(session.sessionId)).toBe(workingMemory);
      expect(memorySystem.getActiveSessionIds()).toContain(session.sessionId);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：加载会话
   * 验证能从数据库加载会话和工作记忆
   */
  it('应该能加载已存在的会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      // 创建会话
      const { session: createdSession, workingMemory: createdMemory } =
        await memorySystem.createSession('加载测试');

      // 添加一些消息
      createdMemory.addUserMessage('用户问题');
      createdMemory.addAssistantMessage('助手回答');

      // 保存会话
      await memorySystem.saveSession(createdSession.sessionId);

      // 创建新的 MemorySystem 实例（模拟重启）
      const newMemorySystem = new MemorySystem(db, { autoSave: false });

      // 加载会话
      const { session, workingMemory, steps } = await newMemorySystem.loadSession(
        createdSession.sessionId
      );

      expect(session.sessionId).toBe(createdSession.sessionId);
      expect(session.taskDescription).toBe('加载测试');
      expect(workingMemory).toBeDefined();
      expect(steps.length).toBeGreaterThanOrEqual(0);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：加载不存在的会话
   * 验证加载不存在会话时抛出错误
   */
  it('加载不存在的会话应该抛出错误', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      await expect(
        memorySystem.loadSession('session-non-existent')
      ).rejects.toThrow('会话不存在');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：保存会话
   * 验证能将工作记忆保存到数据库
   */
  it('应该能保存会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session, workingMemory } = await memorySystem.createSession('保存测试');

      // 添加消息
      workingMemory.addUserMessage('问题1');
      workingMemory.addAssistantMessage('回答1', [
        { id: 'call-1', name: 'test_tool', arguments: {} },
      ]);

      // 保存
      const result = await memorySystem.saveSession(session.sessionId);
      expect(result).toBe(true);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：结束会话
   * 验证能正确结束会话并更新状态
   */
  it('应该能结束会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session } = await memorySystem.createSession('结束测试');

      // 结束会话
      await memorySystem.endSession(session.sessionId, 'completed', '任务完成');

      // 验证会话状态
      expect(memorySystem.hasActiveMemory(session.sessionId)).toBe(false);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：结束会话失败状态
   * 验证能正确标记会话失败
   */
  it('应该能以失败状态结束会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session } = await memorySystem.createSession('失败测试');

      // 结束会话并标记失败
      await memorySystem.endSession(session.sessionId, 'failed', '执行超时');

      // 验证会话状态
      const stats = await memorySystem.getSessionStats(session.sessionId);
      expect(stats.session.finalStatus).toBe('failed');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：崩溃恢复
   * 验证能从崩溃的会话中恢复
   */
  it('应该能恢复崩溃的会话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      // 创建会话
      const { session, workingMemory } = await memorySystem.createSession('恢复测试');

      // 添加一些消息
      workingMemory.addUserMessage('问题');
      workingMemory.addAssistantMessage('回答');

      // 保存会话
      await memorySystem.saveSession(session.sessionId);

      // 模拟崩溃恢复
      const recovery = await memorySystem.recoverSession(session.sessionId);

      expect(recovery.session.sessionId).toBe(session.sessionId);
      expect(recovery.workingMemory).toBeDefined();
      expect(recovery.needsRecovery).toBe(true);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：导出对话
   * 验证能导出会话历史为消息格式
   */
  it('应该能导出会话对话', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session, workingMemory } = await memorySystem.createSession('导出测试');

      workingMemory.addUserMessage('问题1');
      workingMemory.addAssistantMessage('回答1');
      workingMemory.addUserMessage('问题2');

      const messages = await memorySystem.exportConversation(session.sessionId);

      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages.some((m) => m.content === '问题1')).toBe(true);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取会话统计
   * 验证能获取会话的统计信息
   */
  it('应该能获取会话统计', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session, workingMemory } = await memorySystem.createSession('统计测试');

      workingMemory.addUserMessage('问题');
      await memorySystem.saveSession(session.sessionId);

      const stats = await memorySystem.getSessionStats(session.sessionId);

      expect(stats.session.sessionId).toBe(session.sessionId);
      expect(stats.messageCount).toBeGreaterThanOrEqual(1);
      expect(stats.tokenUsage.max).toBeGreaterThan(0);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：获取不存在会话的统计
   * 验证获取不存在会话的统计时抛出错误
   */
  it('获取不存在会话的统计应该抛出错误', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      await expect(
        memorySystem.getSessionStats('session-non-existent')
      ).rejects.toThrow('会话不存在');
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：销毁记忆系统
   * 验证能正确清理资源
   */
  it('应该能销毁记忆系统', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      const { session } = await memorySystem.createSession('销毁测试');
      expect(memorySystem.hasActiveMemory(session.sessionId)).toBe(true);

      await memorySystem.destroy();

      expect(memorySystem.getActiveSessionIds()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  /**
   * 测试：多个会话隔离
   * 验证多个会话之间互不干扰
   */
  it('多个会话应该互相隔离', async () => {
    const { db, memorySystem } = await createTestMemorySystem();

    try {
      // 创建两个会话
      const { session: session1, workingMemory: memory1 } =
        await memorySystem.createSession('会话1');
      const { session: session2, workingMemory: memory2 } =
        await memorySystem.createSession('会话2');

      // 向会话1添加消息
      memory1.addUserMessage('会话1的消息');

      // 向会话2添加消息
      memory2.addUserMessage('会话2的消息');

      // 验证隔离
      expect(memory1.getLastMessage()?.content).toBe('会话1的消息');
      expect(memory2.getLastMessage()?.content).toBe('会话2的消息');

      // 保存
      await memorySystem.saveSession(session1.sessionId);
      await memorySystem.saveSession(session2.sessionId);

      // 加载并验证
      const loaded1 = await memorySystem.loadSession(session1.sessionId);
      const loaded2 = await memorySystem.loadSession(session2.sessionId);

      expect(loaded1.session.taskDescription).toBe('会话1');
      expect(loaded2.session.taskDescription).toBe('会话2');
    } finally {
      await db.close();
    }
  });
});
