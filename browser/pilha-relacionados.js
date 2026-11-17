'use strict';
// Pilha de processos relacionados (host). Funções puras, sem Electron.
// Regra: um processo aberto a partir da CAPA de outro processo (CNJ ou instância diferente) entra na "pilha" da aba de origem.
// A barra de abas mostra a pilha como UMA aba com um segmento por processo, na ordem de abertura: o processo em foco
// expandido (ícones + número) e os demais compactos (só o número). O vínculo vive só na memória do shell (o link do eproc não traz origem:
// só num_processo e um hash próprio da ação).

// 20 dígitos do CNJ a partir de num_processo (ou txtNumProcesso/numProcesso) da URL; null se não houver.
function numeroCompleto(url) {
  try {
    const u = new URL(url);
    const bruto = u.searchParams.get('num_processo') || u.searchParams.get('txtNumProcesso') || u.searchParams.get('numProcesso')
      || u.searchParams.get('txtNumProcessoOriginarioExterno') || '';
    const d = bruto.replace(/\D/g, '');
    return d.length === 20 ? d : null;
  } catch (_) { return null; }
}

function formatarCnj(d) {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length !== 20) return String(d || '');
  return `${s.slice(0, 7)}-${s.slice(7, 9)}.${s.slice(9, 13)}.${s.slice(13, 14)}.${s.slice(14, 16)}.${s.slice(16)}`;
}

// Remessa a outro sistema/grau (ex.: 2º grau, eproc2g): o link inicial é "processo_consultar_sistema_externo_preparar"
// (número em txtNumProcessoOriginarioExterno) e redireciona para a capa do processo no destino.
function ehRemessaExterna(url) {
  try { return new URL(url).searchParams.get('acao') === 'processo_consultar_sistema_externo_preparar'; } catch (_) { return false; }
}

// Rotas de remessa podem carregar a URL do sistema de origem antes do redirecionamento.
function instanciaProcesso(url) {
  try {
    const destino = new URL(url);
    if (ehRemessaExterna(url) || destino.searchParams.get('acao') === 'processo_consultar_arvore_sistema_externo') {
      const sistema = (destino.searchParams.get('selOrigemExterno') || '').toUpperCase();
      if (destino.hostname === 'eproc1g.tjsc.jus.br' && sistema === 'TJSC') {
        destino.hostname = 'eproc2g.tjsc.jus.br';
      } else {
        return JSON.stringify([destino.origin, sistema]);
      }
    }
    return destino.origin;
  } catch (_) { return null; }
}

function chaveProcesso(url) {
  const numero = numeroCompleto(url);
  const instancia = instanciaProcesso(url);
  return numero && instancia ? JSON.stringify([instancia, numero]) : null;
}

function deveEmpilhar({ urlOrigem, urlDestino, papelOrigem, papelDestino }) {
  if (papelOrigem !== 'capa' || (papelDestino !== 'capa' && !ehRemessaExterna(urlDestino))) return false;
  const origem = chaveProcesso(urlOrigem);
  const destino = chaveProcesso(urlDestino);
  return !!origem && !!destino && origem !== destino;
}

// Marcador de exclusão: módulos da página (ex.: navegação da lista, anterior/próximo) gravam em
// <html data-superproc-sem-pilha="<Date.now()>"> antes de navegar; vale por poucos segundos.
const JANELA_MARCADOR_MS = 8000;
function marcadorValido(valor, agora = Date.now(), janela = JANELA_MARCADOR_MS) {
  const t = Number(valor);
  return Number.isFinite(t) && t > 0 && agora - t >= -1000 && agora - t <= janela;
}

// Vincula `novo` à pilha de `origem` (criando-a se preciso). Retorna true se empilhou.
function marcar(novo, origem, dados) {
  if (!novo || !origem || !deveEmpilhar(dados)) return false;
  if (!origem.stackId) { origem.stackId = 'stk_' + origem.id; origem.stackRaiz = true; } // a raiz é o processo que originou a pilha
  if (!origem.stackNumero) origem.stackNumero = numeroCompleto(dados.urlOrigem);
  novo.stackId = origem.stackId;
  novo.stackNumero = numeroCompleto(dados.urlDestino);
  novo.stackDestino = chaveProcesso(dados.urlDestino);
  return true;
}

