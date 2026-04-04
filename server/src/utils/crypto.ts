import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 获取加密密钥（从 JWT_SECRET 派生，确保 32 字节）
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'dev-fallback-key';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * 加密敏感字符串（AES-256-GCM）
 * 返回格式: base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv(16) + tag(16) + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * 解密敏感字符串
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // 如果解密失败（可能是旧的明文数据），原样返回
    return ciphertext;
  }
}

/**
 * 判断字符串是否已经是加密格式
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    // 至少需要 iv(16) + tag(16) + 1字节密文
    return buf.length >= IV_LENGTH + TAG_LENGTH + 1 && value === buf.toString('base64');
  } catch {
    return false;
  }
}

/**
 * 脱敏显示（用于 API 响应）
 */
export function maskSecret(value: string): string {
  if (!value) return '';
  // 先解密再脱敏
  const plain = decrypt(value);
  if (plain.length <= 4) return '****';
  return '****' + plain.slice(-4);
}
