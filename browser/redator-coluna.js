'use strict';
// Ponte do Assistente de Redação com a COLUNA do Copilot (experimental, opt-in --redator). Camada: host.
// Faz o que a interface do Outlook faz com o painel dele: entrega o trecho como CITAÇÃO + um prompt pronto, com envio automático,
// e devolve o texto da resposta para a aba aplicar (com confirmação da pessoa, feita na aba — ver redator-linha.js).
//
// Entrega: a página da coluna expõe window.__crHostContextualHandInAppStore__ = { store, execute } ("contextual hand-in", o destino
// final do evento chat.onAskCopilot do Edge). execute(store, promptInputData) aceita promptText/isDraft/isNewChat e queryAnnotations;
// uma anotação do tipo Quote vira o cartão de citação e segue ao servidor em message.messageAnnotations. Nada é digitado nem colado,
// nenhum iframe, nenhum token. Evidência e limites: achados O38–O43 em v_base/docs/estudos/copilot-edge-157/captura-outlook/ACHADOS.md.
// A entrada é INTERNA da Microsoft e pode mudar: se não existir, a entrega falha com ENTRADA_AUSENTE (nada é enviado por outro caminho).
//
// Leitura da resposta: pelo depurador do próprio webContents da coluna (Network.webSocketFrame*), só enquanto um pedido está em
// curso. Lê os quadros SignalR do chat: acha o pedido pelo id da citação (ou pelo texto do prompt), acompanha os "update" e fecha no
// quadro de conclusão (type 2). Se o depurador não puder ser anexado (DevTools aberto na coluna), o pedido é enviado assim mesmo e a
// aba avisa que a resposta ficou só na coluna.

const SEP = '\u001e'; // separador de registros do SignalR
const LIMITES = Object.freeze({ trecho: 20000, vizinho: 1500, instrucao: 2000, resposta: 60000 });
// Com citação o prompt vai puro: o Copilot já devolve só o texto novo (decisão do responsável, 2026-11-23). Sem citação
// (campo vazio) não há esse contexto, então o pedido leva a instrução de formato.
const SUFIXO_REDACAO = ' Responda apenas com o texto pedido, sem comentários, sem aspas e sem formatação Markdown.';

const recorte = (v, n) => String(v == null ? '' : v).slice(0, n);

// Texto que vai ao Copilot como pedido: a instrução (pronta ou digitada) + a regra de formato da resposta.
function textoDoPedido(instrucao, temTrecho) {
  const base = recorte(instrucao, LIMITES.instrucao).trim().replace(/\s+$/, '');
  if (!base) return '';
  return base + (/[.!?…:]$/.test(base) ? '' : '.') + (temTrecho ? '' : SUFIXO_REDACAO);
}

// Anotação de citação no vocabulário do app do Copilot (a mesma forma que o Outlook produz; ver O33/O41).
function montarAnotacao({ id, trecho, antes = '', depois = '' }) {
  const texto = recorte(trecho, LIMITES.trecho);
  return {
    id: String(id), queryAnnotationType: 'Quote', text: texto, messageAnnotationSource: 'ClientAnnotated',
    messageAnnotationMetadata: {
      '@type': 'Message',
      selectedContentContext: { selectedContents: [{ '@type': 'Text', selectedContent: texto, startOffset: 0 }] },
      precedingText: recorte(String(antes).slice(-LIMITES.vizinho), LIMITES.vizinho), followingText: recorte(depois, LIMITES.vizinho)
    }
  };
}

// promptInputData entregue à coluna. Sem trecho (campo vazio): só o pedido, para redigir no cursor.
function montarEntrega({ id, instrucao, trecho = '', antes = '', depois = '', novoChat = false }) {
  const temTrecho = String(trecho).trim().length > 0;
  const promptText = textoDoPedido(instrucao, temTrecho);
  if (!promptText) return null;
  const dados = { promptText, isDraft: false, isNewChat: novoChat === true };
  if (temTrecho) dados.queryAnnotations = [montarAnotacao({ id, trecho, antes, depois })];
  return dados;
}

