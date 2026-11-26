(() => {
'use strict';
/**
 * Organizador de grupos do navegador SuperPROC (Smart Localizadores e Smart Eventos).
 * Porte independente de extensao-superproc/organizador/organizador.js: em vez do armazenamento da extensão, lê e grava a
 * base comum no localStorage do eproc pelo host (dados.js -> preload-organizador.js -> organizador-host.js); as abas do
 * eproc abertas recebem as mudanças na hora.
 * Interações: arrastar item(ns) para um grupo (com posição), Shift + arrastar o mouse para selecionar vários,
 * Ctrl/Shift + clique, teclado (setas, Espaço), "Mover para" na barra de seleção, reordenar/renomear/excluir grupos,
 * desfazer (Ctrl+Z).
 */
const { lerEspelho, gravarOrigem, aoMudarEspelho, normalizarDados, SEM_GRUPO, GRUPO_OCULTOS, GRUPO_BASE_EVENTOS,
    lerRegrasGrupos, gravarRegrasGrupos, aoMudarRegrasGrupos, PALETA_LOCALIZADORES, lerCoresLoc, gravarCorPropria, aoMudarCores } = window.SPOrg;

const filtrosGrupo = new Map();
let edicaoGrupo = null;
let edicaoItem = null;
let regras = {}, coresLoc = {}, coresAZ = {};
const normalizarLoc = (r) => String(r).normalize('NFC').replace(/️/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const nomeLoc = (r) => normalizarLoc(r.split(/\s+-\s+/)[0]);
const regraAZ = (r) => coresAZ[nomeLoc(r)] || coresAZ[normalizarLoc(r)];
const corHex = (cor) => /^#[a-f\d]{6}$/i.test(cor || '') ? cor : '#007bff';
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k in e) e[k] = v;
        else e.setAttribute(k, v);
    }
    e.append(...filhos.filter(f => f != null));
    return e;
}

