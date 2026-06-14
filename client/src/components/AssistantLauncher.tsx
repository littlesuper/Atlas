import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AssistantLauncherProps {
  /** 当前路由的项目上下文；非项目页为 null */
  projectId: string | null;
}

/**
 * 右下角常驻 AI 助手按钮：点击跳转到全屏聊天页 /assistant，带当前项目上下文。
 */
const AssistantLauncher: React.FC<AssistantLauncherProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const go = () => navigate(projectId ? `/assistant?project=${projectId}` : '/assistant');

  return (
    <Button
      size="icon"
      aria-label="打开 AI 助手"
      onClick={go}
      className="fixed right-6 bottom-6 z-[1000] size-12 rounded-full shadow-lg"
    >
      <Bot className="size-5" />
    </Button>
  );
};

export default AssistantLauncher;
