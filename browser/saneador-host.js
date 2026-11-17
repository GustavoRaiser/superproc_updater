const { BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const jobs = new Map();
const allowed = url => { try { return new URL(url).hostname.endsWith('.jus.br'); } catch { return false; } };
function install() {
    ipcMain.handle('superproc:saneador', async (event, request) => {
        const frame = event.senderFrame;
        if (!frame || !allowed(frame.url)) throw new Error('Origem do Saneador inválida.');
        const key = event.sender.id;
        if (request?.cancel) { const job = jobs.get(key); if (job && !job.isDestroyed()) await job.webContents.executeJavaScript('window.SuperprocCopilot?.cancel()'); return { ok: true }; }
        if (jobs.has(key)) throw new Error('Já há um saneamento nesta aba.');
        const payload = request?.payload;
        if (!payload?.files?.length || payload.files.length > 100 || JSON.stringify(payload).length > 100 * 1024 * 1024) throw new Error('Documentos excedem o limite de transporte (100 arquivos / 100 MB codificados).');
        const win = new BrowserWindow({ show: false, width: 1100, height: 850, title: 'SuperPROC — Copilot / Saneador', webPreferences: { session: event.sender.session, nodeIntegration: false, contextIsolation: true, sandbox: true } });
        jobs.set(key, win);
        // Visível após carga: login e seleção de agente podem ser conferidos pelo usuário.
        win.once('ready-to-show', () => win.show());
        win.webContents.setWindowOpenHandler(({ url }) => {
            let host; try { host = new URL(url).hostname; } catch { return { action: 'deny' }; }
            return /(^|\.)(microsoft\.com|microsoftonline\.com|live\.com)$/.test(host) ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { session: event.sender.session, nodeIntegration: false, contextIsolation: true, sandbox: true } } } : { action: 'deny' };
        });
        try {
            await win.loadURL('https://m365.cloud.microsoft/chat?auth=2');
            const end = Date.now() + 120000;
            while (Date.now() < end) {
                if (win.isDestroyed()) throw new Error('A janela do Copilot foi fechada.');
                const host = new URL(win.webContents.getURL()).hostname;
                if (['m365.cloud.microsoft', 'copilot.cloud.microsoft'].includes(host) && !win.webContents.isLoadingMainFrame()) break;
                await new Promise(r => setTimeout(r, 500));
            }
            if (!['m365.cloud.microsoft', 'copilot.cloud.microsoft'].includes(new URL(win.webContents.getURL()).hostname)) throw new Error('Conclua o login corporativo no Copilot e tente novamente.');
            const script = fs.readFileSync(path.join(__dirname, '../extensao-superproc/modules/automacoes/copilot_worker.js'), 'utf8');
            await win.webContents.executeJavaScript(script);
            const text = await win.webContents.executeJavaScript(`window.SuperprocCopilot.run(${JSON.stringify(payload).replace(/</g, '\\u003c')})`, true);
            return { text };
        } catch (error) { return { error: error.message }; }
        finally { jobs.delete(key); }
    });
}
module.exports = { install };
