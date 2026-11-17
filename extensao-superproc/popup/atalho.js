/**
 * Popup - memorização do atalho de teclado de um módulo (registry: `atalho: { rotulo }`).
 * Botão "Memorizar atalho" (captura a próxima combinação), lixeira "esquecer" e popovers explicativos.
 */
import { Storage } from '../core/storage.js';
import { avaliarTecla, descrever, normalizarSalvo } from '../modules/editor/menu_eventos/atalho.js';
import * as Texto from '../modules/editor/texto_atalho.js';

let popover = null;
let popoverAtivo = false;

function mostrarPopover(alvo) {
    const texto = alvo.getAttribute('data-popover');
    if (!texto) return;
    if (!popover) {
        popover = document.createElement('div');
        popover.className = 'sp-popover';
        popover.setAttribute('role', 'tooltip');
        document.body.append(popover);
    }
    popover.textContent = texto;
    popover.style.display = 'block';
    const caixa = alvo.getBoundingClientRect();
    const largura = popover.offsetWidth;
    const esquerda = Math.max(8, Math.min(caixa.left + caixa.width / 2 - largura / 2, document.documentElement.clientWidth - largura - 8));
    const acima = caixa.top - popover.offsetHeight - 8;
    popover.style.left = `${esquerda}px`;
    popover.style.top = `${acima >= 8 ? acima : caixa.bottom + 8}px`;
    alvo.setAttribute('aria-describedby', 'sp-popover-ativo');
    popover.id = 'sp-popover-ativo';
}

function esconderPopover() {
    if (popover) popover.style.display = 'none';
}

function ativarPopovers() {
    if (popoverAtivo) return;
    popoverAtivo = true;
    const alvoDe = (e) => (e.target instanceof Element ? e.target.closest('[data-popover]') : null);
    document.addEventListener('mouseover', (e) => { const alvo = alvoDe(e); if (alvo) mostrarPopover(alvo); });
    document.addEventListener('mouseout', (e) => { if (alvoDe(e)) esconderPopover(); });
    document.addEventListener('focusin', (e) => { const alvo = alvoDe(e); if (alvo) mostrarPopover(alvo); });
    document.addEventListener('focusout', esconderPopover);
}

const TEXTO_MEMORIZAR = 'Clique aqui e, em seguida, pressione a combinação de teclas que você quer usar para abrir o menu rápido de eventos (ex.: Ctrl+Shift+E). Use Ctrl, Alt ou Win junto com outra tecla. Evite Ctrl+Alt: em teclados ABNT2 ele equivale ao AltGr. Esc cancela.';
const TEXTO_ESQUECER = 'Apaga o atalho memorizado. O menu deixa de abrir pelo teclado até você memorizar outro atalho.';
const TEXTO_ATALHO = 'Combinação que abre o menu quando você está no editor da minuta.';

// Módulo com `atalho.acorde` (Botão Texto): aceita acorde de modificadores (padrão Alt+Shift), volta ao padrão e abre só com texto selecionado.
const TEXTOS_TEXTO = {
    memorizar: 'Clique aqui e, em seguida, segure Alt+Shift (ou Ctrl+Shift) e solte, ou pressione uma tecla com Ctrl, Alt ou Win (ex.: Ctrl+Shift+J). Evite Ctrl+Alt: em teclados ABNT2 ele equivale ao AltGr. Esc cancela.',
    esquecer: 'Apaga o atalho. O menu deixa de abrir pelo teclado, mas o botão Texto da barra do editor continua funcionando.',
    atalho: 'Com texto selecionado na minuta, esta combinação abre o menu do botão Texto junto à seleção. O padrão é Alt+Shift.',
    padrao: 'Volta ao atalho de fábrica: Alt+Shift.'
};

function elemento(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
}

