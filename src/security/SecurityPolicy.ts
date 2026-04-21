/**
 * @file SecurityPolicy.ts
 * @description 安全策略模块，实现路径检查、权限分级和危险命令检测
 * @module security
 * @author AI Agent
 * @date 2026-04-21
 * @version 1.0.0
 */

import * as path from 'path';
import {
  PermissionLevel,
  PermissionCheckResult,
  SecurityPolicy as SecurityPolicyConfig,
} from '../types';

/**
 * 默认危险命令模式
 */
const DEFAULT_DANGEROUS_PATTERNS: RegExp[] = [
  // 删除系统文件或目录
  /rm\s+(-rf?|--recursive)\s+\//i,
  /rm\s+.*\/(bin|sbin|usr|etc|lib|sys|dev|proc)\b/i,
  // 格式化磁盘
  /mkfs\.\w+/i,
  /dd\s+if=.*\s+of=\/(dev|disk)/i,
  // 修改系统配置
  /chmod\s+(-R)?\s+.*\/(etc|bin|sbin|usr)/i,
  /chown\s+(-R)?\s+.*\/(etc|bin|sbin|usr)/i,
  // 网络攻击相关
  /:\(\)\s*\{\s*:\|\:&\s*\};/i,
  // Windows 危险命令
  /del\s+\//i,
  /format\s+/i,
  /rd\s+\/s\s+/i,
  // 密码文件
  /cat\s+.*\/etc\/shadow/i,
  /cat\s+.*\/etc\/passwd/i,
];

/**
 * 权限级别数值映射（用于比较）
 */
const PERMISSION_LEVELS: Record<PermissionLevel, number> = {
  read: 1,
  write: 2,
  execute: 3,
};

/**
 * 安全策略类
 *
 * 提供路径验证、权限检查和危险命令检测等安全功能。
 */
export class SecurityPolicy {
  /** 允许的路径白名单 */
  private allowedPaths: string[];

  /** 当前权限级别 */
  private permissionLevel: PermissionLevel;

  /** 危险命令模式列表 */
  private dangerousPatterns: RegExp[];

  /** 是否允许网络访问 */
  private allowNetwork: boolean;

  /** 允许的域名列表 */
  private allowedDomains?: string[];

  /**
   * 创建安全策略实例
   *
   * @param config - 安全策略配置
   */
  constructor(config?: Partial<SecurityPolicyConfig>) {
    this.allowedPaths = config?.allowedPaths?.map((p) => path.resolve(p)) || [
      process.cwd(),
    ];
    this.permissionLevel = config?.permissionLevel || 'read';
    this.dangerousPatterns = config?.dangerousPatterns || [
      ...DEFAULT_DANGEROUS_PATTERNS,
    ];
    this.allowNetwork = config?.allowNetwork ?? false;
    this.allowedDomains = config?.allowedDomains;
  }

