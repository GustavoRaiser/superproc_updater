/**
 * SuperPROC - Menu Rápido de Eventos: leitura dos eventos na árvore e montagem do link.
 * Só LÊ o DOM da árvore (nada é alterado, inclusive o que o AZFLOW entrega).
 */
export const digitos = (valor) => String(valor ?? '').replace(/\D/g, '');
const limpar = (texto, max) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function ancoraDoEvento(li) {
    return li.querySelector(':scope > a.jstree-anchor') || li.querySelector('a.jstree-anchor');
}

function numeroDoEvento(li, texto) {
    const doTexto = texto.match(/^\(?(\d{1,6})\)?(?:\s|-|$)/);
    if (doTexto) return parseInt(doTexto[1], 10);
    const doId = String(li.id || '').match(/^evt\D*(\d{1,6})$/i);
    return doId ? parseInt(doId[1], 10) : NaN;
}

/** "Petição - Refer. Ao Evento: 19 - 31/07/2025 11:05" → { rotulo, data }. */
function partirDescricao(resto) {
    const m = resto.match(/^(.*?)\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?\s*$/);
    return m ? { rotulo: limpar(m[1], 90), data: m[2] } : { rotulo: limpar(resto, 90), data: '' };
}

const TEXTO_LINK = /^evento \d{1,6}(?:, [^<>"&]{1,80})?$/;

export function sanitizarDoc(bruto) {
    if (!bruto || typeof bruto !== 'object') return null;
    const iddocumento = digitos(bruto.iddocumento);
    const numprocesso = digitos(bruto.numprocesso);
    if (iddocumento.length < 8 || iddocumento.length > 64 || numprocesso.length < 15 || numprocesso.length > 25) return null;
    const mimetype = /^[a-z0-9]{1,12}$/i.test(bruto.mimetype || '') ? bruto.mimetype : 'html';
    const uf = /^[A-Za-z]{2}$/.test(bruto.uf || '') ? String(bruto.uf).toUpperCase() : '';
    return {
        iddocumento,
        numprocesso,
        mimetype,
        page: /^\d{1,5}$/.test(String(bruto.page ?? '')) ? String(bruto.page) : '',
        uf,
        is2g: bruto.is2g === 'true' ? 'true' : 'false',
        target: bruto.target === '_self' ? '_self' : '_blank',
        rotulo: limpar(bruto.rotulo, 60),
        texto: TEXTO_LINK.test(bruto.texto || '') ? bruto.texto : ''
    };
}

/** Rótulo do documento (ex.: "Petição Inicial 1") sem o texto dos ícones/links embutidos no mesmo <a>. */
function rotuloDoDocumento(li) {
    const ancora = li?.querySelector(':scope > a.jstree-anchor');
    if (!ancora) return '';
    const copia = ancora.cloneNode(true);
    copia.querySelectorAll("[id^='imgCopyLinkDoc_'], .superproc-card-link-rapido, .widgetlinkdocumento").forEach((no) => no.remove());
    return limpar(copia.textContent, 60);
}

/** "Anexo 2" → "ANEXO2": mesma forma que o eproc usa na sigla do link quando ela não vier pronta. */
const siglaDoRotulo = (rotulo) => rotulo.toUpperCase().replace(/\s+(\d+)$/, '$1').replace(/[<>"&]/g, '');

function lerDocumentos(li, n) {
    const docs = [];
    const vistos = new Set();
    for (const widget of li.querySelectorAll('.widgetlinkdocumento[data-iddocumento]')) {
        const rotulo = rotuloDoDocumento(widget.closest('li[seqdoc]'));
        const nativo = limpar(widget.textContent, 90);
        const doc = sanitizarDoc({
            iddocumento: widget.getAttribute('data-iddocumento'),
            numprocesso: widget.getAttribute('data-numprocesso'),
            mimetype: widget.getAttribute('data-mimetype'),
            page: widget.getAttribute('data-page'),
            uf: widget.getAttribute('data-uf'),
            is2g: widget.getAttribute('data-is2g'),
            target: widget.getAttribute('data-target'),
            rotulo,
            // Texto do link como o eproc entrega ("evento 1, INIC1"); sem sigla, deriva do rótulo.
            texto: TEXTO_LINK.test(nativo) && nativo.includes(',') ? nativo : (rotulo ? `evento ${n}, ${siglaDoRotulo(rotulo)}` : '')
        });
        if (!doc || vistos.has(doc.iddocumento)) continue;
        vistos.add(doc.iddocumento);
        docs.push(doc);
    }
    return docs;
}

function lerEvento(li) {
    const texto = limpar(ancoraDoEvento(li)?.textContent, 300);
    const n = numeroDoEvento(li, texto);
    if (!Number.isInteger(n) || n < 1) return null;
    const { rotulo, data } = partirDescricao(texto.replace(/^\(?\d{1,6}\)?\s*-?\s*/, ''));
    return { n, rotulo, data, docs: lerDocumentos(li, n) };
}

/** Eventos raiz da árvore que têm link de documento. `semLink` conta os que não têm. */
export function lerEventosDaArvore(documento = document) {
    const raiz = documento.getElementById('divArvore') || documento;
    const porNumero = new Map();
    let semLink = 0;
    for (const li of raiz.querySelectorAll("li[evento='true']")) {
        const evento = lerEvento(li);
        if (!evento) continue;
        if (!evento.docs.length) { semLink++; continue; }
        if (!porNumero.has(evento.n)) porNumero.set(evento.n, evento);
    }
    return { eventos: [...porNumero.values()].sort((a, b) => a.n - b.n), semLink };
}

/** Valida o que chega pelo canal entre as views (nunca confiar no formato). */
export function sanitizarSnapshot(dado) {
    if (!dado || typeof dado !== 'object' || !Array.isArray(dado.eventos)) return { eventos: [], semLink: 0 };
    const eventos = [];
    for (const bruto of dado.eventos.slice(0, 20000)) {
        const n = Number(bruto?.n);
        if (!Number.isInteger(n) || n < 1 || n > 999999 || !Array.isArray(bruto.docs)) continue;
        const docs = bruto.docs.slice(0, 60).map(sanitizarDoc).filter(Boolean);
        if (!docs.length) continue;
        eventos.push({
            n,
            rotulo: limpar(bruto.rotulo, 90),
            data: /^\d{2}\/\d{2}\/\d{4}$/.test(bruto.data || '') ? bruto.data : '',
            docs
        });
    }
    return { eventos, semLink: Math.max(0, Math.min(99999, Number(dado.semLink) || 0)) };
}

/** Texto do link: "evento N" (documento único) ou "evento N, SIGLA" (evento com vários documentos). */
export function textoDoLink(evento, doc) {
    return evento.docs.length > 1 && doc.texto ? doc.texto : `evento ${evento.n}`;
}

/** O mesmo span que o módulo "Cores no evento raiz" copia: <span class="widgetlinkdocumento" ...>evento N</span>. */
export function montarSpanLink(doc, texto, documento = document) {
    const span = documento.createElement('span');
    span.className = 'widgetlinkdocumento';
    span.setAttribute('data-iddocumento', doc.iddocumento);
    span.setAttribute('data-target', doc.target || '_blank');
    span.setAttribute('data-is2g', doc.is2g || 'false');
    span.setAttribute('data-numprocesso', doc.numprocesso);
    span.setAttribute('data-mimetype', doc.mimetype || 'html');
    if (doc.page) span.setAttribute('data-page', doc.page);
    if (doc.uf) span.setAttribute('data-uf', doc.uf);
    span.textContent = texto;
    return span.outerHTML;
}
