// Preload de sessão: cobre abas manuais e as abertas nativamente pelo AZFLOW.
const { ipcRenderer } = require('electron');
if (process.isMainFrame && location.hostname.endsWith('.jus.br')) {
  window.addEventListener('message', async event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:saneador-interrupt') return;
    const { id, process: processNumber } = event.data;
    if (typeof id !== 'string' || id.length > 80) return;
    const result = await ipcRenderer.invoke('superproc:saneador-interrupt', { process: processNumber }).catch(error => ({ error: error.message }));
    window.postMessage({ type: 'superproc:saneador-interrupt-result', id, result }, location.origin);
  });
  window.addEventListener('message', async event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:editor-copilot') return;
    const { id, text } = event.data;
    if (typeof id !== 'string' || id.length > 80 || typeof text !== 'string' || text.length > 100000) return;
    window.postMessage({ type: 'superproc:editor-copilot-ack', id }, location.origin);
    const result = await ipcRenderer.invoke('superproc:editor-copilot', { text }).catch(error => ({ error: error.message }));
    window.postMessage({ type: 'superproc:editor-copilot-result', id, result }, location.origin);
  });
  window.addEventListener('message', event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:fast-copilot-click') return;
    ipcRenderer.send('superproc:fast-copilot-click');
  });
  ipcRenderer.on('superproc:saneador-pdf-progress', (_event, data) => window.postMessage({ type: 'superproc:saneador-pdf-progress', ...data }, location.origin));
  ipcRenderer.on('superproc:saneador-minuta-progress', (_event, data) => window.postMessage({ type: 'superproc:saneador-minuta-progress', ...data }, location.origin));
  window.addEventListener('message', async event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:saneador-minuta') return;
    const { id, process: processNumber, text, jobId, resume, config } = event.data;
    if (typeof id !== 'string' || id.length > 80) return;
    window.postMessage({ type: 'superproc:saneador-minuta-ack', id }, location.origin);
    const result = await ipcRenderer.invoke('superproc:saneador-minuta', { id, process: processNumber, text, jobId, resume, config }).catch(error => ({ error: error.message }));
    window.postMessage({ type: 'superproc:saneador-minuta-result', id, result }, location.origin);
  });
  ipcRenderer.on('superproc:saneador-copilot-progress', (_event, data) => window.postMessage({ type: 'superproc:saneador-copilot-progress', ...data }, location.origin));
  window.addEventListener('message', async event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:saneador-copilot') return;
    const { id, process: processNumber, sha256, command, config } = event.data;
    if (typeof id !== 'string' || id.length > 80) return;
    window.postMessage({ type: 'superproc:saneador-copilot-ack', id }, location.origin);
    const result = await ipcRenderer.invoke('superproc:saneador-copilot', { id, process: processNumber, sha256, command, config }).catch(error => ({ error: error.message }));
    window.postMessage({ type: 'superproc:saneador-copilot-result', id, result }, location.origin);
  });
  window.addEventListener('message', async event => {
    if ((event.source !== null && event.source !== window) || event.origin !== location.origin || event.data?.type !== 'superproc:saneador-pdf') return;
    const { id, process: processNumber, config } = event.data;
    if (typeof id !== 'string' || id.length > 80) return;
    window.postMessage({ type: 'superproc:saneador-pdf-ack', id }, location.origin);
    const result = await ipcRenderer.invoke('superproc:saneador-pdf', { id, process: processNumber, config }).catch(error => ({ error: error.message }));
    window.postMessage({ type: 'superproc:saneador-pdf-result', id, result }, location.origin);
  });
}
