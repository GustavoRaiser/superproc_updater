'use strict';
// Anexo do PDF da árvore ao Copilot (host). Chamado pelo atalho PDF (copilot-teclas.js). O PDF que está aberto no leitor pdf.js (árvore/documento) da aba ativa é lido em memória e
// ANEXADO ao chat do Copilot da coluna do modo Integrada com Copilot, como se o arquivo tivesse sido salvo
// no computador e anexado. Nada é gravado em disco. Só anexa: texto, instruções e Enter ficam com o usuário.
// Reaproveita readPdf/stageFile (pdf-transfer.js) e o worker upload() do Saneador (copilot_worker.js).
// Dependências injetadas para testar sem Electron.
const fs = require('node:fs');
const path = require('node:path');
const core = require('./quick-shortcut-core');

const MSG = Object.freeze({
  modo: 'Ative a "Coluna Copilot" (menu CFG, Modo de abertura) para anexar o PDF ao Copilot.',
  semAbas: 'Nenhuma aba do processo para ler o PDF.',
  semPdf: 'Nenhum PDF aberto no leitor desta aba.',
  semPdfEnviaMesmoAssim: 'Nenhum PDF aberto na árvore: a mensagem foi enviada sem PDF.',
  semColuna: 'A coluna do Copilot não está disponível.',
  semChat: 'O chat do Copilot não está pronto. Entre na sua conta na coluna e tente de novo.',
  lendo: 'Lendo o PDF do leitor…',
  anexando: 'Anexando o PDF ao Copilot…',
  pronto: 'PDF enviado ao chat do Copilot. Confira o anexo, escreva e envie.',
  ocupado: 'Já há um PDF sendo anexado. Aguarde.'
});

// Nome como se o arquivo tivesse sido salvo: o do leitor se terminar em .pdf; senão Processo_<cnj>.pdf; senão documento.pdf.
function nomeDoArquivo(nomeLeitor, processo) {
  const limpo = String(nomeLeitor || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120);
  if (/\.pdf$/i.test(limpo) && limpo.length > 4) return limpo;
  if (/^\d{20}$/.test(String(processo || ''))) return `Processo_${processo}.pdf`;
  return (limpo.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || 'documento') + '.pdf';
}

// Recusa o atalho se já abre um link do Acesso Rápido (mesma combinação). Retorna o motivo ou null.
function motivoDeRecusa(config, atalho) {
  const a = core.normalizarSalvo(atalho);
  if (!a) return 'Combinação inválida ou reservada pelo navegador.';
  const evento = { code: a.code, control: a.ctrl, alt: a.alt, shift: a.shift, meta: a.meta };
  if (core.coletarCorrespondencias(config, evento).length) return 'Essa combinação já abre um link do Acesso Rápido. Escolha outra.';
  return null;
}

function numeroDoProcesso(url) {
  try { const n = (new URL(url).searchParams.get('num_processo') || '').replace(/\D/g, ''); return /^\d{20}$/.test(n) ? n : ''; }
  catch { return ''; }
}

const EDITOR = `!!document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea')`;
const hostDoCopilot = (url) => { try { const h = new URL(url).hostname; return h === 'cloud.microsoft' || h.endsWith('.cloud.microsoft'); } catch { return false; } };

