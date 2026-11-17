/**
 * SuperPROC - Módulo: Ajuste Listas (Processos por Localizador)
 * 
 * Reorganiza a tela de "Lista de Processos por Localizador" (localizador_processos_lista):
 * - Oculta cabeçalhos, barras flutuantes e filtros redundantes (Juízo, Rito, Preferências verbosas).
 * - Estrutura a tela em duas colunas funcionais dentro de #frmProcessoLista:
 *   - Coluna Esquerda:
 *     1. Smart Localizadores (#smartloc-container)
 *     2. Fieldset Ações nativo (#fldAcoes) - preservado com seu design original
 *     3. Link "Abrir os processos selecionados em abas/janelas" (#divLinkAbreEmAbas) logo abaixo de Ações
 *   - Coluna Direita:
 *     1. Linha de Localizador nativo + rádios E/OU (.superproc-row-localizador)
 *     2. Painel "Gerenciar Localizadores" (#fldAlterarLocalizadores) aberto e compacto
 * - Centralização vertical: a coluna com menor altura é centralizada em relação à outra (align-items: center).
 * - Mantém a tabela de processos e a submissão de formulário 100% intactas.
 * - Protegido contra ciclos de re-append no DOM que causam perda de foco/cliques.
 */

export default {
    init(context) {
        // Verifica se a página atual é ESTRITAMENTE a lista de processos por localizador
        const params = context?.params || new URLSearchParams(window.location.search);
        const acao = params.get('acao') || '';

        // NUNCA executar na capa do processo (processo_selecionar) ou quando houver num_processo
        if (acao === 'processo_selecionar' || params.has('num_processo')) return;
        if (acao !== 'localizador_processos_lista') return;

        // Validação estrita: deve possuir os elementos exclusivos da lista de processos por localizador
        const hasListaElements = document.getElementById('fldAlterarLocalizadores') !== null ||
                                 document.getElementById('div_sel_localizador') !== null ||
                                 document.getElementById('selLocalizador') !== null;
        if (!hasListaElements) return;

        // 1. Marca o body para ativar os estilos escopados anti-flicker
        document.body.classList.add('superproc-ajuste-listas-ativo');

        // 2. Injeta CSS para ocultação imediata anti-flicker e regras de layout
        injetarCSS();

        // 3. Executa a organização estrutural em 2 colunas
        organizarLayout();

        // 4. Configura MutationObserver inteligente
        // Ignora mutações internas dentro do container de colunas para não interferir em cliques e foco
        let timeoutReorganizar = null;
        const observer = new MutationObserver((mutations) => {
            // Se todas as mutações ocorreram dentro do container de colunas (interação do usuário), ignora
            const todasInternas = mutations.every(m => {
                const target = m.target;
                return target && target.closest && target.closest('#superproc-lista-container');
            });
            if (todasInternas) return;

            if (timeoutReorganizar) clearTimeout(timeoutReorganizar);
            timeoutReorganizar = setTimeout(() => {
                organizarLayout();
            }, 100);
        });

        const form = document.querySelector('#frmProcessoLista') || document.body;
        if (form) {
            observer.observe(form, { childList: true, subtree: true });
        }
    }
};

/**
 * Regras de estilo para ocultar elementos desnecessários e estruturar as duas colunas
 */
