'use strict';
// Sessão Microsoft no perfil: decide se a coluna Web do Copilot pode pular a tela de entrada local (entrada-web.html) e abrir
// direto o site do Copilot. Olha só a EXISTÊNCIA e a validade dos cookies de login do Entra ID (login.microsoftonline.com);
// nunca lê, devolve ou registra o valor de um cookie. Se o cookie existir mas a Microsoft não o aceitar mais, o próprio site
// pede o login — o mesmo que aconteceria ao clicar em "Continuar para a Microsoft".

const URL_LOGIN = 'https://login.microsoftonline.com/';
// ESTSAUTHPERSISTENT: "manter conectado" (sobrevive ao fechamento). ESTSAUTH: sessão do navegador (vale enquanto o perfil a mantiver).
const NOMES_SESSAO = Object.freeze(['ESTSAUTHPERSISTENT', 'ESTSAUTH']);

async function temSessaoMicrosoft(sessao, { agora = () => Date.now() / 1000 } = {}) {
  if (!sessao || !sessao.cookies || typeof sessao.cookies.get !== 'function') return false;
  let lista;
  try { lista = await sessao.cookies.get({ url: URL_LOGIN }); } catch (_) { return false; }
  return (Array.isArray(lista) ? lista : []).some((c) => c && NOMES_SESSAO.includes(c.name) && typeof c.value === 'string' && c.value.length > 0
    && (c.session === true || typeof c.expirationDate !== 'number' || c.expirationDate > agora()));
}

// Resolve a URL inicial da coluna: com sessão, o site do Copilot; sem sessão (ou falha/demora na consulta), a tela de entrada.
async function urlInicialDaColuna({ sessao, urlEntrada, urlCopilot, limiteMs = 1500, log = () => {} }) {
  let timer;
  const prazo = new Promise((r) => { timer = setTimeout(() => r(null), limiteMs); if (timer.unref) timer.unref(); });
  const tem = await Promise.race([temSessaoMicrosoft(sessao).catch(() => false), prazo]).finally(() => clearTimeout(timer));
  log(tem === null ? 'consulta da sessão Microsoft demorou: tela de entrada' : tem ? 'sessão Microsoft encontrada: direto ao Copilot' : 'sem sessão Microsoft: tela de entrada');
  return tem ? urlCopilot : urlEntrada;
}

module.exports = { URL_LOGIN, NOMES_SESSAO, temSessaoMicrosoft, urlInicialDaColuna };
