'use strict';
const { LIMITES: LIMITES_CTX } = require('./context/tipos');
// AdminBroker: operações do navegador SuperPROC expostas, de forma controlada, a quem pede por comando (ferramentas do chat
// próprio, servidor MCP local da ponte do Copilot, harness CLI). Camada: host (processo principal). Sem Electron: tudo que toca
// o app entra por `host` (injetado), então os testes rodam em Node puro.
//
// Regras fixas:
//  - Três categorias de risco. 'leitura' (listar abas, buscar histórico, ler contexto), 'organizacao' (abrir, trocar, recarregar,
//    voltar, avançar) e 'destrutiva' (fechar, apagar histórico, mudar configuração). Cada categoria tem o seu interruptor em
//    `politica` (tudo DESLIGADO por padrão); 'destrutiva' ainda exige confirmação da pessoa A CADA chamada (`confirmar`).
//  - Abas são identificadas só pelos ids opacos do TabRegistry (tab_xxxxxxxx); nenhum id interno sai daqui.
//  - Endereços para abrir: só http(s), sem usuário/senha, até 2048 caracteres (e superproc-lei:// se o host permitir).
//  - Argumentos validados contra o JSON Schema da própria ferramenta (tipos, obrigatórios, enum, tamanho, padrão).
//  - Auditoria: `registrar` recebe só nome da ferramenta, categoria e código de resultado; nunca argumentos nem retornos.
//  - Limite de 30 chamadas por minuto.

const CATEGORIAS = Object.freeze({ leitura: 'leitura', organizacao: 'organizacao', destrutiva: 'destrutiva' });
const CODIGOS = Object.freeze({
  OK: 'OK', DESLIGADO: 'POLICY_DISABLED', NEGADO: 'USER_DENIED', INVALIDO: 'INVALID_ARGS', NAO_ACHADO: 'NOT_FOUND',
  URL: 'URL_NOT_ALLOWED', NAO_SUPORTADO: 'UNSUPPORTED', LIMITE: 'RATE_LIMITED', FALHA: 'FAILED', DESCONHECIDA: 'UNKNOWN_TOOL'
});
const RE_ID_ABA = '^tab_[0-9a-f]{8}$';
const RE_ID_LINK = '^[A-Za-z0-9_-]{1,64}$';
const MAX_URL = 2048;
const LIMITE_POR_MINUTO = 30;

// ---- validação de argumentos (subconjunto de JSON Schema: object/string/integer/boolean/array/enum) ----------------------
function validar(esquema, valor, caminho = 'args') {
  if (esquema.type === 'object') {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return `${caminho}: objeto esperado`;
    const props = esquema.properties || {};
    for (const k of Object.keys(valor)) if (!(k in props)) return `${caminho}.${k}: campo desconhecido`;
    for (const k of esquema.required || []) if (valor[k] === undefined) return `${caminho}.${k}: obrigatório`;
    for (const [k, sub] of Object.entries(props)) if (valor[k] !== undefined) { const e = validar(sub, valor[k], `${caminho}.${k}`); if (e) return e; }
    return null;
  }
  if (esquema.type === 'string') {
    if (typeof valor !== 'string') return `${caminho}: texto esperado`;
    if (esquema.maxLength !== undefined && valor.length > esquema.maxLength) return `${caminho}: longo demais`;
    if (esquema.minLength !== undefined && valor.length < esquema.minLength) return `${caminho}: curto demais`;
    if (esquema.pattern && !new RegExp(esquema.pattern).test(valor)) return `${caminho}: formato inválido`;
    if (esquema.enum && !esquema.enum.includes(valor)) return `${caminho}: valor não permitido`;
    return null;
  }
  if (esquema.type === 'integer') {
    if (!Number.isSafeInteger(valor)) return `${caminho}: inteiro esperado`;
    if (esquema.minimum !== undefined && valor < esquema.minimum) return `${caminho}: abaixo do mínimo`;
    if (esquema.maximum !== undefined && valor > esquema.maximum) return `${caminho}: acima do máximo`;
    return null;
  }
  if (esquema.type === 'boolean') return typeof valor === 'boolean' ? null : `${caminho}: booleano esperado`;
  if (esquema.type === 'array') {
    if (!Array.isArray(valor)) return `${caminho}: lista esperada`;
    if (esquema.maxItems !== undefined && valor.length > esquema.maxItems) return `${caminho}: itens demais`;
    for (let i = 0; i < valor.length; i++) { const e = validar(esquema.items, valor[i], `${caminho}[${i}]`); if (e) return e; }
    return null;
  }
  return `${caminho}: tipo não suportado`;
}

