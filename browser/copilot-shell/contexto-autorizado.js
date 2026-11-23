'use strict';
// Implementação de `browserContext` sobre o ContextBroker existente. Camada: host (processo principal).
//  - Cada pedido de lista de abas ou de leitura passa por autorização própria (sem concessão "nesta sessão").
//  - Leitura só de uma aba escolhida explicitamente por id opaco; nunca "todas as abas" nem "aba ativa" implícita.
//  - A aba é revalidada depois da autorização e o conteúdo é descartado se a página navegou.
//  - Limites de tamanho, de frequência e de pedidos simultâneos; erros estruturados {ok:false, erro:{codigo, retentavel}}.
//  - Logs: somente códigos e contagens. Nunca título, endereço, texto, credenciais ou ids de aba.
const { erro } = require('./contratos');
const { ehIdOpaco, enderecoSeguro } = require('../context/validadores');

const LIMITES = Object.freeze({
  // 2026-11-21: teto e padrão seguem o teto central do ContextBroker (antes 20 mil / 50 mil).
  maxCaracteresPadrao: require('../context/tipos').LIMITES.maxCaracteres,
  maxCaracteresTeto: require('../context/tipos').LIMITES.maxCaracteres,
  maxAbasListadas: 100,
  maxTitulo: 200,
  pedidosPorMinuto: 10
});

const recorte = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');

function criarContextoAutorizado({ broker, perguntar, canalValido, contextoPermitido = () => true, limites = {}, agora = Date.now, log = () => {} }) {
  if (!broker || typeof broker.listTabs !== 'function' || typeof broker.readTab !== 'function') throw Error('ContextBroker inválido');
  if (typeof perguntar !== 'function') throw Error('Função de autorização ausente');
  const L = { ...LIMITES, ...limites };
  const reg = (m) => { try { log('COPILOT_SHELL_CONTEXTO', m); } catch (_) { /* log nunca derruba a leitura */ } };
  let pendente = false;
  const janela = [];
  const canalAutorizado = (canal) => typeof canalValido === 'function' && canalValido(canal);

  function consultarPolitica({ canal } = {}) {
    if (!canalAutorizado(canal)) return erro('CANAL_NAO_AUTORIZADO');
    return { ok: true, permitido: contextoPermitido() === true, exigeConsentimento: true };
  }

  const dentroDoLimite = () => {
    const t = agora();
    while (janela.length && t - janela[0] >= 60000) janela.shift();
    if (janela.length >= L.pedidosPorMinuto) return false;
    janela.push(t);
    return true;
  };

  // Executa a sequência de um pedido: canal → frequência → autorização (uma por vez) → ação. Sempre retorna estrutura.
  async function pedido(nome, canal, preparar, executar) {
    const verificarPolitica = () => {
      const politica = consultarPolitica({ canal });
      if (!politica.ok) return politica;
      return politica.permitido ? null : erro('CONTEXTO_DESATIVADO');
    };
    const bloqueio = verificarPolitica();
    if (bloqueio) return bloqueio;
    if (pendente) { reg(nome + ': PEDIDO_EM_ANDAMENTO'); return erro('PEDIDO_EM_ANDAMENTO', true); }
    pendente = true;
    try {
      // Pedido malformado é recusado antes de contar na frequência: só pedidos que chegam ao usuário consomem a cota.
      const prep = await preparar();
      if (prep.erro) { reg(nome + ': ' + prep.erro.codigo); return { ok: false, erro: prep.erro }; }
      const antesDoConsentimento = verificarPolitica();
      if (antesDoConsentimento) return antesDoConsentimento;
      if (!dentroDoLimite()) { reg(nome + ': LIMITE_DE_PEDIDOS'); return erro('LIMITE_DE_PEDIDOS', true); }
      let resposta;
      try { resposta = await perguntar({ finalidade: nome, ...(prep.exibir || {}) }); } catch (_) { resposta = 'negar'; }
      if (resposta !== 'permitir') { reg(nome + ': CONSENTIMENTO_NEGADO'); return erro('CONSENTIMENTO_NEGADO'); }
      const antesDaLeitura = verificarPolitica();
      if (antesDaLeitura) return antesDaLeitura;
      const resultado = await executar(prep);
      return verificarPolitica() || resultado;
    } catch (e) {
      const codigo = e && typeof e.codigo === 'string' ? e.codigo : 'EXTRACTION_FAILED';
      reg(nome + ': ' + codigo);
      return erro(codigo, codigo === 'CONTENT_EXTRACTION_TIMEOUT');
    } finally { pendente = false; }
  }

  async function listarAbas({ canal } = {}) {
    return pedido('abas', canal, async () => ({}), async () => {
      const abas = await broker.listTabs();
      const saida = abas.slice(0, L.maxAbasListadas).map((a) => ({ id: a.id, tipo: a.type, titulo: recorte(a.title, L.maxTitulo), url: a.url, origem: a.origin, ativa: !!a.active, legivel: !!a.readable }));
      reg('abas: ok (' + saida.length + ')');
      return { ok: true, abas: saida };
    });
  }

  async function lerAba({ canal, tabId, maxCaracteres } = {}) {
    return pedido('corpo', canal, async () => {
      if (!ehIdOpaco(tabId)) return { erro: { codigo: 'INVALID_REQUEST', retentavel: false } };
      const alvo = (await broker.listTabs()).find((a) => a.id === tabId);
      if (!alvo) return { erro: { codigo: 'TAB_NOT_FOUND', retentavel: false } };
      if (!alvo.readable) return { erro: { codigo: 'UNSUPPORTED_BROWSER_PAGE', retentavel: false } };
      const documento = broker.getDocumentIdentity?.(tabId);
      return { alvo, documento, exibir: { titulo: recorte(alvo.title, L.maxTitulo), origem: alvo.origin } };
    }, async ({ alvo, documento }) => {
      // A aba pode ter navegado enquanto o usuário decidia: só vale a página que foi mostrada no pedido de autorização.
      const atual = (await broker.listTabs()).find((a) => a.id === tabId);
      if (!atual) return erro('TAB_NOT_FOUND');
      if (atual.url !== alvo.url || atual.origin !== alvo.origin) { reg('corpo: TAB_CHANGED'); return erro('TAB_CHANGED', true); }
      const max = Number.isSafeInteger(maxCaracteres) ? Math.min(Math.max(maxCaracteres, 1), L.maxCaracteresTeto) : L.maxCaracteresPadrao;
      const ctx = await broker.readTab(tabId, { maxCharacters: max, ...(documento === undefined ? {} : { documento }) });
      if (!ctx || ctx.url !== alvo.url || ctx.origin !== alvo.origin) { reg('corpo: TAB_CHANGED'); return erro('TAB_CHANGED', true); }
      const texto = recorte(ctx.content && ctx.content.visibleText, max);
      const selecionado = recorte(ctx.content && ctx.content.selectedText, max);
      const truncado = !!ctx.truncated || (ctx.content && ctx.content.visibleText ? ctx.content.visibleText.length > max : false);
      reg('corpo: ok (' + texto.length + ' caracteres' + (truncado ? ', truncado' : '') + ')');
      return { ok: true, aba: { id: ctx.tabId, tipo: ctx.type, titulo: recorte(ctx.title, L.maxTitulo), url: enderecoSeguro(ctx.url), origem: ctx.origin }, texto, textoSelecionado: selecionado, truncado, capturadoEm: ctx.capturedAt };
    });
  }

  return { consultarPolitica, listarAbas, lerAba };
}

module.exports = { LIMITES, criarContextoAutorizado };