function injetarCSS() {
    if (document.getElementById('superproc-ajuste-listas-css')) return;

    const style = document.createElement('style');
    style.id = 'superproc-ajuste-listas-css';
    style.textContent = `
        /* ========================================================
           1. ELEMENTOS OCULTADOS (LIMPEZA EXCLUSIVA DA LISTA)
           Escopado estritamente sob body.superproc-ajuste-listas-ativo
           para jamais afetar a capa do processo (processo_selecionar)
           ======================================================== */
        /* Barra de Título / Dicas */
        body.superproc-ajuste-listas-ativo #divInfraBarraLocalizacao {
            display: none !important;
        }

        /* Barra Superior Flutuante (Busca inteligente AzFlow, Consultar, Planilha, Voltar) */
        body.superproc-ajuste-listas-ativo .eproc-barra-superior-flutuante,
        body.superproc-ajuste-listas-ativo #divInfraBarraComandosSuperior,
        body.superproc-ajuste-listas-ativo #azflow-filtro-processos-localizador {
            display: none !important;
        }

        /* Seção de Preferências verbosas (acordeão/cadastro desnecessário) */
        body.superproc-ajuste-listas-ativo #fldPreferencias {
            display: none !important;
        }

        /* Campos de Juízo, Filtrar por e Rito do Processo */
        body.superproc-ajuste-listas-ativo #lblOrgaoJuizo,
        body.superproc-ajuste-listas-ativo #selIdOrgaoJuizo,
        body.superproc-ajuste-listas-ativo #lblLocalizadorTipo,
        body.superproc-ajuste-listas-ativo #selLocalizadorTipo,
        body.superproc-ajuste-listas-ativo #lblRitoProcesso,
        body.superproc-ajuste-listas-ativo #selIdRitoProcesso {
            display: none !important;
        }

        /* ========================================================
           2. CONTAINER PRINCIPAL DE 2 COLUNAS
           ======================================================== */
        .superproc-lista-container {
            display: flex !important;
            flex-direction: row !important;
            gap: 20px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            align-items: center !important; /* Coluna menor fica centralizada verticalmente */
            margin-top: 10px !important;
            margin-bottom: 12px !important;
            position: relative !important;
            z-index: 10 !important;
        }

        @media (max-width: 1100px) {
            .superproc-lista-container {
                flex-direction: column !important;
            }
            .superproc-col-esquerda,
            .superproc-col-direita {
                width: 100% !important;
                flex: 1 1 100% !important;
            }
        }

        /* ========================================================
           3. COLUNA DA ESQUERDA
           ======================================================== */
        .superproc-col-esquerda {
            flex: 1 1 50% !important;
            min-width: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            box-sizing: border-box !important;
            position: relative !important;
            z-index: 10 !important;
        }

        /* Smart Localizadores no topo da coluna esquerda */
        .superproc-col-esquerda #smartloc-container {
            width: 100% !important;
            margin-bottom: 0 !important;
            box-sizing: border-box !important;
        }

        /* Fieldset Ações nativo: preserva 100% da identidade visual original do eProc */
        .superproc-col-esquerda #fldAcoes {
            width: 100% !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }

        /* Link "Abrir os processos selecionados em abas/janelas" logo abaixo de Ações */
        .superproc-col-esquerda #divLinkAbreEmAbas,
        .superproc-col-esquerda [name="divLinkAbreEmAbas"] {
            margin: 2px 0 0 2px !important;
            font-size: 12px !important;
        }

        /* ========================================================
           4. COLUNA DA DIREITA (LOCALIZADOR + GERENCIAR LOCALIZADORES)
           ======================================================== */
        .superproc-col-direita {
            flex: 1 1 50% !important;
            min-width: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            box-sizing: border-box !important;
            position: relative !important;
            z-index: 5 !important;
        }

        /* Linha do Localizador nativo + rádio E/OU (no topo da coluna direita) */
        .superproc-lista-container .superproc-row-localizador,
        .superproc-lista-container .row:has(#div_sel_localizador) {
            display: flex !important;
            flex-wrap: nowrap !important;
            align-items: flex-end !important;
            gap: 8px !important;
            margin: 0 !important;
            width: 100% !important;
        }

        .superproc-lista-container #div_sel_localizador {
            flex: 1 1 auto !important;
            max-width: calc(100% - 95px) !important;
            padding: 0 !important;
        }

        .superproc-lista-container #div_sel_localizador .bootstrap-select {
            width: 100% !important;
        }

        .superproc-lista-container .col-auto.m-0.p-0.mt-4.align-items-center {
            display: flex !important;
            align-items: center !important;
            gap: 5px !important;
            margin-top: 0 !important;
            padding: 0 !important;
            white-space: nowrap !important;
            height: 32px !important;
        }

        .superproc-col-direita #fldAlterarLocalizadores {
            width: 100% !important;
            margin: 0 !important;
            left: 0 !important;
            box-sizing: border-box !important;
            position: relative !important;
            height: auto !important;
            padding-bottom: 6px !important;
        }

        .superproc-col-direita #conteudoAlterarLocalizadores {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            position: static !important;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }

        .superproc-col-direita #conteudoAlterarLocalizadores .row.m-0.justify-content-between {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 15px !important;
            margin: 0 !important;
            align-items: flex-start !important;
        }

        /* Subcoluna esquerda do Gerenciar: Localizadores Atuais */
        .superproc-col-direita #conteudoAlterarLocalizadores .col-12.col-md-6.col-lg-4 {
            flex: 1 1 45% !important;
            max-width: 50% !important;
            min-width: 220px !important;
            padding: 0 !important;
        }

        .superproc-col-direita #selLocalizadorDesativar {
            width: 100% !important;
            min-width: 180px !important;
            font-size: 12px !important;
        }

        /* Subcoluna direita do Gerenciar: Novo Localizador */
        .superproc-col-direita #conteudoAlterarLocalizadores .col-12.col-md-6 {
            flex: 1 1 48% !important;
            max-width: 50% !important;
            min-width: 220px !important;
            padding: 0 !important;
        }

        .superproc-col-direita #selNovoLocalizador {
            width: 100% !important;
            max-width: 100% !important;
        }

        .superproc-col-direita #lblLocalizadoresAtuais,
        .superproc-col-direita #lblNovoLocalizador {
            position: static !important;
            display: block !important;
            margin-bottom: 4px !important;
            font-size: 12px !important;
        }

        /* Oculta o checkbox "Manter Gerenciar Localizadores Aberto" e o espaçamento ocioso de quebra */
        #chkAlterarLocalizadoresAberto,
        #lblAlterarLocalizadoresAberto,
        #fldAlterarLocalizadores div:has(#chkAlterarLocalizadoresAberto),
        #fldAlterarLocalizadores > br {
            display: none !important;
        }

        /* ========================================================
           5. ÁREA DA TABELA (LARGURA TOTAL ABAIXO)
           ======================================================== */
        #divInfraAreaTabela {
            width: 100% !important;
            clear: both !important;
            margin-top: 5px !important;
        }
    `;

    document.head.appendChild(style);
}

