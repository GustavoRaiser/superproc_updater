'use strict';
/**
 * Limpeza do texto das normas para leitura e cópia.
 *
 * O texto compilado traz, no fim de artigos, parágrafos e incisos, anotações do órgão que o compila:
 * "(Redação dada pela Lei nº ...)", "(Incluído pela ...)", "(Parágrafo acrescido pela ...)", "(Vide Lei ...)",
 * "(Regulamento)", "(Vigência)"... Elas dizem qual lei criou ou alterou cada dispositivo e remetem a outras leis:
 * úteis para pesquisa, mas poluem o que se copia para uma minuta. Aqui elas saem; o texto e a posição dos
 * dispositivos ficam como estão. Dispositivo revogado ou vetado continua marcado ("(Revogado)", "(VETADO)"),
 * só sem dizer por qual lei.
 *
 * Duas regras, ambas só para texto entre parênteses:
 *  1) começa por uma expressão típica de anotação ("Redação dada", "Incluído", "Vide", "Parágrafo acrescido"...);
 *  2) vem em itálico (a marca das anotações nesta fonte) e cita lei, decreto, DOU, STF ou "redação/acrescido/revogado".
 * Parênteses do próprio texto da lei, como "(doze)" ou "(Código Civil anterior)", não se enquadram e ficam.
 *
 * É idempotente: aplicada de novo sobre texto já limpo, não muda nada. Por isso também vale na leitura,
 * para as cópias que já estavam baixadas antes desta limpeza existir.
 */

// Regra 1a: a anotação começa por uma destas expressões.
const INICIO = new RegExp('^(?:' + [
  'Redação dada', 'Redação anterior', 'Reda[cç]ão original', 'Incluíd[oa]s?', 'Acrescid[oa]s?', 'Renumerad[oa]s?',
  'Alterad[oa]s?\\s+pel', 'Vide\\b', 'Veja\\b', 'Regulament[oa]s?\\b', 'Vigência', 'Produção de efeitos?',
  'Declarad[oa]s?\\s+inconstitucional', 'Revigorad[oa]s?', 'Suspens[oa]s?\\s+(?:pel|por|a execução)',
  'Promulgação', 'Texto compilado', 'Mensagem de veto', 'Convertid[oa]s?\\s+(?:na|no|em)\\b',
  'Prorrogad[oa]s?\\s+pel', 'Eficácia\\b', 'Atualizad[oa]s?\\s+(?:em|pel)', 'Publicad[oa]s?\\s+(?:no|em)'
].join('|') + ')', 'iu');

// Regra 1b: "<parte da lei> <foi acrescida/alterada/...>", como "Parágrafo acrescido pela...", "Artigo com redação dada...".
const ELEMENTOS = 'Artigos?|Par[aá]grafos?(?:\\s+único)?|Incisos?|Al[ií]neas?|Itens?|Pena|Penalidade|Multa|Se[cç][aã]o|Cap[ií]tulo|T[ií]tulo|Livro|Subse[cç][aã]o|Parte|Nome jurídico|Definição|Denominação|Infração|Natureza|Medida administrativa|Graduação|Ementa|Anexo|Primitivo|Expressões?|Canceladas?|Dispositivos?|Suprimid[oa]s?|Retificad[oa]s?|Restabelecid[oa]s?';
const VERBOS = 'acrescid|com\\s+(?:nova\\s+)?reda[cç][aã]o|transformad|renumerad|vetad|retificad|suprimid|revogad|restabelecid|declarad|inclu[ií]d|alterad|substitu[ií]d|mantid';
const FAMILIA = new RegExp(`^(?:${ELEMENTOS})\\b[^\\n]{0,90}?(?:${VERBOS})`, 'iu');

// Regra 2: parêntese em itálico que cita legislação.
const REFERENCIA = /\b(?:leis?|decretos?|emendas?|medida provisória|resolução|DOU|ADI|ADPF|ADC|Supremo|Congresso|Presidente da República|Constituição)\b|reda[cç][aã]o|acrescid|revogad|suprimid|vetad|retificad|renumerad|transformad|declarad|restabelecid|substitu[ií]d|em vigor/iu;

const REVOGADO = /^(Revogad[oa]s?)\s+(?:pel[oa]s?|por|em)\b/iu;
const VETADO = /^(VETAD[OA]S?)\s+(?:na|no|nos|nas|pel[oa]s?)\b/iu;

// Parêntese completo (no máximo um nível de parênteses dentro) com as marcas de itálico em volta, se houver.
const PARENTESE = /(\s*)(\*?)\((\*?)((?:[^()]|\([^()]*\))*)\)(\*?)/gu;

function decidir(m, espaco, abre, abreInterno, conteudo, fecha) {
  const italico = !!(abre || abreInterno || fecha);
  const texto = conteudo.replace(/^\*+|\*+$/g, '').replace(/\s+/g, ' ').trim();
  if (!texto) return m;
  if (/^(?:Revogad|Vetad)[oa]s?\.?$/iu.test(texto)) return m; // a marca simples fica (é o que sobra da limpeza)
  // Revogado/vetado: fica a marca, sai a referência à lei.
  const marca = REVOGADO.exec(texto) || VETADO.exec(texto);
  if (marca) return `${espaco}${italico ? '*' : ''}(${marca[1]})${italico ? '*' : ''}`;
  if (INICIO.test(texto) || FAMILIA.test(texto)) return '';
  if (italico && REFERENCIA.test(texto)) return '';
  return m;
}

function limparLinha(linha) {
  return linha.includes('(') ? linha.replace(PARENTESE, decidir) : linha;
}

/** Remove as anotações de legislação do corpo em Markdown. Não mexe em linhas que não as têm. */
function limparAnotacoes(md) {
  if (typeof md !== 'string' || !md.includes('(')) return md;
  let mudou = false;
  const saida = [];
  for (const linha of md.split('\n')) {
    const nova = limparLinha(linha);
    if (nova === linha) { saida.push(linha); continue; }
    mudou = true;
    const aparada = nova.replace(/\s+$/, '');
    if (!aparada.replace(/[*_\s]/g, '')) continue; // a linha só tinha a anotação
    saida.push(aparada);
  }
  if (!mudou) return md;
  return saida.join('\n').replace(/\n{3,}/g, '\n\n');
}

module.exports = { limparAnotacoes };
