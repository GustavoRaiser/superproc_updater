/**
 * Pool comum SuperPROC (lado da extensão) — especificação em docs/ia/POOL-COMUM.md.
 *
 * O endereço comum entre a extensão e o navegador SuperPROC é o localStorage da origem do eproc: é o único lugar que os
 * dois alcançam sozinhos (a extensão roda em qualquer Chromium; o navegador funciona sem a extensão). Os grupos dos Smart
 * Localizadores e Smart Eventos já moram lá (core/smartorg.js, LOCAL_KEYS). Aqui entram as cores, que a extensão guarda
 * no chrome.storage (organizador e Localizadores Coloridos) e o navegador não enxerga:
 *
 *   localStorage['superproc_pool_cores_v1'] = { v: 1, at, proprias, az, regrasGrupos, catalogoLoc }
 *     proprias / az: { [nome curto normalizado]: { cor, tx, prio? } }   (cor própria do usuário / cor vista no AZflow)
 *     regrasGrupos:  { [grupo do Smart Localizadores]: { cor, tx, prio } }
 *     catalogoLoc:   [{ value: id do localizador, text: nome completo }] (liga os ids dos grupos aos nomes)
 *
 * Regras:
 *   - Quem chega primeiro cria a pool no mesmo lugar e no mesmo formato (o navegador cria vazia quando não há extensão).
 *   - A extensão é a dona das cores: o chrome.storage é escrito por cima na pool a cada carga e a cada mudança.
 *   - Se o chrome.storage não tem uma parte e a pool tem (pool criada antes da extensão, ou outro navegador), a extensão
 *     adota a parte da pool. Nada é apagado de um lado por estar vazio no outro.
 * Sempre ativa em controlador.php, independente dos módulos ligados. Não envia nada para fora da página.
 */

import { lerOrigem, gravarOrigem, aoMudarEspelho } from './smartorg.js';
import { CHAVE_REGRAS_GRUPOS, lerRegrasGrupos, gravarRegrasGrupos } from './coresgrupos.js';

export const CHAVE_POOL_CORES = 'superproc_pool_cores_v1';
const LIMITE_BYTES = 1024 * 1024;
const HEX = /^#[0-9a-fA-F]{6}$/;

function limparCores(mapa) {
    const saida = {};
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return saida;
    for (const [nome, r] of Object.entries(mapa)) {
        if (nome === '__proto__' || !r || typeof r !== 'object') continue;
        const cor = typeof r.cor === 'string' && HEX.test(r.cor) ? r.cor.toLowerCase() : '';
        const tx = typeof r.tx === 'string' && HEX.test(r.tx) ? r.tx.toLowerCase() : '';
        const item = {};
        if (cor) { item.cor = cor; if (tx) item.tx = tx; }
        if (Number.isInteger(r.prio) && r.prio >= 0 && r.prio <= 9) item.prio = r.prio;
        if (Object.keys(item).length) saida[nome] = item;
    }
    return saida;
}
const vazio = (o) => !o || (Array.isArray(o) ? o.length === 0 : Object.keys(o).length === 0);

/** Lê e valida a pool (null se ausente ou inválida). */
export function lerPoolCores(storage = localStorage) {
    try {
        const bruto = storage.getItem(CHAVE_POOL_CORES);
        if (!bruto || bruto.length > LIMITE_BYTES) return null;
        const p = JSON.parse(bruto);
        if (!p || typeof p !== 'object' || p.v !== 1) return null;
        return {
            v: 1,
            at: Number(p.at) || 0,
            proprias: limparCores(p.proprias),
            az: limparCores(p.az),
            regrasGrupos: limparCores(p.regrasGrupos),
            catalogoLoc: Array.isArray(p.catalogoLoc) ? p.catalogoLoc.filter(c => c && typeof c.value === 'string' && typeof c.text === 'string') : []
        };
    } catch { return null; }
}

function gravarPoolCores(pool, storage = localStorage) {
    try {
        const texto = JSON.stringify(pool);
        if (texto.length > LIMITE_BYTES) return;
        if (storage.getItem(CHAVE_POOL_CORES) !== texto) storage.setItem(CHAVE_POOL_CORES, texto);
    } catch { /* armazenamento cheio ou bloqueado: a extensão segue com o chrome.storage */ }
}

