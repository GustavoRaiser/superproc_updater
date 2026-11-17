'use strict';
// Integração opcional com a API beta de chat do Microsoft 365 Copilot.
// O token e o cache MSAL ficam apenas no processo principal e em memória.
const SCOPES = Object.freeze(['Sites.Read.All', 'Mail.Read', 'People.Read.All', 'OnlineMeetingTranscript.Read.All', 'Chat.Read', 'ChannelMessage.Read.All', 'ExternalItem.Read.All']);
const GRAPH = 'https://graph.microsoft.com/beta/copilot/conversations';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const falha = codigo => Object.assign(Error(codigo), { codigo });

function criarGraph({ clientId, tenant, abrirBrowser, fetchImpl = globalThis.fetch, msal = require('@azure/msal-node') }) {
  if (!GUID.test(clientId || '') || !(GUID.test(tenant || '') || TENANT.test(tenant || ''))) throw falha('CONFIGURACAO_ENTRA_INVALIDA');
  if (typeof abrirBrowser !== 'function' || typeof fetchImpl !== 'function') throw falha('CONFIGURACAO_ENTRA_INVALIDA');
  const pca = new msal.PublicClientApplication({ auth: { clientId, authority: `https://login.microsoftonline.com/${tenant}` } });
  let conta = null, conversa = null, ocupado = false, entradaEmAndamento = false, geracao = 0;
  const account = {
    async obterEstado() { return { status: conta ? 'autenticada' : 'sem-sessao' }; },
    async entrar() {
      if (entradaEmAndamento) throw falha('LOGIN_EM_ANDAMENTO');
      entradaEmAndamento = true;
      const minhaGeracao = geracao;
      try {
        const resultado = await pca.acquireTokenInteractive({ scopes: SCOPES, openBrowser: abrirBrowser });
        if (!resultado?.account || !resultado?.accessToken) throw falha('LOGIN_INCOMPLETO');
        if (minhaGeracao !== geracao) { await pca.getTokenCache().removeAccount(resultado.account); throw falha('LOGIN_CANCELADO'); }
        const anterior = conta;
        conta = resultado.account;
        conversa = null;
        if (anterior && anterior.homeAccountId !== conta.homeAccountId) await pca.getTokenCache().removeAccount(anterior);
        return { status: 'autenticada' };
      } catch (e) { throw falha(e?.codigo || 'LOGIN_MICROSOFT_FALHOU'); }
      finally { entradaEmAndamento = false; }
    }
  };
  // A API verifica licença e permissões na chamada; não afirmar licença apenas por login.
  const eligibility = { async avaliar() { return { estado: 'suportada' }; } };
  async function token() {
    if (!conta) throw falha('LOGIN_NECESSARIO');
    try { const r = await pca.acquireTokenSilent({ scopes: SCOPES, account: conta }); if (!r?.accessToken) throw Error(); return r.accessToken; }
    catch (_) { throw falha('LOGIN_NECESSARIO'); }
  }
  async function post(url, body) {
    let response;
    try { response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { if (e?.codigo) throw e; throw falha('FALHA_CONEXAO_GRAPH'); }
    if (!response.ok) {
      if (response.status === 401) throw falha('LOGIN_NECESSARIO');
      if (response.status === 403) throw falha('LICENCA_OU_PERMISSAO_NEGADA');
      if (response.status === 429) throw falha('LIMITE_GRAPH');
      throw falha('ERRO_GRAPH');
    }
    try { return await response.json(); } catch (_) { throw falha('RESPOSTA_GRAPH_INVALIDA'); }
  }
  async function enviar(texto, contexto) {
    if (ocupado) throw falha('PEDIDO_EM_ANDAMENTO');
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 20000 || (contexto != null && (typeof contexto !== 'string' || contexto.length > 50000))) throw falha('PEDIDO_INVALIDO');
    ocupado = true;
    try {
      if (!conversa) {
        const r = await post(GRAPH, {});
        if (typeof r.id !== 'string' || !GUID.test(r.id)) throw falha('RESPOSTA_GRAPH_INVALIDA');
        conversa = r.id;
      }
      const corpo = { message: { text: texto }, locationHint: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' } };
      if (contexto) corpo.additionalContext = [{ text: contexto }];
      const resposta = await post(`${GRAPH}/${conversa}/chat`, corpo);
      const mensagens = Array.isArray(resposta.messages) ? resposta.messages : [];
      const ultima = mensagens.filter(m => typeof m?.text === 'string').at(-1);
      if (!ultima) throw falha('RESPOSTA_GRAPH_INVALIDA');
      return { texto: ultima.text, attributions: Array.isArray(ultima.attributions) ? ultima.attributions : [], sensitivityLabel: ultima.sensitivityLabel || null };
    } finally { ocupado = false; }
  }
  async function encerrar() { geracao++; const anterior = conta; conta = null; conversa = null; if (anterior) await pca.getTokenCache().removeAccount(anterior); }
  return { account, eligibility, enviar, encerrar };
}
module.exports = { criarGraph, SCOPES };
