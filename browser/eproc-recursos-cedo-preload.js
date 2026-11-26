// Preload de sessão (type 'frame'): roda no início de cada documento, antes de o HTML começar a ser lido.
//
// Por que existe: o eproc manda a página em fluxo (medido na capa: ~500 ms entre o primeiro e o último pedaço do HTML) e o
// Chromium desenha cada pedaço assim que chega. Tudo o que o host injeta por executeJavaScript só roda depois do load, isto é,
// depois de a página já ter aparecido do jeito nativo. Daqui, as regras entram antes do primeiro elemento: cada elemento do
// eproc já nasce com o estilo final (ou nem aparece), e os scripts acompanham a chegada do HTML.
//
// Só no quadro principal de páginas do eproc (controlador.php). O host decide o que vale para a URL do quadro que pediu
// (chaves de CFG > Configurações, páginas de exclusão) e devolve:
//   css      texto para webFrame.insertCSS (vale até o documento acabar);
//   estilos  [{ id, css }] como <style id> no documento (o host consegue removê-los depois pelo id);
//   scripts  [{ mundo, codigo }] para rodar no mundo isolado indicado (o mesmo que o host usa; cada script tem guarda própria).
const { ipcRenderer, webFrame } = require('electron');
try {
  if (process.isMainFrame && /^https?:$/.test(location.protocol) && /eproc/i.test(location.hostname) && /controlador\.php$/i.test(location.pathname)) {
    ipcRenderer.invoke('superproc:eproc-cedo').then((r) => {
      if (!r) return;
      if (r.css) webFrame.insertCSS(r.css);
      for (const e of r.estilos || []) porEstilo(e);
      for (const s of r.scripts || []) webFrame.executeJavaScriptInIsolatedWorld(s.mundo, [{ code: s.codigo }]).catch(() => {});
    }).catch(() => {});
  }
} catch (_) { /* sem cedo: o host aplica no dom-ready, como antes */ }

// O <html> pode ainda não existir: espera por ele (chega antes de qualquer elemento visível).
function porEstilo(e) {
  const por = () => {
    const raiz = document.head || document.documentElement;
    if (!raiz) return false;
    if (!document.getElementById(e.id)) { const st = document.createElement('style'); st.id = e.id; st.textContent = e.css; raiz.appendChild(st); }
    return true;
  };
  if (por()) return;
  const obs = new MutationObserver(() => { if (por()) obs.disconnect(); });
  obs.observe(document, { childList: true, subtree: true });
}
