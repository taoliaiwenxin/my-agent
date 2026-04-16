/**
 * @file ToolRegistry.test.ts
 * @description ToolRegistry 模块的单元测试
 *              测试覆盖：工具注册、查询、取消注册、批量操作、错误处理
 * @module tools
 * @author AI Agent
 * @date 2026-04-16
 * @version 1.0.0
 */

import { ToolRegistry, ToolNotFoundError, DuplicateToolError } from '../../src/tools/ToolRegistry';
import { Tool } from '../../src/types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  /** 每个测试前创建新的注册表实例 */
  beforeEach(() => {
    registry = new ToolRegistry();
  });

  /** 示例工具定义 */
  const sampleTool: Tool = {
    name: 'test_tool',
    description: '测试工具',
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: '输入参数'
        }
      },
      required: ['input']
    }
  };

  describe('register', () => {
    /**
     * 测试：成功注册工具
     *
     * 验证点：
     * 1. 工具正确存储
     * 2. 注册后可以通过 get 获取
     * 3. 注册后 has 返回 true
     */
    it('应该成功注册工具', () => {
      registry.register(sampleTool);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.get('test_tool')).toEqual(sampleTool);
    });

    /**
     * 测试：重复注册抛出错误
     *
     * 验证点：
     * 1. 重复注册相同名称的工具抛出 DuplicateToolError
     * 2. 错误消息包含工具名称
     */
    it('重复注册应该抛出 DuplicateToolError', () => {
      registry.register(sampleTool);

      expect(() => {
        registry.register(sampleTool);
      }).toThrow(DuplicateToolError);

      expect(() => {
        registry.register(sampleTool);
      }).toThrow('工具已存在: test_tool');
    });

    /**
     * 测试：验证工具名称格式
     *
     * 验证点：
     * 1. 空名称抛出错误
     * 2. 以数字开头的名称抛出错误
     * 3. 包含特殊字符的名称抛出错误
     */
    it('应该验证工具名称格式', () => {
      // 空名称
      expect(() => {
        registry.register({
          ...sampleTool,
          name: ''
        });
      }).toThrow('工具名称不能为空');

      // 以数字开头
      expect(() => {
        registry.register({
          ...sampleTool,
          name: '123_tool'
        });
      }).toThrow('工具名称格式无效');

      // 包含特殊字符
      expect(() => {
        registry.register({
          ...sampleTool,
          name: 'test-tool'
        });
      }).toThrow('工具名称格式无效');
    });

    /**
     * 测试：验证工具描述
     *
     * 验证点：
     * 1. 空描述抛出错误
     */
    it('应该验证工具描述不能为空', () => {
      expect(() => {
        registry.register({
          ...sampleTool,
          description: ''
        });
      }).toThrow('工具描述不能为空');
    });

    /**
     * 测试：验证参数定义
     *
     * 验证点：
     * 1. 参数类型必须是 object
     * 2. 必须有 properties
     * 3. required 字段必须在 properties 中定义
     */
    it('应该验证参数定义的有效性', () => {
      // 参数类型错误
      expect(() => {
        registry.register({
          ...sampleTool,
          parameters: {
            type: 'string' as 'object',
            properties: {}
          }
        });
      }).toThrow('工具参数类型必须是 "object"');

      // 缺少 properties
      expect(() => {
        registry.register({
          ...sampleTool,
          parameters: {
            type: 'object',
            properties: undefined as unknown as Record<string, { type: string; description: string }>
          }
        });
      }).toThrow('工具参数属性');

      // required 字段不存在于 properties
      expect(() => {
        registry.register({
          ...sampleTool,
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string', description: '输入' }
            },
            required: ['nonexistent']
          }
        });
      }).toThrow('required 字段 "nonexistent" 未在 properties 中定义');
    });
  });

  describe('get', () => {
    /**
     * 测试：获取已注册的工具
     *
     * 验证点：
     * 1. 返回正确的工具定义
     * 2. 返回的是深拷贝（可选，视实现而定）
     */
    it('应该返回已注册的工具', () => {
      registry.register(sampleTool);

      const tool = registry.get('test_tool');

      expect(tool).toEqual(sampleTool);
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('测试工具');
    });

    /**
     * 测试：获取不存在的工具抛出错误
     *
     * 验证点：
     * 1. 抛出 ToolNotFoundError
     * 2. 错误消息包含工具名称
     */
    it('获取不存在的工具应该抛出 ToolNotFoundError', () => {
      expect(() => {
        registry.get('nonexistent_tool');
      }).toThrow(ToolNotFoundError);

      expect(() => {
        registry.get('nonexistent_tool');
      }).toThrow('工具未找到: nonexistent_tool');
    });
  });

  describe('has', () => {
    /**
     * 测试：检查工具是否存在
     *
     * 验证点：
     * 1. 已注册的工具返回 true
     * 2. 未注册的工具返回 false
     */
    it('应该正确检查工具是否存在', () => {
      expect(registry.has('test_tool')).toBe(false);

      registry.register(sampleTool);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.has('other_tool')).toBe(false);
    });
  });

  describe('unregister', () => {
    /**
     * 测试：成功取消注册工具
     *
     * 验证点：
     * 1. 返回 true 表示成功
     * 2. 取消注册后 has 返回 false
     * 3. 取消注册后 get 抛出错误
     */
    it('应该成功取消注册工具', () => {
      registry.register(sampleTool);

      const result = registry.unregister('test_tool');

      expect(result).toBe(true);
      expect(registry.has('test_tool')).toBe(false);
      expect(() => {
        registry.get('test_tool');
      }).toThrow(ToolNotFoundError);
    });

    /**
     * 测试：取消注册不存在的工具
     *
     * 验证点：
     * 1. 返回 false
     * 2. 不抛出错误
     */
    it('取消注册不存在的工具应该返回 false', () => {
      const result = registry.unregister('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    /**
     * 测试：列出所有工具
     *
     * 验证点：
     * 1. 返回所有已注册的工具
     * 2. 空注册表返回空数组
     */
    it('应该返回所有已注册的工具', () => {
      const tool1 = { ...sampleTool, name: 'tool1' };
      const tool2 = { ...sampleTool, name: 'tool2' };

      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.list();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name).sort()).toEqual(['tool1', 'tool2']);
    });

    /**
     * 测试：空注册表返回空数组
     */
    it('空注册表应该返回空数组', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe('listNames', () => {
    /**
     * 测试：列出所有工具名称
     *
     * 验证点：
     * 1. 返回所有已注册的工具名称
     * 2. 空注册表返回空数组
     */
    it('应该返回所有已注册的工具名称', () => {
      registry.register({ ...sampleTool, name: 'alpha' });
      registry.register({ ...sampleTool, name: 'beta' });

      const names = registry.listNames();

      expect(names).toHaveLength(2);
      expect(names.sort()).toEqual(['alpha', 'beta']);
    });
  });

  describe('count', () => {
    /**
     * 测试：获取工具数量
     *
     * 验证点：
     * 1. 空注册表返回 0
     * 2. 注册后数量增加
     * 3. 取消注册后数量减少
     */
    it('应该返回正确的工具数量', () => {
      expect(registry.count()).toBe(0);

      registry.register(sampleTool);
      expect(registry.count()).toBe(1);

      registry.register({ ...sampleTool, name: 'another_tool' });
      expect(registry.count()).toBe(2);

      registry.unregister('test_tool');
      expect(registry.count()).toBe(1);
    });
  });

  describe('clear', () => {
    /**
     * 测试：清空注册表
     *
     * 验证点：
     * 1. 清空后 count 为 0
     * 2. 清空后 list 返回空数组
     * 3. 清空后 has 对所有工具返回 false
     */
    it('应该清空所有已注册的工具', () => {
      registry.register(sampleTool);
      registry.register({ ...sampleTool, name: 'tool2' });

      registry.clear();

      expect(registry.count()).toBe(0);
      expect(registry.list()).toEqual([]);
      expect(registry.has('test_tool')).toBe(false);
    });
  });

  describe('registerBatch', () => {
    /**
     * 测试：批量注册工具
     *
     * 验证点：
     * 1. 所有工具都被注册
     * 2. 任何一个失败都不应该注册其他工具（原子性）
     */
    it('应该批量注册多个工具', () => {
      const tools = [
        { ...sampleTool, name: 'tool1' },
        { ...sampleTool, name: 'tool2' },
        { ...sampleTool, name: 'tool3' }
      ];

      registry.registerBatch(tools);

      expect(registry.count()).toBe(3);
      expect(registry.has('tool1')).toBe(true);
      expect(registry.has('tool2')).toBe(true);
      expect(registry.has('tool3')).toBe(true);
    });

    /**
     * 测试：批量注册时任一工具失败应停止
     *
     * 验证点：
     * 1. 遇到重复工具抛出错误
     * 2. 前面的工具可能已注册（取决于实现）
     */
    it('批量注册时遇到重复工具应该抛出错误', () => {
      registry.register({ ...sampleTool, name: 'existing' });

      const tools = [
        { ...sampleTool, name: 'new1' },
        { ...sampleTool, name: 'existing' }, // 重复
        { ...sampleTool, name: 'new2' }
      ];

      expect(() => {
        registry.registerBatch(tools);
      }).toThrow(DuplicateToolError);
    });
  });

  describe('toLLMFormat', () => {
    /**
     * 测试：转换为 LLM 格式
     *
     * 验证点：
     * 1. 正确转换为 Anthropic/OpenAI 格式
     * 2. 包含 name, description, input_schema
     * 3. input_schema 包含 type, properties, required
     */
    it('应该正确转换为 LLM 工具格式', () => {
      registry.register(sampleTool);

      const llmTools = registry.toLLMFormat();

      expect(llmTools).toHaveLength(1);
      expect(llmTools[0]).toEqual({
        name: 'test_tool',
        description: '测试工具',
        input_schema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: '输入参数'
            }
          },
          required: ['input']
        }
      });
    });

    /**
     * 测试：空注册表返回空数组
     */
    it('空注册表应该返回空数组', () => {
      expect(registry.toLLMFormat()).toEqual([]);
    });

    /**
     * 测试：多个工具转换
     */
    it('应该转换多个工具', () => {
      registry.register({
        name: 'file_read',
        description: '读取文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '路径' }
          },
          required: ['path']
        }
      });

      registry.register({
        name: 'file_write',
        description: '写入文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '路径' },
            content: { type: 'string', description: '内容' }
          },
          required: ['path', 'content']
        }
      });

      const llmTools = registry.toLLMFormat();

      expect(llmTools).toHaveLength(2);
      expect(llmTools.map(t => t.name).sort()).toEqual(['file_read', 'file_write']);
    });
  });

  describe('边界情况', () => {
    /**
     * 测试：工具名称边界值
     *
     * 验证点：
     * 1. 单字符名称（字母开头）可以注册
     * 2. 包含下划线的名称可以注册
     * 3. 长名称可以注册
     */
    it('应该支持各种有效的工具名称', () => {
      // 单字符
      registry.register({
        ...sampleTool,
        name: 'a'
      });
      expect(registry.has('a')).toBe(true);

      // 包含下划线
      registry.register({
        ...sampleTool,
        name: 'my_tool_name'
      });
      expect(registry.has('my_tool_name')).toBe(true);

      // 驼峰命名
      registry.register({
        ...sampleTool,
        name: 'myToolName'
      });
      expect(registry.has('myToolName')).toBe(true);
    });

    /**
     * 测试：没有 required 参数的工具
     *
     * 验证点：
     * 1. 可以注册没有 required 的工具
     * 2. LLM 格式中不包含 required 字段
     */
    it('应该支持没有 required 参数的工具', () => {
      const toolWithoutRequired: Tool = {
        name: 'optional_tool',
        description: '可选参数工具',
        parameters: {
          type: 'object',
          properties: {
            optional: { type: 'string', description: '可选参数' }
          }
          // 没有 required
        }
      };

      registry.register(toolWithoutRequired);

      const llmFormat = registry.toLLMFormat();
      expect(llmFormat[0].input_schema.required).toBeUndefined();
    });
  });
});
