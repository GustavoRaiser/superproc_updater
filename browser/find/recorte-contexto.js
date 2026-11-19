'use strict';
/**
 * SuperPROC - Recorte do contexto de cada linha do Glossário (busca da shell e busca do leitor de PDF).
 *
 * Regra única para os dois motores (find-engine.js e pdf-find-plus.js), que embutem esta função no código
 * injetado na página (por isso ela precisa ser autocontida):
 * - Quem chama entrega o texto antes e depois da ocorrência com marcadores:
 *     U+2029 (separador de parágrafo, ver BLOCO) = fronteira rígida (outro bloco/parágrafo do HTML);
 *     '\n'     = quebra de linha (linha do PDF, <br>, texto pré-formatado).
 * - Uma quebra de linha só separa frases quando o texto anterior a ela termina em . ; : ! ? (ignorando aspas,
 *   parênteses e abreviações comuns como "art." ou "nº."). Caso contrário é uma linha que continua a frase
 *   e vira espaço.
 * - Ocorrência no início da frase: o trecho anterior não traz texto da linha anterior.
 *   Ocorrência no fim da frase: o trecho posterior não traz texto da nova linha.
 */
function superprocRecortarContexto(before, match, after, limite) {
  const FIM_DE_FRASE = /[.;:!?…]["'”’»)\]]*\s*$/;
  const ABREVIACAO = /(?:^|[^\p{L}\p{N}])(?:arts?|incs?|al|n|nº|n°|fls?|p|pp|cf|ex|ed|v|vol|cap|min|rel|des|dr|dra|sr|sra|par|parág)\.\s*$/iu;
  const terminaFrase = (texto) => FIM_DE_FRASE.test(texto) && !ABREVIACAO.test(texto);
  const plano = (texto) => texto.replace(/\s+/g, ' ');
  limite = Math.max(1, Number(limite) || 90);
  const BLOCO = String.fromCharCode(0x2029);
  const MARCAS = new RegExp('(\\n|' + BLOCO + ')');

  // Antes: o que vale é o texto depois da última fronteira de frase.
  let anterior = '';
  for (const parte of String(before || '').split(MARCAS)) {
    if (parte === BLOCO) anterior = '';
    else if (parte === '\n') anterior = anterior && terminaFrase(anterior) ? '' : anterior + ' ';
    else anterior += parte;
  }

  // Depois: para na primeira fronteira de frase.
  let posterior = '';
  const textoMatch = String(match || '');
  for (const parte of String(after || '').split(MARCAS)) {
    if (parte === BLOCO) break;
    if (parte === '\n') {
      if (terminaFrase(textoMatch + posterior)) break;
      posterior += ' ';
    } else {
      posterior += parte;
    }
  }

  return {
    before: plano(anterior).replace(/^ +/, '').slice(-limite),
    match: plano(textoMatch),
    after: plano(posterior).replace(/ +$/, '').slice(0, limite)
  };
}

module.exports = { superprocRecortarContexto, RECORTE_SOURCE: superprocRecortarContexto.toString() };
