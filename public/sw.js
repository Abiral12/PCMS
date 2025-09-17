/* global self, registration */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const SW_VERSION = 'v10';  // ⬅ bump so browser reloads the SW
console.log('SW', SW_VERSION, 'loaded');

async function tellPages(type, payload) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  pages.forEach(c => c.postMessage({ type, ...payload, _sw: SW_VERSION }));
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'PCOMS';
  const body  = data.body  || 'You have a new notification';
  const url   = data.url   || 'https://pcoms.vercel.app/dashboard';
  const id    = data && data.id ? String(data.id) : undefined;
  const deliveryId = data && data.deliveryId ? String(data.deliveryId) : undefined;

  event.waitUntil(tellPages('PUSH_DEBUG', { id, deliveryId, raw: data }));

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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, id, deliveryId } = event.notification.data || {};

  // Pick the same origin as the notification URL; fallback to SW origin;
  // and finally try the other one too (helps when you test between localhost and live).
  const urlOrigin  = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  const swOrigin   = self.location.origin;
  const candidates = Array.from(new Set([urlOrigin || swOrigin, swOrigin, urlOrigin].filter(Boolean)));

  async function postAck(origin) {
    const body = JSON.stringify(deliveryId ? { deliveryId } : { id });
    const res  = await fetch(`${origin}/api/push/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // CORS-safe for cross-origin case
      mode: origin === swOrigin ? 'same-origin' : 'cors',
      cache: 'no-store',
      keepalive: true,
      redirect: 'follow',
      body,
    });
    let json = null;
    try { json = await res.clone().json(); } catch {}
    await tellPages('ACK_RESULT', { origin, ok: res.ok, status: res.status, body: json, id, deliveryId });
    return res.ok;
  }

  async function tryAck() {
    if (!deliveryId && !id) {
      await tellPages('ACK_NO_ID', {});
      return false;
    }
    for (const origin of candidates) {
      try {
        const ok = await postAck(origin);
        if (ok) return true;
      } catch (e) {
        await tellPages('ACK_RESULT', { origin, ok: false, error: String(e), id, deliveryId });
      }
    }
    return false;
  }

  if (event.action === 'ack') {
    event.waitUntil((async () => {
      await tryAck();
      await tellPages('PUSH_ACKED', { id, deliveryId });
    })());
    return;
  }

  event.waitUntil((async () => {
    await tryAck();
    await tellPages('PUSH_ACKED', { id, deliveryId });

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const found = clients.find(c => url && c.url.startsWith(url));
    if (found) return found.focus();
    if (url) return self.clients.openWindow(url);
  })());
});
