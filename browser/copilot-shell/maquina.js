'use strict';
// Máquina de estados do shell: inicializando → acesso-necessario | pronto | indisponivel | falha.
// Os provedores (account, eligibility, consumer) são injetados; nenhum deles é consultado sobre licença real.
// "pronto" significa apenas que o consumidor montou com a elegibilidade informada pelo provedor, não que a conta tem licença.
const { exigirInterface, normalizarConta, normalizarElegibilidade, codigoSeguro } = require('./contratos');

function comPrazo(tarefa, ms, codigo) {
  let t;
  const prazo = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(Error(codigo), { codigo })), ms); });
  return Promise.race([Promise.resolve().then(tarefa), prazo]).finally(() => clearTimeout(t));
}

const ACAO_INVALIDA = { ok: false, erro: { codigo: 'ACAO_INVALIDA', retentavel: false } };

function criarMaquina({ account, eligibility, consumer, montarContexto = () => ({}), prazoMs = 10000, log = () => {} }) {
  exigirInterface('account', account); exigirInterface('eligibility', eligibility); exigirInterface('consumer', consumer);
  const ouvintes = new Set();
  let geracao = 0;
  let estado = Object.freeze({ estado: 'inicializando', motivo: null, acoes: [], conta: 'desconhecida', elegibilidade: 'desconhecida', consumidor: 'desmontado' });
  const reg = (m) => { try { log('COPILOT_SHELL', m); } catch (_) { /* log nunca derruba o shell */ } };
  const consumidorEstado = () => { try { return consumer.estado(); } catch (_) { return 'erro'; } };

  function definir(parcial, minha) {
    if (minha !== geracao) return false; // execução antiga: ignorada
    const anterior = estado.estado;
    estado = Object.freeze({ ...estado, ...parcial });
    if (anterior !== estado.estado) reg('estado ' + anterior + ' -> ' + estado.estado + (estado.motivo ? ' (' + estado.motivo + ')' : ''));
    for (const f of ouvintes) { try { f(estado); } catch (_) { /* ouvinte não afeta a máquina */ } }
    return true;
  }
  const falhar = (e, minha, padrao = 'ERRO_PROVEDOR') => definir({ estado: 'falha', motivo: codigoSeguro(e && e.codigo, padrao), acoes: ['tentar-novamente', 'usar-habitual'], consumidor: consumidorEstado() }, minha);

  async function desmontarConsumidor() {
    try { if (consumidorEstado() !== 'desmontado') await comPrazo(() => consumer.desmontar(), prazoMs, 'TIMEOUT_DESMONTAR'); } catch (_) { /* segue */ }
  }

  async function avaliarEMontar(contaEstado, minha) {
    let elegib;
    try { elegib = normalizarElegibilidade(await comPrazo(() => eligibility.avaliar(contaEstado), prazoMs, 'TIMEOUT_ELEGIBILIDADE')); }
    catch (e) { return falhar(e, minha); }
    if (minha !== geracao) return false;
    if (elegib.estado === 'indisponivel') return definir({ estado: 'indisponivel', motivo: elegib.motivo || 'INDISPONIVEL', acoes: ['usar-habitual'], elegibilidade: 'indisponivel' }, minha);
    if (elegib.estado === 'desconhecida') return definir({ estado: 'indisponivel', motivo: elegib.motivo || 'ELEGIBILIDADE_DESCONHECIDA', acoes: ['tentar-novamente', 'usar-habitual'], elegibilidade: 'desconhecida' }, minha);
    definir({ elegibilidade: 'suportada', consumidor: 'montando' }, minha);
    try { await comPrazo(() => consumer.montar(montarContexto()), prazoMs, 'TIMEOUT_MONTAR'); }
    catch (e) { return falhar(e, minha, 'FALHA_MONTAR'); }
    if (minha !== geracao) { await desmontarConsumidor(); return false; }
    return definir({ estado: 'pronto', motivo: null, acoes: [], consumidor: consumidorEstado() }, minha);
  }

  function aplicarConta(conta, minha) {
    definir({ conta: conta.status }, minha);
    if (conta.status === 'erro') { definir({ estado: 'falha', motivo: conta.motivo || 'ERRO_CONTA', acoes: ['tentar-novamente', 'usar-habitual'] }, minha); return null; }
    if (conta.status === 'sem-sessao') { definir({ estado: 'acesso-necessario', motivo: conta.motivo, acoes: ['entrar', 'usar-habitual'] }, minha); return null; }
    return avaliarEMontar(conta, minha);
  }

  async function iniciar() {
    const minha = ++geracao;
    await desmontarConsumidor();
    definir({ estado: 'inicializando', motivo: null, acoes: [], conta: 'desconhecida', elegibilidade: 'desconhecida', consumidor: 'desmontado' }, minha);
    let conta;
    try { conta = normalizarConta(await comPrazo(() => account.obterEstado(), prazoMs, 'TIMEOUT_CONTA')); }
    catch (e) { return falhar(e, minha); }
    if (minha !== geracao) return false;
    return aplicarConta(conta, minha);
  }

  async function entrar() {
    if (estado.estado !== 'acesso-necessario') return ACAO_INVALIDA;
    const minha = ++geracao;
    definir({ estado: 'inicializando', acoes: [] }, minha);
    let conta;
    try { conta = normalizarConta(await comPrazo(() => account.entrar(), prazoMs, 'TIMEOUT_ENTRAR')); }
    catch (e) { falhar(e, minha); return { ok: true }; }
    if (minha === geracao) await aplicarConta(conta, minha);
    return { ok: true };
  }

  async function tentarNovamente() {
    if (!estado.acoes.includes('tentar-novamente')) return ACAO_INVALIDA;
    await iniciar();
    return { ok: true };
  }

  async function encerrar() { geracao++; await desmontarConsumidor(); }

  return { iniciar, entrar, tentarNovamente, encerrar, estado: () => estado, aoMudar: (f) => { ouvintes.add(f); return () => ouvintes.delete(f); } };
}

module.exports = { criarMaquina, comPrazo, ACAO_INVALIDA };
