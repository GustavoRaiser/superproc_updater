function automationOptions(config) {
    const value = config || { periodMonths: null, agent: 'TR003C - Saneador', mention: 'saneador', command: 'Executar saneamento dos autos.', preference: '5. Saneador' };
    if (![null, 60, 36, 24, 12, 6].includes(value.periodMonths)) throw new Error('Período de automação inválido.');
    for (const field of ['agent', 'mention', 'command', 'preference']) if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > (field === 'command' ? 5000 : 150)) throw new Error('Configuração de automação inválida.');
    if (!/^@?[\p{L}\p{N} _-]{1,100}$/u.test(value.mention)) throw new Error('Menção de agente inválida.');
    return { ...value, mention: value.mention.replace(/^@/, '') };
}
module.exports = { automationOptions };
