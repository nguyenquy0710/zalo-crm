// Script tạm tạo employee đầu tiên trong DB headless - chỉ dùng khi test, không phải
// code chạy trong app. Lý do cần: employee:create bị chặn cứng qua /api/proxy/action
// (xem HttpRelayService.BOSS_ONLY_CHANNELS) - bản desktop tạo employee qua IPC trực
// tiếp từ UI ERP, nhưng bản headless không có UI đó nên không có cách nào remote tạo
// employee đầu tiên. Chạy 1 lần trong container rồi xoá, không phải bootstrap chính thức.
//
// Cách dùng:
//   docker compose cp .rtk/create-admin-employee.js zalo-crm:/tmp/create-admin-employee.js
//   docker compose exec zalo-crm node /tmp/create-admin-employee.js admin "MatKhau123!" "Admin"
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const [, , username, password, displayName] = process.argv;
if (!username || !password) {
  console.error('Usage: node create-admin-employee.js <username> <password> [displayName]');
  process.exit(1);
}

const dbPath = process.env.ZALOCRM_DB_PATH || '/data/.config/ZaloCRM/zalocrm-tool.db';
const db = new Database(dbPath);

const existing = db.prepare('SELECT employee_id FROM employees WHERE username = ?').get(username.toLowerCase());
if (existing) {
  console.error(`Username "${username}" đã tồn tại (employee_id=${existing.employee_id})`);
  process.exit(1);
}

const employee_id = randomUUID();
const password_hash = bcrypt.hashSync(password, 12);
const now = Date.now();

db.prepare(`
  INSERT INTO employees (employee_id, username, password_hash, display_name, role, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, 'boss', 1, ?, ?)
`).run(employee_id, username.toLowerCase(), password_hash, displayName || username, now, now);

const modules = ['chat', 'friends', 'crm', 'workflow', 'integration', 'analytics', 'ai_assistant', 'settings'];
const insertPerm = db.prepare('INSERT INTO employee_permissions (employee_id, module, can_access) VALUES (?, ?, 1)');
for (const m of modules) insertPerm.run(employee_id, m);

console.log(`Đã tạo employee "${username}" (employee_id=${employee_id}), full quyền tất cả module.`);
db.close();
