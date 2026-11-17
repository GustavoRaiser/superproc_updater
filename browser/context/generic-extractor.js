'use strict';
// Extrator genérico (somente leitura). `extrairGenerico` roda DENTRO da página, em mundo isolado: é autocontido e vira texto.
// Lê apenas texto visível, títulos, tabelas, links e metadados de frames. Não lê campos de formulário (senhas e valores digitados),
// script, style, noscript, cookies nem armazenamento. Frames de outra origem só são listados, nunca lidos.

function extrairGenerico(o) {
  const inicio = Date.now();
  const avisos = [];
  const aviso = (c) => { if (!avisos.includes(c)) avisos.push(c); };
  const limpar = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const corta = (v, n) => { const t = limpar(v); if (t.length > n) { aviso('NODE_LIMIT_REACHED'); return t.slice(0, n); } return t; };
  const estourou = () => { if (Date.now() - inicio > o.timeoutMs) { aviso('CONTENT_EXTRACTION_TIMEOUT'); return true; } return false; };

  const opacidade = new WeakMap();
  const opacoOk = (el) => {
    if (!el || el === document.documentElement) return true;
    if (opacidade.has(el)) return opacidade.get(el);
    let ok = true;
    try { ok = getComputedStyle(el).opacity !== '0' && opacoOk(el.parentElement); } catch (_) { ok = false; }
    opacidade.set(el, ok);
    return ok;
  };
  const visivel = (el) => {
    if (!el) return false;
    try {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0 && opacoOk(el);
    } catch (_) { return false; }
  };

  const IGNORA = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, INPUT: 1 };
  const raiz = document.body || document.documentElement;

  const partes = [];
  let total = 0;
  const caminhada = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode(n) { const p = n.parentElement; return !p || IGNORA[p.tagName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
  });
  while (caminhada.nextNode()) {
    if (estourou()) break;
    const n = caminhada.currentNode;
    const t = limpar(n.data);
    if (!t || !visivel(n.parentElement)) continue;
    if (total + t.length + 1 > o.maxCaracteres) {
      aviso('CONTENT_LIMIT_REACHED');
      const resto = o.maxCaracteres - total;
      if (resto > 0) partes.push(t.slice(0, resto));
      total = o.maxCaracteres;
      break;
    }
    partes.push(t);
    total += t.length + 1;
  }

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

  const frames = [];
  Array.from(document.querySelectorAll('iframe,frame')).forEach((f, indice) => {
    let origem = null;
    try { origem = new URL(f.getAttribute('src') || 'about:blank', location.href).origin; } catch (_) { /* origem ilegível */ }
    let acessivel = false;
    try { acessivel = !!f.contentDocument; } catch (_) { acessivel = false; }
    frames.push(acessivel ? { indice, origem, acessivel } : { indice, origem, acessivel, motivo: 'CROSS_ORIGIN_FRAME' });
  });

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
