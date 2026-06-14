import React, { useState, useEffect, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { RefreshCw, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { auditLogsApi } from '../../api';
import { AuditLog } from '../../types';
import { AUDIT_ACTION_MAP, AUDIT_RESOURCE_MAP } from '../../utils/constants';
import { arcoBadgeClass } from '../../utils/badgeColor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ALL = '__all__';

export function formatChangeData(changes: Record<string, { from: unknown; to: unknown }>): { field: string; from: unknown; to: unknown }[] {
  return Object.entries(changes).map(([field, change]) => ({
    field,
    from: change.from,
    to: change.to,
  }));
}

const AuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Filters
  const [userId, setUserId] = useState<string>();
  const [action, setAction] = useState<string>();
  const [resourceType, setResourceType] = useState<string>();
  const [dateRange, setDateRange] = useState<string[]>();
  const [keyword, setKeyword] = useState<string>();

  // Expanded rows (变更详情)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // User dropdown options
  const [userOptions, setUserOptions] = useState<Array<{ userId: string; userName: string }>>([]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await auditLogsApi.getUsers();
      setUserOptions(res.data || []);
    } catch {
      // silent
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof auditLogsApi.list>[0] = { page, pageSize };
      if (userId) params.userId = userId;
      if (action) params.action = action;
      if (resourceType) params.resourceType = resourceType;
      if (dateRange && dateRange[0]) params.startDate = dateRange[0];
      if (dateRange && dateRange[1]) params.endDate = dateRange[1];
      if (keyword) params.keyword = keyword;

      const res = await auditLogsApi.list(params);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, userId, action, resourceType, dateRange, keyword]);

  useEffect(() => {
    loadLogs();
    loadUsers();
  }, [loadLogs, loadUsers]);

  const handleReset = () => {
    setUserId(undefined);
    setAction(undefined);
    setResourceType(undefined);
    setDateRange(undefined);
    setKeyword(undefined);
    setPage(1);
  };

  const toggleExpand = (id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const dateRangeValue: DateRange | undefined =
    dateRange && dateRange[0]
      ? {
          from: dayjs(dateRange[0]).toDate(),
          to: dateRange[1] ? dayjs(dateRange[1]).toDate() : undefined,
        }
      : undefined;

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (!range || !range.from) {
      setDateRange(undefined);
      return;
    }
    setDateRange([
      dayjs(range.from).format('YYYY-MM-DD'),
      range.to ? dayjs(range.to).format('YYYY-MM-DD') : dayjs(range.from).format('YYYY-MM-DD'),
    ]);
  };

  const renderChanges = (record: AuditLog) => {
    if (!record.changes || Object.keys(record.changes).length === 0) {
      return <span className="text-muted-foreground">无变更详情</span>;
    }

    const changeData = formatChangeData(record.changes);

    return (
      <div className="overflow-x-auto rounded-md border bg-muted/30">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">字段</TableHead>
              <TableHead>变更前</TableHead>
              <TableHead>变更后</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changeData.map((item) => (
              <TableRow key={item.field}>
                <TableCell>{item.field}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.from === null || item.from === undefined ? '-' : String(item.from)}
                </TableCell>
                <TableCell className="font-medium">
                  {item.to === null || item.to === undefined ? '-' : String(item.to)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={userId ?? ALL}
          onValueChange={(v) => setUserId(v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue placeholder="用户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部用户</SelectItem>
            {userOptions.map((u) => (
              <SelectItem key={u.userId} value={u.userId}>
                {u.userName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={action ?? ALL}
          onValueChange={(v) => setAction(v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-[120px]" size="sm">
            <SelectValue placeholder="操作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部操作</SelectItem>
            {Object.entries(AUDIT_ACTION_MAP).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resourceType ?? ALL}
          onValueChange={(v) => setResourceType(v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-[120px]" size="sm">
            <SelectValue placeholder="资源类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部资源</SelectItem>
            {Object.entries(AUDIT_RESOURCE_MAP).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          value={dateRangeValue}
          onChange={handleDateRangeChange}
          className="w-[240px]"
        />
        <Input
          placeholder="搜索用户/资源名称"
          className="w-[180px]"
          value={keyword ?? ''}
          onChange={(e) => setKeyword(e.target.value || undefined)}
        />
        <Button variant="outline" onClick={handleReset}>
          <RefreshCw className="size-4" />
          重置
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead className="w-[170px]">时间</TableHead>
              <TableHead className="w-[100px]">用户</TableHead>
              <TableHead className="w-20">操作</TableHead>
              <TableHead className="w-[90px]">资源类型</TableHead>
              <TableHead className="w-[200px]">资源名称</TableHead>
              <TableHead className="w-[140px]">IP地址</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              logs.map((record) => {
                const expanded = expandedKeys.has(record.id);
                const actionCfg = AUDIT_ACTION_MAP[record.action];
                const resourceCfg = AUDIT_RESOURCE_MAP[record.resourceType];
                return (
                  <React.Fragment key={record.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={expanded ? '收起变更详情' : '展开变更详情'}
                          onClick={() => toggleExpand(record.id)}
                        >
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')}</TableCell>
                      <TableCell>{record.userName}</TableCell>
                      <TableCell>
                        {actionCfg ? (
                          <Badge variant="outline" className={arcoBadgeClass(actionCfg.color)}>
                            {actionCfg.label}
                          </Badge>
                        ) : (
                          record.action
                        )}
                      </TableCell>
                      <TableCell>
                        {resourceCfg ? (
                          <Badge variant="outline" className={arcoBadgeClass(resourceCfg.color)}>
                            {resourceCfg.label}
                          </Badge>
                        ) : (
                          record.resourceType
                        )}
                      </TableCell>
                      <TableCell>{record.resourceName || '-'}</TableCell>
                      <TableCell>{record.ipAddress || '-'}</TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/20 p-3">
                          {renderChanges(record)}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 text-sm">
        <span className="text-muted-foreground">
          第 {page} / {totalPages} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
};

export default AuditLogTab;
