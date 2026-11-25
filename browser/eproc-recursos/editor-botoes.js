// Editor: Botões Visíveis, portado de extensao-superproc/modules/editor/limpar_painel.js (id da extensão: editor_limpar_painel).
// Roda no navegador SuperPROC, num mundo isolado, só na tela acao=minuta_editar (eproc-recursos.js). Engrenagem na barra do
// CKEditor, gaveta por hover com as ferramentas ocultas e modal para escolher o que fica visível.
// A preferência fica na MESMA chave de localStorage da extensão (superproc_editor_botoes_ocultos_v3): quem escolhe num lado vale
// no outro. Com o navegador controlando o módulo, a extensão o deixa parado (data-superproc-navegador-modulos).
// Como na extensão, o código fica num mundo isolado: window.CKEDITOR não existe aqui; a observação do DOM e o clique nos botões
// originais fazem o trabalho.
if (window.__superprocEditorBotoesInjetado) return;
window.__superprocEditorBotoesInjetado = true;

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

// ---- Painel "Botões do editor" ----
// Grade com o ícone de cada ferramenta, agrupada como na barra. Cada ícone é um interruptor: ligado = visível na barra; desligado
// fica cinza, translúcido e com borda tracejada. O olho de cada grupo liga ou desliga o grupo inteiro; o botão do rodapé esconde
// todos (se houver algum à mostra) ou mostra todos (só quando todos estão escondidos). Nada muda na barra antes de "Salvar e aplicar".
const SVG_OLHO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M21 12c-2.7 4.7-6 7-9 7s-6.3-2.3-9-7c2.7-4.7 6-7 9-7s6.3 2.3 9 7z"/></svg>';
const SVG_OLHO_FECHADO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.4A9.7 9.7 0 0 1 12 5c4 0 7.3 2.4 9 7a13 13 0 0 1-2.4 3.6M6.6 6.6A13 13 0 0 0 3 12c1.7 4.6 5 7 9 7a9.7 9.7 0 0 0 4-.9"/></svg>';
const keyOf = item => item.cmd || item.id;

function nameOf(item) {
    if (item.element.classList.contains('cke_combo')) {
        const t = item.element.querySelector('.cke_combo_button')?.title || item.element.querySelector('.cke_combo_label')?.textContent;
        if (t && t.trim()) return cleanTitle(t).replace(/\.{3}$/, '');
    }
    return item.title;
}

// Cópia visual do ícone da barra: os botões do CKEditor desenham o ícone como imagem de fundo (ou <img>, nos de extensão).
function iconOf(item) {
    const src = item.element.querySelector('.cke_button_icon');
    if (!src) return null;
    const span = document.createElement('span');
    span.className = 'sp-eb-ic';
    span.setAttribute('aria-hidden', 'true');
    const img = src.querySelector('img');
    if (img && img.src) {
        const copy = document.createElement('img');
        copy.src = img.src;
        copy.alt = '';
        span.appendChild(copy);
        return span;
    }
    const cs = getComputedStyle(src);
    if (!cs.backgroundImage || cs.backgroundImage === 'none') return null;
    span.style.backgroundImage = cs.backgroundImage;
    span.style.backgroundPosition = cs.backgroundPosition;
    span.style.backgroundSize = cs.backgroundSize;
    span.style.backgroundRepeat = 'no-repeat';
    return span;
}

// Título do grupo: quando o nome é mais largo que a fileira de botões, troca por uma forma mais curta. O nome completo fica no
// tooltip e no rótulo do olho. Candidatos, do mais fiel ao mais curto: nome; abreviações; sem conectivos; primeira palavra útil.
const NOMES_CURTOS = {
    'transf. de caracteres': 'Caixa', 'salvarstatusminuta': 'Status', 'formatação de caracteres': 'Formato', 'copiar e colar': 'Colar',
    'desfazer e refazer': 'Desfazer', 'encontrar e substituir': 'Buscar', 'inserção de texto': 'Texto'
};
const PALAVRAS_CURTAS = { caracteres: 'Caract.', formatação: 'Format.', substituir: 'Subst.', encontrar: 'Achar', inserção: 'Inserir', transformação: 'Transf.' };
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'ao', 'em', 'no', 'na', 'como']);
function candidatosDeTitulo(nome) {
    const palavras = nome.replace(/([a-zà-ú])([A-ZÀ-Ú])/g, '$1 $2').split(/\s+/).filter(Boolean);
    const lista = [nome];
    const curto = NOMES_CURTOS[nome.toLowerCase()];
    if (curto) lista.push(curto);
    const abreviadas = palavras.map(p => PALAVRAS_CURTAS[p.toLowerCase()] || p);
    const uteis = palavras.filter(p => !CONECTIVOS.has(p.toLowerCase()));
    lista.push(abreviadas.join(' '), abreviadas.filter(p => !CONECTIVOS.has(p.toLowerCase())).join(' '), uteis.slice(0, 2).join(' '), uteis[0] || palavras[0] || nome);
    return lista.filter((t, i) => t && lista.indexOf(t) === i);
}
function compactarTitulos(titulos) {
    titulos.forEach(({ group, h3 }) => {
        const section = h3.closest('.sp-eb-grupo');
        const botoes = Array.from(section.querySelectorAll('.sp-eb-item'));
        const olho = section.querySelector('.sp-eb-olho');
        if (!botoes.length || !olho) return;
        // Largura da fileira de botões menos o olho e o vão. O grupo fica sempre numa linha só, com a largura que os botões pedirem;
        // só quebra por dentro se, sozinho, for mais largo que o painel (telas estreitas).
        const inner = (section.parentElement.clientWidth || 328) - 40; // largura útil do painel: é o teto de um grupo
        const fileira = Math.min(inner, botoes.reduce((soma, b) => soma + b.offsetWidth + 3, -3));
        const orcamento = fileira - olho.offsetWidth - 4;
        // O primeiro candidato que cabe na fileira; se nenhum couber, o mais curto (o grupo alarga só o necessário).
        const candidatos = candidatosDeTitulo(group.name);
        let escolhido = null;
        for (const candidato of candidatos) {
            h3.textContent = candidato;
            if (h3.scrollWidth <= orcamento) { escolhido = candidato; break; }
        }
        if (escolhido === null) h3.textContent = candidatos.reduce((menor, c) => (c.length < menor.length ? c : menor));
        if (h3.textContent !== group.name) h3.title = group.name; else h3.removeAttribute('title');
    });
}

