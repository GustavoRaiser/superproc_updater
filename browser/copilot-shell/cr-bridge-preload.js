'use strict';
// Preload exclusivo da coluna do Copilot (WebContentsView com sandbox e isolamento de contexto).
// Só age no quadro principal de uma origem do cr-host. Nas demais páginas (entrada local, login da Microsoft)
// não instala nada. Na página do cr-host oferece o mesmo ponto de entrada que o Edge dá a ela:
//   chrome.runtime.connect('ndcpkimcihhghdcddljkfmmjccdmcmof', { name: 'copilot-api' | 'copilot-bridge' })
//   chrome.runtime.sendMessage('ndcpkimcihhghdcddljkfmmjccdmcmof', { api, args })
// As mensagens seguem em texto JSON (o Port de extensão do Chrome também serializa em JSON) para o processo
// principal, que confere remetente, quadro e origem antes de atender (ipc-policy + cr-bridge-host.js).
// Este arquivo roda em sandbox: não pode importar módulos do projeto, por isso repete as constantes.
const { contextBridge, ipcRenderer } = require('electron');

const ID_EXTENSAO = 'ndcpkimcihhghdcddljkfmmjccdmcmof';
const ORIGENS = ['https://cr.m365copilotapp.svc.cloud.microsoft', 'https://copilot.cloud.microsoft', 'https://m365.cloud.microsoft'];
const MAX_JSON = 256 * 1024;

