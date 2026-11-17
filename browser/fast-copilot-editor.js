'use strict';
// Fast Copilot no Editor (host): scripts que o host executa na aba do editor de minutas (CKEditor 4).
// Cada função "noIsolado*" roda em MUNDO ISOLADO (webContents.executeJavaScriptInIsolatedWorld): a âncora do
// trecho fica invisível aos scripts da página (eProc, AZFLOW, EPRYX). As funções "naPagina*" rodam no
// contexto principal só para o que exige o objeto CKEDITOR (snapshot de desfazer, insertHtml).
// As funções são serializadas com toString(); por isso não usam nada de fora do próprio corpo.

const MUNDO_ISOLADO = 1071; // id fixo do mundo isolado do Fast Copilot

/* ---------- rodam na página (isolado) ---------- */
function noIsoladoCapturar(opcoes) {
  const st = (globalThis.__spFastCopilot ||= { ancoras: new Map(), seq: 0 });
  const BLOCOS = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre';
  const frames = [...document.querySelectorAll('iframe.cke_wysiwyg_frame')];
  const docDe = (f) => { try { return f.contentDocument; } catch (_) { return null; } };
  const rangeDe = (doc) => {
    const sel = doc && doc.getSelection && doc.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    return doc.body && doc.body.contains(r.commonAncestorContainer) && r.toString().trim() ? r : null;
  };
  const indice = frames.findIndex((f) => rangeDe(docDe(f))) >= 0 ? frames.findIndex((f) => rangeDe(docDe(f)))
    : frames.findIndex((f) => document.activeElement === f) >= 0 ? frames.findIndex((f) => document.activeElement === f)
    : frames.length === 1 ? 0 : -1;
  if (indice < 0) return { ok: false, motivo: 'editor' };
  const doc = docDe(frames[indice]);
  if (!doc || !doc.body) return { ok: false, motivo: 'editor' };

  function inline(no) {
    let out = '';
    no.childNodes.forEach((filho) => {
      if (filho.nodeType === 3) { out += filho.textContent.replace(/ /g, ' ').replace(/[\r\n]+/g, ' '); return; } // \n em texto HTML é espaço; quebra real só em <br> e blocos
      if (filho.nodeType !== 1) return;
      if (filho.classList.contains('cke_widget_drag_handler_container') || filho.getAttribute('data-cke-widget-drag-handler')) return;
      const tag = filho.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; return; }
      if (tag === 'img') return;
      let dentro = inline(filho);
      if (!dentro) return;
      const est = filho.style || {};
      const negrito = tag === 'strong' || tag === 'b' || est.fontWeight === 'bold' || parseInt(est.fontWeight, 10) >= 700;
      const italico = tag === 'em' || tag === 'i' || est.fontStyle === 'italic';
      const sublinhado = tag === 'u' || (est.textDecoration && est.textDecoration.includes('underline'));
      const envolver = (s, a, f) => { const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + a + m[2] + f + m[3] : s; };
      if (sublinhado) dentro = envolver(dentro, '<u>', '</u>');
      if (italico) dentro = envolver(dentro, '<i>', '</i>');
      if (negrito) dentro = envolver(dentro, '<b>', '</b>');
      out += dentro;
    });
    return out;
  }
  function tipo(el) {
    if (el.classList.contains('dispositivo') || el.getAttribute('data-tipo_marcacao') === 'dispositivo' || el.querySelector('.dispositivo,[data-tipo_marcacao="dispositivo"]')) return 'dispositivo';
    if (el.classList.contains('citacao') || el.classList.contains('citacao2')) return 'citação';
    return null;
  }
  function serializar(raiz) {
    const blocos = [...raiz.querySelectorAll(BLOCOS)].filter((el) => !el.querySelector(BLOCOS));
    if (!blocos.length) return inline(raiz).replace(/[ \t]+/g, ' ').trim();
    const saida = []; let ativo = null;
    blocos.forEach((el) => {
      const texto = inline(el).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
      if (!texto) return;
      const t = tipo(el);
      if (t !== ativo) { if (ativo) saida.push('</' + ativo + '>'); if (t) saida.push('<' + t + '>'); ativo = t; }
      saida.push('<p>' + texto + '</p>');
    });
    if (ativo) saida.push('</' + ativo + '>');
    return saida.join('\n');
  }

  const r = rangeDe(doc);
  const resultado = { ok: true, indice, temSelecao: !!r };
  if (r) {
    const id = 'a' + (++st.seq);
    st.ancoras.set(id, { frame: frames[indice], range: r.cloneRange(), texto: r.toString() });
    const caixa = doc.createElement('div'); caixa.appendChild(r.cloneContents());
    Object.assign(resultado, { id, selecao: serializar(caixa), tamanho: r.toString().length });
  }
  if (r) { // onde termina o texto selecionado (coordenadas da aba), para a caixa de Alteração nascer junto dele
    try {
      const fr = frames[indice].getBoundingClientRect();
      const rs = [...r.getClientRects()].filter((q) => q.width > 0 || q.height > 0);
      if (rs.length) {
        const ult = rs[rs.length - 1];
        resultado.pos = { esq: fr.left + Math.min(...rs.map((q) => q.left)), x: fr.left + ult.right, y: Math.min(fr.top + ult.bottom, fr.bottom), topo: fr.top + rs[0].top };
      }
    } catch (_) {}
  }
  if (opcoes && opcoes.minuta) resultado.minuta = serializar(doc.body);
  return resultado;
}

