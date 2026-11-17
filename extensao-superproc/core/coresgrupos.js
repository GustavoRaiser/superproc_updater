/**
 * Regras de cor e prioridade por GRUPO dos localizadores coloridos (módulo "Localizadores - Coloridos & Priorizados").
 *
 * Os grupos vêm do Smart Localizadores (só leitura: core/smartorg.js); aqui ficam apenas as regras genéricas de cada grupo.
 * Não há vínculo entre os módulos: o colorido apenas reconhece grupos que existam e aplica a regra aos localizadores deles.
 *
 * Formato (chrome.storage.local, chave CHAVE): { [origem]: { regras: { [grupo]: { cor, tx, prio } }, at } }
 *   cor/tx: fundo e texto em #rrggbb ('' = o grupo não colore); prio: 0 a 9 (null = o grupo não define prioridade).
 *
 * Precedência na hora de pintar (ver localizadores_coloridos.js):
 *   cor:        AZflow  >  cor própria do localizador (definida pelo usuário)  >  cor do grupo  >  padrão
 *   prioridade: própria do localizador (diferente de 9)  >  prioridade do grupo  >  9
 */

export const CHAVE_REGRAS_GRUPOS = 'superproc_cores_grupos_v1';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Valida e normaliza regras vindas de fora (página, armazenamento). Descarta o que não for válido. */
export function normalizarRegras(regras) {
    const saida = {};
    if (!regras || typeof regras !== 'object' || Array.isArray(regras)) return saida;
    for (const [grupo, r] of Object.entries(regras)) {
        if (grupo === '__proto__' || !r || typeof r !== 'object') continue;
        const cor = typeof r.cor === 'string' && HEX.test(r.cor) ? r.cor.toLowerCase() : '';
        const tx = cor && typeof r.tx === 'string' && HEX.test(r.tx) ? r.tx.toLowerCase() : '';
        const n = r.prio === null || r.prio === undefined || r.prio === '' ? null : Number(r.prio);
        const prio = n !== null && Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
        if (cor || prio !== null) saida[grupo] = { cor, tx, prio };
    }
    return saida;
}

async function lerMapa() {
    const mapa = (await chrome.storage.local.get(CHAVE_REGRAS_GRUPOS))[CHAVE_REGRAS_GRUPOS];
    return mapa && typeof mapa === 'object' ? mapa : {};
}

export async function lerRegrasGrupos(origem) {
    const mapa = await lerMapa();
    return normalizarRegras(mapa[origem] && mapa[origem].regras);
}

export async function gravarRegrasGrupos(origem, regras) {
    const mapa = await lerMapa();
    mapa[origem] = { regras: normalizarRegras(regras), at: Date.now() };
    await chrome.storage.local.set({ [CHAVE_REGRAS_GRUPOS]: mapa });
}

/** Chama `cb(origem, regras)` quando as regras mudam (inclusive por outra aba). Devolve a função que cancela. */
export function aoMudarRegrasGrupos(cb) {
    const ouvinte = (mudancas, area) => {
        if (area !== 'local' || !mudancas[CHAVE_REGRAS_GRUPOS]) return;
        const novo = mudancas[CHAVE_REGRAS_GRUPOS].newValue || {};
        const antigo = mudancas[CHAVE_REGRAS_GRUPOS].oldValue || {};
        for (const origem of Object.keys(novo)) {
            if (JSON.stringify(novo[origem]) !== JSON.stringify(antigo[origem])) cb(origem, normalizarRegras(novo[origem] && novo[origem].regras));
        }
    };
    chrome.storage.onChanged.addListener(ouvinte);
    return () => chrome.storage.onChanged.removeListener(ouvinte);
}
