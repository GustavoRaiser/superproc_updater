'use strict';
// Contratos do SuperPROC para o shell da coluna do Copilot. Estes nomes (account, eligibility, consumer, browserContext)
// são interfaces próprias, NÃO APIs da Microsoft. Sem Electron: testável em Node puro.

const ESTADOS = Object.freeze(['inicializando', 'acesso-necessario', 'pronto', 'indisponivel', 'falha']);
const STATUS_CONTA = Object.freeze(['desconhecida', 'sem-sessao', 'autenticada', 'erro']);
const ELEGIBILIDADE = Object.freeze(['desconhecida', 'suportada', 'indisponivel']);
const ESTADOS_CONSUMIDOR = Object.freeze(['desmontado', 'montando', 'montado', 'erro']);
const ACOES = Object.freeze(['entrar', 'tentar-novamente', 'usar-habitual']);

const RE_CODIGO = /^[A-Z][A-Z0-9_]{1,39}$/;
const codigoSeguro = (c, padrao = 'ERRO_PROVEDOR') => (typeof c === 'string' && RE_CODIGO.test(c) ? c : padrao);

const METODOS = Object.freeze({
  account: ['obterEstado', 'entrar'],
  eligibility: ['avaliar'],
  consumer: ['montar', 'desmontar', 'estado'],
  browserContext: ['listarAbas', 'lerAba']
});

function exigirInterface(nome, obj) {
  const metodos = METODOS[nome];
  if (!metodos) throw Error('Interface desconhecida: ' + nome);
  if (!obj || typeof obj !== 'object') throw Error('Interface ' + nome + ' ausente');
  for (const m of metodos) if (typeof obj[m] !== 'function') throw Error('Interface ' + nome + ' sem o método ' + m);
  return obj;
}

// Estado mínimo da conta: somente um status e um código opcional. Qualquer outro campo (token, cookie, e-mail, nome) é descartado.
function normalizarConta(bruto) {
  const status = bruto && STATUS_CONTA.includes(bruto.status) ? bruto.status : 'erro';
  const motivo = bruto && bruto.motivo != null ? codigoSeguro(bruto.motivo) : null;
  return Object.freeze({ status, motivo });
}
function normalizarElegibilidade(bruto) {
  const estado = bruto && ELEGIBILIDADE.includes(bruto.estado) ? bruto.estado : 'desconhecida';
  const motivo = bruto && bruto.motivo != null ? codigoSeguro(bruto.motivo) : null;
  return Object.freeze({ estado, motivo });
}

// Erro estruturado devolvido a consumidores: só código e indicação de nova tentativa; nunca texto de página.
const erro = (codigo, retentavel = false) => ({ ok: false, erro: Object.freeze({ codigo, retentavel }) });

module.exports = { ESTADOS, STATUS_CONTA, ELEGIBILIDADE, ESTADOS_CONSUMIDOR, ACOES, codigoSeguro, exigirInterface, normalizarConta, normalizarElegibilidade, erro };
