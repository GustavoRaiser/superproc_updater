'use strict';
// Testes sintéticos da extração segura e da conferência de COMPOSICAO.json (sem Electron, pastas descartáveis).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Z = require('../browser/atualizacao-zip.js');
const { zipDirectory } = require('./composicao.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atual-zip-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const VERSAO = '2.1.0', DIGEST = sha('digest-de-teste');
let n = 0; const novo = (nome) => path.join(tmp, `${nome}-${++n}`);

// Zip escrito à mão (permite nomes maliciosos, links e duplicados que o composicao.cjs jamais geraria).
function zipManual(entradas, { deflate = true } = {}) {
  const locais = [], centrais = []; let off = 0;
  for (const { nome, dados = Buffer.alloc(0), attr = 0, crc } of entradas) {
    const nomeB = Buffer.from(nome), comp = deflate ? zlib.deflateRawSync(dados) : dados, c = crc !== undefined ? crc : zlib.crc32(dados) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(dados.length, 22); lh.writeUInt16LE(nomeB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(dados.length, 24); ch.writeUInt16LE(nomeB.length, 28); ch.writeUInt32LE(attr, 38); ch.writeUInt32LE(off, 42);
    locais.push(lh, nomeB, comp); centrais.push(ch, nomeB); off += 30 + nomeB.length + comp.length;
  }
  const cd = Buffer.concat(centrais), eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, eocd]);
}
// Pacote sintético: pasta + COMPOSICAO.json coerente, zipado pelo mesmo zipDirectory da exportação real.
function pacote(arquivos, { versao = VERSAO, digest = DIGEST, extra = {} } = {}) {
  const pasta = novo('pasta'), raiz = 'SuperPROC-v2-abc123def456';
  fs.mkdirSync(path.join(pasta), { recursive: true });
  const lista = [];
  for (const [rel, dados] of Object.entries(arquivos)) {
    const abs = path.join(pasta, ...rel.split('/')); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, dados);
    lista.push({ file: rel, bytes: dados.length, sha256: sha(dados) });
  }
  lista.sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(pasta, 'COMPOSICAO.json'), JSON.stringify({ schema: 2, product: 'SuperPROC v2', version: versao, sourceDigest: digest, files: lista, ...extra }));
  const zip = novo('pacote') + '.zip'; zipDirectory(pasta, zip, raiz);
  return { zip, lista };
}
const ARQ = { 'SuperPROC_v2.exe': crypto.randomBytes(300000), 'resources/app/browser/main.js': Buffer.from('console.log(1)\n'.repeat(5000)), 'resources/app/vazio.txt': Buffer.alloc(0), 'locales/pt-BR.pak': crypto.randomBytes(2048) };

