'use strict';
// Extrator de PDF (somente leitura). Roda no frame do leitor pdf.js próprio, no mundo principal (PDFViewerApplication é global
// da página). Só texto por página; sem OCR: PDF sem camada textual devolve requerOcr=true.

async function extrairPdf(o) {
  const app = window.PDFViewerApplication;
  const doc = app && app.pdfDocument;
  if (!doc) return { leitor: false };
  const inicio = Date.now();
  const paginas = [];
  let caracteres = 0;
  let truncado = false;
  for (let i = 1; i <= doc.numPages; i++) {
    if (Date.now() - inicio > o.timeoutMs) { truncado = true; break; }
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    let texto = conteudo.items.map((x) => (typeof x.str === 'string' ? x.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    if (caracteres + texto.length > o.maxCaracteres) { texto = texto.slice(0, Math.max(0, o.maxCaracteres - caracteres)); truncado = true; }
    paginas.push({ pagina: i, texto });
    caracteres += texto.length;
    if (truncado) break;
    if (window.PDFViewerApplication.pdfDocument !== doc) return { leitor: true, mudou: true };
  }
  return { leitor: true, totalPaginas: doc.numPages, paginas, caracteres, truncado };
}

const codigoPdf = (opcoes) => `(${extrairPdf.toString()})(${JSON.stringify(opcoes)})`;

// Resultado padronizado para o broker (aplicado no processo principal).
function normalizarPdf(bruto) {
  if (!bruto || bruto.leitor !== true || bruto.mudou) return null;
  const textoDisponivel = bruto.caracteres > 0;
  return {
    totalPaginas: bruto.totalPaginas,
    paginas: bruto.paginas,
    textoDisponivel,
    requerOcr: !textoDisponivel,
    truncado: !!bruto.truncado,
    avisos: textoDisponivel ? [] : ['PDF_HAS_NO_TEXT_LAYER']
  };
}

module.exports = { extrairPdf, codigoPdf, normalizarPdf };
