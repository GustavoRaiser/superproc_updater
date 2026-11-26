// Barra de Botões da capa (balões flutuantes) do navegador SuperPROC (camada: host; mundo isolado, só na capa do processo).
// Chave própria em CFG > Configurações ("Barra de Botões da capa", barraBotoesCapa). Porte independente do módulo da extensão
// (modules/capa/botoes_preferencias.js), revisado: ver docs/ia/MODULOS.md.
//
// Converte os blocos nativos da capa (Assuntos, Informações adicionais, Ações e Preferências) em balões de uma barra única ao
// lado do Juiz(a). Abre por clique ou por hover (0,5 s); fecha por clique fora, Esc ou ao abrir outro.
//
// Diferenças em relação ao módulo da extensão (achados da revisão de código):
//   - não barra a propagação dos cliques dentro dos balões: os handlers do eproc ligados por delegação no document continuam
//     funcionando; o "clicar fora" ignora o que está dentro da barra e dos balões;
//   - o cabeçalho do balão recebe só os filhos diretos da legend (antes, descendentes eram arrancados de dentro dos links);
//   - começa no início do documento (preload eproc-recursos-cedo-preload.js): a barra nasce com os quatro botões junto com a
//     linha do título, enquanto o HTML ainda chega; cada bloco entra no seu botão quando chega inteiro (nunca aparece no lugar
//     original: o CSS inicial o oculta). Botão cujo bloco não existe na página sai da vista ao fim do carregamento;
//   - o CSS entra no começo; classes com prefixo sp-bb-; sem esconder elementos alheios à barra (barra de localização,
//     "Manter minutas abertas", voltar ao topo); gatilhos são <button> com aria-expanded e fecham com Esc;
//   - um único ouvinte de clique e um de teclado no document, com saída imediata quando nenhum balão está aberto.
// Só texto nos botões (sem ícone nem seta), fundo #f8f9fa. Posição: linha do título, à direita (no lugar do ícone de ajuda, que fica oculto); sem a linha, cai ao lado do Juiz(a).
// Não há modo compacto neste porte.
//
// Este arquivo é lido do disco pelo host a cada ativação e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spBarraBotoesCapa) return;
window.__spBarraBotoesCapa = true;
// Pode começar antes de existir <html> (preload, no início do documento): nada aqui em cima toca no DOM; tudo espera em montar().

