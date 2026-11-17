/**
 * Espelho dos grupos dos módulos Smart (Localizadores e Eventos) em chrome.storage.local.
 *
 * Os módulos guardam grupos no localStorage do eproc (um por origem). O organizador (página da extensão) não enxerga
 * esse localStorage, então cada alteração é espelhada aqui e o organizador edita o espelho. Cada lado carimba `at`
 * (ms) a cada mudança real; quem tem o carimbo maior vence.
 *
 * Formato por tipo ('loc' | 'evt'): { [origem]: { grupos: string[], gruposOcultos?: string[], estrutura: { [grupo]: Item[] }, catalogo?: {value,text}[], at } }
 *   loc: itens são o id do localizador (string); `catalogo` traz os nomes da última unidade vista.
 *   evt: itens são { id, text }; o grupo "📚 Base do Tribunal (Auto)" é do sistema e não é editável.
 *   `grupos` é a ordem em que os grupos aparecem no campo da minuta. `gruposOcultos` são grupos (de `grupos`) escondidos desse campo.
 */

export const SEM_GRUPO = 'Sem Grupo';
// Grupo do sistema: itens aqui NÃO aparecem nos menus do eproc (só no organizador). Nunca entra em `grupos`; vive só em `estrutura`.
export const GRUPO_OCULTOS = 'Ocultos';
export const GRUPO_BASE_EVENTOS = '\u{1F4DA} Base do Tribunal (Auto)';
export const ESPELHO_KEYS = { loc: 'superproc_smartorg_loc_v1', evt: 'superproc_smartorg_evt_v1' };
export const LOCAL_KEYS = {
    loc: { grupos: 'eproc_smartloc_grupos', estrutura: 'eproc_smartloc_estrutura', at: 'eproc_smartloc_at', ocultos: 'eproc_smartloc_grupos_ocultos' },
    evt: { grupos: 'eproc_smarteventos_grupos', estrutura: 'eproc_smarteventos_estrutura', at: 'eproc_smarteventos_at', ocultos: 'eproc_smarteventos_grupos_ocultos' }
};

const LIMITE_BYTES = 1.5 * 1024 * 1024;

/** Valida e normaliza dados vindos de fora (página do eproc, espelho). Devolve null se inválidos. */
export function normalizarDados(tipo, dados) {
    try {
        if (!dados || typeof dados !== 'object') return null;
        if (JSON.stringify(dados).length > LIMITE_BYTES) return null;
        const grupos = Array.isArray(dados.grupos) ? dados.grupos.filter(g => typeof g === 'string' && g && g !== SEM_GRUPO && g !== GRUPO_OCULTOS) : [];
        const estruturaIn = dados.estrutura && typeof dados.estrutura === 'object' && !Array.isArray(dados.estrutura) ? dados.estrutura : {};
        const estrutura = {};
        for (const [nome, itens] of Object.entries(estruturaIn)) {
            if (nome === '__proto__' || !Array.isArray(itens)) continue;
            estrutura[nome] = itens
                .map(i => tipo === 'loc' ? (typeof i === 'string' ? i : null) : (i && typeof i.text === 'string' ? { id: i.id == null ? '' : String(i.id), text: i.text } : null))
                .filter(i => i !== null);
        }
        if (!estrutura[SEM_GRUPO]) estrutura[SEM_GRUPO] = [];
        if (!estrutura[GRUPO_OCULTOS]) estrutura[GRUPO_OCULTOS] = [];
        const unicos = [...new Set(grupos)];
        for (const g of unicos) if (!estrutura[g]) estrutura[g] = [];
        const ocultos = Array.isArray(dados.gruposOcultos) ? [...new Set(dados.gruposOcultos.filter(g => typeof g === 'string' && unicos.includes(g)))] : [];
        const saida = { grupos: unicos, gruposOcultos: ocultos, estrutura, at: Number(dados.at) > 0 ? Number(dados.at) : 0 };
        if (tipo === 'loc' && Array.isArray(dados.catalogo)) {
            saida.catalogo = dados.catalogo.filter(c => c && typeof c.value === 'string' && typeof c.text === 'string').map(c => ({ value: c.value, text: c.text }));
        }
        return saida;
    } catch { return null; }
}

