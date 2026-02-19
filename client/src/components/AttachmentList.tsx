import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Message, Button, Space, Progress } from '@arco-design/web-react';
import { IconUpload, IconDelete, IconFile, IconImage, IconClose } from '@arco-design/web-react/icon';
import { uploadApi } from '../api';
import { ReportAttachment } from '../types';

interface AttachmentListProps {
  attachments: ReportAttachment[];
  onChange?: (attachments: ReportAttachment[]) => void;
  section: string;
  readOnly?: boolean;
}

/** 判断 URL 是否为可预览的图片 */
const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, onChange, section, readOnly = false }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dragCounter = useRef(0);
  // 用 ref 持有最新 state，避免 handleUpload 闭包过期
  const stateRef = useRef({ attachments, onChange: onChange || (() => {}), section });
  stateRef.current = { attachments, onChange: onChange || (() => {}), section };

  // ESC 关闭预览
  useEffect(() => {
    if (!previewUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewUrl(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewUrl]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      const res = await uploadApi.upload(file, (p) => setProgress(p));
      const newAttachment: ReportAttachment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: res.data.name,
        url: res.data.url,
        uploadedAt: new Date().toISOString(),
        section: stateRef.current.section,
      };
      stateRef.current.onChange([...stateRef.current.attachments, newAttachment]);
      Message.success('上传成功');
    } catch {
      Message.error('上传失败');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, []);

  const handleDelete = async (attachment: ReportAttachment) => {
    try {
      const filename = attachment.url.split('/').pop();
      if (filename) {
        await uploadApi.delete(filename);
      }
    } catch {
      // 文件可能已不存在，静默处理
    }
    onChange?.(attachments.filter((a) => a.id !== attachment.id));
  };

  // 拖拽处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        handleUpload(files[i]);
      }
    }
  }, [handleUpload]);

  const handleClick = (att: ReportAttachment) => {
    if (isImageUrl(att.url)) {
      setPreviewUrl(att.url);
    } else {
      window.open(att.url, '_blank', 'noopener,noreferrer');
    }
  };

  // 只读模式：仅展示附件列表（无拖拽、无上传）
  if (readOnly) {
    if (attachments.length === 0) return null;
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                background: '#f7f8fa',
                borderRadius: 4,
                fontSize: 13,
                maxWidth: 260,
              }}
            >
              {isImageUrl(att.url) ? (
                <IconImage style={{ color: '#00b42a', flexShrink: 0 }} />
              ) : (
                <IconFile style={{ color: '#4080ff', flexShrink: 0 }} />
              )}
              <span
                onClick={() => handleClick(att)}
                style={{
                  color: '#1d2129',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={att.name}
              >
                {att.name}
              </span>
            </div>
          ))}
        </div>

        {/* 图片预览遮罩层 */}
        {previewUrl && (
          <div
            onClick={() => setPreviewUrl(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'zoom-out',
            }}
          >
            <Button
              shape="circle"
              size="large"
              icon={<IconClose style={{ fontSize: 20, color: '#fff' }} />}
              onClick={() => setPreviewUrl(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
              }}
            />
            <img
              src={previewUrl}
              alt="预览"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: 4,
                cursor: 'default',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div
        style={{
          marginTop: 8,
          border: dragging ? '2px dashed #4080ff' : '2px dashed transparent',
          borderRadius: 6,
          padding: dragging ? 10 : 0,
          background: dragging ? '#f0f5ff' : 'transparent',
          transition: 'all 0.2s',
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 拖拽提示 */}
        {dragging && (
          <div style={{ textAlign: 'center', color: '#4080ff', fontSize: 13, padding: '8px 0' }}>
            松开鼠标上传文件
          </div>
        )}

        {/* 已上传列表：多个文件同行排列 */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  background: '#f7f8fa',
                  borderRadius: 4,
                  fontSize: 13,
                  maxWidth: 260,
                }}
              >
                {isImageUrl(att.url) ? (
                  <IconImage style={{ color: '#00b42a', flexShrink: 0 }} />
                ) : (
                  <IconFile style={{ color: '#4080ff', flexShrink: 0 }} />
                )}
                <span
                  onClick={() => handleClick(att)}
                  style={{
                    color: '#1d2129',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={att.name}
                >
                  {att.name}
                </span>
                <Button
                  type="text"
                  size="mini"
                  icon={<IconDelete />}
                  status="danger"
                  style={{ flexShrink: 0, marginLeft: 2 }}
                  onClick={() => handleDelete(att)}
                />
              </div>
            ))}
          </div>
        )}

        {/* 上传进度 */}
        {uploading && (
          <div style={{ marginBottom: 8 }}>
            <Progress percent={progress} size="small" />
          </div>
        )}

        {/* 上传按钮 + 提示 */}
        <Space size={8} align="center">
          <Upload
            autoUpload={false}
            showUploadList={false}
            onChange={(_fileList, currentFile) => {
              if (currentFile.originFile) {
                handleUpload(currentFile.originFile);
              }
            }}
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          >
            <Button
              type="text"
              size="small"
              icon={<IconUpload />}
              loading={uploading}
              style={{ color: '#86909c', fontSize: 12 }}
            >
              上传附件
            </Button>
          </Upload>
          <span style={{ color: '#c2c7d0', fontSize: 11 }}>点击上传 / 拖拽 / 在输入框内粘贴文件</span>
        </Space>
      </div>

      {/* 图片预览遮罩层 */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* 关闭按钮 */}
          <Button
            shape="circle"
            size="large"
            icon={<IconClose style={{ fontSize: 20, color: '#fff' }} />}
            onClick={() => setPreviewUrl(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
            }}
          />
          <img
            src={previewUrl}
            alt="预览"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 4,
              cursor: 'default',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      )}
    </>
  );
};

export default AttachmentList;
