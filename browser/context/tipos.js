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

// Teto de texto por leitura (página + quadros + PDFs). 2026-11-21: elevado de 100 mil para 10 milhões de caracteres, a pedido do
// responsável ("tanto quanto tecnicamente possível"). Por que 10 milhões: ~20 MB em memória e ~10-15 MB serializados, folgado para o
// IPC do Electron e muito abaixo do limite de string do V8 (~512 M); acima disso nenhum modelo do Copilot aproveita o texto (≈2,5 M
// tokens). Para PDFs maiores, ler por faixa de páginas (opção `paginas` de readTab).
const LIMITES = Object.freeze({
  maxCaracteres: 10000000,
  maxNo: 20000,
  maxLinks: 1000,
  maxLinhasTabela: 5000,
  maxEventos: 2000,
  timeoutMs: 30000,
  // Prazo próprio do PDF (leitor pdf.js na página, download e extração no processo principal): PDFs de centenas de páginas
  // precisam de mais tempo que o DOM. Ao estourar, o texto lido até ali é devolvido com truncated=true.
  timeoutPdfMs: 180000,
  maxPaginaPdf: 100000,
  maxAbasPorPedido: 50,
  maxConsulta: 200,
  maxResultadosBusca: 50,
  maxResultadosPorAba: 10,
  contextoBusca: 80
});

const TIPOS_ABA = Object.freeze(['eproc', 'pdf', 'outro']);

module.exports = { CODIGOS, ErroContexto, LIMITES, TIPOS_ABA };