const ICO = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const SVG = {
    grip: ICO('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
    edit: ICO('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    trash: ICO('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'),
    check: ICO('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    eyeOff: ICO('<path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-3 3.8M6.5 7.6A14 14 0 0 0 2.5 12c1 2 4.5 6 9.5 6a9.7 9.7 0 0 0 3-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    eye: ICO('<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    antes: ICO('<path d="m14.5 6-6 6 6 6"/>'),
    depois: ICO('<path d="m9.5 6 6 6-6 6"/>')
};

const NOMES = { loc: 'Localizadores', evt: 'Eventos' };

// ---------- Estado ----------
let modulo = new URLSearchParams(location.search).get('m') === 'evt' ? 'evt' : 'loc';
let origem = null;
let dados = null;            // { grupos, estrutura, catalogo?, at } da origem aberta
let origensDisponiveis = [];
let sel = new Set();         // chaves dos itens selecionados
let ancora = null;           // chave âncora para Shift + clique
let focoItem = null;         // chave do item com tabindex 0
let focoGrip = null;         // grupo cujo botão de reordenar deve receber foco após o redesenho
let termo = '';
let criando = false;
let drag = null;             // { tipo: 'itens', keys } | { tipo: 'grupo', nome }
let dropInfo = null;         // { grupo, antes }
let marqueeAtivo = false;
let acabouMarquee = false;
let catalogoMapa = new Map();
const historico = [];

const quadro = $('#quadro');

// ---------- Modelo ----------
const ehBase = (g) => modulo === 'evt' && g === GRUPO_BASE_EVENTOS;
// Identidade: localizador = ID do eproc; evento = código do eproc (o texto é só a etiqueta). Evento cujo "id" é apenas o
// código CNJ do fim do texto (captura antiga) não tem identidade própria e vale o texto. Mesma regra de smart-eventos.js.
const codigoCnj = (texto) => { const m = /\((\d+)\)\s*$/.exec(String(texto || '')); return m ? m[1] : null; };
const chaveDoEvento = (o) => { const id = o && o.id != null ? String(o.id).trim() : ''; return id && id !== codigoCnj(o.text) ? 'id:' + id : 'tx:' + o.text; };
const chaveDe = (item) => (modulo === 'loc' ? item : chaveDoEvento(item));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clonar = (o) => JSON.parse(JSON.stringify(o));
const gruposVisiveis = () => (dados ? dados.grupos.filter(g => !ehBase(g)) : []);
const nomeExibido = (g) => (g === SEM_GRUPO ? 'Sem grupo' : g);

function reconstruirCatalogo() {
    catalogoMapa = new Map((dados && dados.catalogo ? dados.catalogo : []).map(c => [c.value, c.text]));
}

function itensDoGrupo(g) {
    const lista = (dados && dados.estrutura[g]) || [];
    if (modulo === 'loc') return lista.filter(id => catalogoMapa.has(id)).map(id => ({ k: id, r: catalogoMapa.get(id) }));
    return lista.map(o => ({ k: chaveDoEvento(o), r: o.text }));
}

/** Chaves na ordem em que aparecem no quadro (Sem grupo, depois os grupos). */
function ordemVisivel() {
    return [SEM_GRUPO, GRUPO_OCULTOS, ...gruposVisiveis()].flatMap(g => itensDoGrupo(g).map(i => i.k));
}

function validarNome(nome, atual = null) {
    const n = nome.trim();
    if (!n) return 'Informe o nome do grupo.';
    if (n === '__proto__' || n.toLowerCase() === SEM_GRUPO.toLowerCase() || n.toLowerCase() === GRUPO_OCULTOS.toLowerCase() || n === GRUPO_BASE_EVENTOS) return 'Esse nome é reservado pelo sistema.';
    if (dados.grupos.some(g => g !== atual && g.toLowerCase() === n.toLowerCase())) return 'Já existe um grupo com esse nome.';
    return '';
}

// ---------- Persistência e desfazer ----------
function mostrarStatus(texto, erro = false) {
    const s = $('#status');
    s.textContent = texto;
    s.classList.toggle('erro', erro);
}

function salvar() {
    dados.at = Date.now();
    gravarOrigem(modulo, origem, dados)
        .then(() => mostrarStatus('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. As páginas abertas do eproc se atualizam sozinhas.'))
        .catch(() => mostrarStatus('Não foi possível salvar. Tente de novo.', true));
}

function mutar(fn, desfazerRegras = null) {
    historico.push({ dados: JSON.stringify(dados), desfazerRegras });
    if (historico.length > 50) historico.shift();
    fn(dados);
    salvar();
    render();
}

function desfazer() {
    if (!historico.length) return;
    const catalogo = dados.catalogo;
    const anterior = historico.pop();
    if (anterior.desfazerRegras) anterior.desfazerRegras().catch(() => mostrarStatus('Não foi possível restaurar a regra do grupo.', true));
    dados = JSON.parse(anterior.dados);
    if (catalogo) dados.catalogo = catalogo;
    salvar();
    render();
    avisar('Alteração desfeita.');
}

// ---------- Operações ----------
function moverItens(keys, destino, antesK = null) {
    const conjunto = new Set(keys);
    mutar((d) => {
        const achados = new Map();
        for (const g of Object.keys(d.estrutura)) {
            if (ehBase(g)) continue;
            d.estrutura[g] = d.estrutura[g].filter((item) => {
                const k = chaveDe(item);
                if (!conjunto.has(k)) return true;
                if (!achados.has(k)) achados.set(k, item);
                return false;
            });
        }
        const mover = keys.filter(k => achados.has(k)).map(k => achados.get(k));
        if (!d.estrutura[destino]) d.estrutura[destino] = [];
        const alvo = d.estrutura[destino];
        const i = antesK == null ? -1 : alvo.findIndex(item => chaveDe(item) === antesK);
        if (i < 0) alvo.push(...mover); else alvo.splice(i, 0, ...mover);
    });
}

function moverSelecao(destino, antesK = null) {
    const ordem = ordemVisivel().filter(k => sel.has(k));
    if (!ordem.length) return;
    sel = new Set();
    moverItens(ordem, destino, antesK);
    avisar(`${ordem.length === 1 ? '1 item movido' : ordem.length + ' itens movidos'} para ${nomeExibido(destino)}.`, 'Desfazer', desfazer);
}

function criarGrupo(nome) {
    mutar((d) => { d.grupos.push(nome); d.estrutura[nome] = []; });
}

const grupoOculto = (g) => modulo === 'loc' && !!dados && (dados.gruposOcultos || []).includes(g);

/** Olho do grupo: fechado = o grupo inteiro some do Smart Localizadores (os itens continuam nele). */
function alternarGrupoOculto(nome) {
    const estava = grupoOculto(nome);
    mutar((d) => {
        const lista = new Set(d.gruposOcultos || []);
        if (estava) lista.delete(nome); else lista.add(nome);
        d.gruposOcultos = [...lista];
    });
    avisar(estava ? `Grupo “${nome}” visível no Smart Localizadores.` : `Grupo “${nome}” oculto no Smart Localizadores.`, 'Desfazer', desfazer);
}

function renomearGrupo(antigo, novo, desfazerRegras = null) {
    mutar((d) => {
        d.gruposOcultos = (d.gruposOcultos || []).map(g => (g === antigo ? novo : g));
        d.grupos = d.grupos.map(g => (g === antigo ? novo : g));
        d.estrutura[novo] = d.estrutura[antigo] || [];
        delete d.estrutura[antigo];
    }, desfazerRegras);
}

function excluirGrupo(nome) {
    if (edicaoGrupo?.nome === nome) edicaoGrupo = null;
    const n = (dados.estrutura[nome] || []).length;
    mutar((d) => {
        d.estrutura[SEM_GRUPO].push(...(d.estrutura[nome] || []));
        delete d.estrutura[nome];
        d.grupos = d.grupos.filter(g => g !== nome);
        d.gruposOcultos = (d.gruposOcultos || []).filter(g => g !== nome);
    });
    avisar(`Grupo “${nome}” excluído${n ? '; ' + (n === 1 ? 'o item voltou' : 'os ' + n + ' itens voltaram') + ' para Sem grupo' : ''}.`, 'Desfazer', desfazer);
}

function reordenarGrupo(nome, antesNome) {
    if (nome === antesNome) return;
    mutar((d) => {
        d.grupos = d.grupos.filter(g => g !== nome);
        const i = antesNome == null ? -1 : d.grupos.indexOf(antesNome);
        if (i < 0) d.grupos.push(nome); else d.grupos.splice(i, 0, nome);
    });
}

function deslocarGrupo(nome, passo) {
    const vis = gruposVisiveis();
    const i = vis.indexOf(nome);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= vis.length) return;
    focoGrip = nome;
    // Insere antes do vizinho (para a esquerda) ou antes do seguinte ao vizinho (para a direita).
    reordenarGrupo(nome, passo < 0 ? vis[j] : (vis[j + 1] ?? null));
}

// ---------- Avisos ----------
let toastTimer = null;
function avisar(texto, rotuloAcao = null, acao = null) {
    const t = $('#toast');
    $('#toastTexto').textContent = texto;
    const botao = $('#toastAcao');
    botao.hidden = !rotuloAcao;
    botao.textContent = rotuloAcao || '';
    botao.onclick = () => { t.hidden = true; if (acao) acao(); };
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, rotuloAcao ? 7000 : 3500);
}

// ---------- Renderização ----------
function aplicarSelecaoNoDom() {
    quadro.querySelectorAll('.item').forEach((it) => {
        const on = sel.has(it.dataset.k);
        it.classList.toggle('sel', on);
        it.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    atualizarBarraSelecao();
}

function atualizarBarraSelecao() {
    const barra = $('#barraSel');
    const n = sel.size;
    barra.hidden = n === 0;
    const editor = $('#editarSelecao');
    const item = modulo === 'loc' && n === 1 ? [...sel][0] : null;
    const rotulo = catalogoMapa.get(item);
    editor.hidden = !rotulo;
    if (edicaoItem?.item !== item || edicaoItem?.origem !== origem) edicaoItem = null;
    if (!rotulo) editor.replaceChildren();
    else if (edicaoItem) {
        if (editor.firstChild !== edicaoItem.form) editor.replaceChildren(edicaoItem.form);
    } else if (editor.firstChild?.dataset.item !== item) {
        const editar = el('button', { type: 'button', className: 'btn', textContent: 'Editar localizador', dataset: { item } });
        editar.onclick = () => {
            const o = origem;
            const nome = nomeLoc(rotulo);
            const az = regraAZ(rotulo);
            const fechar = () => {
                const ativa = edicaoItem?.form === form;
                if (ativa) edicaoItem = null;
                if (ativa && o === origem) {
                    atualizarBarraSelecao();
                    editor.querySelector('button')?.focus();
                }
            };
            // Cor própria pelo ID ("id:<ID>", sobrevive à renomeação) e pelo nome (a extensão ainda lê por nome).
            const form = controlesCor(coresLoc['id:' + item] || coresLoc[nome], az, false, async regra => {
                await gravarCorPropria(o, 'id:' + item, regra);
                await gravarCorPropria(o, nome, regra);
                fechar();
            }, fechar);
            edicaoItem = { item, origem: o, form };
            atualizarBarraSelecao();
            form.querySelector('button, input, select')?.focus();
        };
        editor.replaceChildren(editar);
    }
    if (!n) return;
    $('#selN').textContent = n === 1 ? '1 selecionado' : `${n} selecionados`;
    const select = $('#destino');
    const atual = select.value;
    select.replaceChildren(...[SEM_GRUPO, GRUPO_OCULTOS, ...gruposVisiveis()].map(g => el('option', { value: g, textContent: nomeExibido(g) })));
    if ([...select.options].some(o => o.value === atual)) select.value = atual;
}

function controlesCor(regra = {}, az, grupo, salvarRegra, cancelar, campoNome = null) {
    const form = el('form', { className: 'controles-cor' });
    const cor = el('input', { type: 'color', value: corHex(regra.cor), 'aria-label': 'Cor personalizada' });
    const prioridade = el('select', { 'aria-label': grupo ? 'Prioridade do grupo' : 'Prioridade do localizador' });
    if (grupo) prioridade.append(el('option', { value: '', textContent: 'Padrão' }));
    for (let i = 0; i <= 9; i++) {
        prioridade.append(el('option', { value: String(i), textContent: i === 9 && !grupo ? '9 (herdar)' : String(i) }));
    }
    prioridade.value = String(regra.prio ?? (grupo ? '' : 9));

    const limpar = el('button', { type: 'button', className: 'btn', textContent: 'Sem cor' });
    let fundo = regra.cor || '';
    let texto = regra.tx || '';
    const paleta = el('div', { className: 'paleta-cor', role: 'group', 'aria-label': 'Cores padrão' });
    const botoes = PALETA_LOCALIZADORES.map(({ bg, tx }) => {
        const botao = el('button', { type: 'button', title: bg, 'aria-label': 'Cor ' + bg });
        botao.style.backgroundColor = bg;
        botao.onclick = () => escolher(bg, tx);
        paleta.append(botao);
        return { botao, bg };
    });

    function escolher(bg, tx = '') {
        fundo = bg;
        texto = tx;
        cor.value = corHex(bg);
        limpar.disabled = !bg;
        for (const { botao, bg: amostra } of botoes) {
            botao.setAttribute('aria-pressed', String(bg.toLowerCase() === amostra));
        }
    }

    escolher(fundo, texto);
    cor.addEventListener('input', () => escolher(cor.value));
    cor.addEventListener('change', () => escolher(cor.value, texto));
    limpar.onclick = () => escolher('');
    const gravar = el('button', { type: 'submit', className: 'btn primary', textContent: 'Salvar' });
    const voltar = el('button', { type: 'button', className: 'btn', textContent: 'Cancelar', onclick: cancelar });
    const erro = el('p', { className: 'erro erro-cor', role: 'alert', hidden: true });
    if (campoNome) form.append(el('label', { className: 'campo-nome-grupo' }, 'Nome do grupo', campoNome));
    if (az) form.append(el('span', { textContent: 'Cor do AZFlow' }));
    else form.append(paleta, el('div', { className: 'opcoes-cor' },
        el('label', {}, 'Personalizada', cor), limpar));
    form.append(el('label', {}, 'Prioridade', prioridade), el('div', { className: 'acoes-cor' }, voltar, gravar), erro);
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (gravar.disabled) return;
        gravar.disabled = voltar.disabled = true;
        erro.hidden = true;
        try {
            await salvarRegra({ ...regra, cor: fundo, tx: texto, prio: prioridade.value === '' ? null : Number(prioridade.value) });
        } catch (falha) {
            erro.textContent = falha.message || 'Não foi possível salvar. Tente de novo.';
            erro.hidden = false;
        } finally {
            gravar.disabled = voltar.disabled = false;
        }
    });
    form.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !voltar.disabled) {
            e.stopPropagation();
            cancelar();
        }
    });
    return form;
}

