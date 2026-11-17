'use strict';
// Conta Microsoft (Entra ID / MSA) do usuário, exibida no menu da engrenagem.
// Fluxo: Authorization Code + PKCE, navegador do sistema e redirecionamento loopback (http://localhost).
// Não usa segredo de cliente. O cache de tokens fica cifrado (safeStorage/DPAPI) no perfil v2; sem cifra
// disponível, o login vale só enquanto o app estiver aberto. Só o processo principal toca em tokens.
// O token MSAL NÃO autentica as abas web: elas têm cookies próprios.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_ID_PADRAO = '3e7a8030-c4d4-440d-b5b0-71aa184b02b6';
const AUTORIDADE_PADRAO = 'https://login.microsoftonline.com/common';
const TENANT_MSA = '9188040d-6c67-4c5b-b112-36a304b66dad';
const SCOPES = Object.freeze(['User.Read']); // openid, profile e offline_access o MSAL acrescenta
const GRAPH = 'https://graph.microsoft.com/v1.0';
const PRAZO_LOGIN_MS = 5 * 60 * 1000;
const PRAZO_REDE_MS = 15000;
const FOTO_MAX_BYTES = 512 * 1024;
const falha = codigo => Object.assign(Error(codigo), { codigo });

// Destinos padronizados do menu. O renderer só envia o id; a URL nunca vem da interface.
const DESTINOS = Object.freeze([
  { id: 'conta', rotulo: 'Gerenciar conta Microsoft', url: 'https://myaccount.microsoft.com/' },
  { id: 'm365', rotulo: 'Microsoft 365', url: 'https://m365.cloud.microsoft/' },
  { id: 'copilot', rotulo: 'Copilot', url: 'https://m365.cloud.microsoft/chat' },
  { id: 'outlook', rotulo: 'Outlook', url: 'https://outlook.office.com/mail/' },
  { id: 'onedrive', rotulo: 'OneDrive', url: 'https://www.office.com/launch/onedrive' },
  { id: 'teams', rotulo: 'Teams', url: 'https://teams.microsoft.com/' }
]);
const destinoPorId = id => DESTINOS.find(d => d.id === id) || null;

// Chave de liberação do login. Desligada por padrão enquanto o login tem limites técnicos (tenants que exigem aprovação
// de administrador para apps de editor não verificado). Para desenvolvimento: SUPERPROC_LOGIN_MS=1.
const loginAtivo = (env = process.env) => env.SUPERPROC_LOGIN_MS === '1';

const SUCESSO = '<!doctype html><meta charset="utf-8"><title>SuperPROC</title><body style="font-family:Segoe UI,sans-serif;text-align:center;margin-top:18vh"><h2>Login concluído</h2><p>Você já pode fechar esta aba e voltar ao SuperPROC.</p></body>';

// Licença exibida: heurística sobre /me/licenseDetails. Só afirma Copilot se algum plano de Copilot estiver provisionado.
function rotuloDeLicenca(detalhes) {
  const lista = Array.isArray(detalhes) ? detalhes : [];
  if (!lista.length) return '';
  const copilot = lista.some(l => /copilot/i.test(String(l?.skuPartNumber || '')) ||
    (Array.isArray(l?.servicePlans) && l.servicePlans.some(p => /copilot/i.test(String(p?.servicePlanName || '')) && p?.provisioningStatus === 'Success')));
  return copilot ? 'M365 Copilot (Premium)' : 'Microsoft 365';
}

function criarPluginCache({ arquivo, fs, cifra }) {
  if (!arquivo || !fs || !cifra || !cifra.disponivel()) return undefined;
  return {
    async beforeCacheAccess(ctx) {
      try { ctx.tokenCache.deserialize(cifra.decifrar(fs.readFileSync(arquivo))); } catch (_) { /* sem cache ainda ou ilegível: segue vazio */ }
    },
    async afterCacheAccess(ctx) {
      if (!ctx.cacheHasChanged) return;
      const tmp = arquivo + '.tmp';
      fs.writeFileSync(tmp, cifra.cifrar(ctx.tokenCache.serialize()));
      fs.renameSync(tmp, arquivo);
    }
  };
}

