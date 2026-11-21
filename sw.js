/* 分子生物学自学网页 · Service Worker（HTML 强制网络，静态资源网络优先） */
var CACHE = "molbio-v3";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || e.request.url.indexOf("http") !== 0) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(function () { return caches.match(e.request); })
    );
    return;
  }
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
