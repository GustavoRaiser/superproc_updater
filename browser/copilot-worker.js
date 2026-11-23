/* SuperPROC: transporte DOM do M365 Copilot. Independente de EPRYX e de chave API. */
(() => {
    if (window.SuperprocCopilot) return;
    const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const wait = async (fn, ms, message) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { if (window.__spCopilotCancelled) throw new Error('Saneamento cancelado.'); const result = fn(); if (result) return result; await sleep(300); }
        throw new Error(message);
    };
    const editor = () => [...document.querySelectorAll('#m365-chat-editor-target-element, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea')].find(visible);
    const progress = (phase, text) => { window.__spCopilotProgress = { phase, text, at: Date.now() }; };
    const caption = el => norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText);
    function insert(text, clear = false) {
        if (window.__spCopilotCancelled) throw new Error('Interrompido pelo usuário.');
        const el = editor();
        if (!el) throw new Error('Editor do Copilot não encontrado.');
        el.focus();
        if (clear) {
            if (el.tagName === 'TEXTAREA') { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); }
            else { el.replaceChildren(); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); }
        }
        if (el.tagName === 'TEXTAREA') {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, el.value + text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
            // insertText conserva tokens/chips da menção que o framework já registrou. Um \n dentro dele é descartado pelo editor
            // (parágrafos colavam: "aprotesto"); por isso cada linha vai separada por insertLineBreak (Shift+Enter, não envia).
            const linhas = String(text).split('\n');
            const inseriu = linhas.every((linha, i) => (i === 0 || document.execCommand('insertLineBreak')) && (!linha || document.execCommand('insertText', false, linha)));
            if (!inseriu) {
                const dt = new DataTransfer(); dt.setData('text/plain', text);
                el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            }
            // execCommand/paste já produz o evento usado pelo editor. Repeti-lo
            // pode fazer o modelo interno inserir o mesmo texto uma segunda vez.
        }
        return el;
    }
    async function selectAgent(name, mention) {
        progress('agente', `Selecionando ${name}…`);
        const query = '@' + (mention || norm(name.split(/[-–—]/).at(-1))).replace(/^@/, '');
        // O host digita, dá tempo ao autocomplete e envia quatro Tabs + Enter.
        await nativeInput('mention', query);
        await sleep(1200);
        progress('agente_inputs', `Inputs de seleção executados para ${name}. Preparando o anexo…`);
    }
    async function nativeInput(action, text = '') {
        const id = 'input-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        window.__spCopilotInput = { id, action, text };
        const result = await wait(() => window.__spCopilotInputResult?.id === id && window.__spCopilotInputResult, action === 'mention' ? 40000 : 15000, 'O navegador não confirmou o teclado do Copilot.');
        // O processo principal de versões anteriores conserva o driver em
        // require.cache, enquanto este worker é relido do disco em cada janela.
        // Essa mensagem antiga descreve apenas a falha do observador de teclas.
        if (action === 'mention' && String(result.error || '').includes('A página do Copilot não recebeu quatro Tabs e Enter')) {
            progress('teclado_compatibilidade', 'Inputs executados. Continuando com texto e PDF…');
            return;
        }
        if (action === 'send' && /Comando de entrada inválido/.test(String(result.error || ''))) {
            // O driver antigo não conhece o novo comando send. Executa a ação
            // do formulário nesta mesma janela, sem polling ou confirmação.
            const button = [...document.querySelectorAll('button')].find(b => visible(b) && /^(enviar|send)(\b|$)|enviar mensagem|send message/.test(caption(b)));
            if (!button) throw new Error('Botão de envio não encontrado na janela do Copilot.');
            button.click(); return;
        }
        if (result.error) throw new Error(result.error);
    }
    function replies() {
        const list = [...document.querySelectorAll('[data-testid="copilot-message-div"], .fai-CopilotMessage, [data-message-author-role="assistant"], [data-testid*="assistant-message"]')];
        return list.filter(el => !el.closest('[data-message-author-role="user"]') && !/user-message/i.test(el.getAttribute('data-testid') || '') && (
            el.matches('[data-message-author-role="assistant"], [data-testid*="assistant-message"]') || el.querySelector('[data-testid="CopyButtonTestId"], [aria-label*="Copiar"], [aria-label*="Copy"], .ac-textBlock, .markdown')
        ));
    }
    const id = el => el.getAttribute('data-message-id') || el.id || el;
    function read(el) {
        const body = el.querySelector('.markdown, [data-testid="copilot-message-content"], [data-testid="message-content"]') || el;
        const clone = body.cloneNode(true);
        clone.querySelectorAll('button, [role="toolbar"], .scc-ChainOfThought, [data-testid*="thinking" i]').forEach(n => n.remove());
        const walk = node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            if (node.nodeName === 'BR') return '\n';
            const text = [...node.childNodes].map(walk).join('');
            return /^(P|DIV|LI|H[1-6]|PRE|TR|SECTION)$/.test(node.nodeName) ? '\n' + text + '\n' : text;
        };
        // O Copilot antepõe um rótulo oculto ("Copilot said:" / "O Copilot disse:") que não faz parte da resposta.
        return walk(clone).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().replace(/^(?:o\s+)?copilot\s+(?:said|disse)\s*:\s*/i, '');
    }
    async function sendAndRead(prompt) {
        const before = new Map(replies().map(el => [id(el), read(el)]));
        const existingPrompt = editor();
        if (!(existingPrompt?.value || existingPrompt?.innerText || '').includes(prompt)) insert(' ' + prompt);
        await nativeInput('send');
        progress('resposta', 'Enter enviado. Aguardando o chat terminar…');
        let last = '', stableAt = Date.now();
        return wait(() => {
            const el = replies().filter(r => !before.has(id(r)) || before.get(id(r)) !== read(r)).at(-1);
            if (!el) return false;
            for (const b of el.querySelectorAll('button')) if (/mostrar mais|show more/.test(caption(b))) b.click();
            const text = read(el);
            if (text !== last) { last = text; stableAt = Date.now(); }
            const busy = el.matches('[aria-busy="true"]') || el.querySelector('[aria-busy="true"]') || [...document.querySelectorAll('button')].some(b => visible(b) && /parar.*(ger|res)|stop.*(gener|respond)/.test(caption(b)));
            if (!busy && text && Date.now() - stableAt > 3000) return text;
            return false;
        }, 600000, 'Tempo esgotado aguardando a resposta completa do agente.');
    }
    async function sendCurrentAndRead(prompt) {
        const before = new Map(replies().map(el => [id(el), read(el)]));
        const current = editor();
        if ((current?.value || current?.innerText || '').trim()) throw new Error('A conversa atual possui uma mensagem ainda não enviada. Envie ou limpe o rascunho antes de pedir a correção.');
        insert(prompt);
        const compact = t => String(t || '').replace(/\s+/g, ' ').trim();
        const verify = () => { const el = editor(); const txt = compact(el && (el.value ?? el.innerText)); const p = compact(prompt); return { cabeca: txt.includes(p.slice(0, 40)), cauda: txt.includes(p.slice(-40)), tamanho: txt.length, esperado: p.length }; };
        let conferido = verify();
        if (!(conferido.cabeca && conferido.cauda)) { await sleep(300); conferido = verify(); }
        if (!(conferido.cabeca && conferido.cauda)) { insert(prompt, true); await sleep(400); conferido = verify(); }
        window.__spCopilotLastInsert = conferido; // metadados apenas (sem texto)
        if (!conferido.cabeca && !conferido.cauda) throw new Error('O texto não chegou à caixa do Copilot; nada foi enviado.');
        const forms = new Set([current?.closest('form'), current?.parentElement?.closest('form')].filter(Boolean));
        const ativos = () => [...document.querySelectorAll('button, [role="button"]')].filter(b => visible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
        const porNome = () => { const l = ativos(); return l.find(b => /^(enviar|send)(\b|$)|enviar mensagem|send message/.test(caption(b))) ||
            l.find(b => /send|submit/i.test([b.getAttribute('data-testid'), b.getAttribute('data-test-id'), b.getAttribute('name')].filter(Boolean).join(' '))) ||
            l.find(b => b.tagName === 'BUTTON' && b.getAttribute('type') === 'submit'); };
        // O botão fica desabilitado enquanto o anexo carrega: espera em vez de falhar na hora.
        let button = null;
        try { button = await wait(porNome, 20000, 'sem botão Enviar'); } catch (e) { if (window.__spCopilotCancelled) throw e; }
        if (!button) button = ativos().find(b => [...forms].some(form => form.contains(b)));
        if (!button) throw new Error('Botão Enviar do Copilot não ficou disponível (anexo ainda carregando?). O texto permaneceu na caixa.');
        button.click();
        progress('resposta', 'Pergunta enviada. Aguardando o chat terminar…');
        let last = '', stableAt = Date.now();
        return wait(() => {
            const el = replies().filter(r => !before.has(id(r)) || before.get(id(r)) !== read(r)).at(-1);
            if (!el) return false;
            const text = read(el);
            if (text !== last) { last = text; stableAt = Date.now(); }
            const busy = el.matches('[aria-busy="true"]') || el.querySelector('[aria-busy="true"]') || [...document.querySelectorAll('button')].some(b => visible(b) && /parar.*(ger|res)|stop.*(gener|respond)/.test(caption(b)));
            return !busy && text && Date.now() - stableAt > 1200 ? text : false;
        }, 600000, 'Tempo esgotado aguardando a correção do Copilot.');
    }
    async function runCurrent(prompt) {
        if (window.__spCopilotRunning) throw new Error('O Copilot já está processando outra solicitação.');
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 120000) throw new Error('Trecho para correção inválido ou grande demais.');
        window.__spCopilotRunning = true; window.__spCopilotCancelled = false;
        try {
            await wait(editor, 30000, 'Abra uma conversa do Copilot antes de pedir a correção.');
            const text = await sendCurrentAndRead(prompt);
            if (!text || text.length < 2) throw new Error('O Copilot não devolveu uma correção utilizável.');
            progress('concluido', 'Correção recebida. Revise antes de substituir a seleção.');
            return { text, conversationUrl: location.href };
        } finally { window.__spCopilotRunning = false; }
    }
    function compatibleInput(file) {
        return [...document.querySelectorAll('input[type="file"]')].map(input => {
            const tokens = input.accept.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
            const extension = '.' + file.name.split('.').at(-1).toLowerCase();
            let score = !tokens.length ? 5 : tokens.some(t => t === file.type || t === extension || t === '*/*') ? 10 : tokens.includes(file.type.split('/')[0] + '/*') ? 9 : 0;
            if (input.disabled || tokens.every(t => t.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(t)) && tokens.length) score = -1;
            return { input, score };
        }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score)[0]?.input;
    }
    function attachment(fileName) {
        const containers = [...document.querySelectorAll('[aria-label]')].filter(el => /^(anexos|attachments)$/.test(norm(el.getAttribute('aria-label'))) && !el.closest('[data-message-author-role]'));
        const scoped = containers.length ? containers.flatMap(el => [...el.querySelectorAll('[aria-label], [title], button')]) : [...document.querySelectorAll('[data-testid*="attachment" i], [class*="Attachment"]')];
        return scoped.find(el => visible(el) && norm([el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].join(' ')).includes(norm(fileName)));
    }
    async function confirmAttachment(fileName, timeout) {
        await wait(() => {
            const chip = attachment(fileName); if (!chip) return false;
            const text = norm(chip.textContent);
            if (/falha|erro|failed|error|bloqueado|blocked/.test(text)) throw new Error(`Falha no upload de ${fileName}.`);
            const percentage = text.match(/(\d{1,3})\s*%/);
            const busy = chip.getAttribute('aria-busy') === 'true' || chip.querySelector('[aria-busy="true"], [role="progressbar"], [class*="Spinner"], [class*="Progress"]') || /carregando|enviando|uploading|loading|processando|preparando/.test(text) || percentage && Number(percentage[1]) < 100;
            return !busy;
        }, timeout, `O upload de ${fileName} não foi confirmado no Copilot.`);
        await sleep(800);
    }
    // Confirmação usada pelo host antes de enviar a mensagem: acha o chip do anexo pelo INÍCIO do nome (a interface trunca o nome)
    // fora das mensagens da conversa e espera ele terminar de carregar. Não lança: devolve true/false.
    function chipPorPrefixo(prefixo) {
        const p = norm(prefixo); if (!p) return null;
        const doAnexos = attachment(prefixo);
        if (doAnexos) return doAnexos;
        const ed = editor();
        return [...document.querySelectorAll('[aria-label], [title], button, div, span, a')].find(el => visible(el) && el !== ed && !(ed && el.contains(ed))
            && !el.closest('[data-message-author-role], .fai-UserMessage, .fai-CopilotMessage')
            && (el.textContent || '').length < 300 && norm([el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].join(' ')).includes(p)) || null;
    }
    async function confirmarAnexo(prefixo, timeout = 90000) {
        const fim = Date.now() + timeout;
        while (Date.now() < fim) {
            if (window.__spCopilotCancelled) return false;
            const chip = chipPorPrefixo(prefixo);
            if (chip) {
                const raiz = chip.closest('[aria-label], [class*="ttachment"]') || chip;
                const texto = norm(raiz.textContent);
                const pct = texto.match(/(\d{1,3})\s*%/);
                const ocupado = raiz.getAttribute('aria-busy') === 'true' || raiz.querySelector('[aria-busy="true"], [role="progressbar"], [class*="Spinner"], [class*="Progress"]') || /falha|erro|failed|error/.test(texto) === false && (/carregando|enviando|uploading|loading|processando|preparando/.test(texto) || (pct && Number(pct[1]) < 100));
                if (!ocupado) { await sleep(800); return true; }
            }
            await sleep(300);
        }
        return false;
    }
    async function upload(file, timeout = 45000, opcoes = {}) {
        if (window.__spCopilotCancelled) throw new Error('Interrompido pelo usuário.');
        progress('anexo', `Anexando ${file.name} em memória…`);
        const bytes = file.memoryId ? window.__spNativePdfFiles?.[file.memoryId] : Uint8Array.from(atob(file.data.split(',')[1]), c => c.charCodeAt(0));
        if (!bytes || bytes.byteLength > 64 * 1024 * 1024) throw new Error('Anexo em memória indisponível ou acima do limite.');
        const memoryFile = new File([new Blob([bytes], { type: file.type })], file.name, { type: file.type });
        if(file.memoryId)delete window.__spNativePdfFiles[file.memoryId];
        if (timeout === null) {
            const dt = new DataTransfer(); dt.items.add(memoryFile);
            let input = compatibleInput(file);
            // Conversa nova (1ª mensagem): a página ainda não tem o input de arquivo; ele só nasce ao abrir o menu "+".
            if (!input) {
                const add = [...document.querySelectorAll('button')].find(b => visible(b) && !b.disabled && /anexar|attach|adicionar|add|mais|more|upload|carregar/.test(caption(b)) && !/enviar|send|microfone|voice|mic/.test(caption(b)));
                if (add) {
                    add.click(); await sleep(900);
                    input = compatibleInput(file);
                    if (!input) {
                        const device = [...document.querySelectorAll('[role="menuitem"], button, li')].find(el => visible(el) && /deste dispositivo|do dispositivo|from this device|my computer|carregar arquivo|upload file|carregar do|upload from/.test(caption(el)));
                        if (device) { device.click(); await sleep(900); input = compatibleInput(file); }
                    }
                }
            }
            if (input) { input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
            else {
                const zone = editor();
                if (!zone) throw new Error('Área do chat não encontrada para anexo.');
                zone.focus();
                zone.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
            }
            // Intervalo fixo para o serviço receber o arquivo, sem confirmar chip (o envio do PDF pelo F4 dispensa: opcoes.semEspera).
            if (!(opcoes && opcoes.semEspera)) await sleep(5000);
            return;
        }
        let lastError;
        for (const strategy of ['input', 'drop', 'paste']) {
            if (attachment(file.name)) { await confirmAttachment(file.name, 120000); return; }
            try {
                const dt = new DataTransfer(); dt.items.add(memoryFile);
                let input = strategy === 'input' && compatibleInput(file);
                if (strategy === 'input' && !input) {
                    const add = [...document.querySelectorAll('button')].find(b => visible(b) && !b.disabled && /anexar|attach|adicionar|add/.test(caption(b)));
                    if (add) {
                        add.click(); await sleep(900);
                        const device = [...document.querySelectorAll('[role="menuitem"], button, li')].find(el => visible(el) && /deste dispositivo|do dispositivo|from this device|my computer|carregar arquivo|upload file|carregar do|upload from/.test(caption(el)));
                        if (device) { device.click(); await sleep(900); }
                        input = compatibleInput(file);
                    }
                }
                if (input) { input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
                else {
                    const zone = editor() || document.querySelector('[data-test-id="chat-input-wrapper"]');
                    if (!zone) throw new Error('Área do chat não encontrada para anexo.');
                    if (strategy === 'paste') {
                        zone.focus();
                        zone.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
                    } else for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
                }
                await confirmAttachment(file.name, timeout);
                progress('anexo_pronto', 'PDF confirmado e upload concluído no compositor do agente.');
                return;
            } catch (error) {
                lastError = error;
                if (attachment(file.name)) throw error; // não duplica um upload ainda em curso ou com erro.
                await sleep(1000);
            }
        }
        throw lastError;
    }
    async function freshConversation() {
        progress('conversa', 'Iniciando conversa nova para este processo…');
        const fresh = [...document.querySelectorAll('button, a, [role="button"]')].find(el => visible(el) && /nova conversa|novo chat|new chat|new conversation|iniciar.*conversa/.test(caption(el)));
        if (fresh) { fresh.click(); await sleep(900); await wait(editor, 20000, 'O editor da nova conversa não carregou.'); }
        progress('conversa_pronta', 'Nova conversa solicitada.');
    }
    async function run(payload) {
        if (window.__spCopilotRunning) throw new Error('Esta janela já está processando um saneamento.');
        window.__spCopilotRunning = true; window.__spCopilotCancelled = false;
        try {
            await wait(editor, 120000, 'Entre no Microsoft 365 Copilot na janela aberta e tente novamente.');
            await freshConversation();
            let response = '';
            for (let i = 0; i < payload.files.length; i += 3) {
                await selectAgent(payload.agent, payload.mention);
                insert(payload.prompt);

                progress('comando_pronto', 'Comando escrito. Tentando anexar o PDF em memória…');
                const batch = payload.files.slice(i, i + 3);
                for (const file of batch) await upload(file, null);
                const final = i + 3 >= payload.files.length;
                response = await sendAndRead(final ? payload.prompt : `Receba estes documentos do processo ${payload.process}. Ainda enviarei outros na mesma conversa. Aguarde a solicitação final de saneamento e apenas confirme o recebimento.`);
            }
            if (!response || response.length < 80) throw new Error('O agente não devolveu conteúdo suficiente para a minuta.');
            progress('concluido', 'Resposta completa recebida.');
            return { text: response, conversationUrl: location.href, agent: payload.agent, process: payload.process, fileName: payload.files[0].name };
        } finally { window.__spCopilotRunning = false; }
    }
    window.SuperprocCopilot = { run, runCurrent, cancel: () => { window.__spCopilotCancelled = true; }, selectAgent, read, replies, freshConversation, upload, confirmar: confirmarAnexo };
})();
