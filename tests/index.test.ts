/**
 * @file index.test.ts
 * @description 主入口测试
 * @module tests
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 */

import { healthCheck, VERSION } from '../src/index';

describe('Index', () => {
  it('应该有正确的版本号', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('健康检查应该返回正常状态', () => {
    const result = healthCheck();
    expect(result.status).toBe('ok');
    expect(result.version).toBe(VERSION);
  });
});
