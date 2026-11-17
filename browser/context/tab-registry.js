'use strict';
// Registro das abas que o navegador gerencia. É a única porta de entrada do ContextBroker: nada aqui enumera
// webContents.getAllWebContents(), então a coluna do Copilot e demais views do app nunca aparecem.
// Ids são opacos e por sessão (não revelam o id interno do navegador).
const crypto = require('node:crypto');
const V = require('./validadores');

function classificarPadrao(url) {
  let u;
  try { u = new URL(url); } catch { return 'outro'; }
  if (V.RE_PDF.test(u.pathname)) return 'pdf';
  if (u.hostname === 'jus.br' || u.hostname.endsWith('.jus.br')) return 'eproc';
  return 'outro';
}

function criarTabRegistry({ getTabs, getActiveTabId, classificar = classificarPadrao }) {
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
  const vivo = (aba) => !!aba && !aba.isEmptyState && !!aba.view && !!aba.view.webContents && !aba.view.webContents.isDestroyed();

  function descrever(aba) {
    const url = String(aba.url || '');
    return {
      id: idDe(aba),
      tipo: classificar(url),
      titulo: String(aba.title || ''),
      url,
      ativa: aba.id === getActiveTabId(),
      numeroProcesso: V.numeroProcessoDeAba(url, aba.title),
      legivel: V.urlLegivel(url),
      _aba: aba
    };
  }

  const listar = () => getTabs().filter(vivo).map(descrever);
  const resolver = (id) => (V.ehIdOpaco(id) ? listar().find((e) => e.id === id) || null : null);
  const ativa = () => listar().find((e) => e.ativa) || null;

  return { listar, resolver, ativa };
}

module.exports = { criarTabRegistry, classificarPadrao };
