'use strict';
// Testes sintéticos do atualizador do app: chaves descartáveis, rede simulada, sem Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const U = require('../browser/atualizacao-app.js');
const { gerar } = require('./gerar-chaves-atualizacao.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atual-app-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const REPO = 'GustavoRaiser/superproc_updater', ID_Z = 'pacoteZIPABCDEF123', NOME_ZIP = 'SuperPROC-v2-teste.zip';

function par() { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { pub: publicKey.export({ type: 'spki', format: 'pem' }), priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) }; }
function payloadDe(zip, extra = {}) { return { schema: 1, produto: 'SuperPROC v2', versao: '2.1.0', digest: sha('d'), zip: { nome: NOME_ZIP, bytes: zip.length, sha256: sha(zip) }, notas: 'teste', publicadoEm: '2026-11-10T00:00:00Z', ...extra }; }

// GitHub Releases simulado. arquivos: [{ id, nome, corpo | status | erro, tamanho, url }];
function servidor(arquivos, opcoes = {}) {
  const visto = opcoes.visto || [];
  const resp = (status, corpo) => {
    const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo || ''), pedacos = [];
    for (let i = 0; i < buf.length; i += 7000) pedacos.push(buf.subarray(i, i + 7000));
    return { ok: status < 400, status, body: Readable.from(pedacos) };
  };
  return async (url, fetchOpts = {}) => {
    visto.push(url);
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      assert.equal(fetchOpts.headers?.['User-Agent'], 'SuperPROC-v2');
      assert.equal(fetchOpts.headers?.['Accept'], 'application/vnd.github+json');
      if (u.pathname === `/repos/${REPO}/releases`) {
        if (opcoes.listagemErro) throw opcoes.listagemErro;
        if (opcoes.listagemStatus) return resp(opcoes.listagemStatus, '');
        const page = Number(u.searchParams.get('page') || '1');
        const assets = arquivos.map((a) => ({
          id: a.id,
          name: a.nome,
          size: a.tamanho !== undefined ? a.tamanho : Buffer.byteLength(a.corpo || ''),
          browser_download_url: a.url || `https://github.com/${REPO}/releases/download/v2.1.0/${a.nome}`
        }));
        if (opcoes.paginar) {
          if (page === 1) {
            const rels = [];
            for (let i = 0; i < 29; i++) rels.push({ id: 100 + i, tag_name: 'v1.' + i + '.0', draft: false, assets: [] });
            rels.push({ id: 1, tag_name: 'v2.1.0', draft: false, assets: [assets[0]] });
            return resp(200, JSON.stringify(rels));
          }
          if (page === 2) return resp(200, JSON.stringify([{ id: 2, tag_name: 'v2.0.0', draft: false, assets: assets.slice(1) }]));
          return resp(200, JSON.stringify([]));
        }
        return resp(200, JSON.stringify([{ id: 1, tag_name: 'v2.1.0', draft: false, assets }]));
      }
    }
    const nome = decodeURIComponent(u.pathname.split('/').pop());
    const a = arquivos.find((x) => x.nome === nome || (x.url && x.url === url));
    if (!a) return { ok: false, status: 404 };
    if (a.erro) throw a.erro;
    return resp(a.status || 200, a.corpo || '');
  };
}

