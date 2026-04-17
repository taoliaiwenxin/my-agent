/**
 * @file planning.test.ts
 * @description Planning Prompt 模板测试
 * @module llm/prompts
 * @author AI Agent
 * @date 2026-04-17
 */

import {
  buildPlanningSystemPrompt,
  buildPlanningMessages,
  parseTaskPlan,
  validateTaskPlan,
  formatTaskPlan,
  getNextStep,
  PlanningPromptVars,
  TaskPlan,
  TaskPlanExample,
} from '../../../src/llm/prompts/planning';
import { Tool } from '../../../src/types';

describe('Planning Prompts', () => {
  const mockTools: Tool[] = [
    {
      name: 'file_read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
    },
    {
      name: 'file_write',
      description: 'Write a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content' },
        },
        required: ['path', 'content'],
      },
    },
  ];

  const baseVars: PlanningPromptVars = {
    taskDescription: 'Read a file and write a summary',
    tools: mockTools,
  };

  describe('buildPlanningSystemPrompt', () => {
    it('should build prompt with default system prefix', () => {
      const prompt = buildPlanningSystemPrompt(baseVars);

      expect(prompt).toContain('任务规划专家');
      expect(prompt).toContain('file_read');
      expect(prompt).toContain('file_write');
    });

    it('should build prompt with custom system prefix', () => {
      const customPrefix = 'Custom planning prompt';
      const prompt = buildPlanningSystemPrompt({
        ...baseVars,
        systemPrefix: customPrefix,
      });

      expect(prompt.startsWith(customPrefix)).toBe(true);
    });

    it('should include constraints', () => {
      const prompt = buildPlanningSystemPrompt({
        ...baseVars,
        constraints: ['Must complete in 5 steps', 'Use only available tools'],
      });

      expect(prompt).toContain('=== 约束条件 ===');
      expect(prompt).toContain('Must complete in 5 steps');
      expect(prompt).toContain('Use only available tools');
    });

    it('should include examples', () => {
      const examples: TaskPlanExample[] = [
        {
          task: 'Read config',
          plan: JSON.stringify({
            summary: 'Read config file',
            steps: [{ id: 'step1', description: 'Read file' }],
          }),
        },
      ];

      const prompt = buildPlanningSystemPrompt({
        ...baseVars,
        examples,
      });

      expect(prompt).toContain('=== 示例 ===');
      expect(prompt).toContain('Read config');
    });

    it('should format tools for planning', () => {
      const prompt = buildPlanningSystemPrompt(baseVars);

      expect(prompt).toContain('- file_read: Read a file');
      expect(prompt).toContain('参数: path');
    });

    it('should handle empty tools', () => {
      const prompt = buildPlanningSystemPrompt({
        ...baseVars,
        tools: [],
      });

      expect(prompt).not.toContain('=== 可用工具 ===');
    });
  });

  describe('buildPlanningMessages', () => {
    it('should build messages with system and user prompts', () => {
      const messages = buildPlanningMessages(baseVars);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain(baseVars.taskDescription);
    });
  });

  describe('parseTaskPlan', () => {
    it('should parse valid JSON plan', () => {
      const response = JSON.stringify({
        summary: 'Test plan',
        estimatedComplexity: 'simple',
        steps: [
          { id: 'step1', description: 'Read file', tool: 'file_read' },
          { id: 'step2', description: 'Write summary', tool: 'file_write', dependencies: ['step1'] },
        ],
      });

      const plan = parseTaskPlan(response);

      expect(plan.summary).toBe('Test plan');
      expect(plan.estimatedComplexity).toBe('simple');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].id).toBe('step1');
      expect(plan.steps[1].dependencies).toContain('step1');
    });

    it('should handle JSON wrapped in text', () => {
      const response = `Here is the plan:

{\n  "summary": "Wrapped plan",\n  "steps": [{"id": "s1", "description": "Do something"}]\n}

This plan should work.`;

      const plan = parseTaskPlan(response);

      expect(plan.summary).toBe('Wrapped plan');
      expect(plan.steps).toHaveLength(1);
    });

    it('should handle invalid JSON gracefully', () => {
      const response = 'This is not valid JSON';

      const plan = parseTaskPlan(response);

      expect(plan.summary).toBe('未能解析计划');
      expect(plan.steps).toHaveLength(1);
    });

    it('should use defaults for missing fields', () => {
      const response = JSON.stringify({
        steps: [{ description: 'Test step' }],
      });

      const plan = parseTaskPlan(response);

      expect(plan.summary).toBe('未提供摘要');
      expect(plan.estimatedComplexity).toBe('medium');
      expect(plan.steps[0].id).toBe('step1');
    });
  });

  describe('validateTaskPlan', () => {
    it('should validate correct plan', () => {
      const plan: TaskPlan = {
        summary: 'Valid plan',
        estimatedComplexity: 'simple',
        steps: [
          { id: 'step1', description: 'First' },
          { id: 'step2', description: 'Second', dependencies: ['step1'] },
        ],
      };

      const result = validateTaskPlan(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty steps', () => {
      const plan: TaskPlan = {
        summary: 'Empty plan',
        estimatedComplexity: 'simple',
        steps: [],
      };

      const result = validateTaskPlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('计划必须包含至少一个步骤');
    });

    it('should detect duplicate step IDs', () => {
      const plan: TaskPlan = {
        summary: 'Duplicate IDs',
        estimatedComplexity: 'simple',
        steps: [
          { id: 'step1', description: 'First' },
          { id: 'step1', description: 'Second' },
        ],
      };

      const result = validateTaskPlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('重复的步骤 ID: step1');
    });

    it('should detect missing dependencies', () => {
      const plan: TaskPlan = {
        summary: 'Missing dep',
        estimatedComplexity: 'simple',
        steps: [
          { id: 'step1', description: 'First', dependencies: ['nonexistent'] },
        ],
      };

      const result = validateTaskPlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('步骤 step1 依赖不存在的步骤: nonexistent');
    });

    it('should detect self-dependency', () => {
      const plan: TaskPlan = {
        summary: 'Self dep',
        estimatedComplexity: 'simple',
        steps: [
          { id: 'step1', description: 'First', dependencies: ['step1'] },
        ],
      };

      const result = validateTaskPlan(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('步骤 step1 不能依赖自己');
    });
  });

  describe('formatTaskPlan', () => {
    it('should format plan as text', () => {
      const plan: TaskPlan = {
        summary: 'Test plan',
        estimatedComplexity: 'medium',
        steps: [
          { id: 'step1', description: 'Read file', tool: 'file_read', expectedOutput: 'File content' },
          { id: 'step2', description: 'Process', dependencies: ['step1'] },
        ],
      };

      const text = formatTaskPlan(plan);

      expect(text).toContain('Test plan');
      expect(text).toContain('medium');
      expect(text).toContain('[step1] Read file');
      expect(text).toContain('工具: file_read');
      expect(text).toContain('预期输出: File content');
      expect(text).toContain('依赖: step1');
    });
  });

  describe('getNextStep', () => {
    const plan: TaskPlan = {
      summary: 'Test',
      estimatedComplexity: 'simple',
      steps: [
        { id: 'step1', description: 'First' },
        { id: 'step2', description: 'Second', dependencies: ['step1'] },
        { id: 'step3', description: 'Third', dependencies: ['step1'] },
        { id: 'step4', description: 'Fourth', dependencies: ['step2', 'step3'] },
      ],
    };

    it('should return first step when nothing completed', () => {
      const next = getNextStep(plan, []);

      expect(next?.id).toBe('step1');
    });

    it('should return next available step', () => {
      const next = getNextStep(plan, ['step1']);

      // step2 and step3 are both available, return first one
      expect(['step2', 'step3']).toContain(next?.id);
    });

    it('should return step with multiple dependencies', () => {
      const next = getNextStep(plan, ['step1', 'step2', 'step3']);

      expect(next?.id).toBe('step4');
    });

    it('should return undefined when all completed', () => {
      const next = getNextStep(plan, ['step1', 'step2', 'step3', 'step4']);

      expect(next).toBeUndefined();
    });

    it('should skip completed steps', () => {
      const next = getNextStep(plan, ['step1', 'step2']);

      // step3 should be returned, step4 is not ready (needs step3)
      expect(next?.id).toBe('step3');
    });
  });
});
