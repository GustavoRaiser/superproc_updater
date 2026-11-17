const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getHistory: () => ipcRenderer.invoke('history-get'),
  openUrl: (url) => ipcRenderer.send('history-open-url', url),
  openProcess: (procData) => ipcRenderer.send('history-open-process', procData),
  itemAction: (payload) => ipcRenderer.invoke('history-item-action', payload),
  removeItem: (type, id) => ipcRenderer.invoke('history-remove-item', { type, id }),
  clearHistory: (type) => ipcRenderer.invoke('history-clear', type),
  closeMenu: () => ipcRenderer.send('history-menu-close'),
  onHistoryUpdated: (callback) => {
    ipcRenderer.on('history-updated', (event, data) => callback(data));
  }
});
