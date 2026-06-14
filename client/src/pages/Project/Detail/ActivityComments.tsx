import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Send, Trash2, Loader2 } from 'lucide-react';
import { activityCommentsApi, auditLogsApi } from '../../../api';
import { ActivityComment, AuditLog } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import dayjs from 'dayjs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

interface Props {
  activityId: string;
}

export const renderActionLabel = (action: string): string => {
  switch (action) {
    case 'CREATE':
      return '创建';
    case 'UPDATE':
      return '更新';
    case 'DELETE':
      return '删除';
    default:
      return action;
  }
};

export function formatChangeEntries(changes: Record<string, { from: unknown; to: unknown }>): string[] {
  return Object.entries(changes).map(
    ([field, change]) => `${field}: ${String(change.from ?? '-')} → ${String(change.to ?? '-')}`
  );
}

const ActivityComments: React.FC<Props> = ({ activityId }) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('comments');

  // Comments state
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Change history state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadComments = useCallback(
    async (page = 1) => {
      setCommentsLoading(true);
      try {
        const res = await activityCommentsApi.list(activityId, { page, pageSize: 10 });
        setComments(res.data.data || []);
        setCommentsTotal(res.data.total || 0);
        setCommentsPage(page);
      } catch {
        toast.error('加载评论失败');
      } finally {
        setCommentsLoading(false);
      }
    },
    [activityId]
  );

  const loadLogs = useCallback(
    async (page = 1) => {
      setLogsLoading(true);
      try {
        const res = await auditLogsApi.list({
          resourceType: 'activity',
          keyword: activityId,
          page,
          pageSize: 10,
        });
        setLogs(res.data.data || []);
        setLogsTotal(res.data.total || 0);
        setLogsPage(page);
      } catch {
        toast.error('加载变更历史失败');
      } finally {
        setLogsLoading(false);
      }
    },
    [activityId]
  );

  useEffect(() => {
    if (activeTab === 'comments') {
      loadComments(1);
    } else {
      loadLogs(1);
    }
  }, [activeTab, loadComments, loadLogs]);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await activityCommentsApi.create({ activityId, content: newComment.trim() });
      setNewComment('');
      toast.success('评论已发送');
      loadComments(1);
    } catch {
      toast.error('发送评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteComment = async () => {
    if (!deleteTarget) return;
    const commentId = deleteTarget;
    setDeleteTarget(null);
    try {
      await activityCommentsApi.delete(commentId);
      toast.success('评论已删除');
      loadComments(commentsPage);
    } catch {
      toast.error('删除失败');
    }
  };

  const Pager = ({ total, page, onTo }: { total: number; page: number; onTo: (p: number) => void }) =>
    total > 10 ? (
      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onTo(page - 1)}>
          上一页
        </Button>
        <span className="text-muted-foreground">
          {page} / {Math.ceil(total / 10)}
        </span>
        <Button variant="outline" size="sm" disabled={page * 10 >= total} onClick={() => onTo(page + 1)}>
          下一页
        </Button>
      </div>
    ) : null;

  return (
    <div className="mt-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="comments">评论 ({commentsTotal})</TabsTrigger>
          <TabsTrigger value="history">变更历史</TabsTrigger>
        </TabsList>

        <TabsContent value="comments" className="mt-4">
          {/* Comment input */}
          <div className="mb-4 flex gap-2">
            <Textarea
              placeholder="输入评论..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-9 flex-1 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <Button
              size="icon"
              aria-label="发送评论"
              disabled={!newComment.trim() || submitting}
              onClick={handleSubmitComment}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>

          {commentsLoading ? (
            <div className="flex justify-center py-5">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">暂无评论</div>
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((c) => (
                <div key={c.id} className="bg-muted/50 rounded-lg px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {(c.user?.realName || '?')[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[13px] font-medium">{c.user?.realName || c.user?.username}</span>
                      <span className="text-muted-foreground text-xs">{dayjs(c.createdAt).format('MM-DD HH:mm')}</span>
                    </div>
                    {c.userId === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-7"
                        aria-label="删除评论"
                        onClick={() => setDeleteTarget(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="pl-8 text-[13px] whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
              <Pager total={commentsTotal} page={commentsPage} onTo={loadComments} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {logsLoading ? (
            <div className="flex justify-center py-5">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">暂无变更历史</div>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <div key={log.id} className="bg-muted/50 rounded-md px-3 py-2 text-[13px]">
                  <div className="flex justify-between">
                    <span>
                      <strong>{log.userName}</strong>
                      <span className="text-muted-foreground mx-1.5">{renderActionLabel(log.action)}</span>
                      {log.resourceName && <span className="text-foreground/80">{log.resourceName}</span>}
                    </span>
                    <span className="text-muted-foreground text-xs">{dayjs(log.createdAt).format('MM-DD HH:mm')}</span>
                  </div>
                  {log.changes && (
                    <div className="text-muted-foreground mt-1 text-xs">
                      {Object.entries(log.changes).map(([field, change]) => (
                        <div key={field}>
                          {field}: {String(change.from ?? '-')} → {String(change.to ?? '-')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <Pager total={logsTotal} page={logsPage} onTo={loadLogs} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条评论吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteComment}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ActivityComments;
