'use strict';

const POLITICAS = [
  ['EdgeEntraCopilotPageContext', 'Contexto do Copilot corporativo no painel do Edge'],
  ['CopilotCDPPageContext', 'Contexto com proteção de dados comerciais (obsoleta)'],
  ['CopilotPageContext', 'Contexto do Copilot sem proteção de dados empresariais'],
  ['EdgeCopilotEnabled', 'Disponibilidade do Copilot no Edge'],
  ['CopilotOnSensitiveContentEnabled', 'Contexto em conteúdo marcado como sensível'],
  ['Microsoft365CopilotChatIconEnabled', 'Ícone do Copilot Chat corporativo'],
  ['CopilotNewTabPageEnabled', 'Copilot na nova guia'],
  ['NewTabPageBingChatEnabled', 'Entradas do Bing Chat na nova guia'],
  ['NewTabPageHideDefaultTopSites', 'Ocultação dos sites padrão na nova guia'],
  ['HubsSidebarEnabled', 'Barra lateral do Edge'],
  ['TabServicesEnabled', 'Sugestões de agrupamento de abas']
];

const ORIGENS = new Map([['cloud', 'nuvem'], ['platform', 'plataforma']]);
const NIVEIS = new Map([['mandatory', 'obrigatória'], ['recommended', 'recomendada']]);
const ESCOPOS = new Map([['machine', 'dispositivo'], ['user', 'usuário']]);
const objeto = (valor) => valor && typeof valor === 'object' && !Array.isArray(valor);

function resumirPoliticasEdge(texto) {
  const exportacao = JSON.parse(texto.replace(/^\uFEFF/, ''));
  const grupo = exportacao?.policyGroups?.chrome?.policies;
  if (!objeto(grupo)) throw new Error('Exportação de políticas do Edge inválida.');

  return POLITICAS.map(([chave, descricao]) => {
    const prefixo = `${chave} — ${descricao}`;
    if (!Object.hasOwn(grupo, chave)) return `${prefixo}\nAusente na exportação`;

    const politica = grupo[chave];
    if (!objeto(politica)) return `${prefixo}\nEntrada com formato desconhecido`;
    const { value, source, level, scope } = politica;
    const valor = typeof value === 'boolean' ? String(value) : 'valor não booleano ou omitido';
    const metadados = [
      ORIGENS.get(source) || 'origem não reconhecida',
      ESCOPOS.get(scope) || 'escopo não reconhecido',
      NIVEIS.get(level) || 'nível não reconhecido'
    ];
    if (politica.error) metadados.push('erro informado pelo Edge');
    if (politica.warning) metadados.push('aviso informado pelo Edge');
    if (Array.isArray(politica.conflicts) && politica.conflicts.length) metadados.push('conflito informado pelo Edge');
    if (politica.ignored === true) metadados.push('ignorada pelo Edge');
    return `${prefixo}\n${valor} · ${metadados.join(' · ')}`;
  }).join('\n\n');
}

module.exports = { resumirPoliticasEdge };
