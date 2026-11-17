'use strict';
// Reabertura de itens do histórico com assinatura (hash) da sessão atual do eproc.
// O histórico persistido não guarda hash (v2-policy.durableUrl); aqui só há memória volátil.
const { durableUrl } = require('./v2-policy');
const { normalizarCnj } = require('./history-process');

const origemEproc = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && /^eproc[\w-]*\..*\.jus\.br$/i.test(u.hostname) ? u.origin : ''; } catch { return ''; }
};

// Capa = acao=processo_selecionar com número válido e sem acao_origem (que indica documento,
// minuta etc. dentro do processo).
function digitosDaCapa(value) {
  try {
    const u = new URL(value);
    if (u.searchParams.get('acao') !== 'processo_selecionar' || u.searchParams.has('acao_origem')) return '';
    return normalizarCnj(u.searchParams.get('num_processo'));
  } catch { return ''; }
}

// Links assinados vistos nesta execução, por sessão do Electron e origem. Nunca vai a disco.
class SignedLinkMemory {
  constructor({ max = 400 } = {}) { this.max = max; this.sessions = new WeakMap(); }
  state(session, origin, create = false) {
    let origins = this.sessions.get(session);
    if (!origins) { if (!create) return undefined; origins = new Map(); this.sessions.set(session, origins); }
    let links = origins.get(origin);
    if (!links && create) { links = new Map(); origins.set(origin, links); }
    return links;
  }
  remember(session, value) {
    const origin = origemEproc(value); if (!origin || !session) return false;
    let u; try { u = new URL(value); } catch { return false; }
    if (!u.pathname.endsWith('/controlador.php') || !u.searchParams.get('hash')) return false;
    const links = this.state(session, origin, true);
    const put = (key) => { links.delete(key); links.set(key, u.href); };
    put(durableUrl(u.href));
    const capa = digitosDaCapa(u.href); if (capa) put('capa|' + capa);
    while (links.size > this.max) links.delete(links.keys().next().value);
    return true;
  }
  get(session, value) {
    const origin = origemEproc(value); const links = origin && session ? this.state(session, origin) : null;
    return (links && links.get(durableUrl(value))) || '';
  }
  getCover(session, origin, digitos) { const links = session ? this.state(session, origin) : null; return (links && links.get('capa|' + digitos)) || ''; }
  invalidate(session, value) { const origin = origemEproc(value) || value; const origins = session && this.sessions.get(session); if (origins) origins.delete(origin); }
}

// Código executado na página do eproc: preenche e aciona a "Nº de processo" da barra superior, que
// devolve o link da capa já assinado pelo servidor. Retorna { ok, via } ou { ok:false, motivo }.
function quickSearchScript(numero) {
  const corpo = function (numero) {
    const visivel = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const rotulo = el => [el.placeholder, el.getAttribute('aria-label'), el.title, el.name, el.id].filter(Boolean).join(' ');
    const alvo = /n[º°o]?\.?\s*(?:de|do)\s*processo|pesquisa\s*r[aá]pida/i;
    const campos = Array.from(document.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="tel"]'))
      .filter(i => !i.disabled && !i.readOnly && visivel(i) && alvo.test(rotulo(i)))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const campo = campos[0];
    if (!campo) return { ok: false, motivo: 'campo-nao-encontrado' };
    campo.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, numero);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    const texto = el => [el.id, typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '', el.title, el.alt, el.getAttribute('aria-label'), (el.textContent || '').trim().slice(0, 20)].join(' ');
    // Botão de busca: só vizinho imediato do campo (mesmo formulário/contêiner e mesma linha); nunca
    // links de menu com destino próprio.
    const rc = campo.getBoundingClientRect();
    const vizinho = el => { const r = el.getBoundingClientRect(); return r.left > rc.left - 160 && r.right < rc.right + 160 && r.top < rc.bottom && r.bottom > rc.top; };
    const destinoProprio = el => { const a = el.closest('a[href]'); const h = a && a.getAttribute('href'); return !!h && h !== '#' && !/^javascript:/i.test(h); };
    let botao = null;
    for (let no = campo.form || campo.parentElement, nivel = 0; no && nivel < 2 && !botao; no = no.parentElement, nivel++) {
      botao = Array.from(no.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"], i, svg, img'))
        .find(el => el !== campo && visivel(el) && vizinho(el) && !destinoProprio(el) && /pesq|busc|search|lupa/i.test(texto(el)));
      if (campo.form) break;
    }
    if (botao) { (botao.closest('button, a, [role="button"]') || botao).click(); return { ok: true, via: 'botao' }; }
    if (campo.form && typeof campo.form.requestSubmit === 'function') { campo.form.requestSubmit(); return { ok: true, via: 'formulario' }; }
    for (const tipo of ['keydown', 'keypress', 'keyup']) campo.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { ok: true, via: 'enter' };
  };
  return '(' + corpo.toString() + ')(' + JSON.stringify(numero) + ')';
}

module.exports = { SignedLinkMemory, digitosDaCapa, origemEproc, quickSearchScript };
