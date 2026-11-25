'use strict';
// Liga o AdminBroker e as ferramentas nativas da ponte (busca/realce, histórico, link externo, MCP local) ao app. Camada: host.
// Sem Electron: o main.js injeta as operações do navegador (`operacoes`), o registro de abas, o configManager e as caixas de diálogo.
//
// Interruptores (TODOS desligados por padrão) no arquivo copilot-admin.json do perfil, relidos a cada uso (vale sem reiniciar):
//   { "leitura": false, "organizacao": false, "destrutiva": false, "contexto": false, "historico": false, "linkExterno": false, "mcp": false, "pipe": false, "captura": false, "agentico": false }
// - leitura: listar abas/histórico/acesso rápido; contexto: ler o texto de uma aba (além de leitura); organizacao: abrir, trocar,
//   recarregar, voltar, avançar; destrutiva: fechar aba, apagar histórico (e a pessoa confirma CADA vez);
// - historico: a API searchHistory do Copilot Chat; linkExterno: openLinkInExternalBrowser; mcp: anuncia o servidor MCP local;
//   agentico: o Copilot pode pedir as ações do modo agêntico que o SuperPROC executa (navegar, voltar/avançar, rolar), pelo AdminBroker e
//   sob as mesmas políticas e confirmações (só vale se o serviço da conta as oferecer);
//   captura: imagem da aba ativa para o Copilot Chat (Edge.Chat.Screenshot);
//   pipe: abre o pipe nomeado local para o harness de linha de comando (só lido ao iniciar o app).
// Arquivo ausente, ilegível ou com valor diferente de true = desligado.
const fs = require('node:fs');
const path = require('node:path');
const { criarAdminBroker } = require('../admin-broker');

const ARQUIVO_POLITICA = 'copilot-admin.json';
// EXPERIMENTAIS (quadro "EXPERIMENTAL" em CFG → Configurações → Copilot no SuperPROC): quadros = registrador passivo dos quadros do chat
// (copilot-shell/quadros-chat.js, só metadados); modoDesenvolvedor = abre a página do Copilot com developerMode=Basic.
// DECISÃO DO RESPONSÁVEL (2026-11-24): vêm LIGADAS. Num copilot-admin.json antigo, que não tem estas chaves, a ausência vale LIGADO
// (as demais chaves continuam: ausente = desligado). Valor false gravado pela pessoa é respeitado.
const CHAVES_EXPERIMENTAIS = Object.freeze(['quadros', 'modoDesenvolvedor']);
const CHAVES = Object.freeze(['leitura', 'organizacao', 'destrutiva', 'contexto', 'historico', 'linkExterno', 'mcp', 'pipe', 'captura', 'agentico', ...CHAVES_EXPERIMENTAIS]);
const valorDaChave = (j, k) => (CHAVES_EXPERIMENTAIS.includes(k) && j[k] === undefined ? true : j[k] === true);

// Política criada na primeira abertura quando o arquivo não existe (nunca sobrescreve). DECISÃO DO RESPONSÁVEL (2026-11-21, confirmada
// na migração para a v2_electron): tudo ligado, igual ao clone; as ações destrutivas seguem perguntando a cada vez.
// Quem apagar o perfil (CFG → limpar) recebe de novo este arquivo.
const POLITICA_INICIAL = Object.freeze(Object.fromEntries(CHAVES.map((k) => [k, true])));

function garantirArquivoDePolitica(pasta, { inicial = POLITICA_INICIAL, escrever = (p, c) => fs.writeFileSync(p, c, { encoding: 'utf8', flag: 'wx' }) } = {}) {
  try { fs.mkdirSync(pasta, { recursive: true }); } catch (_) { /* a escrita abaixo diz se falhou */ }
  const arquivo = path.join(pasta, ARQUIVO_POLITICA);
  try { escrever(arquivo, JSON.stringify(inicial, null, 2) + '\n'); return { criado: true, arquivo }; }
  catch (_) { return { criado: false, arquivo }; } // já existe (flag wx) ou sem permissão: segue com o que houver
}

