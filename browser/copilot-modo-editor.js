'use strict';
// Copilot no modo editor (host). Camada: host + scripts injetados na página da coluna e na página do editor.
//
// O que faz: liga, na coluna do Copilot, o agente embutido "Editar com o Copilot" (o mesmo que o Outlook web usa nos rascunhos) e
// responde às chamadas que o servidor do Copilot faz ao cliente para ler e reescrever o "rascunho". Aqui o rascunho é a minuta
// aberta no CKEditor da aba: o Copilot recebe a minuta inteira e devolve o texto alterado; só os parágrafos que mudaram são trocados.
//
// Como funciona (achados O22–O26 e O45–O51 em v_base/docs/estudos/copilot-edge-157/captura-outlook/ACHADOS.md, e a sessão de
// 2026-11-23 registrada no log diário):
//  1. O agente entra pela entrada interna da página da coluna, window.__crHostContextualHandInAppStore__.execute(store, dados), com
//     dados.atMentionApp = OutlookDraftsChatSteeringAgent. O pedido de chat passa a sair com gpts = esse agente.
//  2. Com esse agente, o servidor manda ao cliente "invoke_local_plugin" para o endpoint
//     MicrosoftOutlook.Client.CoPilot/FluxOutlookDraftAssistantPlugin, com JSON-RPC 2.0: get_draft, rewrite_draft, rewrite_selection.
//  3. A página da coluna despacha essas chamadas pelo conjunto global __1jsLocalPluginsV4 ({key, handler}). Registramos ali um
//     handler para aquele endpoint. Ele não fala com o host por rede: avisa por console.debug (prefixo + segredo + id) e o host
//     busca o pedido e entrega a resposta com executeJavaScript. O conteúdo da minuta nunca passa pelo console.
//  4. get_draft devolve {body (Markdown, um bloco por parágrafo), id, subject, hasSignature}; rewrite_draft traz {id, body}.
//     O id vale só para a leitura anterior ("Editor ID mismatch" se não conferir), como no Outlook.
//
// Limites: tudo isto usa nomes INTERNOS da Microsoft, que podem mudar sem aviso. Se a entrada ou o registro não existirem, o
// recurso simplesmente não age (o chat normal continua). Parágrafos trocados mantêm negrito, itálico e sublinhado; outras
// formatações internas daquele parágrafo se perdem. Parágrafos não alterados ficam intactos. Ctrl+Z no editor desfaz tudo de uma vez.

const crypto = require('node:crypto');

const ENDPOINT = 'MicrosoftOutlook.Client.CoPilot/FluxOutlookDraftAssistantPlugin';
const PREFIXO = '\u2063SP-ED:'; // sinal no console da coluna (só o id do pedido; nunca conteúdo)
const AGENTE = Object.freeze({ appId: 'OutlookDraftsChatSteeringAgent', appType: 'BuiltInAgent', title: 'Editar com o Copilot', gptIdentifier: Object.freeze({ id: 'OutlookDraftsChatSteeringAgent', source: 'BuiltInAgents', version: '3.0.0' }) });
const CALLER = Object.freeze({ scope: 'Email', entryPoint: 'Email', productEntryPoint: 'Email' });
const ATALHO_PADRAO = Object.freeze({ code: 'KeyE', ctrl: true, alt: false, shift: true, meta: false });
const TETO_BYTES = 28000;      // folga sob o limite de mensagem do canal do chat (25,6 KB passaram no teste; o limite real não é conhecido)
const ORCAMENTO_INICIAL = 24500; // caracteres de Markdown na primeira tentativa de leitura
const PRAZO_MS = 25000;

