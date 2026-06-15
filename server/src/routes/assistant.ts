/**
 * 全系统 AI 助手 · 通用路由
 *
 * POST /api/assistant/propose { domain, targetId, utterance } → 预览（不写库）
 * POST /api/assistant/apply   { proposalId }                  → 经现有校验路由落库 + 审计
 *
 * 安全：authenticate + 动态权限校验（adapter.permission）+ 项目归属（canManageProject）。
 * Phase 1 各领域均以项目为目标（targetId=projectId）；非项目领域到来时再扩展归属判定。
 */
import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { isAdmin } from '../middleware/permission';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import prisma from '../db';
import { assistantProposeSchema, assistantApplySchema } from '../schemas/assistant';
import { getAdapter, listAdapters } from '../services/assistant/registry';
import '../services/assistant/bootstrap'; // 触发适配器注册
import '../services/assistant/capability/bootstrap'; // 触发能力注册
import { listCapabilitiesForUser, getCapability } from '../services/assistant/capability/registry';
import { capabilityPropose, capabilityApply } from '../services/assistant/capability/orchestrator';
import { proposalStore } from '../services/assistant/proposalStore';
import {
  runPropose,
  runApply,
  ProposalNotFoundError,
  VersionMismatchError,
  TargetNotFoundError,
  UnknownDomainError,
} from '../services/assistant/orchestrator';
import { resolveProjectTarget } from '../services/assistant/targetResolver';
import { classifyDomain } from '../services/assistant/domainClassifier';
import { runAsk } from '../services/assistant/query/askService';
import { DependencyCycleError } from '../services/scheduleAssistant';
import { ProjectValidationError } from '../services/assistant/adapters/projectAdapter';

// 只读问答伪领域（无写适配器）：分类器据此把"提问"与"改动"区分开
const QUERY_DOMAIN = {
  key: 'query',
  description:
    '查询/提问（只读，不修改任何数据）：关于项目的任何问题——阶段工期、计划起止、进度、风险、瓶颈、跨项目对比、"哪个项目最危险"等。只要用户是在"问"而不是"改"，都归这里。',
};

const router = express.Router();

function userHasPermission(req: Request, resource: string, action: string): boolean {
  const perms = req.user?.permissions || [];
  return perms.some((p) => {
    const [r, a] = p.split(':');
    if (r === '*' && a === '*') return true;
    if (r === '*' && a === action) return true;
    if (r === resource && a === '*') return true;
    return r === resource && a === action;
  });
}

