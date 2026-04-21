/**
 * @file StateManager.test.ts
 * @description StateManager 模块单元测试
 *              测试状态管理、状态转换、持久化和崩溃恢复
 * @module tests/core
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteClient } from '../../src/memory/SQLiteClient';
import { MemorySystem } from '../../src/memory/MemorySystem';
import { StateManager, createStateManager } from '../../src/core/StateManager';

describe('StateManager', () => {
  /** 测试数据库目录 */
  const testDbDir = path.join(__dirname, '../temp');

  /** 生成唯一的测试数据库路径 */
  const getTestDbPath = () => path.join(testDbDir, `state-manager-test-${Date.now()}.db`);

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
  });

  /**
   * 创建测试用的 StateManager 实例
   */
  async function createTestStateManager(
    enablePersistence = true
  ): Promise<{ db: SQLiteClient; memorySystem: MemorySystem; stateManager: StateManager }> {
    const dbPath = getTestDbPath();
    testDbPaths.push(dbPath);

    const db = new SQLiteClient(dbPath);
    await db.connect();

    const memorySystem = new MemorySystem(db, { autoSave: false });

    const stateManager = new StateManager({
      memorySystem,
      enablePersistence,
      autoSaveInterval: 100,
    });

    return { db, memorySystem, stateManager };
  }

  describe('状态管理', () => {
    /**
     * 测试：初始状态
     */
    it('初始状态应该是 idle', async () => {
      const { stateManager } = await createTestStateManager();
      expect(stateManager.getState()).toBe('idle');
    });

    /**
     * 测试：有效状态转换
     */
    it('应该支持有效状态转换', async () => {
      const { stateManager } = await createTestStateManager();

      expect(stateManager.transitionTo('initializing')).toBe(true);
      expect(stateManager.getState()).toBe('initializing');

      expect(stateManager.transitionTo('planning')).toBe(true);
      expect(stateManager.getState()).toBe('planning');

      expect(stateManager.transitionTo('running')).toBe(true);
      expect(stateManager.getState()).toBe('running');

      expect(stateManager.transitionTo('completed')).toBe(true);
      expect(stateManager.getState()).toBe('completed');
    });

    /**
     * 测试：无效状态转换
     */
    it('应该拒绝无效状态转换', async () => {
      const { stateManager } = await createTestStateManager();

      // idle 不能直接到 running
      expect(stateManager.transitionTo('running')).toBe(false);
      expect(stateManager.getState()).toBe('idle');

      // 先转换到 running
      stateManager.transitionTo('initializing');
      stateManager.transitionTo('running');

      // running 不能直接到 idle
      expect(stateManager.transitionTo('idle')).toBe(false);
      expect(stateManager.getState()).toBe('running');
    });

    /**
     * 测试：相同状态转换
     */
    it('相同状态转换应该允许', async () => {
      const { stateManager } = await createTestStateManager();

      expect(stateManager.transitionTo('idle')).toBe(true);
      expect(stateManager.getState()).toBe('idle');
    });

    /**
     * 测试：状态历史
     */
    it('应该记录状态历史', async () => {
      const { stateManager } = await createTestStateManager();

      stateManager.transitionTo('initializing', '开始初始化');
      stateManager.transitionTo('planning', '开始规划');
      stateManager.transitionTo('running', '开始执行');

      const history = stateManager.getStateHistory();
      expect(history.length).toBe(3);
      expect(history[0].from).toBe('idle');
      expect(history[0].to).toBe('initializing');
      expect(history[0].reason).toBe('开始初始化');
      expect(history[2].from).toBe('planning');
      expect(history[2].to).toBe('running');
    });

    /**
     * 测试：状态历史限制
     */
    it('应该支持状态历史限制', async () => {
      const { stateManager } = await createTestStateManager();

      stateManager.transitionTo('initializing');
      stateManager.transitionTo('planning');
      stateManager.transitionTo('running');

      const history = stateManager.getStateHistory(2);
      expect(history.length).toBe(2);
    });
  });

  describe('会话管理', () => {
    /**
     * 测试：开始会话
     */
    it('应该能开始新会话', async () => {
      const { stateManager } = await createTestStateManager();

      await stateManager.startSession('session-001', '测试任务');

      expect(stateManager.getCurrentSessionId()).toBe('session-001');
      expect(stateManager.getState()).toBe('initializing');

      const sessionState = stateManager.getSessionState();
      expect(sessionState).toBeDefined();
      expect(sessionState?.session.taskDescription).toBe('测试任务');
      expect(sessionState?.isRecovered).toBe(false);
    });

    /**
     * 测试：更新步骤状态
     */
    it('应该能更新步骤状态', async () => {
      const { stateManager } = await createTestStateManager();

      await stateManager.startSession('session-002', '测试任务');
      stateManager.transitionTo('running');

      stateManager.updateStepState(1, 'completed');

      const sessionState = stateManager.getSessionState();
      expect(sessionState?.completedSteps).toBe(1);
      expect(sessionState?.currentStepNumber).toBe(1);
      expect(sessionState?.currentStepStatus).toBe('completed');
    });

    /**
     * 测试：完成会话
     */
    it('应该能完成会话', async () => {
      const { stateManager } = await createTestStateManager();

      await stateManager.startSession('session-003', '测试任务');
      stateManager.transitionTo('running');
      stateManager.updateStepState(1, 'completed');

      stateManager.endSession(true, '任务完成');

      expect(stateManager.getState()).toBe('completed');
      expect(stateManager.getSessionState()?.session.finalStatus).toBe('completed');
      expect(stateManager.getSessionState()?.session.finalResult).toBe('任务完成');
    });

    /**
     * 测试：失败会话
     */
    it('应该能标记会话失败', async () => {
      const { stateManager } = await createTestStateManager();

      await stateManager.startSession('session-004', '测试任务');
      stateManager.transitionTo('running');

      stateManager.endSession(false, '执行超时');

      expect(stateManager.getState()).toBe('failed');
      expect(stateManager.getSessionState()?.session.finalStatus).toBe('failed');
    });

    /**
     * 测试：会话摘要
     */
    it('应该提供会话摘要', async () => {
      const { stateManager } = await createTestStateManager();

      expect(stateManager.getSessionSummary().state).toBe('idle');

      await stateManager.startSession('session-005', '测试任务');
      stateManager.transitionTo('running');
      stateManager.updateStepState(1, 'completed');

      const summary = stateManager.getSessionSummary();
      expect(summary.state).toBe('running');
      expect(summary.sessionId).toBe('session-005');
      expect(summary.taskDescription).toBe('测试任务');
      expect(summary.progress).toContain('1');
    });
  });

  describe('状态监听器', () => {
    /**
     * 测试：状态变更监听
     */
    it('应该通知状态变更监听器', async () => {
      const { stateManager } = await createTestStateManager();

      const events: { from: string; to: string }[] = [];
      const listener = (event: { from: string; to: string }) => {
        events.push(event);
      };

      stateManager.onStateChange(listener);
      stateManager.transitionTo('initializing');
      stateManager.transitionTo('planning');

      expect(events.length).toBe(2);
      expect(events[0].from).toBe('idle');
      expect(events[0].to).toBe('initializing');

      stateManager.offStateChange(listener);
      stateManager.transitionTo('running');

      // 移除监听器后不应该收到事件
      expect(events.length).toBe(2);
    });
  });

  describe('状态检查', () => {
    /**
     * 测试：活跃状态检查
     */
    it('应该正确判断活跃状态', async () => {
      const { stateManager } = await createTestStateManager();

      expect(stateManager.isActive()).toBe(false);

      stateManager.transitionTo('initializing');
      expect(stateManager.isActive()).toBe(true);

      stateManager.transitionTo('running');
      expect(stateManager.isActive()).toBe(true);

      stateManager.transitionTo('paused');
      expect(stateManager.isActive()).toBe(false);
    });

    /**
     * 测试：是否可以开始新任务
     */
    it('应该正确判断是否可以开始新任务', async () => {
      const { stateManager } = await createTestStateManager();

      expect(stateManager.canStartTask()).toBe(true);

      stateManager.transitionTo('initializing');
      expect(stateManager.canStartTask()).toBe(false);

      stateManager.transitionTo('running');
      expect(stateManager.canStartTask()).toBe(false);

      stateManager.transitionTo('completed');
      expect(stateManager.canStartTask()).toBe(true);
    });
  });

  describe('状态快照', () => {
    /**
     * 测试：创建快照
     */
    it('应该能创建状态快照', async () => {
      const { stateManager } = await createTestStateManager(false);

      await stateManager.startSession('session-006', '测试任务');
      stateManager.transitionTo('running');

      const snapshot = stateManager.createSnapshot();
      expect(snapshot.agentState).toBe('running');
      expect(snapshot.currentSessionId).toBe('session-006');
      expect(snapshot.sessionState).toBeDefined();
      expect(snapshot.version).toBe(1);
    });

    /**
     * 测试：从快照恢复
     */
    it('应该能从快照恢复', async () => {
      const { stateManager } = await createTestStateManager(false);

      await stateManager.startSession('session-007', '测试任务');
      stateManager.transitionTo('running');

      const snapshot = stateManager.createSnapshot();

      // 创建新的状态管理器并恢复
      const newManager = await createTestStateManager(false);
      newManager.stateManager.restoreSnapshot(snapshot);

      expect(newManager.stateManager.getState()).toBe('running');
      expect(newManager.stateManager.getCurrentSessionId()).toBe('session-007');
    });
  });

  describe('持久化', () => {
    /**
     * 测试：状态保存和加载
     */
    it('应该能保存和加载状态', async () => {
      const dbPath = getTestDbPath();
      testDbPaths.push(dbPath);

      const db = new SQLiteClient(dbPath);
      await db.connect();

      const memorySystem = new MemorySystem(db, { autoSave: false });
      const stateManager = new StateManager({
        memorySystem,
        enablePersistence: true,
      });

      // 先创建会话
      await memorySystem.createSession('测试任务保存');

      await stateManager.startSession('session-save', '测试任务保存');
      stateManager.transitionTo('running');
      stateManager.updateStepState(1, 'completed');

      // 手动保存状态
      await (stateManager as unknown as { saveState: () => Promise<void> }).saveState();

      // 使用同一个数据库创建新的状态管理器
      const memorySystem2 = new MemorySystem(db, { autoSave: false });
      const newManager = new StateManager({
        memorySystem: memorySystem2,
        enablePersistence: true,
      });

      const loaded = await newManager.loadState('session-save');

      expect(loaded).toBe(true);
      expect(newManager.getState()).toBe('running');
      expect(newManager.getCurrentSessionId()).toBe('session-save');

      await db.close();
    });

    /**
     * 测试：禁用持久化
     */
    it('禁用持久化时不应该保存状态', async () => {
      const { stateManager } = await createTestStateManager(false);

      await stateManager.startSession('session-nosave', '测试任务');
      stateManager.transitionTo('running');

      // 禁用持久化时 loadState 应该返回 false
      const loaded = await stateManager.loadState('session-nosave');
      expect(loaded).toBe(false);
    });
  });

  describe('便捷函数', () => {
    /**
     * 测试：createStateManager
     */
    it('createStateManager 应该创建正确实例', async () => {
      const { memorySystem } = await createTestStateManager();

      const manager = createStateManager({ memorySystem });
      expect(manager).toBeInstanceOf(StateManager);
      expect(manager.getState()).toBe('idle');
    });
  });

  describe('销毁', () => {
    /**
     * 测试：销毁清理
     */
    it('销毁后应该清理资源', async () => {
      const { stateManager } = await createTestStateManager();

      stateManager.startAutoSave();
      stateManager.destroy();

      expect(stateManager.getStateHistory().length).toBe(0);
    });
  });
});
