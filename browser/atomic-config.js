'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
function atomicConfig(file, { delay = 150 } = {}) {
  let latest, timer, tail = Promise.resolve(), sequence = 0;
  async function flush() {
    clearTimeout(timer); timer = null;
    if (latest === undefined) return tail;
    const value = latest; latest = undefined;
    const job = tail.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = file + '.' + process.pid + '.' + (++sequence) + '.tmp';
      let handle;
      try {
        handle = await fs.open(temp, 'wx'); await handle.writeFile(value, 'utf8'); await handle.sync(); await handle.close(); handle = null;
        await fs.rename(temp, file);
      } catch (error) {
        await handle?.close().catch(() => {}); await fs.rm(temp, { force: true }).catch(() => {});
        if (latest === undefined) latest = value;
        throw error;
      }
    });
    tail = job; return job;
  }
  return {
    save(value) { latest = JSON.stringify(value, null, 2); clearTimeout(timer); timer = setTimeout(() => { flush().catch(() => console.error('[SuperPROC v2] Falha ao persistir configuração; nova tentativa no encerramento.')); }, delay); },
    async flush() { await flush(); if (latest !== undefined) await flush(); },
    get pending() { return latest !== undefined; }
  };
}
module.exports = { atomicConfig };
