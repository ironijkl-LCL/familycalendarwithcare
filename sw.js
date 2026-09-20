const CACHE_NAME = 'family-os-v10';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.9/dompurify.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// 1. 安裝階段：快取靜態核心資產
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 2. 啟用階段：清除舊版本快取
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 3. 請求攔截：徹底解決帶參數離線白畫面與 API 衝突
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // 僅處理 GET 請求，忽略 POST/PUT/DELETE
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 排除 Firebase RTDB、Storage、Auth 與外部動態 API
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebasestorage.app')
  ) {
    return;
  }

  // 頁面導航（SPA 路由 / Shortcuts 參數回退處理）
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((cached) => {
        return cached || fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  // 靜態資源：Cache-First
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        // 僅快取有效且同源/CDN 的成功響應
        if (!res || res.status !== 200 || res.type === 'error') {
          return res;
        }
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      });
    })
  );
});

// 4. FCM 雲端推播事件監聽
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload = {};
  try {
    payload = e.data.json();
  } catch {
    payload = { notification: { body: e.data.text() } };
  }

  const title = payload.notification?.title || '🏠 Family OS 提醒';
  const options = {
    body: payload.notification?.body || '您有一項即將開始的家庭行程。',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: {
      url: payload.data?.url || './index.html?view=today',
      ...payload.data
    }
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// 5. 點擊推播通知自動導向
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = new URL(e.notification.data?.url || './', self.location.origin).href;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
