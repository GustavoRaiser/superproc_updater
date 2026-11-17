'use strict';
// Janela do segundo monitor (modo Dois monitores): sem moldura, filha da janela principal (acompanha
// minimizar/fechar, sem item na barra de tarefas), cobrindo a workArea do monitor oposto. Ela só abriga
// UMA view (a árvore/documentos); o controle da aba continua todo no navegador principal.
// Dependências injetadas para testar sem Electron.
//
// Regra validada no protótipo (scripts/proto-mover-view.cjs): destruir a janela com a view dentro
// destruiria a aba. Por isso ocultar()/destruir() sempre desanexam a view antes.

function criarSegundoMonitor({ BrowserWindow, screen, getMainWindow, displayOposto, log = () => {} }) {
  let win = null;
  let atual = null;      // view exibida agora
  let destinoId = null;  // id do display onde a janela está

  const viva = (w) => !!w && !w.isDestroyed();

  function destino() {
    const main = getMainWindow();
    if (!viva(main)) return null;
    return displayOposto(screen.getAllDisplays(), main.getBounds());
  }

  // O monitor oposto existe agora (exatamente 2 monitores)?
  function disponivel() { return destino() !== null; }

  function garantirJanela(main, wa) {
    if (viva(win)) return win;
    win = new BrowserWindow({
      parent: main, frame: false, show: false, skipTaskbar: true, focusable: true,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      x: wa.x, y: wa.y, width: wa.width, height: wa.height, backgroundColor: '#ffffff'
    });
    win.on('closed', () => { win = null; atual = null; destinoId = null; });
    return win;
  }

  function ajustar(wa) {
    // A primeira aplicação de bounds pode ser ignorada/deslocada com escalas de DPI diferentes: repete.
    win.setBounds(wa);
    win.setBounds(wa);
    const [w, h] = win.getContentSize();
    if (atual) atual.setBounds({ x: 0, y: 0, width: w, height: h });
  }

  function desanexar() {
    if (viva(win) && atual) { try { win.contentView.removeChildView(atual); } catch (_) {} }
    atual = null;
  }

  // Exibe a view no monitor oposto. Retorna false se não houver monitor oposto (chamador usa a principal).
  function exibir(view) {
    const main = getMainWindow();
    const dest = destino();
    if (!viva(main) || !dest || !view) return false;
    const wa = dest.workArea || dest.bounds;
    const janela = garantirJanela(main, wa);
    if (atual && atual !== view) desanexar();
    if (atual !== view) {
      try { main.contentView.removeChildView(view); } catch (_) {}
      janela.contentView.addChildView(view);
      atual = view;
    }
    destinoId = dest.id;
    ajustar(wa);
    if (!janela.isVisible()) janela.showInactive();
    return true;
  }

  // Reposiciona (resize, troca de monitor da principal) sem mexer na view. Retorna false se sem destino.
  function reposicionar() {
    if (!viva(win) || !atual) return true;
    const dest = destino();
    if (!dest) return false;
    const wa = dest.workArea || dest.bounds;
    if (dest.id !== destinoId) log('SEGUNDO_MONITOR_TROCOU', 'Monitor de destino mudou');
    destinoId = dest.id;
    ajustar(wa);
    return true;
  }

  // Esconde a janela devolvendo a view (ela continua viva, fora de qualquer janela).
  function ocultar() {
    desanexar();
    if (viva(win) && win.isVisible()) win.hide();
  }

  // Remove a view da janela (ex.: aba fechada) sem esconder a janela.
  function soltar(view) {
    if (view && atual === view) desanexar();
  }

  function destruir() {
    desanexar();
    if (viva(win)) { try { win.destroy(); } catch (_) {} }
    win = null; destinoId = null;
  }

  return {
    exibir, reposicionar, ocultar, soltar, destruir, disponivel,
    estaAberta: () => viva(win) && win.isVisible(),
    getView: () => atual,
    getWindow: () => (viva(win) ? win : null)
  };
}

module.exports = { criarSegundoMonitor };
