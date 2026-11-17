const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  sendAction: (action, data) => ipcRenderer.send('cfg-action', { action, data }),
  closeMenu: (restoreFocus = false) => ipcRenderer.send('cfg-close', restoreFocus === true),
  // Pede ao processo principal para ajustar a altura da janela e abrir/fechar a área do submenu Addons.
  layout: (opts) => ipcRenderer.invoke('cfg-layout', opts),
  onMenuState: (callback) => {
    ipcRenderer.on('cfg-menu-state', (event, data) => callback(data));
  },
  // Estado da atualização do próprio app (verificando, disponível, baixando, pronto, erro).
  onAppUpdateStatus: (callback) => {
    ipcRenderer.on('cfg-app-update-status', (event, data) => callback(data));
  },
  // Conta Microsoft: mudanças de estado (entrou, saiu, licença e foto carregadas) com o menu aberto.
  onContaEstado: (callback) => {
    ipcRenderer.on('cfg-conta-estado', (event, data) => callback(data));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('cfg-update-status', (event, data) => callback(data));
  }
});
