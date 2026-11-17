/**
 * SuperPROC - Capa - Audiência & Valor da Causa
 *
 * Funcionalidade equivalente à do AZflow, incorporada ao SuperPROC para funcionar sem ele (o AZflow não é alterado):
 *  - Valor da causa, saldo de subcontas (depósito em juízo) e menu de cores/limites.
 *  - Audiência designada.
 *
 * Onde roda: capa do processo (acao=processo_selecionar). Dados: preferências de exibição em chrome.storage
 * (azflowValorCausaExibir) e localStorage do eproc.
 *
 * Diferenças em relação ao AZflow:
 *  1. Identificadores de DOM renomeados de "azflow-*" para "superproc-*" (ids, classes, data-attributes e
 *     chaves de dataset), para não colidir com os elementos do AZflow na mesma página.
 *  2. Ancoragem: valor da causa e audiência entram logo após #eproc-botoes-container (Lembretes/Minutas),
 *     na ordem valor -> saldo -> audiência. O campo Juiz(a) (oculto pelo layout minimalista) só é usado
 *     como fallback e como modelo de classes. Ver localizarAncoraSuperproc*.
 *  3. Retificação do valor da causa (grava nas Informações Adicionais) depende de funções do AZflow que
 *     não existem aqui; os stubs abaixo a desativam. O restante do menu (cores/limites) é idêntico.
 *  4. Gatilhos: o AZflow dispara a audiência de dentro do seu redesenho da capa; aqui há um observador
 *     equivalente em init().
 *  5. Fonte alternativa do valor da causa: se #tblCopiarExcel não existir (ou não tiver a linha), lê a linha
 *     "Valor da Causa:" de Informações Adicionais (obterValorCausaInformacoesAdicionais).
 */

const MODULE_ID = 'capa_audiencia_valor_causa';

// ---- Stubs de dependências do AZflow que não fazem parte desta cópia (item 3 do cabeçalho) ----
let tutelaAzflowSalvando = false;
function podeEditarInformacoesAzflow() { return false; }
async function salvarCampoInformacoesTarjaAzflow() { throw new Error('Retificação indisponível no SuperPROC'); }

// ---- Âncoras (item 2 do cabeçalho) ----
function localizarAncoraSuperproc() {
    return document.getElementById('eproc-botoes-container') || document.getElementById('eproc-botoes-compact-container');
}
function localizarAncoraSuperprocAudiencia() {
    const valor = document.getElementById('superproc-valor-causa-container');
    if (valor && valor.parentNode) return valor;
    return localizarAncoraSuperproc();
}

// Evita duplicidade com os elementos originais do AZflow, se estiverem na página.
(function ocultarOriginaisAzflow() {
    const style = document.createElement('style');
    style.id = 'superproc-aud-valor-oculta-azflow';
    style.textContent = '#azflow-valor-causa-info,#azflow-saldo-subconta-info,[data-azflow-audiencia-designada-wrap="true"]{display:none!important;}';
    (document.head || document.documentElement).appendChild(style);
})();

// ============================================================================
// FUNCIONALIDADE: EXIBIR VALOR DA CAUSA NO fldCapa
// ============================================================================

