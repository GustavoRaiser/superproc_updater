export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function urlFrom(raw, base, action = '') {
    const value = String(raw || '').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const matches = value.match(/(?:https?:\/\/[^\s'"<>]+|(?:\.\.\/|\.\/)?controlador(?:_ajax)?\.php\?[^\s'"<>]+)/gi) || [];
    for (const candidate of matches) {
        try { const url = new URL(candidate, base); if (url.origin === new URL(base).origin && (!action || url.searchParams.get('acao') === action)) return url.href; } catch { /* outra forma de URL */ }
    }
    return null;
}
export function preference(doc, base, label) {
    const candidates = [...doc.querySelectorAll('a, button')].filter(el => normalize(el.textContent) === normalize(label));
    const urls = candidates.map(el => urlFrom(el.getAttribute('href') || el.getAttribute('onclick'), base, 'minuta_cadastrar')).filter(Boolean);
    const distinct = [...new Set(urls)];
    if (distinct.length !== 1) throw new Error(distinct.length ? `Mais de uma preferência "${label}" foi encontrada.` : `Preferência "${label}" não encontrada na capa do processo.`);
    return distinct[0];
}
export function responseHtml(text) {
    // O agente fornece conteúdo, nunca scripts, formulários ou handlers de evento.
    const stripped = String(text).trim().replace(/^```(?:html|markdown)?\s*\n/i, '').replace(/\n```\s*$/, '');
    if (!/<(?:p|div|h[1-6]|table|ul|ol|section)\b/i.test(stripped)) {
        return stripped.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`).join('');
    }
    const doc = new DOMParser().parseFromString(stripped, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta, svg, math').forEach(el => el.remove());
    for (const el of doc.body.querySelectorAll('*')) for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('on') || ['src', 'srcdoc', 'href', 'style', 'id', 'class'].includes(attr.name)) el.removeAttribute(attr.name);
    }
    return doc.body.innerHTML;
}
export function latinForm(fields) {
    const encode = value => Array.from(String(value)).map(c => {
        const cp = c.codePointAt(0);
        if (cp > 255) throw new Error('A preferência contém caractere não compatível com o cadastro Latin-1 do eProc.');
        return /[A-Za-z0-9_.~-]/.test(c) ? c : c === ' ' ? '+' : '%' + cp.toString(16).padStart(2, '0').toUpperCase();
    }).join('');
    return fields.map(([key, value]) => encode(key) + '=' + encode(value)).join('&');
}
export function normalizeWidget(value) {
    if (!/^\s*\[/.test(value || '')) return value;
    try { const arr = JSON.parse(value); if (Array.isArray(arr) && arr.every(x => x && typeof x === 'object' && ('value' in x || 'id' in x))) return arr.map(x => x.value ?? x.id).join(','); } catch { /* texto comum */ }
    return value;
}
export function editorFromResponse(html, base) {
    const url = urlFrom(html, base, 'minuta_editar');
    if (!url || !new URL(url).searchParams.get('id_minuta')) throw new Error('O cadastro foi enviado, mas o eProc não confirmou o editor da nova minuta. Confira a lista de minutas antes de iniciar outra tarefa.');
    return url;
}
