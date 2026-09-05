import React, { useEffect, useState } from 'react';
import RestQueryService from '../../../services/http/RestQueryService';
import { useEmployeeStore } from '../../store/employeeStore';
import { connectWebEventBus } from './webEventBus';

/**
 * WebLoginScreen — màn hình đăng nhập cho bản web (trình duyệt, không phải Electron).
 *
 * Khác với components/auth/EmployeeLoginScreen.tsx (dùng cho desktop Employee mode):
 * không có lựa chọn "chế độ BOSS" (trình duyệt luôn là 1 client kết nối tới Boss server),
 * và không gọi ipc.employee.setMode/connectToBoss (những hàm đó điều khiển tiến trình
 * Electron main cục bộ — không tồn tại trong trình duyệt). Thay vào đó set thẳng
 * useEmployeeStore + mở kết nối Socket.IO qua connectWebEventBus.
 *
 * Không lưu token vào localStorage (chỉ lưu bossUrl/username cho tiện điền lại) —
 * giống chính sách bảo mật của EmployeeLoginScreen: mỗi phiên trình duyệt phải
 * nhập lại mật khẩu.
 */

const STORAGE_KEY = 'zalocrm_web_login';

interface Props {
  onLoggedIn: () => void;
}

export default function WebLoginScreen({ onLoggedIn }: Props) {
  const [bossUrl, setBossUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.bossUrl) setBossUrl(data.bossUrl);
        if (data.username) setUsername(data.username);
      }
    } catch { /* ignore */ }
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!bossUrl.trim()) { setError('Vui lòng nhập địa chỉ máy chủ'); return; }
    if (!username.trim()) { setError('Vui lòng nhập tên đăng nhập'); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu'); return; }

    setConnecting(true);
    try {
      const loginRes: any = await RestQueryService.login(bossUrl.trim(), username.trim(), password);
      if (!loginRes.success) {
        setError(loginRes.error || 'Đăng nhập thất bại');
        setConnecting(false);
        return;
      }

      const token = loginRes.token || loginRes.data?.token;
      const employee = loginRes.employee || loginRes.data?.employee;
      if (!token || !employee) {
        setError('Phản hồi từ máy chủ không hợp lệ');
        setConnecting(false);
        return;
      }

      RestQueryService.getInstance().init(bossUrl.trim(), token);
      RestQueryService.getInstance().setOnStatusChange((connected, latency) => {
        useEmployeeStore.getState().setBossConnected(connected);
        if (latency > 0) useEmployeeStore.getState().setLatency(latency);
      });
      connectWebEventBus(bossUrl.trim(), token);

      const permsMap: Record<string, boolean> = {};
      for (const p of employee.permissions || []) permsMap[p.module] = p.can_access;

      const store = useEmployeeStore.getState();
      store.setCurrentEmployee(employee);
      store.setPermissions(permsMap);
      store.setAssignedAccounts(employee.assigned_accounts || []);
      store.setBossUrl(bossUrl.trim());
      store.setBossConnected(true);
      store.setToken(token);
      store.setMode('employee');

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ bossUrl: bossUrl.trim(), username: username.trim() }));

      onLoggedIn();
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối');
      setConnecting(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center">
          <h1 className="text-xl font-bold text-white mb-1">ZaloCRM</h1>
          <p className="text-sm text-gray-400">Đăng nhập vào máy chủ</p>
        </div>

        <div className="px-6 pb-6 space-y-3">
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Địa chỉ máy chủ</label>
            <input
              value={bossUrl} onChange={e => setBossUrl(e.target.value)}
              placeholder="https://zalocrm.example.com hoặc 192.168.1.100:9900"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Tên đăng nhập</label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="nhanvien01"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Mật khẩu</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={connecting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {connecting ? 'Đang kết nối...' : 'Đăng nhập'}
          </button>
        </div>

        <div className="px-6 py-3 border-t border-gray-700/50 text-center">
          <p className="text-[10px] text-gray-400">ZaloCRM - Quản lý Zalo & Facebook đa tài khoản</p>
        </div>
      </div>
    </div>
  );
}
