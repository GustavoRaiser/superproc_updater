'use strict';
// Atualização do próprio SuperPROC: manifesto assinado (Ed25519) hospedado em releases do GitHub, download com
// verificação de tamanho e SHA-256. Módulo puro (sem Electron): rede e relógio entram por parâmetro.
// A troca da pasta de instalação NÃO está aqui (ver aplicador); este módulo só decide e baixa.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 1;
const PRODUTO = 'SuperPROC v2';
const REGEX_VERSAO = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/;
const REGEX_REPOSITORIO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REGEX_ID_DRIVE = /^[A-Za-z0-9_-]{10,100}$/;
const REGEX_URL_BASE = /^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._-]+)*\/?$/;
const REGEX_NOME_ZIP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,118}\.zip$/;
// Cada versão publica um manifesto assinado chamado manifesto-<versão>.json nas assets da release.
const REGEX_MANIFESTO = /^manifesto-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\.json$/;
const MAX_CANDIDATOS = 10;
const REGEX_SHA256 = /^[a-f0-9]{64}$/;
const LIMITE_MANIFESTO = 64 * 1024;
const LIMITE_PACOTE = 1024 * 1024 * 1024; // 1 GB: teto de sanidade para o zip
const INTERVALO_AUTOMATICO_MS = 24 * 60 * 60 * 1000;
const ARQUIVO_ESTADO = 'atualizacao.json';

