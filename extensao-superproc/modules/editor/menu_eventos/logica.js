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
export const GRUPOS = 5;
/** Eventos por grupo que a regra mira (define quantos grupos se usam, até GRUPOS). */
export const ALVO_POR_GRUPO = 5;
/** Até este total não há o que agrupar: lista os eventos direto. */
export const MIN_PARA_AGRUPAR = ALVO_POR_GRUPO + 1;

/**
 * Quantos grupos usar para `total` eventos: 6-10 → 2, 11-15 → 3, 16-20 → 4, 21+ → 5.
 * Acima de 25 continua 5: cada nível tem no máximo 5 opções e desce só até a lista caber na altura útil
 * (é o menor número de cliques possível com esse limite, e a estrutura fica sempre previsível).
 */
export function quantidadeDeGrupos(total) {
    return Math.min(GRUPOS, Math.max(2, Math.ceil(total / ALVO_POR_GRUPO)));
}
export const COLUNAS_VISIVEIS = 2;
export const LINHA_PX = 22;
export const CABECALHO_PX = 22;
export const RESPIRO_PX = 8; // padding da lista + bordas
export const MARGEM_VERTICAL = 0.2; // só limita a ALTURA máxima da coluna final; a posição segue a linha do cursor

/** Quantos itens cabem numa coluna dentro da faixa útil (20% topo / 20% base). */
export function capacidadeDaColuna(alturaJanela) {
    const util = alturaJanela * (1 - 2 * MARGEM_VERTICAL) - CABECALHO_PX - RESPIRO_PX;
    return Math.max(GRUPOS, Math.floor(util / LINHA_PX));
}

/** Divide em até `partes` blocos contíguos, o mais uniformes possível (os maiores primeiro). */
export function dividir(itens, partes = quantidadeDeGrupos(itens.length)) {
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

export const itemDoMeio = (total) => Math.floor(total / 2);

/**
 * Posição inicial (índice) na lista de documentos de um evento com vários documentos, conforme a tecla
 * usada no campo do número: 'primeiro' (E/Enter), 'segundo' (S/↓), 'meio' (D: total/2, arredondado para
 * cima, em contagem a partir de 1) e 'ultimo' (W/↑: começa de baixo para cima).
 */
export function indiceInicialDaLista(total, modo = 'primeiro') {
    if (!(total > 0)) return 0;
    if (modo === 'ultimo') return total - 1;
    if (modo === 'segundo') return Math.min(1, total - 1);
    if (modo === 'meio') return Math.max(0, Math.ceil(total / 2) - 1);
    return 0;
}

export function rotuloDoIntervalo(eventos) {
    const primeiro = eventos[0].n;
    const ultimo = eventos[eventos.length - 1].n;
    return primeiro === ultimo ? String(primeiro) : `${primeiro}-${ultimo}`;
}

/** Monta uma coluna: grupos (subdivisão em até 5) ou eventos (lista final). */
export function montarColuna(eventos, { capacidade, raiz = false }) {
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
export function normalizarEventos(lista) {
    const porNumero = new Map();
    for (const evento of lista || []) {
        if (evento && Number.isInteger(evento.n) && evento.n > 0 && Array.isArray(evento.docs) && evento.docs.length && !porNumero.has(evento.n)) porNumero.set(evento.n, evento);
    }
    return [...porNumero.values()].sort((a, b) => a.n - b.n);
}

/** Máquina de estados da navegação (pilha de colunas). */
export function criarNavegador(listaDeEventos, capacidade) {
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
export const MAX_DIGITOS = 6;

/** Mapa número → evento (ordenado, sem duplicados e sem lixo). */
export function indexarEventos(lista) {
    const mapa = new Map();
    for (const evento of normalizarEventos(lista)) mapa.set(evento.n, evento);
    return mapa;
}

/** '1'..'9','0' de Digit/Numpad; null para qualquer outra tecla. */
export function digitoDaTecla(code) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
    return m ? m[1] : null;
}

/**
 * Entrada "evento, documento" (decisão do usuário, 30/10/2026): "520,50" + Enter insere o documento cujo número
 * próprio é 50 ("Anexo 50" / sigla ANEXO50) no evento 520. O número é o do nome do documento, não a posição na lista.
 * No texto digitado o separador é guardado como ','; cada parte tem até MAX_DIGITOS e não começa com zero.
 */
export const SEPARADOR = ',';

/** Acrescenta um dígito à parte que está sendo digitada (sem zeros à esquerda e com limite de tamanho). */
export function acrescentarDigito(texto, digito) {
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
export function ehTeclaSeparador(code, key) {
    return CODIGOS_SEPARADOR.has(code) || CARACTERES_SEPARADOR.has(key);
}

/**
 * Acrescenta o separador. Só depois de haver número (sem vírgulas seguidas). Evento de 1 documento: no máximo 1 vírgula
 * ("N,página"); evento com vários documentos: até 2 ("N,documento,página"). Sem `mapa`, vale o máximo de 2.
 */
export function acrescentarSeparador(texto, mapa = null) {
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
export const textoExibido = (texto) => texto.split(SEPARADOR).join(SEPARADOR + ' ');

/** Número próprio do documento: o do fim do rótulo ("Anexo 50") ou, sem ele, o da sigla do link ("evento 520, ANEXO50"). */
export function numeroDoDocumento(doc) {
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
export function consultarEvento(mapa, texto) {
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
export function resumoDosEventos(mapa) {
    if (!mapa.size) return '';
    const numeros = [...mapa.keys()];
    return `${mapa.size} evento${mapa.size > 1 ? 's' : ''} · ${numeros[0]} a ${numeros[numeros.length - 1]}`;
}
