// Adaptador de dados do Organizador do navegador SuperPROC (janela local; script clássico, carregado antes de organizador.js).
//
// Oferece ao organizador as mesmas funções que a página da extensão usava (lerEspelho, gravarOrigem, regras de grupo, cores),
// mas sobre a base comum no localStorage do eproc (docs/ia/POOL-COMUM.md), acessada pelo host através das abas do eproc
// abertas: window.orgApi (preload-organizador.js) -> organizador-host.js. Uma "origem" só aparece se houver aba dela aberta.
// Mudanças feitas nas páginas enquanto o organizador está aberto chegam por uma consulta leve a cada 2 s (só com a janela à vista).

window.SPOrg = (() => {
  const SEM_GRUPO = 'Sem Grupo';
  const GRUPO_OCULTOS = 'Ocultos';
  const GRUPO_BASE_EVENTOS = '\u{1F4DA} Base do Tribunal (Auto)';
  const LIMITE_BYTES = 1.5 * 1024 * 1024;
  const PALETA_LOCALIZADORES = [
    { bg: '#e9ecef', tx: '#495057' }, { bg: '#007bff', tx: '#ffffff' }, { bg: '#28a745', tx: '#ffffff' }, { bg: '#dc3545', tx: '#ffffff' },
    { bg: '#fd7e14', tx: '#ffffff' }, { bg: '#6f42c1', tx: '#ffffff' }, { bg: '#e83e8c', tx: '#ffffff' }, { bg: '#17a2b8', tx: '#ffffff' },
    { bg: '#ffc107', tx: '#212529' }, { bg: '#343a40', tx: '#ffffff' }, { bg: '#6610f2', tx: '#ffffff' }, { bg: '#20c997', tx: '#ffffff' },
    { bg: '#795548', tx: '#ffffff' }, { bg: '#cddc39', tx: '#212529' }, { bg: '#ff5722', tx: '#ffffff' }, { bg: '#708090', tx: '#ffffff' }
  ];
  const api = window.orgApi;

  // Mesma validação de core/smartorg.js (extensão).
  function normalizarDados(tipo, dados) {
    try {
      if (!dados || typeof dados !== 'object') return null;
      if (JSON.stringify(dados).length > LIMITE_BYTES) return null;
      const grupos = Array.isArray(dados.grupos) ? dados.grupos.filter(g => typeof g === 'string' && g && g !== SEM_GRUPO && g !== GRUPO_OCULTOS) : [];
      const estruturaIn = dados.estrutura && typeof dados.estrutura === 'object' && !Array.isArray(dados.estrutura) ? dados.estrutura : {};
      const estrutura = {};
      for (const [nome, itens] of Object.entries(estruturaIn)) {
        if (nome === '__proto__' || !Array.isArray(itens)) continue;
        estrutura[nome] = itens
          .map(i => tipo === 'loc' ? (typeof i === 'string' ? i : null) : (i && typeof i.text === 'string' ? { id: i.id == null ? '' : String(i.id), text: i.text } : null))
          .filter(i => i !== null);
      }
      if (!estrutura[SEM_GRUPO]) estrutura[SEM_GRUPO] = [];
      if (!estrutura[GRUPO_OCULTOS]) estrutura[GRUPO_OCULTOS] = [];
      const unicos = [...new Set(grupos)];
      for (const g of unicos) if (!estrutura[g]) estrutura[g] = [];
      const ocultos = Array.isArray(dados.gruposOcultos) ? [...new Set(dados.gruposOcultos.filter(g => typeof g === 'string' && unicos.includes(g)))] : [];
      const saida = { grupos: unicos, gruposOcultos: ocultos, estrutura, at: Number(dados.at) > 0 ? Number(dados.at) : 0 };
      if (tipo === 'loc' && Array.isArray(dados.catalogo)) {
        saida.catalogo = dados.catalogo.filter(c => c && typeof c.value === 'string' && typeof c.text === 'string').map(c => ({ value: c.value, text: c.text }));
      }
      return saida;
    } catch { return null; }
  }

  const lerEspelho = async (tipo) => (await api.ler(tipo)) || {};
  async function gravarOrigem(tipo, origem, dados) {
    const limpo = normalizarDados(tipo, dados);
    if (!limpo) throw new Error('Dados inválidos.');
    const ok = await api.gravar(tipo, origem, limpo);
    if (!ok) throw new Error('A aba do eproc desta instância foi fechada. Abra o eproc e tente de novo.');
    ultimos[tipo].set(origem, JSON.stringify(limpo));
    return limpo;
  }
  const lerRegrasGrupos = async (origem) => ((await api.lerCores(origem)) || {}).regras || {};
  async function gravarRegrasGrupos(origem, regras) {
    if (!await api.gravarRegras(origem, regras)) throw new Error('A aba do eproc desta instância foi fechada. Abra o eproc e tente de novo.');
  }
  async function lerCoresLoc(origem) { const c = (await api.lerCores(origem)) || {}; return { proprias: c.proprias || {}, az: c.az || {} }; }
  async function gravarCorPropria(origem, nome, regra) {
    if (!await api.gravarCor(origem, nome, regra)) throw new Error('A aba do eproc desta instância foi fechada. Abra o eproc e tente de novo.');
  }

  // ---- Avisos de mudança (consulta leve enquanto a janela está à vista) ----
  const ouvintes = { loc: [], evt: [], regras: [], cores: [] };
  const ultimos = { loc: new Map(), evt: new Map(), cores: new Map() };
  const aoMudarEspelho = (tipo, cb) => { ouvintes[tipo].push(cb); };
  const aoMudarRegrasGrupos = (cb) => { ouvintes.regras.push(cb); };
  const aoMudarCores = (cb) => { ouvintes.cores.push(cb); };

  let consultando = false;
  async function consultar() {
    if (consultando || document.hidden) return;
    consultando = true;
    try {
      for (const tipo of ['loc', 'evt']) {
        if (!ouvintes[tipo].length) continue;
        const mapa = (await api.ler(tipo)) || {};
        for (const [o, bruto] of Object.entries(mapa)) {
          const d = normalizarDados(tipo, bruto);
          if (!d) continue;
          const txt = JSON.stringify(d);
          const antes = ultimos[tipo].get(o);
          ultimos[tipo].set(o, txt);
          if (antes !== undefined && antes !== txt) ouvintes[tipo].forEach(cb => { try { cb(o, d); } catch (_) {} });
        }
      }
      if (ouvintes.regras.length || ouvintes.cores.length) {
        for (const o of await api.origens()) {
          const c = (await api.lerCores(o)) || {};
          const txt = JSON.stringify(c);
          const antes = ultimos.cores.get(o);
          ultimos.cores.set(o, txt);
          if (antes === undefined || antes === txt) continue;
          const anterior = JSON.parse(antes);
          if (JSON.stringify(anterior.regras) !== JSON.stringify(c.regras)) ouvintes.regras.forEach(cb => { try { cb(o, c.regras || {}); } catch (_) {} });
          if (JSON.stringify(anterior.proprias) !== JSON.stringify(c.proprias) || JSON.stringify(anterior.az) !== JSON.stringify(c.az)) ouvintes.cores.forEach(cb => { try { cb(o); } catch (_) {} });
        }
      }
    } catch (_) { /* aba fechada no meio da consulta: tenta de novo na próxima */ }
    finally { consultando = false; }
  }
  setInterval(consultar, 2000);
  // O host avisa quando outra aba pede o organizador em outro módulo (Localizadores/Eventos).
  if (api.aoTrocarModulo) api.aoTrocarModulo((m) => {
    const b = document.querySelector(`.seg button[data-m="${m === 'evt' ? 'evt' : 'loc'}"]`);
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  });

  return {
    SEM_GRUPO, GRUPO_OCULTOS, GRUPO_BASE_EVENTOS, PALETA_LOCALIZADORES, normalizarDados,
    lerEspelho, gravarOrigem, aoMudarEspelho, lerRegrasGrupos, gravarRegrasGrupos, aoMudarRegrasGrupos,
    lerCoresLoc, gravarCorPropria, aoMudarCores
  };
})();