export async function renderAtalho(card, mod) {
    ativarPopovers();
    const config = await Storage.getModuleSettings(mod.id);
    const ehTexto = !!mod.atalho.acorde;
    const descreverAtalho = ehTexto ? Texto.descrever : descrever;
    let atual = ehTexto ? Texto.efetivo(config?.atalho) : normalizarSalvo(config?.atalho);
    let capturando = false;
    let captura = null;

    const linha = elemento('div', 'atalho-linha');
    const rotulo = elemento('span', 'atalho-rotulo', `${mod.atalho.rotulo || 'Atalho'}:`);
    const chip = elemento('span', 'atalho-chip');
    chip.setAttribute('data-popover', ehTexto ? TEXTOS_TEXTO.atalho : TEXTO_ATALHO);
    chip.tabIndex = 0;
    const memorizar = elemento('button', 'atalho-btn', 'Memorizar atalho');
    memorizar.type = 'button';
    memorizar.setAttribute('data-popover', ehTexto ? TEXTOS_TEXTO.memorizar : TEXTO_MEMORIZAR);
    const esquecer = elemento('button', 'atalho-btn atalho-lixeira', '🗑');
    esquecer.type = 'button';
    esquecer.setAttribute('aria-label', 'Esquecer o atalho');
    esquecer.setAttribute('data-popover', ehTexto ? TEXTOS_TEXTO.esquecer : TEXTO_ESQUECER);
    const mensagem = elemento('div', 'atalho-msg');
    mensagem.setAttribute('role', 'status');
    const padrao = ehTexto ? elemento('button', 'atalho-btn', 'Padrão') : null;
    if (padrao) { padrao.type = 'button'; padrao.setAttribute('data-popover', TEXTOS_TEXTO.padrao); }
    linha.append(rotulo, chip, memorizar, ...(padrao ? [padrao] : []), esquecer, mensagem);
    card.append(linha);

    function desenhar() {
        const ePadrao = ehTexto && Texto.mesmoAtalho(atual, Texto.PADRAO);
        chip.textContent = capturando ? 'Pressione a combinação…' : (atual ? descreverAtalho(atual) + (ePadrao ? ' (padrão)' : '') : 'nenhum');
        if (padrao) padrao.disabled = capturando || ePadrao;
        chip.classList.toggle('vazio', !atual && !capturando);
        chip.classList.toggle('capturando', capturando);
        memorizar.textContent = capturando ? 'Cancelar' : (atual ? 'Trocar atalho' : 'Memorizar atalho');
        esquecer.disabled = !atual || capturando;
    }
    const avisar = (texto, erro = false) => { mensagem.textContent = texto; mensagem.classList.toggle('erro', erro); };

    async function gravar(valor) {
        await Storage.setModuleSettings(mod.id, { atalho: valor });
        atual = valor;
    }

    function tratar(resultado) {
        if (resultado.estado === 'aguardar') return;
        if (resultado.estado === 'recusado') { avisar(resultado.motivo, true); return; }
        parar();
        gravar(resultado.atalho)
            .then(() => { avisar(`Atalho memorizado: ${descreverAtalho(resultado.atalho)}. Vale nas telas abertas ao voltar para elas.`); desenhar(); })
            .catch((erro) => avisar(`Não foi possível salvar: ${erro.message}`, true));
    }
    function aoTecla(evento) {
        evento.preventDefault();
        evento.stopPropagation();
        if (evento.code === 'Escape') { parar(); avisar('Memorização cancelada.'); return; }
        tratar(captura ? captura.aoBaixar(evento) : avaliarTecla(evento));
    }
    function aoSoltar(evento) {
        if (!captura) return;
        evento.preventDefault();
        evento.stopPropagation();
        tratar(captura.aoSoltar(evento));
    }

    function iniciar() {
        capturando = true;
        captura = ehTexto ? Texto.criarCaptura() : null;
        avisar(ehTexto ? 'Pressione a combinação desejada: uma tecla com Ctrl/Alt/Win, ou segure Alt+Shift e solte (Esc cancela).' : 'Pressione a combinação desejada (Esc cancela).');
        document.addEventListener('keydown', aoTecla, true);
        if (captura) document.addEventListener('keyup', aoSoltar, true);
        desenhar();
    }
    function parar() {
        capturando = false;
        captura = null;
        document.removeEventListener('keydown', aoTecla, true);
        document.removeEventListener('keyup', aoSoltar, true);
        desenhar();
    }

    memorizar.addEventListener('click', () => { if (capturando) { parar(); avisar('Memorização cancelada.'); } else iniciar(); });
    esquecer.addEventListener('click', () => {
        gravar(null)
            .then(() => { avisar(ehTexto ? 'Atalho esquecido. O menu só abre pelo botão Texto da barra até você memorizar outro ou voltar ao padrão.' : 'Atalho esquecido. O menu não abre pelo teclado até memorizar outro.'); desenhar(); })
            .catch((erro) => avisar(`Não foi possível esquecer: ${erro.message}`, true));
    });
    if (padrao) padrao.addEventListener('click', () => {
        gravar({ ...Texto.PADRAO })
            .then(() => { avisar(`Atalho padrão restaurado: ${Texto.descrever(Texto.PADRAO)}.`); desenhar(); })
            .catch((erro) => avisar(`Não foi possível restaurar: ${erro.message}`, true));
    });
    desenhar();
}
