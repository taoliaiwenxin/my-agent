/**
 * @file index.ts
 * @description AI Agent Core 主入口文件
 *              导出所有核心模块供外部使用
 * @module core
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 */

export const VERSION = '1.0.0';

/** 简单的健康检查函数 */
export function healthCheck(): { status: string; version: string } {
  return {
    status: 'ok',
    version: VERSION,
  };
}

// ==================== 类型导出 ====================
export * from './types';

// ==================== 配置模块 ====================
export { ConfigLoader } from './config/ConfigLoader';

// ==================== 记忆模块 ====================
export { SQLiteClient, createSQLiteClient } from './memory/SQLiteClient';
export { Sessions } from './memory/Sessions';
export { Steps } from './memory/Steps';
export { WorkingMemory } from './memory/WorkingMemory';
export { MemorySystem } from './memory/MemorySystem';

// 启动时打印信息
console.log(`AI Agent Core v${VERSION} loaded`);
