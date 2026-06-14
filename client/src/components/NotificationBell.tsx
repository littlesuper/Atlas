import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Bell, Check, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { notificationsApi } from '../api';
import { Notification } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function getNotificationRoute(notification: { type: string; relatedId?: string | null }): string | null {
  if (!notification.relatedId) return null;
  if (notification.type === 'REPORT_REMINDER') {
    return `/projects/${notification.relatedId}?tab=weekly`;
  } else if (notification.type === 'RISK_ESCALATION' || notification.type === 'RISK_ALERT') {
    return `/projects/${notification.relatedId}?tab=risk`;
  }
  return `/projects/${notification.relatedId}`;
}

const typeIcon: Record<string, string> = {
  ACTIVITY_DUE: '⏰',
  MILESTONE_APPROACHING: '🎯',
  REPORT_REMINDER: '📝',
  RISK_ESCALATION: '🔺',
  RISK_ALERT: '⚠️',
};

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, pageSize: 20 });
      setNotifications(res.data.data || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Refresh every 5 minutes
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setVisible(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('全部已读');
    } catch {
      toast.error('操作失败');
    }
  };

  const handleClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await notificationsApi.markRead(notification.id);
        setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* ignore */
      }
    }

    setVisible(false);

    const route = getNotificationRoute(notification);
    if (route) navigate(route);
  };

  const handleDelete = async (e: React.MouseEvent | Event, id: string) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  // 计算面板位置（基于铃铛按钮）
  const getPanelPos = () => {
    const el = bellRef.current;
    if (!el) return { top: 60, right: 24 };
    const rect = el.getBoundingClientRect();
    return { top: rect.bottom + 8, right: window.innerWidth - rect.right };
  };
  const pos = getPanelPos();

  return (
    <div ref={panelRef} className="relative">
      <div
        ref={bellRef}
        role="button"
        tabIndex={0}
        aria-label="通知"
        data-testid="notification-bell"
        style={{ cursor: 'pointer' }}
        className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex items-center rounded-md p-1.5 transition-colors"
        onClick={() => {
          setVisible(!visible);
          if (!visible) load();
        }}
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span data-testid="notification-dot" className="absolute top-1 right-1 size-2 rounded-full bg-red-500" />
        )}
      </div>

      {visible &&
        createPortal(
          <div
            ref={portalRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, width: 360, maxHeight: 480, zIndex: 9999 }}
            className="bg-popover text-popover-foreground overflow-hidden rounded-lg border shadow-lg"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">通知 {unreadCount > 0 && `(${unreadCount})`}</span>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleMarkAllRead}>
                  <Check className="size-3.5" />
                  全部已读
                </Button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">暂无通知</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      'hover:bg-accent flex cursor-pointer items-start justify-between gap-2 border-b px-4 py-2.5 transition-colors last:border-b-0',
                      !n.isRead && 'bg-muted/50'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-[13px]', n.isRead ? 'font-normal' : 'font-semibold')}>
                        <span className="mr-1.5">{typeIcon[n.type] || '🔔'}</span>
                        {n.title}
                      </div>
                      <div className="text-muted-foreground mt-1 truncate text-xs">{n.content}</div>
                      <div className="text-muted-foreground/70 mt-1 text-[11px]">
                        {dayjs(n.createdAt).format('MM-DD HH:mm')}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除通知"
                      className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                      onClick={(e) => handleDelete(e, n.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationBell;
