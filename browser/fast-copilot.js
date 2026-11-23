'use strict';
// Copilot (host): orquestrador. Atalho (ou botão da barra do CKEditor) -> captura a seleção no editor
// (âncora em mundo isolado) -> caixa de instruções -> envia ao chat da coluna do Copilot -> aplica a resposta.
// Um pedido por vez. O navegador fica livre enquanto o Copilot responde. Dependências injetadas (testável sem Electron).
// O log só recebe METADADOS: nunca o texto da minuta, a instrução ou a resposta.
const fs = require('node:fs');
const path = require('node:path');
const core = require('./quick-shortcut-core');
const P = require('./fast-copilot-prompt');
const E = require('./fast-copilot-editor');
const M = require('./fast-copilot-marcas');
const B = require('./fast-copilot-botao');
const G = require('./fast-copilot-contexto');
const { comBloqueio } = require('./fast-copilot-input');

const MSG = Object.freeze({
  modo: 'Ative a "Coluna Copilot" (menu CFG, Modo de abertura) para usar o Copilot.',
  semColuna: 'A coluna do Copilot não está disponível.',
  semChat: 'O chat do Copilot não está pronto. Entre na sua conta na coluna e tente de novo.',
  semEditor: 'Abra o editor de minutas para usar o Copilot.',
  semAba: 'Abra uma página do eproc para usar o Copilot.',
  semSelecao: 'Selecione um trecho de texto (no editor de minutas ou em um campo) para usar a Alteração de Texto.',
  ocupado: 'Pedido já em processamento, aguarde para nova requisição.',
  caixaAberta: 'A caixa do Copilot já está aberta.',
  enviando: 'Enviando ao Copilot…',
  pronto: 'Texto substituído. Ctrl+Z no editor desfaz.',
  respostaPronta: 'Resposta do Copilot pronta na coluna.',
  alterado: 'O trecho foi alterado durante a espera; não substituí. A resposta foi copiada para a área de transferência.',
  cancelado: 'Pedido cancelado.'
});

const hostDoCopilot = (url) => { try { const h = new URL(url).hostname; return h === 'cloud.microsoft' || h.endsWith('.cloud.microsoft'); } catch { return false; } };
function ehEditor(url) {
  try { const u = new URL(url); return u.hostname.endsWith('.jus.br') && u.searchParams.get('acao') === 'minuta_editar'; } catch { return false; }
}
const EDITOR_CHAT = `!!document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea')`;

// Recusa combinações já usadas ou reservadas. Retorna o motivo ou null.
function motivoDeRecusa(config, atalho, outros = []) {
  const a = core.normalizarSalvo(atalho);
  if (!a) return 'Combinação inválida ou reservada pelo navegador.';
  if (a.shift && a.alt && !a.ctrl && !a.meta) return 'Shift+Alt é usado pelo menu Texto do editor. Escolha outra.';
  const evento = { code: a.code, control: a.ctrl, alt: a.alt, shift: a.shift, meta: a.meta };
  if (core.coletarCorrespondencias(config, evento).length) return 'Essa combinação já abre um link do Acesso Rápido. Escolha outra.';
  if (outros.some((o) => { const n = core.normalizarSalvo(o); return n && core.combina(evento, n); })) return 'Essa combinação já é usada por outro atalho do Copilot/PDF. Escolha outra.';
  return null;
}