function editarGrupo(nome) {
    if (edicaoGrupo?.nome === nome) {
        edicaoGrupo.form.querySelector('.nome-input')?.focus();
        return;
    }
    const o = origem;
    const campo = el('input', { className: 'nome-input', type: 'text', value: nome, maxLength: 60, required: true });
    const fechar = (nomeFocus = nome) => {
        if (edicaoGrupo?.form !== form) return;
        edicaoGrupo = null;
        render();
        quadro.querySelector(`[data-g="${CSS.escape(nomeFocus)}"] .editar-grupo`)?.focus();
    };
    const form = controlesCor(regras[nome], null, true, async regra => {
        const novo = campo.value.trim();
        const msg = validarNome(novo, nome);
        if (msg) { campo.focus(); throw new Error(msg); }
        const atuais = await lerRegrasGrupos(o);
        const regraAnterior = atuais[nome];
        const regraDestino = atuais[novo];
        if (o !== origem || edicaoGrupo?.form !== form) return;
        if (novo !== nome) delete atuais[nome];
        atuais[novo] = regra;
        await gravarRegrasGrupos(o, atuais);
        if (o !== origem || edicaoGrupo?.form !== form) return;
        if (novo !== nome) renomearGrupo(nome, novo, async () => {
            const mapa = await lerRegrasGrupos(o);
            mapa[nome] = regraAnterior;
            mapa[novo] = regraDestino;
            await gravarRegrasGrupos(o, mapa);
        });
        fechar(novo);
    }, () => fechar(), campo);
    edicaoGrupo = { nome, form };
    render();
    campo.focus();
    campo.select();
}

