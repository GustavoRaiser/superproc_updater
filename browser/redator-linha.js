'use strict';
// Assistente de Redação — ÍCONE NA LINHA DO CURSOR + MENU DE PROMPTS (experimental, opt-in --redator).
// Em qualquer campo onde se digita texto (campo simples, área de texto, editor rico, inclusive dentro de iframe de mesma origem,
// como o editor de minutas), aparece um ícone pequeno à esquerda da linha onde o cursor está: apagado e em tons de cinza, colorido
// ao passar o mouse. Clicar abre um menu com um campo livre ("O que você deseja alterar?"), prompts prontos e os prompts que a
// pessoa adicionar. Escolhido um, o SuperPROC entrega o trecho como CITAÇÃO à coluna do Copilot, envia o pedido, espera a resposta
// e mostra a proposta; nada é escrito no campo sem a pessoa confirmar (Substituir / Inserir abaixo / Copiar / Descartar).
//
// Quem decide onde o ícone aparece é o SuperPROC (campoSensivel): nunca em senha, usuário/login, código de verificação, dados de
// cartão, nem em qualquer campo de um formulário que tenha senha; nem em campo desabilitado ou só de leitura.
//
// Segurança: o script roda em MUNDO ISOLADO (a página não enxerga suas variáveis). Página -> host: só um aviso pelo console com
// { token, op, id }; o conteúdo (trecho, pedido) NÃO passa pelo console — o host vem buscá-lo com coletar(id). O token é sorteado
// por aba e fica só no mundo isolado, então a página não consegue forjar um pedido; cliques sintéticos são ignorados (isTrusted).
// Host: ponte com a coluna em redator-coluna.js. Evidência do mecanismo: achados O33–O43 do estudo captura-outlook.

const ICONE_ID = 'sp-redator-linha-icone';
const MENU_ID = 'sp-redator-linha-menu';
const SINAL_LINHA = '__SP_REDATOR_LINHA__';
const OPS = new Set(['pedir', 'cancelar', 'salvarPrompt', 'removerPrompt', 'copiar']);
const MAX_PROMPTS = 30;

const PROMPTS_PADRAO = Object.freeze([
  { id: 'reescrever', titulo: 'Reescrever automaticamente', instrucao: 'Reescreva o texto selecionado para melhorar a clareza e a fluidez, preservando o sentido e todas as informações' },
  { id: 'corrigir', titulo: 'Corrigir ortografia e gramática', instrucao: 'Corrija a ortografia, a gramática e a pontuação do texto selecionado, sem alterar o sentido nem o estilo' },
  { id: 'curto', titulo: 'Torná-lo mais curto', instrucao: 'Torne o texto selecionado mais curto, preservando as informações essenciais' },
  { id: 'longo', titulo: 'Torná-lo mais longo', instrucao: 'Torne o texto selecionado mais longo sem comprometer a legibilidade e sem inventar fatos novos' },
  { id: 'formal', titulo: 'Tom mais formal', instrucao: 'Reescreva o texto selecionado em tom formal e impessoal, preservando o sentido e todas as informações' }
].map((p) => Object.freeze({ ...p, fixo: true })));

// ---- lógica pura (testável sem DOM; campoSensivel e posicaoIcone também são embutidas no script injetado) ----

// d: { type, autocomplete, name, id, formTemSenha, disabled, readOnly }. true = o ícone NÃO aparece neste campo.
function campoSensivel(d) {
  d = d || {};
  if (d.disabled || d.readOnly) return true;
  if (String(d.type || '').toLowerCase() === 'password') return true;
  if (d.formTemSenha) return true;
  var ac = String(d.autocomplete || '').toLowerCase();
  if (/(^|\s)(username|current-password|new-password|one-time-code|cc-[a-z-]+)(\s|$)/.test(ac)) return true;
  var marcas = (String(d.name || '') + ' ' + String(d.id || '')).toLowerCase();
  if (/(senha|password|passwd|pwd|usuario|usuário|user_?name|login|otp|token|captcha|cpf|cnpj|cart[aã]o|cvv)/.test(marcas)) return true;
  return false;
}

// Onde o ícone fica. campo: {left, top, right, bottom} do campo; linha: {top, height} da linha do cursor; tela: {largura, altura}.
// Regra medida no Outlook: 6 px de folga à esquerda do campo, centrado na linha. Sem espaço à esquerda: à direita; senão, por dentro.
// Quando se sabe onde o TEXTO da linha começa (linha.left; editor rico com margens, recuo de primeira linha, texto centralizado),
// o ícone cola nesse começo: 6 px à esquerda do texto da linha. Se isso o deixaria atravessado na borda do campo, ele fica do
// lado de fora, como na regra do campo; se não couber na tela, vale a regra do campo.
function posicaoIcone(o) {
  var tam = o.tam || 24, folga = o.folga == null ? 6 : o.folga, campo = o.campo, linha = o.linha, tela = o.tela;
  var meio = linha.top + linha.height / 2;
  var visivel = meio >= Math.max(0, campo.top) - 1 && meio <= Math.min(tela.altura, campo.bottom) + 1 && campo.right > 0 && campo.left < tela.largura;
  var lado = 'esquerda', x = campo.left - folga - tam;
  if (typeof linha.left === 'number' && isFinite(linha.left)) {
    var xl = linha.left - folga - tam;
    if (xl < campo.left) xl = Math.min(xl, campo.left - folga - tam); // nunca atravessado na borda do campo
    if (xl >= 2 && xl + tam <= tela.largura - 2) { lado = 'linha'; x = xl; }
  }
  if (x < 2) {
    if (campo.right + folga + tam <= tela.largura - 2) { lado = 'direita'; x = campo.right + folga; }
    else { lado = 'dentro'; x = Math.min(campo.right, tela.largura) - tam - 4; }
  }
  var y = Math.round(meio - tam / 2);
  y = Math.min(Math.max(2, y), Math.max(2, tela.altura - tam - 2));
  return { x: Math.round(x), y: y, lado: lado, visivel: visivel };
}

