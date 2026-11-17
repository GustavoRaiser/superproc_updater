'use strict';
/**
 * Biblioteca local: normas baixadas em Markdown (front matter YAML compatível com o ctresb/leis).
 * Uma norma só entra aqui por ação explícita do usuário (`baixar`). É a única parte que a
 * conferência diária atualiza.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { converter } = require('./html2md');
const { limparAnotacoes } = require('./limpeza');
const { escolherTexto } = require('./fonte');
const { TIPOS } = require('./tipos');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const yaml = (v) => JSON.stringify(v == null ? '' : v);
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const contarArtigos = (md) => (md.match(/^\*\*Art\./gm) || []).length;
const VERSAO = { Current: 'compilada (texto vigente)', Original: 'original', Intermediate: 'republicação/retificação' };

function hojeSaoPaulo(data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(data).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function escreverAtomico(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, dados);
  fs.renameSync(tmp, arquivo);
}

/** Texto precisa ter conteúdo normativo mínimo e não pode regredir de forma suspeita. */
function auditar(md, anterior) {
  if (md.includes('\0')) return 'corpo contém NUL';
  if ((md.match(/[\p{L}\p{N}]/gu) || []).length < 80) return 'texto vazio ou curto demais';
  const plano = md.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (md.length < 1500 && /nao consta do acervo|nao foi encontrada nos acervos/.test(plano)) return 'fonte informa que a norma não consta do acervo';
  if (anterior && anterior.artigos >= 10 && contarArtigos(md) < anterior.artigos * 0.5) {
    return `regressão suspeita: ${contarArtigos(md)} artigos contra ${anterior.artigos} da versão guardada`;
  }
  return null;
}

function lerFrontMatter(texto) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(texto.replace(/\r\n/g, '\n'));
  if (!m) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of m[1].split('\n')) {
    const k = /^([A-Za-z_]+):\s?(.*)$/.exec(linha);
    if (!k) continue;
    try { meta[k[1]] = JSON.parse(k[2]); } catch { meta[k[1]] = k[2]; }
  }
  return { meta, corpo: texto.slice(m[0].length) };
}

