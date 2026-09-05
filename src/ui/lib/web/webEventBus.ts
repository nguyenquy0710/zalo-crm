/**
 * webEventBus.ts — push-event pub/sub cho bản web (trình duyệt, không có Electron).
 *
 * Thay thế ipcRenderer.on/removeAllListeners (electron/preload.ts) khi chạy trong
 * trình duyệt: SocketIOClient nhận event từ Boss qua Socket.IO rồi feed vào bus này,
 * còn window.electronAPI.on/removeAllListeners (xem electronApiWebShim.ts) chỉ là
 * wrapper mỏng quanh bus — giữ đúng contract callback(...args) + trả về unsub()
 * giống hệt preload.ts để toàn bộ code renderer hiện có (App.tsx, useChatEvents...)
 * không cần sửa gì.
 */
import SocketIOClient from '../../../services/socket/SocketIOClient';

type Listener = (...args: any[]) => void;

const listeners = new Map<string, Set<Listener>>();
let client: SocketIOClient | null = null;

function dispatch(channel: string, data: any): void {
  const set = listeners.get(channel);
  if (!set || set.size === 0) return;
  for (const cb of set) {
    try { cb(data); } catch (err) { console.error(`[webEventBus] listener error on "${channel}":`, err); }
  }
}

/** Kết nối Socket.IO tới Boss — gọi 1 lần sau khi login thành công (xem bootstrapWebRuntime.ts). */
export function connectWebEventBus(bossUrl: string, token: string): void {
  if (!client) client = new SocketIOClient();
  client.setOnEvent(dispatch);
  client.connect(bossUrl, token);
}

export function disconnectWebEventBus(): void {
  client?.disconnect();
}

/** Mirror của preload.ts's `on(channel, callback)` — trả về unsub(). */
export function on(channel: string, callback: Listener): () => void {
  let set = listeners.get(channel);
  if (!set) { set = new Set(); listeners.set(channel, set); }
  set.add(callback);
  return () => { set!.delete(callback); };
}

/** Mirror của preload.ts's `removeAllListeners(channel)`. */
export function removeAllListeners(channel: string): void {
  listeners.delete(channel);
}
