import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerSource = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

// 在受控上下文中加载 worker.js：注入 Service Worker 风格的全局（addEventListener / caches），
// 环境变量与 fetch 通过 globalThis / 参数注入。仅覆盖不依赖真实外部网络的行为。
function loadWorker({ allowedSpreadsheetIds, fetchImpl, credentials } = {}) {
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
  if (credentials) {
    globalThis.GOOGLE_PRIVATE_KEY = credentials.privateKey;
    globalThis.GOOGLE_CLIENT_EMAIL = credentials.clientEmail;
  } else {
    delete globalThis.GOOGLE_PRIVATE_KEY;
    delete globalThis.GOOGLE_CLIENT_EMAIL;
  }

  const fetchStub = fetchImpl || (async () => { throw new Error('network disabled in tests'); });
  // fetch 作为参数注入 worker 作用域，测试中可拦截对 Google 的请求
  new Function('addEventListener', 'caches', 'fetch', workerSource)(addEventListener, cache, fetchStub);

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

// 生成真实 RSA 测试密钥（PEM），使 getAccessToken 的 JWT 签名可执行
async function generateTestPem() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  let binary = '';
  for (const byte of new Uint8Array(pkcs8)) binary += String.fromCharCode(byte);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
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

test('OPTIONS 预检返回 CORS 头', async () => {
  const worker = loadWorker();
  const response = await worker.handle(new Request('https://worker.test/data', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
});

// ── /form-check ──

const FORM_HTML_OPEN = '<html><head><title>IFS Check-in - Google 表单</title></head><body><script>var FB_PUBLIC_LOAD_DATA_ = [null,null,"IFS Check-in",[]];</script></body></html>';
const FORM_HTML_CLOSED = '<html><head><title>IFS Check-in</title></head><body><div class="freebirdFormviewerViewResponseClosedMessage">已停止</div><script>var FB_PUBLIC_LOAD_DATA_ = [];</script></body></html>';

function formCheckFetchStub({ formStatus = 200, formHtml = FORM_HTML_OPEN, sheetTitles } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    }
    if (u.includes('/viewform')) {
      return new Response(formHtml, { status: formStatus });
    }
    if (u.includes('sheets.googleapis.com/v4/spreadsheets/')) {
      return new Response(JSON.stringify(sheetTitles ?? { sheets: [{ properties: { title: 'Data' } }, { properties: { title: 'Form Responses 1' } }] }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
}

test('form-check 缺少 form_url 返回 400', async () => {
  const worker = loadWorker({ allowedSpreadsheetIds: 'sheet-1' });
  const response = await worker.handle(new Request('https://worker.test/form-check?spreadsheet_id=sheet-1'));
  assert.equal(response.status, 400);
});

test('form-check 非 Google 表单返回 supported:false', async () => {
  const worker = loadWorker({ allowedSpreadsheetIds: 'sheet-1' });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://example.com/my-form') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.supported, false);
  assert.equal(body.exists, null);
});

test('form-check 检测到开放表单且表格含表单响应工作表', async () => {
  const pem = await generateTestPem();
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: formCheckFetchStub({ formStatus: 200, formHtml: FORM_HTML_OPEN }),
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://docs.google.com/forms/d/e/FORM123/viewform') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.supported, true);
  assert.equal(body.exists, true);
  assert.equal(body.acceptingResponses, true);
  assert.equal(body.linkedLikely, true);
  assert.equal(body.title, 'IFS Check-in');
});

test('form-check 检测到已停止收集回复', async () => {
  const pem = await generateTestPem();
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: formCheckFetchStub({ formStatus: 200, formHtml: FORM_HTML_CLOSED }),
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://docs.google.com/forms/d/e/FORM123/viewform') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.exists, true);
  assert.equal(body.acceptingResponses, false);
});

test('form-check 表单 404 返回 exists:false', async () => {
  const pem = await generateTestPem();
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: formCheckFetchStub({ formStatus: 404 }),
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://docs.google.com/forms/d/e/GONE/viewform') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.exists, false);
  assert.equal(body.linkedLikely, null);
});

test('form-check 表格无表单响应工作表时 linkedLikely:false', async () => {
  const pem = await generateTestPem();
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: formCheckFetchStub({ sheetTitles: { sheets: [{ properties: { title: 'Data' } }] } }),
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://docs.google.com/forms/d/e/FORM123/viewform') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.exists, true);
  assert.equal(body.linkedLikely, false);
});

test('form-check 表单页缺少 FB_PUBLIC_LOAD_DATA_ 时返回未知状态', async () => {
  const pem = await generateTestPem();
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: formCheckFetchStub({ formHtml: '<html><body>consent page</body></html>' }),
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  const response = await worker.handle(
    new Request('https://worker.test/form-check?form_url=' + encodeURIComponent('https://docs.google.com/forms/d/e/FORM123/viewform') + '&spreadsheet_id=sheet-1')
  );
  const body = await response.json();
  assert.equal(body.supported, true);
  assert.equal(body.exists, null);
  assert.equal(body.acceptingResponses, null);
});

// ── /verify 目标状态语义 ──

// /verify 流程桩：oauth 换 token → 读 A:E → （需要时）PUT 写单元格；记录调用供断言
function verifyFetchStub(sheetRows) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body || null });
    if (u.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    }
    if (u.includes('/values/Data!A:E')) {
      return new Response(JSON.stringify({ values: sheetRows }), { status: 200 });
    }
    if (init.method === 'PUT') {
      return new Response(JSON.stringify({ updatedCells: 1 }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  return { impl, calls };
}

// 名单：A 列 PV，E 列名字；Alpha 未签到，Beta 已签到
const VERIFY_SHEET_ROWS = [
  ['TRUE/FALSE', '', 'Faction', '', 'Name'],
  ['FALSE', '', 'Resistance', '', 'Alpha'],
  ['TRUE', '', 'Enlightened', '', 'Beta'],
];

async function loadVerifyWorker(sheetRows = VERIFY_SHEET_ROWS) {
  const pem = await generateTestPem();
  const stub = verifyFetchStub(sheetRows);
  const worker = loadWorker({
    allowedSpreadsheetIds: 'sheet-1',
    fetchImpl: stub.impl,
    credentials: { privateKey: pem, clientEmail: 'sa@test.iam.gserviceaccount.com' },
  });
  return { worker, calls: stub.calls };
}

test('verify 带 value=TRUE 且当前 FALSE 时写入 TRUE', async () => {
  const { worker, calls } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Alpha&value=TRUE', { method: 'POST' })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'success');
  assert.equal(body.new_value, 'TRUE');
  const put = calls.find(c => c.method === 'PUT');
  assert.ok(put, '应发起 PUT 写入');
  assert.match(put.url, /Data!A2\?valueInputOption=RAW$/);
  assert.equal(put.body, JSON.stringify({ range: 'Data!A2', values: [['TRUE']] }));
});

test('verify 带 value=TRUE 且当前已是 TRUE 时不写入（幂等）', async () => {
  const { worker, calls } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Beta&value=TRUE', { method: 'POST' })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.new_value, 'TRUE');
  assert.equal(body.unchanged, true);
  assert.equal(calls.find(c => c.method === 'PUT'), undefined);
});

test('verify 带 value=FALSE 且当前 TRUE 时写入 FALSE', async () => {
  const { worker, calls } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Beta&value=false', { method: 'POST' })
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).new_value, 'FALSE');
  const put = calls.find(c => c.method === 'PUT');
  assert.ok(put);
  assert.equal(put.body, JSON.stringify({ range: 'Data!A3', values: [['FALSE']] }));
});

test('verify 非法 value 返回 400 且不触达 Google API', async () => {
  const { worker, calls } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Alpha&value=MAYBE', { method: 'POST' })
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('verify 缺省 value 保持 toggle 行为', async () => {
  const { worker } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Beta', { method: 'POST' })
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).new_value, 'FALSE');
});

test('verify 名单中不存在的 Agent 返回 404', async () => {
  const { worker } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&agent_name=Ghost&value=TRUE', { method: 'POST' })
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Agent not found' });
});

test('verify 缺少 agent_name 返回 400', async () => {
  const { worker } = await loadVerifyWorker();
  const response = await worker.handle(
    new Request('https://worker.test/verify?spreadsheet_id=sheet-1&value=TRUE', { method: 'POST' })
  );
  assert.equal(response.status, 400);
});
