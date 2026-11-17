'use strict';
// Fast Copilot no Editor (host): montagem do prompt e conversão da resposta. Funções puras, sem Electron.
// Convenção de tags reaproveitada do botão "IA" da extensão: <b> <i> <u> <p> <citação> <dispositivo>.
// Destaques de correção: <alt>…</alt> (exibidos como marca-texto temporário pelo host).

const LIMITE_PROMPT = 100000;
const CLASSE_DESTAQUE = 'sp-fc-alt';
const ESTILO_DESTAQUE = 'background-color:#fff59d';

const PREAMBULO_ALTERACAO = 'Abaixo encontram-se instruções do usuário para alteração de texto. Execute o solicitado. '
  + 'Sua resposta deve conter exclusivamente o texto substituidor, sem comentários, títulos ou explicações, pois será imediatamente colada no lugar do texto original. '
  + 'Interprete as marcações do texto: <b> é negrito, <i> é itálico, <u> é sublinhado e <p> é parágrafo. Reproduza-as na resposta, usando as mesmas tags nos trechos equivalentes, '
  + 'para que o resultado também contenha os negritos, itálicos, sublinhados e a divisão em parágrafos (cada <p>…</p> é um parágrafo; não una parágrafos em texto corrido). '
  + 'Todo o conteúdo dentro de <citação>…</citação> deve constar integralmente e sem alteração na nova versão, mantendo as marcações <citação> e <dispositivo> quando existirem.';
// Campo de texto comum (fora do editor de minutas): resposta em texto puro, sem marcações.
const PREAMBULO_TEXTO = 'Abaixo encontram-se instruções do usuário para alteração de texto. Execute o solicitado. '
  + 'Sua resposta deve conter exclusivamente o texto substituidor, sem comentários, títulos, explicações ou marcações, pois será imediatamente colada no lugar do texto original.';
const PREAMBULO_DESTAQUE = 'Envolva cada trecho alterado entre <alt> e </alt>. Não marque o que não foi alterado.';
const PREAMBULO_ANEXOS = 'Os anexos e a minuta enviados servem apenas como referência; o texto a substituir é somente o da seção [Texto].';

function limpo(valor) { return String(valor == null ? '' : valor).replace(/\r\n?/g, '\n').trim(); }
// Rótulo oculto que o chat antepõe à resposta ("Copilot said:" / "O Copilot disse:").
const semRotulo = (t) => limpo(t).replace(/^(?:o\s+)?copilot\s+(?:said|disse)\s*:\s*/i, '');

// pedido: { instrucao, alteracao, destacar, selecao, minuta, anexos: [nomes] }
function montarPrompt(pedido = {}) {
  const instrucao = limpo(pedido.instrucao);
  const selecao = limpo(pedido.selecao);
  const minuta = limpo(pedido.minuta);
  const anexos = Array.isArray(pedido.anexos) ? pedido.anexos.map(limpo).filter(Boolean) : [];
  const alteracao = !!pedido.alteracao;
  if (!instrucao) throw new Error('Escreva a instrução para o Copilot.');
  if (alteracao && !selecao) throw new Error('Texto não selecionado.');
  const partes = [];
  if (alteracao) {
    const texto = pedido.formato === 'texto';
    const cabeca = [texto ? PREAMBULO_TEXTO : PREAMBULO_ALTERACAO];
    if (pedido.destacar && !texto) cabeca.push(PREAMBULO_DESTAQUE);
    if (minuta || anexos.length) cabeca.push(PREAMBULO_ANEXOS);
    partes.push('<' + cabeca.join(' ') + '>');
  }
  // Prompt 100% do usuário: sem cabeçalhos. Só aparecem quando há conteúdo colado junto (texto/minuta) ou Alteração de Texto.
  // Nomes de anexos nunca entram no texto (o arquivo vai como anexo de verdade).
  if (alteracao || selecao || minuta) {
    partes.push('[instruções do usuário]', instrucao);
    if (selecao) partes.push('[texto]', selecao);
    if (minuta) partes.push('[minuta]', minuta);
  } else partes.push(instrucao);
  const prompt = partes.join('\n');
  if (prompt.length > LIMITE_PROMPT) throw new Error('O pedido excede 100.000 caracteres. Selecione um trecho menor ou desmarque a minuta.');
  return prompt;
}

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Resposta do Copilot (texto com a convenção de tags) -> HTML para o CKEditor. Tudo que não é tag conhecida é escapado.
function respostaParaHtml(texto) {
  return escapar(semRotulo(texto))
    .replace(/&lt;(\/?)(b|i|u|p)&gt;/gi, '<$1$2>')
    .replace(/&lt;citação&gt;/gi, '<span class="citacao">').replace(/&lt;\/citação&gt;/gi, '</span>')
    .replace(/&lt;dispositivo&gt;/gi, '<span class="dispositivo">').replace(/&lt;\/dispositivo&gt;/gi, '</span>')
    .replace(/&lt;alt&gt;/gi, `<span class="${CLASSE_DESTAQUE}" style="${ESTILO_DESTAQUE}">`).replace(/&lt;\/alt&gt;/gi, '</span>')
    .replace(/\n*(<\/?p>)\n*/gi, '$1')   // quebras entre parágrafos não viram <br> extra
    .replace(/\n/g, '<br>');
}

// Resposta -> texto puro (para campos comuns): remove as marcações da convenção e preserva as quebras.
function respostaParaTexto(texto) {
  return semRotulo(texto).replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<\/?(b|i|u|p|alt|citação|dispositivo)>/gi, '').trim();
}

const temDestaques = (texto) => /<alt>/i.test(String(texto || ''));

module.exports = { montarPrompt, respostaParaHtml, respostaParaTexto, temDestaques, LIMITE_PROMPT, CLASSE_DESTAQUE, ESTILO_DESTAQUE, PREAMBULO_ALTERACAO };
