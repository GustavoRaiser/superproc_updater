/**
 * SuperPROC - Gerenciador de Armazenamento, Preferências e Perfis
 * Fornece interface unificada sobre chrome.storage com fallback para localStorage,
 * além de exportação e importação completa de perfis entre máquinas.
 */

import { validateAutomation } from './automations.js';
const STORAGE_KEY_MODULES = 'superproc_modules_enabled';
const STORAGE_KEY_SETTINGS = 'superproc_custom_settings';
const STORAGE_KEY_LOCAL_DATA = 'superproc_local_data';
const STORAGE_KEY_AUTOMATIONS = 'superproc_automations_v1';
// Marca que identifica um arquivo de perfil do SuperPROC Navegador (arquivos sem ela são recusados na importação).
export const PERFIL_MARCA = 'superproc-navegador/perfil';
export const PERFIL_FORMATO = 1;
const PERFIL_MAX_BYTES = 2 * 1024 * 1024;
// Carimbo de uma importação pendente e sua confirmação na página (por origem do eproc).
const STORAGE_KEY_IMPORT_STAMP = 'superproc_local_data_aplicar';
const LOCAL_MARCA_APLICADO = '__superproc_import_aplicado';
const ID_VALIDO = { test: id => /^[a-z][a-z0-9_]{0,100}$/i.test(id) && !['constructor', 'prototype', '__proto__'].includes(id) };
const objetoSimples = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// Chaves conhecidas de módulos que salvam estado de tela e preferências locais
const RELEVANT_LOCAL_STORAGE_KEYS = [
    'eproc_locs_grupos_lista',
    'eproc_locs_estrutura_ordem',
    'eproc_blocos_ocultos_v20',
    'eproc_blocos_colunas_v20',
    'eproc_modo_compacto_ativo',
    'EPROC_ARVORE_REGRAS_CORES_V1',
    'eproc_automarca_keywords',
    'MEUS_LOCALIZADORES_CONFIG_V2',
    'eproc_smartloc_grupos',
    'eproc_smartloc_estrutura',
    'eproc_smarteventos_grupos',
    'eproc_smarteventos_estrutura',
    'keywords',
    'superproc_editor_botoes_ocultos_v3',
    'eproc_partes_fixado_nativo'
];

/**
 * Retorna a área de armazenamento ativa e disponível.
 * No Electron ou ambientes locais sem login Google, chrome.storage.sync não é suportado;
 * portanto, chrome.storage.local é sempre priorizado como armazenamento permanente.
 */
function getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        return chrome.storage.local || chrome.storage.sync;
    }
    return null;
}

