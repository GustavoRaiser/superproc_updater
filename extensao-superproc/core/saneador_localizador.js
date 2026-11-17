// Mesmo endpoint e payload da inserção rápida de Feito.
export async function inserirLocalizadorSaneador({ signal, check = () => {}, target = { name: 'triagemsaneador' } } = {}) {
    const name = String(target.name || '').split(' - ')[0].trim();
    if (!name) throw new Error('Localizador final não configurado.');
    const normalize = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const read = doc => {
        const input = doc.querySelector('#hdnSelLocalizadoresProcesso');
        if (!input) throw new Error('Não foi possível ler os localizadores atuais; nenhuma alteração foi enviada.');
        const value = input.value.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":').replace(/:\s*'([^']*)'/g, (_, v) => ': ' + JSON.stringify(v));
        const items = JSON.parse(value);
        if (!Array.isArray(items) || items.some(item => !item.id)) throw new Error('Lista de localizadores inválida.');
        return items;
    };
    check();
    const html = document.documentElement.innerHTML.replace(/&amp;/g, '&');
    const montar = [...html.matchAll(/controlador_ajax\.php\?acao_ajax=montar_localizadores&idProcesso=([^&"'<>]+)&idOrgao=([^&"'<>]+)&hash=([^&"'<>]+)/gi)].pop();
    const alterar = [...html.matchAll(/controlador_ajax\.php\?acao_ajax=alterar_localizadores&idProcesso=([^&"'<>]+)&hash=([^&"'<>]+)/gi)].pop();
    if (!montar || !alterar || montar[1] !== alterar[1]) throw new Error('Não encontrei os parâmetros nativos dos localizadores deste processo.');
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
    const request = async (url, options = {}) => {
        check();
        const response = await fetch(url, { credentials: 'same-origin', signal, ...options });
        if (!response.ok) throw new Error('O eProc não respondeu à operação de localizadores.');
        const text = await response.text(); check(); return text;
    };
    const catalogText = await request(`controlador_ajax.php?acao_ajax=montar_localizadores&idProcesso=${montar[1]}&idOrgao=${montar[2]}&hash=${montar[3]}`, { method: 'POST', headers, body: new URLSearchParams({ txtLocalizador: name }).toString() });
    const catalog = JSON.parse(catalogText.slice(catalogText.indexOf('['), catalogText.lastIndexOf(']') + 1));
    const matches = catalog.filter(item => normalize(String(item.text).split(' - ')[0]) === normalize(name));
    const idsMatched = [...new Set(matches.map(item => String(item.id)))];
    if (idsMatched.length !== 1 || !idsMatched[0]) throw new Error(`O localizador ${name} não foi encontrado de forma única no órgão atual.`);
    const id = idsMatched[0], current = read(document);
    if(target.id && String(target.id) !== id) throw new Error('O ID do localizador final não corresponde ao órgão atual.');
    if (current.some(item => String(item.id) === id)) return { name, id, at: Date.now(), alreadyPresent: true };
    const ids = [...new Set([...current.map(item => String(item.id)), id])];
    const result = JSON.parse(await request(`controlador_ajax.php?acao_ajax=alterar_localizadores&idProcesso=${alterar[1]}&hash=${alterar[2]}`, { method: 'POST', headers, body: new URLSearchParams({ strNovosLocalizadores: ids.join(','), strLocalizadoresDesativados: '' }).toString() }));
    if (result.error) throw new Error(result.msg || `O eProc recusou a inclusão de ${name}.`);
    // Relê a capa no servidor antes de liberar o próximo processo.
    const fresh = new DOMParser().parseFromString(await request(location.href, { cache: 'no-store' }), 'text/html');
    const confirmed = read(fresh).map(item => String(item.id));
    if (!ids.every(value => confirmed.includes(value))) throw new Error(`Não confirmei ${name} e a preservação dos outros localizadores. Retome esta etapa; a minuta já está salva.`);
    check();
    if (typeof result.html === 'string') {
        document.dispatchEvent(new CustomEvent('superproc:aplicar-resposta-localizadores', { detail: JSON.stringify({ html: result.html, ids: ids.join(',') }) }));
    }
    document.querySelector('#hdnSelLocalizadoresProcesso').value = fresh.querySelector('#hdnSelLocalizadoresProcesso').value;
    window.dispatchEvent(new CustomEvent('superproc:localizadores-atualizados', { detail: { idLocalizador: id } }));
    return { name, id, at: Date.now(), alreadyPresent: false };
}
