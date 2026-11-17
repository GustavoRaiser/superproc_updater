import { domWork } from '../runtime/dom-work.js';
import { normalize, urlFrom, preference, responseHtml, latinForm, normalizeWidget, editorFromResponse } from './saneador_utils.js';

const DEFAULTS = {
    agent: 'TR003C - Saneador', preference: '5. Saneador',
    prompt: 'Execute o saneamento do processo com base em todos os documentos anexados nesta conversa. Identifique as questões processuais pendentes, delimite as questões de fato e de direito e organize a instrução conforme os elementos dos autos. Não invente fatos ou decisões; explicite lacunas relevantes. Entregue somente o conteúdo da minuta de saneamento, sem comentários sobre a tarefa, preferencialmente em HTML simples com parágrafos e títulos. A minuta será revisada pelo usuário antes de qualquer assinatura.'
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async key => (await chrome.storage.local.get(key))[key];
const set = (key, value) => chrome.storage.local.set({ [key]: value });
function processNumber(doc = document) {
    const params = new URLSearchParams(doc.location?.search || location.search);
    const raw = params.get('num_processo') || params.get('txtNumProcesso') || doc.querySelector('#txtNumProcesso, [name="num_processo"], [name="txtNumProcesso"]')?.value || doc.querySelector('#lnkNumProcesso, .infraNumProcesso, [data-num-processo]')?.textContent;
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 20) return digits;
    const match = doc.body?.innerText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
    return match ? match[0].replace(/\D/g, '') : '';
}
function rpc(win, type, responseType, args, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const listener = event => {
            if (event.source !== win || event.origin !== location.origin || event.data?.type !== responseType || event.data.id !== id) return;
            clearTimeout(timer); window.removeEventListener('message', listener);
            if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
        };
        window.addEventListener('message', listener);
        const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('A ponte da automação não respondeu. Reabra esta página após atualizar o SuperPROC.')); }, timeout);
        win.postMessage({ type, id, ...args }, location.origin);
        // Respostas dos frames são entregues na janela do próprio frame.
        if (win !== window) {
            win.removeEventListener('message', listener);
            window.removeEventListener('message', listener);
            const childListener = event => {
                if (event.source !== win || event.origin !== location.origin || event.data?.type !== responseType || event.data.id !== id) return;
                clearTimeout(timer); win.removeEventListener('message', childListener);
                if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
            };
            win.addEventListener('message', childListener);
        }
    });
}
async function nativeHostAvailable() {
    return new Promise(resolve => {
        const id = crypto.randomUUID();
        const fn = event => { if (event.source === window && event.origin === location.origin && event.data?.type === 'superproc:saneador-host-ready' && event.data.id === id) { clearTimeout(timer); window.removeEventListener('message', fn); resolve(true); } };
        window.addEventListener('message', fn);
        const timer = setTimeout(() => { window.removeEventListener('message', fn); resolve(false); }, 400);
        window.postMessage({ type: 'superproc:saneador-host-probe', id }, location.origin);
    });
}
async function copilot(payload, native) {
    let result;
    if (native) result = await rpc(window, 'superproc:saneador-host', 'superproc:saneador-host-result', { request: { payload } }, 60 * 60000);
    else {
        const pulse = setInterval(() => chrome.runtime.sendMessage({ type: 'superproc:pulse' }).catch(() => {}), 20000);
        try { result = await chrome.runtime.sendMessage({ type: 'superproc:copilot', payload }); } finally { clearInterval(pulse); }
    }
    if (result?.error) throw new Error(result.error);
    if (!result?.text) throw new Error('O agente não devolveu uma resposta.');
    return result.text;
}
export function selectedDocuments(doc = document) {
    return [...doc.querySelectorAll('#divArvore li.jstree-checked')].filter(li => li.getAttribute('evento') !== 'true' && !li.querySelector(':scope > ul'))
        .map(li => {
            const anchor = li.querySelector(':scope > a.jstree-anchor');
            const sources = [li.outerHTML, anchor?.getAttribute('href'), anchor?.getAttribute('onclick')];
            return { id: li.getAttribute('seqdoc') || li.id, name: (anchor?.textContent || li.textContent).trim(), url: sources.map(s => urlFrom(s, doc.baseURI, 'acessar_documento') || urlFrom(s, doc.baseURI, 'acessar_documento_implementacao')).find(Boolean) };
        });
}
async function collect() {
    let documents = selectedDocuments();
    if (documents.some(d => !d.url)) {
        const nativeNodes = await rpc(window, 'superproc:saneador-eproc', 'superproc:saneador-eproc-result', { command: 'tree' });
        documents = documents.map(d => {
            const node = nativeNodes.find(n => n.id === d.id || String(n.li?.seqdoc) === String(d.id));
            return { ...d, url: d.url || urlFrom(JSON.stringify(node || {}), location.href, 'acessar_documento') || urlFrom(JSON.stringify(node || {}), location.href, 'acessar_documento_implementacao') };
        });
    }
    const seen = new Set();
    return documents.filter(d => { const key = d.url || d.id; if (seen.has(key)) return false; seen.add(key); return true; });
}
async function fetchDocument(doc, index, depth = 0) {
    if (!doc.url) throw new Error(`Não foi possível localizar o endereço de "${doc.name}".`);
    const url = new URL(doc.url);
    if (url.origin !== location.origin) throw new Error('Documento fora da sessão atual do eProc.');
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`Falha ao obter "${doc.name}" (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (blob.size > 20 * 1024 * 1024) throw new Error(`"${doc.name}" excede 20 MB. Reduza a seleção.`);
    let type = blob.type.split(';')[0] || 'application/pdf', content = blob;
    if (/html/.test(type)) {
        const html = await blob.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const frame = parsed.querySelector('iframe[src], object[data], embed[src]');
        if (frame && depth < 3) return fetchDocument({ ...doc, url: new URL(frame.getAttribute('src') || frame.getAttribute('data'), url).href }, index, depth + 1);
        if (parsed.querySelector('input[type="password"]') || /sess[aã]o.*(?:expir|encerr)|usu[aá]rio.*n[aã]o.*autentic/i.test(parsed.body.textContent)) throw new Error('A sessão do eProc expirou ao obter um documento.');
        parsed.querySelectorAll('script, style, nav, header').forEach(n => n.remove());
        const text = (parsed.body.innerText || parsed.body.textContent).trim();
        if (text.length < 80) throw new Error(`O conteúdo de "${doc.name}" está vazio ou bloqueado.`);
        content = new Blob([text], { type: 'text/plain' }); type = 'text/plain';
    }
    if (!/^(application\/(pdf|msword|vnd\.)|image\/|text\/)/.test(type)) throw new Error(`Tipo não suportado no Saneador: ${type}.`);
    const extension = type === 'application/pdf' ? 'pdf' : type.startsWith('image/') ? type.split('/')[1] : type === 'text/plain' ? 'txt' : 'docx';
    const name = `${String(index + 1).padStart(3, '0')}_${doc.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(0, 100)}.${extension}`;
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(content); });
    return { name, type, data };
}
async function eprocText(url, options) {
    const response = await fetch(url, { credentials: 'include', ...options });
    if (!response.ok) throw new Error(`O eProc respondeu HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    const charset = response.headers.get('content-type') || '';
    return new TextDecoder(/utf-8/i.test(charset) ? 'utf-8' : 'iso-8859-1').decode(bytes);
}
function bodySection(article) {
    const excluded = ['endereco', 'identificacao_processo', 'partes', 'titulo', 'assinaturas', 'notas', 'splited', 'secao_separadora'];
    const sections = [...article.querySelectorAll(':scope > section[data-nome]')].filter(s => !excluded.includes(s.dataset.nome));
    if (sections.length !== 1) throw new Error('Não foi possível identificar unicamente o corpo da minuta; o conteúdo não será sobrescrito.');
    return sections[0];
}
export async function saveDraft(editorUrl, answer) {
    const url = new URL(editorUrl), hash = url.searchParams.get('hash'), id = url.searchParams.get('id_minuta');
    if (!hash || !id || url.origin !== location.origin) throw new Error('Editor da minuta inválido.');
    const doc = new DOMParser().parseFromString(await eprocText(url), 'text/html');
    const article = doc.querySelector('article[data-id_documento], article[data-cod_documento]');
    if (!article) throw new Error('Documento editável não encontrado na minuta criada.');
    const section = bodySection(article);
    const body = responseHtml(answer);
    section.innerHTML = body;
    article.querySelectorAll('section[data-nome="splited"], section[data-nome="secao_separadora"]').forEach(n => n.remove());
    let xml = new XMLSerializer().serializeToString(article).replace(/\s+xmlns="[^"]*"/g, '');
    if (new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror')) throw new Error('A resposta não pôde ser convertida para o formato de documento do eProc.');
    xml = Array.from(xml).map(c => c.codePointAt(0) > 255 ? `&#${c.codePointAt(0)};` : c).join('');
    const payload = new URLSearchParams({ text: xml, id_minuta: id, alterarstatus: '0', statusMinutaDesejado: '0', sbmCadastrarVersaoConteudo: '1', acao: 'minuta_salvar', cod_tipo_salvamento_versao_conteudo: '2' });
    const endpoint = new URL(`controlador_ajax.php?acao_ajax=minuta_salvar&hash=${hash}`, url);
    const result = await eprocText(endpoint, { method: 'POST', body: payload });
    if (!/versao_conteudo_salvo=\d+/.test(result)) throw new Error('O eProc não confirmou a gravação. A resposta do agente foi preservada no Saneador.');
    const persisted = new DOMParser().parseFromString(await eprocText(url), 'text/html');
    const pa = persisted.querySelector('article[data-id_documento], article[data-cod_documento]');
    if (!pa) throw new Error('Não foi possível reler a minuta após salvar.');
    const ps = bodySection(pa), chain = [ps];
    let next = ps.nextElementSibling;
    while (next && ['splited', 'secao_separadora'].includes(next.dataset.nome)) { if (next.dataset.nome === 'splited') chain.push(next); next = next.nextElementSibling; }
    const expected = normalize(new DOMParser().parseFromString(body, 'text/html').body.textContent);
    if (normalize(chain.map(s => s.textContent).join('')) !== expected) throw new Error('A releitura da minuta divergiu da resposta enviada. Confira o documento antes de prosseguir.');
    // O fluxo em lote deve fechar o editor SEM destravar a minuta, conforme solicitado.
    return editorUrl;
}
async function createDraft(url, onPosted) {
    const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:1100px;height:800px;left:-12000px;top:0;border:0'; frame.src = url;
    document.body.appendChild(frame);
    try {
        const end = Date.now() + 60000; let doc;
        while (Date.now() < end) {
            try { doc = frame.contentDocument; if (doc?.querySelector('#frmMinutaCadastro') && doc.readyState === 'complete') break; } catch { /* carregando */ }
            await sleep(300);
        }
        if (!doc?.querySelector('#frmMinutaCadastro')) throw new Error('A preferência não abriu o formulário de cadastro.');
        await sleep(2000);
        if (doc.querySelector('.infraMensagemErro')?.textContent.trim()) throw new Error(doc.querySelector('.infraMensagemErro').textContent.trim());
        const snapshot = await rpc(frame.contentWindow, 'superproc:saneador-eproc', 'superproc:saneador-eproc-result', { command: 'form' });
        if (new URL(snapshot.action).origin !== location.origin) throw new Error('O cadastro apontou para outra origem.');
        const fields = snapshot.fields.map(([k, v]) => [k, normalizeWidget(v)]);
        fields.push(['sbmCadastrarEditarMinuta', 'Cadastrar e Editar']);
        const payload = latinForm(fields);
        await onPosted(); // checkpoint ANTES do POST: falha ambígua não cria outra minuta.
        const html = await eprocText(snapshot.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload });
        return editorFromResponse(html, url);
    } finally { frame.remove(); }
}
export default {
    async init() {
        if (document.getElementById('superproc-saneador')) return;
        const process = processNumber(); if (!process) return;
        const scope = `${location.origin}:${process}`, contextKey = 'sp_saneador_context:' + scope, selectionKey = 'sp_saneador_selection:' + scope, jobKey = 'sp_saneador_job:' + scope;
        const settingsKey = 'sp_saneador_settings';
        let config = { ...DEFAULTS, ...await get(settingsKey) };
        const tree = !!document.querySelector('#divArvore');
        const panel = document.createElement('div'); panel.id = 'superproc-saneador';
        panel.style.cssText = 'padding:8px 10px;margin:6px 0;background:#eef6ff;border:1px solid #93bbdf;border-radius:6px;font:13px Arial;color:#173b5d;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
        panel.innerHTML = '<strong>Saneador</strong><button type="button" data-run>Sanear processo</button><button type="button" data-config>Configurar</button><button type="button" data-cancel hidden>Cancelar</button><button type="button" data-copy hidden>Copiar resposta</button><span data-status>Usa os documentos marcados na árvore.</span><a data-editor hidden target="_blank" rel="noopener">Abrir minuta</a>';
        const anchor = document.querySelector('#divArvore, #divInfraAreaProcesso, #fldCapaProcesso, #div-acoes-preferenciais');
        if (anchor) anchor.before(panel); else document.body.prepend(panel);
        const status = text => { panel.querySelector('[data-status]').textContent = text; };
        let lastContext = '';
        const context = async () => {
            if (tree) return;
            try { const pref = preference(document, location.href, config.preference); const value={url:location.href,pref,preference:config.preference,process}; const signature=JSON.stringify(value); if(signature!==lastContext){await set(contextKey,{...value,at:Date.now()});lastContext=signature;} } catch { /* preferência carregada depois por AJAX */ }
        };
        await context();
        let busy = false, job = await get(jobKey), cancelled = false, native = false;
        if (job?.answer) panel.querySelector('[data-copy]').hidden = false;
        if (job?.editorUrl) { panel.querySelector('[data-editor]').href = job.editorUrl; panel.querySelector('[data-editor]').hidden = false; }
        if (job && job.phase !== 'done') status('Há uma tarefa anterior incompleta. A resposta foi preservada; confira a minuta antes de repetir.');
        if (!tree) domWork({run:()=>{if(!busy)return context();},fallback:10000});
        if (tree) {
            let previous = '';
            domWork({run:async () => { if (busy) return; const docs = selectedDocuments(); const signature = JSON.stringify(docs); if (signature !== previous) { await set(selectionKey, { process, at: Date.now(), documents: docs }); previous = signature; } },fallback:5000,events:['change','click']});
        }
        panel.querySelector('[data-config]').onclick = async () => {
            const agent = window.prompt('Nome exato do agente do Copilot:', config.agent); if (!agent?.trim()) return;
            const pref = window.prompt('Nome exato da preferência de minuta:', config.preference); if (!pref?.trim()) return;
            const prompt = window.prompt('Solicitação enviada ao agente:', config.prompt); if (!prompt?.trim()) return;
            config = { agent: agent.trim(), preference: pref.trim(), prompt: prompt.trim() }; await set(settingsKey, config); await context(); status('Configuração salva.');
        };
        panel.querySelector('[data-copy]').onclick = async () => { job = await get(jobKey); if (job?.answer) { await navigator.clipboard.writeText(job.answer); status('Resposta copiada.'); } };
        panel.querySelector('[data-cancel]').onclick = async () => {
            cancelled = true; status('Cancelando; aguarde a etapa atual terminar.');
            if (native) rpc(window, 'superproc:saneador-host', 'superproc:saneador-host-result', { request: { cancel: true } }).catch(() => {});
            else chrome.runtime.sendMessage({ type: 'superproc:cancel' }).catch(() => {});
        };
        panel.querySelector('[data-run]').onclick = async () => {
            if (busy) return;
            job = await get(jobKey);
            if (job?.phase === 'creating' || (job?.editorUrl && job.phase !== 'done')) { status('Confira a minuta anterior: o cadastro já foi enviado. Use a resposta preservada; não será criada uma duplicata.'); return; }
            busy = true; cancelled = false;
            panel.querySelector('[data-run]').disabled = true; panel.querySelector('[data-config]').disabled = true; panel.querySelector('[data-cancel]').hidden = false;
            const checkpoint = async phase => { job.phase = phase; job.updatedAt = Date.now(); await set(jobKey, job); };
            const checkCancel = () => { if (cancelled) throw new Error('Saneamento cancelado.'); };
            try {
                await context();
                let capa = await get(contextKey);
                if (!capa?.pref || capa.preference !== config.preference) {
                    const link = [...document.querySelectorAll('a[href]')].map(a => urlFrom(a.href, location.href, 'processo_selecionar')).find(Boolean);
                    if (link) { const html = await eprocText(link); const doc = new DOMParser().parseFromString(html, 'text/html'); capa = { url: link, pref: preference(doc, link, config.preference) }; }
                }
                if (!capa?.pref) throw new Error('Abra a capa deste processo uma vez para localizar a preferência 5. Saneador.');
                let docs = tree ? await collect() : (await get(selectionKey))?.documents;
                if (!docs?.length) throw new Error('Marque os documentos na árvore com o Automarcar e depois execute o Saneador.');
                if (docs.some(d => !d.url)) throw new Error('Há documento marcado sem endereço disponível. Execute o Saneador diretamente na árvore.');
                job = { id: crypto.randomUUID(), process, phase: 'collecting', agent: config.agent, documents: docs.map(d => ({ id: d.id, name: d.name })), startedAt: Date.now() }; await checkpoint('collecting');
                const files = [];
                for (let i = 0; i < docs.length; i++) { checkCancel(); status(`Obtendo documento ${i + 1} de ${docs.length}…`); files.push(await fetchDocument(docs[i], i)); }
                if (files.reduce((sum, f) => sum + f.data.length, 0) > 90 * 1024 * 1024) throw new Error('A seleção excede 90 MB codificados. Reduza os documentos.');
                checkCancel(); native = await nativeHostAvailable(); await checkpoint('copilot');
                status(`Aguardando ${config.agent} no Copilot…`);
                job.answer = await copilot({ files, agent: config.agent, process, prompt: `Processo: ${process}.\n${config.prompt}` }, native);
                await checkpoint('answered'); panel.querySelector('[data-copy]').hidden = false; checkCancel();
                status(`Criando minuta pela preferência ${config.preference}…`);
                job.editorUrl = await createDraft(capa.pref, () => checkpoint('creating')); await checkpoint('created');
                panel.querySelector('[data-editor]').href = job.editorUrl; panel.querySelector('[data-editor]').hidden = false;
                checkCancel(); status('Salvando e conferindo o conteúdo da minuta…');
                await saveDraft(job.editorUrl, job.answer); await checkpoint('done');
                status('Concluído: minuta salva e conferida. Pronta para sua revisão.');
                window.open(job.editorUrl, '_blank', 'noopener');
            } catch (error) {
                if (job) { job.error = error.message; await set(jobKey, job); }
                status(error.message);
            } finally { busy = false; panel.querySelector('[data-run]').disabled = false; panel.querySelector('[data-config]').disabled = false; panel.querySelector('[data-cancel]').hidden = true; }
        };
    }
};
