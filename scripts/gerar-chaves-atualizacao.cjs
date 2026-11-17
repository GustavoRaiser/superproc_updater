'use strict';
// Gera o par Ed25519 de assinatura das atualizações. A chave PRIVADA fica fora do projeto (pasta do usuário) e nunca
// é impressa; a PÚBLICA vai para config/atualizacao.json e é embutida no app. Recusa sobrescrever qualquer um dos dois.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const PASTA_PRIVADA = path.join(os.homedir(), '.superproc-assinatura');
const ARQ_PRIVADA = path.join(PASTA_PRIVADA, 'atualizacao-privada.pem');
const ARQ_PUBLICA = path.join(__dirname, '..', 'config', 'atualizacao.json');

function gerar({ arqPrivada = ARQ_PRIVADA, arqPublica = ARQ_PUBLICA } = {}) {
  if (fs.existsSync(arqPrivada)) throw new Error('Já existe uma chave privada; nada foi sobrescrito.');
  if (fs.existsSync(arqPublica)) throw new Error('config/atualizacao.json já existe; nada foi sobrescrito.');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(arqPrivada), { recursive: true });
  fs.writeFileSync(arqPrivada, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  fs.mkdirSync(path.dirname(arqPublica), { recursive: true });
  const config = { pastaId: null, chavePublicaPem: publicKey.export({ type: 'spki', format: 'pem' }), observacao: 'pastaId é o ID da pasta pública do Google Drive onde ficam os manifestos e os pacotes (npm run publicar -- --pasta-id <ID>).' };
  fs.writeFileSync(arqPublica, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return { arqPrivada, arqPublica };
}

module.exports = { gerar, ARQ_PRIVADA, ARQ_PUBLICA };

if (require.main === module) {
  try {
    const r = gerar();
    console.log('Chave privada criada em: ' + r.arqPrivada + '\n(faça uma cópia de segurança fora do computador; sem ela não é possível publicar atualizações.)');
    console.log('Chave pública gravada em: ' + r.arqPublica);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
