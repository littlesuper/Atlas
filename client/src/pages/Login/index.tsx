import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Message } from '@arco-design/web-react';
import { IconUser, IconLock } from '@arco-design/web-react/icon';
import { useAuthStore } from '../../store/authStore';
import '../../styles/global.css';

const FormItem = Form.Item;

interface LoginFormData {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginFormData>();
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleSubmit = async (values: LoginFormData) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      // 登录成功后跳转到项目列表页
      navigate('/projects', { replace: true });
    } catch (error: any) {
      Message.error(error.message || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">硬件管理系统</h1>
        <Form
          form={form}
          layout="vertical"
          onSubmit={handleSubmit}
          autoComplete="off"
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

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <span className="text-meta">贝锐科技 - 硬件项目管理平台</span>
        </div>
      </div>
    </div>
  );
};

export default Login;
