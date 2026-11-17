'use strict';
/**
 * Conversor HTML (exportado do Word, como servido pelo normas.leg.br) para Markdown.
 *
 * Porte para JavaScript do módulo `scripts/html2md.py` do projeto ctresb/leis
 * (https://github.com/ctresb/leis, scripts sob licença MIT). A estrutura de blocos, as
 * regras de cabeçalho (PARTE/LIVRO/TÍTULO/CAPÍTULO/SEÇÃO/SUBSEÇÃO/ANEXO), o negrito do
 * rótulo do dispositivo (Art., §, Parágrafo único) e a separação de dispositivos unidos por
 * <br> seguem o original. Diferenças deliberadas:
 *  - tokenizador próprio (sem dependências);
 *  - elemento visual dentro de tabela não aborta a conversão: é omitido e registrado em `avisos`.
 */

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div', 'blockquote']);
const SKIP_TAGS = new Set(['head', 'style', 'script', 'title', 'xml']);
const VOID = new Set(['br', 'col', 'img', 'hr', 'input', 'meta', 'link', 'wbr']);

const LABEL = /^((?:Art\.|Artigo) ?\d+(?:\.\d+)*\.?[º°o]?(?:-[A-Z]+)?\.?|§ ?\d+\.?[º°]?(?:-[A-Z]+)?\.?|Parágrafo único\.?)(?=\s)/;
const HEADINGS = [
  [/^PARTE (GERAL|ESPECIAL|[IVXLC]+)\b/i, 2],
  [/^LIVRO [IVXLC]+(-[A-Z])?\b/i, 2],
  [/^LIVRO COMPLEMENTAR\b/i, 2],
  [/^TÍTULO [IVXLC]+(-[A-Z])?\b/i, 3],
  [/^CAPÍTULO [IVXLC]+(-[A-Z])?\b/i, 4],
  [/^SEÇÃO [IVXLC]+(-[A-Z])?\b/i, 5],
  [/^SUBSEÇÃO [IVXLC]+(-[A-Z])?\b/i, 6],
  [/^ANEXOS?\b(\s+[IVXLC\d]+)?$/i, 2]
];

// ── Entidades HTML ──────────────────────────────────────────────────────────
const NOMES = {
  nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', deg: '°',
  sect: '§', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', bull: '•', middot: '·', copy: '©', reg: '®', sup1: '¹', sup2: '²',
  sup3: '³', frac12: '½', frac14: '¼', frac34: '¾', times: '×', euro: '€', shy: '\u00ad', para: '¶'
};
{
  const letras = 'àáâãäåçèéêëìíîïñòóôõöùúûü';
  const nomes = ['agrave', 'aacute', 'acirc', 'atilde', 'auml', 'aring', 'ccedil', 'egrave', 'eacute', 'ecirc', 'euml',
    'igrave', 'iacute', 'icirc', 'iuml', 'ntilde', 'ograve', 'oacute', 'ocirc', 'otilde', 'ouml', 'ugrave', 'uacute', 'ucirc', 'uuml'];
  nomes.forEach((n, i) => {
    NOMES[n] = letras[i];
    NOMES[n[0].toUpperCase() + n.slice(1)] = letras[i].toUpperCase();
  });
}

function decodificar(texto) {
  if (!texto.includes('&')) return texto;
  return texto.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    try {
      if (e[0] === '#') {
        const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
    } catch { return m; }
    return Object.prototype.hasOwnProperty.call(NOMES, e) ? NOMES[e] : m;
  });
}

function escaparHtml(s, aspas) {
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return aspas ? s.replace(/"/g, '&quot;') : s;
}

// ── Tokenizador ─────────────────────────────────────────────────────────────
const TOKEN_FONTE = '<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<![^>]*>|<\\?[\\s\\S]*?\\?>|<\\/([a-zA-Z][\\w:.-]*)\\s*>|<([a-zA-Z][\\w:.-]*)((?:"[^"]*"|\'[^\']*\'|[^\'">])*)>';

function lerAtributos(bruto) {
  const attrs = [];
  const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = ATTR.exec(bruto))) {
    const valor = m[2] ?? m[3] ?? m[4] ?? '';
    attrs.push([m[1].toLowerCase(), decodificar(valor)]);
  }
  return attrs;
}

