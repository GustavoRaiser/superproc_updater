'use strict';
// Casamento de "expressões ignoradas" em um texto (camada: host). Módulo puro, sem Electron e sem rede.
// Uma expressão só é reconhecida quando TODAS as suas palavras aparecem em sequência, na mesma ordem,
// separadas apenas por espaço ou pontuação interna (vírgula, ponto e vírgula, dois-pontos, aspas,
// parênteses, travessão). Letras maiúsculas/minúsculas não importam; acentos importam.
// Utilitário informativo (não decide o sublinhado): palavra solta da expressão volta com covered=false.
const TOKEN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
// Entre duas palavras da mesma expressão: nenhum fim de frase (. ! ?) nem quebra de linha.
const GAP_OK = /^[ \t ,;:'"“”‘’()\[\]–—-]*$/;

const fold = text => text.normalize('NFC').toLocaleLowerCase('pt-BR');

function tokenize(text) {
  const tokens = [];
  for (const match of String(text).matchAll(TOKEN)) {
    tokens.push({ norm: fold(match[0]), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

// Compila a lista uma vez (index por primeira palavra; expressões mais longas têm prioridade).
function createMatcher(expressions) {
  const byFirst = new Map();
  for (const expression of expressions || []) {
    if (typeof expression !== 'string') continue;
    const words = tokenize(expression).map(token => token.norm);
    if (words.length < 2) continue;
    if (!byFirst.has(words[0])) byFirst.set(words[0], []);
    byFirst.get(words[0]).push({ expression, words });
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length);

  // Retorna [{ start, end, expression }] sem sobreposição, em ordem de posição.
  function find(text) {
    const source = String(text ?? '');
    if (!byFirst.size || !source) return [];
    const tokens = tokenize(source);
    const found = [];
    for (let i = 0; i < tokens.length;) {
      const candidates = byFirst.get(tokens[i].norm);
      let hit = null;
      for (const candidate of candidates || []) {
        const { words } = candidate;
        if (i + words.length > tokens.length) continue;
        let ok = true;
        for (let k = 0; k < words.length && ok; k++) {
          if (tokens[i + k].norm !== words[k]) ok = false;
          else if (k > 0 && !GAP_OK.test(source.slice(tokens[i + k - 1].end, tokens[i + k].start))) ok = false;
        }
        if (ok) { hit = { candidate, last: i + words.length - 1 }; break; }
      }
      if (hit) {
        found.push({ start: tokens[i].start, end: tokens[hit.last].end, expression: hit.candidate.expression });
        i = hit.last + 1;
      } else i++;
    }
    return found;
  }

  // Palavras do texto que estão dentro de alguma expressão: [{ word, start, end, covered }].
  // `covered` = true só para a ocorrência DENTRO da expressão; as soltas vêm com covered = false.
  function classifyWords(text) {
    const source = String(text ?? '');
    const ranges = find(source);
    return tokenize(source).map(token => ({
      word: source.slice(token.start, token.end), start: token.start, end: token.end,
      covered: ranges.some(range => token.start >= range.start && token.end <= range.end)
    }));
  }

  return { find, classifyWords, size: () => [...byFirst.values()].reduce((sum, list) => sum + list.length, 0) };
}

module.exports = { createMatcher, tokenize };