const svg = (corpo) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + corpo + '</svg>';
const DEFS = [
  { id: 'fldAssuntos', texto: 'Assuntos', icone: svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>') },
  { id: 'fldInformacoesAdicionais', texto: 'Informações', icone: svg('<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>') },
  { id: 'fldAcoes', texto: 'Ações', icone: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>') },
  { id: 'nav-acoes-processo', texto: 'Preferências', icone: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>') }
];
const ID_PREFERENCIAS = 'nav-acoes-processo';
const HOVER_MS = 500;
const TETO_OBSERVADOR_MS = 15000;

const CSS = `
/* Estilo ePROC, medido nos botões nativos (.infraButton da barra "Download Completo / Nova Consulta"): 14px/400, cor #007ebd,
   borda #dee2e6, raio 0.2rem, padding 4px 8px, altura 31px, 3px entre botões. Sem sombra (pedido do usuário). Margem
   inferior -1px: com o my-1 (4px) da linha nativa, sobram 3px entre as duas linhas, igual ao vão horizontal. Fundo #f8f9fa pedido pelo
   usuário; hover próprio. */
#sp-bb-slot { display: inline-flex !important; align-items: center !important; justify-content: flex-end !important; flex-wrap: nowrap !important; margin: 4px 0 -1px auto !important; padding: 0 !important; }
#divInfraBarraLocalizacao > div { align-items: center !important; }
#divInfraBarraLocalizacao > div > h1 { margin-bottom: 0 !important; }
.sp-bb-ajuda-oculta { display: none !important; }
.sp-bb-barra { display: inline-flex !important; align-items: stretch !important; gap: 3px !important; margin: 0 !important; vertical-align: middle !important; border: none !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; height: 31px !important; min-height: 31px !important; max-height: 31px !important; padding: 0 !important; flex-wrap: nowrap !important; position: relative !important; box-sizing: border-box !important; }
.sp-bb-gatilho { -webkit-appearance: none !important; appearance: none !important; position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; padding: 4px 8px !important; background-color: #f8f9fa !important; border: 1px solid #dee2e6 !important; border-radius: 0.2rem !important; box-shadow: none !important; font-family: inherit !important; font-size: 14px !important; font-weight: 400 !important; color: #007ebd !important; cursor: pointer !important; transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important; box-sizing: border-box !important; height: 100% !important; margin: 0 !important; line-height: 1.5 !important; }
.sp-bb-gatilho:hover { background-color: #eef6fb !important; border-color: #007ebc !important; }
.sp-bb-gatilho:focus-visible { outline: none !important; border-color: #3ebfff !important; box-shadow: 0 0 0 0.1rem rgba(0,126,189,0.25) !important; }
.sp-bb-sem-bloco { display: none !important; }
.sp-bb-gatilho .sp-bb-texto { display: inline-block !important; line-height: inherit !important; }
/* Sem respiro em cima e embaixo do conteúdo da página, logo abaixo do menu. */
#page-content-wrapper { padding-top: 0 !important; padding-bottom: 0 !important; }
#divInfraAreaTela { margin-top: 0 !important; } /* tira o mt-2 (8px) do eproc acima do título */

.sp-bb-balao { position: absolute !important; top: calc(100% + 1px) !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 9999 !important; background: #ffffff !important; border: 1px solid #ccc !important; border-radius: 2px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; padding: 15px !important; box-sizing: border-box !important; width: 1000px !important; max-width: calc(100vw - 30px) !important; margin: 0 !important; display: none !important; font-weight: normal !important; text-align: left !important; }
.sp-bb-balao.sp-bb-aberto { display: block !important; }
.sp-bb-cabecalho { display: flex !important; align-items: center !important; gap: 15px !important; margin-bottom: 10px !important; padding-bottom: 10px !important; border-bottom: 1px solid #eaeaea !important; }
.sp-bb-cabecalho button, .sp-bb-cabecalho a, .sp-bb-cabecalho span { margin: 0 !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; }

#fldInformacoesAdicionais_content > .row { padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important; margin-right: 0 !important; width: 100% !important; }
.sp-bb-balao .col-md-4 .row { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; margin-bottom: 4px !important; }
.sp-bb-balao span.text-right { font-weight: 400 !important; text-align: right !important; flex: 0 0 52% !important; max-width: 52% !important; color: #444 !important; font-size: 13px !important; padding-right: 8px !important; line-height: 1.2 !important; }
.sp-bb-balao span.text-left { font-weight: 700 !important; text-align: left !important; flex: 0 0 48% !important; max-width: 48% !important; color: #000 !important; font-size: 13px !important; line-height: 1.2 !important; }
.sp-bb-balao table { margin-bottom: 0 !important; border: 1px solid #eee !important; }
#fldAssuntos table.infraTable { display: table !important; }

#fldAcoes.sp-bb-balao center { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; text-align: left !important; }
#fldAcoes.sp-bb-balao .infraButton { display: inline-flex !important; align-items: center !important; justify-content: flex-start !important; flex: 0 0 calc(25% - 6px) !important; min-height: 42px !important; margin: 0 !important; padding: 6px 10px !important; box-sizing: border-box !important; border: 1px solid #e0e0e0 !important; border-radius: 6px !important; background: #fdfdfd !important; color: #333 !important; font-size: 12px !important; font-weight: 500 !important; white-space: normal !important; line-height: 1.2 !important; }
#fldAcoes.sp-bb-balao .infraButton:hover { background: #f1f8ff !important; border-color: #007ebc !important; color: #007ebc !important; }
#fldAcoes.sp-bb-balao .infraButton img { margin-right: 8px !important; max-width: 14px !important; max-height: 14px !important; }
.sp-bb-divisoria { display: block !important; width: 100% !important; text-align: center !important; margin: 10px 0 5px 0 !important; font-weight: bold !important; color: #007ebc !important; background: #f4f6f8 !important; padding: 8px !important; border-radius: 4px !important; border: 1px dashed #ccc !important; cursor: pointer !important; text-decoration: none !important; }
.sp-bb-divisoria:hover { background: #e9ecef !important; }
.sp-bb-escondido { display: none !important; }
#divAcoesOcultas.sp-bb-mostrar { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important; }

#nav-acoes-processo.sp-bb-balao { width: auto !important; min-width: 500px !important; left: auto !important; right: 0 !important; transform: none !important; }
#nav-acoes-processo ul { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 15px 20px !important; width: 100% !important; padding-top: 10px !important; }
#nav-acoes-processo ul li { margin: 0 !important; width: 100% !important; display: flex !important; flex-direction: column !important; }
#nav-acoes-processo ul li .btn-group { width: 100% !important; display: flex !important; }
#nav-acoes-processo ul li .btn-group a { flex: 1 !important; justify-content: center !important; display: inline-flex !important; align-items: center !important; }
#nav-acoes-processo ul li .btn-group a#btn-preferencias-minutas, #nav-acoes-processo ul li .btn-group a#btn-preferencias-minutas:visited { color: #007bff !important; }
#nav-acoes-processo ul li .btn-group a#btn-preferencias-movimentacao, #nav-acoes-processo ul li .btn-group a#btn-preferencias-movimentacao:visited { color: #28a745 !important; }
#nav-acoes-processo ul li .btn-group a#btn-preferencias-intimacao, #nav-acoes-processo ul li .btn-group a#btn-preferencias-intimacao:visited { color: #dc3545 !important; }
#nav-acoes-processo ul li .btn-group a#btn-preferencias-automatizar, #nav-acoes-processo ul li .btn-group a#btn-preferencias-automatizar:visited { color: #673ab7 !important; }
`;

// O <style> entra assim que existe onde pendurá-lo (o layout que evita pulos vem antes, pelo CSS inicial do host).
let estiloPosto = false;
function porEstilo() {
  if (estiloPosto) return true;
  const raiz = document.head || document.documentElement;
  if (!raiz) return false;
  estiloPosto = true;
  // Diagnóstico: em que fase do carregamento o script começou a agir ('loading' = junto com a chegada do HTML).
  document.documentElement.setAttribute('data-sp-bb-inicio', document.readyState);
  if (document.getElementById('sp-bb-estilo')) return true;
  const estilo = document.createElement('style');
  estilo.id = 'sp-bb-estilo';
  estilo.textContent = CSS;
  raiz.appendChild(estilo);
  return true;
}

let barra = null;                 // contêiner da barra (nasce com os quatro botões assim que há onde colocá-la)
const baloes = [];                // { def, el, gatilho, legend }
const envoltorios = new Map();    // id -> <div> do gatilho (para manter a ordem Assuntos, Informações, Ações, Preferências)
let aberto = null;                // balão aberto agora (no máximo um)

const MARGEM_JANELA = 15;

function fechar(b) {
  b.el.classList.remove('sp-bb-aberto');
  b.el.style.removeProperty('translate');
  b.gatilho.setAttribute('aria-expanded', 'false');
  if (aberto === b) aberto = null;
}

// Mantém o balão inteiro dentro da janela: mede onde ele abriu (centralizado no gatilho, ou à direita nas Preferências) e o
// desloca o mínimo necessário. A borda esquerda tem prioridade quando o balão é mais largo que o espaço.
function posicionar(el) {
  const rect = el.getBoundingClientRect();
  let dx = 0;
  if (rect.right > window.innerWidth - MARGEM_JANELA) dx = (window.innerWidth - MARGEM_JANELA) - rect.right;
  if (rect.left + dx < MARGEM_JANELA) dx = MARGEM_JANELA - rect.left;
  if (dx) el.style.setProperty('translate', Math.round(dx) + 'px 0', 'important');
}

function abrir(b) {
  if (aberto && aberto !== b) fechar(aberto);
  b.el.classList.add('sp-bb-aberto');
  b.gatilho.setAttribute('aria-expanded', 'true');
  aberto = b;
  posicionar(b.el);
  if (b.def.id === 'fldInformacoesAdicionais') {
    // Conteúdo ainda não carregado pelo eproc: o clique na legend nativa o carrega. Sem texto algum = vazio (não depende do tamanho do HTML).
    const conteudo = document.getElementById('fldInformacoesAdicionais_content');
    if (conteudo && !conteudo.textContent.trim()) { if (b.legend) b.legend.click(); }
    else if (conteudo) conteudo.style.display = 'block';
  } else if (b.def.id === 'fldAcoes') {
    const centro = b.el.querySelector('center');
    if (centro) centro.style.display = 'flex';
  }
}

// Onde a barra entra: na linha do título; senão logo depois do Juiz(a); senão na capa; senão antes do primeiro bloco.
function inserirBarra(contenedor) {
  // Preferência: linha do título ("Consulta Processual - Detalhes do Processo"), à direita, no lugar do ícone de ajuda (que fica oculto).
  const linha = document.querySelector('#divInfraBarraLocalizacao > div');
  if (linha) {
    // Enquanto o HTML chega, espera a linha fechar (título e ajuda já dentro dela), senão a barra entraria antes do título.
    if (!chegouInteiro(linha)) return false;
    let slot = document.getElementById('sp-bb-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'sp-bb-slot';
      const ajuda = linha.querySelector(':scope > span.dropleft');
      if (ajuda) { ajuda.classList.add('sp-bb-ajuda-oculta'); ajuda.after(slot); } else linha.appendChild(slot);
    }
    slot.appendChild(contenedor);
    return true;
  }
  const juiz = document.querySelector('div[aria-label="Juiz(a)"]');
  if (juiz && juiz.parentNode) {
    if (!chegouInteiro(juiz)) return false;
    // Alinha ao centro, na mesma linha, o Juiz(a) e a barra.
    juiz.parentNode.style.display = 'flex';
    juiz.parentNode.style.alignItems = 'center';
    juiz.parentNode.style.flexWrap = 'wrap';
    juiz.parentNode.insertBefore(contenedor, juiz.nextSibling);
    return true;
  }
  // Sem linha do título nem Juiz(a): só decide com o HTML inteiro (antes disso eles ainda podem chegar).
  if (document.readyState === 'loading') return false;
  const primeiro = DEFS.map(d => document.getElementById(d.id)).find(Boolean);
  if (!primeiro) return false;
  const capa = document.getElementById('divCapaProcesso');
  if (capa && !primeiro.contains(capa)) capa.appendChild(contenedor); else primeiro.before(contenedor);
  return true;
}

// Ações: "Demais ações" / "Ocultar" viram botões que mostram e escondem o bloco de ações menos usadas.
function ajustarDemaisAcoes() {
  const demais = document.getElementById('lblDemaisAcoes');
  const ocultar = document.getElementById('lblOcultarAcoes');
  const ocultas = document.getElementById('divAcoesOcultas');
  if (!demais || !ocultar || !ocultas) return;
  demais.removeAttribute('onclick'); ocultar.removeAttribute('onclick');
  demais.classList.add('sp-bb-divisoria'); ocultar.classList.add('sp-bb-divisoria', 'sp-bb-escondido'); ocultas.classList.add('sp-bb-escondido');
  demais.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    ocultas.classList.remove('sp-bb-escondido'); ocultas.classList.add('sp-bb-mostrar');
    demais.classList.add('sp-bb-escondido'); ocultar.classList.remove('sp-bb-escondido');
  });
  ocultar.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    ocultas.classList.add('sp-bb-escondido'); ocultas.classList.remove('sp-bb-mostrar');
    demais.classList.remove('sp-bb-escondido'); ocultar.classList.add('sp-bb-escondido');
  });
}

