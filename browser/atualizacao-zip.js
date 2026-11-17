'use strict';
// Extração segura do pacote .zip de atualização e conferência contra o COMPOSICAO.json que vai dentro dele.
// Só lê o formato produzido por scripts/composicao.cjs (zip simples, sem ZIP64, sem criptografia). Recusa caminhos
// que saiam da pasta, links simbólicos, duplicados e arquivos fora do manifesto. Tudo em fluxo: nenhum arquivo é
// carregado inteiro na memória (o SuperPROC_v2.exe tem centenas de MB).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { Transform, PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_ARQUIVOS = 20000;
const MAX_BYTES_TOTAL = 3 * 1024 * 1024 * 1024; // teto de sanidade contra "zip bomb"
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function lerDiretorioCentral(zipFile) {
  const fd = fs.openSync(zipFile, 'r');
  try {
    const tamanho = fs.fstatSync(fd).size;
    if (tamanho < 22) throw new Error('Pacote inválido (pequeno demais).');
    const leitura = Math.min(tamanho, 65557), fim = Buffer.alloc(leitura);
    fs.readSync(fd, fim, 0, leitura, tamanho - leitura);
    let eocd = -1;
    for (let i = leitura - 22; i >= 0; i--) if (fim.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Pacote inválido (sem diretório central).');
    const total = fim.readUInt16LE(eocd + 10), tamCd = fim.readUInt32LE(eocd + 12), offCd = fim.readUInt32LE(eocd + 16);
    if (total === 0xFFFF || tamCd === 0xFFFFFFFF || offCd === 0xFFFFFFFF) throw new Error('Pacote ZIP64 não suportado.');
    if (total > MAX_ARQUIVOS) throw new Error('Pacote com arquivos demais.');
    if (offCd + tamCd > tamanho) throw new Error('Pacote inválido (diretório central fora do arquivo).');
    const cd = Buffer.alloc(tamCd); fs.readSync(fd, cd, 0, tamCd, offCd);
    const entradas = []; let p = 0;
    for (let i = 0; i < total; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Pacote inválido (entrada corrompida).');
      const flags = cd.readUInt16LE(p + 8), metodo = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nomeLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), comLen = cd.readUInt16LE(p + 32), attr = cd.readUInt32LE(p + 38), off = cd.readUInt32LE(p + 42);
      if (flags & 1) throw new Error('Pacote criptografado não suportado.');
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || off === 0xFFFFFFFF) throw new Error('Pacote ZIP64 não suportado.');
      if (metodo !== 0 && metodo !== 8) throw new Error('Método de compressão não suportado.');
      const nome = cd.subarray(p + 46, p + 46 + nomeLen).toString('utf8');
      entradas.push({ nome, metodo, crc, csize, usize, off, link: ((attr >>> 16) & 0xF000) === 0xA000 });
      p += 46 + nomeLen + extraLen + comLen;
    }
    return { fd, entradas, tamanho };
  } catch (e) { fs.closeSync(fd); throw e; }
}

