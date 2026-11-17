'use strict';
/**
 * Tipos de norma federal e montagem de URN LEX/slug a partir das listas do Senado.
 * Tabela e regras de montagem seguem scripts/baixar_federal.py do ctresb/leis (scripts MIT).
 * [pasta, prefixo, autoridade, tipo na URN, nome legível, nome curto]
 */
const TIPOS = {
  'LEI-n': ['leis-ordinarias', 'lei', 'federal', 'lei', 'Lei Ordinária', 'Lei'],
  'LEI-sn': ['leis-ordinarias', 'lei-sn', 'federal', 'lei', 'Lei (não numerada)', 'Lei'],
  LCP: ['leis-complementares', 'lcp', 'federal', 'lei.complementar', 'Lei Complementar', 'Lei Complementar'],
  LDL: ['leis-delegadas', 'ldl', 'federal', 'lei.delegada', 'Lei Delegada', 'Lei Delegada'],
  LCT: ['leis-constitucionais', 'lct', 'federal', 'lei.constitucional', 'Lei Constitucional', 'Lei Constitucional'],
  // Decreto federal numerado. O decreto sem número (DEC-sn) fica de fora: não tem identificação estável na fonte.
  'DEC-n': ['decretos', 'dec', 'federal', 'decreto', 'Decreto', 'Decreto'],
  DEL: ['decretos-lei', 'del', 'federal', 'decreto.lei', 'Decreto-Lei', 'Decreto-Lei'],
  'DEL-mpv': ['decretos-lei', 'del', 'federal', 'decreto.lei', 'Decreto-Lei', 'Decreto-Lei'],
  'EMC-n': ['emendas-constitucionais', 'emc', 'federal', 'emenda.constitucional', 'Emenda Constitucional', 'Emenda Constitucional'],
  'EMC-sn': ['emendas-constitucionais', 'emc-sn', 'federal', 'emenda.constitucional', 'Emenda Constitucional (não numerada)', 'Emenda Constitucional'],
  EMR: ['emendas-constitucionais', 'emr', 'federal', 'emenda.constitucional.revisao', 'Emenda Constitucional de Revisão', 'Emenda de Revisão'],
  'MPV-ss': ['medidas-provisorias', 'mpv', 'federal', 'medida.provisoria', 'Medida Provisória', 'Medida Provisória'],
  'MPV-cs': ['medidas-provisorias', 'mpv', 'federal', 'medida.provisoria', 'Medida Provisória', 'Medida Provisória'],
  'MPV-n': ['medidas-provisorias', 'mpv', 'federal', 'medida.provisoria', 'Medida Provisória', 'Medida Provisória'],
  'CON-v': ['constituicoes', 'cf', 'federal', 'constituicao', 'Constituição', 'Constituição'],
  'CON-nv': ['constituicoes', 'con', 'federal', 'constituicao', 'Constituição anterior', 'Constituição']
};

/** Valores aceitos no parâmetro `tipo` da lista do Senado, no escopo atual do catálogo (leis e decretos federais). */
const FAMILIAS_CATALOGO = ['LEI', 'LCP', 'LDL', 'LCT', 'DEL', 'EMC', 'EMR', 'MPV', 'CON', 'DEC'];
/** Famílias pequenas o bastante para a atualização diária por ano. */
const FAMILIAS_RECENTES = ['LEI', 'LCP', 'EMC', 'DEC'];
/**
 * Decretos são muitos (cerca de mil por ano): o catálogo embutido guarda os numerados desde este ano (a CF vigente).
 * Os anteriores são buscados na fonte quando a pesquisa informa número e ano (ver servico.buscarComRede).
 */
const ANO_INICIAL_DECRETOS = 1988;

function dataIso(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function numeroOficial(d) {
  let numero = String(d.numero || '');
  if (d.complemento) numero += '-' + String(d.complemento).toUpperCase();
  if (d.reedicao) numero += '-' + String(d.reedicao);
  return numero;
}

/** Monta URN, slug e metadados de catálogo de um documento da lista do Senado; `null` se não houver como identificá-lo. */
function identificar(d) {
  const tipo = d && TIPOS[d.tipo];
  const data = dataIso(d && d.dataassinatura);
  if (!tipo || !data) return null;
  const [pasta, prefixo, autoridade, tipoUrn, nome, curto] = tipo;
  const ano = data.slice(0, 4);
  let urn, slug, numero;
  if (d.tipo.startsWith('CON-')) {
    numero = ano;
    urn = `urn:lex:br:${autoridade}:${tipoUrn}:${data};${ano}`;
    slug = d.tipo === 'CON-v' ? 'cf-1988' : `${prefixo}-${ano}`;
  } else if (d.tipo.endsWith('-sn')) {
    const seq = String(d.sequencia || '0');
    numero = '';
    urn = `urn:lex:br:${autoridade}:${tipoUrn}:${data};seq-sf-${seq}`;
    slug = `${prefixo}-${data}-s${seq}`;
  } else {
    numero = numeroOficial(d);
    if (!numero) return null;
    urn = `urn:lex:br:${autoridade}:${tipoUrn}:${data};${numero.toLowerCase()}`;
    slug = `${prefixo}-${numero.toLowerCase()}-${data}`;
  }
  slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return { urn, slug, pasta, ano, data, numero, nome, curto, tipo: d.tipo };
}

/** Apelidos do Senado ("LEI-10406-2002-01-10 , Código Civil (2002) (CC)") sem o código técnico. */
function apelidos(d) {
  const bruto = String(d.apelido || '');
  return bruto.split(' , ').map(s => s.trim()).filter(s => s && s !== d.norma && !/^[A-Z]{2,4}(?:-[a-z]{1,3})?-[\d-]+(?:-s\d+)?$/.test(s));
}

/** Formata o número com separador de milhar ("10406" → "10.406"; "2229-43" → "2.229-43"). */
function numeroFormatado(numero) {
  const m = /^(\d+)(.*)$/.exec(String(numero || ''));
  return m ? m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + m[2] : String(numero || '');
}

module.exports = { TIPOS, FAMILIAS_CATALOGO, FAMILIAS_RECENTES, ANO_INICIAL_DECRETOS, dataIso, numeroOficial, identificar, apelidos, numeroFormatado };
