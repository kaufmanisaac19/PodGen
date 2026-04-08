const CACHE='podgen-v4';
const CORE=['/','/index.html','/manifest.json','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.url.includes('workers.dev')||e.request.url.includes('anthropic.com')||e.request.url.includes('openai.com')||e.request.url.includes('r2.dev'))return;
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).catch(()=>caches.match('/index.html'))));
});
