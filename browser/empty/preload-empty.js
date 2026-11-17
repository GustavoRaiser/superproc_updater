const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emptyAPI', {
  openHome: () => ipcRenderer.send('empty-action-home'),
  openLocalizadores: () => ipcRenderer.send('empty-action-localizadores'),
  undo: () => ipcRenderer.send('empty-action-undo'),
  closeWindow: () => ipcRenderer.send('empty-action-close')
});
