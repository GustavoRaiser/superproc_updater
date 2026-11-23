'use strict';
// Exportador de contexto para o Copilot (host). Ação do usuário (atalho): lê as abas pelo ContextBroker, monta o Markdown e
//  - se couber no campo do chat: copia o texto e usa o comando nativo "colar" na coluna;
//  - se for grande: grava um arquivo .md, copia o arquivo para a área de transferência, tenta colar e revela a pasta,
//    para o usuário anexar pelo "+" do Copilot.
// A página do Copilot não recebe script nem estilo, e nada é enviado sozinho. Logs: só metadados (nunca título, endereço ou texto).
// Dependências injetadas para testar sem Electron.
const core = require('../quick-shortcut-core');
const { montarMarkdown } = require('./markdown');
const { identidadeDocumento } = require('./tab-registry');

const ATALHO_ATIVA = Object.freeze({ code: 'KeyK', ctrl: true, alt: false, shift: true, meta: false });
const ATALHO_TODAS = Object.freeze({ code: 'KeyJ', ctrl: true, alt: false, shift: true, meta: false });
const PREFIXO = 'contexto-';
const RE_ARQUIVO = /^contexto-\d{8}-\d{6}(?:-\d{1,3})?\.md$/;
const MOTIVOS = Object.freeze({
  'contexto-desativado': 'O uso do contexto está desativado no menu do Copilot.',
  'coluna-indisponivel': 'Abra a coluna do Copilot para compartilhar o contexto.',
  'sem-aba-ativa': 'O navegador não identificou uma aba ativa.',
  'sem-pagina': 'Nenhuma aba legível para compartilhar.',
  'destino-indisponivel': 'Abra uma conversa no Copilot antes de preparar o contexto.',
  'destino-alterado': 'A conversa mudou durante a preparação do contexto.',
  'aba-alterada': 'A aba ativa mudou durante a preparação do contexto.',
  'leitura-expirou': 'A leitura da aba excedeu o tempo de espera.',
  'nao-autorizado': 'A preparação do contexto foi cancelada.',
  'texto-preparado': 'Texto preparado. A entrada no campo depende do foco do chat.',
  'arquivo-preparado': 'Arquivo preparado para anexar ao chat.',
  'leitura-testada': 'A leitura local da aba foi concluída.',
  ocupado: 'Já há um compartilhamento em andamento.',
  erro: 'Não foi possível ler as abas.'
});

