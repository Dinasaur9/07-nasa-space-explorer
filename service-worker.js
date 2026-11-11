// ---------------------------------------------
// Service worker for NASA Space Explorer
// ---------------------------------------------
// It runs in the background, separate from the page, and sits between the
// app and the network. Every request the app makes passes through the
// "fetch" event below, where we decide whether to use the cache or the network.

// Change the version number whenever you change the app shell files.
// A new name makes the browser download fresh copies and delete the old cache.
const SHELL_CACHE = 'space-explorer-shell-v1';
const API_CACHE = 'space-explorer-api-v1';
const IMAGE_CACHE = 'space-explorer-images-v1';

// The "app shell": every file needed to draw the app with no internet.
// Paths are relative, so they work on GitHub Pages (/07-nasa-space-explorer/).
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './js/dateRange.js',
  './js/script.js',
  './js/pwa.js',
  './manifest.json',
  './img/favicon.png',
  './img/nasa-worm-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// The two NASA addresses our app gets APOD data from
const API_HOSTS = ['api.nasa.gov', 'science.nasa.gov'];

// Keep at most this many space photos saved, so we don't fill up the phone
const MAX_SAVED_IMAGES = 60;

// ---------------------------------------------
// Install: save the app shell into the cache
// ---------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // Start using this new service worker right away
  self.skipWaiting();
});

// ---------------------------------------------
// Activate: delete caches from older versions
// ---------------------------------------------
self.addEventListener('activate', (event) => {
  const currentCaches = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => !currentCaches.includes(name))
          .map((name) => caches.delete(name))
      ))
      // Take control of pages that are already open
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------
// Fetch: choose a strategy for each request
// ---------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only GET requests can be cached
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 1. NASA API data → network first (fresh when online, saved copy when offline)
  if (API_HOSTS.includes(url.hostname) && !isImage(request, url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 2. Space photos and thumbnails → cache first (photos for a date never change)
  if (isImage(request, url) && url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, MAX_SAVED_IMAGES));
    return;
  }

  // 3. Our own files (HTML/CSS/JS/icons) and Google Fonts → cache first
  if (url.origin === self.location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

// ---------------------------------------------
// Strategy: cache first
// Look in the cache. If it's there, use it (fast, works offline).
// If not, get it from the network and save a copy for next time.
// ---------------------------------------------
async function cacheFirst(request, cacheName, maxItems) {
  // ignoreSearch lets "index.html?source=pwa" match "index.html"
  const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    // Status 0 = a photo from another website (an "opaque" response). It's still fine to save.
    if (response.ok || response.status === 0) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      if (maxItems) {
        trimCache(cacheName, maxItems);
      }
    }
    return response;
  } catch (error) {
    // Offline and not cached. For a page visit, fall back to the saved app shell.
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    throw error;
  }
}

// ---------------------------------------------
// Strategy: network first
// Try the network. If it works, save a copy and use it.
// If it fails (offline), use the last saved copy.
// ---------------------------------------------
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Nothing saved for these dates: send back an error the app can show
    return new Response(
      JSON.stringify({ error: 'You are offline and these dates have not been saved yet.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

// Is this request for a picture?
function isImage(request, url) {
  return request.destination === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(url.pathname);
}

// Delete the oldest saved photos once we have too many
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxItems; i++) {
    await cache.delete(keys[i]);
  }
}
