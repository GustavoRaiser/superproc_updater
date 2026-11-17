'use strict';
// Exportador de contexto para o Copilot (host). Ação do usuário (atalho): lê as abas pelo ContextBroker, monta o Markdown e
//  - se couber no campo do chat: copia o texto e usa o comando nativo "colar" na coluna;
//  - se for grande: grava um arquivo .md, copia o arquivo para a área de transferência, tenta colar e revela a pasta,
//    para o usuário anexar pelo "+" do Copilot.
// A página do Copilot não recebe script nem estilo, e nada é enviado sozinho. Logs: só metadados (nunca título, endereço ou texto).
// Dependências injetadas para testar sem Electron.
const core = require('../quick-shortcut-core');
const { montarMarkdown } = require('./markdown');

const ATALHO_ATIVA = Object.freeze({ code: 'KeyK', ctrl: true, alt: false, shift: true, meta: false });
const ATALHO_TODAS = Object.freeze({ code: 'KeyJ', ctrl: true, alt: false, shift: true, meta: false });
const PREFIXO = 'contexto-';
const RE_ARQUIVO = /^contexto-\d{8}-\d{6}\.md$/;
const MOTIVOS = Object.freeze({
  'coluna-indisponivel': 'Abra a coluna do Copilot para compartilhar o contexto.',
  'sem-pagina': 'Nenhuma aba legível para compartilhar.',
  ocupado: 'Já há um compartilhamento em andamento.',
  erro: 'Não foi possível ler as abas.'
});

const dois = (n) => String(n).padStart(2, '0');
const carimbo = (d) => `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;

function criarExportador({
  broker, clipboard, fs, path, pasta, getColunaWc, mostrarColuna = () => {}, copiarArquivo = async () => false, revelar = () => {},
  avisar = () => {}, log = () => {}, agora = () => new Date(), limiteColar = 60000, maxCaracteres = 400000, retencaoMs = 24 * 3600 * 1000
}) {
  let ocupado = false;
  const registrar = (t) => { try { log('COPILOT_CONTEXTO', t); } catch (_) { /* log nunca derruba */ } };

  // Só apaga arquivos que este módulo gerou (nome exato) e mais antigos que a retenção.
  function limparAntigos() {
    try {
      const limite = agora().getTime() - retencaoMs;
      for (const nome of fs.readdirSync(pasta)) {
        if (!RE_ARQUIVO.test(nome)) continue;
        const caminho = path.join(pasta, nome);
        try { if (fs.statSync(caminho).mtimeMs < limite) fs.unlinkSync(caminho); } catch (_) { /* arquivo em uso */ }
      }
    } catch (_) { /* pasta ainda não existe */ }
  }

  async function exportar({ escopo = 'ativa' } = {}) {
    const falha = (motivo) => { registrar('Recusado: ' + motivo); avisar(MOTIVOS[motivo] || MOTIVOS.erro, 'erro'); return { ok: false, motivo }; };
    if (ocupado) return { ok: false, motivo: 'ocupado' };
    ocupado = true;
    try {
      const coluna = getColunaWc();
      if (!coluna || coluna.isDestroyed()) return falha('coluna-indisponivel');

      let tabs = []; let omitidas = 0;
      try {
        if (escopo === 'ativa') {
          const ativa = await broker.getActiveTab();
          if (ativa) tabs = [await broker.readTab(ativa.id)];
        } else {
          const ws = await broker.readAllTabs();
          tabs = ws.tabs.filter((t) => !t.error);
          omitidas = ws.tabs.length - tabs.length;
        }
      } catch (e) { return falha(e && e.codigo === 'UNSUPPORTED_BROWSER_PAGE' ? 'sem-pagina' : 'erro'); }
      if (!tabs.length) return falha('sem-pagina');

      const pequeno = montarMarkdown({ tabs, geradoEm: agora().toISOString(), maxCaracteres, omitidas, perguntaFinal: true });
      const cabe = pequeno.markdown.length <= limiteColar;
      const n = tabs.length;
      const rotulo = `${n} aba${n > 1 ? 's' : ''}`;

      if (cabe) {
        clipboard.writeText(pequeno.markdown);
        mostrarColuna(); coluna.focus(); coluna.paste();
        registrar(`Texto colado (${rotulo}, ${pequeno.markdown.length} caracteres)`);
        avisar(`${rotulo} coladas no Copilot. Escreva a pergunta (ou use Ctrl+V).`, 'ok', 5000);
        return { ok: true, modo: 'texto', abas: n, caracteres: pequeno.markdown.length };
      }

      const arquivo = montarMarkdown({ tabs, geradoEm: agora().toISOString(), maxCaracteres, omitidas, perguntaFinal: false });
      fs.mkdirSync(pasta, { recursive: true });
      limparAntigos();
      const caminho = path.join(pasta, `${PREFIXO}${carimbo(agora())}.md`);
      fs.writeFileSync(caminho, arquivo.markdown, 'utf8');
      const copiado = await copiarArquivo(caminho).catch(() => false);
      mostrarColuna(); coluna.focus(); if (copiado) coluna.paste();
      revelar(caminho);
      registrar(`Arquivo gerado (${rotulo}, ${arquivo.markdown.length} caracteres, copiado=${!!copiado})`);
      avisar(`${rotulo} em arquivo (${Math.round(arquivo.markdown.length / 1024)} KB). Anexe pelo + do Copilot.`, 'ok', 7000);
      return { ok: true, modo: 'arquivo', abas: n, caracteres: arquivo.markdown.length, caminho, copiado: !!copiado };
    } finally { ocupado = false; }
  }

  return { exportar, limparAntigos };
}

// Atalhos na janela principal (mesmo modelo de copilot-teclas.js, sem depender do modo da coluna).
function criarAtalhos({ app, BrowserWindow, webContents, getMainWindow, atalhos = { ativa: ATALHO_ATIVA, todas: ATALHO_TODAS }, acionar }) {
  const ligados = new WeakSet();
  function aoTecla(event, input, wc) {
    if (!input || input.type !== 'keyDown') return false;
    const escopo = Object.keys(atalhos).find((k) => core.combina(input, atalhos[k]));
    if (!escopo) return false;
    const principal = getMainWindow();
    if (!principal || principal.isDestroyed()) return false;
    const dono = wc && BrowserWindow ? BrowserWindow.fromWebContents(wc) : null;
    if (dono && dono !== principal) return false;
    event.preventDefault();
    if (!input.isAutoRepeat) Promise.resolve().then(() => acionar(escopo)).catch(() => {});
    return true;
  }
  function ligar(wc) {
    if (!wc || ligados.has(wc)) return;
    ligados.add(wc);
    wc.on('before-input-event', (event, input) => aoTecla(event, input, wc));
  }
  function instalar() {
    app.on('web-contents-created', (_e, wc) => ligar(wc));
    for (const wc of webContents.getAllWebContents()) ligar(wc);
  }
  return { aoTecla, ligar, instalar };
}

module.exports = { ATALHO_ATIVA, ATALHO_TODAS, RE_ARQUIVO, criarExportador, criarAtalhos };
