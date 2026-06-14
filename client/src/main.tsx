import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import './index.css';
import App from './App';
import { initMonitoring } from './utils/monitoring';

initMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
