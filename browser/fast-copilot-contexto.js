'use strict';
// Fast Copilot (host): contexto de qualquer página (não só o editor). Descobre onde está o cursor/a seleção do usuário
// (campo de texto, área editável ou texto da página) e, se for editável, guarda uma âncora para trocar o trecho depois.
// Roda em MUNDO ISOLADO (id próprio): a âncora fica invisível aos scripts da página. Nada daqui é gravado em log.

const MUNDO_ISOLADO = 1072;
const LIMITE = 100000;

function noIsoladoCapturar(limite) {
  delete globalThis.__spFcCtx;
  const a = document.activeElement;
  const id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const rotulo = (el) => String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || '').slice(0, 60);
  const campo = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/i.test(a.type || '')));
  let r = { ok: true, tipo: 'nenhum', editavel: false, selecao: '', rotulo: '', id: null };
  if (campo) {
    let ini = 0, fim = 0; try { ini = a.selectionStart || 0; fim = a.selectionEnd || 0; } catch (_) {}
    const editavel = !a.readOnly && !a.disabled;
    r = { ok: true, tipo: 'campo', editavel, selecao: String(a.value || '').slice(ini, fim), rotulo: rotulo(a), id: null };
    if (r.selecao && editavel) { globalThis.__spFcCtx = { id, el: a, ini, fim, texto: r.selecao }; r.id = id; }
  } else if (a && a.isContentEditable) {
    const s = getSelection(); const dentro = !!(s && s.rangeCount && a.contains(s.anchorNode));
    const texto = dentro ? s.toString() : '';
    r = { ok: true, tipo: 'editavel', editavel: true, selecao: texto, rotulo: rotulo(a), id: null };
    if (texto) { globalThis.__spFcCtx = { id, el: a, range: s.getRangeAt(0).cloneRange(), texto }; r.id = id; }
  } else {
    const s = getSelection(); const texto = s ? s.toString() : '';
    r = { ok: true, tipo: texto ? 'pagina' : 'nenhum', editavel: false, selecao: texto, rotulo: '', id: null };
  }
  r.tamanho = r.selecao.length; if (r.selecao.length > limite) r.selecao = r.selecao.slice(0, limite);
  return r;
}

function noIsoladoAplicar(id, texto) {
  const c = globalThis.__spFcCtx;
  if (!c || c.id !== id) return { ok: false, motivo: 'ancora' };
  if (!c.el.isConnected) return { ok: false, motivo: 'alterado' };
  if (c.range) {
    if (c.range.toString() !== c.texto) return { ok: false, motivo: 'alterado' };
    c.el.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(c.range);
    const ok = document.execCommand('insertText', false, texto);
    return { ok: !!ok, motivo: ok ? null : 'erro' };
  }
  const el = c.el;
  if (String(el.value || '').slice(c.ini, c.fim) !== c.texto) return { ok: false, motivo: 'alterado' };
  el.setRangeText(texto, c.ini, c.fim, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, motivo: null };
}

function noIsoladoLiberar(id) { const c = globalThis.__spFcCtx; if (c && c.id === id) delete globalThis.__spFcCtx; return true; }

const chamada = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a === undefined ? null : a).replace(/</g, '\\u003c')).join(',')})`;
const scripts = {
  capturar: () => chamada(noIsoladoCapturar, LIMITE),
  aplicar: (id, texto) => chamada(noIsoladoAplicar, String(id), String(texto)),
  liberar: (id) => chamada(noIsoladoLiberar, String(id))
};
const noIsolado = (wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: codigo }]);

module.exports = { MUNDO_ISOLADO, scripts, noIsolado, _fn: { noIsoladoCapturar, noIsoladoAplicar, noIsoladoLiberar } };