// Instalado no mundo principal da página. É serializado: não enxerga nada deste arquivo além dos argumentos.
function instalar(ponte, idExtensao) {
  const criarEvento = () => {
    const ouvintes = new Set();
    return {
      publico: {
        addListener: (f) => { if (typeof f === 'function') ouvintes.add(f); },
        removeListener: (f) => { ouvintes.delete(f); },
        hasListener: (f) => ouvintes.has(f),
        hasListeners: () => ouvintes.size > 0
      },
      emitir: (...args) => { for (const f of [...ouvintes]) { try { f(...args); } catch (e) { setTimeout(() => { throw e; }, 0); } } }
    };
  };
  const paraJson = (valor) => JSON.stringify(valor, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const anotar = (codigo) => { try { ponte.nota(codigo); } catch (_) { /* diagnóstico não afeta a página */ } };
  // Diagnóstico: o plugin de leitura do app registra o motivo das falhas num OBJETO (o console do host só vê "[object Object]").
  // Repete a linha como texto resumido: números, booleanos e textos curtos de identificador; todo o resto vira "<txt>"
  // (nenhum endereço, título ou conteúdo sai). Só para mensagens "pluginLog"; a mensagem original segue intacta.
  try {
    const resumir = (v, nivel) => {
      if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
      if (typeof v === 'string') return /^[A-Za-z0-9_.:-]{1,40}$/.test(v) ? v : '<txt>';
      if (nivel > 3) return '<fundo>';
      if (Array.isArray(v)) return v.slice(0, 20).map((x) => resumir(x, nivel + 1));
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 20)) o[/^[A-Za-z0-9_]{1,40}$/.test(k) ? k : '<chave>'] = resumir(v[k], nivel + 1); return o; }
      return typeof v;
    };
    for (const nivel of ['log', 'info', 'warn', 'error']) {
      const original = console[nivel];
      if (typeof original !== 'function') continue;
      console[nivel] = function (...args) {
        try {
          if (typeof args[0] === 'string' && args[0].indexOf('pluginLog') >= 0 && args.length > 2 && typeof args[2] === 'object') {
            original.call(console, '[SuperPROC:plugin-detalhe]', JSON.stringify(resumir(args[2], 0)).slice(0, 600));
          }
        } catch (_) { /* nunca atrapalha a página */ }
        return original.apply(console, args);
      };
    }
  } catch (_) { /* sem console: sem detalhe */ }
  // Id de outra extensão: aqui não há nenhuma. O Chrome, nesse caso, não lança: a porta fecha em seguida e a
  // chamada única termina com chrome.runtime.lastError. A página pode sondar outras extensões sem quebrar.
  const SEM_DESTINO = 'Could not establish connection. Receiving end does not exist.';
  const comUltimoErro = (f) => {
    const anteriorErro = Object.getOwnPropertyDescriptor(runtime, 'lastError');
    try { Object.defineProperty(runtime, 'lastError', { configurable: true, value: { message: SEM_DESTINO } }); f(); }
    finally { if (anteriorErro) Object.defineProperty(runtime, 'lastError', anteriorErro); else delete runtime.lastError; }
  };
  function portaSemDestino(nome) {
    const aoReceber = criarEvento();
    const aoFechar = criarEvento();
    let aberta = true;
    const porta = {
      name: nome, onMessage: aoReceber.publico, onDisconnect: aoFechar.publico,
      postMessage() { if (!aberta) throw new Error('Attempting to use a disconnected port object'); },
      disconnect() { aberta = false; }
    };
    setTimeout(() => { if (!aberta) return; aberta = false; comUltimoErro(() => aoFechar.emitir(porta)); }, 0);
    return porta;
  }

  const ehId = (v) => typeof v === 'string' && /^[a-p]{32}$/.test(v);
  function abrirPorta(nome, idDaPagina) {
    const aoReceber = criarEvento();
    const aoFechar = criarEvento();
    let aberta = true;
    let id = 0;
    const porta = {
      name: nome,
      onMessage: aoReceber.publico,
      onDisconnect: aoFechar.publico,
      postMessage(mensagem) {
        if (!aberta) throw new Error('Attempting to use a disconnected port object');
        const texto = paraJson(mensagem);
        if (typeof texto !== 'string') throw new Error('Could not serialize message.');
        ponte.enviar(id, texto);
      },
      disconnect() {
        if (!aberta) return;
        aberta = false;
        ponte.fechar(id);
      }
    };
    id = ponte.abrir(nome, (tipo, texto) => {
      if (!aberta) return;
      if (tipo === 'fechar') { aberta = false; aoFechar.emitir(porta); return; }
      let mensagem;
      try { mensagem = JSON.parse(texto); } catch (_) { return; }
      aoReceber.emitir(mensagem, porta);
    }, idDaPagina);
    return porta;
  }

  const raiz = globalThis.chrome && typeof globalThis.chrome === 'object' ? globalThis.chrome : {};
  const anterior = raiz.runtime && typeof raiz.runtime === 'object' ? raiz.runtime : null;
  const conectarAnterior = anterior && typeof anterior.connect === 'function' ? anterior.connect.bind(anterior) : null;
  const enviarAnterior = anterior && typeof anterior.sendMessage === 'function' ? anterior.sendMessage.bind(anterior) : null;

  function connect(extensionId, connectInfo) {
    const nome = connectInfo && typeof connectInfo === 'object' && typeof connectInfo.name === 'string' ? connectInfo.name : '';
    // A página escolhe o id pela extensão do navegador em que acredita estar (no Edge, a ponte embutida; no Chrome, a
    // extensão do Copilot). Na coluna do SuperPROC a ponte responde por qualquer id bem formado e registra qual foi.
    if (extensionId === idExtensao) { anotar('connect:ponte'); return abrirPorta(nome, extensionId); }
    if (conectarAnterior) return conectarAnterior(...arguments);
    if (ehId(extensionId)) { anotar('connect:outro-id'); return abrirPorta(nome, extensionId); }
    if (typeof extensionId === 'string') { anotar('connect:id-invalido'); return portaSemDestino(nome); }
    anotar('connect:sem-id');
    throw new TypeError('Error in invocation of runtime.connect(optional string extensionId, optional object connectInfo): chrome.runtime.connect() called from a webpage must specify an Extension ID (string) for its first argument.');
  }
  function sendMessage(extensionId, mensagem, opcoes, retorno) {
    if (extensionId !== idExtensao && !(ehId(extensionId) && !enviarAnterior)) {
      if (enviarAnterior) return enviarAnterior(...arguments);
      if (typeof extensionId === 'string') {
        anotar('sendMessage:id-invalido');
        const aviso = typeof opcoes === 'function' ? opcoes : (typeof retorno === 'function' ? retorno : null);
        if (!aviso) return Promise.reject(new Error(SEM_DESTINO));
        setTimeout(() => comUltimoErro(() => aviso(undefined)), 0);
        return undefined;
      }
      anotar('sendMessage:sem-id');
      throw new TypeError('Error in invocation of runtime.sendMessage(optional string extensionId, any message, optional object options, optional function callback): chrome.runtime.sendMessage() called from a webpage must specify an Extension ID (string) for its first argument.');
    }
    anotar(extensionId === idExtensao ? 'sendMessage:ponte' : 'sendMessage:outro-id');
    const fim = typeof opcoes === 'function' ? opcoes : (typeof retorno === 'function' ? retorno : null);
    const resposta = Promise.resolve().then(() => ponte.umaVez(paraJson(mensagem), extensionId)).then((texto) => JSON.parse(texto));
    if (!fim) return resposta;
    resposta.then((r) => fim(r), () => fim(undefined));
    return undefined;
  }

  // O app do Copilot só registra o plugin que atende fetch_browser_content (FluxEdgeContextualPlugin) num efeito que roda
  // quando o chat monta, e só se chrome.runtime.sendMessage existir naquele instante. Com a ponte instalada depois do
  // login, o chat já montou e o plugin nunca é registrado: a ferramenta volta "erro interno". Aqui pedimos à própria
  // página que o registre, pelo mesmo caminho que ela usa (o runtime do webpack carrega o pedaço e chama
  // installPageContextPlugin). Nada é substituído: se o plugin já estiver registrado, a função dela não faz nada.
  function ativarPluginDaPagina() {
    try {
      if (globalThis.__crHostPageContextPluginInstalled) return 'plugin:ja';
      // O app do Copilot é empacotado com Rspack (global rspackChunk_1js_m365_copilot_app); aceita também o nome do webpack.
      const chaves = Object.keys(globalThis).filter((k) => /^(?:rspack|webpack)Chunk/.test(k) && Array.isArray(globalThis[k]));
      for (const chave of chaves) {
        let req;
        try { globalThis[chave].push([['superproc-' + Date.now() + '-' + Math.random().toString(36).slice(2)], {}, (r) => { req = r; }]); } catch (_) { continue; }
        if (!req || !req.m) continue;
        // 1) Quem chama installPageContextPlugin(): de lá saem os pedaços (n.e) e o módulo (n.bind(n, id)).
        for (const id of Object.keys(req.m)) {
          let fonte = '';
          try { fonte = Function.prototype.toString.call(req.m[id]); } catch (_) { continue; }
          const pos = fonte.indexOf('.installPageContextPlugin()');
          if (pos < 0) continue;
          const trecho = fonte.slice(Math.max(0, pos - 400), pos);
          // O último n.bind(n, id) antes da chamada é o módulo do plugin (antes dele vem o do installContextListener).
          const binds = [...trecho.matchAll(/n\.bind\(n,(\d+)\)/g)];
          const pedacos = [...trecho.matchAll(/n\.e\((\d+)\)/g)].map((m) => Number(m[1]));
          if (!binds.length) continue;
          const idMod = Number(binds[binds.length - 1][1]);
          const idListener = binds.length >= 2 ? Number(binds[binds.length - 2][1]) : null;
          return Promise.all(pedacos.map((p) => req.e(p))).then(() => {
            if (idListener && !globalThis.__m365CrBridgeListenerInstalled) {
              try {
                const exListener = req(idListener);
                if (exListener && typeof exListener.installContextListener === 'function') {
                  exListener.installContextListener((ctx) => {
                    try { const loja = acharLoja(); if (loja) loja.getState().updateCatalystDataContext(ctx); } catch (_) { /* segue */ }
                  });
                }
              } catch (_) { /* segue com fallback direto na loja */ }
            }
            const ex = req(idMod);
            if (!ex || typeof ex.installPageContextPlugin !== 'function') return 'plugin:nao-encontrado';
            return Promise.resolve(ex.installPageContextPlugin()).then(() => (globalThis.__crHostPageContextPluginInstalled ? 'plugin:instalado' : 'plugin:falhou'));
          }).catch(() => 'plugin:falhou');
        }
        // 2) Sem o chamador: módulo já instanciado que exporte a função.
        for (const id of Object.keys(req.c || {})) {
          const ex = req.c[id] && req.c[id].exports;
          if (ex && typeof ex.installPageContextPlugin === 'function') {
            return Promise.resolve(ex.installPageContextPlugin()).then(() => (globalThis.__crHostPageContextPluginInstalled ? 'plugin:instalado' : 'plugin:falhou'));
          }
        }
      }
      return 'plugin:nao-encontrado';
    } catch (_) { return 'plugin:falhou'; }
  }
  // Tenta algumas vezes: o pedaço do chamador pode ainda não ter carregado quando a ponte entra.
  let tentativasPlugin = 0;
  const tentarPlugin = () => {
    Promise.resolve(ativarPluginDaPagina()).then((codigo) => {
      if (codigo === 'plugin:nao-encontrado' && ++tentativasPlugin < 10) { setTimeout(tentarPlugin, 2000); return; }
      try { ponte.nota(codigo); } catch (_) { /* diagnóstico não afeta a página */ }
    }, () => { try { ponte.nota('plugin:falhou'); } catch (_) { /* idem */ } });
  };

  // Lista de abas (contextualChat 'edgeTab'). No Edge o anfitrião publica window.__crBridgeLastContextualChat e o evento
  // crbridge:contextualChatChanged; o app tem um ouvinte (installContextListener) que leva o objeto ao estado do chat
  // (updateCatalystDataContext). Esse ouvinte é instalado no mesmo efeito do React que o plugin de leitura, que não roda
  // quando a ponte entra depois do login. Por isso: publica pelo caminho oficial e, sem ouvinte, entrega ao estado do
  // app pelo mesmo método que o ouvinte usaria.
  let lojaDoApp = null;
  let ultimaBusca = 0;
  const temMetodo = (v) => {
    try {
      if (!v || (typeof v !== 'object' && typeof v !== 'function')) return false;
      if (typeof v.getState !== 'function' || typeof v.subscribe !== 'function') return false;
      const s = v.getState();
      return !!s && typeof s.updateCatalystDataContext === 'function';
    } catch (_) { return false; }
  };
  // O estado do chat chega aos componentes pelo React (contexto + hook), não por um módulo exportado: a busca nos
  // módulos do Rspack não o acha. Percorre a árvore de fibras do React a partir da raiz da página e procura, nas
  // propriedades, nos valores de contexto e nos ganchos de cada componente, um objeto com getState() que tenha
  // updateCatalystDataContext. Só leitura; limite de nós para não pesar.
  function acharLojaNoReact() {
    const raizes = [];
    const candidatos = [document.getElementById('root'), document.body, ...Array.from(document.body ? document.body.children : [])];
    for (const el of candidatos) {
      if (!el) continue;
      for (const k of Object.keys(el)) {
        if (!k.startsWith('__reactContainer$') && !k.startsWith('__reactFiber$')) continue;
        try { const f = el[k]; if (f && typeof f === 'object') raizes.push(f); } catch (_) { /* segue */ }
      }
    }
    const vistos = new Set();
    const pilha = [...raizes];
    let nos = 0;
    const examinar = (v) => {
      if (!v) return null;
      if (temMetodo(v)) return v;
      if (typeof v === 'object') {
        if (temMetodo(v.current)) return v.current;
        if (Array.isArray(v)) { for (let i = 0; i < Math.min(v.length, 4); i++) if (temMetodo(v[i])) return v[i]; }
        else if (temMetodo(v.store)) return v.store;
      }
      return null;
    };
    while (pilha.length && nos < 200000) {
      const f = pilha.pop();
      if (!f || typeof f !== 'object' || vistos.has(f)) continue;
      vistos.add(f); nos++;
      try {
        const props = f.memoizedProps;
        if (props && typeof props === 'object') {
          const a = examinar(props.value) || examinar(props.store);
          if (a) return a;
        }
        let h = f.memoizedState;
        for (let i = 0; h && typeof h === 'object' && i < 40; i++) {
          const a = examinar(h.memoizedState);
          if (a) return a;
          h = h.next;
        }
      } catch (_) { /* fibra estranha: segue */ }
      if (f.sibling) pilha.push(f.sibling);
      if (f.child) pilha.push(f.child);
      if (f.alternate && !vistos.has(f.alternate)) pilha.push(f.alternate);
    }
    return null;
  }
  function acharLoja() {
    if (lojaDoApp && temMetodo(lojaDoApp)) return lojaDoApp;
    lojaDoApp = null;
    const agoraMs = Date.now();
    if (agoraMs - ultimaBusca < 1500) return null; // não repete a varredura a cada mudança de aba
    ultimaBusca = agoraMs;
    try { const r = acharLojaNoReact(); if (r) { lojaDoApp = r; return r; } } catch (_) { /* tenta pelos módulos */ }
    const chaves = Object.keys(globalThis).filter((k) => /^(?:rspack|webpack)Chunk/.test(k) && Array.isArray(globalThis[k]));
    for (const chave of chaves) {
      let req;
      try { globalThis[chave].push([['superproc-ctx-' + Date.now() + '-' + Math.random().toString(36).slice(2)], {}, (r) => { req = r; }]); } catch (_) { continue; }
      if (!req || !req.c) continue;
      for (const id of Object.keys(req.c)) {
        const ex = req.c[id] && req.c[id].exports;
        if (!ex || (typeof ex !== 'object' && typeof ex !== 'function')) continue;
        if (temMetodo(ex)) { lojaDoApp = ex; return ex; }
        let nomes = [];
        try { nomes = Object.keys(ex); } catch (_) { continue; }
        for (const n of nomes) {
          let v;
          try { v = ex[n]; } catch (_) { continue; }
          if (temMetodo(v)) { lojaDoApp = v; return v; }
        }
      }
    }
    return null;
  }
  let ultimaVia = '';
  let tentativasContexto = 0;
  let temporizadorContexto = null;
  let textoAtual = '';
  function aplicarContexto(texto) {
    textoAtual = texto;
    let ctx;
    try { ctx = JSON.parse(texto); } catch (_) { return; }
    if (!ctx || typeof ctx !== 'object' || ctx.contentType !== 'edgeTab' || !Array.isArray(ctx.contentItems)) return;
    try { Object.defineProperty(globalThis, '__crBridgeLastContextualChat', { value: ctx, configurable: true, writable: true }); } catch (_) { /* segue */ }
    let via;
    if (globalThis.__m365CrBridgeListenerInstalled) {
      try { window.dispatchEvent(new CustomEvent('crbridge:contextualChatChanged', { detail: ctx })); } catch (_) { /* segue */ }
      via = 'contexto:ouvinte';
    } else {
      const loja = acharLoja();
      if (loja) {
        try {
          loja.getState().updateCatalystDataContext(ctx); via = 'contexto:loja';
          // Confere o que o estado guardou (só tipo e contagem, nunca conteúdo) e se algo o troca logo depois.
          const lido = () => { try { const c = loja.getState().catalystDataContext; return c && c.contentType === 'edgeTab' && Array.isArray(c.contentItems) ? c.contentItems.length : -1; } catch (_) { return -2; } };
          const esperado = ctx.contentItems.length;
          anotar(lido() === esperado ? 'contexto:guardado' : 'contexto:nao-guardado');
          setTimeout(() => { if (textoAtual === texto && lido() !== esperado) anotar('contexto:sobrescrito'); }, 2500);
        } catch (_) { lojaDoApp = null; via = 'contexto:sem-destino'; }
      } else via = 'contexto:sem-destino';
    }
    if (via !== ultimaVia) { ultimaVia = via; anotar(via); }
    // O estado do chat só existe depois que o chat monta: sem destino, tenta de novo (a cada 2 s, até 30 vezes).
    if (via === 'contexto:sem-destino' && tentativasContexto < 30 && !temporizadorContexto) {
      tentativasContexto++;
      temporizadorContexto = setTimeout(() => { temporizadorContexto = null; aplicarContexto(textoAtual); }, 2000);
    } else if (via !== 'contexto:sem-destino') tentativasContexto = 0;
  }
  try { if (typeof ponte.aoContexto === 'function') ponte.aoContexto(aplicarContexto); } catch (_) { /* sem lista de abas */ }

  const runtime = anterior || {};
  try {
    Object.defineProperty(runtime, 'connect', { value: connect, configurable: true, enumerable: true, writable: true });
    Object.defineProperty(runtime, 'sendMessage', { value: sendMessage, configurable: true, enumerable: true, writable: true });
    if (!anterior) Object.defineProperty(raiz, 'runtime', { value: runtime, configurable: true, enumerable: true, writable: true });
    if (globalThis.chrome !== raiz) Object.defineProperty(globalThis, 'chrome', { value: raiz, configurable: true, enumerable: true, writable: true });
    setTimeout(tentarPlugin, 500);
    return true;
  } catch (_) { return false; }
}