  /**
   * 检查路径是否在允许的白名单内
   *
   * @param targetPath - 要检查的路径
   * @returns 权限检查结果
   */
  public checkPath(targetPath: string): PermissionCheckResult {
    const absolutePath = path.resolve(targetPath);

    const isAllowed = this.allowedPaths.some(
      (allowedPath) =>
        absolutePath === allowedPath ||
        absolutePath.startsWith(allowedPath + path.sep)
    );

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `路径不在允许列表中: ${targetPath}`,
      };
    }

    return { allowed: true };
  }

  /**
   * 检查权限级别是否满足要求
   *
   * @param required - 需要的权限级别
   * @returns 权限检查结果
   */
  public checkPermission(required: PermissionLevel): PermissionCheckResult {
    const currentLevel = PERMISSION_LEVELS[this.permissionLevel];
    const requiredLevel = PERMISSION_LEVELS[required];

    if (currentLevel >= requiredLevel) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `权限不足: 需要 ${required}，当前为 ${this.permissionLevel}`,
    };
  }

  /**
   * 检查命令是否包含危险模式
   *
   * @param command - 要检查的命令
   * @returns 权限检查结果
   */
  public checkCommand(command: string): PermissionCheckResult {
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `命令包含危险模式: ${pattern.source}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 检查是否允许网络访问
   *
   * @param domain - 目标域名（可选）
   * @returns 权限检查结果
   */
  public checkNetwork(domain?: string): PermissionCheckResult {
    if (!this.allowNetwork) {
      return {
        allowed: false,
        reason: '网络访问未启用',
      };
    }

    if (domain && this.allowedDomains && this.allowedDomains.length > 0) {
      const isAllowed = this.allowedDomains.some(
        (allowed) => domain === allowed || domain.endsWith('.' + allowed)
      );

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `域名 ${domain} 不在允许列表中`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 综合检查：路径 + 权限
   *
   * @param targetPath - 目标路径
   * @param requiredPermission - 需要的权限级别
   * @returns 权限检查结果
   */
  public checkPathAccess(
    targetPath: string,
    requiredPermission: PermissionLevel
  ): PermissionCheckResult {
    const permissionCheck = this.checkPermission(requiredPermission);
    if (!permissionCheck.allowed) {
      return permissionCheck;
    }

    return this.checkPath(targetPath);
  }

  /**
   * 综合检查：命令执行
   *
   * @param command - 要执行的命令
   * @param cwd - 工作目录
   * @returns 权限检查结果
   */
  public checkCommandExecution(
    command: string,
    cwd?: string
  ): PermissionCheckResult {
    const permissionCheck = this.checkPermission('execute');
    if (!permissionCheck.allowed) {
      return permissionCheck;
    }

    const commandCheck = this.checkCommand(command);
    if (!commandCheck.allowed) {
      return commandCheck;
    }

    if (cwd) {
      const pathCheck = this.checkPath(cwd);
      if (!pathCheck.allowed) {
        return pathCheck;
      }
    }

    return { allowed: true };
  }

  /**
   * 获取允许的路径列表
   *
   * @returns 允许的路径列表
   */
  public getAllowedPaths(): string[] {
    return [...this.allowedPaths];
  }

  /**
   * 获取当前权限级别
   *
   * @returns 权限级别
   */
  public getPermissionLevel(): PermissionLevel {
    return this.permissionLevel;
  }

  /**
   * 获取危险模式列表
   *
   * @returns 正则表达式列表
   */
  public getDangerousPatterns(): RegExp[] {
    return [...this.dangerousPatterns];
  }

  /**
   * 更新允许的路径列表
   *
   * @param paths - 新的路径列表
   */
  public setAllowedPaths(paths: string[]): void {
    this.allowedPaths = paths.map((p) => path.resolve(p));
  }

  /**
   * 更新权限级别
   *
   * @param level - 新的权限级别
   */
  public setPermissionLevel(level: PermissionLevel): void {
    this.permissionLevel = level;
  }

  /**
   * 添加允许的路径
   *
   * @param newPath - 要添加的路径
   */
  public addAllowedPath(newPath: string): void {
    const resolved = path.resolve(newPath);
    if (!this.allowedPaths.includes(resolved)) {
      this.allowedPaths.push(resolved);
    }
  }

  /**
   * 移除允许的路径
   *
   * @param targetPath - 要移除的路径
   */
  public removeAllowedPath(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    this.allowedPaths = this.allowedPaths.filter((p) => p !== resolved);
  }

  /**
   * 添加危险命令模式
   *
   * @param pattern - 正则表达式模式
   */
  public addDangerousPattern(pattern: RegExp): void {
    this.dangerousPatterns.push(pattern);
  }

  /**
   * 转换为配置对象
   *
   * @returns 安全策略配置
   */
  public toConfig(): SecurityPolicyConfig {
    return {
      allowedPaths: this.getAllowedPaths(),
      permissionLevel: this.permissionLevel,
      dangerousPatterns: this.getDangerousPatterns(),
      allowNetwork: this.allowNetwork,
      allowedDomains: this.allowedDomains,
    };
  }
}

/**
 * 创建安全策略（便捷函数）
 *
 * @param config - 安全策略配置
 * @returns SecurityPolicy 实例
 */
export function createSecurityPolicy(
  config?: Partial<SecurityPolicyConfig>
): SecurityPolicy {
  return new SecurityPolicy(config);
}
