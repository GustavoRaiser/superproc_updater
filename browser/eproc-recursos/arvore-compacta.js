// Árvore - Botões Compactos e Largura Memorizada (camada: host; mundo isolado 1110, só na árvore de documentos).
// Chave em CFG > Configurações ("Árvore - Botões Compactos e Largura Memorizada", arvoreCompacta). Parte nativa do módulo da extensão (extensao-superproc/modules/arvore/arvore_compacta.js):
// mesmo comportamento e mesmos dados (localStorage do eproc). Se a extensão também estiver instalada, o navegador publica o id do
// módulo em <html data-superproc-navegador-modulos> e a extensão fica parada (CONTROLADO PELO NAVEGADOR): nada duplica.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spArvoreCompacta) return;
window.__spArvoreCompacta = true;
if (!["arvore_documento_listar"].includes(new URLSearchParams(location.search).get('acao'))) return;

// SuperPROC - Módulo: Árvore Compacta
// 1) Botões em lote da árvore (Marcar/Desmarcar todos, Versão p/ impressão, Download) só com ícones, sem texto.
// 2) Memoriza a largura do painel da árvore (#divMenuArvore): ao redimensionar, grava; ao abrir a árvore, restaura.
// 
// Convive com o AZflow: ele respeita data-azflow-menu-arvore-user-resized="1" e não reaplica a largura padrão.


const ID_MODULO = 'arvore_compacta';
const LARGURA_MIN = 200;   // abaixo disso é considerado recolhido/inválido: não grava
const LARGURA_MAX = 2400;
const STYLE_ID = 'superproc-arvore-compacta-css';

const CSS = `
/* Botões em lote: só o ícone, menores e alinhados à esquerda. O texto (e os <br>) somem com font-size 0; o ícone SVG e o contador de bytes mantêm tamanho próprio. */
#divMenuArvore #divOpcoesDocumentos .divBotoes:has(> a.btnGrande),
#divMenuArvore .azflow-arvore-acoes-lote {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
  flex-wrap: nowrap !important;
  gap: var(--sp-gap, 6px) !important;
  padding-left: var(--sp-left, 0px) !important;
  height: auto !important;
  min-height: 0 !important;
  padding-top: 2px !important;
  padding-bottom: 2px !important;
  margin: 0 !important;
}
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande,
#divMenuArvore .azflow-arvore-acoes-lote > a.btnGrande {
  font-size: 0 !important;
  line-height: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 3px !important;
  box-sizing: border-box !important;
  width: auto !important;
  min-width: var(--sp-w, 32px) !important;
  height: var(--sp-h, 30px) !important;
  min-height: 0 !important;
  max-height: var(--sp-h, 30px) !important;
  margin: 0 !important;
  padding: 0 4px !important;
  white-space: nowrap !important;
}
/* Linha de cima (☑ ⌕ > paleta): todos os botões iguais (27x27), na mesma linha de base e com o MESMO espaço (9px) entre eles.
   Antes o espaço vinha de espaços em branco do HTML (inline) e de margens diferentes, e o ">" tinha largura própria. */
#divMenuArvore #divIntervaloEvento {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  flex-wrap: nowrap !important;
  gap: 9px !important;
}
#divMenuArvore #divIntervaloEvento > a.azflow-tree-interval-btn {
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 0 27px !important;
  width: 27px !important;
  min-width: 27px !important;
  height: 27px !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1 !important;
  vertical-align: middle !important;
}
#divMenuArvore #divIntervaloEvento > a.azflow-tree-interval-btn .azflow-tree-interval-text,
#divMenuArvore #divIntervaloEvento > a.azflow-tree-interval-btn .btn-text {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
}
/* Botão da paleta de cores: quadrado como os vizinhos (27px), sem o recuo lateral que o alargava. */
#divMenuArvore #btn-abrir-paleta-arvore {
  width: 27px !important;
  min-width: 27px !important;
  padding: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}
/* Caixa azul escura (rodapé da árvore): sem folgas, só a altura dos botões. */
#divMenuArvore #divOpcoesDocumentos {
  height: auto !important;
  min-height: 0 !important;
  padding-bottom: 4px !important;
}
#divMenuArvore #divOpcoesDocumentos .separadorIntervaloEvento {
  height: auto !important;
  min-height: 0 !important;
  margin: 2px 0 !important;
  padding: 0 !important;
}
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande br { display: none !important; }
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande .azflow-acoes-lote-svg {
  display: inline-flex !important;
  font-size: 0 !important;
  line-height: 0 !important;
}
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande .azflow-acoes-lote-svg svg {
  width: 15px !important;
  height: 15px !important;
}
/* Sem contador de tamanho (ex.: "115 KB") e sem o alargamento que ele causava: só o ícone. */
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande #spnBytes,
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande > :not(.azflow-acoes-lote-svg):not(img) {
  display: none !important;
}
/* Estado "com bytes" do botão de impressão (classe do AZflow): sem selo/realce rosa nem pseudo-elementos do contador. */
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.azflow-impressao-com-bytes::before,
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.azflow-impressao-com-bytes::after {
  content: none !important;
  display: none !important;
}
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.azflow-impressao-com-bytes {
  box-shadow: none !important;
  outline: 0 !important;
}
#divMenuArvore #divOpcoesDocumentos .divBotoes > a.btnGrande {
  width: var(--sp-w, 27px) !important;
  max-width: var(--sp-w, 27px) !important;
  flex: 0 0 var(--sp-w, 27px) !important;
  overflow: hidden !important;
}
`;

function injetarCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
}

// Sem texto visível, o nome do botão continua acessível por aria-label (já presente na página); garante role/label se faltar.
function garantirRotulosAcessiveis() {
    document.querySelectorAll('#divOpcoesDocumentos .divBotoes > a.btnGrande').forEach((a) => {
        if (!a.getAttribute('aria-label')) {
            const texto = (a.textContent || '').replace(/\s+/g, ' ').trim();
            if (texto) a.setAttribute('aria-label', texto);
        }
    });
}

// Alinha a linha de botões em lote com a linha de cima (☑ ⌕ > paleta): mesmo recuo à esquerda, tamanho e espaçamento.
function alinharComLinhaSuperior() {
    const caixa = document.querySelector('#divMenuArvore #divOpcoesDocumentos .divBotoes:has(> a.btnGrande)');
    const botoesTopo = Array.from(document.querySelectorAll('#divIntervaloEvento > a.azflow-tree-interval-btn'))
        .filter((a) => a.offsetParent !== null);
    // Os botões de cima trazem margin-right:4px !important INLINE (☑ e >) e margin-left:6px (paleta): só outro inline !important vence.
    // Eram esses 4px a mais antes do ⌕ e da paleta que desalinhavam as duas linhas.
    botoesTopo.forEach((a) => { a.style.setProperty('margin', '0', 'important'); });
    if (!caixa || botoesTopo.length < 1) return;
    const primeiro = botoesTopo[0].getBoundingClientRect();
    if (!primeiro.width || !primeiro.height) return;
    const cx = caixa.getBoundingClientRect();
    const estilo = getComputedStyle(caixa);
    const borda = parseFloat(estilo.borderLeftWidth) || 0;
    const left = Math.max(0, Math.round(primeiro.left - cx.left - borda));
    // Espaço fixo (igual ao da linha de cima). Não é medido: margens residuais dos botões somavam ~4px a mais.
    const gap = 9;
    // O AZflow pode pôr margens inline com !important nesses botões; só outro inline !important vence.
    caixa.querySelectorAll(':scope > a.btnGrande').forEach((a) => {
        a.style.setProperty('margin', '0', 'important');
    });
    caixa.style.setProperty('--sp-left', left + 'px');
    caixa.style.setProperty('--sp-gap', gap + 'px');
    caixa.style.setProperty('--sp-w', Math.round(primeiro.width) + 'px');
    caixa.style.setProperty('--sp-h', Math.round(primeiro.height) + 'px');
}

