const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jfAPI', {
  fechar: () => ipcRenderer.send('jf-fechar'),
  maximizar: () => ipcRenderer.send('jf-maximizar'),
  arrasto: (dado) => ipcRenderer.send('jf-arrasto', dado),
  aoReceberDados: (callback) => ipcRenderer.on('jf-dados', (_e, dados) => callback(dados))
});
