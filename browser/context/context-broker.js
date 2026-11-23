'use strict';
// ContextBroker: leitura interna, somente leitura, das abas registradas no TabRegistry. Camada: host (processo principal).
// NÃO se integra ao Copilot: não toca na coluna, não injeta nada, não altera a aba ativa, não navega nem clica.
// Logs: só códigos e contagens (nunca título, endereço ou texto de página). Dependências injetadas para testar sem Electron.
const { CODIGOS, ErroContexto, LIMITES } = require('./tipos');
const V = require('./validadores');
const { identidadeDocumento } = require('./tab-registry');
const { codigoGenerico } = require('./generic-extractor');
const { codigoEproc } = require('./eproc-extractor');
const { codigoPdf, normalizarPdf } = require('./pdf-extractor');
const { criarLeitorDePdf } = require('./pdf-embutido');

const MUNDO = 1093;

// Normalização para busca (sem acento, minúscula) preservando o mapa de posições para recortar o texto original.
function normalizar(texto) {
  let out = '';
  const mapa = [];
  for (let i = 0; i < texto.length; i++) {
    const n = texto[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const c of n) { out += c; mapa.push(i); }
  }
  return { out, mapa };
}

function criarContextBroker({ registry, limites = {}, agora = () => new Date().toISOString(), log = () => {}, mundo = MUNDO, pdfEmbutido = null }) {
  const L = { ...LIMITES, ...limites };
  const registrar = (m) => { try { log('CONTEXTO', m); } catch (_) { /* log nunca derruba a leitura */ } };

  const comTimeout = (p, ms = L.timeoutMs) => {
    let t;
    return Promise.race([Promise.resolve(p), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms + (L.folgaMs === undefined ? 2000 : L.folgaMs)); })]).finally(() => clearTimeout(t));
  };

  const descreverEntrada = (e) => ({
    id: e.id, type: e.tipo, title: e.titulo, url: V.enderecoSeguro(e.url), origin: V.origemDe(e.url),
    active: e.ativa, processNumber: e.numeroProcesso, readable: e.legivel,
    groupId: e.grupo || null, role: e.papel || null
  });

  // PDF em qualquer forma (leitor pdf.js, visualizador nativo, embutido numa página): ver pdf-embutido.js.
  const leitorPdf = criarLeitorDePdf({ executar: (frame, codigo) => comTimeout(frame.executeJavaScript(codigo), L.timeoutPdfMs), ...(pdfEmbutido || {}) });

  async function lerPdf(wc, o) {
    const frames = (wc.mainFrame && wc.mainFrame.framesInSubtree) || (wc.mainFrame ? [wc.mainFrame] : []);
    for (const frame of frames) {
      let bruto;
      try { bruto = await comTimeout(frame.executeJavaScript(codigoPdf(o)), L.timeoutPdfMs); } catch (_) { continue; }
      const n = normalizarPdf(bruto);
      if (n) return n;
    }
    return null;
  }

  async function lerEntrada(entrada, opcoes = {}) {
    let wc;
    if (entrada._catalogo) {
      // Item do painel sob demanda: abre (se preciso) numa view oculta e espera carregar. A identidade que a ponte guardou ao
      // listar é estável por item; a do documento carregado só vale daqui para frente (verificarDocumento).
      if (!entrada.legivel) throw new ErroContexto(CODIGOS.UNSUPPORTED_BROWSER_PAGE);
      if (opcoes.documento !== undefined && opcoes.documento !== entrada._catalogo.identidade()) throw new ErroContexto(CODIGOS.TAB_CHANGED);
      try { wc = await entrada._catalogo.materializar(); } catch (_) { throw new ErroContexto(CODIGOS.EXTRACTION_FAILED); }
      if (!wc || wc.isDestroyed()) throw new ErroContexto(CODIGOS.TAB_DESTROYED);
    } else {
      wc = entrada._aba.view.webContents;
      if (wc.isDestroyed()) throw new ErroContexto(CODIGOS.TAB_DESTROYED);
      if (!entrada.legivel) throw new ErroContexto(CODIGOS.UNSUPPORTED_BROWSER_PAGE);
    }
    const documento = identidadeDocumento(wc);
    if (!entrada._catalogo && opcoes.documento !== undefined && documento !== opcoes.documento) throw new ErroContexto(CODIGOS.TAB_CHANGED);
    const pedido = Number.isFinite(opcoes.maxCharacters) ? Math.trunc(opcoes.maxCharacters) : L.maxCaracteres;
    const o = { maxCaracteres: Math.min(Math.max(pedido, 1), L.maxCaracteres), maxNo: L.maxNo, maxLinks: L.maxLinks, maxLinhasTabela: L.maxLinhasTabela, maxEventos: L.maxEventos, timeoutMs: L.timeoutMs, timeoutPdfMs: L.timeoutPdfMs };
    // Faixa de páginas dos PDFs (1-based, inclusiva): { de, ate }. Inválida = INVALID_REQUEST; ausente = documento inteiro.
    if (opcoes.paginas !== undefined && opcoes.paginas !== null) {
      const p = opcoes.paginas;
      const ok = typeof p === 'object';
      const de = ok && p.de !== undefined ? p.de : 1;
      const ate = ok && p.ate !== undefined ? p.ate : L.maxPaginaPdf;
      if (!ok || !Number.isSafeInteger(de) || !Number.isSafeInteger(ate) || de < 1 || ate < de || ate > L.maxPaginaPdf) throw new ErroContexto(CODIGOS.INVALID_REQUEST);
      o.paginas = { de, ate };
    }
    const urlInicial = wc.getURL();
    const verificarDocumento = () => {
      if (wc.isDestroyed()) throw new ErroContexto(CODIGOS.TAB_DESTROYED);
      if (identidadeDocumento(wc) !== documento || wc.getURL() !== urlInicial) throw new ErroContexto(CODIGOS.TAB_CHANGED);
    };
    const exec = (codigo) => comTimeout(wc.executeJavaScriptInIsolatedWorld(mundo, [{ code: codigo }]));
    let generico; let eproc = null; let pdf = null; let incorporados = []; let avisosPdf = [];
    try {
      generico = await exec(codigoGenerico(o));
      verificarDocumento();
      if (entrada.tipo === 'eproc') eproc = await exec(codigoEproc(o));
      const achados = await leitorPdf.ler(wc, o, { identidade: documento });
      pdf = achados.principal;
      incorporados = achados.incorporados;
      avisosPdf = achados.avisos;
      if (!pdf && entrada.tipo === 'pdf') pdf = await lerPdf(wc, o);
    } catch (e) {
      verificarDocumento();
      throw new ErroContexto(e && e.message === 'timeout' ? CODIGOS.CONTENT_EXTRACTION_TIMEOUT : CODIGOS.EXTRACTION_FAILED);
    }
    verificarDocumento();
    if (!generico || typeof generico !== 'object') throw new ErroContexto(CODIGOS.EXTRACTION_FAILED);

    const avisosPainel = entrada._catalogo ? (() => { try { return entrada._catalogo.avisos() || []; } catch (_) { return []; } })() : [];
    const avisos = [...new Set([...(generico.avisos || []), ...((pdf && pdf.avisos) || []), ...avisosPdf, ...avisosPainel])];
    const truncado = avisos.some((a) => /LIMIT|TIMEOUT/.test(a)) || !!(eproc && eproc.truncado) || !!(pdf && pdf.truncado) || incorporados.some((p) => p.truncado);
    return {
      tabId: entrada.id,
      type: entrada.tipo,
      active: entrada.ativa,
      title: generico.titulo || entrada.titulo,
      url: generico.url,
      origin: generico.origem,
      processNumber: (eproc && eproc.numeroProcesso) || entrada.numeroProcesso,
      capturedAt: agora(),
      content: {
        language: generico.idioma,
        visibleText: generico.textoVisivel,
        selectedText: generico.textoSelecionado,
        headings: generico.titulos.map((h) => ({ level: h.nivel, text: h.texto })),
        tables: generico.tabelas,
        links: generico.links.map((l) => ({ text: l.texto, target: l.destino })),
        frames: generico.frames.map((f) => ({ index: f.indice, origin: f.origem, accessible: f.acessivel, ...(f.motivo ? { reason: f.motivo } : {}), ...(f.texto ? { title: f.titulo || '', text: f.texto, ...(f.truncado ? { truncated: true } : {}) } : {}) }))
      },
      eproc: eproc && {
        system: 'eproc',
        processNumber: eproc.numeroProcesso,
        currentPage: eproc.paginaAtual,
        events: eproc.eventos && eproc.eventos.map((ev) => ({ number: ev.numero, date: ev.data, description: ev.descricao, documents: ev.documentos.map((d) => ({ text: d.texto, target: d.destino })) })),
        openedDocument: eproc.documentoAberto && { action: eproc.documentoAberto.acao, event: eproc.documentoAberto.evento }
      },
      pdf: pdf && { totalPages: pdf.totalPaginas, ...(pdf.faixa ? { pageRange: { from: pdf.faixa.de, to: pdf.faixa.ate } } : {}), pages: pdf.paginas.map((p) => ({ page: p.pagina, text: p.texto })), textAvailable: pdf.textoDisponivel, requiresOcr: pdf.requerOcr },
      embeddedPdfs: incorporados.map((p) => (p.erro ? { url: V.enderecoSeguro(p.endereco), error: { code: p.erro } } : { url: V.enderecoSeguro(p.endereco), totalPages: p.totalPaginas, ...(p.faixa ? { pageRange: { from: p.faixa.de, to: p.faixa.ate } } : {}), pages: p.paginas.map((x) => ({ page: x.pagina, text: x.texto })), textAvailable: p.textoDisponivel, requiresOcr: p.requerOcr, truncated: p.truncado })),
      truncated: truncado,
      warnings: avisos
    };
  }

  async function lerPorId(id, opcoes) {
    const entrada = registry.resolver(id);
    if (!entrada) throw new ErroContexto(CODIGOS.TAB_NOT_FOUND);
    return lerEntrada(entrada, opcoes);
  }

  // Lê várias abas em paralelo; falha de uma não derruba as outras (a aba vira {tabId, error:{code}}).
  async function lerLote(entradas, opcoes) {
    const resultados = await Promise.allSettled(entradas.map((e) => lerEntrada(e, opcoes)));
    return resultados.map((r, i) => (r.status === 'fulfilled' ? r.value : { tabId: entradas[i].id, error: { code: r.reason instanceof ErroContexto ? r.reason.codigo : CODIGOS.EXTRACTION_FAILED } }));
  }

  async function listTabs() { return registry.listar().map(descreverEntrada); }
  async function getActiveTab() { const a = registry.ativa(); return a ? descreverEntrada(a) : null; }
  function getDocumentIdentity(tabId) {
    const entrada = registry.resolver(tabId);
    if (!entrada) return undefined;
    return entrada._catalogo ? entrada._catalogo.identidade() : identidadeDocumento(entrada._aba.view.webContents);
  }

  async function readTab(tabId, opcoes) {
    try {
      const r = await lerPorId(tabId, opcoes);
      registrar('readTab ok');
      return r;
    } catch (e) { registrar('readTab erro ' + (e.codigo || 'DESCONHECIDO')); throw e; }
  }

  async function readTabs(tabIds, opcoes) {
    const ids = V.validarIds(tabIds, L.maxAbasPorPedido);
    const conhecidas = new Map(registry.listar().map((e) => [e.id, e]));
    const entradas = ids.filter((id) => conhecidas.has(id)).map((id) => conhecidas.get(id));
    const lidas = await lerLote(entradas, opcoes);
    const porId = new Map(lidas.map((r) => [r.tabId, r]));
    const tabs = ids.map((id) => porId.get(id) || { tabId: id, error: { code: CODIGOS.TAB_NOT_FOUND } });
    registrar('readTabs abas=' + ids.length + ' erros=' + tabs.filter((t) => t.error).length);
    return { capturedAt: agora(), tabs };
  }

  async function readAllTabs(opcoes) {
    const todas = registry.listar().filter((e) => !e._catalogo); // itens do painel só são lidos quando pedidos por id
    const tabs = await lerLote(todas, opcoes);
    const ativa = todas.find((e) => e.ativa);
    registrar('readAllTabs abas=' + todas.length + ' erros=' + tabs.filter((t) => t.error).length);
    return { capturedAt: agora(), activeTabId: ativa ? ativa.id : null, tabs };
  }

  // Busca local sobre snapshots (texto visível, tabelas, páginas de PDF). Só os trechos encontrados saem daqui.
  async function findInTabs(query, tabIds) {
    const consulta = V.validarConsulta(query);
    const alvo = Array.isArray(tabIds) && tabIds.length ? V.validarIds(tabIds, L.maxAbasPorPedido) : null;
    // Itens do painel (sob demanda) só entram quando citados por id: uma busca geral não deve abrir todas as páginas do catálogo.
    const entradas = registry.listar().filter((e) => (alvo ? alvo.includes(e.id) : !e._catalogo));
    const lidas = await lerLote(entradas, {});
    const q = normalizar(consulta).out;
    const resultados = [];
    const semLeitura = [];
    for (const aba of lidas) {
      if (aba.error) { semLeitura.push({ tabId: aba.tabId, code: aba.error.code }); continue; }
      // Fontes específicas (evento, página de PDF) têm localização; o texto visível só entra onde elas não cobrem,
      // para o mesmo trecho não ser reportado mais de uma vez. Tabelas já estão contidas no texto visível.
      const especificas = [];
      if (aba.eproc && aba.eproc.events) for (const ev of aba.eproc.events) if (ev.description) especificas.push({ texto: ev.description, local: 'event:' + ev.number });
      if (aba.pdf) for (const p of aba.pdf.pages) if (p.text) especificas.push({ texto: p.text, local: 'page:' + p.page });
      const visivel = normalizar(aba.content.visibleText || '');
      const cobertas = [];
      for (const e of especificas) {
        const n = normalizar(e.texto).out;
        const i = n ? visivel.out.indexOf(n) : -1;
        if (i >= 0) cobertas.push([i, i + n.length]);
      }
      const fontes = [...especificas, { texto: aba.content.visibleText, local: null, cobertas }];
      let porAba = 0;
      for (const fonte of fontes) {
        if (!fonte.texto) continue;
        const { out, mapa } = normalizar(fonte.texto);
        let pos = out.indexOf(q);
        while (pos !== -1 && porAba < L.maxResultadosPorAba && resultados.length < L.maxResultadosBusca) {
          if (fonte.cobertas && fonte.cobertas.some(([a, b]) => pos >= a && pos < b)) { pos = out.indexOf(q, pos + q.length); continue; }
          const ini = mapa[pos];
          const fim = mapa[Math.min(pos + q.length - 1, mapa.length - 1)] + 1;
          porAba++;
          resultados.push({
            tabId: aba.tabId,
            occurrence: porAba,
            before: fonte.texto.slice(Math.max(0, ini - L.contextoBusca), ini),
            match: fonte.texto.slice(ini, fim),
            after: fonte.texto.slice(fim, fim + L.contextoBusca),
            location: fonte.local
          });
          pos = out.indexOf(q, pos + q.length);
        }
      }
    }
    registrar('findInTabs abas=' + entradas.length + ' ocorrencias=' + resultados.length);
    return { query: consulta, results: resultados, unreadable: semLeitura };
  }

  return { listTabs, getActiveTab, getDocumentIdentity, readTab, readTabs, readAllTabs, findInTabs };
}

module.exports = { MUNDO, normalizar, criarContextBroker };
