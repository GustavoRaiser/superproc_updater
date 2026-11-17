'use strict';
const { LIMITS } = require('./v2-policy');
// Pull bounded binary chunks; no binary-string/Base64 copy of the entire PDF.
async function readPdf(frame, check = () => {}) {
  const id = '__superprocPdfTransfer';
  const info = await frame.executeJavaScript(`(async () => {
    const app = window.PDFViewerApplication;
    if(app?.initializedPromise)await app.initializedPromise;
    if(!app?.pdfDocument&&app?.pdfLoadingTask)await app.pdfLoadingTask.promise;
    const doc = app?.pdfDocument;
    if (!doc) throw Error('PDF indisponível.');
    const known = doc.getDownloadInfo ? await doc.getDownloadInfo() : {};
    if (known.length > ${LIMITS.pdfBytes}) throw Error('PDF excede o limite de 64 MiB.');
    const bytes = doc.annotationStorage?.size ? await doc.saveDocument() : await doc.getData();
    if (!bytes.length || bytes.length > ${LIMITS.pdfBytes}) throw Error('Tamanho de PDF inválido.');
    window.${id} = bytes; return { length: bytes.length, pages: doc.numPages, name: window.PDFViewerApplication._docFilename || document.title };
  })()`, true);
  try {
    check(); const buffer = Buffer.allocUnsafe(info.length);
    for (let offset = 0; offset < info.length; offset += 256 * 1024) {
      check(); const bytes = await frame.executeJavaScript(`window.${id}.slice(${offset},${Math.min(info.length, offset + 256 * 1024)})`, true);
      const chunk = Buffer.from(bytes); if (chunk.length !== Math.min(256 * 1024, info.length - offset)) throw Error('Transferência incompleta.'); chunk.copy(buffer, offset);
    }
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw Error('O documento carregado não é um PDF válido.');
    return { buffer, ...info };
  } finally { await frame.executeJavaScript(`delete window.${id}; true`).catch(() => {}); }
}
const staged = new Map(); let stagedBytes = 0;
async function stageFile(frame, buffer, check = () => {}) {
  if (buffer.length > LIMITS.pdfBytes) throw Error('PDF excede 64 MiB.');
  if(stagedBytes+buffer.length>LIMITS.pdfBytes)throw Error('Orçamento de anexos em andamento atingido; aguarde a conclusão.');
  const id = require('node:crypto').randomBytes(16).toString('hex');
  staged.set(id,buffer.length);stagedBytes+=buffer.length;
  try {
    await frame.executeJavaScript(`(window.__spNativePdfFiles ||= Object.create(null))[${JSON.stringify(id)}] = new Uint8Array(${buffer.length}); true`, true);
    for(let offset=0;offset<buffer.length;offset+=256*1024){
      check();
      const chunk=buffer.subarray(offset,offset+256*1024).toString('base64');
      await frame.executeJavaScript(`window.__spNativePdfFiles[${JSON.stringify(id)}].set(Uint8Array.from(atob(${JSON.stringify(chunk)}),c=>c.charCodeAt(0)),${offset}); true`,true);
    }
    return id;
  } catch(error) { await releaseFile(frame,id); throw error; }
}
async function releaseFile(frame,id) {
  if(staged.has(id)){stagedBytes-=staged.get(id);staged.delete(id);}
  await frame.executeJavaScript(`if(window.__spNativePdfFiles)delete window.__spNativePdfFiles[${JSON.stringify(id)}]; true`).catch(()=>{});
}
module.exports = { readPdf, stageFile, releaseFile };
