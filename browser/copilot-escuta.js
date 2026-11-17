'use strict';
// Modo de escuta da coluna do Copilot (teste de bancada, 27/10/2026). DESLIGADO por padrão.
// Liga com o argumento --copilot-escuta ou com o arquivo vazio <perfil v2>/copilot-escuta.ligar.
//
// Pergunta que responde: a página do Copilot, rodando no SuperPROC (que se identifica como Chrome, nunca como
// Edge), tenta conversar com o navegador como faz no Edge (postMessage com eventName, pontes chrome.runtime /
// chrome.webview / _udsShellConfig)?
//
// Regras: só OBSERVA. Não responde mensagens, não altera nem intercepta funções da página, não muda a
// identificação do navegador. Registra só METADADOS (nomes de eventos e de chaves, origem, tipo de fonte e
// "typeof" de globais), nunca valores, texto de conversa, conteúdo de processo, cookies ou tokens.
// Saída: <perfil v2>/copilot-escuta.jsonl (somente acréscimo; gira para .1 ao passar de 2 MB).
// Dependências injetadas para testar sem Electron.

const ARQUIVO_FLAG = 'copilot-escuta.ligar';
const ARQUIVO_LOG = 'copilot-escuta.jsonl';
const ARG = '--copilot-escuta';
const MUNDO = 1090;                 // mundo isolado próprio (1001 Super, 1071/1072 Fast Copilot)
const MAX_BYTES = 2 * 1024 * 1024;
const NOME_OK = /^[A-Za-z0-9._:\/@#$-]{1,80}$/;

function estaLigada({ argv = [], existe = () => false, caminhoFlag = '' } = {}) {
  return (Array.isArray(argv) && argv.includes(ARG)) || (!!caminhoFlag && !!existe(caminhoFlag));
}

// Só nomes "de protocolo" passam; qualquer outra coisa vira <omitido> (evita gravar texto livre).
function nomeSeguro(v) {
  if (v === undefined) return undefined;
  return typeof v === 'string' && NOME_OK.test(v) ? v : '<omitido>';
}

function origemSegura(o) {
  if (!o || o === 'null') return o === 'null' ? 'null' : '(vazia)';
  try { const u = new URL(o); return u.protocol + '//' + u.host; } catch { return '<invalida>'; }
}

// Código do mundo isolado (topo da coluna). Escuta 'message' e guarda resumos numa fila drenável.
// O resumo é feito aqui dentro: valores nunca saem da página, só nomes e tipos.
const CODIGO_INSTALAR = `(() => {
  if (window.__spEscuta) return 'ja';
  const OK = ${NOME_OK.toString()};
  const nome = v => v === undefined ? undefined : (typeof v === 'string' && OK.test(v) ? v : '<omitido>');
  const CAMPOS = ['eventName','type','action','method','api','name','command','event','messageType','channel','kind','topic'];
  const resumo = (d, prof) => {
    if (d === null) return { tipo: 'null' };
    let tipo = Array.isArray(d) ? 'array' : typeof d;
    if (tipo === 'string') {
      const s = d.trim();
      if (prof === 0 && s.length < 200000 && (s[0] === '{' || s[0] === '[')) {
        try { const r = resumo(JSON.parse(s), 1); r.tipo = 'json-' + r.tipo; return r; } catch (_) {}
      }
      return { tipo: 'string', tam: d.length };
    }
    if (tipo !== 'object' && tipo !== 'array') return { tipo };
    const r = { tipo, chaves: Object.keys(d).slice(0, 15).map(nome) };
    for (const k of CAMPOS) if (typeof d[k] === 'string') r[k] = nome(d[k]);
    if (d.args && typeof d.args === 'object') r.chavesArgs = Object.keys(d.args).slice(0, 15).map(nome);
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) r.chavesData = Object.keys(d.data).slice(0, 15).map(nome);
    return r;
  };
  const fila = []; const MAX = 500; let perdidos = 0;
  window.addEventListener('message', ev => {
    let fonte = 'outra';
    try {
      if (ev.source === window) fonte = 'propria-janela';
      else if (!ev.source) fonte = 'nula';
      else if (ev.source.parent === window) fonte = 'iframe-filho';
    } catch (_) { fonte = 'inacessivel'; }
    let dado; try { dado = resumo(ev.data, 0); } catch (_) { dado = { tipo: 'ilegivel' }; }
    if (fila.length < MAX) fila.push({ t: Date.now(), origem: ev.origin || '', fonte, portas: ev.ports ? ev.ports.length : 0, dado });
    else perdidos++;
  }, true);
  window.__spEscuta = { coletar: () => { const r = { itens: fila.splice(0), perdidos }; perdidos = 0; return JSON.stringify(r); } };
  return 'ok';
})()`;

// Sonda de leitura no mundo principal de cada frame: só typeof / 'in' (não chama nada, não altera nada).
const CODIGO_SONDA = `(() => {
  const c = window.chrome;
  const t = (f) => { try { return typeof f(); } catch (_) { return 'erro'; } };
  let marcas = [];
  try { marcas = ((navigator.userAgentData && navigator.userAgentData.brands) || []).map(b => String(b.brand) + '/' + String(b.version)).slice(0, 6); } catch (_) {}
  return JSON.stringify({
    chrome: typeof c,
    runtime: t(() => c.runtime), runtimeConnect: t(() => c.runtime.connect), runtimeSendMessage: t(() => c.runtime.sendMessage),
    webview: t(() => c.webview), webviewPostMessage: t(() => c.webview.postMessage),
    udsShellConfig: '_udsShellConfig' in window, external: typeof window.external,
    topo: window.top === window, uaEdg: /Edg\\//.test(navigator.userAgent), uaChrome: /Chrome\\//.test(navigator.userAgent),
    uaElectron: /Electron\\//.test(navigator.userAgent), marcas
  });
})()`;

function assinatura(item) {
  const d = item.dado || {};
  return [item.origem, item.fonte, d.tipo, d.eventName || d.type || d.action || d.method || d.api || d.name || '', (d.chaves || []).join(',')].join('|');
}

// Saneia o que veio da página (não se confia no mundo isolado como fonte de formato).
function sanearItem(item) {
  if (!item || typeof item !== 'object') return null;
  const d = item.dado && typeof item.dado === 'object' ? item.dado : {};
  const lista = v => Array.isArray(v) ? v.slice(0, 15).map(nomeSeguro) : undefined;
  const out = {
    t: Number.isFinite(item.t) ? item.t : Date.now(),
    origem: origemSegura(item.origem),
    fonte: nomeSeguro(item.fonte),
    portas: Number.isFinite(item.portas) ? Math.min(item.portas, 99) : 0,
    dado: { tipo: nomeSeguro(d.tipo), tam: Number.isFinite(d.tam) ? d.tam : undefined, chaves: lista(d.chaves), chavesArgs: lista(d.chavesArgs), chavesData: lista(d.chavesData) }
  };
  for (const k of ['eventName', 'type', 'action', 'method', 'api', 'name', 'command', 'event', 'messageType', 'channel', 'kind', 'topic']) {
    if (d[k] !== undefined) out.dado[k] = nomeSeguro(d[k]);
  }
  return out;
}

function sanearSonda(s) {
  if (!s || typeof s !== 'object') return null;
  const tipos = ['chrome', 'runtime', 'runtimeConnect', 'runtimeSendMessage', 'webview', 'webviewPostMessage', 'external'];
  const out = {};
  for (const k of tipos) out[k] = nomeSeguro(s[k]);
  for (const k of ['udsShellConfig', 'topo', 'uaEdg', 'uaChrome', 'uaElectron']) out[k] = s[k] === true;
  out.marcas = Array.isArray(s.marcas) ? s.marcas.slice(0, 6).map(m => String(m).slice(0, 60)) : [];
  return out;
}

function criarEscuta({ ligada, getView, gravar, log = () => {}, agendar = setInterval, cancelar = clearInterval, intervaloMs = 3000, agora = () => Date.now() }) {
  if (!ligada) return { ligada: false, parar() {}, ciclo: async () => {}, resumo: () => null };
  let wcAtual = null;
  let timer = null;
  const vistas = new Map();          // assinatura -> contagem
  const sondasVistas = new Set();
  let sondasAgendadas = [];

  const registrar = (tipo, dados) => { try { gravar(JSON.stringify({ quando: new Date(agora()).toISOString(), tipo, ...dados }) + '\n'); } catch (_) {} };

  async function instalar(wc) {
    try { await wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: CODIGO_INSTALAR }]); }
    catch (e) { registrar('erro', { etapa: 'instalar', msg: String(e && e.message || e).slice(0, 200) }); }
  }

  async function sondar(wc, momento) {
    let frames = [];
    try { frames = wc.mainFrame ? [wc.mainFrame, ...(wc.mainFrame.framesInSubtree || []).filter(f => f !== wc.mainFrame)] : []; } catch (_) {}
    for (const f of frames.slice(0, 20)) {
      let origem = '';
      try { origem = origemSegura(f.origin || f.url); } catch (_) {}
      let sonda = null;
      try { sonda = sanearSonda(JSON.parse(await f.executeJavaScript(CODIGO_SONDA))); } catch (e) { sonda = { erro: String(e && e.message || e).slice(0, 120) }; }
      const chave = origem + '|' + JSON.stringify(sonda);
      if (sondasVistas.has(chave)) continue;   // só registra mudanças
      sondasVistas.add(chave);
      registrar('sonda', { momento, frameTopo: f === wc.mainFrame, origem, sonda });
    }
  }

  function prender(wc) {
    wcAtual = wc;
    registrar('inicio', { msg: 'escuta ligada na coluna do Copilot (somente observação)' });
    log('COPILOT_ESCUTA', 'Modo de escuta ligado na coluna do Copilot');
    const aoCarregar = () => {
      instalar(wc);
      sondasAgendadas.forEach(t => clearTimeout(t));
      sondasAgendadas = [0, 10000, 60000].map(ms => setTimeout(() => { if (!wc.isDestroyed()) sondar(wc, ms === 0 ? 'carga' : ms / 1000 + 's'); }, ms));
      registrar('navegacao', { origem: origemSegura(wc.getURL()) });
    };
    wc.on('dom-ready', aoCarregar);
    if (!wc.isLoading || !wc.isLoading()) aoCarregar();
  }

  async function coletar(wc) {
    let bruto = null;
    try { bruto = await wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: 'window.__spEscuta ? window.__spEscuta.coletar() : null' }]); }
    catch (_) { return; }
    if (typeof bruto !== 'string') return;
    let pacote; try { pacote = JSON.parse(bruto); } catch (_) { return; }
    if (pacote.perdidos) registrar('perdidos', { quantidade: Math.min(Number(pacote.perdidos) || 0, 1e6) });
    for (const cru of Array.isArray(pacote.itens) ? pacote.itens : []) {
      const item = sanearItem(cru);
      if (!item) continue;
      const a = assinatura(item);
      const n = (vistas.get(a) || 0) + 1;
      vistas.set(a, n);
      // 1ª ocorrência completa; depois só potências de 10 (evita inundar com mensagens repetidas)
      if (n === 1 || /^10*$/.test(String(n))) registrar('mensagem', { ocorrencia: n, ...item });
    }
  }

  async function ciclo() {
    const view = getView();
    const wc = view && view.webContents && !view.webContents.isDestroyed() ? view.webContents : null;
    if (!wc) return;
    if (wc !== wcAtual) prender(wc);
    await coletar(wc);
  }

  timer = agendar(() => { ciclo().catch(() => {}); }, intervaloMs);
  if (timer && timer.unref) timer.unref();

  function resumo() { return [...vistas.entries()].map(([assinatura, contagem]) => ({ assinatura, contagem })); }
  function parar() { if (timer) cancelar(timer); timer = null; sondasAgendadas.forEach(t => clearTimeout(t)); registrar('fim', { resumo: resumo() }); }

  return { ligada: true, ciclo, parar, resumo };
}