// Preferências: os links data-toggle="collapse" dependem do bootstrap da página (mundo principal). Este módulo roda em mundo
// isolado, sem o jQuery da página: o bootstrap nativo reage ao clique (ouvinte delegado no document) e, só se ele não reagir
// em 60 ms, o colapso é feito direto pelo DOM. "Automatizar" alterna pelo onclick inline da página.
function ligarPreferencias(el) {
  el.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const alvoId = link.getAttribute('href');
    const painel = alvoId && alvoId.length > 1 ? document.getElementById(alvoId.slice(1)) : null;
    if (!painel) return;
    e.preventDefault(); // evita salto/alteração de hash
    if (link.id.includes('automatizar')) { e.stopPropagation(); return; }
    if (link.getAttribute('data-toggle') !== 'collapse') return;
    const estavaAberto = painel.classList.contains('show');
    setTimeout(() => {
      if (painel.classList.contains('collapsing') || painel.classList.contains('show') !== estavaAberto) return; // o bootstrap reagiu
      const abrirPainel = !estavaAberto;
      painel.classList.add('collapse');
      painel.classList.toggle('show', abrirPainel);
      link.setAttribute('aria-expanded', String(abrirPainel));
      link.classList.toggle('collapsed', !abrirPainel);
    }, 60);
  });
}

