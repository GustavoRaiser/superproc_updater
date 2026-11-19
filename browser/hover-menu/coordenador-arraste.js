'use strict';
/**
 * SuperPROC - Coordenação, no host, do arrastar e soltar entre o menu do Acesso Rápido e o submenu do grupo.
 *
 * A janela onde o arraste começou captura o mouse e informa a posição na tela (mover). O coordenador repassa
 * a posição, em coordenadas da janela, ao menu ou submenu que estiver por baixo ('hover-drag-over'), que
 * responde com o destino (destino). Cada posição tem um número (seq); só vale a resposta da posição mais recente.
 * Ao soltar (fim), a posição final é conferida de novo e o host espera a resposta dela antes de gravar, para
 * que um destino atrasado nunca seja aplicado no lugar errado.
 *
 * Dependências injetadas (testável sem o host):
 *   janelas()       -> [{ win, lado: 'menu' | 'sub' }] visíveis
 *   grupoDoSub()    -> id do grupo exibido no submenu (o lado do destino vem da janela, não do conteúdo)
 *   lerLista(cat)   -> lista atual da categoria
 *   gravar(cat, l)  -> grava a nova lista (e avisa quem precisar)
 */
const { moverItem } = require('./arraste-acesso-rapido');

const CATEGORIAS = ['jurisprudencia', 'legislacao', 'ferramentas'];
const POSICOES = ['antes', 'depois', 'dentro', 'fim'];

function criarCoordenadorArraste({ janelas, grupoDoSub, lerLista, gravar, esperaFinalMs = 400 }) {
  let estado = null;
  let seq = 0;
  let aguardando = null; // { seq, resolver } da posição final

  const vivas = () => (janelas() || []).filter(j => j && j.win && !j.win.isDestroyed() && j.win.isVisible());
  const sobPonto = (x, y) => vivas().find(({ win }) => {
    const b = win.getBounds();
    return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
  }) || null;

  function avisar(sob, dados) {
    // janelas() pode criar objetos novos a cada chamada: compara a janela, não o objeto.
    for (const j of vivas()) j.win.webContents.send('hover-drag-over', sob && j.win === sob.win ? dados : null);
  }

  // Repassa um ponto da tela; devolve o seq enviado (ou null fora das janelas).
  function repassar(x, y, final = false) {
    const sob = sobPonto(x, y);
    const meu = ++seq;
    estado.alvo = null;
    estado.seqAlvo = meu;
    if (!sob) { avisar(null, null); return null; }
    const b = sob.win.getBounds();
    avisar(sob, { x: x - b.x, y: y - b.y, seq: meu, final, id: estado.id, arrastandoGrupo: estado.grupo, origem: estado.origem });
    return meu;
  }

  return {
    get ativo() { return !!estado; },
    inicio(d) {
      const categoria = d && typeof d.category === 'string' ? d.category : '';
      if (!d || typeof d.id !== 'string' || !d.id || !CATEGORIAS.includes(categoria)) return false;
      estado = { categoria, id: d.id, grupo: d.grupo === true, origem: d.origem === 'sub' ? 'sub' : 'menu', alvo: null, seqAlvo: 0 };
      return true;
    },
    mover(p) {
      if (!estado || !p) return;
      const x = Number(p.screenX), y = Number(p.screenY);
      if (Number.isFinite(x) && Number.isFinite(y)) repassar(x, y);
    },
    destino(sender, resposta) {
      if (!estado || !resposta || typeof resposta !== 'object' || resposta.seq !== estado.seqAlvo) return;
      const j = vivas().find(v => v.win.webContents === sender);
      const a = resposta.alvo;
      const grupoId = j && j.lado === 'sub' ? grupoDoSub() : null;
      estado.alvo = j && a && typeof a === 'object' && !(j.lado === 'sub' && !grupoId) ? {
        grupoId,
        alvoId: typeof a.alvoId === 'string' ? a.alvoId : null,
        posicao: POSICOES.includes(a.posicao) ? a.posicao : 'fim'
      } : null;
      if (aguardando && aguardando.seq === resposta.seq) aguardando.resolver();
    },
    // Devolve a nova lista gravada, ou null se nada mudou (cancelado, solto fora, mesmo lugar).
    async fim(d) {
      const e = estado;
      if (!e) return null;
      let resultado = null;
      try {
        if (d && d.cancelado) return null;
        const x = Number(d && d.screenX), y = Number(d && d.screenY);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const meu = repassar(x, y, true);
          if (meu === null) return null; // solto fora do menu: cancela
          await new Promise((resolver) => {
            const t = setTimeout(resolver, esperaFinalMs);
            aguardando = { seq: meu, resolver: () => { clearTimeout(t); resolver(); } };
          });
          aguardando = null;
        }
        if (!e.alvo) return null;
        const nova = moverItem(lerLista(e.categoria) || [], e.id, e.alvo);
        if (nova) { gravar(e.categoria, nova); resultado = nova; }
        return resultado;
      } finally {
        if (estado === e) estado = null;
        aguardando = null;
        avisar(null, null);
      }
    }
  };
}

module.exports = { criarCoordenadorArraste, CATEGORIAS };
