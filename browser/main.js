const { app, net, BrowserWindow, WebContentsView, webContents, session, ipcMain, nativeTheme, dialog, Menu, screen, shell, clipboard, protocol, safeStorage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('node:url');
const { createFindController, listGlossary } = require('./find/find-engine');
const { durableUrl, BoundedCache, cacheRetry, LIMITS } = require('./v2-policy');
const { SessionLinks } = require('./session-links');
const sessionLinks = new SessionLinks();
const { SignedLinkMemory, digitosDaCapa, quickSearchScript } = require('./history-links');
const { extrairCnj, normalizarCnj, formatarCnj } = require('./history-process');
const { PARTES_SCRIPT } = require('./history-parties');
const signedLinks = new SignedLinkMemory();
// showDialog vive dentro de setupIPC; atalhos fora dele (Ctrl+L) usam esta ponte.
const dialogBridge = { show: null };
const V2_SMOKE = process.argv.includes('--v2-smoke');
const copilotWebPiloto = !V2_SMOKE && process.argv.includes('--copilot-shell-web');
const experimentoOrigem = require('./copilot-origem-experimental');
const origemExperimentalLigada = !V2_SMOKE && !copilotWebPiloto && process.argv.includes(experimentoOrigem.ARG);
const diagnosticoLoginCopilotLigado = !V2_SMOKE && !copilotWebPiloto && process.argv.includes('--copilot-diagnostico-login');
const fs = require('fs');
const configManager = require('./config-manager');
const pdfReader = require('./pdf-reader');
const extensaoAtualizador = require('./extensao-atualizador');
const extensaoInstalador = require('./extensao-instalador');
const extensaoSuperprocLocal = require('./extensao-superproc-local');
const modulosUsuario = require('./modulos-usuario');
const limpezaTotal = require('./limpeza-total');
const atualizacaoApp = require('./atualizacao-app');
const atualizacaoInstalador = require('./atualizacao-instalador');
const atualizacaoZip = require('./atualizacao-zip');
// Glossário na busca do leitor de PDF (acrescenta à barra do pdf.js, sem alterar a extensão)
require('./pdf-find-plus').install(app, pdfReader.isViewer, require('electron').webFrameMain);
const { clearRecoverableCache } = require('./cache-control');
const clearV2Cache = () => clearRecoverableCache(session.defaultSession, () => { pdfReader.clear(); });
const { nextTabId } = require('./tab-cycle');
const { nativeTabWindowHandler, shouldUnifyNativeTab } = require('./native-tab-window');
const pilhaRelacionados = require('./pilha-relacionados');
let ultimasEntradasBarra = []; // entradas da barra antes do colapso da pilha (para a lista por hover)
// Ao sair da página (beforeunload/clique no link) o eproc cobre a tela com o véu "Aguarde...". Quando o SuperPROC cancela essa
// navegação para abrir o processo relacionado em outra aba, a página de origem continua ali e o véu nunca sai (a aba "trava").
// Este script, executado na origem depois do cancelamento, esconde coberturas de tela cheia / com o texto "Aguarde" que não
// sejam do AZflow ou do SuperPROC e desfaz opacidade, cursor e bloqueio de cliques postos direto em <html>/<body>.
const SCRIPT_LIMPAR_VEU_DE_SAIDA = `(function(){
  var vw=innerWidth,vh=innerHeight,n=0,propria=/(^|[\\s_-])(az(flow)?|superproc)[-_]/i;
  var lista=[].slice.call(document.body?document.body.children:[]);
  [].slice.call(document.querySelectorAll('[id*="guarde" i],[class*="guarde" i],[id*="loading" i],[class*="loading" i],[id*="overlay" i],[class*="overlay" i],[id*="veil" i],[class*="veil" i]')).forEach(function(e){if(lista.indexOf(e)<0)lista.push(e);});
  lista.forEach(function(el){
    if(el.nodeType!==1||el===document.body)return;
    var rotulo=(el.id||'')+' '+(typeof el.className==='string'?el.className:'');
    if(propria.test(rotulo))return;
    var s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden'||(s.position!=='fixed'&&s.position!=='absolute'))return;
    var r=el.getBoundingClientRect();
    var cobre=r.width>=vw*0.7&&r.height>=vh*0.7;
    var aguarde=/aguarde/i.test((el.textContent||'').slice(0,80))&&r.width>0&&r.height>0;
    if(!cobre&&!aguarde)return;
    el.style.setProperty('display','none','important');el.setAttribute('data-superproc-veu-oculto','1');n++;
  });
  [document.documentElement,document.body].forEach(function(e){
    if(!e)return;
    if(e.style.opacity)e.style.opacity='';
    if(e.style.pointerEvents==='none')e.style.pointerEvents='';
    if(e.style.cursor==='wait'||e.style.cursor==='progress')e.style.cursor='';
  });
  return n;
})()`;
const larguraMenuPorLista = new Map(); // categoria + nomes dos itens -> largura medida do menu hover (uma coluna)
const pilhaTopoMemo = new Map(); // stackId -> chave da aba/grupo que estava à vista na pilha de relacionados
// Mistura de painéis na pilha de relacionados: stackId -> { esq: id da capa/editor à esquerda, dir: id da árvore à direita }.
// `dir2` (opcional) é a árvore dupla: duas árvores empilhadas à direita (50/50 na vertical). Só existe enquanto esquerda e direita são de processos diferentes ou há árvore dupla; clicar no número do processo (ou ciclar abas) desfaz.
const pilhaMix = new Map();
const { rememberEprocNavigationLinks } = require('./eproc-navigation');
const localizadoresSinal = require('./localizadores-sinal').criarSinalLocalizadores();
const { getRootNavigationTab, enforceCapaRoot, getProcessRole, resolverOrigemDaArvore, grausDoMesmoProcesso } = require('./process-tab-policy');
const openMode = require('./open-mode');
const { criarSegundoMonitor } = require('./second-screen');
const layoutGeometry = require('./layout-geometry');
const { criarColunaCopilot, URL_COPILOT } = require('./copilot-column');
const browserContextTools = require('./browser-context-tools');
const { createPrintToPdf } = require('./print-to-pdf');
const printToPdf = createPrintToPdf({
  owns: wc => tabs.some(tab => tab.view?.webContents === wc) ||
    [...panelViewPool.values()].some(entry => entry.view?.webContents === wc),
  getConfig: () => configManager.getDownloadsConfig(),
  getDirectory: config => config.downloadPath && fs.existsSync(config.downloadPath) ? config.downloadPath : app.getPath('downloads'),
  choosePath: async defaultPath => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar impressão como PDF', defaultPath,
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
    });
    return result.canceled ? null : result.filePath;
  },
  onSaved: (file, size) => recordCompletedDownload(file, size),
  onError: error => {
    console.warn('[SuperPROC] Falha ao salvar impressão:', error.message);
    dialog.showErrorBox('Salvar impressão como PDF', error.message);
  }
});
const { protectHostWindow, findFocusedUnifiedEditor } = require('./host-close-guard');
const spellcheck = require('./spellcheck');

// Definir identificador do aplicativo e nome para a barra de tarefas do Windows (eproc)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.superproc.v2');
}
app.setName('SuperPROC v2');
// Independent v2 profile; synthetic host tests never open the normal profile.
try {
  const profile = V2_SMOKE ? path.resolve(__dirname,'../.test-runs/host-'+Date.now()) : path.join(app.getPath('appData'), limpezaTotal.NOME_PERFIL);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData',profile);
} catch (err) {
  if (!V2_SMOKE) throw err;
}

// Legislação local: normas da biblioteca abrem em superproc-lei://norma/<slug> (servidas do disco, sem rede).
// O esquema precisa ser declarado antes de o app ficar pronto.
let legislacaoServico = null;
try { protocol.registerSchemesAsPrivileged([{ scheme: 'superproc-lei', privileges: { standard: true, secure: true, supportFetchAPI: true } }]); } catch (_) {}

/** Abre o catálogo de leis no painel lateral do acesso rápido (superproc-lei://catalogo/). */
function abrirCatalogoLeis() {
  if (!legislacaoServico) return;
  openSidePanel({ url: legislacaoServico.urlDoCatalogo, category: 'legislacao', title: 'Catálogo de leis', id: 'catalogo-leis' });
}

/** Últimas leis acessadas (coluna esquerda do menu da Legislação). Criado na primeira necessidade. */
let legislacaoRecentes = null;
function recentesDeLeis() {
  if (!legislacaoRecentes) {
    legislacaoRecentes = require('./legislacao/recentes').criarRecentes({ arquivo: path.join(app.getPath('userData'), 'legislacao', 'recentes.json') });
  }
  return legislacaoRecentes;
}
/** Registra uma lei aberta no painel. O catálogo em si não é uma lei: fica de fora. */
function registrarLeiRecente(url, nome, opcoes) {
  if (typeof url !== 'string' || !url || url.startsWith('superproc-lei://catalogo')) return;
  try { recentesDeLeis().registrar({ url, nome }, opcoes); } catch (e) { console.warn('[Legislação] histórico:', e.message); }
}

/** Primeira abertura da Legislação no dia: tenta atualizar em segundo plano; nas demais, não faz nada (ver conferencia.js). */
function conferirLegislacaoHoje() {
  if (!legislacaoServico || V2_SMOKE) return;
  legislacaoServico.tentarAtualizarHoje().then(r => {
    if (r.executou) console.log('[Legislação] conferência diária:', JSON.stringify(r.resultado));
  }).catch(e => console.warn('[Legislação] conferência diária falhou:', e.message));
}

function getBrowserIconPath() {
  const candidates = process.platform === 'win32' ? [
    path.join(__dirname, '..', 'ICO_BROWSER.ico'),
    path.join(__dirname, 'ICO_BROWSER.ico'),
    path.join(__dirname, '..', 'ico_browser.ico'),
    path.join(__dirname, 'ico_browser.ico'),
    path.join(__dirname, '..', 'ICO_BROWSER.png'),
    path.join(__dirname, 'ICO_BROWSER.png'),
    path.join(__dirname, 'ico_browser.png'),
    path.join(__dirname, '..', 'ico_browser.png'),
    path.join(__dirname, '..', 'extensao-superproc', 'icons', 'icon128.png')
  ] : [
    path.join(__dirname, '..', 'ICO_BROWSER.png'),
    path.join(__dirname, 'ICO_BROWSER.png'),
    path.join(__dirname, 'ico_browser.png'),
    path.join(__dirname, '..', 'ico_browser.png'),
    path.join(__dirname, '..', 'extensao-superproc', 'icons', 'icon128.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, '..', 'extensao-superproc', 'icons', 'icon128.png');
}


// Garantir instância única do aplicativo para evitar bloqueio de arquivos de cache, cookies e DB
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  // "Limpar todos os dados" pedido na sessão anterior: apaga o perfil agora, antes de qualquer leitura dele.
  if (!V2_SMOKE) { try { limpezaTotal.executarSePendente(app.getPath('appData'), app.getPath('userData')); } catch (err) { console.error('[Limpeza] Falha ao limpar os dados:', err); } }
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
// Janelas do sistema abertas por pedidos de janela nova (modos Simples/Integrada); fecham com a principal.
const popupWindows = new Set();
let screenEventsBound = false;
// Janela do segundo monitor (modo Dois monitores): abriga só a árvore/documentos do grupo ativo.
const secondScreen = criarSegundoMonitor({
  BrowserWindow,
  screen: { getAllDisplays: () => screen.getAllDisplays() },
  getMainWindow: () => mainWindow,
  displayOposto: (displays, bounds) => openMode.displayOposto(displays, bounds),
  log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} }
});
// Coluna fixa do Copilot (modo Integrada com Copilot): view própria da janela principal, fora da lista de abas.
const anfitriaoCopilot = require('./copilot-anfitriao-host');
const copilotShellModulo = require('./copilot-shell/shell-host');
const copilotShellCfg = V2_SMOKE || copilotWebPiloto || origemExperimentalLigada
  ? { ligado: false }
  : copilotShellModulo.configuracao({ argv: process.argv, existe: p => fs.existsSync(p), caminhoFlag: path.join(app.getPath('userData'), copilotShellModulo.ARQUIVO_FLAG) });
const copilotShellLigado = !!copilotShellCfg.ligado;
const anfitriaoLigado = !V2_SMOKE && !copilotWebPiloto && !origemExperimentalLigada && !copilotShellLigado && anfitriaoCopilot.estaLigado({ argv: process.argv, existe: p => fs.existsSync(p), caminhoFlag: path.join(app.getPath('userData'), anfitriaoCopilot.ARQUIVO_FLAG) });
const clientIdCopilot = process.env.SUPERPROC_COPILOT_CLIENT_ID;
const tenantCopilot = process.env.SUPERPROC_COPILOT_TENANT;
const copilotWebIntegrado = !V2_SMOKE && !origemExperimentalLigada && !copilotShellLigado && !anfitriaoLigado;
const criarConversaAposCarga = copilotWebIntegrado && process.argv.includes('--copilot-web-criar-conversa') &&
  clientIdCopilot && tenantCopilot;
const urlPilotoCopilot = process.argv.includes('--copilot-web-criar-conversa')
  ? URL_COPILOT
  : 'https://cr.m365copilotapp.svc.cloud.microsoft/';
const origensCopilotWeb = new Set([new URL(urlPilotoCopilot).origin, new URL(URL_COPILOT).origin]);
// Ponte do cr-host (copilot-shell/cr-bridge-host.js): dá à página do Copilot o canal de extensão para consultar abas, sempre
// sob o consentimento local. Ligada por padrão na coluna Web (decisão do responsável em 2026-11-19): instalou, o Copilot lê
// as abas. A ponte só entra na página depois do login; com `chrome.runtime` presente desde a carga a página do Copilot
// entra em laço de login (observado em 2026-11-19).
// Para desligar: `--copilot-sem-ponte` nesta execução, ou o arquivo `copilot-ponte.desligar` no perfil (vale em toda
// abertura — o app é instância única e uma segunda abertura com o argumento encerra). `--copilot-ponte` ficou sem efeito.
const ARQUIVO_PONTE_DESLIGADA = 'copilot-ponte.desligar';
const ponteDesligadaNoPerfil = () => { try { return fs.existsSync(path.join(app.getPath('userData'), ARQUIVO_PONTE_DESLIGADA)); } catch (_) { return false; } };
const ponteCopilotLigada = copilotWebIntegrado && !process.argv.includes('--copilot-sem-ponte') && !ponteDesligadaNoPerfil();
// Sonda de ações do Copilot no navegador (experimento, DESLIGADA por padrão e sem executar nada; ver tratarAcao em cr-bridge-host.js):
// --copilot-acoes=sonda nesta execução, ou o arquivo copilot-acoes.sonda no perfil.
const ARQUIVO_ACOES_SONDA = 'copilot-acoes.sonda';
const modoAcoesCopilot = () => { try { return process.argv.includes('--copilot-acoes=sonda') || fs.existsSync(path.join(app.getPath('userData'), ARQUIVO_ACOES_SONDA)) ? 'sonda' : 'desligado'; } catch (_) { return 'desligado'; } };
let adminCopilot = null; // AdminBroker (criado quando a coluna Web do Copilot sobe; ver ferramentas-host.js)
let sessaoOrigemExperimental = null;
const colunaCopilot = criarColunaCopilot({
  ...(origemExperimentalLigada ? { url: experimentoOrigem.URL_SITE } : copilotShellLigado ? { url: copilotShellModulo.urlDaPagina(), preload: copilotShellModulo.PRELOAD, fallbackUrl: URL_COPILOT } : anfitriaoLigado ? { url: anfitriaoCopilot.urlDaPagina(URL_COPILOT), preload: anfitriaoCopilot.PRELOAD, fallbackUrl: URL_COPILOT } : {}),
  ...(copilotWebIntegrado ? {
    url: urlPilotoCopilot === URL_COPILOT
      ? urlPilotoCopilot
      : pathToFileURL(path.join(__dirname, 'copilot-shell', 'entrada-web.html')).href,
    // Com sessão Microsoft já no perfil (cookie de login do Entra ID), a tela "Abrir o Copilot" é pulada e a coluna abre direto o
    // site; sem sessão, a tela de entrada continua. Só existência/validade do cookie, nunca o valor (ver copilot-shell/sessao-microsoft.js).
    ...(urlPilotoCopilot === URL_COPILOT ? {} : { resolverUrlInicial: (urlEntrada) => require('./copilot-shell/sessao-microsoft').urlInicialDaColuna({
      sessao: session.defaultSession, urlEntrada, urlCopilot: urlPilotoCopilot, log: (m) => { try { logDebugger('COPILOT_ENTRADA', m); } catch (_) {} } }) }),
    ...(ponteCopilotLigada ? { preload: path.join(__dirname, 'copilot-shell', 'cr-bridge-preload.js') } : {})
  } : {}),
  WebContentsView, Menu,
  observarColuna: criarConversaAposCarga ? (coluna) => require('./copilot-shell/conversa-web').observarConversaWeb({
    coluna, BrowserWindow, clientId: clientIdCopilot, tenant: tenantCopilot,
    log: (categoria, codigo) => logDebugger(categoria, codigo, { codigo })
  }) : undefined,
  removerContornoFoco: !copilotWebIntegrado,
  observarJanela: copilotWebIntegrado ? (resumo) => { if (observadorJanelasCopilot) observadorJanelasCopilot(resumo); } : null,
  observarPagina: copilotWebIntegrado ? (ev) => { if (observadorPaginaCopilot) observadorPaginaCopilot(ev); } : null,
  observarJanelaEstado: copilotWebIntegrado ? (aberta) => { if (aberta) loginCopilotAbertos++; else { loginCopilotAbertos = Math.max(0, loginCopilotAbertos - 1); ultimoLoginCopilotFechado = Date.now(); } } : null,
  getSession: () => origemExperimentalLigada ? (sessaoOrigemExperimental ||= session.fromPartition('copilot-origem-experimental')) : session.defaultSession,
  getUserAgent: () => CHROME_USER_AGENT,
  getMainWindow: () => mainWindow,
  abrirComoAba: (url) => setImmediate(() => createTab(url, false, { referrer: copilotWebIntegrado ? urlPilotoCopilot : URL_COPILOT })),
  diagnosticoNavegacao: diagnosticoLoginCopilotLigado,
  log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} }
});
// Teste de bancada: escuta passiva da coluna do Copilot (copilot-escuta.js), criada no whenReady; desligada por padrão.
let escutaCopilot = null;
let envioPdfCopilotRef = null; // atalho "PDF no Copilot" (F4); preenchido adiante
let fastCopilotRef = null; // preenchido quando o Fast Copilot é criado

// Copilot nos textos: ícone do Copilot na linha do cursor + menu de prompts (redator-linha.js), em qualquer página http/https das
// abas. O pedido vai à coluna do Copilot como CITAÇÃO + prompt pronto (redator-coluna.js) e a resposta volta à aba como proposta,
// aplicada só com o aceite da pessoa. Trava geral: --sem-redator ou o arquivo redator.desligar no perfil; fora do teste de fumaça
// (--v2-smoke). No uso normal quem liga/desliga é a chave "Copilot nos textos" do menu Modo de abertura.
const redatorLigado = () => { try { return !V2_SMOKE && !process.argv.includes('--sem-redator') && !fs.existsSync(path.join(app.getPath('userData'), 'redator.desligar')); } catch (_) { return false; } };
let colunaRedatorRef = null; // acesso à coluna do Copilot (preenchido junto do exportador de contexto)
const redatorLinhaMod = require('./redator-linha');
const redatorLinha = redatorLinhaMod.criarRedatorLinha({
  ponte: require('./redator-coluna').criarPonteColuna({
    getColunaWc: () => (colunaRedatorRef ? colunaRedatorRef.getWc() : null),
    mostrarColuna: () => { if (colunaRedatorRef) colunaRedatorRef.mostrar(); },
    aceitarDestino: (wc) => (colunaRedatorRef ? colunaRedatorRef.aceitar(wc) : false),
    log: (t, m) => { try { logDebugger(t, m); } catch (_) {} }
  }),
  guarda: redatorLinhaMod.criarGuardaPrompts({ fs, arquivo: () => path.join(app.getPath('userData'), 'redator-prompts.json') }),
  copiar: (texto) => { try { clipboard.writeText(texto); } catch (_) {} },
  log: (t, m) => { try { logDebugger(t, m); } catch (_) {} }
});
// O ícone depende da coluna: só fica ativo com a chave "Copilot nos textos" ligada E a coluna do Copilot ligada e visível.
// Quando uma dessas condições cai (chave desligada, coluna desligada ou escondida pelo botão da barra), o ícone sai de todas
// as abas na hora; quando voltam, ele é reinstalado.
const redatorAbas = new Set(); // webContents das abas acompanhadas
const redatorAtivo = () => { try { return redatorLigado() && configManager.getCopilotNosTextos() && colunaCopilotLigada() && !colunaCopilotOculta; } catch (_) { return false; } };
let redatorAtivoAnterior = null;
function sincronizarRedator() {
  const ativo = redatorAtivo();
  if (ativo === redatorAtivoAnterior) return;
  redatorAtivoAnterior = ativo;
  for (const wc of [...redatorAbas]) {
    if (!wc || wc.isDestroyed()) { redatorAbas.delete(wc); continue; }
    if (ativo) redatorLinha.injetar(wc); else redatorLinha.retirar(wc);
  }
  try { logDebugger('COPILOT_TEXTOS', ativo ? 'Ícone nos textos ativo' : 'Ícone nos textos inativo (chave desligada ou coluna do Copilot fechada)'); } catch (_) {}
}
function ligarRedatorNaAba(wc) {
  if (!redatorLigado() || !wc || wc.isDestroyed()) return;
  redatorAbas.add(wc); wc.once('destroyed', () => redatorAbas.delete(wc));
  const injetar = () => { if (redatorAtivo()) redatorLinha.injetar(wc); };
  wc.on('did-finish-load', injetar);
  wc.on('dom-ready', injetar);
  if (!wc.__spRedatorConsole) { wc.__spRedatorConsole = true; wc.on('console-message', (_e, _l, msg) => { if (redatorAtivo()) redatorLinha.aoConsole(wc, msg); }); }
}
let consentimentoCopilotRef = null; // motor de consentimento da ponte do cr-host (só com ponteCopilotLigada)
let cartaoConsentimentoRef = null;  // cartão "O Copilot deseja usar o conteúdo" sobre a coluna
let transporteCrRef = null;         // valida e encaminha os canais copilot-cr-*
let diagnosticoPonteCr = null;      // resumo da ponte para o menu de diagnóstico
let loginCopilotAbertos = 0;        // janelas de login da coluna abertas agora
let ultimoLoginCopilotFechado = 0;  // instante do último fechamento, para dar folga após o login
let observadorJanelasCopilot = null; // recebe o resumo de cada janela aberta pela coluna (login)
let agendarDiagnosticoColuna = () => {}; // grava <perfil>/copilot-ponte-diagnostico.json (nomes, rotas e contagens)
let observadorPaginaCopilot = null; // recebe console e recursos da página da coluna (diagnóstico)
let hostCloseGuard = null;
let tabs = [];
let activeTabId = null;
let azflowId = null;
let epryxId = null;
let superprocId = null;
let sessionLoginDone = false; // Há sessão do eproc ativa nesta execução do navegador

let sidePanel = {
  isOpen: false,
  mode: 'floating', // 100% modo balão (hover) flutuante sobreposto
  width: 500,
  minWidth: 340,
  url: '',
  initialUrl: '',
  category: 'jurisprudencia',
  title: '',
  headerView: null,
  edgeView: null,      // faixa de arrasto na borda esquerda, em toda a altura do painel (redimensiona a largura)
  contentView: null,   // aponta para a view ativa do pool
  activeKey: null,     // chave da view ativa no pool (id || url)
  isPinned: false
};

// Pool de abas ocultas do painel — cada item mantém sua própria WebContentsView
// por um tempo proporcional à categoria depois do último uso.
const PANEL_IDLE_TIMEOUTS = {
  jurisprudencia: 20 * 60 * 1000,
  legislacao: 10 * 60 * 1000,
  ferramentas: 10 * 60 * 1000
};
const panelCssKeys = new WeakMap();
const panelViewPool = new Map(); // Map<key, { view, idleTimer, lastInteraction, url, title, category }>

let mouseTrackInterval = null;
let panelEntered = false;
let panelOpenTime = 0;
let panelOutsideSince = null;
let isResizingPanel = false;

const TITLEBAR_HEIGHT = 35;

// --- SISTEMA DE DEBUGGER DE SESSÃO & EPROC ---
const DEBUG_LOG_PATH = path.join(app.getPath('userData'), 'superproc-debugger.log');

const diagnosticWriter = require('./diagnostic-writer').createWriter(DEBUG_LOG_PATH);
function logDebugger(category, message, details = null) {
  if (!configManager.isDebuggerEnabled()) return;
  const record = diagnosticWriter.write(category, details);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('debugger-event', record);
}

function getWebContentsTrace(webContentsId) {
  const tab = tabs.find(t => t.view && t.view.webContents && t.view.webContents.id === webContentsId);
  return {
    webContentsId: webContentsId || null,
    tabId: tab ? tab.id : null,
    groupId: tab ? (tab.groupId || null) : null,
    processRole: tab ? (tab.processRole || null) : null,
    active: !!(tab && tab.id === activeTabId)
  };
}

// --- JANELA DE BUSCA FLUTUANTE (FIND IN PAGE / CTRL+F) ---
let findWindow = null;
let findTarget = 'tab'; // 'tab' | 'panel'
let findTargetWebContents = null;
let isFindingOpening = false;
let findOpenGeneration = 0;
let findAnchor = null; // { view, target, naturalTop } — origem da posição da caixa de busca
const FIND_WIDTH_MAX = 520;
const FIND_HEIGHT_BASE = 60; // 38 (barra de busca) + 22 (opções/glossário)

// Busca nativa (Chromium) ou motor próprio (palavras inteiras): ver find/find-engine.js
const findController = createFindController({
  getTargetWebContents: () => getFindTargetWebContents(),
  sendResult: (result) => {
    if (findWindow && !findWindow.isDestroyed()) findWindow.webContents.send('find-results', result);
  }
});

// Calcula onde a caixa de busca deve ficar: canto superior direito da região pesquisada.
// Usa a área de conteúdo da janela principal (mesma origem das bounds das views).
function computeFindRect(anchor) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const content = mainWindow.getContentBounds();
  let bounds = null;
  try { bounds = anchor && anchor.view && anchor.view.getBounds ? anchor.view.getBounds() : null; } catch (_) {}
  const stable = !!(bounds && bounds.width >= 120 && bounds.height >= 24);
  const width = stable ? Math.min(FIND_WIDTH_MAX, Math.max(260, bounds.width - 16)) : FIND_WIDTH_MAX;
  // Sem bounds confiáveis, cai para o canto superior direito da janela inteira (nunca o esquerdo).
  const x = stable
    ? Math.max(content.x + bounds.x + 8, content.x + bounds.x + bounds.width - width - 8)
    : Math.max(content.x + 8, content.x + content.width - width - 8);
  let y = content.y + TITLEBAR_HEIGHT + 44;
  if (anchor && anchor.target === 'panel' && stable) y = content.y + Math.max(TITLEBAR_HEIGHT, bounds.y - 5);
  if (anchor && anchor.naturalTop && stable) y = content.y + bounds.y + Math.max(0, anchor.naturalTop - 4);
  return { stable, rect: { x: Math.round(x), y: Math.round(y), width: Math.round(width) } };
}

// Aplica a posição e confere o resultado: a primeira janela transparente do Windows pode ignorar o primeiro setBounds.
function applyFindRect(win, rect) {
  if (!win || win.isDestroyed() || !rect) return { ok: false, retried: false };
  const height = win.getBounds().height || FIND_HEIGHT_BASE;
  const target = { x: rect.x, y: rect.y, width: rect.width, height };
  win.setBounds(target);
  let now = win.getBounds();
  const off = (b) => Math.abs(b.x - target.x) > 1 || Math.abs(b.y - target.y) > 1 || Math.abs(b.width - target.width) > 1;
  if (!off(now)) return { ok: true, retried: false };
  win.setPosition(target.x, target.y);
  win.setSize(target.width, target.height);
  now = win.getBounds();
  return { ok: !off(now), retried: true };
}

function syncFindWindowPosition() {
  if (!findWindow || findWindow.isDestroyed() || !findWindow.isVisible() || !findAnchor) return;
  if (getFindTargetWebContents() !== (findAnchor.view && findAnchor.view.webContents)) return;
  const pos = computeFindRect(findAnchor);
  if (!pos || !pos.stable) return;
  const b = findWindow.getBounds();
  if (Math.abs(b.x - pos.rect.x) > 1 || Math.abs(b.y - pos.rect.y) > 1 || Math.abs(b.width - pos.rect.width) > 1) {
    applyFindRect(findWindow, pos.rect);
  }
}

function getOrCreateFindWindow(initialRect = null) {
  if (findWindow && !findWindow.isDestroyed()) return findWindow;

  // A janela já nasce na posição calculada: sem passagem pelo canto padrão (superior esquerdo).
  findWindow = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: true,
    show: false,
    skipTaskbar: true,
    resizable: false,
    x: initialRect ? initialRect.x : undefined,
    y: initialRect ? initialRect.y : undefined,
    width: initialRect ? initialRect.width : FIND_WIDTH_MAX,
    height: FIND_HEIGHT_BASE,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'find', 'preload-find.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  findWindow.loadFile(path.join(__dirname, 'find', 'find.html'));

  // Requisito: Se clicar em qualquer lugar que não seja no menu de busca, fecha automaticamente
  findWindow.on('blur', () => {
    if (isFindingOpening) return;
    closeFindWindow();
  });

  return findWindow;
}

function openFindWindow(target = 'tab', fromTabId = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  findTarget = target;
  const sourceTab = target === 'tab'
    ? tabs.find(t => t.id === (fromTabId || activeTabId))
    : null;
  const sourceView = target === 'panel' ? sidePanel.contentView : sourceTab?.view;
  findTargetWebContents = sourceView?.webContents || null;
  findAnchor = { view: sourceView || null, target, naturalTop: null };
  const anchor = findAnchor;
  const openedAt = Date.now();
  const first = computeFindRect(anchor);
  const win = getOrCreateFindWindow(first ? first.rect : null);
  const openGeneration = ++findOpenGeneration;
  const sourceWebContents = findTargetWebContents;

  // Na primeira abertura, uma view de painel ainda pode informar bounds transitórios
  // (0x0 ou da aba anterior). Só se mostra com bounds estáveis (ou após as tentativas).
  const positionFindWindow = (attempt = 0, reveal = false) => {
    if (openGeneration !== findOpenGeneration || win.isDestroyed() || getFindTargetWebContents() !== sourceWebContents) return;
    const pos = computeFindRect(anchor);
    if (!pos) return;
    if (!pos.stable && attempt < 6) {
      setTimeout(() => positionFindWindow(attempt + 1, reveal), 70);
      return;
    }
    let result = applyFindRect(win, pos.rect);
    if (reveal) {
      win.show();
      win.focus();
      // show() em janela nunca exibida pode redefinir a posição: confere e reaplica.
      const after = applyFindRect(win, pos.rect);
      result = { ok: after.ok, retried: result.retried || after.retried };
    }
    if (result.retried || !result.ok) {
      logDebugger('FIND_POSICAO', 'Posição da busca reaplicada', {
        quantidade: attempt + 1,
        decorridoMs: Date.now() - openedAt,
        ok: result.ok,
        estavel: pos.stable
      });
    }
  };

  isFindingOpening = true;
  // Atraso curto apenas na estreia: evita mostrar a janela antes do layout inicial do painel.
  setTimeout(() => positionFindWindow(0, true), 80);
  setTimeout(() => positionFindWindow(0, false), 240);
  setTimeout(() => positionFindWindow(0, false), 520);

  setTimeout(() => { isFindingOpening = false; }, 700);

  const sendShow = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('find-show', { target, isPanel: target === 'panel' });
    }
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', sendShow);
  } else {
    sendShow();
  }

  // CKEditor e árvore possuem cabeçalhos de alturas diferentes. Mede-se o
  // primeiro conteúdo útil dentro da view e reposiciona-se a caixa abaixo dele.
  if (sourceTab && ['editor', 'arvore'].includes(sourceTab.processRole) && sourceWebContents && !sourceWebContents.isDestroyed()) {
    const selector = sourceTab.processRole === 'editor'
      ? '.cke_contents, .cke_toolbox_main'
      : '#divArvore';
    sourceWebContents.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return Number.isFinite(rect.top) && rect.top > 0 ? Math.round(rect.top) : null;
    })()`, true).then((naturalTop) => {
      if (!naturalTop || findAnchor !== anchor) return;
      anchor.naturalTop = naturalTop;
      syncFindWindowPosition();
    }).catch(() => {});
  }
}

function getFindTargetWebContents() {
  if (findTargetWebContents && !findTargetWebContents.isDestroyed()) return findTargetWebContents;
  return findTarget === 'panel'
    ? (sidePanel.contentView && sidePanel.contentView.webContents)
    : ((tabs.find(t => t.id === activeTabId) || {}).view || {}).webContents || null;
}



function hasLiveWebContents(view) {
  try {
    return !!(view && view.webContents && !view.webContents.isDestroyed());
  } catch (_) {
    return false;
  }
}

function closeFindWindow() {
  if (!findWindow || findWindow.isDestroyed()) return;
  if (findWindow.isVisible()) {
    findWindow.hide();
  }

  // Limpar a mesma view que abriu a busca, mesmo que outra subaba tenha se
  // tornado ativa enquanto a caixa estava aberta (o controlador captura a view de forma síncrona).
  findController.stop().catch(() => {});
  findTargetWebContents = null;
  findAnchor = null;
}

// --- JANELA DO MENU HOVER (TOP-LEVEL SCOPE) ---
let hoverMenuWin = null;
let hoverMenuTimeout = null;
let activeHoverCategory = null;
let hoverSubWin = null; // submenu (à esquerda) dos grupos do menu hover
let hoverKeyboardMode = false;
let hoverTriggerId = null;
const PANEL_EDGE_WIDTH = 6; // largura da faixa de arrasto na borda esquerda do painel lateral
let hoverArraste = null; // true durante um arraste no menu hover (ver "ARRASTE NO MENU HOVER")
let ultimoPedidoHover = null; // último pedido de abertura do menu hover (para redesenhar após soltar)
let ultimoSubHover = null; // último submenu de grupo aberto
let hoverShowSeq = 0; // numera cada abertura do menu hover: continuações assíncronas de aberturas antigas são descartadas

function popupMenuState(triggerId, open) {
  if (triggerId && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('popup-menu-state', {triggerId,open});
}

function restorePopupTrigger(triggerId) {
  if (!triggerId || !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  mainWindow.focus();
  mainWindow.webContents.focus();
  mainWindow.webContents.send('popup-menu-focus', triggerId);
}

function focusToolbarFromContent(event, input) {
  if (input.type !== 'keyDown' || input.key !== 'F6' || input.control || input.meta || input.alt) return false;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  event.preventDefault();
  mainWindow.webContents.focus();
  mainWindow.webContents.send('toolbar-focus');
  return true;
}

function closeHoverAfterBlur() {
  setTimeout(() => {
    if (hoverArraste) return; // arrastando um item do menu: só fecha ao soltar
    if ([hoverMenuWin,hoverSubWin].some(w => w && !w.isDestroyed() && w.isVisible() && w.isFocused())) return;
    hideHoverMenu();
  },0);
}

function hideHoverSub() {
  if (hoverSubWin && !hoverSubWin.isDestroyed() && hoverSubWin.isVisible()) hoverSubWin.hide();
}

/** O mouse está sobre o menu hover ou sobre o submenu aberto? Os dois contam como uma peça só. */
function cursorOverHoverWindows() {
  const c = screen.getCursorScreenPoint();
  return [hoverMenuWin, hoverSubWin].some(w => {
    if (!w || w.isDestroyed() || !w.isVisible()) return false;
    const b = w.getBounds();
    return c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
  });
}

function hideHoverMenu(restoreFocus = false) {
  const trigger = hoverTriggerId;
  hoverKeyboardMode = false;
  hoverTriggerId = null;
  hoverShowSeq++; // uma abertura ainda em andamento não pode reabrir o menu depois de fechado
  hideHoverSub();
  if (hoverMenuTimeout) {
    clearTimeout(hoverMenuTimeout);
    hoverMenuTimeout = null;
  }
  activeHoverCategory = null;
  if (hoverMenuWin && !hoverMenuWin.isDestroyed() && hoverMenuWin.isVisible()) {
    hoverMenuWin.hide();
  }
  popupMenuState(trigger,false);
  if (restoreFocus) restorePopupTrigger(trigger);
}

function getOrCreateHoverMenuWindow() {
  if (hoverMenuWin && !hoverMenuWin.isDestroyed()) return hoverMenuWin;
  hoverMenuWin = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    width: 230,
    height: 380,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'hover-menu', 'preload-hover.js'),
      contextIsolation: true
    }
  });

  hoverMenuWin.on('blur', closeHoverAfterBlur);

  hoverMenuWin.loadFile(path.join(__dirname, 'hover-menu', 'hover-menu.html'));
  return hoverMenuWin;
}

function getOrCreateHoverSubWindow() {
  if (hoverSubWin && !hoverSubWin.isDestroyed()) return hoverSubWin;
  hoverSubWin = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    width: 230,
    height: 200,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'hover-menu', 'preload-hover.js'),
      contextIsolation: true
    }
  });
  hoverSubWin.on('blur', closeHoverAfterBlur);
  hoverSubWin.loadFile(path.join(__dirname, 'hover-menu', 'hover-menu.html'), { query: { sub: '1' } });
  return hoverSubWin;
}

// --- JANELA DO MENU CFG (TOP-LEVEL SCOPE) ---
let cfgMenuWin = null;
let isExtensionsUpdating = false;
// Geometria-base do menu CFG (sem a área do submenu Addons) para poder expandir/recolher a janela
const CFG_MENU_W = 290;
const CFG_FLYOUT_W = 240;
let cfgLayout = { x: 0, y: 0, h: 260, workArea: null, flyout: false };
// Última altura real informada pelo menu principal (sem submenu): a janela já abre nela, sem passar pela provisória.
let cfgUltimaAlturaMain = 260;
// Posição/largura da janela do menu: larga (cartão + área do submenu) cresce para a esquerda; sem espaço, para a direita.
function boundsDoCfg(largo) {
  const wa = cfgLayout.workArea;
  if (!largo) return { x: cfgLayout.x, w: CFG_MENU_W, side: 'left' };
  if (!wa || cfgLayout.x - CFG_FLYOUT_W >= wa.x) return { x: cfgLayout.x - CFG_FLYOUT_W, w: CFG_MENU_W + CFG_FLYOUT_W, side: 'left' };
  return { x: cfgLayout.x, w: CFG_MENU_W + CFG_FLYOUT_W, side: 'right' };
}
// Ao abrir o menu CFG o foco muda de janela e a janela principal pode emitir 'focus'/'blur' logo depois
// (visto no clique direito, que abre no mouseup). Nesse período curto o menu não deve ser fechado por isso.
let cfgShownAt = 0;
const CFG_GRACE_MS = 400;

// --- Conta Microsoft no menu CFG (ver browser/conta-microsoft.js) ---
// Criada sob demanda. Nenhuma rede é usada até o usuário clicar em Entrar ou existir um cache cifrado de login anterior.
let contaMsInst = null, contaMsRestaurada = false;
const CONTA_MS_VAZIA = Object.freeze({ status: 'sem-sessao', nome: '', usuario: '', tipo: '', licenca: '', foto: '', erro: '' });
function contaMs() {
  if (contaMsInst) return contaMsInst;
  const cm = require('./conta-microsoft');
  contaMsInst = cm.criarContaMicrosoft({
    clientId: process.env.SUPERPROC_ENTRA_CLIENT_ID || cm.CLIENT_ID_PADRAO,
    abrirBrowser: url => shell.openExternal(url),
    arquivoCache: path.join(app.getPath('userData'), 'conta-microsoft.bin'),
    cifra: { disponivel: () => safeStorage.isEncryptionAvailable(), cifrar: s => safeStorage.encryptString(s), decifrar: b => safeStorage.decryptString(b) }
  });
  // Canal próprio: reenviar o estado inteiro do menu fecharia os submenus abertos.
  contaMsInst.aoMudar(est => { if (cfgMenuWin && !cfgMenuWin.isDestroyed() && !cfgMenuWin.webContents.isDestroyed()) cfgMenuWin.webContents.send('cfg-conta-estado', est); });
  return contaMsInst;
}
// Login desligado por padrão (limites técnicos): o menu mostra o aviso e as opções desativadas; nada de rede, cache ou MSAL.
function contaMsAtiva() { return require('./conta-microsoft').loginAtivo(); }
function contaMsEstadoParaMenu() {
  if (!contaMsAtiva()) return { ...CONTA_MS_VAZIA, limitada: true };
  if (!V2_SMOKE && !contaMsRestaurada) {
    contaMsRestaurada = true;
    try { if (fs.existsSync(path.join(app.getPath('userData'), 'conta-microsoft.bin'))) contaMs().restaurar().catch(() => {}); } catch (_) { /* sem sessão anterior */ }
  }
  return contaMsInst ? contaMsInst.estado() : CONTA_MS_VAZIA;
}

function hideCfgMenu(restoreFocus = false) {
  if (cfgMenuWin && !cfgMenuWin.isDestroyed() && cfgMenuWin.isVisible()) {
    cfgMenuWin.hide();
  }
  popupMenuState('btn-cfg',false);
  if (restoreFocus) restorePopupTrigger('btn-cfg');
}

function getOrCreateCfgMenuWindow() {
  if (cfgMenuWin && !cfgMenuWin.isDestroyed()) return cfgMenuWin;
  cfgMenuWin = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    width: CFG_MENU_W,
    height: 260,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'cfg-menu', 'preload-cfg.js'),
      contextIsolation: true
    }
  });

  cfgMenuWin.on('blur', () => {
    const elapsed = Date.now() - cfgShownAt;
    if (cfgMenuWin && !cfgMenuWin.isDestroyed() && cfgMenuWin.isVisible() && elapsed < CFG_GRACE_MS) {
      // Foco roubado logo após abrir: devolve o foco em vez de fechar (um blur real depois ainda fecha)
      logDebugger('CFG_MENU_BLUR_IGNORADO', 'Menu CFG perdeu o foco logo após abrir; foco devolvido', { elapsedMs: elapsed });
      setTimeout(() => {
        if (cfgMenuWin && !cfgMenuWin.isDestroyed() && cfgMenuWin.isVisible()) cfgMenuWin.focus();
      }, 0);
      return;
    }
    if (cfgMenuWin && !cfgMenuWin.isDestroyed() && cfgMenuWin.isVisible()) {
      logDebugger('CFG_MENU_BLUR_FECHA', 'Menu CFG fechado por perda de foco', { elapsedMs: elapsed });
    }
    hideCfgMenu();
  });

  cfgMenuWin.loadFile(path.join(__dirname, 'cfg-menu', 'cfg-menu.html'));
  return cfgMenuWin;
}

let cfgSendState = null; // reenvia o estado ao menu CFG aberto (aceita campos extras, ex.: mensagemAtalho)
// --- ATUALIZAÇÃO DO PRÓPRIO SUPERPROC (GitHub Releases, manifesto assinado; ver atualizacao-app.js) ---
let atualizacaoStatus = { fase: 'ocioso', mensagem: '' };
let atualizacaoPayload = null, atualizacaoZipId = null, atualizacaoCaminhos = null, atualizacaoAplicadorIniciado = false;
// Só o aplicativo instalado (empacotado) pode se atualizar; em desenvolvimento a pasta do código nunca é trocada.
function caminhosAtualizacao() { if (!app.isPackaged) return null; try { return atualizacaoInstalador.caminhosDeInstalacao(process.execPath); } catch { return null; } }
function configAtualizacao() {
  const dir = path.join(__dirname, '..', 'config'), lerJson = (nome) => { try { return JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8')); } catch { return {}; } };
  const publica = lerJson('atualizacao.json');
  return { urlBase: publica.urlBase || null, repositorio: publica.repositorio || publica.pastaId || null, pastaId: publica.pastaId || publica.repositorio || null, chavePublicaPem: publica.chavePublicaPem || null, apiKey: null };
}
function estadoAtualizacaoParaMenu() {
  const estado = atualizacaoApp.lerEstado(app.getPath('userData'));
  return { ...atualizacaoStatus, mensagem: atualizacaoStatus.mensagem || ('Versão instalada: ' + app.getVersion()), versaoAtual: app.getVersion(), verificar: estado.verificar, automatica: estado.automatica };
}
function definirStatusAtualizacao(fase, mensagem, extra = {}) {
  atualizacaoStatus = { fase, mensagem, ...extra };
  if (cfgMenuWin && !cfgMenuWin.isDestroyed() && !cfgMenuWin.webContents.isDestroyed()) cfgMenuWin.webContents.send('cfg-app-update-status', estadoAtualizacaoParaMenu());
}
const atualizacaoOcupada = () => ['verificando', 'baixando', 'extraindo', 'instalando'].includes(atualizacaoStatus.fase);
const fetchAtualizacao = (u, o) => net.fetch(u, o);
async function verificarAtualizacaoApp() {
  if (atualizacaoOcupada()) return;
  const cfg = configAtualizacao(), userData = app.getPath('userData'), versaoAtual = app.getVersion();
  definirStatusAtualizacao('verificando', 'Consultando o servidor…');
  const r = await atualizacaoApp.verificar({ fetchFn: fetchAtualizacao, apiKey: cfg.apiKey, urlBase: cfg.urlBase, repositorio: cfg.repositorio, pastaId: cfg.pastaId, chavePublicaPem: cfg.chavePublicaPem, versaoAtual });
  if (r.estado === 'erro') { definirStatusAtualizacao('erro', r.mensagem); return; }
  const estado = atualizacaoApp.lerEstado(userData);
  atualizacaoApp.salvarEstado(userData, { ...estado, ultimaVerificacao: Date.now() });
  if (r.estado === 'atual') { atualizacaoPayload = null; definirStatusAtualizacao('atual', 'Você está na versão mais recente (' + versaoAtual + ').'); return; }
  atualizacaoPayload = r.payload; atualizacaoZipId = r.zipUrl || r.zipId;
  const mb = Math.max(1, Math.round(r.payload.zip.bytes / 1048576));
  if (r.exigeInstalacaoManual) { definirStatusAtualizacao('erro', 'A versão ' + r.payload.versao + ' exige instalação manual (pacote completo).', { versaoNova: r.payload.versao }); return; }
  const pronto = caminhosAtualizacao();
  if (pronto && fs.existsSync(pronto.novo)) {
    try { atualizacaoZip.conferirComposicao(pronto.novo, { versao: r.payload.versao, digest: r.payload.digest }); atualizacaoCaminhos = pronto; definirStatusAtualizacao('pronto', 'Versão ' + r.payload.versao + ' já baixada e verificada.', { versaoNova: r.payload.versao }); return; } catch { /* sobra inválida: baixa de novo */ }
  }
  definirStatusAtualizacao('disponivel', 'Nova versão ' + r.payload.versao + ' disponível (' + mb + ' MB).', { versaoNova: r.payload.versao });
  // Uma versão cuja instalação já falhou nesta máquina não é baixada sozinha de novo (continua disponível manualmente).
  if (estado.automatica && r.payload.versao !== estado.versaoIgnorada) baixarAtualizacaoApp().catch(() => {});
}
async function baixarAtualizacaoApp() {
  if (!atualizacaoPayload || atualizacaoOcupada()) return;
  const payload = atualizacaoPayload, cfg = configAtualizacao();
  const destino = path.join(app.getPath('userData'), 'atualizacao', payload.versao, 'SuperPROC.zip');
  let ultimo = -1;
  definirStatusAtualizacao('baixando', 'Baixando a versão ' + payload.versao + '…', { progresso: 0, versaoNova: payload.versao });
  try {
    await atualizacaoApp.baixarPacote({ fetchFn: fetchAtualizacao, apiKey: cfg.apiKey, payload, zipUrl: atualizacaoZipId, zipId: atualizacaoZipId, destino, onProgresso: (p) => {
      const pct = Math.floor(p.recebidos * 100 / p.total);
      if (pct !== ultimo) { ultimo = pct; definirStatusAtualizacao('baixando', 'Baixando a versão ' + payload.versao + '…', { progresso: pct, versaoNova: payload.versao }); }
    } });
    const caminhos = caminhosAtualizacao();
    if (!caminhos) { definirStatusAtualizacao('pronto', 'Versão ' + payload.versao + ' baixada e verificada (instalação indisponível em desenvolvimento).', { versaoNova: payload.versao }); return; }
    definirStatusAtualizacao('extraindo', 'Conferindo os arquivos da versão ' + payload.versao + '…', { versaoNova: payload.versao });
    const permissao = atualizacaoInstalador.verificarPermissao(caminhos.pai);
    if (!permissao.ok) throw new Error(permissao.motivo);
    await atualizacaoInstalador.prepararPacote({ zip: destino, versao: payload.versao, digest: payload.digest, caminhos });
    fs.rmSync(path.dirname(destino), { recursive: true, force: true }); // o zip não é mais necessário: a pasta nova já está conferida
    atualizacaoCaminhos = caminhos;
    definirStatusAtualizacao('pronto', 'Versão ' + payload.versao + ' baixada e verificada.', { versaoNova: payload.versao });
  } catch (err) { definirStatusAtualizacao('erro', String(err && err.message || err), { versaoNova: payload.versao }); }
}
// Entrega a troca ao aplicador externo (fora da pasta instalada). A versão é marcada como "ignorada" para o modo
// automático antes de iniciar: se a troca falhar, ela não é tentada de novo sozinha; se der certo, é inofensivo.
function iniciarAplicadorDeAtualizacao(reabrir) {
  const userData = app.getPath('userData'), estado = atualizacaoApp.lerEstado(userData);
  atualizacaoApp.salvarEstado(userData, { ...estado, versaoIgnorada: atualizacaoStatus.versaoNova || estado.versaoIgnorada });
  atualizacaoInstalador.iniciarAplicador({ caminhos: atualizacaoCaminhos, userData, reabrir });
  atualizacaoAplicadorIniciado = true;
}
async function instalarAtualizacaoApp() {
  if (!app.isPackaged) { definirStatusAtualizacao('pronto', 'A instalação só funciona no aplicativo instalado (não em desenvolvimento).', { versaoNova: atualizacaoStatus.versaoNova }); return; }
  if (!atualizacaoCaminhos || atualizacaoAplicadorIniciado) return;
  const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Atualizar o SuperPROC', message: 'Instalar a versão ' + (atualizacaoStatus.versaoNova || '') + ' agora?', detail: 'O SuperPROC será fechado e reaberto. As abas abertas serão fechadas. Seu login e suas configurações são mantidos, e a versão atual fica guardada para o caso de a nova não iniciar.', buttons: ['Instalar e reiniciar', 'Agora não'], defaultId: 0, cancelId: 1 });
  if (response !== 0) return;
  const versaoNova = atualizacaoStatus.versaoNova;
  try { iniciarAplicadorDeAtualizacao(true); } catch (err) { definirStatusAtualizacao('erro', 'Não foi possível iniciar a instalação: ' + String(err && err.message || err), { versaoNova }); return; }
  definirStatusAtualizacao('instalando', 'Fechando o SuperPROC para instalar…', { versaoNova });
  app.quit();
}
// Atualização automática: com a chave ligada e o pacote já conferido, a troca é feita ao fechar o SuperPROC (sem reabrir).
function aplicarAtualizacaoAoFechar() {
  if (!app.isPackaged || V2_SMOKE || atualizacaoAplicadorIniciado || atualizacaoStatus.fase !== 'pronto' || !atualizacaoCaminhos) return;
  if (!atualizacaoApp.lerEstado(app.getPath('userData')).automatica) return;
  iniciarAplicadorDeAtualizacao(false);
}
const MENSAGENS_FALHA_ATUALIZACAO = {
  NAO_FECHOU: 'A atualização foi adiada: o SuperPROC não fechou a tempo para a troca dos arquivos.',
  NAO_ATIVOU: 'Não foi possível ativar a versão nova; a versão anterior foi restaurada.',
  NAO_INICIOU: 'A versão nova não iniciou corretamente; a versão anterior foi restaurada.',
  ANTERIOR_NAO_REMOVIDA: 'Não foi possível limpar a cópia da versão anterior; a atualização foi adiada.'
};
// Ao iniciar: (1) se foi aberto pelo aplicador, confirma que iniciou bem (o aplicador desfaz a troca se não receber);
// (2) mostra, uma vez, o aviso deixado por uma troca que falhou ou foi desfeita.
function tratarPosAtualizacao() {
  if (!app.isPackaged || V2_SMOKE) return;
  const userData = app.getPath('userData'), marcador = atualizacaoInstalador.marcadorDosArgumentos(process.argv);
  // Só o arquivo esperado dentro do perfil: um argumento de linha de comando não escolhe onde gravar.
  if (marcador && path.resolve(marcador) === path.join(userData, 'atualizacao-confirmada.txt')) setTimeout(() => atualizacaoInstalador.confirmarInicializacao(marcador, app.getVersion()), 8000);
  const codigo = atualizacaoInstalador.consumirAvisoDeFalha(userData);
  if (codigo) setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Atualização do SuperPROC', message: MENSAGENS_FALHA_ATUALIZACAO[codigo] || 'A atualização não foi concluída.', detail: 'A versão anterior continua em uso. Detalhes técnicos em ' + path.join(userData, atualizacaoInstalador.ARQUIVO_LOG) }); }, 4000);
}
function agendarVerificacaoAtualizacaoApp() {
  if (V2_SMOKE || !app.isPackaged) return; // desenvolvimento e testes de fumaça não consultam a rede sozinhos
  const tentar = () => {
    if (atualizacaoOcupada() || !atualizacaoApp.deveVerificarAutomaticamente(atualizacaoApp.lerEstado(app.getPath('userData')), Date.now())) return;
    verificarAtualizacaoApp().catch(() => {});
  };
  setTimeout(tentar, 20000);
  setInterval(tentar, 60 * 60 * 1000).unref();
}

function showCfgMenu(coords) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideHoverMenu();
  const win = getOrCreateCfgMenuWindow();

  const [winX, winY] = mainWindow.getPosition();
  const [winW] = mainWindow.getSize();

  // coords.mode: 'main' (clique na engrenagem) ou 'dev' (botão direito: menu secreto de desenvolvedor)
  const mode = coords && coords.mode === 'dev' ? 'dev' : 'main';
  const menuW = CFG_MENU_W;
  // Altura provisória; o menu informa a altura real via 'cfg-layout' logo após receber o estado
  let menuH = mode === 'dev' ? 100 : cfgUltimaAlturaMain;

  let targetX = winX + (coords && typeof coords.x === 'number' ? coords.x : (winW - menuW - 10));
  let targetY = winY + (coords && typeof coords.y === 'number' ? coords.y : 40);

  const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
  const b = display.workArea;
  menuH = Math.min(menuH, b.height - 16);

  if (targetX + menuW > b.x + b.width) {
    targetX = b.x + b.width - menuW - 8;
  }
  if (targetX < b.x) targetX = b.x + 8;
  if (targetY + menuH > b.y + b.height) {
    targetY = b.y + b.height - menuH - 8;
  }

  cfgLayout = { x: Math.round(targetX), y: Math.round(targetY), h: menuH, workArea: b, flyout: mode === 'main', mode };
  // Menu principal já abre largo (espaço dos submenus), para não redimensionar ao passar o mouse.
  const inicial = boundsDoCfg(mode === 'main');
  win.setBounds({ x: inicial.x, y: cfgLayout.y, width: inicial.w, height: menuH });

  let firstState = true;
  const sendState = (extra = {}) => {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      const cfg = configManager.loadConfig();
      win.webContents.send('cfg-menu-state', {
        focusFirst: firstState && coords?.keyboard === true,
        atalhoColarPdf: configManager.getAtalhoColarPdf(),
        atalhoMinutaCopilot: configManager.getAtalhoMinutaCopilot(),
        atalhoFastCopilot: configManager.getAtalhoFastCopilot(),
        atalhoAlteracaoTexto: configManager.getAtalhoAlteracaoTexto(),
        ...extra,
        mode,
        debuggerEnabled: configManager.isDebuggerEnabled(),
        optionalFeaturesEnabled: cfg.optionalFeaturesEnabled !== false,
        extensionLoading: cfg.extensionLoading,
        // Ícones nativos (do manifest de cada extensão instalada); sem instalação o menu mantém o marcador provisório.
        extensionIcons: iconesDasExtensoes(),
        extensionInstalled: { superproc: !!dirSuperprocInstalada(), azflow: !!extensaoInstalador.pastaInstalada('azflow', app.getPath('userData')), epryx: !!extensaoInstalador.pastaInstalada('epryx', app.getPath('userData')) },
        modoAbertura: openMode.normalizarModo(cfg.modoAbertura),
        colunaCopilot: configManager.getColunaCopilot(),
        relacionadosEmPilha: configManager.getRelacionadosEmPilha(),
        copilotNosTextos: configManager.getCopilotNosTextos(),
        ...configManager.getLayoutPrefs(),
        doisMonitoresDisponivel: openMode.modoDisponivel('doisMonitores', screen.getAllDisplays()),
        isUpdating: isExtensionsUpdating,
        atualizacao: estadoAtualizacaoParaMenu(),
        conta: contaMsEstadoParaMenu()
      });
      firstState = false;
    }
  };

  cfgSendState = sendState;
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => sendState());
  } else {
    sendState();
  }

  cfgShownAt = Date.now();
  logDebugger('CFG_MENU_ABRIR', 'Menu CFG aberto', { mode });
  win.show();
  win.focus();
  popupMenuState('btn-cfg',true);
}

// --- JANELA DO MENU DOWNLOADS (POPUP FLUTUANTE EM PRIMEIRO PLANO) ---
let downloadsMenuWin = null;

function hideDownloadsMenu() {
  if (downloadsMenuWin && !downloadsMenuWin.isDestroyed() && downloadsMenuWin.isVisible()) {
    downloadsMenuWin.hide();
  }
}

function getOrCreateDownloadsMenuWindow() {
  if (downloadsMenuWin && !downloadsMenuWin.isDestroyed()) return downloadsMenuWin;
  downloadsMenuWin = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    width: 360,
    height: 340,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'downloads-menu', 'preload-downloads.js'),
      contextIsolation: true
    }
  });

  downloadsMenuWin.on('blur', () => {
    hideDownloadsMenu();
  });

  downloadsMenuWin.loadFile(path.join(__dirname, 'downloads-menu', 'downloads-menu.html'));
  return downloadsMenuWin;
}

function showDownloadsMenu(coords) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideCfgMenu();
  hideHistoryMenu();
  hideHoverMenu();

  const win = getOrCreateDownloadsMenuWindow();

  const [winX, winY] = mainWindow.getPosition();
  const [winW] = mainWindow.getSize();

  const menuW = 360;
  const menuH = 340;

  let targetX = winX + (coords && typeof coords.x === 'number' ? coords.x : (winW - menuW - 60));
  let targetY = winY + (coords && typeof coords.y === 'number' ? coords.y : 38);

  const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
  const b = display.workArea;

  if (targetX + menuW > b.x + b.width) targetX = b.x + b.width - menuW - 8;
  if (targetX < b.x) targetX = b.x + 8;
  if (targetY + menuH > b.y + b.height) targetY = b.y + b.height - menuH - 8;

  win.setPosition(Math.round(targetX), Math.round(targetY));
  win.setSize(menuW, menuH);

  if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('downloads-updated', { recent: configManager.getRecentDownloads() });
  }

  win.show();
  win.focus();
}

// --- JANELA DO MENU HISTÓRICO (DUPLO: URLS E PROCESSOS) ---
let historyMenuWin = null;

function hideHistoryMenu() {
  if (historyMenuWin && !historyMenuWin.isDestroyed() && historyMenuWin.isVisible()) {
    historyMenuWin.hide();
  }
}

function getOrCreateHistoryMenuWindow() {
  if (historyMenuWin && !historyMenuWin.isDestroyed()) return historyMenuWin;
  historyMenuWin = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    roundedCorners: false,
    transparent: true,
    hasShadow: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    width: 420,
    height: 480,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'history-menu', 'preload-history.js'),
      contextIsolation: true
    }
  });

  historyMenuWin.on('blur', () => {
    hideHistoryMenu();
  });

  historyMenuWin.loadFile(path.join(__dirname, 'history-menu', 'history-menu.html'));
  return historyMenuWin;
}

function showHistoryMenu(coords) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideCfgMenu();
  hideDownloadsMenu();
  hideHoverMenu();

  const win = getOrCreateHistoryMenuWindow();

  const [winX, winY] = mainWindow.getPosition();
  const [winW] = mainWindow.getSize();

  const menuW = 420;
  const menuH = 480;

  let targetX = winX + (coords && typeof coords.x === 'number' ? coords.x : (winW - menuW - 40));
  let targetY = winY + (coords && typeof coords.y === 'number' ? coords.y : 38);

  const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
  const b = display.workArea;

  if (targetX + menuW > b.x + b.width) targetX = b.x + b.width - menuW - 8;
  if (targetX < b.x) targetX = b.x + 8;
  if (targetY + menuH > b.y + b.height) targetY = b.y + b.height - menuH - 8;

  win.setPosition(Math.round(targetX), Math.round(targetY));
  win.setSize(menuW, menuH);

  if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('history-updated', configManager.getHistory());
  }

  win.show();
  win.focus();
}

let extOptionsWin = null;
let currentLoadedExt = null;

function hideExtensionOptions() {
  if (extOptionsWin && !extOptionsWin.isDestroyed() && extOptionsWin.isVisible()) {
    extOptionsWin.hide();
  }
}

let extOptionsShownAt = 0;
// opts.keepExt: não fecha o painel da extensão (perder o foco não é clique na janela principal).
// opts.aposFoco: evento de foco da janela principal; ignora o foco logo após abrir o painel.
function hideAllPopupMenus(opts = {}) {
  if (!opts.keepExt && !(opts.aposFoco && Date.now() - extOptionsShownAt < 500)) hideExtensionOptions();
  // 'focus'/'blur'/'move' da janela principal logo após abrir o menu CFG não podem fechá-lo
  if (Date.now() - cfgShownAt >= CFG_GRACE_MS) hideCfgMenu();
  else logDebugger('CFG_MENU_FECHAMENTO_ADIADO', 'Fechamento geral de popups ignorado para o menu CFG recém-aberto', { elapsedMs: Date.now() - cfgShownAt });
  hideDownloadsMenu();
  hideHistoryMenu();
  hideHoverMenu();
}

// Preservar a validação TLS do Chromium, inclusive em localhost.
// Certificados corporativos precisam de cadeia confiável; não ignorar erros globalmente.
// Desabilitar detecção de automação Chromium (evita detecção como BOT em WAF do TJSC)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Obter versão exata do Chromium em execução no Electron
const CHROME_VERSION = process.versions.chrome || '152.0.7977.130';

// User-Agent padrão idêntico ao Google Chrome real no Windows 10/11 x64
const CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
app.userAgentFallback = CHROME_USER_AGENT;

// Helpers para navegação compatíveis com Electron 30+ (evita warnings de canGoBack depreciado)
function canNavBack(wc) {
  if (!wc || wc.isDestroyed()) return false;
  if (wc.navigationHistory && typeof wc.navigationHistory.canGoBack === 'function') {
    return wc.navigationHistory.canGoBack();
  }
  return typeof wc.canGoBack === 'function' ? wc.canGoBack() : false;
}

function canNavForward(wc) {
  if (!wc || wc.isDestroyed()) return false;
  if (wc.navigationHistory && typeof wc.navigationHistory.canGoForward === 'function') {
    return wc.navigationHistory.canGoForward();
  }
  return typeof wc.canGoForward === 'function' ? wc.canGoForward() : false;
}

function navBack(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (wc.navigationHistory && typeof wc.navigationHistory.goBack === 'function') {
    wc.navigationHistory.goBack();
  } else if (typeof wc.goBack === 'function') {
    wc.goBack();
  }
}

function navForward(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (wc.navigationHistory && typeof wc.navigationHistory.goForward === 'function') {
    wc.navigationHistory.goForward();
  } else if (typeof wc.goForward === 'function') {
    wc.goForward();
  }
}

// A extensão SuperPROC viaja guardada no pacote e NÃO vem instalada: só vai para <userData>/extensoes-atualizadas/superproc
// (onde rodam as extensões, gravável) quando o usuário clica em Instalar. Sem verificação automática.
function raizDoPacote() { return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..'); }
function raizDaExtensao() { return path.join(raizDoPacote(), 'extensao-superproc'); }
function destinoSuperproc() { return path.join(app.getPath('userData'), 'extensoes-atualizadas', 'superproc'); }
function iconesDasExtensoes() {
  const { iconeDaExtensao } = require('./icone-extensao');
  const userData = app.getPath('userData');
  return {
    azflow: iconeDaExtensao(extensaoInstalador.pastaInstalada('azflow', userData)),
    epryx: iconeDaExtensao(extensaoInstalador.pastaInstalada('epryx', userData)),
    superproc: iconeDaExtensao(dirSuperprocInstalada()),
    pdf: iconeDaExtensao(path.join(raizDoPacote(), 'LEITORDEPDFCOMCAPACIDADEEMBEDDED'))
  };
}
function dirSuperprocInstalada() {
  const dir = destinoSuperproc();
  return fs.existsSync(path.join(dir, 'manifest.json')) && fs.existsSync(path.join(dir, '.origem.json')) ? dir : null;
}

// AZflow/Epryx não vêm no pacote: são instaladas pelo usuário (Chrome Web Store) em <userData>/extensoes-atualizadas.
// Devolve a extensão carregada, ou null se ainda não foi instalada.
async function loadBundledExtension(customSession, nome) {
  const dir = extensaoInstalador.pastaInstalada(nome, app.getPath('userData'));
  if (!dir) return null;
  const ext = await loadExtensionHelper(customSession, dir);
  console.log('[Extensões] ' + nome + ' carregada de', dir);
  return ext;
}

async function loadExtensionHelper(customSession, extPath) {
  if (customSession.extensions && typeof customSession.extensions.loadExtension === 'function') {
    return await customSession.extensions.loadExtension(extPath, { allowFileAccess: true });
  }
  return await customSession.loadExtension(extPath, { allowFileAccess: true });
}

function removeExtensionHelper(customSession, extId) {
  if (customSession.extensions && typeof customSession.extensions.removeExtension === 'function') {
    return customSession.extensions.removeExtension(extId);
  }
  return customSession.removeExtension(extId);
}

// Ativar/desativar extensões sem reiniciar: compara o desejado (configuração) com o que está carregado,
// carrega/remove na sessão e recarrega as páginas web abertas (conteúdo já injetado só some/aparece ao recarregar).
// As chamadas são serializadas para que alternar rápido não carregue a mesma extensão duas vezes.
let extensionApplyChain = Promise.resolve();
function applyExtensionLoading() {
  extensionApplyChain = extensionApplyChain.then(applyExtensionLoadingNow).catch((err) => {
    console.error('[Extensões] Falha ao aplicar o estado:', err);
    return [];
  });
  return extensionApplyChain;
}

async function applyExtensionLoadingNow() {
  const cfg = configManager.loadConfig();
  const master = cfg.optionalFeaturesEnabled !== false;
  const enabled = { superproc: false, azflow: false, epryx: false, pdf: true, ...cfg.extensionLoading };
  const want = (key) => master && enabled[key] !== false;
  const ses = session.defaultSession;
  const root = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
  const defs = {
    azflow: { nome: 'azflow', get: () => azflowId, set: (v) => { azflowId = v; } },
    epryx: { nome: 'epryx', get: () => epryxId, set: (v) => { epryxId = v; } },
    superproc: { dir: dirSuperprocInstalada(), get: () => superprocId, set: (v) => { superprocId = v; } }
  };
  const changed = [];

  for (const [key, def] of Object.entries(defs)) {
    const loaded = !!def.get();
    if (want(key) && !loaded) {
      if (!def.nome && !def.dir) { console.warn('[Extensões] ' + key + ' não instalada.'); continue; }
      try {
        const ext = def.nome ? await loadBundledExtension(ses, def.nome) : await loadExtensionHelper(ses, def.dir);
        if (!ext) { console.warn('[Extensões] ' + key + ' não instalada.'); continue; }
        def.set(ext.id);
        changed.push(key);
        console.log(`[Extensões] ${key} ativada na hora. ID:`, ext.id);
      } catch (err) { console.error(`[Extensões] Falha ao ativar ${key}:`, err); }
    } else if (!want(key) && loaded) {
      try {
        removeExtensionHelper(ses, def.get());
        def.set(null);
        changed.push(key);
        console.log(`[Extensões] ${key} desativada na hora.`);
      } catch (err) { console.error(`[Extensões] Falha ao desativar ${key}:`, err); }
    }
  }

  if (want('pdf') && !pdfReader.isLoaded()) {
    try {
      await pdfReader.load(loadExtensionHelper, true);
      changed.push('pdf');
      console.log('[Extensões] pdf ativado na hora.');
    } catch (err) { console.warn('[PDF Reader]', err.message); }
  } else if (!want('pdf') && pdfReader.isLoaded()) {
    try {
      pdfReader.unload(removeExtensionHelper);
      changed.push('pdf');
      console.log('[Extensões] pdf desativado na hora.');
    } catch (err) { console.error('[Extensões] Falha ao desativar pdf:', err); }
  }

  if (changed.length) reloadWebPagesAfterExtensionChange();
  return changed;
}

// Origens com dados das extensões: as páginas do eproc (onde os módulos gravam em localStorage/IndexedDB) e as próprias extensões.
// Só essas origens são limpas: os demais sites mantêm o armazenamento (podem guardar o login ali).
const ORIGENS_EPROC = ['https://eproc1g.tjsc.jus.br', 'https://eproc2g.tjsc.jus.br', 'https://eprocwebcon.tjsc.jus.br'];
async function limparDadosDasExtensoes() {
  const origens = [...ORIGENS_EPROC, ...[azflowId, epryxId, superprocId].filter(Boolean).map(id => 'chrome-extension://' + id)];
  for (const origin of origens) {
    try { await session.defaultSession.clearStorageData({ origin, storages: ['localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql'] }); }
    catch (err) { console.warn('[Limpeza] Falha ao limpar os dados de', origin, err && err.message); }
  }
}

// Instala a extensão SuperPROC guardada no pacote (cópia para o perfil) e já a ativa.
async function instalarSuperproc() {
  try {
    extensaoSuperprocLocal.espelhar({ fonte: raizDaExtensao(), destino: destinoSuperproc() });
    const cfg = configManager.loadConfig();
    cfg.extensionLoading = { ...cfg.extensionLoading, superproc: true };
    configManager.saveConfig(cfg);
    await applyExtensionLoading();
    return true;
  } catch (err) {
    await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Instalar extensão', message: 'Não foi possível instalar o SuperPROC.', detail: String(err && err.message || err) });
    return false;
  }
}

const NOMES_EXTENSAO_LOJA = { azflow: 'AZflow', epryx: 'Epryx' };
function dadosExtensoesLoja() { return JSON.parse(fs.readFileSync(path.join(__dirname, 'extensoes-patches.json'), 'utf8')); }
function opcoesJanelaTermosAzflow() {
  const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const width = Math.min(1100, area.width - 24), height = Math.min(850, area.height - 24);
  return { parent: mainWindow, width, height, x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2), autoHideMenuBar: true,
    backgroundColor: '#ffffff', icon: getBrowserIconPath() };
}

function prepararJanelaAzflow(win) {
  require('./azflow-onboarding').installAzflowOnboarding(win.webContents, {
    getExtensionId: () => azflowId,
    windowOptions: () => ({ ...opcoesJanelaTermosAzflow(), show: true }),
    onWindow: trackPopupWindow
  });
}

async function abrirTermosAzflowAposInstalacao() {
  const dir = extensaoInstalador.pastaInstalada('azflow', app.getPath('userData'));
  if (!dir || !fs.existsSync(path.join(dir, 'boas-vindas.html')) || !mainWindow || mainWindow.isDestroyed()) return false;

  const win = new BrowserWindow({
    ...opcoesJanelaTermosAzflow(), show: false,
    webPreferences: { session: session.defaultSession, nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  trackPopupWindow(win);
  prepararJanelaAzflow(win);
  try {
    await win.loadURL(`chrome-extension://${azflowId}/boas-vindas.html`);
    if (win.isDestroyed()) return false;
    win.show();
    return true;
  } catch (err) {
    if (!win.isDestroyed()) win.destroy();
    console.warn('[AZflow] Falha ao abrir os termos após a instalação:', err.message);
    return false;
  }
}

// Instala AZflow/Epryx da Chrome Web Store na pasta do perfil (AppData) quando o usuário pede, e já as ativa.
async function instalarExtensaoDaLoja(nome) {
  const rotulo = NOMES_EXTENSAO_LOJA[nome];
  const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Instalar extensão', message: 'Instalar ' + rotulo + '?',
    detail: 'O pacote oficial será baixado da Chrome Web Store, verificado e instalado na pasta do seu perfil (AppData), como em outros navegadores.',
    buttons: ['Instalar', 'Cancelar'], defaultId: 0, cancelId: 1 });
  if (response !== 0) return false;
  try {
    const r = await extensaoInstalador.instalar({ nome, userData: app.getPath('userData'), idLoja: dadosExtensoesLoja().idsLoja[nome], fetchFn: (u, o) => net.fetch(u, o), chrome: process.versions.chrome });
    const cfg = configManager.loadConfig();
    cfg.extensionLoading = { ...cfg.extensionLoading, [nome]: true };
    configManager.saveConfig(cfg);
    await applyExtensionLoading();
    if (nome === 'azflow' && !azflowId) throw new Error('O AZflow foi baixado, mas não carregou nesta sessão.');
    if (nome === 'azflow' && await abrirTermosAzflowAposInstalacao() && !r.patchesNaoPortados) return true;
    await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Instalar extensão', message: rotulo + ' ' + r.versao + ' instalada e ativada.',
      detail: r.patchesNaoPortados ? r.patchesNaoPortados + ' adaptação(ões) do SuperPROC não puderam ser aplicadas a esta versão; alguns recursos podem ficar limitados.' : '' });
    return true;
  } catch (err) {
    await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Instalar extensão', message: 'Não foi possível instalar ' + rotulo + '.', detail: String(err && err.message || err) });
    return false;
  }
}

function reloadWebPagesAfterExtensionChange() {
  const targets = tabs.map((t) => t?.view?.webContents);
  targets.push(sidePanel?.contentView?.webContents);
  for (const wc of targets) {
    try {
      // Só páginas web: páginas de extensão (ex.: leitor PDF) não existem mais/ainda pelo mesmo endereço.
      if (wc && !wc.isDestroyed() && /^https?:/i.test(wc.getURL())) wc.reload();
    } catch (_) { /* aba fechando */ }
  }
}

async function openContextualFind(wc, target, tabId) {
  try { if(await pdfReader.find(wc)) return; } catch (_) {}
  openFindWindow(target, tabId);
}

// Teste de fumaça (--v2-smoke): o perfil descartável recebe só a extensão SuperPROC, espelhada do pacote
// (extensao-superproc/), e o leitor de PDF embutido. AZflow e Epryx ficam desligadas: elas não existem mais no
// repositório (vêm da Chrome Web Store para o perfil do usuário) e o teste não pode depender de rede nem do perfil real.
function prepararExtensoesDoTeste() {
  if (!V2_SMOKE || !app.getPath('userData').includes('.test-runs')) return;
  try {
    extensaoSuperprocLocal.espelhar({ fonte: raizDaExtensao(), destino: destinoSuperproc() });
    const cfg = configManager.loadConfig();
    cfg.extensionLoading = { ...cfg.extensionLoading, superproc: true, azflow: false, epryx: false, pdf: true };
    configManager.saveConfig(cfg);
  } catch (err) { console.error('[Smoke] Falha ao preparar a extensão SuperPROC:', err); }
}

// --- PATCHES DE COMPATIBILIDADE PARA EXTENSÕES NO ELECTRON ---
async function loadInstalledExtensions() {
  const customSession = session.defaultSession;
  const startupConfig = configManager.loadConfig();
  if (startupConfig.optionalFeaturesEnabled === false) {
    console.log('[Extensões] Funções extras desativadas: nenhuma extensão será carregada.');
    return;
  }
  const enabled = startupConfig.extensionLoading || {};

  // 1. AZflow e Epryx: só carregam se o usuário as instalou (ver instalarExtensaoDaLoja).
  for (const nome of ['azflow', 'epryx']) {
    if (enabled[nome] !== true) { console.log('[Extensões] ' + nome + ' desativada.'); continue; }
    try {
      const ext = await loadBundledExtension(customSession, nome);
      if (!ext) { console.log('[Extensões] ' + nome + ' não instalada.'); continue; }
      if (nome === 'azflow') azflowId = ext.id; else epryxId = ext.id;
      console.log('✓ ' + nome + ' carregada. Extension ID:', ext.id);
    } catch (err) { console.error('Falha ao carregar ' + nome + ':', err); }
  }

  // 2. SuperPROC (Extensão)
  const superprocPath = dirSuperprocInstalada();
  if (enabled.superproc === true && superprocPath) {
    try {
      const spExt = await loadExtensionHelper(customSession, superprocPath);
      superprocId = spExt.id;
      console.log('✓ SuperPROC carregado com sucesso. Extension ID:', superprocId);
    } catch (err) {
      console.error('Falha ao carregar SuperPROC:', err);
    }
  }

}

// --- CRIAÇÃO DA JANELA PRINCIPAL ---
function createMainWindow() {
  const windowState = configManager.getWindowState();

  const windowOptions = {
    show: !V2_SMOKE,
    title: 'SuperPROC v2',
    width: windowState.width || 1366,
    height: windowState.height || 850,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    roundedCorners: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e2430',
    icon: getBrowserIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  // Se a posição anterior (x, y) foi salva, garantir que ainda é visível em algum monitor conectado
  if (typeof windowState.x === 'number' && typeof windowState.y === 'number') {
    try {
      const displays = screen.getAllDisplays();
      const isVisible = displays.some(display => {
        const b = display.bounds;
        return (
          windowState.x >= b.x - 100 &&
          windowState.x <= b.x + b.width - 100 &&
          windowState.y >= b.y - 100 &&
          windowState.y <= b.y + b.height - 100
        );
      });
      if (isVisible) {
        windowOptions.x = windowState.x;
        windowOptions.y = windowState.y;
      }
    } catch (_) {}
  }

  mainWindow = new BrowserWindow(windowOptions);
  if (!screenEventsBound) {
    screenEventsBound = true;
    for (const evento of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(evento, () => agendarReaplicacaoLayout(400));
    }
  }
  // A página da barra de título pode carregar depois do primeiro layout: reenvia o recuo quando terminar.
  mainWindow.webContents.on('did-finish-load', () => { try { enviarRecuoTitlebar(getLayoutAreas().conteudo.x, true); enviarEstadoColuna(true).catch(() => {}); } catch (_) {} });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F6' && !input.control && !input.meta && !input.alt) {
      event.preventDefault();
      const active = tabs.find(t => t.id === activeTabId);
      if (hasLiveWebContents(active?.view)) active.view.webContents.focus();
      return;
    }
    if (input.type === 'keyDown' && (input.control || input.meta) && !input.shift && !input.alt && String(input.key).toLowerCase() === 'l') {
      event.preventDefault();
      if (dialogBridge.show) dialogBridge.show('url');
      return;
    }
    if (input.type === 'keyDown' && (input.control || input.meta) && String(input.key).toLowerCase() === 'p') {
      event.preventDefault();
      const active = tabs.find(tab => tab.id === activeTabId);
      if (hasLiveWebContents(active?.view)) printToPdf.request(active.view.webContents);
    }
  });
  hostCloseGuard = protectHostWindow(mainWindow, () => {
    const editor = findFocusedUnifiedEditor(tabs, webContents.getFocusedWebContents());
    logDebugger('HOST_CLOSE_BLOCKED', 'Fechamento da janela principal bloqueado', {
      focusedEditorTabId: editor?.id || null
    });
    // Capture the ID before scheduling: focus can move to the capa afterwards.
    // Keep the host blocked even when no editor can be identified safely.
    if (editor) routePageCloseRequest(editor.id, 'host-close-focused-editor');
  });

  if (windowState.isMaximized) {
    if (!V2_SMOKE) mainWindow.maximize();
  }

  // Carrega o HTML da barra superior
  mainWindow.loadFile(path.join(__dirname, 'titlebar', 'titlebar.html'));

  // Debounce para salvar o estado da janela sem sobrecarregar o I/O de disco
  let saveWindowTimeout = null;
  function persistWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    let bounds = (typeof mainWindow.getNormalBounds === 'function')
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();
    configManager.saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: isMax
    });
  }

  function queuePersistWindowState() {
    if (saveWindowTimeout) clearTimeout(saveWindowTimeout);
    saveWindowTimeout = setTimeout(() => {
      persistWindowState();
    }, 400);
  }

  // Eventos de estado de janela
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: true });
    updateLayoutBounds();
    closeFindWindow();
    hideHoverMenu();
    hideAllPopupMenus();
    queuePersistWindowState();
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { isMaximized: false });
    updateLayoutBounds();
    closeFindWindow();
    hideHoverMenu();
    hideAllPopupMenus();
    queuePersistWindowState();
  });

  mainWindow.on('resize', () => {
    updateLayoutBounds();
    closeFindWindow();
    hideHoverMenu();
    hideAllPopupMenus();
    if (!mainWindow.isMaximized()) {
      queuePersistWindowState();
    }
  });

  mainWindow.on('move', () => {
    closeFindWindow();
    hideHoverMenu();
    hideAllPopupMenus();
    agendarReposicionarSegundoMonitor();
    if (!mainWindow.isMaximized()) {
      queuePersistWindowState();
    }
  });

  mainWindow.on('close', () => {
    persistWindowState();
  });

  mainWindow.on('focus', () => {
    closeFindWindow();
    hideHoverMenu();
    hideAllPopupMenus({ aposFoco: true });
  });

  mainWindow.on('blur', () => {
    // A troca para o menu nativo, por tecla ou mouse, não é um clique fora.
    setTimeout(() => {
      if ([hoverMenuWin,hoverSubWin].some(w => w && !w.isDestroyed() && w.isVisible() && w.isFocused())) return;
      hideHoverMenu();
      hideAllPopupMenus({ keepExt: true });
    },0);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const win of [...popupWindows]) { try { if (!win.isDestroyed()) win.destroy(); } catch (_) {} }
    popupWindows.clear();
    clearTimeout(reaplicarLayoutTimer); clearTimeout(reposicionarSegundoTimer);
    secondScreen.destruir();
    colunaCopilot.destruir();
    for(const tab of tabs)tab.isClosing=true;
    for(const tab of tabs)if(tab.view&&!tab.view.webContents.isDestroyed())tab.view.webContents.destroy();
    for(const key of [...panelViewPool.keys()])_destroyPoolEntry(key);
    if(sidePanel.headerView&&!sidePanel.headerView.webContents.isDestroyed())sidePanel.headerView.webContents.close();
    if(sidePanel.edgeView&&!sidePanel.edgeView.webContents.isDestroyed())sidePanel.edgeView.webContents.close();
    sidePanel.edgeView=null;
    stopPanelMouseTracking();
    tabs = [];
    activeTabId = null;
    if (findWindow && !findWindow.isDestroyed()) {
      findWindow.destroy();
      findWindow = null;
    }
    if (sidePanel.headerView) {
      sidePanel.headerView = null;
    }
    if (sidePanel.contentView) {
      sidePanel.contentView = null;
    }
    sidePanel.isOpen = false;
  });
}

// --- IDENTIFICAÇÃO E AGRUPAMENTO DE PROCESSOS (CAPA / EDITOR / ÁRVORE) ---
function extractProcessNumber(url, title) {
  if (url) {
    try {
      const u = new URL(url);
      const np = u.searchParams.get('num_processo') || u.searchParams.get('txtNumProcesso') || u.searchParams.get('numProcesso');
      if (np) {
        const digits = np.replace(/\D/g, '');
        if (digits.length >= 9) {
          return `${digits.slice(0, 7)}-${digits.slice(7, 9)}`;
        }
        const m = np.match(/\d{7}-\d{2}/);
        if (m) return m[0];
      }
    } catch (_) {}
    const mDigits = url.match(/\d{20}/);
    if (mDigits) {
      const d = mDigits[0];
      return `${d.slice(0, 7)}-${d.slice(7, 9)}`;
    }
  }
  if (title) {
    const m = title.match(/\d{7}-\d{2}/);
    if (m) return m[0];
    const mDigits = title.match(/\d{20}/);
    if (mDigits) {
      const d = mDigits[0];
      return `${d.slice(0, 7)}-${d.slice(7, 9)}`;
    }
  }
  return '';
}

function getProcessInfo(url, title) {
  if (!url) return null;
  const role = getProcessRole(url);
  if (!role) return null;
  const procNumber = extractProcessNumber(url, title);
  return { role, procNumber };
}

function updateTabProcessInfo(tabData) {
  if (!tabData) return;
  const info = getProcessInfo(tabData.url, tabData.title);
  if (info) {
    const previousRole = tabData.processRole;
    // Algumas rotas só revelam o novo número no título após carregar. Não
    // manter a árvore/editor do processo anterior junto dessa capa substituída.
    if (previousRole === 'capa' && info.role === 'capa' && tabData.groupId &&
        tabData.procNumber && info.procNumber && tabData.procNumber !== info.procNumber) {
      const companions = tabs.filter(t => t.groupId === tabData.groupId && t.id !== tabData.id);
      companions.forEach(t => closeTab(t.id));
      delete tabData.groupId;
      delete tabData.lastLeftTabId;
    }
    tabData.processRole = info.role;
    enforceCapaRoot(tabs, tabData, previousRole);
    tryGroupNativeTab(tabData);
    if (info.procNumber) {
      tabData.procNumber = info.procNumber;
      if (tabData.groupId) {
        tabs.filter(t => t.groupId === tabData.groupId).forEach(t => {
          if (!t.procNumber) t.procNumber = info.procNumber;
        });
      }
    }
  }
}

// Motivo pelo qual uma aba aberta por window.open NÃO foi juntada à aba unificada. Só diagnóstico (Modo
// Debugger): cada motivo vira uma categoria própria, registrada uma vez por aba/motivo, sem números de processo.
const groupSkipLogged = new WeakMap();
function logGroupSkip(tab, reason) {
  if (groupSkipLogged.get(tab) === reason) return;
  groupSkipLogged.set(tab, reason);
  logDebugger('TAB_GROUP_SKIP_' + reason, 'Aba nativa não agrupada', { webContentsId: tab.view?.webContents?.id });
}

function tryGroupNativeTab(tab) {
  if (tab.groupId || !tab.nativeSourceTabId || tab.nativeStandalone) return;
  let source = tabs.find(t => t.id === tab.nativeSourceTabId);
  if (!source) { logGroupSkip(tab, 'ORIGEM_FECHADA'); return; }
  const targetInfo = getProcessInfo(tab.url, tab.title);
  if (targetInfo?.role === 'arvore') {
    source = resolverOrigemDaArvore(tabs, source, tab.url);
    if (!source) { logGroupSkip(tab, 'ARVORE_SEM_CAPA_COMPATIVEL'); return; }
  }
  const sourceInfo = getProcessInfo(source.url, source.title);
  if (targetInfo?.role === 'capa') {
    tab.nativeStandalone = true;
    delete tab.nativeSourceTabId;
    logGroupSkip(tab, 'DESTINO_E_CAPA');
    return;
  }
  if (!targetInfo) { logGroupSkip(tab, 'DESTINO_SEM_PAPEL'); return; }
  if (!sourceInfo) { logGroupSkip(tab, source.processRole ? 'ORIGEM_SEM_PAPEL_NA_URL' : 'ORIGEM_SEM_PAPEL'); return; }
  if (targetInfo.role === sourceInfo.role) { logGroupSkip(tab, 'MESMO_PAPEL'); return; }
  if (targetInfo.procNumber && sourceInfo.procNumber && targetInfo.procNumber !== sourceInfo.procNumber) { logGroupSkip(tab, 'NUMERO_DIFERENTE'); return; }
  const groupId = source.groupId || ('grp_native_' + source.id);
  if (tabs.some(t => t.id !== tab.id && t.groupId === groupId && t.processRole === targetInfo.role)) { logGroupSkip(tab, 'PAPEL_JA_EXISTE_NO_GRUPO'); return; }
  source.groupId = groupId;
  source.processRole = sourceInfo.role;
  tab.groupId = groupId;
  tab.processRole = targetInfo.role;
  tab.procNumber = targetInfo.procNumber || sourceInfo.procNumber;
  delete tab.nativeSourceTabId;
  logDebugger('TAB_GROUP_JOINED', 'Aba nativa agrupada', { webContentsId: tab.view?.webContents?.id });
}

// Capa do processo: eproc `processo_selecionar` (sem acao_origem) ou título "Detalhes do Processo".
function isCapaProcesso(url, title) {
  try {
    const u = new URL(url);
    if (u.searchParams.get('acao') === 'processo_selecionar' && !u.searchParams.get('acao_origem')) return true;
  } catch { /* segue para o título */ }
  return /Detalhes do Processo/i.test(String(title || ''));
}

// Lê primeiro autor e réu da capa (a tabela de partes pode aparecer depois do load) e grava no
// histórico de processos, só se a gravação ainda não tiver partes.
function capturarPartesDaCapa(tabData, digits, tentativa = 0) {
  const delays = [0, 800, 2000, 4500];
  setTimeout(async () => {
    try {
      const wc = tabData?.view?.webContents;
      if (!wc || wc.isDestroyed()) return;
      const partes = await wc.executeJavaScript(PARTES_SCRIPT);
      if (partes && (partes.autor || partes.reu)) {
        if (configManager.setProcessParties(digits, partes) && historyMenuWin && !historyMenuWin.isDestroyed()) {
          historyMenuWin.webContents.send('history-updated', configManager.getHistory());
        }
        return;
      }
    } catch { /* página trocada ou destruída */ }
    if (tentativa + 1 < delays.length) capturarPartesDaCapa(tabData, digits, tentativa + 1);
  }, delays[tentativa]);
}

function recordTabHistory(tabData) {
  if (!tabData || !tabData.url) return;
  const url = tabData.url;
  if (url.startsWith('file:') || url.startsWith('about:') || url.includes('empty-tab.html')) return;

  const title = tabData.title || url;
  configManager.addUrlHistory({ url, title });

  // Número CNJ completo e validado; a política (sem repetição em sequência, mínimo de 1 h entre
  // gravações do mesmo processo) é aplicada em configManager.addProcessHistory.
  const digits = extrairCnj(url, title);
  if (digits) {
    configManager.addProcessHistory({ digits });
    if (isCapaProcesso(url, title)) capturarPartesDaCapa(tabData, digits);
  }

  if (historyMenuWin && !historyMenuWin.isDestroyed() && historyMenuWin.webContents) {
    historyMenuWin.webContents.send('history-updated', configManager.getHistory());
  }
}

// --- SESSÃO EPROC (HASH INTELIGENTE & LINKS RÁPIDOS) ---
const closedTabsHistory = [];
function tabSession(tab) { return tab?.view?.webContents?.session || session.defaultSession; }
function tabPage(tab) { return tab?.view?.webContents?.getURL() || tab?.url || configManager.loadConfig().homepage; }
function updateSessionEprocData(hash, homeHref, locHref, pageUrl, tabData) {
  if (!tabData) return;
  const links = sessionLinks.remember(tabSession(tabData), pageUrl, homeHref, locHref);
  tabData.eprocNavigationLinks = links;
}
function captureEprocHash(url, tabData) {
  if (!tabData) return;
  const ses = tabSession(tabData);
  if (sessionLinks.transition(ses, url)) {
    const origin = sessionLinks.origin(url);
    signedLinks.invalidate(ses, origin); // login/logout: os links assinados anteriores deixam de valer
    for (const tab of tabs) if (tabSession(tab) === ses && sessionLinks.origin(tabPage(tab)) === origin) delete tab.eprocNavigationLinks;
    sessionLoginDone = true;
    pdfReader.clear?.();
    return;
  }
  signedLinks.remember(ses, url); // só em memória, para reabrir itens do histórico com assinatura válida
  updateSessionEprocData('', '', '', url, tabData);
}

// --- REABERTURA DO HISTÓRICO COM ASSINATURA DA SESSÃO ATUAL ---
// O histórico persiste URLs sem hash. Para abrir um item: (1) link assinado já visto nesta sessão
// (memória); (2) busca rápida "Nº de processo" do próprio eproc, que devolve a capa já assinada.
// Nunca se monta um hash por conta própria.
const HISTORY_EPROC_ORIGIN = 'https://eproc1g.tjsc.jus.br';
const historySleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function historyActiveTab() { return tabs.find(t => t.id === activeTabId); }
function historyOrigin(tab) {
  return sessionLinks.origin(tabPage(tab)) || tabs.map(t => sessionLinks.origin(tabPage(t))).find(Boolean) || HISTORY_EPROC_ORIGIN;
}
function historyLoad(url, opts = {}) {
  const tab = historyActiveTab();
  if (opts.novaGuia) { createTab(url); return historyActiveTab(); }
  if (tab && tab.view && !tab.view.webContents.isDestroyed()) { tab.view.webContents.loadURL(url); return tab; }
  createTab(url);
  return historyActiveTab();
}
function historyWaitLoad(wc, timeout = 20000) {
  return new Promise(resolve => {
    const end = () => { clearTimeout(timer); wc.removeListener('did-finish-load', end); wc.removeListener('did-fail-load', end); resolve(); };
    const timer = setTimeout(end, timeout);
    wc.on('did-finish-load', end); wc.on('did-fail-load', end);
  });
}
function historyNotice(message, detail) {
  try { dialog.showMessageBox(mainWindow, { type: 'info', title: 'SuperPROC v2', message, detail, buttons: ['OK'] }); } catch (_) {}
}
function historyHome(tab, origin) { return sessionLinks.get(tabSession(tab), origin + '/eproc/').home || origin + '/eproc/'; }
async function openProcessFromHistory(procData, opts = {}) {
  const digits = normalizarCnj(procData && procData.digits) || normalizarCnj(procData && procData.procNumber);
  if (!digits) {
    historyNotice('O registro deste processo guarda só o número parcial.', 'Abra o processo novamente para que ele seja gravado com o número completo.');
    return;
  }
  const rotulo = formatarCnj(digits);
  let tab = historyActiveTab();
  const origin = historyOrigin(tab);
  const signed = signedLinks.getCover(tabSession(tab), origin, digits);
  if (signed) { historyLoad(signed, opts); return; }

  const noEproc = !opts.novaGuia && tab && tab.view && !tab.view.webContents.isDestroyed() && sessionLinks.origin(tabPage(tab)) === origin && !/acao=(?:login|logout)|\/(?:login|logout)\b/i.test(tabPage(tab));
  if (!noEproc) {
    tab = historyLoad(historyHome(tab, origin), opts);
    if (tab && tab.view && !tab.view.webContents.isDestroyed()) await historyWaitLoad(tab.view.webContents);
  }
  const wc = tab && tab.view && tab.view.webContents;
  for (let tentativa = 0; tentativa < 4 && wc && !wc.isDestroyed(); tentativa++) {
    let resultado = null;
    try { resultado = await wc.executeJavaScript(quickSearchScript(rotulo)); } catch (_) {}
    if (resultado && resultado.ok) return;
    await historySleep(700);
  }
  historyNotice(`Não foi possível abrir a capa do processo ${rotulo}.`, 'O eproc exige link assinado pela sessão atual. Entre no eproc, confira se a página inicial carregou e tente novamente.');
}
async function openUrlFromHistory(url, opts = {}) {
  let u; try { u = new URL(url); } catch (_) { return; }
  const origin = sessionLinks.origin(url);
  if (!origin) { historyLoad(url, opts); return; } // fora do eproc: abre direto
  const entry = (configManager.getHistory().urls || []).find(x => x.url === url);
  const precisaAssinatura = entry && typeof entry.assinada === 'boolean' ? entry.assinada : /\/controlador\.php$/i.test(u.pathname);
  if (!precisaAssinatura) { historyLoad(url, opts); return; }
  const tab = historyActiveTab();
  const signed = signedLinks.get(tabSession(tab), url);
  if (signed) { historyLoad(signed, opts); return; }
  const digits = digitosDaCapa(url) || (u.searchParams.get('acao') === 'processo_selecionar' ? extrairCnj(url, '') : '');
  if (digits) { await openProcessFromHistory({ digits }, opts); return; }
  // Sem link na memória desta sessão: usa o endereço assinado guardado (cifrado), como o histórico do Chrome.
  const guardada = configManager.getSignedHistoryUrl(url);
  if (guardada) { historyLoad(guardada, opts); return; }
  historyLoad(historyHome(tab, origin), opts);
  historyNotice('Este endereço do eproc exige a assinatura da sessão.', 'O histórico não guarda a assinatura (por segurança). Abri a página inicial do eproc; ao navegar até a página desejada, o endereço volta a abrir direto enquanto a sessão estiver ativa.');
}
// Link para copiar: o mais "vivo" possível (assinado nesta sessão > guardado cifrado > sem assinatura).
function historyLinkToCopy(payload) {
  const tab = historyActiveTab();
  if (payload.kind === 'process') {
    const digits = normalizarCnj(payload.procData && payload.procData.digits) || normalizarCnj(payload.procData && payload.procData.procNumber);
    if (!digits) return { text: '', signed: false };
    const origin = historyOrigin(tab);
    const signed = signedLinks.getCover(tabSession(tab), origin, digits);
    return signed ? { text: signed, signed: true } : { text: `${origin}/eproc/controlador.php?acao=processo_selecionar&num_processo=${digits}`, signed: false };
  }
  const url = String(payload.url || '');
  const signed = signedLinks.get(tabSession(tab), url) || configManager.getSignedHistoryUrl(url);
  return signed ? { text: signed, signed: true } : { text: url, signed: false };
}
async function historyItemAction(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false };
  const { action, kind } = payload;
  if (action === 'copy') {
    const link = historyLinkToCopy(payload);
    if (!link.text) return { ok: false };
    clipboard.writeText(link.text);
    return { ok: true, signed: link.signed };
  }
  const opts = { novaGuia: action === 'new-tab' };
  if (kind === 'process') await openProcessFromHistory(payload.procData || {}, opts);
  else if (payload.url) await openUrlFromHistory(String(payload.url), opts);
  return { ok: true };
}
// Os atalhos gerais usam a instância inicial do perfil. A outra instância
// continua acessível em abas de relacionados e mantém suas próprias assinaturas.
function origemEprocDoPerfil(ses = session.defaultSession) {
  return sessionLinks.profileOrigin(ses, configManager.loadConfig().homepage) || HISTORY_EPROC_ORIGIN;
}

function getEprocHomeUrl(tabData = tabs.find(t => t.id === activeTabId)) {
  const ses = tabSession(tabData);
  const inicio = origemEprocDoPerfil(ses) + '/eproc/';
  return sessionLinks.get(ses, inicio).home || inicio;
}

const SCRIPT_CAPTURA_LOCALIZADORES = (origem) => `(() => {
  if (location.origin !== ${JSON.stringify(origem)}) return false;
  const a = document.querySelector('#btn-meus-localizadores');
  if (!a?.href) return false;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname ||
      url.searchParams.get('acao') !== 'usuario_tipo_monitoramento_localizador_listar' ||
      !url.searchParams.get('hash')) return false;
  location.assign(url.href);
  return true;
})()`;

async function openLocalizadoresFromEmptyState() {
  const origem = origemEprocDoPerfil();
  const tab = createTab(getEprocHomeUrl());
  const wc = tab && tab.view && tab.view.webContents;
  if (!wc) return;
  await historyWaitLoad(wc);
  for (let tentativa = 0; tentativa < 6 && !wc.isDestroyed(); tentativa++) {
    let ok = false;
    try { ok = await wc.executeJavaScript(SCRIPT_CAPTURA_LOCALIZADORES(origem)); } catch (_) {}
    if (ok) return;
    await historySleep(700);
  }
  // Sem link assinado disponível, mantém a página inicial/login da instância escolhida.
}

async function extractAndStoreEprocSession(view) {
  if (!view || view.webContents.isDestroyed()) return;
  const currentUrl = view.webContents.getURL() || '';
  if (!currentUrl.includes('eproc')) return;

  try {
    const result = await view.webContents.executeJavaScript(`(() => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        let hash = urlParams.get('hash') || '';
        const btnHome = document.querySelector('#btn-home');
        const btnLoc = document.querySelector('#btn-meus-localizadores');
        const homeHref = btnHome ? btnHome.getAttribute('href') : '';
        const locHref = btnLoc ? btnLoc.getAttribute('href') : '';

        if (!hash && homeHref) {
          const m = homeHref.match(/hash=([a-f0-9]+)/i);
          if (m) hash = m[1];
        }
        if (!hash && locHref) {
          const m = locHref.match(/hash=([a-f0-9]+)/i);
          if (m) hash = m[1];
        }
        if (!hash) {
          const anyLink = document.querySelector('a[href*="hash="]');
          if (anyLink) {
            const m = anyLink.getAttribute('href')?.match(/hash=([a-f0-9]+)/i);
            if (m) hash = m[1];
          }
        }
        return { hash, homeHref, locHref };
      } catch (e) {
        return null;
      }
    })()`);

    if (result) {
      const tabData = tabs.find(t => t.view === view);
      updateSessionEprocData(result.hash, result.homeHref, result.locHref, currentUrl, tabData);
    }
  } catch (_) {}
}

function createEmptyStateTab() {
  const tabId = 'tab_empty_' + Date.now().toString(36);
  const emptyUrl = `file://${path.join(__dirname, 'empty', 'empty-tab.html')}`;

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'empty', 'preload-empty.js'),
      session: session.defaultSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });

  const tabData = {
    id: tabId,
    title: 'Início',
    url: emptyUrl,
    favicon: '',
    active: true,
    view: view,
    isEmptyState: true
  };

  setupTabViewEvents(view, tabData);
  tabs.push(tabData);

  view.webContents.loadFile(path.join(__dirname, 'empty', 'empty-tab.html'));

  activeTabId = tabId;
  if (mainWindow) {
    try {
      mainWindow.contentView.addChildView(view);
    } catch (e) {}
  }
  updateLayoutBounds();
  notifyTabsUpdated();
}

function undoCloseTab() {
  if (closedTabsHistory.length === 0) return false;
  const last = closedTabsHistory.pop();

  // Sempre uma aba nova e completa (user agent, sessão e preload das abas normais). Reaproveitar a view da tela
  // vazia (file://, sem user agent do Chrome) deixava a página do eproc lenta para carregar.
  // createTab já descarta a tela vazia.
  createTab(last.url, false, { title: last.title });
  return true;
}

function reloadTab(tabData) {
  if (!tabData || !tabData.view || tabData.view.webContents.isDestroyed()) return;
  const wc = tabData.view.webContents;
  try {
    wc.reload();
  } catch (err) {
    try {
      const u = tabData.url || wc.getURL();
      if (u) {
        if (tabData.lastLoadOptions) {
          wc.loadURL(u, tabData.lastLoadOptions);
        } else {
          wc.loadURL(u);
        }
      }
    } catch (_) {}
  }
}

function resolveGroupSplitTabs(activeTabInGroup) {
  const groupTabs = tabs.filter(t => t.groupId === activeTabInGroup.groupId);
  if (groupTabs.length <= 1) {
    return { leftTab: groupTabs[0] || activeTabInGroup, rightTab: null };
  }

  const capaTab = groupTabs.find(t => t.processRole === 'capa');
  const editorTab = groupTabs.find(t => t.processRole === 'editor');
  const arvoreTab = groupTabs.find(t => t.processRole === 'arvore');

  // Se Árvore existe: lado direito = Árvore! Lado esquerdo = Capa ou Editor conforme seleção
  if (arvoreTab) {
    let leftTab;
    if (activeTabInGroup.id === editorTab?.id) {
      leftTab = editorTab;
    } else if (activeTabInGroup.id === capaTab?.id) {
      leftTab = capaTab;
    } else {
      // Se a aba ativa for a própria Árvore, mantém no lado esquerdo o que foi selecionado anteriormente
      const rememberedId = activeTabInGroup.lastLeftTabId;
      leftTab = (rememberedId ? groupTabs.find(t => t.id === rememberedId) : null) || editorTab || capaTab || groupTabs[0];
    }
    return { leftTab, rightTab: arvoreTab };
  }

  // Se não tem Árvore (apenas Capa e Editor):
  if (capaTab && editorTab) {
    return { leftTab: capaTab, rightTab: editorTab };
  }

  // Divisão genérica (left / right)
  const leftGen = groupTabs.find(t => t.processRole === 'left') || groupTabs[0];
  const rightGen = groupTabs.find(t => t.processRole === 'right' && t.id !== leftGen.id) || groupTabs.find(t => t.id !== leftGen.id) || null;
  return { leftTab: leftGen, rightTab: rightGen };
}

// Plano de exibição do grupo da aba alvo. Clássico: esquerda/direita na janela principal (50/50).
// Dois monitores (só com monitor oposto disponível): capa/editor em 100% na principal e a
// árvore/documentos no segundo monitor.
// A pilha pode estar marcada só numa aba do grupo (a que a originou): as demais sub-abas herdam pelo groupId.
function stackIdDe(tab) {
  if (!tab) return null;
  if (tab.stackId) return tab.stackId;
  if (!tab.groupId) return null;
  const irma = tabs.find(g => g.groupId === tab.groupId && g.stackId);
  return irma ? irma.stackId : null;
}

function mixAtivoDaPilha(alvo) {
  const m = alvo && stackIdDe(alvo) ? pilhaMix.get(stackIdDe(alvo)) : null;
  if (!m || (alvo.id !== m.esq && alvo.id !== m.dir && alvo.id !== m.dir2)) return null;
  const esq = tabs.find(t => t.id === m.esq);
  const dir = tabs.find(t => t.id === m.dir);
  const dir2 = m.dir2 ? tabs.find(t => t.id === m.dir2) : null;
  return esq && dir && esq.view && dir.view ? { esq, dir, dir2: dir2 && dir2.view ? dir2 : null } : null;
}

// Clique num ícone (capa/editor/árvore) de um processo da pilha: só o painel correspondente muda.
// Capa/editor assumem o painel esquerdo; árvore assume o direito; o outro painel é preservado.
function cliqueSubabaNaPilha(tabId) {
  const alvo = tabs.find(t => t.id === tabId);
  const ativa = tabs.find(t => t.id === activeTabId);
  const stackId = stackIdDe(alvo);
  if (!stackId || !ativa || stackIdDe(ativa) !== stackId || !ativa.groupId || !alvo.groupId || getEffectiveOpenMode() === 'doisMonitores') { switchTab(tabId); return; }
  const atual = planoDeLayoutDoGrupo(ativa);
  const outroPainel = alvo.processRole === 'arvore' ? atual.esquerda : atual.direita;
  if (grausDoMesmoProcesso(tabs, alvo, outroPainel)) {
    pilhaMix.delete(stackId);
    switchTab(tabId);
    return;
  }
  let esq = atual.esquerda;
  let dir = atual.direita;
  let dir2 = atual.direita2 || null;
  if (!esq || !dir || dir.processRole !== 'arvore') { switchTab(tabId); return; }
  if (alvo.processRole === 'arvore') { dir = alvo; dir2 = null; } // clique numa árvore substitui o painel direito inteiro
  else if (alvo.processRole === 'capa' || alvo.processRole === 'editor') esq = alvo; // árvore dupla (se houver) é preservada
  else { switchTab(tabId); return; }
  if (!dir2 && esq.groupId === dir.groupId) pilhaMix.delete(stackId);
  else pilhaMix.set(stackId, dir2 ? { esq: esq.id, dir: dir.id, dir2: dir2.id } : { esq: esq.id, dir: dir.id });
  switchTab(alvo.id, { manterMix: true });
}

// "Abrir árvore dupla": com uma árvore já à direita, a árvore clicada (de outro processo) entra abaixo dela.
// Retorna o que o menu deve oferecer para a aba: 'abrir', 'fechar' ou null.
function opcaoArvoreDupla(tabId) {
  const alvo = tabs.find(t => t.id === tabId);
  const ativa = tabs.find(t => t.id === activeTabId);
  if (!alvo || alvo.processRole !== 'arvore' || !stackIdDe(alvo) || !ativa || stackIdDe(ativa) !== stackIdDe(alvo) || !ativa.groupId || getEffectiveOpenMode() === 'doisMonitores') return null;
  const pl = planoDeLayoutDoGrupo(ativa);
  if (!pl.esquerda || !pl.direita || pl.direita.processRole !== 'arvore') return null;
  if (pl.direita2) return (alvo.id === pl.direita.id || alvo.id === pl.direita2.id) ? 'fechar' : null;
  return alvo.id === pl.direita.id ? null : 'abrir';
}
function abrirArvoreDupla(tabId) {
  if (opcaoArvoreDupla(tabId) !== 'abrir') return;
  const alvo = tabs.find(t => t.id === tabId);
  const pl = planoDeLayoutDoGrupo(tabs.find(t => t.id === activeTabId));
  pilhaMix.set(stackIdDe(alvo), { esq: pl.esquerda.id, dir: pl.direita.id, dir2: alvo.id });
  switchTab(alvo.id, { manterMix: true });
}
// Desfaz a árvore dupla mantendo só a árvore clicada à direita.
function fecharArvoreDupla(tabId) {
  if (opcaoArvoreDupla(tabId) !== 'fechar') return;
  const alvo = tabs.find(t => t.id === tabId);
  const pl = planoDeLayoutDoGrupo(tabs.find(t => t.id === activeTabId));
  if (pl.esquerda.groupId === alvo.groupId) pilhaMix.delete(stackIdDe(alvo));
  else pilhaMix.set(stackIdDe(alvo), { esq: pl.esquerda.id, dir: alvo.id });
  switchTab(alvo.id, { manterMix: true });
}

function planoDeLayoutDoGrupo(alvo) {
  if (getEffectiveOpenMode() !== 'doisMonitores' || !secondScreen.disponivel()) {
    const mix = mixAtivoDaPilha(alvo);
    if (mix) return { esquerda: mix.esq, direita: mix.dir, direita2: mix.dir2, segundo: null };
  }
  if (getEffectiveOpenMode() === 'doisMonitores' && secondScreen.disponivel()) {
    const grupo = tabs.filter(t => t.groupId === alvo.groupId);
    const plano = openMode.planoDoisMonitores(grupo, alvo);
    if (plano) return { esquerda: plano.principal, direita: null, segundo: plano.segundo };
  }
  const { leftTab, rightTab } = resolveGroupSplitTabs(alvo);
  return { esquerda: leftTab, direita: rightTab, segundo: null };
}

// Mostra a view no monitor oposto ou, sem aba para ele, esconde a janela secundária.
function sincronizarSegundoMonitor(tab) {
  if (tab && hasLiveWebContents(tab.view)) {
    if (secondScreen.exibir(tab.view)) return;
  }
  secondScreen.ocultar();
}

// Remove a view de uma aba de qualquer janela (principal ou secundária) sem destruí-la.
function removeTabView(view) {
  if (!view) return;
  try { if (mainWindow) mainWindow.contentView.removeChildView(view); } catch (_) {}
  try { secondScreen.soltar(view); } catch (_) {}
}

// Reaplica o layout do grupo ativo (troca de modo, monitores conectados/removidos).
let reaplicarLayoutTimer = null;
function agendarReaplicacaoLayout(ms = 300) {
  clearTimeout(reaplicarLayoutTimer);
  reaplicarLayoutTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (tabs.some(t => t.id === activeTabId)) switchTab(activeTabId);
    else updateLayoutBounds();
  }, ms);
}

// A janela principal mudou de lugar: o monitor oposto pode ter mudado.
let reposicionarSegundoTimer = null;
function agendarReposicionarSegundoMonitor() {
  if (!secondScreen.estaAberta()) return;
  clearTimeout(reposicionarSegundoTimer);
  reposicionarSegundoTimer = setTimeout(() => {
    if (!secondScreen.reposicionar()) agendarReaplicacaoLayout(0);
  }, 300);
}

// Informa à barra de título o recuo à esquerda (largura da coluna do Copilot). Só reenvia quando muda.
let ultimoRecuoTitlebar = null;
function enviarRecuoTitlebar(recuo, forcar = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!forcar && recuo === ultimoRecuoTitlebar) return;
  ultimoRecuoTitlebar = recuo;
  try { mainWindow.webContents.send('titlebar-inset', { left: recuo }); } catch (_) {}
}

// Áreas da janela (coluna do Copilot e conteúdo) a partir de (0,0) da área de conteúdo. Fonte única do recuo esquerdo.
let colunaCopilotOculta = false; // só em memória: o Copilot sempre abre visível; o botão da barra alterna
let obterIconeColuna = async () => null; // preenchido onde o ícone oficial é carregado
let ultimoEstadoColuna = '';
async function enviarEstadoColuna(forcar = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const disponivel = colunaCopilotLigada();
  const visivel = !colunaCopilotOculta;
  const icone = disponivel ? await obterIconeColuna().catch(() => null) : null;
  const chave = JSON.stringify([disponivel, visivel, !!icone]);
  if (!forcar && chave === ultimoEstadoColuna) return;
  ultimoEstadoColuna = chave;
  try { mainWindow.webContents.send('copilot-coluna-state', { disponivel, visivel, icone, contextoIntegrado: copilotWebIntegrado }); } catch (_) {}
}
function getLayoutAreas(tamanho) {
  const [largura, altura] = tamanho || mainWindow.getContentSize();
  return layoutGeometry.areasDaJanela({
    largura, altura, topo: TITLEBAR_HEIGHT,
    colunaCopilot: colunaCopilotLigada(),
    copilotPct: configManager.getLayoutPrefs().copilotColunaPct,
    colunaVisivel: !colunaCopilotOculta
  });
}

// --- GERENCIAMENTO DE LAYOUT (ABAS E BALÃO FLUTUANTE HOVER) ---
function updateLayoutBounds() {
  if (!mainWindow) return;
  sincronizarRedator(); // a coluna do Copilot pode ter sido mostrada/ocultada: o ícone nos textos acompanha
  const [totalWidth, totalHeight] = mainWindow.getContentSize();
  const availableHeight = Math.max(0, totalHeight - TITLEBAR_HEIGHT);
  // Todas as coordenadas partem de (0,0) da área de conteúdo da janela: a coluna do Copilot (se houver)
  // fica à esquerda e o restante é a área das abas (ver layout-geometry.js).
  const areas = getLayoutAreas([totalWidth, totalHeight]);
  const area = areas.conteudo;
  const divisaoGrupo = layoutGeometry.dividirConteudo(area, configManager.getLayoutPrefs().arvorePct);
  const divisaoMeio = layoutGeometry.dividirConteudo(area, 50);
  colunaCopilot.aplicar(areas.copilot);
  if (cartaoConsentimentoRef) cartaoConsentimentoRef.reposicionar();
  enviarRecuoTitlebar(area.x);
  enviarEstadoColuna().catch(() => {});

  const activeTab = tabs.find(t => t.id === activeTabId);
  let segundoMonitorTab = null; // árvore/documentos do grupo ativo quando o modo Dois monitores está em uso

  // Aba ativa: suporta divisão esquerda/direita (percentual da árvore configurável) ou área inteira
  if (activeTab && activeTab.view) {
    if (activeTab.groupId) {
      const plano = planoDeLayoutDoGrupo(activeTab);
      const leftTab = plano.esquerda;
      const rightTab = plano.direita;
      segundoMonitorTab = plano.segundo;
      if (leftTab && rightTab && leftTab.view && rightTab.view && leftTab.id !== rightTab.id) {
        leftTab.view.setBounds(divisaoGrupo.esquerda);
        if (plano.direita2 && plano.direita2.view) {
          // Árvore dupla: as duas árvores dividem o painel direito em 50% na vertical.
          const d = divisaoGrupo.direita;
          const alto = Math.floor(d.height / 2);
          rightTab.view.setBounds({ x: d.x, y: d.y, width: d.width, height: alto });
          plano.direita2.view.setBounds({ x: d.x, y: d.y + alto, width: d.width, height: d.height - alto });
        } else {
          rightTab.view.setBounds(divisaoGrupo.direita);
        }
      } else if (leftTab && leftTab.view) {
        leftTab.view.setBounds(area);
      }
    } else if (activeTab.splitWith) {
      const partner = tabs.find(t => t.id === activeTab.splitWith);
      if (partner && partner.view) {
        const leftTab = (activeTab.splitRole === 'left') ? activeTab : partner;
        const rightTab = (activeTab.splitRole === 'right') ? activeTab : partner;
        // Divisão manual: segue ao meio (o percentual configurável vale para o grupo capa/árvore)
        leftTab.view.setBounds(divisaoMeio.esquerda);
        rightTab.view.setBounds(divisaoMeio.direita);
      } else {
        activeTab.view.setBounds(area);
      }
    } else {
      activeTab.view.setBounds(area);
    }
  }

  sincronizarSegundoMonitor(segundoMonitorTab);

  if (sidePanel.isOpen) {
    // Sanitização de largura para evitar NaN / bounds inválidos no Electron
    if (typeof sidePanel.width !== 'number' || isNaN(sidePanel.width) || sidePanel.width < 340) {
      sidePanel.width = 500;
    }
    const maxAllowedWidth = Math.max(340, Math.round(area.width * 0.85)); // nunca cobre a coluna do Copilot
    const effectivePanelWidth = Math.min(maxAllowedWidth, Math.max(340, Math.round(sidePanel.width)));
    sidePanel.width = effectivePanelWidth;

    const panelX = Math.round(totalWidth - effectivePanelWidth);
    const headerHeight = 32;
    const panelContentHeight = Math.max(0, availableHeight - headerHeight);

    // Header do balão flutuante
    if (sidePanel.headerView) {
      sidePanel.headerView.setBounds({
        x: panelX,
        y: TITLEBAR_HEIGHT,
        width: effectivePanelWidth,
        height: headerHeight
      });
    }

    // Conteúdo web do balão flutuante
    if (sidePanel.contentView) {
      sidePanel.contentView.setBounds({
        x: panelX,
        y: TITLEBAR_HEIGHT + headerHeight,
        width: effectivePanelWidth,
        height: panelContentHeight
      });
    }

    // Faixa de arrasto sobre a borda esquerda do conteúdo (a alça do cabeçalho continua no topo)
    if (sidePanel.edgeView && !sidePanel.edgeView.webContents.isDestroyed()) {
      sidePanel.edgeView.setBounds({
        x: panelX,
        y: TITLEBAR_HEIGHT + headerHeight,
        width: PANEL_EDGE_WIDTH,
        height: panelContentHeight
      });
    }
  }

  // Janela flutuante do editor: fica por cima de todas as views recém-reposicionadas
  if (janelaFlutuante) janelaFlutuante.sincronizar(origemDaJanelaFlutuanteVisivel(activeTab));

  // Mantém a caixa de busca aberta acompanhando a região pesquisada
  syncFindWindowPosition();

  // Sincroniza o gradiente do titlebar com a largura exata da página/navbar
  setImmediate(() => {
    updateTitlebarNavbarGradient();
  });
}

function updateActiveTabBounds() {
  updateLayoutBounds();
}

// --- MONITORAMENTO DE MOUSE: OCULTA O PAINEL AO SAIR DO HOVER (MANTÉM EM BACKGROUND) ---
function startPanelMouseTracking() {
  stopPanelMouseTracking();
  panelEntered = false;
  panelOpenTime = Date.now();
  panelOutsideSince = null;
  isResizingPanel = false;

  mouseTrackInterval = setInterval(() => {
    if (!sidePanel.isOpen || !mainWindow || mainWindow.isDestroyed()) {
      stopPanelMouseTracking();
      return;
    }

    if (sidePanel.isPinned || isResizingPanel) {
      panelOutsideSince = null;
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const [winX, winY] = mainWindow.getPosition();
    const [totalWidth, totalHeight] = mainWindow.getContentSize();

    const effectiveWidth = (typeof sidePanel.width === 'number' && !isNaN(sidePanel.width)) ? sidePanel.width : 500;
    const balloonLeft = winX + (totalWidth - effectiveWidth);
    const balloonRight = winX + totalWidth;
    const balloonTop = winY + TITLEBAR_HEIGHT;
    const balloonBottom = winY + totalHeight;

    const isInsideBalloon = (
      cursor.x >= balloonLeft - 6 &&
      cursor.x <= balloonRight + 6 &&
      cursor.y >= balloonTop - 6 &&
      cursor.y <= balloonBottom + 6
    );

    const topbarButtonsLeft = winX + totalWidth - 460;
    const topbarButtonsRight = winX + totalWidth - 100;
    const isInsideTopbarButtons = (
      cursor.x >= topbarButtonsLeft &&
      cursor.x <= topbarButtonsRight &&
      cursor.y >= winY - 10 &&
      cursor.y <= winY + TITLEBAR_HEIGHT + 10
    );

    let isInsideHoverMenu = false;
    if (hoverMenuWin && !hoverMenuWin.isDestroyed() && hoverMenuWin.isVisible()) {
      const hBounds = hoverMenuWin.getBounds();
      isInsideHoverMenu = (
        cursor.x >= hBounds.x - 8 &&
        cursor.x <= hBounds.x + hBounds.width + 8 &&
        cursor.y >= hBounds.y - 8 &&
        cursor.y <= hBounds.y + hBounds.height + 8
      );
    }

    const isInside = isInsideBalloon || isInsideTopbarButtons || isInsideHoverMenu;

    if (isInside) {
      panelEntered = true;
      panelOutsideSince = null;
    } else {
      if (panelEntered) {
        // Se o usuário já esteve no balão flutuante e moveu o cursor para fora:
        if (panelOutsideSince === null) {
          panelOutsideSince = Date.now();
        } else {
          // Quando o mouse sai nitidamente do balão (para o usuário trabalhar com o que estiver atrás dele):
          // Oculta o painel sem resetar (reset = false) para manter o conteúdo preservado em background
          const isFarOutside = cursor.x < balloonLeft - 20;
          const timeoutMs = isFarOutside ? 200 : 450;
          if (Date.now() - panelOutsideSince > timeoutMs) {
            closeSidePanel(false);
          }
        }
      } else {
        // Concede 2.5s de tolerância para o cursor mover do menu superior até o balão flutuante
        if (Date.now() - panelOpenTime > 2500) {
          closeSidePanel(false);
        }
      }
    }
  }, 50);
}

function stopPanelMouseTracking() {
  if (mouseTrackInterval) {
    clearInterval(mouseTrackInterval);
    mouseTrackInterval = null;
  }
  panelEntered = false;
  panelOutsideSince = null;
  isResizingPanel = false;
}


// ─── HELPERS DO POOL DE ABAS OCULTAS DO PAINEL ────────────────────────────────

function _panelPoolKey(id, url) {
  // Preferir o id explícito do item; cair na URL como chave secundária
  return (id && id.trim()) ? id.trim() : url;
}

function _clearPanelIdleTimer(entry) {
  if (entry && entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
}

function _getPanelIdleTimeout(entry) {
  return PANEL_IDLE_TIMEOUTS[entry?.category] || PANEL_IDLE_TIMEOUTS.jurisprudencia;
}

function _schedulePanelIdle(key) {
  const entry = panelViewPool.get(key);
  if (!entry) return;
  _clearPanelIdleTimer(entry);
  const timeout = _getPanelIdleTimeout(entry);
  entry.idleTimer = setTimeout(() => {
    _destroyPoolEntry(key);
  }, timeout);
}

function _destroyPoolEntry(key) {
  const entry = panelViewPool.get(key);
  if (!entry) return;
  _clearPanelIdleTimer(entry);
  if (hasLiveWebContents(entry.view)) {
    // Remover da janela se estiver anexada (não deve estar, mas por segurança)
    if (mainWindow) {
      try { mainWindow.contentView.removeChildView(entry.view); } catch (_) {}
    }
    try { entry.view.webContents.close(); } catch (_) {}
  }
  // O timer pode disparar depois de o painel já ter sido fechado. Nunca deixe
  // uma referência a uma WebContentsView destruída no estado do painel.
  if (sidePanel.contentView === entry.view) {
    sidePanel.contentView = null;
    if (sidePanel.activeKey === key) {
      sidePanel.activeKey = null;
      sidePanel.url = '';
      sidePanel.initialUrl = '';
    }
  }
  panelViewPool.delete(key);
  panelCssKeys.delete(entry.view.webContents);
  console.log('[PanelPool] View descartada.');
}

function _createPoolView(url) {
  const view = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      preload: path.join(__dirname, 'panel', 'preload-panel-content.js'),
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });

  printToPdf.attach(view.webContents);
  view.webContents.setUserAgent(CHROME_USER_AGENT);

  // Borda visual de pin
  view.webContents.on('dom-ready', () => {
    updatePanelPinStyle();
  });

  // Menu de contexto
  view.webContents.on('context-menu', (event, params) => {
    showPanelContextMenu(params);
  });

  // Atalhos de teclado
  view.webContents.on('before-input-event', (event, input) => {
    if (focusToolbarFromContent(event,input)) return;
    if (input.type !== 'keyDown') return;
    const isCtrl = input.control || input.meta;

    if (input.key === 'Escape') { event.preventDefault(); closeSidePanel(); return; }
    if (input.key === 'F5' || (isCtrl && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
      if (!view.webContents.isDestroyed() && retryPanelCache(view.webContents.getURL())) view.webContents.reload();
      return;
    }
    if (isCtrl && input.key.toLowerCase() === 'f') { event.preventDefault(); openContextualFind(view.webContents, 'panel'); return; }
  });

  // Resultados de busca
  view.webContents.on('found-in-page', (event, result) => {
    if (findWindow && !findWindow.isDestroyed() && findWindow.isVisible() && findTarget === 'panel' && getFindTargetWebContents() === view.webContents && findController.shouldForward(result)) {
      findWindow.webContents.send('find-results', result);
    }
  });

  // Abrir links externos como nova aba
  view.webContents.setWindowOpenHandler((details) => {
    const targetUrl = details.url;
    if (!targetUrl || targetUrl === 'about:blank' || targetUrl.includes('cloudflare.com') || targetUrl.includes('challenges')) {
      return { action: 'allow' };
    }
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      const parentUrl = (!view.webContents.isDestroyed()) ? view.webContents.getURL() : '';
      setImmediate(() => createTab(targetUrl, false, { referrer: details.referrer?.url || parentUrl }));
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  // Atualizar título no header do painel
  view.webContents.on('page-title-updated', (e, newTitle) => {
    // Norma aberta dentro do painel (pelo catálogo, por exemplo) também entra no histórico; o nome só vem do título se for nova.
    if (!view.webContents.isDestroyed() && view.webContents.getURL().startsWith('superproc-lei://norma/')) registrarLeiRecente(view.webContents.getURL(), newTitle, { manterNome: true });
    sidePanel.title = newTitle || sidePanel.title;
    notifyPanelHeaderData();
  });

  // Atualizar botões de navegação
  const updateNav = () => {
    if (sidePanel.headerView && !sidePanel.headerView.webContents.isDestroyed()) {
      sidePanel.headerView.webContents.send('panel-nav-state', {
        canGoBack: canNavBack(view.webContents),
        canGoForward: canNavForward(view.webContents)
      });
    }
  };
  view.webContents.on('did-navigate', updateNav);
  view.webContents.on('did-navigate-in-page', updateNav);

  const retryPanelCache = cacheRetry();
  // Retry em cache miss
  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -24 || errorDescription === 'ERR_CACHE_MISS') {
      if (!view.webContents.isDestroyed()) view.webContents.reload();
    }
  });

  view.webContents.loadURL(url);
  return view;
}

// ── Catálogo do painel para o Copilot ────────────────────────────────────────────────────────────────────
// Atalhos marcados "visíveis ao Copilot" aparecem na lista de abas da ponte como itens "sob demanda": o Copilot sabe que existem e,
// quando pede o conteúdo, a página é aberta numa view OCULTA do próprio pool do painel (sem aparecer na barra nem nas abas
// unificadas), lida e deixada para o descarte por inatividade de sempre. Se o item já está no pool (aberto antes no painel), a mesma
// view é reaproveitada. Ver context/tab-registry.js (contrato) e COPILOT-SHELL.md.
const catalogoPainelCopilot = (() => {
  const ROTULO = { jurisprudencia: 'Jurisprudência', legislacao: 'Legislação', ferramentas: 'Ferramentas' };
  const identidades = new Map(); // itemId -> Symbol estável (a ponte guarda a identidade ao listar; carregar a página não a muda)
  const avisos = new Map();      // itemId -> [aviso] da última carga
  const pendentes = new Map();   // itemId -> Promise (cargas simultâneas do mesmo item viram uma só)
  const TEMPO_CARGA_MS = 15000, ASSENTAR_MS = 1000;

  const vista = (itemId) => { const e = panelViewPool.get(itemId); return e && hasLiveWebContents(e.view) ? e : null; };

  function esperarCarga(wc, ms) {
    return new Promise((resolve) => {
      const pronto = () => !wc.isDestroyed() && !wc.isLoading() && !!wc.getURL() && wc.getURL() !== 'about:blank';
      if (wc.isDestroyed()) return resolve(false);
      if (pronto()) return resolve(true);
      let fim = false;
      const concluir = (v) => { if (fim) return; fim = true; clearTimeout(t); try { wc.removeListener('did-stop-loading', aoParar); wc.removeListener('destroyed', aoDestruir); } catch (_) {} resolve(v); };
      const aoParar = () => { if (pronto()) concluir(true); };
      const aoDestruir = () => concluir(false);
      const t = setTimeout(() => concluir(false), ms);
      wc.on('did-stop-loading', aoParar); wc.once('destroyed', aoDestruir);
    });
  }

  async function carregar(itemId) {
    const link = configManager.encontrarLink(itemId);
    if (!link || link.copilot !== true) throw Error('item fora do catálogo');
    let entry = vista(itemId);
    const nova = !entry;
    if (!entry) {
      // Sem expulsar outros itens do pool (o limite do painel vale para o que a pessoa abre; este item some sozinho por inatividade).
      const view = _createPoolView(link.url);
      entry = { view, idleTimer: null, lastInteraction: Date.now(), url: link.url, title: link.nome, category: configManager.normalizeCategory(link.categoria) };
      panelViewPool.set(itemId, entry);
    }
    _clearPanelIdleTimer(entry); entry.lastInteraction = Date.now();
    const wc = entry.view.webContents;
    const terminou = await esperarCarga(wc, TEMPO_CARGA_MS);
    const lista = [];
    if (!terminou) lista.push('CONTENT_EXTRACTION_TIMEOUT'); // leitura parcial: o ContextBroker marca truncated
    else if (nova) await new Promise((r) => setTimeout(r, ASSENTAR_MS)); // páginas que montam o texto por script logo após o load
    try { if (!wc.isDestroyed() && await wc.executeJavaScript(`!!document.querySelector('input[type="password"]')`, false)) lista.push('PAGE_REQUIRES_LOGIN'); } catch (_) { /* sem verificação */ }
    avisos.set(itemId, lista);
    if (sidePanel.activeKey !== itemId) _schedulePanelIdle(itemId); // visível no painel: o descarte só conta quando ele sair de lá
    return wc;
  }

  return {
    listar: () => configManager.listarLinksCopilot().map((l) => ({ itemId: l.id, titulo: (ROTULO[l.categoria] || 'Painel') + ': ' + l.nome, url: l.url, categoria: l.categoria })),
    view: (itemId) => { const e = vista(itemId); return e ? e.view.webContents : null; },
    identidade: (itemId) => { if (!identidades.has(itemId)) identidades.set(itemId, Symbol(itemId)); return identidades.get(itemId); },
    avisos: (itemId) => avisos.get(itemId) || [],
    materializar: (itemId) => {
      if (!pendentes.has(itemId)) pendentes.set(itemId, carregar(itemId).finally(() => pendentes.delete(itemId)));
      return pendentes.get(itemId);
    }
  };
})();

function openSidePanel({ url, category = 'jurisprudencia', title = '', id = '' }) {
  if (!mainWindow || !url) return;
  // Abrir uma norma local (menu ou atalho) também conta como "abrir a Legislação" no dia.
  if (typeof url === 'string' && url.startsWith('superproc-lei://')) conferirLegislacaoHoje();

  const normCategory = configManager.normalizeCategory(category);
  if (normCategory === 'legislacao') registrarLeiRecente(url, title);
  const key = _panelPoolKey(id, url);
  const wasClosed = !sidePanel.isOpen;

  if (!panelViewPool.has(key)) {
    const idle = [...panelViewPool].filter(([k]) => k !== sidePanel.activeKey).sort((a,b) => a[1].lastInteraction - b[1].lastInteraction);
    while (panelViewPool.size >= LIMITS.panels && idle.length) _destroyPoolEntry(idle.shift()[0]);
  }
  // ── 1. Obter ou criar a view do pool ───────────────────────────────────────
  let entry = panelViewPool.get(key);

  if (!entry || !hasLiveWebContents(entry.view)) {
    // Primeira vez ou view morreu — criar nova e carregar a URL
    const view = _createPoolView(url);
    entry = { view, idleTimer: null, lastInteraction: Date.now(), url, title: title || url, category: normCategory };
    panelViewPool.set(key, entry);
    console.log('[PanelPool] Nova view criada.');
  } else {
    // View já existe — só cancela o timer de idle, sem recarregar
    _clearPanelIdleTimer(entry);
    entry.lastInteraction = Date.now();
    entry.category = normCategory;
    if (title) entry.title = title;
    console.log('[PanelPool] View reutilizada.');
  }

  // ── 2. Se havia outra view ativa, desanexar sem destruir ──────────────────
  if (sidePanel.contentView && sidePanel.contentView !== entry.view && mainWindow) {
    try { mainWindow.contentView.removeChildView(sidePanel.contentView); } catch (_) {}
  }

  // ── 3. Atualizar o estado do painel ───────────────────────────────────────
  const prevKey = sidePanel.activeKey;
  sidePanel.contentView = entry.view;
  sidePanel.activeKey   = key;
  sidePanel.url         = url;
  sidePanel.initialUrl  = url;
  sidePanel.category    = normCategory;
  sidePanel.title       = entry.title;
  sidePanel.mode        = 'floating';
  sidePanel.width       = configManager.getCategoryWidth(normCategory);

  // Ao trocar de item no painel, a view anterior fica em segundo plano e passa
  // a contar seu próprio prazo de descarte.
  if (prevKey && prevKey !== key) _schedulePanelIdle(prevKey);

  // ── 4. Criar headerView se necessário ─────────────────────────────────────
  if (!sidePanel.headerView || sidePanel.headerView.webContents.isDestroyed()) {
    sidePanel.headerView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'panel', 'preload-panel-header.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    sidePanel.headerView.webContents.once('dom-ready', notifyPanelHeaderData);
    sidePanel.headerView.webContents.loadFile(path.join(__dirname, 'panel', 'panel-header.html'));
    sidePanel.headerView.webContents.on('context-menu', () => showPanelContextMenu());
  }

  // Borda arrastável (toda a altura do painel): transparente, por cima do conteúdo
  if (!sidePanel.edgeView || sidePanel.edgeView.webContents.isDestroyed()) {
    sidePanel.edgeView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'panel', 'preload-panel-edge.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    try { sidePanel.edgeView.setBackgroundColor('#00000000'); } catch (_) { /* fundo opaco: só estética */ }
    sidePanel.edgeView.webContents.loadFile(path.join(__dirname, 'panel', 'panel-edge.html'));
  }

  // ── 5. Anexar views à janela principal ────────────────────────────────────
  if (wasClosed) {
    try { mainWindow.contentView.removeChildView(sidePanel.headerView); } catch (_) {}
    try { mainWindow.contentView.removeChildView(sidePanel.contentView); } catch (_) {}
  }
  try { mainWindow.contentView.removeChildView(sidePanel.edgeView); } catch (_) {}
  try { mainWindow.contentView.addChildView(sidePanel.headerView); } catch (_) {}
  try { mainWindow.contentView.addChildView(sidePanel.contentView); } catch (_) {}
  try { mainWindow.contentView.addChildView(sidePanel.edgeView); } catch (_) {} // por último: fica por cima do conteúdo

  sidePanel.isOpen = true;
  updateLayoutBounds();
  updatePanelPinStyle();

  if (!sidePanel.contentView.webContents.isDestroyed()) {
    sidePanel.contentView.webContents.focus();
  }

  notifyPanelHeaderData();

  startPanelMouseTracking();
}



function toggleSidePanelPin() {
  sidePanel.isPinned = !sidePanel.isPinned;
  updatePanelPinStyle();
}

function updatePanelPinStyle() {
  const wc = sidePanel.contentView?.webContents;
  if (wc && !wc.isDestroyed()) {
    const pinned = !!sidePanel.isPinned;
    const state = panelCssKeys.get(wc) || { tail: Promise.resolve() };
    state.tail = state.tail.catch(() => {}).then(async () => {
      if (wc.isDestroyed()) return;
      if (state.key) await wc.removeInsertedCSS(state.key).catch(() => {});
      state.key = await wc.insertCSS('html {border-left: ' + (pinned ? '5px solid #00a2ff' : '3px solid #057ba9') + ' !important;box-sizing:border-box !important;}', {cssOrigin:'user'});
    });
    panelCssKeys.set(wc,state); state.tail.catch(() => {});
  }
  notifyPanelHeaderData();
}

function showPanelContextMenu(params = {}) {
  const menuItems = [
    ...spellcheck.menuItems(sidePanel.contentView?.webContents, params),
    {
      label: sidePanel.isPinned ? '📌 Desfixar painel (permitir fechar no hover)' : '📌 Fixar painel (impedir fechar no hover)',
      type: 'checkbox',
      checked: !!sidePanel.isPinned,
      click: () => {
        toggleSidePanelPin();
      }
    },
    { type: 'separator' }
  ];

  if (params.linkURL) {
    menuItems.push({
      label: 'Abrir link em nova aba',
      click: () => createTab(params.linkURL)
    });
    menuItems.push({ type: 'separator' });
  }

  if (params.selectionText) {
    menuItems.push({ role: 'copy', label: 'Copiar' });
  }

  if (params.isEditable) {
    menuItems.push({ role: 'paste', label: 'Colar' });
    menuItems.push({ role: 'selectAll', label: 'Selecionar tudo' });
    menuItems.push(spellcheck.manageMenuItem());
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({
    label: '🔍 Buscar nesta página (Ctrl+F)',
    click: () => openFindWindow('panel')
  });

  menuItems.push({
    label: '🔄 Recarregar painel',
    click: () => {
      if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed()) {
        sidePanel.contentView.webContents.reload();
      }
    }
  });

  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: '🔍 Inspecionar este elemento',
    click: () => {
      if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed()) {
        sidePanel.contentView.webContents.inspectElement(params.x || 0, params.y || 0);
        if (!sidePanel.contentView.webContents.isDevToolsOpened()) {
          sidePanel.contentView.webContents.openDevTools();
        }
      }
    }
  });

  Menu.buildFromTemplate(menuItems).popup();
}

function notifyPanelHeaderData() {
  if (sidePanel.headerView && !sidePanel.headerView.webContents.isDestroyed()) {
    sidePanel.headerView.webContents.send('panel-data-update', {
      category: sidePanel.category,
      title: sidePanel.title,
      mode: sidePanel.mode,
      url: sidePanel.url,
      isPinned: !!sidePanel.isPinned,
      // Marca "visível ao Copilot" do item aberto (só existe para atalhos com id, vindos do menu de acesso rápido).
      ...(() => { const l = configManager.encontrarLink(sidePanel.activeKey); return { copilotDisponivel: !!l, copilotVisivel: !!(l && l.copilot === true) }; })()
    });
  }
}

function closeSidePanel(reset = false) {
  if (!sidePanel.isOpen) return;
  // Se o foco do teclado estava no painel, ele some junto com a view; sem devolvê-lo a uma
  // página viva, o próximo atalho (before-input-event) não chega a ninguém até o usuário clicar.
  const panelWcs = [sidePanel.contentView, sidePanel.headerView].map(v => v && v.webContents).filter(w => w && !w.isDestroyed());
  const tinhaFoco = panelWcs.some(w => w.isFocused());
  sidePanel.isOpen = false;
  stopPanelMouseTracking();
  if (findTarget === 'panel') {
    closeFindWindow();
  }

  if (sidePanel.headerView && mainWindow) {
    try { mainWindow.contentView.removeChildView(sidePanel.headerView); } catch (_) {}
  }
  if (sidePanel.edgeView && mainWindow) {
    try { mainWindow.contentView.removeChildView(sidePanel.edgeView); } catch (_) {}
  }
  if (sidePanel.contentView && mainWindow) {
    try { mainWindow.contentView.removeChildView(sidePanel.contentView); } catch (_) {}
  }

  if (reset) {
    // Destruir todo o pool (chamado pelo panel-close do IPC)
    for (const [key] of panelViewPool) {
      _destroyPoolEntry(key);
    }
    sidePanel.contentView = null;
    sidePanel.activeKey   = null;
    sidePanel.url         = '';
    sidePanel.initialUrl  = '';
  } else {
    // Apenas ocultar — iniciar timer de idle para a view ativa
    if (sidePanel.activeKey) {
      _schedulePanelIdle(sidePanel.activeKey);
    }
  }

  updateLayoutBounds();

  // Atalhos (Acesso Rápido etc.) só chegam a quem tem o foco: depois que o painel some (inclusive sozinho,
  // pelo mouse), o foco precisa estar numa página viva da janela principal, não na view removida nem em nenhuma.
  const devolverFoco = (soOrfao = false) => {
    if (sidePanel.isOpen || !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    let focada = null;
    try { focada = webContents.getFocusedWebContents(); } catch (_) {}
    const orfao = !focada || focada.isDestroyed() || panelWcs.includes(focada);
    if (!orfao && (soOrfao || !tinhaFoco)) return;
    // Só traz a janela para a frente se o app já estava ativo (não rouba o foco de outro programa).
    if (!tinhaFoco && !mainWindow.isFocused() && !BrowserWindow.getFocusedWindow()) return;
    const ativa = tabs.find(t => t.id === activeTabId);
    const alvo = ativa && ativa.view && ativa.view.webContents;
    try { (alvo && !alvo.isDestroyed() ? alvo : mainWindow.webContents).focus(); } catch (_) {}
  };
  devolverFoco();
  // O Chromium pode reatribuir o foco logo após a remoção da view: confere de novo.
  const reconferir = setTimeout(() => devolverFoco(true), 60); // só se o foco ficou órfão (não rouba clique do usuário)
  if (reconferir.unref) reconferir.unref();
}


async function detectAndApplyThemeColor(view) {
  if (!view || !view.webContents || !mainWindow) return;
  try {
    const detectedColor = await view.webContents.executeJavaScript(`
      (function() {
        function isValidBrandColor(rgbStr) {
          if (!rgbStr) return false;
          const m = rgbStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          if (!m) return false;
          const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
          // Rejeitar brancos e cinzas claros (brilho > 190)
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness > 190 || brightness < 25) return false;
          // Rejeitar cinzas neutros
          if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15) return false;
          return true;
        }

        const candidates = [
          document.querySelector('#divBarraComandosSuperior'),
          document.querySelector('#navbar'),
          document.querySelector('.navbar'),
          document.querySelector('nav'),
          document.querySelector('.infraBarraTribunal')
        ];

        for (const el of candidates) {
          if (!el) continue;
          let curr = el;
          while (curr && curr !== document.body) {
            const bg = window.getComputedStyle(curr).backgroundColor;
            if (isValidBrandColor(bg)) {
              return bg;
            }
            curr = curr.parentElement;
          }
        }
        // Padrão do Eproc TJSC
        return '#057ba9';
      })()
    `);

    if (detectedColor && mainWindow) {
      mainWindow.webContents.send('theme-color-updated', detectedColor);
    }
  } catch (e) {
    if (mainWindow) {
      mainWindow.webContents.send('theme-color-updated', '#057ba9');
    }
  }
}

function getLeftActiveView() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return null;

  if (activeTab.groupId) {
    const { leftTab } = resolveGroupSplitTabs(activeTab);
    return (leftTab && leftTab.view) ? leftTab.view : (activeTab.view || null);
  }
  if (activeTab.splitWith) {
    const partner = tabs.find(t => t.id === activeTab.splitWith);
    if (partner && partner.view) {
      const leftTab = (activeTab.splitRole === 'left') ? activeTab : partner;
      return leftTab.view || null;
    }
  }
  return activeTab.view || null;
}

async function updateTitlebarNavbarGradient(providedWidth = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [totalWidth] = mainWindow.getContentSize();
  if (!totalWidth || totalWidth <= 0) return;
  // A barra de título começa à direita da coluna do Copilot: o degradê é calculado sobre a largura que sobra
  const larguraBarra = getLayoutAreas([totalWidth, 0]).conteudo.width || totalWidth;

  let pageNavWidth = providedWidth;

  const leftView = getLeftActiveView();
  if ((typeof pageNavWidth !== 'number' || pageNavWidth <= 0) && leftView && leftView.webContents && !leftView.webContents.isDestroyed()) {
    try {
      pageNavWidth = await leftView.webContents.executeJavaScript(`
        (function() {
          try {
            const el = document.querySelector('#navbar') || 
                       document.querySelector('.navbar') || 
                       document.querySelector('nav') ||
                       document.querySelector('#divBarraComandosSuperior');
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 50) return Math.round(rect.width);
            }
            return document.documentElement ? document.documentElement.clientWidth : window.innerWidth;
          } catch (_) {
            return 0;
          }
        })()
      `, true);
    } catch (_) {}
  }

  // Fallback seguro caso a página ainda esteja em carregamento inicial
  if (typeof pageNavWidth !== 'number' || pageNavWidth <= 50) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const isSplit = activeTab && (activeTab.groupId || activeTab.splitWith);
    pageNavWidth = isSplit ? Math.floor(larguraBarra * 0.48) : larguraBarra;
  }

  // Percentual exato da largura da barra de título (recuada pela coluna do Copilot) que a página/navbar ocupa
  const percent = Math.min(100, Math.max(10, (pageNavWidth / larguraBarra) * 100));

  mainWindow.webContents.send('navbar-width-updated', {
    pageNavWidth: Math.round(pageNavWidth),
    totalWidth,
    percent: Number(percent.toFixed(2))
  });
}

function checkAndHandleSessionConflict(view) {
  if (!view || !view.webContents || view.webContents.isDestroyed()) return;
  const url = view.webContents.getURL() || '';
  if (!url.includes('eproc')) return;

  // Apenas detecta e registra no Debugger se houver aviso, SEM alterar ou ocultar o DOM
  view.webContents.executeJavaScript(`
    (function() {
      try {
        const txa = document.getElementById('txaInfraValidacao') || document.getElementById('txaInfraAviso');
        if (txa && typeof txa.value === 'string' && /houve uma mudança no perfil/i.test(txa.value)) {
          return txa.value.trim();
        }
        const avisoDiv = document.getElementById('divInfraAviso');
        if (avisoDiv && typeof avisoDiv.innerText === 'string' && /houve uma mudança no perfil/i.test(avisoDiv.innerText)) {
          return avisoDiv.innerText.trim();
        }
        return '';
      } catch (_) {
        return '';
      }
    })()
  `).then((conflictMsg) => {
    if (conflictMsg) {
      logDebugger('AVISO_CONFLITO_PERFIL', `[DOM] O eProc exibiu aviso de mudança de perfil na página!`, {
        url,
        aviso: conflictMsg,
        sessionPresent: sessionLoginDone
      });
    }
  }).catch(() => {});
}

function setupTabViewEvents(view, tabData) {
  printToPdf.attach(view.webContents);
  if (view && view.webContents) {
    view.webContents.setMaxListeners(50);
  }
  const tabId = tabData.id;

  view.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame, frameProcessId, frameRoutingId) => {
    if (!isMainFrame) return;
    logDebugger('TAB_NAV_INICIADA', 'Navegação principal iniciada', {
      tabId,
      groupId: tabData.groupId || null,
      processRole: tabData.processRole || null,
      webContentsId: view.webContents.id,
      url,
      isInPlace: !!isInPlace,
      frameProcessId,
      frameRoutingId
    });
  });

  // Interceptar solicitação nativa de fechamento de página (ex: window.close() do editor/eproc)
  view.webContents.on('close', (event) => {
    event.preventDefault();
    routePageCloseRequest(tabData.id, 'webContents.close');
  });

  // Salvaguarda caso a webContents seja destruída externamente
  view.webContents.on('destroyed', () => {
    // Fechamentos iniciados pelo SuperPROC já removem a aba logo após o
    // destroy(). Não reentrar em closeTab nesse intervalo, pois o índice da
    // lista ainda aponta para a aba que está sendo descartada.
    if (tabData.isClosing) return;
    const exists = tabs.some(t => t.id === tabData.id);
    if (exists) {
      routePageCloseRequest(tabData.id, 'webContents.destroyed');
    }
  });

  // Atualiza activeTabId quando o usuário clica/foca no webContents (essencial para abas divididas/unificadas)
  view.webContents.on('focus', () => {
    if (activeTabId !== tabId) {
      activeTabId = tabId;
      notifyTabsUpdated();
    }
  });

  // Atalhos de teclado no conteúdo da página da aba
  view.webContents.on('before-input-event', (event, input) => {
    if (focusToolbarFromContent(event,input)) return;
    if (input.type !== 'keyDown') return;
    const isCtrl = input.control || input.meta;

    if (input.alt && !isCtrl && ['ArrowLeft', 'ArrowRight'].includes(input.key)) {
      event.preventDefault();
      const root = getRootNavigationTab(tabs, tabData);
      if (input.key === 'ArrowLeft' && canNavBack(root.view.webContents)) navBack(root.view.webContents);
      if (input.key === 'ArrowRight' && canNavForward(root.view.webContents)) navForward(root.view.webContents);
      return;
    }

    // Ctrl+Shift+W: Fechar a aba toda (inclusive se for grupo unificado, ou simples)
    if (isCtrl && input.shift && input.key.toLowerCase() === 'w') {
      event.preventDefault();
      fecharPorUsuario(tabId, true, 'user-shortcut');
      return;
    }

    // Ctrl+W: fecha a subaba ativa; na CAPA, fecha o processo inteiro para
    // nunca deixar um grupo unificado sem sua aba-base.
    if (isCtrl && !input.shift && input.key.toLowerCase() === 'w') {
      event.preventDefault();
      fecharPorUsuario(tabId);
      return;
    }

    // Alt+PageDown / Alt+PageUp: alterna entre os processos relacionados da pilha
    if (input.alt && !isCtrl && !input.shift && (input.key === 'PageDown' || input.key === 'PageUp')) {
      if (alternarNaPilha(input.key === 'PageDown' ? 1 : -1)) { event.preventDefault(); return; }
    }

    // Ctrl+T: Nova aba
    if (isCtrl && !input.shift && input.key.toLowerCase() === 't') {
      event.preventDefault();
      createTab();
      return;
    }

    // Ctrl+Shift+T: Desfazer fechamento de aba
    if (isCtrl && input.shift && input.key.toLowerCase() === 't') {
      event.preventDefault();
      undoCloseTab();
      return;
    }

    // Ctrl+L: Focar URL
    if (isCtrl && input.key.toLowerCase() === 'l') {
      event.preventDefault();
      if (dialogBridge.show) dialogBridge.show('url');
      return;
    }

    // F5 ou Ctrl+R: Recarregar
    if (input.key === 'F5' || (isCtrl && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
      reloadTab(tabData);
      return;
    }

    // F12 não é mais atalho do host (DevTools só pelo menu secreto da engrenagem, botão direito).
    // Assim a tecla chega ao conteúdo da página, onde o AZflow a usa como gatilho próprio.

    // Ctrl+Tab / Ctrl+Shift+Tab: Trocar de aba
    if (isCtrl && input.key === 'Tab') {
      event.preventDefault();
      const nextId = nextTabId(getVisualTabGroups(), tabId, input.shift);
      if (nextId) switchTab(nextId);
      return;
    }

    // Ctrl+F: Abrir barra de pesquisa flutuante na aba que disparou o atalho
    if (isCtrl && input.key.toLowerCase() === 'f') {
      event.preventDefault();
      openContextualFind(view.webContents, 'tab', tabId);
      return;
    }


    // Ctrl+H: Abrir Histórico duplo (URLs e Processos)
    if (isCtrl && !input.shift && input.key.toLowerCase() === 'h') {
      event.preventDefault();
      showHistoryMenu();
      return;
    }
  });

  // O eproc é mostrado como é: nenhuma adaptação visual do navbar nem da altura da página.
  async function resolveTabTitle() {
    if (!view || !view.webContents || view.webContents.isDestroyed()) return;

    let pageTitle = '';
    try {
      pageTitle = (view.webContents.getTitle() || '').trim();
    } catch (_) {}

    if (pageTitle && pageTitle !== 'Carregando...' && pageTitle !== 'about:blank' && !pageTitle.startsWith('http://') && !pageTitle.startsWith('https://')) {
      if (tabData.title !== pageTitle) {
        tabData.title = pageTitle;
        updateTabProcessInfo(tabData);
        recordTabHistory(tabData);
        notifyTabsUpdated();
      }
      return;
    }

    // Tentar extrair do DOM caso getTitle() esteja vazio ou ainda 'Carregando...'
    try {
      const extracted = await view.webContents.executeJavaScript(`
        (function() {
          try {
            const dt = (document.title || '').trim();
            if (dt && dt !== 'Carregando...' && dt !== 'about:blank') return dt;

            // Busca cabeçalho principal
            const h = document.querySelector('h1, h2, h3, .titulo, .title, #titulo, #title');
            if (h && h.innerText) {
              const t = h.innerText.replace(/\\s+/g, ' ').trim();
              if (t && t.length > 2 && t.length < 90) return t;
            }

            // Busca texto do documento (acórdão, processo, lei)
            const body = document.body ? (document.body.innerText || '') : '';
            const mProcesso = body.match(/(?:Apelação|Agravo|Recurso|Processo|Autos|Mandado|Habeas|Ação|A\\.?\\s*C\\.?)[^\\n\\r]{5,60}/i);
            if (mProcesso) return mProcesso[0].replace(/\\s+/g, ' ').trim();

            const mLei = body.match(/(?:LEI|DECRETO|MEDIDA PROVISÓRIA|RESOLUÇÃO|PORTARIA)\\s+N[º°o]?\\s*[\\d\\.\\/\\-]+/i);
            if (mLei) return mLei[0].replace(/\\s+/g, ' ').trim();

            return '';
          } catch(e) { return ''; }
        })()
      `, true);

      if (extracted && typeof extracted === 'string') {
        const clean = extracted.trim();
        if (clean && clean !== 'Carregando...' && clean !== 'about:blank') {
          tabData.title = clean;
          updateTabProcessInfo(tabData);
          recordTabHistory(tabData);
          notifyTabsUpdated();
          return;
        }
      }
    } catch (_) {}

    // Fallback inteligente caso continue 'Carregando...' após carregamento
    if (tabData.title === 'Carregando...') {
      try {
        const currentUrl = view.webContents.getURL() || tabData.url || '';
        if (currentUrl && currentUrl !== 'about:blank') {
          const u = new URL(currentUrl);
          let fallback = u.hostname.replace(/^www\\./i, '');
          const pathSegments = u.pathname.split('/').filter(Boolean);
          if (pathSegments.length > 0) {
            const lastSeg = decodeURIComponent(pathSegments[pathSegments.length - 1])
              .replace(/\\.[a-zA-Z0-9]+$/, '')
              .replace(/[_-]/g, ' ')
              .trim();
            if (lastSeg && lastSeg.length > 2 && !/^index$/i.test(lastSeg) && !/^default$/i.test(lastSeg)) {
              fallback = lastSeg;
            }
          }
          tabData.title = fallback || 'Página Web';
          updateTabProcessInfo(tabData);
          recordTabHistory(tabData);
          notifyTabsUpdated();
        }
      } catch (_) {
        tabData.title = 'Página Web';
        notifyTabsUpdated();
      }
    }
  }

  // Monitorar eventos da página na aba
  view.webContents.on('page-title-updated', (event, title) => {
    const cleanTitle = (title || '').trim();
    if (cleanTitle && cleanTitle !== 'Carregando...' && cleanTitle !== 'about:blank') {
      tabData.title = cleanTitle;
      updateTabProcessInfo(tabData);
      recordTabHistory(tabData);
      notifyTabsUpdated();
    } else {
      resolveTabTitle();
    }
  });

  view.webContents.on('dom-ready', () => {
    resolveTabTitle();
    setTimeout(resolveTabTitle, 800);
    setTimeout(resolveTabTitle, 2500);
  });

  view.webContents.on('did-finish-load', () => {
    resolveTabTitle();
    setTimeout(resolveTabTitle, 1000);
  });

  view.webContents.on('did-stop-loading', () => {
    resolveTabTitle();
  });

  // Notificar resultados da busca na página se for a aba ativa
  view.webContents.on('found-in-page', (event, result) => {
    if (findWindow && !findWindow.isDestroyed() && findWindow.isVisible() && findTarget === 'tab' && getFindTargetWebContents() === view.webContents && findController.shouldForward(result)) {
      findWindow.webContents.send('find-results', result);
    }
  });

  view.webContents.on('page-favicon-updated', (event, favicons) => {
    if (favicons && favicons.length > 0) {
      tabData.favicon = favicons[0];
      notifyTabsUpdated();
    }
  });

  // Interceptar mensagens do preload e comandos da página
  view.webContents.on('console-message', (event) => {
    const msg = event.message || '';
    if (msg.includes('[SUPERPROC_CMD_CLOSE_SUBTAB]')) {
      routePageCloseRequest(tabData.id, 'page-command');
      return;
    }
    if (msg.includes('[SUPERPROC_CMD_FECHAR_ARVORE]')) {
      fecharArvoresRelacionadas(tabData);
    }
    if (msg.includes('[SUPERPROC_DEBUG_SUBFRM:')) {
      try {
        const idxStart = msg.indexOf('[SUPERPROC_DEBUG_SUBFRM:') + '[SUPERPROC_DEBUG_SUBFRM:'.length;
        const idxEnd = msg.lastIndexOf(']');
        if (idxEnd > idxStart) {
          const jsonStr = msg.substring(idxStart, idxEnd);
          const parsed = JSON.parse(jsonStr);
          logDebugger('SUBFRM_CHAMADO', `[DOM] exibirSubFrm chamado na página!`, {
            abaOrigem: tabData.id,
            urlIframe: parsed.url,
            dimensoes: `${parsed.largura}x${parsed.altura}`,
            paginaOrigem: parsed.origem,
            sessionPresent: sessionLoginDone
          });
        }
      } catch (_) {}
    }
  });

  view.webContents.on('did-navigate', (event, newUrl) => {
    captureEprocHash(newUrl, tabData);
    if (tabData.origemPilhaPendente && newUrl !== 'about:blank') {
      const pedido = tabData.origemPilhaPendente;
      delete tabData.origemPilhaPendente;
      const origem = tabs.find(t => t.id === pedido.id);
      if (origem && getProcessRole(origem.url) === 'capa' && configManager.getRelacionadosEmPilha() &&
          pilhaRelacionados.chaveProcesso(origem.url) === pilhaRelacionados.chaveProcesso(pedido.url) &&
          pilhaRelacionados.marcar(tabData, origem, {
            urlOrigem: pedido.url, urlDestino: newUrl, papelOrigem: 'capa', papelDestino: getProcessRole(newUrl)
          })) avisarPrimeiraPilha();
    }
    const papelNovo = getProcessRole(newUrl);
    if (papelNovo === 'arvore' && tabData.groupId) {
      const capa = getRootNavigationTab(tabs, tabData);
      if (capa !== tabData && resolverOrigemDaArvore(tabs, capa, newUrl) !== capa) {
        delete tabData.groupId;
        delete tabData.lastLeftTabId;
        tabData.nativeSourceTabId = capa.id;
        tabData.nativeStandalone = false;
      }
    }
    const chaveAnterior = getProcessRole(tabData.url) === 'capa' && pilhaRelacionados.chaveProcesso(tabData.url);
    const chaveNova = papelNovo === 'capa' && pilhaRelacionados.chaveProcesso(newUrl);
    const mudouContextoDaCapa = chaveAnterior && chaveNova && chaveAnterior !== chaveNova;
    // Se a aba pertencia a um grupo e navegou para fora da capa ou para outro processo,
    // fecha as abas secundárias (árvore / editor) do processo anterior
    if (tabData.groupId && tabData.processRole === 'capa') {
      const newInfo = getProcessInfo(newUrl, tabData.title);
      if (!newInfo || newInfo.role !== 'capa' || mudouContextoDaCapa || (newInfo.procNumber && tabData.procNumber && newInfo.procNumber !== tabData.procNumber)) {
        const otherGroupTabs = tabs.filter(t => t.groupId === tabData.groupId && t.id !== tabData.id);
        otherGroupTabs.forEach(t => closeTab(t.id));
        delete tabData.groupId;
        delete tabData.processRole;
        delete tabData.procNumber;
        delete tabData.lastLeftTabId;
      }
    } else if (tabData.splitWith && tabData.splitRole === 'left') {
      const partner = tabs.find(t => t.id === tabData.splitWith);
      if (partner && partner.url && (/acao=arvore/i.test(partner.url) || /acao=acessar_documento/i.test(partner.url))) {
        closeTab(partner.id);
      }
    }
    // A origem de uma pilha saiu do processo (ex.: "próximo" na lista): os relacionados abertos a partir dela fecham.
    // Só quando a origem está à frente (ação do usuário); uma aba oculta que navega sozinha nunca derruba as outras.
    if (tabData.stackId) {
      const n = pilhaRelacionados.numeroCompleto(newUrl);
      const saiuDoProcesso = (n && n !== tabData.stackNumero) || mudouContextoDaCapa || /acao=painel/i.test(newUrl);
      if (tabData.stackRaiz && saiuDoProcesso && estaAFrente()) {
        const stackId = tabData.stackId;
        tabData.stackRaiz = false;
        delete tabData.stackId;
        delete tabData.stackNumero;
        delete tabData.stackDestino;
        // Relacionados com editor/minuta aberto não fecham (evita perder o que não foi salvo): viram abas próprias.
        tabs.filter(t => t.stackId === stackId && t.id !== tabData.id && !temEditorAberto(t)).forEach(t => closeTab(t.id));
        desfazerPilha(stackId);
      } else if (saiuDoProcesso) {
        if (n) tabData.stackNumero = n;
        delete tabData.stackDestino;
      }
    }
    tabData.url = newUrl;
    updateTabProcessInfo(tabData);
    recordTabHistory(tabData);
    notifyTabsUpdated();
    const isAuthRoute = !/externo_controlador/i.test(newUrl) &&
      (/(?:^|\/)controlador\.php/i.test(newUrl) || /acao=painel/i.test(newUrl) || /acao=processo/i.test(newUrl));
    if (isAuthRoute) {
      sessionLoginDone = true;
    }
  });

  view.webContents.on('did-navigate-in-page', (event, newUrl) => {
    captureEprocHash(newUrl, tabData);
    tabData.url = newUrl;
    updateTabProcessInfo(tabData);
    recordTabHistory(tabData);
    notifyTabsUpdated();
    const isAuthRoute = !/externo_controlador/i.test(newUrl) &&
      (/(?:^|\/)controlador\.php/i.test(newUrl) || /acao=painel/i.test(newUrl) || /acao=processo/i.test(newUrl));
    if (isAuthRoute) {
      sessionLoginDone = true;
    }
  });

  // Preserve native window.open, named targets, opener and navigation/POST.
  // The manager only adopts the resulting view and chooses its visual group.
  let lastMiddleClickAt = 0;
  view.webContents.on('before-mouse-event', (_, input) => {
    if (input.type === 'mouseDown') { lastMiddleClickAt = input.button === 'middle' ? Date.now() : 0; ultimaEntradaAt = Date.now(); }
  });
  // Entrada do usuário nesta aba (clique/tecla): só ela autoriza a pilha de relacionados a interceptar uma navegação.
  // Navegação disparada pela própria página (atualização automática, redirecionamento), principalmente numa aba oculta,
  // segue no lugar e nunca puxa outra aba para a frente.
  let ultimaEntradaAt = 0;
  view.webContents.on('before-input-event', (_, input) => { if (input.type === 'keyDown') ultimaEntradaAt = Date.now(); });
  const ESPERA_ENTRADA_PILHA_MS = 5000;
  const estaAFrente = () => {
    const ativa = tabs.find(t => t.id === activeTabId);
    return !!ativa && (ativa.id === tabData.id || (!!tabData.groupId && ativa.groupId === tabData.groupId));
  };
  // Clique simples num processo relacionado (link para a capa de OUTRO processo, a partir de uma capa): em vez de trocar
  // a capa atual, abre/seleciona a aba do relacionado empilhada com a origem. Só intercepta navegação do frame principal.
  view.webContents.on('will-navigate', (event, urlArg, _emPlace, frameRaiz) => {
    const urlDestino = event.url || urlArg;
    const principal = event.isMainFrame !== undefined ? event.isMainFrame : frameRaiz;
    if (!principal || event.isSameDocument || !urlDestino || !configManager.getRelacionadosEmPilha()) return;
    const origem = tabs.find(t => t.id === tabData.id);
    if (!origem) return;
    const dados = {
      urlOrigem: view.webContents.getURL() || origem.url, urlDestino,
      papelOrigem: getProcessRole(view.webContents.getURL() || origem.url), papelDestino: getProcessRole(urlDestino)
    };
    if (!pilhaRelacionados.deveEmpilhar(dados)) return;
    if (!estaAFrente() || Date.now() - ultimaEntradaAt > ESPERA_ENTRADA_PILHA_MS) return; // não foi o usuário, ou a aba está oculta: navega no lugar
    event.preventDefault();
    // Exclusão: a página (ex.: navegação anterior/próximo da lista) marca o <html> antes de navegar. A leitura é assíncrona,
    // por isso a navegação é cancelada e, se houver marcador válido, refeita na mesma aba (sem empilhar).
    const wc = view.webContents;
    wc.executeJavaScript("(function(){var e=document.documentElement,v=e.getAttribute('data-superproc-sem-pilha');if(v)e.removeAttribute('data-superproc-sem-pilha');return v||'';})()")
      .catch(() => '')
      .then((marcador) => {
        if (wc.isDestroyed()) return;
        if (pilhaRelacionados.marcadorValido(marcador)) {
          wc.loadURL(urlDestino, { httpReferrer: dados.urlOrigem }).catch(() => {});
          return;
        }
        // A navegação foi cancelada, mas o eproc já pode ter posto o véu "Aguarde..." na origem: tira agora e de novo logo depois
        // (o véu às vezes aparece com atraso).
        for (const ms of [0, 400, 1500]) setTimeout(() => { if (!wc.isDestroyed()) wc.executeJavaScript(SCRIPT_LIMPAR_VEU_DE_SAIDA).catch(() => {}); }, ms);
        const existente = pilhaRelacionados.achar(tabs, origem.stackId, urlDestino);
        if (existente) { switchTab(existente.id); return; }
        createTab(urlDestino, false, { referrer: dados.urlOrigem, pilhaOrigemId: origem.id, session: wc.session });
      });
  });
  const abrirPedidoComoAbaOuJanela = nativeTabWindowHandler(
    WebContentsView,
    (childView, details, decisao) => {
      const middleClick = Date.now() - lastMiddleClickAt < 1500;
      lastMiddleClickAt = 0;
      registerNativeTab(childView, tabData, { ...details, middleClick }, decisao);
    },
    (error) => console.warn('[SuperPROC] Falha na navegação da aba:', error.message),
    () => ({ session: view.webContents.session, nodeIntegrationInSubFrames: true }),
    (details) => decidirAberturaDoPedido(details, tabData, Date.now() - lastMiddleClickAt < 1500),
    () => ({ autoHideMenuBar: true, show: true, backgroundColor: '#ffffff', icon: getBrowserIconPath() })
  );
  view.webContents.setWindowOpenHandler((details) => {
    // Botão "Organizar" dos módulos Smart: só a página do organizador da própria extensão SuperPROC.
    if (ehUrlOrganizadorSmart(details.url)) { setImmediate(() => abrirOrganizadorSmart(new URL(details.url).searchParams.get('m'))); return { action: 'deny' }; }
    return TITULOS_JANELA_FLUTUANTE[details.frameName] ? abrirJanelaFlutuante(view, details) : abrirPedidoComoAbaOuJanela(details);
  });
  view.webContents.on('did-create-window', (win) => trackPopupWindow(win));

  // Menu de contexto de clique com botão direito nas abas
  view.webContents.on('context-menu', (event, params) => {
    const menuItems = [...spellcheck.menuItems(view.webContents, params)];
    if (params.linkURL) {
      menuItems.push({
        label: 'Abrir link em nova aba',
        click: () => {
          setImmediate(() => {
            createTab(params.linkURL, false, { referrer: view.webContents.getURL() });
          });
        }
      });
      menuItems.push({
        label: '🗖 Abrir em visualização dividida (ao lado)',
        click: () => {
          setImmediate(() => {
            createSplitTab(tabData.id, params.linkURL, { referrer: view.webContents.getURL() });
          });
        }
      });
      menuItems.push({
        label: 'Copiar endereço do link',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(params.linkURL);
        }
      });
      menuItems.push({ type: 'separator' });
    }
    if (params.hasImageContents && params.srcURL) {
      menuItems.push({
        label: 'Copiar imagem',
        click: () => view.webContents.copyImageAt(params.x, params.y)
      });
      menuItems.push({ type: 'separator' });
    }
    if (params.selectionText) {
      menuItems.push({ role: 'copy', label: 'Copiar' });
    }
    if (params.isEditable) {
      menuItems.push({ role: 'paste', label: 'Colar' });
      menuItems.push({ role: 'selectAll', label: 'Selecionar tudo' });
      menuItems.push(spellcheck.manageMenuItem());
    }
    if (menuItems.length > 0) {
      menuItems.push({ type: 'separator' });
    }
    menuItems.push({
      label: '🔍 Inspecionar este elemento',
      click: () => {
        view.webContents.inspectElement(params.x, params.y);
        if (!view.webContents.isDevToolsOpened()) {
          view.webContents.openDevTools();
        }
      }
    });
    Menu.buildFromTemplate(menuItems).popup();
  });

  // Lidar com beforeunload (ex: alertar sobre alterações não salvas no editor de minuta)
  view.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow || null, {
      type: 'question',
      buttons: ['Recarregar / Prosseguir', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Atenção - Alterações não salvas',
      message: 'As alterações feitas talvez não sejam salvas.',
      detail: 'Deseja realmente recarregar a página do editor? Quaisquer dados não salvos poderão ser perdidos.'
    });
    if (choice === 0) {
      event.preventDefault();
    }
  });

  const retryTabCache = cacheRetry();
  // Tratar ERR_CACHE_MISS apenas no frame principal para evitar recarregamentos indesejados de subframes (PDFs, widgets)
  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -24 || errorDescription === 'ERR_CACHE_MISS') {
      if (!view.webContents.isDestroyed()) {
        const urlToLoad = validatedURL || tabData.url || view.webContents.getURL();
        if (urlToLoad && retryTabCache(urlToLoad, tabData.lastLoadOptions)) {
          if (tabData.lastLoadOptions && tabData.lastLoadOptions.postData) {
            view.webContents.loadURL(urlToLoad, tabData.lastLoadOptions);
          } else {
            view.webContents.loadURL(urlToLoad);
          }
        }
      }
    }
  });

  // Sincronizar tema de cor, extrair sessão do Eproc, resolver conflitos e atualizar gradiente
  const handleLoadChecks = () => {
    detectAndApplyThemeColor(view);
    extractAndStoreEprocSession(view);
    checkAndHandleSessionConflict(view);
    updateTitlebarNavbarGradient();
  };

  view.webContents.on('did-finish-load', handleLoadChecks);
  view.webContents.on('dom-ready', handleLoadChecks);
  ligarRedatorNaAba(view.webContents); // ícone do Copilot na linha do cursor (redator-linha.js)
}

// Modo de abertura realmente aplicado (Dois monitores sem 2 monitores cai para Integrada).
function getEffectiveOpenMode() {
  return openMode.modoEfetivo(configManager.getOpenMode(), screen.getAllDisplays());
}

// Toggle "Coluna Copilot" (independente do modo de abertura): a coluna vive sempre na janela principal.
function colunaCopilotLigada() {
  return configManager.getColunaCopilot();
}

function decidirAberturaDoPedido(details, sourceTab, middleClick) {
  const url = details.url || '';
  if (configManager.getRelacionadosEmPilha() &&
      pilhaRelacionados.ehRemessaExterna(url) && pilhaRelacionados.deveEmpilhar({
        urlOrigem: sourceTab.url, urlDestino: url, papelOrigem: getProcessRole(sourceTab.url), papelDestino: null
      })) return { destino: 'aba', unificar: false };
  return openMode.decidirAbertura(getEffectiveOpenMode(), {
    disposition: details.disposition,
    middleClick,
    temPapelProcesso: !!getProcessRole(url),
    urlVazia: !url || url === 'about:blank'
  });
}

function trackPopupWindow(win) {
  if (!win || typeof win.setMenuBarVisibility !== 'function' || popupWindows.has(win)) return;
  // Contextos adotados como aba (createWindow) não são janelas do sistema.
  if (tabs.some(t => t.view?.webContents === win.webContents)) return;
  popupWindows.add(win);
  try { win.setMenuBarVisibility(false); } catch (_) {}
  win.once('closed', () => popupWindows.delete(win));
  logDebugger('POPUP_JANELA_SISTEMA', 'Janela do sistema aberta por pedido de janela nova', { webContentsId: win.webContents?.id });
}

// Textos Padrão e Minuta Área de Trabalho (abertos pelo editor de minutas) viram uma janela flutuante DENTRO da
// janela principal, por cima de editor/árvore/PDF. A página continua sendo a popup nativa (opener e sessão intactos).
const TITULOS_JANELA_FLUTUANTE = {
  win_texto_padrao_listar: 'Textos Padrão',
  win_minuta_area_trabalho: 'Minuta Área de Trabalho'
};
let janelaFlutuante = null;
function getJanelaFlutuante() {
  if (!janelaFlutuante) {
    janelaFlutuante = require('./janela-flutuante').criarJanelaFlutuante({
      WebContentsView, ipcMain,
      getMainWindow: () => mainWindow,
      getArea: () => {
        const [largura, altura] = mainWindow.getContentSize();
        return { x: 0, y: TITLEBAR_HEIGHT, width: largura, height: Math.max(0, altura - TITLEBAR_HEIGHT) };
      },
      arquivoGeometria: path.join(app.getPath('userData'), 'janela-flutuante.json'),
      log: (codigo, mensagem, dados) => logDebugger(codigo, mensagem, dados)
    });
  }
  return janelaFlutuante;
}

// A janela só aparece com o editor que a abriu à vista (ele ou outra aba do mesmo grupo na tela).
function origemDaJanelaFlutuanteVisivel(activeTab) {
  if (!janelaFlutuante || !janelaFlutuante.aberta()) return false;
  const origem = tabs.find(t => t.view === janelaFlutuante.origem());
  if (!origem || !activeTab) return false;
  return origem.id === activeTab.id || (!!origem.groupId && origem.groupId === activeTab.groupId);
}

function abrirJanelaFlutuante(origemView, details) {
  return {
    action: 'allow',
    createWindow: (options) => {
      const fornecida = options?.webContents;
      const adotavel = fornecida && typeof fornecida.loadURL === 'function' && typeof fornecida.isDestroyed === 'function';
      const view = adotavel
        ? new WebContentsView({ webContents: fornecida })
        : new WebContentsView({ webPreferences: { session: origemView.webContents.session, nodeIntegrationInSubFrames: true, contextIsolation: true, nodeIntegration: false, sandbox: false, webviewTag: false } });
      getJanelaFlutuante().abrir({ view, titulo: TITULOS_JANELA_FLUTUANTE[details.frameName], origem: origemView });
      if (!adotavel) {
        const carga = details.referrer ? { httpReferrer: details.referrer } : {};
        view.webContents.loadURL(details.url, carga).catch((erro) => console.warn('[SuperPROC] Falha ao abrir a janela flutuante:', erro.message));
      }
      return view.webContents;
    }
  };
}

function registerNativeTab(view, sourceTab, details, decisao = null) {
  const id = 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const tab = {
    id, view, title: 'Carregando...', url: details.url,
    favicon: '', active: false, isStartupTab: false,
    nativeSourceTabId: sourceTab.id,
    nativeStandalone: !(decisao ? decisao.unificar : shouldUnifyNativeTab(details))
  };
  tryGroupNativeTab(tab);
  // Aberto (clique do meio/window.open) a partir da capa de OUTRO processo: entra na pilha de relacionados da origem.
  if (configManager.getRelacionadosEmPilha()) pilhaRelacionados.marcar(tab, sourceTab, {
    urlOrigem: sourceTab.url, urlDestino: details.url,
    papelOrigem: sourceTab.processRole === 'capa' || getProcessRole(sourceTab.url) === 'capa' ? 'capa' : null,
    papelDestino: getProcessRole(details.url)
  });
  if (configManager.getRelacionadosEmPilha() && (!details.url || details.url === 'about:blank') &&
      getProcessRole(sourceTab.url) === 'capa') {
    tab.origemPilhaPendente = { id: sourceTab.id, url: sourceTab.url };
  }
  setupTabViewEvents(view, tab);
  if (tab.stackId) avisarPrimeiraPilha();
  const lastIndex = tabs.reduce((last, t, index) =>
    t.id === sourceTab.id || (sourceTab.groupId && t.groupId === sourceTab.groupId) || (sourceTab.stackId && t.stackId === sourceTab.stackId) ? index : last, -1);
  tabs.splice(lastIndex + 1, 0, tab);
  logDebugger('TAB_NATIVE_CREATED', 'Contexto nativo adotado pelo gestor visual', {
    tabId: id, webContentsId: view.webContents.id,
    sourceWebContentsId: sourceTab.view.webContents.id,
    groupId: tab.groupId || null, disposition: details.disposition
  });
  // Complete Chromium's creation callback before changing focus/layout.
  setImmediate(() => {
    if (view.webContents.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;
    // Uma aba da pilha de relacionados que está oculta e abre janela por conta própria não puxa a frente: o que o usuário vê não muda.
    const ativaAgora = tabs.find(t => t.id === activeTabId);
    const origemOcultaNaPilha = !!sourceTab.stackId && (!ativaAgora || (ativaAgora.id !== sourceTab.id && !(sourceTab.groupId && ativaAgora.groupId === sourceTab.groupId)));
    if (details.disposition === 'background-tab' || origemOcultaNaPilha) notifyTabsUpdated();
    else switchTab(id);
  });
  return tab;
}

function createTab(initialUrl, isStartupTab = false, navOptions = {}) {
  const config = configManager.loadConfig();
  let url = initialUrl;
  const activeTab = tabs.find(t => t.id === activeTabId);
  // Mantém a mesma sessão Chromium da aba de origem, inclusive se ela usar
  // uma sessão não padrão criada pelo próprio fluxo de abertura nativo.
  const inheritedSession = navOptions.session ||
    (activeTab && hasLiveWebContents(activeTab.view) && activeTab.view.webContents.session) ||
    session.defaultSession;

  if (isStartupTab) sessionLinks.profileOrigin(inheritedSession, initialUrl || config.homepage);

  if (!url) {
    url = (sessionLoginDone) ? getEprocHomeUrl(activeTab) : (config.homepage || 'https://eproc1g.tjsc.jus.br/eproc/');
  }

  // Se a aba atual for a tela de estado vazio, removemos ela ao abrir uma nova aba
  const emptyTabIdx = tabs.findIndex(t => t.isEmptyState);
  let emptyTabViewToClose = null;
  if (emptyTabIdx !== -1) {
    emptyTabViewToClose = tabs[emptyTabIdx].view;
    tabs.splice(emptyTabIdx, 1);
  }

  const tabId = 'tab_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

  const view = new WebContentsView({
    webPreferences: {
      session: inheritedSession,
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });

  view.webContents.setUserAgent(CHROME_USER_AGENT);

  const tabData = {
    id: tabId,
    title: navOptions.title || 'Carregando...',
    url: url,
    favicon: '',
    active: false,
    view: view,
    isStartupTab: isStartupTab
  };

  setupTabViewEvents(view, tabData);

  tabs.push(tabData);

  // Clique simples num processo relacionado (ver will-navigate): a aba nova entra na pilha da origem, logo após ela.
  const origemPilha = navOptions.pilhaOrigemId ? tabs.find(t => t.id === navOptions.pilhaOrigemId) : null;
  if (origemPilha && pilhaRelacionados.marcar(tabData, origemPilha, {
    urlOrigem: origemPilha.url, urlDestino: url, papelOrigem: 'capa', papelDestino: 'capa'
  })) {
    tabs.pop();
    const ultimo = tabs.reduce((last, t, index) => (t.stackId === tabData.stackId || (origemPilha.groupId && t.groupId === origemPilha.groupId)) ? index : last, -1);
    tabs.splice(ultimo + 1, 0, tabData);
    avisarPrimeiraPilha();
  } else if (navOptions.depoisDeId) {
    // "+" ao lado de uma aba (ou pilha/aba unificada): a nova aba entra logo depois dela e empurra as seguintes.
    const origem = tabs.find(t => t.id === navOptions.depoisDeId);
    if (origem) {
      tabs.pop();
      const visuais = getVisualTabGroups();
      const slots = configManager.getRelacionadosEmPilha() ? pilhaRelacionados.agruparSlots(visuais) : visuais;
      const slot = slots.find(s => s.some(t => t.id === origem.id));
      const ultimo = slot ? Math.max(...slot.map(t => tabs.indexOf(t))) : tabs.length - 1;
      tabs.splice(ultimo + 1, 0, tabData);
    }
  }

  if (emptyTabViewToClose) {
    if (mainWindow) {
      try { mainWindow.contentView.removeChildView(emptyTabViewToClose); } catch (_) {}
    }
    if (emptyTabViewToClose.webContents && !emptyTabViewToClose.webContents.isDestroyed()) {
      emptyTabViewToClose.webContents.destroy();
    }
  }

  notifyTabsUpdated();

  const loadOptions = {};
  if (navOptions.referrer) {
    loadOptions.httpReferrer = navOptions.referrer;
  }
  if (navOptions.postData) {
    loadOptions.postData = navOptions.postData;
  }
  if (navOptions.extraHeaders) {
    loadOptions.extraHeaders = navOptions.extraHeaders;
  }

  const loadTab = async () => {
    // O clique no + pode ocorrer antes da extração feita no did-finish-load.
    if (!initialUrl && activeTab && hasLiveWebContents(activeTab.view)) {
      await extractAndStoreEprocSession(activeTab.view);
      if (sessionLoginDone) {
        url = getEprocHomeUrl(activeTab);
        tabData.url = url;
      }
      if (!loadOptions.httpReferrer && hasLiveWebContents(activeTab.view)) loadOptions.httpReferrer = activeTab.view.webContents.getURL();
    }
    tabData.lastLoadOptions = Object.keys(loadOptions).length > 0 ? loadOptions : null;
    if (!view.webContents.isDestroyed()) await view.webContents.loadURL(url, loadOptions);
  };
  loadTab().catch(error => console.warn('[SuperPROC] Falha ao abrir aba:', error.message));

  if (navOptions.background && activeTab && !activeTab.isEmptyState) notifyTabsUpdated();
  else switchTab(tabId);

  return tabData;
}

// ABERTURA INTELIGENTE DE ABAS DE PROCESSO (CAPA / EDITOR / ÁRVORE)
function handleOpenProcessTab(sourceTabId, targetUrl, navOptions = {}) {
  const abaOrigem = tabs.find(t => t.id === sourceTabId);
  const targetInfo = getProcessInfo(targetUrl);
  const sourceTab = targetInfo?.role === 'arvore' ? resolverOrigemDaArvore(tabs, abaOrigem, targetUrl) : abaOrigem;
  const sourceInfo = sourceTab ? getProcessInfo(sourceTab.url, sourceTab.title) : null;

  // Modo Simples: sem sistema unificado, o pedido vira uma aba comum. A divisão manual
  // (forcarUnificada) mantém o agrupamento.
  if (!openMode.abrirProcessoUnificado(getEffectiveOpenMode(), navOptions)) {
    return createTab(targetUrl, false, {
      ...navOptions,
      session: navOptions.session || abaOrigem?.view?.webContents?.session,
      referrer: navOptions.referrer || abaOrigem?.url
    });
  }

  // Esta função recebe pedidos de NOVO contexto. Navegações _self/location
  // permanecem no Chromium e substituem a capa atual normalmente.
  if (targetInfo?.role === 'capa') {
    return createTab(targetUrl, false, {
      ...navOptions,
      session: navOptions.session || abaOrigem?.view?.webContents?.session,
      referrer: navOptions.referrer || abaOrigem?.url
    });
  }

  if (!targetInfo) {
    return createTab(targetUrl, false, navOptions);
  }

  if (!sourceInfo || (targetInfo.procNumber && sourceInfo.procNumber && targetInfo.procNumber !== sourceInfo.procNumber)) {
    return createTab(targetUrl, false, {
      ...navOptions,
      session: navOptions.session || abaOrigem?.view?.webContents?.session,
      referrer: navOptions.referrer || abaOrigem?.url
    });
  }

  let groupId = sourceTab?.groupId;
  const procNumber = targetInfo.procNumber || sourceInfo?.procNumber || (sourceTab ? extractProcessNumber(sourceTab.url, sourceTab.title) : '');

  if (!groupId && sourceInfo) {
    // O grupo pertence à capa/contexto, não ao número: duas capas do mesmo
    // processo abertas separadamente também precisam de grupos independentes.
    groupId = 'grp_' + sourceTab.id;
    sourceTab.groupId = groupId;
    sourceTab.processRole = sourceInfo.role;
    sourceTab.procNumber = procNumber;
  } else if (!groupId) {
    groupId = 'grp_' + sourceTab.id;
  }

  // Verifica se já existe uma aba com este mesmo papel (role) no grupo
  const existingTabWithRole = tabs.find(t => t.groupId === groupId && t.processRole === targetInfo.role);

  if (existingTabWithRole) {
    const loadOptions = {};
    if (navOptions.referrer || (abaOrigem && abaOrigem.url)) {
      loadOptions.httpReferrer = navOptions.referrer || abaOrigem.url;
    }
    if (navOptions.postData) loadOptions.postData = navOptions.postData;
    if (navOptions.extraHeaders) loadOptions.extraHeaders = navOptions.extraHeaders;

    existingTabWithRole.lastLoadOptions = Object.keys(loadOptions).length > 0 ? loadOptions : null;
    existingTabWithRole.url = targetUrl;
    if (Object.keys(loadOptions).length > 0) {
      existingTabWithRole.view.webContents.loadURL(targetUrl, loadOptions);
    } else {
      existingTabWithRole.view.webContents.loadURL(targetUrl);
    }
    switchTab(existingTabWithRole.id);
    return existingTabWithRole;
  }

  const tabId = 'tab_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const view = new WebContentsView({
    webPreferences: {
      session: navOptions.session || abaOrigem?.view?.webContents?.session || session.defaultSession,
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });

  view.webContents.setUserAgent(CHROME_USER_AGENT);

  const initialDisplayTitle = targetInfo.role === 'capa' ? 'CAPA' : (targetInfo.role === 'editor' ? 'Editor' : (procNumber || 'Árvore'));

  const tabData = {
    id: tabId,
    title: initialDisplayTitle,
    url: targetUrl,
    favicon: '',
    active: true,
    view: view,
    isStartupTab: false,
    groupId: groupId,
    processRole: targetInfo.role,
    procNumber: procNumber
  };

  setupTabViewEvents(view, tabData);

  // Inserir a nova aba logo após a última aba deste grupo
  const lastGroupIndex = tabs.reduce((lastIdx, t, idx) => (t.groupId === groupId ? idx : lastIdx), -1);
  if (lastGroupIndex !== -1) {
    tabs.splice(lastGroupIndex + 1, 0, tabData);
  } else {
    tabs.push(tabData);
  }

  const loadOptions = {};
  if (navOptions.referrer || (abaOrigem && abaOrigem.url)) {
    loadOptions.httpReferrer = navOptions.referrer || abaOrigem.url;
  }
  if (navOptions.postData) loadOptions.postData = navOptions.postData;
  if (navOptions.extraHeaders) loadOptions.extraHeaders = navOptions.extraHeaders;

  tabData.lastLoadOptions = Object.keys(loadOptions).length > 0 ? loadOptions : null;
  if (Object.keys(loadOptions).length > 0) {
    view.webContents.loadURL(targetUrl, loadOptions);
  } else {
    view.webContents.loadURL(targetUrl);
  }

  switchTab(tabId);
  return tabData;
}

// CRIAÇÃO DE VISUALIZAÇÃO DIVIDIDA (SPLIT VIEW / LADO A LADO)
function createSplitTab(sourceTabId, targetUrl, navOptions = {}) {
  const sourceTab = tabs.find(t => t.id === sourceTabId);
  if (!sourceTab) {
    createTab(targetUrl, false, navOptions);
    return;
  }

  const targetInfo = getProcessInfo(targetUrl);
  const sourceInfo = getProcessInfo(sourceTab.url, sourceTab.title);
  if (targetInfo || sourceInfo) {
    return handleOpenProcessTab(sourceTabId, targetUrl, { ...navOptions, forcarUnificada: true });
  }

  // Divisão genérica (caso não seja do eproc)
  let groupId = sourceTab.groupId;
  if (!groupId) {
    groupId = 'grp_split_' + Date.now().toString(36);
    sourceTab.groupId = groupId;
    sourceTab.processRole = 'left';
  } else {
    const existingOther = tabs.find(t => t.groupId === groupId && t.id !== sourceTab.id);
    if (existingOther) {
      closeTab(existingOther.id);
    }
  }

  const tabId = 'tab_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  const view = new WebContentsView({
    webPreferences: {
      session: navOptions.session || sourceTab.view.webContents.session,
      nodeIntegrationInSubFrames: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false
    }
  });

  view.webContents.setUserAgent(CHROME_USER_AGENT);

  const tabData = {
    id: tabId,
    title: navOptions.title || 'Carregando...',
    url: targetUrl,
    favicon: '',
    active: true,
    view: view,
    isStartupTab: false,
    groupId: groupId,
    processRole: 'right'
  };

  setupTabViewEvents(view, tabData);

  const srcIdx = tabs.findIndex(t => t.id === sourceTabId);
  if (srcIdx !== -1) {
    tabs.splice(srcIdx + 1, 0, tabData);
  } else {
    tabs.push(tabData);
  }

  const loadOptions = {};
  if (navOptions.referrer || sourceTab.url) {
    loadOptions.httpReferrer = navOptions.referrer || sourceTab.url;
  }
  if (navOptions.postData) loadOptions.postData = navOptions.postData;
  if (navOptions.extraHeaders) loadOptions.extraHeaders = navOptions.extraHeaders;

  tabData.lastLoadOptions = Object.keys(loadOptions).length > 0 ? loadOptions : null;
  if (Object.keys(loadOptions).length > 0) {
    view.webContents.loadURL(targetUrl, loadOptions);
  } else {
    view.webContents.loadURL(targetUrl);
  }

  switchTab(tabId);
  return tabData;
}

function switchTab(tabId, opcoes = {}) {
  const targetTab = tabs.find(t => t.id === tabId);
  if (!targetTab) return;

  // Trocar de aba/processo (Ctrl+Tab, número do processo, Alt+PageDown) abre o processo inteiro, sem mistura.
  // Reaplicar o layout da aba já ativa preserva a mistura.
  if (!opcoes.manterMix && tabId !== activeTabId && stackIdDe(targetTab)) pilhaMix.delete(stackIdDe(targetTab));
  activeTabId = tabId;

  // Determinar quais views devem ficar visíveis na tela
  let visibleTabs = [];
  let segundoTab = null; // árvore/documentos no segundo monitor (modo Dois monitores)
  if (targetTab.groupId) {
    // Se o alvo for capa, editor ou left, atualiza lastLeftTabId do grupo
    if (targetTab.processRole === 'capa' || targetTab.processRole === 'editor' || targetTab.processRole === 'left') {
      tabs.filter(t => t.groupId === targetTab.groupId).forEach(t => {
        t.lastLeftTabId = targetTab.id;
      });
    }

    const plano = planoDeLayoutDoGrupo(targetTab);
    segundoTab = plano.segundo;
    if (plano.esquerda) visibleTabs.push(plano.esquerda);
    if (plano.direita && plano.direita.id !== plano.esquerda?.id) visibleTabs.push(plano.direita);
    if (plano.direita2) visibleTabs.push(plano.direita2);
  } else if (targetTab.splitWith) {
    const partner = tabs.find(t => t.id === targetTab.splitWith);
    const leftTab = (targetTab.splitRole === 'left') ? targetTab : partner;
    const rightTab = (targetTab.splitRole === 'right') ? targetTab : partner;
    if (leftTab) visibleTabs.push(leftTab);
    if (rightTab && rightTab.id !== leftTab?.id) visibleTabs.push(rightTab);
  } else {
    visibleTabs.push(targetTab);
  }

  // Atualizar estado active de cada aba
  tabs.forEach(t => {
    t.active = (t.id === targetTab.id);
  });

  // Remover da janela principal quaisquer views que NÃO estejam visíveis
  tabs.forEach(t => {
    if (!visibleTabs.some(v => v.id === t.id) && t !== segundoTab) {
      if (t.view && mainWindow) {
        try {
          if (!t.view.webContents.isDestroyed()) {
            t.view.webContents.stopFindInPage('clearSelection');
          }
        } catch (e) {}
        removeTabView(t.view);
      }
    }
  });

  // Adicionar à janela principal as views visíveis
  if (mainWindow) {
    visibleTabs.forEach(v => {
      if (v.view && !v.view.webContents.isDestroyed()) {
        try {
          secondScreen.soltar(v.view); // volta do segundo monitor, se estava lá
          mainWindow.contentView.addChildView(v.view);
        } catch (e) {}
      }
    });
  }
  sincronizarSegundoMonitor(segundoTab);

  // Focar a WebContentsView da aba que foi explicitamente selecionada
  if (targetTab.view && !targetTab.view.webContents.isDestroyed()) {
    try {
      targetTab.view.webContents.focus();
    } catch (e) {}
  }

  closeFindWindow();
  if (sidePanel.isOpen) {
    closeSidePanel();
  }
  updateLayoutBounds();
  notifyTabsUpdated();

  mainWindow.webContents.send('active-tab-changed', {
    id: targetTab.id,
    url: targetTab.url,
    title: targetTab.title
  });
}

// Toda ordem externa de fechamento é cancelada no Chromium e chega aqui já
// identificada pelo webContents que a originou. O único efeito permitido é o
// fechamento isolado daquela subaba — nunca da aba unificada inteira.
function routePageCloseRequest(tabId, origin = 'page') {
  const requestedTab = tabs.find(t => t.id === tabId);
  if (!requestedTab || requestedTab.isClosing || requestedTab.pageClosePending) return;
  requestedTab.pageClosePending = true;
  setImmediate(() => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || tab !== requestedTab) return;
    delete tab.pageClosePending;
    if (tab.isClosing) return;
    logDebugger('TAB_FECHAMENTO_INTERNO', 'Fechamento externo roteado para a subaba de origem', {
      tabId,
      origin,
      groupId: tab.groupId || null,
      processRole: tab.processRole || null
    });
    closePageSubTab(tabId);
  });
}

function closePageSubTab(tabId) {
  const targetId = tabId || activeTabId;
  const tabToClose = tabs.find(t => t.id === targetId);
  if (!tabToClose || tabToClose.isClosing) return;

  // A CAPA é a âncora obrigatória do grupo. Uma ordem externa recebida nela
  // não pode desmontar ou fechar o processo; o usuário decide isso pelo X ou
  // Ctrl+W da interface do SuperPROC.
  if (tabToClose.groupId && tabToClose.processRole === 'capa') {
    logDebugger('TAB_FECHAMENTO_BLOQUEADO', 'Ordem externa na capa bloqueada para proteger a aba unificada', {
      tabId: targetId,
      groupId: tabToClose.groupId
    });
    return;
  }

  closeTab(targetId);
}

function closeTab(tabId) {
  const targetId = tabId || activeTabId;
  const index = tabs.findIndex(t => t.id === targetId);
  if (index === -1) return;

  const tabToClose = tabs[index];
  if (tabToClose.isClosing) return;
  if (!tabToClose.groupId) fecharRelacionadosDaPilha([tabToClose]);

  // Se o usuário fechar a tela de estado vazio ("Todas as abas foram fechadas"), NÃO fecha a janela (Ctrl+W é para fechar aba)
  if (tabToClose.isEmptyState) {
    return;
  }

  // A CAPA é a âncora de uma aba unificada. Fechá-la isoladamente deixaria
  // Editor/Árvore sem o contexto do processo, portanto encerra o grupo todo.
  if (tabToClose.groupId && tabToClose.processRole === 'capa') {
    closeWholeTab(targetId, 'user-capa-close');
    return;
  }

  // Deve ser definido antes de destruir a WebContentsView: destroyed pode ser
  // emitido de forma síncrona e, sem esta marca, fechava recursivamente a aba
  // seguinte do grupo unificado.
  tabToClose.isClosing = true;
  logDebugger('TAB_FECHAMENTO', 'Fechamento de subaba iniciado', {
    tabId: tabToClose.id,
    groupId: tabToClose.groupId || null,
    processRole: tabToClose.processRole || null,
    webContentsId: tabToClose.view?.webContents?.id || null,
    url: tabToClose.url || null,
    active: tabToClose.id === activeTabId
  });

  // Guardar histórico de abas fechadas para função "Desfazer" (Ctrl+Shift+T)
  if (tabToClose.url && !tabToClose.url.startsWith('file://')) {
    closedTabsHistory.push({
      url: tabToClose.url,
      title: tabToClose.title
    });
    if (closedTabsHistory.length > 30) {
      closedTabsHistory.shift();
    }
  }

  // TRATAMENTO DE GRUPOS DE PROCESSO / SPLIT VIEW INTELIGENTE
  if (tabToClose.groupId) {
    const groupId = tabToClose.groupId;
    const remainingInGroup = tabs.filter(t => t.groupId === groupId && t.id !== targetId);

    if (mainWindow && tabToClose.view) {
      try {
        removeTabView(tabToClose.view);
      } catch (e) {}
    }
    if (tabToClose.view && tabToClose.view.webContents && !tabToClose.view.webContents.isDestroyed()) {
      try {
        tabToClose.view.webContents.destroy();
      } catch (e) {}
    }
    tabs.splice(index, 1);

    if (tabs.length === 0) {
      createEmptyStateTab();
      return;
    }

    if (remainingInGroup.length === 1) {
      // Restou apenas 1 aba no grupo (ex: fechou Editor, restou Capa):
      // A aba restante volta a ser 100% tela cheia mantendo seu grupo para permitir futuras junções
      const soleRemaining = remainingInGroup[0];
      switchTab(soleRemaining.id);
      updateLayoutBounds();
      notifyTabsUpdated();
      return;
    } else if (remainingInGroup.length > 1) {
      // Restaram 2 abas (ex: fechou Editor num trio, ficaram Capa e Árvore):
      const nextActive = (targetId === activeTabId)
        ? (remainingInGroup.find(t => t.processRole === 'capa') || remainingInGroup[0])
        : (tabs.find(t => t.id === activeTabId) || remainingInGroup[0]);
      switchTab(nextActive.id);
      updateLayoutBounds();
      notifyTabsUpdated();
      return;
    } else {
      // Não restou nenhuma aba deste grupo: ativa a aba vizinha
      const nextTab = tabs[Math.min(index, tabs.length - 1)];
      if (nextTab) {
        switchTab(nextTab.id);
      } else {
        createEmptyStateTab();
      }
      updateLayoutBounds();
      notifyTabsUpdated();
      return;
    }
  }

  // Tratamento de split legada (splitWith)
  if (tabToClose.splitWith) {
    const partner = tabs.find(t => t.id === tabToClose.splitWith);
    if (partner) {
      delete partner.splitWith;
      delete partner.splitRole;
      delete tabToClose.splitWith;
      delete tabToClose.splitRole;

      if (mainWindow && tabToClose.view) {
        try {
          removeTabView(tabToClose.view);
        } catch (e) {}
      }
      if (tabToClose.view && tabToClose.view.webContents && !tabToClose.view.webContents.isDestroyed()) {
        try {
          tabToClose.view.webContents.destroy();
        } catch (e) {}
      }
      tabs.splice(index, 1);

      if (tabs.length === 0) {
        createEmptyStateTab();
        return;
      }

      activeTabId = partner.id;
      partner.active = true;

      if (mainWindow && partner.view) {
        try {
          mainWindow.contentView.addChildView(partner.view);
        } catch (e) {}
      }
      updateLayoutBounds();
      notifyTabsUpdated();
      mainWindow.webContents.send('active-tab-changed', {
        id: partner.id,
        url: partner.url,
        title: partner.title
      });
      return;
    }
  }

  // Fechamento normal de aba avulsa
  if (mainWindow && tabToClose.view) {
    try {
      removeTabView(tabToClose.view);
    } catch (e) {}
  }
  if (tabToClose.view && tabToClose.view.webContents && !tabToClose.view.webContents.isDestroyed()) {
    try {
      tabToClose.view.webContents.destroy();
    } catch (e) {}
  }

  tabs.splice(index, 1);

  if (tabs.length === 0) {
    createEmptyStateTab();
    return;
  }

  if (targetId === activeTabId) {
    const nextTab = tabs[index] || tabs[index - 1];
    if (nextTab) {
      switchTab(nextTab.id);
    } else {
      createEmptyStateTab();
    }
  } else {
    notifyTabsUpdated();
  }
}

// Os relacionados dependem do processo que os originou (a raiz da pilha): quando ele some, a pilha inteira fecha junto.
function fecharRelacionadosDaPilha(tabsDaOrigem) {
  const raiz = (tabsDaOrigem || []).find(t => t && t.stackRaiz && t.stackId);
  if (!raiz) return;
  const stackId = raiz.stackId;
  const origemIds = new Set(tabsDaOrigem.map(t => t.id));
  raiz.stackRaiz = false;
  tabs.filter(t => t.stackId === stackId && !origemIds.has(t.id)).forEach(t => closeTab(t.id));
}

// A pilha deixa de existir sem fechar abas: cada processo volta a ser uma aba comum.
function desfazerPilha(stackId) {
  for (const t of tabs) if (t.stackId === stackId) { delete t.stackId; delete t.stackNumero; delete t.stackDestino; t.stackRaiz = false; }
  pilhaTopoMemo.delete(stackId);
}

// Há editor/minuta aberto no processo (na própria aba ou no grupo dela)?
function temEditorAberto(t) {
  return tabs.some(o => o.processRole === 'editor' && (t.groupId ? o.groupId === t.groupId : o.id === t.id));
}

// Liga/desliga o recurso. Desligar desfaz as pilhas existentes (cada processo volta a ter sua aba).
function definirRelacionadosEmPilha(ligado) {
  const ativo = configManager.setRelacionadosEmPilha(ligado !== false);
  if (!ativo) for (const t of tabs) { delete t.stackId; delete t.stackNumero; delete t.stackDestino; t.stackRaiz = false; }
  pilhaTopoMemo.clear();
  notifyTabsUpdated();
  return ativo;
}

// Primeira vez que um relacionado é empilhado: explica (uma vez só) por que não abriu aba própria e oferece desligar.
function avisarPrimeiraPilha() {
  if (configManager.getAvisoRelacionadosVisto()) return;
  configManager.setAvisoRelacionadosVisto(true);
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info', noLink: true, title: 'Processo relacionado',
      message: 'O processo relacionado abriu sob a aba de origem.',
      detail: 'Em vez de uma aba nova, ele fica na mesma aba, com o número de cada processo lado a lado. Clique no número (ou use Alt+PageDown e Alt+PageUp) para alternar entre os processos; o × que aparece sobre o número fecha só aquele processo. Dá para desligar isso nas configurações, em "Relacionados sob mesma aba".',
      buttons: ['Entendi', 'Desligar o recurso'], defaultId: 0, cancelId: 0
    }).then((r) => { if (r.response === 1) definirRelacionadosEmPilha(false); }).catch(() => {});
  }, 600);
}

// Alt+PageDown / Alt+PageUp: passa ao próximo / anterior processo da pilha da aba à frente.
function alternarNaPilha(passo) {
  if (!configManager.getRelacionadosEmPilha()) return false;
  const ativa = tabs.find(t => t.id === activeTabId);
  const stackId = ativa && ativa.stackId;
  if (!stackId) return false;
  const membros = ultimasEntradasBarra.filter(e => e.stackId === stackId);
  if (membros.length < 2) return false;
  const i = membros.findIndex(e => e.active);
  const alvo = membros[((i < 0 ? 0 : i) + passo + membros.length) % membros.length];
  if (alvo && alvo.alvo) switchTab(alvo.alvo);
  return true;
}

let perguntarFechamentoDaPilha =(opcoes) => dialog.showMessageBoxSync(mainWindow || null, opcoes);

// Fechamento pedido pelo usuário (X, Ctrl+W, Ctrl+Shift+W, menu da aba). Se for a origem de uma pilha com relacionados
// abertos, pergunta antes: fechar tudo, fechar só esta (relacionados viram abas próprias) ou cancelar.
function fecharPorUsuario(tabId, inteiro = false, autorizacao = 'user-titlebar') {
  const id = tabId || activeTabId;
  const alvo = tabs.find(t => t.id === id);
  if (!alvo) return;
  const fechaGrupoTodo = !!alvo.groupId && (inteiro || alvo.processRole === 'capa');
  const origem = fechaGrupoTodo ? tabs.filter(t => t.groupId === alvo.groupId) : (alvo.groupId ? [] : [alvo]);
  const raiz = origem.find(t => t.stackRaiz && t.stackId);
  const relacionados = raiz ? tabs.filter(t => t.stackId === raiz.stackId && !origem.includes(t)) : [];
  if (relacionados.length) {
    const comEditor = relacionados.filter(temEditorAberto).length;
    const escolha = perguntarFechamentoDaPilha({
      type: 'warning', noLink: true, title: 'Processos relacionados abertos',
      message: relacionados.length === 1 ? 'Este processo tem 1 relacionado aberto.' : `Este processo tem ${relacionados.length} relacionados abertos.`,
      detail: (comEditor ? `${comEditor === 1 ? '1 deles tem' : comEditor + ' deles têm'} editor/minuta aberto: o que não foi salvo será perdido se fechar tudo.\n\n` : '') +
        'Fechar tudo, ou fechar só este e manter os relacionados como abas próprias?',
      buttons: ['Fechar tudo', 'Fechar só este', 'Cancelar'], defaultId: 2, cancelId: 2
    });
    if (escolha === 2) return;
    if (escolha === 1) desfazerPilha(raiz.stackId);
  }
  if (inteiro) closeWholeTab(id, autorizacao); else closeTab(id);
}

function closeWholeTab(tabId, authorization = null) {
  const allowedAuthorizations = new Set(['user-shortcut', 'user-capa-close', 'user-titlebar', 'user-context-menu']);
  if (!allowedAuthorizations.has(authorization)) {
    const requestedTab = tabs.find(t => t.id === (tabId || activeTabId));
    logDebugger('GRUPO_FECHAMENTO_BLOQUEADO', 'Tentativa não autorizada de fechar aba unificada', {
      tabId: tabId || activeTabId || null,
      authorization,
      groupId: requestedTab?.groupId || null
    });
    return;
  }
  const targetId = tabId || activeTabId;
  const index = tabs.findIndex(t => t.id === targetId);
  if (index === -1) return;

  const targetTab = tabs[index];
  if (targetTab.isEmptyState) return;
  fecharRelacionadosDaPilha(targetTab.groupId ? tabs.filter(t => t.groupId === targetTab.groupId) : [targetTab]);

  // 1. Se pertencer a um grupo de abas unificadas (groupId):
  if (targetTab.groupId) {
    const groupId = targetTab.groupId;
    const groupTabs = tabs.filter(t => t.groupId === groupId);
    const firstIdx = tabs.findIndex(t => t.groupId === groupId);

    groupTabs.forEach(t => {
      t.isClosing = true;
      if (t.url && !t.url.startsWith('file://')) {
        closedTabsHistory.push({
          url: t.url,
          title: t.title
        });
      }
      if (mainWindow && t.view) {
        try {
          removeTabView(t.view);
        } catch (e) {}
      }
      if (t.view && t.view.webContents && !t.view.webContents.isDestroyed()) {
        try {
          t.view.webContents.destroy();
        } catch (e) {}
      }
    });

    if (closedTabsHistory.length > 30) {
      closedTabsHistory.splice(0, closedTabsHistory.length - 30);
    }

    tabs = tabs.filter(t => t.groupId !== groupId);

    if (tabs.length === 0) {
      createEmptyStateTab();
      return;
    }

    const nextTab = tabs[Math.min(firstIdx, tabs.length - 1)] || tabs[0];
    if (nextTab) {
      switchTab(nextTab.id);
    } else {
      createEmptyStateTab();
    }
    updateLayoutBounds();
    notifyTabsUpdated();
    return;
  }

  // 2. Se pertencer a um par split legada (splitWith):
  if (targetTab.splitWith) {
    const partnerId = targetTab.splitWith;
    const partner = tabs.find(t => t.id === partnerId);
    const toClose = [targetTab, partner].filter(Boolean);
    const firstIdx = tabs.findIndex(t => t.id === targetTab.id);

    toClose.forEach(t => {
      t.isClosing = true;
      if (t.url && !t.url.startsWith('file://')) {
        closedTabsHistory.push({
          url: t.url,
          title: t.title
        });
      }
      if (mainWindow && t.view) {
        try {
          removeTabView(t.view);
        } catch (e) {}
      }
      if (t.view && t.view.webContents && !t.view.webContents.isDestroyed()) {
        try {
          t.view.webContents.destroy();
        } catch (e) {}
      }
    });

    if (closedTabsHistory.length > 30) {
      closedTabsHistory.splice(0, closedTabsHistory.length - 30);
    }

    tabs = tabs.filter(t => t.id !== targetTab.id && (!partner || t.id !== partner.id));

    if (tabs.length === 0) {
      createEmptyStateTab();
      return;
    }

    const nextTab = tabs[Math.min(firstIdx, tabs.length - 1)] || tabs[0];
    if (nextTab) {
      switchTab(nextTab.id);
    } else {
      createEmptyStateTab();
    }
    updateLayoutBounds();
    notifyTabsUpdated();
    return;
  }

  // 3. Se não for unificada, fecha como aba simples normal:
  closeTab(targetId);
}

function fecharArvoresRelacionadas(sourceTab) {
  // 1. Fecha árvore no grupo atual
  if (sourceTab && sourceTab.groupId) {
    const treeInGroup = tabs.filter(t => t.groupId === sourceTab.groupId && t.processRole === 'arvore');
    treeInGroup.forEach(t => closeTab(t.id));
  }

  // 2. Fecha parceira em split legada
  if (sourceTab && sourceTab.splitWith) {
    const partner = tabs.find(t => t.id === sourceTab.splitWith);
    if (partner) closeTab(partner.id);
  }

  // 3. Fecha quaisquer outras abas de árvore de documentos abertas
  const treeTabs = tabs.filter(t => t && t.url && (
    /acao=arvore_documento_listar/i.test(t.url) ||
    /acao=acessar_documento/i.test(t.url) ||
    /acao=processo_consultar_arvore/i.test(t.url) ||
    /acao=arvore/i.test(t.url)
  ));
  treeTabs.forEach(t => {
    closeTab(t.id);
  });
}

let tabNotifyPending = false;
function notifyTabsUpdated() {
  if (tabNotifyPending) return;
  tabNotifyPending = true;
  setImmediate(() => { tabNotifyPending = false; publishTabsUpdated(); });
}
function publishTabsUpdated() {
  if (!mainWindow) return;
  const result = [];
  const visited = new Set();
  // Painéis realmente à vista na pilha ativa (inclui a mistura): só eles destacam o ícone na barra.
  const ativaNaBarra = tabs.find(t => t.id === activeTabId);
  let aVistaDaPilha = null;
  if (ativaNaBarra && stackIdDe(ativaNaBarra) && ativaNaBarra.groupId) {
    const pl = planoDeLayoutDoGrupo(ativaNaBarra);
    aVistaDaPilha = { stackId: stackIdDe(ativaNaBarra), ids: new Set([pl.esquerda && pl.esquerda.id, pl.direita && pl.direita.id, pl.direita2 && pl.direita2.id].filter(Boolean)) };
  }

  tabs.forEach(t => {
    if (visited.has(t.id)) return;

    if (t.groupId) {
      const groupTabs = tabs.filter(g => g.groupId === t.groupId);
      groupTabs.forEach(g => visited.add(g.id));

      if (groupTabs.length > 1) {
        let groupProcNumber = '';
        for (const gt of groupTabs) {
          if (gt.procNumber) {
            groupProcNumber = gt.procNumber;
            break;
          }
          const p = extractProcessNumber(gt.url, gt.title);
          if (p) {
            groupProcNumber = p;
            gt.procNumber = p;
            break;
          }
        }

        const roleOrder = { capa: 1, editor: 2, arvore: 3, left: 1, right: 2 };
        const sortedGroup = [...groupTabs].sort((a, b) => {
          const oa = roleOrder[a.processRole] || 99;
          const ob = roleOrder[b.processRole] || 99;
          return oa - ob;
        });

        const isGroupActive = groupTabs.some(g => g.id === activeTabId);
        const activeInGroup = groupTabs.find(g => g.id === activeTabId)
          || (t.lastLeftTabId && groupTabs.find(g => g.id === t.lastLeftTabId))
          || groupTabs.find(g => g.processRole === 'editor' || g.processRole === 'capa')
          || groupTabs[0];

        const { leftTab, rightTab } = resolveGroupSplitTabs(activeInGroup);

        const subtabs = sortedGroup.map(gt => {
          let displayTitle = '';
          if (gt.processRole === 'capa') {
            displayTitle = 'CAPA';
          } else if (gt.processRole === 'editor') {
            // Se houver apenas 2 abas (Capa + Editor), exibe o número do processo ao lado do ícone do editor
            displayTitle = (sortedGroup.length === 2)
              ? (groupProcNumber || gt.procNumber || 'Editor')
              : 'Editor';
          } else if (gt.processRole === 'arvore') {
            displayTitle = groupProcNumber || gt.procNumber || extractProcessNumber(gt.url, gt.title) || 'Árvore';
          } else {
            displayTitle = gt.title || 'Sem título';
          }

          const stackDoGrupo = groupTabs.find(g => g.stackId)?.stackId;
          const isOnScreen = (aVistaDaPilha && stackDoGrupo === aVistaDaPilha.stackId)
            ? aVistaDaPilha.ids.has(gt.id)
            : (gt.id === leftTab?.id || gt.id === rightTab?.id);

          return {
            id: gt.id,
            role: gt.processRole || 'default',
            displayTitle: displayTitle,
            procNumber: gt.procNumber || extractProcessNumber(gt.url, gt.title) || groupProcNumber,
            title: gt.title,
            url: gt.url,
            favicon: gt.favicon,
            active: gt.id === activeTabId,
            isOnScreen: isOnScreen
          };
        });

        result.push({
          isSplit: true,
          groupId: t.groupId,
          groupProcNumber: groupProcNumber,
          active: isGroupActive,
          activeSubTabId: isGroupActive ? activeTabId : activeInGroup.id,
          subtabs: subtabs,
          chave: 'g:' + t.groupId,
          alvo: isGroupActive ? activeTabId : activeInGroup.id,
          stackId: groupTabs.find(g => g.stackId)?.stackId || null,
          raiz: groupTabs.some(g => g.stackRaiz),
          rotulo: pilhaRelacionados.rotuloDe(groupTabs)
        });
        return;
      }
    }

    if (t.splitWith) {
      const partner = tabs.find(p => p.id === t.splitWith);
      if (partner) {
        visited.add(t.id);
        visited.add(partner.id);
        const left = (t.splitRole === 'left') ? t : partner;
        const right = (t.splitRole === 'right') ? t : partner;
        const isPairActive = left.id === activeTabId || right.id === activeTabId;
        result.push({
          isSplit: true,
          active: isPairActive,
          activeSubTabId: isPairActive ? activeTabId : left.id,
          subtabs: [
            {
              id: left.id,
              role: 'left',
              displayTitle: left.title,
              title: left.title,
              url: left.url,
              favicon: left.favicon,
              active: left.id === activeTabId
            },
            {
              id: right.id,
              role: 'right',
              displayTitle: right.title,
              title: right.title,
              url: right.url,
              favicon: right.favicon,
              active: right.id === activeTabId
            }
          ]
        });
        return;
      }
    }

    visited.add(t.id);
    const singleDisplayTitle = t.isEmptyState ? 'Início' : (t.title || 'Nova Aba');
    result.push({
      isSplit: false,
      id: t.id,
      title: singleDisplayTitle,
      url: t.url,
      favicon: t.favicon,
      active: t.id === activeTabId,
      isEmptyState: !!t.isEmptyState,
      chave: 't:' + t.id,
      alvo: t.id,
      stackId: t.stackId || null,
      raiz: !!t.stackRaiz,
      rotulo: pilhaRelacionados.rotuloDe([t])
    });
  });

  ultimasEntradasBarra = result;
  mainWindow.webContents.send('tabs-updated', configManager.getRelacionadosEmPilha() ? pilhaRelacionados.colapsar(result, pilhaTopoMemo) : result);
}

function getVisualTabGroups() {
  const groups = [];
  const visited = new Set();

  tabs.forEach(t => {
    if (visited.has(t.id)) return;

    if (t.groupId) {
      const groupTabs = tabs.filter(g => g.groupId === t.groupId);
      if (groupTabs.length > 1) {
        groupTabs.forEach(g => visited.add(g.id));
        groups.push(groupTabs);
        return;
      }
    }

    if (t.splitWith) {
      const partner = tabs.find(p => p.id === t.splitWith);
      if (partner) {
        visited.add(t.id);
        visited.add(partner.id);
        const left = (t.splitRole === 'left') ? t : partner;
        const right = (t.splitRole === 'right') ? t : partner;
        groups.push([left, right]);
        return;
      }
    }

    visited.add(t.id);
    groups.push([t]);
  });

  return groups;
}

// Arrastar um processo para cima de outro (mesmo sem relação): o arrastado entra na pilha do alvo, ao lado dele.
// Índices são os slots da barra (mesma base de reorderTabs). Retorna true se empilhou.
function empilharPorArraste(fromIndex, toIndex) {
  if (!configManager.getRelacionadosEmPilha()) return false;
  const slots = pilhaRelacionados.agruparSlots(getVisualTabGroups());
  if (fromIndex === toIndex || !slots[fromIndex] || !slots[toIndex]) return false;
  const movido = slots[fromIndex];
  const alvo = slots[toIndex];
  const ehProcesso = (grupo) => grupo.some(t => t.groupId || t.processRole === 'capa' || t.stackNumero);
  if (!ehProcesso(movido) || !ehProcesso(alvo)) return false;
  if (movido.some(t => t.stackId) && alvo.some(t => t.stackId)) return false; // duas pilhas: não funde
  const raizAlvo = alvo.find(t => t.stackId) || alvo.find(t => t.processRole === 'capa') || alvo[0];
  const stackId = raizAlvo.stackId || movido.find(t => t.stackId)?.stackId || ('stk_' + raizAlvo.id);
  if (!alvo.some(t => t.stackId) && !movido.some(t => t.stackId)) { raizAlvo.stackRaiz = true; }
  const marcarGrupo = (grupo) => {
    const ponta = grupo.find(t => t.processRole === 'capa') || grupo[0];
    if (!stackIdDe(ponta)) ponta.stackId = stackId;
  };
  marcarGrupo(alvo);
  marcarGrupo(movido);
  // O arrastado passa a ficar logo depois do alvo (ordem de abertura da pilha).
  const grupos = slots.slice();
  const [m] = grupos.splice(fromIndex, 1);
  const iAlvo = grupos.indexOf(alvo);
  grupos.splice(iAlvo + 1, 0, m);
  tabs = grupos.flat();
  const entra = movido.find(t => t.processRole === 'editor' || t.processRole === 'capa') || movido[0];
  switchTab(entra.id);
  return true;
}

function reorderTabs(fromIndex, toIndex) {
  const groups = configManager.getRelacionadosEmPilha() ? pilhaRelacionados.agruparSlots(getVisualTabGroups()) : getVisualTabGroups(); // pilha de relacionados = um slot, como na barra
  if (fromIndex < 0 || fromIndex >= groups.length || toIndex < 0 || toIndex >= groups.length) return;
  if (fromIndex === toIndex) return;

  const [movedGroup] = groups.splice(fromIndex, 1);
  groups.splice(toIndex, 0, movedGroup);

  tabs = groups.flat();

  // Ao soltar a aba, garante que ela permaneça ou se torne ativa, como nos navegadores convencionais
  if (movedGroup && movedGroup.length > 0) {
    const isCurrentlyActive = movedGroup.some(t => t.id === activeTabId);
    if (!isCurrentlyActive) {
      const targetToActivate = movedGroup.find(t => t.processRole === 'editor' || t.processRole === 'capa') || movedGroup[0];
      if (targetToActivate) {
        switchTab(targetToActivate.id);
        return;
      }
    }
  }

  notifyTabsUpdated();
}

const caminhoOrganizadorSmart = () => `chrome-extension://${superprocId}/organizador/organizador.html`;
function ehUrlOrganizadorSmart(url) {
  try {
    const u = new URL(url);
    return !!superprocId && u.protocol === 'chrome-extension:' && u.hostname === superprocId && u.pathname === '/organizador/organizador.html';
  } catch { return false; }
}
function abrirOrganizadorSmart(tipo) {
  if (!superprocId) return;
  const alvo = `${caminhoOrganizadorSmart()}?m=${tipo === 'evt' ? 'evt' : 'loc'}`;
  // Reaproveita a aba já aberta do organizador em vez de abrir outra.
  const aberta = tabs.find(t => t.view && !t.view.webContents.isDestroyed() && ehUrlOrganizadorSmart(t.view.webContents.getURL()));
  if (aberta) { aberta.view.webContents.loadURL(alvo).catch(() => {}); switchTab(aberta.id); return; }
  createTab(alvo, false, {});
}

function openExtensionOptions(extensionName, coords) {
  let targetUrl = '';
  let windowTitle = '';

  if (extensionName === 'azflow') {
    if (azflowId) {
      targetUrl = `chrome-extension://${azflowId}/popup.html`;
      windowTitle = 'AZflow - Configurações';
    } else {
      if (!extensaoInstalador.pastaInstalada('azflow', app.getPath('userData'))) instalarExtensaoDaLoja('azflow');
      else dialog.showErrorBox('AZflow', 'A extensão AZflow não foi carregada no momento.');
      return;
    }
  } else if (extensionName === 'epryx') {
    if (!epryxId) {
      if (!extensaoInstalador.pastaInstalada('epryx', app.getPath('userData'))) instalarExtensaoDaLoja('epryx');
      else dialog.showErrorBox('Epryx', 'A extensão Epryx não foi carregada no momento.');
      return;
    }
    targetUrl = `chrome-extension://${epryxId}/src/settings/popup.html`;
    windowTitle = 'Epryx - Configurações';
  } else if (extensionName === 'superproc') {
    if (superprocId) {
      targetUrl = `chrome-extension://${superprocId}/popup/popup.html`;
      windowTitle = 'SuperPROC - Configurações';
    } else {
      if (!dirSuperprocInstalada()) { instalarSuperproc(); return; }
      targetUrl = `file://${path.join(__dirname, '..', 'extensao-superproc', 'popup', 'popup.html')}`;
      windowTitle = 'SuperPROC - Configurações';
    }
  }

  if (!targetUrl || !mainWindow || mainWindow.isDestroyed()) return;

  // Se a janela já estiver visível exibindo a mesma extensão, oculta (toggle)
  if (extOptionsWin && !extOptionsWin.isDestroyed() && extOptionsWin.isVisible() && currentLoadedExt === extensionName) {
    hideExtensionOptions();
    return;
  }

  hideCfgMenu();
  hideDownloadsMenu();
  hideHistoryMenu();
  hideHoverMenu();

  if (!extOptionsWin || extOptionsWin.isDestroyed()) {
    extOptionsWin = new BrowserWindow({
      parent: mainWindow,
      frame: false,
      roundedCorners: true,
      transparent: false,
      backgroundColor: '#ffffff',
      hasShadow: true,
      show: false,
      skipTaskbar: true,
      resizable: false,
      width: 480,
      height: 640,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: false,
        preload: path.join(__dirname, 'extopts-preload.js')
      }
    });

    // O painel NÃO fecha ao perder o foco (clicar em outra janela ou aplicativo). Fecha por: clique na janela principal
    // (evento 'focus' dela), botão de fechar do próprio painel ou ESC.
    extOptionsWin.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && !input.control && !input.alt && !input.meta && !input.shift) {
        event.preventDefault();
        hideExtensionOptions();
      }
    });
    prepararJanelaAzflow(extOptionsWin);
  }

  currentLoadedExt = extensionName;

  const [winX, winY] = mainWindow.getPosition();
  const [winW] = mainWindow.getSize();

  let menuW = extensionName === 'superproc' ? 420 : 480;
  let menuH = extensionName === 'superproc' ? 600 : 640;

  let targetX = winX + (coords && typeof coords.x === 'number' ? coords.x : (winW - menuW - 10));
  let targetY = winY + (coords && typeof coords.y === 'number' ? coords.y : 40);

  const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
  const b = display.workArea;
  menuW = Math.min(menuW, Math.max(1, b.width - 16));
  menuH = Math.min(menuH, Math.max(1, b.height - 16));

  if (targetX + menuW > b.x + b.width) targetX = b.x + b.width - menuW - 8;
  if (targetX < b.x) targetX = b.x + 8;
  if (targetY + menuH > b.y + b.height) targetY = b.y + b.height - menuH - 8;
  if (targetY < b.y) targetY = b.y + 8;

  extOptionsWin.setPosition(Math.round(targetX), Math.round(targetY));
  // Janela não redimensionável ignora setSize em alguns casos: libera só o tempo de ajustar (evita área em branco sobrando).
  extOptionsWin.setResizable(true);
  extOptionsWin.setContentSize(menuW, menuH);
  extOptionsWin.setResizable(false);

  extOptionsWin.loadURL(targetUrl);
  extOptionsShownAt = Date.now();
  extOptionsWin.show();
  extOptionsWin.focus();
}


// Aviso efêmero, sem foco, exibido depois que qualquer download é concluído.
// Uma janela pequena fica acima da WebContentsView ativa sem interromper a tela.
let downloadToastWin = null;
let downloadToastTimer = null;
function showDownloadToast(fileName) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (downloadToastTimer) clearTimeout(downloadToastTimer);

  const safeName = String(fileName || 'arquivo').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:transparent;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    #toast{height:34px;display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #0a78a4;background:#083c52;color:#fff;box-shadow:0 3px 10px #0005;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    b{font-weight:600;color:#aeeaff}.ok{color:#77e2a1;font-size:14px}
  </style></head><body><div id="toast"><span class="ok">✓</span><b>Salvo:</b><span>${safeName}</span></div></body></html>`;
  const bounds = mainWindow.getBounds();
  const width = Math.min(390, Math.max(235, Math.round(bounds.width * 0.24)));
  const toastBounds = { x: bounds.x + bounds.width - width - 12, y: bounds.y + 42, width, height: 34 };

  if (!downloadToastWin || downloadToastWin.isDestroyed()) {
    downloadToastWin = new BrowserWindow({
      parent: mainWindow, frame: false, transparent: true, resizable: false,
      movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
      show: false, ...toastBounds,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    downloadToastWin.setAlwaysOnTop(true, 'floating');
  } else {
    downloadToastWin.setBounds(toastBounds);
  }

  downloadToastWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).finally(() => {
    if (!downloadToastWin || downloadToastWin.isDestroyed()) return;
    downloadToastWin.showInactive();
    downloadToastTimer = setTimeout(() => {
      if (downloadToastWin && !downloadToastWin.isDestroyed()) downloadToastWin.hide();
    }, 2000);
  });
}

// Aviso efêmero genérico (sem foco) no topo da área de conteúdo. ms=0 mantém até o próximo aviso.
let avisoWin = null;
let avisoTimer = null;
const soErro = (fn) => (texto, nivel, ...resto) => (nivel === 'erro' ? fn(texto, nivel, ...resto) : undefined); // envio ao Copilot: só avisos de erro
function mostrarAviso(texto, nivel = 'info', ms = 3500, naColuna = false, regiao = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (avisoTimer) { clearTimeout(avisoTimer); avisoTimer = null; }
  const seguro = String(texto || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cores = { ok: ['#0f5132', '#77e2a1', '✓'], erro: ['#5c1a1a', '#ff9d9d', '!'], info: ['#083c52', '#aeeaff', '…'] }[nivel] || ['#083c52', '#aeeaff', '…'];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:transparent;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    #t{height:34px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid ${cores[1]}66;background:${cores[0]};color:#fff;box-shadow:0 3px 10px #0005;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    i{font-style:normal;color:${cores[1]};font-size:14px}
  </style></head><body><div id="t"><i>${cores[2]}</i><span>${seguro}</span></div></body></html>`;
  const b = mainWindow.getContentBounds();
  const areas = getLayoutAreas();
  const largura = Math.min(560, Math.max(260, Math.round(areas.conteudo.width * 0.7)));
  let limites = { x: b.x + areas.conteudo.x + Math.round((areas.conteudo.width - largura) / 2), y: b.y + 42, width: largura, height: 34 };
  if (regiao && regiao.width > 0) { // sobre a região que recebe o anexo (acima dela; abaixo se não houver espaço)
    const largura2 = Math.max(200, Math.min(regiao.width, 560));
    const acima = regiao.y - 40;
    limites = { x: b.x + regiao.x + Math.round((regiao.width - largura2) / 2), y: b.y + (acima >= 4 ? acima : regiao.y + regiao.height + 6), width: largura2, height: 34 };
  } else if (naColuna && areas.copilot) { // sobre a região do chat do Copilot, logo acima do campo de mensagem
    const c = areas.copilot;
    limites = { x: b.x + c.x + 12, y: b.y + c.y + Math.round(c.height * 0.37), width: Math.max(200, c.width - 24), height: 34 };
  }
  if (!avisoWin || avisoWin.isDestroyed()) {
    avisoWin = new BrowserWindow({
      parent: mainWindow, frame: false, transparent: true, resizable: false,
      movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
      show: false, ...limites,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    avisoWin.setAlwaysOnTop(true, 'floating');
  } else {
    avisoWin.setBounds(limites);
  }
  avisoWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).finally(() => {
    if (!avisoWin || avisoWin.isDestroyed()) return;
    avisoWin.showInactive();
    if (ms > 0) avisoTimer = setTimeout(() => { if (avisoWin && !avisoWin.isDestroyed()) avisoWin.hide(); }, ms);
  });
}

function recordCompletedDownload(savedPath, size) {
  const record = { name: path.basename(savedPath), path: savedPath, size, date: Date.now() };
  configManager.addRecentDownload(record);
  showDownloadToast(record.name);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('downloads-updated', { recent: configManager.getRecentDownloads(), lastDownloaded: record });
  }
  if (downloadsMenuWin && !downloadsMenuWin.isDestroyed()) {
    downloadsMenuWin.webContents.send('downloads-updated', { recent: configManager.getRecentDownloads(), lastDownloaded: record });
  }
}

function setupDownloadManager() {
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const dlConfig = configManager.getDownloadsConfig();
    // O nome é normalizado logo abaixo e pode receber a extensão .pdf.
    // Portanto ele precisa ser mutável; `const` fazia o evento will-download
    // falhar antes de configurar o destino e registrar o item no histórico.
    let targetFileName = item.getFilename() || 'documento.pdf';

    targetFileName = targetFileName.replace(/[\\/\\\\:*?"<>|]/g, '_').replace(/\\s+/g, ' ').trim();
    if (!targetFileName.toLowerCase().endsWith('.pdf') && (item.getMimeType() === 'application/pdf' || item.getURL().includes('.pdf') || item.getURL().includes('acessar_documento'))) {
      targetFileName += '.pdf';
    }

    let baseDir = (dlConfig.downloadPath && fs.existsSync(dlConfig.downloadPath))
      ? dlConfig.downloadPath
      : '';
    if (!baseDir) {
      try {
        baseDir = app.getPath('downloads');
      } catch (_) {
        baseDir = process.env.USERPROFILE || '.';
      }
    }

    if (dlConfig.autoDownload) {
      let finalPath = path.join(baseDir, targetFileName);
      const ext = path.extname(targetFileName);
      const baseName = path.basename(targetFileName, ext);
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        finalPath = path.join(baseDir, `${baseName} (${counter})${ext}`);
        counter++;
      }
      item.setSavePath(finalPath);
    } else {
      const chosen = dialog.showSaveDialogSync(mainWindow, {
        title: 'Salvar Documento PDF',
        defaultPath: path.join(baseDir, targetFileName),
        filters: [
          { name: 'Documentos PDF (*.pdf)', extensions: ['pdf'] },
          { name: 'Todos os arquivos (*.*)', extensions: ['*'] }
        ]
      });

      if (chosen) {
        item.setSavePath(chosen);
      } else {
        item.cancel();
        return;
      }
    }

    item.once('done', (event, state) => {
      if (state === 'completed') {
        recordCompletedDownload(item.getSavePath(), item.getTotalBytes());
      } else if (state === 'interrupted') {
        console.warn('[Downloads] Download interrompido:', item.getFilename());
      }
    });
  });
}

// --- REGISTRO DE IPC (COMUNICAÇÃO COM TITLEBAR) ---
function setupIPC() {
  const { createGuardedIpc, isRecordedDownload, isProcessNavigation } = require('./ipc-policy');
  let fastCopilotCaixa = null; // janela da caixa do Fast Copilot (criada adiante)
  const local = (role, owner, file) => ({ role, contents: owner?.webContents, file: path.join(__dirname, file) });
  const hostIPC = createGuardedIpc(ipcMain, {
    surfaces: () => [
      local('titlebar', mainWindow, 'titlebar/titlebar.html'),
      local('dialog', activeDialog, 'dialogs/dialog.html'),
      local('cfg', cfgMenuWin, 'cfg-menu/cfg-menu.html'),
      local('downloads', downloadsMenuWin, 'downloads-menu/downloads-menu.html'),
      local('history', historyMenuWin, 'history-menu/history-menu.html'),
      local('hover', hoverMenuWin, 'hover-menu/hover-menu.html'),
      local('hover', hoverSubWin, 'hover-menu/hover-menu.html'),
      local('find', findWindow, 'find/find.html'),
      local('spell', spellcheck.getWindow(), 'spellcheck/manage.html'),
      local('fastcopilot', fastCopilotCaixa && fastCopilotCaixa.getWindow(), 'fast-copilot-box/box.html'),
      ...(copilotShellLigado ? [local('copilotshell', colunaCopilot.getView(), 'copilot-shell/shell.html')] : []),
      ...(anfitriaoLigado ? [local('copilotanfitriao', colunaCopilot.getView(), 'copilot-anfitriao/anfitriao.html')] : []),
      ...(cartaoConsentimentoRef && cartaoConsentimentoRef.getView() ? [local('copilotconsent', cartaoConsentimentoRef.getView(), 'copilot-shell/consent-overlay.html')] : []),
      local('panel', sidePanel.headerView, 'panel/panel-header.html'),
      local('panel', sidePanel.edgeView, 'panel/panel-edge.html'),
      ...tabs.filter(tab => tab.isEmptyState).map(tab => local('empty', tab.view, 'empty/empty-tab.html'))
    ],
    allowPage: (channel, event) => {
      const wc = event.sender;
      if (!wc || wc.isDestroyed() || !event.senderFrame) return false;
      // Ponte do cr-host: só a coluna do Copilot, no quadro principal e numa origem do cr-host. Abas comuns nunca passam aqui.
      if (channel.startsWith('copilot-cr-')) return !!transporteCrRef && transporteCrRef.remetenteValido(event);
      const tab = tabs.find(item => item.view?.webContents === wc);
      const panel = [...panelViewPool.values()].some(item => item.view?.webContents === wc);
      // Impressão aceita frames filhos reais de uma aba/painel gerenciado (PDF incorporado).
      if (channel === 'superproc:print-pdf') return !!(tab || panel) && wc.mainFrame.framesInSubtree.includes(event.senderFrame);
      if (channel === 'superproc:modulo-usuario' || channel === 'superproc:abrir-organizador') return !!extOptionsWin && !extOptionsWin.isDestroyed() && wc === extOptionsWin.webContents && !!superprocId && event.senderFrame === wc.mainFrame && String(event.senderFrame.url).startsWith('chrome-extension://' + superprocId + '/popup/');
      if (event.senderFrame !== wc.mainFrame) return false;
      if (channel === 'panel-content-toggle-pin') return panel && sidePanel.isOpen && sidePanel.contentView?.webContents === wc;
      return !!tab && !tab.isEmptyState;
    }
  });
  const recordedDownload = file => isRecordedDownload(file, configManager.getRecentDownloads());
  spellcheck.installIpc(hostIPC, { getParent: () => mainWindow, icon: getBrowserIconPath() });
  // Módulos .js importados no popup da extensão SuperPROC: gravados na pasta da extensão no perfil (nunca na do pacote).
  hostIPC.handle('superproc:modulo-usuario', (_event, pedido) => {
    const dir = dirSuperprocInstalada();
    if (!dir) throw Error('A extensão SuperPROC não está instalada.');
    return modulosUsuario.executar(dir, pedido);
  });
  // Organizador de grupos (Smart Localizadores / Smart Eventos): abre a página da extensão como aba normal.
  hostIPC.handle('superproc:abrir-organizador', (_event, tipo) => {
    if (!superprocId) throw Error('A extensão SuperPROC não está carregada.');
    abrirOrganizadorSmart(tipo === 'evt' ? 'evt' : 'loc');
  });
  hostIPC.on('superproc:print-pdf', event => {
    // O frame solicitante é definido pelo Electron, não por dados da página.
    if (event.senderFrame) printToPdf.request(event.sender, event.senderFrame);
  });
  // Janela
  hostIPC.on('window-minimize', () => mainWindow && mainWindow.minimize());
  hostIPC.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      if (!V2_SMOKE) mainWindow.maximize();
    }
  });
  hostIPC.on('window-close', event => {
    if (hostCloseGuard?.isTrustedSender(event)) hostCloseGuard.closeFromUser();
  });
  hostIPC.handle('window-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);

  // Abas
  hostIPC.handle('tabs-get-all', () => {
    return tabs.map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      active: t.id === activeTabId
    }));
  });
  hostIPC.on('tab-switch', (e, tabId) => switchTab(tabId));
  hostIPC.on('tab-switch-subaba', (e, tabId) => cliqueSubabaNaPilha(tabId));
  hostIPC.on('tab-switch-processo', (e, tabId) => {
    const t = tabs.find(x => x.id === tabId);
    if (t && stackIdDe(t)) pilhaMix.delete(stackIdDe(t));
    switchTab(tabId);
  });
  hostIPC.on('tab-new', (e, url, depoisDeId) => createTab(url, false, typeof depoisDeId === 'string' ? { depoisDeId } : {}));
  hostIPC.on('tab-open-process-url', (e, targetUrl) => {
    if (!isProcessNavigation(e.senderFrame.url, targetUrl)) return;
    const senderTab = tabs.find(t => t.view && t.view.webContents && t.view.webContents.id === e.sender.id);
    if (senderTab) handleOpenProcessTab(senderTab.id, targetUrl);
  });
  hostIPC.on('tab-split-create', (e, targetUrl) => {
    if (activeTabId && targetUrl) {
      createSplitTab(activeTabId, targetUrl);
    }
  });
  hostIPC.on('tab-close', (e, tabId) => fecharPorUsuario(tabId));
  hostIPC.on('tab-close-whole', (e, tabId) => {
    // Somente a titlebar do SuperPROC pode autorizar o fechamento integral.
    if (!mainWindow || e.sender.id !== mainWindow.webContents.id) return;
    const senderTab = tabs.find(t => t.view && t.view.webContents && t.view.webContents.id === e.sender.id);
    const targetId = tabId || (senderTab ? senderTab.id : activeTabId);
    fecharPorUsuario(targetId, true, 'user-titlebar');
  });
  hostIPC.on('tab-page-close-request', (e) => {
    const senderTab = tabs.find(t => t.view && t.view.webContents && t.view.webContents.id === e.sender.id);
    if (senderTab) {
      routePageCloseRequest(senderTab.id, 'preload-ipc');
    }
  });
  hostIPC.on('panel-toggle-pin', () => toggleSidePanelPin());
  hostIPC.on('panel-toggle-copilot', () => {
    const l = configManager.encontrarLink(sidePanel.activeKey);
    if (!l) return;
    configManager.setLinkCopilot(l.id, l.copilot !== true);
    notifyPanelHeaderData(); // a ponte do Copilot relê a lista de abas a cada ~0,5 s e passa a mostrar (ou esconder) o item
  });
  hostIPC.on('panel-content-toggle-pin', (event) => {
    // Somente o conteúdo do painel visível pode alterar sua fixação.
    if (sidePanel.isOpen && hasLiveWebContents(sidePanel.contentView) &&
        event.sender === sidePanel.contentView.webContents) {
      toggleSidePanelPin();
    }
  });
  hostIPC.on('tab-refresh-parent-request', () => {
    // Desativado: o usuário não deseja recarregamento automático da aba remanescente ao salvar/fechar
  });
  hostIPC.on('tab-merge-stack', (e, { fromIndex, toIndex }) => { empilharPorArraste(fromIndex, toIndex); });
  hostIPC.on('tab-reorder', (e, { fromIndex, toIndex }) => {
    reorderTabs(fromIndex, toIndex);
  });
  hostIPC.on('page-navbar-dimension', (event, reportedWidth) => {
    const leftView = getLeftActiveView();
    if (leftView && leftView.webContents && leftView.webContents.id === event.sender.id) {
      updateTitlebarNavbarGradient(reportedWidth);
    }
  });
  hostIPC.on('fechar-arvores', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    fecharArvoresRelacionadas(activeTab);
  });
  hostIPC.on('empty-action-home', () => {
    createTab(getEprocHomeUrl());
  });
  hostIPC.on('empty-action-localizadores', () => {
    openLocalizadoresFromEmptyState().catch(error => console.warn('[SuperPROC] Falha ao abrir Meus Localizadores:', error.message));
  });
  hostIPC.on('empty-action-undo', () => {
    undoCloseTab();
  });
  hostIPC.on('empty-action-close', event => {
    const source = tabs.find(t => t.isEmptyState && t.view?.webContents === event.sender);
    const principal = event.senderFrame === event.sender.mainFrame;
    logDebugger('EMPTY_FECHAR', 'Botão Fechar da tela vazia acionado', { origemValida: !!source, quadroPrincipal: principal, guardaPronta: !!hostCloseGuard });
    if (source && principal) hostCloseGuard?.closeFromUser();
  });
  hostIPC.on('tab-reload', (event, targetTabId) => {
    let target = null;
    if (targetTabId) {
      target = tabs.find(t => t.id === targetTabId);
    }
    if (!target) {
      target = tabs.find(t => t.id === activeTabId);
    }
    if (!target && tabs.length > 0) {
      target = tabs[0];
    }
    if (target) {
      reloadTab(target);
    }
  });
  hostIPC.on('tab-back', (event, targetTabId) => {
    const activeTab = getRootNavigationTab(tabs, (targetTabId && tabs.find(t => t.id === targetTabId)) || tabs.find(t => t.id === activeTabId));
    if (activeTab && activeTab.view && canNavBack(activeTab.view.webContents)) {
      navBack(activeTab.view.webContents);
    }
  });
  hostIPC.on('tab-forward', (event, targetTabId) => {
    const activeTab = getRootNavigationTab(tabs, (targetTabId && tabs.find(t => t.id === targetTabId)) || tabs.find(t => t.id === activeTabId));
    if (activeTab && activeTab.view && canNavForward(activeTab.view.webContents)) {
      navForward(activeTab.view.webContents);
    }
  });

  // --- BUSCA NA PÁGINA (FIND IN PAGE / CTRL+F FLUTUANTE) ---
  hostIPC.on('find-open', (event, target) => {
    openFindWindow(target || 'tab');
  });

  hostIPC.on('find-close', () => {
    closeFindWindow();
  });

  hostIPC.on('find-stop', () => {
    findController.stop().catch(() => {});
  });

  hostIPC.on('find-search', (event, { text, options } = {}) => {
    findController.search(text || '', options || {}).catch(() => {});
  });

  hostIPC.on('find-next', (event, { forward } = {}) => {
    findController.next(forward !== false).catch(() => {});
  });

  // Clique numa linha do glossário: a ocorrência vira a ativa (a contagem e a janela do glossário a seguem)
  hostIPC.on('find-glossary-jump', (event, { index } = {}) => {
    findController.goTo(Number(index) || 0).catch(() => {});
  });

  // Redimensionar a janela de busca (quando glossário abre/fecha)
  hostIPC.on('find-resize', (event, { height }) => {
    if (findWindow && !findWindow.isDestroyed()) {
      const [w] = findWindow.getSize();
      findWindow.setSize(w, Math.max(60, Math.round(height)));
    }
  });

  // Extrair ocorrências com contexto da página ativa para o glossário (todas, sem limite)
  hostIPC.on('find-glossary-request', async (event, { term, options } = {}) => {
    const reply = (entries) => {
      if (findWindow && !findWindow.isDestroyed()) findWindow.webContents.send('find-glossary-results', entries);
    };
    if (!term || !String(term).trim()) { reply([]); return; }

    // Usar a view que originou Ctrl+F, não a aba que porventura esteja ativa.
    const targetWc = getFindTargetWebContents();
    if (!targetWc || targetWc.isDestroyed()) { reply([]); return; }

    try {
      let results = await listGlossary(targetWc, String(term).trim(), options || {});
      // Sem ocorrências no DOM: tenta o texto do PDF (leitor incorporado ou PDF aberto na aba).
      if (!results.length) {
        try { results = await pdfReader.glossary(targetWc, String(term).trim(), Number.MAX_SAFE_INTEGER); } catch (_) {}
      }
      reply(results);
    } catch (_) {
      reply([]);
    }
  });

  // URL & Navegação

  hostIPC.handle('get-active-url', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    return activeTab ? activeTab.view.webContents.getURL() : '';
  });

  hostIPC.on('navigate-to', (e, url) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.view) {
      activeTab.view.webContents.loadURL(url);
    }
  });

  hostIPC.on('open-link', (e, { url, inNewTab }) => {
    if (inNewTab) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      const referrer = activeTab && activeTab.view ? activeTab.view.webContents.getURL() : undefined;
      createTab(url, false, { referrer });
    } else {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.view) {
        activeTab.view.webContents.loadURL(url);
      }
    }
  });

  // Configurações e Links (Juris / Leis)
  hostIPC.handle('config-get', () => configManager.loadConfig());
  hostIPC.handle('config-set-corretor-ortografico', (event, enabled) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof enabled !== 'boolean') throw Error('Origem inválida.');
    const updated = configManager.loadConfig();
    updated.corretorOrtografico = enabled;
    configManager.saveConfig(updated);
    spellcheck.setEnabled(enabled);
    return enabled;
  });
  // Switch "Permitir que o Copilot use o conteúdo do navegador" (equivale ao controle 479 de edge://settings/ai).
  hostIPC.handle('config-get-copilot-politicas-ia', (event) => {
    if (!activeDialog || event.sender !== activeDialog.webContents) throw Error('Origem inválida.');
    const POL = require('./copilot-shell/politicas-ia');
    return { groups: POL.grupos(), items: POL.descrever(POL.resolver(configManager.loadConfig().copilotPoliticasIA)) };
  });
  hostIPC.handle('config-set-copilot-politica-ia', async (event, nome, valor) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof nome !== 'string') throw Error('Origem inválida.');
    const POL = require('./copilot-shell/politicas-ia');
    const limpo = POL.validar(nome, valor);
    const atual = POL.resolver(configManager.loadConfig().copilotPoliticasIA);
    atual[nome] = limpo;
    // No arquivo fica só o que difere do padrão (caixa desligada ou lista preenchida): são centenas de políticas.
    if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotPoliticasIA: POL.compactar(atual) })) throw Error('Não foi possível salvar.');
    await configManager.flush();
    return limpo;
  });
  // Caixa de um ramo da árvore: liga ou desliga várias políticas de caixa numa gravação só.
  hostIPC.handle('config-set-copilot-politicas-ia-lote', async (event, nomes, valor) => {
    if (!activeDialog || event.sender !== activeDialog.webContents) throw Error('Origem inválida.');
    const POL = require('./copilot-shell/politicas-ia');
    const novo = POL.aplicarLote(POL.resolver(configManager.loadConfig().copilotPoliticasIA), nomes, valor);
    if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotPoliticasIA: POL.compactar(novo) })) throw Error('Não foi possível salvar.');
    await configManager.flush();
    return valor;
  });
  hostIPC.handle('config-get-copilot-admin', (event) => {
    if (!activeDialog || event.sender !== activeDialog.webContents) throw Error('Origem inválida.');
    return require('./copilot-shell/ferramentas-host').lerPoliticaDoDisco(app.getPath('userData'));
  });
  hostIPC.handle('config-set-copilot-admin', (event, chave, valor) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof chave !== 'string' || typeof valor !== 'boolean') throw Error('Origem inválida.');
    return require('./copilot-shell/ferramentas-host').gravarChaveDePolitica(app.getPath('userData'), chave, valor);
  });
  hostIPC.handle('config-set-copilot-texto-completo', async (event, enabled) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof enabled !== 'boolean') throw Error('Origem inválida.');
    if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotIgnorarMaxCharsDaPagina: enabled })) throw Error('Não foi possível salvar.');
    await configManager.flush();
    return enabled;
  });
  hostIPC.handle('config-set-copilot-ia-local', async (event, enabled) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof enabled !== 'boolean') throw Error('Origem inválida.');
    const POL = require('./copilot-shell/politicas-ia');
    const pols = POL.resolver(configManager.loadConfig().copilotPoliticasIA);
    pols.GenAILocalFoundationalModelSettings = enabled; pols.BuiltInAIAPIsEnabled = enabled;
    if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotIaNoDispositivo: enabled, copilotPoliticasIA: POL.compactar(pols) })) throw Error('Não foi possível salvar.');
    await configManager.flush();
    return enabled;
  });
  hostIPC.handle('config-set-copilot-contexto', async (event, enabled) => {
    if (!activeDialog || event.sender !== activeDialog.webContents || typeof enabled !== 'boolean') throw Error('Origem inválida.');
    if (consentimentoCopilotRef) {
      if (!(await consentimentoCopilotRef.definir(enabled))) throw Error('Não foi possível salvar.');
      return enabled;
    }
    if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotConsentimentoEstado: enabled ? 1 : 2, copilotContextoPermitido: enabled })) throw Error('Não foi possível salvar.');
    await configManager.flush();
    return enabled;
  });
  hostIPC.handle('config-add-link', (e, { category, nome, url }) => {
    const updated = configManager.addLink(category, nome, url);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });

  hostIPC.handle('config-remove-link', (e, { category, id }) => {
    const updated = configManager.removeLink(category, id);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });
  hostIPC.handle('config-update-link', (e, { category, id, nome, url }) => {
    const updated = configManager.updateLink(category, id, nome, url);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });
  hostIPC.handle('config-set-category-links', (e, { category, links }) => {
    const updated = configManager.setCategoryLinks(category, links);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });
  hostIPC.handle('config-save-all-categories', (e, categoriesMap) => {
    const updated = configManager.saveAllCategories(categoriesMap);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });
  hostIPC.handle('config-move-link', (e, { category, id, direction }) => {
    const updated = configManager.moveLink(category, id, direction);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });

  // --- MODAIS E DIÁLOGOS ---
  let activeDialog = null;
  let activeDialogData = {};

  dialogBridge.show = (type, extra) => showDialog(type, extra);
  function showDialog(type, extraData = {}) {
    if (activeDialog && !activeDialog.isDestroyed()) {
      activeDialog.close();
    }
    const activeTab = tabs.find(t => t.id === activeTabId);
    activeDialogData = {
      type,
      url: activeTab ? activeTab.view.webContents.getURL() : '',
      ...extraData
    };

    let dialogWidth = 500;
    let dialogHeight = 280;

    if (type === 'manage-links') {
      dialogWidth = 780;
      dialogHeight = 580;
    } else if (type === 'settings') {
      dialogWidth = 620;
      dialogHeight = 660;
    } else if (type === 'url') {
      dialogWidth = 560;
      dialogHeight = 220;
    }

    // Configurações e Gerenciar links lembram tamanho e posição da última vez (só se ainda couberem em algum monitor).
    const memoriza = type === 'settings' || type === 'manage-links';
    const arquivoBounds = path.join(app.getPath('userData'), 'dialog-bounds.json');
    let salvo = null;
    if (memoriza) {
      try {
        const b = JSON.parse(fs.readFileSync(arquivoBounds, 'utf8'))[type];
        const ok = b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width >= 400 && b.height >= 300;
        if (ok) {
          const area = screen.getDisplayMatching(b).workArea;
          const ix = Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x);
          const iy = Math.min(b.y + b.height, area.y + area.height) - Math.max(b.y, area.y);
          if (ix >= 200 && iy >= 120) salvo = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
        }
      } catch { /* sem posição salva */ }
    }

    const dlg = activeDialog = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: salvo ? salvo.width : dialogWidth,
      height: salvo ? salvo.height : dialogHeight,
      ...(salvo ? { x: salvo.x, y: salvo.y } : {}),
      resizable: true,
      frame: false,
      roundedCorners: false,
      transparent: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      title: 'eproc',
      icon: getBrowserIconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'dialogs', 'preload-dialog.js'),
        contextIsolation: true
      }
    });

    if (memoriza) {
      dlg.on('close', () => {
        try {
          if (dlg.isMaximized() || dlg.isMinimized() || dlg.isFullScreen()) return;
          let todos = {};
          try { todos = JSON.parse(fs.readFileSync(arquivoBounds, 'utf8')) || {}; } catch { /* arquivo novo */ }
          todos[type] = dlg.getBounds();
          fs.writeFileSync(arquivoBounds, JSON.stringify(todos));
        } catch { /* não impede o fechamento */ }
      });
    }

    dlg.on('closed', () => {
      // Só limpa se esta ainda é a janela ativa (trocar de diálogo, ex.: Configurações -> outro diálogo, não pode zerar o novo)
      if (activeDialog === dlg) activeDialog = null;
    });

    activeDialog.loadFile(path.join(__dirname, 'dialogs', 'dialog.html'));
  }

  // --- MENU CLIQUE CFG ---
  hostIPC.on('show-cfg-menu', (event, coords) => {
    showCfgMenu(coords);
  });

  hostIPC.on('cfg-close', (_event, restoreFocus) => {
    hideCfgMenu(restoreFocus === true);
  });

  // O menu informa a altura necessária e se o submenu Addons está aberto; a janela cresce para a
  // esquerda (o cartão não sai do lugar) ou, sem espaço à esquerda, para a direita.
  hostIPC.handle('cfg-layout', (event, opts) => {
    if (!cfgMenuWin || cfgMenuWin.isDestroyed() || event.sender !== cfgMenuWin.webContents) return null;
    const wa = cfgLayout.workArea;
    const wantFlyout = !!(opts && opts.flyout);
    let h = opts && Number.isFinite(opts.height) ? Math.round(opts.height) : cfgLayout.h;
    if (wa) h = Math.min(h, wa.height - 16);
    h = Math.max(h, 40);
    const { x, w, side } = boundsDoCfg(wantFlyout);
    cfgLayout.h = h;
    cfgLayout.flyout = wantFlyout;
    if (cfgLayout.mode === 'main') cfgUltimaAlturaMain = h;
    const atual = cfgMenuWin.getBounds();
    // Mesma geometria: não chama setBounds (evita redesenho/piscar da janela transparente).
    if (atual.x !== x || atual.y !== cfgLayout.y || atual.width !== w || atual.height !== h) cfgMenuWin.setBounds({ x, y: cfgLayout.y, width: w, height: h });
    return { side };
  });

  hostIPC.on('cfg-action', async (event, { action, data }) => {
    switch (action) {
      case 'install-ext-superproc':
        hideCfgMenu();
        await instalarSuperproc();
        break;
      case 'install-ext-azflow':
      case 'install-ext-epryx':
        hideCfgMenu();
        await instalarExtensaoDaLoja(action.replace('install-ext-', ''));
        break;
      case 'toggle-load-superproc':
      case 'toggle-load-azflow':
      case 'toggle-load-epryx':
      case 'toggle-load-pdf': {
        const updated = configManager.loadConfig();
        {
          const key = action.replace('toggle-load-', '');
          updated.extensionLoading = { superproc: false, azflow: false, epryx: false, pdf: true, ...updated.extensionLoading, [key]: !!data?.enabled };
        }
        configManager.saveConfig(updated);
        // Aplica na hora (carrega/remove a extensão e recarrega as páginas web abertas), sem reiniciar o app.
        await applyExtensionLoading();
        if (!data?.silent) hideCfgMenu(); // a chave do submenu Addons mantém o menu aberto
        break;
      }
      case 'set-open-mode': {
        // Grava a escolha. Dois monitores é recusado sem exatamente 2 monitores.
        const modo = openMode.normalizarModo(data?.modo);
        if (!openMode.modoDisponivel(modo, screen.getAllDisplays())) break;
        configManager.setOpenMode(modo);
        logDebugger('MODO_ABERTURA', 'Modo de abertura alterado', { modo });
        setTimeout(() => { for (const t of tabs) if (t.view && t.view.webContents && typeof fastCopilot !== 'undefined') fastCopilot.injetarBotao(t.view.webContents); }, 300); // botão do Fast Copilot nos editores já abertos
        agendarReaplicacaoLayout(50); // aplica já ao grupo ativo (árvore vai ao outro monitor ou volta)
        break;
      }
      case 'set-relacionados-em-pilha': {
        // Liga/desliga o sistema de relacionados sob mesma aba. Desligar desfaz as pilhas existentes (cada processo volta a ter sua aba).
        const ligado = definirRelacionadosEmPilha(data?.ligado !== false);
        logDebugger('RELACIONADOS_PILHA', 'Relacionados sob mesma aba alterado', { ligado });
        break;
      }
      case 'set-coluna-copilot': {
        // Liga/desliga a coluna do Copilot (qualquer modo). Ao ligar, ela volta visível.
        const ligada = configManager.setColunaCopilot(data?.ligada === true);
        if (ligada) colunaCopilotOculta = false;
        logDebugger('COLUNA_COPILOT', 'Coluna do Copilot alterada', { ligada });
        sincronizarRedator(); // sem a coluna, o ícone do Copilot nos textos sai das abas
        setTimeout(() => { for (const t of tabs) if (t.view && t.view.webContents && typeof fastCopilot !== 'undefined') fastCopilot.injetarBotao(t.view.webContents); }, 300);
        agendarReaplicacaoLayout(50);
        break;
      }
      case 'set-copilot-textos': {
        // Chave "Copilot nos textos": ícone do Copilot na linha do cursor. Vale na hora, em todas as abas abertas.
        const ligado = configManager.setCopilotNosTextos(data?.ligado !== false);
        logDebugger('COPILOT_TEXTOS', 'Copilot nos textos alterado', { ligado });
        sincronizarRedator();
        break;
      }
      case 'set-layout-pct': {
        // campo 'copilot' (coluna do Copilot) ou 'arvore' (árvore/documentos); o gerenciador limita à faixa válida.
        const gravado = configManager.setLayoutPct(data?.campo, data?.valor);
        if (!gravado) break;
        logDebugger('LAYOUT_PCT', 'Percentual de layout alterado', { campo: data.campo, ...gravado });
        updateLayoutBounds();
        break;
      }
      case 'set-atalho-pdf': {
        // data.atalho = {code,ctrl,alt,shift,meta} ou null (remover). Só o menu CFG envia isto.
        const pdfCopilot = require('./pdf-para-copilot');
        let mensagemAtalho = '';
        if (!data || !data.atalho) {
          configManager.setAtalhoColarPdf(null);
          mensagemAtalho = 'Atalho removido.';
          logDebugger('ATALHO_PDF_COPILOT', 'Atalho de colar PDF no Copilot removido');
        } else {
          const motivo = pdfCopilot.motivoDeRecusa(configManager.loadConfig(), data.atalho)
            || require('./fast-copilot').motivoDeRecusa({ ferramentas: [], jurisprudencia: [], legislacao: [] }, data.atalho, [configManager.getAtalhoFastCopilot(), configManager.getAtalhoAlteracaoTexto(), configManager.getAtalhoMinutaCopilot()]);
          if (motivo) {
            mensagemAtalho = motivo;
          } else {
            const gravado = configManager.setAtalhoColarPdf(data.atalho);
            mensagemAtalho = gravado ? 'Atalho salvo.' : 'Combinação inválida.';
            if (gravado) logDebugger('ATALHO_PDF_COPILOT', 'Atalho de colar PDF no Copilot definido');
          }
        }
        if (cfgSendState) cfgSendState({ mensagemAtalho });
        break;
      }
      case 'set-atalho-minuta': {
        // data.atalho = {code,ctrl,alt,shift,meta} ou null (remover). Só o menu CFG envia isto.
        let mensagemAtalhoMinuta = '';
        if (!data || !data.atalho) {
          configManager.setAtalhoMinutaCopilot(null);
          mensagemAtalhoMinuta = 'Atalho removido.';
          logDebugger('ATALHO_MINUTA_COPILOT', 'Atalho do botão Minuta do Copilot removido');
        } else {
          const motivo = require('./pdf-para-copilot').motivoDeRecusa(configManager.loadConfig(), data.atalho)
            || require('./fast-copilot').motivoDeRecusa({ ferramentas: [], jurisprudencia: [], legislacao: [] }, data.atalho, [configManager.getAtalhoColarPdf(), configManager.getAtalhoFastCopilot(), configManager.getAtalhoAlteracaoTexto()]);
          if (motivo) mensagemAtalhoMinuta = motivo;
          else {
            const gravado = configManager.setAtalhoMinutaCopilot(data.atalho);
            mensagemAtalhoMinuta = gravado ? 'Atalho salvo.' : 'Combinação inválida.';
            if (gravado) logDebugger('ATALHO_MINUTA_COPILOT', 'Atalho do botão Minuta do Copilot definido');
          }
        }
        if (cfgSendState) cfgSendState({ mensagemAtalhoMinuta });
        break;
      }
      case 'set-atalho-fast-copilot': {
        // data.atalho = {code,ctrl,alt,shift,meta} ou null (remover). Só o menu CFG envia isto.
        const fcm = require('./fast-copilot');
        let mensagemAtalhoFc = '';
        if (!data || !data.atalho) {
          configManager.setAtalhoFastCopilot(null);
          mensagemAtalhoFc = 'Atalho removido.';
          logDebugger('ATALHO_FAST_COPILOT', 'Atalho do Fast Copilot removido');
        } else {
          const motivo = fcm.motivoDeRecusa(configManager.loadConfig(), data.atalho, [configManager.getAtalhoColarPdf(), configManager.getAtalhoAlteracaoTexto(), configManager.getAtalhoMinutaCopilot()]);
          if (motivo) mensagemAtalhoFc = motivo;
          else {
            const gravado = configManager.setAtalhoFastCopilot(data.atalho);
            mensagemAtalhoFc = gravado ? 'Atalho salvo.' : 'Combinação inválida.';
            if (gravado) logDebugger('ATALHO_FAST_COPILOT', 'Atalho do Fast Copilot definido');
          }
        }
        if (cfgSendState) cfgSendState({ mensagemAtalhoFc });
        break;
      }
      case 'set-atalho-alteracao-texto': {
        // data.atalho = {code,ctrl,alt,shift,meta} ou null (remover). Só o menu CFG envia isto.
        const fcm = require('./fast-copilot');
        let mensagemAtalhoAt = '';
        if (!data || !data.atalho) {
          configManager.setAtalhoAlteracaoTexto(null);
          mensagemAtalhoAt = 'Atalho removido.';
          logDebugger('ATALHO_ALTERACAO_TEXTO', 'Atalho de Alteração de Texto removido');
        } else {
          const motivo = fcm.motivoDeRecusa(configManager.loadConfig(), data.atalho, [configManager.getAtalhoColarPdf(), configManager.getAtalhoFastCopilot(), configManager.getAtalhoMinutaCopilot()]);
          if (motivo) mensagemAtalhoAt = motivo;
          else {
            const gravado = configManager.setAtalhoAlteracaoTexto(data.atalho);
            mensagemAtalhoAt = gravado ? 'Atalho salvo.' : 'Combinação inválida.';
            if (gravado) logDebugger('ATALHO_ALTERACAO_TEXTO', 'Atalho de Alteração de Texto definido');
          }
        }
        if (cfgSendState) cfgSendState({ mensagemAtalhoAt });
        break;
      }
      case 'open-epryx':
        hideCfgMenu();
        openExtensionOptions('epryx');
        break;
      case 'open-azflow':
        hideCfgMenu();
        openExtensionOptions('azflow');
        break;
      case 'open-superproc':
        hideCfgMenu();
        openExtensionOptions('superproc');
        break;
      case 'force-update':
        forceUpdateExtensions();
        break;
      case 'manage-links':
        hideCfgMenu();
        showDialog('manage-links');
        break;
      case 'focus-url':
        hideCfgMenu();
        showDialog('url');
        break;
      case 'choose-download-dir':
        hideCfgMenu();
        const dlConfig = configManager.getDownloadsConfig();
        const defaultDir = (dlConfig.downloadPath && fs.existsSync(dlConfig.downloadPath))
          ? dlConfig.downloadPath
          : app.getPath('downloads');
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Selecionar Pasta de Download',
          defaultPath: defaultDir,
          properties: ['openDirectory', 'createDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
          configManager.setDownloadsConfig({ downloadPath: result.filePaths[0] });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('downloads-config-updated', configManager.getDownloadsConfig());
          }
        }
        break;
      case 'toggle-auto-download':
        configManager.setDownloadsConfig({ autoDownload: !!data?.enabled });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('downloads-config-updated', configManager.getDownloadsConfig());
        }
        break;
      case 'toggle-debugger':
        configManager.setDebuggerEnabled(!!data?.enabled);
        console.log(`[DEBUGGER] Modo depuração ${data?.enabled ? 'ATIVADO' : 'DESATIVADO'}.`);
        break;
      case 'atualizacao-set-verificar': {
        const ligado = data && data.ligado === true, estado = atualizacaoApp.lerEstado(app.getPath('userData'));
        atualizacaoApp.salvarEstado(app.getPath('userData'), { ...estado, verificar: ligado, automatica: ligado ? estado.automatica : false });
        definirStatusAtualizacao(atualizacaoStatus.fase, atualizacaoStatus.mensagem, { progresso: atualizacaoStatus.progresso, versaoNova: atualizacaoStatus.versaoNova });
        break;
      }
      case 'atualizacao-set-automatica': {
        const ligado = data && data.ligado === true, estado = atualizacaoApp.lerEstado(app.getPath('userData'));
        atualizacaoApp.salvarEstado(app.getPath('userData'), { ...estado, automatica: ligado, verificar: ligado ? true : estado.verificar });
        definirStatusAtualizacao(atualizacaoStatus.fase, atualizacaoStatus.mensagem, { progresso: atualizacaoStatus.progresso, versaoNova: atualizacaoStatus.versaoNova });
        if (ligado && atualizacaoStatus.fase === 'disponivel') baixarAtualizacaoApp().catch(() => {});
        break;
      }
      case 'atualizacao-acao': {
        const fase = atualizacaoStatus.fase;
        if (fase === 'disponivel') baixarAtualizacaoApp().catch(() => {});
        else if (fase === 'pronto') instalarAtualizacaoApp().catch(() => {});
        else if (!atualizacaoOcupada()) verificarAtualizacaoApp().catch(() => {});
        break;
      }
      case 'conta-entrar':
        if (!contaMsAtiva()) break;
        hideCfgMenu();
        try { await contaMs().entrar({ trocar: data?.trocar === true }); logDebugger('CONTA_MS', 'Login Microsoft concluído'); }
        catch (e) {
          if (e?.codigo === 'LOGIN_EM_ANDAMENTO') break;
          logDebugger('CONTA_MS', 'Login Microsoft falhou', { codigo: e?.codigo || 'DESCONHECIDO' });
          dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Conta Microsoft', message: 'Não foi possível entrar com a conta Microsoft.', detail: 'Código: ' + (e?.codigo || 'DESCONHECIDO') });
        }
        break;
      case 'conta-sair':
        if (!contaMsAtiva()) break;
        await contaMs().sair();
        logDebugger('CONTA_MS', 'Sessão Microsoft encerrada neste app');
        break;
      case 'conta-abrir': {
        // Só ids conhecidos: a URL nunca vem da interface do menu.
        if (!contaMsAtiva()) break;
        const destino = require('./conta-microsoft').destinoPorId(typeof data?.id === 'string' ? data.id : '');
        if (!destino) break;
        hideCfgMenu();
        createTab(destino.url);
        break;
      }
      case 'settings':
        hideCfgMenu();
        showDialog('settings');
        break;
      case 'clear-cache':
        hideCfgMenu();
        await clearV2Cache();
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Cache Limpo',
          message: 'O cache recuperável desta versão foi limpo para todos os sites. Cookies e preferências foram preservados.'
        });
        break;
      case 'reload-page':
        hideCfgMenu();
        const activeTabReload = tabs.find(t => t.id === activeTabId);
        if (activeTabReload) reloadTab(activeTabReload);
        break;
      case 'save-page':
        hideCfgMenu();
        saveActivePage();
        break;
      case 'toggle-devtools':
        hideCfgMenu();
        const activeTabDev = tabs.find(t => t.id === activeTabId);
        if (activeTabDev && activeTabDev.view) activeTabDev.view.webContents.toggleDevTools();
        break;
      default:
        hideCfgMenu();
        break;
    }
  });

  // --- ATUALIZAÇÃO FORÇADA DE EXTENSÕES DA LOJA (CHROME WEB STORE) ---
  async function forceUpdateExtensions() {
    hideCfgMenu();
    const userData = app.getPath('userData'), dados = dadosExtensoesLoja(), linhas = [];
    if (dirSuperprocInstalada()) {
      try { const r = extensaoSuperprocLocal.espelhar({ fonte: raizDaExtensao(), destino: destinoSuperproc() }); linhas.push('SuperPROC: ' + (r.copiado ? 'atualizada a partir do pacote.' : 'já está igual ao pacote.')); }
      catch (err) { linhas.push('SuperPROC: falha ao atualizar — ' + String(err && err.message || err)); }
    } else linhas.push('SuperPROC: não instalada.');
    for (const [nome, rotulo] of Object.entries(NOMES_EXTENSAO_LOJA)) {
      if (!extensaoInstalador.versaoInstalada(nome, userData)) { linhas.push(rotulo + ': não instalada.'); continue; }
      try {
        const r = await extensaoInstalador.instalar({ nome, userData, idLoja: dados.idsLoja[nome], fetchFn: (u, o) => net.fetch(u, o), chrome: process.versions.chrome });
        linhas.push(r.status === 'instalada' ? rotulo + ': atualizada para ' + r.versao + '.' : rotulo + ': já está na versão mais recente (' + r.versao + ').');
      } catch (err) { linhas.push(rotulo + ': falha ao consultar a loja — ' + String(err && err.message || err)); }
    }
    await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Atualização das extensões', message: 'Extensões AZflow e Epryx (Chrome Web Store)', detail: linhas.join('\n\n') + '\n\nReinicie o SuperPROC para carregar versões novas.' });
  }

  // Salvar página da aba ativa
  hostIPC.on('page-save', () => {
    saveActivePage();
  });

  async function saveActivePage() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || !activeTab.view || !activeTab.view.webContents || activeTab.view.webContents.isDestroyed()) {
      return;
    }
    const wc = activeTab.view.webContents;
    const rawTitle = wc.getTitle() || 'pagina';
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'pagina';
    const defaultPath = path.join(app.getPath('downloads'), `${safeTitle}.html`);

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Página',
      defaultPath: defaultPath,
      filters: [
        { name: 'Página Web Completa (*.html)', extensions: ['html'] },
        { name: 'Arquivo Web Único (*.mhtml)', extensions: ['mhtml'] },
        { name: 'Somente HTML (*.html)', extensions: ['html', 'htm'] }
      ]
    });

    if (!canceled && filePath) {
      let saveType = 'HTMLComplete';
      if (filePath.toLowerCase().endsWith('.mhtml')) {
        saveType = 'MHTML';
      } else if (filePath.toLowerCase().endsWith('.htm')) {
        saveType = 'HTMLOnly';
      } else {
        saveType = 'HTMLComplete';
      }
      try {
        await wc.savePage(filePath, saveType);
      } catch (err) {
        console.error('[SuperPROC] Erro ao salvar página:', err);
        dialog.showErrorBox('Erro ao Salvar Página', `Não foi possível salvar a página:\n${err.message}`);
      }
    }
  }

  // --- MENU DE CONTEXTO PARA ABA UNIFICADA (SPLIT VIEW) ---
  hostIPC.on('show-split-tab-context-menu', (event, { tabId, coords }) => {
    const targetTab = tabs.find(t => t.id === tabId);
    if (!targetTab) return;

    const duplaOpcao = opcaoArvoreDupla(tabId);
    const template = [
      ...(duplaOpcao === 'abrir' ? [{ label: 'Abrir árvore dupla', click: () => abrirArvoreDupla(tabId) }, { type: 'separator' }] : []),
      ...(duplaOpcao === 'fechar' ? [{ label: 'Fechar árvore dupla (manter esta)', click: () => fecharArvoreDupla(tabId) }, { type: 'separator' }] : []),
      {
        label: 'Abrir Cópia em Nova Guia',
        click: () => duplicateTabInNewTab(tabId)
      },
      {
        label: 'Desagrupar para Nova Guia',
        click: () => ungroupTab(tabId)
      },
      { type: 'separator' },
      {
        label: targetTab.processRole === 'capa'
          ? 'Fechar processo todo (Ctrl+W)'
          : 'Fechar esta sub-aba (Ctrl+W)',
        click: () => fecharPorUsuario(tabId)
      },
      {
        label: 'Fechar processo todo (Ctrl+Shift+W)',
        click: () => fecharPorUsuario(tabId, true, 'user-context-menu')
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({
      window: mainWindow,
      x: coords ? Math.round(coords.x) : undefined,
      y: coords ? Math.round(coords.y) : undefined
    });
  });

  function duplicateTabInNewTab(tabId) {
    const targetTab = tabs.find(t => t.id === tabId);
    if (!targetTab) return;
    const url = (targetTab.view && targetTab.view.webContents && !targetTab.view.webContents.isDestroyed())
      ? targetTab.view.webContents.getURL()
      : targetTab.url;
    createTab(url, false);
  }

  function ungroupTab(tabId) {
    const targetTab = tabs.find(t => t.id === tabId);
    if (!targetTab) return;

    if (targetTab.groupId) {
      const groupId = targetTab.groupId;
      const remainingInGroup = tabs.filter(t => t.groupId === groupId && t.id !== tabId);

      delete targetTab.groupId;
      delete targetTab.processRole;
      delete targetTab.lastLeftTabId;

      if (remainingInGroup.length === 1) {
        const soleRemaining = remainingInGroup[0];
        delete soleRemaining.groupId;
        delete soleRemaining.processRole;
        delete soleRemaining.lastLeftTabId;
      }
      switchTab(targetTab.id);
    } else if (targetTab.splitWith) {
      const partner = tabs.find(t => t.id === targetTab.splitWith);
      if (partner) {
        delete partner.splitWith;
        delete partner.splitRole;
      }
      delete targetTab.splitWith;
      delete targetTab.splitRole;
      switchTab(targetTab.id);
    }
    notifyTabsUpdated();
    updateLayoutBounds();
  }

  // --- HOVER MENU IPC ---
  // Durante um arraste no menu, passar por outro botão da barra não troca o menu.
  hostIPC.on('show-hover-menu', (event, pedido) => { if (!hoverArraste) mostrarHoverMenu(pedido); });
  // forcar: redesenha mesmo com o menu já aberto no lugar (após arrastar e soltar).
  // grupoAbertoId: grupo cujo submenu continua aberto (a linha dele segue destacada).
  function mostrarHoverMenu(pedido, { forcar = false, grupoAbertoId = null } = {}) {
    const { category, x, y, right, stackId, keyboard = false, triggerId } = pedido || {};
    if (!mainWindow) return;
    ultimoPedidoHover = pedido;
    if (hoverMenuTimeout) {
      clearTimeout(hoverMenuTimeout);
      hoverMenuTimeout = null;
    }
    const config = configManager.loadConfig();
    if (configManager.normalizeCategory(category) === 'legislacao') conferirLegislacaoHoje();
    // Grupos vazios não aparecem; do grupo só vai o essencial (os links vão ao submenu).
    let items;
    let colunaEsquerda = null;
    if (category === 'pilha') {
      // Relacionados abertos: o processo à vista no topo; escolher um ativa a aba dele (hover-menu-open-link com tabId).
      const pub = pilhaRelacionados.colapsar(ultimasEntradasBarra, pilhaTopoMemo).find(e => e.stack && e.stack.id === stackId);
      items = pub ? pub.stack.membros.map(m => ({ id: m.chave, nome: (m.topo ? '● ' : '○ ') + m.rotulo + (m.raiz ? ' · origem' : ''), tabId: m.alvo })) : [];
    } else {
      items = (config[category] || [])
        .filter(i => i && (i.tipo !== 'grupo' || (i.itens || []).some(x => x && x.url)))
        .map(i => i.tipo === 'grupo' ? { id: i.id, nome: i.nome, tipo: 'grupo' } : i);
      // Legislação: duas colunas. Esquerda = catálogo local (painel lateral) e as últimas leis acessadas;
      // direita = o Acesso Rápido, na ordem configurada.
      if (configManager.normalizeCategory(category) === 'legislacao' && legislacaoServico) {
        const idPorUrl = new Map();
        require('./quick-shortcut-core').paraCadaLink(config.legislacao, (l) => { if (l.url && l.id && !idPorUrl.has(l.url)) idPorUrl.set(l.url, l.id); });
        colunaEsquerda = {
          catalogo: { id: 'catalogo-leis', nome: '🔎 Catálogo de leis…', url: legislacaoServico.urlDoCatalogo },
          // Mesmo id do item do Acesso Rápido (se houver) reaproveita a página já carregada no painel.
          // Lei que já está no Acesso Rápido não repete aqui: os recentes servem para reabrir o que seria difícil de achar.
          recentes: recentesDeLeis().listar().filter(r => !idPorUrl.has(r.url)).map(r => ({ id: '', nome: r.nome, url: r.url }))
        };
      }
    }
    const win = getOrCreateHoverMenuWindow();

    let posX, posY;
    if (mainWindow.isMaximized()) {
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      posX = display.bounds.x + Math.round(x);
      posY = display.bounds.y + Math.round(y);
    } else {
      const [winX, winY] = mainWindow.getPosition();
      posX = winX + Math.round(x);
      posY = winY + Math.round(y);
    }

    // Menu de duas colunas (Legislação) nasce para a ESQUERDA: a borda direita dele alinha com a do botão,
    // sem sair da área útil da tela. Os demais menus seguem alinhados pela esquerda do botão.
    const COLUNA = 250;
    // Menus de um botão da barra (Jurisprudência, Legislação, Ferramentas) nascem alinhados pela DIREITA do botão; a largura
    // das listas de uma coluna se ajusta ao texto (medida uma vez e guardada), em vez de ficar fixa em 230.
    const alinharPelaDireita = Number.isFinite(right) && category !== 'pilha';
    const chaveLargura = category + '|' + items.map(i => i.nome).join('\n');
    const larguraMedida = larguraMenuPorLista.get(chaveLargura);
    const menuWidth = colunaEsquerda ? 2 * COLUNA + 1 : (larguraMedida || 230);
    const posXEsquerda = posX;
    const posXParaLargura = (w) => {
      if (!alinharPelaDireita) return posXEsquerda;
      const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
      return Math.max(area.x, Math.min(posXEsquerda + Math.round(right) - Math.round(x) - w, area.x + area.width - w));
    };
    posX = posXParaLargura(menuWidth);

    const isAlreadyVisible = win.isVisible() && activeHoverCategory === category;
    const currentBounds = win.getBounds();
    const posChanged = Math.abs(currentBounds.x - posX) > 2 || Math.abs(currentBounds.y - posY) > 2;

    if (isAlreadyVisible && !posChanged && !keyboard && !forcar) {
      return;
    }

    if (activeHoverCategory !== category) { hideHoverSub(); popupMenuState(hoverTriggerId,false); }
    activeHoverCategory = category;
    hoverKeyboardMode = keyboard === true;
    hoverTriggerId = typeof triggerId === 'string' ? triggerId : ({jurisprudencia:'btn-juris',legislacao:'btn-leis',ferramentas:'btn-ferramentas'}[category] || null);
    const count = items.length || 1;

    // Calcular altura total disponível na janela/tela a partir de posY
    let maxAvailableHeight = 900;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [winWidth, winHeight] = mainWindow.getContentSize();
      const [winX, winY] = mainWindow.getPosition();
      const windowBottom = winY + winHeight;
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      const screenBottom = display.workArea.y + display.workArea.height;
      
      const bottomLimit = Math.min(windowBottom, screenBottom);
      maxAvailableHeight = Math.max(100, bottomLimit - posY - 8);
    }

    // Esquerda: catálogo + título "Últimas leis acessadas" + recentes (ou o aviso de lista vazia).
    const alturaEsquerda = colunaEsquerda ? 8 + 29 + 28 + Math.max(colunaEsquerda.recentes.length, 1) * 29 : 0;
    const neededHeight = Math.max(8 + count * 29 + (category === 'pilha' ? 28 : 0), alturaEsquerda); // pilha: + legenda no topo
    const height = Math.min(neededHeight, maxAvailableHeight);
    const minhaAbertura = ++hoverShowSeq;
    // Tamanho e posição de uma vez só (setSize + setPosition separados deixam a janela com geometria intermediária).
    win.setBounds({ x: posX, y: posY, width: menuWidth, height });

    const sendData = async () => {
      if (minhaAbertura !== hoverShowSeq) return; // outra abertura (outro menu) já assumiu a janela
      if (!win.isDestroyed()) {
        win.webContents.send('render-hover-menu', { category, items, esquerda: colunaEsquerda, keyboard: hoverKeyboardMode, grupoAbertoId });
        if (!colunaEsquerda && alinharPelaDireita && !larguraMedida) {
          // Primeira vez desta lista: mede o texto já desenhado, ajusta largura/posição e só então mostra.
          try {
            // Sem requestAnimationFrame: ele não roda com a janela oculta. O layout já existe quando o script é executado.
            const texto = await win.webContents.executeJavaScript(`(()=>{let m=0;for(const el of document.querySelectorAll('.item-name')){const r=document.createRange();r.selectNodeContents(el);m=Math.max(m,r.getBoundingClientRect().width);}return Math.ceil(m);})()`);
            if (minhaAbertura !== hoverShowSeq || win.isDestroyed()) return;
            const largura = Math.max(180, Math.min(380, (Number(texto) || 0) + 12 * 2 + 2 + 8)); // padding dos itens + borda + folga da barra de rolagem
            larguraMenuPorLista.set(chaveLargura, largura);
            win.setBounds({ x: posXParaLargura(largura), y: posY, width: largura, height });
          } catch (_) { /* segue com a largura padrão */ }
          if (minhaAbertura !== hoverShowSeq || win.isDestroyed()) return;
        }
        if (hoverKeyboardMode) { win.show(); win.focus(); }
        else win.showInactive();
        popupMenuState(hoverTriggerId,true);
      }
    };

    win.webContents.removeAllListeners('did-finish-load');
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', sendData);
    } else {
      sendData();
    }
  }

  hostIPC.on('hide-hover-menu', (event, immediate) => {
    if (hoverArraste) return; // arrastando: o menu fica aberto até soltar
    if (immediate && typeof immediate === 'object' && immediate.keyboard === true) {
      hideHoverMenu(immediate.restoreFocus === true); return;
    }
    if (hoverKeyboardMode) return;
    if (hoverMenuTimeout) {
      clearTimeout(hoverMenuTimeout);
      hoverMenuTimeout = null;
    }
    if (immediate === true) {
      if (!cursorOverHoverWindows()) hideHoverMenu();
    } else {
      hoverMenuTimeout = setTimeout(() => {
        if (!cursorOverHoverWindows()) hideHoverMenu();
      }, 80);
    }
  });

  // Submenu de grupo: abre à ESQUERDA do menu, alinhado à linha do grupo, sem sair da área útil da tela.
  hostIPC.on('hover-sub-open', (event, pedido) => abrirHoverSub(pedido));
  function abrirHoverSub(pedido) {
    const { category, groupId, top, keyboard = false } = pedido || {};
    if (!hoverMenuWin || hoverMenuWin.isDestroyed() || !hoverMenuWin.isVisible()) return;
    const lista = configManager.loadConfig()[category] || [];
    const grupo = lista.find(i => i && i.tipo === 'grupo' && i.id === groupId);
    const itens = ((grupo && grupo.itens) || []).filter(x => x && x.url).map(x => ({ id: x.id, nome: x.nome, url: x.url }));
    if (!itens.length) return;
    ultimoSubHover = { category, groupId, top, keyboard: false };
    const hb = hoverMenuWin.getBounds();
    const area = screen.getDisplayMatching(hb).workArea;
    const largura = 230;
    const altura = Math.min(8 + itens.length * 29, area.height);
    let x = hb.x - largura;
    if (x < area.x) x = hb.x + hb.width; // sem espaço à esquerda: abre à direita
    // Legislação (duas colunas): os grupos ficam na coluna da direita, então o submenu abre ao lado dela, à direita.
    if (configManager.normalizeCategory(category) === 'legislacao' && hb.x + hb.width + largura <= area.x + area.width) x = hb.x + hb.width;
    const y = Math.max(area.y, Math.min(hb.y + Math.round(Number(top) || 0) - 4, area.y + area.height - altura));
    const sub = getOrCreateHoverSubWindow();
    if (keyboard) hoverKeyboardMode = true;
    sub.setBounds({ x: Math.round(x), y: Math.round(y), width: largura, height: Math.round(altura) });
    const enviar = () => {
      if (sub.isDestroyed()) return;
      sub.webContents.send('render-hover-menu', { category, items: itens, keyboard: keyboard === true, groupId });
      if (keyboard) { sub.show(); sub.focus(); }
      else sub.showInactive();
    };
    sub.webContents.removeAllListeners('did-finish-load');
    if (sub.webContents.isLoading()) sub.webContents.once('did-finish-load', enviar); else enviar();
  }

  // --- ARRASTE NO MENU HOVER (Acesso Rápido) ---
  // Regras de mover em hover-menu/arraste-acesso-rapido.js; repasse entre menu e submenu, conferência da posição
  // final e gravação em hover-menu/coordenador-arraste.js. Depois de gravar, menu e submenu são redesenhados.
  const arrasteHover = require('./hover-menu/coordenador-arraste').criarCoordenadorArraste({
    janelas: () => [{ win: hoverMenuWin, lado: 'menu' }, { win: hoverSubWin, lado: 'sub' }],
    grupoDoSub: () => (ultimoSubHover ? ultimoSubHover.groupId : null),
    lerLista: (categoria) => configManager.loadConfig()[categoria],
    gravar: (categoria, lista) => {
      const updated = configManager.saveAllCategories({ [categoria]: lista });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('config-updated', updated);
    }
  });
  hostIPC.on('hover-drag-start', (_event, d) => {
    const pedido = d && typeof d === 'object' ? { ...d, category: configManager.normalizeCategory(d.category) } : d;
    if (!arrasteHover.inicio(pedido)) return;
    hoverArraste = true;
    if (hoverMenuTimeout) { clearTimeout(hoverMenuTimeout); hoverMenuTimeout = null; }
  });
  hostIPC.on('hover-drag-move', (_event, p) => arrasteHover.mover(p));
  hostIPC.on('hover-drag-target', (event, resposta) => arrasteHover.destino(event.sender, resposta));
  hostIPC.on('hover-drag-end', async (_event, d) => {
    let nova = null;
    try { nova = await arrasteHover.fim(d); } catch (_) { nova = null; }
    hoverArraste = null;
    if (nova) {
      const sub = hoverSubWin && !hoverSubWin.isDestroyed() && hoverSubWin.isVisible() ? ultimoSubHover : null;
      if (hoverMenuWin && !hoverMenuWin.isDestroyed() && hoverMenuWin.isVisible() && ultimoPedidoHover) {
        mostrarHoverMenu(ultimoPedidoHover, { forcar: true, grupoAbertoId: sub ? sub.groupId : null });
        if (sub) { hideHoverSub(); abrirHoverSub(sub); }
      }
      return;
    }
    if (!cursorOverHoverWindows()) hideHoverMenu();
  });

  hostIPC.on('hover-sub-close', (_event, keyboard) => {
    hideHoverSub();
    if (keyboard === true && hoverMenuWin && !hoverMenuWin.isDestroyed() && hoverMenuWin.isVisible()) {
      hoverMenuWin.focus(); hoverMenuWin.webContents.send('hover-menu-focus');
    }
  });

  hostIPC.on('cancel-hover-hide', (event, keyboard) => {
    if (keyboard === true && [hoverMenuWin,hoverSubWin].some(w => w && !w.isDestroyed() && w.webContents === event.sender)) hoverKeyboardMode = true;
    if (hoverMenuTimeout) {
      clearTimeout(hoverMenuTimeout);
      hoverMenuTimeout = null;
    }
  });

  hostIPC.on('hover-menu-open-link', (event, data) => {
    hideHoverMenu();
    if (data && typeof data === 'object' && typeof data.tabId === 'string') {
      if (tabs.some(t => t.id === data.tabId)) switchTab(data.tabId);
      return;
    }
    if (typeof data === 'string') {
      openSidePanel({ url: data, category: 'jurisprudencia' });
    } else if (data && data.url) {
      openSidePanel({ url: data.url, category: data.category, title: data.title, id: data.id });
    }
  });

  // --- PAINEL LATERAL FLUTUANTE (WEB PANEL) IPC ---
  hostIPC.on('panel-open', (event, data) => {
    if (typeof data === 'string') {
      openSidePanel({ url: data });
    } else if (data && data.url) {
      openSidePanel(data);
    }
  });
  hostIPC.on('panel-close', () => closeSidePanel(true));
  hostIPC.on('panel-hide', () => closeSidePanel(false));
  hostIPC.on('panel-home', () => {
    if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed()) {
      const targetUrl = sidePanel.initialUrl || sidePanel.url;
      if (targetUrl) {
        sidePanel.contentView.webContents.loadURL(targetUrl);
      }
    }
  });
  hostIPC.on('panel-back', () => {
    if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed() && canNavBack(sidePanel.contentView.webContents)) {
      navBack(sidePanel.contentView.webContents);
    }
  });
  hostIPC.on('panel-forward', () => {
    if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed() && canNavForward(sidePanel.contentView.webContents)) {
      navForward(sidePanel.contentView.webContents);
    }
  });
  hostIPC.on('panel-reload', () => {
    if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed()) {
      sidePanel.contentView.webContents.reload();
    }
  });
  hostIPC.on('panel-promote-to-tab', () => {
    if (sidePanel.contentView && !sidePanel.contentView.webContents.isDestroyed()) {
      const targetUrl = sidePanel.contentView.webContents.getURL() || sidePanel.url;
      createTab(targetUrl, false);
      closeSidePanel(true);
    }
  });
  hostIPC.on('panel-resize-start', () => {
    isResizingPanel = true;
  });
  hostIPC.on('panel-resize-end', () => {
    isResizingPanel = false;
    if (sidePanel.category && sidePanel.width) {
      configManager.saveCategoryWidth(sidePanel.category, sidePanel.width);
    }
  });
  hostIPC.on('panel-resize-delta', (event, deltaX) => {
    if (typeof deltaX !== 'number' || isNaN(deltaX)) return;
    const current = (typeof sidePanel.width === 'number' && !isNaN(sidePanel.width)) ? sidePanel.width : 500;
    const larguraConteudo = mainWindow ? getLayoutAreas().conteudo.width : 1200;
    const maxAllowed = Math.max(340, Math.round(larguraConteudo * 0.85));
    sidePanel.width = Math.min(maxAllowed, Math.max(340, Math.round(current + deltaX)));
    updateLayoutBounds();
    if (sidePanel.category) {
      configManager.saveCategoryWidth(sidePanel.category, sidePanel.width);
    }
  });

  // --- ATALHO "COLAR PDF DA ÁRVORE NO COPILOT" (host): anexa o PDF do leitor ao chat da coluna do Copilot ---
  envioPdfCopilotRef = require('./pdf-para-copilot').criarEnvioPdf({
    app, BrowserWindow, webContents,
    getMainWindow: () => mainWindow,
    getColunaAtiva: colunaCopilotLigada,
    getColunaView: () => (colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null),
    getAlvos: (origem) => { // origem pode ser a própria coluna do Copilot (foco lá) ou nula: então usa o grupo da aba ativa
      const gerenciados = require('./abas-gerenciadas').resolveManagedTargets(tabs, origem);
      if (gerenciados.length) return gerenciados;
      const ativa = tabs.find(t => t.id === activeTabId);
      const doGrupo = ativa && ativa.view && ativa.view.webContents ? require('./abas-gerenciadas').resolveManagedTargets(tabs, ativa.view.webContents) : [];
      if (doGrupo.length) return doGrupo;
      return ativa && ativa.view && ativa.view.webContents ? [ativa.view.webContents] : [];
    },
    avisar: soErro((texto, nivel, ms, regiao) => mostrarAviso(texto, nivel, ms, true, regiao)),
    log: (tipo, msg) => logDebugger(tipo, msg)
  });
  // Teclas PDF/Minuta (foco em qualquer aba da janela): anexam de imediato o PDF aberto / a minuta ao chat do Copilot.
  // Só erros são avisados; o andamento do envio o usuário vê na própria coluna.
  require('./copilot-teclas').criarTeclasContexto({
    app, BrowserWindow, webContents,
    getMainWindow: () => mainWindow,
    getAtalhos: () => ({ pdf: configManager.getAtalhoColarPdf(), minuta: configManager.getAtalhoMinutaCopilot() }),
    acionar: async (k) => {
      if (k === 'pdf') return envioPdfCopilotRef ? envioPdfCopilotRef.enviar(null) : false;
      return fastCopilotRef ? fastCopilotRef.anexarMinuta() : false;
    }
  }).instalar();
  // Botões PDF / MIN no rodapé da barra lateral do Copilot: mesmo envio dos atalhos acima (só erros são avisados).
  require('./copilot-botoes-anexo').criarBotoesAnexo({
    ehColuna: require('./copilot-column').ehColunaCopilot,
    ativo: colunaCopilotLigada,
    acionar: async (k) => {
      if (k === 'pdf') return envioPdfCopilotRef ? envioPdfCopilotRef.enviar(null) : false;
      return fastCopilotRef ? fastCopilotRef.anexarMinuta() : false;
    },
    log: (tipo, msg) => logDebugger(tipo, msg)
  }).instalarEmTodos({ app, webContents });

  // --- CONTEXTO DAS ABAS PARA O COPILOT (host): ContextBroker lê as abas; o exportador monta o Markdown e entrega ao campo da coluna
  // por colagem nativa (sem script nem estilo na página do Copilot). Ctrl+Shift+K = aba ativa; Ctrl+Shift+J = todas as abas.
  // Texto pequeno vai colado; grande vira arquivo .md (pasta <perfil>/contexto-copilot ou SUPERPROC_PASTA_CONTEXTO), copiado e revelado.
  // Comando de desenvolvimento: iniciar com --contexto-dev imprime (só metadados) o workspace 10 s depois, no console do processo principal. ---
  let exportadorContexto;
  {
    const ctx = require('./context');
    const contextoPermitido = () => configManager.loadConfig().copilotContextoPermitido === true;
    const registroDeAbas = ctx.criarTabRegistry({ getTabs: () => tabs, getActiveTabId: () => activeTabId, catalogo: catalogoPainelCopilot });
    const contextBroker = ctx.criarContextBroker({
      registry: registroDeAbas,
      log: (tipo, msg) => logDebugger(tipo, msg)
    });
    const copiarArquivoParaAreaDeTransferencia = (caminho) => new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve(false);
      const filho = require('node:child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -LiteralPath $env:SP_ARQUIVO'], { env: { ...process.env, SP_ARQUIVO: caminho }, windowsHide: true, stdio: 'ignore' });
      const prazo = setTimeout(() => { try { filho.kill(); } catch (_) { /* já encerrou */ } resolve(false); }, 8000);
      filho.on('error', () => { clearTimeout(prazo); resolve(false); });
      filho.on('exit', (codigo) => { clearTimeout(prazo); resolve(codigo === 0); });
    });
    exportadorContexto = ctx.criarExportador({
      broker: contextBroker, clipboard, fs, path,
      pasta: process.env.SUPERPROC_PASTA_CONTEXTO || path.join(app.getPath('userData'), 'contexto-copilot'),
      getColunaWc: () => { const v = colunaCopilotLigada() ? colunaCopilot.getView() : null; return v ? v.webContents : null; },
      mostrarColuna: () => { if (colunaCopilotOculta) { colunaCopilotOculta = false; updateLayoutBounds(); enviarEstadoColuna(true).catch(() => {}); } },
      copiarArquivo: copiarArquivoParaAreaDeTransferencia,
      revelar: (caminho) => { try { shell.showItemInFolder(caminho); } catch (_) { /* sem explorador */ } },
      avisar: (texto, nivel, ms) => mostrarAviso(texto, nivel, ms),
      ...(copilotWebIntegrado ? {
        contextoPermitido,
        aceitarDestino: (wc) => {
          const url = URL.parse(wc.getURL());
          return url && origensCopilotWeb.has(url.origin) &&
            /^\/(?:chat(?:\/|$)|home\/?$)/.test(url.pathname);
        },
        acompanharContexto: () => {
          const aba = tabs.find(t => t.id === activeTabId);
          if (!hasLiveWebContents(aba?.view)) return null;
          const origem = aba.view.webContents;
          const url = origem.getURL();
          const documento = ctx.identidadeDocumento(origem);
          return () => aba.id === activeTabId && hasLiveWebContents(aba.view) &&
            aba.view.webContents === origem && ctx.identidadeDocumento(origem) === documento && origem.getURL() === url;
        },
        autorizar: async (escopo, testarLeitura) => {
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question', title: testarLeitura ? 'Testar leitura local' : 'Usar contexto no Copilot',
            message: testarLeitura ? 'Testar a leitura da aba ativa no SuperPROC?' :
              (escopo === 'ativa' ? 'Preparar o conteúdo da aba ativa para o Copilot?' : 'Preparar o conteúdo das abas abertas para o Copilot?'),
            detail: testarLeitura ? 'O teste mostra apenas o resultado da extração.' :
              'Você poderá revisar o contexto antes de enviar a mensagem.',
            buttons: [testarLeitura ? 'Testar leitura' : 'Preparar contexto', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true
          });
          return response === 0;
        }
      } : {}),
      log: (tipo, msg) => logDebugger(tipo, msg)
    });
    colunaRedatorRef = { // usado pelo ícone na linha do cursor (redator-linha.js) para entregar a citação à coluna
      getWc: () => { const v = colunaCopilotLigada() ? colunaCopilot.getView() : null; return v ? v.webContents : null; },
      mostrar: () => { if (colunaCopilotOculta) { colunaCopilotOculta = false; updateLayoutBounds(); enviarEstadoColuna(true).catch(() => {}); } },
      aceitar: (wc) => { const url = URL.parse(wc.getURL()); return !!(copilotWebIntegrado && url && origensCopilotWeb.has(url.origin) && /^\/(?:chat(?:\/|$)|home\/?$)/.test(url.pathname)); }
    };
    ctx.criarAtalhos({ app, BrowserWindow, webContents, getMainWindow: () => mainWindow, acionar: (escopo) => exportadorContexto.exportar({ escopo }) }).instalar();
    if (copilotWebIntegrado) {
      // Diagnóstico da coluna Web gravado no perfil, com ou sem a ponte: o que a página pediu à ponte (nomes e contagens)
      // e como terminaram as janelas de login abertas por ela (rotas sem parâmetros, presença de código, nome do erro OAuth).
      // Um arquivo por modo, para comparar uma execução com a ponte e outra sem ela.
      const arquivoDiagnostico = path.join(app.getPath('userData'), ponteCopilotLigada ? 'copilot-ponte-diagnostico.json' : 'copilot-ponte-diagnostico-sem-ponte.json');
      const janelasDaColuna = { total: 0, ultimas: [] };
      // Página da coluna: scripts carregados (só origem+caminho, para estudar o código do app), chamadas fetch/xhr com
      // status, e erros/avisos do console. Tudo saneado: sem consulta/fragmento de URL, identificadores e cadeias longas
      // mascarados, número de processo e e-mail removidos, texto curto. Fica só no perfil local.
      const scriptsDaPagina = new Set();
      const chamadasDaPagina = new Map(); // 'origem+caminho' -> { status, vezes }
      const errosDoConsole = new Map();   // mensagem saneada -> vezes
      const sanear = (t) => String(t || '')
        .replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g, '$1')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
        .replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, '<processo>')
        .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[A-Za-z]{2,}/g, '<email>')
        .replace(/[A-Za-z0-9_\-.]{40,}/g, '<omitido>')
        .replace(/\s+/g, ' ').trim().slice(0, 240);
      const rotaDe = (u) => { try { const x = new URL(u); return (x.protocol === 'chrome-extension:' ? 'chrome-extension://' : '') + x.host + x.pathname.slice(0, 160); } catch (_) { return sanear(u).slice(0, 160); } };
      observadorPaginaCopilot = (ev) => {
        if (!ev) return;
        if (ev.tipo === 'console') {
          const chave = ev.nivel + ' ' + sanear(ev.mensagem);
          if (errosDoConsole.has(chave) || errosDoConsole.size < 120) errosDoConsole.set(chave, (errosDoConsole.get(chave) || 0) + 1);
        } else if (ev.tipo === 'recursos' && Array.isArray(ev.lista)) {
          for (const item of ev.lista.slice(0, 2000)) {
            if (!Array.isArray(item)) continue;
            const [tipo, url, status] = item;
            const rota = rotaDe(url);
            if (tipo === 'script') { if (scriptsDaPagina.size < 400) scriptsDaPagina.add(rota); }
            else if (tipo === 'fetch' || tipo === 'xmlhttprequest' || tipo === 'beacon' || tipo === 'other') {
              const atual = chamadasDaPagina.get(rota);
              if (atual) { atual.vezes++; if (status) atual.status = status; }
              else if (chamadasDaPagina.size < 300) chamadasDaPagina.set(rota, { tipo, status: status || 0, vezes: 1 });
            }
          }
        }
        agendarDiagnosticoColuna();
      };
      let gravacaoPendente = null;
      agendarDiagnosticoColuna = () => {
        if (gravacaoPendente) return;
        gravacaoPendente = setTimeout(() => {
          gravacaoPendente = null;
          let texto;
          try {
            const v = colunaCopilot.getView();
            const onde = v ? require('./copilot-column').resumirRetorno(v.webContents.getURL()).rota : null;
            texto = JSON.stringify({ atualizadoEm: new Date().toISOString(), ponteLigada: ponteCopilotLigada, atrasoDaPonte: process.argv.find(a => a.startsWith('--copilot-ponte-atraso=')) || 'padrão', colunaEm: onde, janelasDaColuna, ...(diagnosticoPonteCr ? diagnosticoPonteCr() : {}), pagina: { scripts: [...scriptsDaPagina].sort(), chamadas: [...chamadasDaPagina].map(([rota, c]) => ({ rota, ...c })).sort((a, b) => a.rota.localeCompare(b.rota)), errosDoConsole: [...errosDoConsole].map(([mensagem, vezes]) => ({ mensagem, vezes })) } }, null, 2);
          } catch (_) { return; }
          const temporario = arquivoDiagnostico + '.tmp';
          fs.promises.writeFile(temporario, texto, 'utf8').then(() => fs.promises.rename(temporario, arquivoDiagnostico)).catch(() => {});
        }, 1500);
        if (typeof gravacaoPendente.unref === 'function') gravacaoPendente.unref();
      };
      observadorJanelasCopilot = (resumo) => {
        janelasDaColuna.total++;
        janelasDaColuna.ultimas.push(resumo);
        if (janelasDaColuna.ultimas.length > 6) janelasDaColuna.ultimas.shift();
        agendarDiagnosticoColuna();
      };
      agendarDiagnosticoColuna();
    }
    if (ponteCopilotLigada) {
      // Ponte do cr-host: a página do Copilot consulta abas pelo mesmo contrato do Edge (portas copilot-api / copilot-bridge),
      // atendido aqui sobre o ContextBroker e sempre condicionado ao consentimento local. Ver COPILOT-SHELL.md.
      const cr = require('./copilot-shell/cr-bridge-host');
      const cartao = require('./copilot-shell/consent-overlay-host');
      const registrarPonte = (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} };
      cartaoConsentimentoRef = cartao.criarCartaoConsentimento({
        WebContentsView, dialog,
        getMainWindow: () => mainWindow,
        getAreaDaColuna: () => {
          const v = colunaCopilotLigada() && !colunaCopilotOculta && colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null;
          try { return v ? v.getBounds() : null; } catch (_) { return null; }
        },
        getSession: () => session.fromPartition('superproc-consentimento-copilot'),
        log: registrarPonte
      });
      consentimentoCopilotRef = require('./copilot-shell/consentimento-edge').criarConsentimento({
        ler: () => configManager.loadConfig().copilotConsentimentoEstado,
        // O mesmo ajuste vale para a exportação manual (Ctrl+Shift+K): os dois campos mudam juntos.
        gravar: async (estado) => {
          if (!configManager.saveConfig({ ...configManager.loadConfig(), copilotConsentimentoEstado: estado, copilotContextoPermitido: estado === 1 })) return false;
          await configManager.flush();
          return true;
        },
        mostrarCartao: (opcoes) => cartaoConsentimentoRef.mostrar(opcoes),
        log: registrarPonte
      });
      // Ferramentas nativas do Copilot Chat (busca/realce, histórico, link externo, MCP local) e AdminBroker: tudo desligado até a
      // pessoa ligar no arquivo copilot-admin.json do perfil (ver copilot-shell/ferramentas-host.js). Ações destrutivas perguntam a cada vez.
      const politicasIA = { valores: () => configManager.loadConfig().copilotPoliticasIA };
      require('./copilot-shell/ferramentas-host').garantirArquivoDePolitica(app.getPath('userData')); // cria copilot-admin.json se faltar (nunca sobrescreve)
      const ferramentasCopilot = require('./copilot-shell/ferramentas-host').criarFerramentasHost({
        politicasIA, pasta: app.getPath('userData'), registry: registroDeAbas, contextBroker, configManager, abrirNoSistema: (url) => shell.openExternal(url),
        log: (tipo, msg) => logDebugger(tipo, msg),
        perguntar: async ({ detalhe }) => {
          if (!mainWindow || mainWindow.isDestroyed()) return false;
          const { response } = await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'SuperPROC — pedido do Copilot', message: 'O Copilot pede para ' + detalhe + '.', detail: 'Só permita se foi você quem pediu.', buttons: ['Permitir', 'Negar'], defaultId: 1, cancelId: 1, noLink: true });
          return response === 0;
        },
        operacoes: {
          criarAba: (url) => createTab(url),
          trocar: (a) => switchTab(a.id),
          recarregar: (a) => reloadTab(a),
          voltar: (a) => { const r = getRootNavigationTab(tabs, a); if (r && r.view && canNavBack(r.view.webContents)) { navBack(r.view.webContents); return true; } return false; },
          avancar: (a) => { const r = getRootNavigationTab(tabs, a); if (r && r.view && canNavForward(r.view.webContents)) { navForward(r.view.webContents); return true; } return false; },
          fechar: (a) => closeTab(a.id),
          realcar: (a, texto) => require('./copilot-shell/ferramentas-host').realcarEmWebContents(a.view && a.view.webContents, texto),
          limparRealce: (a) => require('./copilot-shell/ferramentas-host').limparRealceEmWebContents(a.view && a.view.webContents),
          rolar: (a, posicao) => { const wc = a.view && a.view.webContents; if (!wc || wc.isDestroyed()) return false; const js = { top: 'window.scrollTo({top:0})', bottom: 'window.scrollTo({top:document.documentElement.scrollHeight})', up: 'window.scrollBy({top:-Math.round(window.innerHeight*0.8)})', down: 'window.scrollBy({top:Math.round(window.innerHeight*0.8)})' }[posicao]; if (!js) return false; wc.executeJavaScript(js + ';true').catch(() => {}); return true; },
          capturar: (a) => require('./copilot-shell/ferramentas-host').capturarWebContents(a.view && a.view.webContents)
        }
      });
      adminCopilot = ferramentasCopilot.admin;
      // Pipe local do harness cli-anything-superproc: só se `pipe` estiver ligado no copilot-admin.json ao iniciar o app.
      if (ferramentasCopilot.politica().pipe) {
        const adminPipe = require('./copilot-shell/admin-pipe');
        const servidorAdmin = adminPipe.criarServidorAdmin({ admin: ferramentasCopilot.admin, log: (tipo, msg) => logDebugger(tipo, msg) });
        servidorAdmin.iniciar().then(() => adminPipe.gravarDescoberta(app.getPath('userData'), { caminho: servidorAdmin.caminho, token: servidorAdmin.token })).catch(() => { /* sem pipe: o harness não conecta */ });
        app.once('will-quit', () => { servidorAdmin.parar().catch(() => {}); try { fs.rmSync(path.join(app.getPath('userData'), 'copilot-admin.pipe'), { force: true }); } catch (_) { /* já removido */ } });
      }
      const ponteCr = cr.criarPonteCr({
        broker: contextBroker, consentimento: consentimentoCopilotRef, ferramentas: ferramentasCopilot.ferramentas, politicasIA, iaLocal: { ativo: () => configManager.loadConfig().copilotIaNoDispositivo !== false },
        ignorarMaxCharsDaPagina: () => configManager.loadConfig().copilotIgnorarMaxCharsDaPagina === true,
        mapa: require('./copilot-shell/tab-id-mapper').criarMapaDeAbas(), log: registrarPonte, aoRegistrar: () => agendarDiagnosticoColuna(), acoes: { modo: modoAcoesCopilot }
      });
      // A ponte entra na página alguns segundos depois da carga (padrão 12 s; `--copilot-ponte-atraso=<segundos>`, 0 = na carga).
      const argAtraso = process.argv.find(a => /^--copilot-ponte-atraso=\d{1,3}$/.test(a));
      const atrasoInstalacaoMs = argAtraso ? Number(argAtraso.split('=')[1]) * 1000 : 8000;
      // Login em andamento = janela de login aberta ou fechada há menos de 4 s (dá folga para a página aplicar o token).
      const authOcupada = () => loginCopilotAbertos > 0 || (Date.now() - ultimoLoginCopilotFechado) < 4000;
      transporteCrRef = cr.criarTransporteCr({ ponte: ponteCr, getColunaWc: () => { const v = colunaCopilot.getView(); return v ? v.webContents : null; }, log: registrarPonte, atrasoInstalacaoMs, authOcupada });
      diagnosticoPonteCr = () => ponteCr.diagnostico();
      hostIPC.on('copilot-cr-abrir', (e, marca, portaId, nome, idExtensao) => transporteCrRef.abrir(e, marca, portaId, nome, idExtensao));
      hostIPC.on('copilot-cr-msg', (e, marca, portaId, texto) => transporteCrRef.mensagem(e, marca, portaId, texto));
      hostIPC.on('copilot-cr-fechar', (e, marca, portaId) => transporteCrRef.fechar(e, marca, portaId));
      hostIPC.handle('copilot-cr-unico', (e, texto, idExtensao) => transporteCrRef.unico(e, texto, idExtensao));
      hostIPC.on('copilot-cr-nota', (e, marca, codigo) => transporteCrRef.nota(e, marca, codigo));
      hostIPC.on('copilot-consentimento-decisao', (e, permitir) => cartaoConsentimentoRef.receberDecisao(e, permitir));
      app.on('before-quit', () => { try { ponteCr.encerrar(); cartaoConsentimentoRef.fechar(); } catch (_) {} });
    }
    if (copilotShellLigado) {
      // Shell experimental da coluna (opt-in): ver COPILOT-SHELL.md. A página do shell é local; nenhum conteúdo remoto é carregado nela.
      const sh = copilotShellModulo;
      let graph = null;
      if (copilotShellCfg.graph) {
        try { graph = require('./copilot-shell/graph').criarGraph({ clientId: process.env.SUPERPROC_COPILOT_CLIENT_ID, tenant: process.env.SUPERPROC_COPILOT_TENANT, abrirBrowser: url => require('electron').shell.openExternal(url) }); }
        catch (_) { logDebugger('COPILOT_SHELL', 'Configuração Entra ausente ou inválida'); }
      }
      const shell = sh.criarShell({
        broker: contextBroker, sintetico: !!copilotShellCfg.sintetico, cenario: copilotShellCfg.cenario || 'acesso',
        contextoPermitido,
        graph, graphPendente: !!copilotShellCfg.graph && !graph, prazoMs: copilotShellCfg.graph ? 180000 : 10000,
        usarHabitual: () => colunaCopilot.usarModoDireto(),
        perguntar: async ({ finalidade, titulo, origem }) => {
          const corpo = finalidade === 'corpo';
          const r = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Shell do Copilot pede contexto', buttons: ['Permitir esta leitura', 'Negar'], defaultId: 1, cancelId: 1, noLink: true,
            message: corpo ? (copilotShellCfg.graph ? 'Enviar o texto desta aba ao Microsoft 365 Copilot?' : 'O consumidor do shell quer ler o texto de uma aba.') : 'O consumidor do shell quer ver a lista de abas abertas.',
            detail: (corpo ? 'Aba: ' + (titulo || '(sem título)') + '\nOrigem: ' + (origem || '') + '\n\n' : '') + 'A autorização vale somente para este pedido.' });
          return r.response === 0 ? 'permitir' : 'negar';
        },
        log: (cat, msg) => logDebugger(cat, msg)
      });
      const remetenteOk = (e) => e.sender === colunaCopilot.getView()?.webContents &&
        !!e.senderFrame && e.senderFrame === e.sender.mainFrame && sh.origemAceita(e.senderFrame.url);
      const negado = { ok: false, erro: { codigo: 'CANAL_NAO_AUTORIZADO', retentavel: false } };
      hostIPC.handle(sh.CANAIS.estado, (e) => (remetenteOk(e) ? shell.estado() : null));
      hostIPC.handle(sh.CANAIS.acao, (e, nome) => (remetenteOk(e) ? shell.acao(nome) : negado));
      hostIPC.handle(sh.CANAIS.demo, (e, pedido) => (remetenteOk(e) ? shell.demo(pedido) : negado));
      shell.aoMudar((estado) => { const v = colunaCopilot.getView(); if (v && !v.webContents.isDestroyed() && sh.origemAceita(v.webContents.getURL())) v.webContents.send(sh.CANAIS.mudou, estado); });
      shell.iniciar().catch(() => {});
      app.on('before-quit', () => { shell.encerrar().catch(() => {}); });
    }
    if (process.argv.includes('--contexto-dev')) setTimeout(() => { ctx.dumpWorkspaceContext(contextBroker).catch((e) => console.error('contexto-dev:', e && e.codigo || 'erro')); }, 10000);
  }

  // --- FAST COPILOT NO EDITOR (host): caixa de instruções + envio ao chat da coluna + aplicação no CKEditor ---
  const fcModulo = require('./fast-copilot');
  fastCopilotCaixa = require('./fast-copilot-box').criarCaixa({
    BrowserWindow,
    getParent: () => mainWindow,
    getLimites: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.getContentBounds() : null),
    getAreaDeTrabalho: (x, y) => { try { return screen.getDisplayNearestPoint({ x, y }).workArea; } catch (_) { return null; } },
    icon: getBrowserIconPath()
  });
  fastCopilotCaixa.installIpc(hostIPC);
  let iconeCopilot = null, iconeMotivo = '';
  // Ícone do Copilot 100% offline: arquivo real copilot-icone.(ico|png|svg|webp). Prioridade: pasta do projeto (browser/fast-copilot-box/)
  // e depois <userData>. Se não houver nenhum, a primeira leitura do favicon do chat (só com o chat aberto) é gravada em <userData> como arquivo.
  // Para trocar/refazer: ponha o seu arquivo na pasta do projeto ou apague o de <userData>.
  const TIPOS_ICONE = [['ico', 'image/x-icon'], ['png', 'image/png'], ['svg', 'image/svg+xml'], ['webp', 'image/webp']];
  const lerArquivoIcone = (dir) => {
    for (const [ext, tipo] of TIPOS_ICONE) {
      try { const b = fs.readFileSync(path.join(dir, 'copilot-icone.' + ext)); if (b.length && b.length <= 400 * 1024) return `data:${tipo};base64,${b.toString('base64')}`; } catch (_) {}
    }
    return null;
  };
  const lerIconeLocal = () => lerArquivoIcone(path.join(__dirname, 'fast-copilot-box'));
  const lerIconeSalvo = () => lerArquivoIcone(app.getPath('userData'));
  const gravarIconeSalvo = (tipo, bytes) => {
    try {
      const ext = (TIPOS_ICONE.find(([, t]) => t === tipo || (tipo === 'image/vnd.microsoft.icon' && t === 'image/x-icon')) || [])[0]; if (!ext) return;
      const f = path.join(app.getPath('userData'), 'copilot-icone.' + ext), tmp = f + '.tmp';
      fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, f); logDebugger('COPILOT_ICONE', 'Ícone oficial gravado localmente como copilot-icone.' + ext + ' (' + bytes.length + ' bytes)');
    } catch (_) {}
  };
  async function obterIconeCopilot() { // ícone oficial carregado pela própria coluna (SVG de preferência, senão o maior); nada é copiado para o projeto
    if (iconeCopilot) return iconeCopilot;
    const interno = lerIconeLocal() || lerIconeSalvo(); // cópia interna primeiro
    if (interno) { iconeMotivo = ''; return (iconeCopilot = interno); }
    const view = colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null;
    const wc = view && view.webContents;
    if (!wc || wc.isDestroyed()) { iconeMotivo = 'coluna-indisponivel'; return lerIconeLocal(); }
    // Só aceita o ícone quando a coluna está no chat do Copilot: em login/landing da Microsoft o favicon é o logotipo do Windows,
    // e como o resultado fica em cache esse ícone errado passava a valer na barra superior e no botão do editor.
    let hostChat = false; try { hostChat = new URL(wc.getURL()).hostname === 'copilot.cloud.microsoft'; } catch (_) {}
    if (!hostChat) { iconeMotivo = 'coluna-fora-do-chat'; return lerIconeLocal(); }
    try {
      const lista = await wc.mainFrame.executeJavaScript(`(() => [...document.querySelectorAll('link[rel*="icon" i]')].map(l => ({ href: l.href, tipo: l.type || '', tam: l.getAttribute('sizes') || '' })))()`, true);
      const pontos = (c) => { const n = Math.max(0, ...String(c.tam).split(/\s+/).map(x => parseInt(x, 10) || 0)); return (/svg/i.test(c.tipo) || /\.svg(\?|$)/i.test(c.href) ? 100000 : 0) + n; };
      const candidatos = (Array.isArray(lista) ? lista : []).filter(c => c && c.href).sort((x, y) => pontos(y) - pontos(x)).map(c => c.href);
      try { candidatos.push(new URL('/favicon.ico', wc.getURL()).href); } catch (_) {}
      for (const href of candidatos) {
        try {
          const url = new URL(href);
          if (url.protocol !== 'https:') continue;
          const resposta = await wc.session.fetch(url.href, { credentials: 'omit' }); // sem cookies: é só uma imagem pública
          const tipo = String(resposta.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!resposta.ok || !/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|webp)$/.test(tipo)) continue;
          const bytes = Buffer.from(await resposta.arrayBuffer());
          if (!bytes.length || bytes.length > 300 * 1024) continue;
          iconeMotivo = '';
          iconeCopilot = `data:${tipo};base64,${bytes.toString('base64')}`; gravarIconeSalvo(tipo, bytes);
          return iconeCopilot;
        } catch (_) {}
      }
      iconeMotivo = candidatos.length ? 'nenhum-candidato-valido' : 'sem-link-de-icone';
    } catch (_) { iconeMotivo = 'erro-ao-ler-coluna'; }
    return lerIconeLocal();
  }
  obterIconeColuna = obterIconeCopilot;
  hostIPC.handle('copilot-coluna-get', async () => ({ disponivel: colunaCopilotLigada(), visivel: !colunaCopilotOculta, icone: await obterIconeCopilot().catch(() => null), contextoIntegrado: copilotWebIntegrado }));
  // Fonte única de contexto do navegador. Ela existe mesmo quando o adaptador
  // de iframe está desligado: um futuro agente próprio pode usar as ferramentas
  // estruturadas sem depender de mensagens privadas de uma página remota.
  const perguntarContextoNavegador = async ({ origem, finalidade, titulo }) => {
    const r = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Assistente pede contexto', buttons: ['Permitir uma vez', 'Permitir nesta sessão', 'Negar'], defaultId: 2, cancelId: 2, noLink: true,
      message: 'O assistente (' + origem + ') quer ler ' + (finalidade === 'abas' ? 'a lista de abas abertas.' : 'o documento selecionado.'), detail: (titulo ? 'Documento: ' + titulo + '\n\n' : '') + 'Só permita se for você quem pediu. O conteúdo será enviado ao serviço do assistente.' });
    return ['uma-vez', 'sessao', 'negar'][r.response] || 'negar';
  };
  const provedorBrowserContext = anfitriaoCopilot.criarProvedor({
    getTabs: () => tabs, getActiveTabId: () => activeTabId, getJanela: () => mainWindow,
    perguntar: perguntarContextoNavegador,
    log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} }
  });
  // Não registrar por IPC: conteúdo de abas nunca fica disponível para páginas
  // web. Este contrato é consumível somente por código confiável do processo
  // principal ou por um agente futuro explicitamente registrado aqui.
  const ferramentasBrowserContext = browserContextTools.criarFerramentas({
    provedor: provedorBrowserContext, admin: () => adminCopilot,
    log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} }
  });
  void ferramentasBrowserContext;
  if (anfitriaoLigado) {
    const perguntarAbaAtiva = async ({ origem, titulo }) => {
      const r = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Compartilhar aba ativa',
        buttons: ['Permitir uma vez', 'Negar'], defaultId: 1, cancelId: 1, noLink: true,
        message: 'O Copilot (' + origem + ') solicita o conteúdo da aba ativa.',
        detail: (titulo ? 'Aba: ' + titulo + '\n\n' : '') + 'Esta permissão vale somente para este pedido.' });
      return r.response === 0 ? 'uma-vez' : 'negar';
    };
    const protocoloComercial = require('./copilot-contexto-ativo').criarProtocoloContextoAtivo({
      provedor: provedorBrowserContext, getActiveTabId: () => activeTabId, perguntar: perguntarAbaAtiva,
      log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} } });
    hostIPC.handle('copilot-anfitriao-msg', async (_e, p) => {
      if (!p || typeof p !== 'object') return [];
      const origem = typeof p.origem === 'string' ? p.origem : '';
      const comercial = typeof p.mensagem?.eventName === 'string' && p.mensagem.eventName.startsWith('Discover.');
      return comercial ? protocoloComercial.tratar(p.mensagem, origem) : [];
    });
    hostIPC.handle('copilot-anfitriao-falha', () => colunaCopilot.usarModoDireto());
  }
  // Ícone da barra: clique esquerdo mostra a coluna se oculta e oculta se visível.
  hostIPC.handle('copilot-coluna-clique', async (_e, botao) => {
    if (!colunaCopilotLigada()) return false;
    if (botao === 'direito' && copilotWebIntegrado) {
      const mostrarFalha = () => mostrarAviso('Não foi possível concluir a ação de contexto.', 'erro');
      Menu.buildFromTemplate([{
        label: 'Usar aba atual no Copilot',
        enabled: configManager.loadConfig().copilotContextoPermitido === true,
        click: () => { void exportadorContexto.exportar({ escopo: 'ativa' }).catch(mostrarFalha); }
      }, {
        type: 'checkbox',
        label: consentimentoCopilotRef ? 'Permitir que o Copilot use o conteúdo das abas' : 'Permitir contexto das abas',
        checked: consentimentoCopilotRef ? consentimentoCopilotRef.aceito() : configManager.loadConfig().copilotContextoPermitido === true,
        click: ({ checked }) => {
          // Com a ponte ligada, o menu, o switch de Configurações e o cartão gravam o mesmo consentimento.
          if (consentimentoCopilotRef) { void consentimentoCopilotRef.definir(checked).then(ok => { if (!ok) mostrarFalha(); }, mostrarFalha); return; }
          const salvo = configManager.saveConfig({ ...configManager.loadConfig(), copilotContextoPermitido: checked });
          if (!salvo) { mostrarFalha(); return; }
          void configManager.flush().catch(mostrarFalha);
        }
      }, ...(diagnosticoPonteCr ? [{
        label: 'Diagnóstico da ponte do Copilot',
        click: () => {
          // Só nomes de API e contagens: serve para ver o que a página do Copilot pediu e o que ficou sem resposta.
          const d = diagnosticoPonteCr();
          const estados = ['sem decisão', 'permitido', 'não permitido'];
          const semResposta = d.chamadas.filter(c => c.erro > 0);
          void dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'Diagnóstico da ponte do Copilot', message: 'Ponte entre o Copilot e o SuperPROC', buttons: ['Fechar'],
            detail: [
              'Consentimento: ' + (estados[d.consentimento] || 'sem decisão'),
              'Portas abertas pela página: ' + (d.portas.length ? d.portas.join(', ') : 'nenhuma'),
              'Eventos assinados: ' + (d.assinaturas.length ? d.assinaturas.length : 'nenhum'),
              'Chamadas atendidas: ' + d.chamadas.reduce((s, c) => s + c.ok, 0),
              'Pedidos de autenticação aninhada (respondidos como indisponível): ' + (d.autenticacaoAninhada.length ? d.autenticacaoAninhada.map(a => a.metodo + ' ×' + a.vezes).join(', ') : 'nenhum'),
              '',
              d.chamadas.length ? 'Chamadas por API (atendidas / recusadas):' : 'A página ainda não chamou a ponte nesta sessão.',
              ...d.chamadas.slice(0, 40).map(c => '  ' + c.api.replace(/^chrome\.(?:copilotBridgePrivate\.)?/, '') + ': ' + c.ok + ' / ' + c.erro),
              ...(semResposta.length ? ['', 'APIs pedidas e não atendidas: ' + semResposta.length] : [])
            ].join('\n')
          }).catch(mostrarFalha);
        }
      }] : []), {
        label: 'Testar leitura local da aba',
        enabled: configManager.loadConfig().copilotContextoPermitido === true,
        click: () => { void exportadorContexto.exportar({ testarLeitura: true }).catch(mostrarFalha); }
      }, {
        label: 'Diagnóstico do contexto',
        click: () => {
          void exportadorContexto.diagnosticar().then(estado => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Diagnóstico do contexto',
            message: 'Contexto das abas no SuperPROC',
            detail: [
              estado.permitido ? 'Permissão local ativa' : 'Permissão local desativada',
              estado.abaIdentificada
                ? (estado.abaLegivel ? 'Aba ativa identificada e elegível para leitura' : 'Aba ativa identificada, mas indisponível para leitura')
                : 'Nenhuma aba ativa identificada',
              estado.conversaDisponivel ? 'Endereço do chat reconhecido' : 'Abra uma conversa do Copilot para preparar contexto',
              estado.ultimaTentativa
                ? [estado.ultimaTentativa.etapa, estado.ultimaTentativa.mensagem].filter(Boolean).join(' — ')
                : 'Nenhuma tentativa nesta sessão',
              'A sua mensagem é enviada pelo próprio chat após a revisão.'
            ].join('\n'),
            buttons: ['Fechar']
          })).catch(mostrarFalha);
        }
      }, {
        label: 'Consultar políticas exportadas do Edge…',
        click: async () => {
          try {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              title: 'Selecionar exportação de edge://policy',
              properties: ['openFile'],
              filters: [{ name: 'Exportação JSON', extensions: ['json'] }]
            });
            if (canceled || !filePaths[0]) return;
            const arquivo = await fs.promises.open(filePaths[0], 'r');
            let texto;
            try {
              const info = await arquivo.stat();
              if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Exportação inválida ou acima de 1 MB.');
              const buffer = Buffer.alloc(info.size);
              const { bytesRead } = await arquivo.read(buffer);
              texto = buffer.toString('utf8', 0, bytesRead);
            } finally {
              await arquivo.close();
            }
            const { resumirPoliticasEdge } = require('./copilot-politicas-edge');
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Políticas exportadas do Edge',
              message: 'Políticas do Edge relacionadas ao Copilot',
              detail: resumirPoliticasEdge(texto) + '\n\nConsulta à exportação selecionada. A permissão do SuperPROC é configurada no menu do Copilot.',
              buttons: ['Fechar']
            });
          } catch (_) {
            mostrarAviso('Não foi possível ler o JSON exportado por edge://policy.', 'erro');
          }
        }
      }]).popup({ window: mainWindow });
      return true;
    }
    if (botao !== 'esquerdo') return false;
    colunaCopilotOculta = !colunaCopilotOculta;
    updateLayoutBounds(); enviarEstadoColuna(true).catch(() => {});
    logDebugger('COPILOT_COLUNA', 'Clique no ícone: coluna ' + (colunaCopilotOculta ? 'oculta' : 'visível'));
    return true;
  });
  hostIPC.on('copilot-coluna-toggle', () => {
    if (!colunaCopilotLigada()) return;
    colunaCopilotOculta = !colunaCopilotOculta;
    updateLayoutBounds();
    logDebugger('COPILOT_COLUNA', colunaCopilotOculta ? 'Coluna do Copilot ocultada (continua ativa fora da janela)' : 'Coluna do Copilot exibida');
    if (colunaCopilotOculta) { // instrumenta: confirma que a página oculta segue "visível" para o Chromium
      setTimeout(async () => {
        const v = colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null; const w = v && v.webContents;
        try { if (w && !w.isDestroyed()) logDebugger('COPILOT_COLUNA', 'Coluna oculta: visibilityState=' + await w.mainFrame.executeJavaScript('document.visibilityState', true)); } catch (_) {}
      }, 1000);
    }
  });
  const abaEditorFc = (wc) => (wc && !wc.isDestroyed() && tabs.some(t => t.view && t.view.webContents === wc) && fcModulo.ehEditor(wc.getURL()) ? wc : null);
  const fastCopilot = fcModulo.criarFastCopilot({
    app, BrowserWindow, webContents,
    getMainWindow: () => mainWindow,
    getAtalho: () => configManager.getAtalhoFastCopilot(),
    getAtalhoAlteracao: () => configManager.getAtalhoAlteracaoTexto(),
    getPosicaoAba: (wc) => { // canto da aba em coordenadas de tela + zoom (para a caixa de Alteração nascer junto ao texto)
      const t = tabs.find(x => x.view && x.view.webContents === wc); if (!t || !mainWindow || mainWindow.isDestroyed()) return null;
      const b = t.view.getBounds(), c = mainWindow.getContentBounds(); return { x: c.x + b.x, y: c.y + b.y, zoom: (typeof wc.getZoomFactor === 'function' ? wc.getZoomFactor() : 1) || 1 };
    },
    getColunaAtiva: colunaCopilotLigada,
    getColunaView: () => (colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null),
    getAbaEditor: abaEditorFc,
    getAlvos: (origem) => { // todas as abas do mesmo grupo (capa/editor/árvore...), a de origem primeiro; foco fora delas: grupo da aba ativa
      const dono = tabs.find(t => t.view && t.view.webContents === origem) || tabs.find(t => t.id === activeTabId);
      if (!dono) return [];
      const grupo = tabs.filter(t => t.id === dono.id || t.id === dono.splitWith || t.splitWith === dono.id ||
        (dono.groupId && t.groupId === dono.groupId) || (t.nativeSourceTabId === dono.id && !t.nativeStandalone));
      grupo.sort((x, y) => (y.id === dono.id) - (x.id === dono.id));
      return grupo.map(t => t.view && t.view.webContents).filter(w => w && !w.isDestroyed());
    },
    getAlvosPdf: (origem) => {
      const gerenciados = require('./abas-gerenciadas').resolveManagedTargets(tabs, origem);
      if (gerenciados.length) return gerenciados;
      const ativa = tabs.find(t => t.id === activeTabId);
      return ativa && ativa.view && ativa.view.webContents ? [ativa.view.webContents] : [];
    },
    abrirCaixa: (dados) => fastCopilotCaixa.abrir(dados),
    avisar: soErro((texto, nivel, ms) => mostrarAviso(texto, nivel, ms, false)),
    log: (tipo, msg) => logDebugger(tipo, msg),
    copiarTexto: (texto) => { try { clipboard.writeText(String(texto || '')); } catch (_) {} },
    editorVisivel: (wc) => { const t = tabs.find(x => x.id === activeTabId); return !!t && t.view && t.view.webContents === wc && !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized(); },
    obterIcone: obterIconeCopilot,
    motivoIcone: () => iconeMotivo,
    foco: {
      capturar: () => { const col = colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null; const w = col && col.webContents; return { colunaFocada: !!(w && !w.isDestroyed() && w.isFocused()) }; },
      restaurar: (wc, antes) => { // só devolve o foco; nunca minimiza nem troca de aba
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
        if (!mainWindow.isFocused()) mainWindow.focus();
        const col = colunaCopilot.estaAnexada() ? colunaCopilot.getView() : null; const w = col && col.webContents;
        const ativa = tabs.find(t => t.id === activeTabId);
        if (w && !w.isDestroyed() && w.isFocused() && !(antes && antes.colunaFocada) && wc && !wc.isDestroyed() && ativa && ativa.view && ativa.view.webContents === wc) wc.focus();
      }
    }
  });
  fastCopilotRef = fastCopilot;
  fastCopilot.instalar();
  // O clique no botão da barra vem do preload de sessão; só abas de editor de minutas gerenciadas são aceitas.
  fastCopilot.instalarIpc(ipcMain, abaEditorFc);
  app.on('web-contents-created', (_e, wc) => {
    const injetar = () => { if (abaEditorFc(wc)) setTimeout(() => fastCopilot.injetarBotao(wc), 400); };
    wc.on('did-finish-load', injetar);
    wc.on('did-navigate-in-page', injetar);
  });

  // --- ATALHOS DO ACESSO RÁPIDO (atalho único abre o painel; repetido abre menu de escolha) ---
  require('./quick-access-shortcuts').create({
    ignorarTecla: (input) => require('./quick-shortcut-core').combina(input, configManager.getAtalhoColarPdf()) || require('./quick-shortcut-core').combina(input, configManager.getAtalhoMinutaCopilot()) || require('./quick-shortcut-core').combina(input, configManager.getAtalhoFastCopilot()) || require('./quick-shortcut-core').combina(input, configManager.getAtalhoAlteracaoTexto()),
    app, BrowserWindow, screen, webContents, ipcMain,
    getMainWindow: () => mainWindow,
    getConfig: () => configManager.loadConfig(),
    openLink: (a) => openSidePanel({ url: a.url, category: a.categoria, title: a.nome, id: a.id }),
    isOpenLink: (a) => sidePanel.isOpen && sidePanel.activeKey === _panelPoolKey(a.id, a.url),
    closeLink: () => closeSidePanel(false),
    beforeOpen: hideHoverMenu
  }).instalar();

  hostIPC.on('hover-menu-open-add-dialog', (event, category) => {
    hideHoverMenu();
    if (category === 'legislacao' || category === 'leis') { abrirCatalogoLeis(); return; }
    showDialog(category === 'jurisprudencia' || category === 'juris' ? 'add-juris' : 'add-ferramentas');
  });

  hostIPC.on('hover-menu-open-manage-dialog', (event, category) => {
    hideHoverMenu();
    let target = 'jurisprudencia';
    if (category === 'legislacao' || category === 'leis') target = 'legislacao';
    if (category === 'ferramentas') target = 'ferramentas';
    showDialog('manage-links', { category: target });
  });

  // --- DIALOG IPC ---
  hostIPC.handle('dialog-get-data', () => activeDialogData);
  hostIPC.on('dialog-close', () => {
    if (activeDialog && !activeDialog.isDestroyed()) activeDialog.close();
  });
  hostIPC.handle('dialog-add-link', (event, { category, nome, url }) => {
    const updated = configManager.addLink(category, nome, url);
    mainWindow.webContents.send('config-updated', updated);
    return updated;
  });
  hostIPC.on('dialog-navigate-to', (event, url) => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.view) activeTab.view.webContents.loadURL(url);
  });
  hostIPC.on('dialog-open', (event, type) => {
    if (type === 'add-leis') {
      // O catálogo abre no painel lateral do acesso rápido, não em janela modal.
      if (activeDialog && !activeDialog.isDestroyed()) activeDialog.close();
      abrirCatalogoLeis();
      return;
    }
    showDialog(type);
  });

  // Sessão do eproc (enviada pela página)
  hostIPC.on('superproc:eproc-session', (event, data) => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    const tab = tabs.find(t => t.view?.webContents === event.sender);
    if (!tab || !data || typeof data !== 'object') return;
    updateSessionEprocData('', typeof data.homeHref === 'string' ? data.homeHref.slice(0,4096) : '', typeof data.locHref === 'string' ? data.locHref.slice(0,4096) : '', event.sender.getURL(), tab);
  });

  // Extensões
  hostIPC.on('extension-open-options', (e, extensionName, coords) => {
    openExtensionOptions(extensionName, coords);
  });

  // Ferramentas do Navegador
  hostIPC.on('toggle-devtools', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.view) {
      activeTab.view.webContents.toggleDevTools();
    }
  });

  hostIPC.handle('clear-cache', async () => {
    await clearV2Cache();
    return true;
  });

  // Limpar todos os dados: confirma, grava o marcador e reinicia; a exclusão ocorre na abertura seguinte (ver limpeza-total.js).
  // Limpar preferências: reseta o navegador em linhas gerais, mantendo logins, extensões instaladas (e seus módulos importados)
  // e scripts externos; os dados das extensões (bancos e armazenamento) são apagados. Ver limpeza-total.js.
  hostIPC.handle('clear-preferences', async () => {
    if (V2_SMOKE || !limpezaTotal.perfilValido(app.getPath('appData'), app.getPath('userData'))) throw Error('Limpeza de preferências indisponível neste perfil.');
    const { response } = await dialog.showMessageBox(activeDialog && !activeDialog.isDestroyed() ? activeDialog : mainWindow, {
      type: 'warning', title: 'Limpar preferências', message: 'Restaurar as preferências do SuperPROC e reiniciar?',
      detail: 'Serão apagados: configurações e preferências do navegador, histórico, Acesso Rápido, dicionário, conversas do Copilot, cache e os dados guardados pelas extensões (por exemplo, grupos de localizadores).\n\nSerão mantidos: os logins (cookies e armazenamento dos sites e da conta Microsoft), as extensões instaladas com seus módulos importados, os scripts externos e a biblioteca de leis. Para eliminar as extensões, use "Limpar Extensões".',
      buttons: ['Cancelar', 'Limpar preferências e reiniciar'], defaultId: 0, cancelId: 0, noLink: true });
    if (response !== 1) return false;
    await limparDadosDasExtensoes();
    await session.defaultSession.cookies.flushStore();
    // Quais extensões estão ligadas é preferência, mas sem ela as extensões mantidas voltariam desligadas: regrava só isso.
    const semente = { extensionLoading: { ...configManager.loadConfig().extensionLoading } };
    limpezaTotal.solicitar(app.getPath('appData'), limpezaTotal.MODO_PREFERENCIAS, { semente });
    app.relaunch();
    app.exit(0);
    return true;
  });

  // Limpar extensões: elimina AZflow, Epryx e SuperPROC (código, módulos importados, scripts externos e todo o armazenamento
  // delas); voltam a aparecer como não instaladas. Preferências e logins do navegador não são tocados.
  hostIPC.handle('clear-extensions', async () => {
    if (V2_SMOKE || !limpezaTotal.perfilValido(app.getPath('appData'), app.getPath('userData'))) throw Error('Limpeza de extensões indisponível neste perfil.');
    const { response } = await dialog.showMessageBox(activeDialog && !activeDialog.isDestroyed() ? activeDialog : mainWindow, {
      type: 'warning', title: 'Limpar extensões', message: 'Eliminar as extensões e reiniciar?',
      detail: 'AZflow, Epryx e SuperPROC serão removidas, junto com módulos importados, scripts externos e tudo o que elas guardaram localmente (grupos de localizadores etc.). Elas deixam de aparecer como instaladas e podem ser instaladas de novo, já do zero, no menu Addons.\n\nO restante do navegador (logins, preferências, Acesso Rápido) não é alterado. Não pode ser desfeito.',
      buttons: ['Cancelar', 'Eliminar extensões e reiniciar'], defaultId: 0, cancelId: 0, noLink: true });
    if (response !== 1) return false;
    await limparDadosDasExtensoes();
    const cfg = configManager.loadConfig();
    cfg.extensionLoading = { superproc: false, azflow: false, epryx: false, pdf: true };
    configManager.saveConfig(cfg);
    await configManager.flush();
    limpezaTotal.solicitar(app.getPath('appData'), limpezaTotal.MODO_EXTENSOES);
    app.relaunch();
    app.exit(0);
    return true;
  });

  // Extensões carregadas agora (lista de "Extensões em Execução" nas Configurações). Só aparece o que está de fato rodando.
  hostIPC.handle('extensions-status', () => [
    azflowId && { key: 'azflow', nome: 'AZflow', detalhe: 'Integrada com sucesso (Manifest V3)' },
    epryxId && { key: 'epryx', nome: 'Epryx', detalhe: 'Integrada com sucesso' },
    superprocId && { key: 'superproc', nome: 'SuperPROC', detalhe: 'Integrada (Capa, Árvore, Editor, IA)' }
  ].filter(Boolean));

  hostIPC.handle('clear-all-data', async () => {
    if (V2_SMOKE || !limpezaTotal.perfilValido(app.getPath('appData'), app.getPath('userData'))) throw Error('Limpeza total indisponível neste perfil.');
    const { response } = await dialog.showMessageBox(activeDialog && !activeDialog.isDestroyed() ? activeDialog : mainWindow, {
      type: 'warning', title: 'Limpar todos os dados', message: 'Apagar TODOS os dados do SuperPROC e reiniciar?',
      detail: 'Serão apagados, sem possibilidade de recuperação: logins e cookies, histórico, Acesso Rápido e demais configurações, extensões instaladas (AZflow, Epryx e SuperPROC) e seus dados, módulos importados, dicionário e conversas do Copilot. O navegador voltará ao estado de primeira abertura.',
      buttons: ['Cancelar', 'Apagar tudo e reiniciar'], defaultId: 0, cancelId: 0, noLink: true });
    if (response !== 1) return false;
    limpezaTotal.solicitar(app.getPath('appData'));
    app.relaunch();
    app.exit(0);
    return true;
  });

  // Downloads & Arquivos IPC

  hostIPC.handle('select-download-folder', async () => {
    const dlConfig = configManager.getDownloadsConfig();
    const defaultDir = (dlConfig.downloadPath && fs.existsSync(dlConfig.downloadPath))
      ? dlConfig.downloadPath
      : app.getPath('downloads');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar Pasta de Download',
      defaultPath: defaultDir,
      properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const chosenFolder = result.filePaths[0];
      configManager.setDownloadsConfig({ downloadPath: chosenFolder });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('downloads-config-updated', configManager.getDownloadsConfig());
      }
      return chosenFolder;
    }
    return null;
  });

  hostIPC.handle('get-download-config', () => configManager.getDownloadsConfig());

  hostIPC.handle('set-download-config', (event, cfg) => {
    const updated = configManager.setDownloadsConfig(cfg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads-config-updated', updated);
    }
    return updated;
  });

  hostIPC.handle('get-recent-downloads', () => configManager.getRecentDownloads());

  hostIPC.handle('clear-recent-downloads', () => {
    const updated = configManager.clearRecentDownloads();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads-updated', { recent: [] });
    }
    return updated;
  });

  hostIPC.on('open-download-folder', () => {
    const dlConfig = configManager.getDownloadsConfig();
    const folder = (dlConfig.downloadPath && fs.existsSync(dlConfig.downloadPath))
      ? dlConfig.downloadPath
      : app.getPath('downloads');
    shell.openPath(folder);
  });

  hostIPC.on('open-downloaded-file', (event, filePath) => {
    if (!recordedDownload(filePath)) return;
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    } else {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Arquivo não encontrado',
        message: `O arquivo não foi encontrado no caminho especificado:\n${filePath}`
      });
    }
  });

  // --- POPUPS FLUTUANTES: DOWNLOADS E HISTÓRICO ---
  hostIPC.on('show-downloads-menu', (event, coords) => {
    showDownloadsMenu(coords);
  });
  hostIPC.on('downloads-menu-close', () => {
    hideDownloadsMenu();
  });

  // Inicia um arrastar-e-soltar nativo do SO. Assim, o destino (por exemplo,
  // WhatsApp Web) recebe o arquivo como anexo, e não como texto copiado.
  hostIPC.on('downloads-start-file-drag', (event, filePath) => {
    if (!recordedDownload(filePath)) return;
    if (!downloadsMenuWin || downloadsMenuWin.isDestroyed() ||
        event.sender !== downloadsMenuWin.webContents ||
        typeof filePath !== 'string' || !path.isAbsolute(filePath) ||
        !fs.existsSync(filePath)) {
      return;
    }

    event.sender.startDrag({
      file: filePath,
      icon: getBrowserIconPath()
    });
  });
  hostIPC.handle('downloads-get-recent', () => {
    return configManager.getRecentDownloads();
  });
  hostIPC.on('downloads-open-file', (event, filePath) => {
    if (!recordedDownload(filePath)) return;
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    } else {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Arquivo não encontrado',
        message: `O arquivo não foi encontrado no caminho especificado:\n${filePath}`
      });
    }
  });
  hostIPC.on('downloads-show-in-folder', (event, filePath) => {
    if (!recordedDownload(filePath)) return;
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });
  hostIPC.on('downloads-open-folder', () => {
    const dlConfig = configManager.getDownloadsConfig();
    const folder = (dlConfig.downloadPath && fs.existsSync(dlConfig.downloadPath))
      ? dlConfig.downloadPath
      : app.getPath('downloads');
    shell.openPath(folder);
  });
  hostIPC.handle('downloads-clear', () => {
    const updated = configManager.clearRecentDownloads();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads-updated', { recent: [] });
    }
    return updated;
  });

  hostIPC.on('show-history-menu', (event, coords) => {
    showHistoryMenu(coords);
  });
  hostIPC.on('history-menu-close', () => {
    hideHistoryMenu();
  });
  hostIPC.handle('history-get', () => {
    return configManager.getHistory();
  });
  hostIPC.on('history-open-url', (event, url) => {
    hideHistoryMenu();
    if (!url) return;
    openUrlFromHistory(String(url)).catch(err => console.error('[Histórico] falha ao abrir URL:', err && err.message));
  });
  hostIPC.on('history-open-process', (event, procData) => {
    hideHistoryMenu();
    if (!procData) return;
    openProcessFromHistory(procData).catch(err => console.error('[Histórico] falha ao abrir processo:', err && err.message));
  });
  hostIPC.handle('history-item-action', async (event, payload) => {
    try { return await historyItemAction(payload); } catch (err) { console.error('[Histórico] ação do item falhou:', err && err.message); return { ok: false }; }
  });
  hostIPC.handle('history-remove-item', (event, { type, id }) => {
    const updated = configManager.removeHistoryItem(type, id);
    return updated;
  });
  hostIPC.handle('history-clear', (event, type) => {
    const updated = configManager.clearHistory(type);
    return updated;
  });
}

// --- CICLO DE VIDA DO APLICATIVO ---
app.whenReady().then(async () => {
  const extensionWindows=new Map();
  let browserReadyResolve;
  const browserReady=new Promise(resolve=>{browserReadyResolve=resolve;});
  require('./extension-tabs').installExtensionTabs(session.defaultSession,{
    openTab: async ({url,active}) => {
      await browserReady;
      if (!mainWindow || mainWindow.isDestroyed()) throw Error('Navegador ainda não está pronto.');
      const tab=createTab(url,false,{background:!active});
      return {id:tab.view.webContents.id,windowId:mainWindow.id,active,url};
    },
    openWindow: async ({url,active},options,worker) => {
      await browserReady;
      if(!mainWindow || mainWindow.isDestroyed())throw Error('Navegador ainda não está pronto.');
      const area=screen.getDisplayMatching(mainWindow.getBounds()).workArea;
      const width=Math.min(area.width,Math.max(320,Number(options.width)||1000));
      const height=Math.min(area.height,Math.max(240,Number(options.height)||800));
      const x=Number.isFinite(options.left)?Math.max(area.x,Math.min(area.x+area.width-width,options.left)):undefined;
      const y=Number.isFinite(options.top)?Math.max(area.y,Math.min(area.y+area.height-height,options.top)):undefined;
      const win=new BrowserWindow({parent:mainWindow,width,height,x,y,show:false,autoHideMenuBar:true,
        webPreferences:{session:session.defaultSession,contextIsolation:true,nodeIntegration:false,sandbox:true}});
      extensionWindows.set(win.id,{win,worker});trackPopupWindow(win);
      win.once('closed',()=>extensionWindows.delete(win.id));
      win.loadURL(url).catch(error=>console.warn('[SuperPROC] Falha ao abrir janela:',error.message));
      if(active)win.show();else win.showInactive();
      if(options.state==='maximized')win.maximize();else if(options.state==='minimized')win.minimize();
      return {id:win.id,focused:active,type:options.type||'normal',tabs:[{id:win.webContents.id,windowId:win.id,active:true,url}]};
    },
    updateWindow: (id,options,worker) => {
      const entry=extensionWindows.get(id);
      if(!entry || entry.worker!==worker || entry.win.isDestroyed())throw Error('Janela não disponível.');
      if(options.focused===true){entry.win.show();entry.win.focus();}
      return {id,focused:entry.win.isFocused()};
    }
  });
  if(V2_SMOKE){
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/i.test(details.url)}));
    configManager.loadConfig().homepage='data:text/html,<meta charset=utf-8><title>SuperPROC v2 synthetic</title><p>Local fixture</p>';
  }
  // O UA permanece compatível com Chrome para o WAF do TJSC.  Fora isso, não
  // reescrevemos cabeçalhos: o Chromium deve produzir Referer e Client Hints
  // exatamente como faria em uma aba normal.
  const customSession = session.defaultSession;
  customSession.setUserAgent(CHROME_USER_AGENT);
  try {
    legislacaoServico = require('./legislacao/servico').criarServico({
      dirDados: path.join(app.getPath('userData'), 'legislacao'),
      snapshot: path.join(__dirname, 'legislacao', 'dados', 'catalogo.json.gz'),
      // Só existe na árvore de desenvolvimento: o portátil exportado não leva as leis (elas são baixadas ao abrir).
      bibliotecaInicial: path.join(__dirname, 'legislacao', 'dados', 'biblioteca-inicial'),
      config: configManager,
      aoAlterarConfig: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('config-updated', configManager.loadConfig()); }
    });
    customSession.protocol.handle('superproc-lei', (req) => legislacaoServico.protocolo(req));
  } catch (e) { console.error('[Legislação] módulo local não iniciou:', e.message); }
  spellcheck.init(customSession, app.getPath('userData'), { enabled: configManager.loadConfig().corretorOrtografico !== false });
  // Teste de bancada (27/10/2026): só observa se a página do Copilot tenta falar com o navegador; não responde
  // nada e grava só metadados em <perfil>/copilot-escuta.jsonl. Liga com --copilot-escuta ou <perfil>/copilot-escuta.ligar.
  {
    const escutaMod = require('./copilot-escuta');
    const dirPerfil = app.getPath('userData');
    const ligada = !V2_SMOKE && escutaMod.estaLigada({ argv: process.argv, existe: p => fs.existsSync(p), caminhoFlag: path.join(dirPerfil, escutaMod.ARQUIVO_FLAG) });
    const gravarEscuta = escutaMod.criarGravador({ fs, caminho: path.join(dirPerfil, escutaMod.ARQUIVO_LOG) });
    if (ligada) escutaMod.observarCabecalhos(customSession, gravarEscuta);
    escutaCopilot = escutaMod.criarEscuta({
      ligada,
      getView: () => colunaCopilot.getView(),
      gravar: gravarEscuta,
      log: (cat, msg) => { try { logDebugger(cat, msg); } catch (_) {} }
    });
  }

  // Rastreio de rede de diagnóstico.  Mantém somente metadados de cada
  // requisição do eProc (nunca corpo, senha ou valor de cookie) para poder
  // correlacionar um aviso do sistema com a requisição que o antecedeu.
  const eprocRequestTrace = new BoundedCache({ maxEntries: 512, maxBytes: 256 * 1024, ttl: 60000, size: () => 256 });
  const isEprocControllerRequest = (details) => {
    return details && details.url && details.url.includes('tjsc.jus.br') &&
      (details.url.includes('controlador.php') || details.url.includes('controlador_ajax.php'));
  };
  const getEprocRequestMeta = (details) => {
    const url = new URL(details.url);
    return {
      ...getWebContentsTrace(details.webContentsId),
      requestId: details.id || null,
      tipoRecurso: details.resourceType,
      metodo: details.method,
      acao: url.searchParams.get('acao') || url.searchParams.get('acao_ajax') || '',
      sessionPresent: url.searchParams.has('hash')
    };
  };

  customSession.webRequest.onBeforeSendHeaders((details, callback) => {
    localizadoresSinal.inicio(details); // "vai mudar" (só age no pedido alterar_localizadores)
    // DEBUGGER: Registrar cabeçalhos e cookies enviados em requisições do eProc
    if (configManager.isDebuggerEnabled() && details.url.includes('tjsc.jus.br')) {
      const isControlador = details.url.includes('controlador.php') || details.url.includes('controlador_ajax.php');
      if (isControlador) {
        const urlObj = new URL(details.url);
        logDebugger('HTTP_REQ_ENVIADA', `[${details.method}] ${urlObj.pathname}${urlObj.search}`, {
          ...getWebContentsTrace(details.webContentsId),
          tipoRecurso: details.resourceType,
          requestId: details.id || null,
          sessionPresent: urlObj.searchParams.has('hash'),
          acao: urlObj.searchParams.get('acao') || urlObj.searchParams.get('acao_ajax') || '',
          referer: details.requestHeaders['Referer'] || details.requestHeaders['referer'] || ''
        });

        eprocRequestTrace.set(details.id, {
          inicio: details.timestamp || Date.now(),
          ...getEprocRequestMeta(details)
        });
      }
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  // DEBUGGER: Interceptar e registrar respostas do servidor e novos cookies (Set-Cookie)
  customSession.webRequest.onHeadersReceived((details, callback) => {
    if (configManager.isDebuggerEnabled() && details.url.includes('tjsc.jus.br')) {
      const isControlador = details.url.includes('controlador.php') || details.url.includes('controlador_ajax.php');
      if (isControlador) {
        const setCookie = details.responseHeaders['Set-Cookie'] || details.responseHeaders['set-cookie'];
        if (setCookie && setCookie.length > 0) {
          // Não grave valores de cookies no disco: são credenciais. O eProc
          // renova o cookie de afinidade em quase toda resposta, o que é
          // esperado e não significa que a sessão tenha mudado.
          const cookieNames = setCookie.map(cookie => String(cookie).split(';', 1)[0].split('=', 1)[0]);
          logDebugger('HTTP_SET_COOKIE', `Servidor eProc enviou Set-Cookie`, {
            ...getWebContentsTrace(details.webContentsId),
            requestId: details.id || null,
            tipoRecurso: details.resourceType,
            url: details.url,
            quantidade: setCookie.length,
            nomes: cookieNames
          });
        }
      }
    }
    callback({ cancel: false, responseHeaders: details.responseHeaders });
  });

  // A resposta final (e eventual redirecionamento/erro) é crucial: o alerta
  // pode nascer dentro de um iframe, onde não há console acessível ao preload.
  customSession.webRequest.onBeforeRedirect((details) => {
    if (!configManager.isDebuggerEnabled() || !isEprocControllerRequest(details)) return;
    const trace = (typeof completedTrace !== 'undefined' ? completedTrace : eprocRequestTrace.get(details.id)) || getEprocRequestMeta(details);
    logDebugger('HTTP_REDIRECIONADA', 'Requisição eProc redirecionada', {
      ...trace,
      status: details.statusCode,
      destino: details.redirectURL || '',
      decorridoMs: Math.round((details.timestamp || Date.now()) - (trace.inicio || details.timestamp || Date.now()))
    });
  });

  customSession.webRequest.onCompleted((details) => {
    localizadoresSinal.fim(details, details.statusCode < 400); // "atualizados"
    const completedTrace = eprocRequestTrace.get(details.id);
    eprocRequestTrace.delete(details.id);
    if (!configManager.isDebuggerEnabled() || !isEprocControllerRequest(details)) return;
    const trace = (typeof completedTrace !== 'undefined' ? completedTrace : eprocRequestTrace.get(details.id)) || getEprocRequestMeta(details);
    logDebugger('HTTP_RESPOSTA_CONCLUIDA', 'Requisição eProc concluída', {
      ...trace,
      status: details.statusCode,
      cache: Boolean(details.fromCache),
      decorridoMs: Math.round((details.timestamp || Date.now()) - (trace.inicio || details.timestamp || Date.now()))
    });
    eprocRequestTrace.delete(details.id);
  });

  customSession.webRequest.onErrorOccurred((details) => {
    localizadoresSinal.fim(details, false);
    const completedTrace = eprocRequestTrace.get(details.id);
    eprocRequestTrace.delete(details.id);
    if (!configManager.isDebuggerEnabled() || !isEprocControllerRequest(details)) return;
    const trace = (typeof completedTrace !== 'undefined' ? completedTrace : eprocRequestTrace.get(details.id)) || getEprocRequestMeta(details);
    logDebugger('HTTP_ERRO_REDE', 'Requisição eProc falhou', {
      ...trace,
      erro: details.error || 'erro não informado',
      decorridoMs: Math.round((details.timestamp || Date.now()) - (trace.inicio || details.timestamp || Date.now()))
    });
    eprocRequestTrace.delete(details.id);
  });

  setupIPC();
  setupDownloadManager();
  printToPdf.registerSession(session.defaultSession);
  if (V2_SMOKE) prepararExtensoesDoTeste();
  await loadInstalledExtensions();
  createMainWindow();
  const pdfStartupConfig = configManager.loadConfig();
  if (pdfStartupConfig.optionalFeaturesEnabled !== false && pdfStartupConfig.extensionLoading?.pdf !== false) {
    try { await pdfReader.load(loadExtensionHelper,true); } catch(err) {console.warn('[PDF Reader]',err.message);}
  }


  // Criar primeira aba com o Eproc (aba inicial)
  const config = configManager.loadConfig();
  createTab(config.homepage, true);
  browserReadyResolve();
  tratarPosAtualizacao();
  agendarVerificacaoAtualizacaoApp();
  if(V2_SMOKE) require('../scripts/host-smoke.cjs')({app,mainWindow,tabs:()=>tabs,session,superprocId,azflowId,epryxId,pdfReader,createTab,closeTab,openSidePanel,closeSidePanel,panelViewPool,sidePanel,updatePanelPinStyle,clearV2Cache,configManager,switchTab,secondScreen,getEffectiveOpenMode,colunaCopilot,SCRIPT_LIMPAR_VEU_DE_SAIDA,fecharPorUsuario,alternarNaPilha,empilharPorArraste,cliqueSubabaNaPilha,abrirArvoreDupla,opcaoArvoreDupla,hoverMenuWindow:()=>hoverMenuWin,definirPerguntaPilha:(f)=>{perguntarFechamentoDaPilha=f;},entradasBarra:()=>configManager.getRelacionadosEmPilha()?pilhaRelacionados.colapsar(ultimasEntradasBarra,pilhaTopoMemo):ultimasEntradasBarra});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});


app.on('window-all-closed', () => {
  if (v2ShutdownInProgress) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Flush twice: the authorized window close itself records final geometry.
let v2Quitting = false, v2ShutdownInProgress = false;
app.on('before-quit', event => {
  if (v2Quitting) return;
  event.preventDefault();
  if(v2ShutdownInProgress)return;
  v2ShutdownInProgress=true;
  (async()=>{
    try { escutaCopilot?.parar(); } catch (_) {}
    await Promise.all([configManager.flush(),diagnosticWriter.flush(),spellcheck.flush()]);
    hostCloseGuard?.closeFromUser();
    await configManager.flush();
    await session.defaultSession.cookies.flushStore(); // cookies de login são sempre preservados
    session.defaultSession.flushStorageData();
    try { aplicarAtualizacaoAoFechar(); } catch (_) { /* a atualização fica para a próxima vez */ }
    v2Quitting=true;v2ShutdownInProgress=false;app.quit();
  })().catch(()=>{v2ShutdownInProgress=false;dialog.showErrorBox('SuperPROC v2','Não foi possível salvar as preferências. Verifique o espaço em disco e tente encerrar novamente.');});
});
