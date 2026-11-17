'use strict';
/**
 * Visualizador interno: renderiza o Markdown da biblioteca em HTML local e o serve pelo esquema
 * `superproc-lei://norma/<slug>[#art-5]`. Sem rede: tudo vem do disco. Todo texto é escapado.
 */
const { paginaCatalogo } = require('./catalogo-pagina');
const SCHEME = 'superproc-lei';
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TABELA_TAGS = new Set(['table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'sup', 'sub', 'em', 'strong', 'del']);
const TABELA_ATTRS = new Set(['rowspan', 'colspan', 'span', 'scope', 'headers']);

/** Tabelas vêm do conversor já reduzidas; reaplica a lista de tags/atributos por segurança. */
function sanearTabela(html) {
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g, (m, fecha, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!TABELA_TAGS.has(tag)) return '';
    if (fecha) return `</${tag}>`;
    const ok = [...attrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].filter(a => TABELA_ATTRS.has(a[1].toLowerCase()) && /^[\w .:-]+$/.test(a[2]))
      .map(a => ` ${a[1].toLowerCase()}="${a[2]}"`).join('');
    return `<${tag}${ok}>`;
  }).replace(/<(?!\/?[a-z])/gi, '&lt;');
}

function inline(texto) {
  const guardas = [];
  let s = texto.replace(/\\([\\*_<])/g, (m, c) => { guardas.push(c === '<' ? '&lt;' : c); return `\u0000${guardas.length - 1}\u0000`; });
  s = s.replace(/&(?!(?:lt|gt|amp|quot|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s.replace(/ {2}\n/g, '<br>').replace(/\u0000(\d+)\u0000/g, (m, i) => guardas[Number(i)]);
}

const semMarcas = (s) => s.replace(/\\([\\*_<])/g, '$1').replace(/[*~]/g, '');

function idArtigo(plano, usados) {
  const m = /^Art(?:igo|\.)?\s*(\d[\d.]*)\s*[º°o]?\s*(?:-\s*([A-Za-z]+))?/.exec(plano);
  if (!m) return null;
  let id = 'art-' + m[1].replace(/\./g, '') + (m[2] ? '-' + m[2].toLowerCase() : '');
  if (usados.has(id)) { let n = 2; while (usados.has(`${id}-${n}`)) n++; id += '-' + n; }
  usados.add(id);
  return id;
}

/** Markdown da biblioteca → { html do corpo, sumário de cabeçalhos }. */
function corpoParaHtml(md) {
  const usados = new Set();
  const sumario = [];
  const saida = [];
  let h = 0;
  for (const bloco of md.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.replace(/^\n+|\n+$/g, '')).filter(Boolean)) {
    const cab = /^(#{1,6}) (.+)$/.exec(bloco);
    if (cab) {
      const nivel = cab[1].length, id = `t-${++h}`;
      if (nivel > 1) sumario.push({ nivel, id, texto: semMarcas(cab[2]) });
      saida.push(`<h${nivel} id="${id}">${inline(cab[2])}</h${nivel}>`);
      continue;
    }
    if (/^<table[\s>]/i.test(bloco)) { saida.push(`<div class="tabela">${sanearTabela(bloco)}</div>`); continue; }
    const plano = semMarcas(bloco);
    let classe = '', id = null;
    if (/^Art(?:igo|\.)/.test(plano)) { classe = 'art'; id = idArtigo(plano, usados); }
    else if (/^(§|Parágrafo único)/.test(plano)) classe = 'par';
    else if (/^[IVXLC]+\s?[-–—]/.test(plano)) classe = 'inc';
    else if (/^[a-z]\)/.test(plano)) classe = 'ali';
    saida.push(`<p${classe ? ` class="${classe}"` : ''}${id ? ` id="${id}"` : ''}>${inline(bloco)}</p>`);
  }
  return { html: saida.join('\n'), sumario };
}

const CSS = `
:root{--fundo:#fff;--texto:#1c2129;--suave:#5b6573;--linha:#d9dee5;--destaque:#0b5cad;--faixa:#f3f6fa;--aviso:#fff4d6;--avisoTxt:#5c4400}
@media (prefers-color-scheme:dark){:root{--fundo:#15181d;--texto:#e6e9ee;--suave:#9aa5b4;--linha:#2d333c;--destaque:#6cb2ff;--faixa:#1d2229;--aviso:#3a3012;--avisoTxt:#f1d98a}}
*{box-sizing:border-box}html{scroll-padding-top:52px}
body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--faixa);border-bottom:1px solid var(--linha);padding:5px 16px}
header .linha{display:flex;gap:12px;align-items:center;max-width:880px;margin:0 auto}
header .esp{flex:1}
header input{font:inherit;padding:3px 8px;border:1px solid var(--linha);border-radius:6px;background:var(--fundo);color:var(--texto);width:140px}
header input:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--destaque);outline-offset:2px}
main{max-width:880px;margin:0 auto;padding:6px 16px 64px}
.meta{color:var(--suave);font-size:.8rem;line-height:1.4;margin:2px 0 6px}.meta a{color:var(--destaque)}
.aviso{background:var(--aviso);color:var(--avisoTxt);border-radius:4px;padding:3px 10px;font-size:.8rem;line-height:1.4;margin:4px 0}
details.sumario{position:relative}
details.sumario summary{cursor:pointer;font-weight:600;font-size:.9rem;padding:3px 0}
details.sumario nav{position:absolute;top:calc(100% + 6px);left:0;z-index:10;background:var(--faixa);border:1px solid var(--linha);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.25);max-height:65vh;overflow:auto;width:min(460px,88vw);padding:6px 12px}
details.sumario a{color:var(--texto);text-decoration:none;display:block;padding:1px 0;font-size:.9rem}
details.sumario a:hover{color:var(--destaque)}
h1{font-size:1.2rem;margin:10px 0 6px}h2,h3,h4,h5,h6{margin:16px 0 6px;line-height:1.3}
h2{font-size:1.2rem;text-align:center}h3{font-size:1.1rem;text-align:center}h4{font-size:1.02rem;text-align:center}h5,h6{font-size:1rem}
p{margin:0 0 8px;text-align:left}p.par{padding-left:1.1rem}p.inc{padding-left:2.2rem}p.ali{padding-left:3.3rem}
p:target{background:var(--aviso);border-radius:4px}
.tabela{overflow-x:auto;margin:10px 0}table{border-collapse:collapse}td,th{border:1px solid var(--linha);padding:4px 8px;vertical-align:top}
`;

const SCRIPT = `
(function(){var d=document.querySelector('details.sumario');if(d)d.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('a'))d.open=false;});
var f=document.getElementById('ir');if(!f)return;
f.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var v=f.value.trim().toLowerCase().replace(/^art(igo|\\.)?\\s*/,'').replace(/[º°]/g,'').replace(/\\./g,'').replace(/\\s+/g,'');
var id='art-'+v.replace(/-([a-z]+)$/,'-$1');var el=document.getElementById(id);
if(el){location.hash='#'+id;f.setAttribute('aria-invalid','false');}else{f.setAttribute('aria-invalid','true');f.title='Artigo não encontrado';}});})();
`;

const ROTULO_ESTADO = { 'em-andamento': 'conferência em andamento', concluida: 'conferida', bloqueada: 'a fonte recusou a conferência', falhou: 'a conferência falhou' };

function paginaNorma({ meta, corpo, registro, conferencia }) {
  const titulo = meta.titulo || registro.titulo || 'Norma';
  // O título já aparece na barra do painel/aba: o `# Título` inicial do arquivo não se repete na página.
  const semTitulo = corpo.replace(/^\s*# (.+)\n+/, (m, h) => semMarcas(h).trim() === titulo.trim() ? '' : m);
  const { html, sumario } = corpoParaHtml(semTitulo);
  const estado = conferencia && conferencia.resultado ? conferencia.resultado.status : null;
  const aviso = estado && estado !== 'concluida' && estado !== 'em-andamento'
    ? `<div class="aviso" role="status">A última tentativa de conferência (${esc(conferencia.ultima_data)}) não terminou: ${esc(ROTULO_ESTADO[estado] || estado)}. Este é o texto guardado em ${esc(meta.conferido_em || registro.conferido_em)}.</div>` : '';
  // Decretos (e normas sem texto compilado na fonte) só têm a publicação original: sem alterações posteriores e sem anexos que não venham em texto.
  const original = /original/i.test(String(meta.versao_texto || registro.versao_texto || ''));
  const avisoTexto = original
    ? '<div class="aviso">Texto da publicação original, sem as alterações posteriores. Anexos que a fonte não traz em texto (como regulamentos aprovados por decreto) podem não estar aqui: para o texto consolidado, consulte o Planalto. Cópia local de caráter informativo; não substitui a publicação no Diário Oficial da União.</div>'
    : '<div class="aviso">Texto compilado de caráter informativo (cópia local). Não substitui a publicação no Diário Oficial da União.</div>';
  const revog = meta.revogada === false ? 'em vigor segundo a fonte' : 'situação não informada pela fonte';
  const toc = sumario.length ? `<details class="sumario"><summary>Sumário (${sumario.length})</summary><nav aria-label="Sumário">${sumario.filter(s => s.nivel <= 4).map(s => `<a href="#${s.id}" style="padding-left:${(s.nivel - 2) * 14}px">${esc(s.texto)}</a>`).join('')}</nav></details>` : '<span></span>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>
<header><div class="linha">${toc}<span class="esp"></span>
<label><span style="position:absolute;left:-9999px">Ir para o artigo</span><input id="ir" type="text" placeholder="Ir para Art. nº" autocomplete="off"></label></div></header>
<main><div class="meta">${esc(meta.versao_texto || registro.versao_texto)} · texto de ${esc(meta.texto_data || registro.texto_data || '—')} · ${esc(revog)} · baixado em ${esc(meta.baixado_em || registro.baixado_em)}, conferido em ${esc(meta.conferido_em || registro.conferido_em)} ·
<a href="${esc(meta.fonte || '')}" target="_blank" rel="noopener noreferrer">fonte oficial</a></div>
${avisoTexto}${aviso}
${html}</main><script>${SCRIPT}</script></body></html>`;
}

function paginaMensagem(titulo, texto, status) {
  return { status, html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></main></body></html>` };
}

const URN_VALIDA = /^urn:lex:br:[\w.:;@!~$,-]{1,200}$/;
const CSP_CATALOGO = `${CSP}; connect-src ${SCHEME}:`;
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }
});

