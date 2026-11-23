'use strict';
// Mapa de identificadores para a ponte do cr-host. Camada: host (processo principal).
// O TabRegistry usa ids opacos em texto (tab_xxxxxxxx); os contratos do Edge 157 pedem `id` inteiro para
// abas (chrome.tabs) e `documentId` em texto para o quadro principal (chrome.webNavigation.getAllFrames).
// Nada aqui revela o id interno da aba nem a identidade do documento: os dois valores são sorteados.
// Um documentId vale só para o documento que estava carregado quando foi emitido (anti-TOCTOU).
const crypto = require('node:crypto');

function criarMapaDeAbas({ aleatorio = (n) => crypto.randomBytes(n), base } = {}) {
  // Base alta e sorteada por sessão: um id guardado pela página de uma execução anterior não coincide por acaso.
  let proximo = Number.isSafeInteger(base) ? base : 100000 + (aleatorio(3).readUIntBE(0, 3) % 800000);
  const numeroPorAba = new Map();   // id opaco -> id inteiro
  const abaPorNumero = new Map();   // id inteiro -> id opaco
  const documentoPorAba = new Map(); // id opaco -> { identidade, documentId }
  const documentos = new Map();     // documentId -> { idInterno, identidade }

  function numeroDe(idInterno) {
    if (typeof idInterno !== 'string' || !idInterno) return null;
    if (!numeroPorAba.has(idInterno)) {
      const n = proximo++;
      numeroPorAba.set(idInterno, n);
      abaPorNumero.set(n, idInterno);
    }
    return numeroPorAba.get(idInterno);
  }

  function internoDe(numero) {
    return Number.isSafeInteger(numero) && abaPorNumero.has(numero) ? abaPorNumero.get(numero) : null;
  }

  // Mesmo documento => mesmo documentId; documento novo na aba => id novo e o anterior deixa de resolver.
  function emitirDocumento(idInterno, identidade) {
    if (numeroDe(idInterno) === null || identidade === undefined) return null;
    const atual = documentoPorAba.get(idInterno);
    if (atual && atual.identidade === identidade) return atual.documentId;
    if (atual) documentos.delete(atual.documentId);
    const documentId = aleatorio(16).toString('hex').toUpperCase();
    documentoPorAba.set(idInterno, { identidade, documentId });
    documentos.set(documentId, { idInterno, identidade });
    return documentId;
  }

  function resolverDocumento(documentId) {
    if (typeof documentId !== 'string') return null;
    const d = documentos.get(documentId);
    return d ? { idInterno: d.idInterno, numero: numeroPorAba.get(d.idInterno), identidade: d.identidade } : null;
  }

  // Esquece abas que não existem mais. Retorna os ids inteiros removidos.
  function sincronizar(idsVivos) {
    const vivos = new Set(idsVivos);
    const removidos = [];
    for (const [idInterno, numero] of numeroPorAba) {
      if (vivos.has(idInterno)) continue;
      numeroPorAba.delete(idInterno);
      abaPorNumero.delete(numero);
      const d = documentoPorAba.get(idInterno);
      if (d) { documentos.delete(d.documentId); documentoPorAba.delete(idInterno); }
      removidos.push(numero);
    }
    return removidos;
  }

  return { numeroDe, internoDe, emitirDocumento, resolverDocumento, sincronizar };
}

module.exports = { criarMapaDeAbas };
