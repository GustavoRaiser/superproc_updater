// Linha da capa: coluna das Minutas (camada: host; mundo isolado 1108, só na capa do processo).
// Preenche #sp-lc-minutas, criada pelo orquestrador (linha-capa.js). Não conhece as outras colunas.
// Porte da parte de minutas do módulo da extensão (modules/capa/lembretes_minutas.js), separada da de lembretes.
//
// - Uma caixa ocupa a coluna: "MINUTAS (+)" (azul) quando há minuta ativa, "SEM MINUTAS (+)" (cinza) quando não há. Excluídas,
//   anuladas e anexadas não contam como ativas. Enquanto o bloco do eproc não chegou, é só a caixa, sem texto.
// - O "(+)" é sempre o jeito de criar: aciona a "Nova Minuta" do eproc (o botão nativo, que continua no bloco oculto), fecha o
//   balão e cancela a abertura por hover que estiver a caminho.
// - O bloco nativo de fora (#fldMinutas; o eproc repete o mesmo id no bloco de dentro) é o balão. Com minuta ativa abre por
//   clique na caixa ou com o mouse parado 0,5 s. Sem minuta ativa não há hover, mas o clique abre só as opções de histórico
//   ("Exibir Excluídas/Anuladas", "Exibir Anexadas"), que é por onde se consultam as minutas antigas. Fecha por clique fora,
//   Esc ou novo clique. Abrir o balão pede ao eproc a atualização da lista (o "Atualizar" nativo).
// - O eproc só mostra as minutas com "Manter Minutas Aberto" marcado e a área aberta: este script mantém as duas coisas
//   (o checkbox e o cabeçalho de fora ficam ocultos no balão).
// - O CSS inicial (linha-capa-cedo.css) mantém o bloco nativo oculto desde que nasce: ele nunca aparece no lugar original.
// - Um balão por vez na linha: quem abre avisa (evento 'sp-lc-abriu' no document) e os outros fecham.
//
// Começa no início do documento (antes de existir <html>): nada aqui em cima toca no DOM.
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spLcMinutas) return;
window.__spLcMinutas = true;

const HOVER_MS = 500;
let caixa = null;   // a caixa da coluna (.sp-lc-botao): estado e hover
let botao = null;   // o texto dentro dela (.sp-lc-rotulo)
let mais = null;    // o "(+)" (.sp-lc-mais)
let bloco = null;   // o #fldMinutas de fora, adotado como balão
let aberto = false;
let temporizador = null; // abertura por hover a caminho

function chegouInteiro(el) {
  if (document.readyState !== 'loading') return true;
  for (let n = el; n && n !== document.documentElement; n = n.parentNode) if (n.nextSibling) return true;
  return false;
}

// ---- O que o eproc precisa para mostrar as minutas ----