function normalizarPrompt(p) {
  const titulo = String((p && p.titulo) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const instrucao = String((p && p.instrucao) || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!titulo || !instrucao) return null;
  return { titulo, instrucao };
}

// Aviso de console -> { op, id, token } | null. O conteúdo nunca vem aqui.
function parseSinal(mensagem) {
  const s = String(mensagem == null ? '' : mensagem);
  const i = s.indexOf(SINAL_LINHA);
  if (i < 0) return null;
  try {
    const o = JSON.parse(s.slice(i + SINAL_LINHA.length));
    if (!o || !OPS.has(o.op) || typeof o.id !== 'string' || !/^[a-z0-9]{6,40}$/.test(o.id) || typeof o.token !== 'string') return null;
    return { op: o.op, id: o.id, token: o.token };
  } catch (_) { return null; }
}

const MENSAGENS = Object.freeze({
  OCUPADO: 'Já existe um pedido em andamento. Aguarde a resposta.',
  PEDIDO_VAZIO: 'Escreva o que você quer.',
  COPILOT_INDISPONIVEL: 'A coluna do Copilot não está aberta.',
  COPILOT_FORA_DO_CHAT: 'A coluna do Copilot não está na tela de chat (faça o login ou volte ao chat).',
  ENTRADA_AUSENTE: 'O Copilot desta coluna não aceitou o pedido: a entrada de citação não existe nesta versão da página.',
  ENTREGA_FALHOU: 'O pedido não chegou a ser enviado pelo Copilot.',
  PEDIDO_NAO_SAIU: 'O pedido não chegou a ser enviado pelo Copilot.',
  TEMPO_ESGOTADO: 'O Copilot demorou demais. Veja a resposta na coluna.',
  RESPOSTA_VAZIA: 'O Copilot não devolveu um texto. Veja a coluna.'
});
const mensagemDoMotivo = (motivo) => MENSAGENS[motivo] || 'O Copilot não concluiu o pedido. Veja a coluna.';

// Prompts da pessoa, guardados num arquivo do perfil (valem para todos os sites). deps: { fs, arquivo }
function criarGuardaPrompts({ fs, arquivo } = {}) {
  let cache = null;
  const caminho = () => (typeof arquivo === 'function' ? arquivo() : arquivo);
  const ler = () => {
    if (cache) return cache;
    cache = [];
    try {
      const o = JSON.parse(fs.readFileSync(caminho(), 'utf8'));
      for (const p of (o && Array.isArray(o.prompts) ? o.prompts : []).slice(0, MAX_PROMPTS)) {
        const n = normalizarPrompt(p);
        if (n && typeof p.id === 'string' && /^p[a-z0-9]{4,20}$/.test(p.id) && !cache.some((x) => x.id === p.id)) cache.push({ id: p.id, ...n });
      }
    } catch (_) { /* sem arquivo ou ilegível: começa vazio */ }
    return cache;
  };
  const gravar = () => { try { fs.writeFileSync(caminho(), JSON.stringify({ versao: 1, prompts: cache }, null, 1), 'utf8'); return true; } catch (_) { return false; } };
  return {
    listar: () => [...PROMPTS_PADRAO, ...ler().map((p) => ({ ...p, fixo: false }))],
    adicionar(p) {
      const n = normalizarPrompt(p); const lista = ler();
      if (!n || lista.length >= MAX_PROMPTS) return null;
      const item = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...n };
      lista.push(item); gravar(); return item;
    },
    remover(id) { const lista = ler(); const i = lista.findIndex((p) => p.id === id); if (i < 0) return false; lista.splice(i, 1); gravar(); return true; }
  };
}

