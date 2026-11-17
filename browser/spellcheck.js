'use strict';
// Corretor ortográfico (camada: host). Usa o corretor nativo do Chromium (pt-BR; o dicionário é
// baixado pelo próprio Chromium na primeira vez, única conexão externa autorizada) e mantém as
// listas do usuário localmente em <perfil>/spellcheck-listas.json. Não há serviço de correção online.
const fs = require('node:fs');
const path = require('node:path');
const { createStore, normalizeWord, normalizeExpression, KINDS } = require('./spellcheck-store');
const { createMatcher, tokenize } = require('./spellcheck-expressoes');

const IDIOMA = 'pt-BR';
const MAX_SUGGESTIONS = 6;
const SYNC_TIMEOUT_MS = 5000;

let store = null;
let ses = null;
let managerWindow = null;
let enabled = true;
let matcher = null; // casamento das "expressões ignoradas"; recriado quando a lista muda
let managerOptions = { getParent: () => null, icon: undefined };

function warn(message, error) { console.warn('[SuperPROC] Corretor: ' + message + (error ? ' (' + (error.message || error) + ')' : '')); }

function init(session, userDataPath, options = {}) {
  ses = session;
  enabled = options.enabled !== false;
  try { store = createStore(path.join(userDataPath, 'spellcheck-listas.json')); }
  catch (error) { warn('não foi possível ler as listas do perfil; usando somente memória', error); store = createStore(null); }
  if (store.loadNote) warn(store.loadNote);
  applyEnabled();
  syncNative().catch(error => warn('falha ao sincronizar o dicionário da sessão', error));
}

function applyEnabled() {
  try {
    ses.setSpellCheckerEnabled(enabled);
    if (enabled) ses.setSpellCheckerLanguages([IDIOMA]);
  } catch (error) { warn('não foi possível aplicar o estado do corretor', error); }
}

// Interruptor geral (Configurações). Desligado: nada é sublinhado nem sugerido em nenhum campo.
function setEnabled(value) {
  enabled = !!value;
  if (ses) applyEnabled();
  return enabled;
}

// Palavras de uma expressão ignorada, tratadas como palavras individuais ignoradas: como foram
// digitadas, em minúsculas, com a inicial maiúscula (início de frase) e as partes de hífen/apóstrofo.
function wordsOfExpression(expression) {
  const out = new Set();
  for (const token of tokenize(expression)) {
    const original = expression.slice(token.start, token.end);
    for (const piece of [original, ...original.split(/[-'’]/)]) {
      const lower = piece.toLocaleLowerCase('pt-BR');
      for (const variant of [piece, lower, lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)]) {
        const word = normalizeWord(variant);
        if (word) out.add(word);
      }
    }
  }
  return out;
}

function expressionWords() {
  const out = new Set();
  for (const expression of store.list('expressoes')) for (const word of wordsOfExpression(expression)) out.add(word);
  return out;
}

// Tudo o que o dicionário nativo deve conhecer: listas de palavras + palavras das expressões.
function wantedWords() { return new Set([...store.all(), ...expressionWords()]); }

// As listas do perfil são a fonte de verdade; o dicionário da sessão é apenas um espelho.
async function syncNative() {
  const wanted = wantedWords();
  let native = null;
  try {
    native = new Set(await Promise.race([
      ses.listWordsInSpellCheckerDictionary(),
      new Promise((_, reject) => setTimeout(() => reject(Error('tempo esgotado')), SYNC_TIMEOUT_MS).unref?.())
    ]));
  } catch (error) { warn('não foi possível listar o dicionário da sessão', error); }
  for (const word of wanted) if (!native || !native.has(word)) ses.addWordToSpellCheckerDictionary(word);
  if (native) for (const word of native) if (!wanted.has(word)) ses.removeWordFromSpellCheckerDictionary(word);
}

// Expressões nunca vão para o dicionário nativo (que é por palavra): só as listas de palavras.
function addWord(kind, value) {
  if (!store) throw Error('Corretor não iniciado.');
  const word = store.add(kind, value);
  if (kind === 'expressoes') {
    matcher = null;
    if (word) for (const piece of wordsOfExpression(word)) ses.addWordToSpellCheckerDictionary(piece);
  } else if (word) ses.addWordToSpellCheckerDictionary(word);
  return word;
}

function removeWord(kind, value) {
  if (!store) throw Error('Corretor não iniciado.');
  if (kind === 'expressoes') {
    const before = expressionWords();
    const done = store.remove(kind, value);
    if (done) {
      matcher = null;
      const still = wantedWords();
      for (const piece of before) if (!still.has(piece)) ses.removeWordFromSpellCheckerDictionary(piece);
    }
    return done;
  }
  const word = normalizeWord(value);
  const removed = store.remove(kind, value);
  if (removed && word && !store.has(word) && !expressionWords().has(word)) ses.removeWordFromSpellCheckerDictionary(word);
  return removed;
}

function snapshot() {
  return { idioma: IDIOMA, dicionario: store.list('dicionario'), ignoradas: store.list('ignoradas'), expressoes: store.list('expressoes') };
}

// Trechos de um texto que formam uma expressão ignorada: [{ start, end, expression }].
// Uso informativo: o sublinhado não depende disto (as palavras das expressões são espelhadas como
// palavras individuais ignoradas; ver wordsOfExpression).
function findIgnoredExpressions(text) {
  if (!store) return [];
  if (!matcher) matcher = createMatcher(store.list('expressoes'));
  return matcher.find(text);
}

const escapeLabel = text => String(text).replace(/&/g, '&&');

// Itens do menu de contexto. Só há itens quando o clique foi sobre uma palavra que o corretor
// aponta como errada em um campo editável; a lista termina com um separador.
function menuItems(webContents, params) {
  if (!store || !enabled || !params || !params.isEditable) return [];
  const items = [];
  if (typeof params.misspelledWord === 'string' && params.misspelledWord) {
    const suggestions = (Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [])
      .filter(item => typeof item === 'string' && item).slice(0, MAX_SUGGESTIONS);
    for (const suggestion of suggestions) {
      items.push({
        label: escapeLabel(suggestion),
        click: () => { if (webContents && !webContents.isDestroyed()) webContents.replaceMisspelling(suggestion); }
      });
    }
    if (!suggestions.length) items.push({ label: '(sem sugestões)', enabled: false });
    const word = normalizeWord(params.misspelledWord);
    if (word) {
      items.push({ type: 'separator' });
      items.push({ label: 'Adicionar ao dicionário', click: () => { try { addWord('dicionario', word); } catch (error) { warn('não foi possível adicionar a palavra', error); } } });
      items.push({ label: 'Ignorar sempre', click: () => { try { addWord('ignoradas', word); } catch (error) { warn('não foi possível ignorar a palavra', error); } } });
    }
  }
  // Trecho selecionado com 2+ palavras (até 300 caracteres): vai para "Expressões ignoradas" e cada
  // palavra passa a valer como palavra individual ignorada.
  const expression = typeof params.selectionText === 'string' ? normalizeExpression(params.selectionText) : null;
  if (expression) {
    items.push({ label: 'Ignorar expressão selecionada', click: () => { try { addWord('expressoes', expression); } catch (error) { warn('não foi possível ignorar a expressão', error); } } });
  }
  if (!items.length) return [];
  items.push({ type: 'separator' });
  return items;
}

// Entrada permanente (campos editáveis) para abrir a janela de gerenciamento.
function manageMenuItem() {
  return { label: 'Dicionário do corretor…', click: () => openManager() };
}

function openManager() {
  if (!store) return;
  if (managerWindow && !managerWindow.isDestroyed()) { managerWindow.show(); managerWindow.focus(); return; }
  const { BrowserWindow } = require('electron');
  const parent = managerOptions.getParent?.();
  const win = managerWindow = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    width: 1040, height: 620, minWidth: 780, minHeight: 440,
    autoHideMenuBar: true, title: 'Dicionário do corretor', icon: managerOptions.icon, backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'spellcheck', 'manage-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false
    }
  });
  win.removeMenu?.();
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { if (managerWindow === win) managerWindow = null; });
  win.loadFile(path.join(__dirname, 'spellcheck', 'manage.html'));
}

