'use strict';
// Motor de consentimento da ponte do cr-host. Camada: host (processo principal).
// Reproduz a preferência `browser.underside_chat_consent` do Edge 157 (enum ConsentStatus):
//   0 = kNotPresent (ainda sem decisão) · 1 = kAccepted · 2 = kDeclined.
// No Edge o switch de edge://settings/ai e o cartão "O Copilot deseja usar o conteúdo no seu navegador"
// gravam a mesma preferência (2 - decisão). Aqui, do mesmo modo, o item do menu do Copilot, o switch de
// CFG → Configurações e o cartão passam todos por `definir`.
// A página remota nunca altera este estado: só uma ação local da pessoa usuária chega a `definir`.
// Logs: somente códigos. Dependências injetadas para testar sem Electron.
const crypto = require('node:crypto');

const ESTADO = Object.freeze({ SEM_DECISAO: 0, ACEITO: 1, NEGADO: 2 });
const CHAVE_CONSENTIMENTO = 'browser.underside_chat_consent';

const normalizar = (v) => (v === ESTADO.ACEITO || v === ESTADO.NEGADO ? v : ESTADO.SEM_DECISAO);

function criarConsentimento({ ler, gravar, mostrarCartao, uuid = () => crypto.randomUUID(), log = () => {} }) {
  if (typeof ler !== 'function' || typeof gravar !== 'function') throw Error('Armazenamento de consentimento ausente');
  const reg = (m) => { try { log('COPILOT_PONTE_CONSENTIMENTO', m); } catch (_) { /* log nunca derruba o fluxo */ } };
  const aoMudarOuvintes = new Set();
  const aoFecharOuvintes = new Set();
  let pendente = null; // { ids: [requestId...], cancelar }

  const estado = () => normalizar(ler());
  const emitir = (ouvintes, ...args) => { for (const f of [...ouvintes]) { try { f(...args); } catch (_) { /* ouvinte isolado */ } } };

  // Única porta de escrita. `permitir` precisa ser booleano: qualquer outra coisa é recusada.
  async function definir(permitir) {
    if (typeof permitir !== 'boolean') return false;
    const novo = permitir ? ESTADO.ACEITO : ESTADO.NEGADO;
    const anterior = estado();
    let salvo = false;
    try { salvo = (await gravar(novo)) !== false; } catch (_) { salvo = false; }
    if (!salvo) { reg('GRAVACAO_FALHOU'); return false; }
    if (novo !== anterior) { reg(permitir ? 'ACEITO' : 'NEGADO'); emitir(aoMudarOuvintes, novo); }
    // Uma decisão tomada fora do cartão (menu, Configurações) também encerra o cartão que estiver aberto.
    concluir(permitir, false);
    return true;
  }

  function concluir(permitir, cartaoJaFechado) {
    if (!pendente) return;
    const atual = pendente;
    pendente = null;
    if (!cartaoJaFechado) { try { atual.cancelar(); } catch (_) { /* cartão já fechado */ } }
    for (const id of atual.ids) emitir(aoFecharOuvintes, id, permitir ? 'accepted' : 'declined');
  }

  // Abre o cartão (um por vez; pedidos simultâneos compartilham o mesmo cartão) e devolve o id do pedido na hora,
  // como chat.triggerConsentDialog. A decisão chega depois por `aoFechar(requestId, 'accepted' | 'declined')`.
  function pedir() {
    const id = uuid();
    if (pendente) { pendente.ids.push(id); return id; }
    if (typeof mostrarCartao !== 'function') {
      // Sem superfície para perguntar não há como obter uma decisão: responde negado sem gravar nada.
      queueMicrotask(() => emitir(aoFecharOuvintes, id, 'declined'));
      return id;
    }
    let cancelado = false;
    const meu = { ids: [id], cancelar: () => { cancelado = true; } };
    pendente = meu;
    reg('CARTAO_ABERTO');
    let promessa;
    try {
      promessa = Promise.resolve(mostrarCartao({ aoCancelar: (f) => { meu.cancelar = () => { cancelado = true; try { f(); } catch (_) { /* já fechado */ } }; } }));
    } catch (e) { promessa = Promise.reject(e); }
    promessa.then(async (resposta) => {
      if (pendente !== meu || cancelado) return;
      if (resposta === 'permitir' || resposta === 'negar') {
        // `definir` conclui o pedido pendente; se a gravação falhar, o pedido é encerrado como negado.
        if (!(await definir(resposta === 'permitir')) && pendente === meu) concluir(false, true);
      } else if (pendente === meu) {
        // Cartão fechado sem escolha (coluna navegou, janela fechou): nada é gravado.
        reg('CARTAO_SEM_DECISAO');
        concluir(false, true);
      }
    }, () => { if (pendente === meu) { reg('CARTAO_FALHOU'); concluir(false, true); } });
    return id;
  }

  // A página saiu: o cartão some e os pedidos em aberto ficam sem resposta (a porta deles já não existe).
  function cancelarPendentes() {
    if (!pendente) return;
    const atual = pendente;
    pendente = null;
    try { atual.cancelar(); } catch (_) { /* cartão já fechado */ }
  }

  return {
    estado,
    aceito: () => estado() === ESTADO.ACEITO,
    definir,
    pedir,
    cartaoAberto: () => !!pendente,
    cancelarPendentes,
    aoMudar: (f) => { aoMudarOuvintes.add(f); return () => aoMudarOuvintes.delete(f); },
    aoFechar: (f) => { aoFecharOuvintes.add(f); return () => aoFecharOuvintes.delete(f); }
  };
}

module.exports = { ESTADO, CHAVE_CONSENTIMENTO, normalizar, criarConsentimento };