function larguraValida(valor) {
    const n = Math.round(Number(valor));
    return Number.isFinite(n) && n >= LARGURA_MIN && n <= LARGURA_MAX ? n : 0;
}

function aplicarLargura(menu, largura) {
    if (!menu || !largura) return;
    menu.setAttribute('data-azflow-menu-arvore-user-resized', '1');
    menu.setAttribute('data-azflow-menu-arvore-collapsed', '0');
    menu.setAttribute('data-azflow-menu-arvore-default-width', String(largura));
    menu.setAttribute('data-azflow-menu-arvore-last-open-width', String(largura));
    menu.style.minWidth = '';
    menu.style.maxWidth = '';
    menu.style.width = largura + 'px';
    // Avisa quem acompanha a largura (leitor de PDF ao lado, scroll interno etc.).
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
}

// Armazenamento do navegador no lugar do chrome.storage da extensão: a largura fica no localStorage do eproc.
const CHAVE_LARGURA = 'superproc_arvore_compacta_largura_v1';
const storage = {
  async getModuleSettings() { try { return { larguraPx: Number(localStorage.getItem(CHAVE_LARGURA)) || 0 }; } catch (_) { return {}; } },
  setModuleSettings(_id, obj) { try { localStorage.setItem(CHAVE_LARGURA, String(obj.larguraPx)); } catch (_) {} }
};

(async () => {
      injetarCss();
      garantirRotulosAcessiveis();
      window.addEventListener('resize', alinharComLinhaSuperior);
      // A altura da lista da árvore é calculada pela página: pede um recálculo agora que o rodapé encolheu.
      setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }, 400);
  
      let salva = 0;
      try {
          const cfg = await storage.getModuleSettings(ID_MODULO);
          salva = larguraValida(cfg && cfg.larguraPx);
      } catch (_) {}
  
      const salvar = (largura) => {
          const n = larguraValida(largura);
          if (!n || n === salva) return;
          salva = n;
          try { storage.setModuleSettings(ID_MODULO, { larguraPx: n }); } catch (_) {}
      };
  
      let vinculado = false;
      const vincular = (menu) => {
          if (vinculado || !menu) return;
          vinculado = true;
          // Grava ao soltar o mouse depois de arrastar a alça de redimensionamento.
          let arrastando = false;
          menu.addEventListener('mousedown', (ev) => {
              if (ev.target && ev.target.closest && ev.target.closest('.ui-resizable-handle')) arrastando = true;
          }, true);
          document.addEventListener('mouseup', () => {
              if (!arrastando) return;
              arrastando = false;
              // Aguarda o jQuery UI/AZflow fecharem o ajuste e lê a largura final.
              setTimeout(() => {
                  if (menu.getAttribute('data-azflow-menu-arvore-collapsed') === '1') return;
                  salvar(menu.getBoundingClientRect().width);
              }, 60);
          }, true);
      };
  
      const restaurar = () => {
          const menu = document.getElementById('divMenuArvore');
          if (!menu) return false;
          vincular(menu);
          if (salva && menu.getAttribute('data-azflow-menu-arvore-collapsed') !== '1') {
              const atual = Math.round(menu.getBoundingClientRect().width || 0);
              if (Math.abs(atual - salva) > 1) aplicarLargura(menu, salva);
          }
          garantirRotulosAcessiveis();
          alinharComLinhaSuperior();
          return true;
      };
  
      // O painel e os botões podem ser criados/recriados depois do carregamento (AZflow, jQuery UI): reaplica algumas vezes
      // logo após abrir (o AZflow pode impor a largura padrão no começo) e observa o DOM por alguns segundos.
      restaurar();
      [250, 800, 1800, 3500].forEach((ms) => setTimeout(restaurar, ms));
      const obs = new MutationObserver(() => { garantirRotulosAcessiveis(); alinharComLinhaSuperior(); if (!vinculado) restaurar(); });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 10000);
})();
