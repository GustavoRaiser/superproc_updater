/**
 * SuperPROC - Módulo: Capa - Partes e Advogados
 *
 * Funcionalidades:
 * 1. Exibição dual das partes: Modo Hover (Moderno) e Modo Fixo (Tabela Nativa).
 * 2. Alternância dinâmica através do checkbox pin/fixar na barra de ferramentas.
 * 3. Badges para Justiça Gratuita (JG) e Óbito.
 * 4. Caixa e atalhos para OAB dos advogados com filtro na timeline de eventos.
 * 5. Espelhamento do motor de consulta CPF/CNPJ e botões de ação/AZFlow.
 * 6. Persistência de preferência de visualização no localStorage.
 */

export default {
    id: 'capa_partes',
    name: 'Capa - Partes e Advogados',
    category: 'Capa do Processo',
    description: 'Exibição inteligente das partes e advogados com visual moderno/hover ou tabelas nativas via fixação, OAB, JG e ferramentas rápidas.',
    defaultEnabled: false,

    matches: (url, params) => params.get('acao') === 'processo_selecionar',

    async init() {
        if (window.__superprocCapaPartesInjetado) return;
        window.__superprocCapaPartesInjetado = true;

        function executar() {


    if (document.getElementById('container-partes-smart')) return;

    // ============================================================
    // 1. INJEÇÃO DE CSS
    // ============================================================
    const customStyles = document.createElement('style');
    customStyles.innerHTML = `
        @keyframes fadeInSmart { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        
        .nome-parte-smart {
            font-size: 1.1rem !important; 
            font-weight: 900 !important;
            text-rendering: optimizeLegibility !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-shadow: 0px 0px 1px rgba(0, 0, 0, 0.1) !important;
            letter-spacing: 0.1px !important;
        }

        .badge-jg-smart {
            background-color: #28a745;
            color: #ffffff;
            font-size: 0.6rem !important;
            font-weight: bold;
            padding: 0px 6px;
            border-radius: 3px;
            margin-left: 6px;
            cursor: help;
            box-shadow: 0px 1px 2px rgba(0,0,0,0.2);
            flex-shrink: 0;
        }

        .badge-obito-smart {
            background-color: #000000;
            color: #ffffff;
            font-size: 0.75rem !important;
            font-weight: bold;
            padding: 1px 5px;
            border-radius: 3px;
            margin-right: 6px;
            cursor: help;
            box-shadow: 0px 1px 2px rgba(0,0,0,0.3);
            flex-shrink: 0;
            align-items: center;
            justify-content: center;
        }

        .caixa-oab-smart {
             background: #e9ecef; 
             color: #495057; 
             font-size: 0.88em !important; 
             padding: 1px 6px; 
             border-radius: 3px; 
             font-weight: bold; 
             white-space: nowrap; 
             border: 1px solid #ced4da; 
             display: flex; 
             align-items: center; 
             justify-content: center; 
             min-width: 80px; 
             text-align: center; 
             letter-spacing: 0.5px;
             cursor: pointer;
             transition: background 0.2s, color 0.2s;
        }
        
        .caixa-oab-smart:hover {
             background: #0056b3;
             color: #ffffff;
             border-color: #0056b3;
        }

        .cpf-cnpj-texto {
            font-size: 0.82rem !important;
            color: #495057 !important;
            font-weight: normal !important;
        }
        
        .cpf-cnpj-texto img {
            vertical-align: middle;
            max-height: 14px;
        }

        .tag-papel-smart {
            font-size: 0.6rem;
            color: #fff;
            background: #6c757d;
            padding: 1px 6px;
            border-radius: 8px;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
            display: inline-block;
            margin-top: 2px;
        }

        .popover.smart-popover-original {
            visibility: hidden !important;
            pointer-events: none !important;
        }
        
        html.smart-situacao-active .popover {
            visibility: hidden !important;
        }
        
        html.smart-situacao-active .popover.smart-popover-original {
            visibility: visible !important;
            pointer-events: auto !important;
            position: fixed !important;
            transform: none !important;
            z-index: 999999 !important;
        }

        .popover { z-index: 999999 !important; }
        .popover.show { opacity: 1 !important; }
        .popover-body { color: #212529 !important; background-color: #fff !important; }

        .situacao-smart-wrapper {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 4px;
        }
        .situacao-smart-wrapper button {
            border: 0 !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            line-height: 1 !important;
            cursor: pointer !important;
        }
        
        /* CRIA O ESPAÇO SEGURO NA DIREITA SEM MEXER NA ESTRUTURA */
        #container-partes-smart {
            padding-right: 66px;
        }
        
        /* MENU FLUTUANTE DE FERRAMENTAS SMART EM ATÉ 3 COLUNAS */
        .ferramentas-partes-smart {
            position: absolute;
            top: 0px; 
            right: -8px;
            height: 100%;
            display: grid;
            grid-template-columns: repeat(3, 18px);
            grid-auto-rows: 18px;
            gap: 6px;
            align-content: center;
            justify-items: center;
            align-items: center;
            z-index: 10;
        }
        .ferramentas-partes-smart a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            line-height: 1;
            transition: transform 0.2s;
        }
        .ferramentas-partes-smart a:hover {
            opacity: 1;
            transform: scale(1.15);
        }
        .ferramentas-partes-smart a img {
            width: 15px !important;
            height: 15px !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
        }
        .chk-fixar-smart {
            cursor: pointer;
            width: 18px;
            height: 18px;
            accent-color: #0056b3;
            margin: 0 !important; /* Margem zerada para o checkbox ficar 100% alinhado com os ícones */
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        .chk-fixar-smart:hover {
            opacity: 1;
        }
        .ferramentas-partes-smart a i.material-icons {
            font-size: 1.3em !important;
            line-height: 1 !important;
        }
    `;
    document.head.appendChild(customStyles);

    const fldOriginal = document.getElementById('fldPartes');
    const fldCapa = document.getElementById('fldCapa');
    
    if (!fldOriginal || !fldCapa) return;
    
    const tablesOriginais = Array.from(fldOriginal.querySelectorAll('table.infraTable'));
    if (tablesOriginais.length === 0) return;

    const escapeHtml = (value) => {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    // ----------------------------------------------------
    // EXTRAÇÃO INTELIGENTE E ROBUSTA DE DADOS
    // ----------------------------------------------------
    const extrairDados = (celula) => {
        if (!celula) return null;
        
        const nomeLink = celula.querySelector('.infraNomeParte');
        if (!nomeLink) return null;
        
        const procLink = celula.querySelector('a[href*="processo_parte_procurador_procuracao_listar"]');
        const procHref = procLink && procLink.hasAttribute('href') ? procLink.getAttribute('href') : '#';
        const procTitle = procLink?.querySelector('.material-icons-outlined')?.getAttribute('title') || 'Verificar Procuração';

        const histLink = celula.querySelector('a[href*="substabelecimento_historico_listar_subfrm"]');
        const histHtml = histLink ? histLink.outerHTML : '';

        const semProcuradorDiv = Array.from(celula.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.includes('Citado e sem Procurador')) ||
                                 (celula.querySelector('span:not([id]), div:not([id])') && Array.from(celula.querySelectorAll('*')).find(el => el.textContent.includes('Citado e sem Procurador')));

        const hasJG = !!celula.querySelector('.flag-justica-gratuita');

        const textContentAll = celula.textContent || '';
        
        // Extração de Sucessor
        const matchSucessor = textContentAll.match(/\((Sucessor|Sucessão|Inventariante|Espólio|Espolio|Herdeiro)\s*\)/i);
        const tagSucessor = matchSucessor ? matchSucessor[0].trim().replace(/\s+\)/, ')') : '';
        const matchRepresentacao = textContentAll.match(/\(\s*(Representante|Representado|Representada)\s*\)/i);
        const representacao = matchRepresentacao ? matchRepresentacao[1] : '';
        
        // Extração da Idade
        let idadeText = '';
        const matchIdade = textContentAll.match(/\((\d+\s*anos?)\)/i);
        if (matchIdade) {
            idadeText = matchIdade[1];
        }

        let isObito = false;
        const cellTextLower = (celula.innerText || celula.textContent || '').toLowerCase();
        if (cellTextLower.includes('espólio') || cellTextLower.includes('espolio') || cellTextLower.includes('sucessão')) {
            isObito = true;
        }

        const tooltips = celula.querySelectorAll('[title], [data-original-title], [alt], [data-content]');
        tooltips.forEach(el => {
            const text = ((el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-original-title') || '') + ' ' + (el.getAttribute('alt') || '') + ' ' + (el.getAttribute('data-content') || '')).toLowerCase();
            if (text.includes('óbito') || text.includes('obito') || text.includes('falecido')) isObito = true;
        });

        const advs = [];
        const sociedades = [];
        
        const cellText = celula.innerText || celula.textContent || '';
        const regexSociedade = /\(([^)]+?)\s*[\/\-]\s*([A-Z]{2}\d+)\)/gi;
        let matchSoc;
        while ((matchSoc = regexSociedade.exec(cellText)) !== null) {
            const nomeSoc = matchSoc[1].trim();
            const oabSoc = matchSoc[2].toUpperCase();
            if (nomeSoc.toLowerCase() !== 'oab' && nomeSoc.length > 3 && !sociedades.some(s => s.oab === oabSoc)) {
                sociedades.push({ nome: nomeSoc, oab: oabSoc, isSociedade: true, href: '#' });
            }
        }

        const linksNaCelula = Array.from(celula.querySelectorAll('a'));
        const linksAdvogados = linksNaCelula.filter(a => {
            if (a.classList.contains('infraNomeParte')) return false;
            if (a.querySelector('img')) return false;
            if (a.closest('a[href*="processo_parte_procurador_procuracao_listar"]')) return false;
            if (a.closest('a[href*="substabelecimento_historico_listar_subfrm"]')) return false;
            
            const textoA = a.innerText.trim().toUpperCase();
            // Estes rótulos descrevem a parte, não um procurador.
            if (/^\(?\s*REPRESENTANTE\s*\)?$|^\(?\s*REPRESENTAD[OA]\s*\)?$/.test(textoA)) return false;
            if (textoA.includes('SUCESSOR') || textoA.includes('SUCESSÃO') || textoA.includes('HERDEIRO') || textoA.includes('INVENTARIANTE') || textoA.includes('ESPÓLIO') || textoA.includes('ESPOLIO')) return false;
            if (a.getAttribute('href') && a.getAttribute('href').includes('sociedade')) return false;
            
            if (!textoA || textoA.length < 3) return false;
            if (/^[A-Z]{2}\d+$/.test(textoA.replace(/\s/g, ''))) return false;
            
            return true;
        });

        for (let i = 0; i < linksAdvogados.length; i++) {
            const linkAdv = linksAdvogados[i];
            let nomeAdv = linkAdv.innerText.trim();

            let oabTexto = '';
            let sibling = linkAdv.nextSibling;
            
            while (sibling) {
                const textSib = sibling.nodeType === Node.TEXT_NODE ? sibling.textContent : (sibling.innerText || '');
                const matchOab = textSib.match(/([A-Z]{2}\d+)/i);
                if (matchOab) {
                    oabTexto = matchOab[1].toUpperCase();
                    break;
                }
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === 'A') {
                    const textIrmao = sibling.innerText.trim().toUpperCase();
                    if (/^[A-Z]{2}\d+$/.test(textIrmao.replace(/\s/g, ''))) {
                        oabTexto = textIrmao.replace(/\s/g, '');
                    }
                    break;
                }
                sibling = sibling.nextSibling;
            }

            if (!oabTexto) {
                const parentText = linkAdv.parentElement ? linkAdv.parentElement.innerText : '';
                const regexOabGen = new RegExp(nomeAdv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*([A-Z]{2}\\d+)', 'i');
                const matchGen = parentText.match(regexOabGen);
                if (matchGen) {
                    oabTexto = matchGen[1].toUpperCase();
                }
            }

            nomeAdv = nomeAdv.replace(/[A-Z]{2}\d+/gi, '').trim();
            if (nomeAdv.length < 3) continue;

            if (advs.some(ad => ad.nome.toUpperCase() === nomeAdv.toUpperCase())) continue;

            advs.push({
                nome: nomeAdv,
                href: linkAdv.hasAttribute('href') ? linkAdv.getAttribute('href') : '#',
                oab: oabTexto
            });
        }
        
        advs.push(...sociedades);

        const docSpanNode = celula.querySelector('span[id^="spnCpfParte"]');
        let cpfCnpjTexto = '';
        if (docSpanNode) {
            const clone = docSpanNode.cloneNode(true);
            cpfCnpjTexto = clone.innerHTML.trim();
        } else {
            const celulaClone = celula.cloneNode(true);
            ['.infraNomeParte', 'button', 'a', '.flag-justica-gratuita'].forEach(sel => {
                celulaClone.querySelectorAll(sel).forEach(el => el.remove());
            });
            const textoLivre = celulaClone.innerHTML.replace(/<br\s*[\/]?>/gi, ' ').trim();
            const matchCpf = textoLivre.match(/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
            if (matchCpf) {
                cpfCnpjTexto = matchCpf[0];
                if (celulaClone.innerHTML.includes('checked') || celulaClone.innerHTML.includes('ok') || celula.querySelector('img[src*="ok"], img[src*="check"], span.text-success, font[color="green"]')) {
                    cpfCnpjTexto += ' <span style="color: #28a745; font-weight: bold;">✓</span>';
                }
            }
        }

        const btnSituacao = celula.querySelector('button[id^="spnConsultaSituacao"]');

        return {
            originalTd: celula,
            nome: nomeLink.innerText.trim(),
            urlConsulta: nomeLink.hasAttribute('href') ? nomeLink.getAttribute('href') : '#',
            hasJG: hasJG,
            tagSucessor: tagSucessor,
            representacao: representacao,
            idadeText: idadeText,
            isObito: isObito,      
            procuracaoHref: procHref,
            procuracaoTitle: procTitle,
            historicoHtml: histHtml,
            avisoSemProcurador: (semProcuradorDiv ? semProcuradorDiv.textContent.trim() : (celula.textContent.includes('Citado e sem Procurador') ? 'Citado e sem Procurador' : '')),
            advogados: advs,
            cpfCnpjTexto: cpfCnpjTexto,
            btnSituacao: btnSituacao
        };
    };

    // ----------------------------------------------------
    // MOTOR DE LEITURA DAS COLUNAS
    // ----------------------------------------------------
    const autores = [];
    const reus = [];
    const terceiros = [];
    let contAutor = 0, contReu = 0, contTerceiro = 0;

    const partesNodos = Array.from(fldOriginal.querySelectorAll('.infraNomeParte'));
    partesNodos.forEach(nodo => {
        const td = nodo.closest('td');
        if(!td || td.dataset.processado) return; 
        td.dataset.processado = "1";

        const tr = td.closest('tr');
        if(!tr) return;

        let prevTr = tr.previousElementSibling;
        let mode = 'DUAL';
        let papel = 'TERCEIRO';

        while(prevTr) {
            const ths = prevTr.querySelectorAll('th');
            if(ths.length > 0) {
                const textCheck = ths[0].textContent.trim();
                if(textCheck !== '' && textCheck !== 'Partes e Representantes') {
                    if(ths.length >= 2) mode = 'DUAL';
                    else if (ths.length === 1) { mode = 'SINGLE'; papel = ths[0].textContent.replace(/[▲▼]/g, '').trim(); }
                    break;
                }
            }
            prevTr = prevTr.previousElementSibling;
        }

        const dados = extrairDados(td);
        if(!dados || dados.nome === 'Nome não encontrado') return;

        if (mode === 'DUAL') {
            if (td.cellIndex === 0) { dados.uniqueId = `autor-${contAutor++}`; autores.push(dados); } 
            else { dados.uniqueId = `reu-${contReu++}`; reus.push(dados); }
        } else {
            dados.uniqueId = `terceiro-${contTerceiro++}`; dados.papel = papel; terceiros.push(dados);
        }
    });

    if (autores.length === 0 && reus.length === 0 && terceiros.length === 0) return;

    // ----------------------------------------------------
    // MOTOR DE AGRUPAMENTO DE LITISCONSÓRCIOS
    // ----------------------------------------------------
    const agruparPartes = (partes) => {
        const grupos = [];
        partes.forEach(parte => {
            let alocado = false;
            if (parte.advogados.length > 0) {
                const chavesAdv = parte.advogados.map(a => (a.oab || a.nome).toUpperCase().trim());
                for (let grupo of grupos) {
                    if (grupo.partes[0].papel === parte.papel && grupo.listaAdvs.length > 0) {
                        const chavesGrupo = grupo.listaAdvs.map(a => (a.oab || a.nome).toUpperCase().trim());
                        if (chavesAdv.some(c => chavesGrupo.includes(c))) {
                            grupo.partes.push(parte); 
                            parte.advogados.forEach(adv => {
                                const chaveAdv = (adv.oab || adv.nome).toUpperCase().trim();
                                if (!grupo.listaAdvs.some(ga => ((ga.oab || ga.nome).toUpperCase().trim()) === chaveAdv)) grupo.listaAdvs.push(adv);
                            });
                            if (parte.procuracaoHref !== '#') {
                                grupo.procuracoes.push({ href: parte.procuracaoHref, title: parte.procuracaoTitle, historicoHtml: parte.historicoHtml });
                            }
                            alocado = true;
                            break;
                        }
                    }
                }
            }
            if (!alocado) {
                grupos.push({
                    partes: [parte],
                    listaAdvs: [...parte.advogados],
                    procuracoes: parte.procuracaoHref !== '#' ? [{ href: parte.procuracaoHref, title: parte.procuracaoTitle, historicoHtml: parte.historicoHtml }] : [],
                    avisoSemProcurador: parte.avisoSemProcurador
                });
            }
        });
        return grupos;
    };

    const gruposAutores = agruparPartes(autores);
    const gruposReus = agruparPartes(reus);
    const gruposTerceiros = agruparPartes(terceiros);

    // ----------------------------------------------------
    // RENDERIZAÇÃO DO DOM (ESTRUTURA PRINCIPAL)
    // ----------------------------------------------------
    const contractSvg = `<svg style="width: 13px; height: 13px; vertical-align: middle; fill: #28a745; cursor: pointer;" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
    const badgeJG = `<span class="badge-jg-smart" title="Justiça Gratuita">JG</span>`;

    const renderGroupedCard = (grupo, corBg) => {
        const temAdvogados = grupo.listaAdvs && grupo.listaAdvs.length > 0;
        const textoCentro = temAdvogados ? (grupo.listaAdvs.length === 1 ? 'PROCURADOR' : 'PROCURADORES') : (grupo.avisoSemProcurador || 'Nenhum advogado cadastrado');

        const htmlPartes = grupo.partes.map(p => {
            const iconObito = `<span id="skull-card-${p.uniqueId}" class="badge-obito-smart" style="display: ${p.isObito ? 'inline-flex' : 'none'};" title="Situação CPF: Cancelada por Óbito">☠</span>`;
            const tagPapelHTML = p.papel ? `<div class="tag-papel-smart">${escapeHtml(p.papel)}</div>` : '';
            const tagIdadeHTML = p.idadeText ? `<span style="font-size: 0.8rem; color: #495057; font-weight: normal; margin-left: 4px;">(${escapeHtml(p.idadeText)})</span>` : '';
            
            let textoSucessao = p.tagSucessor ? p.tagSucessor.replace(/[()]/g, '').trim().toUpperCase() : '';
            let docDisplay = '';
            
            if (textoSucessao && p.cpfCnpjTexto) {
                docDisplay = `${escapeHtml(textoSucessao)} - ${p.cpfCnpjTexto}`;
            } else if (textoSucessao) {
                docDisplay = escapeHtml(textoSucessao);
            } else if (p.cpfCnpjTexto) {
                docDisplay = p.cpfCnpjTexto;
            }

            return `
            <div style="text-align: center; margin-bottom: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap;">
                    ${iconObito}
                    <a href="${p.urlConsulta}" class="nome-parte-smart" style="color: ${corBg}; text-decoration: none;" title="Consultar Parte">${p.nome}</a>
                    ${tagIdadeHTML}
                    ${p.hasJG ? badgeJG : ''}
                </div>
                ${tagPapelHTML}
                ${p.representacao ? `<div style="font-size:11px;color:#495057;margin:0;">(${escapeHtml(p.representacao)})</div>` : ''}
                
                <div style="display:flex; align-items:center; justify-content:center; gap:4px; margin:0;">
                    ${docDisplay ? `<span class="cpf-cnpj-texto">${docDisplay}</span>` : ''}
                    <div id="ph-situacao-${p.uniqueId}" class="situacao-smart-wrapper"></div>
                    <div id="ph-altbtn-${p.uniqueId}" style="display:inline-flex; align-items:center;"></div>
                </div>
            </div>`;
        }).join('');

        const htmlAdvs = grupo.listaAdvs.map(a => {
            const isSocTag = a.isSociedade ? `<span style="font-size: 0.55rem; background: #6c757d; color: white; padding: 1px 4px; border-radius: 3px; margin-right: 6px; letter-spacing: 0.5px; flex-shrink: 0;" title="Sociedade de Advogados">SOCIEDADE</span>` : '';
            const nomeStyle = a.isSociedade ? `color: #495057; font-weight: bold;` : `color: #0056b3; font-weight: 500;`;
            
            return `
            <div style="font-size: 0.82em; margin-top: 6px; color: #333; display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;">
                <div style="display: flex; align-items: center; flex: 1; margin-right: 8px;">
                    ${isSocTag}
                    <a href="${escapeHtml(a.href)}" style="text-decoration: none; ${nomeStyle} line-height: 1.25;" title="${escapeHtml(a.nome)}">${escapeHtml(a.nome)}</a>
                </div>
                ${a.oab ? `<span class="caixa-oab-smart" title="Pesquisar ${escapeHtml(a.oab)} nos eventos">${escapeHtml(a.oab)}</span>` : ''}
            </div>
            `;
        }).join('');

        const htmlProcuracoes = grupo.procuracoes.map(proc => `
            <span style="display: inline-flex; align-items: center; margin-left: 4px; gap: 4px;">
                ${proc.historicoHtml || ''}
                <a href="${escapeHtml(proc.href)}" style="text-decoration: none; display: inline-flex; align-items: center;" title="${escapeHtml(proc.title)}">${contractSvg}</a>
            </span>
        `).join('');

        return `
            <div style="box-sizing: border-box; padding: 12px; background-color: rgba(255, 255, 255, 0.98); border: 1px solid rgba(0, 0, 0, 0.2); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 100%; margin-bottom: 6px;">
                ${htmlPartes}
                <div style="display: flex; align-items: center; color: #6c757d; font-size: 0.6rem; margin: ${temAdvogados ? '2px 0 0 0' : '4px 0 0 0'}; text-transform: ${temAdvogados ? 'uppercase' : 'none'}; letter-spacing: 0.5px;">
                    <div style="flex: 1; border-bottom: 1px solid #ced4da;"></div>
                    <span style="padding: 0 4px; font-weight: bold; font-size: 0.65rem; white-space: nowrap; display: flex; align-items: center;">${textoCentro}</span>
                    <div style="flex: 1; border-bottom: 1px solid #ced4da;"></div>
                    ${htmlProcuracoes}
                </div>
                <div style="margin-top: 4px;">${htmlAdvs}</div>
            </div>
        `;
    };

    const renderResumoCompacto = (lista) => {
        return lista.map(p => {
            const iconObito = `<span id="skull-comp-${p.uniqueId}" class="badge-obito-smart" style="display: ${p.isObito ? 'inline-flex' : 'none'};" title="Situação CPF: Cancelada por Óbito">☠</span>`;
            const tagIdadeCompactoHTML = p.idadeText ? `<span style="font-size: 0.7rem; color: #495057; font-weight: normal; margin-left: 4px;">(${escapeHtml(p.idadeText)})</span>` : '';
            const tagPapelHTML = p.papel ? `<span style="font-size:0.55rem; background:#6c757d; color:#fff; padding:1px 4px; border-radius:3px; margin-left:4px; font-weight:bold;">${escapeHtml(p.papel)}</span>` : '';
            return `
            <div style="display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%; padding: 2px 0; text-align: center;">
                ${iconObito}
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(p.nome)}">${escapeHtml(p.nome)}</span>
                ${tagIdadeCompactoHTML}
                ${tagPapelHTML}
                ${p.hasJG ? badgeJG : ''}
            </div>`;
        }).join('');
    };

    // ============================================================
    // CONSTRUÇÃO E INSERÇÃO DO CONTAINER SMART E NATIVO
    // ============================================================
    
    // Nosso super wrapper pai (Relative para o absolute da barra funcionar)
    // O margin-top: 45px reserva o espaço para a barra de ferramentas flutuante
    const wrapper = document.createElement('div');
    wrapper.id = 'container-partes-smart';
    wrapper.style.cssText = 'width: 100%; position: relative; margin-top: 5px; margin-bottom: -10px; font-family: Arial, sans-serif; box-sizing: border-box; display: flex; flex-direction: column;';

    // Barra Superior Flutuante em até 3 colunas (respeita a altura das partes sem estourar)
    const divFerramentas = document.createElement('div');
    divFerramentas.className = 'ferramentas-partes-smart';

    const chkFixar = document.createElement('input');
    chkFixar.type = 'checkbox';
    chkFixar.id = 'chk-pin-partes';
    chkFixar.className = 'chk-fixar-smart';
    chkFixar.title = 'Alternar para visão nativa de partes';

    // Resgata os modais para injetar no body e não os perder
    const modaisOriginais = Array.from(fldOriginal.querySelectorAll('.modal'));
    modaisOriginais.forEach(m => document.body.appendChild(m));

    // Varre os botões de ação do container antigo e organiza priorizando a primeira linha
    const linksAcao = Array.from(fldOriginal.querySelectorAll('a')).filter(a => !a.closest('table.infraTable'));
    const itensPrincipais = [];
    const itensSecundarios = [];

    linksAcao.forEach(link => {
        const novoLink = link.cloneNode(true);
        Array.from(novoLink.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) node.remove(); // Limpa textos para deixar só os ícones bonitos
        });
        novoLink.style.margin = '0';

        const href = (novoLink.getAttribute('href') || '').toLowerCase();
        const title = (novoLink.getAttribute('title') || '').toLowerCase();
        const html = novoLink.innerHTML.toLowerCase();

        // Linha 1 / Principais: Editar partes (lápis) e Histórico de retificação (valores.gif)
        // Linha 2 / Secundários: Réu suspenso (refresh azul) e Partes presas (refresh verde/material-icons)
        if (title.includes('retificar') || title.includes('editar') || href.includes('processo_partes_retificar')) {
            itensPrincipais.unshift(novoLink); // Lápis vem logo após o checkbox
        } else if (html.includes('valores.gif') || href.includes('historico_retificacao_partes') || title.includes('histórico')) {
            itensPrincipais.push(novoLink);
        } else {
            itensSecundarios.push(novoLink);
        }
    });

    // Ordem final dos itens na toolbar: [Checkbox, Lápis, Histórico, Réu Suspenso, Partes Presas, ...]
    const todosItens = [chkFixar, ...itensPrincipais, ...itensSecundarios];
    todosItens.forEach(item => divFerramentas.appendChild(item));

    // Ajusta dinamicamente a largura e colunas da toolbar respeitando a altura das partes
    const numCols = Math.min(3, Math.max(1, todosItens.length));
    divFerramentas.style.gridTemplateColumns = `repeat(${numCols}, 18px)`;
    const toolbarWidth = numCols * 18 + (numCols - 1) * 6;
    wrapper.style.paddingRight = `${toolbarWidth}px`;

    wrapper.appendChild(divFerramentas);

    // Divisão das COLUNAS SMART
    const colsWrapper = document.createElement('div');
    colsWrapper.style.cssText = 'display: flex; width: 100%; gap: 12px; flex-wrap: wrap; justify-content: flex-start;';

    window._isPinnedPartes = false;
    const colunasAtivas = [];

    const createColumn = (items, groups, color) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'flex: 1 1 0; min-width: 220px; position: relative; box-sizing: border-box;';
        
        const comp = document.createElement('div');
        comp.style.cssText = `padding: 6px 12px; background-color: rgba(255, 255, 255, 0.25); border: 1px solid rgba(0, 0, 0, 0.15); border-radius: 4px; cursor: pointer; color: ${color}; font-weight: bold; transition: opacity 0.2s ease; display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box;`;
        comp.innerHTML = renderResumoCompacto(items);
        
        const drop = document.createElement('div');
        drop.style.cssText = 'display: none; position: absolute; top: 0; left: 0; width: 100%; z-index: 9999;';
        drop.innerHTML = groups.map(g => renderGroupedCard(g, color)).join('');
        
        wrap.appendChild(comp);
        wrap.appendChild(drop);

        let timer;
        wrap.addEventListener('mouseenter', () => {
            if (window._isPinnedPartes) return;
            clearTimeout(timer);
            timer = setTimeout(() => { comp.style.opacity = '0'; drop.style.display = 'block'; drop.style.zIndex = '10000'; }, 200);
        });

        wrap.addEventListener('mouseleave', () => {
            if (window._isPinnedPartes) return;
            clearTimeout(timer);
            timer = setTimeout(() => { drop.style.display = 'none'; comp.style.opacity = '1'; drop.style.zIndex = '9999'; }, 200);
        });

        colunasAtivas.push({ wrap, comp, drop });
        return wrap;
    };

    const blocks = [];
    if (autores.length > 0) blocks.push(createColumn(autores, gruposAutores, '#0056b3'));
    if (reus.length > 0) blocks.push(createColumn(reus, gruposReus, '#dc3545'));
    if (terceiros.length > 0) blocks.push(createColumn(terceiros, gruposTerceiros, '#6f42c1')); 
    blocks.forEach((block) => colsWrapper.appendChild(block));

    wrapper.appendChild(colsWrapper);

    // Divisão NATIVA (Recebe apenas os tbodys puros)
    const nativeTablesWrapper = document.createElement('div');
    nativeTablesWrapper.style.cssText = 'display: none; width: 100%; overflow-x: auto; background-color: transparent; border: none;';
    
    tablesOriginais.forEach(tbl => {
        nativeTablesWrapper.appendChild(tbl);
    });

    wrapper.appendChild(nativeTablesWrapper);

    // ============================================================
    // MATA O FLDPARTES E INJETA TUDO DENTRO DA CAPA
    // ============================================================
    
    // Injeta nossa estrutura DENTRO do fundo azul da Capa!
    fldCapa.appendChild(wrapper);

    // Aniquilação do fieldset quebrado
    fldOriginal.style.setProperty('display', 'none', 'important');
    // Obs: fldOriginal não terá o innerHTML limpo aqui apenas por segurança para não quebrar eventuais inputs invisíveis que o Eproc deixe dentro dele.
    
    // Lógica do Checkbox para alternar entre as visões (chkFixar criado na montagem da toolbar)

    // Recupera preferência persistida
    const fixadoSalvo = localStorage.getItem('eproc_partes_fixado_nativo') === 'true';
    if (fixadoSalvo) {
        chkFixar.checked = true;
        window._isPinnedPartes = true;
        colsWrapper.style.display = 'none';
        nativeTablesWrapper.style.display = 'block';
    }

    chkFixar.addEventListener('change', (e) => {
        window._isPinnedPartes = e.target.checked;
        localStorage.setItem('eproc_partes_fixado_nativo', window._isPinnedPartes ? 'true' : 'false');
        
        if (window._isPinnedPartes) {
            // MOSTRAR TABELAS NATIVAS
            colsWrapper.style.display = 'none';
            nativeTablesWrapper.style.display = 'block'; 
        } else {
            // MOSTRAR SMART
            colsWrapper.style.display = 'flex';
            nativeTablesWrapper.style.display = 'none';
            
            // Reseta eventuais hover travados
            colunasAtivas.forEach(col => {
                col.drop.style.display = 'none';
                col.comp.style.opacity = '1';
                col.comp.style.pointerEvents = 'auto';
            });
        }
    });

    // ============================================================
    // MOTOR NATIVO CPF / POPOVER ESPELHADO
    // ============================================================
    const mapaSituacao = new Map();

    const encontrarPopoverDoBotao = (botao) => {
        if (!botao) return null;
        const describedBy = botao.getAttribute('aria-describedby');
        if (describedBy) {
            const el = document.getElementById(describedBy);
            if (el) return el;
        }
        try {
            if (window.jQuery) {
                const instancia = window.jQuery(botao).data('bs.popover');
                if (instancia && instancia.tip) {
                    const tip = typeof instancia.tip === 'function' ? instancia.tip() : instancia.tip;
                    if (tip) return tip;
                }
            }
        } catch (e) {}
        return document.querySelector('.popover.show');
    };

    const posicionarPopoverOriginal = (popover, botaoEspelho) => {
        if (!popover || !botaoEspelho) return;
        
        popover.classList.add('smart-popover-original');
        const rect = botaoEspelho.getBoundingClientRect();
        const largura = popover.offsetWidth || 250;
        const altura = popover.offsetHeight || 100;
        const margem = 8;

        let left = rect.left + (rect.width / 2) - (largura / 2);
        let top = rect.bottom + margem;

        if (left < margem) left = margem;
        if (left + largura > window.innerWidth - margem) left = window.innerWidth - largura - margem;
        if (top + altura > window.innerHeight - margem) top = rect.top - altura - margem;
        if (top < margem) top = margem;

        popover.style.setProperty('position', 'fixed', 'important');
        popover.style.setProperty('left', `${Math.round(left)}px`, 'important');
        popover.style.setProperty('top', `${Math.round(top)}px`, 'important');
        popover.style.setProperty('transform', 'none', 'important');
        popover.style.setProperty('margin', '0', 'important');
        popover.style.setProperty('z-index', '999999', 'important');
    };

    const dispararMouseOverOriginal = (botaoOriginal, botaoEspelho) => {
        if (!botaoOriginal) return;
        const estiloOriginal = {
            position: botaoOriginal.style.position,
            left: botaoOriginal.style.left,
            top: botaoOriginal.style.top,
            opacity: botaoOriginal.style.opacity,
            pointerEvents: botaoOriginal.style.pointerEvents,
            visibility: botaoOriginal.style.visibility,
            zIndex: botaoOriginal.style.zIndex
        };
        try {
            if (botaoEspelho) {
                const rect = botaoEspelho.getBoundingClientRect();
                botaoOriginal.style.setProperty('position', 'fixed', 'important');
                botaoOriginal.style.setProperty('left', `${Math.round(rect.left)}px`, 'important');
                botaoOriginal.style.setProperty('top', `${Math.round(rect.top)}px`, 'important');
                botaoOriginal.style.setProperty('opacity', '0.01', 'important');
                botaoOriginal.style.setProperty('visibility', 'visible', 'important');
                botaoOriginal.style.setProperty('pointer-events', 'none', 'important');
                botaoOriginal.style.setProperty('z-index', '999998', 'important');
            }
        } catch (e) { }

        setTimeout(() => {
            try {
                botaoOriginal.style.position = estiloOriginal.position;
                botaoOriginal.style.left = estiloOriginal.left;
                botaoOriginal.style.top = estiloOriginal.top;
                botaoOriginal.style.opacity = estiloOriginal.opacity;
                botaoOriginal.style.pointerEvents = estiloOriginal.pointerEvents;
                botaoOriginal.style.visibility = estiloOriginal.visibility;
                botaoOriginal.style.zIndex = estiloOriginal.zIndex;
            } catch (e) {}
        }, 50);
    };

    const esconderPopoverOriginal = (botaoOriginal, estado) => {
        estado.ativo = false;
        if (estado.timeoutAjax) { clearTimeout(estado.timeoutAjax); estado.timeoutAjax = null; }
        if (estado.intervalHover) { clearInterval(estado.intervalHover); estado.intervalHover = null; }
        try {
            if (window.jQuery && botaoOriginal && window.jQuery(botaoOriginal).data('bs.popover')) {
                window.jQuery(botaoOriginal).popover('hide');
            }
        } catch (e) {}
        setTimeout(() => {
            document.documentElement.classList.remove('smart-situacao-active');
            document.querySelectorAll('.popover.smart-popover-original').forEach(popover => {
                popover.classList.remove('smart-popover-original');
            });
        }, 100);
    };

    const ativarSituacaoOriginal = (botaoOriginal, botaoEspelho, estado, parteId) => {
        estado.ativo = true;
        document.documentElement.classList.add('smart-situacao-active');
        dispararMouseOverOriginal(botaoOriginal, botaoEspelho);
        
        let tentativas = 0;
        estado.intervalHover = setInterval(() => {
            tentativas++;
            if (!estado.ativo || tentativas > 25) {
                clearInterval(estado.intervalHover);
                return;
            }
            const popover = encontrarPopoverDoBotao(botaoOriginal);
            if (popover) {
                posicionarPopoverOriginal(popover, botaoEspelho);
                const txt = popover.innerText.toLowerCase();
                if (txt.includes('óbito') || txt.includes('obito') || txt.includes('falecido')) {
                    const sc = document.getElementById(`skull-card-${parteId}`);
                    const sm = document.getElementById(`skull-comp-${parteId}`);
                    if (sc) sc.style.display = 'inline-flex';
                    if (sm) sm.style.display = 'inline-flex';
                }
            }
        }, 100);
    };

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

    const criarEspelhoSituacao = (parte) => {
        const destino = document.getElementById(`ph-situacao-${parte.uniqueId}`);
        if (!destino || !parte.btnSituacao) return;

        const btnEspelho = document.createElement('button');
        btnEspelho.type = 'button';
        btnEspelho.className = 'situacao-smart-btn';
        
        const estado = { ativo: false, timeoutAjax: null, intervalHover: null };

        btnEspelho.innerHTML = parte.btnSituacao.innerHTML;
        btnEspelho.title = parte.btnSituacao.getAttribute('title') || parte.btnSituacao.getAttribute('data-original-title') || 'Consultar situação';

        parte.btnSituacao.classList.forEach(classe => {
            if (classe !== 'popover' && classe !== 'dropdown') btnEspelho.classList.add(classe);
        });

        mapaSituacao.set(btnEspelho, parte.btnSituacao);

        btnEspelho.addEventListener('mouseenter', () => {
            const original = mapaSituacao.get(btnEspelho);
            if (original) ativarSituacaoOriginal(original, btnEspelho, estado, parte.uniqueId);
        });

        btnEspelho.addEventListener('mouseleave', () => {
            const original = mapaSituacao.get(btnEspelho);
            if (original) esconderPopoverOriginal(original, estado);
        });

        btnEspelho.addEventListener('click', e => {
            e.preventDefault(); 
            e.stopPropagation();
            
            const original = mapaSituacao.get(btnEspelho);
            if (!original) return;
            
            estado.ativo = true;
            document.documentElement.classList.add('smart-situacao-active');

            try { clicarElementoSeguro(original); } 
            catch (err) { original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }

            [150, 400, 800].forEach(delay => {
                estado.timeoutAjax = setTimeout(() => {
                    if (!estado.ativo) return;
                    dispararMouseOverOriginal(original, btnEspelho);
                    const popover = encontrarPopoverDoBotao(original);
                    if (popover) {
                        posicionarPopoverOriginal(popover, btnEspelho);
                        const txt = popover.innerText.toLowerCase();
                        if (txt.includes('óbito') || txt.includes('obito') || txt.includes('falecido')) {
                            const sc = document.getElementById(`skull-card-${parte.uniqueId}`);
                            const sm = document.getElementById(`skull-comp-${parte.uniqueId}`);
                            if (sc) sc.style.display = 'inline-flex';
                            if (sm) sm.style.display = 'inline-flex';
                        }
                    }
                }, delay);
            });
        });

        destino.appendChild(btnEspelho);
    };

    const todasPartes = [...autores, ...reus, ...terceiros];
    todasPartes.forEach(criarEspelhoSituacao);

    // ============================================================
    // CLONAGEM DO BOTÃO AZFLOW (MANTÉM O ORIGINAL NA TABELA NATIVA)
    // ============================================================
    const azTracker = setInterval(() => {
        todasPartes.forEach(parte => {
            const btnOriginal = parte.originalTd.querySelector('button[data-azflow-reu-situacao-btn]');
            if (btnOriginal && !btnOriginal.dataset.smartMirrored) {
                btnOriginal.dataset.smartMirrored = "1";
                const ph = document.getElementById(`ph-altbtn-${parte.uniqueId}`);
                
                if (ph) {
                    const btnEspelho = btnOriginal.cloneNode(true);
                    btnEspelho.style.margin = '0 0 0 4px';
                    
                    btnEspelho.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        btnOriginal.click();
                    });
                    
                    ph.innerHTML = '';
                    ph.appendChild(btnEspelho);
                }
            }
        });
    }, 500);
    setTimeout(() => clearInterval(azTracker), 6000);

    // ============================================================
    // INTERAÇÕES GERAIS E JAVASCRIPT LINKS
    // ============================================================
    wrapper.addEventListener('click', (e) => {
        const oabBadge = e.target.closest('.caixa-oab-smart');
        if (oabBadge) {
            e.preventDefault();
            e.stopPropagation();
            
            const oabNumero = oabBadge.textContent.trim();
            const campoPesquisa = document.getElementById('txtPesquisaEventos');
            
            if (campoPesquisa) {
                campoPesquisa.value = oabNumero;
                campoPesquisa.dispatchEvent(new Event('input', { bubbles: true }));
                campoPesquisa.dispatchEvent(new Event('change', { bubbles: true }));
                campoPesquisa.focus();
                
                if (typeof window.__superprocFiltrarEventos === 'function') {
                    window.__superprocFiltrarEventos(oabNumero, true);
                } else {
                    campoPesquisa.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                }
            }
            return;
        }

        const actionLink = e.target.closest('a[href^="javascript:"]');
        if (actionLink) {
            // Deixa o clique transitar naturalmente pelo navegador no Main World sem violar CSP
            return;
        }
    });


        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', executar);
        } else {
            executar();
        }
    }
};
