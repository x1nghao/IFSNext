/* IFSNext Service Worker */
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `ifsnext-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ifsnext-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './assets/favicon-16x16.png',
  './assets/favicon-32x32.png',
  './assets/favicon.ico',
  './assets/apple-touch-icon.png',
  './assets/android-chrome-192x192.png',
  './assets/android-chrome-512x512.png',
  './assets/site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // 预缓存CDN资源为不透明响应，容错处理
      const cdnResources = [
        'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
        'https://unpkg.com/vue@3/dist/vue.global.js'
      ];
      await Promise.all(
        cdnResources.map(async (url) => {
          try {
            const resp = await fetch(new Request(url, { mode: 'no-cors' }));
            if (resp) await cache.put(url, resp);
          } catch (_) {}
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// 简单的路由型缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 导航请求：网络优先，离线回退到缓存的index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          const cached = await caches.match('./index.html');
          return cached || new Response('<h1>离线状态</h1>', { headers: { 'Content-Type': 'text/html' } });
        }
      })()
    );
    return;
  }

  // 静态资源：脚本/样式使用网络优先，图片/字体缓存优先
  const dest = request.destination;
  if (['script', 'style'].includes(dest)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          const cached = await caches.match(request);
          return cached || Response.error();
        }
      })()
    );
    return;
  }
  if (['image', 'font'].includes(dest)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 后端API：网络优先、失败回退到缓存（若有）
  const isApi = /\/data|\/verify/.test(url.pathname) || url.hostname.includes('corsproxy.io');
  if (isApi) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const fresh = await fetch(request);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch (_) {
          const cached = await cache.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        }
      })()
    );
    return;
  }

  // 其他请求：尝试缓存优先再网络
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        return Response.error();
      }
    })()
  );
});

// 支持立即更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});