const dataCacheMeta = new Map(); let dataCacheBytes = 0;
function removeCachedData(id) {
  const meta = dataCacheMeta.get(id);
  if (meta) { clearTimeout(meta.timer); dataCacheBytes -= meta.bytes; dataCacheMeta.delete(id); }
  return dataCache.delete(id);
}
function cacheData(data, options = {}) {
  const bytes = typeof data === 'string' ? data.length*2 : JSON.stringify(data).length*2;
  // Refuse excess work rather than silently evict an attachment still in a queue.
  if (bytes > 64*1024*1024 || dataCacheBytes + bytes > 96*1024*1024 || dataCache.size >= 32) throw Error('Fila de anexos atingiu o limite de memória; aguarde ou reduza o lote.');
  const id = generateCacheId(), ttl=Math.min(2400000+(options.totalPagesInQueue||options.pageCount||1)*30000,3600000);
  const timer=setTimeout(()=>removeCachedData(id),ttl);
  dataCache.set(id,data); dataCacheMeta.set(id,{bytes,timer,expires:Date.now()+ttl});dataCacheBytes+=bytes;
  return id;
}
function retrieveData(id) {
  if (!dataCacheMeta.has(id) || dataCacheMeta.get(id).expires<=Date.now()) {removeCachedData(id);return null;}
  const data=dataCache.get(id);removeCachedData(id);return data;
}
