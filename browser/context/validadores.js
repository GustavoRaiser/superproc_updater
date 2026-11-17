'use strict';
// Validação de entradas do ContextBroker. Nada daqui toca em webContents.
const { CODIGOS, ErroContexto, LIMITES } = require('./tipos');

const RE_ID = /^tab_[0-9a-f]{8}$/;
const RE_PDF = /\.pdf$/i;
const RE_CNJ = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

const ehIdOpaco = (id) => typeof id === 'string' && RE_ID.test(id);

function validarIds(ids, max = LIMITES.maxAbasPorPedido) {
  if (!Array.isArray(ids) || !ids.length || ids.length > max) throw new ErroContexto(CODIGOS.INVALID_REQUEST, 'Lista de abas inválida.');
  const unicos = [...new Set(ids)];
  if (!unicos.every(ehIdOpaco)) throw new ErroContexto(CODIGOS.INVALID_REQUEST, 'Identificador de aba inválido.');
  return unicos;
}

function validarConsulta(q) {
  if (typeof q !== 'string') throw new ErroContexto(CODIGOS.INVALID_REQUEST, 'Consulta inválida.');
  const t = q.trim();
  if (!t || t.length > LIMITES.maxConsulta) throw new ErroContexto(CODIGOS.INVALID_REQUEST, 'Consulta vazia ou longa demais.');
  return t;
}

// Só páginas web comuns são legíveis. Esquemas internos do navegador, locais ou de script ficam de fora.
function urlLegivel(url) {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

// Endereço sem consulta nem fragmento: podem carregar sessão ou identificadores.
function enderecoSeguro(url) {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return ''; }
}
function origemDe(url) {
  try { const u = new URL(url); return u.origin === 'null' ? '' : u.origin; } catch { return ''; }
}

function formatarCnj(digitos) {
  const d = String(digitos || '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`;
}

function numeroProcessoDeAba(url, titulo) {
  try {
    const n = formatarCnj(new URL(url).searchParams.get('num_processo'));
    if (n) return n;
  } catch { /* sem número na URL */ }
  const m = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.exec(String(titulo || ''));
  return m ? m[0] : null;
}

module.exports = { RE_PDF, RE_CNJ, ehIdOpaco, validarIds, validarConsulta, urlLegivel, enderecoSeguro, origemDe, formatarCnj, numeroProcessoDeAba };
