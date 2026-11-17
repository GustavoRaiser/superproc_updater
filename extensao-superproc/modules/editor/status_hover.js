/**
 * SuperPROC — Editor: Status da minuta por hover
 * O seletor nativo #statusMinutaDesejado ("Manter a minuta no status...") passa
 * a abrir as opções assim que o mouse fica sobre ele, sem precisar clicar.
 *
 * Funciona com o widget que o eproc usar no campo:
 *  - bootstrap-select, select2, chosen e jQuery UI selectmenu: aciona o próprio
 *    widget por eventos de DOM (nenhum acesso ao jQuery da página é necessário);
 *  - <select> nativo: o navegador não abre a lista por script, então é exibida
 *    uma lista equivalente sob o campo; escolher um item altera o valor e
 *    dispara input/change, como o clique nativo.
 * Delegação de eventos no document: sobrevive a reconstruções da barra.
 */

const SELECT_ID = 'statusMinutaDesejado';
const MENU_ID = 'superproc-status-hover-menu';
const STYLE_ID = 'superproc-status-hover-style';
const OPEN_DELAY_MS = 40;
const CLOSE_DELAY_MS = 260;
let openTimer = null;
let closeTimer = null;

const WIDGETS = [
    { kind: 'bootstrap-select', selector: '.bootstrap-select', toggle: '.dropdown-toggle', isOpen: root => root.classList.contains('open') || root.classList.contains('show') || !!root.querySelector('.dropdown-menu.show, .dropdown-menu.open'), act: toggle => toggle.click() },
    { kind: 'select2', selector: '.select2-container', toggle: '.select2-selection', isOpen: root => root.classList.contains('select2-container--open'), act: toggle => fireMouse(toggle, 'mousedown') },
    { kind: 'chosen', selector: '.chosen-container', toggle: '.chosen-single', isOpen: root => root.classList.contains('chosen-with-drop'), act: toggle => fireMouse(toggle, 'mousedown') },
    { kind: 'ui-selectmenu', selector: '.ui-selectmenu-button', toggle: null, isOpen: root => root.classList.contains('ui-selectmenu-button-open'), act: toggle => toggle.click() }
];

function fireMouse(element, type) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
}

function getSelect() {
    return document.getElementById(SELECT_ID);
}

/** Elementos que representam o campo na tela (widget(s) e/ou o próprio select). */
function fieldRoots(select) {
    const roots = [];
    const add = element => { if (element && !roots.includes(element)) roots.push(element); };
    WIDGETS.forEach(widget => {
        add(select.closest(widget.selector));
        [select.previousElementSibling, select.nextElementSibling].forEach(sibling => { if (sibling?.matches?.(widget.selector)) add(sibling); });
        select.parentElement?.querySelectorAll(`:scope > ${widget.selector}`).forEach(add);
    });
    add(document.getElementById(`${select.id}-button`)); // jQuery UI selectmenu
    add(select);
    return roots;
}

function widgetFor(root) {
    return WIDGETS.find(widget => root.matches(widget.selector)) || null;
}

function toggleOf(root, widget) {
    return widget.toggle ? (root.querySelector(widget.toggle) || root) : root;
}

/* ---------- Lista própria (select nativo) ---------- */
function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `#${MENU_ID}{position:fixed;z-index:2147483000;box-sizing:border-box;max-height:min(360px,70vh);overflow:auto;background:#fff;border:1px solid #94a3b8;border-radius:4px;box-shadow:0 6px 16px rgba(15,23,42,.25);padding:2px 0;font:13px Arial,sans-serif}
#${MENU_ID} button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:5px 10px;font:inherit;color:#0f172a;cursor:pointer;white-space:nowrap}
#${MENU_ID} button:hover{background:#e0f2fe}#${MENU_ID} button[aria-selected="true"]{background:#0284c7;color:#fff}#${MENU_ID} button:disabled{color:#94a3b8;cursor:not-allowed}`;
    document.head.appendChild(style);
}

function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
}

function openMenu(select) {
    if (document.getElementById(MENU_ID)) return;
    ensureStyle();
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'listbox');
    Array.from(select.options).forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.disabled = option.disabled;
        item.textContent = option.textContent.trim();
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closeMenu();
        });
        menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const bounds = select.getBoundingClientRect();
    menu.style.minWidth = `${bounds.width}px`;
    menu.style.left = `${Math.max(4, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${bounds.bottom}px`;
    menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/* ---------- Abrir / fechar ---------- */
function isHovered(select) {
    return fieldRoots(select).some(root => root.matches(':hover'))
        || !!document.querySelector(MENU_SELECTOR.split(',').map(part => `${part.trim()}:hover`).join(','));
}

function openField(select, root) {
    if (select.disabled) return;
    const widget = widgetFor(root);
    if (widget) {
        if (!widget.isOpen(root)) widget.act(toggleOf(root, widget));
    } else {
        openMenu(select);
    }
}

function closeField(select) {
    fieldRoots(select).forEach(root => {
        const widget = widgetFor(root);
        if (widget && widget.isOpen(root)) widget.act(toggleOf(root, widget));
    });
    closeMenu();
}

const MENU_SELECTOR = `#${MENU_ID}, .bootstrap-select .dropdown-menu, body > .dropdown-menu, .select2-dropdown, .chosen-drop, .ui-selectmenu-menu`;

function rootFromTarget(select, target) {
    return target instanceof Element ? fieldRoots(select).find(root => root.contains(target)) || null : null;
}

/** O nó pertence ao campo ou à lista de opções dele? */
function belongs(select, node) {
    return node instanceof Element && (!!rootFromTarget(select, node) || !!node.closest(MENU_SELECTOR));
}

function onOver(event) {
    const select = getSelect();
    if (!select || !belongs(select, event.target)) return;
    clearTimeout(closeTimer);
    const root = rootFromTarget(select, event.target);
    if (!root || (event.relatedTarget instanceof Node && root.contains(event.relatedTarget))) return;
    clearTimeout(openTimer);
    openTimer = setTimeout(() => openField(select, root), OPEN_DELAY_MS);
}

function onOut(event) {
    const select = getSelect();
    if (!select || !belongs(select, event.target) || belongs(select, event.relatedTarget)) return;
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!isHovered(select)) closeField(select); }, CLOSE_DELAY_MS);
}

/** Com lista própria, um clique no select nativo não pode abrir também a lista do navegador. */
function onMouseDown(event) {
    const select = getSelect();
    if (!select || event.target !== select || !document.getElementById(MENU_ID)) return;
    event.preventDefault();
}

export default {
    id: 'editor_status_hover',
    name: 'Editor - Status da Minuta por Hover',
    category: 'Editor de Minutas',
    description: 'Abre as opções do campo "Manter a minuta no status..." ao passar o mouse.',
    defaultEnabled: false,
    matches: (url, params) => params.get('acao') === 'minuta_editar' || url.pathname.includes('minuta_editar'),
    async init() {
        if (window.__superprocStatusHoverInjetado) return;
        window.__superprocStatusHoverInjetado = true;
        document.addEventListener('mouseover', onOver, true);
        document.addEventListener('mouseout', onOut, true);
        document.addEventListener('mousedown', onMouseDown, true);
        window.addEventListener('blur', closeMenu);
    }
};
