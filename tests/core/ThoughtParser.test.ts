/**
 * @file ThoughtParser.test.ts
 * @description ThoughtParser 单元测试
 */

import {
  ThoughtParser,
  ThoughtParseError,
  createThoughtParser,
} from '../../src/core/ThoughtParser';

describe('ThoughtParser', () => {
  let parser: ThoughtParser;

  beforeEach(() => {
    parser = new ThoughtParser();
  });

  describe('基本功能', () => {
    it('应该创建实例', () => {
      expect(parser).toBeInstanceOf(ThoughtParser);
    });

    it('应该通过便捷函数创建', () => {
      const p = createThoughtParser();
      expect(p).toBeInstanceOf(ThoughtParser);
    });
  });

  describe('ReAct 格式解析', () => {
    it('应该解析标准 ReAct 格式', () => {
      const response = `
THOUGHT: 我需要读取配置文件
ACTION: file_read
PARAMETERS: {"path": "./config.yaml"}
EXPECTED: 获取配置文件内容
      `;

      const result = parser.parse(response);

      expect(result.thought).toBe('我需要读取配置文件');
      expect(result.action).toBe('file_read');
      expect(result.parameters).toEqual({ path: './config.yaml' });
      expect(result.expectedOutcome).toBe('获取配置文件内容');
      expect(result.isComplete).toBe(false);
    });

    it('应该解析终止动作', () => {
      const response = `
THOUGHT: 任务已完成
ACTION: terminate
RESULT: 成功分析代码库
      `;

      const result = parser.parse(response);

      expect(result.action).toBe('terminate');
      expect(result.isComplete).toBe(true);
      expect(result.result).toBe('成功分析代码库');
    });

    it('应该处理多行思考', () => {
      const response = `
THOUGHT: 我需要先检查文件是否存在
然后读取它的内容
ACTION: file_read
PARAMETERS: {"path": "./test.txt"}
      `;

      const result = parser.parse(response);

      expect(result.thought).toContain('检查文件是否存在');
      expect(result.thought).toContain('然后读取它的内容');
      expect(result.action).toBe('file_read');
    });

    it('应该处理空参数', () => {
      const response = `
THOUGHT: 列出当前目录
ACTION: shell
PARAMETERS: {}
      `;

      const result = parser.parse(response);

      expect(result.parameters).toEqual({});
    });

    it('应该处理无效 JSON 参数', () => {
      const response = `
THOUGHT: 测试
ACTION: test
PARAMETERS: not valid json
      `;

      const result = parser.parse(response);

      expect(result.parameters).toEqual({ raw: 'not valid json' });
    });
  });

  describe('JSON 格式解析', () => {
    it('应该解析 JSON 格式', () => {
      const response = `
{
  "thought": "我需要读取文件",
  "action": "file_read",
  "parameters": {"path": "./test.txt"}
}
      `;

      const result = parser.parse(response);

      expect(result.thought).toBe('我需要读取文件');
      expect(result.action).toBe('file_read');
      expect(result.parameters).toEqual({ path: './test.txt' });
    });

    it('应该解析 reasoning 字段', () => {
      const response = JSON.stringify({
        reasoning: '使用 reasoning 代替 thought',
        action: 'shell',
        params: { command: 'ls' },
      });

      const result = parser.parse(response);

      expect(result.thought).toBe('使用 reasoning 代替 thought');
      expect(result.action).toBe('shell');
      expect(result.parameters).toEqual({ command: 'ls' });
    });

    it('应该解析 tool/arguments 字段', () => {
      const response = JSON.stringify({
        thought: '使用替代字段名',
        tool: 'file_write',
        arguments: { path: './out.txt', content: 'data' },
      });

      const result = parser.parse(response);

      expect(result.action).toBe('file_write');
      expect(result.parameters).toEqual({ path: './out.txt', content: 'data' });
    });
  });

  describe('工具调用格式解析', () => {
    it('应该解析 tool_calls 格式', () => {
      const response = JSON.stringify({
        content: '我需要读取文件',
        tool_calls: [
          {
            id: 'call_1',
            name: 'file_read',
            arguments: { path: './test.txt' },
          },
        ],
      });

      const result = parser.parse(response);

      expect(result.thought).toBe('我需要读取文件');
      expect(result.action).toBe('file_read');
      expect(result.parameters).toEqual({ path: './test.txt' });
    });

    it('应该解析 toolCalls 格式', () => {
      const response = JSON.stringify({
        content: '',
        toolCalls: [
          {
            id: 'call_2',
            name: 'terminate',
            arguments: { status: 'success' },
          },
        ],
      });

      const result = parser.parse(response);

      expect(result.action).toBe('terminate');
      expect(result.isComplete).toBe(true);
    });
  });

  describe('宽松模式解析', () => {
    it('应该将无格式响应作为思考返回', () => {
      const response = '这是一个普通文本响应，没有特定格式';

      const result = parser.parse(response);

      expect(result.thought).toBe(response);
      expect(result.action).toBe('');
      expect(result.isComplete).toBe(false);
    });

    it('应该处理空响应', () => {
      const result = parser.parse('');

      expect(result.thought).toBe('');
      expect(result.action).toBe('');
    });
  });

  describe('严格模式', () => {
    it('应该在严格模式下抛出错误', () => {
      const response = '没有格式的普通文本';

      expect(() => {
        parser.parse(response, { strictMode: true });
      }).toThrow(ThoughtParseError);
    });

    it('应该在严格模式下接受有效响应', () => {
      const response = `
THOUGHT: 有效思考
ACTION: test
      `;

      expect(() => {
        parser.parse(response, { strictMode: true });
      }).not.toThrow();
    });
  });

  describe('toAgentAction', () => {
    it('应该转换为 AgentAction', () => {
      const parsed = {
        thought: '思考内容',
        action: 'file_read',
        parameters: { path: './test.txt' },
        isComplete: false,
        expectedOutcome: '读取文件内容',
      };

      const action = parser.toAgentAction(parsed);

      expect(action.thought).toBe('思考内容');
      expect(action.toolName).toBe('file_read');
      expect(action.parameters).toEqual({ path: './test.txt' });
      expect(action.expectedOutcome).toBe('读取文件内容');
    });
  });

  describe('isTerminateAction', () => {
    it('应该识别终止动作', () => {
      const parsed = {
        thought: '完成',
        action: 'terminate',
        parameters: {},
        isComplete: true,
      };

      expect(parser.isTerminateAction(parsed)).toBe(true);
    });

    it('应该识别非终止动作', () => {
      const parsed = {
        thought: '继续',
        action: 'file_read',
        parameters: {},
        isComplete: false,
      };

      expect(parser.isTerminateAction(parsed)).toBe(false);
    });
  });

  describe('extractReasoning', () => {
    it('应该提取思考过程', () => {
      const parsed = {
        thought: '这是我的思考过程',
        action: 'test',
        parameters: {},
        isComplete: false,
      };

      expect(parser.extractReasoning(parsed)).toBe('这是我的思考过程');
    });
  });
});
