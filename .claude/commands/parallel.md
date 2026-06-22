---
name: parallel
description: 强制并行派 N 个 Agent（跳过 Layer 1 决策）
---

# /parallel <数量> <任务>

**强制**派指定数量的 Agent 并行执行，**跳过规则判断**。适合明确知道要并行的场景。

## 用法

```
/parallel 3 排查订单系统的整体架构问题
/parallel 2 分析前端登录页和后端认证接口的安全性
/parallel 4 同时分析四个核心模块
```

## 执行流程

### 第 1 步：解析参数

从用户输入中提取：
- `N` = 要派的 Agent 数量（1-5）
- `TASK` = 任务描述

如果 N 超出 1-5 范围 → 报错并退出。

### 第 2 步：派 N 个 Agent 并行

**标准模板**（按 Agent 编号分配职责）：

#### Agent 1: 顶层/架构层

```
Agent(subagent_type="Explore", prompt="
作为架构分析师，排查任务的【架构层面】：

任务: {TASK}
要求:
- 关注整体结构、模块划分、技术选型
- 不深入单个文件细节
- 输出架构图（文字版）+ 关键决策点

⚠️ Read/Glob/Grep only，输出中文
")
```

#### Agent 2: 代码层

```
Agent(subagent_type="Explore", prompt="
作为代码分析专家，排查任务的【代码层面】：

任务: {TASK}
要求:
- 重点查看源代码、API 实现
- 列出关键代码片段（带行号）
- 给出修复建议

⚠️ Read/Glob/Grep only，输出中文
")
```

#### Agent 3: 数据层

```
Agent(subagent_type="Explore", prompt="
作为数据/配置分析专家，排查任务的【数据层面】：

任务: {TASK}
要求:
- 检查数据库表结构、缓存配置、.env
- 检查 ORM 映射、迁移脚本
- 输出问题清单

⚠️ Read/Glob/Grep only，输出中文
")
```

#### Agent 4: 环境/部署层

```
Agent(subagent_type="Explore", prompt="
作为环境分析专家，排查任务的【环境层面】：

任务: {TASK}
要求:
- 检查部署配置、Docker、CI/CD
- 检查依赖版本、Node/Java 版本
- 输出环境问题清单

⚠️ Read/Glob/Grep only，输出中文
")
```

#### Agent 5: 安全/性能层

```
Agent(subagent_type="Explore", prompt="
作为安全/性能分析专家，排查任务的【安全/性能层面】：

任务: {TASK}
要求:
- 检查权限控制、SQL 注入、XSS
- 检查 N+1 查询、慢 SQL、内存泄漏
- 输出安全/性能问题清单

⚠️ Read/Glob/Grep only，输出中文
")
```

**灵活分配**：用户可以在输入中指定每个 Agent 的具体职责。

### 第 3 步：汇总输出

```
=== /parallel {N} 完成 ===
耗时: ~{X} 秒
Agent 数: {N}

## Agent 1（{职责}）关键发现
- ...

## Agent 2（{职责}）关键发现
- ...

## 互相印证
- Agent 1 和 Agent 2 都提到 X → 高置信度

## 修复建议优先级
1. P0: ...
2. P1: ...
3. P2: ...
```

## 与 /dispatch 的区别

| 维度 | /dispatch | /parallel |
|:-----|:----------|:----------|
| 决策 | 自动（规则引擎判断） | 手动（用户指定 N） |
| Agent 数量 | 1-3（自动） | 1-5（手动） |
| 适用 | 不确定要不要并行 | 确定要并行 |
| 成本风险 | 低（智能控制） | 高（强制派） |

## 注意事项

- ⚠️ 强制派 N 个 Agent 会**显著增加 Token 消耗**（每个 Agent 独立 context）
- ⚠️ 派太多会造成"重复劳动"（多个 Agent 看同一块代码）
- 建议先用 `/dispatch`（自动决策），确认要并行再用 `/parallel`（手动控制）