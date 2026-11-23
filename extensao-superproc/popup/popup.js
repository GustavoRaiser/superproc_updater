import { Registry, CATEGORIAS, carregarModulosUsuario } from '../core/registry.js';
import { Storage } from '../core/storage.js';
import { renderAtalho } from './atalho.js';
import { renderCompacto } from './compacto.js';
import { renderFeito } from './feito.js';

async function carregarTodosModulos() {
    return [...Registry.getAllModules(), ...await carregarModulosUsuario()];
}

document.addEventListener('DOMContentLoaded', async () => {
    const modulesListEl = document.getElementById('modules-list');
    const categoriesNavEl = document.getElementById('categories-nav');
    const searchInput = document.getElementById('search-input');
    const btnEnableAll = document.getElementById('btn-enable-all');
    const btnDisableAll = document.getElementById('btn-disable-all');
    const btnReloadTab = document.getElementById('btn-reload-tab');

    // Elementos do Modal de Perfil
    // O painel não fecha ao perder o foco: fecha pelo botão X, por Esc (tratado no host) ou clicando na janela principal.
    document.getElementById('btn-fechar-popup').addEventListener('click', () => window.close());
    const btnOpenProfile = document.getElementById('btn-open-profile');
    const btnCloseProfile = document.getElementById('btn-close-profile');
    const profileModal = document.getElementById('profile-modal');
    const btnExportFile = document.getElementById('btn-export-file');
    const btnTriggerUpload = document.getElementById('btn-trigger-upload');
    const fileImportProfile = document.getElementById('file-import-profile');
    const profileFeedback = document.getElementById('profile-feedback');

    let allModules = await carregarTodosModulos();
    const categories = Registry.getCategories();
    let enabledMap = await Storage.getEnabledMap();

    let currentCategory = 'all';
    let currentSearchTerm = '';

    // =========================================================================
    // 1. RENDERIZAÇÃO DAS CATEGORIAS
    // =========================================================================
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-pill';
        btn.dataset.cat = cat;
        const shortLabel = {
            [CATEGORIAS.GERAL]: 'Geral',
            [CATEGORIAS.CAPA]: 'Capa',
            [CATEGORIAS.PAINEL]: 'Painel',
            [CATEGORIAS.EDITOR]: 'Editor',
            [CATEGORIAS.ARVORE]: 'Árvore',
            [CATEGORIAS.EXTERNO]: 'Externo'
        }[cat] || cat.split(' ')[0];
        btn.textContent = shortLabel;
        btn.title = cat;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = cat;
            renderModules();
        });
        categoriesNavEl.appendChild(btn);
    });

    const allCatBtn = categoriesNavEl.querySelector('[data-cat="all"]');
    allCatBtn.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        allCatBtn.classList.add('active');
        currentCategory = 'all';
        renderModules();
    });

    // =========================================================================
    // 2. RENDERIZAÇÃO DOS MÓDULOS
    // =========================================================================
    function renderModules() {
        const filtered = allModules.filter(mod => {
            const matchesCategory = currentCategory === 'all' || mod.category === currentCategory;
            const term = currentSearchTerm.toLowerCase();
            const matchesSearch = !term ||
                mod.name.toLowerCase().includes(term) ||
                mod.description.toLowerCase().includes(term) ||
                mod.category.toLowerCase().includes(term);

            return matchesCategory && matchesSearch;
        });

        modulesListEl.innerHTML = '';

        if (filtered.length === 0) {
            modulesListEl.innerHTML = currentCategory === CATEGORIAS.AUTOMACOES && !currentSearchTerm
                ? '<div class="empty-state">Nenhuma automação disponível. Automações com IA ficam no navegador SuperPROC.</div>'
                : '<div class="empty-state">Nenhuma funcionalidade encontrada.</div>';
            return;
        }

        filtered.forEach(mod => {
            const isChecked = enabledMap[mod.id] !== undefined ? Boolean(enabledMap[mod.id]) : mod.defaultEnabled;

            const card = document.createElement('div');
            card.className = 'module-card';
            card.dataset.id = mod.id;

            const catLabel = {
                [CATEGORIAS.GERAL]: 'Geral',
                [CATEGORIAS.CAPA]: 'Capa',
                [CATEGORIAS.PAINEL]: 'Painel',
                [CATEGORIAS.EDITOR]: 'Editor',
                [CATEGORIAS.ARVORE]: 'Árvore',
                [CATEGORIAS.EXTERNO]: 'Externo'
            }[mod.category] || mod.category.split(' ')[0];

            card.innerHTML = `
                <div class="module-info">
                    <div class="module-header-row">
                        <span class="module-name" id="module-name-${mod.id}">${mod.name}</span>
                        <span class="badge-cat">${catLabel}</span>
                    </div>
                    <div class="module-desc" id="module-desc-${mod.id}">${mod.description}</div>
                </div>
                <label class="switch" title="Ativar ou desativar esta função">
                    <input type="checkbox" aria-labelledby="module-name-${mod.id}" aria-describedby="module-desc-${mod.id}" ${isChecked ? 'checked' : ''} data-id="${mod.id}">
                    <span class="slider"></span>
                </label>
            `;

            if (mod.usuario) {
                const remover = document.createElement('button');
                remover.className = 'module-remove'; remover.type = 'button'; remover.textContent = '×'; remover.title = 'Remover módulo importado';
                remover.addEventListener('click', async () => {
                    if (!window.superprocHost || !confirm('Remover o módulo "' + mod.name + '"?')) return;
                    try { await window.superprocHost.modulo({ op: 'remover', id: mod.id }); await recarregarModulosUsuario(); } catch (error) { console.warn('[SuperPROC] Falha ao remover módulo:', error); }
                });
                card.querySelector('.module-header-row').appendChild(remover);
            }

            if (mod.organizador) {
                const abrir = document.createElement('button');
                abrir.type = 'button';
                abrir.className = 'btn-organizar';
                abrir.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span>Organizar grupos</span>';
                abrir.title = 'Abre o organizador: mova itens entre grupos sem precisar do eproc aberto';
                abrir.addEventListener('click', async () => {
                    try {
                        if (window.superprocHost && window.superprocHost.abrirOrganizador) await window.superprocHost.abrirOrganizador(mod.organizador);
                        else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: chrome.runtime.getURL('organizador/organizador.html?m=' + mod.organizador) });
                    } catch (error) { console.warn('[SuperPROC] Falha ao abrir o organizador:', error); }
                });
                card.querySelector('.module-info').appendChild(abrir);
            }

            if (mod.atalho) renderAtalho(card, mod).catch(error => console.warn('[SuperPROC] Atalho indisponível:', error));
            let atualizarCompacto = null;
            if (mod.compacto) renderCompacto(card, mod, isChecked).then(fn => { atualizarCompacto = fn; }).catch(error => console.warn('[SuperPROC] Modo compacto indisponível:', error));
            let atualizarFeito = null;
            if (mod.feito) renderFeito(card, mod, isChecked).then(fn => { atualizarFeito = fn; }).catch(error => console.warn('[SuperPROC] Escolha do localizador Feito indisponível:', error));

            const checkbox = card.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.addEventListener('change', async (e) => {
                const checked = e.target.checked;
                await Storage.setModuleEnabled(mod.id, checked);
                enabledMap[mod.id] = checked;
                if (atualizarCompacto) atualizarCompacto(checked);
                if (atualizarFeito) atualizarFeito(checked);
            });

            modulesListEl.appendChild(card);
        });
    }

    // =========================================================================
    // 2b. IMPORTAÇÃO DE JAVASCRIPT (arrastar e soltar na lista; sem botões)
    // Em "Todos" ou "Outras" o módulo entra em "Outras"; em um setor específico, entra nesse setor.
    // =========================================================================
    async function recarregarModulosUsuario() {
        allModules = await carregarTodosModulos();
        enabledMap = await Storage.getEnabledMap();
        renderModules();
    }
    // Soltar um arquivo fora da lista nunca pode navegar o popup para o arquivo.
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
    modulesListEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    modulesListEl.addEventListener('drop', async e => {
        e.preventDefault();
        const arquivos = [...(e.dataTransfer?.files || [])].filter(f => /\.m?js$/i.test(f.name));
        if (!arquivos.length || !window.superprocHost) return;
        const categoria = (currentCategory === 'all' || currentCategory === CATEGORIAS.OUTRAS) ? CATEGORIAS.OUTRAS : currentCategory;
        for (const arquivo of arquivos) {
            try { await window.superprocHost.modulo({ op: 'adicionar', nome: arquivo.name, categoria, conteudo: await arquivo.text() }); }
            catch (error) { console.warn('[SuperPROC] Falha ao importar ' + arquivo.name + ':', error); }
        }
        await recarregarModulosUsuario();
    });

    // =========================================================================
    // 3. EVENTOS DE BUSCA E AÇÕES GLOBAIS
    // =========================================================================
    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.trim();
        renderModules();
    });

    btnEnableAll.addEventListener('click', async () => {
        const checkboxes = modulesListEl.querySelectorAll('input[type="checkbox"]');
        for (const cb of checkboxes) {
            cb.checked = true;
            const id = cb.dataset.id;
            await Storage.setModuleEnabled(id, true);
            enabledMap[id] = true;
        }
    });

    btnDisableAll.addEventListener('click', async () => {
        const checkboxes = modulesListEl.querySelectorAll('input[type="checkbox"]');
        for (const cb of checkboxes) {
            cb.checked = false;
            const id = cb.dataset.id;
            await Storage.setModuleEnabled(id, false);
            enabledMap[id] = false;
        }
    });

    btnReloadTab.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                    window.close();
                }
            });
        } else {
            window.location.reload();
        }
    });

    // =========================================================================
    // 4. MODAL DE GERENCIAMENTO DE PERFIL (SALVAR / CARREGAR)
    // =========================================================================
    function showFeedback(text, type = 'success') {
        profileFeedback.textContent = text;
        profileFeedback.className = `profile-feedback ${type}`;
        setTimeout(() => {
            profileFeedback.textContent = '';
            profileFeedback.className = 'profile-feedback';
        }, 3000);
    }

    btnOpenProfile.addEventListener('click', () => {
        profileModal.classList.add('active');
    });

    btnCloseProfile.addEventListener('click', () => {
        profileModal.classList.remove('active');
    });

    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) {
            profileModal.classList.remove('active');
        }
    });

    // Exportar Arquivo JSON
    btnExportFile.addEventListener('click', async () => {
        try {
            const profile = await Storage.exportProfile();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
            const downloadAnchor = document.createElement('a');
            const dataHoje = new Date().toISOString().split('T')[0];
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `superproc-perfil-${dataHoje}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showFeedback('✔ Perfil exportado.');
        } catch (err) {
            showFeedback('Erro ao exportar perfil: ' + err.message, 'error');
        }
    });

    // Gatilho para selecionar arquivo
    btnTriggerUpload.addEventListener('click', () => {
        fileImportProfile.click();
    });

    fileImportProfile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // permite escolher o mesmo arquivo de novo
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { showFeedback('Arquivo não é um perfil do SuperPROC Navegador.', 'error'); return; }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                await Storage.importProfile(event.target.result);
                enabledMap = await Storage.getEnabledMap();
                renderModules();
                showFeedback('✔ Perfil carregado. Recarregue o eproc.');
            } catch (err) {
                showFeedback('Erro ao carregar: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    });

    // Render inicial
    renderModules();
});
