'use strict';
// Prepara a publicação de uma versão: confere o .zip exportado, calcula o SHA-256 e gera o manifesto ASSINADO
// (manifesto-<versão>.json; Ed25519, chave privada fora do projeto ou em secret SUPERPROC_PRIVATE_KEY_PEM).
// O app lista as releases públicas do GitHub, escolhe o maior manifesto de assinatura válida
// e localiza o .zip pelo nome que o manifesto informa: não há IDs a copiar e só se anexam arquivos à release.
//
// Uma vez só: aponte para o repositório público do GitHub e rode:
//   npm run publicar -- --repo GustavoRaiser/superproc_updater    (ANTES de exportar: o config vai dentro do pacote)
// A cada versão:
//   1. 1 EXPORTAR_PARA_TRABALHO.bat     2. npm run publicar     3. anexe à release do GitHub o .zip e o manifesto gerado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyZip } = require('./composicao.cjs');
const U = require('../browser/atualizacao-app.js');

const RAIZ = path.resolve(__dirname, '..');
const CONFIG_PUBLICO = path.join(RAIZ, 'config', 'atualizacao.json');
const CHAVE_PRIVADA_PADRAO = path.join(os.homedir(), '.superproc-assinatura', 'atualizacao-privada.pem');

function sha256Arquivo(arquivo) {
  const hash = crypto.createHash('sha256'), fd = fs.openSync(arquivo, 'r'), buf = Buffer.allocUnsafe(1024 * 1024);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

// Confere o zip (CRC e SHA-256 de cada arquivo contra o COMPOSICAO.json interno) e devolve o resumo.
function resumirPacote(zip) {
  if (!fs.existsSync(zip)) throw new Error('Zip não encontrado: ' + zip);
  const v = verifyZip(zip, path.basename(zip, '.zip'));
  if (!U.analisarVersao(v.version)) throw new Error('O pacote tem versão inválida: ' + v.version);
  return { versao: v.version, digest: v.sourceDigest, bytes: fs.statSync(zip).size, sha256: sha256Arquivo(zip), arquivos: v.files, nome: path.basename(zip) };
}

// Monta, assina e confere o manifesto. Não grava nada.
function montarManifesto({ resumo, notas, minima, chavePrivadaPem, chavePublicaPem, agora = new Date() }) {
  const payload = { schema: U.SCHEMA, produto: U.PRODUTO, versao: resumo.versao, digest: resumo.digest, zip: { nome: resumo.nome, bytes: resumo.bytes, sha256: resumo.sha256 }, publicadoEm: agora.toISOString() };
  if (notas) payload.notas = String(notas);
  if (minima) payload.minimaVersao = minima;
  const manifesto = U.assinarManifesto(payload, chavePrivadaPem);
  U.verificarManifesto(manifesto, chavePublicaPem); // a chave privada precisa corresponder à pública embutida no app
  return manifesto;
}

function gravarManifesto(manifesto, pastaSaida) {
  const pasta = path.join(pastaSaida, manifesto.payload.versao), arquivo = path.join(pasta, `manifesto-${manifesto.payload.versao}.json`);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(manifesto, null, 2) + '\n', { flag: 'wx' }); // não sobrescreve uma publicação anterior
  return arquivo;
}

function definirRepositorio(repo, arquivoConfig = CONFIG_PUBLICO) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || ''))) throw new Error('Repositório do GitHub inválido (esperado: dono/repositorio).');
  const cfg = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'));
  cfg.repositorio = repo;
  delete cfg.pastaId;
  delete cfg.manifestoId;
  fs.writeFileSync(arquivoConfig, JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

function definirPastaId(id, arquivoConfig = CONFIG_PUBLICO) {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(String(id || ''))) throw new Error('ID da pasta do Drive inválido.');
  const cfg = JSON.parse(fs.readFileSync(arquivoConfig, 'utf8'));
  cfg.pastaId = id;
  delete cfg.manifestoId;
  fs.writeFileSync(arquivoConfig, JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

function argumentos(argv) {
  const permitidos = new Set(['--zip', '--notas', '--minima', '--chave', '--saida', '--pasta-id', '--repo', '--repositorio']), a = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!permitidos.has(argv[i]) || argv[i + 1] === undefined) throw new Error('Argumento inválido: ' + argv[i]);
    a[argv[i].slice(2)] = argv[i + 1];
  }
  return a;
}

