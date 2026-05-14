import fs from 'fs';
import path from 'path';
import { type Prisma } from '../../generated/prisma/client';
import prisma from '../../db';

const UPLOADS_DIR = path.join(__dirname, '../../../../uploads');

const isUploadedFile = (file: unknown): file is { url?: string; name?: string } =>
  typeof file === 'object' && file !== null;

export function cleanupFiles(files: unknown) {
  if (!Array.isArray(files)) return;
  for (const file of files) {
    if (!isUploadedFile(file)) continue;
    const url = file.url || '';
    const filename = path.basename(url);
    if (!filename) continue;
    try {
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 静默处理
    }
  }
}

export async function logProductChange(
  productId: string | null,
  userId: string,
  userName: string,
  action: string,
  changes?: Record<string, { from: unknown; to: unknown }> | null,
) {
  try {
    await prisma.productChangeLog.create({
      data: {
        productId,
        userId,
        userName,
        action,
        changes: changes ? (changes as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch {
    // 日志记录失败不影响主流程
  }
}

export function diffObjects(
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
