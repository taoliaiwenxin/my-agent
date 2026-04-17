/**
 * @file ModelRegistry.ts
 * @description 模型注册表，管理 LLM Provider 的注册、查询和默认设置
 *              支持工厂模式注册，便于扩展新的 Provider 类型
 * @module llm
 * @author AI Agent
 * @date 2026-04-17
 * @version 1.0.0
 *
 * @example
 * // 创建注册表
 * const registry = new ModelRegistry();
 *
 * // 注册 Provider 工厂
 * registry.registerFactory('anthropic', createAnthropicProvider);
 *
 * // 添加 Provider 实例
 * const provider = registry.addProvider({
 *   id: 'claude-prod',
 *   type: 'anthropic',
 *   modelName: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   isDefault: true,
 * });
 *
 * // 获取默认 Provider
 * const defaultProvider = registry.getDefault();
 *
 * // 列出所有 Provider
 * const providers = registry.list();
 *
 * @see {@link MODEL_MANAGEMENT.md}
 */

import {
  LLMProvider,
  ProviderMetadata,
  ProviderConfig,
  ProviderFactory,
} from './providers/LLMProvider';

/**
 * Provider 未找到错误
 */
export class ProviderNotFoundError extends Error {
  constructor(id: string) {
    super(`Provider not found: ${id}`);
    this.name = 'ProviderNotFoundError';
  }
}

/**
 * Provider 类型未找到错误
 */
export class ProviderTypeNotFoundError extends Error {
  constructor(type: string) {
    super(`Unknown provider type: ${type}. Please register the factory first.`);
    this.name = 'ProviderTypeNotFoundError';
  }
}

/**
 * 没有默认 Provider 错误
 */
export class NoDefaultProviderError extends Error {
  constructor() {
    super('No default provider set. Please add a provider with isDefault: true or call setDefault().');
    this.name = 'NoDefaultProviderError';
  }
}

/**
 * 模型注册表
 *
 * 管理所有 LLM Provider 的注册、查询和默认设置
 */
export class ModelRegistry {
  /** Provider 实例映射表 */
  private providers: Map<string, LLMProvider> = new Map();

  /** Provider 工厂映射表 */
  private factories: Map<string, ProviderFactory> = new Map();

  /** 默认 Provider ID */
  private defaultProviderId: string | null = null;

  /**
   * 注册 Provider 工厂
   *
   * 注册一个工厂函数，用于创建特定类型的 Provider 实例
   *
   * @param type - Provider 类型标识
   * @param factory - 工厂函数
   *
   * @example
   * registry.registerFactory('anthropic', (config) => new AnthropicProvider(config));
   */
  registerFactory(type: string, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * 注销 Provider 工厂
   *
   * @param type - Provider 类型标识
   * @returns 是否成功注销
   */
  unregisterFactory(type: string): boolean {
    return this.factories.delete(type);
  }

  /**
   * 添加 Provider 实例
   *
   * 使用已注册的工厂创建 Provider 实例并添加到注册表
   *
   * @param config - Provider 配置
   * @returns 创建的 Provider 实例
   * @throws {ProviderTypeNotFoundError} 如果工厂未注册
   *
   * @example
   * const provider = registry.addProvider({
   *   id: 'claude-prod',
   *   type: 'anthropic',
   *   modelName: 'claude-3-5-sonnet-20241022',
   *   apiKey: 'sk-ant-api...',
   *   isDefault: true,
   * });
   */
  addProvider(config: ProviderConfig): LLMProvider {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new ProviderTypeNotFoundError(config.type);
    }

    const provider = factory(config);
    this.providers.set(config.id, provider);

    // 如果是第一个 Provider 或设置为默认，则设为默认
    if (config.isDefault || this.providers.size === 1) {
      this.defaultProviderId = config.id;
    }

    return provider;
  }