// ---------- versões ----------
function analisarVersao(texto) {
  const m = REGEX_VERSAO.exec(String(texto || ''));
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || null } : null;
}
// Retorna -1, 0 ou 1. Versão com sufixo (-dev, -beta.1) é menor que a mesma sem sufixo. Inválida lança erro.
function compararVersoes(a, b) {
  const x = analisarVersao(a), y = analisarVersao(b);
  if (!x || !y) throw new Error(`Versão inválida: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  const px = x.pre.split('.'), py = y.pre.split('.');
  for (let i = 0; i < Math.max(px.length, py.length); i++) {
    if (px[i] === undefined) return -1;
    if (py[i] === undefined) return 1;
    const nx = /^\d+$/.test(px[i]), ny = /^\d+$/.test(py[i]);
    if (nx && ny) { if (Number(px[i]) !== Number(py[i])) return Number(px[i]) < Number(py[i]) ? -1 : 1; }
    else if (nx !== ny) return nx ? -1 : 1;
    else if (px[i] !== py[i]) return px[i] < py[i] ? -1 : 1;
  }
  return 0;
}

// ---------- manifesto assinado ----------
// JSON canônico (chaves ordenadas): assinante e verificador precisam produzir os mesmos bytes.
function canonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
  return '{' + Object.keys(valor).filter((k) => valor[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonico(valor[k])).join(',') + '}';
}
function validarPayload(p) {
  if (!p || typeof p !== 'object') throw new Error('Manifesto sem conteúdo.');
  if (p.schema !== SCHEMA) throw new Error('Esquema de manifesto não suportado.');
  if (p.produto !== PRODUTO) throw new Error('Manifesto de outro produto.');
  if (!analisarVersao(p.versao)) throw new Error('Versão do manifesto inválida.');
  if (p.minimaVersao != null && !analisarVersao(p.minimaVersao)) throw new Error('Versão mínima inválida.');
  if (typeof p.digest !== 'string' || !REGEX_SHA256.test(p.digest)) throw new Error('Digest inválido.');
  const z = p.zip;
  if (!z || !REGEX_NOME_ZIP.test(String(z.nome || ''))) throw new Error('Nome do pacote inválido.');
  if (!Number.isSafeInteger(z.bytes) || z.bytes <= 0 || z.bytes > LIMITE_PACOTE) throw new Error('Tamanho do pacote inválido.');
  if (typeof z.sha256 !== 'string' || !REGEX_SHA256.test(z.sha256)) throw new Error('SHA-256 do pacote inválido.');
  if (p.notas != null && (typeof p.notas !== 'string' || p.notas.length > 4000)) throw new Error('Notas inválidas.');
  return p;
}
function assinarManifesto(payload, chavePrivadaPem) {
  validarPayload(payload);
  const assinatura = crypto.sign(null, Buffer.from(canonico(payload)), crypto.createPrivateKey(chavePrivadaPem)).toString('base64');
  return { payload, assinatura };
}
// Lança erro se a assinatura não bater ou o conteúdo for inválido; devolve o payload verificado.
function verificarManifesto(manifesto, chavePublicaPem) {
  if (!manifesto || typeof manifesto !== 'object' || typeof manifesto.assinatura !== 'string' || !manifesto.payload) throw new Error('Manifesto malformado.');
  const ok = crypto.verify(null, Buffer.from(canonico(manifesto.payload)), crypto.createPublicKey(chavePublicaPem), Buffer.from(manifesto.assinatura, 'base64'));
  if (!ok) throw new Error('Assinatura do manifesto inválida.');
  return validarPayload(manifesto.payload);
}

// ---------- rede (GitHub Releases API, somente leitura) ----------
function urlReleases(repositorio, pagina = 1) {
  if (!REGEX_REPOSITORIO.test(String(repositorio || ''))) throw new Error('Repositório GitHub inválido.');
  const [dono, repo] = String(repositorio).split('/');
  return `https://api.github.com/repos/${encodeURIComponent(dono)}/${encodeURIComponent(repo)}/releases?per_page=30&page=${pagina}`;
}
const urlListagem = urlReleases;

function urlDrive(id, chave) {
  if (!REGEX_ID_DRIVE.test(String(id || ''))) throw new Error('ID de arquivo do Drive inválido.');
  if (!chave || typeof chave !== 'string') throw new Error('Chave da API ausente.');
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(chave)}`;
}

function headersHttp(url, apiKey) {
  const h = { 'User-Agent': 'SuperPROC-v2', 'Accept': 'application/vnd.github+json' };
  if (apiKey) {
    try {
      const u = new URL(url);
      if (u.hostname === 'api.github.com') h['Authorization'] = `Bearer ${apiKey}`;
    } catch {}
  }
  return h;
}

class ErroAtualizacao extends Error {
  constructor(motivo, mensagem) { super(mensagem); this.motivo = motivo; }
}

function erroHttp(status) {
  if (status === 403 || status === 429) return new ErroAtualizacao('limite', 'O servidor de atualização limitou temporariamente as consultas. Tente novamente mais tarde.');
  if (status === 404) return new ErroAtualizacao('nao-encontrado', 'Arquivo ou repositório de atualização não encontrado.');
  return new ErroAtualizacao('http', `O servidor de atualização respondeu com erro ${status}.`);
}

async function lerLimitado(res, limite) {
  const partes = []; let total = 0;
  if (!res.body) throw new ErroAtualizacao('rede', 'Resposta sem corpo.');
  for await (const parte of res.body) {
    total += parte.length;
    if (total > limite) throw new ErroAtualizacao('tamanho', 'Resposta maior que o permitido.');
    partes.push(Buffer.from(parte));
  }
  return Buffer.concat(partes);
}

// Lista os arquivos de release do repositório público. Devolve [{ id, nome, bytes, url }].
async function listarPasta({ fetchFn, apiKey, repositorio, pastaId, signal }) {
  const repo = repositorio || pastaId;
  if (!repo || !REGEX_REPOSITORIO.test(String(repo))) {
    if (pastaId && REGEX_ID_DRIVE.test(String(pastaId)) && apiKey) {
      const q = encodeURIComponent(`'${pastaId}' in parents and trashed=false`), campos = encodeURIComponent('nextPageToken,files(id,name,size)');
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${campos}&pageSize=1000&key=${encodeURIComponent(apiKey)}`;
      const res = await fetchFn(url, { signal });
      if (!res.ok) throw erroHttp(res.status);
      const corpo = JSON.parse((await lerLimitado(res, 1024 * 1024)).toString('utf8'));
      const arquivos = [];
      for (const a of Array.isArray(corpo.files) ? corpo.files : []) {
        if (a && typeof a.id === 'string' && typeof a.name === 'string') {
          arquivos.push({ id: a.id, nome: a.name, bytes: Number(a.size), url: urlDrive(a.id, apiKey) });
        }
      }
      return arquivos;
    }
    throw new Error('Repositório de atualização inválido.');
  }

  const arquivos = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const url = urlReleases(repo, pagina);
    const res = await fetchFn(url, { headers: headersHttp(url, apiKey), signal });
    if (!res.ok) throw erroHttp(res.status);
    let corpo;
    try {
      corpo = JSON.parse((await lerLimitado(res, 2 * 1024 * 1024)).toString('utf8'));
    } catch (e) {
      if (e instanceof ErroAtualizacao) throw e;
      throw new ErroAtualizacao('manifesto', 'Listagem ilegível.');
    }
    if (!Array.isArray(corpo)) throw new ErroAtualizacao('manifesto', 'Formato de resposta inesperado.');
    if (!corpo.length) break;

    for (const r of corpo) {
      if (r && r.draft) continue;
      for (const a of (r && Array.isArray(r.assets) ? r.assets : [])) {
        if (a && typeof a.name === 'string') {
          arquivos.push({
            id: String(a.id || a.name),
            nome: a.name,
            bytes: Number(a.size),
            url: a.browser_download_url || a.url
          });
        }
      }
    }
    if (corpo.length < 30) break;
  }
  return arquivos;
}

