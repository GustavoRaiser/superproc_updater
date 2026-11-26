// Linha da capa: coluna dos Lembretes (camada: host; mundo isolado 1108, só na capa do processo).
// Preenche #sp-lc-lembretes, criada pelo orquestrador (linha-capa.js). Não conhece as outras colunas.
// Porte da parte de lembretes do módulo da extensão (modules/capa/lembretes_minutas.js), separada da de minutas.
//
// - Uma caixa ocupa a coluna: "LEMBRETES (+)" (verde) quando há lembrete, "SEM LEMBRETES (+)" (cinza) quando não há. Enquanto o
//   bloco do eproc não chegou, é só a caixa, sem texto (não mostra um estado que pode ser desmentido em seguida).
// - O "(+)" é sempre o jeito de criar um lembrete: aciona o "Novo Lembrete" do eproc (o link nativo, que continua no bloco
//   oculto), fecha o balão e cancela a abertura por hover que estiver a caminho.
// - Com lembrete, o bloco nativo (#fldLembretes) é o balão, compacto e sem cabeçalho (só os lembretes): abre por clique na
//   caixa ou com o mouse parado 0,5 s; fecha por clique fora, Esc ou novo clique.
// - Sem lembrete não há balão nem hover. Se o último lembrete some com o balão aberto, o balão fecha.
// - O CSS inicial (linha-capa-cedo.css) mantém o bloco nativo oculto desde que nasce: ele nunca aparece no lugar original.
// - Um balão por vez na linha: quem abre avisa (evento 'sp-lc-abriu' no document) e os outros fecham.
// - O estado acompanha a página: lembrete criado, excluído, ocultado ou esvaziado pelo eproc muda a caixa na hora. Se o eproc
//   recarregar os lembretes num #fldLembretes novo, o novo passa a valer e o antigo sai.
//
// Começa no início do documento (antes de existir <html>): nada aqui em cima toca no DOM.
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spLcLembretes) return;
window.__spLcLembretes = true;

const HOVER_MS = 500;
let caixa = null;   // a caixa da coluna (.sp-lc-botao): estado e hover
let botao = null;   // o texto clicável dentro dela (.sp-lc-rotulo)
let mais = null;    // o "(+)" (.sp-lc-mais), só visível sem lembrete
let bloco = null;   // o #fldLembretes adotado como balão
let aberto = false;
let temporizador = null; // abertura por hover a caminho

function chegouInteiro(el) {
  if (document.readyState !== 'loading') return true;
  for (let n = el; n && n !== document.documentElement; n = n.parentNode) if (n.nextSibling) return true;
  return false;
}

// Lembrete real = no DOM, com texto e não ocultado pelo eproc dentro do bloco.
function itemReal(el) {
  if (!el.isConnected || !(el.textContent || '').trim()) return false;
  for (let n = el; n && n !== bloco; n = n.parentElement) {
    if (n.hidden || (n.style && (n.style.display === 'none' || n.style.visibility === 'hidden'))) return false;
  }
  return true;
}
const quantos = () => (bloco ? [...bloco.querySelectorAll('.divLembrete')].filter(itemReal).length : 0);

function atualizar() {
  if (!caixa || !bloco) return;
  const tem = quantos() > 0;
  const texto = tem ? 'LEMBRETES' : 'SEM LEMBRETES';
  if (botao.textContent !== texto) botao.textContent = texto;
  caixa.classList.remove('sp-lc-espera');
  caixa.classList.toggle('sp-lc-com', tem);
  caixa.classList.toggle('sp-lc-sem', !tem);
  botao.disabled = !tem;   // sem lembrete o texto não é clicável: não há o que abrir
  mais.hidden = false;     // o "(+)" vale nos dois estados: é sempre por ele que se cria um lembrete
  if (!tem && aberto) fechar();
}

function fechar() {
  aberto = false;
  if (bloco) bloco.classList.remove('sp-lc-aberto');
  if (botao) botao.setAttribute('aria-expanded', 'false');
}
// Só abre havendo lembrete.
function abrir() {
  if (!bloco || quantos() === 0) return;
  aberto = true;
  bloco.classList.add('sp-lc-aberto');
  botao.setAttribute('aria-expanded', 'true');
  document.dispatchEvent(new CustomEvent('sp-lc-abriu', { detail: 'lembretes' }));
}