function criarContaMicrosoft({ clientId = CLIENT_ID_PADRAO, autoridade = AUTORIDADE_PADRAO, abrirBrowser, fetchImpl = globalThis.fetch,
  msal = require('@azure/msal-node'), arquivoCache = null, fs = require('node:fs'), cifra = null, agora = () => Date.now() } = {}) {
  if (!GUID.test(clientId || '') || !/^https:\/\/login\.microsoftonline\.com\/[A-Za-z0-9.-]+$/.test(autoridade || '')) throw falha('CONFIGURACAO_ENTRA_INVALIDA');
  if (typeof abrirBrowser !== 'function' || typeof fetchImpl !== 'function') throw falha('CONFIGURACAO_ENTRA_INVALIDA');
  const cachePlugin = criarPluginCache({ arquivo: arquivoCache, fs, cifra });
  const pca = new msal.PublicClientApplication({ auth: { clientId, authority: autoridade }, ...(cachePlugin ? { cache: { cachePlugin } } : {}) });
  let conta = null, perfil = { licenca: '', foto: '' }, entrando = false, ultimoErro = '';
  const ouvintes = new Set();
  const avisar = () => { for (const o of [...ouvintes]) { try { o(estado()); } catch (_) { /* ouvinte não derruba a conta */ } } };

  function estado() {
    if (entrando) return { status: 'entrando', nome: '', usuario: '', tipo: '', licenca: '', foto: '', erro: '' };
    if (!conta) return { status: 'sem-sessao', nome: '', usuario: '', tipo: '', licenca: '', foto: '', erro: ultimoErro };
    return {
      status: 'autenticada',
      nome: String(conta.name || conta.username || ''),
      usuario: String(conta.username || ''),
      tipo: conta.tenantId === TENANT_MSA ? 'Pessoal' : 'Trabalho',
      licenca: perfil.licenca, foto: perfil.foto, erro: ''
    };
  }

  async function tokenSilencioso() {
    if (!conta) throw falha('LOGIN_NECESSARIO');
    try { const r = await pca.acquireTokenSilent({ scopes: [...SCOPES], account: conta }); if (!r?.accessToken) throw Error(); return r.accessToken; }
    catch (_) { throw falha('LOGIN_NECESSARIO'); }
  }
  async function graph(caminho, token, binario) {
    const r = await fetchImpl(GRAPH + caminho, { redirect: 'error', signal: AbortSignal.timeout(PRAZO_REDE_MS), headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    return binario ? r : r.json();
  }
  // Licença e foto são complementos: a falha de qualquer um não derruba o login.
  async function atualizarPerfil() {
    if (!conta) return estado();
    const minha = conta.homeAccountId;
    let token;
    try { token = await tokenSilencioso(); } catch (_) { return estado(); }
    const [lic, foto] = await Promise.all([
      graph('/me/licenseDetails', token).catch(() => null),
      graph('/me/photo/$value', token, true).catch(() => null)
    ]);
    if (!conta || conta.homeAccountId !== minha) return estado(); // saiu ou trocou de conta durante a consulta
    let dataUrl = '';
    try {
      const tipo = foto && String(foto.headers?.get?.('content-type') || '');
      if (foto && /^image\/(jpeg|png|webp)$/i.test(tipo)) {
        const bytes = Buffer.from(await foto.arrayBuffer());
        if (bytes.length > 0 && bytes.length <= FOTO_MAX_BYTES) dataUrl = `data:${tipo.toLowerCase()};base64,${bytes.toString('base64')}`;
      }
    } catch (_) { dataUrl = ''; }
    perfil = { licenca: rotuloDeLicenca(lic?.value), foto: dataUrl };
    avisar();
    return estado();
  }

  async function restaurar() {
    try {
      const contas = await pca.getTokenCache().getAllAccounts();
      if (!contas.length) return estado();
      conta = contas[0];
      avisar();
      return await atualizarPerfil();
    } catch (_) { return estado(); }
  }

  async function entrar({ trocar = false } = {}) {
    if (entrando) throw falha('LOGIN_EM_ANDAMENTO');
    entrando = true; ultimoErro = ''; avisar();
    try {
      let relogio;
      const limite = new Promise((_, rej) => { relogio = setTimeout(() => rej(falha('LOGIN_TEMPO_ESGOTADO')), PRAZO_LOGIN_MS); relogio.unref?.(); });
      const r = await Promise.race([pca.acquireTokenInteractive({ scopes: [...SCOPES], openBrowser: abrirBrowser, successTemplate: SUCESSO, ...(trocar ? { prompt: 'select_account' } : {}) }), limite]).finally(() => clearTimeout(relogio));
      if (!r?.account || !r?.accessToken) throw falha('LOGIN_INCOMPLETO');
      const anterior = conta;
      conta = r.account; perfil = { licenca: '', foto: '' };
      if (anterior && anterior.homeAccountId !== conta.homeAccountId) { try { await pca.getTokenCache().removeAccount(anterior); } catch (_) { /* conta antiga fica no cache */ } }
    } catch (e) {
      ultimoErro = e?.codigo || 'LOGIN_MICROSOFT_FALHOU';
      throw falha(ultimoErro);
    } finally { entrando = false; avisar(); }
    atualizarPerfil().catch(() => {});
    return estado();
  }

  async function sair() {
    const anterior = conta;
    conta = null; perfil = { licenca: '', foto: '' }; ultimoErro = '';
    try { if (anterior) await pca.getTokenCache().removeAccount(anterior); } catch (_) { /* já fora da sessão local */ }
    avisar();
    return estado();
  }

  return { estado, entrar, sair, restaurar, atualizarPerfil, aoMudar: cb => { ouvintes.add(cb); return () => ouvintes.delete(cb); } };
}

module.exports = { criarContaMicrosoft, criarPluginCache, rotuloDeLicenca, destinoPorId, loginAtivo, DESTINOS, SCOPES, CLIENT_ID_PADRAO, TENANT_MSA };
