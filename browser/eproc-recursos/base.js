// Base comum dos recursos do eproc no navegador SuperPROC (camada: host; roda em mundo isolado nas abas do eproc).
//
// Tudo o que o usuário decide (grupos, ordem, cores, prioridades) fica no localStorage da origem do eproc, no MESMO endereço e
// formato que a extensão SuperPROC usa (docs/ia/POOL-COMUM.md). O navegador não depende da extensão: se a base não existe,
// ele a cria; se a extensão também estiver instalada, ela sincroniza o próprio chrome.storage com esta base.
//
// Este arquivo é concatenado pelo host antes de cada script de recurso, dentro da mesma função: expõe `SPBase`.

const SPBase = (() => {
  const SEM_GRUPO = 'Sem Grupo';
  const GRUPO_OCULTOS = 'Ocultos';
  const GRUPO_BASE_EVENTOS = '\u{1F4DA} Base do Tribunal (Auto)';
  const LOCAL_KEYS = {
    loc: { grupos: 'eproc_smartloc_grupos', estrutura: 'eproc_smartloc_estrutura', at: 'eproc_smartloc_at', ocultos: 'eproc_smartloc_grupos_ocultos' },
    evt: { grupos: 'eproc_smarteventos_grupos', estrutura: 'eproc_smarteventos_estrutura', at: 'eproc_smarteventos_at', ocultos: 'eproc_smarteventos_grupos_ocultos' }
  };
  const CHAVE_POOL_CORES = 'superproc_pool_cores_v1';
  // Evento DOM (cruza mundos isolados) que avisa a página de que a base mudou fora dela (organizador, outra aba).
  const EVENTO_BASE_MUDOU = 'superproc:base-mudou';
  const HEX = /^#[0-9a-fA-F]{6}$/;

  const PALETA_LOCALIZADORES = [
    { bg: '#e9ecef', tx: '#495057' }, { bg: '#007bff', tx: '#ffffff' }, { bg: '#28a745', tx: '#ffffff' }, { bg: '#dc3545', tx: '#ffffff' },
    { bg: '#fd7e14', tx: '#ffffff' }, { bg: '#6f42c1', tx: '#ffffff' }, { bg: '#e83e8c', tx: '#ffffff' }, { bg: '#17a2b8', tx: '#ffffff' },
    { bg: '#ffc107', tx: '#212529' }, { bg: '#343a40', tx: '#ffffff' }, { bg: '#6610f2', tx: '#ffffff' }, { bg: '#20c997', tx: '#ffffff' },
    { bg: '#795548', tx: '#ffffff' }, { bg: '#cddc39', tx: '#212529' }, { bg: '#ff5722', tx: '#ffffff' }, { bg: '#708090', tx: '#ffffff' }
  ];

  const ler = (chave, padrao) => { try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } };

  function lerLocal(tipo) {
    const k = LOCAL_KEYS[tipo];
    const ocultos = ler(k.ocultos, []);
    return {
      grupos: ler(k.grupos, []),
      gruposOcultos: Array.isArray(ocultos) ? ocultos.filter(g => typeof g === 'string') : [],
      estrutura: ler(k.estrutura, { [SEM_GRUPO]: [] }),
      at: Number(localStorage.getItem(k.at)) || 0
    };
  }

  function gravarLocal(tipo, dados) {
    const k = LOCAL_KEYS[tipo];
    try {
      localStorage.setItem(k.grupos, JSON.stringify(dados.grupos));
      localStorage.setItem(k.estrutura, JSON.stringify(dados.estrutura));
      if (Array.isArray(dados.gruposOcultos)) localStorage.setItem(k.ocultos, JSON.stringify(dados.gruposOcultos));
      localStorage.setItem(k.at, String(dados.at));
    } catch { /* armazenamento cheio ou bloqueado */ }
  }

  // ---- Pool de cores (mesmo formato da extensão: core/pool_comum.js) ----
  function limparCores(mapa) {
    const saida = {};
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return saida;
    for (const [nome, r] of Object.entries(mapa)) {
      if (nome === '__proto__' || !r || typeof r !== 'object') continue;
      const item = {};
      if (typeof r.cor === 'string' && HEX.test(r.cor)) { item.cor = r.cor.toLowerCase(); if (typeof r.tx === 'string' && HEX.test(r.tx)) item.tx = r.tx.toLowerCase(); }
      const p = r.prio === null || r.prio === undefined || r.prio === '' ? null : Number(r.prio);
      if (p !== null && Number.isInteger(p) && p >= 0 && p <= 9) item.prio = p;
      if (Object.keys(item).length) saida[nome] = item;
    }
    return saida;
  }

  function lerPool() {
    let p = null;
    try { const bruto = localStorage.getItem(CHAVE_POOL_CORES); p = bruto && bruto.length < 1024 * 1024 ? JSON.parse(bruto) : null; } catch { p = null; }
    if (!p || typeof p !== 'object' || p.v !== 1) return { v: 1, at: 0, proprias: {}, az: {}, regrasGrupos: {}, catalogoLoc: [] };
    return {
      v: 1,
      at: Number(p.at) || 0,
      proprias: limparCores(p.proprias),
      az: limparCores(p.az),
      regrasGrupos: limparCores(p.regrasGrupos),
      catalogoLoc: Array.isArray(p.catalogoLoc) ? p.catalogoLoc.filter(c => c && typeof c.value === 'string' && typeof c.text === 'string') : []
    };
  }

  // Altera a pool por uma função; só grava (e carimba `at`) se algo mudou. Cria a pool se ela não existir.
  function mudarPool(fn) {
    const atual = lerPool();
    const novo = JSON.parse(JSON.stringify(atual));
    fn(novo);
    novo.proprias = limparCores(novo.proprias);
    novo.az = limparCores(novo.az);
    novo.regrasGrupos = limparCores(novo.regrasGrupos);
    const existe = localStorage.getItem(CHAVE_POOL_CORES) !== null;
    if (existe && JSON.stringify({ ...atual, at: 0 }) === JSON.stringify({ ...novo, at: 0 })) return atual;
    novo.at = Date.now();
    try { localStorage.setItem(CHAVE_POOL_CORES, JSON.stringify(novo)); } catch { /* cheio ou bloqueado */ }
    return novo;
  }

  function garantirPool() { if (localStorage.getItem(CHAVE_POOL_CORES) === null) mudarPool(() => {}); }

  // Mudanças da base vindas de fora deste documento: outra aba (evento storage) ou o host (organizador do navegador).
  function aoMudarBase(cb) {
    const chaves = new Set([CHAVE_POOL_CORES, ...Object.values(LOCAL_KEYS.loc), ...Object.values(LOCAL_KEYS.evt)]);
    window.addEventListener('storage', (e) => { if (!e.key || chaves.has(e.key)) cb(); });
    window.addEventListener(EVENTO_BASE_MUDOU, () => cb());
  }

  // Pede ao navegador que abra o Organizador (o tab-preload.js leva o pedido ao host).
  function abrirOrganizador(modulo) {
    window.dispatchEvent(new CustomEvent('superproc:organizador-abrir', { detail: modulo === 'evt' ? 'evt' : 'loc' }));
  }

  const normCor = (s) => String(s).normalize('NFC').replace(/️/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Uma passada agendada por vez, com rede de segurança periódica (cópia de modules/runtime/dom-work.js da extensão).
  function domWork({ run, root = document.body, fallback = 5000, events = [], hidden = false, observe = true }) {
    let timer, interval, running = false, stopped = false, pending = false;
    const observer = new MutationObserver(schedule);
    const connect = () => { if (observe && root && !stopped) observer.observe(root, { childList: true, subtree: true }); };
    async function pass() {
      clearTimeout(timer); timer = null;
      if (stopped || (!hidden && document.hidden)) return;
      if (running) { pending = true; return; }
      running = true; observer.disconnect();
      try { await run(); } catch { /* o recurso trata os próprios erros visíveis */ }
      finally { running = false; connect(); if (pending) { pending = false; schedule(); } }
    }
    function schedule() { if (!timer && !stopped) timer = setTimeout(pass, 100); }
    const visibility = () => { if (!document.hidden) schedule(); };
    function start() { stopped = false; connect(); if (fallback) interval = setInterval(schedule, fallback); schedule(); }
    function stop() { stopped = true; clearTimeout(timer); timer = null; clearInterval(interval); observer.disconnect(); }
    for (const event of events) document.addEventListener(event, schedule, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', event => { if (event.persisted && stopped) start(); });
    start(); return { schedule, stop };
  }

  return {
    SEM_GRUPO, GRUPO_OCULTOS, GRUPO_BASE_EVENTOS, LOCAL_KEYS, CHAVE_POOL_CORES, EVENTO_BASE_MUDOU, PALETA_LOCALIZADORES,
    lerLocal, gravarLocal, lerPool, mudarPool, garantirPool, aoMudarBase, abrirOrganizador, normCor, domWork
  };
})();
