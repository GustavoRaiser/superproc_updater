export const AUTOMATIONS_KEY = 'superproc_automations_v1';
export const AUTOMATION_CATALOG_KEY = 'superproc_automation_catalogs_v1';
export const PERIODS = [null, 60, 36, 24, 12, 6];
// Automação de exemplo, em branco: cada usuário escolhe os localizadores e o agente da própria unidade.
// Vem desativada até ser configurada (a fila, o agente e o localizador final são obrigatórios para salvar).
export const defaultAutomation = () => ({
    id: 'saneador', name: 'Saneador', enabled: false, origin: '', unit: '',
    queueLocator: { id: '', name: '' },
    excludedLocators: [],
    periodMonths: null, agent: '', mention: 'saneador',
    command: 'Executar saneamento dos autos.', preference: '',
    targetLocator: { name: '' }
});
export async function loadAutomations() {
    const data = (await chrome.storage.local.get(AUTOMATIONS_KEY))[AUTOMATIONS_KEY];
    if (Array.isArray(data)) return data;
    const initial = [defaultAutomation()];
    await chrome.storage.local.set({ [AUTOMATIONS_KEY]: initial }); return initial;
}
export function validateAutomation(config) {
    if (!config || !config.id || !String(config.name || '').trim()) throw new Error('Informe o nome da automação.');
    if (!/^\d+$/.test(String(config.queueLocator?.id || ''))) throw new Error('Escolha o localizador da fila.');
    if (!PERIODS.includes(config.periodMonths)) throw new Error('Período de documentos inválido.');
    for (const field of ['agent', 'mention', 'command', 'preference']) {
        if (typeof config[field] !== 'string' || !config[field].trim() || config[field].length > (field === 'command' ? 5000 : 150)) throw new Error('Preencha agente, menção, comando e ação preferencial.');
    }
    if (!/^@?[\p{L}\p{N} _-]{1,100}$/u.test(config.mention)) throw new Error('Menção do agente inválida.');
    if (!config.targetLocator?.name?.trim()) throw new Error('Escolha o localizador a inserir.');
    if (!Array.isArray(config.excludedLocators) || config.excludedLocators.some(item => typeof item.name !== 'string' || !item.name.trim())) throw new Error('Lista de exclusões inválida.');
    return structuredClone(config);
}
export function automationMatches(config, { origin, unit, locatorIds }) {
    return config.enabled && (!config.origin || config.origin === origin) && (!config.unit || config.unit === unit)
        && locatorIds.length === 1 && locatorIds.includes(String(config.queueLocator?.id));
}
export function isAutomationExcluded(item, config) {
    const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g,' ').trim().toLowerCase();
    return config.excludedLocators.some(locator => {
        const name = norm(locator.name.split(' - ')[0]);
        if (name === 'feito' && item.feito || name === 'triagemsaneador' && item.triagemsaneador) return true;
        return (item.localizadores || []).some(label => norm(label) === name);
    });
}
export async function captureAutomationCatalog(doc = document, origin = location.origin) {
    // A mesma fonte nativa utilizada pelo Smart Localizadores.
    const select = doc.querySelector('#selNovoLocalizador');
    const unitSelect = doc.querySelector('#selInfraUnidades');
    if (!select || !unitSelect?.value) return;
    const locators = [...select.options].filter(o => o.value && o.value !== 'null').map(o => ({ id: o.value, name: o.textContent.trim() }));
    if (!locators.length) return;
    const catalogs = (await chrome.storage.local.get(AUTOMATION_CATALOG_KEY))[AUTOMATION_CATALOG_KEY] || {};
    const key = `${origin}|${unitSelect.value}`;
    if (JSON.stringify(catalogs[key]?.locators) === JSON.stringify(locators)) return;
    catalogs[key] = { origin, unit: unitSelect.value, unitName: unitSelect.selectedOptions[0]?.textContent.trim() || unitSelect.value, locators, at: Date.now() };
    await chrome.storage.local.set({ [AUTOMATION_CATALOG_KEY]: catalogs });
}
