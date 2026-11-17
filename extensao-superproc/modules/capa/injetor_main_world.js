/**
 * SuperPROC - Injetor de Contexto Principal (Main World)
 *
 * Executa no contexto nativo da página para proteger a altura de áreas dinâmicas
 * e integrar a filtragem sem violar a Content Security Policy (CSP).
 */
(function() {
    'use strict';

    if (window.__superprocMainWorldInjetado) return;
    window.__superprocMainWorldInjetado = true;
    if (document.documentElement) {
        document.documentElement.dataset.superprocMainWorld = 'true';
    }

    // =========================================================================
    // 1. Proteção de altura no jQuery contra manipulações estáticas do eProc
    // =========================================================================
    function protegerJQueryAltura() {
        if (window.jQuery && window.jQuery.fn && !window.__superprocJQueryProtegido) {
            window.__superprocJQueryProtegido = true;
            try {
                var origInnerHeight = window.jQuery.fn.innerHeight;
                window.jQuery.fn.innerHeight = function(val) {
                    if (val !== undefined && this && this.length) {
                        for (var i = 0; i < this.length; i++) {
                            var el = this[i];
                            if (el && (el.id === 'divInfraAreaTela' || (el.classList && el.classList.contains('infraAreaTela')) || el.id === 'divInfraAreaTelaD')) {
                                el.style.setProperty('height', 'auto', 'important');
                                return this;
                            }
                        }
                    }
                    return origInnerHeight.apply(this, arguments);
                };

                var origHeight = window.jQuery.fn.height;
                window.jQuery.fn.height = function(val) {
                    if (val !== undefined && this && this.length) {
                        for (var i = 0; i < this.length; i++) {
                            var el = this[i];
                            if (el && (el.id === 'divInfraAreaTela' || (el.classList && el.classList.contains('infraAreaTela')) || el.id === 'divInfraAreaTelaD')) {
                                el.style.setProperty('height', 'auto', 'important');
                                return this;
                            }
                        }
                    }
                    return origHeight.apply(this, arguments);
                };
            } catch (err) {
                console.warn('[SuperPROC] Erro ao envolver jQuery height:', err);
            }
        }
    }

    // =========================================================================
    // 2. Interceptação segura de window.filtrarEventos
    // =========================================================================
    function interceptarFiltrarEventos() {
        if (typeof window.filtrarEventos === 'function' && !window.__superprocFiltrarInterceptado) {
            window.__superprocFiltrarInterceptado = true;
            window.__eproc_filtrarEventos_orig = window.filtrarEventos;
            const executarNativo = function(ancorarTela) {
                // A rotina original não é apenas visual: ela também atualiza
                // os documentos relacionados aos eventos. Nunca a suprimir.
                const resultado = window.__eproc_filtrarEventos_orig.apply(this, arguments);
                window.dispatchEvent(new CustomEvent('superproc-requisitar-filtros-eventos'));
                return resultado;
            };
            window.filtrarEventos = executarNativo;

            // Chamado pelo clique no número da OAB, que nasce no mundo isolado
            // da extensão e, por isso, não consegue invocar a função da página
            // diretamente.
            window.addEventListener('superproc-executar-filtro-nativo', function(event) {
                executarNativo.call(window, !!event.detail?.ancorarTela);
            });
        }
    }

    // =========================================================================
    // Atualização das minutas a pedido da extensão (mundo isolado não chama funções da página, e <script>
    // inline pode ser barrado pela CSP). Mesma lógica que a extensão usava, agora em arquivo da extensão.
    if (!window.__superprocAtualizarMinutasAnexado) {
        window.__superprocAtualizarMinutasAnexado = true;
        window.addEventListener('superproc-atualizar-minutas', function() {
            try {
                var btn = document.getElementById('atualizaMinutas') || document.querySelector('a[onclick*="atualizaMinutas"]');
                if (btn) {
                    btn.click();
                } else if (typeof window.chamaAtualizaMinutas === 'function') {
                    window.chamaAtualizaMinutas();
                } else if (typeof window.atualizaMinutas === 'function') {
                    var idEl = document.getElementById('id_processo');
                    var idProc = (idEl && idEl.value) || (window.infraParametros && window.infraParametros.id_processo);
                    if (idProc) window.atualizaMinutas('processo_selecionar', idProc, '', '');
                }
            } catch (err) {
                console.warn('[SuperPROC] Erro ao atualizar minutas (main world):', err);
            }
        });
    }

    function inicializar() {
        protegerJQueryAltura();
        interceptarFiltrarEventos();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    window.addEventListener('load', inicializar);
})();
