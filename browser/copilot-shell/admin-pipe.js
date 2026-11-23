'use strict';
// Servidor local do AdminBroker para clientes de linha de comando (harness cli-anything-superproc). Camada: host.
// Canal: pipe nomeado do Windows (\\.\pipe\superproc-v2-<pid>-admin; em outros sistemas, um socket Unix na pasta do perfil),
// nunca porta de rede e nunca --remote-debugging-port. Autenticação por token de 32 bytes sorteado a cada sessão, gravado só no
// arquivo copilot-admin.pipe do perfil (pasta do próprio usuário). Protocolo: uma mensagem JSON por linha.
//   -> {"op":"hello","token":"<token>"}                         <- {"ok":true}  (ou fecha a conexão)
//   -> {"id":1,"op":"catalog"}                                   <- {"id":1,"ok":true,"tools":[...]}
//   -> {"id":2,"op":"call","tool":"superproc_list_tabs","args":{}} <- {"id":2,"ok":true,"data":...} | {"id":2,"ok":false,"code":"..."}
// Quem decide o que roda é o AdminBroker (política por categoria + confirmação nas destrutivas): este servidor só transporta.
// Limites: 4 clientes, linha de até 64 KiB, 5 s para autenticar, resposta ao cliente sem mensagens de erro internas.
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const MAX_CLIENTES = 4;
const MAX_LINHA = 64 * 1024;
const PRAZO_AUTENTICAR_MS = 5000;

function caminhoDoPipe({ pid = process.pid, pasta = os.tmpdir(), plataforma = process.platform } = {}) {
  return plataforma === 'win32' ? `\\\\.\\pipe\\superproc-v2-${pid}-admin` : path.join(pasta, `superproc-v2-${pid}-admin.sock`);
}

function tokenIgual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function criarServidorAdmin({ admin, caminho = caminhoDoPipe(), token = crypto.randomBytes(32).toString('hex'), log = () => {}, prazoAutenticarMs = PRAZO_AUTENTICAR_MS }) {
  if (!admin || typeof admin.chamar !== 'function' || typeof admin.catalogo !== 'function') throw Error('AdminBroker inválido');
  const registrar = (m) => { try { log('COPILOT_ADMIN_PIPE', m); } catch (_) { /* log nunca derruba */ } };
  const clientes = new Set();
  let servidor = null;

  function aoConectar(socket) {
    if (clientes.size >= MAX_CLIENTES) { registrar('recusado: clientes demais'); socket.destroy(); return; }
    clientes.add(socket);
    let autenticado = false; let buffer = '';
    const fecha = () => { clientes.delete(socket); clearTimeout(prazo); };
    const prazo = setTimeout(() => { if (!autenticado) { registrar('sem autenticação no prazo'); socket.destroy(); } }, prazoAutenticarMs);
    socket.setEncoding('utf8');
    socket.on('close', fecha); socket.on('error', () => { fecha(); socket.destroy(); });
    const responder = (obj) => { try { if (!socket.destroyed) socket.write(JSON.stringify(obj) + '\n'); } catch (_) { /* cliente saiu */ } };
    let fila = Promise.resolve(); // uma chamada por vez por cliente: a ordem das respostas segue a dos pedidos

    socket.on('data', (pedaco) => {
      buffer += pedaco;
      if (buffer.length > MAX_LINHA * 2) { registrar('linha longa demais'); socket.destroy(); return; }
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const linha = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        if (linha.length > MAX_LINHA) { socket.destroy(); return; }
        let msg;
        try { msg = JSON.parse(linha); } catch (_) { if (!autenticado) { socket.destroy(); return; } responder({ ok: false, code: 'BAD_REQUEST' }); continue; }
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) { if (!autenticado) { socket.destroy(); return; } responder({ ok: false, code: 'BAD_REQUEST' }); continue; }
        if (!autenticado) {
          if (msg.op === 'hello' && typeof msg.token === 'string' && tokenIgual(msg.token, token)) { autenticado = true; clearTimeout(prazo); responder({ ok: true }); registrar('cliente autenticado'); }
          else { registrar('token recusado'); socket.destroy(); return; }
          continue;
        }
        const id = Number.isSafeInteger(msg.id) ? msg.id : undefined;
        if (msg.op === 'catalog') { responder({ id, ok: true, tools: admin.catalogo() }); continue; }
        if (msg.op === 'call' && typeof msg.tool === 'string') {
          fila = fila.then(async () => {
            let r;
            try { r = await admin.chamar(msg.tool, msg.args === undefined ? {} : msg.args); } catch (_) { r = { ok: false, code: 'FAILED' }; }
            responder({ id, ...r });
          });
          continue;
        }
        responder({ id, ok: false, code: 'BAD_REQUEST' });
      }
    });
  }

  return {
    token, caminho,
    iniciar: () => new Promise((resolve, reject) => {
      if (servidor) return resolve(caminho);
      if (process.platform !== 'win32') { try { fs.rmSync(caminho, { force: true }); } catch (_) { /* socket antigo */ } }
      servidor = net.createServer(aoConectar);
      servidor.once('error', (e) => { servidor = null; reject(e); });
      servidor.listen(caminho, () => { servidor.removeAllListeners('error'); servidor.on('error', () => {}); registrar('ouvindo'); resolve(caminho); });
    }),
    parar: () => new Promise((resolve) => {
      for (const c of clientes) c.destroy();
      clientes.clear();
      if (!servidor) return resolve();
      const s = servidor; servidor = null;
      s.close(() => { if (process.platform !== 'win32') { try { fs.rmSync(caminho, { force: true }); } catch (_) { /* já saiu */ } } resolve(); });
    }),
    clientes: () => clientes.size
  };
}

// Arquivo de descoberta no perfil: { pipe, token, pid }. Só o harness do mesmo usuário lê.
function gravarDescoberta(pasta, { caminho, token }) {
  const arquivo = path.join(pasta, 'copilot-admin.pipe');
  fs.writeFileSync(arquivo, JSON.stringify({ pipe: caminho, token, pid: process.pid }), { encoding: 'utf8', mode: 0o600 });
  return arquivo;
}

module.exports = { MAX_CLIENTES, MAX_LINHA, caminhoDoPipe, criarServidorAdmin, gravarDescoberta };