(async () => {
  // ---- caminho feliz ----
  const { zip } = pacote(ARQ);
  const d1 = novo('dest');
  const r = await Z.extrairZip(zip, d1);
  assert.equal(r.arquivos, Object.keys(ARQ).length + 1); assert.equal(r.raiz, 'SuperPROC-v2-abc123def456');
  for (const [rel, dados] of Object.entries(ARQ)) assert.deepEqual(fs.readFileSync(path.join(d1, ...rel.split('/'))), dados, rel);
  assert.equal(Z.conferirComposicao(d1, { versao: VERSAO, digest: DIGEST }).arquivos, Object.keys(ARQ).length);
  await assert.rejects(() => Z.extrairZip(zip, d1), /já existe/, 'não sobrescreve destino');

  // ---- conferência de COMPOSICAO ----
  assert.throws(() => Z.conferirComposicao(d1, { versao: '9.9.9', digest: DIGEST }), /Versão do pacote/);
  assert.throws(() => Z.conferirComposicao(d1, { versao: VERSAO, digest: sha('outro') }), /digest/);
  const dMod = novo('dest'); await Z.extrairZip(zip, dMod);
  fs.appendFileSync(path.join(dMod, 'resources/app/browser/main.js'), 'x'); assert.throws(() => Z.conferirComposicao(dMod, { versao: VERSAO, digest: DIGEST }), /Integridade/, 'arquivo alterado');
  const dTroca = novo('dest'); await Z.extrairZip(zip, dTroca);
  const exe = path.join(dTroca, 'SuperPROC_v2.exe'), b = fs.readFileSync(exe); b[100] ^= 1; fs.writeFileSync(exe, b); assert.throws(() => Z.conferirComposicao(dTroca, { versao: VERSAO, digest: DIGEST }), /Integridade/, 'mesmo tamanho, byte trocado');
  const dFalta = novo('dest'); await Z.extrairZip(zip, dFalta);
  fs.rmSync(path.join(dFalta, 'locales/pt-BR.pak')); assert.throws(() => Z.conferirComposicao(dFalta, { versao: VERSAO, digest: DIGEST }), /ausente/);
  const dSobra = novo('dest'); await Z.extrairZip(zip, dSobra);
  fs.writeFileSync(path.join(dSobra, 'malware.dll'), 'x'); assert.throws(() => Z.conferirComposicao(dSobra, { versao: VERSAO, digest: DIGEST }), /fora do manifesto/);
  assert.throws(() => Z.conferirComposicao(novo('vazia'), { versao: VERSAO, digest: DIGEST }), /COMPOSICAO/);

  // ---- corrupção no zip: CRC ----
  const bruto = fs.readFileSync(zip), corrompido = Buffer.from(bruto); corrompido[200] ^= 0xFF;
  const zc = novo('corrompido') + '.zip'; fs.writeFileSync(zc, corrompido);
  const dc = novo('dest'); await assert.rejects(() => Z.extrairZip(zc, dc)); assert.ok(!fs.existsSync(dc), 'destino removido após falha');
  const zt = novo('truncado') + '.zip'; fs.writeFileSync(zt, bruto.subarray(0, bruto.length - 30)); await assert.rejects(() => Z.extrairZip(zt, novo('dest')), /diretório central|inválido/);

  // ---- entradas maliciosas ----
  const R = 'raiz/'; const ok = Buffer.from('x');
  const recusa = async (entradas, padrao, opts) => {
    const z = novo('mal') + '.zip', d = novo('dest'); fs.writeFileSync(z, zipManual(entradas, opts));
    await assert.rejects(() => Z.extrairZip(z, d), padrao); assert.ok(!fs.existsSync(d), 'sem resíduo: ' + padrao);
  };
  await recusa([{ nome: R + 'a.txt', dados: ok }, { nome: R + '../fora.txt', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'sub/../../fora.txt', dados: ok }], /recusado/);
  await recusa([{ nome: '/abs.txt', dados: ok }], /recusado|inválida/);
  await recusa([{ nome: R + 'C:/Windows/x.txt', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'dir\\x.txt', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'arq.txt:stream', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'NUL.txt', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'fim.', dados: ok }], /recusado/);
  await recusa([{ nome: R + 'link', dados: ok, attr: (0xA1FF << 16) >>> 0 }], /simbólico/);
  await recusa([{ nome: R + 'A.txt', dados: ok }, { nome: R + 'a.TXT', dados: ok }], /duplicada/);
  await recusa([{ nome: 'r1/a.txt', dados: ok }, { nome: 'r2/b.txt', dados: ok }], /única pasta raiz/);
  await recusa([{ nome: 'solto.txt', dados: ok }], /fora da pasta raiz/);
  await recusa([], /única pasta raiz|vazio/);
  await recusa([{ nome: R + 'a.txt', dados: ok, crc: 123 }], /CRC/);
  await recusa([{ nome: R + 'a.txt', dados: ok }, { nome: R + 'b.txt', dados: ok, crc: 1 }], /CRC/, { deflate: false });

  // ---- armazenado sem compressão também funciona ----
  const zs = novo('stored') + '.zip'; fs.writeFileSync(zs, zipManual([{ nome: R + 'x/y.bin', dados: Buffer.from('abc') }], { deflate: false }));
  const ds = novo('dest'); await Z.extrairZip(zs, ds); assert.equal(fs.readFileSync(path.join(ds, 'x/y.bin'), 'utf8'), 'abc');

  console.log('test-atualizacao-zip: ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
