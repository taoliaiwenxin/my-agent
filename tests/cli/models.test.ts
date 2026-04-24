/**
 * @file models.test.ts
 * @description 模型管理 CLI 测试
 * @module cli
 * @author AI Agent
 * @date 2026-04-22
 */

import { ModelManager, ModelConfigInput } from '../../src/cli/ModelManager';
import { SQLiteClient } from '../../src/memory/SQLiteClient';

// Mock chalk to avoid ANSI codes in tests
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    bold: (t: string) => t,
    green: (t: string) => t,
    red: (t: string) => t,
    yellow: (t: string) => t,
    cyan: (t: string) => t,
    gray: (t: string) => t,
  },
}));

jest.mock('ora', () => ({
  __esModule: true,
  default: () => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: '',
  }),
}));

// Helper to convert SQLite integer booleans
const toBool = (v: number | boolean | null): boolean => !!v;

let testId = 0;

function getTestDbPath(): string {
  return `./storage/test-models-${Date.now()}-${++testId}.db`;
}

describe('ModelManager', () => {
  let db: SQLiteClient;
  let manager: ModelManager;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = getTestDbPath();
    db = new SQLiteClient(dbPath);
    await db.connect();
    manager = new ModelManager(db);
  });

  afterEach(async () => {
    try {
      await db.close();
    } catch {
      // ignore
    }
    try {
      await db.deleteDatabase();
    } catch {
      // ignore cleanup errors
    }
  });

  describe('addModel', () => {
    it('should add a model', async () => {
      const input: ModelConfigInput = {
        id: 'claude-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet-20241022',
        api_key: 'sk-test-key',
      };

      const model = await manager.addModel(input);

      expect(model.id).toBe('claude-sonnet');
      expect(model.name).toBe('Claude 3.5 Sonnet');
      expect(model.provider_type).toBe('anthropic');
      expect(model.model_name).toBe('claude-3-5-sonnet-20241022');
      expect(toBool(model.is_active)).toBe(true);
      expect(toBool(model.is_default)).toBe(false);
    });

    it('should throw when adding duplicate model', async () => {
      const input: ModelConfigInput = {
        id: 'duplicate',
        name: 'Test',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      };

      await manager.addModel(input);

      await expect(manager.addModel(input)).rejects.toThrow(
        "Model with id 'duplicate' already exists"
      );
    });

    it('should set as default when is_default is true', async () => {
      await manager.addModel({
        id: 'first',
        name: 'First',
        provider_type: 'anthropic',
        model_name: 'claude-3-haiku',
      });

      const second = await manager.addModel({
        id: 'second',
        name: 'Second',
        provider_type: 'openai',
        model_name: 'gpt-4o',
        is_default: true,
      });

      expect(toBool(second.is_default)).toBe(true);

      // First model should no longer be default
      const first = await manager.getModel('first');
      expect(toBool(first!.is_default)).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should return empty array when no models', async () => {
      const models = await manager.listModels();
      expect(models).toEqual([]);
    });

    it('should list all models', async () => {
      await manager.addModel({
        id: 'model-1',
        name: 'Model 1',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      await manager.addModel({
        id: 'model-2',
        name: 'Model 2',
        provider_type: 'openai',
        model_name: 'gpt-4o',
      });

      const models = await manager.listModels();
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toContain('model-1');
      expect(models.map((m) => m.id)).toContain('model-2');
    });
  });

  describe('getModel', () => {
    it('should return model by id', async () => {
      await manager.addModel({
        id: 'test-model',
        name: 'Test Model',
        provider_type: 'anthropic',
        model_name: 'claude-3-opus',
      });

      const model = await manager.getModel('test-model');
      expect(model).not.toBeNull();
      expect(model!.id).toBe('test-model');
    });

    it('should return null for non-existent model', async () => {
      const model = await manager.getModel('non-existent');
      expect(model).toBeNull();
    });
  });

  describe('updateModel', () => {
    it('should update model fields', async () => {
      await manager.addModel({
        id: 'update-test',
        name: 'Original Name',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      const updated = await manager.updateModel('update-test', {
        name: 'Updated Name',
        model_name: 'claude-3-opus',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.model_name).toBe('claude-3-opus');
    });

    it('should throw when updating non-existent model', async () => {
      await expect(
        manager.updateModel('non-existent', { name: 'New Name' })
      ).rejects.toThrow("Model 'non-existent' not found");
    });

    it('should update boolean fields correctly', async () => {
      await manager.addModel({
        id: 'bool-test',
        name: 'Bool Test',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
        supports_vision: true,
        supports_tools: true,
      });

      const updated = await manager.updateModel('bool-test', {
        supports_vision: false,
        supports_tools: false,
      });

      expect(toBool(updated.supports_vision)).toBe(false);
      expect(toBool(updated.supports_tools)).toBe(false);
    });
  });

  describe('removeModel', () => {
    it('should remove model', async () => {
      await manager.addModel({
        id: 'remove-test',
        name: 'Remove Test',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      const removed = await manager.removeModel('remove-test');
      expect(removed).toBe(true);

      const model = await manager.getModel('remove-test');
      expect(model).toBeNull();
    });

    it('should return false for non-existent model', async () => {
      const removed = await manager.removeModel('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('setDefault', () => {
    it('should set model as default', async () => {
      await manager.addModel({
        id: 'default-test',
        name: 'Default Test',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      const model = await manager.setDefault('default-test');
      expect(toBool(model.is_default)).toBe(true);

      const defaultModel = await manager.getDefaultModel();
      expect(defaultModel!.id).toBe('default-test');
    });
  });

  describe('setActive', () => {
    it('should disable and enable model', async () => {
      await manager.addModel({
        id: 'active-test',
        name: 'Active Test',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      const disabled = await manager.setActive('active-test', false);
      expect(toBool(disabled.is_active)).toBe(false);

      const enabled = await manager.setActive('active-test', true);
      expect(toBool(enabled.is_active)).toBe(true);
    });
  });

  describe('getDefaultModel', () => {
    it('should return null when no default model', async () => {
      const model = await manager.getDefaultModel();
      expect(model).toBeNull();
    });

    it('should return default model', async () => {
      await manager.addModel({
        id: 'default-model',
        name: 'Default',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
        is_default: true,
      });

      const model = await manager.getDefaultModel();
      expect(model).not.toBeNull();
      expect(model!.id).toBe('default-model');
    });
  });

  describe('hasModel', () => {
    it('should return true for existing model', async () => {
      await manager.addModel({
        id: 'exists',
        name: 'Exists',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
      });

      expect(await manager.hasModel('exists')).toBe(true);
    });

    it('should return false for non-existent model', async () => {
      expect(await manager.hasModel('non-existent')).toBe(false);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple models with different providers', async () => {
      await manager.addModel({
        id: 'claude',
        name: 'Claude',
        provider_type: 'anthropic',
        model_name: 'claude-3-5-sonnet',
        api_key: 'sk-ant-test',
      });

      await manager.addModel({
        id: 'gpt',
        name: 'GPT',
        provider_type: 'openai',
        model_name: 'gpt-4o',
        api_key: 'sk-openai-test',
        base_url: 'https://custom.openai.com',
      });

      const models = await manager.listModels();
      expect(models).toHaveLength(2);

      const gpt = await manager.getModel('gpt');
      expect(gpt!.base_url).toBe('https://custom.openai.com');
    });

    it('should handle model with all optional fields', async () => {
      const input: ModelConfigInput = {
        id: 'full-config',
        name: 'Full Config',
        provider_type: 'openai',
        model_name: 'gpt-4o',
        api_key: 'sk-test',
        base_url: 'https://api.openai.com',
        supports_vision: true,
        supports_tools: true,
        supports_streaming: true,
        max_tokens: 8192,
        rpm_limit: 100,
        daily_cost_limit: 10.5,
        is_active: true,
        is_default: false,
        priority: 5,
      };

      const model = await manager.addModel(input);

      expect(toBool(model.supports_vision)).toBe(true);
      expect(model.max_tokens).toBe(8192);
      expect(model.rpm_limit).toBe(100);
      expect(model.daily_cost_limit).toBe(10.5);
      expect(model.priority).toBe(5);
    });
  });
});
