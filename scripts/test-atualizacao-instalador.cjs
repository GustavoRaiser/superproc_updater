'use strict';
// Testes do instalador/aplicador com o aplicador.cmd REAL e um "executável" falso (fake.cmd), em pastas descartáveis.
// Só roda no Windows (o aplicador é um .cmd).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const I = require('../browser/atualizacao-instalador.js');
const { zipDirectory } = require('./composicao.cjs');

if (process.platform !== 'win32') { console.log('test-atualizacao-instalador: ignorado (requer Windows)'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atual-inst-'));
const APLICADOR = path.join(__dirname, '..', 'browser', 'aplicador.cmd');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let n = 0; const dir = (nome) => { const d = path.join(tmp, `${nome}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
// O cmd trata '=' como separador de argumentos: o executável falso aceita o marcador inteiro (%~1) ou partido (%~1 e %~2).
const CONFIRMA = '@echo off\r\nfor /f "tokens=1,* delims==" %%a in ("%~1=%~2") do set "M=%%b"\r\nif "%M:~-1%"=="=" set "M=%M:~0,-1%"\r\necho ok>"%M%"\r\n';
const NAO_CONFIRMA = '@echo off\r\nexit /b 0\r\n';
const ler = (p) => fs.readFileSync(p, 'utf8').trim();

// Cenário: <base>/SuperPROC (instalada, "antiga") e <base>/.SuperPROC.novo (extraída, "nova").
function montar({ novaConfirma = true, anteriorSobra = false } = {}) {
  const base = dir('base'), userData = dir('userdata'), install = path.join(base, 'SuperPROC');
  fs.mkdirSync(install); fs.writeFileSync(path.join(install, 'VERSAO'), 'antiga'); fs.writeFileSync(path.join(install, 'fake.cmd'), NAO_CONFIRMA);
  const caminhos = I.caminhosDeInstalacao(path.join(install, 'fake.cmd'));
  fs.mkdirSync(caminhos.novo); fs.writeFileSync(path.join(caminhos.novo, 'VERSAO'), 'nova'); fs.writeFileSync(path.join(caminhos.novo, 'fake.cmd'), novaConfirma ? CONFIRMA : NAO_CONFIRMA);
  if (anteriorSobra) { fs.mkdirSync(caminhos.anterior); fs.writeFileSync(path.join(caminhos.anterior, 'VERSAO'), 'sobra-velha'); }
  return { base, userData, install, caminhos, marcador: path.join(userData, 'atualizacao-confirmada.txt'), falha: path.join(userData, I.ARQUIVO_FALHA), log: path.join(userData, I.ARQUIVO_LOG) };
}
const rodar = (c, extra = {}) => I.iniciarAplicador({ caminhos: c.caminhos, userData: c.userData, aguardar: true, aplicador: APLICADOR, env: { SP_ESPERA_ENCERRAR: '3', SP_ESPERA_CONFIRMAR: '4', ...(extra.env || {}) }, reabrir: extra.reabrir !== false });
const travar = (pasta) => spawn(process.env.ComSpec, ['/d', '/c', 'ping -n 40 127.0.0.1 >nul'], { cwd: pasta, stdio: 'ignore', windowsHide: true }); // processo com cwd dentro da pasta impede renomeá-la

(async () => {
  // ---- caminhos ----
  const c0 = I.caminhosDeInstalacao('C:\\SuperPROC\\SuperPROC_v2.exe');
  assert.deepEqual([c0.install, c0.pai, c0.nome, c0.exe, c0.novo, c0.anterior, c0.anteriorNome], ['C:\\SuperPROC', 'C:\\', 'SuperPROC', 'SuperPROC_v2.exe', 'C:\\.SuperPROC.novo', 'C:\\SuperPROC.anterior', 'SuperPROC.anterior']);
  assert.throws(() => I.caminhosDeInstalacao('C:\\SuperPROC_v2.exe'), /raiz do disco/);

  // ---- 1) troca com reabertura confirmada ----
  let c = montar({ anteriorSobra: true });
  assert.equal(await rodar(c), 0);
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'nova', 'versão nova no lugar');
  assert.equal(ler(path.join(c.caminhos.anterior, 'VERSAO')), 'antiga', 'a anterior guardada é a versão que estava instalada (a sobra velha foi removida)');
  assert.ok(!fs.existsSync(c.caminhos.novo), 'pasta nova consumida');
  assert.ok(fs.existsSync(c.marcador), 'a versão nova foi aberta e confirmou');
  assert.ok(!fs.existsSync(c.falha)); assert.match(ler(c.log), /confirmou a inicializacao/);

  // ---- 2) troca sem reabrir (atualização ao fechar) ----
  c = montar();
  assert.equal(await rodar(c, { reabrir: false }), 0);
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'nova'); assert.equal(ler(path.join(c.caminhos.anterior, 'VERSAO')), 'antiga');
  assert.ok(!fs.existsSync(c.marcador), 'não abriu o aplicativo'); assert.ok(!fs.existsSync(c.falha));

  // ---- 3) versão nova não confirma: volta à anterior ----
  c = montar({ novaConfirma: false });
  await rodar(c);
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'antiga', 'rollback restaurou a versão anterior');
  assert.ok(!fs.existsSync(c.caminhos.anterior) && !fs.existsSync(c.install + '.falhou'), 'sem pastas residuais');
  assert.equal(ler(c.falha), 'NAO_INICIOU'); assert.match(ler(c.log), /desfazendo/);

  // ---- 4) aplicativo não fecha (instalação em uso): nada muda ----
  c = montar();
  let trava = travar(c.install);
  try { await rodar(c); } finally { trava.kill(); }
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'antiga', 'instalação intacta'); assert.ok(fs.existsSync(c.caminhos.novo), 'pacote novo preservado para outra tentativa');
  assert.ok(!fs.existsSync(c.caminhos.anterior)); assert.equal(ler(c.falha), 'NAO_FECHOU');

  // ---- 5) cópia anterior não removível: instalação intacta ----
  c = montar({ anteriorSobra: true });
  trava = travar(c.caminhos.anterior);
  try { await rodar(c); } finally { trava.kill(); }
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'antiga'); assert.equal(ler(c.falha), 'ANTERIOR_NAO_REMOVIDA');

  // ---- 6) pacote real (zip) -> extrair, conferir e trocar, usando o aplicador DENTRO do pacote ----
  const origem = dir('origem'), raiz = 'SuperPROC-v2-aaaaaaaaaaaa', versao = '2.1.0', digest = sha('d');
  const arquivos = { 'fake.cmd': CONFIRMA, 'VERSAO': 'pacote-zip', 'resources/app/browser/aplicador.cmd': fs.readFileSync(APLICADOR) };
  const lista = Object.entries(arquivos).map(([file, d]) => { const dados = Buffer.from(d); fs.mkdirSync(path.dirname(path.join(origem, file)), { recursive: true }); fs.writeFileSync(path.join(origem, file), dados); return { file, bytes: dados.length, sha256: sha(dados) }; }).sort((a, b) => a.file.localeCompare(b.file));
  const escreverComposicao = (v, d) => fs.writeFileSync(path.join(origem, 'COMPOSICAO.json'), JSON.stringify({ schema: 2, product: 'SuperPROC v2', version: v, sourceDigest: d, files: lista }));
  escreverComposicao(versao, digest);
  const zip = path.join(dir('zips'), 'p.zip'); zipDirectory(origem, zip, raiz);
  c = montar(); fs.rmSync(c.caminhos.novo, { recursive: true });
  await assert.rejects(() => I.prepararPacote({ zip, versao, digest: sha('outro'), caminhos: c.caminhos }), /digest/);
  assert.ok(!fs.existsSync(c.caminhos.novo), 'pacote recusado não deixa pasta');
  await I.prepararPacote({ zip, versao, digest, caminhos: c.caminhos });
  assert.equal(ler(path.join(c.caminhos.novo, 'VERSAO')), 'pacote-zip');
  await I.prepararPacote({ zip, versao, digest, caminhos: c.caminhos }); // refaz sobre sobra anterior sem erro
  assert.equal(await I.iniciarAplicador({ caminhos: c.caminhos, userData: c.userData, aguardar: true, reabrir: true, env: { SP_ESPERA_ENCERRAR: '3', SP_ESPERA_CONFIRMAR: '4' } }), 0, 'sem override: usa o aplicador do pacote novo');
  assert.equal(ler(path.join(c.install, 'VERSAO')), 'pacote-zip'); assert.ok(fs.existsSync(c.marcador));

  // ---- 7) permissão, marcador e aviso de falha ----
  assert.equal(I.verificarPermissao(dir('perm')).ok, true);
  const semPerm = I.verificarPermissao(path.join(tmp, 'nao-existe', 'x')); assert.equal(semPerm.ok, false); assert.match(semPerm.motivo, /permissão/);
  assert.equal(I.marcadorDosArgumentos(['a', '--atualizacao-marcador=C:\\x\\m.txt']), 'C:\\x\\m.txt'); assert.equal(I.marcadorDosArgumentos(['a']), null);
  const ud = dir('ud'), m = path.join(ud, 'sub', 'm.txt');
  assert.equal(I.confirmarInicializacao('relativo.txt', '1'), false); assert.equal(I.confirmarInicializacao(m, '2.1.0'), true); assert.equal(ler(m), '2.1.0');
  assert.equal(I.consumirAvisoDeFalha(ud), null); fs.writeFileSync(path.join(ud, I.ARQUIVO_FALHA), 'NAO_FECHOU \r\n');
  assert.equal(I.consumirAvisoDeFalha(ud), 'NAO_FECHOU'); assert.equal(I.consumirAvisoDeFalha(ud), null, 'mostrado uma única vez');

  console.log('test-atualizacao-instalador: ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temporário: o sistema limpa depois */ } });
