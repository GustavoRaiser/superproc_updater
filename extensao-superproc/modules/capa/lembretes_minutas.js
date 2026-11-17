/**
 * SuperPROC - Módulo: Capa - Lembretes e Minutas
 * 
 * Funcionalidades:
 * 1. Balões flutuantes elegantes para Lembretes e Minutas na Capa do Processo.
 * 2. Detecção automática de minutas ativas (para assinar, conferir, etc.) mudando a cor dos botões para verde/azul.
 * 3. Modo Compacto próprio (botão no popup da extensão), independente dos demais módulos da capa.
 * 4. Pré-visualização ao passar o mouse e reposicionamento dinâmico.
 * 5. Garantia contínua de "Manter Minutas Aberto" ativado no EPROC (oculto visualmente).
 * 6. Suporte completo para consulta de Minutas Excluídas e Anexadas mesmo quando não há minutas ativas.
 */

import { iniciarCompacto } from './_compacto.js';

export default {
    id: 'capa_lembretes_minutas',
    name: 'Capa - Lembretes e Minutas',
    category: 'Capa do Processo',
    description: 'Botões dinâmicos de status e balões suspensos para Lembretes e Minutas do processo.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',


    async init({ meta, storage } = {}) {
        if (window.__superprocCapaLembretesInjetado) return;
        window.__superprocCapaLembretesInjetado = true;

        // Modo Compacto PRÓPRIO deste módulo (botão no popup da extensão): classe body.eproc-compacto-lembretes.
        // Independe dos módulos Barra de Botões e Ações Preferenciais.
        const compacto = await iniciarCompacto({
            meta: meta || { id: 'capa_lembretes_minutas' }, storage, classe: 'eproc-compacto-lembretes',
            aoMudar: () => { try { atualizarPosicaoBotoes(); } catch (erro) { console.warn('[SuperPROC] Lembretes: falha ao reaplicar o compacto', erro); } }
        });

        let jaFezResetInicial = false;
        let timeoutLembreteOpen = null;
        let timeoutLembreteClose = null;
        let timeoutMinutaOpen = null;
        let timeoutMinutaClose = null;

        // ======================================================================
        // GARANTE QUE AS MINUTAS DO EPROC ESTEJAM SEMPRE ABERTAS E PERSISTIDAS
        // ======================================================================
        function preGravarCookieMinutas() {
            try {
                const prefixos = new Set();
                const hdnPrefixo = document.getElementById('hdnInfraPrefixoCookie');
                if (hdnPrefixo && hdnPrefixo.value) {
                    prefixos.add(hdnPrefixo.value.trim());
                }

                // Prefixos em cookies já existentes
                const cookieMatches = document.cookie.matchAll(/([A-Za-z0-9]+_Eproc_\d+)_/g);
                for (const m of cookieMatches) {
                    if (m && m[1]) prefixos.add(m[1]);
                }

                // Elementos com onclick no DOM
                document.querySelectorAll('[onclick*="chkMinutasAbertas"], [onclick*="chkExibirExcluidas"], [onclick*="chkExibirAnexadas"]').forEach(el => {
                    const onclickAttr = el.getAttribute('onclick') || '';
                    const m = onclickAttr.match(/['"]([^'"]+?)_chk(?:MinutasAbertas|ExibirExcluidas|ExibirAnexadas)['"]/);
                    if (m && m[1]) prefixos.add(m[1]);
                });

                const dataExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
                prefixos.forEach(pref => {
                    const cNome = `${pref}_chkMinutasAbertas`;
                    if (!document.cookie.includes(`${cNome}=true`)) {
                        document.cookie = `${cNome}=true; expires=${dataExp}; path=/; SameSite=Lax`;
                    }
                });
            } catch (err) {
                console.warn('[SuperPROC] Falha ao pré-gravar cookie minutas:', err);
            }
        }

        // Dispara clique em elementos evitando violação de CSP quando o href é javascript:...
        function clicarElementoSeguro(el) {
            if (!el) return;
            const href = el.getAttribute ? el.getAttribute('href') : null;
            const isJsHref = href && href.trim().toLowerCase().startsWith('javascript:');
            if (isJsHref) {
                el.removeAttribute('href');
                try {
                    el.click();
                } finally {
                    el.setAttribute('href', href);
                }
            } else {
                el.click();
            }
        }

        let ultimaRequisicaoMinutas = 0;
        let tentativasCargaMinutas = 0;
        function requisitarAtualizacaoMinutasEproc(forcar = false) {
            const now = Date.now();
            if (!forcar && (now - ultimaRequisicaoMinutas < 1500)) return;
            ultimaRequisicaoMinutas = now;

            const fldMinutas = document.getElementById('fldMinutas');
            if (fldMinutas) {
                fldMinutas.dataset.superprocLastTrigger = now.toString();
            }

            // O EPROC pode bloquear (CSP) <script> inline injetado pela extensão, e a falha é silenciosa:
            // em perfil novo isso impedia o carregamento das minutas. O clique no próprio link de
            // atualização equivale ao do usuário e executa o onclick nativo da página.
            let metodo = 'nenhum';
            try {
                const btnRefresh = document.getElementById('atualizaMinutas') || document.querySelector('a[onclick*="atualizaMinutas"]');
                if (btnRefresh) {
                    clicarElementoSeguro(btnRefresh);
                    metodo = 'clique no link de atualização';
                }
            } catch(e) {}

            if (metodo === 'nenhum') {
                // Sem o link: pede ao mundo principal (injetor_main_world.js, se estiver carregado).
                try {
                    window.dispatchEvent(new CustomEvent('superproc-atualizar-minutas'));
                    metodo = 'evento ao mundo principal';
                } catch(e) {}
                // E, como último recurso, aciona o expansor da seção.
                try {
                    const btnExpandir = document.getElementById('legMinutasMaisMenos') || document.querySelector('[id^="legMinutasMaisMenos"]');
                    if (btnExpandir) {
                        clicarElementoSeguro(btnExpandir);
                        metodo += ' + expansor';
                    }
                } catch(e) {}
            }
            console.debug('[SuperPROC] Atualização das minutas requisitada: ' + metodo + '.');
        }

        // ======================================================================
        // GUARDIÃO DO "MANTER MINUTAS ABERTO" (#chkMinutasAbertas)
        // O EPROC só exibe o conteúdo das minutas com este checkbox marcado. Em máquina/perfil novo
        // (sem o cookie) ele vem desmarcado e outros módulos/rotinas da página podem desmarcá-lo depois.
        // Por isso a verificação é contínua (não de uma vez só): se estiver desmarcado, clica nele
        // (aciona manterMinutasAberto da página, que grava o cookie nativo) e, se ainda assim não
        // marcar, força a propriedade. Limite de tentativas evita briga infinita com a página.
        // ======================================================================
        const estadoChkMinutas = new WeakMap();
        const CHK_MIN_ESPACO_MS = 600;
        const CHK_MIN_MAX_TENTATIVAS = 6;
        const CHK_MIN_ESTAVEL_MS = 3000;

        function localizarChkMinutasAbertas() {
            return document.getElementById('chkMinutasAbertas')
                || document.querySelector('input[type="checkbox"][name="chkMinutasAbertas"], input[type="checkbox"][id$="chkMinutasAbertas"]');
        }

        function gravarCookieDoChkMinutas(chk) {
            const onclickAttr = chk.getAttribute('onclick') || '';
            const match = onclickAttr.match(/['"]([^'"]*chkMinutasAbertas[^'"]*)['"]/);
            if (match && match[1]) {
                const dataExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
                try {
                    document.cookie = `${match[1]}=true; expires=${dataExp}; path=/; SameSite=Lax`;
                } catch(e) {}
            }
        }

        function garantirMinutasAbertasMarcado(origem) {
            const chk = localizarChkMinutasAbertas();
            if (!chk) return false;

            const agora = Date.now();
            const est = estadoChkMinutas.get(chk) || { tentativas: 0, ultima: 0, marcadoDesde: 0, avisou: false };
            estadoChkMinutas.set(chk, est);

            if (chk.checked) {
                if (!est.marcadoDesde) est.marcadoDesde = agora;
                // Só zera o contador depois de ficar marcado por um tempo (não de uma marcação momentânea).
                if (agora - est.marcadoDesde >= CHK_MIN_ESTAVEL_MS) { est.tentativas = 0; est.avisou = false; }
                gravarCookieDoChkMinutas(chk);
                return true;
            }

            est.marcadoDesde = 0;
            if (agora - est.ultima < CHK_MIN_ESPACO_MS) return false;
            if (est.tentativas >= CHK_MIN_MAX_TENTATIVAS) {
                if (!est.avisou) {
                    est.avisou = true;
                    console.warn('[SuperPROC] "Manter Minutas Aberto" continua desmarcado após ' + est.tentativas + ' tentativas; parando de insistir neste elemento.');
                }
                return false;
            }

            est.tentativas++;
            est.ultima = agora;
            gravarCookieDoChkMinutas(chk);
            // 1) Clique real: dispara o onclick inline (manterMinutasAberto) no contexto da página.
            try { chk.click(); } catch(e) {}
            // 2) Se algo desfez a marcação na hora (ou o clique não surtiu efeito), força a propriedade.
            if (!chk.checked) chk.checked = true;
            console.debug('[SuperPROC] "Manter Minutas Aberto" estava desmarcado; marcado (' + (origem || 'varredura') + ', tentativa ' + est.tentativas + ').');
            return chk.checked;
        }

        function vincularGuardiaoMinutasAbertas() {
            if (window.__superprocMinutasChkGuardAnexado) return;
            window.__superprocMinutasChkGuardAnexado = true;
            // Reage a quem desmarcar via clique/evento (página, outro módulo, usuário).
            const aoMudar = (e) => {
                const alvo = e.target;
                if (!alvo || !alvo.id || !/chkMinutasAbertas$/.test(alvo.id)) return;
                setTimeout(() => garantirMinutasAbertasMarcado('evento'), CHK_MIN_ESPACO_MS + 50);
            };
            document.addEventListener('change', aoMudar, true);
            document.addEventListener('click', aoMudar, true);
            // Mudanças de propriedade .checked feitas por script não geram evento nem mutação de DOM:
            // verificação leve e periódica (só consulta o checkbox).
            setInterval(() => garantirMinutasAbertasMarcado('periodico'), 2000);
        }
        vincularGuardiaoMinutasAbertas();

        // Diagnóstico (somente contagens/booleanos, sem dados de processo): ver no console, filtro "minutas-diag".
        function diagnosticarMinutas(etapa) {
            try {
                const chk = localizarChkMinutasAbertas();
                const cont = document.getElementById('conteudoMinutas');
                const cookies = (document.cookie.match(/[A-Za-z0-9]+_Eproc_\d+_chkMinutasAbertas=[^;]*/g) || [])
                    .map(c => c.replace(/_Eproc_\d+_/, '_Eproc_N_'));
                console.debug('[SuperPROC][minutas-diag] ' + etapa + ' ' + JSON.stringify({
                    prefixoHidden: !!(document.getElementById('hdnInfraPrefixoCookie') || {}).value,
                    fldMinutas: !!document.getElementById('fldMinutas'),
                    conteudoMinutas: !!cont,
                    conteudoDisplay: cont ? (cont.style.display || '(vazio)') : null,
                    conteudoFilhos: cont ? cont.children.length : null,
                    tabelas: cont ? cont.querySelectorAll('table').length : null,
                    chkPresente: !!chk,
                    chkMarcado: chk ? chk.checked : null,
                    linkAtualizar: !!(document.getElementById('atualizaMinutas') || document.querySelector('a[onclick*="atualizaMinutas"]')),
                    cookies: cookies,
                    tentativasCarga: tentativasCargaMinutas
                }));
            } catch(e) {}
        }
        [0, 1500, 4000, 9000].forEach(ms => setTimeout(() => diagnosticarMinutas('t+' + ms + 'ms'), ms));

        // ABRIR A ÁREA "MINUTAS" QUANDO A PÁGINA A TROUXE FECHADA/NÃO CARREGADA
        // Em perfil novo o checkbox pode ser marcado, mas a área só carrega/abre pelo botão da legenda
        // (#legMinutasMaisMenos -> infraAbrirFecharElementoHTML). O botão ALTERNA, então só se clica quando
        // o ícone indica fechado (ver_tudo.gif) e ainda não há conteúdo; com limite de tentativas.
        // Deve rodar ANTES de qualquer trecho que force display:block ou troque o ícone.
        const estadoAberturaMinutas = { tentativas: 0, ultima: 0 };
        function abrirAreaMinutasSeFechada() {
            const btn = document.getElementById('legMinutasMaisMenos') || document.querySelector('[id^="legMinutasMaisMenos"]');
            if (!btn) return;
            const img = document.getElementById('imgMinutas');
            const srcImg = img ? (img.getAttribute('src') || '') : '';
            if (!/ver_tudo\.gif/.test(srcImg)) return; // não está sinalizada como fechada
            const cont = document.getElementById('conteudoMinutas');
            if (cont && cont.querySelector('table, .linkMinuta, #chkExibirExcluidas')) return; // já carregou
            const carregando = document.getElementById('carregandoMinutas');
            if (carregando && carregando.style.display !== 'none') return;
            const agora = Date.now();
            if (estadoAberturaMinutas.tentativas >= 3 || agora - estadoAberturaMinutas.ultima < 1500) return;
            estadoAberturaMinutas.tentativas++;
            estadoAberturaMinutas.ultima = agora;
            clicarElementoSeguro(btn);
            console.debug('[SuperPROC] Área Minutas estava fechada; aberta pelo botão da legenda (tentativa ' + estadoAberturaMinutas.tentativas + ').');
        }

        function assegurarAberturaEprocMinutas() {
            preGravarCookieMinutas();
            // Antes de qualquer retorno antecipado: o checkbox pode existir mesmo sem fldMinutas/conteudoMinutas prontos.
            garantirMinutasAbertasMarcado('varredura');
            abrirAreaMinutasSeFechada();

            const fldMinutas = document.getElementById('fldMinutas');
            const conteudo = document.getElementById('conteudoMinutas');
            if (!fldMinutas || !conteudo) return;

            // ======================================================================
            // VARREDURA 1: GARANTE QUE O FIELDSET E TODOS OS CONTAINERS ESTEJAM DISPLAY: BLOCK
            // Evita que <div id="conteudoMinutas" style="display: none;"> oculte o conteúdo
            // mesmo quando já possui <div id="conteudoMinutas_0" style="display:block;"> dentro dele.
            // ======================================================================
            const conteudosParaExibir = [
                conteudo,
                ...document.querySelectorAll('div[id^="conteudoMinutas"], div[id^="conteudoInternoMinutas"]')
            ];

            let precisouAbrirDisplay = false;
            conteudosParaExibir.forEach(el => {
                if (el && el.style.display === 'none') {
                    el.style.display = 'block';
                    precisouAbrirDisplay = true;
                }
            });

            // Se o eproc ainda exibe ícones com imagem "ver_tudo.gif", alterna para "ver_resumo.gif"
            document.querySelectorAll('img[id^="imgMinutas"]').forEach(img => {
                if (img && img.src.includes('ver_tudo.gif')) {
                    img.src = img.src.replace('ver_tudo.gif', 'ver_resumo.gif');
                    img.setAttribute('title', 'Ocultar');
                }
            });

            // Se o conteúdo estiver completamente vazio (não tem tabela nem checkboxes), dispara AJAX do eproc
            const temTabela = conteudo.querySelector('table, .linkMinuta');
            const temCheckboxes = conteudo.querySelector('#chkMinutasAbertas, #chkExibirExcluidas');
            const estaVazio = (conteudo.children.length === 0 && conteudo.innerHTML.trim() === '');
            const carregando = document.getElementById('carregandoMinutas');
            const emCarregamento = carregando && carregando.style.display !== 'none';

            // Perfil novo: o EPROC pode ter carregado a seção sem conteúdo (sem o cookie de "manter aberto").
            // Além do caso "vazio", insiste algumas vezes (limitado) até aparecer tabela ou checkbox.
            if (!temTabela && !temCheckboxes && !emCarregamento) {
                if (estaVazio || precisouAbrirDisplay || tentativasCargaMinutas < 4) {
                    tentativasCargaMinutas++;
                    requisitarAtualizacaoMinutasEproc();
                }
            }

            // VARREDURA 2 (checkbox 'chkMinutasAbertas' marcado + cookie) é feita por
            // garantirMinutasAbertasMarcado(), chamada no início desta função.
        }

        // Blindagem imediata para que Lembretes e Minutas nunca fiquem abertos no fluxo da página
        injetarEstilosLembretes();
        blindarFieldsets();
        assegurarAberturaEprocMinutas();

        function injetarEstilosLembretes() {
            if (document.getElementById('superproc-lembretes-style')) return;
            const style = document.createElement('style');
            style.id = 'superproc-lembretes-style';
            style.innerHTML = `
                /* Blindagem: Oculta APENAS os balões flutuantes principais quando fechados */
                fieldset.eproc-balao-flutuante:not(.aberto),
                body > #fldLembretes:not(.aberto),
                body > #fldMinutas:not(.aberto) {
                    display: none !important;
                }

                /* O fieldset interno de minutas do Eproc deve ser SEMPRE visível quando o balão estiver aberto */
                #fldMinutas.eproc-balao-flutuante.aberto .eproc-minutas-interno,
                #fldMinutas.eproc-balao-flutuante.aberto fieldset,
                #fldMinutas.eproc-balao-flutuante.aberto div[id^="conteudoMinutas"],
                #fldMinutas.eproc-balao-flutuante.aberto div[id^="conteudoInternoMinutas"] {
                    display: block !important;
                }

                #eproc-botoes-container,
                #eproc-botoes-compact-container { 
                    display: inline-flex !important; 
                    align-items: center !important; 
                    gap: 6px !important; 
                    margin: 0 0 0 6px !important; 
                    padding: 0 !important;
                    vertical-align: middle !important; 
                    height: 31px !important;
                    box-sizing: border-box !important;
                }

                body.eproc-compacto-lembretes #eproc-botoes-compact-container,
                body.eproc-compacto-lembretes #eproc-botoes-container {
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    height: 31px !important;
                    box-sizing: border-box !important;
                }

                .btn-custom-eproc { 
                    display: inline-flex !important; 
                    flex-direction: row !important; 
                    align-items: center !important; 
                    justify-content: center !important; 
                    text-align: center !important; 
                    gap: 4px !important; 
                    height: 31px !important; 
                    min-height: 31px !important;
                    max-height: 31px !important;
                    padding: 0 10px !important; 
                    margin: 0 !important;
                    font-size: 11px !important; 
                    font-weight: 800 !important; 
                    line-height: 1 !important; 
                    border-radius: 6px !important; 
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; 
                    cursor: pointer !important; 
                    transition: all 0.2s ease !important; 
                    text-transform: uppercase !important; 
                    user-select: none !important; 
                    box-sizing: border-box !important; 
                    vertical-align: middle !important;
                }

                .btn-custom-eproc span {
                    display: inline-block !important;
                    line-height: 1 !important;
                    vertical-align: middle !important;
                    transform: translateY(2px) !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                .btn-custom-eproc.sem-conteudo { background: #e2e8f0 !important; color: #64748b !important; border: 1px solid #cbd5e1 !important; cursor: pointer !important; }
                .btn-custom-eproc.com-lembrete { background: #22c55e !important; color: #ffffff !important; border: 1px solid #16a34a !important; cursor: pointer !important; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important; }
                .btn-custom-eproc.com-lembrete:hover { background: #16a34a !important; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important; }

                .btn-custom-eproc.com-minuta { background: #3b82f6 !important; color: #ffffff !important; border: 1px solid #2563eb !important; cursor: pointer !important; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important; }
                .btn-custom-eproc.com-minuta:hover { background: #2563eb !important; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important; }
                
                /* MODO COMPACTO: Botões transformados em pílulas quadradas de 31px com cor de fundo */
                body.eproc-compacto-lembretes .btn-custom-eproc {
                    width: 31px !important;
                    height: 31px !important;
                    min-width: 31px !important;
                    padding: 0 !important;
                    border-radius: 6px !important;
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
                }
                body.eproc-compacto-lembretes .btn-custom-eproc span {
                    display: none !important;
                }

                /* Balão Flutuante Base */
                .eproc-balao-flutuante { 
                    position: absolute !important; 
                    width: max-content !important; 
                    min-width: 200px !important; 
                    max-width: calc(100vw - 40px) !important; 
                    max-height: 80vh !important; 
                    overflow: auto !important; 
                    background: transparent !important; 
                    border: none !important; 
                    box-shadow: none !important; 
                    padding: 0 !important; 
                    z-index: 10000 !important; 
                    display: none !important; 
                    box-sizing: border-box !important; 
                }
                .eproc-balao-flutuante.aberto { 
                    display: flex !important; 
                    flex-direction: column !important; 
                    align-items: flex-start !important; 
                    margin-top: 0px !important; 
                }
                
                /* Lembrete usa a pílula */
                #fldLembretes.eproc-balao-flutuante legend { position: relative !important; top: 0px !important; left: 0 !important; transform: none !important; align-self: center !important; display: inline-flex !important; align-items: center !important; flex-wrap: nowrap !important; gap: 2px !important; background-color: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 6px !important; padding: 4px 8px !important; margin: 0 auto !important; width: max-content !important; min-width: max-content !important; white-space: nowrap !important; box-sizing: border-box !important; min-height: unset !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important; z-index: 10 !important; }

                /* MINUTAS: Balão Card Branco Limpo */
                #fldMinutas.eproc-balao-flutuante {
                    position: absolute !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
                    padding: 8px 10px !important;
                    z-index: 10000 !important;
                    box-sizing: border-box !important;
                    display: none !important;
                }
                #fldMinutas.eproc-balao-flutuante.aberto {
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: stretch !important;
                }

                /* Oculta apenas o legend do balão raiz (título duplicado) */
                #fldMinutas.eproc-balao-flutuante > legend {
                    display: none !important;
                }

                /* A barra de ações internas (Nova minuta, atualizar, assinar) */
                #fldMinutas.eproc-balao-flutuante fieldset legend,
                #fldMinutas.eproc-balao-flutuante .eproc-minutas-interno legend {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    font-size: 11px !important;
                    padding: 0 0 6px 0 !important;
                    margin: 0 0 6px 0 !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                    width: 100% !important;
                }

                #fldMinutas.eproc-balao-flutuante #legMinutasMaisMenos,
                #fldMinutas.eproc-balao-flutuante #legMinutasMaisMenos_0,
                #fldMinutas.eproc-balao-flutuante #imgMinutas,
                #fldMinutas.eproc-balao-flutuante #imgMinutas_0,
                #fldMinutas.eproc-balao-flutuante #carregandoMinutas,
                #fldMinutas.eproc-balao-flutuante #carregandoMinutas_0 {
                    display: none !important;
                }

                #fldMinutas.eproc-balao-flutuante .infraFieldset,
                #fldMinutas.eproc-balao-flutuante fieldset,
                #fldMinutas.eproc-balao-flutuante .eproc-minutas-interno {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    display: block !important;
                }

                #fldMinutas.eproc-balao-flutuante #conteudoMinutas,
                #fldMinutas.eproc-balao-flutuante div[id^="conteudoMinutas"],
                #fldMinutas.eproc-balao-flutuante div[id^="conteudoInternoMinutas"] {
                    display: block !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }

                #fldMinutas.eproc-balao-flutuante #conteudoMinutas > br {
                    display: none !important;
                }

                #fldMinutas.eproc-balao-flutuante table.infraTable,
                #fldMinutas.eproc-balao-flutuante table {
                    display: table !important;
                    margin: 0 0 8px 0 !important;
                    width: 100% !important;
                    min-width: 650px !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: none !important;
                    border-radius: 4px !important;
                }

                #fldMinutas.eproc-balao-flutuante tr {
                    display: table-row !important;
                }
                #fldMinutas.eproc-balao-flutuante th,
                #fldMinutas.eproc-balao-flutuante td {
                    display: table-cell !important;
                }

                #chkMinutasAbertas,
                small[for="chkMinutasAbertas"],
                label[for="chkMinutasAbertas"],
                [id*="chkMinutasAbertas"] {
                    display: none !important;
                }

                #gm-opcoes-minutas {
                    display: flex !important;
                    align-items: center !important;
                    gap: 16px !important;
                    margin-top: 4px !important;
                    margin-bottom: 2px !important;
                    padding: 2px 4px !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }

                .gm-chk-minuta-item {
                    display: inline-flex !important;
                    align-items: center !important;
                    gap: 6px !important;
                    font-size: 11px !important;
                    color: #475569 !important;
                    cursor: pointer !important;
                    user-select: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .gm-chk-minuta-item input[type="checkbox"] {
                    cursor: pointer !important;
                    margin: 0 !important;
                    width: 13px !important;
                    height: 13px !important;
                    accent-color: #2563eb !important;
                    vertical-align: middle !important;
                }

                .gm-chk-minuta-item span {
                    font-size: 11px !important;
                    color: #334155 !important;
                    font-weight: 500 !important;
                }

                .eproc-balao-flutuante.modo-sem-minuta table {
                    display: none !important;
                }
                .eproc-balao-flutuante.modo-sem-minuta {
                    min-width: auto !important;
                    width: max-content !important;
                    padding: 8px 12px !important;
                }
                .eproc-balao-flutuante.modo-sem-minuta #gm-opcoes-minutas {
                    margin: 0 !important;
                    padding: 0 !important;
                }

                #fldLembretes.eproc-balao-flutuante #imgLoadingLembretes, #fldLembretes.eproc-balao-flutuante legend > div[onclick] { display: none !important; }
                #fldLembretes.eproc-balao-flutuante legend.infraLegendObrigatorio a { display: inline-flex !important; align-items: center !important; margin: 0 !important; }
                #fldLembretes.eproc-balao-flutuante #divConteudoLembretes { display: flex !important; flex-wrap: wrap !important; align-items: flex-start !important; justify-content: flex-start !important; margin-top: 0px !important; width: auto !important; max-height: auto !important; overflow-y: auto !important; }
                #fldLembretes.eproc-balao-flutuante .divLembrete { flex: 0 0 350px !important; width: 350px !important; height: auto !important; min-height: unset !important; max-height: none !important; box-sizing: border-box !important; margin: 0 !important; margin-top: 0px !important; }
                
                a.btn-close, legend:not(#div-acoes-preferenciais legend) .dropdown.btn-group, #fldMinutas > #legMinutas, #conteudoMinutas > #legMinutas, #azflow-btn-pec, #divInfraBarraLocalizacao, body:not(.superproc-integracao-azflow) div[id^="azflow-filtro-"] { display: none !important; }
            `;
            document.head.appendChild(style);
        }

        function blindarFieldsets() {
            const fldsL = document.querySelectorAll('#fldLembretes');
            const fldsM = document.querySelectorAll('#fldMinutas');
            if (fldsL.length > 0 && !fldsL[0].classList.contains('eproc-balao-flutuante')) {
                fldsL[0].classList.add('eproc-balao-flutuante');
            }
            // O EPROC pode recarregar os lembretes num novo #fldLembretes; consolida no balão principal.
            for (let i = 1; i < fldsL.length; i++) {
                const origem = fldsL[i].querySelector('#divConteudoLembretes') || fldsL[i];
                const destino = fldsL[0].querySelector('#divConteudoLembretes') || fldsL[0];
                // O bloco mais recente é a fonte da verdade, inclusive quando veio vazio (lembrete excluído).
                destino.querySelectorAll('.divLembrete').forEach(el => el.remove());
                origem.querySelectorAll('.divLembrete').forEach(el => destino.appendChild(el));
                fldsL[i].remove();
            }
            if (fldsM.length > 0) {
                if (!fldsM[0].classList.contains('eproc-balao-flutuante')) {
                    fldsM[0].classList.add('eproc-balao-flutuante');
                }
                for (let i = 1; i < fldsM.length; i++) {
                    fldsM[i].classList.add('eproc-minutas-interno');
                    fldsM[i].classList.remove('eproc-balao-flutuante');
                }
            }
        }

        function obterContainerBotoes() {
            const isCompact = compacto.ativo();

            const containerId = isCompact ? 'eproc-botoes-compact-container' : 'eproc-botoes-container';
            let container = document.getElementById(containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = containerId;
            }
            // Troca de modo em tempo real: leva os botões do container do modo anterior para o atual.
            const containerAnterior = document.getElementById(isCompact ? 'eproc-botoes-container' : 'eproc-botoes-compact-container');
            if (containerAnterior && containerAnterior !== container) {
                while (containerAnterior.firstChild) container.appendChild(containerAnterior.firstChild);
                containerAnterior.remove();
            }

            const wrapBotoesMin = document.getElementById('superproc-min-botoes-wrap');
            const quickHover = document.getElementById('quick-hover-container');
            const botoesFlutuantes = document.querySelector('.botoes-flutuantes-container');

            if (wrapBotoesMin) {
                if (quickHover && quickHover.parentNode === wrapBotoesMin) {
                    if (container.previousSibling !== quickHover) {
                        wrapBotoesMin.insertBefore(container, quickHover.nextSibling);
                    }
                } else if (botoesFlutuantes && botoesFlutuantes.parentNode === wrapBotoesMin) {
                    if (container.previousSibling !== botoesFlutuantes) {
                        wrapBotoesMin.insertBefore(container, botoesFlutuantes.nextSibling);
                    }
                } else if (container.parentNode !== wrapBotoesMin) {
                    wrapBotoesMin.appendChild(container);
                }
            } else if (quickHover && quickHover.parentNode) {
                if (container.previousSibling !== quickHover) {
                    quickHover.parentNode.insertBefore(container, quickHover.nextSibling);
                }
            } else if (botoesFlutuantes && botoesFlutuantes.parentNode) {
                if (container.previousSibling !== botoesFlutuantes) {
                    botoesFlutuantes.parentNode.insertBefore(container, botoesFlutuantes.nextSibling);
                }
            } else {
                const juiz = document.querySelector('div[aria-label="Juiz(a)"]') || document.querySelector('div[role="region"][aria-label="Situação"]');
                if (juiz && juiz.parentNode && container.parentNode !== juiz.parentNode) {
                    juiz.parentNode.appendChild(container);
                }
            }

            return container;
        }

        function reposicionarBalao(fldBalao, btnTemp) {
            if (!fldBalao || !btnTemp || !fldBalao.classList.contains('aberto')) return;

            if (fldBalao.parentNode !== document.body) {
                document.body.appendChild(fldBalao);
            }

            const rectBtn = btnTemp.getBoundingClientRect();
            const btnCenter = rectBtn.left + (rectBtn.width / 2);

            const topOffset = 6;
            const topPos = rectBtn.bottom + topOffset + window.scrollY;

            const balaoWidth = fldBalao.offsetWidth || 220;
            const margin = 20;

            let leftPos = btnCenter - (balaoWidth / 2) + window.scrollX;
            const maxLeft = window.innerWidth - balaoWidth - margin + window.scrollX;
            const minLeft = margin + window.scrollX;

            if (leftPos > maxLeft) leftPos = maxLeft;
            if (leftPos < minLeft) leftPos = minLeft;

            fldBalao.style.top = `${topPos}px`;
            fldBalao.style.left = `${leftPos}px`;
        }

        function atualizarPosicaoBotoes() {
            const container = obterContainerBotoes();
            const btnLembrete = document.getElementById('btn-lembrete-custom-action');
            const btnMinuta = document.getElementById('btn-minuta-custom-action');
            
            if (btnLembrete && btnLembrete.parentNode !== container) {
                container.appendChild(btnLembrete);
            }
            if (btnMinuta && btnMinuta.parentNode !== container) {
                container.appendChild(btnMinuta);
            }
        }

            // ======================================================================
            // 4. DESMARCAR HISTÓRICO APENAS UMA VEZ NO CARREGAMENTO INICIAL
            // ======================================================================
            function desmarcarHistoricoInicial() {
                if (jaFezResetInicial) return;

                const chkExcluidas = document.getElementById('chkExibirExcluidas');
                const chkAnexadas = document.getElementById('chkExibirAnexadas');

                if (chkExcluidas || chkAnexadas) {
                    if (chkExcluidas) chkExcluidas.checked = false;
                    if (chkAnexadas) chkAnexadas.checked = false;
                    jaFezResetInicial = true;
                }
            }

            // ======================================================================
            // 5. ORGANIZADOR DE OPÇÕES DE MINUTAS (HISTÓRICO)
            // ======================================================================
            function moverOpcoesMinutasLocal() {
                const chkExcluidas = document.getElementById('chkExibirExcluidas');
                const chkAnexadas = document.getElementById('chkExibirAnexadas');
                const fldMinutas = document.getElementById('fldMinutas');
                const conteudoMinutas = document.getElementById('conteudoMinutas') || fldMinutas;
                if (!chkExcluidas || !conteudoMinutas) return;

                let container = document.getElementById('gm-opcoes-minutas');
                if (container && container.contains(chkExcluidas)) return;

                if (!container) {
                    container = document.createElement('div');
                    container.id = 'gm-opcoes-minutas';
                } else {
                    container.innerHTML = '';
                }

                // Item Excluídas
                const itemExcluidas = document.createElement('label');
                itemExcluidas.className = 'gm-chk-minuta-item';
                itemExcluidas.appendChild(chkExcluidas);
                const spanExcluidas = document.createElement('span');
                spanExcluidas.textContent = 'Exibir Excluídas/Anuladas';
                itemExcluidas.appendChild(spanExcluidas);
                container.appendChild(itemExcluidas);

                // Item Anexadas
                if (chkAnexadas) {
                    const itemAnexadas = document.createElement('label');
                    itemAnexadas.className = 'gm-chk-minuta-item';
                    itemAnexadas.appendChild(chkAnexadas);
                    const spanAnexadas = document.createElement('span');
                    spanAnexadas.textContent = 'Exibir Anexadas ao Processo';
                    itemAnexadas.appendChild(spanAnexadas);
                    container.appendChild(itemAnexadas);
                }

                // Spinner de carregamento do eproc
                const loader = document.getElementById('carregandoMinutasRodape');
                if (loader) {
                    container.appendChild(loader);
                }

                conteudoMinutas.appendChild(container);

                // Remove textos soltos ou tags small/label antigas do eproc que sobraram
                document.querySelectorAll('small[for="chkExibirExcluidas"], small[for="chkExibirAnexadas"], label[for="chkExibirExcluidas"], label[for="chkExibirAnexadas"]').forEach(el => {
                    if (!container.contains(el)) el.remove();
                });
            }

            // ======================================================================
            // 6. ATUALIZADOR EM TEMPO REAL DE MINUTAS
            // ======================================================================
            function atualizarEstadoMinutasDinamico() {
                const fldMinutas = document.getElementById('fldMinutas');
                if (!fldMinutas) return;

                assegurarAberturaEprocMinutas();
                desmarcarHistoricoInicial();
                moverOpcoesMinutasLocal();

                const chkExcluidas = document.getElementById('chkExibirExcluidas');
                const chkAnexadas = document.getElementById('chkExibirAnexadas');
                const historicoAtivo = (chkExcluidas && chkExcluidas.checked) || (chkAnexadas && chkAnexadas.checked);

                const temMinutaAtiva = contarMinutasAtivas(fldMinutas) > 0;

                const btnMinuta = document.getElementById('btn-minuta-custom-action');
                if (btnMinuta) {
                    // A cor reflete só minutas ativas; o histórico apenas mantém a tabela visível.
                    btnMinuta.title = temMinutaAtiva ? 'Minutas (com minutas ativas)' : 'Minutas (sem minuta ativa)';
                    const estadoAtual = btnMinuta.getAttribute('data-estado-atual');
                    const novoEstado = temMinutaAtiva ? 'com' : 'sem';

                    if (estadoAtual !== novoEstado) {
                        if (novoEstado === 'com') {
                            btnMinuta.className = 'btn-custom-eproc com-minuta';
                            btnMinuta.innerHTML = '<span>MINUTAS</span>';
                        } else {
                            btnMinuta.className = 'btn-custom-eproc sem-conteudo';
                            btnMinuta.innerHTML = '<span>MINUTAS</span>';
                        }
                        btnMinuta.setAttribute('data-estado-atual', novoEstado);
                    }
                }

                // Se houver minuta ativa ou o usuário filtrou por histórico, exibe a tabela.
                // Se não houver, oculta apenas a tabela via CSS mas mantém o balão com os checkboxes funcional!
                if (temMinutaAtiva || historicoAtivo) {
                    fldMinutas.classList.remove('modo-sem-minuta');
                } else {
                    fldMinutas.classList.add('modo-sem-minuta');
                }

                if (fldMinutas.classList.contains('aberto') && btnMinuta) {
                    setTimeout(() => reposicionarBalao(fldMinutas, btnMinuta), 50);
                }
            }

            // ======================================================================
            // 7. FUNÇÕES PARA FECHAR OS BALÕES COM SEGURANÇA
            // ======================================================================
            function fecharBalaoLembretes() {
                clearTimeout(timeoutLembreteOpen);
                clearTimeout(timeoutLembreteClose);
                const fldBalao = document.getElementById('fldLembretes');
                if (fldBalao) {
                    fldBalao.classList.remove('aberto');
                    fldBalao.style.display = 'none';
                }
            }

            function fecharBalaoMinutas() {
                clearTimeout(timeoutMinutaOpen);
                clearTimeout(timeoutMinutaClose);
                const fldBalao = document.getElementById('fldMinutas');
                if (fldBalao) {
                    fldBalao.classList.remove('aberto');
                    fldBalao.style.display = 'none';
                }
            }

            // ======================================================================
            // 8. EVENTO GLOBAL PARA FECHAR OS BALÕES AO CLICAR FORA OU EM AÇÕES
            // ======================================================================
            document.addEventListener('click', function(e) {
                const path = e.composedPath ? e.composedPath() : [];
                const isClickInsideLembrete = e.target.closest('#fldLembretes') || e.target.closest('#btn-lembrete-custom-action') || path.some(el => el && (el.id === 'fldLembretes' || el.id === 'btn-lembrete-custom-action'));
                const isClickInsideMinuta = e.target.closest('#fldMinutas') || e.target.closest('#btn-minuta-custom-action') || path.some(el => el && (el.id === 'fldMinutas' || el.id === 'btn-minuta-custom-action'));

                // Clique fora de ambos os menus: fecha ambos
                if (!isClickInsideLembrete && !isClickInsideMinuta) {
                    fecharBalaoLembretes();
                    fecharBalaoMinutas();
                    return;
                }

                // Clique dentro do balão de Minutas:
                // Permite interação livre com minutas (editar, abrir opções, assinar, visualizar, alterar dados).
                // NÃO fecha o balão para que o clique não cancele a abertura do editor ou menu de opções.
                if (isClickInsideMinuta) {
                    fecharBalaoLembretes();
                }

                // Clique dentro do balão de Lembretes:
                // Se clicou em "+ Novo", "Customizado" ou ícone de ação em post-it (editar/excluir),
                // fecha o balão imediatamente para não cobrir o formulário ou modal que surge abaixo.
                if (isClickInsideLembrete) {
                    fecharBalaoMinutas();
                    const el = e.target;
                    const ehAcaoLembrete = el.closest('#fldLembretes a, #fldLembretes button, #fldLembretes [onclick], #fldLembretes [role="button"], #fldLembretes .divLembreteIcone, #fldLembretes .divLembreteAcoes, #fldLembretes [id*="btnNovoLembrete"]');
                    const ehFormOuInput = el.closest('input, textarea, select, label');
                    if (ehAcaoLembrete && !ehFormOuInput) {
                        fecharBalaoLembretes();
                    }
                }
            });

            function fldBaloesAtivos(fld, btn) {
                if (!fld && !btn) return false;
                try {
                    const fldHover = fld && fld.matches(':hover');
                    const btnHover = btn && btn.matches(':hover');
                    return !!(fldHover || btnHover);
                } catch (e) {
                    return false;
                }
            }

            // Monitora iframes e perda de foco para fechar os balões suspensos quando modais forem abertos
            function monitorarIframesEModais() {
                document.querySelectorAll('iframe').forEach(ifr => {
                    if (!ifr.dataset.superprocWatchBalao) {
                        ifr.dataset.superprocWatchBalao = 'true';
                        ifr.addEventListener('mouseenter', () => {
                            fecharBalaoLembretes();
                            fecharBalaoMinutas();
                        });
                    }
                });
            }

            window.addEventListener('blur', () => {
                fecharBalaoLembretes();
                fecharBalaoMinutas();
            });

            // ======================================================================
            // 9. LÓGICA DE LEMBRETES
            // ======================================================================
            // Item real = conectado, com texto e não ocultado pelo EPROC dentro do balão.
            function itemReal(el, fld) {
                if (!el || !el.isConnected) return false;
                if (!(el.textContent || '').trim()) return false;
                for (let n = el; n && n !== fld; n = n.parentElement) {
                    if (n.hidden || (n.style && (n.style.display === 'none' || n.style.visibility === 'hidden'))) return false;
                }
                return true;
            }

            function contarLembretes() {
                const fld = document.getElementById('fldLembretes');
                if (!fld) return 0;
                return [...fld.querySelectorAll('.divLembrete')].filter(el => itemReal(el, fld)).length;
            }

            function contarMinutasAtivas(fldMinutas) {
                const linhas = fldMinutas.querySelectorAll('table.infraTable tr.infraTrClara, table.infraTable tr.infraTrEscura, .linkMinuta');
                const vistas = new Set();
                let total = 0;
                linhas.forEach(el => {
                    const linha = el.closest('tr') || el;
                    if (vistas.has(linha)) return;
                    vistas.add(linha);
                    if (!itemReal(linha, fldMinutas)) return;
                    // Linhas do histórico (excluídas/anexadas) não contam como minuta ativa.
                    if (/exclu[íi]d[ao]|anexad[ao]/i.test(linha.textContent || '')) return;
                    total++;
                });
                return total;
            }

            function gerenciarLembretes() {
                const container = obterContainerBotoes();
                let btnTemp = document.getElementById('btn-lembrete-custom-action');
                if (!btnTemp) {
                    btnTemp = document.createElement('div'); 
                    btnTemp.id = 'btn-lembrete-custom-action';
                    btnTemp.className = 'btn-custom-eproc sem-conteudo';
                    btnTemp.innerHTML = '<span>LEMBRETES</span>';
                    btnTemp.title = 'Lembretes';
                    container.appendChild(btnTemp);

                    btnTemp.addEventListener('mouseenter', () => {
                        clearTimeout(timeoutLembreteClose);
                        fecharBalaoMinutas();

                        timeoutLembreteOpen = setTimeout(() => {
                            const fldBalao = document.getElementById('fldLembretes');
                            if (!fldBalao) return;
                            const temConteudo = fldBalao.querySelectorAll('.divLembrete').length > 0;
                            fldBalao.style.display = 'flex'; 
                            fldBalao.style.visibility = 'hidden'; 
                            fldBalao.classList.add('aberto');
                            
                            const divConteudo = fldBalao.querySelector('#divConteudoLembretes'); 
                            if (divConteudo) {
                                divConteudo.style.display = temConteudo ? 'flex' : 'none';
                            }
                            
                            reposicionarBalao(fldBalao, btnTemp);
                            fldBalao.style.visibility = 'visible';
                        }, 300);
                    });

                    btnTemp.addEventListener('mouseleave', () => {
                        clearTimeout(timeoutLembreteOpen);
                        timeoutLembreteClose = setTimeout(() => { 
                            const fldBalao = document.getElementById('fldLembretes');
                            if (fldBalao && !fldBaloesAtivos(fldBalao, btnTemp)) {
                                fecharBalaoLembretes(); 
                            }
                        }, 250);
                    });

                    btnTemp.addEventListener('click', (e) => {
                        e.stopPropagation();
                        clearTimeout(timeoutLembreteOpen);
                        clearTimeout(timeoutLembreteClose);
                        const fldBalao = document.getElementById('fldLembretes');
                        if (!fldBalao) return;
                        const jaAberto = fldBalao.classList.contains('aberto');
                        fecharBalaoMinutas();
                        if (jaAberto) {
                            fecharBalaoLembretes();
                        } else {
                            const temConteudo = fldBalao.querySelectorAll('.divLembrete').length > 0;
                            fldBalao.style.display = 'flex'; 
                            fldBalao.style.visibility = 'hidden'; 
                            fldBalao.classList.add('aberto');
                            
                            const divConteudo = fldBalao.querySelector('#divConteudoLembretes'); 
                            if (divConteudo) {
                                divConteudo.style.display = temConteudo ? 'flex' : 'none';
                            }
                            
                            reposicionarBalao(fldBalao, btnTemp);
                            fldBalao.style.visibility = 'visible';
                        }
                    });
                } else if (btnTemp.parentNode !== container) {
                    container.appendChild(btnTemp);
                }

                const fldBalao = document.getElementById('fldLembretes');
                if (fldBalao) {
                    fldBalao.classList.add('eproc-balao-flutuante');
                    if (!fldBalao.dataset.superprocEventsAttached) {
                        fldBalao.dataset.superprocEventsAttached = 'true';
                        fldBalao.addEventListener('mouseenter', () => {
                            clearTimeout(timeoutLembreteClose);
                        });
                        fldBalao.addEventListener('mouseleave', () => { 
                            clearTimeout(timeoutLembreteOpen);
                            timeoutLembreteClose = setTimeout(() => { 
                                const btn = document.getElementById('btn-lembrete-custom-action');
                                if (!fldBaloesAtivos(fldBalao, btn)) {
                                    fecharBalaoLembretes();
                                }
                            }, 250); 
                        });
                    }
                }

                blindarFieldsets();
                const temConteudo = contarLembretes() > 0;
                if (btnTemp) {
                    btnTemp.title = temConteudo ? 'Lembretes (com conteúdo)' : 'Lembretes (vazio)';
                    const novoEstado = temConteudo ? 'com' : 'sem';
                    if (btnTemp.getAttribute('data-estado-atual') !== novoEstado) {
                        btnTemp.className = temConteudo ? 'btn-custom-eproc com-lembrete' : 'btn-custom-eproc sem-conteudo';
                        btnTemp.innerHTML = '<span>LEMBRETES</span>';
                        btnTemp.setAttribute('data-estado-atual', novoEstado);
                    }
                }
            }

            // ======================================================================
            // 10. LÓGICA DE MINUTAS
            // ======================================================================
            function gerenciarMinutas() {
                const container = obterContainerBotoes();
                let btnTemp = document.getElementById('btn-minuta-custom-action');
                if (!btnTemp) {
                    btnTemp = document.createElement('div'); 
                    btnTemp.id = 'btn-minuta-custom-action';
                    btnTemp.className = 'btn-custom-eproc sem-conteudo';
                    btnTemp.innerHTML = '<span>MINUTAS</span>';
                    btnTemp.title = 'Minutas';
                    container.appendChild(btnTemp);

                    function abrirBalaoMinutas(forcarReq = false) {
                        const fldBalao = document.getElementById('fldMinutas');
                        if (!fldBalao) return;
                        blindarFieldsets();
                        atualizarEstadoMinutasDinamico();
                        fldBalao.style.display = 'flex'; 
                        fldBalao.style.visibility = 'hidden'; 
                        fldBalao.classList.add('aberto');

                        fldBalao.querySelectorAll('div[id^="conteudoMinutas"], div[id^="conteudoInternoMinutas"], .eproc-minutas-interno, fieldset').forEach(c => {
                            c.style.display = 'block';
                        });
                        
                        reposicionarBalao(fldBalao, btnTemp);
                        fldBalao.style.visibility = 'visible';

                        // Sempre que abrir o balão de minutas, requisita atualização ao eproc para carregar novos docs
                        requisitarAtualizacaoMinutasEproc(forcarReq);
                    }

                    btnTemp.addEventListener('mouseenter', () => {
                        clearTimeout(timeoutMinutaClose);
                        fecharBalaoLembretes();

                        // Antecipa a requisição já no hover do mouse
                        requisitarAtualizacaoMinutasEproc();

                        timeoutMinutaOpen = setTimeout(() => {
                            abrirBalaoMinutas();
                        }, 300);
                    });

                    btnTemp.addEventListener('mouseleave', () => {
                        clearTimeout(timeoutMinutaOpen);
                        timeoutMinutaClose = setTimeout(() => { 
                            const fldBalao = document.getElementById('fldMinutas');
                            if (fldBalao && !fldBaloesAtivos(fldBalao, btnTemp)) {
                                fecharBalaoMinutas(); 
                            }
                        }, 250);
                    });

                    btnTemp.addEventListener('click', (e) => {
                        e.stopPropagation();
                        clearTimeout(timeoutMinutaOpen);
                        clearTimeout(timeoutMinutaClose);
                        const fldBalao = document.getElementById('fldMinutas');
                        if (!fldBalao) return;
                        const jaAberto = fldBalao.classList.contains('aberto');
                        fecharBalaoLembretes();
                        if (jaAberto) {
                            fecharBalaoMinutas();
                        } else {
                            abrirBalaoMinutas(true);
                        }
                    });
                } else if (btnTemp.parentNode !== container) {
                    container.appendChild(btnTemp);
                }

                const fldBalao = document.getElementById('fldMinutas');
                if (fldBalao) {
                    fldBalao.classList.add('eproc-balao-flutuante');
                    if (!fldBalao.dataset.superprocEventsAttached) {
                        fldBalao.dataset.superprocEventsAttached = 'true';
                        fldBalao.addEventListener('mouseenter', () => {
                            clearTimeout(timeoutMinutaClose);
                        });
                        fldBalao.addEventListener('mouseleave', () => { 
                            clearTimeout(timeoutMinutaOpen);
                            timeoutMinutaClose = setTimeout(() => { 
                                const btn = document.getElementById('btn-minuta-custom-action');
                                if (!fldBaloesAtivos(fldBalao, btn)) {
                                    fecharBalaoMinutas();
                                }
                            }, 250); 
                        });

                        fldBalao.addEventListener('change', (e) => {
                            if (e.target.id === 'chkExibirExcluidas' || e.target.id === 'chkExibirAnexadas') {
                                atualizarEstadoMinutasDinamico();
                            }
                        });
                    }
                }

                atualizarEstadoMinutasDinamico();
            }

            function gerenciarBaloes() {
                assegurarAberturaEprocMinutas();
                gerenciarLembretes();
                gerenciarMinutas();
                atualizarPosicaoBotoes();
                monitorarIframesEModais();
            }

            gerenciarBaloes();

            let debounceTimer;
            const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(gerenciarBaloes, 300);
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // Exclusões no EPROC podem só ocultar (style/class/hidden) ou esvaziar o texto do item,
            // sem remover nós. Observa isso dentro dos balões para detectar "tinha, não tem mais".
            // Só aciona as rotinas completas se o estado (com/sem) divergir do botão, evitando laços.
            function sincronizarSeMudou() {
                const btnL = document.getElementById('btn-lembrete-custom-action');
                if (btnL && btnL.getAttribute('data-estado-atual') !== (contarLembretes() > 0 ? 'com' : 'sem')) gerenciarLembretes();
                const fldM = document.getElementById('fldMinutas');
                const btnM = document.getElementById('btn-minuta-custom-action');
                if (fldM && btnM && btnM.getAttribute('data-estado-atual') !== (contarMinutasAtivas(fldM) > 0 ? 'com' : 'sem')) atualizarEstadoMinutasDinamico();
            }
            let debounceEstado;
            const reavaliarEstado = () => {
                clearTimeout(debounceEstado);
                debounceEstado = setTimeout(sincronizarSeMudou, 200);
            };
            const estadoObserver = new MutationObserver(reavaliarEstado);
            const balõesObservados = new WeakSet();
            function observarBaloes() {
                document.querySelectorAll('#fldLembretes, #fldMinutas').forEach(fld => {
                    if (balõesObservados.has(fld)) return;
                    balõesObservados.add(fld);
                    estadoObserver.observe(fld, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
                });
            }
            observarBaloes();
            new MutationObserver(observarBaloes).observe(document.body, { childList: true, subtree: true });

            // Rede de segurança barata: reconfere o estado a cada 2s com a aba visível.
            setInterval(() => {
                if (document.visibilityState === 'visible') sincronizarSeMudou();
            }, 2000);

            const classObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'class') {
                        atualizarPosicaoBotoes();
                    }
                });
            });
            classObserver.observe(document.body, { attributes: true });

            if (!window.__superprocMinutasFocusAttached) {
                window.__superprocMinutasFocusAttached = true;
                window.addEventListener('focus', () => {
                    setTimeout(() => { gerenciarLembretes(); atualizarEstadoMinutasDinamico(); }, 300);
                    const fldBalao = document.getElementById('fldMinutas');
                    if (fldBalao && fldBalao.classList.contains('aberto')) {
                        requisitarAtualizacaoMinutasEproc();
                    }
                });
            }

            let tentativas = 0;
            function tentar() {
                blindarFieldsets();
                gerenciarBaloes();
                if (tentativas < 25) {
                    tentativas++;
                    setTimeout(tentar, 200);
                }
            }
            tentar();
        }
    };
