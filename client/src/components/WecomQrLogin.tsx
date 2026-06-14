import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
        toast.error('企业微信登录失败，请重试');
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
      <div className="py-10 text-center">
        <Loader2 className="text-muted-foreground mx-auto size-8 animate-spin" />
        <div className="text-muted-foreground mt-4">企业微信登录中...</div>
      </div>
    );
  }

  return (
    <div className="text-center">
      {loading && (
        <div className="py-10">
          <Loader2 className="text-muted-foreground mx-auto size-8 animate-spin" />
          <div className="text-muted-foreground mt-4">加载中...</div>
        </div>
      )}
      {error && <div className="text-muted-foreground py-10">{error}</div>}
      <div id="wecom-qr-container" ref={containerRef} style={{ display: loading || error ? 'none' : 'block' }} />
    </div>
  );
};

export default WecomQrLogin;
