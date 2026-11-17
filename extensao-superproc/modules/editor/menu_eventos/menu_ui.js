/**
 * SuperPROC - Menu Rápido de Eventos: interface (Shadow DOM, isolada do CSS do eproc).
 * Colunas deslizantes: só as duas últimas ficam visíveis; as anteriores permanecem na pilha.
 */
import { indexarEventos, digitoDaTecla, acrescentarDigito, acrescentarSeparador, ehTeclaSeparador, textoExibido, consultarEvento, resumoDosEventos, indiceInicialDaLista } from './logica.js';

/** Teclas do campo do número que (num evento com vários documentos) abrem a lista já posicionada. */
const TECLA_PARA_POSICAO = { KeyW: 'ultimo', ArrowUp: 'ultimo', KeyS: 'segundo', ArrowDown: 'segundo', KeyD: 'meio' };

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.fundo { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 23, 42, .22);
  font: 12px/1.15 system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; outline: none; }
/* Horizontal: centrado na janela. Vertical: o centro fica na linha do cursor (top definido por posicionar()). */
.palco { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); outline: none;
  width: min(300px, calc(100vw - 16px)); }
.campo { background: #fff; border: 1px solid #0284c7; border-radius: 8px; padding: 8px 12px 9px;
  box-shadow: 0 6px 12px -5px rgba(2, 132, 199, .45); }
