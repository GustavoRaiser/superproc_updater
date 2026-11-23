'use strict';
// Leitura de PDF para o ContextBroker (somente leitura). Alcança o PDF em qualquer das formas em que o SuperPROC o mostra:
//  1. leitor pdf.js da extensão (chrome-extension://<id>/data/pdf.js/web/viewer.html?file=<pdf>), no topo da aba ou num frame:
//     o texto sai da própria página (PDFViewerApplication), sem rede;
//  2. visualizador nativo do Chromium (documento PDF no topo da aba, ou <embed>/<iframe>/<object> dentro de uma página):
//     o texto não é acessível pela página, então o PDF é baixado de novo pelo endereço que a aba já mostra (mesma sessão,
//     mesmos cookies) e o texto é extraído no processo principal com o pdfjs-dist.
// Evidência (experimento em Chromium real, 2026-11-20): no visualizador nativo, o frame da extensão
// chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html é filho do frame que carrega o PDF; com o leitor pdf.js,
// wc.getURL() é o endereço do leitor (não o do PDF) e o PDF vem no parâmetro `file`.
// Sem OCR: PDF sem camada de texto devolve requerOcr. Limites de tamanho, páginas, texto e tempo em todos os caminhos.
const { codigoPdf, normalizarPdf } = require('./pdf-extractor');

const ID_VISUALIZADOR_NATIVO = 'mhjfbmdgcfjbbpaeojofohoefgiehjai';
const RE_PDFJS = /^chrome-extension:\/\/[a-p]{32}\/data\/pdf\.js\/web\/viewer\.html/;
const RE_NATIVO = new RegExp('^chrome-extension://' + ID_VISUALIZADOR_NATIVO + '/');
// 2026-11-21: tetos elevados (antes 64 MiB, 2.000 páginas e 3 PDFs). 512 MiB cabe no processo principal com folga e o pdf.js lê
// página a página; o limite prático passa a ser o prazo (timeoutPdfMs) e o teto de caracteres.
const LIMITES_PDF = Object.freeze({ maxBytes: 512 * 1024 * 1024, maxPaginas: 100000, maxPdfsPorAba: 10, maxFrames: 80, validadeCacheMs: 5 * 60000 });

const urlDe = (frame) => String((frame && frame.url) || '');
const ehPdfjs = (frame) => RE_PDFJS.test(urlDe(frame));
const ehNativo = (frame) => RE_NATIVO.test(urlDe(frame));
const ehHttp = (url) => { try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

// Endereço do PDF mostrado pelo leitor pdf.js (parâmetro `file`); '' se não for uma página web.
function enderecoDoLeitor(url) {
  try { const f = new URL(String(url)).searchParams.get('file'); return f && ehHttp(f) ? f : ''; } catch { return ''; }
}

function framesDe(wc) {
  const raiz = wc && wc.mainFrame;
  const todos = (raiz && raiz.framesInSubtree) || (raiz ? [raiz] : []);
  return { raiz, frames: todos.slice(0, LIMITES_PDF.maxFrames) };
}

// Síncrono, sem executar código na página. `topo` = o documento da aba é o próprio PDF.
function descobrirPdfs(wc) {
  const { raiz, frames } = framesDe(wc);
  const alvos = [];
  const vistos = new Set();
  const adicionar = (alvo) => { const chave = alvo.via + '|' + (alvo.endereco || urlDe(alvo.frame)); if (!vistos.has(chave)) { vistos.add(chave); alvos.push(alvo); } };
  for (const f of frames) {
    if (ehPdfjs(f)) adicionar({ via: 'pdfjs', frame: f, endereco: enderecoDoLeitor(urlDe(f)), topo: f === raiz });
    else if (ehNativo(f)) {
      const pai = f.parent;
      if (pai && (ehHttp(urlDe(pai)) || /^file:/i.test(urlDe(pai)))) adicionar({ via: 'nativo', frame: pai, endereco: urlDe(pai), topo: pai === raiz });
    }
  }
  return { alvos, topo: alvos.find((a) => a.topo) || null };
}
const documentoEhPdf = (wc) => { try { return !!descobrirPdfs(wc).topo; } catch { return false; } };

// Endereço lógico de uma aba cujo topo é o leitor pdf.js: o do PDF, não o da extensão.
function enderecoLogico(url) { return RE_PDFJS.test(String(url || '')) ? enderecoDoLeitor(url) || '' : String(url || ''); }

// ---- extração no processo principal --------------------------------------------------------------------------------
let pdfjs;
async function extrairBytes(buffer, o) {
  pdfjs ||= import('pdfjs-dist/legacy/build/pdf.mjs');
  const tarefa = (await pdfjs).getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false });
  const inicio = Date.now();
  try {
    const doc = await tarefa.promise;
    if (doc.numPages > LIMITES_PDF.maxPaginas) return { leitor: true, totalPaginas: doc.numPages, paginas: [], caracteres: 0, truncado: true };
    const paginas = [];
    let caracteres = 0;
    let truncado = false;
    const de = Math.max(1, (o.paginas && o.paginas.de) || 1);
    const ate = Math.min(doc.numPages, (o.paginas && o.paginas.ate) || doc.numPages);
    const prazo = o.timeoutPdfMs || o.timeoutMs * 3;
    for (let i = de; i <= ate; i++) {
      if (Date.now() - inicio > prazo) { truncado = true; break; }
      const pagina = await doc.getPage(i);
      const conteudo = await pagina.getTextContent();
      let texto = conteudo.items.map((x) => (typeof x.str === 'string' ? x.str : '')).join(' ').replace(/\s+/g, ' ').trim();
      pagina.cleanup();
      if (caracteres + texto.length > o.maxCaracteres) { texto = texto.slice(0, Math.max(0, o.maxCaracteres - caracteres)); truncado = true; }
      paginas.push({ pagina: i, texto });
      caracteres += texto.length;
      if (truncado) break;
    }
    return { leitor: true, totalPaginas: doc.numPages, paginas, caracteres, truncado, faixa: { de, ate } };
  } finally { await tarefa.destroy().catch(() => {}); }
}

