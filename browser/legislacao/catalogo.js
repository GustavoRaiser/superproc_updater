'use strict';
/**
 * Catálogo local: índice de metadados de todas as normas disponíveis para PESQUISA.
 * Pesquisar nunca baixa texto nem altera o acesso rápido (isso é da biblioteca e do usuário).
 *
 * Fontes do índice: snapshot embutido (`dados/catalogo.json.gz`, gerado por
 * scripts/gerar-catalogo-legislacao.cjs a partir das listas oficiais do Senado) + delta local
 * (`catalogo-delta.json` em userData) com o que a atualização diária trouxe depois.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { identificar, apelidos, numeroFormatado, TIPOS, FAMILIAS_RECENTES } = require('./tipos');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'no', 'na', 'em', 'que', 'lei', 'n', 'no.']);

/** Apelidos usuais que o Senado nem sempre traz: sigla → [familia, numero, ano]. */
const APELIDOS_EXTRAS = {
  cf: ['CON', '1988', '1988'], 'cf/88': ['CON', '1988', '1988'], cr: ['CON', '1988', '1988'],
  cc: ['LEI', '10406', '2002'], cpc: ['LEI', '13105', '2015'], cdc: ['LEI', '8078', '1990'],
  cp: ['DEL', '2848', '1940'], cpp: ['DEL', '3689', '1941'], clt: ['DEL', '5452', '1943'],
  lcp: ['DEL', '3688', '1941'], cpm: ['DEL', '1001', '1969'], cppm: ['DEL', '1002', '1969'],
  lindb: ['DEL', '4657', '1942'], ctn: ['LEI', '5172', '1966'], ctb: ['LEI', '9503', '1997'],
  eca: ['LEI', '8069', '1990'], lgpd: ['LEI', '13709', '2018'], lep: ['LEI', '7210', '1984'],
  lef: ['LEI', '6830', '1980'], lia: ['LEI', '8429', '1992'], lai: ['LEI', '12527', '2011'],
  lrf: ['LCP', '101', '2000'], lrp: ['LEI', '6015', '1973'], oab: ['LEI', '8906', '1994'],
  'marco civil': ['LEI', '12965', '2014'], 'maria da penha': ['LEI', '11340', '2006'],
  inquilinato: ['LEI', '8245', '1991'], falencia: ['LEI', '11101', '2005'], juizados: ['LEI', '9099', '1995'],
  drogas: ['LEI', '11343', '2006'], arbitragem: ['LEI', '9307', '1996'], mediacao: ['LEI', '13140', '2015'],
  licitacoes: ['LEI', '14133', '2021'], 'estatuto do idoso': ['LEI', '10741', '2003'],
  'estatuto da cidade': ['LEI', '10257', '2001'], 'estatuto da pessoa com deficiencia': ['LEI', '13146', '2015'],
  'codigo eleitoral': ['LEI', '4737', '1965'], 'codigo florestal': ['LEI', '12651', '2012']
};

const FAMILIA_DE = (k) => String(k).split('-')[0];

function entradaDeDocumento(d) {
  const id = identificar(d);
  if (!id) return null;
  return {
    u: id.urn, k: d.tipo, n: id.numero, d: id.data, t: String(d.normaNome || '').trim(),
    e: String(d.ementa || '').trim(), a: apelidos(d), i: String(d.id || ''), s: id.slug
  };
}

function ano2(yy) {
  const atual = new Date().getFullYear() % 100;
  return yy <= atual ? 2000 + yy : 1900 + yy;
}

/** Interpreta uma consulta humana ("lei 10.406/2002", "cpc", "dl 2848", "codigo civil"). */
function analisarConsulta(consulta) {
  const original = String(consulta || '').toLowerCase();
  let resto = norm(original);
  const r = { texto: resto, familias: null, numero: null, ano: null, palavras: [] };
  const tipos = [
    [/\blei complementar\b|\blcp\b|\blc\b/, ['LCP']], [/\bdecreto[- ]lei\b|\bdel\b|\bdl\b/, ['DEL']],
    [/\bdecreto\b|\bdec\b/, ['DEC']], [/\bmedida provisoria\b|\bmpv\b|\bmp\b/, ['MPV']], [/\bemenda constitucional\b|\bemc\b|\bec\b/, ['EMC']],
    [/\blei delegada\b/, ['LDL']], [/\bconstituicao\b/, ['CON']], [/\blei\b/, ['LEI']]
  ];
  for (const [rx, fam] of tipos) {
    if (rx.test(resto)) { r.familias = fam; resto = resto.replace(rx, ' '); break; }
  }
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*[/\-]\s*(\d{4}|\d{2})\b)?/.exec(resto);
  if (m) {
    const num = m[1].replace(/\./g, '');
    const soAno = !m[2] && /^(19|20)\d\d$/.test(num);
    if (soAno && /[a-z]{3,}/.test(resto.replace(m[0], ''))) r.ano = Number(num);
    else {
      r.numero = String(parseInt(num, 10));
      if (m[2]) r.ano = m[2].length === 4 ? Number(m[2]) : ano2(Number(m[2]));
    }
    resto = resto.replace(m[0], ' ');
  }
  r.palavras = resto.split(/[^a-z0-9]+/).filter(p => p && !STOP.has(p));
  return r;
}