const dois = (n) => String(n).padStart(2, '0');
const carimbo = (d) => `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;

function criarExportador({
  broker, clipboard, fs, path, pasta, getColunaWc, mostrarColuna = () => {}, copiarArquivo = async () => false, revelar = () => {},
  avisar = () => {}, log = () => {}, aceitarDestino, autorizar,
  contextoPermitido = () => true, acompanharContexto,
  agora = () => new Date(), limiteColar = 60000, maxCaracteres = require('./tipos').LIMITES.maxCaracteres, retencaoMs = 24 * 3600 * 1000
}) {
  let ocupado = false;
  let ultimaTentativa = null;
  const registrar = (t) => { try { log('COPILOT_CONTEXTO', t); } catch (_) { /* log nunca derruba */ } };
  const etapa = (nome, motivo) => { ultimaTentativa = { etapa: nome, mensagem: MOTIVOS[motivo] }; };

  async function diagnosticar() {
    const ativa = await broker.getActiveTab();
    const coluna = getColunaWc();
    const colunaDisponivel = Boolean(coluna && !coluna.isDestroyed());
    return {
      permitido: contextoPermitido(),
      abaIdentificada: Boolean(ativa?.id),
      abaLegivel: ativa?.readable === true,
      conversaDisponivel: colunaDisponivel && (!aceitarDestino || Boolean(aceitarDestino(coluna))),
      ultimaTentativa: ultimaTentativa && { ...ultimaTentativa }
    };
  }

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

  async function exportar({ escopo = 'ativa', testarLeitura = false } = {}) {
    let fase = 'Permissão e conversa';
    const falha = (motivo, silenciosa = false) => {
      etapa(fase, motivo);
      registrar('Recusado: ' + motivo);
      if (!silenciosa) avisar(MOTIVOS[motivo] || MOTIVOS.erro, 'erro');
      return { ok: false, motivo };
    };
    if (ocupado) return { ok: false, motivo: 'ocupado' };
    ocupado = true;
    try {
      if (!contextoPermitido()) return falha('contexto-desativado');
      const coluna = testarLeitura ? null : getColunaWc();
      if (!testarLeitura && (!coluna || coluna.isDestroyed())) return falha('coluna-indisponivel');
      const endereco = !testarLeitura && aceitarDestino ? coluna.getURL() : null;
      const documentoDestino = !testarLeitura && aceitarDestino ? identidadeDocumento(coluna) : null;
      const destinoAindaAceito = () => testarLeitura || !aceitarDestino ||
        (getColunaWc() === coluna && !coluna.isDestroyed() && identidadeDocumento(coluna) === documentoDestino &&
          coluna.getURL() === endereco && aceitarDestino(coluna));
      if (!destinoAindaAceito()) return falha('destino-indisponivel');
      fase = 'Identificação da aba';
      const abaAindaAtiva = escopo === 'ativa' && acompanharContexto ? acompanharContexto() : null;
      const ativa = escopo === 'ativa' ? await broker.getActiveTab() : null;
      if (escopo === 'ativa' && (!ativa?.id || (acompanharContexto && !abaAindaAtiva))) {
        return falha(acompanharContexto ? 'sem-aba-ativa' : 'sem-pagina');
      }
      if (ativa?.readable === false) return falha('sem-pagina');
      fase = 'Confirmação';
      etapa(fase);
      if (autorizar && !await autorizar(escopo, testarLeitura)) return falha('nao-autorizado', true);
      if (!contextoPermitido()) return falha('contexto-desativado');
      if (!destinoAindaAceito()) return falha('destino-alterado');
      if (abaAindaAtiva && !abaAindaAtiva()) return falha('aba-alterada');

      fase = 'Leitura';
      etapa(fase);
      let tabs = []; let omitidas = 0;
      try {
        if (escopo === 'ativa') {
          tabs = [await broker.readTab(ativa.id)];
        } else {
          const ws = await broker.readAllTabs();
          tabs = ws.tabs.filter((t) => !t.error);
          omitidas = ws.tabs.length - tabs.length;
        }
      } catch (e) {
        switch (e?.codigo) {
          case 'UNSUPPORTED_BROWSER_PAGE': return falha('sem-pagina');
          case 'TAB_NOT_FOUND':
          case 'TAB_DESTROYED':
          case 'TAB_CHANGED': return falha('aba-alterada');
          case 'CONTENT_EXTRACTION_TIMEOUT': return falha('leitura-expirou');
          default: return falha('erro');
        }
      }
      if (!tabs.length) return falha('sem-pagina');
      if (!contextoPermitido()) return falha('contexto-desativado');
      if (!destinoAindaAceito()) return falha('destino-alterado');
      if (abaAindaAtiva && !abaAindaAtiva()) return falha('aba-alterada');
      if (testarLeitura) {
        etapa('Leitura local', 'leitura-testada');
        avisar(MOTIVOS['leitura-testada'], 'ok', 5000);
        return { ok: true, modo: 'diagnostico' };
      }
      fase = 'Preparação para o chat';
      etapa(fase);

      const pequeno = montarMarkdown({ tabs, geradoEm: agora().toISOString(), maxCaracteres, omitidas, perguntaFinal: true });
      const cabe = pequeno.markdown.length <= limiteColar;
      const n = tabs.length;
      const rotulo = `${n} aba${n > 1 ? 's' : ''}`;

      if (cabe) {
        clipboard.writeText(pequeno.markdown);
        mostrarColuna(); coluna.focus(); coluna.paste();
        etapa(fase, 'texto-preparado');
        registrar(`Colagem solicitada (${rotulo}, ${pequeno.markdown.length} caracteres)`);
        avisar('Contexto preparado. Se o texto não aparecer no chat, use Ctrl+V.', 'ok', 5000);
        return { ok: true, modo: 'texto', abas: n, caracteres: pequeno.markdown.length };
      }

      const arquivo = montarMarkdown({ tabs, geradoEm: agora().toISOString(), maxCaracteres, omitidas, perguntaFinal: false });
      fs.mkdirSync(pasta, { recursive: true });
      limparAntigos();
      const base = `${PREFIXO}${carimbo(agora())}`;
      let caminho;
      for (let i = 0; ; i++) { // 'wx' nunca sobrescreve: no mesmo segundo, acrescenta -2, -3…
        caminho = path.join(pasta, `${base}${i ? '-' + (i + 1) : ''}.md`);
        try { fs.writeFileSync(caminho, arquivo.markdown, { encoding: 'utf8', flag: 'wx' }); break; }
        catch (e) { if (!e || e.code !== 'EEXIST' || i >= 99) throw e; }
      }
      const copiado = await copiarArquivo(caminho).catch(() => false);
      if (contextoPermitido() && destinoAindaAceito() && (!abaAindaAtiva || abaAindaAtiva())) {
        mostrarColuna(); coluna.focus(); if (copiado) coluna.paste();
      }
      revelar(caminho);
      etapa(fase, 'arquivo-preparado');
      registrar(`Arquivo gerado (${rotulo}, ${arquivo.markdown.length} caracteres, copiado=${!!copiado})`);
      avisar(`${rotulo} em arquivo (${Math.round(arquivo.markdown.length / 1024)} KB). Anexe pelo + do Copilot.`, 'ok', 7000);
      return { ok: true, modo: 'arquivo', abas: n, caracteres: arquivo.markdown.length, caminho, copiado: !!copiado };
    } finally { ocupado = false; }
  }

  return { exportar, limparAntigos, diagnosticar };
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
