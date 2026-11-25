// Ponte do painel "Meus Localizadores" (locs-painel.html) com o host (locs-painel-host.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('locsApi', {
  // Painel -> host
  gravar: (chave, valor) => ipcRenderer.send('locs-gravar', { chave, valor }),
  buscar: (urlLocs) => ipcRenderer.invoke('locs-buscar', urlLocs),
  navegar: (url) => ipcRenderer.send('locs-navegar', url),
  fechar: () => ipcRenderer.send('locs-fechar'),
  tamanho: (dim) => ipcRenderer.send('locs-tamanho', dim),
  ponteiro: (estado) => ipcRenderer.send('locs-ponteiro', estado),
  // Host -> painel
  aoAbrir: (cb) => ipcRenderer.on('locs-abrir', (_e, dados) => cb(dados)),
  aoFechar: (cb) => ipcRenderer.on('locs-fechar', () => cb()),
  aoChaves: (cb) => ipcRenderer.on('locs-chaves', (_e, chaves) => cb(chaves))
});
