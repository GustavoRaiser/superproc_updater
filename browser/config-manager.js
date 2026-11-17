const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const { durableUrl } = require('./v2-policy');
const { normalizarCnj, formatarCnj, deveRegistrar, migrarEntrada, urlDeAutenticacao } = require('./history-process');
const { normalizarPartes } = require('./history-parties');
const { normalizarModo, colunaDoModoLegado } = require('./open-mode');
const { FAIXA_COPILOT, FAIXA_ARVORE, normalizarPct } = require('./layout-geometry');
/**
 * Legislação padrão: as normas do Acesso Rápido padrão (browser/legislacao/dados/padrao.json, geradas por
 * scripts/gerar-biblioteca-inicial.cjs) na ordem de sempre, apontando para a cópia local, mais o link do tribunal.
 * As leis em si NÃO vão no portátil (ver composicao.cjs): cada uma é baixada, já limpa, na primeira vez que é aberta.
 */
function legislacaoPadrao() {
  let normas = [];
  try { normas = require('./legislacao/dados/padrao.json'); } catch { /* sem biblioteca inicial: só o link do tribunal */ }
  return [
    ...normas.map(n => ({ id: n.id, nome: n.nome, url: 'superproc-lei://norma/' + n.slug, norma: { urn: n.urn, slug: n.slug } })),
    { id: 'l21', nome: 'Legislação do TJSC', url: 'https://www.tjsc.jus.br/legislacao/interna' }
  ];
}

const DEFAULT_CONFIG = {
  homepage: 'https://eproc1g.tjsc.jus.br/eproc/',
  windowState: {
    width: 1366,
    height: 850,
    x: undefined,
    y: undefined,
    isMaximized: false
  },
  downloads: {
    downloadPath: '',
    autoDownload: false
  },
  retainLogin: true,
  debuggerEnabled: false,
  optionalFeaturesEnabled: true,
  extensionLoading: { superproc: false, azflow: false, epryx: false, pdf: true },
  corretorOrtografico: true,
  modoAbertura: 'integrada',
  colunaCopilot: false,
  relacionadosEmPilha: true,
  copilotColunaPct: FAIXA_COPILOT.padrao,
  atalhoColarPdfCopilot: null, // atalho (code + modificadores) que anexa o PDF do leitor ao Copilot; sem padrão
  atalhoMinutaCopilot: null, // atalho que anexa a minuta aberta ao chat do Copilot; sem padrão
  atalhoAlteracaoTexto: null, // atalho que abre a caixa de Alteração de Texto (editor de minutas); sem padrão
  atalhoFastCopilot: null, // atalho que abre a caixa do Fast Copilot no editor de minutas; sem padrão
  arvorePct: FAIXA_ARVORE.padrao,
  recentDownloads: [],
  historyUrls: [],
  historyProcesses: [],
  categoryWidths: {
    jurisprudencia: 500,
    legislacao: 500,
    ferramentas: 500
  },
  itemWidths: {},
  jurisprudencia: [
    { id: 'j1', nome: 'TJSC - Pesquisa', url: 'https://eproc1g.tjsc.jus.br/eproc/externo_controlador.php?acao=jurisprudencia@jurisprudencia/pesquisar' },
    { id: 'j2', nome: 'STJ', url: 'https://scon.stj.jus.br/SCON/' },
    { id: 'j3', nome: 'STJ - Informativo', url: 'https://processo.stj.jus.br/jurisprudencia/externo/informativo/' },
    { id: 'j4', nome: 'STF', url: 'https://portal.stf.jus.br/jurisprudencia/' },
    { id: 'j5', nome: 'STF - Informativo', url: 'https://portal.stf.jus.br/textos/verTexto.asp?servico=informativoSTF' },
    { id: 'j6', nome: 'Jurisprudência GPT', url: 'https://app.jurisprudenciagpt.ai/' },
    { id: 'j7', nome: 'Jusbrasil', url: 'https://www.jusbrasil.com.br/home' },
    { id: 'j8', nome: 'Expressões em Latim (Wikipédia)', url: 'https://pt.wikipedia.org/wiki/Lista_de_express%C3%B5es_jur%C3%ADdicas_em_latim' }
  ],
  legislacao: legislacaoPadrao(),
  ferramentas: [
    { id: 'f1', nome: 'IA - Biblioteca de Prompts', url: 'https://app.tjsc.jus.br/jud-biblioteca-prompts/#/home' },
    { id: 'f3', nome: 'Peritos-TJ (Painel PowerBI)', url: 'https://app.powerbi.com/view?r=eyJrIjoiNzZiNTIwMWEtZWU4NC00YTE2LThhNjMtNWRhM2JiODI0YzNjIiwidCI6IjQwMGI3OWY4LTlmMTMtNDdjNy05MjNmLTRiMTY5NWJmM2IyOSJ9' },
    { id: 'f4', nome: 'SDJ - Sistema de Distribuição Judicial', url: 'https://sidejud.tjsc.jus.br/sidejud-comarca/#/listar' },
    { id: 'f5', nome: 'Biblioteca TJSC', url: 'https://app.tjsc.jus.br/plataformas-eletronicas/#/minha-biblioteca' },
    { id: 'f6', nome: 'Biblioteca Fórum', url: 'https://sso.tjsc.jus.br/realms/tjsc/protocol/cas/login?TARGET=https%3A%2F%2Fapp.tjsc.jus.br%3A443%2Fplataformas-eletronicas%2Fminha-biblioteca' },
    { id: 'f7', nome: 'AEPG - Atendimento PG', url: 'http://cgjweb.tjsc.jus.br/painelatendimentopg/painel.action' },
    { id: 'f8', nome: 'AJG - Assistência Judiciária Gratuita', url: 'https://ajg.tjsc.jus.br/aj/intranet/' },
    { id: 'f9', nome: 'Banco Central - Séries SGS', url: 'https://www3.bcb.gov.br/sgspub/localizarseries/localizarSeries.do?method=prepararTelaLocalizarSeries' },
    { id: 'f11', nome: 'Lista de Instituições Financeiras', url: 'https://www.bcb.gov.br/estabilidadefinanceira/relacao_instituicoes_funcionamento' },
    { id: 'f12', nome: 'Biblioteca de Prompts - BPI', url: 'https://app.tjsc.jus.br/jud-biblioteca-prompts/#/prompts' }
  ]
};