function checked(area, method, ...args) {
    return new Promise((resolve,reject) => { try { area[method](...args, value => { const error=chrome.runtime.lastError; if(error)reject(Error('Falha no armazenamento da extensão.'));else resolve(value); }); } catch(error){reject(error);} });
}
async function read(key, fallback={}) {
    const area=getStorageArea(); if(area)return (await checked(area,'get',key))[key] ?? fallback;
    const raw=localStorage.getItem(key);return raw ? JSON.parse(raw) : fallback;
}
async function mutate(op, payload) {
    if(getStorageArea()) {
        const reply=await chrome.runtime.sendMessage({type:'superproc:storage',op,payload});
        if(!reply?.ok)throw Error(reply?.error || 'Armazenamento não confirmou a operação.');return true;
    }
    const apply=async()=>{
        if(op==='module'){const map=await read(STORAGE_KEY_MODULES);map[payload.id]=!!payload.value;localStorage.setItem(STORAGE_KEY_MODULES,JSON.stringify(map));}
        else if(op==='settings'){const map=await read(STORAGE_KEY_SETTINGS);map[payload.id]={...map[payload.id],...payload.value};localStorage.setItem(STORAGE_KEY_SETTINGS,JSON.stringify(map));}
        else for(const [key,value] of Object.entries(payload))localStorage.setItem(key,JSON.stringify(value));
        return true;
    };
    return navigator.locks ? navigator.locks.request('superproc-storage-v2',apply) : apply();
}
// Cada módulo liga e desliga sozinho (sem herança entre módulos): por padrão todos começam desligados.
const HERANCA_ATIVACAO = {};
async function lerMapaAtivacao() {
    const mapa = await read(STORAGE_KEY_MODULES);
    for (const [novo, origem] of Object.entries(HERANCA_ATIVACAO)) {
        if (mapa[novo] === undefined && mapa[origem] !== undefined) mapa[novo] = mapa[origem];
    }
    return mapa;
}
export const Storage = {
    getEnabledMap:()=>lerMapaAtivacao(),
    async isModuleEnabled(id,defaultVal=false){return (await this.getEnabledMap())[id] ?? defaultVal;},
    setModuleEnabled:(id,value)=>mutate('module',{id,value}),
    setAllModules:map=>mutate('set',{[STORAGE_KEY_MODULES]:map}),
    async getModuleSettings(id){return (await read(STORAGE_KEY_SETTINGS))[id] || {};},
    setModuleSettings:(id,value)=>mutate('settings',{id,value}),
    // Perfil = módulos ligados, configurações dos módulos, dados de tela (copiados das páginas do eproc) e automações.
    async exportProfile(){
        return {
            app: 'SuperPROC', marca: PERFIL_MARCA, formato: PERFIL_FORMATO, exportedAt: new Date().toISOString(),
            modulesEnabled: await read(STORAGE_KEY_MODULES), modulesSettings: await read(STORAGE_KEY_SETTINGS),
            localData: await read(STORAGE_KEY_LOCAL_DATA), automations: await read(STORAGE_KEY_AUTOMATIONS, [])
        };
    },
    // Valida (marca, formato, tipos e chaves) e grava; os dados de tela são aplicados nas páginas do eproc na próxima abertura.
    async importProfile(input){
        if (typeof input === 'string' && input.length > PERFIL_MAX_BYTES) throw Error('Arquivo grande demais para ser um perfil.');
        let p; try { p = typeof input === 'string' ? JSON.parse(input) : input; } catch { throw Error('Arquivo não é um perfil do SuperPROC Navegador.'); }
        if (!objetoSimples(p) || p.marca !== PERFIL_MARCA) throw Error('Arquivo não é um perfil do SuperPROC Navegador.');
        if (!Number.isInteger(p.formato) || p.formato < 1 || p.formato > PERFIL_FORMATO) throw Error('Perfil de uma versão não suportada.');
        const modulesEnabled = p.modulesEnabled ?? {}, modulesSettings = p.modulesSettings ?? {}, localData = p.localData ?? {}, automations = p.automations ?? [];
        if (!objetoSimples(modulesEnabled) || Object.entries(modulesEnabled).some(([id, on]) => !ID_VALIDO.test(id) || typeof on !== 'boolean')) throw Error('Perfil inválido: módulos.');
        if (!objetoSimples(modulesSettings) || Object.entries(modulesSettings).some(([id, v]) => !ID_VALIDO.test(id) || !objetoSimples(v))) throw Error('Perfil inválido: configurações.');
        if (!objetoSimples(localData)) throw Error('Perfil inválido: dados.');
        if (!Array.isArray(automations) || automations.length > 100) throw Error('Perfil inválido: automações.');
        const dados = Object.fromEntries(Object.entries(localData).filter(([key]) => RELEVANT_LOCAL_STORAGE_KEYS.includes(key)));
        const payload = {
            [STORAGE_KEY_MODULES]: modulesEnabled, [STORAGE_KEY_SETTINGS]: modulesSettings, [STORAGE_KEY_LOCAL_DATA]: dados,
            [STORAGE_KEY_AUTOMATIONS]: automations.map(validateAutomation),
            [STORAGE_KEY_IMPORT_STAMP]: crypto.randomUUID()
        };
        await mutate('set', payload);
        return true;
    },
    // Chamado pela página do eproc antes dos módulos: se há importação pendente para esta origem, grava os dados de tela.
    async applyPendingImport(){
        const stamp = await read(STORAGE_KEY_IMPORT_STAMP, null);
        if (!stamp || localStorage.getItem(LOCAL_MARCA_APLICADO) === stamp) return false;
        const dados = await read(STORAGE_KEY_LOCAL_DATA);
        for (const key of RELEVANT_LOCAL_STORAGE_KEYS) if (key in dados) localStorage.setItem(key, typeof dados[key] === 'string' ? dados[key] : JSON.stringify(dados[key]));
        localStorage.setItem(LOCAL_MARCA_APLICADO, stamp);
        return true;
    },
    // Copia os dados de tela da página para o storage da extensão (é de onde o perfil é exportado).
    async syncFromPage(){
        const stamp = await read(STORAGE_KEY_IMPORT_STAMP, null);
        if (stamp && localStorage.getItem(LOCAL_MARCA_APLICADO) !== stamp) return false; // página ainda não aplicou a importação
        const atual = { ...await read(STORAGE_KEY_LOCAL_DATA) };
        let mudou = false;
        for (const key of RELEVANT_LOCAL_STORAGE_KEYS) {
            const bruto = localStorage.getItem(key);
            if (bruto === null) continue;
            let valor; try { valor = JSON.parse(bruto); } catch { valor = bruto; }
            if (JSON.stringify(atual[key]) !== JSON.stringify(valor)) { atual[key] = valor; mudou = true; }
        }
        if (mudou) await mutate('set', { [STORAGE_KEY_LOCAL_DATA]: atual });
        return mudou;
    }
};