const valorCausaConfig = {exibir:false,preferencia:true,destaques:true,carregado:false};
let promessaConfigValorCausa = null;
// Limites em centavos: independentes por bloco, compartilhados entre as abas.
const AZFLOW_LIMITES_VALORES_KEY = 'azflowLimitesCoresValores';
const limitesCoresValores = { causa: 1000000, deposito: 1 };
function atualizarLimitesCoresValores(dados) {
    for (const chave of ['causa', 'deposito']) {
        const valor = dados?.[chave];
        limitesCoresValores[chave] = Number.isSafeInteger(valor) && valor >= 0 && valor <= 1e11 ? valor : (chave === 'causa' ? 1000000 : 1);
    }
}
function corDeposito(total) {
    return Math.round(total * 100) >= limitesCoresValores.deposito ? '#1e5f8e' : '#5a6572';
}
function repintarCoresValores() {
    for (const id of ['superproc-valor-causa-info', 'superproc-fixa-valor-causa']) {
        const badge = document.getElementById(id);
        if (badge) badge.style.background = calcularCorFundoValorCausa(badge.dataset.superprocValorRaw || badge.textContent);
    }
    const saldo = document.getElementById('superproc-saldo-subconta-info');
    if (saldo) {
        const numero = Number((saldo.dataset.superprocValorRaw || saldo.textContent).replace(/[^\d,-]/g, '').replace(',', '.'));
        saldo.style.background = corDeposito(numero);
    }
}
function centavosRetificacaoAzflow(texto) {
    const valor = String(texto || '').trim();
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(valor)) return null;
    const centavos = Number(valor.replace(/\D/g, ''));
    return Number.isSafeInteger(centavos) && centavos >= 0 ? centavos : null;
}
function selecionarValorAoFocarAzflow(campo) {
    let gesto = null;
    campo.addEventListener('pointerdown', evento => {
        gesto = {primeiro:document.activeElement !== campo, x:evento.clientX, y:evento.clientY};
    });
    campo.addEventListener('focus', () => {
        // Pelo mouse, aguardar o clique: selecionar agora prejudicaria o arrasto nativo.
        if (!gesto) campo.select();
    });
    campo.addEventListener('click', evento => {
        if (gesto?.primeiro && Math.hypot(evento.clientX - gesto.x, evento.clientY - gesto.y) < 4 &&
            campo.selectionStart === campo.selectionEnd) campo.select();
        gesto = null;
    });
    const limpar = () => {gesto = null;};
    campo.addEventListener('blur', limpar);
    campo.addEventListener('pointercancel', limpar);
}
function formatarCampoMonetarioAzflow(campo, maximo = 1e11) {
    const direita = campo.value.slice(campo.selectionStart ?? campo.value.length).replace(/\D/g, '').length;
    const centavos = Math.min(maximo, Number(campo.value.replace(/\D/g, '')) || 0);
    campo.value = (centavos / 100).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
    let posicao = campo.value.length, restantes = direita;
    while (posicao > 0 && restantes > 0) {
        posicao--;
        if (/\d/.test(campo.value[posicao])) restantes--;
    }
    campo.setSelectionRange(posicao, posicao);
}
async function retificarValorCausaAzflow(valor, progresso) {
    if (tutelaAzflowSalvando) throw new Error('Aguarde a alteração em andamento');
    tutelaAzflowSalvando = true;
    try {
        await salvarCampoInformacoesTarjaAzflow(['Valor da causa', valor], 'txtValorCausa', undefined, progresso);
        try { window.azTelemetry?.track('feature.usada', { feature: 'capa.valor_causa_alterar', origem: 'menu' }); } catch (_) {}
        const tabela = document.getElementById('tblCopiarExcel');
        const linha = Array.from(tabela?.rows || []).find(row => row.cells[0]?.textContent.trim().toLocaleLowerCase('pt-BR') === 'valor da causa');
        if (linha?.cells[1]) linha.cells[1].textContent = valor;
        await processarValorDaCausa();
    } finally {tutelaAzflowSalvando = false;}
}
let menuLimitesValores = null;
function fecharMenuLimitesValores(restaurarFoco = true) {
    const menu = menuLimitesValores;
    if (!menu || menu.dataset.salvando === 'true') return;
    menuLimitesValores = null;
    inicioArrastoCampoValores = null;
    menu._azflowLimparRolagem?.();
    menu.ancora.setAttribute('aria-expanded', 'false');
    if (menu.matches(':popover-open')) menu.hidePopover();
    menu.remove();
    if (restaurarFoco && menu.ancora.isConnected) menu.ancora.focus({preventScroll:true});
}
function abrirMenuLimitesValores(ancora, tipo) {
    if (menuLimitesValores?.dataset.salvando === 'true') return;
    if (menuLimitesValores?.ancora === ancora) {fecharMenuLimitesValores();return;}
    fecharMenuLimitesValores(false);
    if (!document.getElementById('superproc-limites-valores-style')) {
        const style = document.createElement('style');
        style.id = 'superproc-limites-valores-style';
        style.textContent = `
        #superproc-limites-valores{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:348px;max-width:calc(100vw - 16px);padding:16px;background:#fff;border:1px solid #cfd4dd;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.12);color:#1f2937;font:400 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;z-index:2147483647;}
        #superproc-limites-valores, #superproc-limites-valores input{font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1;}
        #superproc-limites-valores .az-lv-sec{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;font-size:10px;font-weight:500;letter-spacing:.07em;text-transform:uppercase;color:#8b949e;}
        #superproc-limites-valores input[type=range]{display:block;appearance:none;width:100%;height:8px;border:0;border-radius:99px;margin:8px 0 14px;padding:0;cursor:ew-resize;touch-action:none;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06);}
        #superproc-limites-valores input[type=range]::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border:2px solid #fff;border-radius:50%;background:var(--az-lv-cor);box-shadow:0 1px 4px rgba(15,23,42,.28);}
        #superproc-limites-valores input:focus-visible,#superproc-limites-valores button:focus-visible{outline:2px solid #9985c0;outline-offset:3px;}
        #superproc-limites-valores .az-lv-legendas{display:flex;justify-content:space-between;gap:12px;font-size:10px;font-weight:500;font-variant-numeric:tabular-nums;}
        #superproc-limites-valores label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;color:#64748b;font-size:12px;}
        #superproc-limites-valores input[type=text]{box-sizing:border-box;width:150px;padding:5px 8px;border:1px solid #cfd4dd;border-radius:6px;background:#fff;color:#475569;font:inherit;text-align:right;}
        #superproc-limites-valores button{display:block;width:max-content;margin:14px auto 0;padding:0;border:0;background:none;color:#9aa3ad;font:500 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;}
        #superproc-limites-valores button:hover{color:#4b5563;}
        #superproc-limites-valores .az-lv-copiar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;height:24px;margin:0;padding:3px;border-radius:5px;color:#8b949e;letter-spacing:0;}
        #superproc-limites-valores .az-lv-copiar:hover{background:#f1edf7;color:#67517e;}
        #superproc-limites-valores .az-lv-copiar[data-copiado="true"]{color:#237a45;}
        #superproc-limites-valores .az-lv-retificacao{margin-top:16px;padding-top:14px;border-top:1px solid #e2e6ec;}
        #superproc-limites-valores .az-lv-retificacao .az-lv-sec{margin-bottom:8px;}
        #superproc-limites-valores .az-lv-retificacao label{margin-top:0;}
        #superproc-limites-valores .az-lv-retificar{font-size:12px;padding:7px 14px;border:1px solid #cfd4dd;border-radius:6px;background:#f8fafc;color:#64748b;position:relative;isolation:isolate;overflow:hidden;}
        #superproc-limites-valores .az-lv-retificar:hover:not(:disabled){background:#f1edf7;border-color:#b9adca;color:#67517e;}
        #superproc-limites-valores .az-lv-retificar:disabled{opacity:.45;cursor:default;}
        #superproc-limites-valores .az-lv-retificar[data-salvando="true"]{opacity:1;cursor:wait;}
        #superproc-limites-valores .az-lv-retificar[data-salvando="true"]::before{content:"";position:absolute;inset:0;z-index:-1;background:#cce8d5;transform-origin:left;transform:scaleX(var(--az-progresso,0));transition:transform .2s ease;}
        #superproc-limites-valores .az-lv-sucesso-pulso{position:absolute;inset:0;border-radius:inherit;background:#54b878;pointer-events:none;opacity:0;animation:az-lv-sucesso .75s ease-in-out both;}
        @keyframes az-lv-sucesso{0%,100%{opacity:0;}35%{opacity:.22;}}
        @media(prefers-reduced-motion:reduce){#superproc-limites-valores .az-lv-sucesso-pulso{animation-duration:.2s;}#superproc-limites-valores .az-lv-retificar::before{transition:none;}}
        #superproc-limites-valores .az-lv-resultado{margin-top:8px;text-align:center;font-size:11px;color:#a04343;}
        #superproc-limites-valores .az-lv-resultado:empty{display:none;}
        #superproc-limites-valores .az-lv-copia-check{display:none;}
        #superproc-limites-valores .az-lv-copiar[data-copiado="true"] .az-lv-copia-frente{fill:currentColor;}
        #superproc-limites-valores .az-lv-copiar[data-copiado="true"] .az-lv-copia-check{display:block;}


        #superproc-valor-causa-info,#superproc-saldo-subconta-info{cursor:pointer;}
        `;
        document.head.append(style);
    }
    const menu = document.createElement('div');
    menu.id = 'superproc-limites-valores';
    menu.setAttribute('popover', 'manual');
    menu.ancora = ancora;
    ancora.setAttribute('aria-expanded', 'true');
    ancora.setAttribute('aria-haspopup', 'dialog');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', tipo === 'causa' ? 'Cores do valor da causa' : 'Cores do depósito em juízo');
    const secao = document.createElement('div');
    secao.className = 'az-lv-sec';
    secao.textContent = menu.getAttribute('aria-label');
    const copiar = document.createElement('button');copiar.type = 'button';copiar.className = 'az-lv-copiar';
    copiar.title = 'Copiar valor';copiar.setAttribute('aria-label','Copiar valor');
    copiar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/><rect class="az-lv-copia-frente" x="8" y="8" width="12" height="13" rx="2"/><path class="az-lv-copia-check" d="m10.5 14.5 2.5 2.5 4.5-5" stroke="white" stroke-width="2"/></svg>';
    copiar.addEventListener('click', async () => {
        if (copiar.disabled) return;
        copiar.disabled = true;
        try {
            const texto = ancora.dataset.superprocValorRaw || ancora.textContent.trim();
            await navigator.clipboard.writeText(texto);
            copiar.dataset.copiado = 'true';copiar.title = 'Valor copiado!';copiar.setAttribute('aria-label','Valor copiado!');
        } catch (_) {copiar.title = 'Não foi possível copiar';copiar.setAttribute('aria-label','Não foi possível copiar');}
        finally {copiar.disabled = false;}
    });
    secao.append(copiar);

    const faixa = document.createElement('input');
    faixa.type = 'range';faixa.min = '0';faixa.max = '1000';faixa.step = '1';
    faixa.setAttribute('aria-label', 'Limite de valor entre as cores');
    const legendas = document.createElement('div');legendas.className = 'az-lv-legendas';
    const menor = document.createElement('span'), maior = document.createElement('span');
    legendas.append(menor, maior);
    const label = document.createElement('label');label.textContent = 'A partir de R$';
    const preciso = document.createElement('input');preciso.type = 'text';preciso.inputMode = 'numeric';preciso.autocomplete = 'off';preciso.setAttribute('aria-label', 'Limite em reais');selecionarValorAoFocarAzflow(preciso);label.append(preciso);
    const reset = document.createElement('button');reset.type = 'button';reset.textContent = 'Redefinir';
    const cores = tipo === 'causa' ? ['#9e2a1b', '#1b6b3a'] : ['#5a6572', '#1e5f8e'];
    const moeda = centavos => (centavos / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
    const formatarNumero = centavos => (centavos / 100).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
    function pintar() {
        const valor = limitesCoresValores[tipo], pct = Math.log10(1 + valor / 100) / Math.log10(1 + 1e9) * 100;
        faixa.value = String(Math.round(pct * 10));
        faixa.style.background = `linear-gradient(to right,${cores[0]} 0%,${cores[0]} ${pct}%,${cores[1]} ${pct}%,${cores[1]} 100%)`;
        faixa.style.setProperty('--az-lv-cor', cores[1]);
        faixa.setAttribute('aria-valuetext', moeda(valor));
        menor.textContent = valor === 0 ? 'Sem faixa inferior' : 'Até ' + moeda(valor - 1);menor.style.color = cores[0];
        maior.textContent = moeda(valor) + '+';maior.style.color = cores[1];
        preciso.value = formatarNumero(valor);
    }
    function salvar() {
        if (window.chrome?.storage?.local) chrome.storage.local.set({[AZFLOW_LIMITES_VALORES_KEY]: {...limitesCoresValores}});
    }
    faixa.addEventListener('input', () => {
        limitesCoresValores[tipo] = Math.round(10 ** (Number(faixa.value) / 1000 * Math.log10(1 + 1e9)) - 1) * 100;
        pintar();repintarCoresValores();
    });
    faixa.addEventListener('change', salvar);
    faixa.addEventListener('keydown', ev => {
        const direcao = {ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1}[ev.key];
        if (!direcao) return;
        ev.preventDefault();
        const reais = limitesCoresValores[tipo] / 100;
        limitesCoresValores[tipo] = Math.max(0, Math.min(1e9, direcao > 0 ? Math.floor(reais) + 1 : Math.ceil(reais) - 1)) * 100;
        pintar();repintarCoresValores();salvar();
    });
    preciso.addEventListener('input', () => formatarCampoMonetarioAzflow(preciso));
    preciso.addEventListener('change', () => {
        const centavos = Number(preciso.value.replace(/\D/g, ''));
        if (!Number.isSafeInteger(centavos) || centavos < 0 || centavos > 1e11) {pintar();return;}
        limitesCoresValores[tipo] = centavos;
        pintar();repintarCoresValores();salvar();
    });
    reset.addEventListener('click', () => {
        limitesCoresValores[tipo] = tipo === 'causa' ? 1000000 : 1;
        pintar();repintarCoresValores();salvar();
    });
    menu.addEventListener('keydown', ev => ev.stopPropagation());
    menu.append(secao, faixa, legendas, label, reset);
    // Retificar grava nas Informações Adicionais: só com o "Editar" na página.
    if (tipo === 'causa' && podeEditarInformacoesAzflow()) {
        const retificacao = document.createElement('div');retificacao.className = 'az-lv-retificacao';
        const titulo = document.createElement('div');titulo.className = 'az-lv-sec';titulo.textContent = 'Retificar valor da causa';
        const linha = document.createElement('label');linha.textContent = 'Novo valor R$';
        const campo = document.createElement('input');campo.type = 'text';campo.inputMode = 'numeric';campo.autocomplete = 'off';campo.setAttribute('aria-label','Novo valor da causa');selecionarValorAoFocarAzflow(campo);
        campo.value = (ancora.dataset.superprocValorRaw || ancora.textContent).replace(/^R\$\s*/, '').trim();
        let valorReferencia = centavosRetificacaoAzflow(campo.value);
        const aplicar = document.createElement('button');aplicar.type = 'button';aplicar.className = 'az-lv-retificar';aplicar.textContent = 'Retificar';
        const mensagem = document.createElement('div');mensagem.className = 'az-lv-resultado';mensagem.setAttribute('role','status');
        function atualizarRetificar() {
            const novoValor = centavosRetificacaoAzflow(campo.value);
            aplicar.disabled = menu.dataset.salvando === 'true' || novoValor === null || novoValor === valorReferencia;
        }
        campo.addEventListener('input', () => {
            formatarCampoMonetarioAzflow(campo, Number.MAX_SAFE_INTEGER);
            atualizarRetificar();
        });
        atualizarRetificar();
        aplicar.addEventListener('click', async () => {
            if (menu.dataset.salvando === 'true' || aplicar.disabled) return;
            const centavos = centavosRetificacaoAzflow(campo.value);
            if (centavos === valorReferencia) {atualizarRetificar();return;}
            if (centavos === null) {mensagem.textContent = 'Informe um valor válido';return;}
            const valor = (centavos / 100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
            menu.dataset.salvando = 'true';menu.setAttribute('aria-busy','true');aplicar.disabled = true;aplicar.textContent = 'Salvando…';aplicar.dataset.salvando = 'true';aplicar.style.setProperty('--az-progresso','0');mensagem.textContent = '';
            const bloqueio = new AbortController();
            const bloquear = evento => {evento.preventDefault();evento.stopImmediatePropagation();};
            for (const tipoEvento of ['pointerdown','pointerup','click','contextmenu','keydown','keyup','wheel']) window.addEventListener(tipoEvento,bloquear,{capture:true,passive:false,signal:bloqueio.signal});
            try {
                await retificarValorCausaAzflow(valor, etapa => aplicar.style.setProperty('--az-progresso',String(etapa / 100)));
                menu.querySelector('.az-lv-sucesso-pulso')?.remove();
                const pulso = document.createElement('div');pulso.className = 'az-lv-sucesso-pulso';pulso.setAttribute('aria-hidden','true');
                pulso.addEventListener('animationend', () => pulso.remove(), {once:true});menu.append(pulso);
                campo.value = valor;valorReferencia = centavos;
            } catch (erro) {
                const texto = String(erro?.message || '');
                mensagem.textContent = /failed to fetch|networkerror|network request failed|load failed/i.test(texto) ? 'Erro de conexão!' : texto || 'Não foi possível retificar o valor';
            } finally {
                bloqueio.abort();menu.dataset.salvando = 'false';menu.setAttribute('aria-busy','false');aplicar.textContent = 'Retificar';delete aplicar.dataset.salvando;aplicar.style.removeProperty('--az-progresso');atualizarRetificar();
            }
        });
        linha.append(campo);retificacao.append(titulo,linha,aplicar,mensagem);menu.append(retificacao);
    }

    document.body.append(menu);menuLimitesValores = menu;
    pintar();menu.showPopover();
    const rect = ancora.getBoundingClientRect(), altura = menu.getBoundingClientRect().height;
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - altura - 8)) + 'px';
    faixa.focus({preventScroll:true});
    const fecharAoRolar = () => fecharMenuLimitesValores(false);
    window.addEventListener('scroll', fecharAoRolar, {capture:true,passive:true});
    window.addEventListener('wheel', fecharAoRolar, {passive:true});
    menu._azflowLimparRolagem = () => {
        window.removeEventListener('scroll', fecharAoRolar, true);
        window.removeEventListener('wheel', fecharAoRolar);
    };
}
// Um arrasto iniciado no campo monetário não conta como clique fora do seletor.
let inicioArrastoCampoValores = null;
document.addEventListener('pointerdown', ev => {
    inicioArrastoCampoValores = ev.button === 0 && menuLimitesValores &&
        ev.target.matches?.('#superproc-limites-valores input[type=text]') ? menuLimitesValores : null;
}, true);
document.addEventListener('pointercancel', () => {inicioArrastoCampoValores = null;}, true);
document.addEventListener('click', ev => {
    const iniciadoNoCampo = inicioArrastoCampoValores === menuLimitesValores && menuLimitesValores !== null;
    inicioArrastoCampoValores = null;
    if (iniciadoNoCampo && !menuLimitesValores.contains(ev.target)) return;
    const bloco = ev.target.closest?.('#superproc-valor-causa-info, #superproc-saldo-subconta-info');
    if (!bloco) {
        if (menuLimitesValores && !menuLimitesValores.contains(ev.target)) fecharMenuLimitesValores(false);
        return;
    }
    ev.preventDefault();ev.stopPropagation();
    abrirMenuLimitesValores(bloco, bloco.id === 'superproc-valor-causa-info' ? 'causa' : 'deposito');
});
// O foco percorre apenas os controles do seletor; Escape fecha e devolve o foco.
document.addEventListener('keydown', ev => {
    const menu = menuLimitesValores;
    if (!menu) return;
    if (ev.key === 'Escape') {
        ev.stopPropagation();ev.preventDefault();fecharMenuLimitesValores();return;
    }
    if (ev.key !== 'Tab') return;
    ev.stopPropagation();ev.preventDefault();
    const controles = Array.from(menu.querySelectorAll('input:not(:disabled), button:not(:disabled)'));
    const atual = controles.indexOf(document.activeElement);
    const proximo = atual < 0 ? (ev.shiftKey ? controles.length - 1 : 0) : (atual + (ev.shiftKey ? -1 : 1) + controles.length) % controles.length;
    controles[proximo]?.focus({preventScroll:true});
}, true);
document.addEventListener('keydown', ev => {
    if (!['Enter', ' '].includes(ev.key) || !ev.target.matches?.('#superproc-valor-causa-info, #superproc-saldo-subconta-info')) return;
    ev.preventDefault();ev.target.click();
});
if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[AZFLOW_LIMITES_VALORES_KEY]) return;
    const anteriores = {...limitesCoresValores};
    atualizarLimitesCoresValores(changes[AZFLOW_LIMITES_VALORES_KEY].newValue);
    if (anteriores.causa === limitesCoresValores.causa && anteriores.deposito === limitesCoresValores.deposito) return;
    repintarCoresValores();
    fecharMenuLimitesValores();
});

