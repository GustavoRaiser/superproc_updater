// Etapa 2: atua somente nos WebContents associados à capa solicitante.
const crypto = require('node:crypto');
const { begin } = require('./saneador-interrupt');
const { BoundedCache, LIMITS, pdfGate } = require('./v2-policy');
const { readPdf } = require('./pdf-transfer');
const prepared = new BoundedCache({ maxEntries: 2, maxBytes: LIMITS.pdfBytes, ttl: LIMITS.pdfTtl, size: value => value.buffer.length });
const expiry = setInterval(() => prepared.prune(), 30000); expiry.unref();
const pending = new Set();
const registeredSessions = new WeakSet();
function registerPreload(session) {
  if (registeredSessions.has(session)) return;
  session.registerPreloadScript({ type: 'frame', filePath: require('node:path').join(__dirname, 'saneador-preload.js') });
  registeredSessions.add(session);
}
function resolveManagedTargets(tabs, sender) {
  const owner = tabs.find(tab => tab.view?.webContents === sender);
  if (!owner) return [];
  return tabs.filter(tab => tab.id === owner.id || tab.id === owner.splitWith || tab.splitWith === owner.id ||
    (owner.groupId && tab.groupId === owner.groupId && tab.processRole !== 'editor') ||
    (tab.nativeSourceTabId === owner.id && !tab.nativeStandalone))
    .map(tab => tab.view?.webContents).filter(wc => wc && !wc.isDestroyed());
}
const MAX_BYTES = 64 * 1024 * 1024;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const frames = targets => targets().flatMap(wc => wc.isDestroyed() ? [] : wc.mainFrame.framesInSubtree);
async function execute(frame, script, limit = 4000) {
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('O leitor não respondeu no prazo.')), limit); });
  try { return await Promise.race([frame.executeJavaScript(script, true), deadline]); }
  finally { clearTimeout(timer); }
}
async function evaluate(frame, script) { try { return await execute(frame, script); } catch { return null; } }
async function until(fn, timeout, error) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(300); }
  throw new Error(error);
}
async function prepare(targets, { timeout = 120000, openTree, openNativeTree, treeGrace = 3000, nativeGrace = 10000, check = () => {}, progress = () => {}, periodMonths = null } = {}) {
  if (![null,60,36,24,12,6].includes(periodMonths)) throw new Error('Período de documentos inválido.');
  const poll = (fn, ...args) => until(async () => { check(); const value = await fn(); check(); return value; }, ...args);
  const token = '__spSaneadorPDF_' + crypto.randomBytes(12).toString('hex');
  const started = Date.now();
  let triedOpening = false;
  let shortcutAt = 0, triedNative = false;
  const tree = await poll(async () => {
    let hasTree = false;
    for (const frame of frames(targets)) {
      if (await evaluate(frame, `!!document.querySelector('#divArvore')`)) hasTree = true;
      if (await evaluate(frame, `!!(document.querySelector('#divArvore li[role="none"]') && document.querySelector('.btn-marcar-rapido-icon') && document.querySelector('a[onclick*="gerarVersaoImpressao"]'))`)) return frame;
    }
    if (!hasTree && (openTree || openNativeTree) && !triedOpening && Date.now() - started >= treeGrace) {
      triedOpening = true;
      shortcutAt = Date.now();
      // Dá primeiro espaço à abertura automática do AZFLOW. Se não ocorreu,
      // usa a ação nativa, sem depender do gate de autoabertura já consumido.
      triedNative = openNativeTree ? !!(await openNativeTree()) : false;
      if (!triedNative && openTree) await openTree();
    }
    if (!hasTree && triedOpening && openNativeTree && !triedNative && Date.now() - shortcutAt >= nativeGrace) {
      triedNative = !!(await openNativeTree());
    }
  }, 60000, 'Árvore/AutoMarca não encontrada após aguardar a abertura. Confira a árvore e habilite Árvore - AutoMarca.');
  check();
  progress('arvore');
  const selection = await evaluate(tree, `(() => {
    const id = ${JSON.stringify(token)};
    let result;
    const listener = event => { const data = JSON.parse(event.detail); if (data.id === id) result = data; };
    document.addEventListener('superproc:automarca:result', listener);
    try { document.dispatchEvent(new CustomEvent('superproc:automarca:run', { detail: JSON.stringify({ id, months: ${JSON.stringify(periodMonths)} }) })); }
    finally { document.removeEventListener('superproc:automarca:result', listener); }
    return result || null;
  })()`);
  if (!selection) throw new Error('A árvore foi encontrada, mas a AutoMarca não confirmou a execução. Reinicie o navegador atualizado.');
  if (selection.error) throw new Error(selection.error);
  let previous = '', stable = 0;
  const selected = await poll(async () => {
    const result = await evaluate(tree, `(() => {
      const t = window.jQuery?.('#divArvore').jstree(true);
      const ids = t ? t.get_checked(true).filter(n => n.li_attr?.evento !== 'true' && document.getElementById(n.id)?.getAttribute('evento') !== 'true').map(n => n.id) :
        [...document.querySelectorAll('#divArvore li.jstree-checked[role="none"]')].filter(n => n.getAttribute('evento') !== 'true').map(n => n.id);
      const button = document.querySelector('a[onclick*="gerarVersaoImpressao"]');
      return { ids: ids.sort(), enabled: !!button && button.getAttribute('aria-disabled') !== 'true' && !button.classList.contains('disabled') };
    })()`);
    if (!result?.ids.length || !result.enabled) { stable = 0; return null; }
    const signature = JSON.stringify(result.ids);
    stable = signature === previous ? stable + 1 : 0; previous = signature;
    return stable >= 3 ? result : null;
  }, 15000, 'A AutoMarca não produziu seleção estável ou a impressão permanece desabilitada.');
  progress('selecao');
  // Guarda o objeto imediatamente antes da impressão; a URL pode ser reutilizada.
  const watched = frames(targets);
  for (const frame of watched) await evaluate(frame, `window[${JSON.stringify(token)}] = window.PDFViewerApplication?.pdfDocument || null; true`);
  try {
    check();
    if (!await evaluate(tree, `(() => { const b = document.querySelector('a[onclick*="gerarVersaoImpressao"]'); if (!b || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true; })()`)) throw new Error('Não consegui gerar a versão para impressão.');
    const pdf = await poll(async () => {
      for (const frame of frames(targets)) {
        const info = await evaluate(frame, `(() => { const d = window.PDFViewerApplication?.pdfDocument; if (!d || d === window[${JSON.stringify(token)}] || !d.numPages) return null; return { pages: d.numPages, url: location.href }; })()`);
        if (info) return { frame, ...info };
      }
    }, timeout, 'O PDF novo da impressão não carregou no PDF.js no prazo.');
    const content = await readPdf(pdf.frame, check);
    check();
    const buffer = content.buffer;
    if (!buffer.length || buffer.length > MAX_BYTES || buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('O documento carregado não é um PDF válido.');
    return { buffer, pages: content.pages, bytes: buffer.length, selected: selected.ids.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  } finally {
    for (const frame of watched) await evaluate(frame, `delete window[${JSON.stringify(token)}]; true`);
  }
}
function install(ipcMain, resolveTargets) {
  ipcMain.handle('superproc:saneador-pdf', async (event, request) => {
    try {
      if (event.senderFrame !== event.sender.mainFrame) throw new Error('A solicitação deve partir da capa principal.');
      const url = new URL(event.sender.getURL());
      const process = String(request?.process || '');
      if (!/\.jus\.br$/i.test(url.hostname) || url.searchParams.get('acao') !== 'processo_selecionar' || !/^\d{20}$/.test(process) || (url.searchParams.get('num_processo') || '').replace(/\D/g, '') !== process) throw new Error('Capa/processo solicitante inválido.');
      const targets = () => {
        if (event.sender.isDestroyed() || (new URL(event.sender.getURL()).searchParams.get('num_processo') || '').replace(/\D/g, '') !== process) throw new Error('A capa mudou de processo durante a preparação.');
        return resolveTargets(event.sender);
      };
      if (!targets().length) throw new Error('A capa não pertence a uma aba gerenciada.');
      const key = event.sender.id + ':' + process;
      if (!event.sender.__v2PdfCleanup) {
        event.sender.__v2PdfCleanup = true;
        const clearOwner = () => { for (const [id] of prepared) if (id.startsWith(event.sender.id + ':')) prepared.delete(id); };
        event.sender.once('destroyed', clearOwner);
        event.sender.on('did-start-navigation', (_, url, inPlace, main) => { if (main && !inPlace) clearOwner(); });
      }
      if (pending.has(key)) throw new Error('Já há uma preparação de PDF em andamento.');
      pending.add(key);
      const interruption = begin(event.sender.id, process);
      try {
        prepared.delete(key);
        const result = await pdfGate.run(() => prepare(targets, { periodMonths: require('./automation-options').automationOptions(request.config).periodMonths, progress: phase => { if (!event.sender.isDestroyed()) event.sender.send('superproc:saneador-pdf-progress', { id: request.id, phase }); }, check: interruption.check, openNativeTree: () => evaluate(event.sender.mainFrame, `(() => {
          const buttons = [...document.querySelectorAll('#fldAcoes button, #fldAcoes a, button, a, input[type="button"]')];
          const button = buttons.find(el => !el.closest('#superproc-saneador-lote') && !el.hasAttribute('data-icon-type') && !el.disabled &&
            (el.textContent || el.value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase() === 'arvore');
          if (!button) return false;
          button.click(); return true;
        })()`), openTree: async () => {
          // Atalho nativo da capa; não cria eventos DOM sintéticos.
          event.sender.focus();
          await evaluate(event.sender.mainFrame, `document.activeElement?.blur(); true`);
          event.sender.sendInputEvent({ type: 'keyDown', keyCode: 'Y', modifiers: ['alt'] });
          event.sender.sendInputEvent({ type: 'keyUp', keyCode: 'Y', modifiers: ['alt'] });
        } }));
        prepared.set(key, { ...result, at: Date.now() });
        prepared.prune();
        while (prepared.size > 2) prepared.delete(prepared.keys().next().value);
        const { buffer, ...metadata } = result;
        return { ...metadata, process };
      } finally { pending.delete(key); interruption.finish(); }
    } catch (error) { return { error: error.message }; }
  });
}
module.exports = { install, prepare, prepared, registerPreload, resolveManagedTargets };
