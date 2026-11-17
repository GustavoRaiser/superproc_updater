'use strict';
// Módulos JavaScript importados pelo usuário (arrastar e soltar no popup da extensão SuperPROC).
// Gravados como arquivos reais em <pasta da extensão>/modules/usuario/<id>.js, para que o orquestrador os carregue como
// qualquer módulo nativo (a extensão não consegue executar código vindo do storage: eval/Blob são barrados pela CSP).
// O índice (indice.json) guarda nome, categoria e padrões @match; fica ao lado dos arquivos e é lido pelo popup e pelo orquestrador.
const fs = require('node:fs');
const path = require('node:path');

const PASTA = ['modules', 'usuario'];
const LIMITE_BYTES = 2 * 1024 * 1024;
const MAX_MODULOS = 200;
const CATEGORIAS = ['Ajustes Gerais', 'Capa do Processo', 'Painel & Menus', 'Editor de Minutas', 'Árvore de Eventos', 'Páginas Externas', 'Automações', 'Outras'];
const ID = /^usuario_[a-z0-9_]{1,60}$/;

function pastaDe(dirExtensao) { return path.join(dirExtensao, ...PASTA); }
function gravarAtomico(arquivo, conteudo) {
  const tmp = arquivo + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, conteudo); fs.renameSync(tmp, arquivo);
}
function lerIndice(dirExtensao) {
  try { const lista = JSON.parse(fs.readFileSync(path.join(pastaDe(dirExtensao), 'indice.json'), 'utf8')); return Array.isArray(lista) ? lista.filter(m => m && ID.test(m.id)) : []; }
  catch { return []; }
}
function gravarIndice(dirExtensao, lista) { gravarAtomico(path.join(pastaDe(dirExtensao), 'indice.json'), JSON.stringify(lista, null, 2) + '\n'); }

// Cabeçalho "// ==UserScript==" (Tampermonkey): aproveita @match / @include como filtro de páginas.
function lerPadroes(texto) {
  const bloco = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/.exec(texto.slice(0, 8192));
  if (!bloco) return [];
  const padroes = [];
  for (const m of bloco[1].matchAll(/\/\/\s*@(?:match|include)\s+(\S+)/g)) if (m[1].length <= 300 && padroes.length < 20) padroes.push(m[1]);
  return padroes;
}
function idDoNome(nome) {
  const base = String(nome).replace(/^.*[\\/]/, '').replace(/\.m?js$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return 'usuario_' + (base || 'modulo');
}

function adicionar(dirExtensao, { nome, categoria, conteudo }) {
  if (typeof nome !== 'string' || !/\.m?js$/i.test(nome) || nome.length > 260) throw new Error('Arquivo inválido: só .js.');
  if (typeof conteudo !== 'string' || !conteudo.trim() || conteudo.includes('\0') || Buffer.byteLength(conteudo) > LIMITE_BYTES) throw new Error('Conteúdo inválido ou maior que 2 MB.');
  const cat = CATEGORIAS.includes(categoria) ? categoria : 'Outras';
  const id = idDoNome(nome), indice = lerIndice(dirExtensao), anterior = indice.findIndex(m => m.id === id);
  if (anterior < 0 && indice.length >= MAX_MODULOS) throw new Error('Limite de módulos importados atingido.');
  fs.mkdirSync(pastaDe(dirExtensao), { recursive: true });
  gravarAtomico(path.join(pastaDe(dirExtensao), id + '.js'), conteudo);
  const entrada = { id, nome: String(nome).replace(/^.*[\\/]/, '').replace(/\.m?js$/i, ''), categoria: cat, arquivo: id + '.js', matches: lerPadroes(conteudo), importadoEm: new Date().toISOString() };
  if (anterior >= 0) indice[anterior] = entrada; else indice.push(entrada);
  gravarIndice(dirExtensao, indice);
  return entrada;
}

function remover(dirExtensao, { id }) {
  if (!ID.test(String(id))) throw new Error('Módulo inválido.');
  const indice = lerIndice(dirExtensao);
  fs.rmSync(path.join(pastaDe(dirExtensao), id + '.js'), { force: true });
  gravarIndice(dirExtensao, indice.filter(m => m.id !== id));
  return { id };
}

function executar(dirExtensao, req) {
  if (!req || typeof req !== 'object') throw new Error('Pedido inválido.');
  if (req.op === 'adicionar') return adicionar(dirExtensao, req);
  if (req.op === 'remover') return remover(dirExtensao, req);
  throw new Error('Operação inválida.');
}

module.exports = { executar, adicionar, remover, lerIndice, lerPadroes, idDoNome, CATEGORIAS };
