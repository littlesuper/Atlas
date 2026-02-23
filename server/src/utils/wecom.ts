import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const WECOM_API = 'https://qyapi.weixin.qq.com/cgi-bin';
const prisma = new PrismaClient();

// 内存缓存 access_token
let cachedToken: { token: string; expiresAt: number } | null = null;

// 内存缓存 DB 配置（5 分钟 TTL）
let cachedConfig: {
  data: { corpId: string; agentId: string; secret: string; redirectUri: string } | null;
  expiresAt: number;
} | null = null;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

/**
 * 从 DB 读取企微配置，fallback 到环境变量（带 5 分钟内存缓存）
 */
export async function getWecomConfig(): Promise<{
  corpId: string;
  agentId: string;
  secret: string;
  redirectUri: string;
}> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.data || { corpId: '', agentId: '', secret: '', redirectUri: '' };
  }

  try {
    const dbConfig = await prisma.wecomConfig.findFirst();
    if (dbConfig && dbConfig.corpId && dbConfig.secret) {
      const data = {
        corpId: dbConfig.corpId,
        agentId: dbConfig.agentId,
        secret: dbConfig.secret,
        redirectUri: dbConfig.redirectUri,
      };
      cachedConfig = { data, expiresAt: now + CONFIG_CACHE_TTL };
      return data;
    }
  } catch {
    // DB read failure — fall through to env vars
  }

  // Fallback to environment variables
  const data = {
    corpId: process.env.WECOM_CORP_ID || '',
    agentId: process.env.WECOM_AGENT_ID || '',
    secret: process.env.WECOM_SECRET || '',
    redirectUri: process.env.WECOM_REDIRECT_URI || '',
  };
  cachedConfig = { data, expiresAt: now + CONFIG_CACHE_TTL };
  return data;
}

/** 清除配置缓存（配置更新后可调用） */
export function invalidateWecomConfigCache(): void {
  cachedConfig = null;
  // access_token 也需要失效，因为 secret 可能已变
  cachedToken = null;
}

/**
 * 检查企业微信登录是否已配置
 */
export async function isWecomEnabled(): Promise<boolean> {
  const config = await getWecomConfig();
  return !!(config.corpId && config.agentId && config.secret);
}

/**
 * 获取企业微信 access_token（带内存缓存，提前 10 分钟刷新）
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const config = await getWecomConfig();
  const res = await axios.get(`${WECOM_API}/gettoken`, {
    params: { corpid: config.corpId, corpsecret: config.secret },
  });

  if (res.data.errcode !== 0) {
    throw new Error(`获取 access_token 失败: ${res.data.errmsg}`);
  }

  // 缓存 2h，提前 10min 刷新
  cachedToken = {
    token: res.data.access_token,
    expiresAt: now + (res.data.expires_in - 600) * 1000,
  };

  return cachedToken.token;
}

/**
 * 用 OAuth2 code 换取企微 userid
 */
export async function getUserInfoByCode(code: string): Promise<string> {
  const token = await getAccessToken();
  const res = await axios.get(`${WECOM_API}/auth/getuserinfo`, {
    params: { access_token: token, code },
  });

  if (res.data.errcode !== 0) {
    throw new Error(`企微授权失败: ${res.data.errmsg}`);
  }

  // 企业成员返回 userid，外部联系人返回 openid
  if (!res.data.userid) {
    throw new Error('非企业成员，无法登录');
  }

  return res.data.userid;
}

/**
 * 获取企微用户详情（姓名、邮箱、手机）
 */
export async function getUserDetail(userid: string): Promise<{
  userid: string;
  name: string;
  email: string;
  mobile: string;
}> {
  const token = await getAccessToken();
  const res = await axios.get(`${WECOM_API}/user/get`, {
    params: { access_token: token, userid },
  });

  if (res.data.errcode !== 0) {
    throw new Error(`获取企微用户信息失败: ${res.data.errmsg}`);
  }

  return {
    userid: res.data.userid,
    name: res.data.name,
    email: res.data.email || '',
    mobile: res.data.mobile || '',
  };
}
