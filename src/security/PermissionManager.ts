/**
 * @file PermissionManager.ts
 * @description 权限管理器，整合 SecurityPolicy 提供统一的权限验证接口
 * @module security
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import inquirer from 'inquirer';
import { SecurityPolicy } from './SecurityPolicy';
import {
  PermissionLevel,
  PermissionCheckResult,
  SecurityPolicy as SecurityPolicyConfig,
} from '../types';

/**
 * 资源类型
 */
export type ResourceType = 'file' | 'directory' | 'command' | 'network' | 'tool';

/**
 * 权限请求
 */
export interface PermissionRequest {
  /** 资源类型 */
  resourceType: ResourceType;

  /** 操作类型 */
  action: 'read' | 'write' | 'execute' | 'access';

  /** 资源路径或标识 */
  resource?: string;

  /** 额外参数 */
  metadata?: Record<string, unknown>;
}

/**
 * 权限验证结果（扩展）
 */
export interface ValidationResult {
  /** 是否允许 */
  allowed: boolean;

  /** 拒绝原因 */
  reason?: string;

  /** 检查的策略 */
  checkedPolicies: string[];

  /** 原始结果 */
  checks: PermissionCheckResult[];
}

/**
 * 权限管理器
 *
 * 整合 SecurityPolicy，提供统一的权限验证接口。
 * 支持按资源类型进行权限检查。
 */
export class PermissionManager {
  /** 安全策略 */
  private policy: SecurityPolicy;

  /** 操作到权限级别的映射 */
  private actionToPermission: Record<string, PermissionLevel> = {
    read: 'read',
    write: 'write',
    execute: 'execute',
    access: 'read',
  };

  /**
   * 创建权限管理器实例
   *
   * @param policy - 安全策略实例或配置
   */
  constructor(policy?: SecurityPolicy | Partial<SecurityPolicyConfig>) {
    if (policy instanceof SecurityPolicy) {
      this.policy = policy;
    } else {
      this.policy = new SecurityPolicy(policy);
    }
  }

  /**
   * 验证权限请求
   *
   * @param request - 权限请求
   * @returns 验证结果
   */
  public validate(request: PermissionRequest): ValidationResult {
    const checks: PermissionCheckResult[] = [];
    const checkedPolicies: string[] = [];

    // 基础权限检查
    const requiredLevel = this.actionToPermission[request.action];
    const permissionCheck = this.policy.checkPermission(requiredLevel);
    checks.push(permissionCheck);
    checkedPolicies.push('permission');

    if (!permissionCheck.allowed) {
      return {
        allowed: false,
        reason: permissionCheck.reason,
        checkedPolicies,
        checks,
      };
    }

    // 根据资源类型进行特定检查
    switch (request.resourceType) {
      case 'file':
      case 'directory': {
        if (request.resource) {
          const pathCheck = this.policy.checkPathAccess(
            request.resource,
            requiredLevel
          );
          checks.push(pathCheck);
          checkedPolicies.push('path');

          if (!pathCheck.allowed) {
            return {
              allowed: false,
              reason: pathCheck.reason,
              checkedPolicies,
              checks,
            };
          }
        }
        break;
      }

      case 'command': {
        if (request.resource) {
          const commandCheck = this.policy.checkCommandExecution(
            request.resource,
            request.metadata?.cwd as string | undefined
          );
          checks.push(commandCheck);
          checkedPolicies.push('command');

          if (!commandCheck.allowed) {
            return {
              allowed: false,
              reason: commandCheck.reason,
              checkedPolicies,
              checks,
            };
          }
        }
        break;
      }

      case 'network': {
        const domain = request.metadata?.domain as string | undefined;
        const networkCheck = this.policy.checkNetwork(domain);
        checks.push(networkCheck);
        checkedPolicies.push('network');

        if (!networkCheck.allowed) {
          return {
            allowed: false,
            reason: networkCheck.reason,
            checkedPolicies,
            checks,
          };
        }
        break;
      }

      case 'tool': {
        // 工具权限检查：需要对应操作级别的权限
        // 已经在基础权限检查中完成
        break;
      }
    }

    return {
      allowed: true,
      checkedPolicies,
      checks,
    };
  }

  /**
   * 快捷方法：检查文件读取权限
   *
   * @param filePath - 文件路径
   * @returns 验证结果
   */
  public canReadFile(filePath: string): ValidationResult {
    return this.validate({
      resourceType: 'file',
      action: 'read',
      resource: filePath,
    });
  }