export function instalarPoolComum() {
    if (window.__superprocPoolComum) return;
    window.__superprocPoolComum = true;
    const origem = location.origin;
    const chavePropria = 'superproc_organizador_loc_cor:' + origem;
    const chaveAZ = 'superproc_organizador_loc_az:' + origem;

    // Carimbo da última sincronização com a pool nesta origem: a pool com `at` maior foi editada fora da extensão
    // (navegador SuperPROC ou outra cópia) e é importada; senão a extensão exporta o que tem.
    const chaveSync = 'superproc_pool_cores_sync:' + origem;

    let pendente = null;
    async function sincronizar() {
        try {
            const pool = lerPoolCores();
            const lidas = await chrome.storage.local.get([chavePropria, chaveAZ, chaveSync]);
            let proprias = lidas[chavePropria] || {};
            let az = lidas[chaveAZ] || {};
            let regras = await lerRegrasGrupos(origem);
            const espelho = await lerOrigem('loc', origem);
            let catalogo = (espelho && espelho.catalogo) || [];
            const ultimaSync = Number(lidas[chaveSync]);
            const jaSincronizou = Number.isFinite(ultimaSync) && ultimaSync > 0;

            // Importação: a pool mudou depois da última sincronização (edição feita no navegador). A pool vence.
            if (pool && jaSincronizou && pool.at > ultimaSync) {
                await chrome.storage.local.set({ [chavePropria]: pool.proprias, [chaveAZ]: pool.az, [chaveSync]: pool.at });
                await gravarRegrasGrupos(origem, pool.regrasGrupos);
                if (espelho && pool.catalogoLoc.length && JSON.stringify(pool.catalogoLoc) !== JSON.stringify(catalogo)) {
                    await gravarOrigem('loc', origem, { ...espelho, catalogo: pool.catalogoLoc });
                }
                return;
            }

            // Primeira sincronização desta versão: só adota o que existe apenas na pool (nada é apagado de um lado
            // por estar vazio no outro), depois exporta e passa a usar o carimbo.
            if (pool && !jaSincronizou) {
                const adotar = {};
                if (vazio(proprias) && !vazio(pool.proprias)) { proprias = pool.proprias; adotar[chavePropria] = proprias; }
                if (vazio(az) && !vazio(pool.az)) { az = pool.az; adotar[chaveAZ] = az; }
                if (Object.keys(adotar).length) await chrome.storage.local.set(adotar);
                if (vazio(regras) && !vazio(pool.regrasGrupos)) { regras = pool.regrasGrupos; await gravarRegrasGrupos(origem, regras); }
                if (vazio(catalogo) && !vazio(pool.catalogoLoc) && espelho) {
                    catalogo = pool.catalogoLoc;
                    await gravarOrigem('loc', origem, { ...espelho, catalogo });
                }
            }

            // Exportação: o chrome.storage (organizador e Coloridos da extensão) vai para a pool.
            const nova = { v: 1, at: Date.now(), proprias: limparCores(proprias), az: limparCores(az), regrasGrupos: limparCores(regras), catalogoLoc: catalogo };
            const igual = pool && JSON.stringify({ ...pool, at: 0 }) === JSON.stringify({ ...nova, at: 0 });
            if (!igual) {
                gravarPoolCores(nova);
                await chrome.storage.local.set({ [chaveSync]: nova.at });
            } else if (!jaSincronizou || ultimaSync !== pool.at) {
                await chrome.storage.local.set({ [chaveSync]: pool.at });
            }
        } catch (erro) {
            console.warn('[SuperPROC] Pool comum indisponível:', erro);
        }
    }
    const agendar = () => { clearTimeout(pendente); pendente = setTimeout(sincronizar, 200); };

    sincronizar();
    try {
        chrome.storage.onChanged.addListener((mudancas, area) => {
            if (area === 'local' && (mudancas[chavePropria] || mudancas[chaveAZ] || mudancas[CHAVE_REGRAS_GRUPOS])) agendar();
        });
        aoMudarEspelho('loc', (o) => { if (o === origem) agendar(); });
    } catch (_) {}
}
