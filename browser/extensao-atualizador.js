'use strict';
// Atualização ASSISTIDA das extensões embutidas (AZflow, Epryx) a partir da Chrome Web Store.
// O Electron não atualiza extensões sozinho (ignora update_url), e as pastas embutidas têm patches do SuperPROC v2.
// Por isso: baixa o CRX3, valida assinatura/ID, compara com os patches conhecidos e só monta uma pasta nova se NÃO
// houver conflito. A pasta fica em <userData>/extensoes-atualizadas e a embutida nunca é alterada (reversão = apagar atual.json).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const HOSTS_PERMITIDOS = ['google.com', 'gvt1.com', 'googleusercontent.com', 'googleapis.com'];
const LIMITES = { crx: 200 * 1024 * 1024, arquivo: 100 * 1024 * 1024, total: 400 * 1024 * 1024, entradas: 20000 };
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Adaptações mecânicas que o v2 faz nas extensões para rodarem no Electron. Verificadas contra os arquivos v2 atuais:
// em 47 dos 169 arquivos patchados da loja, estas regras reproduzem o arquivo v2 byte a byte.
//  1) chrome.storage.sync não está disponível -> usa chrome.storage.local (e o filtro de área 'sync' -> 'local').
//  2) APIs ausentes no Electron (webNavigation, windows, downloads, commands, contextMenus) viram opcionais nos listeners.
const REGRAS_V2 = [
  [/storage\.sync/g, 'storage.local'],
  [/(\b(?:area\w*|a|ns|namespace)\s*[!=]==?\s*)(['"])sync\2/g, '$1$2local$2'],
  [/chrome\.(webNavigation|windows|downloads|commands|contextMenus)\.(on[A-Za-z]+)\.addListener/g, 'chrome.$1?.$2?.addListener'],
  // "const f = chrome.api.fn.bind(chrome.api)" no topo do service worker derruba tudo se a função não existir no Electron.
  [/chrome\.([A-Za-z]+)\.([A-Za-z]+)\.bind\(chrome\.\1\)/g, '(chrome.$1?.$2?.bind(chrome.$1) ?? (async () => undefined))']
];
function aplicarRegras(texto) { let t = texto; for (const [de, para] of REGRAS_V2) t = t.replace(de, para); return t; }

// ---------- identidade ----------
function idBytesDaChave(chaveBase64) { return crypto.createHash('sha256').update(Buffer.from(chaveBase64, 'base64')).digest().subarray(0, 16); }
function idDaChave(chaveBase64) { return [...idBytesDaChave(chaveBase64).toString('hex')].map(c => String.fromCharCode(97 + parseInt(c, 16))).join(''); }

// ---------- versões ----------
function compararVersoes(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

// ---------- protobuf mínimo (somente o que o cabeçalho CRX3 usa) ----------
function lerProto(buf) {
  const campos = []; let i = 0;
  const varint = () => { let r = 0, s = 0; for (;;) { if (i >= buf.length || s > 49) throw new Error('Protobuf inválido.'); const b = buf[i++]; r += (b & 0x7f) * 2 ** s; if (!(b & 0x80)) return r; s += 7; } };
  while (i < buf.length) {
    const tag = varint(), campo = Math.floor(tag / 8), tipo = tag & 7;
    if (tipo === 0) campos.push({ campo, valor: varint() });
    else if (tipo === 2) { const n = varint(); if (i + n > buf.length) throw new Error('Protobuf truncado.'); campos.push({ campo, valor: buf.subarray(i, i + n) }); i += n; }
    else throw new Error('Tipo protobuf não suportado no cabeçalho CRX.');
  }
  return campos;
}

// ---------- CRX3 ----------
// Valida: magia/versão, crx_id assinado == ID esperado, e assinatura RSA da chave cujo ID é o esperado.
function verificarCrx3(buf, idEsperado) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('Arquivo não é CRX.');
  if (buf.readUInt32LE(4) !== 3) throw new Error('Somente CRX3 é aceito.');
  const tamCab = buf.readUInt32LE(8);
  if (12 + tamCab > buf.length) throw new Error('Cabeçalho CRX truncado.');
  const cab = lerProto(buf.subarray(12, 12 + tamCab)), arquivo = buf.subarray(12 + tamCab);
  const assinado = cab.find(c => c.campo === 10000)?.valor;
  if (!assinado) throw new Error('CRX sem dados assinados.');
  const crxId = lerProto(assinado).find(c => c.campo === 1)?.valor;
  if (!crxId || crxId.length !== 16 || !idBytesDaIdString(idEsperado).equals(crxId)) throw new Error('ID do CRX difere do ID esperado da extensão.');
  const tam = Buffer.alloc(4); tam.writeUInt32LE(assinado.length);
  const dados = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), tam, assinado, arquivo]);
  for (const prova of cab.filter(c => c.campo === 2)) {
    const p = lerProto(prova.valor), chave = p.find(c => c.campo === 1)?.valor, assinatura = p.find(c => c.campo === 2)?.valor;
    if (!chave || !assinatura) continue;
    if (!crypto.createHash('sha256').update(chave).digest().subarray(0, 16).equals(crxId)) continue;
    const ok = crypto.verify('sha256', dados, { key: chave, format: 'der', type: 'spki' }, assinatura);
    if (ok) return { arquivoZip: arquivo };
  }
  throw new Error('Assinatura do CRX não confere com a chave da extensão.');
}
function idBytesDaIdString(id) { return Buffer.from([...String(id)].map(c => (c.charCodeAt(0) - 97).toString(16)).join(''), 'hex'); }