function getConfigPath() {
  const userDataDir = (app && typeof app.getPath === 'function')
    ? app.getPath('userData')
    : path.join(process.env.APPDATA || '.', 'superproc-browser-v2');
  return path.join(userDataDir, 'superproc-config.json');
}

function normalizeCategory(cat) {
  if (!cat) return 'jurisprudencia';
  const c = String(cat).toLowerCase().trim();
  if (c === 'juris' || c === 'jurisprudencia') return 'jurisprudencia';
  if (c === 'leis' || c === 'legislacao') return 'legislacao';
  if (c === 'ferramentas' || c === 'ferramenta') return 'ferramentas';
  return cat;
}

let memoryConfig = null;
let configWriter;
function writer() { return configWriter ||= require('./atomic-config').atomicConfig(getConfigPath()); }
async function flush() { if (configWriter) await configWriter.flush(); }

function loadConfig(forceReload = false) {
  if (memoryConfig && !forceReload) {
    return memoryConfig;
  }
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const conf = { ...DEFAULT_CONFIG, ...parsed };
      
      // Compatibilidade e migração de categorias (preserva listas mesmo se vazias)
      if (!Array.isArray(conf.jurisprudencia)) {
        conf.jurisprudencia = Array.isArray(conf.juris) ? conf.juris : DEFAULT_CONFIG.jurisprudencia;
      }
      if (!Array.isArray(conf.legislacao)) {
        conf.legislacao = Array.isArray(conf.leis) ? conf.leis : DEFAULT_CONFIG.legislacao;
      }
      if (!Array.isArray(conf.ferramentas)) {
        conf.ferramentas = DEFAULT_CONFIG.ferramentas;
      }
      delete conf.legislacaoFormatada; // recurso removido
      if (typeof conf.corretorOrtografico !== 'boolean') conf.corretorOrtografico = true;
      // Migração: o antigo modo 'integradaCopilot' virou Integrada + toggle "Coluna Copilot" ligado
      if (typeof parsed.colunaCopilot !== 'boolean') conf.colunaCopilot = colunaDoModoLegado(parsed.modoAbertura);
      conf.modoAbertura = normalizarModo(conf.modoAbertura);
      conf.colunaCopilot = conf.colunaCopilot === true;
      conf.relacionadosEmPilha = conf.relacionadosEmPilha !== false;
      conf.copilotColunaPct = normalizarPct(conf.copilotColunaPct, FAIXA_COPILOT);
      conf.atalhoColarPdfCopilot = require('./quick-shortcut-core').normalizarSalvo(conf.atalhoColarPdfCopilot);
      conf.atalhoFastCopilot = require('./quick-shortcut-core').normalizarSalvo(conf.atalhoFastCopilot);
      conf.atalhoMinutaCopilot = require('./quick-shortcut-core').normalizarSalvo(conf.atalhoMinutaCopilot);
      conf.atalhoAlteracaoTexto = require('./quick-shortcut-core').normalizarSalvo(conf.atalhoAlteracaoTexto);
      conf.arvorePct = normalizarPct(conf.arvorePct, FAIXA_ARVORE);

      if (!conf.homepage) {
        conf.homepage = DEFAULT_CONFIG.homepage;
      }

      // Manter aliases de compatibilidade bidirecionais
      conf.juris = conf.jurisprudencia;
      conf.leis = conf.legislacao;

      const cutoff = Date.now() - 90 * 86400000;
      conf.historyUrls = (conf.historyUrls || []).filter(x => x.timestamp >= cutoff && !urlDeAutenticacao(x.url)).map(x => ({...x,url:durableUrl(x.url)})).slice(0,200);
      // Processos: número CNJ completo, sem URL persistida (ver history-process.js / history-links.js).
      conf.historyProcesses = (conf.historyProcesses || []).filter(x => x && x.timestamp >= cutoff).map(migrarEntrada).filter(Boolean).slice(0,200);
      conf.optionalFeaturesEnabled = true; // Navegador+ é sempre ativo (sem chave na interface)
      memoryConfig = conf;
      return conf;
    }
  } catch (err) {
    console.error('Erro ao ler superproc-config.json, usando padrão:', err);
  }
  const def = { ...DEFAULT_CONFIG };
  def.juris = def.jurisprudencia;
  def.leis = def.legislacao;
  // Antes de o app ficar pronto a pasta do perfil (userData) ainda pode não estar definida: o arquivo "não existe" só
  // porque o caminho está errado. Não memoriza o padrão nesse caso, senão a sessão inteira usaria (e gravaria) o padrão.
  if (!app || typeof app.isReady !== 'function' || app.isReady()) memoryConfig = def;
  return def;
}

