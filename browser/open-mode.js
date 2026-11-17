'use strict';
// Modos de abertura do SuperPROC (host). Funções puras, sem Electron: recebem a lista de
// monitores (formato de screen.getAllDisplays(): { id, bounds }) e os limites da janela.
//   simples        navegador comum (sem abas unificadas)
//   integrada      abas unificadas capa/editor/árvore (comportamento atual)
//   doisMonitores  árvore/documentos no monitor físico oposto; só com exatamente 2 monitores
// A coluna do Copilot NÃO é um modo: é um liga/desliga independente (config colunaCopilot) que vale em qualquer
// modo e ocupa sempre uma faixa da janela principal (copilot-column.js, layout-geometry.js).

const MODOS = Object.freeze(['simples', 'integrada', 'doisMonitores']);
const MODO_PADRAO = 'integrada';

function normalizarModo(valor) {
  return MODOS.includes(valor) ? valor : MODO_PADRAO;
}

// Configs antigas gravavam 'integradaCopilot' como modo: equivale a Integrada + coluna do Copilot ligada.
function colunaDoModoLegado(valor) { return valor === 'integradaCopilot'; }

function listaValida(displays) {
  return Array.isArray(displays) ? displays.filter(d => d && d.bounds) : [];
}

// Dois monitores só é habilitável com exatamente 2 displays (um ultrawide é um único display).
function modoDisponivel(modo, displays) {
  if (normalizarModo(modo) !== 'doisMonitores') return true;
  return listaValida(displays).length === 2;
}

// Modo realmente aplicado: se o escolhido estiver indisponível, comporta-se como integrada.
// A escolha salva não é alterada; ao voltar a haver 2 monitores o modo escolhido volta a valer.
function modoEfetivo(modo, displays) {
  const escolhido = normalizarModo(modo);
  return modoDisponivel(escolhido, displays) ? escolhido : MODO_PADRAO;
}

function areaSobreposta(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// Monitor de origem: o de maior sobreposição com a janela; sem sobreposição, o de centro mais próximo.
function displayDeOrigem(displays, janela) {
  const lista = listaValida(displays);
  if (!lista.length || !janela) return null;
  let melhor = null;
  let melhorArea = -1;
  for (const d of lista) {
    const area = areaSobreposta(janela, d.bounds);
    if (area > melhorArea) { melhor = d; melhorArea = area; }
  }
  if (melhorArea > 0) return melhor;
  const cx = janela.x + janela.width / 2;
  const cy = janela.y + janela.height / 2;
  let menor = Infinity;
  for (const d of lista) {
    const dx = d.bounds.x + d.bounds.width / 2 - cx;
    const dy = d.bounds.y + d.bounds.height / 2 - cy;
    const dist = dx * dx + dy * dy;
    if (dist < menor) { menor = dist; melhor = d; }
  }
  return melhor;
}

// Monitor oposto = o outro monitor físico. Com um ultrawide, a metade livre do mesmo monitor
// NUNCA conta: o destino é sempre outro display. Fora de exatamente 2 displays: null.
function displayOposto(displays, janela) {
  const lista = listaValida(displays);
  if (lista.length !== 2) return null;
  const origem = displayDeOrigem(lista, janela);
  return lista.find(d => d !== origem) || null;
}

// Decisão de abertura para um pedido de window.open / link com target. Recebe o modo EFETIVO
// (modoEfetivo) e um resumo do pedido; não conhece Electron.
//   disposition     'foreground-tab' | 'background-tab' | 'new-window' | 'default' | 'other'
//   middleClick     clique da roda (aba autônoma em segundo plano)
//   temPapelProcesso a URL de destino é capa/editor/árvore do eproc (getProcessRole != null)
//   urlVazia        destino vazio ou about:blank (a página navega depois: o papel ainda é desconhecido)
//   origemSaneador  pedido de uma aba do Saneador: sempre unificado, como hoje
// Retorno: { destino: 'janela' | 'aba', unificar: boolean }
//   janela: janela do sistema com barra nativa. aba: aba do host; unificar = entra no grupo do processo.
function decidirAbertura(modo, pedido = {}) {
  const { disposition, middleClick, temPapelProcesso, urlVazia, origemSaneador } = pedido;
  if (origemSaneador) return { destino: 'aba', unificar: true };
  const emSegundoPlano = !!middleClick || disposition === 'background-tab';
  if (emSegundoPlano) return { destino: 'aba', unificar: false };
  const pedeJanela = disposition === 'new-window';
  if (normalizarModo(modo) === 'simples') {
    return pedeJanela ? { destino: 'janela', unificar: false } : { destino: 'aba', unificar: false };
  }
  // integrada e doisMonitores (a aba unificada é a mesma; o modo só muda onde a árvore aparece):
  // capa/editor/árvore continuam unificados. Janela do sistema só para destino concreto fora do processo; destino vazio fica como hoje.
  if (pedeJanela && !temPapelProcesso && !urlVazia) return { destino: 'janela', unificar: false };
  return { destino: 'aba', unificar: true };
}

// Em Simples, pedidos internos de "abrir contexto de processo" viram abas comuns, sem grupo.
function abrirProcessoUnificado(modo, { forcarUnificada } = {}) {
  return !!forcarUnificada || normalizarModo(modo) !== 'simples';
}

// Plano de exibição de um grupo (aba unificada de processo) no modo Dois monitores.
//   grupo: abas do grupo ({ id, processRole, lastLeftTabId }); ativa: a aba selecionada.
// A janela principal mostra UMA subaba (capa ou editor) em 100%; a árvore/documentos vai ao segundo
// monitor. Sem árvore, não há segundo monitor. Devolve null para grupos sem papéis de processo
// (divisão manual esquerda/direita), que seguem o layout clássico.
function planoDoisMonitores(grupo, ativa) {
  const lista = Array.isArray(grupo) ? grupo.filter(Boolean) : [];
  if (!ativa || !lista.some(t => ['capa', 'editor', 'arvore'].includes(t.processRole))) return null;
  const arvore = lista.find(t => t.processRole === 'arvore') || null;
  const capa = lista.find(t => t.processRole === 'capa') || null;
  const editor = lista.find(t => t.processRole === 'editor') || null;
  let principal;
  if (ativa.processRole === 'capa' || ativa.processRole === 'editor') {
    principal = ativa;
  } else {
    // Árvore ativa: a principal continua mostrando o que estava (capa/editor) antes.
    const lembrada = lista.find(t => t.id === ativa.lastLeftTabId);
    principal = (lembrada && lembrada.processRole !== 'arvore' ? lembrada : null) || editor || capa
      || lista.find(t => t !== arvore) || ativa;
  }
  // Grupo só com a árvore: ela fica na própria janela principal.
  const segundo = arvore && arvore !== principal ? arvore : null;
  return { principal, segundo };
}

module.exports = { MODOS, MODO_PADRAO, normalizarModo, colunaDoModoLegado, modoDisponivel, modoEfetivo, displayDeOrigem, displayOposto, decidirAbertura, abrirProcessoUnificado, planoDoisMonitores };
