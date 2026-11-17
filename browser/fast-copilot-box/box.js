'use strict';
// Caixa de instruções do Fast Copilot (janela do host). Só conversa com o host por window.fcAPI (preload).
(() => {
  const $ = (id) => document.getElementById(id);
  const ops = { alteracao: $('op-alteracao'), destacar: $('op-destaque'), selecao: $('op-selecao'), pdf: $('op-pdf'), minuta: $('op-minuta'), nova: $('op-nova') };
  const instrucao = $('instrucao'), aviso = $('aviso');
  const marcado = (b) => b.getAttribute('aria-pressed') === 'true';
  const marcar = (b, v) => b.setAttribute('aria-pressed', v ? 'true' : 'false');
  const mostrar = (t) => { aviso.textContent = t || ''; aviso.hidden = !t; };

  function alternar(b) {
    if (b.disabled) return;
    marcar(b, !marcado(b));
    // Alteração de Texto trabalha sobre o texto selecionado: ligar uma liga a outra.
    if (b === ops.alteracao && marcado(b)) marcar(ops.selecao, true);
    if (b === ops.selecao && !marcado(b)) { marcar(ops.alteracao, false); marcar(ops.destacar, false); }
    if (b === ops.destacar && marcado(b)) { marcar(ops.alteracao, true); marcar(ops.selecao, true); }
    mostrar('');
  }
  Object.values(ops).forEach((b) => b.addEventListener('click', () => alternar(b)));

  function enviar() {
    const texto = instrucao.value.trim();
    if (!texto) { mostrar('Escreva a instrução para o Copilot.'); instrucao.focus(); return; }
    window.fcAPI.enviar({ instrucao: texto, alteracao: marcado(ops.alteracao), destacar: marcado(ops.destacar), selecao: marcado(ops.selecao),
      pdf: marcado(ops.pdf), minuta: marcado(ops.minuta), nova: marcado(ops.nova) });
  }
  $('enviar').addEventListener('click', enviar);
  $('cancelar').addEventListener('click', () => window.fcAPI.cancelar());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); window.fcAPI.cancelar(); return; }
    // Enter envia; Shift+Enter quebra a linha (padrão de chats). Ctrl+Enter também envia, em qualquer foco.
    if (e.key === 'Enter' && !e.isComposing) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); enviar(); return; }
      if (!e.shiftKey && !e.altKey && e.target === instrucao) { e.preventDefault(); enviar(); return; }
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const chave = String(e.key).toLowerCase();
      const alvo = Object.values(ops).find((b) => b.dataset.tecla === chave);
      if (alvo) { e.preventDefault(); alternar(alvo); }
    }
  }, true);

  window.fcAPI.obter().then((d) => {
    d = d || {};
    const podeAlterar = d.podeAlterar !== undefined ? !!d.podeAlterar : !!d.temSelecao;
    const podeDestacar = d.podeDestacar !== undefined ? !!d.podeDestacar : !!d.temSelecao;
    ops.selecao.disabled = !d.temSelecao; ops.alteracao.disabled = !podeAlterar; ops.destacar.disabled = !podeDestacar;
    const ctx = ({ editor: d.temSelecao ? 'texto selecionado no editor de minutas' : 'cursor no editor de minutas, sem texto selecionado', campo: d.temSelecao ? 'texto selecionado em um campo' : 'cursor em um campo de texto, sem seleção',
      editavel: d.temSelecao ? 'texto selecionado em área editável' : 'cursor em área editável, sem seleção', pagina: 'texto selecionado na página (somente leitura)' })[d.fonte] || 'nenhum texto selecionado';
    $('contexto').innerHTML = ''; const rot = document.createElement('b'); rot.textContent = 'Contexto: '; $('contexto').append(rot, ctx + (d.fonte === 'pagina' ? '. A resposta fica no Copilot.' : '') + (d.temSelecao && !podeAlterar && d.fonte !== 'pagina' ? '. Não é possível substituir aqui.' : ''));
    if (d.modo === 'alteracao') { // atalho de Alteração de Texto: só instrução + modos; PDF/minuta/nova conversa ficam na coluna
      document.body.classList.add('compacto'); $('instrucao').rows = 2; $('grp-junto').hidden = true; $('grp-conversa').hidden = true; $('titulo').textContent = 'Substituição de Texto';
      $('instrucao').placeholder = 'Instruções para modificação do texto. Ex.: reescreva de forma mais objetiva'; document.querySelector('.dica').textContent = 'Enter envia · Shift+Enter nova linha · Esc fecha'; document.querySelector('label.rotulo').textContent = 'Instruções para modificação do texto';
    }
    ops.pdf.disabled = !d.temPdf; ops.minuta.disabled = !d.temMinuta;
    if (d.temPdf && d.nomePdf) ops.pdf.title = d.nomePdf;
    if (d.temSelecao) marcar(ops.selecao, true);
    if (podeAlterar) marcar(ops.alteracao, true);
    if (d.icone) { const img = document.createElement('img'); img.alt = ''; img.src = d.icone; $('icone').appendChild(img); }
    instrucao.focus();
  });
})();
