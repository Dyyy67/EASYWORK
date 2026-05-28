const CACHE = 'gradeview-v4';
const PRECACHE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Never intercept Supabase or non-GET
  if (
    e.request.method !== 'GET' ||
    e.request.url.includes('supabase.co') ||
    e.request.url.includes('/rest/v1/') ||
    e.request.url.includes('/auth/v1/') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('jsdelivr.net') ||
    e.request.url.includes('cdn.')
  ) return;

  // Network-first for app shell, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
