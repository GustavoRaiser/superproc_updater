// Linha da capa: coluna das Ações preferenciais (camada: host; mundo isolado 1108, só na capa do processo).
// Preenche #sp-lc-acoes (a metade direita da linha), criada pelo orquestrador (linha-capa.js). Não conhece as outras colunas.
// Porte do MODO COMPACTO do módulo da extensão (modules/capa/acoes_preferenciais.js). Aqui há um modo só: o bloco nativo
// das preferências (#div-acoes-preferenciais) não aparece na página; o CSS inicial o oculta desde que nasce.
//
// - Um botão por categoria que o usuário deixou aberta no eproc (Minutas, Movimentações, Intimações, Automatizações) E que
//   tem preferência cadastrada em alguma seção. Zero a quatro botões, sempre nessa ordem, dividindo a coluna por igual; nenhum, a coluna
//   fica vazia. Cores das categorias como no eproc (azul, verde, vermelho, roxo).
// - Clique no botão, ou mouse parado 0,4 s: abre, logo abaixo, as seções daquela categoria que têm conteúdo (Individuais,
//   Unidade, Ocultas), inclusive as que o eproc mantém escondidas no bloco nativo.
// - Categoria com uma seção só não tem submenu: o clique (ou o mouse parado) já abre o painel dela.
// - Clique na seção, ou mouse parado 0,2 s: abre o painel com as ações dela, da largura da linha, em colunas. O conteúdo é
//   uma cópia dos links do eproc; clicar num deles executa a ação nativa e fecha o painel.
// - Fecha por Esc, clique fora ou pelo X. Um balão por vez na linha (evento 'sp-lc-abriu' no document).
// - Acompanha a página ao vivo: categoria aberta/fechada pelos botões de Preferências, seção ligada/desligada, lista que
//   chega depois (automatizações).
// - No menu de Preferências do eproc (#nav-acoes-processo), cada categoria ganha a caixinha "Sempre aberto ao iniciar",
//   que espelha o seletor nativo (ele fica dentro do bloco oculto).
//
// Começa no início do documento (antes de existir <html>): nada aqui em cima toca no DOM.
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spLcAcoes) return;
window.__spLcAcoes = true;

const CATS = [
  { id: 'minuta', nome: 'MINUTAS', botaoNativo: 'btn-preferencias-minutas' },
  { id: 'movimentacao', nome: 'MOVIMENTAÇÕES', botaoNativo: 'btn-preferencias-movimentacao' },
  { id: 'intimacao', nome: 'INTIMAÇÕES', botaoNativo: 'btn-preferencias-intimacao' },
  { id: 'automatizacao', nome: 'AUTOMATIZAÇÕES', botaoNativo: 'btn-preferencias-automatizar' }
];
const HOVER_CATEGORIA_MS = 400, HOVER_SECAO_MS = 200;

let assinatura = null;   // o que está desenhado na coluna (categorias e seções)
let catAberta = null;    // id da categoria com as seções à mostra
let painel = null;       // #sp-lc-painel, criado no primeiro uso
let temporizador = null; // hover a caminho

// ---- Leitura do bloco nativo ----

const util = 'table, ul li, a.infraButton, a.content-link';
function secaoValida(sec) {
  // O eproc mantém "Unidade" e "Ocultas" com display:none até o seletor delas ser ligado; aqui elas entram mesmo assim: é por
  // este menu que se chega a essas ações (medido numa capa real: Individuais vazia e as ações todas em Unidade/Ocultas).
  const texto = sec.textContent || '';
  return !!texto.trim() && !texto.includes('Sem preferência cadastrada') && !!sec.querySelector(util);
}
function tituloDe(sec) {
  const h = sec.querySelector('h4, h6');
  const t = (h ? h.textContent : 'Opções').trim().toUpperCase();
  return t.includes('UNIDADE') ? 'UNIDADE' : t.includes('OCULTAS') ? 'OCULTAS' : (t || 'OPÇÕES');
}
// Seções com conteúdo da categoria, se o usuário a deixou aberta no eproc. Sem subdivisões (automatizações), o painel inteiro.
function secoesDe(cat) {
  const nativo = document.getElementById('div-preferencia-' + cat.id);
  if (!nativo || !(nativo.classList.contains('show') || nativo.classList.contains('in'))) return [];
  const partes = [...nativo.querySelectorAll('div[id^="preferencia-' + cat.id + '-"], #div-preferencia-' + cat.id + '-dados')];
  if (partes.length) return partes.filter(secaoValida).map(el => ({ el, titulo: tituloDe(el) }));
  return secaoValida(nativo) ? [{ el: nativo, titulo: 'OPÇÕES' }] : [];
}

