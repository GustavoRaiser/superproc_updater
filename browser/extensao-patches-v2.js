'use strict';
// Patches do SuperPROC v2 sobre AZflow/Epryx que NÃO são mecânicos (esses estão em REGRAS_V2, em extensao-atualizador.js).
// Cada patch é ancorado em texto da loja e idempotente: se a âncora sumir (a loja mudou o trecho), o patch NÃO é aplicado e o
// atualizador o lista no relatório em vez de falhar. Os trechos grandes ficam em browser/patches-v2/.
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, 'patches-v2');
const asset = (nome) => fs.readFileSync(path.join(ASSETS, nome), 'utf8').replace(/\r\n/g, '\n');

// Cada patch: { id, ext, arquivo, descricao, aplicar(texto) -> { texto, aplicado, motivo? } }
const ok = (texto) => ({ texto, aplicado: true });
const nao = (texto, motivo) => ({ texto, aplicado: false, motivo });

const PATCHES_V2 = [
  {
    id: 'azflow-polyfill-electron', ext: 'azflow', arquivo: 'background.js',
    descricao: 'chrome.windows e chrome.system.display no service worker (o Electron não os tem); precisa vir antes dos importScripts.',
    aplicar(t) {
      if (t.includes('SuperPROC Electron Compatibility Polyfill')) return ok(t);
      return ok(asset('azflow-electron-polyfill.js') + '\n' + t);
    }
  },
  {
    id: 'azflow-sisp-cache-limitado', ext: 'azflow', arquivo: 'background.js',
    descricao: 'Cache de consulta SISP limitado (64 itens, 4 MB, TTL) e sem protótipo.',
    aplicar(t) {
      if (t.includes('function pruneSispConsultaCache')) return ok(t);
      const decl = /(const SISP_CONSULTA_CACHE_TTL_MS = [^\n]*\n)(?:let|var) sispConsultaCache = \{\};\n/;
      if (!decl.test(t)) return nao(t, 'declaração de sispConsultaCache não encontrada');
      t = t.replace(decl, (_, ttl) => ttl + 'var sispConsultaCache = Object.create(null);\n' +
        'function pruneSispConsultaCache() {\n  if (!sispConsultaCache) return;\n  const entries = Object.entries(sispConsultaCache).sort((a,b) => b[1].ts-a[1].ts);\n  let count=0, bytes=0;\n' +
        '  for (const [key,item] of entries) {\n    const size=JSON.stringify(item.data).length*2;\n    if (Date.now()-item.ts >= SISP_CONSULTA_CACHE_TTL_MS || ++count>64 || bytes+size>4*1024*1024) delete sispConsultaCache[key];\n    else bytes+=size;\n  }\n}\n');
      const antes = 'const cached = sispConsultaCache[cpfNorm];', grava = /(\n(\s*)sispConsultaCache\[cpfNorm\] = \{[^\n]*\};)/, limpeza = /(function cleanupExpiredStorage\(\) \{\n)/;
      if (!t.includes(antes) || !grava.test(t) || !limpeza.test(t)) return nao(t, 'pontos de uso do cache não encontrados (consulta, gravação ou cleanupExpiredStorage)');
      t = t.replace(antes, 'pruneSispConsultaCache();\n  ' + antes).replace(grava, (m, _a, ind) => m + '\n' + ind + 'pruneSispConsultaCache();').replace(limpeza, (m) => m + '  pruneSispConsultaCache();\n');
      return ok(t);
    }
  },
  {
    id: 'azflow-cache-modelos-escopado', ext: 'azflow', arquivo: 'indexeddb-cache-modelos.js',
    descricao: 'Cache de modelos reescrito: isolado por origem/usuário/unidade/época de autenticação, com TTL e limites. Mesma API pública.',
    aplicar(t) {
      if (t.includes('__superproc_auth_epoch_v2')) return ok(t);
      if (!/window\.IndexedDBCacheModelos\s*=/.test(t)) return nao(t, 'API IndexedDBCacheModelos não encontrada; arquivo da loja mudou de forma');
      const guarda = /^\s*\/\/ AZFLOW_GLOBAL_POWER_GUARD\n[^\n]*\n/.exec(t);
      return ok((guarda ? guarda[0].replace(/^\s+/, '') : '') + asset('azflow-indexeddb-cache-modelos.js'));
    }
  },
  {
    id: 'epryx-fila-anexos-limitada', ext: 'epryx', arquivo: 'src/runtime/background.js',
    descricao: 'Fila de anexos em memória com limites (32 itens, 96 MB), contagem de bytes e timer cancelável.',
    aplicar(t) {
      if (t.includes('const dataCacheMeta = new Map()')) return ok(t);
      const ini = t.indexOf('function cacheData(data, options = {}) {'), fim = t.indexOf('function encodeToHtmlEntities');
      if (ini < 0 || fim < ini || !t.slice(ini, fim).includes('function retrieveData(')) return nao(t, 'cacheData/retrieveData não encontrados em sequência');
      // dataCache.delete direto fora destas funções contornaria a contagem de bytes
      const resto = t.slice(0, ini) + t.slice(fim);
      if (/dataCache\.delete\(/.test(resto)) return nao(t, 'há dataCache.delete fora de cacheData/retrieveData; revisar à mão');
      return ok(t.slice(0, ini) + asset('epryx-fila-anexos.js') + '\n' + t.slice(fim));
    }
  },
  {
    id: 'epryx-solver-subconjunto-exato', ext: 'epryx', arquivo: 'src/ia/primitives/create-draft-iframe.js',
    descricao: 'Busca de combinação de diligências delegada ao solver limitado SuperprocExactSubset (src/runtime/exact-subset.js).',
    aplicar(t) {
      if (t.includes('SuperprocExactSubset.solve')) return ok(t);
      const a = /([ \t]*)const combinacaoMaisProxima = \(opcoes, ?alvo, ?aceitarInferior\) => \{/.exec(t);
      if (!a) return nao(t, 'combinacaoMaisProxima não encontrada');
      const b = /\n[ \t]*if \(!diag\.temFieldset\) \{/.exec(t.slice(a.index));
      if (!b) return nao(t, 'fim das funções de combinação não encontrado');
      const fim = a.index + b.index, trecho = t.slice(a.index, fim);
      if (!/const melhorCombinacaoAbaixo = /.test(trecho)) return nao(t, 'melhorCombinacaoAbaixo não encontrada dentro do trecho');
      const ind = a[1];
      const novo = ind + 'const combinacaoMaisProxima = (opcoes,alvo,aceitarInferior) => globalThis.SuperprocExactSubset.solve(opcoes,alvo,aceitarInferior,valorCentavos);\n' +
        ind + 'const melhorCombinacaoAbaixo = (opcoes,alvo) => globalThis.SuperprocExactSubset.solve(opcoes,alvo,true,valorCentavos,true);\n';
      return ok(t.slice(0, a.index) + novo + t.slice(fim));
    }
  }
];

// Aplica os patches de uma extensão a um arquivo; devolve o texto final e o que foi (ou não) aplicado.
function aplicarPatchesV2(ext, arquivo, texto) {
  const aplicados = [], falhas = [];
  for (const p of PATCHES_V2) {
    if (p.ext !== ext || p.arquivo !== arquivo) continue;
    const r = p.aplicar(texto); texto = r.texto;
    (r.aplicado ? aplicados : falhas).push(r.aplicado ? p.id : { id: p.id, motivo: r.motivo });
  }
  return { texto, aplicados, falhas };
}
const arquivosComPatchV2 = (ext) => new Set(PATCHES_V2.filter(p => p.ext === ext).map(p => p.arquivo));

module.exports = { PATCHES_V2, aplicarPatchesV2, arquivosComPatchV2 };