function criarBiblioteca({ dir, fonte, hoje = () => hojeSaoPaulo() }) {
  const arquivoIndice = path.join(dir, 'indice.json');
  const arquivoFalhas = path.join(dir, '_falhas.jsonl');
  let fila = Promise.resolve();
  const serializar = (fn) => { const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; };

  function lerIndice() {
    try {
      if (fs.existsSync(arquivoIndice)) {
        const j = JSON.parse(fs.readFileSync(arquivoIndice, 'utf8'));
        if (j && typeof j.normas === 'object') return j;
      }
    } catch (e) {
      try { fs.renameSync(arquivoIndice, arquivoIndice + '.corrompido-' + Date.now()); } catch { /* segue com índice novo */ }
    }
    return { versao: 1, normas: {} };
  }
  const gravarIndice = (j) => escreverAtomico(arquivoIndice, JSON.stringify(j, null, 1));
  const falha = (x, motivo) => {
    try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(arquivoFalhas, JSON.stringify({ em: new Date().toISOString(), urn: x.u, slug: x.s, motivo }) + '\n'); } catch { /* registro é auxiliar */ }
  };

  const caminhoMd = (x) => path.join(dir, 'normas', TIPOS[x.k][0], x.d.slice(0, 4), x.s + '.md');
  const caminhoFonte = (x) => path.join(dir, '_fonte', TIPOS[x.k][0], x.d.slice(0, 4), x.s + '.html.gz');

  /** Entrada de catálogo a partir do registro guardado (a conferência não depende do catálogo). */
  const comoEntrada = (r) => ({ u: r.urn, s: r.slug, k: r.k, n: r.numero, d: r.data, t: r.titulo, e: r.ementa || '', i: r.id_senado || '' });

  async function baixarInterno(x, { forcar = false } = {}) {
    if (!x || !TIPOS[x.k]) return { status: 'erro', motivo: 'norma desconhecida' };
    const idx = lerIndice();
    const anterior = idx.normas[x.s] || null;
    const data = hoje();
    const urn = x.u;

    const meta = await fonte.metadados(urn);
    if (!meta || meta.legislationIdentifier !== urn || !meta.encoding) {
      let motivo = 'metadados indisponíveis na fonte';
      if (x.i) {
        const oficial = await fonte.urnOficial(x.i);
        if (oficial && oficial !== urn) motivo = 'URN oficial divergente; equivalência requer revisão';
      }
      falha(x, motivo);
      return { status: 'sem_texto', motivo };
    }
    const enc = escolherTexto(meta);
    if (!enc) { falha(x, 'sem texto em HTML'); return { status: 'sem_texto', motivo: 'a fonte não tem texto em HTML para esta norma' }; }
    const textoId = String(enc.contentUrl).split('/').slice(-2, -1)[0] || enc.contentUrl;
    const textoData = ((/@(\d{4}-\d{2}-\d{2})~texto/.exec(enc['@id'] || '') || [])[1]) || enc.datePublished || meta.dateModified || '';

    if (anterior && anterior.texto_id === textoId && !forcar && fs.existsSync(caminhoMd(x))) {
      anterior.conferido_em = data;
      idx.normas[x.s] = anterior;
      gravarIndice(idx);
      return { status: 'inalterada', slug: x.s };
    }

    const { status, corpo } = await fonte.texto(enc.contentUrl);
    if (status !== 200 || !corpo.length) { falha(x, 'texto indisponível HTTP ' + status); return { status: 'sem_texto', motivo: 'texto indisponível na fonte (HTTP ' + status + ')' }; }
    if (corpo.subarray(0, 4).toString('latin1') === '%PDF') { falha(x, 'texto só em PDF'); return { status: 'sem_texto', motivo: 'a fonte só tem esta norma em PDF (não suportado)' }; }

    const avisos = [];
    let md;
    try { md = limparAnotacoes(converter(corpo.toString('utf8'), { avisos })); } catch (e) { falha(x, 'conversão: ' + e.message); return { status: 'erro', motivo: 'falha ao converter o texto: ' + e.message }; }
    const reprovado = auditar(md, anterior);
    if (reprovado) { falha(x, reprovado); return { status: anterior ? 'mantida' : 'sem_texto', motivo: reprovado }; }

    const forca = lista(meta.legislationLegalForce);
    const revogada = JSON.stringify(forca) === '["InForce"]' ? false : null;
    const hashCorpo = sha256(md);
    const cab = ['---',
      `titulo: ${yaml(x.t)}`, `tipo: ${yaml(TIPOS[x.k][4])}`, `numero: ${yaml(x.n)}`, `data: ${x.d}`, `ementa: ${yaml(x.e)}`,
      `revogada: ${revogada === false ? 'false' : 'null'}`, `forca_legal_fonte: ${yaml(JSON.stringify(forca))}`,
      `fonte_metadados: ${yaml('https://normas.leg.br/api/public/normas?urn=' + urn)}`,
      `sha256_metadados_fonte: ${yaml(sha256(JSON.stringify(meta)))}`,
      `versao_texto: ${yaml(VERSAO[enc.version] || enc.version)}`, `texto_data: ${yaml(textoData)}`,
      `urn: ${yaml(urn)}`, `fonte: ${yaml('https://normas.leg.br/?urn=' + urn)}`,
      `baixado_em: ${data}`, `conferido_em: ${data}`, `sha256_corpo: ${yaml(hashCorpo)}`,
      ...(avisos.length ? [`avisos_conversao: ${yaml(avisos.join('; '))}`] : []), '---', ''];
    const arquivo = caminhoMd(x);
    if (fs.existsSync(arquivo)) { try { fs.copyFileSync(arquivo, arquivo.replace(/\.md$/, '.anterior.md')); } catch { /* cópia é auxiliar */ } }
    escreverAtomico(arquivo, cab.join('\n') + `# ${x.t}\n\n` + md);
    try { escreverAtomico(caminhoFonte(x), zlib.gzipSync(corpo)); } catch { /* fonte bruta é auxiliar */ }

    const mudou = !anterior || anterior.sha256_corpo !== hashCorpo;
    idx.normas[x.s] = {
      urn, slug: x.s, k: x.k, id_senado: x.i || '', titulo: x.t, tipo: TIPOS[x.k][4], numero: x.n, data: x.d, ementa: x.e || '',
      arquivo: path.relative(dir, arquivo).replace(/\\/g, '/'), texto_id: textoId, texto_data: textoData,
      versao_texto: VERSAO[enc.version] || enc.version, sha256_corpo: hashCorpo, artigos: contarArtigos(md), revogada,
      baixado_em: anterior ? anterior.baixado_em : data, conferido_em: data, atualizado_em: mudou ? data : (anterior && anterior.atualizado_em) || data
    };
    gravarIndice(idx);
    return { status: anterior ? (mudou ? 'atualizada' : 'inalterada') : 'ok', slug: x.s, avisos };
  }

  /**
   * Copia para a biblioteca as normas de uma biblioteca inicial (empacotada com o aplicativo) que ainda não
   * existem aqui. O que o usuário já tem nunca é sobrescrito; as normas semeadas seguem o mesmo ciclo de
   * conferência das demais (só atualizam quando o usuário abre a Legislação e a fonte tiver texto novo).
   */
  function semear(dirOrigem) {
    let copiadas = 0;
    try {
      const origem = JSON.parse(fs.readFileSync(path.join(dirOrigem, 'indice.json'), 'utf8'));
      const idx = lerIndice();
      for (const [slug, r] of Object.entries(origem.normas || {})) {
        if (idx.normas[slug] || !/^[a-z0-9-]{1,120}$/.test(slug) || typeof r.arquivo !== 'string') continue;
        const de = path.join(dirOrigem, r.arquivo), para = path.join(dir, r.arquivo);
        if (!para.startsWith(path.join(dir, 'normas') + path.sep) || !fs.existsSync(de)) continue;
        escreverAtomico(para, fs.readFileSync(de));
        idx.normas[slug] = r;
        copiadas++;
      }
      if (copiadas) gravarIndice(idx);
    } catch { /* sem biblioteca inicial utilizável: o aplicativo segue só com o que o usuário baixar */ }
    return copiadas;
  }

  return {
    dir, semear,
    listar: () => Object.values(lerIndice().normas),
    obter: (slug) => lerIndice().normas[slug] || null,
    porUrn: (urn) => Object.values(lerIndice().normas).find(r => r.urn === urn) || null,
    /** Baixa (ou atualiza) uma norma a partir da entrada do catálogo. Chamadas são serializadas. */
    baixar: (x, opcoes) => serializar(() => baixarInterno(x, opcoes)),
    /** Reconfere uma norma já baixada contra a fonte (só baixa o texto se a versão mudou). */
    conferir: (slug) => serializar(async () => {
      const r = lerIndice().normas[slug];
      return r ? baixarInterno(comoEntrada(r)) : { status: 'erro', motivo: 'norma não está na biblioteca' };
    }),
    lerMarkdown(slug) {
      const r = lerIndice().normas[slug];
      if (!r) return null;
      const arquivo = path.join(dir, r.arquivo);
      if (!arquivo.startsWith(path.join(dir, 'normas'))) return null;
      try {
        // Cópias baixadas antes da limpeza existir também saem limpas na leitura (a limpeza é idempotente).
        const { meta, corpo } = lerFrontMatter(fs.readFileSync(arquivo, 'utf8'));
        return { registro: r, meta, corpo: limparAnotacoes(corpo) };
      } catch { return null; }
    },
    remover: (slug) => serializar(async () => {
      const idx = lerIndice();
      const r = idx.normas[slug];
      if (!r) return false;
      const arquivo = path.join(dir, r.arquivo);
      for (const f of [arquivo, arquivo.replace(/\.md$/, '.anterior.md'), path.join(dir, '_fonte', path.relative(path.join(dir, 'normas'), arquivo).replace(/\.md$/, '.html.gz'))]) {
        try { fs.rmSync(f, { force: true }); } catch { /* segue */ }
      }
      delete idx.normas[slug];
      gravarIndice(idx);
      return true;
    })
  };
}

module.exports = { criarBiblioteca, auditar, contarArtigos, lerFrontMatter, hojeSaoPaulo };