// Código executado no mundo principal da página da coluna. Devolve { ok } | { ok:false, motivo }.
function scriptEntrega(dados) {
  const arg = JSON.stringify(dados).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '(async (d) => { const h = window.__crHostContextualHandInAppStore__;' +
    ' if (!h || typeof h.execute !== "function" || !h.store) return { ok: false, motivo: "ENTRADA_AUSENTE" };' +
    ' try { await h.execute(h.store, d); return { ok: true }; } catch (e) { return { ok: false, motivo: "ENTREGA_FALHOU" }; } })(' + arg + ')';
}

function partesSignalR(payload) {
  const out = [];
  for (const p of String(payload == null ? '' : payload).split(SEP)) { if (!p) continue; try { const o = JSON.parse(p); if (o && typeof o === 'object') out.push(o); } catch (_) { /* quadro que não é JSON */ } }
  return out;
}

const ehRespostaDoBot = (m) => !!m && m.author === 'bot' && !m.messageType && typeof m.text === 'string' && m.text.trim().length > 0;

// Máquina de estados pura do acompanhamento de UM pedido. aoEnviado/aoRecebido recebem (idDoSocket, payload) e devolvem o estado.
// Estados: 'aguardando-envio' -> 'respondendo' -> 'pronto' | 'erro'.
function criarAcompanhamento({ idCitacao = '', textoPrompt = '' } = {}) {
  let socket = null; let estado = 'aguardando-envio'; let texto = ''; let motivo = '';
  const meuPedido = (d) => {
    if (d.target !== 'chat') return false;
    const m = ((d.arguments || [])[0] || {}).message; if (!m) return false;
    if (idCitacao && Array.isArray(m.messageAnnotations) && m.messageAnnotations.some((a) => a && a.id === idCitacao)) return true;
    return !!textoPrompt && typeof m.text === 'string' && m.text.trim() === textoPrompt.trim();
  };
  const situacao = () => ({ estado, texto, motivo });
  return {
    situacao,
    aoEnviado(idSocket, payload) {
      if (estado !== 'aguardando-envio') return situacao();
      for (const d of partesSignalR(payload)) if (meuPedido(d)) { socket = idSocket; estado = 'respondendo'; break; }
      return situacao();
    },
    aoRecebido(idSocket, payload) {
      if (estado !== 'respondendo' || idSocket !== socket) return situacao();
      for (const d of partesSignalR(payload)) {
        if (d.target === 'update') {
          for (const m of (((d.arguments || [])[0] || {}).messages || [])) if (ehRespostaDoBot(m)) texto = m.text;
        } else if (d.type === 2 && d.item) {
          const finais = (d.item.messages || []).filter(ehRespostaDoBot);
          if (finais.length) texto = finais[finais.length - 1].text;
          const valor = d.item.result && d.item.result.value;
          if (valor && valor !== 'Success') { estado = 'erro'; motivo = 'COPILOT_' + recorte(String(valor).replace(/[^A-Za-z0-9_]/g, ''), 40).toUpperCase(); }
          else if (texto.trim()) estado = 'pronto';
          else { estado = 'erro'; motivo = 'RESPOSTA_VAZIA'; }
          return situacao();
        }
      }
      return situacao();
    }
  };
}

