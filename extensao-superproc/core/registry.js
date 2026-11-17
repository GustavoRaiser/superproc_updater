/**
 * SuperPROC - Catálogo Central de Módulos (Registry Pattern)
 * 
 * Cada funcionalidade da extensão é registrada aqui.
 * O Popup e o Orquestrador consultam este registro para descobrir
 * automaticamente novos módulos, sem necessidade de alterar o HTML do menu.
 */

export const CATEGORIAS = {
    GERAL: 'Ajustes Gerais',
    CAPA: 'Capa do Processo',
    PAINEL: 'Painel & Menus',
    EDITOR: 'Editor de Minutas',
    ARVORE: 'Árvore de Eventos',
    EXTERNO: 'Páginas Externas',
    AUTOMACOES: 'Automações',
    OUTRAS: 'Outras'
};

/**
 * Definição dos módulos conhecidos. Todos vêm DESLIGADOS (defaultEnabled: false): o usuário decide quais ativar no popup.
 */
// Capas internas, inclusive as abertas por consulta/remessa entre graus.
export const ehCapaDoProcesso = (_url, params) =>
    ['processo_selecionar', 'processo_consultar', 'processo_detalhar'].includes(params.get('acao'));

const MODULES_REGISTRY = [
    {
        id: 'integracao_azflow',
        name: 'Integração com AZflow',
        category: CATEGORIAS.OUTRAS,
        description: 'Preserva o acesso ao menu Redesign AZ quando a interface do SuperPROC oculta sua posição original. Recarregue a página após alterar.',
        defaultEnabled: false,
        scriptPath: 'modules/outras/integracao_azflow.js',
        matches: (url, params) => url.pathname.includes('controlador.php') && params.get('acao') === 'processo_selecionar'
    },
    {
        id: 'automacoes_saneador',
        name: 'Automações em lote',
        category: CATEGORIAS.AUTOMACOES,
        description: 'Fluxos configuráveis de documentos, Copilot e minuta. Inclui o Saneador como exemplo; gerencie suas automações abaixo.',
        defaultEnabled: false,
        scriptPath: 'modules/automacoes/saneador_lote.js',
        matches: (url, params) => ['localizador_processos_lista', 'processo_selecionar'].includes(params.get('acao'))
    },
    // ==========================================
    // AJUSTES GERAIS (UNIVERSAL)
    // ==========================================
    {
        id: 'ajustes_gerais',
        name: 'Editor - Dados Rápidos',
        category: CATEGORIAS.EDITOR,
        description: 'Otimização e layout rápido do frame de dados da minuta (2 colunas, sem capa redundante, inteligente).',
        defaultEnabled: false,
        scriptPath: 'modules/geral/ajustes_gerais.js',
        matches: (url) => url.pathname.includes('controlador.php')
    },
    {
        id: 'geral_smart_localizadores',
        name: 'Smart - Localizadores (Grupos & Busca)',
        category: CATEGORIAS.GERAL,
        description: 'Organizador inteligente de localizadores com grupos personalizados, busca rápida e inclusão em bloco.',
        defaultEnabled: false,
        scriptPath: 'modules/geral/smart_localizadores.js',
        organizador: 'loc',
        matches: (url, params) => url.pathname.includes('controlador.php') && params.get('acao') !== 'processo_selecionar'
    },
    {
        id: 'geral_smart_eventos',
        name: 'Smart - Eventos (Grupos & Busca)',
        category: CATEGORIAS.GERAL,
        description: 'Gerenciador inteligente de eventos processuais com grupos personalizados, busca instantânea e aplicação automática no eProc.',
        defaultEnabled: false,
        scriptPath: 'modules/geral/smart_eventos.js',
        organizador: 'evt',
        matches: (url, params) => url.pathname.includes('controlador.php')
    },
    {
        id: 'geral_ajuste_listas',
        name: 'Ajuste Listas',
        category: CATEGORIAS.GERAL,
        description: 'Organiza a Lista de Processos por Localizador em 2 colunas funcionais, integrando o Smart Localizadores e Gerenciar Localizadores e ocultando barras redundantes.',
        defaultEnabled: false,
        scriptPath: 'modules/geral/ajuste_listas.js',
        matches: (url, params) => {
            const acao = params.get('acao') || '';
            // NUNCA executar na capa do processo (processo_selecionar)
            if (acao === 'processo_selecionar' || params.has('num_processo')) return false;
            return acao === 'localizador_processos_lista';
        }
    },
    // ==========================================
    // CAPA DO PROCESSO
    // ==========================================
    {
        id: 'capa_layout_minimalista',
        name: 'Capa - Layout Minimalista',
        category: CATEGORIAS.CAPA,
        description: 'Unifica a Classe da Ação e o Nº do Processo em linha única e condensa Protocolo, Competência, Juiz, Unidade e Colegiado no popover [ i ].',
        defaultEnabled: false,
        scriptPath: 'modules/capa/layout_minimalista.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_reajuste_localizadores',
        name: 'Capa - Reajuste Localizadores',
        category: CATEGORIAS.CAPA,
        description: 'Reposiciona o bloco de localizadores para a linha superior (junto ao Órgão Julgador, Juiz e Botões) e oculta a expressão "Localizador(es):" e o ícone de ajuda.',
        defaultEnabled: false,
        scriptPath: 'modules/capa/reajuste_localizadores.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_situacao_dias',
        name: 'Capa - Situação com Dias (sem "MOVIMENTO-")',
        category: CATEGORIAS.CAPA,
        description: 'Mostra a Situação do processo com os dias (lidos do histórico da situação, como o AZFLOW faz) e remove sempre o prefixo "MOVIMENTO-" do texto exibido.',
        defaultEnabled: false,
        compacto: { descricao: 'Mostra só os dias; ao passar o mouse o rótulo abre para a esquerda e, ao clicar, abre o histórico da situação.' },
        scriptPath: 'modules/capa/situacao_dias.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_audiencia_valor_causa',
        name: 'Capa - Audiência & Valor da Causa',
        category: CATEGORIAS.CAPA,
        description: 'Exibe a audiência designada, o valor da causa e o saldo de subcontas (execução fiscal) logo após os botões Lembretes/Minutas da capa.',
        defaultEnabled: false,
        scriptPath: 'modules/capa/audiencia_valor_causa.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_arrastar_localizadores',
        name: 'Capa - Arrastar Localizadores',
        category: CATEGORIAS.CAPA,
        description: 'Permite clicar e arrastar qualquer localizador para fora do container para removê-lo rapidamente do processo.',
        defaultEnabled: false,
        scriptPath: 'modules/capa/arrastar_localizadores.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_botoes_preferencias',
        name: 'Capa - Barra de Botões',
        category: CATEGORIAS.CAPA,
        description: 'Barra flutuante unificada com balões para Assuntos, Informações, Ações e Preferências.',
        defaultEnabled: false,
        compacto: { descricao: 'Esconde o texto e a seta dos botões da barra.' },
        scriptPath: 'modules/capa/botoes_preferencias.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_acoes_preferenciais',
        name: 'Capa - Ações Preferenciais',
        category: CATEGORIAS.CAPA,
        description: 'Sanfonas e tags para as ações preferenciais (Minutas, Movimentações, Intimações, Automatizações).',
        defaultEnabled: false,
        compacto: { descricao: 'Oculta o menu principal de preferências e coloca botões rápidos (Min./Mov./Int./Aut.) na capa.' },
        scriptPath: 'modules/capa/acoes_preferenciais.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_filtros_eventos',
        name: 'Capa - Filtros de Eventos',
        category: CATEGORIAS.CAPA,
        description: 'Filtros e pesquisa de eventos na legenda de Eventos, com filtragem instantânea. Adaptação de usabilidade do AZFLOW para evitar conflitos com o sistema do SuperPROC - créditos a Ricardo do Valle.',
        defaultEnabled: false,
        scriptPath: 'modules/capa/filtros_eventos.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_lembretes_minutas',
        name: 'Capa - Lembretes e Minutas',
        category: CATEGORIAS.CAPA,
        description: 'Detecção em tempo real de minutas e lembretes com cores dinâmicas e pré-visualização rápida.',
        defaultEnabled: false,
        compacto: { descricao: 'Mostra "Lembretes" e "Minutas" como dois quadrados.' },
        scriptPath: 'modules/capa/lembretes_minutas.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_relacionados',
        name: 'Capa - Processos Relacionados',
        category: CATEGORIAS.CAPA,
        description: 'Compacta os processos relacionados em um botão elegante na linha do cabeçalho com balão flutuante.',
        defaultEnabled: false,
        compacto: { descricao: 'Oculta o ícone de histórico do botão; o clique no botão abre o histórico (o balão abre e fecha só pelo hover).' },
        scriptPath: 'modules/capa/relacionados.js',
        matches: ehCapaDoProcesso
    },
    {
        id: 'capa_partes',
        name: 'Capa - Partes e Advogados',
        category: CATEGORIAS.CAPA,
        description: 'Exibição inteligente das partes, crachás de Justiça Gratuita, busca OAB e alerta de falecimento.',
        defaultEnabled: false,
        scriptPath: 'modules/capa/partes.js',
        matches: ehCapaDoProcesso
    },

    {
        id: 'painel_localizadores_lista',
        name: 'Localizadores - Navegação & Feito Rápido',
        category: CATEGORIAS.CAPA,
        description: 'Na capa do processo: navegação Anterior / Próximo pela lista de processos e botão Feito, que insere o localizador que você escolher abaixo.',
        defaultEnabled: false,
        scriptPath: 'modules/painel/localizadores_lista.js',
        compacto: { descricao: 'Reúne ◀ Lista (n/N) Feito ▶ em um único botão segmentado: cada parte mantém a sua função.' },
        feito: { descricao: 'A lista vem do Smart Localizadores: abra uma lista de processos no eproc para carregá-la. Vale para todas as unidades. Sem escolha, o botão Feito fica desativado.' },
        matches: (url, params) => url.pathname.includes('controlador.php')
    },

    // ==========================================
    // PAINEL & MENUS
    // ==========================================
    {
        id: 'painel_selecionar_minuta_agendamento',
        name: 'Selecionar minuta por agendamento',
        category: CATEGORIAS.PAINEL,
        description: 'Marca as minutas da página pelo texto do agendamento, com busca sem acentos e botão para desmarcar.',
        defaultEnabled: false,
        scriptPath: 'modules/painel/selecionar_minuta_agendamento.js',
        matches: (url, params) => url.pathname.includes('controlador.php') &&
                                  (params.get('acao') || '').startsWith('minuta_area_trabalho')
    },
    {
        id: 'painel_principal',
        name: 'Painel Principal - 2 Colunas & Ocultos',
        category: CATEGORIAS.PAINEL,
        description: 'Organiza a Secretaria em 2 colunas equilibradas, botão Atualizar Tudo, navegação na mesma aba e gaveta de ocultos.',
        defaultEnabled: false,
        scriptPath: 'modules/painel/painel_principal.js',
        matches: (url, params) => url.pathname.includes('controlador.php') && 
                                  (!params.get('acao') || params.get('acao') === 'principal' || params.get('acao').includes('painel'))
    },
    {
        id: 'painel_menu_lateral_locs',
        name: 'Meus Localizadores',
        category: CATEGORIAS.PAINEL,
        description: 'Painel flyout em 4 colunas sob o botão "Meus Localizadores" com drag-and-drop.',
        defaultEnabled: false,
        scriptPath: 'modules/painel/menu_lateral_locs.js',
        matches: (url, params) => url.pathname.includes('controlador.php')
    },
    {
        id: 'painel_localizadores_coloridos',
        name: 'Localizadores - Coloridos & Priorizados',
        category: CATEGORIAS.PAINEL,
        description: 'Colorização e ordenação por prioridade de localizadores na capa e tabelas. Clique com botão direito na pílula para personalizar.',
        defaultEnabled: false,
        scriptPath: 'modules/painel/localizadores_coloridos.js',
        matches: (url, params) => url.pathname.includes('controlador.php')
    },

    // ==========================================
    // EDITOR DE MINUTAS
    // ==========================================
    {
        id: 'editor_minutas_textos',
        name: 'Editor - Minutas & Textos Rápidos',
        category: CATEGORIAS.EDITOR,
        description: 'Gaveta split-screen lateral (50%) dentro do editor para consultar a Área de Trabalho Base e Textos Padrão lado a lado.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/minutas_textos.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_limpar_painel',
        name: 'Editor - Botões Visíveis',
        category: CATEGORIAS.EDITOR,
        description: 'Permite escolher os ícones que permanecem visíveis na barra do CKEditor.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/limpar_painel.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_status_hover',
        name: 'Editor - Status da Minuta por Hover',
        category: CATEGORIAS.EDITOR,
        description: 'Abre as opções do campo "Manter a minuta no status..." ao passar o mouse sobre ele.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/status_hover.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_arrumar_altura',
        name: 'Editor - Arrumar Altura',
        category: CATEGORIAS.EDITOR,
        description: 'Recupera o redimensionamento original por scrollHeight e o preenchimento vertical do editor.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/arrumar_altura.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_pdf',
        name: 'Editor - Gerador de PDF Formatado',
        category: CATEGORIAS.EDITOR,
        description: 'Botão PDF no editor para compilar instantaneamente o documento via pdfmake com layout oficial do TJSC.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/editor_pdf.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_texto',
        name: 'Editor - Botão Texto (edição rápida)',
        category: CATEGORIAS.EDITOR,
        description: 'Botão "Texto" na barra do editor, ao lado de PDF e IA, com formatação rápida, limpeza de parágrafos, caixa/tipografia e formatação de ementa na seleção. Com texto selecionado, um atalho (padrão Alt+Shift, configurável abaixo) abre o mesmo menu junto à seleção.',
        defaultEnabled: false,
        atalho: { rotulo: 'Atalho para abrir o menu na seleção', acorde: true },
        scriptPath: 'modules/editor/editor_texto.js',
        matches: (url, params) => params.get('acao') === 'minuta_editar'
    },
    {
        id: 'editor_escolhas_inline',
        name: 'Editor - Escolhas no Texto',
        category: CATEGORIAS.EDITOR,
        description: 'Mostra opções clicáveis para trechos como [autor|réu], substituindo apenas o trecho escolhido e preservando o desfazer.',
        defaultEnabled: false,
        scriptPath: 'modules/editor/escolhas_inline.js',
        matches: (url, params) => ['minuta_editar', 'minuta_cadastrar'].includes(params.get('acao'))
    },

    {
        id: 'editor_menu_eventos',
        name: 'Editor - Menu Rápido de Eventos',
        category: CATEGORIAS.EDITOR,
        description: 'Um atalho de teclado (à sua escolha) abre um menu em colunas com os eventos da árvore e insere o link "evento N" no texto, sem tirar as mãos do teclado. Setas ou WASD navegam; Enter escolhe.',
        defaultEnabled: false,
        atalho: { rotulo: 'Atalho para abrir o menu' },
        scriptPath: 'modules/editor/menu_eventos_rapido.js',
        matches: (url, params) => ['minuta_editar', 'arvore_documento_listar'].includes(params.get('acao'))
    },

    // ==========================================
    // ÁRVORE DE EVENTOS
    // ==========================================
    {
        id: 'arvore_colorida',
        name: 'Árvore - Colorida Dinâmica',
        category: CATEGORIAS.ARVORE,
        description: 'Coloração visual configurável de termos e documentos na árvore com painel de paleta e termos personalizados.',
        defaultEnabled: false,
        scriptPath: 'modules/arvore/arvore_colorida.js',
        matches: (url, params) => params.get('acao') === 'arvore_documento_listar' || params.get('acao') === 'processo_selecionar'
    },
    {
        id: 'arvore_evento_cor',
        name: 'Árvore - Cores no Evento Raiz',
        category: CATEGORIAS.ARVORE,
        description: 'Aplica a cor de origem (Polo Ativo, Passivo, MP, Despacho e Sentença) identificada pelo AZflow diretamente no nó/evento raiz da árvore.',
        defaultEnabled: false,
        scriptPath: 'modules/arvore/arvore_evento_cor.js',
        matches: (url, params) => params.get('acao') === 'arvore_documento_listar' || params.get('acao') === 'processo_selecionar'
    },
    {
        id: 'arvore_automarca',
        name: 'Árvore - AutoMarca (Filtro de Tempo)',
        category: CATEGORIAS.ARVORE,
        description: 'Botões "Tudo" e "2 Anos" para marcação em lote de peças principais e compactação do filtro nativo.',
        defaultEnabled: false,
        scriptPath: 'modules/arvore/arvore_automarca.js',
        matches: (url, params) => params.get('acao') === 'arvore_documento_listar'
    },
    {
        id: 'arvore_compacta',
        name: 'Árvore - Botões Compactos e Largura Memorizada',
        category: CATEGORIAS.ARVORE,
        description: 'Os botões em lote da árvore (marcar, desmarcar, impressão e download) ficam só com ícones, e a largura do painel da árvore que você ajustar é lembrada nas próximas vezes.',
        defaultEnabled: false,
        scriptPath: 'modules/arvore/arvore_compacta.js',
        matches: (url, params) => params.get('acao') === 'arvore_documento_listar'
    },
    {
        id: 'arvore_movimento_retificacao',
        name: 'Movimento - Retificação Automática',
        category: CATEGORIAS.GERAL,
        description: 'Identifica a situação do processo na capa e ajusta automaticamente para Retificação de Conclusão se necessário.',
        defaultEnabled: false,
        scriptPath: 'modules/arvore/movimento_retificacao.js',
        matches: (url, params) => params.get('acao') === 'processo_selecionar' || params.get('acao') === 'processo_movimento_consultar'
    },

    {
        id: 'externo_pesquisa_jurisprudencia',
        name: 'Externo - Pesquisa de Jurisprudência',
        category: CATEGORIAS.EXTERNO,
        description: 'Otimização da busca do TJSC: marca Ementa, expande Pesquisa Avançada e define 100 itens por página.',
        defaultEnabled: false,
        scriptPath: 'modules/externo/pesquisa_jurisprudencia.js',
        matches: (url) => url.hostname.includes('eprocwebcon.tjsc.jus.br')
    },
    {
        id: 'externo_reconhecer_login',
        name: 'Externo - Reconhecer login (SSO TJSC)',
        category: CATEGORIAS.EXTERNO,
        description: 'Na tela de login do SSO do TJSC, clica sozinho em "Continuar" quando o usuário já está identificado, sem precisar do clique manual ao reabrir o navegador.',
        defaultEnabled: true,
        scriptPath: 'modules/externo/reconhecer_login.js',
        matches: (url) => url.hostname === 'sso.tjsc.jus.br'
    },

];