function atualizarConfigValorCausa(ligado) {
    valorCausaConfig.preferencia = Boolean(ligado);
    valorCausaConfig.exibir = Boolean(ligado) && valorCausaConfig.destaques;
    valorCausaConfig.carregado = true;
}
function carregarConfiguracaoValorCausa() {
    if (valorCausaConfig.carregado) return Promise.resolve(valorCausaConfig.exibir);
    if (promessaConfigValorCausa) return promessaConfigValorCausa;
    promessaConfigValorCausa = new Promise(resolve => {
        try {
            if (!verificarContextoExtensaoValido()) { atualizarConfigValorCausa(false);resolve(false);return; }
            chrome.storage.local.get(['azflowValorCausaExibir','azflowCardDestaquesStatus',AZFLOW_LIMITES_VALORES_KEY],result => {
                atualizarLimitesCoresValores(result[AZFLOW_LIMITES_VALORES_KEY]);
                if (!valorCausaConfig.carregado) {
                    valorCausaConfig.destaques = result.azflowCardDestaquesStatus !== 'off';
                    atualizarConfigValorCausa(!chrome.runtime.lastError && result.azflowValorCausaExibir !== 'off');
                }
                resolve(valorCausaConfig.exibir);
            });
        } catch (_) { atualizarConfigValorCausa(false);resolve(false); }
    });
    return promessaConfigValorCausa;
}
// A tabela nativa de cópia é a fonte: a estrutura varia entre instalações do eproc.
// Não abre painéis nem faz consulta para descobrir o valor.
function formatarValorCausaNativo(valor) {
    const raw = String(valor || '').replace(/\u00a0/g,' ').trim().replace(/^R\$\s*/i,'');
    if (!raw || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{2})?$/.test(raw)) return null;
    const [inteiro, centavos = '00'] = raw.replace(/\./g, '').split(',');
    const agrupado = inteiro.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'R$ ' + agrupado + ',' + centavos;
}
function obterValorCausaDiretoDoDom() {
    const table = document.getElementById('tblCopiarExcel');
    if (!table) return obterValorCausaInformacoesAdicionais();
    for (const row of table.rows) {
        const rotulo = row.cells[0];
        const nome = rotulo?.textContent.trim().replace(/\s+/g,' ').replace(/:$/,'').toLocaleLowerCase('pt-BR');
        if (nome !== 'valor da causa') continue;
        return formatarValorCausaNativo(row.cells[1]?.textContent);
    }
    return obterValorCausaInformacoesAdicionais();
}
// Fonte alternativa (diferença deliberada, item 5 do cabeçalho): em páginas sem #tblCopiarExcel, a linha
// "Valor da Causa:" de Informações Adicionais (#fldInformacoesAdicionais) traz o mesmo valor.
function obterValorCausaInformacoesAdicionais() {
    const raiz = document.getElementById('fldInformacoesAdicionais');
    if (!raiz) return null;
    for (const rotulo of raiz.querySelectorAll('span.text-right')) {
        const nome = rotulo.textContent.trim().replace(/\s+/g,' ').replace(/:$/,'').toLocaleLowerCase('pt-BR');
        if (nome !== 'valor da causa') continue;
        const valor = rotulo.nextElementSibling?.textContent.match(/R\$\s*[\d.]+(?:,\d{2})?/);
        return valor ? formatarValorCausaNativo(valor[0]) : null;
    }
    return null;
}
// This visibility check remains only for the independent subaccount-balance request.
function estaAbaAtiva() { return !document.hidden; }
function cancelarSaldoSubcontasPendente() {
    const saldoControle = obterControleSaldoSubcontas();
    if (saldoControle.timer) {clearTimeout(saldoControle.timer);saldoControle.timer = null;}
    saldoControle.abortController?.abort();
    saldoControle.abortController = null;
    saldoControle.promessa = null;
}
function aplicarEstadoValorCausaAposToggle(ligado) {
    atualizarConfigValorCausa(ligado);
    if (!valorCausaConfig.exibir) { cancelarSaldoSubcontasPendente();removerValorCausaDoFldCapa(); }
    else {
        const saldoControle = obterControleSaldoSubcontas();
        saldoControle.processado = false;saldoControle.cache = null;
        void processarValorDaCausa();
    }
    if (typeof atualizarDivFixaInformacoes === 'function') atualizarDivFixaInformacoes(true);
}