function criarCatalogo({ snapshot, delta, ler = fs.readFileSync, escrever } = {}) {
  let itens = [];
  let porUrn = new Map();
  let deltaItens = [];
  let geradoEm = null;

  function indexar(lista) {
    for (const x of lista) {
      if (!x || !x.u || porUrn.has(x.u)) continue;
      x.h = norm(`${x.t} ${x.e} ${(x.a || []).join(' ')}`);
      // Apelidos: nome completo, nome sem "(ano)" e siglas entre parênteses ("Código Civil (2002) (CC)" → CC).
      x.al = (x.a || []).flatMap(a => [norm(a), norm(a.replace(/\s*\(\d{4}\)/g, '').replace(/\s*\([^()]{2,14}\)\s*$/, '')),
        ...[...a.matchAll(/\(([^()]{2,14})\)/g)].map(m => norm(m[1])).filter(s => !/^\d{4}$/.test(s))]);
      x.ano = Number(String(x.d).slice(0, 4));
      x.num = String(parseInt(String(x.n).split('-')[0], 10) || '');
      porUrn.set(x.u, x);
      itens.push(x);
    }
  }

  function carregar() {
    itens = []; porUrn = new Map(); deltaItens = [];
    try {
      if (snapshot && fs.existsSync(snapshot)) {
        const j = JSON.parse(zlib.gunzipSync(ler(snapshot)).toString('utf8'));
        geradoEm = j.gerado_em || null;
        indexar(j.itens || []);
      }
    } catch (e) { console.error('[legislacao] snapshot do catálogo ilegível:', e.message); }
    try {
      if (delta && fs.existsSync(delta)) {
        const j = JSON.parse(ler(delta, 'utf8'));
        deltaItens = Array.isArray(j.itens) ? j.itens : [];
        indexar(deltaItens.map(x => ({ ...x })));
      }
    } catch (e) { console.error('[legislacao] delta do catálogo ilegível:', e.message); }
  }

  function salvarDelta() {
    if (!delta) return;
    const dados = JSON.stringify({ versao: 1, itens: deltaItens.map(({ h, al, ano, num, ...x }) => x) });
    if (escrever) return escrever(delta, dados);
    fs.mkdirSync(path.dirname(delta), { recursive: true });
    const tmp = delta + '.tmp';
    fs.writeFileSync(tmp, dados);
    fs.renameSync(tmp, delta);
  }

  // Carga preguiçosa: o snapshot (~2 MB compactado) só é lido no primeiro uso, não na abertura do app.
  let pronto = false;
  const garantir = () => { if (!pronto) { pronto = true; carregar(); } };

  return {
    get total() { garantir(); return itens.length; },
    get geradoEm() { garantir(); return geradoEm; },
    recarregar: () => { pronto = true; carregar(); },
    obter: (urn) => { garantir(); return porUrn.get(urn) || null; },
    obterPorSlug: (slug) => { garantir(); return itens.find(x => x.s === slug) || null; },
    /** Incorpora documentos da lista do Senado (atualização diária); devolve quantos eram novos. */
    mesclar(documentos) {
      garantir();
      const novos = [];
      for (const d of documentos) {
        const x = entradaDeDocumento(d);
        if (x && !porUrn.has(x.u)) novos.push(x);
      }
      if (!novos.length) return 0;
      deltaItens.push(...novos.map(x => ({ ...x })));
      indexar(novos);
      salvarDelta();
      return novos.length;
    },
    buscar(consulta, { limite = 40 } = {}) {
      garantir();
      const q = analisarConsulta(consulta);
      const bruto = q.texto;
      if (!bruto) return [];
      const extra = APELIDOS_EXTRAS[bruto] || APELIDOS_EXTRAS[q.palavras.join(' ')];
      const ordem = { LEI: 0, LCP: 1, DEL: 2, EMC: 3, CON: 4, MPV: 5, DEC: 6 };
      const achados = [];
      for (const x of itens) {
        const fam = FAMILIA_DE(x.k);
        let pontos = 0;
        if (extra) {
          if (fam === extra[0] && x.num === extra[1] && String(x.ano) === extra[2]) pontos += 1000;
          else if (!(q.numero || q.palavras.length > 1)) continue;
        }
        if (!pontos) {
          if (q.familias && !q.familias.includes(fam)) continue;
          if (q.ano && x.ano !== q.ano) continue;
          if (q.numero && x.num !== q.numero) continue;
          if (q.palavras.some(p => !x.h.includes(p))) continue;
          if (!q.numero && !q.palavras.length && !q.ano && !q.familias) continue;
          if (q.numero) pontos += 100;
          if (q.ano) pontos += 20;
          if (q.familias) pontos += 20;
          pontos += q.palavras.length * 10;
          const frase = q.palavras.join(' ');
          if (q.palavras.length && x.al.some(a => a === bruto || a === frase)) pontos += 500;
          else if (q.palavras.length && x.al.some(a => a.includes(frase))) pontos += 60;
          pontos -= (ordem[fam] ?? 9);
        }
        achados.push([pontos, x]);
      }
      achados.sort((a, b) => b[0] - a[0] || String(b[1].d).localeCompare(String(a[1].d)));
      return achados.slice(0, limite).map(([, x]) => x);
    }
  };
}

/** Nome sugerido para o acesso rápido: "Código Civil — Lei 10.406/2002" (editável pelo usuário). */
function nomeParaAcessoRapido(x) {
  const tipo = TIPOS[x.k];
  const curto = tipo ? tipo[5] : 'Norma';
  const ref = x.k.startsWith('CON-') ? `Constituição ${x.d.slice(0, 4)}` : `${curto} ${numeroFormatado(x.n)}/${x.d.slice(0, 4)}`;
  const nome = (x.a || []).map(a => a.replace(/\s*\([^()]*\)\s*/g, ' ').trim()).find(a => a && a.length < 80 && a.length > 3);
  return nome && !norm(nome).includes(norm(ref)) ? `${nome} — ${ref}` : (x.t || ref);
}

module.exports = { criarCatalogo, analisarConsulta, nomeParaAcessoRapido, entradaDeDocumento, norm, FAMILIAS_RECENTES };