// Confere a âncora; se o trecho continua idêntico, coloca a seleção nativa sobre ele (sem focar o editor).
function noIsoladoSelecionar(id) {
  const st = globalThis.__spFastCopilot;
  const a = st && st.ancoras.get(id);
  if (!a) return { ok: false, motivo: 'ancora' };
  const frames = [...document.querySelectorAll('iframe.cke_wysiwyg_frame')];
  const indice = frames.indexOf(a.frame);
  const r = a.range;
  if (indice < 0 || !r.startContainer.isConnected || !r.endContainer.isConnected || r.toString() !== a.texto) return { ok: false, motivo: 'alterado' };
  const doc = a.frame.contentDocument; const sel = doc.getSelection();
  sel.removeAllRanges(); sel.addRange(r.cloneRange());
  return { ok: true, indice };
}

function noIsoladoLiberar(id) {
  const st = globalThis.__spFastCopilot;
  if (st) st.ancoras.delete(id);
  return true;
}

/* ---------- rodam na página (contexto principal: CKEDITOR) ---------- */
// Substitui a seleção nativa atual do editor [indice] pelo html, com ponto de desfazer antes e depois.
function naPaginaAplicar(indice, html) {
  const f = [...document.querySelectorAll('iframe.cke_wysiwyg_frame')][indice];
  const C = window.CKEDITOR;
  const ed = C && f && Object.values(C.instances).find((e) => e.document && e.document.$ === f.contentDocument);
  if (!ed) return { ok: false, motivo: 'editor' };
  const nativa = f.contentDocument.getSelection();
  if (!nativa || !nativa.rangeCount) return { ok: false, motivo: 'selecao' };
  const n = nativa.getRangeAt(0);
  const r = ed.createRange();
  r.setStart(new C.dom.node(n.startContainer), n.startOffset);
  r.setEnd(new C.dom.node(n.endContainer), n.endOffset);
  // O insertHtml do CKEditor foca o editor; em segundo plano o foco volta para onde o usuário estava.
  const antes = document.activeElement;
  ed.fire('saveSnapshot');
  // 'unfiltered_html': o html já chega saneado (só b/i/u/p/br e span.citacao/.dispositivo/destaque) e o filtro
  // padrão do CKEditor removeria as classes. Ver prova F0 (2026-10-24).
  ed.insertHtml(html, 'unfiltered_html', r);
  ed.fire('saveSnapshot');
  ed.fire('change');
  if (antes && antes !== f && antes !== document.body && typeof antes.focus === 'function') antes.focus({ preventScroll: true });
  return { ok: true };
}

// Remove as marcas de destaque (mantém o texto) em todos os editores, com ponto de desfazer.
function naPaginaAceitarDestaques(classe) {
  const C = window.CKEDITOR; let total = 0;
  Object.values((C && C.instances) || {}).forEach((ed) => {
    const doc = ed.document && ed.document.$; if (!doc) return;
    const marcas = [...doc.querySelectorAll('span.' + classe)]; if (!marcas.length) return;
    ed.fire('saveSnapshot');
    marcas.forEach((m) => { while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m); m.remove(); total++; });
    ed.fire('saveSnapshot'); ed.fire('change');
  });
  return { ok: true, total };
}

/* ---------- montagem das chamadas ---------- */
const chamada = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a === undefined ? null : a).replace(/</g, '\\u003c')).join(',')})`;

const scripts = {
  capturar: (opcoes = {}) => chamada(noIsoladoCapturar, { minuta: !!opcoes.minuta }),
  selecionar: (id) => chamada(noIsoladoSelecionar, String(id)),
  liberar: (id) => chamada(noIsoladoLiberar, String(id)),
  aplicar: (indice, html) => chamada(naPaginaAplicar, Number(indice), String(html)),
  aceitarDestaques: (classe) => chamada(naPaginaAceitarDestaques, String(classe))
};

// Executores (wc = webContents da aba do editor). Injetados para teste.
const noIsolado = (wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: codigo }]);
const naPagina = (wc, codigo) => wc.executeJavaScript(codigo);

module.exports = { MUNDO_ISOLADO, scripts, noIsolado, naPagina,
  _fn: { noIsoladoCapturar, noIsoladoSelecionar, noIsoladoLiberar, naPaginaAplicar, naPaginaAceitarDestaques } };
