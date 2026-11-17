/**
 * SuperPROC - Módulo: Capa - Situação com Dias
 *
 * Reproduz, do lado SuperPROC, a pill "Situação" que o AZFLOW monta em #txtSituacao
 * (texto + "Nd" + cor pelo texto), com UMA diferença: o prefixo "MOVIMENTO-" é sempre
 * removido do que é exibido (fica só o conteúdo depois dele).
 *
 * Como o AZFLOW chega ao número (reproduzido aqui):
 *   link "Histórico da situação" (log_processo_listar) -> GET da página -> primeira linha
 *   tr.infraTrClara/infraTrEscura -> 2ª célula -> só dígitos -> "<n>d".
 *
 * Regras de terceiros: o AZFLOW NÃO é alterado nem interceptado. O módulo só LÊ #txtSituacao
 * (texto-base) e mostra um elemento próprio logo depois dele; o original fica invisível e fora do
 * fluxo enquanto o módulo está ativo (propriedades que o AZFLOW não usa; desligar o módulo o devolve).
 */

const ID_PILL = 'superproc-situacao-pill';
const ID_CSS = 'superproc-situacao-pill-css';
const PREFIXO_MOVIMENTO = /^\s*MOVIMENTO\s*-\s*/i;
// Mesmos tempos do AZFLOW para adiar a busca dos dias (ociosidade; sem requestIdleCallback, 1,8 s).
const IDLE_TIMEOUT_MS = 4500;
const FALLBACK_DELAY_MS = 1800;

/** Texto exibido: sem o prefixo "MOVIMENTO-". Se só sobrasse vazio, mantém o original. */
export function removerPrefixoMovimento(texto) {
    const base = String(texto || '').trim();
    const sem = base.replace(PREFIXO_MOVIMENTO, '').trim();
    return sem || base;
}

/** Mesma regra de cor do AZFLOW, aplicada ao texto ORIGINAL (MOVIMENTO-AGUARDA continua verde). */
export function corDaSituacao(textoBase) {
    const t = String(textoBase || '').toUpperCase();
    if (t.includes('BAIXA')) return 'rgba(153, 0, 0, 0.8)';
    if (t.includes('MOVIMENTO-AGUARDA')) return 'rgba(0, 102, 0, 0.8)';
    if (t === 'MOVIMENTO') return 'rgba(0, 0, 153, 0.8)';
    return 'rgba(51, 51, 51, 0.8)';
}

/** Mesma extração do AZFLOW: 1ª linha da tabela, 2ª célula, só dígitos, inteiro >= 0. */
export function extrairDiasUltimaSituacaoDoHtml(html) {
    try {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        const linha = doc.querySelector('tr.infraTrClara, tr.infraTrEscura');
        if (!linha) return null;
        const celulas = linha.querySelectorAll('td');
        if (!celulas || celulas.length < 2) return null;
        const dias = parseInt(String(celulas[1].textContent || '').replace(/\D/g, ''), 10);
        return Number.isFinite(dias) && dias >= 0 ? dias : null;
    } catch (_) {
        return null;
    }
}