function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    // Garante sincronização de apelidos antes de salvar
    if (config.jurisprudencia) config.juris = config.jurisprudencia;
    if (config.legislacao) config.leis = config.legislacao;
    console.log('[DIAG-CFG] saveConfig ext=' + JSON.stringify(config.extensionLoading) + ' ' + new Error().stack.split('\n').slice(2, 5).join(' | '));
    writer().save(config);
    memoryConfig = config;
    return true;
  } catch (err) {
    console.error('Erro ao salvar superproc-config.json:', err);
    return false;
  }
}

// Normaliza as listas antes de gravar: atalhos inválidos saem, grupos têm um só nível, ids garantidos.
function limparAtalhos(lista) {
  return normalizarNormas(require('./quick-shortcut-core').sanearLista(lista));
}

// Vínculo com a biblioteca local só vale se a URL ainda for a gerada pelo app para aquela norma.
function normalizarNormas(lista) {
  const ok = (it) => it.norma && typeof it.norma.urn === 'string' && typeof it.norma.slug === 'string' &&
    /^[a-z0-9-]+$/.test(it.norma.slug) && it.url === `superproc-lei://norma/${it.norma.slug}`;
  for (const it of Array.isArray(lista) ? lista : []) {
    if (it && it.tipo === 'grupo') normalizarNormas(it.itens);
    else if (it && it.norma && !ok(it)) { delete it.norma; delete it.origemUrl; }
  }
  return lista;
}

function saveAllCategories(categoriesMap) {
  const config = loadConfig();
  if (categoriesMap) {
    for (const k of ['jurisprudencia', 'legislacao', 'ferramentas']) {
      if (Array.isArray(categoriesMap[k])) categoriesMap = { ...categoriesMap, [k]: limparAtalhos(categoriesMap[k]) };
    }
    if (Array.isArray(categoriesMap.jurisprudencia)) {
      config.jurisprudencia = categoriesMap.jurisprudencia;
      config.juris = config.jurisprudencia;
    }
    if (Array.isArray(categoriesMap.legislacao)) {
      config.legislacao = categoriesMap.legislacao;
      config.leis = config.legislacao;
    }
    if (Array.isArray(categoriesMap.ferramentas)) {
      config.ferramentas = categoriesMap.ferramentas;
    }
  }
  saveConfig(config);
  return config;
}

