'use strict';
/**
 * SuperPROC - Arrastar e soltar no menu do Acesso Rápido (Jurisprudência, Legislação, Ferramentas).
 *
 * Funciona como os favoritos dos navegadores: clicar, segurar e arrastar muda a ordem e coloca/tira links de
 * dentro dos grupos. O menu principal e o submenu do grupo são janelas separadas; o arraste começa numa delas
 * e o host repassa a posição do mouse à janela que estiver por baixo (ver main.js, "ARRASTE NO MENU HOVER").
 *
 * Regras (as mesmas do diálogo "Gerenciar links"):
 * - Grupos só existem no nível de cima e têm um só nível: um grupo arrastado nunca entra em outro grupo.
 * - Soltar na metade de cima de uma linha coloca ANTES dela; na de baixo, DEPOIS. Soltar no meio de um grupo
 *   (link arrastado no menu principal) coloca o link DENTRO do grupo, no fim.
 * - O destino herda o "lado" da linha-alvo: linha do submenu = dentro do grupo; linha do menu = fora.
 *
 * Este arquivo é usado pelo host (Node) e pela janela do menu (navegador), por isso não depende de nada.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SuperprocArrasteAcessoRapido = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ehGrupo = (item) => !!item && item.tipo === 'grupo';

  // Zona da linha sob o mouse: 'antes' | 'depois' | 'dentro'. `dentro` só para link arrastado sobre grupo
  // do menu principal (o quarto de cima e o de baixo continuam valendo como antes/depois).
  function zonaDaLinha({ top, height }, y, { linhaEhGrupo = false, arrastandoGrupo = false } = {}) {
    const rel = height > 0 ? (y - top) / height : 0.5;
    if (linhaEhGrupo && !arrastandoGrupo) {
      if (rel < 0.25) return 'antes';
      if (rel > 0.75) return 'depois';
      return 'dentro';
    }
    return rel < 0.5 ? 'antes' : 'depois';
  }

  function localizar(lista, id) {
    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];
      if (!item) continue;
      if (item.id === id) return { item, container: lista, index: i, grupo: null, grupoIndex: -1 };
      if (ehGrupo(item) && Array.isArray(item.itens)) {
        const j = item.itens.findIndex((x) => x && x.id === id);
        if (j !== -1) return { item: item.itens[j], container: item.itens, index: j, grupo: item, grupoIndex: i };
      }
    }
    return null;
  }

  /**
   * Move `idArrastado` para o destino descrito por `alvo` e devolve uma NOVA lista (a original não muda),
   * ou null quando o movimento é inválido ou não muda nada.
   * alvo = { grupoId: id do grupo cujo submenu contém a linha-alvo (null = menu principal),
   *          alvoId: id da linha-alvo (null = espaço vazio, fim da lista),
   *          posicao: 'antes' | 'depois' | 'dentro' | 'fim' }
   */
  function moverItem(listaOriginal, idArrastado, alvo) {
    if (!Array.isArray(listaOriginal) || !idArrastado || !alvo) return null;
    const lista = JSON.parse(JSON.stringify(listaOriginal));
    const src = localizar(lista, idArrastado);
    if (!src) return null;
    const item = src.item;
    const grupoAlvo = alvo.grupoId ? lista.find((x) => ehGrupo(x) && x.id === alvo.grupoId) : null;
    if (alvo.grupoId && !grupoAlvo) return null;
    const containerAlvo = grupoAlvo ? (grupoAlvo.itens = Array.isArray(grupoAlvo.itens) ? grupoAlvo.itens : []) : lista;
    const linha = alvo.alvoId ? localizar(lista, alvo.alvoId) : null;
    if (alvo.alvoId && (!linha || linha.container !== containerAlvo)) return null;
    if (linha && linha.item.id === item.id) return null;
    const posicao = alvo.posicao || 'fim';
    const antes = JSON.stringify(listaOriginal);

    let destino;
    let pos;
    if (ehGrupo(item)) {
      // Grupo: sempre no nível de cima. Linha dentro de um grupo vale como o próprio grupo.
      destino = lista;
      if (grupoAlvo) {
        if (grupoAlvo.id === item.id) return null;
        pos = lista.indexOf(grupoAlvo) + (posicao === 'antes' ? 0 : 1);
      } else if (linha) {
        pos = linha.index + (posicao === 'antes' ? 0 : 1);
      } else {
        pos = lista.length;
      }
    } else if (linha && posicao === 'dentro' && ehGrupo(linha.item)) {
      destino = linha.item.itens = Array.isArray(linha.item.itens) ? linha.item.itens : [];
      pos = destino.length;
    } else {
      destino = containerAlvo;
      pos = linha ? linha.index + (posicao === 'antes' ? 0 : 1) : destino.length;
    }

    src.container.splice(src.index, 1);
    if (destino === src.container && src.index < pos) pos--;
    destino.splice(pos, 0, item);
    return JSON.stringify(lista) === antes ? null : lista;
  }

  return { zonaDaLinha, moverItem, localizar };
});
