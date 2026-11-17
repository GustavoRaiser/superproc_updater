const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chooserAPI', {
  pick: (indice) => ipcRenderer.send('quick-chooser-pick', indice),
  size: (dados) => ipcRenderer.send('quick-chooser-size', dados),
  close: () => ipcRenderer.send('quick-chooser-close'),
  onData: (cb) => ipcRenderer.on('quick-chooser-data', (_e, dados) => cb(dados))
});
