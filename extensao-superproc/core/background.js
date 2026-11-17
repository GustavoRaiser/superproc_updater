// Transporte da extensão Chrome; o Browser SuperPROC usa a ponte nativa equivalente.
const jobs = new Map();
let storageTail = Promise.resolve();
const storageKeys = new Set(['superproc_modules_enabled','superproc_custom_settings','superproc_local_data','superproc_automations_v1','superproc_local_data_aplicar']);
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
const allowed = url => { try { return new URL(url).hostname.endsWith('.jus.br'); } catch { return false; } };
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'superproc:pulse') { reply({ ok: true }); return; }
    if (msg?.type === 'superproc:cancel' && sender.tab && allowed(sender.url)) {
        const job = jobs.get(sender.tab.id);
        if (job) chrome.scripting.executeScript({ target: { tabId: job.tabId }, func: () => window.SuperprocCopilot?.cancel() }).catch(() => {});
        reply({ ok: true }); return;
    }
    if (msg?.type !== 'superproc:copilot' || !sender.tab || !allowed(sender.url)) return;
    if (jobs.has(sender.tab.id)) { reply({ error: 'Já há um saneamento nesta aba.' }); return; }
    const job = {}; jobs.set(sender.tab.id, job);
    (async () => {
        if (!msg.payload?.files?.length || msg.payload.files.length > 100) throw new Error('Lista de documentos inválida.');
        // Janela dedicada visível: permite autenticação e conferência da menção.
        const win = await chrome.windows.create({ url: 'https://m365.cloud.microsoft/chat?auth=2', type: 'popup', width: 1100, height: 850 });
        job.tabId = win.tabs[0].id;
        const end = Date.now() + 120000;
        while (Date.now() < end) {
            const tab = await chrome.tabs.get(job.tabId);
            const host = new URL(tab.url || 'https://invalid').hostname;
            if (tab.status === 'complete' && ['m365.cloud.microsoft', 'copilot.cloud.microsoft'].includes(host)) break;
            await new Promise(r => setTimeout(r, 800));
        }
        await chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: ['modules/automacoes/copilot_worker.js'], world: 'MAIN' });
        const result = await chrome.scripting.executeScript({ target: { tabId: job.tabId }, world: 'MAIN', func: payload => window.SuperprocCopilot.run(payload), args: [msg.payload] });
        reply({ text: result[0].result });
        // Mantém a conversa acessível; não fecha outras abas do usuário.
    })().catch(error => reply({ error: error.message })).finally(() => jobs.delete(sender.tab.id));
    return true;
});
