/* global self, registration */

// --- lifecycle: ensure the latest SW is active immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const SW_VERSION = 'v10';
console.log('SW', SW_VERSION, 'loaded');

// helper: broadcast debug/status to all open pages
async function tellPages(type, payload) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  pages.forEach(c => c.postMessage({ type, ...payload, _sw: SW_VERSION }));
}

// ---- PUSH
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'PCOMS';
  const body  = data.body  || 'You have a new notification';
  const url   = data.url   || 'https://pcoms.vercel.app/dashboard';
  const id    = data && data.id ? String(data.id) : undefined;
  const deliveryId = data && data.deliveryId ? String(data.deliveryId) : undefined;

  // DEBUG: show exactly what id we received
  event.waitUntil(tellPages('PUSH_DEBUG', { id, raw: data }));

  event.waitUntil(
    registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/badge.png',
       data: { url, id, deliveryId }, 
      requireInteraction: false,
      actions: [
        { action: 'ack',  title: 'Acknowledge' },
        { action: 'open', title: 'Open App' }
      ]
    })
  );
});

// ---- CLICK
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, id, deliveryId } = event.notification.data || {};
  const ackOrigin = (() => {
   try { return new URL(url).origin; } catch { return self.location.origin; }
 })();
 const ACK = `${ackOrigin}/api/push/ack`;

   async function tryAck({ deliveryId, notifId }) {
   if (!deliveryId && !notifId) {
      await tellPages('ACK_NO_ID', {});
      return { ok: false, status: 0, error: 'no-id' };
    }
    try {
      const res = await fetch(ACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryId ? { deliveryId } : { id: notifId }),
        cache: 'no-store',
        keepalive: true,
        redirect: 'follow',
      });
      const ok = res.ok;
      let body;
      try { body = await res.clone().json(); } catch { body = null; }
      await tellPages('ACK_RESULT', { ok, status: res.status, body, id: notifId, deliveryId });
      return { ok, status: res.status };
    } catch (err) {
      await tellPages('ACK_RESULT', { ok: false, status: -1, error: String(err), id: notifId, deliveryId });
      return { ok: false, status: -1 };
    }
  }

  // Android action button
  if (event.action === 'ack') {
    event.waitUntil((async () => {
      await tryAck({ deliveryId, notifId: id });
      // always tell UI to flip optimistically; polling will reconcile
      await tellPages('PUSH_ACKED', { id });
    })());
    return;
  }

  // Desktop fallback: any click → ack + open/focus
  event.waitUntil((async () => {
    await tryAck({ deliveryId, notifId: id });
    await tellPages('PUSH_ACKED', { id,deliveryId });

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const found = clients.find(c => url && c.url.startsWith(url));
    if (found) return found.focus();
    if (url) return self.clients.openWindow(url);
  })());
});
