import { domWork } from '../runtime/dom-work.js';
/**
 * SuperPROC - Módulo: Movimento - Retificação Automática
 *
 * O que faz: lê a situação do processo na capa e, na tela de movimentação, ajusta sozinho o tipo de conclusão para
 *   Retificação de Conclusão quando a situação indica isso.
 * Onde roda: capa do processo (lê e guarda a situação) e tela de movimentação (aplica o ajuste).
 * Dados: a situação lida fica só na sessão da aba (sessionStorage, chave eproc_situacao_capturada).
 */

export default {
    init(context) {
        const href = window.location.href;

        // LÓGICA 1: TELA PRINCIPAL (CAPA DO PROCESSO)
        if (href.includes('processo_selecionar')) {
            let ultimaSituacaoSalva = null;

            const capturarSituacao = () => {
                const elSituacao = document.querySelector('#txtSituacao');
                if (elSituacao) {
                    const situacaoAtual = (elSituacao.getAttribute('data-azflow-situacao-texto') || elSituacao.innerText || '').trim();
                    
                    if (situacaoAtual !== ultimaSituacaoSalva) {
                        sessionStorage.setItem('eproc_situacao_capturada', situacaoAtual);
                        ultimaSituacaoSalva = situacaoAtual;
                    }
                }
            };

            const observerCapa = new MutationObserver(capturarSituacao);
            observerCapa.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['data-azflow-situacao-texto']
            });
            capturarSituacao();
        }

        // LÓGICA 2: TELA DE MOVIMENTAÇÃO / CONSULTAR MOVIMENTO
        if (href.includes('processo_movimento_consultar')) {
            let corrigindo = false;
            let versaoEdicao = 0;
            let verificacaoPendente;

            const forcarSelecao = (inputEvento, hdnEvento, texto, id) => {
                const versaoAtual = versaoEdicao;
                corrigindo = true;
                try {
                    inputEvento.value = texto;
                    hdnEvento.value = id;

                    inputEvento.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEvento.dispatchEvent(new Event('change', { bubbles: true }));
                } finally {
                    corrigindo = false;
                }

                setTimeout(() => {
                    // Não sobrescreve uma nova escolha nem um formulário substituído.
                    if (versaoEdicao !== versaoAtual ||
                        document.querySelector('#txtEvento') !== inputEvento ||
                        document.querySelector('#hdnEvento') !== hdnEvento ||
                        (inputEvento.value !== texto && inputEvento.value !== '') ||
                        (hdnEvento.value !== id && hdnEvento.value !== '')) return;

                    inputEvento.value = texto;
                    hdnEvento.value = id;
                }, 50);
            };

            const analisarECorrigir = () => {
                if (corrigindo) return;

                // O iframe e a situação podem chegar depois da inicialização do módulo.
                const situacaoSalva = (sessionStorage.getItem('eproc_situacao_capturada') || '').toUpperCase();
                const inputEvento = document.querySelector('#txtEvento');
                const hdnEvento = document.querySelector('#hdnEvento');
                if (inputEvento && hdnEvento && situacaoSalva !== '') {
                    const valor = inputEvento.value.trim().toLowerCase();
                    if (valor.includes('retificação') || valor === '') return;

                    // REGRA 1: Aguarda Sentença -> Conclusos para despacho (51)
                    if (situacaoSalva.includes('SENTENÇA') && 
                       (valor.includes('conclusos para despacho') || valor.includes('conclusos para decisão'))) {
                        forcarSelecao(inputEvento, hdnEvento, 'Conclusos para despacho - Retificação de Conclusão (51)', '82400553');
                    }
                    // REGRA 2: Aguarda Despacho/Decisão -> Conclusos para julgamento (51)
                    else if ((situacaoSalva.includes('DESPACHO') || situacaoSalva.includes('DECISÃO')) && 
                              valor.includes('conclusos para julgamento')) {
                        forcarSelecao(inputEvento, hdnEvento, 'Conclusos para julgamento - Retificação de Conclusão (51)', '82400555');
                    }
                }
            };

            const agendarVerificacao = (event) => {
                if (corrigindo || !['txtEvento', 'hdnEvento'].includes(event.target.id)) return;
                versaoEdicao++;
                clearTimeout(verificacaoPendente);
                // Espera os handlers nativos terminarem a seleção/validação do evento.
                verificacaoPendente = setTimeout(analisarECorrigir, 100);
            };

            for (const tipo of ['input', 'change', 'keyup', 'blur']) {
                document.addEventListener(tipo, agendarVerificacao, true);
            }

            // InfraAjax e outros módulos preenchem .value sem disparar eventos DOM.
            // Um ID preenchido é uma seleção válida que também precisa ser analisada.
            domWork({run:analisarECorrigir, fallback:1000, events:['input','change'], hidden:true});
            analisarECorrigir();
        }
    }
};
