'use strict';

// O Electron não implementa chrome.tabs.create. A adaptação fica no host,
// independente da pasta/canal do AZflow carregado, e não altera o seu aceite.
const LEGAL_PAGES = new Set(['/boas-vindas.html','/termos.html','/privacidade.html','/iniciando.html']);
function isAzflowPage(url, extensionId, includePopup = false) {
  try {
    const parsed = new URL(url);
    return !!extensionId && parsed.protocol === 'chrome-extension:' && parsed.hostname === extensionId &&
      !parsed.username && !parsed.password && !parsed.port &&
      (LEGAL_PAGES.has(parsed.pathname) || (includePopup && parsed.pathname === '/popup.html'));
  } catch { return false; }
}

const OPEN_COMPATIBILITY_SCRIPT = `(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.tabs?.create === 'function' || window.__superprocAzflowOnboarding) return;
  const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function(message, ...args) {
    if (message?.action !== 'azflow_onboarding_open') return sendMessage(message, ...args);
    let response;
    try {
      const opened = window.open(chrome.runtime.getURL('boas-vindas.html'), 'azflow-configuracao-inicial');
      response = opened ? {ok:true} : {ok:false,error:'Não foi possível abrir a configuração inicial.'};
      if (opened) opened.focus();
    } catch (_) { response = {ok:false,error:'Não foi possível abrir a configuração inicial.'}; }
    const callback = args[args.length-1];
    if (typeof callback === 'function') { queueMicrotask(() => callback(response)); return; }
    return Promise.resolve(response);
  };
  window.__superprocAzflowOnboarding = true;
})()`;

function installAzflowOnboarding(contents, {getExtensionId, windowOptions = () => ({}), onWindow = () => {}}) {
  const inject = () => {
    if (contents.isDestroyed() || !isAzflowPage(contents.getURL(),getExtensionId(),true)) return;
    contents.executeJavaScript(OPEN_COMPATIBILITY_SCRIPT,true).catch(error => {
      console.warn('[AZflow] Não foi possível preparar a abertura da configuração inicial:',error.message);
    });
  };
  contents.on('dom-ready',inject);
  contents.setWindowOpenHandler(details => {
    if (!isAzflowPage(contents.getURL(),getExtensionId(),true) || !isAzflowPage(details.url,getExtensionId())) return {action:'allow'};
    const options=windowOptions();
    return {
      action:'allow',
      outlivesOpener:true,
      overrideBrowserWindowOptions:{
        ...options,frame:true,resizable:true,minWidth:Math.min(640,options.width || 640),minHeight:Math.min(480,options.height || 480),
        webPreferences:{session:contents.session,nodeIntegration:false,contextIsolation:true,sandbox:true}
      }
    };
  });
  contents.on('did-create-window',(window,details) => {
    if (!isAzflowPage(contents.getURL(),getExtensionId(),true) || !isAzflowPage(details.url,getExtensionId())) return;
    onWindow(window);
    installAzflowOnboarding(window.webContents,{getExtensionId,windowOptions,onWindow});
  });
}

module.exports={installAzflowOnboarding,isAzflowPage};
