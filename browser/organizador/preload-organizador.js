// Preload da janela do Organizador do navegador SuperPROC: só os canais da base comum (organizador-host.js no host).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orgApi', {
  origens: () => ipcRenderer.invoke('org-origens'),
  ler: (tipo) => ipcRenderer.invoke('org-ler', tipo === 'evt' ? 'evt' : 'loc'),
  gravar: (tipo, origem, dados) => ipcRenderer.invoke('org-gravar', { tipo: tipo === 'evt' ? 'evt' : 'loc', origem: String(origem || ''), dados }),
  lerCores: (origem) => ipcRenderer.invoke('org-ler-cores', String(origem || '')),
  gravarRegras: (origem, regras) => ipcRenderer.invoke('org-gravar-regras', { origem: String(origem || ''), regras }),
  gravarCor: (origem, nome, regra) => ipcRenderer.invoke('org-gravar-cor', { origem: String(origem || ''), nome: String(nome || ''), regra }),
  aoTrocarModulo: (cb) => ipcRenderer.on('org-modulo', (_e, m) => cb(m)),
  // O organizador é um painel dentro da janela do navegador: fechar remove o painel.
  fechar: () => ipcRenderer.send('org-fechar')
});
