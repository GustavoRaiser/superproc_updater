'use strict';
// Coluna fixa do Copilot (modo "Integrada com Copilot"). Uma WebContentsView dentro da janela principal,
// fora da lista de abas, mostrando só https://copilot.cloud.microsoft/. Só F5 (e Ctrl+R) é comando
// do navegador; os demais atalhos do host são rejeitados. Teclas de digitação e edição (copiar, colar,
// desfazer...) continuam funcionando, senão não seria possível usar o chat. Exceção: os atalhos do Acesso
// Rápido (quick-access-shortcuts.js) também valem com o foco aqui; o bloqueio abaixo não os impede.
// Dependências injetadas para testar sem Electron.

const URL_COPILOT = 'https://copilot.cloud.microsoft/';
const SUFIXOS_MICROSOFT = Object.freeze(['cloud.microsoft', 'microsoft.com', 'microsoftonline.com', 'live.com',
  'office.com', 'office365.com', 'microsoft365.com', 'msauth.net', 'msftauth.net']);

// Remove o anel de foco (outline) de qualquer elemento da página do Copilot. Idempotente (um <style> com id).
const CSS_SEM_CONTORNO_FOCO = '*:focus,*:focus-visible,*:focus-within{outline:none !important}';
const JS_SEM_CONTORNO_FOCO = `(()=>{try{if(document.getElementById('superproc-sem-foco'))return;const s=document.createElement('style');s.id='superproc-sem-foco';s.textContent=${JSON.stringify(CSS_SEM_CONTORNO_FOCO)};(document.head||document.documentElement).appendChild(s)}catch(_){}})()`;

// webContents da coluna: outros módulos (atalhos rápidos) consultam para não agir sobre ela.
const colunas = new WeakSet();
function ehColunaCopilot(wc) { return !!wc && typeof wc === 'object' && colunas.has(wc); }

function analisar(url) {
  try { const u = new URL(url); return { proto: u.protocol, host: u.hostname.toLowerCase() }; }
  catch { return { proto: '', host: '' }; }
}
function hostMicrosoft(host) {
  return !!host && SUFIXOS_MICROSOFT.some(s => host === s || host.endsWith('.' + s));
}
function hostDoCopilot(host) { return host === 'cloud.microsoft' || host.endsWith('.cloud.microsoft'); }

// Registro de diagnóstico: nunca preserva consulta ou fragmento, pois fluxos de identidade
// podem transportar códigos e estado nesses campos. O caminho é limitado para permitir
// comparar rotas gerais sem transformar o log em uma captura de autenticação.
function resumirNavegacao(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return {
      protocolo: u.protocol.slice(0, -1),
      dominio: u.hostname.toLowerCase(),
      caminho: u.pathname.slice(0, 160) || '/',
      provedor: u.hostname.endsWith('.microsoftonline.com') || u.hostname === 'microsoftonline.com'
        ? 'entra' : hostMicrosoft(u.hostname) ? 'microsoft' : 'externo'
    };
  } catch { return null; }
}

