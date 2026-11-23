// Catálogo dos localizadores de cada unidade, capturado da lista nativa do Smart Localizadores.
// Alimenta o botão Feito do popup. A chave de armazenamento mantém o nome histórico para preservar os dados já gravados.
export const CATALOGO_LOCALIZADORES_KEY = 'superproc_automation_catalogs_v1';
export async function capturarCatalogoLocalizadores(doc = document, origin = location.origin) {
    const select = doc.querySelector('#selNovoLocalizador');
    const unitSelect = doc.querySelector('#selInfraUnidades');
    if (!select || !unitSelect?.value) return;
    const locators = [...select.options].filter(o => o.value && o.value !== 'null').map(o => ({ id: o.value, name: o.textContent.trim() }));
    if (!locators.length) return;
    const catalogs = (await chrome.storage.local.get(CATALOGO_LOCALIZADORES_KEY))[CATALOGO_LOCALIZADORES_KEY] || {};
    const key = `${origin}|${unitSelect.value}`;
    if (JSON.stringify(catalogs[key]?.locators) === JSON.stringify(locators)) return;
    catalogs[key] = { origin, unit: unitSelect.value, unitName: unitSelect.selectedOptions[0]?.textContent.trim() || unitSelect.value, locators, at: Date.now() };
    await chrome.storage.local.set({ [CATALOGO_LOCALIZADORES_KEY]: catalogs });
}
