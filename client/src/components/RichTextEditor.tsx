import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor';
import '@wangeditor/editor/dist/css/style.css';
import { uploadApi } from '../api';

export interface RichTextEditorRef {
  setHtml: (html: string) => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** 粘贴文件时的回调（所有文件类型，包括图片） */
  onPasteFiles?: (files: File[]) => void;
}

const TOOLBAR_KEYS = [
  'bold',
  'italic',
  'underline',
  'color',
  'bgColor',
  '|',
  'headerSelect',
  'bulletedList',
  'numberedList',
  '|',
  'insertLink',
  'uploadImage',
  '|',
  'undo',
  'redo',
];

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value, onChange, placeholder = '请输入内容...', minHeight = 150, onPasteFiles }, ref) => {
    const [editor, setEditor] = useState<IDomEditor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const onPasteFilesRef = useRef(onPasteFiles);
    onPasteFilesRef.current = onPasteFiles;
    // 标记是否已 patch 过 insertData，避免重复 patch
    const patchedRef = useRef(false);

    // 暴露 setHtml 方法给父组件
    useImperativeHandle(ref, () => ({
      setHtml: (html: string) => {
        if (editor) {
          editor.setHtml(html || '');
        }
      },
    }), [editor]);

    // 销毁编辑器
    useEffect(() => {
      return () => {
        if (editor) {
          editor.destroy();
          setEditor(null);
        }
      };
    }, [editor]);

    // 在 Slate 层面 monkey-patch editor.insertData
    // wangEditor 的粘贴流程：paste 事件 → editor.insertData(clipboardData)
    // 所有粘贴的文件（包括图片）都作为附件上传，阻止 wangEditor 默认的内联图片处理
    useEffect(() => {
      if (!editor || patchedRef.current) return;
      patchedRef.current = true;

      const originalInsertData = editor.insertData.bind(editor);

      editor.insertData = (data: DataTransfer) => {
        const cb = onPasteFilesRef.current;
        if (cb) {
          const pastedFiles: File[] = [];

          // 从 DataTransfer.items 收集所有文件
          if (data.items && data.items.length > 0) {
            for (let i = 0; i < data.items.length; i++) {
              const item = data.items[i];
              if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                  pastedFiles.push(file);
                }
              }
            }
          }

          // 兜底：从 DataTransfer.files 收集
          if (pastedFiles.length === 0 && data.files && data.files.length > 0) {
            for (let i = 0; i < data.files.length; i++) {
              pastedFiles.push(data.files[i]);
            }
          }

          if (pastedFiles.length > 0) {
            // 所有文件都作为附件上传（包括图片）
            cb(pastedFiles);
            // 如果剪贴板只有文件（无纯文本/HTML），完全拦截不传给 wangEditor
            const hasText = data.types.includes('text/plain') || data.types.includes('text/html');
            if (!hasText) {
              return; // 阻止 wangEditor 处理（不会内联插入图片）
            }
          }
        }

        // 继续原有流程（处理纯文本/HTML 粘贴等）
        originalInsertData(data);
      };
    }, [editor]);

    const handleChange = useCallback((ed: IDomEditor) => {
      const html = ed.getHtml();
      if (!html || html === '<p><br></p>') {
        onChange('');
      } else {
        onChange(html);
      }
    }, [onChange]);

    const toolbarConfig: Partial<IToolbarConfig> = {
      toolbarKeys: TOOLBAR_KEYS,
    };

    const editorConfig: Partial<IEditorConfig> = {
      placeholder,
      MENU_CONF: {
        uploadImage: {
          async customUpload(file: File, insertFn: (url: string, alt?: string, href?: string) => void) {
            try {
              const res = await uploadApi.upload(file);
              insertFn(res.data.url, res.data.name, '');
            } catch {
              console.error('图片上传失败');
            }
          },
        },
      },
    };

    return (
      <div ref={containerRef} style={{ border: '1px solid #e5e6eb', borderRadius: 4, overflow: 'hidden' }}>
        <Toolbar
          editor={editor}
          defaultConfig={toolbarConfig}
          mode="simple"
          style={{ borderBottom: '1px solid #e5e6eb' }}
        />
        <Editor
          defaultConfig={editorConfig}
          value={value}
          onCreated={setEditor}
          onChange={handleChange}
          mode="simple"
          style={{ minHeight, overflowY: 'hidden' }}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
