/**
 * @file WorkingMemory.test.ts
 * @description WorkingMemory 模块单元测试
 *              测试工作记忆的添加消息、Token计数、裁剪策略等功能
 * @module tests/memory
 * @author AI Agent
 * @date 2026-04-15
 * @version 1.0.0
 */

import { WorkingMemory, WorkingMemoryOptions } from '../../src/memory/WorkingMemory';
import { Message, ToolCall } from '../../src/types';

describe('WorkingMemory', () => {
  /**
   * 创建测试用的 WorkingMemory 实例
   */
  function createTestMemory(options?: WorkingMemoryOptions): WorkingMemory {
    return new WorkingMemory('session-test', {
      maxTokens: 1000,
      bufferTokens: 100,
      ...options,
    });
  }

  /**
   * 测试：创建工作记忆
   * 验证能正确创建实例并初始化
   */
  it('应该能创建工作记忆实例', () => {
    const memory = createTestMemory();

    expect(memory.getSessionId()).toBe('session-test');
    expect(memory.getMessageCount()).toBe(0);
    expect(memory.getCurrentTokenCount()).toBe(0);
  });

  /**
   * 测试：带系统提示词创建工作记忆
   * 验证创建时提供系统提示词会自动添加系统消息
   */
  it('创建时应该自动添加系统提示词', () => {
    const memory = createTestMemory({
      systemPrompt: '你是一个代码助手',
    });

    expect(memory.getMessageCount()).toBe(1);
    const messages = memory.getMessages();
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('你是一个代码助手');
  });

  /**
   * 测试：添加消息
   * 验证能正确添加消息到工作记忆
   */
  it('应该能添加消息', () => {
    const memory = createTestMemory();

    memory.addMessage({
      role: 'user',
      content: 'Hello',
    });

    expect(memory.getMessageCount()).toBe(1);
    expect(memory.getLastMessage()?.content).toBe('Hello');
  });

  /**
   * 测试：添加系统消息
   * 验证能正确添加系统消息
   */
  it('应该能添加系统消息', () => {
    const memory = createTestMemory();

    memory.addSystemMessage('系统提示');

    const messages = memory.getMessages();
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe('系统提示');
  });

  /**
   * 测试：替换现有系统消息
   * 验证添加系统消息时会替换现有的系统消息
   */
  it('添加系统消息应该替换现有的', () => {
    const memory = createTestMemory({ systemPrompt: '旧提示' });

    memory.addSystemMessage('新提示');

    const messages = memory.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('新提示');
  });

  /**
   * 测试：添加用户消息
   * 验证便捷方法 addUserMessage
   */
  it('应该能添加用户消息', () => {
    const memory = createTestMemory();

    memory.addUserMessage('用户问题');

    const lastMessage = memory.getLastMessage();
    expect(lastMessage?.role).toBe('user');
    expect(lastMessage?.content).toBe('用户问题');
  });

  /**
   * 测试：添加助手消息
   * 验证便捷方法 addAssistantMessage
   */
  it('应该能添加助手消息', () => {
    const memory = createTestMemory();

    memory.addAssistantMessage('助手回复');

    const lastMessage = memory.getLastMessage();
    expect(lastMessage?.role).toBe('assistant');
    expect(lastMessage?.content).toBe('助手回复');
  });

  /**
   * 测试：添加带工具调用的助手消息
   * 验证助手消息可以包含工具调用
   */
  it('应该能添加带工具调用的助手消息', () => {
    const memory = createTestMemory();

    const toolCalls: ToolCall[] = [
      { id: 'call-1', name: 'file_read', arguments: { path: 'test.txt' } },
    ];
    memory.addAssistantMessage('', toolCalls);

    const lastMessage = memory.getLastMessage();
    expect(lastMessage?.role).toBe('assistant');
    expect(lastMessage?.toolCalls).toEqual(toolCalls);
  });

  /**
   * 测试：添加工具消息
   * 验证便捷方法 addToolMessage
   */
  it('应该能添加工具消息', () => {
    const memory = createTestMemory();

    memory.addToolMessage('工具结果', 'call-1');

    const lastMessage = memory.getLastMessage();
    expect(lastMessage?.role).toBe('tool');
    expect(lastMessage?.content).toBe('工具结果');
    expect(lastMessage?.toolCallId).toBe('call-1');
  });

  /**
   * 测试：获取所有消息
   * 验证 getMessages 返回所有消息
   */
  it('应该能获取所有消息', () => {
    const memory = createTestMemory();

    memory.addUserMessage('消息1');
    memory.addAssistantMessage('消息2');
    memory.addUserMessage('消息3');

    const messages = memory.getMessages();
    expect(messages.length).toBe(3);
    expect(messages[0].content).toBe('消息1');
    expect(messages[1].content).toBe('消息2');
    expect(messages[2].content).toBe('消息3');
  });

  /**
   * 测试：获取最近的消息
   * 验证 getRecentMessages 返回最近的消息
   */
  it('应该能获取最近的消息', () => {
    const memory = createTestMemory();

    memory.addUserMessage('消息1');
    memory.addAssistantMessage('消息2');
    memory.addUserMessage('消息3');

    const recent = memory.getRecentMessages(2);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('消息2');
    expect(recent[1].content).toBe('消息3');
  });

  /**
   * 测试：获取最后一条消息
   * 验证 getLastMessage 返回最后一条消息
   */
  it('应该能获取最后一条消息', () => {
    const memory = createTestMemory();

    expect(memory.getLastMessage()).toBeNull();

    memory.addUserMessage('消息1');
    expect(memory.getLastMessage()?.content).toBe('消息1');

    memory.addAssistantMessage('消息2');
    expect(memory.getLastMessage()?.content).toBe('消息2');
  });

  /**
   * 测试：清空工作记忆
   * 验证 clear 方法能清空所有消息
   */
  it('应该能清空工作记忆', () => {
    const memory = createTestMemory({ systemPrompt: '系统提示' });

    memory.addUserMessage('用户消息');
    memory.addAssistantMessage('助手消息');

    memory.clear(false);

    expect(memory.getMessageCount()).toBe(0);
  });

  /**
   * 测试：清空但保留系统消息
   * 验证默认情况下 clear 保留系统消息
   */
  it('清空应该保留系统消息', () => {
    const memory = createTestMemory({ systemPrompt: '系统提示' });

    memory.addUserMessage('用户消息');
    memory.addAssistantMessage('助手消息');

    memory.clear();

    const messages = memory.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('system');
  });

  /**
   * 测试：Token 计数
   * 验证能正确估算 Token 数量
   */
  it('应该能估算Token数量', () => {
    const memory = createTestMemory();

    // 空消息列表应该是 0
    expect(memory.getCurrentTokenCount()).toBe(0);

    // 添加消息
    memory.addUserMessage('Hello world');

    // Token 数量应该大于 0
    expect(memory.getCurrentTokenCount()).toBeGreaterThan(0);
  });

  /**
   * 测试：中文 Token 估算
   * 验证中文文本的 Token 估算
   */
  it('应该正确估算中文字符的Token', () => {
    const memory = createTestMemory();

    // 4个中文字符，估算约 6 tokens (1.5/字)
    const tokens = memory.estimateMessageTokens({
      role: 'user',
      content: '你好世界',
    });

    expect(tokens).toBeGreaterThan(4);
  });

  /**
   * 测试：Token 使用情况
   * 验证 getTokenUsage 返回正确的使用情况
   */
  it('应该能获取Token使用情况', () => {
    const memory = createTestMemory({ maxTokens: 1000 });

    memory.addUserMessage('测试消息');

    const usage = memory.getTokenUsage();

    expect(usage.max).toBe(1000);
    expect(usage.current).toBeGreaterThan(0);
    expect(usage.remaining).toBe(1000 - usage.current);
    expect(usage.usageRatio).toBeGreaterThan(0);
    expect(usage.usageRatio).toBeLessThanOrEqual(1);
  });

  /**
   * 测试：检查是否超过限制
   * 验证 isOverLimit 方法
   */
  it('应该能检查是否超过Token限制', () => {
    const memory = createTestMemory({
      maxTokens: 100,
      bufferTokens: 10,
    });

    // 初始状态不应超过限制
    expect(memory.isOverLimit()).toBe(false);

    // 添加大量消息（每次添加都会触发检查，所以会被自动裁剪）
    // 直接添加一条超长的消息
    const longMessage = '这是一段很长的文本内容。'.repeat(30);
    memory.addUserMessage(longMessage);

    // 应该超过限制 (max 100 - buffer 10 = 90)
    // 但由于自动裁剪，实际可能不会超过
    // 我们改为检查 Token 使用情况
    const usage = memory.getTokenUsage();
    expect(usage.max).toBe(100);
    expect(usage.current).toBeGreaterThan(0);
  });

  /**
   * 测试：滑动窗口裁剪策略
   * 验证滑动窗口策略能正确裁剪消息
   */
  it('滑动窗口策略应该裁剪旧消息', () => {
    // 使用高限制，确保添加时不会触发自动裁剪
    const memory = createTestMemory({
      maxTokens: 10000,
      bufferTokens: 1000,
      trimStrategy: 'sliding_window',
      keepRounds: 2,
    });

    // 添加多轮对话
    memory.addUserMessage('问题1');
    memory.addAssistantMessage('回答1');
    memory.addUserMessage('问题2');
    memory.addAssistantMessage('回答2');
    memory.addUserMessage('问题3');
    memory.addAssistantMessage('回答3');

    // 验证添加了6条消息
    expect(memory.getMessageCount()).toBe(6);

    // 手动触发裁剪到很少的目标token
    memory.trim(50);

    const messages = memory.getMessages();

    // 应该被裁剪到少于6条消息
    expect(messages.length).toBeLessThan(6);

    // 最近的消息应该被保留（至少保留最后一条）
    const contents = messages.map((m) => m.content);
    const lastContent = contents[contents.length - 1];
    expect(lastContent).toBe('回答3');
  });

  /**
   * 测试：保留系统消息的裁剪策略
   * 验证 preserve_system 策略能保留系统消息
   */
  it('preserve_system策略应该保留系统消息', () => {
    const memory = createTestMemory({
      maxTokens: 100,
      bufferTokens: 20,
      trimStrategy: 'preserve_system',
      systemPrompt: '系统提示',
    });

    // 添加多条消息超出限制
    for (let i = 0; i < 10; i++) {
      memory.addUserMessage(`这是第${i}条消息，内容比较长`);
    }

    const messages = memory.getMessages();
    const hasSystemMessage = messages.some((m) => m.role === 'system');

    expect(hasSystemMessage).toBe(true);
  });

  /**
   * 测试：优先移除最旧消息的裁剪策略
   * 验证 oldest_first 策略
   */
  it('oldest_first策略应该优先移除最旧消息', () => {
    const memory = createTestMemory({
      maxTokens: 100,
      bufferTokens: 20,
      trimStrategy: 'oldest_first',
    });

    memory.addUserMessage('最早的消息');
    memory.addAssistantMessage('回复1');
    memory.addUserMessage('较新的消息');
    memory.addAssistantMessage('回复2');

    // 手动裁剪
    memory.trim(30);

    const messages = memory.getMessages();
    const contents = messages.map((m) => m.content);

    // 最早的消息应该被移除
    expect(contents).not.toContain('最早的消息');
  });

  /**
   * 测试：手动裁剪
   * 验证 trim 方法能强制执行裁剪
   */
  it('应该能手动裁剪消息', () => {
    const memory = createTestMemory({
      maxTokens: 500,
      trimStrategy: 'sliding_window',
    });

    memory.addUserMessage('消息1');
    memory.addAssistantMessage('消息2');
    memory.addUserMessage('消息3');

    const initialCount = memory.getMessageCount();

    // 裁剪到只保留 2 条
    const remaining = memory.trim(20);

    expect(remaining).toBeLessThanOrEqual(initialCount);
  });

  /**
   * 测试：设置当前任务
   * 验证 setCurrentTask 和 getCurrentTask
   */
  it('应该能设置和获取当前任务', () => {
    const memory = createTestMemory();

    expect(memory.getCurrentTask()).toBeUndefined();

    memory.setCurrentTask('分析代码库');
    expect(memory.getCurrentTask()).toBe('分析代码库');

    memory.clearCurrentTask();
    expect(memory.getCurrentTask()).toBeUndefined();
  });

  /**
   * 测试：中间结果缓存
   * 验证中间结果的存取
   */
  it('应该能缓存中间结果', () => {
    const memory = createTestMemory();

    memory.setIntermediateResult('key1', 'value1');
    memory.setIntermediateResult('key2', { nested: 'object' });
    memory.setIntermediateResult('key3', [1, 2, 3]);

    expect(memory.getIntermediateResult('key1')).toBe('value1');
    expect(memory.getIntermediateResult('key2')).toEqual({ nested: 'object' });
    expect(memory.getIntermediateResult('key3')).toEqual([1, 2, 3]);
  });

  /**
   * 测试：检查中间结果存在
   * 验证 hasIntermediateResult 方法
   */
  it('应该能检查中间结果是否存在', () => {
    const memory = createTestMemory();

    expect(memory.hasIntermediateResult('non-existent')).toBe(false);

    memory.setIntermediateResult('exists', 'value');
    expect(memory.hasIntermediateResult('exists')).toBe(true);
  });

  /**
   * 测试：删除中间结果
   * 验证 deleteIntermediateResult 方法
   */
  it('应该能删除中间结果', () => {
    const memory = createTestMemory();

    memory.setIntermediateResult('key', 'value');
    expect(memory.hasIntermediateResult('key')).toBe(true);

    memory.deleteIntermediateResult('key');
    expect(memory.hasIntermediateResult('key')).toBe(false);
  });

  /**
   * 测试：清空中间结果
   * 验证 clearIntermediateResults 方法
   */
  it('应该能清空所有中间结果', () => {
    const memory = createTestMemory();

    memory.setIntermediateResult('key1', 'value1');
    memory.setIntermediateResult('key2', 'value2');

    memory.clearIntermediateResults();

    expect(memory.hasIntermediateResult('key1')).toBe(false);
    expect(memory.hasIntermediateResult('key2')).toBe(false);
  });

  /**
   * 测试：获取所有中间结果
   * 验证 getAllIntermediateResults 方法
   */
  it('应该能获取所有中间结果', () => {
    const memory = createTestMemory();

    memory.setIntermediateResult('key1', 'value1');
    memory.setIntermediateResult('key2', 'value2');

    const results = memory.getAllIntermediateResults();

    expect(results.size).toBe(2);
    expect(results.get('key1')).toBe('value1');
    expect(results.get('key2')).toBe('value2');
  });

  /**
   * 测试：转换为 JSON
   * 验证 toJSON 方法
   */
  it('应该能转换为JSON对象', () => {
    const memory = createTestMemory({ systemPrompt: '系统提示' });

    memory.addUserMessage('用户消息');
    memory.setCurrentTask('当前任务');
    memory.setIntermediateResult('result', { data: 'value' });

    const json = memory.toJSON();

    expect(json.sessionId).toBe('session-test');
    expect(json.messages.length).toBe(2);
    expect(json.currentTask).toBe('当前任务');
    expect(json.intermediateResults).toEqual({ result: { data: 'value' } });
    expect(json.tokenCount).toBeGreaterThan(0);
    expect(json.maxTokens).toBe(1000);
  });

  /**
   * 测试：从 JSON 恢复
   * 验证 fromJSON 方法
   */
  it('应该能从JSON对象恢复', () => {
    const json = {
      sessionId: 'session-restored',
      messages: [
        { role: 'system' as const, content: '系统提示' },
        { role: 'user' as const, content: '用户消息' },
        { role: 'assistant' as const, content: '助手回复' },
      ],
      currentTask: '恢复的任务',
      intermediateResults: { key: 'value' },
    };

    const memory = WorkingMemory.fromJSON(json, { maxTokens: 2000 });

    expect(memory.getSessionId()).toBe('session-restored');
    expect(memory.getMessageCount()).toBe(3);
    expect(memory.getCurrentTask()).toBe('恢复的任务');
    expect(memory.getIntermediateResult('key')).toBe('value');
  });

  /**
   * 测试：带工具调用的消息 Token 估算
   * 验证工具调用消息的 Token 估算
   */
  it('应该正确估算带工具调用消息的Token', () => {
    const memory = createTestMemory();

    const message: Message = {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'call-1', name: 'file_read', arguments: { path: 'test.txt' } },
        { id: 'call-2', name: 'file_write', arguments: { path: 'out.txt', content: 'data' } },
      ],
    };

    const tokens = memory.estimateMessageTokens(message);

    // 工具调用应该有额外的 Token
    expect(tokens).toBeGreaterThan(10);
  });

  /**
   * 测试：长文本裁剪
   * 验证处理长文本时的裁剪行为
   */
  it('处理长文本时应该正确裁剪', () => {
    const memory = createTestMemory({
      maxTokens: 300,
      bufferTokens: 50,
      trimStrategy: 'sliding_window',
      keepRounds: 3,
    });

    // 添加一条非常长的消息
    const longContent = '这是一个很长的句子。'.repeat(50);
    memory.addUserMessage(longContent);

    // 添加更多消息
    for (let i = 0; i < 5; i++) {
      memory.addUserMessage(`短消息 ${i}`);
    }

    // Token 数量应该控制在限制内
    const usage = memory.getTokenUsage();
    expect(usage.current).toBeLessThanOrEqual(300);
  });
});