/** Chama os ouvintes na ordem do documento. `inicio`/`fim` são deslocamentos no texto de origem. */
function percorrer(html, { start, end, text }) {
  // Regex local: `percorrer` é reentrante (a tabela é analisada no meio do percurso do documento),
  // e um `lastIndex` compartilhado faria o laço externo recomeçar para sempre.
  const TOKEN = new RegExp(TOKEN_FONTE, 'g');
  let pos = 0, m;
  while ((m = TOKEN.exec(html))) {
    if (m.index > pos) text(decodificar(html.slice(pos, m.index)));
    pos = TOKEN.lastIndex;
    if (m[1]) {
      end(m[1].toLowerCase(), m.index, pos);
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const corpoAttrs = m[3] || '';
      const auto = /\/\s*$/.test(corpoAttrs);
      start(tag, lerAtributos(corpoAttrs.replace(/\/\s*$/, '')), m.index, pos);
      if (auto) end(tag, pos, pos);
      else if (tag === 'style' || tag === 'script') {
        // conteúdo bruto até o fechamento correspondente
        const re = new RegExp('</' + tag + '\\s*>', 'ig');
        re.lastIndex = pos;
        const f = re.exec(html);
        const fimTexto = f ? f.index : html.length;
        pos = f ? f.index + f[0].length : html.length;
        TOKEN.lastIndex = pos;
        end(tag, fimTexto, pos);
      }
    }
  }
  if (pos < html.length) text(decodificar(html.slice(pos)));
}

function estilo(attrs) {
  const style = ((attrs.find(([k]) => k === 'style') || [])[1] || '').replace(/\s/g, '').toLowerCase();
  return {
    b: style.includes('font-weight:bold') || style.includes('font-weight:700'),
    i: style.includes('font-style:italic'),
    s: style.includes('line-through'),
    center: style.includes('text-align:center')
  };
}

