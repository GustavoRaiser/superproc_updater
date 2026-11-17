'use strict';
/**
 * Página do catálogo de leis, aberta no painel lateral do acesso rápido (`superproc-lei://catalogo/`).
 * Conversa com o processo principal só por `fetch` same-origin em `/api/*` (ver visualizador.js).
 * Pesquisar não baixa nada: baixar e adicionar ao acesso rápido são ações explícitas.
 */
const CSS = `
:root{color-scheme:dark;--bg:#1b2230;--card:#232c3d;--borda:#34415a;--txt:#e6ebf3;--mudo:#9aa8bd;--azul:#0b6bcb;--ok:#5fd17a;--erro:#ff8a80}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font:13px/1.45 "Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;height:100vh}
header{padding:12px 14px 8px}
h1{margin:0 0 8px;font-size:15px}
input[type=search]{width:100%;padding:9px 10px;background:#121823;border:1px solid var(--borda);color:var(--txt);font:inherit}
input[type=search]:focus-visible,button:focus-visible{outline:2px solid #4d9bf0;outline-offset:1px}
#ajuda{margin:8px 0 0;color:var(--mudo);font-size:12px}
#lista{list-style:none;margin:0;padding:0;flex:1;overflow-y:auto;border-top:1px solid var(--borda)}
#lista:empty::before{content:attr(data-vazio);display:block;padding:16px 14px;color:var(--mudo);font-size:12px}
.item{padding:10px 14px;border-bottom:1px solid var(--borda)}
.titulo{font-weight:600;color:#fff;user-select:text}
.ementa{color:var(--mudo);font-size:12px;margin:2px 0 6px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;user-select:text}
.selos{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.selo{font-size:12px;padding:3px 8px;border:1px solid var(--borda);color:#aab7c8}
.selo.ok{border-color:var(--ok);color:var(--ok)}
.acoes{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;font-size:12px;padding:6px 10px;background:var(--card);border:1px solid var(--borda);color:var(--txt);cursor:pointer}
button.primario{background:var(--azul);border-color:var(--azul);color:#fff}
button:hover:not(:disabled){filter:brightness(1.15)}
button:disabled{opacity:.55;cursor:default}
footer{border-top:1px solid var(--borda);padding:8px 14px;display:flex;flex-direction:column;gap:6px}
#status{min-height:18px;font-size:12px;color:var(--mudo)}
#status.erro{color:var(--erro)}
`;