// Cria o botão de um bloco, ainda sem conteúdo. Os quatro nascem juntos, com a barra; o bloco entra depois (adotar).
function criarGatilho(def) {
  const envoltorio = document.createElement('div');
  envoltorio.style.cssText = 'position:relative;display:inline-flex;align-items:stretch';
  const gatilho = document.createElement('button');
  gatilho.type = 'button';
  gatilho.className = 'sp-bb-gatilho';
  gatilho.setAttribute('aria-expanded', 'false');
  gatilho.setAttribute('aria-controls', def.id);
  const texto = document.createElement('span'); texto.className = 'sp-bb-texto'; texto.textContent = def.texto;
  gatilho.append(texto);
  envoltorio.appendChild(gatilho);
  envoltorios.set(def.id, envoltorio);
  barra.appendChild(envoltorio);
  // Sem bloco adotado ainda, o clique e o hover não fazem nada.
  const balao = () => baloes.find(x => x.def === def);
  gatilho.addEventListener('click', () => { const b = balao(); if (!b) return; if (aberto === b) fechar(b); else abrir(b); });
  let temporizador = null;
  gatilho.addEventListener('mouseenter', () => { temporizador = setTimeout(() => { const b = balao(); if (b && aberto !== b) abrir(b); }, HOVER_MS); });
  gatilho.addEventListener('mouseleave', () => clearTimeout(temporizador));
}

