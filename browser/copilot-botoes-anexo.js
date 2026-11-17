'use strict';
// Botões PDF e MIN no rodapé da barra lateral do Copilot (coluna). Só acrescentam dois elementos ao DOM da página;
// o clique avisa o host (console com segredo por página) e o host aciona o MESMO envio dos atalhos PDF/Minuta
// (anexa o PDF aberto / a minuta ao chat). Não lê nem altera a conversa. Dependências injetadas para testar sem Electron.
const crypto = require('node:crypto');

const PREFIXO = '__superproc_anexo__';
const CONTAINER_ID = 'sp-anexo-botoes';
const TIPOS = Object.freeze({ pdf: 'PDF', minuta: 'MIN' });
const TITULOS = Object.freeze({ pdf: 'Anexar o PDF aberto ao chat', minuta: 'Anexar a minuta ao chat' });

// Roda na página do Copilot. Idempotente: reinstalar só atualiza o segredo; o observador recoloca os botões quando o React
// refaz a barra lateral (abrir/compactar) ou troca de tela.
function naPagina(cfg) {
  const antigo = globalThis.__spAnexo;
  if (antigo && antigo.versao === 1) { antigo.segredo(cfg.segredo); return { ok: true, reinstalado: false }; }
  if (antigo) { try { antigo.destruir(); } catch (_) {} }
  const emitir = console.debug.bind(console);
  let segredo = cfg.segredo, caixa = null;
  const ocupados = new Set();

  function estilo() {
    if (document.getElementById(cfg.id + '-css')) return;
    const s = document.createElement('style'); s.id = cfg.id + '-css';
    s.textContent = '#' + cfg.id + '{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;padding:4px 6px;box-sizing:border-box}' +
      '#' + cfg.id + ' button{font:600 10px/1 "Segoe UI",system-ui,sans-serif;letter-spacing:.3px;min-width:30px;padding:5px 4px;cursor:pointer;' +
      'color:var(--colorNeutralForeground2,#424242);background:transparent;border:1px solid var(--colorNeutralStroke1,#d1d1d1);border-radius:4px}' +
      '#' + cfg.id + ' button:hover{background:var(--colorNeutralBackground1Hover,#f5f5f5);color:var(--colorNeutralForeground1,#242424)}' +
      '#' + cfg.id + ' button[aria-busy="true"]{opacity:.5;cursor:progress}';
    document.head.appendChild(s);
  }
  function montar() {
    const rodape = document.querySelector('[data-testid="nav-footer"]');
    if (!rodape) return;
    if (caixa && caixa.isConnected && caixa.parentNode === rodape) return;
    const velha = document.getElementById(cfg.id); if (velha) velha.remove();
    estilo();
    caixa = document.createElement('div'); caixa.id = cfg.id; caixa.setAttribute('role', 'group'); caixa.setAttribute('aria-label', 'Anexar ao chat');
    for (const tipo of Object.keys(cfg.tipos)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tipo = tipo;
      b.textContent = cfg.tipos[tipo]; b.title = cfg.titulos[tipo]; b.setAttribute('aria-label', cfg.titulos[tipo]);
      b.addEventListener('mousedown', (e) => e.preventDefault()); // não rouba o foco do campo de mensagem
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (!e.isTrusted || ocupados.has(tipo)) return; emitir(cfg.prefixo + segredo + ':' + tipo); });
      caixa.appendChild(b);
    }
    rodape.insertBefore(caixa, rodape.firstChild);
  }
  const mo = new MutationObserver(() => { if (!caixa || !caixa.isConnected) montar(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  globalThis.__spAnexo = {
    versao: 1,
    segredo(v) { segredo = v; },
    ocupado(tipo, v) { if (v) ocupados.add(tipo); else ocupados.delete(tipo); const b = caixa && caixa.querySelector('[data-tipo="' + tipo + '"]'); if (b) b.setAttribute('aria-busy', v ? 'true' : 'false'); },
    destruir() { mo.disconnect(); if (caixa) caixa.remove(); const c = document.getElementById(cfg.id + '-css'); if (c) c.remove(); delete globalThis.__spAnexo; }
  };
  montar();
  return { ok: true, reinstalado: true };
}

const chamada = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg).replace(/</g, '\\u003c')})`;
const scripts = {
  instalar: (segredo) => chamada(naPagina, { id: CONTAINER_ID, prefixo: PREFIXO, segredo, tipos: TIPOS, titulos: TITULOS }),
  ocupado: (tipo, v) => `(globalThis.__spAnexo && globalThis.__spAnexo.ocupado(${JSON.stringify(String(tipo))}, ${v ? 'true' : 'false'}), true)`
};

// Chat do Copilot: https em cloud.microsoft (e subdomínios). Telas de login não recebem os botões.
function ehPaginaDoChat(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'cloud.microsoft' || u.hostname.endsWith('.cloud.microsoft')); }
  catch { return false; }
}

// Interpreta a mensagem do console; devolve 'pdf' | 'minuta' ou null (segredo errado, outro texto, tipo desconhecido).
function interpretar(mensagem, segredo) {
  const m = typeof mensagem === 'string' ? mensagem : '';
  const cabeca = PREFIXO + segredo + ':';
  if (!segredo || !m.startsWith(cabeca)) return null;
  const tipo = m.slice(cabeca.length);
  return Object.prototype.hasOwnProperty.call(TIPOS, tipo) ? tipo : null;
}

function criarBotoesAnexo({ ehColuna, acionar, log = () => {}, ativo = () => true }) {
  const ligados = new WeakMap(); // wc -> { segredo, emAndamento:Set }

  async function instalar(wc) {
    if (!wc || wc.isDestroyed() || !ehColuna(wc) || !ativo()) return false;
    if (!ehPaginaDoChat(wc.getURL())) return false;
    let est = ligados.get(wc); if (!est) return false;
    est.segredo = crypto.randomBytes(16).toString('hex');
    try { await wc.mainFrame.executeJavaScript(scripts.instalar(est.segredo), false); return true; }
    catch (_) { return false; }
  }

  async function aoConsole(wc, mensagem) {
    const est = ligados.get(wc); if (!est || !ativo()) return;
    const tipo = interpretar(mensagem, est.segredo); if (!tipo) return;
    if (est.emAndamento.has(tipo)) return;
    est.emAndamento.add(tipo);
    const marcar = (v) => { try { if (!wc.isDestroyed()) wc.mainFrame.executeJavaScript(scripts.ocupado(tipo, v), false).catch(() => {}); } catch (_) {} };
    marcar(true);
    try { await acionar(tipo); log('COPILOT_BOTOES_ANEXO', 'Botão ' + TIPOS[tipo] + ' acionado'); }
    catch (_) { log('COPILOT_BOTOES_ANEXO', 'Botão ' + TIPOS[tipo] + ' falhou'); }
    finally { est.emAndamento.delete(tipo); marcar(false); }
  }

  // Liga a um webContents (a coluna é reconhecida só quando a página carrega, pois a view nasce depois do evento de criação).
  function ligar(wc) {
    if (!wc || ligados.has(wc)) return;
    ligados.set(wc, { segredo: '', emAndamento: new Set() });
    const tentar = () => { instalar(wc).catch(() => {}); };
    wc.on('dom-ready', tentar);
    wc.on('did-navigate', tentar);
    wc.on('console-message', (event, ...rest) => {
      const texto = (event && typeof event.message === 'string') ? event.message : (typeof rest[1] === 'string' ? rest[1] : (typeof rest[0] === 'string' ? rest[0] : ''));
      aoConsole(wc, texto).catch(() => {});
    });
  }

  function instalarEmTodos({ app, webContents }) {
    app.on('web-contents-created', (_e, wc) => ligar(wc));
    for (const wc of webContents.getAllWebContents()) { ligar(wc); instalar(wc).catch(() => {}); }
  }

  return { ligar, instalar, aoConsole, instalarEmTodos };
}

module.exports = { PREFIXO, CONTAINER_ID, TIPOS, scripts, naPagina, ehPaginaDoChat, interpretar, criarBotoesAnexo };
