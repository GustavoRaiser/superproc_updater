/** Carrega o gerador no contexto principal da página/CKEditor. */
export default {
    id: 'editor_pdf', name: 'Editor - Exportar para PDF', category: 'Editor de Minutas',
    description: 'Exportação direta da minuta em PDF com diagramação do eproc.', defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    init() {
        if (document.getElementById('superproc-editor-pdf-main')) return;
        const script = document.createElement('script');
        script.id = 'superproc-editor-pdf-main';
        script.charset = 'UTF-8';
        script.src = chrome.runtime.getURL('modules/editor/editor_pdf_main.js');
        script.onerror = () => console.error('[SuperPROC PDF] Não foi possível iniciar o gerador.');
        (document.head || document.documentElement).appendChild(script);
    }
};
