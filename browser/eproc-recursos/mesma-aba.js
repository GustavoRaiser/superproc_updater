// Links na mesma aba (camada: host; mundo isolado 1107). Mesma regra de "Links do painel na mesma aba" (painel-livre.js), para
// páginas cujos ícones abrem outra aba/janela: hoje, as telas minuta/minuta_visualizacao/* (painel da minuta: "Editar minuta",
// "Imprimir minuta" etc. usam onclick="window.open('controlador.php?...')").
//
// Clique simples abre na própria aba; Ctrl/Shift/Alt/clique do meio seguem abrindo em aba nova, como o eproc faz. Só destinos
// do próprio eproc (mesma origem, controlador.php); links externos não são tocados.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.

if (window.__spMesmaAba) return;
window.__spMesmaAba = true;

function urlDoWindowOpen(texto) {
  const m = /window\.open\(\s*['"]([^'"]+)['"]/.exec(texto || '');
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function doEproc(destino) {
  try {
    const u = new URL(destino, location.href);
    return u.origin === location.origin && /controlador\.php$/i.test(u.pathname) ? u.href : null;
  } catch (_) { return null; }
}

function abrirNaMesmaAba(e) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
  const link = e.target && e.target.closest && e.target.closest('a');
  // Como no painel, só o conteúdo da página: o cabeçalho e o menu lateral do eproc ficam como estão.
  if (!link || link.closest('.navbar-wrapper, #sidebar-wrapper, nav')) return;
  const href = link.getAttribute('href') || '';
  let destino = urlDoWindowOpen(link.getAttribute('onclick')) || (href.startsWith('javascript:') ? urlDoWindowOpen(href) : null);
  if (!destino && link.target === '_blank' && href && !href.startsWith('javascript:') && !href.startsWith('#')) destino = href;
  destino = destino && doEproc(destino);
  if (!destino) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  location.href = destino;
}

// Captura no document: roda antes do onclick do próprio link (que chamaria window.open).
document.addEventListener('click', abrirNaMesmaAba, true);
