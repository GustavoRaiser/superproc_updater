/**
 * SuperPROC - Módulo: Editor - Menu Rápido de Eventos
 *
 * Um atalho de teclado (escolhido e memorizado pelo usuário no popup) abre, sobre o editor, um campo
 * onde se digita o número do evento (evento com vários documentos abre a lista de documentos). Escolher
 * insere no texto o link "evento N"
 * (<span class="widgetlinkdocumento" ...>), sem o usuário tirar as mãos do teclado.
 *
 * O módulo tem dois papéis, conforme a página em que roda:
 *  - árvore (arvore_documento_listar): só RESPONDE aos pedidos do editor com a lista de eventos lida
 *    do DOM (nada é modificado; o AZFLOW não é tocado);
 *  - editor (minuta_editar): guarda o atalho, desenha o menu e pede a inserção ao CKEditor.
 *
 * A árvore e o editor ficam em views diferentes do navegador; a ponte é um BroadcastChannel
 * (mesma origem e mesma sessão), filtrado pelo número do processo. Nada é gravado em disco.
 */
import { combina, normalizarSalvo } from './menu_eventos/atalho.js';
import { digitos, lerEventosDaArvore, sanitizarSnapshot, montarSpanLink, textoDoLink } from './menu_eventos/arvore.js';
import { criarMenu } from './menu_eventos/menu_ui.js';

const CANAL = 'superproc-menu-eventos-v1';
const MARCA = 'menu-eventos';
const PREFIXO = '[SuperPROC: Menu de Eventos]';
const ESPERA_SEM_ARVORE_MS = 1200;

function iniciarArvore(params) {
    if (typeof BroadcastChannel === 'undefined') return;
    const processo = digitos(params.get('txtNumProcesso'));
    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (ev) => {
        const pedido = ev.data;
        if (!pedido || pedido.t !== 'pedido') return;
        if (pedido.processo && processo && pedido.processo !== processo) return;
        const { eventos, semLink } = lerEventosDaArvore(document);
        if (!eventos.length) return; // árvore ainda carregando: o editor tenta de novo
        canal.postMessage({ t: 'snapshot', processo, eventos, semLink });
    };
    window.addEventListener('pagehide', () => canal.close(), { once: true });
    console.debug(`${PREFIXO} árvore pronta para responder ao editor.`);
}

