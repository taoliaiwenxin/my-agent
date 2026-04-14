/**
 * @file ConfigLoader.test.ts
 * @description ConfigLoader 单元测试
 * @module tests/config
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader, getConfig, setConfig } from '../../src/config/ConfigLoader';

describe('ConfigLoader', () => {
  /** 测试配置文件路径 */
  const testConfigPath = path.join(__dirname, 'test-config.yaml');

  /** 每个测试前重置实例 */
  beforeEach(() => {
    ConfigLoader.resetInstance();
    // 清理测试配置文件
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  /** 每个测试后清理 */
  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  /**
   * 测试：单例模式
   * 验证多次获取实例返回的是同一个对象
   */
  it('应该返回单例实例', () => {
    const instance1 = ConfigLoader.getInstance();
    const instance2 = ConfigLoader.getInstance();
    expect(instance1).toBe(instance2);
  });

  /**
   * 测试：从配置文件加载
   * 验证配置能正确从 YAML 文件加载
   */
  it('应该能从配置文件加载配置', () => {
    // 创建测试配置文件
    const testConfig = `
app:
  name: TestApp
  version: 1.0.0
database:
  path: ./test.db
`;
    fs.writeFileSync(testConfigPath, testConfig);

    const config = ConfigLoader.getInstance(testConfigPath);
    expect(config.get('app.name')).toBe('TestApp');
    expect(config.get('app.version')).toBe('1.0.0');
    expect(config.get('database.path')).toBe('./test.db');
  });

  /**
   * 测试：默认值
   * 验证当配置不存在时返回默认值
   */
  it('当配置不存在时应该返回默认值', () => {
    fs.writeFileSync(testConfigPath, 'key: value');
    const config = ConfigLoader.getInstance(testConfigPath);

    expect(config.get('nonexistent', 'default')).toBe('default');
    expect(config.get('nonexistent.nested', 42)).toBe(42);
  });

  /**
   * 测试：嵌套配置获取
   * 验证点号分隔的路径能正确访问嵌套配置
   */
  it('应该支持嵌套配置获取', () => {
    const testConfig = `
nested:
  level1:
    level2:
      value: deepValue
`;
    fs.writeFileSync(testConfigPath, testConfig);
    const config = ConfigLoader.getInstance(testConfigPath);

    expect(config.get('nested.level1.level2.value')).toBe('deepValue');
  });

  /**
   * 测试：设置配置值
   * 验证能正确设置配置值
   */
  it('应该能设置配置值', () => {
    fs.writeFileSync(testConfigPath, 'key: value');
    const config = ConfigLoader.getInstance(testConfigPath);

    config.set('newKey', 'newValue');
    expect(config.get('newKey')).toBe('newValue');

    config.set('nested.key', 'nestedValue');
    expect(config.get('nested.key')).toBe('nestedValue');
  });

  /**
   * 测试：has 方法
   * 验证能正确检查配置键是否存在
   */
  it('has 方法应该正确检测配置键', () => {
    const testConfig = `
existing:
  key: value
`;
    fs.writeFileSync(testConfigPath, testConfig);
    const config = ConfigLoader.getInstance(testConfigPath);

    expect(config.has('existing.key')).toBe(true);
    expect(config.has('nonexistent.key')).toBe(false);
  });

  /**
   * 测试：获取所有配置
   * 验证 getAll 返回完整的配置对象
   */
  it('getAll 应该返回完整配置对象', () => {
    const testConfig = `
app:
  name: TestApp
`;
    fs.writeFileSync(testConfigPath, testConfig);
    const config = ConfigLoader.getInstance(testConfigPath);

    const all = config.getAll();
    expect(all).toHaveProperty('app');
    expect(all.app).toHaveProperty('name', 'TestApp');
  });

  /**
   * 测试：环境变量替换
   * 验证 ${ENV_VAR} 语法能正确替换为环境变量值
   */
  it('应该正确替换环境变量', () => {
    process.env.TEST_API_KEY = 'test-key-123';

    const testConfig = `
api:
  key: \${TEST_API_KEY}
`;
    fs.writeFileSync(testConfigPath, testConfig);
    const config = ConfigLoader.getInstance(testConfigPath);

    expect(config.get('api.key')).toBe('test-key-123');

    // 清理环境变量
    delete process.env.TEST_API_KEY;
  });

  /**
   * 测试：数组配置
   * 验证能正确处理数组类型的配置
   */
  it('应该支持数组配置', () => {
    const testConfig = `
items:
  - item1
  - item2
  - item3
`;
    fs.writeFileSync(testConfigPath, testConfig);
    const config = ConfigLoader.getInstance(testConfigPath);

    const items = config.get<string[]>('items', []);
    expect(items).toEqual(['item1', 'item2', 'item3']);
  });

  /**
   * 测试：便捷函数 getConfig
   * 验证便捷函数能正确工作
   */
  it('便捷函数 getConfig 应该工作', () => {
    fs.writeFileSync(testConfigPath, 'key: value');
    ConfigLoader.getInstance(testConfigPath);

    expect(getConfig('key')).toBe('value');
    expect(getConfig('nonexistent', 'default')).toBe('default');
  });

  /**
   * 测试：便捷函数 setConfig
   * 验证便捷函数能正确设置配置
   */
  it('便捷函数 setConfig 应该工作', () => {
    fs.writeFileSync(testConfigPath, 'key: value');
    ConfigLoader.getInstance(testConfigPath);

    setConfig('newKey', 'newValue');
    expect(getConfig('newKey')).toBe('newValue');
  });
});
