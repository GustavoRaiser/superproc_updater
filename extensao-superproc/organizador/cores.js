/**
 * Cores dos grupos de localizadores: regras genéricas por grupo do Smart Localizadores (colorir o grupo todo e prioridade do grupo).
 * Os grupos são só lidos do espelho do Smart (core/smartorg.js); as regras ficam em core/coresgrupos.js.
 * Quem pinta é o módulo "Localizadores - Coloridos & Priorizados". Precedência de cor: AZflow > cor própria do localizador > cor do grupo.
 */
import { lerEspelho, aoMudarEspelho, normalizarDados, SEM_GRUPO, GRUPO_OCULTOS } from '../core/smartorg.js';
import { lerRegrasGrupos, gravarRegrasGrupos, aoMudarRegrasGrupos } from '../core/coresgrupos.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

const PALETA = [
    { bg: '#e9ecef', tx: '#495057' }, { bg: '#007bff', tx: '#ffffff' }, { bg: '#28a745', tx: '#ffffff' }, { bg: '#dc3545', tx: '#ffffff' },
    { bg: '#fd7e14', tx: '#ffffff' }, { bg: '#6f42c1', tx: '#ffffff' }, { bg: '#e83e8c', tx: '#ffffff' }, { bg: '#17a2b8', tx: '#ffffff' },
    { bg: '#ffc107', tx: '#212529' }, { bg: '#343a40', tx: '#ffffff' }, { bg: '#6610f2', tx: '#ffffff' }, { bg: '#20c997', tx: '#ffffff' },
    { bg: '#795548', tx: '#ffffff' }, { bg: '#cddc39', tx: '#212529' }, { bg: '#ff5722', tx: '#ffffff' }, { bg: '#708090', tx: '#ffffff' }
];

