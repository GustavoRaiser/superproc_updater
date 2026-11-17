/**
 * SuperPROC - Módulo: Editor - Dados Rápidos
 *
 * Compacta a ficha da minuta e organiza o formulário em duas colunas no editor.
 */

const MODULE_ID = 'ajustes_gerais';
const STYLE_ID = 'superproc-ajustes-gerais-style';

function injetarEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;

    style.textContent = `
        /* Oculta a capa redundante na ficha de dados da minuta. */
        body.superproc-minuta-ativa #fldCapa,
        body.superproc-minuta-ativa #infoMessage {
            display: none !important;
        }

        /* Compacta o título e a barra de localização da ficha. */
        body.superproc-minuta-ativa #divInfraBarraLocalizacao h1 {
            margin-bottom: 0px !important;
            padding-bottom: 0px !important;
        }
        body.superproc-minuta-ativa #divInfraBarraLocalizacao {
            margin-bottom: 0px !important;
        }
    `;

    const target = document.head || document.documentElement;
    if (target) {
        target.appendChild(style);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            (document.head || document.documentElement).appendChild(style);
        }, { once: true });
    }
}

function verificarOrigemEditor() {
    if (window.self === window.top) return false;
    try {
        if (window.parent && window.parent !== window) {
            const parentHref = window.parent.location.href || '';
            if (parentHref.includes('minuta_editar')) return true;
        }
        if (window.top && window.top !== window) {
            const topHref = window.top.location.href || '';
            if (topHref.includes('minuta_editar')) return true;
        }
    } catch (e) {
        try {
            if (document.referrer && document.referrer.includes('minuta_editar')) return true;
        } catch (e2) {}
    }
    return false;
}

