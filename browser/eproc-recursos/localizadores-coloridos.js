// Localizadores Coloridos & Priorizados do navegador SuperPROC (camada: host; mundo isolado nas abas do eproc).
// Chave própria em CFG > Configurações ("Localizadores Coloridos"). Porte independente do módulo da extensão
// (modules/painel/localizadores_coloridos.js): pinta e ordena os localizadores por prioridade na capa e nas listas;
// botão direito na pílula define cor e prioridade. Sem chrome.* e sem a extensão: cores próprias, cores vistas no AZflow,
// regras por grupo e catálogo ficam na pool comum do localStorage do eproc (superproc_pool_cores_v1, docs/ia/POOL-COMUM.md),
// além da cópia local (MEUS_LOCALIZADORES_CONFIG_V2). Cor própria identificada pelo ID do localizador ("id:<ID>"), com o
// nome como reserva; ver "Identidade" em docs/ia/POOL-COMUM.md. Concatenado pelo host depois de base.js (SPBase).

(function localizadoresColoridos() {
  if (window.__spColoridos) return;
  window.__spColoridos = true;
  const { PALETA_LOCALIZADORES, domWork, lerLocal } = SPBase;
        const STORAGE_KEY = 'MEUS_LOCALIZADORES_CONFIG_V2';

        function carregarConfiguracoes() {
            try {
                const val = localStorage.getItem(STORAGE_KEY);
                return val ? JSON.parse(val) : {};
            } catch (e) {
                return {};
            }
        }

        function salvarConfiguracoes(dados) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
            } catch (e) {}
        }

        function calcularCorTexto(hexColor) {
            if (!hexColor || !hexColor.startsWith('#')) return '#ffffff';
            const r = parseInt(hexColor.substr(1, 2), 16) || 0;
            const g = parseInt(hexColor.substr(3, 2), 16) || 0;
            const b = parseInt(hexColor.substr(5, 2), 16) || 0;
            const yiq = (r * 299 + g * 587 + b * 114) / 1000;
            return yiq >= 128 ? '#212529' : '#ffffff';
        }

        let configs = carregarConfiguracoes();
        // "Capa": a da consulta do processo e a "Capa do Processo" que a tela de minuta repete (mesma região #dvLocalizadoresOrgao).
        const isPaginaCapa = window.location.href.includes('acao=processo_selecionar') || !!document.getElementById('dvLocalizadoresOrgao');

        if (!document.getElementById('superproc-locs-coloridos-css')) {
            const style = document.createElement('style');
            style.id = 'superproc-locs-coloridos-css';
            style.textContent = `
                /* MATA O HOVER DAS LINHAS DA TABELA */
                html body tr.infraTrClara:hover,
                html body tr.infraTrEscura:hover,
                html body tr:hover,
                html body tr:hover td {
                    background-color: inherit !important;
                }

                /* BLINDAGEM E ESTILO DOS LOCALIZADORES (Tabelas e Listas) */
                .meu-loc-pill {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                    height: 22px !important;
                    min-height: 22px !important;
                    max-height: 22px !important;
                    padding: 0 8px !important;
                    margin: 0 4px 0 0 !important;
                    border-radius: 4px !important;
                    font-size: 12px !important;
                    font-family: "Segoe UI", Tahoma, sans-serif !important;
                    font-weight: 600 !important;
                    line-height: 1 !important;
                    vertical-align: middle !important;
                    user-select: none !important;
                    pointer-events: auto !important;
                    transition: none !important;
                    opacity: 1 !important;
                    -webkit-font-smoothing: antialiased !important;
                    background-color: var(--loc-bg, #e9ecef) !important;
                    color: var(--loc-tx, #495057) !important;
                    border: var(--loc-border, 1px solid #ced4da) !important;
                }

                /* Lista de processos do localizador: um item (pílula + memo) por localizador, na ordem da prioridade */
                .sp-loc-lista { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
                .sp-loc-item { display: inline-flex; align-items: center; gap: 2px; }
                .sp-loc-item[hidden] { display: none !important; }
                /* Mesma pílula da capa: 31 px de altura, 13 px de fonte, canto de 6 px */
                .sp-loc-item .meu-loc-pill {
                    height: 31px !important;
                    min-height: 31px !important;
                    max-height: 31px !important;
                    padding: 0 10px !important;
                    margin: 0 !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    text-decoration: none !important;
                }
                .meu-loc-pill[data-loc-fixo]::after {
                    content: '';
                    flex: 0 0 12px;
                    width: 12px;
                    height: 12px;
                    margin-left: 5px;
                    background: currentColor;
                    clip-path: polygon(33% 12%, 67% 12%, 67% 21%, 62% 21%, 62% 46%, 75% 58%, 75% 67%, 54% 67%, 54% 87%, 50% 96%, 46% 87%, 46% 67%, 25% 67%, 25% 58%, 38% 46%, 38% 21%, 33% 21%);
                    pointer-events: none;
                }

                /* Na Capa do processo, os localizadores observam a altura dos botões (31px) */
                a#AbreLocalizadores, 
                #dvLocalizadoresOrgao a#AbreLocalizadores,
                #dvLocalizadoresOrgao a[data-loc-nome] {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                    height: 31px !important;
                    min-height: 31px !important;
                    max-height: 31px !important;
                    padding: 0 10px !important;
                    margin: 0 4px 0 0 !important;
                    border-radius: 6px !important;
                    font-size: 13px !important;
                    font-family: "Segoe UI", Tahoma, sans-serif !important;
                    font-weight: 600 !important;
                    line-height: 1 !important;
                    vertical-align: middle !important;
                    user-select: none !important;
                    pointer-events: auto !important;
                    transition: none !important;
                    opacity: 1 !important;
                    -webkit-font-smoothing: antialiased !important;
                    background-color: var(--loc-bg, #e9ecef) !important;
                    color: var(--loc-tx, #495057) !important;
                    border: var(--loc-border, 1px solid #ced4da) !important;
                }

                /* Sem o ícone interno do AZFlow, coloca o alfinete nativo na linha da pílula. */
                #dvLocalizadoresOrgao a.localizador-fixo-lista[data-loc-nome]::before,
                #dvLocalizadoresOrgao a.localizador-fixo-lista[data-loc-nome]:has([data-azflow-icone-fixo="true"])::after {
                    content: none !important;
                    display: none !important;
                }
                #dvLocalizadoresOrgao
                a.localizador-fixo-lista[data-loc-nome]:not(:has([data-azflow-icone-fixo="true"]))::after {
                    content: '' !important;
                    display: block !important;
                    position: static !important;
                    transform: none !important;
                    flex: 0 0 12px !important;
                    width: 12px !important;
                    height: 12px !important;
                    margin: 0 0 0 5px !important;
                    padding: 0 !important;
                    background: currentColor !important;
                    clip-path: polygon(33% 12%, 67% 12%, 67% 21%, 62% 21%, 62% 46%, 75% 58%, 75% 67%, 54% 67%, 54% 87%, 50% 96%, 46% 87%, 46% 67%, 25% 67%, 25% 58%, 38% 46%, 38% 21%, 33% 21%) !important;
                    pointer-events: none;
                }

                /* Alfinete / SVG do localizador fixo centralizado sem estufar a caixa */
                .meu-loc-pill svg {
                    display: inline-block !important;
                    width: 11px !important;
                    height: 11px !important;
                    margin-left: 4px !important;
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                    vertical-align: middle !important;
                    flex-shrink: 0 !important;
                }

                a#AbreLocalizadores svg,
                #dvLocalizadoresOrgao a#AbreLocalizadores svg,
                #dvLocalizadoresOrgao a[data-loc-nome] svg {
                    display: inline-block !important;
                    width: 12px !important;
                    height: 12px !important;
                    margin-left: 5px !important;
                    margin-top: 0 !important;
                    margin-bottom: 0 !important;
                    vertical-align: middle !important;
                    flex-shrink: 0 !important;
                }

                .meu-loc-pill:hover, 
                a#AbreLocalizadores:hover, 
                #dvLocalizadoresOrgao a#AbreLocalizadores:hover,
                #dvLocalizadoresOrgao a[data-loc-nome]:hover {
                    background-color: var(--loc-bg, #e9ecef) !important;
                    color: var(--loc-tx, #495057) !important;
                    border: var(--loc-border, 1px solid #ced4da) !important;
                    opacity: 0.88 !important;
                    filter: none !important;
                    box-shadow: none !important;
                    text-decoration: none !important;
                    cursor: pointer !important;
                }

                /* Os ícones de memo (a.memoLocalizadorOrgao<id>) ficam escondidos ao lado das pílulas (capa e listas); o acesso
                   ao memo está no menu do botão direito da pílula (abrirMenu). O link continua no DOM: o menu o aciona. */
                #dvLocalizadoresOrgao a[class*="memoLocalizadorOrgao"],
                .sp-loc-lista a[class*="memoLocalizadorOrgao"] {
                    display: none !important;
                }

                /* Só o texto cru e o separador somem */
                span[data-azflow-listaprocloc-locator="true"],
                .azflow-separador-localizador {
                    pointer-events: none !important;
                    display: none !important;
                }

                .c-box:hover { transform: scale(1.1); transition: transform 0.1s; }
                #menu-priv { animation: fadeIn 0.1s ease-out; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `;
            document.head.appendChild(style);
        }

        // ---- Grupos do Smart Localizadores (só leitura) e regras de cor/prioridade por grupo ----
        const norm = (s) => String(s).normalize('NFC').replace(/️/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const observadas = new Map();
        const pendentesAZ = new Map();
        let timerAZ;

        // Identidade: o ID do eproc. Na capa ele vem do campo oculto; nas listas, do catálogo (nome -> ID, se não ambíguo).
        // A regra própria é lida primeiro pelo ID ("id:<ID>") e, na falta dele, pelo nome (dados antigos e a extensão).
        // Ordem: o código gravado no próprio elemento (data-loc-id, vindo da lista do eproc), o campo oculto da capa e o catálogo.
        let indice = SPBase.indiceLocalizadores();
        const idDe = (nome, el = null) => (el && el.getAttribute && el.getAttribute('data-loc-id')) || idsDaCapa().nomeParaId.get(norm(nome)) || indice.idDe(nome);
        function chavesDe(nome, el = null) {
            const id = idDe(nome, el);
            return { id, chaves: [id && SPBase.chaveDoId(id), nome, norm(nome)].filter(Boolean) };
        }
        function regraPropria(nome, el = null) {
            for (const k of chavesDe(nome, el).chaves) if (configs[k]) return configs[k];
            return {};
        }

        // Cores próprias: a pool comum (proprias, por "id:<ID>" e por nome normalizado) e a cópia local (MEUS_LOCALIZADORES_CONFIG_V2).
        // Migração: cada regra guardada só pelo nome ganha a chave do ID quando o catálogo resolve o nome sem ambiguidade.
        // A chave por nome fica (a extensão ainda lê por nome); a do ID prevalece e sobrevive à renomeação.
        async function atualizarRegrasProprias() {
            const pool = SPBase.lerPool();
            indice = SPBase.indiceLocalizadores(pool.catalogoLoc);
            let lidas = pool.proprias;
            const locais = carregarConfiguracoes();
            const espelho = Object.fromEntries(Object.entries(locais).map(([nome, regra]) => [nome.startsWith(SPBase.PREFIXO_ID) ? nome : norm(nome), regra]));
            const porId = {};
            for (const [nome, regra] of Object.entries({ ...espelho, ...lidas })) {
                if (nome.startsWith(SPBase.PREFIXO_ID)) continue;
                const id = indice.idDe(nome);
                const k = id && SPBase.chaveDoId(id);
                if (k && !Object.hasOwn(lidas, k) && !Object.hasOwn(espelho, k) && !Object.hasOwn(porId, k)) porId[k] = regra;
            }
            if (Object.keys(porId).length || Object.keys(espelho).some(nome => !Object.hasOwn(lidas, nome))) {
                lidas = SPBase.mudarPool(p => { p.proprias = { ...espelho, ...porId, ...p.proprias }; }).proprias;
            }
            const nomes = new Map(Object.keys(locais).map(nome => [norm(nome), nome]));
            for (const [chave, regra] of Object.entries(lidas)) {
                const nome = nomes.get(chave) || chave;
                if (nome !== '__proto__') locais[nome] = regra;
            }
            if (JSON.stringify(locais) !== JSON.stringify(carregarConfiguracoes())) salvarConfiguracoes(locais);
            configs = locais;
            processarTudo(true);
        }

        function observarCorAZ(nome, cor, tx) {
            const chave = norm(nome);
            const regra = cor ? { cor, tx } : null;
            const estado = JSON.stringify(regra);
            if (observadas.get(chave) === estado || (!cor && !observadas.has(chave))) return;
            observadas.set(chave, estado);
            pendentesAZ.set(chave, regra);
            if (timerAZ) return;
            timerAZ = setTimeout(async () => {
                timerAZ = null;
                const lote = [...pendentesAZ];
                pendentesAZ.clear();
                try {
                    SPBase.mudarPool(p => {
                        for (const [nome, valor] of lote) {
                            if (nome === '__proto__') continue;
                            if (valor) p.az[nome] = valor; else delete p.az[nome];
                        }
                    });
                } catch (erro) { console.warn('[SuperPROC] Cores do AZFlow indisponíveis:', erro); }
            }, 150);
        }

        let regrasGrupos = {};                  // { grupo: { cor, tx, prio } } (pool comum, editado no Organizador)
        let grupoPorId = new Map();             // id do localizador -> grupo do Smart
        // Localizadores que não aparecem nas pílulas da capa e das listas: os do grupo "Ocultos" e os de grupos com o olho fechado
        // no Organizador. Mesma base do Smart Localizadores (eproc_smartloc_*).
        let idsOcultos = new Set();
        let grupoPorNomeCatalogo = new Map();   // nome normalizado (derivado de "Localizador - Nome") -> grupo; usado onde não há id (listas)

        // O texto nativo é "Localizador - Nome". Quando os dois são iguais ("X - X") o nome é exato; senão há candidatos (prefixos).
        function nomesPossiveis(texto) {
            const partes = String(texto).split(' - ');
            if (partes.length % 2 === 0) {
                const meio = partes.length / 2, a = partes.slice(0, meio).join(' - '), b = partes.slice(meio).join(' - ');
                if (norm(a) === norm(b)) return { exato: a, candidatos: [] };
            }
            const candidatos = [];
            for (let k = 1; k < partes.length; k++) candidatos.push(partes.slice(0, k).join(' - '));
            return { exato: null, candidatos };
        }

        async function carregarGrupos() {
            try {
                const pool = SPBase.lerPool();
                indice = SPBase.indiceLocalizadores(pool.catalogoLoc);
                regrasGrupos = pool.regrasGrupos;
                const local = lerLocal('loc');
                const textoPorId = new Map(pool.catalogoLoc.map(c => [c.value, c.text]));
                const porId = new Map(), exatos = new Map(), aprox = new Map();
                for (const g of local.grupos) {
                    if (g === 'Sem Grupo' || g === 'Ocultos') continue;
                    for (const id of local.estrutura[g] || []) {
                        porId.set(id, g);
                        const texto = textoPorId.get(id);
                        if (!texto) continue;
                        const { exato, candidatos } = nomesPossiveis(texto);
                        if (exato) exatos.set(norm(exato), g);
                        else candidatos.forEach(c => { if (!aprox.has(norm(c))) aprox.set(norm(c), g); });
                    }
                }
                grupoPorId = porId;
                grupoPorNomeCatalogo = new Map([...aprox, ...exatos]); // os exatos prevalecem
                const ocultos = new Set();
                const doGrupo = (g) => (Array.isArray(local.estrutura[g]) ? local.estrutura[g] : []);
                for (const id of doGrupo(SPBase.GRUPO_OCULTOS)) ocultos.add(id);
                for (const g of local.gruposOcultos) for (const id of doGrupo(g)) ocultos.add(id);
                idsOcultos = ocultos;
            } catch (erro) { /* sem grupos do Smart (módulo desligado ou ainda sem dados): segue só com as regras próprias */ }
        }

        // Na capa, o campo oculto traz os pares id/nome do processo: casamento exato com o grupo.
        function idsDaCapa() {
            const nomeParaId = new Map(), idParaNome = new Map();
            const h = document.getElementById('hdnSelLocalizadoresProcesso');
            if (h && h.value) {
                const re = /'id':'(\d+)'\s*,\s*'text':'((?:[^'\\]|\\.)*)'/g;
                let m;
                while ((m = re.exec(h.value))) { nomeParaId.set(norm(m[2]), m[1]); idParaNome.set(m[1], norm(m[2])); }
            }
            return { nomeParaId, idParaNome };
        }

        function grupoDoLocalizador(nome, el = null) {
            const id = idDe(nome, el);
            if (id && grupoPorId.has(id)) return grupoPorId.get(id);
            return grupoPorNomeCatalogo.get(norm(nome)) || null;
        }

        // Cor: AZflow > cor própria (usuário) > cor do grupo > padrão. Prioridade: própria (diferente de 9) > do grupo > 9.
        function resolverRegras(nome, fonteEstilo) {
            const esp = regraPropria(nome, fonteEstilo);
            const grupo = grupoDoLocalizador(nome, fonteEstilo);
            const rg = (grupo && regrasGrupos[grupo]) || {};

            const varBgAz = fonteEstilo.style.getPropertyValue('--azflow-locustom-bg') ||
                            fonteEstilo.style.getPropertyValue('--azflow-loc-bg');
            const varTxAz = fonteEstilo.style.getPropertyValue('--azflow-locustom-text') ||
                            fonteEstilo.style.getPropertyValue('--azflow-loc-text');

            let bg = '#e9ecef', tx = '#495057', origemCor = 'padrao';
            if (varBgAz) observarCorAZ(nome, varBgAz.trim(), varTxAz.trim());
            if (varBgAz) { bg = varBgAz; tx = varTxAz || '#ffffff'; origemCor = 'azflow'; }
            else if (esp.cor) { bg = esp.cor; tx = esp.tx || calcularCorTexto(esp.cor); origemCor = 'usuario'; }
            else if (rg.cor) { bg = rg.cor; tx = rg.tx || calcularCorTexto(rg.cor); origemCor = 'grupo'; }

            const pEsp = esp.prio !== undefined && esp.prio !== '' ? Number(esp.prio) : NaN;
            let prio = 9, origemPrio = 'padrao';
            if (!isNaN(pEsp) && pEsp !== 9) { prio = pEsp; origemPrio = 'usuario'; }
            else if (rg.prio !== undefined && rg.prio !== null && !isNaN(Number(rg.prio))) { prio = Number(rg.prio); origemPrio = 'grupo'; }
            return { bg, tx, prio, grupo, origemCor, origemPrio };
        }

        function aplicarEstiloBase(el, nome, ignorarOrdem = false, elOriginal = null) {
            const regras = resolverRegras(nome, elOriginal || el);
            const bgFinal = regras.bg;
            const txFinal = regras.tx;
            // Cor própria: borda interna de 1 px preta a 20%. O fundo se estende sob a borda (background-clip: border-box),
            // então ela escurece a própria cor escolhida sem aumentar a caixa. Sem cor (cinza padrão), mantém a borda neutra.
            const bordaFinal = (bgFinal === '#e9ecef' || bgFinal === 'rgb(233, 236, 239)') ? '1px solid #ced4da' : '1px solid rgba(0, 0, 0, 0.2)';

            el.setAttribute('data-azflow-hover-configured', 'true');
            el.toggleAttribute('data-superproc-cor-azflow', regras.origemCor === 'azflow');
            el.style.setProperty('--loc-bg', bgFinal);
            el.style.setProperty('--loc-tx', txFinal);
            el.style.setProperty('--loc-border', bordaFinal);

            const isCapa = isPaginaCapa || el.id === 'AbreLocalizadores' || !!el.closest('.sp-loc-item'); // as listas copiam o tamanho da capa
            const alturaLoc = isCapa ? '31px' : '22px';
            const paddingLoc = isCapa ? '0 10px' : '0 8px';
            const fontSizeLoc = isCapa ? '13px' : '12px';
            const borderRadiusLoc = isCapa ? '6px' : '4px';

            Object.assign(el.style, {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                height: alturaLoc,
                padding: paddingLoc,
                borderRadius: borderRadiusLoc,
                fontSize: fontSizeLoc,
                fontFamily: '"Segoe UI", Tahoma, sans-serif',
                fontWeight: '600',
                lineHeight: '1',
                webkitFontSmoothing: 'antialiased',
                margin: '0 4px 0 0',
                cursor: 'pointer'
            });

            el.style.setProperty('background-color', bgFinal, 'important');
            el.style.setProperty('color', txFinal, 'important');
            el.style.setProperty('border', bordaFinal, 'important');

            if (!ignorarOrdem) el.style.order = regras.prio;
            el.setAttribute('data-loc-nome', nome);
            if (regras.grupo) el.setAttribute('data-loc-grupo', regras.grupo); else el.removeAttribute('data-loc-grupo');

            el.removeAttribute('title');
            el.onmousedown = (e) => e.stopPropagation();
        }

        document.addEventListener('contextmenu', (e) => {
            const target = e.target.closest('[data-loc-nome]');
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                abrirMenu(e, target.getAttribute('data-loc-nome'), target.hasAttribute('data-superproc-cor-azflow'), target);
            }
        }, true);

        // ---- Identificação dos links de localizadores e respeito ao ciclo de escrita do AZFLOW ----
        // O AZFLOW/eProc reescreve a região e nem sempre devolve os links com id="AbreLocalizadores".
        // Por isso os localizadores são reconhecidos pelo formato final (link com texto), sem depender do id,
        // e as cores só são aplicadas depois que a região para de ser modificada por eles.
        const QUIETUDE_MS = 80;
        const ESPERA_MAXIMA_MS = 1000;
        let ultimaMutacaoRegiao = 0;
        let inicioRajadaRegiao = 0;
        let observadorEstado = null;
        let agendarReaplicacao = () => {};

        function obterLinksLocalizadoresCapa(container) {
            if (!container) return [];
            return Array.from(container.querySelectorAll('a')).filter((a) => {
                const href = a.getAttribute('href') || '';
                if (href.includes('processo_localizador_historico_listar') || href.includes('duvida.png')) return false;
                if (a.querySelector('img[src*="duvida.png"]')) return false;
                if (String(a.className || '').includes('memoLocalizadorOrgao')) return false;
                if (a.getAttribute('data-azflow-troca-rapida-btn') === '1') return false;
                if (a.closest('[data-azflow-troca-rapida-wrap="1"], #s2id_selLocalizadoresProcesso, .select2-container, .select2-drop, .select2-dropdown')) return false;
                const clone = a.cloneNode(true);
                clone.querySelectorAll('svg, img').forEach(el => el.remove());
                const nome = (clone.textContent || '').replace(/\s+/g, ' ').trim();
                return !!nome && nome !== 'Localizador(es):';
            });
        }

        // Associa cada chip ao seu memo (a.memoLocalizadorOrgao<id>): pelo id do processo (campo oculto) e, sem ele, pela vizinhança original.
        function memosDaCapa(container, chips) {
            const resultado = new Map();
            const { nomeParaId } = idsDaCapa();
            const memoPorId = new Map();
            container.querySelectorAll('a[class*="memoLocalizadorOrgao"]').forEach((m) => {
                const mc = String(m.className).match(/memoLocalizadorOrgao(\d+)/);
                if (mc) memoPorId.set(mc[1], m);
            });
            chips.forEach((chip) => {
                const clone = chip.cloneNode(true);
                clone.querySelectorAll('svg, img').forEach(s => s.remove());
                const nome = (clone.textContent || '').replace(/\s+/g, ' ').trim();
                let memo = memoPorId.get(nomeParaId.get(norm(nome)));
                if (!memo) {
                    const prox = chip.nextElementSibling;
                    if (prox && String(prox.className || '').includes('memoLocalizadorOrgao')) memo = prox;
                }
                if (memo) resultado.set(chip, memo);
            });
            return resultado;
        }

        function regiaoEmModificacao() {
            const agora = Date.now();
            return (agora - ultimaMutacaoRegiao) < QUIETUDE_MS && (agora - inicioRajadaRegiao) < ESPERA_MAXIMA_MS;
        }

        // Sinal universal (host/background): pedidos alterar_localizadores em andamento, por id.
        // Ligado = a região está no meio de uma mudança; o término dispara a pintura na hora.
        const mudancasEmCurso = new Set();

        function processarTudo(ignorarQuietude = false) {
            if (mudancasEmCurso.size) return false; // interruptor ligado: espera o "atualizados"
            if (isPaginaCapa && !ignorarQuietude && regiaoEmModificacao()) {
                agendarReaplicacao();
                return false;
            }
            try {
                processarTudoInterno();
            } finally {
                // Descarta os registros gerados pela nossa própria escrita, para não contá-los como modificação alheia.
                if (observadorEstado) observadorEstado.takeRecords();
            }
            return true;
        }

        // ---- Listas de processos: por localizador (localizador_processos_lista) e relatório geral (relatorio_geral/index) ----
        // As duas trazem o código de cada localizador (<input name="numIdLocalizadorOrgao" value="ID">), mas montam a coluna de
        // forma diferente:
        //   por localizador: <input> Nome (o fixo em <u><b>) <a class="memoLocalizadorOrgaoID"> " - " ...
        //   relatório geral: "• Nome" ("(Princ.)" no principal) <a class="memoLocalizadorOrgaoID"> <input> <br> ...
        // Cada página tem o seu leitor de célula; a montagem é a mesma e copia a estética da capa: uma pílula por localizador
        // (31 px, 13 px, canto de 6 px), o memo ao lado, o fixo/principal com o alfinete, ordenadas pela prioridade. O código
        // fica no data-loc-id da pílula. O que não for reconhecido (sem os campos ocultos) segue o caminho antigo (texto solto).
        const ehMemo = (n) => n.nodeType === Node.ELEMENT_NODE && String(n.className || '').includes('memoLocalizadorOrgao');
        const ehCodigo = (n) => n.nodeType === Node.ELEMENT_NODE && n.matches('input[name="numIdLocalizadorOrgao"]');

        function lerCelulaPorLocalizador(celula) {
            const entradas = [];
            let atual = null;
            for (const no of Array.from(celula.childNodes)) {
                if (ehCodigo(no)) { atual = { input: no, nomeNos: [], memo: null }; entradas.push(atual); }
                else if (atual && !atual.memo) {
                    if (ehMemo(no)) atual.memo = no; else atual.nomeNos.push(no);
                }
            }
            for (const e of entradas) {
                e.nome = e.nomeNos.map(n => n.textContent).join('').replace(/\s+/g, ' ').replace(/^\s*-\s*|\s*-\s*$/g, '').trim();
                e.fixo = e.nomeNos.some(n => n.nodeType === Node.ELEMENT_NODE && (n.matches('u, b, strong') || n.querySelector('u, b, strong')));
            }
            return entradas;
        }

        function lerCelulaDoRelatorio(celula) {
            const segmentos = [[]];
            for (const no of Array.from(celula.childNodes)) {
                if (no.nodeType === Node.ELEMENT_NODE && no.tagName === 'BR') segmentos.push([]); else segmentos[segmentos.length - 1].push(no);
            }
            const entradas = [];
            for (const seg of segmentos) {
                const input = seg.find(ehCodigo);
                if (!input) continue;
                const memo = seg.find(ehMemo) || null;
                const nomeNos = seg.filter(n => n !== input && n !== memo && !(n.nodeType === Node.ELEMENT_NODE && n.matches('input')));
                let nome = nomeNos.map(n => n.textContent).join('').replace(/\s+/g, ' ').replace(/^\s*•\s*/, '').trim();
                const principal = /\s*\(Princ\.\)\s*$/i.test(nome); // o principal do relatório é o fixo da capa
                if (principal) nome = nome.replace(/\s*\(Princ\.\)\s*$/i, '').trim();
                entradas.push({ input, memo, nomeNos, nome, fixo: principal });
            }
            return entradas;
        }

        function pintarListaDeLocalizadores(lista) {
            const itens = Array.from(lista.children).map((item, ordem) => {
                const pill = item.querySelector('.meu-loc-pill');
                const nome = pill ? pill.textContent.trim() : '';
                // Grupo oculto: o item (pílula e memo) some da lista; segue no DOM para voltar quando o grupo deixar de ser oculto.
                const idItem = pill && pill.getAttribute('data-loc-id');
                item.hidden = !!idItem && idsOcultos.has(idItem);
                let prio = 9;
                if (pill) { aplicarEstiloBase(pill, nome, true); prio = resolverRegras(nome, pill).prio; }
                return { item, prio, ordem };
            });
            itens.sort((a, b) => (a.prio - b.prio) || (a.ordem - b.ordem));
            if (itens.some((x, i) => lista.children[i] !== x.item)) itens.forEach(x => lista.append(x.item));
        }

        function montarCelulaDeLocalizadores(celula, ler) {
            let lista = celula.querySelector(':scope > .sp-loc-lista');
            if (!lista) {
                const entradas = ler(celula).filter(e => e.nome);
                if (!entradas.length) return false;
                lista = document.createElement('span');
                lista.className = 'sp-loc-lista';
                for (const e of entradas) {
                    const item = document.createElement('span');
                    item.className = 'sp-loc-item';
                    const pill = document.createElement('span');
                    pill.textContent = e.nome;
                    pill.setAttribute('data-loc-id', e.input.value);
                    if (e.fixo) { pill.setAttribute('data-loc-fixo', ''); pill.title = 'Localizador fixo'; }
                    pill.className = 'meu-loc-pill';
                    item.append(e.input, pill);
                    if (e.memo) item.append(e.memo);
                    lista.append(item);
                    e.nomeNos.forEach(n => n.remove()); // o nome original vira só a pílula
                }
                // O que sobrou na célula são separadores (" - ", "•", quebras de linha) e espaços.
                celula.querySelectorAll(':scope > br').forEach(b => b.remove());
                for (const no of Array.from(celula.childNodes)) if (no.nodeType === Node.TEXT_NODE && !no.textContent.replace(/[\s•-]/g, '')) no.remove();
                celula.prepend(lista);
            }
            pintarListaDeLocalizadores(lista); // também nas repinturas: cor ou prioridade mudaram
            return true;
        }

        function pintarListaNativa() {
            const acao = new URLSearchParams(location.search).get('acao');
            const ler = acao === 'localizador_processos_lista' ? lerCelulaPorLocalizador : acao === 'relatorio_geral/index' ? lerCelulaDoRelatorio : null;
            if (!ler) return;
            const cabecalho = (celula) => celula.tagName === 'TH' && /^localizador(?:es)?$/.test(norm(celula.textContent));
            for (const tabela of document.querySelectorAll('table')) {
                const linhaCabecalho = Array.from(tabela.rows).find(linha => Array.from(linha.cells).some(cabecalho));
                if (!linhaCabecalho) continue;
                const coluna = Array.from(linhaCabecalho.cells).findIndex(cabecalho);
                for (const linha of tabela.rows) {
                    const celula = linha.cells[coluna];
                    if (celula?.tagName !== 'TD' || linha.cells.length !== linhaCabecalho.cells.length ||
                        celula.querySelector('[data-azflow-listaprocloc-locator="true"]')) continue;
                    if (montarCelulaDeLocalizadores(celula, ler)) continue;
                    if (ler !== lerCelulaPorLocalizador) continue; // o texto solto só existe na lista por localizador
                    for (const no of Array.from(celula.childNodes)) {
                        if (no.nodeType === Node.TEXT_NODE) {
                            const partes = (no.textContent || '').split(/(\s+-\s+|^\s*-\s*|\s*-\s*$)/);
                            const fragmento = document.createDocumentFragment();
                            let alterado = false;
                            for (const [i, texto] of partes.entries()) {
                                const nome = texto.trim();
                                if (i % 2 || !nome) {
                                    fragmento.append(texto);
                                    continue;
                                }
                                const pill = document.createElement('span');
                                pill.className = 'meu-loc-pill';
                                pill.textContent = nome;
                                aplicarEstiloBase(pill, nome);
                                fragmento.append(pill);
                                alterado = true;
                            }
                            if (alterado) no.replaceWith(fragmento);
                        } else if (no.nodeType === Node.ELEMENT_NODE &&
                            (no.matches('.meu-loc-pill, b, strong, u') || no.matches('a:not([class*="memoLocalizadorOrgao"])')) &&
                            !no.querySelector('img, svg, input, button')) {
                            const nome = no.textContent.trim();
                            if (!nome) continue;
                            no.classList.add('meu-loc-pill');
                            aplicarEstiloBase(no, nome);
                        }
                    }
                }
            }
        }

        function processarTudoInterno() {
            if (!configs || Object.keys(configs).length === 0) {
                configs = carregarConfiguracoes();
            }
            if (isPaginaCapa) {
                const capaDiv = document.querySelector('div#dvLocalizadoresOrgao');
                if (capaDiv) {
                    capaDiv.style.textAlign = 'left';

                    const locLinks = obterLinksLocalizadoresCapa(capaDiv);
                    if (locLinks.length > 0) {
                        const dados = locLinks.map(a => {
                            // Sempre relê o nome pelo texto: o eProc pode reaproveitar o <a> trocando só o
                            // conteúdo, e o data-loc-nome antigo aplicaria a cor de outro localizador.
                            const clone = a.cloneNode(true);
                            clone.querySelectorAll('svg, img').forEach(s => s.remove());
                            let nome = (clone.textContent || clone.innerText || '').replace(/\s+/g, ' ').trim();
                            if (!nome) nome = a.getAttribute('data-loc-nome') || '';
                            const prio = resolverRegras(nome, a).prio;
                            const idChip = idDe(nome, a);
                            return { a, nome, prio, oculto: !!idChip && idsOcultos.has(idChip) };
                        });
                        const memos = memosDaCapa(capaDiv, locLinks);

                        // Ordena pela sequência de prioridade do usuário (0 a 9)
                        dados.sort((x, y) => x.prio - y.prio);

                        // Elemento âncora após os localizadores para reordenação no DOM
                        const anchor = capaDiv.querySelector('[data-azflow-troca-rapida-wrap="1"]') ||
                                       capaDiv.querySelector('img[src*="duvida.png"]') ||
                                       capaDiv.querySelector('img[alt*="Ajuda localizadores"]') ||
                                       null;

                        // O memo de cada localizador acompanha o chip dele (não fica para trás quando a ordem muda).
                        // Localizadores de grupos ocultos somem da capa. Se TODOS do processo estiverem ocultos, nenhum é escondido:
                        // o clique na pílula é o que abre a edição dos localizadores (abreLocalizadores), e sem ela não haveria como editar.
                        const esconderOcultos = !dados.every(d => d.oculto);
                        dados.forEach(d => {
                            aplicarEstiloBase(d.a, d.nome, false);
                            d.a.style.order = d.prio;
                            d.a.toggleAttribute('data-loc-oculto', esconderOcultos && d.oculto);
                            if (esconderOcultos && d.oculto) d.a.style.setProperty('display', 'none', 'important'); // vence o display da capa
                            const memo = memos.get(d.a) || null;
                            if (anchor) {
                                capaDiv.insertBefore(d.a, anchor);
                                if (memo) capaDiv.insertBefore(memo, anchor);
                            } else {
                                capaDiv.appendChild(d.a);
                                if (memo) capaDiv.appendChild(memo);
                            }
                        });
                    }

                    Array.from(capaDiv.childNodes).forEach(n => { if (n.nodeType === 3 && n.textContent.includes('-')) n.textContent = ''; });
                }
            } else {
                pintarListaNativa();
                document.querySelectorAll('td:has(span[data-azflow-listaprocloc-locator])').forEach(td => {
                    let container = td.querySelector('.meu-container-visual');
                    if (!container) {
                        container = document.createElement('div');
                        container.className = 'meu-container-visual';
                        Object.assign(container.style, { display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'flex-start', alignItems: 'center' });
                        Array.from(td.childNodes).forEach(n => {
                            if (n.nodeType === 1) n.style.display = 'none';
                            if (n.nodeType === 3) n.textContent = '';
                        });
                        td.appendChild(container);
                        td.style.textAlign = 'left';
                    }

                    const locsReais = Array.from(td.querySelectorAll('span[data-azflow-listaprocloc-locator="true"]'));
                    const dados = locsReais.map(el => {
                        const nome = el.textContent.trim();
                        const pill = document.createElement('span');
                        pill.className = 'meu-loc-pill';
                        pill.innerText = nome;
                        aplicarEstiloBase(pill, nome, false, el);
                        const prio = resolverRegras(nome, el).prio;
                        return { el: pill, prio };
                    });

                    container.innerHTML = '';
                    dados.sort((a, b) => a.prio - b.prio).forEach(d => container.appendChild(d.el));
                });
            }
        }

        // Regras e grupos vêm da base comum: ao abrir, e a cada mudança, repinta.
        const recarregarGrupos = async () => {
            await carregarGrupos();
            try { processarTudo(true); } catch (erro) { console.warn('[SuperPROC] Falha ao aplicar as regras de grupo:', erro); }
        };
        recarregarGrupos();
        const sincronizarProprias = () => atualizarRegrasProprias().catch(erro => console.warn('[SuperPROC] Preferências de cor indisponíveis:', erro));
        sincronizarProprias();
        // Base alterada fora desta página (Organizador do navegador, outra aba, extensão): relê e repinta.
        SPBase.aoMudarBase(() => { sincronizarProprias(); recarregarGrupos(); });

        let menuAtivoCleanup = null;

        // Link do memo do localizador clicado: o da própria linha (listas), senão o do mesmo código (capa).
        function memoDoLocalizador(nome, alvoEl) {
            const item = alvoEl && alvoEl.closest ? alvoEl.closest('.sp-loc-item') : null;
            const daLinha = item && item.querySelector('a[class*="memoLocalizadorOrgao"]');
            if (daLinha) return daLinha;
            const { id } = chavesDe(nome, alvoEl);
            if (!id) return null;
            const area = (alvoEl && alvoEl.closest && alvoEl.closest('#dvLocalizadoresOrgao')) || document;
            return area.querySelector('a.memoLocalizadorOrgao' + id) || document.querySelector('a.memoLocalizadorOrgao' + id);
        }

        function abrirMenu(e, nome, corBloqueada, alvoEl = null) {
            if (menuAtivoCleanup) {
                menuAtivoCleanup();
            }
            const old = document.getElementById('menu-priv');
            if (old) old.remove();

            const menu = document.createElement('div');
            menu.id = 'menu-priv';
            Object.assign(menu.style, {
                position: 'fixed',
                background: 'white',
                border: '1px solid #dee2e6',
                padding: '15px',
                zIndex: 999999,
                borderRadius: '12px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                fontFamily: '"Segoe UI", sans-serif',
                width: '220px',
                boxSizing: 'border-box',
                left: '-9999px',
                top: '-9999px'
            });

            const regraAtual = regraPropria(nome, alvoEl);
            let corAtual = regraAtual.cor || '#e9ecef';
            let estaNaPaleta = false;

            let htmlPaleta = '<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; width: 100%;">';
            PALETA_LOCALIZADORES.forEach(c => {
                const isSelected = corAtual === c.bg;
                if (isSelected) estaNaPaleta = true;
                const borderStyle = isSelected ? '2px solid #000' : '1px solid #dee2e6';
                htmlPaleta += `<div class="c-box" data-bg="${c.bg}" data-tx="${c.tx}" style="aspect-ratio: 1/1; width: 100%; background:${c.bg}; cursor:pointer; border:${borderStyle}; border-radius:4px;"></div>`;
            });
            htmlPaleta += '</div>';

            let corCustomValue = estaNaPaleta ? '#007bff' : corAtual; 
            const prioAtual = (regraAtual.prio !== undefined) ? regraAtual.prio : 9;
            const grupoDoNome = grupoDoLocalizador(nome, alvoEl);
            const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const infoGrupo = grupoDoNome
                ? `<div style="font-size: 12px; margin-bottom: 8px; color: #555;">Grupo: <b>${esc(grupoDoNome)}</b>${regrasGrupos[grupoDoNome] ? ' (com regra de cor/prioridade)' : ''}</div>`
                : '';

            // Sem o código, a cor fica guardada só pelo nome e se perde se o localizador for renomeado. O catálogo de códigos
            // vem da lista de localizadores de destino da tela de minuta; depois disso a cor passa para o código sozinha.
            const textoCodigo = chavesDe(nome, alvoEl).id ? ''
                : indice.ambiguo(nome)
                    ? 'Há mais de um localizador com este nome. Salva aqui, a cor vale para todos eles. Para colorir só este, clique com o botão direito nele na capa do processo.'
                    : 'Código deste localizador ainda desconhecido: a cor vale só para este nome. Abra uma vez a tela de nova minuta para o SuperPROC ler os códigos. Depois disso, a cor continua mesmo se o localizador for renomeado.';
            const infoCodigo = textoCodigo
                ? `<div role="note" style="font-size: 11px; margin-bottom: 8px; padding: 6px 8px; background: #fff8e1; border: 1px solid #ffc107; border-radius: 6px; color: #5c4400;">${textoCodigo}</div>`
                : '';

            menu.innerHTML = `
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 5px; color: #333; word-break: break-word;">${esc(nome)}</div>
                ${infoCodigo}
                ${infoGrupo}
                <div style="font-size: 13px; margin-bottom: 4px; color: #666; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span>Prioridade (0-9): <input type="number" id="in-prio" value="${prioAtual}" min="0" max="9" style="width: 45px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 4px;"></span>
                    <span id="in-memo-vaga"></span>
                </div>
                <div style="font-size: 11px; margin-bottom: 8px; color: #888;">9 = padrão: vale a prioridade do grupo, se houver.</div>
                ${htmlPaleta}
                <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 13px; color: #666;">Personalizada:</span>
                    <input type="color" id="in-cor-custom" value="${corCustomValue}" style="border: none; width: 28px; height: 28px; cursor: pointer; background: transparent; padding: 0;">
                </div>
                <button id="in-sem-cor" type="button" style="margin-top: 10px; width: 100%; padding: 6px; background: #f1f3f5; color: #495057; border: 1px solid #dee2e6; border-radius: 8px; cursor: pointer; font-size: 12px;">Sem cor própria (usar a do grupo ou a padrão)</button>
                <div style="font-size: 11px; margin-top: 6px; color: #888;">A cor do AZflow, quando houver, prevalece sobre a sua; a sua prevalece sobre a do grupo.</div>
                <button id="in-save" style="margin-top: 12px; width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px; text-transform: uppercase;">SALVAR</button>
                <a id="in-grupos" href="#" style="display: block; margin-top: 10px; text-align: center; font-size: 12px; color: #0056b3;">Cores dos grupos…</a>
            `;
            if (corBloqueada) {
                menu.querySelectorAll('.c-box').forEach(amostra => { amostra.parentElement.hidden = true; amostra.parentElement.style.display = 'none'; });
                menu.querySelector('#in-cor-custom').parentElement.hidden = true;
                menu.querySelector('#in-cor-custom').parentElement.style.display = 'none';
                const aviso = menu.querySelector('#in-sem-cor');
                aviso.disabled = true;
                aviso.textContent = 'Cor definida pelo AZFlow';
            }
            document.body.appendChild(menu);

            // Ajuste inteligente para não vazar a tela (viewport clamping & flip)
            const MARGIN = 10;
            const vw = window.innerWidth || document.documentElement.clientWidth || 1000;
            const vh = window.innerHeight || document.documentElement.clientHeight || 800;

            const maxH = Math.max(150, vh - (MARGIN * 2));
            menu.style.maxHeight = maxH + 'px';
            menu.style.overflowY = 'auto';
            menu.style.overflowX = 'hidden';

            const menuRect = menu.getBoundingClientRect();
            const menuWidth = menuRect.width || 220;
            const menuHeight = menuRect.height || 340;

            // Posição horizontal inteligente
            let posX = e.clientX + 2;
            if (posX + menuWidth > vw - MARGIN) {
                // Inverte para a esquerda do cursor se não couber à direita
                posX = e.clientX - menuWidth - 2;
            }
            // Clamping horizontal seguro
            if (posX + menuWidth > vw - MARGIN) {
                posX = vw - menuWidth - MARGIN;
            }
            if (posX < MARGIN) {
                posX = MARGIN;
            }

            // Posição vertical inteligente
            let posY = e.clientY + 2;
            if (posY + menuHeight > vh - MARGIN) {
                // Inverte para cima do cursor se não couber abaixo
                posY = e.clientY - menuHeight - 2;
            }
            // Clamping vertical seguro
            if (posY + menuHeight > vh - MARGIN) {
                posY = vh - menuHeight - MARGIN;
            }
            if (posY < MARGIN) {
                posY = MARGIN;
            }

            menu.style.left = Math.round(posX) + 'px';
            menu.style.top = Math.round(posY) + 'px';

            let sBg = regraAtual.cor, sTx = regraAtual.tx;

            menu.querySelectorAll('.c-box').forEach(b => {
                b.onclick = () => {
                    menu.querySelectorAll('.c-box').forEach(x => x.style.border = '1px solid #dee2e6');
                    b.style.border = '2px solid #000';
                    sBg = b.dataset.bg; 
                    sTx = b.dataset.tx;
                };
            });

            menu.querySelector('#in-cor-custom').oninput = (e) => {
                sBg = e.target.value;
                sTx = calcularCorTexto(sBg);
                menu.querySelectorAll('.c-box').forEach(x => x.style.border = '1px solid #dee2e6');
            };

            const fecharMenu = () => {
                const el = document.getElementById('menu-priv');
                if (el) el.remove();
                document.removeEventListener('pointerdown', onPointerDown, true);
                document.removeEventListener('keydown', onKeyDown, true);
                menuAtivoCleanup = null;
            };

            const onPointerDown = (ev) => {
                if (!menu.contains(ev.target)) {
                    fecharMenu();
                }
            };

            const onKeyDown = (ev) => {
                if (ev.key === 'Escape') {
                    fecharMenu();
                }
            };

            menuAtivoCleanup = fecharMenu;

            document.getElementById('in-sem-cor').onclick = () => {
                sBg = '';
                sTx = '';
                menu.querySelectorAll('.c-box').forEach(x => x.style.border = '1px solid #dee2e6');
            };

            // Memo do localizador: o ícone que o eproc mostrava ao lado da pílula, agora aqui. Aciona o link original.
            const memoEl = memoDoLocalizador(nome, alvoEl);
            const vagaMemo = menu.querySelector('#in-memo-vaga');
            if (memoEl && vagaMemo) {
                const botaoMemo = document.createElement('button');
                botaoMemo.type = 'button';
                botaoMemo.id = 'in-memo';
                // Só o ícone (como o eproc o mostrava ao lado da pílula); o texto vira dica e nome acessível.
                botaoMemo.title = 'Abrir memo do localizador';
                botaoMemo.setAttribute('aria-label', 'Abrir memo do localizador');
                Object.assign(botaoMemo.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', margin: '0', padding: '0', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: '#333' });
                botaoMemo.onmouseenter = () => { botaoMemo.style.background = '#f1f3f5'; };
                botaoMemo.onmouseleave = () => { botaoMemo.style.background = 'transparent'; };
                const iconeOriginal = memoEl.querySelector('img');
                if (iconeOriginal && iconeOriginal.src) {
                    const icone = document.createElement('img');
                    icone.src = iconeOriginal.src;
                    icone.alt = '';
                    Object.assign(icone.style, { width: '24px', height: '24px', flex: '0 0 auto' });
                    botaoMemo.append(icone);
                } else botaoMemo.append('Memo'); // sem a imagem do eproc: texto curto no lugar
                botaoMemo.onclick = () => { fecharMenu(); try { memoEl.click(); } catch (_) { /* link removido da página */ } };
                vagaMemo.replaceWith(botaoMemo);
            } else if (vagaMemo) vagaMemo.remove();

            document.getElementById('in-grupos').onclick = (ev) => {
                ev.preventDefault();
                // Cores dos grupos ficam no Organizador do navegador (edição de cada grupo).
                SPBase.abrirOrganizador('loc');
                fecharMenu();
            };

            document.getElementById('in-save').onclick = () => {
                const valPrio = parseInt(document.getElementById('in-prio').value);
                const prioSalvar = isNaN(valPrio) ? 9 : Math.max(0, Math.min(9, valPrio));
                // Grava pelo ID (sobrevive à renomeação) e pelo nome (a extensão ainda lê por nome).
                const regra = { prio: prioSalvar, cor: sBg, tx: sTx };
                // Nome repetido entre localizadores: com o código em mãos (capa), grava só pelo código, para não pintar os homônimos.
                const { id } = chavesDe(nome, alvoEl);
                const pelaEtiqueta = !(id && indice.ambiguo(nome));
                if (pelaEtiqueta) configs[nome] = regra;
                if (id) configs[SPBase.chaveDoId(id)] = regra;
                salvarConfiguracoes(configs);
                try {
                    SPBase.mudarPool(p => {
                        const k = norm(nome);
                        if (pelaEtiqueta && k !== '__proto__') p.proprias[k] = regra;
                        if (id) p.proprias[SPBase.chaveDoId(id)] = regra;
                    });
                }
                catch (erro) { console.warn('[SuperPROC] Não foi possível gravar a cor na base:', erro); }
                fecharMenu();
                processarTudo();
            };

            setTimeout(() => {
                document.addEventListener('pointerdown', onPointerDown, true);
                document.addEventListener('keydown', onKeyDown, true);
            }, 10);
        }

        // A varredura periódica é só rede de segurança. Se ela encontrar algo que o observador não captou,
        // isso é registrado no console para que a causa seja corrigida, em vez de depender do relógio.
        let sinalizarPerdidaPeloObservador = () => {};
        const work = domWork({run:() => { sinalizarPerdidaPeloObservador(); return processarTudo(); }, fallback:10000});
        // O detail vem como string JSON (atravessa mundos isolados); aceita objeto e ausência (emissores antigos).
        const lerSinal = (evento) => {
            try {
                const d = evento.detail;
                return (typeof d === 'string' ? JSON.parse(d) : d) || {};
            } catch (_) { return {}; }
        };
        // Pintura imediata ao término; na capa é redefinida abaixo (precisa do estado da região).
        let pintarAgora = () => work.schedule();
        window.addEventListener('superproc:localizadores-vai-mudar', (evento) => {
            const { id } = lerSinal(evento);
            if (id != null) mudancasEmCurso.add(String(id));
        });
        window.addEventListener('superproc:localizadores-atualizados', (evento) => {
            const { id } = lerSinal(evento);
            if (id != null) mudancasEmCurso.delete(String(id)); else mudancasEmCurso.clear(); // sem id = término geral
            if (!mudancasEmCurso.size) pintarAgora();
        });
        window.addEventListener('pagehide', () => mudancasEmCurso.clear());

        // ---- Detecção de mudança de estado da região de localizadores (capa) ----
        // Alternar visualização <-> edição, salvar/cancelar e a reescrita do contêiner pelo eProc
        // (atualizaLocalizadoresCapa) nem sempre geram uma mudança de filhos que o laço periódico
        // perceba a tempo. O estado é comparado por assinatura e, mudando, as cores são reaplicadas.
        if (isPaginaCapa) {
            const ID_VISUALIZACAO = 'dvLocalizadoresOrgao';
            const ID_EDICAO = 'dvLocalizadores';
            const visivel = (el) => !el ? 'x' : (window.getComputedStyle(el).display === 'none' ? '0' : '1');
            const lerAssinaturaEstado = () => {
                const orgao = document.getElementById(ID_VISUALIZACAO);
                const editor = document.getElementById(ID_EDICAO);
                const links = orgao ? obterLinksLocalizadoresCapa(orgao) : [];
                const semTratamento = links.filter(a => !a.hasAttribute('data-loc-nome')).length;
                const nomes = orgao ? (orgao.textContent || '').replace(/\s+/g, ' ').trim() : '';
                return visivel(orgao) + visivel(editor) + '|' + links.length + '|' + semTratamento + '|' + nomes;
            };
            let ultimaAssinatura = '';
            let rajada = []; // timers de reserva do clique em Salvar/Cancelar (cancelados pelo término avisado)
            sinalizarPerdidaPeloObservador = () => {
                try {
                    if (!agendado && lerAssinaturaEstado() !== ultimaAssinatura) {
                        console.info('[SuperPROC][localizadores] Mudança captada pela varredura periódica, não pelo observador.');
                    }
                } catch (_) { /* diagnóstico apenas */ }
            };
            const reavaliarEstado = (forcar, ignorarQuietude = false) => {
                let aplicou = true;
                try {
                    if (!forcar && lerAssinaturaEstado() === ultimaAssinatura) return;
                    aplicou = processarTudo(ignorarQuietude) !== false;
                } catch (e) {
                    console.warn('[SuperPROC] Falha ao reaplicar cores dos localizadores:', e);
                } finally {
                    // Se a aplicação foi adiada (região ainda sendo modificada), mantém a assinatura antiga
                    // para que a próxima passada reaplique.
                    if (aplicou) ultimaAssinatura = lerAssinaturaEstado();
                }
            };

            // Espera a região ficar parada (QUIETUDE_MS sem mutações) antes de reaplicar; a espera total é limitada
            // para não ficar indefinidamente adiada se algo mutar sem parar.
            let agendado = null;
            let inicioPendencia = 0;
            const agendar = () => {
                if (mudancasEmCurso.size) return; // mudança em curso: o término avisado pinta, sem reagendar nada
                const agora = Date.now();
                if (!inicioPendencia) inicioPendencia = agora;
                if (agendado) {
                    if (agora - inicioPendencia >= ESPERA_MAXIMA_MS) return;
                    clearTimeout(agendado);
                }
                agendado = setTimeout(() => { agendado = null; inicioPendencia = 0; reavaliarEstado(false); }, QUIETUDE_MS);
            };
            agendarReaplicacao = agendar;
            // Término avisado: o resultado já foi entregue, pinta na hora (sem esperar silêncio) e descarta as
            // reavaliações de reserva que o clique em Salvar/Cancelar havia agendado.
            pintarAgora = () => {
                rajada.forEach(clearTimeout);
                rajada = [];
                clearTimeout(agendado); agendado = null; inicioPendencia = 0;
                reavaliarEstado(true, true);
            };

            const noDentroDaRegiao = (n) => {
                const el = n && n.nodeType === 1 ? n : (n && n.parentElement);
                return !!(el && el.closest && el.closest('#' + ID_VISUALIZACAO + ', #' + ID_EDICAO));
            };
            const nodeEhRegiao = (n) => !!(n && n.nodeType === 1 &&
                (n.id === ID_VISUALIZACAO || n.id === ID_EDICAO ||
                 (n.querySelector && n.querySelector('#' + ID_VISUALIZACAO + ', #' + ID_EDICAO))));
            const registroTocaRegiao = (r) => noDentroDaRegiao(r.target) ||
                Array.from(r.addedNodes).some(nodeEhRegiao) || Array.from(r.removedNodes).some(nodeEhRegiao);

            observadorEstado = new MutationObserver((registros) => {
                if (registros.some(registroTocaRegiao)) {
                    const agora = Date.now();
                    if ((agora - ultimaMutacaoRegiao) > QUIETUDE_MS) inicioRajadaRegiao = agora;
                    ultimaMutacaoRegiao = agora;
                }
                const relevante = registros.some(r => r.type === 'childList' ||
                    (r.type === 'characterData' && noDentroDaRegiao(r.target)) ||
                    (r.target && (r.target.id === ID_VISUALIZACAO || r.target.id === ID_EDICAO)));
                if (relevante) agendar();
            });
            observadorEstado.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'hidden']
            });

            // Salvar/cancelar/abrir edição: reaplica em rajada enquanto o eProc conclui a atualização.
            document.addEventListener('click', (e) => {
                const alvo = e.target && e.target.closest
                    ? e.target.closest('#salvar, #cancelar, #hAlterar, #AbreLocalizadores, a[href*="abreLocalizadores"]')
                    : null;
                if (!alvo) return;
                rajada.forEach(clearTimeout);
                rajada = [0, 80, 250, 600, 1200, 2500].map(ms => setTimeout(() => reavaliarEstado(true), ms));
            }, true);

            reavaliarEstado(true);
        }
})();