// Resumo de uma navegação de janela de login para diagnóstico: domínio e caminho (identificadores mascarados), se o
// retorno trouxe código de autorização e o NOME do erro OAuth. Nunca valores de código, token, estado ou descrição.
const RE_GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RE_NOME_ERRO = /^[A-Za-z0-9_.]{1,60}$/;
function resumirRetorno(url) {
  const saida = { rota: null, temCodigo: false, temToken: false, erro: null, suberro: null };
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return saida;
    saida.rota = (u.hostname.toLowerCase() + u.pathname.replace(RE_GUID, '<id>')).slice(0, 140);
    for (const bruto of [u.search.replace(/^\?/, ''), u.hash.replace(/^#/, '')]) {
      if (!bruto) continue;
      const p = new URLSearchParams(bruto);
      if (p.has('code')) saida.temCodigo = true;
      if (p.has('id_token') || p.has('access_token')) saida.temToken = true;
      const erro = p.get('error'), suberro = p.get('error_subcode');
      if (erro) saida.erro = RE_NOME_ERRO.test(erro) ? erro : '<omitido>';
      if (suberro) saida.suberro = RE_NOME_ERRO.test(suberro) ? suberro : '<omitido>';
    }
  } catch (_) { /* endereço inválido: resumo vazio */ }
  return saida;
}

// Navegação principal da coluna.
//   tipo 'navigate' (clique/redirecionamento da página) ou 'redirect' (redirecionamento do servidor)
// Retorna 'permitir' | 'abrir-aba' (link externo vira aba normal do SuperPROC) | 'bloquear'.
function decidirNavegacao({ urlAtual, urlDestino, tipo = 'navigate' } = {}) {
  const dest = analisar(urlDestino);
  if (dest.proto !== 'https:' && dest.proto !== 'http:') return 'bloquear';
  if (dest.proto === 'https:' && hostMicrosoft(dest.host)) return 'permitir';
  // Redirecionamento do servidor e fluxo de login federado (a página já saiu do Copilot): não é clique do usuário.
  if (tipo === 'redirect') return 'permitir';
  const atual = analisar(urlAtual);
  if (!atual.host || !hostDoCopilot(atual.host)) return 'permitir'; // sem página ainda, ou no meio do login
  return 'abrir-aba';
}

// window.open / target=_blank. Janelas de login Microsoft são permitidas; link externo vira aba normal.
function decidirJanelaNova(url) {
  if (url === 'about:blank') return 'permitir';
  const dest = analisar(url);
  if (dest.proto === 'https:' && hostMicrosoft(dest.host)) return 'permitir';
  if (dest.proto === 'https:' || dest.proto === 'http:') return 'abrir-aba';
  return 'negar';
}

// 'recarregar' (F5/Ctrl+R) | 'permitir' | 'bloquear'. Só keyDown conta.
function classificarTecla(input) {
  if (!input || input.type !== 'keyDown') return 'permitir';
  const key = String(input.key || '');
  const lower = key.toLowerCase();
  if (key === 'F5') return 'recarregar';
  if (/^F\d{1,2}$/.test(key)) return 'bloquear';           // F11, F12, F3...
  if (key === 'Control' || key === 'Shift' || key === 'Meta') return 'permitir';
  const ctrl = !!(input.control || input.meta);
  if (ctrl && input.alt) return 'permitir';                 // AltGr (teclado ABNT2: / ? { } [ ])
  if (input.alt) return 'bloquear';                         // Alt+setas (voltar/avançar), menu
  if (!ctrl) return 'permitir';
  if (lower === 'r') return 'recarregar';
  if (['a', 'c', 'v', 'x', 'z', 'y'].includes(lower)) return 'permitir';   // edição de texto
  if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(key)) return 'permitir';
  return 'bloquear';                                        // Ctrl+W/T/N/Tab/F/P/S/L/+/-/0...
}

