// Linha da capa: orquestrador (camada: host; mundo isolado 1108, só na capa do processo).
// Chave em CFG > Configurações ("Linha de Lembretes e Minutas da capa", linhaCapa).
//
// Cria, logo abaixo da capa (#fldCapa), UMA linha com três colunas vazias:
//   #sp-lc-lembretes (25%)  |  #sp-lc-minutas (25%)  |  #sp-lc-acoes (50%)
// e mais nada. Cada coluna tem o seu script, que só procura a sua coluna pelo id e a preenche:
//   linha-capa-lembretes.js  -> #sp-lc-lembretes
//   linha-capa-minutas.js    -> #sp-lc-minutas
//   linha-capa-acoes.js      -> #sp-lc-acoes
// Assim cada parte cuida das suas peculiaridades sem depender das outras, e a linha inteira nasce de uma vez, com as medidas
// finais (linha-capa-cedo.css), no instante em que a capa termina de chegar.
//
// Começa no início do documento (eproc-recursos-cedo-preload.js), antes de existir <html>: nada aqui em cima toca no DOM.
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spLinhaCapa) return;
window.__spLinhaCapa = true;

const COLUNAS = ['sp-lc-lembretes', 'sp-lc-minutas', 'sp-lc-acoes'];

// O elemento está inteiro no DOM? Enquanto o HTML chega, só depois que o parser já passou dele (existe algo depois dele).
function chegouInteiro(el) {
  if (document.readyState !== 'loading') return true;
  for (let n = el; n && n !== document.documentElement; n = n.parentNode) if (n.nextSibling) return true;
  return false;
}

// Devolve true quando não há mais o que esperar (linha criada, ou página sem capa).
function montar() {
  if (document.getElementById('sp-lc-linha')) return true;
  const capa = document.getElementById('fldCapa');
  if (capa && chegouInteiro(capa)) {
    const linha = document.createElement('div');
    linha.id = 'sp-lc-linha';
    for (const id of COLUNAS) { const c = document.createElement('div'); c.id = id; c.className = 'sp-lc-coluna'; linha.appendChild(c); }
    capa.after(linha);
    return true;
  }
  // HTML inteiro e sem capa: não haverá linha. Solta o que o CSS inicial escondeu à espera dela.
  if (!capa && document.readyState !== 'loading' && document.documentElement) { document.documentElement.classList.add('sp-lc-sem-linha'); return true; }
  return false;
}

// Na hora, a cada pedaço de HTML que chega (sem temporizador: o que o parser acabou de inserir é tratado antes do próximo desenho).
if (!montar()) {
  const observador = new MutationObserver(() => { if (montar()) observador.disconnect(); });
  observador.observe(document, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (montar()) observador.disconnect(); }, { once: true });
}
