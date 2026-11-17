import { defaultAutomation, isAutomationExcluded } from '../../core/automations.js';
export const STAGES = [
    { id: 'preparacao', name: 'Preparação de Workflow', available: true },
    { id: 'pdf', name: 'Etapa 1 — Processo, árvore e impressão', available: true },
    { id: 'copilot', name: 'Etapa 2 — Copilot, envio e resposta limpa', available: true },
    { id: 'minuta', name: 'Etapa 3 — Minuta, bloqueio e próximo processo', available: true }
];
export function makeBatch(items, { sourceUrl, name, unit, origin, config = defaultAutomation(), now = Date.now() }) {
    return {
        version: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
        origin, unit, sourceUrl, name,
        config: structuredClone(config), agent: config.agent, preference: config.preference, targetLocator: config.targetLocator.name,
        prompt: `NUMERO DO PROCESSO - ${config.command}`,
        status: 'fila_pronta', currentId: null,
        checks: { lista: true, feitos: true, primeiro: false, carregamento: false },
        items: items.map(item => { const excluded = isAutomationExcluded(item, config); return { ...item, excluded, status: excluded ? item.feito ? 'ignorado_feito' : item.triagemsaneador ? 'ignorado_triagem' : 'ignorado_localizador' : 'pendente' }; }),
        log: [{ at: now, text: `Fila capturada: ${items.length} processos; ${items.filter(i => isAutomationExcluded(i, config)).length} ignorados pelos localizadores configurados.` }]
    };
}
export const firstPending = batch => batch.items.find(item => !isAutomationExcluded(item, batch.config || defaultAutomation()) && item.status === 'pendente');
export function markLoaded(batch, id, now = Date.now()) {
    if (id !== batch.currentId || !batch.items.some(item => item.id === id) || batch.checks.carregamento) return false;
    batch.checks.carregamento = true; batch.status = 'aguardando_conferencia'; batch.updatedAt = now;
    batch.log.push({ at: now, text: 'Capa do primeiro pendente carregada. Etapa 1 pronta para conferência.' });
    return true;
}