// Endereço permitido para abrir: normalizado ou null.
function urlPermitida(texto, { permitirLei = true } = {}) {
  if (typeof texto !== 'string' || !texto || texto.length > MAX_URL) return null;
  let u;
  try { u = new URL(texto); } catch { return null; }
  if (u.username || u.password) return null;
  if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  if (permitirLei && u.protocol === 'superproc-lei:') return u.href;
  return null;
}

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const idAba = { type: 'string', pattern: RE_ID_ABA, description: 'Identificador opaco da aba (tab_xxxxxxxx), vindo de superproc_list_tabs.' };

// ---- metadados no vocabulário do MCP (2026-11-24) -------------------------------------------------------------------------
// Por ferramenta: `titulo` (nome legível), `idempotente` (repetir a chamada com os mesmos argumentos não muda mais nada), `aberto`
// (a ferramenta alcança conteúdo de fora do navegador: abre um endereço qualquer ou devolve o texto de uma página) e `saida`
// (JSON Schema do objeto devolvido em `data`). Quem anuncia as ferramentas a um cliente MCP (ponte do Copilot) traduz isso para
// title/idempotentHint/openWorldHint/outputSchema. Os esquemas de saída são ABERTOS de propósito (sem additionalProperties:false e
// só com os campos garantidos em `required`): um cliente MCP pode validar o resultado contra o esquema e recusar o que não casar.
// Ferramenta sem `saida` devolve só texto (caso de superproc_get_page_context, cujo corpo pode ter milhões de caracteres).
const saida = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const ABA_SAIDA = { type: 'object', properties: { id: { type: 'string', description: 'Identificador opaco da aba (tab_xxxxxxxx).' }, title: { type: 'string' }, url: { type: 'string', description: 'Endereço sem consulta nem fragmento.' }, active: { type: 'boolean' }, groupId: { type: ['string', 'null'] }, role: { type: ['string', 'null'], description: 'Papel da sub-aba (capa, árvore, editor), quando houver.' } }, required: ['id'] };
const FEITO = (campo) => saida({ [campo]: { type: 'boolean' } });
const META = Object.freeze({
  superproc_list_tabs: { titulo: 'Listar abas', idempotente: true, saida: saida({ tabs: { type: 'array', items: ABA_SAIDA } }) },
  superproc_get_active_tab: { titulo: 'Aba ativa', idempotente: true, saida: saida({ tab: { ...ABA_SAIDA, type: ['object', 'null'] } }) },
  superproc_search_history: { titulo: 'Buscar no histórico', idempotente: true, saida: saida({ results: { type: 'array', items: { type: 'object' } } }) },
  superproc_get_ai_policies: { titulo: 'Políticas de IA', idempotente: true, saida: { type: 'object' } },
  superproc_list_quick_access: { titulo: 'Listar Acesso Rápido', idempotente: true, saida: saida({ links: { type: 'array', items: { type: 'object' } } }) },
  superproc_get_page_context: { titulo: 'Ler o texto da aba', idempotente: true, aberto: true },
  superproc_open_tab: { titulo: 'Abrir nova aba', aberto: true, saida: FEITO('opened') },
  superproc_switch_tab: { titulo: 'Trocar de aba', idempotente: true, saida: FEITO('switched') },
  superproc_reload_tab: { titulo: 'Recarregar aba', idempotente: true, saida: FEITO('reloaded') },
  superproc_go_back: { titulo: 'Voltar página', saida: FEITO('navigated') },
  superproc_go_forward: { titulo: 'Avançar página', saida: FEITO('navigated') },
  superproc_scroll_tab: { titulo: 'Rolar aba', saida: FEITO('scrolled') },
  superproc_close_tab: { titulo: 'Fechar aba', saida: FEITO('closed') },
  superproc_remove_history_item: { titulo: 'Remover item do histórico', saida: FEITO('removed') },
  superproc_clear_history: { titulo: 'Apagar histórico', saida: FEITO('cleared') }
});

