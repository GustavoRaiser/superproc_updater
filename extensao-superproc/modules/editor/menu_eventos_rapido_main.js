/**
 * SuperPROC - Menu Rápido de Eventos: parte que roda no mundo principal da página (acesso ao CKEDITOR).
 * 1) Detecta o atalho dentro do iframe do CKEditor (o foco do usuário está lá) e avisa o módulo.
 * 2) Guarda o cursor, e depois insere o link escolhido exatamente onde ele estava.
 */
(() => {
    'use strict';
    if (window.__superprocMenuEventosMain) return;
    window.__superprocMenuEventosMain = true;

    const MARCA = 'menu-eventos';
    const ligados = new WeakSet();
    let atalho = null;
    let ultimo = null;
    let captura = null;

    const enviar = (dados) => window.postMessage({ __sp: MARCA, de: 'main', ...dados }, location.origin === 'null' ? '*' : location.origin);
    // Mesma regra de menu_eventos/atalho.js (combinação exata de tecla física + modificadores).
    const combina = (e, a) => !!a && e.code === a.code && !!e.ctrlKey === !!a.ctrl && !!e.altKey === !!a.alt && !!e.shiftKey === !!a.shift && !!e.metaKey === !!a.meta;
    // Só o span do link de documento, nada mais (o conteúdo vem de outra world via postMessage).
    const LINK_VALIDO = /^<span class="widgetlinkdocumento"(?: data-[a-z0-9-]+="[^"<>&]*")+>evento \d{1,6}(?:, [^<>&"]{1,80})?<\/span>$/;

    const instancias = () => { try { return Object.values(window.CKEDITOR?.instances || {}); } catch (_) { return []; } };
    const pronta = (e) => !!(e && e.status === 'ready' && e.document && e.document.$);
    function editorUnico() {
        const lista = instancias().filter(pronta);
        return lista.length === 1 ? lista[0] : null;
    }

    /** Y (no viewport da janela do módulo) do centro da linha onde o cursor está; null se não der para medir. */
    function linhaDoCursor(editor) {
        try {
            const doc = editor.document.$;
            const nativa = doc.getSelection();
            if (!nativa || !nativa.rangeCount) return null;
            const r = nativa.getRangeAt(0).cloneRange();
            r.collapse(false);
            let caixa = r.getClientRects()[0] || r.getBoundingClientRect();
            if (!caixa || (!caixa.height && !caixa.width)) {
                const no = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
                caixa = no.getBoundingClientRect(); // parágrafo vazio: usa o próprio bloco
            }
            const moldura = doc.defaultView.frameElement;
            const deslocamento = moldura && doc !== document ? moldura.getBoundingClientRect().top : 0;
            return Math.round(caixa.top + (caixa.height || 18) / 2 + deslocamento);
        } catch (_) { return null; }
    }

    function capturar(preferido) {
        const editor = preferido || ultimo || editorUnico();
        // Range nativo clonado é "vivo": acompanha as mudanças do DOM enquanto o menu está aberto.
        let range = null;
        try {
            const nativa = editor?.document.$.getSelection();
            if (nativa && nativa.rangeCount) range = nativa.getRangeAt(0).cloneRange();
        } catch (_) { /* sem seleção */ }
        captura = editor ? { editor, range } : null;
    }

    function ligar(editor) {
        if (!pronta(editor)) return;
        if (!editor.__spMenuEventos) {
            editor.__spMenuEventos = true;
            editor.on('focus', () => { ultimo = editor; });
            editor.on('contentDom', () => ligar(editor)); // o iframe é recriado ao alternar Código-fonte
        }
        const doc = editor.document.$;
        if (doc === document || ligados.has(doc)) return; // editor "inline": o módulo já cuida do documento principal
        ligados.add(doc);
        doc.addEventListener('keydown', (e) => {
            if (e.repeat || !combina(e, atalho)) return;
            e.preventDefault();
            e.stopPropagation();
            capturar(editor);
            enviar({ tipo: 'abrir', linha: linhaDoCursor(editor) });
        }, true);
        doc.addEventListener('keydown', (e) => aoDigitar(editor, e), true);
        doc.addEventListener('mousedown', () => { espacoArmado = null; }, true);
    }

    /**
     * Pontuação que "gruda" no evento: se o espaço inserido junto do link ainda é o caractere logo antes do cursor
     * e a próxima tecla é uma delas, o espaço é apagado antes de a tecla entrar (não precisa de backspace).
     */
    const PONTUACAO_DE_FECHAMENTO = /^[,.;:?!)\]}]$/;
    let espacoArmado = null; // editor em que o espaço acabou de ser inserido; qualquer outra tecla/clique desarma

    function aoDigitar(editor, e) {
        if (espacoArmado !== editor) return;
        if (['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Dead'].includes(e.key)) return;
        espacoArmado = null;
        if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || !PONTUACAO_DE_FECHAMENTO.test(e.key)) return;
        try {
            const selecao = editor.document.$.getSelection();
            if (!selecao || !selecao.rangeCount || !selecao.isCollapsed) return;
            const r = selecao.getRangeAt(0);
            const no = r.startContainer;
            const pos = r.startOffset;
            // O espaço é o primeiro caractere do texto que vem logo depois do link.
            if (no.nodeType !== 3 || pos !== 1 || !/^[\s ]$/.test(no.data[0])) return;
            const anterior = no.previousSibling;
            if (!anterior || anterior.nodeType !== 1 || !anterior.matches('span.widgetlinkdocumento, .cke_widget_wrapper')) return;
            editor.fire('saveSnapshot');
            no.deleteData(0, 1);
            const posicao = editor.createRange();
            posicao.setStart(new window.CKEDITOR.dom.node(no), 0);
            posicao.collapse(true);
            editor.getSelection().selectRanges([posicao]);
        } catch (_) { /* sem o ajuste, a tecla entra normalmente (com o espaço antes) */ }
    }

    /** Caractere que vem logo depois do cursor (fim da seleção), ou '' se não há texto colado nele. */
    function caractereSeguinte(editor) {
        try {
            const selecao = editor.document.$.getSelection();
            if (!selecao || !selecao.rangeCount) return '';
            const r = selecao.getRangeAt(0);
            let no = r.endContainer, pos = r.endOffset;
            if (no.nodeType === 1) { no = no.childNodes[pos]; pos = 0; }
            else if (no.nodeType === 3 && pos >= no.data.length) { no = no.nextSibling; pos = 0; }
            return no && no.nodeType === 3 ? (no.data[pos] || '') : '';
        } catch (_) { return ''; }
    }

    function iniciar() {
        instancias().forEach(ligar);
        window.CKEDITOR.on('instanceReady', (ev) => ligar(ev.editor));
    }

    let tentativas = 0;
    (function esperarCkeditor() {
        if (window.CKEDITOR && window.CKEDITOR.on) { iniciar(); return; }
        if (++tentativas < 60) setTimeout(esperarCkeditor, 500);
    })();

    /**
     * Depois de inserir, o Chrome deixa o cursor colado no fim do link e o que se digita em seguida
     * entraria DENTRO do span. Garante um ponto de digitação fora dele: usa o texto que já vem logo
     * depois do link ou, se não houver, cria um espaço comum e põe o cursor antes dele (pontuação
     * digitada fica junto do link; o espaço sobra no fim). Se o editor já deixou o cursor fora
     * (ex.: widget), não mexe em nada.
     */
    function cursorParaForaDoLink(editor, espacoInserido = false) {
        try {
            const doc = editor.document.$;
            const selecao = doc.getSelection();
            if (!selecao || !selecao.rangeCount) return;
            const intervalo = selecao.getRangeAt(0);
            const base = intervalo.startContainer.nodeType === 1 ? intervalo.startContainer : intervalo.startContainer.parentElement;
            let link = base && base.closest ? base.closest('span.widgetlinkdocumento') : null;
            if (!link && intervalo.startContainer.nodeType === 1 && intervalo.startOffset > 0) {
                const anterior = intervalo.startContainer.childNodes[intervalo.startOffset - 1];
                if (anterior && anterior.nodeType === 1 && anterior.matches('span.widgetlinkdocumento, .cke_widget_wrapper')) link = anterior;
            }
            if (!link) return;
            const alvo = link.closest('.cke_widget_wrapper') || link;
            let seguinte = alvo.nextSibling;
            if (!seguinte || seguinte.nodeType !== 3) {
                seguinte = doc.createTextNode(' ');
                alvo.parentNode.insertBefore(seguinte, alvo.nextSibling);
            }
            // Com o espaço inserido junto do link, o cursor vai para depois dele (não fica "em cima" do link).
            const depoisDoEspaco = espacoInserido && seguinte.data && /\s/.test(seguinte.data[0]);
            const posicao = editor.createRange();
            posicao.setStart(new window.CKEDITOR.dom.node(seguinte), depoisDoEspaco ? 1 : 0);
            posicao.collapse(true);
            editor.getSelection().selectRanges([posicao]);
        } catch (_) { /* o link já foi inserido; só o posicionamento do cursor falhou */ }
    }

    /**
     * Equivale a apertar "seta para a direita" uma vez depois de colar: se o próximo caractere é um espaço,
     * passa por cima dele; se não há nada depois (fim do bloco), cria o espaço e fica depois dele.
     * Se o próximo caractere é outro (ex.: vírgula), não anda — não pula texto do usuário.
     */
    function umaCasaParaDireita(editor) {
        try {
            const doc = editor.document.$;
            const selecao = doc.getSelection();
            if (!selecao || !selecao.rangeCount) return;
            const r = selecao.getRangeAt(0);
            let no = r.startContainer, pos = r.startOffset;
            if (no.nodeType === 1) { // cursor entre elementos: vai para o texto seguinte, se houver
                const seguinte = no.childNodes[pos];
                if (seguinte && seguinte.nodeType === 3) { no = seguinte; pos = 0; } else if (pos > 0 && no.childNodes[pos - 1].nodeType === 3) { no = no.childNodes[pos - 1]; pos = no.data.length; } else return;
            }
            if (no.nodeType !== 3) return;
            let alvo = null;
            if (pos < no.data.length) {
                if (/\s/.test(no.data[pos])) alvo = [no, pos + 1];
            } else {
                const seguinte = no.nextSibling;
                if (seguinte && seguinte.nodeType === 3) { if (seguinte.data && /\s/.test(seguinte.data[0])) alvo = [seguinte, 1]; }
                else if (!seguinte || (seguinte.nodeType === 1 && !/^(SPAN|A|STRONG|EM|B|I|U)$/.test(seguinte.tagName))) {
                    const espaco = doc.createTextNode(' ');
                    no.parentNode.insertBefore(espaco, seguinte || null);
                    alvo = [espaco, 1];
                }
            }
            if (!alvo) return;
            const posicao = editor.createRange();
            posicao.setStart(new window.CKEDITOR.dom.node(alvo[0]), alvo[1]);
            posicao.collapse(true);
            editor.getSelection().selectRanges([posicao]);
        } catch (_) { /* a inserção já aconteceu; só o passo extra falhou */ }
    }

    /**
     * Diagnóstico: depois de inserir, compara o texto que o módulo mandou com o que ficou no editor.
     * Se o eproc/CKEditor reescrever o link (ex.: "evento 1, INIC1" no lugar de "evento 1"), avisa com
     * um aviso na tela e registra no console. Só lê; não altera o texto.
     */
    function conferirTextoInserido(editor, html) {
        const esperado = (/>([^<]*)<\/span>$/.exec(html) || [])[1];
        const id = (/data-iddocumento="([^"<>&]*)"/.exec(html) || [])[1];
        if (!esperado || !id) return;
        const verificar = (fase) => {
            try {
                const doc = editor.document.$;
                const spans = [...doc.querySelectorAll('span.widgetlinkdocumento')].filter((s) => s.getAttribute('data-iddocumento') === id);
                if (!spans.length) return false; // o editor trocou o span por outro marcador: não dá para comparar
                if (spans.some((s) => (s.textContent || '').trim() === esperado)) return false;
                const real = (spans[spans.length - 1].textContent || '').trim();
                console.warn('[SuperPROC: Menu de Eventos] o editor alterou o texto do link', { fase, esperado, real });
                enviar({ tipo: 'resultado', ok: true, aviso: `O editor trocou o texto do link para “${real.slice(0, 60)}” (o menu enviou “${esperado}”).` });
                return true;
            } catch (_) { return false; }
        };
        if (!verificar('imediato')) setTimeout(() => verificar('depois'), 400);
    }

    function inserir(html, parenteses) {
        const alvo = captura?.editor || ultimo || editorUnico();
        const resultado = (ok, motivo) => enviar({ tipo: 'resultado', ok, motivo });
        if (typeof html !== 'string' || !LINK_VALIDO.test(html)) return resultado(false, 'Link recusado: formato inesperado.');
        if (!alvo || !pronta(alvo)) return resultado(false, 'Clique dentro do texto da minuta e tente de novo.');
        if (alvo.readOnly) return resultado(false, 'A minuta está somente para leitura.');
        if (alvo.mode && alvo.mode !== 'wysiwyg') return resultado(false, 'Saia do modo "Código-fonte" para inserir o evento.');
        try {
            alvo.focus();
            if (captura?.range) {
                try {
                    const nativa = alvo.document.$.getSelection();
                    nativa.removeAllRanges();
                    nativa.addRange(captura.range);
                    alvo.getSelection().reset(); // o CKEditor relê a seleção real
                } catch (_) { /* seleção antiga inválida: segue com a seleção atual do editor */ }
            }
            alvo.fire('saveSnapshot'); // um Ctrl+Z desfaz só a inserção
            // Só o texto do link é clicável; os parênteses ficam fora. Sem parênteses (Enter e Ctrl+Enter), o espaço
            // vai junto na inserção: "evento 500 " deixa o cursor fora do link (sem precisar da seta para a direita).
            // Se já há vírgula, ponto ou fechamento logo depois do cursor, o espaço não entra (não sobrescreve nem separa).
            const comEspaco = !parenteses && !PONTUACAO_DE_FECHAMENTO.test(caractereSeguinte(alvo));
            alvo.insertHtml(parenteses ? `(${html})` : comEspaco ? `${html}&nbsp;` : html);
            cursorParaForaDoLink(alvo, comEspaco);
            if (parenteses) umaCasaParaDireita(alvo);
            espacoArmado = comEspaco ? alvo : null;
            alvo.fire('saveSnapshot');
            captura = null;
            resultado(true);
            conferirTextoInserido(alvo, html);
        } catch (erro) {
            console.warn('[SuperPROC: Menu de Eventos] falha ao inserir', erro);
            resultado(false, 'Não foi possível inserir o evento no texto.');
        }
    }

    window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (ev.source !== window || !d || d.__sp !== MARCA || d.de !== 'iso') return;
        if (d.tipo === 'config') atalho = d.atalho || null;
        else if (d.tipo === 'preparar') { capturar(null); enviar({ tipo: 'abrir', linha: captura ? linhaDoCursor(captura.editor) : null }); }
        else if (d.tipo === 'inserir') inserir(d.html, d.parenteses === true);
        else if (d.tipo === 'fechar') { try { (captura?.editor || ultimo)?.focus(); } catch (_) { /* editor já descartado */ } captura = null; }
    });

    enviar({ tipo: 'pronto' });
})();