// ── Tabelas: reduzidas a HTML seguro (tags e atributos permitidos) ──────────
const TABELA_TAGS = new Set(['table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'sup', 'sub']);
const VISUAIS = new Set(['img', 'svg', 'object', 'embed', 'iframe', 'canvas', 'input', 'math']);

function renderizarTabela(html, herdado, excluirTachado, avisos) {
  const raiz = { tag: null, children: [], flags: herdado, skip: false };
  const pilha = [raiz];
  const topo = () => pilha[pilha.length - 1];
  const fecharAteTabela = (alvos) => {
    for (let k = pilha.length - 1; k > 0; k--) {
      if (pilha[k].tag === 'table') return;
      if (alvos.has(pilha[k].tag)) { pilha.length = k; return; }
    }
  };
  percorrer(html, {
    start(tag, attrs) {
      if ((VISUAIS.has(tag) || tag.startsWith('v:')) && !topo().skip) {
        avisos.push('elemento visual omitido em tabela: ' + tag);
        return;
      }
      if (['colgroup', 'thead', 'tbody', 'tfoot', 'caption'].includes(tag)) {
        for (let k = pilha.length - 1; k > 0; k--) {
          if (pilha[k].tag === 'table') { pilha.length = k + 1; break; }
        }
      }
      if (tag === 'tr') fecharAteTabela(new Set(['colgroup', 'caption']));
      if (['td', 'th', 'tr', 'p'].includes(tag)) {
        fecharAteTabela(new Set(tag === 'td' || tag === 'th' ? ['td', 'th'] : [tag]));
      }
      const f = estilo(attrs);
      f.b ||= tag === 'b' || tag === 'strong';
      f.i ||= tag === 'i' || tag === 'em';
      f.s ||= ['s', 'strike', 'del'].includes(tag);
      const flags = { b: f.b || !!topo().flags.b, i: f.i || !!topo().flags.i, s: f.s || !!topo().flags.s };
      const seguros = {};
      for (const [k, v] of attrs) {
        if (['rowspan', 'colspan', 'span'].includes(k) && ['td', 'th', 'col', 'colgroup'].includes(tag)) {
          if (/^[0-9]+$/.test(v)) seguros[k] = v;
        } else if (k === 'scope' && tag === 'th' && ['row', 'col', 'rowgroup', 'colgroup'].includes(v)) seguros[k] = v;
        else if ((k === 'id' || k === 'headers') && /^[\w .:-]+$/.test(v)) seguros[k] = v;
      }
      const no = { tag, attrs: seguros, children: [], flags, skip: topo().skip || SKIP_TAGS.has(tag) };
      topo().children.push(no);
      if (!VOID.has(tag)) pilha.push(no);
    },
    end(tag) {
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].tag === tag) { pilha.length = k; break; }
      }
    },
    text(t) { if (!topo().skip) topo().children.push({ texto: t, flags: topo().flags }); }
  });

  const render = (no) => {
    if (no.texto !== undefined) {
      if (excluirTachado && no.flags.s) return '';
      let t = escaparHtml(no.texto.replace(/[\r\n]/g, ' '), false);
      if (!t.trim()) return t;
      for (const [k, tg] of [['i', 'em'], ['b', 'strong'], ['s', 'del']]) if (no.flags[k]) t = `<${tg}>${t}</${tg}>`;
      return t;
    }
    if (no.skip || (excluirTachado && no.flags.s)) return '';
    const conteudo = no.children.map(render).join('');
    if (!TABELA_TAGS.has(no.tag)) return conteudo;
    const attrs = Object.entries(no.attrs).map(([k, v]) => ` ${k}="${escaparHtml(v, true)}"`).join('');
    return VOID.has(no.tag) ? `<${no.tag}${attrs}>` : `<${no.tag}${attrs}>${conteudo}</${no.tag}>`;
  };
  return render(raiz);
}

// ── Texto corrido ───────────────────────────────────────────────────────────
function escaparInline(s) {
  return s.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/</g, '&lt;');
}
const TEM_PALAVRA = /[\p{L}\p{N}_]/u;

function renderizarRuns(runs) {
  const unidos = [];
  for (let [texto, b, i, s] of runs) {
    texto = texto.replace(/\ufeff/g, '');
    texto = texto.replace(/\n/g, ' \n ').replace(/[ \t\r\f\v\u00a0]+/g, ' ');
    const ult = unidos[unidos.length - 1];
    if (ult && ult[1] === b && ult[2] === i && ult[3] === s) ult[0] += texto;
    else unidos.push([texto, b, i, s]);
  }
  const saida = [];
  let anteriorTachado = false;
  for (const [texto, b, i, tachado] of unidos) {
    let nucleo = texto.replace(/^ +| +$/g, '');
    if (!TEM_PALAVRA.test(nucleo) && !(tachado && nucleo.trim())) {
      saida.push(escaparInline(texto));
      anteriorTachado = false;
      continue;
    }
    const lead = texto.startsWith(' ') ? ' ' : '';
    const trail = texto.endsWith(' ') ? ' ' : '';
    const marca = (tachado ? '~~' : '') + (b ? '**' : '') + (i ? '*' : '');
    nucleo = escaparInline(nucleo);
    const renderizado = marca ? `${lead}${marca}${nucleo}${[...marca].reverse().join('')}${trail}` : `${lead}${nucleo}${trail}`;
    if (anteriorTachado && tachado && saida[saida.length - 1].endsWith('~~') && renderizado.startsWith('~~')) {
      saida[saida.length - 1] = saida[saida.length - 1].slice(0, -2) + renderizado.slice(2);
    } else saida.push(renderizado);
    anteriorTachado = tachado;
  }
  let s = saida.join('');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/ {2,}/g, ' ').trim();
  s = s.replace(/\*\*\s*\*\*/g, ' ');
  s = s.replace(/###[A-Z0-9-]*@@@/g, '');
  s = s.replace(/<<Anexo>>/g, '').replace(/<<ANEXO>>/g, '').replace(/<<ANEXOS>>/g, '');
  return s.trim();
}