/**
 * Monta as duas colunas no DOM e move os blocos correspondentes de forma segura e idempotente
 */
function organizarLayout() {
    const form = document.querySelector('#frmProcessoLista');
    if (!form) return;

    // Garante que o container de 2 colunas exista dentro do formulário
    let container = document.getElementById('superproc-lista-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'superproc-lista-container';
        container.className = 'superproc-lista-container';

        const colEsq = document.createElement('div');
        colEsq.id = 'superproc-col-esquerda';
        colEsq.className = 'superproc-col-esquerda';

        const colDir = document.createElement('div');
        colDir.id = 'superproc-col-direita';
        colDir.className = 'superproc-col-direita';

        container.appendChild(colEsq);
        container.appendChild(colDir);

        // Insere o container logo acima da área da tabela de processos
        const areaTabela = document.getElementById('divInfraAreaTabela') || form.querySelector('.infraAreaTabela');
        if (areaTabela) {
            form.insertBefore(container, areaTabela);
        } else {
            form.appendChild(container);
        }
    }

    const colEsq = document.getElementById('superproc-col-esquerda');
    const colDir = document.getElementById('superproc-col-direita');
    if (!colEsq || !colDir) return;

    // --- 1. Ocultar especificamente containers redundantes que eProc gera com classes genéricas ---
    const juizoSelect = document.getElementById('selIdOrgaoJuizo');
    if (juizoSelect) {
        const juizoCol = juizoSelect.closest('.col-5, .col');
        if (juizoCol && juizoCol.style.display !== 'none') {
            juizoCol.style.setProperty('display', 'none', 'important');
        }
    }

    const tipoSelect = document.getElementById('selLocalizadorTipo');
    if (tipoSelect) {
        const rowFiltros = tipoSelect.closest('.row');
        if (rowFiltros && rowFiltros.style.display !== 'none') {
            rowFiltros.style.setProperty('display', 'none', 'important');
        }
    }

    // --- 2. Elementos referenciados ---
    const smartloc = document.getElementById('smartloc-container');

    const divSelLoc = document.getElementById('div_sel_localizador');
    const rowLocalizador = divSelLoc ? divSelLoc.closest('.row') : null;
    if (rowLocalizador && !rowLocalizador.classList.contains('superproc-row-localizador')) {
        rowLocalizador.classList.add('superproc-row-localizador');
    }

    const fldAcoes = document.getElementById('fldAcoes');
    if (fldAcoes) {
        const acoesCenter = fldAcoes.querySelector('center');
        if (acoesCenter && acoesCenter.style.display === 'none') {
            acoesCenter.style.display = '';
        }
    }

    const linkAbas = document.getElementById('divLinkAbreEmAbas') || document.querySelector('[name="divLinkAbreEmAbas"]');
    const fldAlt = document.getElementById('fldAlterarLocalizadores');

    // VERIFICAÇÃO CRÍTICA ANTI-LOOP / ANTI-REAPPEND:
    // Só mexe no DOM se algum elemento NÃO estiver no lugar ou estiver fora de ordem!
    // Re-inserir nós já posicionados cancela eventos de clique e perde o foco ativo do mouse.

    // Coluna Esquerda: [smartloc, fldAcoes, linkAbas]
    const ordemEsq = [smartloc, fldAcoes, linkAbas].filter(Boolean);
    const filhosAtuaisEsq = Array.from(colEsq.children);
    const ordemEsqCorreta = ordemEsq.length === filhosAtuaisEsq.length &&
        ordemEsq.every((el, idx) => filhosAtuaisEsq[idx] === el);

    if (!ordemEsqCorreta) {
        ordemEsq.forEach(el => {
            colEsq.appendChild(el);
        });
    }

    // Coluna Direita: [rowLocalizador, fldAlt]
    const ordemDir = [rowLocalizador, fldAlt].filter(Boolean);
    const filhosAtuaisDir = Array.from(colDir.children);
    const ordemDirCorreta = ordemDir.length === filhosAtuaisDir.length &&
        ordemDir.every((el, idx) => filhosAtuaisDir[idx] === el);

    if (!ordemDirCorreta) {
        ordemDir.forEach(el => {
            colDir.appendChild(el);
        });
    }

    // Garante que o Gerenciar Localizadores esteja expandido e pronto para uso
    const conteudoAlt = document.getElementById('conteudoAlterarLocalizadores');
    if (conteudoAlt && conteudoAlt.style.display === 'none') {
        conteudoAlt.style.display = 'block';
    }

    const chkAberto = document.getElementById('chkAlterarLocalizadoresAberto');
    if (chkAberto) {
        if (!chkAberto.checked) chkAberto.checked = true;
        const divPai = chkAberto.closest('div');
        if (divPai && divPai.parentElement === fldAlt && divPai.style.display !== 'none') {
            divPai.style.setProperty('display', 'none', 'important');
        }
    }
}
