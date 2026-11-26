// Editor - Menu Rápido de Eventos (camada: host; mundo isolado 1111 + script do mundo principal menu-eventos-rapido-main.js).
// Chave em CFG > Configurações ("Editor - Menu Rápido de Eventos", menuEventosRapido) e atalho escolhido ali mesmo (menuEventosAtalho).
// Parte nativa do módulo editor_menu_eventos da extensão (extensao-superproc/modules/editor/menu_eventos_rapido.js e menu_eventos/*):
// mesmo comportamento. Um atalho de teclado abre sobre o editor o menu de eventos; escolher insere o link "evento N".
//   - árvore (acao=arvore_documento_listar): só responde aos pedidos do editor com a lista de eventos lida do DOM;
//   - editor (acao=minuta_editar): desenha o menu e pede a inserção ao CKEditor. A ponte entre as duas abas é um BroadcastChannel.
// Se a extensão também estiver instalada, ela fica parada (CONTROLADO PELO NAVEGADOR): o id editor_menu_eventos vai na marca.
//
// Este arquivo é lido do disco pelo host e embrulhado numa função: o `return` abaixo sai dessa função.
// O host troca o marcador ATALHO_DO_HOST pelo atalho escolhido (JSON) a cada injeção; reinjetar só atualiza o atalho.

const ATALHO_INICIAL = /*ATALHO_DO_HOST*/null;
let definirAtalhoImpl = () => {};
if (window.__spMenuEventos) { window.__spMenuEventos.definirAtalho(ATALHO_INICIAL); return; }
const __acao = new URLSearchParams(location.search).get('acao');
if (__acao !== 'arvore_documento_listar' && __acao !== 'minuta_editar') return;
window.__spMenuEventos = { definirAtalho: (a) => definirAtalhoImpl(a) };

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

const ehModificador = (code) => MODIFICADORES.has(code);

function deEvento(evento) {
    return {
        code: evento.code,
        ctrl: !!evento.ctrlKey,
        alt: !!evento.altKey,
        shift: !!evento.shiftKey,
        meta: !!evento.metaKey
    };
}

