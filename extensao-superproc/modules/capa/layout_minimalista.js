/**
 * SuperPROC - Capa - Linha Unificada
 * 
 * Unifica as informações de "Classe da Ação" e "Nº do Processo" em uma única linha elegante:
 * [ i ] PROCEDIMENTO COMUM CÍVEL n. 0000000-00.0000.0.00.0000
 * 
 * As demais informações (Data de Autuação/Protocolo, Competência, Juiz, Órgão/Unidade e Colegiado)
 * ficam disponíveis no popover estruturado do ícone [ i ].
 * 
 * Todas as demais partes da página (botões de ação, situação, localizadores, partes)
 * permanecem 100% nativas e intactas, sem qualquer interferência no DOM.
 */

const MODULE_ID = 'capa_layout_minimalista';
const STYLE_ID = 'superproc-layout-minimalista-style';
const UNIFIED_LINE_ID = 'superproc-capa-linha-unificada';

function injetarEstilos() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        /* Oculta apenas os 6 campos originais verbosos que foram unificados no cabeçalho e popover */
        .superproc-min-campo-oculto,
        .superproc-min-colegiado-original,
        body.superproc-minimalista-ativo #divCapaProcesso > .row:first-child > [role="region"][aria-label*="processo" i],
        body.superproc-minimalista-ativo #divCapaProcesso > .row:first-child > [role="region"][aria-label*="Classe da" i],
        body.superproc-minimalista-ativo #divCapaProcesso > .row:first-child > [role="region"][aria-label*="Compet" i],
        body.superproc-minimalista-ativo #divCapaProcesso > .row:first-child > [aria-label*="autua" i],
        body.superproc-minimalista-ativo #divCapaProcesso > .row:nth-child(2) > [role="region"][aria-label*="Julgador" i],
        body.superproc-minimalista-ativo #divCapaProcesso > .row:nth-child(2) > [role="region"][aria-label*="Juiz" i] {
            display: none !important;
        }

        /* Reseta margens negativas das rows em divCapaProcesso para respeitar os limites de fldCapa */
        body.superproc-minimalista-ativo #divCapaProcesso > .row {
            margin-left: 0 !important;
            margin-right: 0 !important;
        }

        /* Ajuste sutil na primeira linha para comportar a linha unificada à esquerda e a situação à direita */
        body.superproc-minimalista-ativo #divCapaProcesso > .row:first-child {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            margin-bottom: 4px !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }

        /* Ajuste na segunda linha para exibir os botões de ação com alinhamento limpo */
        body.superproc-minimalista-ativo #divCapaProcesso > .row:nth-child(2) {
            display: flex !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            margin-top: 2px !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
        }

        /* Garante que os botões flutuantes respeitem a margem sem offsets negativos */
        body.superproc-minimalista-ativo .botoes-flutuantes-container {
            margin-left: 0 !important;
        }

        /* Situação: Oculta #lblSituacao e alinha botão de histórico na mesma linha à esquerda de #txtSituacao */
        #lblSituacao {
            display: none !important;
        }

        body.superproc-minimalista-ativo #divCapaProcesso [role="region"][aria-label*="Situa" i],
        body.superproc-minimalista-ativo #divCapaProcesso .col-auto:has(#txtSituacao) {
            display: inline-flex !important;
            align-items: center !important;
            flex-direction: row !important;
            gap: 6px !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
        }

        body.superproc-minimalista-ativo #divCapaProcesso [role="region"][aria-label*="Situa" i] > a,
        body.superproc-minimalista-ativo #divCapaProcesso .col-auto:has(#txtSituacao) > a {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            order: 1 !important;
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1 !important;
        }

        body.superproc-minimalista-ativo #divCapaProcesso [role="region"][aria-label*="Situa" i] > a img,
        body.superproc-minimalista-ativo #divCapaProcesso .col-auto:has(#txtSituacao) > a img {
            vertical-align: middle !important;
        }

        body.superproc-minimalista-ativo #divCapaProcesso [role="region"][aria-label*="Situa" i] > #txtSituacao,
        body.superproc-minimalista-ativo #divCapaProcesso .col-auto:has(#txtSituacao) > #txtSituacao {
            order: 2 !important;
            margin: 0 !important;
        }

        /* Linha Unificada */
        #${UNIFIED_LINE_ID} {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: flex-start;
            gap: 5px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.4;
            padding: 2px 0;
            box-sizing: border-box;
        }

        /* Ícone ( i ) e Popover */
        .superproc-min-info-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
            margin-right: 2px;
        }

        .superproc-min-info-btn {
            width: 21px;
            height: 21px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
            background: #f1f5f9;
            color: #475569;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            outline: none;
            transition: all 0.15s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .superproc-min-info-btn:hover,
        .superproc-min-info-btn:focus,
        .superproc-min-info-wrap.superproc-popover-open .superproc-min-info-btn {
            border-color: #0284c7;
            color: #0284c7;
            background-color: #e0f2fe;
        }

        /* Popover Estruturado */
        .superproc-min-popover {
            position: absolute;
            top: calc(100% + 7px);
            left: -6px;
            min-width: 290px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
            padding: 10px 14px;
            font-size: 12px;
            color: #334155;
            line-height: 1.55;
            z-index: 10050;
            pointer-events: auto;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.18s ease, visibility 0.18s ease, transform 0.18s ease;
        }

        .superproc-min-popover::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 10.5px;
            border-width: 6px;
            border-style: solid;
            border-color: transparent transparent #cbd5e1 transparent;
        }

        .superproc-min-popover::after {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 11.5px;
            border-width: 5px;
            border-style: solid;
            border-color: transparent transparent #ffffff transparent;
        }

        .superproc-min-info-wrap:hover .superproc-min-popover,
        .superproc-min-info-wrap.superproc-popover-open .superproc-min-popover {
            opacity: 1;
            visibility: visible;
            transform: translateY(2px);
        }

        .superproc-popover-row {
            display: flex !important;
            align-items: baseline !important;
            margin-bottom: 4px !important;
            font-size: 12px !important;
            line-height: 1.45 !important;
        }

        .superproc-popover-row:last-child {
            margin-bottom: 0 !important;
        }

        .superproc-popover-label {
            font-weight: 700 !important;
            color: #0f172a !important;
            width: 78px !important;
            flex-shrink: 0 !important;
            margin-right: 6px !important;
        }

        .superproc-popover-value {
            font-weight: 400 !important;
            color: #334155 !important;
            word-break: break-word !important;
        }

        .superproc-popover-row-competencia {
            margin: 1px 0 4px 0 !important;
        }

        .superproc-popover-row-competencia .superproc-popover-value {
            font-weight: 400 !important;
            color: #334155 !important;
        }

        /* Nome da Classe - Negrito */
        #superproc-capa-linha-unificada .superproc-min-classe {
            font-size: 15px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
            text-transform: uppercase !important;
            letter-spacing: 0.015em !important;
            white-space: nowrap !important;
            margin-right: 1px !important;
            user-select: text !important;
        }

        /* Prefixo 'n.' - Sem negrito */
        #superproc-capa-linha-unificada .superproc-min-num-prefixo {
            font-size: 15px !important;
            font-weight: 400 !important;
            color: #334155 !important;
            white-space: nowrap !important;
            margin: 0 !important;
            padding: 0 !important;
            user-select: text !important;
        }

        /* Número do Processo - Sem negrito */
        #superproc-capa-linha-unificada .superproc-min-numero {
            font-size: 15px !important;
            font-weight: 400 !important;
            color: #1e293b !important;
            cursor: pointer !important;
            padding: 1px 3px !important;
            border-radius: 3px !important;
            transition: background-color 0.15s ease, color 0.15s ease !important;
            user-select: all !important;
            white-space: nowrap !important;
        }

        #superproc-capa-linha-unificada .superproc-min-numero:hover {
            background-color: rgba(0, 0, 0, 0.08) !important;
            color: #0284c7 !important;
        }

        /* Toast feedback de cópia */
        .superproc-copy-toast {
            position: absolute;
            bottom: calc(100% + 4px);
            left: 50%;
            transform: translateX(-50%);
            background: #0f172a;
            color: #ffffff;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
            pointer-events: none;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.2s ease, transform 0.2s ease;
            z-index: 10060;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        }

        .superproc-copy-toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(-2px);
        }
    `;
    document.head.appendChild(style);
}

function obterTexto(idOuElem) {
    const el = typeof idOuElem === 'string' ? document.getElementById(idOuElem) : idOuElem;
    if (!el) return '';
    return (el.textContent || '').trim().replace(/\s+/g, ' ');
}

function copiarTexto(texto, triggerEl) {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
        let toast = triggerEl.parentNode.querySelector('.superproc-copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'superproc-copy-toast';
            triggerEl.parentNode.appendChild(toast);
        }
        toast.textContent = 'Copiado!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);
    }).catch(() => {});
}

function ajustarBlocoSituacao() {
    const lblSituacao = document.getElementById('lblSituacao');
    if (lblSituacao) {
        lblSituacao.style.setProperty('display', 'none', 'important');
    }

    const txtSituacao = document.getElementById('txtSituacao');
    if (txtSituacao) {
        const colSituacao = txtSituacao.closest('[role="region"][aria-label*="Situa" i], .col-auto');
        if (colSituacao) {
            colSituacao.style.setProperty('display', 'inline-flex', 'important');
            colSituacao.style.setProperty('align-items', 'center', 'important');
            colSituacao.style.setProperty('flex-direction', 'row', 'important');
            colSituacao.style.setProperty('gap', '6px', 'important');

            const btnHistorico = colSituacao.querySelector('a[href*="log_processo_listar"], a[aria-label*="Histórico" i]');
            if (btnHistorico) {
                btnHistorico.style.setProperty('display', 'inline-flex', 'important');
                btnHistorico.style.setProperty('align-items', 'center', 'important');
                btnHistorico.style.setProperty('line-height', '1', 'important');
                if (btnHistorico.nextElementSibling !== txtSituacao) {
                    colSituacao.insertBefore(btnHistorico, txtSituacao);
                }
            }
        }
    }
}

function sincronizarColegiado(capa, popover) {
    const valor = capa.querySelector('#txtColegiado');
    const rotulo = [...capa.querySelectorAll('label, span, small')].find(el =>
        !el.closest('#' + UNIFIED_LINE_ID) && /^colegiado\s*:?$/i.test(obterTexto(el)));
    const campo = valor?.closest('.col-auto, [role="region"]') ||
        capa.querySelector('[role="region"][aria-label*="Colegiado" i], .col-auto[aria-label*="Colegiado" i]') ||
        rotulo?.closest('.col-auto, [role="region"]') || valor;
    const texto = obterTexto(valor || campo).replace(/^colegiado\s*:?\s*/i, '');
    const original = capa.querySelector('.superproc-min-colegiado-original');
    if (original && (original !== campo || !texto)) original.classList.remove('superproc-min-colegiado-original');

    let linha = popover.querySelector('.superproc-popover-row-colegiado');
    if (!texto || texto === '-') {
        campo?.classList.remove('superproc-min-colegiado-original');
        linha?.remove();
        return;
    }

    campo?.classList.add('superproc-min-colegiado-original');
    if (!linha) {
        linha = document.createElement('div');
        linha.className = 'superproc-popover-row superproc-popover-row-colegiado';
        linha.innerHTML = '<span class="superproc-popover-label">Colegiado:</span><span class="superproc-popover-value"></span>';
        popover.appendChild(linha);
    }
    const exibido = linha.querySelector('.superproc-popover-value');
    if (exibido.textContent !== texto) exibido.textContent = texto;
}

function aplicarLinhaUnificada() {
    const divCapa = document.getElementById('divCapaProcesso');
    if (!divCapa) return;

    injetarEstilos();
    document.body.classList.add('superproc-minimalista-ativo');

    // Sempre ajusta o bloco de Situação independentemente de a linha já ter sido unificada
    ajustarBlocoSituacao();

    // Se a linha unificada já existir, não recria
    const popoverExistente = document.querySelector('#' + UNIFIED_LINE_ID + ' .superproc-min-popover');
    if (popoverExistente) {
        sincronizarColegiado(divCapa, popoverExistente);
        return;
    }

    const row1 = divCapa.querySelector('.row:first-child');
    if (!row1) return;

    // 1. Extração dos dados dos campos originais
    const elClasse = document.getElementById('txtClasse');
    const elNum = document.getElementById('txtNumProcesso');
    const elAutuacao = document.getElementById('txtAutuacao');
    const elCompetencia = document.getElementById('txtCompetencia');
    const elMagistrado = document.getElementById('txtMagistrado');
    const elOrgao = document.getElementById('txtOrgaoJulgador');

    const strClasse = obterTexto(elClasse) || 'PROCESSO';
    const strNum = obterTexto(elNum) || '';
    const strAutuacao = obterTexto(elAutuacao);
    const dataProtocolo = strAutuacao.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || strAutuacao || '-';
    const strCompetencia = obterTexto(elCompetencia) || '-';
    const strJuiz = obterTexto(elMagistrado) || '-';
    const rawOrgao = obterTexto(elOrgao) || '-';
    const strUnidade = rawOrgao.replace(/^Ju[íi\uFFFD]zo\s+d[aoe]\s+/i, '').trim() || '-';

    // 2. Oculta apenas os 6 blocos verbosos originais
    const camposParaOcultar = [
        elNum?.closest('.col-auto'),
        elClasse?.closest('.col-auto'),
        elCompetencia?.closest('.col-auto'),
        elAutuacao?.closest('.col-auto, section'),
        elOrgao?.closest('.col-auto'),
        elMagistrado?.closest('.col-auto')
    ];

    camposParaOcultar.forEach((col) => {
        if (col) col.classList.add('superproc-min-campo-oculto');
    });

    // 3. Monta a Linha Unificada
    const linhaUnificada = document.createElement('div');
    linhaUnificada.id = UNIFIED_LINE_ID;

    // Ícone [ i ] com Popover
    const wrapInfo = document.createElement('div');
    wrapInfo.className = 'superproc-min-info-wrap';

    const btnInfo = document.createElement('button');
    btnInfo.type = 'button';
    btnInfo.className = 'superproc-min-info-btn';
    btnInfo.setAttribute('aria-label', 'Detalhes do Processo');
    btnInfo.innerHTML = '<span>i</span>';

    const popover = document.createElement('div');
    popover.className = 'superproc-min-popover';
    popover.innerHTML = `
        <div class="superproc-popover-row">
            <span class="superproc-popover-label">Protocolo:</span>
            <span class="superproc-popover-value">${dataProtocolo}</span>
        </div>
        <div class="superproc-popover-row superproc-popover-row-competencia">
            <span class="superproc-popover-value">${strCompetencia}</span>
        </div>
        <div class="superproc-popover-row">
            <span class="superproc-popover-label">Juiz:</span>
            <span class="superproc-popover-value">${strJuiz}</span>
        </div>
        <div class="superproc-popover-row">
            <span class="superproc-popover-label">Unidade:</span>
            <span class="superproc-popover-value">${strUnidade}</span>
        </div>
    `;

    sincronizarColegiado(divCapa, popover);

    btnInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapInfo.classList.toggle('superproc-popover-open');
    });

    document.addEventListener('click', (e) => {
        if (!wrapInfo.contains(e.target)) {
            wrapInfo.classList.remove('superproc-popover-open');
        }
    });

    wrapInfo.appendChild(btnInfo);
    wrapInfo.appendChild(popover);
    linhaUnificada.appendChild(wrapInfo);

    // Classe da Ação
    const spanClasse = document.createElement('span');
    spanClasse.className = 'superproc-min-classe';
    spanClasse.textContent = strClasse;
    linhaUnificada.appendChild(spanClasse);

    // Prefixo 'n.'
    const spanPrefixo = document.createElement('span');
    spanPrefixo.className = 'superproc-min-num-prefixo';
    spanPrefixo.textContent = 'n.';
    linhaUnificada.appendChild(spanPrefixo);

    // Número do Processo (clicável para copiar)
    const spanNum = document.createElement('span');
    spanNum.className = 'superproc-min-numero';
    spanNum.textContent = strNum;
    spanNum.title = 'Clique para copiar o número do processo';
    spanNum.addEventListener('click', (e) => {
        e.stopPropagation();
        copiarTexto(strNum, spanNum);
    });
    linhaUnificada.appendChild(spanNum);

    // Toast de cópia
    const toast = document.createElement('div');
    toast.className = 'superproc-copy-toast';
    toast.textContent = 'Copiado!';
    linhaUnificada.appendChild(toast);

    // Insere no início da primeira linha da capa
    row1.prepend(linhaUnificada);
}

export default {
    id: MODULE_ID,
    name: 'Capa - Layout Minimalista',
    category: 'Capa do Processo',
    description: 'Unifica a Classe da Ação e o Nº do Processo em linha única e condensa Protocolo, Competência, Juiz, Unidade e Colegiado no popover [ i ].',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init() {
        if (window.__superprocCapaMinimalistaInjetado) return;
        window.__superprocCapaMinimalistaInjetado = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                aplicarLinhaUnificada();
                ajustarBlocoSituacao();
            });
        } else {
            aplicarLinhaUnificada();
            ajustarBlocoSituacao();
        }

        // Observador leve apenas para re-aplicar caso o eProc recarregue o conteúdo da capa via ajax
        let debounceTimer;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                aplicarLinhaUnificada();
                ajustarBlocoSituacao();
            }, 150);
        });

        const divCapa = document.getElementById('divCapaProcesso');
        if (divCapa) {
            observer.observe(divCapa, { childList: true, subtree: true, characterData: true });
        }
    }
};