export async function lerEspelho(tipo) {
    const chave = ESPELHO_KEYS[tipo];
    const mapa = (await chrome.storage.local.get(chave))[chave];
    return mapa && typeof mapa === 'object' ? mapa : {};
}

export async function lerOrigem(tipo, origem) {
    const mapa = await lerEspelho(tipo);
    return mapa[origem] ? normalizarDados(tipo, mapa[origem]) : null;
}

export async function gravarOrigem(tipo, origem, dados) {
    const limpo = normalizarDados(tipo, dados);
    if (!limpo) throw new Error('Dados inválidos.');
    const mapa = await lerEspelho(tipo);
    mapa[origem] = limpo;
    await chrome.storage.local.set({ [ESPELHO_KEYS[tipo]]: mapa });
    return limpo;
}

/** Chama `cb(origem, dados)` quando o espelho de `tipo` muda (inclusive por outra aba). */
export function aoMudarEspelho(tipo, cb) {
    const chave = ESPELHO_KEYS[tipo];
    const ouvinte = (mudancas, area) => {
        if (area !== 'local' || !mudancas[chave]) return;
        const novo = mudancas[chave].newValue || {};
        const antigo = mudancas[chave].oldValue || {};
        for (const origem of Object.keys(novo)) {
            if (JSON.stringify(novo[origem]) !== JSON.stringify(antigo[origem])) cb(origem, normalizarDados(tipo, novo[origem]));
        }
    };
    chrome.storage.onChanged.addListener(ouvinte);
    return () => chrome.storage.onChanged.removeListener(ouvinte);
}

/** Leitura/escrita do lado da página (localStorage do eproc). */
export function lerLocal(tipo, storage = localStorage) {
    const k = LOCAL_KEYS[tipo];
    const ler = (chave, padrao) => { try { const v = storage.getItem(chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } };
    const ocultos = ler(k.ocultos, []);
    return { grupos: ler(k.grupos, []), gruposOcultos: Array.isArray(ocultos) ? ocultos.filter(g => typeof g === 'string') : [], estrutura: ler(k.estrutura, { [SEM_GRUPO]: [] }), at: Number(storage.getItem(k.at)) || 0 };
}

export function gravarLocal(tipo, dados, storage = localStorage) {
    const k = LOCAL_KEYS[tipo];
    try {
        storage.setItem(k.grupos, JSON.stringify(dados.grupos));
        storage.setItem(k.estrutura, JSON.stringify(dados.estrutura));
        if (Array.isArray(dados.gruposOcultos)) storage.setItem(k.ocultos, JSON.stringify(dados.gruposOcultos));
        storage.setItem(k.at, String(dados.at));
    } catch { /* armazenamento cheio ou bloqueado: o espelho segue valendo */ }
}

/**
 * Se o espelho for mais novo que o localStorage, aplica-o ao localStorage. Devolve true se aplicou.
 * Se o espelho não existir ainda, semeia-o com o conteúdo local (quando houver).
 */
export async function reconciliar(tipo, origem = location.origin) {
    try {
        const espelho = await lerOrigem(tipo, origem);
        const local = lerLocal(tipo);
        if (espelho && espelho.at > local.at) { gravarLocal(tipo, espelho); return true; }
        const temLocal = Array.isArray(local.grupos) && (local.grupos.length || Object.values(local.estrutura || {}).some(l => l && l.length));
        if (!espelho && temLocal) {
            await gravarOrigem(tipo, origem, { ...local, at: local.at || Date.now() });
        }
    } catch (erro) {
        console.warn('[SuperPROC] Espelho dos grupos indisponível:', erro);
    }
    return false;
}

/** URL da página do organizador para o tipo informado. */
export function urlOrganizador(tipo) {
    return chrome.runtime.getURL(`organizador/organizador.html?m=${tipo === 'evt' ? 'evt' : 'loc'}`);
}
