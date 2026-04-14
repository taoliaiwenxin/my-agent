/**
 * @file ConfigLoader.ts
 * @description 配置加载器，负责加载和管理应用程序配置。
 *              支持从 YAML 配置文件加载，并允许环境变量覆盖。
 *              使用分层配置：默认值 < 配置文件 < 环境变量
 * @module config
 * @author AI Agent
 * @date 2026-04-14
 * @version 1.0.0
 *
 * @example
 * // 基本使用
 * const config = ConfigLoader.getInstance();
 * const dbPath = config.get('database.path');
 *
 * @example
 * // 获取带默认值的配置
 * const timeout = config.get<number>('agent.timeoutMs', 300000);
 *
 * @see {@link default.yaml}
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { config as dotenvConfig } from 'dotenv';

/**
 * 配置加载器类
 *
 * 采用单例模式确保全局只有一个配置实例。
 * 配置优先级：环境变量 > 配置文件 > 默认值
 */
export class ConfigLoader {
  /** 单例实例 */
  private static instance: ConfigLoader | null = null;

  /** 配置数据存储 */
  private config: Record<string, unknown> = {};

  /** 配置文件路径 */
  private configPath: string;

  /**
   * 私有构造函数，防止直接实例化
   *
   * @param configPath - 配置文件路径，默认为 ./config/default.yaml
   */
  private constructor(configPath: string = './config/default.yaml') {
    this.configPath = path.resolve(configPath);
    this.load();
  }

  /**
   * 获取 ConfigLoader 单例实例
   *
   * @param configPath - 可选，配置文件路径（仅在首次调用时有效）
   * @returns ConfigLoader 实例
   *
   * @example
   * const config = ConfigLoader.getInstance();
   * const value = config.get('some.key');
   */
  public static getInstance(configPath?: string): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(configPath);
    }
    return ConfigLoader.instance;
  }

  /**
   * 重置单例实例（主要用于测试）
   *
   * 测试用例中需要在每个测试前重置配置状态
   */
  public static resetInstance(): void {
    ConfigLoader.instance = null;
  }

  /**
   * 加载配置
   *
   * 加载流程：
   * 1. 加载 .env 文件中的环境变量
   * 2. 解析配置文件中的环境变量占位符 ${VAR_NAME}
   * 3. 合并到配置对象
   */
  private load(): void {
    // 首先加载 .env 文件
    dotenvConfig();

    // 如果配置文件存在，加载它
    if (fs.existsSync(this.configPath)) {
      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      const parsedConfig = yaml.parse(fileContent);
      this.config = this.processEnvVariables(parsedConfig) as Record<string, unknown>;
    }
  }

  /**
   * 递归处理配置对象中的环境变量占位符
   *
   * 支持 ${ENV_VAR} 语法，如果环境变量不存在则替换为空字符串
   *
   * @param obj - 要处理的配置对象
   * @returns 处理后的配置对象
   *
   * @example
   * // 输入: { apiKey: '${ANTHROPIC_API_KEY}' }
   * // 输出: { apiKey: 'actual-api-key-from-env' }
   */
  private processEnvVariables(obj: unknown): unknown {
    if (typeof obj === 'string') {
      // 匹配 ${ENV_VAR} 格式的环境变量占位符
      return obj.replace(/\$\{([^}]+)\}/g, (_match, envVar) => {
        const value = process.env[envVar];
        if (value === undefined) {
          console.warn(`警告: 环境变量 ${envVar} 未设置`);
        }
        return value || '';
      });
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.processEnvVariables(item));
    }

    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processEnvVariables(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * 获取配置值
   *
   * 支持使用点号分隔的路径访问嵌套配置，如 'database.path'
   *
   * @param key - 配置键，支持点号分隔的路径
   * @param defaultValue - 可选，当配置不存在时返回的默认值
   * @returns 配置值，如果不存在则返回默认值
   *
   * @example
   * // 获取数据库路径
   * const dbPath = config.get<string>('database.path');
   *
   * @example
   * // 获取带默认值的配置
   * const timeout = config.get<number>('agent.timeoutMs', 300000);
   *
   * @example
   * // 获取嵌套配置
   * const rpm = config.get<number>('models.claude-sonnet.limits.rpm');
   */
  public get<T>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value: unknown = this.config;

    for (const k of keys) {
      if (value === null || typeof value !== 'object') {
        return defaultValue as T;
      }
      value = (value as Record<string, unknown>)[k];
    }

    return value !== undefined ? (value as T) : (defaultValue as T);
  }

  /**
   * 设置配置值
   *
   * 支持使用点号分隔的路径设置嵌套配置
   *
   * @param key - 配置键，支持点号分隔的路径
   * @param value - 要设置的值
   *
   * @example
   * // 设置单个值
   * config.set('agent.maxIterations', 100);
   *
   * @example
   * // 设置嵌套值
   * config.set('database.connection.timeout', 5000);
   */
  public set<T>(key: string, value: T): void {
    const keys = key.split('.');
    let current: Record<string, unknown> = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 检查配置键是否存在
   *
   * @param key - 配置键，支持点号分隔的路径
   * @returns true 如果配置键存在
   *
   * @example
   * if (config.has('database.path')) {
   *   console.log('数据库路径已配置');
   * }
   */
  public has(key: string): boolean {
    const keys = key.split('.');
    let value: unknown = this.config;

    for (const k of keys) {
      if (value === null || typeof value !== 'object') {
        return false;
      }
      value = (value as Record<string, unknown>)[k];
    }

    return value !== undefined;
  }

  /**
   * 获取整个配置对象
   *
   * @returns 完整的配置对象副本
   */
  public getAll(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 重新加载配置
   *
   * 从配置文件重新读取并解析配置
   */
  public reload(): void {
    this.load();
  }
}

/**
 * 便捷函数：获取配置值
 *
 * @param key - 配置键
 * @param defaultValue - 默认值
 * @returns 配置值
 *
 * @example
 * const dbPath = getConfig<string>('database.path', './default.db');
 */
export function getConfig<T>(key: string, defaultValue?: T): T {
  return ConfigLoader.getInstance().get<T>(key, defaultValue);
}

/**
 * 便捷函数：设置配置值
 *
 * @param key - 配置键
 * @param value - 要设置的值
 *
 * @example
 * setConfig('agent.debug', true);
 */
export function setConfig<T>(key: string, value: T): void {
  ConfigLoader.getInstance().set<T>(key, value);
}
