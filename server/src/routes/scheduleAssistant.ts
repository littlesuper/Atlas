/**
 * 排期助手 · HTTP 路由
 *
 * 与 docs/specs/ai-scheduling-beacon/01 §F 对齐。
 *
 * Step-2 状态：propose 路径还未接 LLM（意图解析在 step-3 启用），
 * 故 POST /propose 直接返回 503 "AI 未启用"。apply 路径完整工作，
 * 上层（routes/service 测试）通过 proposeFromIntent 直接造提议来联调。
 */
import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, canManageProject } from '../middleware/permission';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import prisma from '../db';
import {
  proposeRequestSchema,
  applyRequestSchema,
} from '../schemas/scheduleAssistant';
import {
  applyProposal,
  loadProjectSnapshot,
  proposeFromIntent,
  DependencyCycleError,
  ProjectNotFoundError,
  ProjectVersionMismatchError,
  ProposalNotFoundError,
} from '../services/scheduleAssistant';
import { parseUtterance } from '../services/scheduleAssistantIntent';
import { narrateProposal } from '../services/scheduleAssistantNarrate';
import type { IntentPromptActivity } from '../utils/scheduleAssistantPrompts';
import type { ProjectSnapshot } from '../utils/scheduleEngine';

const router = express.Router();

const toISODate = (d: Date | null): string | null =>
  d ? d.toISOString().split('T')[0] : null;

function toPromptActivities(snapshot: ProjectSnapshot): IntentPromptActivity[] {
  return snapshot.activities.map((a) => ({
    id: a.id,
    name: a.name,
    isMilestone: a.type === 'MILESTONE',
    planStartDate: toISODate(a.planStartDate),
    planEndDate: toISODate(a.planEndDate),
    dependsOn: a.dependencies.map((d) => d.id),
  }));
}

router.post(
  '/propose',
  authenticate,
  requirePermission('activity', 'update'),
  validate({ body: proposeRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.body as { projectId: string; utterance: string };
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, status: true, managerId: true },
      });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      if (project.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可使用排期助手' });
        return;
      }
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '只能在自己负责的项目中使用排期助手' });
        return;
      }

      const utterance = (req.body as { utterance: string }).utterance;

      const snapshot = await loadProjectSnapshot(projectId);
      if (!snapshot) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 边缘 1：意图解析（经 aiCircuitBreaker）
      const parsed = await parseUtterance({
        projectId,
        utterance,
        activities: toPromptActivities(snapshot),
      });

      // AI 不可用 → 503 降级，不伪造意图（01 §G / 03 §4）
      if (parsed.status === 'ai_unavailable') {
        res.status(503).json({
          error: 'AI_UNAVAILABLE',
          message: 'AI 助手暂不可用，请手动调整排期',
        });
        return;
      }

      // 没听懂 → 200，回显无可对应操作，不瞎改（01 §G）
      if (parsed.status === 'not_understood') {
        res.json({
          proposalId: null,
          noOp: true,
          intent: null,
          diff: { items: [] },
          risks: [],
          narrative: '没听懂这句话，请换个更明确的说法（例如"把硬件打样推迟两周"），或直接手动调整排期。',
          parseConfidence: 'low',
          unresolved: [],
        });
        return;
      }

      // 干跑 + 风险 + 叙述（叙述经 aiCircuitBreaker，失败自动降级为空叙述）
      const result = await proposeFromIntent(parsed.intent, {
        rawUtterance: utterance,
        snapshot,
        narrate: (n) => narrateProposal({ projectId, diff: n.diff, risks: n.risks }),
      });

      res.json({
        proposalId: result.proposalId ?? null,
        noOp: result.noOp,
        intent: result.intent,
        diff: result.diff,
        risks: result.risks,
        narrative: result.narrative,
        parseConfidence: result.parseConfidence,
        unresolved: result.unresolved,
      });
    } catch (error) {
      logger.error({ err: error }, '排期助手 propose 错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.post(
  '/apply',
  authenticate,
  requirePermission('activity', 'update'),
  validate({ body: applyRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.body as { proposalId: string };
      const result = await applyProposal(proposalId, req);
      res.json(result);
    } catch (error) {
      if (error instanceof ProposalNotFoundError) {
        res.status(404).json({
          error: 'PROPOSAL_NOT_FOUND',
          message: '提议不存在或已过期，请重新发起对话',
        });
        return;
      }
      if (error instanceof ProjectVersionMismatchError) {
        res.status(409).json({
          error: 'PROJECT_VERSION_MISMATCH',
          message: '项目排期在此期间已被改动，请重新发起对话',
        });
        return;
      }
      if (error instanceof ProjectNotFoundError) {
        res.status(404).json({
          error: 'PROJECT_NOT_FOUND',
          message: '项目不存在',
        });
        return;
      }
      if (error instanceof DependencyCycleError) {
        res.status(400).json({
          error: 'DEPENDENCY_CYCLE',
          message: '存在循环依赖，无法应用',
        });
        return;
      }
      logger.error({ err: error }, '排期助手 apply 错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