// Lê a política direto do disco (sem cache) e grava UMA chave por vez, preservando as demais (CFG → Copilot). Só chaves conhecidas e booleanos.
function lerPoliticaDoDisco(pasta, lerArquivo) { return criarLeitorDePolitica({ pasta, lerArquivo, validadeMs: 0 })(); }
function gravarChaveDePolitica(pasta, chave, valor, { lerArquivo = (p) => fs.readFileSync(p, 'utf8'), escrever = (p, c) => { fs.writeFileSync(p + '.tmp', c, 'utf8'); fs.renameSync(p + '.tmp', p); } } = {}) {
  if (!CHAVES.includes(chave) || typeof valor !== 'boolean') throw Error('Política inválida.');
  const arquivo = path.join(pasta, ARQUIVO_POLITICA);
  let atual = { ...POLITICA_INICIAL };
  try { const j = JSON.parse(lerArquivo(arquivo)); if (j && typeof j === 'object' && !Array.isArray(j)) atual = { ...Object.fromEntries(CHAVES.map((k) => [k, false])), ...Object.fromEntries(CHAVES.map((k) => [k, valorDaChave(j, k)])) }; } catch (_) { /* sem arquivo legível: parte do padrão */ }
  atual[chave] = valor;
  fs.mkdirSync(pasta, { recursive: true });
  escrever(arquivo, JSON.stringify(atual, null, 2) + '\n');
  return atual;
}

function criarLeitorDePolitica({ pasta, lerArquivo = (p) => fs.readFileSync(p, 'utf8'), agora = Date.now, validadeMs = 2000 }) {
  let cache = null; let ate = 0;
  return () => {
    const t = agora();
    if (cache && t < ate) return cache;
    const pol = Object.fromEntries(CHAVES.map((k) => [k, false]));
    try {
      const j = JSON.parse(lerArquivo(path.join(pasta, ARQUIVO_POLITICA)));
      if (j && typeof j === 'object') for (const k of CHAVES) pol[k] = valorDaChave(j, k);
    } catch (_) { /* sem arquivo: tudo desligado */ }
    cache = Object.freeze(pol); ate = t + validadeMs;
    return cache;
  };
}

// Realce nativo do Chromium (findInPage) numa aba: true se o texto foi achado e marcado. Prazo curto; nunca lança.
function realcarEmWebContents(wc, texto, { prazoMs = 2500 } = {}) {
  return new Promise((resolve) => {
    if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) return resolve(false);
    let feito = false; let timer = null;
    const fim = (v) => { if (feito) return; feito = true; clearTimeout(timer); try { wc.removeListener('found-in-page', aoAchar); } catch (_) { /* aba fechou */ } resolve(v); };
    const aoAchar = (_e, r) => { if (r && r.finalUpdate) fim((r.matches || 0) > 0); };
    timer = setTimeout(() => fim(false), prazoMs);
    wc.on('found-in-page', aoAchar);
    try { wc.findInPage(String(texto), { findNext: false }); } catch (_) { fim(false); }
  });
}
function limparRealceEmWebContents(wc) {
  try { if (wc && !wc.isDestroyed()) wc.stopFindInPage('clearSelection'); } catch (_) { /* sem busca ativa */ }
}

// Imagem da área visível da aba em PNG base64 (largura máxima 1600 px); null se a aba não puder ser capturada.
async function capturarWebContents(wc, { larguraMax = 1600 } = {}) {
  try {
    if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) return null;
    let img = await wc.capturePage();
    if (!img || (typeof img.isEmpty === 'function' && img.isEmpty())) return null;
    const { width } = img.getSize();
    if (width > larguraMax) img = img.resize({ width: larguraMax });
    return img.toPNG().toString('base64');
  } catch (_) { return null; }
}

