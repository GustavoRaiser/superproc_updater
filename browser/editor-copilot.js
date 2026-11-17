'use strict';

const fs = require('node:fs');
const path = require('node:path');
const HOSTS = new Set(['m365.cloud.microsoft', 'copilot.cloud.microsoft']);

function validRequest(event, request, owns) {
  if (event.senderFrame !== event.sender.mainFrame || !owns(event.sender)) return false;
  let url; try { url = new URL(event.sender.getURL()); } catch { return false; }
  return url.hostname.endsWith('.jus.br') && url.searchParams.get('acao') === 'minuta_editar'
    && typeof request?.text === 'string' && request.text.trim().length > 0 && request.text.length <= 100000;
}

function install(ipcMain, { owns, getCopilotView }) {
  const busy = new Set();
  ipcMain.handle('superproc:editor-copilot', async (event, request) => {
    if (!validRequest(event, request, owns)) throw new Error('Solicitação de correção inválida.');
    if (busy.has(event.sender.id)) throw new Error('Já há uma correção em andamento nesta aba.');
    const view = getCopilotView();
    if (!view?.webContents || view.webContents.isDestroyed()) throw new Error('Abra o modo “Integrada com Copilot” e uma conversa antes de corrigir o trecho.');
    const wc = view.webContents;
    let currentHost = ''; try { currentHost = new URL(wc.getURL()).hostname; } catch (_) {}
    if (!HOSTS.has(currentHost)) throw new Error('A coluna do Copilot ainda não está pronta. Conclua o login e abra a conversa desejada.');
    busy.add(event.sender.id);
    try {
      let frame = null;
      for (const candidate of wc.mainFrame.framesInSubtree) {
        let host = ''; try { host = new URL(candidate.url).hostname; } catch (_) {}
        if (!HOSTS.has(host)) continue;
        const ready = await candidate.executeJavaScript(`!!document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea')`).catch(() => false);
        if (ready) { frame = candidate; break; }
      }
      if (!frame) throw new Error('Abra uma conversa do Copilot antes de pedir a correção.');
      await frame.executeJavaScript(fs.readFileSync(path.join(__dirname, '../extensao-superproc/modules/automacoes/copilot_worker.js'), 'utf8'));
      const prompt = request.text.trim();
      const result = await frame.executeJavaScript(`window.SuperprocCopilot.runCurrent(${JSON.stringify(prompt).replace(/</g, '\\u003c')})`, true);
      return { text: String(result?.text || ''), conversationUrl: String(result?.conversationUrl || '') };
    } finally { busy.delete(event.sender.id); }
  });
}

module.exports = { install, validRequest };