// O bloco está inteiro no DOM? Enquanto o HTML chega, só depois que o parser já passou dele (existe algo depois dele).
function chegouInteiro(el) {
  if (document.readyState !== 'loading') return true;
  for (let n = el; n && n !== document.documentElement; n = n.parentNode) if (n.nextSibling) return true;
  return false;
}

// Põe o bloco nativo dentro do botão já criado. Até aqui ele esteve oculto pelo CSS inicial; nunca aparece no lugar original.
function adotar(def) {
  const el = document.getElementById(def.id);
  if (!el || !chegouInteiro(el)) return false;
  // Só os filhos diretos da legend (links, botões e textos de ação do bloco) vão para o cabeçalho do balão.
  const legend = el.tagName === 'FIELDSET' ? el.querySelector(':scope > legend') : null;
  const cabecalho = document.createElement('div');
  cabecalho.className = 'sp-bb-cabecalho';
  if (legend) {
    for (const filho of Array.from(legend.children)) if (filho.matches('a, button, span')) cabecalho.appendChild(filho);
    legend.style.display = 'none';
  } else {
    const titulo = document.createElement('span');
    titulo.style.cssText = 'font-weight:bold;font-size:14px;color:#333';
    titulo.textContent = def.texto;
    cabecalho.appendChild(titulo);
    el.classList.remove('mt-3', 'row', 'justify-content-between');
    el.style.display = 'block';
  }
  el.insertBefore(cabecalho, el.firstChild);

  const envoltorio = envoltorios.get(def.id);
  const gatilho = envoltorio.querySelector('.sp-bb-gatilho');
  envoltorio.classList.remove('sp-bb-sem-bloco');
  el.parentNode.removeChild(el);
  envoltorio.appendChild(el);
  el.classList.add('sp-bb-balao');

  const b = { def, el, gatilho, legend };
  baloes.push(b);
  if (def.id === ID_PREFERENCIAS) ligarPreferencias(el);
  if (def.id === 'fldAcoes') ajustarDemaisAcoes();
  // Em Informações, "Editar" fecha o balão (a edição acontece na própria página).
  cabecalho.addEventListener('click', (e) => {
    if (def.id !== 'fldInformacoesAdicionais') return;
    const clicado = e.target.closest('a, button');
    if (clicado && clicado.textContent.toLowerCase().includes('editar')) fechar(b);
  });
  return true;
}

