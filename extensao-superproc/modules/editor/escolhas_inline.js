/**
 * SuperPROC - Módulo: Editor - Escolhas no Texto
 *
 * O que faz: mostra opções clicáveis para trechos do tipo [autor|réu] na minuta, substituindo apenas o trecho escolhido
 *   e preservando o desfazer do editor. O trabalho é feito por escolhas_inline_main.js, carregado aqui no contexto
 *   principal da página (onde o CKEditor está).
 * Onde roda: editor de minutas (acao=minuta_editar e minuta_cadastrar).
 * Dados: nenhum.
 */
export default {
    id: 'editor_escolhas_inline',
    name: 'Editor - Escolhas no Texto',
    category: 'Editor de Minutas',
    defaultEnabled: false,
    init() {
        if (document.getElementById('superproc-escolhas-inline-main')) return;
        const script = document.createElement('script');
        script.id = 'superproc-escolhas-inline-main';
        script.src = chrome.runtime.getURL('modules/editor/escolhas_inline_main.js');
        script.onerror = () => console.error('[SuperPROC] Não foi possível carregar Escolhas no Texto.');
        (document.head || document.documentElement).appendChild(script);
    }
};