// Valida e normaliza um caminho relativo vindo do zip (já sem o prefixo). Devolve segmentos ou lança erro.
function segmentosSeguros(relativo) {
  if (!relativo || relativo.includes('\\') || relativo.includes('\0') || relativo.startsWith('/') || /^[A-Za-z]:/.test(relativo)) throw new Error('Caminho recusado no pacote: ' + relativo);
  const partes = relativo.split('/');
  for (const s of partes) {
    if (!s || s === '.' || s === '..' || s.includes(':') || /[<>"|?*]/.test(s) || /[. ]$/.test(s) || RESERVADOS.test(s)) throw new Error('Caminho recusado no pacote: ' + relativo);
  }
  return partes;
}

class Medidor extends Transform {
  constructor(limite) { super(); this.bytes = 0; this.crc = 0; this.hash = crypto.createHash('sha256'); this.limite = limite; }
  _transform(parte, _enc, cb) {
    this.bytes += parte.length;
    if (this.bytes > this.limite) return cb(new Error('Arquivo maior que o declarado no pacote.'));
    this.crc = zlib.crc32(parte, this.crc) >>> 0; this.hash.update(parte); cb(null, parte);
  }
}

// Extrai `zipFile` em `destino` (que não pode existir). Todas as entradas devem estar sob uma única pasta raiz,
// que é removida do caminho. Em qualquer erro, `destino` é apagado. Devolve { arquivos, bytes, raiz }.
async function extrairZip(zipFile, destino) {
  if (fs.existsSync(destino)) throw new Error('A pasta de destino já existe.');
  const { fd, entradas } = lerDiretorioCentral(zipFile);
  let criou = false;
  try {
    const raizes = new Set(), vistos = new Set(); let totalDeclarado = 0, arquivos = 0;
    const plano = [];
    for (const e of entradas) {
      if (e.link) throw new Error('Link simbólico no pacote: ' + e.nome);
      const partes = e.nome.replace(/\/$/, '').split('/');
      if (partes.length < 1 || !partes[0]) throw new Error('Entrada inválida no pacote.');
      raizes.add(partes[0]);
      if (e.nome.endsWith('/')) { segmentosSeguros(e.nome.replace(/\/$/, '')); continue; }
      if (partes.length < 2) throw new Error('Arquivo fora da pasta raiz do pacote: ' + e.nome);
      const rel = partes.slice(1).join('/'), chave = rel.toLowerCase();
      segmentosSeguros(e.nome);
      if (vistos.has(chave)) throw new Error('Entrada duplicada no pacote: ' + rel);
      vistos.add(chave); totalDeclarado += e.usize; arquivos++;
      plano.push({ ...e, rel });
    }
    if (raizes.size !== 1) throw new Error('O pacote deve ter uma única pasta raiz.');
    if (!arquivos) throw new Error('Pacote vazio.');
    if (totalDeclarado > MAX_BYTES_TOTAL) throw new Error('Pacote descompactado grande demais.');
    fs.mkdirSync(destino); criou = true;
    let bytes = 0;
    for (const e of plano) {
      const alvo = path.join(destino, ...e.rel.split('/'));
      if (path.relative(destino, alvo).startsWith('..')) throw new Error('Caminho fora do destino: ' + e.rel);
      fs.mkdirSync(path.dirname(alvo), { recursive: true });
      const cab = Buffer.alloc(30); fs.readSync(fd, cab, 0, 30, e.off);
      if (cab.readUInt32LE(0) !== 0x04034b50) throw new Error('Cabeçalho local inválido: ' + e.rel);
      const inicio = e.off + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28);
      const medidor = new Medidor(e.usize);
      const fonte = e.csize === 0 ? new PassThrough().end() : fs.createReadStream(null, { fd, start: inicio, end: inicio + e.csize - 1, autoClose: false });
      await pipeline(fonte, e.metodo === 8 ? zlib.createInflateRaw() : new PassThrough(), medidor, fs.createWriteStream(alvo, { flags: 'wx' }));
      if (medidor.bytes !== e.usize || medidor.crc !== e.crc) throw new Error('Integridade inválida (CRC) em ' + e.rel);
      bytes += medidor.bytes;
    }
    return { arquivos, bytes, raiz: [...raizes][0] };
  } catch (err) {
    if (criou) fs.rmSync(destino, { recursive: true, force: true });
    throw err;
  } finally { fs.closeSync(fd); }
}

function sha256Arquivo(arquivo) {
  const hash = crypto.createHash('sha256'), fd = fs.openSync(arquivo, 'r'), buf = Buffer.allocUnsafe(1024 * 1024);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function listarArquivos(raiz, rel = '', saida = []) {
  for (const nome of fs.readdirSync(path.join(raiz, rel))) {
    const r = rel ? rel + '/' + nome : nome, st = fs.lstatSync(path.join(raiz, r));
    if (st.isSymbolicLink()) throw new Error('Link simbólico no pacote extraído: ' + r);
    if (st.isDirectory()) listarArquivos(raiz, r, saida); else if (st.isFile()) saida.push(r); else throw new Error('Tipo de arquivo inesperado: ' + r);
  }
  return saida;
}

// Confere a pasta extraída contra o COMPOSICAO.json: versão e digest esperados (os do manifesto assinado), cada
// arquivo com tamanho e SHA-256 corretos, e nenhum arquivo além dos listados.
function conferirComposicao(pasta, { versao, digest }) {
  let comp;
  try { comp = JSON.parse(fs.readFileSync(path.join(pasta, 'COMPOSICAO.json'), 'utf8')); } catch { throw new Error('COMPOSICAO.json ausente ou ilegível no pacote.'); }
  if (comp.schema !== 2 || comp.product !== 'SuperPROC v2' || !Array.isArray(comp.files)) throw new Error('COMPOSICAO.json inválido.');
  if (comp.version !== versao) throw new Error(`Versão do pacote (${comp.version}) diferente da anunciada (${versao}).`);
  if (comp.sourceDigest !== digest) throw new Error('O digest do pacote não confere com o do manifesto.');
  const listados = new Set();
  for (const f of comp.files) {
    segmentosSeguros(f.file);
    if (listados.has(f.file.toLowerCase())) throw new Error('Arquivo repetido no COMPOSICAO.json: ' + f.file);
    listados.add(f.file.toLowerCase());
    const abs = path.join(pasta, ...f.file.split('/')); let st;
    try { st = fs.lstatSync(abs); } catch { throw new Error('Arquivo do pacote ausente: ' + f.file); }
    if (!st.isFile() || st.size !== f.bytes || sha256Arquivo(abs) !== f.sha256) throw new Error('Integridade inválida: ' + f.file);
  }
  for (const r of listarArquivos(pasta)) if (r !== 'COMPOSICAO.json' && !listados.has(r.toLowerCase())) throw new Error('Arquivo fora do manifesto no pacote: ' + r);
  return { arquivos: comp.files.length };
}

module.exports = { extrairZip, conferirComposicao, segmentosSeguros, lerDiretorioCentral };
