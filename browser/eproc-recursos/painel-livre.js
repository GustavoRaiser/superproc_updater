// Painel livre do navegador SuperPROC (camada: host; mundo isolado, só na tela do painel da secretaria).
//
// Reorganiza os blocos do Painel do Servidor numa lista em ordem, com blocos ocultos e uma engrenagem para configurar.
// A página é uma lista de linhas, de cima para baixo; cada linha tem de 1 a 4 blocos, da esquerda para a direita, em colunas iguais.
// Arrastar um bloco para entre duas linhas (ou antes da primeira / depois da última) cria uma linha só dele; arrastá-lo sobre outro
// bloco o põe na linha desse bloco, à esquerda ou à direita dele (limite de 4 por linha).
// Ocultar é um estado à parte: o bloco vai para o grupo Ocultos (no fim da página), com ordem própria, um por linha, e só volta
// por "Mostrar", ao fim da página, numa linha só dele.
// Substitui o antigo módulo painel_principal da extensão (mesma ideia, sem a reconstrução a cada mutação).
//
// REGRA DE VIDA: executa uma vez ao entrar e termina. Nada fica vigiando a página: sem MutationObserver, sem setInterval, sem
// listeners em document/window. Sobram o CSS e os elementos da engrenagem, que morrem junto com o documento. O painel de
// configuração é montado no clique e removido ao fechar; "Atualizar tudo" só usa observador e timers enquanto a fila roda.
// Um único ouvinte de clique fica no próprio #divPainel (morre com ele): links que o eproc abre em aba nova abrem na mesma.
//
// Configuração (localStorage da origem do eproc; ver docs/ia/POOL-COMUM.md):
//   superproc_painel_livre_v1      { v:5, linhas:[[[slug, ...], ...], ...], ocultos:[slug, ...], dividir:{ slug: 2|3|4 } }
//                                  linha > colunas (até 4, iguais) > blocos empilhados na coluna
//                                  dividir = partes da tabela de cada bloco ([slug] antigo = 2); vale até 4 sozinho na linha, 2 meio a meio, 0 com 3 ou 4 colunas. A v4 (linha = blocos, um por coluna), a v3 (ordem + modo
//                                  topo/esq/dir), a v2 (modo "oculto" na mesma lista) e a v1 (zonas) são aceitas e convertidas
//   superproc_painel_livre_css_v1  CSS compilado a partir dela; o host (eproc-recursos.js) o lê e injeta na confirmação da
//                                  navegação, antes da primeira pintura, e o remove quando este módulo termina
// slug do bloco = id do fieldset; ids repetidos viram id#2, id#3 (o eproc repete fldMeusLocalizadores).
// Sem configuração salva a página fica exatamente como o eproc a entrega.
//
// Este arquivo é lido do disco pelo host a cada ativação e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spPainelLivre) return;
const raiz = document.getElementById('divPainel');
if (!raiz) return;
window.__spPainelLivre = true;

