const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('dblclick', (event) => {
  if (event.isTrusted && event.button === 0) ipcRenderer.send('panel-toggle-pin');
}, true);

contextBridge.exposeInMainWorld('panelAPI', {
  togglePin: () => ipcRenderer.send('panel-toggle-pin'),
  home: () => ipcRenderer.send('panel-home'),
  back: () => ipcRenderer.send('panel-back'),
  forward: () => ipcRenderer.send('panel-forward'),
  reload: () => ipcRenderer.send('panel-reload'),
  promoteToTab: () => ipcRenderer.send('panel-promote-to-tab'),
  toggleMode: () => ipcRenderer.send('panel-toggle-mode'),
  close: () => ipcRenderer.send('panel-close'),
  hide: () => ipcRenderer.send('panel-hide'),
  resizeDelta: (deltaX) => ipcRenderer.send('panel-resize-delta', deltaX),
  startResize: () => ipcRenderer.send('panel-resize-start'),
  endResize: () => ipcRenderer.send('panel-resize-end'),
  onPanelData: (callback) => {
    ipcRenderer.on('panel-data-update', (event, data) => callback(data));
  },
  onNavState: (callback) => {
    ipcRenderer.on('panel-nav-state', (event, state) => callback(state));
  },
  // Busca no Painel Flutuante (Find in Page / Ctrl+F)
  openFind: () => ipcRenderer.send('find-open', 'panel'),
  closeFind: () => ipcRenderer.send('find-close'),
  findInPage: (text, options) => ipcRenderer.send('panel-find-in-page', { text, options }),
  stopFindInPage: (action = 'clearSelection') => ipcRenderer.send('panel-stop-find-in-page', action),
  onOpenFind: (callback) => {
    ipcRenderer.on('panel-find-open', () => callback());
  },
  onFoundInPage: (callback) => {
    ipcRenderer.on('panel-found-in-page', (event, result) => callback(result));
  }
});
