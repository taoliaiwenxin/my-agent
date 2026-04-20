/**
 * @file TaskGraph.ts
 * @description 任务图实现，支持 DAG（有向无环图）结构
 *              管理任务步骤及其依赖关系，支持并行执行独立步骤
 * @module planner
 * @author AI Agent
 * @date 2026-04-20
 * @version 1.0.0
 *
 * @example
 * const graph = new TaskGraph('plan-001', '分析代码库');
 *
 * // 添加步骤
 * graph.addStep({ id: '1', description: '读取文件列表', dependencies: [] });
 * graph.addStep({ id: '2', description: '分析代码', dependencies: ['1'] });
 * graph.addStep({ id: '3', description: '生成报告', dependencies: ['2'] });
 *
 * // 获取可执行步骤
 * const executable = graph.getExecutableSteps();
 *
 * // 标记步骤完成
 * graph.markStepCompleted('1');
 */

import { PlanStep, TaskPlan, SessionStatus } from '../types';

/**
 * 步骤状态
 */
export type GraphStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 任务图步骤
 */
export interface GraphStep extends PlanStep {
  /** 步骤状态 */
  status: GraphStepStatus;

  /** 开始时间 */
  startedAt?: Date;

  /** 完成时间 */
  completedAt?: Date;

  /** 错误信息 */
  error?: string;

  /** 执行结果 */
  result?: string;
}

/**
 * 任务图统计
 */
export interface TaskGraphStats {
  /** 总步骤数 */
  totalSteps: number;

  /** 待执行步骤数 */
  pendingSteps: number;

  /** 运行中步骤数 */
  runningSteps: number;

  /** 已完成步骤数 */
  completedSteps: number;

  /** 失败步骤数 */
  failedSteps: number;

  /** 跳过步骤数 */
  skippedSteps: number;

  /** 完成百分比 */
  completionPercentage: number;
}

/**
 * 循环依赖错误
 */
export class CyclicDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * 步骤不存在错误
 */
export class StepNotFoundError extends Error {
  constructor(stepId: string) {
    super(`步骤不存在: ${stepId}`);
    this.name = 'StepNotFoundError';
  }
}

/**
 * 任务图
 *
 * 管理任务步骤及其依赖关系，支持 DAG 结构。
 * 提供步骤状态管理、依赖检查和并行执行支持。
 */
export class TaskGraph {
  /** 计划 ID */
  private planId: string;

  /** 计划描述 */
  private description: string;

  /** 步骤映射表 */
  private steps: Map<string, GraphStep> = new Map();

  /** 依赖关系图：步骤 ID -> 依赖它的步骤列表 */
  private dependents: Map<string, string[]> = new Map();

  /** 计划状态 */
  private status: SessionStatus;

  /** 创建时间 */
  private createdAt: Date;

  /** 更新时间 */
  private updatedAt: Date;

  /**
   * 创建任务图实例
   *
   * @param planId - 计划 ID
   * @param description - 计划描述
   */
  constructor(planId: string, description: string) {
    this.planId = planId;
    this.description = description;
    this.status = 'pending';
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 从 TaskPlan 创建任务图
   *
   * @param plan - 任务计划
   * @returns TaskGraph 实例
   */
  public static fromTaskPlan(plan: TaskPlan): TaskGraph {
    const graph = new TaskGraph(plan.planId, plan.description);

    for (const step of plan.steps) {
      graph.addStep(step);
    }

    graph.status = plan.status;
    graph.createdAt = plan.createdAt;
    graph.updatedAt = plan.updatedAt;

    return graph;
  }

  /**
   * 添加步骤
   *
   * @param step - 计划步骤
   * @throws {CyclicDependencyError} 如果添加步骤会形成循环依赖
   * @throws {StepNotFoundError} 如果依赖的步骤不存在
   */
  public addStep(step: PlanStep): void {
    // 检查是否依赖自己
    if (step.dependencies.includes(step.id)) {
      throw new CyclicDependencyError(`步骤 ${step.id} 依赖自己`);
    }

    // 检查依赖是否存在
    for (const depId of step.dependencies) {
      if (!this.steps.has(depId)) {
        throw new StepNotFoundError(depId);
      }
    }

    // 检查是否形成循环依赖
    if (this.wouldCreateCycle(step.id, step.dependencies)) {
      throw new CyclicDependencyError(
        `添加步骤 ${step.id} 会形成循环依赖`
      );
    }

    // 添加步骤
    const graphStep: GraphStep = {
      ...step,
      status: 'pending',
    };

    this.steps.set(step.id, graphStep);

    // 更新依赖关系
    for (const depId of step.dependencies) {
      const deps = this.dependents.get(depId) || [];
      deps.push(step.id);
      this.dependents.set(depId, deps);
    }

    this.updateTimestamp();
  }

  /**
   * 批量添加步骤
   *
   * @param steps - 步骤列表
   */
  public addSteps(steps: PlanStep[]): void {
    // 按依赖顺序排序，确保依赖的步骤先被添加
    const sortedSteps = this.sortStepsByDependencies(steps);

    for (const step of sortedSteps) {
      this.addStep(step);
    }
  }

  /**
   * 获取步骤
   *
   * @param stepId - 步骤 ID
   * @returns 步骤对象或 undefined
   */
  public getStep(stepId: string): GraphStep | undefined {
    return this.steps.get(stepId);
  }

  /**
   * 获取所有步骤
   *
   * @returns 步骤列表
   */
  public getAllSteps(): GraphStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * 获取可执行步骤
   *
   * 返回所有依赖已满足且状态为 pending 的步骤
   *
   * @returns 可执行的步骤列表
   */
  public getExecutableSteps(): GraphStep[] {
    return this.getAllSteps().filter((step) => {
      if (step.status !== 'pending') {
        return false;
      }

      // 检查所有依赖是否已完成
      return step.dependencies.every((depId) => {
        const dep = this.steps.get(depId);
        return dep?.status === 'completed';
      });
    });
  }

  /**
   * 标记步骤为运行中
   *
   * @param stepId - 步骤 ID
   * @throws {StepNotFoundError} 如果步骤不存在
   */
  public markStepRunning(stepId: string): void {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new StepNotFoundError(stepId);
    }

    step.status = 'running';
    step.startedAt = new Date();
    this.updateTimestamp();
  }