function painelGrupo(nome) {
    const oculto = nome === GRUPO_OCULTOS;
    const fixo = nome === SEM_GRUPO || oculto;
    const todos = itensDoGrupo(nome);
    const filtro = filtrosGrupo.get(nome) || '';
    const itens = todos.filter(i => (norm(nomeExibido(nome)).includes(termo) || norm(i.r).includes(termo)) && norm(i.r).includes(norm(filtro.trim())));

    const escondido = grupoOculto(nome);
    const painel = el('section', { className: 'painel' + (nome === SEM_GRUPO ? ' inbox' : '') + (oculto ? ' ocultos' : '') + (escondido ? ' grupo-oculto' : ''), dataset: { g: nome } });
    const cab = el('div', { className: 'painel-cab' });

    const ferramentas = el('div', { className: 'painel-ferramentas' });
    const busca = el('input', { className: 'filtro-grupo', type: 'search', placeholder: 'Filtrar grupo', value: filtro, 'aria-label': `Filtrar ${nomeExibido(nome)}` });
    busca.addEventListener('input', () => {
        filtrosGrupo.set(nome, busca.value);
        render();
        quadro.querySelector(`[data-g="${CSS.escape(nome)}"] .filtro-grupo`)?.focus();
    });
    ferramentas.append(busca);
    if (!fixo) {
        const grip = el('button', { type: 'button', className: 'icone-btn grip', innerHTML: SVG.grip, title: 'Arraste para reordenar. Com o foco aqui, use as setas esquerda e direita.' });
        grip.setAttribute('aria-label', `Reordenar o grupo ${nome}`);
        grip.dataset.grip = nome;
        grip.addEventListener('pointerdown', () => { painel.draggable = true; });
        grip.addEventListener('pointerup', () => { painel.draggable = false; });
        grip.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); deslocarGrupo(nome, -1); }
            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); deslocarGrupo(nome, 1); }
        });
        cab.append(grip);
    }

    if (oculto) cab.append(el('span', { className: 'cab-icone', innerHTML: SVG.eyeOff, title: 'Itens deste grupo ficam ocultos no Smart Localizadores' }));
    cab.append(el('h2', { textContent: nomeExibido(nome), title: oculto ? 'Itens deste grupo ficam ocultos no Smart Localizadores' : nomeExibido(nome) }));
    if (modulo === 'loc' && regras[nome]?.cor) {
        const amostra = el('span', { className: 'amostra-cor', role: 'img', 'aria-label': 'Cor do grupo', title: 'Cor do grupo' });
        amostra.style.backgroundColor = regras[nome].cor;
        cab.append(amostra);
    }
    cab.append(el('span', { className: 'contagem', textContent: String(todos.length) }));

    // Olho (sempre visível): aberto = o grupo aparece no Smart Localizadores; fechado (riscado e translúcido) = não aparece.
    if (!fixo && modulo === 'loc') {
        const olho = el('button', {
            type: 'button', className: 'icone-btn olho' + (escondido ? ' fechado' : ''), innerHTML: escondido ? SVG.eyeOff : SVG.eye,
            title: escondido ? 'Oculto: o grupo não aparece no Smart Localizadores. Clique para mostrar.' : 'Visível no Smart Localizadores. Clique para ocultar o grupo.'
        });
        olho.setAttribute('aria-label', escondido ? `Mostrar o grupo ${nome} no Smart Localizadores` : `Ocultar o grupo ${nome} do Smart Localizadores`);
        olho.setAttribute('aria-pressed', String(escondido));
        olho.addEventListener('click', () => alternarGrupoOculto(nome));
        ferramentas.append(olho);
    }

    if (!fixo) {
        const acoes = el('div', { className: 'acoes-grupo' });
        const localizadores = modulo === 'loc';
        const acaoEditar = localizadores ? 'Editar' : 'Renomear';
        const editar = el('button', { type: 'button', className: 'icone-btn editar-grupo', innerHTML: SVG.edit,
            title: acaoEditar + ' grupo', 'aria-label': `${acaoEditar} o grupo ${nome}` });
        if (localizadores) editar.setAttribute('aria-expanded', String(edicaoGrupo?.nome === nome));
        editar.addEventListener('click', () => {
            if (localizadores) editarGrupo(nome);
            else renomearInline(painel, nome);
        });
        const excluir = el('button', { type: 'button', className: 'icone-btn perigo', innerHTML: SVG.trash, title: 'Excluir grupo' });
        excluir.setAttribute('aria-label', `Excluir o grupo ${nome}`);
        excluir.addEventListener('click', () => excluirGrupo(nome));
        acoes.append(editar);
        acoes.append(excluir);
        ferramentas.append(acoes);
    }
    painel.append(cab, ferramentas);
    if (modulo === 'loc' && edicaoGrupo?.nome === nome) painel.append(edicaoGrupo.form);

    const lista = el('ul', { className: 'lista', dataset: { g: nome }, role: 'listbox' });
    lista.setAttribute('aria-multiselectable', 'true');
    lista.setAttribute('aria-label', `Itens de ${nomeExibido(nome)}`);
    for (const i of itens) {
        const li = el('li', { className: 'item' + (sel.has(i.k) ? ' sel' : ''), role: 'option', draggable: true, dataset: { k: i.k }, title: i.r });
        li.setAttribute('aria-selected', sel.has(i.k) ? 'true' : 'false');
        li.tabIndex = focoItem === i.k ? 0 : -1;
        if (modulo === 'loc') {
            const az = regraAZ(i.r), pessoal = coresLoc['id:' + i.k] || coresLoc[nomeLoc(i.r)];
            const cor = az || pessoal;
            if (cor?.cor && CSS.supports('color', cor.cor)) {
                const amostra = el('span', { className: 'amostra-cor', title: az ? 'Cor do AZFlow' : 'Cor própria' });
                amostra.style.backgroundColor = cor.cor;
                li.append(amostra);
            }
        }
        li.append(el('span', { className: 'rotulo', textContent: i.r }));
        li.append(el('span', { className: 'marca', innerHTML: SVG.check }));
        lista.append(li);
    }
    if (!itens.length) {
        lista.append(el('li', { className: 'vazio-grupo', role: 'presentation', textContent: termo || filtro ? 'Nenhum item corresponde ao filtro.' : (oculto ? 'Itens aqui ficam ocultos no Smart Localizadores.' : fixo ? 'Tudo está em grupos.' : 'Arraste itens para cá.') }));
    }
    painel.append(lista);
    return painel;
}

