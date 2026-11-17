/**
 * SuperPROC - Botão Texto: atalho que abre o menu junto à seleção.
 *
 * Dois formatos guardados (por módulo, em Storage.getModuleSettings('editor_texto').atalho):
 *  - acorde de modificadores, sem tecla comum: { acorde: true, ctrl, alt, shift, meta:false } (padrão: Alt+Shift);
 *  - combinação comum (tecla física + modificadores): { code, ctrl, alt, shift, meta }, mesmas regras do Menu de Eventos.
 * Nunca configurado (undefined) = padrão; null = sem atalho (o botão da barra continua funcionando).
 */
import { avaliarTecla, normalizarSalvo as normalizarCombinacao, descrever as descreverCombinacao, ehModificador, deEvento } from './menu_eventos/atalho.js';

export const PADRAO = Object.freeze({ acorde: true, ctrl: false, alt: true, shift: true, meta: false });
// Win é do Windows; Ctrl+Alt é o AltGr dos teclados ABNT2. Sobram estes dois acordes.
const ACORDES_VALIDOS = ['alt+shift', 'ctrl+shift'];
const chaveAcorde = (a) => [a.ctrl && 'ctrl', a.alt && 'alt', a.shift && 'shift', a.meta && 'meta'].filter(Boolean).join('+');

export function motivoDeRecusaAcorde(a) {
    if (a.meta) return 'A tecla Win é do Windows. Use Alt+Shift ou Ctrl+Shift.';
    if (a.ctrl && a.alt) return 'Ctrl+Alt equivale ao AltGr nos teclados ABNT2. Use Alt+Shift ou Ctrl+Shift.';
    if ([a.ctrl, a.alt, a.shift].filter(Boolean).length < 2) return 'Segure duas teclas modificadoras ao mesmo tempo (Alt+Shift ou Ctrl+Shift) e solte, ou pressione uma tecla com Ctrl, Alt ou Win.';
    return ACORDES_VALIDOS.includes(chaveAcorde(a)) ? null : 'Use Alt+Shift ou Ctrl+Shift, ou uma tecla com Ctrl, Alt ou Win.';
}

/** Valida um valor guardado ou recebido; null se não servir. */
export function normalizar(valor) {
    if (!valor || typeof valor !== 'object') return null;
    if (valor.acorde === true) {
        const acorde = { acorde: true, ctrl: !!valor.ctrl, alt: !!valor.alt, shift: !!valor.shift, meta: !!valor.meta };
        return motivoDeRecusaAcorde(acorde) ? null : acorde;
    }
    return normalizarCombinacao(valor);
}

/** O atalho em vigor: null = sem atalho; valor ausente ou inválido = padrão. */
export function efetivo(guardado) {
    if (guardado === null) return null;
    return normalizar(guardado) || { ...PADRAO };
}

export function mesmoAtalho(a, b) {
    if (!a || !b) return false;
    if (!!a.acorde !== !!b.acorde) return false;
    return (a.acorde || a.code === b.code) && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.meta === !!b.meta;
}

export function descrever(atalho) {
    if (!atalho) return '';
    if (atalho.acorde) return [atalho.ctrl && 'Ctrl', atalho.alt && 'Alt', atalho.shift && 'Shift'].filter(Boolean).join('+');
    return descreverCombinacao(atalho);
}

/**
 * Captura no popup: aceita uma combinação com tecla (avaliada na hora) ou um acorde de modificadores
 * (decidido quando todos são soltos, pelo maior conjunto que esteve pressionado).
 * aoBaixar/aoSoltar devolvem { estado: 'aguardar' | 'ok' | 'recusado', atalho?, motivo? }.
 */
export function criarCaptura() {
    let maximo = { ctrl: false, alt: false, shift: false, meta: false };
    let houveTecla = false;
    const zerar = () => { maximo = { ctrl: false, alt: false, shift: false, meta: false }; houveTecla = false; };
    return {
        aoBaixar(evento) {
            if (!evento.code || ehModificador(evento.code)) {
                const atual = deEvento(evento);
                maximo = { ctrl: maximo.ctrl || atual.ctrl, alt: maximo.alt || atual.alt, shift: maximo.shift || atual.shift, meta: maximo.meta || atual.meta };
                return { estado: 'aguardar' };
            }
            houveTecla = true;
            return avaliarTecla(evento);
        },
        aoSoltar(evento) {
            if (houveTecla) { if (!evento.ctrlKey && !evento.altKey && !evento.shiftKey && !evento.metaKey) zerar(); return { estado: 'aguardar' }; }
            if (evento.ctrlKey || evento.altKey || evento.shiftKey || evento.metaKey) return { estado: 'aguardar' };
            const acorde = { acorde: true, ...maximo };
            zerar();
            const motivo = motivoDeRecusaAcorde(acorde);
            return motivo ? { estado: 'recusado', motivo } : { estado: 'ok', atalho: normalizar(acorde) };
        }
    };
}
