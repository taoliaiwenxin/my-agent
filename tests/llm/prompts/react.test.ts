/**
 * @file react.test.ts
 * @description ReAct Prompt 模板测试
 * @module llm/prompts
 * @author AI Agent
 * @date 2026-04-17
 */

import {
  buildReActSystemPrompt,
  buildReActMessages,
  parseReActResponse,
  createObservationMessage,
  createToolResultMessage,
  createReflectionMessage,
  ReActPromptVars,
} from '../../../src/llm/prompts/react';
import { Tool } from '../../../src/types';

describe('ReAct Prompts', () => {
  const mockTools: Tool[] = [
    {
      name: 'file_read',
      description: 'Read a file from the filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          encoding: { type: 'string', description: 'File encoding' },
        },
        required: ['path'],
      },
    },
    {
      name: 'file_write',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  ];

  const baseVars: ReActPromptVars = {
    taskDescription: 'Read a config file and analyze it',
    tools: mockTools,
  };

  describe('buildReActSystemPrompt', () => {
    it('should build prompt with default system prefix', () => {
      const prompt = buildReActSystemPrompt(baseVars);

      expect(prompt).toContain('你是一个智能助手');
      expect(prompt).toContain(baseVars.taskDescription);
      expect(prompt).toContain('file_read');
      expect(prompt).toContain('file_write');
    });

    it('should build prompt with custom system prefix', () => {
      const customPrefix = 'Custom system prompt';
      const prompt = buildReActSystemPrompt({
        ...baseVars,
        systemPrefix: customPrefix,
      });

      expect(prompt.startsWith(customPrefix)).toBe(true);
    });

    it('should include max steps limit', () => {
      const prompt = buildReActSystemPrompt({
        ...baseVars,
        maxSteps: 10,
      });

      expect(prompt).toContain('最大步骤数: 10');
    });

    it('should include context if provided', () => {
      const context = 'This is additional context';
      const prompt = buildReActSystemPrompt({
        ...baseVars,
        context,
      });

      expect(prompt).toContain(context);
    });

    it('should format tool descriptions correctly', () => {
      const prompt = buildReActSystemPrompt(baseVars);

      expect(prompt).toContain('工具: file_read');
      expect(prompt).toContain('描述: Read a file from the filesystem');
      expect(prompt).toContain('path: string (必需)');
    });

    it('should handle empty tools array', () => {
      const prompt = buildReActSystemPrompt({
        ...baseVars,
        tools: [],
      });

      expect(prompt).not.toContain('=== 可用工具 ===');
    });
  });

  describe('buildReActMessages', () => {
    it('should build messages with system prompt', () => {
      const messages = buildReActMessages(baseVars);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('你是一个智能助手');
    });

    it('should include working memory', () => {
      const workingMemory = [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous response' },
      ];

      const messages = buildReActMessages({
        ...baseVars,
        workingMemory,
      });

      expect(messages).toHaveLength(3);
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
    });
  });

  describe('parseReActResponse', () => {
    it('should parse complete response', () => {
      const response = `THOUGHT: I need to read the file first
ACTION: file_read
PARAMETERS: {"path": "./config.txt"}`;

      const parsed = parseReActResponse(response);

      expect(parsed.thought).toBe('I need to read the file first');
      expect(parsed.action).toBe('file_read');
      expect(parsed.parameters).toEqual({ path: './config.txt' });
      expect(parsed.isComplete).toBe(false);
    });

    it('should parse terminate response', () => {
      const response = `THOUGHT: Task completed successfully
ACTION: terminate
RESULT: File has been analyzed. Config contains valid settings.`;

      const parsed = parseReActResponse(response);

      expect(parsed.thought).toBe('Task completed successfully');
      expect(parsed.action).toBe('terminate');
      expect(parsed.result).toBe('File has been analyzed. Config contains valid settings.');
      expect(parsed.isComplete).toBe(true);
    });

    it('should handle response without parameters', () => {
      const response = `THOUGHT: Let me think about this
ACTION: think`;

      const parsed = parseReActResponse(response);

      expect(parsed.thought).toBe('Let me think about this');
      expect(parsed.action).toBe('think');
      expect(parsed.parameters).toBeUndefined();
    });

    it('should handle invalid JSON in parameters', () => {
      const response = `THOUGHT: Test
ACTION: test
PARAMETERS: invalid json`;

      const parsed = parseReActResponse(response);

      expect(parsed.parameters).toEqual({ raw: 'invalid json' });
    });

    it('should handle empty response', () => {
      const parsed = parseReActResponse('');

      expect(parsed.thought).toBe('');
      expect(parsed.action).toBe('');
      expect(parsed.isComplete).toBe(false);
    });
  });

  describe('createObservationMessage', () => {
    it('should create observation message', () => {
      const message = createObservationMessage('File content: hello');

      expect(message.role).toBe('user');
      expect(message.content).toBe('OBSERVATION: File content: hello');
    });
  });

  describe('createToolResultMessage', () => {
    it('should create success message', () => {
      const message = createToolResultMessage('file_read', 'File content', true);

      expect(message.role).toBe('user');
      expect(message.content).toContain('file_read');
      expect(message.content).toContain('成功');
      expect(message.content).toContain('File content');
    });

    it('should create failure message', () => {
      const message = createToolResultMessage('file_read', 'File not found', false);

      expect(message.role).toBe('user');
      expect(message.content).toContain('file_read');
      expect(message.content).toContain('失败');
      expect(message.content).toContain('File not found');
    });
  });

  describe('createReflectionMessage', () => {
    it('should create reflection message', () => {
      const message = createReflectionMessage('The approach worked well');

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('REFLECTION: The approach worked well');
    });
  });
});