// Pedido "com cara de edição": começa por um verbo de edição, com ou sem aberturas antes. As duas listas abaixo podem ser ampliadas.
// Palavras que podem vir ANTES do verbo ("tente", "quero que você", "no texto,"...). Sozinhas não disparam nada.
const ABERTURAS = [
  'por favor', 'por gentileza', 'pf', 'favor', 'agora', 'ok', 'certo', 'beleza', 'então', 'entao', 'e', 'mas',
  'aí', 'ai', 'também', 'tambem', 'ainda', 'só', 'so', 'apenas', 'tente', 'tenta', 'tentar', 'pode',
  'poderia', 'consegue', 'conseguiria', 'dá para', 'da para', 'dá pra', 'da pra', 'tem como', 'vamos', 'bora', 'quero que', 'quero',
  'queria que', 'queria', 'gostaria que', 'gostaria de', 'preciso que', 'preciso', 'me ajude a', 'me ajuda a', 'ajude a', 'ajuda a', 'você', 'voce',
  'vc', 'copilot', 'no texto', 'na minuta', 'no rascunho', 'no documento', 'nesse texto', 'neste texto', 'nessa minuta', 'nesta minuta'
];
// Radicais dos verbos de edição: "reduz" casa com reduza, reduzir, reduzam. Para acrescentar um verbo, ponha o radical aqui.
const RADICAIS = [
  'reescrev', 'redij', 'redig', 'reformul', 'refaz', 'refaç', 'refac', 'parafras', 'escrev', 'elabor', 'alter', 'modific',
  'mud', 'troqu', 'troc', 'substitu', 'corrij', 'corrig', 'consert', 'arrum', 'edit', 'emend', 'retific', 'ajust',
  'adapt', 'adequ', 'revis', 'atualiz', 'acrescent', 'adicion', 'inclu', 'insir', 'inser', 'complement', 'complet', 'continu',
  'conclu', 'finaliz', 'preench', 'remov', 'retir', 'apag', 'exclu', 'suprim', 'delet', 'elimin', 'cort', 'tir',
  'enxug', 'limp', 'resum', 'sintetiz', 'condens', 'encurt', 'reduz', 'diminu', 'abrevi', 'compact', 'ampli', 'expand',
  'aument', 'along', 'desenvolv', 'aprofund', 'formaliz', 'melhor', 'aprimor', 'aperfeiço', 'aperfeico', 'lapid', 'refin', 'simplific',
  'clarific', 'padroniz', 'uniformiz', 'format', 'destac', 'negrit', 'sublinh', 'traduz', 'coloqu', 'coloc', 'ponh', 'deix',
  'torn', 'transform', 'convert', 'reorganiz', 'reorden', 'reestrutur', 'organiz', 'orden', 'renumer', 'enumer', 'junt', 'unifi',
  'unir', 'mescl', 'divid', 'separ', 'quebr', 'mov', 'desloc', 'transfir', 'transfer', 'desfaç', 'desfac', 'desfaz',
  'revert', 'restaur'
];
const FONTE_INTENCAO = '^(?:\\s*(?:' + ABERTURAS.map((a) => a.replace(/ +/g, '\\s+')).join('|') + ')[,:\\s]+)*\\s*(' + RADICAIS.join('|') + ')[a-zà-ÿ]*(?![a-zà-ÿ])';
const ehPedidoDeEdicao = (texto) => new RegExp(FONTE_INTENCAO, 'i').test(String(texto == null ? '' : texto));