// "Manter Minutas Aberto" (#chkMinutasAbertas): sem ele marcado o eproc não mostra o conteúdo. Em perfil novo vem desmarcado, e
// outras rotinas da página podem desmarcá-lo. Clica nele (aciona a rotina nativa, que grava o cookie) e, se não marcar, força.
const MANTER_ESPACO_MS = 600, MANTER_MAX = 6;
const manter = { tentativas: 0, ultima: 0 };
function gravarCookieManter(chk) {
  const m = (chk.getAttribute('onclick') || '').match(/['"]([^'"]*chkMinutasAbertas[^'"]*)['"]/);
  if (!m) return;
  try { document.cookie = m[1] + '=true; expires=' + new Date(Date.now() + 365 * 864e5).toUTCString() + '; path=/; SameSite=Lax'; } catch (_) {}
}
function garantirManter() {
  const chk = document.getElementById('chkMinutasAbertas');
  if (!chk) return;
  if (chk.checked) { manter.tentativas = 0; return; }
  const agora = Date.now();
  if (agora - manter.ultima < MANTER_ESPACO_MS || manter.tentativas >= MANTER_MAX) return;
  manter.tentativas++; manter.ultima = agora;
  gravarCookieManter(chk);
  try { chk.click(); } catch (_) {}
  if (!chk.checked) chk.checked = true;
}

// Pede ao eproc a lista atualizada: o clique no "Atualizar" nativo roda a rotina da página.
let ultimoPedido = 0;
function pedirAtualizacao(forcar) {
  const agora = Date.now();
  if (!bloco || (!forcar && agora - ultimoPedido < 1500)) return;
  ultimoPedido = agora;
  const link = bloco.querySelector('#atualizaMinutas, a[onclick*="atualizaMinutas"]');
  if (link) link.click();
}

// A página pode trazer a área fechada ou vazia (perfil novo): abre pelo botão nativo só quando o ícone indica fechado e não há
// conteúdo, garante os contêineres visíveis e, se ainda não veio nada, pede a lista. Tudo com limite de tentativas.
const abertura = { cliques: 0, ultima: 0, pedidos: 0 };
function garantirAreaAberta() {
  if (!bloco) return;
  const conteudo = bloco.querySelector('#conteudoMinutas');
  const carregando = bloco.querySelector('#carregandoMinutas');
  const emCarga = !!carregando && carregando.style.display !== 'none';
  const img = bloco.querySelector('#imgMinutas');
  const temConteudo = !!conteudo && !!conteudo.querySelector('table, .linkMinuta, #chkExibirExcluidas');
  if (img && /ver_tudo\.gif/.test(img.getAttribute('src') || '') && !temConteudo && !emCarga) {
    const agora = Date.now();
    if (abertura.cliques < 3 && agora - abertura.ultima >= 1500) {
      abertura.cliques++; abertura.ultima = agora;
      const abre = bloco.querySelector('#legMinutasMaisMenos');
      if (abre) abre.click();
    }
  }
  for (const d of bloco.querySelectorAll('div[id^="conteudoMinutas"], div[id^="conteudoInternoMinutas"]')) if (d.style.display === 'none') d.style.display = 'block';
  if (conteudo && !temConteudo && !emCarga && abertura.pedidos < 4) { abertura.pedidos++; pedirAtualizacao(false); }
}

// ---- Estado ----

// Minuta ativa = linha da tabela, no DOM, com texto, não ocultada pelo eproc e que não é do histórico.
function linhaReal(el) {
  if (!el.isConnected || !(el.textContent || '').trim()) return false;
  for (let n = el; n && n !== bloco; n = n.parentElement) {
    if (n.hidden || (n.style && (n.style.display === 'none' || n.style.visibility === 'hidden'))) return false;
  }
  return true;
}
function ativas() {
  if (!bloco) return 0;
  const vistas = new Set();
  let total = 0;
  for (const el of bloco.querySelectorAll('table.infraTable tr.infraTrClara, table.infraTable tr.infraTrEscura, .linkMinuta')) {
    const linha = el.closest('tr') || el;
    if (vistas.has(linha)) continue;
    vistas.add(linha);
    if (linhaReal(linha) && !/exclu[íi]d[ao]|anulad[ao]|anexad[ao]/i.test(linha.textContent || '')) total++;
  }
  return total;
}
const historicoLigado = () => !!bloco && [...bloco.querySelectorAll('#chkExibirExcluidas, #chkExibirAnexadas')].some(c => c.checked);

function atualizar() {
  if (!caixa || !bloco) return;
  garantirManter();
  garantirAreaAberta();
  const tem = ativas() > 0;
  const texto = tem ? 'MINUTAS' : 'SEM MINUTAS';
  if (botao.textContent !== texto) botao.textContent = texto;
  caixa.classList.remove('sp-lc-espera');
  caixa.classList.toggle('sp-lc-com', tem);
  caixa.classList.toggle('sp-lc-sem', !tem);
  mais.hidden = false;
  // Sem minuta ativa e sem histórico pedido, o balão mostra só as opções de histórico (a tabela vazia não aparece).
  bloco.classList.toggle('sp-lc-so-opcoes', !tem && !historicoLigado());
}

// ---- Balão ----

function fechar() {
  aberto = false;
  if (bloco) bloco.classList.remove('sp-lc-aberto');
  if (botao) botao.setAttribute('aria-expanded', 'false');
}
// Abre embaixo da própria coluna; se não couber até o fim da linha, recua para a esquerda o quanto precisar.
function posicionar() {
  const linha = document.getElementById('sp-lc-linha');
  if (!linha) return;
  const sobra = linha.clientWidth - bloco.offsetWidth;
  const esquerda = Math.max(0, Math.min(caixa.parentNode.offsetLeft, sobra)) + 'px';
  if (bloco.style.left !== esquerda) bloco.style.setProperty('left', esquerda, 'important'); // só escreve se mudou (o vigia observa o style)
}
function abrir(porHover) {
  if (!bloco) return;
  if (porHover && ativas() === 0) return; // sem minuta ativa, só o clique abre (as opções de histórico)
  aberto = true;
  bloco.classList.add('sp-lc-aberto');
  botao.setAttribute('aria-expanded', 'true');
  posicionar();
  document.dispatchEvent(new CustomEvent('sp-lc-abriu', { detail: 'minutas' }));
  pedirAtualizacao(!porHover);
}

// "Nova Minuta": o botão nativo do bloco (abre o cadastro de minuta do eproc).
function novaMinuta() {
  const b = bloco && (bloco.querySelector('[title="Nova Minuta"]') || bloco.querySelector('[onclick*="minuta_cadastrar"]'));
  if (b) b.click();
}

function criarCaixa(coluna) {
  caixa = document.createElement('div');
  caixa.className = 'sp-lc-botao sp-lc-espera';
  botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'sp-lc-rotulo';
  botao.textContent = 'MINUTAS';
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-controls', 'fldMinutas');
  mais = document.createElement('button');
  mais.type = 'button';
  mais.className = 'sp-lc-mais';
  mais.textContent = '(+)';
  mais.title = 'Nova minuta';
  mais.setAttribute('aria-label', 'Nova minuta');
  mais.hidden = true;
  caixa.append(botao, mais);
  coluna.appendChild(caixa);
  caixa.addEventListener('click', (e) => {
    if (e.target.closest('.sp-lc-mais')) return;
    if (aberto) fechar(); else abrir(false);
  });
  mais.addEventListener('click', () => { clearTimeout(temporizador); fechar(); novaMinuta(); });
  caixa.addEventListener('mouseenter', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { if (!aberto) abrir(true); }, HOVER_MS); });
  caixa.addEventListener('mouseleave', () => clearTimeout(temporizador));
}

