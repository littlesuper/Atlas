import React, { useState, useEffect, useCallback } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { wecomConfigApi } from '../../api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormValues {
  corpId: string;
  agentId: string;
  secret: string;
  redirectUri: string;
}

const EMPTY_FORM: FormValues = {
  corpId: '',
  agentId: '',
  secret: '',
  redirectUri: '',
};

function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

const WecomManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);

  const setField = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await wecomConfigApi.get();
      const data = res.data;
      if (data && data.corpId !== undefined) {
        setForm({
          corpId: data.corpId ?? '',
          agentId: data.agentId ?? '',
          secret: data.secret ?? '',
          redirectUri: data.redirectUri ?? '',
        });
      }
    } catch {
      toast.error('加载企微配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await wecomConfigApi.update(form);
      toast.success('企微配置保存成功');
      loadConfig();
    } catch {
      // form validation error — no message needed
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card className="relative mt-4 max-w-[520px] space-y-4 p-4">
        {loading && (
          <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center rounded-xl">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        )}

        <Field label="企业ID (CorpID)">
          <Input
            placeholder="请输入企业ID"
            value={form.corpId}
            onChange={(e) => setField('corpId', e.target.value)}
          />
        </Field>

        <Field label="AgentID">
          <Input
            placeholder="请输入AgentID"
            value={form.agentId}
            onChange={(e) => setField('agentId', e.target.value)}
          />
        </Field>

        <Field label="Secret">
          <Input
            type="password"
            placeholder="请输入Secret"
            value={form.secret}
            onChange={(e) => setField('secret', e.target.value)}
          />
        </Field>

        <Field label="回调地址 (Redirect URI)">
          <Input
            placeholder="如 https://example.com/wecom-callback"
            value={form.redirectUri}
            onChange={(e) => setField('redirectUri', e.target.value)}
          />
        </Field>

        <div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default WecomManagement;