(() => {
  let origem = '';
  try { if (window.top !== window) return; origem = location.origin; } catch (_) { return; }
  if (!ORIGENS.includes(origem)) return;

  // Marca deste documento: o host descarta as portas do documento anterior quando ela muda.
  const marca = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  const receptores = new Map(); // id da porta -> função do mundo principal
  const NOTAS = ['plugin:ja', 'plugin:instalado', 'plugin:nao-encontrado', 'plugin:falhou', 'preload', 'instalada', 'connect:ponte', 'connect:outro-id', 'connect:id-invalido', 'connect:sem-id', 'sendMessage:ponte', 'sendMessage:outro-id', 'sendMessage:id-invalido', 'sendMessage:sem-id',
    'contexto:ouvinte', 'contexto:loja', 'contexto:sem-destino', 'contexto:guardado', 'contexto:nao-guardado', 'contexto:sobrescrito'];
  let notasEnviadas = 0;
  let sequencia = 0;
  let receptorContexto = null; // função do mundo principal que aplica a lista de abas
  let contextoPendente = null; // lista que chegou antes de a página registrar o receptor

  ipcRenderer.on('copilot-cr-contexto', (_evento, paraMarca, texto) => {
    if (paraMarca !== marca || typeof texto !== 'string' || texto.length > MAX_JSON) return;
    if (!receptorContexto) { contextoPendente = texto; return; }
    try { receptorContexto(texto); } catch (_) { /* erro da página não afeta a ponte */ }
  });

  ipcRenderer.on('copilot-cr-evento', (_evento, portaId, tipo, texto) => {
    const receber = receptores.get(portaId);
    if (!receber) return;
    if (tipo === 'fechar') receptores.delete(portaId);
    try { receber(tipo === 'fechar' ? 'fechar' : 'msg', typeof texto === 'string' ? texto : ''); } catch (_) { /* erro da página não afeta a ponte */ }
  });

  const ponte = {
    abrir: (nome, receber, idDaPagina) => {
      const id = ++sequencia;
      if (typeof receber === 'function') receptores.set(id, receber);
      ipcRenderer.send('copilot-cr-abrir', marca, id, String(nome == null ? '' : nome).slice(0, 64), String(idDaPagina == null ? '' : idDaPagina).slice(0, 32));
      return id;
    },
    enviar: (id, texto) => { if (typeof texto === 'string' && texto.length <= MAX_JSON) ipcRenderer.send('copilot-cr-msg', marca, id, texto); },
    fechar: (id) => { receptores.delete(id); ipcRenderer.send('copilot-cr-fechar', marca, id); },
    umaVez: (texto, idDaPagina) => (typeof texto === 'string' && texto.length <= MAX_JSON
      ? ipcRenderer.invoke('copilot-cr-unico', texto, String(idDaPagina == null ? '' : idDaPagina).slice(0, 32))
      : Promise.resolve(JSON.stringify({ ok: false, error: 'invalid envelope' }))),
    aoContexto: (receber) => {
      if (typeof receber !== 'function' || receptorContexto) return;
      receptorContexto = receber;
      if (contextoPendente !== null) { const t = contextoPendente; contextoPendente = null; try { receber(t); } catch (_) { /* idem */ } }
    },
    // Diagnóstico: só códigos fixos sobre o uso de chrome.runtime pela página, com teto por documento.
    nota: (codigo) => { if (NOTAS.includes(codigo) && notasEnviadas++ < 300) ipcRenderer.send('copilot-cr-nota', marca, codigo); }
  };

  // A instalação de chrome.runtime na página é ordenada pelo host (ver atrasoInstalacaoMs em cr-bridge-host.js): a
  // página do Copilot precisa iniciar sem a ponte para seguir com o login Web comum.
  let instalada = false;
  ipcRenderer.on('copilot-cr-instalar', (_evento, paraMarca) => {
    if (instalada || paraMarca !== marca) return;
    instalada = true;
    try { if (contextBridge.executeInMainWorld({ func: instalar, args: [ponte, ID_EXTENSAO] }) === true) ponte.nota('instalada'); }
    catch (erro) { console.warn('[SuperPROC] Ponte do Copilot indisponível:', erro && erro.message); }
  });
  ponte.nota('preload');
})();
