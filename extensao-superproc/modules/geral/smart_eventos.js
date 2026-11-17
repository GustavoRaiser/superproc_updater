/**
 * SuperPROC - Módulo: Smart Eventos (Grupos & Busca)
 * Carregador do script em Main World.
 * Restrito estritamente a páginas que possuem a seção "Agendar lançamento de evento/troca de localizador".
 *
 * Também faz a ponte entre o script da página (sem acesso a chrome.*) e o espelho dos grupos usado pelo organizador:
 * a página avisa por postMessage quando os grupos mudam; este carregador grava no espelho e, no sentido contrário,
 * aplica no localStorage o que o organizador alterou.
 */
import { reconciliar, gravarOrigem, aoMudarEspelho, lerLocal, gravarLocal, normalizarDados, urlOrganizador } from '../../core/smartorg.js';

const MSG = { PUSH: 'smartorg-evt-push', RELOAD: 'smartorg-evt-reload', OPEN: 'smartorg-evt-open' };

export default {
    async init(context) {
        if (document.getElementById('superproc-smarteventos-script')) return;

        // Mensagens da página (mesma janela, mesmo origin). Só aceita o formato esperado e dados válidos.
        window.addEventListener('message', (e) => {
            if (e.source !== window || e.origin !== location.origin || !e.data || e.data.__superproc !== true) return;
            if (e.data.tipo === MSG.OPEN) {
                try { window.open(urlOrganizador('evt'), '_blank'); } catch (erro) { console.warn('[SuperPROC] Organizador indisponível:', erro); }
            } else if (e.data.tipo === MSG.PUSH) {
                const dados = normalizarDados('evt', e.data.dados);
                if (dados && dados.at) gravarOrigem('evt', location.origin, dados).catch(() => {});
            }
        });

        // Organizador alterou os grupos: aplica no localStorage e pede à página que redesenhe.
        aoMudarEspelho('evt', (origem, dados) => {
            if (origem !== location.origin || !dados || dados.at <= lerLocal('evt').at) return;
            gravarLocal('evt', dados);
            window.postMessage({ __superproc: true, tipo: MSG.RELOAD }, location.origin);
        });

        // Antes de a página ler os grupos, traz do espelho o que o organizador tenha alterado com o eproc fechado.
        await reconciliar('evt');

        const checarEPermitir = () => {
            const fld = document.querySelector('#fldEventoAgendamento');
            const spn = document.querySelector('#spnEventoAgendamento');
            const chk = document.querySelector('#chkEventoAgendamento');
            return fld && (spn || chk || fld.textContent.includes('Agendar'));
        };

        const carregarMainScript = () => {
            if (document.getElementById('superproc-smarteventos-script')) return;
            try {
                const script = document.createElement('script');
                script.id = 'superproc-smarteventos-script';
                script.charset = 'UTF-8';
                script.setAttribute('charset', 'UTF-8');
                script.src = chrome.runtime.getURL('modules/geral/smart_eventos_main.js');
                (document.head || document.documentElement).appendChild(script);
            } catch (err) {
                console.error('[SuperPROC] Erro ao carregar Smart Eventos:', err);
            }
        };

        if (checarEPermitir()) {
            carregarMainScript();
        } else {
            // Em caso de carregamento assíncrono do formulário, observa temporariamente
            const obs = new MutationObserver(() => {
                if (checarEPermitir()) {
                    obs.disconnect();
                    carregarMainScript();
                }
            });
            if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true });
            }
            // Desconecta após 3s para liberar recursos e não rodar em telas sem agendamento
            setTimeout(() => obs.disconnect(), 3000);
        }
    }
};
