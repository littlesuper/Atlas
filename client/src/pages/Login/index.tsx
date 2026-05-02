import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Tabs } from '@arco-design/web-react';
import { IconUser, IconLock } from '@arco-design/web-react/icon';
import { useAuthStore } from '../../store/authStore';
import WecomQrLogin from '../../components/WecomQrLogin';
import { FEATURE_FLAGS } from '../../featureFlags/flags';
import { useFeatureFlag } from '../../featureFlags/FeatureFlagProvider';
import '../../styles/global.css';

const FormItem = Form.Item;
const TabPane = Tabs.TabPane;

interface LoginFormData {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormData>();
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const wecomLoginEnabled = useFeatureFlag(FEATURE_FLAGS.WECOM_LOGIN);

  // URL 含 code 参数时默认选中企微 Tab
  const defaultTab = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return wecomLoginEnabled && params.get('code') ? 'wecom' : 'password';
  }, [wecomLoginEnabled]);

  const handleSubmit = async (values: LoginFormData) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate('/projects', { replace: true });
    } catch {
      // 错误提示已由 axios 拦截器处理
    } finally {
      setLoading(false);
    }
  };

  const handleWecomSuccess = () => {
    navigate('/projects', { replace: true });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">硬件管理系统</h1>

        <Tabs type="rounded" defaultActiveTab={defaultTab}>
          <TabPane key="password" title="密码登录">
            <Form
              form={form}
              layout="vertical"
              onSubmit={handleSubmit}
              autoComplete="off"
              style={{ marginTop: 16 }}
            >
              <FormItem
                label="用户名"
                field="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { minLength: 3, message: '用户名至少3个字符' },
                ]}
              >
                <Input
                  prefix={<IconUser />}
                  placeholder="请输入用户名"
                  size="large"
                  autoComplete="off"
                />
              </FormItem>

              <FormItem
                label="密码"
                field="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { minLength: 6, message: '密码至少6个字符' },
                ]}
              >
                <Input.Password
                  prefix={<IconLock />}
                  placeholder="请输入密码"
                  size="large"
                  autoComplete="off"
                />
              </FormItem>

              <FormItem>
                <Button
                  type="primary"
                  htmlType="submit"
                  long
                  size="large"
                  loading={loading}
                  style={{ marginTop: '8px' }}
                >
                  {loading ? '登录中...' : '登录'}
                </Button>
              </FormItem>
            </Form>
          </TabPane>

          {wecomLoginEnabled && (
            <TabPane key="wecom" title="企业微信">
              <div style={{ marginTop: 16 }}>
                <WecomQrLogin onSuccess={handleWecomSuccess} />
              </div>
            </TabPane>
          )}
        </Tabs>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <span className="text-meta">贝锐科技 - 硬件项目管理平台</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
