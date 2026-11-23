// Transporte da extensão Chrome; o Browser SuperPROC usa a ponte nativa equivalente.
// Sem integração com IA: tudo que envolve IA é do navegador SuperPROC.
let storageTail = Promise.resolve();
const storageKeys = new Set(['superproc_modules_enabled','superproc_custom_settings','superproc_local_data','superproc_local_data_aplicar']);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,100}$/i.test(value) && !['constructor','prototype','__proto__'].includes(value);
function storageCall(method, ...args) {
    return new Promise((resolve,reject) => chrome.storage.local[method](...args,value => {
        if(chrome.runtime.lastError)reject(Error('Falha ao persistir preferências.'));else resolve(value);
    }));
}
chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if(message?.type!=='superproc:storage')return;
    if(sender.id!==chrome.runtime.id){reply({ok:false,error:'Origem inválida.'});return;}
    const job=storageTail.catch(()=>{}).then(async()=>{
        const {op,payload}=message;
        if(!payload||JSON.stringify(payload).length>2*1024*1024)throw Error('Preferências excedem o limite.');
        if(op==='module'||op==='settings'){
            if(!validId(payload.id))throw Error('Módulo inválido.');
            const key=op==='module'?'superproc_modules_enabled':'superproc_custom_settings';
            const map={...(await storageCall('get',key))[key]};
            if(op==='module')map[payload.id]=!!payload.value;
            else {
                if(!payload.value||typeof payload.value!=='object'||Array.isArray(payload.value))throw Error('Configuração inválida.');
                map[payload.id]={...map[payload.id],...payload.value};
            }
            await storageCall('set',{[key]:map});
        }else if(op==='set'){
            if(Object.keys(payload).some(key=>!storageKeys.has(key)))throw Error('Chave inválida.');
            await storageCall('set',payload);
        }else throw Error('Operação inválida.');
    });
    storageTail=job;
    job.then(()=>reply({ok:true}),()=>reply({ok:false,error:'Falha ao salvar preferências. Confira o armazenamento e tente novamente.'}));
    return true;
});
// Sinal universal "vai mudar / mudou" dos localizadores (Chrome comum). No Browser SuperPROC o host faz o
// mesmo (browser/localizadores-sinal.js) e chrome.webRequest não existe aqui, então nada é registrado.
if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  const filtro = { urls: ['*://*/*acao_ajax=alterar_localizadores*'] };
  const avisarLocalizadores = (evento, d, ok) => {
    if (d.tabId < 0) return;
    chrome.tabs.sendMessage(d.tabId, { type: 'superproc:sinal-localizadores', evento, id: `bg-${d.requestId}`, ok }, { frameId: d.frameId }).catch(() => {});
  };
  chrome.webRequest.onBeforeRequest.addListener(d => avisarLocalizadores('vai-mudar', d, true), filtro);
  chrome.webRequest.onCompleted.addListener(d => avisarLocalizadores('atualizados', d, d.statusCode < 400), filtro);
  chrome.webRequest.onErrorOccurred.addListener(d => avisarLocalizadores('atualizados', d, false), filtro);
}
