'use strict';
const path=require('node:path');
function validateRequest(worker,session,options) {
  const source=new URL(worker.scriptURL);
  if(source.protocol!=='chrome-extension:')throw Error('Origem não autorizada.');
  const extensions=session.extensions.getAllExtensions();
  const ext=extensions.find(item=>item.id===source.hostname);
  if(!ext)throw Error('Extensão não carregada.');
  if(!options || typeof options!=='object' || Array.isArray(options))throw Error('Pedido inválido.');
  const requested=options.url===undefined?'about:blank':String(options.url);
  if(requested.length>16384)throw Error('Endereço muito longo.');
  const dest=new URL(requested,`chrome-extension://${source.hostname}/`);
  const url=dest.href;
  if(!(['http:','https:'].includes(dest.protocol) || (dest.protocol==='chrome-extension:' && dest.hostname===source.hostname) || url==='about:blank'))throw Error('Endereço não permitido.');
  if(dest.username || dest.password)throw Error('Endereço não permitido.');
  return {url,active:options.active!==false};
}
function installExtensionTabs(session,{openTab,openWindow,updateWindow}) {
  const installed=new WeakSet();
  session.serviceWorkers.on('running-status-changed',event=>{
    if(event.runningStatus!=='starting'&&event.runningStatus!=='running')return;
    const worker=session.serviceWorkers.getWorkerFromVersionID(event.versionId);
    if(!worker || installed.has(worker) || !String(worker.scriptURL).startsWith('chrome-extension://'))return;
    installed.add(worker);
    worker.ipc.handle('superproc-extension-create-tab',(event,options)=>{
      if(event.session!==session || event.serviceWorker!==worker)throw Error('Origem não autorizada.');
      return openTab(validateRequest(worker,session,options));
    });
    worker.ipc.handle('superproc-extension-create-window',(event,options)=>{
      if(event.session!==session || event.serviceWorker!==worker)throw Error('Origem não autorizada.');
      if(options?.incognito || options?.tabId!==undefined || Array.isArray(options?.url))throw Error('Opção de janela não suportada.');
      const request=validateRequest(worker,session,{url:options?.url,active:options?.focused!==false});
      return openWindow(request,options,worker);
    });
    worker.ipc.handle('superproc-extension-update-window',(event,id,options)=>{
      if(event.session!==session || event.serviceWorker!==worker)throw Error('Origem não autorizada.');
      return updateWindow(id,options,worker);
    });
  });
  session.registerPreloadScript({type:'service-worker',filePath:path.join(__dirname,'extension-tabs-preload.js')});
}
module.exports={installExtensionTabs,validateRequest};
