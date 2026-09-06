/**
 * OpenAPI 3.0 spec cho REST API của HttpRelayService (Boss relay server, mặc định port 9900).
 * Served qua GET /api/docs (Swagger UI) và GET /api/docs/openapi.json — xem HttpRelayService.ts.
 *
 * File này chỉ khai báo 8 endpoint "lõi" (auth/proxy/sync/media/health/SSE) — được viết tay vì
 * đây là các endpoint ổn định, ít thay đổi. Toàn bộ ~170 route còn lại (/api/query/*,
 * /api/command/*, /api/search/*, /api/library/*) được enumerate tự động từ RestApiHandlers.ts
 * vào openapiPaths.generated.ts (script/agent tạo ra — không sửa tay file đó, chạy lại generator
 * nếu route mới được thêm vào handleRestApi()).
 */
import { generatedPaths, generatedTags } from './openapiPaths.generated';

const corePaths = {
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Đăng nhập employee, trả về JWT token + snapshot dữ liệu ban đầu',
      operationId: 'login',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string' },
                password: { type: 'string', format: 'password' },
                callbackUrl: { type: 'string', description: 'URL local server của employee để Boss push event (LAN mode) — bỏ trống nếu dùng SSE/Socket.IO' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Đăng nhập thành công',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  token: { type: 'string' },
                  employee: { type: 'object' },
                  snapshot: { type: 'object', description: 'Toàn bộ state cần thiết để employee bootstrap UI' },
                },
              },
            },
          },
        },
        '401': { description: 'Sai username/password' },
      },
    },
  },
  '/api/auth/heartbeat': {
    post: {
      tags: ['Auth'],
      summary: 'Employee báo còn sống — reset offline timer, cập nhật callbackUrl nếu đổi',
      operationId: 'heartbeat',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                callbackUrl: { type: 'string' },
                sseAlive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/api/setup/bootstrap-admin': {
    post: {
      tags: ['Auth'],
      summary: 'Tạo employee "boss" đầu tiên (full quyền) — CHỈ hoạt động khi DB chưa có employee nào. Dùng cho triển khai headless/Docker vốn không có UI desktop để tạo employee qua IPC. Tự khoá lại (trả 403) ngay khi đã có >=1 employee.',
      operationId: 'bootstrapAdmin',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string' },
                password: { type: 'string', format: 'password' },
                display_name: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Tạo thành công' },
        '400': { description: 'Thiếu username/password hoặc dữ liệu không hợp lệ' },
        '403': { description: 'Đã có employee — endpoint chỉ dùng cho lần khởi tạo đầu tiên' },
      },
    },
  },
  '/api/proxy/action': {
    post: {
      tags: ['Proxy'],
      summary: 'Thực thi một IPC channel (vd zalo:sendMessage, crm:createCampaign...) thay mặt employee đã đăng nhập. Đây là cơ chế chính để employee thao tác dữ liệu — hầu hết hành động ghi đi qua đây thay vì /api/command/*.',
      operationId: 'proxyAction',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['channel'],
              properties: {
                channel: { type: 'string', description: 'IPC channel name, vd "zalo:sendMessage"' },
                params: { type: 'object', description: 'Tham số truyền cho handler tương ứng — tuỳ theo channel' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Kết quả thực thi (shape tuỳ channel)' },
        '401': { description: 'Unauthorized' },
        '500': { description: 'Lỗi khi thực thi handler' },
      },
    },
  },
  '/api/sync/snapshot': {
    get: {
      tags: ['Sync'],
      summary: 'Lấy lại toàn bộ snapshot state (permissions, accounts, employee list...) — dùng khi employee reconnect sau khi mất kết nối',
      operationId: 'syncSnapshot',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'OK' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/api/media/upload': {
    post: {
      tags: ['Media'],
      summary: 'Upload file đính kèm (multipart/form-data) — dùng trước khi gửi ảnh/file/video qua /api/proxy/action',
      operationId: 'mediaUpload',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      },
      responses: {
        '200': { description: 'Upload thành công, trả về đường dẫn/URL file' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  '/api/health': {
    get: {
      tags: ['System'],
      summary: 'Healthcheck — không yêu cầu xác thực',
      operationId: 'health',
      security: [],
      responses: {
        '200': {
          description: 'Server đang chạy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  relay: { type: 'boolean' },
                  port: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/events/stream': {
    get: {
      tags: ['Realtime'],
      summary: 'Server-Sent Events stream — nhận real-time event (tin nhắn mới, cập nhật CRM/ERP...) song song/thay thế Socket.IO',
      operationId: 'eventsStream',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'text/event-stream — kết nối giữ mở liên tục',
          content: { 'text/event-stream': { schema: { type: 'string' } } },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
};

const coreTags = [
  { name: 'Auth', description: 'Employee login / heartbeat / bootstrap employee đầu tiên' },
  { name: 'Proxy', description: 'Generic proxy tới IPC handler registry — thay mặt employee thực thi hành động Zalo/Facebook/Telegram/CRM/Workflow' },
  { name: 'Sync', description: 'Full-state snapshot cho employee mới connect / reconnect' },
  { name: 'Media', description: 'Upload file đính kèm trước khi gửi' },
  { name: 'Realtime', description: 'Server-Sent Events stream' },
  { name: 'System', description: 'Health check' },
];

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ZaloCRM Boss Relay API',
    version: '1.0.0',
    description:
      'REST API do HttpRelayService (Boss) expose cho Employee mode và cho triển khai headless/Docker. ' +
      'Hầu hết endpoint yêu cầu header `Authorization: Bearer <token>` (lấy từ POST /api/auth/login), ' +
      'trừ /api/auth/login, /api/setup/bootstrap-admin, /api/health, và một số endpoint serving file ' +
      'media/library (bảo mật bằng độ khó đoán của tunnel URL, không bằng JWT — xem ghi chú từng route).',
  },
  servers: [{ url: '/', description: 'Relative — cùng host:port với Boss relay server (mặc định 9900)' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {},
          error: { type: 'string' },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [...coreTags, ...generatedTags],
  paths: { ...corePaths, ...generatedPaths },
};

export default openapiSpec;
