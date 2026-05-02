import React from 'react';
import ReactDOM from 'react-dom/client';
import { Modal } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import './styles/global.css';
import App from './App';
import { initErrorTracking } from './utils/errorTracking';
import { AtlasFeatureFlagProvider } from './featureFlags/FeatureFlagProvider';

initErrorTracking();

// 全局覆盖 Modal.confirm：默认显示右上角关闭按钮
const _originalConfirm = Modal.confirm;
Modal.confirm = (config) => _originalConfirm({ closable: true, ...config });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AtlasFeatureFlagProvider>
      <App />
    </AtlasFeatureFlagProvider>
  </React.StrictMode>
);
