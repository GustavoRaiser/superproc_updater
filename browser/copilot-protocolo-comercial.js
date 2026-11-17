'use strict';
// Compatibilidade experimental, implementação própria. Não emula identidade ou APIs privadas do Edge.
const { ORIGENS_PADRAO, MAX_CHARS_PADRAO, MAX_CHARS_TETO, sanitizar } = require('./copilot-protocolo-edge');
const EVENTOS = Object.freeze({
  consentimento: 'Discover.Chat.Consent.Req', contexto: 'Discover.Chat.ContextConsent.Req',
  metadados: 'Discover.Chat.Page.GetMetaData', texto: 'Discover.Chat.Page.GetData',
  estruturado: 'Discover.Chat.Page.GetStructuredText'
});
function urlPedida(args) {
  const valor = typeof args.url === 'string' ? args.url : (args.url && typeof args.url.url === 'string' ? args.url.url : '');
  if (!valor) return '';
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch (_) { return null; }
}
function criarProtocoloComercial({ provedor, origensPermitidas = ORIGENS_PADRAO, agora = Date.now, timeoutMs = 120000, log = () => {} }) {
  const origens = new Set(origensPermitidas);
  let pedidos = [];
  const responder = (eventName, eventArgs) => [{ eventName, eventArgs }];
  const limitar = async fn => {
    let timer, cancelado = false;
    try { return await Promise.race([Promise.resolve().then(() => fn(() => cancelado)), new Promise((_, reject) => { timer = setTimeout(() => { cancelado = true; reject(Error('timeout')); }, timeoutMs); })]); }
    finally { clearTimeout(timer); }
  };
  async function tratar(mensagem, origem) {
    if (!origens.has(origem) || !mensagem || typeof mensagem !== 'object' || !Object.values(EVENTOS).includes(mensagem.eventName)) return [];
    const evento = mensagem.eventName;
    const t = agora(); pedidos = pedidos.filter(x => t - x < 60000);
    if (pedidos.length >= 30) return [];
    pedidos.push(t);
    // Consultar o estado não concede permissão nem importa consentimento de outra aplicação.
    if (evento === EVENTOS.consentimento) return responder('Discover.Chat.Consent.Rep', { text: 'NotPresent' });
    if (evento === EVENTOS.contexto) return responder('Discover.Chat.ContextConsent.Rep', { text: 'NotPresent' });
    const args = mensagem.eventArgs;
    if (args != null && (typeof args !== 'object' || Array.isArray(args))) return [];
    const a = args || {};
    // A rota apiVersion 2 e formatos nativos não foram demonstrados; não anunciar suporte.
    if (a.apiVersion != null && a.apiVersion !== 0 && a.apiVersion !== 1) return [];
    if (evento === EVENTOS.estruturado) return [];
    if (evento !== EVENTOS.metadados && (typeof a.requestId !== 'string' || !a.requestId || a.requestId.length > 128)) return [];
    if (a.tabId != null && (!Number.isSafeInteger(a.tabId) || (a.tabId !== -1 && a.tabId <= 0))) return [];
    const url = urlPedida(a);
    if (url === null) return [];
    try {
      return await limitar(async cancelado => {
        // O serviço pode pedir a aba ativa (-1), uma aba pelo id ou uma aba
        // inequivocamente identificada pelo endereço. O provedor confere se
        // ambos ainda pertencem ao mesmo documento antes de expor conteúdo.
        const alvo = await provedor.abaAlvo({ tabId: a.tabId == null ? -1 : a.tabId, url });
        if (cancelado() || !alvo || alvo.bloqueada) return [];
        const finalidade = evento === EVENTOS.metadados ? 'metadados' : 'corpo';
        if (!(await provedor.consentir({ origem, alvo, finalidade }))) return [];
        if (cancelado()) return [];
        if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return [];
        if (evento === EVENTOS.metadados) return responder('Discover.Chat.Page.MetaData', { title: sanitizar(alvo.title), url: alvo.url, pageType: alvo.tipo === 'pdf' ? 1 : 0, metaData: '' });
        const max = Number.isSafeInteger(a.maxChars) ? Math.min(MAX_CHARS_TETO, Math.max(1, a.maxChars)) : MAX_CHARS_PADRAO;
        const seletor = Array.isArray(a.domSelector) && typeof a.domSelector[0] === 'string' ? a.domSelector[0].slice(0,200) : '';
        const texto = alvo.tipo === 'pdf'
          ? (provedor.lerPdf ? await provedor.lerPdf(alvo, { max }) : null)
          : await provedor.lerTexto(alvo, { seletor, max });
        if (cancelado() || typeof texto !== 'string' || (provedor.alvoAtual && !provedor.alvoAtual(alvo))) return [];
        return responder('Discover.Chat.Page', { text: sanitizar(texto).slice(0,max), requestId: a.requestId });
      });
    } catch (_) {
      // Somente categoria; nunca registrar texto da página ou exceção bruta.
      try { log('COPILOT_COMERCIAL', 'Falha na solicitação de contexto'); } catch (_) {}
      return [];
    }
  }
  return { tratar };
}
module.exports = { EVENTOS, urlPedida, criarProtocoloComercial };