function painelNovo() {
    const painel = el('section', { className: 'painel painel-novo' });
    const cab = el('div', { className: 'painel-cab' }, el('h2', { textContent: 'Novo grupo' }));
    const entrada = el('input', { className: 'nome-input', type: 'text', maxLength: 60, placeholder: 'Nome do grupo' });
    entrada.setAttribute('aria-label', 'Nome do novo grupo');
    const erro = el('p', { className: 'erro', hidden: true });
    erro.setAttribute('role', 'alert');
    const confirmar = () => {
        const msg = validarNome(entrada.value);
        if (msg) { erro.textContent = msg; erro.hidden = false; entrada.focus(); return; }
        criando = false;
        criarGrupo(entrada.value.trim());
    };
    entrada.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
        else if (e.key === 'Escape') { criando = false; render(); }
    });
    painel.append(cab, el('div', { className: 'corpo' }, entrada, erro, el('p', { className: 'ajuda', textContent: 'Enter cria o grupo; Esc cancela.' })));
    queueMicrotask(() => entrada.focus());
    return painel;
}

function estadoVazio() {
    const e = el('section', { className: 'estado' });
    e.append(el('h2', { textContent: `Ainda não há grupos de ${NOMES[modulo].toLowerCase()} guardados` }));
    e.append(el('p', { textContent: 'O organizador trabalha com as abas do eproc abertas agora no navegador. Para carregar:' }));
    const passos = modulo === 'loc'
        ? ['Ligue “Smart Localizadores & Eventos” em CFG > Configurações > Navegador.', 'Abra no eproc uma tela com o campo de localizador (por exemplo, a lista de processos).', 'Volte aqui e atualize.']
        : ['Ligue “Smart Localizadores & Eventos” em CFG > Configurações > Navegador.', 'Abra no eproc um processo com o campo “Agendar lançamento de evento”.', 'Use “Recarregar e sincronizar eventos” na barra do módulo e volte aqui.'];
    e.append(el('ol', {}, ...passos.map(p => el('li', { textContent: p }))));
    e.append(el('button', { type: 'button', className: 'btn primary', textContent: 'Atualizar', onclick: () => carregar() }));
    return e;
}

