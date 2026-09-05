import ReactDOM from 'react-dom/client';
import React from 'react';

/**
 * bootstrapWebRuntime — chạy TRƯỚC khi App mount (gọi từ main.tsx).
 *
 * Nếu đang chạy trong Electron thật, window.electronAPI đã tồn tại (do preload.ts's
 * contextBridge chạy trước cả script renderer) → không làm gì, trả về ngay.
 *
 * Nếu đang mở bằng trình duyệt thường (window.electronAPI undefined): cài
 * electronApiWebShim rồi hiện màn hình đăng nhập Boss, CHỈ resolve sau khi đăng
 * nhập xong. Bắt buộc phải resolve trước khi main.tsx import App — vì lib/ipc.ts
 * đọc window.electronAPI một lần duy nhất lúc module-load (không phải lazy), và
 * store/employeeStore.ts (cần cho chính màn đăng nhập) lại import ipc.ts, nên thứ
 * tự đúng là: cài shim → dynamic-import màn đăng nhập → dynamic-import App.
 */
export async function bootstrapWebRuntime(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return;
  }

  const { electronApiWebShim } = await import('./electronApiWebShim');
  (window as any).electronAPI = electronApiWebShim;

  await new Promise<void>((resolve) => {
    const container = document.getElementById('root')!;
    const root = ReactDOM.createRoot(container);
    import('./WebLoginScreen').then(({ default: WebLoginScreen }) => {
      root.render(
        React.createElement(WebLoginScreen, {
          onLoggedIn: () => {
            root.unmount();
            resolve();
          },
        }),
      );
    });
  });
}
