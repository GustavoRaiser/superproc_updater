'use strict';
// Tipos e constantes do ContextBroker (leitura interna de abas). Sem Electron.

const CODIGOS = Object.freeze({
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  TAB_DESTROYED: 'TAB_DESTROYED',
  TAB_CHANGED: 'TAB_CHANGED',
  UNSUPPORTED_BROWSER_PAGE: 'UNSUPPORTED_BROWSER_PAGE',
  CONTENT_EXTRACTION_TIMEOUT: 'CONTENT_EXTRACTION_TIMEOUT',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST'
});

class ErroContexto extends Error {
  constructor(codigo, mensagem) {
    super(mensagem || codigo);
    this.name = 'ErroContexto';
    this.codigo = codigo;
  }
}

const LIMITES = Object.freeze({
  maxCaracteres: 100000,
  maxNo: 20000,
  maxLinks: 1000,
  maxLinhasTabela: 5000,
  maxEventos: 2000,
  timeoutMs: 10000,
  maxAbasPorPedido: 50,
  maxConsulta: 200,
  maxResultadosBusca: 50,
  maxResultadosPorAba: 10,
  contextoBusca: 80
});

const TIPOS_ABA = Object.freeze(['eproc', 'pdf', 'outro']);

module.exports = { CODIGOS, ErroContexto, LIMITES, TIPOS_ABA };
