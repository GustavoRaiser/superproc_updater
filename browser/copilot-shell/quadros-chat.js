'use strict';
// Registrador passivo dos quadros do chat do Copilot (EXPERIMENTAL). Camada: host (processo principal).
// Chave `quadros` do copilot-admin.json (CFG → Configurações → Copilot no SuperPROC → EXPERIMENTAL), ligada por padrão.
//
// Pergunta que responde: o que o app do Copilot troca com o servidor pelo WebSocket do chat? Em particular: as chamadas de
// ferramenta locais (FluxEdgeContextualPlugin…, fetch_browser_content) passam pelos mesmos quadros `{"type":2` que o toolkit do
// Microsoft 365 lê (separador \x1e, item.messages[], messageType, contentOrigin)? Quais ferramentas e plugins o serviço escolhe?
//
// Regras: só OBSERVA, pelo depurador interno do Electron (webContents.debugger; nenhuma porta de rede é aberta). Não envia, não
// responde, não altera quadro algum. Grava só METADADOS: tipo do quadro, nomes de protocolo, chaves, tamanhos, contagens e NOMES de
// ferramentas/plugins. Nunca grava `text`, argumentos, parâmetros, respostas de ferramenta, texto de conversa, conteúdo de aba ou
// de processo, cookies, tokens nem endereços com consulta (só o host do WebSocket).
// Convive com o Redator (redator-coluna.js), que também usa o depurador da coluna: reaproveita um anexo já existente, nunca solta o
// dele, e religa a captura de rede a cada ciclo (o Redator desliga a rede ao fim de cada pedido).
// Saída: <perfil v2>/copilot-quadros.jsonl (somente acréscimo; gira para .1 ao passar de 2 MB).
// Dependências injetadas para testar sem Electron.

