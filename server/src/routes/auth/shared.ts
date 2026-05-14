import process from 'process';
import { logger } from '../../utils/logger';

export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  logger.error('JWT_SECRET 和 JWT_REFRESH_SECRET 环境变量必须设置');
  process.exit(1);
}

export const ACCESS_TOKEN_EXPIRES_IN = '8h';
export const REFRESH_TOKEN_EXPIRES_IN = '7d';
