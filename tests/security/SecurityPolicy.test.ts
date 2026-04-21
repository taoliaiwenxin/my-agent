/**
 * @file SecurityPolicy.test.ts
 * @description SecurityPolicy 模块的单元测试
 *              测试覆盖：路径检查、权限检查、危险命令检测、网络访问控制
 * @module security
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as path from 'path';
import { SecurityPolicy, createSecurityPolicy } from '../../src/security/SecurityPolicy';

describe('SecurityPolicy', () => {
  /** 测试目录 */
  const testDir = path.resolve(__dirname, '../../temp/security-test');

  describe('路径检查', () => {
    /**
     * 测试：允许的路径检查
     */
    it('应该允许白名单内的路径', () => {
      const policy = new SecurityPolicy({
        allowedPaths: [testDir],
      });

      const result = policy.checkPath(path.join(testDir, 'file.txt'));
      expect(result.allowed).toBe(true);
    });

    /**
     * 测试：不允许的路径
     */
    it('应该拒绝白名单外的路径', () => {
      const policy = new SecurityPolicy({
        allowedPaths: [testDir],
      });

      const result = policy.checkPath('/etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('路径不在允许列表中');
    });

    /**
     * 测试：相对路径解析
     */
    it('应该正确解析相对路径', () => {
      const policy = new SecurityPolicy({
        allowedPaths: [process.cwd()],
      });

      const result = policy.checkPath('./package.json');
      expect(result.allowed).toBe(true);
    });

    /**
     * 测试：目录遍历攻击防护
     */
    it('应该阻止目录遍历攻击', () => {
      const nestedDir = path.join(testDir, 'nested');
      const policy = new SecurityPolicy({
        allowedPaths: [nestedDir],
      });

      const result = policy.checkPath(path.join(nestedDir, '../outside.txt'));
      expect(result.allowed).toBe(false);
    });

    /**
     * 测试：多个允许路径
     */
    it('应该支持多个允许路径', () => {
      const dir1 = path.join(testDir, 'dir1');
      const dir2 = path.join(testDir, 'dir2');
      const policy = new SecurityPolicy({
        allowedPaths: [dir1, dir2],
      });

      expect(policy.checkPath(path.join(dir1, 'file.txt')).allowed).toBe(true);
      expect(policy.checkPath(path.join(dir2, 'file.txt')).allowed).toBe(true);
      expect(policy.checkPath(path.join(testDir, 'other.txt')).allowed).toBe(false);
    });

    /**
     * 测试：精确路径匹配
     */
    it('应该支持精确路径匹配', () => {
      const exactFile = path.join(testDir, 'exact.txt');
      const policy = new SecurityPolicy({
        allowedPaths: [exactFile],
      });

      expect(policy.checkPath(exactFile).allowed).toBe(true);
      expect(policy.checkPath(path.join(testDir, 'other.txt')).allowed).toBe(false);
    });
  });

  describe('权限检查', () => {
    /**
     * 测试：权限级别比较
     */
    it('应该正确比较权限级别', () => {
      const readPolicy = new SecurityPolicy({ permissionLevel: 'read' });
      const writePolicy = new SecurityPolicy({ permissionLevel: 'write' });
      const executePolicy = new SecurityPolicy({ permissionLevel: 'execute' });

      // read 权限可以执行 read 操作
      expect(readPolicy.checkPermission('read').allowed).toBe(true);
      // read 权限不能执行 write 操作
      expect(readPolicy.checkPermission('write').allowed).toBe(false);
      // read 权限不能执行 execute 操作
      expect(readPolicy.checkPermission('execute').allowed).toBe(false);

      // write 权限可以执行 read 和 write 操作
      expect(writePolicy.checkPermission('read').allowed).toBe(true);
      expect(writePolicy.checkPermission('write').allowed).toBe(true);
      expect(writePolicy.checkPermission('execute').allowed).toBe(false);

      // execute 权限可以执行所有操作
      expect(executePolicy.checkPermission('read').allowed).toBe(true);
      expect(executePolicy.checkPermission('write').allowed).toBe(true);
      expect(executePolicy.checkPermission('execute').allowed).toBe(true);
    });

    /**
     * 测试：权限不足返回正确原因
     */
    it('权限不足时应该返回正确原因', () => {
      const policy = new SecurityPolicy({ permissionLevel: 'read' });

      const result = policy.checkPermission('execute');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('权限不足');
      expect(result.reason).toContain('execute');
      expect(result.reason).toContain('read');
    });
  });

  describe('危险命令检测', () => {
    /**
     * 测试：正常命令
     */
    it('应该允许正常命令', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('ls -la').allowed).toBe(true);
      expect(policy.checkCommand('echo hello').allowed).toBe(true);
      expect(policy.checkCommand('cat file.txt').allowed).toBe(true);
    });

    /**
     * 测试：危险删除命令
     */
    it('应该阻止危险删除命令', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('rm -rf /').allowed).toBe(false);
      expect(policy.checkCommand('rm -rf /bin').allowed).toBe(false);
      expect(policy.checkCommand('rm -rf /etc').allowed).toBe(false);
    });

    /**
     * 测试：格式化命令
     */
    it('应该阻止格式化命令', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('mkfs.ext4 /dev/sda').allowed).toBe(false);
    });

    /**
     * 测试：系统配置修改
     */
    it('应该阻止系统配置修改', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('chmod -R 777 /etc').allowed).toBe(false);
      expect(policy.checkCommand('chown -R root /usr').allowed).toBe(false);
    });

    /**
     * 测试：密码文件访问
     */
    it('应该阻止密码文件访问', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('cat /etc/shadow').allowed).toBe(false);
      expect(policy.checkCommand('cat /etc/passwd').allowed).toBe(false);
    });

    /**
     * 测试：Windows 危险命令
     */
    it('应该阻止 Windows 危险命令', () => {
      const policy = new SecurityPolicy();

      expect(policy.checkCommand('format C:').allowed).toBe(false);
    });

    /**
     * 测试：自定义危险模式
     */
    it('应该支持自定义危险模式', () => {
      const policy = new SecurityPolicy({
        dangerousPatterns: [/custom_dangerous_command/i],
      });

      expect(policy.checkCommand('custom_dangerous_command').allowed).toBe(false);
      expect(policy.checkCommand('ls -la').allowed).toBe(true);
    });
  });

  describe('网络访问控制', () => {
    /**
     * 测试：默认禁用网络
     */
    it('默认应该禁用网络访问', () => {
      const policy = new SecurityPolicy();

      const result = policy.checkNetwork();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('网络访问未启用');
    });

    /**
     * 测试：启用网络
     */
    it('启用后应该允许网络访问', () => {
      const policy = new SecurityPolicy({ allowNetwork: true });

      expect(policy.checkNetwork().allowed).toBe(true);
    });

    /**
     * 测试：域名白名单
     */
    it('应该支持域名白名单', () => {
      const policy = new SecurityPolicy({
        allowNetwork: true,
        allowedDomains: ['example.com', 'api.example.com'],
      });

      expect(policy.checkNetwork('example.com').allowed).toBe(true);
      expect(policy.checkNetwork('sub.example.com').allowed).toBe(true);
      expect(policy.checkNetwork('evil.com').allowed).toBe(false);
    });
  });

  describe('综合检查', () => {
    /**
     * 测试：路径访问综合检查
     */
    it('应该综合检查路径和权限', () => {
      const policy = new SecurityPolicy({
        allowedPaths: [testDir],
        permissionLevel: 'read',
      });

      // 权限和路径都满足
      expect(
        policy.checkPathAccess(path.join(testDir, 'file.txt'), 'read').allowed
      ).toBe(true);

      // 权限不足
      expect(
        policy.checkPathAccess(path.join(testDir, 'file.txt'), 'write').allowed
      ).toBe(false);

      // 路径不允许
      expect(
        policy.checkPathAccess('/etc/passwd', 'read').allowed
      ).toBe(false);
    });

    /**
     * 测试：命令执行综合检查
     */
    it('应该综合检查命令执行', () => {
      const policy = new SecurityPolicy({
        allowedPaths: [testDir],
        permissionLevel: 'execute',
      });

      // 正常命令
      expect(policy.checkCommandExecution('ls -la', testDir).allowed).toBe(true);

      // 权限不足
      const readPolicy = new SecurityPolicy({ permissionLevel: 'read' });
      expect(readPolicy.checkCommandExecution('ls -la').allowed).toBe(false);

      // 危险命令
      expect(
        policy.checkCommandExecution('rm -rf /', testDir).allowed
      ).toBe(false);

      // 工作目录不允许
      expect(
        policy.checkCommandExecution('ls -la', '/etc').allowed
      ).toBe(false);
    });
  });

  describe('配置管理', () => {
    /**
     * 测试：获取和设置路径
     */
    it('应该支持动态修改允许路径', () => {
      const policy = new SecurityPolicy({ allowedPaths: [testDir] });

      expect(policy.getAllowedPaths()).toContain(path.resolve(testDir));

      const newDir = path.join(testDir, 'new');
      policy.addAllowedPath(newDir);
      expect(policy.getAllowedPaths()).toContain(path.resolve(newDir));

      policy.removeAllowedPath(newDir);
      expect(policy.getAllowedPaths()).not.toContain(path.resolve(newDir));
    });

    /**
     * 测试：权限级别修改
     */
    it('应该支持动态修改权限级别', () => {
      const policy = new SecurityPolicy({ permissionLevel: 'read' });

      expect(policy.getPermissionLevel()).toBe('read');

      policy.setPermissionLevel('write');
      expect(policy.getPermissionLevel()).toBe('write');
    });

    /**
     * 测试：添加危险模式
     */
    it('应该支持添加危险模式', () => {
      const policy = new SecurityPolicy();
      const initialCount = policy.getDangerousPatterns().length;

      policy.addDangerousPattern(/new_danger/);
      expect(policy.getDangerousPatterns().length).toBe(initialCount + 1);

      expect(policy.checkCommand('new_danger').allowed).toBe(false);
    });

    /**
     * 测试：配置对象转换
     */
    it('应该正确转换为配置对象', () => {
      const config = {
        allowedPaths: [testDir],
        permissionLevel: 'write' as const,
        allowNetwork: true,
        allowedDomains: ['example.com'],
      };

      const policy = new SecurityPolicy(config);
      const exported = policy.toConfig();

      expect(exported.allowedPaths).toContain(path.resolve(testDir));
      expect(exported.permissionLevel).toBe('write');
      expect(exported.allowNetwork).toBe(true);
      expect(exported.allowedDomains).toContain('example.com');
    });

    /**
     * 测试：便捷创建函数
     */
    it('便捷函数应该创建正确实例', () => {
      const policy = createSecurityPolicy({
        permissionLevel: 'execute',
      });

      expect(policy).toBeInstanceOf(SecurityPolicy);
      expect(policy.getPermissionLevel()).toBe('execute');
    });

    /**
     * 测试：默认配置
     */
    it('应该具有合理的默认配置', () => {
      const policy = new SecurityPolicy();

      expect(policy.getAllowedPaths()).toContain(path.resolve(process.cwd()));
      expect(policy.getPermissionLevel()).toBe('read');
      expect(policy.getDangerousPatterns().length).toBeGreaterThan(0);
    });

    /**
     * 测试：重复添加路径
     */
    it('不应该添加重复路径', () => {
      const policy = new SecurityPolicy({ allowedPaths: [testDir] });
      const initialCount = policy.getAllowedPaths().length;

      policy.addAllowedPath(testDir);
      expect(policy.getAllowedPaths().length).toBe(initialCount);
    });
  });
});
