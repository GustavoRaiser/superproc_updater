if (window.__azflow?.disabled) throw new DOMException('AZflow disabled', 'AbortError');
(() => {
    'use strict';
    const TTL = 24 * 60 * 60000, MAX_ITEMS = 100, MAX_BYTES = 16 * 1024 * 1024;
    const anonymousScope = crypto.randomUUID();
    let connection;
    function scope() {
        const user = document.querySelector('#hdnIdUsuario, [name="hdnIdUsuario"]')?.value;
        const unit = document.querySelector('#selOrgao, #selOrgaoUsuario, [name="idOrgao"]')?.value;
        const epoch = localStorage.getItem('__superproc_auth_epoch_v2') || '';
        // Without verified user AND unit, reuse only within this document.
        return user && unit ? JSON.stringify([location.origin, epoch, user, unit]) : anonymousScope;
    }
    function key(id) { return scope() + ':' + String(id); }
    function open() {
        if (connection) return connection;
        connection = new Promise((resolve, reject) => {
            const req = indexedDB.open('azflowCacheModelosDB_v2', 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore('payload', { keyPath: 'key' });
                const meta = req.result.createObjectStore('meta', { keyPath: 'key' });
                meta.createIndex('lastAccessed', 'lastAccessed');
            };
            req.onerror = () => { connection = null; reject(Error('Cache de modelos indisponível.')); };
            req.onblocked = () => { connection = null; reject(Error('Cache de modelos bloqueado.')); };
            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => { db.close(); connection = null; };
                db.onclose = () => { connection = null; };
                resolve(db);
            };
        });
        return connection;
    }
    async function transaction(mode, action) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['payload', 'meta'], mode); let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = tx.onerror = () => reject(Error('Falha na transação do cache.'));
            try { action(tx.objectStore('payload'), tx.objectStore('meta'), value => { result = value; }); }
            catch (error) { tx.abort(); reject(error); }
        });
    }
    const valid = entry => entry && entry.expires > Date.now();
    async function verificarELimparCache() {
        return transaction('readwrite', (payload, meta, result) => {
            let count = 0, bytes = 0, expirados = 0, removidos = 0;
            const req = meta.index('lastAccessed').openCursor(null, 'prev');
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) { result({ expirados, removidos }); return; }
                const item = cursor.value;
                if (!valid(item) || count >= MAX_ITEMS || bytes + item.size > MAX_BYTES) {
                    if (!valid(item)) expirados++; else removidos++;
                    payload.delete(item.key); cursor.delete();
                } else { count++; bytes += item.size; }
                cursor.continue();
            };
        });
    }
    async function salvarModeloNoCache(id, dados, urlNormalizada) {
        if (!id || !dados) return false;
        try {
            const size = new TextEncoder().encode(JSON.stringify(dados)).byteLength;
            if (size > MAX_BYTES) return false;
            const now = Date.now(), record = { key: key(id), scope: scope(), idPreferencia: id, urlNormalizada, timestamp: now, expires: now + TTL, lastAccessed: now, size };
            await transaction('readwrite', (payload, meta) => { payload.put({ key: record.key, dados }); meta.put(record); });
            await verificarELimparCache(); return true;
        } catch { return false; }
    }
    async function obterModeloDoCache(id) {
        if (!id) return null;
        try {
            return await transaction('readwrite', (payload, meta, result) => {
                const idKey = key(id), req = meta.get(idKey);
                req.onsuccess = () => {
                    const item = req.result;
                    if (!valid(item)) { meta.delete(idKey); payload.delete(idKey); result(null); return; }
                    if (Date.now() - item.lastAccessed > 60000) meta.put({ ...item, lastAccessed: Date.now() });
                    const data = payload.get(idKey); data.onsuccess = () => result(data.result ? { ...data.result.dados, idPreferencia: item.idPreferencia } : null);
                };
            });
        } catch { return null; }
    }
    async function verificarSeEstaNoCache(id) {
        try { return await transaction('readonly', (_, meta, result) => { const req = meta.get(key(id)); req.onsuccess = () => result(!!valid(req.result)); }); } catch { return false; }
    }
    async function carregarTodosModelosDoCache() {
        try {
            const currentScope = scope(), map = new Map();
            return await transaction('readonly', (payload, meta, result) => {
                const req = meta.openCursor(); req.onsuccess = () => {
                    const cursor = req.result;
                    if (!cursor) { result(map); return; }
                    const item = cursor.value;
                    if (item.scope === currentScope && valid(item)) {
                        const data = payload.get(item.key); data.onsuccess = () => { if (data.result) map.set(item.urlNormalizada, { ...data.result.dados, idPreferencia: item.idPreferencia }); cursor.continue(); };
                    } else cursor.continue();
                };
            });
        } catch { return new Map(); }
    }
    async function removerModeloDoCache(id) { try { await transaction('readwrite', (payload, meta) => { payload.delete(key(id)); meta.delete(key(id)); }); return true; } catch { return false; } }
    async function limparTodoCache() { try { await transaction('readwrite', (payload, meta) => { payload.clear(); meta.clear(); }); return true; } catch { return false; } }
    window.IndexedDBCacheModelos = { salvarModeloNoCache, obterModeloDoCache, verificarSeEstaNoCache, carregarTodosModelosDoCache, verificarELimparCache, limparTodoCache, removerModeloDoCache, isIndexedDBSupported: () => 'indexedDB' in window };
    window.addEventListener('pagehide', () => { connection?.then(db => db.close()).catch(() => {}); connection = null; });
})();
