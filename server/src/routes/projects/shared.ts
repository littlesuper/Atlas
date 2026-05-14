import { Request, Response, NextFunction } from 'express';
import { ProjectStatus } from '../../generated/prisma/client';
import prisma from '../../db';

export type ProjectMemberSnapshot = {
  user: {
    id: string;
    realName: string;
    username: string | null;
  };
};

export const readArchivedProjectStatus = (snapshot: unknown): string | undefined => {
  if (typeof snapshot !== 'object' || snapshot === null || !('project' in snapshot)) return undefined;
  const project = (snapshot as { project?: unknown }).project;
  if (typeof project !== 'object' || project === null || !('status' in project)) return undefined;
  const status = (project as { status?: unknown }).status;
  return typeof status === 'string' ? status : undefined;
};

export const PROJECT_MEMBER_ROLES = [
  'PROJECT_MANAGER',
  'COLLABORATOR',
  'HW_PRODUCT',
  'SW_PRODUCT',
  'HW_DEV',
  'SW_DEV',
  'HW_QA',
  'SW_QA',
  'STRUCTURE',
  'QUALITY',
  'DESIGNER',
  'PROCUREMENT',
  'LEGAL',
  'SUPPLY_CHAIN',
  'OTHER',
] as const;

export function rejectIfArchived(getProjectId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = getProjectId(req);
      if (!projectId) {
        next();
        return;
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (project?.status === ProjectStatus.ARCHIVED) {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
