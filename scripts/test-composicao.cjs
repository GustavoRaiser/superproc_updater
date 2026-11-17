'use strict';
// Testes sintéticos: nenhum Electron, rcedit, conta ou exportação real é usado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { exportPortable, verifyArtifact, verifyZip } = require('./composicao.cjs');

const testRunsDir = path.resolve(__dirname, '..', '.test-runs');
if (!fs.existsSync(testRunsDir)) fs.mkdirSync(testRunsDir, { recursive: true });
const scratch = fs.mkdtempSync(path.join(testRunsDir, 'unit-export-'));
function put(root, file, data) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
function fixture(name) {
  const root = path.join(scratch, name);
  put(root, 'package.json', JSON.stringify({ name: 'synthetic', version: '1.2.3', main: 'browser/main.js' }));
  for (const directory of ['extensao-superproc/core', 'extensao-superproc/icons', 'LEITORDEPDFCOMCAPACIDADEEMBEDDED', 'extensao-superproc/modules', 'extensao-superproc/popup', 'extensao-superproc/organizador', 'extensao-superproc/v2-metrics']) put(root, `${directory}/.keep`, 'synthetic');
  put(root, 'package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: {
    '': {}, 'node_modules/@azure/msal-node': { dependencies: { 'dummy-token': '1.0.0' } },
    'node_modules/dummy-token': {}, 'node_modules/dev-only': { dev: true },
    'node_modules/platform-other': { optional: true }
  } }));
  put(root, 'node_modules/@azure/msal-node/index.js', 'module.exports = {}');
  put(root, 'node_modules/dummy-token/index.js', 'module.exports = {}');
  put(root, 'node_modules/dev-only/index.js', 'not for portable');
  put(root, 'browser/main.js', 'console.log("synthetic")'); put(root, 'browser/ICO_BROWSER.png', 'synthetic icon fallback'); put(root, 'browser/main.js.map', '{}');
  put(root, 'browser/legislacao/dados/biblioteca-inicial/indice.json', '{}'); put(root, 'browser/legislacao/dados/biblioteca-inicial/normas/leis-ordinarias/2002/lei-1.md', 'lei baixada'); put(root, 'browser/legislacao/dados/padrao.json', '[]'); put(root, 'browser/legislacao/dados/catalogo.json.gz', 'catalogo');
  put(root, 'extensao-superproc/manifest.json', '{}'); put(root, 'ICO_BROWSER.png', 'synthetic png'); put(root, 'ICO_BROWSER.ico', 'synthetic ico');
  put(root, 'node_modules/pdfjs-dist/build/pdf.mjs', 'export default 1'); put(root, 'node_modules/pdfjs-dist/types/pdf.d.ts', 'type X = 1'); put(root, 'node_modules/pdfjs-dist/build/pdf.mjs.map', '{}');
  put(root, 'node_modules/@napi-rs/canvas/index.js', 'module.exports = {}');
  put(root, 'config/atualizacao.local.json', '{"driveApiKey":"SYNTHETIC_ONLY"}');
  put(root, 'config/atualizacao.json', '{}');
  put(root, 'node_modules/electron/dist/electron.exe', 'synthetic electron'); put(root, 'node_modules/electron/dist/version', '1'); put(root, 'node_modules/electron/dist/resources/default_app.asar', 'omit');
  put(root, 'ferramentas-build/rcedit.exe', 'synthetic rcedit');
  put(root, '.env', 'SYNTHETIC_ONLY=true'); put(root, 'scripts/test.cjs', 'not for portable'); put(root, 'README.md', 'not for portable');
  return root;
}
function patch(_tool, args) { fs.appendFileSync(args[0], '-patched'); return { status: 0, stderr: '' }; }

