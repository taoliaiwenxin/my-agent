/**
 * @file TaskGraph.test.ts
 * @description TaskGraph 单元测试
 */

import {
  TaskGraph,
  createTaskGraph,
  CyclicDependencyError,
  StepNotFoundError,
} from '../../src/planner/TaskGraph';
import { TaskPlan } from '../../src/types';

describe('TaskGraph', () => {
  let graph: TaskGraph;

  beforeEach(() => {
    graph = new TaskGraph('plan-001', '测试计划');
  });

  describe('基本功能', () => {
    it('应该创建实例', () => {
      expect(graph).toBeInstanceOf(TaskGraph);
      expect(graph.getPlanId()).toBe('plan-001');
      expect(graph.getDescription()).toBe('测试计划');
    });

    it('应该通过便捷函数创建', () => {
      const g = createTaskGraph('plan-002', '另一个计划');
      expect(g).toBeInstanceOf(TaskGraph);
      expect(g.getPlanId()).toBe('plan-002');
    });

    it('初始状态应该是 pending', () => {
      expect(graph.getStatus()).toBe('pending');
    });
  });

  describe('步骤管理', () => {
    it('应该添加步骤', () => {
      graph.addStep({ id: '1', description: '步骤1', dependencies: [] });

      expect(graph.getStepCount()).toBe(1);
      const step = graph.getStep('1');
      expect(step).toBeDefined();
      expect(step?.description).toBe('步骤1');
      expect(step?.status).toBe('pending');
    });

    it('应该批量添加步骤', () => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
        { id: '3', description: '步骤3', dependencies: ['1'] },
      ]);

      expect(graph.getStepCount()).toBe(3);
    });

    it('应该正确处理依赖', () => {
      graph.addStep({ id: '1', description: '步骤1', dependencies: [] });
      graph.addStep({ id: '2', description: '步骤2', dependencies: ['1'] });

      const step2 = graph.getStep('2');
      expect(step2?.dependencies).toContain('1');
    });

    it('添加不存在依赖的步骤应该抛出错误', () => {
      expect(() => {
        graph.addStep({ id: '2', description: '步骤2', dependencies: ['1'] });
      }).toThrow(StepNotFoundError);
    });

    it('应该检测循环依赖', () => {
      graph.addStep({ id: '1', description: '步骤1', dependencies: [] });
      graph.addStep({ id: '2', description: '步骤2', dependencies: ['1'] });

      expect(() => {
        graph.addStep({ id: '3', description: '步骤3', dependencies: ['2', '1'] });
        // 尝试创建循环：1 -> 2 -> 3 -> 1
        graph.addStep({ id: '1', description: '步骤1', dependencies: ['3'] });
      }).toThrow();
    });

    it('步骤依赖自己应该抛出错误', () => {
      expect(() => {
        graph.addStep({ id: '1', description: '步骤1', dependencies: ['1'] });
      }).toThrow(CyclicDependencyError);
    });
  });

  describe('步骤状态管理', () => {
    beforeEach(() => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
        { id: '3', description: '步骤3', dependencies: ['1'] },
      ]);
    });

    it('应该获取可执行步骤', () => {
      const executable = graph.getExecutableSteps();
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe('1');
    });

    it('完成步骤后应该更新可执行步骤', () => {
      graph.markStepCompleted('1');

      const executable = graph.getExecutableSteps();
      expect(executable).toHaveLength(2);
      expect(executable.map((s) => s.id).sort()).toEqual(['2', '3']);
    });

    it('应该标记步骤为运行中', () => {
      graph.markStepRunning('1');

      const step = graph.getStep('1');
      expect(step?.status).toBe('running');
      expect(step?.startedAt).toBeDefined();
    });

    it('应该标记步骤为已完成', () => {
      graph.markStepCompleted('1', '结果');

      const step = graph.getStep('1');
      expect(step?.status).toBe('completed');
      expect(step?.result).toBe('结果');
      expect(step?.completedAt).toBeDefined();
    });

    it('应该标记步骤为失败', () => {
      graph.markStepFailed('1', '出错了');

      const step = graph.getStep('1');
      expect(step?.status).toBe('failed');
      expect(step?.error).toBe('出错了');
    });

    it('步骤失败应该跳过依赖步骤', () => {
      graph.markStepFailed('1', '第一步失败');

      const step2 = graph.getStep('2');
      const step3 = graph.getStep('3');

      expect(step2?.status).toBe('skipped');
      expect(step3?.status).toBe('skipped');
    });

    it('操作不存在步骤应该抛出错误', () => {
      expect(() => graph.markStepRunning('999')).toThrow(StepNotFoundError);
      expect(() => graph.markStepCompleted('999')).toThrow(StepNotFoundError);
      expect(() => graph.markStepFailed('999', 'error')).toThrow(StepNotFoundError);
    });
  });

  describe('统计信息', () => {
    beforeEach(() => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
        { id: '3', description: '步骤3', dependencies: ['1'] },
        { id: '4', description: '步骤4', dependencies: ['2', '3'] },
      ]);
    });

    it('应该返回正确的统计信息', () => {
      const stats = graph.getStats();

      expect(stats.totalSteps).toBe(4);
      expect(stats.pendingSteps).toBe(4);
      expect(stats.completedSteps).toBe(0);
      expect(stats.completionPercentage).toBe(0);
    });

    it('完成步骤后应该更新统计', () => {
      graph.markStepCompleted('1');
      graph.markStepCompleted('2');

      const stats = graph.getStats();
      expect(stats.completedSteps).toBe(2);
      expect(stats.pendingSteps).toBe(2);
      expect(stats.completionPercentage).toBe(50);
    });
  });

  describe('序列化', () => {
    it('应该从 TaskPlan 创建', () => {
      const plan: TaskPlan = {
        planId: 'plan-002',
        description: '导入的计划',
        steps: [
          { id: '1', description: '步骤1', dependencies: [] },
          { id: '2', description: '步骤2', dependencies: ['1'] },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const importedGraph = TaskGraph.fromTaskPlan(plan);

      expect(importedGraph.getPlanId()).toBe('plan-002');
      expect(importedGraph.getStepCount()).toBe(2);
    });

    it('应该转换为 TaskPlan', () => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
      ]);
      graph.markStepCompleted('1');

      const plan = graph.toTaskPlan();

      expect(plan.planId).toBe('plan-001');
      expect(plan.steps).toHaveLength(2);
      expect(plan.status).toBe('pending'); // 还有未完成的步骤
    });
  });

  describe('拓扑排序', () => {
    it('应该返回拓扑排序的步骤', () => {
      // 构建一个复杂的依赖图
      graph.addSteps([
        { id: 'a', description: '步骤A', dependencies: [] },
        { id: 'b', description: '步骤B', dependencies: ['a'] },
        { id: 'c', description: '步骤C', dependencies: ['a'] },
        { id: 'd', description: '步骤D', dependencies: ['b', 'c'] },
      ]);

      const sorted = graph.getTopologicalOrder();
      const ids = sorted.map((s) => s.id);

      // A 必须在 B 和 C 之前
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'));
      // B 和 C 必须在 D 之前
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'));
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'));
    });
  });

  describe('并行分组', () => {
    it('应该返回并行执行组', () => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
        { id: '3', description: '步骤3', dependencies: ['1'] },
        { id: '4', description: '步骤4', dependencies: ['2', '3'] },
      ]);

      const groups = graph.getParallelGroups();

      // 第1组: [1]
      // 第2组: [2, 3] (可并行)
      // 第3组: [4]
      expect(groups).toHaveLength(3);
      expect(groups[0]).toHaveLength(1);
      expect(groups[1]).toHaveLength(2);
      expect(groups[2]).toHaveLength(1);
    });
  });

  describe('重置和删除', () => {
    beforeEach(() => {
      graph.addSteps([
        { id: '1', description: '步骤1', dependencies: [] },
        { id: '2', description: '步骤2', dependencies: ['1'] },
      ]);
      graph.markStepCompleted('1');
    });

    it('应该重置步骤状态', () => {
      graph.resetStep('1');

      const step = graph.getStep('1');
      expect(step?.status).toBe('pending');
      expect(step?.result).toBeUndefined();
    });

    it('应该重置所有步骤', () => {
      graph.resetStep();

      const step1 = graph.getStep('1');
      const step2 = graph.getStep('2');

      expect(step1?.status).toBe('pending');
      expect(step2?.status).toBe('pending');
    });

    it('应该删除步骤', () => {
      const deleted = graph.removeStep('2');

      expect(deleted).toBe(true);
      expect(graph.getStepCount()).toBe(1);
    });

    it('不能删除有依赖的步骤', () => {
      const deleted = graph.removeStep('1');

      expect(deleted).toBe(false);
      expect(graph.getStepCount()).toBe(2);
    });

    it('应该清空所有步骤', () => {
      graph.clear();

      expect(graph.getStepCount()).toBe(0);
      expect(graph.getAllSteps()).toHaveLength(0);
    });
  });
});
