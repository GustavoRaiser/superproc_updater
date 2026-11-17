'use strict';
/**
 * Acesso às fontes oficiais: normas.leg.br (texto e metadados) e dados abertos do Senado (listas).
 * Regras de rede seguem o ctresb/leis: intervalo mínimo entre requisições, 4 tentativas com espera
 * crescente (2·(n+1)² s) e interrupção imediata em 401/403/429. Só os dois hosts abaixo são acessados.
 */
const HOSTS = new Set(['normas.leg.br', 'legis.senado.leg.br']);
const API_NORMA = 'https://normas.leg.br/api/public/normas?urn=%URN%&tipo_documento=maior-detalhe';
const API_LISTA = 'https://legis.senado.leg.br/dadosabertos/legislacao/lista';
const API_DETALHE = 'https://legis.senado.leg.br/dadosabertos/legislacao/%ID%.json';
const USER_AGENT = 'SuperPROC/2 (consulta pontual de legislacao; copia local)';

class ErroFonteBloqueada extends Error {
  constructor(status, url) { super(`fonte recusou HTTP ${status}: ${url}`); this.name = 'ErroFonteBloqueada'; this.status = status; }
}

function urlPermitida(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && HOSTS.has(u.hostname) && !u.username && !u.password; } catch { return false; }
}

function criarFonte({ fetchImpl = globalThis.fetch, rps = 2, tentativas = 4, timeoutMs = 60000,
  esperar = ms => new Promise(r => setTimeout(r, ms)), agora = () => Date.now() } = {}) {
  let proximo = 0;
  async function limitar() {
    const intervalo = 1000 / rps, t = agora();
    const espera = Math.max(0, proximo - t);
    proximo = Math.max(t, proximo) + intervalo;
    if (espera) await esperar(espera);
  }

  /** @returns {Promise<{status:number, corpo:Buffer}>} 400/404 voltam com corpo vazio; 401/403/429 lançam. */
  async function get(url, aceita = '*/*') {
    if (!urlPermitida(url)) throw new Error('URL fora das fontes oficiais permitidas: ' + url);
    let ultimo = null;
    for (let n = 0; n < tentativas; n++) {
      await limitar();
      try {
        const r = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: aceita }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
        if ([401, 403, 429].includes(r.status)) throw new ErroFonteBloqueada(r.status, url);
        if ([400, 404].includes(r.status)) return { status: r.status, corpo: Buffer.alloc(0) };
        if (r.status >= 200 && r.status < 300) return { status: r.status, corpo: Buffer.from(await r.arrayBuffer()) };
        ultimo = new Error('HTTP ' + r.status);
      } catch (e) {
        if (e instanceof ErroFonteBloqueada) throw e;
        ultimo = e;
      }
      await esperar(2000 * (n + 1) ** 2);
    }
    throw new Error(`falhou após ${tentativas} tentativas: ${url}: ${ultimo && ultimo.message}`);
  }

  const json = (corpo) => (corpo.length ? JSON.parse(corpo.toString('utf8')) : null);
  const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

  return {
    get,
    /** Documentos da lista do Senado para uma família (`LEI`, `LCP`...), opcionalmente de um ano. */
    async listarFamilia(familia, ano) {
      const q = `?tipo=${encodeURIComponent(familia)}` + (ano ? `&ano=${encodeURIComponent(ano)}` : '');
      const { status, corpo } = await get(API_LISTA + q, 'application/json');
      if (status !== 200) return [];
      const j = json(corpo);
      return lista(j && j.ListaDocumento && j.ListaDocumento.documentos && j.ListaDocumento.documentos.documento);
    },
    async metadados(urn) {
      const { status, corpo } = await get(API_NORMA.replace('%URN%', encodeURI(urn)), 'application/json');
      return status === 200 ? json(corpo) : null;
    },
    /** URN oficial de uma norma pelo código do Senado (recuo quando a URN montada não confere). */
    async urnOficial(idSenado) {
      const { status, corpo } = await get(API_DETALHE.replace('%ID%', encodeURIComponent(idSenado)), 'application/json');
      if (status !== 200) return null;
      const j = json(corpo);
      const doc = lista(j && j.DetalheDocumento && j.DetalheDocumento.documentos && j.DetalheDocumento.documentos.documento)[0];
      const url = (doc && doc.identificacao && doc.identificacao.urlDocumento) || '';
      const i = url.indexOf('urn=');
      return i >= 0 && url.slice(i + 4) ? decodeURIComponent(url.slice(i + 4)) : null;
    },
    async texto(contentUrl) {
      const url = String(contentUrl).replace('/api/binario/', '/api/public/binario/');
      const { status, corpo } = await get(url, 'text/html');
      return { status, corpo };
    }
  };
}

/** Escolha da versão do texto: compilada (`Current`); senão a `Original` mais recente; senão a mais recente. */
function escolherTexto(meta) {
  const encs = (meta && meta.encoding != null ? (Array.isArray(meta.encoding) ? meta.encoding : [meta.encoding]) : [])
    .filter(e => e && typeof e === 'object' && e.contentUrl && String(e.encodingFormat || 'text/html').includes('html'));
  if (!encs.length) return null;
  const atual = encs.find(e => e.version === 'Current');
  if (atual) return atual;
  const porData = (a, b) => String(a.datePublished || '').localeCompare(String(b.datePublished || ''));
  const originais = encs.filter(e => e.version === 'Original').sort(porData);
  if (originais.length) return originais[originais.length - 1];
  return encs.sort(porData)[encs.length - 1];
}

module.exports = { criarFonte, escolherTexto, urlPermitida, ErroFonteBloqueada, USER_AGENT, HOSTS };
