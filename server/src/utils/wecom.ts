import axios from 'axios';

const WECOM_API = 'https://qyapi.weixin.qq.com/cgi-bin';

// 内存缓存 access_token
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 检查企业微信登录是否已配置
 */
export function isWecomEnabled(): boolean {
  const { WECOM_CORP_ID, WECOM_AGENT_ID, WECOM_SECRET } = process.env;
  return !!(WECOM_CORP_ID && WECOM_AGENT_ID && WECOM_SECRET);
}

/**
 * 获取企业微信 access_token（带内存缓存，提前 10 分钟刷新）
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const { WECOM_CORP_ID, WECOM_SECRET } = process.env;
  const res = await axios.get(`${WECOM_API}/gettoken`, {
    params: { corpid: WECOM_CORP_ID, corpsecret: WECOM_SECRET },
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