// Módulos .js importados pelo usuário (arrastados no popup): arquivos em modules/usuario/ + indice.json, gravados pelo host.
// "matches" vem dos @match/@include do cabeçalho UserScript, se houver; sem eles, vale para todas as páginas da extensão.
function padraoParaRegex(padrao) {
    return new RegExp('^' + String(padrao).split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
}
export async function carregarModulosUsuario() {
    try {
        const resposta = await fetch(chrome.runtime.getURL('modules/usuario/indice.json'), { cache: 'no-store' });
        if (!resposta.ok) return [];
        const lista = await resposta.json();
        if (!Array.isArray(lista)) return [];
        return lista.filter(u => u && /^usuario_[a-z0-9_]+$/.test(u.id) && typeof u.arquivo === 'string').map(u => {
            const regexes = (Array.isArray(u.matches) ? u.matches : []).map(padraoParaRegex);
            return {
                id: u.id,
                name: String(u.nome || u.id),
                category: Object.values(CATEGORIAS).includes(u.categoria) ? u.categoria : CATEGORIAS.OUTRAS,
                description: 'Módulo importado: ' + u.arquivo,
                defaultEnabled: true,
                scriptPath: 'modules/usuario/' + u.arquivo,
                usuario: true,
                matches: (url) => { const alvo = url.protocol + '//' + url.hostname + url.pathname + url.search; /* como nos match patterns: porta e hash não contam */ return !regexes.length || regexes.some(r => r.test(alvo)); }
            };
        });
    } catch (_) {
        return [];
    }
}

export const Registry = {
    getAllModules() {
        return [...MODULES_REGISTRY];
    },

    getModuleById(id) {
        return MODULES_REGISTRY.find(m => m.id === id);
    },

    getCategories() {
        return Object.values(CATEGORIAS);
    },

    getModulesByCategory(category) {
        return MODULES_REGISTRY.filter(m => m.category === category);
    },

    registerModule(moduleMeta) {
        if (!moduleMeta.id || !moduleMeta.name || !moduleMeta.scriptPath) {
            throw new Error('Módulo inválido: id, name e scriptPath são obrigatórios.');
        }
        const exists = MODULES_REGISTRY.some(m => m.id === moduleMeta.id);
        if (!exists) {
            MODULES_REGISTRY.push(moduleMeta);
        }
    }
};
