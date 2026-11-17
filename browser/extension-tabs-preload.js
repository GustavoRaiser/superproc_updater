'use strict';
const {contextBridge,ipcRenderer}=require('electron');
try {
  const scope=contextBridge.executeInMainWorld({func:()=>globalThis.location?.href || ''});
  if (String(scope).startsWith('chrome-extension://')) {
    contextBridge.exposeInMainWorld('__superprocExtensionTabs', {
      create: options=>ipcRenderer.invoke('superproc-extension-create-tab',options),
      createWindow: options=>ipcRenderer.invoke('superproc-extension-create-window',options),
      updateWindow: (id,options)=>ipcRenderer.invoke('superproc-extension-update-window',id,options)
    });
    contextBridge.executeInMainWorld({func:()=>{
      const failedCallback=(callback,error)=>{
        const previous=Object.getOwnPropertyDescriptor(chrome.runtime,'lastError');
        try { Object.defineProperty(chrome.runtime,'lastError',{configurable:true,value:{message:error.message}});callback(undefined); }
        finally { if(previous)Object.defineProperty(chrome.runtime,'lastError',previous);else delete chrome.runtime.lastError; }
      };
      // A compatibilidade existente do AZflow implementa windows.update como Promise;
      // complete também o callback usado por extensões Chrome.
      if (!chrome.windows) {
        let windows;
        Object.defineProperty(chrome,'windows',{configurable:true,enumerable:true,get:()=>windows,set:value=>{
          windows=value;
          if (windows) {
            const created=new Set();
            windows.create=(options,callback)=>{
              const result=globalThis.__superprocExtensionTabs.createWindow(options || {}).then(win=>{created.add(win.id);return win;});
              if(typeof callback==='function'){result.then(callback,error=>failedCallback(callback,error));return;}
              return result;
            };
          if (windows && typeof windows.update==='function') {
            const update=windows.update.bind(windows);
            windows.update=(id,options,callback)=>{
              const result=created.has(id)?globalThis.__superprocExtensionTabs.updateWindow(id,options || {}):Promise.resolve(update(id,options));
              if(typeof callback==='function'){result.then(callback,()=>callback(undefined));return;}
              return result;
            };
          }
          }
        }});
        // Workers que não possuem nenhum polyfill também recebem a operação de abrir janela.
        setTimeout(()=>{if(!chrome.windows)chrome.windows={update:async(id,options)=>({id,...options})};},0);
      }
      if (!globalThis.chrome?.tabs || typeof chrome.tabs.create === 'function') return;
      chrome.tabs.create = (options, callback) => {
        const result=globalThis.__superprocExtensionTabs.create(options || {});
        if (typeof callback === 'function') {
          result.then(tab=>callback(tab),error=>failedCallback(callback,error));
          return;
        }
        return result;
      };
    }});
  }
} catch(error) { console.warn('[SuperPROC] Ponte de abas indisponível:',error.message); }
