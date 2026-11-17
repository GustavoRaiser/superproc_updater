'use strict';
// Monta o Markdown consolidado das abas lidas pelo ContextBroker. Função pura: não toca em disco, rede nem Electron.
// O formato é convenção do SuperPROC (a Microsoft não define um para múltiplas fontes). O orçamento de caracteres é dividido
// entre as abas sem favorecer a maior: abas curtas ficam inteiras e a sobra vai para as longas.
const { sanitizar } = require('../copilot-protocolo-edge');

const MARGEM_CABECALHO = 1500;
const MAX_SELECAO = 2000;

const linha = (v) => sanitizar(v).replace(/\s+/g, ' ').trim();
const celula = (v) => linha(v).replace(/\|/g, '\\|');

// Divide `orcamento` entre os tamanhos pedidos: quem pede menos que a cota recebe tudo; a sobra é redistribuída.
function alocar(tamanhos, orcamento) {
  const alocado = new Array(tamanhos.length).fill(0);
  let resto = Math.max(0, orcamento);
  let abertos = tamanhos.map((_, i) => i).filter((i) => tamanhos[i] > 0);
  while (abertos.length && resto > 0) {
    const cota = Math.floor(resto / abertos.length);
    if (cota <= 0) break;
    const proximos = [];
    for (const i of abertos) {
      const falta = tamanhos[i] - alocado[i];
      if (falta <= cota) { alocado[i] += falta; resto -= falta; } else proximos.push(i);
    }
    if (proximos.length === abertos.length) { for (const i of proximos) { alocado[i] += cota; resto -= cota; } break; }
    abertos = proximos;
  }
  return alocado;
}

function textoDaAba(aba) {
  if (aba.pdf) {
    if (aba.pdf.requiresOcr) return { texto: '', nota: 'PDF sem camada de texto (requer OCR): conteúdo não extraído.' };
    return { texto: aba.pdf.pages.map((p) => `#### Página ${p.page}\n${sanitizar(p.text)}`).join('\n\n'), nota: '' };
  }
  return { texto: sanitizar(aba.content.visibleText), nota: '' };
}

function cabecalhoDaAba(aba, indice) {
  const L = [`## Aba ${indice}: ${linha(aba.title) || 'sem título'} (${aba.type}${aba.active ? ', ativa' : ''})`, `- Endereço: ${aba.url}`];
  if (aba.processNumber) L.push(`- Processo: ${aba.processNumber}`);
  if (aba.eproc) {
    if (aba.eproc.currentPage) L.push(`- Página do eproc: ${linha(aba.eproc.currentPage)}`);
    if (aba.eproc.openedDocument) L.push(`- Documento aberto: ${aba.eproc.openedDocument.event ? 'evento ' + aba.eproc.openedDocument.event : linha(aba.eproc.openedDocument.action)}`);
  }
  if (aba.content.selectedText) {
    const sel = sanitizar(aba.content.selectedText).slice(0, MAX_SELECAO);
    L.push('- Texto selecionado pelo usuário:', ...sel.split('\n').map((l) => '  > ' + l));
  }
  return L;
}

function tabelaDeEventos(eventos) {
  const L = ['', '### Eventos', '', '| Evento | Data | Descrição | Documentos |', '|---|---|---|---|'];
  for (const e of eventos) {
    L.push(`| ${e.number} | ${celula(e.date || '')} | ${celula(e.description || '')} | ${celula((e.documents || []).map((d) => d.text).filter(Boolean).join('; '))} |`);
  }
  return L;
}

// tabs: TabContext[] já sem erros. Retorna { markdown, incluidas, truncadas }.
function montarMarkdown({ tabs, geradoEm, maxCaracteres = 400000, omitidas = 0, perguntaFinal = false }) {
  const textos = tabs.map(textoDaAba);
  const fixo = tabs.length * MARGEM_CABECALHO + 600 + tabs.reduce((s, a) => s + ((a.eproc && a.eproc.events) ? a.eproc.events.length * 160 : 0), 0);
  const aloc = alocar(textos.map((t) => t.texto.length), maxCaracteres - fixo);

  const L = [
    '# Contexto das abas do SuperPROC',
    '',
    `Gerado em: ${geradoEm}`,
    `Abas incluídas: ${tabs.length}${omitidas ? ` (não lidas: ${omitidas})` : ''}`,
    '',
    '> Conteúdo extraído das abas abertas, a pedido do usuário. Use somente o que consta abaixo como fonte; se algo não constar, diga que não consta.',
    ''
  ];
  const truncadas = [];
  tabs.forEach((aba, i) => {
    L.push(...cabecalhoDaAba(aba, i + 1));
    if (aba.eproc && aba.eproc.events && aba.eproc.events.length) L.push(...tabelaDeEventos(aba.eproc.events));
    const { texto, nota } = textos[i];
    L.push('', '### Texto', '');
    if (nota) L.push(nota);
    else if (!texto) L.push('(sem texto visível)');
    else if (texto.length <= aloc[i]) L.push(texto);
    else { L.push(texto.slice(0, aloc[i]), '', `[... texto truncado: ${aloc[i]} de ${texto.length} caracteres]`); truncadas.push(i + 1); }
    if (aba.truncated) L.push('', `[aviso da leitura: ${linha((aba.warnings || []).join(', ')) || 'conteúdo limitado'}]`);
    L.push('', '---', '');
  });
  if (perguntaFinal) L.push('Minha pergunta: ');
  return { markdown: L.join('\n'), incluidas: tabs.length, truncadas };
}

module.exports = { alocar, montarMarkdown };
