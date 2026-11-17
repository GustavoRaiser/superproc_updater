/**
 * SuperPROC - Módulo: Pesquisa de Jurisprudência
 *
 * O que faz: otimiza a consulta de jurisprudência do TJSC: marca "Ementa" por padrão, abre a Pesquisa Avançada
 *   automaticamente e define 100 resultados por página.
 * Onde roda: eprocwebcon.tjsc.jus.br.
 * Dados: nenhum.
 */

export default {
    init(context) {
        const CHAVE_EMENTA_FEITA = 'jurisprudencia_ementa_inicial_feita';

        function executarAutomacaoInicial() {
            // 1. Seleciona o rádio Ementa na primeira vez
            if (!sessionStorage.getItem(CHAVE_EMENTA_FEITA)) {
                const radioEmenta = document.querySelector('input#optEmenta');
                if (radioEmenta) {
                    if (!radioEmenta.checked) {
                        radioEmenta.checked = true;
                        radioEmenta.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    sessionStorage.setItem(CHAVE_EMENTA_FEITA, 'true');
                }
            }

            // 2. Abre a Pesquisa Avançada se estiver fechada
            const btnAvancada = document.querySelector('#btnPesquisaAvancada');
            if (btnAvancada) {
                const isFechada = btnAvancada.getAttribute('aria-expanded') === 'false' || btnAvancada.classList.contains('collapsed');
                if (isFechada) {
                    btnAvancada.click();
                }
            }
        }

        function ajustarResultadosPorPagina() {
            const selectPagina = document.querySelector('select#selTamanhoPagina');
            
            if (selectPagina && selectPagina.value !== '100') {
                if (window.$ && window.$.fn && window.$.fn.selectpicker) {
                    window.$(selectPagina).val('100').trigger('change').selectpicker('refresh');
                    return;
                }

                const item100 = Array.from(document.querySelectorAll('.dropdown-menu.inner li a .text'))
                    .find(span => span.textContent.trim() === '100');

                if (item100) {
                    const linkOpcao = item100.closest('a');
                    if (linkOpcao) {
                        linkOpcao.click();
                        return;
                    }
                }

                selectPagina.value = '100';
                selectPagina.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        const intervalo = setInterval(() => {
            executarAutomacaoInicial();
            ajustarResultadosPorPagina();
        }, 400);

        setTimeout(() => {
            clearInterval(intervalo);
            setInterval(() => {
                executarAutomacaoInicial();
                ajustarResultadosPorPagina();
            }, 1500);
        }, 8000);
    }
};
