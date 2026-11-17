'use strict';
// Geometria da janela principal (host). Funções puras, sem Electron.
// Fonte única das coordenadas das views: tudo é calculado a partir da origem (0,0) da área de conteúdo
// da janela, somando larguraTotal * percentual. Nada mede a partir da tela.
//   coluna do Copilot (modo integradaCopilot): ocupa copilotPct% da largura, à esquerda, em ALTURA TOTAL da janela
//   (como uma janela autônoma); a barra de título/abas do SuperPROC é recuada para começar à direita dela
//   divisória capa/árvore: a árvore/documentos ocupa arvorePct% da ÁREA DE CONTEÚDO (o que sobra após a coluna)

const FAIXA_COPILOT = Object.freeze({ min: 15, max: 50, padrao: 25 });
const FAIXA_ARVORE = Object.freeze({ min: 20, max: 80, padrao: 50 });

function normalizarPct(valor, faixa) {
  if (typeof valor === 'string' && !valor.trim()) return faixa.padrao; // campo vazio não vira 0
  const n = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) return faixa.padrao;
  return Math.min(faixa.max, Math.max(faixa.min, Math.round(n)));
}

function retangulo(x, y, width, height) {
  return { x: Math.round(x), y: Math.round(y), width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) };
}

// largura/altura: getContentSize() da janela principal; topo: altura da barra de título.
// Retorna { copilot: retângulo | null, conteudo: retângulo } em coordenadas da janela. O conteúdo das abas
// começa em x = recuo e y = topo (a barra de título ocupa x >= recuo, y < topo).
function areasDaJanela({ largura, altura, topo = 0, colunaCopilot = false, copilotPct, colunaVisivel = true } = {}) {
  const w = Math.max(0, Math.floor(Number(largura) || 0));
  const h = Math.max(0, Math.floor(Number(altura) || 0));
  const alturaUtil = Math.max(0, h - topo);
  const larguraColuna = colunaCopilot ? Math.round(w * normalizarPct(copilotPct, FAIXA_COPILOT) / 100) : 0;
  // Coluna oculta: o conteúdo ocupa 100% da largura e a coluna continua viva com o MESMO tamanho, só que fora da área
  // visível da janela (x negativo). Assim o chat segue renderizando e responde ao Fast Copilot; o usuário não a vê.
  const oculta = colunaCopilot && colunaVisivel === false;
  const recuo = oculta ? 0 : larguraColuna;
  const xColuna = oculta ? -(larguraColuna + 200) : 0;
  return {
    copilot: colunaCopilot ? retangulo(xColuna, 0, larguraColuna, h) : null,
    copilotOculta: oculta,
    conteudo: retangulo(recuo, topo, w - recuo, alturaUtil)
  };
}

// Divide a área de conteúdo em esquerda (capa/editor) e direita (árvore/documentos).
// Com 50 equivale à divisão ao meio de sempre: esquerda = floor(largura / 2).
function dividirConteudo(conteudo, arvorePct = FAIXA_ARVORE.padrao) {
  const pct = normalizarPct(arvorePct, FAIXA_ARVORE);
  const esquerda = Math.floor(conteudo.width * (100 - pct) / 100);
  return {
    esquerda: retangulo(conteudo.x, conteudo.y, esquerda, conteudo.height),
    direita: retangulo(conteudo.x + esquerda, conteudo.y, conteudo.width - esquerda, conteudo.height)
  };
}

module.exports = { FAIXA_COPILOT, FAIXA_ARVORE, normalizarPct, areasDaJanela, dividirConteudo };
