/**
 * @file index.ts
 * @description Core 模块导出文件
 *              统一导出 ReAct 循环相关的所有组件
 * @module core
 */

export { ReActLoop, createReActLoop } from './ReActLoop';
export type {
  ReActLoopConfig,
  ReActLoopResult,
  ReActLoopEvent,
} from './ReActLoop';

export {
  ThoughtParser,
  ThoughtParseError,
  createThoughtParser,
} from './ThoughtParser';
export type { ParsedThought, ParseOptions } from './ThoughtParser';

export {
  ObservationGenerator,
  createObservationGenerator,
} from './ObservationGenerator';
export type { ObservationOptions } from './ObservationGenerator';

export { StateManager, createStateManager } from './StateManager';
export type {
  AgentState,
  StateChangeEvent,
  StateSnapshot,
  SessionExecutionState,
} from './StateManager';

export { Agent, createAgent } from './Agent';
export type { AgentOptions, TaskResult, AgentEvent } from './Agent';