// ───────────────────────── Página da COLUNA (mundo principal) ─────────────────────────
// cfg: { endpoint, prefixo, segredo, agente, caller, automatico, fonteIntencao, prazoMs }
function naColuna(cfg) {
  const antigo = globalThis.__spEd;
  if (antigo && antigo.versao === 1) { antigo.configurar(cfg); return { ok: true, reinstalado: false }; }
  if (antigo) { try { antigo.destruir(); } catch (_) {} }
  let conf = cfg;
  const avisar = console.debug.bind(console);
  const pend = new Map(); // id -> { pedido, resolver }
  const conjunto = (globalThis.__1jsLocalPluginsV4 = globalThis.__1jsLocalPluginsV4 || new Set());

  // Handler do plugin local: só atende o endpoint do assistente de rascunho; o resto segue para os outros handlers.
  const item = { key: conf.endpoint, handler: async (e) => {
    if (!e || !e.invocation || e.invocation.local_endpoint !== conf.endpoint) return { isHandled: false };
    let rpc; try { rpc = JSON.parse(e.invocation.payload); } catch (_) { return { isHandled: false }; }
    if (!rpc || typeof rpc.method !== 'string') return { isHandled: false };
    const id = 'p' + Math.random().toString(36).slice(2, 12);
    const res = await new Promise((ok) => {
      pend.set(id, { pedido: { method: rpc.method, params: rpc.params || {} }, resolver: ok });
      setTimeout(() => { if (pend.delete(id)) ok({ erro: 'Tempo esgotado ao acessar o editor.' }); }, conf.prazoMs);
      avisar(conf.prefixo + conf.segredo + ':' + id);
    });
    const embrulho = (status, payload, msg) => ({ isHandled: true, response: { schema_version: 'v1', correlation_id: e.correlation_id, response: { payload, status, message: msg || '' } } });
    if (!res || res.erro) return embrulho('error', '', (res && res.erro) || 'Falha ao acessar o editor.');
    return embrulho('success', JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: [{ type: 'text/plain;charset=utf-8;content-language=EN-US', id: '', description_for_model: 'outlookMailComposeChatSteeringPlugin', data: res.data, url: '' }] }));
  } };
  conjunto.add(item);
  try { if (typeof conjunto.onChange === 'function') conjunto.onChange(); } catch (_) {}

  // Modo edição (chip do agente no campo de mensagem).
  const campo = () => document.querySelector('#m365-chat-editor-target-element');
  const botaoChip = () => [...document.querySelectorAll('button')].find((b) => /^Remove Editar com o Copilot/i.test(b.getAttribute('aria-label') || ''));
  const temChip = () => !!botaoChip();
  const texto = () => ((campo() && campo().innerText) || '').replace(/\u00a0/g, ' ').trim();
  const emConversa = () => /\/conversation\//.test(location.pathname);
  const empurrar = async (dados) => {
    const h = window.__crHostContextualHandInAppStore__;
    if (!h || typeof h.execute !== 'function' || !h.store) return false;
    await h.execute(h.store, { atMentionApp: conf.agente, callerInfo: conf.caller, queryAnnotations: [], ...dados });
    return true;
  };
  // Liga sem enviar; devolve o próprio texto digitado porque o empurrão substitui o conteúdo do campo.
  const ligar = () => empurrar({ promptText: texto(), isDraft: true, isNewChat: false });
  const desligar = () => { const b = botaoChip(); if (b) b.click(); return !!b; };
  const alternar = async () => { if (temChip()) { desligar(); return 'desligado'; } return (await ligar()) ? 'ligado' : 'indisponivel'; };

  // Automático: pedido de edição enviado sem o chip sai já com o agente, na mesma conversa.
  let enviando = false;
  const interceptar = (ev) => {
    if (!conf.automatico || enviando || temChip()) return false;
    const t = texto();
    if (!t || !new RegExp(conf.fonteIntencao, 'i').test(t)) return false;
    if (!window.__crHostContextualHandInAppStore__) return false;
    ev.preventDefault(); ev.stopImmediatePropagation();
    enviando = true;
    empurrar({ promptText: t, isDraft: false, isNewChat: !emConversa() }).catch(() => {}).finally(() => { enviando = false; });
    return true;
  };
  const aoTecla = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.isComposing && campo() && campo().contains(ev.target)) interceptar(ev); };
  const aoClique = (ev) => { const b = ev.target && ev.target.closest && ev.target.closest('button'); if (b && /^(Enviar|Send)$/i.test((b.getAttribute('aria-label') || '').trim())) interceptar(ev); };
  addEventListener('keydown', aoTecla, true);
  addEventListener('click', aoClique, true);

  globalThis.__spEd = {
    versao: 1,
    configurar(novo) { conf = novo; },
    pegar(id, segredo) { const p = pend.get(id); return p && segredo === conf.segredo ? p.pedido : null; },
    responder(id, segredo, resposta) { const p = pend.get(id); if (!p || segredo !== conf.segredo) return false; pend.delete(id); p.resolver(resposta); return true; },
    alternar, ligar, desligar, temChip,
    destruir() {
      removeEventListener('keydown', aoTecla, true); removeEventListener('click', aoClique, true);
      conjunto.delete(item); try { if (typeof conjunto.onChange === 'function') conjunto.onChange(); } catch (_) {}
      for (const p of pend.values()) p.resolver({ erro: 'Recurso desligado.' }); pend.clear();
      delete globalThis.__spEd;
    }
  };
  return { ok: true, reinstalado: true };
}

