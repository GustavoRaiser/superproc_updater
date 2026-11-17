const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spellAPI', {
  getLists: () => ipcRenderer.invoke('spell-get-lists'),
  addWord: (kind, word) => ipcRenderer.invoke('spell-add-word', { kind, word }),
  removeWord: (kind, word) => ipcRenderer.invoke('spell-remove-word', { kind, word }),
  importList: kind => ipcRenderer.invoke('spell-import', { kind }),
  exportList: kind => ipcRenderer.invoke('spell-export', { kind }),
  close: () => ipcRenderer.send('spell-manage-close')
});