function openConfig() {
    const catalog = scanCatalog();
    const selected = readSelected();
    let modal = document.getElementById(MODAL_ID);
    if (modal && modal.tagName !== 'DIALOG') { modal.remove(); modal = null; }
    if (!modal) { modal = document.createElement('dialog'); modal.id = MODAL_ID; document.body.appendChild(modal); }
    modal.setAttribute('aria-labelledby', 'sp-eb-titulo');
    modal.replaceChildren();

    const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
    const button = (className, text) => { const b = make('button', 'sp-eb-b ' + className, text); b.type = 'button'; return b; };
    const visible = new Set();
    const all = [];
    catalog.forEach(group => group.items.forEach(item => { all.push(item); if (isSelected(item, selected)) visible.add(keyOf(item)); }));

    const top = make('div', 'sp-eb-topo');
    const heading = make('div');
    const title = make('h2', '', 'Botões do editor');
    title.id = 'sp-eb-titulo';
    heading.append(title, make('p', '', 'Clique num botão para ocultá-lo ou mostrá-lo na barra. Os ocultos continuam na gaveta da engrenagem.'));
    const closeBtn = button('sp-eb-fechar', '×');
    closeBtn.setAttribute('aria-label', 'Fechar sem salvar');
    top.append(heading, closeBtn);

    const body = make('div', 'sp-eb-corpo');
    const status = make('span', 'sp-eb-status');
    const refs = []; // { item, el } de cada interruptor
    const eyes = []; // { group, el } de cada olho
    const titulos = []; // { group, h3 } de cada grupo, para compactar o nome conforme a largura dos botões
    catalog.forEach(group => {
        const section = make('section', 'sp-eb-grupo');
        const head = make('header');
        const eye = button('sp-eb-olho');
        const h3 = make('h3', '', group.name);
        head.append(h3, eye);
        titulos.push({ group, h3 });
        const list = make('div', 'sp-eb-itens');
        group.items.forEach(item => {
            const name = nameOf(item);
            const b = button('sp-eb-item');
            b.setAttribute('role', 'switch');
            b.setAttribute('aria-label', name);
            b.title = name;
            b.appendChild(iconOf(item) || make('span', 'sp-eb-tx', name));
            b.addEventListener('click', () => { const k = keyOf(item); if (visible.has(k)) visible.delete(k); else visible.add(k); paint(); describe(item); });
            b.addEventListener('mouseenter', () => describe(item));
            b.addEventListener('focus', () => describe(item));
            b.addEventListener('mouseleave', () => describe(null));
            b.addEventListener('blur', () => describe(null));
            refs.push({ item, el: b });
            list.appendChild(b);
        });
        eye.addEventListener('click', () => {
            const some = group.items.some(item => visible.has(keyOf(item)));
            group.items.forEach(item => { if (some) visible.delete(keyOf(item)); else visible.add(keyOf(item)); });
            paint();
        });
        eyes.push({ group, el: eye });
        section.append(head, list);
        body.appendChild(section);
    });

    const toggleAll = button('sp-eb-acao');
    const cancelBtn = button('sp-eb-acao', 'Cancelar');
    const saveBtn = button('sp-eb-acao sp-eb-primario', 'Salvar e aplicar');
    const foot = make('div', 'sp-eb-pe');
    foot.append(status, toggleAll, cancelBtn, saveBtn);
    modal.append(top, body, foot);

    let described = null;
    function describe(item) {
        described = item;
        const total = all.filter(x => visible.has(keyOf(x))).length;
        status.textContent = item ? `${nameOf(item)}: ${visible.has(keyOf(item)) ? 'visível na barra' : 'oculto (fica na gaveta)'}` : `${total} de ${all.length} visíveis na barra`;
    }
    function paint() {
        refs.forEach(({ item, el }) => el.setAttribute('aria-checked', String(visible.has(keyOf(item)))));
        eyes.forEach(({ group, el }) => {
            const some = group.items.some(item => visible.has(keyOf(item)));
            el.innerHTML = some ? SVG_OLHO : SVG_OLHO_FECHADO;
            const label = (some ? 'Ocultar todos de ' : 'Mostrar todos de ') + group.name;
            el.setAttribute('aria-label', label);
            el.title = label;
        });
        toggleAll.textContent = all.some(item => visible.has(keyOf(item))) ? 'Esconder todos' : 'Mostrar todos';
        describe(described);
    }
    toggleAll.addEventListener('click', () => {
        const some = all.some(item => visible.has(keyOf(item)));
        visible.clear();
        if (!some) all.forEach(item => visible.add(keyOf(item)));
        paint();
    });
    const close = () => { if (modal.open) modal.close(); };
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', () => { saveSelected([...visible]); applySelection(); close(); });
    paint();
    if (!modal.open) modal.showModal();
    compactarTitulos(titulos);
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
        #${MODAL_ID}{padding:0;border:1px solid #64748b;border-radius:8px;width:min(1000px,calc(100vw - 32px));max-height:calc(100vh - 32px);color:#1e293b;background:#fff;font:13px/1.4 Arial,sans-serif;overflow:hidden}
        #${MODAL_ID}[open]{display:flex;flex-direction:column}
        #${MODAL_ID}::backdrop{background:rgba(15,23,42,.38)}
        #${MODAL_ID} *{box-sizing:border-box}
        #${MODAL_ID} .sp-eb-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #e2e8f0}
        #${MODAL_ID} .sp-eb-topo h2{margin:0;padding:0;font:600 15px/1.3 Arial,sans-serif;color:#1e293b}
        #${MODAL_ID} .sp-eb-topo p{margin:2px 0 0;font-size:12px;color:#475569}
        #${MODAL_ID} .sp-eb-corpo{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:10px 14px;display:flex;flex-wrap:wrap;align-items:stretch;align-content:flex-start;gap:6px}
        #${MODAL_ID} .sp-eb-grupo{flex:0 0 auto;max-width:100%;min-width:0;margin:0;padding:3px 5px 5px;border:1px solid #cbd5e1;border-radius:6px}
        #${MODAL_ID} .sp-eb-grupo header{display:flex;align-items:center;justify-content:space-between;gap:4px;margin:0 0 3px;padding:0;background:none;border:0}
        #${MODAL_ID} .sp-eb-grupo h3{margin:0;padding:0;font:600 12px/1.3 Arial,sans-serif;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
        #${MODAL_ID} .sp-eb-itens{display:flex;flex-wrap:wrap;gap:3px}
        #${MODAL_ID} .sp-eb-b{display:inline-flex;align-items:center;justify-content:center;min-width:28px;min-height:28px;margin:0;padding:0 6px;border:1px solid #64748b;border-radius:4px;background:#fff;color:#1e293b;font:12px/1.2 Arial,sans-serif;text-align:left;cursor:pointer}
        #${MODAL_ID} .sp-eb-b:focus-visible{outline:2px solid #0b6e99;outline-offset:2px}
        #${MODAL_ID} .sp-eb-item{padding:5px}
        #${MODAL_ID} .sp-eb-item[aria-checked="false"]{border-style:dashed;background:#f1f5f9}
        #${MODAL_ID} .sp-eb-item[aria-checked="false"] .sp-eb-ic{filter:grayscale(1);opacity:.45}
        #${MODAL_ID} .sp-eb-item[aria-checked="false"] .sp-eb-tx{text-decoration:line-through;color:#475569}
        #${MODAL_ID} .sp-eb-ic{display:block;width:16px;height:16px}
        #${MODAL_ID} .sp-eb-ic img{display:block;width:16px;height:16px}
        #${MODAL_ID} .sp-eb-olho{min-width:22px;min-height:22px;flex:0 0 auto;padding:0;border-color:transparent;background:none;color:#475569}
        #${MODAL_ID} .sp-eb-fechar{border-color:transparent;background:none;font-size:20px;line-height:1}
        #${MODAL_ID} .sp-eb-pe{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid #e2e8f0;background:#f8fafc}
        #${MODAL_ID} .sp-eb-status{flex:1 1 200px;min-width:0;color:#475569;overflow-wrap:anywhere}
        #${MODAL_ID} .sp-eb-acao{min-height:32px;padding:0 12px}
        #${MODAL_ID} .sp-eb-primario{background:#0369a1;border-color:#0369a1;color:#fff}
        @media (hover:hover){#${MODAL_ID} .sp-eb-b:hover{background:#e2e8f0}#${MODAL_ID} .sp-eb-primario:hover{background:#075985}}
    `;
    document.head.appendChild(style);
}

function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; injectManager(); applySelection(); });
}

injectStyle();
schedule();
const own = node => !!(node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.(`#${DRAWER_ID}, #${MODAL_ID}`));
new MutationObserver(records => { if (records.some(record => !own(record.target))) schedule(); }).observe(document.documentElement, { childList: true, subtree: true });