function addLink(category, nome, url) {
  category = normalizeCategory(category);
  const config = loadConfig();
  if (!Array.isArray(config[category])) config[category] = [];
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  config[category].push({ id, nome, url });
  if (category === 'jurisprudencia') config.juris = config.jurisprudencia;
  if (category === 'legislacao') config.leis = config.legislacao;
  saveConfig(config);
  return config;
}

function removeLink(category, id) {
  category = normalizeCategory(category);
  const config = loadConfig();
  if (!Array.isArray(config[category])) return config;
  config[category] = config[category].filter(item => item.id !== id);
  if (category === 'jurisprudencia') config.juris = config.jurisprudencia;
  if (category === 'legislacao') config.leis = config.legislacao;
  saveConfig(config);
  return config;
}

function updateLink(category, id, nome, url) {
  category = normalizeCategory(category);
  const config = loadConfig();
  if (!Array.isArray(config[category])) return config;
  const index = config[category].findIndex(item => item.id === id);
  if (index !== -1) {
    // Preserva o atalho do Acesso Rápido (campo opcional) ao editar nome/URL. Item de norma da biblioteca
    // local (`norma`, `origemUrl`) só continua vinculado se a URL não foi trocada.
    const { atalho, norma, origemUrl } = config[category][index];
    const mantemNorma = norma && config[category][index].url === url;
    config[category][index] = { id, nome, url, ...(atalho ? { atalho } : {}), ...(mantemNorma ? { norma, ...(origemUrl ? { origemUrl } : {}) } : {}) };
    if (category === 'jurisprudencia') config.juris = config.jurisprudencia;
    if (category === 'legislacao') config.leis = config.legislacao;
    saveConfig(config);
  }
  return config;
}

function setCategoryLinks(category, linksList) {
  category = normalizeCategory(category);
  const config = loadConfig();
  config[category] = Array.isArray(linksList) ? normalizarNormas(linksList) : [];
  if (category === 'jurisprudencia') config.juris = config.jurisprudencia;
  if (category === 'legislacao') config.leis = config.legislacao;
  saveConfig(config);
  return config;
}

function moveLink(category, id, direction) {
  category = normalizeCategory(category);
  const config = loadConfig();
  const list = config[category];
  if (!list || !Array.isArray(list)) return config;
  const idx = list.findIndex(item => item.id === id);
  if (idx === -1) return config;

  if (direction === 'up' && idx > 0) {
    const temp = list[idx];
    list[idx] = list[idx - 1];
    list[idx - 1] = temp;
  } else if (direction === 'down' && idx < list.length - 1) {
    const temp = list[idx];
    list[idx] = list[idx + 1];
    list[idx + 1] = temp;
  }
  if (category === 'jurisprudencia') config.juris = config.jurisprudencia;
  if (category === 'legislacao') config.leis = config.legislacao;
  saveConfig(config);
  return config;
}

function getItemKey({ id, url, title } = {}) {
  if (id) return String(id);
  const config = loadConfig();
  const allLinks = [
    ...(config.jurisprudencia || []),
    ...(config.legislacao || []),
    ...(config.ferramentas || [])
  ];
  if (url) {
    const match = allLinks.find(item => item.url === url);
    if (match && match.id) return match.id;
  }
  if (title) {
    const match = allLinks.find(item => item.nome === title);
    if (match && match.id) return match.id;
  }
  return url || title || 'default';
}

function getCategoryWidth(category) {
  const norm = normalizeCategory(category);
  const config = loadConfig();
  if (config.categoryWidths && typeof config.categoryWidths[norm] === 'number' && !isNaN(config.categoryWidths[norm])) {
    return config.categoryWidths[norm];
  }
  return 500;
}

function saveCategoryWidth(category, width) {
  const norm = normalizeCategory(category);
  const config = loadConfig();
  if (!config.categoryWidths || typeof config.categoryWidths !== 'object') {
    config.categoryWidths = { jurisprudencia: 500, legislacao: 500, ferramentas: 500 };
  }
  const rounded = Math.max(340, Math.round(width));
  config.categoryWidths[norm] = rounded;
  saveConfig(config);
}

