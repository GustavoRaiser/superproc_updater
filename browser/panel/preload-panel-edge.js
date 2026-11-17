const { contextBridge, ipcRenderer } = require('electron');

// A borda do painel só redimensiona a largura (sem o duplo clique de fixar do cabeçalho).
contextBridge.exposeInMainWorld('panelAPI', {
  resizeDelta: (deltaX) => ipcRenderer.send('panel-resize-delta', deltaX),
  startResize: () => ipcRenderer.send('panel-resize-start'),
  endResize: () => ipcRenderer.send('panel-resize-end')
});
