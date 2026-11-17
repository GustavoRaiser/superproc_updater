// Preload de sessão, também em iframes e no leitor PDF.js.
const { contextBridge, ipcRenderer } = require('electron');
try {
  const request = () => ipcRenderer.send('superproc:print-pdf');
  contextBridge.exposeInMainWorld('__superprocPrintPdf', { request });
  contextBridge.executeInMainWorld({ func: () => {
    const printPdf = () => { window.__superprocPrintPdf.request(); };
    // Um setter inofensivo permite que bibliotecas como PDF.js atribuam seu
    // wrapper sem quebrar sua inicialização nem restaurar a impressão nativa.
    Object.defineProperty(window, 'print', {
      configurable: false, enumerable: true, get: () => printPdf, set: () => {}
    });
  } });
} catch (error) {
  console.warn('[SuperPROC] Não foi possível instalar impressão em PDF:', error.message);
}
