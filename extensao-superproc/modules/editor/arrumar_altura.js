/**
 * SuperPROC — Editor: Arrumar Altura (v2)
 *
 * Ajusta a minuta à janela, sem faixas em branco no topo/base (com ou sem barra de acessibilidade), e fecha o painel de
 * Lembretes que abre junto com a minuta. No navegador SuperPROC este módulo é executado por
 * browser/eproc-recursos/editor-altura.js (mesma lógica); aqui fica para quem usa só a extensão.
 *
 * Estrutura da página: #divInfraAreaTelaD > #top (barra de ferramentas), #infoMessage, #lembrete, #divInfraAreaDados
 * (a minuta; o eproc fixa height: calc(100vh - 270.5px), origem da sobra) e #bottom (barra de status).
 * Não força display em nada e não esconde elementos: só mede e ajusta alturas.
 */

const STYLE_ID = 'superproc-editor-arrumar-altura-style';
const CLASSE_ATIVO = 'superproc-ah-ativo';
const CLASSE_ANCESTRAL = 'superproc-ah-ancestral';
const CLASSE_AREA = 'superproc-ah-area';
const FOLGA_IFRAME = 10; // mesmo valor do redimensionamento original
const JANELA_LEMBRETE_MS = 15000;

let pending = false;
let observing = false;
let lembreteFechado = false;
let inicioLembrete = 0;
let area = null;

