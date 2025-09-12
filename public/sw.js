/* global self, registration */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'PCOMS';
  const body  = data.body  || 'You have a new notification';
  const url   = data.url   || 'https://pcoms.vercel.app/employee';

  event.waitUntil(
    registration.showNotification(title, {
      body,
      icon: '/icon-192.png',   // add icons to /public if you want
      badge: '/badge.png',
      data: { url },
      requireInteraction: false,
      tag: data.tag || undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://pcoms.vercel.app/employee';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const found = clients.find(c => c.url.startsWith(url));
    if (found) return found.focus();
    return self.clients.openWindow(url);
  })());
});
