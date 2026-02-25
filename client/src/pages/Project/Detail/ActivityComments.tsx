import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Input,
  Button,
  Space,
  Empty,
  Message,
  Spin,
  Modal,
  Avatar,
  Pagination,
} from '@arco-design/web-react';
import { IconDelete, IconSend } from '@arco-design/web-react/icon';
import { activityCommentsApi, auditLogsApi } from '../../../api';
import { ActivityComment, AuditLog } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import dayjs from 'dayjs';

interface Props {
  activityId: string;
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

  const loadComments = async (page = 1) => {
    setCommentsLoading(true);
    try {
      const res = await activityCommentsApi.list(activityId, { page, pageSize: 10 });
      setComments(res.data.data || []);
      setCommentsTotal(res.data.total || 0);
      setCommentsPage(page);
    } catch {
      Message.error('加载评论失败');
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadLogs = async (page = 1) => {
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
      Message.error('加载变更历史失败');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'comments') {
      loadComments(1);
    } else {
      loadLogs(1);
    }
  }, [activityId, activeTab]);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await activityCommentsApi.create({ activityId, content: newComment.trim() });
      setNewComment('');
      Message.success('评论已发送');
      loadComments(1);
    } catch {
      Message.error('发送评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
      onOk: async () => {
        try {
          await activityCommentsApi.delete(commentId);
          Message.success('评论已删除');
          loadComments(commentsPage);
        } catch {
          Message.error('删除失败');
        }
      },
    });
  };

  const renderActionLabel = (action: string) => {
    switch (action) {
      case 'CREATE': return '创建';
      case 'UPDATE': return '更新';
      case 'DELETE': return '删除';
      default: return action;
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Tabs activeTab={activeTab} onChange={setActiveTab} size="small">
        <Tabs.TabPane key="comments" title={`评论 (${commentsTotal})`}>
          {/* Comment input */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input.TextArea
              placeholder="输入评论..."
              value={newComment}
              onChange={setNewComment}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <Button
              type="primary"
              icon={<IconSend />}
              loading={submitting}
              onClick={handleSubmitComment}
              disabled={!newComment.trim()}
            />
          </div>

          {commentsLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
          ) : comments.length === 0 ? (
            <Empty description="暂无评论" />
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {comments.map((c) => (
                <div key={c.id} style={{
                  padding: '10px 12px',
                  background: 'var(--color-fill-1)',
                  borderRadius: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Space size={8}>
                      <Avatar size={24} style={{ background: 'var(--color-primary-light-4)', fontSize: 12 }}>
                        {(c.user?.realName || '?')[0]}
                      </Avatar>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{c.user?.realName || c.user?.username}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                        {dayjs(c.createdAt).format('MM-DD HH:mm')}
                      </span>
                    </Space>
                    {(c.userId === user?.id) && (
                      <Button
                        type="text"
                        size="mini"
                        icon={<IconDelete />}
                        status="danger"
                        onClick={() => handleDeleteComment(c.id)}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-1)', whiteSpace: 'pre-wrap', paddingLeft: 32 }}>
                    {c.content}
                  </div>
                </div>
              ))}
              {commentsTotal > 10 && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Pagination
                    size="small"
                    total={commentsTotal}
                    current={commentsPage}
                    pageSize={10}
                    onChange={(p) => loadComments(p)}
                  />
                </div>
              )}
            </Space>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane key="history" title="变更历史">
          {logsLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
          ) : logs.length === 0 ? (
            <Empty description="暂无变更历史" />
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {logs.map((log) => (
                <div key={log.id} style={{
                  padding: '8px 12px',
                  background: 'var(--color-fill-1)',
                  borderRadius: 6,
                  fontSize: 13,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <strong>{log.userName}</strong>
                      <span style={{ color: 'var(--color-text-3)', margin: '0 6px' }}>{renderActionLabel(log.action)}</span>
                      {log.resourceName && <span style={{ color: 'var(--color-text-2)' }}>{log.resourceName}</span>}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                      {dayjs(log.createdAt).format('MM-DD HH:mm')}
                    </span>
                  </div>
                  {log.changes && (
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-3)' }}>
                      {Object.entries(log.changes).map(([field, change]) => (
                        <div key={field}>
                          {field}: {String(change.from ?? '-')} → {String(change.to ?? '-')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {logsTotal > 10 && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Pagination
                    size="small"
                    total={logsTotal}
                    current={logsPage}
                    pageSize={10}
                    onChange={(p) => loadLogs(p)}
                  />
                </div>
              )}
            </Space>
          )}
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default ActivityComments;
