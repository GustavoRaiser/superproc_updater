'use strict';
// Ligação do modo teste "página-anfitriã" (desligado por padrão): provedor de abas/texto/consentimento para
// copilot-protocolo-edge.js. Camada: host. Liga com --copilot-anfitriao ou o arquivo <perfil>/copilot-anfitriao.ligar.
// Consentimento sempre pelo usuário (diálogo nativo); "nesta sessão" vale só até fechar o app. Logs: só metadados.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ARG = '--copilot-anfitriao';
const ARQUIVO_FLAG = 'copilot-anfitriao.ligar';
const ARQUIVO_HTML = path.join(__dirname, 'copilot-anfitriao', 'anfitriao.html');
const PRELOAD = path.join(__dirname, 'copilot-anfitriao', 'anfitriao-preload.js');
const MUNDO = 1092;
const RE_PDF = /\.pdf(?:[?#]|$)/i;

const estaLigado = ({ argv = [], existe = () => false, caminhoFlag = '' } = {}) => argv.includes(ARG) || !!(caminhoFlag && existe(caminhoFlag));
const urlDaPagina = (urlCopilot) => pathToFileURL(ARQUIVO_HTML).href + '?alvo=' + encodeURIComponent(urlCopilot);

function codigoLeitura(seletor, max) {
  return `(()=>{try{const s=${JSON.stringify(seletor || '')};const n=s?document.querySelector(s):document.body;return n?String(n.innerText||'').slice(0,${Number(max) | 0}):''}catch(_){return null}})()`;
}

// Busca e realce de trechos (Edge.Context.FindTextOnPage / HighlightTextOnPage). Executam no mundo isolado do frame
// principal. O realce usa a CSS Custom Highlight API (sem alterar o DOM da página, exceto um <style> identificado).
const NOME_REALCE = 'superproc-copilot';
const JS_NOS_DE_TEXTO = `const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p=n.parentElement;return p&&!/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});const nos=[];let t='';while(w.nextNode()){nos.push([w.currentNode,t.length]);t+=w.currentNode.data}`;
const JS_LIMPAR_REALCE = `try{CSS.highlights&&CSS.highlights.delete(${JSON.stringify(NOME_REALCE)});const e=document.getElementById(${JSON.stringify(NOME_REALCE)});if(e)e.remove()}catch(_){}`;
function codigoBusca(textos) {
  return `(()=>{try{${JS_LIMPAR_REALCE}if(!document.body)return null;${JS_NOS_DE_TEXTO}return ${JSON.stringify(textos)}.map(x=>t.includes(x))}catch(_){return null}})()`;
}
function codigoRealce(texto) {
  return `(()=>{try{${JS_LIMPAR_REALCE}if(!document.body||!window.CSS||!CSS.highlights||typeof Highlight!=='function')return false;${JS_NOS_DE_TEXTO}const x=${JSON.stringify(texto)};const i=t.indexOf(x);if(i<0)return false;const f=i+x.length;const lugar=(pos,fim)=>{for(const [n,o] of nos){const c=n.data.length;if(fim?(pos>o&&pos<=o+c):(pos>=o&&pos<o+c))return [n,pos-o]}return null};const A=lugar(i,false),B=lugar(f,true);if(!A||!B)return false;const [a,ao]=A,[b,bo]=B;const r=document.createRange();r.setStart(a,ao);r.setEnd(b,bo);const s=document.createElement('style');s.id=${JSON.stringify(NOME_REALCE)};s.textContent='::highlight(${NOME_REALCE}){background:#ffe066;color:#000}';(document.head||document.documentElement).appendChild(s);CSS.highlights.set(${JSON.stringify(NOME_REALCE)},new Highlight(r));const el=a.parentElement;if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});return true}catch(_){return false}})()`;
}

function criarProvedor({ getTabs, getActiveTabId, getJanela, perguntar, log = () => {} }) {
  const sessao = new Set(); // permissão limitada à origem, documento e finalidade
  const documentos = new WeakMap();
  const documento = wc => {
    if (!documentos.has(wc)) {
      const estado = { versao: 0 };
      documentos.set(wc, estado);
      if (typeof wc.on === 'function') wc.on('did-start-navigation', (_e, _url, _inPlace, principal) => { if (principal) estado.versao++; });
    }
    return documentos.get(wc).versao;
  };
  const descrever = (t) => ({ id: t.id, windowId: 1, index: Math.max(0, getTabs().indexOf(t)), active: t.id === getActiveTabId(), title: String(t.title || ''), url: String(t.url || ''), tipo: RE_PDF.test(String(t.url || '')) ? 'pdf' : 'web' });
  const elegivel = (t) => !t.isEmptyState && /^https?:\/\//i.test(String(t.url || '')) && !!t.view && !t.view.webContents.isDestroyed();
  const alvoAtual = (alvo) => {
    const t = alvo && alvo._tab;
    return !!t && getTabs().includes(t) && elegivel(t) && t.url === alvo.url && t.view.webContents === alvo._wc &&
      documento(alvo._wc) === alvo._documento && (typeof alvo._wc.getURL !== 'function' || alvo._wc.getURL() === alvo._urlCarregada);
  };
  return {
    async listarAbas() { return getTabs().filter(elegivel).map(descrever); },
    async abaAlvo({ tabId, url }) {
      const lista = getTabs().filter(elegivel);
      let t = tabId > 0 ? lista.find(x => x.id === tabId) : null;
      if (!t && url && !(tabId > 0)) t = lista.find(x => x.url === url);
      if (!t && !(tabId > 0) && !url) t = lista.find(x => x.id === getActiveTabId());
      if (t && url && t.url !== url) return null;
      return t ? { ...descrever(t), _tab: t, _wc: t.view.webContents, _documento: documento(t.view.webContents), _urlCarregada: typeof t.view.webContents.getURL === 'function' ? t.view.webContents.getURL() : t.url } : null;
    },
    alvoAtual,
    async consentir({ origem, alvo, finalidade }) {
      const chave = JSON.stringify([origem, alvo ? alvo.id : null, alvo ? alvo.url : null, alvo ? alvo._documento : null, finalidade]);
      if (sessao.has(chave)) return true;
      const r = await perguntar({ origem, finalidade, titulo: alvo ? alvo.title : '' });
      log('COPILOT_CONSENTIMENTO', 'Finalidade ' + finalidade + ': ' + r);
      if (r === 'sessao') { sessao.add(chave); return true; }
      return r === 'uma-vez';
    },
    async lerTexto(alvo, { seletor, max }) {
      const wc = alvo._tab && alvo._tab.view && alvo._tab.view.webContents;
      if (!wc || wc.isDestroyed() || !alvoAtual(alvo)) return null;
      const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: codigoLeitura(seletor, max) }]);
      return alvoAtual(alvo) && typeof r === 'string' ? r : null;
    },
    async buscarTextos(alvo, textos) {
      const wc = alvo._tab && alvo._tab.view && alvo._tab.view.webContents;
      if (!wc || wc.isDestroyed() || !alvoAtual(alvo)) return null;
      const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: codigoBusca(textos) }]);
      return alvoAtual(alvo) && Array.isArray(r) && r.length === textos.length ? r.map(Boolean) : null;
    },
    async realcar(alvo, texto) {
      const wc = alvo._tab && alvo._tab.view && alvo._tab.view.webContents;
      if (!wc || wc.isDestroyed() || !alvoAtual(alvo)) return false;
      const r = await wc.executeJavaScriptInIsolatedWorld(MUNDO, [{ code: codigoRealce(texto) }]);
      return alvoAtual(alvo) && r === true;
    },
    async lerPdf(alvo, { max, paginas } = {}) {
      const de = paginas && Number.isSafeInteger(paginas.de) && paginas.de > 0 ? paginas.de : 1;
      const ate = paginas && Number.isSafeInteger(paginas.ate) && paginas.ate >= de ? paginas.ate : Number.MAX_SAFE_INTEGER;
      if (!alvoAtual(alvo)) return null;
      const frames = alvo._wc.mainFrame.framesInSubtree || [alvo._wc.mainFrame];
      // Somente o leitor pdf.js próprio. PDF Chromium e outros leitores não são presumidos compatíveis.
      for (const frame of frames) {
        let texto;
        try {
          texto = await frame.executeJavaScript(`(async()=>{const doc=window.PDFViewerApplication?.pdfDocument;if(!doc)return null;let t='';for(let i=${de};i<=Math.min(doc.numPages,${ate})&&t.length<${max};i++){const p=await doc.getPage(i);const c=await p.getTextContent();t+=c.items.map(x=>typeof x.str==='string'?x.str:'').join(' ')+'\\n';if(window.PDFViewerApplication?.pdfDocument!==doc)return null;}return t.slice(0,${max});})()`);
        } catch (_) { continue; }
        if (typeof texto === 'string') return alvoAtual(alvo) ? texto : null;
      }
      return null;
    }
  };
}

module.exports = { ARG, ARQUIVO_FLAG, ARQUIVO_HTML, PRELOAD, MUNDO, estaLigado, urlDaPagina, codigoLeitura, codigoBusca, codigoRealce, criarProvedor };