// Aba já existente na pilha com o mesmo processo (evita abrir duplicada).
function achar(tabs, stackId, urlDestino) {
  const destino = chaveProcesso(urlDestino);
  if (!stackId || !destino) return null;
  const membros = tabs.filter(t => t.stackId === stackId);
  return membros.find(t => t.processRole === 'capa' && chaveProcesso(t.url) === destino) ||
    membros.find(t => (!t.processRole || t.processRole === 'capa') && t.stackDestino === destino) || null;
}

// Rótulo do processo de uma entrada da barra: capa à vista > número guardado > título.
function rotuloDe(tabsDaEntrada) {
  for (const t of tabsDaEntrada) {
    if (t.processRole === 'capa') { const n = numeroCompleto(t.url); if (n) return formatarCnj(n); }
  }
  const guardado = tabsDaEntrada.find((t) => t.stackNumero);
  if (guardado) return formatarCnj(guardado.stackNumero);
  const comTitulo = tabsDaEntrada.find((t) => t.title);
  return (comTitulo && comTitulo.title) || 'Processo';
}

// Funde, na lista de grupos visuais (cada grupo = array de abas), os grupos da mesma pilha (>= 2) em um só "slot",
// na posição do primeiro. Usado por reorderTabs para que os índices batam com o que a barra desenha.
function agruparSlots(grupos) {
  const porPilha = new Map();
  grupos.forEach((g) => { const id = g.find((t) => t.stackId)?.stackId; if (id) porPilha.set(id, (porPilha.get(id) || 0) + 1); });
  const vistos = new Set();
  const slots = [];
  grupos.forEach((g) => {
    const id = g.find((t) => t.stackId)?.stackId;
    if (!id || porPilha.get(id) < 2) { slots.push(g); return; }
    if (vistos.has(id)) return;
    vistos.add(id);
    slots.push(grupos.filter((o) => o.find((t) => t.stackId)?.stackId === id).flat());
  });
  return slots;
}

// Colapsa as entradas da barra (formato de publishTabsUpdated) de uma mesma pilha em uma só: a que está à vista
// (ou a última que esteve), com `stack: { id, total, membros }`; `membros` fica na ordem de abertura e `topo` marca o foco.
// Cada entrada traz `chave` (id da aba ou do grupo), `alvo` (aba a ativar ao escolher), `stackId` e `rotulo`.
// `memo` (Map stackId -> chave do topo) lembra qual estava à vista quando a pilha inteira está em segundo plano.
function colapsar(entradas, memo = new Map()) {
  const porPilha = new Map();
  entradas.forEach((e) => { if (e.stackId) { if (!porPilha.has(e.stackId)) porPilha.set(e.stackId, []); porPilha.get(e.stackId).push(e); } });
  const escolhido = new Map(); // stackId -> entrada representante
  for (const [id, lista] of porPilha) {
    if (lista.length < 2) continue;
    const ativa = lista.find((e) => e.active);
    if (ativa) memo.set(id, ativa.chave);
    const topo = ativa || lista.find((e) => e.chave === memo.get(id)) || lista[0];
    memo.set(id, topo.chave);
    // Ordem fixa de abertura (a barra desenha os processos lado a lado): o foco só muda `topo`, nunca a posição.
    escolhido.set(id, {
      topo,
      stack: { id, total: lista.length, membros: lista.map((e) => ({ chave: e.chave, alvo: e.alvo, rotulo: e.rotulo, ativo: !!e.active, topo: e === topo, raiz: !!e.raiz, subtabs: Array.isArray(e.subtabs) ? e.subtabs.map((s) => ({ id: s.id, role: s.role, favicon: s.favicon, isOnScreen: !!s.isOnScreen, active: !!s.active })) : null })) }
    });
  }
  const saida = [];
  const jaPosto = new Set();
  entradas.forEach((e) => {
    const sel = e.stackId ? escolhido.get(e.stackId) : null;
    if (!sel) { saida.push(e); return; }
    if (jaPosto.has(e.stackId)) return;
    jaPosto.add(e.stackId);
    saida.push({ ...sel.topo, stack: sel.stack });
  });
  return saida;
}

module.exports = { marcadorValido, ehRemessaExterna, numeroCompleto, formatarCnj, instanciaProcesso, chaveProcesso, deveEmpilhar, marcar, achar, rotuloDe, agruparSlots, colapsar };