// Gravador somente-acréscimo com giro simples.
function criarGravador({ fs, caminho }) {
  return (linha) => {
    try { if (fs.statSync(caminho).size > MAX_BYTES) { fs.rmSync(caminho + '.1', { force: true }); fs.renameSync(caminho, caminho + '.1'); } } catch (_) {}
    fs.appendFileSync(caminho, linha, 'utf8');
  };
}

// Passo 1 do dossiê: lê (sem alterar) os cabeçalhos de enquadramento da resposta do Copilot, para decidir D6 com dados.
// Usa onResponseStarted (somente leitura); onHeadersReceived já pertence ao main.js. Grava só nomes e diretivas de enquadramento.
const URLS_COPILOT = ['*://copilot.cloud.microsoft/*', '*://copilot.microsoft.com/*'];
function resumirCabecalhos(details) {
  const h = details && details.responseHeaders || {};
  const pega = nome => { const k = Object.keys(h).find(x => x.toLowerCase() === nome); const v = k ? h[k] : null; return Array.isArray(v) ? v.join('; ') : (v == null ? null : String(v)); };
  const csp = pega('content-security-policy');
  const m = csp && /frame-ancestors\s+([^;]*)/i.exec(csp);
  return {
    origem: origemSegura(details.url),
    recurso: String(details.resourceType || '').slice(0, 20),
    xFrameOptions: nomeSeguro(pega('x-frame-options') || ''),
    frameAncestors: m ? m[1].trim().slice(0, 300) : null,
    coop: nomeSeguro(pega('cross-origin-opener-policy') || ''),
    coep: nomeSeguro(pega('cross-origin-embedder-policy') || '')
  };
}
function observarCabecalhos(ses, gravar, agora = () => Date.now()) {
  if (!ses || !ses.webRequest) return;
  ses.webRequest.onResponseStarted({ urls: URLS_COPILOT }, details => {
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return;
    try { gravar(JSON.stringify({ quando: new Date(agora()).toISOString(), tipo: 'cabecalhos', ...resumirCabecalhos(details) }) + '\n'); } catch (_) {}
  });
}

module.exports = { observarCabecalhos, resumirCabecalhos, ARQUIVO_FLAG, ARQUIVO_LOG, ARG, MUNDO, estaLigada, nomeSeguro, origemSegura, sanearItem, sanearSonda, assinatura, criarEscuta, criarGravador, CODIGO_INSTALAR, CODIGO_SONDA };
