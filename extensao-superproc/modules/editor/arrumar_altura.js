/**
 * SuperPROC — Editor: Arrumar Altura
 *
 * Recupera o comportamento original do editor: a página usa a janela inteira
 * como área de trabalho e cada iframe do CKEditor acompanha a altura real do
 * conteúdo (`scrollHeight`). Não interfere na escolha de botões da toolbar.
 */

const STYLE_ID = 'superproc-editor-arrumar-altura-style';
let pending = false;
let observing = false;
let lembreteFechadoInicialmente = false;
let tentativasFecharLembrete = 0;

function injetarEstilosOriginais() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* A estrutura compartilhada mantém o layout nativo em páginas com menu lateral. */
        html:not(:has(#sidebar-wrapper)),
        html:not(:has(#sidebar-wrapper)) :is(body, #divInfraAreaGlobal, #wrapper, #page-content-wrapper, #divInfraAreaTela, #divInfraAreaTelaD) {
            height: 100vh !important;
            max-height: 100vh !important;
            overflow: hidden !important;
            margin: 0 !important;
        }
        html:not(:has(#sidebar-wrapper)) #divInfraAreaTelaD {
            display: flex !important;
            flex-direction: column !important;
        }
        html:not(:has(#sidebar-wrapper)) #divInfraAreaDados {
            flex: 1 1 auto !important;
            height: 0 !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            display: block !important;
        }
        html:not(:has(#sidebar-wrapper)) #bottom { flex-shrink: 0 !important; }
        .cke_chrome {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            margin: 0 !important;
        }
        .cke_inner { padding: 0 !important; margin: 0 !important; }
        .cke_contents {
            height: auto !important;
            min-height: 20px !important;
            background: transparent !important;
            overflow: hidden !important;
        }
        .cke_wysiwyg_frame { min-height: 100% !important; }
    `;
    document.head.appendChild(style);
}

function ajustarAlturaIframesOriginal() {
    pending = false;
    document.querySelectorAll('.cke_contents').forEach(div => {
        const iframe = div.querySelector('iframe');
        if (!iframe) return;
        try {
            const body = iframe.contentDocument?.body;
            if (!body) return;
            const height = Math.max(body.scrollHeight, body.offsetHeight);
            if (height > 10) {
                const finalHeight = `${height + 10}px`;
                div.style.setProperty('height', finalHeight, 'important');
                iframe.style.setProperty('height', finalHeight, 'important');
            }
        } catch (_) {
            // O CKEditor pode ainda estar carregando ou o frame pode ser trocado.
        }
    });
}

function agendarAltura() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(ajustarAlturaIframesOriginal);
}

// O editor abre o painel lateral de Lembretes em algumas minutas. Fecha apenas
// na inicialização: nunca em observadores, para não interromper uma abertura
// manual posterior do usuário.
function fecharLembreteInicial() {
    if (lembreteFechadoInicialmente || tentativasFecharLembrete >= 24) return;
    tentativasFecharLembrete++;

    const roots = Array.from(document.querySelectorAll(
        '#fldLembretes, #divLembretes, [id*="Lembrete" i], [class*="Lembrete" i]'
    ));
    const fechar = roots.flatMap(root => Array.from(root.querySelectorAll('a, button, input[type="button"], input[type="submit"]')))
        .find(control => /^(fechar|close)$/i.test((control.value || control.textContent || '').trim()));

    if (fechar) {
        lembreteFechadoInicialmente = true;
        try { fechar.click(); } catch (_) {}
        return;
    }

    setTimeout(fecharLembreteInicial, 250);
}

function observarIframes() {
    document.querySelectorAll('.cke_wysiwyg_frame').forEach(iframe => {
        if (iframe.dataset.superprocAlturaObservada) return;
        iframe.dataset.superprocAlturaObservada = 'true';
        iframe.addEventListener('load', () => {
            agendarAltura();
            try {
                const body = iframe.contentDocument?.body;
                if (body) new MutationObserver(agendarAltura).observe(body, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            } catch (_) {}
        });
    });
}

function iniciar() {
    injetarEstilosOriginais();
    observarIframes();
    agendarAltura();
    setTimeout(fecharLembreteInicial, 120);
    if (observing) return;
    observing = true;
    window.addEventListener('resize', agendarAltura, { passive: true });
    new MutationObserver(() => {
        observarIframes();
        agendarAltura();
    }).observe(document.documentElement, { childList: true, subtree: true });
    if (window.CKEDITOR?.on) {
        window.CKEDITOR.on('instanceReady', () => {
            observarIframes();
            agendarAltura();
        });
    }
}

export default {
    id: 'editor_arrumar_altura',
    name: 'Editor - Arrumar Altura',
    category: 'Editor de Minutas',
    description: 'Usa o redimensionamento original por scrollHeight para preencher a área útil do editor.',
    defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    async init() {
        if (window.__superprocEditorArrumarAlturaInjetado) return;
        window.__superprocEditorArrumarAlturaInjetado = true;
        iniciar();
    }
};