class Analisador {
  constructor(html, excluirTachado, avisos) {
    this.html = html;
    this.excluirTachado = excluirTachado;
    this.avisos = avisos;
    this.skip = 0;
    this.fmt = [];
    this.runs = [];
    this.blockCenter = false;
    this.blockTag = null;
    this.blocks = [];
    this.tabelaProfundidade = 0;
    this.tabelaInicio = 0;
    this.tabelaHerdado = null;
  }

  cur(chave) { return this.fmt.some(([, f]) => f[chave]); }

  executar() {
    percorrer(this.html, {
      start: (tag, attrs, ini, fim) => this.inicio(tag, attrs, ini, fim),
      end: (tag, ini, fim) => this.fim(tag, ini, fim),
      text: (t) => this.texto(t)
    });
    if (this.tabelaProfundidade) throw new Error('tabela HTML sem fechamento');
    this.flush();
    return this.blocks;
  }

  inicio(tag, attrs, ini) {
    if (this.tabelaProfundidade) { if (tag === 'table') this.tabelaProfundidade++; return; }
    if (tag === 'table' && !this.skip) {
      this.flush();
      this.tabelaProfundidade = 1;
      this.tabelaInicio = ini;
      this.tabelaHerdado = { b: this.cur('b'), i: this.cur('i'), s: this.cur('s') };
      return;
    }
    if (SKIP_TAGS.has(tag)) { this.skip++; return; }
    if (tag === 'br') { this.runs.push(['\n', false, false, false]); return; }
    if (tag === 'img' || VOID.has(tag)) return;
    const flags = estilo(attrs);
    if (tag === 'b' || tag === 'strong') flags.b = true;
    if (tag === 'i' || tag === 'em') flags.i = true;
    if (['s', 'strike', 'del'].includes(tag)) flags.s = true;
    if (BLOCK_TAGS.has(tag)) {
      this.flush();
      this.blockTag = tag;
      const alinhamento = ((attrs.find(([k]) => k === 'align') || [])[1] || '').toLowerCase();
      this.blockCenter = flags.center || alinhamento === 'center';
    }
    this.fmt.push([tag, flags]);
  }

  fim(tag, ini, fim) {
    if (this.tabelaProfundidade) {
      if (tag === 'table') {
        this.tabelaProfundidade--;
        if (!this.tabelaProfundidade) {
          const trecho = this.html.slice(this.tabelaInicio, fim);
          this.blocks.push(['html_table', renderizarTabela(trecho, this.tabelaHerdado, this.excluirTachado, this.avisos), false]);
        }
      }
      return;
    }
    if (SKIP_TAGS.has(tag)) { this.skip = Math.max(0, this.skip - 1); return; }
    for (let k = this.fmt.length - 1; k >= 0; k--) {
      if (this.fmt[k][0] === tag) { this.fmt.length = k; break; }
    }
    if (BLOCK_TAGS.has(tag)) this.flush();
  }

  texto(dados) {
    if (this.skip || this.tabelaProfundidade) return;
    this.runs.push([dados.replace(/[\r\n]/g, ' '), this.cur('b'), this.cur('i'), this.cur('s')]);
  }

  flush() {
    const runs = this.excluirTachado ? this.runs.filter(r => !r[3]) : this.runs;
    const texto = renderizarRuns(runs);
    this.runs = [];
    if (texto) this.blocks.push([this.blockTag || 'p', texto, this.blockCenter]);
  }
}