function getItemKey({ id, url, title } = {}) {
  if (id) return String(id);
  const config = loadConfig();
  const allLinks = [
    ...(config.jurisprudencia || []),
    ...(config.legislacao || []),
    ...(config.ferramentas || [])
  ];
  if (url) {
    const match = allLinks.find(item => item.url === url);
    if (match && match.id) return match.id;
  }
  if (title) {
    const match = allLinks.find(item => item.nome === title);
    if (match && match.id) return match.id;
  }
  return url || title || 'default';
}

function getItemWidth(key) {
  if (!key) return 500;
  const config = loadConfig();
  if (config.itemWidths && typeof config.itemWidths[key] === 'number' && !isNaN(config.itemWidths[key])) {
    return config.itemWidths[key];
  }
  return 500;
}

function saveItemWidth(key, width) {
  if (!key) return;
  const config = loadConfig();
  if (!config.itemWidths || typeof config.itemWidths !== 'object') {
    config.itemWidths = {};
  }
  const rounded = Math.max(340, Math.round(width));
  config.itemWidths[key] = rounded;
  saveConfig(config);
}

function getWindowState() {
  const config = loadConfig();
  const defaultState = { width: 1366, height: 850, x: undefined, y: undefined, isMaximized: false };
  if (config.windowState && typeof config.windowState === 'object') {
    return { ...defaultState, ...config.windowState };
  }
  return defaultState;
}

function saveWindowState(state) {
  if (!state || typeof state !== 'object') return;
  const config = loadConfig();
  config.windowState = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    isMaximized: !!state.isMaximized
  };
  saveConfig(config);
}

function getDownloadsConfig() {
  const config = loadConfig();
  let defaultPath = '';
  try {
    if (app && typeof app.getPath === 'function') {
      defaultPath = app.getPath('downloads');
    }
  } catch (e) {}
  const downloads = config.downloads || {};
  return {
    downloadPath: downloads.downloadPath || defaultPath,
    autoDownload: !!downloads.autoDownload
  };
}

function setDownloadsConfig(newCfg) {
  if (!newCfg || typeof newCfg !== 'object') return getDownloadsConfig();
  const config = loadConfig();
  if (!config.downloads) config.downloads = {};
  if (typeof newCfg.downloadPath === 'string') {
    config.downloads.downloadPath = newCfg.downloadPath;
  }
  if (typeof newCfg.autoDownload === 'boolean') {
    config.downloads.autoDownload = newCfg.autoDownload;
  }
  saveConfig(config);
  return getDownloadsConfig();
}

function getRecentDownloads() {
  const config = loadConfig();
  return Array.isArray(config.recentDownloads) ? config.recentDownloads : [];
}

function addRecentDownload(item) {
  if (!item || !item.path) return getRecentDownloads();
  const config = loadConfig();
  if (!Array.isArray(config.recentDownloads)) {
    config.recentDownloads = [];
  }
  config.recentDownloads = config.recentDownloads.filter(d => d.path !== item.path);
  config.recentDownloads.unshift(item);
  if (config.recentDownloads.length > 25) {
    config.recentDownloads = config.recentDownloads.slice(0, 25);
  }
  saveConfig(config);
  return config.recentDownloads;
}

function clearRecentDownloads() {
  const config = loadConfig();
  config.recentDownloads = [];
  saveConfig(config);
  return [];
}

// --- HISTÓRICO DUPLO (URLS E PROCESSOS) ---
function getHistory() {
  const config = loadConfig();
  return {
    urls: Array.isArray(config.historyUrls) ? config.historyUrls.map(({ sig, ...pub }) => pub) : [],
    processes: Array.isArray(config.historyProcesses) ? config.historyProcesses : []
  };
}

// URL assinada original da entrada (decifrada só no processo principal), ou '' se não houver.
function getSignedHistoryUrl(url) {
  const entry = (loadConfig().historyUrls || []).find(x => x && x.url === url);
  try {
    if (entry?.sig?.startsWith('dpapi:') && safeStorage?.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(entry.sig.slice(6), 'base64'));
  } catch {}
  return '';
}

