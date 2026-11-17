'use strict';
const fs = require('node:fs/promises');
const { diagnostic } = require('./v2-policy');
function createWriter(file, { maxBytes = 1024 * 1024, maxQueue = 256 } = {}) {
  let queue = [], tail = Promise.resolve(), scheduled;
  function flush() {
    clearTimeout(scheduled); scheduled = null;
    const batch = queue; queue = [];
    if (!batch.length) return tail;
    tail = tail.catch(() => {}).then(async () => {
      const size = await fs.stat(file).then(s => s.size, () => 0);
      if (size >= maxBytes) { await fs.rm(file + '.1', { force: true }); await fs.rename(file, file + '.1'); }
      await fs.appendFile(file, batch.join(''), 'utf8');
    });
    return tail;
  }
  return {
    write(category, details) {
      const record = diagnostic(category, details);
      if (queue.length < maxQueue) queue.push(JSON.stringify(record) + '\n');
      if (!scheduled) { scheduled = setTimeout(() => { flush().catch(() => {}); }, 250); scheduled.unref?.(); }
      return record;
    },
    flush
  };
}
module.exports = { createWriter };
