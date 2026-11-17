'use strict';
// Anfitrião do shell da coluna do Copilot (processo principal). Compõe a máquina de estados, os provedores e o
// browserContext autorizado, e valida o remetente das ações vindas da página local do shell.
// Opt-in e reversível: --copilot-shell (indisponível, sem integração documentada) ou --copilot-shell-sintetico[=cenário]
// para a demonstração com provedores sintéticos; ou o arquivo <perfil>/copilot-shell.ligar. Apagar o arquivo / omitir o
// argumento restaura a coluna habitual. Não modifica cabeçalhos, origens nem identidade; não carrega conteúdo remoto.
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { criarMaquina } = require('./maquina');
const { criarContextoAutorizado } = require('./contexto-autorizado');
const P = require('./provedores-sinteticos');
const { ACOES, erro } = require('./contratos');

const ARG = '--copilot-shell';
const ARG_GRAPH = '--copilot-graph';
const ARG_SINTETICO = '--copilot-shell-sintetico';
const ARQUIVO_FLAG = 'copilot-shell.ligar';
const ARQUIVO_HTML = path.join(__dirname, 'shell.html');
const PRELOAD = path.join(__dirname, 'shell-preload.js');
const CANAIS = Object.freeze({ estado: 'copilot-shell-estado', acao: 'copilot-shell-acao', demo: 'copilot-shell-consumidor', mudou: 'copilot-shell-mudou' });

// { ligado, sintetico, cenario }. Cenário só vale no modo sintético e só da lista fixa.
function configuracao({ argv = [], existe = () => false, caminhoFlag = '' } = {}) {
  const sint = argv.find((a) => a === ARG_SINTETICO || a.startsWith(ARG_SINTETICO + '='));
  if (sint) {
    const c = sint.includes('=') ? sint.split('=')[1] : 'acesso';
    return { ligado: true, sintetico: true, cenario: P.CENARIOS.includes(c) ? c : 'acesso' };
  }
  if (argv.includes(ARG_GRAPH)) return { ligado: true, sintetico: false, cenario: null, graph: true };
  const ligado = argv.includes(ARG) || !!(caminhoFlag && existe(caminhoFlag));
  return { ligado, sintetico: false, cenario: null };
}

const urlDaPagina = () => pathToFileURL(ARQUIVO_HTML).href;
// A página do shell é identificada pelo arquivo local exato, sem consulta nem fragmento.
function origemAceita(url) {
  try { const u = new URL(url); u.search = ''; u.hash = ''; return u.href === urlDaPagina(); } catch (_) { return false; }
}

function criarShell({ broker, perguntar, sintetico = false, cenario = 'acesso', graph = null, graphPendente = false, usarHabitual = () => false, prazoMs = 10000, limites, agora, log = () => {}, gerarCanal }) {
  let canalVigente = null;
  const canalValido = (c) => {
    if (typeof c !== 'string' || !canalVigente || c.length !== canalVigente.length) return false;
    return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(canalVigente));
  };
  const browserContext = criarContextoAutorizado({ broker, perguntar, canalValido, limites, agora, log });

  const consumidorBase = P.criarConsumidorSintetico({ gerarCanal });
  const consumer = {
    estado: () => consumidorBase.estado(),
    montar: (ctx) => consumidorBase.montar(ctx),
    desmontar: async () => { canalVigente = null; return consumidorBase.desmontar(); }
  };
  const account = graph ? graph.account : sintetico ? P.criarContaSintetica({ cenario }) : P.criarContaNaoConfigurada();
  const eligibility = graph ? graph.eligibility : sintetico ? P.criarElegibilidadeSintetica({ cenario }) : P.criarElegibilidadeIndisponivel();

  const maquina = criarMaquina({
    account, eligibility, consumer, prazoMs, log,
    montarContexto: () => ({ browserContext, registrarCanal: (c) => { canalVigente = c; } })
  });

  const publico = () => ({ ...maquina.estado(), sintetico, cenario: sintetico ? cenario : null, ...(graph || graphPendente ? { graph: true, graphConfigurado: !!graph } : {}) });

  async function acao(nome) {
    if (!ACOES.includes(nome)) return erro('ACAO_INVALIDA');
    if (!maquina.estado().acoes.includes(nome)) return erro('ACAO_INVALIDA');
    if (nome === 'entrar') return maquina.entrar();
    if (nome === 'tentar-novamente') return maquina.tentarNovamente();
    let ok = false;
    try { ok = !!(await usarHabitual()); } catch (_) { ok = false; }
    return ok ? { ok: true } : erro('COLUNA_HABITUAL_INDISPONIVEL');
  }

  // Demonstração do consumidor sintético, acionada pelo usuário na página do shell.
  async function demo(pedidoBruto) {
    if (maquina.estado().estado !== 'pronto' || consumer.estado() !== 'montado') return erro('ESTADO_INVALIDO');
    const p = pedidoBruto && typeof pedidoBruto === 'object' ? pedidoBruto : {};
    if (graph && p.tipo === 'reconectar') {
      try { await graph.account.entrar(); return { ok: true }; }
      catch (e) { return erro(e?.codigo || 'LOGIN_MICROSOFT_FALHOU', true); }
    }
    if (p.tipo === 'listar') return consumidorBase.listarAbas();
    if (p.tipo === 'ler') return consumidorBase.lerAba(p.tabId, p.maxCaracteres);
    if (graph && p.tipo === 'enviar') {
      if (typeof p.texto !== 'string' || !p.texto.trim() || p.texto.length > 20000) return erro('PEDIDO_INVALIDO');
      let contexto;
      if (p.tabId) {
        const leitura = await consumidorBase.lerAba(p.tabId);
        if (!leitura.ok) return leitura;
        contexto = leitura.texto;
      }
      try { return { ok: true, ...(await graph.enviar(p.texto, contexto)) }; }
      catch (e) { return erro(e?.codigo || 'ERRO_GRAPH', true); }
    }
    return erro('INVALID_REQUEST');
  }

  return { iniciar: () => maquina.iniciar(), encerrar: async () => { await maquina.encerrar(); if (graph) await graph.encerrar(); }, estado: publico, aoMudar: (f) => maquina.aoMudar(() => f(publico())), acao, demo, canalValido, browserContext, _consumidor: consumidorBase };
}

module.exports = { ARG, ARG_GRAPH, ARG_SINTETICO, ARQUIVO_FLAG, ARQUIVO_HTML, PRELOAD, CANAIS, configuracao, urlDaPagina, origemAceita, criarShell };
