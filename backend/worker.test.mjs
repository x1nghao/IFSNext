import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerSource = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

// 在受控上下文中加载 worker.js：注入 Service Worker 风格的全局（addEventListener / caches），
// 环境变量通过 globalThis 注入。仅覆盖不依赖外部网络的路由与守卫行为。
function loadWorker({ allowedSpreadsheetIds } = {}) {
  const listeners = {};
  const cacheStore = new Map();
  const cache = {
    default: {
      match: async (key) => cacheStore.get(key),
      put: async (key, response) => { cacheStore.set(key, response); },
      delete: async (key) => { cacheStore.delete(key); },
    },
  };
  const addEventListener = (type, handler) => { listeners[type] = handler; };

  if (allowedSpreadsheetIds === undefined) {
    delete globalThis.ALLOWED_SPREADSHEET_IDS;
  } else {
    globalThis.ALLOWED_SPREADSHEET_IDS = allowedSpreadsheetIds;
  }

  new Function('addEventListener', 'caches', workerSource)(addEventListener, cache);

  return {
    handle(request) {
      let captured;
      const event = {
        request,
        waitUntil: () => {},
        respondWith: (promise) => { captured = promise; },
      };
      listeners.fetch(event);
      return captured;
    },
  };
}

test('缺少 spreadsheet_id 返回 400', async () => {
  const worker = loadWorker();
  const response = await worker.handle(new Request('https://worker.test/data'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Missing spreadsheet_id' });
});

test('白名单外的表格在 /data 与 /verify 上均返回 403', async () => {
  const worker = loadWorker({ allowedSpreadsheetIds: 'id-1, id-2' });

  const dataResponse = await worker.handle(new Request('https://worker.test/data?spreadsheet_id=evil'));
  assert.equal(dataResponse.status, 403);
  assert.deepEqual(await dataResponse.json(), { error: 'Spreadsheet not allowed' });

  const verifyResponse = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=evil&agent_name=Alpha', { method: 'POST' })
  );
  assert.equal(verifyResponse.status, 403);
});

test('白名单内的表格放行（无凭据时返回 500 的自有错误信息）', async () => {
  const worker = loadWorker({ allowedSpreadsheetIds: 'id-1' });
  const response = await worker.handle(new Request('https://worker.test/data?spreadsheet_id=id-1'));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Missing Google Service Account credentials');
});

test('未设置白名单时保持旧行为（不限制表格）', async () => {
  const worker = loadWorker();
  const response = await worker.handle(new Request('https://worker.test/data?spreadsheet_id=any'));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Missing Google Service Account credentials');
});

test('未知路径返回 404', async () => {
  const worker = loadWorker();
  const response = await worker.handle(new Request('https://worker.test/other?spreadsheet_id=x'));
  assert.equal(response.status, 404);
});

test('OPTIONS 预检返回 CORS 头', async () => {
  const worker = loadWorker();
  const response = await worker.handle(new Request('https://worker.test/data', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
});