function criarEnvioPdf({
  app, BrowserWindow, webContents, getMainWindow, getColunaAtiva, getColunaView, getAlvos, avisar: avisarBase = () => {}, log = () => {},
  readPdf = require('./pdf-transfer').readPdf, stageFile = require('./pdf-transfer').stageFile, releaseFile = require('./pdf-transfer').releaseFile,
  pdfGate = require('./v2-policy').pdfGate, esperaPdfMs = 3000,
  lerWorker = () => fs.readFileSync(path.join(__dirname, '../extensao-superproc/modules/automacoes/copilot_worker.js'), 'utf8')
}) {
  let emAndamento = false;

  async function avaliar(frame, script, ms = 3000) {
    let timer;
    const limite = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
    try { return await Promise.race([frame.executeJavaScript(script, true).catch(() => null), limite]); }
    finally { clearTimeout(timer); }
  }

  // Frame com leitor pdf.js carregado: o frame com foco primeiro; senão o primeiro das abas (dono da tecla antes).
  async function acharLeitor(alvos, focado) {
    const candidatos = [];
    for (const wc of alvos) if (wc && !wc.isDestroyed()) for (const frame of wc.mainFrame.framesInSubtree) candidatos.push(frame);
    const marcados = await Promise.all(candidatos.map(frame => avaliar(frame, `(() => { const a = window.PDFViewerApplication; return !!(a && (a.pdfDocument || a.pdfLoadingTask)); })()`)));
    const vivos = candidatos.filter((_, i) => marcados[i]);
    return vivos.find(f => f === focado) || vivos[0] || null;
  }

  async function acharChat(view) {
    const wc = view && view.webContents;
    if (!wc || wc.isDestroyed()) return null;
    for (const frame of wc.mainFrame.framesInSubtree) {
      if (!hostDoCopilot(frame.url)) continue;
      if (await avaliar(frame, EDITOR)) return frame;
    }
    return null;
  }

  // Onde o chat recebe o anexo (caixa de mensagem), em coordenadas da janela. Detectado na hora, então segue o
  // layout atual do Copilot; null se não for possível medir (o host usa uma posição padrão na coluna).
  async function acharRegiao(view, chat) {
    try {
      const r = await avaliar(chat, `(() => {
        const ed = document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea');
        if (!ed) return null;
        let el = ed; const W = window.innerWidth;
        for (let i = 0; i < 6 && el.parentElement; i++) {
          const p = el.parentElement.getBoundingClientRect();
          if (p.width > W * 0.98 || p.height > 260) break;
          el = el.parentElement;
        }
        const b = el.getBoundingClientRect();
        return b.width > 40 && b.height > 10 ? { x: b.left, y: b.top, width: b.width, height: b.height } : null;
      })()`, 1500);
      const base = view && typeof view.getBounds === 'function' ? view.getBounds() : null;
      if (!r || !base) return null;
      return { x: Math.round(base.x + r.x), y: Math.round(base.y + r.y), width: Math.round(r.width), height: Math.round(r.height) };
    } catch { return null; }
  }

  // semPdfOk (envio pelo toggle PDF do Super): não ter PDF aberto na árvore não é erro; avisa e deixa a mensagem seguir sem PDF.
  async function enviar(origem, { semPdfOk = false } = {}) {
    let regiao = null; // onde o chat recebe o anexo; os avisos aparecem ali
    const avisar = (t, n, ms) => avisarBase(t, n, ms, regiao);
    if (emAndamento) { avisar(MSG.ocupado, 'info'); return { ok: false, motivo: 'ocupado' }; }
    emAndamento = true;
    let avisouPronto = false;
    try {
      if (!getColunaAtiva()) { avisar(MSG.modo, 'erro'); return { ok: false, motivo: 'modo' }; }
      const view = getColunaView();
      if (!view) { avisar(MSG.semColuna, 'erro'); return { ok: false, motivo: 'coluna' }; }
      const alvos = (getAlvos(origem) || []).filter(wc => wc && !wc.isDestroyed());
      if (!alvos.length) {
        if (semPdfOk) { avisar(MSG.semPdfEnviaMesmoAssim, 'info', 3500); return { ok: true, semPdf: true }; }
        avisar(MSG.semAbas, 'erro'); return { ok: false, motivo: 'abas' };
      }
      let leitor = await acharLeitor(alvos, origem && !origem.isDestroyed() ? origem.focusedFrame : null);
      // Envio pelo toggle PDF: a existência do PDF só é decidida AQUI. Se o botão foi ligado antes de abrir o PDF, o leitor pode
      // ainda estar carregando no Enter: espera uma janela curta antes de concluir que não há PDF.
      if (!leitor && semPdfOk) {
        const limite = Date.now() + esperaPdfMs;
        while (!leitor && Date.now() < limite) {
          await new Promise(r => setTimeout(r, 250));
          const vivos = (getAlvos(origem) || []).filter(wc => wc && !wc.isDestroyed());
          leitor = await acharLeitor(vivos.length ? vivos : alvos, origem && !origem.isDestroyed() ? origem.focusedFrame : null);
        }
      }
      if (!leitor) {
        if (semPdfOk) { avisar(MSG.semPdfEnviaMesmoAssim, 'info', 3500); return { ok: true, semPdf: true }; }
        avisar(MSG.semPdf, 'erro'); return { ok: false, motivo: 'sem-pdf' };
      }
      const chat = await acharChat(view);
      if (!chat) { avisar(MSG.semChat, 'erro'); return { ok: false, motivo: 'sem-chat' }; }
      regiao = await acharRegiao(view, chat);
      avisar(MSG.lendo, 'info', 0);
      const resultado = await pdfGate.run(async () => {
        const conteudo = await readPdf(leitor);
        const dono = alvos.find(w => w.mainFrame.framesInSubtree.includes(leitor));
        const nome = nomeDoArquivo(conteudo.name, numeroDoProcesso(dono ? dono.getURL() : ''));
        avisar(MSG.anexando, 'info', 0);
        await chat.executeJavaScript(lerWorker(), true);
        const memoryId = await stageFile(chat, conteudo.buffer);
        try {
          // Mesmo caminho do Saneador: input[type=file] compatível ou evento de colar no editor.
          // Entregue ao Copilot (o arquivo foi despachado ao chat), está feito: o carregamento do anexo segue por conta
          // dele e NÃO se espera por ele (nem por chip, nem por 100%), então um novo atalho já pode enviar outro PDF
          // (inclusive logo depois de apagar o anexo). `semEspera` dispensa também os 5 s fixos do worker.
          await chat.executeJavaScript(`window.SuperprocCopilot.upload(${JSON.stringify({ name: nome, type: 'application/pdf', memoryId })}, null, { semEspera: true })`, true); // se o despacho falhou, lança aqui
        } finally { await releaseFile(chat, memoryId); }
        await chat.executeJavaScript(`(() => { const el = document.querySelector('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], textarea'); if (el) el.focus(); return true; })()`, true).catch(() => {});
        return { nome, paginas: conteudo.pages, bytes: conteudo.buffer.length };
      });
      try { view.webContents.focus(); } catch (_) {}
      if (!avisouPronto) avisar(MSG.pronto, 'ok');
      log('PDF_COPILOT_ANEXADO', `PDF anexado ao Copilot (${resultado.paginas} páginas, ${resultado.bytes} bytes)`);
      return { ok: true, ...resultado };
    } catch (erro) {
      avisar('Não foi possível anexar o PDF: ' + (erro && erro.message ? erro.message : 'erro desconhecido'), 'erro');
      log('PDF_COPILOT_FALHA', 'Falha ao anexar PDF ao Copilot: ' + (erro && erro.message));
      return { ok: false, motivo: 'erro', erro: erro && erro.message };
    } finally { emAndamento = false; }
  }

  return { enviar, estaOcupado: () => emAndamento };
}

module.exports = { MSG, nomeDoArquivo, motivoDeRecusa, numeroDoProcesso, criarEnvioPdf };
