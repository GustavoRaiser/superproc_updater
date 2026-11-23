/**
 * SuperPROC - Popup: escolha do localizador do botão "Feito".
 *
 * Como funciona:
 *  - O módulo declara `feito: { descricao }` no registry e este arquivo desenha o controle dentro do card dele.
 *  - A lista de localizadores vem do catálogo capturado pelo Smart Localizadores (CATALOGO_LOCALIZADORES_KEY):
 *    é preciso abrir uma lista de processos no eproc ao menos uma vez para ela existir.
 *  - Não há localizador padrão: enquanto nada for escolhido, o botão Feito fica desativado na capa do processo.
 *  - A escolha é gravada só para o módulo do card: Storage.setModuleSettings(<id>, { feito: { id, name } | null }).
 */
import { Storage } from '../core/storage.js';
import { CATALOGO_LOCALIZADORES_KEY } from '../core/catalogo_localizadores.js';

const PLACEHOLDER = 'Escolher localizador…';

export async function renderFeito(card, mod, moduloAtivo = true) {
    const config = await Storage.getModuleSettings(mod.id);
    let atual = config.feito && /^\d+$/.test(String(config.feito.id)) ? { id: String(config.feito.id), name: String(config.feito.name || '') } : null;
    let catalogos = [];
    try {
        catalogos = Object.entries((await chrome.storage.local.get(CATALOGO_LOCALIZADORES_KEY))[CATALOGO_LOCALIZADORES_KEY] || {})
            .sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    } catch (erro) { console.warn('[SuperPROC] Catálogo de localizadores indisponível:', erro); }

    // Estrutura: título · (unidade, se houver mais de um catálogo) · filtro + lista · descrição · estado.
    const linha = document.createElement('div');
    linha.className = 'compacto-linha feito-linha';
    const rotulo = document.createElement('div');
    rotulo.className = 'feito-rotulo';
    rotulo.textContent = 'Localizador do botão Feito';
    const escopo = document.createElement('select');
    escopo.className = 'feito-select';
    escopo.setAttribute('aria-label', 'Unidade do catálogo de localizadores');
    const controles = document.createElement('div');
    controles.className = 'feito-controles';
    const busca = document.createElement('input');
    busca.type = 'search';
    busca.className = 'feito-busca';
    busca.placeholder = 'Filtrar…';
    busca.setAttribute('aria-label', 'Filtrar localizadores');
    const select = document.createElement('select');
    select.className = 'feito-select';
    select.setAttribute('aria-label', 'Localizador inserido pelo botão Feito');
    controles.append(busca, select);
    const descricao = document.createElement('div');
    descricao.className = 'compacto-dica';
    descricao.textContent = (mod.feito && mod.feito.descricao) || '';
    const estado = document.createElement('div');
    estado.className = 'compacto-dica feito-estado';
    estado.setAttribute('role', 'status');
    linha.append(rotulo);
    if (catalogos.length > 1) linha.append(escopo);
    linha.append(controles, descricao, estado);
    card.append(linha);

    catalogos.forEach(([chave, c]) => {
        const o = document.createElement('option');
        o.value = chave;
        o.textContent = c.unitName || c.unit || chave;
        escopo.append(o);
    });

    const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function mostrarEstado() {
        estado.classList.remove('erro');
        if (!catalogos.length) estado.textContent = 'Nenhum localizador capturado ainda: abra uma lista de processos no eproc e reabra este popup.';
        else estado.textContent = atual ? `O botão Feito vai inserir: ${atual.name || atual.id}` : 'Nenhum localizador escolhido: o botão Feito está desativado.';
    }
    function desenhar() {
        const locs = (catalogos.find(([k]) => k === escopo.value) || catalogos[0] || [null, { locators: [] }])[1].locators || [];
        const termo = norm(busca.value);
        select.textContent = '';
        const p = document.createElement('option');
        p.value = '';
        p.textContent = PLACEHOLDER;
        select.append(p);
        const vistos = new Set();
        if (atual) { // mantém a escolha atual visível mesmo fora do catálogo/filtro
            const o = document.createElement('option');
            o.value = atual.id;
            o.textContent = atual.name || atual.id;
            select.append(o);
            vistos.add(atual.id);
        }
        locs.filter(l => !termo || norm(l.name).includes(termo)).forEach(l => {
            if (vistos.has(String(l.id))) return;
            vistos.add(String(l.id));
            const o = document.createElement('option');
            o.value = String(l.id);
            o.textContent = l.name;
            select.append(o);
        });
        select.value = atual ? atual.id : '';
        mostrarEstado();
    }

    select.addEventListener('change', async () => {
        const id = select.value;
        const nome = id ? (select.selectedOptions[0]?.textContent || '') : '';
        const novo = id ? { id, name: nome } : null;
        select.disabled = true;
        try {
            await Storage.setModuleSettings(mod.id, { feito: novo });
            atual = novo;
        } catch (erro) {
            console.warn('[SuperPROC] Não foi possível gravar o localizador do Feito:', erro);
            desenhar();
            estado.textContent = 'Não foi possível salvar. Tente novamente.';
            estado.classList.add('erro');
            select.disabled = linha.classList.contains('inativo');
            return;
        }
        select.disabled = linha.classList.contains('inativo');
        desenhar();
    });
    escopo.addEventListener('change', desenhar);
    busca.addEventListener('input', desenhar);
    desenhar();

    const atualizar = (ativo) => {
        [escopo, busca, select].forEach(el => { el.disabled = !ativo; });
        linha.classList.toggle('inativo', !ativo);
    };
    atualizar(moduloAtivo);
    return atualizar;
}
