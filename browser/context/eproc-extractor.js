'use strict';
// Extrator específico do eproc (somente leitura, mundo isolado). Cada adaptador devolve null quando não reconhece o elemento
// com segurança; nunca infere dado processual ausente. Seletores vêm dos já usados pelo projeto (#tblEventos, tr[id^="trEvento"],
// td.infraEventoDescricao). Ainda NÃO validados contra páginas reais do eproc: só contra páginas sintéticas.

function extrairEproc(o) {
  const limpar = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const params = new URLSearchParams(location.search);

  const adaptarNumeroProcesso = () => {
    const d = limpar(params.get('num_processo')).replace(/\D/g, '');
    if (d.length === 20) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16)}`;
    const m = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.exec(document.title || '');
    return m ? m[0] : null;
  };

  const adaptarPaginaAtual = () => limpar(params.get('acao')).slice(0, 100) || null;

  const adaptarEventos = () => {
    const tabela = document.getElementById('tblEventos');
    if (!tabela) return { eventos: null, truncado: false };
    const eventos = [];
    let truncado = false;
    for (const tr of tabela.querySelectorAll('tr[id^="trEvento"]')) {
      if (eventos.length >= o.maxEventos) { truncado = true; break; }
      const m = /^trEvento(\d+)$/.exec(tr.id);
      if (!m) continue;
      const data = /\b\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/.exec(limpar(tr.innerText));
      const desc = tr.querySelector('td.infraEventoDescricao');
      const documentos = [];
      for (const a of tr.querySelectorAll('a[href]')) {
        if (documentos.length >= 20) break;
        if (!/doc/i.test(a.href)) continue;
        let destino;
        try { const u = new URL(a.href); if (u.protocol !== 'https:' && u.protocol !== 'http:') continue; destino = u.origin + u.pathname; } catch (_) { continue; }
        documentos.push({ texto: limpar(a.innerText || a.getAttribute('aria-label') || '').slice(0, 200), destino });
      }
      eventos.push({
        numero: Number(m[1]),
        data: data ? data[0] : null,
        descricao: desc ? limpar(desc.innerText).slice(0, o.maxNo) : null,
        documentos
      });
    }
    return { eventos, truncado };
  };

  const adaptarDocumentoAberto = () => {
    const acao = limpar(params.get('acao'));
    if (!/documento/i.test(acao)) return null;
    const ev = limpar(params.get('evento'));
    return { acao: acao.slice(0, 100), evento: /^\d{1,6}$/.test(ev) ? Number(ev) : null };
  };

  const { eventos, truncado } = adaptarEventos();
  return {
    sistema: 'eproc',
    numeroProcesso: adaptarNumeroProcesso(),
    paginaAtual: adaptarPaginaAtual(),
    eventos,
    documentoAberto: adaptarDocumentoAberto(),
    truncado
  };
}

const codigoEproc = (opcoes) => `(${extrairEproc.toString()})(${JSON.stringify(opcoes)})`;

module.exports = { extrairEproc, codigoEproc };
