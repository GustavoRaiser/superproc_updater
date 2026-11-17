/**
 * SuperPROC — Editor: Botões Visíveis
 * Recupera a experiência original: engrenagem, gaveta por hover e modal
 * agrupado. Marcar um item significa mantê-lo visível na barra principal.
 */

const STORAGE_KEY = 'superproc_editor_botoes_ocultos_v3';
const STYLE_ID = 'superproc-editor-botoes-style';
const TOOLBAR_ID = 'superproc-toolbar-gestor';
const DRAWER_ID = 'superproc-editor-drawer';
const MODAL_ID = 'superproc-editor-modal';
let scheduled = false;
const GENERIC_CMDS = new Set(['custom']);

function readSelected() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null; // Sem preferência: todos os botões permanecem visíveis.
        const saved = JSON.parse(raw);
        return Array.isArray(saved) ? saved : null;
    } catch (_) { return null; }
}

function saveSelected(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function commandOf(element, index) {
    const klass = Array.from(element.classList).find(c => /^cke_(button|combo)__/.test(c));
    if (klass) {
        const cmd = klass.replace(/^cke_(button|combo)__/, '').replace(/_label$/, '');
        // 'custom' é a classe genérica de botões de extensões: não identifica a ferramenta.
        if (!GENERIC_CMDS.has(cmd)) return cmd;
    }
    if (element.id && !/^cke_\d/.test(element.id)) return element.id;
    const title = (element.title || element.getAttribute('aria-label') || element.textContent || '').trim();
    return title ? title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : `item_${index}`;
}

function cleanTitle(title) {
    return String(title || 'Ferramenta').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function scanCatalog() {
    const groups = [];
    document.querySelectorAll('.cke_toolbox_main .cke_toolbar, .cke_toolbox .cke_toolbar').forEach(toolbar => {
        // A própria gaveta usa classes nativas (.cke_toolbox/.cke_toolbar): nunca entra no catálogo.
        if (toolbar.id === TOOLBAR_ID || toolbar.closest(`#${DRAWER_ID}, #${MODAL_ID}`)) return;
        const label = toolbar.querySelector('.cke_voice_label');
        const name = cleanTitle(label?.textContent || toolbar.getAttribute('aria-label') || 'Outros');
        const items = [];
        const controls = toolbar.querySelectorAll('.cke_button, .cke_combo, [role="button"], button[id*="az-"], a[id*="az-"]');
        controls.forEach((element, index) => {
            if (element.closest(`#${TOOLBAR_ID}`) || element.closest('.cke_combo') && !element.classList.contains('cke_combo')) return;
            if (items.some(item => item.element === element)) return;
            const cmd = commandOf(element, index);
            const title = element.title || element.getAttribute('aria-label') || element.querySelector('.cke_button_label')?.textContent || cmd;
            const legacy = (Array.from(element.classList).find(c => /^cke_(button|combo)__/.test(c)) || '').replace(/^cke_(button|combo)__/, '').replace(/_label$/, '');
            items.push({ element, cmd, legacy, id: element.id || '', title: cleanTitle(title), toolbar });
        });
        if (items.length) groups.push({ name, toolbar, items });
    });
    return groups;
}

function isSelected(item, selected) {
    return selected === null || selected.includes(item.cmd) || (item.id && selected.includes(item.id))
        || (item.legacy && item.legacy !== item.cmd && GENERIC_CMDS.has(item.legacy) && selected.includes(item.legacy));
}

function applySelection() {
    const selected = readSelected();
    const catalog = scanCatalog();
    catalog.forEach(group => {
        group.items.forEach(item => {
            const hide = !isSelected(item, selected);
            item.element.classList.toggle('superproc-btn-oculto', hide);
            item.element.style.removeProperty('display');
            if (hide) item.element.style.setProperty('display', 'none', 'important');
        });
        const visible = group.items.some(item => isSelected(item, selected));
        group.toolbar.style.removeProperty('display');
        if (!visible) group.toolbar.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('.cke_toolgroup').forEach(group => {
        if (group.closest(`#${TOOLBAR_ID}, #${DRAWER_ID}, #${MODAL_ID}`)) return;
        const visible = Array.from(group.querySelectorAll('.cke_button, .cke_combo, [role="button"]'))
            .some(control => control.style.display !== 'none');
        group.style.removeProperty('display');
        if (!visible) group.style.setProperty('display', 'none', 'important');
    });
}

/* ------------------------------------------------------------------
 * Gaveta de ferramentas ocultas
 * - Existe UMA única gaveta (#DRAWER_ID); duplicatas são removidas.
 * - O conteúdo é montado a cada abertura (hover), lendo o estado atual da
 *   barra, sem depender de MutationObserver (evita gaveta vazia/desatualizada).
 * - Segue a estrutura nativa do CKEditor: contêiner .cke > .cke_inner >
 *   .cke_top > .cke_toolbox > span.cke_toolbar (flutuantes que quebram linha) >
 *   span.cke_toolgroup > botões/combos, com os separadores originais; assim o
 *   skin do CKEditor aplica o mesmo visual da barra principal.
 * ------------------------------------------------------------------ */
let hideTimer = null;
const drawerItems = new WeakMap();

function ensureDrawer() {
    const all = Array.from(document.querySelectorAll(`#${DRAWER_ID}`));
    let drawer = all[0];
    all.slice(1).forEach(extra => extra.remove());
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = DRAWER_ID;
        document.body.appendChild(drawer);
    }
    if (!drawer.__superprocBound) {
        drawer.__superprocBound = true;
        drawer.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        drawer.addEventListener('mouseleave', hideDrawerSoon);
        // Não rouba o foco/seleção do editor ao clicar numa ferramenta.
        drawer.addEventListener('mousedown', event => event.preventDefault());
        drawer.addEventListener('click', event => {
            for (let node = event.target; node && node !== drawer; node = node.parentElement) {
                const item = drawerItems.get(node);
                if (item) { event.preventDefault(); event.stopPropagation(); runItem(item, node); return; }
            }
        }, true);
    }
    return drawer;
}

function hideDrawerSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(closeDrawer, 250);
}

function closeDrawer() {
    clearTimeout(hideTimer);
    document.getElementById(DRAWER_ID)?.classList.remove('superproc-drawer-open');
}

function sanitizeClone(node) {
    Array.from(node.attributes).forEach(attr => {
        if (/^on/i.test(attr.name) || /^(id|aria-labelledby|aria-describedby)$/i.test(attr.name)) node.removeAttribute(attr.name);
    });
}

function sanitizeRoot(node) {
    ['display', 'visibility', 'pointer-events', 'position', 'left', 'top', 'right', 'bottom', 'transform'].forEach(prop => node.style.removeProperty(prop));
    node.classList.remove('superproc-btn-oculto');
}

function pruneToolbar(toolbar) {
    toolbar.querySelectorAll('.cke_toolgroup').forEach(group => {
        if (!group.querySelector('.cke_button, .cke_combo, [role="button"]')) group.remove();
    });
    // Separadores soltos (início, fim ou repetidos) não fazem parte do layout nativo.
    for (let pass = 0; pass < 2; pass++) {
        toolbar.querySelectorAll('.cke_toolbar_separator').forEach(separator => {
            const previous = separator.previousElementSibling;
            const next = separator.nextElementSibling;
            if (!previous || !next || previous.classList.contains('cke_toolbar_separator') || previous.classList.contains('cke_toolbar_start')) separator.remove();
        });
    }
}

function renderDrawer() {
    const drawer = ensureDrawer();
    const catalog = scanCatalog();
    const selected = readSelected();
    const manager = document.getElementById('superproc-btn-gestor');
    const host = manager?.closest('.cke') || document.querySelector('.cke');
    drawer.replaceChildren();

    const shell = document.createElement('div');
    shell.className = `${(host?.className || 'cke cke_reset cke_chrome').replace(/\bcke_(maximized|hidden|focus)\b/g, '')} superproc-drawer-shell`;
    const inner = document.createElement('span');
    inner.className = 'cke_inner';
    const top = document.createElement('span');
    top.className = 'cke_top';
    const box = document.createElement('span');
    box.className = 'cke_toolbox';
    inner.appendChild(top);
    top.appendChild(box);
    shell.appendChild(inner);

    let total = 0;
    catalog.forEach(group => {
        const hidden = group.items.filter(item => !isSelected(item, selected));
        if (!hidden.length) return;
        const toolbar = group.toolbar.cloneNode(true);
        const originals = Array.from(group.toolbar.querySelectorAll('*'));
        const clones = Array.from(toolbar.querySelectorAll('*'));
        const position = new Map(originals.map((node, index) => [node, index]));
        const keep = [];
        group.items.forEach(item => {
            const clone = clones[position.get(item.element)];
            if (!clone) return;
            if (isSelected(item, selected)) clone.remove(); else keep.push([clone, item]);
        });
        [toolbar, ...toolbar.querySelectorAll('*')].forEach(sanitizeClone);
        sanitizeRoot(toolbar);
        toolbar.querySelectorAll('.cke_toolgroup').forEach(sanitizeRoot);
        keep.forEach(([clone, item]) => {
            sanitizeRoot(clone);
            clone.setAttribute('tabindex', '-1');
            drawerItems.set(clone, item);
        });
        pruneToolbar(toolbar);
        if (!toolbar.querySelector('.cke_button, .cke_combo, [role="button"]')) return;
        total += keep.length;
        box.appendChild(toolbar);
    });

    if (total) {
        drawer.appendChild(shell);
    } else {
        const empty = document.createElement('div');
        empty.className = 'superproc-drawer-empty';
        empty.textContent = 'Todas as ferramentas estão visíveis na barra. Clique na engrenagem para personalizar.';
        drawer.appendChild(empty);
    }
}

function findOriginal(item) {
    if (item.element?.isConnected) return item.element;
    return (item.id && document.getElementById(item.id))
        || document.querySelector(`.cke_button__${CSS.escape(item.cmd)}, .cke_combo__${CSS.escape(item.cmd)}`);
}

function visiblePanels() {
    return Array.from(document.querySelectorAll('.cke_panel, .cke_combopanel')).filter(panel => {
        const rect = panel.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(panel).display !== 'none';
    });
}

function anchorPanel(panel, rect) {
    // O botão original está oculto (0,0): reposiciona o painel nativo sob a ferramenta clicada.
    const current = panel.getBoundingClientRect();
    const wantedLeft = Math.max(4, Math.min(rect.left, window.innerWidth - current.width - 4));
    const wantedTop = Math.max(4, Math.min(rect.bottom, window.innerHeight - current.height - 4));
    const left = parseFloat(panel.style.left);
    const topValue = parseFloat(panel.style.top);
    if (!Number.isNaN(left)) panel.style.left = `${left + (wantedLeft - current.left)}px`;
    if (!Number.isNaN(topValue)) panel.style.top = `${topValue + (wantedTop - current.top)}px`;
    panel.style.setProperty('z-index', '2147483001', 'important');
}

function runItem(item, anchor) {
    const original = findOriginal(item);
    const opensPanel = !!original && (original.matches('.cke_combo, [aria-haspopup="true"]') || !!original.querySelector('[aria-haspopup="true"], .cke_combo_button'));
    const rect = anchor.getBoundingClientRect();
    const before = new Set(visiblePanels());
    try {
        if (original) {
            const target = original.matches('.cke_combo') ? (original.querySelector('.cke_combo_button') || original) : original;
            target.click();
        } else {
            for (const editor of Object.values(window.CKEDITOR?.instances || {})) {
                if (editor.commands?.[item.cmd]) { editor.execCommand(item.cmd); break; }
            }
        }
    } catch (_) { /* ferramenta indisponível no momento */ }
    if (!opensPanel) { closeDrawer(); return; }
    let tries = 0;
    const tick = () => {
        const opened = visiblePanels().filter(panel => !before.has(panel));
        if (opened.length) { opened.forEach(panel => anchorPanel(panel, rect)); return; }
        if (++tries < 15) setTimeout(tick, 40); else closeDrawer();
    };
    tick();
}

function showDrawer() {
    clearTimeout(hideTimer);
    const manager = document.getElementById('superproc-btn-gestor');
    if (!manager) return;
    const drawer = ensureDrawer();
    if (!drawer.classList.contains('superproc-drawer-open')) renderDrawer();
    const bounds = manager.getBoundingClientRect();
    drawer.style.left = `${Math.max(6, Math.min(bounds.left, window.innerWidth - Math.min(560, window.innerWidth - 12) - 6))}px`;
    drawer.style.top = `${bounds.bottom + 3}px`;
    drawer.style.maxHeight = `${Math.max(180, window.innerHeight - bounds.bottom - 12)}px`;
    drawer.classList.add('superproc-drawer-open');
}

function injectManager() {
    const root = document.querySelector('.cke_toolbox_main') || document.querySelector('.cke_toolbox');
    if (!root || document.getElementById(TOOLBAR_ID)) return;
    const toolbar = document.createElement('span');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'cke_toolbar';
    toolbar.innerHTML = `<span class="cke_toolgroup"><button type="button" id="superproc-btn-gestor" class="cke_button" title="Clique: personalizar | Hover: ferramentas ocultas"><span class="cke_button_icon">⚙</span></button></span>`;
    root.insertBefore(toolbar, root.firstChild);
    ensureDrawer(); // reutiliza a gaveta existente: nunca cria uma segunda
    const manager = toolbar.querySelector('#superproc-btn-gestor');
    manager.addEventListener('mouseenter', showDrawer);
    manager.addEventListener('mouseleave', hideDrawerSoon);
    manager.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); closeDrawer(); openConfig(); });
}

