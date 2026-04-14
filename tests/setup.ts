/**
 * @file setup.ts
 * @description Jest 测试环境设置
 * @module tests
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// 全局测试超时
jest.setTimeout(30000);

// 测试完成后清理
afterAll(async () => {
  // 清理操作
});