function injetarEstilos() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        html.${CLASSE_ATIVO}, html.${CLASSE_ATIVO} body {
            margin: 0 !important;
            overflow: hidden !important;
        }
        /* Só as margens/paddings verticais dos ancestrais da minuta: as sobras de espaço vêm deles (ex.: mt-2). */
        /* Especificidade maior que a do Bootstrap do eproc (.bootstrap-styles .mt-2 { margin-top: .5rem !important }). */
        html.${CLASSE_ATIVO} .${CLASSE_ANCESTRAL}.${CLASSE_ANCESTRAL} {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
        }
        /* Margem de "papel" no alto da minuta (Body 10 px + Content 10 px + article 35 px = ~55 px em branco acima do texto). */
        html.${CLASSE_ATIVO} #divInfraAreaDados #Body,
        html.${CLASSE_ATIVO} #divInfraAreaDados #Content { padding-top: 0 !important; }
        html.${CLASSE_ATIVO} #divInfraAreaDados #Content > article { padding-top: 4px !important; }
        /* Única área que rola: a minuta. A altura exata é definida por JS (topo medido na hora). */
        .${CLASSE_AREA} {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
        }
        .cke_chrome:not(.cke_shared) {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            margin: 0 !important;
        }
        .cke_chrome:not(.cke_shared) .cke_inner { padding: 0 !important; margin: 0 !important; }
        .cke_chrome:not(.cke_shared) .cke_contents {
            height: auto;
            min-height: 20px;
            background: transparent !important;
            overflow: hidden !important;
        }
    `;
    document.head.appendChild(style);
}

/* ---------- Área da minuta ---------- */

function acharArea() {
    if (area && area.isConnected) return area;
    area = document.getElementById('divInfraAreaDados');
    if (!area) {
        // Fallback: ancestral do primeiro editor visível que já rola por conta própria.
        const chrome = Array.from(document.querySelectorAll('.cke_chrome:not(.cke_shared)')).find(c => c.offsetHeight > 0);
        for (let el = chrome && chrome.parentElement; el && el !== document.body; el = el.parentElement) {
            const oy = getComputedStyle(el).overflowY;
            if (oy === 'auto' || oy === 'scroll') { area = el; break; }
        }
    }
    return area;
}

function visivelEmFluxo(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (cs.position === 'fixed' || cs.position === 'absolute') return false;
    return el.offsetHeight > 0;
}

/** Altura de tudo que fica abaixo da área, até o fim da janela (barra de status, margens). */
function alturaAbaixo(alvo) {
    let total = 0;
    for (let el = alvo; el && el !== document.body; el = el.parentElement) {
        const cs = getComputedStyle(el);
        total += parseFloat(cs.marginBottom) || 0;
        for (let irmao = el.nextElementSibling; irmao; irmao = irmao.nextElementSibling) {
            if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(irmao.tagName)) continue;
            if (!visivelEmFluxo(irmao)) continue;
            const s = getComputedStyle(irmao);
            total += irmao.getBoundingClientRect().height + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0);
        }
    }
    return total;
}

function ajustarArea() {
    const alvo = acharArea();
    if (!alvo) return;
    document.documentElement.classList.add(CLASSE_ATIVO);
    alvo.classList.add(CLASSE_AREA);
    for (let el = alvo.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        el.classList.add(CLASSE_ANCESTRAL);
    }
    const topo = alvo.getBoundingClientRect().top;
    // Sem arredondar para baixo: o topo da área costuma ser fracionário (ex.: 164,11 px) e o floor deixava ~1 px de folga embaixo.
    const altura = Math.round((window.innerHeight - topo - alturaAbaixo(alvo)) * 100) / 100;
    if (altura > 80 && alvo.style.getPropertyValue('height') !== `${altura}px`) {
        alvo.style.setProperty('height', `${altura}px`, 'important');
    }
}

/* ---------- Altura dos iframes (comportamento original: scrollHeight) ---------- */

function ajustarIframes() {
    document.querySelectorAll('.cke_chrome:not(.cke_shared) .cke_contents').forEach(div => {
        if (!div.offsetParent) return; // editor oculto
        const iframe = div.querySelector('iframe');
        if (!iframe) return;
        try {
            const body = iframe.contentDocument && iframe.contentDocument.body;
            if (!body) return;
            const conteudo = Math.max(body.scrollHeight, body.offsetHeight);
            if (conteudo <= 10) return;
            const final = `${conteudo + FOLGA_IFRAME}px`;
            if (div.style.height !== final) div.style.setProperty('height', final, 'important');
            if (iframe.style.height !== final) iframe.style.setProperty('height', final, 'important');
        } catch (_) {
            // O CKEditor pode ainda estar carregando ou o frame pode ser trocado.
        }
    });
}

function executar() {
    pending = false;
    ajustarIframes();
    ajustarArea();
}

function agendar() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(executar);
}

/* ---------- Lembrete que abre junto com a minuta ---------- */

const SELETOR_CONTROLES = 'a, button, input[type="button"], input[type="submit"], span[role="button"], div[role="button"], [onclick]';

function visivel(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function rotuloDe(control) {
    return (control.value || control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent || '').trim();
}

function ehFechar(control) {
    return /^(fechar|fechar\s+lembretes?|close|×|✕|✖)$/i.test(rotuloDe(control));
}

function contextoLembrete(control) {
    // Painel conhecido (#lembrete) ou, por conteúdo, um contêiner pequeno próximo que mencione "lembrete".
    if (control.closest('#lembrete, #fldLembretes, #divLembretes')) return true;
    let el = control.parentElement;
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
        if ((el.textContent || '').length > 600) return false;
        if (/lembrete/i.test(`${el.id} ${el.className} ${el.textContent || ''}`)) return true;
    }
    return false;
}

function documentosAcessiveis() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach(f => {
        try { if (f.contentDocument) docs.push(f.contentDocument); } catch (_) {}
    });
    return docs;
}

function tentarFecharLembrete() {
    if (lembreteFechado) return;
    if (Date.now() - inicioLembrete > JANELA_LEMBRETE_MS) return;
    for (const doc of documentosAcessiveis()) {
        const controle = Array.from(doc.querySelectorAll(SELETOR_CONTROLES))
            .find(c => ehFechar(c) && visivel(c) && contextoLembrete(c));
        if (controle) {
            lembreteFechado = true;
            try { controle.click(); } catch (_) {}
            agendar();
            return;
        }
    }
    setTimeout(tentarFecharLembrete, 200);
}

/* ---------- Observação ---------- */

function observarIframes() {
    document.querySelectorAll('.cke_wysiwyg_frame').forEach(iframe => {
        if (iframe.dataset.superprocAlturaObservada) return;
        iframe.dataset.superprocAlturaObservada = 'true';
        const ligar = () => {
            agendar();
            try {
                const body = iframe.contentDocument && iframe.contentDocument.body;
                if (!body) return;
                new MutationObserver(agendar).observe(body, { childList: true, subtree: true, characterData: true });
                if (typeof ResizeObserver !== 'undefined') new ResizeObserver(agendar).observe(body);
            } catch (_) {}
        };
        iframe.addEventListener('load', ligar);
        try { if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') ligar(); } catch (_) {}
    });
}

function iniciar() {
    injetarEstilos();
    observarIframes();
    agendar();
    inicioLembrete = Date.now();
    setTimeout(tentarFecharLembrete, 100);
    if (observing) return;
    observing = true;
    window.addEventListener('resize', agendar, { passive: true });
    window.addEventListener('load', agendar, { once: true });
    new MutationObserver(() => { observarIframes(); agendar(); }).observe(document.documentElement, { childList: true, subtree: true });
    // O eproc reaplica o próprio height (calc(100vh - ...)) na área da minuta: reaplica o nosso quando ele mudar.
    const alvo = acharArea();
    if (alvo) new MutationObserver(agendar).observe(alvo, { attributes: true, attributeFilter: ['style'] });
    // Barra de acessibilidade ligada/desligada, faixa de status ou rodapé mudando de altura movem o topo/base da área.
    if (typeof ResizeObserver !== 'undefined') {
        ['top', 'infoMessage', 'bottom'].forEach(id => { const el = document.getElementById(id); if (el) new ResizeObserver(agendar).observe(el); });
        new ResizeObserver(agendar).observe(document.body);
    }
    setInterval(agendar, 1000);
}


export default {
    id: 'editor_arrumar_altura',
    name: 'Editor - Arrumar Altura',
    category: 'Editor de Minutas',
    description: 'Ajusta o editor à janela (com ou sem barra de acessibilidade), sem sobras no topo/base, e fecha o lembrete da abertura.',
    defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    async init() {
        if (window.__superprocEditorArrumarAlturaInjetado) return;
        window.__superprocEditorArrumarAlturaInjetado = true;
        iniciar();
    }
};