function render() {
    document.documentElement.dataset.m = modulo;
    document.title = `Organizar grupos: ${NOMES[modulo]} - SuperPROC`;
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === modulo)));
    $('#desfazer').disabled = historico.length === 0;
    $('#novoGrupo').disabled = !dados;

    const rolagens = new Map([...quadro.querySelectorAll('.lista')].map(l => [l.dataset.g, l.scrollTop]));
    const rolagemQuadro = quadro.scrollTop;
    quadro.replaceChildren();

    if (!dados) { quadro.append(estadoVazio()); atualizarBarraSelecao(); return; }

    // Descarta seleção de itens que não existem mais.
    const existentes = new Set(ordemVisivel());
    sel = new Set([...sel].filter(k => existentes.has(k)));
    if (!focoItem || !existentes.has(focoItem)) focoItem = ordemVisivel()[0] || null;

    if (modulo === 'loc' && !catalogoMapa.size) {
        quadro.append(el('p', { className: 'aviso', textContent: 'Os nomes dos localizadores ainda não foram capturados nesta instância. Abra no eproc uma tela com o campo de localizador para carregá-los.' }));
    }

    // Coluna lateral fixa: itens sem grupo e, abaixo, os ocultos (não aparecem nos menus do eproc em uso).
    quadro.append(el('div', { className: 'lateral' }, painelGrupo(SEM_GRUPO), painelGrupo(GRUPO_OCULTOS)));
    const grade = el('div', { className: 'grupos' });
    if (criando) grade.append(painelNovo());
    for (const g of gruposVisiveis()) grade.append(painelGrupo(g));
    if (!gruposVisiveis().length && !criando) {
        grade.append(el('div', { className: 'estado', style: 'margin:0' }, el('h2', { textContent: 'Nenhum grupo ainda' }), el('p', { textContent: 'Crie um grupo em “Novo grupo” e arraste os itens de “Sem grupo” para ele.' })));
    }
    quadro.append(grade);
    if (modulo === 'evt' && (dados.estrutura[GRUPO_BASE_EVENTOS] || []).length) {
        quadro.append(el('p', { className: 'nota-base', textContent: `A “Base do Tribunal” (${dados.estrutura[GRUPO_BASE_EVENTOS].length} eventos) é mantida automaticamente pelo módulo e não aparece aqui.` }));
    }

    quadro.scrollTop = rolagemQuadro;
    quadro.querySelectorAll('.lista').forEach(l => { if (rolagens.has(l.dataset.g)) l.scrollTop = rolagens.get(l.dataset.g); });
    atualizarBarraSelecao();

    if (focoGrip) {
        const b = quadro.querySelector(`[data-grip="${CSS.escape(focoGrip)}"]`);
        if (b) b.focus();
        focoGrip = null;
    }
}

function renomearInline(painel, nome) {
    const h2 = $('h2', painel);
    const entrada = el('input', { className: 'nome-input', type: 'text', value: nome, maxLength: 60 });
    entrada.setAttribute('aria-label', `Novo nome do grupo ${nome}`);
    h2.replaceWith(entrada);
    entrada.focus();
    entrada.select();
    let pronto = false;
    const fim = (confirmar) => {
        if (pronto) return;
        pronto = true;
        const novo = entrada.value.trim();
        if (!confirmar || novo === nome) { render(); return; }
        const msg = validarNome(novo, nome);
        if (msg) { render(); avisar(msg); return; }
        renomearGrupo(nome, novo);
    };
    entrada.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); fim(true); }
        else if (e.key === 'Escape') fim(false);
    });
    entrada.addEventListener('blur', () => fim(true));
}

// ---------- Seleção ----------
function itensDaLista(lista) { return [...lista.querySelectorAll('.item')]; }

function selecionarSo(k) { sel = new Set([k]); ancora = k; }
function alternar(k) { if (sel.has(k)) sel.delete(k); else sel.add(k); ancora = k; }

function selecionarIntervalo(itemEl) {
    const lista = itemEl.closest('.lista');
    const itens = itensDaLista(lista);
    const a = itens.findIndex(i => i.dataset.k === ancora);
    const b = itens.indexOf(itemEl);
    if (a < 0 || b < 0) { selecionarSo(itemEl.dataset.k); return; }
    const [de, ate] = a < b ? [a, b] : [b, a];
    sel = new Set(itens.slice(de, ate + 1).map(i => i.dataset.k));
}

function definirFoco(itemEl) {
    quadro.querySelectorAll('.item[tabindex="0"]').forEach(i => { i.tabIndex = -1; });
    itemEl.tabIndex = 0;
    focoItem = itemEl.dataset.k;
    itemEl.focus();
}

quadro.addEventListener('click', (e) => {
    if (acabouMarquee) { acabouMarquee = false; return; }
    const it = e.target.closest('.item');
    if (!it) {
        if (e.target.closest('button, input, select, .painel-cab')) return;
        if (sel.size) { sel = new Set(); aplicarSelecaoNoDom(); }
        return;
    }
    if (e.shiftKey) return; // tratado no pointerup (Shift + clique) para não colidir com Shift + arrastar
    if (e.ctrlKey || e.metaKey) alternar(it.dataset.k); else selecionarSo(it.dataset.k);
    focoItem = it.dataset.k;
    aplicarSelecaoNoDom();
});

quadro.addEventListener('keydown', (e) => {
    const it = e.target.closest && e.target.closest('.item');
    if (!it) return;
    const itens = itensDaLista(it.closest('.lista'));
    const i = itens.indexOf(it);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const alvo = itens[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (!alvo) return;
        if (e.shiftKey) { sel.add(it.dataset.k); sel.add(alvo.dataset.k); aplicarSelecaoNoDom(); }
        definirFoco(alvo);
    } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        alternar(it.dataset.k);
        aplicarSelecaoNoDom();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        sel = new Set(itens.map(x => x.dataset.k));
        aplicarSelecaoNoDom();
    }
});

