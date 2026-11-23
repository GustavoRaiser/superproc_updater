'use strict';
// Ponte mínima do cartão de consentimento: um canal, um booleano. O host só atende quando o remetente é o
// quadro principal do arquivo local do cartão (ipc-policy, papel `copilotconsent`).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('consentimentoCopilot', {
  decidir: (permitir) => ipcRenderer.send('copilot-consentimento-decisao', permitir === true)
});
