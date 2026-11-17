'use strict';
// Instalação sob demanda de AZflow/Epryx, como num navegador comum: nada vem embutido no SuperPROC.
// O pacote oficial é baixado da Chrome Web Store, validado (hash e assinatura/ID do CRX3), adaptado ao Electron
// (REGRAS_V2 + patches do v2) e gravado na pasta do perfil: <userData>/extensoes-atualizadas/<nome>/<versão> (%APPDATA%).
const fs = require('node:fs');
const path = require('node:path');
const A = require('./extensao-atualizador.js');
const { aplicarPatchesV2, arquivosComPatchV2 } = require('./extensao-patches-v2.js');

// Pasta da extensão instalada (íntegra: manifesto confere com o atual.json), ou null.
function pastaInstalada(nome, userData) {
  try {
    const atual = A.lerAtual(userData, nome);
    if (!atual || !/^[\w.-]+$/.test(atual.pasta || '')) return null;
    const dir = path.join(A.raizAtualizacoes(userData), nome, atual.pasta), buf = fs.readFileSync(path.join(dir, 'manifest.json'));
    return A.sha256(buf) === atual.manifestSha && JSON.parse(buf).version === atual.versao ? dir : null;
  } catch { return null; }
}
function versaoInstalada(nome, userData) { return pastaInstalada(nome, userData) ? A.lerAtual(userData, nome).versao : null; }

function caminhoSeguro(destino, nome) {
  const alvo = path.resolve(destino, ...nome.split('/'));
  if (path.isAbsolute(nome) || nome.split('/').includes('..') || !alvo.startsWith(path.resolve(destino) + path.sep)) throw new Error('Caminho inválido no pacote: ' + nome);
  return alvo;
}

// Instala (ou atualiza) a versão mais recente da loja. Devolve { status: 'instalada'|'sem-atualizacao', versao, patchesNaoPortados }.
async function instalar({ nome, userData, idLoja, fetchFn, chrome }) {
  if (!idLoja) throw new Error('ID da loja desconhecido para ' + nome);
  const versaoBase = versaoInstalada(nome, userData) || '0.0.0';
  const consulta = A.interpretarResposta((await A.baixar(fetchFn, A.urlConsulta(idLoja, versaoBase, chrome), 1024 * 1024)).toString('utf8'));
  if (consulta.semAtualizacao || (consulta.versao && A.compararVersoes(consulta.versao, versaoBase) <= 0)) return { status: 'sem-atualizacao', versao: versaoBase };
  const crx = await A.baixar(fetchFn, consulta.codebase, A.LIMITES.crx);
  if (consulta.hash && A.sha256(crx) !== consulta.hash) throw new Error('Hash SHA-256 do CRX não confere com o informado pela loja.');
  const arquivos = A.lerZip(A.verificarCrx3(crx, idLoja).arquivoZip);
  const manifesto = arquivos.get('manifest.json');
  if (!manifesto) throw new Error('CRX sem manifest.json.');
  const versao = JSON.parse(manifesto.toString('utf8')).version;
  if (!versao || A.compararVersoes(versao, versaoBase) <= 0) return { status: 'sem-atualizacao', versao: versaoBase };

  const raiz = path.join(A.raizAtualizacoes(userData), nome), tmp = path.join(raiz, `${versao}.tmp-${process.pid}`), comPatch = arquivosComPatchV2(nome);
  fs.rmSync(tmp, { recursive: true, force: true });
  const naoPortados = [];
  try {
    for (const [arq, dados] of arquivos) {
      if (arq.startsWith('_metadata/')) continue;
      let conteudo = dados;
      if (/\.m?js$/.test(arq)) {
        let texto = A.aplicarRegras(dados.toString('utf8'));
        if (comPatch.has(arq)) { const r = aplicarPatchesV2(nome, arq, texto); texto = r.texto; naoPortados.push(...r.falhas); }
        conteudo = Buffer.from(texto);
      }
      const alvo = caminhoSeguro(tmp, arq);
      fs.mkdirSync(path.dirname(alvo), { recursive: true });
      fs.writeFileSync(alvo, conteudo);
    }
    A.aplicarAtualizacao({ status: 'pronto', nome, raiz, tmp, versaoNova: versao, manifestSha: A.sha256(fs.readFileSync(path.join(tmp, 'manifest.json'))) });
  } catch (err) { fs.rmSync(tmp, { recursive: true, force: true }); throw err; }
  return { status: 'instalada', versao, patchesNaoPortados: naoPortados.length };
}

module.exports = { pastaInstalada, versaoInstalada, instalar };