// Shift + arrastar o mouse: retângulo de seleção (soma à seleção atual). Shift + clique sem mover: intervalo.
quadro.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.shiftKey || !dados || e.target.closest('input, select, textarea, .painel-cab')) return;
    e.preventDefault();
    const base = new Set(sel);
    const inicio = { x: e.clientX, y: e.clientY };
    const itemInicial = e.target.closest('.item');
    const caixa = el('div', { className: 'marquee' });
    let moveu = false;

    const aoMover = (ev) => {
        if (!moveu && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 4) return;
        if (!moveu) { moveu = true; marqueeAtivo = true; document.body.append(caixa); }
        const x1 = Math.min(inicio.x, ev.clientX), y1 = Math.min(inicio.y, ev.clientY);
        const x2 = Math.max(inicio.x, ev.clientX), y2 = Math.max(inicio.y, ev.clientY);
        Object.assign(caixa.style, { left: x1 + 'px', top: y1 + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
        const novo = new Set(base);
        quadro.querySelectorAll('.item').forEach((it) => {
            const r = it.getBoundingClientRect();
            if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) return;
            const l = it.closest('.lista').getBoundingClientRect(); // só o que está visível dentro da lista rolável
            if (r.bottom < l.top || r.top > l.bottom) return;
            novo.add(it.dataset.k);
        });
        sel = novo;
        aplicarSelecaoNoDom();
    };
    const aoSoltar = () => {
        document.removeEventListener('pointermove', aoMover);
        document.removeEventListener('pointerup', aoSoltar);
        document.removeEventListener('pointercancel', aoSoltar);
        caixa.remove();
        marqueeAtivo = false;
        // O "click" que o navegador dispara ao soltar não deve limpar a seleção recém-feita.
        if (moveu) { acabouMarquee = true; setTimeout(() => { acabouMarquee = false; }, 120); }
        else if (itemInicial) { selecionarIntervalo(itemInicial); focoItem = itemInicial.dataset.k; aplicarSelecaoNoDom(); }
    };
    document.addEventListener('pointermove', aoMover);
    document.addEventListener('pointerup', aoSoltar, { once: true });
    document.addEventListener('pointercancel', aoSoltar, { once: true });
});

// ---------- Arrastar e soltar ----------
function limparIndicadores() {
    quadro.querySelectorAll('.insere-antes, .insere-fim, .alvo, .alvo-antes, .alvo-depois').forEach((n) => n.classList.remove('insere-antes', 'insere-fim', 'alvo', 'alvo-antes', 'alvo-depois'));
}

quadro.addEventListener('dragstart', (e) => {
    const it = e.target.closest && e.target.closest('.item');
    if (it) {
        if (!sel.has(it.dataset.k)) { selecionarSo(it.dataset.k); aplicarSelecaoNoDom(); }
        const keys = ordemVisivel().filter(k => sel.has(k));
        drag = { tipo: 'itens', keys };
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', keys.join('\n')); } catch { /* sem dados de transferência */ }
        // Imagem de arrasto compacta: contador (só quando há vários) + nome truncado. Fica à direita/abaixo do cursor
        // (deslocamento negativo) para não cobrir o ponto onde o item vai cair nem a linha de inserção.
        const fantasma = el('div', { className: 'ghost' },
            keys.length > 1 ? el('span', { className: 'ghost-n', textContent: String(keys.length) }) : null,
            el('span', { className: 'ghost-r', textContent: it.title }));
        document.body.append(fantasma);
        e.dataTransfer.setDragImage(fantasma, -14, -12);
        setTimeout(() => fantasma.remove(), 0);
        requestAnimationFrame(() => quadro.querySelectorAll('.item').forEach(n => n.classList.toggle('fantasma', sel.has(n.dataset.k))));
        return;
    }
    const painel = e.target.closest && e.target.closest('.painel[draggable="true"]');
    if (painel && e.target === painel) {
        drag = { tipo: 'grupo', nome: painel.dataset.g };
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', painel.dataset.g); } catch { /* sem dados de transferência */ }
        requestAnimationFrame(() => painel.classList.add('arrastando-grupo'));
    }
});

quadro.addEventListener('dragover', (e) => {
    if (!drag) return;
    const painel = e.target.closest('.painel');
    if (!painel || painel.classList.contains('painel-novo')) return;
    if (drag.tipo === 'itens') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        limparIndicadores();
        const lista = $('.lista', painel);
        let antes = null;
        for (const it of lista.querySelectorAll('.item:not(.fantasma)')) {
            const r = it.getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) { antes = it; break; }
        }
        if (antes) antes.classList.add('insere-antes'); else lista.classList.add('insere-fim');
        painel.classList.add('alvo');
        dropInfo = { grupo: painel.dataset.g, antes: antes ? antes.dataset.k : null };
    } else if (drag.tipo === 'grupo' && painel.dataset.g !== SEM_GRUPO && painel.dataset.g !== GRUPO_OCULTOS && painel.dataset.g !== drag.nome) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        limparIndicadores();
        const r = painel.getBoundingClientRect();
        const antes = e.clientX < r.left + r.width / 2;
        painel.classList.add(antes ? 'alvo-antes' : 'alvo-depois');
        const vis = gruposVisiveis();
        const idx = vis.indexOf(painel.dataset.g);
        dropInfo = { grupo: drag.nome, antes: antes ? painel.dataset.g : (vis[idx + 1] ?? null) };
    }
});

quadro.addEventListener('dragleave', (e) => {
    if (!quadro.contains(e.relatedTarget)) limparIndicadores();
});

quadro.addEventListener('drop', (e) => {
    if (!drag || !dropInfo) return;
    e.preventDefault();
    const atual = drag;
    const alvo = dropInfo;
    fimDoArrasto();
    if (atual.tipo === 'itens') {
        sel = new Set(atual.keys);
        moverSelecao(alvo.grupo, alvo.antes);
    } else {
        reordenarGrupo(atual.nome, alvo.antes);
    }
});

