const { app, BrowserWindow, session } = require('electron');
const path = require('path');
let readerId, pdfjs;
const { BoundedCache, LIMITS, pdfGate } = require('./v2-policy');
const cache = new BoundedCache();
const inFlight = new Map(), sessionIds = new WeakMap(); let nextSession = 0, generation = 0;
const owners = new Set();
function clear() {
  generation++; cache.clear();
  return Promise.all([...owners].filter(wc=>!wc.isDestroyed()).flatMap(wc=>wc.mainFrame.framesInSubtree.map(frame=>frame.executeJavaScript('delete window.__spPdfText; true').catch(()=>{}))));
}
function sessionId(session) { if (!sessionIds.has(session)) sessionIds.set(session, ++nextSession); return sessionIds.get(session); }
function isViewer(frame) { return readerId && frame.url.startsWith(`chrome-extension://${readerId}/data/pdf.js/web/viewer.html`); }
async function setEnabled(enabled) {
  if (!readerId) return;
  const win = new BrowserWindow({ show:false, skipTaskbar:true, webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true} });
  try {
    await win.loadURL(`chrome-extension://${readerId}/data/options/index.html`);
    await win.webContents.executeJavaScript(`chrome.storage.local.set({frames:${!!enabled}})`,true);
  } finally { if(!win.isDestroyed()) win.destroy(); }
}
async function load(loadExtension, enabled) {
  const root=app.isPackaged ? path.join(process.resourcesPath,'app') : path.join(__dirname,'..');
  const extension=await loadExtension(session.defaultSession,path.join(root,'LEITORDEPDFCOMCAPACIDADEEMBEDDED'));
  readerId=extension.id;
  await setEnabled(enabled);
}
// Remove o leitor da sessão (ativar/desativar "na hora"). `removeExtension` vem do host.
function unload(removeExtension) {
  if (!readerId) return false;
  const id = readerId;
  readerId = undefined;
  removeExtension(session.defaultSession, id);
  return true;
}
function isLoaded() { return !!readerId; }
async function find(wc) {
  const frame=wc && !wc.isDestroyed() ? wc.focusedFrame : null;
  if(!frame || !isViewer(frame)) return false;
  return frame.executeJavaScript(`(()=>{const a=window.PDFViewerApplication;if(!a?.findBar)return false;a.findBar.open();return true;})()`,true);
}
function entries(text,term,limit) {
  text=String(text).replace(/\s+/g,' ').trim();term=String(term).trim();
  if(!term)return [];
  const result=[],lower=text.toLocaleLowerCase(),needle=term.toLocaleLowerCase();
  for(let i=lower.indexOf(needle);i!==-1 && result.length<limit;i=lower.indexOf(needle,i+term.length)) result.push({before:text.slice(Math.max(0,i-100),i),match:text.slice(i,i+term.length),after:text.slice(i+term.length,i+term.length+100),pdf:true});
  return result;
}
async function glossary(wc,term,limit=51) {
  if (!readerId || wc.isDestroyed()) return [];
  if(!owners.has(wc)){owners.add(wc);wc.once('destroyed',()=>owners.delete(wc));}
  const startedGeneration = generation;
  let url=wc.getURL();
  for(const frame of wc.mainFrame.framesInSubtree) {
    if(!isViewer(frame)) continue;
    const text = await frame.executeJavaScript(`(async () => {
      const doc = window.PDFViewerApplication?.pdfDocument; if (!doc) return '';
      if (doc.numPages > ${LIMITS.textPages}) throw Error('Limite de páginas para busca atingido.');
      const cached = window.__spPdfText;
      if (cached?.doc === doc && cached.until > Date.now()) return cached.promise;
      const record = { doc, until:Date.now()+300000 };
      record.promise = (async () => {
        let text = '';
        for(let i=1; i<=doc.numPages; i++) {
          const page=await doc.getPage(i), content=await page.getTextContent();
          text += content.items.map(x=>x.str||'').join(' ') + '\\n';
          if (text.length * 2 > ${LIMITS.textBytes}) throw Error('Limite de texto para busca atingido.');
        }
        if(window.PDFViewerApplication?.pdfDocument!==doc)throw Error('O documento mudou durante a busca.');
        return text;
      })();
      window.__spPdfText=record;
      record.promise.catch(()=>{if(window.__spPdfText===record)delete window.__spPdfText;});
      return record.promise;
    })()`);
    return entries(text,term,limit);
  }
  try {url=new URL(url).searchParams.get('file')||url;}catch{}
  if(!/^https?:/i.test(url))return [];
  const key = sessionId(wc.session) + ':' + generation + ':' + url;
  let text = cache.get(key);
  if(text === undefined) {
    if(!inFlight.has(key)) {
      const job=pdfGate.run(async () => {
        const response=await wc.session.fetch(url,{cache:'no-cache'});
        if(!response.ok)throw Error('Não foi possível obter o PDF.');
        if(Number(response.headers.get('content-length')) > LIMITS.pdfBytes)throw Error('PDF excede 64 MiB.');
        const reader=response.body.getReader(),chunks=[];let size=0;
        try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMITS.pdfBytes)throw Error('PDF excede 64 MiB.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
        const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;} chunks.length=0;
        if(String.fromCharCode(...data.slice(0,5))!=='%PDF-')throw Error('PDF inválido.');
        pdfjs ||= import('pdfjs-dist/legacy/build/pdf.mjs');
        const task=(await pdfjs).getDocument({data});const doc=await task.promise;
        try {
          if(doc.numPages>LIMITS.textPages)throw Error('Limite de páginas para busca atingido.');
          let extracted='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),c=await page.getTextContent();extracted+=c.items.map(x=>x.str||'').join(' ')+'\n';if(Buffer.byteLength(extracted)>LIMITS.textBytes)throw Error('Limite de texto para busca atingido.');page.cleanup();}
          if(startedGeneration===generation)cache.set(key,extracted);return extracted;
        } finally {await task.destroy();}
      }).finally(()=>inFlight.delete(key));
      inFlight.set(key,job);
    }
    text=await inFlight.get(key);
  }
  return entries(text,term,limit);
}
module.exports={load,unload,isLoaded,setEnabled,find,glossary,clear,isViewer};
