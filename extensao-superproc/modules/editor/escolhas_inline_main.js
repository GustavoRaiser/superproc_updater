(() => {
    'use strict';
    if (window.__superprocEscolhasInline) return;
    window.__superprocEscolhasInline = true;
    const states = new WeakMap();
    const editors = new WeakSet();
    let boundCK;
    const pattern = () => /\[([^\[\]\r\n]+?\|[^\[\]\r\n]+?)\]/g;

    function mount(root, editor) {
        if (!root) return;
        const previous = states.get(root);
        if (previous) {
            if (!editor || previous.editor) return;
            previous.dispose();
        }
        const doc = root.ownerDocument;
        const win = doc.defaultView;
        const layer = doc.createElement('div');
        layer.className = 'superproc-choice-layer';
        layer.contentEditable = 'false';
        // Não pertence ao editable/body: getData, updateElement, PDF e cópia
        // continuam recebendo somente o texto real da minuta.
        doc.documentElement.appendChild(layer);
        const style = doc.createElement('style');
        style.textContent = `
            .superproc-choice-layer { position:absolute;left:0;top:0;z-index:2147483646;pointer-events:none; }
            .superproc-choice-layer .inline-choice-container { position:absolute;display:inline-flex;gap:4px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:2px 4px;pointer-events:auto;white-space:nowrap;box-shadow:0 2px 5px #0002; }
            .superproc-choice-layer .inline-choice-btn { background:#fff;border:1px solid #cbd5e1;border-radius:3px;font:12px Arial;padding:1px 6px;cursor:pointer;color:#1e293b; }
            .superproc-choice-layer .inline-choice-btn:hover,.superproc-choice-layer .inline-choice-btn:focus-visible { background:#0284c7;color:#fff;border-color:#0284c7; }
            @media print { .superproc-choice-layer { display:none!important; } }
        `;
        layer.appendChild(style);
        const state = { root, editor, layer, composing: false, timer: null, choices: [] };
        states.set(root, state);

        function matches() {
            if (root.tagName === 'TEXTAREA') {
                return [...root.value.matchAll(pattern())].map(match => ({ raw: match[0], options: match[1].split('|').map(s => s.trim()), start: match.index }));
            }
            const walker = doc.createTreeWalker(root, win.NodeFilter.SHOW_TEXT);
            const result = [];
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.parentElement?.closest('script,style,[contenteditable="false"]')) continue;
                for (const match of node.nodeValue.matchAll(pattern())) {
                    const range = doc.createRange();
                    range.setStart(node, match.index);
                    range.setEnd(node, match.index + match[0].length);
                    result.push({ raw: match[0], options: match[1].split('|').map(s => s.trim()), range });
                }
            }
            return result;
        }

        function position() {
            for (const choice of state.choices) {
                const rect = choice.range ? choice.range.getBoundingClientRect() : root.getBoundingClientRect();
                const box = choice.box;
                const left = Math.max(2, Math.min(rect.left, win.innerWidth - box.offsetWidth - 4));
                box.style.left = `${left + win.scrollX}px`;
                box.style.top = `${Math.max(0, rect.top - box.offsetHeight - 3) + win.scrollY}px`;
            }
        }

        function choose(choice, value) {
            if (editor?.readOnly || root.readOnly || root.disabled) return;
            // O intervalo pode ter sido editado desde a última renderização.
            const current = choice.range ? choice.range.toString() : root.value.slice(choice.start, choice.start + choice.raw.length);
            if (current !== choice.raw) { render(); return; }
            if (editor && choice.range && window.CKEDITOR) {
                editor.fire('saveSnapshot');
                const range = new window.CKEDITOR.dom.range(editor.document);
                range.setStart(new window.CKEDITOR.dom.node(choice.range.startContainer), choice.range.startOffset);
                range.setEnd(new window.CKEDITOR.dom.node(choice.range.endContainer), choice.range.endOffset);
                editor.focus();
                editor.getSelection().selectRanges([range]);
                editor.insertText(value);
                editor.fire('saveSnapshot');
                editor.fire('change');
            } else if (root.tagName === 'TEXTAREA') {
                root.focus();
                root.setSelectionRange(choice.start, choice.start + choice.raw.length);
                // insertText registra a alteração no desfazer nativo do textarea.
                if (!doc.execCommand('insertText', false, value)) root.setRangeText(value, choice.start, choice.start + choice.raw.length, 'end');
                root.dispatchEvent(new win.Event('input', { bubbles: true }));
            } else {
                root.focus();
                const selection = win.getSelection();
                selection.removeAllRanges();
                selection.addRange(choice.range);
                if (!doc.execCommand('insertText', false, value)) {
                    choice.range.deleteContents();
                    const text = doc.createTextNode(value);
                    choice.range.insertNode(text);
                    choice.range.setStartAfter(text);
                    choice.range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(choice.range);
                }
                root.dispatchEvent(new win.Event('input', { bubbles: true }));
            }
            render();
        }

        function render() {
            if (state.composing) return;
            layer.querySelectorAll('.inline-choice-container').forEach(box => box.remove());
            if (editor?.readOnly || root.readOnly || root.disabled || !root.getClientRects().length) { state.choices = []; return; }
            state.choices = matches().filter(choice => choice.options.every(Boolean));
            // Textareas não têm nós HTML: exibir o grupo próximo do cursor.
            if (root.tagName === 'TEXTAREA') {
                state.choices = state.choices.filter(choice => root.selectionStart >= choice.start && root.selectionStart <= choice.start + choice.raw.length).slice(0, 1);
            }
            for (const choice of state.choices) {
                const box = doc.createElement('span');
                box.className = 'inline-choice-container';
                box.setAttribute('role', 'group');
                box.setAttribute('aria-label', `Escolher: ${choice.raw}`);
                box.addEventListener('mousedown', event => event.preventDefault());
                for (const option of choice.options) {
                    const button = doc.createElement('button');
                    button.type = 'button';
                    button.className = 'inline-choice-btn';
                    button.textContent = option;
                    button.onclick = event => { event.preventDefault(); event.stopPropagation(); choose(choice, option); };
                    box.appendChild(button);
                }
                choice.box = box;
                layer.appendChild(box);
            }
            position();
        }
        function schedule() { clearTimeout(state.timer); state.timer = setTimeout(render, 180); }
        root.addEventListener('input', schedule);
        root.addEventListener('paste', schedule);
        const composing = () => { state.composing = true; };
        const composed = () => { state.composing = false; schedule(); };
        root.addEventListener('compositionstart', composing);
        root.addEventListener('compositionend', composed);
        if (root.tagName === 'TEXTAREA') {
            root.addEventListener('keyup', schedule);
            root.addEventListener('click', schedule);
        }
        win.addEventListener('resize', position);
        doc.addEventListener('scroll', position, true);
        const observer = new win.MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        state.dispose = () => {
            clearTimeout(state.timer);
            observer.disconnect();
            root.removeEventListener('input', schedule);
            root.removeEventListener('paste', schedule);
            root.removeEventListener('compositionstart', composing);
            root.removeEventListener('compositionend', composed);
            root.removeEventListener('keyup', schedule);
            root.removeEventListener('click', schedule);
            win.removeEventListener('resize', position);
            doc.removeEventListener('scroll', position, true);
            if (editor) {
                editor.removeListener('change', schedule);
                editor.removeListener('dataReady', schedule);
                editor.removeListener('readOnly', schedule);
            }
            layer.remove();
            states.delete(root);
        };
        if (editor) {
            editor.on('change', schedule);
            editor.on('dataReady', schedule);
            editor.on('readOnly', schedule);
            editor.once('contentDomUnload', state.dispose);
        }
        render();
    }

    function scan() {
        const ck = window.CKEDITOR;
        if (ck) {
            if (boundCK !== ck) { boundCK = ck; ck.on('instanceReady', scan); }
            for (const editor of Object.values(ck.instances || {})) {
                if (!editors.has(editor)) {
                    editors.add(editor);
                    editor.on('contentDom', () => mount(editor.editable()?.$, editor));
                }
                if (editor.status === 'ready') mount(editor.editable()?.$, editor);
            }
        }
        document.querySelectorAll('textarea:not([readonly]):not([disabled]),[contenteditable="true"]').forEach(root => {
            if (ck && Object.values(ck.instances || {}).some(editor => editor.element?.$ === root)) return;
            if (!root.closest('.superproc-choice-layer,.cke') && !states.has(root)) mount(root);
        });
    }
    scan();
    let timer;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 100); }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', scan, { once: true });
})();
