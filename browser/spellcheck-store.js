'use strict';
// Listas locais do corretor ortográfico (camada: host). Sem rede e sem Electron:
// este módulo só lê/grava um JSON no perfil e é testável com Node puro.
//   dicionario : palavras que o usuário declarou corretas ("Adicionar ao dicionário")
//   ignoradas  : palavras que não devem ser sublinhadas, mas não são "corretas" ("Ignorar sempre")
//   expressoes : expressões de duas ou mais palavras (ex.: latim jurídico). Ficam numa lista própria,
//                mas o corretor (spellcheck.js) trata cada palavra delas como palavra individual ignorada
//                no dicionário da sessão. Decisão do usuário: uma palavra solta pode passar sem correção.
// Uma palavra pertence a no máximo uma das listas de palavras (dicionario/ignoradas).
const fs = require('node:fs');
const { atomicConfig } = require('./atomic-config');

const WORD_KINDS = Object.freeze(['dicionario', 'ignoradas']);
const KINDS = Object.freeze([...WORD_KINDS, 'expressoes']);
const MAX_WORD = 100;
const MAX_WORDS = 20000;
// 300 caracteres folgam as maiores máximas latinas do direito (em torno de 100 caracteres).
const MAX_EXPRESSION = 300;
const MAX_EXPRESSIONS = 5000;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function normalizeWord(value) {
  if (typeof value !== 'string') return null;
  const word = value.normalize('NFC').trim();
  if (!word || word.length > MAX_WORD || /[\s\u0000-\u001f\u007f]/.test(word)) return null;
  return word;
}

// Expressão: espaços internos (inclusive quebras e tabs) viram um espaço só; exige duas ou mais
// palavras (uma palavra só pertence à lista "Ignoradas") e rejeita caracteres de controle.
function normalizeExpression(value) {
  if (typeof value !== 'string') return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return null;
  const text = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_EXPRESSION) return null;
  if (text.split(' ').length < 2) return null;
  return text;
}

const expressionKey = text => text.toLocaleLowerCase('pt-BR');
const normalizerFor = kind => kind === 'expressoes' ? normalizeExpression : normalizeWord;

function assertKind(kind) {
  if (!KINDS.includes(kind)) throw Error('Lista de palavras desconhecida.');
}

// file = null cria uma lista só em memória (usada se o arquivo do perfil não puder ser lido).
function createStore(file) {
  const lists = { dicionario: new Set(), ignoradas: new Set(), expressoes: new Set() };
  const hasExpression = text => { const key = expressionKey(text); for (const item of lists.expressoes) if (expressionKey(item) === key) return item; return null; };
  let writer = null;
  let loadNote = null;

  function loadFromDisk() {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
    let data;
    try {
      data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('formato');
      for (const kind of KINDS) {
        if (data[kind] !== undefined && !Array.isArray(data[kind])) throw Error('formato');
      }
    } catch {
      // Arquivo ilegível: preserva a cópia para inspeção e começa vazio (nunca sobrescreve em silêncio).
      const backup = file + '.invalido-' + Date.now();
      fs.renameSync(file, backup);
      loadNote = 'Arquivo de listas inválido; preservado como ' + backup;
      return true;
    }
    for (const kind of KINDS) {
      const normalize = normalizerFor(kind);
      const limit = kind === 'expressoes' ? MAX_EXPRESSIONS : MAX_WORDS;
      for (const item of data[kind] || []) {
        const word = normalize(item);
        if (!word || lists[kind].size >= limit) continue;
        if (kind === 'expressoes' && hasExpression(word)) continue;
        lists[kind].add(word);
      }
    }
    for (const word of lists.ignoradas) lists.dicionario.delete(word); // coerência: uma lista por palavra
    return true;
  }

  if (file) {
    loadFromDisk();
    writer = atomicConfig(file);
  }

  const persist = () => { if (writer) writer.save({ versao: 1, dicionario: sorted('dicionario'), ignoradas: sorted('ignoradas'), expressoes: sorted('expressoes') }); };
  const sorted = kind => [...lists[kind]].sort((a, b) => a.localeCompare(b, 'pt-BR') || (a < b ? -1 : 1));
  const total = () => lists.dicionario.size + lists.ignoradas.size; // só palavras (as expressões têm limite próprio)

  return {
    get loadNote() { return loadNote; },
    list: kind => { assertKind(kind); return sorted(kind); },
    // all/has tratam só palavras: é o que se espelha no dicionário nativo da sessão.
    all: () => [...lists.dicionario, ...lists.ignoradas],
    has: word => lists.dicionario.has(word) || lists.ignoradas.has(word),
    // Retorna a palavra normalizada, ou null se for inválida.
    add(kind, value) {
      assertKind(kind);
      if (kind === 'expressoes') {
        const expression = normalizeExpression(value);
        if (!expression) return null;
        const existing = hasExpression(expression);
        if (existing) return existing;
        if (lists.expressoes.size >= MAX_EXPRESSIONS) throw Error('Limite de expressões atingido.');
        lists.expressoes.add(expression);
        persist();
        return expression;
      }
      const word = normalizeWord(value);
      if (!word) return null;
      const other = WORD_KINDS.find(k => k !== kind);
      const already = lists[kind].has(word);
      if (!already && !lists[other].has(word) && total() >= MAX_WORDS) throw Error('Limite de palavras atingido.');
      lists[other].delete(word);
      lists[kind].add(word);
      persist();
      return word;
    },
    remove(kind, value) {
      assertKind(kind);
      if (kind === 'expressoes') {
        const found = typeof value === 'string' ? hasExpression(value.normalize('NFC').replace(/\s+/g, ' ').trim()) : null;
        if (!found || !lists.expressoes.delete(found)) return false;
        persist();
        return true;
      }
      const word = normalizeWord(value);
      if (!word || !lists[kind].delete(word)) return false;
      persist();
      return true;
    },
    importText(kind, text) {
      assertKind(kind);
      if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw Error('Arquivo de importação inválido ou grande demais.');
      const added = []; let rejected = 0;
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        let word = null;
        try { word = this.add(kind, trimmed); } catch { word = null; }
        if (word) added.push(word); else rejected++;
      }
      return { added, rejected };
    },
    exportText(kind) { assertKind(kind); return sorted(kind).join('\n') + (lists[kind].size ? '\n' : ''); },
    flush: () => writer ? writer.flush() : Promise.resolve()
  };
}

module.exports = { createStore, normalizeWord, normalizeExpression, KINDS, WORD_KINDS, MAX_WORD, MAX_WORDS, MAX_EXPRESSION, MAX_EXPRESSIONS, MAX_IMPORT_BYTES };