function criarFerramentasHost({ politicasIA = null, pasta, registry, contextBroker, operacoes, configManager, abrirNoSistema, perguntar, log = () => {}, lerArquivo, agora }) {
  const politica = criarLeitorDePolitica({ pasta, lerArquivo, agora });
  const aba = (idOpaco) => { const e = registry.resolver(idOpaco); return e && !e._catalogo ? e._aba : null; }; // item do painel: sem trocar/recarregar/fechar

  const host = {
    listarAbas: async () => (await contextBroker.listTabs()).map((a) => ({ id: a.id, title: a.title, url: a.url, active: !!a.active, groupId: a.groupId || null, role: a.role || null })),
    novaAba: async (url) => { operacoes.criarAba(url); },
    trocarAba: async (id) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); operacoes.trocar(a); },
    recarregar: async (id) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); operacoes.recarregar(a); },
    voltar: async (id) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); return operacoes.voltar(a) === true; },
    politicasIA: async (args) => { const POL = require('./politicas-ia'); return POL.consultar(POL.resolver(politicasIA && politicasIA.valores ? politicasIA.valores() : null), args); },
    rolar: async (id, posicao) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); return operacoes.rolar(a, posicao) === true; },
    avancar: async (id) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); return operacoes.avancar(a) === true; },
    fecharAba: async (id) => { const a = aba(id); if (!a) throw Object.assign(new Error('NOT_FOUND'), { codigo: 'NOT_FOUND' }); operacoes.fechar(a); },
    buscarHistorico: async (consulta, maximo) => {
      const q = String(consulta).toLowerCase();
      const saida = [];
      for (const it of (configManager.getHistory().urls || [])) {
        if (!it || typeof it.url !== 'string' || !/^https?:\/\//i.test(it.url)) continue;
        if (!(`${it.title || ''} ${it.url}`.toLowerCase().includes(q))) continue;
        let u; try { u = new URL(it.url); } catch { continue; }
        saida.push({ id: it.id, title: String(it.title || '').slice(0, 300), url: u.origin + u.pathname, timestamp: it.timestamp });
        if (saida.length >= maximo) break;
      }
      return saida;
    },
    removerHistorico: async (id) => { configManager.removeHistoryItem('urls', id); },
    limparHistorico: async () => { configManager.clearHistory('urls'); },
    listarAcessoRapido: async () => ((configManager.loadConfig().ferramentas) || []).filter((x) => x && typeof x === 'object').slice(0, 100).map((x) => ({ id: String(x.id || '').slice(0, 64), name: String(x.nome || x.name || '').slice(0, 120) }))
  };

  const admin = criarAdminBroker({
    host, contexto: contextBroker,
    politica: Object.fromEntries(['leitura', 'organizacao', 'destrutiva', 'contexto'].map((k) => [k, () => politica()[k]])),
    confirmar: (p) => perguntar({ detalhe: p.detalhe }), registrar: (l) => { try { log('COPILOT_ADMIN', l); } catch (_) { /* log nunca derruba */ } }
  });

  const ferramentas = {
    admin,
    mcp: { permitido: () => politica().mcp },
    historico: { permitido: () => politica().historico, listar: async () => (configManager.getHistory().urls || []).filter((x) => x && typeof x.url === 'string' && Number.isFinite(x.timestamp)).map((x) => ({ url: x.url, title: x.title, timestamp: x.timestamp })) },
    captura: { permitido: () => politica().captura, tirar: async (idOpaco) => { const a = aba(idOpaco); return a && typeof operacoes.capturar === 'function' ? operacoes.capturar(a) : null; } },
    agentico: { permitido: () => politica().agentico },
    externo: { permitido: () => politica().linkExterno, abrir: async (url) => abrirNoSistema(url) },
    paginas: {
      // Realce nativo do Chromium na própria aba (findInPage); devolve true se o texto foi achado e marcado.
      realcar: async (idOpaco, texto) => { const a = aba(idOpaco); return a ? operacoes.realcar(a, texto) : false; },
      limpar: async (idOpaco) => { const a = aba(idOpaco); if (a) operacoes.limparRealce(a); }
    }
  };
  return { admin, ferramentas, politica };
}

module.exports = { CHAVES_EXPERIMENTAIS, capturarWebContents, lerPoliticaDoDisco, gravarChaveDePolitica, POLITICA_INICIAL, garantirArquivoDePolitica, realcarEmWebContents, limparRealceEmWebContents, ARQUIVO_POLITICA, CHAVES, criarLeitorDePolitica, criarFerramentasHost };