// Mudanças dentro do bloco (lista recarregada, minuta removida ou ocultada, histórico ligado) refazem a conta.
const vigia = new MutationObserver(() => { atualizar(); if (aberto) posicionar(); });

function adotar(novo) {
  if (bloco && bloco !== novo) { vigia.disconnect(); bloco.remove(); }
  bloco = novo;
  bloco.classList.add('sp-lc-balao');
  bloco.classList.toggle('sp-lc-aberto', aberto);
  caixa.parentNode.appendChild(bloco);
  vigia.observe(bloco, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  // Marcar/desmarcar o histórico não muda o DOM na hora: refaz a conta no evento.
  bloco.addEventListener('change', (e) => { if (e.target && /^chkExibir(Excluidas|Anexadas)$/.test(e.target.id)) atualizar(); });
  atualizar();
}

// Marca no <html> de que este script está vivo: o CSS inicial só esconde o bloco nativo enquanto ela existir. Se o script não
// for carregado ou falhar, o bloco do eproc continua aparecendo no lugar dele.
function marcarVivo() { if (document.documentElement) document.documentElement.classList.add('sp-lc-tem-minutas'); }

// Roda a cada mudança do DOM, na hora. O bloco por adotar é o #fldMinutas de fora que ainda não está na coluna.
function montar() {
  marcarVivo();
  if (!caixa) {
    const coluna = document.getElementById('sp-lc-minutas');
    if (!coluna) return;
    criarCaixa(coluna);
  }
  for (const f of document.querySelectorAll('#fldMinutas')) {
    if (f === bloco || (f.parentElement && f.parentElement.closest('#fldMinutas'))) continue;
    if (chegouInteiro(f)) { adotar(f); break; }
  }
}

document.addEventListener('click', (e) => {
  if (!aberto) return;
  if (e.target && e.target.closest && e.target.closest('#sp-lc-minutas')) return;
  fechar();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !aberto) return;
  fechar();
  botao.focus();
});
document.addEventListener('sp-lc-abriu', (e) => { if (e.detail !== 'minutas' && aberto) fechar(); });

montar();
// Um bloco que é a última coisa do HTML só é dado como inteiro quando o carregamento termina, e aí não há mais mudança no DOM
// para avisar: confere de novo nesse momento.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
new MutationObserver(montar).observe(document, { childList: true, subtree: true });
// O .checked alterado por script não gera evento nem mutação: conferência leve e periódica do "Manter Minutas Aberto".
setInterval(garantirManter, 2000);
