const fs = require('node:fs/promises');
const path = require('node:path');
const { LIMITS, pdfGate } = require('./v2-policy');
const { readPdf } = require('./pdf-transfer');

async function bounded(task, timeout = 30000) {
  let timer;
  try {
    return await Promise.race([task, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('A página não concluiu a preparação do PDF no prazo. Tente novamente após carregar.')), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

function pdfFileName(title) {
  let name = String(title || 'documento').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 170);
  if (!name) name = 'documento';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return /\.pdf$/i.test(name) ? name : name + '.pdf';
}

async function saveAutomatic(directory, name, bytes) {
  const stem = name.replace(/\.pdf$/i, '');
  for (let index = 0; ; index++) {
    const file = path.join(directory, index ? `${stem} (${index}).pdf` : name);
    try { await fs.writeFile(file, bytes, { flag: 'wx' }); return file; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}

function createPrintToPdf({ owns, getConfig, getDirectory, choosePath, onSaved, onError }) {
  const sessions = new WeakSet();
  const attached = new WeakSet();
  const pending = new Map();
  function registerSession(session) {
    if (sessions.has(session)) return;
    session.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'print-pdf-preload.js') });
    sessions.add(session);
  }
  async function generate(wc, frame) {
    if (!owns(wc) || wc.isDestroyed()) return;
    frame ||= wc.focusedFrame || wc.mainFrame;
    const sourceUrl = frame.url;
    const isPdf = await bounded(frame.executeJavaScript('!!window.PDFViewerApplication', true));
    const source = isPdf ? await readPdf(frame) : null;
    let bytes, name;
    if (source) {
      bytes = source.buffer;
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('O leitor não retornou um PDF válido.');
      name = pdfFileName(source.name);
    } else {
      await bounded(frame.executeJavaScript(`(async () => {
        if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        if (document.fonts) await document.fonts.ready;
      })()`, true));
      if (frame.url !== sourceUrl) throw new Error('A página mudou durante a preparação da impressão. Tente novamente.');
      name = pdfFileName(await frame.executeJavaScript('document.title', true));
      bytes = await bounded(frame.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' }), 60000);
    }
    if (bytes.length > LIMITS.pdfBytes) throw Error('PDF excede o limite de 64 MiB.');
    const config = getConfig();
    const directory = getDirectory(config);
    let saved;
    if (config.autoDownload) saved = await saveAutomatic(directory, name, bytes);
    else {
      saved = await choosePath(path.join(directory, name));
      if (!saved) return;
      if (!/\.pdf$/i.test(saved)) saved += '.pdf';
      await fs.writeFile(saved, bytes);
    }
    onSaved(saved, bytes.length);
    return saved;
  }
  function request(wc, frame) {
    if (!owns(wc) || wc.isDestroyed()) return Promise.resolve();
    if (pending.has(wc)) return pending.get(wc);
    const job = pdfGate.run(() => generate(wc, frame)).catch(error => { onError(error); }).finally(() => pending.delete(wc));
    pending.set(wc, job);
    return job;
  }
  function attach(wc) {
    registerSession(wc.session);
    if (attached.has(wc)) return;
    attached.add(wc);
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && (input.control || input.meta) && String(input.key).toLowerCase() === 'p') {
        event.preventDefault();
        request(wc, wc.focusedFrame || wc.mainFrame);
      }
    });
  }
  return { attach, request, registerSession };
}

module.exports = { createPrintToPdf, pdfFileName, saveAutomatic };