function corDoTexto(hex) {
    const r = parseInt(hex.substr(1, 2), 16) || 0, g = parseInt(hex.substr(3, 2), 16) || 0, b = parseInt(hex.substr(5, 2), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#212529' : '#ffffff';
}

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

let origem = null;
let dados = null;        // grupos do Smart (só leitura)
let regras = {};         // { grupo: { cor, tx, prio } }
let origens = [];
let salvando = Promise.resolve();

function mostrarStatus(texto, erro = false) {
    const s = $('#status');
    s.textContent = texto;
    s.classList.toggle('erro', erro);
}

function salvar() {
    // Serializa as gravações para que alterações rápidas não se atropelem.
    salvando = salvando
        .then(() => gravarRegrasGrupos(origem, regras))
        .then(() => mostrarStatus('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. As páginas abertas do eproc se atualizam sozinhas.'))
        .catch(() => mostrarStatus('Não foi possível salvar. Tente de novo.', true));
}

function alterar(grupo, mudanca) {
    const atual = regras[grupo] || { cor: '', tx: '', prio: null };
    const nova = { ...atual, ...mudanca };
    if (!nova.cor && (nova.prio === null || nova.prio === undefined)) delete regras[grupo]; else regras[grupo] = nova;
    salvar();
    render();
}

function linhaGrupo(nome, total) {
    const r = regras[nome] || { cor: '', tx: '', prio: null };

    const paleta = el('div', { className: 'paleta', role: 'group' });
    paleta.setAttribute('aria-label', `Cor do grupo ${nome}`);
    for (const c of PALETA) {
        const b = el('button', { type: 'button', className: 'amostra' + (r.cor === c.bg ? ' sel' : ''), title: c.bg });
        b.style.background = c.bg;
        b.setAttribute('aria-label', `Colorir o grupo ${nome} de ${c.bg}`);
        b.addEventListener('click', () => alterar(nome, { cor: c.bg, tx: c.tx }));
        paleta.append(b);
    }

    const livre = el('input', { type: 'color', className: 'cor-livre', value: r.cor || '#007bff', title: 'Outra cor' });
    livre.setAttribute('aria-label', `Outra cor para o grupo ${nome}`);
    livre.addEventListener('change', () => alterar(nome, { cor: livre.value, tx: corDoTexto(livre.value) }));

    const semCor = el('button', { type: 'button', className: 'btn', textContent: 'Sem cor', disabled: !r.cor, title: 'O grupo deixa de colorir seus localizadores' });
    semCor.addEventListener('click', () => alterar(nome, { cor: '', tx: '' }));

    const prio = el('select', {});
    prio.setAttribute('aria-label', `Prioridade do grupo ${nome}`);
    prio.append(el('option', { value: '', textContent: '— (sem prioridade)' }));
    for (let i = 0; i <= 9; i++) prio.append(el('option', { value: String(i), textContent: i === 9 ? '9 (padrão)' : String(i) }));
    prio.value = r.prio === null || r.prio === undefined ? '' : String(r.prio);
    prio.addEventListener('change', () => alterar(nome, { prio: prio.value === '' ? null : Number(prio.value) }));

    const previa = el('span', { className: 'previa', textContent: nome });
    if (r.cor) { previa.style.background = r.cor; previa.style.color = r.tx || corDoTexto(r.cor); previa.style.borderColor = 'transparent'; }

    return el('section', { className: 'grupo-cor', dataset: { g: nome } },
        el('div', {}, el('h2', { textContent: nome }), el('p', { className: 'sub', textContent: total === 1 ? '1 localizador' : `${total} localizadores` })),
        el('div', { className: 'controles' },
            el('span', { className: 'campo' }, 'Cor', paleta, livre, semCor),
            el('label', { className: 'campo' }, 'Prioridade', prio),
            previa));
}

function render() {
    const lista = $('#lista');
    lista.replaceChildren();
    const grupos = dados ? dados.grupos.filter(g => g !== SEM_GRUPO && g !== GRUPO_OCULTOS) : [];
    if (!grupos.length) {
        lista.append(el('div', { className: 'cores-vazio' },
            el('h2', { textContent: 'Nenhum grupo do Smart Localizadores identificado' }),
            el('p', { textContent: 'Os grupos aparecem aqui depois que o módulo “Smart - Localizadores” os tiver guardado (abra no eproc uma tela com o campo de localizador). Crie e organize os grupos em “Organizar grupos”.' })));
        return;
    }
    for (const g of grupos) lista.append(linhaGrupo(g, ((dados.estrutura[g]) || []).length));
}

async function carregar() {
    const mapa = await lerEspelho('loc');
    origens = Object.keys(mapa).map(o => ({ origem: o, dados: normalizarDados('loc', mapa[o]) })).filter(o => o.dados).sort((a, b) => b.dados.at - a.dados.at);
    let preferida = null;
    try { preferida = localStorage.getItem('superproc_org_origem'); } catch { /* preferência opcional */ }
    origem = origens.some(o => o.origem === origem) ? origem : origens.some(o => o.origem === preferida) ? preferida : (origens[0] ? origens[0].origem : null);

    const select = $('#origem');
    select.replaceChildren(...origens.map(o => el('option', { value: o.origem, textContent: new URL(o.origem).host })));
    if (origem) select.value = origem;
    $('#origemBox').hidden = origens.length < 2;
    const rotulo = $('#origemRotulo');
    rotulo.hidden = origens.length !== 1;
    if (origens.length === 1) rotulo.textContent = new URL(origem).host;

    dados = origem ? origens.find(o => o.origem === origem).dados : null;
    regras = origem ? await lerRegrasGrupos(origem) : {};
    mostrarStatus('');
    render();
}

$('#origem').addEventListener('change', (e) => {
    origem = e.target.value;
    try { localStorage.setItem('superproc_org_origem', origem); } catch { /* preferência opcional */ }
    carregar();
});

// Mudanças vindas de outra aba (grupos do Smart ou regras): recarrega sem atropelar o que está sendo gravado.
aoMudarEspelho('loc', () => carregar());
aoMudarRegrasGrupos((o) => { if (o === origem) salvando.then(carregar); });

carregar();
