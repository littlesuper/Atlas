import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, AlertTriangle, XCircle, Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DataTableColumnHeader } from '@/components/data-table';
import { cn } from '@/lib/utils';
import { Project } from '../../../types';
import { STATUS_MAP, PRIORITY_MAP, PRODUCT_LINE_MAP, PROGRESS_STATUS_MAP } from '../../../utils/constants';

// 把 Arco 色名映射到 Tailwind 语义徽标样式（明/暗）
const badgeClass: Record<string, string> = {
  green: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  red: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  orange: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  blue: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  arcoblue: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  cyan: 'border-transparent bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400',
  purple: 'border-transparent bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  gray: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  default: 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
};
function ColorBadge({ color, label }: { color: string; label: string }) {
  return <Badge variant="outline" className={cn(badgeClass[color] ?? badgeClass.default)}>{label}</Badge>;
}

export interface ProjectColumnCtx {
  latestStatus: Record<string, string>;
  navigate: (to: string) => void;
  canUpdate: (p: Project) => boolean;
  canDelete: (p: Project) => boolean;
  onEdit: (id: string) => void;
  onDelete: (p: Project) => void;
  onArchive: (p: Project) => void;
  onUnarchive: (p: Project) => void;
}

export function buildProjectColumns(ctx: ProjectColumnCtx): ColumnDef<Project>[] {
  return [
    {
      id: 'status-icon',
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => {
        const ps = ctx.latestStatus[row.original.id] as keyof typeof PROGRESS_STATUS_MAP | undefined;
        if (!ps) return null;
        const map = {
          ON_TRACK: { Icon: CheckCircle2, cls: 'text-green-600' },
          MINOR_ISSUE: { Icon: AlertTriangle, cls: 'text-amber-600' },
          MAJOR_ISSUE: { Icon: XCircle, cls: 'text-red-600' },
        } as const;
        const m = map[ps as keyof typeof map];
        if (!m) return null;
        const { Icon, cls } = m;
        return <Icon className={cn('size-4', cls)} aria-label={`周报状态：${PROGRESS_STATUS_MAP[ps].label}`} />;
      },
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="项目名称" />,
      cell: ({ row }) => (
        <button
          className="nav-item text-foreground hover:text-primary cursor-pointer font-medium hover:underline"
          onClick={() => ctx.navigate(`/projects/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: 'productLine',
      header: '产品线',
      cell: ({ row }) => {
        const c = PRODUCT_LINE_MAP[row.original.productLine as keyof typeof PRODUCT_LINE_MAP] ?? {
          label: row.original.productLine,
          color: 'default',
        };
        return <ColorBadge color={c.color} label={c.label} />;
      },
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const c = STATUS_MAP[row.original.status as keyof typeof STATUS_MAP] ?? { label: row.original.status, color: 'default' };
        return <ColorBadge color={c.color} label={c.label} />;
      },
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => <DataTableColumnHeader column={column} title="优先级" />,
      cell: ({ row }) => {
        const c = PRIORITY_MAP[row.original.priority as keyof typeof PRIORITY_MAP] ?? { label: row.original.priority, color: 'default' };
        return <ColorBadge color={c.color} label={c.label} />;
      },
    },
    {
      accessorKey: 'progress',
      header: ({ column }) => <DataTableColumnHeader column={column} title="进度" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Progress value={row.original.progress || 0} className="h-2 w-24" />
          <span className="text-muted-foreground text-xs">{row.original.progress || 0}%</span>
        </div>
      ),
    },
    {
      id: 'manager',
      header: '负责人',
      enableSorting: false,
      cell: ({ row }) => row.original.manager?.realName || row.original.manager?.username || '-',
    },
    {
      id: 'time',
      header: '时间',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {dayjs(row.original.startDate).format('YYYY-MM-DD')}
          {row.original.endDate ? ` ~ ${dayjs(row.original.endDate).format('YYYY-MM-DD')}` : ''}
        </span>
      ),
    },
    {
      id: 'activities',
      header: '活动数',
      enableSorting: false,
      cell: ({ row }) => row.original._count?.activities ?? 0,
    },
    {
      id: 'actions',
      header: '操作',
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        const archived = p.status === 'ARCHIVED';
        return (
          <div className="flex items-center gap-1">
            {archived ? (
              ctx.canUpdate(p) && (
                <Button variant="ghost" size="icon" aria-label="取消归档" onClick={() => ctx.onUnarchive(p)}>
                  <ArchiveRestore className="size-4" />
                </Button>
              )
            ) : (
              <>
                {ctx.canUpdate(p) && (
                  <Button variant="ghost" size="icon" aria-label="编辑" onClick={() => ctx.onEdit(p.id)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {ctx.canDelete(p) && (
                  <Button variant="ghost" size="icon" aria-label="删除" className="text-destructive" onClick={() => ctx.onDelete(p)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
                {ctx.canUpdate(p) && (
                  <Button variant="ghost" size="icon" aria-label="归档" onClick={() => ctx.onArchive(p)}>
                    <Archive className="size-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];
}
