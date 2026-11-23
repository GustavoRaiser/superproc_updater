'use strict';
// Ponte do cr-host (superfície do Copilot sem iframe) com o SuperPROC. Camada: host (processo principal).
//
// No Edge 157 a página https://cr.m365copilotapp.svc.cloud.microsoft fala com a extensão componente
// `copilot-extension-bridge` (id ndcpkimcihhghdcddljkfmmjccdmcmof, recurso 27600 do resources.pak) por duas portas:
//   copilot-api    { requestId, api, args? }  ->  { requestId, ok:true, value } | { requestId, ok:false, error }
//                  { op:'subscribe'|'unsubscribe', eventApi }  ->  { op:'subscribe-ack'|'unsubscribe-ack', eventApi, ok, error? }
//                  eventos: { op:'event', eventApi, args }
//   copilot-bridge { eventName, requestId, args }  ->  { eventName, requestId, args } | { eventName, requestId, error }
// Os nomes de campos, enums e assinaturas abaixo vêm dos esquemas de `copilotBridgePrivate` embutidos na msedge.dll
// (prefs, pageContext, chat, windowContext). Ver v_base/docs/estudos/copilot-edge-157/verificacao-da-ponte.md.
//
// Aqui o papel do service worker e do C++ é feito por este módulo, sobre o ContextBroker:
//   - o estado de consentimento é lido do motor local (consentimento-edge.js); a página não consegue alterá-lo;
//   - sem consentimento aceito a página não recebe endereço, título nem texto de aba (só ids), e os pedidos de
//     conteúdo voltam com errorCode 'noConsent' / consentStatus 'denied', como no PageContextHandler do Edge;
//   - o conteúdo sai do ContextBroker (mundo isolado, só http(s), sem campos de formulário, endereço sem consulta);
//   - um documentId só vale para o documento que estava carregado quando foi emitido.
// Logs e diagnóstico: somente nomes de API e contagens. Nunca título, endereço, texto ou id de aba.
// Dependências injetadas para testar sem Electron.
const crypto = require('node:crypto');
const { CHAVE_CONSENTIMENTO } = require('./consentimento-edge');
const { sanitizar } = require('../copilot-protocolo-edge');
const { LIMITES: LIMITES_CONTEXTO } = require('../context/tipos');

// Id da extensão componente da ponte no Edge 157. É o id que a página do cr-host chamou em sessão real (2026-11-19) e
// aparece na msedge.dll junto de EdgeCopilotBridgeProcessObserver. O estudo inicial apontava elhekieabhbkpmcefcoobjddigjcaadp,
// que a página nunca chamou.
const ID_EXTENSAO = 'ndcpkimcihhghdcddljkfmmjccdmcmof';
const ORIGENS_CR_HOST = Object.freeze([
  'https://cr.m365copilotapp.svc.cloud.microsoft',
  'https://copilot.cloud.microsoft',
  'https://m365.cloud.microsoft'
]);
const PORTA_API = 'copilot-api';
const PORTA_LEGADA = 'copilot-bridge';
const CANAIS = Object.freeze({ abrir: 'copilot-cr-abrir', mensagem: 'copilot-cr-msg', fechar: 'copilot-cr-fechar', unico: 'copilot-cr-unico', nota: 'copilot-cr-nota', evento: 'copilot-cr-evento', instalar: 'copilot-cr-instalar', contexto: 'copilot-cr-contexto' });
// Notas que o preload pode enviar sobre o uso de chrome.runtime pela página (códigos fixos, sem dados).
// contexto:*: como a lista de abas chegou ao app (evento oficial com ouvinte, estado do app direto, ou sem destino).
const NOTAS = Object.freeze(['plugin:ja', 'plugin:instalado', 'plugin:nao-encontrado', 'plugin:falhou', 'preload', 'instalada', 'connect:ponte', 'connect:outro-id', 'connect:id-invalido', 'connect:sem-id', 'sendMessage:ponte', 'sendMessage:outro-id', 'sendMessage:id-invalido', 'sendMessage:sem-id',
  'contexto:ouvinte', 'contexto:loja', 'contexto:sem-destino', 'contexto:guardado', 'contexto:nao-guardado', 'contexto:sobrescrito']);
// Forma de uma mensagem que a ponte não soube atender, para estudo do protocolo: nomes das chaves e o valor dos campos
// que carregam nomes de protocolo (api, eventName, type...). Só passam nomes curtos e sem espaço; o resto vira <omitido>.
// Nunca valores de outros campos.
const RE_ID_EXTENSAO = /^[a-p]{32}$/;
const RE_NOME_SEGURO = /^[A-Za-z0-9._:\/-]{1,80}$/;
const CAMPOS_DE_NOME = ['api', 'eventName', 'type', 'op', 'method', 'name', 'action', 'command', 'messageType', 'kind', 'event'];
function formaDe(m) {
  if (m === null) return 'null';
  if (Array.isArray(m)) return 'array(' + m.length + ')';
  if (typeof m !== 'object') return typeof m;
  const chaves = Object.keys(m).slice(0, 12).map((k) => (RE_NOME_SEGURO.test(k) ? k : '<omitido>'));
  const nomes = CAMPOS_DE_NOME.filter((c) => typeof m[c] === 'string').map((c) => c + '=' + (RE_NOME_SEGURO.test(m[c]) ? m[c] : '<omitido>'));
  return 'chaves=' + chaves.join(',') + (nomes.length ? ' ' + nomes.join(' ') : '');
}
const JANELA = 1; // o SuperPROC tem uma janela de abas
const MAX_JSON = 256 * 1024;

const EV = Object.freeze({
  pref: 'chrome.copilotBridgePrivate.prefs.onPrefChanged',
  consentimentoFechado: 'chrome.copilotBridgePrivate.chat.onConsentDialogClosed',
  metadados: 'chrome.copilotBridgePrivate.pageContext.onGetDocumentMetaData',
  corpo: 'chrome.copilotBridgePrivate.pageContext.onGetDocumentBody',
  abaAtivada: 'chrome.tabs.onActivated',
  abaAtualizada: 'chrome.tabs.onUpdated',
  abaRemovida: 'chrome.tabs.onRemoved',
  abaCriada: 'chrome.tabs.onCreated'
});
const EVENTOS_DE_ABA = new Set([EV.abaAtivada, EV.abaAtualizada, EV.abaRemovida, EV.abaCriada]);
// Eventos do canal legado (copilot-bridge) atendidos aqui.
const LEGADO = Object.freeze({
  pref: 'Edge.Context.Pref', aoPref: 'Edge.Context.OnPref',
  metadados: 'Edge.Context.GetDocumentMetaData', aoMetadados: 'Edge.Context.OnGetDocumentMetaData',
  corpo: 'Edge.Context.GetDocumentBody', aoCorpo: 'Edge.Context.OnGetDocumentBody',
  pronto: 'Edge.Chat.Ready',
  naa: 'Edge.Auth.NaaRequest', aoNaa: 'Edge.Auth.NaaResponse'
});

const RE_API = /^chrome\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+){1,5}$/;
const RE_EVENTO = /^chrome\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+){0,4}\.on[A-Z][A-Za-z0-9]*$/;
const RE_NOME_LEGADO = /^[A-Za-z][A-Za-z0-9.]{0,79}$/;
// Espaços de nomes que a extensão do Edge expõe. Fora deles a resposta é "api not allowed", como no despachante original.
const ESPACOS = ['chrome.copilotBridgePrivate.', 'chrome.tabs.', 'chrome.webNavigation.', 'chrome.metricsPrivate.',
  'chrome.edgeCopilotToolActionsPrivate.', 'chrome.edgeCopilotBrowseConsentPrivate.', 'chrome.edgeCopilotSkillRecordingPrivate.', 'chrome.edgeDimePrivate.'];
// Telemetria destinada ao Edge: aceita e descartada (não há para onde enviar).
const SEM_EFEITO = [/^chrome\.metricsPrivate\.record[A-Za-z]+$/, /^chrome\.copilotBridgePrivate\.telemetry\.(?:record[A-Za-z]+|updateTelemetryConfig)$/];

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const recorte = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
const linha = (v) => sanitizar(v).replace(/\s+/g, ' ').trim();

// Autenticação aninhada do MSAL (Nested App Auth). No Edge, o navegador entrega por este canal tokens da conta do
// perfil (esquema copilotBridgePrivate.auth: BridgeRequestEnvelope -> BridgeResponseEnvelope). O SuperPROC não é
// corretor de identidade e não emite tokens: responde, no formato do próprio protocolo, que o recurso não existe
// aqui, para a página seguir com o login Web comum. Sem essa resposta a página fica sem retorno do pedido de token
// e repete a tentativa de login. Nada do pedido (cliente, escopos) é guardado ou registrado.
const RE_ID_NAA = /^[A-Za-z0-9._:-]{1,100}$/;
const RE_METODO_NAA = /^[A-Za-z]{1,40}$/;
// Um clientId do Entra é um GUID público da aplicação (aparece em toda URL de login), não um segredo. Escopos e
// autoridade também são públicos. Nunca entra aqui token, código, estado, nonce, correlationId nem claims.
const RE_GUID_NAA = /^[0-9a-fA-F-]{8,40}$/;
const RE_ESCOPO = /^[A-Za-z0-9._:/-]{1,120}$/;
function detalharNaa(pedido) {
  const tp = ehObjeto(pedido) && ehObjeto(pedido.tokenParams) ? pedido.tokenParams : {};
  const metodo = ehObjeto(pedido) && typeof pedido.method === 'string' && RE_METODO_NAA.test(pedido.method) ? pedido.method : '<omitido>';
  const clientId = typeof tp.clientId === 'string' && RE_GUID_NAA.test(tp.clientId) ? tp.clientId : (tp.clientId ? '<omitido>' : null);
  const escopos = typeof tp.scope === 'string' ? tp.scope.split(/\s+/).filter((e) => e && RE_ESCOPO.test(e)).slice(0, 12) : [];
  let autoridade = null;
  try { if (typeof tp.authority === 'string') autoridade = new URL(tp.authority).host; } catch (_) { autoridade = '<omitido>'; }
  return { metodo, clientId, escopos, autoridade };
}
function respostaNaa(pedido) {
  if (!ehObjeto(pedido) || typeof pedido.requestId !== 'string' || !RE_ID_NAA.test(pedido.requestId)) return null;
  return {
    messageType: 'NestedAppAuthResponse', requestId: pedido.requestId, success: false,
    error: { status: 'NESTED_APP_AUTH_UNAVAILABLE', description: 'Nested app authentication is not available in this browser.' }
  };
}