  /**
   * 标记步骤为已完成
   *
   * @param stepId - 步骤 ID
   * @param result - 执行结果（可选）
   * @throws {StepNotFoundError} 如果步骤不存在
   */
  public markStepCompleted(stepId: string, result?: string): void {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new StepNotFoundError(stepId);
    }

    step.status = 'completed';
    step.result = result;
    step.completedAt = new Date();
    this.updateTimestamp();

    // 检查是否所有步骤都已完成
    this.checkCompletion();
  }

  /**
   * 标记步骤为失败
   *
   * @param stepId - 步骤 ID
   * @param error - 错误信息
   * @throws {StepNotFoundError} 如果步骤不存在
   */
  public markStepFailed(stepId: string, error: string): void {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new StepNotFoundError(stepId);
    }

    step.status = 'failed';
    step.error = error;
    step.completedAt = new Date();
    this.updateTimestamp();

    // 标记依赖此步骤的所有步骤为跳过
    this.skipDependentSteps(stepId, `依赖步骤 ${stepId} 失败`);
  }

  /**
   * 标记步骤为跳过
   *
   * @param stepId - 步骤 ID
   * @param reason - 跳过原因
   * @throws {StepNotFoundError} 如果步骤不存在
   */
  public markStepSkipped(stepId: string, reason: string): void {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new StepNotFoundError(stepId);
    }

    step.status = 'skipped';
    step.error = reason;
    this.updateTimestamp();

    // 标记依赖此步骤的所有步骤为跳过
    this.skipDependentSteps(stepId, reason);
  }

  /**
   * 跳过依赖步骤
   *
   * @param stepId - 步骤 ID
   * @param reason - 跳过原因
   */
  private skipDependentSteps(stepId: string, reason: string): void {
    const dependents = this.dependents.get(stepId) || [];

    for (const depId of dependents) {
      const dep = this.steps.get(depId);
      if (dep && dep.status === 'pending') {
        dep.status = 'skipped';
        dep.error = reason;
        this.skipDependentSteps(depId, reason);
      }
    }
  }

  /**
   * 检查计划是否完成
   */
  private checkCompletion(): void {
    const allCompleted = this.getAllSteps().every(
      (step) => step.status === 'completed' || step.status === 'skipped'
    );

    if (allCompleted) {
      const hasFailed = this.getAllSteps().some(
        (step) => step.status === 'failed' || step.error
      );

      this.status = hasFailed ? 'failed' : 'completed';
      this.updateTimestamp();
    }
  }

  /**
   * 获取计划 ID
   *
   * @returns 计划 ID
   */
  public getPlanId(): string {
    return this.planId;
  }

  /**
   * 获取计划描述
   *
   * @returns 计划描述
   */
  public getDescription(): string {
    return this.description;
  }

  /**
   * 获取计划状态
   *
   * @returns 计划状态
   */
  public getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * 更新计划状态
   *
   * @param status - 新状态
   */
  public setStatus(status: SessionStatus): void {
    this.status = status;
    this.updateTimestamp();
  }

  /**
   * 获取统计信息
   *
   * @returns 任务图统计
   */
  public getStats(): TaskGraphStats {
    const steps = this.getAllSteps();
    const total = steps.length;

    if (total === 0) {
      return {
        totalSteps: 0,
        pendingSteps: 0,
        runningSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        completionPercentage: 0,
      };
    }

    const completed = steps.filter((s) => s.status === 'completed').length;

    return {
      totalSteps: total,
      pendingSteps: steps.filter((s) => s.status === 'pending').length,
      runningSteps: steps.filter((s) => s.status === 'running').length,
      completedSteps: completed,
      failedSteps: steps.filter((s) => s.status === 'failed').length,
      skippedSteps: steps.filter((s) => s.status === 'skipped').length,
      completionPercentage: Math.round((completed / total) * 100),
    };
  }

  /**
   * 转换为 TaskPlan
   *
   * @returns TaskPlan 对象
   */
  public toTaskPlan(): TaskPlan {
    return {
      planId: this.planId,
      description: this.description,
      steps: this.getAllSteps().map((step) => ({
        id: step.id,
        description: step.description,
        dependencies: step.dependencies,
      })),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * 检查是否形成循环依赖
   *
   * @param stepId - 步骤 ID
   * @param dependencies - 依赖列表
   * @returns 是否会形成循环
   */
  private wouldCreateCycle(stepId: string, dependencies: string[]): boolean {
    // 检查是否直接依赖自己
    if (dependencies.includes(stepId)) {
      return true;
    }

    // 检查间接循环：依赖的步骤是否依赖当前步骤
    const visited = new Set<string>();
    const queue = [...dependencies];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === stepId) {
        return true;
      }

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      const deps = this.steps.get(current)?.dependencies || [];
      queue.push(...deps);
    }

    return false;
  }

  /**
   * 按依赖排序步骤
   *
   * @param steps - 步骤列表
   * @returns 排序后的步骤列表
   */
  private sortStepsByDependencies(steps: PlanStep[]): PlanStep[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const result: PlanStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: PlanStep) => {
      if (visited.has(step.id)) {
        return;
      }

      if (visiting.has(step.id)) {
        throw new CyclicDependencyError(`检测到循环依赖: ${step.id}`);
      }

      visiting.add(step.id);

      // 先访问依赖
      for (const depId of step.dependencies) {
        const dep = stepMap.get(depId);
        if (dep) {
          visit(dep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      result.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return result;
  }

  /**
   * 获取拓扑排序的步骤
   *
   * @returns 按依赖顺序排序的步骤列表
   */
  public getTopologicalOrder(): GraphStep[] {
    const sorted = this.sortStepsByDependencies(this.getAllSteps());
    return sorted.map((s) => this.steps.get(s.id)!).filter(Boolean);
  }

  /**
   * 获取并行执行组
   *
   * 将步骤按依赖层级分组，同组步骤可并行执行
   *
   * @returns 步骤分组列表
   */
  public getParallelGroups(): GraphStep[][] {
    const groups: GraphStep[][] = [];
    const completed = new Set<string>();

    while (completed.size < this.steps.size) {
      const group = this.getAllSteps().filter((step) => {
        if (completed.has(step.id)) {
          return false;
        }

        return step.dependencies.every((depId) => completed.has(depId));
      });

      if (group.length === 0) {
        break;
      }

      groups.push(group);
      group.forEach((step) => completed.add(step.id));
    }

    return groups;
  }

  /**
   * 重置步骤状态
   *
   * @param stepId - 步骤 ID，如果不提供则重置所有步骤
   */
  public resetStep(stepId?: string): void {
    if (stepId) {
      const step = this.steps.get(stepId);
      if (step) {
        step.status = 'pending';
        step.startedAt = undefined;
        step.completedAt = undefined;
        step.error = undefined;
        step.result = undefined;
      }
    } else {
      for (const step of this.steps.values()) {
        step.status = 'pending';
        step.startedAt = undefined;
        step.completedAt = undefined;
        step.error = undefined;
        step.result = undefined;
      }
    }

    this.status = 'pending';
    this.updateTimestamp();
  }

  /**
   * 删除步骤
   *
   * @param stepId - 步骤 ID
   * @returns 是否成功删除
   */
  public removeStep(stepId: string): boolean {
    // 检查是否有其他步骤依赖此步骤
    const dependents = this.dependents.get(stepId) || [];
    if (dependents.length > 0) {
      return false;
    }

    const deleted = this.steps.delete(stepId);
    this.dependents.delete(stepId);

    if (deleted) {
      this.updateTimestamp();
    }

    return deleted;
  }

  /**
   * 清空所有步骤
   */
  public clear(): void {
    this.steps.clear();
    this.dependents.clear();
    this.status = 'pending';
    this.updateTimestamp();
  }

  /**
   * 获取步骤数量
   *
   * @returns 步骤数量
   */
  public getStepCount(): number {
    return this.steps.size;
  }

  /**
   * 更新时间戳
   */
  private updateTimestamp(): void {
    this.updatedAt = new Date();
  }
}

/**
 * 创建任务图（便捷函数）
 *
 * @param planId - 计划 ID
 * @param description - 计划描述
 * @returns TaskGraph 实例
 */
export function createTaskGraph(planId: string, description: string): TaskGraph {
  return new TaskGraph(planId, description);
}

export default TaskGraph;