function reorganizarLayoutMinutaAlterar(innerDoc) {
    if (!innerDoc || !innerDoc.body) return;

    if (!innerDoc.body.classList.contains('superproc-subfrm-editor-layout')) {
        innerDoc.body.classList.add('superproc-subfrm-editor-layout');
    }

    // 1. Injeta os estilos do layout de 2 colunas e compactação
    const styleId = 'superproc-layout-2col-style';
    if (!innerDoc.getElementById(styleId)) {
        const style = innerDoc.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Layout em 2 colunas */
            .superproc-alterar-grid {
                display: flex !important;
                flex-direction: row !important;
                align-items: flex-start !important;
                gap: 16px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                margin-top: 6px !important;
                margin-bottom: 12px !important;
            }
            .superproc-col-esquerda,
            .superproc-col-direita {
                flex: 1 1 50% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
            }

            /* Compactação Smart Localizadores e Smart Eventos no subform do editor */
            body.superproc-subfrm-editor-layout .smartloc-container,
            body.superproc-subfrm-editor-layout .smartevt-container {
                padding: 3px 10px !important;
                margin: 0 !important;
                min-height: unset !important;
                box-shadow: none !important;
                gap: 4px !important;
                box-sizing: border-box !important;
                width: 100% !important;
                border-radius: 4px !important;
            }
            body.superproc-subfrm-editor-layout .smartloc-title,
            body.superproc-subfrm-editor-layout .smartevt-title {
                font-size: 12px !important;
                margin-right: 4px !important;
                font-weight: bold !important;
            }
            body.superproc-subfrm-editor-layout .smartloc-trigger,
            body.superproc-subfrm-editor-layout .smartevt-trigger {
                height: 28px !important;
                min-height: 28px !important;
                padding: 2px 8px !important;
                font-size: 12px !important;
                line-height: 24px !important;
                box-sizing: border-box !important;
            }
            /* Oculta os botões de funções adicionais especificamente neste local compacto */
            body.superproc-subfrm-editor-layout .smartloc-toolbar,
            body.superproc-subfrm-editor-layout .smartevt-toolbar {
                display: none !important;
            }

            /* Coluna Direita - Encadeamento e Ações */
            #superproc-col-direita #divchkEncadeamentoIntimar {
                float: none !important;
                width: 100% !important;
                padding-top: 4px !important;
                margin-bottom: 4px !important;
            }
            #superproc-col-direita #divchkEncadeamentoIntimar label {
                font-weight: 600 !important;
                font-size: 12px !important;
                cursor: pointer !important;
            }
            #superproc-col-direita #divTipoEventoEncadeado {
                float: none !important;
                width: 100% !important;
                padding-top: 4px !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #divTipoEventoEncadeado select {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #btnSalvarDadosParaNovaIntimacao {
                float: none !important;
                padding-top: 4px !important;
            }
            #superproc-col-direita #divExibeHtmlCitacaoIntimacao {
                float: none !important;
                width: 100% !important;
            }
            #superproc-col-direita #selEventoEncadeadoCitacaoIntimacao {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                font-size: 12px !important;
                height: 28px !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso {
                width: 100% !important;
                box-sizing: border-box !important;
                overflow-x: auto !important;
            }
            #superproc-col-direita fieldset.infraFieldset {
                margin-top: 6px !important;
                margin-bottom: 6px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas {
                min-width: 0 !important;
                overflow: hidden !important;
            }
            /* Conteúdo complementar do EPROC que não pertence às colunas.
               Ele começa somente depois da maior altura da grade. */
            #divDadosCitacaoIntimacao.superproc-apos-grade {
                clear: both !important;
                float: none !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            /* "Por Pólo" do EPROC usa divs aninhadas e IDs repetidos. Em vez
               de alterar o DOM, a grade abaixo estabiliza as duas células de
               cada linha: parte à esquerda e prazo/urgência à direita. */
            #superproc-col-direita #fldOpcoesAvancadas > #conteudoAcoesNoProcesso {
                overflow: visible !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas #porPolo {
                margin-left: 32px !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas #lblPorPolo {
                margin-left: 4px !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo > #conteudoAcoesNoProcesso {
                display: block !important;
                width: 100% !important;
                overflow: visible !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo .divLinha {
                display: grid !important;
                grid-template-columns: minmax(138px, 37%) minmax(0, 1fr) !important;
                align-items: center !important;
                column-gap: 8px !important;
                row-gap: 3px !important;
                width: 100% !important;
                min-width: 0 !important;
                margin: 0 0 4px !important;
                padding: 0 !important;
                box-sizing: border-box !important;
            }
            /* O HTML do EPROC aninha "Demais Partes" dentro da linha do MP.
               Torná-lo uma linha completa evita que ele seja comprimido. */
            #superproc-col-direita #fldOpcoesAvancadas #linhaPoloMPF > #linhaPoloOutros {
                grid-column: 1 / -1 !important;
            }
            /* Linha vazia adicionada pelo EPROC após "Unidade Externa". */
            #superproc-col-direita #fldOpcoesAvancadas .porPolo > #conteudoAcoesNoProcesso > .divLinha:has(> br:only-child) {
                display: none !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo .divCampo.tipo {
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                white-space: nowrap !important;
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo .divCampo.tipo span,
            #superproc-col-direita #fldOpcoesAvancadas .porPolo .divCampo.tipo label {
                font-size: 12px !important;
                white-space: nowrap !important;
                overflow: visible !important;
                text-overflow: clip !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo .divCampo.opcoes {
                display: grid !important;
                grid-template-columns: 34px 28px minmax(0, 1fr) !important;
                align-items: center !important;
                width: 100% !important;
                max-width: none !important;
                column-gap: 4px !important;
                min-width: 0 !important;
                white-space: nowrap !important;
            }
            #superproc-col-direita #fldOpcoesAvancadas .porPolo #divDataFinalPrazo {
                display: flex !important;
                align-items: center !important;
                gap: 3px !important;
                min-width: 0 !important;
                white-space: nowrap !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso input[id^="txtPrazo"] {
                width: 32px !important;
                min-width: 30px !important;
                max-width: 36px !important;
                padding: 1px 2px !important;
                font-size: 11px !important;
                height: 22px !important;
                box-sizing: border-box !important;
                text-align: center !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso input[id^="txtData"] {
                width: 72px !important;
                min-width: 70px !important;
                max-width: 78px !important;
                padding: 1px 3px !important;
                font-size: 11px !important;
                height: 22px !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso .spanPrazoIntimacaoUrgente {
                font-size: 13px !important;
                cursor: pointer !important;
                margin-left: 2px !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso label.infraLabelOpcional {
                font-size: 11px !important;
                margin: 0 !important;
            }
            #superproc-col-direita #conteudoAcoesNoProcesso img.infraImgNormal {
                vertical-align: middle !important;
                margin: 0 1px !important;
                cursor: pointer !important;
            }

            /* Coluna Esquerda - Fieldsets limpos */
            #superproc-col-esquerda fieldset.infraFieldset,
            #superproc-col-esquerda #divMinutas fieldset {
                margin-top: 0 !important;
                margin-bottom: 6px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            #superproc-col-esquerda #fldSelDest select {
                max-width: 90% !important;
            }
            /* Destinatário é opcional neste fluxo; preservar o campo para o
               EPROC, mas não ocupar espaço no painel rápido. */
            #superproc-col-esquerda #fldSelDest {
                display: none !important;
            }
            /* A minuta atual já está definida pelo editor; manter o checkbox
               nativo para o envio, sem exibir a relação redundante. */
            #superproc-col-esquerda #fldMinutas {
                display: none !important;
            }
            #superproc-col-esquerda #divTrocaLocalizador {
                width: 100% !important;
                box-sizing: border-box !important;
            }
            #superproc-col-esquerda #divTrocaLocalizador > select {
                max-width: 100% !important;
                box-sizing: border-box !important;
            }
            /* Agendamento continua controlado pelo Smart Evento, mas sem a
               legenda/moldura nativa que duplica visualmente esse controle. */
            #superproc-col-esquerda #fldEventoAgendamento {
                border: 0 !important;
                margin: 6px 0 !important;
                padding: 0 !important;
                min-width: 0 !important;
            }
            #superproc-col-esquerda #fldEventoAgendamento > legend {
                display: none !important;
            }
            /* O EPROC também limita a largura dos contêineres intermediários.
               Expande o caminho até a coluna, além do seletor do plugin. */
            #superproc-col-esquerda :is(div, span, fieldset):has(#selEventoComplementar),
            #superproc-col-esquerda :is(div, span, fieldset):has(.ms-parent input[name="selectItemselEventoComplementar[]"]) {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                flex: none !important;
                box-sizing: border-box !important;
            }
            #superproc-col-esquerda .ms-parent:has(input[name="selectItemselEventoComplementar[]"]) {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
            }
            #superproc-col-esquerda .ms-parent:has(input[name="selectItemselEventoComplementar[]"]) > .ms-choice,
            #superproc-col-esquerda .ms-parent:has(input[name="selectItemselEventoComplementar[]"]) > .ms-drop {
                width: 100% !important;
                box-sizing: border-box !important;
            }
            /* Lista rara no fluxo rápido; preservar para os scripts nativos,
               mas liberar a área visual para o novo localizador. */
            #superproc-col-esquerda #lblLocalizadoresAtuais,
            #superproc-col-esquerda #selLocalizadorDesativar {
                display: none !important;
            }
            /* O EPROC monta este fieldset como uma linha Bootstrap de duas
               células. Como a célula dos localizadores atuais foi ocultada,
               a célula do novo localizador deve ocupar toda a largura. */
            #superproc-col-esquerda #conteudoAlterarLocalizadores {
                height: auto !important;
                min-height: 0 !important;
            }
            #superproc-col-esquerda #conteudoAlterarLocalizadores > .row {
                display: block !important;
                margin: 0 !important;
            }
            #superproc-col-esquerda #conteudoAlterarLocalizadores > .row > :first-child {
                display: none !important;
            }
            #superproc-col-esquerda #conteudoAlterarLocalizadores > .row > :nth-child(2) {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                flex: none !important;
                padding: 0 !important;
            }
            #superproc-col-esquerda #lblNovoLocalizador,
            #superproc-col-esquerda #selNovoLocalizador,
            #superproc-col-esquerda #chkLocalizadoresSecundarios,
            #superproc-col-esquerda #lblLocalizadoresSecundarios,
            #superproc-col-esquerda #divLocalizadorSecundario,
            #superproc-col-esquerda #chkAlterarLocalizadoresAberto,
            #superproc-col-esquerda #lblAlterarLocalizadoresAberto {
                position: static !important;
                left: auto !important;
                top: auto !important;
                bottom: auto !important;
                margin: 4px 0 !important;
            }
            #superproc-col-esquerda #selNovoLocalizador,
            #superproc-col-esquerda #divLocalizadorSecundario {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
            }
            /* O Localizador Smart sincroniza este select nativo. Em vez de
               removê-lo, deixamo-lo renderizado porém fora da área visível. */
            #superproc-col-esquerda #lblNovoLocalizador {
                display: none !important;
            }
            #superproc-col-esquerda #selNovoLocalizador {
                position: absolute !important;
                width: 1px !important;
                min-width: 1px !important;
                max-width: 1px !important;
                height: 1px !important;
                min-height: 1px !important;
                opacity: 0 !important;
                overflow: hidden !important;
                pointer-events: none !important;
                clip: rect(0 0 0 0) !important;
                clip-path: inset(50%) !important;
            }
            /* O Smart Localizador substitui o cabeçalho e a preferência
               legados; manter somente os controles complementares úteis. */
            #superproc-col-esquerda #fldAlterarLocalizadores {
                border: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #superproc-col-esquerda #fldAlterarLocalizadores > legend,
            #superproc-col-esquerda #chkAlterarLocalizadoresAberto,
            #superproc-col-esquerda #lblAlterarLocalizadoresAberto {
                display: none !important;
            }
            /* O Smart Evento usa #txtEvento como ponte para o EPROC. Mantém
               o bloco nativo renderizado, porém invisível e fora do fluxo. */
            #superproc-col-esquerda #divEventoAgendamento div:has(> #txtEvento) {
                position: absolute !important;
                width: 1px !important;
                min-width: 1px !important;
                max-width: 1px !important;
                height: 1px !important;
                min-height: 1px !important;
                margin: 0 !important;
                opacity: 0 !important;
                overflow: hidden !important;
                pointer-events: none !important;
                clip: rect(0 0 0 0) !important;
                clip-path: inset(50%) !important;
            }
            #superproc-col-direita #divResultado {
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            /* Resultado carregado após selecionar as partes: os checkboxes de
               urgência são gerados pelo EPROC sem alinhamento consistente. */
            #superproc-col-direita #divResultado input[id*="IntimacaoUrgente"] {
                width: auto !important;
                min-width: 0 !important;
                height: auto !important;
                margin: 0 4px 0 0 !important;
                vertical-align: middle !important;
            }
            #superproc-col-direita #divResultado label[for*="IntimacaoUrgente"] {
                display: inline-flex !important;
                align-items: center !important;
                min-height: 20px !important;
                margin: 0 0 3px !important;
                vertical-align: middle !important;
                white-space: nowrap !important;
            }
            /* Cada parte selecionada é produzida pelo EPROC com coordenadas
               percentuais absolutas. No painel estreito, elas se sobrepõem.
               Mantemos os mesmos inputs, mas usamos uma régua estável. */
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] {
                position: relative !important;
                height: 78px !important;
                min-height: 78px !important;
                overflow: visible !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > label.infraLabelObrigatorio {
                left: 0 !important;
                top: 8px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtPrz"] {
                left: 0 !important;
                top: 29px !important;
                width: 36px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtPrz"] + label {
                left: 42px !important;
                top: 33px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtPrz"] + label + label {
                left: 72px !important;
                top: 33px !important;
                font-size: 0 !important;
                line-height: 16px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtPrz"] + label + label::after {
                content: 'ou' !important;
                font-size: 12px !important;
                line-height: 16px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtPrz"] + label + label + label {
                left: 108px !important;
                top: 8px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="txtDtf"] {
                left: 108px !important;
                top: 29px !important;
                width: 88px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > img[id^="imgCdtf"] {
                left: 201px !important;
                top: 31px !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="chkIntimacaoUrgente"] {
                left: 226px !important;
                top: 29px !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > label[for^="chkIntimacaoUrgente"] {
                left: 244px !important;
                top: 29px !important;
                min-height: auto !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > input[id^="chkIntimacaoPessoalDJE"] {
                left: 226px !important;
                top: 51px !important;
                box-sizing: border-box !important;
            }
            #superproc-col-direita #ocultarListaDePartes .infraAreaDados[id^="divDados"] > label[for^="chkIntimacaoPessoalDJE"] {
                left: 244px !important;
                top: 51px !important;
                min-height: auto !important;
            }
            /* Depoentes não são usados no fluxo rápido; manter a tabela e o
               campo oculto no DOM para não afetar o estado do EPROC. */
            #superproc-col-esquerda #divSegundaParte {
                display: none !important;
            }
        `;
        (innerDoc.head || innerDoc.documentElement).appendChild(style);
    }

    const form = innerDoc.getElementById('frmMinutaCadastro');
    if (!form) return;

    // 2. Garante o container do grid
    let grid = innerDoc.getElementById('superproc-alterar-grid');
    if (!grid) {
        grid = innerDoc.createElement('div');
        grid.id = 'superproc-alterar-grid';
        grid.className = 'superproc-alterar-grid';

        const colEsq = innerDoc.createElement('div');
        colEsq.id = 'superproc-col-esquerda';
        colEsq.className = 'superproc-col-esquerda';

        const colDir = innerDoc.createElement('div');
        colDir.id = 'superproc-col-direita';
        colDir.className = 'superproc-col-direita';

        grid.appendChild(colEsq);
        grid.appendChild(colDir);

        const barraComandos = innerDoc.getElementById('divInfraBarraComandosSuperior') ||
                             innerDoc.querySelector('.eproc-barra-superior-flutuante');
        const blocoComandos = barraComandos &&
            (barraComandos.closest('.eproc-barra-superior-flutuante') || barraComandos);
        if (blocoComandos && form.contains(blocoComandos)) {
            blocoComandos.after(grid);
        } else {
            form.prepend(grid);
        }
    }

    // A barra é inserida pelo EPROC em alguns carregamentos após o formulário.
    // Reposiciona a grade quando ela aparecer, evitando campos antes de Salvar.
    const barraComandos = innerDoc.getElementById('divInfraBarraComandosSuperior') ||
                         innerDoc.querySelector('.eproc-barra-superior-flutuante');
    const blocoComandos = barraComandos &&
        (barraComandos.closest('.eproc-barra-superior-flutuante') || barraComandos);
    if (blocoComandos && form.contains(blocoComandos) && grid.previousElementSibling !== blocoComandos) {
        blocoComandos.after(grid);
    }

    const colEsq = innerDoc.getElementById('superproc-col-esquerda');
    const colDir = innerDoc.getElementById('superproc-col-direita');
    if (!colEsq || !colDir) return;

    // 3. Coluna Esquerda: Smart Localizador, Smart Eventos, Minutas, Destinatário, Agendamento
    const elSmartLoc = innerDoc.getElementById('smartloc-container');
    const elSmartEvt = innerDoc.getElementById('smartevt-container');
    const elDivMinutas = innerDoc.getElementById('divMinutas');
    const elFldDest = innerDoc.getElementById('fldSelDest');
    const elFldJulgamento = innerDoc.getElementById('fldJulgamento');
    const elFldJulgamentoRel = innerDoc.getElementById('fldJulgamentoRelacionado');
    const elFldAgendamento = innerDoc.getElementById('fldEventoAgendamento');
    const elTrocaLocalizador = innerDoc.getElementById('divTrocaLocalizador');
    const elAgendamentoAudiencia = innerDoc.getElementById('divExibeHtmlAgendamentoAudiencia');

    if (elSmartLoc && elSmartLoc.parentNode !== colEsq) colEsq.appendChild(elSmartLoc);
    if (elSmartEvt && elSmartEvt.parentNode !== colEsq) colEsq.appendChild(elSmartEvt);
    if (elDivMinutas && elDivMinutas.parentNode !== colEsq) colEsq.appendChild(elDivMinutas);
    if (elFldDest && elFldDest.parentNode !== colEsq) colEsq.appendChild(elFldDest);
    if (elFldJulgamento && elFldJulgamento.parentNode !== colEsq) colEsq.appendChild(elFldJulgamento);
    if (elFldJulgamentoRel && elFldJulgamentoRel.parentNode !== colEsq) colEsq.appendChild(elFldJulgamentoRel);
    if (elFldAgendamento && elFldAgendamento.parentNode !== colEsq) colEsq.appendChild(elFldAgendamento);
    if (elTrocaLocalizador && elTrocaLocalizador.parentNode !== colEsq) colEsq.appendChild(elTrocaLocalizador);
    if (elAgendamentoAudiencia && elAgendamentoAudiencia.parentNode !== colEsq) colEsq.appendChild(elAgendamentoAudiencia);

    // Ordenação na coluna esquerda
    if (elSmartLoc && colEsq.firstElementChild !== elSmartLoc) {
        colEsq.insertBefore(elSmartLoc, colEsq.firstElementChild);
    }
    if (elSmartEvt && elSmartLoc && elSmartLoc.nextElementSibling !== elSmartEvt) {
        elSmartLoc.after(elSmartEvt);
    }
    const refAposEvt = elSmartEvt || elSmartLoc;
    if (elDivMinutas && refAposEvt && refAposEvt.nextElementSibling !== elDivMinutas) {
        refAposEvt.after(elDivMinutas);
    }
    const refAposMinutas = elDivMinutas || refAposEvt;
    if (elFldDest && refAposMinutas && refAposMinutas.nextElementSibling !== elFldDest) {
        refAposMinutas.after(elFldDest);
    }
    if (elTrocaLocalizador && elFldDest && elFldDest.nextElementSibling !== elTrocaLocalizador) {
        elFldDest.after(elTrocaLocalizador);
    }

    // Títulos concisos e compactos e ocultação de barras de ferramentas
    if (elSmartLoc) {
        const titleLoc = elSmartLoc.querySelector('.smartloc-title');
        if (titleLoc && titleLoc.textContent !== 'Localizador') {
            titleLoc.textContent = 'Localizador';
        }
        const tbLoc = elSmartLoc.querySelector('.smartloc-toolbar');
        if (tbLoc && tbLoc.style.display !== 'none') {
            tbLoc.style.setProperty('display', 'none', 'important');
        }
    }
    if (elSmartEvt) {
        const titleEvt = elSmartEvt.querySelector('.smartevt-title');
        if (titleEvt && titleEvt.textContent !== 'Evento') {
            titleEvt.textContent = 'Evento';
        }
        const tbEvt = elSmartEvt.querySelector('.smartevt-toolbar');
        if (tbEvt && tbEvt.style.display !== 'none') {
            tbEvt.style.setProperty('display', 'none', 'important');
        }
    }

    // 4. Coluna Direita: controles de intimar/citar e Opções Avançadas.
    // Apenas o fieldset é deslocado. O contêiner legado ao redor dele mantém
    // seus inputs ocultos e scripts no fluxo nativo do EPROC.
    const elChkIntimar = innerDoc.getElementById('divchkEncadeamentoIntimar');
    const elTipoEventoEncadeado = innerDoc.getElementById('divTipoEventoEncadeado');
    const elSalvarNovaIntimacao = innerDoc.getElementById('btnSalvarDadosParaNovaIntimacao');
    const elFldOpcoesAvancadas = innerDoc.getElementById('fldOpcoesAvancadas');
    const elDadosCitacaoIntimacao = innerDoc.getElementById('divDadosCitacaoIntimacao');
    const elResultado = innerDoc.getElementById('divResultado');

    if (elChkIntimar && elChkIntimar.parentNode !== colDir) {
        colDir.appendChild(elChkIntimar);
    }
    if (elTipoEventoEncadeado && elTipoEventoEncadeado.parentNode !== colDir) {
        colDir.appendChild(elTipoEventoEncadeado);
    }
    if (elSalvarNovaIntimacao && elSalvarNovaIntimacao.parentNode !== colDir) {
        colDir.appendChild(elSalvarNovaIntimacao);
    }
    if (elFldOpcoesAvancadas && elFldOpcoesAvancadas.parentNode !== colDir) {
        colDir.appendChild(elFldOpcoesAvancadas);
    }
    if (elResultado && elResultado.parentNode !== colDir) {
        colDir.appendChild(elResultado);
    }

    // O EPROC mantém conteúdo complementar no mesmo contêiner das opções.
    // Depois de retirar o fieldset para a coluna direita, esse resíduo não
    // pode ficar dentro da coluna esquerda; ele deve iniciar após a grade.
    if (elDadosCitacaoIntimacao && grid.nextElementSibling !== elDadosCitacaoIntimacao) {
        grid.after(elDadosCitacaoIntimacao);
    }
    if (elDadosCitacaoIntimacao) {
        elDadosCitacaoIntimacao.classList.add('superproc-apos-grade');
    }

    // 5. Otimização dos textos e botões de Opções Avançadas (Partes e Prazos)
    innerDoc.querySelectorAll('.prazoPeritos, .prazoPeritosPolo, #linhaPoloPerAutAPSUE .divCampo.tipo span, #linhaTipoPartePerAutAPSUE .divCampo.tipo span').forEach(el => {
        if (el.textContent.includes('Peritos') && !el.textContent.includes('🚨')) {
            el.textContent = 'Peritos e outros';
        }
    });
    innerDoc.querySelectorAll('#linhaPoloUEAPS .divCampo.tipo span, #linhaTipoParteUEAPS .divCampo.tipo span').forEach(el => {
        if (el.textContent.includes('Unidade Externa') && !el.textContent.includes('🚨')) {
            el.textContent = 'Unidade Externa';
        }
    });
    innerDoc.querySelectorAll('.spanPrazoIntimacaoUrgente').forEach(el => {
        if (el.textContent !== '🚨') {
            el.textContent = '🚨';
            el.title = 'Intimação Urgente';
        }
    });
}

function iniciarObservador(isSubFrmEditor) {
    document.body?.classList.add('superproc-minuta-ativa');

    if (!isSubFrmEditor) return;
    reorganizarLayoutMinutaAlterar(document);

    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            reorganizarLayoutMinutaAlterar(document);
        }, 80);
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // Desconecta após 10s para liberar recursos
    setTimeout(() => {
        observer.disconnect();
    }, 10000);
}

export default {
    id: MODULE_ID,
    name: 'Editor - Dados Rápidos',
    category: 'Editor de Minutas',
    description: 'Layout rápido em duas colunas para os dados simples, com opções avançadas preservadas em largura nativa.',
    defaultEnabled: false,

    matches: (url) => url.pathname.includes('controlador.php'),

    init(context) {
        if (window.__superprocAjustesGeraisInjetado) return;
        window.__superprocAjustesGeraisInjetado = true;

        const urlParams = context?.params || new URLSearchParams(window.location.search);
        const acao = urlParams.get('acao') || '';

        // NUNCA tratar como minuta na capa do processo (processo_selecionar), lista de localizadores ou editor de texto
        let isMinuta = false;
        if (acao !== 'processo_selecionar' && acao !== 'localizador_processos_lista' && acao !== 'minuta_editar') {
            isMinuta = ['minuta_alterar_dados', 'minuta_cadastrar'].includes(acao) || 
                       window.location.href.includes('minuta_alterar_dados') ||
                       window.location.href.includes('minuta_cadastrar') ||
                       (!!document.getElementById('frmMinutaCadastro') && !document.getElementById('divArvoreProcesso'));
        }

        if (!isMinuta) return;

        const isSubFrmEditor = verificarOrigemEditor();

        injetarEstilos();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => iniciarObservador(isSubFrmEditor), { once: true });
        } else {
            iniciarObservador(isSubFrmEditor);
        }
    }
};