(async () => {
  // ---- versões ----
  const cmp = U.compararVersoes;
  assert.equal(cmp('2.0.1', '2.0.0'), 1); assert.equal(cmp('2.0.0', '2.0.1'), -1); assert.equal(cmp('2.10.0', '2.9.9'), 1); assert.equal(cmp('1.2.3', '1.2.3'), 0);
  assert.equal(cmp('2.0.0-dev', '2.0.0'), -1, 'sufixo é anterior à versão final');
  assert.equal(cmp('2.0.0-beta.2', '2.0.0-beta.10'), -1); assert.equal(cmp('2.0.0-beta', '2.0.0-beta.1'), -1);
  assert.throws(() => cmp('2.0', '2.0.0')); assert.throws(() => cmp('x', '2.0.0'));

  // ---- assinatura ----
  const k = par(), outra = par(), zip = crypto.randomBytes(20000);
  const m = U.assinarManifesto(payloadDe(zip), k.priv);
  assert.equal(U.verificarManifesto(m, k.pub).versao, '2.1.0');
  assert.throws(() => U.verificarManifesto(m, outra.pub), /Assinatura/, 'chave errada');
  const adulterado = JSON.parse(JSON.stringify(m)); adulterado.payload.zip.nome = 'outro.zip'; assert.throws(() => U.verificarManifesto(adulterado, k.pub), /Assinatura/, 'payload alterado');
  const reordenado = { assinatura: m.assinatura, payload: Object.fromEntries(Object.entries(m.payload).reverse()) }; assert.equal(U.verificarManifesto(reordenado, k.pub).versao, '2.1.0', 'ordem das chaves não importa');
  assert.throws(() => U.assinarManifesto({ ...payloadDe(zip), versao: 'abc' }, k.priv), /Versão/);
  assert.throws(() => U.assinarManifesto({ ...payloadDe(zip), produto: 'Outro' }, k.priv), /outro produto/);
  for (const ruim of ['../x.zip', 'a.txt', 'dir/a.zip', 'a b.zip', '.zip', '']) assert.throws(() => U.assinarManifesto(payloadDe(zip, { zip: { nome: ruim, bytes: 1, sha256: sha('a') } }), k.priv), /Nome do pacote/, 'nome recusado: ' + ruim);
  assert.throws(() => U.verificarManifesto({ payload: m.payload }, k.pub), /malformado/);

  // ---- verificar: descoberta pelas releases ----
  const base = { repositorio: REPO, chavePublicaPem: k.pub };
  const manif = (versao, extra = {}, chave = k.priv, nome) => ({ id: 'manif' + versao.replace(/\W/g, '') + 'IDxx', nome: nome || 'manifesto-' + versao + '.json', corpo: JSON.stringify(U.assinarManifesto(payloadDe(zip, { versao, ...extra }), chave)) });
  const downloadUrlZip = `https://github.com/${REPO}/releases/download/v2.1.0/${NOME_ZIP}`;
  const pacoteZip = { id: ID_Z, nome: NOME_ZIP, corpo: zip, url: downloadUrlZip };
  const lixo = [{ id: 'latestJsonIDxx', nome: 'latest.json', corpo: '{}' }, { id: 'outroZipIDxxxx', nome: 'outro.zip', corpo: 'x' }];
  const visto = [];
  let r = await U.verificar({ ...base, fetchFn: servidor([...lixo, manif('2.1.0'), pacoteZip], { visto }), versaoAtual: '2.0.0' });
  assert.equal(r.estado, 'disponivel'); assert.equal(r.payload.versao, '2.1.0'); assert.equal(r.zipUrl, downloadUrlZip); assert.equal(r.exigeInstalacaoManual, false); assert.equal(visto.length, 2, 'uma listagem e um manifesto');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0'), pacoteZip]), versaoAtual: '2.1.0' }); assert.equal(r.estado, 'atual');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0'), pacoteZip]), versaoAtual: '3.0.0' }); assert.equal(r.estado, 'atual', 'nunca rebaixa');
  const v3 = []; r = await U.verificar({ ...base, fetchFn: servidor([manif('2.0.5'), manif('2.1.0'), manif('2.0.9'), manif('2.0.10'), pacoteZip], { visto: v3 }), versaoAtual: '2.0.0' });
  assert.equal(r.payload.versao, '2.1.0', 'escolhe a maior versão (comparação numérica)'); assert.equal(v3.length, 2, 'só baixa o manifesto da maior versão');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.2.0', {}, outra.priv), manif('2.1.0'), pacoteZip]), versaoAtual: '2.0.0' });
  assert.equal(r.payload.versao, '2.1.0', 'manifesto maior mas com assinatura de outra chave é ignorado');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.2.0', {}, outra.priv), pacoteZip]), versaoAtual: '2.0.0' }); assert.deepEqual([r.estado, r.motivo], ['erro', 'assinatura']);
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0', {}, k.priv, 'manifesto-3.0.0.json'), pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'assinatura', 'a versão do nome do arquivo precisa bater com a do manifesto');
  r = await U.verificar({ ...base, fetchFn: servidor([{ id: 'ruimIDxxxxxxxx', nome: 'manifesto-2.1.0.json', corpo: '{não é json' }, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'assinatura', 'json ilegível não passa');
  const decoys = ['manifesto-2.1.0.json.exe', 'manifesto-x.json', 'Manifesto-2.1.0.json', 'manifesto-2.1.json', 'xmanifesto-2.1.0.json'].map((nome, i) => ({ ...manif('2.1.0'), id: 'decoyIDxxxx' + i, nome }));
  r = await U.verificar({ ...base, fetchFn: servidor([...decoys, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'sem-versao', 'nomes fora do padrão são ignorados');
  r = await U.verificar({ ...base, fetchFn: servidor([...lixo, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'sem-versao');
  r = await U.verificar({ ...base, fetchFn: servidor([{ ...manif('2.1.0'), tamanho: 70000 }, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'sem-versao', 'manifesto maior que 64 KB é ignorado sem baixar');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0')]), versaoAtual: '2.0.0' }); assert.deepEqual([r.estado, r.motivo], ['erro', 'nao-encontrado'], 'zip ausente na release');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0'), { ...pacoteZip, tamanho: zip.length + 1 }]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'nao-encontrado', 'zip com tamanho diferente do manifesto');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0'), { ...pacoteZip, url: 'https://github.com/copia.zip', tamanho: 5 }, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.zipUrl, downloadUrlZip, 'entre nomes repetidos, usa o de tamanho certo');
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0', { minimaVersao: '2.0.5' }), pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.exigeInstalacaoManual, true);
  r = await U.verificar({ ...base, fetchFn: servidor([manif('2.1.0'), pacoteZip], { paginar: true }), versaoAtual: '2.0.0' }); assert.equal(r.estado, 'disponivel', 'segue a paginação da listagem');
  r = await U.verificar({ ...base, chavePublicaPem: outra.pub, fetchFn: servidor([manif('2.1.0'), pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'assinatura');
  r = await U.verificar({ ...base, fetchFn: servidor([], { listagemStatus: 403 }), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'limite');
  r = await U.verificar({ ...base, fetchFn: servidor([], { listagemStatus: 404 }), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'nao-encontrado');
  r = await U.verificar({ ...base, fetchFn: servidor([], { listagemErro: new Error('ECONNRESET') }), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'rede');
  r = await U.verificar({ ...base, fetchFn: servidor([{ ...manif('2.1.0'), erro: new Error('queda') }, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'rede', 'queda ao baixar o manifesto');
  r = await U.verificar({ ...base, fetchFn: servidor([{ ...manif('2.1.0'), status: 403 }, pacoteZip]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'limite');
  r = await U.verificar({ ...base, repositorio: null, fetchFn: servidor([]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'nao-configurado');
  r = await U.verificar({ ...base, chavePublicaPem: null, fetchFn: servidor([]), versaoAtual: '2.0.0' }); assert.equal(r.motivo, 'nao-configurado');
  assert.throws(() => U.urlReleases('../../x'), /Repositório/);
  assert.throws(() => U.urlListagem('invalido-sem-barra'), /Repositório/);

  // ---- download ----
  const destino = path.join(tmp, 'baixados', 'pacote.zip'), avisos = [];
  const ok = await U.baixarPacote({ fetchFn: servidor([pacoteZip]), payload: m.payload, zipUrl: downloadUrlZip, destino, onProgresso: (p) => avisos.push(p) });
  assert.equal(ok.bytes, zip.length); assert.deepEqual(fs.readFileSync(destino), zip); assert.ok(!fs.existsSync(destino + '.part')); assert.equal(avisos.at(-1).recebidos, zip.length);
  const falha = async (corpo, motivo, pl = m.payload) => {
    const d = path.join(tmp, 'f-' + motivo + '.zip');
    await assert.rejects(() => U.baixarPacote({ fetchFn: servidor([{ id: ID_Z, nome: NOME_ZIP, url: downloadUrlZip, ...corpo }]), payload: pl, zipUrl: downloadUrlZip, destino: d }), (e) => e.motivo === motivo);
    assert.ok(!fs.existsSync(d) && !fs.existsSync(d + '.part'), 'sem resíduos após falha: ' + motivo);
  };
  const corrompido = Buffer.from(zip); corrompido[10] ^= 1;
  await falha({ corpo: corrompido }, 'hash');
  await falha({ corpo: zip.subarray(0, zip.length - 1) }, 'tamanho');
  await falha({ corpo: Buffer.concat([zip, Buffer.from('x')]) }, 'tamanho');
  await falha({ status: 403 }, 'limite');
  await falha({ erro: new Error('queda') }, 'rede');
  await assert.rejects(() => U.baixarPacote({ fetchFn: servidor([]), payload: m.payload, zipUrl: 'https://github.com/inexistente.zip', destino: path.join(tmp, 'x.zip') }), (e) => e.motivo === 'nao-encontrado');

  // ---- estado ----
  const ud = path.join(tmp, 'userData');
  assert.deepEqual(U.lerEstado(ud), { verificar: true, automatica: false, ultimaVerificacao: null, versaoIgnorada: null }, 'padrão: verifica, mas não atualiza sozinha');
  U.salvarEstado(ud, { verificar: false, automatica: false, ultimaVerificacao: 1000, versaoIgnorada: '2.1.0', lixo: 1 });
  assert.deepEqual(U.lerEstado(ud), { verificar: false, automatica: false, ultimaVerificacao: 1000, versaoIgnorada: '2.1.0' });
  assert.equal(U.normalizarEstado({ verificar: false, automatica: true }).verificar, true, 'automática exige verificar');
  fs.writeFileSync(path.join(ud, 'atualizacao.json'), '{corrompido'); assert.deepEqual(U.lerEstado(ud), { verificar: true, automatica: false, ultimaVerificacao: null, versaoIgnorada: null }, 'arquivo corrompido volta ao padrão');
  fs.writeFileSync(path.join(ud, 'atualizacao.json'), JSON.stringify({ verificar: 'sim', automatica: 'sim', ultimaVerificacao: 'x', versaoIgnorada: 'zzz' })); assert.deepEqual(U.lerEstado(ud), { verificar: false, automatica: false, ultimaVerificacao: null, versaoIgnorada: null });
  const dia = U.INTERVALO_AUTOMATICO_MS;
  assert.equal(U.deveVerificarAutomaticamente({ verificar: false, automatica: false, ultimaVerificacao: null }, 5 * dia), false);
  assert.equal(U.deveVerificarAutomaticamente({ verificar: true, automatica: false, ultimaVerificacao: null }, 5 * dia), true);
  assert.equal(U.deveVerificarAutomaticamente({ verificar: true, automatica: false, ultimaVerificacao: 5 * dia - 1000 }, 5 * dia), false);
  assert.equal(U.deveVerificarAutomaticamente({ verificar: true, automatica: true, ultimaVerificacao: 4 * dia }, 5 * dia), true);

  // ---- gerador de chaves ----
  const gp = path.join(tmp, 'ger', 'privada.pem'), gu = path.join(tmp, 'ger2', 'atualizacao.json');
  gerar({ arqPrivada: gp, arqPublica: gu });
  const cfg = JSON.parse(fs.readFileSync(gu, 'utf8'));
  assert.equal(cfg.pastaId, null); assert.ok(!JSON.stringify(cfg).includes('PRIVATE'));
  const mg = U.assinarManifesto(payloadDe(zip), fs.readFileSync(gp, 'utf8')); assert.equal(U.verificarManifesto(mg, cfg.chavePublicaPem).versao, '2.1.0', 'o par gerado assina e verifica');
  assert.throws(() => gerar({ arqPrivada: gp, arqPublica: path.join(tmp, 'novo.json') }), /sobrescrito/);
  assert.throws(() => gerar({ arqPrivada: path.join(tmp, 'novo.pem'), arqPublica: gu }), /sobrescrito/);
  assert.ok(!fs.existsSync(path.join(tmp, 'novo.pem')), 'recusa sem efeitos colaterais');

  // ---- modo GCS (urlBase) ----
  const gcsBase = 'https://storage.googleapis.com/superproc_updater';
  const gcsServidor = (status, corpo) => async (url, fetchOpts = {}) => {
    assert.ok(!url.includes('github.com'), 'modo GCS nunca consulta github.com');
    assert.equal(url, `${gcsBase}/manifesto-latest.json`);
    assert.equal(fetchOpts.headers?.['Cache-Control'], 'no-cache');
    if (status >= 400) return { ok: false, status };
    return { ok: true, status: 200, body: Readable.from([Buffer.from(corpo)]) };
  };
  const manGcs = JSON.stringify(U.assinarManifesto(payloadDe(zip, { versao: '2.1.0' }), k.priv));
  const rgOk = await U.verificar({ urlBase: gcsBase + '/', chavePublicaPem: k.pub, fetchFn: gcsServidor(200, manGcs), versaoAtual: '2.0.0' });
  assert.equal(rgOk.estado, 'disponivel');
  assert.equal(rgOk.zipUrl, `${gcsBase}/${NOME_ZIP}`);
  const rgAtual = await U.verificar({ urlBase: gcsBase, chavePublicaPem: k.pub, fetchFn: gcsServidor(200, manGcs), versaoAtual: '2.1.0' });
  assert.equal(rgAtual.estado, 'atual');
  const manAdulterado = JSON.stringify(U.assinarManifesto(payloadDe(zip, { versao: '2.1.0' }), outra.priv));
  const rgAssin = await U.verificar({ urlBase: gcsBase, chavePublicaPem: k.pub, fetchFn: gcsServidor(200, manAdulterado), versaoAtual: '2.0.0' });
  assert.deepEqual([rgAssin.estado, rgAssin.motivo], ['erro', 'assinatura']);
  const rg404 = await U.verificar({ urlBase: gcsBase, chavePublicaPem: k.pub, fetchFn: gcsServidor(404, ''), versaoAtual: '2.0.0' });
  assert.deepEqual([rg404.estado, rg404.motivo], ['erro', 'nao-encontrado']);

  console.log('test-atualizacao-app: ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
