'use strict';
// Ponte mínima da página local do shell. Três canais fixos; sem IPC genérico. O host só atende estes canais
// quando o remetente é o quadro principal do arquivo local do shell (ipc-policy), não páginas remotas.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('superprocShell', {
  estado: () => ipcRenderer.invoke('copilot-shell-estado'),
  acao: (nome) => ipcRenderer.invoke('copilot-shell-acao', String(nome)),
  consumidor: (pedido) => ipcRenderer.invoke('copilot-shell-consumidor', pedido),
  aoMudar: (f) => { if (typeof f === 'function') ipcRenderer.on('copilot-shell-mudou', (_e, estado) => f(estado)); }
});
