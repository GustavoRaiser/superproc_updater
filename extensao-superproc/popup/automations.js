import { AUTOMATIONS_KEY, AUTOMATION_CATALOG_KEY, loadAutomations, defaultAutomation, validateAutomation } from '../core/automations.js';
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderAutomationManager(container) {
    const items = await loadAutomations();
    if (!container.isConnected) return;
    container.innerHTML = '<div class="auto-manager-head"><strong>Minhas automações</strong><button type="button" data-add>Adicionar automação</button></div>';
    const list = document.createElement('div'); container.append(list);
    const save = () => chrome.storage.local.set({ [AUTOMATIONS_KEY]: items });
    function render() {
        list.innerHTML = items.map(config => `<div class="auto-card" data-id="${esc(config.id)}"><strong>${esc(config.name)}</strong><p>Fila: ${esc(config.queueLocator.name)} · Agente: ${esc(config.agent)}</p><div><button type="button" data-edit>Editar</button><button type="button" data-toggle>${config.enabled ? 'Desativar' : 'Ativar'}</button><button type="button" data-delete>Excluir</button></div></div>`).join('') || '<p>Nenhuma automação cadastrada.</p>';
        list.querySelectorAll('[data-id]').forEach(card => {
            const index = items.findIndex(c => c.id === card.dataset.id);
            card.querySelector('[data-edit]').onclick = () => edit(items[index]);
            card.querySelector('[data-toggle]').onclick = async () => { items[index].enabled = !items[index].enabled; await save(); render(); };
            card.querySelector('[data-delete]').onclick = async () => { items.splice(index,1); await save(); render(); };
        });
    }
    async function edit(original) {
        document.querySelector('#automation-editor')?.remove();
        const catalogs = Object.entries((await chrome.storage.local.get(AUTOMATION_CATALOG_KEY))[AUTOMATION_CATALOG_KEY] || {}).sort((a,b)=>b[1].at-a[1].at);
        const config = structuredClone(original || { ...defaultAutomation(), id: crypto.randomUUID(), name: 'Nova automação' });
        const dialog = document.createElement('dialog'); dialog.id = 'automation-editor';
        dialog.innerHTML = `<form class="auto-form"><div class="auto-manager-head"><h3>${original ? 'Editar' : 'Adicionar'} automação</h3><button type="button" data-cancel>×</button></div>
            <label>Nome<input name="name" required maxlength="100" value="${esc(config.name)}"></label>
            <fieldset><legend>Preparação de Workflow</legend>
            <label>Órgão e sistema<select name="scope"></select></label>
            <p class="auto-help">Abra uma lista de processos do órgão para atualizar os localizadores do Smart Localizadores.</p>
            <label>Fila de localizador<select name="queue" required></select></label>
            <label>Localizadores excluídos<select name="excluded" multiple size="4"></select></label><p class="auto-help">Use Ctrl + clique para selecionar ou desmarcar vários localizadores.</p></fieldset>
            <fieldset><legend>Etapa 1 · Documentos</legend><label>Período do Automarcar<select name="period"><option value="all">Todo o processo</option><option value="60">5 anos</option><option value="36">3 anos</option><option value="24">2 anos</option><option value="12">1 ano</option><option value="6">6 meses</option></select></label></fieldset>
            <fieldset><legend>Etapa 2 · Copilot</legend><label>Nome do agente<input name="agent" required maxlength="150" value="${esc(config.agent)}"></label><label>Menção do agente (sem @)<input name="mention" required maxlength="100" value="${esc(config.mention)}"></label><label>Comando<textarea name="command" required maxlength="5000">${esc(config.command)}</textarea></label><p class="auto-help">Enviado como: número do processo - comando</p></fieldset>
            <fieldset><legend>Etapa 3 · Minuta</legend><label>Ação preferencial<input name="preference" required maxlength="150" value="${esc(config.preference)}" placeholder="Nome exato da ação na capa"></label><label>Localizador a inserir<select name="target" required></select></label></fieldset>
            <p data-error role="alert"></p><div class="auto-manager-head"><button type="button" data-cancel>Cancelar</button><button type="submit">Salvar automação</button></div></form>`;
        document.body.append(dialog); const form = dialog.querySelector('form');
        const field = name => form.elements.namedItem(name);
        // O exemplo original permanece editável mesmo antes da primeira captura do catálogo.
        const fallbackKey = 'example';
        const scopes = catalogs.length ? catalogs : [[fallbackKey,{origin:config.origin,unit:config.unit,unitName:'Saneador · configuração inicial',locators:[]}]];
        field('scope').innerHTML = scopes.map(([key,cat]) => `<option value="${esc(key)}">${esc(cat.unitName)} · ${esc(cat.origin)}</option>`).join('');
        const selectedScope = scopes.find(([key,cat]) => cat.origin === config.origin && cat.unit === config.unit)?.[0]
            || scopes.find(([key,cat]) => cat.locators.some(l=>l.id===config.queueLocator.id))?.[0] || scopes[0][0];
        field('scope').value = selectedScope;
        let locators;
        const short = text => String(text || '').split(' - ')[0].trim().toLowerCase();
        function populate() {
            const catalog = scopes.find(([key]) => key === field('scope').value)[1];
            locators = [...catalog.locators];
            const preserve = !catalog.locators.length || (catalog.origin===config.origin && catalog.unit===config.unit);
            // Preserva IDs no mesmo órgão. Ao trocar de órgão, usa somente o catálogo escolhido.
            if(preserve) for(const item of [config.queueLocator, ...config.excludedLocators, config.targetLocator].filter(item => item.id || item.name)) {
                if(!locators.some(l=>item.id ? l.id === item.id : short(l.name) === short(item.name))) locators.push({...item,id:item.id || 'name:'+item.name});
            }
            for(const name of ['queue','excluded','target']) field(name).innerHTML = locators.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
            const valueFor = item => (item.id && locators.find(l=>l.id===item.id) || (!item.id || !preserve) && locators.find(l=>short(l.name)===short(item.name)))?.id || '';
            field('queue').value = valueFor(config.queueLocator);
            field('target').value = valueFor(config.targetLocator);
            for(const option of field('excluded').options) option.selected = config.excludedLocators.some(l=>valueFor(l)===option.value);
        }
        populate(); field('scope').onchange = populate; field('period').value = config.periodMonths === null ? 'all' : String(config.periodMonths);
        dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{dialog.close();dialog.remove();});
        form.onsubmit = async event => {
            event.preventDefault();
            try {
                const catalog = scopes.find(([key])=>key===field('scope').value)[1];
                if(!original && !catalog.locators.length) throw new Error('Abra a lista de processos do órgão para carregar o catálogo antes de adicionar uma automação.');
                const locator = value => { const item=locators.find(l=>l.id===value); if(!item) throw new Error('Selecione um localizador.'); return item.id.startsWith('name:') ? {name:item.name} : {id:item.id,name:item.name}; };
                const updated = validateAutomation({ ...config, name:field('name').value.trim(), origin:catalog.origin, unit:catalog.unit,
                    queueLocator:locator(field('queue').value), excludedLocators:[...field('excluded').selectedOptions].map(o=>locator(o.value)),
                    periodMonths:field('period').value === 'all' ? null : Number(field('period').value), agent:field('agent').value.trim(), mention:field('mention').value.trim().replace(/^@/, ''), command:field('command').value.trim(), preference:field('preference').value.trim(), targetLocator:locator(field('target').value) });
                const index=items.findIndex(c=>c.id===updated.id); if(index<0) items.push(updated); else items[index]=updated;
                await save(); dialog.close(); dialog.remove(); render();
            } catch(error) { form.querySelector('[data-error]').textContent=error.message; }
        };
        dialog.showModal();
    }
    container.querySelector('[data-add]').onclick = () => edit(); render();
}
