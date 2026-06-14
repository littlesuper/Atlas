import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { aiConfigApi } from '../../api';
import { AiConfig, AiUsageStats } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// AI 配置不再按功能关联（已定义为全站通用）；此映射仅用于"用量统计"里展示功能名
const FEATURE_LABEL: Record<string, string> = {
  risk: '风险评估',
  weekly_report: '周报建议',
  assistant: '全站助手',
  schedule_assistant: '排期助手',
};

// 主流 AI API 网关预设配置
interface AiProvider {
  key: string;
  label: string;
  apiUrl: string;
  modelName: string;
  /** 部分厂商「编码套餐(包月)」走不同的 OpenAI 兼容端点；填了才显示「接入方式」选择 */
  codingApiUrl?: string;
}

const AI_PROVIDERS: AiProvider[] = [
  { key: 'openai', label: 'OpenAI', apiUrl: 'https://api.openai.com/v1/chat/completions', modelName: 'gpt-4o-mini' },
  { key: 'claude', label: 'Anthropic Claude', apiUrl: 'https://api.anthropic.com/v1/messages', modelName: 'claude-sonnet-4-5-20250929' },
  { key: 'deepseek', label: 'DeepSeek', apiUrl: 'https://api.deepseek.com/v1/chat/completions', modelName: 'deepseek-chat' },
  {
    key: 'zhipu',
    label: '智谱 GLM',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelName: 'glm-4-flash',
    codingApiUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
  },
  { key: 'qwen', label: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', modelName: 'qwen-plus' },
  { key: 'doubao', label: '豆包 (火山引擎)', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', modelName: 'doubao-1.5-pro-32k' },
  { key: 'moonshot', label: 'Moonshot (月之暗面)', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', modelName: 'moonshot-v1-8k' },
  { key: 'minimax', label: 'MiniMax', apiUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2', modelName: 'MiniMax-Text-01' },
  { key: 'yi', label: '零一万物 (Yi)', apiUrl: 'https://api.lingyiwanwu.com/v1/chat/completions', modelName: 'yi-large' },
  { key: 'baichuan', label: '百川智能', apiUrl: 'https://api.baichuan-ai.com/v1/chat/completions', modelName: 'Baichuan4' },
  { key: 'siliconflow', label: '硅基流动 (SiliconFlow)', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', modelName: 'Qwen/Qwen2.5-7B-Instruct' },
  { key: 'custom', label: '自定义', apiUrl: '', modelName: '' },
];

const baseOf = (url: string): string => url.replace(/\/chat\/completions$|\/messages$|\/chatcompletion_v2$/, '');

// 根据 apiUrl 推断 provider（同时识别厂商的编码套餐端点）
export const detectProvider = (apiUrl: string): string => {
  if (!apiUrl) return 'custom';
  const match = AI_PROVIDERS.find(
    (p) =>
      p.key !== 'custom' &&
      (apiUrl.startsWith(baseOf(p.apiUrl)) || (p.codingApiUrl ? apiUrl.startsWith(baseOf(p.codingApiUrl)) : false))
  );
  return match?.key || 'custom';
};

// 根据 apiUrl 推断接入方式（按量 / 编码套餐）
export const detectApiMode = (apiUrl: string, providerKey: string): 'token' | 'coding' => {
  const p = AI_PROVIDERS.find((x) => x.key === providerKey);
  if (p?.codingApiUrl && apiUrl.startsWith(baseOf(p.codingApiUrl))) return 'coding';
  return 'token';
};

interface ConfigForm {
  name: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
}
const EMPTY_FORM: ConfigForm = { name: '', apiUrl: '', apiKey: '', modelName: '' };

const AiManagement: React.FC = () => {
  const { hasPermission } = useAuthStore();

  // 配置列表
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiConfig | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [apiMode, setApiMode] = useState<'token' | 'coding'>('token');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiConfig | null>(null);

  // 表单字段（受控）
  const [form, setForm] = useState<ConfigForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ name?: string; apiKey?: string }>({});
  const setField = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k as 'name' | 'apiKey'] ? { ...p, [k]: undefined } : p));
  };

  // 使用统计
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadStats();
  }, []);

  const loadConfigs = async () => {
    setConfigsLoading(true);
    try {
      const response = await aiConfigApi.list();
      setConfigs(response.data);
    } catch {
      toast.error('加载AI配置列表失败');
    } finally {
      setConfigsLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await aiConfigApi.getUsageStats();
      setStats(response.data);
    } catch {
      toast.error('加载使用统计失败');
    } finally {
      setStatsLoading(false);
    }
  };

  const currentProvider = AI_PROVIDERS.find((p) => p.key === selectedProvider);

  const handleProviderChange = (providerKey: string) => {
    setSelectedProvider(providerKey);
    setApiMode('token');
    setModelOptions([]);
    const provider = AI_PROVIDERS.find((p) => p.key === providerKey);
    if (provider && providerKey !== 'custom') {
      setForm((prev) => ({
        ...prev,
        apiUrl: provider.apiUrl,
        modelName: provider.modelName,
        name: prev.name || provider.label,
      }));
    }
  };

  // 切换接入方式（按量 / 编码套餐）→ 填对应的 OpenAI 兼容端点
  const handleApiModeChange = (mode: 'token' | 'coding') => {
    setApiMode(mode);
    const provider = AI_PROVIDERS.find((p) => p.key === selectedProvider);
    if (!provider) return;
    setField('apiUrl', mode === 'coding' && provider.codingApiUrl ? provider.codingApiUrl : provider.apiUrl);
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setSelectedProvider('custom');
    setApiMode('token');
    setModelOptions([]);
    setForm(EMPTY_FORM);
    setErrors({});
    setDrawerVisible(true);
  };

  const handleEdit = (record: AiConfig) => {
    setEditingConfig(record);
    const providerKey = detectProvider(record.apiUrl);
    setSelectedProvider(providerKey);
    setApiMode(detectApiMode(record.apiUrl, providerKey));
    setModelOptions([]);
    setForm({
      name: record.name || '',
      apiUrl: record.apiUrl || '',
      apiKey: record.apiKey || '',
      modelName: record.modelName || '',
    });
    setErrors({});
    setDrawerVisible(true);
  };

  const handleSave = async () => {
    const e: { name?: string; apiKey?: string } = {};
    if (!form.name.trim()) e.name = '请输入配置名称';
    if (!editingConfig && !form.apiKey.trim()) e.apiKey = '请输入 API Key';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaveLoading(true);
    try {
      const data = { name: form.name, apiUrl: form.apiUrl, apiKey: form.apiKey, modelName: form.modelName };
      if (editingConfig) {
        await aiConfigApi.update(editingConfig.id, data);
        toast.success('配置更新成功');
      } else {
        await aiConfigApi.create(data);
        toast.success('配置创建成功');
      }
      setDrawerVisible(false);
      loadConfigs();
    } catch {
      // validation or api error
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const apiUrl = form.apiUrl;
    const apiKey = form.apiKey;
    const modelName = form.modelName;
    const isMasked = apiKey?.startsWith('****');

    if (!apiUrl || (!apiKey && !editingConfig)) {
      toast.warning('请填写 API URL 和 API Key');
      return;
    }

    setTestLoading(true);
    try {
      const response = await aiConfigApi.testConnection({
        apiUrl,
        apiKey: apiKey || '',
        modelName,
        ...(isMasked && editingConfig ? { configId: editingConfig.id } : {}),
      });
      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch {
      toast.error('验证请求失败');
    } finally {
      setTestLoading(false);
    }
  };

  const handleFetchModels = async () => {
    const apiUrl = form.apiUrl;
    const apiKey = form.apiKey;
    const isMasked = apiKey?.startsWith('****');

    if (!apiUrl || (!apiKey && !editingConfig)) {
      toast.warning('请先填写 API URL 和 API Key');
      return;
    }

    setModelsLoading(true);
    try {
      const response = await aiConfigApi.fetchModels({
        apiUrl,
        apiKey: apiKey || '',
        ...(isMasked && editingConfig ? { configId: editingConfig.id } : {}),
      });
      if (response.data.success && response.data.models.length > 0) {
        setModelOptions(response.data.models);
        toast.success(response.data.message);
      } else {
        toast.warning(response.data.message || '未获取到模型列表，可手动输入模型名称');
      }
    } catch {
      toast.warning('获取模型列表失败，可手动输入模型名称');
    } finally {
      setModelsLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await aiConfigApi.delete(target.id);
      toast.success('配置删除成功');
      loadConfigs();
    } catch {
      toast.error('删除失败');
    }
  };

  const canManage = hasPermission('user', 'update');
  const totals = stats?.totals;
  const statCards = [
    { label: '总调用次数', value: totals?.callCount ?? 0, sep: false },
    { label: 'Prompt Tokens', value: totals?.promptTokens ?? 0, sep: true },
    { label: 'Completion Tokens', value: totals?.completionTokens ?? 0, sep: true },
    { label: 'Total Tokens', value: totals?.totalTokens ?? 0, sep: true },
  ];

  return (
    <div>
      {/* AI 配置列表 */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">API 配置</div>
          {canManage && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="size-4" />
              新建配置
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">配置名称</TableHead>
                <TableHead>API URL</TableHead>
                <TableHead className="w-36">API Key</TableHead>
                <TableHead className="w-36">模型</TableHead>
                {canManage && <TableHead className="w-24">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {configsLoading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4} className="text-muted-foreground h-24 text-center">
                    暂无AI配置，点击"新建配置"添加
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.name}</TableCell>
                    <TableCell>{record.apiUrl || <span className="text-muted-foreground">未配置</span>}</TableCell>
                    <TableCell>{record.apiKey || <span className="text-muted-foreground">未配置</span>}</TableCell>
                    <TableCell>{record.modelName}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="size-8" aria-label="编辑配置" onClick={() => handleEdit(record)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive size-8"
                            aria-label="删除配置"
                            onClick={() => setDeleteTarget(record)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Token 使用统计 */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Token 使用统计</div>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statCards.map((c) => (
            <div key={c.label}>
              <div className="text-muted-foreground text-xs">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold">{c.sep ? c.value.toLocaleString('en-US') : c.value}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">时间</TableHead>
                <TableHead className="w-28">功能</TableHead>
                <TableHead className="w-44">项目</TableHead>
                <TableHead className="w-36">模型</TableHead>
                <TableHead className="w-24">Prompt</TableHead>
                <TableHead className="w-28">Completion</TableHead>
                <TableHead className="w-24">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : (stats?.recentLogs || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    暂无调用记录
                  </TableCell>
                </TableRow>
              ) : (
                (stats?.recentLogs || []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={arcoBadgeClass(log.feature === 'risk' ? 'orange' : 'blue')}>
                        {FEATURE_LABEL[log.feature] || log.feature}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.project?.name || '-'}</TableCell>
                    <TableCell>{log.modelName}</TableCell>
                    <TableCell>{log.promptTokens}</TableCell>
                    <TableCell>{log.completionTokens}</TableCell>
                    <TableCell>{log.totalTokens}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* 新建/编辑配置 Drawer */}
      <Sheet open={drawerVisible} onOpenChange={(o) => !o && setDrawerVisible(false)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]" onInteractOutside={(e) => e.preventDefault()}>
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{editingConfig ? '编辑配置' : '新建配置'}</SheetTitle>
            <SheetDescription className="sr-only">配置 AI 服务的接入参数</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label>服务商</Label>
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择预设服务商，自动填充 API 地址和模型" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentProvider?.codingApiUrl && (
              <div className="space-y-1.5">
                <Label>接入方式</Label>
                <div className="bg-muted inline-flex rounded-md p-0.5">
                  {(
                    [
                      { v: 'token', l: '按量计费 (Token)' },
                      { v: 'coding', l: '编码套餐 (Coding Plan)' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => handleApiModeChange(m.v)}
                      className={cn(
                        'rounded px-3 py-1 text-sm transition-colors',
                        apiMode === m.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">按量计费与编码套餐(包月)使用不同的接口地址，请按你购买的方式选择</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                配置名称<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input placeholder="如：GPT-4o 风险评估" value={form.name} onChange={(e) => setField('name', e.target.value)} />
              {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>API URL</Label>
              <Input placeholder="https://api.openai.com/v1/chat/completions" value={form.apiUrl} onChange={(e) => setField('apiUrl', e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>
                API Key{!editingConfig && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <Input type="password" placeholder="sk-..." value={form.apiKey} onChange={(e) => setField('apiKey', e.target.value)} />
              {errors.apiKey && <p className="text-destructive text-xs">{errors.apiKey}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>模型名称</Label>
              <Input
                list="ai-model-options"
                placeholder="选择或输入模型名称"
                value={form.modelName}
                onChange={(e) => setField('modelName', e.target.value)}
              />
              <datalist id="ai-model-options">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={modelsLoading} onClick={handleFetchModels}>
                {modelsLoading && <Loader2 className="size-4 animate-spin" />}
                获取模型列表
              </Button>
              <Button variant="outline" disabled={testLoading} onClick={handleTestConnection}>
                {testLoading && <Loader2 className="size-4 animate-spin" />}
                验证连接
              </Button>
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={() => setDrawerVisible(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saveLoading}>
              {saveLoading && <Loader2 className="size-4 animate-spin" />}
              确定
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除配置"{deleteTarget?.name}"吗？删除后 AI 调用将回退到其他可用配置或环境变量。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AiManagement;