const JS = `
(() => {
  const campo = document.getElementById('busca'), lista = document.getElementById('lista'), status = document.getElementById('status');
  const ajuda = document.getElementById('ajuda'), migrar = document.getElementById('migrar');
  const INICIAL = 'Digite acima para pesquisar. Exemplos: “lei 8078/90”, “cpc”, “código civil”, “dl 2848”.';
  const SEM_RESULTADO = 'Nenhuma norma encontrada no catálogo. Tente outro número/ano ou parte do nome (decretos anteriores a 1988: informe número e ano, como “decreto 20910/1932”). Para páginas internas, cadastre o link em Configurar Acesso Rápido.';
  lista.dataset.vazio = INICIAL;
  const dizer = (t, erro) => { status.textContent = t; status.classList.toggle('erro', !!erro); };
  const chamar = async (rota, corpo) => {
    const r = await fetch('/api/' + rota, corpo === undefined
      ? { headers: { 'x-superproc': 'catalogo' } }
      : { method: 'POST', headers: { 'x-superproc': 'catalogo', 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  };
  const selo = (t, ok) => { const s = document.createElement('span'); s.className = 'selo' + (ok ? ' ok' : ''); s.textContent = t; return s; };
  let ultimos = [];
  function desenhar() {
    lista.replaceChildren();
    for (const r of ultimos) {
      const li = document.createElement('li'); li.className = 'item'; li.dataset.urn = r.urn;
      const t = document.createElement('div'); t.className = 'titulo'; t.textContent = r.titulo;
      const e = document.createElement('div'); e.className = 'ementa'; e.textContent = r.ementa || '(sem ementa)'; e.title = r.ementa || '';
      const selos = document.createElement('div'); selos.className = 'selos'; selos.append(selo(r.tipo, false));
      if (r.baixada) selos.append(selo('Baixada', true));
      if (r.fixada) selos.append(selo('No acesso rápido', true));
      const acoes = document.createElement('div'); acoes.className = 'acoes';
      const ler = document.createElement('button'); ler.type = 'button'; ler.className = 'primario'; ler.textContent = 'Ler';
      ler.setAttribute('aria-label', 'Ler: ' + r.titulo); ler.addEventListener('click', () => { location.href = 'superproc-lei://norma/' + r.slug; });
      const add = document.createElement('button'); add.type = 'button'; add.className = r.baixada ? '' : 'primario';
      add.textContent = r.fixada ? 'Já no acesso rápido' : 'Adicionar ao acesso rápido'; add.disabled = !!r.fixada;
      add.setAttribute('aria-label', add.textContent + ': ' + r.titulo);
      const bx = document.createElement('button'); bx.type = 'button';
      bx.textContent = r.baixada ? 'Reconferir cópia' : 'Só baixar'; bx.setAttribute('aria-label', bx.textContent + ': ' + r.titulo);
      const travar = (v) => { add.disabled = v || !!r.fixada; bx.disabled = v; };
      add.addEventListener('click', async () => {
        travar(true); dizer('Baixando e adicionando… isto pode levar alguns segundos.');
        try {
          const x = await chamar('adicionar', { urn: r.urn });
          if (!x.ok) { dizer(x.motivo || 'Não foi possível adicionar esta norma.', true); travar(false); return; }
          r.baixada = true; r.fixada = true;
          dizer(x.jaEstava ? 'Esta norma já estava no acesso rápido.' : '✓ Adicionada ao acesso rápido (cópia local pronta para uso sem internet).');
          redesenhar(r.urn);
        } catch { dizer('Falha ao adicionar a norma.', true); travar(false); }
      });
      bx.addEventListener('click', async () => {
        travar(true); dizer('Baixando…');
        try {
          const x = await chamar('baixar', { urn: r.urn });
          if (!x.ok) { dizer(x.motivo || 'Não foi possível baixar esta norma.', true); travar(false); return; }
          r.baixada = true; dizer('✓ Cópia local pronta. Ela ainda não está no acesso rápido.'); redesenhar(r.urn);
        } catch { dizer('Falha ao baixar a norma.', true); travar(false); }
      });
      if (r.baixada) acoes.append(ler); acoes.append(add, bx); li.append(t, e, selos, acoes); lista.append(li);
    }
  }
  function redesenhar(urn) {
    desenhar();
    // Botão desabilitado não recebe foco: vai para o primeiro botão ainda disponível do item (ou para a busca).
    (lista.querySelector('[data-urn="' + CSS.escape(urn) + '"] button:not(:disabled)') || campo).focus();
  }
  let tempo = null, seq = 0;
  // Sem pesquisa, mostra as normas já baixadas: dá para ler direto, sem passar pelo acesso rápido.
  async function mostrarBiblioteca(minha) {
    try {
      const r = await chamar('biblioteca');
      if (minha !== seq) return;
      ultimos = r.resultados || []; desenhar();
      lista.dataset.vazio = INICIAL; ajuda.hidden = false;
      dizer(ultimos.length ? ultimos.length + ' norma(s) baixada(s) neste computador. Clique em “Ler” para abrir.' : '');
    } catch { if (minha === seq) { ultimos = []; desenhar(); lista.dataset.vazio = INICIAL; dizer(''); } }
  }
  async function pesquisar() {
    const texto = campo.value.trim(), minha = ++seq;
    if (texto.length < 2) { await mostrarBiblioteca(minha); return; }
    try {
      const r = await chamar('buscar?q=' + encodeURIComponent(texto));
      if (minha !== seq) return;
      ultimos = r.resultados || []; desenhar(); ajuda.hidden = ultimos.length > 0;
      if (!ultimos.length) lista.dataset.vazio = SEM_RESULTADO;
      if (r.aviso && !ultimos.length) dizer(r.aviso, true);
      else dizer(ultimos.length ? ultimos.length + ' resultado(s)' + (r.reconhecido ? ' — endereço reconhecido (' + r.reconhecido + ')' : '') + '. Nada foi baixado.' : '');
    } catch { if (minha === seq) dizer('Não foi possível consultar o catálogo local.', true); }
  }
  campo.addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(pesquisar, 250); });
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(tempo); pesquisar(); } });
  migrar.addEventListener('click', async () => {
    migrar.disabled = true; dizer('Baixando as cópias locais dos links do Planalto… pode demorar um pouco.');
    try {
      const rel = await chamar('migrar', {});
      const ok = rel.filter(x => x.resultado === 'convertido').length, sobra = rel.length - ok;
      dizer(rel.length ? ok + ' link(s) agora usam a cópia local' + (sobra ? '; ' + sobra + ' continuam como estavam (não identificados ou sem texto na fonte)' : '') + '.' : 'Nenhum link do Planalto para converter.', ok === 0 && sobra > 0);
    } catch { dizer('Falha ao converter os links do Planalto.', true); }
    migrar.disabled = false;
  });
  campo.focus();
  mostrarBiblioteca(seq);
})();
`;

function paginaCatalogo() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catálogo de leis</title><style>${CSS}</style></head><body>
<header><h1>Catálogo de leis</h1>
<input type="search" id="busca" aria-label="Pesquisar no catálogo local" placeholder="Ex.: lei 8.078/90, CPC, código civil — ou cole um endereço do Planalto" autocomplete="off" spellcheck="false">
<p id="ajuda">Abaixo, as normas já baixadas. Pesquisar não baixa nada: a norma só é baixada quando você clicar em “Adicionar” ou “Só baixar”.</p></header>
<ul id="lista" aria-label="Resultados da pesquisa"></ul>
<footer><div id="status" role="status" aria-live="polite"></div>
<button type="button" id="migrar" title="Troca os links do Planalto já cadastrados por cópias locais; a URL original fica guardada">Usar cópias locais nos links do Planalto</button></footer>
<script>${JS}</script></body></html>`;
}

module.exports = { paginaCatalogo };
