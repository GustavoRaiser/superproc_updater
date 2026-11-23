'use strict';
// Registro das abas que o navegador gerencia. É a única porta de entrada do ContextBroker: nada aqui enumera
// webContents.getAllWebContents(), então a coluna do Copilot e demais views do app nunca aparecem.
// Ids são opacos e por sessão (não revelam o id interno do navegador).
const crypto = require('node:crypto');
const V = require('./validadores');
const pdfEmbutido = require('./pdf-embutido');

const documentos = new WeakMap();

function identidadeDocumento(wc) {
  if (!documentos.has(wc)) {
    const renovar = () => documentos.set(wc, Symbol());
    renovar();
    // O Electron emite did-navigate para o quadro principal, inclusive em recargas.
    wc.on?.('did-navigate', renovar);
    wc.on?.('render-process-gone', renovar);
  }
  return documentos.get(wc);
}

function classificarPadrao(url) {
  let u;
  try { u = new URL(url); } catch { return 'outro'; }
  if (V.RE_PDF.test(u.pathname)) return 'pdf';
  if (u.hostname === 'jus.br' || u.hostname.endsWith('.jus.br')) return 'eproc';
  return 'outro';
}

// `catalogo` (opcional): itens do painel (acessos rápidos) marcados "visíveis ao Copilot". Entram na lista como abas "sob demanda":
// o Copilot sabe que existem; o conteúdo só é carregado quando ele pede (materializar). Contrato do objeto:
//   listar() -> [{ itemId, titulo, url, categoria }]; view(itemId) -> webContents vivo ou null; identidade(itemId) -> Symbol estável;
//   avisos(itemId) -> [string]; materializar(itemId) -> Promise<webContents> (abre numa view oculta do painel e espera carregar).
const MAX_ITENS_CATALOGO = 30;

function criarTabRegistry({ getTabs, getActiveTabId, classificar = classificarPadrao, catalogo = null }) {
  const ids = new WeakMap(); // objeto da aba -> id opaco
  const usados = new Set();
  const idDe = (aba) => {
    if (!ids.has(aba)) {
      let id;
      do { id = 'tab_' + crypto.randomBytes(4).toString('hex'); } while (usados.has(id));
      usados.add(id);
      ids.set(aba, id);
    }
    return ids.get(aba);
  };
  const grupos = new Map(); // groupId interno -> id opaco do grupo
  const idDeGrupo = (g) => {
    if (!grupos.has(g)) grupos.set(g, 'grp_' + crypto.randomBytes(4).toString('hex'));
    return grupos.get(g);
  };
  const vivo = (aba) => !!aba && !aba.isEmptyState && !!aba.view && !!aba.view.webContents && !aba.view.webContents.isDestroyed();

  function descrever(aba) {
    // O campo da aba só é atualizado nos eventos de navegação; sub-abas abertas por window.open (a árvore, por exemplo)
    // podem ficar com endereço/título vazios até um F5. A fonte da verdade é o webContents vivo.
    let url = String(aba.url || '');
    let titulo = String(aba.title || '');
    const wc = aba.view && aba.view.webContents;
    let documentoPdf = false;
    if (wc && !wc.isDestroyed()) {
      try {
        // Com o leitor pdf.js no topo, o endereço da aba é o da extensão: o do PDF vem no parâmetro `file`.
        if (!V.urlLegivel(url)) url = pdfEmbutido.enderecoLogico(url);
        if (!V.urlLegivel(url)) { const vivoUrl = pdfEmbutido.enderecoLogico(String(wc.getURL() || '')); if (V.urlLegivel(vivoUrl)) url = vivoUrl; }
        if (!titulo.trim()) titulo = String(wc.getTitle() || '');
        documentoPdf = pdfEmbutido.documentoEhPdf(wc); // o documento da aba é o próprio PDF (leitor pdf.js ou visualizador nativo)
      } catch (_) { /* usa o que a aba tem */ }
    }
    return {
      id: idDe(aba),
      tipo: documentoPdf ? 'pdf' : classificar(url),
      titulo,
      url,
      ativa: aba.id === getActiveTabId(),
      numeroProcesso: V.numeroProcessoDeAba(url, titulo) || (typeof aba.procNumber === 'string' ? aba.procNumber : null),
      // Aba unificada do SuperPROC: a capa, a árvore e o editor de um processo são abas internas (sub-abas) de um grupo
      // que a barra mostra como uma só. O identificador do grupo é opaco e por sessão (não revela o id interno).
      grupo: aba.groupId ? idDeGrupo(aba.groupId) : null,
      papel: ['capa', 'arvore', 'editor'].includes(aba.processRole) ? aba.processRole : null,
      legivel: V.urlLegivel(url),
      _aba: aba
    };
  }

  const idsCatalogo = new Map(); // itemId do painel -> id opaco (estável na sessão)
  const idDeCatalogo = (itemId) => {
    if (!idsCatalogo.has(itemId)) {
      let id;
      do { id = 'tab_' + crypto.randomBytes(4).toString('hex'); } while (usados.has(id));
      usados.add(id); idsCatalogo.set(itemId, id);
    }
    return idsCatalogo.get(itemId);
  };
  function descreverCatalogo(item) {
    const itemId = item.itemId;
    return {
      id: idDeCatalogo(itemId), tipo: 'outro', titulo: String(item.titulo || ''), url: String(item.url || ''), ativa: false,
      numeroProcesso: null, grupo: null, papel: null, legivel: V.urlLegivelNoCatalogo(item.url),
      sobDemanda: true, carregada: !!catalogo.view(itemId),
      // _aba de um item do painel NÃO é uma aba do navegador: ferramentas que operam abas (trocar, recarregar, fechar) a recusam.
      _aba: { catalogo: true, painelItemId: itemId },
      _catalogo: { materializar: () => catalogo.materializar(itemId), identidade: () => catalogo.identidade(itemId), avisos: () => catalogo.avisos(itemId) }
    };
  }
  const doCatalogo = () => {
    if (!catalogo) return [];
    try { return (catalogo.listar() || []).slice(0, MAX_ITENS_CATALOGO).filter((i) => i && i.itemId && V.urlLegivelNoCatalogo(i.url)).map(descreverCatalogo); } catch (_) { return []; }
  };
  const listar = () => [...getTabs().filter(vivo).map(descrever), ...doCatalogo()];
  const resolver = (id) => (V.ehIdOpaco(id) ? listar().find((e) => e.id === id) || null : null);
  const ativa = () => listar().find((e) => e.ativa) || null;

  return { listar, resolver, ativa };
}

module.exports = { criarTabRegistry, classificarPadrao, identidadeDocumento };
