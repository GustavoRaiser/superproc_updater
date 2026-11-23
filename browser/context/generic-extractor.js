'use strict';
// Extrator genérico (somente leitura). `extrairGenerico` roda DENTRO da página, em mundo isolado: é autocontido e vira texto.
// Lê apenas texto visível, títulos, tabelas, links e metadados de frames. Não lê campos de formulário (senhas e valores digitados),
// script, style, noscript, cookies nem armazenamento. Frames de outra origem só são listados, nunca lidos; os da MESMA origem
// (contentDocument acessível, ex.: o quadro #ifrLeitorPdf da árvore do eproc, que mostra uma certidão em HTML) têm o texto
// visível lido como o da página: o percurso de texto da página não atravessa o #document de um iframe sozinho.

function extrairGenerico(o) {
  const inicio = Date.now();
  const avisos = [];
  const aviso = (c) => { if (!avisos.includes(c)) avisos.push(c); };
  const limpar = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const corta = (v, n) => { const t = limpar(v); if (t.length > n) { aviso('NODE_LIMIT_REACHED'); return t.slice(0, n); } return t; };
  const estourou = () => { if (Date.now() - inicio > o.timeoutMs) { aviso('CONTENT_EXTRACTION_TIMEOUT'); return true; } return false; };

  const janelaDe = (el) => (el && el.ownerDocument && el.ownerDocument.defaultView) || window;
  const opacidade = new WeakMap();
  const opacoOk = (el) => {
    if (!el || el === document.documentElement) return true;
    if (opacidade.has(el)) return opacidade.get(el);
    let ok = true;
    try { ok = janelaDe(el).getComputedStyle(el).opacity !== '0' && opacoOk(el.parentElement); } catch (_) { ok = false; }
    opacidade.set(el, ok);
    return ok;
  };
  const visivel = (el) => {
    if (!el) return false;
    try {
      const s = janelaDe(el).getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0 && opacoOk(el);
    } catch (_) { return false; }
  };

  const IGNORA = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, INPUT: 1 };
  // Texto visível de um documento (o da página ou o de um quadro de mesma origem), até `limite` caracteres.
  function coletarTexto(doc, limite) {
    const raizDoc = doc.body || doc.documentElement;
    const partes = [];
    let total = 0;
    let cortou = false;
    if (!raizDoc) return { partes, total, cortou };
    const caminhada = doc.createTreeWalker(raizDoc, NodeFilter.SHOW_TEXT, {
      acceptNode(n) { const p = n.parentElement; return !p || IGNORA[p.tagName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    while (caminhada.nextNode()) {
      if (estourou()) break;
      const n = caminhada.currentNode;
      const t = limpar(n.data);
      if (!t || !visivel(n.parentElement)) continue;
      if (total + t.length + 1 > limite) {
        aviso('CONTENT_LIMIT_REACHED');
        cortou = true;
        const resto = limite - total;
        if (resto > 0) partes.push(t.slice(0, resto));
        total = limite;
        break;
      }
      partes.push(t);
      total += t.length + 1;
    }
    return { partes, total, cortou };
  }
  const partes = coletarTexto(document, o.maxCaracteres).partes;

  const titulos = [];
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (titulos.length >= 200 || estourou()) break;
    if (!visivel(h)) continue;
    const t = corta(h.innerText, 500);
    if (t) titulos.push({ nivel: Number(h.tagName[1]), texto: t });
  }

  const tabelas = [];
  let linhas = 0;
  for (const tb of document.querySelectorAll('table')) {
    if (estourou() || linhas >= o.maxLinhasTabela) break;
    if (!visivel(tb)) continue;
    const rows = [];
    for (const tr of tb.rows) {
      if (linhas >= o.maxLinhasTabela) { aviso('TABLE_LIMIT_REACHED'); break; }
      rows.push(Array.from(tr.cells, (c) => corta(c.innerText, o.maxNo)));
      linhas++;
    }
    if (rows.length) tabelas.push(rows);
  }

  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (estourou()) break;
    if (links.length >= o.maxLinks) { aviso('LINK_LIMIT_REACHED'); break; }
    let destino;
    try { const u = new URL(a.href); if (u.protocol !== 'https:' && u.protocol !== 'http:') continue; destino = u.origin + u.pathname; } catch (_) { continue; }
    if (!visivel(a)) continue;
    links.push({ texto: corta(a.innerText || a.getAttribute('aria-label') || '', 300), destino });
  }

  // Quadros (iframe/frame): os de outra origem só são listados; os de mesma origem têm o texto visível lido (até 3 níveis,
  // 8 quadros, no máximo o mesmo limite de caracteres da página). Quadro vazio ou invisível entra só na lista.
  const frames = [];
  let indiceFrame = 0;
  let restanteFrames = o.maxCaracteres;
  const varrerQuadros = (doc, nivel) => {
    for (const f of Array.from(doc.querySelectorAll('iframe,frame'))) {
      const indice = indiceFrame++;
      let origem = null;
      try { origem = new URL(f.getAttribute('src') || 'about:blank', doc.location.href).origin; } catch (_) { /* origem ilegível */ }
      let filho = null;
      try { filho = f.contentDocument; } catch (_) { filho = null; }
      if (!filho) { frames.push({ indice, origem, acessivel: false, motivo: 'CROSS_ORIGIN_FRAME' }); continue; }
      const item = { indice, origem, acessivel: true };
      frames.push(item);
      if (estourou() || indice >= 8 || restanteFrames <= 0 || !visivel(f)) continue;
      try {
        const r = coletarTexto(filho, restanteFrames);
        const texto = r.partes.join(' ');
        if (texto) { item.titulo = limpar(filho.title).slice(0, 300); item.texto = texto; if (r.cortou) item.truncado = true; restanteFrames -= texto.length; }
        if (nivel < 3) varrerQuadros(filho, nivel + 1);
      } catch (_) { /* quadro some no meio da leitura: fica só na lista */ }
    }
  };
  varrerQuadros(document, 1);

  let selecionado = '';
  try { selecionado = limpar(String(getSelection())).slice(0, o.maxCaracteres); } catch (_) { /* sem seleção */ }

  return {
    titulo: limpar(document.title).slice(0, 500),
    url: location.origin + location.pathname,
    origem: location.origin === 'null' ? '' : location.origin,
    idioma: limpar(document.documentElement.lang).slice(0, 20),
    textoVisivel: partes.join(' '),
    textoSelecionado: selecionado,
    titulos,
    tabelas,
    links,
    frames,
    avisos
  };
}

const codigoGenerico = (opcoes) => `(${extrairGenerico.toString()})(${JSON.stringify(opcoes)})`;

module.exports = { extrairGenerico, codigoGenerico };