function zipMaisRecente() {
  const pasta = path.join(RAIZ, 'exports');
  const zips = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((n) => n.endsWith('.zip')).map((n) => ({ n, t: fs.statSync(path.join(pasta, n)).mtimeMs })).sort((x, y) => y.t - x.t) : [];
  if (!zips.length) throw new Error('Nenhum .zip em exports. Gere o pacote com 1 EXPORTAR_PARA_TRABALHO.bat.');
  return path.join(pasta, zips[0].n);
}

function obterChavePrivada(caminhoArg) {
  if (caminhoArg) return fs.readFileSync(path.resolve(caminhoArg), 'utf8');
  if (process.env.SUPERPROC_PRIVATE_KEY_PEM && process.env.SUPERPROC_PRIVATE_KEY_PEM.trim()) {
    return process.env.SUPERPROC_PRIVATE_KEY_PEM.trim();
  }
  if (fs.existsSync(CHAVE_PRIVADA_PADRAO)) {
    return fs.readFileSync(CHAVE_PRIVADA_PADRAO, 'utf8');
  }
  throw new Error('Chave privada de assinatura não encontrada (informe --chave, defina SUPERPROC_PRIVATE_KEY_PEM ou use ' + CHAVE_PRIVADA_PADRAO + ').');
}

function main(argv) {
  const a = argumentos(argv);
  if (a.repo || a.repositorio) {
    definirRepositorio(a.repo || a.repositorio);
    console.log('repositorio gravado em config/atualizacao.json. Exporte o pacote DEPOIS deste passo.');
    return;
  }
  if (a['pasta-id']) {
    definirPastaId(a['pasta-id']);
    console.log('pastaId gravado em config/atualizacao.json. Exporte o pacote DEPOIS deste passo.');
    return;
  }
  const publica = JSON.parse(fs.readFileSync(CONFIG_PUBLICO, 'utf8'));
  if (!publica.repositorio && !publica.pastaId) {
    throw new Error('config/atualizacao.json sem repositorio: o pacote exportado não saberia onde procurar atualizações. Veja o cabeçalho deste script.');
  }
  const zip = a.zip ? path.resolve(a.zip) : zipMaisRecente();
  const resumo = resumirPacote(zip);
  console.log(`Pacote: ${resumo.nome}\nVersão: ${resumo.versao}\nTamanho: ${(resumo.bytes / 1048576).toFixed(1)} MB (${resumo.arquivos} arquivos conferidos)\nSHA-256: ${resumo.sha256}`);
  const privada = obterChavePrivada(a.chave);
  const manifesto = montarManifesto({ resumo, notas: a.notas, minima: a.minima, chavePrivadaPem: privada, chavePublicaPem: publica.chavePublicaPem });
  const arquivo = gravarManifesto(manifesto, a.saida ? path.resolve(a.saida) : path.join(RAIZ, 'exports', 'publicacao'));
  const repoDestino = publica.repositorio || 'GustavoRaiser/superproc_updater';
  console.log(`\nSuba para as releases do GitHub em https://github.com/${repoDestino}/releases estes DOIS arquivos:\n  1. ${zip}\n  2. ${arquivo}\nO app e o atualizador passam a enxergar a versão ${resumo.versao} assim que o manifesto for anexado à release.`);
}

module.exports = { resumirPacote, montarManifesto, gravarManifesto, definirRepositorio, definirPastaId, argumentos, sha256Arquivo, obterChavePrivada };
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error('ERRO: ' + e.message); process.exitCode = 1; } }
