const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findAPI', {
  find:    (text, options) => ipcRenderer.send('find-search', { text, options }),
  findNext: (forward)     => ipcRenderer.send('find-next', { forward }),
  stop:    ()             => ipcRenderer.send('find-stop'),
  close:   ()             => ipcRenderer.send('find-close'),

  // Redimensionar a janela de busca (glossário aberto/fechado)
  resize:  (height)       => ipcRenderer.send('find-resize', { height }),

  // Solicitar extração de ocorrências com contexto da página atual
  requestGlossary: (term, options = {}) => ipcRenderer.send('find-glossary-request', { term, options }),

  // Pular para a ocorrência selecionada no glossário
  jumpToGlossary: (index) => ipcRenderer.send('find-glossary-jump', { index }),

  onShow: (callback) => {
    ipcRenderer.on('find-show', (event, data) => callback(data));
  },
  onResults: (callback) => {
    ipcRenderer.on('find-results', (event, result) => callback(result));
  },
  onGlossaryResults: (callback) => {
    ipcRenderer.on('find-glossary-results', (event, entries) => callback(entries));
  }
});
