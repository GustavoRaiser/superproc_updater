// Árvore - Colorida Dinâmica (camada: host; mundo isolado 1110, na árvore de documentos e na capa do processo).
// Chave em CFG > Configurações ("Árvore - Colorida Dinâmica", arvoreColorida). Parte nativa do módulo da extensão (extensao-superproc/modules/arvore/arvore_colorida.js):
// mesmo comportamento e mesmos dados (localStorage do eproc). Se a extensão também estiver instalada, o navegador publica o id do
// módulo em <html data-superproc-navegador-modulos> e a extensão fica parada (CONTROLADO PELO NAVEGADOR): nada duplica.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spArvoreColorida) return;
window.__spArvoreColorida = true;
if (!["arvore_documento_listar","processo_selecionar"].includes(new URLSearchParams(location.search).get('acao'))) return;

    const STORAGE_KEY = 'EPROC_ARVORE_REGRAS_CORES_V1';

    const REGRAS_PADRAO = {
        "mandado": { bg: "#87ceeb", tx: "#000000" },
        "sentenca": { bg: "#000000", tx: "#ffffff" },
        "cnib": { bg: "#d8bfd8", tx: "#000000" },
        "prevjud": { bg: "#faebd7", tx: "#000000" },
        "sniper": { bg: "#faebd7", tx: "#000000" },
        "petição inicial": { bg: "#007bff", tx: "#ffffff" },
        "réplica": { bg: "#007bff", tx: "#ffffff" },
        "contestação": { bg: "#dc3545", tx: "#ffffff" },
        "embargos de declaração": { bg: "#6f42c1", tx: "#ffffff" },
        "exceção de pré-executividade": { bg: "#fd7e14", tx: "#ffffff" },
        "ofício": { bg: "#e3e3e3", tx: "#000000" },
        "despacho": { bg: "inherit", tx: "#000000", inherit: true },
        "emenda da inicial": { bg: "#007bff", tx: "#ffffff" },
        "pagamento de custas": { bg: "#28a745", tx: "#ffffff" },
        "petição": { bg: "inherit", tx: "#000000", inherit: true },
        "procuração": { bg: "#d4d4d4", tx: "#000000" },
        "contrafé": { bg: "#87ceeb", tx: "#000000" },
        "nomeação de bens": { bg: "#dc3545", tx: "#ffffff" },
        "extrato de subconta": { bg: "#ffc107", tx: "#212529" },
        "infojud": { bg: "#faebd7", tx: "#000000" },
        "renajud": { bg: "#faebd7", tx: "#000000" },
        "serasajud": { bg: "#faebd7", tx: "#000000" },
        "extrato sisbajud": { bg: "#fef6ec", tx: "#000000" },
        "sisbajud": { bg: "#faebd7", tx: "#000000" },
        "confirmação de pagamento de alvara": { bg: "#75a829", tx: "#000000" },
        "alvará de levantamento": { bg: "#81a44c", tx: "#000000" },
        "auto": { bg: "#a8d4e6", tx: "#000000" },
        "decisão": { bg: "inherit", tx: "#000000", inherit: true },
        "laudo": { bg: "#ffc107", tx: "#212529" },
        "apelação": { bg: "inherit", tx: "#000000", inherit: true },
        "parecer": { bg: "inherit", tx: "#000000", inherit: true },
        "juntada de mandado": { bg: "#87ceeb", tx: "#000000" },
        "pesquisa negativa renajud": { bg: "#d8bfd8", tx: "#000000" },
        "pesquisa positiva renajud": { bg: "#d8bfd8", tx: "#000000" },
        "consulta/extrato renajud": { bg: "#d8bfd8", tx: "#000000" },
        "consulta/extratorenajud": { bg: "#d8bfd8", tx: "#000000" },
        "retirada de restricao renajud": { bg: "#d8bfd8", tx: "#000000" },
        "inclusao de restricao renajud": { bg: "#d8bfd8", tx: "#000000" },
        "detalhamento sisbajud": { bg: "#faebd7", tx: "#000000" },
        "termo": { bg: "#d8bfd8", tx: "#000000" },
        "consulta infojud": { bg: "#faebd7", tx: "#000000" },
        "consulta/extrato infojud": { bg: "#faebd7", tx: "#000000" },
        "consulta/extratoinfojud": { bg: "#faebd7", tx: "#000000" },
        "extrato infojud": { bg: "#faebd7", tx: "#000000" },
        "consulta/extratocnib": { bg: "#d8bfd8", tx: "#000000" },
        "extratocnib": { bg: "#d8bfd8", tx: "#000000" }
    };

    const PALETA = [
        { bg: '#87ceeb', tx: '#000000', label: 'SkyBlue' },
        { bg: '#d8bfd8', tx: '#000000', label: 'Thistle' },
        { bg: '#faebd7', tx: '#000000', label: 'AntiqueWhite' },
        { bg: '#a9a9a9', tx: '#ffffff', label: 'DarkGray' },
        { bg: '#000000', tx: '#ffffff', label: 'Black' },
        { bg: '#28a745', tx: '#ffffff', label: 'Verde' },
        { bg: '#dc3545', tx: '#ffffff', label: 'Vermelho' },
        { bg: '#ffc107', tx: '#212529', label: 'Amarelo' },
        { bg: '#fd7e14', tx: '#ffffff', label: 'Laranja' },
        { bg: '#6f42c1', tx: '#ffffff', label: 'Roxo' },
        { bg: '#20c997', tx: '#ffffff', label: 'Teal' },
        { bg: '#007bff', tx: '#ffffff', label: 'Azul' }
    ];

    function carregarConfiguracoes() {
        try {
            const val = localStorage.getItem(STORAGE_KEY);
            return val ? JSON.parse(val) : REGRAS_PADRAO;
        } catch (e) {
            return REGRAS_PADRAO;
        }
    }

    function salvarConfiguracoes(dados) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        } catch (e) {}
    }

    let regrasAtivas = carregarConfiguracoes();

    function injetarCSSGlobal() {
        if (document.getElementById("estilo-fix-arvore-eproc")) return;
        const style = document.createElement("style");
        style.id = "estilo-fix-arvore-eproc";
        style.innerHTML = `
            #divArvore a.jstree-anchor,
            #divArvore a.jstree-anchor:visited,
            #divArvore a.jstree-anchor:active {
                color: #000000 !important;
            }
            #divArvore a.jstree-anchor span {
                color: inherit !important;
            }
        `;
        document.head.appendChild(style);
    }

    function normalizarTexto(txt) {
        return (txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    function eEventoNumerado(textoOriginal) {
        const txt = textoOriginal.trim();
        const regexEventoNumerado = /^(\s*\(\d+\)|\s*\d+[\.\-\s]|\s*evento\s*\d+)/i;
        const regexData = /\d{2}\/\d{2}\/\d{4}/;
        return regexEventoNumerado.test(txt) || regexData.test(txt);
    }

    const CORES_EVENTO = {
        'AUTOR': { bg: 'rgba(168, 196, 230, 0.72)', tx: '#000000' },
        'REU': { bg: 'rgba(232, 176, 176, 0.72)', tx: '#000000' },
        'MP': { bg: 'rgba(226, 207, 160, 0.72)', tx: '#000000' },
        'DESPACHO': { bg: 'rgba(181, 199, 142, 0.72)', tx: '#000000' },
        'SENTENCA': { bg: 'rgba(181, 199, 142, 0.72)', tx: '#000000' }
    };

    function obterCorDoEventoPai(liPai) {
        if (!liPai) return null;

        // 1. data-superproc-cor do módulo de evento raiz
        const corSuperproc = liPai.getAttribute('data-superproc-cor');
        if (corSuperproc && CORES_EVENTO[corSuperproc]) {
            return CORES_EVENTO[corSuperproc];
        }

        // 2. data-azflow-parte (AUTOR / REU / MP)
        const parte = String(liPai.getAttribute('data-azflow-parte') || '').toUpperCase().trim();
        if (parte && CORES_EVENTO[parte]) {
            return CORES_EVENTO[parte];
        }

        // 3. Documentos filhos que sejam despacho ou sentença
        if (liPai.querySelector("li[seqdoc][data-azflow-despacho='1'], li[seqdoc][data-azflow-icone^='despadec']")) {
            return CORES_EVENTO['DESPACHO'];
        }
        if (liPai.querySelector("li[seqdoc][data-azflow-icone^='sentenca']")) {
            return CORES_EVENTO['SENTENCA'];
        }

        // 4. Texto do evento pai
        const anchorPai = liPai.querySelector(":scope > a.jstree-anchor");
        if (anchorPai) {
            const txtPai = normalizarTexto(anchorPai.textContent);
            if (/^(\(\d+\)\s*-\s*)?sentenca\b/.test(txtPai)) return CORES_EVENTO['SENTENCA'];
            if (/^(\(\d+\)\s*-\s*)?(despacho(\/decisao)?|decisao)\b/.test(txtPai)) return CORES_EVENTO['DESPACHO'];
            if (txtPai.includes('embargos de declaracao acolhidos') || txtPai.includes('embargos de declaracao rejeitados')) return CORES_EVENTO['DESPACHO'];
        }

        return null;
    }

    function aplicarEstilo(elementoAnchor, regra, liPai) {
        let bg = regra.bg;
        let corTexto = regra.tx;

        if (bg === "inherit" || regra.inherit) {
            const herdada = obterCorDoEventoPai(liPai);
            if (herdada) {
                bg = herdada.bg;
                corTexto = herdada.tx || "#000000";
            } else {
                limparEstilo(elementoAnchor);
                return;
            }
        } else if (!corTexto) {
            corTexto = calcularCorTexto(bg);
        }

        elementoAnchor.style.setProperty("background-color", bg, "important");
        elementoAnchor.style.setProperty("color", corTexto, "important");
        elementoAnchor.style.setProperty("border-radius", "4px", "important");
        elementoAnchor.style.setProperty("padding-right", "6px", "important");
        elementoAnchor.style.setProperty("padding-left", "4px", "important");

        const spans = elementoAnchor.querySelectorAll("span");
        spans.forEach(span => span.removeAttribute("style"));
    }

    function limparEstilo(elementoAnchor) {
        elementoAnchor.style.removeProperty("background-color");
        elementoAnchor.style.removeProperty("border-radius");
        elementoAnchor.style.removeProperty("padding-right");
        elementoAnchor.style.removeProperty("padding-left");
        elementoAnchor.style.setProperty("color", "#000000", "important");

        const spans = elementoAnchor.querySelectorAll("span");
        spans.forEach(span => span.removeAttribute("style"));
    }

    function calcularCorTexto(hexColor) {
        if (!hexColor || !hexColor.startsWith('#')) return '#000000';
        const r = parseInt(hexColor.substr(1, 2), 16) || 0;
        const g = parseInt(hexColor.substr(3, 2), 16) || 0;
        const b = parseInt(hexColor.substr(5, 2), 16) || 0;
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 128 ? '#000000' : '#ffffff';
    }

    let termosNormalizados = [];
    function prepararRegras() {
        termosNormalizados = Object.entries(regrasAtivas).map(([termo, regra]) => [normalizarTexto(termo), regra]);
    }
    prepararRegras();

    // Cada anchor é processado uma vez, com a sublista mais próxima (a última
    // que o algoritmo antigo visitava ao percorrer listas aninhadas).
    function colorirItem(a) {
        const li = a.parentElement;
        if (!li || li.tagName !== 'LI') return;
        const lista = li.parentElement?.closest('ul.jstree-children');
        if (!lista || !arvore.contains(lista)) {
            if (li.matches("[evento='true']") || li.parentElement?.parentElement === arvore) {
                if (eEventoNumerado(a.textContent)) limparEstilo(a);
                else if (normalizarTexto(a.textContent).includes('juntada de mandado') && regrasAtivas['juntada de mandado']) {
                    aplicarEstilo(a, regrasAtivas['juntada de mandado']);
                }
            }
            return;
        }
        if (eEventoNumerado(a.textContent)) { limparEstilo(a); return; }
        const liPai = lista.closest('li');
        const textoPai = normalizarTexto(liPai?.querySelector(':scope > a.jstree-anchor')?.textContent);
        const texto = normalizarTexto(a.textContent);
        let regra = null;
        for (const [termo, valor] of termosNormalizados) {
            if (!termo || !texto.includes(termo)) continue;
            if (termo === 'mandado' && !textoPai.includes('expedicao de mandado')) continue;
            regra = valor;
            break;
        }
        regra ||= regrasAtivas['*'] || regrasAtivas['[todos]'];
        if (regra) aplicarEstilo(a, regra, liPai);
        else limparEstilo(a);
    }

    function colorirRamo(raiz) {
        if (raiz.matches('a.jstree-anchor')) colorirItem(raiz);
        raiz.querySelectorAll('a.jstree-anchor').forEach(colorirItem);
    }

    // A paleta continua chamando esta função: alterações de regras invalidam
    // toda a árvore, enquanto mutações normais invalidam apenas um ramo.
    function aplicarColoracao() {
        prepararRegras();
        completa = true;
        agendar();
    }

    function injetarBotaoPaleta() {
        if (document.getElementById("btn-abrir-paleta-arvore")) return;

        const containerIntervalo = document.getElementById("divIntervaloEvento");
        if (!containerIntervalo) return;

        const btnMarcar = containerIntervalo.querySelector("a[onclick*='marcarIntervaloEvento']");
        if (!btnMarcar) return;

        const btnPaleta = document.createElement("a");
        btnPaleta.id = "btn-abrir-paleta-arvore";
        btnPaleta.href = "javascript:void(0);";
        btnPaleta.title = "Gerenciar Cores dos Documentos";
        btnPaleta.className = "infraButton azflow-tree-interval-btn";

        Object.assign(btnPaleta.style, {
            marginLeft: "6px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            borderRadius: "8px",
            padding: "0px 8px",
            height: "27px",
            lineHeight: "27px",
            boxShadow: "rgba(0, 0, 0, 0.22) 0px 1px 1px 0px inset",
            textDecoration: "none",
            cursor: "pointer",
            boxSizing: "border-box",
            verticalAlign: "middle"
        });

        btnPaleta.innerHTML = `
            <svg style="width: 15px; height: 15px; fill: #ffffff; opacity: 0.9;" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10 0.88 0 1.6 -0.72 1.6 -1.6 0 -0.41 -0.17 -0.79 -0.44 -1.06 -0.27 -0.27 -0.44 -0.65 -0.44 -1.06 0 -0.88 0.72 -1.6 1.6 -1.6h1.88c3.73 0 6.8 -3.07 6.8 -6.8C22 5.92 17.52 2 12 2zm-5.5 9c-0.83 0-1.5 -0.67 -1.5 -1.5S5.67 8 6.5 8s1.5 0.67 1.5 1.5S7.33 11 6.5 11zm3 -4c-0.83 0-1.5 -0.67 -1.5 -1.5S8.67 4 9.5 4s1.5 0.67 1.5 1.5S10.33 7 9.5 7zm5 0c-0.83 0-1.5 -0.67 -1.5 -1.5S13.67 4 14.5 4s1.5 0.67 1.5 1.5S15.33 7 14.5 7zm3 4c-0.83 0-1.5 -0.67 -1.5 -1.5S16.67 8 17.5 8s1.5 0.67 1.5 1.5S18.33 11 17.5 11z"/>
            </svg>
        `;

        btnPaleta.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            abrirModalGerenciador();
        };

        btnMarcar.insertAdjacentElement('afterend', btnPaleta);
    }

    function abrirModalGerenciador() {
        const modalId = "modal-gerenciador-arvore";
        const antigo = document.getElementById(modalId);
        if (antigo) antigo.remove();
        const antigoBackdrop = document.getElementById("modal-gerenciador-backdrop");
        if (antigoBackdrop) antigoBackdrop.remove();

        const modal = document.createElement("div");
        modal.id = modalId;
        Object.assign(modal.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "460px",
            maxHeight: "88vh",
            background: "#ffffff",
            borderRadius: "10px",
            boxShadow: "0 10px 35px rgba(0,0,0,0.3)",
            zIndex: "9999999",
            display: "flex",
            flexDirection: "column",
            fontFamily: '"Segoe UI", Tahoma, sans-serif',
            border: "1px solid #ced4da"
        });

        let corSelecionada = PALETA[0].bg;
        let corTextoSelecionada = PALETA[0].tx;
        let termoEmEdicao = null;

        const CORES_EXTENDIDAS = [
            '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0284c7', '#0369a1',
            '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#16a34a', '#15803d',
            '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#d97706', '#b45309',
            '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#dc2626', '#b91c1c',
            '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#9333ea', '#7e22ce'
        ];

        function moverTermo(termo, direcao) {
            const keys = Object.keys(regrasAtivas);
            const idx = keys.indexOf(termo);
            if (idx < 0) return;
            const novoIdx = idx + direcao;
            if (novoIdx < 0 || novoIdx >= keys.length) return;
            const temp = keys[idx];
            keys[idx] = keys[novoIdx];
            keys[novoIdx] = temp;
            const novoObj = {};
            keys.forEach(k => { novoObj[k] = regrasAtivas[k]; });
            regrasAtivas = novoObj;
            salvarConfiguracoes(regrasAtivas);
            renderListaTermos();
            aplicarColoracao();
        }

        function renderListaTermos() {
            const containerLista = modal.querySelector("#lista-termos-container");
            if (!containerLista) return;

            containerLista.innerHTML = "";
            const keys = Object.keys(regrasAtivas);

            if (keys.length === 0) {
                containerLista.innerHTML = `<div style="text-align: center; color: #888; padding: 15px; font-size: 13px;">Nenhum termo cadastrado.</div>`;
                return;
            }

            keys.forEach((termo, idx) => {
                const conf = regrasAtivas[termo];
                const isInherit = conf.bg === "inherit" || conf.inherit;
                const isFirst = idx === 0;
                const isLast = idx === keys.length - 1;
                const isEditing = termoEmEdicao === termo;

                const item = document.createElement("div");
                Object.assign(item.style, {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    margin: "4px 0",
                    borderRadius: "6px",
                    backgroundColor: isEditing ? "#e0f2fe" : "#f8f9fa",
                    border: isEditing ? "1px solid #7dd3fc" : "1px solid #e9ecef",
                    gap: "8px",
                    transition: "all 0.15s ease"
                });

                const swatchHtml = isInherit
                    ? `<span style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: linear-gradient(135deg, #A8C4E6 50%, #E8B0B0 50%); border: 1px solid rgba(0,0,0,0.25); flex-shrink: 0;" title="Herda a cor do evento pai"></span>`
                    : `<span style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background-color: ${conf.bg}; border: 1px solid rgba(0,0,0,0.15); flex-shrink: 0;"></span>`;

                const labelHtml = isInherit
                    ? `<span style="font-size: 13px; font-weight: 500; color: #333;" title="${termo}">${termo} <span style="font-size: 11px; color: #0284c7; font-weight: 600;">(herda)</span></span>`
                    : `<span style="font-size: 13px; font-weight: 500; color: #333;" title="${termo}">${termo}</span>`;

                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">
                        ${swatchHtml}
                        ${labelHtml}
                    </div>
                    <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
                        <button type="button" class="btn-subir-termo btn-arvore-acao" data-termo="${termo}" style="background: #fff; border: 1px solid #ced4da; color: #495057; font-size: 10px; cursor: ${isFirst ? 'not-allowed' : 'pointer'}; opacity: ${isFirst ? '0.35' : '1'}; padding: 2px 5px; border-radius: 4px; line-height: 1.2;" title="Mover para cima (maior prioridade)" ${isFirst ? 'disabled' : ''}>▲</button>
                        <button type="button" class="btn-descer-termo btn-arvore-acao" data-termo="${termo}" style="background: #fff; border: 1px solid #ced4da; color: #495057; font-size: 10px; cursor: ${isLast ? 'not-allowed' : 'pointer'}; opacity: ${isLast ? '0.35' : '1'}; padding: 2px 5px; border-radius: 4px; line-height: 1.2;" title="Mover para baixo (menor prioridade)" ${isLast ? 'disabled' : ''}>▼</button>
                        <button type="button" class="btn-edit-termo btn-arvore-acao" data-termo="${termo}" style="background: #fff; border: 1px solid #ced4da; color: #0284c7; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1.2;" title="Editar termo">✎</button>
                        <button type="button" class="btn-del-termo btn-arvore-acao" data-termo="${termo}" style="background: #fff; border: 1px solid #ced4da; color: #dc3545; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1.2;" title="Remover termo">✖</button>
                    </div>
                `;

                item.querySelector(".btn-subir-termo").onclick = (e) => {
                    e.stopPropagation();
                    moverTermo(termo, -1);
                };

                item.querySelector(".btn-descer-termo").onclick = (e) => {
                    e.stopPropagation();
                    moverTermo(termo, 1);
                };

                item.querySelector(".btn-edit-termo").onclick = (e) => {
                    e.stopPropagation();
                    iniciarEdicao(termo);
                };

                item.querySelector(".btn-del-termo").onclick = (e) => {
                    e.stopPropagation();
                    const tDel = e.currentTarget.getAttribute("data-termo");
                    if (termoEmEdicao === tDel) {
                        cancelarEdicao();
                    }
                    delete regrasAtivas[tDel];
                    salvarConfiguracoes(regrasAtivas);
                    renderListaTermos();
                    aplicarColoracao();
                };

                containerLista.appendChild(item);
            });
        }

        let htmlPaleta = '<div style="display:grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 8px;">';
        PALETA.forEach((c, idx) => {
            const isSelected = idx === 0;
            htmlPaleta += `<div class="cor-box-pick" data-bg="${c.bg}" data-tx="${c.tx}" style="height: 24px; background:${c.bg}; cursor:pointer; border:${isSelected ? '2px solid #000' : '1px solid #ced4da'}; border-radius:4px;" title="${c.label}"></div>`;
        });
        htmlPaleta += '</div>';

        let htmlSugestoesPersonalizadas = '';
        CORES_EXTENDIDAS.forEach(c => {
            htmlSugestoesPersonalizadas += `<div class="popover-swatch-item" data-cor="${c}" style="height: 22px; background-color: ${c}; border-radius: 4px; cursor: pointer; border: 1px solid rgba(0,0,0,0.15);" title="${c}"></div>`;
        });

        modal.innerHTML = `
            <style>
                .btn-arvore-acao:hover:not(:disabled) {
                    background-color: #e9ecef !important;
                }
                .popover-swatch-item:hover {
                    transform: scale(1.1);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                    z-index: 2;
                }
            </style>
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 16px; border-bottom: 1px solid #dee2e6;">
                <span style="font-weight: bold; font-size: 15px; color: #212529;">Paleta de Cores da Árvore</span>
                <button id="modal-arvore-close" style="background:transparent; border:none; font-size: 18px; cursor:pointer; color:#888;">✕</button>
            </div>

            <div style="padding: 14px 16px; overflow-y: auto; flex: 1; position: relative;">
                <div style="background: #f1f3f5; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px;">
                    <label id="lbl-termo-acao" style="font-size: 12px; font-weight: 600; color: #495057; display: block; margin-bottom: 4px;">ADICIONAR TERMO / EXPRESSÃO:</label>
                    <input type="text" id="in-novo-termo" placeholder="Ex: conclusao, mandado, penhora" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px; border: 1px solid #ced4da; border-radius: 4px;">

                    <label style="font-size: 12px; font-weight: 600; color: #495057; display: block; margin-top: 10px;">SELECIONE A COR:</label>
                    ${htmlPaleta}

                    <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <button type="button" id="btn-abrir-personalizada" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: #ffffff; color: #495057; border: 1px solid #ced4da; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;" title="Escolher cor personalizada">
                            <span id="swatch-personalizada" style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background-color: #87ceeb; border: 1px solid rgba(0,0,0,0.2);"></span>
                            <span>Personalizada ▾</span>
                        </button>
                        <button type="button" id="btn-cor-herdar" style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: #e9ecef; color: #495057; border: 1px solid #ced4da; border-radius: 6px; cursor: pointer; transition: all 0.15s ease;" title="Herda a cor do evento pai (Autor, Réu, MP, Despacho, etc.)">
                            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: linear-gradient(135deg, #A8C4E6 50%, #E8B0B0 50%); border: 1px solid rgba(0,0,0,0.2);"></span>
                            Herdar do evento
                        </button>
                    </div>

                    <button id="btn-add-termo" style="margin-top: 10px; width: 100%; padding: 8px; background: #28a745; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer;">+ ADICIONAR TERMO</button>
                    <button id="btn-cancel-edit" type="button" style="display: none; margin-top: 6px; width: 100%; padding: 6px; background: #6c757d; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 11px; cursor: pointer;">✕ CANCELAR EDIÇÃO</button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 12px; font-weight: bold; color: #495057;">TERMOS ATIVOS:</span>
                    <span style="font-size: 11px; color: #6c757d;">Ordem de prioridade (topo = maior)</span>
                </div>
                <div id="lista-termos-container" style="max-height: 220px; overflow-y: auto; padding-right: 4px;"></div>

                <!-- Popover Cor Personalizada -->
                <div id="popover-personalizada" style="display: none; position: absolute; top: 12px; left: 14px; right: 14px; background: #ffffff; border: 1px solid #ced4da; border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.35); padding: 12px 14px; z-index: 10000005;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #e9ecef; padding-bottom: 6px;">
                        <span style="font-weight: 600; font-size: 13px; color: #212529;">Escolher Cor Personalizada</span>
                        <button id="btn-popover-fechar" type="button" style="background: transparent; border: none; font-size: 16px; cursor: pointer; color: #888; padding: 0 4px;" title="Fechar">✕</button>
                    </div>

                    <!-- Canvas 2D de Saturação e Brilho -->
                    <div style="position: relative; border-radius: 4px; overflow: hidden; border: 1px solid #ced4da; cursor: crosshair; line-height: 0; user-select: none;">
                        <canvas id="popover-canvas-picker" width="400" height="110" style="display: block; width: 100%; height: 110px;"></canvas>
                    </div>

                    <!-- Slider Rainbow de Hue -->
                    <div style="margin: 8px 0 6px 0;">
                        <input type="range" id="popover-hue-slider" min="0" max="360" value="180" style="width: 100%; height: 12px; border-radius: 6px; appearance: none; outline: none; background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%); cursor: pointer; margin: 0; display: block;">
                    </div>

                    <!-- Linha de Controles: Conta-Gotas, Hex Input e Amostra -->
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                        <button type="button" id="btn-popover-eyedropper" title="Conta-gotas (capturar cor da tela)" style="background: #f8f9fa; border: 1px solid #ced4da; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 30px;" aria-label="Conta-gotas">
                            <svg style="width: 15px; height: 15px; fill: #495057;" viewBox="0 0 24 24"><path d="M20.71 5.63l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-3.12 3.12-1.93-1.91-1.41 1.41 1.42 1.42L3 16.25V21h4.75l8.92-8.92 1.42 1.42 1.41-1.41-1.92-1.92 3.12-3.12c.4-.4.4-1.03.01-1.42zM6.92 19L5 17.08l8.06-8.06 1.92 1.92L6.92 19z"/></svg>
                        </button>
                        <span style="font-size: 11px; font-weight: 600; color: #6c757d;">Hex:</span>
                        <input type="text" id="in-popover-hex" value="#8BFDCC" maxlength="7" style="width: 82px; padding: 4px 6px; font-size: 13px; font-family: monospace; border: 1px solid #ced4da; border-radius: 4px; text-transform: uppercase; height: 30px; box-sizing: border-box;">
                        <div id="popover-preview-sample" style="flex: 1; height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; border: 1px solid rgba(0,0,0,0.18); background-color: #8BFDCC; color: #000000; box-sizing: border-box;">
                            Texto Exemplo
                        </div>
                    </div>

                    <!-- Sugestões Rápidas -->
                    <div style="font-size: 11px; font-weight: 600; color: #6c757d; margin-bottom: 5px;">Sugestões Rápidas:</div>
                    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 12px;">
                        ${htmlSugestoesPersonalizadas}
                    </div>

                    <!-- Botões de Ação do Popover -->
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="btn-popover-salvar" style="flex: 1; padding: 8px; background: #0066CC; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            ✓ SELECIONAR ESTA COR
                        </button>
                        <button type="button" id="btn-popover-cancelar" style="padding: 8px 14px; background: #e9ecef; color: #495057; border: 1px solid #ced4da; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;">
                            Voltar
                        </button>
                    </div>
                </div>
            </div>

            <div style="padding: 10px 16px; border-top: 1px solid #dee2e6; text-align: right; background: #fafafa; border-radius: 0 0 10px 10px;">
                <button id="btn-fechar-modal" style="padding: 6px 14px; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;">Fechar</button>
            </div>
        `;

        document.body.appendChild(modal);

        const backdrop = document.createElement("div");
        backdrop.id = "modal-gerenciador-backdrop";
        Object.assign(backdrop.style, {
            position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
            background: "rgba(0,0,0,0.4)", zIndex: "9999998"
        });
        document.body.appendChild(backdrop);

        const fecharTudo = () => { modal.remove(); backdrop.remove(); };
        modal.querySelector("#modal-arvore-close").onclick = fecharTudo;
        modal.querySelector("#btn-fechar-modal").onclick = fecharTudo;
        backdrop.onclick = fecharTudo;

        const inputTermo = modal.querySelector("#in-novo-termo");
        const lblTermoAcao = modal.querySelector("#lbl-termo-acao");
        const btnAdd = modal.querySelector("#btn-add-termo");
        const btnCancel = modal.querySelector("#btn-cancel-edit");
        const btnHerdar = modal.querySelector("#btn-cor-herdar");
        const btnPersonalizada = modal.querySelector("#btn-abrir-personalizada");
        const swatchPersonalizada = modal.querySelector("#swatch-personalizada");
        const popover = modal.querySelector("#popover-personalizada");
        const inPopoverHex = modal.querySelector("#in-popover-hex");
        const popoverPreviewSample = modal.querySelector("#popover-preview-sample");
        const popoverCanvas = modal.querySelector("#popover-canvas-picker");
        const hueSlider = modal.querySelector("#popover-hue-slider");
        const btnEyedropper = modal.querySelector("#btn-popover-eyedropper");
        const boxes = modal.querySelectorAll(".cor-box-pick");

        let currentH = 180;
        let currentS = 0.5;
        let currentV = 0.8;
        let currentHex = "#8BFDCC";
        let isDraggingCanvas = false;

        function hsvToRgb(h, s, v) {
            let r = 0, g = 0, b = 0;
            const c = v * s;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
            else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
            else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
            else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
            else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
            else if (h >= 300 && h <= 360) { r = c; g = 0; b = x; }
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        }

        function hexToRgb(hex) {
            let c = (hex || '').replace('#', '').trim();
            if (c.length === 3) c = c.split('').map(x => x + x).join('');
            const num = parseInt(c, 16);
            if (isNaN(num)) return [135, 206, 235];
            return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
        }

        function rgbToHex(r, g, b) {
            return "#" + [r, g, b].map(x => {
                const h = Math.max(0, Math.min(255, Math.round(x))).toString(16);
                return h.length === 1 ? '0' + h : h;
            }).join('').toUpperCase();
        }

        function rgbToHsv(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const d = max - min;
            let h = 0;
            const s = max === 0 ? 0 : d / max;
            const v = max;
            if (max !== min) {
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            return [Math.round(h * 360) % 360, s, v];
        }

        function desenharCanvas() {
            if (!popoverCanvas) return;
            const ctx = popoverCanvas.getContext("2d");
            const width = popoverCanvas.width;
            const height = popoverCanvas.height;

            ctx.fillStyle = `hsl(${currentH}, 100%, 50%)`;
            ctx.fillRect(0, 0, width, height);

            const gradWhite = ctx.createLinearGradient(0, 0, width, 0);
            gradWhite.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradWhite.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.fillStyle = gradWhite;
            ctx.fillRect(0, 0, width, height);

            const gradBlack = ctx.createLinearGradient(0, 0, 0, height);
            gradBlack.addColorStop(0, "rgba(0, 0, 0, 0)");
            gradBlack.addColorStop(1, "rgba(0, 0, 0, 1)");
            ctx.fillStyle = gradBlack;
            ctx.fillRect(0, 0, width, height);

            const cx = currentS * width;
            const cy = (1 - currentV) * height;

            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.strokeStyle = currentV > 0.5 ? "#000000" : "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI);
            ctx.strokeStyle = currentV > 0.5 ? "#ffffff" : "#000000";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        function atualizarUIComHSV(h, s, v, atualizarHex = true) {
            currentH = Math.max(0, Math.min(360, h));
            currentS = Math.max(0, Math.min(1, s));
            currentV = Math.max(0, Math.min(1, v));

            const [r, g, b] = hsvToRgb(currentH, currentS, currentV);
            currentHex = rgbToHex(r, g, b);

            if (atualizarHex) {
                inPopoverHex.value = currentHex;
            }
            popoverPreviewSample.style.backgroundColor = currentHex;
            popoverPreviewSample.style.color = calcularCorTexto(currentHex);
            hueSlider.value = currentH;

            desenharCanvas();
        }

        function carregarCorHex(hex) {
            if (!hex) hex = '#87CEEB';
            if (!hex.startsWith('#')) hex = '#' + hex;
            const [r, g, b] = hexToRgb(hex);
            const [h, s, v] = rgbToHsv(r, g, b);
            atualizarUIComHSV(h, s, v, true);
        }

        function tratarInteracaoCanvas(e) {
            const rect = popoverCanvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            const s = x / rect.width;
            const v = 1 - (y / rect.height);
            atualizarUIComHSV(currentH, s, v, true);
        }

        popoverCanvas.onmousedown = (e) => {
            isDraggingCanvas = true;
            tratarInteracaoCanvas(e);
        };

        window.addEventListener("mousemove", (e) => {
            if (isDraggingCanvas && popover.style.display !== "none") {
                tratarInteracaoCanvas(e);
            }
        });

        window.addEventListener("mouseup", () => {
            isDraggingCanvas = false;
        });

        hueSlider.oninput = (e) => {
            atualizarUIComHSV(parseInt(e.target.value), currentS, currentV, true);
        };

        inPopoverHex.oninput = (e) => {
            let val = e.target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                carregarCorHex(val);
            }
        };

        if (window.EyeDropper) {
            btnEyedropper.onclick = async () => {
                try {
                    const dropper = new window.EyeDropper();
                    const res = await dropper.open();
                    if (res && res.sRGBHex) {
                        carregarCorHex(res.sRGBHex);
                    }
                } catch (err) {}
            };
        } else {
            btnEyedropper.style.display = "none";
        }

        const resetBtnHerdar = () => {
            btnHerdar.style.border = '1px solid #ced4da';
            btnHerdar.style.backgroundColor = '#e9ecef';
            btnHerdar.style.color = '#495057';
        };

        const activateBtnHerdar = () => {
            boxes.forEach(b => b.style.border = '1px solid #ced4da');
            resetBtnPersonalizada();
            btnHerdar.style.border = '2px solid #0066CC';
            btnHerdar.style.backgroundColor = '#dbeafe';
            btnHerdar.style.color = '#1e40af';
            corSelecionada = 'inherit';
            corTextoSelecionada = '#000000';
        };

        const resetBtnPersonalizada = () => {
            btnPersonalizada.style.border = '1px solid #ced4da';
            btnPersonalizada.style.backgroundColor = '#ffffff';
            btnPersonalizada.style.color = '#495057';
        };

        const activateBtnPersonalizada = (corHex) => {
            boxes.forEach(b => b.style.border = '1px solid #ced4da');
            resetBtnHerdar();
            btnPersonalizada.style.border = '2px solid #0066CC';
            btnPersonalizada.style.backgroundColor = '#e7f1ff';
            btnPersonalizada.style.color = '#004085';
            swatchPersonalizada.style.backgroundColor = corHex;
            corSelecionada = corHex;
            corTextoSelecionada = calcularCorTexto(corHex);
        };

        btnHerdar.onclick = activateBtnHerdar;

        boxes.forEach(box => {
            box.onclick = () => {
                boxes.forEach(b => b.style.border = '1px solid #ced4da');
                resetBtnHerdar();
                resetBtnPersonalizada();
                box.style.border = '2px solid #000';
                corSelecionada = box.getAttribute("data-bg");
                corTextoSelecionada = box.getAttribute("data-tx");
            };
        });

        btnPersonalizada.onclick = (e) => {
            e.stopPropagation();
            const corInicial = corSelecionada && corSelecionada.startsWith('#') ? corSelecionada : swatchPersonalizada.style.backgroundColor || '#87ceeb';
            popover.style.display = "block";
            setTimeout(() => {
                carregarCorHex(corInicial);
            }, 20);
        };

        modal.querySelector("#btn-popover-fechar").onclick = (e) => {
            e.stopPropagation();
            popover.style.display = "none";
        };

        modal.querySelector("#btn-popover-cancelar").onclick = (e) => {
            e.stopPropagation();
            popover.style.display = "none";
        };

        modal.querySelectorAll(".popover-swatch-item").forEach(sw => {
            sw.onclick = (e) => {
                e.stopPropagation();
                carregarCorHex(sw.getAttribute("data-cor"));
            };
        });

        modal.querySelector("#btn-popover-salvar").onclick = (e) => {
            e.stopPropagation();
            activateBtnPersonalizada(currentHex);
            popover.style.display = "none";
        };

        function iniciarEdicao(termo) {
            termoEmEdicao = termo;
            inputTermo.value = termo;
            lblTermoAcao.textContent = `EDITANDO TERMO: "${termo}"`;
            btnAdd.textContent = "✓ SALVAR ALTERAÇÃO";
            btnAdd.style.background = "#0066CC";
            btnCancel.style.display = "block";

            const conf = regrasAtivas[termo];
            if (conf) {
                if (conf.bg === "inherit" || conf.inherit) {
                    activateBtnHerdar();
                } else {
                    let matched = false;
                    boxes.forEach(b => {
                        if (b.getAttribute("data-bg").toLowerCase() === conf.bg.toLowerCase()) {
                            b.style.border = '2px solid #000';
                            matched = true;
                        } else {
                            b.style.border = '1px solid #ced4da';
                        }
                    });
                    resetBtnHerdar();
                    if (!matched) {
                        activateBtnPersonalizada(conf.bg);
                    } else {
                        resetBtnPersonalizada();
                    }
                    corSelecionada = conf.bg;
                    corTextoSelecionada = conf.tx || calcularCorTexto(conf.bg);
                }
            }

            inputTermo.focus();
            inputTermo.select();
            renderListaTermos();
        }

        function cancelarEdicao() {
            termoEmEdicao = null;
            inputTermo.value = "";
            lblTermoAcao.textContent = "ADICIONAR TERMO / EXPRESSÃO:";
            btnAdd.textContent = "+ ADICIONAR TERMO";
            btnAdd.style.background = "#28a745";
            btnCancel.style.display = "none";
            renderListaTermos();
        }

        btnCancel.onclick = cancelarEdicao;

        inputTermo.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnAdd.click();
            } else if (e.key === 'Escape' && termoEmEdicao) {
                e.preventDefault();
                cancelarEdicao();
            }
        };

        btnAdd.onclick = () => {
            const termo = inputTermo.value.trim();

            if (!termo) {
                alert("Digite uma expressão ou termo!");
                inputTermo.focus();
                return;
            }

            if (termoEmEdicao) {
                const keys = Object.keys(regrasAtivas);
                const novoObj = {};
                keys.forEach(k => {
                    if (k === termoEmEdicao) {
                        novoObj[termo] = {
                            bg: corSelecionada,
                            tx: corTextoSelecionada
                        };
                        if (corSelecionada === 'inherit') novoObj[termo].inherit = true;
                    } else if (k !== termo) {
                        novoObj[k] = regrasAtivas[k];
                    }
                });
                if (!novoObj[termo]) {
                    novoObj[termo] = { bg: corSelecionada, tx: corTextoSelecionada };
                    if (corSelecionada === 'inherit') novoObj[termo].inherit = true;
                }
                regrasAtivas = novoObj;
                cancelarEdicao();
            } else {
                regrasAtivas[termo] = {
                    bg: corSelecionada,
                    tx: corTextoSelecionada
                };
                if (corSelecionada === 'inherit') regrasAtivas[termo].inherit = true;
                inputTermo.value = "";
            }

            salvarConfiguracoes(regrasAtivas);
            renderListaTermos();
            aplicarColoracao();
        };

        renderListaTermos();
    }

    let arvore = null;
    let timer = null;
    let completa = true;
    let parada = false;
    const ramos = new Set();
    const atributos = ['data-superproc-cor', 'data-azflow-parte',
        'data-azflow-despacho', 'data-azflow-icone', 'evento', 'seqdoc'];

    function agendar() {
        if (!parada && timer === null) timer = setTimeout(atualizar, 50);
    }

    function marcarRamo(no) {
        const el = no.nodeType === 1 ? no : no.parentElement;
        if (!el || !arvore?.contains(el)) return;
        let ramo = el.closest('li');
        if (!ramo || !arvore.contains(ramo)) { completa = true; return; }
        // A origem de cor pode ser descoberta em qualquer documento do evento.
        // Invalidar o evento inteiro mantém também irmãos com cor herdada.
        let pai;
        while ((pai = ramo.parentElement?.closest('li')) && arvore.contains(pai)) ramo = pai;
        ramos.add(ramo);
    }

    function receberMutacoes(mudancas) {
        for (const m of mudancas) marcarRamo(m.target);
        agendar();
    }
    const observadorArvore = new MutationObserver(receberMutacoes);
    function observarArvore() {
        if (arvore && !parada) observadorArvore.observe(arvore, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: atributos
        });
    }

    function atualizar() {
        timer = null;
        if (parada) return;
        const atual = document.getElementById('divArvore');
        if (atual !== arvore) {
            observadorArvore.disconnect();
            arvore = atual;
            completa = true;
            ramos.clear();
        }
        // Inclui registros ainda pendentes antes de desconectar. Nossas próprias
        // mudanças de estilo não devem gerar uma segunda passagem.
        receberPendentes();
        observadorArvore.disconnect();
        try {
            injetarCSSGlobal();
            injetarBotaoPaleta();
            if (arvore) {
                if (completa) colorirRamo(arvore);
                else for (const ramo of ramos) if (arvore.contains(ramo)) colorirRamo(ramo);
            }
            completa = false;
            ramos.clear();
        } finally { observarArvore(); }
    }
    function receberPendentes() {
        for (const m of observadorArvore.takeRecords()) marcarRamo(m.target);
    }

    // Guarda estrutural: só procura containers nos nós inseridos/removidos.
    // Alterar um visor PDF fora da árvore não provoca recoloração.
    function contemContainer(no) {
        return no.nodeType === 1 && (no.matches('#divArvore, #divIntervaloEvento') ||
            !!no.querySelector('#divArvore, #divIntervaloEvento'));
    }
    const observadorEstrutura = new MutationObserver(mudancas => {
        if (arvore && !arvore.isConnected) { agendar(); return; }
        for (const m of mudancas) {
            if (arvore?.contains(m.target)) continue;
            if ([...m.addedNodes, ...m.removedNodes].some(contemContainer)) { agendar(); return; }
        }
    });
    function iniciar() {
        parada = false;
        completa = true;
        observadorEstrutura.observe(document.body, { childList: true, subtree: true });
        agendar();
    }
    function parar() {
        parada = true;
        clearTimeout(timer);
        timer = null;
        observadorArvore.disconnect();
        observadorEstrutura.disconnect();
        ramos.clear();
    }
    window.addEventListener('pagehide', parar);
    window.addEventListener('pageshow', e => { if (e.persisted && parada) iniciar(); });
    window.addEventListener('storage', e => {
        if (e.key === STORAGE_KEY || e.key === null) {
            regrasAtivas = carregarConfiguracoes();
            aplicarColoracao();
        }
    });
    iniciar();
