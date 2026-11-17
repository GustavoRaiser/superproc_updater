const active = new Map();
function begin(senderId, process) {
    const key = senderId + ':' + process;
    const token = { cancelled: false, onCancel: null };
    if (!active.has(key)) active.set(key, new Set());
    active.get(key).add(token);
    token.check = () => { if (token.cancelled) throw new Error('Interrompido pelo usuário.'); };
    token.finish = () => { const set = active.get(key); set?.delete(token); if (!set?.size) active.delete(key); };
    return token;
}
async function cancel(senderId, process) {
    const tokens = [...(active.get(senderId + ':' + process) || [])];
    for (const token of tokens) token.cancelled = true;
    await Promise.allSettled(tokens.map(token => token.onCancel?.()));
    return tokens.length;
}
function install(ipcMain, owns) {
    ipcMain.handle('superproc:saneador-interrupt', async (event, request) => {
        try {
            const url = new URL(event.sender.getURL());
            if (event.senderFrame !== event.sender.mainFrame || !url.hostname.endsWith('.jus.br') || url.searchParams.get('acao') !== 'processo_selecionar' || url.searchParams.get('num_processo') !== request?.process || !owns(event.sender)) throw new Error('Capa inválida para interromper o lote.');
            return { ok: true, stopped: await cancel(event.sender.id, request.process) };
        } catch (error) { return { error: error.message }; }
    });
}
module.exports = { begin, cancel, install };