/**
 * API do catálogo (`superproc-lei://catalogo/api/*`), usada só pela página do catálogo. Defesas: a página é a
 * única origem do esquema que a chama (sem CORS, outra origem nem lê a resposta), exige o cabeçalho próprio
 * (força preflight que o esquema não atende) e recusa `Sec-Fetch-Site` diferente de same-origin.
 */
async function manipularApi(request, u, api) {
  if (request.headers.get('x-superproc') !== 'catalogo') return json({ erro: 'proibido' }, 403);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return json({ erro: 'proibido' }, 403);
  const rota = u.pathname.replace(/^\/api\//, '');
  try {
    if (request.method === 'GET' && rota === 'biblioteca') return json({ resultados: api.biblioteca() });
    if (request.method === 'GET' && rota === 'buscar') return json(await api.buscar(String(u.searchParams.get('q') || '').slice(0, 300)));
    if (request.method !== 'POST') return json({ erro: 'método não permitido' }, 405);
    let corpo = {};
    try { corpo = await request.json(); } catch { /* corpo vazio */ }
    if (rota === 'migrar') return json(await api.migrarPlanalto());
    if ((rota === 'baixar' || rota === 'adicionar') && corpo && URN_VALIDA.test(corpo.urn)) return json(await api[rota](corpo.urn));
    return json({ erro: 'requisição inválida' }, rota === 'baixar' || rota === 'adicionar' || rota === 'migrar' ? 400 : 404);
  } catch { return json({ erro: 'falha interna' }, 500); }
}

/**
 * Manipulador do esquema; `biblioteca.lerMarkdown(slug)` e `conferencia.estado()` vêm do serviço.
 * `puxar(slug)` (opcional) baixa a norma que ainda não está na biblioteca, já limpa, na hora em que ela é aberta.
 */
function criarManipulador({ biblioteca, conferencia, api = null, puxar = null }) {
  return async function manipular(request) {
    let slug = null;
    try {
      const u = new URL(request.url);
      if (u.hostname === 'norma') slug = decodeURIComponent(u.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));
      else if (u.hostname === 'catalogo' && api) {
        if (u.pathname.startsWith('/api/')) return manipularApi(request, u, api);
        if (u.pathname === '/' || u.pathname === '') {
          return new Response(paginaCatalogo(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP_CATALOGO, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } });
        }
      }
    } catch { /* cai na resposta 400 */ }
    const cabecalhos = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };
    let r;
    if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) r = paginaMensagem('Endereço inválido', 'Este endereço de legislação local não é válido.', 400);
    else {
      let norma = biblioteca.lerMarkdown(slug);
      let motivo = '';
      if (!norma && puxar) {
        try { const p = await puxar(slug); if (p && p.ok) norma = biblioteca.lerMarkdown(slug); else motivo = (p && !p.naoEncontrada && p.motivo) || ''; } catch (e) { motivo = e.message; }
      }
      r = norma
        ? { status: 200, html: paginaNorma({ meta: norma.meta, corpo: norma.corpo, registro: norma.registro, conferencia: conferencia.estado() }) }
        : paginaMensagem('Norma não está na biblioteca', motivo
          ? `Não foi possível baixar esta norma agora: ${motivo} Verifique a conexão e abra o link de novo, ou use o “Catálogo de leis”.`
          : 'Esta norma ainda não foi baixada neste computador (ou foi removida). Abra o “Catálogo de leis” para baixá-la novamente.', motivo ? 503 : 404);
    }
    return new Response(r.html, { status: r.status, headers: cabecalhos });
  };
}

module.exports = { SCHEME, CSP, criarManipulador, paginaNorma, corpoParaHtml, sanearTabela, inline, esc };
