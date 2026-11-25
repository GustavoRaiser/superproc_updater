// Painel livre do navegador SuperPROC (camada: host; mundo isolado, só na tela do painel da secretaria).
//
// Reorganiza os blocos do Painel do Servidor numa lista em ordem, com blocos ocultos e uma engrenagem para configurar.
// A ordem da lista é a ordem na página. Cada bloco escolhe um modo: centralizado (linha inteira), esquerda ou direita.
// Esquerda e direita que ficam um depois do outro se encaixam lado a lado; um centralizado separa os trechos.
// Ocultar é um estado à parte: o bloco guarda o seu modo, vai para o grupo Ocultos (no fim da página), com ordem própria, e só
// volta para o fim da lista de cima por "Mostrar".
// Substitui o antigo módulo painel_principal da extensão (mesma ideia, sem a reconstrução a cada mutação).
//
// REGRA DE VIDA: executa uma vez ao entrar e termina. Nada fica vigiando a página: sem MutationObserver, sem setInterval, sem
// listeners em document/window. Sobram o CSS e os elementos da engrenagem, que morrem junto com o documento. O painel de
// configuração é montado no clique e removido ao fechar; "Atualizar tudo" só usa observador e timers enquanto a fila roda.
//
// Configuração (localStorage da origem do eproc; ver docs/ia/POOL-COMUM.md):
//   superproc_painel_livre_v1      { v:3, ordem:[slug, ...], ocultos:[slug, ...], modo:{ slug: "topo"|"esq"|"dir" },
//                                    dividir:[slug, ...] }   dividir = blocos centralizados cuja tabela se reparte em duas metades
//                                  topo = centralizado. A v2 (modo "oculto" na mesma lista) e a v1 (zonas topo, c1, c2, c3,
//                                  oculto) são aceitas e convertidas na leitura
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
const MODOS = ['topo', 'esq', 'dir'];
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
// Valida e completa: cada bloco conhecido uma vez (na lista de cima ou nos ocultos), com um modo válido. Blocos novos (o tribunal
// pode criar) entram centralizados na lista de cima, logo depois do bloco que os antecede na página original.
function normalizar(c) {
  if (c.v === 1) c = daV2(daV1(c)); else if (c.v === 2) c = daV2(c);
  const vistos = new Set();
  const limpa = (l) => (Array.isArray(l) ? l : []).filter(s => typeof s === 'string' && Object.hasOwn(porSlug, s) && !vistos.has(s) && vistos.add(s));
  const ordem = limpa(c.ordem), ocultos = limpa(c.ocultos);
  blocos.forEach((b, i) => {
    if (vistos.has(b.slug)) return;
    let pos = 0;
    for (let k = i - 1; k >= 0; k--) { const j = ordem.indexOf(blocos[k].slug); if (j >= 0) { pos = j + 1; break; } }
    ordem.splice(pos, 0, b.slug);
    vistos.add(b.slug);
  });
  const origem = c.modo && typeof c.modo === 'object' ? c.modo : {};
  const modo = {};
  for (const s of [...ordem, ...ocultos]) modo[s] = Object.hasOwn(origem, s) && MODOS.includes(origem[s]) ? origem[s] : 'topo';
  const dividir = (Array.isArray(c.dividir) ? c.dividir : []).filter((s, i, l) => typeof s === 'string' && Object.hasOwn(porSlug, s) && l.indexOf(s) === i);
  return { v: 3, ordem, ocultos, modo, dividir };
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
// Ocultar tira o bloco da lista de cima e o põe no fim dos ocultos; Mostrar o devolve ao fim da lista de cima.
function ocultar(x, slug) {
  const i = x.ordem.indexOf(slug);
  if (i < 0) return;
  x.ordem.splice(i, 1);
  x.ocultos.push(slug);
}
function mostrar(x, slug) {
  const i = x.ocultos.indexOf(slug);
  if (i < 0) return;
  x.ocultos.splice(i, 1);
  x.ordem.push(slug);
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
const LUGARES = [
  { modo: 'topo', nome: 'Centralizado', acao: 'Centralizar', icone: ICONE_LUGAR('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none"/>') },
  { modo: 'esq', nome: 'Esquerda', acao: 'Pôr à esquerda', icone: ICONE_LUGAR('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><rect x="5" y="6.5" width="5" height="11" rx="1" fill="currentColor" stroke="none"/>') },
  { modo: 'dir', nome: 'Direita', acao: 'Pôr à direita', icone: ICONE_LUGAR('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><rect x="14" y="6.5" width="5" height="11" rx="1" fill="currentColor" stroke="none"/>') }
];
const SVG_ALCA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const SVG_SETA = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const CSS_UI = `
#sp-pl-acoes{display:flex;align-items:center;gap:8px;margin-left:auto;margin-right:12px}
#sp-pl-status{font-size:13px;color:#495057}
.sp-pl-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;min-width:32px;padding:0 10px;margin:0;font:13px/1 Roboto,Arial,sans-serif;color:#212529;background:#fff;border:1px solid #ced4da;border-radius:4px;cursor:pointer}
.sp-pl-btn:hover:not(:disabled){background:#f1f3f5}
.sp-pl-btn:disabled{opacity:.55;cursor:default}
.sp-pl-btn[aria-pressed="true"]{background:#e7f3f8;border-color:#0b6e99;color:#0b5576}
.sp-pl-btn.sp-pl-perigo{color:#a32d2d;border-color:#d9a3a3}
.sp-pl-btn:focus-visible{outline:2px solid #0b6e99;outline-offset:2px}
#sp-pl-painel{position:absolute;top:100%;right:0;z-index:1050;box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 96px);overflow:auto;padding:16px;font:13px/1.4 Roboto,Arial,sans-serif;color:#212529;background:#fff;border:1px solid #adb5bd;border-radius:8px}
#sp-pl-painel *{box-sizing:border-box}
#sp-pl-painel h2{margin:0;font-size:16px;font-weight:500}
#sp-pl-painel h3{margin:16px 0 6px;font-size:12px;font-weight:500;color:#495057}
#sp-pl-painel ul{list-style:none;margin:0;padding:0}
.sp-pl-topo-painel{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sp-pl-linha{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid #e9ecef}
.sp-pl-nome{flex:1;min-width:0;overflow-wrap:anywhere}
.sp-pl-lugares{display:flex;flex:none;gap:4px}
.sp-pl-lugares+.sp-pl-btn{margin-left:6px}
.sp-pl-linha .sp-pl-btn{height:30px;min-width:30px;padding:0 6px}
.sp-pl-linha .sp-pl-btn svg{display:block}
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
#divPainel .sp-pl-dividida{display:flex!important;align-items:flex-start;gap:15px;width:100%!important;overflow:visible!important}
#divPainel .sp-pl-dividida>table{flex:1 1 0;min-width:0;width:auto!important;margin:0!important}
@media (max-width:900px){.sp-pl-faixa{flex-direction:column;align-items:stretch}#divPainel .sp-pl-dividida{flex-direction:column!important;align-items:stretch}#divPainel .sp-pl-dividida>table{flex:none}}
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
// Reparte as linhas de dados de cada tabela do bloco em duas metades lado a lado. As linhas são movidas, não copiadas, e voltam ao
// desligar; o cabeçalho fica na primeira metade.
function ajustarDivisao(b, ligado) {
  if (ligado === !!b.divididas) return;
  if (!ligado) {
    for (const { t, t2, caixa } of b.divididas) {
      const corpo = t.tBodies[0];
      for (const r of [...t2.rows]) corpo.append(r);
      t.querySelector(':scope > colgroup[data-sp-cg]')?.remove();
      t.style.tableLayout = '';
      caixa.replaceWith(t);
    }
    b.divididas = null;
    return;
  }
  const feitas = [];
  const tabelas = [...b.el.querySelectorAll('table')].filter(t => t.closest('fieldset') === b.el && !t.parentElement.closest('table'));
  for (const t of tabelas) {
    const corpo = t.tBodies[0];
    if (!corpo) continue;
    const dados = [...corpo.rows].filter(r => r.querySelector(':scope > td'));
    if (dados.length < 2) continue;
    // Mesmas larguras de coluna nas duas metades (medidas antes de mover), para os valores ficarem alinhados.
    const celulas = [...dados[0].cells];
    const larg = celulas.map(c => c.getBoundingClientRect().width);
    const soma = larg.reduce((a, n) => a + n, 0);
    const colunas = soma > 0 && celulas.every(c => c.colSpan === 1);
    const t2 = document.createElement('table');
    for (const a of t.attributes) if (a.name !== 'id') t2.setAttribute(a.name, a.value);
    t2.dataset.spMetade = '1';
    const corpo2 = t2.createTBody();
    for (const r of dados.slice(Math.ceil(dados.length / 2))) corpo2.append(r);
    const caixa = el('div', { className: 'sp-pl-dividida' });
    t.replaceWith(caixa);
    caixa.append(t, t2);
    if (colunas) {
      for (const tab of [t, t2]) {
        const cg = el('colgroup', { dataset: { spCg: '1' } });
        for (const w of larg) { const c = document.createElement('col'); c.style.width = (w / soma * 100).toFixed(2) + '%'; cg.append(c); }
        tab.insertBefore(cg, tab.firstChild);
        tab.style.tableLayout = 'fixed';
      }
    }
    feitas.push({ t, t2, caixa });
  }
  b.divididas = feitas.length ? feitas : null;
}
function aplicar(cfg) {
  garantirEstrutura();
  for (const b of blocos) ajustarDivisao(b, cfg.dividir.includes(b.slug) && cfg.modo[b.slug] === 'topo');
  const monta = (lista, destino) => {
    const itens = [];
    let faixa = null;
    for (const slug of lista) {
      const no = porSlug[slug].el, m = cfg.modo[slug];
      if (m === 'topo') { faixa = null; itens.push(no); continue; }
      if (!faixa) { faixa = el('div', { className: 'sp-pl-faixa' }, el('div', { className: 'sp-pl-col' }), el('div', { className: 'sp-pl-col' })); itens.push(faixa); }
      faixa.children[m === 'esq' ? 0 : 1].append(no);
    }
    destino.replaceChildren(...itens);
  };
  monta(cfg.ordem, fluxoEl);
  monta(cfg.ocultos, ocultosCorpo); // os ocultos também respeitam centralizado, esquerda e direita, na ordem própria deles
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
const cfgBase = () => normalizar({ v: 3, ordem: blocos.map(b => b.slug), ocultos: [], modo: {} });
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
let arrastando = null; // { slug, chave } do bloco arrastado; só solta na mesma lista (ordem ou ocultos)
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

  painelEl.append(el('p', { className: 'sp-pl-dica' }, 'A ordem da lista é a ordem na página: arraste pela alça (ou, com ela em foco, use as setas do teclado). Esquerda e direita, um depois do outro, se encaixam lado a lado; centralizado ocupa a linha toda, e Dividir ao meio reparte a tabela em duas metades lado a lado. Os ocultos ficam no fim da página, com ordem própria; Mostrar devolve o bloco ao fim da lista de cima.'));
  const lista = (chave, titulo, vazio) => {
    const itens = c[chave];
    const ehOculto = chave === 'ocultos';
    painelEl.append(el('h3', null, titulo + ' (' + itens.length + ')'));
    const ul = el('ul');
    ul.setAttribute('aria-label', titulo);
    if (!itens.length) ul.append(el('li', { className: 'sp-pl-vazio' }, vazio));
    itens.forEach((slug, i) => {
      const bloco = porSlug[slug];
      const atual = c.modo[slug];
      const lugares = el('div', { className: 'sp-pl-lugares', role: 'group' });
      lugares.setAttribute('aria-label', 'Lugar de ' + bloco.titulo);
      for (const l of LUGARES) {
        const b = el('button', { type: 'button', className: 'sp-pl-btn', title: l.nome, dataset: { k: 'p' + l.modo + slug } });
        b.insertAdjacentHTML('beforeend', l.icone);
        b.setAttribute('aria-label', l.acao + ': ' + bloco.titulo);
        b.setAttribute('aria-pressed', String(l.modo === atual));
        b.addEventListener('click', () => { if (l.modo !== atual) mudar(x => { x.modo[slug] = l.modo; }); });
        lugares.append(b);
      }
      const visibilidade = el('button', { type: 'button', className: 'sp-pl-btn', title: ehOculto ? 'Mostrar na página' : 'Ocultar', dataset: { k: 'o' + slug } });
      visibilidade.insertAdjacentHTML('beforeend', ehOculto ? ICONE_MOSTRAR : ICONE_OCULTAR);
      visibilidade.setAttribute('aria-label', (ehOculto ? 'Mostrar' : 'Ocultar') + ': ' + bloco.titulo);
      visibilidade.addEventListener('click', () => mudar(x => (ehOculto ? mostrar(x, slug) : ocultar(x, slug))));
      lugares.append(visibilidade);
      const dividivel = atual === 'topo';
      const divide = el('button', { type: 'button', className: 'sp-pl-btn', title: dividivel ? 'Dividir ao meio' : 'Só blocos centralizados podem ser divididos', disabled: !dividivel, dataset: { k: 'v' + slug } });
      divide.insertAdjacentHTML('beforeend', ICONE_DIVIDIR);
      divide.setAttribute('aria-label', 'Dividir ao meio: ' + bloco.titulo);
      divide.setAttribute('aria-pressed', String(c.dividir.includes(slug)));
      divide.addEventListener('click', () => mudar(x => { const k = x.dividir.indexOf(slug); if (k >= 0) x.dividir.splice(k, 1); else x.dividir.push(slug); }));
      const alca = el('span', { className: 'sp-pl-alca', tabIndex: 0, role: 'button', title: 'Arrastar para mudar a posição (ou setas do teclado)', dataset: { k: 'a' + slug } });
      alca.setAttribute('aria-label', 'Mover ' + bloco.titulo + ' (setas para cima e para baixo)');
      alca.insertAdjacentHTML('beforeend', SVG_ALCA);
      alca.draggable = true;
      alca.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (!d) return;
        e.preventDefault();
        if (i + d < 0 || i + d >= itens.length) return;
        mudar(x => { const o = x[chave]; [o[i], o[i + d]] = [o[i + d], o[i]]; });
      });
      const linha = el('li', { className: 'sp-pl-linha' }, alca, el('span', { className: 'sp-pl-nome' + (ehOculto ? ' sp-pl-oculta' : '') }, bloco.titulo), lugares, divide);
      const limpar = () => painelEl.querySelectorAll('.sp-pl-sobre-cima, .sp-pl-sobre-baixo, .sp-pl-arrastando').forEach(n => n.classList.remove('sp-pl-sobre-cima', 'sp-pl-sobre-baixo', 'sp-pl-arrastando'));
      const depoisDoMeio = (e) => { const r = linha.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
      const daMesmaLista = () => arrastando && arrastando.chave === chave && arrastando.slug !== slug;
      alca.addEventListener('dragstart', (e) => { arrastando = { slug, chave }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', slug); linha.classList.add('sp-pl-arrastando'); });
      alca.addEventListener('dragend', () => { arrastando = null; limpar(); });
      linha.addEventListener('dragover', (e) => {
        if (!daMesmaLista()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const depois = depoisDoMeio(e);
        linha.classList.toggle('sp-pl-sobre-cima', !depois);
        linha.classList.toggle('sp-pl-sobre-baixo', depois);
      });
      linha.addEventListener('dragleave', () => linha.classList.remove('sp-pl-sobre-cima', 'sp-pl-sobre-baixo'));
      linha.addEventListener('drop', (e) => {
        if (!daMesmaLista()) return;
        e.preventDefault();
        const origem = arrastando.slug, depois = depoisDoMeio(e);
        arrastando = null;
        mudar(x => { const o = x[chave]; o.splice(o.indexOf(origem), 1); let k = o.indexOf(slug); if (depois) k++; o.splice(k, 0, origem); });
      });
      ul.append(linha);
    });
    painelEl.append(ul);
  };
  lista('ordem', 'Na página', '');
  lista('ocultos', 'Ocultos', 'Nenhum bloco oculto.');

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
