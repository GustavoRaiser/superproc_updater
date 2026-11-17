// Grupos de dois itens são uma única aba visual. Somente grupos unificados
// de três itens oferecem duas posições no ciclo: capa e editor.
function nextTabId(groups, currentId, backwards = false) {
  const stops = groups.flatMap(group => {
    const capa = group.find(t => t.processRole === 'capa');
    const editor = group.find(t => t.processRole === 'editor');
    if (group.length === 3 && group[0].groupId && capa && editor) return [capa, editor];
    return [group.find(t => t.id === currentId) || group.find(t => t.id === t.lastLeftTabId) || group[0]];
  });
  if (!stops.length) return null;
  let index = stops.findIndex(t => t.id === currentId);
  if (index < 0) {
    const group = groups.find(g => g.some(t => t.id === currentId));
    const selected = group?.find(t => t.id === t.lastLeftTabId) || group?.[0];
    index = stops.findIndex(t => t.id === selected?.id);
  }
  return stops[(Math.max(0, index) + (backwards ? -1 : 1) + stops.length) % stops.length].id;
}
module.exports = { nextTabId };
