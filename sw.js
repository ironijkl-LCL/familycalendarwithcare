const CACHE_NAME = 'family-os-v9';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.9/dompurify.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', (e) => {
  // 雲端即時 API 與資料庫強制走 Network-First
  if (e.request.url.includes('firebaseio.com') || e.request.url.includes('googleapis.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // 靜態資源走 Cache-First
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

// 🔔 FCM 後台推播事件接收
self.addEventListener('push', (e) => {
  if (!e.data) return;
  const payload = e.data.json();
  const title = payload.notification?.title || '🏠 Family OS 提醒';
  const options = {
    body: payload.notification?.body || '您有一項即將開始的家庭行程。',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: payload.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 點擊通知跳轉回 App
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
