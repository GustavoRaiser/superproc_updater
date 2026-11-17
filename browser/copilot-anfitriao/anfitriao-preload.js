'use strict';
// Ponte mínima: a página-anfitriã entrega ao host a mensagem recebida do iframe e recebe as respostas.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('superprocAnfitriao', {
  mensagem: (mensagem, origem) => ipcRenderer.invoke('copilot-anfitriao-msg', { mensagem, origem }),
  falhou: (motivo) => ipcRenderer.invoke('copilot-anfitriao-falha', { motivo })
});