// ───────────────────────── Página do EDITOR (mundo principal da aba) ─────────────────────────
// Instala globalThis.__spMinuta: ler({orcamento}), aplicar(id, md, modo), substituirSelecao(id, md). CKEditor 4.
function naMinuta() {
  if (globalThis.__spMinuta && globalThis.__spMinuta.versao === 1) return 'ja';
  const NBSP = /\u00a0/g;
  const MARCA_CURSOR = '<!-- cursor: o usuário está com o cursor no parágrafo abaixo -->';
  const editor = () => (typeof CKEDITOR === 'undefined' ? null : Object.values(CKEDITOR.instances).find((e) => !e.readOnly && e.mode === 'wysiwyg' && e.status === 'ready'));

  const envolver = (marca, x) => { const m = x.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + marca + m[2] + marca + m[3] : x; };
  const inline = (n) => {
    let s = '';
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { s += c.nodeValue.replace(NBSP, ' '); continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName.toLowerCase();
      if (t === 'br') { if (c.getAttribute('type') !== '_moz') s += '\n'; }
      else if (t === 'img') s += '[[imagem]]';
      else if (t === 'strong' || t === 'b') s += envolver('**', inline(c));
      else if (t === 'em' || t === 'i') s += envolver('*', inline(c));
      else if (t === 'u') { const x = inline(c); const m = x.match(/^(\s*)([\s\S]*?)(\s*)$/); s += m[2] ? m[1] + '<u>' + m[2] + '</u>' + m[3] : x; }
      else s += inline(c);
    }
    return s;
  };
  const limpar = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '').trim();
  const norm = (s) => s.replace(/\[\[imagem\]\]/g, '').replace(/\*\*|\*|<\/?u>|\\/g, '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Markdown devolvido -> HTML do parágrafo. Tudo é escapado; só negrito, itálico, sublinhado e quebra de linha viram marcação.
  const paraHtml = (md) => esc(md.replace(/\[\[imagem\]\]/g, '')).replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/ *\n */g, '<br>').replace(/^(<br>)+|(<br>)+$/g, '');

  function ler(opcoes) {
    const orcamento = (opcoes && opcoes.orcamento) || 24500;
    const ed = editor(); if (!ed) return { erro: 'Nenhum editor de texto editável está aberto na aba.' };
    const corpo = ed.document.getBody().$;
    const filhos = [...corpo.children];
    const todos = filhos.map((el, pos) => { const md = limpar(inline(el)); return { el, pos, md, vazio: !md, protegido: !!el.querySelector('img') }; });
    let cur = -1; try { const sel = ed.getSelection(); const r = sel && sel.getRanges()[0]; if (r) { let n = r.startContainer.$; while (n && n.parentNode !== corpo) n = n.parentNode; if (n) cur = filhos.indexOf(n); } } catch (_) {}
    const blocos = todos.filter((b) => !b.vazio);
    if (!blocos.length) return { erro: 'O editor está vazio.' };
    let total = blocos.reduce((a, b) => a + b.md.length + 2, 0);
    const curBloco = cur >= 0 ? blocos.findIndex((b) => b.pos === cur) : -1;
    // Acima do orçamento: omite, do mais distante do cursor para o mais próximo, os trechos longos. Trecho omitido fica protegido.
    let omitidos = 0;
    if (total > orcamento) {
      const ordem = blocos.map((b, i) => ({ b, i, d: curBloco >= 0 ? Math.abs(i - curBloco) : (blocos.length - i) })).sort((x, y) => y.d - x.d);
      for (const o of ordem) { if (total <= orcamento) break; if (o.b.md.length < 200 || o.i === curBloco) continue; total -= o.b.md.length; o.b.omitido = true; o.b.protegido = true; total += 60; omitidos++; }
    }
    for (const b of blocos) { b.exibido = b.omitido ? '[[trecho omitido: ' + b.md.length + ' caracteres, não altere este trecho]]' : b.md; b.norm = norm(b.exibido); }
    const body = blocos.map((b, i) => (i === curBloco ? MARCA_CURSOR + '\n' : '') + b.exibido).join('\n\n');
    const token = 'sp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    globalThis.__spSnap = { token, ed, corpo, blocos, curBloco, htmlAntes: ed.getData() };
    return { id: token, body, blocos: blocos.length, omitidos, cursor: curBloco, caracteres: body.length };
  }

  function aplicar(id, md, modo) {
    const S = globalThis.__spSnap;
    if (!S || S.token !== id) return { erro: 'Editor ID mismatch, cannot rewrite draft' };
    if (!S.ed || S.ed.readOnly || S.ed.status !== 'ready' || !S.ed.document || S.ed.document.getBody().$ !== S.corpo) return { erro: 'O editor mudou desde a leitura; leia o texto de novo.' };
    const novos = String(md).replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split(/\n\s*\n/).map((x) => x.replace(/^#{1,6}\s+/, '').replace(/^\n+|\n+$/g, '').trim()).filter(Boolean);
    if (!novos.length) return { erro: 'O corpo devolvido está vazio; nada foi alterado.' };
    const O = S.blocos, m = O.length, k = novos.length;
    const nn = novos.map(norm);
    // Alinhamento (maior subsequência comum) entre os parágrafos lidos e os devolvidos.
    const L = Array.from({ length: m + 1 }, () => new Int32Array(k + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) L[i][j] = O[i].norm === nn[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const pares = []; { let i = 0, j = 0; while (i < m && j < k) { if (O[i].norm === nn[j]) { pares.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; } }
    const inteiro = k >= 3 && pares.length >= 0.5 * k;
    if (modo === 'selecao' && !inteiro) return { naoInteiro: true };
    if (k < 0.4 * m) return { erro: 'O corpo devolvido parece incompleto (' + k + ' parágrafos de ' + m + '); nada foi alterado. Devolva o texto completo, com todos os parágrafos.' };
    const ops = []; let ultimoOld = -1, ultimoNovo = -1;
    const lacuna = (oi0, oi1, nj0, nj1) => {
      const A = []; for (let i = oi0; i < oi1; i++) if (!O[i].protegido) A.push(i);
      const B = []; for (let j = nj0; j < nj1; j++) if (!/^\[\[trecho omitido/.test(novos[j])) B.push(j);
      const t = Math.min(A.length, B.length);
      for (let q = 0; q < t; q++) ops.push({ tipo: 'trocar', oi: A[q], j: B[q] });
      for (let q = t; q < A.length; q++) ops.push({ tipo: 'remover', oi: A[q] });
      if (B.length > t) { const ref = t > 0 ? A[t - 1] : (oi0 > 0 ? oi0 - 1 : -1); for (let q = t; q < B.length; q++) ops.push({ tipo: 'inserir', j: B[q], depoisDe: ref, antesDe: ref < 0 ? (oi1 < m ? oi1 : -1) : -1 }); }
    };
    for (const [oi, nj] of pares) { lacuna(ultimoOld + 1, oi, ultimoNovo + 1, nj); ultimoOld = oi; ultimoNovo = nj; }
    lacuna(ultimoOld + 1, m, ultimoNovo + 1, k);
    const raiz = S.corpo, doc = raiz.ownerDocument;
    let ignorados = 0;
    S.ed.fire('saveSnapshot');
    for (const o of ops) {
      if (o.tipo === 'inserir') continue;
      const el = O[o.oi].el; if (!el || !raiz.contains(el)) { ignorados++; continue; }
      if (o.tipo === 'trocar') el.innerHTML = paraHtml(novos[o.j]); else el.parentNode.removeChild(el);
    }
    const ultimo = new Map(); // inserções seguidas na mesma lacuna entram em ordem
    for (const o of ops) {
      if (o.tipo !== 'inserir') continue;
      const chave = o.depoisDe + ':' + o.antesDe;
      const ref = ultimo.get(chave) || (o.depoisDe >= 0 ? O[o.depoisDe].el : null);
      const antes = o.antesDe >= 0 ? O[o.antesDe].el : null;
      const modelo = ref || antes || raiz.firstElementChild;
      const p = doc.createElement('p'); if (modelo) { const c = modelo.getAttribute('class'); if (c) p.setAttribute('class', c); }
      p.innerHTML = paraHtml(novos[o.j]);
      if (ref && raiz.contains(ref)) ref.parentNode.insertBefore(p, ref.nextSibling);
      else if (antes && raiz.contains(antes)) antes.parentNode.insertBefore(p, antes);
      else raiz.appendChild(p);
      ultimo.set(chave, p);
    }
    S.ed.fire('saveSnapshot'); try { S.ed.fire('change'); } catch (_) {}
    S.token = 'sp-usado';
    return { ok: true, trocados: ops.filter((o) => o.tipo === 'trocar').length, inseridos: ops.filter((o) => o.tipo === 'inserir').length, removidos: ops.filter((o) => o.tipo === 'remover').length, mantidos: pares.length, total: m, ignorados };
  }

  // rewrite_selection com um trecho curto: troca a seleção, ou o parágrafo do cursor se não houver seleção.
  function substituirSelecao(id, md) {
    const S = globalThis.__spSnap;
    if (!S || S.token !== id) return { erro: 'Editor ID mismatch, cannot rewrite draft' };
    const t = String(md).replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!t) return { erro: 'Texto vazio; nada foi alterado.' };
    const sel = S.ed.getSelection(); const r = sel && sel.getRanges()[0];
    if (r && !r.collapsed) { S.ed.fire('saveSnapshot'); S.ed.insertHtml(paraHtml(t)); S.ed.fire('saveSnapshot'); S.token = 'sp-usado'; return { ok: true, onde: 'selecao' }; }
    const b = S.blocos[S.curBloco];
    if (!b || b.protegido || !S.corpo.contains(b.el)) return { erro: 'Não há parágrafo no cursor para alterar.' };
    S.ed.fire('saveSnapshot'); b.el.innerHTML = paraHtml(t); S.ed.fire('saveSnapshot'); try { S.ed.fire('change'); } catch (_) {}
    S.token = 'sp-usado';
    return { ok: true, onde: 'paragrafo' };
  }
  const tokenAtual = () => (globalThis.__spSnap && globalThis.__spSnap.token) || null;
  globalThis.__spMinuta = { versao: 1, ler, aplicar, substituirSelecao, tokenAtual, temEditor: () => !!editor() };
  return 'instalada';
}

// ───────────────────────── Host ─────────────────────────
// Escapa o que quebraria um literal dentro de <script> ou de uma linha de código: "<" e os separadores U+2028/U+2029.
const PERIGOSOS = new RegExp("[<" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
const literal = (v) => JSON.stringify(v).replace(PERIGOSOS, (c) => String.fromCharCode(92) + "u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4));
const chamada = (fn, arg) => `(${fn.toString()})(${arg === undefined ? '' : literal(arg)})`;

// Chat do Copilot: https em cloud.microsoft (e subdomínios). Telas de login não recebem nada.
function ehPaginaDoChat(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'cloud.microsoft' || u.hostname.endsWith('.cloud.microsoft')); }
  catch (_) { return false; }
}

// Sinal do console -> id do pedido, ou null (segredo errado, outro texto).
function interpretar(mensagem, segredo) {
  const m = typeof mensagem === 'string' ? mensagem : '';
  const cabeca = PREFIXO + segredo + ':';
  if (!segredo || !m.startsWith(cabeca)) return null;
  const id = m.slice(cabeca.length);
  return /^p[a-z0-9]{1,16}$/.test(id) ? id : null;
}

// Tamanho aproximado, em bytes, da resposta de get_draft como vai ao servidor (JSON dentro de JSON).
function bytesDaResposta(body, id) {
  const data = JSON.stringify({ body, hasSignature: false, id, subject: '' });
  return Buffer.byteLength(JSON.stringify({ payload: JSON.stringify({ jsonrpc: '2.0', id: 'x', result: [{ type: 'text/plain;charset=utf-8;content-language=EN-US', id: '', description_for_model: 'outlookMailComposeChatSteeringPlugin', data, url: '' }] }) }));
}

// deps: { ehColuna(wc)->bool, ativo()->bool, automatico()->bool, getAlvos()->webContents[] (abas candidatas, a ativa primeiro),
//         getColunaWc()->webContents|null, log(tipo, msg, detalhes) }
function criarModoEditor(deps = {}) {
  const { ehColuna = () => false, ativo = () => true, automatico = () => true, getAlvos = () => [], getColunaWc = () => null, log = () => {} } = deps;
  const ligados = new WeakMap(); // wc da coluna -> { segredo }
  let alvoDaLeitura = null;      // webContents da aba lida por último (o rewrite volta nela)

  const exec = (wc, codigo) => wc.mainFrame.executeJavaScript(codigo, false);
  const cfgDaPagina = (segredo) => ({ endpoint: ENDPOINT, prefixo: PREFIXO, segredo, agente: AGENTE, caller: CALLER, automatico: automatico() === true, fonteIntencao: FONTE_INTENCAO, prazoMs: PRAZO_MS });

  async function instalar(wc) {
    if (!wc || wc.isDestroyed() || !ehColuna(wc)) return false;
    const est = ligados.get(wc); if (!est) return false;
    if (!ehPaginaDoChat(wc.getURL())) return false;
    if (!ativo()) { try { await exec(wc, '(globalThis.__spEd && globalThis.__spEd.destruir(), true)'); } catch (_) {} return false; }
    if (!est.segredo) est.segredo = crypto.randomBytes(16).toString('hex');
    try { await exec(wc, chamada(naColuna, cfgDaPagina(est.segredo))); return true; } catch (_) { return false; }
  }

  // Acha a aba com editor editável: a da última leitura (se ainda servir) ou a primeira candidata que tiver um.
  async function acharAlvo() {
    const candidatos = [];
    for (const wc of getAlvos() || []) if (wc && !wc.isDestroyed() && !candidatos.includes(wc)) candidatos.push(wc);
    for (const wc of candidatos) {
      try { await exec(wc, chamada(naMinuta)); if (await exec(wc, 'globalThis.__spMinuta.temEditor()')) return wc; } catch (_) { /* aba sem acesso ou sem editor */ }
    }
    return null;
  }

  async function tratar(pedido) {
    const metodo = pedido && pedido.method; const params = (pedido && pedido.params) || {};
    if (metodo === 'get_draft' || metodo === 'calendar_get_draft') {
      const wc = await acharAlvo();
      if (!wc) { log('COPILOT_MODO_EDITOR_SEM_EDITOR', 'Leitura pedida, mas não há editor aberto'); return { erro: 'Não há um editor de texto aberto na aba ativa.' }; }
      let orcamento = ORCAMENTO_INICIAL, r = null, bytes = 0;
      for (;;) {
        r = await exec(wc, `globalThis.__spMinuta.ler(${literal({ orcamento })})`);
        if (!r || r.erro) return { erro: (r && r.erro) || 'Falha ao ler o editor.' };
        bytes = bytesDaResposta(r.body, r.id);
        if (bytes <= TETO_BYTES || orcamento < 6000) break;
        orcamento = Math.floor(orcamento * 0.8);
      }
      alvoDaLeitura = wc;
      log('COPILOT_MODO_EDITOR_LIDO', 'Texto do editor entregue ao Copilot', { paragrafos: r.blocos, caracteres: r.caracteres, bytes, omitidos: r.omitidos });
      return { data: JSON.stringify({ body: r.body, hasSignature: false, id: r.id, subject: '' }) };
    }
    if (metodo === 'rewrite_draft' || metodo === 'calendar_rewrite_draft' || metodo === 'rewrite_selection') {
      const corpo = params.body;
      if (typeof corpo !== 'string') return { erro: 'Parâmetro body ausente.' };
      const wc = alvoDaLeitura && !alvoDaLeitura.isDestroyed() ? alvoDaLeitura : null;
      if (!wc) return { erro: 'O editor lido não está mais aberto; leia o texto de novo.' };
      const selecao = metodo === 'rewrite_selection';
      let id = params.id;
      if (selecao) { try { id = await exec(wc, 'globalThis.__spMinuta ? globalThis.__spMinuta.tokenAtual() : null'); } catch (_) { id = null; } }
      if (typeof id !== 'string' || !id) return { erro: 'Editor ID mismatch, cannot rewrite draft' };
      let r = await exec(wc, `globalThis.__spMinuta ? globalThis.__spMinuta.aplicar(${literal(id)}, ${literal(corpo)}, ${literal(selecao ? 'selecao' : 'draft')}) : { erro: 'O editor foi recarregado; leia o texto de novo.' }`);
      if (r && r.naoInteiro) r = await exec(wc, `globalThis.__spMinuta.substituirSelecao(${literal(id)}, ${literal(corpo)})`);
      if (!r || r.erro) { log('COPILOT_MODO_EDITOR_RECUSADO', 'Edição recusada', { metodo }); return { erro: (r && r.erro) || 'Falha ao aplicar a edição.' }; }
      log('COPILOT_MODO_EDITOR_APLICADO', 'Edição do Copilot aplicada no editor', { metodo, trocados: r.trocados, inseridos: r.inseridos, removidos: r.removidos, mantidos: r.mantidos, onde: r.onde });
      return { data: 'success' };
    }
    return { erro: 'Unknown draftAssistant function' };
  }

  async function aoConsole(wc, mensagem) {
    const est = ligados.get(wc); if (!est || !est.segredo) return;
    const id = interpretar(mensagem, est.segredo); if (!id) return;
    let resposta;
    try {
      if (!ativo()) resposta = { erro: 'Recurso desligado.' };
      else {
        const pedido = await exec(wc, `globalThis.__spEd ? globalThis.__spEd.pegar(${literal(id)}, ${literal(est.segredo)}) : null`);
        resposta = pedido ? await tratar(pedido) : null;
      }
    } catch (e) { resposta = { erro: 'Falha interna ao acessar o editor.' }; log('COPILOT_MODO_EDITOR_FALHA', 'Falha ao tratar pedido do Copilot'); }
    if (!resposta || wc.isDestroyed()) return;
    try { await exec(wc, `(globalThis.__spEd && globalThis.__spEd.responder(${literal(id)}, ${literal(est.segredo)}, ${literal(resposta)}), true)`); } catch (_) { /* a coluna navegou */ }
  }

  function ligar(wc) {
    if (!wc || ligados.has(wc)) return;
    ligados.set(wc, { segredo: '' });
    const tentar = () => { instalar(wc).catch(() => {}); };
    wc.on('dom-ready', tentar);
    wc.on('did-navigate', tentar);
    wc.on('console-message', (event, ...rest) => {
      const texto = (event && typeof event.message === 'string') ? event.message : (typeof rest[1] === 'string' ? rest[1] : (typeof rest[0] === 'string' ? rest[0] : ''));
      if (texto && texto.startsWith(PREFIXO)) aoConsole(wc, texto).catch(() => {});
    });
  }

  function instalarEmTodos({ app, webContents }) {
    app.on('web-contents-created', (_e, wc) => ligar(wc));
    for (const wc of webContents.getAllWebContents()) { ligar(wc); instalar(wc).catch(() => {}); }
  }

  // Chave ou opção mudou no CFG: reinstala (ou retira) na coluna aberta.
  async function sincronizar() { const wc = getColunaWc(); if (wc && !wc.isDestroyed()) { ligar(wc); await instalar(wc); } }

  // Atalho: liga/desliga o chip na coluna, sem enviar nada. Devolve 'ligado' | 'desligado' | 'indisponivel'.
  async function alternar() {
    if (!ativo()) return 'indisponivel';
    const wc = getColunaWc(); if (!wc || wc.isDestroyed() || !ehPaginaDoChat(wc.getURL())) return 'indisponivel';
    ligar(wc);
    if (!(await instalar(wc))) return 'indisponivel';
    try { return await exec(wc, 'globalThis.__spEd ? globalThis.__spEd.alternar() : "indisponivel"'); } catch (_) { return 'indisponivel'; }
  }

  return { ligar, instalar, aoConsole, tratar, instalarEmTodos, sincronizar, alternar };
}

module.exports = { ENDPOINT, PREFIXO, AGENTE, ATALHO_PADRAO, TETO_BYTES, FONTE_INTENCAO, ehPedidoDeEdicao, naColuna, naMinuta, ehPaginaDoChat, interpretar, bytesDaResposta, criarModoEditor };