// Texto entregue em GetDocumentResult.data: um cabeçalho curto com o que o SuperPROC sabe da aba e o texto extraído.
function comporCorpo(snap, max) {
  const cab = [];
  if (snap.processNumber) cab.push('Processo: ' + linha(snap.processNumber));
  if (snap.eproc) {
    if (snap.eproc.currentPage) cab.push('Página do eproc: ' + linha(snap.eproc.currentPage));
    if (snap.eproc.openedDocument) cab.push('Documento aberto: ' + (snap.eproc.openedDocument.event ? 'evento ' + linha(snap.eproc.openedDocument.event) : linha(snap.eproc.openedDocument.action)));
  }
  const selecionado = snap.content && snap.content.selectedText;
  if (selecionado) cab.push('Texto selecionado pelo usuário: ' + sanitizar(selecionado).slice(0, 2000));
  let texto;
  if (snap.pdf) {
    texto = snap.pdf.requiresOcr ? '[PDF sem camada de texto: conteúdo não extraído]'
      : snap.pdf.pages.map((p) => '[Página ' + p.page + ']\n' + sanitizar(p.text)).join('\n\n');
  } else texto = sanitizar(snap.content && snap.content.visibleText);
  // Blocos extras depois do texto da página: quadros internos de mesma origem (ex.: o documento aberto na árvore do eproc) e
  // PDFs embutidos (visualizador). O texto da página cede espaço a eles quando o total passa do limite, porque o conteúdo
  // do documento costuma valer mais que a lista que o cerca.
  const blocos = [];
  for (const q of (snap.content && Array.isArray(snap.content.frames) ? snap.content.frames : [])) {
    if (!q || !q.text) continue;
    blocos.push('[Quadro interno da página' + (q.title ? ': ' + linha(q.title) : '') + ']\n' + sanitizar(q.text) + (q.truncated ? '\n[texto do quadro truncado]' : ''));
  }
  for (const [i, p] of (Array.isArray(snap.embeddedPdfs) ? snap.embeddedPdfs : []).entries()) {
    const rotulo = '[PDF incorporado na página ' + (i + 1) + (p.totalPages ? ' · ' + p.totalPages + ' páginas' : '') + ']';
    if (p.error) blocos.push(rotulo + '\n[PDF presente, mas o texto não pôde ser extraído]');
    else if (p.requiresOcr) blocos.push(rotulo + '\n[PDF sem camada de texto: conteúdo não extraído]');
    else blocos.push(rotulo + '\n' + p.pages.map((x) => '[Página ' + x.page + ']\n' + sanitizar(x.text)).join('\n\n'));
  }
  if (Array.isArray(snap.warnings) && snap.warnings.includes('PAGE_REQUIRES_LOGIN')) cab.push('Aviso: esta página do painel do SuperPROC pediu login; o texto abaixo pode ser só a tela de entrada, não o conteúdo.');
  if (!snap.pdf && Array.isArray(snap.warnings) && snap.warnings.some((w) => /^PDF_(?:NOT_READABLE|FETCH_FAILED|PARSE_FAILED)$/.test(w)) && !blocos.length) cab.push('Aviso: a aba contém um PDF, mas o texto não pôde ser extraído.');
  const cabecalho = cab.length ? cab.join('\n') + '\n\n' : '';
  if (!blocos.length) return (cabecalho + texto).slice(0, max);
  const extras = blocos.join('\n\n');
  const orcamento = Math.max(max - cabecalho.length, 0);
  const cabe = texto.length + 2 + extras.length <= orcamento;
  const pagina = texto.slice(0, cabe ? texto.length : Math.max(orcamento - extras.length - 2, Math.floor(orcamento * 0.3)));
  return (cabecalho + (pagina ? pagina + '\n\n' : '') + extras).slice(0, max);
}