const stripMd = (s) => s.replace(/[*\\]/g, '').trim();
function nivelCabecalho(plain) {
  for (const [rx, nivel] of HEADINGS) if (rx.test(plain)) return nivel;
  return null;
}
function pareceNome(plain) {
  return plain.length > 0 && plain.length < 200 && nivelCabecalho(plain) === null && !LABEL.test(plain) &&
    !/^[IVXLC]+ ?[-–—]/.test(plain) && !/^[a-z]\)/.test(plain) && !plain.startsWith('(') && !/[.;:,]$/.test(plain);
}

const INICIO_DISPOSITIVO = new RegExp(
  '(?=^(?:\\*\\*)?(?:Art\\.? ?\\d|Artigo \\d|§ ?\\d|Parágrafo único|[IVXLC]+ ?[-–—]|[a-z]\\) |' +
  '(?:TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO|LIVRO) [IVXLC]))', 'im');
const CABECALHO_CAMARA = new Set(['CÂMARA DOS DEPUTADOS', 'Centro de Documentação e Informação']);
const TITULO_COMPOSTO = /^(?:\S+( \S+)? [IVXLC]+(-[A-Z])?|PARTE (GERAL|ESPECIAL))$/i;

/**
 * Converte preservando o histórico por padrão. `excluirTachado` omite apenas texto marcado como
 * tachado no HTML; não certifica vigência, eficácia nem datas de aplicação.
 * @returns {string} Markdown (sem front matter).
 */
function converter(htmlTexto, { excluirTachado = false, avisos = [] } = {}) {
  let blocos = new Analisador(htmlTexto, excluirTachado, avisos).executar();
  const expandidos = [];
  for (const b of blocos) {
    if (b[0] !== 'table' && b[0] !== 'html_table' && b[1].includes('\n')) {
      for (const parte of b[1].split(INICIO_DISPOSITIVO).map(p => p.trim()).filter(Boolean)) expandidos.push([b[0], parte, b[2]]);
    } else expandidos.push(b);
  }
  blocos = expandidos;
  while (blocos.length && blocos[0][0] !== 'html_table' && CABECALHO_CAMARA.has(stripMd(blocos[0][1]))) blocos = blocos.slice(1);

  const saida = [];
  for (let i = 0; i < blocos.length; i++) {
    const [tipo, conteudoOrig] = blocos[i];
    if (tipo === 'html_table') { saida.push(conteudoOrig); continue; }
    let conteudo = conteudoOrig;
    let plain = stripMd(conteudo);
    const nivel = nivelCabecalho(plain);
    if (nivel && plain.length < 250) {
      plain = plain.replace(/\s*\n\s*/g, ' — ');
      let titulo = plain;
      if (TITULO_COMPOSTO.test(plain) && i + 1 < blocos.length) {
        const [nk, nc] = blocos[i + 1];
        if (nk !== 'html_table' && pareceNome(stripMd(nc))) { titulo = `${plain} — ${stripMd(nc)}`; i++; }
      }
      saida.push(`${'#'.repeat(nivel)} ${titulo}`);
      continue;
    }
    conteudo = conteudo.replace(/^(["“]?)\*\*(Art\.|§)\*\* ?(\d[\d.]*[º°o]?(?:-[A-Z]+)?\.?)(?=\s)/, '$1**$2 $3**');
    const m = LABEL.exec(plain);
    if (m && !conteudo.startsWith('**')) {
      const rotulo = m[1];
      if (conteudo.startsWith(rotulo)) conteudo = `**${rotulo}**${conteudo.slice(rotulo.length)}`;
    }
    if (/^\d+\. /.test(conteudo)) conteudo = conteudo.replace(/^(\d+)\./, '$1\\.');
    else if (/^[#>+-] /.test(conteudo)) conteudo = '\\' + conteudo;
    saida.push(conteudo.replace(/\n/g, '  \n'));
  }
  return saida.join('\n\n').trim() + '\n';
}

module.exports = { converter, decodificar, renderizarRuns, LABEL, nivelCabecalho };
