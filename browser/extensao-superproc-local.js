'use strict';
// A extensão SuperPROC viaja com o navegador (pacote/USB), mas é executada a partir da pasta do perfil
// (<userData>/extensoes-atualizadas/superproc), como as demais: lá ela é gravável (módulos importados) e fica estável.
// A cada abertura o pacote é copiado por cima da pasta, só se mudou. A atualização apenas cria/sobrescreve arquivos: nunca apaga
// nada que já esteja na pasta (modules/usuario/ e quaisquer outros arquivos ficam intactos).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A fonte é a pasta raiz da extensão (<pacote>/extensao-superproc): tudo o que é do SuperPROC fica dentro dela e é espelhado por inteiro,
// sem lista de pastas. Pasta ou arquivo novo dentro dela vai sozinho; nada fora dela pertence à extensão.
const PRESERVAR = 'modules/usuario';
const preservado = (rel) => rel === PRESERVAR || rel.startsWith(PRESERVAR + '/');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Arquivos da extensão no pacote: Map(caminho relativo -> caminho absoluto).
function listar(fonte) {
  const todos = new Map();
  if (!fs.existsSync(fonte)) return todos;
  (function percorrer(rel) {
    const abs = rel ? path.join(fonte, ...rel.split('/')) : fonte, st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || (rel && preservado(rel))) return;
    if (st.isDirectory()) { for (const nome of fs.readdirSync(abs).sort()) percorrer(rel ? rel + '/' + nome : nome); }
    else if (st.isFile()) todos.set(rel, abs);
  })('');
  return todos;
}

function digest(arquivos) {
  const h = crypto.createHash('sha256');
  for (const [rel, abs] of [...arquivos].sort((a, b) => a[0].localeCompare(b[0]))) h.update(rel + '\0' + sha(fs.readFileSync(abs)) + '\n');
  return h.digest('hex');
}

// Espelha fonte -> destino (se mudou). Devolve { dir, copiado }.
function espelhar({ fonte, destino }) {
  const arquivos = listar(fonte);
  if (!arquivos.has('manifest.json')) throw new Error('manifest.json ausente em ' + fonte);
  const atual = digest(arquivos), selo = path.join(destino, '.origem.json');
  try { if (JSON.parse(fs.readFileSync(selo, 'utf8')).digest === atual && fs.existsSync(path.join(destino, 'manifest.json'))) return { dir: destino, copiado: false }; } catch { /* primeira vez ou selo ilegível */ }
  fs.mkdirSync(destino, { recursive: true });
  for (const [rel, abs] of arquivos) {
    const alvo = path.join(destino, ...rel.split('/'));
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(abs, alvo);
  }
  // Só atualiza: arquivos do pacote são criados ou sobrescritos; nada que já esteja na pasta é apagado.
  const tmp = selo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ digest: atual, em: new Date().toISOString() })); fs.renameSync(tmp, selo);
  return { dir: destino, copiado: true };
}

module.exports = { espelhar };
