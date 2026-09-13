/* 细胞生物学自学网页 · Service Worker（网络优先，离线回退缓存） */
var CACHE = "molbio-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || e.request.url.indexOf("http") !== 0) return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      try {
        var copy = resp.clone();
        caches.open(CACHE).then(function (cache) { cache.put(e.request, copy); });
      } catch (err) { }
      return resp;
    }).catch(function () { return caches.match(e.request); })
  );
});
