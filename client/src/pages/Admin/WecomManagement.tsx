import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Message, Spin } from '@arco-design/web-react';
import { wecomConfigApi } from '../../api';

const WecomManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await wecomConfigApi.get();
      const data = res.data;
      if (data && data.corpId !== undefined) {
        form.setFieldsValue({
          corpId: data.corpId,
          agentId: data.agentId,
          secret: data.secret,
          redirectUri: data.redirectUri,
        });
      }
    } catch {
      Message.error('加载企微配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      await wecomConfigApi.update(values);
      Message.success('企微配置保存成功');
      loadConfig();
    } catch {
      // form validation error — no message needed
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Spin loading={loading} style={{ display: 'block' }}>
        <Form
          form={form}
          layout="vertical"
          style={{ maxWidth: 520, marginTop: 16 }}
        >
          <Form.Item label="企业ID (CorpID)" field="corpId">
            <Input placeholder="请输入企业ID" />
          </Form.Item>

          <Form.Item label="AgentID" field="agentId">
            <Input placeholder="请输入AgentID" />
          </Form.Item>

          <Form.Item label="Secret" field="secret">
            <Input.Password placeholder="请输入Secret" />
          </Form.Item>

          <Form.Item label="回调地址 (Redirect URI)" field="redirectUri">
            <Input placeholder="如 https://example.com/wecom-callback" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Spin>
    </div>
  );
};

export default WecomManagement;