function normalizarUrlBase(urlBase) {
  const s = String(urlBase || '').trim();
  if (!REGEX_URL_BASE.test(s)) throw new Error('URL base de atualização inválida.');
  return s.replace(/\/+$/, '');
}

// Acha no servidor (Google Cloud Storage via urlBase, ou GitHub Releases) a versão mais recente com manifesto de assinatura válida e compara com a instalada.
// Nunca lança: devolve {estado:'erro', motivo, mensagem}. Em 'disponivel' traz também a URL do zip.
async function verificar({ fetchFn, apiKey, urlBase, repositorio, pastaId, chavePublicaPem, versaoAtual, signal }) {
  try {
    if (!chavePublicaPem) return { estado: 'erro', motivo: 'nao-configurado', mensagem: 'A atualização ainda não foi configurada nesta versão.' };
    if (urlBase) {
      const base = normalizarUrlBase(urlBase);
      const urlManifesto = `${base}/manifesto-latest.json`;
      const res = await fetchFn(urlManifesto, { headers: { 'User-Agent': 'SuperPROC-v2', 'Accept': 'application/json', 'Cache-Control': 'no-cache' }, signal });
      if (!res.ok) throw erroHttp(res.status);
      let payload;
      try {
        payload = verificarManifesto(JSON.parse((await lerLimitado(res, LIMITE_MANIFESTO)).toString('utf8')), chavePublicaPem);
      } catch (e) {
        if (e instanceof ErroAtualizacao) throw e;
        return { estado: 'erro', motivo: 'assinatura', mensagem: 'Nenhum manifesto de atualização passou na verificação de segurança.' };
      }
      if (compararVersoes(payload.versao, versaoAtual) <= 0) return { estado: 'atual', versao: versaoAtual, versaoPublicada: payload.versao };
      const zipUrl = `${base}/${payload.zip.nome}`;
      return { estado: 'disponivel', payload, zipUrl, zipId: zipUrl, exigeInstalacaoManual: !!payload.minimaVersao && compararVersoes(versaoAtual, payload.minimaVersao) < 0 };
    }
    const repo = repositorio || pastaId;
    if (!repo) return { estado: 'erro', motivo: 'nao-configurado', mensagem: 'A atualização ainda não foi configurada nesta versão.' };
    const arquivos = await listarPasta({ fetchFn, apiKey, repositorio: repo, signal });
    const candidatos = arquivos
      .map((a) => ({ ...a, m: REGEX_MANIFESTO.exec(a.nome) })).filter((a) => a.m && a.bytes <= LIMITE_MANIFESTO)
      .map((a) => ({ id: a.id, nome: a.nome, versao: a.m[1], url: a.url }))
      .sort((x, y) => compararVersoes(y.versao, x.versao)).slice(0, MAX_CANDIDATOS);
    if (!candidatos.length) return { estado: 'erro', motivo: 'sem-versao', mensagem: 'Nenhuma versão foi publicada no repositório de atualização.' };
    let payload = null;
    for (const c of candidatos) {
      const res = await fetchFn(c.url, { headers: headersHttp(c.url, apiKey), signal });
      if (!res.ok) throw erroHttp(res.status);
      try {
        const p = verificarManifesto(JSON.parse((await lerLimitado(res, LIMITE_MANIFESTO)).toString('utf8')), chavePublicaPem);
        if (p.versao !== c.versao) throw new Error('versão diferente do nome do arquivo');
        payload = p; break;
      } catch (e) { if (e instanceof ErroAtualizacao) throw e; /* manifesto inválido ou adulterado: tenta o anterior */ }
    }
    if (!payload) return { estado: 'erro', motivo: 'assinatura', mensagem: 'Nenhum manifesto de atualização passou na verificação de segurança.' };
    if (compararVersoes(payload.versao, versaoAtual) <= 0) return { estado: 'atual', versao: versaoAtual, versaoPublicada: payload.versao };
    const zips = arquivos.filter((a) => a.nome === payload.zip.nome && a.bytes === payload.zip.bytes);
    if (!zips.length) return { estado: 'erro', motivo: 'nao-encontrado', mensagem: 'O pacote da versão ' + payload.versao + ' não está nas releases de atualização.' };
    return { estado: 'disponivel', payload, zipUrl: zips[0].url, zipId: zips[0].url, exigeInstalacaoManual: !!payload.minimaVersao && compararVersoes(versaoAtual, payload.minimaVersao) < 0 };
  } catch (e) {
    if (e && e.name === 'AbortError') return { estado: 'erro', motivo: 'cancelado', mensagem: 'Verificação cancelada.' };
    if (e instanceof ErroAtualizacao) return { estado: 'erro', motivo: e.motivo, mensagem: e.message };
    return { estado: 'erro', motivo: 'rede', mensagem: 'Não foi possível consultar o servidor de atualização.' };
  }
}

