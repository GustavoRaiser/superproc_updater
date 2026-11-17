document.addEventListener('DOMContentLoaded', () => {
  const api = window.chooserAPI;
  if (!api) return;
  const grade = document.getElementById('grade');
  let itens = [], ativo = 0, pos = [], elementos = [], sequencia = [];

  function marcar(i) {
    ativo = Math.max(0, Math.min(i, itens.length - 1));
    elementos.forEach((el, k) => el && el.classList.toggle('ativo', k === ativo));
    const el = elementos[ativo];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  api.onData((d) => {
    grade.style.minWidth = '0';
    itens = d.itens || [];
    // Colunas já organizadas pelo host (grupos nunca divididos). Sem 'layout', cai no preenchimento por coluna.
    let cols = d.layout;
    if (!Array.isArray(cols)) {
      const linhas = Math.max(1, d.linhas || 1), colunas = Math.max(1, d.colunas || 1);
      cols = [];
      for (let c = 0; c < colunas; c++) {
        cols.push(itens.slice(c * linhas, (c + 1) * linhas).map((_, k) => ({ tipo: 'item', indice: c * linhas + k, sub: false, linha: k })));
      }
    }
    grade.className = 'grade' + (d.agrupado ? ' agrupado' : '') + (d.linhasSolto > 0 ? ' com-solto' : '') + (cols.length > 1 ? ' duas' : '');
    grade.style.setProperty('--linhas', d.linhas);
    grade.style.setProperty('--colunas', cols.length);
    grade.innerHTML = '';
    elementos = new Array(itens.length).fill(null);
    pos = new Array(itens.length).fill(null);
    cols.forEach((col, c) => {
      col.forEach((cel, k) => {
        const r = Number.isInteger(cel.linha) ? cel.linha : k;
        const el = document.createElement('div');
        // Posição explícita: os cabeçalhos de grupo de todas as colunas ficam na mesma linha.
        el.style.gridColumn = String(c + 1);
        el.style.gridRow = String(r + 1);
        if (cel.tipo === 'grupo') {
          el.className = 'cabecalho';
          el.title = cel.nome;
          const nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = cel.nome;
          el.append(nome);
        } else {
          const it = itens[cel.indice] || {};
          el.className = 'item' + (cel.sub ? ' sub' : '');
          el.title = it.nome || '';
          const nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = it.nome || '';
          el.append(nome);
          el.addEventListener('mouseenter', () => marcar(cel.indice));
          el.addEventListener('mousedown', (e) => { e.preventDefault(); api.pick(cel.indice); });
          elementos[cel.indice] = el;
          pos[cel.indice] = { col: c, row: r };
        }
        grade.appendChild(el);
      });
    });
    // Ordem das setas ↑/↓: coluna por coluna, de cima para baixo (links soltos, depois os grupos da coluna).
    sequencia = pos.map((p, i) => ({ i, p })).filter(x => x.p).sort((a, b) => a.p.col - b.p.col || a.p.row - b.p.row).map(x => x.i);
    marcar(sequencia.length ? sequencia[0] : 0);
    // Informa a largura real do conteúdo (maior item; colunas iguais) + as bordas do cartão.
    // Síncrono de propósito: em janela oculta o requestAnimationFrame não roda e o menu nunca apareceria.
    api.size({ seq: d.seq, width: Math.ceil(grade.getBoundingClientRect().width) + 2 });
  });

  // Vizinho em outra coluna: o item cuja linha está mais perto da do item ativo (empate: o de cima).
  function vizinhoLateral(sentido) {
    const atual = pos[ativo];
    if (!atual) return -1;
    let melhor = -1, dist = Infinity;
    pos.forEach((p, i) => {
      if (!p || p.col !== atual.col + sentido) return;
      const dd = Math.abs(p.row - atual.row);
      if (dd < dist) { dist = dd; melhor = i; }
    });
    return melhor;
  }

  // Teclado: ↑/↓ percorrem os links (pulando cabeçalhos), ←/→ trocam de coluna, Enter abre, Esc fecha.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); api.close(); return; }
    if (e.key === 'Enter') { e.preventDefault(); api.pick(ativo); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const k = sequencia.indexOf(ativo) + (e.key === 'ArrowDown' ? 1 : -1);
      if (k >= 0 && k < sequencia.length) marcar(sequencia[k]);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const alvo = vizinhoLateral(e.key === 'ArrowRight' ? 1 : -1);
      if (alvo >= 0) marcar(alvo);
    }
  });
});