// Função auxiliar para calcular a cor de fundo baseada no valor da causa
function calcularCorFundoValorCausa(valorDaCausa) {
    const valorNumerico = parseFloat(valorDaCausa.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
    return Math.round(valorNumerico * 100) >= limitesCoresValores.causa ? '#1b6b3a' : '#9e2a1b';
}

const AZFLOW_BADGE_RADIUS_PADRAO = '6px';

function injetarEstilosValorCausa() {
    if (document.getElementById('superproc-valor-causa-styles')) return;
    const style = document.createElement('style');
    style.id = 'superproc-valor-causa-styles';
    document.head.appendChild(style);
    style.textContent = `
        #superproc-valor-causa-info, #superproc-saldo-subconta-info { cursor: pointer; }
        #superproc-valor-causa-info, #superproc-valor-causa-info *, #superproc-fixa-valor-causa, #superproc-fixa-valor-causa * { user-select:none!important;-webkit-user-select:none!important; }
        .superproc-valor-badge[role="button"]:focus-visible { outline: 2px solid #9985c0; outline-offset: 2px; }
        .superproc-valor-badge {
            position: relative;
            display: inline-flex;
            flex-direction: row;
            flex-wrap: nowrap;
            align-items: baseline;
            gap: 2px;
            white-space: nowrap;
            font-size: 17px;
            font-weight: 700;
            color: #fff;
            border-radius: ${AZFLOW_BADGE_RADIUS_PADRAO};
            padding: 4px 10px;
            letter-spacing: 0.01em;
            cursor: default;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 3px rgba(0,0,0,0.22);
            vertical-align: middle;
        }
        .superproc-valor-badge .superproc-rs {
            opacity: 0.48;
            font-size: 0.76em;
            font-weight: 500;
            flex-shrink: 0;
            white-space: nowrap;
            letter-spacing: 0;
        }

    `;
}

function aplicarLayoutBadgeInline(span) {
    if (!span) return;
    span.style.setProperty('display', 'inline-flex', 'important');
    span.style.setProperty('flex-direction', 'row', 'important');
    span.style.setProperty('flex-wrap', 'nowrap', 'important');
    span.style.setProperty('align-items', 'baseline', 'important');
    span.style.setProperty('white-space', 'nowrap', 'important');
    span.style.setProperty('font-size', '17px', 'important');
    span.style.setProperty('font-weight', '700', 'important');
}

function preencherConteudoBadge(span, valorCompleto) {
    if (span.dataset.superprocValorRaw === valorCompleto && span.childNodes.length) return;
    span.dataset.superprocValorRaw = valorCompleto;
    span.innerHTML = '';
    aplicarLayoutBadgeInline(span);
    const match = valorCompleto.match(/^(R\$)\s*(.+)$/);
    if (match) {
        const rsSpan = document.createElement('span');
        rsSpan.className = 'superproc-rs';
        rsSpan.style.setProperty('white-space', 'nowrap', 'important');
        rsSpan.style.setProperty('display', 'inline', 'important');
        rsSpan.textContent = match[1] + '\u00A0';
        span.appendChild(rsSpan);
        span.appendChild(document.createTextNode(match[2]));
    } else {
        span.textContent = valorCompleto;
    }
}

const AZFLOW_SALDO_SUBCONTAS_LINK_SELECTOR = 'a[href*="md_dof_sidejud_subcontas_listar"]';

function obterControleSaldoSubcontas() {
    if (!window.superprocSaldoSubcontasControle) {
        window.superprocSaldoSubcontasControle = {
            contexto: null,
            promessa: null,
            processado: false,
            cache: null,
            timer: null,
            abortController: null
        };
    }
    return window.superprocSaldoSubcontasControle;
}

function resetarSaldoSubcontasSeContextoMudou() {
    const controle = obterControleSaldoSubcontas();
    const contextoAtual = location.href + '::' + (document.getElementById('txtNumProcesso')?.textContent || '').trim();
    if (controle.contexto === contextoAtual) {
        return controle;
    }
    if (controle.timer) {
        clearTimeout(controle.timer);
    }
    if (controle.abortController) {
        try { controle.abortController.abort(); } catch (_) {}
    }
    controle.contexto = contextoAtual;
    controle.promessa = null;
    controle.processado = false;
    controle.cache = null;
    controle.timer = null;
    controle.abortController = null;
    return controle;
}

function formatarSaldoSubcontas(valor) {
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
    } catch (_) {
        return 'R$ ' + (Number(valor) || 0).toFixed(2).replace('.', ',');
    }
}

function extrairTotalSaldoSubcontas(doc) {
    if (!doc) return null;
    try {
        const alertInfo = doc.querySelector('.alert-info');
        if (alertInfo && alertInfo.textContent.toLowerCase().includes('não existem subcontas')) {
            return 0;
        }

        const tabelas = Array.from(doc.querySelectorAll('table'));
        const tabelaSaldo = tabelas.find((table) => {
            const primeiraLinha = table.rows && table.rows.length ? table.rows[0].textContent.toLowerCase() : '';
            return primeiraLinha.includes('saldo') && primeiraLinha.includes('titular');
        });
        if (!tabelaSaldo) return 0;

        let total = 0;
        let encontrouSaldo = false;
        const regexMoeda = /^R\$\s*-?\d{1,3}(\.\d{3})*,\d{2}$/;
        for (let i = 1; i < tabelaSaldo.rows.length; i++) {
            const cells = Array.from(tabelaSaldo.rows[i].cells || []);
            for (const cell of cells) {
                const texto = cell.textContent.trim();
                if (!regexMoeda.test(texto)) continue;
                const match = texto.match(/R\$\s*(-?[\d.,]+)/);
                if (!match) continue;
                const valor = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                if (Number.isNaN(valor)) continue;
                total += valor;
                encontrouSaldo = true;
                break;
            }
        }

        return encontrouSaldo ? total : 0;
    } catch (_) {
        return null;
    }
}

function inserirSaldoSubcontasBadge(total) {
    if (!valorCausaConfig.exibir || !verificarCompetenciaExecucaoFiscal()) return;
    const valorCausaInfo = document.getElementById('superproc-valor-causa-info');
    if (!valorCausaInfo || typeof total !== 'number' || Number.isNaN(total)) return;

    injetarEstilosValorCausa();

    let saldoSpan = document.getElementById('superproc-saldo-subconta-info');
    if (!saldoSpan) {
        saldoSpan = document.createElement('span');
        saldoSpan.id = 'superproc-saldo-subconta-info';
        saldoSpan.setAttribute('tabindex', '0');
        saldoSpan.setAttribute('role', 'button');
        valorCausaInfo.insertAdjacentElement('afterend', saldoSpan);
    }

    const corFundoSaldo = corDeposito(total);
    preencherConteudoBadge(saldoSpan, formatarSaldoSubcontas(total));
    saldoSpan.className = 'superproc-valor-badge';
    saldoSpan.style.background = corFundoSaldo;
    // Label visual desativado; usar title nativo.
    saldoSpan.title = 'Valor depositado em juízo';
}

function removerSaldoSubcontasBadge() {
    const saldoSpan = document.getElementById('superproc-saldo-subconta-info');
    if (saldoSpan) {
        saldoSpan.remove();
    }
}

async function buscarSaldoSubcontasLeve() {
    if (!valorCausaConfig.exibir || !verificarCompetenciaExecucaoFiscal()) return null;
    if (!estaAbaAtiva()) return null;

    const controle = resetarSaldoSubcontasSeContextoMudou();
    if (controle.processado) return controle.cache;
    if (controle.promessa) return controle.promessa;

    const valorCausaInfo = document.getElementById('superproc-valor-causa-info');
    const extratoBtn = document.querySelector(AZFLOW_SALDO_SUBCONTAS_LINK_SELECTOR);
    if (!valorCausaInfo || !extratoBtn || !extratoBtn.href) {
        controle.processado = true;
        controle.cache = null;
        return null;
    }

    controle.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const controladorAtual = controle.abortController;
    const sinal = controladorAtual ? controladorAtual.signal : undefined;

    controle.promessa = fetch(extratoBtn.href, {
        method: 'GET',
        credentials: 'same-origin',
        signal: sinal
    })
        .then((res) => res.ok ? res.text() : null)
        .then((html) => {
            if (!html || sinal?.aborted) return null;
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return extrairTotalSaldoSubcontas(doc);
        })
        .then((total) => {
            if (sinal?.aborted) return null;
            if (typeof total === 'number' && !Number.isNaN(total)) {
                controle.cache = total;
                inserirSaldoSubcontasBadge(total);
            }
            controle.processado = true;
            return controle.cache;
        })
        .catch(() => {
            if (sinal?.aborted) return null;
            controle.processado = true;
            return null;
        })
        .finally(() => {
            if (controle.abortController === controladorAtual) {
                controle.abortController = null;
                controle.promessa = null;
            }
        });

    return controle.promessa;
}

function agendarSaldoSubcontasLeve() {
    if (!valorCausaConfig.exibir || !verificarCompetenciaExecucaoFiscal()) return;
    if (!estaAbaAtiva()) return;
    if (!document.getElementById('superproc-valor-causa-info')) return;
    if (!document.querySelector(AZFLOW_SALDO_SUBCONTAS_LINK_SELECTOR)) return;

    const controle = resetarSaldoSubcontasSeContextoMudou();
    if (controle.processado && typeof controle.cache === 'number') {
        inserirSaldoSubcontasBadge(controle.cache);
        return;
    }
    if (controle.processado || controle.promessa || controle.timer) return;

    controle.timer = setTimeout(() => {
        controle.timer = null;
        buscarSaldoSubcontasLeve();
    }, 250);
}

window.addEventListener('focus',agendarSaldoSubcontasLeve);
document.addEventListener('visibilitychange',() => { if (!document.hidden) agendarSaldoSubcontasLeve(); });

