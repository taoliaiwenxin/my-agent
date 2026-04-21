/**
 * @file PermissionManager.test.ts
 * @description PermissionManager 模块的单元测试
 *              测试覆盖：权限验证、快捷方法、批量验证、策略管理
 * @module security
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as path from 'path';
import { PermissionManager, createPermissionManager } from '../../src/security/PermissionManager';
import { SecurityPolicy } from '../../src/security/SecurityPolicy';

describe('PermissionManager', () => {
  /** 测试目录 */
  const testDir = path.resolve(__dirname, '../../temp/permission-test');

  describe('基础验证', () => {
    /**
     * 测试：文件读取权限
     */
    it('应该验证文件读取权限', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      const result = manager.validate({
        resourceType: 'file',
        action: 'read',
        resource: path.join(testDir, 'file.txt'),
      });

      expect(result.allowed).toBe(true);
      expect(result.checkedPolicies).toContain('permission');
      expect(result.checkedPolicies).toContain('path');
    });

    /**
     * 测试：权限不足
     */
    it('应该拒绝权限不足的请求', () => {
      const manager = new PermissionManager({
        permissionLevel: 'read',
      });

      const result = manager.validate({
        resourceType: 'file',
        action: 'write',
        resource: path.join(testDir, 'file.txt'),
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('权限不足');
      expect(result.checkedPolicies).toEqual(['permission']);
    });

    /**
     * 测试：路径不允许
     */
    it('应该拒绝不在白名单的路径', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'write',
      });

      const result = manager.validate({
        resourceType: 'file',
        action: 'write',
        resource: '/etc/passwd',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('路径不在允许列表中');
    });

    /**
     * 测试：命令执行权限
     */
    it('应该验证命令执行权限', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'execute',
      });

      const result = manager.validate({
        resourceType: 'command',
        action: 'execute',
        resource: 'ls -la',
      });

      expect(result.allowed).toBe(true);
      expect(result.checkedPolicies).toContain('command');
    });

    /**
     * 测试：危险命令
     */
    it('应该拒绝危险命令', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'execute',
      });

      const result = manager.validate({
        resourceType: 'command',
        action: 'execute',
        resource: 'rm -rf /',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('危险');
    });

    /**
     * 测试：网络访问权限
     */
    it('应该验证网络访问权限', () => {
      const manager = new PermissionManager({
        allowNetwork: true,
        allowedDomains: ['example.com'],
      });

      const allowedResult = manager.validate({
        resourceType: 'network',
        action: 'access',
        metadata: { domain: 'example.com' },
      });
      expect(allowedResult.allowed).toBe(true);

      const forbiddenResult = manager.validate({
        resourceType: 'network',
        action: 'access',
        metadata: { domain: 'evil.com' },
      });
      expect(forbiddenResult.allowed).toBe(false);
    });

    /**
     * 测试：工具权限
     */
    it('应该验证工具权限', () => {
      const manager = new PermissionManager({
        permissionLevel: 'read',
      });

      const result = manager.validate({
        resourceType: 'tool',
        action: 'read',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('快捷方法', () => {
    /**
     * 测试：canReadFile
     */
    it('canReadFile 应该正确验证', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      expect(manager.canReadFile(path.join(testDir, 'file.txt')).allowed).toBe(true);
      expect(manager.canReadFile('/etc/passwd').allowed).toBe(false);
    });

    /**
     * 测试：canWriteFile
     */
    it('canWriteFile 应该正确验证', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'write',
      });

      expect(manager.canWriteFile(path.join(testDir, 'file.txt')).allowed).toBe(true);

      // read 权限不能写入
      const readManager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });
      expect(readManager.canWriteFile(path.join(testDir, 'file.txt')).allowed).toBe(false);
    });

    /**
     * 测试：canExecuteCommand
     */
    it('canExecuteCommand 应该正确验证', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'execute',
      });

      expect(manager.canExecuteCommand('ls -la').allowed).toBe(true);
      expect(manager.canExecuteCommand('rm -rf /').allowed).toBe(false);

      // read 权限不能执行命令
      const readManager = new PermissionManager({
        permissionLevel: 'read',
      });
      expect(readManager.canExecuteCommand('ls -la').allowed).toBe(false);
    });

    /**
     * 测试：canAccessNetwork
     */
    it('canAccessNetwork 应该正确验证', () => {
      const manager = new PermissionManager({
        allowNetwork: true,
      });

      expect(manager.canAccessNetwork().allowed).toBe(true);

      const disabledManager = new PermissionManager({
        allowNetwork: false,
      });
      expect(disabledManager.canAccessNetwork().allowed).toBe(false);
    });

    /**
     * 测试：canAccessDirectory
     */
    it('canAccessDirectory 应该正确验证', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      expect(manager.canAccessDirectory(testDir).allowed).toBe(true);
      expect(manager.canAccessDirectory('/etc').allowed).toBe(false);
    });
  });

  describe('批量验证', () => {
    /**
     * 测试：validateBatch
     */
    it('应该批量验证请求', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'write',
      });

      const results = manager.validateBatch([
        { resourceType: 'file', action: 'read', resource: path.join(testDir, 'a.txt') },
        { resourceType: 'file', action: 'write', resource: path.join(testDir, 'b.txt') },
        { resourceType: 'file', action: 'read', resource: '/etc/passwd' },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      expect(results[2].allowed).toBe(false);
    });

    /**
     * 测试：validateAll
     */
    it('validateAll 应该检查是否全部通过', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'write',
      });

      expect(
        manager.validateAll([
          { resourceType: 'file', action: 'read', resource: path.join(testDir, 'a.txt') },
          { resourceType: 'file', action: 'write', resource: path.join(testDir, 'b.txt') },
        ])
      ).toBe(true);

      expect(
        manager.validateAll([
          { resourceType: 'file', action: 'read', resource: path.join(testDir, 'a.txt') },
          { resourceType: 'file', action: 'read', resource: '/etc/passwd' },
        ])
      ).toBe(false);
    });
  });

  describe('策略管理', () => {
    /**
     * 测试：使用 SecurityPolicy 实例构造
     */
    it('应该支持 SecurityPolicy 实例构造', () => {
      const policy = new SecurityPolicy({
        permissionLevel: 'execute',
        allowedPaths: [testDir],
      });

      const manager = new PermissionManager(policy);
      expect(manager.getPermissionLevel()).toBe('execute');
    });

    /**
     * 测试：获取和设置策略
     */
    it('应该支持动态更换策略', () => {
      const manager = new PermissionManager({
        permissionLevel: 'read',
      });

      expect(manager.getPermissionLevel()).toBe('read');

      const newPolicy = new SecurityPolicy({
        permissionLevel: 'execute',
      });
      manager.setPolicy(newPolicy);

      expect(manager.getPermissionLevel()).toBe('execute');
    });

    /**
     * 测试：权限级别修改
     */
    it('应该支持修改权限级别', () => {
      const manager = new PermissionManager({
        permissionLevel: 'read',
      });

      manager.setPermissionLevel('write');
      expect(manager.getPermissionLevel()).toBe('write');
    });

    /**
     * 测试：路径管理
     */
    it('应该支持路径管理', () => {
      const otherDir = path.resolve(__dirname, '../../temp/other-dir');
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      manager.addAllowedPath(otherDir);
      expect(manager.canReadFile(path.join(otherDir, 'file.txt')).allowed).toBe(true);

      manager.removeAllowedPath(otherDir);
      expect(manager.canReadFile(path.join(otherDir, 'file.txt')).allowed).toBe(false);
    });

    /**
     * 测试：添加危险模式
     */
    it('应该支持添加危险模式', () => {
      const manager = new PermissionManager({
        permissionLevel: 'execute',
        allowedPaths: [testDir],
      });

      manager.addDangerousPattern(/forbidden_tool/i);
      expect(manager.canExecuteCommand('forbidden_tool').allowed).toBe(false);
    });

    /**
     * 测试：便捷创建函数
     */
    it('便捷函数应该创建正确实例', () => {
      const manager = createPermissionManager({
        permissionLevel: 'write',
      });

      expect(manager).toBeInstanceOf(PermissionManager);
      expect(manager.getPermissionLevel()).toBe('write');
    });
  });

  describe('检查结果结构', () => {
    /**
     * 测试：成功结果结构
     */
    it('成功结果应该包含所有字段', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      const result = manager.canReadFile(path.join(testDir, 'file.txt'));

      expect(result.allowed).toBe(true);
      expect(result.checkedPolicies).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.reason).toBeUndefined();
    });

    /**
     * 测试：失败结果结构
     */
    it('失败结果应该包含原因', () => {
      const manager = new PermissionManager({
        permissionLevel: 'read',
      });

      const result = manager.canWriteFile(path.join(testDir, 'file.txt'));

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.checkedPolicies).toContain('permission');
    });

    /**
     * 测试：多个检查点
     */
    it('应该记录所有检查点', () => {
      const manager = new PermissionManager({
        allowedPaths: [testDir],
        permissionLevel: 'execute',
      });

      const result = manager.canExecuteCommand('ls -la', testDir);

      expect(result.allowed).toBe(true);
      expect(result.checkedPolicies).toContain('permission');
      expect(result.checkedPolicies).toContain('command');
      expect(result.checks.length).toBe(2);
    });
  });
});