  /**
   * 快捷方法：检查文件写入权限
   *
   * @param filePath - 文件路径
   * @returns 验证结果
   */
  public canWriteFile(filePath: string): ValidationResult {
    return this.validate({
      resourceType: 'file',
      action: 'write',
      resource: filePath,
    });
  }

  /**
   * 快捷方法：检查命令执行权限
   *
   * @param command - 命令
   * @param cwd - 工作目录
   * @returns 验证结果
   */
  public canExecuteCommand(command: string, cwd?: string): ValidationResult {
    return this.validate({
      resourceType: 'command',
      action: 'execute',
      resource: command,
      metadata: cwd ? { cwd } : undefined,
    });
  }

  /**
   * 快捷方法：检查网络访问权限
   *
   * @param domain - 域名
   * @returns 验证结果
   */
  public canAccessNetwork(domain?: string): ValidationResult {
    return this.validate({
      resourceType: 'network',
      action: 'access',
      metadata: domain ? { domain } : undefined,
    });
  }

  /**
   * 快捷方法：检查目录访问权限
   *
   * @param dirPath - 目录路径
   * @param action - 操作类型
   * @returns 验证结果
   */
  public canAccessDirectory(
    dirPath: string,
    action: 'read' | 'write' | 'execute' = 'read'
  ): ValidationResult {
    return this.validate({
      resourceType: 'directory',
      action,
      resource: dirPath,
    });
  }

  /**
   * 批量验证多个请求
   *
   * @param requests - 权限请求列表
   * @returns 验证结果列表
   */
  public validateBatch(requests: PermissionRequest[]): ValidationResult[] {
    return requests.map((req) => this.validate(req));
  }

  /**
   * 检查是否所有请求都通过
   *
   * @param requests - 权限请求列表
   * @returns 是否全部通过
   */
  public validateAll(requests: PermissionRequest[]): boolean {
    return requests.every((req) => this.validate(req).allowed);
  }

  /**
   * 获取底层安全策略
   *
   * @returns SecurityPolicy 实例
   */
  public getPolicy(): SecurityPolicy {
    return this.policy;
  }

  /**
   * 更新安全策略
   *
   * @param policy - 新的安全策略
   */
  public setPolicy(policy: SecurityPolicy): void {
    this.policy = policy;
  }

  /**
   * 获取当前权限级别
   *
   * @returns 权限级别
   */
  public getPermissionLevel(): PermissionLevel {
    return this.policy.getPermissionLevel();
  }

  /**
   * 更新权限级别
   *
   * @param level - 新的权限级别
   */
  public setPermissionLevel(level: PermissionLevel): void {
    this.policy.setPermissionLevel(level);
  }

  /**
   * 添加允许的路径
   *
   * @param newPath - 要添加的路径
   */
  public addAllowedPath(newPath: string): void {
    this.policy.addAllowedPath(newPath);
  }

  /**
   * 移除允许的路径
   *
   * @param targetPath - 要移除的路径
   */
  public removeAllowedPath(targetPath: string): void {
    this.policy.removeAllowedPath(targetPath);
  }

  /**
   * 添加危险命令模式
   *
   * @param pattern - 正则表达式模式
   */
  public addDangerousPattern(pattern: RegExp): void {
    this.policy.addDangerousPattern(pattern);
  }

  /**
   * 提示用户确认操作
   *
   * 在执行修改性操作前，使用 inquirer 提示用户确认。
   *
   * @param toolName - 工具名称
   * @param params - 工具参数
   * @returns 用户是否确认执行
   */
  public async confirmAction(toolName: string, params: unknown): Promise<boolean> {
    const paramStr = params ? JSON.stringify(params).substring(0, 200) : '{}';
    const message = `执行 ${toolName}(${paramStr})?`;

    try {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message,
          default: false,
        },
      ]);
      return confirmed;
    } catch {
      // 如果 inquirer 失败（如非 TTY 环境），默认拒绝
      return false;
    }
  }
}

/**
 * 创建权限管理器（便捷函数）
 *
 * @param policy - 安全策略实例或配置
 * @returns PermissionManager 实例
 */
export function createPermissionManager(
  policy?: SecurityPolicy | Partial<SecurityPolicyConfig>
): PermissionManager {
  return new PermissionManager(policy);
}
