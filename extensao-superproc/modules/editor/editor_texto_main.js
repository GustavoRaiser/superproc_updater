(() => {
    'use strict';
    if (window.__superprocEditorTextoMain) return;
    window.__superprocEditorTextoMain = true;

    const R = window.SuperprocTextoRegras;
    if (!R) { console.error('[SuperPROC Texto] Regras de texto indisponíveis.'); return; }

    const BTN_ID = 'az-btn-texto-custom';
    const MENU_ID = 'az-menu-texto-custom';
    const BLOCOS = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre';
    let lastEditor = null;

    /* ---------- editor / seleção ---------- */
    function editorInstances() { return Object.values(window.CKEDITOR?.instances || {}).filter(e => e.status === 'ready' && e.document?.$?.body); }
    function selectedRange(doc) {
        try {
            const sel = doc?.defaultView?.getSelection?.();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
            const range = sel.getRangeAt(0);
            if (!doc.body.contains(range.commonAncestorContainer) || !range.toString().trim()) return null;
            return range;
        } catch (_) { return null; }
    }
    function editorAtual() {
        const lista = editorInstances();
        return lista.find(e => e.focusManager?.hasFocus) || lista.find(e => e === lastEditor)
            || (lista.length === 1 ? lista[0] : lista.find(e => selectedRange(e.document.$)) || null);
    }
    if (window.CKEDITOR) {
        const ouvir = editor => editor.on('focus', () => { lastEditor = editor; });
        editorInstances().forEach(ouvir);
        window.CKEDITOR.on('instanceReady', event => ouvir(event.editor));
    }

    /* ---------- aviso discreto ---------- */
    function aviso(mensagem) {
        document.getElementById('az-aviso-texto')?.remove();
        const el = document.createElement('div');
        el.id = 'az-aviso-texto'; el.setAttribute('role', 'status');
        el.textContent = mensagem;
        Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', padding: '8px 14px', borderRadius: '6px', font: '13px Arial,sans-serif', zIndex: '2147483647', boxShadow: '0 4px 14px rgba(0,0,0,.3)' });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3200);
    }

    /* ---------- operações no DOM do iframe ---------- */
    function trechosDeTexto(doc, range) {
        const lista = [];
        const raiz = range.commonAncestorContainer;
        if (raiz.nodeType === 3) return [{ no: raiz, ini: range.startOffset, fim: range.endOffset }];
        const walker = doc.createTreeWalker(raiz, 4);
        while (walker.nextNode()) {
            const no = walker.currentNode;
            if (!range.intersectsNode(no)) continue;
            const ini = no === range.startContainer ? range.startOffset : 0;
            const fim = no === range.endContainer ? range.endOffset : no.data.length;
            if (fim > ini) lista.push({ no, ini, fim });
        }
        return lista;
    }
    function restaurarSelecao(doc, primeiro, ultimo) {
        const sel = doc.defaultView.getSelection();
        const r = doc.createRange();
        r.setStart(primeiro.no, primeiro.ini);
        r.setEnd(ultimo.no, ultimo.fim);
        sel.removeAllRanges(); sel.addRange(r);
    }
    function transformarTexto(doc, range, criarFuncao) {
        const trechos = trechosDeTexto(doc, range);
        if (!trechos.length) return false;
        const fn = criarFuncao();
        trechos.forEach((t) => {
            const velho = t.no.data.slice(t.ini, t.fim);
            const novo = fn(velho);
            if (novo !== velho) { t.no.replaceData(t.ini, t.fim - t.ini, novo); t.fim = t.ini + novo.length; }
        });
        restaurarSelecao(doc, trechos[0], trechos[trechos.length - 1]);
        return true;
    }

    const textoLimpo = (t) => {
        if (!t) return '';
        return t.replace(/[\s\u00a0\u1680\u2000-\u200b\u200c\u200d\u2028\u2029\u202f\u205f\u3000\ufeff]/g, '');
    };

    const vazio = (el) => {
        if (el.querySelector('img,hr,table,iframe,object,svg,input,button')) return false;
        const clonado = el.cloneNode(true);
        clonado.querySelectorAll('br, [data-cke-filler]').forEach(n => n.remove());
        return textoLimpo(clonado.textContent) === '';
    };

    function blocosFolha(doc, range) {
        const subirAteBloco = (no) => {
            let el = no.nodeType === 3 ? no.parentElement : no;
            while (el && el !== doc.body && !el.matches?.(BLOCOS)) {
                el = el.parentElement;
            }
            return el && el !== doc.body ? el : null;
        };

        const blocoIni = subirAteBloco(range.startContainer);
        const blocoFim = subirAteBloco(range.endContainer);
        const todosBlocos = [...doc.body.querySelectorAll(BLOCOS)].filter(el => !el.querySelector(BLOCOS));

        if (blocoIni && blocoFim) {
            const idxIni = todosBlocos.indexOf(blocoIni);
            const idxFim = todosBlocos.indexOf(blocoFim);
            if (idxIni !== -1 && idxFim !== -1) {
                const de = Math.min(idxIni, idxFim);
                const ate = Math.max(idxIni, idxFim);
                return todosBlocos.slice(de, ate + 1);
            }
        }

        return todosBlocos.filter(el => {
            try { return range.intersectsNode(el); } catch (_) { return false; }
        });
    }

    /* 1. Remove parágrafos que são realmente vazios (ex: <p><br></p>) */
    function removerLinhasVazias(doc, range) {
        const blocos = blocosFolha(doc, range);
        if (!blocos.length) {
            aviso('Nenhum parágrafo selecionado.');
            return null;
        }

        let alterou = false;

        blocos.forEach((bloco) => {
            if (vazio(bloco)) {
                bloco.remove();
                alterou = true;
                return;
            }

            const walker = doc.createTreeWalker(bloco, 4);
            const nos = [];
            while (walker.nextNode()) nos.push(walker.currentNode);
            nos.forEach(n => {
                n.data = n.data.replace(/[\u00a0\u202f\u2007]/g, ' ');
            });

            const brs = [...bloco.querySelectorAll('br')];
            brs.forEach((br) => {
                let prox = br.nextSibling;
                while (prox && prox.nodeType === 3 && textoLimpo(prox.data) === '') {
                    prox = prox.nextSibling;
                }
                const ehPrimeiro = !br.previousSibling || (br.previousSibling.nodeType === 3 && !br.previousSibling.data.trim());
                const ehUltimo = !prox;

                if (ehPrimeiro || ehUltimo || (prox && prox.nodeName === 'BR')) {
                    br.remove();
                    alterou = true;
                }
            });

            if (vazio(bloco)) {
                bloco.remove();
                alterou = true;
            }
        });

        if (!alterou) {
            aviso('Nenhuma linha vazia encontrada. Se deseja juntar os parágrafos, use "Compactar parágrafos".');
            return null;
        }

        return true;
    }

    /* 2. Efeito do AHK: Junta múltiplos <p> em um único <p> usando <br> (remove espaçamento CSS) */
    function compactarParagrafos(doc, range) {
        const blocos = blocosFolha(doc, range);
        const validos = blocos.filter(b => !vazio(b));

        if (validos.length < 2) {
            aviso('Selecione ao menos 2 parágrafos com texto para compactar.');
            return null;
        }

        const primeiro = validos[0];
        const irmaos = validos.slice(1).filter(b => b.parentNode === primeiro.parentNode);

        // Remove blocos vazios residuais que estejam entre eles
        blocos.filter(b => vazio(b)).forEach(b => b.remove());

        irmaos.forEach((b) => {
            primeiro.appendChild(doc.createElement('br'));
            while (b.firstChild) {
                primeiro.appendChild(b.firstChild);
            }
            b.remove();
        });

        primeiro.normalize();
        return true;
    }

    /* 3. Unifica tudo em uma única linha contínua com espaços */
    function removerQuebras(doc, range) {
        const blocos = blocosFolha(doc, range);
        if (!blocos.length) return false;
        const primeiro = blocos[0];
        const irmaos = blocos.slice(1).filter(b => b.parentNode === primeiro.parentNode && !vazio(b));
        blocos.slice(1).filter(b => b.parentNode === primeiro.parentNode && vazio(b)).forEach(b => b.remove());
        irmaos.forEach((b) => {
            primeiro.appendChild(doc.createTextNode(' '));
            while (b.firstChild) primeiro.appendChild(b.firstChild);
            b.remove();
        });
        primeiro.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode(' ')));
        primeiro.normalize();
        return true;
    }

    /* 4. Limpa toda a formatação inline (negrito, itálico, cores, sobrescrito...) do trecho selecionado.
       Mantém o texto, os parágrafos (e suas classes), links, widgets de evento e imagens. */
    const FORMATACAO_INLINE = 'b,strong,i,em,u,s,strike,del,ins,sub,sup,font,mark,big,small,code,kbd,cite,q,span';
    const PROTEGIDO = 'a,span.widgetlinkdocumento,.cke_widget_wrapper,[data-cke-bookmark]';
    function limparEstilos(doc, range) {
        const trechos = trechosDeTexto(doc, range).map((t) => {
            let no = t.no;
            if (t.fim < no.data.length) no.splitText(t.fim);
            if (t.ini > 0) no = no.splitText(t.ini);
            return { no, ini: 0, fim: no.data.length };
        });
        if (!trechos.length) return false;
        const blocos = blocosFolha(doc, range);
        let alterou = false;
        trechos.forEach(({ no }) => {
            if (no.parentElement?.closest(PROTEGIDO)) return;
            // Tira o texto de dentro de cada elemento de formatação, dividindo o elemento ao meio quando preciso.
            while (true) {
                const pai = no.parentElement;
                if (!pai || pai === doc.body || !pai.matches(FORMATACAO_INLINE)) break;
                const avo = pai.parentNode;
                const resto = [];
                for (let s = no.nextSibling; s; s = s.nextSibling) resto.push(s);
                if (resto.length) {
                    const copia = pai.cloneNode(false);
                    copia.removeAttribute('id');
                    resto.forEach(s => copia.appendChild(s));
                    avo.insertBefore(copia, pai.nextSibling);
                }
                avo.insertBefore(no, pai.nextSibling);
                if (!pai.firstChild) pai.remove();
                alterou = true;
            }
        });
        blocos.forEach((bloco) => {
            if (bloco.hasAttribute('style')) { bloco.removeAttribute('style'); alterou = true; }
        });
        restaurarSelecao(doc, trechos[0], trechos[trechos.length - 1]);
        blocos.forEach(b => b.normalize());
        if (!alterou) aviso('Nenhuma formatação encontrada no trecho selecionado.');
        return true;
    }

    function escapar(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function formatarEmenta(doc, range, editor) {
        const original = doc.defaultView.getSelection().toString();
        const novo = R.formatarEmenta(original);
        if (novo === null) { aviso('Não encontrei a referência entre parênteses na seleção.'); return null; }
        const linhas = novo.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
        editor.focus();
        editor.insertHtml(linhas.length > 1 ? linhas.map(l => `<p>${escapar(l)}</p>`).join('') : escapar(linhas[0] || ''));
        return true;
    }

    /* ---------- comandos do editor ---------- */
    function acionarAtalho(editor, doc, tecla) {
        const codigo = tecla.toUpperCase().charCodeAt(0);
        const nome = editor.keystrokeHandler?.keystrokes?.[(window.CKEDITOR.ALT || 0) + codigo];
        editor.focus();
        if (nome && editor.commands?.[nome]) { editor.execCommand(nome); return true; }
        const ev = new doc.defaultView.KeyboardEvent('keydown', { key: tecla.toLowerCase(), code: /\d/.test(tecla) ? 'Digit' + tecla : 'Key' + tecla.toUpperCase(), altKey: true, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'keyCode', { get: () => codigo });
        Object.defineProperty(ev, 'which', { get: () => codigo });
        doc.body.dispatchEvent(ev);
        return ev.defaultPrevented;
    }
    function acionarComando(editor, nome) {
        editor.focus();
        if (!editor.commands?.[nome]) return false;
        editor.execCommand(nome);
        return true;
    }

    const GRUPOS = [
        { titulo: 'Formatação', itens: [
            { rotulo: 'Negrito', dica: 'Ctrl+B', comando: 'bold' },
            { rotulo: 'Itálico', dica: 'Ctrl+I', comando: 'italic' },
            { rotulo: 'Sublinhado', dica: 'Ctrl+U', comando: 'underline' },
            { rotulo: 'Riscado', dica: 'Alt+K', atalho: 'K' },
            { rotulo: 'Dispositivo', dica: 'Alt+D', atalho: 'D' }
        ] },
        { titulo: 'Parágrafo', itens: [
            { rotulo: 'Recuo padrão', dica: 'Alt+1', atalho: '1' },
            { rotulo: 'Parágrafo recuado', dica: 'Alt+3', atalho: '3' },
            { rotulo: 'Centralizado', dica: 'Alt+4', atalho: '4' },
            { rotulo: 'Citação', dica: 'Alt+5', atalho: '5' }
        ] },
        { titulo: 'Limpeza', itens: [
            { rotulo: 'Compactar parágrafos (remove o <br>)', selecao: true, dom: compactarParagrafos },
            { rotulo: 'Formatar ementa', selecao: true, ementa: true },
            { rotulo: 'Limpar estilos', selecao: true, dom: limparEstilos },
            { rotulo: 'Remover quebra de linha', selecao: true, dom: removerQuebras }
        ] },
        { titulo: 'Caixa e tipografia', itens: [
            { rotulo: 'Datas, CPF/CNPJ, aspas...', selecao: true, texto: () => R.normalizarTudo },
            { rotulo: 'Primeira Letra Maiúscula', selecao: true, texto: () => { const estado = { palavras: 0 }; return t => R.tituloCaso(t, estado); } },
            { rotulo: 'minúsculas', selecao: true, texto: () => R.paraMinusculas },
            { rotulo: 'MAIÚSCULAS', selecao: true, texto: () => R.paraMaiusculas }
        ] }
    ];

    function executar(item) {
        const editor = editorAtual();
        if (!editor) { aviso('Clique dentro da minuta antes de usar o menu.'); return; }
        const doc = editor.document.$;
        const range = selectedRange(doc);
        if (item.selecao && !range) { aviso('Selecione um trecho da minuta primeiro.'); return; }
        try {
            editor.fire('saveSnapshot');
            let ok = true;
            if (item.comando) ok = acionarComando(editor, item.comando);
            else if (item.atalho) ok = acionarAtalho(editor, doc, item.atalho);
            else if (item.dom) ok = item.dom(doc, range);
            else if (item.texto) ok = transformarTexto(doc, range, item.texto);
            else if (item.ementa) ok = formatarEmenta(doc, range, editor);
            editor.fire('saveSnapshot');
            editor.focus();
            if (ok === false) aviso(`Não foi possível aplicar "${item.rotulo}" neste trecho.`);
        } catch (erro) {
            console.error('[SuperPROC Texto]', erro);
            aviso(`Falha ao aplicar "${item.rotulo}": ${erro.message}`);
        }
    }

    /* ---------- menu ---------- */
    function fecharMenu(devolverFoco = false) {
        document.getElementById(MENU_ID)?.remove();
        if (devolverFoco) editorAtual()?.focus();
        document.getElementById(BTN_ID)?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', foraDoMenu, true);
        document.removeEventListener('keydown', teclaNoMenu, true);
    }
    function foraDoMenu(ev) { if (!ev.target.closest?.(`#${MENU_ID},#${BTN_ID}`)) fecharMenu(); }
    function teclaNoMenu(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); fecharMenu(true); return; }
        const menu = document.getElementById(MENU_ID);
        if (!menu || ev.ctrlKey || ev.metaKey) return;
        const tecla = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        const mapa = { ArrowUp: 'cima', w: 'cima', ArrowDown: 'baixo', s: 'baixo', ArrowLeft: 'esquerda', a: 'esquerda', ArrowRight: 'direita', d: 'direita', Home: 'inicio', End: 'fim' };
        const acao = mapa[tecla];
        if (!acao) return;
        const colunas = [...menu.querySelectorAll('[data-col]')].map(c => [...c.querySelectorAll('button')]);
        if (!colunas.length) return;
        ev.preventDefault(); ev.stopPropagation();
        let col = colunas.findIndex(c => c.includes(document.activeElement));
        let lin = col < 0 ? -1 : colunas[col].indexOf(document.activeElement);
        if (col < 0) { col = colunas.length === 3 ? 1 : 0; lin = acao === 'cima' || acao === 'fim' ? colunas[col].length : -1; }
        const total = () => colunas[col].length;
        if (acao === 'cima') lin = lin <= 0 ? total() - 1 : lin - 1;
        else if (acao === 'baixo') lin = (lin + 1) % total();
        else if (acao === 'inicio') lin = 0;
        else if (acao === 'fim') lin = total() - 1;
        else if (acao === 'esquerda' || acao === 'direita') {
            const destino = col + (acao === 'esquerda' ? -1 : 1);
            if (destino < 0 || destino >= colunas.length) return;
            col = destino; lin = Math.min(Math.max(lin, 0), total() - 1);
        }
        colunas[col][lin].focus({ preventScroll: true });
    }

    function abrirMenu(botao, ancora = null, focarPrimeiro = false, tresColunas = false) {
        if (document.getElementById(MENU_ID)) { fecharMenu(); return; }
        const menu = document.createElement('div');
        menu.id = MENU_ID; menu.setAttribute('role', 'menu');
        Object.assign(menu.style, { position: 'fixed', zIndex: '2147483646', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,.2)', padding: '4px 0', font: '12px Arial,sans-serif', minWidth: '230px', maxHeight: '80vh', overflow: 'auto', display: 'flex', alignItems: 'flex-start' });
        // 3 colunas: [Formatação + Parágrafo] | [Limpeza] | [Caixa e tipografia]
        const distribuicao = tresColunas ? [GRUPOS.slice(0, 2), [GRUPOS[2]], [GRUPOS[3]]] : [GRUPOS];
        distribuicao.forEach((grupos, indiceColuna) => {
            const coluna = document.createElement('div');
            coluna.setAttribute('data-col', String(indiceColuna));
            Object.assign(coluna.style, { flex: '1 1 0', minWidth: '230px' });
            if (indiceColuna) Object.assign(coluna.style, { borderLeft: '1px solid #e2e8f0' });
            grupos.forEach((grupo, i) => {
                if (i) { const sep = document.createElement('div'); Object.assign(sep.style, { borderTop: '1px solid #e2e8f0', margin: '4px 0' }); coluna.append(sep); }
                const cab = document.createElement('div'); cab.textContent = grupo.titulo.toUpperCase();
                Object.assign(cab.style, { padding: '4px 12px', color: '#64748b', fontWeight: '700', fontSize: '10px', letterSpacing: '.05em' });
                coluna.append(cab);
                grupo.itens.forEach((item) => {
                    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
                    const nome = document.createElement('span'); nome.textContent = item.rotulo;
                    b.append(nome);
                    if (item.dica) { const d = document.createElement('span'); d.textContent = item.dica; Object.assign(d.style, { color: '#94a3b8', fontSize: '11px', marginLeft: '16px' }); b.append(d); }
                    Object.assign(b.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '5px 12px', border: '0', background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: '#1f2937' });
                    b.addEventListener('mouseenter', () => { b.style.background = '#eef2f7'; });
                    b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
                    b.addEventListener('mousedown', ev => ev.preventDefault());
                    b.addEventListener('click', (ev) => { ev.preventDefault(); fecharMenu(); executar(item); });
                    coluna.append(b);
                });
            });
            menu.append(coluna);
        });
        document.body.append(menu);
        const r = ancora || botao.getBoundingClientRect();
        const largura = menu.offsetWidth;
        menu.style.top = `${Math.max(8, Math.min(r.bottom + 2, window.innerHeight - menu.offsetHeight - 8))}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - largura - 8))}px`;
        botao?.setAttribute('aria-expanded', 'true');
        // O seletor começa no primeiro item da coluna do meio (Limpeza) quando há 3 colunas.
        if (focarPrimeiro) (menu.querySelector('[data-col="1"] button') || menu.querySelector('button'))?.focus({ preventScroll: true });
        document.addEventListener('mousedown', foraDoMenu, true);
        document.addEventListener('keydown', teclaNoMenu, true);
    }

    /* ---------- atalho: com texto selecionado na minuta, o atalho (padrão Alt+Shift) abre o menu junto à seleção ---------- */
    // Valor recebido do módulo (popup): acorde { acorde:true, ctrl, alt, shift } ou combinação { code, ctrl, alt, shift, meta }; null = sem atalho.
    const ATALHO_PADRAO = { acorde: true, ctrl: false, alt: true, shift: true, meta: false };
    const NOME_MODIFICADOR = { Alt: 'alt', Shift: 'shift', Control: 'ctrl' };
    let atalho = ATALHO_PADRAO;
    const flagsIguais = (ev, a) => !!ev.ctrlKey === !!a.ctrl && !!ev.altKey === !!a.alt && !!ev.shiftKey === !!a.shift && !!ev.metaKey === !!a.meta;
    function acionaAtalho(ev) {
        if (!atalho) return false;
        if (atalho.acorde) { const m = NOME_MODIFICADOR[ev.key]; return !!m && !!atalho[m] && flagsIguais(ev, atalho); }
        return ev.code === atalho.code && flagsIguais(ev, atalho);
    }
    // null = sem atalho; undefined = valor inválido (ignorado).
    function atalhoValido(v) {
        if (v === null) return null;
        if (!v || typeof v !== 'object') return undefined;
        const flags = { ctrl: v.ctrl === true, alt: v.alt === true, shift: v.shift === true, meta: v.meta === true };
        if (v.acorde === true) {
            const dois = [flags.ctrl, flags.alt, flags.shift].filter(Boolean).length === 2;
            return dois && !flags.meta && !(flags.ctrl && flags.alt) ? { acorde: true, ...flags } : undefined;
        }
        return typeof v.code === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v.code) ? { code: v.code, ...flags } : undefined;
    }
    const docsComAtalho = new WeakSet();
    function ancoraDaSelecao(doc, range) {
        const quadro = [...document.querySelectorAll('iframe')].find(f => { try { return f.contentDocument === doc; } catch (_) { return false; } });
        const base = quadro ? quadro.getBoundingClientRect() : { left: 0, top: 0 };
        const retangulos = range.getClientRects();
        const alvo = retangulos.length ? retangulos[retangulos.length - 1] : range.getBoundingClientRect();
        return { left: base.left + alvo.left, bottom: base.top + alvo.bottom };
    }
    function ligarAtalho(doc) {
        if (!doc || docsComAtalho.has(doc)) return;
        docsComAtalho.add(doc);
        let engolirSoltar = false;
        doc.addEventListener('keydown', (ev) => {
            if (ev.repeat || !acionaAtalho(ev)) return;
            const range = selectedRange(doc);
            if (!range) return;
            ev.preventDefault(); ev.stopPropagation();
            engolirSoltar = true;
            const editor = editorInstances().find(e => e.document.$ === doc);
            if (editor) lastEditor = editor;
            abrirMenu(document.getElementById(BTN_ID), ancoraDaSelecao(doc, range), true, true);
        }, true);
        doc.addEventListener('keyup', (ev) => {
            if (!engolirSoltar || !NOME_MODIFICADOR[ev.key]) return;
            ev.preventDefault();
            if (!ev.altKey && !ev.shiftKey && !ev.ctrlKey) engolirSoltar = false;
        }, true);
    }
    function ligarAtalhoNosEditores() { editorInstances().forEach(e => ligarAtalho(e.document.$)); }
    if (window.CKEDITOR) {
        const ligar = (editor) => { editor.on('contentDom', () => ligarAtalho(editor.document?.$)); ligarAtalho(editor.document?.$); };
        editorInstances().forEach(ligar);
        window.CKEDITOR.on('instanceReady', event => ligar(event.editor));
    }

    /* ---------- botão na barra do CKEditor ---------- */
    function injetarBotao() {
        const referencia = document.getElementById('az-btn-corrigir-copilot') || document.getElementById('az-btn-gerar-pdf-custom') || document.querySelector('.cke_button__imprimir');
        if (!referencia) return;
        let botao = document.getElementById(BTN_ID);
        if (!botao) {
            botao = document.createElement('a');
            botao.id = BTN_ID;
            botao.className = 'cke_button cke_button_off';
            botao.href = 'javascript:void(0)';
            botao.setAttribute('role', 'button');
            botao.setAttribute('aria-haspopup', 'menu');
            botao.setAttribute('aria-expanded', 'false');
            botao.title = 'Edição rápida de texto: formatação, parágrafos, limpeza, caixa/tipografia e ementa (atua na seleção)';
            botao.innerHTML = '<span class="cke_button_icon" style="background:none;display:inline-block;width:auto;padding:0 2px;font-weight:950;font-size:11px;color:#6d28d9;text-align:center;line-height:16px">Aa</span><span class="cke_button_label">Texto</span>';
            botao.addEventListener('mousedown', ev => ev.preventDefault());
            botao.addEventListener('click', (ev) => { ev.preventDefault(); abrirMenu(botao); });
            botao.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirMenu(botao); } });
        }
        if (botao.previousElementSibling !== referencia) referencia.parentNode.insertBefore(botao, referencia.nextSibling);
    }

    injetarBotao();
    ligarAtalhoNosEditores();
    let timer;
    const observador = new MutationObserver((mutacoes) => {
        if (!mutacoes.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.cke,.cke_top,.cke_toolbox,#az-btn-gerar-pdf-custom,#az-btn-corrigir-copilot') || n.querySelector?.('.cke_button__imprimir,#az-btn-corrigir-copilot'))))) return;
        clearTimeout(timer); timer = setTimeout(() => { injetarBotao(); ligarAtalhoNosEditores(); }, 160);
    });
    observador.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => { observador.disconnect(); clearTimeout(timer); fecharMenu(); }, { once: true });

    // Atalho vindo do módulo (popup). Até chegar, vale o padrão; valor inválido é ignorado.
    window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (ev.source !== window || !d || d.__sp !== 'editor-texto' || d.de !== 'iso' || d.tipo !== 'config') return;
        const novo = atalhoValido(d.atalho);
        if (novo !== undefined) atalho = novo;
    });
    window.postMessage({ __sp: 'editor-texto', de: 'main', tipo: 'pronto' }, location.origin === 'null' ? '*' : location.origin);
})();
