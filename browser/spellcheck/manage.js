'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const api = window.spellAPI;
  if (!api) return;
  const statusEl = document.getElementById('status');
  const state = { dicionario: [], ignoradas: [], expressoes: [] };
  let statusTimer = null;

  function say(text) {
    statusEl.textContent = text || '';
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 4000);
  }

  function render(section) {
    const kind = section.dataset.kind;
    const filter = section.querySelector('.filter').value.trim().toLowerCase();
    const list = section.querySelector('.words');
    const words = state[kind];
    const shown = filter ? words.filter(word => word.toLowerCase().includes(filter)) : words;
    list.textContent = '';
    section.querySelector('.count').textContent = '(' + words.length + ')';
    if (!shown.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = words.length ? (kind === 'expressoes' ? 'Nenhuma expressão encontrada.' : 'Nenhuma palavra encontrada.') : 'Lista vazia.';
      list.appendChild(empty);
      return;
    }
    for (const word of shown) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = word;
      const remove = document.createElement('button');
      remove.textContent = '✕';
      remove.title = 'Remover "' + word + '"';
      label.title = word;
      remove.addEventListener('click', async () => { if (await apply(api.removeWord(kind, word))) say('Removida: ' + word); });
      item.append(label, remove);
      list.appendChild(item);
    }
  }

  const renderAll = () => document.querySelectorAll('section[data-kind]').forEach(render);

  async function apply(promise) {
    try {
      const result = await promise;
      if (result && result.dicionario) { state.dicionario = result.dicionario; state.ignoradas = result.ignoradas; state.expressoes = result.expressoes || []; }
      renderAll();
      return result;
    } catch (error) {
      say('Não foi possível concluir a operação.');
      return null;
    }
  }

  for (const section of document.querySelectorAll('section[data-kind]')) {
    const kind = section.dataset.kind;
    const input = section.querySelector('.add input');
    const submit = async () => {
      const value = input.value.trim();
      if (!value) return;
      const result = await apply(api.addWord(kind, value));
      if (!result) return;
      if (result.ok) { input.value = ''; say((kind === 'expressoes' ? 'Expressão adicionada: ' : 'Adicionada: ') + value); }
      else say(kind === 'expressoes'
        ? 'Expressão inválida (duas ou mais palavras, até 300 caracteres). Palavra única vai em "Ignoradas".'
        : 'Palavra inválida (sem espaços, até 100 caracteres).');
    };
    section.querySelector('.btn-add').addEventListener('click', submit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    section.querySelector('.filter').addEventListener('input', () => render(section));
    section.querySelector('.btn-import').addEventListener('click', async () => {
      const result = await apply(api.importList(kind));
      if (!result || result.cancelado) return;
      say(result.importadas + (kind === 'expressoes' ? ' expressão(ões) importada(s)' : ' palavra(s) importada(s)') + (result.rejeitadas ? '; ' + result.rejeitadas + ' linha(s) ignorada(s).' : '.'));
    });
    section.querySelector('.btn-export').addEventListener('click', async () => {
      try {
        const result = await api.exportList(kind);
        if (result && result.exportado) say('Lista exportada.');
      } catch { say('Não foi possível exportar.'); }
    });
  }

  document.getElementById('btn-close').addEventListener('click', () => api.close());
  window.addEventListener('keydown', event => { if (event.key === 'Escape') api.close(); });
  apply(api.getLists());
});