// "Novo Lembrete": o link nativo da legend do bloco (href javascript: do eproc, que abre o formulário dele).
function novoLembrete() {
  const link = bloco && (bloco.querySelector('legend a[title="Novo Lembrete"]') || bloco.querySelector('legend a[href*="processo_lembrete_destino_cadastrar"]'));
  if (link) link.click();
}

function criarCaixa(coluna) {
  caixa = document.createElement('div');
  caixa.className = 'sp-lc-botao sp-lc-espera';
  botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'sp-lc-rotulo';
  botao.textContent = 'LEMBRETES';
  botao.disabled = true;
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-controls', 'fldLembretes');
  mais = document.createElement('button');
  mais.type = 'button';
  mais.className = 'sp-lc-mais';
  mais.textContent = '(+)';
  mais.title = 'Novo lembrete';
  mais.setAttribute('aria-label', 'Novo lembrete');
  mais.hidden = true;
  caixa.append(botao, mais);
  coluna.appendChild(caixa);
  // A caixa inteira abre e fecha o balão, menos o "(+)": ele cria o lembrete, fecha o balão e cancela o hover a caminho,
  // para o balão nunca ficar na frente do formulário do eproc.
  caixa.addEventListener('click', (e) => {
    if (e.target.closest('.sp-lc-mais')) return;
    if (aberto) fechar(); else abrir();
  });
  mais.addEventListener('click', () => { clearTimeout(temporizador); fechar(); novoLembrete(); });
  caixa.addEventListener('mouseenter', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { if (!aberto) abrir(); }, HOVER_MS); });
  caixa.addEventListener('mouseleave', () => clearTimeout(temporizador));
}

// Mudanças dentro do bloco (lembrete criado, removido, ocultado, texto esvaziado) refazem a conta.
const vigia = new MutationObserver(atualizar);

function adotar(novo) {
  if (bloco && bloco !== novo) { vigia.disconnect(); bloco.remove(); }
  bloco = novo;
  bloco.classList.add('sp-lc-balao');
  bloco.classList.toggle('sp-lc-aberto', aberto);
  caixa.parentNode.appendChild(bloco);
  vigia.observe(bloco, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  atualizar();
}

// Marca no <html> de que este script está vivo: o CSS inicial só esconde o bloco nativo enquanto ela existir. Se o script não
// for carregado ou falhar, o bloco do eproc continua aparecendo no lugar dele.
function marcarVivo() { if (document.documentElement) document.documentElement.classList.add('sp-lc-tem-lembretes'); }

// Roda a cada mudança do DOM, na hora. Barato: dois ou três getElementById.
function montar() {
  marcarVivo();
  if (!caixa) {
    const coluna = document.getElementById('sp-lc-lembretes');
    if (!coluna) return;
    criarCaixa(coluna);
  }
  // O bloco ainda por adotar (o primeiro, ou um recarregado pelo eproc): o que não está dentro da coluna.
  for (const f of document.querySelectorAll('#fldLembretes')) {
    if (f !== bloco && chegouInteiro(f)) { adotar(f); break; }
  }
}

document.addEventListener('click', (e) => {
  if (!aberto) return;
  if (e.target && e.target.closest && e.target.closest('#sp-lc-lembretes')) return;
  fechar();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !aberto) return;
  fechar();
  botao.focus();
});

// Um balão por vez na linha: quem abre avisa, os outros fecham.
document.addEventListener('sp-lc-abriu', (e) => { if (e.detail !== 'lembretes' && aberto) fechar(); });

montar();
// Um bloco que é a última coisa do HTML só é dado como inteiro quando o carregamento termina, e aí não há mais mudança no DOM
// para avisar: confere de novo nesse momento.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
// Fica ligado enquanto a página existir: é ele que percebe o bloco recarregado pelo eproc.
new MutationObserver(montar).observe(document, { childList: true, subtree: true });
