// Offline shell cache. The pose model and libraries are cached by the browser
// on first use; app files are served cache-first and refreshed in the background.
const CACHE = 'alpencoach-v2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/main.js', 'js/store.js', 'js/geometry.js', 'js/exercises.js', 'js/repCounter.js',
  'js/coach.js', 'js/nutrition.js', 'js/planner.js', 'js/posture.js', 'js/pose.js',
  'js/session.js', 'js/pedometer.js', 'js/chat.js', 'js/schedule.js', 'js/week.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    }),
  );
});