// ---------- ZIP ----------
function caminhoSeguro(nome) {
  if (!nome || nome.includes('\\') || nome.includes('\0') || nome.startsWith('/') || /^[a-zA-Z]:/.test(nome)) return false;
  return nome.split('/').every(p => p !== '..' && p !== '.' && p !== '');
}
function lerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP inválido (sem diretório central).');
  const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  if (n > LIMITES.entradas) throw new Error('ZIP com entradas demais.');
  const arquivos = new Map(); let total = 0;
  for (let k = 0; k < n; k++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new Error('Diretório central do ZIP corrompido.');
    const metodo = buf.readUInt16LE(off + 10), crc = buf.readUInt32LE(off + 16), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const ln = buf.readUInt16LE(off + 28), le = buf.readUInt16LE(off + 30), lc = buf.readUInt16LE(off + 32), loc = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + ln); off += 46 + ln + le + lc;
    if (nome.endsWith('/')) continue;
    if (!caminhoSeguro(nome)) throw new Error(`Caminho inseguro no ZIP: ${nome}`);
    if (usize > LIMITES.arquivo || (total += usize) > LIMITES.total) throw new Error('ZIP excede o limite de tamanho.');
    if (loc + 30 > buf.length || buf.readUInt32LE(loc) !== 0x04034b50) throw new Error(`Cabeçalho local inválido: ${nome}`);
    const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    if (ini + csize > buf.length) throw new Error(`Dados truncados: ${nome}`);
    const bruto = buf.subarray(ini, ini + csize);
    let dados;
    if (metodo === 0) dados = Buffer.from(bruto);
    else if (metodo === 8) dados = zlib.inflateRawSync(bruto, { maxOutputLength: LIMITES.arquivo });
    else throw new Error(`Método de compressão não suportado: ${nome}`);
    if (dados.length !== usize || (zlib.crc32(dados) >>> 0) !== crc) throw new Error(`CRC inválido: ${nome}`);
    if (arquivos.has(nome)) throw new Error(`Entrada duplicada no ZIP: ${nome}`);
    arquivos.set(nome, dados);
  }
  return arquivos;
}

