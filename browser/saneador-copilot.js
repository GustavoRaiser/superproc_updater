const { BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepared } = require('./saneador-pdf');
const { readPdf, stageFile, releaseFile } = require('./pdf-transfer');
const { pdfGate } = require('./v2-policy');
const { begin } = require('./saneador-interrupt');
const windows = new Map(), pending = new Set();
const ownerWindows = new Map(), pendingOwners = new Set();
const conversationWindows = new Set();
const hosts = ['m365.cloud.microsoft', 'copilot.cloud.microsoft'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function cleanResponse(text, agent = 'TR003C - Saneador') {
    const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text).trim()
        .replace(new RegExp(`^(?:${escaped}(?:\\s+said:)?\\s*\\n\\s*)+`, 'i'), '')
        .replace(/^(?:(?:TR[O0]03C\s*[-–—]\s*Saneador(?:\s+said:)?|Saneador)\s*\n\s*)+/i, '')
        .replace(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\s*(?:\n|$)\s*/, '');
}
function driveInput(...args) {
    const modulePath = require.resolve('./saneador-keyboard');
    delete require.cache[modulePath];
    return require(modulePath).driveInput(...args);
}
async function recoverPDF(targets, expected) {
    for (const wc of targets) for (const frame of wc.mainFrame.framesInSubtree) {
        try {
            const { buffer } = await readPdf(frame);
            if (buffer.subarray(0, 5).toString() === '%PDF-' && crypto.createHash('sha256').update(buffer).digest('hex') === expected) return buffer;
        } catch (_) {}
    }
    throw new Error('O PDF preparado não está mais em memória nem no leitor com o mesmo SHA256. Execute a etapa 2 novamente.');
}
function install(ipcMain, resolveTargets) {
    ipcMain.handle('superproc:saneador-copilot', async (event, request) => {
        let win, heartbeat, interruption;
        try {
            const url = new URL(event.sender.getURL());
            const process = String(request?.process || '');
            if (event.senderFrame !== event.sender.mainFrame || !url.hostname.endsWith('.jus.br') || url.searchParams.get('acao') !== 'processo_selecionar' || !/^\d{20}$/.test(process) || (url.searchParams.get('num_processo') || '').replace(/\D/g, '') !== process) throw new Error('Capa solicitante inválida.');
            const config = require('./automation-options').automationOptions(request.config);
            const key = event.sender.id + ':' + process;
            if (request.command === 'show') {
                const existing = windows.get(key); if (!existing || existing.isDestroyed()) throw new Error('A janela do Copilot ainda não está aberta.');
                existing.show(); existing.focus(); return { ok: true };
            }
            if (pending.has(key) || pendingOwners.has(event.sender.id)) throw new Error('Já há uma solicitação do Copilot em andamento nesta aba.');
            if (!/^[a-f0-9]{64}$/.test(request.sha256 || '')) throw new Error('Identificação do PDF ausente. Execute a etapa 2.');
            const targets = resolveTargets(event.sender); if (!targets.length) throw new Error('A capa não pertence a uma aba gerenciada.');
            pending.add(key);
            pendingOwners.add(event.sender.id);
            interruption = begin(event.sender.id, process);
            try {
                const cached = prepared.get(key);
                let buffer = cached?.sha256 === request.sha256 ? cached.buffer : await pdfGate.run(() => recoverPDF(targets, request.sha256));
                interruption.check();
                const emit = data => { if (!event.sender.isDestroyed()) event.sender.send('superproc:saneador-copilot-progress', { id: request.id, ...data }); };
                emit({ phase: 'abrindo', text: 'Abrindo Microsoft 365 Copilot na sessão do navegador…' });
                win = ownerWindows.get(event.sender.id);
                if (!win || win.isDestroyed()) {
                    if(conversationWindows.size>=4)throw Error('Há quatro conversas abertas. Feche uma para iniciar outra.');
                    win = new BrowserWindow({ show: false, skipTaskbar: false, width: 1100, height: 850, title: `SuperPROC — Saneador / ${process}`, webPreferences: { session: event.sender.session, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
                    conversationWindows.add(win);
                    ownerWindows.set(event.sender.id, win);
                    const ownerId = event.sender.id;
                    event.sender.once('destroyed', () => {
                        ownerWindows.delete(ownerId);
                        for (const [k] of windows) if (k.startsWith(ownerId + ':')) windows.delete(k);
                        if (!win.isDestroyed()) { win.webContents.setBackgroundThrottling(true); win.setTitle('SuperPROC v2 — conversa preservada'); win.show(); }
                    });
                    const managedWindow = win;
                    win.on('closed', () => {
                        conversationWindows.delete(managedWindow);
                        if (ownerWindows.get(event.sender.id) === managedWindow) ownerWindows.delete(event.sender.id);
                        for (const [oldKey, oldWindow] of windows) if (oldWindow === managedWindow) windows.delete(oldKey);
                    });
                }
                win.webContents.setBackgroundThrottling(false);
                // Reutiliza a janela, mas recarrega o chat e inicia conversa limpa.
                // As conversas anteriores permanecem no histórico do Copilot.
                for (const [oldKey, oldWindow] of windows) if (oldWindow === win) windows.delete(oldKey);
                win.setTitle(`SuperPROC — Saneador / ${process}`);
                windows.set(key, win);
                interruption.onCancel = async () => {
                    if (win.isDestroyed()) return;
                    for (const frame of win.webContents.mainFrame.framesInSubtree) await frame.executeJavaScript(`(() => {
                        window.__spCopilotCancelled = true;
                        const stop = [...document.querySelectorAll('button')].find(b => /parar.*(ger|res)|stop.*(gener|respond)/i.test(b.getAttribute('aria-label') || b.textContent || ''));
                        stop?.click(); true;
                    })()`).catch(() => {});
                };
                // Login pode exigir janela auxiliar; mantém a sessão corporativa atual.
                win.webContents.setWindowOpenHandler(({ url }) => {
                    let host; try { host = new URL(url).hostname; } catch { return { action: 'deny' }; }
                    return /(^|\.)(microsoft\.com|microsoftonline\.com|live\.com|microsoft)$/.test(host) ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { session: event.sender.session, contextIsolation: true, nodeIntegration: false, sandbox: true } } } : { action: 'deny' };
                });
                await win.loadURL('https://m365.cloud.microsoft/chat?auth=2');
                const deadline = Date.now() + 180000;
                let ready = false, shown = false, workerFrame;
                while (Date.now() < deadline) {
                    interruption.check();
                    if (win.isDestroyed()) throw new Error('A janela do Copilot foi fechada.');
                    const host = new URL(win.webContents.getURL()).hostname;
                    if (hosts.includes(host) && !win.webContents.isLoadingMainFrame()) {
                        for (const candidate of win.webContents.mainFrame.framesInSubtree) {
                            let candidateHost; try { candidateHost = new URL(candidate.url).hostname; } catch { continue; }
                            if (!hosts.includes(candidateHost)) continue;
                            ready = await candidate.executeJavaScript(`!!document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea')`).catch(() => false);
                            if (ready) { workerFrame = candidate; break; }
                        }
                    }
                    if (ready) break;
                    if (!shown) { win.show(); shown = true; emit({ phase: 'login', text: 'Conclua o login do Copilot na janela aberta. Aguardando o chat…' }); }
                    await pause(600);
                }
                if (!ready) throw new Error('O chat do Copilot não ficou disponível. Confira o login e execute a etapa 3 novamente.');
                interruption.check();
                await workerFrame.executeJavaScript(fs.readFileSync(path.join(__dirname, '../extensao-superproc/modules/automacoes/copilot_worker.js'), 'utf8'));
                let lastPhase = '', lastInput = '', driving = false;
                heartbeat = setInterval(async () => {
                    if (win.isDestroyed()) return;
                    const input = await workerFrame.executeJavaScript('window.__spCopilotInput || null').catch(() => null);
                    if (input && input.id !== lastInput && !driving) {
                        driving = true; lastInput = input.id;
                        let error;
                        try { await driveInput(win, workerFrame, input, interruption.check); } catch (err) { error = err?.message || String(err); }
                        await workerFrame.executeJavaScript(`window.__spCopilotInputResult = ${JSON.stringify({ id: input.id, error })}; true`).catch(() => {});
                        driving = false;
                    }
                    const state = await workerFrame.executeJavaScript('window.__spCopilotProgress || null').catch(() => null);
                    if (state && state.phase !== lastPhase) { lastPhase = state.phase; emit(state); }
                }, 800);
                let payload = { agent: config.agent, mention: config.mention, process, prompt: `${process.slice(0, 7)}-${process.slice(7, 9)}.${process.slice(9, 13)}.${process[13]}.${process.slice(14, 16)}.${process.slice(16)} - ${config.command}`, files: [{ name: `Processo_${process}.pdf`, type: 'application/pdf', memoryId: await pdfGate.run(()=>stageFile(workerFrame,buffer,interruption.check)) }] };
                const memoryId=payload.files[0].memoryId;
                let result;
                try {
                    interruption.check();
                    const running=workerFrame.executeJavaScript(`window.SuperprocCopilot.run(${JSON.stringify(payload).replace(/</g, '\\u003c')})`, true);
                    payload=null;buffer=null;prepared.delete(key);
                    result=await running;
                } finally { await releaseFile(workerFrame,memoryId); }
                if (result?.process !== process || !result.text) throw new Error('Resposta não vinculada ao processo.');
                return { ...result, text: cleanResponse(result.text, config.agent), sha256: request.sha256, receivedAt: Date.now() };
            } finally { pending.delete(key); pendingOwners.delete(event.sender.id); }
        } catch (error) {
            if (win && !win.isDestroyed()) win.show();
            return { error: error?.message || String(error) };
        } finally {
            interruption?.finish();
            if (heartbeat) clearInterval(heartbeat);
            if (win && !win.isDestroyed()) win.webContents.setBackgroundThrottling(true);
            if (win && !win.isDestroyed() && win.webContents.debugger.isAttached()) {
                win.webContents.debugger.detach();
            }
        }
    });
}
module.exports = { install, recoverPDF, driveInput };

