// Árvore - Cores no Evento Raiz (camada: host; mundo isolado 1110, na árvore de documentos e na capa do processo).
// Chave em CFG > Configurações ("Árvore - Cores no Evento Raiz", arvoreEventoCor). Parte nativa do módulo da extensão (extensao-superproc/modules/arvore/arvore_evento_cor.js):
// mesmo comportamento e mesmos dados (localStorage do eproc). Se a extensão também estiver instalada, o navegador publica o id do
// módulo em <html data-superproc-navegador-modulos> e a extensão fica parada (CONTROLADO PELO NAVEGADOR): nada duplica.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spArvoreEventoCor) return;
window.__spArvoreEventoCor = true;
if (!["arvore_documento_listar","processo_selecionar"].includes(new URLSearchParams(location.search).get('acao'))) return;

    'use strict';

    const ESTILO_ID = 'superproc-estilo-arvore-evento-cor';
    const CANAL_ESPELHO = 'azflowEventosEspelho';

    let mapaPartesCache = {};
    let mapaIconesCache = {};
    let observer = null;
    let updatePending = false;

    // Injeta CSS com as cores exatas do AZflow adaptadas para o nó raiz e ícone azul
    function injetarEstilos() {
        if (document.getElementById(ESTILO_ID)) return;

        const style = document.createElement('style');
        style.id = ESTILO_ID;
        style.textContent = `
            /* SuperPROC: Destaque de Origem nos Eventos Raiz da Árvore */
            #divArvore li[evento='true'][data-superproc-cor] > i.jstree-ocl {
                border-radius: 4px 0 0 4px !important;
                margin-right: 0 !important;
                vertical-align: middle !important;
                transition: background-color 0.12s ease;
            }

            #divArvore li[evento='true'][data-superproc-cor] > a.jstree-anchor {
                border-radius: 0 4px 4px 0 !important;
                color: #000000 !important;
                padding-left: 2px !important;
                padding-right: 6px !important;
                margin-left: 0 !important;
                transition: background-color 0.12s ease;
            }

            #divArvore li[evento='true'][data-superproc-cor]:hover > i.jstree-ocl,
            #divArvore li[evento='true'][data-superproc-cor]:hover > a.jstree-anchor {
                filter: brightness(0.97);
            }

            /* PARTE ATIVA (AUTOR) - Azul (#A8C4E6 / rgba(168, 196, 230, 0.72)) */
            #divArvore:not([data-azflow-bv-autor='0']) li[evento='true'][data-superproc-cor='AUTOR'] > i.jstree-ocl,
            #divArvore:not([data-azflow-bv-autor='0']) li[evento='true'][data-superproc-cor='AUTOR'] > a.jstree-anchor {
                background-color: rgba(168, 196, 230, 0.72) !important;
            }

            /* PARTE PASSIVA (REU) - Vermelho (#E8B0B0 / rgba(232, 176, 176, 0.72)) */
            #divArvore:not([data-azflow-bv-reu='0']) li[evento='true'][data-superproc-cor='REU'] > i.jstree-ocl,
            #divArvore:not([data-azflow-bv-reu='0']) li[evento='true'][data-superproc-cor='REU'] > a.jstree-anchor {
                background-color: rgba(232, 176, 176, 0.72) !important;
            }

            /* MINISTÉRIO PÚBLICO (MP) - Amarelo (#E2CFA0 / rgba(226, 207, 160, 0.72)) */
            #divArvore:not([data-azflow-bv-mp='0']) li[evento='true'][data-superproc-cor='MP'] > i.jstree-ocl,
            #divArvore:not([data-azflow-bv-mp='0']) li[evento='true'][data-superproc-cor='MP'] > a.jstree-anchor {
                background-color: rgba(226, 207, 160, 0.72) !important;
            }

            /* DESPACHO / DECISÃO - Verde Oliva (#B5C78E / rgba(181, 199, 142, 0.72)) */
            #divArvore:not([data-azflow-bv-desp='0']) li[evento='true'][data-superproc-cor='DESPACHO'] > i.jstree-ocl,
            #divArvore:not([data-azflow-bv-desp='0']) li[evento='true'][data-superproc-cor='DESPACHO'] > a.jstree-anchor {
                background-color: rgba(181, 199, 142, 0.72) !important;
            }

            /* SENTENÇA - Verde Oliva (#B5C78E) */
            #divArvore:not([data-azflow-bv-sent='0']) li[evento='true'][data-superproc-cor='SENTENCA'] > i.jstree-ocl,
            #divArvore:not([data-azflow-bv-sent='0']) li[evento='true'][data-superproc-cor='SENTENCA'] > a.jstree-anchor {
                background-color: rgba(181, 199, 142, 0.72) !important;
            }

            /* ÍCONE AZUL DE LINK RÁPIDO (Cópia Direta 'evento X') */
            #divArvore li[seqdoc] > a.jstree-anchor .superproc-card-link-rapido {
                display: inline-table !important;
                position: static !important;
                margin-left: 5px !important;
                margin-right: 2px !important;
                vertical-align: middle !important;
            }
            #divArvore li[seqdoc] > a.jstree-anchor .superproc-btn-link-rapido {
                display: inline-flex !important;
                align-items: center !important;
                text-decoration: none !important;
                cursor: pointer !important;
            }
            #divArvore li[seqdoc] > a.jstree-anchor .superproc-link-icon-blue {
                display: inline-block !important;
                width: 13px !important;
                height: 13px !important;
                vertical-align: middle !important;
                position: relative !important;
                top: 1px !important;
                filter: hue-rotate(115deg) saturate(1.8) brightness(0.95);
                cursor: pointer !important;
                transition: transform 0.12s ease, filter 0.12s ease !important;
            }
            #divArvore li[seqdoc] > a.jstree-anchor .superproc-link-icon-blue:hover {
                transform: scale(1.18);
                filter: hue-rotate(115deg) saturate(2.5) brightness(1.1);
            }
        `;
        document.head.appendChild(style);
    }

    // Extrai o número do evento a partir do elemento liEvento
    function extrairNumeroEvento(liEvento) {
        if (!liEvento) return "";
        try {
            const u = liEvento.querySelector("a.jstree-anchor u");
            if (u) {
                const mU = String(u.textContent || "").match(/\((\d+)\)/);
                if (mU) return mU[1];
            }
            const liId = String(liEvento.id || "");
            const mId = liId.match(/(\d+)$/);
            if (mId && liId.indexOf("evt") === 0) return mId[1];

            const img = liEvento.querySelector('img[id^="evtRelevante"]');
            if (img) {
                const mImg = String(img.id || "").match(/evtRelevante(\d+)/);
                if (mImg) return mImg[1];
            }

            const anchor = liEvento.querySelector("a.jstree-anchor");
            if (anchor) {
                const mTxt = String(anchor.textContent || "").match(/^\s*\(?(\d+)\)?/);
                if (mTxt) return mTxt[1];
            }
        } catch (_) {}
        return "";
    }

    // Normaliza texto para comparações
    function normalizar(str) {
        return String(str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    // Determina a classificação do liEvento
    function identificarClassificacaoEvento(liEvento) {
        const numEv = extrairNumeroEvento(liEvento);

        // 1. Verifica se o AZflow já marcou polo explicitamente no liEvento
        const parteAttr = String(liEvento.getAttribute("data-azflow-parte") || "").toUpperCase().trim();
        if (parteAttr === "AUTOR" || parteAttr === "REU" || parteAttr === "MP") {
            return parteAttr;
        }

        // 2. Consulta o cache de partes sincronizado via BroadcastChannel ou espelho da Capa
        if (numEv && mapaPartesCache[numEv]) {
            const parteMapa = String(mapaPartesCache[numEv]).toUpperCase().trim();
            if (parteMapa === "AUTOR" || parteMapa === "REU" || parteMapa === "MP") {
                return parteMapa;
            }
        }

        // 3. Verifica os documentos filhos (seqdoc) pertencentes a este evento
        const docs = liEvento.querySelectorAll("li[seqdoc]");
        for (let i = 0; i < docs.length; i++) {
            const docLi = docs[i];

            // Sentença
            const icone = String(docLi.getAttribute("data-azflow-icone") || "");
            if (icone.startsWith("sentenca")) {
                return "SENTENCA";
            }

            // Despacho ou Decisão
            if (docLi.hasAttribute("data-azflow-despacho") || icone.startsWith("despadec")) {
                return "DESPACHO";
            }

            // Siglas técnicas nos links
            const docAnchor = docLi.querySelector("a[id^='eventoDocumento_']");
            if (docAnchor) {
                const links = String((docAnchor.getAttribute("onclick") || "") + " " + (docAnchor.getAttribute("href") || "")).toUpperCase();
                if (/\bSENT(ENC|\d|\b)/.test(links)) return "SENTENCA";
                if (/\b(DESPADEC|TERMOAUD|EXTRATOATA)\b/.test(links)) return "DESPACHO";

                const label = normalizar(docAnchor.getAttribute("aria-label") || docAnchor.textContent);
                if (/^sentenca\b/.test(label)) return "SENTENCA";
                if (/^(despacho(\/decisao)?|decisao|termo de audiencia|extrato de ata)\b/.test(label)) return "DESPACHO";
            }
        }

        // 4. Consulta o cache de ícones do AZflow
        if (numEv && mapaIconesCache[numEv]) {
            const iconeEv = String(mapaIconesCache[numEv]);
            if (iconeEv.startsWith("sentenca")) return "SENTENCA";
            if (iconeEv.startsWith("despadec")) return "DESPACHO";
        }

        // 5. Avalia a descrição textual do próprio evento raiz
        const anchor = liEvento.querySelector("a.jstree-anchor");
        if (anchor) {
            const txt = normalizar(anchor.textContent);
            if (/^(\(\d+\)\s*-\s*)?sentenca\b/.test(txt)) return "SENTENCA";
            if (/^(\(\d+\)\s*-\s*)?(despacho(\/decisao)?|decisao)\b/.test(txt)) return "DESPACHO";
            if (txt.includes("embargos de declaracao acolhidos") || txt.includes("embargos de declaracao rejeitados")) return "DESPACHO";
        }

        return null;
    }

    // Aplica a cor no nó do evento
    function aplicarNoEvento(liEvento) {
        if (!liEvento || liEvento.getAttribute("evento") !== "true") return;

        const classificacao = identificarClassificacaoEvento(liEvento);
        const atual = liEvento.getAttribute("data-superproc-cor");

        if (classificacao) {
            if (atual !== classificacao) {
                liEvento.setAttribute("data-superproc-cor", classificacao);
            }
        } else {
            if (atual) {
                liEvento.removeAttribute("data-superproc-cor");
            }
        }
    }

    // Exibe toast leve de confirmação da cópia
    function mostrarFeedbackCopiado(elemento, texto) {
        try {
            const anterior = document.querySelector('.superproc-toast-link-copiado');
            if (anterior) anterior.remove();

            const toast = document.createElement('div');
            toast.className = 'superproc-toast-link-copiado';
            toast.textContent = `Link "${texto}" copiado!`;

            const rect = elemento.getBoundingClientRect();
            const top = Math.max(10, rect.top - 32);
            const left = Math.max(10, rect.left - 30);

            toast.style.cssText = `
                position: fixed;
                top: ${top}px;
                left: ${left}px;
                background: #0f172a;
                color: #38bdf8;
                font-size: 11px;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                padding: 4px 10px;
                border-radius: 6px;
                border: 1px solid rgba(56, 189, 248, 0.35);
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                z-index: 2147483647;
                pointer-events: none;
                opacity: 0;
                transform: translateY(4px);
                transition: opacity 0.15s ease, transform 0.15s ease;
            `;

            document.body.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-4px)';
                setTimeout(() => toast.remove(), 200);
            }, 1300);
        } catch (_) {}
    }

    // Copia o elemento span completo para a área de transferência (text/html e text/plain)
    function copiarLinkRapido(htmlStr, triggerEl, numEvento) {
        const onCopy = (e) => {
            e.clipboardData.setData('text/html', htmlStr);
            e.clipboardData.setData('text/plain', htmlStr);
            e.preventDefault();
        };
        document.addEventListener('copy', onCopy);
        try {
            document.execCommand('copy');
        } catch (_) {}
        finally {
            document.removeEventListener('copy', onCopy);
        }

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(htmlStr).catch(() => {});
            }
        } catch (_) {}

        mostrarFeedbackCopiado(triggerEl, `evento ${numEvento}`);
    }

    // Injeta o botão azul de cópia rápida no formato "evento X"
    function injetarIconeLinkRapido(copyDiv) {
        if (!copyDiv || copyDiv.querySelector('.superproc-card-link-rapido')) return;

        const cardSpan = copyDiv.querySelector('span[id^="card"]');
        if (!cardSpan) return;

        const wrapper = document.createElement('span');
        wrapper.className = 'superproc-card-link-rapido';

        const btn = document.createElement('a');
        btn.href = 'javascript:void(0);';
        btn.className = 'superproc-btn-link-rapido';
        btn.setAttribute('aria-label', 'Copiar link rápido formato evento X');
        btn.title = 'Copiar link rápido: evento X (Use CTRL+V no editor)';

        const img = document.createElement('img');
        img.src = 'imagens/linkeditor.png';
        img.alt = 'Copiar evento X';
        img.className = 'superproc-link-icon-blue';

        btn.appendChild(img);
        wrapper.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 1. Localiza os dados do documento no widgetlinkdocumento irmão
            const widgetSpan = copyDiv.querySelector('.widgetlinkdocumento');
            if (!widgetSpan) return;

            // 2. Extrai número do evento
            let numEvento = '';
            const mEv = String(widgetSpan.textContent || '').match(/evento\s+(\d+)/i);
            if (mEv) {
                numEvento = mEv[1];
            } else {
                const liEv = copyDiv.closest("li[evento='true']");
                numEvento = extrairNumeroEvento(liEv);
            }
            if (!numEvento) numEvento = '1';

            // 3. Clona o span original preservando todos os atributos (data-iddocumento, data-target, etc.)
            const spanClone = widgetSpan.cloneNode(false);
            spanClone.textContent = `evento ${numEvento}`;
            const htmlStr = spanClone.outerHTML;

            // 4. Copia o span exato para o clipboard
            copiarLinkRapido(htmlStr, btn, numEvento);
        });

        // Insere logo após o card original do link verde
        cardSpan.parentNode.insertBefore(wrapper, cardSpan.nextSibling);
    }

    // Processa todos os nós de evento presentes na árvore e botões de link
    function processarTodosEventos() {
        const divArvore = document.getElementById("divArvore");
        if (!divArvore) return;

        // 1. Colore eventos raiz
        const eventos = divArvore.querySelectorAll("li[evento='true']");
        for (let i = 0; i < eventos.length; i++) {
            aplicarNoEvento(eventos[i]);
        }

        // 2. Injeta botão azul de link rápido nos documentos
        const copyDivs = divArvore.querySelectorAll("[id^='imgCopyLinkDoc_']");
        for (let j = 0; j < copyDivs.length; j++) {
            injetarIconeLinkRapido(copyDivs[j]);
        }
    }

    function agendarProcessamento() {
        if (updatePending) return;
        updatePending = true;
        requestAnimationFrame(() => {
            updatePending = false;
            processarTodosEventos();
        });
    }

    // Escuta o canal do AZflow para receber o espelho da capa
    function conectarBroadcastChannel() {
        try {
            if (typeof BroadcastChannel === "undefined") return;
            const canal = new BroadcastChannel(CANAL_ESPELHO);
            canal.onmessage = (ev) => {
                if (ev && ev.data && ev.data.tipo === "azflowEventosEspelho") {
                    if (ev.data.partes && typeof ev.data.partes === "object") {
                        Object.assign(mapaPartesCache, ev.data.partes);
                    }
                    if (ev.data.icones && typeof ev.data.icones === "object") {
                        Object.assign(mapaIconesCache, ev.data.icones);
                    }
                    agendarProcessamento();
                }
            };
            // Solicita envio do espelho caso a capa já esteja carregada
            canal.postMessage({ tipo: "azflowEventosEspelhoPedido" });
        } catch (_) {}
    }

    // Inicia observador de mutações na árvore
    function iniciarObserver() {
        const divArvore = document.getElementById("divArvore");
        if (!divArvore) {
            setTimeout(iniciarObserver, 300);
            return;
        }

        injetarEstilos();
        conectarBroadcastChannel();
        processarTodosEventos();

        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            let precisaAtualizar = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === "childList" && m.addedNodes.length > 0) {
                    precisaAtualizar = true;
                    break;
                }
                if (m.type === "attributes") {
                    const attr = m.attributeName;
                    if (attr === "data-azflow-parte" || 
                        attr === "data-azflow-despacho" || 
                        attr === "data-azflow-icone" ||
                        attr === "class") {
                        precisaAtualizar = true;
                        break;
                    }
                }
            }
            if (precisaAtualizar) {
                agendarProcessamento();
            }
        });

        observer.observe(divArvore, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "data-azflow-parte",
                "data-azflow-despacho",
                "data-azflow-icone",
                "data-azflow-bv-autor",
                "data-azflow-bv-reu",
                "data-azflow-bv-mp",
                "data-azflow-bv-desp",
                "data-azflow-bv-sent",
                "class"
            ]
        });
    }

    // Inicialização com tolerância a carregamento assíncrono do JSTree
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarObserver);
    } else {
        iniciarObserver();
    }
