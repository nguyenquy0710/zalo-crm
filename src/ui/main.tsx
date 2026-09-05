import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { bootstrapWebRuntime } from './lib/web/bootstrapWebRuntime';

async function start() {
  // No-op trong Electron thật. Trong trình duyệt: cài web shim + đăng nhập trước
  // khi App (và lib/ipc.ts mà nó kéo theo) được import.
  await bootstrapWebRuntime();

  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
