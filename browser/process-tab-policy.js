const { numeroCompleto, instanciaProcesso, chaveProcesso } = require('./pilha-relacionados');

function getRootNavigationTab(tabs, target) {
  if (!target?.groupId) return target;
  return tabs.find(tab => tab.groupId === target.groupId && tab.processRole === 'capa') || target;
}

// Promove a própria WebContents, sem recarregar nem reproduzir requisições POST.
// Uma capa nunca ocupa a posição de outra subaba nem divide o grupo com outra capa.
function enforceCapaRoot(tabs, tab, previousRole) {
  if (tab.processRole !== 'capa' || !tab.groupId) return false;
  const peers = tabs.filter(other => other.groupId === tab.groupId && other.id !== tab.id);
  const first = tabs.find(other => other.groupId === tab.groupId);
  if (!peers.some(other => other.processRole === 'capa') && first?.id === tab.id &&
      (!previousRole || previousRole === 'capa')) return false;
  delete tab.groupId;
  delete tab.lastLeftTabId;
  delete tab.nativeSourceTabId;
  tab.nativeStandalone = true;
  const root = peers.find(other => other.processRole === 'capa');
  for (const peer of peers) {
    if (peer.lastLeftTabId === tab.id) {
      if (root) peer.lastLeftTabId = root.id;
      else delete peer.lastLeftTabId;
    }
  }
  return true;
}

function getProcessRole(url) {
  try {
    // Ler a ação exata: processo_consultar_arvore não é processo_consultar,
    // e acao_origem/acao_retorno não identificam o conteúdo atual.
    const action = new URL(url).searchParams.get('acao')?.toLowerCase() || '';
    if (['processo_selecionar', 'processo_detalhar', 'processo_consultar'].includes(action)) return 'capa';
    if (action.startsWith('arvore') || ['acessar_documento', 'processo_consultar_arvore', 'processo_consultar_arvore_sistema_externo'].includes(action)) return 'arvore';
    if (action.startsWith('minuta')) return 'editor';
  } catch (_) {}
  return null;
}

// Mantém a árvore no contexto da capa de origem. Um destino explicitamente
// diferente só pode usar a capa correspondente dentro da mesma pilha.
function resolverOrigemDaArvore(tabs, origem, urlDestino) {
  if (!origem) return null;
  const capa = getRootNavigationTab(tabs, origem);
  const instanciaOrigem = instanciaProcesso(capa.url);
  const instanciaDestino = instanciaProcesso(urlDestino);
  const numeroOrigem = numeroCompleto(capa.url);
  const numeroDestino = numeroCompleto(urlDestino);
  if (instanciaOrigem === instanciaDestino && (!numeroDestino || !numeroOrigem || numeroDestino === numeroOrigem)) {
    return capa;
  }
  const destino = chaveProcesso(urlDestino);
  if (!destino || !capa.stackId) return null;
  const candidatas = tabs.filter(t => t.stackId === capa.stackId &&
    t.processRole === 'capa' && chaveProcesso(t.url) === destino);
  return candidatas.length === 1 ? candidatas[0] : null;
}

function grausDoMesmoProcesso(tabs, a, b) {
  if (!a || !b || a.groupId === b.groupId) return false;
  const urlA = getRootNavigationTab(tabs, a).url;
  const urlB = getRootNavigationTab(tabs, b).url;
  const cnj = numeroCompleto(urlA);
  return !!cnj && cnj === numeroCompleto(urlB) && instanciaProcesso(urlA) !== instanciaProcesso(urlB);
}

module.exports = { getRootNavigationTab, enforceCapaRoot, getProcessRole, resolverOrigemDaArvore, grausDoMesmoProcesso };
