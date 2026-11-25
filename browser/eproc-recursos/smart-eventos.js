// Smart Eventos do navegador SuperPROC (camada: host; roda no MUNDO PRINCIPAL da página do eproc, porque usa o jQuery
// da própria página para lançar o evento). Chave em CFG > Configurações ("Smart Localizadores & Eventos").
// Porte independente do módulo da extensão (modules/geral/smart_eventos.js + smart_eventos_main.js): mesma interface e os
// mesmos dados no localStorage do eproc (eproc_smarteventos_*), sem chrome.* e sem a extensão. O botão Organizar pede ao
// navegador que abra o Organizador (evento DOM 'superproc:organizador-abrir', levado ao host pelo tab-preload.js).
// Só carrega em páginas com a seção "Agendar lançamento de evento/troca de localizador" (como o carregador da extensão).

(function carregarSmartEventos() {
  const permitido = () => {
    const fld = document.querySelector('#fldEventoAgendamento');
    const spn = document.querySelector('#spnEventoAgendamento');
    const chk = document.querySelector('#chkEventoAgendamento');
    return fld && (spn || chk || fld.textContent.includes('Agendar'));
  };
  const iniciar = () => {
(function() {
    'use strict';

    if (window.__spSmartEvtNavegador__) return;
    window.__spSmartEvtNavegador__ = true;

    // --- Funções GM_* mínimas (getValue/setValue sobre localStorage), pois o script foi escrito para userscript ---
    function GM_getValue(key, defaultValue) {
        try {
            const val = localStorage.getItem(key);
            return val !== null ? JSON.parse(val) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    function GM_setValue(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            agendarEspelho(key);
        } catch (e) {
            console.error('[SuperPROC] Erro ao gravar no localStorage:', e);
        }
    }

    let _gmBackupCallback = null;
    function GM_registerMenuCommand(name, callback) {
        _gmBackupCallback = callback;
        window.superprocBackupEventos = callback;
    }

    const unsafeWindow = window;
const KEYS = {
        GRUPOS: 'eproc_smarteventos_grupos',
        ESTRUTURA: 'eproc_smarteventos_estrutura'
    };

    const GRUPO_SISTEMA = "\u{1F4DA} Base do Tribunal (Auto)";

    // Ícones da barra: traço único de 1.75px, herdam a cor do botão.
    const ICO_EVT = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const SVG_EVT = {
        sync: ICO_EVT('<path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/>'),
        plus: ICO_EVT('<path d="M12 5v14M5 12h14"/>'),
        pack: ICO_EVT('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
        grid: ICO_EVT('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
    };

    // --- ESPELHO PARA O ORGANIZADOR ---
    // Quando os grupos mudam de fato, carimba `at` e avisa o carregador (content script), que grava no espelho.
    // Se o organizador alterou os grupos, o carregador grava no localStorage e manda "reload" para redesenhar.
    let ultimoSnap = '';
    let espelhoTimer = null;
    const lerSnap = () => { try { return (localStorage.getItem(KEYS.GRUPOS) || '') + '\u0001' + (localStorage.getItem(KEYS.ESTRUTURA) || ''); } catch (_) { return ''; } };
    ultimoSnap = lerSnap();
    function agendarEspelho(chave) {
        if (chave !== KEYS.GRUPOS && chave !== KEYS.ESTRUTURA) return;
        clearTimeout(espelhoTimer);
        espelhoTimer = setTimeout(() => {
            const snap = lerSnap();
            if (snap === ultimoSnap) return;
            ultimoSnap = snap;
            const at = Date.now();
            try { localStorage.setItem('eproc_smarteventos_at', String(at)); } catch (_) {}
            // A base é o próprio localStorage (docs/ia/POOL-COMUM.md): o carimbo basta para o Organizador e a extensão.
        }, 60);
    }
    // Base alterada fora desta página (Organizador do navegador ou outra aba): redesenha a lista aberta.
    const aoMudarBaseEvt = () => {
        ultimoSnap = lerSnap();
        const dd = document.getElementById('smartevt-dropdown');
        if (dd && dd.style.display === 'flex') renderizarLista();
    };
    window.addEventListener('superproc:base-mudou', aoMudarBaseEvt);
    window.addEventListener('storage', (e) => { if (!e.key || e.key === KEYS.GRUPOS || e.key === KEYS.ESTRUTURA) aoMudarBaseEvt(); });

    // --- COMANDO DE MENU PARA BACKUP / RESTAURAÇÃO ---
    GM_registerMenuCommand("\u{1F4E5} Backup/Restaurar Configuração dos Eventos", () => {
        const backup = {
            grupos: GM_getValue(KEYS.GRUPOS, []),
            estrutura: GM_getValue(KEYS.ESTRUTURA, { "Sem Grupo": [] })
        };
        const jsonAtual = JSON.stringify(backup, null, 4);
        const jsonNovo = prompt("Abaixo está o backup da sua configuração de Grupos e Eventos.\n\nGuarde este texto em um bloco de notas para backup, ou cole um backup anterior aqui para restaurar:", jsonAtual);

        if (jsonNovo !== null && jsonNovo !== jsonAtual) {
            try {
                const parsed = JSON.parse(jsonNovo);
                if (parsed.grupos && parsed.estrutura) {
                    GM_setValue(KEYS.GRUPOS, parsed.grupos);
                    GM_setValue(KEYS.ESTRUTURA, parsed.estrutura);
                    alert("Configuração restaurada com sucesso! A página será recarregada.");
                    location.reload();
                } else {
                    alert("Formato de backup inválido. Faltam 'grupos' ou 'estrutura'.");
                }
            } catch(e) {
                alert("Erro ao restaurar backup (JSON inválido): " + e.message);
            }
        }
    });

    // --- LIMPEZA AUTOMÁTICA DE DADOS CORROMPIDOS / MOJIBAKE ---
    function limparDadosCorrompidos() {
        try {
            let grupos = GM_getValue(KEYS.GRUPOS, []);
            let estrutura = GM_getValue(KEYS.ESTRUTURA, { "Sem Grupo": [] });

            if (!Array.isArray(grupos)) grupos = [];
            if (!estrutura || typeof estrutura !== 'object') estrutura = { "Sem Grupo": [] };

            // 1. Identifica a base do tribunal válida
            let baseValida = estrutura[GRUPO_SISTEMA] || [];
            if (baseValida.length === 0) {
                for (const key of Object.keys(estrutura)) {
                    if (key.includes('Base do Tribunal') && Array.isArray(estrutura[key]) && estrutura[key].length > 0) {
                        baseValida = estrutura[key];
                        break;
                    }
                }
            }

            // 2. Remove chaves corrompidas de estrutura
            for (const key of Object.keys(estrutura)) {
                if (key.includes('ðŸ') || key.includes('âš') || (key.includes('Base do Tribunal') && key !== GRUPO_SISTEMA)) {
                    delete estrutura[key];
                }
            }

            // 3. Filtra grupos limpos
            const gruposLimpos = [];
            const gruposVistos = new Set();

            grupos.forEach(g => {
                if (!g || typeof g !== 'string') return;
                const isMojibake = g.includes('ðŸ') || g.includes('âš');
                const isDuplicateBase = g.includes('Base do Tribunal') && g !== GRUPO_SISTEMA;
                
                if (isMojibake || isDuplicateBase) return;

                if (!gruposVistos.has(g)) {
                    gruposVistos.add(g);
                    gruposLimpos.push(g);
                }
            });

            // 4. Salva a base do tribunal limpa
            estrutura[GRUPO_SISTEMA] = baseValida;

            // 5. Garante que GRUPO_SISTEMA está registrado para sincronização interna
            if (!gruposLimpos.includes(GRUPO_SISTEMA)) {
                gruposLimpos.push(GRUPO_SISTEMA);
            }

            // 6. Garante "Sem Grupo"
            if (!estrutura["Sem Grupo"]) estrutura["Sem Grupo"] = [];

            GM_setValue(KEYS.GRUPOS, gruposLimpos);
            GM_setValue(KEYS.ESTRUTURA, estrutura);
        } catch (e) {
            console.warn('[SuperPROC] Erro na limpeza de dados do Smart Eventos:', e);
        }
    }
    limparDadosCorrompidos();



    // --- ESTILOS CSS (Idênticos ao Smart Localizadores, mas com toque amarelo/eventos) ---
    const style = document.createElement('style');
    style.innerHTML = `
        .smartevt-container {
            width: 100%;
            margin-bottom: 15px;
            padding: 12px 15px;
            background: #f4f6f8;
            border: 1px solid #c8ced3;
            border-left: 4px solid #ffc107;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: none;
        }

        .smartevt-title {
            font-size: 13px;
            font-weight: bold;
            color: #856404;
            white-space: nowrap;
            margin-right: 10px;
        }

        .smartevt-trigger {
            flex-grow: 1;
            background: #fff;
            border: 1px solid #ced4da;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: default;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: #495057;
            height: 36px;
            box-sizing: border-box;
            transition: border-color 0.2s;
            position: relative;
        }
        .smartevt-trigger:hover { border-color: #ffeba0; box-shadow: none; }
        .smartevt-trigger-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold; width: 100%; cursor: default; }

        .smartevt-search-input {
            width: 100%;
            border: none;
            background: transparent;
            font-size: 13px;
            outline: none;
            padding: 0;
            display: none;
            font-family: inherit;
        }

        .smartevt-toolbar {
            display: flex;
            gap: 6px;
        }
        .smartevt-icon-btn { cursor: default; padding: 0 12px; height: 36px; border: 1px solid #ced4da; background: #fff; border-radius: 4px; font-size: 15px; display: flex; align-items: center; justify-content: center; box-shadow: none; color: #333; transition: all 0.2s;}
        .smartevt-icon-btn:hover { background: #e2e6ea; border-color: #adb5bd; }
        .smartevt-icon-btn svg { display: block; }
        #smartevt-container .smartevt-org-btn { display: inline-flex !important; align-items: center; justify-content: center; flex: 0 0 36px; width: 36px; height: 36px; padding: 0; box-sizing: border-box; border: 1px solid #856404 !important; background: #856404 !important; color: #ffffff !important; border-radius: 4px; cursor: pointer; box-shadow: none !important; text-shadow: none !important; transition: background 0.15s; }
        #smartevt-container .smartevt-org-btn svg { color: #ffffff !important; stroke: #ffffff !important; }
        #smartevt-container .smartevt-org-btn svg { background: transparent !important; }
        #smartevt-container .smartevt-org-btn:hover { background: #6d5203 !important; }
        #smartevt-container .smartevt-icon-btn:focus-visible, #smartevt-container .smartevt-org-btn:focus-visible { outline: 2px solid #856404; outline-offset: 2px; }

        .smartevt-dropdown { position: absolute; background: #fff; border: 1px solid #ced4da; border-radius: 4px; box-shadow: none; z-index: 2147483647; display: none; flex-direction: column; font-family: Arial, sans-serif; overflow: hidden; }
        .smartevt-list-container { overflow-y: auto; padding: 5px; flex-grow: 1; }

        .smartevt-quick-drop { position: fixed; background: #f8f9fa; border: 2px solid #ffc107; border-radius: 8px; padding: 10px; box-shadow: none; z-index: 2147483647; display: none; flex-direction: column; gap: 6px; width: 200px; max-height: 80vh; overflow-y: auto; }
        .smartevt-quick-drop-title { font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 5px; color: #856404; text-transform: uppercase; }
        .smartevt-quick-drop-target { background: #fff; border: 1px dashed #ced4da; padding: 10px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; color: #495057; text-align: center; cursor: default; transition: all 0.2s; }
        .smartevt-quick-drop-target.drag-over { background: #fff3cd; border-color: #ffc107; color: #856404; transform: scale(1.03); box-shadow: none; }

        .smartevt-group { margin-bottom: 5px; border: 1px solid #e9ecef; border-radius: 4px; }
        .smartevt-group-header { background: #e9ecef; padding: 6px 8px; font-size: 11px; font-weight: bold; color: #495057; display: flex; justify-content: space-between; align-items: center; cursor: default; user-select: none; transition: background 0.15s, border-color 0.15s; }
        .smartevt-group-header:hover { background: #dde2e6; }
        .smartevt-group-header.drag-over { border: 2px dashed #ffc107 !important; background: #fff3cd !important; }
        .smartevt-items { display: block; padding: 2px; }
        .smartevt-items.collapsed { display: none; }
        .smartevt-item { padding: 6px 8px; font-size: 12px; color: #212529; cursor: default !important; border-bottom: 1px solid #f1f3f5; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; justify-content: space-between; align-items: center; }
        .smartevt-item:active { cursor: default !important; }
        .smartevt-item:last-child { border-bottom: none; }
        .smartevt-item:hover { background: #f1f3f5; color: #856404; }
        .smartevt-item.dragging { opacity: 0.5; background: #e2e6ea; }
        .smartevt-item-del { color: #dc3545; font-size: 10px; border: none; background: none; cursor: default; opacity: 0; transition: opacity 0.2s; padding: 0 5px; }
        .smartevt-item:hover .smartevt-item-del { opacity: 1; }

        .smartevt-empty-notice { font-size: 11px; color: #adb5bd; padding: 8px; text-align: center; font-style: italic; }
        .toggle-icon { font-size: 10px; transition: transform 0.2s; }
        .collapsed .toggle-icon { transform: rotate(-90deg); }

        /* Modo de arrastar para grupos: recolhe itens e exibe apenas os cabeçalhos de todos os grupos */
        .smartevt-dropdown.is-dragging-mode .smartevt-items { display: none !important; }
        .smartevt-dropdown.is-dragging-mode .smartevt-group { display: block !important; margin-bottom: 4px !important; }
        .smartevt-dropdown.is-dragging-mode .smartevt-group-header { border: 1px dashed #d39e00; background: #fffdf5; cursor: default !important; padding: 9px 10px; }
        .smartevt-dropdown.is-dragging-mode .smartevt-group-header.drag-over { background: #ffeeba !important; border: 2px dashed #856404 !important; }

        .smartevt-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 2147483647; display: none; justify-content: center; align-items: center; font-family: Arial, sans-serif; }
        .smartevt-modal { background: #fff; width: 450px; max-width: 90%; border-radius: 8px; box-shadow: none; display: flex; flex-direction: column; overflow: hidden; }
        .smartevt-modal-header { background: #856404; color: #fff; padding: 12px 15px; font-size: 14px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        .smartevt-modal-close { cursor: default; font-size: 16px; color: #fff; background: none; border: none; }
        .smartevt-modal-body { padding: 15px; max-height: 60vh; overflow-y: auto; }

        .smartevt-cfg-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #f8f9fa; border: 1px solid #dee2e6; margin-bottom: 5px; border-radius: 4px; cursor: grab; }
        .smartevt-cfg-item:active { cursor: default; }
        .smartevt-cfg-item.dragging { opacity: 0.4; }
        .smartevt-cfg-del { cursor: default; color: #dc3545; font-weight: bold; border: none; background: none; padding: 0 5px; }
        .smartevt-cfg-del:hover { background: #f8d7da; border-radius: 3px; }
        .smartevt-cfg-actions { display:flex; gap:3px; align-items:center; }
        .smartevt-cfg-move { width:24px; height:23px; padding:0; border:1px solid #c8ced3; border-radius:3px; background:#fff; color:#856404; font-weight:bold; cursor:pointer; }
        .smartevt-cfg-move:hover:not(:disabled) { background:#fff3cd; border-color:#856404; }
        .smartevt-cfg-move:disabled { opacity:.35; cursor:default; }

        .smartevt-input { width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-bottom: 15px; box-sizing: border-box; font-size: 13px; }
        .smartevt-btn-primary { width: 100%; padding: 10px; background: #856404; color: #fff; border: none; border-radius: 4px; cursor: default; font-weight: bold; }
        .smartevt-btn-primary:hover { background: #6d5203; }

        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; pointer-events: none; opacity: 0.6; }
    `;
    document.head.appendChild(style);

    let listaDadosEventos = [];
    let draggedItemObj = null;

    // --- FUNÇÕES DE DADOS ---
    function capturarEventosNativos() {
        // Coleta o que estiver na Base Automática salva ou tenta varrer a div se estiver aberta
        const { estrutura } = getEstrutura();
        return estrutura[GRUPO_SISTEMA] || [];
    }

    function getEstrutura() {
        let grupos = GM_getValue(KEYS.GRUPOS, []);
        let estrutura = GM_getValue(KEYS.ESTRUTURA, { "Sem Grupo": [] });
        if (!estrutura['Sem Grupo']) estrutura['Sem Grupo'] = [];

        if (grupos.includes(GRUPO_SISTEMA) && !estrutura[GRUPO_SISTEMA]) {
            estrutura[GRUPO_SISTEMA] = [];
        }

        grupos.forEach(g => { if (!estrutura[g]) estrutura[g] = []; });
        return { grupos, estrutura };
    }

    function salvarEstrutura(grupos, estrutura) {
        GM_setValue(KEYS.GRUPOS, grupos);
        GM_setValue(KEYS.ESTRUTURA, estrutura);
    }

    // Lê os eventos da lista nativa do eproc já aberta ("Listar Todos"): [{ id, text }] sem repetidos.
    function extrairEventosDaLista(divAutocompletar) {
        const itensDOM = divAutocompletar.querySelectorAll('ul li a');
        const eventosCapturados = [];
        const nomesUnicos = new Set();

        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const arrItens = (win.objAjaxAutoCompEvento && Array.isArray(win.objAjaxAutoCompEvento.arrItens)) ? win.objAjaxAutoCompEvento.arrItens : [];

        itensDOM.forEach((item, idx) => {
            const textoCru = item.textContent.trim();
            const match = textoCru.match(/(.+?)\s*\((\d+)\)$/);

            if (match && match[2]) {
                let idLimpo = match[2].trim();
                if (arrItens[idx] && arrItens[idx].id) {
                    idLimpo = String(arrItens[idx].id);
                }
                if (!nomesUnicos.has(textoCru) && textoCru !== '') {
                    eventosCapturados.push({ id: idLimpo, text: textoCru });
                    nomesUnicos.add(textoCru);
                }
            }
        });
        return eventosCapturados;
    }

    // --- ATUALIZAÇÃO AUTOMÁTICA DA BASE (uma vez por dia, ao abrir a minuta) ---
    // Na página de minuta, se a base ainda não foi conferida hoje, lê a lista nativa em silêncio. Só avisa se algo mudou.
    const CHAVE_CHECAGEM = 'eproc_smarteventos_checado_em';
    const CHAVE_BASE_EM = 'eproc_smarteventos_base_em'; // data da base local; o carregador a compara com a da lista embutida
    const LIMITE_LISTA_AVISO = 100;
    let atualizacaoAutomaticaIniciada = false;

    function hojeLocal() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function paginaDeMinuta() {
        try { return (new URLSearchParams(location.search).get('acao') || '').startsWith('minuta_cadastrar'); } catch (_) { return false; }
    }
    function jaConferidoHoje() {
        try { return localStorage.getItem(CHAVE_CHECAGEM) === hojeLocal(); } catch (_) { return true; /* sem storage: não insiste */ }
    }

    function mostrarAvisoAtualizacao(novos, removidos) {
        const antigo = document.getElementById('smartevt-aviso');
        if (antigo) antigo.remove();
        if (!document.getElementById('smartevt-aviso-estilo')) {
            const st = document.createElement('style');
            st.id = 'smartevt-aviso-estilo';
            st.textContent = '#smartevt-aviso{position:fixed;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 32px);max-height:60vh;overflow:auto;background:#fff;border:1px solid #856404;border-left:5px solid #ffc107;border-radius:4px;box-shadow:none;z-index:2147483647;font:13px Arial,sans-serif;color:#212529;padding:12px 14px}'
                + '#smartevt-aviso h4{margin:0 0 8px;font-size:13px;color:#856404}#smartevt-aviso h5{margin:10px 0 4px;font-size:12px}'
                + '#smartevt-aviso ul{margin:0;padding-left:18px}#smartevt-aviso li{margin:2px 0;font-size:12px}'
                + '#smartevt-aviso button{margin-top:10px;padding:5px 12px;border:1px solid #856404;background:#856404;color:#fff;border-radius:3px;cursor:pointer;font:bold 12px Arial,sans-serif}';
            document.head.appendChild(st);
        }
        const caixa = document.createElement('div');
        caixa.id = 'smartevt-aviso';
        caixa.setAttribute('role', 'status');
        const titulo = document.createElement('h4');
        titulo.textContent = '⚡ Smart Eventos: lista de eventos atualizada';
        caixa.appendChild(titulo);
        const secao = (rotulo, itens) => {
            if (!itens.length) return;
            const h = document.createElement('h5');
            h.textContent = rotulo;
            const ul = document.createElement('ul');
            itens.slice(0, LIMITE_LISTA_AVISO).forEach(i => { const li = document.createElement('li'); li.textContent = i.text; ul.appendChild(li); });
            if (itens.length > LIMITE_LISTA_AVISO) { const li = document.createElement('li'); li.textContent = '... e mais ' + (itens.length - LIMITE_LISTA_AVISO); ul.appendChild(li); }
            caixa.append(h, ul);
        };
        secao('Novos eventos disponíveis:', novos);
        secao('Foram removidos eventos:', removidos);
        const fechar = document.createElement('button');
        fechar.type = 'button';
        fechar.textContent = 'Fechar';
        fechar.onclick = () => caixa.remove();
        caixa.appendChild(fechar);
        document.body.appendChild(caixa);
    }

    function executarAtualizacaoSilenciosa(btnListarNativo, divAutocompletar) {
        const foco = document.activeElement;
        const oculta = document.createElement('style');
        oculta.textContent = '#divInfraAjaxtxtEvento{visibility:hidden !important}';
        document.head.appendChild(oculta);
        const encerrar = () => {
            divAutocompletar.style.display = 'none';
            const txt = document.getElementById('txtEvento');
            if (txt) txt.blur();
            oculta.remove();
            try { if (foco && foco !== document.body && typeof foco.focus === 'function') foco.focus(); } catch (_) {}
        };

        try { btnListarNativo.click(); } catch (_) { encerrar(); return; }

        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            if (divAutocompletar.querySelectorAll('ul li a').length > 5) {
                clearInterval(intervalo);
                try {
                    const capturados = extrairEventosDaLista(divAutocompletar);
                    if (capturados.length > 0) {
                        const { grupos, estrutura } = getEstrutura();
                        const anterior = estrutura[GRUPO_SISTEMA] || [];
                        const textosAntes = new Set(anterior.map(i => i.text));
                        const textosAgora = new Set(capturados.map(i => i.text));
                        const novos = capturados.filter(i => !textosAntes.has(i.text));
                        const removidos = anterior.filter(i => !textosAgora.has(i.text));

                        if (novos.length || removidos.length || !grupos.includes(GRUPO_SISTEMA)) {
                            if (!grupos.includes(GRUPO_SISTEMA)) grupos.push(GRUPO_SISTEMA);
                            estrutura[GRUPO_SISTEMA] = capturados;
                            salvarEstrutura(grupos, estrutura);
                            sincronizarEstruturaGeral();
                            const dd = document.getElementById('smartevt-dropdown');
                            if (dd && dd.style.display === 'flex') renderizarLista();
                            // Base vazia = primeira carga: não há o que comparar, então não avisa.
                            if (anterior.length > 0) mostrarAvisoAtualizacao(novos, removidos);
                        }
                        try { localStorage.setItem(CHAVE_BASE_EM, hojeLocal()); localStorage.setItem(CHAVE_CHECAGEM, hojeLocal()); } catch (_) {}
                    }
                } catch (err) {
                    console.warn('[SuperPROC] Falha ao atualizar os eventos automaticamente:', err);
                }
                encerrar();
            } else if (tentativas > 60) {
                clearInterval(intervalo); // sem lista a tempo: tenta de novo na próxima visita
                encerrar();
            }
        }, 100);
    }

    function iniciarAtualizacaoAutomatica() {
        if (atualizacaoAutomaticaIniciada || !paginaDeMinuta() || jaConferidoHoje()) return;
        atualizacaoAutomaticaIniciada = true;
        let tentativas = 0;
        const espera = setInterval(() => {
            tentativas++;
            const btn = document.getElementById('lblListarEvento');
            const div = document.getElementById('divInfraAjaxtxtEvento');
            if (btn && div) {
                clearInterval(espera);
                executarAtualizacaoSilenciosa(btn, div);
            } else if (tentativas > 40) {
                clearInterval(espera);
            }
        }, 250);
    }

    function sincronizarEventosNativos() {
        const btnSync = document.getElementById('btn-sync');
        const btnListarNativo = document.getElementById('lblListarEvento');
        const divAutocompletar = document.getElementById('divInfraAjaxtxtEvento');

        if (!btnListarNativo || !divAutocompletar) {
            alert("Não foi possível localizar os elementos nativos do Eproc nesta tela.");
            return;
        }

        if (btnSync) btnSync.classList.add('spinning');
        console.log("\u26A1 Smart Eventos: Disparando clique nativo para abrir a lista...");

        btnListarNativo.click();

        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            const itensDOM = divAutocompletar.querySelectorAll('ul li a');

            if (itensDOM.length > 5) {
                clearInterval(intervalo);

                const eventosCapturados = extrairEventosDaLista(divAutocompletar);

                if (eventosCapturados.length > 0) {
                    let { grupos, estrutura } = getEstrutura();
                    if (!grupos.includes(GRUPO_SISTEMA)) grupos.push(GRUPO_SISTEMA);
                    estrutura[GRUPO_SISTEMA] = eventosCapturados;
                    salvarEstrutura(grupos, estrutura);
                    sincronizarEstruturaGeral();
                    try { localStorage.setItem(CHAVE_BASE_EM, hojeLocal()); localStorage.setItem(CHAVE_CHECAGEM, hojeLocal()); } catch (_) {}

                    alert(`\u2705 Captura Perfeita!\n${eventosCapturados.length} eventos foram lidos e sincronizados.`);

                    if (document.getElementById('smartevt-dropdown').style.display === 'flex') {
                        renderizarLista();
                    }
                } else {
                    alert("A lista abriu, mas o formato do texto estava diferente do esperado.");
                }

                divAutocompletar.style.display = 'none';
                document.getElementById('txtEvento').blur();
                if (btnSync) btnSync.classList.remove('spinning');

            } else if (tentativas > 50) {
                clearInterval(intervalo);
                alert("Tempo limite excedido aguardando o carregamento da lista do Eproc.");
                if (btnSync) btnSync.classList.remove('spinning');
            }
        }, 100);
    }

    function sincronizarEstruturaGeral() {
        let { grupos, estrutura } = getEstrutura();
        let baseSistemaTextos = (estrutura[GRUPO_SISTEMA] || []).map(i => i.text);

        Object.keys(estrutura).forEach(grp => {
            if (grp !== GRUPO_SISTEMA) {
                // Mantém apenas os itens que existem na base do sistema ou em grupos customizados
                estrutura[grp] = estrutura[grp].filter(item => {
                    return baseSistemaTextos.length === 0 || baseSistemaTextos.includes(item.text);
                });
            }
        });

        // Classifica somente os itens ainda não organizados.
        const todosAlocados = new Set();
        Object.keys(estrutura).forEach(grp => {
            if (grp !== GRUPO_SISTEMA) {
                for (const item of estrutura[grp]) todosAlocados.add(item.text);
            }
        });

        if (estrutura[GRUPO_SISTEMA]) {
            const padroes = ['Despachos/Decisões', 'Sentenças', 'Atos'];
            const primeiraImportacao = !grupos.some(g => g !== GRUPO_SISTEMA) && !todosAlocados.size;
            if (primeiraImportacao && estrutura[GRUPO_SISTEMA].length) {
                for (const grupo of padroes) {
                    grupos.push(grupo);
                    estrutura[grupo] = [];
                }
            }
            for (const item of estrutura[GRUPO_SISTEMA]) {
                if (todosAlocados.has(item.text)) continue;
                const texto = item.text.normalize('NFC').trim();
                const grupo = /^(?:despacho\s*\/\s*decisão|decisão\s*\/\s*despacho)\s*[-–—]/iu.test(texto) ? padroes[0]
                    : /^sentença\s*[-–—]/iu.test(texto) ? padroes[1] : padroes[2];
                (grupos.includes(grupo) ? estrutura[grupo] : estrutura['Sem Grupo']).push(item);
                todosAlocados.add(item.text);
            }
        }

        salvarEstrutura(grupos, estrutura);
    }

    // --- APLICAÇÃO SIMULANDO O ENTER COM RESOLUÇÃO NATIVA DO ID DO TRIBUNAL ---
    function aplicarEventoNoEproc(id, texto) {
        fecharDropdown();
        const triggerText = document.getElementById('smartevt-selected-text');
        if (triggerText) triggerText.textContent = texto;

        const txtEvento = document.querySelector('#txtEvento');
        const hdnEvento = document.querySelector('#hdnEvento');

        if (txtEvento) {
            txtEvento.focus();
            txtEvento.value = texto;
            txtEvento.dispatchEvent(new Event('input', { bubbles: true }));

            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

            // Extrai o código CNJ do evento se houver, ex: "(12769)" -> "12769"
            const matchCnj = texto.match(/\((\d+)\)$/);
            const cnjCode = matchCnj ? matchCnj[1] : (id && !isNaN(id) && String(id).length <= 6 ? String(id) : null);

            // Texto limpo sem prefixos comuns do eProc
            const textoLimpo = texto.replace(/^(Decis[ãa]o\/Despacho|Despacho\/Decis[ãa]o|Decis[ãa]o|Despacho)\s*-\s*/i, '').trim().toLowerCase();

            let idRealBanco = null;
            let indiceNoArrItens = null;

            // 1. Procura em win.objAjaxAutoCompEvento.arrItens (se já tiver sido carregado)
            if (win.objAjaxAutoCompEvento && Array.isArray(win.objAjaxAutoCompEvento.arrItens)) {
                for (let i = 0; i < win.objAjaxAutoCompEvento.arrItens.length; i++) {
                    const item = win.objAjaxAutoCompEvento.arrItens[i];
                    if (item && item.id) {
                        const desc = (item.descricao || '').trim();
                        const descLimpo = desc.replace(/^(Decis[ãa]o\/Despacho|Despacho\/Decis[ãa]o|Decis[ãa]o|Despacho)\s*-\s*/i, '').trim().toLowerCase();
                        if (desc.toLowerCase() === texto.toLowerCase() || descLimpo === textoLimpo) {
                            idRealBanco = String(item.id);
                            indiceNoArrItens = i;
                            break;
                        }
                    }
                }
            }

            // 2. Procura no select selEventoComplementar (onde estão todos os eventos do Tribunal com o ID real de banco)
            if (!idRealBanco) {
                const selComp = document.getElementById('selEventoComplementar');
                if (selComp && selComp.options) {
                    // Pass 1: Correspondência exata ou por texto sem prefixo
                    for (let i = 0; i < selComp.options.length; i++) {
                        const opt = selComp.options[i];
                        if (opt.value && opt.value !== 'null') {
                            const optText = opt.text.trim();
                            const optLimpo = optText.replace(/^(Decis[ãa]o\/Despacho|Despacho\/Decis[ãa]o|Decis[ãa]o|Despacho)\s*-\s*/i, '').trim().toLowerCase();
                            if (optText.toLowerCase() === texto.toLowerCase() || optLimpo === textoLimpo) {
                                idRealBanco = opt.value;
                                break;
                            }
                        }
                    }

                    // Pass 2: Correspondência por código CNJ com validação de termos
                    if (!idRealBanco && cnjCode) {
                        for (let i = 0; i < selComp.options.length; i++) {
                            const opt = selComp.options[i];
                            if (opt.value && opt.value !== 'null') {
                                const optText = opt.text.trim();
                                if (optText.includes('(' + cnjCode + ')')) {
                                    idRealBanco = opt.value;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 3. Se id original já for o ID real longo do banco do tribunal (ex: 8 dígitos como 82400454)
            if (!idRealBanco && id && String(id).length >= 7) {
                idRealBanco = String(id);
            }

            // 4. Executa a seleção com os métodos nativos do eProc
            if (win.objAjaxAutoCompEvento) {
                if (indiceNoArrItens !== null) {
                    try { win.objAjaxAutoCompEvento.escolher(indiceNoArrItens); } catch (e) {}
                } else if (idRealBanco) {
                    try { win.objAjaxAutoCompEvento.selecionar(idRealBanco, texto); } catch (e) {}
                }
            }

            // Garante que o input hidden e os gatilhos nativos do eProc foram alimentados
            if (hdnEvento && idRealBanco) {
                hdnEvento.value = idRealBanco;
                if (typeof win.prepararMovimentacao === 'function') {
                    try { win.prepararMovimentacao(idRealBanco); } catch (e) {}
                }
                if (typeof win.buscaEventosComplementares === 'function') {
                    try { win.buscaEventosComplementares(idRealBanco); } catch (e) {}
                }
            }

            // 5. Dispara os eventos de teclado para compatibilidade total com listeners nativos
            if (win.$) {
                let eDown = win.$.Event("keydown");
                eDown.which = 13;
                eDown.keyCode = 13;
                win.$(txtEvento).trigger(eDown);

                let eUp = win.$.Event("keyup");
                eUp.which = 13;
                eUp.keyCode = 13;
                win.$(txtEvento).trigger(eUp);
            }

            const enterEvent = new KeyboardEvent('keydown', {
                bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
            });
            txtEvento.dispatchEvent(enterEvent);

            setTimeout(() => {
                if (hdnEvento && idRealBanco) {
                    hdnEvento.value = idRealBanco;
                }
                txtEvento.dispatchEvent(new Event('blur', { bubbles: true }));
                if (win.$) {
                    win.$(txtEvento).trigger('change').trigger('blur');
                }
            }, 150);

            setTimeout(() => {
                if (hdnEvento && idRealBanco && hdnEvento.value !== idRealBanco) {
                    hdnEvento.value = idRealBanco;
                }
            }, 300);

            txtEvento.style.transition = 'background-color 0.3s';
            txtEvento.style.backgroundColor = '#fff3cd';
            setTimeout(() => txtEvento.style.backgroundColor = '', 1000);

        } else {
            console.error("\u26A1 Smart Eventos: Campo txtEvento não encontrado.");
        }
    }

    // --- FUNÇÕES DE INTERFACE ---
    function fecharDropdown() {
        const dropdown = document.getElementById('smartevt-dropdown');
        if (dropdown) dropdown.style.display = 'none';

        const triggerText = document.getElementById('smartevt-selected-text');
        const searchInput = document.getElementById('smartevt-search-input');

        if (triggerText) triggerText.style.display = 'block';
        if (searchInput) {
            searchInput.style.display = 'none';
            searchInput.value = '';
        }
    }

    function injetarInterface() {
        // REQUISIÇÃO DE RESTRIÇÃO: Só injeta se a "mãe" (field de agendamento/eventos) e o campo existirem na página!
        const fldAgendamento = document.querySelector('#fldEventoAgendamento');
        const txtEvento = document.querySelector('#txtEvento');
        const spnAgendamento = document.querySelector('#spnEventoAgendamento');
        const chkAgendamento = document.querySelector('#chkEventoAgendamento');
        
        const temAgendamento = fldAgendamento && (
            (spnAgendamento && spnAgendamento.textContent.includes('Agendar')) ||
            chkAgendamento ||
            fldAgendamento.textContent.includes('Agendar')
        );

        if (!fldAgendamento || !txtEvento || !temAgendamento || document.querySelector('#smartevt-container')) return;

        let textoInicial = "Buscar Evento...";
        if (txtEvento.value && txtEvento.value.trim() !== "") {
            textoInicial = txtEvento.value.trim();
        }

        sincronizarEstruturaGeral();

        const containerPainel = document.createElement('div');
        containerPainel.id = 'smartevt-container';
        containerPainel.className = 'smartevt-container';

        containerPainel.innerHTML = `
            <div class="smartevt-title">\u26A1 Smart Eventos</div>
            <div class="smartevt-trigger" id="smartevt-trigger">
                <span class="smartevt-trigger-text" id="smartevt-selected-text">${textoInicial}</span>
                <input type="text" id="smartevt-search-input" class="smartevt-search-input" placeholder="\u{1F50D} Filtrar eventos..." autocomplete="off">
                <span style="font-size:10px; margin-left: 8px;">\u25BC</span>
            </div>
            <div class="smartevt-toolbar">
                <button type="button" class="smartevt-icon-btn" id="btn-sync" title="Recarregar e sincronizar eventos" aria-label="Recarregar e sincronizar eventos">${SVG_EVT.sync}</button>
                <button type="button" class="smartevt-org-btn" id="btn-organizar-evt" aria-label="Organizar grupos e eventos" title="Organizar grupos e eventos em uma janela pr\u00F3pria">${SVG_EVT.grid}</button>
            </div>
        `;

        // Posicionamento: Encaixar abaixo do Smart Localizadores se existir, senão perto do campo
        const smartLoc = document.querySelector('#smartloc-container');
        if (smartLoc) {
            smartLoc.parentNode.insertBefore(containerPainel, smartLoc.nextSibling);
        } else {
            let alvoInjecao = fldAgendamento;
            alvoInjecao.parentNode.insertBefore(containerPainel, alvoInjecao);
        }

        txtEvento.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            const triggerText = document.getElementById('smartevt-selected-text');
            if (triggerText) {
                triggerText.textContent = val !== "" ? val : "Buscar Evento...";
            }
        });

        const dropdown = document.createElement('div');
        dropdown.className = 'smartevt-dropdown';
        dropdown.id = 'smartevt-dropdown';

        const listContainer = document.createElement('div');
        listContainer.className = 'smartevt-list-container';
        listContainer.id = 'smartevt-list';

        dropdown.appendChild(listContainer);
        document.body.appendChild(dropdown);

        injetarModaisBody();

        const trigger = containerPainel.querySelector('#smartevt-trigger');
        const searchInput = document.getElementById('smartevt-search-input');
        const triggerText = document.getElementById('smartevt-selected-text');

        const posicionarMenu = () => {
            const rect = trigger.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + window.scrollY + 2) + 'px';
            dropdown.style.left = (rect.left + window.scrollX) + 'px';
            dropdown.style.width = Math.max(450, rect.width) + 'px';

            const spaceBelow = window.innerHeight - rect.bottom - 15;
            dropdown.style.maxHeight = Math.max(200, spaceBelow) + 'px';
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isFechado = dropdown.style.display === 'none' || dropdown.style.display === '';
            if (isFechado) {
                posicionarMenu();
                dropdown.style.display = 'flex';
                renderizarLista();

                triggerText.style.display = 'none';
                searchInput.style.display = 'block';
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                setTimeout(() => searchInput.focus(), 50);
            } else {
                fecharDropdown();
            }
        });

        // Lógica de Filtro
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const grupos = dropdown.querySelectorAll('.smartevt-group');

            grupos.forEach(grupo => {
                let temVisivel = false;
                const itens = grupo.querySelectorAll('.smartevt-item');
                const containerItens = grupo.querySelector('.smartevt-items');

                itens.forEach(item => {
                    const texto = item.textContent.toLowerCase();
                    if (texto.includes(termo)) {
                        item.style.display = '';
                        temVisivel = true;
                    } else {
                        item.style.display = 'none';
                    }
                });

                if (termo !== '') {
                    containerItens.classList.remove('collapsed');
                } else {
                    containerItens.classList.add('collapsed');
                }

                grupo.style.display = (temVisivel || termo === '') ? 'block' : 'none';
            });
        });

        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                fecharDropdown();
            }
        });

        window.addEventListener('resize', () => { if (dropdown.style.display === 'flex') posicionarMenu(); });
        document.addEventListener('scroll', () => { if (dropdown.style.display === 'flex') posicionarMenu(); }, true);

        containerPainel.querySelector('#btn-sync').onclick = () => {
            sincronizarEventosNativos();
        };


        // O Organizador é aberto pelo navegador (evento superproc:organizador-abrir, levado ao host pelo tab-preload.js).
        containerPainel.querySelector('#btn-organizar-evt').onclick = () => window.dispatchEvent(new CustomEvent('superproc:organizador-abrir', { detail: 'evt' }));

        // Na minuta: confere a lista de eventos do tribunal uma vez por dia e avisa só se algo mudou.
        iniciarAtualizacaoAutomatica();
    }

    // --- RENDERIZAÇÃO DA LISTA DO DROPDOWN ---
    function renderizarLista() {
        const listContainer = document.querySelector('#smartevt-list');
        if (!listContainer) return;

        const gruposAbertos = Array.from(listContainer.querySelectorAll('.smartevt-group'))
            .filter(g => !g.querySelector('.smartevt-items').classList.contains('collapsed'))
            .map(g => g.getAttribute('data-group-name'));

        listContainer.innerHTML = '';

        // Sempre reconcilia a base com os grupos antes de desenhar: eventos novos aparecem sem precisar recarregar a página.
        sincronizarEstruturaGeral();
        const { grupos, estrutura } = getEstrutura();

        grupos.forEach(grupoNome => {
            if (grupoNome !== GRUPO_SISTEMA) {
                const isOpen = gruposAbertos.includes(grupoNome);
                criarBlocoGrupo(grupoNome, estrutura[grupoNome] || [], listContainer, false, isOpen);
            }
        });

        if (estrutura['Sem Grupo'] && estrutura['Sem Grupo'].length > 0) {
            const isOpen = gruposAbertos.includes('Sem Grupo');
            criarBlocoGrupo('Sem Grupo', estrutura['Sem Grupo'], listContainer, false, isOpen);
        }

        const searchInput = document.getElementById('smartevt-search-input');
        if (searchInput && searchInput.value.trim() !== '') {
            searchInput.dispatchEvent(new Event('input'));
        }
        // GRUPO_SISTEMA permanece oculto na interface, servindo de base para "Sem Grupo" e grupos customizados
    }

    function criarBlocoGrupo(nome, itensObjs, container, isReadOnly = false, isOpen = false) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'smartevt-group';
        groupDiv.setAttribute('data-group-name', nome);

        const header = document.createElement('div');
        header.className = 'smartevt-group-header';
        if (isReadOnly) header.style.backgroundColor = '#e2e3e5';

        header.innerHTML = `<span>${nome} (${itensObjs.length})</span> <span class="toggle-icon">\u25BC</span>`;

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'smartevt-items';
        if (!isOpen) itemsContainer.classList.add('collapsed');

        let hoverTimer;
        groupDiv.addEventListener('mouseenter', () => {
            const dropdown = document.getElementById('smartevt-dropdown');
            if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
            if (!isReadOnly) {
                hoverTimer = setTimeout(() => {
                    itemsContainer.classList.remove('collapsed');
                }, 500);
            }
        });

        groupDiv.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimer);
            const dropdown = document.getElementById('smartevt-dropdown');
            if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
            const searchInput = document.getElementById('smartevt-search-input');
            if (!draggedItemObj && searchInput && searchInput.value.trim() === '') {
                itemsContainer.classList.add('collapsed');
            }
        });

        header.addEventListener('click', () => {
            const dropdown = document.getElementById('smartevt-dropdown');
            if (dropdown && dropdown.classList.contains('is-dragging-mode')) return;
            itemsContainer.classList.toggle('collapsed');
        });

        if (!isReadOnly) {
            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                header.classList.add('drag-over');
            });
            header.addEventListener('dragleave', () => header.classList.remove('drag-over'));
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                header.classList.remove('drag-over');
                const dropdown = document.getElementById('smartevt-dropdown');
                if (dropdown) dropdown.classList.remove('is-dragging-mode');
                if (draggedItemObj) {
                    moverItem(draggedItemObj, nome);
                }
            });
        }

        if (itensObjs.length === 0) {
            itemsContainer.innerHTML = `<div class="smartevt-empty-notice">${isReadOnly ? "Clique no botão 🔄 para ler os eventos" : "Arraste itens para cá"}</div>`;
        } else {
            itensObjs.forEach(obj => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'smartevt-item';
                itemDiv.draggable = true;

                itemDiv.innerHTML = `
                    <span class="smartevt-item-text" title="${obj.text}">${obj.text}</span>
                    ${!isReadOnly ? `<button class="smartevt-item-del" title="Excluir evento">❌</button>` : ''}
                `;

                itemDiv.querySelector('.smartevt-item-text').addEventListener('click', (e) => {
                    e.stopPropagation();
                    aplicarEventoNoEproc(obj.id, obj.text);
                });

                if (!isReadOnly) {
                    itemDiv.querySelector('.smartevt-item-del').addEventListener('click', (e) => {
                        e.stopPropagation();
                        if(confirm("Remover este evento do grupo?")) {
                            let { grupos, estrutura } = getEstrutura();
                            estrutura[nome] = estrutura[nome].filter(i => i.text !== obj.text);
                            salvarEstrutura(grupos, estrutura);
                            renderizarLista();
                        }
                    });
                }

                itemDiv.addEventListener('dragstart', (e) => {
                    draggedItemObj = obj;
                    itemDiv.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'copyMove';
                    try {
                        e.dataTransfer.setData('text/plain', obj.text);
                    } catch (err) {}

                    setTimeout(() => {
                        if (draggedItemObj) {
                            const dropdown = document.getElementById('smartevt-dropdown');
                            if (dropdown) dropdown.classList.add('is-dragging-mode');
                        }
                    }, 0);
                });
                itemDiv.addEventListener('dragend', () => {
                    itemDiv.classList.remove('dragging');
                    draggedItemObj = null;
                    const dropdown = document.getElementById('smartevt-dropdown');
                    if (dropdown) {
                        dropdown.classList.remove('is-dragging-mode');
                        const searchInput = document.getElementById('smartevt-search-input');
                        if (searchInput) searchInput.dispatchEvent(new Event('input'));
                    }
                });

                itemsContainer.appendChild(itemDiv);
            });
        }

        groupDiv.appendChild(header);
        groupDiv.appendChild(itemsContainer);
        container.appendChild(groupDiv);
    }

    function moverItem(obj, grupoDestino) {
        let { grupos, estrutura } = getEstrutura();
        
        // Remove de grupos customizados (Se vier da base do sistema, apenas copia)
        Object.keys(estrutura).forEach(grp => {
            if (grp !== GRUPO_SISTEMA) {
                estrutura[grp] = estrutura[grp].filter(v => v.text !== obj.text);
            }
        });

        if (!estrutura[grupoDestino]) estrutura[grupoDestino] = [];
        
        const jaExiste = estrutura[grupoDestino].find(v => v.text === obj.text);
        if (!jaExiste) {
            estrutura[grupoDestino].push(obj);
        }

        salvarEstrutura(grupos, estrutura);
        renderizarLista();
    }

    // --- GERENCIAMENTO DE MODAIS ---
    function injetarModaisBody() {
        if(document.querySelector('#smartevt-overlay-cfg')) return;

        const modalCfg = document.createElement('div');
        modalCfg.id = 'smartevt-overlay-cfg';
        modalCfg.className = 'smartevt-overlay';
        modalCfg.innerHTML = `
            <div class="smartevt-modal">
                <div class="smartevt-modal-header">
                    <span>\u2699\uFE0F Organizar Grupos de Eventos</span>
                    <button class="smartevt-modal-close" onclick="document.getElementById('smartevt-overlay-cfg').style.display='none'">\u2716</button>
                </div>
                <div class="smartevt-modal-body">
                    <p style="font-size:12px; color:#666; margin-top:0;">Arraste para reordenar. O X exclui o grupo (itens vão para Sem Grupo).</p>
                    <div id="smartevt-cfg-list"></div>
                </div>
            </div>
        `;

        const modalBloco = document.createElement('div');
        modalBloco.id = 'smartevt-overlay-bloco';
        modalBloco.className = 'smartevt-overlay';
        modalBloco.innerHTML = `
            <div class="smartevt-modal">
                <div class="smartevt-modal-header">
                    <span>\u{1F4E6} Inclusão em Bloco (Eventos)</span>
                    <button class="smartevt-modal-close" onclick="document.getElementById('smartevt-overlay-bloco').style.display='none'">\u2716</button>
                </div>
                <div class="smartevt-modal-body">
                    <label style="font-size:12px; font-weight:bold;">Grupo de Destino:</label>
                    <select id="bloco-alvo" class="smartevt-input"></select>

                    <label style="font-size:12px; font-weight:bold;">Texto a procurar no Evento:</label>
                    <input type="text" id="bloco-termo" class="smartevt-input" placeholder="Ex: DECISÃO" style="display:block;">

                    <button id="bloco-executar" class="smartevt-btn-primary">Puxar Eventos</button>
                </div>
            </div>
        `;

        const modalNewGrp = document.createElement('div');
        modalNewGrp.id = 'smartevt-overlay-newgrp';
        modalNewGrp.className = 'smartevt-overlay';
        modalNewGrp.innerHTML = `
            <div class="smartevt-modal">
                <div class="smartevt-modal-header">
                    <span>➕ Criar Novo Grupo de Eventos</span>
                    <button class="smartevt-modal-close" onclick="document.getElementById('smartevt-overlay-newgrp').style.display='none'">✖</button>
                </div>
                <div class="smartevt-modal-body">
                    <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:5px;">Nome do Grupo:</label>
                    <input type="text" id="smartevt-new-grp-input" class="smartevt-input" placeholder="Ex: DECISÕES, AUDIÊNCIAS..." autocomplete="off">
                    <div id="smartevt-new-grp-error" style="color:#dc3545; font-size:11px; margin-top:-10px; margin-bottom:10px; display:none;"></div>
                    <div style="display:flex; gap:10px;">
                        <button id="btn-confirm-evt-newgrp" class="smartevt-btn-primary" style="flex:1;">Criar Grupo</button>
                        <button type="button" onclick="document.getElementById('smartevt-overlay-newgrp').style.display='none'" style="flex:1; padding:10px; background:#e9ecef; border:1px solid #ced4da; border-radius:4px; cursor:default; font-weight:bold; color:#495057;">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalCfg);
        document.body.appendChild(modalBloco);
        document.body.appendChild(modalNewGrp);
    }

    function abrirModalNovoGrupo() {
        const overlay = document.getElementById('smartevt-overlay-newgrp');
        const input = document.getElementById('smartevt-new-grp-input');
        const errorDiv = document.getElementById('smartevt-new-grp-error');
        const btnConfirm = document.getElementById('btn-confirm-evt-newgrp');
        if (!overlay || !input) return;

        input.value = '';
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
        overlay.style.display = 'flex';
        setTimeout(() => input.focus(), 50);

        const confirmar = () => {
            const nome = input.value.trim();
            if (!nome) {
                errorDiv.textContent = 'Por favor, informe o nome do grupo.';
                errorDiv.style.display = 'block';
                input.focus();
                return;
            }
            if (nome.toLowerCase() === 'sem grupo' || nome.toLowerCase() === 'ocultos' || nome === GRUPO_SISTEMA) {
                errorDiv.textContent = 'Nome reservado pelo sistema.';
                errorDiv.style.display = 'block';
                input.focus();
                return;
            }

            let { grupos, estrutura } = getEstrutura();
            if (grupos.some(g => g.toLowerCase() === nome.toLowerCase())) {
                errorDiv.textContent = 'Já existe um grupo com este nome.';
                errorDiv.style.display = 'block';
                input.focus();
                return;
            }

            const index = grupos.indexOf(GRUPO_SISTEMA);
            if (index !== -1) grupos.splice(index, 0, nome);
            else grupos.push(nome);

            if (!estrutura[nome]) estrutura[nome] = [];
            salvarEstrutura(grupos, estrutura);

            overlay.style.display = 'none';

            // Garante abertura e renderização do grupo
            const dropdown = document.getElementById('smartevt-dropdown');
            const triggerText = document.getElementById('smartevt-selected-text');
            const searchInput = document.getElementById('smartevt-search-input');
            const listContainer = document.getElementById('smartevt-list');

            if (dropdown) {
                const isFechado = dropdown.style.display === 'none' || dropdown.style.display === '';
                if (isFechado) {
                    posicionarMenu();
                    dropdown.style.display = 'flex';
                    if (triggerText) triggerText.style.display = 'none';
                    if (searchInput) searchInput.style.display = 'block';
                }
                if (searchInput) searchInput.value = '';
                renderizarLista();

                setTimeout(() => {
                    const grupoElem = listContainer ? listContainer.querySelector(`[data-group-name="${CSS.escape(nome)}"]`) : null;
                    if (grupoElem) {
                        grupoElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        const headerElem = grupoElem.querySelector('.smartevt-group-header');
                        if (headerElem) {
                            headerElem.style.transition = 'background-color 0.4s';
                            headerElem.style.backgroundColor = '#ffeeba';
                            setTimeout(() => headerElem.style.backgroundColor = '', 1200);
                        }
                    }
                }, 100);
            }
        };

        btnConfirm.onclick = confirmar;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmar();
            } else if (e.key === 'Escape') {
                overlay.style.display = 'none';
            }
        };
    }

    function mostrarQuickDrop() {
        let panel = document.getElementById('smartevt-quick-drop');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'smartevt-quick-drop';
            panel.className = 'smartevt-quick-drop';
            document.body.appendChild(panel);
        }

        panel.innerHTML = '<div class="smartevt-quick-drop-title">Solte Aqui:</div>';
        const { grupos } = getEstrutura();
        const alvos = grupos.filter(g => g !== GRUPO_SISTEMA);
        alvos.push('Sem Grupo');

        alvos.forEach(g => {
            const target = document.createElement('div');
            target.className = 'smartevt-quick-drop-target';
            target.textContent = g;

            target.addEventListener('dragover', (e) => { e.preventDefault(); target.classList.add('drag-over'); });
            target.addEventListener('dragleave', () => target.classList.remove('drag-over'));
            target.addEventListener('drop', (e) => {
                e.preventDefault();
                target.classList.remove('drag-over');
                if (draggedItemObj) {
                    moverItem(draggedItemObj, g);
                    ocultarQuickDrop();
                }
            });
            panel.appendChild(target);
        });

        const dropdown = document.getElementById('smartevt-dropdown');
        const rect = dropdown.getBoundingClientRect();
        panel.style.top = Math.max(10, rect.top) + 'px';

        if (rect.right + 210 > window.innerWidth) {
            panel.style.left = Math.max(0, rect.left - 210) + 'px';
        } else {
            panel.style.left = (rect.right + 10) + 'px';
        }
        panel.style.display = 'flex';
    }

    function ocultarQuickDrop() {
        const panel = document.getElementById('smartevt-quick-drop');
        if (panel) panel.style.display = 'none';
    }

    function abrirModalConfiguracao() {
        const overlay = document.getElementById('smartevt-overlay-cfg');
        const listDiv = document.getElementById('smartevt-cfg-list');
        overlay.style.display = 'flex';

        function renderizarListaConfig() {
            listDiv.innerHTML = '';
            let { grupos, estrutura } = getEstrutura();
            let dragSourceIndex = null;

            const gruposFiltrados = grupos.filter(g => g !== GRUPO_SISTEMA);

            if(gruposFiltrados.length === 0) {
                listDiv.innerHTML = '<span style="font-size:12px; color:#999;">Nenhum grupo criado.</span>';
                return;
            }

            gruposFiltrados.forEach((grupoNome, index) => {
                const item = document.createElement('div');
                item.className = 'smartevt-cfg-item';
                item.draggable = true;
                    item.innerHTML = `<span>≡ ${grupoNome}</span><span class="smartevt-cfg-actions"><button type="button" class="smartevt-cfg-move" data-move="up" title="Mover grupo para cima" ${index === 0 ? 'disabled' : ''}>▲</button><button type="button" class="smartevt-cfg-move" data-move="down" title="Mover grupo para baixo" ${index === gruposFiltrados.length - 1 ? 'disabled' : ''}>▼</button><button type="button" class="smartevt-cfg-del" title="Excluir Grupo">X</button></span>`;

                    const salvarOrdem = () => {
                        const basePresente = grupos.includes(GRUPO_SISTEMA);
                        salvarEstrutura(basePresente ? [...gruposFiltrados, GRUPO_SISTEMA] : gruposFiltrados, estrutura);
                        renderizarListaConfig();
                        renderizarLista();
                    };
                    const moverGrupo = (direction) => {
                        const currentIndex = gruposFiltrados.indexOf(grupoNome);
                        const targetIndex = currentIndex + direction;
                        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= gruposFiltrados.length) return;
                        [gruposFiltrados[currentIndex], gruposFiltrados[targetIndex]] = [gruposFiltrados[targetIndex], gruposFiltrados[currentIndex]];
                        salvarOrdem();
                    };
                    item.querySelector('[data-move="up"]').onclick = event => { event.stopPropagation(); moverGrupo(-1); };
                    item.querySelector('[data-move="down"]').onclick = event => { event.stopPropagation(); moverGrupo(1); };

                item.querySelector('.smartevt-cfg-del').onclick = () => {
                    if(confirm(`Tem certeza que deseja excluir o grupo "${grupoNome}"? Os eventos voltarão para "Sem Grupo".`)) {
                        let itensDoGrupo = estrutura[grupoNome] || [];
                        estrutura['Sem Grupo'].push(...itensDoGrupo);
                        delete estrutura[grupoNome];
                        grupos.splice(grupos.indexOf(grupoNome), 1);
                        salvarEstrutura(grupos, estrutura);
                        renderizarListaConfig();
                        renderizarLista();
                    }
                };

                item.addEventListener('dragstart', (e) => {
                    dragSourceIndex = gruposFiltrados.indexOf(grupoNome);
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', grupoNome);
                });
                item.addEventListener('dragend', () => item.classList.remove('dragging'));
                item.addEventListener('dragover', (e) => { e.preventDefault(); });
                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const dropIndex = gruposFiltrados.indexOf(grupoNome);
                    if (dragSourceIndex !== null && dragSourceIndex !== dropIndex) {
                        const movido = gruposFiltrados.splice(dragSourceIndex, 1)[0];
                        gruposFiltrados.splice(dropIndex, 0, movido);
                        salvarOrdem();
                    }
                });

                listDiv.appendChild(item);
            });
        }
        renderizarListaConfig();
    }

    function abrirModalBloco() {
        const overlay = document.getElementById('smartevt-overlay-bloco');
        const selectAlvo = document.getElementById('bloco-alvo');
        const inputTermo = document.getElementById('bloco-termo');
        const btnExecutar = document.getElementById('bloco-executar');

        let { grupos } = getEstrutura();
        const alvos = grupos.filter(g => g !== GRUPO_SISTEMA);

        selectAlvo.innerHTML = '';
        const allOptions = [...alvos, 'Sem Grupo'];
        allOptions.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            selectAlvo.appendChild(opt);
        });

        inputTermo.value = '';
        overlay.style.display = 'flex';

        btnExecutar.onclick = () => {
            const termo = inputTermo.value.trim().toLowerCase();
            const alvo = selectAlvo.value;

            if (termo === '') {
                alert("Digite um termo para a busca.");
                return;
            }

            let { grupos, estrutura } = getEstrutura();
            let contagemMoved = 0;

            Object.keys(estrutura).forEach(grpAtual => {
                if (grpAtual === alvo || grpAtual === 'Ocultos') return; // itens ocultos não entram no lote

                estrutura[grpAtual] = estrutura[grpAtual].filter(item => {
                    if (item.text.toLowerCase().includes(termo)) {
                        if (!estrutura[alvo]) estrutura[alvo] = [];

                        const jaExiste = estrutura[alvo].find(v => v.text === item.text);
                        if (!jaExiste) {
                            estrutura[alvo].push(item);
                            contagemMoved++;
                        }

                        if (grpAtual === GRUPO_SISTEMA) return true;
                        return false;
                    }
                    return true;
                });
            });

            if (contagemMoved > 0) {
                salvarEstrutura(grupos, estrutura);
                renderizarLista();
                alert(`\u2705 Sucesso! ${contagemMoved} evento(s) movido/copiado(s) para "${alvo}".`);
                overlay.style.display = 'none';
            } else {
                alert(`Nenhum evento encontrado contendo "${inputTermo.value}" fora do grupo "${alvo}".`);
            }
        };
    }

    // --- INICIALIZAÇÃO ---
    const observer = new MutationObserver(() => injetarInterface());
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.body) observer.observe(document.body, { childList: true, subtree: true });
            injetarInterface();
        });
    }

    injetarInterface();
    setTimeout(injetarInterface, 300);
    setTimeout(injetarInterface, 1000);
    setTimeout(injetarInterface, 2500);
})();
  };
  if (permitido()) { iniciar(); return; }
  if (!document.body) return;
  const obs = new MutationObserver(() => { if (permitido()) { obs.disconnect(); iniciar(); } });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 3000);
})();