router.post(
  '/propose',
  authenticate,
  validate({ body: assistantProposeSchema }),
  async (req: Request, res: Response): Promise<void> => {
    // 端到端耗时：无论走哪个分支/早返回，响应结束时都打点
    const t0 = Date.now();
    res.on('finish', () => {
      logger.info({ route: 'assistant/propose', status: res.statusCode, totalMs: Date.now() - t0 }, '助手 propose 总耗时');
    });
    // 把端到端耗时回填进每个成功响应体，前端直接显示「耗时 X.X 秒」
    const reply = (body: Record<string, unknown>) => res.json({ ...body, elapsedMs: Date.now() - t0 });
    try {
      const { utterance, contextProjectId } = req.body as {
        utterance: string;
        contextProjectId?: string | null;
      };

      // 领域分类：先判断是"提问(只读)"还是某个"改动"领域（排期/项目字段/风险项/能力）
      const userCaps = listCapabilitiesForUser(req.user?.permissions || []);
      const domainOptions = [
        ...listAdapters().map((a) => ({ key: a.domain, description: a.description })),
        ...userCaps.map((c) => ({ key: c.name, description: c.description })),
        QUERY_DOMAIN,
      ];
      const classified = await classifyDomain({ utterance, domains: domainOptions });
      if (classified.status === 'ai_unavailable') {
        res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
        return;
      }
      if (classified.status === 'unresolved') {
        reply({
          proposalId: null,
          noOp: true,
          needTarget: false,
          preview: { rows: [], risks: [] },
          narrative: '没听懂你想做什么，请换个更明确的说法（支持调整排期、修改项目字段/风险项，或提问阶段工期等）。',
        });
        return;
      }

      const domain = classified.domain;
      const isQuery = domain === QUERY_DOMAIN.key;

      // 该用户「可管理且未归档」的项目清单——既是问答上下文的权限边界，也是写操作的目标候选。
      const admin = isAdmin(req);
      const collaboratingIds = req.user?.collaboratingProjectIds || [];
      const manageable = await prisma.project.findMany({
        where: {
          status: { not: 'ARCHIVED' },
          ...(admin ? {} : { OR: [{ managerId: req.user?.id }, { id: { in: collaboratingIds } }] }),
        },
        select: { id: true, name: true },
      });

      // 只读问答分支：runAsk 自己做(可选)目标定位 + 确定性优先 + 跨项目接地。只读、不写库。
      if (isQuery) {
        const ask = await runAsk({ utterance, contextProjectId, manageable, req });
        if (ask.status === 'ai_unavailable') {
          res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
          return;
        }
        reply({
          proposalId: null,
          noOp: true,
          mode: 'answer',
          answer: ask.answer,
          basis: ask.basis,
          preview: { rows: [], risks: [] },
          narrative: ask.answer,
        });
        return;
      }

      // 能力分支：命中某个 Capability（如 project.create）。新建类不需要 targetId，跳过项目定位。
      const capability = getCapability(domain);
      if (capability) {
        const capCtx = {
          userId: req.user!.id,
          userName: req.user?.realName || req.user?.username || '我',
          permissions: req.user?.permissions || [],
          contextProjectId,
          projects: manageable,
        };
        const out = await capabilityPropose(domain, utterance, capCtx);
        switch (out.status) {
          case 'ai_unavailable':
            res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
            return;
          case 'unknown_capability':
            res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: `未知能力：${domain}` });
            return;
          case 'need_target':
            reply({
              proposalId: null,
              noOp: true,
              needTarget: true,
              preview: { rows: [], risks: [] },
              narrative: '没听清你指的是哪个项目，请在话里点明项目名称（例如"把『GW-X500』的硬件打样推迟两周"）。',
            });
            return;
          case 'target_not_found':
            res.status(404).json({ error: '目标对象不存在' });
            return;
          case 'need_input':
            reply({ proposalId: null, noOp: true, mode: 'need_input', missing: out.missing, preview: { rows: [], risks: [] }, narrative: `还需要补充：${out.missing.join('、')}` });
            return;
          case 'not_understood':
            reply({ proposalId: null, noOp: true, preview: { rows: [], risks: [] }, narrative: '没听懂这句话，请换个更明确的说法。' });
            return;
          case 'noop':
            reply({ proposalId: null, noOp: true, preview: { rows: [], risks: [] }, narrative: '没有可执行的改动。' });
            return;
          case 'ok':
            reply({ proposalId: out.proposalId, noOp: false, domain, preview: out.preview, narrative: out.narrative });
            return;
        }
      }

      // 写领域：权限校验（廉价，先做）→ LLM 定位目标项目
      const adapter = getAdapter(domain);
      if (!adapter) {
        res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: `未知助手领域：${domain}` });
        return;
      }
      if (!userHasPermission(req, adapter.permission.resource, adapter.permission.action)) {
        res.status(403).json({ error: '权限不足' });
        return;
      }

      const target = await resolveProjectTarget({ utterance, projects: manageable, contextProjectId });
      if (target.status === 'ai_unavailable') {
        res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
        return;
      }
      if (target.status === 'unresolved') {
        reply({
          proposalId: null,
          noOp: true,
          needTarget: true,
          preview: { rows: [], risks: [] },
          narrative: '没听清你指的是哪个项目，请在话里点明项目名称（例如"把『GW-X500』的硬件打样推迟两周"）。',
        });
        return;
      }

      const outcome = await runPropose(domain, target.projectId, utterance);

      switch (outcome.status) {
        case 'ai_unavailable':
          res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI 助手暂不可用，请手动操作' });
          return;
        case 'target_not_found':
          res.status(404).json({ error: '目标对象不存在' });
          return;
        case 'not_understood':
          reply({
            proposalId: null,
            noOp: true,
            preview: { rows: [], risks: [] },
            narrative: '没听懂这句话，请换个更明确的说法，或手动操作。',
          });
          return;
        case 'noop':
          reply({ proposalId: null, noOp: true, preview: { rows: [], risks: [] }, narrative: outcome.narrative });
          return;
        case 'ok':
          reply({
            proposalId: outcome.proposalId,
            noOp: false,
            domain,
            preview: outcome.preview,
            narrative: outcome.narrative,
          });
          return;
      }
    } catch (error) {
      if (error instanceof UnknownDomainError) {
        res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: error.message });
        return;
      }
      logger.error({ err: error }, '助手 propose 错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.post(
  '/apply',
  authenticate,
  validate({ body: assistantApplySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.body as { proposalId: string };
      const cached = proposalStore.get(proposalId);
      let result;
      if (cached?.capabilityName) {
        const capCtx = {
          userId: req.user!.id,
          userName: req.user?.realName || req.user?.username || '我',
          permissions: req.user?.permissions || [],
          contextProjectId: null,
          projects: [],
        };
        result = await capabilityApply(proposalId, capCtx, req);
      } else {
        result = await runApply(proposalId, req);
      }
      res.json({ ok: true, appliedDiff: { rows: result.rows }, risks: result.risks });
    } catch (error) {
      if (error instanceof ProposalNotFoundError) {
        res.status(404).json({ error: 'PROPOSAL_NOT_FOUND', message: '提议不存在或已过期，请重新发起对话' });
        return;
      }
      if (error instanceof VersionMismatchError) {
        res.status(409).json({ error: 'VERSION_MISMATCH', message: '数据在此期间已被改动，请重新发起对话' });
        return;
      }
      if (error instanceof TargetNotFoundError) {
        res.status(404).json({ error: 'TARGET_NOT_FOUND', message: '目标对象不存在' });
        return;
      }
      if (error instanceof DependencyCycleError) {
        res.status(400).json({ error: 'DEPENDENCY_CYCLE', message: '存在循环依赖，无法应用' });
        return;
      }
      if (error instanceof ProjectValidationError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
        return;
      }
      if (error instanceof UnknownDomainError) {
        res.status(400).json({ error: 'UNKNOWN_DOMAIN', message: error.message });
        return;
      }
      logger.error({ err: error }, '助手 apply 错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