// ---- Balões ----

function fecharPainel() { if (painel) painel.style.display = 'none'; }
function fecharSecoes() {
  catAberta = null;
  for (const c of document.querySelectorAll('#sp-lc-acoes .sp-lc-celula.sp-lc-aberta')) {
    c.classList.remove('sp-lc-aberta');
    c.querySelector('.sp-lc-acao').setAttribute('aria-expanded', 'false');
  }
}
function fecharTudo() { clearTimeout(temporizador); fecharSecoes(); fecharPainel(); }

function abrirSecoes(celula, cat) {
  fecharTudo();
  catAberta = cat.id;
  celula.classList.add('sp-lc-aberta');
  celula.querySelector('.sp-lc-acao').setAttribute('aria-expanded', 'true');
  document.dispatchEvent(new CustomEvent('sp-lc-abriu', { detail: 'acoes' }));
}

function abrirPainel(cat, secao) {
  const linha = document.getElementById('sp-lc-linha');
  if (!linha || !secao.el.isConnected) return;
  if (!painel) {
    painel = document.createElement('div');
    painel.id = 'sp-lc-painel';
    // Clicar numa ação: a rotina nativa do link copiado roda primeiro (onclick/href); depois o painel fecha.
    painel.addEventListener('click', (e) => { if (e.target.closest('a, #sp-lc-painel-fechar')) fecharTudo(); });
  }
  painel.dataset.cat = cat.id;
  painel.setAttribute('aria-label', cat.nome + ' - ' + secao.titulo);
  painel.textContent = '';
  const fechar = document.createElement('button');
  fechar.type = 'button'; fechar.id = 'sp-lc-painel-fechar'; fechar.textContent = '×';
  fechar.title = 'Fechar'; fechar.setAttribute('aria-label', 'Fechar');
  const conteudo = document.createElement('div');
  conteudo.className = 'sp-lc-painel-conteudo';
  // Cópia do conteúdo da seção, sem o título, a linha e os controles (o que interessa são as ações).
  for (const no of secao.el.childNodes) {
    if (no.nodeType === 1 && no.matches('h4, h6, hr, legend, .btn-close, button')) continue;
    conteudo.appendChild(no.cloneNode(true));
  }
  for (const lixo of conteudo.querySelectorAll('legend, .dropdown, .btn-close, button, svg, script, style')) lixo.remove();
  painel.append(fechar, conteudo);
  fecharSecoes();
  linha.appendChild(painel);
  painel.style.display = 'block';
  document.dispatchEvent(new CustomEvent('sp-lc-abriu', { detail: 'acoes' }));
}

// ---- Desenho da coluna ----

function desenhar(coluna, estado) {
  fecharTudo();
  coluna.textContent = '';
  for (const { cat, secoes } of estado) {
    const celula = document.createElement('div');
    celula.className = 'sp-lc-celula';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'sp-lc-acao';
    botao.dataset.cat = cat.id;
    botao.textContent = cat.nome + ' ▾';
    botao.title = 'Ações preferenciais: ' + cat.nome.toLowerCase();
    botao.setAttribute('aria-expanded', 'false');
    const lista = document.createElement('div');
    lista.className = 'sp-lc-subs';
    for (const secao of secoes.length > 1 ? secoes : []) {
      const sub = document.createElement('button');
      sub.type = 'button';
      sub.className = 'sp-lc-sub';
      sub.dataset.cat = cat.id;
      sub.textContent = secao.titulo;
      sub.addEventListener('click', () => { clearTimeout(temporizador); abrirPainel(cat, secao); });
      sub.addEventListener('mouseenter', () => { clearTimeout(temporizador); temporizador = setTimeout(() => abrirPainel(cat, secao), HOVER_SECAO_MS); });
      sub.addEventListener('mouseleave', () => clearTimeout(temporizador));
      lista.appendChild(sub);
    }
    // Uma seção só: não há o que escolher, o painel dela abre direto (sem submenu de um item).
    const abrir = () => {
      if (secoes.length > 1) { abrirSecoes(celula, cat); return; }
      fecharTudo();
      abrirPainel(cat, secoes[0]);
      catAberta = cat.id;
      celula.classList.add('sp-lc-aberta');
      botao.setAttribute('aria-expanded', 'true');
    };
    botao.addEventListener('click', () => { if (catAberta === cat.id) fecharTudo(); else abrir(); });
    botao.addEventListener('mouseenter', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { if (catAberta !== cat.id) abrir(); }, HOVER_CATEGORIA_MS); });
    botao.addEventListener('mouseleave', () => clearTimeout(temporizador));
    celula.append(botao, lista);
    coluna.appendChild(celula);
  }
}

