#!/usr/bin/env node

/**
 * Implementer — 协调分析→分支→编码→测试→审查→合并的完整流程
 *
 * 这个脚本是协调层，实际编码由 Claude Agent 完成。
 * 本脚本负责：
 *   1. 从 candidates.json 选择要实现的特性
 *   2. 读取源项目的 README/源码
 *   3. 创建 git 分支
 *   4. 调用 Claude Agent 实现（通过 claude -p）
 *   5. 运行测试验证
 *   6. 审查代码
 *   7. 合并到 master
 *   8. 更新进化日志 + 左脑记忆
 *
 * 用法：
 *   node implementer.js implement <index>    # 实现指定索引的候选
 *   node implementer.js implement-all        # 实现所有 adopt 候选
 *   node implementer.js rollback <branch>    # 回滚分支
 *   node implementer.js status               # 查看实现状态
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ── 配置 ──────────────────────────────────────────────

const WORKSPACE_ROOT = path.join(__dirname, '..', '..')
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data', 'github')
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json')
const EVOLVED_FEATURES_FILE = path.join(DATA_DIR, 'evolved-features.json')
const EVOLUTION_LOG_FILE = path.join(DATA_DIR, 'evolution-log.json')
const FEATURES_DIR = path.join(WORKSPACE_ROOT, 'features')

function today() {
  return new Date().toISOString().slice(0, 10)
}

function now() {
  return new Date().toISOString()
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadCandidates() {
  try {
    return JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'))
  } catch {
    return { candidates: [] }
  }
}

function loadEvolutionLog() {
  try {
    return JSON.parse(fs.readFileSync(EVOLUTION_LOG_FILE, 'utf8'))
  } catch {
    return { entries: [] }
  }
}

function saveEvolutionLog(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(EVOLUTION_LOG_FILE, JSON.stringify(data, null, 2))
}

function loadEvolvedFeatures() {
  try {
    return JSON.parse(fs.readFileSync(EVOLVED_FEATURES_FILE, 'utf8'))
  } catch {
    return { features: [] }
  }
}

function saveEvolvedFeatures(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(EVOLVED_FEATURES_FILE, JSON.stringify(data, null, 2))
}

// ── Git 操作 ──────────────────────────────────────────

function gitExec(cmd) {
  return execSync(cmd, { cwd: WORKSPACE_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim()
}

function getCurrentBranch() {
  return gitExec('git branch --show-current')
}

function hasUncommittedChanges() {
  try {
    const status = gitExec('git status --porcelain')
    return status.length > 0
  } catch {
    return false
  }
}

function createBranch(name) {
  const safeName = name.replace(/[^a-zA-Z0-9-]/g, '-')
  const branchName = `evolution/${safeName}-${today()}`

  if (hasUncommittedChanges()) {
    console.log('  ⚠ 有未提交的改动，先 stash')
    gitExec('git stash')
  }

  gitExec(`git checkout -b ${branchName}`)
  return branchName
}

function mergeBranch(branchName) {
  gitExec('git checkout master')
  try {
    gitExec(`git merge ${branchName} --no-ff -m "合并: ${branchName}"`)
    return true
  } catch (err) {
    console.error(`  ❌ 合并失败: ${err.message}`)
    return false
  }
}

function deleteBranch(branchName) {
  try {
    gitExec(`git branch -D ${branchName}`)
  } catch {
    // 分支不存在就跳过
  }
}

// ── 测试 ──────────────────────────────────────────────

function runTests() {
  console.log('  🧪 运行测试...')
  try {
    execSync('npm test', { cwd: WORKSPACE_ROOT, encoding: 'utf8', stdio: 'pipe' })
    console.log('  ✅ 测试全部通过')
    return true
  } catch (err) {
    console.error('  ❌ 测试失败:')
    const output = err.stdout || err.message
    // 只输出最后 20 行
    const lines = output.split('\n')
    console.error(lines.slice(-20).join('\n'))
    return false
  }
}

// ── 特性实现目录 ──────────────────────────────────────

function createFeatureDir(name, repo) {
  const dirName = name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
  const featureDir = path.join(FEATURES_DIR, dirName)
  ensureDir(featureDir)

  // 写入 README
  const readme = `# ${name}

> 来源: https://github.com/${repo.full_name || repo.name}
> 实现时间: ${today()}
> 综合分: ${repo.composite_score || 'N/A'}/10

## 描述

${repo.description || '无描述'}

## 实现计划

- [ ] 分析原始代码
- [ ] 设计适配方案
- [ ] 实现核心功能
- [ ] 编写测试
- [ ] 编写文档

## 来源信息

\`\`\`json
${JSON.stringify({
    name: repo.full_name || repo.name,
    stars: repo.stars || repo.stargazers_count,
    language: repo.language,
    topics: repo.topics,
  }, null, 2)}
\`\`\`
`
  fs.writeFileSync(path.join(featureDir, 'README.md'), readme)

  return featureDir
}

// ── 实现单个候选 ──────────────────────────────────────

async function implementCandidate(candidate, index) {
  console.log(`\n🔧 实现候选 #${index + 1}: ${candidate.name}`)
  console.log('='.repeat(50))

  const featureName = candidate.name.split('/').pop()

  // 1. 创建特性目录
  const featureDir = createFeatureDir(featureName, candidate)
  console.log(`  📁 特性目录: ${featureDir}`)

  // 2. 创建 git 分支
  const branchName = createBranch(featureName)
  console.log(`  🌿 分支: ${branchName}`)

  try {
    // 3. 生成实现 prompt
    const prompt = generateImplementationPrompt(candidate, featureDir)
    console.log('  📝 生成实现 prompt...')

    // 4. 调用 Claude Agent 实现
    console.log('  🤖 调用 Claude Agent 实现...')
    console.log('  （需要在 Claude Code 会话中手动执行）')
    console.log('  或使用: claude -p --dangerously-skip-permissions')

    // 5. 写入 prompt 文件供手动执行
    const promptFile = path.join(featureDir, 'IMPLEMENT-PROMPT.md')
    fs.writeFileSync(promptFile, prompt)
    console.log(`  📄 Prompt 文件: ${promptFile}`)

    // 6. 记录状态
    logImplementation(featureName, candidate, branchName, 'pending')

    console.log('\n  ✅ 实现准备完成')
    console.log('  下一步：')
    console.log(`    1. 阅读 ${promptFile}`)
    console.log(`    2. 在 Claude Code 中执行实现`)
    console.log(`    3. 运行 npm test 验证`)
    console.log(`    4. 合并: git checkout master && git merge ${branchName}`)

    return { success: true, branch: branchName, featureDir }
  } catch (err) {
    console.error(`  ❌ 实现失败: ${err.message}`)
    // 回滚
    gitExec('git checkout master')
    deleteBranch(branchName)
    return { success: false, error: err.message }
  }
}

// ── 生成实现 Prompt ──────────────────────────────────

function generateImplementationPrompt(candidate, featureDir) {
  return `# 实现 Prompt: ${candidate.name}

## 任务

基于 GitHub 项目 https://github.com/${candidate.name} 的思路，为 AiCode 工作空间实现一个新特性。

## 项目信息

- **名称**: ${candidate.name}
- **Stars**: ${candidate.stars || '?'}
- **描述**: ${candidate.description || '无描述'}
- **语言**: ${candidate.language || 'unknown'}
- **综合评分**: ${candidate.composite_score}/10
- **建议**: ${candidate.suggestion}

## 实现要求

1. **零依赖优先** — 尽量用 Node.js 内置模块
2. **复用现有基础设施** — 左脑记忆、调度器、MCP 等
3. **必须有测试** — 在 scripts/evolution/test-*.js 中添加
4. **必须有文档** — 更新 README 和/或最佳实践文档
5. **代码风格** — 与现有代码保持一致（注释风格、命名规范）

## 输出位置

- 代码: ${featureDir}/
- 测试: scripts/evolution/test-*.js
- 文档: ${featureDir}/README.md

## 安全约束

- ⛔ 不删除现有文件
- ⛔ 不修改 dispatcher.js 核心逻辑
- ✅ 必须通过 npm test

## 参考

先读取这些文件了解项目结构：
- CLAUDE.md（启动导航）
- 01_AI-ClaudeCode-最佳实践精简.md（行为规范）
- scripts/evolution/github-scanner.js（现有实现）
- scripts/evolution/feature-analyzer.js（评估逻辑）

然后读取原始项目的 README：
- https://github.com/${candidate.name}
`
}

// ── 记录实现状态 ──────────────────────────────────────

function logImplementation(name, candidate, branch, status) {
  const log = loadEvolutionLog()
  log.entries.push({
    date: today(),
    timestamp: now(),
    action: 'implement',
    feature: name,
    repo: candidate.name,
    branch,
    status,
    composite_score: candidate.composite_score,
  })
  saveEvolutionLog(log)
}

// ── 标记已实现 ──────────────────────────────────────

function markAsEvolved(name, sourceRepo, branch) {
  const features = loadEvolvedFeatures()
  features.features.push({
    feature: name,
    source_repo: sourceRepo,
    implemented_at: today(),
    github_keywords: [],
    last_checked: today(),
    status: 'current',
    alternatives_found: [],
    branch,
  })
  saveEvolvedFeatures(features)
}

// ── 回滚 ──────────────────────────────────────────

function rollback(branchName) {
  console.log(`\n🔄 回滚分支: ${branchName}`)

  if (hasUncommittedChanges()) {
    gitExec('git stash')
  }

  gitExec('git checkout master')
  deleteBranch(branchName)

  console.log(`  ✅ 已回滚，分支 ${branchName} 已删除`)
}

// ── 状态 ──────────────────────────────────────────

function status() {
  const features = loadEvolvedFeatures()
  const log = loadEvolutionLog()

  console.log('\n📊 进化实现状态：')
  console.log('='.repeat(50))
  console.log(`  已实现特性: ${features.features.length}`)
  console.log(`  进化记录: ${log.entries.length}`)

  if (features.features.length > 0) {
    console.log('\n  已实现：')
    for (const f of features.features) {
      console.log(`    ✅ ${f.feature} (from ${f.source_repo})`)
    }
  }

  // 当前分支
  const currentBranch = getCurrentBranch()
  if (currentBranch !== 'master') {
    console.log(`\n  ⚠ 当前在分支: ${currentBranch}`)
  }
}

// ── CLI ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0] || 'status'

  switch (cmd) {
    case 'implement': {
      const index = parseInt(args[1]) - 1
      const data = loadCandidates()
      if (!data.candidates || index < 0 || index >= data.candidates.length) {
        console.error('❌ 无效的索引，用: node implementer.js implement <1-based-index>')
        process.exit(1)
      }
      await implementCandidate(data.candidates[index], index)
      break
    }

    case 'implement-all': {
      const data = loadCandidates()
      const adoptable = (data.candidates || []).filter(c => c.suggestion === 'adopt')
      if (adoptable.length === 0) {
        console.log('⚠ 没有 adopt 候选')
        return
      }
      console.log(`🚀 实现 ${adoptable.length} 个 adopt 候选...`)
      for (const [i, c] of adoptable.entries()) {
        await implementCandidate(c, i)
      }
      break
    }

    case 'rollback': {
      const branchName = args[1]
      if (!branchName) {
        console.error('❌ 请指定分支名: node implementer.js rollback <branch>')
        process.exit(1)
      }
      rollback(branchName)
      break
    }

    case 'status':
      status()
      break

    default:
      console.log(`
AiCode 进化实现引擎 v1.0

用法：
  node implementer.js implement <index>    # 实现指定候选
  node implementer.js implement-all        # 实现所有 adopt
  node implementer.js rollback <branch>    # 回滚分支
  node implementer.js status               # 查看状态
`)
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行失败:', err.message)
    process.exit(1)
  })
}

module.exports = { implementCandidate, rollback, status, markAsEvolved }
