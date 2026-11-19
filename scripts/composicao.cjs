'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = 2;
const BUFFER_SIZE = 64 * 1024;
const APP_ENTRIES = ['browser', 'extensao-superproc', 'LEITORDEPDFCOMCAPACIDADEEMBEDDED', 'package.json', 'ICO_BROWSER.png'];
const APP_DEPENDENCIES = ['node_modules/pdfjs-dist', 'node_modules/@napi-rs'];
// AZflow e Epryx não vão no pacote: o usuário as instala da Chrome Web Store (ver browser/extensao-instalador.js).
const FORBIDDEN_APP_PARTS = new Set(['azflow', 'epryx', 'extensoes-estaveis', '.test-runs', 'docs', 'exports', 'ferramentas-build', 'graphify-out', 'propostas_de_correção', 'reports', 'scripts', 'AGENTS.md', 'README.md', 'package-lock.json', 'iniciar-browser.bat', '1 EXPORTAR_PARA_TRABALHO.bat']);

function sha256File(file) {
  const hash = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(BUFFER_SIZE);
  try { for (;;) { const read = fs.readSync(fd, buffer, 0, buffer.length, null); if (!read) break; hash.update(buffer.subarray(0, read)); } }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function hashJson(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function safeRelative(value) { return typeof value === 'string' && value && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..'); }
function assertInside(parent, child, label) {
  const base = path.resolve(parent), resolved = path.resolve(child);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error(`${label || 'Caminho'} fora da pasta permitida.`);
  return resolved;
}
function assertRegularDirectory(dir, label) {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} deve ser uma pasta física.`);
}
function omittableDependencyFile(relative) {
  const parts = relative.split('/'), name = parts.at(-1);
  return name.endsWith('.map') || name.endsWith('.d.ts') || parts.some(part => ['test', 'tests', '__tests__', 'examples', 'example', 'docs'].includes(part));
}
// Leis baixadas não vão no portátil (milhares de arquivos a descompactar): o aplicativo baixa cada norma, já limpa, quando ela é aberta.
// Continuam indo o catálogo (um arquivo) e o padrao.json (ordem do Acesso Rápido padrão).
// Também ficam de fora scripts sem uso (nenhum módulo os carrega) e o modelo de desenvolvimento de módulos.
const EXCLUDED_APP_PATHS = new Set(['config/atualizacao.local.json', 'browser/legislacao/dados/biblioteca-inicial', 'extensao-superproc/modules/automacoes/saneador.js', 'extensao-superproc/modules/automacoes/eproc_bridge.js']);
function omittableProductionFile(relative) { const name = relative.split('/').at(-1); return name.endsWith('.map') || name.endsWith('.d.ts') || EXCLUDED_APP_PATHS.has(relative); }
function walk(root, relative, entries, shouldOmit = () => false) {
  const absolute = assertInside(root, path.join(root, relative), 'Fonte'), stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Link recusado na composição: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) { const child = relative ? `${relative}/${name}` : name; if (!shouldOmit(child)) walk(root, child, entries, shouldOmit); }
  } else if (stat.isFile()) entries.push({ file: relative.replaceAll('\\', '/'), bytes: stat.size, sha256: sha256File(absolute) });
  else throw new Error(`Tipo de arquivo não suportado: ${relative}`);
}
function collect(root, selected, dependency = false) {
  const files = [];
  for (const relative of selected) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`Insumo obrigatório ausente: ${relative}`);
    walk(root, relative, files, dependency ? omittableDependencyFile : omittableProductionFile);
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
// Inclui dependências de produção e transitivas instaladas conforme o lockfile.
// Mantém fora pacotes exclusivos de desenvolvimento; opcionais de outra plataforma podem faltar.
function productionDependencies(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const selected = new Set(APP_DEPENDENCIES);
  for (const [relative, metadata] of Object.entries(lock.packages || {})) {
    if (!relative || metadata.dev === true || !relative.startsWith('node_modules/')) continue;
    if (!safeRelative(relative)) throw new Error('Caminho inválido no lockfile.');
    if (!fs.existsSync(path.join(root, relative))) {
      if (metadata.optional === true) continue;
      throw new Error(`Dependência de produção ausente: ${relative}`);
    }
    selected.add(relative);
  }
  return [...selected].sort().filter(relative => ![...selected].some(parent => parent !== relative && relative.startsWith(parent + '/')));
}
function collectRuntime(root) {
  const runtime = path.join(root, 'node_modules/electron/dist');
  if (!fs.existsSync(runtime)) throw new Error('Runtime do Electron ausente. Execute npm ci antes de exportar.');
  const files = [];
  walk(runtime, '', files, relative => relative === 'resources/default_app.asar' || relative.endsWith('.map') || relative.endsWith('.d.ts'));
  if (!files.some(file => file.file === 'electron.exe')) throw new Error('electron.exe ausente do runtime.');
  return files.map(file => ({ ...file, file: `node_modules/electron/dist/${file.file}` })).sort((a, b) => a.file.localeCompare(b.file));
}
function packageMetadata(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.main !== 'browser/main.js') throw new Error('package.json precisa apontar main para browser/main.js.');
  return { name: pkg.name, version: pkg.version, main: pkg.main };
}
function snapshot(root = ROOT) {
  const patcher = path.join(root, 'ferramentas-build/rcedit.exe'), icon = path.join(root, 'ICO_BROWSER.ico');
  for (const required of [patcher, icon]) if (!fs.existsSync(required) || fs.lstatSync(required).isSymbolicLink()) throw new Error(`Exportação abortada: insumo ausente ou link recusado (${path.relative(root, required)}).`);
  const input = { schema: SCHEMA, product: 'SuperPROC v2', package: packageMetadata(root), appFiles: collect(root, [...APP_ENTRIES, ...(fs.existsSync(path.join(root, 'config')) ? ['config'] : [])]), dependencyFiles: collect(root, productionDependencies(root), true), runtimeFiles: collectRuntime(root), patcher: { file: 'ferramentas-build/rcedit.exe', bytes: fs.statSync(patcher).size, sha256: sha256File(patcher) }, icon: { file: 'ICO_BROWSER.ico', bytes: fs.statSync(icon).size, sha256: sha256File(icon) } };
  return { ...input, digest: hashJson(input) };
}
function copyChecked(source, target, expected) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const inFd = fs.openSync(source, 'r'); let outFd; const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(BUFFER_SIZE); let bytes = 0;
  try { outFd = fs.openSync(target, 'wx'); for (;;) { const read = fs.readSync(inFd, buffer, 0, buffer.length, null); if (!read) break; fs.writeSync(outFd, buffer, 0, read); hash.update(buffer.subarray(0, read)); bytes += read; } }
  finally { fs.closeSync(inFd); if (outFd !== undefined) fs.closeSync(outFd); }
  const sha256 = hash.digest('hex');
  if (bytes !== expected.bytes || sha256 !== expected.sha256) throw new Error(`A fonte mudou durante a exportação: ${expected.file}`);
  return { bytes, sha256 };
}
function outputRuntimeName(file) {
  const relative = file.replace(/^node_modules\/electron\/dist\//, '');
  return relative === 'electron.exe' ? 'SuperPROC_v2.exe' : relative;
}
function copySet(root, stage, files, destination, outputName = file => file) {
  return files.map(entry => {
    const targetRelative = outputName(entry.file);
    if (!safeRelative(targetRelative)) throw new Error(`Caminho de saída inválido: ${targetRelative}`);
    const source = assertInside(root, path.join(root, entry.file), 'Fonte'), target = assertInside(destination, path.join(destination, targetRelative), 'Destino');
    return { file: path.relative(stage, target).replaceAll('\\', '/'), ...copyChecked(source, target, entry) };
  });
}
function patchExecutable(root, stage, spawn = spawnSync) {
  const exe = path.join(stage, 'SuperPROC_v2.exe');
  const patch = spawn(path.join(root, 'ferramentas-build/rcedit.exe'), [exe, '--set-icon', path.join(root, 'ICO_BROWSER.ico'), '--set-version-string', 'FileDescription', 'eproc', '--set-version-string', 'ProductName', 'eproc', '--set-version-string', 'CompanyName', 'eproc', '--set-version-string', 'InternalName', 'eproc'], { stdio: 'pipe', windowsHide: true });
  if (patch.error || patch.status !== 0) throw new Error(`Não foi possível embutir o ícone do eproc. ${patch.error ? patch.error.message : String(patch.stderr || '').trim() || `rcedit código ${patch.status}`}`);
}
function verifyArtifact(directory) {
  assertRegularDirectory(directory, 'Distribuição');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'COMPOSICAO.json'), 'utf8'));
  if (manifest.schema !== SCHEMA || !Array.isArray(manifest.files) || !manifest.sourceDigest) throw new Error('Manifesto final inválido.');
  let previous = '';
  for (const entry of manifest.files) {
    if (!safeRelative(entry.file) || (previous && entry.file.localeCompare(previous) <= 0) || !Number.isSafeInteger(entry.bytes) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Entrada inválida no manifesto final: ${entry.file}`);
    previous = entry.file;
    const actual = assertInside(directory, path.join(directory, entry.file), 'Arquivo do manifesto'), stat = fs.lstatSync(actual);
    if (!stat.isFile() || stat.size !== entry.bytes || sha256File(actual) !== entry.sha256) throw new Error(`Integridade inválida: ${entry.file}`);
  }
  for (const forbidden of FORBIDDEN_APP_PARTS) if (fs.existsSync(path.join(directory, 'resources/app', forbidden))) throw new Error(`Conteúdo de desenvolvimento encontrado no portátil: ${forbidden}`);
  for (const required of ['SuperPROC_v2.exe', 'resources/app/package.json', 'resources/app/browser/main.js']) if (!fs.existsSync(path.join(directory, required))) throw new Error(`Arquivo obrigatório ausente: ${required}`);
  if (JSON.parse(fs.readFileSync(path.join(directory, 'resources/app/package.json'), 'utf8')).main !== 'browser/main.js') throw new Error('package.json do portátil aponta para entrada inválida.');
  return { files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), sourceDigest: manifest.sourceDigest };
}

