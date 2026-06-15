# [BUG] 风险等级「极高」被归一化为 MEDIUM（应为 CRITICAL）——最高级别风险遭降级

- 严重度：P1（test-plan AI-007 为 P1；风险分级错误，直接影响风险评估输出与告警）
- 发现者：GLM QA
- 日期：2026-06-15
- 模块：riskPrompts（`validateRiskLevel`）

## 复现步骤

`server/src/utils/riskPrompts.ts:204-211`：

```ts
export function validateRiskLevel(level?: string): string {
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const upper = level?.toUpperCase?.() || '';
  if (valid.includes(upper)) return upper;
  // Chinese fallback
  const cnMap: Record<string, string> = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '严重': 'CRITICAL' };
  return level ? cnMap[level] || 'MEDIUM' : 'MEDIUM';
}
```

`cnMap` 覆盖「低/中/高/严重」，但**不含「极高」**。AI 评估返回中文 `极高` 时：
- `upper = '极高'.toUpperCase()` = `'极高'`（中文不变）→ 不在 `valid` 英文枚举。
- `cnMap['极高']` = `undefined` → `|| 'MEDIUM'` → 返回 `'MEDIUM'`。

## 期望行为

test-plan **AI-007**（P1）：severity 中文「极高」→ `CRITICAL`。

## 实际行为

`validateRiskLevel('极高')` → `'MEDIUM'`。**最高级别风险被降级成中等**。

## 影响面

- AI 风险评估（`scheduler.ts` / `risk` 路由）拿到 LLM 返回的「极高」会落库为 MEDIUM → 仪表盘颜色/告警/通知全部按中等处理，最高级别风险被静默吞掉。
- 方向：不是误报，而是**漏报/降级**——比误报更危险（真正的高风险被忽视）。
- 相关：AI-002「高」→HIGH 已覆盖；AI-007「极高」→CRITICAL 是同函数的遗漏同义词（与 #73/#74 的 parseStatus 同义词问题同类）。

## 失败测试（交接契约）

- 路径：`server/src/utils/riskPrompts.test.ts`
  - `describe`：`riskPrompts` > `validateRiskLevel`
  - 用例：`AI-007 (GLM QA bug repro #7): 「极高」应归一化为 CRITICAL，而非回落 MEDIUM`
- 运行命令：

```bash
cd server && npx vitest run src/utils/riskPrompts.test.ts -t "GLM QA bug repro #7"
```

- 当前失败输出（关键片段）：

```
 FAIL  src/routes/.../riskPrompts.test.ts > riskPrompts > validateRiskLevel > AI-007 (GLM QA bug repro #7): ...
AssertionError: expected 'MEDIUM' to be 'CRITICAL' // Object.is equality
Expected: "CRITICAL"
Received: "MEDIUM"

 Tests  1 failed | 175 skipped (176)
```

## 交接约定（本报告即 PR 的 body）

- **Claude（修源码）**：只改 `server/src/utils/riskPrompts.ts` 的 `validateRiskLevel`，把「极高」纳入 CRITICAL 映射（如在 cnMap 加 `'极高': 'CRITICAL'`；建议顺带考虑「紧急」「致命」等同义极端词，但本 PR 只断言 AI-007 的「极高」）。**不修改 / skip / 删除**复现测试；CI 🔴 → 🟢。
- **GLM（复测）**：复跑 `cd server && npx vitest run src/utils/riskPrompts.test.ts` 确认全绿且测试未被改动 → `gh pr ready`。

## 修复验证（Claude 修完后由 GLM 勾）

- [ ] 同一测试已转绿，且测试本身未被修改
- 验证命令输出：<PASS 片段>