function addUrlHistory(item) {
  if (!item || !item.url) return;
  const urlStr = durableUrl(item.url);
  if (urlDeAutenticacao(item.url)) return;
  if (!urlStr || urlStr.startsWith('file:') || urlStr.startsWith('about:') || urlStr.includes('empty-tab.html')) return;

  const config = loadConfig();
  if (!Array.isArray(config.historyUrls)) config.historyUrls = [];

  const id = 'url_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const entry = {
    id,
    url: urlStr,
    title: item.title && item.title !== 'Sem título' ? String(item.title).trim().replace(/https?:\/\/[^\s]+/g, value=>durableUrl(value)) : urlStr,
    // A URL persistida não tem assinatura; este marcador diz que o original tinha (exige reassinar ao abrir).
    assinada: (() => { try { return new URL(item.url).searchParams.has('hash'); } catch { return false; } })(),
    timestamp: Date.now()
  };
  // Como o histórico do Chrome, o endereço assinado (com hash) pode ser reaberto depois; fica cifrado
  // pelo cofre do sistema (DPAPI) e nunca vai para a interface. Sem cofre disponível, não é gravado.
  if (entry.assinada) {
    try { if (safeStorage?.isEncryptionAvailable()) entry.sig = 'dpapi:' + safeStorage.encryptString(String(item.url)).toString('base64'); } catch {}
  }

  config.historyUrls = config.historyUrls.filter(u => u.url !== entry.url);
  config.historyUrls.unshift(entry);

  if (config.historyUrls.length > 200) {
    config.historyUrls = config.historyUrls.slice(0, 200);
  }
  saveConfig(config);
  return entry;
}

// Histórico de processos acessados: número CNJ completo (validado), sem URL. Um mesmo processo
// não é gravado duas vezes em sequência nem com menos de 1 h desde a última gravação dele.
function addProcessHistory(item) {
  if (!item) return;
  const digits = normalizarCnj(item.digits) || normalizarCnj(item.procNumber);
  if (!digits) return;

  const config = loadConfig();
  if (!Array.isArray(config.historyProcesses)) config.historyProcesses = [];
  const lista = config.historyProcesses;

  if (!deveRegistrar(lista, digits, Date.now())) return null;

  const id = 'proc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const entry = { id, procNumber: formatarCnj(digits), digits, ...(normalizarPartes(item.partes) ? { partes: normalizarPartes(item.partes) } : {}), timestamp: Date.now() };
  config.historyProcesses.unshift(entry);
  if (config.historyProcesses.length > 200) config.historyProcesses = config.historyProcesses.slice(0, 200);
  saveConfig(config);
  return entry;
}

// Grava autor/réu na gravação mais recente do processo, só quando ainda não há (a capa carrega depois do registro).
function setProcessParties(digitos, partes) {
  const digits = normalizarCnj(digitos);
  const novas = normalizarPartes(partes);
  if (!digits || !novas) return null;
  const config = loadConfig();
  const alvo = (config.historyProcesses || []).find(p => p && p.digits === digits);
  if (!alvo || normalizarPartes(alvo.partes)) return null;
  alvo.partes = novas;
  saveConfig(config);
  return alvo;
}

function removeHistoryItem(type, id) {
  if (!id) return getHistory();
  const config = loadConfig();
  if (type === 'processes' || type === 'process') {
    if (Array.isArray(config.historyProcesses)) {
      config.historyProcesses = config.historyProcesses.filter(p => p.id !== id && p.procNumber !== id);
    }
  } else {
    if (Array.isArray(config.historyUrls)) {
      config.historyUrls = config.historyUrls.filter(u => u.id !== id && u.url !== id);
    }
  }
  saveConfig(config);
  return getHistory();
}

function clearHistory(type = 'all') {
  const config = loadConfig();
  if (type === 'all' || type === 'urls') {
    config.historyUrls = [];
  }
  if (type === 'all' || type === 'processes' || type === 'process') {
    config.historyProcesses = [];
  }
  saveConfig(config);
  return getHistory();
}

function isDebuggerEnabled() {
  const config = loadConfig();
  return !!config.debuggerEnabled;
}

function setDebuggerEnabled(enabled) {
  const config = loadConfig();
  config.debuggerEnabled = !!enabled;
  saveConfig(config);
  return config.debuggerEnabled;
}

// Modo de abertura escolhido (simples | integrada | doisMonitores). A disponibilidade de
// doisMonitores depende dos monitores e é decidida por open-mode.modoDisponivel, não aqui.
function getOpenMode() {
  return normalizarModo(loadConfig().modoAbertura);
}

