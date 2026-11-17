/**
 * SuperPROC - Auxiliar do Modo Compacto da Capa (não é um módulo; não está no registry).
 *
 * Cada módulo da capa que tem modo compacto (Barra de Botões, Ações Preferenciais,
 * Lembretes e Minutas) guarda a SUA opção em Storage.setModuleSettings(<id do módulo>, { compacto }),
 * ligada pelo botão "Modo Compacto" do card do módulo no popup da extensão.
 *
 * - Aplica/remove uma classe própria em <body> (ex.: eproc-compacto-barra).
 * - Reage em tempo real a mudanças feitas no popup (chrome.storage.onChanged).
 * - Migração única do flag legado global (localStorage 'eproc_modo_compacto_ativo'):
 *   enquanto o módulo ainda não tem a opção própria gravada, herda o valor legado uma vez;
 *   depois disso o módulo é independente. A chave legada nunca é apagada nem reescrita.
 */
const CHAVE_CONFIG = 'superproc_custom_settings';
const CHAVE_LEGADA = 'eproc_modo_compacto_ativo';

function legadoLigado() {
    try { return localStorage.getItem(CHAVE_LEGADA) === 'true'; } catch { return false; }
}

export async function iniciarCompacto({ meta, storage, classe, aoMudar } = {}) {
    let atual = false;
    const id = meta && meta.id;
    if (classe && id && storage && typeof storage.getModuleSettings === 'function') {
        try {
            const cfg = await storage.getModuleSettings(id);
            if (typeof cfg.compacto === 'boolean') {
                atual = cfg.compacto;
            } else {
                atual = legadoLigado();
                await storage.setModuleSettings(id, { compacto: atual });
            }
        } catch (erro) {
            console.warn('[SuperPROC] Modo compacto indisponível para', id, erro);
        }
    }
    const aplicar = (valor) => {
        atual = !!valor;
        if (classe && document.body) document.body.classList.toggle(classe, atual);
    };
    aplicar(atual);

    if (classe && id && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((mudancas) => {
            const m = mudancas[CHAVE_CONFIG];
            if (!m) return;
            const novo = !!(m.newValue && m.newValue[id] && m.newValue[id].compacto);
            if (novo === atual) return;
            aplicar(novo);
            if (typeof aoMudar === 'function') {
                try { aoMudar(novo); } catch (erro) { console.warn('[SuperPROC] Falha ao reaplicar o modo compacto:', erro); }
            }
        });
    }
    return { ativo: () => atual };
}
