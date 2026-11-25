// SuperPROC Browser - Preload para Abas de Navegação
// Executado no início de cada página antes dos scripts da web (document_start)

(function() {
  try {
    // O preload também é carregado nos iframes. Hashes de iframes do eProc
    // pertencem àquele documento e não podem atualizar a sessão da aba.
    if (!process.isMainFrame) return;

    let currentKnownHash = '';

    // 0. Início/Meus Localizadores na barra (botoes-eproc-barra.js): com a chave ligada, o host deixa uma marca no
    // localStorage do eproc. Aqui, antes de qualquer desenho, o CSS já esconde tudo o que for construído com a
    // identificação desses botões, então eles nunca aparecem na página, nem por um instante. A chave desligada apaga a marca.
    try {
      if (/eproc/i.test(window.location.hostname) && localStorage.getItem('__superproc_botoes_eproc_barra') === '1') {
        const css = '#btn-home, #btn-meus-localizadores { display: none !important; }'
          + ' div:has(> #btn-home):has(> #btn-meus-localizadores) { display: none !important; }';
        const injetar = () => {
          if (document.getElementById('sp-botoes-eproc-barra-cedo')) return true;
          const raiz = document.head || document.documentElement;
          if (!raiz) return false;
          const st = document.createElement('style');
          st.id = 'sp-botoes-eproc-barra-cedo';
          st.textContent = css;
          raiz.appendChild(st);
          return true;
        };
        if (!injetar()) {
          const obs = new MutationObserver(() => { if (injetar()) obs.disconnect(); });
          obs.observe(document, { childList: true, subtree: true });
        }
      }
    } catch (_) {}

    // 0b. Módulos que o navegador controla (eproc-recursos.js): publica cedo, com os mesmos ids dos módulos da extensão,
    // em <html data-superproc-navegador-modulos>. Uma versão futura da extensão poderá ler a marca e mostrar
    // "CONTROLADO PELO NAVEGADOR" nesses módulos. O host atualiza a lista a cada carga conforme as chaves.
    try {
      if (/eproc/i.test(window.location.hostname)) {
        const lista = JSON.parse(localStorage.getItem('__superproc_navegador_modulos') || '[]');
        if (Array.isArray(lista) && lista.length) {
          const marcar = () => {
            if (!document.documentElement) return false;
            document.documentElement.setAttribute('data-superproc-navegador-modulos', lista.filter(m => typeof m === 'string').join(' '));
            return true;
          };
          if (!marcar()) {
            const obs = new MutationObserver(() => { if (marcar()) obs.disconnect(); });
            obs.observe(document, { childList: true });
          }
        }
        // Pedido de abrir o Organizador do navegador (botões Organizar dos recursos; detail 'loc' ou 'evt').
        window.addEventListener('superproc:organizador-abrir', (e) => {
          try { require('electron').ipcRenderer.send('superproc:organizador-navegador', e.detail === 'evt' ? 'evt' : 'loc'); } catch (_) {}
        });
      }
    } catch (_) {}

    // 1. Ocultar sinais de automação no DOM do navegador
    if (navigator.webdriver !== undefined) {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });
    }

    // 4. Capturar e memorizar o hash de sessão ativo do Eproc e links inteligentes
    function checkEprocSession() {
      try {
        if (!window.location.hostname.includes('eproc')) return;

        const urlParams = new URLSearchParams(window.location.search);
        let hash = urlParams.get('hash') || '';

        const btnHome = document.querySelector('#btn-home');
        const btnLoc = document.querySelector('#btn-meus-localizadores');

        const homeHref = btnHome ? btnHome.getAttribute('href') : '';
        const locHref = btnLoc ? btnLoc.getAttribute('href') : '';

        if (!hash && homeHref) {
          const m = homeHref.match(/hash=([a-f0-9]+)/i);
          if (m) hash = m[1];
        }
        if (!hash && locHref) {
          const m = locHref.match(/hash=([a-f0-9]+)/i);
          if (m) hash = m[1];
        }
        if (!hash) {
          const anyHashLink = document.querySelector('a[href*="hash="]');
          if (anyHashLink) {
            const m = anyHashLink.getAttribute('href')?.match(/hash=([a-f0-9]+)/i);
            if (m) hash = m[1];
          }
        }

        if (hash) {
          currentKnownHash = hash;
          window._superprocHash = hash;
        }

        if (hash || homeHref || locHref) {
          require('electron').ipcRenderer.send('superproc:eproc-session', { homeHref, locHref });
        }
      } catch (_) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkEprocSession);
    } else {
      checkEprocSession();
    }
    window.addEventListener('load', checkEprocSession);

    // 6. Monitorar e reportar a largura exata da página/navbar para alinhamento pixel-perfect do gradiente
    function reportNavbarWidth() {
      try {
        const el = document.querySelector('#navbar') || 
                   document.querySelector('.navbar') || 
                   document.querySelector('nav') ||
                   document.querySelector('#divBarraComandosSuperior');
        const width = el ? Math.round(el.getBoundingClientRect().width) : (document.documentElement ? document.documentElement.clientWidth : window.innerWidth);
        if (width > 50) {
          const { ipcRenderer } = require('electron');
          ipcRenderer.send('page-navbar-dimension', width);
        }
      } catch (_) {}
    }

    window.addEventListener('resize', reportNavbarWidth);
    if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
      const ro = new ResizeObserver(() => {
        reportNavbarWidth();
      });
      ro.observe(document.documentElement);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', reportNavbarWidth);
    } else {
      reportNavbarWidth();
    }
    window.addEventListener('load', reportNavbarWidth);

    // 8. Resiliência Total para Abertura da Árvore do Processo (AZflow / Eproc)
    function setupTreeButtonInterceptor() {
      try {
        const { ipcRenderer } = require('electron');

        const seletorArvore = 'a[href*="arvore_documento_listar"], a[href*="acao=processo_consultar_arvore"]';
        const resolverUrl = (href) => {
          if (!href) return null;
          try {
            const url = new URL(href, document.baseURI);
            return ['http:', 'https:'].includes(url.protocol) ? url : null;
          } catch (_) { return null; }
        };
        const acaoDaArvore = (url) => ['arvore_documento_listar', 'processo_consultar_arvore', 'acessar_documento']
          .includes(url?.searchParams.get('acao'));

        document.addEventListener('click', function(e) {
          if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          const treeBtn = e.target.closest?.([
            '#azflow-minuta-arvore-btn',
            '#azflow-cke-arvore-btn',
            '.azflow-listaprocloc-tree-btn',
            '.azflow-cke-arvore-btn',
            '.azflow-extra-editor-preview-tree',
            seletorArvore,
            '[data-azflow-arvore-url]',
            '[data-tree-url]'
          ].join(','));
          if (!treeBtn) return;

          const href = resolverUrl(treeBtn.getAttribute('href'));
          // Remessas mantêm o fluxo nativo do eproc, inclusive quando abrem um contexto novo.
          if (href?.searchParams.get('acao') === 'processo_consultar_arvore_sistema_externo') return;
          const dados = resolverUrl(treeBtn.dataset.azflowArvoreUrl || treeBtn.dataset.treeUrl);
          let destino = acaoDaArvore(href) ? href : dados;
          if (!destino) {
            // A primeira árvore do documento pode ser de um relacionado em outro grau.
            const escopo = treeBtn.classList.contains('azflow-listaprocloc-tree-btn')
              ? treeBtn.closest('tr') : document.getElementById('fldAcoes');
            destino = resolverUrl(escopo?.querySelector(seletorArvore)?.getAttribute('href'));
          }
          if (!acaoDaArvore(destino) || destino.origin !== window.location.origin) return;
          e.preventDefault();
          e.stopPropagation();
          ipcRenderer.send('tab-open-process-url', destino.href);
        }, true);

        // window.open fica nativo: _self/nome da janela preservam a intenção
        // de substituir o conteúdo, e novos contextos passam pelo gestor main.
      } catch (_) {}
    }

    setupTreeButtonInterceptor();

    // 9. Interceptar window.close() para garantir o fechamento isolado da respectiva sub-aba
    function setupCloseInterceptor() {
      try {
        const { ipcRenderer } = require('electron');

        // Receber notificação de fechamento e atualização vinda do Main World
        if (!window._superprocCloseListenerAdded) {
          window._superprocCloseListenerAdded = true;
          window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SUPERPROC_CLOSE_CURRENT_SUBTAB') {
              try {
                ipcRenderer.send('tab-page-close-request');
              } catch (_) {}
            }
            if (event.data && event.data.type === 'SUPERPROC_REFRESH_PARENT_TAB') {
              try {
                ipcRenderer.send('tab-refresh-parent-request');
              } catch (_) {}
            }
          });
        }

        // Contexto isolado do preload: nunca propaga o fechamento ao Chromium.
        // Ele apenas pede ao processo principal para interpretar a origem.
        try {
          Object.defineProperty(window, 'close', {
            value: () => ipcRenderer.send('tab-page-close-request'),
            configurable: false,
            writable: false
          });
        } catch (_) {}

        // Contexto principal (DOM / Main World) para scripts nativos do Eproc, CKEditor e extensões
        const script = document.createElement('script');
        script.textContent = `
          (function() {
            try {
              function notifyAndCloseSubTab() {
                console.log('[SuperPROC] Interceptada ordem de fechar janela/sub-aba (window.close).');
                try {
                  window.postMessage({ type: 'SUPERPROC_CLOSE_CURRENT_SUBTAB' }, '*');
                } catch (_) {}
              }

              // Barreira definitiva: o EPROC pode tentar substituir window.close
              // depois de carregar seus scripts. A propriedade não pode mais ser
              // reatribuída; toda tentativa vira somente uma mensagem interna.
              function lockClose(target) {
                try {
                  Object.defineProperty(target, 'close', {
                    value: notifyAndCloseSubTab,
                    configurable: false,
                    writable: false
                  });
                } catch (_) {
                  try { target.close = notifyAndCloseSubTab; } catch (_) {}
                }
              }
              lockClose(window);
              try { lockClose(self); } catch (_) {}
              try { if (top === window) lockClose(top); } catch (_) {}
              try { if (parent === window) lockClose(parent); } catch (_) {}

              // Não emular window.opener. Uma WebContentsView não tem uma
              // janela-opener real; fornecer um objeto parcial faz o eProc
              // acreditar que há outro contexto de navegação e altera fluxos
              // internos de perfil/minuta. O agrupamento é responsabilidade
              // do processo principal, não do DOM da aplicação judicial.

            } catch (_) {}
          })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (_) {}
    }

    setupCloseInterceptor();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupCloseInterceptor);
    }

  } catch (err) {
    console.error('[SuperPROC tab-preload] Erro na inicialização:', err);
  }
})();
