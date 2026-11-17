(() => {
    'use strict';
    if (window.__superprocEditorPdfMain) return;
    window.__superprocEditorPdfMain = true;

    const ownScript = document.currentScript;
    const assetUrl = (file) => new URL(`lib/${file}`, ownScript?.src || location.href).href;
    let loadingPdfMake = null;

    const scriptLoads = new Map();
    function loadScript(url, id) {
        if (scriptLoads.has(id)) return scriptLoads.get(id);
        const promise = new Promise((resolve, reject) => {
            let script = document.getElementById(id);
            if (script?.dataset.ready === 'true') return resolve();
            if (script?.dataset.failed === 'true') { script.remove(); script = null; }
            script ||= Object.assign(document.createElement('script'), { id, charset: 'UTF-8', src: url });
            const finish = error => {
                clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed);
                if (error) { script.dataset.failed = 'true'; script.remove(); reject(error); }
                else { script.dataset.ready = 'true'; resolve(); }
            };
            const loaded = () => finish(), failed = () => finish(new Error('Não foi possível carregar o gerador local.'));
            const timer = setTimeout(() => finish(new Error('Tempo de carregamento do gerador excedido.')), 15000);
            script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', failed, { once: true });
            if (!script.isConnected) (document.head || document.documentElement).appendChild(script);
        });
        scriptLoads.set(id, promise);
        promise.catch(() => { if (scriptLoads.get(id) === promise) scriptLoads.delete(id); });
        return promise;
    }
    async function ensurePdfMake() {
        if (window.pdfMake?.vfs) return;
        if (!loadingPdfMake) {
            loadingPdfMake = (async () => {
                await loadScript(assetUrl('pdfmake.min.js'), 'superproc-pdfmake');
                await loadScript(assetUrl('vfs_fonts.js'), 'superproc-pdfmake-fonts');
                if (!window.pdfMake?.vfs) throw new Error('Fontes do PDF indisponíveis.');
            })().catch(error => { loadingPdfMake = null; throw error; });
        }
        return loadingPdfMake;
    }
    let lastEditor = null;
    // Trecho selecionado no editor (iframe da minuta); null se não houver texto selecionado.
    function selectedRange(doc) {
        try {
            const sel = doc?.defaultView?.getSelection?.();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
            const range = sel.getRangeAt(0);
            if (!doc.body.contains(range.commonAncestorContainer) || !range.toString().trim()) return null;
            return range.cloneRange();
        } catch (error) { return null; }
    }
    function editorInstances() { return Object.values(window.CKEDITOR?.instances || {}).filter(e => e.status === 'ready' && e.document?.$?.body); }
    function getEditorDocument() {
        const instances = editorInstances();
        const current = instances.find(e => e.focusManager?.hasFocus) || instances.find(e => e === lastEditor);
        if (current) return current.document.$;
        if (instances.length === 1) return instances[0].document.$;
        if (instances.length > 1) {
            const withSelection = instances.filter(e => selectedRange(e.document.$));
            if (withSelection.length === 1) return withSelection[0].document.$;
            alert('Selecione a minuta desejada antes de exportar.'); return null;
        }
        const frames = [...document.querySelectorAll('iframe.cke_wysiwyg_frame')].filter(f => f.getClientRects().length);
        if (frames.length === 1) return frames[0].contentDocument;
        alert('Selecione a minuta desejada antes de exportar.'); return null;
    }
    if (window.CKEDITOR) {
        const listen = editor => editor.on('focus', () => { lastEditor = editor; });
        editorInstances().forEach(listen);
        window.CKEDITOR.on('instanceReady', event => listen(event.editor));
    }
    // Export each text-bearing run once, including text around nested blocks.
    // Equality of text is never a reason to drop a paragraph.
    // Com `range`, exporta somente o trecho selecionado (mantendo classes/estilo dos blocos); sem ele, exporta tudo.
    function exportBlocks(doc, range = null) {
        const result = [], selector = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,thead,tbody,tfoot,tr,td,th';
        function cloneStyle(source, clone) {
            const css=doc.defaultView.getComputedStyle(source);
            for(const key of ['textAlign','fontWeight','fontStyle'])clone.style[key]=css[key];
            for(let ancestor=source.parentElement;ancestor&&ancestor!==doc.body;ancestor=ancestor.parentElement)for(const name of ['citacao','citacao2','dispositivo','paragrafoComRecuo'])if(ancestor.classList.contains(name))clone.classList.add(name);
            return clone;
        }
        function selectedText(text) {
            if (!range) return text.data;
            if (!range.intersectsNode(text)) return '';
            return text.data.slice(text === range.startContainer ? range.startOffset : 0, text === range.endContainer ? range.endOffset : text.data.length);
        }
        // O clone tem a mesma estrutura do original: recorta os textos do clone conforme a seleção.
        function clip(source, clone) {
            if (!range) return clone;
            const src = [], dst = [];
            for (const [root, list] of [[source, src], [clone, dst]]) { const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (walker.nextNode()) list.push(walker.currentNode); }
            src.forEach((text, index) => { dst[index].data = selectedText(text); });
            if (source.contains(range.startContainer)) {
                const before = doc.createRange(); before.selectNodeContents(source); before.setEnd(range.startContainer, range.startOffset);
                if (before.toString().trim()) clone.setAttribute('data-sp-parcial', '1');
            }
            return clone;
        }
        function clipTable(table) {
            const clone = clip(table, table.cloneNode(true));
            if (range) clone.querySelectorAll('tr').forEach(row => { if (!row.textContent.trim()) row.remove(); });
            return clone;
        }
        function walk(parent) {
            let run = cloneStyle(parent,parent.cloneNode(false));
            const flush = () => { if (run.textContent.trim()) result.push(run); run = cloneStyle(parent,parent.cloneNode(false)); };
            for (const child of parent.childNodes) {
                if (range && !range.intersectsNode(child)) continue;
                if (child.nodeType === Node.ELEMENT_NODE && child.matches('script,style,noscript,.cke_widget_drag_handler_container,.cke_widget_drag_handler')) continue;
                if (child.nodeType === Node.ELEMENT_NODE && child.matches(selector)) {
                    flush();
                    if (child.tagName === 'TABLE') result.push(clipTable(child));
                    else if (child.querySelector(selector)) walk(child);
                    else { const block = clip(child,cloneStyle(child,child.cloneNode(true))); if (child.tagName === 'LI') block.prepend(doc.createTextNode(child.parentElement.tagName === 'OL' ? (Array.from(child.parentElement.children).indexOf(child) + 1) + '. ' : '• ')); result.push(block); }
                } else if (child.nodeType === Node.TEXT_NODE) run.appendChild(doc.createTextNode(selectedText(child)));
                else run.appendChild(clip(child,child.cloneNode(true)));
            }
            flush();
        }
        walk(doc.body); return result;
    }

    /* ==========================================================================
       GERADOR DE PDF
       ========================================================================== */

    function parseNode(node, inheritedColor) {
        const parts = [];
        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.textContent) parts.push({ text: child.textContent, ...(inheritedColor ? { color: inheritedColor } : {}) });
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;
            const tag = child.tagName.toLowerCase();
            const isDevice = child.classList.contains('dispositivo') || child.getAttribute('data-tipo_marcacao') === 'dispositivo';
            if (tag === 'br') { parts.push({ text: '\n' }); return; }
            if (/^(p|div|li|h[1-6])$/.test(tag) && parts.length) parts.push({text:'\n'});
            parseNode(child, isDevice ? '#0000FF' : inheritedColor).forEach((item) => {
                if (tag === 'strong' || tag === 'b' || child.style.fontWeight === 'bold') item.bold = true;
                if (tag === 'em' || tag === 'i' || child.style.fontStyle === 'italic') item.italics = true;
                if (tag === 'u') item.decoration = 'underline';
                parts.push(item);
            });
        });
        return parts;
    }

    /* Mantém palavras com hífen (ênclise: "mudou-se", "tem-se") em um único trecho
       sem quebra; senão o pdfMake quebra após o hífen e o texto justificado abre
       um espaço entre "mudou-" e "se". */
    function protegerHifen(parts) {
        const re = /\S*\p{L}-\p{L}\S*/gu;
        const out = [];
        parts.forEach((part) => {
            const t = part && typeof part.text === 'string' ? part.text : null;
            if (t === null || !/\p{L}-\p{L}/u.test(t)) { out.push(part); return; }
            let last = 0, m;
            re.lastIndex = 0;
            while ((m = re.exec(t))) {
                if (m.index > last) out.push({ ...part, text: t.slice(last, m.index) });
                out.push({ ...part, text: m[0], noWrap: true });
                last = m.index + m[0].length;
            }
            if (last < t.length) out.push({ ...part, text: t.slice(last) });
        });
        return out;
    }

    function filename() {
        const now = new Date();
        const date = [now.getDate(), now.getMonth() + 1, now.getFullYear()].map((v, i) => i === 2 ? v : String(v).padStart(2, '0')).join('-');
        const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join('-');
        return `MINUTA_${date}_${time}.pdf`;
    }

    async function generatePdf() {
        const editorDoc = getEditorDocument();
        if (!editorDoc?.body) { alert('Iframe da minuta n\u00E3o encontrado.'); return; }
        const range = selectedRange(editorDoc); // captura antes de qualquer espera
        try { await ensurePdfMake(); } catch (error) {
            console.error('[SuperPROC PDF]', error);
            alert(`N\u00E3o foi poss\u00EDvel preparar o gerador de PDF.\n${error.message}`);
            return;
        }
        const content = [];
        exportBlocks(editorDoc, range).forEach((el) => {
            const raw = (el.textContent || '').trim();
            if (!raw) return;
            if (el.tagName === 'TABLE') {
                const body = [...el.rows].map(row => [...row.cells].map(cell => ({ text: protegerHifen(parseNode(cell, null)), margin: [3,3,3,3] })));
                if (body.length) { const columns = Math.max(...body.map(row => row.length)); for (const row of body) while(row.length < columns) row.push(''); content.push({ table: { widths: Array(columns).fill('*'), body }, margin:[0,8,0,8] }); }
                return;
            }
            const has = (name) => el.classList.contains(name);
            const css = el.style;
            let alignment = 'justify';
            if (has('paragrafoCentralizado') || has('titulo') || css?.textAlign === 'center') alignment = 'center';
            else if (has('paragrafoDireita') || css?.textAlign === 'right') alignment = 'right';
            const margin = [0, 8, 0, 8];
            const indent = (has('paragrafoPadrao') || has('cartaPadrao')) && el.getAttribute('data-sp-parcial') !== '1';
            if (has('paragrafoComRecuo') || has('citacao') || has('cartaComRecuo')) margin[0] = 70;
            else if (has('citacao2')) { margin[0] = 85; margin[2] = 14; }
            else if (has('tabelaComRecuo')) margin[0] = 36;
            let fontSize = has('titulo') ? 16 : (has('citacao') || has('citacao2')) ? 11 : 13;
            if (has('tabela') || has('tabelaComRecuo') || has('cartaPadrao') || has('cartaComRecuo') || has('cartaSemRecuo')) fontSize = 10;
            if (has('cartaCompacta')) fontSize = 9;
            const text = protegerHifen(parseNode(el, null));
            if (indent) text.unshift({ text: '                    ', preserveLeadingSpaces: true });
            content.push({ text: text.length ? text : raw, alignment, margin, fontSize, lineHeight: 1.25, preserveLeadingSpaces: true,
                italics: has('citacao') || has('citacao2') || css?.fontStyle === 'italic',
                bold: has('titulo') || has('subtitulo') || Number.parseInt(css?.fontWeight, 10) >= 700,
                color: (has('dispositivo') || el.getAttribute('data-tipo_marcacao') === 'dispositivo') ? '#0000FF' : '#052229' });
        });
        if (!content.length) { alert(range ? 'Nenhum texto encontrado na sele\u00E7\u00E3o para gerar o PDF.' : 'Nenhum conte\u00FAdo encontrado na minuta para gerar o PDF.'); return; }
        window.pdfMake.createPdf({ pageSize: 'A4', pageMargins: [56.7, 56.7, 56.7, 56.7], content, defaultStyle: { fontSize: 13, lineHeight: 1.25 } }).download(filename());
    }

    /* ==========================================================================
       EXPORTADOR DE TEXTO COM TAGS HTML (CLIPBOARD)
       Formatação como HTML tradicional (<b>, <i>, <u>, <table>...), sem Markdown.
       ========================================================================== */

    function wrapMarkdown(text, openTag, closeTag = openTag) {
        if (!text) return '';
        const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!match || !match[2]) return text;
        const [, leading, core, trailing] = match;

        const wrappedCore = core.split('\n').map((line) => {
            const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
            if (!m || !m[2]) return line;
            return `${m[1]}${openTag}${m[2]}${closeTag}${m[3]}`;
        }).join('\n');

        return `${leading}${wrappedCore}${trailing}`;
    }

    function parseNodeMd(node) {
        let result = '';

        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent.replace(/\u00A0/g, ' ');
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;

            if (
                child.classList.contains('cke_widget_drag_handler_container') ||
                child.classList.contains('cke_widget_drag_handler') ||
                child.getAttribute('data-cke-widget-drag-handler')
            ) {
                return;
            }

            const tag = child.tagName.toLowerCase();
            if (tag === 'br') { result += '\n'; return; }
            if (tag === 'img') return;

            let inner = parseNodeMd(child);
            if (/^(p|div|li|h[1-6])$/.test(tag)) inner = '\n' + inner + '\n';
            if (!inner) return;

            const style = child.style || {};
            const isBold = tag === 'strong' || tag === 'b' || style.fontWeight === 'bold' || Number.parseInt(style.fontWeight, 10) >= 700;
            const isItalic = tag === 'em' || tag === 'i' || style.fontStyle === 'italic';
            const isUnderline = tag === 'u' || (style.textDecoration && style.textDecoration.includes('underline'));

            if (isUnderline) inner = wrapMarkdown(inner, '<u>', '</u>');
            if (isItalic) inner = wrapMarkdown(inner, '<i>', '</i>');
            if (isBold) inner = wrapMarkdown(inner, '<b>', '</b>');

            result += inner;
        });

        return result;
    }

    function getParagraphType(el) {
        if (
            el.classList.contains('dispositivo') ||
            el.getAttribute('data-tipo_marcacao') === 'dispositivo' ||
            el.querySelector('.dispositivo, [data-tipo_marcacao="dispositivo"]')
        ) {
            return 'dispositivo';
        }
        if (el.classList.contains('citacao') || el.classList.contains('citacao2')) {
            return 'citacao';
        }
        return null;
    }

    async function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('N\u00E3o foi poss\u00EDvel copiar para a \u00E1rea de transfer\u00EAncia.');
    }

    function showButtonFeedback(button) {
        const icon = button?.querySelector('.cke_button_icon');
        if (!icon) return;
        const originalText = icon.textContent;
        const originalColor = icon.style.color;

        icon.textContent = 'OK!';
        icon.style.color = '#198754';

        setTimeout(() => {
            icon.textContent = originalText;
            icon.style.color = originalColor;
        }, 2000);
    }

    async function generateMd(button, copy = true) {
        const editorDoc = getEditorDocument();
        if (!editorDoc?.body) { alert('Iframe da minuta n\u00E3o encontrado.'); return; }
        const range = selectedRange(editorDoc);

        const outputBlocks = [];
        let activeBlockType = null;

        const BLOCK_TAGS = {
            citacao: {
                open: '<citação>',
                close: '</citação>'
            },
            dispositivo: {
                open: '<dispositivo>',
                close: '</dispositivo>'
            }
        };

        exportBlocks(editorDoc, range).forEach((el) => {

            const raw = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
            if (!raw) return;

            if (el.tagName === 'TABLE') {
                if (activeBlockType) { outputBlocks.push(BLOCK_TAGS[activeBlockType].close); activeBlockType = null; }
                const span = cell => (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
                const rows = [...el.rows].map(row => '<tr>' + [...row.cells].map(cell => { const t = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td'; return `<${t}${span(cell)}>` + parseNodeMd(cell).split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('<br>') + `</${t}>`; }).join('') + '</tr>');
                if (rows.length) outputBlocks.push('<table>', ...rows, '</table>');
                return;
            }
            const currentType = getParagraphType(el);
            const formattedText = parseNodeMd(el)
                .split('\n')
                .map((line) => line.replace(/[ \t]+/g, ' ').trim())
                .filter(Boolean)
                .join('\n');

            if (!formattedText) return;

            if (currentType !== activeBlockType) {
                if (activeBlockType) outputBlocks.push(BLOCK_TAGS[activeBlockType].close);
                if (currentType) outputBlocks.push(BLOCK_TAGS[currentType].open);
                activeBlockType = currentType;
            }

            outputBlocks.push(`<p>${formattedText}</p>`);
        });

        if (activeBlockType) {
            outputBlocks.push(BLOCK_TAGS[activeBlockType].close);
        }

        if (!outputBlocks.length) { alert(range ? 'Nenhum texto encontrado na sele\u00E7\u00E3o para copiar.' : 'Nenhum conte\u00FAdo encontrado na minuta para copiar.'); return; }

        const output = outputBlocks.join('\n');
        if (!copy) return output;
        try {
            // Usa '\n' simples para manter todas as linhas coladas sem linhas em branco
            await copyToClipboard(output);
            showButtonFeedback(button);
            return output;
        } catch (error) {
            console.error('[SuperPROC MD]', error);
            alert(`N\u00E3o foi poss\u00EDvel copiar o texto com tags HTML.\n${error.message}`);
        }
    }
    /* ==========================================================================
       INJEÇÃO DOS BOTÕES NA BARRA DO CKEDITOR
       ========================================================================== */

    function editorForDocument(doc) { return editorInstances().find(editor => editor.document?.$ === doc) || null; }
    function askCopilot(text) {
        const id = `editor-copilot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return new Promise((resolve, reject) => {
            const finish = () => { clearTimeout(timeout); window.removeEventListener('message', receive); };
            const timeout = setTimeout(() => { finish(); reject(new Error('O Copilot não respondeu a tempo. Confira a conversa aberta.')); }, 620000);
            const receive = event => {
                if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'superproc:editor-copilot-result' || event.data.id !== id) return;
                finish();
                if (event.data.result?.error) reject(new Error(event.data.result.error));
                else if (!String(event.data.result?.text || '').trim()) reject(new Error('O Copilot não devolveu texto para revisão.'));
                else resolve(String(event.data.result.text));
            };
            window.addEventListener('message', receive);
            window.postMessage({ type: 'superproc:editor-copilot', id, text }, location.origin);
        });
    }
    function showCorrectionReview({ original, corrected, editor, range }) {
        document.getElementById('az-copilot-correction-review')?.remove();
        const cover = document.createElement('div'); cover.id = 'az-copilot-correction-review'; cover.setAttribute('role', 'dialog'); cover.setAttribute('aria-modal', 'true');
        Object.assign(cover.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: 'rgba(0,0,0,.38)', display: 'grid', placeItems: 'center', fontFamily: 'Arial,sans-serif' });
        const card = document.createElement('section'); Object.assign(card.style, { width: 'min(900px,92vw)', maxHeight: '84vh', overflow: 'auto', background: '#fff', borderRadius: '7px', boxShadow: '0 12px 38px rgba(0,0,0,.35)', padding: '18px' });
        const title = document.createElement('h2'); title.textContent = 'Sugestão de correção do Copilot'; Object.assign(title.style, { margin: '0 0 12px', fontSize: '17px' }); card.append(title);
        const field = (label, value, editable) => { const wrap = document.createElement('label'); wrap.textContent = label; Object.assign(wrap.style, { display: 'block', fontWeight: '700', marginTop: '10px', fontSize: '12px' }); const area = document.createElement('textarea'); area.value = value; area.readOnly = !editable; Object.assign(area.style, { display: 'block', boxSizing: 'border-box', width: '100%', minHeight: '130px', marginTop: '4px', padding: '8px', font: '13px/1.4 Consolas,monospace', resize: 'vertical', background: editable ? '#fff' : '#f4f6f8' }); wrap.append(area); card.append(wrap); return area; };
        field('Trecho original', original, false); const revised = field('Texto sugerido — revise ou edite antes de aplicar', corrected, true);
        const actions = document.createElement('div'); Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' });
        const button = (label, action) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.onclick = action; Object.assign(el.style, { padding: '7px 12px', cursor: 'pointer' }); actions.append(el); return el; };
        button('Cancelar', () => cover.remove());
        button('Copiar', async () => { try { await copyToClipboard(revised.value); } catch (error) { alert(error.message); } });
        const correctionHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/&lt;(\/?)(b|i|u|p)&gt;/gi, '<$1$2>')
            .replace(/&lt;citação&gt;/gi, '<span class="citacao">').replace(/&lt;\/citação&gt;/gi, '</span>')
            .replace(/&lt;dispositivo&gt;/gi, '<span class="dispositivo">').replace(/&lt;\/dispositivo&gt;/gi, '</span>')
            .replace(/\r?\n/g, '<br>');
        const apply = button('Substituir seleção', () => { if (!editor || !range?.startContainer?.isConnected) { alert('A seleção original não está mais disponível. Copie a sugestão e aplique-a manualmente.'); return; } editor.fire?.('saveSnapshot'); range.select(); editor.insertHtml(correctionHtml(revised.value)); editor.fire?.('saveSnapshot'); cover.remove(); });
        Object.assign(apply.style, { background: '#0b6e4f', color: '#fff', border: '1px solid #075238', borderRadius: '3px' });
        card.append(actions); cover.append(card); document.body.append(cover); revised.focus();
    }
    async function correctSelection(button) {
        const editorDoc = getEditorDocument(); if (!editorDoc?.body) return;
        const selected = selectedRange(editorDoc); const range = selected || editorDoc.createRange();
        if (!selected) range.selectNodeContents(editorDoc.body);
        const original = range.toString().replace(/\u00a0/g, ' ').trim();
        if (!original) { alert('A minuta não possui texto para corrigir.'); return; }
        const text = await generateMd(null, false);
        if (text.length > 100000) { alert('O texto excede o limite de 100.000 caracteres. Selecione um trecho menor.'); return; }
        const label = button.querySelector('.cke_button_label'), previous = label?.textContent;
        button.classList.add('cke_button_on'); if (label) label.textContent = 'Aguardando…'; button.setAttribute('aria-busy', 'true');
        try { const corrected = await askCopilot(`Corrija erros de português grosseiros:\n${text}`); showCorrectionReview({ original, corrected, editor: editorForDocument(editorDoc), range: range.cloneRange() }); }
        catch (error) { console.error('[SuperPROC Copilot]', error); alert(`Não foi possível obter a correção.\n${error.message}`); }
        finally { button.classList.remove('cke_button_on'); button.removeAttribute('aria-busy'); if (label) label.textContent = previous; }
    }
    function injectButton() {
        const reference = document.querySelector('.cke_button__imprimir');
        if (!reference) return;

        let pdfBtn = document.getElementById('az-btn-gerar-pdf-custom');
        if (!pdfBtn) {
            pdfBtn = document.createElement('a');
            pdfBtn.id = 'az-btn-gerar-pdf-custom';
            pdfBtn.className = 'cke_button cke_button_off';
            pdfBtn.href = 'javascript:void(0)';
            pdfBtn.setAttribute('role', 'button');
            pdfBtn.title = 'Baixar Minuta em PDF (somente o trecho selecionado, se houver)';
            pdfBtn.innerHTML = '<span class="cke_button_icon" style="background:none;display:inline-block;width:auto;padding:0 2px;font-weight:950;font-size:10px;color:#dc3545;text-align:center;line-height:16px">PDF</span><span class="cke_button_label">Baixar PDF</span>';
            pdfBtn.addEventListener('click', (event) => { event.preventDefault(); generatePdf(); });
            reference.parentNode.insertBefore(pdfBtn, reference.nextSibling);
        }

        let copilotBtn = document.getElementById('az-btn-corrigir-copilot');
        if (!copilotBtn) {
            copilotBtn = document.createElement('a');
            copilotBtn.id = 'az-btn-corrigir-copilot';
            copilotBtn.className = 'cke_button cke_button_off';
            copilotBtn.href = 'javascript:void(0)';
            copilotBtn.setAttribute('role', 'button');
            copilotBtn.title = 'Envia o trecho selecionado à conversa atual do Copilot para correção e abre a sugestão para revisão';
            copilotBtn.innerHTML = '<span class="cke_button_icon" style="background:none;display:inline-block;width:auto;padding:0 2px;font-weight:950;font-size:10px;color:#0b6e4f;text-align:center;line-height:16px">IA</span><span class="cke_button_label">Corrigir</span>';
            copilotBtn.addEventListener('click', (event) => { event.preventDefault(); correctSelection(copilotBtn); });
            pdfBtn.parentNode.insertBefore(copilotBtn, pdfBtn.nextSibling);
        }
    }

    injectButton();
    let injectTimer;
    const toolbarObserver = new MutationObserver(mutations => {
        if (!mutations.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.cke,.cke_top,.cke_toolbox') || n.querySelector?.('.cke_button__imprimir'))))) return;
        clearTimeout(injectTimer); injectTimer = setTimeout(injectButton, 100);
    });
    toolbarObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => { toolbarObserver.disconnect(); clearTimeout(injectTimer); }, { once: true });
})();