function openConfig() {
    const catalog = scanCatalog();
    const selected = readSelected();
    let modal = document.getElementById(MODAL_ID);
    if (!modal) { modal = document.createElement('div'); modal.id = MODAL_ID; document.body.appendChild(modal); }
    const groups = catalog.map((group, groupIndex) => `<section class="superproc-modal-group"><header><strong>${group.name}</strong><button type="button" data-toggle="${groupIndex}">Alternar grupo</button></header><div>${group.items.map(item => `<label><input type="checkbox" data-group="${groupIndex}" data-cmd="${item.cmd}" data-id="${item.id}" ${isSelected(item, selected) ? 'checked' : ''}><span>${item.title}</span></label>`).join('')}</div></section>`).join('');
    modal.innerHTML = `<div class="superproc-modal-card"><header><div><strong>Personalizar botões do editor</strong><p>Marque os botões que deseja manter visíveis. Os demais continuarão disponíveis na engrenagem.</p></div><button type="button" data-close>×</button></header><div class="superproc-modal-search"><input type="search" placeholder="Filtrar ferramentas" data-search></div><main>${groups}</main><footer><button type="button" data-toggle-all>Esconder todos</button><span><button type="button" data-close>Cancelar</button><button type="button" class="primary" data-save>Salvar e aplicar</button></span></footer></div>`;
    modal.classList.add('superproc-modal-open');
    const close = () => modal.classList.remove('superproc-modal-open');
    modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    modal.querySelector('[data-search]').addEventListener('input', event => {
        const term = event.target.value.toLowerCase().trim();
        modal.querySelectorAll('.superproc-modal-group label').forEach(label => { label.style.display = !term || label.textContent.toLowerCase().includes(term) ? 'flex' : 'none'; });
    });
    modal.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
        const inputs = modal.querySelectorAll(`input[data-group="${button.dataset.toggle}"]`);
        const shouldSelect = Array.from(inputs).some(input => !input.checked);
        inputs.forEach(input => { input.checked = shouldSelect; });
        updateToggleAll();
    }));
    const toggleAll = modal.querySelector('[data-toggle-all]');
    const updateToggleAll = () => {
        const inputs = Array.from(modal.querySelectorAll('input[type="checkbox"]'));
        toggleAll.textContent = inputs.every(input => input.checked) ? 'Esconder todos' : 'Mostrar todos';
    };
    toggleAll.addEventListener('click', () => {
        const inputs = modal.querySelectorAll('input[type="checkbox"]');
        const hideAll = Array.from(inputs).every(input => input.checked);
        inputs.forEach(input => { input.checked = !hideAll; });
        updateToggleAll();
    });
    modal.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', updateToggleAll));
    updateToggleAll();
    modal.querySelector('[data-save]').addEventListener('click', () => {
        const items = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.dataset.cmd || input.dataset.id);
        saveSelected(items);
        applySelection();
        close();
    });
}

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${TOOLBAR_ID}{position:relative!important}.superproc-btn-oculto{display:none!important}
        #${TOOLBAR_ID} #superproc-btn-gestor{display:flex!important;align-items:center!important;justify-content:center!important;width:28px!important;height:26px!important;padding:0!important}#${TOOLBAR_ID} #superproc-btn-gestor .cke_button_icon{display:block!important;width:20px!important;height:20px!important;margin:0!important;background-image:none!important;font:20px/20px Arial!important;text-align:center!important}
        #${TOOLBAR_ID}{visibility:visible!important;opacity:1!important}
        #${DRAWER_ID}{display:none;position:fixed;width:min(560px,calc(100vw - 12px));max-height:420px;overflow:auto;background:#fff;border:1px solid #94a3b8;border-radius:5px;box-shadow:0 8px 20px rgba(15,23,42,.25);z-index:2147483000;padding:0;box-sizing:border-box}
        #${DRAWER_ID}.superproc-drawer-open{display:block}
        #${DRAWER_ID} .superproc-drawer-shell{display:block!important;position:static!important;width:auto!important;border:0!important;box-shadow:none!important;margin:0!important}
        #${DRAWER_ID} .cke_toolbox::after{content:'';display:block;clear:both}
        #${DRAWER_ID} .cke_voice_label{display:none!important}
        #${DRAWER_ID} .superproc-drawer-empty{padding:12px;color:#64748b;font:13px Arial,sans-serif}
        #${MODAL_ID}{display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.38);font:13px Arial,sans-serif}#${MODAL_ID}.superproc-modal-open{display:flex;align-items:center;justify-content:center}.superproc-modal-card{width:min(780px,calc(100vw - 32px));height:min(700px,calc(100vh - 32px));display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;background:#fff;border-radius:7px;overflow:hidden;box-shadow:0 20px 45px rgba(15,23,42,.3)}.superproc-modal-card>header,.superproc-modal-card>footer{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.superproc-modal-card>header p{margin:4px 0 0;color:#64748b}.superproc-modal-card>header button{border:0;background:transparent;font-size:20px;cursor:pointer}.superproc-modal-search{padding:9px 16px;border-bottom:1px solid #e2e8f0}.superproc-modal-search input{box-sizing:border-box;width:100%;padding:7px;border:1px solid #94a3b8;border-radius:4px}.superproc-modal-card main{overflow:auto;padding:10px 16px}.superproc-modal-group{margin-bottom:12px;border:1px solid #e2e8f0;border-radius:4px}.superproc-modal-group header{display:flex;justify-content:space-between;padding:6px 8px;background:#f8fafc}.superproc-modal-group header button{border:0;background:none;color:#0369a1;cursor:pointer}.superproc-modal-group>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:7px}.superproc-modal-group label{display:flex;gap:6px;align-items:flex-start;min-height:25px;cursor:pointer}.superproc-modal-card footer{border-top:1px solid #e2e8f0;border-bottom:0}.superproc-modal-card footer button{padding:6px 10px;border:1px solid #94a3b8;border-radius:4px;background:#fff;cursor:pointer}.superproc-modal-card footer .primary{background:#0284c7;border-color:#0284c7;color:#fff}
    `;
    document.head.appendChild(style);
}

function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectManager(); applySelection(); });
}

export default {
    id: 'editor_limpar_painel',
    name: 'Editor - Botões Visíveis',
    category: 'Editor de Minutas',
    description: 'Gestor clássico: ocultação, gaveta de ferramentas e configuração persistente.',
    defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    async init() {
        if (window.__superprocEditorBotoesInjetado) return;
        window.__superprocEditorBotoesInjetado = true;
        injectStyle();
        schedule();
        const own = node => !!(node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.(`#${DRAWER_ID}, #${MODAL_ID}`));
        new MutationObserver(records => { if (records.some(record => !own(record.target))) schedule(); }).observe(document.documentElement, { childList:true, subtree:true });
        if (window.CKEDITOR?.on) window.CKEDITOR.on('instanceReady', schedule);
    }
};