// Função para verificar se a competência contém "- Execução Fiscal" ou "Execução Fiscal -"
function verificarCompetenciaExecucaoFiscal() {
    try {
        // Verifica no span padrão
        const span = document.querySelector('#txtCompetencia');
        if (span && span.textContent) {
            const texto = span.textContent.trim();
            if (texto.includes('- Execução Fiscal') || texto.includes('Execução Fiscal -') || texto.includes('Fiscal e Tributária')) {
                return true;
            }
        }
        
        // Verifica no select de seleção
        const optSel = document.querySelector('#divSelecionarCompetencia #selSelecionarCompetencia option:checked');
        if (optSel && optSel.textContent) {
            const texto = optSel.textContent.trim();
            if (texto.includes('- Execução Fiscal') || texto.includes('Execução Fiscal -') || texto.includes('Fiscal e Tributária')) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// Função auxiliar para verificar se o contexto da extensão ainda é válido
function verificarContextoExtensaoValido() {
    try {
        // Verifica se chrome existe e se runtime está disponível
        if (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined') {
            return false;
        }
        
        // Tenta acessar chrome.runtime.id para verificar se o contexto ainda é válido
        // Se o contexto foi invalidado, isso vai lançar uma exceção
        const runtimeId = chrome.runtime.id;
        return typeof runtimeId === 'string' && runtimeId.length > 0;
    } catch (e) {
        // Contexto invalidado - qualquer acesso ao chrome.runtime lança exceção
        return false;
    }
}

// Função real de inserção (separada para reutilizar quando slider for ligado)
function inserirValorCausaNoFldCapaReal(valorDaCausa) {
    try {
        const fldCapa = document.getElementById('fldCapa');
        if (!fldCapa) {
            return;
        }
        
        // Verifica se já existe o elemento (evita duplicação)
        let elementoExistente = document.getElementById('superproc-valor-causa-container');
        
        if (elementoExistente) {
            const valorSpan = elementoExistente.querySelector('#superproc-valor-causa-info');
            if (valorSpan) {
                if (String(valorSpan.dataset.superprocValorRaw || valorSpan.textContent).trim() === valorDaCausa) return;
                const corFundoValor = calcularCorFundoValorCausa(valorDaCausa);
                preencherConteudoBadge(valorSpan, valorDaCausa);
                valorSpan.style.background = corFundoValor;
                aplicarLayoutBadgeInline(valorSpan);
                // Label visual desativado; usar title nativo.
                valorSpan.title = 'Valor da causa';
            }
            agendarSaldoSubcontasLeve();
            return;
        }
        
       
        // Encontra o elemento que contém "Juiz(a):"
        let elementoJuiz = null;
        const labels = fldCapa.querySelectorAll('label');
        
        for (const label of labels) {
            if (label.textContent.trim() === 'Juiz(a):') {
                // Pega o elemento col-auto que contém o label
                elementoJuiz = label.closest('div.col-auto, div[class*="col"]');
                break;
            }
        }
        
        if (!elementoJuiz && !localizarAncoraSuperproc()) {
            return;
        }
        
        injetarEstilosValorCausa();

        // Cria um novo elemento seguindo a mesma estrutura
        const divValorCausa = document.createElement('div');
        divValorCausa.id = 'superproc-valor-causa-container';
        
        if (!elementoJuiz) {
            divValorCausa.className = 'col-auto mr-2';
        } else if (elementoJuiz.className) {
            // Classes de ocultação do SuperPROC pertencem ao campo de origem,
            // não ao destaque criado pelo AZflow.
            divValorCausa.className = Array.from(elementoJuiz.classList)
                .filter(nome => nome !== 'superproc-min-campo-oculto')
                .join(' ');
        }
        
        // Badges lado a lado, ancorados ao topo da linha da capa, independentemente dos botões.
        divValorCausa.style.cssText = `
            display: inline-flex !important;
            flex-direction: row;
            flex-wrap: nowrap;
            align-items: flex-start;
            gap: 8px;
            align-self: flex-start;
            vertical-align: top;
        `;
        
        const valorSpan = document.createElement('span');
        valorSpan.id = 'superproc-valor-causa-info';
        valorSpan.setAttribute('tabindex', '0');
        valorSpan.setAttribute('role', 'button');
        valorSpan.className = 'superproc-valor-badge';
        valorSpan.setAttribute('aria-description', 'Valor da causa');
        
        const corFundoValor = calcularCorFundoValorCausa(valorDaCausa);
        preencherConteudoBadge(valorSpan, valorDaCausa);
        valorSpan.style.background = corFundoValor;
        aplicarLayoutBadgeInline(valorSpan);
        // Label visual desativado; usar title nativo.
        valorSpan.title = 'Valor da causa';
        
        divValorCausa.appendChild(valorSpan);
        
        // Insere após o elemento Juiz (à direita)
        const ancoraSuperproc = localizarAncoraSuperproc();
        if (ancoraSuperproc) {
            ancoraSuperproc.insertAdjacentElement('afterend', divValorCausa);
        } else if (elementoJuiz.parentNode && elementoJuiz.nextSibling) {
            elementoJuiz.parentNode.insertBefore(divValorCausa, elementoJuiz.nextSibling);
        } else if (elementoJuiz.parentNode) {
            elementoJuiz.parentNode.appendChild(divValorCausa);
        }
        agendarSaldoSubcontasLeve();
        
    } catch (error) {
        // Erro ao inserir valor da causa no fldCapa
    }
}

// Função para remover o elemento do valor da causa
function removerValorCausaDoFldCapa() {
    try {
        const elementoExistente = document.getElementById('superproc-valor-causa-container');
        if (elementoExistente) {
            elementoExistente.remove();
        }
        removerSaldoSubcontasBadge();
    } catch (error) {
        // Erro ao remover valor da causa
    }
}

// Função principal para processar e exibir valor da causa
// A synchronous DOM read after the one-time preference load; hidden tabs need no queue.
let ultimoValorCausaRenderizado = null;
async function processarValorDaCausa() {
    if (!valorCausaConfig.carregado) await carregarConfiguracaoValorCausa();
    const valor = valorCausaConfig.exibir ? obterValorCausaDiretoDoDom() : null;
    if (!verificarCompetenciaExecucaoFiscal()) {
        cancelarSaldoSubcontasPendente();
        removerSaldoSubcontasBadge();
    }
    const badge = document.getElementById('superproc-valor-causa-info');
    const mudou = valor !== ultimoValorCausaRenderizado;
    ultimoValorCausaRenderizado = valor;
    if (!valor) {
        if (badge) removerValorCausaDoFldCapa();
    } else if (!badge || String(badge.dataset.superprocValorRaw || badge.textContent).trim() !== valor) {
        inserirValorCausaNoFldCapaReal(valor);
    }
    if (mudou && typeof atualizarDivFixaInformacoes === 'function') atualizarDivFixaInformacoes(true);
    return valor;
}
let processamentoValorCausaAgendado = false;
function agendarValorCausaDoDom() {
    if (processamentoValorCausaAgendado) return;
    processamentoValorCausaAgendado = true;
    queueMicrotask(() => { processamentoValorCausaAgendado = false;void processarValorDaCausa(); });
}
const SELETOR_VALOR_CAUSA_ALVO = '#tblCopiarExcel,#txtCompetencia,#divSelecionarCompetencia,#fldCapa,#frmProcessoLista';
const SELETOR_VALOR_CAUSA_TABELAS = '#tblCopiarExcel,#txtCompetencia,#divSelecionarCompetencia';
const SELETOR_VALOR_CAUSA_PROPRIO = '#superproc-limites-valores,#superproc-valor-causa-container,#azflow-info-fixa-capa';
// Observa o documento inteiro: cada registro precisa de um descarte barato, sem alocar arrays.
function registroRelevanteValorCausa(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (!target) return false;
    if (target.closest(SELETOR_VALOR_CAUSA_PROPRIO)) return false;
    if (target.closest(SELETOR_VALOR_CAUSA_TABELAS)) return true;
    if (record.type !== 'childList') return false;
    const emFldCapa = !!target.closest('#fldCapa');
    for (const lista of [record.addedNodes, record.removedNodes]) {
        for (let i = 0; i < lista.length; i++) {
            const node = lista[i];
            if (node.nodeType !== 1 || node.id === 'superproc-valor-causa-container') continue;
            if (node.matches(SELETOR_VALOR_CAUSA_ALVO) || node.querySelector(SELETOR_VALOR_CAUSA_ALVO)) return true;
            // Native reconstruction of the judge's row may happen after the fieldset appears.
            if (emFldCapa && (node.matches('label') || node.querySelector('label'))) return true;
        }
    }
    return false;
}
// Observa só o que importa. Com a tabela do valor e o #fldCapa presentes, cada alvo é vigiado por dentro e seus
// ancestrais apenas por childList (sem subtree): trocar um alvo ou qualquer contêiner dele é detectado quase sem custo.
// Até esses dois existirem, vigia só por inserções (childList + subtree, sem characterData): o #frmProcessoLista, se já
// existir, ou o documento até ele aparecer.
const IDS_VALOR_CAUSA = ['tblCopiarExcel','txtCompetencia','divSelecionarCompetencia','fldCapa'];
let alvosObservadosValorCausa = [];
function conectarObserverValorCausa() {
    const alvos = IDS_VALOR_CAUSA.map(id => document.getElementById(id));
    const prontos = !!(alvos[0] && alvos[3]);
    if (prontos && alvos.every((alvo, i) => alvo === alvosObservadosValorCausa[i])) return;
    observerValorCausa.disconnect();
    alvosObservadosValorCausa = alvos;
    if (!prontos) {
        // Os alvos nascem dentro do form da página; antes dele existir, vigia o documento.
        observerValorCausa.observe(document.getElementById('frmProcessoLista') || document.documentElement,{childList:true,subtree:true});
        return;
    }
    const presentes = alvos.filter(Boolean);
    const ancestrais = new Set();
    for (const alvo of presentes) for (let no = alvo.parentElement; no; no = no.parentElement) ancestrais.add(no);
    for (const no of ancestrais) observerValorCausa.observe(no,{childList:true});
    // Por último, para que childList+subtree prevaleça se um alvo for ancestral de outro.
    for (const alvo of presentes) observerValorCausa.observe(alvo,{childList:true,subtree:true,characterData:true});
}
const observerValorCausa = new MutationObserver(records => {
    for (let i = 0; i < records.length; i++) {
        if (!registroRelevanteValorCausa(records[i])) continue;
        agendarValorCausaDoDom();
        conectarObserverValorCausa();
        return;
    }
});
conectarObserverValorCausa();
document.addEventListener('change',event => {
    if (event.target.matches?.('#selSelecionarCompetencia')) agendarValorCausaDoDom();
});
// Run now when possible, then once more after parsing to cover late native markup.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',agendarValorCausaDoDom,{once:true});
agendarValorCausaDoDom();

// --- Audiência Designada (subitem de Destaques na capa) ---
const AZFLOW_AUDIENCIA_DESIGNADA_KEY = 'azflowCardDestaquesAudienciaDesignada';
const AZFLOW_AUDIENCIA_WRAP_ATTR = 'data-superproc-audiencia-designada-wrap';
const AZFLOW_AUDIENCIA_TXT_ID = 'superprocTxtAudienciaDesignada';
const AZFLOW_AUDIENCIA_LAYOUT_WAIT_MS = 1200;

let azflowAudienciaDesignadaAgendado = false;
let azflowAudienciaDesignadaGeracao = 0;
let azflowAudienciaDesignadaInflight = null;
let azflowAudienciaDesignadaIdleHandle = null;
let azflowAudienciaLayoutObserver = null;
let azflowAudienciaLayoutTimer = null;
let azflowAudienciaReposicionaTimer = null;
let azflowAudienciaFetchAbort = null;
let azflowAudienciaUltimoResultado = null; // { url, audiencia, ts }
const AZFLOW_AUDIENCIA_COOLDOWN_MS = 15000;
let azflowAudienciaUltimaUrlTentada = ''; // URL já tentada passivamente nesta página; evita refetch por mutação alheia em #fldCapa

function azflowAudienciaLimparEsperaLayout() {
	if (azflowAudienciaLayoutObserver) {
		try { azflowAudienciaLayoutObserver.disconnect(); } catch (_) {}
		azflowAudienciaLayoutObserver = null;
	}
	if (azflowAudienciaLayoutTimer) {
		clearTimeout(azflowAudienciaLayoutTimer);
		azflowAudienciaLayoutTimer = null;
	}
}

function azflowAudienciaCancelarAgendamento() {
	azflowAudienciaDesignadaAgendado = false;
	if (azflowAudienciaDesignadaIdleHandle != null) {
		try {
			if (typeof cancelIdleCallback === 'function') cancelIdleCallback(azflowAudienciaDesignadaIdleHandle);
			else clearTimeout(azflowAudienciaDesignadaIdleHandle);
		} catch (_) {}
		azflowAudienciaDesignadaIdleHandle = null;
	}
	if (azflowAudienciaReposicionaTimer) {
		clearTimeout(azflowAudienciaReposicionaTimer);
		azflowAudienciaReposicionaTimer = null;
	}
	azflowAudienciaLimparEsperaLayout();
	if (azflowAudienciaFetchAbort) {
		try { azflowAudienciaFetchAbort.abort(); } catch (_) {}
		azflowAudienciaFetchAbort = null;
	}
	azflowAudienciaDesignadaInflight = null;
}

const AZFLOW_SELETOR_AUTOINJETADO =
	'[' + AZFLOW_AUDIENCIA_WRAP_ATTR + '], ' +
	'[data-superproc-aud-data], [data-superproc-aud-hora], ' +
	'[data-azflow-situacao-label], [data-azflow-situacao-dias], ' +
	'#azflow-botao-dosimetria, #azflow-botao-sorteio';

function azflowNoEhAutoinjetado(no) {
	if (!no) return false;
	if (no.nodeType === Node.TEXT_NODE) no = no.parentElement;
	if (!no || no.nodeType !== 1) return false;
	if (no.matches && no.matches(AZFLOW_SELETOR_AUTOINJETADO)) return true;
	return !!(no.closest && no.closest(AZFLOW_SELETOR_AUTOINJETADO));
}

/**
 * Uma mutação é considerada autoinduzida quando todos os nós afetados
 * (alvo, adicionados e removidos) pertencem a elementos que a própria
 * extensão injeta/reescreve na capa. Sem esse filtro, o MutationObserver
 * que vigia #fldCapa reage à própria escrita (ex.: textContent da pill de
 * audiência) e entra em loop, disparando refetch contínuo de audiencia_listar.
 */
function azflowMutacaoEhAutoinduzida(mutation) {
	if (!azflowNoEhAutoinjetado(mutation.target)) return false;
	for (let i = 0; i < mutation.addedNodes.length; i++) {
		if (!azflowNoEhAutoinjetado(mutation.addedNodes[i])) return false;
	}
	for (let i = 0; i < mutation.removedNodes.length; i++) {
		if (!azflowNoEhAutoinjetado(mutation.removedNodes[i])) return false;
	}
	return true;
}

function removerAudienciaDesignadaDaCapa() {
	azflowAudienciaDesignadaGeracao += 1;
	azflowAudienciaCancelarAgendamento();
	const wrap = document.querySelector('[' + AZFLOW_AUDIENCIA_WRAP_ATTR + '="true"]');
	if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
	const st = document.getElementById('superproc-aud-titulo-style');
	if (st && st.parentNode) st.parentNode.removeChild(st);
	const stCapa = document.getElementById('superproc-aud-capa-style');
	if (stCapa && stCapa.parentNode) stCapa.parentNode.removeChild(stCapa);
}

function azflowAudienciaTextoLimpo(valor) {
	return String(valor || '').replace(/\s+/g, ' ').trim();
}

function azflowAudienciaNorm(valor) {
	return azflowAudienciaTextoLimpo(valor)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

async function obterEstadosDestaquesAudiencia() {
	const keys = [
		'azflowCardDestaquesStatus',
		AZFLOW_AUDIENCIA_DESIGNADA_KEY,
		'azflowCardDestaquesDosimetria',
		'azflowCardDestaquesSorteioJurados'
	];
	const out = { card: 'on', audiencia: 'on', dosimetria: true, sorteio: true };
	try {
		let data = null;
		if (window.chrome && chrome.storage && chrome.storage.local) {
			data = await chrome.storage.local.get(keys);
		}
		const pick = function (key, fallback) {
			const v = data && data[key];
			if (v === 'on' || v === 'off') return v;
			try {
				const ls = localStorage.getItem(key);
				if (ls === 'on' || ls === 'off') return ls;
			} catch (_) {}
			return fallback;
		};
		out.card = pick('azflowCardDestaquesStatus', 'on');
		out.audiencia = pick(AZFLOW_AUDIENCIA_DESIGNADA_KEY, 'on');
		out.dosimetria = pick('azflowCardDestaquesDosimetria', 'on') === 'on';
		out.sorteio = pick('azflowCardDestaquesSorteioJurados', 'on') === 'on';
	} catch (_) {}
	return out;
}

function azflowAudienciaDecodificarHtmlEproc(buf) {
	try {
		return new TextDecoder('iso-8859-1').decode(buf);
	} catch (_) {
		return '';
	}
}

function azflowAudienciaExtrairUrl() {
	const a = document.querySelector(
		'a[href*="acao=audiencia_listar"]:not([href*="acao=audiencia_listar_"])'
	);
	if (!a) return '';
	const href = a.getAttribute('href') || '';
	return /acao=audiencia_listar/i.test(href) ? href : '';
}

function azflowAudienciaParseDataHoraBr(s) {
	const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
	if (!m) return 0;
	return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], 0, 0).getTime();
}

function azflowAudienciaEscolherDesignada(lista) {
	if (!lista || !lista.length) return null;
	const agora = Date.now();
	let melhorFutura = null;
	let melhorQualquer = null;
	for (let i = 0; i < lista.length; i++) {
		const item = lista[i];
		if (!melhorQualquer || item.tsInicio < melhorQualquer.tsInicio) melhorQualquer = item;
		if (item.tsInicio >= agora) {
			if (!melhorFutura || item.tsInicio < melhorFutura.tsInicio) melhorFutura = item;
		}
	}
	return melhorFutura || melhorQualquer;
}

function azflowAudienciaExtrairDesignadasDoHtml(html) {
	const out = [];
	let doc;
	try {
		doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
	} catch (_) {
		return out;
	}
	const tables = doc.querySelectorAll('table.infraTable');
	let table = null;
	for (let i = 0; i < tables.length; i++) {
		if (/audi/i.test(String(tables[i].getAttribute('summary') || ''))) {
			table = tables[i];
			break;
		}
	}
	if (!table) table = tables[0] || null;
	if (!table) return out;

	const rows = table.rows || table.querySelectorAll('tr');
	for (let r = 0; r < rows.length; r++) {
		const tr = rows[r];
		if (tr.querySelector('th')) continue;
		const tds = tr.cells || tr.querySelectorAll('td');
		if (!tds || tds.length < 5) continue;
		const situacao = azflowAudienciaTextoLimpo(tds[4].textContent).toUpperCase();
		const statusEl = tr.querySelector('[data-cod-status-atual]');
		const cod = statusEl ? String(statusEl.getAttribute('data-cod-status-atual') || '') : '';
		if (situacao.indexOf('DESIGNADA') === -1 && cod.toUpperCase() !== 'D') continue;
		const inicio = azflowAudienciaTextoLimpo(tds[1].textContent);
		if (!inicio) continue;
		out.push({ inicio: inicio, tsInicio: azflowAudienciaParseDataHoraBr(inicio) });
	}
	return out;
}

function obterAudienciaDesignadaParaCapa() {
	const url = azflowAudienciaExtrairUrl();
	if (!url) return Promise.resolve({ url: '', audiencia: null });
	if (azflowAudienciaDesignadaInflight && azflowAudienciaDesignadaInflight.url === url) {
		return azflowAudienciaDesignadaInflight.promise;
	}

	if (azflowAudienciaFetchAbort) {
		try { azflowAudienciaFetchAbort.abort(); } catch (_) {}
	}
	const ac = typeof AbortController === 'function' ? new AbortController() : null;
	azflowAudienciaFetchAbort = ac;

	const promise = fetch(url, {
		method: 'GET',
		credentials: 'same-origin',
		cache: 'no-store',
		signal: ac ? ac.signal : undefined,
		headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' }
	})
		.then(function (res) {
			if (!res || !res.ok) return { url: url, audiencia: null };
			return res.arrayBuffer().then(function (buf) {
				return {
					url: url,
					audiencia: azflowAudienciaEscolherDesignada(
						azflowAudienciaExtrairDesignadasDoHtml(azflowAudienciaDecodificarHtmlEproc(buf))
					)
				};
			});
		})
		.catch(function () {
			return { url: url, audiencia: null };
		})
		.finally(function () {
			if (azflowAudienciaFetchAbort === ac) azflowAudienciaFetchAbort = null;
			if (azflowAudienciaDesignadaInflight && azflowAudienciaDesignadaInflight.url === url) {
				azflowAudienciaDesignadaInflight = null;
			}
		});

	azflowAudienciaDesignadaInflight = { url: url, promise: promise };
	return promise;
}

function azflowAudienciaParseCssRgb(color) {
	const s = String(color || '').trim();
	if (!s || s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return null;
	const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (!m) return null;
	return { r: +m[1], g: +m[2], b: +m[3] };
}

function azflowAudienciaLuminancia(rgb) {
	return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function azflowAudienciaCorFundoCapa(fldCapa) {
	let el = fldCapa || document.getElementById('fldCapa');
	while (el && el !== document.documentElement) {
		try {
			const rgb = azflowAudienciaParseCssRgb(window.getComputedStyle(el).backgroundColor);
			if (rgb) return rgb;
		} catch (_) {}
		el = el.parentElement;
	}
	return { r: 255, g: 255, b: 255 };
}

function azflowAudienciaCoresContraste(fldCapa) {
	const lum = azflowAudienciaLuminancia(azflowAudienciaCorFundoCapa(fldCapa));
	// Padrão: fundo claro + letra cinza escura (capa rosa/colorida).
	// Só em capa bem clara/branca: tarja cinza com transparência (ainda com texto escuro).
	if (lum >= 0.92) {
		return {
			bg: 'rgba(110, 110, 110, 0.5)',
			fg: '#2f2f2f',
			fgMuted: 'rgba(47, 47, 47, 0.55)',
			sep: 'rgba(47, 47, 47, 0.45)',
			border: 'rgba(0, 0, 0, 0.12)'
		};
	}
	return {
		bg: 'rgba(255, 255, 255, 0.72)',
		fg: '#3a3a3a',
		fgMuted: 'rgba(58, 58, 58, 0.55)',
		sep: 'rgba(58, 58, 58, 0.42)',
		border: 'rgba(0, 0, 0, 0.14)'
	};
}

function azflowAudienciaPartirDataHora(texto) {
	const t = azflowAudienciaTextoLimpo(texto);
	if (!t || /^nenhuma$/i.test(t) || /^sem designa[cç][aã]o$/i.test(t)) {
		return { data: 'Sem designação', hora: '' };
	}
	const m = t.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/);
	if (m) return { data: m[1], hora: m[2] };
	return { data: t, hora: '' };
}

function azflowAudienciaEstilizarHora(horaSpan, cores) {
	if (!horaSpan) return;
	horaSpan.style.setProperty('display', 'inline-flex', 'important');
	horaSpan.style.setProperty('align-items', 'center', 'important');
	horaSpan.style.setProperty('font-weight', 'normal', 'important');
	horaSpan.style.setProperty('font-size', 'inherit', 'important');
	horaSpan.style.setProperty('line-height', '1', 'important');
	horaSpan.style.setProperty('color', cores.fgMuted, 'important');
	horaSpan.style.setProperty('margin-left', '0.5em', 'important');
	horaSpan.style.setProperty('padding-left', '0.5em', 'important');
	horaSpan.style.setProperty('border-left', '1px dotted ' + cores.sep, 'important');
	horaSpan.style.setProperty('box-sizing', 'border-box', 'important');
	horaSpan.style.setProperty('height', '1em', 'important');
}

function azflowAudienciaEstilizarData(dataSpan, cores) {
	if (!dataSpan) return;
	dataSpan.style.setProperty('display', 'inline-flex', 'important');
	dataSpan.style.setProperty('align-items', 'center', 'important');
	dataSpan.style.setProperty('line-height', '1', 'important');
	dataSpan.style.setProperty('font-weight', 'inherit', 'important');
	dataSpan.style.setProperty('height', '1em', 'important');
	dataSpan.style.setProperty('color', cores.fg, 'important');
}

function azflowAudienciaAplicarEstiloPill(span, fldCapa) {
	if (!span) return;
	const cores = azflowAudienciaCoresContraste(fldCapa || document.getElementById('fldCapa'));
	span.style.cssText =
		'font-size:15px!important;color:' + cores.fg + '!important;background-color:' + cores.bg +
		'!important;border:1px solid ' + cores.border + '!important;display:flex!important;' +
		'align-items:center!important;width:max-content!important;max-width:100%!important;' +
		'box-sizing:border-box!important;line-height:1!important;min-height:28px!important;' +
		'padding:0 10px!important;border-radius:6px!important;';

	const dataSpan = span.querySelector('[data-superproc-aud-data="true"]');
	const horaSpan = span.querySelector('[data-superproc-aud-hora="true"]');
	if (dataSpan) azflowAudienciaEstilizarData(dataSpan, cores);
	if (horaSpan) azflowAudienciaEstilizarHora(horaSpan, cores);
}

function azflowAudienciaPreencherConteudoPill(span, texto, fldCapa) {
	if (!span) return;
	const partes = azflowAudienciaPartirDataHora(texto);

	let dataSpan = span.querySelector('[data-superproc-aud-data="true"]');
	let horaSpan = span.querySelector('[data-superproc-aud-hora="true"]');

	if (!dataSpan) {
		while (span.firstChild) span.removeChild(span.firstChild);
		dataSpan = document.createElement('span');
		dataSpan.setAttribute('data-superproc-aud-data', 'true');
		span.appendChild(dataSpan);
	}
	if (dataSpan.textContent !== partes.data) dataSpan.textContent = partes.data;

	if (partes.hora) {
		if (!horaSpan) {
			horaSpan = document.createElement('span');
			horaSpan.setAttribute('data-superproc-aud-hora', 'true');
			span.appendChild(horaSpan);
		}
		if (horaSpan.textContent !== partes.hora) horaSpan.textContent = partes.hora;
	} else if (horaSpan) {
		horaSpan.remove();
	}

	azflowAudienciaAplicarEstiloPill(span, fldCapa);
}

function azflowAudienciaLinhasCapa(fldCapa) {
	if (!fldCapa) return [];
	const root = fldCapa.querySelector('#divCapaProcesso') || fldCapa;
	const out = [];
	const kids = root.children;
	for (let i = 0; i < kids.length; i++) {
		const el = kids[i];
		if (el && el.classList && el.classList.contains('row')) out.push(el);
	}
	return out;
}

function azflowAudienciaLinhaTemBotaoAcao(row) {
	if (!row) return false;
	return !!(
		row.querySelector('#azflow-botao-dosimetria, #azflow-botao-sorteio') ||
		row.querySelector('[aria-label="Dosimetria"], [aria-label="Sorteio de Jurados"]')
	);
}

function azflowAudienciaEspacoLivreNaLinha(row) {
	if (!row) return -1;
	const rowRect = row.getBoundingClientRect();
	if (!rowRect || rowRect.width < 40) return -1;
	let rightmost = rowRect.left;
	const kids = row.children;
	for (let i = 0; i < kids.length; i++) {
		const col = kids[i];
		if (!col || col.nodeType !== 1) continue;
		if (col.getAttribute(AZFLOW_AUDIENCIA_WRAP_ATTR) === 'true') continue;
		const r = col.getBoundingClientRect();
		if (r.width < 1 && r.height < 1) continue;
		if (r.right > rightmost) rightmost = r.right;
	}
	return Math.max(0, rowRect.right - rightmost);
}

function azflowAudienciaEncontrarLinhaComMaisEspaco(fldCapa) {
	const rows = azflowAudienciaLinhasCapa(fldCapa);
	if (!rows.length) return null;

	const MIN_UTIL = 150;
	let bestLivre = null;
	let bestLivreSpace = -1;
	let bestQualquer = null;
	let bestQualquerSpace = -1;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const space = azflowAudienciaEspacoLivreNaLinha(row);
		if (space > bestQualquerSpace) {
			bestQualquerSpace = space;
			bestQualquer = row;
		}
		if (!azflowAudienciaLinhaTemBotaoAcao(row) && space > bestLivreSpace) {
			bestLivreSpace = space;
			bestLivre = row;
		}
	}

	if (bestLivre && bestLivreSpace >= MIN_UTIL) return bestLivre;
	if (bestLivre && bestLivreSpace > 0 && bestLivreSpace + 40 >= bestQualquerSpace) return bestLivre;
	if (bestLivre && bestQualquer && bestLivre !== bestQualquer && azflowAudienciaLinhaTemBotaoAcao(bestQualquer)) {
		return bestLivre;
	}
	return bestQualquer || bestLivre || rows[0];
}

function azflowAudienciaTituloExibicao(descricao) {
	let t = azflowAudienciaTextoLimpo(descricao);
	if (!t) t = 'Audiência';
	if (!/:$/.test(t)) t += ':';
	return t;
}

function azflowAudienciaCriarOuObterWrap(fldCapa) {
	let wrap = document.querySelector('[' + AZFLOW_AUDIENCIA_WRAP_ATTR + '="true"]');
	if (wrap) return wrap;

	wrap = document.createElement('section');
	wrap.className = 'col-auto mr-2';
	wrap.setAttribute(AZFLOW_AUDIENCIA_WRAP_ATTR, 'true');
	wrap.setAttribute('role', 'region');
	wrap.setAttribute('aria-label', 'Audiência');

	const label = document.createElement('label');
	label.id = 'superprocLblAudienciaDesignada';
	label.textContent = 'Audiência:';

	const span = document.createElement('span');
	span.id = AZFLOW_AUDIENCIA_TXT_ID;
	span.className = 'infraLabelObrigatorio';
	span.tabIndex = 0;
	span.setAttribute('aria-description', 'Audiência');

	wrap.appendChild(label);
	wrap.appendChild(span);
	return wrap;
}

function azflowAudienciaPosicionarNaCapa(fldCapa, texto, titulo) {
	if (!fldCapa) return null;
	const ancoraSuperproc = localizarAncoraSuperprocAudiencia();
	const row = ancoraSuperproc ? ancoraSuperproc.parentNode : azflowAudienciaEncontrarLinhaComMaisEspaco(fldCapa);
	if (!row) return null;
	const wrap = azflowAudienciaCriarOuObterWrap(fldCapa);
	if (ancoraSuperproc) {
		if (wrap.previousElementSibling !== ancoraSuperproc) ancoraSuperproc.insertAdjacentElement('afterend', wrap);
	} else if (wrap.parentNode !== row) row.appendChild(wrap);

	const tituloExibicao = titulo != null
		? azflowAudienciaTituloExibicao(titulo)
		: null;
	if (tituloExibicao) {
		wrap.setAttribute('aria-label', tituloExibicao);
		const label = wrap.querySelector('#superprocLblAudienciaDesignada') || wrap.querySelector('label');
		if (label) label.textContent = tituloExibicao;
		const spanDesc = document.getElementById(AZFLOW_AUDIENCIA_TXT_ID);
		if (spanDesc) spanDesc.setAttribute('aria-description', tituloExibicao);
	}

	const span = document.getElementById(AZFLOW_AUDIENCIA_TXT_ID);
	if (span) {
		if (texto != null) azflowAudienciaPreencherConteudoPill(span, texto, fldCapa);
		else azflowAudienciaAplicarEstiloPill(span, fldCapa);
	}
	return wrap;
}

/** Quais botões auxiliares ainda devem aparecer nesta capa. */
function azflowAudienciaBotoesPendentes(prefs) {
	const pendentes = { dosimetria: false, sorteio: false };
	if (!prefs) return pendentes;

	const temDosimetria = !!document.getElementById('azflow-botao-dosimetria');
	const temSorteio = !!document.getElementById('azflow-botao-sorteio');
	const textoComp = azflowAudienciaNorm((document.getElementById('txtCompetencia') || {}).textContent || '');
	const textoClasse = azflowAudienciaNorm((document.getElementById('txtClasse') || {}).textContent || '');

	const dosimetriaElegivel =
		textoComp.indexOf('penal') !== -1 ||
		textoComp.indexOf('criminal') !== -1 ||
		textoClasse.indexOf('penal') !== -1 ||
		textoClasse.indexOf('criminal') !== -1;
	const sorteioElegivel =
		textoComp.indexOf('tribunal do juri') !== -1 ||
		textoComp === 'juri' ||
		/\b153\b/.test(textoComp) ||
		textoClasse.indexOf('tribunal do juri') !== -1;

	pendentes.dosimetria = !!(prefs.dosimetria && dosimetriaElegivel && !temDosimetria);
	pendentes.sorteio = !!(prefs.sorteio && sorteioElegivel && !temSorteio);
	return pendentes;
}

/**
 * Espera TODOS os botões elegíveis (Dosimetria e/ou Sorteio) assentarem.
 * Não resolve cedo quando só um dos dois chegou.
 */
function aguardarLayoutCapaParaAudiencia(fldCapa, geracao, prefs) {
	azflowAudienciaLimparEsperaLayout();
	if (!fldCapa) return Promise.resolve();

	const pendentes = azflowAudienciaBotoesPendentes(prefs);
	if (!pendentes.dosimetria && !pendentes.sorteio) return Promise.resolve();

	return new Promise(function (resolve) {
		let finalizado = false;
		const terminar = function () {
			if (finalizado) return;
			finalizado = true;
			azflowAudienciaLimparEsperaLayout();
			resolve();
		};

		azflowAudienciaLayoutObserver = new MutationObserver(function () {
			if (geracao !== azflowAudienciaDesignadaGeracao) {
				terminar();
				return;
			}
			const ainda = azflowAudienciaBotoesPendentes(prefs);
			if (!ainda.dosimetria && !ainda.sorteio) terminar();
		});

		try {
			azflowAudienciaLayoutObserver.observe(fldCapa, { childList: true, subtree: true });
		} catch (_) {
			terminar();
			return;
		}

		azflowAudienciaLayoutTimer = setTimeout(terminar, AZFLOW_AUDIENCIA_LAYOUT_WAIT_MS);
	});
}


/**
 * `forcar=true` é reservado para gatilhos explícitos (toggle do usuário,
 * mudança de storage) e sempre reagenda. Sem `forcar`, é um gatilho passivo
 * (reestilização disparada por qualquer mutação em #fldCapa, inclusive
 * alheia à extensão): a data da audiência não muda com a página aberta, então
 * cada URL só é buscada uma vez por carregamento — do contrário, DOM nativo
 * do eproc que mude dentro de #fldCapa reagendaria a checagem (e o fetch de
 * audiencia_listar) repetidamente sem necessidade.
 */
function agendarAudienciaDesignadaNaCapa(forcar) {
	if (azflowAudienciaDesignadaAgendado) return;
	if (!forcar) {
		const url = azflowAudienciaExtrairUrl();
		if (url && url === azflowAudienciaUltimaUrlTentada) return;
	}
	azflowAudienciaDesignadaAgendado = true;

	const executar = function () {
		azflowAudienciaDesignadaAgendado = false;
		azflowAudienciaDesignadaIdleHandle = null;
		azflowAudienciaUltimaUrlTentada = azflowAudienciaExtrairUrl();
		carregarAudienciaDesignadaSeAtivo();
	};

	if (typeof requestIdleCallback === 'function') {
		azflowAudienciaDesignadaIdleHandle = requestIdleCallback(executar, { timeout: 3500 });
	} else {
		azflowAudienciaDesignadaIdleHandle = setTimeout(executar, 1200);
	}
}

function agendarReposicionamentoAudienciaDesignada() {
	if (!document.getElementById(AZFLOW_AUDIENCIA_TXT_ID)) return;
	if (azflowAudienciaReposicionaTimer) clearTimeout(azflowAudienciaReposicionaTimer);
	azflowAudienciaReposicionaTimer = setTimeout(function () {
		azflowAudienciaReposicionaTimer = null;
		const fld = document.getElementById('fldCapa');
		if (fld && document.getElementById(AZFLOW_AUDIENCIA_TXT_ID)) {
			azflowAudienciaPosicionarNaCapa(fld, null);
		}
	}, 80);
}

async function carregarAudienciaDesignadaSeAtivo() {
	const geracao = azflowAudienciaDesignadaGeracao;
	try {
		const estados = await obterEstadosDestaquesAudiencia();
		if (geracao !== azflowAudienciaDesignadaGeracao) return;
		if (estados.card !== 'on' || estados.audiencia !== 'on') {
			removerAudienciaDesignadaDaCapa();
			return;
		}

		const fldCapa = document.getElementById('fldCapa');
		if (!fldCapa) return;

		const urlAtual = azflowAudienciaExtrairUrl();
		const cache = azflowAudienciaUltimoResultado;
		const podeReaproveitar =
			urlAtual &&
			cache &&
			cache.url === urlAtual &&
			Date.now() - cache.ts < AZFLOW_AUDIENCIA_COOLDOWN_MS &&
			document.getElementById(AZFLOW_AUDIENCIA_TXT_ID);

		const prefsBotoes = { dosimetria: estados.dosimetria, sorteio: estados.sorteio };
		const [resultado] = await Promise.all([
			podeReaproveitar ? Promise.resolve(cache) : obterAudienciaDesignadaParaCapa(),
			aguardarLayoutCapaParaAudiencia(fldCapa, geracao, prefsBotoes)
		]);
		if (geracao !== azflowAudienciaDesignadaGeracao) return;
		if (!podeReaproveitar && resultado && resultado.url) {
			azflowAudienciaUltimoResultado = { url: resultado.url, audiencia: resultado.audiencia, ts: Date.now() };
		}

		const fldAtual = document.getElementById('fldCapa');
		if (!fldAtual) return;

		const audiencia = resultado && resultado.audiencia ? resultado.audiencia : null;
		const texto = audiencia ? azflowAudienciaTextoLimpo(audiencia.inicio) : '';
		if (!audiencia || !texto) {
			removerAudienciaDesignadaDaCapa();
			return;
		}
		azflowAudienciaPosicionarNaCapa(
			fldAtual,
			texto,
			azflowAudienciaTextoLimpo(audiencia.descricao)
		);
	} catch (_) {}
}

export default {
    id: MODULE_ID,
    name: 'Capa - Audiência & Valor da Causa',
    category: 'Capa do Processo',
    description: 'Exibe a audiência designada, o valor da causa e o saldo de subcontas (execução fiscal) logo após os botões Lembretes/Minutas da capa.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init() {
        if (window.__superprocAudValorCausaInjetado) return;
        window.__superprocAudValorCausaInjetado = true;

        // Equivalente ao trecho do AZflow (eproc-capa.js, 4100-4103): reage a mudanças das opções.
        if (window.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes['azflowCardDestaquesStatus']) valorCausaConfig.destaques = changes['azflowCardDestaquesStatus'].newValue !== 'off';
            if (changes['azflowValorCausaExibir'] || changes['azflowCardDestaquesStatus']) {
                aplicarEstadoValorCausaAposToggle(changes['azflowValorCausaExibir'] ? changes['azflowValorCausaExibir'].newValue !== 'off' : valorCausaConfig.preferencia);
            }
            if (changes[AZFLOW_AUDIENCIA_DESIGNADA_KEY]) {
                if (changes[AZFLOW_AUDIENCIA_DESIGNADA_KEY].newValue === 'on') agendarAudienciaDesignadaNaCapa(true);
                else removerAudienciaDesignadaDaCapa();
            }
        });

        // Mesmo gatilho do AZflow (eproc-capapri.js, 2131-2142).
        window.addEventListener('azflowCardDestaquesButtonsChanged', function (ev) {
            const detail = (ev && ev.detail) || {};
            if (Object.prototype.hasOwnProperty.call(detail, 'showAudienciaDesignada')) {
                if (detail.showAudienciaDesignada) agendarAudienciaDesignadaNaCapa(true);
                else removerAudienciaDesignadaDaCapa();
                return;
            }
            agendarReposicionamentoAudienciaDesignada();
        });

        // Observador de #fldCapa (equivalente ao do AZflow, eproc-capapri.js, 2006-2026): ignora mutações
        // autoinduzidas e agenda a audiência (1 busca por URL).
        let fldObservado = null;
        let observerFld = null;
        function observarFld() {
            const fld = document.getElementById('fldCapa');
            if (!fld || fld === fldObservado) return;
            fldObservado = fld;
            if (observerFld) observerFld.disconnect();
            observerFld = new MutationObserver(mutations => {
                if (mutations.every(azflowMutacaoEhAutoinduzida)) return;
                agendarAudienciaDesignadaNaCapa();
                agendarReposicionamentoAudienciaDesignada();
            });
            observerFld.observe(fld, { childList: true, subtree: true, attributes: false });
            agendarAudienciaDesignadaNaCapa();
        }

        // Reposiciona se o container de botões (Lembretes/Minutas) surgir depois dos badges.
        let timerPos = null;
        function reposicionar() {
            const ancora = localizarAncoraSuperproc();
            if (!ancora) return;
            const valor = document.getElementById('superproc-valor-causa-container');
            if (valor && valor.previousElementSibling !== ancora && valor.parentNode) ancora.insertAdjacentElement('afterend', valor);
            const wrap = document.querySelector('[data-superproc-audiencia-designada-wrap="true"]');
            const ref = localizarAncoraSuperprocAudiencia();
            if (wrap && ref && wrap.previousElementSibling !== ref) ref.insertAdjacentElement('afterend', wrap);
        }

        const geral = new MutationObserver(() => {
            observarFld();
            clearTimeout(timerPos);
            timerPos = setTimeout(reposicionar, 150);
        });
        geral.observe(document.documentElement, { childList: true, subtree: true });
        observarFld();
        window.addEventListener('beforeunload', () => {
            azflowAudienciaCancelarAgendamento();
            geral.disconnect();
            if (observerFld) observerFld.disconnect();
        });
    }
};