// ---------- ZIP portátil (Deflate, sem perdas) ----------
const ZIP_MAX = 0xFFFFFFFF;
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}
// Cria o .zip a partir da pasta, com tudo dentro de <prefix>/ (ao extrair surge uma única pasta). Arquivo a arquivo, sem carregar tudo na memória.
function zipDirectory(directory, zipFile, prefix) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Link simbólico na exportação; zip recusado.');
      if (entry.isDirectory()) walk(full); else if (entry.isFile()) files.push(full); else throw new Error('Tipo de arquivo inesperado na exportação.');
    }
  })(directory);
  if (files.length >= 0xFFFF) throw new Error('Arquivos demais para um .zip simples.');
  const fd = fs.openSync(zipFile, 'wx'), central = []; let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf, 0, buf.length); offset += buf.length; };
  try {
    for (const full of files) {
      const rel = path.relative(directory, full).split(path.sep).join('/'), name = Buffer.from((prefix ? prefix + '/' : '') + rel, 'utf8');
      const data = fs.readFileSync(full), stat = fs.statSync(full), stamp = dosDateTime(stat.mtime), crc = zlib.crc32(data) >>> 0;
      let method = 8, body = zlib.deflateRawSync(data, { level: 6 });
      if (body.length >= data.length) { method = 0; body = data; }
      if (data.length >= ZIP_MAX || body.length >= ZIP_MAX || offset >= ZIP_MAX - 1e6) throw new Error('Exportação grande demais para .zip simples (limite de 4 GB).');
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8); local.writeUInt16LE(stamp.time, 10); local.writeUInt16LE(stamp.date, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
      const entryOffset = offset; write(local); write(name); write(body);
      const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(method, 10); head.writeUInt16LE(stamp.time, 12); head.writeUInt16LE(stamp.date, 14);
      head.writeUInt32LE(crc, 16); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(name.length, 28); head.writeUInt32LE(entryOffset, 42);
      central.push(head, name);
    }
    const start = offset, directoryBuf = Buffer.concat(central); write(directoryBuf);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directoryBuf.length, 12); end.writeUInt32LE(start, 16); write(end);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  return { files: files.length, bytes: fs.statSync(zipFile).size };
}
// Lê o .zip do disco entrada por entrada (sem extrair), confere CRC-32 e SHA-256 contra o COMPOSICAO.json que está dentro dele.
function verifyZip(zipFile, prefix) {
  const fd = fs.openSync(zipFile, 'r');
  try {
    const size = fs.fstatSync(fd).size, tailLen = Math.min(size, 22 + 65535), tail = Buffer.alloc(tailLen); fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('ZIP inválido: sem diretório central.');
    const count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16), cd = Buffer.alloc(cdSize);
    if (cdOffset + cdSize > size) throw new Error('ZIP inválido: diretório central fora do arquivo.');
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = new Map(); let pos = 0;
    for (let k = 0; k < count; k++) {
      if (cd.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP inválido: diretório central corrompido.');
      const method = cd.readUInt16LE(pos + 10), crc = cd.readUInt32LE(pos + 16), csize = cd.readUInt32LE(pos + 20), usize = cd.readUInt32LE(pos + 24);
      const nl = cd.readUInt16LE(pos + 28), xl = cd.readUInt16LE(pos + 30), cl = cd.readUInt16LE(pos + 32), loc = cd.readUInt32LE(pos + 42), name = cd.toString('utf8', pos + 46, pos + 46 + nl); pos += 46 + nl + xl + cl;
      if (!name.startsWith(prefix + '/') || !safeRelative(name.slice(prefix.length + 1)) || entries.has(name.slice(prefix.length + 1))) throw new Error('ZIP inválido: nome de entrada inesperado.');
      entries.set(name.slice(prefix.length + 1), { method, crc, csize, usize, loc });
    }
    const read = (entry) => {
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, entry.loc); if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP inválido: cabeçalho local.');
      const body = Buffer.alloc(entry.csize); fs.readSync(fd, body, 0, entry.csize, entry.loc + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28));
      const data = entry.method === 8 ? zlib.inflateRawSync(body) : entry.method === 0 ? body : null;
      if (!data) throw new Error('ZIP inválido: método de compressão inesperado.');
      return data;
    };
    const manifestEntry = entries.get('COMPOSICAO.json'); if (!manifestEntry) throw new Error('ZIP sem COMPOSICAO.json.');
    const manifest = JSON.parse(read(manifestEntry).toString('utf8'));
    if (manifest.schema !== SCHEMA || !Array.isArray(manifest.files)) throw new Error('Manifesto do ZIP inválido.');
    const expected = new Set(manifest.files.map(f => f.file)); expected.add('COMPOSICAO.json');
    for (const name of entries.keys()) if (!expected.has(name)) throw new Error('ZIP contém arquivo fora do manifesto: ' + name);
    for (const name of expected) if (!entries.has(name)) throw new Error('ZIP sem arquivo do manifesto: ' + name);
    for (const file of manifest.files) {
      const entry = entries.get(file.file), data = read(entry);
      if (data.length !== entry.usize || data.length !== file.bytes || (zlib.crc32(data) >>> 0) !== entry.crc || crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('Integridade inválida no ZIP: ' + file.file);
    }
    return { files: manifest.files.length, bytes: size, sourceDigest: manifest.sourceDigest, version: manifest.version };
  } finally { fs.closeSync(fd); }
}
function cleanStage(stagingRoot, stage) {
  if (!stage || !fs.existsSync(stage)) return;
  assertInside(stagingRoot, stage, 'Staging');
  if (fs.lstatSync(stage).isSymbolicLink()) throw new Error('Staging inesperadamente virou link; limpeza recusada.');
  fs.rmSync(stage, { recursive: true, force: true });
}
function exportPortable(options = {}) {
  const root = options.root || ROOT, source = snapshot(options.root || ROOT), exportsRoot = path.join(root, 'exports');
  if (fs.existsSync(exportsRoot)) assertRegularDirectory(exportsRoot, 'exports'); else fs.mkdirSync(exportsRoot, { recursive: true });
  const destination = assertInside(exportsRoot, path.join(exportsRoot, `SuperPROC-v2-${source.digest.slice(0, 12)}`), 'Destino');
  const zipDestination = destination + '.zip', wantZip = options.zip !== false;
  if (fs.existsSync(destination) || (wantZip && fs.existsSync(zipDestination))) throw new Error('Já existe uma exportação para estes insumos; nenhuma sobrescrita foi feita.');
  const stagingRoot = path.join(exportsRoot, '.staging'); if (fs.existsSync(stagingRoot)) assertRegularDirectory(stagingRoot, 'Staging'); else fs.mkdirSync(stagingRoot, { recursive: true });
  const stage = path.join(stagingRoot, `${path.basename(destination)}-${process.pid}-${crypto.randomBytes(6).toString('hex')}`); let published = false, zipStage = null;
  try {
    fs.mkdirSync(stage, { recursive: false }); if (typeof options.onBeforeCopy === 'function') options.onBeforeCopy(source);
    const finalFiles = [...copySet(root, stage, source.runtimeFiles, stage, outputRuntimeName), ...copySet(root, stage, source.appFiles, path.join(stage, 'resources/app')), ...copySet(root, stage, source.dependencyFiles, path.join(stage, 'resources/app'))];
    patchExecutable(root, stage, options.spawn || spawnSync);
    const exe = path.join(stage, 'SuperPROC_v2.exe'), index = finalFiles.findIndex(file => file.file === 'SuperPROC_v2.exe');
    finalFiles[index] = { file: 'SuperPROC_v2.exe', bytes: fs.statSync(exe).size, sha256: sha256File(exe) }; finalFiles.sort((a, b) => a.file.localeCompare(b.file));
    fs.writeFileSync(path.join(stage, 'COMPOSICAO.json'), `${JSON.stringify({ schema: SCHEMA, product: 'SuperPROC v2', version: source.package.version, sourceDigest: source.digest, files: finalFiles }, null, 2)}\n`, { flag: 'wx' });
    const verified = verifyArtifact(stage), result = { export: destination, digest: source.digest, ...verified };
    if (wantZip) {
      zipStage = stage + '.zip'; const made = zipDirectory(stage, zipStage, path.basename(destination)); verifyZip(zipStage, path.basename(destination));
      result.zip = zipDestination; result.zipBytes = made.bytes;
      fs.renameSync(zipStage, zipDestination);
    }
    try { fs.renameSync(stage, destination); published = true; } catch (error) { if (wantZip) fs.rmSync(zipDestination, { force: true }); throw error; }
    return result;
  } finally { if (!published) { cleanStage(stagingRoot, stage); if (zipStage) fs.rmSync(zipStage, { force: true }); } }
}
function inventory(root = ROOT) { const current = snapshot(root); return [...current.appFiles, ...current.dependencyFiles, ...current.runtimeFiles].sort((a, b) => a.file.localeCompare(b.file)); }
function main() {
  const args = process.argv.slice(2);
  const valid = args.length === 0 || (args.length === 1 && args[0] === '--export') || (args.length === 2 && (args[0] === '--verify' || args[0] === '--verify-zip'));
  if (!valid) throw new Error('Use sem argumentos, --export, --verify <pasta> ou --verify-zip <arquivo.zip>.');
  if (args[0] === '--export') console.log(JSON.stringify(exportPortable()));
  else if (args[0] === '--verify') console.log(JSON.stringify(verifyArtifact(args[1])));
  else if (args[0] === '--verify-zip') console.log(JSON.stringify(verifyZip(args[1], path.basename(args[1], '.zip'))));
  else { const current = snapshot(); console.log(JSON.stringify({ files: inventory().length, digest: current.digest, exported: false })); }
}
module.exports = { zipDirectory, verifyZip, APP_DEPENDENCIES, APP_ENTRIES, exportPortable, inventory, sha256File, snapshot, verifyArtifact };
if (require.main === module) main();