  /**
   * 移除 Provider 实例
   *
   * @param id - Provider ID
   * @returns 是否成功移除
   *
   * @example
   * const removed = registry.removeProvider('claude-prod');
   * if (removed) {
   *   console.log('Provider removed');
   * }
   */
  removeProvider(id: string): boolean {
    // 如果移除的是默认 Provider，清除默认设置
    if (this.defaultProviderId === id) {
      this.defaultProviderId = null;

      // 如果有其他 Provider，设置第一个为默认
      const remainingIds = Array.from(this.providers.keys()).filter((key) => key !== id);
      if (remainingIds.length > 0) {
        this.defaultProviderId = remainingIds[0];
      }
    }

    return this.providers.delete(id);
  }

  /**
   * 获取 Provider 实例
   *
   * @param id - Provider ID
   * @returns Provider 实例
   * @throws {ProviderNotFoundError} 如果 Provider 不存在
   *
   * @example
   * const provider = registry.get('claude-prod');
   * const response = await provider.chat(messages);
   */
  get(id: string): LLMProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderNotFoundError(id);
    }
    return provider;
  }

  /**
   * 安全获取 Provider 实例
   *
   * @param id - Provider ID
   * @returns Provider 实例或 undefined
   *
   * @example
   * const provider = registry.getOptional('claude-prod');
   * if (provider) {
   *   // 使用 provider
   * }
   */
  getOptional(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * 获取默认 Provider
   *
   * @returns 默认 Provider 实例
   * @throws {NoDefaultProviderError} 如果没有设置默认 Provider
   *
   * @example
   * const provider = registry.getDefault();
   * const response = await provider.chat(messages);
   */
  getDefault(): LLMProvider {
    if (!this.defaultProviderId) {
      throw new NoDefaultProviderError();
    }
    return this.get(this.defaultProviderId);
  }

  /**
   * 获取默认 Provider ID
   *
   * @returns 默认 Provider ID 或 null
   */
  getDefaultId(): string | null {
    return this.defaultProviderId;
  }

  /**
   * 设置默认 Provider
   *
   * @param id - Provider ID
   * @throws {ProviderNotFoundError} 如果 Provider 不存在
   *
   * @example
   * registry.setDefault('claude-prod');
   */
  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new ProviderNotFoundError(id);
    }
    this.defaultProviderId = id;
  }

  /**
   * 列出所有 Provider 元数据
   *
   * @returns Provider 元数据列表
   *
   * @example
   * const providers = registry.list();
   * providers.forEach(p => console.log(p.name, p.isDefault));
   */
  list(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => p.metadata);
  }

  /**
   * 按类型列出 Provider
   *
   * @param type - Provider 类型
   * @returns 符合类型的 Provider 元数据列表
   *
   * @example
   * const anthropicProviders = registry.listByType('anthropic');
   */
  listByType(type: string): ProviderMetadata[] {
    return this.list().filter((p) => p.type === type);
  }

  /**
   * 检查 Provider 是否存在
   *
   * @param id - Provider ID
   * @returns 是否存在
   *
   * @example
   * if (registry.has('claude-prod')) {
   *   // Provider exists
   * }
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * 获取已注册的工厂类型列表
   *
   * @returns 工厂类型列表
   *
   * @example
   * const types = registry.getAvailableTypes();
   * // ['anthropic', 'openai', 'ollama']
   */
  getAvailableTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * 获取 Provider 数量
   *
   * @returns Provider 数量
   */
  size(): number {
    return this.providers.size;
  }

  /**
   * 清空所有 Provider
   *
   * @example
   * registry.clear();
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviderId = null;
  }

  /**
   * 检查工厂是否已注册
   *
   * @param type - Provider 类型
   * @returns 是否已注册
   */
  hasFactory(type: string): boolean {
    return this.factories.has(type);
  }
}

/**
 * 创建模型注册表（便捷函数）
 *
 * @returns 新的 ModelRegistry 实例
 *
 * @example
 * const registry = createModelRegistry();
 */
export function createModelRegistry(): ModelRegistry {
  return new ModelRegistry();
}
