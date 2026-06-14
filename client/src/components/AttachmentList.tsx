import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Trash2, FileText, Image as ImageIcon, X } from 'lucide-react';
import { uploadApi } from '../api';
import { ReportAttachment } from '../types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface AttachmentListProps {
  attachments: ReportAttachment[];
  onChange?: (attachments: ReportAttachment[]) => void;
  section: string;
  readOnly?: boolean;
}

/** 判断 URL 是否为可预览的图片 */
export const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt';

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, onChange, section, readOnly = false }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        id: crypto.randomUUID(),
        name: res.data.name,
        url: res.data.url,
        uploadedAt: new Date().toISOString(),
        section: stateRef.current.section,
      };
      stateRef.current.onChange([...stateRef.current.attachments, newAttachment]);
      toast.success('上传成功');
    } catch {
      toast.error('上传失败');
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
      Array.from(files).forEach((f) => handleUpload(f));
    }
  }, [handleUpload]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((f) => handleUpload(f));
    }
    e.target.value = '';
  }, [handleUpload]);

  const handleClick = (att: ReportAttachment) => {
    if (isImageUrl(att.url)) {
      setPreviewUrl(att.url);
    } else {
      window.open(att.url, '_blank', 'noopener,noreferrer');
    }
  };

  // 图片预览遮罩层（shadcn Dialog）
  const previewDialog = (
    <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
      <DialogContent
        showCloseButton={false}
        className="flex max-w-[92vw] items-center justify-center border-none bg-transparent p-0 shadow-none sm:max-w-[92vw]"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭预览"
          onClick={() => setPreviewUrl(null)}
          className="absolute top-2 right-2 z-10 size-9 rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white"
        >
          <X className="size-5" />
        </Button>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="预览"
            className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
          />
        )}
      </DialogContent>
    </Dialog>
  );

  // 只读模式：仅展示附件列表（无拖拽、无上传）
  if (readOnly) {
    if (attachments.length === 0) return null;
    return (
      <>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="bg-muted inline-flex max-w-[260px] items-center gap-1 rounded px-2 py-0.5 text-[13px]"
            >
              {isImageUrl(att.url) ? (
                <ImageIcon className="size-3.5 shrink-0" style={{ color: 'var(--status-success)' }} />
              ) : (
                <FileText className="size-3.5 shrink-0" style={{ color: 'var(--status-info)' }} />
              )}
              <span
                onClick={() => handleClick(att)}
                className="cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap"
                title={att.name}
              >
                {att.name}
              </span>
            </div>
          ))}
        </div>

        {previewDialog}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'mt-2 rounded-md border-2 border-dashed transition-all',
          dragging ? 'p-2.5' : 'border-transparent p-0'
        )}
        style={
          dragging
            ? { borderColor: 'var(--status-info)', background: 'var(--muted)' }
            : undefined
        }
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* 拖拽提示 */}
        {dragging && (
          <div className="py-2 text-center text-[13px]" style={{ color: 'var(--status-info)' }}>
            松开鼠标上传文件
          </div>
        )}

        {/* 已上传列表：多个文件同行排列 */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="bg-muted inline-flex max-w-[260px] items-center gap-1 rounded px-2 py-0.5 text-[13px]"
              >
                {isImageUrl(att.url) ? (
                  <ImageIcon className="size-3.5 shrink-0" style={{ color: 'var(--status-success)' }} />
                ) : (
                  <FileText className="size-3.5 shrink-0" style={{ color: 'var(--status-info)' }} />
                )}
                <span
                  onClick={() => handleClick(att)}
                  className="cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap"
                  title={att.name}
                >
                  {att.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="删除附件"
                  className="text-muted-foreground hover:text-destructive ml-0.5 size-5 shrink-0"
                  onClick={() => handleDelete(att)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 上传进度 */}
        {uploading && (
          <div className="mb-2">
            <Progress value={progress} />
          </div>
        )}

        {/* 上传按钮 + 提示 */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={handleInputChange}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            className="text-muted-foreground border-dashed text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            上传附件
          </Button>
          <span className="text-muted-foreground text-[11px]">点击上传 / 拖拽 / 在输入框内粘贴文件</span>
        </div>
      </div>

      {previewDialog}
    </>
  );
};

export default AttachmentList;