function resolverUrlHistoricoSituacao(hrefOuUrl) {
    try {
        const bruto = String(hrefOuUrl || '').trim();
        if (!bruto) return '';
        const matchSubFrm = bruto.match(/exibirSubFrm\s*\(\s*['"]([^'"]+)['"]/i);
        const path = matchSubFrm && matchSubFrm[1] ? matchSubFrm[1] : bruto;
        if (/^https?:\/\//i.test(path)) return path;
        return new URL(path, window.location.href).toString();
    } catch (_) {
        return '';
    }
}

function obterLinkHistoricoSituacao() {
    try {
        const regiao = document.querySelector('[aria-label="Situação"]');
        if (regiao) {
            const naRegiao = regiao.querySelector('a[aria-label="Histórico da situação"]');
            if (naRegiao) return naRegiao;
        }
        const peloLabel = document.querySelector('#lblSituacao + a[href*="log_processo_listar"]');
        if (peloLabel) return peloLabel;
        return document.querySelector('a[aria-label="Histórico da situação"][href*="log_processo_listar"]');
    } catch (_) {
        return null;
    }
}

/** Texto-base da situação, sem o "Nd" que o AZFLOW acrescenta (mesma ordem de preferência dele). */
function obterTextoSituacaoBase(txtSit) {
    if (!txtSit) return '';
    if (txtSit.dataset.azflowSituacaoTexto) return String(txtSit.dataset.azflowSituacaoTexto).trim();
    if (txtSit.querySelector('[data-azflow-situacao-dias="true"]')) {
        let texto = '';
        for (const no of txtSit.childNodes) {
            if (no.nodeType === 1 && no.getAttribute('data-azflow-situacao-dias') === 'true') break;
            texto += no.textContent || '';
        }
        return texto.trim();
    }
    return String(txtSit.textContent || '').trim().replace(/\s+\d+d\s*$/i, '').trim();
}

function injetarCss() {
    if (document.getElementById(ID_CSS)) return;
    const st = document.createElement('style');
    st.id = ID_CSS;
    // O original some sem usar display/width (o AZFLOW os fixa com !important inline): sai do fluxo e fica invisível.
    st.textContent = `
        body.superproc-situacao-ativa #txtSituacao {
            position: absolute !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        /* Modo compacto: o ícone nativo do histórico sai do fluxo (o clique em "Nd" chama esse mesmo link). */
        a[data-superproc-situacao-historico-oculto] {
            position: absolute !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
        }
        /* Modo compacto: só "Nd"; o rótulo abre para a esquerda no hover/foco (fica fora do fluxo, sem empurrar a capa). */
        #${ID_PILL}.superproc-situacao-compacta {
            position: relative !important;
            cursor: pointer !important;
            overflow: visible !important;
        }
        #${ID_PILL}.superproc-situacao-compacta [data-superproc-situacao-label] {
            position: absolute !important;
            right: 100% !important;
            top: 0 !important;
            bottom: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            white-space: nowrap !important;
            padding: 0 8px 0 12px !important;
            border-radius: 6px 0 0 6px !important;
            background-color: var(--superproc-sit-cor-solida, #333) !important;
            color: #fff !important;
            font-weight: inherit !important;
            height: auto !important;
            z-index: 20 !important;
            opacity: 0 !important;
            visibility: hidden !important;
            transform: translateX(10px) !important;
            transition: opacity .14s ease, transform .14s ease, visibility 0s linear .14s !important;
            pointer-events: none !important;
        }
        #${ID_PILL}.superproc-situacao-compacta:hover [data-superproc-situacao-label],
        #${ID_PILL}.superproc-situacao-compacta:focus-visible [data-superproc-situacao-label] {
            opacity: 1 !important;
            visibility: visible !important;
            transform: translateX(0) !important;
            transition: opacity .14s ease, transform .14s ease, visibility 0s !important;
        }
        #${ID_PILL}.superproc-situacao-compacta [data-superproc-situacao-dias] {
            display: inline-flex !important;
            align-items: center !important;
            font-weight: normal !important;
            font-size: inherit !important;
            line-height: 1 !important;
            color: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            height: 1em !important;
        }
        @media (prefers-reduced-motion: reduce) {
            #${ID_PILL}.superproc-situacao-compacta [data-superproc-situacao-label] { transition: none !important; transform: none !important; }
        }
    `;
    (document.head || document.documentElement).appendChild(st);
}

function estilizarPill(pill, cor) {
    const set = (el, prop, valor) => el.style.setProperty(prop, valor, 'important');
    pill.style.fontSize = '15px';
    pill.style.color = '#FFFFFF';
    pill.style.backgroundColor = cor;
    pill.style.borderStyle = 'none';
    pill.style.borderWidth = '1px';
    pill.style.borderColor = '#616161';
    set(pill, 'display', 'flex');
    set(pill, 'align-items', 'center');
    set(pill, 'width', 'max-content');
    set(pill, 'max-width', '100%');
    set(pill, 'box-sizing', 'border-box');
    set(pill, 'line-height', '1');
    set(pill, 'min-height', '28px');
    set(pill, 'padding-top', '0');
    set(pill, 'padding-bottom', '0');
    set(pill, 'order', '2'); // mesma posição que #txtSituacao tem ao lado do botão de histórico (layout minimalista)
}

// A pill é outro elemento: não herda o CSS por ID do eProc/AZFLOW em #txtSituacao (raio, padding, margens, fonte).
// Lê (só leitura) o estilo computado do original e aplica o mesmo na pill, para a capa não mudar de geometria.
const PROPS_GEOMETRIA = [
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'padding-left', 'padding-right',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'font-family', 'font-weight', 'letter-spacing', 'text-transform', 'align-self', 'vertical-align'
];
function copiarGeometria(pill, original) {
    try {
        const cs = window.getComputedStyle(original);
        for (const prop of PROPS_GEOMETRIA) {
            const valor = cs.getPropertyValue(prop);
            if (valor && pill.style.getPropertyValue(prop) !== valor) pill.style.setProperty(prop, valor, 'important');
        }
    } catch (_) { /* sem estilo computado: mantém o padrão */ }
}

const PROPS_LABEL = ['display', 'align-items', 'line-height', 'font-weight', 'height'];
const PROPS_DIAS = ['display', 'align-items', 'font-weight', 'font-size', 'line-height', 'color', 'margin-left', 'padding-left', 'border-left', 'box-sizing', 'height'];

function estilizarLabel(el, compacta = false) {
    if (compacta) { PROPS_LABEL.forEach(p => el.style.removeProperty(p)); return; }
    const set = (prop, valor) => el.style.setProperty(prop, valor, 'important');
    set('display', 'inline-flex');
    set('align-items', 'center');
    set('line-height', '1');
    set('font-weight', 'inherit');
    set('height', '1em');
}

function estilizarDias(el, compacta = false) {
    if (compacta) { PROPS_DIAS.forEach(p => el.style.removeProperty(p)); return; }
    const set = (prop, valor) => el.style.setProperty(prop, valor, 'important');
    set('display', 'inline-flex');
    set('align-items', 'center');
    set('font-weight', 'normal');
    set('font-size', 'inherit');
    set('line-height', '1');
    set('color', 'rgba(255, 255, 255, 0.5)');
    set('margin-left', '0.5em');
    set('padding-left', '0.5em');
    set('border-left', '1px dotted rgba(255, 255, 255, 0.62)');
    set('box-sizing', 'border-box');
    set('height', '1em');
}

export default {
    id: 'capa_situacao_dias',

    async init(context = {}) {
        const txtSit = document.getElementById('txtSituacao');
        if (!txtSit || !txtSit.parentNode) return;

        let pill = null;
        let textoBaseAtual = '';
        let diasAtuais = null;        // inteiro já obtido para urlDiasAtual
        let urlDiasAtual = '';
        let buscaAgendada = false;
        let emAndamento = null;       // { url, promise }
        let compacto = false;         // Modo Compacto (botão do popup): Storage.setModuleSettings(id, { compacto })
        const idModulo = (context.meta && context.meta.id) || 'capa_situacao_dias';

        try {
            if (context.storage && typeof context.storage.getModuleSettings === 'function') {
                compacto = (await context.storage.getModuleSettings(idModulo)).compacto === true;
            }
        } catch (_) { /* sem configuração: modo normal */ }

        function abrirHistorico() {
            const link = obterLinkHistoricoSituacao();
            if (link) link.click(); // aciona o link NATIVO do eProc (javascript:exibirSubFrm), sem reimplementá-lo
        }

        function garantirPill() {
            if (pill && pill.isConnected) return pill;
            pill = document.getElementById(ID_PILL) || document.createElement('span');
            pill.id = ID_PILL;
            pill.className = 'infraLabelObrigatorio';
            pill.setAttribute('aria-description', 'Situação:');
            pill.tabIndex = 0;
            if (!pill.dataset.superprocSituacaoEventos) {
                pill.dataset.superprocSituacaoEventos = '1';
                pill.addEventListener('click', (ev) => { if (pill.classList.contains('superproc-situacao-compacta')) { ev.preventDefault(); abrirHistorico(); } });
                pill.addEventListener('keydown', (ev) => {
                    if ((ev.key === 'Enter' || ev.key === ' ') && pill.classList.contains('superproc-situacao-compacta')) { ev.preventDefault(); abrirHistorico(); }
                });
            }
            if (pill.parentNode !== txtSit.parentNode || pill.previousElementSibling !== txtSit) {
                txtSit.insertAdjacentElement('afterend', pill);
            }
            return pill;
        }

        function desenhar() {
            const base = textoBaseAtual;
            if (!base) return;
            const el = garantirPill();
            estilizarPill(el, corDaSituacao(base));
            copiarGeometria(el, txtSit);
            // Compacto só vale com o número carregado; sem ele mostra o texto normal (nunca uma pill vazia).
            const compactaAgora = compacto && diasAtuais != null;
            el.classList.toggle('superproc-situacao-compacta', compactaAgora);
            const linkHist = obterLinkHistoricoSituacao();
            if (linkHist) linkHist.toggleAttribute('data-superproc-situacao-historico-oculto', compactaAgora);
            const textoExibido = removerPrefixoMovimento(base);
            if (compactaAgora) {
                el.setAttribute('role', 'button');
                el.setAttribute('aria-label', `Situação: ${textoExibido}, ${diasAtuais} dias. Abrir histórico da situação`);
                el.title = 'Clique para abrir o histórico da situação';
                el.style.setProperty('--superproc-sit-cor-solida', corDaSituacao(base).replace(/,\s*[\d.]+\)$/, ', 1)'));
            } else {
                el.removeAttribute('role');
                el.removeAttribute('aria-label');
                el.removeAttribute('title');
                el.style.removeProperty('--superproc-sit-cor-solida');
            }
            el.setAttribute('data-superproc-situacao-texto', base);

            let label = el.querySelector('[data-superproc-situacao-label]');
            if (!label) {
                label = document.createElement('span');
                label.setAttribute('data-superproc-situacao-label', 'true');
                el.insertBefore(label, el.firstChild);
            }
            label.textContent = textoExibido;
            estilizarLabel(label, compactaAgora);

            let dias = el.querySelector('[data-superproc-situacao-dias]');
            if (diasAtuais != null) {
                if (!dias) {
                    dias = document.createElement('span');
                    dias.setAttribute('data-superproc-situacao-dias', 'true');
                    el.appendChild(dias);
                }
                dias.textContent = `${diasAtuais}d`;
                estilizarDias(dias, compactaAgora);
                el.setAttribute('data-superproc-situacao-dias-carregado', String(diasAtuais));
            } else if (dias) {
                dias.remove();
                el.removeAttribute('data-superproc-situacao-dias-carregado');
            }
        }

        async function obterDias(url) {
            if (emAndamento && emAndamento.url === url) return emAndamento.promise;
            const promise = (async () => {
                const resposta = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
                if (!resposta.ok) return null;
                return extrairDiasUltimaSituacaoDoHtml(await resposta.text());
            })();
            emAndamento = { url, promise };
            try { return await promise; } finally { if (emAndamento && emAndamento.url === url) emAndamento = null; }
        }

        async function carregarDias() {
            try {
                const link = obterLinkHistoricoSituacao();
                const url = link ? resolverUrlHistoricoSituacao(link.getAttribute('href') || '') : '';
                if (!url) return;
                if (url === urlDiasAtual && diasAtuais != null) return; // mesmo cache por URL do AZFLOW
                const dias = await obterDias(url);
                const linkAtual = obterLinkHistoricoSituacao();
                const urlAtual = linkAtual ? resolverUrlHistoricoSituacao(linkAtual.getAttribute('href') || '') : '';
                if (urlAtual !== url || dias == null) return; // mesma regra: link mudou ou sem número, nada a mostrar
                urlDiasAtual = url;
                diasAtuais = dias;
                desenhar();
            } catch (_) { /* sem número: mostra só o texto, como o AZFLOW */ }
        }

        function agendarBuscaDias() {
            if (buscaAgendada) return;
            buscaAgendada = true;
            const executar = () => { buscaAgendada = false; carregarDias(); };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(executar, { timeout: IDLE_TIMEOUT_MS });
            else setTimeout(executar, FALLBACK_DELAY_MS);
        }

        function atualizar() {
            const base = obterTextoSituacaoBase(txtSit);
            if (!base) return;
            const mudou = base !== textoBaseAtual || !pill || !pill.isConnected;
            textoBaseAtual = base;
            if (mudou) desenhar();
            else if (pill && pill.isConnected) copiarGeometria(pill, txtSit);
            agendarBuscaDias();
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((mudancas) => {
                const m = mudancas.superproc_custom_settings;
                if (!m) return;
                const novo = !!(m.newValue && m.newValue[idModulo] && m.newValue[idModulo].compacto);
                if (novo === compacto) return;
                compacto = novo;
                desenhar();
            });
        }

        injetarCss();
        document.body.classList.add('superproc-situacao-ativa');
        atualizar();

        // Observação restrita a #txtSituacao e seus irmãos diretos: reage a mudança de texto-base ou a perda da pill.
        // O AZFLOW reescreve o conteúdo de #txtSituacao com o mesmo valor; sem mudança, nada é redesenhado.
        const observador = new MutationObserver(atualizar);
        observador.observe(txtSit, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-azflow-situacao-texto', 'style', 'class'] });
        observador.observe(txtSit.parentNode, { childList: true });
        window.addEventListener('pagehide', () => observador.disconnect(), { once: true });
    }
};
