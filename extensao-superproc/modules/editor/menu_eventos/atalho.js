/**
 * SuperPROC - Menu Rápido de Eventos: atalho de teclado escolhido pelo usuário.
 * Guarda a tecla física (event.code) + modificadores, independente do idioma do teclado.
 */
const MODIFICADORES = new Set([
    'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight',
    'MetaLeft', 'MetaRight', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'OS'
]);

/** Combinações que o navegador (host) ou o editor já usam: não podem ser memorizadas. */
const RESERVADOS = new Set([
    'Ctrl+KeyC', 'Ctrl+KeyV', 'Ctrl+KeyX', 'Ctrl+KeyZ', 'Ctrl+KeyY', 'Ctrl+KeyA', 'Ctrl+KeyS',
    'Ctrl+KeyP', 'Ctrl+KeyF', 'Ctrl+KeyW', 'Ctrl+KeyT', 'Ctrl+KeyN', 'Ctrl+KeyR', 'Ctrl+KeyL',
    'Ctrl+Shift+KeyW', 'Ctrl+Shift+KeyT', 'Alt+ArrowLeft', 'Alt+ArrowRight',
    'F5', 'F11', 'F12'
]);

const TECLA_DE_TEXTO = /^(Key|Digit|Numpad|Space$|Minus$|Equal$|Bracket|Semicolon$|Quote$|Backquote$|Backslash$|Comma$|Period$|Slash$|Intl)/;
const TECLA_DE_FUNCAO = /^F([1-9]|1[0-2])$/;

export const ehModificador = (code) => MODIFICADORES.has(code);

export function deEvento(evento) {
    return {
        code: evento.code,
        ctrl: !!evento.ctrlKey,
        alt: !!evento.altKey,
        shift: !!evento.shiftKey,
        meta: !!evento.metaKey
    };
}

export function combina(evento, atalho) {
    return !!atalho
        && evento.code === atalho.code
        && !!evento.ctrlKey === !!atalho.ctrl
        && !!evento.altKey === !!atalho.alt
        && !!evento.shiftKey === !!atalho.shift
        && !!evento.metaKey === !!atalho.meta;
}

function chave(atalho) {
    return `${atalho.ctrl ? 'Ctrl+' : ''}${atalho.alt ? 'Alt+' : ''}${atalho.shift ? 'Shift+' : ''}${atalho.meta ? 'Meta+' : ''}${atalho.code}`;
}

const NOMES = {
    Space: 'Espaço', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backslash: '\\', Comma: ',', Period: '.', Slash: '/', PageUp: 'PgUp', PageDown: 'PgDn'
};

export function nomeDaTecla(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
    return NOMES[code] || code;
}

export function descrever(atalho) {
    if (!atalho) return '';
    const partes = [];
    if (atalho.ctrl) partes.push('Ctrl');
    if (atalho.alt) partes.push('Alt');
    if (atalho.shift) partes.push('Shift');
    if (atalho.meta) partes.push('Win');
    partes.push(nomeDaTecla(atalho.code));
    return partes.join('+');
}

/** Explica por que o atalho não serve; null se serve. */
export function motivoDeRecusa(atalho) {
    if (RESERVADOS.has(chave(atalho))) return 'Esse atalho já é usado pelo navegador ou pelo editor. Escolha outro.';
    const temModificador = atalho.ctrl || atalho.alt || atalho.meta;
    if (TECLA_DE_TEXTO.test(atalho.code)) {
        if (!temModificador) return 'Use Ctrl, Alt ou Win junto com a tecla; só a letra (ou com Shift) digitaria no texto.';
        return null;
    }
    if (TECLA_DE_FUNCAO.test(atalho.code)) return null;
    if (!temModificador && !atalho.shift) return 'Teclas de edição e navegação precisam de Ctrl, Alt ou Win junto.';
    return null;
}

/** Avalia uma tecla pressionada durante a memorização. */
export function avaliarTecla(evento) {
    if (ehModificador(evento.code) || !evento.code) return { estado: 'aguardar' };
    const atalho = deEvento(evento);
    const motivo = motivoDeRecusa(atalho);
    return motivo ? { estado: 'recusado', motivo } : { estado: 'ok', atalho };
}

/** Valida o que veio do armazenamento (pode ter sido importado de um perfil). */
export function normalizarSalvo(valor) {
    if (!valor || typeof valor !== 'object') return null;
    if (typeof valor.code !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(valor.code) || ehModificador(valor.code)) return null;
    const atalho = { code: valor.code, ctrl: !!valor.ctrl, alt: !!valor.alt, shift: !!valor.shift, meta: !!valor.meta };
    return motivoDeRecusa(atalho) ? null : atalho;
}
