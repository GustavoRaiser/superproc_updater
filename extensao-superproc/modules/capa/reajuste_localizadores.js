/**
 * SuperPROC - Capa - Reajuste Localizadores
 * 
 * 1. Reduz a margem superior de 16px (classe mt-3) para um respiro mínimo (MARGEM_TOPO_PX) em ambos os containers:
 *    #dvLocalizadoresOrgao (modo visualização) e #dvLocalizadores (modo edição).
 * 2. Quando há localizadores, torna o container exposto (#dvLocalizadoresOrgao) 100% transparente e sem bordas
 *    e sem sombras, dando o efeito de que os localizadores flutuam suavemente na capa.
 * 3. Quando há localizadores na visualização, oculta a legenda/título "Localizador(es):":
 *    - #lblLocalizador (na visualização)
 *    - #hAlterar (na edição)
 * 4. Oculta o ícone de ajuda/dúvida de localizadores (imagens/duvida.png) e seu texto auxiliar de acessibilidade.
 */

const MODULE_ID = 'capa_reajuste_localizadores';
const STYLE_ID = 'superproc-reajuste-localizadores-style';
// Respiro mínimo entre a linha de botões (Min./Mov./Lembretes/Minutas) e os localizadores (antes: mt-3 = 16px).
const MARGEM_TOPO_PX = 6;

function injetarEstilos() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* Reduz a margem superior (16px -> ${MARGEM_TOPO_PX}px, respiro mínimo) em ambos os estados (visualização e edição) */
        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos,
        #dvLocalizadores {
            margin-top: ${MARGEM_TOPO_PX}px !important;
        }

        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
        }

        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos :is(#lblLocalizador, span[aria-label="Localizador(es)"]) {
            display: none !important;
        }

        /* Oculta legenda e ícone "Localizador(es):" no modo de edição (quando abreLocalizadores() é acionado) */
        #hAlterar,
        [id="hAlterar"],
        #dvLocalizadores label[id="hAlterar"],
        #dvLocalizadores .col-auto:has(#hAlterar) {
            display: none !important;
        }

        /* Oculta o ícone de ajuda/dúvida dos localizadores e o span com texto auxiliar */
        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos img[src*="duvida.png"],
        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos img[alt*="Ajuda localizadores"],
        #dvLocalizadores img[src*="duvida.png"],
        #dvLocalizadores img[alt*="Ajuda localizadores"],
        #dvLocalizadoresOrgao.superproc-localizadores-preenchidos .sr-only[aria-label*="Atalhos"],
        #dvLocalizadores .sr-only[aria-label*="Atalhos"] {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
}

function aplicarAjustes() {
    injetarEstilos();

    const visualizacao = document.getElementById('dvLocalizadoresOrgao');
    if (!visualizacao) return;

    const preenchido = [...visualizacao.querySelectorAll('a')].some(link => {
        if (link.closest('#lblLocalizador, [aria-label="Localizador(es)"], [hidden], [data-azflow-troca-rapida-wrap="1"]') ||
            link.matches('[class*="memoLocalizadorOrgao"], [href*="historico" i], [data-azflow-troca-rapida-btn]')) return false;
        const texto = link.textContent.trim();
        return !!texto && !/^(?:hist[oó]rico de localizadores|localizador\(es\))\s*:?$/i.test(texto);
    });
    visualizacao.classList.toggle('superproc-localizadores-preenchidos', preenchido);
}

export default {
    id: MODULE_ID,
    name: 'Capa - Reajuste Localizadores',
    category: 'Capa do Processo',
    description: 'Deixa o container de localizadores transparente e sem bordas, zera a margem superior e oculta as legendas e o ícone de ajuda.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init() {
        if (window.__superprocCapaReajusteLocInjetado) return;
        window.__superprocCapaReajusteLocInjetado = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', aplicarAjustes);
        } else {
            aplicarAjustes();
        }

        // Observador contínuo para mutações na capa
        let debounceTimer;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                aplicarAjustes();
            }, 80);
        });

        const container = document.getElementById('divCapaProcesso') || document.body;
        observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'href'] });
    }
};
