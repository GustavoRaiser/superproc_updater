// Etapa 4: formulário e salvamento nativos. Nunca assina ou destrava minuta.
const crypto = require('node:crypto');
const { begin } = require('./saneador-interrupt');
const jobs = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms, message) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await pause(300); }
    throw new Error(message);
}
async function preference(sender, process, preferenceName = '5. Saneador') {
    const link = await sender.mainFrame.executeJavaScript(`(() => {
        const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ').trim();
        const links = [...document.querySelectorAll('a, button')].filter(el => norm(el.textContent) === norm(${JSON.stringify(preferenceName)}));
        const urls = links.flatMap(el => {
            const raw = (el.getAttribute('href') || '') + ' ' + (el.getAttribute('onclick') || '');
            return (raw.replace(/&amp;/g, '&').match(/(?:https?:\\/\\/[^\\s'"<>]+|(?:\\.\\.\\/|\\.\\/)?controlador\\.php\\?[^\\s'"<>]+)/gi) || []).map(v => { try { return new URL(v, location.href).href; } catch { return ''; } });
        }).filter(v => { try { return new URL(v).searchParams.get('acao') === 'minuta_cadastrar'; } catch { return false; } });
        return [...new Set(urls)];
    })()`, true);
    if (link.length !== 1) throw new Error(`Não encontrei um link único da preferência ${preferenceName} na capa.`);
    const url = new URL(link[0]);
    if (url.origin !== new URL(sender.getURL()).origin || url.searchParams.get('num_processo') !== process ||
        (url.searchParams.has('txtNumProcesso') && url.searchParams.get('txtNumProcesso') !== process) || !url.searchParams.get('hash')) throw new Error('O link da preferência não corresponde ao processo atual.');
    return url.href;
}
function rendererEditor() {
    const excluded = ['endereco', 'identificacao_processo', 'partes', 'titulo', 'assinaturas', 'notas', 'splited', 'secao_separadora'];
    const all = Object.values(window.CKEDITOR?.instances || {}).filter(e => e.status === 'ready' && !e.readOnly && e.editable?.());
    const body = all.filter(e => {
        const el = e.element?.$ || e.editable().$;
        return !excluded.includes(el?.getAttribute('data-nome')) && !/^(HEADER|FOOTER)$/.test(el?.tagName || '');
    });
    if (body.length !== 1) return null;
    return body[0];
}
function rendererReplace(text) {
    const editor = window.__spMinutaEditor();
    if (!editor) throw new Error('Corpo da minuta ainda não está pronto.');
    const escape = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let content = String(text).trim().replace(/^```(?:html|markdown)?\s*\n/i, '').replace(/\n```\s*$/, '');
    // O leitor pode incluir o nome do agente antes do corpo da resposta.
    // Remove apenas o prefixo: referências processuais no restante ficam intactas.
    content = content.replace(/^(?:(?:TR[O0]03C\s*[-–—]\s*Saneador(?:\s+said:)?|Saneador)\s*\n\s*)+/i, '');
    content = content.replace(/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\s*(?:\n|$)\s*/, '');
    let html;
    if (/<(?:p|div|h[1-6]|table|ul|ol|section)\b/i.test(content)) {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,svg,math').forEach(el => el.remove());
        for (const el of doc.body.querySelectorAll('*')) for (const attr of [...el.attributes]) {
            if (/^on/i.test(attr.name) || ['src','srcdoc','href','style','id','class'].includes(attr.name)) el.removeAttribute(attr.name);
        }
        html = doc.body.innerHTML;
    } else html = content.split(/\n\s*\n/).map(p => '<p>' + escape(p).replace(/\n/g, '<br>') + '</p>').join('');
    // setData substitui todo o corpo: não concatena com o texto do modelo.
    return new Promise(resolve => {
        editor.focus(); editor.fire('saveSnapshot');
        editor.setData(html, () => { editor.fire('change'); editor.updateElement?.(); editor.fire('saveSnapshot'); resolve(true); });
    });
}
async function run(job, api, emit, timeout = 120000) {
    const check = () => job.check?.();
    const poll = (fn, ...args) => until(async () => { check(); const value = await fn(); check(); return value; }, ...args);
    check();
    const contents = () => api.contents(job.id).filter(wc => !wc.isDestroyed());
    const frames = () => contents().flatMap(wc => wc.mainFrame.framesInSubtree);
    const report = (phase, text) => { job.phase = phase; emit({ phase, text, jobId: job.id, editorUrl: job.editorUrl }); };
    if (job.phase === 'done') return job.result;
    if (!job.opened) {
        report('cadastro', `Abrindo cadastro pela preferência ${job.preference || '5. Saneador'}…`);
        check();
        api.open(job); job.opened = true;
    }
    if (!job.posted) {
        const formFrame = await poll(async () => {
            for (const frame of frames()) {
                if (await frame.executeJavaScript(`!!document.querySelector('button[name="sbmCadastrarEditarMinuta"]')`).catch(() => false)) return frame;
            }
        }, timeout, 'O cadastro não carregou o botão Salvar e Editar.');
        // Checkpoint antes do clique, mesmo se a navegação impedir o retorno JS.
        job.posted = true; report('cadastro_enviado', 'Acionando Salvar e Editar. Cadastro registrado para evitar duplicação…');
        check();
        await formFrame.executeJavaScript(`document.querySelector('button[name="sbmCadastrarEditarMinuta"]').click(); true`, true).catch(() => {});
    }
    const editorFrame = await poll(async () => {
        for (const frame of frames()) {
            const ready = await frame.executeJavaScript(`window.__spMinutaEditor = ${rendererEditor.toString()}; !!window.__spMinutaEditor()`).catch(() => false);
            if (ready) return frame;
        }
    }, timeout, 'O CKEditor da minuta não carregou um corpo editável único. O cadastro não será repetido.');
    job.editorUrl = editorFrame.url;
    report('conteudo', 'Limpando o corpo da minuta e inserindo a resposta do agente…');
    check();
    await editorFrame.executeJavaScript(`(${rendererReplace.toString()})(${JSON.stringify(job.text)})`, true);
    // O botão é localizado pela classe funcional; cke_269 muda entre sessões.
    await poll(() => editorFrame.executeJavaScript(`!!document.querySelector('.cke_button__salvarminuta:not(.cke_button_disabled):not([aria-disabled="true"])')`).catch(() => false), timeout, 'O botão Salvar Minuta não ficou disponível.');
    report('salvando', 'Acionando Salvar Minuta e aguardando o salvamento nativo…');
    check();
    await editorFrame.executeJavaScript(`document.querySelector('.cke_button__salvarminuta:not(.cke_button_disabled):not([aria-disabled="true"])').click(); true`, true);
    await pause(1200);
    await poll(() => editorFrame.executeJavaScript(`(() => { const e = window.__spMinutaEditor(); return !!e && typeof e.checkDirty === 'function' && !e.checkDirty() && !window.globalOperacaoSalvamentoEmCurso; })()`).catch(() => false), timeout, 'O eProc não concluiu o salvamento. A aba permanece aberta e o próximo processo não será iniciado.');
    job.result = { process: job.process, jobId: job.id, editorUrl: job.editorUrl, characters: job.text.length, savedAt: Date.now(), closed: true };
    // destroy da subaba, sem botão Sair, beforeunload ou endpoint de desbloqueio.
    api.close(job.id);
    report('done', 'Minuta salva. Aba fechada para preservar o bloqueio de revisão.');
    return job.result;
}
function install(ipcMain, api) {
    ipcMain.handle('superproc:saneador-minuta', async (event, request) => {
        let job, interruption;
        try {
            const url = new URL(event.sender.getURL());
            if (event.senderFrame !== event.sender.mainFrame || !url.hostname.endsWith('.jus.br') || url.searchParams.get('acao') !== 'processo_selecionar' || url.searchParams.get('num_processo') !== request?.process || !/^\d{20}$/.test(request.process) || !api.owns(event.sender)) throw new Error('Capa solicitante inválida para criar minuta.');
            if (typeof request.text !== 'string' || request.text.length < 80 || request.text.length > 2000000 || !/^[\w-]{1,80}$/.test(request.jobId || '')) throw new Error('Resposta ou identificação da tarefa de minuta inválida.');
            job = jobs.get(request.jobId);
            const config = require('./automation-options').automationOptions(request.config);
            const digest = crypto.createHash('sha256').update(request.text + '\n' + config.preference).digest('hex');
            if (job && (job.senderId !== event.sender.id || job.process !== request.process || job.digest !== digest)) throw new Error('A tarefa de minuta pertence a outro contexto.');
            if (!job) {
                if (request.resume) throw new Error('O navegador foi reiniciado. Confira a minuta já cadastrada antes de repetir; o cadastro não será enviado novamente.');
                job = { id: request.jobId, senderId: event.sender.id, sender: event.sender, process: request.process, text: request.text, digest, url: await preference(event.sender, request.process, config.preference), preference: config.preference };
                jobs.set(job.id, job);
            }
            if (job.running) throw new Error('Esta minuta já está sendo lançada.');
            job.running = true;
            interruption = begin(event.sender.id, request.process); job.check = interruption.check;
            return await run(job, api, data => { if (!event.sender.isDestroyed()) event.sender.send('superproc:saneador-minuta-progress', { id: request.id, ...data }); });
        } catch (error) { return { error: error?.message || String(error), started: !!job, jobId: job?.id, phase: job?.phase, editorUrl: job?.editorUrl }; }
        finally { if (job) job.running = false; interruption?.finish(); }
    });
}
module.exports = { install, run, preference, jobs };