function installIpc(hostIPC, options = {}) {
  managerOptions = { ...managerOptions, ...options };
  const kindOf = value => { if (!KINDS.includes(value)) throw Error('Lista desconhecida.'); return value; };
  hostIPC.handle('spell-get-lists', () => snapshot());
  hostIPC.handle('spell-add-word', (event, arg) => {
    const kind = kindOf(arg?.kind);
    const word = addWord(kind, arg?.word);
    return { ...snapshot(), ok: !!word };
  });
  hostIPC.handle('spell-remove-word', (event, arg) => {
    removeWord(kindOf(arg?.kind), arg?.word);
    return snapshot();
  });
  hostIPC.handle('spell-import', async (event, arg) => {
    const kind = kindOf(arg?.kind);
    const { dialog } = require('electron');
    const picked = await dialog.showOpenDialog(managerWindow || undefined, {
      title: 'Importar palavras (um por linha)', properties: ['openFile'], filters: [{ name: 'Texto', extensions: ['txt'] }]
    });
    if (picked.canceled || !picked.filePaths[0]) return { ...snapshot(), cancelado: true };
    const file = picked.filePaths[0];
    const { size } = await fs.promises.stat(file);
    if (size > require('./spellcheck-store').MAX_IMPORT_BYTES) throw Error('Arquivo grande demais.');
    const result = store.importText(kind, await fs.promises.readFile(file, 'utf8'));
    if (kind === 'expressoes') { matcher = null; for (const expression of result.added) for (const piece of wordsOfExpression(expression)) ses.addWordToSpellCheckerDictionary(piece); }
    else for (const word of result.added) ses.addWordToSpellCheckerDictionary(word);
    return { ...snapshot(), importadas: result.added.length, rejeitadas: result.rejected };
  });
  hostIPC.handle('spell-export', async (event, arg) => {
    const kind = kindOf(arg?.kind);
    const { dialog, app } = require('electron');
    const target = await dialog.showSaveDialog(managerWindow || undefined, {
      title: 'Exportar palavras', defaultPath: path.join(app.getPath('documents'), 'corretor-' + kind + '.txt'),
      filters: [{ name: 'Texto', extensions: ['txt'] }]
    });
    if (target.canceled || !target.filePath) return { cancelado: true };
    await fs.promises.writeFile(target.filePath, store.exportText(kind), 'utf8');
    return { exportado: true };
  });
  hostIPC.on('spell-manage-close', event => {
    if (managerWindow && !managerWindow.isDestroyed() && event.sender === managerWindow.webContents) managerWindow.close();
  });
}

module.exports = {
  init, setEnabled, isEnabled: () => enabled, flush: () => store ? store.flush() : Promise.resolve(),
  menuItems, manageMenuItem, openManager, installIpc, getWindow: () => managerWindow, findIgnoredExpressions,
  _internals: { addWord, removeWord, snapshot, syncNative }
};