function setOpenMode(modo) {
  const config = loadConfig();
  config.modoAbertura = normalizarModo(modo);
  saveConfig(config);
  return config.modoAbertura;
}

// Toggle "Coluna Copilot": independente do modo de abertura.
function getColunaCopilot() {
  return loadConfig().colunaCopilot === true;
}

function setColunaCopilot(ligada) {
  const config = loadConfig();
  config.colunaCopilot = ligada === true;
  saveConfig(config);
  return config.colunaCopilot;
}

// Toggle "Relacionados sob mesma aba" (pilha de processos relacionados). Ligado por padrão.
function getRelacionadosEmPilha() {
  return loadConfig().relacionadosEmPilha !== false;
}

function setRelacionadosEmPilha(ligado) {
  const config = loadConfig();
  config.relacionadosEmPilha = ligado !== false;
  saveConfig(config);
  return config.relacionadosEmPilha;
}

// Aviso da primeira vez que um processo relacionado é empilhado (explica por que não abriu aba própria).
function getAvisoRelacionadosVisto() {
  return loadConfig().avisoRelacionadosVisto === true;
}

function setAvisoRelacionadosVisto(visto) {
  const config = loadConfig();
  config.avisoRelacionadosVisto = visto === true;
  saveConfig(config);
  return config.avisoRelacionadosVisto;
}

// Percentuais de layout: coluna do Copilot (da largura da janela) e árvore/documentos (da área de conteúdo).
function getLayoutPrefs() {
  const config = loadConfig();
  return {
    copilotColunaPct: normalizarPct(config.copilotColunaPct, FAIXA_COPILOT),
    arvorePct: normalizarPct(config.arvorePct, FAIXA_ARVORE)
  };
}

// campo: 'copilot' | 'arvore'. Retorna os percentuais gravados (já limitados à faixa) ou null se o campo for inválido.
function setLayoutPct(campo, valor) {
  const config = loadConfig();
  if (campo === 'copilot') config.copilotColunaPct = normalizarPct(valor, FAIXA_COPILOT);
  else if (campo === 'arvore') config.arvorePct = normalizarPct(valor, FAIXA_ARVORE);
  else return null;
  saveConfig(config);
  return getLayoutPrefs();
}

// Atalho que anexa ao chat do Copilot o PDF aberto no leitor. null = sem atalho. Valida e devolve o gravado.
function getAtalhoColarPdf() {
  return require('./quick-shortcut-core').normalizarSalvo(loadConfig().atalhoColarPdfCopilot);
}

function setAtalhoColarPdf(atalho) {
  const valido = atalho ? require('./quick-shortcut-core').normalizarSalvo(atalho) : null;
  if (atalho && !valido) return null;
  const config = loadConfig();
  config.atalhoColarPdfCopilot = valido;
  saveConfig(config);
  return valido;
}

// Atalho do Fast Copilot no Editor. null = sem atalho. Valida e devolve o gravado.
function getAtalhoFastCopilot() {
  return require('./quick-shortcut-core').normalizarSalvo(loadConfig().atalhoFastCopilot);
}

function setAtalhoFastCopilot(atalho) {
  const valido = atalho ? require('./quick-shortcut-core').normalizarSalvo(atalho) : null;
  if (atalho && !valido) return null;
  const config = loadConfig();
  config.atalhoFastCopilot = valido;
  saveConfig(config);
  return valido;
}

// Atalho que anexa a minuta aberta ao chat do Copilot. null = sem atalho.
function getAtalhoMinutaCopilot() {
  return require('./quick-shortcut-core').normalizarSalvo(loadConfig().atalhoMinutaCopilot);
}

function setAtalhoMinutaCopilot(atalho) {
  const valido = atalho ? require('./quick-shortcut-core').normalizarSalvo(atalho) : null;
  if (atalho && !valido) return null;
  const config = loadConfig();
  config.atalhoMinutaCopilot = valido;
  saveConfig(config);
  return valido;
}

function getAtalhoAlteracaoTexto() {
  return require('./quick-shortcut-core').normalizarSalvo(loadConfig().atalhoAlteracaoTexto);
}

function setAtalhoAlteracaoTexto(atalho) {
  const valido = atalho ? require('./quick-shortcut-core').normalizarSalvo(atalho) : null;
  if (atalho && !valido) return null;
  const config = loadConfig();
  config.atalhoAlteracaoTexto = valido;
  saveConfig(config);
  return valido;
}