function criarAdminBroker({ host = {}, contexto = null, politica = {}, confirmar = async () => false, registrar = () => {}, agora = Date.now } = {}) {
  const ligado = (cat) => { try { return !!(politica && typeof politica[cat] === 'function' ? politica[cat]() : politica && politica[cat]); } catch (_) { return false; } };
  const aud = (nome, cat, codigo) => { try { registrar(`ADMIN ${nome} ${cat} ${codigo}`); } catch (_) { /* auditoria nunca derruba a chamada */ } };
  let janela = [];

  const FERRAMENTAS = [
    // ---- leitura ----
    { nome: 'superproc_list_tabs', categoria: 'leitura', descricao: 'Lista as abas abertas no navegador SuperPROC (id opaco tab_xxxxxxxx, título, endereço sem consulta, aba ativa, grupo e papel da sub-aba). Use primeiro, para descobrir o tabId que as outras ferramentas pedem. Não altera nada.', esquema: obj({}),
      async executar() { return { tabs: await need('listarAbas')() }; } },
    { nome: 'superproc_get_active_tab', categoria: 'leitura', descricao: 'Devolve só a aba que a pessoa está vendo agora (mesmos campos de superproc_list_tabs). Use quando o pedido fala de "esta página" ou "a aba atual" e não é preciso listar todas.', esquema: obj({}),
      async executar() { const l = await need('listarAbas')(); return { tab: l.find((a) => a.active) || null }; } },
    { nome: 'superproc_search_history', categoria: 'leitura', descricao: 'Busca no histórico de endereços do SuperPROC por trecho do título ou do endereço (sem processos). Passe query (até 200 caracteres) e, se quiser, maxResults (1 a 50, padrão 20). Use para reencontrar uma página já visitada; depois abra com superproc_open_tab.', esquema: obj({ query: { type: 'string', minLength: 1, maxLength: 200 }, maxResults: { type: 'integer', minimum: 1, maximum: 50 } }, ['query']),
      async executar(a) { return { results: await need('buscarHistorico')(a.query, a.maxResults || 20) }; } },
    { nome: 'superproc_get_ai_policies', categoria: 'leitura', descricao: 'Estado das políticas do Edge espelhadas no SuperPROC: o que está habilitado ou desabilitado. Sem argumentos: as de IA/Copilot completas e o resumo das demais. Com query (nome, descrição ou preferência), groupId ou changedOnly (fora do padrão): as que casam, até limit. As restritivas (restrictive) vêm desligadas por padrão.',
      esquema: obj({ query: { type: 'string', minLength: 1, maxLength: 80 }, groupId: { type: 'string', enum: ['contexto', 'presenca', 'acoes', 'local', 'demais'] }, changedOnly: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }),
      async executar(a) { return await need('politicasIA')(a); } },
    { nome: 'superproc_list_quick_access', categoria: 'leitura', descricao: 'Lista os links do Acesso Rápido da pessoa (id, nome e endereço). Use quando ela pedir "meus atalhos" ou quiser abrir um site que costuma usar; abra o endereço com superproc_open_tab.', esquema: obj({}),
      async executar() { return { links: await need('listarAcessoRapido')() }; } },
    // ---- organização ----
    { nome: 'superproc_open_tab', categoria: 'organizacao', descricao: 'Abre um endereço http(s) completo numa nova aba. Passe url com https:// (sem usuário nem senha). Use quando a pessoa pedir para abrir uma página; para ir a uma aba que já existe, use superproc_switch_tab.', esquema: obj({ url: { type: 'string', minLength: 8, maxLength: MAX_URL } }, ['url']),
      async executar(a) { const url = urlPermitida(a.url, { permitirLei: host.permitirLei === true }); if (!url) throw erro(CODIGOS.URL); await need('novaAba')(url); return { opened: true }; } },
    { nome: 'superproc_switch_tab', categoria: 'organizacao', descricao: 'Torna ativa uma aba que já está aberta. Passe o tabId obtido em superproc_list_tabs. Use para levar a pessoa a uma aba existente em vez de abrir outra igual.', esquema: obj({ tabId: idAba }, ['tabId']),
      async executar(a) { await aba(a.tabId); await need('trocarAba')(a.tabId); return { switched: true }; } },
    { nome: 'superproc_reload_tab', categoria: 'organizacao', descricao: 'Recarrega a aba indicada pelo tabId. Use quando a página parecer desatualizada ou travada; a pessoa pode perder o que digitou e não enviou.', esquema: obj({ tabId: idAba }, ['tabId']),
      async executar(a) { await aba(a.tabId); await need('recarregar')(a.tabId); return { reloaded: true }; } },
    { nome: 'superproc_go_back', categoria: 'organizacao', descricao: 'Volta uma página no histórico da aba indicada pelo tabId. Devolve navigated=false quando não há página anterior.', esquema: obj({ tabId: idAba }, ['tabId']),
      async executar(a) { await aba(a.tabId); return { navigated: !!(await need('voltar')(a.tabId)) }; } },
    { nome: 'superproc_go_forward', categoria: 'organizacao', descricao: 'Avança uma página no histórico da aba indicada pelo tabId. Devolve navigated=false quando não há página seguinte.', esquema: obj({ tabId: idAba }, ['tabId']),
      async executar(a) { await aba(a.tabId); return { navigated: !!(await need('avancar')(a.tabId)) }; } },
    { nome: 'superproc_scroll_tab', categoria: 'organizacao', descricao: 'Rola a aba indicada pelo tabId. position: top (início), bottom (fim), up ou down (uma tela). Use para levar a página a um ponto antes de ler ou conferir o conteúdo.', esquema: obj({ tabId: idAba, position: { type: 'string', enum: ['top', 'bottom', 'up', 'down'] } }, ['tabId', 'position']),
      async executar(a) { await aba(a.tabId); return { scrolled: !!(await need('rolar')(a.tabId, a.position)) }; } },
    // ---- destrutivas (confirmação a cada chamada) ----
    { nome: 'superproc_close_tab', categoria: 'destrutiva', descricao: 'Fecha a aba indicada pelo tabId. Ação destrutiva: a pessoa confirma a cada chamada. Só use se ela pediu para fechar essa aba; peça o tabId certo em vez de adivinhar.', esquema: obj({ tabId: idAba }, ['tabId']), detalhe: 'fechar uma aba',
      async executar(a) { await aba(a.tabId); await need('fecharAba')(a.tabId); return { closed: true }; } },
    { nome: 'superproc_remove_history_item', categoria: 'destrutiva', descricao: 'Remove um único item do histórico de endereços, pelo id vindo de superproc_search_history. Ação destrutiva: a pessoa confirma a cada chamada.', esquema: obj({ id: { type: 'string', pattern: RE_ID_LINK } }, ['id']), detalhe: 'remover um item do histórico',
      async executar(a) { await need('removerHistorico')(a.id); return { removed: true }; } },
    { nome: 'superproc_clear_history', categoria: 'destrutiva', descricao: 'Apaga todo o histórico de endereços. Ação destrutiva e sem volta: a pessoa confirma a cada chamada. Só use se ela pediu exatamente isso.', esquema: obj({}), detalhe: 'apagar o histórico de endereços',
      async executar() { await need('limparHistorico')(); return { cleared: true }; } }
  ];
  const porNome = new Map(FERRAMENTAS.map((f) => [f.nome, f]));

  const erro = (codigo, mensagem) => Object.assign(new Error(mensagem || codigo), { codigo });
  const need = (nome) => { if (typeof host[nome] !== 'function') throw erro(CODIGOS.NAO_SUPORTADO, 'host sem ' + nome); return host[nome]; };
  async function aba(id) { const l = await need('listarAbas')(); if (!l.some((a) => a.id === id)) throw erro(CODIGOS.NAO_ACHADO); }

  // Contexto somente leitura (delegado ao ContextBroker): mesmas regras de consentimento de quem chama.
  if (contexto) {
    FERRAMENTAS.push(
      { nome: 'superproc_get_page_context', categoria: 'leitura', descricao: 'Texto visível e metadados de uma aba (inclui quadros internos e PDFs embutidos). Para PDFs grandes, pageFrom/pageTo leem uma faixa de páginas.', esquema: obj({ tabId: idAba, maxCharacters: { type: 'integer', minimum: 1, maximum: LIMITES_CTX.maxCaracteres }, pageFrom: { type: 'integer', minimum: 1, maximum: LIMITES_CTX.maxPaginaPdf }, pageTo: { type: 'integer', minimum: 1, maximum: LIMITES_CTX.maxPaginaPdf } }),
        async executar(a) { if (!ligado('contexto')) throw erro(CODIGOS.DESLIGADO); const id = a.tabId || (await need('listarAbas')()).find((x) => x.active)?.id; if (!id) throw erro(CODIGOS.NAO_ACHADO); const op = {}; if (a.maxCharacters) op.maxCharacters = a.maxCharacters; if (a.pageFrom || a.pageTo) op.paginas = { de: a.pageFrom || 1, ate: a.pageTo || LIMITES_CTX.maxPaginaPdf }; return contexto.readTab(id, Object.keys(op).length ? op : undefined); } }
    );
    porNome.set('superproc_get_page_context', FERRAMENTAS[FERRAMENTAS.length - 1]);
  }

  function catalogo() {
    return FERRAMENTAS.map((f) => {
      const m = META[f.nome] || {};
      return { name: f.nome, ...(m.titulo ? { title: m.titulo } : {}), description: f.descricao, inputSchema: f.esquema, ...(m.saida ? { outputSchema: m.saida } : {}),
        annotations: { category: f.categoria, enabled: ligado(f.categoria), requiresConfirmation: f.categoria === 'destrutiva', idempotent: m.idempotente === true, openWorld: m.aberto === true } };
    });
  }

  async function chamar(nome, args = {}) {
    const f = typeof nome === 'string' ? porNome.get(nome) : null;
    if (!f) { aud(String(nome).slice(0, 40).replace(/[^\w.-]/g, '?'), '-', CODIGOS.DESCONHECIDA); return { ok: false, code: CODIGOS.DESCONHECIDA }; }
    const fim = (codigo, extra = {}) => { aud(f.nome, f.categoria, codigo); return codigo === CODIGOS.OK ? { ok: true, ...extra } : { ok: false, code: codigo }; };
    const t = agora();
    janela = janela.filter((x) => t - x < 60000);
    if (janela.length >= LIMITE_POR_MINUTO) return fim(CODIGOS.LIMITE);
    janela.push(t);
    if (!ligado(f.categoria)) return fim(CODIGOS.DESLIGADO);
    const e = validar(f.esquema, args === undefined ? {} : args);
    if (e) return fim(CODIGOS.INVALIDO);
    if (f.categoria === CATEGORIAS.destrutiva) {
      let ok = false;
      try { ok = (await confirmar({ ferramenta: f.nome, categoria: f.categoria, detalhe: f.detalhe || f.nome })) === true; } catch (_) { ok = false; }
      if (!ok) return fim(CODIGOS.NEGADO);
    }
    try { return fim(CODIGOS.OK, { data: await f.executar(args) }); }
    catch (x) { return fim(x && x.codigo && Object.values(CODIGOS).includes(x.codigo) ? x.codigo : CODIGOS.FALHA); }
  }

  return { catalogo, chamar, categorias: CATEGORIAS, codigos: CODIGOS };
}

module.exports = { criarAdminBroker, urlPermitida, validar, CATEGORIAS, CODIGOS, LIMITE_POR_MINUTO, META };
