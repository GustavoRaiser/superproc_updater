// Executa também nos frames incorporados do painel, incluindo o leitor PDF.
const { ipcRenderer } = require('electron');

window.addEventListener('dblclick', (event) => {
  if (event.isTrusted && event.button === 0) {
    ipcRenderer.send('panel-content-toggle-pin');
  }
}, true);

// O duplo clique já é o comando de fixar/desfixar o painel: não pode também selecionar conteúdo
// (palavra no 2º clique, parágrafo no 3º). Cancelar o padrão do mousedown repetido impede a seleção,
// mas o evento dblclick acima continua sendo disparado normalmente.
window.addEventListener('mousedown', (event) => {
  if (event.isTrusted && event.button === 0 && event.detail >= 2) event.preventDefault();
}, true);
