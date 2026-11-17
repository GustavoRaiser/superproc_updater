'use strict';
// Primeiro autor e primeiro réu da capa do processo (eproc), para identificar o item do histórico.
// Mesma lógica de leitura de modules/capa/partes.js: cabeçalho com 2+ <th> = tabela DUAL
// (coluna 0 autor, demais réu); 1 <th> = papel único (terceiro) e é ignorado aqui.
// Sem dependência de Electron: o script é uma string para executeJavaScript e é testável em Chromium.

const PARTES_SCRIPT = `(function () {
  try {
    var fld = document.getElementById('fldPartes');
    if (!fld) return null;
    var autor = '', reu = '';
    var nodos = fld.querySelectorAll('.infraNomeParte');
    for (var i = 0; i < nodos.length && !(autor && reu); i++) {
      var td = nodos[i].closest('td'); if (!td) continue;
      var tr = td.closest('tr'); if (!tr) continue;
      var dual = true, prev = tr.previousElementSibling;
      while (prev) {
        var ths = prev.querySelectorAll('th');
        if (ths.length > 0) {
          var t = ths[0].textContent.trim();
          if (t !== '' && t !== 'Partes e Representantes') { dual = ths.length >= 2; break; }
        }
        prev = prev.previousElementSibling;
      }
      if (!dual) continue;
      var nome = (nodos[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (!nome) continue;
      if (td.cellIndex === 0) { if (!autor) autor = nome; } else if (!reu) reu = nome;
    }
    return (autor || reu) ? { autor: autor, reu: reu } : null;
  } catch (e) { return null; }
})()`;

const limpar = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

function normalizarPartes(p) {
  if (!p || typeof p !== 'object') return null;
  const autor = limpar(p.autor), reu = limpar(p.reu);
  return autor || reu ? { autor, reu } : null;
}
// "AUTOR x RÉU"; com um lado só, mostra apenas ele.
function textoPartes(p) {
  const n = normalizarPartes(p);
  return n ? [n.autor, n.reu].filter(Boolean).join(' x ') : '';
}
module.exports = { PARTES_SCRIPT, normalizarPartes, textoPartes };
