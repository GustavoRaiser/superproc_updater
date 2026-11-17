/** Carrega, no contexto principal da página/CKEditor, as regras de texto e o botão "Texto" (menu de edição rápida). */
import { efetivo } from './texto_atalho.js';

const MARCA = 'editor-texto';
const PREFIXO = '[SuperPROC Texto]';

export default {
    id: 'editor_texto', name: 'Editor - Botão Texto', category: 'Editor de Minutas',
    description: 'Botão "Texto" na barra do editor com formatação rápida, limpeza de parágrafos, caixa/tipografia e ementa.', defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    init({ meta, storage } = {}) {
        if (document.getElementById('superproc-editor-texto-main')) return;
        const injetar = (id, arquivo, aoCarregar) => {
            const script = document.createElement('script');
            script.id = id;
            script.charset = 'UTF-8';
            script.src = chrome.runtime.getURL(arquivo);
            script.onload = aoCarregar || null;
            script.onerror = () => console.error(`${PREFIXO} Não foi possível carregar`, arquivo);
            (document.head || document.documentElement).appendChild(script);
        };

        // Atalho que abre o menu na seleção (definido no popup; padrão Alt+Shift). O script da página não acessa
        // chrome.storage: recebe o valor por mensagem, no 'pronto' e a cada mudança.
        let atalho = efetivo(undefined);
        const enviarConfiguracao = () => window.postMessage({ __sp: MARCA, de: 'iso', tipo: 'config', atalho }, location.origin === 'null' ? '*' : location.origin);
        async function carregarAtalho() {
            try {
                const config = await storage?.getModuleSettings(meta?.id || 'editor_texto');
                atalho = efetivo(config?.atalho);
                enviarConfiguracao();
            } catch (erro) {
                console.warn(`${PREFIXO} não foi possível ler o atalho; segue o padrão.`, erro);
            }
        }
        window.addEventListener('message', (ev) => {
            const d = ev.data;
            if (ev.source === window && d && d.__sp === MARCA && d.de === 'main' && d.tipo === 'pronto') enviarConfiguracao();
        });
        try { chrome.storage?.onChanged?.addListener((mudancas) => { if (mudancas.superproc_custom_settings) carregarAtalho(); }); } catch (_) { /* sem onChanged: o foco da janela relê */ }
        window.addEventListener('focus', carregarAtalho);
        carregarAtalho();

        // As regras precisam existir antes do script principal.
        injetar('superproc-editor-texto-regras', 'modules/editor/lib/texto_regras.js',
            () => injetar('superproc-editor-texto-main', 'modules/editor/editor_texto_main.js'));
    }
};