// ---- script injetado (mundo isolado). cfg: { iconeId, menuId, sinal, token, prompts }; aj: { campoSensivel, posicaoIcone } ----
function noIsoladoLinha(cfg, aj) {
  const D = document, G = globalThis;
  if (G.__spRedatorLinha && G.__spRedatorLinha.versao === 1) { G.__spRedatorLinha.prompts(cfg.prompts); return { ok: true, reinstalado: false }; }

  const TAM = 24, LIM_VIZ = 1500, LIM_TRECHO = 20000;
  const BASE = 'box-sizing:border-box;margin:0;font:13px/1.4 "Segoe UI",system-ui,sans-serif;color:#1f2328;letter-spacing:normal;text-transform:none;text-align:left;text-shadow:none;';
  let prompts = Array.isArray(cfg.prompts) ? cfg.prompts : [];
  let alvo = null;       // campo onde o cursor está (o último válido)
  let painel = null;     // menu, espera, proposta ou aviso
  let estado = '';       // 'menu' | 'novo' | 'espera' | 'proposta' | 'aviso'
  let captura = null;    // o que foi capturado do campo ao abrir o menu
  let pendente = null;   // { id, titulo }
  let acoesProposta = null; // só na proposta: { aceitar, abaixo|null, copiar } (botões e teclas Enter, Ctrl+Enter, Ctrl+C)
  let teclaEngolida = ''; // tecla que nós tratamos: o soltar dela também não chega à página
  let morto = false;      // depois de destruir(): os ouvintes que ficaram nos documentos não fazem mais nada
  let contG = 0;
  const caixa = new Map(); // id -> dados que o host vem buscar (o conteúdo não passa pelo console)
  const novoId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const enviar = (op, dados) => {
    const id = novoId(); caixa.set(id, Object.assign({ op }, dados || {}));
    if (caixa.size > 20) caixa.delete(caixa.keys().next().value);
    try { console.log(cfg.sinal + JSON.stringify({ token: cfg.token, op, id })); } catch (_) {}
    return id;
  };

  const criar = (tag, css, texto) => { const e = D.createElement(tag); if (css) e.style.cssText = css; if (texto != null) e.textContent = texto; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  function glifo(tam) { // desenho próprio (uma centelha em degradê); não é a marca de nenhum produto
    const s = D.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', tam); s.setAttribute('height', tam);
    s.style.cssText = 'display:block;pointer-events:none;flex:none';
    const gid = 'sp-rl-g' + (++contG); const defs = D.createElementNS(NS, 'defs'); const g = D.createElementNS(NS, 'linearGradient');
    g.setAttribute('id', gid); g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
    [['0', '#2f7bf5'], ['0.45', '#8a4fff'], ['0.75', '#f25ea0'], ['1', '#ff9a3d']].forEach(([o, c]) => { const st = D.createElementNS(NS, 'stop'); st.setAttribute('offset', o); st.setAttribute('stop-color', c); g.appendChild(st); });
    defs.appendChild(g); s.appendChild(defs);
    const p = D.createElementNS(NS, 'path'); p.setAttribute('d', 'M12 2c.8 5.5 4.5 9.2 10 10-5.5.8-9.2 4.5-10 10-.8-5.5-4.5-9.2-10-10 5.5-.8 9.2-4.5 10-10z'); p.setAttribute('fill', 'url(#' + gid + ')');
    s.appendChild(p); return s;
  }

  // ---------- qual é o campo e onde está a linha do cursor ----------
  // Desce por iframes de mesma origem até o elemento realmente em foco. dx/dy: deslocamento do documento do elemento na tela.
  function focoProfundo() {
    let doc = D, el = doc.activeElement, dx = 0, dy = 0, quadro = null, qx = 0, qy = 0;
    for (let i = 0; i < 4 && el && /^(iframe|frame)$/i.test(el.tagName || ''); i++) {
      let filho = null; try { filho = el.contentDocument; } catch (_) { filho = null; }
      if (!filho) return null; // quadro de outra origem: fora do alcance
      const r = el.getBoundingClientRect();
      quadro = el; qx = dx; qy = dy; dx += r.left + el.clientLeft; dy += r.top + el.clientTop;
      doc = filho; vigiar(doc); el = doc.activeElement;
    }
    return { doc, el, dx, dy, quadro, qx, qy };
  }
  function lerAlvo() {
    const f = focoProfundo();
    if (!f || !f.el) return null;
    const el = f.el;
    if (el === icone || (painel && painel.contains(el))) return 'nosso';
    const tag = (el.tagName || '').toLowerCase();
    let tipo = '';
    if (tag === 'textarea') tipo = 'textarea';
    else if (tag === 'input' && /^(text|search|)$/.test((el.getAttribute('type') || '').toLowerCase())) tipo = 'input';
    else if (el.isContentEditable) tipo = 'rico';
    if (!tipo) return null;
    let formTemSenha = false;
    try { const fm = el.form || (el.closest && el.closest('form')); formTemSenha = !!(fm && fm.querySelector('input[type="password"]')); } catch (_) {}
    if (aj.campoSensivel({ type: el.getAttribute('type'), autocomplete: el.getAttribute('autocomplete'), name: el.getAttribute('name'), id: el.id, formTemSenha, disabled: !!el.disabled, readOnly: !!el.readOnly })) return null;
    let raiz = el;
    if (tipo === 'rico') { while (raiz.parentElement && raiz.parentElement.isContentEditable) raiz = raiz.parentElement; }
    return { tipo, el, raiz, doc: f.doc, dx: f.dx, dy: f.dy, quadro: f.quadro, qx: f.qx, qy: f.qy };
  }
  const alturaDeLinha = (e, win) => { const cs = win.getComputedStyle(e); return parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.3; };
  function linhaRica(a) {
    const win = a.doc.defaultView; const sel = win.getSelection();
    let no = null, off = 0;
    if (sel && sel.rangeCount) { const r0 = sel.getRangeAt(0); if (a.raiz.contains(r0.startContainer)) { no = r0.startContainer; off = r0.startOffset; } }
    if (!no) { const rr = a.raiz.getBoundingClientRect(); return { top: rr.top, height: alturaDeLinha(a.raiz, win) }; }
    const r = a.doc.createRange(); r.setStart(no, off); r.collapse(true);
    const rc = r.getClientRects()[0];
    if (rc && rc.height) return { top: rc.top, height: rc.height, left: inicioDaLinha(a, no, rc.top, rc.height, rc.left) };
    let e = no.nodeType === 1 ? (no.childNodes[off] && no.childNodes[off].nodeType === 1 ? no.childNodes[off] : no) : no.parentNode;
    if (!e || !e.getBoundingClientRect) e = a.raiz;
    const er = e.getBoundingClientRect(); const lh = alturaDeLinha(e.nodeType === 1 && e.tagName !== 'BR' ? e : (e.parentElement || a.raiz), win);
    const alt = Math.min(lh, er.height || lh);
    return { top: er.top, height: alt, left: inicioDaLinha(a, no, er.top, alt, null) };
  }
  // Onde o texto da linha do cursor começa (x, no documento do editor): o menor "left" entre os pedaços de texto do bloco que
  // estão nessa linha. Cobre margem da página, recuo de primeira linha e texto centralizado. Linha vazia: a posição do próprio
  // cursor; sem ela, o começo do conteúdo do bloco (com o recuo). null = não deu para medir (vale a regra do campo).
  function inicioDaLinha(a, no, topo, altura, xCursor) {
    try {
      const win = a.doc.defaultView, bloco = blocoDoCursor(no, a);
      if (bloco === a.raiz && String(a.raiz.textContent || '').length > 20000) return null; // texto solto e enorme: não varrer a cada tecla
      const meio = topo + altura / 2; let esq = null;
      const rb = a.doc.createRange(); rb.selectNodeContents(bloco);
      const rs = rb.getClientRects();
      for (let i = 0; i < rs.length; i++) {
        const q = rs[i];
        if (q.width < 1 || q.height < 1 || q.height > altura * 2.5) continue; // vazios e caixas de bloco aninhadas (mais altas que a linha)
        if (q.top <= meio && q.bottom >= meio && (esq === null || q.left < esq)) esq = q.left;
      }
      if (esq !== null) return esq;
      if (typeof xCursor === 'number') return xCursor;
      const cs = win.getComputedStyle(bloco), br = bloco.getBoundingClientRect();
      return br.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0) + Math.max(0, parseFloat(cs.textIndent) || 0);
    } catch (_) { return null; }
  }
  function linhaTextarea(el) { // espelho invisível com o texto até o cursor, para achar a altura da linha
    const doc = el.ownerDocument, win = doc.defaultView, cs = win.getComputedStyle(el), m = doc.createElement('div');
    ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize'].forEach((p) => { m.style[p] = cs[p]; });
    m.style.borderStyle = 'solid'; m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.whiteSpace = 'pre-wrap'; m.style.overflowWrap = 'break-word'; m.style.top = '0'; m.style.left = '-9999px'; m.style.height = 'auto';
    m.textContent = String(el.value || '').slice(0, el.selectionStart || 0);
    const s = doc.createElement('span'); s.textContent = '\u200b'; m.appendChild(s);
    (doc.body || doc.documentElement).appendChild(m);
    const topo = s.offsetTop; m.remove();
    const r = el.getBoundingClientRect(); const lh = alturaDeLinha(el, win);
    return { top: r.top + el.clientTop + topo - el.scrollTop, height: lh };
  }
  function geometria(a) {
    try {
      if (!a.el.isConnected) return null;
      let campo, linha;
      if (a.tipo === 'rico') {
        const base = a.quadro ? a.quadro.getBoundingClientRect() : a.raiz.getBoundingClientRect();
        const ox = a.quadro ? a.qx : a.dx, oy = a.quadro ? a.qy : a.dy;
        campo = { left: base.left + ox, top: base.top + oy, right: base.right + ox, bottom: base.bottom + oy };
        const l = linhaRica(a); linha = { top: l.top + a.dy, height: l.height };
        if (typeof l.left === 'number') linha.left = l.left + a.dx; // começo do texto da linha, em coordenadas da tela
      } else {
        const r = a.el.getBoundingClientRect();
        campo = { left: r.left + a.dx, top: r.top + a.dy, right: r.right + a.dx, bottom: r.bottom + a.dy };
        if (a.tipo === 'textarea') { const l = linhaTextarea(a.el); linha = { top: l.top + a.dy, height: l.height }; }
        else linha = { top: campo.top, height: campo.bottom - campo.top };
      }
      if (campo.right - campo.left < 40 || campo.bottom - campo.top < 12) return null; // campo minúsculo ou invisível
      return { campo, linha };
    } catch (_) { return null; }
  }

  // ---------- ícone ----------
  const icone = criar('button', 'position:fixed;z-index:2147483646;width:' + TAM + 'px;height:' + TAM + 'px;padding:0;margin:0;border:none;border-radius:6px;background:transparent;cursor:pointer;display:none;align-items:center;justify-content:center;opacity:.5;filter:grayscale(1);transition:opacity .12s,filter .12s;outline:none;box-shadow:none;min-width:0;min-height:0');
  icone.id = cfg.iconeId; icone.type = 'button'; icone.tabIndex = -1;
  icone.setAttribute('aria-label', 'Abrir o Copilot para este texto'); icone.title = 'Abrir o Copilot';
  icone.appendChild(glifo(20));
  const realce = (on) => { icone.style.opacity = on ? '1' : '.5'; icone.style.filter = on ? 'none' : 'grayscale(1)'; };
  icone.addEventListener('mouseenter', () => realce(true));
  icone.addEventListener('mouseleave', () => { if (!painel) realce(false); });
  icone.addEventListener('mousedown', (e) => { e.preventDefault(); }); // não tira o foco nem a seleção do campo
  icone.addEventListener('click', (e) => { if (!e.isTrusted) return; e.preventDefault(); e.stopPropagation(); if (painel) fecharPainel(true); else abrirMenu(); });

  function reposicionar() {
    if (!alvo) { icone.style.display = 'none'; return; }
    const g = geometria(alvo);
    if (!g) { if (!painel) icone.style.display = 'none'; return; }
    const p = aj.posicaoIcone({ campo: g.campo, linha: g.linha, tela: { largura: innerWidth, altura: innerHeight }, tam: TAM });
    if (!p.visivel && !painel) { icone.style.display = 'none'; return; }
    icone.style.display = 'flex'; icone.style.left = p.x + 'px'; icone.style.top = p.y + 'px';
    if (painel) posicionarPainel();
  }
  function atualizar() {
    if (painel) { reposicionar(); return; } // com o painel aberto o alvo fica congelado
    const a = lerAlvo();
    if (a === 'nosso') return;
    alvo = a;
    reposicionar();
  }
  let quadroAnim = 0;
  const agendar = () => { if (morto || quadroAnim) return; quadroAnim = requestAnimationFrame(() => { quadroAnim = 0; atualizar(); }); };
  const vigiados = new WeakSet();
  function vigiar(doc) { // o mesmo conjunto de ouvintes no documento da página e nos de iframes de mesma origem
    if (!doc || vigiados.has(doc)) return; vigiados.add(doc);
    const win = doc.defaultView;
    ['selectionchange', 'focusin', 'focusout', 'input', 'keyup', 'mouseup'].forEach((t) => doc.addEventListener(t, agendar, true));
    doc.addEventListener('scroll', agendar, true);
    doc.addEventListener('pointerdown', aoApontarFora, true);
    (win || doc).addEventListener('keydown', aoTecla, true); (win || doc).addEventListener('keyup', aoSoltarTecla, true);
    if (win) { win.addEventListener('resize', agendar); win.addEventListener('blur', agendar); win.addEventListener('focus', agendar); }
  }
  // Teclado com o painel aberto, onde quer que o foco esteja (campo da página, iframe do editor ou o próprio painel):
  // Esc fecha/rejeita. Na proposta: Enter aceita, Ctrl+Enter insere abaixo, Ctrl+C copia a proposta.
  // Só teclas reais, fora de composição (IME), sem Alt/Shift/Meta.
  function aoTecla(e) {
    if (!painel || !e.isTrusted || e.isComposing || e.altKey || e.metaKey || e.shiftKey) return;
    const engolir = () => { e.preventDefault(); e.stopImmediatePropagation(); teclaEngolida = e.key; };
    if (e.key === 'Escape') { if (e.ctrlKey) return; engolir(); fecharPainel(true); return; }
    if (estado !== 'proposta' || !acoesProposta) return;
    if (e.key === 'Enter') {
      if (e.ctrlKey) { if (acoesProposta.abaixo) { engolir(); acoesProposta.abaixo(); } return; }
      if (painel.contains(e.target) && /^button$/i.test(e.target.tagName || '')) return; // botão do painel em foco: o Enter é dele
      engolir(); acoesProposta.aceitar(); return;
    }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      let sel = null; try { sel = D.getSelection(); } catch (_) { sel = null; }
      if (sel && !sel.isCollapsed && painel.contains(sel.anchorNode)) return; // trecho marcado dentro da proposta: cópia normal do navegador
      engolir(); acoesProposta.copiar();
    }
  }
  function aoSoltarTecla(e) {
    if (!teclaEngolida || e.key !== teclaEngolida) return;
    teclaEngolida = ''; if (e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function aoApontarFora(e) {
    if (!painel || !e.isTrusted) return;
    if (painel.contains(e.target) || icone.contains(e.target)) return;
    if (estado === 'menu' || estado === 'novo' || estado === 'aviso') fecharPainel(false); // espera e proposta só fecham pelos botões
  }

  // ---------- captura do texto e aplicação ----------
  function blocoDoCursor(no, a) {
    const win = a.doc.defaultView; let n = no && no.nodeType === 1 ? no : (no ? no.parentNode : null);
    while (n && n !== a.raiz && n.nodeType === 1) { if (/^(block|list-item|table-cell|flex|grid)$/.test(win.getComputedStyle(n).display)) return n; n = n.parentNode; }
    return a.raiz;
  }
  function capturar(a) {
    try {
      if (a.tipo === 'input' || a.tipo === 'textarea') {
        const v = String(a.el.value || ''); let s = a.el.selectionStart || 0, e = a.el.selectionEnd || 0, modo = 'selecao';
        if (s === e || !v.slice(s, e).trim()) { if (v.trim()) { s = 0; e = v.length; modo = 'campo'; } else { modo = 'cursor'; e = s; } }
        return { modo, trecho: v.slice(s, e), antes: v.slice(Math.max(0, s - LIM_VIZ), s), depois: v.slice(e, e + LIM_VIZ), ap: { tipo: 'valor', el: a.el, s, e, valor: v } };
      }
      const win = a.doc.defaultView, sel = win.getSelection();
      if (!sel || !sel.rangeCount || !a.raiz.contains(sel.getRangeAt(0).startContainer)) return null;
      let r = sel.getRangeAt(0).cloneRange(), modo = 'selecao', trecho = sel.toString();
      if (r.collapsed || !trecho.trim()) {
        const bloco = blocoDoCursor(r.startContainer, a); const rb = a.doc.createRange(); rb.selectNodeContents(bloco);
        if (rb.toString().trim()) { r = rb; modo = bloco === a.raiz ? 'campo' : 'paragrafo'; trecho = bloco === a.raiz ? (a.raiz.innerText || rb.toString()) : (bloco.innerText || rb.toString()); }
        else { r.collapse(true); modo = 'cursor'; trecho = ''; }
      }
      const ra = a.doc.createRange(); ra.selectNodeContents(a.raiz); ra.setEnd(r.startContainer, r.startOffset);
      const rd = a.doc.createRange(); rd.selectNodeContents(a.raiz); rd.setStart(r.endContainer, r.endOffset);
      return { modo, trecho, antes: ra.toString().slice(-LIM_VIZ), depois: rd.toString().slice(0, LIM_VIZ), ap: { tipo: 'faixa', doc: a.doc, raiz: a.raiz, faixa: r, bruto: r.toString() } };
    } catch (_) { return null; }
  }
  const MUDOU = 'O texto do campo mudou depois do pedido. Copie a proposta e cole onde quiser.';
  // modo: 'substituir' | 'abaixo'. Devolve '' se aplicou, ou a mensagem do motivo. Usa o comando de inserção do navegador: Ctrl+Z desfaz.
  function aplicar(ap, novo, modo) {
    try {
      if (ap.tipo === 'valor') {
        const el = ap.el; if (!el.isConnected) return 'O campo não existe mais.';
        if (String(el.value || '') !== ap.valor) return MUDOU;
        const umaLinha = el.tagName !== 'TEXTAREA'; let txt = umaLinha ? novo.replace(/\s*\n+\s*/g, ' ') : novo; let s = ap.s, e = ap.e;
        if (modo === 'abaixo') { s = e; txt = (umaLinha ? ' ' : '\n') + txt; }
        el.focus(); el.setSelectionRange(s, e);
        let ok = false; try { ok = el.ownerDocument.execCommand('insertText', false, txt); } catch (_) { ok = false; }
        if (!ok) { el.setRangeText(txt, s, e, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
        return '';
      }
      if (!ap.raiz.isConnected) return 'O editor não existe mais.';
      let atual = null; try { atual = ap.faixa.toString(); } catch (_) { atual = null; }
      if (atual !== ap.bruto) return MUDOU;
      const win = ap.doc.defaultView; try { win.focus(); } catch (_) {} try { ap.raiz.focus(); } catch (_) {}
      const sel = win.getSelection(); const r = ap.faixa.cloneRange(); if (modo === 'abaixo') r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
      // CKEditor 4 (editor de minutas) tem pilha própria de desfazer e só registra o que acontece entre teclas. Um par de teclas
      // sintéticas neutras (End: não escreve nada) em volta da inserção faz o editor guardar o estado anterior e avisar a página
      // da mudança (evento 'change' dele): assim o Ctrl+Z do editor desfaz a inserção. Só DOM, sem tocar nos globais da página.
      let ck = false; try { ck = !!(ap.raiz.classList && ap.raiz.classList.contains('cke_editable')); } catch (_) { ck = false; }
      const teclaNeutra = (tipo) => { try { ap.raiz.dispatchEvent(new KeyboardEvent(tipo, { key: 'End', code: 'End', keyCode: 35, which: 35, bubbles: true, cancelable: true })); } catch (_) {} };
      if (ck) teclaNeutra('keydown');
      let ok = false; try { ok = ap.doc.execCommand('insertText', false, modo === 'abaixo' ? '\n' + novo : novo); } catch (_) { ok = false; }
      if (ck) teclaNeutra('keyup');
      return ok ? '' : 'O editor recusou a inserção. Copie a proposta e cole onde quiser.';
    } catch (_) { return 'Não consegui escrever no campo. Copie a proposta e cole onde quiser.'; }
  }
  function devolverFoco() {
    try {
      if (!captura) return;
      const ap = captura.ap;
      if (ap.tipo === 'valor') { if (ap.el.isConnected) ap.el.focus(); }
      else { try { ap.doc.defaultView.focus(); } catch (_) {} if (ap.raiz.isConnected && ap.raiz.focus) ap.raiz.focus(); }
    } catch (_) {}
  }

  // ---------- painel (menu, espera, proposta, aviso) ----------
  const BOTAO = BASE + 'padding:6px 12px;border:1px solid #d0d7de;background:#f6f8fa;border-radius:6px;cursor:pointer;min-width:0;min-height:0;';
  const BOTAO_FORTE = BASE + 'padding:6px 12px;border:1px solid #0969da;background:#0969da;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;min-width:0;min-height:0;';
  const CAMPO = BASE + 'width:100%;border:1px solid #d0d7de;border-radius:6px;padding:6px 8px;background:#fff;outline:none;';
  const confiavel = (fn) => (e) => { if (!e.isTrusted) return; fn(e); };
  function novoPainel(largura) {
    if (painel) painel.remove();
    acoesProposta = null;
    painel = criar('div', BASE + 'position:fixed;z-index:2147483647;width:' + largura + 'px;max-width:92vw;background:#fff;border:1px solid #d0d7de;border-radius:12px;box-shadow:none;overflow:hidden');
    painel.id = cfg.menuId; painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-label', 'Copilot: alterar o texto');
    ['keydown', 'keyup', 'keypress'].forEach((t) => painel.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape' && e.isTrusted) { e.preventDefault(); fecharPainel(true); } }));
    D.documentElement.appendChild(painel); realce(true);
    return painel;
  }
  function posicionarPainel() {
    if (!painel) return;
    const r = icone.getBoundingClientRect(); const pw = painel.offsetWidth || 300, ph = painel.offsetHeight || 200;
    let left = r.left; if (left + pw > innerWidth - 8) left = Math.max(8, innerWidth - pw - 8);
    let top = r.bottom + 4; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    painel.style.left = Math.round(Math.max(8, left)) + 'px'; painel.style.top = Math.round(top) + 'px';
  }
  function fecharPainel(comFoco) {
    if (pendente) { enviar('cancelar', { pedido: pendente.id }); pendente = null; }
    if (painel) { painel.remove(); painel = null; }
    estado = ''; acoesProposta = null; realce(false);
    if (comFoco) devolverFoco();
    captura = null; agendar();
  }
  const ROTULO_MODO = { selecao: 'o trecho selecionado', paragrafo: 'o parágrafo do cursor', campo: 'o texto inteiro do campo', cursor: 'campo vazio — o texto será inserido no cursor' };

  function abrirMenu() {
    if (!alvo) return;
    const c = capturar(alvo);
    if (!c) return;
    if (c.trecho.length > LIM_TRECHO) { captura = c; mostrarAviso('O trecho tem ' + c.trecho.length + ' caracteres; o limite é ' + LIM_TRECHO + '. Selecione uma parte menor.'); return; }
    captura = c; desenharMenu();
  }
  function desenharMenu() {
    estado = 'menu'; const p = novoPainel(300); const vazio = captura.modo === 'cursor';
    const topo = criar('div', BASE + 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #eaeef2');
    topo.appendChild(glifo(18));
    const campo = criar('input', BASE + 'flex:1;min-width:0;border:none;outline:none;background:transparent;padding:4px 0;box-shadow:none');
    campo.type = 'text'; campo.placeholder = vazio ? 'O que você deseja redigir?' : 'O que você deseja alterar?'; campo.maxLength = 2000; campo.setAttribute('aria-label', campo.placeholder);
    const seta = criar('button', BASE + 'flex:none;width:26px;height:26px;padding:0;border:1px solid #d0d7de;border-radius:50%;background:#fff;cursor:pointer;line-height:1;text-align:center;color:#57606a', '➔');
    seta.type = 'button'; seta.title = 'Enviar ao Copilot';
    const mandarLivre = () => { const v = campo.value.trim(); if (v) pedir(v, v.length > 48 ? v.slice(0, 47) + '…' : v); else campo.focus(); };
    campo.addEventListener('keydown', (e) => { if (e.isTrusted && e.key === 'Enter') { e.preventDefault(); mandarLivre(); } });
    seta.addEventListener('click', confiavel(mandarLivre));
    topo.appendChild(campo); topo.appendChild(seta); p.appendChild(topo);
    p.appendChild(criar('div', BASE + 'font-size:11px;color:#656d76;padding:6px 12px 2px', 'Sobre: ' + ROTULO_MODO[captura.modo] + (captura.trecho ? ' (' + captura.trecho.length + ' caracteres)' : '')));
    const lista = criar('div', BASE + 'max-height:236px;overflow-y:auto;padding:4px 0' + (vazio ? ';opacity:.45' : ''));
    prompts.forEach((pr) => {
      const linha = criar('div', BASE + 'display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:' + (vazio ? 'default' : 'pointer'));
      linha.setAttribute('role', 'button'); linha.tabIndex = vazio ? -1 : 0; linha.title = pr.instrucao;
      const t = criar('span', BASE + 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', pr.titulo);
      linha.appendChild(t);
      if (!vazio) {
        linha.addEventListener('mouseenter', () => { linha.style.background = '#f3f4f6'; });
        linha.addEventListener('mouseleave', () => { linha.style.background = 'transparent'; });
        linha.addEventListener('click', confiavel(() => pedir(pr.instrucao, pr.titulo)));
        linha.addEventListener('keydown', (e) => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pedir(pr.instrucao, pr.titulo); } });
      }
      if (!pr.fixo) {
        const x = criar('button', BASE + 'flex:none;border:none;background:transparent;cursor:pointer;color:#8c959f;padding:0 4px;font-size:12px', '✕');
        x.type = 'button'; x.title = 'Remover este prompt';
        x.addEventListener('click', (e) => { if (!e.isTrusted) return; e.stopPropagation(); enviar('removerPrompt', { prompt: pr.id }); });
        linha.appendChild(x);
      }
      lista.appendChild(linha);
    });
    p.appendChild(lista);
    const rodape = criar('div', BASE + 'border-top:1px solid #eaeef2;padding:7px 12px;cursor:pointer;color:#0969da', '+ Adicionar prompt');
    rodape.setAttribute('role', 'button'); rodape.tabIndex = 0;
    rodape.addEventListener('click', confiavel(desenharNovoPrompt));
    rodape.addEventListener('keydown', (e) => { if (e.isTrusted && e.key === 'Enter') { e.preventDefault(); desenharNovoPrompt(); } });
    p.appendChild(rodape);
    posicionarPainel(); setTimeout(() => { try { campo.focus(); } catch (_) {} }, 0);
  }
  function desenharNovoPrompt() {
    estado = 'novo'; const p = novoPainel(300);
    const corpo = criar('div', BASE + 'padding:10px 12px;display:flex;flex-direction:column;gap:8px');
    corpo.appendChild(criar('div', BASE + 'font-weight:600', 'Novo prompt'));
    const titulo = criar('input', CAMPO); titulo.type = 'text'; titulo.placeholder = 'Nome que aparece no menu'; titulo.maxLength = 60;
    const instr = criar('textarea', CAMPO + 'resize:vertical;min-height:70px'); instr.placeholder = 'Instrução ao Copilot (ex.: Reescreva o texto selecionado em linguagem simples)'; instr.maxLength = 2000; instr.rows = 4;
    const aviso = criar('div', BASE + 'font-size:11px;color:#cf222e;min-height:14px');
    const botoes = criar('div', BASE + 'display:flex;gap:8px;justify-content:flex-end');
    const voltar = criar('button', BOTAO, 'Voltar'); voltar.type = 'button';
    const salvar = criar('button', BOTAO_FORTE, 'Salvar'); salvar.type = 'button';
    voltar.addEventListener('click', confiavel(desenharMenu));
    salvar.addEventListener('click', confiavel(() => {
      const t = titulo.value.trim(), i = instr.value.trim();
      if (!t || !i) { aviso.textContent = 'Preencha o nome e a instrução.'; return; }
      enviar('salvarPrompt', { titulo: t, instrucao: i }); desenharMenu();
    }));
    botoes.appendChild(voltar); botoes.appendChild(salvar);
    [titulo, instr, aviso, botoes].forEach((e) => corpo.appendChild(e)); p.appendChild(corpo);
    posicionarPainel(); setTimeout(() => { try { titulo.focus(); } catch (_) {} }, 0);
  }
  function cabecalho(p, texto) {
    const c = criar('div', BASE + 'display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #eaeef2;font-weight:600');
    c.appendChild(glifo(18)); c.appendChild(criar('span', BASE + 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600', texto)); p.appendChild(c);
  }
  function pedir(instrucao, titulo) {
    if (!captura || pendente) return;
    const id = enviar('pedir', { instrucao: String(instrucao).slice(0, 2000), trecho: captura.trecho, antes: captura.antes, depois: captura.depois, modo: captura.modo });
    pendente = { id, titulo };
    estado = 'espera'; const p = novoPainel(300); cabecalho(p, titulo);
    const corpo = criar('div', BASE + 'padding:12px;display:flex;flex-direction:column;gap:10px');
    corpo.appendChild(criar('div', BASE + 'color:#57606a', 'Enviado à coluna do Copilot. Aguardando a resposta…'));
    const linha = criar('div', BASE + 'display:flex;justify-content:flex-end');
    const cancelar = criar('button', BOTAO, 'Cancelar'); cancelar.type = 'button';
    cancelar.addEventListener('click', confiavel(() => fecharPainel(true)));
    linha.appendChild(cancelar); corpo.appendChild(linha); p.appendChild(corpo); posicionarPainel();
  }
  function mostrarAviso(texto) {
    estado = 'aviso'; const p = novoPainel(300); cabecalho(p, 'Copilot');
    const corpo = criar('div', BASE + 'padding:12px;display:flex;flex-direction:column;gap:10px');
    corpo.appendChild(criar('div', BASE + 'color:#24292f;white-space:pre-wrap', texto));
    const linha = criar('div', BASE + 'display:flex;justify-content:flex-end');
    const ok = criar('button', BOTAO, 'Fechar'); ok.type = 'button'; ok.addEventListener('click', confiavel(() => fecharPainel(true)));
    linha.appendChild(ok); corpo.appendChild(linha); p.appendChild(corpo); posicionarPainel();
  }
  function mostrarProposta(texto, titulo) {
    // 540 px: os quatro botões cabem numa linha só quando há "Inserir abaixo"
    estado = 'proposta'; const p = novoPainel(captura.trecho ? 540 : 400); cabecalho(p, 'Proposta do Copilot — ' + titulo);
    const corpo = criar('div', BASE + 'padding:10px 12px;display:flex;flex-direction:column;gap:8px');
    const caixaTexto = criar('div', BASE + 'max-height:240px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #d0d7de;border-radius:6px;padding:8px;background:#f6f8fa;user-select:text', texto);
    const aviso = criar('div', BASE + 'font-size:11px;color:#57606a;min-height:14px', captura.trecho ? 'Nada foi alterado ainda. Depois de aceitar, Ctrl+Z desfaz.' : 'Nada foi inserido ainda. Depois de aceitar, Ctrl+Z desfaz.');
    const botoes = criar('div', BASE + 'display:flex;gap:6px;align-items:center;flex-wrap:wrap');
    const executar = (modo) => {
      if (!painel || estado !== 'proposta' || !captura) return;
      const erro = aplicar(captura.ap, texto, modo);
      if (erro) { aviso.style.color = '#cf222e'; aviso.textContent = erro; return; }
      painel.remove(); painel = null; estado = ''; acoesProposta = null; captura = null; realce(false); agendar();
    };
    // Tecla desenhada ao lado do rótulo ("esc" em letra miúda, "↵" como caractere): herda a cor do botão.
    const TECLA = 'display:inline-block;margin-left:7px;padding:0 4px;min-width:16px;text-align:center;border:1px solid currentColor;border-radius:4px;font-family:"Segoe UI",system-ui,sans-serif;font-weight:600;line-height:14px;opacity:.8;vertical-align:1px;';
    const MIUDA = 'font-size:9.5px;letter-spacing:.3px;', SIMBOLO = 'font-size:12px;';
    // partes: [[texto, css], ...] dentro da mesma tecla (ex.: "ctrl" miúdo + "↵" como caractere)
    const comTecla = (css, rotulo, partes, descricao) => {
      const b = criar('button', css + 'white-space:nowrap;'); b.type = 'button'; b.appendChild(D.createTextNode(rotulo));
      const k = criar('span', TECLA); k.setAttribute('aria-hidden', 'true');
      partes.forEach((pt) => k.appendChild(criar('span', pt[1], pt[0]))); b.appendChild(k);
      b.setAttribute('aria-label', descricao); b.title = descricao; return b;
    };
    const acoes = {
      aceitar: () => executar('substituir'),
      abaixo: captura.trecho ? () => executar('abaixo') : null,
      copiar: () => { enviar('copiar', { texto }); aviso.style.color = '#1a7f37'; aviso.textContent = 'Copiado.'; }
    };
    acoesProposta = acoes;
    const copiar = comTecla(BOTAO, 'Copiar', [['ctrl+c', MIUDA]], 'Copiar a proposta (Ctrl+C)');
    copiar.addEventListener('click', confiavel(acoes.copiar)); botoes.appendChild(copiar);
    if (acoes.abaixo) {
      const abaixo = comTecla(BOTAO, 'Inserir abaixo', [['ctrl+', MIUDA], ['↵', SIMBOLO]], 'Manter o texto atual e inserir a proposta logo depois dele (Ctrl+Enter)');
      abaixo.addEventListener('click', confiavel(acoes.abaixo)); botoes.appendChild(abaixo);
    }
    const rejeitar = comTecla(BOTAO + 'margin-left:auto;', 'Rejeitar', [['esc', MIUDA]], 'Rejeitar a proposta (Esc)');
    rejeitar.addEventListener('click', confiavel(() => fecharPainel(true)));
    const aceitar = comTecla(BOTAO_FORTE, 'Aceitar', [['↵', SIMBOLO]], captura.trecho ? 'Aceitar: substituir o texto pela proposta (Enter)' : 'Aceitar: inserir a proposta no cursor (Enter)');
    aceitar.addEventListener('click', confiavel(acoes.aceitar));
    botoes.appendChild(rejeitar); botoes.appendChild(aceitar);
    [caixaTexto, aviso, botoes].forEach((e) => corpo.appendChild(e)); p.appendChild(corpo); posicionarPainel();
  }

  // ---------- montar ----------
  D.documentElement.appendChild(icone);
  vigiar(D);
  const relogio = setInterval(() => { // foco dentro de iframe não gera evento no documento de fora: confere de tempos em tempos
    const e = D.activeElement; if (painel || (e && /^(iframe|frame)$/i.test(e.tagName || '')) || (alvo && !alvo.el.isConnected)) agendar();
  }, 500);
  agendar();

  G.__spRedatorLinha = {
    versao: 1,
    coletar(id) { const d = caixa.get(id) || null; caixa.delete(id); return d; },
    prompts(lista) { if (Array.isArray(lista)) { prompts = lista; if (painel && estado === 'menu' && captura) desenharMenu(); } return true; },
    // r: { ok, texto } | { ok, semLeitura } | { ok:false, mensagem }
    resposta(id, r) {
      if (!pendente || pendente.id !== id || !painel) return false;
      const titulo = pendente.titulo; pendente = null;
      if (!r || r.ok !== true) mostrarAviso((r && r.mensagem) || 'O Copilot não concluiu o pedido. Veja a coluna.');
      else if (typeof r.texto === 'string' && r.texto) mostrarProposta(r.texto, titulo);
      else mostrarAviso('Pedido enviado. A resposta está na coluna do Copilot; copie de lá se quiser usá-la.');
      return true;
    },
    estado: () => ({ estado, visivel: icone.style.display !== 'none', x: parseInt(icone.style.left, 10) || 0, y: parseInt(icone.style.top, 10) || 0, alvo: alvo ? alvo.tipo : '' }),
    destruir() { morto = true; clearInterval(relogio); if (painel || pendente) fecharPainel(false); icone.remove(); delete G.__spRedatorLinha; }
  };
  return { ok: true, reinstalado: true };
}

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const scripts = {
  instalar: ({ token, prompts }) => '(function(){var aj={campoSensivel:' + campoSensivel.toString() + ',posicaoIcone:' + posicaoIcone.toString() + '};return(' + noIsoladoLinha.toString() + ')(' +
    json({ iconeId: ICONE_ID, menuId: MENU_ID, sinal: SINAL_LINHA, token: String(token), prompts: prompts || [] }) + ',aj);})()',
  coletar: (id) => '(globalThis.__spRedatorLinha?globalThis.__spRedatorLinha.coletar(' + json(String(id)) + '):null)',
  resposta: (id, r) => '(globalThis.__spRedatorLinha?globalThis.__spRedatorLinha.resposta(' + json(String(id)) + ',' + json(r) + '):false)',
  prompts: (lista) => '(globalThis.__spRedatorLinha?globalThis.__spRedatorLinha.prompts(' + json(lista) + '):false)',
  estado: () => '(globalThis.__spRedatorLinha?globalThis.__spRedatorLinha.estado():null)',
  destruir: () => '(globalThis.__spRedatorLinha&&globalThis.__spRedatorLinha.destruir(),true)'
};

// ---- host ----
// deps: { permitido(url)->bool, noIsolado(wc,codigo)->Promise, ponte: { pedir, cancelar } (redator-coluna), guarda (criarGuardaPrompts),
//         copiar(texto), gerarToken()->string, log }
const MUNDO_REDATOR = 1096; // o mesmo mundo isolado do botão flutuante (redator.js)
function criarRedatorLinha(deps = {}) {
  const { log = () => {} } = deps;
  const permitido = deps.permitido || ((url) => /^https?:\/\//i.test(String(url || '')));
  const noIsolado = deps.noIsolado || ((wc, codigo) => wc.executeJavaScriptInIsolatedWorld(MUNDO_REDATOR, [{ code: codigo }]));
  const ponte = deps.ponte || { pedir: async () => ({ ok: false, motivo: 'COPILOT_INDISPONIVEL' }), cancelar: () => false };
  const guarda = deps.guarda || { listar: () => [...PROMPTS_PADRAO], adicionar: () => null, remover: () => false };
  const copiar = deps.copiar || (() => {});
  const gerarToken = deps.gerarToken || (() => require('node:crypto').randomBytes(18).toString('hex'));
  const tokens = new WeakMap(); // webContents -> token do mundo isolado

  async function injetar(wc) {
    try {
      if (!wc || wc.isDestroyed()) return false;
      let url = ''; try { url = wc.getURL(); } catch (_) {}
      if (!permitido(url)) return false;
      if (!tokens.has(wc)) tokens.set(wc, gerarToken());
      await noIsolado(wc, scripts.instalar({ token: tokens.get(wc), prompts: guarda.listar() }));
      return true;
    } catch (_) { return false; }
  }

  // Tira o ícone da aba (chave desligada ou coluna do Copilot fechada). Um pedido em andamento é cancelado pela própria aba.
  async function retirar(wc) {
    try { if (!wc || wc.isDestroyed()) return false; await noIsolado(wc, scripts.destruir()); return true; } catch (_) { return false; }
  }

  // Trata um aviso de console da aba. Devolve true se era do ícone (com token válido).
  async function aoConsole(wc, mensagem) {
    if (!String(mensagem || '').includes(SINAL_LINHA)) return false;
    const s = parseSinal(mensagem);
    if (!s || !wc || wc.isDestroyed() || tokens.get(wc) !== s.token) return false;
    let d = null;
    try { d = await noIsolado(wc, scripts.coletar(s.id)); } catch (_) { d = null; }
    if (!d || d.op !== s.op) return false;
    try {
      if (s.op === 'pedir') {
        const r = await ponte.pedir({ id: s.id, instrucao: String(d.instrucao || ''), trecho: String(d.trecho || ''), antes: String(d.antes || ''), depois: String(d.depois || '') });
        if (r && r.motivo === 'CANCELADO') return true;
        const resp = r && r.ok === true ? { ok: true, texto: typeof r.texto === 'string' ? r.texto : null } : { ok: false, mensagem: mensagemDoMotivo(r && r.motivo) };
        log('redator', 'pedido ' + (resp.ok ? (resp.texto ? 'respondido' : 'enviado sem leitura') : 'falhou: ' + String(r && r.motivo)));
        await noIsolado(wc, scripts.resposta(s.id, resp)).catch(() => {});
      } else if (s.op === 'cancelar') {
        ponte.cancelar(String(d.pedido || ''));
      } else if (s.op === 'salvarPrompt') {
        guarda.adicionar({ titulo: d.titulo, instrucao: d.instrucao });
        await noIsolado(wc, scripts.prompts(guarda.listar())).catch(() => {});
      } else if (s.op === 'removerPrompt') {
        guarda.remover(String(d.prompt || ''));
        await noIsolado(wc, scripts.prompts(guarda.listar())).catch(() => {});
      } else if (s.op === 'copiar') {
        copiar(String(d.texto || '').slice(0, 100000));
      }
    } catch (e) {
      if (s.op === 'pedir') await noIsolado(wc, scripts.resposta(s.id, { ok: false, mensagem: mensagemDoMotivo('') })).catch(() => {});
    }
    return true;
  }

  return { injetar, retirar, aoConsole, scripts, MUNDO_REDATOR };
}

module.exports = { ICONE_ID, MENU_ID, SINAL_LINHA, PROMPTS_PADRAO, campoSensivel, posicaoIcone, normalizarPrompt, parseSinal, mensagemDoMotivo, criarGuardaPrompts, scripts, criarRedatorLinha, _fn: { noIsoladoLinha } };
