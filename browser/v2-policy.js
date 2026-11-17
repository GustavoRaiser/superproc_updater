'use strict';
// Common budgets. No page data or authentication values belong in metrics.
const LIMITS = Object.freeze({ pdfBytes: 64 * 1024 * 1024, textBytes: 16 * 1024 * 1024, textPages: 2000, panels: 4, pdfTtl: 20 * 60000 });
function durableUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    url.username = ''; url.password = ''; url.hash = '';
    // Keep routing and process identity; signatures must come from a fresh page.
    for (const key of [...url.searchParams.keys()]) {
      if (/hash|token|session|sessid|auth|password|senha|ticket|code|secret|key|saml|assertion/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return ''; }
}
function diagnostic(category, details = {}) {
  const record = { time: new Date().toISOString(), category: /^[A-Z0-9_]{1,64}$/.test(category) ? category : 'EVENT' };
  for (const key of ['status', 'webContentsId', 'requestId', 'decorridoMs', 'quantidade', 'bytes', 'pages']) {
    if (typeof details?.[key] === 'number' && Number.isFinite(details[key])) record[key] = details[key];
  }
  for (const key of ['cache', 'sessionPresent']) if (typeof details?.[key] === 'boolean') record[key] = details[key];
  return record;
}
class BoundedCache {
  constructor({ maxEntries = 8, maxBytes = LIMITS.textBytes, ttl = 5 * 60000, size = value => Buffer.byteLength(String(value)), now = Date.now } = {}) {
    Object.assign(this, { maxEntries, maxBytes, ttl, sizeOf: size, now }); this.items = new Map(); this.bytes = 0;
  }
  get size() { this.prune(); return this.items.size; }
  get(key) {
    const entry = this.items.get(key); if (!entry) return;
    if (entry.expires <= this.now()) { this.delete(key); return; }
    this.items.delete(key); this.items.set(key, entry); return entry.value;
  }
  set(key, value) {
    this.delete(key); this.prune(); const bytes = this.sizeOf(value);
    if (!Number.isFinite(bytes) || bytes > this.maxBytes || bytes < 0) return this;
    while (this.items.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) this.delete(this.items.keys().next().value);
    this.items.set(key, { value, bytes, expires: this.now() + this.ttl }); this.bytes += bytes; return this;
  }
  delete(key) { const entry = this.items.get(key); if (!entry) return false; this.bytes -= entry.bytes; return this.items.delete(key); }
  prune() { for (const [key, entry] of this.items) if (entry.expires <= this.now()) this.delete(key); }
  clear() { this.items.clear(); this.bytes = 0; }
  *[Symbol.iterator]() { this.prune(); for (const [key, entry] of this.items) yield [key, entry.value]; }
  *keys() { this.prune(); yield* this.items.keys(); }
}
// Admit one expensive task at a time; bounded waiting queue, no hidden retries.
class TaskGate {
  constructor(maxQueue = 4) { this.tail = Promise.resolve(); this.waiting = 0; this.maxQueue = maxQueue; }
  async run(task) {
    if (this.waiting >= this.maxQueue) throw Error('Limite de tarefas pesadas atingido; aguarde a conclusão.');
    this.waiting++; const previous = this.tail; let release; this.tail = new Promise(resolve => { release = resolve; });
    try { await previous; return await task(); } finally { this.waiting--; release(); }
  }
}
const pdfGate = new TaskGate();
function cacheRetry({ max = 1, windowMs = 30000, now = Date.now } = {}) {
  let state = { url: '', at: 0, attempts: 0 };
  return (url, options) => {
    if (options?.postData || !/^https?:/i.test(url || '')) return false;
    if (url !== state.url || now() - state.at > windowMs) state = { url, at: now(), attempts: 0 };
    return state.attempts++ < max;
  };
}
module.exports = { LIMITS, durableUrl, diagnostic, BoundedCache, TaskGate, pdfGate, cacheRetry };