function combina(evento, atalho) {
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

function nomeDaTecla(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
    return NOMES[code] || code;
}

function descrever(atalho) {
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
function motivoDeRecusa(atalho) {
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
function avaliarTecla(evento) {
    if (ehModificador(evento.code) || !evento.code) return { estado: 'aguardar' };
    const atalho = deEvento(evento);
    const motivo = motivoDeRecusa(atalho);
    return motivo ? { estado: 'recusado', motivo } : { estado: 'ok', atalho };
}

/** Valida o que veio do armazenamento (pode ter sido importado de um perfil). */
function normalizarSalvo(valor) {
    if (!valor || typeof valor !== 'object') return null;
    if (typeof valor.code !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(valor.code) || ehModificador(valor.code)) return null;
    const atalho = { code: valor.code, ctrl: !!valor.ctrl, alt: !!valor.alt, shift: !!valor.shift, meta: !!valor.meta };
    return motivoDeRecusa(atalho) ? null : atalho;
}

/**
 * SuperPROC - Menu Rápido de Eventos: leitura dos eventos na árvore e montagem do link.
 * Só LÊ o DOM da árvore (nada é alterado, inclusive o que o AZFLOW entrega).
 */
const digitos = (valor) => String(valor ?? '').replace(/\D/g, '');
const limpar = (texto, max) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function ancoraDoEvento(li) {
    return li.querySelector(':scope > a.jstree-anchor') || li.querySelector('a.jstree-anchor');
}

function numeroDoEvento(li, texto) {
    const doTexto = texto.match(/^\(?(\d{1,6})\)?(?:\s|-|$)/);
    if (doTexto) return parseInt(doTexto[1], 10);
    const doId = String(li.id || '').match(/^evt\D*(\d{1,6})$/i);
    return doId ? parseInt(doId[1], 10) : NaN;
}

/** "Petição - Refer. Ao Evento: 19 - 31/07/2025 11:05" → { rotulo, data }. */
function partirDescricao(resto) {
    const m = resto.match(/^(.*?)\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?\s*$/);
    return m ? { rotulo: limpar(m[1], 90), data: m[2] } : { rotulo: limpar(resto, 90), data: '' };
}

const TEXTO_LINK = /^evento \d{1,6}(?:, [^<>"&]{1,80})?$/;

function sanitizarDoc(bruto) {
    if (!bruto || typeof bruto !== 'object') return null;
    const iddocumento = digitos(bruto.iddocumento);
    const numprocesso = digitos(bruto.numprocesso);
    if (iddocumento.length < 8 || iddocumento.length > 64 || numprocesso.length < 15 || numprocesso.length > 25) return null;
    const mimetype = /^[a-z0-9]{1,12}$/i.test(bruto.mimetype || '') ? bruto.mimetype : 'html';
    const uf = /^[A-Za-z]{2}$/.test(bruto.uf || '') ? String(bruto.uf).toUpperCase() : '';
    return {
        iddocumento,
        numprocesso,
        mimetype,
        page: /^\d{1,5}$/.test(String(bruto.page ?? '')) ? String(bruto.page) : '',
        uf,
        is2g: bruto.is2g === 'true' ? 'true' : 'false',
        target: bruto.target === '_self' ? '_self' : '_blank',
        rotulo: limpar(bruto.rotulo, 60),
        texto: TEXTO_LINK.test(bruto.texto || '') ? bruto.texto : ''
    };
}

/** Rótulo do documento (ex.: "Petição Inicial 1") sem o texto dos ícones/links embutidos no mesmo <a>. */
function rotuloDoDocumento(li) {
    const ancora = li?.querySelector(':scope > a.jstree-anchor');
    if (!ancora) return '';
    const copia = ancora.cloneNode(true);
    copia.querySelectorAll("[id^='imgCopyLinkDoc_'], .superproc-card-link-rapido, .widgetlinkdocumento").forEach((no) => no.remove());
    return limpar(copia.textContent, 60);
}

/** "Anexo 2" → "ANEXO2": mesma forma que o eproc usa na sigla do link quando ela não vier pronta. */
const siglaDoRotulo = (rotulo) => rotulo.toUpperCase().replace(/\s+(\d+)$/, '$1').replace(/[<>"&]/g, '');

function lerDocumentos(li, n) {
    const docs = [];
    const vistos = new Set();
    for (const widget of li.querySelectorAll('.widgetlinkdocumento[data-iddocumento]')) {
        const rotulo = rotuloDoDocumento(widget.closest('li[seqdoc]'));
        const nativo = limpar(widget.textContent, 90);
        const doc = sanitizarDoc({
            iddocumento: widget.getAttribute('data-iddocumento'),
            numprocesso: widget.getAttribute('data-numprocesso'),
            mimetype: widget.getAttribute('data-mimetype'),
            page: widget.getAttribute('data-page'),
            uf: widget.getAttribute('data-uf'),
            is2g: widget.getAttribute('data-is2g'),
            target: widget.getAttribute('data-target'),
            rotulo,
            // Texto do link como o eproc entrega ("evento 1, INIC1"); sem sigla, deriva do rótulo.
            texto: TEXTO_LINK.test(nativo) && nativo.includes(',') ? nativo : (rotulo ? `evento ${n}, ${siglaDoRotulo(rotulo)}` : '')
        });
        if (!doc || vistos.has(doc.iddocumento)) continue;
        vistos.add(doc.iddocumento);
        docs.push(doc);
    }
    return docs;
}

function lerEvento(li) {
    const texto = limpar(ancoraDoEvento(li)?.textContent, 300);
    const n = numeroDoEvento(li, texto);
    if (!Number.isInteger(n) || n < 1) return null;
    const { rotulo, data } = partirDescricao(texto.replace(/^\(?\d{1,6}\)?\s*-?\s*/, ''));
    return { n, rotulo, data, docs: lerDocumentos(li, n) };
}

/** Eventos raiz da árvore que têm link de documento. `semLink` conta os que não têm. */
function lerEventosDaArvore(documento = document) {
    const raiz = documento.getElementById('divArvore') || documento;
    const porNumero = new Map();
    let semLink = 0;
    for (const li of raiz.querySelectorAll("li[evento='true']")) {
        const evento = lerEvento(li);
        if (!evento) continue;
        if (!evento.docs.length) { semLink++; continue; }
        if (!porNumero.has(evento.n)) porNumero.set(evento.n, evento);
    }
    return { eventos: [...porNumero.values()].sort((a, b) => a.n - b.n), semLink };
}

/** Valida o que chega pelo canal entre as views (nunca confiar no formato). */
function sanitizarSnapshot(dado) {
    if (!dado || typeof dado !== 'object' || !Array.isArray(dado.eventos)) return { eventos: [], semLink: 0 };
    const eventos = [];
    for (const bruto of dado.eventos.slice(0, 20000)) {
        const n = Number(bruto?.n);
        if (!Number.isInteger(n) || n < 1 || n > 999999 || !Array.isArray(bruto.docs)) continue;
        const docs = bruto.docs.slice(0, 60).map(sanitizarDoc).filter(Boolean);
        if (!docs.length) continue;
        eventos.push({
            n,
            rotulo: limpar(bruto.rotulo, 90),
            data: /^\d{2}\/\d{2}\/\d{4}$/.test(bruto.data || '') ? bruto.data : '',
            docs
        });
    }
    return { eventos, semLink: Math.max(0, Math.min(99999, Number(dado.semLink) || 0)) };
}

/** Texto do link: "evento N" (documento único) ou "evento N, SIGLA" (evento com vários documentos). */
function textoDoLink(evento, doc) {
    return evento.docs.length > 1 && doc.texto ? doc.texto : `evento ${evento.n}`;
}

/** O mesmo span que o módulo "Cores no evento raiz" copia: <span class="widgetlinkdocumento" ...>evento N</span>. */
function montarSpanLink(doc, texto, documento = document) {
    const span = documento.createElement('span');
    span.className = 'widgetlinkdocumento';
    span.setAttribute('data-iddocumento', doc.iddocumento);
    span.setAttribute('data-target', doc.target || '_blank');
    span.setAttribute('data-is2g', doc.is2g || 'false');
    span.setAttribute('data-numprocesso', doc.numprocesso);
    span.setAttribute('data-mimetype', doc.mimetype || 'html');
    if (doc.page) span.setAttribute('data-page', doc.page);
    if (doc.uf) span.setAttribute('data-uf', doc.uf);
    span.textContent = texto;
    return span.outerHTML;
}

/**
 * SuperPROC - Menu Rápido de Eventos: lógica pura (sem DOM).
 *
 * Regras (definidas pelo usuário):
 *  - O primeiro menu divide os eventos em NO MÁXIMO 5 grupos, usando menos quando bastam (cerca de 5
 *    eventos por grupo): até 5 eventos = lista direta; 6-10 = 2 grupos; 11-15 = 3; 16-20 = 4;
 *    21 ou mais = 5 grupos. O item inicial é o do meio.
 *  - Ao entrar num grupo: se os eventos cabem na altura útil da tela (60% da janela: 20% de
 *    margem em cima e 20% embaixo), mostra os eventos; senão, divide de novo em 5 subgrupos.
 *  - Ficam visíveis só as duas últimas colunas; as anteriores continuam na pilha, ocultas.
 *  - Evento com mais de um documento ("item2") abre uma coluna de "subitem" (um por documento),
 *    que começa SEMPRE no primeiro (o documento principal). Evento com um só documento é "item".
 *  - Setas/WASD: cima/baixo movem na coluna; direita entra no grupo; esquerda volta;
 *    Enter é o único que ESCOLHE um evento (direita num evento não faz nada).
 */
/** Máximo de grupos por divisão (sempre). */
const GRUPOS = 5;
/** Eventos por grupo que a regra mira (define quantos grupos se usam, até GRUPOS). */
const ALVO_POR_GRUPO = 5;
/** Até este total não há o que agrupar: lista os eventos direto. */
const MIN_PARA_AGRUPAR = ALVO_POR_GRUPO + 1;

/**
 * Quantos grupos usar para `total` eventos: 6-10 → 2, 11-15 → 3, 16-20 → 4, 21+ → 5.
 * Acima de 25 continua 5: cada nível tem no máximo 5 opções e desce só até a lista caber na altura útil
 * (é o menor número de cliques possível com esse limite, e a estrutura fica sempre previsível).
 */
function quantidadeDeGrupos(total) {
    return Math.min(GRUPOS, Math.max(2, Math.ceil(total / ALVO_POR_GRUPO)));
}
const COLUNAS_VISIVEIS = 2;
const LINHA_PX = 22;
const CABECALHO_PX = 22;
const RESPIRO_PX = 8; // padding da lista + bordas
const MARGEM_VERTICAL = 0.2; // só limita a ALTURA máxima da coluna final; a posição segue a linha do cursor

/** Quantos itens cabem numa coluna dentro da faixa útil (20% topo / 20% base). */
function capacidadeDaColuna(alturaJanela) {
    const util = alturaJanela * (1 - 2 * MARGEM_VERTICAL) - CABECALHO_PX - RESPIRO_PX;
    return Math.max(GRUPOS, Math.floor(util / LINHA_PX));
}

/** Divide em até `partes` blocos contíguos, o mais uniformes possível (os maiores primeiro). */
function dividir(itens, partes = quantidadeDeGrupos(itens.length)) {
    const base = Math.floor(itens.length / partes);
    const resto = itens.length % partes;
    const blocos = [];
    let inicio = 0;
    for (let p = 0; p < partes; p++) {
        const tamanho = base + (p < resto ? 1 : 0);
        if (!tamanho) break;
        blocos.push(itens.slice(inicio, inicio + tamanho));
        inicio += tamanho;
    }
    return blocos;
}

const itemDoMeio = (total) => Math.floor(total / 2);

/**
 * Posição inicial (índice) na lista de documentos de um evento com vários documentos, conforme a tecla
 * usada no campo do número: 'primeiro' (E/Enter), 'segundo' (S/↓), 'meio' (D: total/2, arredondado para
 * cima, em contagem a partir de 1) e 'ultimo' (W/↑: começa de baixo para cima).
 */
function indiceInicialDaLista(total, modo = 'primeiro') {
    if (!(total > 0)) return 0;
    if (modo === 'ultimo') return total - 1;
    if (modo === 'segundo') return Math.min(1, total - 1);
    if (modo === 'meio') return Math.max(0, Math.ceil(total / 2) - 1);
    return 0;
}

function rotuloDoIntervalo(eventos) {
    const primeiro = eventos[0].n;
    const ultimo = eventos[eventos.length - 1].n;
    return primeiro === ultimo ? String(primeiro) : `${primeiro}-${ultimo}`;
}

/** Monta uma coluna: grupos (subdivisão em até 5) ou eventos (lista final). */
function montarColuna(eventos, { capacidade, raiz = false }) {
    const final = raiz
        ? eventos.length < MIN_PARA_AGRUPAR
        : eventos.length <= Math.max(capacidade, GRUPOS);
    if (final) {
        return {
            tipo: 'eventos',
            titulo: eventos.length ? `Eventos ${rotuloDoIntervalo(eventos)}` : 'Eventos',
            itens: eventos.map((evento) => ({ tipo: evento.docs.length > 1 ? 'item2' : 'item', evento })),
            indice: itemDoMeio(eventos.length)
        };
    }
    const itens = dividir(eventos).map((bloco) => ({
        tipo: 'grupo',
        rotulo: rotuloDoIntervalo(bloco),
        total: bloco.length,
        eventos: bloco
    }));
    return {
        tipo: 'grupos',
        titulo: raiz ? `Eventos (${eventos.length})` : `Eventos ${rotuloDoIntervalo(eventos)}`,
        itens,
        indice: itemDoMeio(itens.length)
    };
}

/** Ordena por número e descarta duplicados. */
function normalizarEventos(lista) {
    const porNumero = new Map();
    for (const evento of lista || []) {
        if (evento && Number.isInteger(evento.n) && evento.n > 0 && Array.isArray(evento.docs) && evento.docs.length && !porNumero.has(evento.n)) porNumero.set(evento.n, evento);
    }
    return [...porNumero.values()].sort((a, b) => a.n - b.n);
}

/** Máquina de estados da navegação (pilha de colunas). */
function criarNavegador(listaDeEventos, capacidade) {
    const eventos = normalizarEventos(listaDeEventos);
    const pilha = [];
    let cap = capacidade;
    const abrir = (lista, raiz) => { pilha.push(montarColuna(lista, { capacidade: cap, raiz })); };
    abrir(eventos, true);

    const atual = () => pilha[pilha.length - 1];
    const itemAtual = () => atual().itens[atual().indice];

    return {
        pilha,
        atual,
        itemAtual,
        total: eventos.length,
        definirCapacidade(valor) { cap = valor; },
        /** Quais colunas aparecem: só as duas últimas. */
        visiveis() { return Math.max(0, pilha.length - COLUNAS_VISIVEIS); },
        mover(delta) {
            const coluna = atual();
            if (!coluna.itens.length) return false;
            const novo = Math.min(coluna.itens.length - 1, Math.max(0, coluna.indice + delta));
            const mudou = novo !== coluna.indice;
            coluna.indice = novo;
            return mudou;
        },
        /** Direita / Enter em grupo ou item2. Em item/subitem não faz nada. */
        entrar() {
            const item = itemAtual();
            if (item?.tipo === 'grupo') {
                abrir(item.eventos, false);
                return { acao: 'entrou' };
            }
            if (item?.tipo === 'item2') {
                pilha.push({
                    tipo: 'subitens',
                    titulo: `Evento ${item.evento.n}`,
                    itens: item.evento.docs.map((doc) => ({ tipo: 'subitem', evento: item.evento, doc })),
                    indice: 0 // o documento principal, não o do meio
                });
                return { acao: 'entrou' };
            }
            return { acao: 'nada' };
        },
        /** Esquerda. Na primeira coluna não fecha o menu (isso é do Esc). */
        voltar() {
            if (pilha.length <= 1) return { acao: 'nada' };
            pilha.pop();
            return { acao: 'voltou' };
        },
        /** Enter: grupo/item2 → entra; item/subitem → devolve evento + documento escolhidos. */
        selecionar() {
            const item = itemAtual();
            if (!item) return { acao: 'nada' };
            if (item.tipo === 'grupo' || item.tipo === 'item2') return this.entrar();
            return { acao: 'evento', evento: item.evento, doc: item.doc || item.evento.docs[0] };
        }
    };
}

// ---------------------------------------------------------------------------------------------
// Entrada por número (interface atual): atalho > digitar o número do evento > Enter.
// As funções de grupos acima ficam no arquivo mas a interface não as usa mais.
// ---------------------------------------------------------------------------------------------
const MAX_DIGITOS = 6;

/** Mapa número → evento (ordenado, sem duplicados e sem lixo). */
function indexarEventos(lista) {
    const mapa = new Map();
    for (const evento of normalizarEventos(lista)) mapa.set(evento.n, evento);
    return mapa;
}

/** '1'..'9','0' de Digit/Numpad; null para qualquer outra tecla. */
function digitoDaTecla(code) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
    return m ? m[1] : null;
}

/**
 * Entrada "evento, documento" (decisão do usuário, 30/10/2026): "520,50" + Enter insere o documento cujo número
 * próprio é 50 ("Anexo 50" / sigla ANEXO50) no evento 520. O número é o do nome do documento, não a posição na lista.
 * No texto digitado o separador é guardado como ','; cada parte tem até MAX_DIGITOS e não começa com zero.
 */
const SEPARADOR = ',';

/** Acrescenta um dígito à parte que está sendo digitada (sem zeros à esquerda e com limite de tamanho). */
function acrescentarDigito(texto, digito) {
    const parte = texto.slice(texto.lastIndexOf(SEPARADOR) + 1);
    if (parte.length >= MAX_DIGITOS) return texto;
    if (parte === '' && digito === '0') return texto;
    return texto + digito;
}

/**
 * A tecla é separador entre evento e documento? Vale espaço, vírgula e ponto (teclado principal ou numérico):
 * "520 1", "520,1", "520, 1", "520 , 1", "520.1", "520 . 1" etc. significam o mesmo; internamente fica ','.
 */
const CODIGOS_SEPARADOR = new Set(['Space', 'Comma', 'Period', 'NumpadDecimal', 'NumpadComma']);
const CARACTERES_SEPARADOR = new Set([' ', ',', '.']);
function ehTeclaSeparador(code, key) {
    return CODIGOS_SEPARADOR.has(code) || CARACTERES_SEPARADOR.has(key);
}

/**
 * Acrescenta o separador. Só depois de haver número (sem vírgulas seguidas). Evento de 1 documento: no máximo 1 vírgula
 * ("N,página"); evento com vários documentos: até 2 ("N,documento,página"). Sem `mapa`, vale o máximo de 2.
 */
function acrescentarSeparador(texto, mapa = null) {
    if (!texto || texto.endsWith(SEPARADOR)) return texto;
    const virgulas = texto.split(SEPARADOR).length - 1;
    if (virgulas >= 2) return texto;
    if (virgulas === 1 && mapa) {
        const evento = mapa.get(Number(texto.split(SEPARADOR)[0]));
        if (evento && evento.docs.length <= 1) return texto;
    }
    return texto + SEPARADOR;
}

/** Texto para exibir no campo: "520,50,3" → "520, 50, 3". */
const textoExibido = (texto) => texto.split(SEPARADOR).join(SEPARADOR + ' ');

/** Número próprio do documento: o do fim do rótulo ("Anexo 50") ou, sem ele, o da sigla do link ("evento 520, ANEXO50"). */
function numeroDoDocumento(doc) {
    const doRotulo = /(\d{1,6})\s*$/.exec(String(doc?.rotulo || ''));
    if (doRotulo) return parseInt(doRotulo[1], 10);
    const daSigla = /,\s*\D*?(\d{1,6})\s*$/.exec(String(doc?.texto || ''));
    return daSigla ? parseInt(daSigla[1], 10) : null;
}

/**
 * O que foi digitado significa: vazio | ausente | unico (1 documento) | varios (lista de documentos);
 * com separador: docPendente (falta o número do documento) | documento (achou `doc`) | docAusente (`d` não existe no evento).
 * Página (data-page): evento de 1 documento → "N,página"; evento com vários → "N,documento,página".
 * Em `documento`, `pagina` é o número digitado ou null (sem informação de página, nada é incluído).
 */
function consultarEvento(mapa, texto) {
    if (!texto) return { estado: 'vazio' };
    const partes = texto.split(SEPARADOR);
    const n = Number(partes[0]);
    const evento = mapa.get(n);
    if (!evento) return { estado: 'ausente', n };
    if (partes.length === 1) return { estado: evento.docs.length > 1 ? 'varios' : 'unico', n, evento };
    const numeroOuNull = (t) => (t ? Number(t) : null);
    if (evento.docs.length <= 1) {
        // Um só documento: o que vem depois da vírgula é a página.
        if (partes.length > 2) return { estado: 'docAusente', n, evento, d: Number(partes[1]) };
        if (!partes[1]) return { estado: 'docPendente', n, evento };
        return { estado: 'documento', n, evento, doc: evento.docs[0], pagina: numeroOuNull(partes[1]) };
    }
    if (!partes[1]) return { estado: 'docPendente', n, evento };
    const d = Number(partes[1]);
    const doc = evento.docs.find((x) => numeroDoDocumento(x) === d);
    return doc ? { estado: 'documento', n, evento, d, doc, pagina: numeroOuNull(partes[2]) } : { estado: 'docAusente', n, evento, d };
}

/** Resumo para o campo: quantos eventos com link e a faixa de números. */
function resumoDosEventos(mapa) {
    if (!mapa.size) return '';
    const numeros = [...mapa.keys()];
    return `${mapa.size} evento${mapa.size > 1 ? 's' : ''} · ${numeros[0]} a ${numeros[numeros.length - 1]}`;
}

/**
 * SuperPROC - Menu Rápido de Eventos: interface (Shadow DOM, isolada do CSS do eproc).
 * Colunas deslizantes: só as duas últimas ficam visíveis; as anteriores permanecem na pilha.
 */

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

function criarMenu({ aoEscolher, aoFechar, combinaAtalho }) {
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

/**
 * SuperPROC - Módulo: Editor - Menu Rápido de Eventos
 *
 * Um atalho de teclado (escolhido e memorizado pelo usuário no popup) abre, sobre o editor, um campo
 * onde se digita o número do evento (evento com vários documentos abre a lista de documentos). Escolher
 * insere no texto o link "evento N"
 * (<span class="widgetlinkdocumento" ...>), sem o usuário tirar as mãos do teclado.
 *
 * O módulo tem dois papéis, conforme a página em que roda:
 *  - árvore (arvore_documento_listar): só RESPONDE aos pedidos do editor com a lista de eventos lida
 *    do DOM (nada é modificado; o AZFLOW não é tocado);
 *  - editor (minuta_editar): guarda o atalho, desenha o menu e pede a inserção ao CKEditor.
 *
 * A árvore e o editor ficam em views diferentes do navegador; a ponte é um BroadcastChannel
 * (mesma origem e mesma sessão), filtrado pelo número do processo. Nada é gravado em disco.
 */

const CANAL = 'superproc-menu-eventos-v1';
const MARCA = 'menu-eventos';
const PREFIXO = '[SuperPROC: Menu de Eventos]';
const ESPERA_SEM_ARVORE_MS = 1200;

function iniciarArvore(params) {
    if (typeof BroadcastChannel === 'undefined') return;
    const processo = digitos(params.get('txtNumProcesso'));
    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (ev) => {
        const pedido = ev.data;
        if (!pedido || pedido.t !== 'pedido') return;
        if (pedido.processo && processo && pedido.processo !== processo) return;
        const { eventos, semLink } = lerEventosDaArvore(document);
        if (!eventos.length) return; // árvore ainda carregando: o editor tenta de novo
        canal.postMessage({ t: 'snapshot', processo, eventos, semLink });
    };
    window.addEventListener('pagehide', () => canal.close(), { once: true });
    console.debug(`${PREFIXO} árvore pronta para responder ao editor.`);
}

function iniciarEditor({ params }) {
    const processo = digitos(params.get('num_processo'));
    const podeCanal = typeof BroadcastChannel !== 'undefined';
    const canal = podeCanal ? new BroadcastChannel(CANAL) : null;
    let atalho = normalizarSalvo(ATALHO_INICIAL);
    let cache = null;
    let esperaTimer = null;
    let aberturaTimer = null;

    const aMain = (dados) => window.postMessage({ __sp: MARCA, de: 'iso', ...dados }, location.origin === 'null' ? '*' : location.origin);
    const pedirEventos = () => canal?.postMessage({ t: 'pedido', processo });

    const menu = criarMenu({
        combinaAtalho: (evento) => combina(evento, atalho),
        aoEscolher({ evento, doc, parenteses, soEvento, pagina }) {
            // Ctrl: o texto do link é só "evento N" (o link continua apontando para o documento escolhido).
            const base = soEvento ? `evento ${evento.n}` : textoDoLink(evento, doc);
            const texto = pagina ? `${base}, p. ${pagina}` : base; // com página: "evento 2, p. 5" / "evento 2, ANEXO5, p. 3"
            aMain({ tipo: 'inserir', html: montarSpanLink(pagina ? { ...doc, page: String(pagina) } : doc, texto, document), parenteses: !!parenteses });
            console.debug(`${PREFIXO} evento ${evento.n} escolhido para inserção.`, { soEvento: !!soEvento, parenteses: !!parenteses, docsDoEvento: evento.docs.length, textoEnviado: texto });
        },
        aoFechar({ devolverFoco, anterior }) {
            clearTimeout(esperaTimer);
            if (!devolverFoco) return;
            const ehEditorEmIframe = !anterior || anterior.tagName === 'IFRAME' || anterior === document.body;
            if (ehEditorEmIframe) {
                // Foco devolvido na hora (a próxima tecla já cai no texto); o editor restaura o cursor em seguida.
                try { anterior?.contentWindow?.focus(); } catch (_) { /* iframe de outra origem: o editor cuida */ }
                aMain({ tipo: 'fechar' });
            }
            else if (anterior.isConnected) anterior.focus?.({ preventScroll: true });
        }
    });

    function abrir(ativo, linha) {
        if (menu.aberto()) return;
        clearTimeout(aberturaTimer);
        menu.abrir({ snapshot: cache, ativo, linha });
        pedirEventos(); // atualiza o cache (e preenche o menu, se ainda estiver vazio)
        if (!cache) {
            clearTimeout(esperaTimer);
            esperaTimer = setTimeout(() => menu.definirAviso(
                'Não encontrei a árvore deste processo. Deixe a árvore aberta ao lado do editor (mesmo processo) e tente de novo.'
            ), ESPERA_SEM_ARVORE_MS);
        }
    }

    if (canal) {
        canal.onmessage = (ev) => {
            const dado = ev.data;
            if (!dado || dado.t !== 'snapshot') return;
            if (processo && dado.processo && dado.processo !== processo) return;
            const snapshot = sanitizarSnapshot(dado);
            if (!snapshot.eventos.length) return;
            cache = snapshot;
            clearTimeout(esperaTimer);
            menu.receberDados(snapshot);
        };
        window.addEventListener('pagehide', () => canal.close(), { once: true });
    }

    // ---- Atalho (escolhido em CFG > Configurações; o host o entrega ao injetar e a cada mudança) ----
    const enviarConfiguracao = () => aMain({ tipo: 'config', atalho });
    definirAtalhoImpl = (novo) => { atalho = normalizarSalvo(novo); enviarConfiguracao(); };

    // Atalho pressionado com o foco FORA do iframe do CKEditor (o do iframe é tratado no script principal).
    document.addEventListener('keydown', (evento) => {
        if (!atalho || evento.repeat || menu.aberto() || !combina(evento, atalho)) return;
        evento.preventDefault();
        evento.stopPropagation();
        const ativo = document.activeElement;
        aMain({ tipo: 'preparar' }); // guarda a seleção e mede a linha do cursor; o script principal responde 'abrir'
        clearTimeout(aberturaTimer);
        aberturaTimer = setTimeout(() => abrir(ativo, null), 150); // sem resposta: abre no meio da janela
    }, true);

    window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (ev.source !== window || !d || d.__sp !== MARCA || d.de !== 'main') return;
        if (d.tipo === 'pronto') enviarConfiguracao();
        else if (d.tipo === 'abrir') abrir(document.activeElement, d.linha);
        else if (d.tipo === 'resultado' && !d.ok) menu.toast(d.motivo || 'Não foi possível inserir o evento no texto.');
        else if (d.tipo === 'resultado' && d.aviso) menu.toast(d.aviso);
    });

    // O script do mundo principal (acesso ao CKEDITOR: eproc-recursos/menu-eventos-rapido-main.js) é injetado pelo host.

    enviarConfiguracao();
    window.addEventListener('focus', () => { enviarConfiguracao(); pedirEventos(); });

    // Cache aquecido: o menu abre na hora; a árvore pode terminar de carregar depois do editor.
    [0, 1500, 4500].forEach((atraso) => setTimeout(pedirEventos, atraso));
    console.debug(`${PREFIXO} editor pronto (atalho ${atalho ? 'memorizado' : 'ainda não memorizado'}).`);
}


{
    const params = new URLSearchParams(location.search);
    if (__acao === 'arvore_documento_listar') iniciarArvore(params);
    else iniciarEditor({ params });
}
