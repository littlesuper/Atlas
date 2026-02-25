import React, { useState, useEffect, useRef } from 'react';
import { Badge, Empty, Spin, Button, Message } from '@arco-design/web-react';
import { IconNotification, IconCheck, IconDelete } from '@arco-design/web-react/icon';
import { notificationsApi } from '../api';
import { Notification } from '../types';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      Message.success('全部已读');
    } catch {
      Message.error('操作失败');
    }
  };

  const handleClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        await notificationsApi.markRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => n.id === notification.id ? { ...n, isRead: true } : n)
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }

    setVisible(false);

    // Navigate based on type
    if (notification.relatedId) {
      if (notification.type === 'REPORT_REMINDER') {
        navigate(`/projects/${notification.relatedId}?tab=weekly`);
      } else {
        // ACTIVITY_DUE and MILESTONE_APPROACHING - navigate to project detail
        navigate(`/projects/${notification.relatedId}`);
      }
    }
  };

  const handleDelete = async (e: React.MouseEvent | Event, id: string) => {
    e.stopPropagation();
    try {
      await notificationsApi.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      Message.success('已删除');
    } catch {
      Message.error('删除失败');
    }
  };

  const typeIcon: Record<string, string> = {
    ACTIVITY_DUE: '⏰',
    MILESTONE_APPROACHING: '🎯',
    REPORT_REMINDER: '📝',
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <Badge count={unreadCount} dot={unreadCount > 0}>
        <div
          style={{
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.2s',
          }}
          onClick={() => {
            setVisible(!visible);
            if (!visible) load();
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <IconNotification style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)' }} />
        </div>
      </Badge>

      {visible && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          width: 360,
          maxHeight: 480,
          background: 'var(--color-bg-2)',
          border: '1px solid var(--color-border-2)',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>通知 {unreadCount > 0 && `(${unreadCount})`}</span>
            {unreadCount > 0 && (
              <Button size="mini" type="text" icon={<IconCheck />} onClick={handleMarkAllRead}>
                全部已读
              </Button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : notifications.length === 0 ? (
              <Empty description="暂无通知" style={{ padding: 40 }} />
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-fill-2)',
                    background: n.isRead ? 'transparent' : 'var(--color-primary-light-1)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-fill-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = n.isRead ? 'transparent' : 'var(--color-primary-light-1)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: n.isRead ? 400 : 600 }}>
                        <span style={{ marginRight: 6 }}>{typeIcon[n.type] || '🔔'}</span>
                        {n.title}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: 'var(--color-text-3)',
                        marginTop: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {n.content}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-4)', marginTop: 4 }}>
                        {dayjs(n.createdAt).format('MM-DD HH:mm')}
                      </div>
                    </div>
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconDelete />}
                      style={{ flexShrink: 0, marginLeft: 8 }}
                      onClick={(e) => handleDelete(e, n.id)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