// Roda a cada pedaço de HTML que chega. A barra nasce com os quatro botões assim que existe onde colocá-la (a linha do título é
// das primeiras coisas da página); cada bloco entra no seu botão quando chega inteiro. Devolve true quando os quatro entraram.
function montar() {
  if (!porEstilo()) return false;
  if (!barra) {
    const nova = document.createElement('div');
    nova.className = 'sp-bb-barra col-auto mr-2';
    if (!inserirBarra(nova)) return false;
    barra = nova;
    for (const d of DEFS) criarGatilho(d);
  }
  for (const d of DEFS) if (!baloes.some(x => x.def === d)) adotar(d);
  // HTML inteiro e o bloco não veio (página sem ele): o botão sai da vista; volta se o eproc montar o bloco depois.
  if (document.readyState !== 'loading') for (const d of DEFS) envoltorios.get(d.id).classList.toggle('sp-bb-sem-bloco', !baloes.some(x => x.def === d));
  return baloes.length === DEFS.length;
}

// Um ouvinte de clique e um de teclado para a página toda; saem na hora quando nenhum balão está aberto.
document.addEventListener('click', (e) => {
  if (!aberto) return;
  if (e.target && e.target.closest && e.target.closest('.sp-bb-barra, .sp-bb-balao')) return;
  fechar(aberto);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !aberto) return;
  const b = aberto;
  fechar(b);
  b.gatilho.focus();
});

// Tenta já e a cada mudança do DOM, na hora (sem temporizador: o que o parser acabou de inserir é tratado antes do próximo
// desenho). Vai até os quatro blocos entrarem ou, no máximo, 15 s depois do fim do carregamento.
if (!montar()) {
  let teto = null;
  const observador = new MutationObserver(() => {
    const completo = montar();
    observador.takeRecords(); // descarta o que a própria montagem moveu
    if (completo) { observador.disconnect(); clearTimeout(teto); }
  });
  observador.observe(document, { childList: true, subtree: true });
  // No teto, o que não chegou fica no lugar original: .sp-bb-desistiu solta a ocultação do CSS inicial (barra-botoes-capa-cedo.css).
  const fim = () => { montar(); teto = setTimeout(() => { observador.disconnect(); if (document.documentElement) document.documentElement.classList.add('sp-bb-desistiu'); }, TETO_OBSERVADOR_MS); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fim, { once: true }); else fim();
}