// Baixa o pacote para `destino` (via .part), conferindo tamanho e SHA-256 do manifesto. Em qualquer falha apaga o parcial.
async function baixarPacote({ fetchFn, apiKey, payload, zipUrl, zipId, destino, onProgresso, signal }) {
  validarPayload(payload);
  const urlDownload = zipUrl || zipId;
  if (!urlDownload || typeof urlDownload !== 'string') throw new ErroAtualizacao('nao-encontrado', 'URL de download do pacote ausente.');
  const parcial = destino + '.part';
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.rmSync(parcial, { force: true });
  let fd = null;
  try {
    const res = await fetchFn(urlDownload, { headers: headersHttp(urlDownload, apiKey), signal });
    if (!res.ok) throw erroHttp(res.status);
    if (!res.body) throw new ErroAtualizacao('rede', 'Resposta sem corpo.');
    const hash = crypto.createHash('sha256'); let recebidos = 0, ultimoAviso = 0;
    fd = fs.openSync(parcial, 'wx');
    for await (const parte of res.body) {
      const buf = Buffer.from(parte); recebidos += buf.length;
      if (recebidos > payload.zip.bytes) throw new ErroAtualizacao('tamanho', 'O pacote recebido é maior que o anunciado.');
      hash.update(buf); fs.writeSync(fd, buf);
      if (onProgresso && recebidos - ultimoAviso >= 1024 * 1024) { ultimoAviso = recebidos; onProgresso({ recebidos, total: payload.zip.bytes }); }
    }
    fs.closeSync(fd); fd = null;
    if (recebidos !== payload.zip.bytes) throw new ErroAtualizacao('tamanho', 'Download incompleto.');
    if (hash.digest('hex') !== payload.zip.sha256) throw new ErroAtualizacao('hash', 'O pacote baixado não confere com o manifesto (SHA-256).');
    fs.renameSync(parcial, destino);
    if (onProgresso) onProgresso({ recebidos, total: payload.zip.bytes });
    return { arquivo: destino, bytes: recebidos };
  } catch (e) {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* já fechado */ }
    fs.rmSync(parcial, { force: true });
    if (e && e.name === 'AbortError') throw new ErroAtualizacao('cancelado', 'Download cancelado.');
    if (e instanceof ErroAtualizacao) throw e;
    throw new ErroAtualizacao('rede', 'Falha de rede durante o download.');
  }
}

// ---------- estado do usuário (userData/atualizacao.json) ----------
// Duas chaves do menu: `verificar` (consulta o servidor ao abrir e a cada 24 h; padrão ligada) e `automatica`
// (baixa sozinha a versão nova; padrão desligada). Automática exige verificar: ligar uma liga a outra, desligar
// verificar desliga automática.
const ESTADO_PADRAO = Object.freeze({ verificar: true, automatica: false, ultimaVerificacao: null, versaoIgnorada: null });
function normalizarEstado(bruto) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const automatica = b.automatica === true;
  return {
    verificar: automatica ? true : (b.verificar === undefined ? ESTADO_PADRAO.verificar : b.verificar === true),
    automatica,
    ultimaVerificacao: Number.isFinite(b.ultimaVerificacao) ? b.ultimaVerificacao : null,
    versaoIgnorada: analisarVersao(b.versaoIgnorada) ? b.versaoIgnorada : null
  };
}
function lerEstado(userData) {
  try { return normalizarEstado(JSON.parse(fs.readFileSync(path.join(userData, ARQUIVO_ESTADO), 'utf8'))); }
  catch { return { ...ESTADO_PADRAO }; }
}
function salvarEstado(userData, estado) {
  const limpo = normalizarEstado(estado);
  fs.mkdirSync(userData, { recursive: true });
  const destino = path.join(userData, ARQUIVO_ESTADO), tmp = destino + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(limpo, null, 2));
  fs.renameSync(tmp, destino);
  return limpo;
}
function deveVerificarAutomaticamente(estado, agora) {
  return (estado.verificar === true || estado.automatica === true) && (estado.ultimaVerificacao === null || agora - estado.ultimaVerificacao >= INTERVALO_AUTOMATICO_MS);
}

module.exports = {
  SCHEMA, PRODUTO, INTERVALO_AUTOMATICO_MS, ErroAtualizacao,
  analisarVersao, compararVersoes, canonico, validarPayload, assinarManifesto, verificarManifesto,
  urlDrive, urlReleases, urlListagem, headersHttp,
  verificar, listarPasta, baixarPacote,
  normalizarEstado, lerEstado, salvarEstado, deveVerificarAutomaticamente
};
