// Navegação pela lista de processos (camada: host; mundo isolado 1109). Parte nativa da antiga "Navegação rápida" da extensão
// (modules/painel/localizadores_lista.js), SEM o botão "Feito": só a lista, o ir e voltar nela.
//
//   - Em qualquer tela do eproc com uma tabela de processos (lista do localizador, painel etc.), guarda na sessão da aba a lista
//     de processos e o nome do localizador de onde você vai sair.
//   - Na capa do processo (acao=processo_selecionar), mostra a barra  ◀  LISTA (n/N)  ▶  ao lado do seletor de unidades:
//     ◀ vai ao processo anterior, ▶ ao próximo (sempre o seguinte da lista) e LISTA abre a janelinha com todos os processos.
//
// Mesmas chaves de sessão e mesmo id de barra da extensão (eproc_lista_processos_capturados, eproc_nome_localizador_capturado,
// #eproc-nav-container): se a extensão também estiver instalada, as duas se reconhecem e só uma barra aparece.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spNavegacaoLista) return;
window.__spNavegacaoLista = true;

const CHAVE_LISTA = 'eproc_lista_processos_capturados';
const CHAVE_NOME = 'eproc_nome_localizador_capturado';
const RE_NUMERO = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const ehCapa = new URLSearchParams(location.search).get('acao') === 'processo_selecionar';

function lerLista() {
  try { const l = JSON.parse(sessionStorage.getItem(CHAVE_LISTA) || '[]'); return Array.isArray(l) ? l.filter(i => i && typeof i.numero === 'string' && typeof i.url === 'string') : []; } catch (_) { return []; }
}

// O navegador não deve empilhar o processo aberto pelas setas como "relacionado" (pilha-relacionados.js lê e apaga a marca).
function marcarSemPilha() {
  try { document.documentElement.setAttribute('data-superproc-sem-pilha', String(Date.now())); } catch (_) {}
}

// Antes de sair do processo, fecha as árvores abertas (mesma ordem da extensão: comando ao host + canal entre abas).
function fecharArvore() {
  try { console.log('[SUPERPROC_CMD_FECHAR_ARVORE]'); } catch (_) {}
  try {
    const canal = new BroadcastChannel('eproc_channel_sync');
    canal.postMessage({ tipo: 'FECHAR_TODAS_AS_FILHAS' });
    canal.postMessage({ tipo: 'FECHAR_IMEDIATO' });
    setTimeout(() => { try { canal.close(); } catch (_) {} }, 800);
  } catch (_) {}
}

function irPara(url) {
  fecharArvore();
  marcarSemPilha();
  location.href = url;
}

// ---- Captura na lista ----
function nomeDoLocalizador() {
  const pesquisa = document.querySelector('#container_criterios_pesquisa li p');
  if (pesquisa && pesquisa.textContent.trim()) return pesquisa.textContent.trim();
  const botao = document.querySelector('button[data-id="selLocalizador"]');
  const titulo = botao && botao.getAttribute('title');
  if (titulo && titulo.trim() && titulo.trim() !== 'Nada selecionado') return titulo.trim();
  const select = document.getElementById('selLocalizador') || document.querySelector('select[name="selLocalizador"]');
  if (select && select.selectedIndex >= 0) { const t = select.options[select.selectedIndex].text; if (t && t.trim()) return t.trim(); }
  return 'Lista de Processos';
}

function capturarProcessos() {
  const itens = new Map();
  for (const a of document.querySelectorAll('table a[href*="acao=processo_selecionar"]')) {
    const m = a.textContent.match(RE_NUMERO);
    if (!m) continue;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { continue; }
    if (url.origin !== location.origin || url.searchParams.get('acao') !== 'processo_selecionar') continue;
    const id = soDigitos(m[0]);
    const doLink = soDigitos(url.searchParams.get('num_processo') || url.searchParams.get('txtNumProcesso') || '');
    if (doLink && doLink !== id) continue;
    if (!itens.has(id)) itens.set(id, { numero: m[0], url: url.href });
  }
  return [...itens.values()];
}

