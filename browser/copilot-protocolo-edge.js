'use strict';
// Protocolo de contexto do Copilot (família Edge.Context.* / Copilot.Tabs.Query), lado navegador. Camada: host.
// Implementação própria do envelope {eventName, requestId, args} levantado no estudo
// v_base/docs/2026-10-27-estudo-edge-copilot-contexto-de-abas.md (formas das respostas lidas em resources.pak#70890/70929).
// Sem Electron: o provedor (abas, texto, consentimento) é injetado. Identidade própria; consentimento nunca automático.
// Desconhecido [?]: valores numéricos de consentStatus e demais campos opcionais; ficam ausentes até serem observados.

const EVENTOS_ENTRADA = Object.freeze({
  META: 'Edge.Context.GetDocumentMetaData',
  CORPO: 'Edge.Context.GetDocumentBody',
  ABAS: 'Copilot.Tabs.Query',
  BUSCAR: 'Edge.Context.FindTextOnPage',
  REALCAR: 'Edge.Context.HighlightTextOnPage',
  LIMPAR_PDF: 'Edge.Context.ClearAllHighlightTextInPdf',
  REALCAR_PDF: 'Edge.Context.HighlightTextInPdfWithContext'
});
const EVENTOS_SAIDA = Object.freeze({ META: 'Edge.Context.OnGetDocumentMetaData', CORPO: 'Edge.Context.OnGetDocumentBody', BUSCAR: 'Edge.Context.OnFindTextOnPage', REALCAR: 'Edge.Context.OnHighlightTextOnPage' });
// page_context.mojom (70929): ErrorCode e DocumentType.
const ERRO = Object.freeze({ nenhum: 0, desconhecido: 1, semConsentimento: 2, bloqueado: 3, naoSuportado: 4, rede: 5, semTranscricao: 6, semAba: 7, semDocumento: 8, muitosPedidos: 9, urlInvalida: 10 });
const TIPO = Object.freeze({ indefinido: 0, web: 1, pdf: 2, googleDocs: 3, transcricao: 4, leitura: 5 });

// FindTextsResponse (page_context.mojom, 70929.js): valores lidos do JS.
const ERRO_BUSCA = Object.freeze({ sucesso: 0, recursoDesativado: 1, semAbaAtiva: 2, textosVazios: 3, textoVazio: 4, duplicados: 5, novoPedido: 6, navegadorMudou: 7, realceRecebido: 8 });
// FindFirstInstanceResult (edge_find_on_page.mojom): os nomes vêm de 76068.js, mas os números NÃO foram observados;
// a ordem abaixo é inferida da ordem dos casos no JS e da regra de que os enums observados começam em 0 [?].
const RESP_REALCE = Object.freeze({ sucesso: 0, recursoDesativado: 1, semAbaAtiva: 2, textoVazio: 3, naoEncontrado: 4, novoPedido: 5 });
const MAX_CONSULTAS = 10;
const MAX_TEXTO_BUSCA = 1024;

// 2026-11-21: padrão e teto seguem o teto central do ContextBroker (context/tipos.js), antes 200 mil / 1 milhão.
const MAX_CHARS_TETO = require('./context/tipos').LIMITES.maxCaracteres;
const MAX_CHARS_PADRAO = MAX_CHARS_TETO;
const LIMITE_PEDIDOS_POR_MIN = 30;
const TIMEOUT_MS = 120000;
const ORIGENS_PADRAO = Object.freeze(['https://copilot.cloud.microsoft', 'https://m365.cloud.microsoft']);