const successRoot = fixture('success'), success = exportPortable({ root: successRoot, spawn: patch });
assert.equal(verifyArtifact(success.export).sourceDigest, success.digest); assert.ok(fs.existsSync(path.join(success.export, 'SuperPROC_v2.exe')));
const cliCheck = spawnSync(process.execPath, [path.join(__dirname, 'composicao.cjs'), '--verify', success.export], { encoding: 'utf8' });
assert.equal(cliCheck.status, 0, cliCheck.stderr); assert.equal(JSON.parse(cliCheck.stdout).sourceDigest, success.digest);
for (const omitted of ['.env', 'scripts', 'README.md', 'browser/main.js.map', 'node_modules/pdfjs-dist/types', 'node_modules/pdfjs-dist/build/pdf.mjs.map']) assert.ok(!fs.existsSync(path.join(success.export, 'resources/app', omitted)), omitted);
assert.ok(fs.existsSync(path.join(success.export, 'resources/app/node_modules/pdfjs-dist/build/pdf.mjs')));
// Leis baixadas ficam fora do portátil; o catálogo e o padrao.json continuam.
assert.ok(!fs.existsSync(path.join(success.export, 'resources/app/browser/legislacao/dados/biblioteca-inicial')), 'biblioteca inicial não deve ser exportada');
assert.ok(fs.existsSync(path.join(success.export, 'resources/app/browser/legislacao/dados/padrao.json')) && fs.existsSync(path.join(success.export, 'resources/app/browser/legislacao/dados/catalogo.json.gz')));

// Dependências de autenticação e transitivas são exportadas; dev/lockfile ficam fora.
for (const dependency of ['@azure/msal-node', 'dummy-token']) assert.ok(fs.existsSync(path.join(success.export, 'resources/app/node_modules', dependency, 'index.js')));
assert.ok(!fs.existsSync(path.join(success.export, 'resources/app/node_modules/dev-only')));
assert.ok(!fs.existsSync(path.join(success.export, 'resources/app/package-lock.json')));
assert.ok(!fs.existsSync(path.join(success.export, 'resources/app/config/atualizacao.local.json')), 'configuração local não deve ser exportada');
assert.ok(fs.existsSync(path.join(success.export, 'resources/app/config/atualizacao.json')), 'configuração pública deve ser exportada');
const missingDependencyRoot = fixture('missing-production-dependency');
fs.rmSync(path.join(missingDependencyRoot, 'node_modules/dummy-token'), { recursive: true });
assert.throws(() => exportPortable({ root: missingDependencyRoot, spawn: patch }), /Dependência de produção ausente/);

// ZIP Deflate: gerado junto com a pasta, verificado por CRC-32 + SHA-256 e recusado se adulterado.
assert.ok(success.zip.endsWith(path.basename(success.export) + '.zip') && fs.existsSync(success.zip) && success.zipBytes > 0);
assert.equal(verifyZip(success.zip, path.basename(success.export)).sourceDigest, success.digest);
const zipCli = spawnSync(process.execPath, [path.join(__dirname, 'composicao.cjs'), '--verify-zip', success.zip], { encoding: 'utf8' });
assert.equal(zipCli.status, 0, zipCli.stderr); assert.equal(JSON.parse(zipCli.stdout).files, success.files);
const zipBytes = fs.readFileSync(success.zip), tampered = path.join(scratch, path.basename(success.zip));
const marker = zipBytes.indexOf(Buffer.from('browser/main.js')) + 40; zipBytes[marker] ^= 0xff; fs.writeFileSync(tampered, zipBytes);
assert.throws(() => verifyZip(tampered, path.basename(success.export)));
assert.throws(() => exportPortable({ root: successRoot, spawn: patch }), /Já existe/);
const semZipRoot = fixture('sem-zip'), semZip = exportPortable({ root: semZipRoot, spawn: patch, zip: false });
assert.equal(semZip.zip, undefined); assert.ok(!fs.existsSync(semZip.export + '.zip'));

const failedRoot = fixture('patch-failure');
assert.throws(() => exportPortable({ root: failedRoot, spawn: () => ({ status: 1, stderr: 'synthetic failure' }) }), /Não foi possível embutir/);
assert.deepEqual(fs.readdirSync(path.join(failedRoot, 'exports')).filter(name => name !== '.staging'), []);

const changingRoot = fixture('changed-source');
assert.throws(() => exportPortable({ root: changingRoot, spawn: patch, onBeforeCopy: () => put(changingRoot, 'browser/main.js', 'mutated') }), /fonte mudou/);
assert.deepEqual(fs.readdirSync(path.join(changingRoot, 'exports')).filter(name => name !== '.staging'), []);

const corrupted = path.join(success.export, 'resources/app/browser/main.js'); fs.appendFileSync(corrupted, 'corruption');
assert.throws(() => verifyArtifact(success.export), /Integridade inválida/);
console.log(JSON.stringify({ ok: true, syntheticRoots: 3, files: success.files }));
fs.rmSync(scratch, { recursive: true, force: true });