let ultima = '';
function publicar() {
  const lista = capturarProcessos();
  if (!lista.length) return;
  const texto = JSON.stringify(lista);
  if (texto === ultima) return;
  ultima = texto;
  try {
    sessionStorage.setItem(CHAVE_LISTA, texto);
    sessionStorage.setItem(CHAVE_NOME, nomeDoLocalizador());
  } catch (_) { /* sessão cheia ou bloqueada: a barra simplesmente não aparece na capa */ }
}

// ---- Barra na capa ----
const ESTILO_ID = 'sp-nav-lista-css';
function injetarEstilo() {
  if (document.getElementById(ESTILO_ID)) return;
  const st = document.createElement('style');
  st.id = ESTILO_ID;
  st.textContent = `
    #eproc-nav-container { display: inline-flex !important; align-items: center !important; gap: 1px !important; margin: 0 8px 0 0 !important; vertical-align: middle !important; align-self: center !important; }
    #eproc-nav-container .btn-nav-eproc { height: 31px !important; min-height: 31px !important; box-sizing: border-box !important; margin: 0 !important; line-height: 1 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; border-radius: 4px !important; font-size: 11px !important; font-weight: 400 !important; background: #fff !important; color: #343a40 !important; border: 1px solid #cbd5e1 !important; cursor: pointer !important; }
    #eproc-nav-container .btn-nav-eproc.sp-seta { width: 31px !important; min-width: 31px !important; padding: 0 !important; }
    #eproc-nav-container .btn-nav-eproc:not(.sp-seta) { padding: 0 10px !important; }
    #eproc-nav-container .btn-nav-eproc:hover:not(:disabled) { filter: brightness(0.96) !important; box-shadow: 0 1px 2px rgba(0,0,0,.08) !important; }
    #eproc-nav-container .btn-nav-eproc:disabled { color: #cbd5e1 !important; border-color: #e2e8f0 !important; cursor: not-allowed !important; opacity: 1 !important; }
  `;
  (document.head || document.documentElement).appendChild(st);
}

function botao(texto, titulo, seta) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'infraButton btn-nav-eproc' + (seta ? ' sp-seta' : '');
  b.textContent = texto;
  b.title = titulo;
  return b;
}

function indiceAtual(lista) {
  const p = new URLSearchParams(location.search);
  const atual = soDigitos(p.get('num_processo') || p.get('txtNumProcesso'));
  return atual ? lista.findIndex(i => soDigitos(i.numero) === atual) : -1;
}