function criarPonteCr({ broker, consentimento: consentimentoReal, mapa, agora = Date.now, uuid = () => crypto.randomUUID(), log = () => {},
  intervaloAbasMs = 500, definirIntervalo = setInterval, limparIntervalo = clearInterval, limites = {}, aoRegistrar = null, acoes = {}, ferramentas = {}, iaLocal = {}, politicasIA = null, ignorarMaxCharsDaPagina = () => false }) {
  if (!broker || typeof broker.listTabs !== 'function' || typeof broker.readTab !== 'function') throw Error('ContextBroker inválido');
  if (!consentimentoReal || typeof consentimentoReal.estado !== 'function') throw Error('Motor de consentimento inválido');
  // Políticas de IA (politicas-ia.js): lidas a cada uso; sem provedor valem os padrões (tudo ligado, listas vazias).
  const POL = require('./politicas-ia');
  const valoresPol = () => { try { return POL.resolver(politicasIA && typeof politicasIA.valores === 'function' ? politicasIA.valores() : null); } catch (_) { return POL.padroes(); } };
  const pol = (nome) => valoresPol()[nome];
  // O consentimento que a ponte usa para dar conteúdo ao Copilot soma o consentimento local com as políticas mestras: CopilotMode (o
  // interruptor geral na 157/158), EdgeCopilotEnabled (legada), CopilotPageContext e CopilotPageContextEnabled.
  // O estado 0/1/2 informado em browser.underside_chat_consent continua sendo o do consentimento local.
  const POLITICAS_MESTRAS = ['CopilotMode', 'EdgeCopilotEnabled', 'CopilotPageContext', 'CopilotPageContextEnabled'];
  const consentimento = {
    estado: () => consentimentoReal.estado(),
    aceito: () => { if (!consentimentoReal.aceito()) return false; const v = valoresPol(); return POLITICAS_MESTRAS.every((n) => v[n] === true); },
    pedir: (...a) => consentimentoReal.pedir(...a),
    cartaoAberto: (...a) => consentimentoReal.cartaoAberto(...a),
    aoFechar: (...a) => consentimentoReal.aoFechar(...a),
    aoMudar: (...a) => consentimentoReal.aoMudar(...a),
    cancelarPendentes: (...a) => consentimentoReal.cancelarPendentes(...a)
  };
  if (!mapa || typeof mapa.numeroDe !== 'function') throw Error('Mapa de abas inválido');
  const L = { maxPortas: 8, maxAssinaturas: 64, leiturasPorMinuto: 30, maxCaracteres: LIMITES_CONTEXTO.maxCaracteres, maxTitulo: 300, maxApisNoDiagnostico: 120, esperaAposNegar: 10000, maxAbasNoContexto: 50, ...limites };
  const reg = (m) => { try { log('COPILOT_PONTE', m); } catch (_) { /* log nunca derruba a ponte */ } };

  let documentoChamador = uuid(); // faz o papel de port.sender.documentId da página do Copilot
  let geracao = 0;                // muda quando a página do Copilot é trocada
  let pediuPorContaPropria = false;
  let negadoEm = -Infinity;
  const portas = new Map();       // portaId -> { nome, enviar, assinaturas:Set, prefsObservadas:Set }
  const chamadas = new Map();     // nome de API -> { ok, erro }
  const metodosNaa = new Map();   // método de autenticação aninhada -> vezes
  const naaDetalhes = new Map();  // método -> { clientIds:Set, escopos:Set, autoridades:Set } (identificadores públicos)
  const notas = new Map();        // nota do preload -> vezes
  const extensoes = new Map();    // id de extensão usado pela página -> { portas, chamadasUnicas }
  const nomesDePorta = new Map(); // nome de porta pedido -> vezes
  const formas = new Map();       // 'onde | forma' de mensagem não atendida -> vezes
  const prefsPedidas = new Map(); // nome de preferência pedido pela página -> vezes (nomes de protocolo, não dados)
  const somar = (mapa, chave, teto) => { if (!mapa.has(chave) && mapa.size >= teto) return; mapa.set(chave, (mapa.get(chave) || 0) + 1); avisar(); };
  // Funil multi-aba (Tentativa 2): só contagens com códigos fixos, nunca título, URL, texto ou identificador de aba.
  // contexto:* = lista edgeTab publicada ao app; leitura:ativa / leitura:segundo-plano = documentos lidos por categoria;
  // sem-aba / frames:aba-ausente / ativa:nao-resolvida = pedidos que não acharam a aba. O erro "no requested tabs remained"
  // nasce dentro do app do Copilot e não é observável por aqui.
  const FUNIL = new Set(['contexto:ids-digitos-max', 'consulta:ids-digitos-max', 'contexto:sem-endereco-max', 'contexto:publicacoes', 'contexto:itens-ultimo', 'contexto:itens-max', 'contexto:vazio-sem-consentimento',
    'leitura:ativa', 'leitura:segundo-plano', 'leitura:maxchars-pedido-max', 'leitura:maxchars-pedido-ultimo', 'leitura:caracteres-max', 'leitura:caracteres-ultimo', 'leitura:truncadas', 'leitura:sem-aba', 'frames:aba-ausente', 'ativa:nao-resolvida']);
  const funil = new Map();
  const contarFunil = (codigo, valor) => {
    if (!FUNIL.has(codigo)) return;
    if (valor === undefined) funil.set(codigo, (funil.get(codigo) || 0) + 1);
    else if (Number.isSafeInteger(valor) && valor >= 0) funil.set(codigo, codigo.endsWith('-max') ? Math.max(funil.get(codigo) || 0, valor) : valor);
    avisar();
  };
  const registrarExtensao = (id, campo) => {
    const chave = typeof id === 'string' && RE_ID_EXTENSAO.test(id) ? id : '<omitido>';
    if (!extensoes.has(chave)) { if (extensoes.size >= 8) return; extensoes.set(chave, { portas: 0, chamadasUnicas: 0 }); }
    extensoes.get(chave)[campo]++;
    avisar();
  };
  const anotarForma = (onde, mensagem) => somar(formas, onde + ' | ' + formaDe(mensagem), 40);
  const avisar = () => { if (typeof aoRegistrar === 'function') { try { aoRegistrar(); } catch (_) { /* diagnóstico nunca derruba a ponte */ } } };
  const leituras = [];
  let vigia = null;
  let retrato = null;             // id inteiro -> { ativa, url, titulo }
  let aberturas = 0;              // portas abertas desde o início (as páginas trocadas zeram a lista, não esta conta)
  let paginas = 0;                // vezes em que a página do Copilot foi trocada

  // ---- ferramentas nativas do Copilot Chat (sem Cowork): busca/realce, histórico, link externo, MCP local ---------------------
  // Tudo opt-in e injetado (`ferramentas`): sem o provedor correspondente a API responde vazio/recusa, e o consentimento de
  // conteúdo continua sendo o portão de tudo que lê a página. Contratos lidos no service worker da ponte (resources.pak#27600):
  //  - pageContext.findTextsOnPage(queries[{exactMatchText}]) -> { response, results:[{matchId, query}] }; highlightTextOnPage
  //    ({matchId, query}) -> { response }; os códigos seguem copilot-protocolo-edge.js (ERRO_BUSCA/RESP_REALCE; números inferidos).
  //  - chat.searchHistory({queries, states, maxResults, startTime, endTime}) -> { results:[{title,url,faviconUrl,state,lastVisitTimeMicros}] }
  //    (microssegundos desde 1601 como texto decimal).
  //  - chat.openLinkInExternalBrowser(url): o navegador valida o esquema; aqui só http(s) sem credenciais.
  //  - Edge.Mcp.GetSupportedMcpServers / CallToolOnServer / ReadMcpResourceFromServer na porta legada copilot-bridge:
  //    { servers } e { data: <JSON em texto> }. Cada servidor segue o tipo McpServerInfo lido no esquema copilotBridgePrivate.mcp embutido
  //    na msedge.dll 158.0.4370.33: { serverId, name?, version?, description?, tools: [{ name, description, inputSchema, outputSchema?,
  //    annotations? }] } (até 2026-11-21 a ponte devolvia "id", por hipótese; o campo certo é "serverId").
  //  - toolServers.getEnablement(documentId, serverRef) -> { enabled, reason }, com reason em enabled | userNotEnabled | rolloutDisabled |
  //    blockedByTenantPolicy | policyUnavailable | unavailableInPrivateOrGuest | unknownToolServer | unavailable (esquema da DLL 158).
  //    HIPÓTESE: serverRef é o serverId; a rota na extensão-ponte da 158 não foi lida (a da 157 não tem toolServers).
  const F = ferramentas || {};
  const semDocumento = (args) => (typeof args[0] === 'string' && args.length > 1 ? args.slice(1) : args);
  const permitida = (p) => { try { return !!(p && typeof p.permitido === 'function' ? p.permitido() : p); } catch (_) { return false; } };
  const EPOCA_WINDOWS_MS = 11644473600000;
  const microsWindows = (ms) => String(BigInt(Math.trunc(ms) + EPOCA_WINDOWS_MS) * 1000n);
  const desdeMicros = (txt) => { try { return Number(BigInt(String(txt)) / 1000n) - EPOCA_WINDOWS_MS; } catch (_) { return null; } };
  const contarFerramenta = (nome) => somar(usoFerramentas, nome, 40);
  const usoFerramentas = new Map();
  const ABA_ALVO = async () => { const l = await listarAbas(); const a = l.find((x) => x.active); return a ? { idInterno: a.id, numero: mapa.numeroDe(a.id) } : null; };
  let ultimaBuscaPagina = null; // { idInterno, itens: Map(matchId -> texto) }: só ela autoriza realce
  let proximoMatchPagina = 0;
  const textosDeBusca = (consultas) => {
    const vistos = new Set();
    return (Array.isArray(consultas) ? consultas : []).map((c) => (ehObjeto(c) && typeof c.exactMatchText === 'string' ? c.exactMatchText.trim().slice(0, 1024) : '')).filter((x) => x && !vistos.has(x) && vistos.add(x)).slice(0, 10);
  };
  async function buscarNaPagina([consultas]) {
    contarFerramenta('pageContext.findTextsOnPage');
    const vazio = (codigo) => ({ response: codigo, results: [] });
    const textos = textosDeBusca(consultas);
    if (!textos.length) return vazio(3);
    ultimaBuscaPagina = null;
    if (!consentimento.aceito() || typeof broker.findInTabs !== 'function') return vazio(1);
    const alvo = await ABA_ALVO();
    if (!alvo) return vazio(2);
    const results = [];
    const itens = new Map();
    for (const texto of textos) {
      let r;
      try { r = await broker.findInTabs(texto, [alvo.idInterno]); } catch (_) { return vazio(1); }
      if (r && Array.isArray(r.results) && r.results.length) { const matchId = ++proximoMatchPagina; itens.set(matchId, texto); results.push({ matchId, query: { exactMatchText: texto } }); }
    }
    ultimaBuscaPagina = { idInterno: alvo.idInterno, itens };
    return { response: 0, results };
  }
  async function realcarNaPagina(args) {
    contarFerramenta('pageContext.highlightTextOnPage');
    const [pedido] = semDocumento(args);
    const matchId = ehObjeto(pedido) ? pedido.matchId : undefined;
    const texto = ehObjeto(pedido) && ehObjeto(pedido.query) && typeof pedido.query.exactMatchText === 'string' ? pedido.query.exactMatchText.trim().slice(0, 1024) : '';
    if (!texto || !Number.isSafeInteger(matchId) || matchId < 0) return { response: 3 };
    const busca = ultimaBuscaPagina;
    if (!consentimento.aceito() || !busca || busca.itens.get(matchId) !== texto || !F.paginas || typeof F.paginas.realcar !== 'function') return { response: 4 };
    const alvo = await ABA_ALVO();
    if (!alvo || alvo.idInterno !== busca.idInterno) return { response: 4 };
    let ok = false;
    try { ok = (await F.paginas.realcar(alvo.idInterno, texto)) === true; } catch (_) { ok = false; }
    return { response: ok ? 0 : 4 };
  }
  async function limparRealce() {
    contarFerramenta('pageContext.clearAllHighlightTextInPdf');
    ultimaBuscaPagina = null;
    const alvo = await ABA_ALVO();
    if (alvo && F.paginas && typeof F.paginas.limpar === 'function') { try { await F.paginas.limpar(alvo.idInterno); } catch (_) { /* sem realce para limpar */ } }
  }
  async function buscarHistorico(args) {
    contarFerramenta('chat.searchHistory');
    const [pedido] = semDocumento(args);
    const vazio = { results: [] };
    if (!consentimento.aceito() || pol('EdgeHistoryAISearchEnabled') !== true || pol('ShareBrowsingHistoryWithCopilotSearchAllowed') !== true || !F.historico || !permitida(F.historico) || typeof F.historico.listar !== 'function') return vazio;
    const p = ehObjeto(pedido) ? pedido : {};
    const consultas = (Array.isArray(p.queries) ? p.queries : []).filter((q) => typeof q === 'string' && q.trim()).map((q) => q.trim().toLowerCase().slice(0, 200)).slice(0, 10);
    const maximo = Math.min(Number.isSafeInteger(p.maxResults) && p.maxResults > 0 ? p.maxResults : 50, 50);
    const de = p.startTime !== undefined ? desdeMicros(p.startTime) : null;
    const ate = p.endTime !== undefined ? desdeMicros(p.endTime) : null;
    let itens;
    try { itens = await F.historico.listar(); } catch (_) { return vazio; }
    const saida = [];
    for (const it of Array.isArray(itens) ? itens : []) {
      if (!ehObjeto(it) || typeof it.url !== 'string' || !Number.isFinite(it.timestamp)) continue;
      if (!/^https?:\/\//i.test(it.url)) continue; // histórico só com endereços web (nada de file:, about: etc.)
      const url = enderecoLimpo(it.url);
      if (!url) continue;
      const titulo = recorte(linha(it.title), L.maxTitulo);
      const base = (titulo + ' ' + url).toLowerCase();
      if (consultas.length && !consultas.some((q) => base.includes(q))) continue;
      if ((de !== null && it.timestamp < de) || (ate !== null && it.timestamp > ate)) continue;
      saida.push({ title: titulo, url, faviconUrl: '', lastVisitTimeMicros: microsWindows(it.timestamp) });
      if (saida.length >= maximo) break;
    }
    return { results: saida };
  }
  async function abrirLinkExterno(args) {
    contarFerramenta('chat.openLinkInExternalBrowser');
    const url = args.length > 1 ? args[1] : args[0];
    if (!consentimento.aceito() || !F.externo || !permitida(F.externo) || typeof F.externo.abrir !== 'function') return undefined;
    let u;
    try { u = new URL(String(url)); } catch (_) { return undefined; }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.href.length > 2048) return undefined;
    try { await F.externo.abrir(u.href); } catch (_) { /* o sistema pode recusar */ }
    return undefined;
  }
  // Captura de tela da aba ativa: Edge.Chat.Screenshot -> Edge.Chat.OnGetScreenshot { data: <imagem em base64> } (service worker do Edge, porta legada).
  // O argumento ScreenshotRange do Edge (valores não observados) é ignorado: sai sempre a área visível da aba. HIPÓTESE: o app espera PNG/JPEG em base64 puro.
  const MAX_CAPTURA_BASE64 = 12 * 1024 * 1024;
  function tratarCaptura(porta, eventName, requestId) {
    contarFerramenta(eventName);
    const falha = (m) => { contar(eventName, false); postar(porta, { eventName, requestId, error: m }); };
    if (!consentimento.aceito() || !F.captura || !permitida(F.captura) || typeof F.captura.tirar !== 'function') { falha('screenshot not available'); return; }
    const marca = geracao;
    Promise.resolve().then(async () => {
      const alvo = await ABA_ALVO();
      if (!alvo) return null;
      return F.captura.tirar(alvo.idInterno);
    }).catch(() => null).then((img) => {
      if (marca !== geracao) return;
      if (typeof img !== 'string' || !img || img.length > MAX_CAPTURA_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(img.slice(0, 64))) { falha('screenshot failed'); return; }
      contar(eventName, true);
      postar(porta, { eventName: 'Edge.Chat.OnGetScreenshot', requestId, args: { data: img } });
    });
  }
  // Realce em PDF com contexto: o formato de cada item de highlightParams NÃO foi observado; melhor esforço: pega o primeiro texto
  // (exactMatchText, text, query ou highlightText) e realça pelo mecanismo da página (findInPage; no leitor pdf.js a camada de texto é DOM).
  async function realcarPdfComContexto(args) {
    contarFerramenta('pageContext.highlightTextInPdfWithContext');
    if (!consentimento.aceito() || !F.paginas || typeof F.paginas.realcar !== 'function') return undefined;
    const [lista] = semDocumento(args);
    const itens = Array.isArray(lista) ? lista : (ehObjeto(lista) && Array.isArray(lista.highlightParams) ? lista.highlightParams : []);
    const texto = itens.map((p) => (ehObjeto(p) ? [p.exactMatchText, p.text, p.query, p.highlightText].find((v) => typeof v === 'string' && v.trim()) : null)).find(Boolean);
    if (!texto) return undefined;
    const alvo = await ABA_ALVO();
    if (alvo) { try { await F.paginas.realcar(alvo.idInterno, texto.trim().slice(0, 1024)); } catch (_) { /* sem realce */ } }
    return undefined;
  }
  const SERVIDOR_MCP = 'superproc-admin';
  const mcpLigado = () => !!(F.admin && permitida(F.mcp));
  function servidoresMcp() {
    if (!mcpLigado()) return [];
    // annotations no vocabulário do MCP: leitura não altera nada; destrutiva apaga/fecha (e sempre pede confirmação à pessoa).
    const ferramentasAtivas = F.admin.catalogo().filter((x) => x.annotations && x.annotations.enabled).map((x) => ({ name: x.name, description: x.description, inputSchema: x.inputSchema,
      annotations: { readOnlyHint: x.annotations.category === 'leitura', destructiveHint: x.annotations.category === 'destrutiva' } }));
    return ferramentasAtivas.length ? [{ serverId: SERVIDOR_MCP, name: 'SuperPROC', version: '1.0.0', description: 'Administração do navegador SuperPROC (abas, histórico, acesso rápido).', tools: ferramentasAtivas }] : [];
  }
  // toolServers.getEnablement: o servidor do SuperPROC está habilitado quando a pessoa ligou a chave mcp; qualquer outro é desconhecido.
  function habilitacaoDoServidor(args) {
    contarFerramenta('toolServers.getEnablement');
    const ref = args.length > 1 ? args[1] : args[0];
    if (ref !== SERVIDOR_MCP) return { enabled: false, reason: 'unknownToolServer' };
    return servidoresMcp().length ? { enabled: true, reason: 'enabled' } : { enabled: false, reason: 'userNotEnabled' };
  }
  function tratarMcp(porta, eventName, requestId, args) {
    contarFerramenta(eventName);
    const erroMcp = (m) => postar(porta, { eventName, requestId, error: m });
    if (eventName === 'Edge.Mcp.GetSupportedMcpServers') { contar(eventName, true); postar(porta, { eventName, requestId, args: { servers: servidoresMcp() } }); return; }
    if (!mcpLigado() || args.serverId !== SERVIDOR_MCP) { contar(eventName, false); erroMcp('mcp server not available'); return; }
    if (eventName === 'Edge.Mcp.ReadMcpResourceFromServer') { contar(eventName, false); erroMcp('resource not found'); return; }
    // CallToolOnServer: args.args chega como texto JSON (até 64 KiB) ou objeto
    let argumentos = {};
    if (typeof args.args === 'string') { if (args.args.length > 65536) { contar(eventName, false); erroMcp('args too large'); return; } try { argumentos = args.args ? JSON.parse(args.args) : {}; } catch (_) { contar(eventName, false); erroMcp('args is not valid JSON'); return; } }
    else if (ehObjeto(args.args)) argumentos = args.args;
    if (!ehObjeto(argumentos) || typeof args.toolName !== 'string') { contar(eventName, false); erroMcp('invalid arguments'); return; }
    const marca = geracao;
    Promise.resolve().then(() => F.admin.chamar(args.toolName, argumentos)).catch(() => ({ ok: false, code: 'FAILED' }))
      .then((r) => { if (marca !== geracao) return; contar(eventName, !!(r && r.ok)); postar(porta, { eventName, requestId, args: { data: JSON.stringify(r) } }); });
  }

  // ---- "Browse with Copilot": sonda de ações (opt-in, nada é executado) ------------------------------------------------
  // O Copilot só pede ações no navegador se a elegibilidade for "Accepted" (ou "Disabled"). No modo 'sonda' (ligado pela
  // pessoa: --copilot-acoes=sonda ou o arquivo copilot-acoes.sonda no perfil) a ponte anuncia "Accepted" e atende
  // handleToolAction SEM executar nada: reservas de aba (Lock/Release/Show/AllowActionForUrl/StopAction) são só reconhecidas,
  // e toda ação (clique, digitação, rolagem, navegação...) é recusada com unsupported-action. Serve para ver, no diagnóstico,
  // quais ações o app pede de fato. Só NOMES de protocolo são guardados (evento, ação, nomes dos parâmetros), nunca valores,
  // endereços, textos nem identificadores de aba.
  const modoAcoes = () => { try { return acoes && typeof acoes.modo === 'function' && acoes.modo() === 'sonda' ? 'sonda' : 'desligado'; } catch (_) { return 'desligado'; } };
  const RE_NOME_ACAO = /^[A-Za-z0-9_.:-]{1,60}$/;
  const nomeAcao = (v) => (typeof v === 'string' && RE_NOME_ACAO.test(v) ? v : '<omitido>');
  const acoesPedidas = new Map();  // 'evento | acao | param,param' -> vezes
  const elegibilidadeConsultada = { vezes: 0 };
  // Modo agêntico (controle "Permitir que o Copilot use seu navegador", 10164): com a chave agentico ligada a ponte anuncia Accepted e executa,
  // pelo AdminBroker (mesmas políticas e confirmações), SÓ as ações cujo pedido o app monta e conhecemos: edge_navigate_to, edge_go_back_forward
  // e edge_scroll_page. As respostas { ok, ... } são HIPÓTESE (o app só valida requestId/args). Qualquer outra ação segue recusada.
  const agenticoLigado = () => !!(F.agentico && permitida(F.agentico) && F.admin) && pol('AllowBrowsingWithCopilot') === true && pol('CopilotCoworkToolActionsEnabled') === true;
  // Sites: bloqueio ganha; lista de permissão preenchida exige casar. Vale para o endereço pedido e para o da aba alvo (BrowsingWithCopilot* e CopilotBrowserUse*).
  const sitesDasAcoes = () => { const v = valoresPol(); return { permitidos: [...v.BrowsingWithCopilotAllowList, ...v.CopilotBrowserUseAllowList], bloqueados: [...v.BrowsingWithCopilotBlockList, ...v.CopilotBrowserUseBlockList] }; };
  const siteDaAbaPermitido = async (idInterno) => { const a = (await listarAbas()).find((x) => x.id === idInterno); return !!a && POL.enderecoPermitido(a.url, sitesDasAcoes()); };
  const acoesLigadas = () => modoAcoes() === 'sonda' || agenticoLigado();
  const elegibilidade = () => { elegibilidadeConsultada.vezes++; avisar(); return { state: acoesLigadas() ? 'Accepted' : 'NotAvailable' }; };
  const ACOES_EXECUTADAS = Object.freeze({ edge_navigate_to: 1, edge_go_back_forward: 1, edge_scroll_page: 1 });
  async function executarAcaoAgentica(nome, parametros, tabIdPadrao) {
    const p = ehObjeto(parametros) ? parametros : {};
    const idDe = (n) => { const i = Number.isSafeInteger(n) ? mapa.internoDe(n) : null; return i || null; };
    let r;
    if (nome === 'edge_navigate_to') {
      if (typeof p.url !== 'string' || !/^https:\/\//i.test(p.url)) return { ok: false, code: 'INVALID_ARGS' };
      if (!POL.enderecoPermitido(p.url, sitesDasAcoes())) return { ok: false, code: 'SITE_BLOCKED' };
      r = await F.admin.chamar('superproc_open_tab', { url: p.url });
    } else if (nome === 'edge_go_back_forward') {
      const id = idDe(p.tabId === undefined ? tabIdPadrao : p.tabId);
      if (!id || (p.direction !== 'back' && p.direction !== 'forward')) return { ok: false, code: id ? 'INVALID_ARGS' : 'NOT_FOUND' };
      if (!(await siteDaAbaPermitido(id))) return { ok: false, code: 'SITE_BLOCKED' };
      r = await F.admin.chamar(p.direction === 'back' ? 'superproc_go_back' : 'superproc_go_forward', { tabId: id });
    } else {
      const id = idDe(p.tabId === undefined ? tabIdPadrao : p.tabId);
      if (!id || typeof p.position !== 'string') return { ok: false, code: id ? 'INVALID_ARGS' : 'NOT_FOUND' };
      if (!(await siteDaAbaPermitido(id))) return { ok: false, code: 'SITE_BLOCKED' };
      r = await F.admin.chamar('superproc_scroll_tab', { tabId: id, position: p.position });
    }
    return r && r.ok ? { ok: true } : { ok: false, code: (r && r.code) || 'FAILED' };
  }
  const EVENTOS_DE_RESERVA = new Set(['Edge.LockTabs', 'Edge.ReleaseTabs', 'Edge.ShowTabs', 'Edge.AllowActionForUrl', 'Edge.StopAction']);
  async function tratarAcao(mensagem) {
    if (!acoesLigadas()) throw erroChamada('Error in invocation of edgeCopilotToolActionsPrivate.handleToolAction(string documentId, ToolActionMessage message, string origin)');
    const m = ehObjeto(mensagem) ? mensagem : {};
    const requestId = typeof m.requestId === 'string' && RE_ID_NAA.test(m.requestId) ? m.requestId : null;
    if (!requestId) throw erroChamada('Error in invocation of edgeCopilotToolActionsPrivate.handleToolAction(ToolActionMessage message)');
    const args = ehObjeto(m.args) ? m.args : {};
    const parametros = ehObjeto(args.parameters) ? Object.keys(args.parameters).filter((k) => RE_NOME_ACAO.test(k)).sort().slice(0, 12) : [];
    somar(acoesPedidas, nomeAcao(m.eventName) + ' | ' + nomeAcao(args.actionName) + (parametros.length ? ' | ' + parametros.join(',') : ''), 60);
    reg('ACAO_PEDIDA evento=' + nomeAcao(m.eventName) + ' acao=' + nomeAcao(args.actionName));
    if (EVENTOS_DE_RESERVA.has(m.eventName)) return { eventName: m.eventName, requestId, args: { ok: true } };
    if (agenticoLigado() && m.eventName === 'Edge.ToolAction' && typeof args.actionName === 'string' && Object.prototype.hasOwnProperty.call(ACOES_EXECUTADAS, args.actionName)) {
      let r;
      try { r = await executarAcaoAgentica(args.actionName, args.parameters, (await ABA_ALVO() || {}).numero); } catch (_) { r = { ok: false, code: 'FAILED' }; }
      contarFerramenta('acao:' + args.actionName + ':' + (r.ok ? 'ok' : r.code));
      return { eventName: m.eventName, requestId, ...(typeof m.actionType === 'string' && RE_NOME_ACAO.test(m.actionType) ? { actionType: m.actionType } : {}), args: r.ok ? { ok: true, status: 'success' } : { ok: false, status: 'error', error: { code: String(r.code || 'FAILED').toLowerCase().replace(/_/g, '-') } } };
    }
    return { eventName: m.eventName, requestId, ...(typeof m.actionType === 'string' && RE_NOME_ACAO.test(m.actionType) ? { actionType: m.actionType } : {}), args: { ok: false, status: 'error', error: { code: 'unsupported-action', message: 'Actions are not executed by this host.' } } };
  }

  const contar = (api, ok) => {
    const nome = typeof api === 'string' && (RE_API.test(api) || RE_NOME_LEGADO.test(api)) ? api : '<omitido>';
    if (!chamadas.has(nome)) { if (chamadas.size >= L.maxApisNoDiagnostico) return; chamadas.set(nome, { ok: 0, erro: 0 }); }
    chamadas.get(nome)[ok ? 'ok' : 'erro']++;
    avisar();
  };
  const contarNaa = (pedido) => {
    const d = detalharNaa(pedido);
    if (!metodosNaa.has(d.metodo) && metodosNaa.size >= 20) return;
    metodosNaa.set(d.metodo, (metodosNaa.get(d.metodo) || 0) + 1);
    if (!naaDetalhes.has(d.metodo)) naaDetalhes.set(d.metodo, { clientIds: new Set(), escopos: new Set(), autoridades: new Set() });
    const acc = naaDetalhes.get(d.metodo);
    if (d.clientId && acc.clientIds.size < 8) acc.clientIds.add(d.clientId);
    for (const e of d.escopos) if (acc.escopos.size < 40) acc.escopos.add(e);
    if (d.autoridade && acc.autoridades.size < 8) acc.autoridades.add(d.autoridade);
    avisar();
  };
  const postar = (porta, mensagem) => { try { porta.enviar(mensagem); return true; } catch (_) { return false; } };
  const portasApi = () => [...portas.values()].filter((p) => p.nome === PORTA_API);
  const portasLegadas = () => [...portas.values()].filter((p) => p.nome === PORTA_LEGADA);
  function emitir(eventApi, args) {
    for (const porta of portasApi()) if (porta.assinaturas.has(eventApi)) postar(porta, { op: 'event', eventApi, args });
  }

  // ---- abas -------------------------------------------------------------------------------------------------
  const acessos = new Map();  // id inteiro -> momento em que a aba passou a ser a ativa (ou em que foi vista)
  let ativaAnterior = null;
  // Endereço sem consulta nem fragmento: parâmetros de sessão (hash do eproc, por exemplo) não vão para o contexto.
  const enderecoLimpo = (url) => { try { const u = new URL(String(url || '')); if (u.protocol === 'superproc-lei:') return u.protocol + '//' + u.host + u.pathname; return /^(?:https?|file):$/.test(u.protocol) ? u.origin + u.pathname : ''; } catch { return ''; } };

  function atualizarAcessos(lista) {
    const t = agora();
    const vivos = new Set();
    let ativa = null;
    for (const a of lista) {
      const numero = mapa.numeroDe(a.id);
      vivos.add(numero);
      if (a.active) ativa = numero;
      if (!acessos.has(numero)) acessos.set(numero, t);
    }
    if (ativa !== null && ativa !== ativaAnterior) acessos.set(ativa, t);
    ativaAnterior = ativa;
    for (const n of [...acessos.keys()]) if (!vivos.has(n)) acessos.delete(n);
    return t;
  }

  // O crbootstrap e o FluxEdgeContextualPlugin deduplicam abas por igualdade exata de url (if (!seen.has(tab.url))).
  // No eproc, várias abas compartilham origin + pathname (/eproc/controlador.php). Sem desambiguar, todas as abas
  // em segundo plano são descartadas como duplicadas. Acrescentamos #aba-<numero> apenas quando há colisão.
  // Regras (aba unificada): (1) nenhuma aba sai com endereço vazio — sub-abas ainda carregando, about:blank, etc. seriam
  // descartadas como duplicadas umas das outras e a aba "sumia" e "voltava" da lista; (2) o sufixo vale para TODAS as abas
  // que dividem o mesmo endereço, não só para as seguintes, então o endereço de uma aba não muda quando outra abre ou fecha.
  function urlsUnicasDaLista(lista) {
    const base = new Map(lista.map((a) => [a.id, enderecoLimpo(a.url) || 'about:blank']));
    const conta = new Map();
    for (const b of base.values()) conta.set(b, (conta.get(b) || 0) + 1);
    const porUrl = new Map();
    for (const a of lista) {
      const b = base.get(a.id);
      porUrl.set(a.id, conta.get(b) > 1 ? `${b}#aba-${mapa.numeroDe(a.id)}` : b);
    }
    return porUrl;
  }

  // Aba unificada do SuperPROC: capa, árvore e editor de um processo são sub-abas de um grupo que a barra mostra como uma
  // só e que ficam na tela ao mesmo tempo, embora só uma tenha o foco. O Edge não conhece essa noção; o título carrega a
  // informação para que o Copilot enumere cada sub-aba, saiba a que processo pertence e que está à vista junto da ativa.
  const PAPEIS = { capa: 'Capa do processo', arvore: 'Árvore de documentos', editor: 'Editor de minuta' };
  function tituloDaAba(a, ativaDoGrupo) {
    const titulo = linha(a.title);
    if (!a.groupId || !PAPEIS[a.role]) return titulo;
    const quem = [PAPEIS[a.role], a.processNumber ? 'processo ' + a.processNumber : null].filter(Boolean).join(' · ');
    const aVista = ativaDoGrupo && !a.active ? ' · à vista ao lado da aba ativa' : '';
    return `[Sub-aba: ${quem}${aVista}] ${titulo}`;
  }
  // Sub-abas do mesmo grupo ficam juntas (ordem da barra preservada pela primeira aparição do grupo).
  function ordenarPorGrupo(lista) {
    const ordem = [];
    const grupos = new Map();
    for (const a of lista) {
      if (!a.groupId) { ordem.push([a]); continue; }
      if (!grupos.has(a.groupId)) { const g = []; grupos.set(a.groupId, g); ordem.push(g); }
      grupos.get(a.groupId).push(a);
    }
    return ordem.flat();
  }

  async function listarAbas() {
    const lista = await broker.listTabs();
    mapa.sincronizar(lista.map((a) => a.id));
    for (const a of lista) mapa.numeroDe(a.id); // toda aba listada ganha id inteiro, na ordem da barra
    atualizarAcessos(lista);
    return lista;
  }
  // Sem consentimento a aba sai como numa extensão sem a permissão "tabs": só ids e estado, sem endereço nem título.
  const descreverAba = (a, indice, comConteudo, urlsUnicas) => {
    const numero = mapa.numeroDe(a.id);
    const url = urlsUnicas ? (urlsUnicas.get(a.id) ?? enderecoLimpo(a.url)) : (a.url || '');
    return {
      id: numero, index: indice, windowId: JANELA, active: !!a.active, highlighted: !!a.active, selected: !!a.active,
      pinned: false, incognito: false, discarded: false, autoDiscardable: true, groupId: -1, status: 'complete',
      ...(comConteudo ? { url, title: recorte(tituloDaAba(a, false), L.maxTitulo), lastAccessed: acessos.get(numero) || agora() } : {})
    };
  };

  async function conferirAbas() {
    const marca = geracao;
    let lista;
    try { lista = await listarAbas(); } catch (_) { return; }
    if (marca !== geracao) return;
    const aceito = consentimento.aceito();
    const urlsUnicas = aceito ? urlsUnicasDaLista(lista) : null;
    const novo = new Map(lista.map((a, i) => [mapa.numeroDe(a.id), { ativa: !!a.active, url: urlsUnicas ? (urlsUnicas.get(a.id) || '') : '', titulo: recorte(a.title, L.maxTitulo), aba: a, indice: i }]));
    const anterior = retrato;
    retrato = novo;
    publicarContexto(lista);
    if (!anterior) return;
    for (const numero of anterior.keys()) if (!novo.has(numero)) emitir(EV.abaRemovida, [numero, { windowId: JANELA, isWindowClosing: false }]);
    for (const [numero, n] of novo) {
      const a = anterior.get(numero);
      if (!a) { emitir(EV.abaCriada, [descreverAba(n.aba, n.indice, aceito, urlsUnicas)]); continue; }
      if (aceito && (a.url !== n.url || a.titulo !== n.titulo)) {
        const mudanca = { status: 'complete', ...(a.url !== n.url ? { url: n.url } : {}), ...(a.titulo !== n.titulo ? { title: n.titulo } : {}) };
        emitir(EV.abaAtualizada, [numero, mudanca, descreverAba(n.aba, n.indice, true, urlsUnicas)]);
      }
    }
    for (const [numero, n] of novo) {
      const a = anterior.get(numero);
      if (n.ativa && !(a && a.ativa)) emitir(EV.abaAtivada, [{ tabId: numero, windowId: JANELA }]);
    }
  }
  // ---- lista de abas no contexto do chat ---------------------------------------------------------------------------
  // No Edge, o anfitrião entrega ao app um "contextualChat" com contentType 'edgeTab' e uma entrada por aba aberta. O app
  // transforma cada entrada numa anotação EdgeTab da mensagem: é assim que o modelo fica sabendo quais abas existem e com
  // que tabId pode chamar fetch_browser_content(tabidList). Sem essa lista o modelo só alcança a aba ativa.
  // Formato lido pelo app (pacotes públicos do Copilot, 2026-11-19): tabId em texto com o id inteiro da aba, windowId
  // número, active, tabPageUrl, tabPageTitle, tabPageType ('WebPage' | 'PdfDoc') e lastAccessedTime em ms.
  // Sem consentimento a lista vai vazia: nem endereço nem título saem da ponte.
  let saidaContexto = null;   // função do transporte que leva o contexto à página
  let ultimoContexto = null;  // texto do último contexto entregue (evita repetir)
  function montarContexto(lista) {
    if (!consentimento.aceito()) return { contentType: 'edgeTab', contentItems: [], displaySummaryPrompt: false };
    const t = atualizarAcessos(lista);
    const urlsUnicas = urlsUnicasDaLista(lista);
    const grupoAtivo = (lista.find((a) => a.active) || {}).groupId || null;
    // CopilotMultitabEnabled desligado: só a aba ativa entra na lista (os endereços únicos seguem calculados sobre a lista inteira).
    const visiveis = pol('CopilotMultitabEnabled') === true ? lista : lista.filter((a) => a.active);
    const itens = ordenarPorGrupo(visiveis).slice(0, L.maxAbasNoContexto).map((a) => {
      const numero = mapa.numeroDe(a.id);
      return {
        tabId: String(numero), windowId: JANELA, active: !!a.active,
        tabPageUrl: urlsUnicas.get(a.id) ?? enderecoLimpo(a.url), tabPageTitle: recorte(tituloDaAba(a, !!grupoAtivo && a.groupId === grupoAtivo), L.maxTitulo),
        tabPageType: a.type === 'pdf' ? 'PdfDoc' : 'WebPage', lastAccessedTime: acessos.get(numero) || t
      };
    });
    return { contentType: 'edgeTab', contentItems: itens, displaySummaryPrompt: false };
  }
  function publicarContexto(lista) {
    if (typeof saidaContexto !== 'function') return;
    let texto;
    try { texto = JSON.stringify(montarContexto(lista)); } catch (_) { return; }
    if (texto === ultimoContexto) return;
    try {
      saidaContexto(texto); ultimoContexto = texto;
      const itens = JSON.parse(texto).contentItems.length;
      reg('CONTEXTO_ABAS itens=' + itens);
      contarFunil('contexto:publicacoes');
      contarFunil('contexto:itens-ultimo', itens); contarFunil('contexto:itens-max', itens);
      // abas listadas pelo SuperPROC sem endereço http(s) legível (sub-aba que ainda não "revelou" a URL): só a contagem
      contarFunil('contexto:ids-digitos-max', Math.max(0, ...JSON.parse(texto).contentItems.map((i) => String(i.tabId).length)));
      contarFunil('contexto:sem-endereco-max', lista.filter((a) => !enderecoLimpo(a.url)).length);
      if (itens === 0) contarFunil('contexto:vazio-sem-consentimento');
    } catch (_) { /* página saiu: tenta de novo na próxima conferência */ }
  }
  // O transporte liga (ao instalar a ponte na página) e desliga (página trocada) a saída do contexto.
  function definirSaidaContexto(f) {
    saidaContexto = typeof f === 'function' ? f : null;
    ultimoContexto = null;
    ajustarVigia();
    if (saidaContexto) listarAbas().then(publicarContexto, () => {});
  }

  const haAssinanteDeAbas = () => portasApi().some((p) => [...p.assinaturas].some((e) => EVENTOS_DE_ABA.has(e)));
  function ajustarVigia() {
    if (haAssinanteDeAbas() || saidaContexto) {
      if (vigia) return;
      retrato = null;
      conferirAbas();
      vigia = definirIntervalo(() => { conferirAbas(); }, intervaloAbasMs);
      if (vigia && typeof vigia.unref === 'function') vigia.unref();
    } else if (vigia) { limparIntervalo(vigia); vigia = null; retrato = null; }
  }

  // ---- consentimento e preferências -----------------------------------------------------------------------------
  const PREFS = {
    [CHAVE_CONSENTIMENTO]: () => ({ intValue: consentimento.estado() }),
    // Leitura de página disponível no SuperPROC; segue a política CopilotPageContextEnabled e quem decide o uso é o consentimento acima.
    'edge_underside.copilot_page_context_enabled': () => ({ boolValue: pol('CopilotPageContextEnabled') === true }),
    // Sem túnel CDP: a página deve usar pageContext.getDocumentMetaData / getDocumentBody.
    'edge_underside.sidebar_copilot_cdp_page_context_enabled': () => ({ boolValue: false }),
    // O SuperPROC não transcreve vídeo.
    'browser.underside_video_transcript_consent': () => ({ intValue: 2 }),
    // IA no dispositivo (política GenAILocalFoundationalModelSettings: 0 = permitido, 1 = não permitido; sem política = permitido).
    // A página do Copilot nunca pediu estas chaves nos diagnósticos reais; os TIPOS e valores abaixo são HIPÓTESE (espelham a política).
    'optimization_guide.on_device_foundational_model_user_settings': () => ({ intValue: iaLocalAtiva() ? 0 : 1 }),
    'optimization_guide.gen_ai_local_foundational_model_settings': () => ({ intValue: iaLocalAtiva() ? 0 : 1 }),
    'policy.built_in_ai_apis_enabled': () => ({ boolValue: iaLocalAtiva() })
  };
  const iaLocalAtiva = () => { try { return pol('GenAILocalFoundationalModelSettings') === true && pol('BuiltInAIAPIsEnabled') === true && (!(iaLocal && typeof iaLocal.ativo === 'function') || iaLocal.ativo() !== false); } catch (_) { return true; } };
  // Qualquer política do catálogo pedida por nome (com ou sem policy.): bool -> boolValue; lista -> stringValue (JSON). Tipos HIPÓTESE.
  // Também responde pelo nome exato da PREFERÊNCIA do Edge ligada à política (ex.: edge_tools.enabled), conforme o catálogo.
  const prefDePolitica = (chave) => {
    // O nome exato da preferência vem primeiro: algumas (devtools.gen_ai_settings) também casariam com o nome da política.
    const porPref = POL.responderPref(chave, valoresPol());
    if (porPref) return porPref;
    const nome = POL.nomeDaChave(chave);
    if (!nome) return undefined;
    const v = pol(nome); return typeof v === 'boolean' ? { boolValue: v } : { stringValue: JSON.stringify(v) };
  };
  const lerPref = (chave) => {
    if (typeof chave !== 'string') return undefined;
    if (Object.prototype.hasOwnProperty.call(PREFS, chave)) return { key: chave, ...PREFS[chave](), isManaged: false };
    const dePolitica = prefDePolitica(chave);
    return dePolitica ? { key: chave.slice(0, 120), ...dePolitica, isManaged: false } : undefined;
  };
  const valorSimples = (pref) => pref.intValue ?? pref.stringValue ?? pref.boolValue;

  // Pedido de consentimento por iniciativa da ponte: só enquanto a pessoa nunca decidiu, e uma vez por página.
  function pedirSeNuncaDecidiu() {
    if (pediuPorContaPropria || consentimento.estado() !== 0) return;
    pediuPorContaPropria = true;
    consentimento.pedir();
  }
  const avisarFechamento = (requestId, decisao) => emitir(EV.consentimentoFechado, [requestId, { decision: decisao, callerDocumentId: documentoChamador }]);
  const responderSemCartao = (decisao) => { const id = uuid(); const marca = geracao; queueMicrotask(() => { if (marca === geracao) avisarFechamento(id, decisao); }); return id; };
  function dispararCartao() {
    if (consentimento.aceito()) return responderSemCartao('accepted');
    // Logo após um "Não permitir" a página não reabre o cartão sozinha: a resposta volta negada.
    if (agora() - negadoEm < L.esperaAposNegar && !consentimento.cartaoAberto()) return responderSemCartao('declined');
    pediuPorContaPropria = true;
    return consentimento.pedir();
  }
  const desligarFechar = consentimento.aoFechar?.((requestId, decisao) => {
    if (decisao === 'declined') negadoEm = agora();
    avisarFechamento(requestId, decisao);
  });
  const desligarMudar = consentimento.aoMudar?.(() => {
    const pref = lerPref(CHAVE_CONSENTIMENTO);
    reg('PREF_MUDOU');
    emitir(EV.pref, [pref]);
    for (const porta of portasLegadas()) {
      if (porta.prefsObservadas.has(CHAVE_CONSENTIMENTO)) postar(porta, { eventName: LEGADO.aoPref, requestId: uuid(), args: { key: pref.key, value: valorSimples(pref), isManaged: false } });
    }
    retrato = null; // o que a página pode ver das abas mudou
  });

  // ---- conteúdo da página -----------------------------------------------------------------------------------
  const vazio = (errorCode, consentStatus, base = {}) => ({
    url: '', title: '', id: -1, data: '', consentStatus, errorCode, documentType: 'notYetDetermined', paidContentStatus: 'unknown',
    sensitiveContentState: { isDlpProtected: false, protectedSessionAllowed: false }, ...base, callerDocumentId: documentoChamador
  });
  const dentroDoLimite = () => {
    const t = agora();
    while (leituras.length && t - leituras[0] >= 60000) leituras.shift();
    if (leituras.length >= L.leiturasPorMinuto) return false;
    leituras.push(t);
    return true;
  };
  const ERRO_DO_BROKER = { TAB_NOT_FOUND: 'noWebContents', TAB_DESTROYED: 'noWebContents', TAB_CHANGED: 'noWebContents', UNSUPPORTED_BROWSER_PAGE: 'notSupportedError' };

  // alvo: { documentId } (copilot-api) ou { ativa:true, tabId? } (canal legado, que não informa documento).
  async function obterDocumento(tipo, alvo, args) {
    if (!consentimento.aceito()) { pedirSeNuncaDecidiu(); return vazio('noConsent', 'denied'); }
    let d = null;
    if (alvo.documentId !== undefined) d = mapa.resolverDocumento(alvo.documentId);
    else {
      const numero = Number.isSafeInteger(alvo.tabId) ? alvo.tabId : null;
      const ativa = numero === null ? await broker.getActiveTab() : null;
      const idInterno = numero === null ? (ativa && ativa.id) : mapa.internoDe(numero);
      if (idInterno) d = { idInterno, numero: mapa.numeroDe(idInterno), identidade: broker.getDocumentIdentity?.(idInterno) };
    }
    if (!d) return vazio('noWebContents', 'allowed');
    const aba = (await listarAbas()).find((a) => a.id === d.idInterno);
    if (!aba || d.identidade === undefined || broker.getDocumentIdentity?.(d.idInterno) !== d.identidade) { contarFunil('leitura:sem-aba'); return vazio('noWebContents', 'allowed'); }
    if (tipo === 'corpo') contarFunil(aba.active ? 'leitura:ativa' : 'leitura:segundo-plano');
    const base = { url: aba.url || '', title: recorte(linha(aba.title), L.maxTitulo), id: d.numero, documentType: aba.type === 'pdf' ? 'pdf' : 'web' };
    if (tipo === 'metadados') return vazio('noError', 'allowed', base);
    if (!aba.readable) return vazio('notSupportedError', 'allowed', base);
    if (!dentroDoLimite()) return vazio('tooManyRequests', 'allowed', base);
    // maxChars é o que a página do Copilot pede (como no Edge). Por padrão é respeitado; com a opção "enviar o texto completo"
    // (config copilotIgnorarMaxCharsDaPagina) vale só o teto do SuperPROC. O valor pedido vai ao diagnóstico (só o número).
    const pediu = ehObjeto(args) && Number.isSafeInteger(args.maxChars) && args.maxChars > 0 ? args.maxChars : null;
    if (pediu !== null) { contarFunil('leitura:maxchars-pedido-max', pediu); contarFunil('leitura:maxchars-pedido-ultimo', pediu); }
    let ignorar = false; try { ignorar = ignorarMaxCharsDaPagina() === true; } catch (_) { /* padrão: respeitar */ }
    const max = Math.min(pediu === null || ignorar ? L.maxCaracteres : pediu, L.maxCaracteres);
    let snap;
    try { snap = await broker.readTab(d.idInterno, { maxCharacters: max, documento: d.identidade }); }
    catch (e) { return vazio(ERRO_DO_BROKER[e && e.codigo] || 'unknownError', 'allowed', base); }
    // O consentimento pode ter sido retirado durante a extração: o texto lido é descartado.
    if (!consentimento.aceito()) return vazio('noConsent', 'denied');
    // Corte avisado: quando o texto não coube (teto, prazo do PDF ou maxChars), a última linha diz isso ao modelo, sem passar de max.
    const completo = comporCorpo(snap, L.maxCaracteres);
    const cortado = !!snap.truncated || completo.length > max;
    const marca = '\n\n[SuperPROC: conteúdo truncado; ' + Math.min(completo.length, max) + ' caracteres entregues' + (completo.length > max ? ' de ' + completo.length : '') + '.]';
    const data = cortado && max >= 1000 ? completo.slice(0, max - marca.length) + marca : completo.slice(0, max);
    contarFunil('leitura:caracteres-max', data.length); contarFunil('leitura:caracteres-ultimo', data.length);
    if (cortado) contarFunil('leitura:truncadas');
    reg('CORPO_OK caracteres=' + data.length);
    return vazio('noError', 'allowed', { ...base, url: snap.url || base.url, title: recorte(linha(snap.title), L.maxTitulo) || base.title, data });
  }
  // Como no Edge: a chamada devolve o id do pedido na hora e o resultado chega depois pelo evento.
  // Como no Edge, o corpo chega em fragmentos com o id real da aba e termina num evento com id -1 e sem texto; a página
  // só conclui a leitura ao receber esse terminador (app do Copilot, módulo de extração: id === -1 || id === 4294967295).
  // Um resultado que já vem com id -1 (erro sem aba resolvida) é ele mesmo o terminador.
  const entregarCorpo = (enviar, requestId, r) => {
    enviar(requestId, r);
    if (r && r.id !== -1) enviar(requestId, { ...r, id: -1, data: '' });
  };
  function pedirDocumento(tipo, alvo, args, entregar) {
    const requestId = uuid();
    const marca = geracao;
    Promise.resolve().then(() => obterDocumento(tipo, alvo, args)).catch(() => vazio('unknownError', consentimento.aceito() ? 'allowed' : 'denied'))
      .then((resultado) => { if (marca === geracao) entregar(requestId, resultado); });
    return requestId;
  }

  // ---- despacho da porta copilot-api ---------------------------------------------------------------------------
  const erroChamada = (mensagem) => { const e = new Error(mensagem); e.chamada = true; return e; };
  const APIS = {
    'chrome.copilotBridgePrivate.prefs.get': ([chave]) => {
      if (typeof chave !== 'string') throw erroChamada('Error in invocation of copilotBridgePrivate.prefs.get(string key)');
      somar(prefsPedidas, RE_NOME_SEGURO.test(chave) ? chave : '<omitido>', 60);
      // Como no Edge, quem mostra o pedido de consentimento é o navegador (aqui, o cartão local), não a página:
      // a página só lê esta preferência e espera virar 1 para então consultar a aba. Ao vê-la consultar o
      // consentimento ainda sem decisão, mostramos o cartão uma vez — é o gatilho que o Edge dá pela sobreposição nativa.
      if (chave === CHAVE_CONSENTIMENTO) pedirSeNuncaDecidiu();
      return lerPref(chave);
    },
    // A página não se autoriza: gravar o consentimento por aqui é recusado. Um pedido para ligar vira pergunta à pessoa.
    'chrome.copilotBridgePrivate.prefs.set': ([chave, valor]) => {
      if (typeof chave !== 'string' || !ehObjeto(valor)) throw erroChamada('Error in invocation of copilotBridgePrivate.prefs.set(string key, SetPrefValue value)');
      if (chave === CHAVE_CONSENTIMENTO) { reg('PREF_SET_RECUSADO'); if (valor.intValue === 1 && !consentimento.aceito()) dispararCartao(); }
      return false;
    },
    'chrome.copilotBridgePrivate.chat.triggerConsentDialog': () => dispararCartao(),
    'chrome.copilotBridgePrivate.auth.nestedAppAuth': ([pedido]) => {
      const resposta = respostaNaa(pedido);
      if (!resposta) throw erroChamada('Error in invocation of copilotBridgePrivate.auth.nestedAppAuth(BridgeRequestEnvelope request)');
      contarNaa(pedido);
      return resposta;
    },
    'chrome.copilotBridgePrivate.chat.notifyReady': () => true,
    // Marca de telemetria do Edge (campo pronto para digitar): aceita e descartada.
    'chrome.copilotBridgePrivate.chat.recordComposerReady': () => true,
    // Avisos do app ao navegador (mensagem enviada, conversa trocada), disparados sem esperar resposta: aceitos e descartados.
    'chrome.copilotBridgePrivate.notify.dispatch': () => undefined,
    // "Browse with Copilot" (o Copilot agir nas abas): desligado (NotAvailable) salvo no modo sonda; ver tratarAcao.
    'chrome.edgeCopilotBrowseConsentPrivate.getBrowseEligibility': () => elegibilidade(),
    'chrome.edgeCopilotBrowseConsentPrivate.ensureBrowseConsent': () => elegibilidade(),
    'chrome.edgeCopilotToolActionsPrivate.handleToolAction': ([mensagem]) => tratarAcao(mensagem),
    'chrome.copilotBridgePrivate.pageContext.findTextsOnPage': (args) => buscarNaPagina(semDocumento(args)),
    'chrome.copilotBridgePrivate.pageContext.highlightTextOnPage': (args) => realcarNaPagina(args),
    'chrome.copilotBridgePrivate.pageContext.clearAllHighlightTextInPdf': () => limparRealce(),
    'chrome.copilotBridgePrivate.chat.searchHistory': (args) => buscarHistorico(args),
    'chrome.copilotBridgePrivate.pageContext.highlightTextInPdfWithContext': (args) => realcarPdfComContexto(args),
    'chrome.copilotBridgePrivate.chat.openLinkInExternalBrowser': (args) => abrirLinkExterno(args),
    'chrome.copilotBridgePrivate.toolServers.getEnablement': (args) => habilitacaoDoServidor(args),
    // Relato de flights ao navegador: não há o que fazer com ele aqui.
    'chrome.copilotBridgePrivate.config.reportFlights': () => undefined,
    'chrome.copilotBridgePrivate.windowContext.getOwningWindowActiveTab': async () => {
      const lista = await listarAbas();
      const ativa = lista.find((a) => a.active);
      if (!ativa) { contarFunil('ativa:nao-resolvida'); return {}; }
      const urlsUnicas = consentimento.aceito() ? urlsUnicasDaLista(lista) : null;
      return { id: mapa.numeroDe(ativa.id), ...(urlsUnicas ? { url: urlsUnicas.get(ativa.id) ?? '' } : {}) };
    },
    'chrome.tabs.query': async ([consulta]) => {
      const q = ehObjeto(consulta) ? consulta : {};
      const aceito = consentimento.aceito();
      const lista = await listarAbas();
      const urlsUnicas = aceito ? urlsUnicasDaLista(lista) : null;
      let abas = lista.map((a, i) => descreverAba(a, i, aceito, urlsUnicas));
      contarFunil('consulta:ids-digitos-max', Math.max(0, ...abas.map((x) => String(x.id).length)));
      if (Number.isSafeInteger(q.windowId) && q.windowId !== JANELA && q.windowId !== -2) return [];
      if (typeof q.active === 'boolean') abas = abas.filter((t) => t.active === q.active);
      if (typeof q.highlighted === 'boolean') abas = abas.filter((t) => t.highlighted === q.highlighted);
      if (typeof q.pinned === 'boolean') abas = abas.filter((t) => t.pinned === q.pinned);
      if (Number.isSafeInteger(q.index)) abas = abas.filter((t) => t.index === q.index);
      return abas;
    },
    'chrome.tabs.get': async ([numero]) => {
      const lista = await listarAbas();
      const idInterno = mapa.internoDe(numero);
      const indice = lista.findIndex((a) => a.id === idInterno);
      if (!idInterno || indice < 0) throw erroChamada('No tab with id: ' + (Number.isSafeInteger(numero) ? numero : '?') + '.');
      const aceito = consentimento.aceito();
      const urlsUnicas = aceito ? urlsUnicasDaLista(lista) : null;
      return descreverAba(lista[indice], indice, aceito, urlsUnicas);
    },
    'chrome.webNavigation.getAllFrames': async ([detalhes]) => {
      const numero = ehObjeto(detalhes) ? detalhes.tabId : undefined;
      const lista = await listarAbas();
      const idInterno = mapa.internoDe(numero);
      const aba = idInterno && lista.find((a) => a.id === idInterno);
      if (!aba) { contarFunil('frames:aba-ausente'); return null; }
      const documentId = mapa.emitirDocumento(idInterno, broker.getDocumentIdentity?.(idInterno));
      if (!documentId) return [];
      return [{ errorOccurred: false, processId: numero, frameId: 0, parentFrameId: -1, documentId, documentLifecycle: 'active', frameType: 'outermost_frame', url: consentimento.aceito() ? (aba.url || '') : '' }];
    },
    'chrome.copilotBridgePrivate.pageContext.getDocumentMetaData': ([documentId]) => {
      if (typeof documentId !== 'string') throw erroChamada('Error in invocation of copilotBridgePrivate.pageContext.getDocumentMetaData(string documentId, optional string callerDocumentId)');
      return pedirDocumento('metadados', { documentId }, undefined, (requestId, r) => emitir(EV.metadados, [requestId, r]));
    },
    'chrome.copilotBridgePrivate.pageContext.getDocumentBody': ([documentId, args]) => {
      if (typeof documentId !== 'string' || (args !== undefined && !ehObjeto(args))) throw erroChamada('Error in invocation of copilotBridgePrivate.pageContext.getDocumentBody(string documentId, GetDocumentArgs args)');
      return pedirDocumento('corpo', { documentId }, args, (requestId, r) => entregarCorpo((id, x) => emitir(EV.corpo, [id, x]), requestId, r));
    },
    // O SuperPROC não tem recursos nem dados de carga do Edge: respostas vazias, nos tipos do esquema.
    'chrome.copilotBridgePrivate.config.getFeatures': () => [],
    'chrome.copilotBridgePrivate.config.getLoadTimeData': () => ({}),
    'chrome.copilotBridgePrivate.config.getLiveModeEnabled': () => false,
    'chrome.copilotBridgePrivate.config.getFeatureGateValue': () => false
  };

  async function despachar(envelope) {
    const api = envelope.api;
    if (!RE_API.test(api) || !ESPACOS.some((p) => api.startsWith(p))) { contar(api, false); return { ok: false, error: 'api not allowed: ' + recorte(String(api), 160) }; }
    if (SEM_EFEITO.some((re) => re.test(api))) { contar(api, true); return { ok: true }; }
    const tratador = Object.prototype.hasOwnProperty.call(APIS, api) ? APIS[api] : null;
    // Mesma resposta que o Edge dá quando o espaço de nomes não existe naquela plataforma.
    if (!tratador) { contar(api, false); return { ok: false, error: 'api not resolvable: ' + api }; }
    try {
      const value = await tratador(Array.isArray(envelope.args) ? envelope.args : []);
      contar(api, true);
      return { ok: true, value };
    } catch (e) {
      contar(api, false);
      return { ok: false, error: e && e.chamada ? e.message : 'internal error' };
    }
  }
  const ehChamada = (m) => ehObjeto(m) && typeof m.api === 'string' && (m.args === undefined || Array.isArray(m.args));
  const ehAssinatura = (m) => ehObjeto(m) && (m.op === 'subscribe' || m.op === 'unsubscribe') && typeof m.eventApi === 'string';

  function tratarApi(porta, mensagem) {
    if (ehAssinatura(mensagem)) {
      const { op, eventApi } = mensagem;
      if (op === 'unsubscribe') { porta.assinaturas.delete(eventApi); ajustarVigia(); postar(porta, { op: 'unsubscribe-ack', eventApi, ok: true }); return; }
      if (!RE_EVENTO.test(eventApi) || !ESPACOS.some((p) => eventApi.startsWith(p))) { postar(porta, { op: 'subscribe-ack', eventApi: recorte(eventApi, 160), ok: false, error: 'event not allowed: ' + recorte(eventApi, 160) }); return; }
      if (!porta.assinaturas.has(eventApi) && porta.assinaturas.size >= L.maxAssinaturas) { postar(porta, { op: 'subscribe-ack', eventApi, ok: false, error: 'event not resolvable or addListener failed: ' + eventApi }); return; }
      porta.assinaturas.add(eventApi);
      postar(porta, { op: 'subscribe-ack', eventApi, ok: true });
      ajustarVigia();
      return;
    }
    if (!ehObjeto(mensagem) || typeof mensagem.requestId !== 'string' || !ehChamada(mensagem)) {
      anotarForma(PORTA_API, mensagem);
      if (ehObjeto(mensagem) && typeof mensagem.requestId === 'string') postar(porta, { requestId: mensagem.requestId, ok: false, error: 'invalid envelope' });
      return;
    }
    const { requestId } = mensagem;
    const marca = geracao;
    despachar(mensagem).then((resposta) => { if (marca === geracao) postar(porta, { requestId, ...resposta }); });
  }

  // ---- canal legado copilot-bridge -----------------------------------------------------------------------------
  function tratarLegado(porta, mensagem) {
    if (!ehObjeto(mensagem) || typeof mensagem.eventName !== 'string' || typeof mensagem.requestId !== 'string') {
      anotarForma(PORTA_LEGADA, mensagem);
      if (ehObjeto(mensagem) && typeof mensagem.requestId === 'string') postar(porta, { eventName: 'Edge.MalformedMessage', requestId: mensagem.requestId, error: 'malformed message' });
      return;
    }
    const { eventName, requestId } = mensagem;
    const args = ehObjeto(mensagem.args) ? mensagem.args : {};
    if (eventName === LEGADO.pronto) { contar(eventName, true); return; }
    if (eventName === LEGADO.naa) {
      // O pedido vem em args.envelope (objeto) ou args.payload (texto JSON), como no AuthApiHandler do Edge.
      let pedido = null;
      if (ehObjeto(args.envelope)) pedido = args.envelope;
      else if (typeof args.payload === 'string' && args.payload.length <= 65536) { try { pedido = JSON.parse(args.payload); } catch (_) { pedido = null; } }
      const resposta = respostaNaa(pedido);
      if (!resposta) { contar(eventName, false); postar(porta, { eventName, requestId, error: 'invalid nested app auth request' }); return; }
      contar(eventName, true);
      contarNaa(pedido);
      postar(porta, { eventName: LEGADO.aoNaa, requestId, args: { payload: JSON.stringify(resposta) } });
      return;
    }
    if (eventName === LEGADO.pref) {
      if (typeof args.key !== 'string') { contar(eventName, false); postar(porta, { eventName, requestId, error: 'PrefArgs is missing or invalid' }); return; }
      contar(eventName, true);
      if (args.value !== undefined) { // gravação: sem resposta no Edge; aqui o consentimento não é gravável pela página
        if (args.key === CHAVE_CONSENTIMENTO) { reg('PREF_SET_RECUSADO'); if (args.value === 1 && !consentimento.aceito()) dispararCartao(); }
        return;
      }
      const pref = lerPref(args.key);
      if (args.notifyOnChange === true && pref) porta.prefsObservadas.add(args.key);
      if (pref) postar(porta, { eventName: LEGADO.aoPref, requestId, args: { key: pref.key, value: valorSimples(pref), isManaged: false } });
      return;
    }
    if (eventName === LEGADO.metadados || eventName === LEGADO.corpo) {
      contar(eventName, true);
      const corpo = eventName === LEGADO.corpo;
      // O canal legado não informa o documento: o alvo é a aba indicada em args.tabId ou a aba ativa.
      const marca = geracao;
      Promise.resolve().then(() => obterDocumento(corpo ? 'corpo' : 'metadados', { ativa: true, tabId: args.tabId }, args))
        .catch(() => vazio('unknownError', consentimento.aceito() ? 'allowed' : 'denied'))
        .then((r) => {
          if (marca !== geracao) return;
          if (corpo) entregarCorpo((id, x) => postar(porta, { eventName: LEGADO.aoCorpo, requestId: id, args: x }), requestId, r);
          else postar(porta, { eventName: LEGADO.aoMetadados, requestId, args: r });
        });
      return;
    }
    if (eventName === 'Edge.Chat.Screenshot') { tratarCaptura(porta, eventName, requestId); return; }
    if (eventName === 'Edge.Mcp.GetSupportedMcpServers' || eventName === 'Edge.Mcp.CallToolOnServer' || eventName === 'Edge.Mcp.ReadMcpResourceFromServer') { tratarMcp(porta, eventName, requestId, args); return; }
    contar(eventName, false);
    postar(porta, { eventName, requestId, error: 'unhandled message: ' + (RE_NOME_LEGADO.test(eventName) ? eventName : '<omitido>') });
  }

  // ---- ciclo de vida das portas --------------------------------------------------------------------------------
  function conectar(portaId, nome, enviar, idDaPagina) {
    if (portas.has(portaId) || portas.size >= L.maxPortas || typeof enviar !== 'function') return false;
    const rotulo = typeof nome === 'string' && RE_NOME_SEGURO.test(nome) ? nome : (nome === '' ? '(sem nome)' : '<omitido>');
    somar(nomesDePorta, rotulo, 20);
    registrarExtensao(idDaPagina, 'portas');
    // Nomes diferentes dos dois conhecidos ficam abertos e sem resposta, como no service worker do Edge.
    portas.set(portaId, { nome: nome === PORTA_API || nome === PORTA_LEGADA ? nome : '', rotulo, enviar, assinaturas: new Set(), prefsObservadas: new Set() });
    reg('PORTA_ABERTA ' + (nome === PORTA_API || nome === PORTA_LEGADA ? nome : 'outra'));
    aberturas++;
    avisar();
    return true;
  }
  function receber(portaId, mensagem) {
    const porta = portas.get(portaId);
    if (!porta) return false;
    if (porta.nome === PORTA_API) tratarApi(porta, mensagem);
    else if (porta.nome === PORTA_LEGADA) tratarLegado(porta, mensagem);
    else anotarForma('porta ' + porta.rotulo, mensagem);
    return true;
  }
  function desconectar(portaId) {
    if (!portas.delete(portaId)) return;
    ajustarVigia();
  }
  function anotar(codigo) {
    if (!NOTAS.includes(codigo)) return;
    notas.set(codigo, (notas.get(codigo) || 0) + 1);
    avisar();
  }
  // Chamada única (chrome.runtime.sendMessage): mesmo despachante, sem porta para eventos.
  async function chamarUmaVez(mensagem, idDaPagina) {
    registrarExtensao(idDaPagina, 'chamadasUnicas');
    if (!ehChamada(mensagem)) { anotarForma('sendMessage', mensagem); return { ok: false, error: 'invalid envelope' }; }
    return despachar(mensagem);
  }
  // A página do Copilot foi trocada (navegação, recarga, queda do processo): nada do que estava em curso é entregue.
  function reiniciar() {
    geracao++;
    if (portas.size) paginas++;
    documentoChamador = uuid();
    pediuPorContaPropria = false;
    portas.clear();
    ultimoContexto = null; // a página nova (ou a mesma, reconectando) recebe a lista de novo
    ajustarVigia();
    consentimento.cancelarPendentes?.();
  }
  function encerrar() { saidaContexto = null; reiniciar(); desligarFechar?.(); desligarMudar?.(); }

  function diagnostico() {
    return {
      consentimento: consentimento.estado(),
      portas: [...portas.values()].map((p) => p.nome || 'outra'),
      assinaturas: [...new Set(portasApi().flatMap((p) => [...p.assinaturas]))].sort(),
      aberturas, paginasTrocadas: paginas,
      usoDeChromeRuntime: Object.fromEntries(notas),
      funilMultiAba: Object.fromEntries(funil),
      ferramentasNativas: { politicasIA: Object.fromEntries(POL.CURADAS.filter((p) => p.tipo === 'bool').map((p) => [p.nome, valoresPol()[p.nome]])), demaisPoliticasAlteradas: Object.keys(POL.compactar(valoresPol())).filter((n) => !POL.CURADAS.some((p) => p.nome === n)).length, listasDeSites: { permitidos: sitesDasAcoes().permitidos.length, bloqueados: sitesDasAcoes().bloqueados.length }, agentico: agenticoLigado(), captura: !!(F.captura && permitida(F.captura)), historico: !!(F.historico && permitida(F.historico)), linkExterno: !!(F.externo && permitida(F.externo)), mcp: mcpLigado(), servidoresMcp: servidoresMcp().length, usadas: Object.fromEntries(usoFerramentas) },
      acoes: { modo: modoAcoes(), consultasDeElegibilidade: elegibilidadeConsultada.vezes, pedidas: Object.fromEntries(acoesPedidas) },
      extensoesChamadas: [...extensoes].map(([id, c]) => ({ id, ehPonteDoEdge: id === ID_EXTENSAO, portas: c.portas, chamadasUnicas: c.chamadasUnicas })),
      nomesDePorta: Object.fromEntries(nomesDePorta),
      formasNaoAtendidas: [...formas].map(([forma, vezes]) => ({ forma, vezes })),
      prefsPedidas: Object.fromEntries(prefsPedidas),
      ordem: [...chamadas.keys()], // ordem da primeira ocorrência
      autenticacaoAninhada: [...metodosNaa].map(([metodo, vezes]) => ({ metodo, vezes, ...(naaDetalhes.has(metodo) ? { clientIds: [...naaDetalhes.get(metodo).clientIds], escopos: [...naaDetalhes.get(metodo).escopos], autoridades: [...naaDetalhes.get(metodo).autoridades] } : {}) })),
      chamadas: [...chamadas].map(([api, c]) => ({ api, ok: c.ok, erro: c.erro })).sort((a, b) => a.api.localeCompare(b.api))
    };
  }

  return { conectar, receber, desconectar, chamarUmaVez, anotar, reiniciar, encerrar, diagnostico, conferirAbas, definirSaidaContexto, montarContexto };
}

// Transporte: liga os canais IPC do preload da coluna (cr-bridge-preload.js) à ponte. Só o quadro principal da
// coluna do Copilot, numa das origens do cr-host, é atendido; a origem é a que o Electron informa, nunca a da página.
// atrasoInstalacaoMs: tempo entre o início do documento e a instalação de chrome.runtime na página. Em sessão real, com
// a ponte presente desde a carga, a página do Copilot iniciou em "modo hospedado pelo Edge" (pediu identidade pela
// autenticação aninhada) e passou a abrir uma janela de login a cada envio. Instalando depois que ela já iniciou em modo
// Web, o login segue o caminho comum e a ponte fica disponível para a consulta de abas.
function criarTransporteCr({ ponte, getColunaWc, origens = ORIGENS_CR_HOST, log = () => {}, atrasoInstalacaoMs = 0, agendar = setTimeout, authOcupada = () => false, maxEsperasAuth = 40, intervaloEsperaAuthMs = 1500 }) {
  const permitidas = new Set(origens);
  const reg = (m) => { try { log('COPILOT_PONTE', m); } catch (_) { /* log nunca derruba a ponte */ } };
  let documentoAtual = null; // marca sorteada pelo preload a cada documento
  let documentoAguardando = null; // documento que pediu a ponte e ainda não a recebeu
  const observados = new WeakSet();

  const origemDaColuna = (wc) => { try { return new URL(wc.mainFrame.url).origin; } catch { return ''; } };
  function remetenteValido(event) {
    try {
      const wc = getColunaWc();
      if (!wc || wc.isDestroyed() || !event || event.sender !== wc || !event.senderFrame || event.senderFrame !== wc.mainFrame) return false;
      return permitidas.has(new URL(event.senderFrame.url).origin);
    } catch { return false; }
  }
  function observar(wc) {
    if (observados.has(wc)) return;
    observados.add(wc);
    const zerar = () => { documentoAtual = null; documentoAguardando = null; ponte.definirSaidaContexto?.(null); ponte.reiniciar(); };
    wc.on('did-navigate', zerar);
    wc.on('render-process-gone', zerar);
    wc.once('destroyed', zerar);
  }
  const idValido = (id) => Number.isSafeInteger(id) && id > 0 && id < 1e9;
  const marcaValida = (m) => typeof m === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(m);
  const lerJson = (texto) => { if (typeof texto !== 'string' || texto.length > MAX_JSON) return undefined; try { return JSON.parse(texto); } catch { return undefined; } };

  function abrir(event, marca, portaId, nome, idDaPagina) {
    if (!remetenteValido(event) || !marcaValida(marca) || !idValido(portaId) || typeof nome !== 'string' || nome.length > 64) return;
    const wc = event.sender;
    observar(wc);
    if (marca !== documentoAtual) { ponte.reiniciar(); documentoAtual = marca; }
    const enviar = (tipo, mensagem) => {
      // Reconfere o destino a cada envio: a coluna pode ter saído do cr-host desde que a porta abriu.
      if (wc.isDestroyed() || documentoAtual !== marca || !permitidas.has(origemDaColuna(wc))) throw Error('porta fechada');
      wc.send(CANAIS.evento, portaId, tipo, mensagem === undefined ? '' : JSON.stringify(mensagem));
    };
    if (!ponte.conectar(portaId, nome, (mensagem) => enviar('msg', mensagem), idDaPagina)) {
      reg('PORTA_RECUSADA');
      try { enviar('fechar'); } catch (_) { /* página já saiu */ }
    }
  }
  // A porta pode ter sido descartada no host (página trocada, limite): a página é avisada e reconecta se quiser.
  const avisarFechada = (event, portaId) => { try { event.sender.send(CANAIS.evento, portaId, 'fechar', ''); } catch (_) { /* página já saiu */ } };
  function mensagem(event, marca, portaId, texto) {
    if (!remetenteValido(event) || !marcaValida(marca) || !idValido(portaId)) return;
    if (marca !== documentoAtual) { avisarFechada(event, portaId); return; }
    const m = lerJson(texto);
    if (m !== undefined && !ponte.receber(portaId, m)) avisarFechada(event, portaId);
  }
  function fechar(event, marca, portaId) {
    if (!remetenteValido(event) || marca !== documentoAtual || !idValido(portaId)) return;
    ponte.desconectar(portaId);
  }
  async function unico(event, texto, idDaPagina) {
    if (!remetenteValido(event)) return JSON.stringify({ ok: false, error: 'origin not allowed' });
    const m = lerJson(texto);
    return JSON.stringify(m === undefined ? { ok: false, error: 'invalid envelope' } : await ponte.chamarUmaVez(m, idDaPagina));
  }

  function nota(event, marca, codigo) {
    if (!remetenteValido(event) || !marcaValida(marca) || typeof codigo !== 'string') return;
    ponte.anotar(codigo);
    // O preload avisa que há um documento do cr-host pronto para receber a ponte; o host decide quando instalar.
    if (codigo === 'preload') {
      const wc = event.sender;
      observar(wc);
      documentoAguardando = marca;
      let esperasAuth = 0;
      const instalar = () => {
        // Só o mesmo documento, ainda na coluna e ainda numa origem do cr-host, recebe a ordem.
        if (documentoAguardando !== marca || wc.isDestroyed() || getColunaWc() !== wc || !permitidas.has(origemDaColuna(wc))) return;
        // Enquanto o login estiver em andamento (janela de login aberta ou recém-fechada), adia, até um teto. A página
        // precisa iniciar e autenticar em modo Web antes de encontrar a ponte, senão volta ao laço de login hospedado.
        if (atrasoInstalacaoMs > 0 && esperasAuth++ < maxEsperasAuth) {
          let ocupada = false;
          try { ocupada = authOcupada() === true; } catch (_) { ocupada = false; }
          if (ocupada) { const t = agendar(instalar, intervaloEsperaAuthMs); if (t && typeof t.unref === 'function') t.unref(); return; }
        }
        documentoAguardando = null;
        try { wc.send(CANAIS.instalar, marca); } catch (_) { return; /* página já saiu */ }
        // A partir daqui a lista de abas acompanha a página. Cada envio reconfere destino e documento.
        ponte.definirSaidaContexto?.((texto) => {
          if (wc.isDestroyed() || getColunaWc() !== wc || !permitidas.has(origemDaColuna(wc))) throw Error('coluna saiu');
          if (typeof texto !== 'string' || texto.length > MAX_JSON) throw Error('contexto inválido');
          wc.send(CANAIS.contexto, marca, texto);
        });
      };
      if (atrasoInstalacaoMs > 0) { const t = agendar(instalar, atrasoInstalacaoMs); if (t && typeof t.unref === 'function') t.unref(); } else instalar();
    }
  }

  return { remetenteValido, abrir, mensagem, fechar, unico, nota };
}

module.exports = { ID_EXTENSAO, ORIGENS_CR_HOST, PORTA_API, PORTA_LEGADA, CANAIS, NOTAS, EV, LEGADO, formaDe, comporCorpo, respostaNaa, criarPonteCr, criarTransporteCr };
