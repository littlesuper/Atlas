# Codex 继续执行：Atlas 测试覆盖增强

## 任务目标

继续为 Atlas 项目增加单元测试覆盖率。当前基线：

- **Server**: 116 test files, **4322 tests**
- **Client**: 49 test files, **1716 tests**
- **Total**: **6038 tests** (server 4322 + client 1716)

## 项目信息

- 项目根目录: `/Users/macbot/PlayCode/Atlas`
- 这是一个 npm workspaces monorepo（React + Express + TypeScript）
- 详见 `AGENTS.md` 了解完整技术栈和规范

## 执行步骤

### 1. 验证基线

```bash
cd /Users/macbot/PlayCode/Atlas/server && npx vitest run 2>&1 | grep 'Tests'
cd /Users/macbot/PlayCode/Atlas/client && npx vitest run 2>&1 | grep 'Tests'
```

确认 server 4322 + client 1716 = 6038 全部通过。

### 2. Boost 测试（循环执行）

每个 batch 的流程：

1. 找出所有 ≤N tests 的文件（N 从 80 开始递增）：
```bash
# Server
cd /Users/macbot/PlayCode/Atlas/server && for f in $(find src -name '*.test.ts' | sort); do count=$(grep -c '^\s*it(' "$f" 2>/dev/null || echo 0); if [ "$count" -le 90 ]; then echo "$count $f"; fi; done

# Client
cd /Users/macbot/PlayCode/Atlas/client && for f in $(find src -name '*.test.*' | sort); do count=$(grep -c '^\s*it(' "$f" 2>/dev/null || echo 0); if [ "$count" -le 90 ]; then echo "$count $f"; fi; done
```

2. 对每个文件：
   - 读取对应的源文件（.ts/.tsx）了解实现
   - 读取测试文件了解已有测试模式
   - 在 `describe` 块的最后一个 `it(...)` 之后、闭合的 `});` 之前，添加 1 个新的边界用例测试
   - **不要修改源文件**
   - **不要添加注释**

3. 运行验证：
```bash
cd /Users/macbot/PlayCode/Atlas/server && npx vitest run
cd /Users/macbot/PlayCode/Atlas/client && npx vitest run
```

### 3. 更新进度看板

每次 batch 完成后更新 `atlas-quality-system/PROJECT_PROGRESS.md`：

- 在 `## 5. 最近验证证据` 的表格末尾添加今天的验证行
- 在 `## 7. 变更日志` 的表格末尾添加今天的变更行
- 更新 `**当前日期**` 为今天的日期
- 运行 progress guard 确认 READY：
```bash
cd /Users/macbot/PlayCode/Atlas && npm run quality:progress-guard --workspace=server -- --min-week8-progress=100 --evidence="<server_count> tests" --evidence="<client_count> tests" --evidence="ESLint 0 warnings" --changelog="batch <N>"
```

### 4. 循环

重复步骤 2-3，每次提升阈值（80 → 90 → 100 → 110 → ...），直到达到目标测试数量。

## 测试编写规则

1. **导入**: 始终显式导入 `import { describe, it, expect, vi, beforeEach } from 'vitest';`
2. **无注释**: 不添加任何代码注释
3. **模式**: 遵循每个文件已有的测试模式（describe/it 结构、mock 方式、断言风格）
4. **边界用例类型**:
   - 空输入（null, undefined, '', [], {}）
   - 超长字符串（10000+ 字符）
   - 特殊字符（emoji, Unicode, HTML 标签）
   - 边界数值（0, -1, MAX_SAFE_INTEGER, NaN）
   - 错误路径（数据库错误、网络错误、权限不足）
   - 状态转换边界（已删除 → 更新、已关闭 → 重开）

## 已知注意事项

- `server/src/routes/activities.test.ts` 有 ECONNRESET 间歇性 flaky test（非阻塞，rerun 即过）
- `server/src/routes/templates.test.ts` 同样有间歇性 flaky
- `client/src/hooks/useDragReorder.ts` 有一个 pre-existing unhandled rejection（非测试失败）
- ESLint 有 65 个 pre-existing warnings（`no-explicit-any` + `no-unused-vars`），均来自 mock 和测试代码，非新引入
- `npm run lint` 因为 `--max-warnings=0` 会报错退出，但 warnings 都是 pre-existing 的
- progress guard 要求 `**当前日期**` 行与运行日期一致

## 关键文件

- 进度看板: `atlas-quality-system/PROJECT_PROGRESS.md`
- 项目规范: `AGENTS.md`
- Server 测试: `server/src/**/*.test.ts`
- Client 测试: `client/src/**/*.test.*`
- Progress guard 脚本: `server/src/scripts/checkQualityProgressGuard.ts`

## 目标

持续 boost，每个 batch 目标 +100~160 tests，目标达到 **7000+ tests**。
