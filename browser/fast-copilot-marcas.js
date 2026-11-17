'use strict';
// Fast Copilot no Editor (host): controle das marcações de alteração (<alt> -> span.sp-fc-alt) na minuta.
// - Ao lado de cada trecho marcado, um botão "limpar" (borracha) remove a marca daquele trecho.
// - Sob o botão do Copilot na barra do CKEditor surge uma "aba" com o número de alterações.
// - Hover no botão do Copilot (ou na aba) mostra "Aceitar todas as alterações".
// Tudo é desenhado numa CAMADA SOBREPOSTA no documento da página, fora do iframe do editor: nada disso entra no
// conteúdo da minuta (getData/salvar). Cada remoção grava ponto de desfazer (Ctrl+Z restaura a marca).
// Roda no contexto principal (precisa do CKEDITOR para o desfazer). Serializado por toString(): sem referências externas.

const BOTAO_COPILOT_ID = 'sp-fc-botao'; // botão do Copilot na barra do CKEditor (criado pela F1)

function naPaginaInstalarMarcas(cfg) {
  const VERSAO = 1;
  const atual = window.__spFastCopilotMarcas;
  if (atual && atual.versao === VERSAO) { atual.atualizar(); return { ok: true, reinstalado: false, total: atual.total() }; }
  if (atual && atual.destruir) atual.destruir();
  const C = window.CKEDITOR;
  if (!C) return { ok: false, motivo: 'editor' };
  const CLASSE = cfg.classe, BOTAO = cfg.botaoId;
  const PREF = 'sp-fc-m-';
  const docs = () => Object.values(C.instances).filter((e) => e.document && e.document.$ && e.document.$.body);
  const iframeDe = (ed) => [...document.querySelectorAll('iframe.cke_wysiwyg_frame')].find((f) => f.contentDocument === ed.document.$);
  const marcas = () => docs().flatMap((ed) => [...ed.document.$.querySelectorAll('span.' + CLASSE)].map((el) => ({ ed, el })));

  // Camada e estilos (no documento principal; fora da minuta).
  const camada = document.createElement('div');
  camada.id = PREF + 'camada';
  Object.assign(camada.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', zIndex: '2147483000', pointerEvents: 'none' });
  const estilo = document.createElement('style');
  estilo.id = PREF + 'estilo';
  estilo.textContent = `
    .${PREF}borracha{position:fixed;width:14px;height:14px;padding:0;margin:0;border:1px solid #b7a100;border-radius:50%;background:#fffde7;
      box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer;pointer-events:auto;display:grid;place-items:center}
    .${PREF}borracha:hover{background:#fff59d;border-color:#8a7a00}
    .${PREF}borracha svg{width:9px;height:9px;display:block}
    #${PREF}aba{position:fixed;pointer-events:auto;background:#fff59d;color:#5b4f00;border:1px solid #b7a100;border-top:none;
      border-radius:0 0 5px 5px;font:600 10px/14px Arial,sans-serif;padding:0 5px;white-space:nowrap;cursor:default}
    #${PREF}menu{position:fixed;pointer-events:auto;background:#fff;border:1px solid #9aa3ad;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.22);padding:3px}
    #${PREF}menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:5px 10px;font:12px Arial,sans-serif;cursor:pointer;border-radius:3px}
    #${PREF}menu button:hover,#${PREF}menu button:focus{background:#eef3f8;outline:none}`;
  document.head.appendChild(estilo);
  document.body.appendChild(camada);

  const ICONE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 2.2 14 6.6a1 1 0 0 1 0 1.4L8.4 13.6H13v1.2H5.6L2 11.2a1 1 0 0 1 0-1.4L8.2 2.2a1 1 0 0 1 1.4 0Zm-4.8 6.2L3.1 10.5l3 3h1.6l1.5-1.5-4.4-3.6Z" fill="#6b5d00"/></svg>';
  const aba = document.createElement('div'); aba.id = PREF + 'aba'; aba.hidden = true; aba.setAttribute('role', 'status');
  const menu = document.createElement('div'); menu.id = PREF + 'menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  const aceitarTodas = document.createElement('button'); aceitarTodas.type = 'button'; aceitarTodas.setAttribute('role', 'menuitem');
  aceitarTodas.textContent = 'Aceitar todas as alterações';
  menu.appendChild(aceitarTodas);
  camada.append(aba, menu);

  // Remove marcas (mantém o texto), agrupando por editor, com desfazer.
  function remover(lista) {
    const porEditor = new Map();
    lista.forEach((m) => { if (m.el.isConnected) (porEditor.get(m.ed) || porEditor.set(m.ed, []).get(m.ed)).push(m.el); });
    let total = 0;
    porEditor.forEach((els, ed) => {
      ed.fire('saveSnapshot');
      els.forEach((el) => { const pai = el.parentNode; while (el.firstChild) pai.insertBefore(el.firstChild, el); el.remove(); pai.normalize(); total++; });
      ed.fire('saveSnapshot'); ed.fire('change');
    });
    atualizar();
    return total;
  }

  const borrachas = new Map(); // span -> botão
  function botaoPara(m) {
    let b = borrachas.get(m.el);
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.className = PREF + 'borracha';
      b.title = 'Aceitar esta alteração (remove a marcação)'; b.setAttribute('aria-label', b.title); b.innerHTML = ICONE;
      b.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco/seleção do editor
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); remover([m]); });
      camada.appendChild(b); borrachas.set(m.el, b);
    }
    return b;
  }

  let quadro = 0;
  function atualizar() { if (!quadro) quadro = requestAnimationFrame(desenhar); }
  function desenhar() {
    quadro = 0;
    const lista = marcas();
    const vivos = new Set(lista.map((m) => m.el));
    borrachas.forEach((b, el) => { if (!vivos.has(el)) { b.remove(); borrachas.delete(el); } });
    lista.forEach((m) => {
      const b = botaoPara(m);
      const f = iframeDe(m.ed); const rf = f && f.getBoundingClientRect();
      const rects = m.el.getClientRects(); const r = rects[rects.length - 1];
      if (!rf || !r) { b.hidden = true; return; }
      // Selo no canto superior direito do trecho: não cobre o texto seguinte.
      const x = rf.left + f.clientLeft + r.right - 7, y = rf.top + f.clientTop + r.top - 10;
      const dentro = y >= rf.top - 2 && y + 14 <= rf.bottom && x >= rf.left && x <= rf.right - 4;
      b.hidden = !dentro;
      if (dentro) { b.style.left = Math.min(x, rf.right - 18) + 'px'; b.style.top = Math.max(y, rf.top) + 'px'; }
    });
    const botao = document.getElementById(BOTAO);
    const n = lista.length;
    if (!n || !botao) { aba.hidden = true; menu.hidden = true; return; }
    const rb = botao.getBoundingClientRect();
    aba.textContent = n === 1 ? '1 alteração' : n + ' alterações';
    aba.hidden = false; aba.style.left = rb.left + 'px'; aba.style.top = rb.bottom + 'px';
    if (!menu.hidden) posicionarMenu();
  }
  function posicionarMenu() { const r = aba.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 2) + 'px'; }

  // Hover: botão do Copilot ou aba abrem o menu; sair de todos fecha (com pequena tolerância).
  let fechar = 0;
  const abrirMenu = () => { clearTimeout(fechar); if (!marcas().length) return; menu.hidden = false; posicionarMenu(); };
  const agendarFechar = () => { clearTimeout(fechar); fechar = setTimeout(() => { menu.hidden = true; }, 250); };
  let botaoOuvido = null;
  function ouvirBotao() {
    const b = document.getElementById(BOTAO);
    if (!b || b === botaoOuvido) return;
    botaoOuvido = b; b.addEventListener('mouseenter', abrirMenu); b.addEventListener('mouseleave', agendarFechar);
  }
  [aba, menu].forEach((el) => { el.addEventListener('mouseenter', abrirMenu); el.addEventListener('mouseleave', agendarFechar); });
  aceitarTodas.addEventListener('mousedown', (e) => e.preventDefault());
  aceitarTodas.addEventListener('click', () => { remover(marcas()); menu.hidden = true; });

  // Acompanhar conteúdo, rolagem e tamanho.
  const observadores = [];
  const ligados = new WeakSet();
  function ligar(ed) {
    const doc = ed.document && ed.document.$; if (!doc || ligados.has(doc)) return;
    ligados.add(doc);
    const mo = new MutationObserver(atualizar); mo.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    observadores.push(() => mo.disconnect());
    const win = doc.defaultView; win.addEventListener('scroll', atualizar, true); win.addEventListener('resize', atualizar);
    observadores.push(() => { win.removeEventListener('scroll', atualizar, true); win.removeEventListener('resize', atualizar); });
  }
  const aoPronto = (ev) => { const ed = ev.editor; ed.on('contentDom', () => { ligar(ed); atualizar(); }); ed.on('change', atualizar); ligar(ed); atualizar(); };
  Object.values(C.instances).forEach((ed) => aoPronto({ editor: ed }));
  C.on('instanceReady', aoPronto);
  window.addEventListener('scroll', atualizar, true); window.addEventListener('resize', atualizar);
  const vigia = setInterval(() => { ouvirBotao(); Object.values(C.instances).forEach(ligar); atualizar(); }, 1000); // barra/editores recriados pela página

  function destruir() {
    clearInterval(vigia); observadores.forEach((f) => f());
    window.removeEventListener('scroll', atualizar, true); window.removeEventListener('resize', atualizar);
    camada.remove(); estilo.remove(); delete window.__spFastCopilotMarcas;
  }
  window.__spFastCopilotMarcas = { versao: VERSAO, atualizar, destruir, total: () => marcas().length, aceitarTodas: () => remover(marcas()) };
  ouvirBotao(); atualizar();
  return { ok: true, reinstalado: true, total: marcas().length };
}

const chamada = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg).replace(/</g, '\\u003c')})`;
const scripts = {
  instalar: (classe, botaoId = BOTAO_COPILOT_ID) => chamada(naPaginaInstalarMarcas, { classe: String(classe), botaoId: String(botaoId) })
};

module.exports = { BOTAO_COPILOT_ID, scripts, _fn: { naPaginaInstalarMarcas } };