// Baixa o PDF pela sessão da própria aba (mesmos cookies). Só http(s), com teto de bytes e de tempo.
async function baixarBytes(wc, url, { maxBytes = LIMITES_PDF.maxBytes, timeoutMs = 30000 } = {}) {
  if (/^file:/i.test(String(url))) { // PDF local que a própria pessoa abriu na aba
    const fs = require('node:fs/promises');
    const caminho = require('node:url').fileURLToPath(url);
    if ((await fs.stat(caminho)).size > maxBytes) return null;
    const dados = await fs.readFile(caminho);
    return dados.subarray(0, 5).toString() === '%PDF-' ? dados : null;
  }
  if (!ehHttp(url) || !wc || !wc.session || typeof wc.session.fetch !== 'function') return null;
  const resposta = await wc.session.fetch(url, { credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
  if (!resposta.ok) return null;
  if (Number(resposta.headers.get('content-length')) > maxBytes) return null;
  const leitor = resposta.body.getReader();
  const pedacos = [];
  let tamanho = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      tamanho += value.length;
      if (tamanho > maxBytes) return null;
      pedacos.push(value);
    }
  } finally { await leitor.cancel().catch(() => {}); }
  const buffer = Buffer.concat(pedacos.map((p) => Buffer.from(p.buffer, p.byteOffset, p.length)), tamanho);
  return buffer.subarray(0, 5).toString() === '%PDF-' ? buffer : null;
}

// `executar(frame, codigo)` roda código no frame com prazo (vem do broker). Tudo injetável para testar sem Electron.
function criarLeitorDePdf({ executar, baixar = baixarBytes, extrair = extrairBytes, agora = Date.now, limites = {} } = {}) {
  const L = { ...LIMITES_PDF, ...limites };
  const cache = new WeakMap(); // wc -> Map(chave -> { ate, normalizado })

  async function lerAlvo(wc, alvo, o, identidade) {
    // 1) leitor pdf.js: texto direto da página
    if (alvo.via === 'pdfjs') {
      try {
        const n = normalizarPdf(await executar(alvo.frame, codigoPdf(o)));
        if (n) return { normalizado: n, via: 'pdfjs' };
      } catch (_) { /* cai no download, se houver endereço */ }
    }
    if (!alvo.endereco || !(ehHttp(alvo.endereco) || /^file:/i.test(alvo.endereco))) return { erro: 'PDF_NOT_READABLE' };
    // 2) download + extração no processo principal (cache por documento da aba)
    const chave = alvo.endereco + '|' + o.maxCaracteres + '|' + (o.paginas ? o.paginas.de + '-' + o.paginas.ate : '');
    const porAba = cache.get(wc) || new Map();
    cache.set(wc, porAba);
    const guardado = porAba.get(chave);
    if (guardado && guardado.identidade === identidade && guardado.ate > agora()) return { normalizado: guardado.normalizado, via: alvo.via + '+rede' };
    let buffer;
    try { buffer = await baixar(wc, alvo.endereco, { timeoutMs: o.timeoutPdfMs || o.timeoutMs }); } catch (_) { return { erro: 'PDF_FETCH_FAILED' }; }
    if (!buffer) return { erro: 'PDF_FETCH_FAILED' };
    let normalizado;
    try { normalizado = normalizarPdf(await extrair(buffer, o)); } catch (_) { return { erro: 'PDF_PARSE_FAILED' }; }
    if (!normalizado) return { erro: 'PDF_PARSE_FAILED' };
    porAba.set(chave, { identidade, ate: agora() + L.validadeCacheMs, normalizado });
    return { normalizado, via: alvo.via + '+rede' };
  }

  // Devolve { principal, incorporados[], avisos[] }. `principal`: o documento da aba é o PDF. `incorporados`: PDFs dentro da página.
  async function ler(wc, o, { identidade } = {}) {
    const saida = { principal: null, incorporados: [], avisos: [], vias: [] };
    let achados;
    try { achados = descobrirPdfs(wc); } catch (_) { return saida; }
    let restante = o.maxCaracteres;
    for (const alvo of achados.alvos.slice(0, L.maxPdfsPorAba)) {
      const r = await lerAlvo(wc, alvo, { ...o, maxCaracteres: Math.max(restante, 0) }, identidade);
      if (r.erro) {
        if (!saida.avisos.includes(r.erro)) saida.avisos.push(r.erro);
        if (!alvo.topo) saida.incorporados.push({ endereco: alvo.endereco || '', erro: r.erro });
        continue;
      }
      saida.vias.push(r.via);
      restante -= r.normalizado.paginas.reduce((s, p) => s + p.texto.length, 0);
      for (const a of r.normalizado.avisos) if (!saida.avisos.includes(a)) saida.avisos.push(a);
      if (alvo.topo) saida.principal = r.normalizado;
      else saida.incorporados.push({ endereco: alvo.endereco || '', ...r.normalizado });
    }
    return saida;
  }
  return { ler };
}

module.exports = { ID_VISUALIZADOR_NATIVO, LIMITES_PDF, descobrirPdfs, documentoEhPdf, enderecoDoLeitor, enderecoLogico, extrairBytes, baixarBytes, criarLeitorDePdf };
