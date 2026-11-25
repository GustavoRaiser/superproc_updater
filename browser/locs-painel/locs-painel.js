// Painel "Meus Localizadores" do navegador SuperPROC (camada: shell; janela própria, browser/locs-painel-host.js).
//
// Vive fora das páginas do eproc: sobrevive a qualquer navegação e não é reinjetado a cada carga. Mesmo layout do antigo módulo
// da extensão (colunas, grupos, arrastar e soltar, filtro, ocultar vazios, criar/excluir grupo e copiar estilo).
//
// Dados: a base comum no localStorage da origem do eproc (docs/ia/POOL-COMUM.md): organização do painel (eproc_locs_*),
// cores (superproc_pool_cores_v1, mantida pelos Localizadores Coloridos e pelo Organizador do navegador) e grupos do Smart
// Localizadores (eproc_smartloc_*). O host lê essas chaves numa aba do eproc e as entrega aqui como espelho (`armazem`);
// o que o painel grava volta ao host, que escreve na mesma base. A lista é buscada pelo host a cada abertura: o painel
// mostra na hora a última lista guardada e só redesenha se a nova vier diferente.

(() => {
  const api = window.locsApi;
  let chaves = {}; // espelho das chaves da base comum do eproc (enviado pelo host a cada abertura e a cada carga de página)
  const armazem = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(chaves, k) ? chaves[k] : null),
    setItem: (k, v) => { const s = String(v); if (chaves[k] === s) return; chaves[k] = s; api.gravar(k, s); }
  };

  const STORAGE_KEY_GRUPOS = 'eproc_locs_grupos_lista';
  const STORAGE_KEY_ESTRUTURA = 'eproc_locs_estrutura_ordem';
  const STORAGE_KEY_CACHE = 'eproc_locs_dados_cache';
  const STORAGE_KEY_OCULTAR_VAZIOS = 'eproc_locs_ocultar_vazios';
  const LARGURA_COLUNA = 255;
  const ESPACO_COLUNAS = 12;

  // ---- Pool comum (docs/ia/POOL-COMUM.md): mesmo endereço e formato que a extensão SuperPROC usa, no localStorage do
  // eproc. Com a extensão presente, ela mantém as cores aqui; sem ela, o navegador cria a pool vazia no mesmo lugar. ----
  const CHAVE_POOL_CORES = 'superproc_pool_cores_v1';
  const CHAVES_SMARTLOC = { grupos: 'eproc_smartloc_grupos', estrutura: 'eproc_smartloc_estrutura' };
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const normCor = (s) => String(s).normalize('NFC').replace(/️/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  function lerPoolCores() {
    let p = null;
    try { const bruto = armazem.getItem(CHAVE_POOL_CORES); p = bruto && bruto.length < 1024 * 1024 ? JSON.parse(bruto) : null; } catch (_) { p = null; }
    if (!p || typeof p !== 'object' || p.v !== 1) {
      // Pool ausente: sem cores. Quem cria a pool são as páginas do eproc (eproc-recursos/base.js), nunca este painel.
      p = { v: 1, at: 0, proprias: {}, az: {}, regrasGrupos: {}, catalogoLoc: [] };
    }
    const mapa = (m) => (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    return { proprias: mapa(p.proprias), az: mapa(p.az), regrasGrupos: mapa(p.regrasGrupos), catalogoLoc: Array.isArray(p.catalogoLoc) ? p.catalogoLoc : [] };
  }
  function corDoTexto(hex) {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 >= 128 ? '#212529' : '#ffffff';
  }
  // Mesma precedência da extensão: cor do AZflow > cor própria > regra do grupo do Smart Localizadores.
  function montarCores() {
    const pool = lerPoolCores();
    const grupoPorTexto = new Map();
    try {
      const grupos = JSON.parse(armazem.getItem(CHAVES_SMARTLOC.grupos) || '[]');
      const estrutura = JSON.parse(armazem.getItem(CHAVES_SMARTLOC.estrutura) || '{}');
      const textoPorId = new Map(pool.catalogoLoc.filter(c => c && typeof c.value === 'string' && typeof c.text === 'string').map(c => [c.value, c.text]));
      for (const g of Array.isArray(grupos) ? grupos : []) {
        if (g === 'Sem Grupo' || g === 'Ocultos') continue;
        for (const id of Array.isArray(estrutura[g]) ? estrutura[g] : []) {
          const texto = textoPorId.get(id);
          if (!texto) continue;
          grupoPorTexto.set(normCor(texto), g);
          const curto = texto.split(/\s+-\s+/)[0];
          if (!grupoPorTexto.has(normCor(curto))) grupoPorTexto.set(normCor(curto), g);
        }
      }
    } catch (_) {}
    const valida = (r) => r && typeof r.cor === 'string' && HEX.test(r.cor);
    return (curto, completo) => {
      const az = pool.az[normCor(curto)];
      if (valida(az)) return { bg: az.cor, tx: HEX.test(az.tx || '') ? az.tx : '#ffffff' };
      const propria = pool.proprias[normCor(curto)];
      if (valida(propria)) return { bg: propria.cor, tx: HEX.test(propria.tx || '') ? propria.tx : corDoTexto(propria.cor) };
      const g = grupoPorTexto.get(normCor(completo)) || grupoPorTexto.get(normCor(curto));
      const rg = g && pool.regrasGrupos[g];
      if (valida(rg)) return { bg: rg.cor, tx: HEX.test(rg.tx || '') ? rg.tx : corDoTexto(rg.cor) };
      return null;
    };
  }

  const getStorage = (key, padrao) => { try { const v = armazem.getItem(key); return v !== null ? JSON.parse(v) : padrao; } catch { return padrao; } };
  const setStorage = (key, val) => { try { armazem.setItem(key, JSON.stringify(val)); } catch (_) {} };
  const normalizarTexto = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  // ---- Navegação: o host confere a origem e abre na aba principal do eproc ----
  function pedirNavegacao(url) {
    if (!url) return;
    api.navegar(String(url)); // o host fecha a janela depois de conferir o endereço
    fecharLocal();
  }

  // ---- Estilos ----
  const style = document.createElement('style');
  style.id = 'sp-locs-barra-style';
  style.textContent = `
    html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    #sp-locs-flyout { position: absolute; top: 0; left: 0; width: max-content; max-width: 900px; max-height: 600px; background: #ffffff; border-radius: 6px; z-index: 2147483000; overflow-x: hidden; overflow-y: auto; border: 1px solid #ced4da; font-family: Roboto, Arial, sans-serif; font-size: 12px; color: #212529; display: none; padding: 0; box-sizing: border-box; user-select: none; text-align: left; line-height: normal; }
    #sp-locs-flyout * { box-sizing: border-box; }
    #sp-locs-flyout .quick-locs-toolbar { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 14px; padding: 8px 12px; background: #ffffff; border-bottom: 1px solid #dee2e6; }
    #sp-locs-flyout .quick-locs-filter { flex: 1; min-width: 140px; height: 28px; padding: 0 8px; border: 1px solid #ced4da; border-radius: 4px; background: #ffffff; color: #212529; font: 12px Roboto, Arial, sans-serif; user-select: text; margin: 0; }
    #sp-locs-flyout .quick-locs-filter::placeholder { color: #6c757d; }
    #sp-locs-flyout .quick-locs-filter:focus { outline: 2px solid #0056b3; outline-offset: 0; border-color: #0056b3; }
    #sp-locs-flyout .quick-locs-cfg { flex: none; width: 30px; height: 28px; margin: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #ced4da; border-radius: 4px; background: #ffffff; color: #495057; cursor: pointer; }
    #sp-locs-flyout .quick-locs-cfg:hover, #sp-locs-flyout .quick-locs-cfg[aria-expanded="true"] { background: #f1f3f5; color: #212529; }
    #sp-locs-flyout .quick-locs-cfg:focus-visible { outline: 2px solid #0056b3; outline-offset: 1px; }
    #sp-locs-flyout .quick-locs-menu { position: absolute; top: calc(100% - 2px); right: 12px; z-index: 102; min-width: 190px; padding: 4px; background: #ffffff; border: 1px solid #adb5bd; border-radius: 5px; display: flex; flex-direction: column; }
    #sp-locs-flyout .quick-locs-menu[hidden] { display: none; }
    #sp-locs-flyout .quick-locs-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; margin: 0; padding: 0 10px; border: 0; border-radius: 3px; background: none; color: #212529; font: 12px Roboto, Arial, sans-serif; text-align: left; cursor: pointer; white-space: nowrap; }
    #sp-locs-flyout .quick-locs-menu-item:hover, #sp-locs-flyout .quick-locs-menu-item:focus-visible { background: #f1f3f5; outline: none; }
    #sp-locs-flyout .quick-locs-menu-item.is-danger:hover { background: #fee2e2; color: #b91c1c; }
    #sp-locs-flyout .quick-locs-menu-item input { margin: 0; accent-color: #0056b3; cursor: pointer; }
    #sp-locs-flyout .quick-locs-cfg:disabled { opacity: 0.65; cursor: default; }
    #sp-locs-flyout .quick-locs-cfg.is-loading svg { animation: sp-locs-giro 0.8s linear infinite; }
    @media (prefers-reduced-motion: reduce) { #sp-locs-flyout .quick-locs-cfg.is-loading svg { animation: none; } }
    #sp-locs-flyout .quick-locs-footer:empty { display: none; }
    #sp-locs-flyout .quick-locs-semgrupo-itens { display: grid; column-gap: 12px; grid-auto-flow: column; }
    #sp-locs-flyout .quick-locs-toggle { display: inline-flex; align-items: center; gap: 6px; color: #495057; cursor: pointer; white-space: nowrap; margin:0; font-weight: normal; font-size: 12px; }
    #sp-locs-flyout .quick-locs-toggle input { margin: 0; accent-color: #0056b3; cursor: pointer; }
    #sp-locs-flyout .quick-locs-columns { display: flex; align-items: flex-start; gap: 12px; padding: 4px 12px 8px; }
    #sp-locs-flyout .quick-locs-col { width: ${LARGURA_COLUNA}px; flex: none; align-self: stretch; padding-bottom: 8px; }
    #sp-locs-flyout .quick-group-wrapper { width: 100%; margin-bottom: 10px; }
    #sp-locs-flyout .quick-group-wrapper.drag-over-fim { box-shadow: inset 0 -2px 0 #0056b3; }
    #sp-locs-flyout .quick-locs-nores { padding: 24px 12px; text-align: center; color: #6c757d; display: none; }
    #sp-locs-flyout .quick-group-header { font-size: 11px; font-weight: bold; color: #0056b3; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 4px 3px 4px; margin-top: 6px; margin-bottom: 4px; border-bottom: 2px solid #0056b3; display: flex; justify-content: space-between; align-items: center; cursor: default; width: 100%; background: #ffffff; }
    #sp-locs-flyout .quick-group-header.dragging-group { opacity: 0.4; }
    #sp-locs-flyout .quick-group-header.drag-over-group-top { border-top: 2px dashed #0056b3; }
    #sp-locs-flyout .quick-group-header.drag-over-group-bottom { border-bottom: 2px dashed #0056b3; }
    #sp-locs-flyout .quick-group-total { color: #6c757d; font-weight: normal; letter-spacing: 0; font-variant-numeric: tabular-nums; }
    #sp-locs-flyout .quick-group-empty-notice { font-size: 11px; color: #6c757d; font-style: italic; padding: 6px; border: 1px dashed #ced4da; border-radius: 4px; text-align: center; width: 100%; }
    #sp-locs-flyout .quick-loc-item { width: 100%; height: 28px; margin-bottom: 2px; background: #ffffff; border: 1px solid #dee2e6; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px; cursor: pointer; user-select: none; text-decoration: none; }
    #sp-locs-flyout .quick-loc-item:hover { background-color: #f1f3f5; border-color: #ced4da; text-decoration: none; }
    #sp-locs-flyout .quick-loc-item.is-colorido { background-color: var(--loc-bg); border-color: transparent; }
    #sp-locs-flyout .quick-loc-item.is-colorido:hover { background-color: var(--loc-bg); filter: brightness(0.93); }
    #sp-locs-flyout .quick-loc-item.is-colorido .quick-loc-name, #sp-locs-flyout .quick-loc-item.is-colorido .quick-loc-count { color: var(--loc-tx); }
    #sp-locs-flyout .quick-loc-item:focus-visible { outline: 2px solid #0056b3; outline-offset: -2px; }
    #sp-locs-flyout .quick-loc-item.dragging { opacity: 0.4; }
    #sp-locs-flyout .quick-loc-item.drag-over-top { border-top: 2px solid #0056b3; }
    #sp-locs-flyout .quick-loc-item.drag-over-bottom { border-bottom: 2px solid #0056b3; }
    #sp-locs-flyout .quick-loc-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #212529; font-weight: 500; pointer-events: none; }
    #sp-locs-flyout .quick-loc-count { color: #0056b3; font-weight: bold; min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; pointer-events: none; }
    #sp-locs-flyout .quick-loc-empty { opacity: 0.65; cursor: default; }
    #sp-locs-flyout .quick-loc-empty .quick-loc-name { font-weight: normal; }
    #sp-locs-flyout .quick-loc-empty .quick-loc-count { color: #6c757d; }
    #sp-locs-flyout .quick-locs-footer { position: sticky; bottom: 0; background: #ffffff; border-top: 1px solid #dee2e6; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; z-index: 100; }
    #sp-locs-flyout .quick-footer-set { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    #sp-locs-flyout .quick-btn-group-action { font: 500 11px Roboto, Arial, sans-serif; height: 26px; padding: 0 10px; margin: 0; border-radius: 4px; border: 1px solid #ced4da; background: #ffffff; cursor: pointer; color: #495057; display: inline-flex; align-items: center; gap: 5px; }
    #sp-locs-flyout .quick-btn-group-action:hover:not(:disabled) { background: #f1f3f5; color: #212529; }
    #sp-locs-flyout .quick-btn-group-action:focus-visible { outline: 2px solid #0056b3; outline-offset: 1px; }
    #sp-locs-flyout .quick-btn-group-action:disabled { opacity: 0.65; cursor: default; }
    #sp-locs-flyout .quick-btn-group-action.is-primary { color: #0056b3; border-color: #0056b3; }
    #sp-locs-flyout .quick-btn-group-action.is-danger:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; border-color: #b91c1c; }
    #sp-locs-flyout .quick-btn-group-action.is-loading svg { animation: sp-locs-giro 0.8s linear infinite; }
    @keyframes sp-locs-giro { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { #sp-locs-flyout .quick-btn-group-action.is-loading svg { animation: none; } }
    #sp-locs-flyout .quick-inline-form { flex-basis: 100%; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 6px; margin: 0; }
    #sp-locs-flyout .quick-inline-form input[type="text"], #sp-locs-flyout .quick-inline-form textarea { border: 1px solid #ced4da; border-radius: 4px; background: #ffffff; color: #212529; font: 12px Roboto, Arial, sans-serif; user-select: text; }
    #sp-locs-flyout .quick-inline-form input[type="text"] { flex: 1; min-width: 0; height: 26px; padding: 0 8px; }
    #sp-locs-flyout .quick-style-editor { flex-direction: column; align-items: stretch; }
    #sp-locs-flyout .quick-style-editor label { color: #495057; font-weight: normal; }
    #sp-locs-flyout .quick-style-editor textarea { display: block; width: 100%; height: 160px; margin-top: 6px; padding: 6px 8px; font: 11px Consolas, monospace; }
    #sp-locs-flyout .quick-style-editor .quick-footer-set { justify-content: flex-start; }
    #sp-locs-flyout .quick-inline-msg { color: #b02a37; font-size: 11px; }
    #sp-locs-flyout #sp-locs-modal-del { position: absolute; top: calc(100% - 2px); right: 12px; background: #ffffff; border: 1px solid #adb5bd; border-radius: 5px; box-shadow: none; padding: 8px; z-index: 101; width: 230px; max-height: 220px; overflow-y: auto; display: none; }
    #sp-locs-flyout .del-group-title { font-weight: bold; color: #212529; }
    #sp-locs-flyout .del-group-hint { color: #6c757d; font-size: 10px; margin: 2px 0 6px; }
    #sp-locs-flyout .del-group-item { width: 100%; padding: 5px 6px; font: 11px Roboto, Arial, sans-serif; color: #212529; background: none; border: 0; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 3px; }
    #sp-locs-flyout .del-group-item:hover { background-color: #fee2e2; color: #b91c1c; }
  `;
  (document.head || document.documentElement).appendChild(style);

  const flyout = document.createElement('div');
  flyout.id = 'sp-locs-flyout';
  flyout.setAttribute('role', 'dialog');
  flyout.setAttribute('aria-label', 'Meus Localizadores');
  document.body.appendChild(flyout);

  let urlLocs = '';          // página nativa "Meus Localizadores" (com hash da sessão), enviada pelo host
  let larguraMax = 900;      // espaço disponível na janela do navegador (px), enviado pelo host a cada abertura
  let alturaMax = 600;       // altura disponível abaixo da barra (px), idem; base da regra de 50% do "Sem Grupo"
  let dadosCache = [];
  let filtroAtual = '';
  let draggedItemNome = null;
  let draggedGrupoNome = null;
  let arrasteAtivo = false;
  let redesenhoPendente = false;
  let ponteiroDentro = false;

  const aberto = () => flyout.style.display === 'block';

  // ---- Tamanho da janela e hover (quem fecha por saída do ponteiro é o host, que também vê o botão da barra) ----
  // Informa ao host o tamanho do painel; a janela acompanha (a borda direita fica alinhada ao botão).
  function posicionar() {
    if (!aberto()) return;
    api.tamanho({ w: Math.ceil(flyout.offsetWidth), h: Math.ceil(flyout.offsetHeight) });
  }
  // "Preso": arrastando ou digitando num campo do painel; o host não fecha o painel por saída do ponteiro.
  function avisarPonteiro() {
    const ativo = document.activeElement;
    const digitando = !!ativo && flyout.contains(ativo) && /^(INPUT|TEXTAREA)$/.test(ativo.tagName) && document.hasFocus();
    api.ponteiro({ dentro: ponteiroDentro, preso: !!(draggedItemNome || draggedGrupoNome || arrasteAtivo || digitando) });
  }
  document.documentElement.addEventListener('mouseenter', () => { ponteiroDentro = true; avisarPonteiro(); });
  document.documentElement.addEventListener('mouseleave', () => { ponteiroDentro = false; avisarPonteiro(); });
  document.addEventListener('focusin', avisarPonteiro);
  document.addEventListener('focusout', () => setTimeout(avisarPonteiro, 0));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto()) { e.stopPropagation(); fechar(); } }, true);

  function fecharLocal() {
    flyout.style.display = 'none';
    ponteiroDentro = false;
  }
  // Fechado pelo próprio painel (Esc, navegação): avisa o host, que esconde a janela.
  function fechar() {
    fecharLocal();
    api.fechar();
  }

  function lerCache() {
    const cache = getStorage(STORAGE_KEY_CACHE, null);
    if (!cache) return [];
    try {
      const lista = typeof cache === 'string' ? JSON.parse(cache) : cache;
      return lista.map(i => ({
        nomeCompleto: i.nomeCompleto || '',
        nomeCurto: i.nomeCurto || (i.nomeCompleto ? i.nomeCompleto.split(/\s+-\s+/)[0].trim() : ''),
        qtdTexto: i.qtdTexto || '0',
        link: i.link || null,
        isEmpty: i.isEmpty ?? (i.qtdTexto === '0')
      })).filter(i => i.nomeCompleto);
    } catch (_) { return []; }
  }

  // Abertura: desenha na hora com a última lista guardada e sempre busca a lista nova em segundo plano.
  function abrir(dados) {
    if (!dados || typeof dados.urlLocs !== 'string' || !dados.urlLocs) return;
    if (dados.urlLocs !== urlLocs) dadosCache = [];
    urlLocs = dados.urlLocs;
    if (dados.chaves && typeof dados.chaves === 'object') chaves = { ...dados.chaves };
    if (Number.isFinite(dados.larguraMax)) larguraMax = Math.max(300, dados.larguraMax);
    flyout.style.maxWidth = larguraMax + 'px';
    if (Number.isFinite(dados.alturaMax)) { alturaMax = Math.max(200, dados.alturaMax); flyout.style.maxHeight = alturaMax + 'px'; }
    flyout.style.display = 'block';
    flyout._focarFiltro = !!dados.foco;
    if (dadosCache.length === 0) dadosCache = lerCache();
    if (dadosCache.length > 0) {
      renderizar();
      carregarTabela(true);
    } else {
      flyout.innerHTML = '<div role="status" style="padding:16px 24px;min-width:220px;text-align:center;color:#6c757d">Carregando localizadores…</div>';
      delete flyout.dataset.loaded;
      posicionar();
      carregarTabela(false);
    }
  }

  // ---- Estrutura de grupos (mesmas chaves do antigo módulo) ----
  function getEstrutura() {
    let grupos = getStorage(STORAGE_KEY_GRUPOS, null);
    let estrutura = getStorage(STORAGE_KEY_ESTRUTURA, null);
    if (!Array.isArray(grupos) || !estrutura || typeof estrutura !== 'object') {
      grupos = []; estrutura = { 'Sem Grupo': [] };
      setStorage(STORAGE_KEY_GRUPOS, grupos); setStorage(STORAGE_KEY_ESTRUTURA, estrutura);
    }
    if (!estrutura['Sem Grupo']) estrutura['Sem Grupo'] = [];
    grupos.forEach(g => { if (!estrutura[g]) estrutura[g] = []; });
    return { grupos, estrutura };
  }
  function salvarEstrutura(grupos, estrutura) { setStorage(STORAGE_KEY_GRUPOS, grupos); setStorage(STORAGE_KEY_ESTRUTURA, estrutura); }

  function prepararLista() {
    const { grupos, estrutura } = getEstrutura();
    const todos = new Set([].concat(...Object.values(estrutura)));
    dadosCache.forEach(i => { if (!todos.has(i.nomeCompleto)) estrutura['Sem Grupo'].push(i.nomeCompleto); });
    salvarEstrutura(grupos, estrutura);
    const mapa = new Map(dadosCache.map(i => [i.nomeCompleto, i]));
    const lista = [];
    grupos.forEach(g => {
      lista.push({ tipo: 'HEADER', nome: g });
      const itens = (estrutura[g] || []).map(n => mapa.get(n)).filter(Boolean);
      if (itens.length) itens.forEach(it => lista.push({ tipo: 'ITEM', item: it, grupo: g }));
      else lista.push({ tipo: 'EMPTY_NOTICE', grupo: g });
    });
    const semGrupo = (estrutura['Sem Grupo'] || []).map(n => mapa.get(n)).filter(Boolean);
    if (semGrupo.length) {
      lista.push({ tipo: 'HEADER', nome: 'Sem Grupo', fixo: true });
      semGrupo.forEach(it => lista.push({ tipo: 'ITEM', item: it, grupo: 'Sem Grupo' }));
    }
    return lista;
  }

  function particionarEmColunas(alturas, n) {
    if (!alturas.length) return [];
    let lo = Math.max(...alturas), hi = alturas.reduce((a, b) => a + b, 0);
    const cabe = (H) => { let cols = 1, atual = 0; for (const a of alturas) { if (atual + a > H) { cols++; atual = a; } else atual += a; } return cols <= n; };
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cabe(mid)) hi = mid; else lo = mid + 1; }
    const colunas = [[]]; let atual = 0;
    alturas.forEach((a, i) => { if (atual + a > lo && colunas[colunas.length - 1].length) { colunas.push([]); atual = 0; } colunas[colunas.length - 1].push(i); atual += a; });
    return colunas;
  }
  function colunasDisponiveis() {
    const util = larguraMax - 40 - 24;
    return Math.max(1, Math.min(4, Math.floor((util + ESPACO_COLUNAS) / (LARGURA_COLUNA + ESPACO_COLUNAS))));
  }

  // Rolagem durante o arraste perto das bordas do painel.
  let rolagem = 0, quadro = null;
  const passo = () => { if (!rolagem) { quadro = null; return; } flyout.scrollTop += rolagem; quadro = requestAnimationFrame(passo); };
  flyout.addEventListener('dragover', (e) => {
    if (!draggedItemNome && !draggedGrupoNome) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, true);
  flyout.addEventListener('drop', (e) => { if (draggedItemNome || draggedGrupoNome) e.preventDefault(); arrasteAtivo = false; }, true);
  flyout.addEventListener('dragover', (e) => {
    if (!draggedItemNome && !draggedGrupoNome) return;
    const r = flyout.getBoundingClientRect();
    const topo = Math.max(r.top, 0), base = Math.min(r.bottom, document.documentElement.clientHeight);
    const zona = Math.min(60, (base - topo) / 4);
    if (e.clientY < topo + zona) rolagem = -Math.ceil(((topo + zona - e.clientY) / zona) * 18);
    else if (e.clientY > base - zona) rolagem = Math.ceil(((e.clientY - (base - zona)) / zona) * 18);
    else rolagem = 0;
    if (rolagem && !quadro) quadro = requestAnimationFrame(passo);
  });
  flyout.addEventListener('dragleave', (e) => { if (!flyout.contains(e.relatedTarget)) rolagem = 0; });
  flyout.addEventListener('drop', () => { rolagem = 0; });
  document.addEventListener('dragstart', () => setTimeout(avisarPonteiro, 0), true);
  document.addEventListener('dragend', () => {
    setTimeout(avisarPonteiro, 0);
    rolagem = 0; arrasteAtivo = false;
    setTimeout(() => { if (redesenhoPendente && !arrasteAtivo) renderizar(); }, 0);
  }, true);
  flyout.addEventListener('click', (e) => e.stopPropagation());

  // ---- Renderização ----
  function renderizar() {
    if (arrasteAtivo) { redesenhoPendente = true; return; }
    redesenhoPendente = false;
    const elementos = prepararLista();
    const corDe = montarCores(); // relida a cada desenho: a extensão pode ter atualizado a pool
    const containerFlow = document.createElement('div');
    containerFlow.className = 'quick-locs-columns';
    const grupos = [];
    let grupoAtual = null, wrapperGrupo = null;

    elementos.forEach(elem => {
      if (elem.tipo === 'HEADER') {
        wrapperGrupo = document.createElement('div');
        wrapperGrupo.className = 'quick-group-wrapper';
        wrapperGrupo.dataset.grupo = elem.nome;
        wrapperGrupo.addEventListener('drop', (e) => {
          if (!draggedItemNome || e.target.closest('.quick-loc-item')) return;
          e.preventDefault();
          moverItemParaGrupo(draggedItemNome, elem.nome, 0);
        });
        grupoAtual = { el: wrapperGrupo, itens: [], avisoEl: null, totalEl: null, total: 0, altura: 0 };
        grupos.push(grupoAtual);
      }
      const wrap = document.createElement('div');

      if (elem.tipo === 'HEADER') {
        const h = document.createElement('div');
        h.className = 'quick-group-header';
        const nome = document.createElement('span');
        nome.textContent = elem.nome;
        h.appendChild(nome);
        grupoAtual.totalEl = document.createElement('span');
        grupoAtual.totalEl.className = 'quick-group-total';
        grupoAtual.totalEl.title = 'Total de processos no grupo';
        h.appendChild(grupoAtual.totalEl);
        if (!elem.fixo) {
          h.draggable = true;
          h.addEventListener('dragstart', (e) => {
            e.stopImmediatePropagation();
            draggedGrupoNome = elem.nome; draggedItemNome = null; arrasteAtivo = true;
            h.classList.add('dragging-group');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', elem.nome);
          }, true);
          h.addEventListener('dragend', () => {
            draggedGrupoNome = null; draggedItemNome = null;
            h.classList.remove('dragging-group');
            flyout.querySelectorAll('.drag-over-group-top, .drag-over-group-bottom').forEach(el => el.classList.remove('drag-over-group-top', 'drag-over-group-bottom'));
          });
          h.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedGrupoNome && draggedGrupoNome !== elem.nome) {
              const r = h.getBoundingClientRect();
              const antes = e.clientY < r.top + r.height / 2;
              h.classList.toggle('drag-over-group-top', antes);
              h.classList.toggle('drag-over-group-bottom', !antes);
            }
          });
          h.addEventListener('dragleave', () => h.classList.remove('drag-over-group-top', 'drag-over-group-bottom'));
          h.addEventListener('drop', (e) => {
            e.preventDefault();
            h.classList.remove('drag-over-group-top', 'drag-over-group-bottom');
            if (draggedGrupoNome && draggedGrupoNome !== elem.nome) {
              const r = h.getBoundingClientRect();
              reordenarGrupos(draggedGrupoNome, elem.nome, e.clientY < r.top + r.height / 2);
            }
          });
        } else {
          h.addEventListener('dragover', (e) => e.preventDefault());
        }
        wrap.appendChild(h);
      } else if (elem.tipo === 'EMPTY_NOTICE') {
        const aviso = document.createElement('div');
        aviso.className = 'quick-group-empty-notice';
        aviso.textContent = 'Arraste um localizador para cá';
        aviso.addEventListener('dragover', (e) => e.preventDefault());
        wrap.appendChild(aviso);
        if (grupoAtual) grupoAtual.avisoEl = wrap;
      } else {
        const item = elem.item;
        const a = document.createElement('a');
        a.className = 'quick-loc-item' + (item.isEmpty ? ' quick-loc-empty' : '');
        a.title = item.nomeCompleto + '\n(Clique para abrir | Arraste para mover/reordenar)';
        a.draggable = true;
        // Sem href: nenhum script de terceiros (gestos de link etc.) trata o item como link durante o arraste.
        a.setAttribute('role', 'link');
        a.tabIndex = 0;
        const nome = document.createElement('span'); nome.className = 'quick-loc-name'; nome.textContent = item.nomeCurto;
        const qtd = document.createElement('span'); qtd.className = 'quick-loc-count'; qtd.textContent = item.qtdTexto;
        a.append(nome, qtd);
        const cor = corDe(item.nomeCurto, item.nomeCompleto);
        if (cor) { a.classList.add('is-colorido'); a.style.setProperty('--loc-bg', cor.bg); a.style.setProperty('--loc-tx', cor.tx); }
        const abrirItem = () => { if (item.link && !item.isEmpty) pedirNavegacao(item.link); };
        a.addEventListener('click', (e) => { e.preventDefault(); abrirItem(); });
        a.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); abrirItem(); } });
        a.addEventListener('dragstart', (e) => {
          e.stopImmediatePropagation();
          draggedItemNome = item.nomeCompleto; draggedGrupoNome = null; arrasteAtivo = true;
          a.classList.add('dragging');
          e.dataTransfer.clearData();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.nomeCompleto);
        }, true);
        a.addEventListener('dragend', () => {
          draggedItemNome = null; draggedGrupoNome = null;
          a.classList.remove('dragging');
          flyout.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
        });
        a.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedItemNome) {
            const r = a.getBoundingClientRect();
            const antes = e.clientY < r.top + r.height / 2;
            a.classList.toggle('drag-over-top', antes);
            a.classList.toggle('drag-over-bottom', !antes);
          }
        });
        a.addEventListener('dragleave', () => a.classList.remove('drag-over-top', 'drag-over-bottom'));
        a.addEventListener('drop', (e) => {
          e.preventDefault();
          a.classList.remove('drag-over-top', 'drag-over-bottom');
          if (draggedItemNome) {
            const r = a.getBoundingClientRect();
            moverItemParaPosicao(draggedItemNome, elem.grupo, item.nomeCompleto, e.clientY < r.top + r.height / 2);
          }
        });
        wrap.appendChild(a);
        if (grupoAtual) {
          grupoAtual.itens.push({ el: wrap, texto: normalizarTexto(item.nomeCompleto), vazio: !!item.isEmpty, link: (item.link && !item.isEmpty) ? item.link : null });
          grupoAtual.total += parseInt(String(item.qtdTexto).replace(/\D/g, ''), 10) || 0;
        }
      }
      wrapperGrupo.appendChild(wrap);
    });
    grupos.forEach(g => { g.totalEl.textContent = g.itens.length ? g.total : ''; });

    const svgAtualizar = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.68-5.68"/></svg>';
    const svgCopiar = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const footer = document.createElement('div');
    footer.className = 'quick-locs-footer';
    // Rodapé só aparece quando há um formulário aberto (criar grupo, copiar estilo); vazio fica oculto pelo CSS.
    // A página nativa de Meus Localizadores abre pelo clique no botão da barra; o painel é só do hover.

    // Engrenagem: reúne "Ocultar vazios", "Criar grupo", "Deletar grupo" e "Copiar estilo" num menu, liberando o rodapé.
    const svgEngrenagem = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    const toolbar = document.createElement('div');
    toolbar.className = 'quick-locs-toolbar';
    toolbar.innerHTML = `
      <input type="search" class="quick-locs-filter" placeholder="Filtrar localizadores…" aria-label="Filtrar localizadores" autocomplete="off" spellcheck="false">
      <button type="button" class="quick-locs-cfg" data-acao="atualizar" aria-label="Atualizar a lista e as contagens" title="Atualizar a lista e as contagens">${svgAtualizar}</button>
      <button type="button" class="quick-locs-cfg" aria-haspopup="menu" aria-expanded="false" aria-label="Opções do painel" title="Opções">${svgEngrenagem}</button>
      <div class="quick-locs-menu" role="menu" hidden>
        <label class="quick-locs-menu-item" role="menuitemcheckbox"><input type="checkbox"> Ocultar vazios</label>
        <button type="button" class="quick-locs-menu-item" role="menuitem" data-acao="criar">Criar grupo</button>
        <button type="button" class="quick-locs-menu-item is-danger" role="menuitem" data-acao="deletar" aria-haspopup="true">Deletar grupo</button>
        <button type="button" class="quick-locs-menu-item" role="menuitem" data-acao="estilo" title="Copiar ou colar a organização (grupos e ordem)">${svgCopiar}Copiar estilo</button>
      </div>
      <div id="sp-locs-modal-del"></div>`;
    const filtroEl = toolbar.querySelector('.quick-locs-filter');
    const ocultarEl = toolbar.querySelector('.quick-locs-menu input[type="checkbox"]');
    const cfgBtn = toolbar.querySelector('.quick-locs-cfg[aria-haspopup="menu"]');
    const menuEl = toolbar.querySelector('.quick-locs-menu');
    const abrirMenu = (sim) => { menuEl.hidden = !sim; cfgBtn.setAttribute('aria-expanded', String(sim)); };
    cfgBtn.addEventListener('click', (e) => { e.stopPropagation(); abrirMenu(menuEl.hidden); if (!menuEl.hidden) menuEl.querySelector('input, button').focus(); });
    menuEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); abrirMenu(false); cfgBtn.focus(); } });
    flyout.addEventListener('mousedown', (e) => { if (!menuEl.hidden && !menuEl.contains(e.target) && e.target !== cfgBtn && !cfgBtn.contains(e.target)) abrirMenu(false); });
    // Escolher uma ação fecha o menu ("Ocultar vazios" fica aberto para ver o efeito).
    menuEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => abrirMenu(false)));
    filtroEl.value = filtroAtual;
    ocultarEl.checked = getStorage(STORAGE_KEY_OCULTAR_VAZIOS, false) === true;

    const semResultado = document.createElement('div');
    semResultado.className = 'quick-locs-nores';
    semResultado.setAttribute('role', 'status');
    semResultado.textContent = 'Nenhum localizador encontrado.';

    function montarColunas() {
      const termo = normalizarTexto(filtroEl.value.trim());
      const ocultarVazios = ocultarEl.checked;
      const visiveis = [];
      grupos.forEach(g => {
        let n = 0;
        g.itens.forEach(i => { const ok = (!termo || i.texto.includes(termo)) && !(ocultarVazios && i.vazio); i.el.style.display = ok ? '' : 'none'; if (ok) n++; });
        const mostraAviso = !g.itens.length && !termo;
        if (g.avisoEl) g.avisoEl.style.display = mostraAviso ? '' : 'none';
        const visivel = g.itens.length ? n > 0 : mostraAviso;
        g.el.style.display = visivel ? '' : 'none';
        g.altura = 38 + (g.itens.length ? n * 30 : 32) + 10;
        if (visivel) visiveis.push(g);
      });
      // "Sem Grupo" não passa de 50% da altura disponível: divide-se em 2 colunas e, se ainda passar, em 3.
      // Grupos criados pelo usuário seguem a distribuição normal e podem, sim, ocupar mais altura.
      const semGrupo = visiveis.find(g => g.el.dataset.grupo === 'Sem Grupo') || null;
      let nSem = 1;
      if (semGrupo) {
        const k = semGrupo.itens.filter(i => i.el.style.display !== 'none').length;
        const alturaCom = (n) => 38 + Math.ceil(k / n) * 30 + 10;
        const limite = alturaMax * 0.5;
        if (alturaCom(1) > limite) nSem = 2;
        if (nSem === 2 && alturaCom(2) > limite) nSem = 3;
        nSem = Math.min(nSem, colunasDisponiveis());
        if (!semGrupo.caixa) {
          semGrupo.caixa = document.createElement('div');
          semGrupo.caixa.className = 'quick-locs-semgrupo-itens';
          semGrupo.itens.forEach(i => semGrupo.caixa.appendChild(i.el));
          semGrupo.el.appendChild(semGrupo.caixa);
        }
        // Preenche coluna por coluna, na ordem da lista.
        semGrupo.caixa.style.gridTemplateColumns = `repeat(${nSem}, ${LARGURA_COLUNA}px)`;
        semGrupo.caixa.style.gridTemplateRows = `repeat(${Math.max(1, Math.ceil(k / nSem))}, auto)`;
        semGrupo.altura = alturaCom(nSem);
      }
      const outros = visiveis.filter(g => g !== semGrupo);
      const numCols = Math.min(Math.max(1, colunasDisponiveis() - (semGrupo ? nSem : 0)), Math.max(1, outros.length));
      const colunas = outros.length ? particionarEmColunas(outros.map(g => g.altura), numCols).map(ix => ix.map(i => outros[i])) : [];
      if (semGrupo) colunas.push([semGrupo]); // Sem Grupo continua por último, como na lista
      containerFlow.textContent = '';
      colunas.forEach(lista => {
        const col = document.createElement('div');
        col.className = 'quick-locs-col';
        if (lista.includes(semGrupo)) col.style.width = 'auto';
        lista.forEach(g => col.appendChild(g.el));
        const ultimoGrupo = () => [...col.querySelectorAll(':scope > .quick-group-wrapper')].pop() || null;
        const limparFim = () => col.querySelectorAll('.drag-over-fim').forEach(el => el.classList.remove('drag-over-fim'));
        col.addEventListener('dragover', (e) => {
          if (!draggedItemNome) return;
          const alvo = ultimoGrupo();
          limparFim();
          if (alvo && !e.target.closest('.quick-group-wrapper')) alvo.classList.add('drag-over-fim');
        });
        col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) limparFim(); });
        col.addEventListener('drop', (e) => {
          limparFim();
          if (!draggedItemNome || e.target.closest('.quick-group-wrapper')) return;
          const alvo = ultimoGrupo();
          if (!alvo) return;
          e.preventDefault();
          moverItemParaGrupo(draggedItemNome, alvo.dataset.grupo, Number.MAX_SAFE_INTEGER);
        });
        containerFlow.appendChild(col);
      });
      semResultado.style.display = visiveis.length ? 'none' : 'block';
      posicionar();
    }

    filtroEl.addEventListener('input', () => { filtroAtual = filtroEl.value; montarColunas(); });
    filtroEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && filtroEl.value) {
        e.stopPropagation();
        filtroEl.value = ''; filtroAtual = '';
        montarColunas();
      } else if (e.key === 'Enter') {
        const abertos = grupos.flatMap(g => g.itens).filter(i => i.el.style.display !== 'none' && i.link);
        if (abertos.length === 1) pedirNavegacao(abertos[0].link);
      }
    });
    ocultarEl.addEventListener('change', () => { setStorage(STORAGE_KEY_OCULTAR_VAZIOS, ocultarEl.checked); montarColunas(); });

    // Redesenho com a tela aberta (lista nova, cores novas): mantém a rolagem e o cursor no filtro.
    const rolagemAntes = flyout.scrollTop;
    const filtroAntes = flyout.querySelector('.quick-locs-filter');
    const comFoco = !!filtroAntes && document.activeElement === filtroAntes;
    const selecao = comFoco ? [filtroAntes.selectionStart, filtroAntes.selectionEnd] : null;
    flyout.innerHTML = '';
    flyout.append(toolbar, containerFlow, semResultado, footer);
    flyout.dataset.loaded = 'true';
    montarColunas();
    flyout.scrollTop = rolagemAntes;
    if (comFoco) { filtroEl.focus({ preventScroll: true }); try { filtroEl.setSelectionRange(selecao[0], selecao[1]); } catch (_) {} }
    if (flyout._focarFiltro) { flyout._focarFiltro = false; filtroEl.focus({ preventScroll: true }); }

    const btn = (acao) => flyout.querySelector(`[data-acao="${acao}"]`);
    const modalDel = toolbar.querySelector('#sp-locs-modal-del');
    btn('atualizar').onclick = (e) => {
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true; b.classList.add('is-loading'); b.setAttribute('aria-busy', 'true');
      b.title = 'Atualizando…';
      carregarTabela(false);
    };
    btn('estilo').onclick = () => {
      const existente = footer.querySelector('.quick-style-editor');
      if (existente) { existente.querySelector('textarea').focus(); return; }
      const { grupos: gs, estrutura } = getEstrutura();
      const form = document.createElement('form');
      form.className = 'quick-inline-form quick-style-editor';
      form.innerHTML = '<label>Estilo atual: copie, ou cole outro JSON para substituir.<textarea aria-label="JSON do estilo dos localizadores" spellcheck="false"></textarea></label><div class="quick-footer-set"><button type="button" class="quick-btn-group-action" data-copy>Copiar</button><button type="submit" class="quick-btn-group-action is-primary">Substituir estilo</button><button type="button" class="quick-btn-group-action" data-close>Fechar</button><span class="quick-inline-msg" role="status"></span></div>';
      const campo = form.querySelector('textarea');
      const status = form.querySelector('[role="status"]');
      form.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); form.remove(); } });
      campo.value = JSON.stringify({ grupos: gs, estrutura }, null, 4);
      form.querySelector('[data-close]').onclick = () => form.remove();
      form.querySelector('[data-copy]').onclick = () => {
        Promise.resolve().then(() => navigator.clipboard.writeText(campo.value))
          .then(() => { status.textContent = 'Estilo copiado.'; })
          .catch(() => { campo.focus(); campo.select(); status.textContent = 'Use Ctrl+C para copiar o texto selecionado.'; });
      };
      form.onsubmit = (ev) => {
        ev.preventDefault();
        try { const novo = validarEstilo(campo.value); salvarEstrutura(novo.grupos, novo.estrutura); renderizar(); }
        catch (erro) { status.textContent = erro.message; }
      };
      footer.appendChild(form);
      campo.focus();
    };
    btn('criar').onclick = () => {
      const existente = footer.querySelector('.quick-new-group');
      if (existente) { existente.querySelector('input').focus(); return; }
      const form = document.createElement('form');
      form.className = 'quick-inline-form quick-new-group';
      form.innerHTML = '<input type="text" aria-label="Nome do novo grupo" placeholder="Nome do novo grupo" required autocomplete="off"><button type="submit" class="quick-btn-group-action is-primary">Criar</button><button type="button" class="quick-btn-group-action">Cancelar</button><span class="quick-inline-msg" role="status"></span>';
      footer.appendChild(form);
      form.querySelector('button[type="button"]').onclick = () => form.remove();
      form.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); form.remove(); } });
      form.querySelector('input').focus();
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const nomeGrupo = form.querySelector('input').value.trim();
        if (!nomeGrupo) return;
        const { grupos: gs, estrutura } = getEstrutura();
        if (nomeGrupo.toLowerCase() === 'sem grupo' || ['__proto__', 'constructor', 'prototype'].includes(nomeGrupo)) { form.querySelector('[role="status"]').textContent = 'Nome reservado.'; return; }
        if (gs.includes(nomeGrupo)) { form.querySelector('[role="status"]').textContent = 'Grupo já existente.'; return; }
        gs.push(nomeGrupo); estrutura[nomeGrupo] = [];
        salvarEstrutura(gs, estrutura);
        renderizar();
      };
    };
    btn('deletar').onclick = (e) => {
      const estava = modalDel.style.display === 'block';
      modalDel.style.display = estava ? 'none' : 'block';
      e.currentTarget.setAttribute('aria-expanded', String(!estava));
      if (!estava) montarModalDelete(modalDel);
    };
  }

  function validarEstilo(json) {
    let estilo;
    try { estilo = JSON.parse(json); } catch { throw new Error('JSON inválido. A organização atual não foi alterada.'); }
    const proibidos = ['__proto__', 'constructor', 'prototype'];
    if (!estilo || !Array.isArray(estilo.grupos) || !estilo.estrutura || typeof estilo.estrutura !== 'object' || Array.isArray(estilo.estrutura) ||
        estilo.grupos.some(g => typeof g !== 'string' || !g.trim() || g !== g.trim() || g.toLowerCase() === 'sem grupo' || proibidos.includes(g)) ||
        new Set(estilo.grupos).size !== estilo.grupos.length) {
      throw new Error('Estilo inválido: informe grupos únicos e uma estrutura de localizadores.');
    }
    const permitidos = new Set([...estilo.grupos, 'Sem Grupo']);
    const nomes = new Set();
    for (const [grupo, itens] of Object.entries(estilo.estrutura)) {
      if (!permitidos.has(grupo) || !Array.isArray(itens) || itens.some(n => typeof n !== 'string' || !n.trim())) throw new Error('Estrutura inválida: cada grupo deve conter uma lista de nomes.');
      for (const n of itens) { if (nomes.has(n)) throw new Error('Um localizador não pode aparecer em mais de uma posição.'); nomes.add(n); }
    }
    for (const g of permitidos) if (!Object.hasOwn(estilo.estrutura, g)) estilo.estrutura[g] = [];
    return { grupos: estilo.grupos, estrutura: estilo.estrutura };
  }

  function reordenarGrupos(movido, alvo, antes) {
    const { grupos, estrutura } = getEstrutura();
    const i = grupos.indexOf(movido); if (i > -1) grupos.splice(i, 1);
    let j = grupos.indexOf(alvo);
    if (j === -1) j = antes ? 0 : grupos.length; else if (!antes) j++;
    grupos.splice(j, 0, movido);
    salvarEstrutura(grupos, estrutura); renderizar();
  }
  function retirarDeTodos(estrutura, nome) { Object.keys(estrutura).forEach(g => { estrutura[g] = estrutura[g].filter(n => n !== nome); }); }
  function moverItemParaGrupo(nome, destino, indice) {
    if (!nome) return;
    const { grupos, estrutura } = getEstrutura();
    retirarDeTodos(estrutura, nome);
    if (!estrutura[destino]) estrutura[destino] = [];
    estrutura[destino].splice(indice, 0, nome);
    salvarEstrutura(grupos, estrutura); renderizar();
  }
  function moverItemParaPosicao(nome, destino, alvo, antes) {
    if (!nome || nome === alvo) return;
    const { grupos, estrutura } = getEstrutura();
    retirarDeTodos(estrutura, nome);
    if (!estrutura[destino]) estrutura[destino] = [];
    let k = estrutura[destino].indexOf(alvo);
    if (k === -1) k = antes ? 0 : estrutura[destino].length; else if (!antes) k++;
    estrutura[destino].splice(k, 0, nome);
    salvarEstrutura(grupos, estrutura); renderizar();
  }
  function montarModalDelete(modal) {
    const { grupos, estrutura } = getEstrutura();
    modal.innerHTML = '<div class="del-group-title">Excluir grupo</div><div class="del-group-hint">Os localizadores do grupo vão para &quot;Sem Grupo&quot;.</div>';
    if (!grupos.length) { modal.innerHTML += '<div class="del-group-hint">Nenhum grupo criado ainda.</div>'; return; }
    grupos.forEach(grupo => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'del-group-item';
      const n = document.createElement('span'); n.textContent = grupo;
      const x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.style.cssText = 'font-weight:bold;font-size:13px'; x.textContent = '×';
      b.append(n, x);
      b.setAttribute('aria-label', 'Excluir o grupo ' + grupo);
      b.onclick = () => {
        const novos = grupos.filter(g => g !== grupo);
        estrutura['Sem Grupo'] = [...(estrutura['Sem Grupo'] || []), ...(estrutura[grupo] || [])];
        delete estrutura[grupo];
        salvarEstrutura(novos, estrutura); renderizar();
      };
      modal.appendChild(b);
    });
  }

  // ---- Dados: a página nativa de Meus Localizadores, buscada pelo host com a sessão do eproc ----
  // Só redesenha se a lista mudou: abrir de novo com os mesmos números não mexe em nada na tela.
  let buscaAtual = 0;
  function carregarTabela(emSegundoPlano) {
    const minha = ++buscaAtual;
    const destino = urlLocs;
    api.buscar(destino).then(res => {
      if (minha !== buscaAtual || destino !== urlLocs) return;
      if (res && Array.isArray(res.lista) && res.lista.length) {
        if (JSON.stringify(res.lista) !== JSON.stringify(dadosCache)) {
          dadosCache = res.lista;
          setStorage(STORAGE_KEY_CACHE, res.lista);
          if (aberto()) renderizar();
        } else if (!emSegundoPlano && aberto()) renderizar();
      } else if (!emSegundoPlano && aberto()) {
        renderizar(); avisarFalha(res && res.erro ? 'Erro ao atualizar: ' + res.erro : 'Não foi possível carregar a lista. A organização foi mantida.');
      }
    }).catch(err => {
      if (minha === buscaAtual && !emSegundoPlano && aberto()) { renderizar(); avisarFalha('Erro ao atualizar: ' + (err && err.message || err)); }
    });
  }
  function avisarFalha(msg) {
    const aviso = document.createElement('div');
    aviso.setAttribute('role', 'status');
    aviso.style.cssText = 'padding:8px 12px;color:#b02a37;border-bottom:1px solid #dee2e6';
    aviso.textContent = msg;
    flyout.prepend(aviso);
  }

  // ---- Mensagens do host ----
  api.aoAbrir((dados) => abrir(dados));
  api.aoFechar(() => fecharLocal());
  // A base mudou numa página do eproc (cores, grupos do Smart, organização feita em outra aba): redesenha se estiver aberto.
  api.aoChaves((novas) => {
    if (!novas || typeof novas !== 'object') return;
    const antes = JSON.stringify(chaves);
    chaves = { ...novas };
    if (aberto() && JSON.stringify(chaves) !== antes) renderizar();
  });
})();
