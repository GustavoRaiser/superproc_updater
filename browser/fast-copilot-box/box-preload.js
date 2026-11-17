const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fcAPI', {
  obter: () => ipcRenderer.invoke('fc-box-get'),
  enviar: (pedido) => ipcRenderer.send('fc-box-submit', pedido),
  cancelar: () => ipcRenderer.send('fc-box-cancel')
});