const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO_LOG = 'copilot-quadros.jsonl';
const MAX_BYTES = 2 * 1024 * 1024;
const SEPARADOR = '\x1e';
const NOME_PROTOCOLO = /^[A-Za-z0-9._:\/@#$-]{1,80}$/;
const NOME_FERRAMENTA = /^[\p{L}\p{N} ._:\/@#$()\-]{1,80}$/u; // nomes de exibição podem ter espaço e acento
const MAX_REGISTROS_POR_MINUTO = 600;
const MAX_MENSAGENS = 40;
const MAX_NOMES = 40;

function nomeProtocolo(v) { return typeof v === 'string' && NOME_PROTOCOLO.test(v) ? v : undefined; }
function nomeFerramenta(v) { return typeof v === 'string' && NOME_FERRAMENTA.test(v) ? v : undefined; }
function chavesSeguras(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
  return Object.keys(o).map(nomeProtocolo).filter(Boolean).slice(0, 30);
}
const unicos = (lista) => [...new Set(lista.filter(Boolean))].slice(0, MAX_NOMES);

// Do JSON do log do desenvolvedor (mensagem DeveloperLogs): só nomes e códigos numéricos de status.
function resumirLogDoDesenvolvedor(texto) {
  let j; try { j = JSON.parse(texto); } catch (_) { return { legivel: false }; }
  if (!j || typeof j !== 'object') return { legivel: false };
  const info = (j.pluginDeveloperInfo && typeof j.pluginDeveloperInfo === 'object') ? j.pluginDeveloperInfo : {};
  const lista = (a, b) => (Array.isArray(a) ? a : (Array.isArray(b) ? b : []));
  const plugins = lista(j.enabledPlugins, info.enabledPlugins);
  const candidatas = lista(j.matchedFunctionCandidates, info.matchedFunctionCandidates);
  const escolhidas = lista(j.functionsSelectedForInvocation, info.functionsSelectedForInvocation);
  const execucoes = lista(j.functionExecutions, info.functionExecutions);
  const caps = j.capabilitiesDeveloperInfo && typeof j.capabilitiesDeveloperInfo === 'object' ? j.capabilitiesDeveloperInfo : {};
  const nomeFn = (f) => nomeFerramenta(f && f.functionDisplayName);
  return {
    legivel: true,
    plugins: unicos(plugins.map((p) => nomeFerramenta(p && p.name))),
    candidatas: unicos(candidatas.map(nomeFn)),
    escolhidas: unicos(escolhidas.map(nomeFn)),
    execucoes: execucoes.slice(0, MAX_NOMES).map((x) => ({
      funcao: nomeFn(x && x.function),
      metodo: nomeProtocolo(x && x.requestMethod),
      requisicao: x && Number.isFinite(x.executionStatus && x.executionStatus.requestStatus) ? x.executionStatus.requestStatus : undefined,
      resposta: x && Number.isFinite(x.executionStatus && x.executionStatus.responseStatus) ? x.executionStatus.responseStatus : undefined,
      comErro: !!(x && x.errorMessage)
    })),
    capacidades: unicos(lista(caps.enabledCapabilities, []).map((c) => nomeFerramenta(c && c.capabilityName))),
    chaves: chavesSeguras(j)
  };
}

// Resume UM objeto SignalR já convertido de JSON. Nunca devolve valores de texto.
function resumirObjeto(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { forma: 'nao-objeto' };
  const saida = { tipo: Number.isInteger(o.type) ? o.type : undefined };
  const alvo = nomeProtocolo(o.target); if (alvo) saida.alvo = alvo;
  if (Array.isArray(o.arguments)) saida.nArgumentos = o.arguments.length;
  const corpo = (o.item && typeof o.item === 'object') ? o.item
    : (Array.isArray(o.arguments) && o.arguments[0] && typeof o.arguments[0] === 'object' ? o.arguments[0] : null);
  if (corpo) saida.chavesDoCorpo = chavesSeguras(corpo);
  const mensagens = corpo && Array.isArray(corpo.messages) ? corpo.messages.slice(0, MAX_MENSAGENS) : [];
  if (mensagens.length) {
    saida.mensagens = mensagens.map((m) => {
      if (!m || typeof m !== 'object') return { forma: 'nao-objeto' };
      const r = { messageType: nomeProtocolo(m.messageType), contentOrigin: nomeProtocolo(m.contentOrigin), chaves: chavesSeguras(m) };
      if (typeof m.text === 'string') r.tamanhoTexto = m.text.length;
      const invocacao = nomeProtocolo(m.invocation) || nomeProtocolo(m.toolName) || nomeProtocolo(m.functionName);
      if (invocacao) r.invocacao = invocacao;
      if (m.messageType === 'DeveloperLogs' && typeof m.text === 'string') r.logDoDesenvolvedor = resumirLogDoDesenvolvedor(m.text);
      return r;
    });
  }
  return saida;
}

// Quadro bruto (payloadData) -> lista de resumos. SignalR junta vários objetos por quadro, separados por \x1e.
function resumirQuadro(payload) {
  if (typeof payload !== 'string') return [{ forma: 'sem-texto' }];
  const partes = payload.split(SEPARADOR).filter((p) => p.length > 0);
  if (!partes.length) return [{ forma: 'vazio' }];
  return partes.slice(0, 20).map((p) => {
    let o; try { o = JSON.parse(p); } catch (_) { return { forma: 'nao-json', tamanho: p.length }; }
    return resumirObjeto(o);
  });
}

// Só o host do WebSocket: caminho e consulta podem levar identificadores de conversa e de sessão.
function hostDoSocket(url) {
  try { const u = new URL(url); return (u.protocol === 'wss:' || u.protocol === 'ws:') ? u.hostname.toLowerCase() : undefined; } catch (_) { return undefined; }
}

// Página do Copilot que aceita o parâmetro do modo desenvolvedor. Só https e hosts *.cloud.microsoft; nunca mexe em login.
function urlComModoDesenvolvedor(url, ligado) {
  if (!ligado || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !(u.hostname === 'cloud.microsoft' || u.hostname.endsWith('.cloud.microsoft'))) return url;
    if (u.searchParams.has('developerMode')) return url;
    u.searchParams.set('developerMode', 'Basic');
    return u.toString();
  } catch (_) { return url; }
}

function criarGravador({ caminho, fsmod = fs }) {
  return (linha) => {
    try { if (fsmod.statSync(caminho).size > MAX_BYTES) { fsmod.rmSync(caminho + '.1', { force: true }); fsmod.renameSync(caminho, caminho + '.1'); } } catch (_) { /* arquivo ainda não existe */ }
    fsmod.appendFileSync(caminho, linha, 'utf8');
  };
}

function criarRegistradorQuadros({ getColunaWc, politica, pasta = '', gravar = null, agora = Date.now, intervaloMs = 5000, agendar = setInterval, cancelar = clearInterval, log = () => {} }) {
  const escrever = gravar || criarGravador({ caminho: path.join(pasta, ARQUIVO_LOG) });
  let alvo = null; let dbg = null; let ouvinte = null; let aoDesanexar = null; let anexadoAqui = false; let timer = null;
  let janelaInicio = 0; let naJanela = 0; let perdidos = 0; let falhaAvisada = false; let total = 0;

  function registrar(tipo, dados) {
    const t = agora();
    if (t - janelaInicio >= 60000) { janelaInicio = t; naJanela = 0; }
    if (naJanela >= MAX_REGISTROS_POR_MINUTO) { perdidos++; return false; }
    naJanela++; total++;
    try { escrever(JSON.stringify({ t: new Date(t).toISOString(), tipo, ...dados }) + '\n'); return true; } catch (_) { return false; }
  }

  function aoMensagem(_e, metodo, params) {
    if (!params) return;
    if (metodo === 'Network.webSocketCreated') { registrar('ws-criado', { host: hostDoSocket(params.url) }); return; }
    if (metodo !== 'Network.webSocketFrameReceived' && metodo !== 'Network.webSocketFrameSent') return;
    const r = params.response;
    if (!r || typeof r.payloadData !== 'string') return;
    const sentido = metodo === 'Network.webSocketFrameSent' ? 'env' : 'rec';
    const resumos = resumirQuadro(r.payloadData);
    // Quadros só de batimento (type 6) e vazios não dizem nada: não gastam a cota.
    if (resumos.every((x) => x.tipo === 6 || x.forma === 'vazio')) return;
    registrar('quadro', { sentido, opcode: Number.isInteger(r.opcode) ? r.opcode : undefined, tamanho: r.payloadData.length, objetos: resumos });
  }

  function soltar() {
    if (dbg) {
      if (ouvinte) { try { dbg.removeListener('message', ouvinte); } catch (_) { /* já solto */ } }
      if (aoDesanexar) { try { dbg.removeListener('detach', aoDesanexar); } catch (_) { /* já solto */ } }
      if (anexadoAqui) { try { dbg.detach(); } catch (_) { /* já desanexado */ } }
    }
    alvo = null; dbg = null; ouvinte = null; aoDesanexar = null; anexadoAqui = false;
  }

  function prender(wc) {
    const d = wc.debugger; if (!d) return false;
    try {
      if (!d.isAttached()) { d.attach('1.3'); anexadoAqui = true; }
      ouvinte = aoMensagem;
      aoDesanexar = () => { anexadoAqui = false; alvo = null; dbg = null; ouvinte = null; aoDesanexar = null; };
      d.on('message', ouvinte); d.on('detach', aoDesanexar);
      alvo = wc; dbg = d;
      registrar('inicio', { origem: anexadoAqui ? 'anexo-proprio' : 'anexo-existente' });
      return true;
    } catch (e) {
      if (!falhaAvisada) { falhaAvisada = true; try { log('COPILOT_QUADROS', 'depurador indisponível na coluna (DevTools aberto?)'); } catch (_) { /* log nunca derruba */ } }
      try { if (anexadoAqui) d.detach(); } catch (_) { /* já solto */ }
      anexadoAqui = false; ouvinte = null; aoDesanexar = null;
      return false;
    }
  }

  // Um ciclo: segue a chave, a coluna e o anexo; religa a captura de rede (idempotente).
  async function sincronizar() {
    let ligado = false; try { ligado = politica() === true; } catch (_) { ligado = false; }
    if (!ligado) { if (alvo) { registrar('fim', { motivo: 'chave-desligada', registros: total, descartados: perdidos }); soltar(); } return { ativo: false }; }
    let wc = null; try { wc = getColunaWc(); } catch (_) { wc = null; }
    if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) { if (alvo) soltar(); return { ativo: false }; }
    if (alvo && alvo !== wc) soltar();
    if (!alvo && !prender(wc)) return { ativo: false };
    try { await dbg.sendCommand('Network.enable'); } catch (_) { /* a página pode estar navegando; o próximo ciclo tenta de novo */ }
    return { ativo: !!alvo };
  }

  function iniciar() {
    if (timer) return;
    timer = agendar(() => { sincronizar().catch(() => {}); }, intervaloMs);
    if (timer && timer.unref) timer.unref();
    sincronizar().catch(() => {});
  }
  function parar() {
    if (timer) { cancelar(timer); timer = null; }
    if (alvo) registrar('fim', { motivo: 'encerrado', registros: total, descartados: perdidos });
    soltar();
  }
  return { iniciar, parar, sincronizar, estado: () => ({ anexado: !!alvo, registros: total, descartados: perdidos }) };
}

module.exports = { ARQUIVO_LOG, MAX_REGISTROS_POR_MINUTO, nomeProtocolo, nomeFerramenta, resumirLogDoDesenvolvedor, resumirObjeto, resumirQuadro, hostDoSocket, urlComModoDesenvolvedor, criarGravador, criarRegistradorQuadros };
