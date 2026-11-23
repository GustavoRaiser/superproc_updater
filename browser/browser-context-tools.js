'use strict';
// Contrato próprio do SuperPROC para agentes que tenham tool calling. Esta
// camada não é exposta por IPC a páginas remotas: apenas código confiável do
// processo principal pode invocá-la e, no futuro, registrá-la num agente.

const { sanitizar, MAX_CHARS_PADRAO, MAX_CHARS_TETO } = require('./copilot-protocolo-edge');

const NOMES = Object.freeze({
  listarAbas: 'browser_list_tabs',
  abaAtiva: 'browser_get_active_tab',
  contextoPagina: 'browser_get_page_context',
  contextoPdf: 'browser_get_pdf_context'
});

function inteiroNoIntervalo(valor, padrao, minimo, maximo) {
  return Number.isSafeInteger(valor) ? Math.min(maximo, Math.max(minimo, valor)) : padrao;
}

function urlHttp(valor) {
  if (valor == null || valor === '') return '';
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch (_) { return null; }
}

function descrever(alvo) {
  return {
    tabId: alvo.id,
    windowId: alvo.windowId,
    index: alvo.index,
    active: !!alvo.active,
    title: sanitizar(alvo.title),
    url: String(alvo.url || ''),
    type: alvo.tipo === 'pdf' ? 'pdf' : 'web'
  };
}

// `admin` (opcional, objeto ou função que o devolve): AdminBroker. Suas ferramentas (prefixo superproc_) entram no catálogo e na
// execução, com a política e as confirmações do próprio AdminBroker; sem ele, só a leitura de contexto (browser_*).
function criarFerramentas({ provedor, perguntar, origem = 'superproc://browser-context-tools', log = () => {}, admin = null }) {
  const getAdmin = () => { try { return typeof admin === 'function' ? admin() : admin; } catch (_) { return null; } };
  if (!provedor || typeof provedor.listarAbas !== 'function' || typeof provedor.abaAlvo !== 'function') throw Error('Provedor de contexto inválido');
  const registrar = (acao, resultado) => { try { log('BROWSER_CONTEXT_TOOL', acao + ': ' + resultado); } catch (_) {} };
  const consentir = async (alvo, finalidade) => {
    const permitido = await provedor.consentir({ origem, alvo, finalidade, perguntar });
    if (!permitido) registrar(finalidade, 'negado');
    return permitido;
  };

  async function listarAbas() {
    if (!(await consentir(null, 'abas'))) return { ok: false, reason: 'consent-required', tabs: [] };
    const abas = await provedor.listarAbas();
    const tabs = (Array.isArray(abas) ? abas : []).slice(0, 100).map(descrever);
    registrar('list_tabs', 'ok (' + tabs.length + ')');
    return { ok: true, tabs };
  }

  async function abaAtiva() {
    const alvo = await provedor.abaAlvo({ tabId: -1 });
    if (!alvo) return { ok: false, reason: 'no-active-tab' };
    if (!(await consentir(alvo, 'metadados'))) return { ok: false, reason: 'consent-required' };
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return { ok: false, reason: 'document-changed' };
    registrar('get_active_tab', 'ok');
    return { ok: true, tab: descrever(alvo) };
  }

  async function contextoPagina(args = {}) {
    const tabId = args.tabId == null ? -1 : args.tabId;
    if (!Number.isSafeInteger(tabId) || (tabId !== -1 && tabId <= 0)) return { ok: false, reason: 'invalid-tab' };
    const url = urlHttp(args.url);
    if (url === null) return { ok: false, reason: 'invalid-url' };
    const alvo = await provedor.abaAlvo({ tabId, url });
    if (!alvo) return { ok: false, reason: 'tab-not-found' };
    if (alvo.tipo === 'pdf') return { ok: false, reason: 'pdf-requires-pdf-tool' };
    if (!(await consentir(alvo, 'corpo'))) return { ok: false, reason: 'consent-required' };
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return { ok: false, reason: 'document-changed' };
    const maxChars = inteiroNoIntervalo(args.maxChars, MAX_CHARS_PADRAO, 1, MAX_CHARS_TETO);
    const selector = typeof args.selector === 'string' ? args.selector.slice(0, 200) : '';
    const text = await provedor.lerTexto(alvo, { seletor: selector, max: maxChars });
    if (typeof text !== 'string') return { ok: false, reason: 'content-unavailable' };
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return { ok: false, reason: 'document-changed' };
    const safeText = sanitizar(text).slice(0, maxChars);
    registrar('get_page_context', 'ok (' + safeText.length + ' chars)');
    return { ok: true, tab: descrever(alvo), text: safeText, truncated: text.length > maxChars };
  }

  async function contextoPdf(args = {}) {
    const tabId = args.tabId == null ? -1 : args.tabId;
    if (!Number.isSafeInteger(tabId) || (tabId !== -1 && tabId <= 0)) return { ok: false, reason: 'invalid-tab' };
    const alvo = await provedor.abaAlvo({ tabId, url: '' });
    if (!alvo) return { ok: false, reason: 'tab-not-found' };
    if (alvo.tipo !== 'pdf' || typeof provedor.lerPdf !== 'function') return { ok: false, reason: 'not-supported' };
    if (!(await consentir(alvo, 'corpo'))) return { ok: false, reason: 'consent-required' };
    const maxChars = inteiroNoIntervalo(args.maxChars, MAX_CHARS_PADRAO, 1, MAX_CHARS_TETO);
    // Faixa opcional de páginas (1-based, inclusiva): pageFrom / pageTo.
    const de = args.pageFrom == null ? null : args.pageFrom, ate = args.pageTo == null ? null : args.pageTo;
    if ((de !== null && (!Number.isSafeInteger(de) || de < 1)) || (ate !== null && (!Number.isSafeInteger(ate) || ate < (de || 1)))) return { ok: false, reason: 'invalid-page-range' };
    const paginas = de !== null || ate !== null ? { de: de || 1, ate: ate || Number.MAX_SAFE_INTEGER } : undefined;
    const text = await provedor.lerPdf(alvo, { max: maxChars, paginas });
    if (typeof text !== 'string' || (provedor.alvoAtual && !provedor.alvoAtual(alvo))) return { ok: false, reason: 'content-unavailable' };
    const safeText = sanitizar(text).slice(0, maxChars);
    registrar('get_pdf_context', 'ok (' + safeText.length + ' chars)');
    return { ok: true, tab: descrever(alvo), text: safeText, truncated: text.length > maxChars };
  }

  async function executar({ name, arguments: args } = {}) {
    switch (name) {
      case NOMES.listarAbas: return listarAbas();
      case NOMES.abaAtiva: return abaAtiva();
      case NOMES.contextoPagina: return contextoPagina(args);
      case NOMES.contextoPdf: return contextoPdf(args);
      default: {
        const a = getAdmin();
        if (a && typeof name === 'string' && name.startsWith('superproc_')) return a.chamar(name, args === undefined ? {} : args);
        return { ok: false, reason: 'unknown-tool' };
      }
    }
  }

  // Ferramentas de administração anunciadas (nome, descrição, JSON Schema, categoria e se estão ligadas pela política).
  const catalogoAdmin = () => { const a = getAdmin(); return a ? a.catalogo() : []; };

  return { listarAbas, abaAtiva, contextoPagina, contextoPdf, executar, catalogoAdmin };
}

module.exports = { NOMES, urlHttp, descrever, criarFerramentas };