function fimDoArrasto() {
    drag = null;
    dropInfo = null;
    limparIndicadores();
    quadro.querySelectorAll('.fantasma, .arrastando-grupo').forEach(n => n.classList.remove('fantasma', 'arrastando-grupo'));
    quadro.querySelectorAll('.painel[draggable="true"]').forEach(p => { p.draggable = false; });
}
quadro.addEventListener('dragend', fimDoArrasto);

// ---------- Barra superior e atalhos ----------
$('#novoGrupo').addEventListener('click', () => { if (!dados) return; criando = true; render(); });
$('#desfazer').addEventListener('click', desfazer);
$('#mover').addEventListener('click', () => moverSelecao($('#destino').value));
$('#limpar').addEventListener('click', () => { sel = new Set(); aplicarSelecaoNoDom(); });
$('#busca').addEventListener('input', (e) => { termo = norm(e.target.value.trim()); render(); });
$('#origem').addEventListener('change', (e) => { origem = e.target.value; try { localStorage.setItem('superproc_org_origem', origem); } catch { /* preferência opcional */ } abrirOrigem(); });

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.m === modulo) return;
    modulo = b.dataset.m;
    history.replaceState(null, '', '?m=' + modulo);
    historico.length = 0;
    sel = new Set();
    criando = false;
    carregar();
}));

document.addEventListener('keydown', (e) => {
    if (e.target.closest('.controles-cor')) return;
    // Com itens selecionados, o primeiro Esc só limpa a seleção; o seguinte fecha o organizador.
    if (e.key === 'Escape' && sel.size && !e.target.closest('input')) { e.preventDefault(); sel = new Set(); aplicarSelecaoNoDom(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input')) { e.preventDefault(); desfazer(); }
});

async function atualizarCores() {
    const o = origem;
    if (!o || modulo !== 'loc') { regras = {}; coresLoc = {}; coresAZ = {}; return; }
    const [grupos, cores] = await Promise.all([lerRegrasGrupos(o), lerCoresLoc(o)]);
    if (o !== origem || modulo !== 'loc') return;
    regras = grupos;
    coresLoc = cores.proprias || {};
    coresAZ = cores.az || {};
}

aoMudarRegrasGrupos((o, novas) => {
    if (o !== origem || modulo !== 'loc') return;
    regras = novas;
    render();
});
aoMudarCores((o) => {
    if (modulo !== 'loc' || !origem || o !== origem) return;
    atualizarCores().then(render);
});

// ---------- Carga ----------
async function abrirOrigem() {
    edicaoGrupo = edicaoItem = null;
    $('#editarSelecao').replaceChildren();
    filtrosGrupo.clear();
    historico.length = 0;
    sel = new Set();
    focoItem = null;
    const mapa = origensDisponiveis.find(o => o.origem === origem);
    dados = mapa ? clonar(mapa.dados) : null;
    await atualizarCores();
    reconstruirCatalogo();
    render();
}

async function carregar() {
    let mapa;
    try { mapa = await lerEspelho(modulo); }
    catch (_) {
        // Falha ao ler as abas do eproc: mostra o estado vazio com o aviso, em vez de deixar o quadro em branco.
        origensDisponiveis = [];
        dados = null;
        render();
        mostrarStatus('Não foi possível ler os dados das abas do eproc. Tente "Atualizar".', true);
        return;
    }
    origensDisponiveis = Object.keys(mapa)
        .map(o => ({ origem: o, dados: normalizarDados(modulo, mapa[o]) }))
        .filter(o => o.dados)
        .sort((a, b) => b.dados.at - a.dados.at);

    let preferida = null;
    try { preferida = localStorage.getItem('superproc_org_origem'); } catch { /* preferência opcional */ }
    origem = origensDisponiveis.some(o => o.origem === origem) ? origem
        : origensDisponiveis.some(o => o.origem === preferida) ? preferida
        : (origensDisponiveis[0] ? origensDisponiveis[0].origem : null);

    const select = $('#origem');
    select.replaceChildren(...origensDisponiveis.map(o => el('option', { value: o.origem, textContent: new URL(o.origem).host })));
    if (origem) select.value = origem;
    $('#origemBox').hidden = origensDisponiveis.length < 2;
    const rotulo = $('#origemRotulo');
    rotulo.hidden = origensDisponiveis.length !== 1;
    if (origensDisponiveis.length === 1) rotulo.textContent = new URL(origem).host;

    mostrarStatus('');
    abrirOrigem();
}

// Mudanças vindas do eproc enquanto o organizador está aberto (não interrompe arrasto, edição ou seleção por retângulo).
['loc', 'evt'].forEach((tipo) => aoMudarEspelho(tipo, (o, novos) => {
    if (tipo !== modulo || !novos) return;
    const conhecida = origensDisponiveis.find(x => x.origem === o);
    if (conhecida && conhecida.dados.at >= novos.at) return;
    if (o === origem && dados && novos.at <= dados.at) return;
    const atualizar = () => {
        if (tipo !== modulo) return;
        if (drag || marqueeAtivo || edicaoGrupo || edicaoItem || document.activeElement?.matches?.('input')) {
            setTimeout(atualizar, 1500);
            return;
        }
        carregar().then(() => avisar('Atualizado a partir do eproc.'));
    };
    atualizar();
}));

carregar();

})();

// ---------- Fechar (o organizador é um painel dentro da janela do navegador) ----------
document.getElementById('fecharOrganizador').addEventListener('click', () => window.orgApi.fechar());
// Esc fecha, salvo quando outro controle já tratou a tecla (formulários, edição) ou o foco está num campo.
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const alvo = e.target;
    if (alvo && (alvo.closest('input, textarea, select, [contenteditable="true"], form') || alvo.isContentEditable)) return;
    e.preventDefault();
    window.orgApi.fechar();
});