// "Sempre aberto ao iniciar": o seletor nativo (#switch-preferencia-<categoria>-collapse) fica dentro do bloco oculto; a caixinha
// no menu de Preferências o espelha e o aciona pelo clique (a rotina do eproc é que grava a preferência).
function caixinhasSempreAberto() {
  for (const cat of CATS) {
    const nativo = document.getElementById(cat.botaoNativo);
    const item = nativo && nativo.closest('li');
    if (!item) continue;
    const seletor = document.getElementById('switch-preferencia-' + cat.id + '-collapse');
    let rotulo = item.querySelector('.sp-lc-sempre');
    if (!rotulo) {
      rotulo = document.createElement('label');
      rotulo.className = 'sp-lc-sempre';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.addEventListener('change', () => {
        const s = document.getElementById('switch-preferencia-' + cat.id + '-collapse');
        if (s && s.checked !== chk.checked) s.click();
      });
      rotulo.append(chk, ' Sempre aberto ao iniciar');
      item.appendChild(rotulo);
    }
    // Reflete o seletor uma vez, quando ele existir (depois disso quem manda é o usuário).
    if (seletor && !rotulo.dataset.espelhado) { rotulo.querySelector('input').checked = seletor.checked; rotulo.dataset.espelhado = '1'; }
  }
}

// Roda a cada mudança do DOM. Só redesenha quando muda o conjunto de categorias/seções.
function montar() {
  caixinhasSempreAberto();
  const coluna = document.getElementById('sp-lc-acoes');
  if (!coluna) return;
  const estado = CATS.map(cat => ({ cat, secoes: secoesDe(cat) })).filter(e => e.secoes.length);
  const nova = estado.map(e => e.cat.id + ':' + e.secoes.map(s => s.titulo).join('|')).join(';');
  if (nova === assinatura) return;
  assinatura = nova;
  desenhar(coluna, estado);
}

// O bloco nativo: abrir/fechar categoria só troca a classe do painel, e ligar/desligar seção só troca o style.
let nativoVigiado = null;
const vigia = new MutationObserver(montar);
function vigiarNativo() {
  const nativo = document.getElementById('div-acoes-preferenciais');
  if (!nativo || nativo === nativoVigiado) return;
  nativoVigiado = nativo;
  vigia.disconnect();
  vigia.observe(nativo, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
}

document.addEventListener('click', (e) => {
  if (catAberta === null && !(painel && painel.style.display !== 'none')) return;
  if (e.target && e.target.closest && e.target.closest('#sp-lc-acoes, #sp-lc-painel')) return;
  fecharTudo();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharTudo(); });
document.addEventListener('sp-lc-abriu', (e) => { if (e.detail !== 'acoes') fecharTudo(); });

// Marca no <html> de que este script está vivo: o CSS inicial só esconde o bloco nativo enquanto ela existir. Se o script não
// for carregado ou falhar, o bloco do eproc continua aparecendo no lugar dele.
function marcarVivo() { if (document.documentElement) document.documentElement.classList.add('sp-lc-tem-acoes'); }

const tudo = () => { marcarVivo(); vigiarNativo(); montar(); };
tudo();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tudo, { once: true });
new MutationObserver(tudo).observe(document, { childList: true, subtree: true });