function criarFastCopilot({
  getColunaAtiva, getColunaView, getAbaEditor, getAlvos, getAlvosPdf, getAtalho, getAtalhoAlteracao = () => null, getPosicaoAba = null, getMainWindow, BrowserWindow, app, webContents,
  abrirCaixa, avisar = () => {}, log = () => {}, copiarTexto = () => {}, editorVisivel = () => false, obterIcone = async () => null,
  readPdf = require('./pdf-transfer').readPdf, stageFile = require('./pdf-transfer').stageFile, releaseFile = require('./pdf-transfer').releaseFile,
  pdfGate = require('./v2-policy').pdfGate,
  foco = { capturar: () => ({}), restaurar: () => {} }, esperaAnexoMs = 15000, motivoIcone = () => '',
  lerWorker = () => fs.readFileSync(path.join(__dirname, 'copilot-worker.js'), 'utf8')
}) {
  let estado = 'ocioso'; // ocioso | caixa | enviando | aguardando | aplicando
  let pedidoAtual = null;
  let ultimaSonda = { alvos: 0, frames: 0, leitores: 0 }; // metadados da última busca do leitor PDF (para o log)
  const ligados = new WeakSet();
  const noIso = E.noIsolado, naPag = E.naPagina;

  async function avaliar(frame, script, ms = 3000, gesto = true) {
    let timer; const limite = new Promise((r) => { timer = setTimeout(() => r(null), ms); });
    try { return await Promise.race([frame.executeJavaScript(script, gesto).catch(() => null), limite]); } finally { clearTimeout(timer); }
  }
  async function acharChat(view) {
    const wc = view && view.webContents; if (!wc || wc.isDestroyed()) return null;
    for (const frame of wc.mainFrame.framesInSubtree) { if (hostDoCopilot(frame.url) && await avaliar(frame, EDITOR_CHAT)) return frame; }
    return null;
  }
  async function acharLeitor(alvos, focado) {
    const cand = [];
    for (const wc of alvos) if (wc && !wc.isDestroyed()) for (const f of wc.mainFrame.framesInSubtree) cand.push(f);
    const marc = await Promise.all(cand.map((f) => avaliar(f, `(() => { const a = window.PDFViewerApplication; return !!(a && (a.pdfDocument || a.pdfLoadingTask)); })()`, 3000, false))); // sonda só leitura, sem gesto de usuário
    const vivos = cand.filter((_, i) => marc[i]);
    ultimaSonda = { alvos: alvos.length, frames: cand.length, leitores: vivos.length };
    return vivos.find((f) => f === focado) || vivos[0] || null;
  }
  const nomePdf = (frame) => avaliar(frame, `(() => { const a = window.PDFViewerApplication; return (a && a._docFilename) || document.title || 'documento.pdf'; })()`);
  const nomeArquivo = (n) => { const l = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120); return /\.pdf$/i.test(l) && l.length > 4 ? l : (l.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || 'documento') + '.pdf'; };

  async function marcarBotao(wc, ocupado) {
    try { if (wc && !wc.isDestroyed()) await noIso(wc, B.scripts.ocupado(ocupado)); } catch (_) {}
  }

  function definirEstado(novo, wc) {
    estado = novo;
    const ocup = novo === 'enviando' || novo === 'aguardando';
    if (pedidoAtual && pedidoAtual.ocupado !== ocup) { pedidoAtual.ocupado = ocup; marcarBotao(wc, ocup); } // só quando muda
  }

  // Abas gerenciadas da janela do usuário (capa/editor/árvore...). Sem getAlvos, só o editor (compatibilidade).
  const listar = (origem) => {
    const lista = getAlvos ? (getAlvos(origem) || []) : [getAbaEditor(origem)];
    return lista.filter((w) => w && !w.isDestroyed());
  };

  // Onde está o usuário? Seleção/cursor no editor de minutas (CKEditor) ou em qualquer campo/página das abas.
  // Retorna a fonte do texto, o que dá para fazer com ela e as âncoras a liberar no fim.
  async function capturarContexto(alvos, wcEditor, origem) {
    const ancoras = [];
    let ed = null;
    if (wcEditor) {
      ed = await noIso(wcEditor, E.scripts.capturar({ minuta: true })).catch(() => null);
      if (ed && ed.ok) { if (ed.id) ancoras.push(() => noIso(wcEditor, E.scripts.liberar(ed.id))); } else ed = null;
    }
    // Demais abas (e o próprio editor, caso o cursor esteja fora do CKEditor): campo de texto, área editável ou seleção na página.
    let ger = null, wcGer = null;
    const ordem = [origem, ...alvos].filter((w, i, l) => w && alvos.includes(w) && l.indexOf(w) === i);
    for (const w of ordem) {
      if (w === wcEditor && ed && ed.temSelecao) continue;
      const r = await G.noIsolado(w, G.scripts.capturar()).catch(() => null);
      if (r && r.ok && (r.selecao || r.tipo === 'campo' || r.tipo === 'editavel')) {
        if (r.id) ancoras.push(() => G.noIsolado(w, G.scripts.liberar(r.id)));
        if (r.selecao || !ger) { ger = r; wcGer = w; if (r.selecao) break; }
      }
    }
    const minuta = ed ? ed.minuta || '' : '';
    const base = { minuta, ancoras, tamanhoMinuta: minuta.length };
    const edSel = !!(ed && ed.temSelecao);
    const gerSel = !!(ger && ger.selecao);
    if (edSel && (!gerSel || origem === wcEditor)) return { ...base, fonte: 'editor', wcFonte: wcEditor, pos: ed.pos || null, id: ed.id, temSelecao: true, podeAlterar: true, podeDestacar: true, selecao: ed.selecao, tamanho: ed.tamanho || 0, formato: 'html', rotulo: 'editor de minutas' };
    if (gerSel) return { ...base, fonte: ger.tipo, wcFonte: wcGer, id: ger.id, temSelecao: true, podeAlterar: !!ger.id, podeDestacar: false, selecao: ger.selecao, tamanho: ger.tamanho || 0, formato: 'texto', rotulo: ger.rotulo || '' };
    const gerSemSel = ger && (!ed || origem === wcGer); // cursor num campo da aba de origem, sem seleção
    if (ed && !gerSemSel) return { ...base, fonte: 'editor', wcFonte: wcEditor, id: null, temSelecao: false, podeAlterar: false, podeDestacar: false, selecao: '', tamanho: 0, formato: 'html', rotulo: 'editor de minutas' };
    return { ...base, fonte: ger ? ger.tipo : 'nenhuma', wcFonte: wcGer, id: null, temSelecao: false, podeAlterar: false, podeDestacar: false, selecao: '', tamanho: 0, formato: 'texto', rotulo: ger ? ger.rotulo || '' : '' };
  }

  // Fim do texto selecionado em coordenadas de tela (DIP). null = sem posição: a caixa abre centralizada.
  function posicaoNaTela(cap) {
    try {
      if (!cap || !cap.pos || !cap.wcFonte || typeof getPosicaoAba !== 'function') return null;
      const o = getPosicaoAba(cap.wcFonte); if (!o) return null; const z = o.zoom || 1;
      return { esq: Math.round(o.x + cap.pos.esq * z), x: Math.round(o.x + cap.pos.x * z), y: Math.round(o.y + cap.pos.y * z), topo: Math.round(o.y + cap.pos.topo * z) };
    } catch (_) { return null; }
  }
  async function iniciar(origem, opcoes = {}) {
    const soAlteracao = !!opcoes.alteracao; // atalho de Alteração de Texto: caixa só com instrução + modos; sem PDF/minuta/nova conversa
    if (estado === 'enviando' || estado === 'aguardando' || estado === 'aplicando') { avisar(MSG.ocupado, 'info'); return { ok: false, motivo: 'ocupado' }; }
    if (estado === 'caixa') { avisar(MSG.caixaAberta, 'info'); return { ok: false, motivo: 'caixa' }; }
    estado = 'caixa';
    const t0 = Date.now();
    const focoAntes = (() => { try { return foco.capturar(); } catch (_) { return {}; } })();
    const timersFoco = [];
    let wcFoco = origem;
    const devolverFoco = () => { try { foco.restaurar(wcFoco, focoAntes); } catch (_) {} };
    const pedidoCtx = pedidoAtual = { cancelado: false, chat: null, ocupado: false, wcEditor: null, ancoras: [] };
    try {
      if (!getColunaAtiva()) { avisar(MSG.modo, 'erro'); return { ok: false, motivo: 'modo' }; }
      const view = getColunaView(); if (!view) { avisar(MSG.semColuna, 'erro'); return { ok: false, motivo: 'coluna' }; }
      const alvos = listar(origem);
      if (!alvos.length) { avisar(MSG.semAba, 'erro'); return { ok: false, motivo: 'aba' }; }
      const wcEd = pedidoCtx.wcEditor = alvos.find((w) => ehEditor(w.getURL())) || null; // só para minuta, destaques e botão
      wcFoco = alvos.includes(origem) ? origem : (wcEd || alvos[0]);
      const cap = await capturarContexto(alvos, wcEd, origem);
      pedidoCtx.ancoras = cap.ancoras;
      if (soAlteracao && !cap.podeAlterar) { avisar(MSG.semSelecao, 'info', 4000); return { ok: false, motivo: 'sem-selecao' }; }
      const leitor = soAlteracao ? null : await acharLeitor((getAlvosPdf(origem) || []).filter((w) => w && !w.isDestroyed()), null);
      const nome = leitor ? nomeArquivo(await nomePdf(leitor)) : '';
      const icone = await obterIcone().catch(() => null);
      const resp = await abrirCaixa({ fonte: cap.fonte, rotulo: cap.rotulo, temSelecao: cap.temSelecao, podeAlterar: cap.podeAlterar, podeDestacar: cap.podeDestacar,
        modo: soAlteracao ? 'alteracao' : 'completo', posicao: soAlteracao ? posicaoNaTela(cap) : null, tamanhoSelecao: cap.tamanho || 0, temMinuta: !!(cap.minuta && cap.minuta.trim()), temPdf: !!leitor, nomePdf: nome, icone });
      devolverFoco(); // fechar a caixa não pode deixar a janela trocar de lugar
      if (!resp || resp.cancelado) { log('FASTCOPILOT_CANCELADO', 'Caixa fechada sem enviar'); return { ok: false, motivo: 'cancelado' }; }
      const ped = soAlteracao ? { ...resp.pedido, pdf: false, minuta: false, nova: false } : resp.pedido;

      // Prompt (erros de validação voltam ao usuário; nada foi enviado ainda)
      let prompt;
      try {
        prompt = P.montarPrompt({ instrucao: ped.instrucao, alteracao: ped.alteracao, destacar: ped.destacar && cap.podeDestacar, formato: cap.formato,
          selecao: ped.selecao || ped.alteracao ? cap.selecao : '', minuta: ped.minuta ? cap.minuta : '', anexos: ped.pdf && leitor ? [nome] : [] });
      } catch (e) { avisar(e.message, 'erro'); return { ok: false, motivo: 'prompt', erro: e.message }; }

      definirEstado('enviando', wcEd);
      avisar(MSG.enviando, 'info', 2500);
      const chat = pedidoCtx.chat = await acharChat(view);
      if (!chat) { avisar(MSG.semChat, 'erro'); return { ok: false, motivo: 'sem-chat' }; }
      await chat.executeJavaScript(lerWorker(), true);
      if (ped.nova) await chat.executeJavaScript('window.SuperprocCopilot.freshConversation()', true);
      if (pedidoCtx.cancelado) throw Object.assign(new Error('cancelado'), { cancelado: true });

      if (ped.pdf && leitor) {
        await pdfGate.run(async () => {
          const conteudo = await readPdf(leitor);
          const memoryId = await stageFile(chat, conteudo.buffer);
          try { await chat.executeJavaScript(`window.SuperprocCopilot.upload(${JSON.stringify({ name: nome, type: 'application/pdf', memoryId })}, null)`, true); }
          finally { await releaseFile(chat, memoryId); }
        });
        if (pedidoCtx.cancelado) throw Object.assign(new Error('cancelado'), { cancelado: true });
      }

      definirEstado('aguardando', wcEd);
      for (const ms of [300, 1000, 2500]) timersFoco.push(setTimeout(devolverFoco, ms)); // o chat foca a própria caixa ao inserir o texto
      const resposta = await chat.executeJavaScript(`(async () => { try { const r = await window.SuperprocCopilot.runCurrent(${JSON.stringify(prompt).replace(/</g, '\\u003c')}); return { ok: true, text: String((r && r.text) || '') }; } catch (e) { return { ok: false, erro: String((e && e.message) || e || 'erro') }; } })()`, true);
      if (resposta && resposta.ok === false) throw Object.assign(new Error(resposta.erro || 'o Copilot não respondeu'), { doChat: true });
      if (pedidoCtx.cancelado) throw Object.assign(new Error('cancelado'), { cancelado: true });
      const texto = String((resposta && resposta.text) || '');
      const conferido = await avaliar(chat, 'window.__spCopilotLastInsert || null').catch(() => null);

      definirEstado('aplicando', wcEd);
      let aplicado = false, motivoNaoAplicou = null;
      if (ped.alteracao && cap.podeAlterar && cap.id) {
        const visivel = !!editorVisivel(cap.wcFonte);
        if (cap.fonte === 'editor') {
          const sel = await noIso(wcEd, E.scripts.selecionar(cap.id)).catch(() => ({ ok: false, motivo: 'erro' }));
          if (!sel || !sel.ok) { motivoNaoAplicou = (sel && sel.motivo) || 'erro'; }
          else {
            const html = P.respostaParaHtml(texto);
            const r = await comBloqueio(wcEd.debugger ? wcEd : null, () => naPag(wcEd, E.scripts.aplicar(sel.indice, html)), { bloquear: visivel, log: (f, m) => log('FASTCOPILOT_BLOQUEIO', f + ': ' + m) });
            aplicado = !!(r && r.ok); if (!aplicado) motivoNaoAplicou = (r && r.motivo) || 'erro';
            if (aplicado && P.temDestaques(texto)) await naPag(wcEd, M.scripts.instalar(P.CLASSE_DESTAQUE)).catch(() => {});
          }
        } else {
          const w = cap.wcFonte, plano = P.respostaParaTexto(texto);
          const r = await comBloqueio(w.debugger ? w : null, () => G.noIsolado(w, G.scripts.aplicar(cap.id, plano)), { bloquear: visivel, log: (f, m) => log('FASTCOPILOT_BLOQUEIO', f + ': ' + m) }).catch(() => ({ ok: false, motivo: 'erro' }));
          aplicado = !!(r && r.ok); if (!aplicado) motivoNaoAplicou = (r && r.motivo) || 'erro';
        }
      }
      if (ped.alteracao && !aplicado) { copiarTexto(texto); avisar(MSG.alterado, 'erro', 6000); }
      else avisar(aplicado ? MSG.pronto : MSG.respostaPronta, 'ok');
      log('FASTCOPILOT_CONCLUIDO', `Pedido concluído (fonte=${cap.fonte}, alteração=${!!ped.alteracao}, aplicado=${aplicado}, pdf=${!!(ped.pdf && leitor)}, minuta=${!!ped.minuta}, prompt=${prompt.length}, resposta=${texto.length}, ${Date.now() - t0} ms${motivoNaoAplicou ? ', motivo=' + motivoNaoAplicou : ''}${conferido ? `, caixa(cabeça=${!!conferido.cabeca}, cauda=${!!conferido.cauda}, ${conferido.tamanho}/${conferido.esperado})` : ''})`);
      return { ok: true, aplicado, motivoNaoAplicou, fonte: cap.fonte };
    } catch (erro) {
      if (pedidoCtx.cancelado || (erro && erro.cancelado)) { avisar(MSG.cancelado, 'info'); log('FASTCOPILOT_CANCELADO', 'Pedido cancelado pelo usuário'); return { ok: false, motivo: 'cancelado' }; }
      avisar('Copilot: ' + (erro && erro.message ? erro.message : 'erro desconhecido'), 'erro', 6000);
      log('FASTCOPILOT_FALHA', 'Falha no pedido: ' + (erro && erro.message));
      return { ok: false, motivo: 'erro', erro: erro && erro.message };
    } finally {
      timersFoco.forEach(clearTimeout);
      for (const liberar of pedidoCtx.ancoras) { try { Promise.resolve(liberar()).catch(() => {}); } catch (_) {} }
      const wc = pedidoCtx.wcEditor;
      const estavaOcupado = pedidoCtx.ocupado; estado = 'ocioso'; pedidoAtual = null; if (estavaOcupado) marcarBotao(wc, false);
    }
  }

  // Cancelar: só vale com pedido esperando. O host ignora a resposta; o chat pode terminar.
  async function cancelar() {
    const p = pedidoAtual;
    if (!p || !(estado === 'enviando' || estado === 'aguardando')) return false;
    p.cancelado = true;
    try { if (p.chat) await p.chat.executeJavaScript('window.SuperprocCopilot && window.SuperprocCopilot.cancel()', true); } catch (_) {}
    return true;
  }

  // Clique no botão da barra: abre a caixa; com pedido em espera, cancela.
  async function aoClique(wcEditor) {
    if (estado === 'enviando' || estado === 'aguardando') return cancelar();
    return iniciar(wcEditor);
  }

  // Leva o foco ao campo de conversa da coluna do Copilot (cursor no fim do texto já digitado).
  const FOCAR_CAMPO = `(() => { const e = document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea'); if (!e) return false; e.focus(); try { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {} return true; })()`;
  async function irParaColuna() {
    if (!getColunaAtiva()) { avisar(MSG.modo, 'erro'); return { ok: false, motivo: 'modo' }; }
    const view = getColunaView(); const wc = view && view.webContents;
    if (!wc || wc.isDestroyed()) { avisar(MSG.semColuna, 'erro'); return { ok: false, motivo: 'coluna' }; }
    try { wc.focus(); } catch (_) {}
    const chat = await acharChat(view);
    if (!chat) { avisar(MSG.semChat, 'erro'); return { ok: false, motivo: 'sem-chat' }; }
    const ok = await avaliar(chat, FOCAR_CAMPO);
    if (!ok) { avisar(MSG.semChat, 'erro'); return { ok: false, motivo: 'sem-campo' }; }
    log('FASTCOPILOT_FOCO', 'Foco levado ao campo de conversa da coluna');
    return { ok: true };
  }

  // Grupo da aba ativa (editor + árvore + leitor ficam em abas diferentes do mesmo grupo): o editor e o PDF são procurados em todas.
  function alvosDoGrupo() {
    const alvos = listar(null);
    // Nunca sonda a aba do editor de minutas (CKEditor): o PDF fica nas outras abas do grupo (árvore/leitor).
    const pdf = [...alvos, ...((alvos[0] && getAlvosPdf(alvos[0])) || [])].filter((w, i, l) => w && !w.isDestroyed() && l.indexOf(w) === i && !ehEditor(w.getURL()));
    return { alvos, pdfAlvos: pdf };
  }
  // Confirma que o PDF entrou como anexo do compositor: o nome (sem .pdf, 24 primeiros caracteres) passa a aparecer mais vezes
  // na página do que antes do upload. Independe de seletores do DOM do Copilot; só compara contagens (nada do conteúdo vai ao log).
  const contarNome = (chat, parte) => avaliar(chat, `(() => { /*__spAnexoVisto*/ const t = ((document.body && document.body.innerText) || '').toLowerCase(); const p = ${JSON.stringify(parte)}; if (!p) return -1; let n = 0, i = -1; while ((i = t.indexOf(p, i + 1)) !== -1) n++; return n; })()`, 1500, false);
  async function confirmarAnexo(chat, parte, antes, ms = esperaAnexoMs) {
    const t0 = Date.now(); let depois = antes;
    while (Date.now() - t0 < ms) {
      const n = await contarNome(chat, parte); if (typeof n === 'number') depois = n;
      if (typeof n === 'number' && n > antes) return { ok: true, antes, depois, ms: Date.now() - t0 };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ok: false, antes, depois, ms: Date.now() - t0 };
  }

  // Minuta como ANEXO (Minuta.txt), sem tocar no campo de mensagem: o texto que o usuário digitou fica como está e o envio é dele.
  // Mesmo mecanismo do anexo de PDF (memória -> SuperprocCopilot.upload) e a mesma confirmação por contagem do nome na página.
  const htmlParaTexto = (h) => String(h || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  async function anexarMinuta() {
    if (estado !== 'ocioso') { avisar(MSG.ocupado, 'info'); return { ok: false, motivo: 'ocupado' }; }
    estado = 'enviando'; const ancoras = [];
    const falha = (motivo, msg) => { avisar('Copilot: ' + (msg || motivo), 'erro', 6000); log('FASTCOPILOT_FALHA', 'Anexo da minuta falhou: ' + motivo); return { ok: false, motivo }; };
    try {
      if (!getColunaAtiva()) return falha('modo', MSG.modo);
      const chat = await acharChat(getColunaView()); if (!chat) return falha('sem-chat', MSG.semChat);
      const wcEd = alvosDoGrupo().alvos.find((w) => ehEditor(w.getURL()));
      if (!wcEd) return falha('sem-editor', 'O editor de minutas não está mais aberto.');
      const ed = await noIso(wcEd, E.scripts.capturar({ minuta: true })).catch(() => null);
      if (ed && ed.id) ancoras.push(() => noIso(wcEd, E.scripts.liberar(ed.id)));
      const texto = ed && ed.ok ? htmlParaTexto(ed.minuta || '') : '';
      log('FASTCOPILOT_MINUTA', 'Captura somente leitura da íntegra da minuta para anexo: ' + texto.length + ' caracteres (ok=' + !!(ed && ed.ok) + ')');
      if (!texto) return falha('minuta-vazia', 'A minuta está vazia.');
      const buffer = Buffer.from(texto, 'utf8');
      await chat.executeJavaScript(lerWorker(), true);
      const nome = 'Minuta.txt'; const parte = nome.toLowerCase();
      const antes = await contarNome(chat, parte);
      const memoryId = await stageFile(chat, buffer);
      try { await chat.executeJavaScript(`window.SuperprocCopilot.upload(${JSON.stringify({ name: nome, type: 'text/plain', memoryId })}, null)`, true); }
      finally { await releaseFile(chat, memoryId); }
      const conf = await confirmarAnexo(chat, parte, typeof antes === 'number' ? antes : 0);
      log('FASTCOPILOT_MINUTA', `Anexo da minuta ${conf.ok ? 'confirmado' : 'NÃO confirmado'} (ocorrências do nome: antes=${conf.antes}, depois=${conf.depois}, ${conf.ms} ms)`);
      if (!conf.ok) return falha('anexo-nao-confirmado', 'A minuta não apareceu como anexo no Copilot, então não enviei a mensagem.');
      return { ok: true, caracteres: texto.length };
    } catch (erro) { return falha('erro', erro && erro.message ? erro.message : 'erro desconhecido'); }
    finally { for (const liberar of ancoras) { try { Promise.resolve(liberar()).catch(() => {}); } catch (_) {} } estado = 'ocioso'; }
  }

  // Atalhos (F1 = ir ao campo da coluna; segundo atalho = Alteração de Texto): só valem com o foco numa aba de editor de minutas da janela principal.
  function aoTecla(event, input, wc) {
    if (!input || input.type !== 'keyDown') return false;
    const atalhoIr = core.normalizarSalvo(getAtalho()), atalhoAlt = core.normalizarSalvo(getAtalhoAlteracao());
    const ehIr = !!(atalhoIr && core.combina(input, atalhoIr)), ehAlt = !!(atalhoAlt && core.combina(input, atalhoAlt));
    if (!ehIr && !ehAlt) return false;
    const principal = getMainWindow();
    if (!principal || principal.isDestroyed()) return false;
    const dono = wc && BrowserWindow ? BrowserWindow.fromWebContents(wc) : null;
    if (dono && dono !== principal) return false;
    if (ehIr) { // F1 (atalho "Copilot"): só leva o cursor ao campo de conversa da coluna
      event.preventDefault();
      if (!input.isAutoRepeat) irParaColuna().catch(() => {});
      return true;
    }
    if (!listar(wc).length) return false; // sem nenhuma aba do navegador para atender: a tecla segue seu caminho normal
    event.preventDefault();
    if (!input.isAutoRepeat) iniciar(wc, { alteracao: true }).catch(() => {});
    return true;
  }

  function ligar(wc) { if (!wc || ligados.has(wc)) return; ligados.add(wc); wc.on('before-input-event', (e, i) => aoTecla(e, i, wc)); }
  function instalar() { app.on('web-contents-created', (_e, wc) => ligar(wc)); for (const wc of webContents.getAllWebContents()) ligar(wc); }

  // Injeta o botão do Copilot na barra do CKEditor (aba de editor de minutas, no modo Integrada com Copilot).
  async function injetarBotao(wc, tentativa = 0) {
    try {
      if (!wc || wc.isDestroyed() || !getColunaAtiva() || !ehEditor(wc.getURL())) return false;
      const icone = await obterIcone().catch(() => null);
      await noIso(wc, B.scripts.instalar(icone));
      if (!icone && tentativa < 4) { // coluna ainda carregando: repete até o ícone oficial chegar
        if (tentativa === 0) log('FASTCOPILOT_ICONE', 'Ícone oficial indisponível por enquanto: ' + (motivoIcone() || 'desconhecido'));
        const t = setTimeout(() => injetarBotao(wc, tentativa + 1), [3000, 8000, 20000, 45000][tentativa]); if (t.unref) t.unref();
      }
      return true;
    } catch (_) { return false; }
  }

  // Canal do clique no botão da barra (vem do preload de sessão). Só aceita o frame principal de uma aba de editor gerenciada.
  function instalarIpc(ipcMain, abaEditor) {
    ipcMain.on('superproc:fast-copilot-click', (event) => {
      const wc = event.sender;
      if (!wc || wc.isDestroyed() || !event.senderFrame || event.senderFrame !== wc.mainFrame || !abaEditor(wc)) return;
      aoClique(wc).catch(() => {});
    });
  }

  return { iniciar, cancelar, aoClique, aoTecla, instalar, instalarIpc, injetarBotao, estado: () => estado, estaOcupado: () => estado !== 'ocioso', irParaColuna, anexarMinuta, _htmlParaTexto: htmlParaTexto };
}

module.exports = { MSG, ehEditor, motivoDeRecusa, criarFastCopilot };