function iniciarEditor({ meta, params, storage }) {
    const processo = digitos(params.get('num_processo'));
    const podeCanal = typeof BroadcastChannel !== 'undefined';
    const canal = podeCanal ? new BroadcastChannel(CANAL) : null;
    let atalho = null;
    let cache = null;
    let esperaTimer = null;
    let aberturaTimer = null;

    const aMain = (dados) => window.postMessage({ __sp: MARCA, de: 'iso', ...dados }, location.origin === 'null' ? '*' : location.origin);
    const pedirEventos = () => canal?.postMessage({ t: 'pedido', processo });

    const menu = criarMenu({
        combinaAtalho: (evento) => combina(evento, atalho),
        aoEscolher({ evento, doc, parenteses, soEvento, pagina }) {
            // Ctrl: o texto do link é só "evento N" (o link continua apontando para o documento escolhido).
            const base = soEvento ? `evento ${evento.n}` : textoDoLink(evento, doc);
            const texto = pagina ? `${base}, p. ${pagina}` : base; // com página: "evento 2, p. 5" / "evento 2, ANEXO5, p. 3"
            aMain({ tipo: 'inserir', html: montarSpanLink(pagina ? { ...doc, page: String(pagina) } : doc, texto, document), parenteses: !!parenteses });
            console.debug(`${PREFIXO} evento ${evento.n} escolhido para inserção.`, { soEvento: !!soEvento, parenteses: !!parenteses, docsDoEvento: evento.docs.length, textoEnviado: texto });
        },
        aoFechar({ devolverFoco, anterior }) {
            clearTimeout(esperaTimer);
            if (!devolverFoco) return;
            const ehEditorEmIframe = !anterior || anterior.tagName === 'IFRAME' || anterior === document.body;
            if (ehEditorEmIframe) {
                // Foco devolvido na hora (a próxima tecla já cai no texto); o editor restaura o cursor em seguida.
                try { anterior?.contentWindow?.focus(); } catch (_) { /* iframe de outra origem: o editor cuida */ }
                aMain({ tipo: 'fechar' });
            }
            else if (anterior.isConnected) anterior.focus?.({ preventScroll: true });
        }
    });

    function abrir(ativo, linha) {
        if (menu.aberto()) return;
        clearTimeout(aberturaTimer);
        menu.abrir({ snapshot: cache, ativo, linha });
        pedirEventos(); // atualiza o cache (e preenche o menu, se ainda estiver vazio)
        if (!cache) {
            clearTimeout(esperaTimer);
            esperaTimer = setTimeout(() => menu.definirAviso(
                'Não encontrei a árvore deste processo. Deixe a árvore aberta ao lado do editor (mesmo processo) e tente de novo.'
            ), ESPERA_SEM_ARVORE_MS);
        }
    }

    if (canal) {
        canal.onmessage = (ev) => {
            const dado = ev.data;
            if (!dado || dado.t !== 'snapshot') return;
            if (processo && dado.processo && dado.processo !== processo) return;
            const snapshot = sanitizarSnapshot(dado);
            if (!snapshot.eventos.length) return;
            cache = snapshot;
            clearTimeout(esperaTimer);
            menu.receberDados(snapshot);
        };
        window.addEventListener('pagehide', () => canal.close(), { once: true });
    }

    // ---- Atalho (memorizado no popup; lido do armazenamento e atualizado sem recarregar) ----
    const enviarConfiguracao = () => aMain({ tipo: 'config', atalho });
    async function carregarAtalho() {
        try {
            const config = await storage.getModuleSettings(meta.id);
            atalho = normalizarSalvo(config?.atalho);
            enviarConfiguracao();
        } catch (erro) {
            console.warn(`${PREFIXO} não foi possível ler o atalho memorizado.`, erro);
        }
    }

    // Atalho pressionado com o foco FORA do iframe do CKEditor (o do iframe é tratado no script principal).
    document.addEventListener('keydown', (evento) => {
        if (!atalho || evento.repeat || menu.aberto() || !combina(evento, atalho)) return;
        evento.preventDefault();
        evento.stopPropagation();
        const ativo = document.activeElement;
        aMain({ tipo: 'preparar' }); // guarda a seleção e mede a linha do cursor; o script principal responde 'abrir'
        clearTimeout(aberturaTimer);
        aberturaTimer = setTimeout(() => abrir(ativo, null), 150); // sem resposta: abre no meio da janela
    }, true);

    window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (ev.source !== window || !d || d.__sp !== MARCA || d.de !== 'main') return;
        if (d.tipo === 'pronto') enviarConfiguracao();
        else if (d.tipo === 'abrir') abrir(document.activeElement, d.linha);
        else if (d.tipo === 'resultado' && !d.ok) menu.toast(d.motivo || 'Não foi possível inserir o evento no texto.');
        else if (d.tipo === 'resultado' && d.aviso) menu.toast(d.aviso);
    });

    // Script do mundo principal (acesso ao CKEDITOR): captura o atalho dentro do iframe e insere o link.
    if (!document.getElementById('superproc-menu-eventos-main')) {
        const script = document.createElement('script');
        script.id = 'superproc-menu-eventos-main';
        script.charset = 'UTF-8';
        script.src = chrome.runtime.getURL('modules/editor/menu_eventos_rapido_main.js');
        script.onerror = () => console.error(`${PREFIXO} não foi possível carregar o script do editor.`);
        (document.head || document.documentElement).appendChild(script);
    }

    carregarAtalho();
    try { chrome.storage?.onChanged?.addListener((mudancas) => { if (mudancas.superproc_custom_settings) carregarAtalho(); }); } catch (_) { /* sem onChanged: o foco da janela relê */ }
    window.addEventListener('focus', () => { carregarAtalho(); pedirEventos(); });

    // Cache aquecido: o menu abre na hora; a árvore pode terminar de carregar depois do editor.
    [0, 1500, 4500].forEach((atraso) => setTimeout(pedirEventos, atraso));
    console.debug(`${PREFIXO} editor pronto (atalho ${atalho ? 'memorizado' : 'ainda não memorizado'}).`);
}

export default {
    init({ meta, params, storage }) {
        const acao = params.get('acao');
        if (acao === 'arvore_documento_listar') iniciarArvore(params);
        else if (acao === 'minuta_editar') iniciarEditor({ meta, params, storage });
    }
};
