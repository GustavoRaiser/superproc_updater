'use strict';
// Testes sintéticos da ferramenta de publicação: pacote e chaves descartáveis; nenhuma rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const P = require('./publicar.cjs');
const U = require('../browser/atualizacao-app.js');
const { zipDirectory } = require('./composicao.cjs');
const { gerar } = require('./gerar-chaves-atualizacao.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ID_PASTA = 'pastaDriveID123456';
let n = 0;

function pacote(versao) {
  const pasta = path.join(tmp, 'p' + (++n)), arquivos = { 'SuperPROC_v2.exe': crypto.randomBytes(50000), 'resources/app/x.js': Buffer.from('1;\n'.repeat(100)) };
  const lista = [];
  for (const [rel, d] of Object.entries(arquivos)) { const abs = path.join(pasta, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, d); lista.push({ file: rel, bytes: d.length, sha256: sha(d) }); }
  lista.sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(pasta, 'COMPOSICAO.json'), JSON.stringify({ schema: 2, product: 'SuperPROC v2', version: versao, sourceDigest: sha('digest-' + versao), files: lista }));
  const dir = path.join(tmp, 'zips'); fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, `SuperPROC-v2-${versao.replace(/\W/g, '')}.zip`); zipDirectory(pasta, zip, path.basename(zip, '.zip'));
  return zip;
}

// ---- chaves e pacote ----
const privada = path.join(tmp, 'k', 'privada.pem'), publicaArq = path.join(tmp, 'k2', 'atualizacao.json');
gerar({ arqPrivada: privada, arqPublica: publicaArq });
const cfg = JSON.parse(fs.readFileSync(publicaArq, 'utf8')), pem = fs.readFileSync(privada, 'utf8');
const zip = pacote('0.1.0');

// ---- resumo ----
const r = P.resumirPacote(zip);
assert.equal(r.versao, '0.1.0'); assert.equal(r.digest, sha('digest-0.1.0')); assert.equal(r.sha256, sha(fs.readFileSync(zip))); assert.equal(r.bytes, fs.statSync(zip).size); assert.equal(r.arquivos, 2);
assert.equal(r.nome, 'SuperPROC-v2-010.zip');
assert.throws(() => P.resumirPacote(path.join(tmp, 'nao-existe.zip')), /não encontrado/);
const corrompido = path.join(tmp, 'zips', 'SuperPROC-v2-corrompido.zip'), bruto = fs.readFileSync(zip); bruto[300] ^= 0xFF; fs.writeFileSync(corrompido, bruto);
assert.throws(() => P.resumirPacote(corrompido), /./, 'zip adulterado é recusado antes de publicar');

// ---- manifesto assinado: o zip é identificado pelo NOME (o app o procura na pasta) ----
const agora = new Date('2026-11-10T12:00:00Z');
const m = P.montarManifesto({ resumo: r, notas: 'Primeira versão', minima: '0.1.0', chavePrivadaPem: pem, chavePublicaPem: cfg.chavePublicaPem, agora });
const p = U.verificarManifesto(m, cfg.chavePublicaPem);
assert.deepEqual(p.zip, { nome: r.nome, bytes: r.bytes, sha256: r.sha256 }); assert.equal(p.versao, '0.1.0'); assert.equal(p.digest, r.digest); assert.equal(p.minimaVersao, '0.1.0'); assert.equal(p.publicadoEm, '2026-11-10T12:00:00.000Z');
assert.ok(!('id' in p.zip), 'nenhum ID do Drive no manifesto');
const sem = P.montarManifesto({ resumo: r, chavePrivadaPem: pem, chavePublicaPem: cfg.chavePublicaPem });
assert.ok(!('notas' in sem.payload) && !('minimaVersao' in sem.payload), 'campos opcionais só entram se informados');
assert.throws(() => P.montarManifesto({ resumo: r, minima: 'x', chavePrivadaPem: pem, chavePublicaPem: cfg.chavePublicaPem }), /mínima/);
assert.throws(() => P.montarManifesto({ resumo: { ...r, nome: '../x.zip' }, chavePrivadaPem: pem, chavePublicaPem: cfg.chavePublicaPem }), /Nome do pacote/);
const outra = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
assert.throws(() => P.montarManifesto({ resumo: r, chavePrivadaPem: outra, chavePublicaPem: cfg.chavePublicaPem }), /Assinatura/, 'chave privada que não corresponde à pública do app é recusada');

// ---- gravação: manifesto-<versão>.json, sem sobrescrever ----
const saida = path.join(tmp, 'saida'), arq = P.gravarManifesto(m, saida);
assert.equal(arq, path.join(saida, '0.1.0', 'manifesto-0.1.0.json')); assert.deepEqual(JSON.parse(fs.readFileSync(arq, 'utf8')), m);
assert.match(path.basename(arq), /^manifesto-\d+\.\d+\.\d+\.json$/, 'o nome segue o padrão que o app procura');
assert.equal(U.verificarManifesto(JSON.parse(fs.readFileSync(arq, 'utf8')), cfg.chavePublicaPem).versao, '0.1.0', 'o arquivo gravado verifica');
assert.throws(() => P.gravarManifesto(m, saida), /EEXIST/, 'não sobrescreve publicação existente');
assert.ok(!fs.readFileSync(arq, 'utf8').includes('PRIVATE'), 'sem chave privada no manifesto');

// ---- repositório e ID da pasta ----
assert.equal(P.definirRepositorio('dono/repo-teste', publicaArq).repositorio, 'dono/repo-teste');
const salvoRepo = JSON.parse(fs.readFileSync(publicaArq, 'utf8'));
assert.equal(salvoRepo.repositorio, 'dono/repo-teste');
assert.equal(salvoRepo.chavePublicaPem, cfg.chavePublicaPem, 'a chave pública é preservada');
assert.ok(!('pastaId' in salvoRepo), 'pastaId removido ao definir repositorio');
assert.throws(() => P.definirRepositorio('invalido-sem-barra', publicaArq), /inválido/);

assert.equal(P.definirPastaId(ID_PASTA, publicaArq).pastaId, ID_PASTA);
const salvo = JSON.parse(fs.readFileSync(publicaArq, 'utf8')); assert.equal(salvo.pastaId, ID_PASTA); assert.equal(salvo.chavePublicaPem, cfg.chavePublicaPem, 'a chave pública é preservada');
fs.writeFileSync(publicaArq, JSON.stringify({ ...salvo, manifestoId: 'antigoIDxxxxxxxx' })); assert.ok(!('manifestoId' in P.definirPastaId(ID_PASTA, publicaArq)), 'o campo antigo é removido');
assert.throws(() => P.definirPastaId('curto', publicaArq), /inválido/); assert.throws(() => P.definirPastaId('../../etc/passwd', publicaArq), /inválido/);

// ---- chave privada via env ----
process.env.SUPERPROC_PRIVATE_KEY_PEM = pem;
assert.equal(P.obterChavePrivada(), pem.trim());
delete process.env.SUPERPROC_PRIVATE_KEY_PEM;

// ---- argumentos ----
assert.deepEqual(P.argumentos(['--zip', 'a.zip', '--notas', 'X']), { zip: 'a.zip', notas: 'X' });
assert.deepEqual(P.argumentos(['--repo', 'dono/repo']), { repo: 'dono/repo' });
assert.throws(() => P.argumentos(['--rm', '1']), /inválido/); assert.throws(() => P.argumentos(['--zip']), /inválido/); assert.throws(() => P.argumentos(['--zip-id', 'X']), /inválido/, 'o argumento antigo não existe mais');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-publicar: ok');