function alternarJanela(lista, indice, nome) {
  let m = document.getElementById('eproc-modal-lista');
  if (m) { m.style.display = m.style.display === 'none' ? 'flex' : 'none'; return; }
  m = document.createElement('div');
  m.id = 'eproc-modal-lista';
  Object.assign(m.style, { position: 'fixed', top: '55px', right: '25px', width: '450px', maxHeight: '75vh', backgroundColor: '#fff', border: '2px solid #0056b3', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: '999999', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', fontSize: '13px' });
  const cab = document.createElement('div');
  Object.assign(cab.style, { backgroundColor: '#0056b3', color: '#fff', padding: '8px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' });
  const titulo = document.createElement('span');
  Object.assign(titulo.style, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  titulo.textContent = titulo.title = `${nome} - ${lista.length}`;
  const fechar = document.createElement('span');
  Object.assign(fechar.style, { cursor: 'pointer', fontSize: '16px', lineHeight: '1' });
  fechar.textContent = '×';
  fechar.onclick = () => { m.style.display = 'none'; };
  cab.append(titulo, fechar);
  const corpo = document.createElement('div');
  Object.assign(corpo.style, { overflowY: 'auto', flex: '1', padding: '4px 0' });
  lista.forEach((item, i) => {
    const atual = i === indice;
    const linha = document.createElement('div');
    Object.assign(linha.style, { padding: '7px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', backgroundColor: atual ? '#bbf7d0' : (i % 2 === 0 ? '#f4f4f4' : '#e5e7eb'), color: atual ? '#065f46' : '#222', fontWeight: atual ? 'bold' : 'normal' });
    const num = document.createElement('span');
    const forte = document.createElement('strong');
    forte.textContent = `${i + 1}.`;
    num.append(forte, ` ${item.numero}`);
    linha.appendChild(num);
    if (atual) { const t = document.createElement('span'); t.textContent = '✔ Atual'; linha.appendChild(t); }
    linha.onclick = () => irPara(item.url);
    corpo.appendChild(linha);
  });
  m.append(cab, corpo);
  document.body.appendChild(m);
}

// Devolve true quando não há mais o que esperar (barra criada ou já existente).
function montarBarra() {
  if (document.getElementById('eproc-nav-container')) return true;
  const lista = lerLista();
  if (!lista.length) return true; // não veio de uma lista: sem barra
  const sel = document.getElementById('selInfraUnidades');
  const alvo = sel ? (sel.closest('.d-none.d-lg-block') || sel.closest('form')) : null;
  const download = document.getElementById('btnDownloadCompletoRS') || document.querySelector('button[aria-label="Download Completo"]');
  const barraCmd = document.getElementById('divInfraBarraComandosSuperior') || document.querySelector('.eproc-barra-superior-flutuante') || document.getElementById('fldCapa');
  if (!alvo && !download && !barraCmd) return false; // a página ainda está chegando

  injetarEstilo();
  const indice = indiceAtual(lista);
  const nome = sessionStorage.getItem(CHAVE_NOME) || 'Localizador';

  const caixa = document.createElement('div');
  caixa.id = 'eproc-nav-container';

  const anterior = botao('◀', 'Processo anterior da lista', true);
  if (indice > 0) anterior.onclick = () => irPara(lista[indice - 1].url); else anterior.disabled = true;

  const abrir = botao(`LISTA (${indice >= 0 ? indice + 1 : '?'}/${lista.length})`, 'Abrir a lista de processos', false);
  abrir.onclick = () => alternarJanela(lerLista(), indice, nome);

  const proximo = botao('▶', 'Próximo processo da lista', true);
  if (indice >= 0 && indice < lista.length - 1) proximo.onclick = () => irPara(lista[indice + 1].url); else proximo.disabled = true;

  caixa.append(anterior, abrir, proximo);

  if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(caixa, alvo.nextSibling);
  else if (download && download.parentNode) download.parentNode.insertBefore(caixa, download.nextSibling);
  else if (barraCmd.id === 'fldCapa') barraCmd.parentNode.insertBefore(caixa, barraCmd);
  else {
    barraCmd.appendChild(caixa);
    const flutuante = barraCmd.closest('.eproc-barra-superior-flutuante');
    if (flutuante) flutuante.style.display = '';
  }
  return true;
}

if (ehCapa) {
  // O eproc/AZFLOW reescrevem partes da barra superior: confere por alguns segundos até a barra assentar.
  let tentativas = 0;
  const marca = setInterval(() => { tentativas++; if (montarBarra() || tentativas > 20) clearInterval(marca); }, 300);
  montarBarra();
} else {
  // Lista: o clique num processo guarda a lista na hora (a navegação é imediata); a tabela também muda por AJAX.
  const aoAbrir = (e) => {
    const link = e.target instanceof Element && e.target.closest('a[href*="acao=processo_selecionar"]');
    if (link && link.closest('table') && RE_NUMERO.test(link.textContent)) { fecharArvore(); publicar(); }
  };
  document.addEventListener('click', aoAbrir, true);
  document.addEventListener('superproc-navegacao-processo', aoAbrir, true); // aviso de menos-abas.js quando ele pára o clique
  publicar();
  let espera;
  new MutationObserver(() => { clearTimeout(espera); espera = setTimeout(publicar, 300); }).observe(document.documentElement, { childList: true, subtree: true });
}
