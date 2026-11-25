'use strict';
// Atalhos dos botões PDF e Minuta do Copilot e do modo editor (host). As combinações vêm do menu CFG e valem com o foco em QUALQUER página
// da janela principal do SuperPROC (abas, árvore, editor, coluna do Copilot). A tecla aciona o envio na hora (keyDown);
// segurar a tecla (auto-repeat) não repete o envio. Dependências injetadas para testar sem Electron.
const core = require('./quick-shortcut-core');

function criarTeclasContexto({ app, BrowserWindow, webContents, getMainWindow, getAtalhos, ativo = () => true, acionar }) {
  const ligados = new WeakSet();
  const disparar = (k) => Promise.resolve().then(() => acionar(k)).catch(() => {});

  // before-input-event de qualquer página da janela principal. Retorna true se tratou (e bloqueou) a tecla.
  function aoTecla(event, input, wc) {
    if (!input || !ativo() || input.type !== 'keyDown') return false;
    const a = getAtalhos() || {};
    const k = Object.keys(a).find((n) => { const s = core.normalizarSalvo(a[n]); return s && core.combina(input, s); });
    if (!k) return false;
    const principal = getMainWindow();
    if (!principal || principal.isDestroyed()) return false;
    const dono = wc && BrowserWindow ? BrowserWindow.fromWebContents(wc) : null;
    if (dono && dono !== principal) return false; // menus, diálogos e janelas próprias não disparam
    event.preventDefault();
    if (input.isAutoRepeat) return true; // tecla segurada: não repete o envio
    disparar(k);
    return true;
  }

  function ligar(wc) {
    if (!wc || ligados.has(wc)) return;
    ligados.add(wc);
    wc.on('before-input-event', (event, input) => aoTecla(event, input, wc));
  }

  function instalar() {
    app.on('web-contents-created', (_e, wc) => ligar(wc));
    for (const wc of webContents.getAllWebContents()) ligar(wc);
  }

  return { aoTecla, ligar, instalar };
}

module.exports = { criarTeclasContexto };
