import React, { useEffect, useRef, useState } from 'react';
import { Spin, Message } from '@arco-design/web-react';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';

interface WecomQrLoginProps {
  onSuccess: () => void;
}

const WecomQrLogin: React.FC<WecomQrLoginProps> = ({ onSuccess }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeProcessing, setCodeProcessing] = useState(false);
  const loginWithWecom = useAuthStore((s) => s.loginWithWecom);

  // 检测 URL 中的 code 参数，自动完成企微登录
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    setCodeProcessing(true);

    // 清除 URL 中的 code/state 参数
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.pathname);

    (async () => {
      try {
        const res = await authApi.wecomLogin({ code });
        loginWithWecom(res.data);
        onSuccess();
      } catch {
        Message.error('企业微信登录失败，请重试');
        setCodeProcessing(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载企微二维码
  useEffect(() => {
    if (codeProcessing) return;

    (async () => {
      try {
        const res = await authApi.getWecomConfig();
        const config = res.data;

        if (!config.enabled) {
          setError('企业微信登录未配置');
          setLoading(false);
          return;
        }

        if (typeof WwLogin === 'undefined') {
          setError('企微 SDK 加载失败，请刷新页面');
          setLoading(false);
          return;
        }

        new WwLogin({
          id: 'wecom-qr-container',
          appid: config.corpId!,
          agentid: config.agentId!,
          redirect_uri: encodeURIComponent(config.redirectUri!),
          state: config.state,
        });

        setLoading(false);
      } catch {
        setError('加载企微配置失败');
        setLoading(false);
      }
    })();
  }, [codeProcessing]);

  if (codeProcessing) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size={32} />
        <div style={{ marginTop: 16, color: 'var(--color-text-3)' }}>企业微信登录中...</div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {loading && (
        <div style={{ padding: '40px 0' }}>
          <Spin size={32} />
          <div style={{ marginTop: 16, color: 'var(--color-text-3)' }}>加载中...</div>
        </div>
      )}
      {error && (
        <div style={{ padding: '40px 0', color: 'var(--color-text-3)' }}>{error}</div>
      )}
      <div
        id="wecom-qr-container"
        ref={containerRef}
        style={{ display: loading || error ? 'none' : 'block' }}
      />
    </div>
  );
};

export default WecomQrLogin;