// Tira da resposta o que não é o texto pedido: cerca de código, aspas em volta e marcas de referência do Copilot.
function limparResposta(texto) {
  let t = String(texto == null ? '' : texto).replace(/\r\n/g, '\n').trim();
  const cerca = t.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (cerca) t = cerca[1].trim();
  t = t.replace(/\[\^\d+\^\]/g, '').replace(/【[^】]{0,40}】/g, '');
  const aspas = t.match(/^["“]([\s\S]*)["”]$/);
  if (aspas && !/["“”]/.test(aspas[1])) t = aspas[1].trim();
  return t.slice(0, LIMITES.resposta);
}

// deps: { getColunaWc()->webContents|null, mostrarColuna(), aceitarDestino(wc)->bool (opcional), novoChat (bool), prazoMs, log }
function criarPonteColuna(deps = {}) {
  const { getColunaWc = () => null, mostrarColuna = () => {}, aceitarDestino = null, log = () => {} } = deps;
  const prazoMs = Number(deps.prazoMs) > 0 ? Number(deps.prazoMs) : 120000;
  let emCurso = null; // { id, encerrar(resultado) }

  async function pedir({ id, instrucao, trecho = '', antes = '', depois = '' } = {}) {
    if (emCurso) return { ok: false, motivo: 'OCUPADO' };
    const dados = montarEntrega({ id, instrucao, trecho, antes, depois, novoChat: deps.novoChat === true });
    if (!dados) return { ok: false, motivo: 'PEDIDO_VAZIO' };
    const wc = getColunaWc();
    if (!wc || wc.isDestroyed()) return { ok: false, motivo: 'COPILOT_INDISPONIVEL' };
    if (aceitarDestino) { let aceito = false; try { aceito = !!aceitarDestino(wc); } catch (_) { aceito = false; } if (!aceito) return { ok: false, motivo: 'COPILOT_FORA_DO_CHAT' }; }
    try { mostrarColuna(); } catch (_) { /* a coluna continua como está */ }

    const acomp = criarAcompanhamento({ idCitacao: dados.queryAnnotations ? String(id) : '', textoPrompt: dados.promptText });
    const dbg = wc.debugger; let anexadoAqui = false; let lendo = false; let ouvinte = null; let aoDesanexar = null; let relogio = null;
    let resolver; const espera = new Promise((r) => { resolver = r; });
    const limpar = async () => {
      if (relogio) { clearTimeout(relogio); relogio = null; }
      if (ouvinte) { try { dbg.removeListener('message', ouvinte); } catch (_) {} ouvinte = null; }
      if (aoDesanexar) { try { dbg.removeListener('detach', aoDesanexar); } catch (_) {} aoDesanexar = null; }
      if (lendo) { lendo = false; try { await dbg.sendCommand('Network.disable'); } catch (_) {} }
      if (anexadoAqui) { anexadoAqui = false; try { dbg.detach(); } catch (_) {} }
    };
    const encerrar = (resultado) => { if (emCurso && emCurso.id === id) emCurso = null; resolver(resultado); };
    emCurso = { id, encerrar };

    try {
      if (dbg && !dbg.isAttached()) { dbg.attach('1.3'); anexadoAqui = true; }
      if (dbg && dbg.isAttached()) {
        ouvinte = (_e, metodo, params) => {
          if (!params || !params.response) return;
          let s = null;
          if (metodo === 'Network.webSocketFrameSent') s = acomp.aoEnviado(params.requestId, params.response.payloadData);
          else if (metodo === 'Network.webSocketFrameReceived') s = acomp.aoRecebido(params.requestId, params.response.payloadData);
          if (!s) return;
          if (s.estado === 'pronto') encerrar({ ok: true, texto: limparResposta(s.texto) });
          else if (s.estado === 'erro') encerrar({ ok: false, motivo: s.motivo || 'RESPOSTA_FALHOU' });
        };
        aoDesanexar = () => { anexadoAqui = false; lendo = false; encerrar({ ok: true, texto: null, semLeitura: true }); };
        dbg.on('message', ouvinte); dbg.on('detach', aoDesanexar);
        await dbg.sendCommand('Network.enable'); lendo = true;
      }
    } catch (e) { log('redator', 'leitura da resposta indisponível: ' + recorte(e && e.message, 80)); await limpar(); }

    let entrega = null;
    try { entrega = await wc.executeJavaScript(scriptEntrega(dados), true); } catch (_) { entrega = { ok: false, motivo: 'ENTREGA_FALHOU' }; }
    if (!entrega || entrega.ok !== true) { await limpar(); emCurso = null; return { ok: false, motivo: (entrega && entrega.motivo) || 'ENTREGA_FALHOU' }; }
    if (!lendo) { emCurso = null; return { ok: true, texto: null, semLeitura: true }; }

    relogio = setTimeout(() => {
      const s = acomp.situacao();
      encerrar(s.estado === 'aguardando-envio' ? { ok: false, motivo: 'PEDIDO_NAO_SAIU' } : { ok: false, motivo: 'TEMPO_ESGOTADO' });
    }, prazoMs);
    const resultado = await espera;
    await limpar();
    return resultado;
  }

  // A pessoa desistiu de esperar: para de ler. O Copilot continua respondendo na coluna.
  function cancelar(id) { if (emCurso && emCurso.id === id) { emCurso.encerrar({ ok: false, motivo: 'CANCELADO' }); return true; } return false; }

  return { pedir, cancelar, ocupado: () => !!emCurso };
}

module.exports = { LIMITES, textoDoPedido, montarAnotacao, montarEntrega, scriptEntrega, partesSignalR, criarAcompanhamento, limparResposta, criarPonteColuna };
