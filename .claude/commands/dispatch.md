---
name: dispatch
description: 智能派发子代理 - 自动分析任务复杂度，按需派 1-3 个 Agent 并行执行
---

# /dispatch <任务描述>

根据用户输入的任务描述，**自动决定是否派子代理**，按需并行执行。

## 执行流程

### 第 1 步：跑规则引擎判断

```bash
node H:/AI-han/AiCode/scripts/orchestrator/dispatcher.js "<用户原始任务>"
```

读取输出 JSON 中的 `dispatch` 和 `agents` 字段。

### 第 2 步：根据决策执行

#### 情况 A：`dispatch=true, agents=2`（最常见）

并行派 2 个 Explore 子代理（互不阻塞）：

**Agent 1: 代码/技术层**
```
Agent(subagent_type="Explore", prompt="
作为代码分析专家，排查以下任务的 ${TASK}：
- 重点查看相关源代码文件
- 用 Glob/Grep 定位关键路径
- 输出可疑代码片段（带行号）
- 给出修复建议
")
```

**Agent 2: 数据/配置/环境层**
```
Agent(subagent_type="Explore", prompt="
作为数据/配置分析专家，排查以下任务的 ${TASK}：
- 检查 .env / 配置文件
- 检查数据库表结构 / 缓存配置
- 检查 API 接口规范
- 输出问题清单（带证据）
")
```

#### 情况 B：`dispatch=true, agents=3`（大型任务）

并行派 3 个 Explore 子代理：
1. **代码层** - 源码分析
2. **数据层** - 数据库/缓存
3. **环境层** - 配置/部署/依赖

#### 情况 C：`dispatch=false, agents=0`（不派）

主会话直接处理，不派子代理。节省成本。

#### 情况 D：`dispatch=null`（灰区）

主会话自行判断。**默认保守派 1-2 个 Agent**（你已设定"成本敏感度低，先看效果"）。

### 第 3 步：汇总输出

所有子代理完工后，主会话**整合结果**：
- 列出每个 Agent 的关键发现
- 标注 Agent 间互相印证的结论
- 给出统一的修复建议 / 行动清单
- 估算耗时提升（与串行对比）

## 约束

- 最多派 **3 个** Agent（用户设定）
- 子代理默认用 **Explore 类型**（只读，安全）
- 不修改任何文件
- 不使用 Bash 执行写操作
- 输出中文

## 使用示例

```
/dispatch 排查订单添加菜品失败 BUG
/dispatch 全面重构 UserService 的缓存逻辑
/dispatch 实现完整的用户登录功能（全栈）
/dispatch 解释下 Java 的 CountDownLatch
```

前 3 个会派 Agent 并行执行；第 4 个（解释类）由主会话直接答。

## 关联文档

- 规则引擎源码：`scripts/orchestrator/dispatcher.js`
- 测试用例：`scripts/orchestrator/test-dispatcher.js`（12/12 通过）
- PreToolUse 钩子：`scripts/orchestrator/hooks/dispatch-decision.js`
- 决策指南：`scripts/orchestrator/决策指南.md`