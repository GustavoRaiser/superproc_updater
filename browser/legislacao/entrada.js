'use strict';
/**
 * Entrada humana → consulta ao catálogo. O usuário pode colar o que tiver à mão:
 * texto livre ("lei 10.406/2002", "cpc"), um endereço do Planalto/normas.leg.br ou uma URN LEX.
 */
const PREFIXOS_PLANALTO = { l: 'lei', del: 'decreto-lei', lcp: 'lei complementar', emc: 'emenda constitucional', ldl: 'lei delegada', d: 'decreto' };

const semAnexos = (urn) => urn.replace(/[@!~].*$/, '').replace(/[)\].,;]+$/, '');

function decodificar(s) { try { return decodeURIComponent(s); } catch { return s; } }

/**
 * @returns {{urn?:string, consulta?:string, origem:string}|null} `null` quando o texto não parece
 * um endereço reconhecível (aí vale como texto de busca comum).
 */
function reconhecerEntrada(entrada) {
  const t = String(entrada || '').trim();
  if (!t) return null;
  const direta = /urn:lex:br:[^\s"'<>]+/i.exec(decodificar(t));
  if (direta) return { urn: semAnexos(direta[0]), origem: /^(?:https?:\/\/)?(?:[\w-]+\.)*normas\.leg\.br\b/i.test(t) ? 'normas.leg.br' : 'urn' };
  if (/\s/.test(t) || !/[./]/.test(t)) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host === 'normas.leg.br' || host.endsWith('.normas.leg.br')) {
    const urn = u.searchParams.get('urn');
    return urn ? { urn: semAnexos(decodificar(urn)), origem: 'normas.leg.br' } : null;
  }
  if (host === 'planalto.gov.br' || host.endsWith('.planalto.gov.br')) {
    const caminho = decodificar(u.pathname).toLowerCase();
    const arquivo = caminho.split('/').filter(Boolean).pop() || '';
    const ano = (caminho.match(/\/((?:18|19|20)\d{2})(?=\/)/g) || []).map(s => s.slice(1)).pop();
    if (/constituicao/.test(caminho) && !/emenda/.test(caminho)) return { consulta: 'constituicao 1988', origem: 'planalto' };
    const m = /^(l|del|lcp|emc|ldl|d)\.?(\d[\d.]*)/.exec(arquivo.replace(/\.html?$/, ''));
    if (m) {
      return { consulta: `${PREFIXOS_PLANALTO[m[1]]} ${m[2].replace(/\./g, '')}${ano ? ' ' + ano : ''}`, origem: 'planalto' };
    }
  }
  return null;
}

module.exports = { reconhecerEntrada };
