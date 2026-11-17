'use strict';
// Interface do shell. Usa apenas textContent (nunca innerHTML): títulos e textos de abas são dados, não marcação.
(function () {
  const $ = (id) => document.getElementById(id);
  const TITULOS = { inicializando: 'Iniciando…', 'acesso-necessario': 'Acesso necessário', pronto: 'Pronto', indisponivel: 'Indisponível', falha: 'Falha' };
  const MENSAGENS = {
    inicializando: 'Preparando o Copilot.',
    'acesso-necessario': 'Entre para continuar.',
    pronto: 'Consumidor montado.',
    indisponivel: 'Não há integração suportada para hospedar o Copilot neste modo. A coluna habitual do Copilot continua disponível.',
    falha: 'Algo falhou ao preparar o Copilot.'
  };
  const ROTULOS = { entrar: 'Entrar', 'tentar-novamente': 'Tentar novamente', 'usar-habitual': 'Usar o Copilot habitual' };
  const CODIGOS_TEXTO = { SEM_INTEGRACAO_DOCUMENTADA: 'Sem integração documentada.' };
  const GRAPH_ERROS = { LOGIN_NECESSARIO: 'Entre novamente para continuar.', LOGIN_MICROSOFT_FALHOU: 'Não foi possível entrar com a Microsoft.', LICENCA_OU_PERMISSAO_NEGADA: 'A Microsoft recusou o acesso. Verifique a licença e as permissões do aplicativo com sua instituição.', CONSENTIMENTO_NEGADO: 'A leitura da aba foi negada.', TAB_CHANGED: 'A aba mudou. Selecione-a novamente.', LIMITE_GRAPH: 'O serviço está limitando pedidos. Tente novamente mais tarde.', FALHA_CONEXAO_GRAPH: 'Não foi possível conectar ao serviço Microsoft.' };

  function desenhar(e) {
    if (!e || typeof e !== 'object') return;
    $('ponto').dataset.estado = e.estado;
    $('titulo').textContent = TITULOS[e.estado] || 'Copilot';
    $('mensagem').textContent = e.graph && !e.graphConfigurado ? 'Configure o ID do aplicativo e o locatário Microsoft Entra para entrar.' : e.graph && e.estado === 'pronto' ? 'Conectado. A licença e as permissões serão verificadas pela Microsoft ao enviar.' : (MENSAGENS[e.estado] || '') + (e.motivo ? ' (' + (CODIGOS_TEXTO[e.motivo] || e.motivo) + ')' : '');
    $('aviso-sintetico').hidden = !e.sintetico;
    const caixa = $('acoes');
    caixa.replaceChildren();
    for (const a of Array.isArray(e.acoes) ? e.acoes : []) {
      if (!ROTULOS[a]) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = ROTULOS[a];
      b.addEventListener('click', async () => { b.disabled = true; try { await window.superprocShell.acao(a); } finally { b.disabled = false; } });
      caixa.appendChild(b);
    }
    $('demo').hidden = e.estado !== 'pronto' || !!e.graph;
    $('graph').hidden = e.estado !== 'pronto' || !e.graph;
    if (e.estado !== 'pronto') { $('abas').replaceChildren(); $('resultado').textContent = ''; }
  }

  const mostrar = (r) => { $('resultado').textContent = r && r.ok ? '' : 'Erro: ' + (r && r.erro ? r.erro.codigo : 'DESCONHECIDO'); };

  $('listar').addEventListener('click', async () => {
    const r = await window.superprocShell.consumidor({ tipo: 'listar' });
    mostrar(r);
    const ul = $('abas'); ul.replaceChildren();
    if (!r || !r.ok) return;
    for (const aba of r.abas) {
      const li = document.createElement('li');
      const nome = document.createElement('span'); nome.textContent = (aba.titulo || aba.origem || aba.id);
      li.appendChild(nome);
      if (aba.legivel) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Ler esta aba';
        b.addEventListener('click', async () => {
          const l = await window.superprocShell.consumidor({ tipo: 'ler', tabId: aba.id });
          $('resultado').textContent = l && l.ok ? l.texto + (l.truncado ? '\n[truncado]' : '') : 'Erro: ' + (l && l.erro ? l.erro.codigo : 'DESCONHECIDO');
        });
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
  });

  $('graph-listar').addEventListener('click', async () => {
    const r = await window.superprocShell.consumidor({ tipo: 'listar' });
    $('graph-estado').textContent = r?.ok ? '' : 'Não foi possível listar as abas: ' + (r?.erro?.codigo || 'ERRO');
    const sel = $('graph-aba'); sel.replaceChildren(new Option('Sem contexto de aba', ''));
    if (r?.ok) for (const aba of r.abas) if (aba.legivel) sel.appendChild(new Option(aba.titulo || aba.origem || 'Aba', aba.id));
  });
  $('graph-reconectar').addEventListener('click', async () => {
    const btn = $('graph-reconectar'); btn.disabled = true; $('graph-estado').textContent = 'Conclua a entrada no navegador.';
    try { const r = await window.superprocShell.consumidor({ tipo: 'reconectar' }); $('graph-estado').textContent = r?.ok ? 'Entrada concluída. Uma nova conversa será iniciada.' : 'Falha ao entrar: ' + (r?.erro?.codigo || 'ERRO'); }
    finally { btn.disabled = false; }
  });
  $('graph-enviar').addEventListener('click', async () => {
    const btn = $('graph-enviar'); btn.disabled = true; $('graph-estado').textContent = 'Enviando…';
    const pergunta = $('graph-pergunta').value;
    try {
      const r = await window.superprocShell.consumidor({ tipo: 'enviar', texto: pergunta, tabId: $('graph-aba').value || undefined });
      if (!r?.ok) { const codigo = r?.erro?.codigo || 'ERRO'; $('graph-estado').textContent = GRAPH_ERROS[codigo] || ('Não foi possível enviar: ' + codigo); return; }
      $('graph-estado').textContent = ''; $('graph-resposta').textContent += ($('graph-resposta').textContent ? '\n\n' : '') + 'Você: ' + pergunta + '\n\nCopilot: ' + r.texto; if ($('graph-pergunta').value === pergunta) $('graph-pergunta').value = '';
      const metadados = { fontes: r.attributions, classificacao: r.sensitivityLabel };
      $('graph-fontes').hidden = !r.attributions?.length && !r.sensitivityLabel;
      $('graph-metadados').textContent = JSON.stringify(metadados, null, 2);
    } finally { btn.disabled = false; }
  });

  window.superprocShell.aoMudar(desenhar);
  window.superprocShell.estado().then(desenhar).catch(() => {});
})();
