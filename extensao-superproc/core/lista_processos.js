// Fonte da navegação rápida pela lista de processos.
export const normalizeListText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const LIST_KEY = 'eproc_lista_processos_capturados';
export const LIST_NAME_KEY = 'eproc_nome_localizador_capturado';
export function listName(doc) {
    const search = doc.querySelector('#container_criterios_pesquisa li p')?.textContent.trim();
    if (search) return search;
    const bootstrap = doc.querySelector('button[data-id="selLocalizador"]');
    const title = bootstrap?.getAttribute('title');
    if (title && title !== 'Nada selecionado') return title.trim();
    const select = doc.querySelector('#selLocalizador, select[name="selLocalizador"]');
    return [...(select?.selectedOptions || [])].map(o => o.textContent.trim()).filter(Boolean).join(', ') || 'Lista de Processos';
}
export function locatorCell(row) {
    const table = row.closest('table');
    const header = [...(table?.querySelectorAll('thead tr') || [])].at(-1)
        || [...(table?.rows || [])].find(r => r.querySelector('th'));
    const headers = [...(header?.cells || [])];
    const index = headers.findIndex(c => /^(localizadores|localizador)(?:\s*[↕↑↓▴▾▲▼⇅]+)?$/.test(normalizeListText(c.textContent)));
    return row.querySelector('[data-label="Localizadores"], [data-title="Localizadores"]') || (index >= 0 ? row.cells[index] : null);
}
const stripCheck = text => normalizeListText(text).replace(/\s*[✅✔☑✓]\ufe0f?\s*$/, '').trim();
export function isDoneRow(row, doneName) {
    const cell = locatorCell(row);
    if (!cell) return false;
    // Busca o localizador, não a palavra "feito" em nomes das partes/eventos.
    const nodes = [...cell.querySelectorAll('span, a, button, .badge, [data-localizador]')];
    // Localizador personalizado do botão Feito (opcional): compara o nome completo e a parte antes de " - ".
    const custom = doneName ? new Set([stripCheck(doneName), stripCheck(String(doneName).split(' - ')[0])].filter(Boolean)) : null;
    return [...nodes, cell].some(el => /^feito(?:\s*[✅✔☑✓]\ufe0f?)?$/.test(normalizeListText(el.textContent)) || (custom && custom.has(stripCheck(el.textContent))));
}
export function captureProcessList(doc = document, base = doc.baseURI, doneName) {
    const items = new Map();
    for (const anchor of doc.querySelectorAll('table a[href*="acao=processo_selecionar"]')) {
        const match = anchor.textContent.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
        if (!match) continue;
        let url;
        try { url = new URL(anchor.getAttribute('href'), base); } catch { continue; }
        if (url.origin !== new URL(base).origin || url.searchParams.get('acao') !== 'processo_selecionar') continue;
        const numero = match[0], id = numero.replace(/\D/g, '');
        const urlNum = (url.searchParams.get('num_processo') || url.searchParams.get('txtNumProcesso') || '').replace(/\D/g, '');
        if (urlNum && urlNum !== id) continue;
        const row = anchor.closest('tr');
        const feitoKnown = !!row && !!locatorCell(row);
        const feito = feitoKnown && isDoneRow(row, doneName);
        const cell = row && locatorCell(row);
        const localizadores = cell ? [...cell.querySelectorAll('span, a, button, .badge, [data-localizador]'), cell]
            .map(el => normalizeListText(el.textContent).replace(/\s*[✅✔☑✓]\ufe0f?\s*$/, '').trim()).filter(Boolean) : [];
        const existing = items.get(id);
        if (existing) { existing.localizadores = [...new Set([...existing.localizadores, ...localizadores])]; existing.feito ||= feito; existing.feitoKnown ||= feitoKnown; continue; }
        items.set(id, { id, numero, url: url.href, feito, feitoKnown, localizadores });
    }
    return [...items.values()];
}
export function publishNavigation(items, name, storage = sessionStorage) {
    storage.setItem(LIST_KEY, JSON.stringify(items.map(({ numero, url, feito }) => ({ numero, url, feito }))));
    storage.setItem(LIST_NAME_KEY, name);
}
