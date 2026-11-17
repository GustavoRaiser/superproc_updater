// Somente acesso ao estado nativo da árvore e serialização da preferência aberta.
(() => {
    if (window.__spSaneadorBridge) return;
    window.__spSaneadorBridge = true;
    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'superproc:saneador-eproc') return;
        const { id, command } = event.data;
        let result;
        try {
            if (command === 'tree') {
                const tree = window.jQuery?.('#divArvore').jstree(true);
                result = tree ? tree.get_checked(true).map(n => ({ id: n.id, text: n.text, attrs: n.a_attr, li: n.li_attr, data: n.data })) : [];
            } else if (command === 'form') {
                const form = document.querySelector('#frmMinutaCadastro, form[name="frmMinutaCadastro"]');
                if (!form) throw new Error('Formulário da preferência não encontrado.');
                // Materializa os destinatários que o submit nativo prepararia.
                if (typeof window.validarCadastroCitacaoIntimacao === 'function' && window.validarCadastroCitacaoIntimacao() === false) throw new Error('O eProc recusou os destinatários da preferência.');
                if (!form.checkValidity()) throw new Error('Há campos obrigatórios não preenchidos na preferência 5. Saneador.');
                const fields = [];
                for (const el of form.elements) {
                    if (!el.name || el.disabled || /^(submit|button|image|reset|file)$/.test(el.type)) continue;
                    if (/^(checkbox|radio)$/.test(el.type) && !el.checked) continue;
                    if (el.tagName === 'SELECT' && el.multiple) { for (const o of el.selectedOptions) fields.push([el.name, o.value]); }
                    else fields.push([el.name, el.value]);
                }
                result = { action: form.action, fields };
            } else throw new Error('Comando não reconhecido.');
            window.postMessage({ type: 'superproc:saneador-eproc-result', id, result }, location.origin);
        } catch (error) { window.postMessage({ type: 'superproc:saneador-eproc-result', id, error: error.message }, location.origin); }
    });
})();
