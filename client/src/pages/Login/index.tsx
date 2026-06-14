import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '../../store/authStore';
import WecomQrLogin from '../../components/WecomQrLogin';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名').min(3, '用户名至少3个字符'),
  password: z.string().min(1, '请输入密码').min(6, '密码至少6个字符'),
});
type LoginFormData = z.infer<typeof loginSchema>;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setAppVersion(d.version || ''))
      .catch(() => {});
  }, []);

  // URL 含 code 参数时默认选中企微 Tab
  const defaultTab = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('code') ? 'wecom' : 'password';
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginFormData) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate('/', { replace: true });
    } catch {
      // 错误提示由 axios 拦截器处理
    } finally {
      setLoading(false);
    }
  };

  const handleWecomSuccess = () => navigate('/', { replace: true });

  return (
    <div className="login-container bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="login-card w-full max-w-sm">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="贝锐科技" className="mx-auto mb-2 size-16 object-contain" />
          <CardTitle className="text-xl">硬件项目管理</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">密码登录</TabsTrigger>
              <TabsTrigger value="wecom">企业微信</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">用户名</Label>
                  <Input id="username" placeholder="请输入用户名" autoComplete="off" {...register('username')} />
                  {errors.username && <p className="text-destructive text-sm">{errors.username.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="请输入密码"
                    autoComplete="off"
                    {...register('password')}
                  />
                  {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '登录中...' : '登录'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="wecom">
              <div className="mt-4">
                <WecomQrLogin onSuccess={handleWecomSuccess} />
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-muted-foreground mt-6 text-center text-xs">贝锐科技 - 硬件项目管理平台{appVersion ? ` · v${appVersion}` : ''}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