const CHAVE = 'superproc_painel_livre_v1';
const CHAVE_CSS = 'superproc_painel_livre_css_v1';
const MAX_LINHA = 4; // colunas por linha da página
const MAX_PARTES = 4; // partes em que a tabela de um bloco pode se dividir
const SLUG_OK = /^[\w#-]{1,80}$/;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- Blocos, na ordem nativa (capturada antes de qualquer movimento) ----
function tituloDe(el, slug) {
  const legenda = el.querySelector(':scope > legend');
  if (!legenda) return slug;
  const copia = legenda.cloneNode(true);
  copia.querySelectorAll('img, a, button, i, span[onclick]').forEach(x => x.remove());
  return norm(copia.textContent) || slug;
}
const repetidos = {};
const blocos = [];
for (const el of raiz.children) {
  if (el.tagName !== 'FIELDSET' || !el.id) continue;
  const n = (repetidos[el.id] = (repetidos[el.id] || 0) + 1);
  const slug = n > 1 ? el.id + '#' + n : el.id;
  if (SLUG_OK.test(slug)) blocos.push({ slug, el, titulo: tituloDe(el, slug) });
}
if (!blocos.length) return;
const porSlug = Object.fromEntries(blocos.map(b => [b.slug, b]));

// ---- Configuração ----
function lerCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (!c || typeof c !== 'object') return null;
    if ((c.v === 4 || c.v === 5) && Array.isArray(c.linhas) && Array.isArray(c.ocultos)) return c;
    if (c.v === 3 && Array.isArray(c.ordem) && Array.isArray(c.ocultos) && c.modo && typeof c.modo === 'object') return c;
    if (c.v === 2 && Array.isArray(c.ordem) && c.modo && typeof c.modo === 'object') return c;
    if (c.v === 1 && c.zonas && typeof c.zonas === 'object') return c;
  } catch (_) { /* configuração ilegível: vale a página nativa */ }
  return null;
}
function daV1(c) {
  const ordem = [], modo = {};
  for (const [zona, m] of [['topo', 'topo'], ['c1', 'esq'], ['c2', 'dir'], ['c3', 'dir'], ['oculto', 'oculto']]) {
    for (const slug of Array.isArray(c.zonas[zona]) ? c.zonas[zona] : []) { ordem.push(slug); modo[slug] = m; }
  }
  return { v: 2, ordem, modo };
}
// v2 tinha "oculto" como um modo na mesma lista: os ocultos passam para a lista própria, com o modo de antes (centralizado).
function daV2(c) {
  const ordem = [], ocultos = [], modo = {};
  const origem = c.modo && typeof c.modo === 'object' ? c.modo : {};
  for (const s of Array.isArray(c.ordem) ? c.ordem : []) {
    const m = Object.hasOwn(origem, s) ? origem[s] : 'topo';
    (m === 'oculto' ? ocultos : ordem).push(s);
    modo[s] = m === 'oculto' ? 'topo' : m;
  }
  return { v: 3, ordem, ocultos, modo, dividir: [] };
}
// v3 tinha a lista com um modo por bloco: centralizado vira linha própria; esquerda e direita seguidas eram duas colunas
// independentes, que continuam assim (uma coluna empilha os blocos da esquerda, a outra os da direita).
function daV3(c) {
  const modo = c.modo && typeof c.modo === 'object' ? c.modo : {};
  const linhas = [];
  let esq = [], dir = [];
  const fechar = () => { if (esq.length || dir.length) linhas.push([esq, dir]); esq = []; dir = []; };
  for (const s of Array.isArray(c.ordem) ? c.ordem : []) {
    if (modo[s] === 'esq') esq.push(s);
    else if (modo[s] === 'dir') dir.push(s);
    else { fechar(); linhas.push([[s]]); }
  }
  fechar();
  return { v: 5, linhas, ocultos: c.ocultos, dividir: c.dividir };
}
// v4: linha = lista de blocos, um por coluna.
const daV4 = (c) => ({ v: 5, linhas: (Array.isArray(c.linhas) ? c.linhas : []).map(l => (Array.isArray(l) ? l : []).map(s => [s])), ocultos: c.ocultos, dividir: c.dividir });
// Uma linha com uma coluna só e vários blocos é o mesmo que uma linha por bloco: desfaz o empilhamento.
const achatar = (linhas) => linhas.flatMap(r => (r.length === 1 ? r[0].map(s => [[s]]) : [r]));
// Valida e completa. A página é uma lista de linhas; cada linha tem de 1 a MAX_LINHA colunas; cada coluna empilha 1 ou mais blocos.
// Cada bloco conhecido aparece uma vez (numa coluna ou nos ocultos). Blocos novos (o tribunal pode criar) entram sozinhos numa
// linha, depois da linha do bloco que os antecede na página original.
function normalizar(c) {
  if (c.v === 1) c = daV2(daV1(c)); else if (c.v === 2) c = daV2(c);
  if (c.v === 3) c = daV3(c); else if (c.v === 4) c = daV4(c);
  const vistos = new Set();
  const novo = (s) => typeof s === 'string' && Object.hasOwn(porSlug, s) && !vistos.has(s) && vistos.add(s);
  let linhas = [];
  for (const l of Array.isArray(c.linhas) ? c.linhas : []) {
    const cols = (Array.isArray(l) ? l : []).map(col => (Array.isArray(col) ? col : []).filter(novo)).filter(col => col.length);
    for (let i = 0; i < cols.length; i += MAX_LINHA) linhas.push(cols.slice(i, i + MAX_LINHA));
  }
  linhas = achatar(linhas);
  const ocultos = (Array.isArray(c.ocultos) ? c.ocultos : []).filter(novo);
  blocos.forEach((b, i) => {
    if (vistos.has(b.slug)) return;
    let pos = 0;
    for (let k = i - 1; k >= 0; k--) { const j = linhas.findIndex(r => r.some(col => col.includes(blocos[k].slug))); if (j >= 0) { pos = j + 1; break; } }
    linhas.splice(pos, 0, [[b.slug]]);
    vistos.add(b.slug);
  });
  // dividir: { slug: partes (2 a MAX_PARTES) }; a lista antiga [slug, ...] vale 2 partes para cada um.
  const origemDiv = Array.isArray(c.dividir) ? Object.fromEntries(c.dividir.filter(s => typeof s === 'string').map(s => [s, 2])) : (c.dividir && typeof c.dividir === 'object' ? c.dividir : {});
  const dividir = {};
  for (const [s, n] of Object.entries(origemDiv)) if (Object.hasOwn(porSlug, s) && Number.isInteger(n) && n >= 2 && n <= MAX_PARTES) dividir[s] = n;
  return { v: 5, linhas, ocultos, dividir };
}
function seletor(slug) {
  const [id, n] = slug.split('#');
  const e = CSS.escape(id);
  return n ? '#divPainel > #' + e + ' ~ #' + e : '#divPainel > fieldset#' + e + ':not(#' + e + ' ~ #' + e + ')';
}
// CSS do início da página: véu até este módulo terminar (o host o remove; sai sozinho em 0,5 s se algo falhar) e blocos ocultos
// já invisíveis. Deve ser só isto: vale até o módulo reorganizar a página.
function compilarCss(cfg) {
  let css = '#divPainel{visibility:hidden;animation:sp-pl-mostrar 0s linear .5s forwards}@keyframes sp-pl-mostrar{to{visibility:visible}}';
  if (cfg.ocultos.length) css += cfg.ocultos.map(seletor).join(',') + '{display:none!important}';
  return css;
}
function salvar(cfg) {
  try {
    const json = JSON.stringify(cfg), css = compilarCss(cfg);
    if (localStorage.getItem(CHAVE) !== json) localStorage.setItem(CHAVE, json);
    if (localStorage.getItem(CHAVE_CSS) !== css) localStorage.setItem(CHAVE_CSS, css);
  } catch (_) { /* armazenamento cheio ou bloqueado: vale só até recarregar */ }
}
// Edição da lista de linhas (sempre sobre uma cópia da configuração). linhas[linha][coluna][posição na coluna] = slug.
// Tirar deixa colunas/linhas vazias (os índices das outras continuam valendo); arrumar as remove e desfaz empilhamentos de coluna única.
function arrumar(x) {
  x.linhas = achatar(x.linhas.map(r => r.filter(col => col.length)).filter(r => r.length));
}
function tirar(x, slug) {
  for (const r of x.linhas) for (const col of r) { const i = col.indexOf(slug); if (i >= 0) col.splice(i, 1); }
}
const acharBloco = (x, slug) => {
  for (let r = 0; r < x.linhas.length; r++) for (let c = 0; c < x.linhas[r].length; c++) {
    const i = x.linhas[r][c].indexOf(slug);
    if (i >= 0) return { r, c, i };
  }
  return null;
};
// Ocultar tira o bloco da página e o põe no fim dos ocultos; Mostrar o devolve ao fim da página, numa linha só dele.
function ocultar(x, slug) {
  if (!acharBloco(x, slug)) return;
  tirar(x, slug);
  arrumar(x);
  x.ocultos.push(slug);
}
function mostrar(x, slug) {
  const i = x.ocultos.indexOf(slug);
  if (i < 0) return;
  x.ocultos.splice(i, 1);
  x.linhas.push([[slug]]);
}
// Teclado, com a alça em foco:
//  cima/baixo   troca de lugar com o vizinho da coluna; na ponta da coluna, um bloco sozinho na linha troca a linha de lugar e os
//               demais saem para uma linha própria (acima ou abaixo);
//  esq./dir.    troca a coluna de lugar (coluna de um bloco só) ou passa o bloco para a coluna vizinha (ou para uma coluna nova na
//               ponta, se couber);
//  Alt + cima/baixo   une o bloco à linha vizinha, como coluna nova na ponta, se couber.
function mover(x, slug, tecla, unir) {
  const p = acharBloco(x, slug);
  if (!p) return;
  const linha = x.linhas[p.r], col = linha[p.c];
  if (tecla === 'ArrowLeft' || tecla === 'ArrowRight') {
    const d = tecla === 'ArrowLeft' ? -1 : 1, viz = linha[p.c + d];
    if (viz && col.length === 1) [linha[p.c], linha[p.c + d]] = [viz, col];
    else if (viz) { col.splice(p.i, 1); viz.splice(Math.min(p.i, viz.length), 0, slug); }
    else if (col.length > 1 && linha.length < MAX_LINHA) { col.splice(p.i, 1); linha.splice(d < 0 ? p.c : p.c + 1, 0, [slug]); }
    arrumar(x);
    return;
  }
  const d = tecla === 'ArrowUp' ? -1 : 1;
  const vizinha = x.linhas[p.r + d];
  if (unir) {
    if (!vizinha || vizinha.length >= MAX_LINHA) return;
    col.splice(p.i, 1);
    if (d < 0) vizinha.push([slug]); else vizinha.unshift([slug]);
  } else if (col[p.i + d]) {
    [col[p.i], col[p.i + d]] = [col[p.i + d], col[p.i]];
  } else if (linha.length === 1 && col.length === 1) {
    if (!vizinha) return;
    x.linhas[p.r] = vizinha;
    x.linhas[p.r + d] = linha;
  } else {
    col.splice(p.i, 1);
    x.linhas.splice(d < 0 ? p.r : p.r + 1, 0, [[slug]]);
  }
  arrumar(x);
}
function el(tag, props, ...filhos) {
  const e = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'dataset') Object.assign(e.dataset, props[k]);
    else if (k === 'role') e.setAttribute('role', props[k]);
    else e[k] = props[k];
  }
  for (const f of filhos) if (f != null) e.append(f);
  return e;
}
const SVG_ENGRENAGEM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const SVG_ATUALIZAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.5-6.3L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.3L21 16"/><path d="M21 21v-5h-5"/></svg>';
const ICONE_LUGAR = (miolo) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + miolo + '</svg>';
const ICONE_OCULTAR = ICONE_LUGAR('<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.4A9.7 9.7 0 0 1 12 5c4 0 7.3 2.4 9 7a13 13 0 0 1-2.4 3.6M6.6 6.6A13 13 0 0 0 3 12c1.7 4.6 5 7 9 7a9.7 9.7 0 0 0 4-.9"/>');
const ICONE_MOSTRAR = ICONE_LUGAR('<circle cx="12" cy="12" r="3"/><path d="M21 12c-2.7 4.7-6 7-9 7s-6.3-2.3-9-7c2.7-4.7 6-7 9-7s6.3 2.3 9 7z"/>');
const ICONE_DIVIDIR = ICONE_LUGAR('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16" stroke-dasharray="2 2"/><path d="M5.5 9h4M5.5 12h4M5.5 15h4M14.5 9h4M14.5 12h4M14.5 15h4"/>');
const SVG_ALCA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SVG_SETA = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// Coluna das contagens (última célula das linhas de dados): mesma largura em todos os blocos, para os números alinharem.
const LARGURA_CONTAGEM = 84;
const CSS_UI = `
#divPainel table.infraTable>tbody>tr>td:last-child:not(:first-child){width:${LARGURA_CONTAGEM}px!important;min-width:${LARGURA_CONTAGEM}px!important;max-width:${LARGURA_CONTAGEM}px!important;white-space:nowrap;box-sizing:border-box}
#sp-pl-acoes{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:12px}
#sp-pl-status{font-size:13px;color:#495057}
.sp-pl-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;padding:0 10px;margin:0;font:13px/1 Roboto,Arial,sans-serif;color:#212529;background:#fff;border:1px solid #ced4da;border-radius:4px;cursor:pointer}
.sp-pl-btn:hover:not(:disabled){background:#f1f3f5}
.sp-pl-btn:disabled{opacity:.55;cursor:default}
.sp-pl-btn[aria-pressed="true"]{background:#e7f3f8;border-color:#0b6e99;color:#0b5576}
.sp-pl-btn.sp-pl-perigo{color:#a32d2d;border-color:#d9a3a3}
.sp-pl-btn:focus-visible{outline:2px solid #0b6e99;outline-offset:2px}
#sp-pl-painel{position:absolute;top:100%;right:0;z-index:1050;box-sizing:border-box;width:min(600px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;padding:16px;font:13px/1.4 Roboto,Arial,sans-serif;color:#212529;background:#fff;border:1px solid #adb5bd;border-radius:8px}
#sp-pl-painel *{box-sizing:border-box}
#sp-pl-painel h2{margin:0;font-size:16px;font-weight:500}
#sp-pl-painel h3{margin:16px 0 6px;font-size:12px;font-weight:500;color:#495057}
#sp-pl-painel ul{list-style:none;margin:0;padding:0}
.sp-pl-topo-painel{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sp-pl-linha{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid #e9ecef}
.sp-pl-nome{flex:1;min-width:0;overflow-wrap:anywhere}
.sp-pl-linha .sp-pl-btn,.sp-pl-chip .sp-pl-btn{height:30px;min-width:30px;padding:0 6px}
.sp-pl-linha .sp-pl-btn svg,.sp-pl-chip .sp-pl-btn svg{display:block}
.sp-pl-linhas{margin:0;padding:0}
.sp-pl-entre{height:14px;margin:0;position:relative}
.sp-pl-entre::after{content:"";position:absolute;left:0;right:0;top:50%;height:3px;margin-top:-1.5px;border-radius:2px;background:transparent}
.sp-pl-entre.sp-pl-sobre::after{background:#0b6e99}
.sp-pl-lin{display:flex;gap:3px;align-items:stretch;margin:0}
.sp-pl-lin>.sp-pl-colcfg{align-self:flex-start}
.sp-pl-vaga{flex:none;width:0;border-radius:4px}
#sp-pl-painel.sp-pl-em-arraste .sp-pl-vaga{width:18px;border:1px dashed #adb5bd;background:#f8f9fa}
#sp-pl-painel.sp-pl-em-arraste .sp-pl-vaga.sp-pl-sobre{border:1px solid #0b6e99;background:#0b6e99}
.sp-pl-colcfg{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px}
.sp-pl-chip{display:flex;flex-direction:column;gap:4px;padding:6px;border:1px solid #ced4da;border-radius:6px;background:#fff}
.sp-pl-chip-topo{display:flex;align-items:flex-start;gap:2px}
.sp-pl-chip-topo .sp-pl-nome{padding-top:6px}
.sp-pl-chip-acoes{display:flex;gap:4px}
.sp-pl-partes{font:500 12px/1 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
.sp-pl-chip.sp-pl-sobre-cima{box-shadow:0 -4px 0 #0b6e99}
.sp-pl-chip.sp-pl-sobre-baixo{box-shadow:0 4px 0 #0b6e99}
.sp-pl-dica{margin:8px 0 6px;font-size:12px;color:#6c757d}
.sp-pl-oculta{color:#6c757d}
.sp-pl-vazio{padding:6px 0;color:#6c757d}
.sp-pl-cab{display:none!important}
.sp-pl-na-legenda{margin-left:6px;vertical-align:middle;cursor:pointer}
.sp-pl-na-legenda img{width:auto!important;height:16px!important;vertical-align:middle}
.sp-pl-alca{display:flex;flex:none;align-items:center;justify-content:center;width:18px;height:30px;color:#868e96;cursor:grab}
.sp-pl-alca:active{cursor:grabbing}
.sp-pl-alca:focus-visible{outline:2px solid #0b6e99;outline-offset:1px;border-radius:2px}
.sp-pl-arrastando{opacity:.45}
.sp-pl-sobre-cima{box-shadow:inset 0 2px 0 #0b6e99}
.sp-pl-sobre-baixo{box-shadow:inset 0 -2px 0 #0b6e99}
.sp-pl-rodape{display:flex;gap:8px;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid #dee2e6}
#divPainel.sp-pl-ativo{display:flex!important;flex-direction:column;gap:15px}
#divPainel.sp-pl-ativo>br{display:none!important}
#divPainel.sp-pl-ativo fieldset{margin:0!important;width:100%!important;box-sizing:border-box}
#sp-pl-fluxo,#sp-pl-ocultos-corpo{display:flex;flex-direction:column;gap:15px}
.sp-pl-faixa{display:flex;align-items:flex-start;gap:15px}
.sp-pl-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:15px}
#sp-pl-ocultos[hidden],#sp-pl-ocultos-corpo[hidden]{display:none}
#sp-pl-ocultos{border:1px dashed #adb5bd;border-radius:4px;background:#f8f9fa}
#sp-pl-oc-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:40px;padding:0 14px;font:500 13px Roboto,Arial,sans-serif;color:#212529;background:none;border:0;cursor:pointer}
#sp-pl-oc-toggle:focus-visible{outline:2px solid #0b6e99;outline-offset:-2px}
#sp-pl-oc-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
#sp-pl-ocultos-corpo{padding:0 14px 14px}
#divPainel .sp-pl-dividida{display:flex!important;align-items:flex-start;gap:var(--sp-pl-vao-div,15px);width:100%!important;overflow:visible!important}
#divPainel .sp-pl-dividida>table{flex:1 1 0;min-width:0;width:auto!important;margin:0!important}
@media (max-width:900px){.sp-pl-faixa{flex-direction:column;align-items:stretch}#divPainel .sp-pl-dividida{flex-direction:column!important;align-items:stretch;gap:15px}#divPainel .sp-pl-dividida>table{flex:none}}
@media (prefers-reduced-motion:no-preference){#sp-pl-oc-toggle svg{transition:transform .15s ease-out}}
`;