.campo .rotulo { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; font-weight: 600; color: #475569; }
.campo .resumo { font-weight: 500; color: #64748b; }
.campo .numero { margin-top: 3px; height: 34px; display: flex; align-items: center; font-size: 26px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: #0c4a6e; }
.campo .numero.vazio { font-size: 13px; font-weight: 500; color: #94a3b8; }
.campo .cursor { display: inline-block; width: 2px; height: 26px; margin-left: 2px; background: #0284c7; animation: pisca 1s steps(1) infinite; }
.campo .previa { margin-top: 3px; min-height: 16px; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #334155; }
.campo .previa .desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campo .previa .docs { font-size: 9.5px; padding: 0 6px; border-radius: 8px; background: #e0f2fe; color: #0c4a6e; white-space: nowrap; }
.campo .previa.erro { color: #b91c1c; }
.campo .previa.aviso { color: #475569; white-space: normal; line-height: 1.3; }
.col { margin-top: 6px; display: flex; flex-direction: column; overflow: hidden; max-height: 50vh;
  background: #fff; border: 1px solid #cbd5e1; border-radius: 7px; box-shadow: 0 6px 12px -5px rgba(15, 23, 42, .35); }
.col .cab { height: 22px; flex: 0 0 auto; display: flex; align-items: center; padding: 0 8px;
  font-size: 11px; font-weight: 600; color: #475569; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
.col .lista { overflow-y: auto; padding: 3px; }
.item { height: 22px; display: flex; align-items: center; gap: 6px; padding: 0 6px; border-radius: 5px; cursor: pointer; }
.item .num { font-weight: 700; min-width: 1.2em; font-variant-numeric: tabular-nums; color: #64748b; }
.item .desc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .data { font-size: 10px; opacity: .7; }
.item.sel { background: #0284c7; color: #fff; }
.item.sel .num { color: #e0f2fe; }
.dicas { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 6px; padding: 7px 12px; border-radius: 7px;
  width: max-content; max-width: calc(100vw - 16px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: #0f172a; color: #e2e8f0; font-size: 11px; line-height: 1.55; box-shadow: 0 6px 12px -5px rgba(15, 23, 42, .45); }
.dicas .linha { display: block; overflow: hidden; text-overflow: ellipsis; }
.dicas .nota { opacity: .75; }
.dicas b { color: #7dd3fc; font-weight: 600; }
.toast { position: fixed; left: 50%; bottom: 8vh; transform: translateX(-50%); z-index: 2147483647; max-width: calc(100vw - 24px);
  padding: 8px 14px; border-radius: 8px; background: #7f1d1d; color: #fff; font: 12.5px/1.3 system-ui, "Segoe UI", Arial, sans-serif;
  box-shadow: 0 6px 20px rgba(0,0,0,.3); }
@keyframes pisca { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .campo .cursor { animation: none; } }
`;

const curto = (data) => (data ? `${data.slice(0, 6)}${data.slice(8)}` : '');
const el = (tag, classe, texto) => {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
};

export function criarMenu({ aoEscolher, aoFechar, combinaAtalho }) {
    let host = null, fundo = null, palco = null, dicas = null, toastTimer = null, toastEl = null;
    let campoEl = null, colEl = null;
    let mapa = new Map(), semLink = 0, aviso = '', anterior = null, linhaY = null;
    // Estado da entrada: 'numero' (digitando o evento) ou 'docs' (escolhendo o documento de um evento com vários).
    let etapa = 'numero', texto = '', erro = '', eventoDocs = null, docIdx = 0;

    const aberto = () => !!host;
    const consumir = (evento) => { evento.preventDefault(); evento.stopPropagation(); evento.stopImmediatePropagation(); };
    const alturaJanela = () => window.innerHeight || document.documentElement.clientHeight || 800;

    /** Centro do menu na altura da linha do cursor (sem sair da janela; sem âncora, no meio). */
    function posicionar() {
        if (!palco) return;
        const alto = palco.offsetHeight;
        const janelaAlta = alturaJanela();
        const reservaDicas = (dicas ? dicas.offsetHeight : 0) + 12;
        const centro = linhaY == null ? janelaAlta / 2 : linhaY;
        const topo = Math.min(Math.max(centro, alto / 2 + 6), Math.max(alto / 2 + 6, janelaAlta - alto / 2 - reservaDicas));
        palco.style.top = `${Math.round(topo)}px`;
    }

    function montarDados(eventos) {
        mapa = indexarEventos(eventos);
        aviso = '';
        desenhar();
    }

    /** Desenha o campo (número digitado + prévia) e, na etapa de documentos, a lista de documentos. */
    function desenhar() {
        if (!palco) return;
        const rotulo = el('div', 'rotulo');
        rotulo.append(el('span', '', etapa === 'docs' ? `Evento ${eventoDocs.n}` : 'Evento nº'), el('span', 'resumo', resumoDosEventos(mapa)));
        const numero = el('div', texto || etapa === 'docs' ? 'numero' : 'numero vazio');
        if (etapa === 'docs') numero.textContent = String(eventoDocs.n);
        else if (texto) numero.textContent = textoExibido(texto);
        else numero.textContent = 'Digite o número';
        if (etapa === 'numero') numero.append(el('span', 'cursor'));
        const previa = el('div', 'previa');
        if (!mapa.size) {
            previa.classList.add('aviso');
            previa.textContent = aviso || 'Buscando eventos na árvore…';
        } else if (etapa === 'docs') {
            previa.textContent = 'Escolha o documento';
        } else if (erro) {
            previa.classList.add('erro');
            previa.textContent = erro;
        } else {
            const consulta = consultarEvento(mapa, texto);
            if (consulta.estado === 'ausente') {
                previa.classList.add('erro');
                previa.textContent = `Evento ${consulta.n} não encontrado` + (semLink > 0 ? ' ou sem link' : '');
            } else if (consulta.estado === 'docAusente') {
                previa.classList.add('erro');
                previa.textContent = `Documento ${consulta.d} não encontrado no evento ${consulta.n}`;
            } else if (consulta.estado === 'documento') {
                previa.append(el('span', 'desc', consulta.doc.rotulo || consulta.doc.texto || 'Documento'));
                if (consulta.pagina) previa.append(el('span', 'docs', `pág. ${consulta.pagina}`));
                if (consulta.doc.mimetype) previa.append(el('span', 'docs', consulta.doc.mimetype));
            } else if (consulta.estado === 'docPendente') {
                previa.append(el('span', 'desc', 'Digite o número do documento'));
                previa.append(el('span', 'docs', `${consulta.evento.docs.length} doc${consulta.evento.docs.length > 1 ? 's' : ''}`));
            } else if (consulta.estado !== 'vazio') {
                const { evento } = consulta;
                previa.append(el('span', 'desc', evento.rotulo || '(sem descrição)'));
                if (consulta.estado === 'varios') previa.append(el('span', 'docs', `${evento.docs.length} docs`));
                else if (evento.data) previa.append(el('span', 'data', curto(evento.data)));
            }
        }
        campoEl.replaceChildren(rotulo, numero, previa);
        desenharDocumentos();
        atualizarDicas();
        posicionar();
    }

    function desenharDocumentos() {
        colEl.replaceChildren();
        colEl.style.display = etapa === 'docs' ? '' : 'none';
        if (etapa !== 'docs') return;
        const lista = el('div', 'lista');
        lista.setAttribute('role', 'listbox');
        eventoDocs.docs.forEach((doc, i) => {
            const linha = el('div', i === docIdx ? 'item sel' : 'item');
            linha.setAttribute('role', 'option');
            linha.setAttribute('aria-selected', i === docIdx ? 'true' : 'false');
            linha.append(el('span', 'num', i < 9 ? String(i + 1) : ''), el('span', 'desc', doc.rotulo || doc.texto || 'Documento'), el('span', 'data', doc.mimetype || ''));
            linha.title = doc.texto || '';
            linha.addEventListener('mousedown', (e) => e.preventDefault());
            linha.addEventListener('mousemove', () => { if (docIdx !== i) { docIdx = i; marcarDocumento(); } });
            linha.addEventListener('click', (e) => escolherDocumento(i, e));
            lista.append(linha);
        });
        colEl.append(el('div', 'cab', 'Documentos do evento'), lista);
    }

    function marcarDocumento() {
        const linhas = colEl.querySelectorAll('.item');
        linhas.forEach((linha, j) => {
            linha.classList.toggle('sel', j === docIdx);
            linha.setAttribute('aria-selected', j === docIdx ? 'true' : 'false');
            if (j === docIdx) linha.scrollIntoView({ block: 'nearest' });
        });
    }

    function atualizarDicas() {
        const linhas = [
            [['Digite', 'o número do evento e tecle Enter (Backspace apaga, Esc fecha).']],
            [['Insere:', 'Enter = “evento N ”; Shift+Enter = “(evento N)”; Ctrl+Enter = só “evento N ”; Ctrl+Shift+Enter = “(evento N)” só evento.']],
            [['Vários documentos:', 'E/Enter abre a lista no 1º (modificadores ignorados nesse momento).']],
            [['Já posicionado:', 'W/↑ abre no último; S/↓ no 2º; D no meio.']],
            [['Documento direto:', '“N D”, “N,D” ou “N.D” (espaço, vírgula ou ponto) + Enter insere o documento D do evento N (ex.: 520 50 → ANEXO50).']],
            [['Página:', 'evento de 1 documento: “N,P” abre na página P; vários documentos: “N,D,P” (ex.: 520,50,3). Sem página, nada é incluído.']],
            [['Na lista:', '↑ ↓ + Enter, ou o número do documento (1-9); ← ou Backspace volta.']],
            [['Ao escolher o documento:', 'Shift = “(…)”; Ctrl = só “evento N”; Ctrl+Shift = ambos.']],
            [['', 'O mouse também serve na lista de documentos, inclusive com Shift e Ctrl.']]
        ];
        dicas.replaceChildren();
        for (const [[tecla, texto]] of linhas) {
            const linha = el('span', 'linha');
            linha.append(document.createTextNode('•  '));
            if (tecla) linha.append(el('b', '', tecla), document.createTextNode(' '));
            linha.append(document.createTextNode(texto));
            dicas.append(linha);
        }
    }

    /** `estilo`: { parenteses: Shift, soEvento: Ctrl, pagina: número da página ou null }. */
    function inserir(evento, doc, estilo = {}) {
        fechar({ devolverFoco: false });
        aoEscolher({ evento, doc, parenteses: !!estilo.parenteses, soEvento: !!estilo.soEvento, pagina: estilo.pagina || null });
    }

    function escolherDocumento(indice, e) {
        if (etapa !== 'docs' || !eventoDocs.docs[indice]) return;
        inserir(eventoDocs, eventoDocs.docs[indice], { parenteses: e.shiftKey, soEvento: e.ctrlKey });
    }

    function voltarAoCampo() {
        etapa = 'numero';
        eventoDocs = null;
        docIdx = 0;
        erro = '';
        desenhar();
    }

    /** Enter no campo: um só documento insere (valem Shift/Ctrl); vários só abre a lista (modificadores ignorados). */
    function confirmarNumero(e) {
        const consulta = consultarEvento(mapa, texto);
        if (consulta.estado === 'vazio' || consulta.estado === 'ausente') { erro = consulta.estado === 'vazio' ? 'Digite o número do evento.' : ''; desenhar(); return; }
        if (consulta.estado === 'documento') { inserir(consulta.evento, consulta.doc, { parenteses: e.shiftKey, soEvento: e.ctrlKey, pagina: consulta.pagina }); return; }
        if (consulta.estado === 'docAusente') return; // a prévia já mostra o erro; nada é inserido
        if (consulta.estado === 'docPendente' && consulta.evento.docs.length === 1) { inserir(consulta.evento, consulta.evento.docs[0], { parenteses: e.shiftKey, soEvento: e.ctrlKey }); return; }
        if (consulta.estado === 'unico') { inserir(consulta.evento, consulta.evento.docs[0], { parenteses: e.shiftKey, soEvento: e.ctrlKey }); return; }
        abrirLista(consulta.evento, 'primeiro'); // o documento principal
    }

    /** Abre a lista de documentos de um evento com vários documentos, já posicionada conforme `modo`. */
    function abrirLista(evento, modo) {
        etapa = 'docs';
        eventoDocs = evento;
        docIdx = indiceInicialDaLista(evento.docs.length, modo);
        erro = '';
        desenhar();
        marcarDocumento(); // rola até o documento selecionado (ex.: o último de uma lista longa)
    }

    let iframesOuvidos = [];
    function ouvirIframes(ligar) {
        if (!ligar) {
            for (const w of iframesOuvidos) { try { w.removeEventListener('keydown', aoTecla, true); } catch (_) { /* descartado */ } }
            iframesOuvidos = [];
            return;
        }
        for (const f of document.querySelectorAll('iframe')) {
            try { const w = f.contentWindow; if (w && w.document) { w.addEventListener('keydown', aoTecla, true); iframesOuvidos.push(w); } } catch (_) { /* outra origem */ }
        }
    }

    function aoTecla(e) {
        if (e.isComposing) return;
        if (combinaAtalho(e)) { consumir(e); fechar(); return; }
        const c = e.code;
        const digito = digitoDaTecla(c);
        const ehEscolha = c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE';
        // Ctrl só é nosso em Enter/E (e, na lista de documentos, nos dígitos); os demais Ctrl+… (Ctrl+W etc.) seguem com o navegador.
        const nosso = ehEscolha || (etapa === 'docs' && digito !== null);
        if ((e.ctrlKey && !(nosso && !e.altKey && !e.metaKey)) || e.altKey || e.metaKey) return;
        consumir(e); // nada do que se digita com o menu aberto vaza para o texto
        if (c === 'Escape') { fechar(); return; }
        if (!mapa.size) return;
        if (etapa === 'numero') {
            if (digito !== null) { if (!e.ctrlKey) { texto = acrescentarDigito(texto, digito); erro = ''; desenhar(); } }
            else if (ehTeclaSeparador(c, e.key) && !e.ctrlKey) { texto = acrescentarSeparador(texto, mapa); erro = ''; desenhar(); }
            else if (c === 'Backspace') { texto = texto.slice(0, -1); erro = ''; desenhar(); }
            else if (c === 'Delete') { texto = ''; erro = ''; desenhar(); }
            else if (ehEscolha && !e.repeat) confirmarNumero(e);
            else if (TECLA_PARA_POSICAO[c] && !e.repeat) {
                const consulta = consultarEvento(mapa, texto);
                if (consulta.estado === 'varios') abrirLista(consulta.evento, TECLA_PARA_POSICAO[c]);
            }
            return;
        }
        // etapa === 'docs'
        if (c === 'ArrowUp' || c === 'KeyW') { if (docIdx > 0) { docIdx--; marcarDocumento(); } }
        else if (c === 'ArrowDown' || c === 'KeyS') { if (docIdx < eventoDocs.docs.length - 1) { docIdx++; marcarDocumento(); } }
        else if (c === 'ArrowLeft' || c === 'KeyA' || c === 'Backspace') voltarAoCampo();
        else if (digito !== null) { if (digito !== '0' && !e.repeat) escolherDocumento(Number(digito) - 1, e); }
        else if (ehEscolha && !e.repeat) escolherDocumento(docIdx, e);
    }

    function abrir({ snapshot, ativo, linha }) {
        if (aberto()) return;
        anterior = ativo || null;
        linhaY = Number.isFinite(linha) ? linha : null;
        etapa = 'numero'; texto = ''; erro = ''; eventoDocs = null; docIdx = 0;
        host = document.createElement('div');
        host.setAttribute('data-superproc', 'menu-eventos');
        const sombra = host.attachShadow({ mode: 'open' });
        const estilo = document.createElement('style');
        estilo.textContent = CSS;
        fundo = el('div', 'fundo');
        palco = el('div', 'palco');
        palco.tabIndex = -1;
        palco.setAttribute('role', 'dialog');
        palco.setAttribute('aria-label', 'Menu rápido de eventos');
        campoEl = el('div', 'campo');
        colEl = el('div', 'col');
        colEl.style.display = 'none';
        dicas = el('div', 'dicas');
        palco.append(campoEl, colEl, dicas); // dicas dentro do palco: top:100% = logo abaixo do menu
        fundo.append(palco);
        fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) { e.preventDefault(); fechar(); } });
        sombra.append(estilo, fundo);
        document.documentElement.append(host);
        window.addEventListener('keydown', aoTecla, true);
        ouvirIframes(true);
        window.addEventListener('blur', aoPerderFoco);
        semLink = snapshot?.semLink || 0;
        mapa = new Map();
        if (snapshot?.eventos?.length) mapa = indexarEventos(snapshot.eventos);
        desenhar();
        try { window.focus(); } catch (_) { /* sem efeito */ }
        palco.focus({ preventScroll: true });
        // Na 1ª abertura após iniciar o navegador o foco real do teclado pode continuar no iframe do editor
        // (a view ainda não recebeu foco do sistema): o ouvinte nos iframes garante que as teclas valham.
        requestAnimationFrame(() => { if (aberto()) { try { window.focus(); } catch (_) {} palco.focus({ preventScroll: true }); } });
        posicionar();
        window.addEventListener('resize', posicionar);
    }

    // Se o foco sair da janela (outra view/aba), fecha para não deixar o menu "preso".
    function aoPerderFoco() { setTimeout(() => { if (aberto() && !document.hasFocus()) fechar({ devolverFoco: false }); }, 0); }

    function fechar({ devolverFoco = true } = {}) {
        if (!aberto()) return;
        window.removeEventListener('keydown', aoTecla, true);
        ouvirIframes(false);
        window.removeEventListener('blur', aoPerderFoco);
        window.removeEventListener('resize', posicionar);
        host.remove();
        host = fundo = palco = dicas = campoEl = colEl = null;
        mapa = new Map();
        const foco = anterior;
        anterior = null;
        aoFechar({ devolverFoco, anterior: foco });
    }

    /** Dados chegaram (ou chegaram melhores): só aplica se o menu ainda não mostra eventos. */
    function receberDados(snapshot) {
        if (!aberto() || mapa.size) return;
        semLink = snapshot.semLink || 0;
        if (snapshot.eventos.length) montarDados(snapshot.eventos);
    }

    function definirAviso(textoAviso) {
        if (!aberto() || mapa.size) return;
        aviso = textoAviso;
        desenhar();
    }

    function toast(textoToast) {
        clearTimeout(toastTimer);
        toastEl?.remove();
        const hostToast = document.createElement('div');
        hostToast.setAttribute('data-superproc', 'menu-eventos-aviso');
        const sombra = hostToast.attachShadow({ mode: 'open' });
        const estilo = document.createElement('style');
        estilo.textContent = CSS;
        const caixa = el('div', 'toast', textoToast);
        caixa.setAttribute('role', 'alert');
        sombra.append(estilo, caixa);
        document.documentElement.append(hostToast);
        toastEl = hostToast;
        toastTimer = setTimeout(() => { hostToast.remove(); if (toastEl === hostToast) toastEl = null; }, 3500);
    }

    return { abrir, fechar, aberto, receberDados, definirAviso, toast };
}