// ---------- consulta e download ----------
function hostPermitido(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && HOSTS_PERMITIDOS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; }
}
function urlConsulta(id, versao, chrome) {
  const x = encodeURIComponent(`id=${id}&v=${versao}&installsource=ondemand&uc`);
  return `https://clients2.google.com/service/update2/crx?os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromecrx&prodchannel=&prodversion=${encodeURIComponent(chrome)}&lang=pt-BR&acceptformat=crx3&x=${x}`;
}
function lerAtributos(tag) { const o = {}; for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) o[m[1]] = m[2].replace(/&amp;/g, '&'); return o; }
function interpretarResposta(xml) {
  const tag = /<updatecheck\b[^>]*>/.exec(xml)?.[0];
  if (!tag) throw new Error('Resposta da loja sem updatecheck.');
  const uc = lerAtributos(tag);
  if (uc.status === 'noupdate') return { semAtualizacao: true };
  if (uc.status && uc.status !== 'ok') throw new Error(`Loja respondeu status "${uc.status}".`);
  let codebase = uc.codebase, hash = uc.hash_sha256, versao = uc.version;
  if (!codebase) {
    const base = /<url\b[^>]*codebase="([^"]+)"/.exec(xml)?.[1], pkgTag = /<package\b[^>]*>/.exec(xml)?.[0];
    if (!base || !pkgTag) throw new Error('Resposta da loja sem endereço de download.');
    const pkg = lerAtributos(pkgTag); codebase = base.replace(/&amp;/g, '&') + pkg.name; hash = hash || pkg.hash_sha256; versao = versao || lerAtributos(/<manifest\b[^>]*>/.exec(xml)?.[0] || '').version;
  }
  if (!hostPermitido(codebase)) throw new Error('Endereço de download fora dos domínios permitidos.');
  return { codebase, hash: hash ? hash.toLowerCase() : null, versao };
}
async function baixar(fetchFn, url, limite) {
  const res = await fetchFn(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar a loja.`);
  if (res.url && !hostPermitido(res.url)) throw new Error('Redirecionamento para domínio não permitido.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > limite) throw new Error('Resposta maior que o limite.');
  return buf;
}

// ---------- arquivos locais ----------
function listar(dir, base = dir, saida = new Map()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) listar(p, base, saida); else if (e.isFile()) saida.set(path.relative(base, p).split(path.sep).join('/'), p);
  }
  return saida;
}

// ---------- mesclagem do manifesto ----------
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const chaveEntrada = (e) => JSON.stringify([[...(e.matches || [])].sort(), [...(e.exclude_matches || [])].sort(), e.run_at || '', e.world || '', !!e.all_frames, !!e.match_about_blank, !!e.match_origin_as_host_fragment, !!e.match_origin_as_host]);
function inserirLocais(destino, origem, locais) {
  for (let i = 0; i < origem.length; i++) {
    const item = origem[i]; if (!locais.has(item) || destino.includes(item)) continue;
    let pos = 0; for (let j = i - 1; j >= 0; j--) { const k = destino.indexOf(origem[j]); if (k >= 0) { pos = k + 1; break; } }
    destino.splice(pos, 0, item);
  }
}
function mesclarManifesto(U, B, locais) {
  const saida = JSON.parse(JSON.stringify(U)), conflitos = [], novosNaLoja = [];
  for (const k of new Set([...Object.keys(U), ...Object.keys(B)])) {
    if (['key', 'update_url'].includes(k)) { if (k in B) saida[k] = B[k]; continue; } // a loja remove a chave; ela fixa o ID e deve ser preservada
    if (['content_scripts', 'web_accessible_resources', 'version'].includes(k)) continue;
    if (!igual(U[k], B[k])) { conflitos.push(`manifest: chave "${k}" difere entre a loja e a versão anterior; prevaleceu a da loja`); if (k in B && !(k in U)) delete saida[k]; }
  }
  const usados = new Set();
  saida.content_scripts = saida.content_scripts || [];
  for (const b of B.content_scripts || []) {
    const jsB = b.js || [], cssB = b.css || [], temLocal = [...jsB, ...cssB].some(f => locais.has(f));
    const idx = saida.content_scripts.findIndex((u, n) => !usados.has(n) && chaveEntrada(u) === chaveEntrada(b));
    if (idx >= 0) {
      usados.add(idx); const u = saida.content_scripts[idx];
      for (const f of [...jsB, ...cssB]) if (!locais.has(f) && !(u.js || []).includes(f) && !(u.css || []).includes(f)) conflitos.push(`manifest: content_script "${f}" sumiu/mudou na loja`);
      if (temLocal) { if (jsB.some(f => locais.has(f))) { u.js = u.js || []; inserirLocais(u.js, jsB, locais); } if (cssB.some(f => locais.has(f))) { u.css = u.css || []; inserirLocais(u.css, cssB, locais); } }
    } else if (temLocal && [...jsB, ...cssB].every(f => locais.has(f))) saida.content_scripts.push(JSON.parse(JSON.stringify(b)));
    else if (temLocal) { // entrada mista sem correspondente na loja: preserva só a parte do SuperPROC (pontes locais)
      const parte = JSON.parse(JSON.stringify(b)); parte.js = jsB.filter(f => locais.has(f)); parte.css = cssB.filter(f => locais.has(f));
      if (!parte.js.length) delete parte.js; if (!parte.css.length) delete parte.css; saida.content_scripts.push(parte);
      conflitos.push(`manifest: entrada sem correspondente na loja (${(b.matches || []).slice(0, 2).join(', ')}); mantidos só os scripts do SuperPROC`);
    }
    else conflitos.push(`manifest: entrada de content_script da versão anterior não existe mais na loja (${(b.matches || []).slice(0, 2).join(', ')})`);
  }
  saida.web_accessible_resources = saida.web_accessible_resources || [];
  for (const b of B.web_accessible_resources || []) {
    const resB = b.resources || [], loc = resB.filter(f => locais.has(f)); if (!loc.length) continue;
    const chave = (e) => JSON.stringify([[...(e.matches || [])].sort(), [...(e.extension_ids || [])].sort(), !!e.use_dynamic_url]);
    const u = saida.web_accessible_resources.find(e => chave(e) === chave(b));
    if (u) { u.resources = u.resources || []; inserirLocais(u.resources, resB, locais); }
    else if (loc.length === resB.length) saida.web_accessible_resources.push(JSON.parse(JSON.stringify(b)));
    else conflitos.push('manifest: web_accessible_resources do SuperPROC sem correspondente na loja');
  }
  for (const k of ['content_scripts', 'web_accessible_resources']) if (!saida[k].length && !(k in U)) delete saida[k];
  const versoes = { embutida: B.version, loja: U.version };
  if (U.version) saida.version = U.version;
  const nU = new Set(); for (const e of U.content_scripts || []) for (const f of [...(e.js || []), ...(e.css || [])]) nU.add(f);
  const nB = new Set(); for (const e of B.content_scripts || []) for (const f of [...(e.js || []), ...(e.css || [])]) nB.add(f);
  for (const f of nU) if (!nB.has(f)) novosNaLoja.push(f);
  return { manifesto: saida, conflitos, novosNaLoja, versoes };
}

// ---------- plano de atualização ----------
// A loja manda: o conteúdo novo sobrescreve a pasta. Preserva-se o que é do SuperPROC e reaplica-se o que é mecânico:
//  - arquivo com patch v2 que a loja NÃO mudou -> mantém a versão v2 inteira;
//  - arquivo que a loja mudou -> usa o da loja + REGRAS_V2 (patches v2 não mecânicos nesse arquivo são perdidos e listados);
//  - arquivos que só existem localmente (pontes do SuperPROC) -> mantidos; manifesto -> o da loja + entradas locais.
// Nada bloqueia: o risco é coberto pelo canal "estável" (versão anterior, testada), que o usuário pode acionar.
function montarAtualizacao({ arquivosLoja, dirEmbutida, patches, destinoTmp, nomeExtensao }) {
  const { aplicarPatchesV2, arquivosComPatchV2 } = require('./extensao-patches-v2.js'), comPatchV2 = arquivosComPatchV2(nomeExtensao), portados = [], naoPortados = [];
  const embutidos = listar(dirEmbutida), loja = new Map([...arquivosLoja].filter(([n]) => !n.startsWith('_metadata/')));
  if (!loja.has('manifest.json')) throw new Error('CRX sem manifest.json.');
  const U = JSON.parse(loja.get('manifest.json').toString('utf8')), B = JSON.parse(fs.readFileSync(embutidos.get('manifest.json'), 'utf8'));
  const alterados = [], adicionados = [], v2Integros = [], v2SoRegras = [], v2Removidos = [], locaisMantidos = [], locais = new Set();
  // arquivo com patch que a loja removeu NÃO é "local": saiu de vez (e não pode continuar referenciado no manifesto)
  for (const nome of embutidos.keys()) if (!loja.has(nome) && nome !== 'manifest.json' && !patches[nome]) locais.add(nome);
  const saida = new Map(), ehJs = (n) => /\.m?js$/.test(n);
  for (const [nome, dados] of loja) {
    if (nome === 'manifest.json') continue;
    const emb = embutidos.get(nome), original = patches[nome];
    if (original && emb && sha256(dados) === original) { saida.set(nome, fs.readFileSync(emb)); v2Integros.push(nome); continue; }
    let conteudo = dados;
    if (ehJs(nome)) {
      let texto = aplicarRegras(dados.toString('utf8'));
      if (comPatchV2.has(nome)) { const r = aplicarPatchesV2(nomeExtensao, nome, texto); texto = r.texto; for (const id of r.aplicados) portados.push({ arquivo: nome, id }); for (const f of r.falhas) naoPortados.push({ arquivo: nome, ...f }); }
      conteudo = Buffer.from(texto);
    }
    saida.set(nome, conteudo);
    if (original) v2SoRegras.push(nome);
    else if (!emb) adicionados.push(nome);
    else if (sha256(fs.readFileSync(emb)) !== sha256(conteudo)) alterados.push(nome);
  }
  for (const nome of embutidos.keys()) if (!loja.has(nome) && patches[nome] && nome !== 'manifest.json') v2Removidos.push(nome);
  for (const nome of locais) { saida.set(nome, fs.readFileSync(embutidos.get(nome))); locaisMantidos.push(nome); }
  const m = mesclarManifesto(U, B, locais);
  const relatorio = {
    versaoEmbutida: B.version, versaoLoja: U.version, avisos: m.conflitos, arquivosAlterados: alterados.length, arquivosNovos: adicionados.length,
    patchesV2Integros: v2Integros.length, patchesV2SoRegras: v2SoRegras.length, arquivosSuperprocMantidos: locaisMantidos.length,
    arquivosComPatchRemovidosNaLoja: v2Removidos, patchesV2Portados: portados, patchesV2NaoPortados: naoPortados, scriptsNovosNaLoja: m.novosNaLoja, arquivosComPatchAtualizadosPelaLoja: v2SoRegras,
    amostraAlterados: alterados.slice(0, 15), amostraNovos: adicionados.slice(0, 15)
  };
  saida.set('manifest.json', Buffer.from(JSON.stringify(m.manifesto, null, 2) + '\n'));
  for (const [nome, dados] of saida) { const alvo = path.join(destinoTmp, ...nome.split('/')); fs.mkdirSync(path.dirname(alvo), { recursive: true }); fs.writeFileSync(alvo, dados); }
  return { pronto: true, relatorio, manifestSha: sha256(saida.get('manifest.json')) };
}

// ---------- ciclo completo ----------
function raizAtualizacoes(userData) { return path.join(userData, 'extensoes-atualizadas'); }
// idLoja: ID da extensão na Chrome Web Store, que pode diferir do ID derivado da "key" do manifesto embutido (o AZflow é assim).
async function prepararAtualizacao({ nome, dirEmbutida, userData, patches, fetchFn, chrome, idLoja, agora = () => new Date() }) {
  const B = JSON.parse(fs.readFileSync(path.join(dirEmbutida, 'manifest.json'), 'utf8'));
  if (!idLoja && !B.key) throw new Error('Sem ID da loja nem chave no manifesto; não é possível validar a origem.');
  const id = idLoja || idDaChave(B.key), atual = lerAtual(userData, nome), versaoBase = atual ? atual.versao : B.version;
  const dirBase = pastaAtualizada({ nome, dirEmbutida, userData }) || dirEmbutida; // base dos arquivos locais/manifesto: a última aplicada, se houver
  const consulta = interpretarResposta((await baixar(fetchFn, urlConsulta(id, versaoBase, chrome), 1024 * 1024)).toString('utf8'));
  if (consulta.semAtualizacao) return { status: 'sem-atualizacao', nome, id, versaoAtual: versaoBase };
  if (consulta.versao && compararVersoes(consulta.versao, versaoBase) <= 0) return { status: 'sem-atualizacao', nome, id, versaoAtual: versaoBase };
  const crx = await baixar(fetchFn, consulta.codebase, LIMITES.crx);
  if (consulta.hash && sha256(crx) !== consulta.hash) throw new Error('Hash SHA-256 do CRX não confere com o informado pela loja.');
  const { arquivoZip } = verificarCrx3(crx, id), arquivos = lerZip(arquivoZip);
  const raiz = path.join(raizAtualizacoes(userData), nome); fs.mkdirSync(raiz, { recursive: true });
  const U = JSON.parse((arquivos.get('manifest.json') || Buffer.from('{}')).toString('utf8'));
  if (!U.version || compararVersoes(U.version, versaoBase) <= 0) return { status: 'sem-atualizacao', nome, id, versaoAtual: versaoBase };
  const tmp = path.join(raiz, `${U.version}.tmp-${process.pid}`); fs.rmSync(tmp, { recursive: true, force: true });
  const plano = montarAtualizacao({ arquivosLoja: arquivos, dirEmbutida: dirBase, patches, destinoTmp: tmp, nomeExtensao: nome });
  const relatorioPath = path.join(raiz, `relatorio-${U.version}.json`);
  fs.writeFileSync(relatorioPath, JSON.stringify({ geradoEm: agora().toISOString(), nome, id, ...plano.relatorio }, null, 2));
  return { status: 'pronto', nome, id, versaoAtual: versaoBase, versaoNova: U.version, relatorio: plano.relatorio, relatorioPath, tmp, manifestSha: plano.manifestSha, raiz };
}
function aplicarAtualizacao(prep, agora = () => new Date()) {
  if (prep.status !== 'pronto') throw new Error('Nada pronto para aplicar.');
  const final = path.join(prep.raiz, prep.versaoNova);
  fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(prep.tmp, final);
  const anterior = lerAtualBruto(path.dirname(prep.raiz), prep.nome);
  const doc = { schema: 1, versao: prep.versaoNova, pasta: prep.versaoNova, manifestSha: prep.manifestSha, anterior: anterior ? anterior.versao : null, criadoEm: agora().toISOString() };
  const arq = path.join(prep.raiz, 'atual.json'), tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2)); fs.renameSync(tmp, arq);
  return doc;
}
function lerAtualBruto(raizAtual, nome) { try { return JSON.parse(fs.readFileSync(path.join(raizAtual, nome, 'atual.json'), 'utf8')); } catch { return null; } }
function lerAtual(userData, nome) { return lerAtualBruto(raizAtualizacoes(userData), nome); }
function reverter(userData, nome) { const arq = path.join(raizAtualizacoes(userData), nome, 'atual.json'); if (!fs.existsSync(arq)) return false; fs.rmSync(arq); return true; }

// Pasta atualizada válida (íntegra e mais nova que a embutida), ou null.
function pastaAtualizada({ nome, dirEmbutida, userData }) {
  try {
    const atual = lerAtual(userData, nome); if (!atual || !/^[\w.-]+$/.test(atual.pasta || '')) return null;
    const dir = path.join(raizAtualizacoes(userData), nome, atual.pasta), man = path.join(dir, 'manifest.json');
    if (!fs.existsSync(man)) return null;
    const buf = fs.readFileSync(man), m = JSON.parse(buf);
    if (sha256(buf) !== atual.manifestSha || m.version !== atual.versao) return null;
    const emb = JSON.parse(fs.readFileSync(path.join(dirEmbutida, 'manifest.json'), 'utf8'));
    return compararVersoes(m.version, emb.version) > 0 ? dir : null;
  } catch { return null; }
}
// Canal: 'recente' (padrão: atualizada, se houver) ou 'estavel' (a versão anterior testada: dirEstavel, ou a embutida).
function lerCanal(userData) { try { return JSON.parse(fs.readFileSync(path.join(raizAtualizacoes(userData), 'canal.json'), 'utf8')).canal === 'estavel' ? 'estavel' : 'recente'; } catch { return 'recente'; } }
function definirCanal(userData, canal) {
  if (canal !== 'estavel' && canal !== 'recente') throw new Error('Canal inválido.');
  fs.mkdirSync(raizAtualizacoes(userData), { recursive: true });
  const arq = path.join(raizAtualizacoes(userData), 'canal.json'), tmp = arq + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ canal })); fs.renameSync(tmp, arq);
}
// Pasta a carregar. Canal estável -> dirEstavel (ou a embutida). Senão: a atualizada (se íntegra e mais nova) ou a embutida.
function resolverPasta({ nome, dirEmbutida, userData, dirEstavel }) {
  if (lerCanal(userData) === 'estavel') return dirEstavel && fs.existsSync(path.join(dirEstavel, 'manifest.json')) ? dirEstavel : dirEmbutida;
  return pastaAtualizada({ nome, dirEmbutida, userData }) || dirEmbutida;
}

module.exports = { idDaChave, compararVersoes, verificarCrx3, lerZip, interpretarResposta, urlConsulta, hostPermitido, mesclarManifesto, montarAtualizacao, prepararAtualizacao, aplicarAtualizacao, reverter, resolverPasta, pastaAtualizada, lerCanal, definirCanal, aplicarRegras, REGRAS_V2, lerAtual, raizAtualizacoes, sha256, baixar, LIMITES };