// ---- Estrutura (só criada quando há configuração) ----
let fluxoEl = null, ocultosEl = null, ocultosCorpo = null, ocultosNum = null, ocultosAberto = false;
function garantirEstrutura() {
  if (fluxoEl) return;
  raiz.classList.add('sp-pl-ativo');
  fluxoEl = el('div', { id: 'sp-pl-fluxo' });
  ocultosNum = el('span', null, '0');
  const alternar = el('button', { type: 'button', id: 'sp-pl-oc-toggle' }, el('span', null, 'Ocultos (', ocultosNum, ')'));
  alternar.insertAdjacentHTML('beforeend', SVG_SETA);
  alternar.setAttribute('aria-expanded', 'false');
  alternar.setAttribute('aria-controls', 'sp-pl-ocultos-corpo');
  ocultosCorpo = el('div', { id: 'sp-pl-ocultos-corpo', hidden: true });
  alternar.addEventListener('click', () => {
    ocultosAberto = !ocultosAberto;
    ocultosCorpo.hidden = !ocultosAberto;
    alternar.setAttribute('aria-expanded', String(ocultosAberto));
  });
  ocultosEl = el('section', { id: 'sp-pl-ocultos', hidden: true }, alternar, ocultosCorpo);
  raiz.append(fluxoEl, ocultosEl);
}
// A lista é a página: centralizado ocupa a linha toda e separa os trechos; esquerda e direita seguidas formam uma faixa de
// duas colunas independentes (cada coluna empilha os seus blocos na ordem da lista, sem linhas alinhadas entre si).
// Reparte as linhas de dados de cada tabela do bloco em n partes lado a lado (n = 0 desliga). As linhas são movidas, não copiadas,
// e voltam ao desligar; o cabeçalho fica na primeira parte. As primeiras partes levam a sobra (11 linhas em 3 = 4, 4, 3), e nenhuma
// tabela se reparte em mais partes do que tem linhas de dados.
function desfazerDivisao(b) {
  for (const { t, partes, caixa } of b.divididas.feitas) {
    const corpo = t.tBodies[0];
    for (const p of partes) for (const r of [...p.rows]) corpo.append(r);
    t.querySelector(':scope > colgroup[data-sp-cg]')?.remove();
    t.style.tableLayout = '';
    caixa.replaceWith(t);
  }
  b.divididas = null;
}
function ajustarDivisao(b, n) {
  if ((b.divididas ? b.divididas.n : 0) === n) return;
  if (b.divididas) desfazerDivisao(b);
  if (!n) return;
  const feitas = [];
  const tabelas = [...b.el.querySelectorAll('table')].filter(t => t.closest('fieldset') === b.el && !t.parentElement.closest('table'));
  for (const t of tabelas) {
    const corpo = t.tBodies[0];
    if (!corpo) continue;
    const dados = [...corpo.rows].filter(r => r.querySelector(':scope > td'));
    const k = Math.min(n, dados.length);
    if (k < 2) continue;
    // Mesmas larguras de coluna em todas as partes (medidas antes de mover), para os valores ficarem alinhados.
    const celulas = [...dados[0].cells];
    const larg = celulas.map(c => c.getBoundingClientRect().width);
    const soma = larg.reduce((a, w) => a + w, 0);
    const colunas = soma > 0 && celulas.every(c => c.colSpan === 1);
    const base = Math.floor(dados.length / k), sobra = dados.length % k;
    const partes = [];
    let pos = base + (sobra > 0 ? 1 : 0); // a 1ª parte é a própria tabela, com as primeiras linhas
    for (let p = 1; p < k; p++) {
      const tp = document.createElement('table');
      for (const a of t.attributes) if (a.name !== 'id') tp.setAttribute(a.name, a.value);
      tp.dataset.spMetade = '1';
      const cp = tp.createTBody();
      const tam = base + (p < sobra ? 1 : 0);
      for (const r of dados.slice(pos, pos + tam)) cp.append(r);
      pos += tam;
      partes.push(tp);
    }
    const caixa = el('div', { className: 'sp-pl-dividida' });
    // O vão entre as partes é o vão entre colunas (15 px) mais o recuo interno dos dois quadros (padding + borda de cada lado).
    // Em 2 partes, a 1ª termina onde termina a tabela da coluna esquerda e a 2ª começa onde começa a da direita.
    const estilo = getComputedStyle(b.el);
    const recuo = (parseFloat(estilo.paddingRight) || 0) + (parseFloat(estilo.borderRightWidth) || 0) +
      (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.borderLeftWidth) || 0);
    caixa.style.setProperty('--sp-pl-vao-div', (15 + recuo) + 'px');
    t.replaceWith(caixa);
    caixa.append(t, ...partes);
    if (colunas) {
      for (const tab of [t, ...partes]) {
        const cg = el('colgroup', { dataset: { spCg: '1' } });
        // A última coluna (contagem) tem a largura fixa dos outros blocos; as demais repartem o resto na proporção medida.
        const resto = larg.slice(0, -1).reduce((a, w) => a + w, 0);
        larg.forEach((w, i) => {
          const c = document.createElement('col');
          if (i === larg.length - 1) c.style.width = LARGURA_CONTAGEM + 'px';
          else if (larg.length > 2 && resto > 0) c.style.width = 'calc((100% - ' + LARGURA_CONTAGEM + 'px) * ' + (w / resto).toFixed(4) + ')';
          cg.append(c);
        });
        tab.insertBefore(cg, tab.firstChild);
        tab.style.tableLayout = 'fixed';
      }
    }
    feitas.push({ t, partes, caixa });
  }
  b.divididas = feitas.length ? { n, feitas } : null;
}
// Quantas partes a tabela do bloco pode ter onde ele está: sozinho na linha (ou oculto) até MAX_PARTES; numa linha de 2 colunas
// (meio a meio) até 2; numa linha de 3 ou 4 colunas não divide. O número escolhido fica guardado: se o bloco voltar a ter espaço,
// a divisão maior volta junto.
function limiteDivisao(cfg, slug) {
  if (cfg.ocultos.includes(slug)) return MAX_PARTES;
  const r = cfg.linhas.find(l => l.some(col => col.includes(slug)));
  return !r ? 0 : r.length === 1 ? MAX_PARTES : r.length === 2 ? 2 : 0;
}
function aplicar(cfg) {
  garantirEstrutura();
  for (const b of blocos) ajustarDivisao(b, Math.min(cfg.dividir[b.slug] || 0, limiteDivisao(cfg, b.slug)));
  // Bloco sozinho na linha ocupa a linha toda; com mais colunas, a linha é uma faixa de colunas iguais, cada uma empilhando os seus blocos.
  const monta = (linhas, destino) => destino.replaceChildren(...linhas.map(r => (r.length === 1 && r[0].length === 1
    ? porSlug[r[0][0]].el
    : el('div', { className: 'sp-pl-faixa' }, ...r.map(col => el('div', { className: 'sp-pl-col' }, ...col.map(s => porSlug[s].el)))))));
  monta(cfg.linhas, fluxoEl);
  monta(cfg.ocultos.map(s => [[s]]), ocultosCorpo); // ocultos: um por linha, na ordem própria deles
  ocultosNum.textContent = String(cfg.ocultos.length);
  ocultosEl.hidden = !cfg.ocultos.length;
}
// ---- Atualizar tudo: fila curta, só no clique ----
// A página já conta Minutas e Meus Localizadores ao carregar; este botão refaz as contagens dos blocos visíveis (os ocultos não).
const MESTRES = ['#atualizaRelatoriosTodas', '#atualizaMinutasTodas', '#atualizaMeusLocalizadoresTodas', '#atualizarListaDeProcessosPorLocalizadorTodas'];
const FUNCAO_CONTAGEM = /^\s*(?:return\s+)?(?:window\.)?(?:contar?|atualizar?)(?:relat[oó]rios?|minutas?|(?:meus)?localizadores?|(?:listade)?processos)[\w$]*\s*\(/i;
const ROTULO_CONTAGEM = /^(?:clique (?:aqui )?para )?(?:atualizar|recontar)(?:\s+(?:(?:a|as|o|os|todos|todas)\s+)*(?:contagem|contador|quantidade|total|relat[oó]rios?|minutas?|(?:meus\s+)?localizadores?|processos)\b|\s+(?:todos|todas)$|$)/i;
function ehControleDeAtualizacao(c) {
  const href = c.getAttribute('href')?.trim() || '';
  if (href && !href.startsWith('#') && !/^javascript:/i.test(href)) return false;
  if (FUNCAO_CONTAGEM.test(c.getAttribute('onclick') || href.replace(/^javascript:/i, ''))) return true;
  return [c, ...c.querySelectorAll('img')].some(x => ['title', 'aria-label', 'alt'].some(a => ROTULO_CONTAGEM.test(x.getAttribute(a)?.trim() || '')));
}
const tabelaDe = (e) => { const t = e.closest('table'); return t && t.dataset.spMetade ? t.parentElement.firstElementChild : t; };
function controlesDeAtualizacao(visiveis) {
  const dentro = new Set(visiveis);
  const mestres = MESTRES.flatMap(s => [...document.querySelectorAll(s)]).filter(e => dentro.has(e.closest('fieldset')));
  const controles = new Set(mestres);
  for (const bloco of visiveis) {
    const mestresDoBloco = mestres.filter(e => e.closest('fieldset') === bloco);
    if (mestresDoBloco.some(e => !tabelaDe(e))) continue;
    const alternativas = new Set([...bloco.querySelectorAll('a, button, input[type="button"], [role="button"], [onclick]')]
      .filter(e => e.closest('fieldset') === bloco && ehControleDeAtualizacao(e)));
    for (const e of alternativas) for (let p = e.parentElement; p && p !== bloco; p = p.parentElement) alternativas.delete(p);
    const daLegenda = [...alternativas].filter(e => e.closest('legend'));
    if (daLegenda.length && !mestresDoBloco.length) { daLegenda.forEach(e => controles.add(e)); continue; }
    const comMestre = new Set(mestresDoBloco.map(tabelaDe));
    const porTabela = new Map();
    for (const e of alternativas) {
      const t = tabelaDe(e);
      if (!t || comMestre.has(t)) continue;
      if (!porTabela.has(t)) porTabela.set(t, []);
      porTabela.get(t).push(e);
    }
    for (const [t, lista] of porTabela) {
      const mestre = lista.find(e => e.closest('thead') || (e.closest('tr') === t.rows[0] && e.closest('th:not([scope="row"])')));
      if (mestre) controles.add(mestre); else lista.forEach(e => controles.add(e));
    }
  }
  return [...controles];
}
// Esconde as linhas de cabeçalho de todas as tabelas do painel; o controle de atualizar que estava no cabeçalho vai para o lado do
// título do bloco (a legenda). O elemento é movido, não copiado: id e clique continuam os do eproc. "Restaurar original" recarrega a página.
function semCabecalhos() {
  for (const b of blocos) {
    const legenda = b.el.querySelector(':scope > legend');
    for (const t of b.el.querySelectorAll('table')) {
      if (t.closest('fieldset') !== b.el || t.parentElement.closest('table')) continue;
      const cab = [...t.rows].filter(r => !r.querySelector(':scope > td'));
      if (!cab.length) continue;
      if (legenda) {
        const achados = new Set(cab.flatMap(r => [...r.querySelectorAll('a, button, input[type="button"], [role="button"], [onclick]')])
          .filter(e => MESTRES.some(m => e.matches(m)) || ehControleDeAtualizacao(e)));
        for (const e of achados) for (let p = e.parentElement; p; p = p.parentElement) achados.delete(p);
        for (const e of achados) { e.classList.add('sp-pl-na-legenda'); legenda.append(e); }
      }
      cab.forEach(r => r.classList.add('sp-pl-cab'));
    }
  }
}
let emFila = false;
const pausa = (ms) => new Promise(ok => setTimeout(ok, ms));
async function atualizarTudo(botao, status, visiveis) {
  if (emFila) return;
  emFila = true;
  botao.disabled = true;
  const controles = controlesDeAtualizacao(visiveis);
  if (!controles.length) { status.textContent = 'Nenhuma contagem para atualizar.'; botao.disabled = false; emFila = false; return; }
  // O Relatório Geral refaz as contagens com chamadas síncronas, que congelam a página por alguns segundos (medido: 2 a 3 s).
  // Ele vai por último, para as outras contagens já estarem a caminho, e o aviso é pintado antes do primeiro clique.
  const pesado = (c) => c.closest('fieldset')?.id === 'fldRelatorioGeral';
  controles.sort((a, b) => Number(pesado(a)) - Number(pesado(b)));
  status.textContent = 'Atualizando ' + controles.length + (controles.length === 1 ? ' contagem…' : ' contagens…');
  // Dá um quadro para o aviso aparecer; o teto evita prender a fila se a página estiver oculta (lá o quadro nunca vem).
  await new Promise(ok => { requestAnimationFrame(() => setTimeout(ok, 0)); setTimeout(ok, 150); });
  // A página não avisa quando termina: considera pronto quando as respostas deixam de chegar (observador só durante a fila).
  let ultima = Date.now();
  let observador = null;
  try {
    observador = new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch') ultima = Date.now(); });
    observador.observe({ type: 'resource' });
  } catch (_) { observador = null; }
  for (const c of controles) { try { if (c.isConnected) c.click(); } catch (_) { /* controle removido */ } }
  ultima = Date.now(); // o clique do Relatório Geral pode ter segurado a página por segundos: a espera conta a partir daqui
  const limite = Date.now() + 20000;
  while (Date.now() - ultima < 900 && Date.now() < limite) await pausa(100);
  if (observador) observador.disconnect();
  status.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  botao.disabled = false;
  emFila = false;
}

// ---- Engrenagem e painel de configuração (montado no clique, removido ao fechar) ----
let cfgAtual = null;      // configuração em edição; null = página nativa, ainda sem nada salvo
let painelEl = null, engrenagem = null, barra = null;
const cfgBase = () => normalizar({ v: 5, linhas: blocos.map(b => [[b.slug]]), ocultos: [], dividir: {} });
const visiveisAgora = () => blocos.filter(b => !cfgAtual || !cfgAtual.ocultos.includes(b.slug)).map(b => b.el);

function mudar(fn) {
  const c = cfgAtual ? JSON.parse(JSON.stringify(cfgAtual)) : cfgBase();
  fn(c);
  cfgAtual = normalizar(c);
  salvar(cfgAtual);
  aplicar(cfgAtual);
  renderPainel();
}
let confirmandoRestaurar = false;
let arrastando = null; // { slug, chave } do bloco arrastado; só solta na mesma lista (linhas ou ocultos)
function renderPainel() {
  if (!painelEl) return;
  const c = cfgAtual || cfgBase();
  const foco = document.activeElement && painelEl.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const rolagem = painelEl.scrollTop;
  painelEl.replaceChildren();

  const fechar = el('button', { type: 'button', className: 'sp-pl-btn', title: 'Fechar (Esc)', textContent: '×', dataset: { k: 'fechar' } });
  fechar.setAttribute('aria-label', 'Fechar o painel de organização');
  fechar.addEventListener('click', fecharPainel);
  painelEl.append(el('div', { className: 'sp-pl-topo-painel' }, el('h2', { id: 'sp-pl-titulo' }, 'Organizar o painel'), fechar));

  painelEl.append(el('p', { className: 'sp-pl-dica' }, 'Arraste um bloco pela alça. Solte entre duas linhas para ele ocupar uma linha inteira. Solte sobre outro bloco para empilhar acima ou abaixo dele, na mesma coluna. Para uma coluna nova, solte numa das vagas tracejadas que aparecem nas pontas e entre as colunas durante o arraste (até ' + MAX_LINHA + ' por linha). A barra azul mostra onde ele vai cair. Com a alça em foco, use as setas; Alt + seta para cima ou para baixo une à linha vizinha. Dividir reparte a tabela do bloco em partes lado a lado (cada clique avança e, no fim, desfaz): até 4 sozinho na linha, até 2 meio a meio; com 3 ou 4 colunas não divide. Ocultos ficam no fim da página.'));

  const limpar = () => {
    if (!painelEl) return;
    painelEl.classList.remove('sp-pl-em-arraste');
    painelEl.querySelectorAll('.sp-pl-sobre, .sp-pl-sobre-cima, .sp-pl-sobre-baixo, .sp-pl-arrastando')
      .forEach(n => n.classList.remove('sp-pl-sobre', 'sp-pl-sobre-cima', 'sp-pl-sobre-baixo', 'sp-pl-arrastando'));
  };
  const alcaDe = (slug, chave, titulo) => {
    const alca = el('span', { className: 'sp-pl-alca', tabIndex: 0, role: 'button', title: 'Arrastar para mudar a posição (ou setas do teclado)', dataset: { k: 'a' + slug } });
    alca.setAttribute('aria-label', 'Mover ' + titulo + (chave === 'linhas' ? ' (setas; Alt + seta para cima ou para baixo une à linha vizinha)' : ' (setas para cima e para baixo)'));
    alca.insertAdjacentHTML('beforeend', SVG_ALCA);
    alca.draggable = true;
    return alca;
  };
  const botaoVisibilidade = (slug, ehOculto) => {
    const b = el('button', { type: 'button', className: 'sp-pl-btn', title: ehOculto ? 'Mostrar na página' : 'Ocultar', dataset: { k: 'o' + slug } });
    b.insertAdjacentHTML('beforeend', ehOculto ? ICONE_MOSTRAR : ICONE_OCULTAR);
    b.setAttribute('aria-label', (ehOculto ? 'Mostrar' : 'Ocultar') + ': ' + porSlug[slug].titulo);
    b.addEventListener('click', () => mudar(x => (ehOculto ? mostrar(x, slug) : ocultar(x, slug))));
    return b;
  };
  // Alterna desligado → 2 → … → limite → desligado (limite: 4 sozinho na linha, 2 meio a meio, sem divisão com 3 ou 4 colunas);
  // o número de partes em vigor aparece no próprio botão.
  const botaoDividir = (slug) => {
    const lim = limiteDivisao(c, slug), pode = lim >= 2;
    const n = Math.min(c.dividir[slug] || 0, lim), prox = n >= lim ? 0 : Math.max(2, n + 1);
    const titulo = !pode ? 'Numa linha com 3 ou 4 colunas o bloco não se divide'
      : (n ? 'Dividido em ' + n + ' partes. ' : '') + (prox ? 'Clique para dividir em ' + prox + ' partes' : 'Clique para desfazer a divisão');
    const b = el('button', { type: 'button', className: 'sp-pl-btn', title: titulo, disabled: !pode, dataset: { k: 'v' + slug } });
    b.insertAdjacentHTML('beforeend', ICONE_DIVIDIR);
    if (n) b.append(el('span', { className: 'sp-pl-partes' }, n + '×'));
    b.setAttribute('aria-label', 'Dividir em partes: ' + porSlug[slug].titulo + (n ? ' (' + n + ' partes)' : ''));
    b.setAttribute('aria-pressed', String(!!n));
    b.addEventListener('click', () => mudar(x => { if (prox) x.dividir[slug] = prox; else delete x.dividir[slug]; }));
    return b;
  };

  // ---- Na página: linhas de até MAX_LINHA colunas, cada coluna com um ou mais blocos empilhados; entre as linhas (e antes da
  // primeira e depois da última) há faixas de soltura ----
  const total = c.linhas.reduce((n, r) => n + r.reduce((m, col) => m + col.length, 0), 0);
  painelEl.append(el('h3', null, 'Na página (' + total + ')'));
  const ul = el('ul', { className: 'sp-pl-linhas' });
  ul.setAttribute('aria-label', 'Na página');
  const soltar = (origem, aplicarNoCfg) => { arrastando = null; painelEl.classList.remove('sp-pl-em-arraste'); mudar(x => { tirar(x, origem); aplicarNoCfg(x); arrumar(x); }); };
  const zona = (idx) => {
    const z = el('li', { className: 'sp-pl-entre' });
    z.setAttribute('aria-hidden', 'true');
    z.addEventListener('dragover', (e) => {
      if (!arrastando || arrastando.chave !== 'linhas') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      z.classList.add('sp-pl-sobre');
    });
    z.addEventListener('dragleave', () => z.classList.remove('sp-pl-sobre'));
    z.addEventListener('drop', (e) => {
      if (!arrastando || arrastando.chave !== 'linhas') return;
      e.preventDefault();
      // O índice vale antes da retirada: a linha de origem, se esvaziar, só some depois (arrumar).
      const origem = arrastando.slug;
      soltar(origem, x => x.linhas.splice(idx, 0, [[origem]]));
    });
    return z;
  };
  // Vaga de coluna nova: nas pontas e entre as colunas de cada linha. Fica recolhida e só abre durante o arraste (classe
  // sp-pl-em-arraste no painel). Recusa se a linha já tem MAX_LINHA colunas, salvo quando o bloco arrastado é sozinho numa coluna dela.
  const vaga = (rIdx, cIdx, r) => {
    const v = el('div', { className: 'sp-pl-vaga', title: 'Nova coluna aqui' });
    v.setAttribute('aria-hidden', 'true');
    const aceita = () => arrastando && arrastando.chave === 'linhas' &&
      (r.length < MAX_LINHA || r.some(col => col.length === 1 && col[0] === arrastando.slug));
    v.addEventListener('dragover', (e) => {
      if (!aceita()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      v.classList.add('sp-pl-sobre');
    });
    v.addEventListener('dragleave', () => v.classList.remove('sp-pl-sobre'));
    v.addEventListener('drop', (e) => {
      if (!aceita()) return;
      e.preventDefault();
      const origem = arrastando.slug;
      // Índices de antes da retirada: a coluna de origem, se esvaziar, só some depois (arrumar).
      soltar(origem, x => x.linhas[rIdx].splice(cIdx, 0, [origem]));
    });
    return v;
  };
  const MODOS_SOBRE = ['cima', 'baixo'];
  const chip = (slug) => {
    const bloco = porSlug[slug];
    const alca = alcaDe(slug, 'linhas', bloco.titulo);
    const cel = el('div', { className: 'sp-pl-chip' },
      el('div', { className: 'sp-pl-chip-topo' }, alca, el('span', { className: 'sp-pl-nome' }, bloco.titulo)),
      el('div', { className: 'sp-pl-chip-acoes' }, botaoVisibilidade(slug, false), botaoDividir(slug)));
    alca.addEventListener('keydown', (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      mudar(x => mover(x, slug, e.key, e.altKey));
    });
    alca.addEventListener('dragstart', (e) => {
      arrastando = { slug, chave: 'linhas' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', slug);
      try { e.dataTransfer.setDragImage(cel, 12, 12); } catch (_) { /* sem imagem própria: vale a da alça */ }
      cel.classList.add('sp-pl-arrastando');
      // Abre as vagas de coluna depois do início do arraste: mexer no layout dentro do dragstart cancela o arraste no Chromium.
      setTimeout(() => { if (arrastando && painelEl) painelEl.classList.add('sp-pl-em-arraste'); }, 0);
    });
    alca.addEventListener('dragend', () => { arrastando = null; limpar(); });
    // Sobre outro bloco só se empilha: metade de cima = acima dele, metade de baixo = abaixo, na mesma coluna. Coluna nova é
    // pelas vagas (pontas e entre colunas), para a posição da alça não decidir o lado sem querer.
    const regiao = (e) => { const r = cel.getBoundingClientRect(); return e.clientY - r.top < r.height / 2 ? 'cima' : 'baixo'; };
    const aceita = () => arrastando && arrastando.chave === 'linhas' && arrastando.slug !== slug;
    cel.addEventListener('dragover', (e) => {
      const modo = regiao(e);
      MODOS_SOBRE.forEach(m => cel.classList.toggle('sp-pl-sobre-' + m, m === modo && !!aceita(modo)));
      if (!aceita(modo)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    cel.addEventListener('dragleave', () => MODOS_SOBRE.forEach(m => cel.classList.remove('sp-pl-sobre-' + m)));
    cel.addEventListener('drop', (e) => {
      const modo = regiao(e);
      if (!aceita(modo)) return;
      e.preventDefault();
      const origem = arrastando.slug;
      soltar(origem, x => {
        const p = acharBloco(x, slug);
        x.linhas[p.r][p.c].splice(modo === 'cima' ? p.i : p.i + 1, 0, origem);
      });
    });
    return cel;
  };
  if (!c.linhas.length) ul.append(el('li', { className: 'sp-pl-vazio' }, 'Nenhum bloco na página.'));
  c.linhas.forEach((r, idx) => {
    ul.append(zona(idx));
    const partes = [vaga(idx, 0, r)];
    r.forEach((col, ci) => partes.push(el('div', { className: 'sp-pl-colcfg' }, ...col.map(slug => chip(slug))), vaga(idx, ci + 1, r)));
    const linha = el('li', { className: 'sp-pl-lin', role: 'group' }, ...partes);
    linha.setAttribute('aria-label', 'Linha ' + (idx + 1));
    ul.append(linha);
  });
  ul.append(zona(c.linhas.length));
  painelEl.append(ul);

  // ---- Ocultos: lista simples, um por linha; arrastar muda a ordem entre eles ----
  painelEl.append(el('h3', null, 'Ocultos (' + c.ocultos.length + ')'));
  const ulO = el('ul');
  ulO.setAttribute('aria-label', 'Ocultos');
  if (!c.ocultos.length) ulO.append(el('li', { className: 'sp-pl-vazio' }, 'Nenhum bloco oculto.'));
  c.ocultos.forEach((slug, i) => {
    const alca = alcaDe(slug, 'ocultos', porSlug[slug].titulo);
    const linha = el('li', { className: 'sp-pl-linha' }, alca, el('span', { className: 'sp-pl-nome sp-pl-oculta' }, porSlug[slug].titulo), botaoVisibilidade(slug, true), botaoDividir(slug));
    alca.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!d) return;
      e.preventDefault();
      if (i + d < 0 || i + d >= c.ocultos.length) return;
      mudar(x => { const o = x.ocultos; [o[i], o[i + d]] = [o[i + d], o[i]]; });
    });
    const depoisDoMeio = (e) => { const r = linha.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    const daLista = () => arrastando && arrastando.chave === 'ocultos' && arrastando.slug !== slug;
    alca.addEventListener('dragstart', (e) => { arrastando = { slug, chave: 'ocultos' }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', slug); linha.classList.add('sp-pl-arrastando'); });
    alca.addEventListener('dragend', () => { arrastando = null; limpar(); });
    linha.addEventListener('dragover', (e) => {
      if (!daLista()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const depois = depoisDoMeio(e);
      linha.classList.toggle('sp-pl-sobre-cima', !depois);
      linha.classList.toggle('sp-pl-sobre-baixo', depois);
    });
    linha.addEventListener('dragleave', () => linha.classList.remove('sp-pl-sobre-cima', 'sp-pl-sobre-baixo'));
    linha.addEventListener('drop', (e) => {
      if (!daLista()) return;
      e.preventDefault();
      const origem = arrastando.slug, depois = depoisDoMeio(e);
      arrastando = null;
      mudar(x => { const o = x.ocultos; o.splice(o.indexOf(origem), 1); let k = o.indexOf(slug); if (depois) k++; o.splice(k, 0, origem); });
    });
    ulO.append(linha);
  });
  painelEl.append(ulO);

  const restaurar = el('button', { type: 'button', className: 'sp-pl-btn sp-pl-perigo', textContent: confirmandoRestaurar ? 'Confirmar: restaurar o original' : 'Restaurar original', dataset: { k: 'restaurar' } });
  restaurar.addEventListener('click', () => {
    if (!confirmandoRestaurar) { confirmandoRestaurar = true; renderPainel(); return; }
    try { localStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE_CSS); } catch (_) { /* nada a apagar */ }
    location.reload();
  });
  const fecharRodape = el('button', { type: 'button', className: 'sp-pl-btn', textContent: 'Fechar' });
  fecharRodape.addEventListener('click', fecharPainel);
  painelEl.append(el('div', { className: 'sp-pl-rodape' }, restaurar, fecharRodape));

  painelEl.scrollTop = rolagem;
  const alvo = foco && painelEl.querySelector('[data-k="' + CSS.escape(foco) + '"]');
  if (alvo && !alvo.disabled) alvo.focus();
}
function abrirPainel() {
  if (painelEl) return;
  confirmandoRestaurar = false;
  painelEl = el('div', { id: 'sp-pl-painel', role: 'dialog' });
  painelEl.setAttribute('aria-labelledby', 'sp-pl-titulo');
  painelEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fecharPainel(); } });
  barra.append(painelEl);
  engrenagem.setAttribute('aria-expanded', 'true');
  renderPainel();
  const primeiro = painelEl.querySelector('button');
  if (primeiro) primeiro.focus();
}
function fecharPainel() {
  if (!painelEl) return;
  painelEl.remove();
  painelEl = null;
  engrenagem.setAttribute('aria-expanded', 'false');
  engrenagem.focus();
}

function instalarUi() {
  const estilo = el('style', { id: 'sp-painel-livre-estilo', textContent: CSS_UI });
  (document.head || document.documentElement).appendChild(estilo);
  barra = document.querySelector('#divInfraBarraLocalizacao > div');
  const status = el('span', { id: 'sp-pl-status', role: 'status' });
  status.setAttribute('aria-live', 'polite');
  const atualizar = el('button', { type: 'button', className: 'sp-pl-btn', id: 'sp-pl-atualizar', title: 'Atualizar as contagens dos blocos visíveis' });
  atualizar.insertAdjacentHTML('beforeend', SVG_ATUALIZAR);
  atualizar.append('Atualizar tudo');
  atualizar.addEventListener('click', () => atualizarTudo(atualizar, status, visiveisAgora()));
  engrenagem = el('button', { type: 'button', className: 'sp-pl-btn', id: 'sp-pl-engrenagem', title: 'Organizar o painel' });
  engrenagem.insertAdjacentHTML('beforeend', SVG_ENGRENAGEM);
  engrenagem.setAttribute('aria-label', 'Organizar o painel');
  engrenagem.setAttribute('aria-haspopup', 'dialog');
  engrenagem.setAttribute('aria-expanded', 'false');
  engrenagem.addEventListener('click', () => (painelEl ? fecharPainel() : abrirPainel()));
  const acoes = el('div', { id: 'sp-pl-acoes' }, status, atualizar, engrenagem);
  if (barra) {
    const ajuda = barra.querySelector('.dropleft');
    if (ajuda) barra.insertBefore(acoes, ajuda); else barra.append(acoes);
  } else {
    // Variante da página sem a barra de título: a engrenagem fica numa linha acima dos blocos.
    barra = el('div', { style: 'position:relative;display:flex;justify-content:flex-end;margin-bottom:8px' }, acoes);
    raiz.parentNode.insertBefore(barra, raiz);
  }
}

// ---- Links do painel na mesma aba ----
// As contagens (que chegam depois, pelo "Atualizar") e os títulos dos blocos são links com target="_blank" ou
// window.open(...). Clique simples abre na própria aba; Ctrl/Shift/clique do meio seguem abrindo em aba nova.
function urlDoWindowOpen(texto) {
  const m = /window\.open\(\s*['"]([^'"]+)['"]/.exec(texto || '');
  return m ? m[1].replace(/&amp;/g, '&') : null;
}
function abrirNaMesmaAba(e) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
  const link = e.target.closest && e.target.closest('a');
  if (!link || !raiz.contains(link)) return;
  const href = link.getAttribute('href') || '';
  let destino = urlDoWindowOpen(link.getAttribute('onclick')) || (href.startsWith('javascript:') ? urlDoWindowOpen(href) : null);
  if (!destino && link.target === '_blank' && href && !href.startsWith('javascript:') && !href.startsWith('#')) destino = link.href;
  if (!destino) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  location.href = new URL(destino, location.href).href;
}
raiz.addEventListener('click', abrirNaMesmaAba, true);

// ---- Execução única ----
instalarUi();
semCabecalhos();
const salva = lerCfg();
if (salva) {
  cfgAtual = normalizar(salva);
  aplicar(cfgAtual);
  // Mantém o CSS inicial em dia com o que a página mostra (blocos novos, ocultos que sumiram).
  salvar(cfgAtual);
}
// Ao abrir o painel, dispara uma vez o "Atualizar tudo" (mesmo caminho do clique; só roda enquanto a fila roda).
// Deixa a página pintar antes, porque o Relatório Geral segura a tela por alguns segundos.
setTimeout(() => {
  const botao = document.getElementById('sp-pl-atualizar');
  if (botao && botao.isConnected && !botao.disabled) botao.click();
}, 300);
