'use strict';
async function clearRecoverableCache(session, invalidate = () => {}) {
  const before = await session.getCacheSize();
  await session.clearCache();
  await session.clearStorageData({ storages: ['cachestorage', 'shadercache'] });
  await invalidate();
  return { scope: 'session', beforeBytes: before, afterBytes: await session.getCacheSize(), cookiesPreserved: true };
}
module.exports = { clearRecoverableCache };
