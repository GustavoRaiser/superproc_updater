'use strict';
// Limpezas do perfil (%APPDATA%\superproc-browser-v2). Com o app aberto os arquivos estão em uso, então o pedido só grava um
// marcador (fora do perfil), o app reinicia, e a exclusão acontece na abertura seguinte, antes de qualquer coisa ser carregada.
//  - 'tudo':         apaga todo o conteúdo (estado de primeira abertura).
//  - 'preferencias': reseta preferências e dados em geral, mantendo logins (cookies, armazenamento dos sites, conta Microsoft),
//                    as extensões instaladas (com os módulos importados), os scripts externos e a biblioteca de leis.
//                    Os dados das extensões (bancos e armazenamento) são apagados.
//  - 'extensoes':    elimina as extensões (código, módulos importados, scripts externos e todo o armazenamento delas).
const fs = require('node:fs');
const path = require('node:path');

const NOME_PERFIL = 'superproc-browser-v2';
const NOME_MARCADOR = 'superproc-browser-v2.limpar-tudo';
const MODO_TUDO = 'tudo';
const MODO_PREFERENCIAS = 'preferencias';
const MODO_EXTENSOES = 'extensoes';
const MODOS = [MODO_TUDO, MODO_PREFERENCIAS, MODO_EXTENSOES];
const ARQUIVO_CONFIG = 'superproc-config.json';

// Caminhos relativos ao perfil (minúsculos, separador "/"). "Local State" guarda a chave (os_crypt) que decifra os cookies.
const MANTER_PREFERENCIAS = [
  'network/cookies', 'network/cookies-journal', 'local state',        // logins (cookies)
  'local storage', 'session storage', 'indexeddb',                    // logins que ficam no armazenamento dos sites
  'conta-microsoft.bin',                                              // login da conta Microsoft
  'extensoes-atualizadas', 'cofre-scripts.json',                      // extensões instaladas, módulos importados e scripts externos
  'legislacao'                                                        // biblioteca de leis
];
// Tudo o que pertence às extensões (nomes na raiz do perfil, em minúsculas).
const APAGAR_EXTENSOES = [
  'extensoes-atualizadas', 'cofre-scripts.json', 'local extension settings', 'sync extension settings',
  'extension state', 'extension rules', 'extension scripts', 'managed extension settings'
];

function marcador(appData) { return path.join(appData, NOME_MARCADOR); }

// Só o perfil real do app pode ser apagado: pasta exatamente <appData>/superproc-browser-v2, nunca outra.
function perfilValido(appData, perfil) {
  return path.resolve(perfil) === path.resolve(appData, NOME_PERFIL);
}

// extra.semente (modo 'preferencias'): campos de configuração a regravar após a limpeza (ex.: quais extensões estão ligadas).
function solicitar(appData, modo = MODO_TUDO, extra = {}) {
  fs.writeFileSync(marcador(appData), JSON.stringify({ modo: MODOS.includes(modo) ? modo : MODO_TUDO, ...extra }));
}

function lerPedido(arq) {
  try {
    const texto = fs.readFileSync(arq, 'utf8').trim();
    try {
      const j = JSON.parse(texto);
      if (j && typeof j === 'object') return { modo: MODOS.includes(j.modo) ? j.modo : MODO_TUDO, semente: j.semente && typeof j.semente === 'object' ? j.semente : null };
    } catch { /* formato antigo: só o nome do modo */ }
    return { modo: MODOS.includes(texto) ? texto : MODO_TUDO, semente: null };
  } catch { return { modo: MODO_TUDO, semente: null }; }
}

function esperar(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* sem espera */ } }

function remover(alvo) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try { fs.rmSync(alvo, { recursive: true, force: true }); return true; }
    catch { esperar(200); }
  }
  return !fs.existsSync(alvo);
}

// Apaga o CONTEÚDO da pasta (ela fica), poupando os caminhos de `manter`. Itens ainda bloqueados (ex.: lockfile do
// próprio Chromium) são ignorados e devolvidos em `restantes`.
function apagarConteudo(pasta, manter = [], base = '') {
  const restantes = [];
  for (const nome of fs.readdirSync(pasta)) {
    const alvo = path.join(pasta, nome);
    const rel = (base ? base + '/' : '') + nome.toLowerCase();
    if (manter.includes(rel)) continue;
    if (manter.some(m => m.startsWith(rel + '/'))) {
      let ehPasta = false;
      try { ehPasta = fs.lstatSync(alvo).isDirectory(); } catch { /* some */ }
      if (ehPasta) { restantes.push(...apagarConteudo(alvo, manter, rel).map(r => nome + '/' + r)); continue; }
    }
    if (!remover(alvo) && fs.existsSync(alvo)) restantes.push(nome);
  }
  return restantes;
}

// Apaga só os itens da raiz do perfil cujo nome (minúsculo) está em `nomes`.
function apagarSomente(pasta, nomes) {
  const restantes = [];
  for (const nome of fs.readdirSync(pasta)) {
    if (!nomes.includes(nome.toLowerCase())) continue;
    if (!remover(path.join(pasta, nome))) restantes.push(nome);
  }
  return restantes;
}

// Bancos IndexedDB das próprias extensões (origens chrome-extension://). Os dos sites ficam, por causa dos logins.
function apagarBancosDeExtensoes(perfil) {
  const restantes = [];
  const dir = path.join(perfil, 'IndexedDB');
  if (!fs.existsSync(dir)) return restantes;
  for (const nome of fs.readdirSync(dir)) {
    if (nome.toLowerCase().startsWith('chrome-extension_') && !remover(path.join(dir, nome))) restantes.push('IndexedDB/' + nome);
  }
  return restantes;
}

// Chamada na abertura, logo após obter a instância única. Devolve { executado, restantes, modo }.
function executarSePendente(appData, perfil) {
  const arq = marcador(appData);
  if (!fs.existsSync(arq)) return { executado: false, restantes: [] };
  if (!perfilValido(appData, perfil)) { fs.rmSync(arq, { force: true }); return { executado: false, restantes: [], recusado: true }; }
  const { modo, semente } = lerPedido(arq);
  let restantes = [];
  try {
    if (fs.existsSync(perfil)) {
      if (modo === MODO_EXTENSOES) {
        restantes = [...apagarSomente(perfil, APAGAR_EXTENSOES), ...apagarBancosDeExtensoes(perfil)];
      } else if (modo === MODO_PREFERENCIAS) {
        restantes = [...apagarConteudo(perfil, MANTER_PREFERENCIAS), ...apagarBancosDeExtensoes(perfil)];
        if (semente) { try { fs.writeFileSync(path.join(perfil, ARQUIVO_CONFIG), JSON.stringify(semente, null, 2)); } catch { /* usa os padrões */ } }
      } else {
        restantes = apagarConteudo(perfil, []);
      }
    }
  } finally { fs.rmSync(arq, { force: true }); }
  return { executado: true, restantes, modo };
}

module.exports = {
  solicitar, executarSePendente, perfilValido, marcador, apagarConteudo, apagarSomente, apagarBancosDeExtensoes,
  NOME_PERFIL, MODO_TUDO, MODO_PREFERENCIAS, MODO_EXTENSOES, MANTER_PREFERENCIAS, APAGAR_EXTENSOES
};