// ── Legislação local: itens do acesso rápido ligados a normas da biblioteca ──
// Item de norma: { id, nome, url: 'superproc-lei://norma/<slug>', norma: { urn, slug }, origemUrl?, atalho? }.
// Convive com links comuns (inclusive URLs restritas de tribunal) e com grupos.
function paraCadaItemLegislacao(lista, fn) {
  for (const item of Array.isArray(lista) ? lista : []) {
    if (item && item.tipo === 'grupo') paraCadaItemLegislacao(item.itens, fn);
    else if (item) fn(item);
  }
}

/** URNs das normas que já estão no acesso rápido (em qualquer grupo). */
function normasFixadas() {
  const urns = new Set();
  paraCadaItemLegislacao(loadConfig().legislacao, it => { if (it.norma && it.norma.urn) urns.add(it.norma.urn); });
  return urns;
}

/** Todos os links da categoria (grupos achatados), com id, nome, url e vínculo de norma. */
function listarLinks(category = 'legislacao') {
  const saida = [];
  paraCadaItemLegislacao(loadConfig()[normalizeCategory(category)], it => saida.push({ id: it.id, nome: it.nome, url: it.url, norma: it.norma || null }));
  return saida;
}

/** Acrescenta uma norma ao fim do acesso rápido da Legislação; não duplica a mesma URN. */
function adicionarNorma({ nome, url, norma }) {
  if (!norma || typeof norma.urn !== 'string' || typeof norma.slug !== 'string' || !/^[a-z0-9-]+$/.test(norma.slug)) throw Error('Norma inválida.');
  const config = loadConfig();
  let existente = null;
  paraCadaItemLegislacao(config.legislacao, it => { if (!existente && it.norma && it.norma.urn === norma.urn) existente = it; });
  if (existente) return { config, item: existente, existente: true };
  const item = { id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6), nome: String(nome || norma.slug).slice(0, 200), url, norma: { urn: norma.urn, slug: norma.slug } };
  if (!Array.isArray(config.legislacao)) config.legislacao = [];
  config.legislacao.push(item);
  config.leis = config.legislacao;
  saveConfig(config);
  return { config, item, existente: false };
}

/** Troca um link comum por uma norma da biblioteca local, guardando a URL original em `origemUrl`. */
function converterParaNorma(id, { url, norma, origemUrl }) {
  const config = loadConfig();
  let achou = false;
  paraCadaItemLegislacao(config.legislacao, it => {
    if (it.id !== id) return;
    it.url = url; it.norma = { urn: norma.urn, slug: norma.slug };
    if (origemUrl) it.origemUrl = origemUrl;
    achou = true;
  });
  if (achou) { config.leis = config.legislacao; saveConfig(config); }
  return { config, achou };
}


module.exports = {
  flush,
  isDebuggerEnabled,
  setDebuggerEnabled,
  normasFixadas,
  listarLinks,
  adicionarNorma,
  converterParaNorma,
  getOpenMode,
  setOpenMode,
  getColunaCopilot,
  setColunaCopilot,
  getRelacionadosEmPilha,
  setRelacionadosEmPilha,
  getAvisoRelacionadosVisto,
  setAvisoRelacionadosVisto,
  getLayoutPrefs,
  setLayoutPct,
  getAtalhoColarPdf,
  setAtalhoColarPdf,
  getAtalhoFastCopilot,
  getAtalhoMinutaCopilot,
  setAtalhoMinutaCopilot,
  getAtalhoAlteracaoTexto,
  setAtalhoAlteracaoTexto,
  setAtalhoFastCopilot,
  loadConfig,
  saveConfig,
  saveAllCategories,
  normalizeCategory,
  addLink,
  removeLink,
  updateLink,
  setCategoryLinks,
  moveLink,
  getCategoryWidth,
  saveCategoryWidth,
  getItemKey,
  getItemWidth,
  saveItemWidth,
  getWindowState,
  saveWindowState,
  getDownloadsConfig,
  setDownloadsConfig,
  getRecentDownloads,
  addRecentDownload,
  clearRecentDownloads,
  getHistory,
  addUrlHistory,
  getSignedHistoryUrl,
  addProcessHistory,
  setProcessParties,
  removeHistoryItem,
  clearHistory,
  DEFAULT_CONFIG
};


