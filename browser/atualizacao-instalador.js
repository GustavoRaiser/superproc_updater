'use strict';
// Instalação da atualização: extrai e confere o pacote ao lado da instalação (mesmo volume, para a troca ser um
// simples renomear), e entrega a troca a um aplicador externo (aplicador.cmd) que roda depois que o app fecha.
// A cópia do aplicador usada é a da versão NOVA (já conferida por hash), de modo que um defeito do aplicador
// é corrigido pela própria atualização seguinte.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { extrairZip, conferirComposicao } = require('./atualizacao-zip');

const NOME_APLICADOR = 'aplicador.cmd';
const ARQUIVO_FALHA = 'atualizacao-falha.txt';
const ARQUIVO_LOG = 'atualizacao.log';

// Caminhos derivados do executável em uso. Tudo irmão da pasta instalada (mesmo diretório pai).
function caminhosDeInstalacao(execPath) {
  const install = path.dirname(execPath), pai = path.dirname(install), nome = path.basename(install);
  if (!pai || pai === install) throw new Error('A pasta de instalação não pode ser a raiz do disco.');
  // O aplicador abre o executável sem aspas (programa e argumento ambos entre aspas quebram o `start`): sem espaços.
  if (!/^[A-Za-z0-9._-]+$/.test(path.basename(execPath))) throw new Error('Nome de executável inválido para atualização.');
  return { install, pai, nome, exe: path.basename(execPath), novo: path.join(pai, '.' + nome + '.novo'), anterior: path.join(pai, nome + '.anterior'), anteriorNome: nome + '.anterior' };
}

// A troca renomeia pastas no diretório pai: ele precisa aceitar criar e renomear sem privilégio de administrador.
function verificarPermissao(pai) {
  const sonda = path.join(pai, '.superproc-sonda-' + crypto.randomBytes(4).toString('hex'));
  try { fs.mkdirSync(sonda); fs.renameSync(sonda, sonda + 'b'); fs.rmdirSync(sonda + 'b'); return { ok: true }; }
  catch (e) { try { fs.rmSync(sonda, { recursive: true, force: true }); fs.rmSync(sonda + 'b', { recursive: true, force: true }); } catch { /* nada a limpar */ } return { ok: false, motivo: 'Sem permissão para atualizar a pasta de instalação (' + pai + '). Instale o SuperPROC em uma pasta onde seu usuário possa gravar.' }; }
}

// Extrai o zip baixado em `caminhos.novo` e confere versão, digest e hash de cada arquivo. Remove sobras antes.
async function prepararPacote({ zip, versao, digest, caminhos }) {
  fs.rmSync(caminhos.novo, { recursive: true, force: true });
  await extrairZip(zip, caminhos.novo);
  try { conferirComposicao(caminhos.novo, { versao, digest }); }
  catch (e) { fs.rmSync(caminhos.novo, { recursive: true, force: true }); throw e; }
  if (!fs.existsSync(path.join(caminhos.novo, caminhos.exe))) { fs.rmSync(caminhos.novo, { recursive: true, force: true }); throw new Error('O pacote não contém ' + caminhos.exe + '.'); }
  return { novo: caminhos.novo };
}

function localizarAplicador(caminhos) {
  for (const candidato of [path.join(caminhos.novo, 'resources', 'app', 'browser', NOME_APLICADOR), path.join(__dirname, NOME_APLICADOR)]) if (fs.existsSync(candidato)) return candidato;
  throw new Error('Aplicador de atualização não encontrado.');
}

// Copia o aplicador para fora da instalação (ele a renomeia) e o executa desacoplado. Com `aguardar`, resolve
// quando termina (usado em testes). `env` permite ajustar esperas.
function iniciarAplicador({ caminhos, userData, reabrir, pid = process.pid, env = {}, aguardar = false, aplicador }) {
  const origem = aplicador || localizarAplicador(caminhos);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'superproc-aplicador-')), script = path.join(pasta, NOME_APLICADOR);
  fs.copyFileSync(origem, script);
  const ambiente = {
    ...process.env, SP_PID: String(pid), SP_INSTALL: caminhos.install, SP_INSTALL_NOME: caminhos.nome, SP_NOVO: caminhos.novo,
    SP_ANTERIOR: caminhos.anterior, SP_ANTERIOR_NOME: caminhos.anteriorNome, SP_EXE: caminhos.exe, SP_REABRIR: reabrir ? '1' : '0',
    SP_MARCADOR: path.join(userData, 'atualizacao-confirmada.txt'), SP_LOG: path.join(userData, ARQUIVO_LOG), SP_FALHA: path.join(userData, ARQUIVO_FALHA), ...env
  };
  delete ambiente.ELECTRON_RUN_AS_NODE;
  const filho = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '""' + script + '""'], { env: ambiente, cwd: pasta, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }); // cwd fora da instalação: um processo com cwd dentro dela impede o renomear
  if (!aguardar) { filho.unref(); return { pasta }; }
  return new Promise((resolve, reject) => { filho.on('error', reject); filho.on('exit', (codigo) => { try { fs.rmSync(pasta, { recursive: true, force: true }); } catch { /* o aplicativo aberto pelo aplicador ainda usa a pasta como cwd */ } resolve(codigo); }); });
}

// Aviso deixado pelo aplicador quando a troca falhou ou foi desfeita. Lê e apaga (mostrado uma única vez).
function consumirAvisoDeFalha(userData) {
  const arq = path.join(userData, ARQUIVO_FALHA);
  try { const texto = fs.readFileSync(arq, 'utf8').trim(); fs.rmSync(arq, { force: true }); return texto || null; } catch { return null; }
}
// Chamado pela versão nova ao iniciar bem: cria o arquivo que o aplicador espera para dar a troca por boa.
function confirmarInicializacao(marcador, versao) {
  if (typeof marcador !== 'string' || !path.isAbsolute(marcador)) return false;
  try { fs.mkdirSync(path.dirname(marcador), { recursive: true }); fs.writeFileSync(marcador, String(versao)); return true; } catch { return false; }
}
function marcadorDosArgumentos(argv) {
  const a = (argv || []).find((x) => typeof x === 'string' && x.startsWith('--atualizacao-marcador='));
  return a ? a.slice('--atualizacao-marcador='.length) : null;
}

module.exports = { NOME_APLICADOR, ARQUIVO_FALHA, ARQUIVO_LOG, caminhosDeInstalacao, verificarPermissao, prepararPacote, iniciarAplicador, consumirAvisoDeFalha, confirmarInicializacao, marcadorDosArgumentos };