function criarColunaCopilot({ WebContentsView, Menu, getSession, getUserAgent, getMainWindow, abrirComoAba = () => {}, log = () => {}, url = URL_COPILOT, preload = null, fallbackUrl = null, diagnosticoNavegacao = false, removerContornoFoco = true, observarColuna, observarJanela = null, observarJanelaEstado = null, observarPagina = null, resolverUrlInicial = null }) {
  let view = null;
  let anexada = false;
  let retomadas = 0;
  let modoDireto = false;

  const vivo = () => !!view && !!view.webContents && !view.webContents.isDestroyed();
  const janela = () => { const w = getMainWindow(); return w && !w.isDestroyed() ? w : null; };

  function criar() {
    view = new WebContentsView({
      webPreferences: { session: getSession(), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, ...(preload ? { preload } : {}) }
    });
    const wc = view.webContents;
    colunas.add(wc);
    observarColuna?.(wc);
    const ua = getUserAgent && getUserAgent();
    if (ua) wc.setUserAgent(ua);
    try { const p = wc.setVisualZoomLevelLimits(1, 1); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch (_) {}
    try { wc.setBackgroundThrottling(false); } catch (_) {} // oculta (fora da janela) ou em segundo plano, o chat segue ativo

    wc.on('before-input-event', (event, input) => {
      const acao = classificarTecla(input);
      if (acao === 'permitir') return;
      event.preventDefault();
      if (acao === 'recarregar' && !wc.isDestroyed()) wc.reload();
    });

    const navegacao = tipo => (event, destino) => {
      const acao = decidirNavegacao({ urlAtual: wc.getURL(), urlDestino: destino, tipo });
      if (diagnosticoNavegacao) {
        const resumo = resumirNavegacao(destino);
        if (resumo) log('COPILOT_LOGIN_ROTA', 'Navegação da coluna registrada sem parâmetros', { tipo, acao, ...resumo });
      }
      if (acao === 'permitir') return;
      event.preventDefault();
      if (acao === 'abrir-aba') abrirComoAba(destino);
      else log('COPILOT_COLUNA_BLOQUEIO', 'Navegação bloqueada na coluna do Copilot');
    };
    wc.on('will-navigate', navegacao('navigate'));
    wc.on('will-redirect', navegacao('redirect'));
    if (diagnosticoNavegacao) wc.on('did-navigate', (_event, destino) => {
      const resumo = resumirNavegacao(destino);
      if (resumo) log('COPILOT_LOGIN_ROTA', 'Destino principal da coluna registrado sem parâmetros', { tipo: 'concluida', ...resumo });
    });

    wc.setWindowOpenHandler(({ url: destino }) => {
      const acao = decidirJanelaNova(destino);
      if (acao === 'permitir') {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } } };
      }
      if (acao === 'abrir-aba') abrirComoAba(destino);
      return { action: 'deny' };
    });

    // Diagnóstico das janelas abertas pela página (login da Microsoft): por onde passaram, como terminaram e quando
    // há uma em andamento (sinal usado para só instalar a ponte depois que o login terminar).
    if (typeof observarJanela === 'function' || typeof observarJanelaEstado === 'function') wc.on('did-create-window', (janelaFilha) => {
      const filho = janelaFilha && janelaFilha.webContents;
      if (!filho) return;
      if (typeof observarJanelaEstado === 'function') { try { observarJanelaEstado(true); } catch (_) { /* não afeta a coluna */ } }
      const inicio = Date.now();
      const resumo = { rotas: [], temCodigo: false, temToken: false, erro: null, suberro: null, status: null };
      const ver = (destino, status) => {
        const r = resumirRetorno(destino);
        if (r.rota && resumo.rotas[resumo.rotas.length - 1] !== r.rota && resumo.rotas.length < 10) resumo.rotas.push(r.rota);
        resumo.temCodigo = resumo.temCodigo || r.temCodigo; resumo.temToken = resumo.temToken || r.temToken;
        resumo.erro = r.erro || resumo.erro; resumo.suberro = r.suberro || resumo.suberro;
        if (Number.isInteger(status)) resumo.status = status;
      };
      filho.on('did-navigate', (_e, destino, status) => ver(destino, status));
      filho.on('did-navigate-in-page', (_e, destino, principal) => { if (principal) ver(destino); });
      filho.on('did-fail-load', (_e, codigo, _d, destino, principal) => { if (principal && codigo !== -3) { ver(destino); resumo.falhaDeCarga = codigo; } });
      filho.once('destroyed', () => {
        if (typeof observarJanelaEstado === 'function') { try { observarJanelaEstado(false); } catch (_) { /* não afeta a coluna */ } }
        if (typeof observarJanela === 'function') { try { observarJanela({ ...resumo, duracaoMs: Date.now() - inicio }); } catch (_) { /* diagnóstico não afeta a coluna */ } }
      });
    });

    // Diagnóstico da página (opcional): erros/avisos do console e recursos carregados (scripts, fetch/xhr), lidos do
    // próprio documento em mundo isolado. Quem recebe é responsável por sanear e limitar antes de guardar.
    if (typeof observarPagina === 'function') {
      wc.on('console-message', (e) => {
        const nivel = typeof e.level === 'string' ? e.level : ['debug', 'info', 'warning', 'error'][e.level] || String(e.level);
        if (nivel !== 'error' && nivel !== 'warning') return;
        try { observarPagina({ tipo: 'console', nivel, mensagem: String(e.message || ''), fonte: String(e.sourceId || '') }); } catch (_) { /* diagnóstico não afeta a coluna */ }
      });
      const LER = "(() => performance.getEntriesByType('resource').map(r => [r.initiatorType, String(r.name).split(/[?#]/)[0].slice(0, 220), r.responseStatus || 0]))()";
      const lerRecursos = () => {
        if (wc.isDestroyed()) return;
        let origem = '';
        try { origem = new URL(wc.getURL()).origin; } catch (_) { return; }
        wc.executeJavaScriptInIsolatedWorld(1094, [{ code: LER }]).then((lista) => {
          if (Array.isArray(lista)) { try { observarPagina({ tipo: 'recursos', origem, lista }); } catch (_) { /* idem */ } }
        }).catch(() => {});
      };
      const relogio = setInterval(lerRecursos, 5000);
      if (typeof relogio.unref === 'function') relogio.unref();
      wc.once('destroyed', () => clearInterval(relogio));
    }

    // Menu de contexto mínimo: só edição/cópia (nada de voltar, abrir em nova aba, inspecionar).
    wc.on('context-menu', (_e, p) => {
      const modelo = p.isEditable
        ? [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]
        : (p.selectionText ? [{ role: 'copy' }] : []);
      if (modelo.length && Menu) Menu.buildFromTemplate(modelo).popup({ window: janela() || undefined });
    });

    wc.on('render-process-gone', (_e, detalhes) => {
      log('COPILOT_COLUNA_QUEDA', 'Processo da coluna do Copilot encerrou: ' + (detalhes && detalhes.reason));
      if (retomadas++ < 3) setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 1000);
    });
    wc.on('did-finish-load', () => { retomadas = 0; });
    // Sem contorno de foco (amarelo) ao clicar no conteúdo; vale para a página principal e para iframes.
    if (removerContornoFoco) wc.on('did-frame-finish-load', () => {
      if (wc.isDestroyed() || !wc.mainFrame) return;
      for (const f of wc.mainFrame.framesInSubtree) {
        try { f.executeJavaScript(JS_SEM_CONTORNO_FOCO).catch(() => {}); } catch (_) {}
      }
    });
    if (preload && fallbackUrl) wc.on('did-fail-load', (_e, codigo, _descricao, _u, principal) => {
      if (!principal && codigo !== -3) { log('COPILOT_ANFITRIAO', 'Falha no iframe: ' + codigo); usarModoDireto(); }
    });
    // resolverUrlInicial (opcional): decide a URL antes de carregar (ex.: pular a tela de entrada quando já há sessão Microsoft).
    const carregar = (u) => { if (!wc.isDestroyed()) wc.loadURL(u).catch(() => { usarModoDireto(); }); };
    if (modoDireto && fallbackUrl) carregar(fallbackUrl);
    else if (typeof resolverUrlInicial === 'function') Promise.resolve().then(() => resolverUrlInicial(url)).then((u) => carregar(typeof u === 'string' && u ? u : url), () => carregar(url));
    else carregar(url);
  }

  function remover() {
    const w = janela();
    if (anexada && view && w) { try { w.contentView.removeChildView(view); } catch (_) {} }
    anexada = false;
  }

  // retangulo = área da coluna (coordenadas da janela); null = modo sem coluna (a view é só retirada
  // da janela e continua viva, preservando a conversa).
  function aplicar(retangulo) {
    const w = janela();
    if (!w) return false;
    if (!retangulo || retangulo.width <= 0 || retangulo.height <= 0) { remover(); return false; }
    if (!vivo()) { view = null; anexada = false; criar(); }
    if (!anexada) { w.contentView.addChildView(view); anexada = true; }
    view.setBounds(retangulo);
    return true;
  }

  function recarregar() { if (vivo()) view.webContents.reload(); }

  function usarModoDireto() {
    if (!fallbackUrl || modoDireto || !vivo()) return false;
    modoDireto = true;
    log('COPILOT_ANFITRIAO', 'Retorno à coluna direta após falha do experimento');
    view.webContents.loadURL(fallbackUrl).catch(() => {});
    return true;
  }

  function destruir() {
    remover();
    if (vivo()) { try { view.webContents.close(); } catch (_) {} }
    view = null;
  }

  return { aplicar, recarregar, destruir, usarModoDireto, getView: () => (vivo() ? view : null), estaAnexada: () => anexada };
}

module.exports = { URL_COPILOT, ehColunaCopilot, decidirNavegacao, decidirJanelaNova, classificarTecla, resumirNavegacao, resumirRetorno, criarColunaCopilot };
