/**
 * SuperPROC - Orquestrador Central
 * 
 * Responsável por:
 * 1. Identificar a página e a ação atual do EPROC.
 * 2. Consultar o status de ativação de cada módulo no Storage.
 * 3. Carregar e inicializar dinamicamente apenas os módulos compatíveis e habilitados.
 * 4. Proteger a execução para que a falha de um módulo não afete os outros nem a página.
 */

(async function () {
    'use strict';

    // Evita injeções duplicadas
    if (window.__SUPERPROC_INITIALIZED__) return;
    window.__SUPERPROC_INITIALIZED__ = true;

    // Chrome comum: o background avisa início/fim do pedido alterar_localizadores; vira o mesmo par de eventos
    // que o host emite no Browser SuperPROC (detail em string JSON). Sem webRequest, esta mensagem nunca chega.
    try {
        chrome.runtime.onMessage.addListener((msg, sender) => {
            if (!msg || msg.type !== 'superproc:sinal-localizadores' || sender.id !== chrome.runtime.id) return;
            const nome = msg.evento === 'vai-mudar' ? 'superproc:localizadores-vai-mudar' : 'superproc:localizadores-atualizados';
            window.dispatchEvent(new CustomEvent(nome, { detail: JSON.stringify({ id: String(msg.id), origem: 'background', ok: !!msg.ok }) }));
        });
    } catch (_) { /* contexto sem runtime */ }

    console.log('%c[SuperPROC]%c Inicializando orquestrador modular...', 'background: #0284c7; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 3px;', 'color: #0284c7; font-weight: bold;');

    try {
        const registryUrl = chrome.runtime.getURL('core/registry.js');
        const storageUrl = chrome.runtime.getURL('core/storage.js');

        const { Registry, carregarModulosUsuario } = await import(registryUrl);
        const { Storage } = await import(storageUrl);

        const currentUrl = new URL(window.location.href);
        const urlParams = currentUrl.searchParams;

        // Pool comum com o navegador SuperPROC (docs/ia/POOL-COMUM.md): cores dos localizadores também no localStorage do
        // eproc, o endereço que extensão e navegador alcançam sozinhos. Sempre ativa; independe dos módulos ligados.
        if (currentUrl.pathname.includes('controlador.php')) {
            import(chrome.runtime.getURL('core/pool_comum.js'))
                .then(m => m.instalarPoolComum())
                .catch(() => {});
        }
        const acaoAtual = urlParams.get('acao') || 'desconhecida';

        // Objeto global para depuração e inspeção
        window.__SUPERPROC__ = {
            version: '1.0.0',
            acao: acaoAtual,
            url: currentUrl,
            activeModules: new Set(),
            errors: []
        };

        // Carga inicial (uma vez por perfil) dos padrões de fábrica: termos e cores da árvore, termos do AutoMarca (os grupos de Smart Localizadores e Smart Eventos começam vazios: nada do perfil de quem criou a extensão é embutido).
        // Só preenche chaves que ainda não existem; nunca sobrescreve dados do usuário.
        try {
            const seedOnce = async () => {
            const versionKey = '__superproc_seed_v2';
            const authAction = urlParams.get('acao') || '';
            if (/login|logout|logoff|sair|autenticar|encerrar_sessao/i.test(authAction)) localStorage.setItem('__superproc_auth_epoch_v2', crypto.randomUUID());
            let mark;
            try {mark=JSON.parse(localStorage.getItem(versionKey));}catch{}
            if (!mark || mark.version!==1 || !Array.isArray(mark.keys) || mark.keys.some(key=>localStorage.getItem(key)===null)) {
            const seedUrl = chrome.runtime.getURL('core/tampermonkey_seed_data.json');
            const resp = await fetch(seedUrl);
            if (resp.ok) {
                const seedData = await resp.json();
                Object.entries(seedData).forEach(([k, v]) => {
                    if (localStorage.getItem(k) === null) {
                        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                    }
                });
                localStorage.setItem(versionKey, JSON.stringify({version:1,keys:Object.keys(seedData)}));
            }
            }
            };
            if(navigator.locks)await navigator.locks.request('superproc-seed-v2',seedOnce);else await seedOnce();
        } catch (seedErr) {
            // Silencioso em caso de restrição de fetch local
        }

        // Perfil importado: aplica os dados de tela nesta origem antes de qualquer módulo ler o localStorage.
        try { await Storage.applyPendingImport(); } catch (_) { /* sem storage da extensão */ }

        const allModules = [...Registry.getAllModules(), ...await carregarModulosUsuario()];
        const enabledMap = await Storage.getEnabledMap();

        // Navegador SuperPROC: os módulos que ele mesmo implementa (mesmos ids) ficam parados aqui, para não duplicar menus
        // e pinturas — "CONTROLADO PELO NAVEGADOR". O navegador publica a lista em <html data-superproc-navegador-modulos>
        // (e no localStorage do eproc). Em outros navegadores a marca não existe e nada muda.
        const controladosNavegador = new Set();
        try {
            const marca = document.documentElement.getAttribute('data-superproc-navegador-modulos') || '';
            marca.split(/\s+/).filter(Boolean).forEach(id => controladosNavegador.add(id));
            const salvos = JSON.parse(localStorage.getItem('__superproc_navegador_modulos') || '[]');
            if (Array.isArray(salvos)) salvos.filter(id => typeof id === 'string').forEach(id => controladosNavegador.add(id));
        } catch (_) { /* sem marca: segue normal */ }
        window.__SUPERPROC__.controladosNavegador = [...controladosNavegador];

        let carregados = 0;

        for (const meta of allModules) {
            // Verifica se está habilitado (padrão é meta.defaultEnabled se ainda não foi salvo)
            const isEnabled = enabledMap[meta.id] !== undefined ? Boolean(enabledMap[meta.id]) : meta.defaultEnabled;

            if (!isEnabled) {
                continue;
            }

            if (controladosNavegador.has(meta.id)) {
                console.info(`[SuperPROC] "${meta.name}": controlado pelo navegador SuperPROC; o módulo da extensão fica parado.`);
                continue;
            }

            // Verifica se este módulo deve rodar nesta URL/ação
            let match = false;
            try {
                match = typeof meta.matches === 'function' ? meta.matches(currentUrl, urlParams) : true;
            } catch (err) {
                console.warn(`[SuperPROC] Erro ao verificar correspondência do módulo "${meta.name}":`, err);
            }

            if (!match) {
                continue;
            }

            // Inicia o módulo de forma isolada e segura
            try {
                const moduleScriptUrl = chrome.runtime.getURL(meta.scriptPath);
                const moduleExports = await import(moduleScriptUrl);

                // Suporta export default ou export direto de init()
                const initFn = moduleExports.default?.init || moduleExports.init;

                if (typeof initFn === 'function') {
                    if(document.hidden && meta.scriptPath.startsWith('modules/externo/')) {
                        const deferred = async () => {
                            if(document.hidden)return;
                            document.removeEventListener('visibilitychange',deferred);
                            const started=performance.now();
                            try { await initFn({meta,url:currentUrl,params:urlParams,storage:Storage});window.__SUPERPROC__.activeModules.add(meta.id);(window.__SUPERPROC__.metrics||=[]).push({id:meta.id,initMs:Math.round(performance.now()-started)}); }
                            catch { window.__SUPERPROC__.errors.push({moduleId:meta.id,error:'Falha na inicialização adiada.'}); }
                        };
                        document.addEventListener('visibilitychange',deferred);
                        window.addEventListener('pagehide',()=>document.removeEventListener('visibilitychange',deferred),{once:true});
                        continue;
                    }
                    const moduleStarted = performance.now();
                    await initFn({
                        meta,
                        url: currentUrl,
                        params: urlParams,
                        storage: Storage
                    });
                    (window.__SUPERPROC__.metrics ||= []).push({id:meta.id,initMs:Math.round((performance.now()-moduleStarted)*100)/100});
                    window.__SUPERPROC__.activeModules.add(meta.id);
                    carregados++;
                    console.log(`%c[SuperPROC] ✓ Módulo carregado: %c${meta.name}`, 'color: #16a34a; font-weight: bold;', 'color: #334155;');
                } else if (meta.usuario) {
                    // Módulo importado sem init(): o próprio arquivo já executou ao ser importado.
                    window.__SUPERPROC__.activeModules.add(meta.id);
                    carregados++;
                } else {
                    console.warn(`[SuperPROC] Módulo "${meta.id}" não exportou uma função init() válida.`);
                }
            } catch (moduleError) {
                console.error(`%c[SuperPROC] ✗ Erro ao carregar módulo "${meta.name}":`, 'color: #dc2626; font-weight: bold;', moduleError);
                window.__SUPERPROC__.errors.push({
                    moduleId: meta.id,
                    error: moduleError.message,
                    stack: moduleError.stack
                });
            }
        }

        // Mantém no storage da extensão uma cópia dos dados de tela (usada ao exportar o perfil).
        if (window === window.top) {
            const sincronizar = () => Storage.syncFromPage().catch(() => {});
            sincronizar();
            document.addEventListener('visibilitychange', () => { if (document.hidden) sincronizar(); });
            window.addEventListener('pagehide', sincronizar);
            setInterval(sincronizar, 30000);
        }

        console.log(`%c[SuperPROC]%c Concluído! ${carregados} módulo(s) ativo(s) na tela "${acaoAtual}".`, 'background: #16a34a; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 3px;', 'color: #16a34a; font-weight: bold;');

    } catch (err) {
        console.error('[SuperPROC] Falha crítica no orquestrador:', err);
    }
})();