// Marcadores que tentam passar texto da página como instrução ao modelo (ponte do Edge também os sanitiza).
const RE_MARCADORES = /\[(?:system|assistant|user)\]\s*\(#[a-z_]+\)/gi;
const sanitizar = (t) => String(t == null ? '' : t).replace(RE_MARCADORES, '[removido]');
// Mesma normalização do JS do Copilot (70890.js): trim, limite de 1024, descarta vazios e duplicados, no máximo 10.
const textoBusca = (t) => (typeof t === 'string' ? t.trim().substring(0, MAX_TEXTO_BUSCA) : '');
function normalizarConsultas(consultas) {
  const vistos = new Set();
  return (Array.isArray(consultas) ? consultas : []).map(c => textoBusca(c && c.exactMatchText)).filter(t => t && !vistos.has(t) && vistos.add(t)).slice(0, MAX_CONSULTAS);
}
const inteiro = (v, padrao) => (Number.isFinite(v) ? Math.trunc(v) : padrao);

function origemDe(url) { try { const u = new URL(url); return u.protocol === 'https:' ? u.origin : ''; } catch { return ''; } }

function criarProtocolo({ provedor, origensPermitidas = ORIGENS_PADRAO, agora = Date.now, log = () => {}, timeoutMs = TIMEOUT_MS }) {
  const permitidas = new Set(origensPermitidas);
  let janela = []; // instantes dos últimos pedidos
  let geracaoBusca = 0, proximoMatch = 0, ultimaBusca = null; // última busca: só ela autoriza realce

  const comTimeout = (p) => { let t; return Promise.race([Promise.resolve(p), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), timeoutMs); })]).finally(() => clearTimeout(t)); };
  const registrar = (t) => { try { log('COPILOT_PROTOCOLO', t); } catch (_) {} }; // só nomes de evento e códigos, nunca conteúdo
  const origemOk = (origem) => permitidas.has(origem);

  function dentroDoLimite() {
    const t = agora();
    janela = janela.filter(x => t - x < 60000);
    if (janela.length >= LIMITE_PEDIDOS_POR_MIN) return false;
    janela.push(t);
    return true;
  }
  const corpoVazio = (erro, extra = {}) => ({ title: '', url: { url: '' }, data: '', errorCode: erro, documentType: TIPO.indefinido, ...extra });

  // Devolve a lista de envelopes de resposta para a página (vazia se o evento não é do escopo ou não tem resposta).
  async function tratar(mensagem, origem) {
    if (!origemOk(origem)) { registrar('Origem recusada'); return []; }
    if (!mensagem || typeof mensagem !== 'object' || typeof mensagem.eventName !== 'string') return [];
    const { eventName, requestId } = mensagem;
    if (!Object.values(EVENTOS_ENTRADA).includes(eventName)) return [];
    if (typeof requestId !== 'string' && typeof requestId !== 'number') return [];
    const args = mensagem.args && typeof mensagem.args === 'object' ? mensagem.args : {};
    if (!dentroDoLimite()) {
      registrar(eventName + ': limite de pedidos');
      if (eventName === EVENTOS_ENTRADA.CORPO) return [{ eventName: EVENTOS_SAIDA.CORPO, requestId, args: corpoVazio(ERRO.muitosPedidos) }];
      if (eventName === EVENTOS_ENTRADA.BUSCAR) return [buscaVazia(requestId, ERRO_BUSCA.recursoDesativado)];
      if (eventName === EVENTOS_ENTRADA.REALCAR) return [respostaRealce(requestId, RESP_REALCE.recursoDesativado)];
      return [];
    }
    try {
      switch (eventName) {
        case EVENTOS_ENTRADA.META: return [await meta(requestId, origem)];
        case EVENTOS_ENTRADA.CORPO: return [await corpo(requestId, args, origem)];
        case EVENTOS_ENTRADA.ABAS: return [await abas(requestId, args, origem)];
        case EVENTOS_ENTRADA.BUSCAR: return [await buscar(requestId, args, origem)];
        case EVENTOS_ENTRADA.REALCAR: return [await realcar(requestId, args)];
        default: registrar(eventName + ': ainda não implementado'); return [];
      }
    } catch (e) {
      registrar(eventName + ': falha (' + (e && e.message === 'timeout' ? 'timeout' : 'erro') + ')');
      if (eventName === EVENTOS_ENTRADA.CORPO) return [{ eventName: EVENTOS_SAIDA.CORPO, requestId, args: corpoVazio(e && e.message === 'timeout' ? ERRO.rede : ERRO.desconhecido) }];
      if (eventName === EVENTOS_ENTRADA.META) return [{ eventName: EVENTOS_SAIDA.META, requestId, args: corpoVazio(ERRO.desconhecido) }];
      if (eventName === EVENTOS_ENTRADA.BUSCAR) return [buscaVazia(requestId, ERRO_BUSCA.recursoDesativado)];
      if (eventName === EVENTOS_ENTRADA.REALCAR) return [respostaRealce(requestId, RESP_REALCE.recursoDesativado)];
      return [];
    }
  }

  async function meta(requestId, origem) {
    // Metadados também revelam título e URL: exigem o mesmo consentimento do corpo.
    const alvo = await comTimeout(provedor.abaAlvo({ tabId: -1, windowId: -1 }));
    if (!alvo) return { eventName: EVENTOS_SAIDA.META, requestId, args: corpoVazio(ERRO.semAba) };
    if (!(await comTimeout(provedor.consentir({ origem, alvo, finalidade: 'metadados' })))) return { eventName: EVENTOS_SAIDA.META, requestId, args: corpoVazio(ERRO.semConsentimento) };
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return { eventName: EVENTOS_SAIDA.META, requestId, args: corpoVazio(ERRO.semDocumento) };
    return { eventName: EVENTOS_SAIDA.META, requestId, args: { title: sanitizar(alvo.title), url: { url: String(alvo.url || '') }, errorCode: ERRO.nenhum, documentType: alvo.tipo === 'pdf' ? TIPO.pdf : TIPO.web } };
  }

  async function corpo(requestId, args, origem) {
    const saida = (a) => ({ eventName: EVENTOS_SAIDA.CORPO, requestId, args: a });
    const tabId = inteiro(args.tabId, -1) || -1;
    const windowId = inteiro(args.windowId, -1) || -1;
    const urlPedida = typeof args.url === 'string' ? args.url : (args.url && typeof args.url.url === 'string' ? args.url.url : '');
    if (urlPedida && !origemDe(urlPedida)) return saida(corpoVazio(ERRO.urlInvalida));
    const alvo = await comTimeout(provedor.abaAlvo({ tabId, windowId, url: urlPedida }));
    if (!alvo) return saida(corpoVazio(ERRO.semAba));
    if (alvo.bloqueada) return saida(corpoVazio(ERRO.bloqueado, { title: '' }));
    if (!(await comTimeout(provedor.consentir({ origem, alvo, finalidade: 'corpo' })))) return saida(corpoVazio(ERRO.semConsentimento));
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return saida(corpoVazio(ERRO.semDocumento));
    if (alvo.tipo === 'pdf') return saida(corpoVazio(ERRO.naoSuportado, { title: sanitizar(alvo.title), url: { url: String(alvo.url || '') }, documentType: TIPO.pdf })); // leitor próprio: etapa futura
    const max = Math.min(Math.max(inteiro(args.maxChars, MAX_CHARS_PADRAO), 1), MAX_CHARS_TETO);
    const seletor = typeof args.domSelector === 'string' ? args.domSelector.slice(0, 200) : '';
    const texto = await comTimeout(provedor.lerTexto(alvo, { seletor, max }));
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return saida(corpoVazio(ERRO.semDocumento));
    if (typeof texto !== 'string') return saida(corpoVazio(ERRO.naoSuportado, { title: sanitizar(alvo.title), url: { url: String(alvo.url || '') } }));
    return saida({ title: sanitizar(alvo.title), url: { url: String(alvo.url || '') }, data: sanitizar(texto).slice(0, max), errorCode: ERRO.nenhum, documentType: TIPO.web });
  }

  async function abas(requestId, args, origem) {
    const lista = await comTimeout(provedor.listarAbas(args));
    if (!(await comTimeout(provedor.consentir({ origem, alvo: null, finalidade: 'abas' })))) return { eventName: EVENTOS_ENTRADA.ABAS, requestId, args: [] };
    return { eventName: EVENTOS_ENTRADA.ABAS, requestId, args: (Array.isArray(lista) ? lista : []).slice(0, 100).map(a => ({ id: a.id, windowId: a.windowId, index: a.index, active: !!a.active, title: sanitizar(a.title), url: String(a.url || '') })) };
  }

  const buscaVazia = (requestId, codigo) => ({ eventName: EVENTOS_SAIDA.BUSCAR, requestId, args: { response: codigo, results: [] } });
  const respostaRealce = (requestId, codigo) => ({ eventName: EVENTOS_SAIDA.REALCAR, requestId, args: { response: codigo } });

  // Edge.Context.FindTextOnPage: args.queries [{exactMatchText}] -> {response, results:[{matchId, query}]}.
  // Só devolve consultas encontradas [?: o nativo pode listar também as não encontradas]; o texto da página não sai daqui.
  async function buscar(requestId, args, origem) {
    const textos = normalizarConsultas(args.queries);
    if (!textos.length) return buscaVazia(requestId, ERRO_BUSCA.textosVazios);
    ultimaBusca = null;
    const geracao = ++geracaoBusca;
    const alvo = await comTimeout(provedor.abaAlvo({ tabId: -1, windowId: -1 }));
    if (!alvo) return buscaVazia(requestId, ERRO_BUSCA.semAbaAtiva);
    // PDF, alvo bloqueado, provedor sem busca ou consentimento negado: o enum não tem código específico.
    if (alvo.bloqueada || alvo.tipo === 'pdf' || typeof provedor.buscarTextos !== 'function') return buscaVazia(requestId, ERRO_BUSCA.recursoDesativado);
    // A busca revela a presença de trechos da página: exige o mesmo consentimento do corpo.
    if (!(await comTimeout(provedor.consentir({ origem, alvo, finalidade: 'corpo' })))) return buscaVazia(requestId, ERRO_BUSCA.recursoDesativado);
    if (geracao !== geracaoBusca) return buscaVazia(requestId, ERRO_BUSCA.novoPedido);
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return buscaVazia(requestId, ERRO_BUSCA.navegadorMudou);
    const achados = await comTimeout(provedor.buscarTextos(alvo, textos));
    if (geracao !== geracaoBusca) return buscaVazia(requestId, ERRO_BUSCA.novoPedido);
    if (provedor.alvoAtual && !provedor.alvoAtual(alvo)) return buscaVazia(requestId, ERRO_BUSCA.navegadorMudou);
    if (!Array.isArray(achados)) return buscaVazia(requestId, ERRO_BUSCA.recursoDesativado);
    const itens = new Map();
    const results = textos.filter((_, i) => achados[i]).map(t => { const matchId = ++proximoMatch; itens.set(matchId, t); return { matchId, query: { exactMatchText: t } }; });
    ultimaBusca = { alvo, itens };
    return { eventName: EVENTOS_SAIDA.BUSCAR, requestId, args: { response: ERRO_BUSCA.sucesso, results } };
  }

  // Edge.Context.HighlightTextOnPage: args {matchId, query:{exactMatchText}} -> {response}.
  // Só realça resultado da última busca consentida, no mesmo documento; não lê nada novo da página.
  async function realcar(requestId, args) {
    const matchId = args.matchId;
    const texto = textoBusca(args.query && args.query.exactMatchText);
    if (!texto || !Number.isSafeInteger(matchId) || matchId < 0) return respostaRealce(requestId, RESP_REALCE.textoVazio);
    const busca = ultimaBusca;
    if (!busca || busca.itens.get(matchId) !== texto || typeof provedor.realcar !== 'function') return respostaRealce(requestId, RESP_REALCE.naoEncontrado);
    if (provedor.alvoAtual && !provedor.alvoAtual(busca.alvo)) return respostaRealce(requestId, RESP_REALCE.naoEncontrado);
    const ok = await comTimeout(provedor.realcar(busca.alvo, texto));
    return respostaRealce(requestId, ok === true ? RESP_REALCE.sucesso : RESP_REALCE.naoEncontrado);
  }

  return { tratar };
}

module.exports = { EVENTOS_ENTRADA, EVENTOS_SAIDA, ERRO, ERRO_BUSCA, RESP_REALCE, TIPO, ORIGENS_PADRAO, MAX_CHARS_PADRAO, MAX_CHARS_TETO, LIMITE_PEDIDOS_POR_MIN, sanitizar, origemDe, criarProtocolo };
