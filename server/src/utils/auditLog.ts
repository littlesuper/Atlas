import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

export interface AuditLogParams {
  req: Request;
  action: string;       // LOGIN, CREATE, UPDATE, DELETE
  resourceType: string;  // auth, project, activity, product, user, role
  resourceId?: string;
  resourceName?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  userId?: string;       // override for login route
  userName?: string;     // override for login route
}

export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    const user = (params.req as any).user;
    const userId = params.userId || user?.id || '';
    const userName = params.userName || user?.realName || user?.username || '';
    let ipAddress =
      (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      params.req.socket?.remoteAddress ||
      '';
    // 去掉 IPv6 映射前缀（::ffff:192.168.1.1 → 192.168.1.1）
    if (ipAddress.startsWith('::ffff:')) {
      ipAddress = ipAddress.slice(7);
    }

    await prisma.auditLog.create({
      data: {
        userId,
        userName,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId || null,
        resourceName: params.resourceName || null,
        changes: params.changes ? (params.changes as any) : undefined,
        ipAddress: ipAddress || null,
      },
    });
  } catch {
    // fire-and-forget: audit log failure must not affect main flow
  }
}

export function diffFields(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[],
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (newVal !== undefined && JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
