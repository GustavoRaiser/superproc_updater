/**
 * SuperPROC - Atalhos do Acesso Rápido (lógica pura, sem Electron nem DOM).
 * Mesmo modelo do menu rápido de eventos: guarda a tecla física (code) + modificadores,
 * independente do idioma do teclado. Usado pelo diálogo (script), pelo host (require) e pelos testes.
 * Aceita tanto um KeyboardEvent (ctrlKey...) quanto o `input` do before-input-event (control...).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtalhoAcesso = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CATEGORIAS = ['jurisprudencia', 'legislacao', 'ferramentas'];
  const MODIFICADORES = new Set([
    'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight',
    'MetaLeft', 'MetaRight', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'OS'
  ]);
  /** Combinações que o navegador (host) ou o editor já usam. */
  const RESERVADOS = new Set([
    'Ctrl+KeyC', 'Ctrl+KeyV', 'Ctrl+KeyX', 'Ctrl+KeyZ', 'Ctrl+KeyY', 'Ctrl+KeyA', 'Ctrl+KeyS',
    'Ctrl+KeyP', 'Ctrl+KeyF', 'Ctrl+KeyW', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Ctrl+KeyR', 'Ctrl+KeyL',
    'Ctrl+Shift+KeyW', 'Ctrl+Shift+KeyT', 'Alt+ArrowLeft', 'Alt+ArrowRight',
    'F5', 'F12'
  ]);
  /** Motivo específico para teclas de função reservadas (F11 foi liberada em 30/10/2026: o host não a usa). */
  const MOTIVO_RESERVADO = {
    F5: 'O F5 já recarrega a página no navegador. Escolha outra tecla.',
    F12: 'O F12 é o gatilho do AZFLOW. Escolha outra tecla.'
  };
  const TECLA_DE_TEXTO = /^(Key|Digit|Numpad|Space$|Minus$|Equal$|Bracket|Semicolon$|Quote$|Backquote$|Backslash$|Comma$|Period$|Slash$|Intl)/;
  // F1 a F24 valem sozinhas, sem modificador (decisão do usuário, 30/10/2026), exceto as reservadas acima.
  const TECLA_DE_FUNCAO = /^F([1-9]|1\d|2[0-4])$/;
  const NOMES = {
    Space: 'Espaço', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backslash: '\\', Comma: ',', Period: '.', Slash: '/', PageUp: 'PgUp', PageDown: 'PgDn'
  };

  const ehModificador = (code) => MODIFICADORES.has(code);
  const flag = (a, b) => !!(a !== undefined ? a : b);

  function deEvento(ev) {
    return {
      code: ev.code,
      ctrl: flag(ev.ctrlKey, ev.control),
      alt: flag(ev.altKey, ev.alt),
      shift: flag(ev.shiftKey, ev.shift),
      meta: flag(ev.metaKey, ev.meta)
    };
  }

  function mesmoAtalho(a, b) {
    return !!a && !!b && a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt
      && !!a.shift === !!b.shift && !!a.meta === !!b.meta;
  }

  const combina = (ev, atalho) => !!atalho && mesmoAtalho(deEvento(ev), atalho);

  function chave(a) {
    return `${a.ctrl ? 'Ctrl+' : ''}${a.alt ? 'Alt+' : ''}${a.shift ? 'Shift+' : ''}${a.meta ? 'Meta+' : ''}${a.code}`;
  }

  function nomeDaTecla(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
    return NOMES[code] || code;
  }

  function descrever(a) {
    if (!a) return '';
    const p = [];
    if (a.ctrl) p.push('Ctrl');
    if (a.alt) p.push('Alt');
    if (a.shift) p.push('Shift');
    if (a.meta) p.push('Win');
    p.push(nomeDaTecla(a.code));
    return p.join('+');
  }

  /** Explica por que o atalho não serve; null se serve. */
  function motivoDeRecusa(a) {
    if (RESERVADOS.has(chave(a))) return MOTIVO_RESERVADO[chave(a)] || 'Esse atalho já é usado pelo navegador ou pelo editor. Escolha outro.';
    const temModificador = a.ctrl || a.alt || a.meta;
    if (TECLA_DE_TEXTO.test(a.code)) {
      return temModificador ? null : 'Use Ctrl, Alt ou Win junto com a tecla; só a letra (ou com Shift) digitaria no texto.';
    }
    if (TECLA_DE_FUNCAO.test(a.code)) return null;
    if (!temModificador && !a.shift) return 'Teclas de edição e navegação precisam de Ctrl, Alt ou Win junto.';
    return null;
  }

  /** Avalia uma tecla pressionada durante a memorização. */
  function avaliarTecla(ev) {
    if (!ev.code || ehModificador(ev.code)) return { estado: 'aguardar' };
    const atalho = deEvento(ev);
    const motivo = motivoDeRecusa(atalho);
    return motivo ? { estado: 'recusado', motivo } : { estado: 'ok', atalho };
  }

  /** Valida o que veio do armazenamento (pode ter sido editado ou importado). */
  function normalizarSalvo(v) {
    if (!v || typeof v !== 'object') return null;
    if (typeof v.code !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(v.code) || ehModificador(v.code)) return null;
    const a = { code: v.code, ctrl: !!v.ctrl, alt: !!v.alt, shift: !!v.shift, meta: !!v.meta };
    return motivoDeRecusa(a) ? null : a;
  }

  // ── Grupos (pastas) ────────────────────────────────────────────────────────
  // Uma lista de categoria mistura links {id,nome,url,atalho?} e grupos {id,tipo:'grupo',nome,itens:[links]}.
  // Só há um nível: grupo dentro de grupo é achatado ao sanear.
  const ehGrupo = (item) => !!item && item.tipo === 'grupo';

  /** Percorre todos os links em ordem de menu, inclusive os de dentro de grupos. fn(link, grupo|null). */
  function paraCadaLink(lista, fn) {
    for (const item of Array.isArray(lista) ? lista : []) {
      if (!item) continue;
      if (ehGrupo(item)) {
        for (const sub of Array.isArray(item.itens) ? item.itens : []) if (sub && !ehGrupo(sub)) fn(sub, item);
      } else fn(item, null);
    }
  }

  let contadorId = 0;
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6) + (contadorId++).toString(36);

  /** Normaliza uma lista de categoria: atalhos inválidos saem, grupos aninhados são achatados, ids garantidos. */
  function sanearLista(lista) {
    const limpaLink = (item) => {
      const { atalho, ...resto } = item;
      const valido = normalizarSalvo(atalho);
      return { ...resto, id: item.id || novoId(), ...(valido ? { atalho: valido } : {}) };
    };
    const saida = [];
    for (const item of Array.isArray(lista) ? lista : []) {
      if (!item || typeof item !== 'object') continue;
      if (ehGrupo(item)) {
        const itens = [];
        const juntar = (arr) => { for (const sub of Array.isArray(arr) ? arr : []) {
          if (!sub || typeof sub !== 'object') continue;
          if (ehGrupo(sub)) juntar(sub.itens); else itens.push(limpaLink(sub));
        } };
        juntar(item.itens);
        // O grupo pode ter atalho próprio, que abre todos os links dele (além dos atalhos de cada link).
        const atalhoGrupo = normalizarSalvo(item.atalho);
        saida.push({ id: item.id || novoId(), tipo: 'grupo', nome: String(item.nome || ''), itens, ...(atalhoGrupo ? { atalho: atalhoGrupo } : {}) });
      } else saida.push(limpaLink(item));
    }
    return saida;
  }

  /** Links com URL de um grupo, na ordem em que aparecem nele. */
  const linksAbriveis = (grupo) => (Array.isArray(grupo.itens) ? grupo.itens : []).filter(l => l && !ehGrupo(l) && l.url);

  /**
   * Todos os links cujo atalho (do próprio link ou do grupo dele) combina com a tecla, na ordem do menu.
   * O atalho de um grupo entra com todos os links do grupo, como itens do grupo. Se o mesmo atalho também
   * for de outros links ou grupos, tudo vem junto, num só resultado (um link não se repete).
   */
  function coletarCorrespondencias(config, ev) {
    const achados = [];
    const juntar = (item, categoria, grupo) => {
      const repetido = achados.some(x => x.categoria === categoria && (item.id ? x.id === item.id : x.url === item.url));
      if (!repetido) achados.push({ id: item.id || '', nome: item.nome || item.url, url: item.url, categoria, grupo: grupo || '' });
    };
    for (const categoria of CATEGORIAS) {
      const lista = Array.isArray(config && config[categoria]) ? config[categoria] : [];
      for (const item of lista) {
        if (!ehGrupo(item)) continue;
        const a = normalizarSalvo(item.atalho);
        if (a && combina(ev, a)) for (const l of linksAbriveis(item)) juntar(l, categoria, item.nome);
      }
      paraCadaLink(lista, (item, grupo) => {
        if (!item.url) return;
        const a = normalizarSalvo(item.atalho);
        if (a && combina(ev, a)) juntar(item, categoria, grupo ? grupo.nome : '');
      });
    }
    return achados;
  }

  /** Quantos OUTROS atalhos (de links ou de grupos) usam o mesmo atalho (para avisar que abrirá um menu de escolha). */
  function contarCompartilhamento(config, atalho, itemId) {
    let n = 0;
    for (const categoria of CATEGORIAS) {
      const lista = Array.isArray(config && config[categoria]) ? config[categoria] : [];
      for (const item of lista) {
        if (ehGrupo(item) && item.id !== itemId && mesmoAtalho(normalizarSalvo(item.atalho), atalho)) n++;
      }
      paraCadaLink(lista, (item) => {
        if (item.id !== itemId && mesmoAtalho(normalizarSalvo(item.atalho), atalho)) n++;
      });
    }
    return n;
  }

  // ── Menu de escolha ────────────────────────────────────────────────────────
  const MENU = { colunaLargura: 260, linhaAltura: 28, preenchimento: 4, borda: 1, maxSemDividir: 5, margemVertical: 0.10 };

  /** Até 5 opções: 1 coluna. 6 ou mais: 2 colunas, e a esquerda fica com a sobra (ímpar). */
  function dispor(n) {
    const colunas = n > MENU.maxSemDividir ? 2 : 1;
    return { colunas, linhas: Math.ceil(n / colunas) };
  }

  /**
   * Organiza os achados no menu de escolha.
   * - Sem nenhum grupo: layout antigo (até 5 opções em 1 coluna; 6 ou mais em 2, a esquerda com a sobra).
   * - Com grupos: (1) os links SEM grupo formam um bloco no topo, distribuídos nas mesmas colunas dos grupos;
   *   (2) abaixo, cada grupo é uma seção (cabeçalho + seus links) que NUNCA é dividida entre colunas, e os
   *   cabeçalhos da primeira linha de grupos ficam alinhados na mesma linha. Seções são sequências contíguas
   *   com o mesmo (categoria, grupo). Com mais de 5 linhas e 2+ grupos, usa 2 colunas, cortando entre grupos no
   *   ponto que deixa a maior coluna mais baixa.
   * Retorna { ordem, colunas, linhas, agrupado, linhasSolto }:
   *   ordem  = índices dos achados na ORDEM DO MENU (soltos primeiro); os 'indice' das células se referem a
   *            posições nessa ordem, então o chamador deve reordenar os achados com ela;
   *   colunas = [[{tipo:'grupo',nome,linha} | {tipo:'item',indice,sub,linha}]] com 'linha' absoluta (0 = topo).
   */
  function organizarMenu(achados) {
    const bruto = Array.isArray(achados) ? achados : [];
    const temGrupo = bruto.some(a => a && a.grupo);
    const ordem = temGrupo
      ? [...bruto.keys()].filter(i => !(bruto[i] && bruto[i].grupo)).concat([...bruto.keys()].filter(i => bruto[i] && bruto[i].grupo))
      : [...bruto.keys()];
    const lista = ordem.map(i => bruto[i]);
    if (!temGrupo) {
      const { colunas, linhas } = dispor(lista.length);
      const cols = [];
      for (let c = 0; c < colunas; c++) {
        cols.push(lista.slice(c * linhas, (c + 1) * linhas).map((_, k) => ({ tipo: 'item', indice: c * linhas + k, sub: false, linha: k })));
      }
      return { ordem, colunas: cols, linhas, agrupado: false, linhasSolto: 0 };
    }
    const nSolto = lista.filter(a => !(a && a.grupo)).length;
    // Seções de grupo (contíguas por categoria+grupo), a partir dos links já reordenados.
    const secoes = [];
    lista.forEach((a, indice) => {
      if (indice < nSolto) return;
      const chave = ((a && a.categoria) || '') + '\u0000' + a.grupo;
      const ultima = secoes[secoes.length - 1];
      if (ultima && ultima.chave === chave) ultima.indices.push(indice);
      else secoes.push({ chave, grupo: a.grupo, indices: [indice] });
    });
    const tamanhos = secoes.map(sec => sec.indices.length + 1); // + cabeçalho
    const totalGrupos = tamanhos.reduce((a, b) => a + b, 0);
    let corte = secoes.length;
    if (nSolto + totalGrupos > MENU.maxSemDividir && secoes.length > 1) {
      let melhor = Infinity, esquerda = 0;
      for (let k = 1; k < secoes.length; k++) {
        esquerda += tamanhos[k - 1];
        const maior = Math.max(esquerda, totalGrupos - esquerda);
        if (maior < melhor) { melhor = maior; corte = k; }
      }
    }
    const nCols = corte < secoes.length ? 2 : 1;
    const linhasSolto = Math.ceil(nSolto / nCols);
    const cols = [];
    for (let c = 0; c < nCols; c++) {
      const celulas = [];
      // Bloco de links soltos: coluna por coluna, a esquerda recebe a sobra.
      for (let k = 0; k < linhasSolto; k++) {
        const indice = c * linhasSolto + k;
        if (indice < nSolto) celulas.push({ tipo: 'item', indice, sub: false, linha: k });
      }
      // Grupos começam sempre na mesma linha (logo abaixo do bloco de soltos).
      let linha = linhasSolto;
      for (const sec of (c === 0 ? secoes.slice(0, corte) : secoes.slice(corte))) {
        celulas.push({ tipo: 'grupo', nome: sec.grupo, linha: linha++ });
        for (const indice of sec.indices) celulas.push({ tipo: 'item', indice, sub: true, linha: linha++ });
      }
      cols.push(celulas);
    }
    const linhas = Math.max(...cols.map(col => col.reduce((m, x) => Math.max(m, x.linha + 1), 0)));
    return { ordem, colunas: cols, linhas, agrupado: true, linhasSolto };
  }

  /** Aceita a quantidade de opções (layout antigo) ou o layout de organizarMenu. */
  function tamanhoMenu(arg) {
    const layout = typeof arg === 'number' ? organizarMenu(Array.from({ length: arg }, () => ({}))) : arg;
    const colunas = layout.colunas.length, linhas = layout.linhas;
    return {
      colunas, linhas,
      width: colunas * MENU.colunaLargura + 2 * MENU.borda,
      height: linhas * MENU.linhaAltura + 2 * MENU.preenchimento + 2 * MENU.borda
    };
  }

  const limitar = (v, min, max) => Math.max(min, Math.min(v, max));

  /** Centraliza no cursor; na vertical respeita 10% de margem no topo e na base da área útil. */
  function posicionarMenu({ cursor, workArea, width, height }) {
    const maxAltura = Math.floor(workArea.height * (1 - 2 * MENU.margemVertical));
    const h = Math.min(height, maxAltura);
    const w = Math.min(width, workArea.width);
    const topo = workArea.y + workArea.height * MENU.margemVertical;
    const base = workArea.y + workArea.height * (1 - MENU.margemVertical);
    return {
      x: Math.round(limitar(cursor.x - w / 2, workArea.x, workArea.x + workArea.width - w)),
      y: Math.round(limitar(cursor.y - h / 2, topo, base - h)),
      width: w,
      height: h
    };
  }

  return {
    CATEGORIAS, MENU, ehGrupo, paraCadaLink, sanearLista, novoId, ehModificador, deEvento, mesmoAtalho, combina, descrever, nomeDaTecla, motivoDeRecusa,
    avaliarTecla, normalizarSalvo, coletarCorrespondencias, contarCompartilhamento, dispor, organizarMenu, tamanhoMenu, posicionarMenu
  };
});
